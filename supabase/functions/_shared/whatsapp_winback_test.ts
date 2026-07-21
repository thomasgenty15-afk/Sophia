import { assertEquals } from "jsr:@std/assert@1";

import {
  classifyWinbackReplyIntent,
  evaluateWhatsAppWinback,
} from "./whatsapp_winback.ts";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function evaluate(overrides: Record<string, unknown>) {
  return evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappBilanPausedUntil: null,
    whatsappCoachingPausedUntil: null,
    whatsappLastInboundAt: daysAgo(3),
    whatsappBilanWinbackStep: 0,
    whatsappBilanLastWinbackAt: null,
    now: NOW,
    ...overrides,
  });
}

Deno.test("evaluateWhatsAppWinback skips when not opted in or paused", () => {
  assertEquals(
    evaluate({ whatsappBilanOptedIn: false }).reason,
    "winback_not_opted_in",
  );
  assertEquals(
    evaluate({ whatsappBilanPausedUntil: daysAgo(-2) }).reason,
    "winback_pause_active",
  );
  assertEquals(
    evaluate({ whatsappCoachingPausedUntil: daysAgo(-1) }).reason,
    "winback_pause_active",
  );
});

Deno.test("evaluateWhatsAppWinback skips without an inbound reference", () => {
  const result = evaluate({ whatsappLastInboundAt: null });
  assertEquals(result.decision, "skip");
  assertEquals(result.reason, "winback_no_user_activity_reference");
});

Deno.test("evaluateWhatsAppWinback fires step 1 at 3 days of inactivity, not 2", () => {
  const atTwoDays = evaluate({ whatsappLastInboundAt: daysAgo(2) });
  assertEquals(atTwoDays.decision, "skip");
  assertEquals(atTwoDays.reason, "winback_inactivity_below_step1_threshold");
  assertEquals(atTwoDays.suppress_other_proactives, false);

  const atThreeDays = evaluate({ whatsappLastInboundAt: daysAgo(3) });
  assertEquals(atThreeDays.decision, "send");
  assertEquals(atThreeDays.step, 1);
  assertEquals(atThreeDays.reason, "winback_step1_due");
  assertEquals(atThreeDays.suppress_other_proactives, true);
});

Deno.test("evaluateWhatsAppWinback holds other proactives between step 1 and step 2", () => {
  const result = evaluate({
    whatsappBilanWinbackStep: 1,
    whatsappLastInboundAt: daysAgo(5),
    whatsappBilanLastWinbackAt: daysAgo(2),
  });
  assertEquals(result.decision, "skip");
  assertEquals(result.reason, "winback_step2_not_due_inactivity");
  assertEquals(result.suppress_other_proactives, true);
});

Deno.test("evaluateWhatsAppWinback fires step 2 at 6 days with the 3-day gap satisfied", () => {
  const tooEarly = evaluate({
    whatsappBilanWinbackStep: 1,
    whatsappLastInboundAt: daysAgo(5),
    whatsappBilanLastWinbackAt: daysAgo(3),
  });
  assertEquals(tooEarly.decision, "skip");
  assertEquals(tooEarly.reason, "winback_step2_not_due_inactivity");

  const gapTooShort = evaluate({
    whatsappBilanWinbackStep: 1,
    whatsappLastInboundAt: daysAgo(6),
    whatsappBilanLastWinbackAt: daysAgo(2),
  });
  assertEquals(gapTooShort.decision, "skip");
  assertEquals(gapTooShort.reason, "winback_step2_cooldown");

  const due = evaluate({
    whatsappBilanWinbackStep: 1,
    whatsappLastInboundAt: daysAgo(6),
    whatsappBilanLastWinbackAt: daysAgo(3),
  });
  assertEquals(due.decision, "send");
  assertEquals(due.step, 2);
  assertEquals(due.reason, "winback_step2_due");
});

Deno.test("evaluateWhatsAppWinback fires step 3 at 10 days with the 4-day gap satisfied", () => {
  const tooEarly = evaluate({
    whatsappBilanWinbackStep: 2,
    whatsappLastInboundAt: daysAgo(9),
    whatsappBilanLastWinbackAt: daysAgo(4),
  });
  assertEquals(tooEarly.decision, "skip");
  assertEquals(tooEarly.reason, "winback_step3_not_due_inactivity");

  const gapTooShort = evaluate({
    whatsappBilanWinbackStep: 2,
    whatsappLastInboundAt: daysAgo(10),
    whatsappBilanLastWinbackAt: daysAgo(3),
  });
  assertEquals(gapTooShort.decision, "skip");
  assertEquals(gapTooShort.reason, "winback_step3_cooldown");

  const due = evaluate({
    whatsappBilanWinbackStep: 2,
    whatsappLastInboundAt: daysAgo(10),
    whatsappBilanLastWinbackAt: daysAgo(4),
  });
  assertEquals(due.decision, "send");
  assertEquals(due.step, 3);
  assertEquals(due.reason, "winback_step3_due");
});

Deno.test("evaluateWhatsAppWinback keeps silence after step 3 but keeps suppressing", () => {
  const result = evaluate({
    whatsappBilanWinbackStep: 3,
    whatsappLastInboundAt: daysAgo(15),
    whatsappBilanLastWinbackAt: daysAgo(5),
  });
  assertEquals(result.decision, "skip");
  assertEquals(result.reason, "winback_waiting_after_step3");
  assertEquals(result.suppress_other_proactives, true);
});

Deno.test("classifyWinbackReplyIntent maps the reply intents", () => {
  assertEquals(
    classifyWinbackReplyIntent({ actionId: "winback_resume" }),
    "resume",
  );
  assertEquals(
    classifyWinbackReplyIntent({ text: "On fait simple" }),
    "simplify",
  );
  assertEquals(
    classifyWinbackReplyIntent({ text: "Pas cette semaine" }),
    "pause_week",
  );
  assertEquals(
    classifyWinbackReplyIntent({ text: "Laisse-moi revenir" }),
    "wait_for_user",
  );
  assertEquals(
    classifyWinbackReplyIntent({ text: "je sais pas trop où j'en suis" }),
    "unknown",
  );
});
