/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  buildConfirmationDecisionFromSkillReview,
  normalizeSkillConfirmationReview,
} from "../../../router/confirmation_contract.ts";
import {
  createConfirmationToken,
} from "../../../confirmation/confirmation_token.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import type { CoachPreferencesPatchDraftV1 } from "./generator.ts";
import type {
  UpdateCoachPreferencesCommittedEffect,
  UpdateCoachPreferencesEffect,
  UpdateCoachPreferencesSkillResult,
  UpdateCoachPreferenceUserIntent,
} from "./contract.ts";
import {
  reviewUpdateCoachPreferencesDraft,
  runUpdateCoachPreferencesIntake,
} from "./intake.ts";
import { executeUpdateCoachPreferences } from "./executor.ts";
import {
  clearCoachPreferenceFrame,
  loadCoachPreferenceFrameFromTempMemory,
  writeCoachPreferenceActiveIntake,
  writeCoachPreferencePendingConfirmation,
} from "./state.ts";
import {
  detectsCoachPreferenceDirectionContradictionForSkill,
  isCoachPreferenceExplicitApproval,
} from "./route_guards.ts";
export { detectsCoachPreferenceDirectionContradictionForSkill } from "./route_guards.ts";
import {
  buildCoachPreferencesStatusReply,
  upsertCoachPreferencesFromDraft,
} from "./status.ts";
import {
  renderCoachPreferencesExecuted,
  renderCoachPreferencesSkillResult,
} from "./renderer.ts";

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

function buildSkillResult(input: {
  handled?: boolean;
  status: UpdateCoachPreferencesSkillResult["status"];
  user_intent?: UpdateCoachPreferenceUserIntent;
  reply: string | null;
  requested_effects?: UpdateCoachPreferencesEffect[];
  allowed_effects?: UpdateCoachPreferencesEffect[];
  committed_effects?: UpdateCoachPreferencesCommittedEffect[];
  blocked_effects?: Array<{ type: string; reason_code: string }>;
  pending_confirmation?: Record<string, unknown> | null;
  updated_state?: unknown;
  reason_code: string;
  evidence?: string[];
}): UpdateCoachPreferencesSkillResult {
  return {
    handled: input.handled ?? true,
    status: input.status,
    user_intent: input.user_intent ?? "unknown",
    updated_state: input.updated_state,
    reply: input.reply,
    requested_effects: input.requested_effects ?? [],
    allowed_effects: input.allowed_effects ?? [],
    committed_effects: input.committed_effects ?? [],
    blocked_effects: input.blocked_effects ?? [],
    pending_confirmation: input.pending_confirmation ?? null,
    debug: {
      reason_code: input.reason_code,
      evidence: input.evidence ?? [],
    },
  };
}

function toolExecutionForSkillResult(
  result: UpdateCoachPreferencesSkillResult,
): OperationRuntimeResult["toolExecution"] {
  if (result.committed_effects.length > 0) return "success";
  if (result.status === "failed") return "failed";
  if (
    result.status === "blocked" ||
    result.status === "pending_confirmation" ||
    result.status === "ask_question" ||
    result.status === "cancelled" ||
    result.status === "revised"
  ) return "blocked";
  return "none";
}

function skillResultToRuntimeResult(input: {
  result: UpdateCoachPreferencesSkillResult;
  nextTempMemory: any;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  return {
    content: renderCoachPreferencesSkillResult(input.result),
    nextTempMemory: input.nextTempMemory,
    toolExecution: toolExecutionForSkillResult(input.result),
    executedTools: input.result.committed_effects.length > 0
      ? ["update_coach_preferences"]
      : [],
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      status: input.result.status,
      user_intent: input.result.user_intent,
      requested_effects: input.result.requested_effects,
      allowed_effects: input.result.allowed_effects,
      committed_effects: input.result.committed_effects,
      blocked_effects: input.result.blocked_effects,
      pending_confirmation: input.result.pending_confirmation,
      debug: input.result.debug,
      ...input.extraToolSkillRun,
    },
  };
}

