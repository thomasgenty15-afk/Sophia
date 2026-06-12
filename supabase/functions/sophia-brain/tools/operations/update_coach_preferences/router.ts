/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../../../contracts/skill_output.v1.ts";
import {
  createNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
  noteInformationSummary,
} from "../../../contracts/note_information.v1.ts";
import { PRODUCT_SURFACE_DEFINITIONS } from "../../../product_surface_registry/surfaces_data.ts";
import type { SafetySignalContext } from "../../../safety/safety_context.ts";
import { runProductHelpSkill } from "../../../skills/product_help/skill.ts";
import { maybeRunStatusRecapRuntime } from "../../../skills/status_recap/runtime.ts";
import type { StatusRecapLocalDispatcher } from "../../../skills/status_recap/local_flow.ts";
import type {
  CoachPreferenceConversationContext,
  CoachPreferenceDbContextPack,
  CoachPreferenceLocalDispatcherOutput,
  CoachPreferenceLocalUpdate,
  CoachPreferenceMicroMemoryContext,
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

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain";
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
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "status_recap",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "status_recap",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    activeOperationIntake: null,
    history: args.history,
    requestId: args.requestId ?? null,
    runLocalDispatcher: coachPreferenceStatusDispatcher(),
  });
  if (!runtime) return null;
  return {
    content: runtime.content,
    additionalContents: runtime.additionalContents,
    nextTempMemory: runtime.nextTempMemory,
    toolExecution: runtime.toolExecution === "success"
      ? "success"
      : runtime.toolExecution === "failed"
      ? "failed"
      : runtime.toolExecution === "blocked"
      ? "blocked"
      : "none",
    executedTools: runtime.executedTools,
    toolSkillRun: runtime.toolSkillRun as Record<string, unknown>,
  };
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

function buildCoachPreferenceDbContextPack(args: {
  currentPreferences: Array<{ key: string; value: string; label: string }>;
  activeState: CoachPreferenceLocalFlowState | null;
  committedEffects?: UpdateCoachPreferencesCommittedEffect[];
}): CoachPreferenceDbContextPack {
  return {
    source: "user_profile_facts",
    freshness: "same_turn",
    confidence: "high",
    preferences: args.currentPreferences.map((row) => ({
      key: row.key,
      value: row.value,
      label: row.label,
      source_type: null,
      status: "active",
      updated_at: null,
      last_confirmed_at: null,
      reason: null,
      evidence: [`${row.key}=${row.value}`],
    })),
    supported_catalog: {
      "coach.tone": ["soft", "warm_direct", "direct"],
      "coach.challenge_level": ["low", "balanced", "high"],
      "coach.question_tendency": ["low", "normal", "high"],
    },
    active_flow: args.activeState as unknown as Record<string, unknown> | null,
    last_committed_effects: args.committedEffects ?? [],
    product_surface_summary:
      "Preferences coach: ton, niveau de challenge, tendance à poser des questions.",
  };
}

function emptyCoachPreferenceMicroMemoryContext(): CoachPreferenceMicroMemoryContext {
  return {
    items: [],
    exclusions: [
      "no default memory retrieval for coach preferences",
      "no safety memory outside safety_crisis",
      "no raw memory in visible prompt",
    ],
    budget: {
      max_items: 0,
      reason:
        "Current coach preferences and local flow state are enough for this closed write-skill.",
    },
  };
}

function buildInboundActivationNote(args: {
  previousState: CoachPreferenceLocalFlowState | null;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  userMessage: string;
}): NoteInformation | null {
  if (args.previousState?.turn_count && args.previousState.turn_count > 1) {
    return null;
  }
  const selectedByGlobal =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler === "update_coach_preferences";
  const selectedByTurnFrame = (args.turnFrame?.tool_skill_intents ?? []).some((
    intent,
  ) =>
    intent.operation_type === "update_coach_preferences" &&
    intent.confidence_band !== "low"
  );
  if (!selectedByGlobal && !selectedByTurnFrame) return null;
  const structured = {
    source_flow: "global",
    target_flow: "update_coach_preferences",
    route_reason: args.routeDecision?.reason_code ?? null,
    selected_handler: args.routeDecision?.selected_handler ?? null,
    user_message_summary: args.userMessage.slice(0, 240),
    active_flow_summary: "Initial activation of update_coach_preferences.",
    collected_state: {},
    unresolved_questions: [],
    confidence: selectedByGlobal ? "high" : "medium",
    evidence: [
      args.routeDecision?.reason_code ?? "tool_skill_intent_selected",
    ].filter(Boolean),
    recommended_next_focus:
      "Classer la demande de préférence coach puis écrire seulement si durable, supportée, claire et locked.",
  };
  return createNoteInformation({
    source_flow_id: "global",
    handoff_reason: "explicit_user_request",
    target_dispatcher: "update_coach_preferences",
    handoff_context_for_next_dispatcher: JSON.stringify(structured),
    user_words: [args.userMessage],
    structured_context: structured,
  });
}

