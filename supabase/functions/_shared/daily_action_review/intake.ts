import type {
  DailyReviewDecision,
  DailyReviewIntent,
  DailyReviewStatus,
} from "./contract.ts";
import { DAILY_REVIEW_DEFAULT_CONSTRAINTS } from "./contract.ts";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function asIntent(value: unknown): DailyReviewIntent {
  const raw = cleanText(value);
  if (
    raw === "open_review" || raw === "answer_review" ||
    raw === "clarify_outcome" || raw === "clarify_reason" ||
    raw === "clarify_still_relevant" || raw === "recap" ||
    raw === "correction" || raw === "user_stopped" || raw === "safety" ||
    raw === "off_topic" || raw === "unclear"
  ) return raw;
  return "unclear";
}

function asStatus(value: unknown): DailyReviewStatus {
  const raw = cleanText(value);
  if (
    raw === "opening" || raw === "collecting" ||
    raw === "needs_clarification" || raw === "complete" ||
    raw === "stopped" || raw === "blocked"
  ) return raw;
  return "needs_clarification";
}

export function sanitizeDailyReviewDecision(raw: unknown): DailyReviewDecision {
  const obj = raw && typeof raw === "object" ? raw as any : {};
  return {
    skill_id: "daily_action_review_v1",
    intent: asIntent(obj.intent),
    status: asStatus(obj.status),
    target_occurrence_ids: Array.isArray(obj.target_occurrence_ids)
      ? obj.target_occurrence_ids.map(cleanText).filter(Boolean)
      : [],
    item_updates: obj.item_updates && typeof obj.item_updates === "object"
      ? obj.item_updates
      : {},
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    next_question: cleanText(obj.next_question) || null,
    next_question_targets: Array.isArray(obj.next_question_targets)
      ? obj.next_question_targets.map(cleanText).filter(Boolean)
      : [],
    generated_user_message: cleanText(obj.generated_user_message) || null,
    should_apply_effects: false,
    stop_reason: obj.stop_reason ?? null,
    effect_plan: { allowed: false, effects: [] },
  };
}

export async function parseDailyReviewAnswer(params: {
  user_text: string;
  targets: unknown[];
  previous_state: unknown;
  action_intelligence?: unknown;
  llmRunner: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyReviewDecision> {
  const systemPrompt = [
    "Tu es l'intake structure daily_action_review_v1.",
    "Tu ne coaches pas. Tu remplis uniquement le contrat JSON du daily.",
    "Aucun effet n'est autorise ici: le reducer/effects gate le decidera.",
    "Reponds uniquement en JSON valide compatible avec DailyReviewDecision.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    user_text: params.user_text,
    targets: params.targets,
    previous_state: params.previous_state,
    action_intelligence: params.action_intelligence ?? null,
  });
  const raw = await params.llmRunner({ systemPrompt, userPrompt });
  return sanitizeDailyReviewDecision(raw);
}
