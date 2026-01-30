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
      await admin.from("user_plans").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("generate-plan returns a valid plan JSON (stub or real)", async () => {
    const { data, error } = await client.functions.invoke("generate-plan", {
      body: { inputs: { why: "x", blockers: "y", context: "z" }, currentAxis: { id: "a", title: "Sommeil", theme: "energy", problems: [] }, mode: "standard", answers: {} },
    });
    if (error) throw error;

    expect(data).toBeTruthy();
    expect(data.grimoireTitle).toBeTruthy();
    expect(Array.isArray(data.phases)).toBe(true);
    const actions = data.phases?.[0]?.actions ?? [];
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.tracking_type).toBeTruthy();
      expect(a.time_of_day).toBeTruthy();
    }
  });

  it("summarize-context returns {summary}", async () => {
    const { data, error } = await client.functions.invoke("summarize-context", {
      body: { responses: { structured_data: [] }, currentAxis: { id: "a", title: "Sommeil", theme: "energy" } },
    });
    // This endpoint returns 200 with {error} on failures; we want a real summary in stub mode.
    if (data?.error) throw new Error(data.error);
    if (error) throw error;
    expect(typeof data.summary).toBe("string");
    if (IS_STUB) expect(data.summary).toContain("MEGA_TEST_STUB");
    // Optional enrichments (may be undefined if backend falls back)
    if (data.suggested_pacing) {
      expect(["fast", "balanced", "slow"]).toContain(data.suggested_pacing.id);
    }
    if (data.examples) {
      expect(typeof data.examples).toBe("object");
    }
  });

  it("sort-priorities returns {sortedAxes}", async () => {
    const axes = [
      { id: "sleep", title: "Sommeil", problems: [] },
      { id: "focus", title: "Focus", problems: [] },
    ];
    const { data, error } = await client.functions.invoke("sort-priorities", { body: { axes } });
    if (error) throw error;
    expect(Array.isArray(data.sortedAxes)).toBe(true);
    expect(data.sortedAxes).toHaveLength(2);
    expect(data.sortedAxes[0].originalId).toBeTruthy();
    expect(data.sortedAxes[0].role).toBeTruthy();
    expect(data.sortedAxes[0].reasoning).toBeTruthy();
  });

  it("break-down-action returns a usable intermediate action JSON", async () => {
    const { data, error } = await client.functions.invoke("break-down-action", {
      body: {
        action: { title: "Sport", description: "20 min" },
        problem: "J'ai pas le temps",
        plan: { identity: "I", deepWhy: "W", goldenRules: "G" },
        submissionId: null,
      },
    });
    if (error) throw error;
    expect(data.title).toBeTruthy();
    expect(data.description).toBeTruthy();
    expect(data.tracking_type).toBeTruthy();
    expect(data.time_of_day).toBeTruthy();
    expect(data.status).toBe("active");
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


