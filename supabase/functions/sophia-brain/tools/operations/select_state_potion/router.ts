/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { createConfirmationToken } from "../../../confirmation/confirmation_token.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import { loadPotionBaseContext } from "../../../../_shared/potion-base-context.ts";
import { buildToolConfirmationDecision } from "../_shared/confirmation_adapter.ts";
import {
  hardConsentGuards,
  isExplicitSelectStatePotionRequest,
  isPendingStatePotionOperation,
  isPendingStatePotionRecommendationOperation,
  legacySemanticDetectors,
  noPotionReply,
  selectStatePotionRouteIsSelected,
  statePotionDeclineReply,
} from "./policy.ts";
import type {
  SelectStatePotionCommittedEffect,
  SelectStatePotionConstraint,
  SelectStatePotionEffect,
  SelectStatePotionSkillResult,
  SelectStatePotionUserIntent,
} from "./contract.ts";
import { writeStatePotionActivation } from "./persistence.ts";
import {
  generatePotionSessionDraftWithAi,
  type PotionSessionDraftGeneratorInput,
  type PotionSessionDraftV1,
} from "./generator.ts";
import { runSelectStatePotionIntake } from "./intake.ts";
import { reviewSelectStatePotionDraft } from "./draft_validation.ts";
import { executeActivateStatePotion } from "./executor.ts";
import { renderSelectStatePotionSkillResult } from "./renderer.ts";
import {
  clearPotionFollowupConsent,
  clearSelectStatePotionFrame,
  loadSelectStatePotionFrameFromTempMemory,
  markPotionFollowupConsentRefused,
  readPotionFollowupConsent,
  writeSelectStatePotionActiveIntake,
  writeSelectStatePotionPendingConfirmation,
  writeSelectStatePotionPendingRecommendation,
} from "./state.ts";

type ToolExecutionStatus =
  | "none"
  | "blocked"
  | "success"
  | "failed"
  | "uncertain";

type SelectStatePotionRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: ToolExecutionStatus;
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

type RecentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function envString(name: string, fallback = ""): string {
  try {
    return String(Deno.env.get(name) ?? fallback);
  } catch {
    return fallback;
  }
}

function riskBandForStatePotionExecution(
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>,
): ReturnType<typeof runSafetyPregate>["risk_band"] {
  const reasonCodes = Array.isArray(safetyPregateOutput.reason_codes)
    ? safetyPregateOutput.reason_codes
    : [];
  const evidence = Array.isArray(safetyPregateOutput.evidence)
    ? safetyPregateOutput.evidence
    : [];
  const isRecentContextOnlyMedium =
    safetyPregateOutput.risk_band === "medium" &&
    evidence.length === 0 &&
    reasonCodes.length > 0 &&
    reasonCodes.every((code) => code === "recent_safety_context_caution");
  return isRecentContextOnlyMedium ? "none" : safetyPregateOutput.risk_band;
}

function recentUserMessagesFromHistory(history: unknown): string[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message: any) =>
      message?.role === "user" && typeof message?.content === "string"
    )
    .map((message: any) => String(message.content))
    .filter((content) => content.trim())
    .slice(-8);
}

