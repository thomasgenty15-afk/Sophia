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

export function enforceTrackProgressReplyInvariant(
  result: TrackProgressDirectEffectResult,
): TrackProgressDirectEffectResult {
  return result;
}
