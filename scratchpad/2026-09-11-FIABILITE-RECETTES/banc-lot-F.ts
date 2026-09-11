/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ② — LE BANC D'INTÉGRATION SANS DÉPENSE MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts
 *
 * Ce qu'il fait, dans l'ordre :
 *
 *   ① lit `supabase/.env` (la MÊME configuration que `functions serve`) ;
 *   ② installe l'adaptateur fournisseur contrôlé (`transport-lot-F.ts`) ;
 *   ③ importe le VRAI handler — `Deno.serve` est capturé, aucun port ouvert ;
 *   ④ provisionne un compte de fixture `lotf.*@keeltest.dev` par les RPC DU
 *      PRODUIT (profil, objectif, coach maison, corps de la bouche) ;
 *   ⑤ appelle le handler avec un vrai jeton, corps `{intent, window}` ;
 *   ⑥ relit la ligne écrite et l'ÉCRIT en fixture, pour que les lecteurs
 *      API/UI la relisent (vitest, `relecture-lot-F.int.test.ts`).
 *
 * ⛔ AUCUNE SUPPRESSION. Le banc ne purge rien : il emploie un compte par cas
 * et une fenêtre qui ne chevauche pas. Les deux plans de la campagne
 * (`1f8a8988`, `1eada05b`) ne sont NI lus en écriture NI touchés.
 *
 * ⛔ AUCUNE DÉPENSE. Toute sortie réseau hors pile locale jette (voir la garde
 * de `installControlledTransport`). Le compte des appels fournigneurs est
 * publié à la fin, par nature.
 */
import {
  cannedFromFixtures,
  captureServeHandler,
  installControlledTransport,
  loadDotEnv,
  retaillerReponse,
} from "./transport-lot-F.ts";

