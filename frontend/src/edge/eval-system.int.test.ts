import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient, createAnonClient } from "../test/supabaseTestUtils";

describe("eval system: judge + suggestions (stored on run)", () => {
  let userId: string;
  let client: SupabaseClient;
  let admin: SupabaseClient;
  const masterEmail = "thomasgenty15@gmail.com";
  const masterPassword = "123456";

  beforeAll(async () => {
    admin = createServiceRoleClient();

    // Ensure the master admin user exists (and is the only possible admin).
    // Try sign-in first; if it fails, create user via service role then sign in.
    const anon = createAnonClient();
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email: masterEmail, password: masterPassword });
    if (signInErr || !signIn.session || !signIn.user) {
      // Create user (if already exists, createUser may error; then sign-in should work)
      await (admin as any).auth.admin.createUser({
        email: masterEmail,
        password: masterPassword,
        email_confirm: true,
        user_metadata: { phone: "+15550000000", full_name: "Master Admin" },
      });
      const { data: signIn2, error: signInErr2 } = await anon.auth.signInWithPassword({ email: masterEmail, password: masterPassword });
      if (signInErr2 || !signIn2.session || !signIn2.user) throw signInErr2 || new Error("Failed to sign in master admin user");
      userId = signIn2.user.id;
      client = anon;
    } else {
      userId = signIn.user.id;
      client = anon;
    }
  });

  afterAll(async () => {
    try {
      await admin.from("conversation_eval_runs").delete().eq("created_by", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("creates issues/suggestions and persists them on conversation_eval_runs", async () => {
    const transcript = [
      { role: "assistant", content: "Ok.", agent_used: "companion" },
      { role: "user", content: "Test." },
      { role: "assistant", content: "Bonjour !", agent_used: "companion" }, // mid-conversation greeting
    ];

    const { data: judged, error: judgeErr } = await client.functions.invoke("eval-judge", {
      body: { dataset_key: "smoke", scenario_key: "mid_greeting", transcript, state_before: { investigation_state: null } },
    });
    if (judgeErr) throw judgeErr;
    expect(judged?.success).toBe(true);
    expect(judged?.eval_run_id).toBeTruthy();
    expect(Array.isArray(judged?.issues)).toBe(true);
    expect(Array.isArray(judged?.suggestions)).toBe(true);
    expect((judged?.suggestions ?? []).length).toBeGreaterThanOrEqual(0);

    // Verify the run row contains suggestions/issue fields.
    const { data: runRow, error: runErr } = await admin
      .from("conversation_eval_runs")
      .select("id,issues,suggestions")
      .eq("id", judged.eval_run_id)
      .maybeSingle();
    if (runErr) throw runErr;
    expect(runRow?.id).toBe(judged.eval_run_id);
    expect(Array.isArray((runRow as any)?.issues)).toBe(true);
    expect(Array.isArray((runRow as any)?.suggestions)).toBe(true);
  });

  it("eval-judge assertions produce explicit failure reasons (deterministic)", async () => {
    const transcript = [
      { role: "user", content: "Ok" },
      { role: "assistant", content: "Bonjour", agent_used: "companion" },
    ];

    const { data, error } = await client.functions.invoke("eval-judge", {
      body: {
        dataset_key: "assert",
        scenario_key: "no_greeting",
        transcript,
        assertions: { assistant_must_not_match: ["\\b(bonjour|salut|hello)\\b"] },
      },
    });
    if (error) throw error;
    expect(data?.success).toBe(true);
    const issues = data?.issues ?? [];
    expect(Array.isArray(issues)).toBe(true);
    // We should see a deterministic assertion issue
    expect(issues.some((i: any) => i.code === "assert_forbidden_pattern")).toBe(true);
  });

  it("simulate-user is admin-gated and returns deterministic next_message in stub mode", async () => {
    // Non-admin user should be forbidden
    const res2 = await createAuthedTestUser();
    const { data: notAdminData, error: notAdminErr } = await res2.client.functions.invoke("simulate-user", {
      body: { persona: { label: "X" }, objectives: [{ kind: "trigger_checkup" }], transcript: [], turn_index: 0, max_turns: 3 },
    });
    // Supabase client wraps non-2xx as error
    expect(notAdminData).toBeNull();
    expect(notAdminErr).toBeTruthy();

    // Admin user gets deterministic response (MEGA_TEST_MODE default != "0" in test runs)
    const { data, error } = await client.functions.invoke("simulate-user", {
      body: { persona: { label: "Test", age_range: "25-50" }, objectives: [{ kind: "trigger_checkup" }], transcript: [], turn_index: 0, max_turns: 3 },
    });
    if (error) throw error;
    expect(data?.success).toBe(true);
    expect(typeof data?.next_message).toBe("string");
    expect(data.next_message.length).toBeGreaterThan(0);
  });
});


