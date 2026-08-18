// PREUVE CIBLÉE — LOT L2: une séance sort dans l'export RGPD, et disparaît à la purge.
//
// Pourquoi ce fichier existe et n'est pas dans le dépôt: le contrat du dépôt
// (`supabase/functions/keel_gdpr_lifecycle_test.ts`, liste `PIVOT_TABLES`) porte
// déjà `student_activity_sessions`. Mais ce test-là est ROUGE AVANT ce lot: sa
// fixture sème `recurring_meals` et `student_facts`, deux tables qui n'existent
// plus en base. Il tombe dans `seedFullStudent`, avant d'atteindre quoi que ce
// soit de ce lot. Ce fichier rejoue donc le MÊME chemin sur la seule table du
// lot, pour que la preuve soit réelle et pas déclarative.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { unzipSync } from "npm:fflate@0.8.2";

const PASSWORD = "TestPassword!123";

function env(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

Deno.test("L2: une séance sort dans l'export, et ne survit pas à la purge", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nonce = crypto.randomUUID().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const email = `l2.activity+${nonce}@example.com`;
  const { error: suErr } = await anon.auth.signUp({ email, password: PASSWORD });
  if (suErr) throw suErr;
  const { data: signIn, error: siErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (siErr) throw siErr;
  const userId = signIn.user!.id as string;
  const accessToken = signIn.session!.access_token as string;

  // ── 1. UNE SÉANCE, ÉCRITE ────────────────────────────────────────────────
  const { error: insErr } = await admin.from("student_activity_sessions").insert({
    user_id: userId,
    local_date: "2026-08-04",
    kind: "mobility",
    duration_min: 41,
    intensity: "easy",
    source: "app",
  });
  if (insErr) throw insErr;

  const before = await admin
    .from("student_activity_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assertEquals(before.count, 1, "la fixture doit porter exactement 1 séance");

  // ── 2. L'EXPORT LA CONTIENT ──────────────────────────────────────────────
  const expRes = await fetch(`${supabaseUrl}/functions/v1/account-export-v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const expJson = await expRes.json().catch(() => null);
  assertEquals(expRes.status, 200, JSON.stringify(expJson));

  const zipRes = await fetch(
    String(expJson.url).replace("http://kong:8000", supabaseUrl),
  );
  assertEquals(zipRes.status, 200, "l'URL signée doit rendre l'archive");
  const files = unzipSync(new Uint8Array(await zipRes.arrayBuffer()));
  const decoder = new TextDecoder();

  const manifest = JSON.parse(decoder.decode(files["fichiers.json"]));
  assertEquals(
    manifest.tables_indisponibles,
    [],
    "l'archive ne doit pas signaler de table indisponible",
  );

  const plan = JSON.parse(decoder.decode(files["mon_plan.json"]));
  const rows = plan?.seances_dactivite;
  assert(Array.isArray(rows), "mon_plan.json doit porter `seances_dactivite`");
  assertEquals(rows.length, 1, JSON.stringify(rows));
  assertEquals(rows[0].kind, "mobility");
  assertEquals(rows[0].duration_min, 41);
  assertEquals(rows[0].intensity, "easy");
  assertEquals(rows[0].local_date, "2026-08-04");

  // ⛔ AUCUNE COLONNE D'ÉNERGIE, ni dans la table ni dans l'archive.
  for (const key of Object.keys(rows[0])) {
    assert(
      !/kcal|calorie|energy|burn/i.test(key),
      `la séance exportée porte une colonne d'énergie: ${key}`,
    );
  }

  // ── 3. SUPPRESSION + PURGE J+7 FORCÉE ────────────────────────────────────
  const call = async (action: string, body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/account-deletion-v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  const prepare = await call("prepare", { password: PASSWORD });
  assertEquals(prepare.status, 200, JSON.stringify(prepare.json));
  const confirm = await call("confirm", {
    token: prepare.json.token,
    typed_confirmation: "DELETE",
  });
  assertEquals(confirm.status, 200, JSON.stringify(confirm.json));

  await admin
    .from("profiles")
    .update({ purge_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", userId);

  const secret = (Deno.env.get("MEGA_INTERNAL_SECRET") ?? "").trim() ||
    (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim();
  const purgeRes = await fetch(`${supabaseUrl}/functions/v1/purge-deleted-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "x-internal-secret": secret,
    },
    body: "{}",
  });
  const purgeJson = await purgeRes.json().catch(() => null);
  assertEquals(purgeRes.status, 200, JSON.stringify(purgeJson));
  assertEquals(
    purgeJson?.errors?.length ?? 0,
    0,
    JSON.stringify(purgeJson?.errors),
  );

  // ── 4. PLUS UNE LIGNE ────────────────────────────────────────────────────
  const after = await admin
    .from("student_activity_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assertEquals(after.count ?? 0, 0, "une séance a survécu à la purge");

  const { data: profileAfter } = await admin
    .from("profiles").select("id").eq("id", userId).maybeSingle();
  assertEquals(profileAfter, null, "le profil doit avoir disparu");
});
