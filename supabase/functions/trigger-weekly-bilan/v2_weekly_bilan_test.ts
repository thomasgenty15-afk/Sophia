import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/assert_string_includes.ts";

import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import type {
  ConversationPulse,
  MomentumStateV2,
  WeeklyConversationDigest,
} from "../_shared/v2-types.ts";
import { prepareWeeklyBilanV2Checkin } from "./v2_weekly_bilan.ts";

function baseMomentum(
  overrides: Partial<MomentumStateV2> = {},
): MomentumStateV2 {
  const base: MomentumStateV2 = {
    version: 2,
    current_state: "momentum",
    state_reason: "default",
    posture: {
      recommended_posture: "push_lightly",
      confidence: "high",
    },
    dimensions: {
      emotional_load: { level: "low", reason: "stable" },
      execution_traction: { level: "up", reason: "progress" },
      engagement: { level: "high", reason: "present" },
      consent: { level: "open", reason: "available" },
      plan_fit: { level: "good", reason: "aligned" },
      load_balance: { level: "balanced", reason: "manageable" },
    },
    blockers: {
      blocker_kind: null,
      blocker_repeat_score: 0,
    },
    assessment: {
      top_risk: null,
      top_blocker: null,
      confidence: "high",
    },
    active_load: {
      current_load_score: 2,
      mission_slots_used: 1,
      support_slots_used: 0,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    memory_links: {
      conversation_pulse_id: null,
      upcoming_event_id: null,
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    updated_at: "2026-03-24T10:00:00.000Z",
  };

  return {
    ...base,
    ...overrides,
    posture: {
      ...base.posture,
      ...(overrides.posture ?? {}),
    },
    dimensions: {
      ...base.dimensions,
      ...(overrides.dimensions ?? {}),
    },
    assessment: {
      ...base.assessment,
      ...(overrides.assessment ?? {}),
    },
    active_load: {
      ...base.active_load,
      ...(overrides.active_load ?? {}),
    },
  };
}

function entry(args: {
  planItemId: string;
  effectiveAt: string;
  entryKind: string;
  difficultyLevel?: "low" | "medium" | "high" | null;
}) {
  return {
    id: `${args.planItemId}:${args.effectiveAt}:${args.entryKind}`,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    plan_item_id: args.planItemId,
    entry_kind: args.entryKind,
    effective_at: args.effectiveAt,
    difficulty_level: args.difficultyLevel ?? null,
    created_at: args.effectiveAt,
    notes: null,
    value_text: null,
    value_number: null,
  } as any;
}

function planItem(args: {
  id: string;
  title: string;
  dimension?: "support" | "missions" | "habits";
  kind?: "framework" | "exercise" | "task" | "milestone" | "habit";
  status?:
    | "pending"
    | "active"
    | "in_maintenance"
    | "completed"
    | "deactivated"
    | "cancelled"
    | "stalled";
  targetReps?: number | null;
  recentEntries?: any[];
}): PlanItemRuntimeRow {
  return {
    id: args.id,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    dimension: args.dimension ?? "habits",
    kind: args.kind ?? "habit",
    title: args.title,
    description: null,
    status: args.status ?? "active",
    activation_order: 1,
    activation_condition: null,
    target_reps: args.targetReps ?? 5,
    current_reps: null,
    cadence_label: null,
    tracking_type: "boolean",
    support_mode: null,
    support_function: null,
    current_habit_state: null,
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    payload: {},
    created_at: "2026-03-01T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-01T08:00:00.000Z",
    completed_at: null,
    deactivated_at: null,
    cancelled_at: null,
    last_entry_at: args.recentEntries?.[0]?.effective_at ?? null,
    recent_entries: args.recentEntries ?? [],
  } as unknown as PlanItemRuntimeRow;
}

function pulse(overrides: Partial<ConversationPulse> = {}): ConversationPulse {
  return {
    version: 1,
    generated_at: "2026-03-24T10:00:00.000Z",
    window_days: 7,
    last_72h_weight: 0.7,
    tone: {
      dominant: "hopeful",
      emotional_load: "medium",
      relational_openness: "open",
    },
    trajectory: {
      direction: "up",
      confidence: "medium",
      summary: "ça repart doucement",
    },
    signals: {
      top_blocker: null,
      likely_need: "push",
      proactive_risk: "low",
      upcoming_event: null,
    },
    highlights: {
      wins: ["respiration", "marche"],
      friction_points: ["fatigue"],
      support_that_helped: ["respiration"],
      unresolved_tensions: ["sommeil"],
    },
    evidence_refs: {
      message_ids: [],
      event_ids: [],
    },
    ...overrides,
  } as ConversationPulse;
}

function digest(
  overrides: Partial<WeeklyConversationDigest> = {},
): WeeklyConversationDigest {
  return {
    version: 1,
    week_start: "2026-03-17",
    generated_at: "2026-03-24T10:00:00.000Z",
    dominant_tone: "fatigue mêlée de détermination",
    tone_evolution: "début stable, creux jeudi, reprise légère",
    best_traction_moments: ["Marche tenue malgré la fatigue"],
    closure_fatigue_moments: ["Décrochage jeudi soir"],
    most_real_blockage: "La fatigue du soir casse l'élan",
    support_that_helped: "Les rappels très courts",
    main_risk_next_week: "Retomber dans l'évitement si la charge remonte",
    relational_opportunity: "Répond mieux aux formulations très courtes",
    confidence: "medium",
    message_count: 8,
    active_days: 5,
    ...overrides,
  };
}

Deno.test("weekly V2: user motive -> expand", () => {
  const focusId = "11111111-1111-4111-8111-111111111111";
  const pendingId = "22222222-2222-4222-8222-222222222222";
  const prepared = prepareWeeklyBilanV2Checkin({
    planItemsRuntime: [
      planItem({
        id: focusId,
        title: "Marche quotidienne",
        recentEntries: [
          entry({
            planItemId: focusId,
            effectiveAt: "2026-03-23T08:00:00.000Z",
            entryKind: "checkin",
          }),
          entry({
            planItemId: focusId,
            effectiveAt: "2026-03-22T08:00:00.000Z",
            entryKind: "progress",
          }),
          entry({
            planItemId: focusId,
            effectiveAt: "2026-03-21T08:00:00.000Z",
            entryKind: "checkin",
          }),
        ],
      }),
      planItem({
        id: pendingId,
        title: "Rituel du soir",
        status: "pending",
        recentEntries: [],
      }),
    ],
    momentum: baseMomentum(),
    weekStart: "2026-03-23",
    llmResponseText: JSON.stringify({
      decision: "expand",
      reasoning: "La semaine est solide et il y a de la marge.",
      retained_wins: ["Marche quotidienne"],
      retained_blockers: [],
      load_adjustments: [
        {
          type: "activate",
          target_item_id: pendingId,
          reason: "On peut ouvrir un cran avec ce rituel.",
        },
      ],
      suggested_posture_next_week: "steady",
    }),
  });

  assertEquals(prepared.output.decision, "expand");
  assertStringIncludes(prepared.draftMessage, "Marche quotidienne");
  assertStringIncludes(prepared.draftMessage, "ouvrir un cran de plus");
  assertStringIncludes(prepared.draftMessage, "activer Rituel du soir");
});

Deno.test("weekly V2: friction -> consolidate", () => {
  const itemId = "33333333-3333-4333-8333-333333333333";
  const prepared = prepareWeeklyBilanV2Checkin({
    planItemsRuntime: [
      planItem({
        id: itemId,
        title: "Préparer les repas",
        dimension: "missions",
        kind: "task",
        recentEntries: [
          entry({
            planItemId: itemId,
            effectiveAt: "2026-03-23T18:00:00.000Z",
            entryKind: "blocker",
            difficultyLevel: "high",
          }),
          entry({
            planItemId: itemId,
            effectiveAt: "2026-03-21T18:00:00.000Z",
            entryKind: "partial",
          }),
        ],
      }),
    ],
    momentum: baseMomentum({
      current_state: "friction_legere",
      posture: {
        recommended_posture: "simplify",
        confidence: "medium",
      },
      dimensions: {
        emotional_load: { level: "medium", reason: "fatigue" },
        execution_traction: { level: "flat", reason: "mixte" },
        engagement: { level: "medium", reason: "fragile" },
        consent: { level: "open", reason: "ok" },
        plan_fit: { level: "uncertain", reason: "fragile" },
        load_balance: { level: "slightly_heavy", reason: "ça tire" },
      },
    }),
    weekStart: "2026-03-23",
    llmResponseText: JSON.stringify({
      decision: "consolidate",
      reasoning: "Ça avance mais ça reste fragile.",
      retained_wins: ["Préparer les repas"],
      retained_blockers: ["Préparer les repas"],
      load_adjustments: [
        {
          type: "maintenance",
          target_item_id: itemId,
          reason: "Stabiliser avant de recharger.",
        },
      ],
      suggested_posture_next_week: "lighter",
      coaching_note:
        "Tu n'as pas besoin d'en faire plus pour que ce soit une bonne semaine.",
    }),
  });

  assertEquals(prepared.output.decision, "consolidate");
  assertStringIncludes(prepared.draftMessage, "stabiliser");
  assertStringIncludes(
    prepared.draftMessage,
    "passer Préparer les repas en maintenance",
  );
  assertStringIncludes(prepared.draftMessage, "plus léger");
});

Deno.test("weekly V2: surcharge -> reduce", () => {
  const itemId = "44444444-4444-4444-8444-444444444444";
  const prepared = prepareWeeklyBilanV2Checkin({
    planItemsRuntime: [
      planItem({
        id: itemId,
        title: "Sport intense",
        recentEntries: [
          entry({
            planItemId: itemId,
            effectiveAt: "2026-03-23T07:00:00.000Z",
            entryKind: "blocker",
            difficultyLevel: "high",
          }),
          entry({
            planItemId: itemId,
            effectiveAt: "2026-03-22T07:00:00.000Z",
            entryKind: "blocker",
            difficultyLevel: "high",
          }),
        ],
      }),
    ],
    momentum: baseMomentum({
      current_state: "soutien_emotionnel",
      posture: {
        recommended_posture: "reduce_load",
        confidence: "high",
      },
      dimensions: {
        emotional_load: { level: "high", reason: "surcharge" },
        execution_traction: { level: "down", reason: "ça décroche" },
        engagement: { level: "low", reason: "fatigué" },
        consent: { level: "fragile", reason: "limite" },
        plan_fit: { level: "poor", reason: "trop" },
        load_balance: { level: "overloaded", reason: "trop lourd" },
      },
      assessment: {
        top_risk: "load",
        top_blocker: "épuisement",
        confidence: "high",
      },
    }),
    weekStart: "2026-03-23",
    llmResponseText: JSON.stringify({
      decision: "reduce",
      reasoning: "La charge est trop lourde pour cette semaine.",
      retained_wins: [],
      retained_blockers: ["Sport intense"],
      load_adjustments: [
        {
          type: "deactivate",
          target_item_id: itemId,
          reason: "Alléger le plan tout de suite.",
        },
      ],
      suggested_posture_next_week: "support_first",
    }),
  });

  assertEquals(prepared.output.decision, "reduce");
  assertStringIncludes(prepared.draftMessage, "on allège");
  assertStringIncludes(prepared.draftMessage, "désactiver Sport intense");
  assertStringIncludes(prepared.draftMessage, "soutien d'abord");
});

Deno.test("weekly V2: semaine vide -> hold", () => {
  const prepared = prepareWeeklyBilanV2Checkin({
    planItemsRuntime: [
      planItem({
        id: "55555555-5555-4555-8555-555555555555",
        title: "Lecture",
        recentEntries: [],
      }),
    ],
    momentum: baseMomentum({
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "flat", reason: "rien à signaler" },
      },
    }),
    weekStart: "2026-03-23",
    llmResponseText: JSON.stringify({
      decision: "hold",
      reasoning: "Il n'y a pas assez de signal pour bouger le plan.",
      retained_wins: [],
      retained_blockers: [],
      load_adjustments: [],
      suggested_posture_next_week: "steady",
    }),
  });

  assertEquals(prepared.output.decision, "hold");
  assertStringIncludes(prepared.draftMessage, "plus discrète");
  assertStringIncludes(prepared.draftMessage, "garde le cap");
  assertEquals(prepared.output.load_adjustments.length, 0);
});

