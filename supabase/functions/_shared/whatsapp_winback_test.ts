import { assertEquals } from "jsr:@std/assert@1";

import {
  classifyWinbackReplyIntent,
  evaluateWhatsAppWinback,
} from "./whatsapp_winback.ts";

Deno.test("evaluateWhatsAppWinback triggers step 1 after 2 days of inactivity", () => {
  const now = new Date("2026-03-22T12:00:00.000Z");
  const result = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappLastInboundAt: "2026-03-20T08:00:00.000Z",
    whatsappBilanWinbackStep: 0,
    now,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.step, 1);
  assertEquals(result.reason, "winback_step1_due");
  assertEquals(result.suppress_other_proactives, true);
});

Deno.test("evaluateWhatsAppWinback holds other proactives between step 1 and step 2", () => {
  const now = new Date("2026-03-24T12:00:00.000Z");
  const result = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappLastInboundAt: "2026-03-20T08:00:00.000Z",
    whatsappBilanWinbackStep: 1,
    whatsappBilanLastWinbackAt: "2026-03-22T09:00:00.000Z",
    now,
  });

  assertEquals(result.decision, "skip");
  assertEquals(result.reason, "winback_step2_not_due_inactivity");
  assertEquals(result.suppress_other_proactives, true);
});

Deno.test("evaluateWhatsAppWinback triggers step 2 at J+5 with cooldown satisfied", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const result = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappLastInboundAt: "2026-03-20T08:00:00.000Z",
    whatsappBilanWinbackStep: 1,
    whatsappBilanLastWinbackAt: "2026-03-22T08:00:00.000Z",
    now,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.step, 2);
  assertEquals(result.reason, "winback_step2_due");
});

Deno.test("evaluateWhatsAppWinback triggers step 3 at J+9 with cooldown satisfied", () => {
  const now = new Date("2026-03-29T12:00:00.000Z");
  const result = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappLastInboundAt: "2026-03-20T08:00:00.000Z",
    whatsappBilanWinbackStep: 2,
    whatsappBilanLastWinbackAt: "2026-03-25T08:00:00.000Z",
    now,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.step, 3);
  assertEquals(result.reason, "winback_step3_due");
});

Deno.test("evaluateWhatsAppWinback keeps silence after step 3", () => {
  const now = new Date("2026-03-30T12:00:00.000Z");
  const result = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappLastInboundAt: "2026-03-20T08:00:00.000Z",
    whatsappBilanWinbackStep: 3,
    whatsappBilanLastWinbackAt: "2026-03-29T08:00:00.000Z",
    now,
  });

  assertEquals(result.decision, "skip");
  assertEquals(result.reason, "winback_waiting_after_step3");
  assertEquals(result.suppress_other_proactives, true);
});

Deno.test("classifyWinbackReplyIntent maps the new reply intents", () => {
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
});
