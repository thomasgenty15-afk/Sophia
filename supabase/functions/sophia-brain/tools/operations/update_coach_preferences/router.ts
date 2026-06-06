/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import type {
  CoachPreferenceHandoffDraft,
  CoachPreferenceHandoffStatus,
  UpdateCoachPreferencesSkillResult,
  UpdateCoachPreferenceUserIntent,
} from "./contract.ts";
import { runUpdateCoachPreferencesIntake } from "./intake.ts";
import {
  clearCoachPreferenceFrame,
  type CoachPreferenceHandoffState,
  loadCoachPreferenceFrameFromTempMemory,
  writeCoachPreferenceActiveIntake,
  writeCoachPreferenceHandoffState,
} from "./state.ts";
import {
  detectsCoachPreferenceDirectionContradictionForSkill,
} from "./route_guards.ts";
export { detectsCoachPreferenceDirectionContradictionForSkill } from "./route_guards.ts";
import { buildCoachPreferencesStatusReply } from "./status.ts";
import { renderCoachPreferencesSkillResult } from "./renderer.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

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

function buildSkillResult(input: {
  handled?: boolean;
  status: UpdateCoachPreferencesSkillResult["status"];
  user_intent?: UpdateCoachPreferenceUserIntent;
  reply: string | null;
  handoff_draft?: CoachPreferenceHandoffDraft | null;
  updated_state?: unknown;
  reason_code: string;
  evidence?: string[];
}): UpdateCoachPreferencesSkillResult {
  return {
    handled: input.handled ?? true,
    status: input.status,
    user_intent: input.user_intent ?? "unknown",
    updated_state: input.updated_state,
    handoff_draft: input.handoff_draft ?? null,
    reply: input.reply,
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    pending_confirmation: null,
    debug: {
      reason_code: input.reason_code,
      evidence: input.evidence ?? [],
    },
  };
}

function skillResultToRuntimeResult(input: {
  result: UpdateCoachPreferencesSkillResult;
  nextTempMemory: any;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  const platformHandoff = input.result.handoff_draft
    ? {
      operation_type: "update_coach_preferences",
      status: input.result.status === "handoff_delivered"
        ? "delivered"
        : "proposed",
      surface_id: getHandoffTargetForOperation("update_coach_preferences")
        ?.surface_id ?? "coach_preferences",
      no_chat_mutation: true,
      draft: input.result.handoff_draft,
    }
    : null;
  const hasPlatformHandoff = Boolean(
    platformHandoff ?? input.extraToolSkillRun?.platform_handoff,
  );
  return {
    content: renderCoachPreferencesSkillResult(input.result),
    nextTempMemory: input.nextTempMemory,
    toolExecution: hasPlatformHandoff ? "platform_handoff" : "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      operation_type: "update_coach_preferences",
      status: input.result.status,
      user_intent: input.result.user_intent,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      pending_confirmation: null,
      platform_handoff: platformHandoff,
      no_chat_mutation: true,
      debug: input.result.debug,
      ...input.extraToolSkillRun,
    },
  };
}

function isCoachPreferenceHandoffState(
  value: unknown,
): value is CoachPreferenceHandoffState {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return Boolean(
    record?.skill_id === "update_coach_preferences" &&
      record.mode === "platform_handoff" &&
      record.no_chat_mutation === true,
  );
}

