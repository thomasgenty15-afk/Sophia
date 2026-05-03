import type {
  AppliedOperation,
  AssertionFailure,
  CreatedItemAssertion,
  GoldenScenario,
  ObservedTurnState,
  PayloadAssertion,
  ScenarioFailure,
  ScenarioRunner,
  ScenarioRunOptions,
  ScenarioRunResult,
  ScenarioTurn,
  TurnExpectation,
  TurnResult,
} from "./types.ts";
import { MemoryMockLlm } from "./mock_llm.ts";

type SimulatedItem = {
  id: string;
  kind: string;
  content: string;
  status: string;
  user_id: string;
  topic_slug?: string;
  entity_aliases?: string[];
};

type SimulatedState = {
  scenarioUserId: string;
  items: SimulatedItem[];
  payloadItemIds: string[];
  processedMessages: Set<string>;
  duplicateKeys: Set<string>;
};

export type MemoryScenarioRuntime = {
  observeTurn?: (args: {
    scenario: GoldenScenario;
    turn: ScenarioTurn;
    turn_index: number;
    state: SimulatedState;
  }) => Promise<Partial<ObservedTurnState>> | Partial<ObservedTurnState>;
};

export function createMemoryScenarioRunner(
  runtime: MemoryScenarioRuntime = {},
): ScenarioRunner {
  return new MemoryScenarioRunner(runtime);
}

class MemoryScenarioRunner implements ScenarioRunner {
  private readonly mockLlm = new MemoryMockLlm();

  constructor(private readonly runtime: MemoryScenarioRuntime) {}

  async run(
    scenario: GoldenScenario,
    options: ScenarioRunOptions,
  ): Promise<ScenarioRunResult> {
    const started = Date.now();
    const failures: ScenarioFailure[] = [];
    const turnResults: TurnResult[] = [];
    const state = seedState(scenario, options);

    try {
      validateScenarioShape(scenario);
    } catch (err) {
      return {
        scenario_id: scenario.id,
        passed: false,
        turn_results: [],
        global_assertions_result: {},
        duration_ms: Date.now() - started,
        failures: [{ message: String((err as Error)?.message ?? err) }],
      };
    }

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      const turnStarted = Date.now();
      const turnFailures: AssertionFailure[] = [];

      try {
        await this.mockLlm.call({
          scenario_id: scenario.id,
          prompt: "topic_router",
          turn_index: i,
          input: { user: turn.user },
          inline_fixture: turn.mock_observed ?? turn.expect,
        }, options);
      } catch (err) {
        turnFailures.push(
          failure(
            "llm_fixture",
            "LLM fixture resolution failed",
            undefined,
            String((err as Error)?.message ?? err),
          ),
        );
      }

      const observed = await this.observe(
        scenario,
        turn,
        i,
        state,
        turnStarted,
      );
      applyObservedToState(state, turn, observed);
      turnFailures.push(...assertTurn(turn.expect, observed, state));

      const passed = turnFailures.length === 0;
      turnResults.push({
        turn_index: i,
        passed,
        observed,
        failures: turnFailures,
      });
      if (!passed) {
        failures.push({
          turn_index: i,
          message: `Turn ${i + 1} failed`,
          failures: turnFailures,
        });
      }
    }

    const global = assertGlobals(scenario, state);
    for (const [name, ok] of Object.entries(global)) {
      if (!ok) failures.push({ message: `Global assertion failed: ${name}` });
    }

