import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

/**
 * These tests ensure "forbidden" writes are actually forbidden (RLS/permissions).
 * If any of these start passing, we likely introduced a security regression.
 */
describe("security: RLS negative (must fail)", () => {
  let admin: SupabaseClient;
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  beforeEach(async () => {
    admin = createServiceRoleClient();
    userA = await createAuthedTestUser();
    userB = await createAuthedTestUser();
  });

  afterEach(async () => {
    try {
      // best-effort cleanup
      await admin.from("chat_messages").delete().in("user_id", [userA.userId, userB.userId]);
      await admin.from("user_actions").delete().in("user_id", [userA.userId, userB.userId]);
      await userA.client.auth.signOut();
      await userB.client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("user cannot insert into user_action_entries (should be server-only)", async () => {
    const { error } = await userA.client.from("user_action_entries").insert({
      user_id: userA.userId,
      action_id: crypto.randomUUID(),
      status: "completed",
      created_at: new Date().toISOString(),
    });
    expect(error).toBeTruthy();
  });

  it("user cannot update another user's user_actions row", async () => {
    const submissionId = crypto.randomUUID();
    // Need a valid plan_id (FK), otherwise the seed fails before we can test RLS.
    const { data: goalB, error: goalErr } = await admin
      .from("user_goals")
      .insert({
        user_id: userB.userId,
        submission_id: submissionId,
        status: "active",
        axis_id: "AX_TEST",
        axis_title: "Axis test",
        theme_id: "TH_TEST",
        priority_order: 1,
      })
      .select("id")
      .single();
    if (goalErr) throw goalErr;

    const { data: planB, error: planErr } = await admin
      .from("user_plans")
      .insert({
        user_id: userB.userId,
        goal_id: (goalB as any).id,
        submission_id: submissionId,
        status: "active",
        current_phase: 1,
        title: "Plan B",
        content: { phases: [] },
      })
      .select("id")
      .single();
    if (planErr) throw planErr;

    const { data: actionB, error: seedErr } = await admin
      .from("user_actions")
      .insert({
        user_id: userB.userId,
        plan_id: (planB as any).id,
        submission_id: submissionId,
        type: "habit",
        title: "Privé B",
        description: "Doit être protégé",
        target_reps: 3,
        current_reps: 0,
        status: "active",
        tracking_type: "boolean",
        time_of_day: "any_time",
      })
      .select("id,title")
      .single();
    if (seedErr) throw seedErr;

    // RLS "soft fails" can return no error but affect 0 rows; we verify the invariant via admin.
    await userA.client
      .from("user_actions")
      .update({ title: "Hacked" })
      .eq("id", (actionB as any).id);

    const { data: after, error: afterErr } = await admin
      .from("user_actions")
      .select("title")
      .eq("id", (actionB as any).id)
      .single();
    if (afterErr) throw afterErr;
    expect((after as any).title).toBe((actionB as any).title);
  });

  it("user cannot delete another user's chat_messages row", async () => {
    const { data: msgB, error: seedErr } = await admin
      .from("chat_messages")
      .insert({
        user_id: userB.userId,
        role: "user",
        content: "Message B",
      })
      .select("id")
      .single();
    if (seedErr) throw seedErr;

    // Same idea: deletion may return no error but delete 0 rows due to RLS. Check via admin.
    await userA.client.from("chat_messages").delete().eq("id", (msgB as any).id);

    const { data: stillThere, error: stillErr } = await admin
      .from("chat_messages")
      .select("id")
      .eq("id", (msgB as any).id)
      .maybeSingle();
    if (stillErr) throw stillErr;
    expect(stillThere).toBeTruthy();
  });
});


