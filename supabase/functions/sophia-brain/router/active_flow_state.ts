/// <reference path="../../tsserver-shims.d.ts" />

import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";

export type ActiveFlowState = {
  activeSkillState: unknown;
};

export type ActiveLocalConversationFlowSkillId =
  | "daily_action_review_v1"
  | "weekly_adaptive_review_v1"
  | "product_help"
  | "coaching_recommendation"
  | "plan_realignment"
  | "feature_opportunity"
  | "safety_crisis";

const ACTIVE_LOCAL_CONVERSATION_FLOW_SKILL_IDS = new Set<
  ActiveLocalConversationFlowSkillId
>([
  "daily_action_review_v1",
  "weekly_adaptive_review_v1",
  "product_help",
  "coaching_recommendation",
  "plan_realignment",
  "feature_opportunity",
  "safety_crisis",
]);

function legacyKey(...parts: string[]): string {
  return parts.join("_");
}

const ACTIVE_SKILL_STATE_KEYS = [
  ACTIVE_CONVERSATION_SKILL_KEY,
  "__active_skill_state",
  "active_skill_state",
];

const LEGACY_RUNTIME_STATE_KEYS = [
  legacyKey("__clarification", "flow", "state"),
  legacyKey("__status", "recap", "flow", "state", "v1"),
  legacyKey("__flow", "opportunity", "verification", "state", "v1"),
  legacyKey("__adjust", "plan", "handoff", "state"),
  legacyKey("__active", "attack", "card", "handoff"),
  legacyKey("__active", "defense", "card", "handoff"),
  legacyKey("__recurring", "reminder", "handoff", "state"),
  legacyKey("__coach", "preference", "flow", "state", "v1"),
  legacyKey("__active", "tool", "skill", "intake"),
  legacyKey("active", "tool", "skill", "intake"),
  legacyKey("__pending", "tool", "skill", "confirmation"),
  legacyKey("pending", "tool", "skill", "confirmation"),
  legacyKey("__pending", "recommendation", "operation"),
  legacyKey("pending", "recommendation", "operation"),
  legacyKey("__suspended", "platform", "handoff", "state", "v1"),
];

const LEGACY_LOCAL_EXIT_MEMO_KEYS = [
  legacyKey("__last", "adjust", "plan", "item", "exit", "memo"),
  legacyKey("__last", "prepare", "attack", "card", "exit", "memo"),
  legacyKey("__last", "prepare", "defense", "card", "exit", "memo"),
  legacyKey("__last", "select", "state", "potion", "exit", "memo"),
  legacyKey("__last", "update", "coach", "preferences", "exit", "memo"),
  legacyKey("__last", "flow", "opportunity", "verification", "exit", "memo"),
  legacyKey("__last", "status", "recap", "exit", "memo"),
  legacyKey("__last", "emotional", "repair", "exit", "memo"),
  legacyKey("__last", "demotivation", "repair", "exit", "memo"),
];

function readFirstTempMemoryKey(
  tempMemory: unknown,
  keys: readonly string[],
): unknown {
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    if (temp[key] !== undefined) return temp[key];
  }
  return null;
}

function clearTempMemoryKeys<
  T extends Record<string, unknown> | null | undefined,
>(
  tempMemory: T,
  keys: readonly string[],
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  for (const key of keys) delete next[key];
  return next;
}

function recordSkillId(value: unknown): string {
  const record = value as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  return String(record.skill_id ?? "").trim();
}

// Borne de fraicheur des flows locaux: un flow actif dont le dernier tour
// date de plus de 4h ne possede plus la conversation — le message courant
// prime sur un vieux flow (charte anti-patching, commandement 9). Pour la
// safety c'est sans risque: le pregate re-evalue chaque tour et re-engage
// un flow frais si un signal reel est present.
export const ACTIVE_LOCAL_FLOW_STALE_AFTER_MS = 4 * 60 * 60 * 1000;

export function isStaleActiveLocalFlowState(
  value: unknown,
  nowMs: number = Date.now(),
): boolean {
  const record = value as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }
  const touchedAt = Date.parse(
    String(record.updated_at ?? record.started_at ?? ""),
  );
  // Sans timestamp exploitable, le flow est conserve: la fraicheur ne doit
  // jamais casser un flow legitime a cause d'un state partiel.
  if (!Number.isFinite(touchedAt)) return false;
  return nowMs - touchedAt > ACTIVE_LOCAL_FLOW_STALE_AFTER_MS;
}

function activeLocalConversationSkillId(
  value: unknown,
): ActiveLocalConversationFlowSkillId | "" {
  const skillId = recordSkillId(value);
  const record = value as any;
  const status = record && typeof record === "object" && !Array.isArray(record)
    ? String(record.status ?? "").trim().toLowerCase()
    : "";
  const terminalStatuses = new Set([
    "completed",
    "done",
    "closed",
    "stopped",
    "cancelled",
    "canceled",
    "deferred",
    "exit_to_global",
    "exiting",
  ]);
  if (terminalStatuses.has(status)) return "";
  if (isStaleActiveLocalFlowState(value)) return "";
  return ACTIVE_LOCAL_CONVERSATION_FLOW_SKILL_IDS.has(
      skillId as ActiveLocalConversationFlowSkillId,
    )
    ? skillId as ActiveLocalConversationFlowSkillId
    : "";
}

