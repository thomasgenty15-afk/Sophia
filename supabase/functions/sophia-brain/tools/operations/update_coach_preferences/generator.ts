import type {
  CoachPreferenceKey,
  CoachPreferencesPatchBuilderInput,
} from "../_shared/operation_payload_builder.ts";

export type CoachPreferencesPatchDraftV1 = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";
  draft: {
    patch: Partial<Record<CoachPreferenceKey, string>>;
    summary: string;
    reason?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

const ALLOWED_KEYS: CoachPreferenceKey[] = [
  "coach.tone",
  "coach.challenge_level",
  "coach.question_tendency",
];

export function validateCoachPreferencePatch(
  patch: Record<string, unknown>,
): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new Error("coach_preferences_patch_empty");
  for (const key of keys) {
    if (!ALLOWED_KEYS.includes(key as CoachPreferenceKey)) {
      throw new Error("coach_preferences_unsupported_key");
    }
  }
}

export function runCoachPreferencesPatchBuilder(
  input: CoachPreferencesPatchBuilderInput,
): CoachPreferencesPatchDraftV1 {
  validateCoachPreferencePatch(input.requested_patch);
  if (Object.keys(input.requested_patch).length > 1) {
    throw new Error("coach_preferences_too_many_inferred_keys");
  }
  const [key, value] = Object.entries(input.requested_patch)[0];
  const summary = key === "coach.question_tendency"
    ? `Sophia posera ${
      value === "peu_de_questions" ? "moins" : "plus"
    } de questions.`
    : key === "coach.challenge_level"
    ? `Sophia ajustera le niveau de challenge sur ${value}.`
    : `Sophia adoptera un ton ${value}.`;
  return {
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    draft: {
      patch: input.requested_patch,
      summary,
      reason: input.reason?.evidence?.[0] ?? null,
    },
    confirmation_message:
      `Je peux regler ma facon de repondre: ${summary} Tu veux que je l'applique ?`,
    confirmation_actions: ["yes", "no"],
  };
}
