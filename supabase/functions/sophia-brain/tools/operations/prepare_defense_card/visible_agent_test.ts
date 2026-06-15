import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  prepareDefenseCardVisibleContractIssues,
  visibleSystemPrompt,
} from "./visible_agent.ts";

const input = {
  user_id: "user-1",
  stage: "ask_support_need",
  conversation_context: {
    known_values: {
      support_need: {
        locked_value: null,
        candidate_value: null,
      },
    },
    previous_values: {},
    revision: { is_revision: false },
    handoff_data: {},
  },
} as any;

Deno.test("prepare_defense_card visible prompt injects shared visible style rules", () => {
  const prompt = visibleSystemPrompt(input);

  assertStringIncludes(prompt, "VISIBLE_OUTPUT_STYLE_RULES");
  assertStringIncludes(prompt, "tutoiement");
  assertStringIncludes(prompt, "Format conversationnel");
});

Deno.test("prepare_defense_card visible contract does not block style wording by regex", () => {
  const issues = prepareDefenseCardVisibleContractIssues(
    "Ton rendez-vous peut rester le repère de la carte de défense.",
    input,
  );

  assertEquals(issues, []);
});

Deno.test("prepare_defense_card destination_short prompt forbids full handoff repetition", () => {
  const prompt = visibleSystemPrompt({
    ...input,
    stage: "destination_short",
  });

  assertStringIncludes(prompt, "1 à 2 phrases maximum");
  assertStringIncludes(prompt, "Ne répète pas le contexte de risque");
  assertStringIncludes(prompt, "ni tout le handoff");
});
