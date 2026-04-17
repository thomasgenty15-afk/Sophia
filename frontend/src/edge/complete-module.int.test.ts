import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthedTestUser } from "../test/supabaseTestUtils";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("integration: complete-module Edge Function", () => {
  let userId: string;
  let client: SupabaseClient;

  beforeEach(async () => {
    const res = await createAuthedTestUser();
    userId = res.userId;
    client = res.client;
  });

  afterEach(async () => {
    // Best-effort cleanup for local runs.
    try {
      await client.from("user_week_states").delete().eq("user_id", userId);
      await client.from("user_module_state_entries").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("marks week_1 as completed and schedules week_2", async () => {
    // Seed the initial week state so the UPDATE path definitely touches a row.
    const { error: seedErr } = await client.from("user_week_states").upsert(
      {
      user_id: userId,
      module_id: "week_1",
      status: "available",
      available_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    const { data, error } = await client.functions.invoke("complete-module", {
      body: { moduleId: "week_1" },
    });
    if (error) throw error;
    expect(data?.success).toBe(true);

    const { data: w1, error: w1Err } = await client
      .from("user_week_states")
      .select("status, completed_at")
      .eq("user_id", userId)
      .eq("module_id", "week_1")
      .single();
    if (w1Err) throw w1Err;
    expect(w1.status).toBe("completed");
    expect(w1.completed_at).toBeTruthy();

    const { data: w2, error: w2Err } = await client
      .from("user_week_states")
      .select("status, available_at")
      .eq("user_id", userId)
      .eq("module_id", "week_2")
      .maybeSingle();
    if (w2Err) throw w2Err;
    expect(w2).toBeTruthy();
    expect(w2.status).toBe("available");
    expect(w2.available_at).toBeTruthy();
  });
});