export function readActiveFlowState(tempMemory: unknown): ActiveFlowState {
  const activeSkillState = readFirstTempMemoryKey(
    tempMemory,
    ACTIVE_SKILL_STATE_KEYS,
  );
  return {
    activeSkillState: activeLocalConversationSkillId(activeSkillState)
      ? activeSkillState
      : null,
  };
}

export function shouldSkipGlobalDispatcherForActiveLocalFlow(args: {
  activeSkillState: unknown;
}): boolean {
  return activeLocalConversationSkillId(args.activeSkillState) !== "";
}

export function clearLegacyRuntimeState<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearTempMemoryKeys(tempMemory, LEGACY_RUNTIME_STATE_KEYS);
}

export function clearActiveConversationSkillState<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearTempMemoryKeys(tempMemory, ACTIVE_SKILL_STATE_KEYS);
}

export function clearLegacyRuntimeStateForDirectEffect(tempMemory: any): any {
  let next = clearLegacyRuntimeState(tempMemory);
  for (const key of Object.keys(next)) {
    if (key.includes("followup_consent")) delete next[key];
  }
  return next;
}

function compactRuntimeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 160) : null;
}

function compactStructuredLocalHandoff(
  record: Record<string, unknown>,
): {
  flow_summary: string | null;
  handoff_hint_for_global_dispatcher: string | null;
} {
  const handoffHint = record.handoff_hint_for_global_dispatcher &&
      typeof record.handoff_hint_for_global_dispatcher === "object"
    ? record.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const likelyIntent = compactRuntimeString(record.recommended_next_focus) ??
    compactRuntimeString(handoffHint.likely_intent);
  const why = compactRuntimeString(handoffHint.why) ??
    compactRuntimeString(record.reason);
  return {
    flow_summary: compactRuntimeString(record.user_message_summary) ??
      compactRuntimeString(record.flow_summary) ??
      compactRuntimeString(record.user_intent_summary),
    handoff_hint_for_global_dispatcher: [likelyIntent, why].filter(Boolean)
      .join(": ") || null,
  };
}

export function buildLastLocalFlowExitContext(
  tempMemory: unknown,
): Record<string, unknown> | null {
  type LocalFlowExitContext = {
    operation_type: string;
    reason: string;
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    note_information: Record<string, unknown> | null;
    at: string | null;
  };
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  const candidates: Array<{ operation_type: string; memo: unknown }> = [
    {
      operation_type: "whatsapp_onboarding",
      memo: temp.__last_whatsapp_onboarding_exit_memo,
    },
    {
      operation_type: "daily_action_review",
      memo: temp.__last_daily_action_review_exit_memo,
    },
    {
      operation_type: "daily_action_review",
      memo: temp.__last_daily_action_review_child_flow_handoff,
    },
    {
      operation_type: "weekly_adaptive_review",
      memo: temp.__last_weekly_adaptive_review_exit_memo,
    },
    {
      operation_type: "weekly_adaptive_review",
      memo: temp.__last_weekly_adaptive_review_child_flow_handoff,
    },
    {
      operation_type: "product_help",
      memo: temp.__last_product_help_exit_memo,
    },
    {
      operation_type: "coaching_recommendation",
      memo: temp.__last_coaching_recommendation_exit_memo,
    },
    {
      operation_type: "feature_opportunity",
      memo: temp.__last_feature_opportunity_exit_memo,
    },
    {
      operation_type: "safety_crisis",
      memo: temp.__last_safety_crisis_exit_memo,
    },
  ];
  const valid: LocalFlowExitContext[] = candidates
    .map((candidate) => {
      const memo = candidate.memo;
      if (!memo || typeof memo !== "object" || Array.isArray(memo)) {
        return null;
      }
      const record = memo as Record<string, unknown>;
      const structuredLocalMemo = compactStructuredLocalHandoff(record);
      return {
        operation_type: candidate.operation_type,
        reason: compactRuntimeString(record.reason) ?? "topic_change",
        flow_summary: structuredLocalMemo.flow_summary,
        handoff_hint_for_global_dispatcher:
          structuredLocalMemo.handoff_hint_for_global_dispatcher,
        note_information: record.note_information &&
            typeof record.note_information === "object" &&
            !Array.isArray(record.note_information)
          ? record.note_information as Record<string, unknown>
          : null,
        at: compactRuntimeString(record.at),
      };
    })
    .filter((value): value is LocalFlowExitContext => value !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return valid[0];
}

export function clearLastLocalFlowExitContext<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  const next = clearTempMemoryKeys(tempMemory, LEGACY_LOCAL_EXIT_MEMO_KEYS);
  delete next.__last_whatsapp_onboarding_exit_memo;
  delete next.__last_daily_action_review_exit_memo;
  delete next.__last_daily_action_review_child_flow_handoff;
  delete next.__last_weekly_adaptive_review_exit_memo;
  delete next.__last_weekly_adaptive_review_child_flow_handoff;
  delete next.__last_product_help_exit_memo;
  delete next.__last_coaching_recommendation_exit_memo;
  delete next.__last_feature_opportunity_exit_memo;
  delete next.__last_safety_crisis_exit_memo;
  return next;
}
