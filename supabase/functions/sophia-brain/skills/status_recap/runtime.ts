/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import { clearToolSkillFlowForDirectReminder } from "../../router/active_flow_state.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { SUPPORTED_COACH_PREFERENCE_KEYS } from "../../tools/operations/update_coach_preferences/status.ts";
import { loadStatusRecapProjection } from "./projection.ts";
import {
  decideStatusRecap,
  isFaitPrevuFragileRecapRequest,
} from "./reducer.ts";
import { renderStatusRecapDecision } from "./renderer.ts";
import type {
  StatusRecapLocalDispatcher,
  StatusRecapReducerResult,
} from "./local_flow.ts";
import {
  hasActiveStatusRecapFlow,
  readStatusRecapFlowState,
  reduceStatusRecapLocalDispatcherOutput,
  runStatusRecapLocalDispatcher,
  STATUS_RECAP_EXIT_MEMO_KEY,
  statusRecapProjectionSummary,
  writeStatusRecapFlowState,
} from "./local_flow.ts";
import type { StatusRecapVisibleAgent } from "./visible_agent.ts";
import { runStatusRecapVisibleAgent } from "./visible_agent.ts";
import type { StatusRecapProjection } from "./contract.ts";

export { isFaitPrevuFragileRecapRequest } from "./reducer.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function operationType(value: unknown): string {
  return isRecord(value) ? String(value.operation_type ?? "").trim() : "";
}

function hasActiveCardDraft(activeOperationIntake: unknown): boolean {
  const type = operationType(activeOperationIntake);
  return type === "prepare_attack_card" || type === "prepare_defense_card";
}

function routeIsSafety(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "safety" ||
    routeDecision?.selected_handler === "safety_crisis";
}

function routeIsProductHelp(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "product_help" ||
    routeDecision?.selected_handler === "product_help";
}

function routeIsExplicitToolCommand(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  activeOperationIntake: unknown;
}): boolean {
  if (operationType(args.activeOperationIntake)) return true;
  if (args.routeDecision?.response_owner === "tool_skill") return true;
  if (
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== "status_only_no_mutation_check" &&
    args.routeDecision.selected_handler !== "product_help"
  ) {
    const handler = args.routeDecision.selected_handler;
    if (
      handler.includes("reminder") ||
      handler.includes("card") ||
      handler.includes("potion") ||
      handler.includes("plan") ||
      handler.includes("coach_preferences")
    ) return true;
  }
  return Boolean(args.turnFrame?.tool_skill_intents?.length);
}

function statusRecapRouteSignal(routeDecision: RouteDecision | null): boolean {
  if (!routeDecision) return false;
  if (routeDecision.selected_handler === "status_only_no_mutation_check") {
    return true;
  }
  if (
    routeDecision.reason_code.includes("status_only") ||
    routeDecision.reason_code.includes("recap")
  ) return true;
  return routeDecision.blocked_paths.some((path) =>
    path.reason_code.includes("status_only") ||
    path.reason_code.includes("recap")
  );
}

function recentMessagesFromHistory(
  history: unknown,
): Array<{ role: "user" | "assistant"; content: string }> {
  return Array.isArray(history)
    ? history.flatMap((message) => {
      const role = String((message as any)?.role ?? "");
      const content = String((message as any)?.content ?? "").trim();
      if ((role === "user" || role === "assistant") && content) {
        return [{ role: role as "user" | "assistant", content }];
      }
      return [];
    }).slice(-8)
    : [];
}

function exitMemoForTempMemory(args: {
  reduced: StatusRecapReducerResult;
  decision: NonNullable<
    Awaited<ReturnType<StatusRecapLocalDispatcher>>
  >;
}) {
  return {
    ...args.decision.exit_memo,
    at: new Date().toISOString(),
    reducer_reason_code: args.reduced.reason_code,
  };
}

function compatProjectionFromVisibleFacts(input: any): StatusRecapProjection {
  return {
    attack_cards: input.grounded_facts_json?.facts?.attack_cards ?? [],
    defense_cards: input.grounded_facts_json?.facts?.defense_cards ?? [],
    one_shot_reminders: input.grounded_facts_json?.facts?.one_shot_reminders ??
      { pending: [], cancelled_recent: [] },
    recurring_reminders:
      input.grounded_facts_json?.facts?.recurring_reminders ?? [],
    potion_sessions: input.grounded_facts_json?.facts?.potion_sessions ?? [],
    coach_preferences: input.grounded_facts_json?.facts?.coach_preferences ??
      [],
    recent_effect_history:
      input.grounded_facts_json?.facts?.recent_effect_history ?? [],
  };
}

