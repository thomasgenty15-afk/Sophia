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

export async function maybeRunStatusRecapRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  activeOperationIntake: unknown;
}): Promise<OperationRuntimeResult | null> {
  if (routeIsSafety(args.routeDecision)) return null;
  if (routeIsProductHelp(args.routeDecision)) return null;
  if (hasActiveCardDraft(args.activeOperationIntake)) return null;
  if (
    routeIsExplicitToolCommand({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      activeOperationIntake: args.activeOperationIntake,
    })
  ) return null;

  const shouldActivate = statusRecapRouteSignal(args.routeDecision);
  if (!shouldActivate) return null;

  const projection = await loadStatusRecapProjection({
    supabase: args.supabase,
    userId: args.userId,
    userTimezone: args.userTimezone,
  });
  const decisionDraft = decideStatusRecap({
    userMessage: args.userMessage,
    turnFrame: args.turnFrame,
    routeDecision: args.routeDecision,
    projection,
  });
  if (
    decisionDraft.intent === "unclear" ||
    decisionDraft.intent === "human_recap_no_db"
  ) return null;

  const decision = renderStatusRecapDecision({
    decision: decisionDraft,
    projection,
  });
  const explicitSupportedCoachPreferences = projection.coach_preferences.filter(
    (
      pref,
    ) =>
      pref.source_type !== "system_default" &&
      (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(pref.key),
  );
  return {
    content: decision.reply,
    nextTempMemory: clearToolSkillFlowForDirectReminder(args.tempMemory ?? {}),
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "status_recap",
      status: "answered",
      projection_used: decision.projection_used,
      intent: decision.intent,
      target_objects: decision.target_objects,
      operation_suggestions: [],
      attack_card_found: projection.attack_cards.length > 0,
      defense_card_found: projection.defense_cards.length > 0,
      reminder_found: projection.one_shot_reminders.pending.length > 0,
      coach_preference_found: explicitSupportedCoachPreferences.length > 0,
      recent_effect_history_count: projection.recent_effect_history.length,
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
  });
  if (!runtime) throw new Error("status_recap_fpf_runtime_not_activated");
  return runtime;
}
