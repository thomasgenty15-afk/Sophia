/**
 * Momentum helpers extracted from sophia-brain/momentum_state.ts
 * to resolve layering violation (_shared/ -> sophia-brain/).
 */

export type ReplyQuality = "substantive" | "brief" | "minimal";

// deno-lint-ignore no-explicit-any
export type MomentumStateSnapshot = Record<string, any>;

const MINIMAL_REPLY_PATTERNS = [
  /^(ok|okay|oui|non|merci|top|super|parfait|d'accord|dac|ça marche|ca marche|c'est bon|cool)$/i,
  /^(👍|🙏|❤️|ok merci|merci beaucoup)$/i,
];

export function detectReplyQuality(userMessage: string): ReplyQuality {
  const text = String(userMessage ?? "").trim();
  if (!text) return "minimal";
  if (MINIMAL_REPLY_PATTERNS.some((pattern) => pattern.test(text))) {
    return "minimal";
  }
  if (text.length <= 12) return "minimal";
  if (text.length <= 40) return "brief";
  return "substantive";
}

// deno-lint-ignore no-explicit-any
type AnyMomentumState = Record<string, any>;

function legacyDisabledGetTopMomentumBlocker(
  momentum: AnyMomentumState,
): { action_title?: string; current_category?: string; stage?: string } | null {
  const memory = momentum?.blocker_memory;
  if (!memory?.actions?.length) return null;
  return memory.actions[0] ?? null;
}

export function summarizeMomentumStateForLog(
  momentum: AnyMomentumState,
): Record<string, unknown> {
  if ("blockers" in momentum) {
    const internal = "_internal" in momentum ? momentum._internal : undefined;
    return {
      state: momentum.current_state ?? null,
      state_reason: momentum.state_reason ?? null,
      engagement: momentum.dimensions?.engagement?.level,
      progression: momentum.dimensions?.execution_traction?.level,
      emotional_load: momentum.dimensions?.emotional_load?.level,
      consent: momentum.dimensions?.consent?.level,
      pending_transition_target:
        internal?.stability?.pending_transition?.target_state ?? null,
      pending_transition_confirmations:
        internal?.stability?.pending_transition?.confirmations ?? null,
      stable_since_at: internal?.stability?.stable_since_at ?? null,
      active_blockers_count: momentum.blockers?.blocker_kind ? 1 : 0,
      chronic_blockers_count:
        (momentum.blockers?.blocker_repeat_score ?? 0) >= 6 ? 1 : 0,
      top_blocker_action: momentum.assessment?.top_blocker ?? null,
      top_blocker_category: momentum.blockers?.blocker_kind ?? null,
      top_blocker_stage:
        (momentum.blockers?.blocker_repeat_score ?? 0) >= 6 ? "chronic" : null,
      updated_at: momentum.updated_at ?? null,
    };
  }
  const topBlocker = legacyDisabledGetTopMomentumBlocker(momentum);
  return {
    state: momentum.current_state ?? null,
    state_reason: momentum.state_reason ?? null,
    engagement: momentum.dimensions?.engagement?.level,
    progression: momentum.dimensions?.progression?.level,
    emotional_load: momentum.dimensions?.emotional_load?.level,
    consent: momentum.dimensions?.consent?.level,
    pending_transition_target:
      momentum.stability?.pending_transition?.target_state ?? null,
    pending_transition_confirmations:
      momentum.stability?.pending_transition?.confirmations ?? null,
    stable_since_at: momentum.stability?.stable_since_at ?? null,
    active_blockers_count: momentum.metrics?.active_blockers_count ?? 0,
    chronic_blockers_count: momentum.metrics?.chronic_blockers_count ?? 0,
    top_blocker_action: topBlocker?.action_title ?? null,
    top_blocker_category: topBlocker?.current_category ?? null,
    top_blocker_stage: topBlocker?.stage ?? null,
    updated_at: momentum.updated_at ?? null,
  };
}
