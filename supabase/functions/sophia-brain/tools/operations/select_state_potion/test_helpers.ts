import type { PotionSessionSelectorInput } from "../_shared/operation_payload_builder.ts";
import type {
  SelectStatePotionSlotFiller,
  SelectStatePotionSlotFillerOutput,
  StatePotionConfidence,
  StatePotionDetailAnswer,
  StatePotionDetailFieldProgress,
  StatePotionShortlistOption,
} from "./intake.ts";

const TEST_DETAIL_IDS: Record<
  PotionSessionSelectorInput["potion_type"],
  string[]
> = {
  rappel: ["drift_target", "drift_style"],
  courage: ["avoidance_target", "blocker_kind"],
  guerison: ["recent_hurt", "dominant_feeling"],
  clarte: ["plan_meaning_loss_reason"],
  amour: ["love_lack_context", "love_state"],
  apaisement: ["pressure_source", "pressure_state"],
};

export function structuredStatePotionSlotFiller(args: {
  state_kind?: PotionSessionSelectorInput["state"]["kind"] | null;
  intensity?: PotionSessionSelectorInput["state"]["intensity"] | null;
  selected_potion?: PotionSessionSelectorInput["potion_type"] | null;
  explicit_potion?: PotionSessionSelectorInput["potion_type"] | null;
  shortlist?: StatePotionShortlistOption[];
  detail_answers?: StatePotionDetailAnswer[];
  omit_detail_answers?: boolean;
  generated_user_message?: string | null;
  confidence?: StatePotionConfidence;
}): SelectStatePotionSlotFiller {
  return async (): Promise<SelectStatePotionSlotFillerOutput> => {
    const selected = args.selected_potion ?? args.explicit_potion ?? null;
    const detailAnswers = args.detail_answers ??
      (!args.omit_detail_answers && selected
        ? TEST_DETAIL_IDS[selected].map((questionId, index) => ({
          question_id: questionId,
          label: `Detail ${index + 1}`,
          answer: `Reponse detail ${index + 1}`,
          evidence: [`structured_detail_${index + 1}`],
        }))
        : []);
    const detailFields: StatePotionDetailFieldProgress[] = detailAnswers.map(
      (answer) => ({
        question_id: answer.question_id,
        label: answer.label,
        required: true,
        status: "locked",
        proposed_value: null,
        locked_value: answer.answer,
        user_evidence: answer.evidence,
        needs_user_confirmation: false,
        evidence: answer.evidence,
      }),
    );
    const detailsReady = Boolean(selected) &&
      detailAnswers.length >= (selected ? TEST_DETAIL_IDS[selected].length : 0);
    const missing = [
      !args.state_kind ? "state" : "",
      !selected ? "potion_type" : "",
      selected && !detailsReady ? "potion_detail:structured" : "",
    ].filter(Boolean);
    return {
      current_sub_skill: missing.length === 0
        ? "detail_intake"
        : args.state_kind && !selected
        ? "potion_choice"
        : selected && !detailsReady
        ? "detail_intake"
        : "state_resolution",
      state_patch: {
        state: {
          status: args.state_kind ? "identified" : "missing",
          kind: args.state_kind ?? null,
          intensity: args.intensity ?? (args.state_kind ? "medium" : null),
          confidence: args.confidence ?? "high",
          evidence: args.state_kind ? ["structured_test_state"] : [],
        },
        explicit_potion_request: {
          status: args.explicit_potion ? "identified" : "none",
          potion_type: args.explicit_potion ?? null,
          evidence: args.explicit_potion ? ["structured_explicit_potion"] : [],
        },
        shortlist: {
          status: (args.shortlist?.length ?? 0) >= 2 ? "identified" : "missing",
          options: args.shortlist ?? [],
          evidence: args.shortlist?.length ? ["structured_shortlist"] : [],
        },
        selected_potion: {
          status: selected ? "identified" : "missing",
          value: selected,
          confidence: args.confidence ?? "high",
          evidence: selected ? ["structured_test_potion_type"] : [],
        },
        details: {
          status: detailsReady ? "identified" : "missing",
          required_question_ids: detailAnswers.map((answer) =>
            answer.question_id
          ),
          answers: detailAnswers,
          fields: detailFields,
          optional_free_text: detailsReady
            ? {
              question_id: "optional_free_text",
              label: "Champ libre optionnel",
              required: false,
              status: "skipped_optional",
              proposed_value: null,
              locked_value: null,
              user_evidence: ["structured_optional_skipped"],
              needs_user_confirmation: false,
              evidence: ["structured_optional_skipped"],
            }
            : null,
          evidence: detailAnswers.length ? ["structured_details"] : [],
        },
        missing_slots: missing,
        generated_user_message: args.generated_user_message ?? null,
        confidence: args.confidence ?? "high",
      },
      missing_slots: missing,
      confidence: args.confidence ?? "high",
      generated_user_message: args.generated_user_message ?? null,
      evidence: ["structured_test_output"],
    };
  };
}
