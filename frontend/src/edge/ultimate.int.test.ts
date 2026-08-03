import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HAS_SUPABASE_TEST_ENV, createAuthedTestUser, createServiceRoleClient } from "../test/supabaseTestUtils";

const IS_FULL = process.env.MEGA_TEST_FULL === "1";
const IS_STUB = process.env.MEGA_TEST_MODE !== "0";

describe.skipIf(!HAS_SUPABASE_TEST_ENV)("ultimate: DB triggers (profiles/email/week12)", () => {
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
        .in("module_id", ["week_12", "forge_access"]);
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

  // W2.A : `on_week12_manual_unlock` est DROPPÉ (migration
  // 20260727150000_keel_disable_legacy_surfaces.sql). Le garde-fou s'inverse :
  // la preuve utile est désormais que la Forge ne se déverrouille plus toute
  // seule. Écrire `week_12` reste possible (la table survit jusqu'à W2.C),
  // mais ça ne doit plus rien déclencher.
  it("on_week12_manual_unlock est retiré: week_12 disponible ne crée plus forge_access (W2.A)", async () => {
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
      .in("module_id", ["forge_access"]);
    if (unlockedErr) throw unlockedErr;

    expect(unlocked ?? []).toHaveLength(0);
  });
});

describe.skipIf(!HAS_SUPABASE_TEST_ENV)("ultimate: module updates create module archives (user_module_archives)", () => {
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

  // W2.A : `on_module_entry_update` est DROPPÉ. Le parcours identitaire FR
  // n'archive plus les contenus de modules. La preuve inversée : une écriture
  // puis une modification ne laissent AUCUNE ligne d'archive.
  it("on_module_entry_update est retiré: modifier un contenu n'archive plus rien (W2.A)", async () => {
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

    // Assert (inversé W2.A): AUCUNE ligne d'archive n'est créée.
    const { count: archCount, error: archCountErr } = await client
      .from("user_module_archives")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entry_id", entryId);
    if (archCountErr) throw archCountErr;
    expect(archCount).toBe(0);

    // Et la ligne courante porte bien le SECOND contenu (l'update a eu lieu).
    const { data: current, error: currentErr } = await client
      .from("user_module_state_entries")
      .select("content")
      .eq("id", entryId)
      .single();
    if (currentErr) throw currentErr;
    expect((current.content as any)?.content).toBe(second.content);
  });
});

describe.skipIf(!HAS_SUPABASE_TEST_ENV)("ultimate: schema triggers (init modules + week progression + forge progression + chat state modtime)", () => {
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

  // W2.A : `on_profile_created_init_modules` est DROPPÉ — c'était lui qui
  // seedait le parcours identitaire FR à CHAQUE signup. C'est la vérification
  // nommée dans le BUILD_PLAN (« signup ne seede plus user_week_states »).
  it("on_profile_created_init_modules est retiré: un signup ne seede plus AUCUN user_week_states (W2.A)", async () => {
    const { data, error } = await client
      .from("user_week_states")
      .select("module_id")
      .eq("user_id", userId);
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);
  });

  // W2.A : `on_module_activity_unlock` et `on_forge_level_progression` sont
  // DROPPÉS. Toute la progression semaine→semaine et la cascade Forge du
  // parcours identitaire FR sont mortes. Les trois cas ci-dessous étaient les
  // preuves de la progression ; ils deviennent les preuves de son ABSENCE —
  // écrire une activité de module ne doit plus rien programmer nulle part.
  it("on_module_activity_unlock est retiré: 4 réponses ne complètent plus week_1 et ne programment plus week_2 (W2.A)", async () => {
    const baseTime = new Date().toISOString();
    const { error: seedErr } = await client.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_1", status: "available", available_at: baseTime },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

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

    // Les écritures passent (les tables survivent jusqu'à W2.C)...
    const { count: moduleEntriesCount, error: moduleEntriesCountErr } = await client
      .from("user_module_state_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("module_id", ["a1_c1_m1", "a1_c2_m1", "a1_c3_m1", "a1_c4_m1"]);
    if (moduleEntriesCountErr) throw moduleEntriesCountErr;
    expect(moduleEntriesCount).toBe(4);

    // ...mais plus aucun effet de bord: week_1 intacte, week_2 jamais créée.
    const { data: w1After, error: w1AfterErr } = await client
      .from("user_week_states")
      .select("first_updated_at,status,completed_at")
      .eq("user_id", userId)
      .eq("module_id", "week_1")
      .single();
    if (w1AfterErr) throw w1AfterErr;
    expect(w1After.first_updated_at).toBeNull();
    expect(w1After.status).toBe("available");
    expect(w1After.completed_at).toBeNull();

    const { data: w2, error: w2Err } = await client
      .from("user_week_states")
      .select("module_id")
      .eq("user_id", userId)
      .eq("module_id", "week_2");
    if (w2Err) throw w2Err;
    expect(w2 ?? []).toHaveLength(0);
  });

  it("on_module_activity_unlock est retiré: une activité week_12 ne programme plus forge_access (W2.A)", async () => {
    const now = new Date();
    const { error: seedErr } = await client.from("user_week_states").upsert(
      { user_id: userId, module_id: "week_12", status: "available", available_at: now.toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (seedErr) throw seedErr;

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
      .select("module_id")
      .eq("user_id", userId)
      .in("module_id", ["forge_access"]);
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);
  });

  it("on_forge_level_progression est retiré: compléter aX_cY_m1 ne crée plus aX_cY_m2 (W2.A)", async () => {
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
      .select("module_id")
      .eq("user_id", userId)
      .eq("module_id", nextId)
      .maybeSingle();
    if (nextErr) throw nextErr;
    expect(next).toBeNull();
  });


  it("update_user_chat_states_modtime: BEFORE UPDATE sets updated_at to NOW", async () => {
    const old = new Date(Date.now() - 10_000).toISOString();
    const { error: insErr } = await admin.from("user_chat_states").insert({
      user_id: userId,
      scope: "web",
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      last_interaction_at: old,
      updated_at: old,
    });
    if (insErr) throw insErr;

    // Update a field; trigger should bump updated_at
    const { error: updErr } = await admin.from("user_chat_states").update({ risk_level: 1 }).eq("user_id", userId).eq("scope", "web");
    if (updErr) throw updErr;

    const { data, error } = await admin.from("user_chat_states").select("updated_at,risk_level").eq("user_id", userId).eq("scope", "web").single();
    if (error) throw error;
    expect(data.risk_level).toBe(1);
    expect(new Date(data.updated_at).getTime()).toBeGreaterThan(new Date(old).getTime());
  });
});

describe.skipIf(!HAS_SUPABASE_TEST_ENV)("ultimate: edge-triggered side effects (memories + core identity + archive) [FULL]", () => {
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
      await admin.from("user_module_state_entries").delete().eq("user_id", userId);
      await admin.from("user_week_states").delete().eq("user_id", userId);
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

});