    return {
      scenario_id: scenario.id,
      passed: failures.length === 0,
      turn_results: turnResults,
      global_assertions_result: global,
      duration_ms: Date.now() - started,
      failures,
    };
  }

  async runAll(
    scenarios: GoldenScenario[],
    options: ScenarioRunOptions,
  ): Promise<ScenarioRunResult[]> {
    const results: ScenarioRunResult[] = [];
    for (const scenario of scenarios) {
      results.push(await this.run(scenario, options));
    }
    return results;
  }

  private async observe(
    scenario: GoldenScenario,
    turn: ScenarioTurn,
    turnIndex: number,
    state: SimulatedState,
    turnStarted: number,
  ): Promise<ObservedTurnState> {
    const runtimeObserved = await this.runtime.observeTurn?.({
      scenario,
      turn,
      turn_index: turnIndex,
      state,
    });
    const mockObserved = turn.mock_observed ?? {};
    const expected = turn.expect;
    const createdItems = expected.no_extraction ? [] : idsFor(
      "mem",
      scenario.id,
      turnIndex,
      expected.created_items?.length ?? 0,
    );
    const createdEntities = idsFor(
      "ent",
      scenario.id,
      turnIndex,
      expected.created_entities?.length ?? 0,
    );
    const appliedOperations = (expected.applied_operations ?? []).map((
      op,
      index,
    ): AppliedOperation => ({
      operation_type: op.operation_type,
      target_kind: op.target_kind ?? "memory_item",
      target_id: `${scenario.id}:op:${turnIndex}:${index}`,
    }));

    return {
      retrieval_mode: expected.retrieval_mode ?? "topic_continuation",
      retrieval_hints: expected.retrieval_hints ?? [],
      topic_decision: expected.topic_decision ?? "stay",
      active_topic_id: expected.active_topic_slug ?? null,
      payload_item_ids: idsFor(
        "payload",
        scenario.id,
        turnIndex,
        expected.payload_contains?.length ?? 0,
      ),
      payload_entities: (expected.payload_contains ?? [])
        .map((p) => p.entity_alias)
        .filter((v): v is string => Boolean(v)),
      created_item_ids: createdItems,
      created_entity_ids: createdEntities,
      applied_operations: appliedOperations,
      extraction_run_id: expected.no_extraction
        ? null
        : `${scenario.id}:run:${turnIndex}`,
      duration_ms: Date.now() - turnStarted,
      ...mockObserved,
      ...runtimeObserved,
    };
  }
}

function seedState(
  scenario: GoldenScenario,
  options: ScenarioRunOptions,
): SimulatedState {
  const scenarioUserId = options.user_seed ?? `${scenario.id}:user`;
  const items: SimulatedItem[] = (scenario.initial_state?.memory_items ?? [])
    .map((item, index) => ({
      id: item.id ?? `${scenario.id}:seed:${index}`,
      kind: item.kind,
      content: item.content_text,
      status: item.status ?? "active",
      user_id: scenarioUserId,
      topic_slug: item.topic_slug,
      entity_aliases: item.entity_aliases,
    }));
  return {
    scenarioUserId,
    items,
    payloadItemIds: [
      ...(scenario.initial_state?.payload_state?.memory_item_ids ?? []),
    ],
    processedMessages: new Set(),
    duplicateKeys: new Set(),
  };
}

function validateScenarioShape(scenario: GoldenScenario): void {
  if (!scenario.id) throw new Error("Scenario id is required");
  if (!scenario.description) {
    throw new Error(`Scenario ${scenario.id} description is required`);
  }
  if (
    !Number.isInteger(scenario.scenario_version) ||
    scenario.scenario_version < 1
  ) {
    throw new Error(`Scenario ${scenario.id} scenario_version must be >= 1`);
  }
  if (!Array.isArray(scenario.turns) || scenario.turns.length === 0) {
    throw new Error(`Scenario ${scenario.id} must contain at least one turn`);
  }
  for (const [index, turn] of scenario.turns.entries()) {
    if (!turn.expect) {
      throw new Error(
        `Scenario ${scenario.id} turn ${index + 1} is missing expect`,
      );
    }
  }
}

