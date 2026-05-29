import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import {
  isWeeklyAdaptiveReviewActive as isWeeklyAdaptiveReviewActiveFromBridge,
  weeklyAdaptiveReviewStateForTurn
    as weeklyAdaptiveReviewStateForTurnFromBridge,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";

function normalizeRouteText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactWeeklySummaryText(value: unknown, maxChars = 420): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildInternalNextWeeklySummary(args: {
  userMessage?: string | null;
  assistantSummary?: string | null;
  copyForward?: boolean;
  replacement?: boolean;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  if (args.copyForward) {
    return {
      source: "weekly_adaptive_review_v1",
      created_at: nowIso,
      user_signal: args.userMessage ?? null,
      assistant_summary: args.assistantSummary ?? null,
      internal_summary:
        "La semaine suivante a ete prolongee a l'identique: memes actions, meme rythme, plan global inchange.",
      suggested_opening_question:
        "Est-ce que refaire la meme semaine a l'identique t'a aide a obtenir un signal plus clair pour decider si on passe a la suite ?",
      user_visible: false,
    };
  }
  if (args.replacement) {
    return {
      source: "weekly_adaptive_review_v1",
      created_at: nowIso,
      user_signal: args.userMessage ?? null,
      assistant_summary: args.assistantSummary ?? null,
      internal_summary:
        "Une action a ete ajustee pendant le weekly; verifier si le nouveau format a mieux tenu.",
      suggested_opening_question:
        "Est-ce que l'action ajustee a rendu la semaine plus facile a tenir concretement ?",
      user_visible: false,
    };
  }
  return {
    source: "weekly_adaptive_review_v1",
    created_at: nowIso,
    user_signal: args.userMessage ?? null,
    assistant_summary: args.assistantSummary ?? null,
    internal_summary:
      "Weekly conclu; verifier si l'organisation choisie pour la semaine suivante a ete tenable.",
    suggested_opening_question:
      "Est-ce que l'organisation choisie la semaine derniere a ete tenable dans la vraie semaine ?",
    user_visible: false,
  };
}

function weeklyUserAskedConcreteOrganization(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\borganisation concrete\b|\borganiser concretement\b|\bconcretement\b|\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\bjours?\b|\bordre\b|\bcharge\b/
    .test(text) &&
    /\bsemaine prochaine\b|\borganisation\b|\bplan\b|\bactions?\b|\bhabitudes?\b|\bmissions?\b|\bcharge\b|\bjours?\b/
      .test(text);
}

function weeklyResponseHasOrganizationProposal(response: string): boolean {
  const text = normalizeRouteText(response);
  return /\bproposition d organisation\b|\borganisation de la semaine prochaine\b|\bvoila une proposition\b|\bje te propose\b/
    .test(text);
}

function weeklyResponseConcludesReview(response: string): boolean {
  const text = normalizeRouteText(response);
  if (/\bvalidation\b[\s\S]{0,80}\bpas encore\b/.test(text)) return false;
  return (
    /\b(point weekly|point de fin de semaine|bilan de la semaine)\b[\s\S]{0,120}\b(termine|terminee|conclu|cloture|cloturee)\b/
      .test(text) ||
    /\bvalidation de la semaine prochaine\b[\s\S]{0,80}\b(disponible|debloquee|ouverte)\b/
      .test(text)
  );
}

export function isWeeklyAdaptiveReviewActive(
  activeSkillState: unknown,
): boolean {
  return isWeeklyAdaptiveReviewActiveFromBridge(activeSkillState);
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
  return weeklyAdaptiveReviewStateForTurnFromBridge(args);
}

export function readWeeklyReviewState(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): unknown {
  return weeklyAdaptiveReviewStateForTurnFromBridge({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
}

export function writeWeeklyReviewState(
  tempMemory: any,
  weeklyState: Record<string, unknown>,
): any {
  const next = { ...(tempMemory ?? {}) };
  next.__active_skill_state = weeklyState;
  delete next.active_skill_state;
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewActiveFromBridge(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function clearWeeklyReviewState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  if (isWeeklyAdaptiveReviewActiveFromBridge(next.__active_skill_state)) {
    delete next.__active_skill_state;
  }
  if (isWeeklyAdaptiveReviewActiveFromBridge(next.active_skill_state)) {
    delete next.active_skill_state;
  }
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewActiveFromBridge(
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
  const weeklyState = weeklyAdaptiveReviewStateForTurnFromBridge({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState || typeof weeklyState !== "object") return args.tempMemory;
  const previous = weeklyState as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const flow = previous.weekly_flow_state &&
      typeof previous.weekly_flow_state === "object"
    ? previous.weekly_flow_state as Record<string, unknown>
    : {};
  const nextFlow: Record<string, unknown> = {
    ...flow,
    status: String(flow.status ?? "open"),
    proposal_status: String(flow.proposal_status ?? "none"),
    validation_unlock_status: String(
      flow.validation_unlock_status ?? "locked_until_weekly_complete",
    ),
    updated_at: nowIso,
  };

  const isWeeklyConversation =
    args.routeDecision?.response_owner === "conversation_handler" &&
    String(args.routeDecision?.selected_handler ?? "").trim() ===
      "weekly_adaptive_review_v1";
  if (
    isWeeklyConversation &&
    (weeklyUserAskedConcreteOrganization(args.userMessage) ||
      weeklyResponseHasOrganizationProposal(args.responseContent))
  ) {
    nextFlow.status = "proposal_discussed";
    nextFlow.proposal_status = "discussed_not_applied";
    nextFlow.last_user_signal = compactWeeklySummaryText(args.userMessage);
    nextFlow.last_proposal_summary = compactWeeklySummaryText(
      args.responseContent,
    );
  }

  if (weeklyResponseConcludesReview(args.responseContent)) {
    nextFlow.status = "completed";
    nextFlow.validation_unlock_status = "available";
    nextFlow.completed_at = nowIso;
    nextFlow.next_weekly_summary = buildInternalNextWeeklySummary({
      userMessage: compactWeeklySummaryText(args.userMessage),
      assistantSummary: compactWeeklySummaryText(args.responseContent),
    });
  }

  const nextState: Record<string, unknown> = {
    ...previous,
    status: nextFlow.status === "completed" ? "completed" : "open",
    validation_unlock: nextFlow.validation_unlock_status === "available"
      ? {
        status: "available",
        meaning:
          "La validation de la semaine suivante est disponible apres conclusion du point weekly.",
      }
      : previous.validation_unlock,
    weekly_flow_state: nextFlow,
    updated_at: nowIso,
  };
  const nextMemory = writeWeeklyReviewState(args.tempMemory, nextState);
  if (nextFlow.status === "completed") {
    nextMemory.__last_weekly_adaptive_review_summary =
      nextFlow.next_weekly_summary;
  }
  return nextMemory;
}

export const updateWeeklyAdaptiveReviewStateAfterConversationTurn =
  updateWeeklyReviewStateAfterTurn;
