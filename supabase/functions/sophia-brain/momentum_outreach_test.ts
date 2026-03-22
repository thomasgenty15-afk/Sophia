import { assertEquals, assertMatch } from "jsr:@std/assert";

import { writeMomentumState } from "./momentum_state.ts";
import {
  buildMomentumOutreachPlan,
  listMomentumOutreachEventContexts,
} from "./momentum_outreach.ts";

function tempMemoryWithState(state: string, metrics: Record<string, unknown> = {}) {
  return writeMomentumState({}, {
    version: 1 as const,
    current_state: state as any,
    dimensions: {
      engagement: { level: "medium" as const },
      progression: { level: "flat" as const },
      emotional_load: { level: state === "soutien_emotionnel" ? "high" as const : "low" as const },
      consent: { level: state === "evitement" ? "fragile" as const : "open" as const },
    },
    metrics,
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
  });
}

Deno.test("momentum_outreach: exposes all supported event contexts", () => {
  assertEquals(listMomentumOutreachEventContexts().sort(), [
    "momentum_evitement",
    "momentum_friction_legere",
    "momentum_reactivation",
    "momentum_soutien_emotionnel",
  ]);
});

Deno.test("momentum_outreach: friction plan diagnoses blocker without bilan framing", () => {
  const plan = buildMomentumOutreachPlan(tempMemoryWithState("friction_legere", {
    missed_actions_7d: 2,
    completed_actions_7d: 0,
  }));

  assertEquals(plan?.state, "friction_legere");
  assertEquals(plan?.event_context, "momentum_friction_legere");
  assertMatch(String(plan?.instruction ?? ""), /vrai frein concret/i);
});

Deno.test("momentum_outreach: friction plan reuses known blocker instead of asking from zero", () => {
  const tempMemory = writeMomentumState({}, {
    version: 1,
    current_state: "friction_legere",
    dimensions: {
      engagement: { level: "medium" },
      progression: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
    },
    metrics: {
      active_blockers_count: 1,
    },
    blocker_memory: {
      updated_at: "2026-03-19T10:00:00.000Z",
      actions: [{
        action_key: "sport",
        action_title: "Sport",
        current_category: "time",
        first_seen_at: "2026-03-17T10:00:00.000Z",
        last_seen_at: "2026-03-19T09:00:00.000Z",
        status: "active",
        stage: "recurrent",
        mention_count_total: 2,
        mention_count_21d: 2,
        last_reason_excerpt: "Je manque de temps le soir",
        history: [
          {
            at: "2026-03-17T10:00:00.000Z",
            category: "time",
            source: "router",
            reason_excerpt: "Je manque de temps le soir",
            evidence_kind: "missed",
          },
          {
            at: "2026-03-19T09:00:00.000Z",
            category: "time",
            source: "router",
            reason_excerpt: "Encore trop serré niveau temps",
            evidence_kind: "missed",
          },
        ],
      }],
    },
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
  });

  const plan = buildMomentumOutreachPlan(tempMemory);
  assertMatch(String(plan?.fallback_text ?? ""), /sport/i);
  assertMatch(String(plan?.instruction ?? ""), /reutilises le blocker deja connu/i);
});

Deno.test("momentum_outreach: chronic blocker stops circular questioning and prepares dashboard redirect", () => {
  const tempMemory = writeMomentumState({}, {
    version: 1,
    current_state: "friction_legere",
    dimensions: {
      engagement: { level: "medium" },
      progression: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
    },
    metrics: {
      active_blockers_count: 1,
      chronic_blockers_count: 1,
    },
    blocker_memory: {
      updated_at: "2026-03-19T10:00:00.000Z",
      actions: [{
        action_key: "routine du soir",
        action_title: "Routine du soir",
        current_category: "energy",
        first_seen_at: "2026-03-10T10:00:00.000Z",
        last_seen_at: "2026-03-19T09:00:00.000Z",
        status: "active",
        stage: "chronic",
        mention_count_total: 4,
        mention_count_21d: 4,
        last_reason_excerpt: "Je n'ai plus d'energie le soir",
        history: [
          {
            at: "2026-03-10T10:00:00.000Z",
            category: "energy",
            source: "router",
            reason_excerpt: "Je n'ai plus d'energie le soir",
            evidence_kind: "missed",
          },
          {
            at: "2026-03-13T10:00:00.000Z",
            category: "energy",
            source: "router",
            reason_excerpt: "Toujours trop fatigue",
            evidence_kind: "missed",
          },
          {
            at: "2026-03-16T10:00:00.000Z",
            category: "energy",
            source: "watcher",
            reason_excerpt: "Fatigue",
            evidence_kind: "note",
          },
          {
            at: "2026-03-19T09:00:00.000Z",
            category: "energy",
            source: "router",
            reason_excerpt: "Encore ko le soir",
            evidence_kind: "breakdown",
          },
        ],
      }],
    },
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
  });

  const plan = buildMomentumOutreachPlan(tempMemory);
  assertMatch(String(plan?.instruction ?? ""), /ne reposes pas la question du blocage/i);
  assertMatch(String(plan?.instruction ?? ""), /ne cree pas, ne modifie pas/i);
  assertMatch(String(plan?.fallback_text ?? ""), /dashboard/i);
});

Deno.test("momentum_outreach: soutien emotionnel plan removes accountability", () => {
  const plan = buildMomentumOutreachPlan(tempMemoryWithState("soutien_emotionnel", {
    emotional_high_72h: 2,
  }));

  assertEquals(plan?.state, "soutien_emotionnel");
  assertMatch(String(plan?.instruction ?? ""), /aucune accountability/i);
  assertMatch(String(plan?.fallback_text ?? ""), /pas besoin de performer/i);
});

Deno.test("momentum_outreach: pause_consentie does not produce outreach plan", () => {
  const plan = buildMomentumOutreachPlan(tempMemoryWithState("pause_consentie"));
  assertEquals(plan, null);
});