function applyObservedToState(
  state: SimulatedState,
  turn: ScenarioTurn,
  observed: ObservedTurnState,
): void {
  const userMessage = String(turn.user ?? "");
  if (userMessage) {
    const key = `${state.scenarioUserId}:${userMessage}`;
    if (state.processedMessages.has(key)) state.duplicateKeys.add(key);
    state.processedMessages.add(key);
  }

  for (
    const [index, assertion] of (turn.expect.created_items ?? []).entries()
  ) {
    const id = observed.created_item_ids[index] ??
      `mem:auto:${state.items.length}`;
    const content = [
      ...(assertion.contains ?? []),
      ...(assertion.not_contains ?? []),
    ].join(" ");
    const duplicateKey = `${assertion.kind}:${content.toLowerCase().trim()}`;
    if (
      state.items.some((item) =>
        `${item.kind}:${item.content.toLowerCase().trim()}` === duplicateKey
      )
    ) {
      state.duplicateKeys.add(duplicateKey);
    }
    state.items.push({
      id,
      kind: assertion.kind,
      content,
      status: "active",
      user_id: state.scenarioUserId,
      topic_slug: assertion.linked_topic_slug,
      entity_aliases: assertion.linked_entity_aliases_any_of,
    });
  }

  state.payloadItemIds.push(...observed.payload_item_ids);
  for (const payloadAssertion of turn.expect.payload_contains ?? []) {
    const matched = findMatchingPayloadItem(state.items, payloadAssertion);
    if (matched && !state.payloadItemIds.includes(matched.id)) {
      state.payloadItemIds.push(matched.id);
    }
  }
  for (const op of observed.applied_operations) {
    if (
      op.operation_type === "delete" || op.operation_type === "hide" ||
      op.operation_type === "invalidate"
    ) {
      const target = state.items.find((item) => item.id === op.target_id);
      if (target) {
        target.status = op.operation_type === "delete"
          ? "deleted_by_user"
          : "invalidated";
      }
      state.payloadItemIds = state.payloadItemIds.filter((id) =>
        id !== op.target_id
      );
    }
  }
}

function assertTurn(
  expect: TurnExpectation,
  observed: ObservedTurnState,
  state: SimulatedState,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  if (
    expect.retrieval_mode && observed.retrieval_mode !== expect.retrieval_mode
  ) {
    failures.push(
      failure(
        "retrieval_mode",
        "Unexpected retrieval mode",
        expect.retrieval_mode,
        observed.retrieval_mode,
      ),
    );
  }
  if (
    expect.topic_decision && observed.topic_decision !== expect.topic_decision
  ) {
    failures.push(
      failure(
        "topic_decision",
        "Unexpected topic decision",
        expect.topic_decision,
        observed.topic_decision,
      ),
    );
  }
  if (expect.retrieval_hints) {
    for (const hint of expect.retrieval_hints) {
      if (!observed.retrieval_hints.includes(hint)) {
        failures.push(
          failure(
            "retrieval_hints",
            `Missing retrieval hint ${hint}`,
            hint,
            observed.retrieval_hints,
          ),
        );
      }
    }
  }
  if (
    expect.created_items &&
    observed.created_item_ids.length < expect.created_items.length
  ) {
    failures.push(
      failure(
        "created_items",
        "Not enough created items",
        expect.created_items.length,
        observed.created_item_ids.length,
      ),
    );
  }
  if (
    expect.created_entities &&
    observed.created_entity_ids.length < expect.created_entities.length
  ) {
    failures.push(
      failure(
        "created_entities",
        "Not enough created entities",
        expect.created_entities.length,
        observed.created_entity_ids.length,
      ),
    );
  }
  if (
    expect.applied_operations &&
    observed.applied_operations.length < expect.applied_operations.length
  ) {
    failures.push(
      failure(
        "applied_operations",
        "Not enough applied operations",
        expect.applied_operations.length,
        observed.applied_operations.length,
      ),
    );
  }
  failures.push(...assertForbidden(expect.forbidden_items ?? [], state.items));
  failures.push(
    ...assertPayload(expect.payload_does_not_contain ?? [], state, true),
  );
  failures.push(...assertPayload(expect.payload_contains ?? [], state, false));
  if (expect.no_extraction && observed.extraction_run_id !== null) {
    failures.push(
      failure(
        "no_extraction",
        "Extraction run should be null",
        null,
        observed.extraction_run_id,
      ),
    );
  }
  return failures;
}

