import { assertEquals } from "jsr:@std/assert@1";
import { verifyStripeWebhookSignature } from "./stripe.ts";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("verifyStripeWebhookSignature: valid signature passes", async () => {
  const secret = "whsec_test_secret";
  const rawBody = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;
  const sig = await hmacSha256Hex(secret, signedPayload);
  const header = `t=${timestamp},v1=${sig}`;

  const out = await verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: header,
    webhookSecret: secret,
  });
  assertEquals(out.ok, true);
});

Deno.test("verifyStripeWebhookSignature: invalid signature fails", async () => {
  const secret = "whsec_test_secret";
  const rawBody = JSON.stringify({ id: "evt_2", type: "customer.subscription.updated" });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=deadbeef`;

  const out = await verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: header,
    webhookSecret: secret,
  });
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.error, "Invalid signature");
});

Deno.test("verifyStripeWebhookSignature: stale timestamp fails", async () => {
  const secret = "whsec_test_secret";
  const rawBody = JSON.stringify({ id: "evt_3", type: "customer.subscription.updated" });
  const timestamp = Math.floor(Date.now() / 1000) - 3600;
  const signedPayload = `${timestamp}.${rawBody}`;
  const sig = await hmacSha256Hex(secret, signedPayload);
  const header = `t=${timestamp},v1=${sig}`;

  const out = await verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: header,
    webhookSecret: secret,
    toleranceSeconds: 300,
  });
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.error, "Webhook timestamp outside tolerance");
});
