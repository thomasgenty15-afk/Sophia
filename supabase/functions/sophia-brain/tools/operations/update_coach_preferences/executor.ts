import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
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
  token?: ConfirmationToken | null;
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
  try {
    validateCoachPreferencePatch(input.draft.draft.patch);
  } catch (error) {
    return {
      status: "blocked",
      reason_code: error instanceof Error ? error.message : "draft_invalid",
      ack: "Je ne peux pas appliquer cette preference: le patch est invalide.",
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "update_coach_preferences",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) return { status: "blocked", ...guard };
  const written = await input.write_preferences_patch(input.draft.draft.patch);
  return {
    status: "executed",
    preferences_update_id: written.preferences_update_id,
    preferences_update_ids: written.preferences_update_ids ??
      [written.preferences_update_id],
    preference_keys: written.preference_keys ??
      Object.keys(input.draft.draft.patch),
    ack:
      `C'est fait. J'ai mis a jour ta preference : ${input.draft.draft.summary} Tu peux modifier dans ton espace sur sophia-coach.ai.`,
  };
}
