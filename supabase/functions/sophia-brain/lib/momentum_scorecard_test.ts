import { assertEquals } from "jsr:@std/assert@1";

import { buildMomentumTraceWindow } from "./momentum_trace.ts";
import { buildMomentumTraceScorecard } from "./momentum_scorecard.ts";

Deno.test("buildMomentumTraceScorecard aggregates distributions, decisions and outreach outcomes", () => {
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
          decision_reason: "morning_send",
        },
      },
      {
        id: 3,
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
        id: 4,
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
          decision_reason: "x",
        },
      },
      {
        id: 5,
        created_at: "2026-03-19T07:50:10.000Z",
        request_id: "cron-1",
        channel: "whatsapp",
        scope: "whatsapp",
        source_component: "trigger_daily_bilan",
        event_name: "momentum_outreach_decision",
        payload: {
          target_kind: "momentum_outreach",
          state_at_decision: "friction_legere",
          decision: "scheduled",
          decision_reason: "momentum_outreach_scheduled:friction_legere",
          event_context: "momentum_friction_legere",
          scheduled_checkin_id: "chk-1",
        },
      },
      {
        id: 6,
        created_at: "2026-03-19T07:50:11.000Z",
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
        id: 7,
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
        id: 8,
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

  const scorecard = buildMomentumTraceScorecard({ trace });
  assertEquals(scorecard.states.distribution.friction_legere, 1);
  assertEquals(scorecard.decisions.daily_bilan.skip, 1);
  assertEquals(scorecard.decisions.morning_nudge.send, 1);
  assertEquals(scorecard.morning_nudges.sent_total, 1);
  assertEquals(scorecard.decisions.outreach.scheduled, 1);
  assertEquals(scorecard.outreach.sent_total, 1);
  assertEquals(scorecard.outreach.reply_total, 1);
  assertEquals(scorecard.outreach.reply_rate_on_sent, 1);
});
