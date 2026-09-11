/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ⑤ — LA PETITE CAMPAGNE RÉELLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts <1..6>
 *
 * ⛔ CELUI-CI DÉPENSE. Il n'y a AUCUN adaptateur : la requête part sur
 * `${SUPABASE_URL}/functions/v1/generate-household-meal-v1`, donc par KONG et
 * par le `functions serve` de l'humain, et le modèle est appelé pour de vrai.
 * Six tirs au maximum, **un par lancement**, jamais en boucle.
 *
 * ⛔ AUCUNE SUPPRESSION. Un compte de fixture par tir (`lotf.camp<N>@…`), et
 * `intent: prepare_next` pose une fenêtre neuve. Le script de campagne du
 * 2026-09-11 portait des `DELETE` larges par utilisateur ; celui-ci n'en a
 * aucun, et n'en a pas besoin.
 *
 * ⛔ ON NE RELANCE PAS UN ÉCHEC EN SILENCE. Le script écrit sa sortie et sort
 * en erreur ; c'est à l'humain de décider. Le plan l'écrit.
 *
 * ── LE NOMBRE DE CASES EST ANNONCÉ AVANT LE TIR ───────────────────────────
 *
 * Il est imprimé AVANT l'appel, avec sa dérivation. Un dénominateur découvert
 * après coup se choisit tout seul.
 */
import { loadDotEnv } from "./transport-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const SORTIE = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F`;

const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!API || !ANON || !SVC) {
  console.error("⛔ pile locale absente de supabase/.env");
  Deno.exit(2);
}

/** Le plafond de l'HÉBERGÉ, en dur. Kong local est relevé à 600 000 ms. */
const PLAFOND_HEBERGE_MS = 150_000;

interface Tir {
  readonly n: number;
  readonly titre: string;
  readonly goal: "fat_loss" | "muscle_gain";
  readonly targetWeight: number;
  readonly pace: number;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly birthDate: string;
  readonly firstName: string;
  readonly appetite: "small" | "average" | "large";
  readonly duo: boolean;
  /** Un rythme déclaré, avec ses tailles de repas. `null` = la maison. */
  readonly rhythm: { slot: string; size?: string }[] | null;
  readonly fixedIntakes: Record<string, unknown>[] | null;
  /** Une allergie RÉELLE, écrite par la RPC du produit. */
  readonly allergie: string | null;
}

const TIRS: Record<string, Tir> = {
  "1": {
    n: 1,
    titre: "PERTE · une personne · fenêtre qui commence aujourd'hui, puis deux jours entiers",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "average",
    duo: false,
    rhythm: null,
    fixedIntakes: null,
    allergie: null,
  },
  "2": {
    n: 2,
    titre: "GAIN · même fenêtre et même rythme · petit-suisse et pita au catalogue",
    goal: "muscle_gain",
    targetWeight: 70,
    pace: 0.25,
    heightCm: 178,
    weightKg: 62,
    birthDate: "1998-07-02",
    firstName: "Max",
    appetite: "average",
    duo: false,
    rhythm: null,
    fixedIntakes: null,
    allergie: null,
  },
  "3": {
    n: 3,
    titre: "PERTE · grand appétit · journées entières",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "large",
    duo: false,
    rhythm: null,
    fixedIntakes: null,
    allergie: null,
  },
  "4": {
    n: 4,
    titre: "GAIN · petit appétit · journées entières",
    goal: "muscle_gain",
    targetWeight: 70,
    pace: 0.25,
    heightCm: 178,
    weightKg: 62,
    birthDate: "1998-07-02",
    firstName: "Max",
    appetite: "small",
    duo: false,
    rhythm: null,
    fixedIntakes: null,
    allergie: null,
  },
  "5": {
    n: 5,
    titre: "PERTE · repas léger déclaré et apport fixe · sans réintroduire d'extra",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "average",
    duo: false,
    // ⛔ « repas léger » EST UNE DÉCLARATION DE RYTHME, pas un réglage caché :
    // `size: "small"` sur le déjeuner. Les trois moments restent déclarés —
    // retirer un moment serait un AUTRE cas (le rythme partiel).
    rhythm: [
      { slot: "breakfast", size: "medium" },
      { slot: "lunch", size: "small" },
      { slot: "dinner", size: "medium" },
    ],
    // ⛔ ET L'APPORT FIXE N'EST PAS UN EXTRA. 200 g de yaourt grec au
    // petit-déjeuner, déclarés par la personne : le moteur doit les
    // RETRANCHER du budget de la case, une seule fois, pas ajouter un forfait.
    fixedIntakes: [{
      food_ref: "greek_yogurt",
      amount: 200,
      unit: "g",
      slot: "breakfast",
    }],
    allergie: null,
  },
  "6": {
    n: 6,
    titre: "DEUX BOUCHES aux besoins différents · préparation partagée · allergie RÉELLE",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "average",
    duo: true,
    rhythm: null,
    fixedIntakes: null,
    // ⛔ UNE ALLERGIE ÉCRITE EN BASE PAR LA RPC DU PRODUIT, sur la SECONDE
    // bouche. Sans elle, « zéro violation » veut dire « on ne l'a pas
    // essayé » — la faute nommée par le lot 0.
    allergie: "arachide",
  },
};