function mergeRuntimeConversationContext(
  base: CoachPreferenceConversationContext,
  patch: Partial<CoachPreferenceConversationContext>,
): CoachPreferenceConversationContext {
  return {
    ...base,
    ...patch,
    known_values: {
      ...base.known_values,
      ...(patch.known_values ?? {}),
    },
    write_result: {
      ...base.write_result,
      ...(patch.write_result ?? {}),
    },
    inline_tool_result: {
      ...base.inline_tool_result,
      ...(patch.inline_tool_result ?? {}),
    },
    do_not_say: [
      ...base.do_not_say,
      ...((patch.do_not_say ?? []).filter((item) =>
        !base.do_not_say.includes(item)
      )),
    ].slice(0, 12),
  };
}

async function runCoachPreferenceLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  safetyContextOutput: SafetySignalContext;
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
  const dbContextPack = buildCoachPreferenceDbContextPack({
    currentPreferences,
    activeState: previousState,
  });
  const microMemoryContext = emptyCoachPreferenceMicroMemoryContext();
  const inboundNoteInformation = buildInboundActivationNote({
    previousState,
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    userMessage: args.userMessage,
  });
  runtimeTrace.push({
    ...runtimeTraceBase({
      event: "db_context_pack_loaded",
      preferenceUpdates: previousState.proposed_updates,
    }),
    db_context_pack_source: dbContextPack.source,
    db_context_pack_preference_keys: dbContextPack.preferences.map((row) =>
      row.key
    ),
  });
  runtimeTrace.push({
    ...runtimeTraceBase({
      event: "micro_memory_context_loaded",
    }),
    micro_memory_item_count: microMemoryContext.items.length,
    micro_memory_budget: microMemoryContext.budget,
  });
  if (inboundNoteInformation) {
    runtimeTrace.push({
      ...runtimeTraceBase({
        event: "note_information_consumed",
        preferenceUpdates: previousState.proposed_updates,
      }),
      ...noteInformationForTrace(inboundNoteInformation),
    });
  }
  const dispatcher = args.dispatcher ?? runCoachPreferenceLocalDispatcher;
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: previousState,
    note_information_inbound: inboundNoteInformation,
    db_context_pack: dbContextPack,
    micro_memory_context: microMemoryContext,
    platform_context: {
      timezone: args.userTimezone,
      channel: args.turnFrame?.channel ?? "web",
    },
    available_inline_tools: ["status_recap", "product_help"],
    current_preferences: currentPreferences,
    safety_risk_band: String(args.safetyContextOutput.risk_band ?? "none"),
  });

  if (!decision) {
    return {
      content: "",
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
  runtimeTrace.push({
    ...runtimeTraceBase({
      event: "conversation_context_created",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
    }),
    conversation_context_keys: Object.keys(reduced.conversation_context),
    conversation_context_stage: reduced.conversation_context.field_or_stage,
  });
  if (reduced.note_information) {
    runtimeTrace.push({
      ...runtimeTraceBase({
        event: "note_information_created",
        flowAction: decision.flow_action,
        visibleTask: reduced.visible_task,
      }),
      ...noteInformationForTrace(reduced.note_information),
    });
  }

  if (reduced.exit_to_global_dispatcher) {
    const exitMemo = {
      reason: decision.exit_memo?.reason ?? "topic_change",
      flow_summary: decision.exit_memo?.flow_summary ??
        noteInformationSummary(reduced.note_information) ?? null,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo?.handoff_hint_for_global_dispatcher ??
          reduced.note_information?.handoff_context_for_next_dispatcher ?? null,
      note_information: reduced.note_information,
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
        note_information: reduced.note_information,
        runtime_trace: runtimeTrace,
      },
    };
  }

  if (reduced.safety_preempt) {
    const nextTempMemory = {
      ...clearCoachPreferenceFrame(args.tempMemory),
      __last_update_coach_preferences_exit_memo: {
        reason: "safety",
        flow_summary: noteInformationSummary(reduced.note_information) ??
          decision.preference_intent.summary,
        note_information: reduced.note_information,
        at: new Date().toISOString(),
      },
    };
    runtimeTrace.push({
      ...runtimeTraceBase({
        event: "safety_preempt",
        flowAction: decision.flow_action,
        visibleTask: reduced.visible_task,
      }),
      ...noteInformationForTrace(reduced.note_information),
    });
    return {
      content: "",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        operation_type: "update_coach_preferences",
        mode: "local_write_flow",
        status: "blocked",
        reason_code: "update_coach_preferences_safety_preempt",
        flow_action: decision.flow_action,
        visible_task_kind: reduced.visible_task,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
        pending_confirmation: null,
        note_information: reduced.note_information,
        local_flow_state: null,
        write_attempted: false,
        write_committed: false,
        write_blocked_reason: "safety_preempt",
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
  const runtimeConversationContext = mergeRuntimeConversationContext(
    reduced.conversation_context,
    {
      known_values: {
        ...reduced.conversation_context.known_values,
        current_preferences: currentPreferences,
        proposed_updates: reduced.local_state?.proposed_updates ??
          reduced.conversation_context.known_values.proposed_updates,
        committed_updates: committed ? reduced.write_updates : [],
      },
      write_result: {
        committed,
        preference_keys: committedEffects.flatMap((effect) =>
          effect.preference_keys
        ),
        blocked_reason: writeError ?? reduced.blocked_effects[0]?.reason_code ??
          null,
      },
      evidence_used: reduced.evidence,
    },
  );
  const baseNextLocalState = committed
    ? null
    : reduced.status === "cancelled"
    ? null
    : reduced.local_state;
  if (visibleTask === "get_info_db" && !committed && !writeError) {
    const statusRunner = args.statusRecapSubskill ??
      runDefaultCoachPreferenceStatusSubskill;
    runtimeTrace.push({
      ...runtimeTraceBase({
        event: "inline_tool_roundtrip",
        flowAction: decision.flow_action,
        visibleTask,
      }),
      inline_tool: "status_recap",
      ...noteInformationForTrace(reduced.note_information),
    });
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
          note_information: reduced.note_information,
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
    runtimeTrace.push({
      ...runtimeTraceBase({
        event: "inline_tool_roundtrip",
        flowAction: decision.flow_action,
        visibleTask,
      }),
      inline_tool: "product_help",
      ...noteInformationForTrace(reduced.note_information),
    });
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
          note_information: reduced.note_information,
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
    conversation_context: runtimeConversationContext,
  });
  const content = visibleMessage ?? "";
  if (!visibleMessage) {
    runtimeTrace.push(runtimeTraceBase({
      event: "visible_agent_failed",
      flowAction: decision.flow_action,
      visibleTask,
      writeBlockedReason: "visible_agent_failed",
    }));
  }
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
      conversation_context: runtimeConversationContext,
      note_information: reduced.note_information,
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
  safetyContextOutput: SafetySignalContext;
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

  if (String(args.safetyContextOutput.risk_band ?? "none") === "critical") {
    const safetyNote = createNoteInformation({
      source_flow_id: "update_coach_preferences",
      handoff_reason: "safety",
      target_dispatcher: "safety_crisis",
      handoff_context_for_next_dispatcher:
        "Safety context is critical; suspend preference update and let safety_crisis own the next response.",
      user_words: [args.userMessage],
      structured_context: {
        source_flow: "update_coach_preferences",
        user_message_summary: args.userMessage,
        active_flow_summary:
          "Critical safety context preempted coach preference update.",
        risk_band: args.safetyContextOutput.risk_band,
        evidence: args.safetyContextOutput.evidence ?? [],
        unresolved_questions: [],
        recommended_next_focus: "safety_crisis",
      },
      confidence: "high",
    });
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
        kind: "safety_transition",
        instruction: "Laisser la pipeline safety reprendre.",
        conversation_context: {
          state_summary: "Safety context preempted coach preference update.",
          user_words: [args.userMessage],
          field_or_stage: "done",
          known_values: {
            current_preferences: [],
            proposed_updates: [],
            committed_updates: [],
          },
          missing_or_weak_values: [],
          selected_candidate: {},
          unsupported_parts: [],
          write_result: {
            committed: false,
            preference_keys: [],
            blocked_reason: "safety_preempt",
          },
          inline_tool_result: {
            skill_id: null,
            summary: null,
          },
          tone_constraints: [],
          do_not_say: [
            "Ne pas traiter la préférence.",
            "Ne pas produire de réponse safety complète depuis update_coach_preferences.",
          ],
          context_summary:
            "Transition vers safety_crisis; pas de mutation de préférence.",
          evidence_used: args.safetyContextOutput.evidence ?? [],
        },
      },
      note_information: {
        needed: true,
        ...safetyNote,
      },
      exit_memo: {
        needed: true,
        reason: "safety",
        flow_summary: noteInformationSummary(safetyNote) ?? null,
        handoff_hint_for_global_dispatcher:
          safetyNote.handoff_context_for_next_dispatcher,
      },
      safety: {
        risk_band: "critical",
        reason_codes: args.safetyContextOutput.reason_codes ?? [],
        should_preempt: true,
      },
      evidence: args.safetyContextOutput.evidence ?? [],
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
    safetyContextOutput: args.safetyContextOutput,
    sourceMessageId: args.sourceMessageId,
    requestId: args.requestId ?? null,
    history: args.history,
    dispatcher: args.runLocalDispatcher,
    visibleAgent: args.runVisibleAgent,
    statusRecapSubskill: args.runStatusRecapSubskill,
    productHelpSubskill: args.runProductHelpSubskill,
  });
}
