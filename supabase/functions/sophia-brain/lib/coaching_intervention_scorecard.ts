import type { CoachingTraceWindow } from "./coaching_intervention_trace.ts";

export type CoachingInterventionTraceScorecard = {
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
    selector_runs_total: number;
    interventions_total: number;
    follow_ups_total: number;
    weekly_surfaces_total: number;
    observability_events_total: number;
  };
  triggers: {
    distribution: Record<string, number>;
  };
  gating: {
    eligible_total: number;
    blocked_total: number;
    by_gate: Record<string, number>;
    skipped_total: number;
  };
  blockers: {
    distribution: Record<string, number>;
    confidence: Record<string, number>;
  };
  techniques: {
    proposed_by_technique: Record<string, number>;
    tried_by_technique: Record<string, number>;
    helpful_by_technique: Record<string, number>;
    not_helpful_by_technique: Record<string, number>;
    behavior_changed_by_technique: Record<string, number>;
  };
  effectiveness: {
    proposal_total: number;
    tried_total: number;
    helpful_total: number;
    behavior_changed_total: number;
    proposal_to_try_rate: number | null;
    try_to_helpful_rate: number | null;
    behavior_change_rate: number | null;
    repeat_failed_technique_rate: number | null;
  };
  weekly: {
    recommendation_distribution: Record<string, number>;
  };
  alerts: {
    techniques_never_used: string[];
    low_confidence_selector_runs: number;
    repeated_failed_technique_signals: number;
    unresolved_proposals: number;
  };
};

const ALL_TECHNIQUES = [
  "three_second_rule",
  "minimum_version",
  "ten_minute_sprint",
  "if_then_plan",
  "environment_shift",
  "urge_delay",
  "immediate_replacement",
  "contrast_visualization",
  "precommitment",
  "relapse_protocol",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return round2(numerator / denominator);
}

function incr(store: Record<string, number>, key: string | null | undefined) {
  const normalized = String(key ?? "").trim() || "unknown";
  store[normalized] = (store[normalized] ?? 0) + 1;
}

export function buildCoachingInterventionTraceScorecard(params: {
  trace: CoachingTraceWindow;
  annotations?: unknown[];
}): CoachingInterventionTraceScorecard {
  void params.annotations;
  const trace = params.trace;
  const durationHours = round2(
    Math.max(
      0,
      (new Date(trace.window.to).getTime() - new Date(trace.window.from).getTime()) /
        (60 * 60 * 1000),
    ),
  );

  const triggerDistribution: Record<string, number> = {};
  const gateDistribution: Record<string, number> = {};
  const blockerDistribution: Record<string, number> = {};
  const confidenceDistribution: Record<string, number> = {};
  let eligibleTotal = 0;
  let blockedTotal = 0;
  let skippedTotal = 0;
  let lowConfidenceRuns = 0;
  let deprioritizedSignals = 0;

  for (const run of trace.selector_runs) {
    incr(triggerDistribution, run.trigger_type);
    incr(gateDistribution, String(run.payload.gate ?? "unknown"));
    incr(blockerDistribution, run.blocker_type);
    incr(confidenceDistribution, run.confidence);
    if (run.eligible === true) eligibleTotal += 1;
    if (run.eligible === false) blockedTotal += 1;
    if (run.skip_reason) skippedTotal += 1;
    if (run.confidence === "low") lowConfidenceRuns += 1;
  }

  for (const turn of trace.turns) {
    for (const event of turn.selector_runs) {
      if (event.event_name === "coaching_technique_deprioritized") deprioritizedSignals += 1;
    }
  }

  const proposedByTechnique: Record<string, number> = {};
  const triedByTechnique: Record<string, number> = {};
  const helpfulByTechnique: Record<string, number> = {};
  const notHelpfulByTechnique: Record<string, number> = {};
  const behaviorChangedByTechnique: Record<string, number> = {};
  let proposalTotal = 0;
  let triedTotal = 0;
  let helpfulTotal = 0;
  let behaviorChangedTotal = 0;
  let unresolvedProposals = 0;

  for (const intervention of trace.interventions) {
    incr(proposedByTechnique, intervention.recommended_technique);
    proposalTotal += 1;
    const outcome = String(intervention.follow_up?.payload.follow_up_outcome ?? "").trim();
    if (!intervention.follow_up) {
      unresolvedProposals += 1;
      continue;
    }
    if (
      outcome === "tried_helpful" || outcome === "tried_not_helpful" ||
      outcome === "behavior_changed"
    ) {
      incr(triedByTechnique, intervention.recommended_technique);
      triedTotal += 1;
    }
    if (outcome === "tried_helpful" || outcome === "behavior_changed") {
      incr(helpfulByTechnique, intervention.recommended_technique);
      helpfulTotal += 1;
    }
    if (outcome === "tried_not_helpful") {
      incr(notHelpfulByTechnique, intervention.recommended_technique);
    }
    if (outcome === "behavior_changed") {
      incr(behaviorChangedByTechnique, intervention.recommended_technique);
      behaviorChangedTotal += 1;
    }
  }

  const weeklyRecommendationDistribution: Record<string, number> = {};
  for (const row of trace.weekly_surfaces) {
    incr(weeklyRecommendationDistribution, row.weekly_recommendation);
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
      selector_runs_total: trace.summary.selector_runs_total,
      interventions_total: trace.summary.interventions_total,
      follow_ups_total: trace.summary.follow_ups_total,
      weekly_surfaces_total: trace.summary.weekly_surfaces_total,
      observability_events_total: trace.summary.observability_events_total,
    },
    triggers: {
      distribution: triggerDistribution,
    },
    gating: {
      eligible_total: eligibleTotal,
      blocked_total: blockedTotal,
      by_gate: gateDistribution,
      skipped_total: skippedTotal,
    },
    blockers: {
      distribution: blockerDistribution,
      confidence: confidenceDistribution,
    },
    techniques: {
      proposed_by_technique: proposedByTechnique,
      tried_by_technique: triedByTechnique,
      helpful_by_technique: helpfulByTechnique,
      not_helpful_by_technique: notHelpfulByTechnique,
      behavior_changed_by_technique: behaviorChangedByTechnique,
    },
    effectiveness: {
      proposal_total: proposalTotal,
      tried_total: triedTotal,
      helpful_total: helpfulTotal,
      behavior_changed_total: behaviorChangedTotal,
      proposal_to_try_rate: ratio(triedTotal, proposalTotal),
      try_to_helpful_rate: ratio(helpfulTotal, triedTotal),
      behavior_change_rate: ratio(behaviorChangedTotal, proposalTotal),
      repeat_failed_technique_rate: ratio(deprioritizedSignals, trace.summary.selector_runs_total),
    },
    weekly: {
      recommendation_distribution: weeklyRecommendationDistribution,
    },
    alerts: {
      techniques_never_used: ALL_TECHNIQUES.filter((id) => !proposedByTechnique[id]),
      low_confidence_selector_runs: lowConfidenceRuns,
      repeated_failed_technique_signals: deprioritizedSignals,
      unresolved_proposals: unresolvedProposals,
    },
  };
}