// ⚠️ `pathname` rend un chemin PERCENT-ENCODÉ : ce dépôt s'appelle « Sophia 2 »
// et l'espace y devient `%20`. Sans ce décodage, chaque lecture échoue en
// silence (`loadDotEnv` rend `{}`) et le banc se croit sans pile.
const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;
const SORTIE = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F`;

// ── ① L'ENVIRONNEMENT ─────────────────────────────────────────────────────
const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
// ⛔ LA CLÉ RÉELLE EST REMPLACÉE PAR UNE SENTINELLE. L'adaptateur intercepte
// déjà `api.openai.com` ; la sentinelle est la SECONDE ceinture : si un jour un
// chemin sortait sans passer par `fetch` interceptable, il échouerait sur une
// authentification refusée au lieu de facturer.
Deno.env.set("OPENAI_API_KEY", "sk-lotf-transport-controle-aucune-depense");
Deno.env.set("GEMINI_API_KEY", "lotf-transport-controle-aucune-depense");
// ⛔ ET PAS DE STUB DE DISPONIBILITÉ : on veut la VRAIE branche fournisseur.
Deno.env.set("MEGA_TEST_MODE", "0");

const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!API || !ANON || !SVC) {
  console.error("⛔ pile locale absente de supabase/.env");
  Deno.exit(2);
}
const LOCAL_HOST = new URL(API).hostname;

// ── LE CAS À REJOUER ──────────────────────────────────────────────────────
const CAS = (Deno.args.find((a) => !a.startsWith("--")) ?? "perte").toLowerCase();
const CAS_DEF: Record<string, {
  requestId: string;
  email: string;
  fullName: string;
  firstName: string;
  birthDate: string;
  goal: string;
  targetWeight: number;
  pace: number;
  heightCm: number;
  weightKg: number;
}> = {
  perte: {
    requestId: "f5a3dd19-d47d-4f52-9678-536f2cfb3bc5",
    email: "lotf.perte@keeltest.dev",
    fullName: "Paul LotF",
    firstName: "Paul",
    birthDate: "1990-03-14",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
  },
  gain: {
    requestId: "ecaf04b2-354e-460f-b6c5-df81b54c5640",
    email: "lotf.gain@keeltest.dev",
    fullName: "Max LotF",
    firstName: "Max",
    birthDate: "1998-07-02",
    goal: "muscle_gain",
    targetWeight: 70,
    pace: 0.25,
    heightCm: 178,
    weightKg: 62,
  },
};
const cas = CAS_DEF[CAS];
if (!cas) {
  console.error(`⛔ cas inconnu : ${CAS} (perte | gain)`);
  Deno.exit(2);
}
// ⚠️ UN COMPTE PAR TIR, ET C'EST LA SEULE FAÇON DE NE RIEN SUPPRIMER.
// `intent: prepare_next` chaîne la fenêtre suivante après le dernier plan posé :
// un second tir sur le même compte tomberait sur d'autres NOMS DE JOUR que ceux
// de la réponse archivée. Le suffixe donne un compte neuf, et aucun `DELETE`
// n'est nécessaire.
const SUFFIXE = (Deno.args.find((a) => a.startsWith("--compte="))?.slice(9) ?? "").trim();
const EMAIL = SUFFIXE ? cas.email.replace("@", `.${SUFFIXE}@`) : cas.email;

// ── LA TRACE COMPLÈTE DU HANDLER, CAPTURÉE ────────────────────────────────
// Les compteurs du moteur (`keel.household_meal.*`, `final_gate`) sortent au
// journal et nulle part ailleurs. Sans capture, le tableau demandé par le plan
// (« contrôles », « coût ») n'a pas de source.
const journal: string[] = [];
const vraiLog = console.log.bind(console);
const vraiWarn = console.warn.bind(console);
const vraiErr = console.error.bind(console);
const capture = (sortie: (...a: unknown[]) => void) => (...a: unknown[]) => {
  journal.push(
    a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "),
  );
  sortie(...a);
};
console.log = capture(vraiLog);
console.warn = capture(vraiWarn);
console.error = capture(vraiErr);

// ── ② L'ADAPTATEUR, AVANT TOUT IMPORT DU HANDLER ──────────────────────────
const canned = cannedFromFixtures(FIXTURES, cas.requestId);
// ⚠️ LE RETAILLAGE EST OPTIONNEL ET IL SE DIT. Sans `--retaille`, le banc envoie
// la réponse archivée TELLE QUELLE — c'est le tir qui a montré le 422
// `mouth_unfed` et prouvé que la grille du soir n'est pas celle de 15 h.
const RETAILLE = Deno.args.includes("--retaille");
let retaillage: { dishesBefore: number; dishesAfter: number; moved: string[] } | null = null;
let compositionText = canned.composition.outputText;
if (RETAILLE) {
  const out = retaillerReponse(compositionText, {
    dropDays: ["fri"],
    moveCookingTo: "sat",
  });
  compositionText = out.text;
  retaillage = out;
}
const transport = installControlledTransport({
  compositionModel: "gpt-5.6-luna",
  composition: { ...canned.composition, outputText: compositionText },
  fill: canned.fill,
  passThroughHosts: [LOCAL_HOST],
});

// ── ③ LE HANDLER, CAPTURÉ SANS OUVRIR DE PORT ─────────────────────────────
const serve = captureServeHandler();
await import(`${ROOT}supabase/functions/generate-household-meal-v1/index.ts`);
const handler = await serve.handlerPromise;
serve.restore();

// ── LES APPELS À LA PILE, PAR LE VRAI RÉSEAU ──────────────────────────────
// (`transport` les laisse passer ; c'est l'hôte local.)
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
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

async function account(email: string) {
  const existing = await signIn(email);
  if (existing) return existing;
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
      user_metadata: { fixture: "LOT-F" },
    }),
  });
  if (!res.ok) throw new Error(`création ${email} → ${res.status} ${await res.text()}`);
  const fresh = await signIn(email);
  if (!fresh) throw new Error(`${email} créé mais non connectable`);
  return fresh;
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
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return text;
}

// ── ④ LE PROVISIONNEMENT, PAR LES RPC DU PRODUIT ──────────────────────────
console.log(`── LOT F ② · cas ${CAS.toUpperCase()} · ${EMAIL} ────────────────`);
console.log(
  retaillage
    ? `   réponse archivée RETAILLÉE : ${retaillage.dishesBefore} → ${retaillage.dishesAfter} plats ` +
      `(vendredi retiré, cuisson ${retaillage.moved.join("+")} déplacée au samedi)`
    : `   réponse archivée TELLE QUELLE (7 plats)`,
);
const me = await account(EMAIL);
console.log(`   compte : ${me.userId}`);

await post("profiles?on_conflict=id", {
  id: me.userId,
  full_name: cas.fullName,
  birth_date: cas.birthDate,
  gender: "male",
  locale: "fr-FR",
  country: "FR",
  timezone: "Europe/Paris",
  height_cm: cas.heightCm,
  day_activity: "seated",
  activity_level: "trains_some",
  sport_frequency: "3_4",
  onboarding_completed: true,
}, "resolution=merge-duplicates,return=minimal");

await post("student_goals?on_conflict=user_id", {
  user_id: me.userId,
  goal: cas.goal,
  content_locale: "fr-FR",
  target_weight_kg: cas.targetWeight,
  target_pace_kg_per_week: cas.pace,
}, "resolution=merge-duplicates,return=minimal");

const coach = await rpc(me.token, "keel_join_house_coach", { p_country: "FR" });
console.log(`   coach maison : ${JSON.stringify(coach.body)}`);

// La pesée — sans elle l'entretien est ESTIMÉ et la cible change.
await post("student_body_measures", {
  user_id: me.userId,
  kind: "weight",
  value_si: cas.weightKg,
  source: "setup",
  local_date: new Date().toISOString().slice(0, 10),
  measured_at: new Date().toISOString(),
}, "return=minimal");

const roster = await rpc(me.token, "keel_household_roster");
const rows = Array.isArray(roster.body) ? roster.body as Record<string, unknown>[] : [];
const mine = rows.find((r) => String(r.user_id ?? "") === me.userId);
if (!mine) throw new Error(`aucune bouche titulaire : ${JSON.stringify(roster.body)}`);
const memberId = String(mine.member_id);
for (
  const [name, args] of [
    ["keel_household_set_member_name", { p_member: memberId, p_first_name: cas.firstName }],
    ["keel_household_set_member_birth_date", { p_member: memberId, p_birth_date: cas.birthDate }],
    ["keel_household_set_member_body", {
      p_member: memberId,
      p_height_cm: cas.heightCm,
      p_weight_kg: cas.weightKg,
      p_gender: "male",
      p_activity_level: "trains_some",
      p_day_activity: "seated",
      p_sport_frequency: "3_4",
      p_activity_axes_asked: true,
      p_appetite: "average",
      p_appetite_asked: true,
    }],
  ] as const
) {
  const out = await rpc(me.token, name, args as Record<string, unknown>);
  const b = out.body as Record<string, unknown>;
  if (b?.ok !== true) throw new Error(`${name} → ${JSON.stringify(b)}`);
}
console.log(`   bouche : ${memberId}`);

// ── LE FOYER DE DEUX — UNE SECONDE BOUCHE, SANS COMPTE ────────────────────
//
// ⚠️ « Une personne gouverne le menu ; une bouche n'a pas besoin d'un compte. »
// `--duo` ajoute donc une BOUCHE (`keel_household_add_member`), pas un second
// compte : c'est la forme que le produit sert, et celle que le plan demande au
// tir n° 6 (« deux personnes aux besoins différents, préparation partagée »).
const DUO = Deno.args.includes("--duo");
let secondMember = "";
if (DUO) {
  const dejaLa = rows.find((r) => String(r.first_name ?? "") === "Lea");
  if (dejaLa) {
    secondMember = String(dejaLa.member_id);
  } else {
    const add = await rpc(me.token, "keel_household_add_member", {
      p_first_name: "Lea",
      p_birth_date: "1994-04-04",
    });
    const encore = await rpc(me.token, "keel_household_roster");
    const rows2 = Array.isArray(encore.body) ? encore.body as Record<string, unknown>[] : [];
    const nouvelle = rows2.find((r) => String(r.first_name ?? "") === "Lea");
    if (!nouvelle) throw new Error(`add_member → ${JSON.stringify(add.body)}`);
    secondMember = String(nouvelle.member_id);
  }
  // ⛔ UN CORPS DIFFÉRENT, ET C'EST LE POINT DU TIR : deux besoins qui ne se
  // confondent pas dans la même casserole. 164 cm / 58 kg / femme / sédentaire
  // contre 178 cm / 88 kg / homme qui s'entraîne.
  const corps = await rpc(me.token, "keel_household_set_member_body", {
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
  const cb = corps.body as Record<string, unknown>;
  if (cb?.ok !== true) throw new Error(`corps de la 2e bouche → ${JSON.stringify(cb)}`);
  console.log(`   2e bouche : ${secondMember} (Lea · 164 cm · 58 kg · appétit small)`);
}

// ── LE COMPTE SECONDAIRE RESTE REFUSÉ À LA GÉNÉRATION ─────────────────────
//
// Le plan ③ l'exige en toutes lettres. On le mesure AVANT le tir nominal, pour
// que le refus porte sur un foyer réel et pas sur un foyer vide.
let refusSecondaire: { status: number; error: string } | null = null;
if (Deno.args.includes("--secondaire")) {
  const invite = await rpc(me.token, "keel_household_invite", {
    p_email: EMAIL.replace("@", ".second@"),
    p_member: secondMember || memberId,
  });
  const inv = invite.body as Record<string, unknown>;
  const second = await account(EMAIL.replace("@", ".second@"));
  await post("profiles?on_conflict=id", { id: second.userId, country: "FR" },
    "resolution=merge-duplicates,return=minimal");
  if (inv?.ok === true) {
    await rpc(second.token, "keel_household_join", {
      p_token: String(inv.token),
      p_country: "FR",
    });
  }
  const r = await handler(new Request("http://localhost/generate-household-meal-v1", {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${second.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: 3 } }),
  }));
  const rb = await r.json().catch(() => ({} as Record<string, unknown>));
  refusSecondaire = { status: r.status, error: String((rb as Record<string, unknown>).error ?? "") };
  console.log(
    `   compte secondaire → ${refusSecondaire.status} « ${refusSecondaire.error} »`,
  );
}

// ── ⑤ L'APPEL — LE VRAI HANDLER, LA VRAIE BASE, LE TRANSPORT CONTRÔLÉ ─────
const t0 = performance.now();
const req = new Request("http://localhost/generate-household-meal-v1", {
  method: "POST",
  headers: {
    apikey: ANON,
    authorization: `Bearer ${me.token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: 3 } }),
});
const res = await handler(req);
const ms = Math.round(performance.now() - t0);
const body = await res.json().catch(() => ({} as Record<string, unknown>));
transport.restore();

