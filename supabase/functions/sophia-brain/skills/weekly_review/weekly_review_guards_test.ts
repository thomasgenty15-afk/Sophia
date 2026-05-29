import {
  applyWeeklyConclusionGuard,
  applyWeeklyConcreteOrganizationGuard,
  applyWeeklyForgottenProgressAckGuard,
  applyWeeklyRepeatedClarificationGuard,
} from "./guards.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

const activeSkillState = {
  skill_id: "weekly_adaptive_review_v1",
  status: "open",
  weekly_adaptive_review: {},
};

Deno.test("forgotten_progress_ack_guard_preserved", () => {
  const rendered = applyWeeklyForgottenProgressAckGuard({
    responseContent: "On continue.",
    loggedMessageId: "m1",
    tempMemory: {
      __weekly_forgotten_progress: {
        mode: "logged",
        source_message_id: "m1",
        title: "Respiration de pause",
        count: 1,
      },
    },
  });
  assert(rendered.includes("C'est enregistré"));
});

Deno.test("repeated_clarification_guard_preserved", () => {
  const rendered = applyWeeklyRepeatedClarificationGuard({
    responseContent:
      "Tu confirmes juste: check-ins habitudes ou actions non faites ?",
    userMessage: "C'était un oubli de suivi.",
    activeSkillState,
    tempMemory: {},
  });
  assert(rendered.includes("oubli de suivi"));
});

Deno.test("concrete_organization_guard_preserved", () => {
  const rendered = applyWeeklyConcreteOrganizationGuard({
    responseContent: "Ok.",
    userMessage: "Refaire la même semaine à l'identique",
    activeSkillState,
    tempMemory: {},
  });
  assert(rendered.includes("refaire la même semaine"));
  assert(rendered.includes("Rien n'est appliqué"));
});

Deno.test("conclusion_guard_preserved", () => {
  const rendered = applyWeeklyConclusionGuard({
    responseContent: "On continue.",
    userMessage: "conclus le weekly",
    activeSkillState,
    tempMemory: {},
  });
  assertEquals(rendered.includes("Le point weekly est terminé"), true);
});
