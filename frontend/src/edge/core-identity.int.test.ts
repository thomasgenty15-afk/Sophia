import { describe, expect, test } from "vitest";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

const API_URL = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";

async function callUpdateCoreIdentity(payload: any) {
  const res = await fetch(`${API_URL}/functions/v1/update-core-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

describe("edge functions: update-core-identity (writes user_core_identity + archive)", () => {
  test("creates user_core_identity for week_1 when week module entries exist", async () => {
    const admin = createServiceRoleClient();
    const { userId } = await createAuthedTestUser();

    // Seed at least one week-1 module entry (module_id format a{weekNum}_...)
    const moduleId = "a1_c1_m1";
    const { error: insErr } = await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      content: { content: "Je suis quelqu'un qui progresse." },
    });
    expect(insErr).toBeNull();

    const r1 = await callUpdateCoreIdentity({ table: "user_module_state_entries", record: { user_id: userId, module_id: moduleId } });
    expect(r1.ok).toBe(true);

    const { data: identity, error: idErr } = await admin
      .from("user_core_identity")
      .select("id, week_id, content, last_updated_at")
      .eq("user_id", userId)
      .eq("week_id", "week_1")
      .maybeSingle();
    expect(idErr).toBeNull();
    expect(identity).toBeTruthy();
    expect(String((identity as any).content || "")).not.toHaveLength(0);
  });

  test("updates identity and archives previous version on subsequent update", async () => {
    const admin = createServiceRoleClient();
    const { userId } = await createAuthedTestUser();

    const moduleId = "a1_c1_m1";
    await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      content: { content: "Version 1" },
    });

    const r1 = await callUpdateCoreIdentity({ table: "user_module_state_entries", record: { user_id: userId, module_id: moduleId } });
    expect(r1.ok).toBe(true);

    const { data: before } = await admin
      .from("user_core_identity")
      .select("id, content")
      .eq("user_id", userId)
      .eq("week_id", "week_1")
      .single();

    // Update module content and call again
    await admin.from("user_module_state_entries").update({ content: { content: "Version 2" } }).eq("user_id", userId).eq("module_id", moduleId);
    const r2 = await callUpdateCoreIdentity({ table: "user_module_state_entries", record: { user_id: userId, module_id: moduleId } });
    expect(r2.ok).toBe(true);

    const { data: after } = await admin
      .from("user_core_identity")
      .select("id, content, last_updated_at")
      .eq("user_id", userId)
      .eq("week_id", "week_1")
      .single();
    expect(after.id).toEqual(before.id);

    const { count: archived } = await admin
      .from("user_core_identity_archive")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("week_id", "week_1")
      .eq("identity_id", before.id);
    expect(archived ?? 0).toBeGreaterThanOrEqual(1);
  });
});


