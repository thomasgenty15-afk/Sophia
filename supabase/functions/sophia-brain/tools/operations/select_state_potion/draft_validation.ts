import {
  reviewToolSkillDraftWithAi,
  type ToolSkillDraftReviewDecision,
} from "../_shared/draft_review.ts";

export function reviewSelectStatePotionDraft(input: {
  message: string;
  previous_draft: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
}): Promise<ToolSkillDraftReviewDecision | null> {
  return reviewToolSkillDraftWithAi({
    operation_type: "select_state_potion",
    message: input.message,
    previous_draft: input.previous_draft,
    operation_input: input.operation_input,
    recent_messages: input.recent_messages,
    request_id: input.request_id,
  });
}

export type { ToolSkillDraftReviewDecision };
