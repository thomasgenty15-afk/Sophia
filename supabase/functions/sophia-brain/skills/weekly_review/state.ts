import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

function isWeeklyAdaptiveReviewState(value: unknown): value is Record<
  string,
  unknown
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const skillId = String((value as any).skill_id ?? "").trim();
  const flowId = String((value as any).flow_id ?? "").trim();
  return skillId === "weekly_adaptive_review_v1" ||
    flowId === "weekly_adaptive_review_v1";
}

// Un weekly deja termine (cloture) ne doit plus capturer le routage: le tour
// suivant doit repartir vers le dispatcher global (puis normal_reply pour une
// simple politesse post-cloture). Sans ce garde, le weekly reste "actif" avec
// status=completed et re-entre de facon non deterministe (re-synthese parasite).
function isTerminalWeeklyReviewStatus(value: Record<string, unknown>): boolean {
  return String((value as any).status ?? "").trim() === "completed";
}

export function isWeeklyAdaptiveReviewActive(
  activeSkillState: unknown,
): boolean {
  return isWeeklyAdaptiveReviewState(activeSkillState);
}

export function isWeeklyReviewActive(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): boolean {
  return Boolean(readWeeklyReviewState(args));
}

export function weeklyAdaptiveReviewStateForTurn(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
}): unknown {
  // Un weekly termine n'est plus une capture active: on l'ignore pour que le
  // routage reparte vers le global (et normal_reply sur une politesse).
  const activeIfNotTerminal = (value: unknown): Record<string, unknown> | null =>
    isWeeklyAdaptiveReviewState(value) && !isTerminalWeeklyReviewStatus(value)
      ? value
      : null;

  const fromActiveSkill = activeIfNotTerminal(args.activeSkillState);
  if (fromActiveSkill) return fromActiveSkill;
  const temp = args.tempMemory && typeof args.tempMemory === "object"
    ? args.tempMemory as Record<string, unknown>
    : {};
  const fromCanonicalKey = activeIfNotTerminal(temp[ACTIVE_CONVERSATION_SKILL_KEY]);
  if (fromCanonicalKey) return fromCanonicalKey;
  const fromLegacyKey = activeIfNotTerminal(temp.__active_skill_state);
  if (fromLegacyKey) return fromLegacyKey;
  const fromLegacyKey2 = activeIfNotTerminal(temp.active_skill_state);
  if (fromLegacyKey2) return fromLegacyKey2;
  const suspended = temp.__suspended_flow_v1;
  if (
    suspended &&
    typeof suspended === "object"
  ) {
    const fromSuspended = activeIfNotTerminal((suspended as any).state_snapshot);
    if (fromSuspended) return fromSuspended;
  }
  return null;
}

export function readWeeklyReviewState(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): unknown {
  return weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
}

export function writeWeeklyReviewState(
  tempMemory: any,
  weeklyState: Record<string, unknown>,
): any {
  const next = { ...(tempMemory ?? {}) };
  next[ACTIVE_CONVERSATION_SKILL_KEY] = weeklyState;
  next.__active_skill_state = weeklyState;
  delete next.active_skill_state;
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewState(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function clearWeeklyReviewState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  if (isWeeklyAdaptiveReviewState(next[ACTIVE_CONVERSATION_SKILL_KEY])) {
    delete next[ACTIVE_CONVERSATION_SKILL_KEY];
  }
  if (isWeeklyAdaptiveReviewState(next.__active_skill_state)) {
    delete next.__active_skill_state;
  }
  if (isWeeklyAdaptiveReviewState(next.active_skill_state)) {
    delete next.active_skill_state;
  }
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewState(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function updateWeeklyReviewStateAfterTurn(args: {
  tempMemory: any;
  activeSkillState: unknown;
  userMessage: string;
  responseContent: string;
  routeDecision: RouteDecision | null;
}): any {
  void args.activeSkillState;
  void args.userMessage;
  void args.responseContent;
  void args.routeDecision;
  return args.tempMemory;
}

export const updateWeeklyAdaptiveReviewStateAfterConversationTurn =
  updateWeeklyReviewStateAfterTurn;
