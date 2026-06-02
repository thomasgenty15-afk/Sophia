import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import { blocksToolSkills } from "../../../safety/safety_thresholds.ts";
import { buildToolConfirmationDecision } from "../_shared/confirmation_adapter.ts";
import type {
  CreateRecurringReminderCommittedEffect,
  RecurringReminderHandoffDraft,
  RecurringReminderHandoffState,
  RecurringReminderHandoffStatus,
} from "./contract.ts";
import { buildRecurringReminderHandoffDraft } from "./generator.ts";
import {
  reviewCreateRecurringReminderDraft,
  runCreateRecurringReminderIntake,
} from "./intake.ts";
import {
  clearRecurringReminderFrame,
  clearRecurringReminderPendingRecommendation,
  loadRecurringReminderFrameFromTempMemory,
  writeRecurringReminderActiveIntake,
  writeRecurringReminderHandoffState,
} from "./state.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import {
  buildRecurringReminderPlatformContext,
  type RecurringReminderPlanItemSnapshotItem,
  type RecurringReminderRuntimeContext,
} from "./platform_context.ts";
import {
  renderRecurringReminderAskQuestion,
  renderRecurringReminderBlocked,
  renderRecurringReminderCancelled,
  renderRecurringReminderFailed,
  renderRecurringReminderHandoffToOneShot,
  renderRecurringReminderPlatformHandoff,
} from "./renderer.ts";
import {
  type ClarificationLlmRunner,
  runClarificationTool,
} from "../../../clarification/tool.ts";
import { buildClarificationRequest } from "../../../clarification/contract.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";

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

type HandoffClarificationOutput = {
  status: "resolved" | "ask" | "still_ambiguous" | "cancelled" | "topic_change";
  selected_candidate_id?: string | null;
  confidence: "low" | "medium" | "high";
  question?: string | null;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function frenchDay(value: unknown): string | null {
  const raw = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  const days: Record<string, string> = {
    monday: "lundi",
    tuesday: "mardi",
    wednesday: "mercredi",
    thursday: "jeudi",
    friday: "vendredi",
    saturday: "samedi",
    sunday: "dimanche",
    lundi: "lundi",
    mardi: "mardi",
    mercredi: "mercredi",
    jeudi: "jeudi",
    vendredi: "vendredi",
    samedi: "samedi",
    dimanche: "dimanche",
    lundis: "lundi",
    mardis: "mardi",
    mercredis: "mercredi",
    jeudis: "jeudi",
    vendredis: "vendredi",
    samedis: "samedi",
    dimanches: "dimanche",
  };
  return days[raw] ?? null;
}

function recurrenceFromText(value: unknown): {
  frequency?: string;
  days?: string[];
} {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return {};
  if (/\b(tous les jours|chaque jour|quotidien)\b/.test(text)) {
    return { frequency: "daily" };
  }
  if (/\b(jours de semaine|lundi au vendredi)\b/.test(text)) {
    return { frequency: "weekdays" };
  }
  const dayMatches = [
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
  ].filter((day) => new RegExp(`\\b${day}s?\\b`).test(text));
  if (dayMatches.length > 0) {
    return {
      frequency: dayMatches.length === 1 ? "weekly" : "specific_days",
      days: dayMatches,
    };
  }
  if (
    /\b(weekly|hebdomadaire|chaque semaine|toutes les semaines)\b/.test(text)
  ) {
    return { frequency: "weekly" };
  }
  return {};
}

export function normalizeDispatcherRecurringOperationInput(
  value: unknown,
): Record<string, unknown> | null {
  const input = objectRecord(value);
  if (!input) return null;
  const recurrence = String(input.recurrence ?? input.frequency ?? "").trim();
  const recurrencePatch = recurrenceFromText(recurrence);
  const day = frenchDay(input.day_of_week);
  const days = Array.isArray(input.days)
    ? input.days.map(frenchDay).filter(Boolean)
    : day
    ? [day]
    : recurrencePatch.days ?? [];
  const frequency = recurrence === "daily" || recurrence === "weekly" ||
      recurrence === "weekdays" || recurrence === "specific_days" ||
      recurrence === "custom"
    ? recurrence
    : recurrencePatch.frequency;
  return {
    ...(frequency ? { frequency } : {}),
    ...(days.length > 0 ? { days } : {}),
    ...(input.time ? { time: input.time } : {}),
    ...(input.message ? { message: input.message } : {}),
  };
}

function dispatcherRecurringOperationInput(
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "create_recurring_reminder"
  ) as (Record<string, unknown> & { operation_input?: unknown }) | undefined;
  return normalizeDispatcherRecurringOperationInput(intent?.operation_input);
}

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
  const activeOperationType = String(
    (frame.active_intake as any)?.operation_type ?? "",
  );
  if (
    activeOperationType &&
    activeOperationType !== "create_recurring_reminder"
  ) return false;
  if (activeOperationType === "create_recurring_reminder") return true;
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