function compatStatusDispatcher(
  action: "answer_status" | "answer_fait_prevu_fragile",
): StatusRecapLocalDispatcher {
  return async () => ({
    flow_action: action,
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: action === "answer_fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : "durable_status",
      summary: "legacy status recap wrapper",
      requires_db_projection: true,
      requires_effect_history: false,
    },
    target_objects: ["unknown"],
    read_scope: {
      requested_categories: ["all"],
      include_cancelled: false,
      include_recent_failed_or_blocked_effects: false,
      format: action === "answer_fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : "compact",
    },
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: action === "answer_fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : "status_compact",
      instruction: "legacy wrapper",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: null,
        last_target_objects: [],
        last_answer_summary: null,
        last_projection_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["legacy_wrapper"],
  });
}

function compatStatusVisibleAgent(
  intent: "durable_status" | "fait_prevu_fragile",
): StatusRecapVisibleAgent {
  return async (input) => {
    const projection = compatProjectionFromVisibleFacts(input);
    const decision = renderStatusRecapDecision({
      projection,
      decision: decideStatusRecap({
        userMessage: input.user_message,
        turnFrame: null,
        routeDecision: {
          route_version: "v1",
          response_owner: "normal_reply",
          selected_handler: "status_only_no_mutation_check",
          blocked_paths: [],
          direct_effects_to_run: [],
          reason_code: intent === "fait_prevu_fragile"
            ? "recap_fait_prevu_fragile"
            : "status_only_no_mutation_check",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        },
        projection,
      }),
    });
    return decision.reply;
  };
}