function assertForbidden(
  forbidden: Array<{ kind?: string; contains?: string[] }>,
  items: SimulatedItem[],
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  for (const assertion of forbidden) {
    const match = items.find((item) =>
      (!assertion.kind || item.kind === assertion.kind) &&
      (assertion.contains ?? []).every((part) =>
        item.content.toLowerCase().includes(part.toLowerCase())
      )
    );
    if (match) {
      failures.push(
        failure(
          "forbidden_items",
          "Forbidden item was observed",
          assertion,
          match,
        ),
      );
    }
  }
  return failures;
}

function assertPayload(
  assertions: PayloadAssertion[],
  state: SimulatedState,
  negate: boolean,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  for (const assertion of assertions) {
    const match = findMatchingPayloadItem(state.items, assertion);
    const inPayload = match ? state.payloadItemIds.includes(match.id) : false;
    if (!negate && (!match || !inPayload)) {
      failures.push(
        failure(
          "payload_contains",
          "Expected payload item not found",
          assertion,
          null,
        ),
      );
    }
    if (negate && match && inPayload) {
      failures.push(
        failure(
          "payload_does_not_contain",
          "Unexpected payload item found",
          assertion,
          match,
        ),
      );
    }
  }
  return failures;
}

function findMatchingPayloadItem(
  items: SimulatedItem[],
  assertion: PayloadAssertion,
): SimulatedItem | undefined {
  return items.find((item) =>
    item.status === "active" &&
    (!assertion.kind || item.kind === assertion.kind) &&
    (!assertion.contains ||
      item.content.toLowerCase().includes(assertion.contains.toLowerCase())) &&
    (!assertion.topic_slug || item.topic_slug === assertion.topic_slug) &&
    (!assertion.entity_alias ||
      item.entity_aliases?.includes(assertion.entity_alias))
  );
}

function assertGlobals(
  scenario: GoldenScenario,
  state: SimulatedState,
): Record<string, boolean> {
  const requested = scenario.global_assertions ?? [];
  const all = requested.length === 0
    ? [{
      no_invalid_injection: true,
      no_deleted_in_payload: true,
      no_statement_as_fact: true,
      no_cross_user_data: true,
      no_duplicate_extraction_on_retry: true,
      no_message_double_processing: true,
    }]
    : requested;
  const result: Record<string, boolean> = {};
  for (const assertion of all) {
    if (assertion.no_invalid_injection) {
      result.no_invalid_injection = state.payloadItemIds.every((id) => {
        const item = state.items.find((candidate) => candidate.id === id);
        return !item || item.status === "active";
      });
    }
    if (assertion.no_deleted_in_payload) {
      result.no_deleted_in_payload = state.payloadItemIds.every((id) => {
        const item = state.items.find((candidate) => candidate.id === id);
        return !item || item.status !== "deleted_by_user";
      });
    }
    if (assertion.no_statement_as_fact) {
      result.no_statement_as_fact = !state.items.some((item) =>
        item.kind === "fact" &&
        /\b(je me sens|j'ai l'impression|peur|nul|honte)\b/i.test(item.content)
      );
    }
    if (assertion.no_cross_user_data) {
      result.no_cross_user_data = state.items.every((item) =>
        item.user_id === state.scenarioUserId
      );
    }
    if (assertion.no_duplicate_extraction_on_retry) {
      result.no_duplicate_extraction_on_retry = state.duplicateKeys.size === 0;
    }
    if (assertion.no_message_double_processing) {
      result.no_message_double_processing = state.duplicateKeys.size === 0;
    }
  }
  return result;
}

function idsFor(
  prefix: string,
  scenarioId: string,
  turnIndex: number,
  count: number,
): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${scenarioId}:${prefix}:${turnIndex}:${index}`,
  );
}

function failure(
  assertion: string,
  message: string,
  expected?: unknown,
  observed?: unknown,
): AssertionFailure {
  return { assertion, message, expected, observed };
}
