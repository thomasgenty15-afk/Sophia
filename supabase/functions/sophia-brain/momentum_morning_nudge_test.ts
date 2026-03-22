import { assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";

import { buildMomentumMorningPlan } from "./momentum_morning_nudge.ts";

function tempMemoryWithMomentum(state: string, overrides: Record<string, unknown> = {}) {
  return {
    __momentum_state_v1: {
      version: 1,
      current_state: state,
      dimensions: {
        engagement: { level: "high" },
        progression: { level: "up" },
        emotional_load: { level: state === "soutien_emotionnel" ? "high" : "low" },
        consent: { level: state === "pause_consentie" ? "closed" : "open" },
      },
      metrics: {
        completed_actions_7d: 2,
        missed_actions_7d: 1,
        partial_actions_7d: 0,
        emotional_high_72h: state === "soutien_emotionnel" ? 1 : 0,
        ...overrides,
      },
      blocker_memory: {
        actions: [],
      },
      signal_log: {
        emotional_turns: [],
        consent_events: [],
        response_quality_events: [],
      },
      stability: {},
      sources: {},
    },
  };
}

Deno.test("buildMomentumMorningPlan skips action nudge when pause is active", () => {
  const plan = buildMomentumMorningPlan({
    tempMemory: tempMemoryWithMomentum("pause_consentie"),
    payload: {
      today_item_titles: ["Marcher 10 min"],
      active_item_titles: ["Marcher 10 min"],
    },
  });

  assertEquals(plan.decision, "skip");
  assertEquals(plan.reason, "momentum_morning_nudge_pause_consentie");
});

Deno.test("buildMomentumMorningPlan turns into soft support for emotional state", () => {
  const plan = buildMomentumMorningPlan({
    tempMemory: tempMemoryWithMomentum("soutien_emotionnel"),
    payload: {
      today_item_titles: ["Marcher 10 min"],
      active_item_titles: ["Marcher 10 min"],
    },
  });

  assertEquals(plan.decision, "send");
  assertEquals(plan.strategy, "support_softly");
  assertStringIncludes(String(plan.instruction ?? ""), "PAS dans un nudge d'actions");
});

Deno.test("buildMomentumMorningPlan adapts friction to a known blocker on today's action", () => {
  const tempMemory = tempMemoryWithMomentum("friction_legere", {
    completed_actions_7d: 0,
    missed_actions_7d: 3,
    partial_actions_7d: 1,
  });
  (tempMemory.__momentum_state_v1 as any).blocker_memory.actions = [
    {
      action_key: "marcher-10",
      action_title: "Marcher 10 min",
      current_category: "energy",
      first_seen_at: "2026-03-17T08:00:00.000Z",
      last_seen_at: "2026-03-19T08:00:00.000Z",
      status: "active",
      stage: "recurrent",
      mention_count_total: 2,
      mention_count_21d: 2,
      history: [],
    },
  ];

  const plan = buildMomentumMorningPlan({
    tempMemory,
    payload: {
      today_item_titles: ["Marcher 10 min", "Hydratation"],
      active_item_titles: ["Marcher 10 min", "Hydratation"],
    },
  });

  assertEquals(plan.decision, "send");
  assertEquals(plan.strategy, "simplify_today");
  assertMatch(String(plan.reason ?? ""), /momentum_morning_nudge_simplify/);
  assertMatch(String(plan.fallback_text ?? ""), /version .*simple|version tres faisable/i);
  assertStringIncludes(String(plan.event_grounding ?? ""), "strategy=simplify_today");
});
