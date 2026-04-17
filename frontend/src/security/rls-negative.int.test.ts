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
      await userA.client.auth.signOut();
      await userB.client.auth.signOut();
    } catch {
      // ignore
    }
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


