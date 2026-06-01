import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import { blocksToolSkills } from "../../../safety/safety_thresholds.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationToken,
} from "../../../confirmation/confirmation_token.ts";
import { buildToolConfirmationDecision } from "../_shared/confirmation_adapter.ts";
import type {
  CreateRecurringReminderCommittedEffect,
  CreateRecurringReminderEffect,
} from "./contract.ts";
import { executeCreateRecurringReminder } from "./executor.ts";
import type { RecurringReminderDraftV1 } from "./generator.ts";
import {
  reviewCreateRecurringReminderDraft,
  runCreateRecurringReminderIntake,
} from "./intake.ts";
import {
  clearRecurringReminderFrame,
  clearRecurringReminderPendingRecommendation,
  loadRecurringReminderFrameFromTempMemory,
  writeRecurringReminderActiveIntake,
  writeRecurringReminderPendingConfirmation,
} from "./state.ts";
import { insertRecurringReminderFromDraft } from "./persistence.ts";
import {
  buildRecurringReminderPlatformContext,
  type RecurringReminderPlanItemSnapshotItem,
  type RecurringReminderRuntimeContext,
} from "./platform_context.ts";
import {
  renderRecurringReminderAskQuestion,
  renderRecurringReminderBlocked,
  renderRecurringReminderCancelled,
  renderRecurringReminderDraftReady,
  renderRecurringReminderFailed,
  renderRecurringReminderHandoffToOneShot,
  renderRecurringReminderPendingConfirmation,
} from "./renderer.ts";

export type CreateRecurringReminderRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  committedEffects: CreateRecurringReminderCommittedEffect[];
  toolSkillRun: Record<string, unknown>;
};

