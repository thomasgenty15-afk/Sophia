import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  prepareAttackCardVisibleContractIssues,
  visibleSystemPrompt,
} from "./visible_agent.ts";

const input = {
  user_id: "user-1",
  stage: "ask_target",
  visible_task: {
    kind: "ask_target",
    conversation_context: {
      state_summary: "Cible manquante.",
      user_words: ["demain matin"],
      field_or_stage: "target",
      known_values: {},
      missing_or_weak_values: ["target"],
      selected_candidate: {},
      handoff_data: {},
      tone_constraints: [],
      do_not_say: [],
      context_summary: "Identifier la cible.",
      evidence_used: ["demain matin"],
    },
  },
} as any;

Deno.test("prepare_attack_card visible prompt injects shared visible style rules", () => {
  const prompt = visibleSystemPrompt(input);

  assertStringIncludes(prompt, "VISIBLE_OUTPUT_STYLE_RULES");
  assertStringIncludes(prompt, "tutoiement");
  assertStringIncludes(prompt, "Format conversationnel");
});

Deno.test("prepare_attack_card visible prompt asks to adapt raw user slots before speaking", () => {
  const prompt = visibleSystemPrompt(input);

  assertStringIncludes(prompt, "ne recopie pas betement les slots bruts");
  assertStringIncludes(prompt, "transforme les possessifs");
  assertStringIncludes(prompt, "ranger mes papiers demain matin");
  assertStringIncludes(prompt, "pour ton rangement de papiers demain matin");
  assertStringIncludes(prompt, "le piege du tri parfait");
});

Deno.test("prepare_attack_card visible contract does not block style wording by regex", () => {
  const issues = prepareAttackCardVisibleContractIssues(
    "Ton rendez-vous peut rester le repère de la carte.",
    input,
  );

  assertEquals(issues, []);
});
