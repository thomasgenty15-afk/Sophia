import type {
  AttackCardDraftGenerator,
  AttackCardDraftGeneratorInput,
} from "./ai_intake.ts";
import type { AttackCardPlatformFieldFiller } from "./platform_field_filler.ts";
import type { AttackCardSlotFiller } from "./slot_filler.ts";
import type { AttackCardTechniqueKey } from "./contract.ts";
import {
  getAttackCardPlatformFieldDefinitions,
  normalizeAttackCardPlatformFieldState,
} from "./platform_fields.ts";

export function structuredAttackCardSlotFiller(
  statePatch: Record<string, unknown>,
  missingSlots: string[] = [],
): AttackCardSlotFiller {
  return async () => ({
    current_step: missingSlots.includes("target")
      ? "target_intake"
      : missingSlots.includes("technique")
      ? "technique_selection"
      : missingSlots.includes("activation_keyword")
      ? "keyword_intake"
      : "draft_generation",
    state_patch: statePatch as any,
    user_intent: "unknown",
    constraints: [],
    missing_slots: missingSlots,
    confidence: "high",
    generated_user_message: missingSlots.length
      ? "Quelle action exacte tu veux viser ?"
      : null,
    evidence: ["structured test filler"],
  });
}

export function readyAttackCardStatePatch(options?: {
  planItemId?: string;
  title?: string;
  technique?: "texte_recadrage" | "preparer_terrain" | "pre_engagement";
  activationKeyword?: string | null;
}) {
  const technique = options?.technique ?? "texte_recadrage";
  const target = options?.title ?? "marche";
  return {
    target: {
      status: "identified",
      kind: "plan_item",
      plan_item_id: options?.planItemId ?? "walk",
      title: target,
      confidence: "high",
      evidence: ["structured target"],
    },
    technique: {
      status: "identified",
      value: technique,
      confidence: "high",
      evidence: ["structured technique"],
    },
    activation_keyword: technique === "pre_engagement"
      ? {
        status: options?.activationKeyword ? "identified" : "missing",
        value: options?.activationKeyword ?? null,
        confidence: "high",
        evidence: ["structured keyword"],
      }
      : {
        status: "not_applicable",
        confidence: "high",
        evidence: ["not a pre-engagement technique"],
      },
    blocker: {
      type: technique === "preparer_terrain" ? "friction" : "avoidance",
      confidence: 0.8,
      evidence: ["structured blocker"],
    },
    platform_fields: readyAttackCardPlatformFields({
      technique,
      target,
      blocker: "structured blocker",
    }),
  };
}

export function readyAttackCardPlatformFields(options?: {
  technique?: AttackCardTechniqueKey;
  target?: string;
  blocker?: string;
}) {
  const technique = options?.technique ?? "texte_recadrage";
  const target = options?.target ?? "marche";
  const blocker = options?.blocker ?? "négociation intérieure";
  const valuesByTechnique: Record<AttackCardTechniqueKey, string[]> = {
    texte_recadrage: [
      target,
      blocker,
      "Revenir au premier geste sans négocier.",
    ],
    mantra_force: [target, `Protéger ${target}.`, "Calme et percutant."],
    ancre_visuelle: [
      `Garder vivant ${target}.`,
      "Sur un objet visible au moment de commencer.",
      "Je fais le premier geste.",
    ],
    visualisation_matinale: [
      target,
      "Le matin avant que la journée démarre.",
      `Me voir commencer malgré ${blocker}.`,
    ],
    preparer_terrain: [
      target,
      "Préparer le support avant le moment d'action.",
      "Le premier geste doit être visible et prêt.",
    ],
    pre_engagement: [
      blocker,
      `Protéger mon engagement envers ${target}.`,
    ],
  };
  const definitions = getAttackCardPlatformFieldDefinitions(technique);
  return normalizeAttackCardPlatformFieldState({
    technique_key: technique,
    fields: definitions.map((definition, index) => ({
      field_id: definition.field_id,
      technique_key: technique,
      question: definition.question,
      required: true,
      status: "locked",
      locked_value: valuesByTechnique[technique][index] ?? target,
      proposed_value: null,
      user_evidence: ["structured platform field"],
      needs_user_confirmation: false,
      evidence: ["structured platform field"],
    })),
  }, technique);
}

export const structuredAttackCardPlatformFieldFiller:
  AttackCardPlatformFieldFiller = async (input) => ({
    current_step: "handoff_ready",
    state_patch: {
      platform_fields: readyAttackCardPlatformFields({
        technique: input.technique_key,
        target: input.current_state.target.status === "identified"
          ? input.current_state.target.title
          : "action",
        blocker: input.current_state.blocker.evidence[0] ?? "piège",
      }),
      generated_user_message: null,
    },
    missing_slots: [],
    confidence: "high",
    generated_user_message: null,
    evidence: ["structured platform field filler"],
  });

export const structuredAttackCardDraftGenerator: AttackCardDraftGenerator =
  async (input: AttackCardDraftGeneratorInput) => {
    if (
      input.state.target.status !== "identified" ||
      !input.state.technique.value
    ) {
      throw new Error("test_draft_missing_state");
    }
    const technique = input.state.technique.value;
    const techniqueTitle = technique === "preparer_terrain"
      ? "Preparer le terrain"
      : technique === "pre_engagement"
      ? "Mot de bascule"
      : "Le texte magique";
    return {
      operation_type: "prepare_attack_card",
      output_schema: "attack_card_draft_v1",
      draft: {
        title: `Carte d'attaque - ${input.state.target.title}`,
        target_label: input.state.target.title,
        technique,
        technique_title: techniqueTitle,
        instruction: "Utilise cette carte puis fais le premier geste.",
        generated_asset: technique === "pre_engagement"
          ? `Mot-cle: ${input.state.activation_keyword.value}. Sophia reprend le contexte quand tu l'envoies.`
          : "Quand je commence à négocier, je reviens au premier geste minuscule.",
        activation_keyword: technique === "pre_engagement"
          ? input.state.activation_keyword.value ?? null
          : null,
        supporting_points: [],
        mode_emploi: "Utilise-la au moment où la résistance monte.",
        why_it_helps: "Elle coupe le débat intérieur.",
      },
      confirmation_message:
        "Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes / Attaque de la plateforme.",
      confirmation_actions: ["yes", "no"],
    };
  };
