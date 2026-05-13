import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildOperationDraftRequest,
  buildPotionSelectionPayload,
  type PotionSessionSelectorInput,
} from "../_shared/operation_payload_builder.ts";
import {
  type PotionSessionDraftV1,
  runPotionSessionSelector,
} from "./generator.ts";

export type SelectStatePotionOperationOutput = {
  operation_type: "select_state_potion";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "cancelled"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "state_resolution" | "generation" | "confirmation" | "exit";
  draft?: PotionSessionDraftV1;
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
  };
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const STATE_TO_POTION: Record<
  PotionSessionSelectorInput["state"]["kind"],
  PotionSessionSelectorInput["potion_type"]
> = {
  decrochage: "rappel",
  fear_avoidance: "courage",
  shame_guilt: "guerison",
  confusion_overload: "clarte",
  self_harshness: "amour",
  stress_pressure: "apaisement",
};

const POTION_TO_STATE: Record<
  PotionSessionSelectorInput["potion_type"],
  PotionSessionSelectorInput["state"]["kind"]
> = {
  rappel: "decrochage",
  courage: "fear_avoidance",
  guerison: "shame_guilt",
  clarte: "confusion_overload",
  amour: "self_harshness",
  apaisement: "stress_pressure",
};

function inferState(
  text: string,
): PotionSessionSelectorInput["state"]["kind"] | null {
  const normalized = normalize(text);
  if (/honte|culpabil/.test(normalized)) return "shame_guilt";
  if (/stress|pression|angoisse/.test(normalized)) return "stress_pressure";
  if (/peur|evite|evitement/.test(normalized)) return "fear_avoidance";
  if (/flou|confus|surcharge/.test(normalized)) return "confusion_overload";
  if (/dur avec moi|nul|incapable/.test(normalized)) return "self_harshness";
  if (/decroche|decrochage/.test(normalized)) return "decrochage";
  return null;
}

function inferPotionType(text: string) {
  const normalized = normalize(text);
  if (/guerison/.test(normalized)) return "guerison" as const;
  if (/apaisement|calmer/.test(normalized)) return "apaisement" as const;
  if (/clarte/.test(normalized)) return "clarte" as const;
  if (/courage/.test(normalized)) return "courage" as const;
  if (/amour/.test(normalized)) return "amour" as const;
  if (/rappel/.test(normalized)) return "rappel" as const;
  return null;
}

export function runSelectStatePotionIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
}): SelectStatePotionOperationOutput {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "select_state_potion",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks potion operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const opInput = input.operation_input ?? {};
  const explicitPotionType = (opInput.potion_type as any) ??
    inferPotionType(input.message);
  const stateKind = (opInput.state as any) ??
    (source === "direct_user_request"
      ? inferState(input.message) ??
        (explicitPotionType
          ? POTION_TO_STATE[
            explicitPotionType as keyof typeof POTION_TO_STATE
          ]
          : null)
      : null);
  const potionType = explicitPotionType ??
    (stateKind
      ? STATE_TO_POTION[stateKind as keyof typeof STATE_TO_POTION]
      : null);
  const missing = [
    !stateKind ? "state" : "",
    !potionType ? "potion_type" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "select_state_potion",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing potion slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
        },
      };
    }
    return {
      operation_type: "select_state_potion",
      status: "ask_question",
      source,
      phase: "state_resolution",
      next_question: {
        needed: true,
        question:
          "La, c'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
        reason: missing[0],
      },
      state_patch: {
        summary: "Potion intake needs state.",
        phase: "state_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
      },
    };
  }

  const request = buildOperationDraftRequest({
    operation_type: "select_state_potion",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    state_kind: PotionSessionSelectorInput["state"]["kind"];
    state_intensity: PotionSessionSelectorInput["state"]["intensity"];
    potion_type: PotionSessionSelectorInput["potion_type"];
  };
  request.state_kind = stateKind;
  request.state_intensity = "medium";
  request.potion_type = potionType;
  const draft = runPotionSessionSelector(buildPotionSelectionPayload(request));
  return {
    operation_type: "select_state_potion",
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
      operation_type: "select_state_potion",
      source,
      summary: draft.draft.title,
      draft,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Potion draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}
