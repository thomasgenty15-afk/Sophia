import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";
import { createHmac } from "node:crypto";

const BASE_URL = process.env.VITE_SUPABASE_URL;
const INTERNAL_SECRET = process.env.MEGA_INTERNAL_SECRET;
const HAS_INTERNAL_SECRET = Boolean(INTERNAL_SECRET);
const HAS_WA_APP_SECRET = Boolean(process.env.WHATSAPP_APP_SECRET?.trim());
const HAS_WA_VERIFY_TOKEN = Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim());

function mustGetBaseUrl() {
  if (!BASE_URL) throw new Error("Missing VITE_SUPABASE_URL for WhatsApp integration tests");
  return BASE_URL;
}

function mustGetWhatsAppAppSecret() {
  const s = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!s) throw new Error("Missing WHATSAPP_APP_SECRET (needed to sign webhook payloads in tests)");
  return s;
}

function mustGetVerifyToken() {
  const s = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!s) throw new Error("Missing WHATSAPP_WEBHOOK_VERIFY_TOKEN (needed for GET handshake test)");
  return s;
}

function signXHubSha256(appSecret: string, rawBody: string | Uint8Array) {
  const buf = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  const hex = createHmac("sha256", appSecret).update(buf).digest("hex");
  return `sha256=${hex}`;
}

