/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { PRODUCT_SURFACE_DEFINITIONS } from "../../product_surface_registry/surfaces_data.ts";
import { runProductHelpSkill } from "../../skills/product_help/skill.ts";
import { maybeRunStatusRecapRuntime } from "../../skills/status_recap/runtime.ts";
import type { StatusRecapLocalDispatcher } from "../../skills/status_recap/local_flow.ts";
import type { StatusRecapObjectType } from "../../skills/status_recap/contract.ts";
import {
  createNoteInformation,
  noteInformationForTrace,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";

export type InlineInfoToolContext = {
  active_flow: string;
  active_flow_status?: string | null;
  question_to_answer: string;
  active_flow_context: Record<string, unknown>;
  dispatcher_context?: Record<string, unknown> | null;
  note_information?: NoteInformation | null;
};

export type InlineInfoToolResult = {
  content: string;
  additionalContents?: string[];
  subskillRun: Record<string, unknown>;
  runtimeTrace: Array<Record<string, unknown>>;
  context: InlineInfoToolContext;
};

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

function noteForInlineInfo(
  context: InlineInfoToolContext,
  targetDispatcher: Extract<
    NoteInformationTargetDispatcher,
    "product_help" | "status_recap"
  >,
): NoteInformation {
  if (context.note_information) return context.note_information;
  return createNoteInformation({
    source_flow_id: context.active_flow,
    source_flow_state_summary: String(
      context.active_flow_status ?? "active",
    ),
    handoff_reason: "inline_tool",
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify({
      active_flow: context.active_flow,
      active_flow_status: context.active_flow_status ?? null,
      question_to_answer: context.question_to_answer,
      active_flow_context: context.active_flow_context,
      dispatcher_context: context.dispatcher_context ?? null,
      preserve_active_flow: true,
    }),
    target_local_dispatcher_hint:
      "Answer only the inline information question, then return to the parent flow without changing parent slots.",
    structured_context: {
      active_flow: context.active_flow,
      active_flow_status: context.active_flow_status ?? null,
      question_to_answer: context.question_to_answer,
      active_flow_context: context.active_flow_context,
      dispatcher_context: context.dispatcher_context ?? null,
      preserve_active_flow: true,
    },
  });
}

function statusRecapDispatcherForInlineInfo(args: {
  objectTypes: StatusRecapObjectType[];
  context: InlineInfoToolContext;
}): StatusRecapLocalDispatcher {
  return async () => ({
    flow_action: "answer_object_status",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "object_status",
      summary:
        `Inline get_info_db depuis ${args.context.active_flow}: ${args.context.question_to_answer}`,
      requires_db_projection: true,
      requires_effect_history: false,
    },
    target_objects: args.objectTypes.length ? args.objectTypes : ["unknown"],
    read_scope: {
      requested_categories: ["all"],
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
      kind: "object_status",
      instruction:
        `Réponds à la question DB du user pendant le flow actif ${args.context.active_flow}. Contexte: ${args.context.question_to_answer}. Ne modifie rien et ne prends pas l'ownership du flow.`,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: "object_status",
        last_target_objects: args.objectTypes,
        last_answer_summary: null,
        last_projection_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: [
      "inline_get_info_db",
      args.context.active_flow,
      args.context.question_to_answer,
    ],
  });
}

export async function runInlineGetInfoProductTool(args: {
  userId: string;
  userMessage: string;
  history?: unknown;
  turnFrame: TurnFrame | null;
  context: InlineInfoToolContext;
  requestId?: string | null;
}): Promise<InlineInfoToolResult> {
  const noteInformation = noteForInlineInfo(args.context, "product_help");
  const contextWithNote: InlineInfoToolContext = {
    ...args.context,
    note_information: noteInformation,
  };
  console.info("[InlineInfo] note_information_created", {
    ...noteInformationForTrace(noteInformation),
    transition_tag: "local_inline_tool_with_note",
    request_id: args.requestId ?? null,
  });
  const activeSkillWorkingState = {
    skill_id: args.context.active_flow,
    status: args.context.active_flow_status ?? "active",
    turn_count: 0,
    working_state: {
      active_flow: args.context.active_flow,
      active_flow_context: args.context.active_flow_context,
      question_to_answer: args.context.question_to_answer,
      dispatcher_context: args.context.dispatcher_context ?? null,
      note_information: noteInformation,
      preserve_active_flow: true,
    },
  };
  const output = await runProductHelpSkill({
    user_message: args.userMessage,
    context: {
      skill_id: "product_help",
      user_id: args.userId,
      recent_messages: recentMessagesFromHistory(args.history),
      active_skill_working_state: activeSkillWorkingState as any,
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
  const content = String(output.reply ?? output.generated_user_message ?? "")
    .trim();
  return {
    content,
    context: contextWithNote,
    subskillRun: {
      skill_id: "product_help",
      selected_handler: "product_help",
      status: output.status ?? null,
      diagnosis: output.diagnosis ?? null,
      operation_suggestions: output.operation_suggestions ?? [],
      effects: output.effects ?? null,
      active_flow_context: activeSkillWorkingState.working_state,
      note_information: noteInformation,
    },
    runtimeTrace: [{
      component: args.context.active_flow,
      event: "get_info_product_called",
      preserve_active_flow: true,
      note_information: noteInformation,
      context: contextWithNote,
    }, {
      component: args.context.active_flow,
      event: "get_info_product_returned_to_flow",
      preserve_active_flow: true,
      note_information: noteInformation,
    }],
  };
}

export async function runInlineGetInfoDbTool(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  history?: unknown;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  tempMemory: any;
  requestId?: string | null;
  objectTypes: StatusRecapObjectType[];
  context: InlineInfoToolContext;
}): Promise<InlineInfoToolResult> {
  const noteInformation = noteForInlineInfo(args.context, "status_recap");
  const contextWithNote: InlineInfoToolContext = {
    ...args.context,
    note_information: noteInformation,
  };
  console.info("[InlineInfo] note_information_created", {
    ...noteInformationForTrace(noteInformation),
    transition_tag: "local_inline_tool_with_note",
    request_id: args.requestId ?? null,
  });
  const statusRuntime = await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: {},
    turnFrame: args.turnFrame,
    routeDecision: args.routeDecision,
    activeOperationIntake: null,
    history: args.history,
    requestId: args.requestId ?? null,
    runLocalDispatcher: statusRecapDispatcherForInlineInfo({
      objectTypes: args.objectTypes,
      context: contextWithNote,
    }),
  });
  const content = String(statusRuntime?.content ?? "").trim();
  return {
    content,
    additionalContents: statusRuntime?.additionalContents,
    context: contextWithNote,
    subskillRun: {
      skill_id: "status_recap",
      selected_handler: statusRuntime?.toolSkillRun?.selected_handler ??
        "status_recap",
      toolExecution: statusRuntime?.toolExecution ?? "none",
      executedTools: statusRuntime?.executedTools ?? [],
      reason_code: statusRuntime?.toolSkillRun?.reason_code ?? null,
      active_flow_context: contextWithNote,
      note_information: noteInformation,
    },
    runtimeTrace: [{
      component: args.context.active_flow,
      event: "get_info_db_called",
      preserve_active_flow: true,
      target_objects: args.objectTypes,
      note_information: noteInformation,
      context: contextWithNote,
    }, {
      component: args.context.active_flow,
      event: "get_info_db_returned_to_flow",
      preserve_active_flow: true,
      note_information: noteInformation,
    }],
  };
}
