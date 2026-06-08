/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../../../contracts/skill_output.v1.ts";
import { PRODUCT_SURFACE_DEFINITIONS } from "../../../product_surface_registry/surfaces_data.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import { runProductHelpSkill } from "../../../skills/product_help/skill.ts";
import { maybeRunStatusRecapRuntime } from "../../../skills/status_recap/runtime.ts";
import type { StatusRecapLocalDispatcher } from "../../../skills/status_recap/local_flow.ts";
import type {
  CoachPreferenceLocalDispatcherOutput,
  CoachPreferenceLocalUpdate,
  CoachPreferenceVisibleTaskKind,
  UpdateCoachPreferencesCommittedEffect,
} from "./contract.ts";
import {
  type CoachPreferenceLocalDispatcher,
  createCoachPreferenceLocalFlowState,
  reduceCoachPreferenceLocalDispatcherOutput,
  runCoachPreferenceLocalDispatcher,
} from "./local_flow.ts";
import {
  clearCoachPreferenceFrame,
  type CoachPreferenceLocalFlowState,
  isActiveCoachPreferenceLocalFlowState,
  loadCoachPreferenceFrameFromTempMemory,
  writeCoachPreferenceLocalFlowState,
} from "./state.ts";
import {
  buildCoachPreferencesStatusReply,
  loadCurrentCoachPreferenceRows,
  upsertCoachPreferencesFromLockedUpdates,
} from "./status.ts";
import {
  type CoachPreferenceVisibleAgent,
  runCoachPreferenceVisibleAgent,
} from "./visible_agent.ts";

export { detectsCoachPreferenceDirectionContradictionForSkill } from "./route_guards.ts";

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain"
    | "platform_handoff";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

type ProductHelpSubskillRunner = (args: {
  userMessage: string;
  userId: string;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeState: CoachPreferenceLocalFlowState | null;
}) => Promise<ConversationSkillOutput | null>;

type StatusRecapSubskillRunner = (args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  history?: unknown;
  requestId?: string | null;
}) => Promise<OperationRuntimeResult | null>;

function recentMessagesFromHistory(history: unknown): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message: any) =>
      (message?.role === "user" || message?.role === "assistant") &&
      typeof message?.content === "string" && message.content.trim()
    )
    .map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content),
    }))
    .slice(-8);
}

function minimalTurnFrame(args: {
  userId: string;
  userMessage: string;
  turnFrame: TurnFrame | null;
}): TurnFrame {
  if (args.turnFrame) return args.turnFrame;
  return {
    turn_id: crypto.randomUUID(),
    source_message_id: crypto.randomUUID(),
    user_id: args.userId,
    channel: "web",
    safety: {
      risk_band: "none",
      reason_codes: [],
      evidence: [],
    },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_only",
    },
  };
}

function appendCoachPreferenceSubskillHistory(args: {
  state: CoachPreferenceLocalFlowState | null;
  skillId: "status_recap" | "product_help";
  reason: string;
  userMessage: string;
  summary?: string | null;
}): CoachPreferenceLocalFlowState | null {
  if (!args.state) return null;
  const history = [
    ...(args.state.subskill_history ?? []),
    {
      skill_id: args.skillId,
      reason: args.reason,
      user_message: args.userMessage,
      summary: args.summary ?? null,
      created_at: new Date().toISOString(),
    },
  ].slice(-8);
  return {
    ...args.state,
    subskill_history: history,
    updated_at: new Date().toISOString(),
  };
}

function coachPreferenceStatusDispatcher(): StatusRecapLocalDispatcher {
  return async () => ({
    flow_action: "answer_coach_preferences_status",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "coach_preferences_status",
      summary:
        "Question inline sur les preferences coach pendant update_coach_preferences.",
      requires_db_projection: true,
      requires_effect_history: false,
    },
    target_objects: ["coach_preference"],
    read_scope: {
      requested_categories: ["coach_preferences"],
      include_cancelled: false,
      include_recent_failed_or_blocked_effects: false,
      format: "object_answer",
    },
    state_updates: {
      status: "closed",
      turn_count_increment: 1,
      close_after_visible: true,
    },
    visible_task: {
      kind: "coach_preferences_status",
      instruction:
        "Restituer les preferences coach actuelles depuis la projection DB, sans proposer ni modifier.",
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
    evidence: ["update_coach_preferences_inline_status_question"],
  });
}

