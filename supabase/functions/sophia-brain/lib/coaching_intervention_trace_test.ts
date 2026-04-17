import { assertEquals } from "jsr:@std/assert@1";

import { buildCoachingInterventionTraceWindow } from "./coaching_intervention_trace.ts";

Deno.test("buildCoachingInterventionTraceWindow groups selector, render, proposal and follow-up", () => {
  const trace = buildCoachingInterventionTraceWindow({
    userId: "00000000-0000-0000-0000-000000000001",
    from: "2026-03-19T00:00:00.000Z",
    to: "2026-03-20T00:00:00.000Z",
    scope: "whatsapp",
    messages: [
      {
        id: "msg-user-1",
        role: "user",
        content: "Je bloque encore sur mon dossier.",
        scope: "whatsapp",
        created_at: "2026-03-19T10:00:00.000Z",
        metadata: {},
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        content: "Fais juste 10 minutes maintenant.",
        scope: "whatsapp",
        created_at: "2026-03-19T10:00:04.000Z",
        metadata: { request_id: "req-1" },
      },
    ],
    observabilityEvents: [
      {
        id: 1,
        created_at: "2026-03-19T10:00:01.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "coaching_trigger_detected",
        payload: {
          momentum_state: "friction_legere",
          trigger_type: "explicit_blocker",
          blocker_type: "startup_inertia",
        },
      },
      {
        id: 2,
        created_at: "2026-03-19T10:00:01.200Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "coaching_selector_run",
        payload: {
          momentum_state: "friction_legere",
          trigger_type: "explicit_blocker",
          blocker_type: "startup_inertia",
          confidence: "medium",
          eligible: true,
          recommended_technique: "ten_minute_sprint",
          candidate_techniques: ["ten_minute_sprint", "minimum_version"],
          follow_up_needed: true,
        },
      },
      {
        id: 3,
        created_at: "2026-03-19T10:00:03.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "coaching_intervention_rendered",
        payload: {
          trigger_type: "explicit_blocker",
          blocker_type: "startup_inertia",
          recommended_technique: "ten_minute_sprint",
          rendered: true,
        },
      },
      {
        id: 4,
        created_at: "2026-03-19T10:00:03.500Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "coaching_intervention_proposed",
        payload: {
          intervention_id: "coach_1",
          momentum_state: "friction_legere",
          trigger_type: "explicit_blocker",
          blocker_type: "startup_inertia",
          confidence: "medium",
          recommended_technique: "ten_minute_sprint",
          candidate_techniques: ["ten_minute_sprint", "minimum_version"],
          follow_up_needed: true,
          follow_up_due_at: "2026-03-20T04:00:00.000Z",
        },
      },
      {
        id: 5,
        created_at: "2026-03-19T18:00:00.000Z",
        request_id: "req-2",
        turn_id: "msg-user-2",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "coaching_followup_classified",
        payload: {
          intervention_id: "coach_1",
          recommended_technique: "ten_minute_sprint",
          follow_up_outcome: "behavior_changed",
          helpful: true,
        },
      },
      {
        id: 6,
        created_at: "2026-03-19T20:00:00.000Z",
        request_id: "weekly-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "trigger_weekly_bilan",
        event_name: "coaching_weekly_summary_generated",
        payload: {
          weekly_recommendation: "keep_best",
          summary: "Le sprint 10 minutes aide.",
        },
      },
    ],
  });

  assertEquals(trace.summary.selector_runs_total, 1);
  assertEquals(trace.summary.interventions_total, 1);
  assertEquals(trace.summary.follow_ups_total, 1);
  assertEquals(trace.summary.weekly_surfaces_total, 1);
  assertEquals(trace.turns[0]?.selector_runs.length, 2);
  assertEquals(trace.interventions[0]?.render?.event_name, "coaching_intervention_rendered");
  assertEquals(trace.interventions[0]?.follow_up?.event_name, "coaching_followup_classified");
});