type PendingRecurringReminder = {
  operation_id?: string;
  operation_type: "create_recurring_reminder";
  draft: RecurringReminderDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
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

type WriteRecurringReminder = (
  draft: RecurringReminderDraftV1,
  operationId: string | null,
) => Promise<{ recurring_reminder_id: string }>;

function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

function isPendingRecurringReminderOperation(
  value: unknown,
): value is PendingRecurringReminder {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "create_recurring_reminder" &&
      record.draft?.operation_type === "create_recurring_reminder",
  );
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
  if (isPendingRecurringReminderOperation(frame.pending_confirmation)) {
    return true;
  }
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

function recurringReminderDraftOperationInput(
  draft: RecurringReminderDraftV1 | null | undefined,
): Record<string, unknown> {
  const inner = draft?.draft;
  return {
    ...(inner?.frequency ? { frequency: inner.frequency } : {}),
    ...(inner?.days ? { days: inner.days } : {}),
    ...(inner?.time ? { time: inner.time } : {}),
    ...(inner?.message ? { message: inner.message } : {}),
    ...(inner?.destination
      ? { destination: { value: inner.destination } }
      : {}),
    ...(inner?.target_binding ? { target_binding: inner.target_binding } : {}),
    ...(draft?.confirmation_message || draft?.execution_message
      ? {
        draft_messages: {
          confirmation_message: draft?.confirmation_message,
          user_message_brief: draft?.user_message_brief,
          user_message_detailed: draft?.user_message_detailed,
          execution_message: draft?.execution_message,
          revision_message: draft?.revision_message,
        },
      }
      : {}),
  };
}

function createRecurringReminderEffect(args: {
  operationId: string;
  draft: RecurringReminderDraftV1;
}): CreateRecurringReminderEffect {
  return {
    type: "create_recurring_reminder",
    operation_id: args.operationId,
    draft: args.draft,
  };
}

function secret(): string {
  try {
    return String(
      Deno.env.get("CONFIRMATION_TOKEN_SECRET") ??
        Deno.env.get("INTERNAL_FUNCTION_SECRET") ??
        "local-confirmation-secret",
    ).trim();
  } catch {
    return "local-confirmation-secret";
  }
}

async function executeApprovedRecurringReminder(args: {
  userId: string;
  pendingRaw: PendingRecurringReminder;
  safetyRiskBand: RiskBand;
  sourceMessageId: string | null;
  requestId?: string | null;
  writeRecurringReminder: WriteRecurringReminder;
}): Promise<{
  status: "executed" | "blocked" | "failed";
  ack: string;
  committed_effects: CreateRecurringReminderCommittedEffect[];
  recurring_reminder_id?: string;
  reason_code?: string;
}> {
  const operationId = String(
    args.pendingRaw.operation_id ?? crypto.randomUUID(),
  );
  const token = await createConfirmationToken({
    user_id: args.userId,
    operation_id: operationId,
    operation_type: "create_recurring_reminder",
    draft: args.pendingRaw.draft,
    source_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    pending_confirmation_id: operationId,
    secret: secret(),
  });
  const executed = await executeCreateRecurringReminder({
    operation_id: operationId,
    user_id: args.userId,
    draft: args.pendingRaw.draft,
    token,
    safety_pregate_risk_band: args.safetyRiskBand,
    pending_confirmation_lookup: async (id) =>
      id === operationId ? { consumed: false } : null,
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationToken(tokenId),
    write_recurring_reminder: async () =>
      await args.writeRecurringReminder(args.pendingRaw.draft, operationId),
    secret: secret(),
  });
  if (executed.status === "blocked") return executed;
  return {
    status: "executed",
    ack: executed.ack,
    committed_effects: executed.committed_effects,
    recurring_reminder_id: executed.recurring_reminder_id,
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
  writeRecurringReminder?: WriteRecurringReminder;
  reviewDraft?: typeof reviewCreateRecurringReminderDraft;
  runIntake?: typeof runCreateRecurringReminderIntake;
}): Promise<CreateRecurringReminderRuntimeResult | null> {
  void args.supabase;
  const runIntake = args.runIntake ?? runCreateRecurringReminderIntake;
  const reviewDraft = args.reviewDraft ?? reviewCreateRecurringReminderDraft;
  const buildPlatformContext = args.buildPlatformContext ??
    (() =>
      buildRecurringReminderPlatformContext({
        v2Runtime: args.v2Runtime ?? null,
        planItemSnapshot: args.planItemSnapshot ?? null,
      }));
  const writeRecurringReminder: WriteRecurringReminder =
    args.writeRecurringReminder ??
      (async (draft, operationId) => {
        const { data, error } = await insertRecurringReminderFromDraft({
          supabase: args.supabase,
          userId: args.userId,
          draft,
          operationId,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          v2Runtime: args.v2Runtime ?? null,
          planItemSnapshot: args.planItemSnapshot ?? null,
        });
        if (error || !data?.id) {
          throw new Error(error?.message ?? "missing_inserted_id");
        }
        return { recurring_reminder_id: String(data.id) };
      });
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
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return null;
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
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          confirmation_decision: confirmationDecision,
        },
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
    if (output.status === "handoff_to_one_shot") {
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderHandoffToOneShot({ ack: output.ack }),
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "handoff_to_one_shot",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (
      output.status === "pending_confirmation" && output.pending_confirmation
    ) {
      writeRecurringReminderPendingConfirmation(nextTempMemory, {
        ...output.pending_confirmation,
        created_at: new Date().toISOString(),
        turn_count: 0,
      });
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderPendingConfirmation({
          confirmationMessage: output.confirmation?.message,
        }),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "pending_confirmation_from_skill_suggestion",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          draft: output.draft ?? null,
        },
      };
    }
    if (output.status === "ask_question") {
      writeRecurringReminderActiveIntake(nextTempMemory, {
        operation_type: "create_recurring_reminder",
        phase: output.phase,
        missing_slots: output.state_patch.missing_slots,
        operation_input: output.state_patch.operation_input ?? {},
        turn_count: 1,
        updated_at: new Date().toISOString(),
      });
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderAskQuestion({
          question: output.next_question?.question,
        }),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "ask_question_from_skill_suggestion",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          missing_slots: output.state_patch.missing_slots,
        },
      };
    }
    if (output.status === "draft_ready") {
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderDraftReady({
          draft: output.draft,
          ack: output.ack,
        }),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_ready",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          draft: output.draft ?? null,
          committed_effects: [],
        },
      };
    }
    if (output.status === "cancelled") {
      clearRecurringReminderPendingRecommendation(nextTempMemory);
      return {
        content: renderRecurringReminderCancelled({ ack: output.ack }),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          committed_effects: [],
        },
      };
    }
    clearRecurringReminderPendingRecommendation(nextTempMemory);
    return {
      content: output.status === "blocked_by_safety"
        ? renderRecurringReminderBlocked({ ack: output.ack })
        : renderRecurringReminderFailed({ ack: output.ack }),
      nextTempMemory,
      toolExecution: output.status === "blocked_by_safety"
        ? "blocked"
        : "failed",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: output.status,
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  if (isPendingRecurringReminderOperation(frame.pending_confirmation)) {
    const pendingRaw = frame.pending_confirmation;
    const draftReviewDecision = await reviewDraft({
      message: args.userMessage,
      previous_draft: pendingRaw.draft,
      operation_input: recurringReminderDraftOperationInput(pendingRaw.draft),
      request_id: args.requestId ?? null,
    });
    const confirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRaw,
      operation_type: "create_recurring_reminder",
      local_review: draftReviewDecision,
      request_id: args.requestId ?? null,
    });
    if (!draftReviewDecision && confirmationDecision.decision === "unclear") {
      return null;
    }
    if (confirmationDecision.decision === "reject") {
      clearRecurringReminderFrame(nextTempMemory);
      return {
        content: renderRecurringReminderCancelled({
          ack: draftReviewDecision?.generated_user_message,
        }),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision === "explain") {
      return {
        content: draftReviewDecision?.generated_user_message ??
          pendingRaw.draft.confirmation_message,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision === "topic_change") {
      clearRecurringReminderFrame(nextTempMemory);
      return {
        content: draftReviewDecision?.generated_user_message ??
          renderRecurringReminderCancelled(),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "topic_change",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision === "revise") {
      clearRecurringReminderFrame(nextTempMemory);
      const previousOperationInput = recurringReminderDraftOperationInput(
        pendingRaw.draft,
      );
      const revisedOutput = await runIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: 0,
        operation_input: previousOperationInput,
        platform_context: buildPlatformContext(),
        request_id: args.requestId ?? null,
      });
      if (
        revisedOutput.status === "pending_confirmation" &&
        revisedOutput.pending_confirmation
      ) {
        writeRecurringReminderPendingConfirmation(nextTempMemory, {
          ...revisedOutput.pending_confirmation,
          created_at: new Date().toISOString(),
          turn_count: 0,
        });
        return {
          content: revisedOutput.confirmation?.message ??
            revisedOutput.draft?.confirmation_message ??
            "J'ai intégré la modification. Tu veux que je crée ce rappel ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          committedEffects: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            status: "draft_review_updated",
            operation_id:
              (revisedOutput.pending_confirmation as any)?.operation_id ??
                pendingRaw.operation_id ?? null,
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: revisedOutput.draft ?? null,
            confirmation_decision: confirmationDecision,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      if (revisedOutput.status === "ask_question") {
        writeRecurringReminderActiveIntake(nextTempMemory, {
          operation_type: "create_recurring_reminder",
          phase: revisedOutput.phase,
          missing_slots: revisedOutput.state_patch.missing_slots,
          operation_input: revisedOutput.state_patch.operation_input ??
            previousOperationInput,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        });
        return {
          content: revisedOutput.next_question?.question ??
            draftReviewDecision?.generated_user_message ??
            "J'ai intégré la modification. Tu veux préciser quoi exactement ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          committedEffects: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            status: "draft_review_revision_needs_slots",
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: revisedOutput.state_patch.missing_slots,
            confirmation_decision: confirmationDecision,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      writeRecurringReminderActiveIntake(nextTempMemory, {
        operation_type: "create_recurring_reminder",
        phase: "recurrence_resolution",
        missing_slots: [],
        operation_input: previousOperationInput,
        turn_count: 0,
        updated_at: new Date().toISOString(),
      });
      return {
        content: draftReviewDecision?.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_revision_requested",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision !== "approve") {
      return {
        content: draftReviewDecision?.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_unclear",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (!confirmationDecision.executable) {
      return {
        content: pendingRaw.draft.confirmation_message,
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "approval_requires_explicit_user_confirmation",
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }

    const operationId = String(
      pendingRaw.operation_id ?? crypto.randomUUID(),
    );
    const createEffect = createRecurringReminderEffect({
      operationId,
      draft: pendingRaw.draft,
    });
    let executed;
    try {
      executed = await executeApprovedRecurringReminder({
        userId: args.userId,
        pendingRaw: { ...pendingRaw, operation_id: operationId },
        safetyRiskBand: args.safetyPregateOutput.risk_band,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId ?? null,
        writeRecurringReminder,
      });
    } catch (error) {
      executed = {
        status: "failed" as const,
        ack: renderRecurringReminderFailed(),
        committed_effects: [] as CreateRecurringReminderCommittedEffect[],
        reason_code: error instanceof Error ? error.message : String(error),
      };
    }
    clearRecurringReminderFrame(nextTempMemory);
    const committedEffects = executed.committed_effects ?? [];
    if (executed.status !== "executed" || committedEffects.length === 0) {
      return {
        content: executed.status === "blocked"
          ? renderRecurringReminderBlocked({
            ack: executed.ack,
            reasonCode: executed.reason_code,
          })
          : renderRecurringReminderFailed({
            ack: executed.ack,
            reasonCode: executed.reason_code,
          }),
        nextTempMemory,
        toolExecution: executed.status === "blocked" ? "blocked" : "failed",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: executed.status,
          operation_id: operationId,
          requested_effects: [createEffect],
          allowed_effects: [createEffect],
          committed_effects: [],
          error: executed.reason_code ?? "executor_not_executed",
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    return {
      content: executed.ack,
      nextTempMemory,
      toolExecution: "success",
      executedTools: committedEffects.length > 0
        ? ["create_recurring_reminder"]
        : [],
      committedEffects,
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "executed",
        operation_id: operationId,
        recurring_reminder_id: executed.recurring_reminder_id,
        requested_effects: [createEffect],
        allowed_effects: [createEffect],
        committed_effects: committedEffects,
        draft_review_decision: draftReviewDecision,
      },
    };
  }

  const activeIntake = frame.active_intake as any;
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
    operation_input: activeIntake?.operation_input ?? null,
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
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "handoff_to_one_shot",
        user_intent: output.state_patch.intake_state?.user_intent ??
          "one_shot_handoff",
      },
    };
  }

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    writeRecurringReminderPendingConfirmation(nextTempMemory, {
      ...output.pending_confirmation,
      created_at: new Date().toISOString(),
      turn_count: 0,
    });
    return {
      content: renderRecurringReminderPendingConfirmation({
        confirmationMessage: output.confirmation?.message,
      }),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    writeRecurringReminderActiveIntake(nextTempMemory, {
      operation_type: "create_recurring_reminder",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ?? {},
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
    return {
      content: renderRecurringReminderAskQuestion({
        question: output.next_question?.question,
      }),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      committedEffects: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  if (output.status === "cancelled" || output.status === "draft_ready") {
    clearRecurringReminderFrame(nextTempMemory);
  }

  return {
    content: output.status === "cancelled"
      ? renderRecurringReminderCancelled({ ack: output.ack })
      : output.status === "draft_ready"
      ? renderRecurringReminderDraftReady({
        draft: output.draft,
        ack: output.ack,
      })
      : output.status === "blocked_by_safety"
      ? renderRecurringReminderBlocked({ ack: output.ack })
      : renderRecurringReminderFailed({ ack: output.ack }),
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ||
        output.status === "cancelled" || output.status === "draft_ready"
      ? "blocked"
      : "failed",
    executedTools: [],
    committedEffects: [],
    toolSkillRun: {
      selected_handler: "create_recurring_reminder",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}
