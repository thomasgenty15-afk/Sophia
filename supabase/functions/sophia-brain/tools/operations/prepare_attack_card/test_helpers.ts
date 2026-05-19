import type {
  AttackCardDraftGenerator,
  AttackCardDraftGeneratorInput,
} from "./ai_intake.ts";
import type { AttackCardSlotFiller } from "./slot_filler.ts";

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
  return {
    target: {
      status: "identified",
      kind: "plan_item",
      plan_item_id: options?.planItemId ?? "walk",
      title: options?.title ?? "marche",
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
  };
}

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
      confirmation_message: "Je crée cette carte ?",
      confirmation_actions: ["yes", "no"],
    };
  };
