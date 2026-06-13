import type {
  ResponseOwner,
  RouteDecision,
} from "../../contracts/route_decision.v1.ts";
import type {
  ConversationChannel,
  RiskBand,
  TurnFrame,
} from "../../contracts/turn_frame.v1.ts";
import {
  initialSafetyContext,
  type SafetySignalContext,
} from "../../safety/safety_context.ts";
import { runDispatcher } from "../../dispatcher/dispatcher.v2.ts";
import { runConversationRouters } from "../../routers/routers.ts";

export type ReplayFixture = {
  fixture_id: string;
  description: string;
  input: {
    user_message: string;
    recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
    active_skill_state?: unknown;
    active_tool_skill_intake?: unknown;
    pending_tool_skill_confirmation?: unknown;
    memory_payload_fixture: unknown;
    plan_snapshot_fixture?: unknown;
  };
  expected: {
    safety_context_risk_band: RiskBand;
    response_owner: ResponseOwner;
    selected_handler?: string;
    blocked_paths_codes?: string[];
    direct_effects_to_run?: string[];
    memory_used_for_route?: boolean;
    operation_type_started?: string;
  };
};

export type ReplayActual = Partial<RouteDecision> & {
  safety_context_risk_band: RiskBand;
};

export type ReplayResult = {
  fixture_id: string;
  passed: boolean;
  diff: string[];
  actual: ReplayActual;
};

type DispatcherInput = {
  fixture: ReplayFixture;
  safety_context_output: SafetySignalContext;
};

type DispatcherRunner = (input: DispatcherInput) => Promise<TurnFrame>;
type ReplayRuntimeMode = "mock" | "s2";

function asChannel(value: unknown): ConversationChannel {
  return value === "web" ? "web" : "whatsapp";
}

function makeBaseTurnFrame(
  fixture: ReplayFixture,
  safety: SafetySignalContext,
): TurnFrame {
  const frame = {
    turn_id: `${fixture.fixture_id}:turn`,
    source_message_id: `${fixture.fixture_id}:message`,
    user_id: "route-replay-user",
    channel: asChannel((fixture.input.memory_payload_fixture as any)?.channel),
    safety: {
      risk_band: safety.risk_band,
      reason_codes: safety.reason_codes,
      evidence: safety.evidence,
    },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
  };
  return frame as unknown as TurnFrame;
}

export async function mockDispatcher(
  input: DispatcherInput,
): Promise<TurnFrame> {
  const turnFrame = makeBaseTurnFrame(
    input.fixture,
    input.safety_context_output,
  );
  const expected = input.fixture.expected;
  const message = input.fixture.input.user_message;

  if (expected.selected_handler) {
    turnFrame.skill_signals.entry = {
      [expected.selected_handler]: {
        detected: expected.response_owner === "conversation_handler" ||
          expected.response_owner === "product_help",
        confidence_band: "high",
        reason: `mock:${input.fixture.fixture_id}`,
      },
    };
  }

  for (const effectType of expected.direct_effects_to_run ?? []) {
    if (
      effectType === "create_one_shot_reminder" ||
      effectType === "track_progress_plan_item"
    ) {
      turnFrame.direct_effects.push({
        effect_type: effectType,
        explicitness: "explicit",
        target_status: input.fixture.fixture_id === "A7"
          ? "ambiguous"
          : "identified",
        confidence_band: "high",
        payload_hint: { fixture_id: input.fixture.fixture_id },
      });
    }
  }

  if (expected.operation_type_started) {
    turnFrame.tool_skill_intents.push({
      operation_type: expected.operation_type_started,
      explicitness: "explicit",
      target_hint: message,
      confidence_band: "high",
      ambiguity: input.fixture.fixture_id === "A7"
        ? "target_ambiguous"
        : "none",
      user_intent: expected.operation_type_started === "select_state_potion"
        ? "select"
        : "create",
    });
  }

  if (expected.response_owner === "product_help") {
    turnFrame.skill_signals.entry = {
      ...(turnFrame.skill_signals.entry ?? {}),
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: `mock:${input.fixture.fixture_id}`,
      },
    };
  }

  if (input.fixture.input.pending_tool_skill_confirmation) {
    const normalized = message.trim().toLowerCase();
    turnFrame.confirmation_response = {
      kind: normalized.startsWith("oui") || normalized === "ok" ? "yes" : "no",
      confidence_band: "high",
    };
  }

  if (expected.memory_used_for_route) {
    turnFrame.memory_plan = {
      ...turnFrame.memory_plan,
      memory_mode: "light",
      context_need: "targeted",
      context_budget_tier: "small",
      targets: [{
        type: "topic",
        key: "mock-memory-reference",
        query_hint: "mock-memory-reference",
        retrieval_policy: "semantic_first",
      }],
    };
  }

  return turnFrame;
}

function routeFromMockTurnFrame(
  fixture: ReplayFixture,
  turnFrame: TurnFrame,
): RouteDecision {
  const expected = fixture.expected;
  return {
    route_version: "v1",
    response_owner: expected.response_owner,
    selected_handler: expected.selected_handler ??
      expected.operation_type_started ??
      undefined,
    blocked_paths: (expected.blocked_paths_codes ?? []).map((reasonCode) => ({
      path: reasonCode.includes("memory") ? "memory" : "route",
      reason_code: reasonCode,
    })),
    direct_effects_to_run: expected.direct_effects_to_run ?? [],
    reason_code: `mock_route:${fixture.fixture_id}`,
    memory_used_for_route: Boolean(expected.memory_used_for_route),
    memory_item_ids_used_for_route: expected.memory_used_for_route
      ? ["mock-memory-item"]
      : [],
    memory_use_kind: expected.memory_used_for_route
      ? "target_resolution"
      : "none",
  };
}

