import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildCoachPreferencesPayload,
  buildOperationDraftRequest,
  type CoachPreferenceKey,
} from "../_shared/operation_payload_builder.ts";
import {
  type CoachPreferencesPatchDraftV1,
  runCoachPreferencesPatchBuilder,
} from "./generator.ts";

export type UpdateCoachPreferencesOperationOutput = {
  operation_type: "update_coach_preferences";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "preference_resolution" | "generation" | "confirmation" | "exit";
  draft?: CoachPreferencesPatchDraftV1;
  confirmation?: { required: boolean; message: string; actions: ["yes", "no"] };
  pending_confirmation?: Record<string, unknown>;
  next_question?: { needed: boolean; question?: string; reason?: string };
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
  };
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function inferPatch(text: string): Partial<Record<CoachPreferenceKey, string>> {
  const normalized = normalize(text);
  if (/moins de questions|pose-moi moins|moins question/.test(normalized)) {
    return { "coach.question_tendency": "peu_de_questions" };
  }
  if (/questionne-moi plus|plus de questions/.test(normalized)) {
    return { "coach.question_tendency": "tres_questionnant" };
  }
  if (/plus direct|sois direct|tres direct/.test(normalized)) {
    return { "coach.tone": "tres_direct" };
  }
  if (/plus doux|doucement|reponds doucement/.test(normalized)) {
    return { "coach.tone": "doux" };
  }
  if (/challenge-moi plus|challenge davantage/.test(normalized)) {
    return { "coach.challenge_level": "eleve" };
  }
  if (
    /moins de pression|challenge moins|vas-y plus doucement/.test(normalized)
  ) {
    return { "coach.challenge_level": "leger" };
  }
  return {};
}

export function runUpdateCoachPreferencesIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
  current_preferences?: Partial<Record<CoachPreferenceKey, string>>;
}): UpdateCoachPreferencesOperationOutput {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "update_coach_preferences",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks coach preferences operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }
  const requestedPatch = (input.operation_input?.requested_patch ??
    input.operation_input?.patch ??
    inferPatch(input.message)) as Partial<Record<CoachPreferenceKey, string>>;
  const missing = Object.keys(requestedPatch).length === 0
    ? ["preference"]
    : [];
  if (missing.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "update_coach_preferences",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing preference patch.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
        },
      };
    }
    if ((input.turn_count ?? 0) >= 1) {
      return {
        operation_type: "update_coach_preferences",
        status: "fallback_dashboard",
        source,
        phase: "exit",
        ack:
          "Je n'ai pas assez d'infos pour changer cette preference depuis le chat. Tu peux la regler dans ton espace sur sophia-coach.ai.",
        state_patch: {
          summary: "Coach preferences fallback dashboard.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
        },
      };
    }
    return {
      operation_type: "update_coach_preferences",
      status: "ask_question",
      source,
      phase: "preference_resolution",
      next_question: {
        needed: true,
        question:
          "Tu veux changer quoi precisement: mon ton, mon niveau de challenge, ou le nombre de questions ?",
        reason: "preference_missing",
      },
      state_patch: {
        summary: "Coach preferences intake needs target preference.",
        phase: "preference_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
      },
    };
  }
  const request = buildOperationDraftRequest({
    operation_type: "update_coach_preferences",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    current_preferences: Partial<Record<CoachPreferenceKey, string>>;
    requested_patch: Partial<Record<CoachPreferenceKey, string>>;
  };
  request.current_preferences = input.current_preferences ?? {};
  request.requested_patch = requestedPatch;
  const draft = runCoachPreferencesPatchBuilder(
    buildCoachPreferencesPayload(request),
  );
  return {
    operation_type: "update_coach_preferences",
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
      operation_type: "update_coach_preferences",
      source,
      summary: draft.draft.summary,
      draft,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Coach preferences draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}
