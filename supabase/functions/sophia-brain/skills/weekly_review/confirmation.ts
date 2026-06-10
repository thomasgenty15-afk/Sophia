import type { WeeklyReviewPlanPatch } from "./contract.ts";
import {
  weeklyPatchConfirmationClearsPending,
  type WeeklyPatchConfirmationReview,
} from "../../../_shared/weekly_review/confirmation.ts";

export type WeeklyReviewConfirmationDecision =
  | WeeklyPatchConfirmationReview
  | "unclear";

export function reviewWeeklyReviewConfirmation(args: {
  user_message: string;
  weekly_state?: unknown;
  confirmation_contract_decision?: WeeklyPatchConfirmationReview | null;
  pending_patch?: WeeklyReviewPlanPatch | null;
}): WeeklyReviewConfirmationDecision {
  void args.user_message;
  void args.weekly_state;
  void args.pending_patch;
  return args.confirmation_contract_decision ?? "unclear";
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
  void message;
  return false;
}

export function isExplicitPendingApplyConfirmation(message: string): boolean {
  void message;
  return false;
}
