import { assert } from "jsr:@std/assert@1";

import {
  ATTACK_TECHNIQUE_SYSTEM_PROMPT,
  buildAttackTechniqueUserPrompt,
} from "./lab-surfaces.ts";

Deno.test("ATTACK_TECHNIQUE_SYSTEM_PROMPT forbids duplicating planned level actions", () => {
  assert(
    ATTACK_TECHNIQUE_SYSTEM_PROMPT.includes("jamais le dupliquer"),
    "Missing duplication guardrail in attack technique prompt",
  );
  assert(
    ATTACK_TECHNIQUE_SYSTEM_PROMPT.includes("n'anticipe jamais une action deja planifiee plus tard"),
    "Missing anti-anticipation guardrail in attack technique prompt",
  );
});

Deno.test("buildAttackTechniqueUserPrompt includes sibling level actions as forbidden overlap context", () => {
  const prompt = buildAttackTechniqueUserPrompt({
    transformation_title: "Atteindre un poids de forme",
    user_summary: "Retrouver un rapport plus stable au sucre.",
    focus_context: "Poids, boissons sucrees, fatigue du soir.",
    questionnaire_answers: null,
    plan_strategy: {
      identity_shift: "Je simplifie mes soirees.",
      core_principle: "Petit pas visible.",
      success_definition: "Moins de sucre liquide",
      main_constraint: "Fatigue du soir",
    },
    classification: null,
    action_context: {
      phase_label: "Etape 1",
      item_title: "Boire de l'eau a la place du sucre",
      item_description: "Remplacer une boisson sucree par de l'eau ou du the.",
      item_kind: "habitude",
      time_of_day: "anytime",
      cadence_label: "3 jours",
      activation_hint: "Installer le bon geste quand la fatigue monte.",
      phase_items_summary: [
        "Mission: Nettoyer ton environnement direct — Retire ou cache les boissons sucrees.",
        "Clarification: Cartographier tes envies de sucre — Identifier quand l'envie frappe le plus fort.",
      ],
    },
    technique_key: "preparer_terrain",
    technique_title: "Preparer le terrain",
    technique_pour_quoi: "Installer les bonnes conditions avant la friction.",
    technique_objet_genere: "Un environnement qui facilite le bon geste.",
    technique_mode_emploi: "Prepare le terrain suffisamment tot.",
    user_answers: [
      "Action cible: boire de l'eau a la place du sucre",
      "Friction probable: j'oublie ou je craque quand je suis fatigue",
    ],
    adjustment_context: null,
  });

  assert(prompt.includes("Autres actions deja prevues dans ce niveau"));
  assert(prompt.includes("Mission: Nettoyer ton environnement direct"));
  assert(prompt.includes("Clarification: Cartographier tes envies de sucre"));
  assert(prompt.includes("Garde-fous anti-chevauchement"));
});
