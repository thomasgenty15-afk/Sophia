import { assertEquals, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type {
  WeeklyBlockerState,
  WeeklyPlanActionSnapshot,
  WeeklySuggestionDecision,
  WeeklySuggestionState,
} from "./payload.ts";
import {
  applyBlockerPolicyToSuggestionState,
  buildWeeklyCoachingInterventionState,
  buildWeeklyBlockerState,
  normalizeSuggestionDecisionsForPlan,
} from "./payload.ts";
import { writeMomentumState } from "../sophia-brain/momentum_state.ts";

Deno.test("normalizeSuggestionDecisionsForPlan downgrades activate for completed actions", () => {
  const suggestions: WeeklySuggestionDecision[] = [{
    action_title: "Zone Sans Ecran Sacree",
    action_type: "mission",
    phase_scope: "current",
    recommendation: "activate",
    reason: "Mission fondamentale a activer.",
    confidence: "high",
    related_action_title: null,
  }];

  const snapshots: WeeklyPlanActionSnapshot[] = [{
    plan_action_id: "p1a1",
    title: "Zone Sans Ecran Sacree",
    type: "mission",
    quest_type: "main",
    phase_index: 1,
    phase_title: "Phase 1",
    phase_status: "active",
    target_reps: 1,
    current_reps: 1,
    tracking_type: "boolean",
    time_of_day: "night",
    db_status: "completed",
    is_current_phase: true,
    is_next_phase: false,
    week_reps: 0,
    missed_count: 0,
  }];

  const normalized = normalizeSuggestionDecisionsForPlan(suggestions, snapshots);

  assertEquals(normalized[0]?.recommendation, "wait");
});

Deno.test("normalizeSuggestionDecisionsForPlan downgrades activate for deactivated actions", () => {
  const suggestions: WeeklySuggestionDecision[] = [{
    action_title: "Couvre-feu Digital Leger",
    action_type: "habitude",
    phase_scope: "current",
    recommendation: "activate",
    reason: "A reactiver.",
    confidence: "high",
    related_action_title: null,
  }];

  const snapshots: WeeklyPlanActionSnapshot[] = [{
    plan_action_id: "p1a2",
    title: "Couvre-feu Digital Leger",
    type: "habitude",
    quest_type: "side",
    phase_index: 1,
    phase_title: "Phase 1",
    phase_status: "active",
    target_reps: 3,
    current_reps: 1,
    tracking_type: "boolean",
    time_of_day: "night",
    db_status: "deactivated",
    is_current_phase: true,
    is_next_phase: false,
    week_reps: 0,
    missed_count: 0,
  }];

  const normalized = normalizeSuggestionDecisionsForPlan(suggestions, snapshots);

  assertEquals(normalized[0]?.recommendation, "wait");
});

Deno.test("buildWeeklyBlockerState exposes blocker memory summary from momentum temp memory", () => {
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
      active_blockers_count: 2,
      chronic_blockers_count: 1,
    },
    blocker_memory: {
      updated_at: "2026-03-19T10:00:00.000Z",
      actions: [{
        action_key: "sport",
        action_title: "Sport",
        current_category: "time",
        first_seen_at: "2026-03-10T10:00:00.000Z",
        last_seen_at: "2026-03-19T09:00:00.000Z",
        status: "active",
        stage: "chronic",
        mention_count_total: 4,
        mention_count_21d: 4,
        last_reason_excerpt: "Je manque de temps le soir",
        history: [
          {
            at: "2026-03-10T09:00:00.000Z",
            category: "time",
            source: "router",
            reason_excerpt: "Pas eu le temps",
            evidence_kind: "missed",
          },
          {
            at: "2026-03-14T09:00:00.000Z",
            category: "time",
            source: "watcher",
            reason_excerpt: "Encore trop serre niveau temps",
            evidence_kind: "note",
          },
          {
            at: "2026-03-17T09:00:00.000Z",
            category: "time",
            source: "router",
            reason_excerpt: "Toujours pas le temps le soir",
            evidence_kind: "missed",
          },
          {
            at: "2026-03-19T09:00:00.000Z",
            category: "time",
            source: "router",
            reason_excerpt: "Je manque de temps le soir",
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

  const blockerState = buildWeeklyBlockerState(tempMemory);

  assertEquals(blockerState.active_blockers_count, 2);
  assertEquals(blockerState.chronic_blockers_count, 1);
  assertEquals(blockerState.top_blocker_action, "Sport");
  assertEquals(blockerState.top_blocker_category, "time");
  assertEquals(blockerState.top_blocker_stage, "chronic");
  assertMatch(String(blockerState.blocker_summary ?? ""), /Sport/);
});

Deno.test("buildWeeklyCoachingInterventionState summarizes useful technique from temp memory", () => {
  const now = new Date().toISOString();
  const tempMemory = {
    __coaching_intervention_history: [{
      intervention_id: "coach_1",
      technique_id: "urge_delay",
      blocker_type: "craving_or_urge",
      outcome: "behavior_changed",
      helpful: true,
      last_used_at: now,
      status: "resolved",
      proposed_at: now,
      resolved_at: now,
      target_action_title: "Arret cigarette",
      selector_source: "fallback",
      outcome_reason: "heuristic_behavior_changed",
    }],
  };

  const coachingState = buildWeeklyCoachingInterventionState(tempMemory);

  assertEquals(coachingState.proposed_count_7d, 1);
  assertEquals(coachingState.helpful_count_7d, 1);
  assertEquals(coachingState.behavior_change_count_7d, 1);
  assertEquals(coachingState.top_helpful_technique, "urge_delay");
  assertEquals(coachingState.recommendation, "keep_best");
  assertMatch(String(coachingState.summary ?? ""), /urge_delay/);
});

function baseCurrentAction(): WeeklyPlanActionSnapshot {
  return {
    plan_action_id: "p1a1",
    title: "Sport",
    type: "habitude",
    quest_type: "main",
    phase_index: 1,
    phase_title: "Phase 1",
    phase_status: "active",
    target_reps: 3,
    current_reps: 1,
    tracking_type: "boolean",
    time_of_day: "night",
    db_status: "active",
    is_current_phase: true,
    is_next_phase: false,
    week_reps: 1,
    missed_count: 2,
  };
}

function nextAction(): WeeklyPlanActionSnapshot {
  return {
    plan_action_id: "p2a1",
    title: "Sport 45 min",
    type: "habitude",
    quest_type: "main",
    phase_index: 2,
    phase_title: "Phase 2",
    phase_status: "pending",
    target_reps: 3,
    current_reps: 0,
    tracking_type: "boolean",
    time_of_day: "night",
    db_status: "pending",
    is_current_phase: false,
    is_next_phase: true,
    week_reps: 0,
    missed_count: 0,
  };
}

Deno.test("applyBlockerPolicyToSuggestionState downgrades next activation when blocker is recurrent on current action", () => {
  const blockerState: WeeklyBlockerState = {
    active_blockers_count: 1,
    chronic_blockers_count: 0,
    top_blocker_action: "Sport",
    top_blocker_category: "time",
    top_blocker_stage: "recurrent",
    top_blocker_status: "active",
    blocker_summary: "Sport | categorie=time | stage=recurrent",
    blockers: [],
  };
  const state: WeeklySuggestionState = {
    readiness: "expand",
    should_activate_next_phase: true,
    summary: "La semaine permet d'ouvrir plus large.",
    suggestions: [{
      action_title: "Sport 45 min",
      action_type: "habitude",
      phase_scope: "next",
      recommendation: "activate",
      reason: "Bonne traction.",
      confidence: "medium",
      related_action_title: "Sport",
    }],
  };

  const next = applyBlockerPolicyToSuggestionState({
    suggestionState: state,
    blockerState,
    execution: {
      rate_pct: 65,
      total: 4,
      completed: 2,
      top_action: "Sport",
      blocker_action: "Sport",
      details: [],
    },
    currentActions: [baseCurrentAction()],
  });

  assertEquals(next.should_activate_next_phase, false);
  assertEquals(next.readiness, "steady");
  assertEquals(next.suggestions[0]?.recommendation, "wait");
});

Deno.test("applyBlockerPolicyToSuggestionState blocks swap-like expansion when blocker is chronic", () => {
  const blockerState: WeeklyBlockerState = {
    active_blockers_count: 1,
    chronic_blockers_count: 1,
    top_blocker_action: "Sport",
    top_blocker_category: "energy",
    top_blocker_stage: "chronic",
    top_blocker_status: "active",
    blocker_summary: "Sport | categorie=energy | stage=chronic",
    blockers: [],
  };
  const state: WeeklySuggestionState = {
    readiness: "expand",
    should_activate_next_phase: true,
    summary: "La semaine montre assez de traction.",
    suggestions: [
      {
        action_title: "Sport",
        action_type: "habitude",
        phase_scope: "current",
        recommendation: "deactivate",
        reason: "Remplacer par la version suivante.",
        confidence: "medium",
        related_action_title: "Sport 45 min",
      },
      {
        action_title: "Sport 45 min",
        action_type: "habitude",
        phase_scope: "next",
        recommendation: "activate",
        reason: "Passer au niveau suivant.",
        confidence: "medium",
        related_action_title: "Sport",
      },
    ],
  };

  const next = applyBlockerPolicyToSuggestionState({
    suggestionState: state,
    blockerState,
    execution: {
      rate_pct: 75,
      total: 4,
      completed: 3,
      top_action: "Sport",
      blocker_action: "Sport",
      details: [],
    },
    currentActions: [baseCurrentAction(), nextAction()],
  });

  assertEquals(next.should_activate_next_phase, false);
  assertEquals(next.suggestions[0]?.recommendation, "keep_active");
  assertEquals(next.suggestions[1]?.recommendation, "wait");
  assertMatch(next.summary, /Blocage chronic/i);
});
