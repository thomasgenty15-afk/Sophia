import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { visibleContractIssues } from "./agent.ts";

const CLARTE_FIELD_LABEL =
  "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?" as const;
const CLARTE_FIELD_VALUE =
  "Je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.";

function clarteInput() {
  return {
    user_id: "u1",
    stage: "clarte_task" as const,
    visible_task: {
      kind: "clarte_task" as const,
      instruction:
        "Clarté / handoff pret: donne naturellement Potion de clarté, le chemin État / Potions, puis recopie verbatim la question plateforme exacte et la valeur exacte a saisir.",
      conversation_context: {
        state_summary: "Potion de clarté | tache visible=handoff_ready",
        user_words: [],
        field_or_stage: "plan_meaning_loss_reason",
        known_values: {
          plan_meaning_loss_reason: CLARTE_FIELD_VALUE,
        },
        missing_or_weak_values: [],
        selected_candidate: {
          potion_type: "clarte" as const,
          potion_name: "Potion de clarté",
        },
        handoff_data: {
          potion_name: "Potion de clarté",
          platform_destination: "section État / Potions",
          fields: [{
            field_id: "plan_meaning_loss_reason",
            field_label: CLARTE_FIELD_LABEL,
            status: "locked" as const,
            value: CLARTE_FIELD_VALUE,
            candidate_value: null,
            locked_value: CLARTE_FIELD_VALUE,
            option_value: null,
            option_label: null,
            needs_user_confirmation: false,
            detail_sufficiency: null,
          }],
        },
        tone_constraints: [],
        do_not_say: [],
        context_summary: null,
        evidence_used: [],
      },
    },
  };
}

Deno.test("visible agent guard accepts clarté handoff with required data", () => {
  const message = [
    "Oui, ça correspond à une Potion de clarté.",
    "Va dans État / Potions.",
    CLARTE_FIELD_LABEL,
    CLARTE_FIELD_VALUE,
  ].join("\n");

  assertEquals(visibleContractIssues(message, clarteInput()), []);
});

Deno.test("visible agent guard rejects legacy template and mutation claim", () => {
  const issues = visibleContractIssues(
    "Ce que je comprends : c'est activé, ta Potion de clarté est lancée.",
    clarteInput(),
  );

  assert(
    issues.some((issue) => issue.startsWith("forbidden_visible_template")),
  );
  assert(
    issues.some((issue) => issue.startsWith("forbidden_activation_claim")),
  );
});

Deno.test("visible agent guard rejects clarté handoff missing exact platform field", () => {
  const issues = visibleContractIssues(
    "Va dans État / Potions et choisis Potion de clarté.",
    clarteInput(),
  );

  assert(issues.includes("clarte_missing_field_label"));
  assert(issues.includes("clarte_missing_field_value"));
});
