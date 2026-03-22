import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleWeeklyTurn } from "./turn.ts";
import type { WeeklyInvestigationState } from "./types.ts";

function buildState(): WeeklyInvestigationState {
  return {
    mode: "weekly_bilan",
    status: "reviewing",
    awaiting_start_consent: false,
    start_consent_clarify_count: 0,
    opening_context: null,
    weekly_phase: "action_load",
    weekly_payload: {
      week_start: "2026-03-16",
      execution: {},
      etoile_polaire: {},
      action_load: {},
      plan_window: {
        current_actions: [],
        next_actions: [],
        active_action_titles: [],
      },
      suggestion_state: {
        suggestions: [],
        summary: "",
        readiness: "steady",
        should_activate_next_phase: false,
      },
      blocker_state: {
        active_count: 0,
        chronic_count: 0,
        blocker_pressure: "none",
        top_blocker: null,
        recent_blockers: [],
        summary: "",
      },
    } as any,
    weekly_covered_topics: ["execution", "etoile_polaire", "action_load"],
    weekly_stagnation_count: 0,
    weekly_recap_draft: { decisions_next_week: [] },
    weekly_suggestion_queue: [],
    weekly_pending_suggestion: {
      id: "activate:focus",
      recommendation: "activate",
      prompt: `Vu ta semaine, je te proposerais d'activer "Focus". Si ça te va, tu pourras l'ajuster dans le dashboard. Tu veux qu'on retienne ça ?`,
      decisions: [
        {
          recommendation: "activate",
          action_title: "Focus",
          action_type: "habitude",
        } as any,
      ],
    },
    weekly_suggestion_outcomes: [],
    turn_count: 2,
    started_at: "2026-03-19T08:00:00.000Z",
    updated_at: "2026-03-19T08:00:00.000Z",
  };
}

Deno.test("handleWeeklyTurn accepts suggestion without mutating plan in chat", async () => {
  const previousMega = Deno.env.get("MEGA_TEST_MODE");
  Deno.env.set("MEGA_TEST_MODE", "1");

  const touchedTables: string[] = [];
  const supabase = {
    from(table: string) {
      touchedTables.push(table);
      return {
        insert: async () => ({ error: null }),
      };
    },
  } as any;

  try {
    const result = await handleWeeklyTurn({
      supabase,
      userId: "user-1",
      message: "oui on retient ça",
      history: [],
      state: buildState(),
    });

    assertEquals(result.investigationComplete, false);
    assert(result.newState);
    assertEquals(result.newState?.weekly_suggestion_outcomes?.[0]?.outcome, "accepted");
    assertStringIncludes(
      result.newState?.weekly_recap_draft.decisions_next_week?.[0] ?? "",
      "dashboard",
    );
    assertEquals(touchedTables, ["weekly_bilan_suggestion_events"]);
    assertStringIncludes(result.content, "(weekly_bilan_suggestion_applied)");
  } finally {
    if (previousMega == null) Deno.env.delete("MEGA_TEST_MODE");
    else Deno.env.set("MEGA_TEST_MODE", previousMega);
  }
});
