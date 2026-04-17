import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

const IS_STUB = process.env.MEGA_TEST_MODE !== "0";

describe("edge functions: client-facing (stubbed by default)", () => {
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
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("generate-feedback returns {feedback, insight, tip}", async () => {
    const { data, error } = await client.functions.invoke("generate-feedback", {
      body: { energyLevel: 60, wins: "x", block: "y", ratings: ["yes", "yes", "yes", "yes"], nextFocus: "z", history: [] },
    });
    if (error) throw error;
    expect(typeof data.feedback).toBe("string");
    expect(typeof data.insight).toBe("string");
    expect(typeof data.tip).toBe("string");
    if (IS_STUB) expect(data.feedback).toContain("MEGA_TEST_STUB");
  });

  it("sophia-brain logs user+assistant messages and initializes chat state", async () => {
    const { data, error } = await client.functions.invoke("sophia-brain", {
      body: { message: "Salut Sophia", history: [], channel: "web", scope: "web" },
    });
    if (error) throw error;
    expect(typeof data?.content).toBe("string");
    expect(data.content.length).toBeGreaterThan(0);

    const { count: msgCount, error: msgErr } = await admin
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (msgErr) throw msgErr;
    // At least user message + assistant response
    expect(msgCount).toBeGreaterThanOrEqual(2);

    const { data: state, error: stErr } = await admin
      .from("user_chat_states")
      .select("user_id,current_mode,risk_level,updated_at")
      .eq("user_id", userId)
      .eq("scope", "web")
      .single();
    if (stErr) throw stErr;
    expect(state.user_id).toBe(userId);
    expect(state.current_mode).toBeTruthy();
    expect(typeof state.risk_level).toBe("number");
    expect(state.updated_at).toBeTruthy();
  });
});

