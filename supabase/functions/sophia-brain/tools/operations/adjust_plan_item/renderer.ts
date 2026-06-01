import type { AdjustPlanConstraint, AdjustPlanDecision } from "./contract.ts";
import type { AdjustPlanEffectMaterializationResult } from "./effects.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";

function hasCommittedEffect(
  effectResult?: AdjustPlanEffectMaterializationResult | null,
): boolean {
  return Boolean(effectResult?.committed_effects.length);
}

function missingSlotReply(state: AdjustPlanDecision): string {
  const missing = [
    ...state.scope.missing_slots,
    ...state.change.missing_slots,
  ];
  if (missing.includes("scope")) {
    return "Je peux le préparer, mais il me manque la cible exacte du plan à ajuster.";
  }
  if (missing.includes("requested_change")) {
    return "Je peux le préparer, mais il me manque le changement concret que tu veux proposer.";
  }
  return "Je peux le préparer, mais il me manque une précision avant de faire un brouillon fiable.";
}

export function renderAdjustPlanDecision(args: {
  state: AdjustPlanDecision;
  effect_result?: AdjustPlanEffectMaterializationResult | null;
  constraints?: AdjustPlanConstraint[];
}): string {
  const { state, effect_result } = args;
  const noCommitFallback =
    "Je n'applique rien sans effet confirmé. Le plan reste inchangé.";
  if (effect_result?.failed_effects.length) {
    return "Je n'ai pas pu appliquer cet ajustement. Le plan reste inchangé.";
  }
  if (hasCommittedEffect(effect_result)) {
    return state.reply.trim() ||
      "C'est appliqué. L'ajustement a bien été enregistré dans le plan.";
  }
  if (state.intent === "reject_draft" || state.status === "rejected") {
    return "Ok, je n'applique pas cet ajustement. Le plan reste inchangé.";
  }
  if (state.intent === "off_topic" || state.status === "off_topic") {
    return renderNonCommittedReply(state.reply, "");
  }
  if (state.intent === "explain_draft") {
    return renderNonCommittedReply(
      state.reply,
      state.draft.summary ||
        "Je peux expliquer le brouillon, mais je n'applique rien sans confirmation explicite.",
    );
  }
  if (
    state.effect_plan.blocked_reason === "missing_slots" ||
    state.scope.missing_slots.length > 0 ||
    state.change.missing_slots.length > 0
  ) {
    return renderNonCommittedReply(state.reply, missingSlotReply(state));
  }
  if (state.draft.available) {
    return renderNonCommittedReply(state.reply, [
      state.draft.summary ?? "J'ai un brouillon d'ajustement.",
      "Je n'applique rien tant que tu ne me confirmes pas clairement de l'appliquer.",
    ].join("\n\n"));
  }
  return renderNonCommittedReply(
    state.reply,
    noCommitFallback,
  );
}

export function renderAdjustPlanDraftGenerationConfirmationQuestion(): string {
  return "Je peux préparer un brouillon concret d'ajustement. Tu veux que je le génère maintenant, sans l'appliquer ?";
}
