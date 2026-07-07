import type {
  TrackProgressCommittedEffect,
  TrackProgressDirectEffectResult,
} from "./contract.ts";

export function renderTrackProgressLoggedReply(
  effect: TrackProgressCommittedEffect | null | undefined,
): string | null {
  if (!effect?.logged_progress_id) return null;
  if (effect.progress_status === "missed") {
    return `C'est noté : ${effect.target_title} est marqué comme raté.`;
  }
  if (effect.progress_status === "partial") {
    return `C'est noté : ${effect.target_title} est marqué comme partiel.`;
  }
  return `C'est noté : ${effect.target_title} est marqué comme fait.`;
}

export function renderTrackProgressClarification(reasonCode: string): string {
  if (reasonCode === "status_missing") {
    return "Le statut du progres n'est pas assez clair.";
  }
  if (reasonCode === "target_ambiguous") {
    return "Tu parles de quel element exactement ?";
  }
  if (reasonCode === "intent_implied_weak") {
    return "Tu veux que je le note vraiment ?";
  }
  return "Je prefere confirmer avant de l'ecrire.";
}

const trackProgressOutcomeLabels: Record<string, string> = {
  completed: "fait",
  partial: "partiel",
  missed: "rate",
};

export function renderTrackProgressContradictionClarification(input: {
  target_title: string;
  existing_outcome: string;
  requested_status: string;
}): string {
  const existing = trackProgressOutcomeLabels[input.existing_outcome] ??
    input.existing_outcome;
  // Pas d'offre de bascule: l'override same-day n'existe pas en chat
  // (paul-r5 B02, decision V1) — « tu veux que je corrige ? » promettait une
  // confirmation inexecutable (boucle morte). On dit l'etat et ou ca se
  // corrige, sans question.
  void input.requested_status;
  return `Aujourd'hui, ${input.target_title} est deja note comme ${existing} — je ne peux pas changer ca depuis le chat. Si c'est une erreur, tu peux le corriger directement sur cette action dans Dashboard > Plan.`;
}

export function enforceTrackProgressReplyInvariant(
  result: TrackProgressDirectEffectResult,
): TrackProgressDirectEffectResult {
  return result;
}
