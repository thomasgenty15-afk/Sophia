import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

const BASE_URL = process.env.VITE_SUPABASE_URL;
const INTERNAL_SECRET = process.env.MEGA_INTERNAL_SECRET;
const IS_FULL = process.env.MEGA_TEST_FULL === "1";
const IS_STUB = process.env.MEGA_TEST_MODE !== "0";

function mustGetBaseUrl() {
  if (!BASE_URL) throw new Error("Missing VITE_SUPABASE_URL for internal functions tests");
  return BASE_URL;
}

async function callInternal(fn: string, body: any) {
  if (!INTERNAL_SECRET) throw new Error("Missing MEGA_INTERNAL_SECRET (runner couldn't read Edge SECRET_KEY)");
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
  // These endpoints should return JSON. If not, throw with context.
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

describe("edge functions: internal jobs (require X-Internal-Secret) [FULL]", () => {
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
      await admin.from("scheduled_checkins").delete().eq("user_id", userId);
      await admin.from("chat_messages").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it.skipIf(!IS_FULL)("detect-future-events: creates scheduled_checkins for active users", async () => {
    // Make user "active" by inserting a recent user message.
    const { error: msgErr } = await admin.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: "Demain j'ai une réunion importante",
      created_at: new Date().toISOString(),
    });
    if (msgErr) throw msgErr;

    const out = await callInternal("detect-future-events", {});
    expect(out.success).toBe(true);

    const { data, error } = await admin
      .from("scheduled_checkins")
      .select("status,event_context,draft_message,scheduled_for")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    expect(data).toBeTruthy();
    expect(data!.status).toBe("pending");
    if (IS_STUB) expect(data!.draft_message).toContain("MEGA_TEST_STUB");
    expect(data!.event_context).toBeTruthy();
    expect(new Date(data!.scheduled_for).getTime()).toBeGreaterThan(Date.now());
  });

  it.skipIf(!IS_FULL)("process-checkins: sends due checkins to chat_messages and marks them sent", async () => {
    const scheduledFor = new Date(Date.now() - 5_000).toISOString();

    const { data: row, error: insErr } = await admin
      .from("scheduled_checkins")
      .insert({
        user_id: userId,
        event_context: "Test event",
        draft_message: "Message programmé",
        scheduled_for: scheduledFor,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const out = await callInternal("process-checkins", {});
    expect(out.success).toBe(true);

    const { data: sent, error: chkErr } = await admin.from("scheduled_checkins").select("status,processed_at").eq("id", row.id).single();
    if (chkErr) throw chkErr;
    expect(sent.status).toBe("sent");
    expect(sent.processed_at).toBeTruthy();

    const { data: msg, error: msgReadErr } = await admin
      .from("chat_messages")
      .select("role,content,metadata")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (msgReadErr) throw msgReadErr;
    expect(msg.content).toBe("Message programmé");
    expect((msg.metadata as any)?.source).toBe("scheduled_checkin");
  });

  it.skipIf(!IS_FULL)("trigger-memory-echo: inserts an assistant message with metadata.source=memory_echo", async () => {
    // Eligible user: has activity in last week
    const { error: msgErr } = await admin.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: "Je doute de moi",
      created_at: new Date().toISOString(),
    });
    if (msgErr) throw msgErr;

    // Provide an older user message (30-180 days) for time_capsule strategy
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // ~60 days
    const { error: oldErr } = await admin.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: "Il y a 2 mois: j'avais peur d'échouer",
      created_at: oldDate,
    });
    if (oldErr) throw oldErr;

    const out = await callInternal("trigger-memory-echo", {});
    expect(out.success).toBe(true);

    const { data: echo, error: echoErr } = await admin
      .from("chat_messages")
      .select("role,content,metadata")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .contains("metadata", { source: "memory_echo" })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (echoErr) throw echoErr;
    expect(echo).toBeTruthy();
    expect(typeof echo!.content).toBe("string");
  });
});