const ARG = Deno.args.find((a) => !a.startsWith("--")) ?? "";
const tir = TIRS[ARG];
if (!tir) {
  console.error(`⛔ usage : campagne-lot-F.ts <1..6>  (reçu « ${ARG} »)`);
  Deno.exit(2);
}

// ── LES APPELS À LA PILE ──────────────────────────────────────────────────
async function rpc(bearer: string, name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: bearer === SVC ? SVC : ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}
async function signIn(email: string) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "1234567" }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b?.access_token) return null;
  return { token: String(b.access_token), userId: String(b.user?.id ?? "") };
}
async function account(email: string) {
  const e = await signIn(email);
  if (e) return e;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: "1234567",
      email_confirm: true,
      user_metadata: { fixture: "LOT-F-CAMPAGNE" },
    }),
  });
  if (!res.ok) throw new Error(`création ${email} → ${res.status} ${await res.text()}`);
  const f = await signIn(email);
  if (!f) throw new Error(`${email} non connectable`);
  return f;
}
async function post(path: string, body: unknown, prefer: string) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
      prefer,
    },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${t}`);
  return t;
}

// ── LE PROVISIONNEMENT ────────────────────────────────────────────────────
const EMAIL = `lotf.camp${tir.n}@keeltest.dev`;
const maintenant = new Date();
const jourLocal = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(maintenant);
const heureLocale = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
}).format(maintenant);

console.log(`╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║ LOT F ⑤ · TIR n° ${tir.n}`);
console.log(`╚══════════════════════════════════════════════════════════════════╝`);
console.log(`   ${tir.titre}`);
console.log(`   compte        ${EMAIL}`);
console.log(`   contexte      ${jourLocal} ${heureLocale} (Europe/Paris) · ${maintenant.toISOString()}`);

const me = await account(EMAIL);
await post("profiles?on_conflict=id", {
  id: me.userId,
  full_name: `${tir.firstName} Campagne LotF`,
  birth_date: tir.birthDate,
  gender: "male",
  locale: "fr-FR",
  country: "FR",
  timezone: "Europe/Paris",
  height_cm: tir.heightCm,
  day_activity: "seated",
  activity_level: "trains_some",
  sport_frequency: "3_4",
  onboarding_completed: true,
}, "resolution=merge-duplicates,return=minimal");
await post("student_goals?on_conflict=user_id", {
  user_id: me.userId,
  goal: tir.goal,
  content_locale: "fr-FR",
  target_weight_kg: tir.targetWeight,
  target_pace_kg_per_week: tir.pace,
}, "resolution=merge-duplicates,return=minimal");
await rpc(me.token, "keel_join_house_coach", { p_country: "FR" });
await post("student_body_measures", {
  user_id: me.userId,
  kind: "weight",
  value_si: tir.weightKg,
  source: "setup",
  local_date: jourLocal,
  measured_at: maintenant.toISOString(),
}, "return=minimal");

const roster = await rpc(me.token, "keel_household_roster");
const rows = Array.isArray(roster.body) ? roster.body as Record<string, unknown>[] : [];
const mine = rows.find((r) => String(r.user_id ?? "") === me.userId);
if (!mine) throw new Error(`aucune bouche titulaire : ${JSON.stringify(roster.body)}`);
const memberId = String(mine.member_id);

const poser = async (name: string, args: Record<string, unknown>) => {
  const out = await rpc(me.token, name, args);
  const b = out.body as Record<string, unknown>;
  if (b?.ok !== true) throw new Error(`${name} → ${JSON.stringify(b)}`);
};
await poser("keel_household_set_member_name", {
  p_member: memberId,
  p_first_name: tir.firstName,
});
await poser("keel_household_set_member_birth_date", {
  p_member: memberId,
  p_birth_date: tir.birthDate,
});
await poser("keel_household_set_member_body", {
  p_member: memberId,
  p_height_cm: tir.heightCm,
  p_weight_kg: tir.weightKg,
  p_gender: "male",
  p_activity_level: "trains_some",
  p_day_activity: "seated",
  p_sport_frequency: "3_4",
  p_activity_axes_asked: true,
  p_appetite: tir.appetite,
  p_appetite_asked: true,
});
if (tir.rhythm) {
  // ⛔ `keel_household_set_member_rhythm` REFUSE `has_account`, ET ELLE A RAISON.
  // Sa garde D1 le dit en toutes lettres : « la bouche a un compte : son rythme
  // vit dans SON "about you" ». Pour un titulaire, le rythme est donc
  // `student_goals.practical_constraints -> 'eating_rhythm'` — c'est la source
  // que `keel_household_roster_for` lit pour une ligne qui porte un `user_id`.
  //
  // ⚠️ CE N'EST PAS UN CONTOURNEMENT DE LA RPC : c'est l'autre support, celui
  // que l'entonnoir écrit. Le premier lancement du tir n° 5 est mort ICI, avant
  // tout appel modèle ; c'est une faute du harnais, pas du moteur, et elle est
  // nommée dans le rapport.
  const actuel = await fetch(
    `${API}/rest/v1/student_goals?user_id=eq.${me.userId}&select=practical_constraints`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await actuel.json().catch(() => []) as Record<string, unknown>[];
  const pc = (lignes[0]?.practical_constraints ?? {}) as Record<string, unknown>;
  const patch = await fetch(
    `${API}/rest/v1/student_goals?user_id=eq.${me.userId}`,
    {
      method: "PATCH",
      headers: {
        apikey: SVC,
        authorization: `Bearer ${SVC}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        practical_constraints: { ...pc, eating_rhythm: tir.rhythm },
      }),
    },
  );
  if (!patch.ok) throw new Error(`rythme du titulaire → ${patch.status} ${await patch.text()}`);
  void (await patch.text());
  console.log(`   rythme        ${JSON.stringify(tir.rhythm)} (student_goals.practical_constraints)`);
}
if (tir.fixedIntakes) {
  await poser("keel_household_set_member_fixed_intakes", {
    p_member: memberId,
    p_intakes: tir.fixedIntakes,
  });
}

