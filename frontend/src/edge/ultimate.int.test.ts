import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

const IS_FULL = process.env.MEGA_TEST_FULL === "1";
const IS_STUB = process.env.MEGA_TEST_MODE !== "0";

describe("ultimate: DB invariants (actions + vital signs)", () => {
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
    // Best-effort cleanup for local runs.
    try {
      await admin.from("user_vital_sign_entries").delete().eq("user_id", userId);
      await admin.from("user_vital_signs").delete().eq("user_id", userId);
      await admin.from("user_actions").delete().eq("user_id", userId);
      await admin.from("user_framework_tracking").delete().eq("user_id", userId);
      await admin.from("user_plans").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("vital sign: add entry + update current_value/last_checked_at", async () => {
    // Create an active plan
    const { data: plan, error: planErr } = await client
      .from("user_plans")
      .insert({
        user_id: userId,
        status: "active",
        content: { phases: [{ id: 1, title: "P1", status: "active", actions: [] }] },
        title: "Plan Test",
      })
      .select("id")
      .single();
    if (planErr) throw planErr;
    const planId = plan.id as string;

    // Create the vital sign row (what the app does on distribution)
    const { data: vital, error: vitalErr } = await client
      .from("user_vital_signs")
      .insert({
        user_id: userId,
        plan_id: planId,
        label: "Sommeil (heures)",
        unit: "h",
        current_value: "7",
        target_value: "8",
        status: "active",
      })
      .select("id")
      .single();
    if (vitalErr) throw vitalErr;

    const vitalId = vital.id as string;
    const newValue = "7.5";
    const nowIso = new Date().toISOString();

    // Create an entry + update the vital sign (matches `handleUpdateVitalSign`)
    const { error: entryErr } = await client.from("user_vital_sign_entries").insert({
      user_id: userId,
      vital_sign_id: vitalId,
      plan_id: planId,
      value: newValue,
      title: "Sommeil (heures)",
      recorded_at: nowIso,
    });
    if (entryErr) throw entryErr;

    const { error: updErr } = await client
      .from("user_vital_signs")
      .update({ current_value: newValue, last_checked_at: nowIso })
      .eq("id", vitalId);
    if (updErr) throw updErr;

    const { data: updated, error: readErr } = await client
      .from("user_vital_signs")
      .select("current_value,last_checked_at")
      .eq("id", vitalId)
      .single();
    if (readErr) throw readErr;

    expect(updated.current_value).toBe(newValue);
    expect(new Date(updated.last_checked_at).getTime()).toBe(new Date(nowIso).getTime());

    const { count, error: countErr } = await client
      .from("user_vital_sign_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("vital_sign_id", vitalId);
    if (countErr) throw countErr;
    expect(count).toBe(1);

    const { data: entry, error: entryReadErr } = await client
      .from("user_vital_sign_entries")
      .select("value,recorded_at")
      .eq("user_id", userId)
      .eq("vital_sign_id", vitalId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();
    if (entryReadErr) throw entryReadErr;
    expect(entry.value).toBe(newValue);
    expect(new Date(entry.recorded_at).getTime()).toBe(new Date(nowIso).getTime());
  });

  it("actions: increment reps then reactivate (insert new active action)", async () => {
    const { data: plan, error: planErr } = await client
      .from("user_plans")
      .insert({
        user_id: userId,
        status: "active",
        content: { phases: [{ id: 1, title: "P1", status: "active", actions: [] }] },
        title: "Plan Actif",
      })
      .select("id,content")
      .single();
    if (planErr) throw planErr;
    const planId = plan.id as string;

    // Create an action in the plan
    const { data: actionRow, error: actionErr } = await client
      .from("user_actions")
      .insert({
        user_id: userId,
        plan_id: planId,
        type: "habit",
        title: "Boire de l'eau",
        description: "1 verre au réveil",
        target_reps: 7,
        current_reps: 0,
        status: "active",
      })
      .select("id,current_reps,status")
      .single();
    if (actionErr) throw actionErr;
    const actionId = actionRow.id as string;

    // Increment reps (what UI does on "j'ai fait")
    const nowIso = new Date().toISOString();
    const { error: incErr } = await client
      .from("user_actions")
      .update({ current_reps: 1, last_performed_at: nowIso })
      .eq("id", actionId);
    if (incErr) throw incErr;

    const { data: afterInc, error: afterIncErr } = await client
      .from("user_actions")
      .select("current_reps,last_performed_at")
      .eq("id", actionId)
      .single();
    if (afterIncErr) throw afterIncErr;
    expect(afterInc.current_reps).toBe(1);
    expect(new Date(afterInc.last_performed_at).getTime()).toBe(new Date(nowIso).getTime());

    // Simulate "reactivate": insert a new action row and update plan JSON so it appears in dashboard.
    const reactivatedTitle = "Boire de l'eau (réactivée)";
    const { error: reactErr } = await client.from("user_actions").insert({
      user_id: userId,
      plan_id: planId,
      type: "habit",
      title: reactivatedTitle,
      description: "Réactivation depuis le Grimoire",
      target_reps: 7,
      current_reps: 0,
      status: "active",
    });
    if (reactErr) throw reactErr;

    const { data: plan2, error: plan2Err } = await client.from("user_plans").select("content").eq("id", planId).single();
    if (plan2Err) throw plan2Err;
    const content = (plan2.content ?? {}) as any;
    const phases = Array.isArray(content.phases) ? content.phases : [];
    const idx = phases.findIndex((p: any) => p.status === "active");
    const activeIdx = idx === -1 ? 0 : idx;
    phases[activeIdx] = phases[activeIdx] ?? { id: 1, title: "P1", status: "active", actions: [] };
    phases[activeIdx].actions = Array.isArray(phases[activeIdx].actions) ? phases[activeIdx].actions : [];
    phases[activeIdx].actions.push({ id: `reactivated_${Date.now()}`, type: "habitude", title: reactivatedTitle, status: "active" });

    const { error: updPlanErr } = await client.from("user_plans").update({ content: { ...content, phases } }).eq("id", planId);
    if (updPlanErr) throw updPlanErr;

    const { count: actionsCount, error: actionsCountErr } = await client
      .from("user_actions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("status", "active");
    if (actionsCountErr) throw actionsCountErr;
    expect(actionsCount).toBe(2);
  });
});

describe("ultimate: DB triggers (profiles/email/week12)", () => {
  let userId: string;
  let email: string;
  let client: SupabaseClient;
  let admin: SupabaseClient;

  beforeEach(async () => {
    const res = await createAuthedTestUser();
    userId = res.userId;
    email = res.email;
    client = res.client;
    admin = createServiceRoleClient();
  });

  afterEach(async () => {
    try {
      await admin
        .from("user_week_states")
        .delete()
        .eq("user_id", userId)
        .in("module_id", ["week_12", "round_table_1", "forge_access"]);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("on_auth_user_created: creates public.profiles row on signup", async () => {
    const { data, error } = await client.from("profiles").select("id,email").eq("id", userId).single();
    if (error) throw error;
    expect(data.id).toBe(userId);
    expect(data.email).toBe(email);
  });

  it("on_auth_user_updated_email: keeps profiles.email synced with auth.users", async () => {
    const newEmail = `test-updated+${Date.now()}@example.com`;
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail });
    if (updateErr) throw updateErr;

    await expect
      .poll(
        async () => {
          const { data, error } = await admin.from("profiles").select("email").eq("id", userId).single();
          if (error) throw error;
          return data.email;
        },
        { timeout: 10_000, interval: 250 },
      )
      .toBe(newEmail);
  });

  it("on_week12_manual_unlock: creates round_table_1 + forge_access when week_12 is manually set available", async () => {
    const nowIso = new Date().toISOString();
    const { error: seedErr } = await admin.from("user_week_states").upsert(
      {
        user_id: userId,
        module_id: "week_12",
        status: "available",
        available_at: nowIso,
      },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    const { data: unlocked, error: unlockedErr } = await admin
      .from("user_week_states")
      .select("module_id,status,available_at")
      .eq("user_id", userId)
      .in("module_id", ["round_table_1", "forge_access"]);
    if (unlockedErr) throw unlockedErr;

    const ids = new Set((unlocked ?? []).map((r) => r.module_id));
    expect(ids.has("round_table_1")).toBe(true);
    expect(ids.has("forge_access")).toBe(true);
  });
});

describe("ultimate: module updates create module archives (user_module_archives)", () => {
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
      await admin.from("user_module_archives").delete().eq("user_id", userId);
      await admin.from("user_module_state_entries").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("on_module_entry_update: changing content archives OLD content into user_module_archives", async () => {
    const moduleId = `a1_c1_m1_${Date.now()}`;
    const first = { content: "Premier contenu (non vide) pour activer l'archive." };
    const second = { content: "Deuxième contenu (modifié) pour déclencher l'archive." };

    const { data: inserted, error: insErr } = await client
      .from("user_module_state_entries")
      .insert({
        user_id: userId,
        module_id: moduleId,
        content: first,
        status: "available",
        available_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const entryId = inserted.id as string;

    // Assert: user_module_state_entries was written
    const { count: entriesCount, error: entriesCountErr } = await client
      .from("user_module_state_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("module_id", moduleId);
    if (entriesCountErr) throw entriesCountErr;
    expect(entriesCount).toBe(1);

    const { error: updErr } = await client
      .from("user_module_state_entries")
      .update({ content: second, updated_at: new Date().toISOString() })
      .eq("id", entryId);
    if (updErr) throw updErr;

    // Assert: archive row created
    const { count: archCount, error: archCountErr } = await client
      .from("user_module_archives")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entry_id", entryId);
    if (archCountErr) throw archCountErr;
    expect(archCount).toBeGreaterThanOrEqual(1);

    const { data: archived, error: archErr } = await client
      .from("user_module_archives")
      .select("entry_id,module_id,content,archived_at")
      .eq("entry_id", entryId)
      .eq("user_id", userId)
      .order("archived_at", { ascending: false })
      .limit(1)
      .single();
    if (archErr) throw archErr;

    expect(archived.entry_id).toBe(entryId);
    expect(archived.module_id).toBe(moduleId);
    expect(archived.archived_at).toBeTruthy();
    expect((archived.content as any)?.content).toBe(first.content);
  });
});

describe("ultimate: schema triggers (init modules + week progression + forge progression + chat state modtime)", () => {
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
      await admin.from("user_chat_states").delete().eq("user_id", userId);
      await admin.from("user_module_archives").delete().eq("user_id", userId);
      await admin.from("user_module_state_entries").delete().eq("user_id", userId);
      await admin.from("user_week_states").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("on_profile_created_init_modules: signup creates week_1 in user_week_states", async () => {
    const { data, error } = await client
      .from("user_week_states")
      .select("module_id,status,available_at")
      .eq("user_id", userId)
      .eq("module_id", "week_1")
      .single();
    if (error) throw error;
    expect(data.module_id).toBe("week_1");
    expect(data.status).toBe("available");
    expect(data.available_at).toBeTruthy();
  });

  it("on_module_activity_unlock: first module activity sets first_updated_at, schedules next week, and completes week_1 after 4 answers", async () => {
    // Precondition: week_1 exists (created by init trigger)
    const { data: w1Before, error: w1BeforeErr } = await client
      .from("user_week_states")
      .select("id,updated_at,first_updated_at,status,completed_at")
      .eq("user_id", userId)
      .eq("module_id", "week_1")
      .single();
    if (w1BeforeErr) throw w1BeforeErr;

    expect(w1Before.first_updated_at).toBeNull();
    expect(w1Before.status).toBe("available");
    expect(w1Before.completed_at).toBeNull();

    // Insert 4 distinct "m1" modules for week_1 (schema expects 4 for week 1)
    const baseTime = new Date().toISOString();
    const modules = ["a1_c1_m1", "a1_c2_m1", "a1_c3_m1", "a1_c4_m1"].map((module_id) => ({
      user_id: userId,
      module_id,
      status: "completed",
      completed_at: baseTime,
      available_at: baseTime,
      content: { content: "Réponse suffisamment longue pour compter." },
    }));

    const { error: insErr } = await client.from("user_module_state_entries").insert(modules);
    if (insErr) throw insErr;

    // Assert: user_module_state_entries touched (4 inserts)
    const { count: moduleEntriesCount, error: moduleEntriesCountErr } = await client
      .from("user_module_state_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("module_id", ["a1_c1_m1", "a1_c2_m1", "a1_c3_m1", "a1_c4_m1"]);
    if (moduleEntriesCountErr) throw moduleEntriesCountErr;
    expect(moduleEntriesCount).toBe(4);

    // Assert: first_updated_at set + week_2 scheduled (week_num < 12)
    const { data: w1After, error: w1AfterErr } = await client
      .from("user_week_states")
      .select("updated_at,first_updated_at,status,completed_at")
      .eq("user_id", userId)
      .eq("module_id", "week_1")
      .single();
    if (w1AfterErr) throw w1AfterErr;

    expect(w1After.first_updated_at).toBeTruthy();
    expect(w1After.updated_at).toBeTruthy();

    // Completion: should be marked completed after 4 answers
    await expect
      .poll(
        async () => {
          const { data, error } = await client
            .from("user_week_states")
            .select("status,completed_at")
            .eq("user_id", userId)
            .eq("module_id", "week_1")
            .single();
          if (error) throw error;
          return data;
        },
        { timeout: 10_000, interval: 250 },
      )
      .satisfy((row) => row.status === "completed" && !!row.completed_at);

    const { data: w2, error: w2Err } = await client
      .from("user_week_states")
      .select("module_id,status,available_at")
      .eq("user_id", userId)
      .eq("module_id", "week_2")
      .single();
    if (w2Err) throw w2Err;
    expect(w2.status).toBe("available");
    expect(w2.available_at).toBeTruthy();
    // Scheduling rule is now() + 7 days (with timezone/clock tolerance).
    const w2Avail = new Date(w2.available_at).getTime();
    const baseMs = new Date(baseTime).getTime();
    expect(w2Avail).toBeGreaterThan(baseMs + 6 * 24 * 60 * 60 * 1000);
  });

  it("on_module_activity_unlock: week_2 first activity schedules week_3 at ~ now+7d", async () => {
    // Seed week_2 state as available (normally created when week_1 starts)
    const base = new Date();
    const { error: seedErr } = await client.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_2", status: "available", available_at: base.toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    // First activity for week 2 triggers scheduling week_3 at now()+7d
    const nowIso = new Date().toISOString();
    const { error: insErr } = await client.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: "a2_c1_m1",
      status: "completed",
      completed_at: nowIso,
      available_at: nowIso,
      content: { content: "Réponse assez longue." },
    });
    if (insErr) throw insErr;

    const { data: w3, error: w3Err } = await client
      .from("user_week_states")
      .select("module_id,status,available_at")
      .eq("user_id", userId)
      .eq("module_id", "week_3")
      .single();
    if (w3Err) throw w3Err;
    expect(w3.status).toBe("available");
    const w3Avail = new Date(w3.available_at).getTime();
    expect(w3Avail).toBeGreaterThan(new Date(nowIso).getTime() + 6 * 24 * 60 * 60 * 1000);
  });

  it("on_module_activity_unlock: week_12 first activity schedules round_table_1 (next Sunday 09:00) + forge_access (+7d)", async () => {
    // Seed week_12 state (so the trigger can find it)
    const { error: seedErr } = await client.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_12", status: "available", available_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    const now = new Date();
    const { error: insErr } = await client.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: "a12_c1_m1",
      status: "completed",
      completed_at: now.toISOString(),
      available_at: now.toISOString(),
      content: { content: "Réponse assez longue." },
    });
    if (insErr) throw insErr;

    const { data, error } = await client
      .from("user_week_states")
      .select("module_id,status,available_at")
      .eq("user_id", userId)
      .in("module_id", ["round_table_1", "forge_access"]);
    if (error) throw error;

    const byId = new Map((data ?? []).map((r) => [r.module_id, r]));
    expect(byId.get("round_table_1")).toBeTruthy();
    expect(byId.get("forge_access")).toBeTruthy();

    // round_table_1 should be scheduled at 09:00 of next Sunday
    const rt = byId.get("round_table_1")!;
    const rtDate = new Date(rt.available_at);
    expect(rt.status).toBe("available");
    expect(rtDate.getUTCHours()).toBe(9);

    // forge_access should be >= now + 6 days (timezone tolerance)
    const fa = byId.get("forge_access")!;
    const faDate = new Date(fa.available_at);
    expect(fa.status).toBe("available");
    expect(faDate.getTime()).toBeGreaterThan(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  });

  it("on_forge_level_progression: completing aX_cY_m1 creates next level aX_cY_m2 with available_at = completed_at + 4d", async () => {
    // Ensure week_1 exists to avoid unrelated trigger no-ops; not strictly needed.
    const completedAt = new Date();
    const moduleId = `a99_c1_m1`;
    const nextId = `a99_c1_m2`;

    const { error: insErr } = await client.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      status: "completed",
      completed_at: completedAt.toISOString(),
      available_at: completedAt.toISOString(),
      content: { content: "Forge L1" },
    });
    if (insErr) throw insErr;

    const { data: next, error: nextErr } = await client
      .from("user_module_state_entries")
      .select("module_id,status,available_at,completed_at,content")
      .eq("user_id", userId)
      .eq("module_id", nextId)
      .maybeSingle();
    if (nextErr) throw nextErr;

    if (!next) throw new Error("Expected next forge level module to be created");
    expect(next.status).toBe("available");
    expect(next.completed_at).toBeNull();
    expect(next.content).toEqual({});

    const avail = new Date(next.available_at).getTime();
    const expectedMin = completedAt.getTime() + 3.5 * 24 * 60 * 60 * 1000;
    expect(avail).toBeGreaterThan(expectedMin);
  });

  it("update_user_chat_states_modtime: BEFORE UPDATE sets updated_at to NOW", async () => {
    const old = new Date(Date.now() - 10_000).toISOString();
    const { error: insErr } = await admin.from("user_chat_states").insert({
      user_id: userId,
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      last_interaction_at: old,
      updated_at: old,
    });
    if (insErr) throw insErr;

    // Update a field; trigger should bump updated_at
    const { error: updErr } = await admin.from("user_chat_states").update({ risk_level: 1 }).eq("user_id", userId);
    if (updErr) throw updErr;

    const { data, error } = await admin.from("user_chat_states").select("updated_at,risk_level").eq("user_id", userId).single();
    if (error) throw error;
    expect(data.risk_level).toBe(1);
    expect(new Date(data.updated_at).getTime()).toBeGreaterThan(new Date(old).getTime());
  });
});

describe("ultimate: edge-triggered side effects (memories + core identity + archive) [FULL]", () => {
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
      await admin.from("memories").delete().eq("user_id", userId);
      await admin.from("user_core_identity_archive").delete().eq("user_id", userId);
      await admin.from("user_core_identity").delete().eq("user_id", userId);
      await admin.from("user_round_table_entries").delete().eq("user_id", userId);
      await admin.from("user_module_state_entries").delete().eq("user_id", userId);
      await admin.from("user_week_states").delete().eq("user_id", userId);
      await admin.from("user_plans").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it.skipIf(!IS_FULL)("module memory trigger: insert user_module_state_entries => creates memories row", async () => {
    const moduleId = `a1_c1_m1_${Date.now()}`;
    const { error: insErr } = await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      content: { content: "Ceci est une réponse assez longue pour déclencher le trigger." },
      status: "available",
      available_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;

    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("memories")
            .select("id,content,source_type,source_id,type")
            .eq("user_id", userId)
            .eq("source_type", "module")
            .eq("source_id", moduleId)
            .eq("type", "insight")
            .maybeSingle();
          if (error) throw error;
          return data?.id ?? null;
        },
        { timeout: 15_000, interval: 300 },
      )
      .not.toBeNull();
  });

  it.skipIf(!IS_FULL)("module memory trigger: UPDATE content archives old memory and creates a new one", async () => {
    const moduleId = `a1_c1_m1_${Date.now()}`;

    const { error: insErr } = await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      content: { content: "Contenu 1 assez long pour déclencher le trigger (mémoire 1)." },
      status: "available",
      available_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;

    // Wait for first memory
    await expect
      .poll(
        async () => {
          const { count, error } = await admin
            .from("memories")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("source_type", "module")
            .eq("source_id", moduleId);
          if (error) throw error;
          return count ?? 0;
        },
        { timeout: 15_000, interval: 300 },
      )
      .toBeGreaterThan(0);

    // Update content => trigger "on_module_updated_memory"
    const { error: updErr } = await admin
      .from("user_module_state_entries")
      .update({ content: { content: "Contenu 2 modifié assez long pour déclencher le trigger (mémoire 2)." } })
      .eq("user_id", userId)
      .eq("module_id", moduleId);
    if (updErr) throw updErr;

    // Expect: at least one history + exactly one active insight for this module.
    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("memories")
            .select("type")
            .eq("user_id", userId)
            .eq("source_type", "module")
            .eq("source_id", moduleId);
          if (error) throw error;
          const types = (data ?? []).map((r) => r.type);
          return {
            insight: types.filter((t) => t === "insight").length,
            history: types.filter((t) => t === "history").length,
          };
        },
        { timeout: 20_000, interval: 400 },
      )
      .satisfy(({ insight, history }) => insight === 1 && history >= 1);
  });

  it.skipIf(!IS_FULL)("round table trigger: insert user_round_table_entries => creates weekly_review memory", async () => {
    const moduleId = "round_table_1";
    const { error: rtErr } = await admin.from("user_round_table_entries").insert({
      user_id: userId,
      module_id: moduleId,
      energy_level: 55,
      wins_3: "1) X 2) Y 3) Z",
      main_blocker: "Fatigue",
      identity_alignment: "moyen",
      week_intention: "Dormir plus",
    });
    if (rtErr) throw rtErr;

    // Assert: user_round_table_entries row exists (table touched)
    const { data: rtRow, error: rtReadErr } = await admin
      .from("user_round_table_entries")
      .select("module_id,energy_level,wins_3,main_blocker,identity_alignment,week_intention")
      .eq("user_id", userId)
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (rtReadErr) throw rtReadErr;
    expect(rtRow.module_id).toBe(moduleId);
    expect(rtRow.energy_level).toBe(55);
    expect(rtRow.wins_3).toContain("1) X");

    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("memories")
            .select("id,source_type,source_id,type,content")
            .eq("user_id", userId)
            .eq("source_type", "weekly_review")
            .eq("source_id", moduleId)
            .eq("type", "insight")
            .maybeSingle();
          if (error) throw error;
          return data?.id ?? null;
        },
        { timeout: 15_000, interval: 300 },
      )
      .not.toBeNull();
  });

  it.skipIf(!IS_FULL)("core identity trigger: week completed => writes user_core_identity", async () => {
    // Seed at least one module answer for week_1, otherwise the Edge function returns 'No data'
    const { error: modErr } = await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: `a1_c1_m1_${Date.now()}`,
      content: { content: "Réponse longue pour identité." },
      status: "completed",
      completed_at: new Date().toISOString(),
      available_at: new Date().toISOString(),
    });
    if (modErr) throw modErr;

    // Seed week state (available), then update to completed to trigger
    const { error: seedErr } = await admin.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_1", status: "available", available_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    const { error: updErr } = await admin
      .from("user_week_states")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("module_id", "week_1");
    if (updErr) throw updErr;

    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("user_core_identity")
            .select("content")
            .eq("user_id", userId)
            .eq("week_id", "week_1")
            .maybeSingle();
          if (error) throw error;
          return data?.content ?? null;
        },
        { timeout: 20_000, interval: 400 },
      )
      .satisfy((v) => {
        if (typeof v !== "string" || v.length < 5) return false;
        return IS_STUB ? v.includes("MEGA_TEST_STUB") : !v.includes("MEGA_TEST_STUB");
      });
  });

  it.skipIf(!IS_FULL)("core identity trigger: module content UPDATE archives previous identity and updates content", async () => {
    // Create initial identity by completing week_1 (same approach as previous test)
    const moduleId = `a1_c1_m1_${Date.now()}`;
    const { error: modErr } = await admin.from("user_module_state_entries").insert({
      user_id: userId,
      module_id: moduleId,
      content: { content: "Réponse initiale longue pour identité." },
      status: "completed",
      completed_at: new Date().toISOString(),
      available_at: new Date().toISOString(),
    });
    if (modErr) throw modErr;

    const { error: seedErr } = await admin.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_1", status: "available", available_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

    const { error: wkErr } = await admin
      .from("user_week_states")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("module_id", "week_1");
    if (wkErr) throw wkErr;

    let firstContent: { id: string; content: string } | null = null;
    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("user_core_identity")
            .select("id,content")
            .eq("user_id", userId)
            .eq("week_id", "week_1")
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        { timeout: 20_000, interval: 400 },
      )
      .satisfy((d) => {
        if (!d) return false;
        firstContent = d as any;
        return typeof (d as any).content === "string" && (d as any).content.length > 0;
      });

    // Update module content to trigger on_module_updated_identity (length>10, content changed)
    const { error: updErr } = await admin
      .from("user_module_state_entries")
      .update({ content: { content: "Réponse MODIFIÉE longue pour identité (update_forge)." } })
      .eq("user_id", userId)
      .eq("module_id", moduleId);
    if (updErr) throw updErr;

    // Wait for identity to change
    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("user_core_identity")
            .select("content")
            .eq("user_id", userId)
            .eq("week_id", "week_1")
            .single();
          if (error) throw error;
          return data.content;
        },
        { timeout: 20_000, interval: 400 },
      )
      .satisfy((c) => typeof c === "string" && c.length > 5 && c !== firstContent.content);

    // Archive row should exist with old content + reason update_forge
    const { data: arch, error: archErr } = await admin
      .from("user_core_identity_archive")
      .select("reason,content")
      .eq("user_id", userId)
      .eq("week_id", "week_1")
      .order("archived_at", { ascending: false })
      .limit(1)
      .single();
    if (archErr) throw archErr;
    expect(arch.reason).toBe("update_forge");
    expect(arch.content).toBe(firstContent.content);
  });

  it.skipIf(!IS_FULL)("archive plan trigger: plan status => creates plan memory", async () => {
    // Create an active plan, then mark it completed (trigger => archive-plan => insert memory)
    const { data: plan, error: planErr } = await admin
      .from("user_plans")
      .insert({
        user_id: userId,
        status: "active",
        title: "Plan à archiver",
        content: { phases: [], grimoireTitle: "Test" },
      })
      .select("id")
      .single();
    if (planErr) throw planErr;
    const planId = plan.id as string;

    const { error: updErr } = await admin.from("user_plans").update({ status: "completed" }).eq("id", planId);
    if (updErr) throw updErr;

    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from("memories")
            .select("id,source_type,source_id,type")
            .eq("user_id", userId)
            .eq("source_type", "plan")
            .eq("source_id", planId)
            .eq("type", "insight")
            .maybeSingle();
          if (error) throw error;
          return data?.id ?? null;
        },
        { timeout: 20_000, interval: 400 },
      )
      .not.toBeNull();
  });
});





