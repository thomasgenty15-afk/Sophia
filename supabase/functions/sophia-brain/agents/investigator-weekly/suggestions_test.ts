import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildSuggestionQueue,
  describeSuggestionProposalForDashboard,
} from "./suggestions.ts";
import type { WeeklyReviewPayload } from "../../../trigger-weekly-bilan/payload.ts";
import type { WeeklySuggestionProposal } from "./types.ts";

Deno.test("buildSuggestionQueue phrases proposals as dashboard recommendations", () => {
  const payload = {
    plan_window: {
      current_actions: [
        { title: "Marcher 10 min", db_status: "active" },
      ],
      next_actions: [
        { title: "Marcher 20 min", db_status: "pending" },
      ],
      active_action_titles: ["Marcher 10 min"],
    },
    suggestion_state: {
      suggestions: [
        {
          recommendation: "activate",
          action_title: "Marcher 20 min",
          related_action_title: "Marcher 10 min",
          action_type: "habitude",
        },
        {
          recommendation: "deactivate",
          action_title: "Marcher 10 min",
          related_action_title: "Marcher 20 min",
          action_type: "habitude",
        },
      ],
    },
  } as unknown as WeeklyReviewPayload;

  const queue = buildSuggestionQueue(payload);

  assertEquals(queue.length, 1);
  assertStringIncludes(queue[0].prompt, "dashboard");
  assertStringIncludes(queue[0].prompt, "Tu veux qu'on retienne");
});

Deno.test("describeSuggestionProposalForDashboard keeps recommendation as dashboard-only action", () => {
  const proposal: WeeklySuggestionProposal = {
    id: "swap:1",
    recommendation: "swap",
    prompt: "",
    decisions: [
      {
        recommendation: "deactivate",
        action_title: "Marcher 10 min",
        related_action_title: "Marcher 20 min",
        action_type: "habitude",
      } as any,
      {
        recommendation: "activate",
        action_title: "Marcher 20 min",
        related_action_title: "Marcher 10 min",
        action_type: "habitude",
      } as any,
    ],
  };

  const described = describeSuggestionProposalForDashboard(proposal);

  assertStringIncludes(described.summary, "dashboard");
  assertStringIncludes(described.retained_changes[0], "dashboard");
  assertStringIncludes(described.decision_note, "dashboard");
});