let secondMember: string | null = null;
if (tir.duo) {
  const deja = rows.find((r) => String(r.first_name ?? "") === "Lea");
  if (deja) {
    secondMember = String(deja.member_id);
  } else {
    await rpc(me.token, "keel_household_add_member", {
      p_first_name: "Lea",
      p_birth_date: "1994-04-04",
    });
    const encore = await rpc(me.token, "keel_household_roster");
    const r2 = Array.isArray(encore.body) ? encore.body as Record<string, unknown>[] : [];
    const n = r2.find((r) => String(r.first_name ?? "") === "Lea");
    if (!n) throw new Error("la 2e bouche n'a pas été créée");
    secondMember = String(n.member_id);
  }
  await poser("keel_household_set_member_body", {
    p_member: secondMember,
    p_height_cm: 164,
    p_weight_kg: 58,
    p_gender: "female",
    p_activity_level: "sedentary",
    p_day_activity: "seated",
    p_sport_frequency: "none",
    p_activity_axes_asked: true,
    p_appetite: "small",
    p_appetite_asked: true,
  });
}
if (tir.allergie && secondMember) {
  const a = await rpc(me.token, "keel_household_add_allergy", {
    p_member: secondMember,
    p_label: tir.allergie,
  });
  console.log(`   allergie      « ${tir.allergie} » sur la 2e bouche → ${JSON.stringify(a.body)}`);
}

// ── LE NOMBRE DE CASES, ANNONCÉ AVANT LE TIR ──────────────────────────────
const bouches = tir.duo ? 2 : 1;
const heure = Number(heureLocale.slice(0, 2));
// ⚠️ DÉRIVATION, PAS DEVINETTE. La fenêtre demandée fait 3 jours ; le premier
// jour perd les moments déjà passés (`slotsUnservableToday`) et, passée la
// coupure de courses du soir, il tombe ENTIER (`spent_first_day_dropped`).
// Mesuré ce soir à 19 h 42 sur le banc ② : le vendredi n'a plus aucune case.
const premierJourEntier = heure < 12;
const casesAnnoncees = (premierJourEntier ? 9 : 6);
console.log(`   fenêtre       3 jours, intent=prepare_next`);
console.log(
  `   CASES ANNONCÉES : ${casesAnnoncees} cases × ${bouches} bouche(s) = ` +
    `${casesAnnoncees * bouches} parts attendues`,
);
console.log(
  `   dérivation    3 jours × 3 moments = 9 ; il est ${heureLocale}, donc le ` +
    `premier jour ${premierJourEntier ? "compte entier" : "tombe (coupure de courses)"}`,
);