Deno.test("weekly V2: reprise -> hold with reengage posture", () => {
  const prepared = prepareWeeklyBilanV2Checkin({
    planItemsRuntime: [
      planItem({
        id: "66666666-6666-4666-8666-666666666666",
        title: "Journal du matin",
        recentEntries: [
          entry({
            planItemId: "66666666-6666-4666-8666-666666666666",
            effectiveAt: "2026-03-20T07:00:00.000Z",
            entryKind: "partial",
          }),
        ],
      }),
    ],
    momentum: baseMomentum({
      current_state: "reactivation",
      posture: {
        recommended_posture: "reopen_door",
        confidence: "medium",
      },
    }),
    conversationPulse: pulse({
      signals: {
        top_blocker: null,
        likely_need: "silence",
        proactive_risk: "medium",
        upcoming_event: null,
      },
      trajectory: {
        direction: "flat",
        confidence: "medium",
        summary: "la reprise reste timide",
      },
    }),
    conversationPulseId: "pulse-1",
    weeklyDigest: digest(),
    weeklyDigestId: "digest-1",
    weekStart: "2026-03-23",
    llmResponseText: JSON.stringify({
      decision: "hold",
      reasoning:
        "Le sujet est de reprendre contact avec le plan sans pression.",
      retained_wins: ["Journal du matin"],
      retained_blockers: [],
      load_adjustments: [],
      suggested_posture_next_week: "reengage",
    }),
  });

  assertEquals(prepared.output.decision, "hold");
  assertEquals(prepared.messagePayload.week_start, "2026-03-23");
  assertEquals(prepared.messagePayload.conversation_pulse_id, "pulse-1");
  assertEquals(prepared.messagePayload.weekly_digest_id, "digest-1");
  assertEquals(
    prepared.input.weekly_digest?.relational_opportunity,
    "Répond mieux aux formulations très courtes",
  );
  assertStringIncludes(prepared.draftMessage, "rouvre la porte doucement");
});
