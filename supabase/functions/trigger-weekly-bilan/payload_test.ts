import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { WeeklyPlanActionSnapshot, WeeklySuggestionDecision } from "./payload.ts";
import { normalizeSuggestionDecisionsForPlan } from "./payload.ts";

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