console.log(`\n── RÉPONSE ───────────────────────────────────────────────`);
console.log(`   statut     ${res.status}`);
console.log(`   durée      ${ms} ms  (hors appel fournisseur réel)`);
console.log(`   appels fournisseur interceptés : ${transport.calls.length}`);
for (const c of transport.calls) {
  console.log(`     · ${c.matched}  modèle=${c.model}  corps=${c.bodyBytes} o  à +${c.atMs} ms`);
}
console.log(`   sorties réseau REFUSÉES : ${transport.refused.length}`);
if (res.status !== 200) {
  console.log(`   corps : ${JSON.stringify(body).slice(0, 4000)}`);
}

// ── ⑥ LA LIGNE ÉCRITE, RELUE ET FIXÉE ─────────────────────────────────────
const meal = (body as Record<string, unknown>)?.meal as Record<string, unknown> | undefined;
const mealId = String(meal?.id ?? "");
let stored: Record<string, unknown> | null = null;
if (mealId) {
  const r = await fetch(
    `${API}/rest/v1/student_generated_meals?id=eq.${mealId}&select=*`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const list = await r.json() as Record<string, unknown>[];
  stored = list[0] ?? null;
}
try {
  Deno.mkdirSync(SORTIE, { recursive: true });
} catch { /* déjà là */ }
const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
const fichier = `${SORTIE}/${CAS}${SUFFIXE ? "-" + SUFFIXE : ""}-${horodatage}.json`;
Deno.writeTextFileSync(
  fichier,
  JSON.stringify({
    cas: CAS,
    lance_le: new Date().toISOString(),
    duree_ms: ms,
    statut: res.status,
    reponse: body,
    appels_fournisseur: transport.calls,
    sorties_refusees: transport.refused,
    ligne_ecrite: stored,
    retaillage,
    // Les FAITS de la bouche, tels que le banc les a POSÉS par les RPC du
    // produit. L'analyseur en fabrique le contexte de mesure ; sans eux il
    // devrait les deviner, et deviner un corps fausse toute la grille.
    refus_secondaire: refusSecondaire,
    second_member: secondMember,
    meta_bouche: {
      member_id: memberId,
      user_id: me.userId,
      email: EMAIL,
      first_name: cas.firstName,
      birth_date: cas.birthDate,
      goal: cas.goal,
      pace: cas.pace,
      weight_kg: cas.weightKg,
      height_cm: cas.heightCm,
    },
    journal,
  }, null, 2),
);
console.log(`\n   fixture écrite : ${fichier}`);
console.log(`   plan : ${mealId || "(aucun)"}`);
Deno.exit(res.status === 200 ? 0 : 1);
