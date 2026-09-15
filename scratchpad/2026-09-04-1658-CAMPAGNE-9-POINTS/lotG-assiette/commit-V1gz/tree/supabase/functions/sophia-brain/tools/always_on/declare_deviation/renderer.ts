/**
 * KEEL W4.3 — renderer for `declare_deviation`.
 *
 * Same structural rule as `log_protocol_event/renderer.ts`: the acknowledgement
 * is a function of the COMMITTED effect, so it cannot exist without a row.
 *
 * The retroactive refusal has its own copy, and it says three things on
 * purpose: what was refused, WHY (the day is already graded), and the one route
 * that is open (the coach). A refusal that only says "no" reads as a bug and
 * gets retried; a refusal that names its condition is a rule.
 */

import type {
  DeclareDeviationCommittedEffect,
  DeclareDeviationDirectEffectResult,
} from "./contract.ts";

export function renderDeclareDeviationReply(
  effect: DeclareDeviationCommittedEffect | null | undefined,
): string | null {
  if (!effect?.planned_deviation_id) return null;
  const slot = effect.slot_key ? ` (${effect.slot_key})` : "";
  if (effect.already_declared) {
    return `Already noted for ${effect.local_date}${slot}.`;
  }
  if (effect.coach_authorized_backdate) {
    return `Noted for ${effect.local_date}${slot}, on your coach's authorisation.`;
  }
  return `Noted — ${effect.local_date}${slot} is flagged as planned time off.`;
}

export function renderDeclareDeviationRefusal(
  reasonCode: string,
  context?: { local_date?: string | null; token_issue?: string | null },
): string {
  if (reasonCode === "retroactive_on_resolved_day") {
    const day = context?.local_date ? ` ${context.local_date}` : " that day";
    return `I can't add planned time off for${day} — it's already been reviewed. ` +
      `Planned deviations are declared before the day, so they stay a plan and not a correction. ` +
      `If it should count, your coach can authorise it.`;
  }
  if (reasonCode === "safety_high") {
    return "Let's not sort out the schedule right now.";
  }
  if (reasonCode === "unknown_token") {
    return `I couldn't note that — ${
      context?.token_issue ?? "an unrecognised value"
    }.`;
  }
  if (reasonCode === "missing_plan_version") {
    return "There's no published plan to attach that to yet.";
  }
  if (reasonCode === "missing_content_locale") {
    return "I couldn't note that yet — I don't know which language to store it in.";
  }
  if (reasonCode === "missing_time_context") {
    return "I couldn't note that yet — I'm missing your local date.";
  }
  if (reasonCode === "missing_local_date") {
    return "Which day exactly?";
  }
  if (
    reasonCode === "intent_implied_weak" || reasonCode === "ambiguity_present"
  ) {
    return "Do you want me to note that as planned time off?";
  }
  if (reasonCode === "target_ambiguous" || reasonCode === "missing_time") {
    return "Which day do you mean?";
  }
  if (
    reasonCode === "duplicate_source_message" || reasonCode === "duplicate_db"
  ) {
    return "I already noted that one.";
  }
  return "I didn't note that.";
}

/**
 * Belt + disarm condition (P9). Applies only to `status === 'declared'`; any
 * other status passes through. It can only REMOVE an acknowledgement.
 */
export function enforceDeclareDeviationReplyInvariant(
  result: DeclareDeviationDirectEffectResult,
): DeclareDeviationDirectEffectResult {
  if (result.status !== "declared") return result;
  const committed = result.committed_effects.find((effect) =>
    Boolean(effect.planned_deviation_id)
  );
  if (committed) return result;
  return {
    ...result,
    status: "failed",
    reply: null,
    executed_tools: [],
    blocked_effects: [
      ...result.blocked_effects,
      { type: "declare_deviation", reason_code: "phantom_commit_blocked" },
    ],
    debug: { ...result.debug, reason_code: "phantom_commit_blocked" },
  };
}
