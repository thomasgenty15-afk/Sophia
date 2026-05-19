import type {
  DefenseCardDraftGenerator,
  DefenseCardDraftGeneratorInput,
} from "./ai_intake.ts";
import type { DefenseCardSlotFiller } from "./slot_filler.ts";

export function structuredDefenseCardSlotFiller(
  statePatch: Record<string, unknown>,
  missingSlots: string[] = [],
): DefenseCardSlotFiller {
  return async () => ({
    current_step: missingSlots.includes("attachment")
      ? "attachment_intake"
      : missingSlots.includes("risk_situation") ||
          missingSlots.includes("trigger")
      ? "risk_intake"
      : missingSlots.includes("defense_goal")
      ? "response_design"
      : "draft_generation",
    state_patch: statePatch as any,
    missing_slots: missingSlots,
    confidence: "high",
    generated_user_message: typeof statePatch.generated_user_message ===
        "string"
      ? statePatch.generated_user_message
      : missingSlots.length
      ? "Quel moment précis tu veux protéger ?"
      : null,
    evidence: ["structured test filler"],
  });
}

export function readyDefenseCardStatePatch(options?: {
  planItemId?: string;
  title?: string;
  riskLabel?: string;
  triggerType?:
    | "temptation"
    | "impulse"
    | "emotional_drop"
    | "social_context"
    | "fatigue"
    | "stress"
    | "habit_loop"
    | "avoidance";
}) {
  return {
    tool_fit: {
      status: "defense",
      confidence: "high",
      evidence: ["structured fit"],
    },
    attachment: {
      status: "identified",
      kind: "plan_item",
      plan_item_id: options?.planItemId ?? "walk",
      title: options?.title ?? "marche",
      confidence: "high",
      evidence: ["structured attachment"],
    },
    risk_situation: {
      status: "identified",
      label: options?.riskLabel ?? "je rentre fatigue et je pars scroller",
      description: "moment de risque identifié",
      confidence: "high",
      evidence: ["structured risk"],
    },
    trigger: {
      status: "identified",
      type: options?.triggerType ?? "fatigue",
      confidence: 0.82,
      evidence: ["structured trigger"],
    },
    defense_goal: {
      status: "identified",
      value: "interrupt_impulse",
      confidence: "high",
      evidence: ["structured goal"],
    },
    defense_response_hint: {
      status: "identified",
      strategy_hint: "delay",
      value:
        "Je pose le telephone loin de moi et j'attends 10 minutes avant de decider.",
      confidence: "high",
      evidence: ["structured response"],
    },
  };
}

export const structuredDefenseCardDraftGenerator: DefenseCardDraftGenerator =
  async (input: DefenseCardDraftGeneratorInput) => {
    if (
      input.state.attachment.status !== "identified" ||
      input.state.risk_situation.status !== "identified" ||
      input.state.trigger.status !== "identified"
    ) {
      throw new Error("test_draft_missing_state");
    }
    const response = input.state.defense_response_hint.value ??
      "Je fais une pause de 10 minutes avant de choisir.";
    return {
      operation_type: "prepare_defense_card",
      output_schema: "defense_card_draft_v1",
      draft: {
        title: `Carte de défense - ${input.state.risk_situation.label}`,
        impulse_label: input.state.risk_situation.label ?? "moment fragile",
        target_label: input.state.attachment.title,
        situation: input.state.risk_situation.label ?? "",
        signal: input.state.risk_situation.description ??
          "Le signal concret qui fait craquer.",
        risk_situation: input.state.risk_situation.label ?? "",
        trigger: input.state.trigger.type ?? "impulse",
        defense_response: response,
        plan_b:
          "Si ca ne suffit pas, je reduis les degats et je reprends au prochain moment stable.",
        fallback_plan:
          "Si ca ne suffit pas, je reduis les degats et je reprends au prochain moment stable.",
        why_it_helps: "Elle prepare la reponse avant le moment de risque.",
        generic_defense: response,
      },
      confirmation_message:
        `Carte de défense proposée:\nLe moment: ${input.state.risk_situation.label}\nLe piege: ${
          input.state.risk_situation.description ??
            "Le signal concret qui fait craquer."
        }\nMon geste: ${response}\nPlan B: Si ca ne suffit pas, je reduis les degats et je reprends au prochain moment stable.\nJe la crée ?`,
      confirmation_actions: ["yes", "no"],
    };
  };
