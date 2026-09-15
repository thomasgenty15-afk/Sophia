/**
 * L2 — L'ENTRÉE ÉLÈVE, du lien à la première phrase.
 *
 * Deux moitiés :
 *   · celle-ci, qui fabrique de VRAIES invitations et éprouve les deux RPC
 *     (`preview_coach_invitation`, `accept_coach_invitation`) plus le chemin
 *     `handle_new_user()` — le seul qui pose le lien à l'inscription ;
 *   · le navigateur, qui joue `/join` et vérifie ce que la page RACONTE de
 *     chacun de ces états.
 *
 * Les jetons en clair ne sortent que parce que l'appel porte
 * `x-internal-secret` : un navigateur de coach ne les voit jamais.
 */
import { ANON, URL_BASE, admin, callAs, makeCoach, nonce, signUpAccount, sql } from "./harness.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });

/** Une invitation, avec son URL en clair (appel interne). */
async function invite(email: string): Promise<{ token: string; url: string; id: string }> {
  const res = await fetch(`${URL_BASE}/functions/v1/coach-invite-student-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${coach.accessToken}`,
      "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
    },
    body: JSON.stringify({ email, coach_user_id: coach.userId }),
  });
  const json = await res.json();
  if (!json.join_url) throw new Error(`pas de join_url: ${JSON.stringify(json)}`);
  const token = new URL(json.join_url).searchParams.get("token")!;
  return { token, url: json.join_url, id: json.invitation_id };
}

const anonClient = () =>
  createClient(URL_BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function preview(token: string) {
  const { data, error } = await anonClient().rpc("preview_coach_invitation", {
    p_token: token,
  });
  return { data, error: error?.message ?? null };
}

// ── 1. UNE INVITATION VALIDE, VUE SANS COMPTE ───────────────────────────────
const emailA = `qa-join-a-${nonce()}@test.dev`;
const invA = await invite(emailA);
say(`[1] invitation ${invA.id}`);
say(`[1] JOIN_URL_A=${invA.url}`);
say(`[1] preview (anon, aucun compte): ${JSON.stringify(await preview(invA.token))}`);

// Contre-factuel: le preview ne doit RIEN livrer d'autre que prénom + email.
say(`[1b] colonnes rendues: ${Object.keys(((await preview(invA.token)).data ?? [{}])[0] ?? {}).join(",")}`);

// ── 2. JETON INVALIDE / ABSENT ──────────────────────────────────────────────
say(`\n[2] jeton bidon: ${JSON.stringify(await preview("nope-not-a-token"))}`);
say(`[2] jeton vide : ${JSON.stringify(await preview(""))}`);

// ── 3. JETON EXPIRÉ ─────────────────────────────────────────────────────────
const emailB = `qa-join-b-${nonce()}@test.dev`;
const invB = await invite(emailB);
await sql(
  `update coach_invitations set expires_at = now() - interval '1 day' where id='${invB.id}'`,
);
say(`\n[3] jeton expiré: ${JSON.stringify(await preview(invB.token))}`);

// ── 4. ACCEPTATION PAR UN VISITEUR DÉJÀ CONNECTÉ ────────────────────────────
const emailC = `qa-join-c-${nonce()}@test.dev`;
const invC = await invite(emailC);
const visitor = await signUpAccount("qa-join-visitor");
const asVisitor = createClient(URL_BASE, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${visitor.accessToken}` } },
});
const acc = await asVisitor.rpc("accept_coach_invitation", { p_token: invC.token });
say(`\n[4] accept (connecté) → ${JSON.stringify({ data: acc.data, error: acc.error?.message })}`);
say(`[4] profil après: ${await sql(
  `select keel_role, coalesce(country,'<null>') country, coalesce(timezone,'<null>') tz, coalesce(locale,'<null>') locale from profiles where id='${visitor.userId}'`,
)}`);
say(`[4] coach_clients: ${await sql(
  `select status, student_user_id is not null as linked from coach_clients where coach_id='${coach.coachId}' and invited_email='${emailC}'`,
)}`);
say(`[4] invitation: ${await sql(
  `select status, accepted_at is not null as accepted from coach_invitations where id='${invC.id}'`,
)}`);

// ── 5. REJEU DU MÊME JETON (second appareil) ────────────────────────────────
const other = await signUpAccount("qa-join-replay");
const asOther = createClient(URL_BASE, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${other.accessToken}` } },
});
const replay = await asOther.rpc("accept_coach_invitation", { p_token: invC.token });
say(`\n[5] REJEU sur un autre compte → ${JSON.stringify({ data: replay.data, error: replay.error?.message })}`);
say(`[5] profil du rejoueur: ${await sql(
  `select coalesce(keel_role,'<null>') from profiles where id='${other.userId}'`,
)}`);
say(`[5] lignes coach_clients pour ce coach: ${await sql(
  `select count(*) from coach_clients where coach_id='${coach.coachId}'`,
)}`);