function routeIsSelected(args: {
  operationType: "update_coach_preferences";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadCoachPreferenceFrameFromTempMemory(args.tempMemory);
  if (isCoachPreferenceHandoffState(frame.handoff)) return true;
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

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function followUpIntent(message: string): CoachPreferenceHandoffStatus | null {
  const text = normalizeText(message);
  if (/\b(ok|oui|vas y|vas-y|applique|valide|confirme)\b/.test(text)) {
    return "apply_attempt";
  }
  if (
    /\b(redis|repete|rappelle|quoi changer|que changer|ou .*fais|ou .*faire|ou .*changer|ou .*regler|ou est ce que|dans la plateforme|preferences coach)\b/
      .test(text)
  ) {
    return "repeat_handoff";
  }
  if (
    /\b(plutot|plutôt|moins|plus|doux|douce|direct|questions?)\b/.test(text)
  ) return "revise_handoff";
  if (/\b(juste|seulement|cette reponse|maintenant|ponctuel)\b/.test(text)) {
    return "punctual_instruction";
  }
  if (/\b(annule|stop|laisse tomber|oublie|pas maintenant)\b/.test(text)) {
    return "cancelled";
  }
  return null;
}

function isCoachPreferenceExplanationQuestion(message: string): boolean {
  const text = normalizeText(message);
  return (
    /\b(ca fait quoi|ça fait quoi|ca change quoi|ça change quoi|qu est ce que ca change|qu est ce que ça change|explique|a quoi ca sert|a quoi ça sert|difference|différence|veut dire|signifie|concretement|concrètement|par rapport|compare|vs|ensemble)\b/
      .test(text) &&
    /\b(ton|direct|doux|challenge|challenger|questions?|preference|preferences|reglages?|réglages?)\b/
      .test(text)
  );
}

function handoffState(args: {
  status: CoachPreferenceHandoffStatus;
  draft: CoachPreferenceHandoffDraft | null;
  previous?: CoachPreferenceHandoffState | null;
}): CoachPreferenceHandoffState {
  const now = new Date().toISOString();
  return {
    skill_id: "update_coach_preferences",
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 4) || 4,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    no_chat_mutation: true,
  };
}

function applyAttemptReply(draft: CoachPreferenceHandoffDraft | null): string {
  const destination = draft?.recommendation.platform_destination ??
    "dans la plateforme, depuis les Préférences coach";
  const settings = draft?.supported_settings ?? [];
  const recommended = settings.length === 0
    ? ""
    : settings.length === 1
    ? ` Le réglage est prêt : ${settings[0].label} sur ${
      settings[0].recommended_value
    }.`
    : ` Les réglages sont prêts : ${
      settings.map((setting) =>
        `${setting.label} sur ${setting.recommended_value}`
      ).join("; ")
    }.`;
  const unsupported = draft?.unsupported_parts.length
    ? ` Une partie ne peut pas devenir une préférence durable telle quelle : ${
      draft.unsupported_parts.join("; ")
    }.`
    : "";
  const settingNoun = settings.length > 1 ? "ces réglages" : "ce réglage";
  return `Je ne peux pas l’appliquer directement depuis ce chat.${recommended}${unsupported} Il ne reste qu’à aller ${destination} pour mettre à jour ${settingNoun}.`;
}

function coachPreferenceSettingsExplanation(
  draft: CoachPreferenceHandoffDraft | null,
): string {
  const destination = draft?.recommendation.platform_destination ??
    "dans les Préférences coach";
  const recommended = draft?.supported_settings.length
    ? `\n\nDans ta recommandation actuelle : ${
      draft.supported_settings.map((setting) =>
        `${setting.label} -> ${setting.recommended_value}`
      ).join("; ")
    }.`
    : "";
  return [
    "Les Préférences coach règlent seulement trois dimensions visibles.",
    "",
    "- Ton global : change la couleur relationnelle de mes réponses, par exemple plus doux, bienveillant-ferme ou très direct.",
    "- Niveau de challenge : change le niveau d'exigence et de confrontation constructive, de plus léger à plus élevé.",
    "- Tendance à poser des questions : change la fréquence des questions et demandes de précision, de peu de questions à très questionnant.",
    "",
    "Ça ne règle pas les formats fins comme exactement trois lignes, zéro emoji ou jamais de question finale.",
    `${recommended}`,
    "",
    `Pour le mettre à jour, il faut passer ${destination}.`,
  ].filter((line) => line !== "").join("\n");
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
  const activeHandoff = isCoachPreferenceHandoffState(frame.handoff)
    ? frame.handoff
    : null;
  const followUp = activeHandoff ? followUpIntent(args.userMessage) : null;

  if (
    activeHandoff &&
    isCoachPreferenceExplanationQuestion(args.userMessage)
  ) {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "explained",
        user_intent: "explain",
        reply: coachPreferenceSettingsExplanation(activeHandoff.draft ?? null),
        reason_code: "active_handoff_explain_settings",
      }),
      nextTempMemory: args.tempMemory,
      extraToolSkillRun: {
        platform_handoff: {
          operation_type: "update_coach_preferences",
          status: "delivered",
          surface_id: getHandoffTargetForOperation("update_coach_preferences")
            ?.surface_id ?? "coach_preferences",
          no_chat_mutation: true,
          draft: activeHandoff.draft ?? null,
        },
      },
    });
  }

  if (followUp === "apply_attempt") {
    const nextState = handoffState({
      status: "apply_attempt",
      draft: activeHandoff?.draft ?? null,
      previous: activeHandoff,
    });
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "apply_attempt",
        user_intent: "apply_attempt",
        reply: applyAttemptReply(activeHandoff?.draft ?? null),
        reason_code: "apply_attempt_no_chat_mutation",
      }),
      nextTempMemory: writeCoachPreferenceHandoffState(
        args.tempMemory,
        nextState,
      ),
      extraToolSkillRun: {
        platform_handoff: {
          operation_type: "update_coach_preferences",
          status: "delivered",
          surface_id: getHandoffTargetForOperation("update_coach_preferences")
            ?.surface_id ?? "coach_preferences",
          no_chat_mutation: true,
          draft: activeHandoff?.draft ?? null,
        },
      },
    });
  }

  if (followUp === "repeat_handoff" && activeHandoff?.draft) {
    const nextState = handoffState({
      status: "repeat_handoff",
      draft: activeHandoff.draft,
      previous: activeHandoff,
    });
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "repeat_handoff",
        user_intent: "repeat_handoff",
        reply: null,
        handoff_draft: activeHandoff.draft,
        reason_code: "repeat_handoff",
      }),
      nextTempMemory: writeCoachPreferenceHandoffState(
        args.tempMemory,
        nextState,
      ),
    });
  }

  if (followUp === "punctual_instruction") {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "punctual_instruction",
        user_intent: "punctual_instruction",
        reply:
          "D'accord, je le prends comme consigne ponctuelle pour cette réponse. Je ne prépare pas de préférence durable depuis le chat.",
        reason_code: "handoff_reframed_as_punctual_instruction",
      }),
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
    });
  }

  if (followUp === "cancelled") {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "cancelled",
        user_intent: "cancel",
        reply: "Ok, je ne prépare pas de changement de préférence.",
        reason_code: "handoff_cancelled",
      }),
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
    });
  }

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
    turn_count: Number(
      activeIntake?.turn_count ?? activeHandoff?.turn_count ?? 0,
    ),
    operation_input: activeOperationInput,
    slot_filler: activeOperationInput.slot_filler as any,
    request_id: args.requestId ?? null,
  });

  if (output.status === "verified") {
    const content = await buildCoachPreferencesStatusReply({
      supabase: args.supabase,
      userId: args.userId,
      fallback: output.ack ??
        "Je vérifie les préférences déjà actives, sans rien modifier.",
    });
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "verified",
        user_intent: output.user_intent,
        reply: content,
        reason_code: "status_read_only",
      }),
      nextTempMemory: args.tempMemory,
    });
  }

  if (output.status === "cancelled") {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "cancelled",
        user_intent: output.user_intent,
        reply: output.ack ??
          "Ok, je ne prépare pas de changement de préférence.",
        reason_code: "cancelled",
      }),
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
    });
  }

  if (output.status === "punctual_instruction") {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "punctual_instruction",
        user_intent: output.user_intent,
        reply: output.ack ??
          "D'accord, je le prends comme consigne ponctuelle pour cette réponse. Je ne prépare pas de préférence durable depuis le chat.",
        reason_code: "punctual_instruction_no_handoff",
      }),
      nextTempMemory: clearCoachPreferenceFrame(args.tempMemory),
    });
  }

  if (
    activeHandoff &&
    output.user_intent === "explain"
  ) {
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "explained",
        user_intent: "explain",
        reply: coachPreferenceSettingsExplanation(
          activeHandoff.draft ?? output.handoff_draft ?? null,
        ),
        reason_code: "active_handoff_explain_settings_after_intake",
      }),
      nextTempMemory: args.tempMemory,
      extraToolSkillRun: {
        platform_handoff: {
          operation_type: "update_coach_preferences",
          status: "delivered",
          surface_id: getHandoffTargetForOperation("update_coach_preferences")
            ?.surface_id ?? "coach_preferences",
          no_chat_mutation: true,
          draft: activeHandoff.draft ?? output.handoff_draft ?? null,
        },
      },
    });
  }

  if (output.status === "ask_question") {
    const nextTempMemory = writeCoachPreferenceActiveIntake(args.tempMemory, {
      operation_type: "update_coach_preferences",
      mode: "platform_handoff",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        activeOperationInput,
      intake_state: output.state_patch.intake_state ?? null,
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
      no_chat_mutation: true,
    });
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status: "ask_question",
        user_intent: "clarify",
        reply: output.next_question?.question ??
          "Tu veux en faire une préférence durable dans les réglages coach, ou juste une consigne pour cette réponse ?",
        reason_code: output.next_question?.reason ?? "clarification_required",
      }),
      nextTempMemory,
    });
  }

  if (
    (output.status === "handoff_ready" ||
      output.status === "unsupported_preference") &&
    output.handoff_draft
  ) {
    const status = output.status === "unsupported_preference"
      ? "unsupported_preference"
      : activeHandoff
      ? "revise_handoff"
      : "handoff_delivered";
    const nextState = handoffState({
      status,
      draft: output.handoff_draft,
      previous: activeHandoff,
    });
    return skillResultToRuntimeResult({
      result: buildSkillResult({
        status,
        user_intent: output.user_intent,
        reply: null,
        handoff_draft: output.handoff_draft,
        reason_code: status,
      }),
      nextTempMemory: writeCoachPreferenceHandoffState(
        clearCoachPreferenceFrame(args.tempMemory),
        nextState,
      ),
    });
  }

  return skillResultToRuntimeResult({
    result: buildSkillResult({
      status: output.status === "blocked_by_safety" ? "blocked" : "blocked",
      user_intent: output.user_intent,
      reply: output.ack ??
        "Je t’ai préparé le réglage à reprendre dans les préférences coach de la plateforme. Il ne reste qu’à le mettre à jour depuis la plateforme.",
      reason_code: output.status,
    }),
    nextTempMemory: args.tempMemory,
  });
}
