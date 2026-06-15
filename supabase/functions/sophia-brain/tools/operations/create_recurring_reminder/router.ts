import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../../../context/recent_messages_policy.ts";
import { blocksToolSkills } from "../../../safety/safety_thresholds.ts";
import type {
  CreateRecurringReminderCommittedEffect,
  CreateRecurringReminderVisibleTask,
  RecurringReminderHandoffDraft,
  RecurringReminderHandoffState,
  RecurringReminderHandoffStatus,
} from "./contract.ts";
import {
  clearRecurringReminderFrame,
  loadRecurringReminderFrameFromTempMemory,
  writeRecurringReminderHandoffState,
} from "./state.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import {
  buildRecurringReminderPlatformContext,
  type RecurringReminderPlanItemSnapshotItem,
  type RecurringReminderRuntimeContext,
} from "./platform_context.ts";
import {
  type CreateRecurringReminderLocalDispatcher,
  type CreateRecurringReminderLocalDispatcherFailureDiagnostic,
  reduceCreateRecurringReminderLocalDispatcherOutput,
  runCreateRecurringReminderLocalDispatcher,
} from "./local_flow.ts";
import {
  type CreateRecurringReminderVisibleAgent,
  runCreateRecurringReminderVisibleAgent,
} from "./visible_agent.ts";
import {
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";

export type CreateRecurringReminderRuntimeResult = {
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
  committedEffects: CreateRecurringReminderCommittedEffect[];
  toolSkillRun: Record<string, unknown>;
};

type PendingRecurringReminderRecommendation = {
  operation_type: "create_recurring_reminder";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
};

function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

function isPendingRecurringReminderRecommendationOperation(
  value: unknown,
): value is PendingRecurringReminderRecommendation {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "create_recurring_reminder",
  );
}