async function runDefaultCoachPreferenceStatusSubskill(
  args: Parameters<StatusRecapSubskillRunner>[0],
): Promise<OperationRuntimeResult | null> {
  return await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: {},
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
    history: args.history,
    requestId: args.requestId ?? null,
    runLocalDispatcher: coachPreferenceStatusDispatcher(),
  });
}

async function runDefaultCoachPreferenceProductHelpSubskill(
  args: Parameters<ProductHelpSubskillRunner>[0],
): Promise<ConversationSkillOutput | null> {
  return await runProductHelpSkill({
    user_message: args.userMessage,
    context: {
      skill_id: "product_help",
      user_id: args.userId,
      recent_messages: args.recentMessages,
      active_skill_working_state: {
        origin_flow: "update_coach_preferences",
        active_state: args.activeState,
        preserve_active_flow: true,
      } as any,
      turn_frame: minimalTurnFrame({
        userId: args.userId,
        userMessage: args.userMessage,
        turnFrame: args.turnFrame,
      }),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: PRODUCT_SURFACE_DEFINITIONS as unknown as Array<
        Record<string, unknown>
      >,
      exclusions: [],
    },
  });
}

function activeLocalFlow(
  tempMemory: unknown,
): CoachPreferenceLocalFlowState | null {
  const frame = loadCoachPreferenceFrameFromTempMemory(tempMemory);
  if (isActiveCoachPreferenceLocalFlowState(frame.local_flow)) {
    return frame.local_flow;
  }
  return null;
}

