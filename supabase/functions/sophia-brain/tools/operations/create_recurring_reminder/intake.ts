import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildOperationDraftRequest,
  buildRecurringReminderPayload,
} from "../_shared/operation_payload_builder.ts";
import {
  type RecurringReminderDraftV1,
  runRecurringReminderBuilder,
} from "./generator.ts";

export type CreateRecurringReminderOperationOutput = {
  operation_type: "create_recurring_reminder";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "recurrence_resolution" | "generation" | "confirmation" | "exit";
  draft?: RecurringReminderDraftV1;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: { needed: boolean; question?: string; reason?: string };
  pending_confirmation?: Record<string, unknown>;
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown>;
  };
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function extractTime(text: string): string | null {
  const normalized = normalize(text);
  const match = normalized.match(/\b(\d{1,2})(?:h|:)(\d{2})?\b/);
  if (match) {
    return `${String(Math.min(23, Number(match[1]))).padStart(2, "0")}:${
      String(Math.min(59, Number(match[2] ?? "0"))).padStart(2, "0")
    }`;
  }
  if (/\bmatins?\b/.test(normalized)) return "09:00";
  if (/\bsoir\b/.test(normalized)) return "18:30";
  return null;
}

function extractFrequency(text: string) {
  const normalized = normalize(text);
  if (
    /\btous les jours\b|\bchaque jour\b|\bquotidien\b|\btous les soirs\b|\bchaque soir\b/
      .test(normalized)
  ) {
    return { frequency: "daily" as const };
  }
  if (/\btous les matins\b|\bchaque matin\b/.test(normalized)) {
    return { frequency: "daily" as const };
  }
  const explicitWeekly = [
    ...normalized.matchAll(
      /\b(?:chaque|tous les)\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g,
    ),
  ].map((match) => match[1]).filter(Boolean);
  if (explicitWeekly.length > 0) {
    return {
      frequency: "weekly" as const,
      days: [explicitWeekly[explicitWeekly.length - 1]],
    };
  }
  const days = [
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
  ].filter((day) => normalized.includes(day));
  if (days.length > 1) return { frequency: "specific_days" as const, days };
  if (days.length === 1) return { frequency: "weekly" as const, days };
  return null;
}

