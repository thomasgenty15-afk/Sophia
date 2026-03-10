import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { WeeklyReviewPayload } from "../../../trigger-weekly-bilan/payload.ts";
import { buildSuggestionQueue } from "./suggestions.ts";

function basePayload(): WeeklyReviewPayload {
  return {
    execution: {
      rate_pct: 0,
      total: 0,
      completed: 0,
      top_action: null,
      blocker_action: null,
      details: [],
    },
    etoile_polaire: null,
    action_load: {
      active_count: 1,
      verdict: "low",
      titles: [],
    },
    previous_recap: null,
    plan_window: {
      current_phase_index: 1,
      current_phase_title: "Phase 1",
      next_phase_index: 2,
      next_phase_title: "Phase 2",
      current_actions: [{
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
      }],
      next_actions: [],
      active_action_titles: [],
    },
    suggestion_state: {
      readiness: "hold",
      should_activate_next_phase: false,
      summary: "Test",
      suggestions: [{
        action_title: "Zone Sans Ecran Sacree",
        action_type: "mission",
        phase_scope: "current",
        recommendation: "activate",
        reason: "Mission a activer.",
        confidence: "high",
        related_action_title: null,
      }],
    },
    week_iso: "2026-W11",
    week_start: "2026-03-09",
  };
}

Deno.test("buildSuggestionQueue ignores activate for completed actions", () => {
  const queue = buildSuggestionQueue(basePayload());
  assertEquals(queue.length, 0);
});

Deno.test("buildSuggestionQueue ignores activate for deactivated actions", () => {
  const payload = basePayload();
  payload.plan_window.current_actions[0].db_status = "deactivated";
  payload.suggestion_state.suggestions[0].action_title = "Zone Sans Ecran Sacree";
  payload.suggestion_state.suggestions[0].recommendation = "activate";

  const queue = buildSuggestionQueue(payload);
  assertEquals(queue.length, 0);
});
