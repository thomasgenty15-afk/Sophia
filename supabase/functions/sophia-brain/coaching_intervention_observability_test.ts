import {
  assertEquals,
  assertMatch,
} from "jsr:@std/assert@1";

import {
  buildCoachingCustomizationContext,
  buildCoachingHistorySnapshot,
  buildWeeklyCoachingSummaryAuditPayload,
  deriveCoachingFollowUpAudit,
  detectCoachingInterventionRender,
  findCoachingDeprioritizedTechniques,
} from "./coaching_intervention_observability.ts";

Deno.test("coaching_intervention_observability: history snapshot stays compact", () => {
  const snapshot = buildCoachingHistorySnapshot([{
    technique_id: "minimum_version",
    blocker_type: "startup_inertia",
    outcome: "tried_helpful",
    helpful: true,
    last_used_at: "2026-03-20T10:00:00.000Z",
  }]);

  assertEquals(snapshot[0], {
    technique_id: "minimum_version",
    blocker_type: "startup_inertia",
    outcome: "tried_helpful",
    helpful: true,
    last_used_at: "2026-03-20T10:00:00.000Z",
  });
});

Deno.test("coaching_intervention_observability: customization context includes concrete user context", () => {
  const context = buildCoachingCustomizationContext({
    momentum_state: "friction_legere",
    explicit_help_request: true,
    trigger_kind: "explicit_blocker",
    last_user_message: "Je bloque toujours le soir quand je dois commencer mon dossier.",
    recent_context_summary: "user: fatigue le soir\nassistant: propose un mini pas",
    target_action_title: "Dossier admin",
  });

  assertEquals(context.target_action_title, "Dossier admin");
  assertEquals(context.explicit_help_request, true);
  assertMatch(String(context.last_user_message_excerpt), /soir/);
});

Deno.test("coaching_intervention_observability: finds deprioritized ineffective candidate", () => {
  const items = findCoachingDeprioritizedTechniques({
    blocker_type: "craving_or_urge",
    recommended_technique: "environment_shift",
    technique_history: [{
      technique_id: "urge_delay",
      blocker_type: "craving_or_urge",
      outcome: "tried_not_helpful",
      helpful: false,
      last_used_at: "2026-03-21T20:00:00.000Z",
    }],
  });

  assertEquals(items.length, 1);
  assertEquals(items[0]?.technique_id, "urge_delay");
  assertEquals(items[0]?.reason, "recently_not_helpful");
});

Deno.test("coaching_intervention_observability: detects rendered coaching signal", () => {
  const result = detectCoachingInterventionRender({
    addon: {
      eligible: true,
      gate: "allow",
      decision: "propose",
      reason: "test",
      blocker_type: "startup_inertia",
      confidence: "medium",
      need_clarification: false,
      recommended_technique: "ten_minute_sprint",
      technique_candidates: ["ten_minute_sprint"],
      message_angle: "gentle_experiment",
      intensity: "standard",
      follow_up_needed: true,
      follow_up_window_hours: 18,
      trigger_kind: "explicit_blocker",
      explicit_help_request: true,
      target_action_title: "Rapport",
      selector_source: "fallback",
      decided_at: "2026-03-22T10:00:00.000Z",
    },
    responseContent: "Fais juste un sprint de 10 minutes maintenant, puis tu reevalues.",
  });

  assertEquals(result.rendered, true);
  assertEquals(result.technique_signal_detected, true);
});

Deno.test("coaching_intervention_observability: derives follow-up audit from pending resolution", () => {
  const audit = deriveCoachingFollowUpAudit({
    before: {
      pending: {
        intervention_id: "coach_1",
        technique_id: "minimum_version",
        blocker_type: "startup_inertia",
        proposed_at: "2026-03-20T10:00:00.000Z",
        follow_up_due_at: null,
        target_action_title: "Dossier",
        selector_source: "llm",
      },
      history: [{
        intervention_id: "coach_1",
        technique_id: "minimum_version",
        blocker_type: "startup_inertia",
        outcome: "unknown",
        helpful: null,
        last_used_at: "2026-03-20T10:00:00.000Z",
        status: "pending",
        proposed_at: "2026-03-20T10:00:00.000Z",
        resolved_at: null,
        target_action_title: "Dossier",
        selector_source: "llm",
        outcome_reason: null,
      }],
    },
    after: {
      pending: null,
      history: [{
        intervention_id: "coach_1",
        technique_id: "minimum_version",
        blocker_type: "startup_inertia",
        outcome: "behavior_changed",
        helpful: true,
        last_used_at: "2026-03-20T12:00:00.000Z",
        status: "resolved",
        proposed_at: "2026-03-20T10:00:00.000Z",
        resolved_at: "2026-03-20T12:00:00.000Z",
        target_action_title: "Dossier",
        selector_source: "llm",
        outcome_reason: "heuristic_behavior_changed",
      }],
    },
  });

  assertEquals(audit?.follow_up_outcome, "behavior_changed");
  assertEquals(audit?.next_status, "resolved");
  assertEquals(audit?.technique_id, "minimum_version");
});

Deno.test("coaching_intervention_observability: weekly summary payload stays audit friendly", () => {
  const payload = buildWeeklyCoachingSummaryAuditPayload({
    proposed_count_7d: 3,
    resolved_count_7d: 2,
    helpful_count_7d: 1,
    not_helpful_count_7d: 1,
    behavior_change_count_7d: 1,
    pending_technique_id: null,
    pending_blocker_type: null,
    top_helpful_technique: "minimum_version",
    top_unhelpful_technique: "urge_delay",
    recommendation: "switch_technique",
    summary: "Changer d'approche.",
    recent_resolved: [{
      technique_id: "urge_delay",
      blocker_type: "craving_or_urge",
      outcome: "tried_not_helpful",
      target_action_title: "Cigarette soir",
      helpful: false,
      last_used_at: "2026-03-21T20:00:00.000Z",
    }],
  });

  assertEquals(payload.weekly_recommendation, "switch_technique");
  assertEquals(payload.top_helpful_technique, "minimum_version");
  assertEquals(payload.recent_resolved.length, 1);
});
