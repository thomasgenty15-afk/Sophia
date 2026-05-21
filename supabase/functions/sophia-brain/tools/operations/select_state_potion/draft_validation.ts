import {
  reviewToolSkillDraftWithAi,
  type ToolSkillDraftReviewDecision,
} from "../_shared/draft_review.ts";

function normalizeReviewText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function hasExplicitStatePotionActivationApproval(
  message: string,
): boolean {
  const text = normalizeReviewText(message);
  const asksRevisionBeforeApproval =
    /\b(avant validation|avant de valider|avant qu on valide|pas encore|attends|attend|mais|plutot|je veux que|j aimerais que|modifie|ajuste|change|corrige|details?|explique)\b/
      .test(text);
  if (asksRevisionBeforeApproval) return false;
  return /\b(oui|ok|okay|d accord|dac|go|vas[- ]?y|c est bon|ca marche|parfait|je valide|valide|active|lance|on commence|commence|c est parti|allons[- ]?y)\b/
    .test(text) &&
    /\b(potion|active|lance|valide|ok|oui|go|commence|parti|convient|marche)\b/
      .test(text);
}

export async function reviewSelectStatePotionDraft(input: {
  message: string;
  previous_draft: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
}): Promise<ToolSkillDraftReviewDecision | null> {
  const decision = await reviewToolSkillDraftWithAi({
    operation_type: "select_state_potion",
    message: input.message,
    previous_draft: input.previous_draft,
    operation_input: input.operation_input,
    recent_messages: input.recent_messages,
    request_id: input.request_id,
  });
  if (
    decision?.decision === "approve" &&
    !hasExplicitStatePotionActivationApproval(input.message)
  ) {
    return {
      ...decision,
      decision: "revise",
      confidence: "high",
      evidence: [
        ...decision.evidence,
        "Le message apporte une precision ou un besoin, sans validation explicite d'activation.",
      ],
      generated_user_message: null,
    };
  }
  return decision;
}

export type { ToolSkillDraftReviewDecision };