function recurringReminderRouteIsSelected(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadRecurringReminderFrameFromTempMemory(args.tempMemory);
  const pendingType = pendingOperationType(frame.pending_confirmation);
  if (pendingType && pendingType !== "create_recurring_reminder") return false;
  if (frame.handoff_state) return true;
  if (
    isPendingRecurringReminderRecommendationOperation(
      frame.pending_recommendation,
    )
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "create_recurring_reminder"
  ) return true;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === "create_recurring_reminder" &&
    intent.user_intent === "create" &&
    intent.confidence_band !== "low"
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function contractRecoveryVisibleTask(args: {
  reasonCode: string;
  userMessage: string;
}): CreateRecurringReminderVisibleTask {
  return {
    kind: "contract_recovery",
    conversation_context: {
      source_flow: "create_recurring_reminder",
      stage_goal: "contract_recovery",
      current_user_message_summary: args.userMessage,
      active_flow_summary:
        "Le flow local de rappel récurrent n'a pas produit un contrat exploitable; aucune mutation n'est autorisée.",
      collected_state: {
        reason_code: args.reasonCode,
      },
      known_values: {},
      missing_or_weak_values: ["local_contract"],
      question_to_ask:
        "Quel rythme, quelle heure et quel contenu veux-tu pour ce rappel récurrent ?",
      handoff: {
        ready: false,
        executable_from_chat: false,
      },
      inline_tool_result: null,
      note_information_summary: null,
      unresolved_questions: ["local_contract"],
      evidence_used: [args.reasonCode],
      tone_constraints: ["court", "conversationnel"],
      do_not_say: [
        "créé",
        "programmé",
        "actif",
        "enregistré",
        "je te relancerai",
      ],
    },
  };
}

function visibleContentOrThrow(value: unknown, stage: string): string {
  const content = String(value ?? "").trim();
  if (!content) {
    throw new Error(`create_recurring_reminder_visible_agent_failed:${stage}`);
  }
  return content;
}

function activationNoteInformation(args: {
  userMessage: string;
  routeDecision: RouteDecision | null;
  platformContext: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    needed: true,
    source_flow: "global_dispatcher",
    source_flow_id: "global_dispatcher",
    target_dispatcher: "create_recurring_reminder",
    handoff_reason: "explicit_user_request",
    user_message_summary: args.userMessage,
    active_flow_summary:
      "Première activation du flow local create_recurring_reminder depuis le dispatcher global.",
    collected_state: {
      selected_handler: args.routeDecision?.selected_handler ?? null,
      reason_code: args.routeDecision?.reason_code ?? null,
      product_surface:
        getHandoffTargetForOperation("create_recurring_reminder") ?? null,
      platform_context_keys: Object.keys(args.platformContext).slice(0, 12),
    },
    unresolved_questions: [],
    confidence: "medium",
    evidence: [
      args.routeDecision?.reason_code ?? "local_activation",
      args.routeDecision?.selected_handler ?? "create_recurring_reminder",
    ].filter(Boolean),
    recommended_next_focus:
      "Stabiliser recurrence, heure, contenu et destination/binding sans mutation chat.",
  };
}

function inlineReturnVisibleTask(args: {
  task: CreateRecurringReminderVisibleTask;
  toolName: "get_info_product" | "get_info_db";
  question: string;
  content: string;
  subskillRun: Record<string, unknown>;
}): CreateRecurringReminderVisibleTask {
  const context = args.task.conversation_context;
  return {
    kind: "inline_tool_return",
    conversation_context: {
      ...context,
      stage_goal: "inline_tool_return",
      inline_tool_result: {
        requested: true,
        tool_name: args.toolName,
        question_to_answer: args.question,
        reply: args.content || null,
        result_status: args.content ? "answered" : "empty_or_unavailable",
        subskill_summary: args.subskillRun,
      },
      note_information_summary: {
        ...(context.note_information_summary ?? {}),
        target_dispatcher: args.toolName === "get_info_db"
          ? "status_recap"
          : "product_help",
      },
      evidence_used: [
        ...context.evidence_used,
        `${args.toolName}_returned`,
      ].slice(0, 16),
    },
  };
}

function handoffState(args: {
  draft: RecurringReminderHandoffDraft;
  status?: RecurringReminderHandoffStatus;
  previous?: RecurringReminderHandoffState | null;
}): RecurringReminderHandoffState {
  const now = nowIso();
  return {
    skill_id: "create_recurring_reminder",
    mode: "platform_handoff",
    status: args.status ?? "handoff_delivered",
    draft: args.draft,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    executable_from_chat: false,
  };
}

function platformHandoffRun(args: {
  status: RecurringReminderHandoffStatus;
  draft?: RecurringReminderHandoffDraft | null;
  reasonCode: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    selected_handler: "create_recurring_reminder",
    operation_type: "create_recurring_reminder",
    status: args.status,
    reason_code: args.reasonCode,
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    platform_handoff: {
      operation_type: "create_recurring_reminder",
      status: args.status === "cancelled" ? "cancelled" : "delivered",
      surface_id: getHandoffTargetForOperation("create_recurring_reminder")
        ?.surface_id ?? "recurring_reminders",
      reason_code: args.reasonCode,
      executable_from_chat: false,
      draft: args.draft ?? null,
    },
    ...(args.extra ?? {}),
  };
}

async function runCreateRecurringReminderLocalFlow(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: Record<string, unknown>;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  requestId?: string | null;
  history?: unknown;
  frame: ReturnType<typeof loadRecurringReminderFrameFromTempMemory>;
  platformContext: Record<string, unknown>;
  runLocalDispatcher?: CreateRecurringReminderLocalDispatcher;
  runVisibleAgent?: CreateRecurringReminderVisibleAgent;
  runInlineGetInfoProduct?: typeof runInlineGetInfoProductTool;
  runInlineGetInfoDb?: typeof runInlineGetInfoDbTool;
}): Promise<CreateRecurringReminderRuntimeResult | null> {
  const dispatcher = args.runLocalDispatcher ??
    runCreateRecurringReminderLocalDispatcher;
  let localDispatcherFailure:
    | CreateRecurringReminderLocalDispatcherFailureDiagnostic
    | null = null;
  const inboundActivationNote = args.frame.handoff_state
    ? null
    : activationNoteInformation({
      userMessage: args.userMessage,
      routeDecision: args.routeDecision,
      platformContext: args.platformContext,
    });
  const output = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: args.frame.handoff_state,
    platform_context: args.platformContext,
    db_context_pack: {
      platform_context: args.platformContext,
      active_handoff_state: args.frame.handoff_state
        ? {
          status: args.frame.handoff_state.status,
          draft: args.frame.handoff_state.draft ?? null,
          fields: args.frame.handoff_state.fields ?? null,
          turn_count: args.frame.handoff_state.turn_count,
        }
        : null,
      product_surface:
        getHandoffTargetForOperation("create_recurring_reminder") ?? null,
    },
    micro_memory_context: [],
    note_information_inbound: inboundActivationNote,
    risk_context: {
      safety_risk_band: String(args.turnFrame?.safety?.risk_band ?? "none"),
      safety_reason_codes: args.turnFrame?.safety?.reason_codes ?? [],
    },
    available_inline_tools: ["get_info_product", "get_info_db"],
    channel: args.channel,
    timezone: args.userTimezone,
    safety_risk_band: String(args.turnFrame?.safety?.risk_band ?? "none"),
    report_failure: (diagnostic) => {
      localDispatcherFailure = diagnostic;
    },
  });
  if (!output) {
    const recoveryTask = contractRecoveryVisibleTask({
      reasonCode: "local_dispatcher_failed",
      userMessage: args.userMessage,
    });
    const visible = await (args.runVisibleAgent ??
      runCreateRecurringReminderVisibleAgent)({
        user_id: args.userId,
        request_id: args.requestId ?? null,
        stage: recoveryTask.kind,
        user_message: args.userMessage,
        recent_messages: recentMessagesFromHistory(args.history),
        local_state: args.frame.handoff_state,
        visible_task: recoveryTask,
        handoff_draft: null,
        blocked_reason: "local_dispatcher_failed",
      });
    return {
      content: visibleContentOrThrow(visible, recoveryTask.kind),
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "blocked",
        reasonCode: "local_dispatcher_failed",
        extra: {
          activation_note_information: inboundActivationNote,
          local_dispatcher_failure: localDispatcherFailure,
          blocked_effects: [{
            type: "local_dispatcher",
            reason_code: "local_dispatcher_failed",
            diagnostic: localDispatcherFailure,
          }],
          runtime_trace: [{
            component: "create_recurring_reminder",
            event: "local_dispatcher_failed",
            diagnostic: localDispatcherFailure,
          }],
        },
      }),
    };
  }

  const reduced = reduceCreateRecurringReminderLocalDispatcherOutput({
    previous: args.frame.handoff_state,
    output,
  });
  const nextTempMemory = { ...args.tempMemory };
  if (reduced.local_state) {
    writeRecurringReminderHandoffState(nextTempMemory, reduced.local_state);
  } else {
    clearRecurringReminderFrame(nextTempMemory);
  }

  if (reduced.status === "inline_tool") {
    const context = {
      active_flow: "create_recurring_reminder",
      active_flow_status: reduced.local_state?.status ?? "collecting",
      question_to_answer: output.inline_tool.question_to_answer ??
        args.userMessage,
      active_flow_context: {
        note_information: reduced.note_information,
        fields: output.fields,
        handoff_draft: reduced.handoff_draft,
      },
      dispatcher_context: {
        flow_action: output.flow_action,
        evidence: output.evidence,
      },
    };
    const inline = output.flow_action === "get_info_db"
      ? await (args.runInlineGetInfoDb ?? runInlineGetInfoDbTool)({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        userTimezone: args.userTimezone,
        history: args.history,
        turnFrame: args.turnFrame,
        routeDecision: args.routeDecision,
        tempMemory: nextTempMemory,
        requestId: args.requestId ?? null,
        objectTypes: ["recurring_reminder"],
        context,
      })
      : await (args.runInlineGetInfoProduct ?? runInlineGetInfoProductTool)({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.history,
        turnFrame: args.turnFrame,
        context,
        requestId: args.requestId ?? null,
      });
    const inlineContent = String(inline.content ?? "").trim();
    const inlineVisibleTask = inlineReturnVisibleTask({
      task: reduced.visible_task,
      toolName: output.flow_action === "get_info_db"
        ? "get_info_db"
        : "get_info_product",
      question: context.question_to_answer,
      content: inlineContent,
      subskillRun: inline.subskillRun,
    });
    const visible = await (args.runVisibleAgent ??
      runCreateRecurringReminderVisibleAgent)({
        user_id: args.userId,
        request_id: args.requestId ?? null,
        stage: "inline_tool_return",
        user_message: args.userMessage,
        recent_messages: recentMessagesFromHistory(args.history),
        local_state: reduced.local_state,
        visible_task: inlineVisibleTask,
        handoff_draft: reduced.handoff_draft,
        blocked_reason: inlineContent ? null : "inline_tool_empty_result",
      });
    return {
      content: visibleContentOrThrow(visible, "inline_tool_return"),
      additionalContents: inline.additionalContents,
      nextTempMemory,
      toolExecution: "platform_handoff",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: reduced.local_state?.status ?? "clarifying",
        draft: reduced.handoff_draft,
        reasonCode: reduced.reason_code,
        extra: {
          local_dispatcher: output,
          activation_note_information: inboundActivationNote,
          local_reducer: {
            status: reduced.status,
            reason_code: reduced.reason_code,
            note_information: reduced.note_information,
            visible_task: inlineVisibleTask,
          },
          inline_tool: inline.subskillRun,
          runtime_trace: inline.runtimeTrace,
        },
      }),
    };
  }

  const visible = await (args.runVisibleAgent ??
    runCreateRecurringReminderVisibleAgent)({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      stage: reduced.visible_task.kind,
      user_message: args.userMessage,
      recent_messages: recentMessagesFromHistory(args.history),
      local_state: reduced.local_state,
      visible_task: reduced.visible_task,
      handoff_draft: reduced.handoff_draft,
      blocked_reason: reduced.blocked_effects[0]?.reason_code ?? null,
    });
  const content = visibleContentOrThrow(visible, reduced.visible_task.kind);
  return {
    content,
    nextTempMemory,
    toolExecution: reduced.status === "blocked" || reduced.status === "safety"
      ? "blocked"
      : reduced.status === "handoff_to_one_shot" ||
          reduced.status === "cancelled" || reduced.status === "exit"
      ? "none"
      : "platform_handoff",
    executedTools: [],
    committedEffects: [],
    toolSkillRun: platformHandoffRun({
      status: reduced.local_state?.status ??
        (reduced.status === "handoff_to_one_shot"
          ? "handoff_to_one_shot"
          : reduced.status === "cancelled"
          ? "cancelled"
          : reduced.status === "exit"
          ? "topic_change"
          : "blocked"),
      draft: reduced.handoff_draft,
      reasonCode: reduced.reason_code,
      extra: {
        local_dispatcher: output,
        activation_note_information: inboundActivationNote,
        local_reducer: {
          status: reduced.status,
          reason_code: reduced.reason_code,
          note_information: reduced.note_information,
          exit_to_global_dispatcher: reduced.exit_to_global_dispatcher,
          blocked_effects: reduced.blocked_effects,
        },
      },
    }),
  };
}

export async function maybeRunCreateRecurringReminderOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyContextOutput: { risk_band: RiskBand };
  sourceMessageId: string | null;
  requestId?: string | null;
  history?: unknown;
  v2Runtime?: RecurringReminderRuntimeContext;
  planItemSnapshot?: RecurringReminderPlanItemSnapshotItem[] | null;
  buildPlatformContext?: () => Record<string, unknown>;
  runLocalDispatcher?: CreateRecurringReminderLocalDispatcher;
  runVisibleAgent?: CreateRecurringReminderVisibleAgent;
  runInlineGetInfoProduct?: typeof runInlineGetInfoProductTool;
  runInlineGetInfoDb?: typeof runInlineGetInfoDbTool;
}): Promise<CreateRecurringReminderRuntimeResult | null> {
  const buildPlatformContext = args.buildPlatformContext ??
    (() =>
      buildRecurringReminderPlatformContext({
        v2Runtime: args.v2Runtime ?? null,
        planItemSnapshot: args.planItemSnapshot ?? null,
      }));
  if (
    !recurringReminderRouteIsSelected({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadRecurringReminderFrameFromTempMemory(nextTempMemory);
  if (blocksToolSkills(args.safetyContextOutput.risk_band)) {
    clearRecurringReminderFrame(nextTempMemory);
    return null;
  }
  const platformContext = buildPlatformContext();
  return await runCreateRecurringReminderLocalFlow({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    channel: args.channel,
    userTimezone: args.userTimezone,
    tempMemory: nextTempMemory,
    turnFrame: args.turnFrame,
    routeDecision: args.routeDecision,
    requestId: args.requestId ?? null,
    history: args.history,
    frame,
    platformContext,
    runLocalDispatcher: args.runLocalDispatcher,
    runVisibleAgent: args.runVisibleAgent,
    runInlineGetInfoProduct: args.runInlineGetInfoProduct,
    runInlineGetInfoDb: args.runInlineGetInfoDb,
  });
}
