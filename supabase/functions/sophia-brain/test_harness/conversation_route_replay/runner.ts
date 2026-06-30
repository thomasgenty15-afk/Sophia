import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../../routers/routers.ts";

export type ReplayFixture = {
  fixture_id: string;
  input: {
    safety_risk_band?: TurnFrame["safety"]["risk_band"];
    product_help?: boolean;
    coaching_recommendation?: boolean;
    active_skill_id?: string | null;
    direct_effects?: TurnFrame["direct_effects"];
    memory_response_intent?: TurnFrame["memory_plan"]["response_intent"];
  };
  expected: {
    response_owner: string;
    selected_handler?: string | null;
    direct_effects_to_run?: string[];
  };
};

export type ReplayResult = {
  fixture_id: string;
  passed: boolean;
  actual: {
    response_owner: string;
    selected_handler?: string | null;
    direct_effects_to_run: string[];
  };
  expected: ReplayFixture["expected"];
};

function turnFrame(fixture: ReplayFixture): TurnFrame {
  return {
    turn_id: fixture.fixture_id,
    source_message_id: `${fixture.fixture_id}.message`,
    user_id: "route-replay-user",
    channel: "web",
    safety: {
      risk_band: fixture.input.safety_risk_band ?? "none",
      reason_codes: [],
      evidence: [],
    },
    direct_effects: fixture.input.direct_effects ?? [],
    skill_signals: {
      product_help: fixture.input.product_help
        ? {
          detected: true,
          confidence_band: "high",
          reason: "fixture",
        }
        : undefined,
      coaching_recommendation: fixture.input.coaching_recommendation
        ? {
          detected: true,
          confidence_band: "high",
          reason: "fixture",
        }
        : undefined,
    },
    needs_research: { detected: false, value: false },
    memory_plan: {
      response_intent: fixture.input.memory_response_intent ?? "reflection",
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
}

export async function loadReplayFixtures(
  fixtureRoot: string,
): Promise<ReplayFixture[]> {
  const fixtures: ReplayFixture[] = [];
  const pending = [fixtureRoot];
  const paths: string[] = [];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) pending.push(path);
      if (entry.isFile && entry.name.endsWith(".json")) paths.push(path);
    }
  }
  for (const path of paths.sort()) {
    const parsed = JSON.parse(await Deno.readTextFile(path));
    const values = Array.isArray(parsed) ? parsed : [parsed];
    for (const value of values) fixtures.push(value as ReplayFixture);
  }
  return fixtures.sort((left, right) =>
    left.fixture_id.localeCompare(right.fixture_id)
  );
}

export async function runReplayFixtures(
  fixtures: ReplayFixture[],
  _options: { mode?: string } = {},
): Promise<ReplayResult[]> {
  return await Promise.all(fixtures.map(async (fixture) => {
    await Promise.resolve();
    const decision = runConversationRouters({
      turn_frame: turnFrame(fixture),
      active_skill_state: fixture.input.active_skill_id
        ? { skill_id: fixture.input.active_skill_id, status: "active" }
        : null,
      safety_context_risk_band: fixture.input.safety_risk_band ?? "none",
    });
    const actual = {
      response_owner: decision.response_owner,
      selected_handler: decision.selected_handler ?? null,
      direct_effects_to_run: decision.direct_effects_to_run,
    };
    const expected = fixture.expected;
    const passed = actual.response_owner === expected.response_owner &&
      (expected.selected_handler === undefined ||
        actual.selected_handler === expected.selected_handler) &&
      (expected.direct_effects_to_run === undefined ||
        JSON.stringify(actual.direct_effects_to_run) ===
          JSON.stringify(expected.direct_effects_to_run));
    return {
      fixture_id: fixture.fixture_id,
      passed,
      actual,
      expected,
    };
  }));
}

export function renderReplayMarkdown(results: ReplayResult[]): string {
  const passed = results.filter((result) => result.passed).length;
  const lines = [`Passed: ${passed}/${results.length}`];
  for (const result of results) {
    lines.push(
      `- ${
        result.passed ? "PASS" : "FAIL"
      } ${result.fixture_id}: ${result.actual.response_owner}`,
    );
  }
  return lines.join("\n");
}
