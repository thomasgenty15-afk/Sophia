import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import type {
  PotionSessionDraftV1,
  StatePotionSchedulePlan,
} from "./generator.ts";

export type ActivateStatePotionExecutorOutcome =
  | {
    status: "executed";
    potion_session_id: string;
    recurring_reminder_id: string;
    scheduled_checkin_ids: string[];
    ack: string;
    messages: {
      instant_support_message: string;
      potion_info_message: string;
    };
  }
  | { status: "blocked"; reason_code: string; ack: string };

const WEEKDAY_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function nextLocalDates(
  nowIso: string,
  count: number,
): string[] {
  const start = new Date(nowIso);
  return Array.from(
    { length: count },
    (_, index) =>
      new Date(start.getTime() + (index + 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
  );
}

function datesForWeekdays(
  nowIso: string,
  durationDays: number,
  scheduledDays: string[],
): string[] {
  const allowed = new Set(scheduledDays);
  const start = new Date(nowIso);
  const dates: string[] = [];
  for (let index = 1; index <= durationDays; index++) {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    if (allowed.has(WEEKDAY_BY_INDEX[date.getUTCDay()] ?? "")) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  return dates;
}

function schedulePlanFromDraft(
  draft: PotionSessionDraftV1["draft"],
): StatePotionSchedulePlan {
  return draft.follow_up.schedule_plan ?? {
    mode: "daily_series",
    duration_days: draft.follow_up.duration_days ?? 7,
    local_time_hhmm: draft.follow_up.local_time_hhmm,
    scheduled_days: [],
    local_dates: [],
    timing_relation: "daily",
    reason: draft.follow_up.reason_for_time,
  };
}

function scheduledDatesFromPlan(
  plan: StatePotionSchedulePlan,
  nowIso: string,
): string[] {
  if (plan.mode === "single_before_event") return plan.local_dates.slice(0, 1);
  if (plan.mode === "specific_dates") return [...plan.local_dates];
  if (plan.mode === "specific_weekdays") {
    return datesForWeekdays(
      nowIso,
      plan.duration_days ?? 7,
      plan.scheduled_days,
    );
  }
  return nextLocalDates(nowIso, plan.duration_days ?? 7);
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
  // E0 (consentement, A3-r10 T6): quand le user refuse explicitement toute
  // programmation ("ne programme rien"), on active le soutien instantane mais
  // on n'ecrit AUCUN effet durable de planification (ni recurring_reminder ni
  // scheduled_checkin). Le writer doit donc aussi sauter ces inserts.
  suppress_follow_up_scheduling?: boolean;
  now_iso?: string;
  secret?: string;
}): Promise<ActivateStatePotionExecutorOutcome> {
  if (
    !input.draft.draft.potion_type ||
    !input.draft.draft.instant_support_message ||
    !input.draft.draft.potion_info_message
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
  // E0: refus explicite de programmation -> aucun suivi planifie. On n'exige
  // pas de creneau et on transmet une liste vide au writer (qui sautera aussi
  // l'insertion du recurring_reminder).
  const scheduled = input.suppress_follow_up_scheduling
    ? []
    : (() => {
      const schedulePlan = schedulePlanFromDraft(input.draft.draft);
      const scheduledDates = scheduledDatesFromPlan(
        schedulePlan,
        input.now_iso ?? new Date().toISOString(),
      );
      return scheduledDates.map((localDate) => ({
        local_date: localDate,
        local_time_hhmm: schedulePlan.local_time_hhmm ??
          input.draft.draft.follow_up.local_time_hhmm,
        reminder_instruction: input.draft.draft.follow_up.reminder_instruction,
      }));
    })();
  if (!input.suppress_follow_up_scheduling && scheduled.length < 1) {
    return {
      status: "blocked",
      reason_code: "potion_followup_schedule_empty",
      ack:
        "Je ne peux pas lancer cette potion: le rythme de suivi est incomplet.",
    };
  }
  const written = await input.write_potion_activation({
    draft: input.draft.draft,
    scheduled_followups: scheduled,
  });
  if (written.scheduled_checkin_ids.length !== scheduled.length) {
    return {
      status: "blocked",
      reason_code: "potion_followup_invariant_failed",
      ack: "La potion n'a pas ete activee car le suivi est incomplet.",
    };
  }
  return {
    status: "executed",
    ...written,
    ack: [
      input.draft.draft.instant_support_message,
      input.draft.draft.potion_info_message,
    ].join("\n\n"),
    messages: {
      instant_support_message: input.draft.draft.instant_support_message,
      potion_info_message: input.draft.draft.potion_info_message,
    },
  };
}