function extractMessage(text: string): string | null {
  const quotedMessage = text.match(
    /\bmessage\s*['"“”«:]\s*([^'"“”»]+?)\s*['"“”»]/i,
  )?.[1]?.trim();
  if (quotedMessage) return quotedMessage;

  const focused = (() => {
    const markers = [
      /(?:action|rappel)\s+r[ée]currente\s*:?\s*(.+)$/i,
      /(?:cr[ée]er|cree|créer)\s+(?:une\s+)?(?:action|rappel)\s+r[ée]currente\s*:?\s*(.+)$/i,
      /(?:rituel|routine|habitude)\s+quotidien(?:ne)?\s*:?\s*(.+)$/i,
      /(?:mets[- ]?moi|programme[- ]?moi)\s+(?:un\s+|une\s+)?(?:petit\s+|petite\s+)?(?:rituel|routine|habitude|rappel)\s+(?:quotidien(?:ne)?|tous les jours|chaque jour)\s*:?\s*(.+)$/i,
    ];
    for (const marker of markers) {
      const match = text.match(marker);
      if (match?.[1]) return match[1];
    }
    return text;
  })();

  const cleaned = focused
    .replace(/rappelle[- ]?moi/gi, "")
    .replace(/envoie[- ]?moi un rappel/gi, "")
    .replace(
      /\b(?:oui|ok|vas[- ]?y|go|je confirme|confirme|valide[- ]?le|cr[ée]e[- ]?le|cree[- ]?le|fais[- ]?le|maintenant)\b/gi,
      " ",
    )
    .replace(
      /(?:cr[ée]er|cree|créer)\s+(?:une\s+)?(?:action|rappel)\s+r[ée]currente/gi,
      "",
    )
    .replace(
      /(?:mets[- ]?moi|programme[- ]?moi)\s+(?:un\s+|une\s+)?(?:petit\s+|petite\s+)?(?:rituel|routine|habitude|rappel)\s+(?:quotidien(?:ne)?|tous les jours|chaque jour)/gi,
      "",
    )
    .replace(/(?:rituel|routine|habitude)\s+quotidien(?:ne)?/gi, "")
    .replace(
      /tous les matins|tous les jours|tous les soirs|chaque jour|chaque matin|chaque soir|quotidien(?:ne)?/gi,
      "",
    )
    .replace(/(?:^|\s)(?:a|à|vers)\s*\d{1,2}(?:h|:)\d{0,2}\b/gi, " ")
    .replace(/(?:^|\s)pour\s*\d{1,2}(?:h|:)\d{0,2}\b\s*:?\s*/gi, " ")
    .replace(/\b(vers|a|à|de)\b/gi, " ")
    .replace(/^[\s:,\-.]+|[\s:,\-.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function runCreateRecurringReminderIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
}): CreateRecurringReminderOperationOutput {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "create_recurring_reminder",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks recurring reminder operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }
  const recommendationInput = input.operation_input ?? {};
  const extractedFrequency = extractFrequency(input.message);
  const extractedTime = extractTime(input.message);
  const sameMessage = /\bmeme message\b|\bmême message\b/i.test(
    input.message,
  );
  const extractedMessage = sameMessage ? null : extractMessage(input.message);
  const frequency = extractedFrequency?.frequency ??
    (recommendationInput.frequency as any);
  const days = extractedFrequency?.days ??
    (recommendationInput.days as string[] | undefined);
  const time = extractedTime ??
    (recommendationInput.time as string | undefined);
  const message = extractedMessage ??
    (recommendationInput.message as string | undefined);
  const operationInput = {
    ...(frequency ? { frequency } : {}),
    ...(days ? { days } : {}),
    ...(time ? { time } : {}),
    ...(message ? { message } : {}),
  };
  const missing = [
    !frequency ? "frequency" : "",
    !time ? "time" : "",
    !message ? "message" : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "create_recurring_reminder",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing recurring reminder slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          operation_input: operationInput,
        },
      };
    }
    if ((input.turn_count ?? 0) >= 1) {
      return {
        operation_type: "create_recurring_reminder",
        status: "fallback_dashboard",
        source,
        phase: "exit",
        ack:
          "Je n'ai pas assez d'infos pour le creer depuis le chat. Tu peux le regler dans ton espace sur sophia-coach.ai.",
        state_patch: {
          summary: "Recurring reminder intake fallback dashboard.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          operation_input: operationInput,
        },
      };
    }
    return {
      operation_type: "create_recurring_reminder",
      status: "ask_question",
      source,
      phase: "recurrence_resolution",
      next_question: {
        needed: true,
        question: missing.includes("time")
          ? "Tu veux ce rappel a quel moment de la journee ?"
          : "Tu veux que je te rappelle quoi exactement ?",
        reason: missing[0],
      },
      state_patch: {
        summary: "Recurring reminder intake needs one slot.",
        phase: "recurrence_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
        operation_input: operationInput,
      },
    };
  }

  const request = buildOperationDraftRequest({
    operation_type: "create_recurring_reminder",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    recurrence: any;
    reminder_content: any;
    destination: any;
  };
  request.recurrence = { frequency, days, time, timezone: input.timezone };
  request.reminder_content = { message, subject_hint: message };
  request.destination = { value: "base_de_vie" };
  const draft = runRecurringReminderBuilder(
    buildRecurringReminderPayload(request),
  );
  return {
    operation_type: "create_recurring_reminder",
    status: "pending_confirmation",
    source,
    phase: "confirmation",
    draft,
    confirmation: {
      required: true,
      message: draft.confirmation_message,
      actions: ["yes", "no"],
    },
    pending_confirmation: {
      operation_id: request.operation_id,
      operation_type: "create_recurring_reminder",
      source,
      summary: draft.draft.title,
      draft,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Recurring reminder draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
    },
  };
}

export function cancelCreateRecurringReminderOperation() {
  return {
    operation_type: "create_recurring_reminder" as const,
    status: "cancelled" as const,
    source: "direct_user_request" as const,
    phase: "exit" as const,
    ack: "Ok, je ne cree pas ce rappel.",
    state_patch: {
      summary: "Recurring reminder cancelled.",
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1 as const,
    },
  };
}
