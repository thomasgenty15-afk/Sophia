import type {
  FlowOpportunityConfirmationAnchor,
  FlowOpportunityLocalState,
  FlowOpportunityPayload,
  FlowOpportunityTargetFlow,
  FlowOpportunityTargetKind,
} from "./contract.ts";
import { RECENT_MESSAGE_LIMITS } from "../../context/recent_messages_policy.ts";

export const FLOW_OPPORTUNITY_STATE_KEY =
  "__flow_opportunity_verification_state_v1";
export const FLOW_OPPORTUNITY_EXIT_MEMO_KEY =
  "__last_flow_opportunity_verification_exit_memo";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function targetKindForFlow(
  targetFlow: FlowOpportunityTargetFlow,
): FlowOpportunityTargetKind {
  switch (targetFlow) {
    case "status_recap":
    case "product_help":
    case "emotional_repair":
    case "demotivation_repair":
      return "skill";
    case "update_coach_preferences":
    case "prepare_attack_card":
    case "prepare_defense_card":
    case "select_state_potion":
    case "create_recurring_reminder":
    case "adjust_plan_item":
      return "tool_skill";
    case "one_shot_reminder":
      return "direct_effect";
    default:
      return "unknown";
  }
}

export function targetContextFromSeed(
  seedContext: Record<string, unknown>,
): Record<string, unknown> {
  const focus = stringArray(seedContext.focus);
  const surface = stringValue(seedContext.surface) || null;
  return {
    ...(seedContext ?? {}),
    ...(focus.length ? { focus } : {}),
    ...(surface ? { surface } : {}),
  };
}

export function createConfirmationAnchor(args: {
  targetKind: FlowOpportunityTargetKind;
  targetFlow: FlowOpportunityTargetFlow;
  targetContext: Record<string, unknown>;
}): FlowOpportunityConfirmationAnchor {
  const focus = stringArray(args.targetContext.focus).join(", ");
  return {
    meaning: `accept ${args.targetKind} target_flow ${args.targetFlow}${
      focus ? ` with focus ${focus}` : ""
    }`,
    target_kind: args.targetKind,
    target_flow: args.targetFlow,
    target_context: args.targetContext,
    must_not_reinterpret_acceptance_as: [
      "product_help",
      "normal_reply",
      "prepare_attack_card",
      "prepare_defense_card",
    ],
  };
}

export function createFlowOpportunityState(args: {
  opportunity: FlowOpportunityPayload;
  userMessage: string;
  previous?: FlowOpportunityLocalState | null;
  status?: FlowOpportunityLocalState["status"];
}): FlowOpportunityLocalState {
  const now = new Date().toISOString();
  const targetContext = targetContextFromSeed(args.opportunity.seed_context);
  return {
    skill_id: "flow_opportunity_verification",
    mode: "local_verification_flow",
    status: args.status ?? "waiting_confirmation",
    opportunity_id: args.opportunity.opportunity_id,
    target_kind: args.opportunity.target_kind,
    target_flow: args.opportunity.target_flow,
    target_action: args.opportunity.target_action ??
      `run_${args.opportunity.target_flow}`,
    target_context: targetContext,
    origin: {
      user_message: args.previous?.origin.user_message ?? args.userMessage,
      evidence: args.previous?.origin.evidence.length
        ? args.previous.origin.evidence
        : args.opportunity.evidence,
      created_at: args.previous?.origin.created_at ?? now,
    },
    confirmation_anchor: args.previous?.confirmation_anchor ??
      createConfirmationAnchor({
        targetKind: args.opportunity.target_kind,
        targetFlow: args.opportunity.target_flow,
        targetContext,
      }),
    subskill_history: args.previous?.subskill_history ?? [],
    recent_user_messages: [
      ...(args.previous?.recent_user_messages ?? []),
      args.userMessage,
    ].filter(Boolean).slice(-5),
    turn_count: Math.max(1, Number(args.previous?.turn_count ?? 0) + 1),
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
}

export function readFlowOpportunityState(
  tempMemory: unknown,
): FlowOpportunityLocalState | null {
  const temp = isRecord(tempMemory) ? tempMemory : {};
  const raw = temp[FLOW_OPPORTUNITY_STATE_KEY];
  if (!isRecord(raw)) return null;
  if (raw.skill_id !== "flow_opportunity_verification") return null;
  if (raw.mode !== "local_verification_flow") return null;
  if (!stringValue(raw.opportunity_id) || !stringValue(raw.target_flow)) {
    return null;
  }
  if (!isRecord(raw.confirmation_anchor)) return null;
  const targetFlow = stringValue(raw.target_flow) as FlowOpportunityTargetFlow;
  return {
    ...raw,
    target_kind: stringValue(raw.target_kind) ||
      targetKindForFlow(targetFlow),
    confirmation_anchor: {
      ...raw.confirmation_anchor,
      target_kind: stringValue((raw.confirmation_anchor as any).target_kind) ||
        stringValue(raw.target_kind) ||
        targetKindForFlow(targetFlow),
    },
  } as FlowOpportunityLocalState;
}

export function hasActiveFlowOpportunityState(tempMemory: unknown): boolean {
  const state = readFlowOpportunityState(tempMemory);
  return Boolean(
    state &&
      ["offered", "explaining", "waiting_confirmation"].includes(state.status),
  );
}

export function writeFlowOpportunityState(
  tempMemory: unknown,
  state: FlowOpportunityLocalState | null,
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  if (state) {
    next[FLOW_OPPORTUNITY_STATE_KEY] = state;
  } else {
    delete next[FLOW_OPPORTUNITY_STATE_KEY];
    const active = next.__active_skill_state;
    if (
      isRecord(active) && active.skill_id === "flow_opportunity_verification"
    ) {
      delete next.__active_skill_state;
    }
    const activeSkillAlias = next.active_skill_state;
    if (
      isRecord(activeSkillAlias) &&
      activeSkillAlias.skill_id === "flow_opportunity_verification"
    ) {
      delete next.active_skill_state;
    }
  }
  return next;
}

export function appendGetInfoHistory(args: {
  state: FlowOpportunityLocalState;
  skillId: "product_help" | "status_recap";
  userMessage: string;
  reply: string | null;
  context: Record<string, unknown>;
}): FlowOpportunityLocalState {
  const now = new Date().toISOString();
  const recent = args.state.recent_user_messages;
  const alreadyRecorded = recent[recent.length - 1] === args.userMessage;
  return {
    ...args.state,
    status: "waiting_confirmation",
    subskill_history: [
      ...args.state.subskill_history,
      {
        skill_id: args.skillId,
        user_question: args.userMessage,
        reply_preview: stringValue(args.reply).slice(0, 240) || null,
        context: args.context,
        at: now,
      },
    ].slice(-RECENT_MESSAGE_LIMITS.subskillHistory),
    recent_user_messages: alreadyRecorded
      ? recent
      : [...recent, args.userMessage].filter(Boolean).slice(-5),
    turn_count: Math.max(
      1,
      Number(args.state.turn_count ?? 0) + (alreadyRecorded ? 0 : 1),
    ),
    confirmation_anchor: args.state.confirmation_anchor,
    updated_at: now,
  };
}