function routeIsSelected(args: {
  operationType: "update_coach_preferences";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  if (activeLocalFlow(args.tempMemory)) return true;
  const frame = loadCoachPreferenceFrameFromTempMemory(args.tempMemory);
  const legacyHandoffOperation = String(
    (frame.handoff as any)?.operation_type ??
      (frame.handoff as any)?.skill_id ??
      "",
  ).trim();
  if (legacyHandoffOperation === args.operationType) return true;
  const active = frame.active;
  const activeOperation = String(
    (active as any)?.operation_type ?? (active as any)?.skill_id ?? "",
  ).trim();
  if (activeOperation === args.operationType) return true;
  if (activeOperation) return false;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function runtimeTraceBase(args: {
  event: string;
  flowAction?: string | null;
  visibleTask?: string | null;
  preferenceUpdates?: CoachPreferenceLocalUpdate[];
  writeAttempted?: boolean;
  writeCommitted?: boolean;
  writeBlockedReason?: string | null;
  committedEffects?: UpdateCoachPreferencesCommittedEffect[];
}) {
  return {
    component: "update_coach_preferences.local_flow",
    event: args.event,
    flow_action: args.flowAction ?? null,
    visible_task_kind: args.visibleTask ?? null,
    preference_updates: args.preferenceUpdates ?? [],
    write_attempted: args.writeAttempted ?? false,
    write_committed: args.writeCommitted ?? false,
    write_blocked_reason: args.writeBlockedReason ?? null,
    committed_effects: args.committedEffects ?? [],
  };
}

function fallbackVisibleMessage(args: {
  stage: CoachPreferenceVisibleTaskKind;
  committed: boolean;
  statusReply?: string | null;
}): string {
  if (args.stage === "get_info_db" && args.statusReply) {
    return args.statusReply;
  }
  if (args.stage === "preference_saved" && args.committed) {
    return "C'est noté pour tes préférences coach.";
  }
  if (args.stage === "punctual_instruction_ack") {
    return "Je le prends pour cette réponse seulement, sans modifier tes préférences durables.";
  }
  if (args.stage === "unsupported_preference") {
    return "Je ne peux pas enregistrer cette demande comme préférence coach durable telle quelle.";
  }
  if (args.stage === "get_info_product") {
    return "Les préférences coach couvrent trois réglages durables : le ton, le niveau de challenge et la tendance à poser des questions.";
  }
  if (args.stage === "ask_durable_vs_punctual") {
    return "Tu veux que ce soit seulement pour maintenant, ou comme préférence durable pour la suite ?";
  }
  if (args.stage === "confirm_supported_mapping") {
    return "Je peux traduire ça vers un réglage coach supporté. Tu veux que je le note comme préférence durable ?";
  }
  if (args.stage === "exit_or_cancel") {
    return "Ok, je mets ce changement de préférence de côté.";
  }
  if (args.stage === "safety") {
    return "Je ne modifie pas tes préférences sur ce point.";
  }
  return "Je ne peux pas appliquer ce changement de préférence tel quel.";
}

async function runCoachPreferenceLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  history?: unknown;
  dispatcher?: CoachPreferenceLocalDispatcher;
  visibleAgent?: CoachPreferenceVisibleAgent;
  statusRecapSubskill?: StatusRecapSubskillRunner;
  productHelpSubskill?: ProductHelpSubskillRunner;
}): Promise<OperationRuntimeResult | null> {
  const runtimeTrace: Array<Record<string, unknown>> = [];
  const previousState = activeLocalFlow(args.tempMemory) ??
    createCoachPreferenceLocalFlowState({});
  runtimeTrace.push(runtimeTraceBase({
    event: "local_dispatcher_called",
    preferenceUpdates: previousState.proposed_updates,
  }));

  const currentPreferences = await loadCurrentCoachPreferenceRows({
    supabase: args.supabase,
    userId: args.userId,
  });
  const dispatcher = args.dispatcher ?? runCoachPreferenceLocalDispatcher;
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: previousState,
    current_preferences: currentPreferences,
    safety_risk_band: String(args.safetyPregateOutput.risk_band ?? "none"),
  });

  if (!decision) {
    return {
      content:
        "Je n'arrive pas à traiter ce changement de préférence correctement pour l'instant.",
      nextTempMemory: args.tempMemory,
      toolExecution: "failed",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        operation_type: "update_coach_preferences",
        mode: "local_write_flow",
        status: "failed",
        reason_code: "update_coach_preferences_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "local_dispatcher",
          reason_code: "update_coach_preferences_local_dispatcher_failed",
        }],
        pending_confirmation: null,
        runtime_trace: runtimeTrace,
      },
    };
  }

  runtimeTrace.push(runtimeTraceBase({
    event: "local_dispatcher_decision",
    flowAction: decision.flow_action,
    visibleTask: decision.visible_task.kind,
    preferenceUpdates: decision.preference_updates,
  }));

  const reduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous: previousState,
    output: decision,
  });
  runtimeTrace.push(runtimeTraceBase({
    event: "reducer_validated",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    preferenceUpdates: reduced.write_updates.length
      ? reduced.write_updates
      : reduced.local_state?.proposed_updates ?? [],
    writeBlockedReason: reduced.blocked_effects[0]?.reason_code ?? null,
  }));

  if (reduced.exit_to_global_dispatcher) {
    const exitMemo = {
      reason: decision.exit_memo.reason,
      flow_summary: decision.exit_memo.flow_summary,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo.handoff_hint_for_global_dispatcher,
      at: new Date().toISOString(),
    };
    const cleared = {
      ...clearCoachPreferenceFrame(args.tempMemory),
      __last_update_coach_preferences_exit_memo: exitMemo,
    };
    runtimeTrace.push(runtimeTraceBase({
      event: "exit_to_global_dispatcher",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
    }));
    return {
      content: "",
      nextTempMemory: cleared,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        operation_type: "update_coach_preferences",
        mode: "local_write_flow",
        status: "topic_change",
        reason_code: "update_coach_preferences_local_exit_to_global_dispatcher",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        exit_memo: exitMemo,
        runtime_trace: runtimeTrace,
      },
    };
  }

  let committedEffects: UpdateCoachPreferencesCommittedEffect[] = [];
  let committedUpdateIds: string[] = [];
  let writeError: string | null = null;
  if (reduced.write_updates.length > 0) {
    runtimeTrace.push(runtimeTraceBase({
      event: "write_attempted",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      preferenceUpdates: reduced.write_updates,
      writeAttempted: true,
    }));
    const written = await upsertCoachPreferencesFromLockedUpdates({
      supabase: args.supabase,
      userId: args.userId,
      updates: reduced.write_updates,
      sourceMessageId: args.sourceMessageId ?? args.requestId ?? null,
      reason: decision.preference_intent.summary,
    });
    if (written.error) {
      writeError = String((written.error as any)?.message ?? "write_failed");
      runtimeTrace.push(runtimeTraceBase({
        event: "write_blocked",
        flowAction: decision.flow_action,
        visibleTask: "write_failed_or_blocked",
        preferenceUpdates: reduced.write_updates,
        writeAttempted: true,
        writeCommitted: false,
        writeBlockedReason: writeError,
      }));
    } else {
      committedUpdateIds = ((written.data as any)?.ids ??
        (written.data as any)?.keys ?? []) as string[];
      committedEffects = [{
        type: "update_coach_preferences",
        operation_id: args.requestId ?? crypto.randomUUID(),
        preference_keys: reduced.write_updates.map((update) => update.key),
        preferences_update_ids: committedUpdateIds,
      }];
      runtimeTrace.push(runtimeTraceBase({
        event: "write_committed",
        flowAction: decision.flow_action,
        visibleTask: reduced.visible_task,
        preferenceUpdates: reduced.write_updates,
        writeAttempted: true,
        writeCommitted: true,
        committedEffects,
      }));
    }
  }

  const committed = committedEffects.length > 0;
  const visibleTask: CoachPreferenceVisibleTaskKind = writeError
    ? "write_failed_or_blocked"
    : reduced.visible_task === "preference_saved" && !committed
    ? "write_failed_or_blocked"
    : reduced.visible_task;
  const baseNextLocalState = committed
    ? null
    : reduced.status === "cancelled"
    ? null
    : reduced.local_state;
  if (visibleTask === "get_info_db" && !committed && !writeError) {
    const statusRunner = args.statusRecapSubskill ??
      runDefaultCoachPreferenceStatusSubskill;
    runtimeTrace.push(runtimeTraceBase({
      event: "get_info_db_called",
      flowAction: decision.flow_action,
      visibleTask,
    }));
    const statusRuntime = await statusRunner({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      tempMemory: args.tempMemory,
      history: args.history,
      requestId: args.requestId ?? null,
    });
    if (statusRuntime?.content?.trim()) {
      const nextLocalState = appendCoachPreferenceSubskillHistory({
        state: baseNextLocalState,
        skillId: "status_recap",
        reason: "inline_get_info_db_coach_preferences_status_question",
        userMessage: args.userMessage,
        summary: String(statusRuntime.toolSkillRun?.reason_code ?? ""),
      });
      const nextTempMemory = writeCoachPreferenceLocalFlowState(
        clearCoachPreferenceFrame(args.tempMemory),
        nextLocalState,
      );
      runtimeTrace.push(runtimeTraceBase({
        event: "get_info_db_returned_to_flow",
        flowAction: decision.flow_action,
        visibleTask,
      }));
      return {
        content: statusRuntime.content,
        additionalContents: statusRuntime.additionalContents,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          operation_type: "update_coach_preferences",
          mode: "local_write_flow",
          status: reduced.status,
          reason_code: reduced.reason_code,
          flow_action: decision.flow_action,
          visible_task_kind: visibleTask,
          preference_updates: decision.preference_updates,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: reduced.blocked_effects,
          pending_confirmation: null,
          local_flow_state: nextLocalState,
          subskill_run: {
            skill_id: "status_recap",
            selected_handler: statusRuntime.toolSkillRun?.selected_handler ??
              "status_recap",
            toolExecution: statusRuntime.toolExecution,
            executedTools: statusRuntime.executedTools,
            reason_code: statusRuntime.toolSkillRun?.reason_code ?? null,
          },
          write_attempted: false,
          write_committed: false,
          write_blocked_reason: null,
          debug: {
            reason_code: reduced.reason_code,
            evidence: reduced.evidence,
          },
          runtime_trace: runtimeTrace,
        },
      };
    }
  }
  if (visibleTask === "get_info_product" && !committed && !writeError) {
    const productRunner = args.productHelpSubskill ??
      runDefaultCoachPreferenceProductHelpSubskill;
    runtimeTrace.push(runtimeTraceBase({
      event: "get_info_product_called",
      flowAction: decision.flow_action,
      visibleTask,
    }));
    const productHelp = await productRunner({
      userMessage: args.userMessage,
      userId: args.userId,
      turnFrame: args.turnFrame,
      recentMessages: recentMessagesFromHistory(args.history),
      activeState: baseNextLocalState,
    });
    const productContent = String(
      productHelp?.reply ?? productHelp?.generated_user_message ?? "",
    ).trim();
    if (productContent) {
      const nextLocalState = appendCoachPreferenceSubskillHistory({
        state: baseNextLocalState,
        skillId: "product_help",
        reason: "inline_get_info_product_coach_preferences_product_explanation",
        userMessage: args.userMessage,
        summary: String(productHelp?.diagnosis?.feature_id ?? ""),
      });
      const nextTempMemory = writeCoachPreferenceLocalFlowState(
        clearCoachPreferenceFrame(args.tempMemory),
        nextLocalState,
      );
      runtimeTrace.push(runtimeTraceBase({
        event: "get_info_product_returned_to_flow",
        flowAction: decision.flow_action,
        visibleTask,
      }));
      return {
        content: productContent,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          operation_type: "update_coach_preferences",
          mode: "local_write_flow",
          status: reduced.status,
          reason_code: reduced.reason_code,
          flow_action: decision.flow_action,
          visible_task_kind: visibleTask,
          preference_updates: decision.preference_updates,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: reduced.blocked_effects,
          pending_confirmation: null,
          local_flow_state: nextLocalState,
          subskill_run: {
            skill_id: "product_help",
            selected_handler: "product_help",
            status: productHelp?.status ?? null,
            operation_suggestions: productHelp?.operation_suggestions ?? [],
            effects: productHelp?.effects ?? null,
          },
          write_attempted: false,
          write_committed: false,
          write_blocked_reason: null,
          debug: {
            reason_code: reduced.reason_code,
            evidence: reduced.evidence,
          },
          runtime_trace: runtimeTrace,
        },
      };
    }
  }
  const statusReply = visibleTask === "get_info_db"
    ? await buildCoachPreferencesStatusReply({
      supabase: args.supabase,
      userId: args.userId,
      fallback: "Je vérifie les préférences coach actives, sans rien modifier.",
    })
    : null;
  const nextLocalState = baseNextLocalState;
  const nextTempMemory = writeCoachPreferenceLocalFlowState(
    clearCoachPreferenceFrame(args.tempMemory),
    nextLocalState,
  );
  const visibleAgent = args.visibleAgent ?? runCoachPreferenceVisibleAgent;
  const visibleMessage = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: visibleTask,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    local_state: nextLocalState,
    current_preferences: currentPreferences,
    write_updates: reduced.write_updates,
    committed,
    committed_update_ids: committedUpdateIds,
    get_info_db_reply: statusReply,
    dispatcher_instruction: decision.visible_task.instruction,
    blocked_reason: writeError ?? reduced.blocked_effects[0]?.reason_code ??
      null,
  });
  const content = visibleMessage ?? fallbackVisibleMessage({
    stage: visibleTask,
    committed,
    statusReply,
  });
  return {
    content,
    nextTempMemory,
    toolExecution: committed
      ? "success"
      : writeError
      ? "failed"
      : reduced.status === "blocked"
      ? "blocked"
      : "none",
    executedTools: committed ? ["update_coach_preferences"] : [],
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      operation_type: "update_coach_preferences",
      mode: "local_write_flow",
      status: committed ? "executed" : writeError ? "failed" : reduced.status,
      reason_code: writeError
        ? "update_coach_preferences_write_failed"
        : reduced.reason_code,
      flow_action: decision.flow_action,
      visible_task_kind: visibleTask,
      preference_updates: reduced.write_updates.length
        ? reduced.write_updates
        : decision.preference_updates,
      requested_effects: reduced.write_updates.length
        ? [{
          type: "update_coach_preferences",
          operation_id: args.requestId ?? null,
          preference_keys: reduced.write_updates.map((update) => update.key),
        }]
        : [],
      allowed_effects: reduced.write_updates.length && !writeError
        ? [{
          type: "update_coach_preferences",
          operation_id: args.requestId ?? null,
          preference_keys: reduced.write_updates.map((update) => update.key),
        }]
        : [],
      committed_effects: committedEffects,
      blocked_effects: writeError
        ? [{ type: "update_coach_preferences", reason_code: writeError }]
        : reduced.blocked_effects,
      pending_confirmation: null,
      local_flow_state: nextLocalState,
      write_attempted: reduced.write_updates.length > 0,
      write_committed: committed,
      write_blocked_reason: writeError,
      debug: {
        reason_code: writeError ?? reduced.reason_code,
        evidence: reduced.evidence,
      },
      runtime_trace: runtimeTrace,
    },
  };
}

export async function maybeRunUpdateCoachPreferencesOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  history?: unknown;
  runLocalDispatcher?: CoachPreferenceLocalDispatcher;
  runVisibleAgent?: CoachPreferenceVisibleAgent;
  runStatusRecapSubskill?: StatusRecapSubskillRunner;
  runProductHelpSubskill?: ProductHelpSubskillRunner;
}): Promise<OperationRuntimeResult | null> {
  void args.channel;
  void args.userTimezone;
  if (
    !routeIsSelected({
      operationType: "update_coach_preferences",
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  if (String(args.safetyPregateOutput.risk_band ?? "none") === "critical") {
    const blockedOutput: CoachPreferenceLocalDispatcherOutput = {
      flow_action: "safety_preempt",
      confidence: "high",
      risk_score: 10,
      preference_intent: {
        kind: "safety",
        durability: "not_applicable",
        support_status: "not_applicable",
        summary: "Safety preempted coach preference update.",
      },
      preference_updates: [],
      unsupported_parts: [],
      missing_decisions: [],
      visible_task: {
        kind: "safety",
        instruction: "Laisser la pipeline safety reprendre.",
      },
      exit_memo: {
        needed: true,
        reason: "safety",
        flow_summary: null,
        handoff_hint_for_global_dispatcher: null,
      },
      evidence: args.safetyPregateOutput.evidence ?? [],
    };
    return await runCoachPreferenceLocalRuntime({
      ...args,
      userTimezone: args.userTimezone,
      dispatcher: () => Promise.resolve(blockedOutput),
      visibleAgent: args.runVisibleAgent,
      statusRecapSubskill: args.runStatusRecapSubskill,
      productHelpSubskill: args.runProductHelpSubskill,
    });
  }

  return await runCoachPreferenceLocalRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: args.tempMemory,
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    safetyPregateOutput: args.safetyPregateOutput,
    sourceMessageId: args.sourceMessageId,
    requestId: args.requestId ?? null,
    history: args.history,
    dispatcher: args.runLocalDispatcher,
    visibleAgent: args.runVisibleAgent,
    statusRecapSubskill: args.runStatusRecapSubskill,
    productHelpSubskill: args.runProductHelpSubskill,
  });
}
