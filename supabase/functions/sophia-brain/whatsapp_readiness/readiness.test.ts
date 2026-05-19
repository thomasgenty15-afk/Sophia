import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildWhatsAppReadinessChecklist,
  buildWhatsAppTimeoutFallbackText,
  buildWhatsAppTypingIndicatorPayload,
  coalesceWhatsAppBursts,
  renderWhatsAppReadinessMarkdown,
  runWithWhatsAppTimeoutFallback,
  shouldSendTimeoutFallback,
  shouldSendTypingIndicator,
} from "./readiness.ts";

Deno.test("S8 WhatsApp readiness builds typing indicator fallback payload", () => {
  const payload = buildWhatsAppTypingIndicatorPayload({
    to_e164: "+33612345678",
    wa_message_id: "wamid.in",
  });
  assertEquals(payload.to, "33612345678");
  assertEquals((payload.text as any).body.length > 0, true);
  assertEquals((payload.context as any).message_id, "wamid.in");
});

Deno.test("S8 WhatsApp readiness gates typing and timeout fallback by elapsed time", () => {
  assertEquals(
    shouldSendTypingIndicator({ channel: "whatsapp", elapsed_ms: 600 }),
    true,
  );
  assertEquals(
    shouldSendTypingIndicator({ channel: "web", elapsed_ms: 600 }),
    false,
  );
  assertEquals(
    shouldSendTimeoutFallback({ channel: "whatsapp", elapsed_ms: 7_999 }),
    false,
  );
  assertEquals(
    shouldSendTimeoutFallback({ channel: "whatsapp", elapsed_ms: 8_000 }),
    true,
  );
  assertEquals(buildWhatsAppTimeoutFallbackText(8_200).includes("8s"), true);
});

Deno.test("S8 WhatsApp readiness timeout wrapper sends waiting message only when work is slow", async () => {
  let fastFallbacks = 0;
  const fast = await runWithWhatsAppTimeoutFallback({
    timeout_ms: 20,
    work: async () => "ok",
    send_waiting_message: () => {
      fastFallbacks += 1;
    },
  });
  assertEquals(fast.result, "ok");
  assertEquals(fast.fallback_sent, false);
  assertEquals(fastFallbacks, 0);

  let slowFallbacks = 0;
  const slow = await runWithWhatsAppTimeoutFallback({
    timeout_ms: 5,
    work: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "late";
    },
    send_waiting_message: () => {
      slowFallbacks += 1;
    },
  });
  assertEquals(slow.result, "late");
  assertEquals(slow.fallback_sent, true);
  assertEquals(slowFallbacks, 1);
});

Deno.test("S8 WhatsApp readiness coalesces three-message bursts within 3 seconds", () => {
  const bursts = coalesceWhatsAppBursts([
    {
      wa_message_id: "m1",
      user_id: "u1",
      from_e164: "+336",
      text: "je suis bloque",
      received_at_ms: 1_000,
    },
    {
      wa_message_id: "m2",
      user_id: "u1",
      from_e164: "+336",
      text: "sur la marche",
      received_at_ms: 2_500,
    },
    {
      wa_message_id: "m3",
      user_id: "u1",
      from_e164: "+336",
      text: "fais simple",
      received_at_ms: 4_000,
    },
    {
      wa_message_id: "m4",
      user_id: "u1",
      from_e164: "+336",
      text: "plus tard",
      received_at_ms: 9_500,
    },
  ]);
  assertEquals(bursts.length, 2);
  assertEquals(bursts[0].message_ids, ["m1", "m2", "m3"]);
  assertEquals(bursts[0].text, "je suis bloque\nsur la marche\nfais simple");
});

Deno.test("S8 WhatsApp readiness renders local and pilot checklist", () => {
  const checks = buildWhatsAppReadinessChecklist({
    webhook_receiver_ok: true,
    outbound_send_ok: false,
    typing_indicator_ok: true,
    timeout_fallback_ok: true,
    message_burst_ok: true,
  });
  assertEquals(checks.length, 5);
  assertEquals(checks.some((check) => check.status === "pending"), true);
  assertEquals(
    renderWhatsAppReadinessMarkdown(checks).includes("outbound_send"),
    true,
  );
});
