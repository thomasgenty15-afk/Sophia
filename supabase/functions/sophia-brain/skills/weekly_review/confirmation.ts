import type { WeeklyReviewPlanPatch } from "./contract.ts";
import {
  reviewWeeklyPatchConfirmation,
  weeklyPatchConfirmationClearsPending,
  type WeeklyPatchConfirmationReview,
} from "../../../_shared/weekly_review/confirmation.ts";

export type WeeklyReviewConfirmationDecision =
  | WeeklyPatchConfirmationReview
  | "unclear";

function normalizePlanTargetText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function reviewWeeklyReviewConfirmation(args: {
  user_message: string;
  weekly_state?: unknown;
  confirmation_contract_decision?: WeeklyPatchConfirmationReview | null;
  pending_patch?: WeeklyReviewPlanPatch | null;
}): WeeklyReviewConfirmationDecision {
  if (args.confirmation_contract_decision) {
    return args.confirmation_contract_decision;
  }
  const pendingPatch = args.pending_patch ??
    ((args.weekly_state as any)?.pending_weekly_patch as
      | WeeklyReviewPlanPatch
      | null
      | undefined) ??
    ((args.weekly_state as any)?.weekly_adaptive_review?.plan_patch as
      | WeeklyReviewPlanPatch
      | null
      | undefined);
  return reviewWeeklyPatchConfirmation({
    user_message: args.user_message,
    pending_patch: pendingPatch,
    current_weekly_state: args.weekly_state,
  });
}

export function weeklyReviewConfirmationClearsPending(
  review: WeeklyReviewConfirmationDecision,
): boolean {
  return review !== "unclear" && weeklyPatchConfirmationClearsPending(review);
}

export { weeklyPatchConfirmationClearsPending };

export function isEarlyWeeklyPlanningValidationRequest(
  message: string,
): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  const mentionsNextWeek =
    /\b(semaine prochaine|prochaine semaine|lundi prochain|pour lundi|des lundi|des le lundi|next week)\b/
      .test(text);
  const mentionsWeekly =
    /\b(weekly|bilan hebdo|point hebdo|revue hebdo|review hebdo)\b/.test(text);
  const asksValidation =
    /\b(valide|valider|validation|confirme|confirmer|programme|programmer|planifie|planifier|considere que c est bon|c est bon pour lundi|sans attendre|tout de suite|maintenant)\b/
      .test(text);
  return asksValidation && mentionsNextWeek &&
    (mentionsWeekly ||
      /\bsans attendre\b|\btout de suite\b|\bmaintenant\b/.test(text));
}

export function isExplicitPendingApplyConfirmation(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  if (
    /\b(stop|annule|annuler|ne valide pas|ne valide encore pas|ne valide toujours pas|ne l applique pas|ne l applique encore pas|ne l applique toujours pas|n applique pas|n applique encore pas|n applique toujours pas|n applique rien|ne rien appliquer|on n applique rien|ne l execute pas|n execute pas|garde le plan tel quel|je pourrai|je pourrais|ca pourrait|ça pourrait|presque|pas encore|avant validation|avant de valider|avant que je valide|avant que je dise oui|confirme moi juste|confirme-moi juste|je veux relire|montre|reformule|corrige|change|enleve|enlève|ajoute plutot|ajoute plutôt)\b/
      .test(text)
  ) {
    return false;
  }
  return /\b(oui|ok|d accord|vas y|go|valide|applique|appliquer|execute|exécute|executer|exécuter|fais le|tu peux le faire|c est bon)\b/
    .test(text) &&
    /\b(valide|applique|appliquer|execute|exécute|executer|exécuter|fais le|tu peux le faire|c est bon|cette version)\b/
      .test(text);
}
