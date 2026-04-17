import { assertEquals } from "jsr:@std/assert";

import { readMomentumStateV2, writeMomentumStateV2 } from "./momentum_state.ts";
import {
  decideMomentumProactive,
  summarizeMomentumProactiveDecision,
} from "./momentum_proactive_selector.ts";

function tempMemoryWithState(state: Parameters<typeof decideMomentumProactive>[0]["kind"], momentumState: string) {
  void state;
  const base = readMomentumStateV2({});
  return writeMomentumStateV2({}, {
    ...base,
    version: 2 as const,
    current_state: momentumState as any,
    dimensions: {
      ...base.dimensions,
      engagement: { level: "medium" as const },
      execution_traction: { level: "unknown" as const },
      emotional_load: { level: "low" as const },
      consent: { level: "open" as const },
    },
    _internal: base._internal,
  });
}

Deno.test("momentum_proactive_selector: missing state allows legacy fallback", () => {
  const decision = decideMomentumProactive({
    kind: "daily_bilan",
    tempMemory: {},
  });

  assertEquals(decision.decision, "allow");
  assertEquals(decision.reason, "momentum_policy_state_missing");
});

Deno.test("momentum_proactive_selector: daily bilan is blocked for friction_legere", () => {
  const decision = decideMomentumProactive({
    kind: "daily_bilan",
    tempMemory: tempMemoryWithState("daily_bilan", "friction_legere"),
  });

  assertEquals(decision.decision, "skip");
  assertEquals(decision.state, "friction_legere");
});

Deno.test("momentum_proactive_selector: weekly bilan remains allowed for friction_legere", () => {
  const decision = decideMomentumProactive({
    kind: "weekly_bilan",
    tempMemory: tempMemoryWithState("weekly_bilan", "friction_legere"),
  });

  assertEquals(decision.decision, "allow");
  assertEquals(decision.state, "friction_legere");
});

Deno.test("momentum_proactive_selector: pause_consentie blocks all bilans", () => {
  const daily = decideMomentumProactive({
    kind: "daily_bilan",
    tempMemory: tempMemoryWithState("daily_bilan", "pause_consentie"),
  });
  const weekly = decideMomentumProactive({
    kind: "weekly_bilan",
    tempMemory: tempMemoryWithState("weekly_bilan", "pause_consentie"),
  });

  assertEquals(daily.decision, "skip");
  assertEquals(weekly.decision, "skip");
  assertEquals(daily.reason.includes(":pause_consentie:"), true);
  assertEquals(weekly.reason.includes(":pause_consentie:"), true);
});

Deno.test("momentum_proactive_selector: summary exposes decision and policy", () => {
  const summary = summarizeMomentumProactiveDecision(
    decideMomentumProactive({
      kind: "weekly_bilan",
      tempMemory: tempMemoryWithState("weekly_bilan", "momentum"),
    }),
  );

  assertEquals(summary.kind, "weekly_bilan");
  assertEquals(summary.decision, "allow");
  assertEquals(summary.state, "momentum");
});
