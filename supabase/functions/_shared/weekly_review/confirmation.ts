import type { WeeklyReviewPlanPatch } from "./contract.ts";

export type WeeklyPatchConfirmationReview =
  | "approve"
  | "reject"
  | "revise"
  | "explain"
  | "unrelated";

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .trim();
}

export function reviewWeeklyPatchConfirmation(args: {
  user_message: string;
  pending_patch: WeeklyReviewPlanPatch | null | undefined;
  current_weekly_state?: unknown;
}): WeeklyPatchConfirmationReview {
  if (!args.pending_patch?.requires_confirmation) return "unrelated";
  const text = normalizeText(args.user_message);
  if (!text) return "unrelated";

  if (
    /^(ok|oui|yes|go|vas y|valide|je confirme|confirme|c est bon|cest bon|d accord|dac|applique)$/u
      .test(text)
  ) return "approve";
  if (
    /^(non|no|stop|annule|j annule|laisse tomber|pas maintenant|ne valide pas|n applique pas)$/u
      .test(text)
  ) return "reject";
  if (
    /\b(pourquoi|explique|detaille|resume|recap|qu est ce que|c est quoi)\b/u
      .test(text)
  ) {
    return "explain";
  }
  if (
    /\b(change|modifie|remplace|plutot|a la place|retire|ajoute|pas comme ca|autrement|revise)\b/u
      .test(text)
  ) return "revise";
  return "unrelated";
}

export function weeklyPatchConfirmationClearsPending(
  review: WeeklyPatchConfirmationReview,
): boolean {
  return review === "approve" || review === "reject";
}
