// E2E tests for the RGPD data export:
//   fresh re-auth required, 1/24h rate limit, ZIP delivery through a signed URL,
//   and the scope contract — no system prompts, no internal scores, no raw logs.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { unzipSync } from "npm:fflate@0.8.2";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// ── Integration gate ──────────────────────────────────────────────────────────────────────
// These cases drive a REAL Supabase stack (auth, edge functions, DB). Without that stack the
// suite must SKIP them, not fail them: a permanently red net is a net nobody reads. Run them
// with `npm run test:mega`, or export the env below against a local stack — see
// docs/keel/TESTING.md.
const REQUIRED_ENV = ["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const MISSING_ENV = REQUIRED_ENV.filter((name) =>
  (Deno.env.get(name) ?? "").trim().length === 0
);
const SKIP_INTEGRATION = MISSING_ENV.length > 0;
if (SKIP_INTEGRATION) {
  console.log(
    `[skip] account_export_test.ts: needs a live Supabase stack — missing env: ${MISSING_ENV.join(", ")}`,
  );
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

const PASSWORD = "TestPassword!123";

Deno.test("gdpr export: re-auth, rate limit, zip content and scope guarantees", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nonce = makeNonce();
  const email = `export+${nonce}@example.com`;
  const { error: signUpErr } = await anon.auth.signUp({ email, password: PASSWORD });
  if (signUpErr) throw signUpErr;
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInErr) throw signInErr;
  const userId = signIn.user!.id as string;
  const accessToken = signIn.session!.access_token as string;

  // ---- Seed user-visible data + internal-only data that must NOT leak. ----
  await admin.from("profiles").update({
    full_name: "Utilisateur Export",
    phone_number: `+3366${makeNonce().slice(0, 7)}`,
    timezone: "Europe/Paris",
  }).eq("id", userId);

  // RETRAIT RÉSIDUS (2026-08-08): la cascade plan/transformation est droppée —
  // le seed legacy est parti avec elle. transformations.json reste dans le
  // bundle, vide (voir l'export), et l'assertion plus bas vérifie ce vide.

  const { error: chatErr } = await admin.from("chat_messages").insert([
    {
      user_id: userId,
      role: "user",
      content: "Bonjour Sophia, j'ai raté ma séance.",
      scope: "whatsapp",
      metadata: { risk_band: "INTERNAL_MUST_NOT_LEAK", channel: "whatsapp" },
    },
    {
      user_id: userId,
      role: "assistant",
      content: "Pas de souci, on reprend demain.",
      scope: "whatsapp",
      metadata: { momentum_classification: "INTERNAL_MUST_NOT_LEAK" },
    },
    {
      user_id: userId,
      role: "system",
      content: "SYSTEM_PROMPT_MUST_NOT_LEAK",
      scope: "whatsapp",
    },
  ]);
  if (chatErr) throw chatErr;

  const { error: memErr } = await admin.from("memory_items").insert([
    {
      user_id: userId,
      kind: "fact",
      status: "active",
      content_text: "Aime courir le matin.",
      sensitivity_level: "sensitive",
      sensitivity_categories: ["sante"],
      confidence: 0.9,
      importance_score: 0.8,
    },
    {
      user_id: userId,
      kind: "fact",
      status: "superseded",
      content_text: "SOUVENIR_SUPERSEDED_MUST_NOT_LEAK",
      // Multi-row PostgREST inserts null missing columns instead of applying
      // table defaults — NOT NULL columns must be explicit on every row.
      sensitivity_level: "normal",
      sensitivity_categories: [],
      confidence: 0.7,
      importance_score: 0,
    },
  ]);
  if (memErr) throw memErr;

  // ---- Wrong password → 403 and no export. ----
  const badPw = await fetch(`${supabaseUrl}/functions/v1/account-export-v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: "wrong-password" }),
  });
  assertEquals(badPw.status, 403);
  await badPw.text();

  // ---- Valid export. ----
  const res = await fetch(`${supabaseUrl}/functions/v1/account-export-v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const json = await res.json();
  assertEquals(res.status, 200, JSON.stringify(json));
  assert(typeof json?.url === "string" && json.url.length > 0, "should return a signed URL");
  assert((json?.expires_in_seconds ?? 0) <= 3600, "signed URL must be short-lived");

  // ---- Download & unzip. ----
  // The edge runtime signs URLs against its internal SUPABASE_URL (kong:8000);
  // rewrite the host so the download works from the test process.
  const downloadUrl = String(json.url).replace(/^https?:\/\/[^/]+/, supabaseUrl);
  const zipRes = await fetch(downloadUrl);
  assertEquals(zipRes.status, 200);
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
  const files = unzipSync(zipBytes);
  const names = Object.keys(files);
  const decoder = new TextDecoder();
  const text = (name: string) => decoder.decode(files[name]);

  for (
    const expected of [
      "README.txt",
      "profil.json",
      "transformations.json",
      "plans.json",
      "suivi.json",
      "souvenirs.json",
      "conversations.json",
    ]
  ) {
    assert(names.includes(expected), `archive must contain ${expected}`);
  }

  // README is French and warns about sensitive data.
  const readme = text("README.txt");
  assert(readme.includes("données personnelles sensibles"), "README must warn about sensitive data");

  // Profile content.
  const profil = JSON.parse(text("profil.json"));
  assertEquals(profil.nom_complet, "Utilisateur Export");
  assertEquals(profil.email_du_compte, email);

  // Conversations: user + assistant messages only, no metadata, no system role.
  const conversations = JSON.parse(text("conversations.json"));
  const messages = conversations.messages as Array<Record<string, unknown>>;
  assert(messages.length >= 2, "user and assistant messages must be exported");
  for (const m of messages) {
    assert(m.role === "user" || m.role === "assistant", `unexpected role ${m.role}`);
    assert(!("metadata" in m), "message metadata must not be exported");
  }
  assert(
    messages.some((m) => String(m.content).includes("raté ma séance")),
    "user's own words must be in the export",
  );

  // Memories: user-visible ones only, no internal scoring fields.
  const souvenirs = JSON.parse(text("souvenirs.json"));
  const items = souvenirs.souvenirs as Array<Record<string, unknown>>;
  assert(items.some((i) => String(i.content_text).includes("courir le matin")));
  for (const i of items) {
    for (
      const forbidden of [
        "sensitivity_level",
        "sensitivity_categories",
        "confidence",
        "importance_score",
        "embedding",
        "structured_data",
        "metadata",
      ]
    ) {
      assert(!(forbidden in i), `memory field ${forbidden} must not be exported`);
    }
  }

  // Transformations: tables droppées (retrait résidus 2026-08-08) — la clé de
  // bundle survit pour les lecteurs d'exports antérieurs, et elle est VIDE.
  const transfos = JSON.parse(text("transformations.json"));
  const trs = transfos.transformations as Array<Record<string, unknown>>;
  assert(trs.length === 0, "transformations export must be empty after drop");

  // Global leak sweep across the whole archive.
  const everything = names.map(text).join("\n");
  for (
    const leak of [
      "INTERNAL_ONLY_SUMMARY_MUST_NOT_LEAK",
      "INTERNAL_MUST_NOT_LEAK",
      "SYSTEM_PROMPT_MUST_NOT_LEAK",
      "SOUVENIR_SUPERSEDED_MUST_NOT_LEAK",
      "risk_band",
      "momentum_classification",
    ]
  ) {
    assert(!everything.includes(leak), `export leaked forbidden content: ${leak}`);
  }

  // ---- Rate limit: a second export inside 24 h is refused. ----
  const second = await fetch(`${supabaseUrl}/functions/v1/account-export-v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assertEquals(second.status, 429, await second.text().then((t) => t.slice(0, 300)));
});
