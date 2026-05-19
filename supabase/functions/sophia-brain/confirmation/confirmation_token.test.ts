import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  canonicalJson,
  consumeConfirmationToken,
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
  verifyConfirmationToken,
} from "./confirmation_token.ts";

const secret = "test-confirmation-secret";
const draft = { b: 2, a: { z: true, y: ["x"] } };

Deno.test("confirmation token canonical JSON is stable", () => {
  assertEquals(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

Deno.test("confirmation token verifies valid draft and signature", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    now_iso: "2026-05-04T10:00:00.000Z",
    secret,
  });
  const result = await verifyConfirmationToken({
    token,
    draft: { a: { y: ["x"], z: true }, b: 2 },
    user_id: "u1",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    safety_pregate_risk_band: "none",
    now_iso: "2026-05-04T10:01:00.000Z",
    secret,
  });
  assertEquals(result, { ok: true });
});

Deno.test("confirmation token rejects invalid signature", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    secret,
  });
  const result = await verifyConfirmationToken({
    token: { ...token, signature: "deadbeef" },
    draft,
    user_id: "u1",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    safety_pregate_risk_band: "none",
    secret,
  });
  assertEquals(result, { ok: false, reason_code: "signature_invalid" });
});

Deno.test("confirmation token rejects expired token", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    now_iso: "2026-05-04T10:00:00.000Z",
    ttl_ms: 1,
    secret,
  });
  const result = await verifyConfirmationToken({
    token,
    draft,
    user_id: "u1",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    safety_pregate_risk_band: "none",
    now_iso: "2026-05-04T10:00:01.000Z",
    secret,
  });
  assertEquals(result, { ok: false, reason_code: "expired" });
});

Deno.test("confirmation token rejects draft mismatch", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    secret,
  });
  const result = await verifyConfirmationToken({
    token,
    draft: { different: true },
    user_id: "u1",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    safety_pregate_risk_band: "none",
    secret,
  });
  assertEquals(result, { ok: false, reason_code: "draft_hash_mismatch" });
});

Deno.test("confirmation token rejects double consume and pending consumed", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    secret,
  });
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "u1",
      pending_confirmation_lookup: async () => ({ consumed: true }),
      token_consumption_check: async () => false,
      safety_pregate_risk_band: "none",
      secret,
    }),
    { ok: false, reason_code: "pending_consumed" },
  );
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "u1",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async () => true,
      safety_pregate_risk_band: "none",
      secret,
    }),
    { ok: false, reason_code: "token_consumed" },
  );
});

Deno.test("confirmation token rejects missing pending confirmation", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "missing",
    secret,
  });
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "u1",
      pending_confirmation_lookup: async () => null,
      token_consumption_check: async () => false,
      safety_pregate_risk_band: "none",
      secret,
    }),
    { ok: false, reason_code: "pending_not_found" },
  );
});

Deno.test("confirmation token rejects missing verification secret", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    secret,
  });
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "u1",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async () => false,
      safety_pregate_risk_band: "none",
      secret: "",
    }),
    { ok: false, reason_code: "missing_secret" },
  );
});

Deno.test("confirmation token rejects safety override and user mismatch", async () => {
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op1",
    operation_type: "prepare_attack_card",
    draft,
    source_message_id: "m1",
    pending_confirmation_id: "pending1",
    secret,
  });
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "u1",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async () => false,
      safety_pregate_risk_band: "high",
      secret,
    }),
    { ok: false, reason_code: "safety_override" },
  );
  assertEquals(
    await verifyConfirmationToken({
      token,
      draft,
      user_id: "other",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async () => false,
      safety_pregate_risk_band: "none",
      secret,
    }),
    { ok: false, reason_code: "user_id_mismatch" },
  );
});

Deno.test("consumeConfirmationToken records consumption", async () => {
  resetConsumedConfirmationTokensForTest();
  await consumeConfirmationToken("token1");
  assertEquals(hasConsumedConfirmationTokenForTest("token1"), true);
});