function envString(name: string, fallback = ""): string {
  try {
    return String(Deno.env.get(name) ?? fallback);
  } catch {
    return fallback;
  }
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPendingCoachPreferencesOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "update_coach_preferences";
  draft: CoachPreferencesPatchDraftV1;
  intake_state?: unknown;
  turn_count?: number;
} {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return Boolean(
    record?.operation_type === "update_coach_preferences" &&
      (record.draft as any)?.operation_type === "update_coach_preferences" &&
      (record.draft as any)?.draft?.patch,
  );
}

function routeIsSelected(args: {
  operationType: "update_coach_preferences";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadCoachPreferenceFrameFromTempMemory(args.tempMemory);
  if (isPendingCoachPreferencesOperation(frame.pending)) return true;
  if (frame.pending) return false;
  if (frame.active?.operation_type === args.operationType) return true;
  if (frame.active?.operation_type) return false;
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

function isOperationEscapeMessage(message: string): boolean {
  const text = normalizeText(message);
  return (
    /\b(resume|recap|recapitule|qu est ce qui existe|ce qui existe|dans mon plan|sans inventer)\b/
      .test(text) ||
    /\b(pas maintenant|annule|annuler|laisse tomber|oublie|stop|pas d action|pas de plan|je veux juste rester|juste une phrase|une seule phrase|rester sur l apaisement|apaisement|fond de honte)\b/
      .test(text)
  );
}

async function executeConfirmedCoachPreferenceDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  operationId: string;
  draft: CoachPreferencesPatchDraftV1;
}) {
  const secret = envString(
    "CONFIRMATION_TOKEN_SECRET",
    envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
  );
  const token = await createConfirmationToken({
    user_id: args.userId,
    operation_id: args.operationId,
    operation_type: "update_coach_preferences",
    draft: args.draft,
    source_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    pending_confirmation_id: args.operationId,
    secret,
  });
  try {
    return await executeUpdateCoachPreferences({
      operation_id: args.operationId,
      user_id: args.userId,
      draft: args.draft,
      token,
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      pending_confirmation_lookup: async (id) =>
        id === args.operationId ? { consumed: false } : null,
      token_consumption_check: async () => false,
      write_preferences_patch: async () => {
        const { data, error } = await upsertCoachPreferencesFromDraft({
          supabase: args.supabase,
          userId: args.userId,
          draft: args.draft,
          sourceMessageId: args.sourceMessageId,
        });
        if (error || !data?.key) {
          throw new Error(error?.message ?? "missing_upserted_key");
        }
        return {
          preferences_update_id: data.key,
          preferences_update_ids: data.keys ?? [data.key],
          preference_keys: Object.keys(args.draft.draft.patch),
        };
      },
      secret,
    });
  } catch (error) {
    return {
      status: "blocked" as const,
      reason_code: error instanceof Error ? error.message : "write_failed",
      ack:
        "Je n'ai pas réussi à appliquer cette préférence techniquement. Je préfère ne pas te dire que c'est enregistré tant que la DB ne l'a pas confirmé.",
    };
  }
}