// ── LE TIR ────────────────────────────────────────────────────────────────
console.log(`\n   ⏳ appel réel en cours — modèle facturé, aucune relance automatique…`);
const t0 = Date.now();
let res: Response;
let erreurReseau: string | null = null;
try {
  res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${me.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: 3 } }),
  });
} catch (e) {
  erreurReseau = String((e as Error).message ?? e);
  res = new Response(JSON.stringify({ error: "network", detail: erreurReseau }), {
    status: 599,
  });
}
const ms = Date.now() - t0;
const body = await res.json().catch(() => ({} as Record<string, unknown>));
const meal = (body as Record<string, unknown>)?.meal as Record<string, unknown> | undefined;
const mealId = String(meal?.id ?? "");

console.log(`\n── RÉPONSE ───────────────────────────────────────────────`);
console.log(`   statut        ${res.status}`);
console.log(`   durée totale  ${ms} ms`);
console.log(
  `   plafond hébergé ${PLAFOND_HEBERGE_MS} ms → ${
    ms <= PLAFOND_HEBERGE_MS
      ? "✅ passerait en production"
      : `⛔ COUPÉ EN PRODUCTION (${ms - PLAFOND_HEBERGE_MS} ms de trop)`
  }`,
);
console.log(`   plan          ${mealId || "(aucun)"}`);
if (res.status !== 200) {
  console.log(`   corps         ${JSON.stringify(body).slice(0, 3000)}`);
}

// ── LA RÉPONSE BRUTE DU MODÈLE, RECOPIÉE ──────────────────────────────────
//
// ⛔ SANS ELLE, LE CONTRÔLE ⑨ N'A RIEN À COMPARER. « La prose affichée est-elle
// celle du calcul ? » se mesure contre CE QUE LE MODÈLE A ÉCRIT, par égalité de
// chaînes. On la lit dans `llm_raw_response_events`, filtrée sur l'identifiant
// de requête — jamais sur la dernière ligne écrite, qui appartiendrait au tir
// d'à côté si deux tournaient.
const requestId = String((body as Record<string, unknown>)?.request_id ?? "");
let reponseBrute = "";
if (requestId) {
  const rr = await fetch(
    `${API}/rest/v1/llm_raw_response_events?request_id=eq.${requestId}` +
      `&source=eq.generate-household-meal-v1&status=eq.success&select=output_text,created_at` +
      `&order=created_at.asc`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await rr.json().catch(() => []) as Record<string, unknown>[];
  reponseBrute = String(lignes[0]?.output_text ?? "");
  console.log(
    `   réponse brute du modèle : ${reponseBrute.length} caractères` +
      `${lignes.length > 1 ? ` (${lignes.length} succès sur cette requête, on garde le PREMIER)` : ""}`,
  );
}

let stored: Record<string, unknown> | null = null;
if (mealId) {
  const r = await fetch(
    `${API}/rest/v1/student_generated_meals?id=eq.${mealId}&select=*`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const l = await r.json() as Record<string, unknown>[];
  stored = l[0] ?? null;
}

try {
  Deno.mkdirSync(SORTIE, { recursive: true });
} catch { /* déjà là */ }
const fichier = `${SORTIE}/campagne-tir${tir.n}-${
  maintenant.toISOString().replace(/[:.]/g, "-")
}.json`;
Deno.writeTextFileSync(
  fichier,
  JSON.stringify({
    cas: tir.goal === "fat_loss" ? "perte" : "gain",
    tir: tir.n,
    titre: tir.titre,
    reel: true,
    lance_le: maintenant.toISOString(),
    jour_local: jourLocal,
    heure_locale: heureLocale,
    cases_annoncees: casesAnnoncees,
    bouches,
    duree_ms: ms,
    plafond_heberge_ms: PLAFOND_HEBERGE_MS,
    statut: res.status,
    erreur_reseau: erreurReseau,
    reponse: body,
    reponse_brute: reponseBrute,
    ligne_ecrite: stored,
    meta_bouche: {
      member_id: memberId,
      second_member: secondMember,
      user_id: me.userId,
      email: EMAIL,
      first_name: tir.firstName,
      birth_date: tir.birthDate,
      goal: tir.goal,
      pace: tir.pace,
      weight_kg: tir.weightKg,
      height_cm: tir.heightCm,
      appetite: tir.appetite,
      rhythm: tir.rhythm,
      fixed_intakes: tir.fixedIntakes,
      allergie: tir.allergie,
    },
  }, null, 2),
);
console.log(`\n   sortie écrite : ${fichier}`);
console.log(
  `   ⛔ AUCUNE RELANCE AUTOMATIQUE. Si ce tir a échoué, il reste échoué ; ` +
    `c'est le plan du chantier qui l'exige.`,
);
Deno.exit(res.status === 200 ? 0 : 1);
