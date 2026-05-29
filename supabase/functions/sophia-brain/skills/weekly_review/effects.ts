import type { WeeklyOperationRuntimeResult } from "./contract.ts";
import { writeWeeklyReviewState } from "./state.ts";

function normalizeRouteText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

export type WeeklyRuntimeEffectMarker =
  | {
    status: "committed";
    effect: "adjust_plan_item";
    operation_id?: unknown;
    plan_patch_id?: unknown;
  }
  | { status: "not_committed"; reason: string };

export function weeklyRuntimeEffectFromOperation(
  operationRuntime: WeeklyOperationRuntimeResult,
): WeeklyRuntimeEffectMarker {
  if (
    operationRuntime.toolExecution === "success" &&
    operationRuntime.executedTools.includes("adjust_plan_item")
  ) {
    return {
      status: "committed",
      effect: "adjust_plan_item",
      operation_id: operationRuntime.toolSkillRun?.operation_id,
      plan_patch_id: operationRuntime.toolSkillRun?.plan_patch_id,
    };
  }
  return {
    status: "not_committed",
    reason: operationRuntime.toolExecution === "success"
      ? "adjust_plan_item_not_executed"
      : `tool_execution_${operationRuntime.toolExecution}`,
  };
}

export function markWeeklyAdaptiveReviewAdjustPlanApplied(args: {
  tempMemory: any;
  weeklyState: unknown;
  operationRuntime: WeeklyOperationRuntimeResult;
  userMessage?: string;
  assistantSummary?: string;
}): any {
  const effect = weeklyRuntimeEffectFromOperation(args.operationRuntime);
  if (
    !args.weeklyState || typeof args.weeklyState !== "object" ||
    effect.status !== "committed"
  ) {
    return args.tempMemory;
  }
  const previous = args.weeklyState as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const userAskedWeeklyReturn = (
    /\b(reviens|retourne|reprends|conclus|conclure|termine|terminer)\b/
      .test(normalizeRouteText(args.userMessage ?? "")) &&
    /\b(weekly|bilan|semaine)\b/.test(
      normalizeRouteText(args.userMessage ?? ""),
    )
  ) ||
    /\bvalidation\b[\s\S]{0,60}\b(dispo|disponible|debloquee|ouverte)\b/.test(
      normalizeRouteText(args.userMessage ?? ""),
    );
  const flow = previous.weekly_flow_state &&
      typeof previous.weekly_flow_state === "object"
    ? previous.weekly_flow_state as Record<string, unknown>
    : {};
  const nextFlow: Record<string, unknown> = {
    ...flow,
    status: userAskedWeeklyReturn ? "completed" : "adjustment_applied",
    proposal_status: "applied_via_adjust_plan_item",
    validation_unlock_status: userAskedWeeklyReturn
      ? "available"
      : "locked_until_weekly_complete",
    adjusted_at: nowIso,
    adjusted_plan_patch_id: effect.plan_patch_id ?? null,
    adjusted_operation_id: effect.operation_id ?? null,
    updated_at: nowIso,
  };
  if (userAskedWeeklyReturn) {
    nextFlow.completed_at = nowIso;
    const text = normalizeRouteText(args.userMessage ?? "");
    nextFlow.next_weekly_summary = buildInternalNextWeeklySummary({
      userMessage: args.userMessage,
      assistantSummary: args.assistantSummary,
      copyForward:
        /\b(identique|a l identique|copie conforme|meme rythme|memes actions?|prolongation|prolonge)\b/
          .test(text),
      replacement:
        /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
          .test(text) &&
        /\b(action|niveau|respiration|pause)\b/.test(text),
    });
  }
  return writeWeeklyReviewState(args.tempMemory, {
    ...previous,
    status: userAskedWeeklyReturn ? "completed" : "open",
    weekly_flow_state: nextFlow,
    validation_unlock: {
      status: userAskedWeeklyReturn
        ? "available"
        : "locked_until_weekly_complete",
      meaning: userAskedWeeklyReturn
        ? "La validation de la semaine suivante est disponible apres conclusion du point weekly."
        : "Un ajustement a ete applique pendant le weekly; la validation se debloque quand le point weekly est conclu.",
    },
    updated_at: nowIso,
  });
}