function statusForHandoffAction(
  action: string | null | undefined,
): RecurringReminderHandoffStatus {
  switch (action) {
    case "revise_handoff":
    case "repeat_handoff":
    case "apply_attempt":
    case "handoff_to_one_shot":
    case "cancelled":
    case "topic_change":
      return action;
    default:
      return "clarifying";
  }
}

function handoffStatusFromRouteDecision(
  routeDecision: RouteDecision | null,
): RecurringReminderHandoffStatus | null {
  const reason = String(routeDecision?.reason_code ?? "");
  if (
    reason === "active_handoff_apply_attempt" ||
    reason === "confirmation_yes_is_handoff_apply_attempt" ||
    reason === "platform_handoff_apply_attempt"
  ) return "apply_attempt";
  if (reason === "active_handoff_repeat_handoff") return "repeat_handoff";
  if (reason === "active_handoff_revise_handoff") return "revise_handoff";
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
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
    no_chat_mutation: true,
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
      no_chat_mutation: true,
      draft: args.draft ?? null,
    },
    ...(args.extra ?? {}),
  };
}

function defaultClarificationRunner(args: {
  userId: string;
  requestId?: string | null;
}): ClarificationLlmRunner {
  return async (input) =>
    await generateWithGemini(
      input.system_prompt,
      input.user_prompt,
      0,
      input.json_mode,
      [],
      "auto",
      {
        requestId: args.requestId ?? undefined,
        userId: args.userId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "create_recurring_reminder.handoff_clarification",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
}

async function clarifyHandoffAction(args: {
  userId: string;
  userMessage: string;
  requestId?: string | null;
  state: RecurringReminderHandoffState;
  llmRunner?: ClarificationLlmRunner;
}): Promise<HandoffClarificationOutput> {
  return await runClarificationTool({
    request: buildClarificationRequest({
      clarification_id: args.requestId
        ? `${args.requestId}:create_recurring_reminder_handoff`
        : "create_recurring_reminder_handoff",
      owner: "create_recurring_reminder",
      ambiguity_kind: "handoff_readiness",
      user_message: args.userMessage,
      active_flow_state: args.state,
      known_context: {
        platform_destination: args.state.draft?.recommendation
          .platform_destination ??
          (getHandoffTargetForOperation("create_recurring_reminder")
            ?.user_facing_destination ?? "Rappels"),
        no_chat_mutation: true,
      },
      candidates: [
        {
          id: "revise_handoff",
          label: "modifier la version du rappel récurrent",
          operation_type: "create_recurring_reminder",
          surface_id: getHandoffTargetForOperation(
            "create_recurring_reminder",
          )?.surface_id ?? "recurring_reminders",
        },
        {
          id: "repeat_handoff",
          label: "redonner les éléments à reprendre dans Rappels",
          operation_type: "create_recurring_reminder",
          surface_id: getHandoffTargetForOperation(
            "create_recurring_reminder",
          )?.surface_id ?? "recurring_reminders",
        },
        {
          id: "apply_attempt",
          label: "l'utilisateur demande de programmer depuis le chat",
          operation_type: "create_recurring_reminder",
          surface_id: getHandoffTargetForOperation(
            "create_recurring_reminder",
          )?.surface_id ?? "recurring_reminders",
        },
        {
          id: "handoff_to_one_shot",
          label: "basculer vers un rappel ponctuel",
          operation_type: "create_one_shot_reminder",
          surface_id: "chat",
        },
        {
          id: "cancelled",
          label: "annuler ce brouillon de rappel récurrent",
          operation_type: "create_recurring_reminder",
          surface_id: getHandoffTargetForOperation(
            "create_recurring_reminder",
          )?.surface_id ?? "recurring_reminders",
        },
        {
          id: "topic_change",
          label: "changer clairement de sujet",
          operation_type: null,
          surface_id: null,
        },
      ],
    }),
    llm_runner: args.llmRunner ?? defaultClarificationRunner({
      userId: args.userId,
      requestId: args.requestId,
    }),
    request_id: args.requestId ?? null,
  });
}

async function produceHandoffFromIntake(args: {
  output: Awaited<ReturnType<typeof runCreateRecurringReminderIntake>>;
  nextTempMemory: Record<string, unknown>;
  previousState?: RecurringReminderHandoffState | null;
  status?: RecurringReminderHandoffStatus;
  reasonCode: string;
}): Promise<CreateRecurringReminderRuntimeResult> {
  const draft = args.output.handoff_draft ??
    (args.output.draft
      ? buildRecurringReminderHandoffDraft(args.output.draft)
      : null);
  if (!draft) {
    return {
      content: renderRecurringReminderFailed(),
      nextTempMemory: args.nextTempMemory,
      toolExecution: "failed",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "blocked",
        reasonCode: "handoff_draft_missing",
      }),
    };
  }
  writeRecurringReminderHandoffState(
    args.nextTempMemory,
    handoffState({
      draft,
      status: args.status ?? "handoff_delivered",
      previous: args.previousState ?? null,
    }),
  );
  return {
    content: renderRecurringReminderPlatformHandoff({
      handoffDraft: draft,
      status: args.status ?? "handoff_delivered",
    }),
    nextTempMemory: args.nextTempMemory,
    toolExecution: "platform_handoff",
    executedTools: [],
    committedEffects: [],
    toolSkillRun: platformHandoffRun({
      status: args.status ?? "handoff_delivered",
      draft,
      reasonCode: args.reasonCode,
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
  safetyPregateOutput: { risk_band: RiskBand };
  sourceMessageId: string | null;
  requestId?: string | null;
  v2Runtime?: RecurringReminderRuntimeContext;
  planItemSnapshot?: RecurringReminderPlanItemSnapshotItem[] | null;
  buildPlatformContext?: () => Record<string, unknown>;
  reviewDraft?: typeof reviewCreateRecurringReminderDraft;
  runIntake?: typeof runCreateRecurringReminderIntake;
  runHandoffClarification?: typeof clarifyHandoffAction;
  handoffClarificationRunner?: ClarificationLlmRunner;
  writeRecurringReminder?: unknown;
}): Promise<CreateRecurringReminderRuntimeResult | null> {
  void args.supabase;
  void args.reviewDraft;
  void args.writeRecurringReminder;
  const runIntake = args.runIntake ?? runCreateRecurringReminderIntake;
  const runHandoffClarification = args.runHandoffClarification ??
    clarifyHandoffAction;
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
  if (blocksToolSkills(args.safetyPregateOutput.risk_band)) {
    clearRecurringReminderFrame(nextTempMemory);
    return null;
  }

  if (frame.handoff_state) {
    const forcedStatus = handoffStatusFromRouteDecision(args.routeDecision);
    if (
      forcedStatus === "apply_attempt" ||
      forcedStatus === "repeat_handoff"
    ) {
      const state = {
        ...frame.handoff_state,
        status: forcedStatus,
        turn_count: frame.handoff_state.turn_count + 1,
        updated_at: nowIso(),
      };
      writeRecurringReminderHandoffState(nextTempMemory, state);
      return {
        content: renderRecurringReminderPlatformHandoff({
          handoffDraft: state.draft ?? null,
          status: forcedStatus,
        }),
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status: forcedStatus,
          draft: state.draft ?? null,
          reasonCode: forcedStatus === "apply_attempt"
            ? "apply_attempt_no_chat_mutation"
            : "handoff_repeated",
        }),
      };
    }

    const action = await runHandoffClarification({
      userId: args.userId,
      userMessage: args.userMessage,
      requestId: args.requestId ?? null,
      state: frame.handoff_state,
      llmRunner: args.handoffClarificationRunner,
    });
    if (action.status === "ask" || action.status === "still_ambiguous") {
      const state = {
        ...frame.handoff_state,
        status: "clarifying" as const,
        turn_count: frame.handoff_state.turn_count + 1,
        updated_at: nowIso(),
      };
      writeRecurringReminderHandoffState(nextTempMemory, state);
      return {
        content: renderRecurringReminderAskQuestion({
          question: action.question,
        }),
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status: "clarifying",
          draft: state.draft ?? null,
          reasonCode: "handoff_clarification_needed",
          extra: { clarification: action },
        }),
      };
    }

    const selected = action.status === "cancelled"
      ? "cancelled"
      : action.status === "topic_change"
      ? "topic_change"
      : action.selected_candidate_id;
    const status = statusForHandoffAction(selected);
    if (status === "cancelled" || status === "topic_change") {
      clearRecurringReminderFrame(nextTempMemory);
      return {
        content: renderRecurringReminderCancelled(),
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status,
          draft: frame.handoff_state.draft ?? null,
          reasonCode: status,
          extra: { clarification: action },
        }),
      };
    }
    if (status === "handoff_to_one_shot") {
      clearRecurringReminderFrame(nextTempMemory);
      return {
        content: renderRecurringReminderHandoffToOneShot({
          ack:
            "Ce rappel devient ponctuel. Je laisse le flow de rappel ponctuel le gérer.",
        }),
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status,
          draft: frame.handoff_state.draft ?? null,
          reasonCode: "explicit_one_shot_exit",
          extra: { clarification: action },
        }),
      };
    }
    if (status === "revise_handoff") {
      const output = await runIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: frame.handoff_state.turn_count,
        operation_input: frame.handoff_state.draft
          ? {
            message: frame.handoff_state.draft.content_summary,
            draft_messages: {},
          }
          : null,
        platform_context: buildPlatformContext(),
        request_id: args.requestId ?? null,
      });
      if (output.status === "ask_question") {
        writeRecurringReminderActiveIntake(nextTempMemory, {
          operation_type: "create_recurring_reminder",
          phase: output.phase,
          missing_slots: output.state_patch.missing_slots,
          operation_input: output.state_patch.operation_input ?? {},
          turn_count: frame.handoff_state.turn_count + 1,
          updated_at: nowIso(),
        });
        return {
          content: renderRecurringReminderAskQuestion({
            question: output.next_question?.question,
          }),
          nextTempMemory,
          toolExecution: "platform_handoff",
          executedTools: [],
          committedEffects: [],
          toolSkillRun: platformHandoffRun({
            status: "clarifying",
            draft: frame.handoff_state.draft ?? null,
            reasonCode: "revision_needs_slots",
            extra: { missing_slots: output.state_patch.missing_slots },
          }),
        };
      }
      if (output.status === "handoff_to_one_shot") {
        clearRecurringReminderFrame(nextTempMemory);
        return {
          content: renderRecurringReminderHandoffToOneShot({ ack: output.ack }),
          nextTempMemory,
          toolExecution: "none",
          executedTools: [],
          committedEffects: [],
          toolSkillRun: platformHandoffRun({
            status: "handoff_to_one_shot",
            draft: frame.handoff_state.draft ?? null,
            reasonCode: "revision_to_one_shot",
          }),
        };
      }
      if (output.status === "handoff_ready") {
        return await produceHandoffFromIntake({
          output,
          nextTempMemory,
          previousState: frame.handoff_state,
          status: "revise_handoff",
          reasonCode: "handoff_revised",
        });
      }
    }

    const state = {
      ...frame.handoff_state,
      status,
      turn_count: frame.handoff_state.turn_count + 1,
      updated_at: nowIso(),
    };
    writeRecurringReminderHandoffState(nextTempMemory, state);
    return {
      content: renderRecurringReminderPlatformHandoff({
        handoffDraft: state.draft ?? null,
        status,
      }),
      nextTempMemory,
      toolExecution: "platform_handoff",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status,
        draft: state.draft ?? null,
        reasonCode: status === "apply_attempt"
          ? "apply_attempt_no_chat_mutation"
          : "handoff_repeated",
        extra: { clarification: action },
      }),
    };
  }

  if (
    isPendingRecurringReminderRecommendationOperation(
      frame.pending_recommendation,
    )
  ) {
    const pendingRecommendation = frame.pending_recommendation;
    const confirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRecommendation,
      operation_type: "create_recurring_reminder",
      local_review: (pendingRecommendation as any).draft_review_decision ??
        null,
      request_id: args.requestId ?? null,
    });
    if (confirmationDecision.decision === "reject") {
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderCancelled(),
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status: "cancelled",
          reasonCode: "recommendation_cancelled",
        }),
      };
    }
    if (confirmationDecision.decision !== "approve") return null;

    const output = await runIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
      platform_context: buildPlatformContext(),
      request_id: args.requestId ?? null,
    });
    clearRecurringReminderPendingRecommendation(nextTempMemory);
    if (output.status === "ask_question") {
      writeRecurringReminderActiveIntake(nextTempMemory, {
        operation_type: "create_recurring_reminder",
        phase: output.phase,
        missing_slots: output.state_patch.missing_slots,
        operation_input: output.state_patch.operation_input ?? {},
        turn_count: 1,
        updated_at: nowIso(),
      });
      return {
        content: renderRecurringReminderAskQuestion({
          question: output.next_question?.question,
        }),
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: platformHandoffRun({
          status: "collecting",
          reasonCode: "recommendation_needs_slots",
          extra: { missing_slots: output.state_patch.missing_slots },
        }),
      };
    }
    if (output.status === "handoff_ready") {
      return await produceHandoffFromIntake({
        output,
        nextTempMemory,
        reasonCode: "recommendation_handoff_delivered",
      });
    }
    return {
      content: output.status === "blocked_by_safety"
        ? renderRecurringReminderBlocked({ ack: output.ack })
        : renderRecurringReminderFailed({ ack: output.ack }),
      nextTempMemory,
      toolExecution: "platform_handoff",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "blocked",
        reasonCode: output.status,
      }),
    };
  }

  const activeIntake = objectRecord(frame.active_intake);
  const dispatcherOperationInput = dispatcherRecurringOperationInput(
    args.turnFrame,
  );
  const activeOperationInput = objectRecord(activeIntake?.operation_input);
  const operationInput = dispatcherOperationInput || activeOperationInput
    ? {
      ...(activeOperationInput ?? {}),
      ...(dispatcherOperationInput ?? {}),
    }
    : null;
  const routeExplicitlySelected =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler === "create_recurring_reminder";
  if (!activeIntake && !routeExplicitlySelected) return null;

  const output = await runIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeIntake?.turn_count ?? 0),
    operation_input: operationInput,
    platform_context: buildPlatformContext(),
    request_id: args.requestId ?? null,
  });

  if (output.status === "handoff_to_one_shot") {
    clearRecurringReminderFrame(nextTempMemory);
    return {
      content: renderRecurringReminderHandoffToOneShot({ ack: output.ack }),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "handoff_to_one_shot",
        reasonCode: "one_shot_exit",
      }),
    };
  }

  if (output.status === "ask_question") {
    writeRecurringReminderActiveIntake(nextTempMemory, {
      operation_type: "create_recurring_reminder",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ?? {},
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: nowIso(),
    });
    return {
      content: renderRecurringReminderAskQuestion({
        question: output.next_question?.question,
      }),
      nextTempMemory,
      toolExecution: "platform_handoff",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "collecting",
        reasonCode: "handoff_needs_slots",
        extra: { missing_slots: output.state_patch.missing_slots },
      }),
    };
  }

  if (output.status === "cancelled") {
    clearRecurringReminderFrame(nextTempMemory);
    return {
      content: renderRecurringReminderCancelled({ ack: output.ack }),
      nextTempMemory,
      toolExecution: "platform_handoff",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: platformHandoffRun({
        status: "cancelled",
        reasonCode: "cancelled",
      }),
    };
  }

  if (output.status === "handoff_ready") {
    return await produceHandoffFromIntake({
      output,
      nextTempMemory,
      reasonCode: "handoff_delivered",
    });
  }

  return {
    content: output.status === "blocked_by_safety"
      ? renderRecurringReminderBlocked({ ack: output.ack })
      : renderRecurringReminderFailed({ ack: output.ack }),
    nextTempMemory,
    toolExecution: "platform_handoff",
    executedTools: [],
    committedEffects: [],
    toolSkillRun: platformHandoffRun({
      status: "blocked",
      reasonCode: output.status,
    }),
  };
}