async function callWebhookRaw(method: "GET" | "POST", path: string, body: string | null, headers?: Record<string, string>) {
  const url = `${mustGetBaseUrl()}/functions/v1/whatsapp-webhook${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(headers ?? {}), ...(body != null ? { "Content-Type": "application/json" } : {}) },
    body: body ?? undefined,
  });
  const text = await res.text();
  return { res, text };
}

async function callInternal(fn: string, body: any) {
  if (!INTERNAL_SECRET) throw new Error("Missing MEGA_INTERNAL_SECRET for internal functions tests");
  const url = `${mustGetBaseUrl()}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${fn} (status=${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${fn}: ${JSON.stringify(json)}`);
  }
  return json;
}

describe("WhatsApp: webhook + send (integration, offline-safe paths)", () => {
  let userId: string;
  let client: SupabaseClient;
  let admin: SupabaseClient;

  beforeEach(async () => {
    const res = await createAuthedTestUser();
    userId = res.userId;
    client = res.client;
    admin = createServiceRoleClient();
  });

  afterEach(async () => {
    try {
      await admin.from("chat_messages").delete().eq("user_id", userId);
      await admin.from("scheduled_checkins").delete().eq("user_id", userId);
      await admin.from("whatsapp_pending_actions").delete().eq("user_id", userId);
      await admin.from("profiles").update({ phone_invalid: false, whatsapp_opted_in: false, whatsapp_bilan_opted_in: false }).eq("id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it.skipIf(!HAS_WA_VERIFY_TOKEN)("whatsapp-webhook GET: verification handshake returns the challenge", async () => {
    const token = mustGetVerifyToken();
    const challenge = `challenge-${Date.now()}`;
    const { res, text } = await callWebhookRaw(
      "GET",
      `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${encodeURIComponent(challenge)}`,
      null,
    );
    expect(res.status).toBe(200);
    expect(text).toBe(challenge);
  });

  it("whatsapp-webhook POST: invalid signature -> 403", async () => {
    const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const { res, text } = await callWebhookRaw("POST", "", payload, { "X-Hub-Signature-256": "sha256=deadbeef" });
    expect(res.status).toBe(403);
    expect(text).toContain("Invalid signature");
  });

  it.skipIf(!HAS_WA_APP_SECRET)("whatsapp-webhook POST: STOP logs inbound + opts user out (no outbound send)", async () => {
    const { data: profile, error: pErr } = await admin.from("profiles").select("phone_number").eq("id", userId).single();
    if (pErr) throw pErr;
    const phone = profile.phone_number as string;

    // Ensure profile is eligible.
    const { error: updErr } = await admin.from("profiles").update({ phone_invalid: false, whatsapp_opted_in: true, whatsapp_bilan_opted_in: true }).eq("id", userId);
    if (updErr) throw updErr;

    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name: "Test User" } }],
                messages: [{ from: phone, id: `wamid.${Date.now()}`, type: "text", text: { body: "STOP" } }],
              },
            },
          ],
        },
      ],
    });

    const sig = signXHubSha256(mustGetWhatsAppAppSecret(), body);
    const { res, text } = await callWebhookRaw("POST", "", body, { "X-Hub-Signature-256": sig });
    expect(res.status).toBe(200);
    expect(text).toContain('"ok":true');

    const { data: prof2, error: p2Err } = await admin.from("profiles").select("whatsapp_opted_in,whatsapp_last_inbound_at").eq("id", userId).single();
    if (p2Err) throw p2Err;
    expect(prof2.whatsapp_opted_in).toBe(false);
    expect(prof2.whatsapp_last_inbound_at).toBeTruthy();

    const { count, error: cntErr } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .filter("metadata->>channel", "eq", "whatsapp");
    if (cntErr) throw cntErr;
    expect(count).toBe(1);
  });

  it.skipIf(!HAS_WA_APP_SECRET)("whatsapp-webhook POST: wrong-number marks profile invalid and does not log inbound", async () => {
    const { data: profile, error: pErr } = await admin.from("profiles").select("phone_number").eq("id", userId).single();
    if (pErr) throw pErr;
    const phone = profile.phone_number as string;

    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Test User" } }],
                messages: [{ from: phone, id: `wamid.${Date.now()}`, type: "text", text: { body: "Mauvais numéro" } }],
              },
            },
          ],
        },
      ],
    });
    const sig = signXHubSha256(mustGetWhatsAppAppSecret(), body);
    const { res } = await callWebhookRaw("POST", "", body, { "X-Hub-Signature-256": sig });
    expect(res.status).toBe(200);

    const { data: prof2, error: p2Err } = await admin.from("profiles").select("phone_invalid").eq("id", userId).single();
    if (p2Err) throw p2Err;
    expect(prof2.phone_invalid).toBe(true);

    const { count, error: cntErr } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .filter("metadata->>channel", "eq", "whatsapp");
    if (cntErr) throw cntErr;
    expect(count ?? 0).toBe(0);
  });

  it.skipIf(!HAS_WA_APP_SECRET)("whatsapp-webhook POST: idempotent on wa_message_id (no duplicate inbound logs)", async () => {
    const { data: profile, error: pErr } = await admin.from("profiles").select("phone_number").eq("id", userId).single();
    if (pErr) throw pErr;
    const phone = profile.phone_number as string;
    const waId = `wamid.${Date.now()}`;

    const bodyObj = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Test User" } }],
                messages: [{ from: phone, id: waId, type: "text", text: { body: "STOP" } }],
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(bodyObj);
    const sig = signXHubSha256(mustGetWhatsAppAppSecret(), body);

    const r1 = await callWebhookRaw("POST", "", body, { "X-Hub-Signature-256": sig });
    expect(r1.res.status).toBe(200);
    const r2 = await callWebhookRaw("POST", "", body, { "X-Hub-Signature-256": sig });
    expect(r2.res.status).toBe(200);

    const { count, error: cntErr } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .filter("metadata->>channel", "eq", "whatsapp")
      .filter("metadata->>wa_message_id", "eq", waId);
    if (cntErr) throw cntErr;
    expect(count).toBe(1);
  });

  it.skipIf(!HAS_INTERNAL_SECRET)("whatsapp-send: require_opted_in=true blocks non-opted users (409) without network", async () => {
    // Ensure opted out.
    const { error: updErr } = await admin.from("profiles").update({ whatsapp_opted_in: false, phone_invalid: false }).eq("id", userId);
    if (updErr) throw updErr;

    await expect(
      callInternal("whatsapp-send", {
        user_id: userId,
        message: { type: "text", body: "Hello" },
        require_opted_in: true,
      }),
    ).rejects.toThrow(/User not opted in/);
  });

  it.skipIf(!HAS_INTERNAL_SECRET)("whatsapp-send: proactive throttle returns 429 before sending (offline-safe)", async () => {
    // Proactive means: last inbound is null/old. Also must be opted in to reach throttle logic.
    const oldInbound = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
    const { error: updErr } = await admin
      .from("profiles")
      .update({ whatsapp_opted_in: true, whatsapp_last_inbound_at: oldInbound, phone_invalid: false })
      .eq("id", userId);
    if (updErr) throw updErr;

    const recent = new Date(Date.now() - 60_000).toISOString();
    const { error: insErr } = await admin.from("chat_messages").insert([
      {
        user_id: userId,
        role: "assistant",
        content: "proactive 1",
        created_at: recent,
        metadata: { channel: "whatsapp", is_proactive: true },
      },
      {
        user_id: userId,
        role: "assistant",
        content: "proactive 2",
        created_at: recent,
        metadata: { channel: "whatsapp", is_proactive: true },
      },
    ]);
    if (insErr) throw insErr;

    await expect(
      callInternal("whatsapp-send", {
        user_id: userId,
        // Try to force a path that would send; throttle should stop us before.
        message: { type: "template", name: "dummy", language: "fr" },
        require_opted_in: true,
      }),
    ).rejects.toThrow(/Proactive throttle/);
  });
});


