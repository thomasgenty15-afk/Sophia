import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import {
  type CoachPreferencesPatchDraftV1,
  validateCoachPreferencePatch,
} from "./generator.ts";

export type UpdateCoachPreferencesExecutorOutcome =
  | {
    status: "executed";
    preferences_update_id: string;
    preferences_update_ids: string[];
    preference_keys: string[];
    ack: string;
  }
  | { status: "blocked"; reason_code: string; ack: string };

export async function executeUpdateCoachPreferences(input: {
  operation_id: string;
  user_id: string;
  draft: CoachPreferencesPatchDraftV1;
  token?: unknown | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_preferences_patch: (
    patch: CoachPreferencesPatchDraftV1["draft"]["patch"],
  ) => Promise<{
    preferences_update_id: string;
    preferences_update_ids?: string[];
    preference_keys?: string[];
  }>;
  now_iso?: string;
  secret?: string;
}): Promise<UpdateCoachPreferencesExecutorOutcome> {
  void input.operation_id;
  void input.user_id;
  void input.token;
  void input.safety_pregate_risk_band;
  void input.pending_confirmation_lookup;
  void input.token_consumption_check;
  void input.write_preferences_patch;
  void input.now_iso;
  void input.secret;
  try {
    validateCoachPreferencePatch(input.draft.draft.patch);
  } catch (error) {
    return {
      status: "blocked",
      reason_code: error instanceof Error ? error.message : "draft_invalid",
      ack:
        "Je t’ai préparé le réglage à reprendre dans les préférences coach de la plateforme. Il ne reste qu’à le mettre à jour depuis la plateforme.",
    };
  }
  return {
    status: "blocked",
    reason_code: "chat_mutation_disabled_platform_handoff",
    ack:
      "Je t’ai préparé le réglage à reprendre dans les préférences coach de la plateforme. Il ne reste qu’à le mettre à jour depuis la plateforme.",
  };
}