export async function maybeRunStatusRecapRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  activeOperationIntake: unknown;
  history?: unknown;
  requestId?: string | null;
  runLocalDispatcher?: StatusRecapLocalDispatcher;
  runVisibleAgent?: StatusRecapVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const activeStatusFlow = hasActiveStatusRecapFlow(args.tempMemory);
  if (routeIsSafety(args.routeDecision)) return null;
  if (hasActiveCardDraft(args.activeOperationIntake)) return null;
  if (!activeStatusFlow && routeIsProductHelp(args.routeDecision)) return null;
  if (
    !activeStatusFlow &&
    routeIsExplicitToolCommand({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      activeOperationIntake: args.activeOperationIntake,
    })
  ) return null;

  const shouldActivate = activeStatusFlow ||
    statusRecapRouteSignal(args.routeDecision);
  if (!shouldActivate) return null;

  const projection = await loadStatusRecapProjection({
    supabase: args.supabase,
    userId: args.userId,
    userTimezone: args.userTimezone,
  });
  const previousState = readStatusRecapFlowState(args.tempMemory);
  const projectionSummary = statusRecapProjectionSummary(projection);
  const dispatcher = args.runLocalDispatcher ?? runStatusRecapLocalDispatcher;
  console.info("[StatusRecap] local_dispatcher_called", {
    active_status_flow: activeStatusFlow,
    projection_summary: projectionSummary,
  });
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: previousState,
    projection_summary: projectionSummary,
    last_answer_summary: previousState?.last_answer_summary ?? null,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
  });
  if (!decision) {
    return {
      content:
        "Je n'arrive pas à lire l'état correctement sur ce tour, donc je préfère ne rien affirmer.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "blocked",
        reason_code: "status_recap_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "status_recap",
          reason_code: "local_dispatcher_failed",
        }],
        toolExecution: "blocked",
        executedTools: [],
      },
    };
  }
  console.info("[StatusRecap] local_dispatcher_decision", {
    flow_action: decision.flow_action,
    status_intent_kind: decision.status_intent.kind,
    target_objects: decision.target_objects,
    visible_task_kind: decision.visible_task.kind,
    projection_used: decision.status_intent.requires_db_projection,
    projection_summary: projectionSummary,
    toolExecution: "none",
    executedTools: [],
  });
  const reduced = reduceStatusRecapLocalDispatcherOutput({
    previous: previousState,
    output: decision,
    projection,
  });
  if (reduced.exit_to_global_dispatcher) {
    const exitMemo = exitMemoForTempMemory({ reduced, decision });
    const nextTempMemory = {
      ...writeStatusRecapFlowState(args.tempMemory, reduced.local_state),
      [STATUS_RECAP_EXIT_MEMO_KEY]: exitMemo,
    };
    console.info("[StatusRecap] exit_to_global_dispatcher", {
      exit_memo_reason: decision.exit_memo.reason,
      global_dispatcher_second_pass_after_status_exit: true,
      toolExecution: "none",
      executedTools: [],
    });
    return {
      content: "",
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "topic_change",
        reason_code: reduced.reason_code,
        operation_suggestions: [],
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        exit_memo: exitMemo,
        flow_action: decision.flow_action,
        status_intent: decision.status_intent.kind,
        target_objects: decision.target_objects,
        visible_task: reduced.visible_task,
        projection_used: decision.status_intent.requires_db_projection,
        projection_summary: projectionSummary,
        toolExecution: "none",
        executedTools: [],
      },
    };
  }
  const visibleAgent = args.runVisibleAgent ?? runStatusRecapVisibleAgent;
  const visible = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: reduced.visible_task,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    local_state: reduced.local_state,
    grounded_facts_json: reduced.grounded_facts_json,
    dispatcher_instruction: decision.visible_task.instruction,
  });
  const content = String(visible ?? "").trim();
  if (!content) {
    return {
      content:
        "Je n'arrive pas à formuler le status correctement, donc je préfère ne rien affirmer.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "blocked",
        reason_code: "status_recap_visible_agent_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "status_recap",
          reason_code: "visible_agent_failed",
        }],
        toolExecution: "blocked",
        executedTools: [],
      },
    };
  }
  const explicitSupportedCoachPreferences = projection.coach_preferences.filter(
    (
      pref,
    ) =>
      pref.source_type !== "system_default" &&
      (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(pref.key),
  );
  const baseTempMemory = clearToolSkillFlowForDirectReminder(
    args.tempMemory ?? {},
  );
  const nextTempMemory = reduced.local_state?.status === "closed"
    ? writeStatusRecapFlowState(baseTempMemory, null)
    : writeStatusRecapFlowState(baseTempMemory, reduced.local_state);
  return {
    content,
    nextTempMemory,
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "status_recap",
      status: "answered",
      reason_code: reduced.reason_code,
      flow_action: decision.flow_action,
      projection_used: decision.status_intent.requires_db_projection,
      intent: decision.status_intent.kind,
      target_objects: decision.target_objects,
      visible_task: reduced.visible_task,
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      attack_card_found: projection.attack_cards.length > 0,
      defense_card_found: projection.defense_cards.length > 0,
      reminder_found: projection.one_shot_reminders.pending.length > 0,
      coach_preference_found: explicitSupportedCoachPreferences.length > 0,
      recent_effect_history_count: projection.recent_effect_history.length,
      projection_summary: projectionSummary,
      local_flow_state: reduced.local_state,
      evidence: reduced.evidence,
      toolExecution: "none",
      executedTools: [],
    },
  };
}

export async function buildStatusOnlyNoMutationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  userTimezone?: string;
  userMessage?: string;
}): Promise<OperationRuntimeResult> {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage ??
      "sans rien modifier, dis-moi ce qui existe vraiment",
    userTimezone: args.userTimezone ?? "Europe/Paris",
    tempMemory: args.tempMemory,
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "normal_reply",
      selected_handler: "status_only_no_mutation_check",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "status_only_no_mutation_check",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    activeOperationIntake: null,
    runLocalDispatcher: compatStatusDispatcher("answer_status"),
    runVisibleAgent: compatStatusVisibleAgent("durable_status"),
  });
  if (!runtime) throw new Error("status_recap_runtime_not_activated");
  return runtime;
}

export async function buildFaitPrevuFragileRecapRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userTimezone?: string;
  tempMemory?: any;
}): Promise<OperationRuntimeResult> {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: "fait / prévu / fragile",
    userTimezone: args.userTimezone ?? "Europe/Paris",
    tempMemory: args.tempMemory ?? {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "normal_reply",
      selected_handler: "status_only_no_mutation_check",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "recap_fait_prevu_fragile",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    activeOperationIntake: null,
    runLocalDispatcher: compatStatusDispatcher("answer_fait_prevu_fragile"),
    runVisibleAgent: compatStatusVisibleAgent("fait_prevu_fragile"),
  });
  if (!runtime) throw new Error("status_recap_fpf_runtime_not_activated");
  return runtime;
}
