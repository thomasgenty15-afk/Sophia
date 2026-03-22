import type { MomentumTraceWindow } from "./momentum_trace.ts";

export type MomentumTraceScorecard = {
  window: {
    from: string;
    to: string;
    scope: string | null;
    duration_hours: number;
  };
  coverage: {
    turns_total: number;
    user_messages: number;
    assistant_messages: number;
    state_events_total: number;
    proactive_decisions_total: number;
    outreachs_total: number;
    observability_events_total: number;
  };
  states: {
    distribution: Record<string, number>;
    current_state: string | null;
  };
  transitions: {
    total: number;
    matrix: Record<string, number>;
  };
  decisions: {
    daily_bilan: { allow: number; skip: number };
    weekly_bilan: { allow: number; skip: number };
    morning_nudge: { send: number; skip: number };
    outreach: { scheduled: number; skip: number };
  };
  morning_nudges: {
    sent_total: number;
    deferred_total: number;
    cancelled_total: number;
    failed_total: number;
  };
  outreach: {
    by_state: Record<string, number>;
    scheduled_total: number;
    schedule_skipped_total: number;
    sent_total: number;
    deferred_total: number;
    cancelled_total: number;
    failed_total: number;
    throttled_total: number;
    reply_total: number;
    reply_rate_on_sent: number | null;
    average_reply_delay_hours: number | null;
  };
  alerts: {
    branches_never_used: string[];
    oscillating_transitions: Record<string, number>;
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return round2(numerator / denominator);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildMomentumTraceScorecard(params: {
  trace: MomentumTraceWindow;
  annotations?: unknown[];
}): MomentumTraceScorecard {
  void params.annotations;
  const trace = params.trace;
  const durationHours = round2(
    Math.max(
      0,
      (new Date(trace.window.to).getTime() - new Date(trace.window.from).getTime()) /
        (60 * 60 * 1000),
    ),
  );

  const stateDistribution: Record<string, number> = {};
  const transitionMatrix: Record<string, number> = {};
  let currentState: string | null = null;
  for (const entry of trace.state_timeline) {
    const stateAfter = String(entry.state_after ?? "").trim();
    if (stateAfter) {
      stateDistribution[stateAfter] = (stateDistribution[stateAfter] ?? 0) + 1;
      currentState = stateAfter;
    }
    const stateBefore = String(entry.state_before ?? "").trim();
    if (stateBefore && stateAfter && stateBefore !== stateAfter) {
      const key = `${stateBefore}->${stateAfter}`;
      transitionMatrix[key] = (transitionMatrix[key] ?? 0) + 1;
    }
  }

  let dailyAllow = 0;
  let dailySkip = 0;
  let weeklyAllow = 0;
  let weeklySkip = 0;
  let morningSend = 0;
  let morningSkip = 0;
  let outreachScheduledDecision = 0;
  let outreachSkipDecision = 0;
  for (const decision of trace.proactive_decisions) {
    const target = String(decision.target_kind ?? "").trim();
    const outcome = String(decision.decision ?? "").trim();
    if (target === "daily_bilan") {
      if (outcome === "allow") dailyAllow += 1;
      if (outcome === "skip") dailySkip += 1;
    } else if (target === "weekly_bilan") {
      if (outcome === "allow") weeklyAllow += 1;
      if (outcome === "skip") weeklySkip += 1;
    } else if (target === "morning_nudge") {
      if (outcome === "send") morningSend += 1;
      if (outcome === "skip") morningSkip += 1;
    } else if (target === "momentum_outreach") {
      if (outcome === "scheduled") outreachScheduledDecision += 1;
      if (outcome === "skip") outreachSkipDecision += 1;
    }
  }

  let morningSentTotal = 0;
  let morningDeferredTotal = 0;
  let morningCancelledTotal = 0;
  let morningFailedTotal = 0;
  for (const event of trace.unassigned_events) {
    if (event.event_name === "momentum_morning_nudge_sent") {
      morningSentTotal += 1;
    } else if (event.event_name === "momentum_morning_nudge_deferred") {
      morningDeferredTotal += 1;
    } else if (event.event_name === "momentum_morning_nudge_cancelled") {
      morningCancelledTotal += 1;
    } else if (event.event_name === "momentum_morning_nudge_failed") {
      morningFailedTotal += 1;
    }
  }

  const outreachByState: Record<string, number> = {};
  let scheduledTotal = 0;
  let scheduleSkippedTotal = 0;
  let sentTotal = 0;
  let deferredTotal = 0;
  let cancelledTotal = 0;
  let failedTotal = 0;
  let throttledTotal = 0;
  let replyTotal = 0;
  const replyDelays: number[] = [];

  for (const outreach of trace.outreachs) {
    const state = String(outreach.outreach_state ?? "").trim() || "unknown";
    outreachByState[state] = (outreachByState[state] ?? 0) + 1;

    if (outreach.schedule?.event_name === "momentum_outreach_scheduled") scheduledTotal += 1;
    if (outreach.schedule?.event_name === "momentum_outreach_schedule_skipped") {
      scheduleSkippedTotal += 1;
    }

    for (const delivery of outreach.deliveries) {
      if (delivery.event_name === "momentum_outreach_sent") sentTotal += 1;
      else if (delivery.event_name === "momentum_outreach_deferred") deferredTotal += 1;
      else if (delivery.event_name === "momentum_outreach_cancelled") cancelledTotal += 1;
      else if (delivery.event_name === "momentum_outreach_failed") failedTotal += 1;
      else if (delivery.event_name === "momentum_outreach_throttled") throttledTotal += 1;
    }

    if (outreach.reaction?.event_name === "momentum_user_reply_after_outreach") {
      replyTotal += 1;
      const delay = Number(outreach.reaction.payload.delay_hours ?? NaN);
      if (Number.isFinite(delay)) replyDelays.push(delay);
    }
  }

  const requiredBranches = [
    "momentum",
    "friction_legere",
    "evitement",
    "pause_consentie",
    "soutien_emotionnel",
    "reactivation",
  ];
  const branchesNeverUsed = requiredBranches.filter((state) =>
    !stateDistribution[state] && !outreachByState[state]
  );

  const oscillatingTransitions: Record<string, number> = {};
  for (const [key, count] of Object.entries(transitionMatrix)) {
    const [from, to] = key.split("->");
    if (!from || !to) continue;
    const reverseKey = `${to}->${from}`;
    const reverse = transitionMatrix[reverseKey] ?? 0;
    if (count > 0 && reverse > 0) {
      oscillatingTransitions[`${from}<->${to}`] = count + reverse;
    }
  }

  return {
    window: {
      from: trace.window.from,
      to: trace.window.to,
      scope: trace.window.scope,
      duration_hours: durationHours,
    },
    coverage: {
      turns_total: trace.summary.turns_total,
      user_messages: trace.summary.user_messages,
      assistant_messages: trace.summary.assistant_messages,
      state_events_total: trace.summary.state_events_total,
      proactive_decisions_total: trace.summary.proactive_decisions_total,
      outreachs_total: trace.summary.outreachs_total,
      observability_events_total: trace.summary.observability_events_total,
    },
    states: {
      distribution: stateDistribution,
      current_state: currentState,
    },
    transitions: {
      total: Object.values(transitionMatrix).reduce((sum, value) => sum + value, 0),
      matrix: transitionMatrix,
    },
    decisions: {
      daily_bilan: { allow: dailyAllow, skip: dailySkip },
      weekly_bilan: { allow: weeklyAllow, skip: weeklySkip },
      morning_nudge: { send: morningSend, skip: morningSkip },
      outreach: { scheduled: outreachScheduledDecision, skip: outreachSkipDecision },
    },
    morning_nudges: {
      sent_total: morningSentTotal,
      deferred_total: morningDeferredTotal,
      cancelled_total: morningCancelledTotal,
      failed_total: morningFailedTotal,
    },
    outreach: {
      by_state: outreachByState,
      scheduled_total: scheduledTotal,
      schedule_skipped_total: scheduleSkippedTotal,
      sent_total: sentTotal,
      deferred_total: deferredTotal,
      cancelled_total: cancelledTotal,
      failed_total: failedTotal,
      throttled_total: throttledTotal,
      reply_total: replyTotal,
      reply_rate_on_sent: ratio(replyTotal, sentTotal),
      average_reply_delay_hours: avg(replyDelays),
    },
    alerts: {
      branches_never_used: branchesNeverUsed,
      oscillating_transitions: oscillatingTransitions,
    },
  };
}