function recentMessagesFromHistory(history: unknown): RecentChatMessage[] {
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

function effectLedger(args?: {
  requested_effects?: SelectStatePotionEffect[];
  allowed_effects?: SelectStatePotionEffect[];
  blocked_effects?: Array<{ type: string; reason_code: string }>;
  committed_effects?: SelectStatePotionCommittedEffect[];
}) {
  return {
    requested_effects: args?.requested_effects ?? [],
    allowed_effects: args?.allowed_effects ?? [],
    blocked_effects: args?.blocked_effects ?? [],
    committed_effects: args?.committed_effects ?? [],
  };
}

function skillResult(args: {
  handled?: boolean;
  status: SelectStatePotionSkillResult["status"];
  user_intent: SelectStatePotionUserIntent;
  reply?: string | null;
  additional_replies?: string[];
  constraints?: SelectStatePotionConstraint[];
  requested_effects?: SelectStatePotionEffect[];
  allowed_effects?: SelectStatePotionEffect[];
  blocked_effects?: Array<{ type: string; reason_code: string }>;
  committed_effects?: SelectStatePotionCommittedEffect[];
  pending_confirmation?: Record<string, unknown> | null;
  updated_state?: SelectStatePotionSkillResult["updated_state"];
  handoff?: { target: string } | null;
  reason_code: string;
  evidence?: string[];
}): SelectStatePotionSkillResult {
  const requested_effects = args.requested_effects ?? [];
  const allowed_effects = args.allowed_effects ?? [];
  const blocked_effects = args.blocked_effects ?? [];
  const committed_effects = args.committed_effects ?? [];
  return {
    handled: args.handled ?? true,
    status: args.status,
    user_intent: args.user_intent,
    constraints: args.constraints ?? [],
    updated_state: args.updated_state,
    reply: args.reply ?? null,
    additional_replies: args.additional_replies,
    requested_effects,
    allowed_effects,
    blocked_effects,
    committed_effects,
    effect_ledger: effectLedger({
      requested_effects,
      allowed_effects,
      blocked_effects,
      committed_effects,
    }),
    pending_confirmation: args.pending_confirmation,
    handoff: args.handoff,
    debug: {
      reason_code: args.reason_code,
      evidence: args.evidence ?? [],
    },
  };
}

function adaptSkillResultToRuntime(args: {
  result: SelectStatePotionSkillResult;
  nextTempMemory: any;
  toolExecution: ToolExecutionStatus;
  executedTools?: string[];
}): SelectStatePotionRuntimeResult {
  const committed = args.result.committed_effects.length > 0;
  return {
    content: renderSelectStatePotionSkillResult(args.result),
    additionalContents: args.result.additional_replies,
    nextTempMemory: args.nextTempMemory,
    toolExecution: args.toolExecution,
    executedTools: committed ? args.executedTools ?? ["select_state_potion"] : [],
    toolSkillRun: {
      selected_handler: "select_state_potion",
      ...args.result,
      reason_code: args.result.debug.reason_code,
    },
  };
}

function activationEffect(args: {
  operationId: string;
  draft: PotionSessionDraftV1;
  suppressFollowUp: boolean;
}): SelectStatePotionEffect {
  return {
    type: "activate_state_potion",
    operation_id: args.operationId,
    draft: args.draft,
    suppress_follow_up_scheduling: args.suppressFollowUp,
  };
}

function constraint(
  kind: SelectStatePotionConstraint["kind"],
  evidence: string[],
) {
  return { kind, evidence } satisfies SelectStatePotionConstraint;
}

function reducePotionDraftReview(args: {
  decision: { decision: string; generated_user_message?: string | null };
  evidence: string[];
}): Pick<
  SelectStatePotionSkillResult,
  "status" | "user_intent" | "debug"
> {
  switch (args.decision.decision) {
    case "reject":
      return {
        status: "cancelled",
        user_intent: "reject",
        debug: {
          reason_code: "draft_review_rejected",
          evidence: args.evidence,
        },
      };
    case "explain":
      return {
        status: "explained",
        user_intent: "explain",
        debug: {
          reason_code: "draft_review_explained",
          evidence: args.evidence,
        },
      };
    case "revise":
      return {
        status: "revised",
        user_intent: "revise",
        debug: {
          reason_code: "draft_review_revision_requested",
          evidence: args.evidence,
        },
      };
    case "approve":
      return {
        status: "executed",
        user_intent: "activate",
        debug: {
          reason_code: "draft_review_approved",
          evidence: args.evidence,
        },
      };
    default:
      return {
        status: "ask_question",
        user_intent: "clarify",
        debug: { reason_code: "draft_review_unclear", evidence: args.evidence },
      };
  }
}

export async function maybeRunSelectStatePotionOperation(args: {
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
  recentUserMessages?: string[];
  recentMessages?: RecentChatMessage[];
  draftReviewOverride?: typeof reviewSelectStatePotionDraft;
  writeStatePotionActivationOverride?: typeof writeStatePotionActivation;
}): Promise<SelectStatePotionRuntimeResult | null> {
  const routeSelected = selectStatePotionRouteIsSelected({
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  }) || isExplicitSelectStatePotionRequest(args.userMessage);
  if (!routeSelected) return null;

  const recentUserMessages = args.recentUserMessages ??
    recentUserMessagesFromHistory(args.history);
  const recentMessages = args.recentMessages ??
    recentMessagesFromHistory(args.history);
  const reviewDraft = args.draftReviewOverride ?? reviewSelectStatePotionDraft;
  const writeActivation = args.writeStatePotionActivationOverride ??
    writeStatePotionActivation;
  let nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadSelectStatePotionFrameFromTempMemory(nextTempMemory);
  const pendingRaw = frame.pending;
  const pendingRecommendation = frame.recommendation;
  const activeIntake = frame.active as any;
  const potionFlowActive = isPendingStatePotionOperation(pendingRaw) ||
    activeIntake?.operation_type === "select_state_potion" ||
    isPendingStatePotionRecommendationOperation(pendingRecommendation);

  if (
    hardConsentGuards.detectsExplicitNoPotionRequest(args.userMessage) ||
    (potionFlowActive &&
      hardConsentGuards.detectsExplicitStatePotionExit(args.userMessage))
  ) {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    const noPotion = constraint("no_potion", [args.userMessage]);
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: "cancelled",
        user_intent: "forbid_potion",
        reply: noPotionReply(args.userMessage),
        constraints: [noPotion],
        blocked_effects: [{
          type: "activate_state_potion",
          reason_code: "no_potion",
        }],
        reason_code: "select_state_potion_no_potion_constraint",
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: "blocked",
    });
  }

  if (
    potionFlowActive &&
    legacySemanticDetectors.looksLikeOneShotReminderHandoff(args.userMessage) &&
    hardConsentGuards.detectsPotionFollowUpRefusal(args.userMessage)
  ) {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: "handoff",
        user_intent: "one_shot_reminder_handoff",
        reply: "",
        constraints: [constraint("no_followup", [args.userMessage])],
        handoff: { target: "create_one_shot_reminder" },
        reason_code: "explicit_one_shot_reminder_supersedes_potion_flow",
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: "none",
    });
  }

  const draftGeneratorWithDbContext = async (
    input: PotionSessionDraftGeneratorInput,
  ) => {
    const baseContext = await loadPotionBaseContext({
      admin: args.supabase,
      userId: args.userId,
      potionType: input.potion_type,
      relatedPlanItemId: input.context?.related_plan_item_id ?? null,
    });
    return await generatePotionSessionDraftWithAi({
      ...input,
      base_context: baseContext,
    });
  };

  const currentFollowupRefusal = hardConsentGuards.detectsPotionFollowUpRefusal(
    args.userMessage,
  );
  const recentFollowupRefusals = recentUserMessages.filter((m) =>
    hardConsentGuards.detectsPotionFollowUpRefusal(m)
  );
  if (currentFollowupRefusal) {
    nextTempMemory = markPotionFollowupConsentRefused(nextTempMemory);
  }
  if (recentFollowupRefusals.length > 0) {
    nextTempMemory = markPotionFollowupConsentRefused(nextTempMemory);
  }
  const followUpConsentRefused =
    readPotionFollowupConsent(nextTempMemory) === "refused";
  const followUpConstraints = followUpConsentRefused
    ? [
      constraint("no_followup", [
        ...(currentFollowupRefusal ? [args.userMessage] : []),
        ...recentFollowupRefusals,
        ...(currentFollowupRefusal || recentFollowupRefusals.length > 0
          ? []
          : ["persisted_followup_refusal"]),
      ]),
    ]
    : [];

  if (isPendingStatePotionOperation(pendingRaw)) {
    const draftReviewDecision = await reviewDraft({
      message: args.userMessage,
      previous_draft: pendingRaw.draft,
      request_id: args.requestId ?? null,
    });
    if (!draftReviewDecision) return null;
    const draftReview = reducePotionDraftReview({
      decision: draftReviewDecision,
      evidence: [args.userMessage],
    });
    if (draftReviewDecision.decision === "reject") {
      nextTempMemory = writeSelectStatePotionPendingConfirmation(
        nextTempMemory,
        null,
      );
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: draftReview.status,
          user_intent: draftReview.user_intent,
          reply: draftReviewDecision.generated_user_message ?? "",
          constraints: followUpConstraints,
          reason_code: draftReview.debug.reason_code,
          evidence: draftReview.debug.evidence,
          pending_confirmation: null,
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    if (draftReviewDecision.decision === "explain") {
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: draftReview.status,
          user_intent: draftReview.user_intent,
          reply: draftReviewDecision.generated_user_message ??
            pendingRaw.draft.confirmation_message,
          constraints: followUpConstraints,
          reason_code: draftReview.debug.reason_code,
          evidence: draftReview.debug.evidence,
          pending_confirmation: pendingRaw as unknown as Record<
            string,
            unknown
          >,
        }),
        nextTempMemory,
        toolExecution: "none",
      });
    }
    if (draftReviewDecision.decision === "revise") {
      nextTempMemory = writeSelectStatePotionPendingConfirmation(
        nextTempMemory,
        null,
      );
      const previousOperationInput = {
        ...(((pendingRaw as any).operation_input &&
            typeof (pendingRaw as any).operation_input === "object" &&
            !Array.isArray((pendingRaw as any).operation_input))
          ? (pendingRaw as any).operation_input
          : {}),
        ...((pendingRaw as any).intake_state
          ? { intake_state: (pendingRaw as any).intake_state }
          : {}),
        previous_draft: pendingRaw.draft,
        revision_request: args.userMessage,
      };
      const revisionOutput = await runSelectStatePotionIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        recent_messages: recentMessages,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        operation_input: previousOperationInput,
        request_id: args.requestId ?? null,
        draft_generator: draftGeneratorWithDbContext,
      });
      if (
        revisionOutput.status === "pending_confirmation" &&
        revisionOutput.pending_confirmation
      ) {
        nextTempMemory = writeSelectStatePotionPendingConfirmation(
          nextTempMemory,
          {
            ...revisionOutput.pending_confirmation,
            operation_input: revisionOutput.state_patch.operation_input ??
              previousOperationInput,
            intake_state: revisionOutput.state_patch.intake_state ??
              (pendingRaw as any).intake_state ?? null,
            created_at: new Date().toISOString(),
            turn_count: 0,
            supersedes_operation_id: pendingRaw.operation_id ?? null,
          },
        );
        nextTempMemory = writeSelectStatePotionActiveIntake(
          nextTempMemory,
          null,
        );
        return adaptSkillResultToRuntime({
          result: skillResult({
            status: "pending_confirmation",
            user_intent: "revise",
            reply: revisionOutput.confirmation?.message ??
              revisionOutput.draft?.confirmation_message ??
              draftReviewDecision.generated_user_message ?? "",
            constraints: followUpConstraints,
            pending_confirmation: revisionOutput.pending_confirmation as
              | Record<string, unknown>
              | null,
            reason_code: "draft_review_revision_pending_confirmation",
            evidence: [args.userMessage],
          }),
          nextTempMemory,
          toolExecution: "blocked",
        });
      }
      if (revisionOutput.status === "ask_question") {
        nextTempMemory = writeSelectStatePotionActiveIntake(nextTempMemory, {
          operation_type: "select_state_potion",
          phase: revisionOutput.phase,
          missing_slots: revisionOutput.state_patch.missing_slots,
          operation_input: revisionOutput.state_patch.operation_input ??
            previousOperationInput,
          intake_state: revisionOutput.state_patch.intake_state ??
            (pendingRaw as any).intake_state ?? null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        });
        return adaptSkillResultToRuntime({
          result: skillResult({
            status: "ask_question",
            user_intent: "revise",
            reply: revisionOutput.next_question?.question ??
              draftReviewDecision.generated_user_message ?? "",
            constraints: followUpConstraints,
            updated_state: revisionOutput.state_patch.intake_state ?? null,
            reason_code: "draft_review_revision_needs_slots",
            evidence: [args.userMessage],
          }),
          nextTempMemory,
          toolExecution: "blocked",
        });
      }
      nextTempMemory = writeSelectStatePotionActiveIntake(nextTempMemory, {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        missing_slots: revisionOutput.state_patch.missing_slots ?? [],
        operation_input: revisionOutput.state_patch.operation_input ??
          previousOperationInput,
        intake_state: revisionOutput.state_patch.intake_state ??
          (pendingRaw as any).intake_state ?? null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      });
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: "revised",
          user_intent: draftReview.user_intent,
          reply: revisionOutput.ack ??
            draftReviewDecision.generated_user_message ??
            "",
          constraints: followUpConstraints,
          updated_state: revisionOutput.state_patch.intake_state ?? null,
          reason_code: draftReview.debug.reason_code,
          evidence: draftReview.debug.evidence,
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    if (draftReviewDecision.decision !== "approve") {
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: draftReview.status,
          user_intent: draftReview.user_intent,
          reply: draftReviewDecision.generated_user_message ?? "",
          constraints: followUpConstraints,
          pending_confirmation: pendingRaw as unknown as Record<
            string,
            unknown
          >,
          reason_code: draftReview.debug.reason_code,
          evidence: draftReview.debug.evidence,
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }

    const operationId = String(pendingRaw.operation_id ?? crypto.randomUUID());
    const activateEffect = activationEffect({
      operationId,
      draft: pendingRaw.draft,
      suppressFollowUp: followUpConsentRefused,
    });
    const token = await createConfirmationToken({
      user_id: args.userId,
      operation_id: operationId,
      operation_type: "select_state_potion",
      draft: pendingRaw.draft,
      source_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      pending_confirmation_id: operationId,
      secret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    });
    const executed = await executeActivateStatePotion({
      operation_id: operationId,
      user_id: args.userId,
      draft: pendingRaw.draft,
      token,
      safety_pregate_risk_band: riskBandForStatePotionExecution(
        args.safetyPregateOutput,
      ),
      pending_confirmation_lookup: async (id) =>
        id === operationId ? { consumed: false } : null,
      token_consumption_check: async () => false,
      suppress_follow_up_scheduling: followUpConsentRefused,
      write_potion_activation: async ({ draft, scheduled_followups }) =>
        await writeActivation({
          supabase: args.supabase,
          userId: args.userId,
          draft,
          scheduledFollowups: scheduled_followups,
          suppressFollowUp: followUpConsentRefused,
          operationId,
          requestId: args.requestId ?? null,
          sourceMessageId: args.sourceMessageId,
        }),
      secret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    });
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    if (executed.status !== "executed") {
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: "blocked",
          user_intent: "activate",
          reply: executed.ack,
          constraints: followUpConstraints,
          requested_effects: [activateEffect],
          allowed_effects: [activateEffect],
          reason_code: executed.reason_code,
          evidence: [args.userMessage],
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    const committedEffect: SelectStatePotionCommittedEffect = {
      type: "activate_state_potion",
      operation_id: operationId,
      potion_session_id: executed.potion_session_id,
      recurring_reminder_id: executed.recurring_reminder_id,
      scheduled_checkin_ids: executed.scheduled_checkin_ids,
    };
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: "executed",
        user_intent: "activate",
        reply: executed.messages.instant_support_message,
        additional_replies: [executed.messages.potion_info_message],
        constraints: followUpConstraints,
        requested_effects: [activateEffect],
        allowed_effects: [activateEffect],
        committed_effects: [committedEffect],
        reason_code: "activate_state_potion_executed",
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: "success",
    });
  }

  if (isPendingStatePotionRecommendationOperation(pendingRecommendation)) {
    const confirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRecommendation,
      operation_type: "select_state_potion",
      local_review: (pendingRecommendation as any).draft_review_decision ??
        null,
      request_id: args.requestId ?? null,
    });
    if (confirmationDecision.decision === "reject") {
      nextTempMemory = writeSelectStatePotionPendingRecommendation(
        nextTempMemory,
        null,
      );
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: "cancelled",
          user_intent: "reject",
          reply: statePotionDeclineReply(args.userMessage),
          constraints: followUpConstraints,
          reason_code: "recommendation_rejected",
          evidence: [args.userMessage],
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    if (confirmationDecision.decision !== "approve") return null;

    const output = await runSelectStatePotionIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      recent_messages: recentMessages,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
      request_id: args.requestId ?? null,
      draft_generator: draftGeneratorWithDbContext,
    });
    nextTempMemory = writeSelectStatePotionPendingRecommendation(
      nextTempMemory,
      null,
    );
    if (
      output.status === "pending_confirmation" && output.pending_confirmation
    ) {
      nextTempMemory = writeSelectStatePotionPendingConfirmation(
        nextTempMemory,
        {
          ...output.pending_confirmation,
          operation_input: output.state_patch.operation_input ?? null,
          intake_state: output.state_patch.intake_state ?? null,
          created_at: new Date().toISOString(),
          turn_count: 0,
        },
      );
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: "pending_confirmation",
          user_intent: "draft_only",
          reply: output.confirmation?.message ?? output.ack ?? "",
          constraints: followUpConstraints,
          pending_confirmation: output.pending_confirmation as
            | Record<string, unknown>
            | null,
          reason_code: "pending_confirmation_from_recommendation",
          evidence: [args.userMessage],
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    if (output.status === "ask_question") {
      nextTempMemory = writeSelectStatePotionActiveIntake(nextTempMemory, {
        operation_type: "select_state_potion",
        phase: output.phase,
        missing_slots: output.state_patch.missing_slots,
        operation_input: output.state_patch.operation_input ?? {},
        intake_state: output.state_patch.intake_state ?? null,
        turn_count: 1,
        updated_at: new Date().toISOString(),
      });
      return adaptSkillResultToRuntime({
        result: skillResult({
          status: "ask_question",
          user_intent: "clarify",
          reply: output.next_question?.question ?? output.ack ?? "",
          constraints: followUpConstraints,
          updated_state: output.state_patch.intake_state ?? null,
          reason_code: "ask_question_from_recommendation",
          evidence: [args.userMessage],
        }),
        nextTempMemory,
        toolExecution: "blocked",
      });
    }
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: output.status === "blocked_by_safety" ? "blocked" : "failed",
        user_intent: "unknown",
        reply: output.ack ?? "",
        constraints: followUpConstraints,
        reason_code: `recommendation_${output.status}`,
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: output.status === "blocked_by_safety"
        ? "blocked"
        : "failed",
    });
  }

  const activeOperationInput = activeIntake?.operation_type ===
      "select_state_potion"
    ? {
      ...((activeIntake.operation_input &&
          typeof activeIntake.operation_input === "object" &&
          !Array.isArray(activeIntake.operation_input))
        ? activeIntake.operation_input
        : {}),
      ...((activeIntake.intake_state &&
          typeof activeIntake.intake_state === "object" &&
          !Array.isArray(activeIntake.intake_state))
        ? { intake_state: activeIntake.intake_state }
        : {}),
    }
    : {};
  const output = await runSelectStatePotionIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    recent_messages: recentMessages,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeIntake?.turn_count ?? 0),
    operation_input: activeOperationInput,
    request_id: args.requestId ?? null,
    draft_generator: draftGeneratorWithDbContext,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory = writeSelectStatePotionPendingConfirmation(
      nextTempMemory,
      {
        ...output.pending_confirmation,
        operation_input: output.state_patch.operation_input ??
          (output.pending_confirmation as any).operation_input ?? null,
        intake_state: output.state_patch.intake_state ??
          (output.pending_confirmation as any).intake_state ?? null,
        created_at: new Date().toISOString(),
        turn_count: 0,
      },
    );
    nextTempMemory = writeSelectStatePotionActiveIntake(nextTempMemory, null);
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: "pending_confirmation",
        user_intent: "draft_only",
        reply: output.confirmation?.message ??
          output.ack ?? "",
        constraints: followUpConstraints,
        pending_confirmation: output.pending_confirmation as
          | Record<string, unknown>
          | null,
        reason_code: "pending_confirmation",
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: "blocked",
    });
  }

  if (output.status === "ask_question") {
    nextTempMemory = writeSelectStatePotionActiveIntake(nextTempMemory, {
      operation_type: "select_state_potion",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        activeOperationInput,
      intake_state: output.state_patch.intake_state ?? null,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
    return adaptSkillResultToRuntime({
      result: skillResult({
        status: "ask_question",
        user_intent: output.phase === "potion_choice"
          ? "choose_potion"
          : "provide_detail",
        reply: output.next_question?.question ?? output.ack ?? "",
        constraints: followUpConstraints,
        updated_state: output.state_patch.intake_state ?? null,
        reason_code: "ask_question",
        evidence: [args.userMessage],
      }),
      nextTempMemory,
      toolExecution: "blocked",
    });
  }

  nextTempMemory = clearPotionFollowupConsent(nextTempMemory);
  return adaptSkillResultToRuntime({
    result: skillResult({
      status: output.status === "blocked_by_safety" ? "blocked" : "failed",
      user_intent: "unknown",
      reply: output.ack ??
        "",
      constraints: followUpConstraints,
      reason_code: output.status,
      evidence: [args.userMessage],
    }),
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
  });
}
