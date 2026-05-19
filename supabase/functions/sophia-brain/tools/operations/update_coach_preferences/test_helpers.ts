import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";
import type { CoachPreferencesSlotFiller } from "./slot_filler.ts";

export function structuredCoachPreferencesSlotFiller(
  statePatch: Record<string, unknown>,
  missingSlots: string[] = [],
): CoachPreferencesSlotFiller {
  return async () => ({
    current_step: missingSlots.length
      ? "preference_resolution"
      : "draft_generation",
    state_patch: statePatch as any,
    missing_slots: missingSlots,
    confidence: "high",
    generated_user_message: missingSlots.length
      ? "Tu veux changer mon ton, mon niveau de challenge, ou ma tendance à poser des questions ?"
      : null,
    evidence: ["structured test filler"],
  });
}

export function readyCoachPreferencesStatePatch(
  key: CoachPreferenceKey = "coach.tone",
  value = "direct",
) {
  return {
    preference: {
      status: "identified",
      key,
      confidence: "high",
      evidence: ["structured preference"],
    },
    desired_value: {
      status: "identified",
      value,
      confidence: "high",
      evidence: ["structured value"],
    },
    reason: {
      evidence: ["structured reason"],
      confidence: "high",
    },
  };
}
