import {
  assert,
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
  assertStringIncludes(prompt, "Format WhatsApp");
});

Deno.test("prepare_defense_card visible guard rejects vouvoiement", () => {
  const issues = prepareDefenseCardVisibleContractIssues(
    "Souhaitez-vous garder votre carte de défense ?",
    input,
  );

  assert(issues.includes("forbidden_vouvoiement:votre"));
  assert(issues.includes("forbidden_vouvoiement:souhaitez-vous"));
});
