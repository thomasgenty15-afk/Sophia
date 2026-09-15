/**
 * VALIDATION FINALE DU CHANTIER CHAT — provisionnement d'un élève RÉEL.
 *
 * Stack LOCALE uniquement. Crée un vrai compte auth (donc un vrai JWT), un
 * coach, un lien coach↔élève, une doctrine publiée et un PLAN PUBLIÉ avec ses
 * engagements — sans lui, aucun effet KEEL ne se produit.
 *
 * `profiles.locale` est écrit EXPLICITEMENT: le défaut de la colonne est
 * `fr-FR`, et une fixture qui l'omet ment sur la langue de l'élève.
 *
 * Usage:
 *   deno run --allow-all scratchpad/chat_qa_provision.ts <locale> <units> [suffix]
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = "http://127.0.0.1:54321";
const ANON = Deno.env.get("QA_ANON_KEY")!;
const SERVICE = Deno.env.get("QA_SERVICE_KEY")!;

const locale = Deno.args[0] ?? "fr-FR";
const units = (Deno.args[1] ?? "metric") as "metric" | "imperial";
const suffix = Deno.args[2] ?? "";

const anon = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

function die(message: string): never {
  console.error(`FATAL: ${message}`);
  Deno.exit(1);
}

const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 6)}`;

// ── 1. LE COACH ────────────────────────────────────────────────────────────
const coachAuth = await anon.auth.signUp({
  email: `chat-coach-${nonce}@test.dev`,
  password: "1234567",
});
if (coachAuth.error || !coachAuth.data.user) die(`coach signUp: ${coachAuth.error?.message}`);
const coachUserId = coachAuth.data.user.id;
await admin.from("profiles").update({ keel_role: "coach", full_name: "QA Coach" } as never)
  .eq("id", coachUserId);

const coachRow = await admin.from("coaches").insert({
  user_id: coachUserId,
  display_name: "QA Coach",
  status: "active",
} as never).select("id").single();
if (coachRow.error) die(`coaches: ${coachRow.error.message}`);
const coachId = (coachRow.data as { id: string }).id;

// ── 2. L'ÉLÈVE ─────────────────────────────────────────────────────────────
const email = `chat-qa-${nonce}${suffix}@test.dev`;
const studentAuth = await anon.auth.signUp({ email, password: "1234567" });
if (studentAuth.error || !studentAuth.data.session) {
  die(`student signUp: ${studentAuth.error?.message}`);
}
const userId = studentAuth.data.user!.id;
const accessToken = studentAuth.data.session.access_token;

const profile = await admin.from("profiles").update({
  keel_role: "student",
  full_name: "QA Chat Student",
  timezone: "Europe/Paris",
  country: locale.startsWith("fr") ? "FR" : "GB",
  // ⚠️ EXPLICITE. Le défaut de la colonne est `fr-FR`; une fixture qui l'omet
  // ment sur la langue et rend le test anglais inconcluant.
  locale,
  display_unit_system: units,
  // Majeur: le plancher de mesure refuse tout chez un mineur, et un test qui
  // ne le dirait pas mesurerait la mauvaise garde.
  birth_date: "1990-05-14",
  access_tier: "student",
} as never).eq("id", userId);
if (profile.error) die(`profiles: ${profile.error.message}`);

const link = await admin.from("coach_clients").insert({
  coach_id: coachId,
  student_user_id: userId,
  status: "active",
  started_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
  consent_granted_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
} as never);
if (link.error) die(`coach_clients: ${link.error.message}`);

// ── 3. LE PLAN PUBLIÉ ──────────────────────────────────────────────────────
const planRow = await admin.from("plan_versions").insert({
  coach_id: coachId,
  student_id: userId,
  version: 1,
  status: "published",
  title: "QA chat plan",
  content_locale: locale,
  timezone: "Europe/Paris",
  published_at: new Date().toISOString(),
} as never).select("id").single();
if (planRow.error) die(`plan_versions: ${planRow.error.message}`);
const planVersionId = (planRow.data as { id: string }).id;

const commitments = await admin.from("plan_commitments").insert([
  {
    user_id: userId,
    coach_id: coachId,
    plan_version_id: planVersionId,
    activity_class: "nutrition",
    measure: "serving",
    food_group_ref: "non_starchy_veg",
    target_op: ">=",
    target_min: 2,
    unit: "serving",
    evaluation_grain: "day",
    content_locale: locale,
    status: "active",
    priority: "core",
    polarity: "do",
    anchor_kind: "free",
    evidence_kind: "self_report",
    title: "Green vegetables twice a day",
  },
  {
    user_id: userId,
    coach_id: coachId,
    plan_version_id: planVersionId,
    activity_class: "nutrition",
    measure: "serving",
    food_group_ref: "poultry",
    target_op: ">=",
    target_min: 1,
    unit: "serving",
    evaluation_grain: "day",
    content_locale: locale,
    status: "active",
    priority: "core",
    polarity: "do",
    anchor_kind: "free",
    evidence_kind: "self_report",
    title: "A lean protein at dinner",
  },
] as never);
if (commitments.error) {
  console.warn(`[warn] plan_commitments: ${commitments.error.message}`);
}

// ── 4. LA DOCTRINE PUBLIÉE ─────────────────────────────────────────────────
const doctrine = await admin.from("coach_doctrines").insert({
  coach_id: coachId,
  version: 1,
  published_at: new Date().toISOString(),
  published_by: coachUserId,
  content_locale: locale,
  voice: { language: locale, tone: "direct et chaleureux" },
  beliefs: [],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  compiled_prompt:
    "Tu portes la méthode de ce coach: des légumes verts à chaque dîner, une " +
    "protéine maigre le soir, et jamais de jugement sur un repas.",
  compiled_prompt_hash: `qa-${nonce}`,
} as never);
if (doctrine.error) console.warn(`[warn] coach_doctrines: ${doctrine.error.message}`);

console.log(JSON.stringify({
  email,
  userId,
  coachId,
  coachUserId,
  planVersionId,
  accessToken,
  locale,
  units,
}));
