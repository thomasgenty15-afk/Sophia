import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import type { CreateRecurringReminderCommittedEffect } from "./contract.ts";
import type { RecurringReminderDraftV1 } from "./generator.ts";
import { renderRecurringReminderExecuted } from "./renderer.ts";

export type CreateRecurringReminderExecutorOutcome =
  | {
    status: "executed";
    recurring_reminder_id: string;
    committed_effects: CreateRecurringReminderCommittedEffect[];
    ack: string;
  }
  | {
    status: "blocked";
    reason_code: string;
    ack: string;
    committed_effects: [];
  };

export async function executeCreateRecurringReminder(input: {
  operation_id: string;
  user_id: string;
  draft: RecurringReminderDraftV1;
  token?: ConfirmationToken | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_recurring_reminder: (
    draft: RecurringReminderDraftV1["draft"],
  ) => Promise<{ recurring_reminder_id: string }>;
  now_iso?: string;
  secret?: string;
}): Promise<CreateRecurringReminderExecutorOutcome> {
  if (
    !input.draft.draft.message ||
    !input.draft.draft.time ||
    !input.draft.draft.frequency
  ) {
    return {
      status: "blocked",
      reason_code: "draft_invalid",
      ack: "Je ne peux pas creer ce rappel: le draft est incomplet.",
      committed_effects: [],
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "create_recurring_reminder",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) {
    return {
      status: "blocked",
      ...guard,
      ack: guard.ack,
      committed_effects: [],
    };
  }
  const written = await input.write_recurring_reminder(input.draft.draft);
  const committedEffects: CreateRecurringReminderCommittedEffect[] = [{
    type: "create_recurring_reminder",
    operation_id: input.operation_id,
    recurring_reminder_id: written.recurring_reminder_id,
    message: input.draft.draft.message,
    frequency: input.draft.draft.frequency,
    days: input.draft.draft.days ?? [],
    time: input.draft.draft.time,
    timezone: input.draft.draft.timezone,
    destination: input.draft.draft.destination,
    target_binding: input.draft.draft.target_binding ?? null,
  }];
  return {
    status: "executed",
    recurring_reminder_id: written.recurring_reminder_id,
    committed_effects: committedEffects,
    ack: renderRecurringReminderExecuted({
      draft: input.draft,
      committedEffects,
    }),
  };
}
