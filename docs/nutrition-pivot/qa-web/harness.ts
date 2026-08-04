/**
 * HARNAIS QA WEB — fabriquer un coach, un élève, et JOUER des tours réels.
 *
 * ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ─────────────────────────────
 * Ce n'est pas un mock. Chaque fonction ici tape la VRAIE fonction edge par
 * HTTP, avec un vrai JWT, contre la vraie base locale. Le seul raccourci assumé
 * est la CRÉATION des comptes : elle passe par `auth.signUp` (l'API), jamais par
 * un mot de passe tapé dans un formulaire. C'est la règle de la maison depuis
 * `dev_make_chat_student.ts`, et elle vaut pour deux raisons — un formulaire
 * rempli ne prouve rien de plus qu'un `signUp` réussi, et aucun compte réel ne
 * doit pouvoir être touché par un harnais.
 *
 * ── POURQUOI `signUp` ET PAS `auth.admin.createUser` ─────────────────────────
 * L'API admin rend « invalid JWT: signing method HS256 is invalid » par
 * intermittence sur la stack locale (nouvelles clés `sb_secret_…`). Mesuré à
 * 2 succès sur 8. `signUp` marche toujours.
 *
 * ── L'HORLOGE ────────────────────────────────────────────────────────────────
 * Aucune fonction d'ici n'invente d'horloge. Quand un cron accepte `now`, on le
 * lui passe explicitement, et l'appelant est responsable de garder cette horloge
 * **≥ l'heure réelle** (sinon le job décide sur une heure et la base estampille
 * sur une autre — le défaut L0 de cette QA).
 *
 * USAGE
 *   import { makeCoach, makeStudent, turn, sql } from "./harness.ts";
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321")
  .replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE)) {
  throw new Error(`Refus: harnais local uniquement (reçu ${URL_BASE}).`);
}
export const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
export const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
export const INTERNAL_SECRET =
  (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim();
if (!ANON || !SERVICE) throw new Error("Manque SUPABASE_ANON_KEY / SERVICE_ROLE_KEY.");

export { URL_BASE };

export function admin(): SupabaseClient {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function nonce(): string {
  return `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
}

export type Account = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

/** Un compte authentifié jetable. Rien de KEEL n'est encore posé dessus. */
export async function signUpAccount(prefix: string): Promise<Account> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `${prefix}-${nonce()}@test.dev`;
  const { data, error } = await anon.auth.signUp({ email, password: "1234567" });
  if (error || !data.user || !data.session) {
    throw new Error(`signUp(${prefix}): ${error?.message ?? "pas de session"}`);
  }
  return {
    userId: data.user.id,
    email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/** Appelle une fonction edge avec le JWT d'un utilisateur. */
export async function callAs(
  account: Account,
  fn: string,
  body: unknown,
  init: { method?: string } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${account.accessToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Appelle un cron avec l'en-tête interne (que `functions.invoke` n'envoie pas). */
export async function callCron(
  fn: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export type Coach = Account & { coachId: string };

/** Un coach complet: compte + `coach-signup-v1` (la VRAIE fonction). */
export async function makeCoach(opts: {
  displayName?: string;
  country?: string;
} = {}): Promise<Coach> {
  const account = await signUpAccount("qa-coach");
  const res = await callAs(account, "coach-signup-v1", {
    display_name: opts.displayName ?? "QA Coach",
    country: opts.country ?? "GB",
  });
  if (res.status !== 200 || !res.json?.coach?.id) {
    throw new Error(`coach-signup-v1 ${res.status}: ${JSON.stringify(res.json)}`);
  }
  return { ...account, coachId: res.json.coach.id as string };
}

export type Student = Account;

/**
 * Un élève KEEL. Le lien coach↔élève est posé par `coach_clients` — la seule
 * source d'accès du coach (cf. `coached_student_ids()`).
 */
export async function makeStudent(opts: {
  coach?: Coach;
  timezone?: string;
  country?: string | null;
  fullName?: string;
  withAdoptedPlan?: boolean;
  weekStart?: string;
} = {}): Promise<Student> {
  const account = await signUpAccount("qa-student");
  const db = admin();
  const patch: Record<string, unknown> = {
    keel_role: "student",
    full_name: opts.fullName ?? "QA Student",
    timezone: opts.timezone ?? "Europe/Paris",
    proactive_muted_at: null,
    deletion_requested_at: null,
  };
  if (opts.country !== undefined) patch.country = opts.country;
  else patch.country = "GB";
  const { error } = await db.from("profiles").update(patch as never).eq(
    "id",
    account.userId,
  );
  if (error) throw new Error(`profil élève: ${error.message}`);

  if (opts.coach) {
    // `student_user_id`, pas `student_id`: c'est la colonne que
    // `coached_student_ids()` lit, et c'est elle qui porte l'index
    // `one_live_coach_per_student`.
    const { error: linkErr } = await db.from("coach_clients").insert({
      coach_id: opts.coach.coachId,
      student_user_id: account.userId,
      invited_email: account.email,
      status: "active",
      consent_granted_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    } as never);
    if (linkErr) throw new Error(`coach_clients: ${linkErr.message}`);
  }

  if (opts.withAdoptedPlan !== false) {
    const weekStart = opts.weekStart ?? mondayOf(new Date());
    const { error: planErr } = await db.from("student_week_plans").insert({
      user_id: account.userId,
      week_start: weekStart,
      status: "adopted",
      adopted_at: new Date().toISOString(),
      items: [],
      content_locale: "en-GB",
    } as never);
    if (planErr) throw new Error(`student_week_plans: ${planErr.message}`);
  }
  return account;
}

/**
 * UN PLAN PUBLIÉ, AVEC SES ENGAGEMENTS — et c'est un PRÉREQUIS, pas un décor.
 *
 * MESURÉ (QA WEB L3-bis) : sans plan **publié**, le dispatcher a pour consigne
 * explicite de n'émettre JAMAIS `log_protocol_event` ni `declare_deviation`
 * (« ILS N'EXISTENT QUE si le payload porte keel_plan_context »). Un élève
 * fabriqué avec un simple `student_week_plans` — ce que faisait ce harnais —
 * ne peut donc RIEN enregistrer, et toute conclusion tirée sur lui est fausse
 * dans le sens le plus dangereux : celui du « ça ne marche pas ».
 *
 * Les deux engagements reproduisent une prescription réelle relue en base
 * (`Protein at lunch` / `Vegetables at lunch`).
 */
export async function publishPlanFor(
  coach: Coach,
  studentUserId: string,
  opts: { timezone?: string; contentLocale?: string } = {},
): Promise<string> {
  const db = admin();
  const { data, error } = await db.from("plan_versions").insert({
    coach_id: coach.coachId,
    student_id: studentUserId,
    version: 1,
    status: "published",
    title: "QA protocol",
    content_locale: opts.contentLocale ?? "en-GB",
    timezone: opts.timezone ?? "Europe/London",
    published_at: new Date().toISOString(),
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`plan_versions: ${error.message}`);
  const planVersionId = String((data as { id: string }).id);

  const base = {
    plan_version_id: planVersionId,
    user_id: studentUserId,
    coach_id: coach.coachId,
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "slot",
    slot_key: "lunch",
    measure: "presence",
    target_op: "any",
    evidence_kind: "self_report",
    evaluation_grain: "day",
    content_locale: opts.contentLocale ?? "en-GB",
  };
  const { error: cErr } = await db.from("plan_commitments").insert([
    { ...base, food_group_ref: "lean_protein", title: "Protein at lunch" },
    { ...base, food_group_ref: "non_starchy_veg", title: "Vegetables at lunch" },
  ] as never);
  if (cErr) throw new Error(`plan_commitments: ${cErr.message}`);
  return planVersionId;
}

export function mondayOf(d: Date): string {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (c.getUTCDay() + 6) % 7; // lundi = 0
  c.setUTCDate(c.getUTCDate() - dow);
  return c.toISOString().slice(0, 10);
}

export type TurnResult = {
  status: number;
  json: any;
  /** Le texte VISIBLE rendu à l'élève, relu depuis `chat_messages`. */
  reply: string | null;
  replyMetadata: Record<string, unknown> | null;
};

/**
 * UN TOUR RÉEL. Le texte part par `chat-inbound-v1`, traverse `sophia-brain`,
 * et on relit ce que la BASE porte — jamais ce que la réponse HTTP raconte.
 */
export async function turn(
  student: Student,
  text: string,
  opts: { clientMessageId?: string; replyTo?: string } = {},
): Promise<TurnResult> {
  const before = await lastAssistantAt(student.userId);
  const res = await callAs(student, "chat-inbound-v1", {
    client_message_id: opts.clientMessageId ?? `qa-${nonce()}`,
    kind: "text",
    text,
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
  });
  const row = await lastAssistantAfter(student.userId, before);
  return {
    status: res.status,
    json: res.json,
    reply: row?.content ?? null,
    replyMetadata: (row?.metadata ?? null) as Record<string, unknown> | null,
  };
}

async function lastAssistantAt(userId: string): Promise<string> {
  const { data } = await admin()
    .from("chat_messages")
    .select("created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ created_at: string }>;
  return rows[0]?.created_at ?? "1970-01-01T00:00:00.000Z";
}

async function lastAssistantAfter(
  userId: string,
  afterIso: string,
): Promise<{ content: string; metadata: unknown } | null> {
  const { data } = await admin()
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gt("created_at", afterIso)
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ content: string; metadata: unknown }>;
  return rows[0] ?? null;
}

/** Tout l'historique visible d'un élève, dans l'ordre. */
export async function transcript(
  userId: string,
): Promise<Array<{ role: string; content: string; metadata: any; created_at: string }>> {
  const { data } = await admin()
    .from("chat_messages")
    .select("role,content,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []) as never;
}

/**
 * SQL brut via `psql` — pour ce que PostgREST ne sait pas dire.
 *
 * ⚠️ Le pied de page `(N rows)` est RETIRÉ, et ça a coûté un run.
 * Avec `-A`, un résultat vide rend la ligne littérale `(0 rows)`; un appelant
 * qui comptait les lignes non vides voyait donc UNE réponse là où il n'y en
 * avait aucune — et rendait « question posée » sur les 14 cas de L3-bis, dont
 * les 8 contre-factuels. Un harnais qui ment dans le sens du succès est pire
 * qu'un harnais cassé.
 */
export async function sql(query: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: [
      "exec", "-i", "supabase_db_Sophia_2",
      "psql", "-U", "postgres", "-d", "postgres", "-A", "-F", "|", "-c", query,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const text = new TextDecoder().decode(out.stdout);
  const err = new TextDecoder().decode(out.stderr);
  if (!out.success) throw new Error(`psql: ${err || text}`);
  return text
    .split("\n")
    .filter((line) => !/^\(\d+ rows?\)$/.test(line.trim()))
    .join("\n")
    .trim();
}

/** Les LIGNES de données d'une requête, sans l'en-tête ni le pied de page. */
export async function rows(query: string): Promise<string[]> {
  const out = await sql(query);
  return out.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
}

/** Un scalaire (`select count(*) …`), ou `0`. */
export async function scalar(query: string): Promise<number> {
  const [first] = await rows(query);
  return Number(first ?? 0);
}

/** Efface un compte jetable et tout ce qui pend dessus. */
export async function cleanup(userId: string): Promise<void> {
  const db = admin();
  for (
    const table of [
      "inbound_dedup",
      "outbound_messages",
      "chat_messages",
      "student_daily_checkins",
      "protocol_events",
      "planned_deviations",
      "student_safety_constraints",
      "student_week_plans",
      "coach_clients",
    ]
  ) {
    const col = table === "coach_clients" ? "student_user_id" : "user_id";
    await db.from(table).delete().eq(col, userId);
  }
  await db.auth.admin.deleteUser(userId).catch(() => {});
}