// ── 6. INSCRIPTION AVEC LE JETON (handle_new_user) ──────────────────────────
const emailD = `qa-join-d-${nonce()}@test.dev`;
const invD = await invite(emailD);
const { data: signed, error: signErr } = await anonClient().auth.signUp({
  email: emailD,
  password: "1234567",
  options: { data: { coach_invite_token: invD.token } },
});
say(`\n[6] signUp avec jeton → ${signErr?.message ?? "ok"} user=${signed?.user?.id}`);
if (signed?.user?.id) {
  say(`[6] profil: ${await sql(
    `select coalesce(keel_role,'<null>') keel_role, coalesce(country,'<null>') country, coalesce(timezone,'<null>') tz, coalesce(locale,'<null>') locale from profiles where id='${signed.user.id}'`,
  )}`);
  say(`[6] lien: ${await sql(
    `select status, student_user_id is not null as linked from coach_clients where coach_id='${coach.coachId}' and invited_email='${emailD}'`,
  )}`);
  say(`[6] invitation: ${await sql(
    `select status from coach_invitations where id='${invD.id}'`,
  )}`);
}

// ── 7. INVITER UN ÉLÈVE DÉJÀ SOUS UN AUTRE COACH ────────────────────────────
const coach2 = await makeCoach({ displayName: "Rival", country: "FR" });
const res2 = await fetch(`${URL_BASE}/functions/v1/coach-invite-student-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${coach2.accessToken}`,
    "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
  },
  body: JSON.stringify({ email: emailD, coach_user_id: coach2.userId }),
});
const json2 = await res2.json();
say(`\n[7] coach 2 invite un élève déjà pris → ${res2.status} ${JSON.stringify(json2).slice(0, 300)}`);
if (json2.join_url) {
  const t2 = new URL(json2.join_url).searchParams.get("token")!;
  const asD = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signed!.session!.access_token}` } },
  });
  const steal = await asD.rpc("accept_coach_invitation", { p_token: t2 });
  say(`[7] l'élève accepte le 2e coach → ${JSON.stringify({ data: steal.data, error: steal.error?.message })}`);
  say(`[7] liens vivants pour cet élève: ${await sql(
    `select coach_id, status from coach_clients where student_user_id='${signed!.user!.id}'`,
  )}`);
}

// ── 8. LE PAYS, défaut P0 connu ─────────────────────────────────────────────
say(`\n[8] pays + langue des élèves fabriqués par CE parcours (le P0 connu):`);
say(await sql(
  `select coalesce(country,'<NULL>') country, locale, coalesce(timezone,'<NULL>') tz, count(*)
     from profiles
    where id in ('${visitor.userId}','${signed?.user?.id ?? "00000000-0000-0000-0000-000000000000"}')
    group by 1,2,3`,
));

// La conséquence, jouée contre le VRAI résolveur de crise.
const { crisisCountryForProfile, resolveCrisisResources } = await import(
  "../../../supabase/functions/_shared/keel/crisis_resources.ts"
);
for (const [label, uid] of [["visiteur connecté", visitor.userId], ["inscrit par le lien", signed?.user?.id]] as const) {
  if (!uid) continue;
  const raw = (await sql(
    `select coalesce(country,'') || '~' || coalesce(locale,'') as v from profiles where id='${uid}'`,
  )).split("\n")[1] ?? "";
  const [c, l] = raw.split("~");
  const profile = { country: c || null, locale: l || null };
  const resolution = crisisCountryForProfile(profile);
  const served = resolveCrisisResources(resolution.country, "suicide");
  say(`[8] ${label}: profil=${JSON.stringify(profile)} → pays=${resolution.country} (${resolution.source}) → ${served.resources.map((r: any) => r.contact).join(", ")} fallback=${served.fallbackUsed}`);
}

say(`\ncontext: ${JSON.stringify({ coachId: coach.coachId, joinUrlA: invA.url, expiredUrl: invB.url })}`);
await Deno.writeTextFile(new URL("./L2-join.txt", import.meta.url), lines.join("\n") + "\n");
