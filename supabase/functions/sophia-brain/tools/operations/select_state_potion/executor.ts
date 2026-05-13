import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import type { PotionSessionDraftV1 } from "./generator.ts";

export type ActivateStatePotionExecutorOutcome =
  | {
    status: "executed";
    potion_session_id: string;
    recurring_reminder_id: string;
    scheduled_checkin_ids: string[];
    ack: string;
  }
  | { status: "blocked"; reason_code: string; ack: string };

function nextSevenLocalDates(nowIso: string): string[] {
  const start = new Date(nowIso);
  return Array.from(
    { length: 7 },
    (_, index) =>
      new Date(start.getTime() + (index + 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
  );
}

export async function executeActivateStatePotion(input: {
  operation_id: string;
  user_id: string;
  draft: PotionSessionDraftV1;
  token?: ConfirmationToken | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_potion_activation: (input: {
    draft: PotionSessionDraftV1["draft"];
    scheduled_followups: Array<{
      local_date: string;
      local_time_hhmm: string;
      reminder_instruction: string;
    }>;
  }) => Promise<{
    potion_session_id: string;
    recurring_reminder_id: string;
    scheduled_checkin_ids: string[];
  }>;
  now_iso?: string;
  secret?: string;
}): Promise<ActivateStatePotionExecutorOutcome> {
  if (
    !input.draft.draft.potion_type ||
    !input.draft.draft.instant_support_message ||
    input.draft.draft.follow_up.duration_days !== 7
  ) {
    return {
      status: "blocked",
      reason_code: "draft_invalid",
      ack: "Je ne peux pas lancer cette potion: le draft est incomplet.",
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "select_state_potion",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) return { status: "blocked", ...guard };
  const scheduled = nextSevenLocalDates(
    input.now_iso ?? new Date().toISOString(),
  )
    .map((localDate) => ({
      local_date: localDate,
      local_time_hhmm: input.draft.draft.follow_up.local_time_hhmm,
      reminder_instruction: input.draft.draft.follow_up.reminder_instruction,
    }));
  const written = await input.write_potion_activation({
    draft: input.draft.draft,
    scheduled_followups: scheduled,
  });
  if (written.scheduled_checkin_ids.length !== 7) {
    return {
      status: "blocked",
      reason_code: "potion_followup_invariant_failed",
      ack: "La potion n'a pas ete activee car le suivi 7 jours est incomplet.",
    };
  }
  return {
    status: "executed",
    ...written,
    ack:
      `C'est fait. J'ai lance une potion ${input.draft.draft.potion_type}.\n\n${input.draft.draft.instant_support_message}\n\nJe t'ai aussi programme un rappel quotidien pendant 7 jours. Tu peux modifier dans ton espace sur sophia-coach.ai.`,
  };
}
