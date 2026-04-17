import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildCoachingSnapshotsFromTrace,
  buildMiniRecapFromHandoff,
  buildQuestionnaireContextFromHandoff,
  extractConversationPulseHandoffSummary,
  extractQuestionnaireContextFromStoredHandoff,
  extractStoredTransformationHandoff,
  type StoredTransformationHandoff,
} from "./transformation_handoff.ts";
import type { HandoffPlanItemSnapshot, TransformationHandoffPayload } from "../_shared/v2-prompts/transformation-handoff.ts";
import type { CoachingTraceWindow } from "./lib/coaching_intervention_trace.ts";

const PLAN_ITEMS: HandoffPlanItemSnapshot[] = [
  {
    id: "support-1",
    title: "Respiration 2 minutes",
    dimension: "support",
    kind: "exercise",
    status: "active",
    current_habit_state: null,
    total_entries: 6,
    positive_entries: 5,
    blocker_entries: 0,
    skip_entries: 1,
    last_entry_at: "2026-03-20T08:00:00Z",
  },
  {
    id: "habit-1",
    title: "Marche du matin",
    dimension: "habits",
    kind: "habit",
    status: "in_maintenance",
    current_habit_state: "anchored",
    total_entries: 11,
    positive_entries: 10,
    blocker_entries: 0,
    skip_entries: 1,
    last_entry_at: "2026-03-20T08:00:00Z",
  },
];

const HANDOFF: TransformationHandoffPayload = {
  wins: ["Deux marches tenues malgré la fatigue"],
  supports_to_keep: ["support-1"],
  habits_in_maintenance: ["habit-1"],
  techniques_that_failed: ["micro_commitment"],
  relational_signals: ["Répond mieux aux messages courts"],
  coaching_memory_summary:
    "Le user avance davantage quand Sophia propose une seule action simple et concrète.",
};

function makeStored(): StoredTransformationHandoff {
  return {
    ...HANDOFF,
    generated_at: "2026-03-20T12:00:00Z",
    valid: true,
    violations: [],
    questionnaire_context: [
      "Supports déjà aidants à conserver: Respiration 2 minutes.",
    ],
    pulse_context: {
      transformation_id: "transfo-1",
      title: "Reprendre du souffle",
      completed_at: "2026-03-20T12:00:00Z",
      wins: HANDOFF.wins,
      relational_signals: HANDOFF.relational_signals,
      coaching_memory_summary: HANDOFF.coaching_memory_summary,
    },
    mini_recap: {
      next_transformation_title: "Remettre du rythme",
      recap_lines: ["Tu as posé des bases utiles."],
    },
  };
}

function makeTrace(): CoachingTraceWindow {
  return {
    user_id: "user-1",
    window: {
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-20T00:00:00Z",
      scope: null,
    },
    summary: {
      messages_total: 0,
      user_messages: 0,
      assistant_messages: 0,
      turns_total: 0,
      selector_runs_total: 0,
      interventions_total: 1,
      follow_ups_total: 1,
      weekly_surfaces_total: 0,
      observability_events_total: 0,
    },
    messages: [],
    turns: [],
    selector_runs: [],
    interventions: [
      {
        intervention_id: "coach-1",
        proposed_at: "2026-03-10T10:00:00Z",
        request_id: "req-1",
        turn_id: "turn-1",
        source_component: "router",
        trigger_type: "blocker",
        momentum_state: "friction_legere",
        blocker_type: "overwhelm",
        confidence: "medium",
        recommended_technique: "micro_commitment",
        candidate_techniques: ["micro_commitment"],
        follow_up_needed: true,
        follow_up_due_at: "2026-03-11T10:00:00Z",
        customization_context: null,
        proposal: {
          id: 1,
          at: "2026-03-10T10:00:00Z",
          event_name: "coaching_intervention_proposed",
          source_component: "router",
          request_id: "req-1",
          turn_id: "turn-1",
          payload: {},
        },
        render: null,
        follow_up: {
          id: 2,
          at: "2026-03-11T10:00:00Z",
          event_name: "coaching_followup_classified",
          source_component: "router",
          request_id: "req-1",
          turn_id: "turn-1",
          payload: { follow_up_outcome: "tried_not_helpful" },
        },
        events: [],
      },
    ],
    follow_ups: [],
    weekly_surfaces: [],
    unassigned_events: [],
  };
}

Deno.test("buildQuestionnaireContextFromHandoff derives consumer-friendly lines", () => {
  const context = buildQuestionnaireContextFromHandoff({
    handoff: HANDOFF,
    planItems: PLAN_ITEMS,
  });

  assertEquals(context.length, 6);
  assertEquals(
    context.some((line) => line.includes("Respiration 2 minutes")),
    true,
  );
  assertEquals(
    context.some((line) => line.includes("Marche du matin")),
    true,
  );
  assertEquals(
    context.some((line) => line.includes("micro_commitment")),
    true,
  );
});

Deno.test("buildMiniRecapFromHandoff bridges to next transformation", () => {
  const recap = buildMiniRecapFromHandoff({
    handoff: HANDOFF,
    planItems: PLAN_ITEMS,
    nextTransformationTitle: "Remettre du rythme",
  });

  assertEquals(recap.length >= 3, true);
  assertEquals(
    recap.some((line) => line.includes("Remettre du rythme")),
    true,
  );
});

Deno.test("buildCoachingSnapshotsFromTrace maps follow-up outcome", () => {
  const snapshots = buildCoachingSnapshotsFromTrace(makeTrace());

  assertEquals(snapshots, [
    {
      technique_key: "micro_commitment",
      created_at: "2026-03-10T10:00:00Z",
      outcome: "tried_not_helpful",
    },
  ]);
});

Deno.test("stored handoff extractors expose downstream summaries", () => {
  const payload = {
    onboarding_v2: {
      questionnaire_context: ["Contexte onboarding"],
    },
    transformation_handoff_v2: makeStored(),
  };

  const stored = extractStoredTransformationHandoff(payload);
  const questionnaireContext = extractQuestionnaireContextFromStoredHandoff(payload);
  const pulseSummary = extractConversationPulseHandoffSummary(payload);

  assertEquals(stored?.generated_at, "2026-03-20T12:00:00Z");
  assertEquals(questionnaireContext, [
    "Supports déjà aidants à conserver: Respiration 2 minutes.",
  ]);
  assertEquals(pulseSummary?.transformation_id, "transfo-1");
  assertEquals(pulseSummary?.wins, HANDOFF.wins);
});