function failedExecutionResult(args: {
  content: string;
  nextTempMemory: any;
  operationId: string | null;
  status?: string;
  error?: string;
}): OperationRuntimeResult {
  return skillResultToRuntimeResult({
    result: buildSkillResult({
      status: "failed",
      reply: args.content,
      reason_code: args.error ?? "execution_failed",
      blocked_effects: [{
        type: "update_coach_preferences",
        reason_code: args.error ?? "execution_failed",
      }],
    }),
    nextTempMemory: args.nextTempMemory,
    extraToolSkillRun: {
      operation_id: args.operationId,
      status: args.status ?? "failed",
      error: args.error,
    },
  });
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
}): Promise<OperationRuntimeResult | null> {
  if (
    !routeIsSelected({
      operationType: "update_coach_preferences",
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const frame = loadCoachPreferenceFrameFromTempMemory(args.tempMemory);
  const pendingRaw = frame.pending;

  if (isPendingCoachPreferencesOperation(pendingRaw)) {
    const operationId = String(pendingRaw.operation_id ?? crypto.randomUUID());
    const operationInput = (pendingRaw as any).operation_input &&
        typeof (pendingRaw as any).operation_input === "object"
      ? (pendingRaw as any).operation_input as Record<string, unknown>
      : {};
    const injectedDraftReviewDecision = normalizeSkillConfirmationReview(
      (pendingRaw as any).draft_review_decision ??
        operationInput.draft_review_decision,
    );
    const draftReviewDecision = injectedDraftReviewDecision ??
      await reviewUpdateCoachPreferencesDraft({
        message: args.userMessage,
        previous_draft: pendingRaw.draft,
        operation_input: {
          ...operationInput,
          intake_state: pendingRaw.intake_state ?? operationInput.intake_state,
        },
        request_id: args.requestId ?? null,
      });
    if (!draftReviewDecision) return null;
    const confirmationDecision = buildConfirmationDecisionFromSkillReview({
      pending: {
        operation_id: operationId,
        operation_type: "update_coach_preferences",
        effect_type: "coach_preferences.update",
        summary: pendingRaw.draft.draft.summary,
        draft: pendingRaw.draft,
        expires_after_turns: (pendingRaw as any).expires_after_turns ?? null,
      },
      review: draftReviewDecision,
      reason_code_prefix: "update_coach_preferences",
    });

    if (
      confirmationDecision.decision === "unrelated" ||
      confirmationDecision.decision === "topic_change"
    ) return null;

    if (
      confirmationDecision.decision === "approve" &&
      confirmationDecision.should_execute
    ) {
      const executed = await executeConfirmedCoachPreferenceDraft({
        supabase: args.supabase,
        userId: args.userId,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        operationId,
        draft: pendingRaw.draft,
      });
      const nextTempMemory = clearCoachPreferenceFrame(args.tempMemory);
      if (executed.status !== "executed") {
        return failedExecutionResult({
          content: executed.ack,
          nextTempMemory,
          operationId,
          status: "failed",
          error: executed.reason_code,
        });
      }
      const committedEffect: UpdateCoachPreferencesCommittedEffect = {
        type: "update_coach_preferences",
        operation_id: operationId,
        preference_keys: executed.preference_keys,
        preferences_update_ids: executed.preferences_update_ids,
      };
      return skillResultToRuntimeResult({
        result: buildSkillResult({
          status: "executed",
          user_intent: "set_preference",
          reply: renderCoachPreferencesExecuted({
            draft: pendingRaw.draft,
            committedEffects: [committedEffect],
          }),
          committed_effects: [committedEffect],
          reason_code: "executed",
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: operationId,
          preferences_update_id: executed.preferences_update_id,
          preferences_update_ids: executed.preferences_update_ids,
          preference_keys: executed.preference_keys,
          confirmation_decision: confirmationDecision,
        },
      });
    }

    if (confirmationDecision.decision === "reject") {
      return {
        content: "Ok, je ne garde pas cette préférence.",
        nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "cancelled",
          committed_effects: [],
          operation_id: operationId,
          confirmation_decision: confirmationDecision,
        },
      };
    }

    if (
      confirmationDecision.decision === "explain" &&
      draftReviewDecision.decision !== "status"
    ) {
      return {
        content: pendingRaw.draft.confirmation_message ??
          "Tu veux que j'applique cette préférence ?",
        nextTempMemory: args.tempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: draftReviewDecision.decision === "preview"
            ? "preview_only"
            : "draft_review_details",
          committed_effects: [],
          operation_id: operationId,
          confirmation_decision: confirmationDecision,
        },
      };
    }

    if (draftReviewDecision.decision === "status") {
      const content = await buildCoachPreferencesStatusReply({
        supabase: args.supabase,
        userId: args.userId,
        fallback:
          "Je vérifie les préférences déjà enregistrées, sans rien modifier.",
      });
      return {
        content,
        nextTempMemory: args.tempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "verified",
          committed_effects: [],
          operation_id: operationId,
          confirmation_decision: confirmationDecision,
        },
      };
    }

    if (confirmationDecision.decision === "unclear") {
      return {
        content: pendingRaw.draft.confirmation_message ??
          "Tu veux que j'applique cette préférence ?",
        nextTempMemory: args.tempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "approval_requires_explicit_user_confirmation",
          committed_effects: [],
          operation_id: operationId,
          confirmation_decision: confirmationDecision,
        },
      };
    }

    if (draftReviewDecision.decision === "reject") {
      return {
        content: draftReviewDecision.generated_user_message ??
          "Ok, je ne garde pas cette préférence.",
        nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "cancelled",
          committed_effects: [],
          operation_id: operationId,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: draftReviewDecision.generated_user_message ??
          pendingRaw.draft.confirmation_message,
        nextTempMemory: args.tempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "draft_review_details",
          committed_effects: [],
          operation_id: operationId,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "revise") {
      const revisionOutput = await runUpdateCoachPreferencesIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        operation_input: {
          intake_state: pendingRaw.intake_state ?? undefined,
        },
        slot_filler: (pendingRaw as any)?.operation_input?.slot_filler as any,
        request_id: args.requestId ?? null,
      });
      let nextTempMemory = clearCoachPreferenceFrame(args.tempMemory);
      if (
        revisionOutput.status === "pending_confirmation" &&
        revisionOutput.pending_confirmation
      ) {
        nextTempMemory = writeCoachPreferencePendingConfirmation(
          nextTempMemory,
          {
            ...revisionOutput.pending_confirmation,
            created_at: new Date().toISOString(),
            turn_count: 0,
            supersedes_operation_id: operationId,
          },
        );
        return {
          content: revisionOutput.confirmation?.message ??
            "Tu veux que j'applique cette préférence ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "update_coach_preferences",
            status: "pending_confirmation_updated",
            committed_effects: [],
            operation_id:
              (revisionOutput.pending_confirmation as any)?.operation_id ??
                null,
            previous_operation_id: operationId,
            draft: revisionOutput.draft ?? null,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      if (revisionOutput.status === "ask_question") {
        nextTempMemory = writeCoachPreferenceActiveIntake(nextTempMemory, {
          operation_type: "update_coach_preferences",
          phase: revisionOutput.phase,
          missing_slots: revisionOutput.state_patch.missing_slots,
          operation_input: revisionOutput.state_patch.operation_input ?? {},
          intake_state: revisionOutput.state_patch.intake_state ?? null,
          tool_skill_state: revisionOutput.state_patch.tool_skill_state ?? null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        });
      }
      return {
        content: revisionOutput.next_question?.question ?? revisionOutput.ack ??
          "Je n'ai pas réussi à préparer cette préférence techniquement. Je préfère ne rien appliquer sans confirmation claire.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: revisionOutput.status,
          committed_effects: [],
          operation_id: operationId,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    return {
      content: pendingRaw.draft.confirmation_message ??
        "Tu veux que j'applique cette préférence ?",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "approval_requires_explicit_user_confirmation",
        committed_effects: [],
        operation_id: operationId,
        draft_review_decision: draftReviewDecision,
      },
    };
  }

  if (isOperationEscapeMessage(args.userMessage)) return null;

  const activeIntake = frame.active;
  const activeOperationInput = activeIntake?.operation_type ===
      "update_coach_preferences"
    ? activeIntake.operation_input as Record<string, unknown> ?? {}
    : {};
  const output = await runUpdateCoachPreferencesIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band as RiskBand,
    turn_count: Number(activeIntake?.turn_count ?? 0),
    operation_input: activeOperationInput,
    slot_filler: activeOperationInput.slot_filler as any,
    request_id: args.requestId ?? null,
  });

  if (output.status === "preview_only") {
    return {
      content: output.ack ?? "Proposition non enregistrée.",
      nextTempMemory: args.tempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "preview_only",
        committed_effects: [],
        draft: output.draft ?? null,
      },
    };
  }
  if (output.status === "verified") {
    const content = await buildCoachPreferencesStatusReply({
      supabase: args.supabase,
      userId: args.userId,
      fallback: output.ack ??
        "Je vérifie les préférences déjà enregistrées, sans rien modifier.",
    });
    return {
      content,
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: output.status,
        committed_effects: [],
      },
    };
  }
  if (output.status === "cancelled") {
    return {
      content: output.ack ?? "",
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: output.status,
        committed_effects: [],
      },
    };
  }

  if (
    output.status === "pending_confirmation" && output.draft &&
    !isCoachPreferenceExplicitApproval(args.userMessage) &&
    detectsCoachPreferenceDirectionContradictionForSkill({
      message: args.userMessage,
      patch: (output.draft as any)?.draft?.patch ?? {},
    })
  ) {
    return {
      content:
        "Je veux être sûre de ne pas inverser ce que tu veux avant de le garder. Tu préfères que je te pose MOINS de questions (d'abord un geste concret, puis une question seulement si utile), ou PLUS de questions avant d'avancer ?",
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "direction_needs_confirmation",
        committed_effects: [],
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    if (
      isCoachPreferenceExplicitApproval(args.userMessage) &&
      output.draft
    ) {
      const operationId = String(
        (output.pending_confirmation as any)?.operation_id ??
          crypto.randomUUID(),
      );
      const executed = await executeConfirmedCoachPreferenceDraft({
        supabase: args.supabase,
        userId: args.userId,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        operationId,
        draft: output.draft,
      });
      const nextTempMemory = clearCoachPreferenceFrame(args.tempMemory);
      if (executed.status !== "executed") {
        return failedExecutionResult({
          content: executed.ack,
          nextTempMemory,
          operationId,
          status: "failed",
          error: executed.reason_code,
        });
      }
      const committedEffect: UpdateCoachPreferencesCommittedEffect = {
        type: "update_coach_preferences",
        operation_id: operationId,
        preference_keys: executed.preference_keys,
        preferences_update_ids: executed.preferences_update_ids,
      };
      return skillResultToRuntimeResult({
        result: buildSkillResult({
          status: "executed",
          user_intent: "set_preference",
          reply: renderCoachPreferencesExecuted({
            draft: output.draft,
            committedEffects: [committedEffect],
          }),
          committed_effects: [committedEffect],
          reason_code: "executed",
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: operationId,
          preferences_update_id: executed.preferences_update_id,
          preferences_update_ids: executed.preferences_update_ids,
          preference_keys: executed.preference_keys,
        },
      });
    }
    const nextTempMemory = writeCoachPreferencePendingConfirmation(
      clearCoachPreferenceFrame(args.tempMemory),
      {
        ...output.pending_confirmation,
        created_at: new Date().toISOString(),
        turn_count: 0,
      },
    );
    return {
      content: output.confirmation?.message ??
        "Tu veux que j'applique cette préférence ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "pending_confirmation",
        committed_effects: [],
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    const nextTempMemory = writeCoachPreferenceActiveIntake(args.tempMemory, {
      operation_type: "update_coach_preferences",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        activeOperationInput,
      intake_state: output.state_patch.intake_state ?? null,
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
    return {
      content: output.next_question?.question ??
        "Tu veux changer mon ton, mon niveau de challenge, ou le nombre de questions ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "ask_question",
        committed_effects: [],
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu appliquer cette préférence depuis le chat pour l'instant.",
    nextTempMemory: args.tempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      status: output.status,
      committed_effects: [],
      blocked_effects: [{
        type: "update_coach_preferences",
        reason_code: output.status,
      }],
      missing_slots: output.state_patch.missing_slots,
    },
  };
}
