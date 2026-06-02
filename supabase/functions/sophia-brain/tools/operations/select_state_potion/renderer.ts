import type {
  SelectStatePotionSkillResult,
  StatePotionHandoffDraft,
} from "./contract.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export function renderSelectStatePotionSkillResult(
  result: SelectStatePotionSkillResult,
): string {
  if (result.status === "executed" && result.committed_effects.length === 0) {
    return "Je n'ai pas de confirmation DB pour cette potion, donc je ne la marque pas comme activée.";
  }
  if (result.committed_effects.length === 0) {
    return renderNonCommittedReply(
      result.reply,
      result.status === "blocked"
        ? "Je ne peux pas activer cette potion dans cet état."
        : result.status === "cancelled"
        ? "Ok, je ne l'active pas."
        : "",
    );
  }
  return result.reply ?? "";
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function renderPlatformInputs(
  inputs: StatePotionHandoffDraft["recommendation"]["platform_inputs"],
): string[] {
  if (!inputs) return [];
  const lines = [
    "À mettre dans la plateforme :",
    `Potion : ${inputs.potion_title}`,
    ...inputs.answers
      .filter((answer) => answer.question_label.trim() && answer.value.trim())
      .map((answer) => `- ${answer.question_label} ${answer.value}`),
  ];
  if (inputs.optional_free_text?.value.trim()) {
    lines.push(
      `- ${inputs.optional_free_text.label} ${inputs.optional_free_text.value}`,
    );
  }
  return lines;
}

function platformInstruction(destination: string, steps: string[]): string {
  const normalizedDestination = normalizeForComparison(destination);
  const visibleSteps = steps.filter((step) => {
    const normalizedStep = normalizeForComparison(step);
    if (!normalizedStep) return false;
    if (
      normalizedDestination.includes("section etat / potions") &&
      normalizedStep.includes("section etat / potions")
    ) {
      return false;
    }
    return !normalizedDestination.includes(normalizedStep);
  });
  return visibleSteps.length > 0
    ? `Dans la plateforme, ${destination}, puis ${visibleSteps.join(", ")}.`
    : `Dans la plateforme, ${destination}.`;
}

export function renderSelectStatePotionHandoffDraft(
  draft: StatePotionHandoffDraft,
): string {
  const target = getHandoffTargetForOperation("select_state_potion");
  const recommendation = draft.recommendation;
  const destination = target?.user_facing_destination ??
    recommendation.platform_destination;
  const steps = target?.platform_steps ?? recommendation.platform_steps;
  const lines = [
    `Ce que je comprends : ${draft.user_state_summary}`,
    "",
    `Je te conseille de choisir ${recommendation.potion_label}. ${draft.desired_shift_summary}`,
    "",
    `Pourquoi cette potion : ${recommendation.why_this_potion}`,
  ];
  if (recommendation.immediate_step) {
    lines.push(`Petit pas immédiat : ${recommendation.immediate_step}`);
  }
  const platformInputs = renderPlatformInputs(recommendation.platform_inputs);
  if (platformInputs.length > 0) {
    lines.push("", ...platformInputs);
  }
  lines.push(
    "",
    platformInstruction(destination, steps),
    "",
    "Je ne lance pas de potion depuis le chat.",
  );
  return lines.join("\n");
}

export function renderStatePotionApplyAttemptHandoff(
  draft?: StatePotionHandoffDraft | null,
): string {
  const destination = getHandoffTargetForOperation("select_state_potion")
    ?.user_facing_destination ?? draft?.recommendation.platform_destination ??
    "depuis la section État / Potions";
  return [
    "Je ne l'active pas depuis le chat.",
    `Reprends cette recommandation dans la plateforme, ${destination}.`,
  ].join("\n");
}

export function renderStatePotionRepeatHandoff(
  draft?: StatePotionHandoffDraft | null,
): string {
  if (draft) return renderSelectStatePotionHandoffDraft(draft);
  const destination = getHandoffTargetForOperation("select_state_potion")
    ?.user_facing_destination ?? "depuis la section État / Potions";
  return [
    "Je n'ai pas encore une recommandation complète à répéter.",
    `Pour la lancer ensuite, reprends le choix dans la plateforme, ${destination}.`,
    "Je ne lance pas de potion depuis le chat.",
  ].join("\n");
}
