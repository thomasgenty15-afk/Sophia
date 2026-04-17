import { assertEquals } from "jsr:@std/assert@1";

import { buildMomentumTraceWindow } from "./momentum_trace.ts";

Deno.test("buildMomentumTraceWindow groups state events, decisions and outreach lifecycle", () => {
  const trace = buildMomentumTraceWindow({
    userId: "00000000-0000-0000-0000-000000000001",
    from: "2026-03-19T00:00:00.000Z",
    to: "2026-03-20T00:00:00.000Z",
    scope: "whatsapp",
    messages: [
      {
        id: "msg-user-1",
        role: "user",
        content: "ok",
        scope: "whatsapp",
        created_at: "2026-03-19T10:00:00.000Z",
        metadata: { request_id: "req-1" },
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        content: "J'ai l'impression qu'il y a un petit frein concret.",
        scope: "whatsapp",
        created_at: "2026-03-19T08:00:00.000Z",
        metadata: {
          source: "scheduled_checkin",
          event_context: "momentum_friction_legere",
        },
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
        event_name: "router_momentum_state_applied",
        payload: {
          state_before: "momentum",
          state_after: "friction_legere",
          state_reason: "engaged_but_not_clearly_progressing",
          dimensions: {
            engagement: "medium",
            progression: "flat",
            emotional_load: "low",
            consent: "open",
          },
        },
      },
      {
        id: 2,
        created_at: "2026-03-19T07:50:00.000Z",
        request_id: "cron-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "trigger_daily_bilan",
        event_name: "daily_bilan_momentum_decision",
        payload: {
          target_kind: "daily_bilan",
          state_at_decision: "friction_legere",
          decision: "skip",
          decision_reason: "momentum_policy_block:daily_bilan:friction_legere:diagnostic_only",
        },
      },
      {
        id: 3,
        created_at: "2026-03-19T06:59:00.000Z",
        request_id: "chk-0",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "process_checkins",
        event_name: "momentum_morning_nudge_decision",
        payload: {
          target_kind: "morning_nudge",
          state_at_decision: "friction_legere",
          decision: "send",
          decision_reason: "momentum_morning_nudge_simplify:blocker_today",
        },
      },
      {
        id: 4,
        created_at: "2026-03-19T07:00:00.000Z",
        request_id: "chk-0",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "process_checkins",
        event_name: "momentum_morning_nudge_sent",
        payload: {
          event_context: "morning_active_actions_nudge",
          momentum_state: "friction_legere",
          momentum_strategy: "simplify_today",
          delivery_status: "sent",
        },
      },
      {
        id: 5,
        created_at: "2026-03-19T07:50:10.000Z",
        request_id: "cron-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "trigger_daily_bilan",
        event_name: "momentum_outreach_scheduled",
        payload: {
          outreach_state: "friction_legere",
          event_context: "momentum_friction_legere",
          scheduled_checkin_id: "chk-1",
          scheduled_for: "2026-03-19T07:55:00.000Z",
        },
      },
      {
        id: 6,
        created_at: "2026-03-19T08:00:01.000Z",
        request_id: "check-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "process_checkins",
        event_name: "momentum_outreach_sent",
        payload: {
          event_context: "momentum_friction_legere",
          outreach_state: "friction_legere",
          scheduled_checkin_id: "chk-1",
          delivery_status: "sent",
        },
      },
      {
        id: 7,
        created_at: "2026-03-19T10:00:02.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "router",
        event_name: "momentum_user_reply_after_outreach",
        payload: {
          related_outreach_event_context: "momentum_friction_legere",
          related_outreach_state: "friction_legere",
          related_outreach_sent_at: "2026-03-19T08:00:00.000Z",
          delay_hours: 2,
          reply_quality: "minimal",
        },
      },
    ],
  });

  assertEquals(trace.summary.turns_total, 1);
  assertEquals(trace.state_timeline.length, 1);
  assertEquals(trace.proactive_decisions.length, 2);
  assertEquals(trace.outreachs.length, 1);
  assertEquals(trace.outreachs[0]?.scheduled_checkin_id, "chk-1");
  assertEquals(trace.turns[0]?.reaction_events.length, 1);
});