function compareFixture(
  fixture: ReplayFixture,
  actual: ReplayActual,
): string[] {
  const diff: string[] = [];
  const expected = fixture.expected;
  const checks: Array<[string, unknown, unknown]> = [
    [
      "safety_context_risk_band",
      expected.safety_context_risk_band,
      actual.safety_context_risk_band,
    ],
    ["response_owner", expected.response_owner, actual.response_owner],
    ["selected_handler", expected.selected_handler, actual.selected_handler],
    [
      "memory_used_for_route",
      Boolean(expected.memory_used_for_route),
      Boolean(actual.memory_used_for_route),
    ],
  ];
  for (const [field, expectedValue, actualValue] of checks) {
    if (expectedValue !== actualValue) {
      diff.push(`${field}: expected ${expectedValue}, got ${actualValue}`);
    }
  }

  const expectedEffects = expected.direct_effects_to_run ?? [];
  const actualEffects = actual.direct_effects_to_run ?? [];
  if (JSON.stringify(expectedEffects) !== JSON.stringify(actualEffects)) {
    diff.push(
      `direct_effects_to_run: expected ${
        JSON.stringify(expectedEffects)
      }, got ${JSON.stringify(actualEffects)}`,
    );
  }

  const actualBlocked = (actual.blocked_paths ?? []).map((path) =>
    path.reason_code
  );
  const expectedBlocked = expected.blocked_paths_codes ?? [];
  if (JSON.stringify(expectedBlocked) !== JSON.stringify(actualBlocked)) {
    diff.push(
      `blocked_paths_codes: expected ${JSON.stringify(expectedBlocked)}, got ${
        JSON.stringify(actualBlocked)
      }`,
    );
  }
  return diff;
}

export async function runReplayFixture(
  fixture: ReplayFixture,
  opts: { dispatcher?: DispatcherRunner; mode?: ReplayRuntimeMode } = {},
): Promise<ReplayResult> {
  const safety = initialSafetyContext({ channel: "whatsapp" });
  const dispatcher = opts.dispatcher ?? mockDispatcher;
  const turnFrame = opts.mode === "s2"
    ? await runDispatcher({
      user_message: fixture.input.user_message,
      recent_messages: fixture.input.recent_messages,
      user_id: "route-replay-user",
      channel: "whatsapp",
      active_skill_state: fixture.input.active_skill_state,
      active_tool_skill_intake: fixture.input.active_tool_skill_intake,
      pending_tool_skill_confirmation:
        fixture.input.pending_tool_skill_confirmation,
      plan_snapshot: fixture.input.plan_snapshot_fixture ?? {},
      safety_context_output: safety,
      source_message_id: `${fixture.fixture_id}:message`,
      turn_id: `${fixture.fixture_id}:turn`,
    })
    : await dispatcher({
      fixture,
      safety_context_output: safety,
    });
  const routeDecision = opts.mode === "s2"
    ? runConversationRouters({
      turn_frame: turnFrame,
      active_skill_state: fixture.input.active_skill_state,
      active_tool_skill_intake: fixture.input.active_tool_skill_intake,
      pending_tool_skill_confirmation:
        fixture.input.pending_tool_skill_confirmation,
      safety_context_risk_band: safety.risk_band,
    })
    : routeFromMockTurnFrame(fixture, turnFrame);
  const actual: ReplayActual = {
    ...routeDecision,
    safety_context_risk_band: safety.risk_band,
  };
  const diff = compareFixture(fixture, actual);
  return {
    fixture_id: fixture.fixture_id,
    passed: diff.length === 0,
    diff,
    actual,
  };
}

export async function runReplayFixtures(
  fixtures: ReplayFixture[],
  opts: { mode?: ReplayRuntimeMode } = {},
): Promise<ReplayResult[]> {
  const results: ReplayResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runReplayFixture(fixture, opts));
  }
  return results;
}

async function collectJsonFiles(path: string): Promise<string[]> {
  const stat = await Deno.stat(path);
  if (stat.isFile) return path.endsWith(".json") ? [path] : [];
  const out: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    const child = `${path.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isDirectory) out.push(...await collectJsonFiles(child));
    else if (entry.isFile && entry.name.endsWith(".json")) out.push(child);
  }
  return out.sort();
}

export async function loadReplayFixtures(
  path: string,
): Promise<ReplayFixture[]> {
  const files = await collectJsonFiles(path);
  const fixtures: ReplayFixture[] = [];
  for (const file of files) {
    const parsed = JSON.parse(await Deno.readTextFile(file));
    if (Array.isArray(parsed)) fixtures.push(...parsed);
    else if (Array.isArray(parsed.fixtures)) fixtures.push(...parsed.fixtures);
    else fixtures.push(parsed);
  }
  return fixtures;
}

export function renderReplayMarkdown(results: ReplayResult[]): string {
  const passed = results.filter((result) => result.passed).length;
  const lines = [
    `# conversation_route_replay`,
    ``,
    `Passed: ${passed}/${results.length}`,
    ``,
  ];
  for (const result of results) {
    lines.push(`- ${result.passed ? "PASS" : "FAIL"} ${result.fixture_id}`);
    for (const diff of result.diff) lines.push(`  - ${diff}`);
  }
  return `${lines.join("\n")}\n`;
}
