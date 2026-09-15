/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ⑤ — LA PETITE CAMPAGNE RÉELLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts <1..10>
 *
 * ⛔ CELUI-CI DÉPENSE. Il n'y a AUCUN adaptateur : la requête part sur
 * `${SUPABASE_URL}/functions/v1/generate-household-meal-v1`, donc par KONG et
 * par le `functions serve` de l'humain, et le modèle est appelé pour de vrai.
 * Dix tirs au maximum, **un par lancement**, jamais en boucle silencieuse
 * d'échec. Un orchestrateur externe peut enchaîner dix processus distincts.
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
// ⟳ 2026-09-11 · C0 ① — LA FENÊTRE ATTENDUE EST DÉRIVÉE PAR LES FONCTIONS DU
// PRODUIT, AVANT L'APPEL. La campagne annonçait « 9 si avant midi, sinon 6 »,
// une règle recopiée à la main dans ce fichier. Elle était juste ce soir-là et
// elle ne l'est pas en général : elle ignore l'heure des repas déclarés et le
// délai d'achat. On appelle les vraies fonctions, on n'en recopie aucune.
import {
  cookingAskedToday,
  slotsUnservableToday,
} from "../../supabase/functions/_shared/keel/plan_hours.ts";
import { withoutSpentFirstDay } from "../../supabase/functions/_shared/keel/meal_plan_window.ts";
import { classerAppels } from "../../scripts/2026-09-11-mesure-grille.ts";
import {
  type EatingOccasion,
  // ⛔ LE PARSEUR DU MOTEUR, importé et pas recopié : la relecture de la
  // source doit appliquer la MÊME lecture que `index.ts:2555`.
  parseEatingRhythm,
} from "../../supabase/functions/_shared/keel/meal_generation.ts";
import { parseMemberLight } from "../../supabase/functions/_shared/keel/household_habits.ts";

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
  readonly goal: "fat_loss" | "muscle_gain" | "maintenance";
  readonly targetWeight: number | null;
  readonly pace: number | null;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly birthDate: string;
  readonly firstName: string;
  readonly appetite: "small" | "average" | "large";
  readonly duo: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 3B — LES BOUCHES DE PLUS, DÉCRITES UNE PAR UNE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ `duo: boolean` NE SUFFISAIT PLUS. Le plan de bêta réclame six profils,
   * dont un **N=2 végane/omnivore avec variante NÉCESSAIRE** et un **N=4 à
   * présences variables**. Un drapeau à deux valeurs ne sait décrire ni un
   * régime, ni une absence, ni une quatrième personne.
   *
   * ⚠️ `duo` SURVIT ET GOUVERNE TOUJOURS SA PROPRE BOUCHE, à l'octet près:
   * les tirs 1 à 6 d'origine ne bougent pas. `mouths` s'ajoute à côté, et
   * `[]` rend le comportement d'avant.
   */
  readonly mouths: readonly {
    readonly firstName: string;
    readonly birthDate: string;
    readonly heightCm: number;
    readonly weightKg: number;
    readonly gender: "male" | "female";
    readonly appetite: "small" | "average" | "large";
    /** `null` = aucun objectif déclaré pour cette bouche. */
    readonly goal: "fat_loss" | "muscle_gain" | "maintenance" | null;
    /** `null` = rien de déclaré. C'est CE champ qui crée une variante nécessaire. */
    readonly regime: "vegan" | "vegetarian" | "pescatarian" | "gluten_free" | null;
    readonly allergie: string | null;
    /** Les jours où cette bouche mange DEHORS. `[]` = elle est là tous les jours. */
    readonly away: readonly string[];
  }[];
  /** Un rythme déclaré, avec ses tailles de repas. `null` = la maison. */
  readonly rhythm: { slot: string; size?: string }[] | null;
  /** Les vrais repas légers, écrits dans `household_member_habits.slots`. */
  readonly lightSlots: readonly string[];
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
    mouths: [],
    rhythm: null,
    lightSlots: [],
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
    mouths: [],
    rhythm: null,
    lightSlots: [],
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
    mouths: [],
    rhythm: null,
    lightSlots: [],
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
    mouths: [],
    rhythm: null,
    lightSlots: [],
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
    mouths: [],
    // ⛔ « repas léger » EST UNE DÉCLARATION DE RYTHME, pas un réglage caché :
    // `size: "small"` sur le déjeuner. Les trois moments restent déclarés —
    // retirer un moment serait un AUTRE cas (le rythme partiel).
    rhythm: [
      { slot: "breakfast", size: "medium" },
      { slot: "lunch", size: "small" },
      { slot: "dinner", size: "medium" },
    ],
    lightSlots: [],
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
    mouths: [],
    rhythm: null,
    lightSlots: [],
    fixedIntakes: null,
    // ⛔ UNE ALLERGIE ÉCRITE EN BASE PAR LA RPC DU PRODUIT, sur la SECONDE
    // bouche. Sans elle, « zéro violation » veut dire « on ne l'a pas
    // essayé » — la faute nommée par le lot 0.
    allergie: "arachide",
  },
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 3B — LES TROIS PROFILS QUE LE PLAN RÉCLAME ET QUI
  //                N'EXISTAIENT PAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LES SIX TIRS D'ORIGINE SONT CINQ FOIS N=1 ET UNE FOIS N=2-AVEC-ALLERGIE.
  // Le plan de bêta en demande six autres: « N=1 maintien », « N=2
  // végane/omnivore avec variante alimentaire NÉCESSAIRE », « N=2 objectifs et
  // portions différents, préparations communes et complément nécessaire » et
  // « N=4 présences variables, recettes partagées et variantes ». Trois
  // n'existaient pas, et les mesurer sur les six anciens aurait donné un taux
  // sur une population que le plan ne décrit pas.
  //
  // ⚠️ LES SIX D'ORIGINE NE BOUGENT PAS D'UN CARACTÈRE. Ceux-ci s'ajoutent sous
  // les clés 7, 8 et 9: une campagne qui relance « 1 » obtient exactement ce
  // qu'elle obtenait hier.
  "7": {
    n: 7,
    titre: "MAINTIEN · une personne · appétit petit et dîner léger déclarés",
    // Le titulaire porte réellement le maintien. `target_pace` doit alors être
    // nul : la contrainte de base réserve une allure aux deux directions.
    goal: "maintenance",
    targetWeight: 86,
    pace: null,
    heightCm: 172,
    weightKg: 86,
    birthDate: "1988-07-02",
    firstName: "Paul",
    appetite: "small",
    duo: false,
    mouths: [],
    rhythm: [
      { slot: "breakfast" },
      { slot: "lunch" },
      { slot: "dinner" },
    ],
    // `light` n'est PAS une taille de rythme. C'est le bouton « repas léger »
    // de la bouche, conservé dans `household_member_habits.slots`.
    lightSlots: ["dinner"],
    fixedIntakes: null,
    allergie: null,
  },
  "8": {
    n: 8,
    titre:
      "DEUX BOUCHES · VÉGANE + OMNIVORE · la variante alimentaire est NÉCESSAIRE",
    goal: "muscle_gain",
    targetWeight: 72,
    pace: 0.25,
    heightCm: 178,
    weightKg: 68,
    birthDate: "1992-05-09",
    firstName: "Max",
    appetite: "large",
    duo: false,
    // ⛔ LE RÉGIME EST SUR LA SECONDE BOUCHE, ET C'EST LUI LE SUJET. La base
    // partagée descend au plus strict (végane); l'omnivore diverge par sa
    // direction de service, et c'est le chemin que le lot 1 a réécrit sans
    // jamais pouvoir l'éprouver en réel.
    mouths: [{
      firstName: "Lea",
      birthDate: "1994-04-04",
      heightCm: 164,
      weightKg: 58,
      gender: "female",
      appetite: "average",
      goal: "maintenance",
      regime: "vegan",
      allergie: null,
      away: [],
    }],
    rhythm: null,
    lightSlots: [],
    fixedIntakes: null,
    allergie: null,
  },
  "9": {
    n: 9,
    titre:
      "QUATRE BOUCHES · présences variables · recettes partagées et variantes",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "average",
    duo: false,
    mouths: [
      {
        firstName: "Lea",
        birthDate: "1994-04-04",
        heightCm: 164,
        weightKg: 58,
        gender: "female",
        appetite: "small",
        goal: "fat_loss",
        regime: "vegan",
        allergie: "arachide",
        away: [],
      },
      {
        firstName: "Nils",
        birthDate: "1996-11-21",
        heightCm: 186,
        weightKg: 74,
        gender: "male",
        appetite: "large",
        goal: "muscle_gain",
        regime: null,
        allergie: null,
        // ⛔ UNE ABSENCE RÉELLE, ÉCRITE PAR LA RPC DU PRODUIT. « Présences
        // variables » sans personne d'absent est un décor qui ne prouve rien.
        away: ["tue"],
      },
      {
        firstName: "Iris",
        birthDate: "2014-02-17",
        heightCm: 140,
        weightKg: 34,
        gender: "female",
        appetite: "average",
        // ⚠️ UNE MINEURE, ET SANS OBJECTIF: c'est le produit qui décide pour
        // elle (maintien pédiatrique), et son corps ne doit jamais être énoncé.
        goal: null,
        regime: null,
        allergie: null,
        away: [],
      },
    ],
    rhythm: null,
    lightSlots: [],
    fixedIntakes: null,
    allergie: null,
  },
  "10": {
    n: 10,
    titre:
      "DEUX BOUCHES · PERTE + PRISE · préparations communes, objectifs et portions différents",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
    birthDate: "1990-03-14",
    firstName: "Paul",
    appetite: "average",
    duo: false,
    mouths: [{
      firstName: "Lea",
      birthDate: "1994-04-04",
      heightCm: 164,
      weightKg: 58,
      gender: "female",
      appetite: "large",
      goal: "muscle_gain",
      regime: null,
      allergie: null,
      away: [],
    }],
    rhythm: null,
    lightSlots: [],
    fixedIntakes: null,
    allergie: null,
  },
};

const ARG = Deno.args.find((a) => !a.startsWith("--")) ?? "";
const tir = TIRS[ARG];
if (!tir) {
  console.error(`⛔ usage : campagne-lot-F.ts <1..10>  (reçu « ${ARG} »)`);
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
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C6 — `--compte=<suffixe>` : UNE FIXTURE PAR CAMPAGNE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CE DRAPEAU FERME, ET IL AURAIT FAUSSÉ LA CAMPAGNE ENTIÈRE.
// Sans suffixe, ce script vise `lotf.camp<N>@keeltest.dev` — c'est-à-dire
// EXACTEMENT le compte que la campagne du 2026-09-11 a déjà rempli. Or
// `intent: prepare_next` CHAÎNE la fenêtre après le dernier plan posé : un
// second tir sur le même compte demanderait d'autres jours, donc d'autres
// cases, et les deux campagnes ne seraient plus comparables. Le remède
// interdit est le `DELETE` large que C0 a retiré de ce fichier ; le remède
// permis est un compte neuf.
//
// ⚠️ LE SUFFIXE ENTRE AUSSI DANS LE NOM DU FICHIER DE SORTIE : deux campagnes
// qui écriraient `campagne-tir1-*.json` dans le même dossier se liraient comme
// une seule.
const SUFFIXE = (Deno.args.find((a) => a.startsWith("--compte="))?.slice(9) ?? "").trim();
/** ⟳ 2026-09-15 — composer un APERÇU (adoptable) plutôt qu'écrire un plan. */
const BROUILLON = Deno.args.includes("--brouillon");
const EMAIL = SUFFIXE
  ? `lotf.camp${tir.n}.${SUFFIXE}@keeltest.dev`
  : `lotf.camp${tir.n}@keeltest.dev`;
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
if (tir.lightSlots.length > 0) {
  await poser("keel_household_set_member_habits", {
    p_member: memberId,
    p_slots: tir.lightSlots.map((slot) => ({
      slot,
      kind: "household_dish",
      usual: "",
      light: true,
    })),
    p_note: null,
  });
  console.log(
    `   repas légers  ${JSON.stringify(tir.lightSlots)} ` +
      `(keel_household_set_member_habits)`,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · LOT 3 ① — ON RELIT LA SOURCE QUE LE MOTEUR LIT VRAIMENT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CE BLOC FERME, ET IL A COÛTÉ LE TIR 5 DEUX FOIS. `poser()`
// n'exige que `ok: true` — c'est-à-dire « la porte a accepté », jamais « le
// moteur le lira ». Mesuré le 2026-09-11 : l'apport fixe partait dans
// `household_members.fixed_intakes` pendant que
// `student_goals.practical_constraints.fixed_intakes` valait `[]`, la cible du
// petit-déjeuner sortait à 613,50 kcal — exactement celle d'un tir SANS apport
// fixe — et rien ne le disait. La revue du 2026-09-12 le redit : « repas léger
// [...] toujours mal configuré dans la campagne réelle ».
//
// ⛔ ON NE RELIT PAS LA COLONNE OÙ ON A ÉCRIT. On relit :
//   · `keel_household_roster_for` pour le rythme — c'est la fonction que le
//     handler appelle (`index.ts:2555`), et elle arbitre elle-même entre la
//     colonne d'une bouche sans compte et le « about you » d'un titulaire ;
//   · `student_goals.practical_constraints.fixed_intakes` pour l'apport fixe —
//     c'est la source canonique d'un titulaire (`household_fixed_intakes.ts`),
//     et le lecteur JOURNALISE `fixed_intakes_legacy_column` quand il doit se
//     rabattre sur l'autre.
//
// ⛔ ET ON S'ARRÊTE. Un tir dont la déclaration n'est pas arrivée mesure un
// scénario qui n'est pas celui qu'on annonce. « Ne pas relancer dans le vide. »
if (tir.rhythm || tir.fixedIntakes || tir.lightSlots.length > 0) {
  const echecs: string[] = [];
  if (tir.rhythm) {
    // ⛔ LE JETON DU SERVICE, ET C'EST LA SEULE CLÉ QUI MARCHE ICI.
    // `keel_household_roster_for(p_user)` prend un identifiant d'utilisateur
    // ARBITRAIRE : elle n'est accordée qu'à `postgres` et `service_role`, et
    // c'est juste — un compte authentifié ne doit pas pouvoir lire le foyer
    // d'un autre. (La variante du produit pour SOI est `keel_household_roster`,
    // accordée à `authenticated`.) Mesuré le 2026-09-12 : appelée avec le jeton
    // de la personne, elle rend **403 permission denied**.
    const vu = await rpc(SVC, "keel_household_roster_for", { p_user: me.userId });
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ UNE LECTURE QUI ÉCHOUE NE DIT PAS « LA DÉCLARATION EST ABSENTE »
    // ══════════════════════════════════════════════════════════════════════
    //
    // C'est la faute que cette garde a commise le 2026-09-12, sur elle-même :
    // le 403 ci-dessus est tombé dans `Array.isArray(body) ? … : []`, le `[]` a
    // été lu comme « aucun moment déclaré », et le tir 5 a été arrêté en
    // accusant une écriture qui, elle, était parfaitement arrivée (vérifiée en
    // base et par SQL direct). « Pas mesuré » et « mesuré, et c'est faux » sont
    // deux états, et les confondre fait accuser le produit d'un défaut du banc.
    if (vu.status !== 200 || !Array.isArray(vu.body)) {
      console.error(
        `\n⛔ LA RELECTURE DU RYTHME N'A PAS PU TOURNER — HTTP ${vu.status}.\n` +
          `   ${JSON.stringify(vu.body).slice(0, 300)}\n\n` +
          `   Ce n'est PAS « la déclaration est absente » : c'est « on n'a pas su\n` +
          `   vérifier ». On ne lance pas le tir, et on ne conclut rien sur la base.\n`,
      );
      Deno.exit(4);
    }
    const lignes = vu.body as Record<string, unknown>[];
    const moi = lignes.find((r) => String(r.member_id ?? "") === memberId) ?? null;
    if (moi === null) {
      console.error(
        `\n⛔ LA BOUCHE ${memberId} N'EST PAS DANS LE ROSTER RELU ` +
          `(${lignes.length} ligne(s)). On ne lance pas le tir.\n`,
      );
      Deno.exit(4);
    }
    // ⛔ LE PARSEUR DU MOTEUR, PAS UNE SECONDE LECTURE. `parseEatingRhythm` est
    // ce que `index.ts` applique à cette même valeur ; relire le JSON à la main
    // ici ferait un second avis, et c'est le second avis qui ment.
    const lu = parseEatingRhythm(moi?.eating_rhythm ?? null);
    for (const attendu of tir.rhythm) {
      const trouve = lu.find((s) => String(s.slot) === attendu.slot) ?? null;
      if (trouve === null) {
        echecs.push(`rythme : le moment « ${attendu.slot} » n'est pas relu par le roster`);
        continue;
      }
      // ⚠️ LA TAILLE EST LE CŒUR DU TIR 5. Un moment relu SANS sa taille rend
      // un « repas léger » qui n'est léger nulle part — le scénario annoncé
      // n'est alors pas celui qui tourne.
      if ((attendu.size ?? null) !== (trouve.size ?? null)) {
        echecs.push(
          `rythme : « ${attendu.slot} » déclaré en taille ${
            JSON.stringify(attendu.size ?? null)
          }, relu en ${JSON.stringify(trouve.size ?? null)}`,
        );
      }
    }
    console.log(`   relecture rythme        ${JSON.stringify(lu)} (keel_household_roster_for)`);
  }
  if (tir.fixedIntakes) {
    const r = await fetch(
      `${API}/rest/v1/student_goals?user_id=eq.${me.userId}&select=practical_constraints`,
      { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
    );
    // ⛔ MÊME RÈGLE QU'AU-DESSUS : un échec de lecture n'accuse personne.
    if (!r.ok) {
      console.error(
        `\n⛔ LA RELECTURE DE L'APPORT FIXE N'A PAS PU TOURNER — HTTP ${r.status}.\n` +
          `   « pas mesuré » n'est pas « absent ». On ne lance pas le tir.\n`,
      );
      Deno.exit(4);
    }
    const lignes = await r.json().catch(() => []) as Record<string, unknown>[];
    if (lignes.length === 0) {
      console.error(
        `\n⛔ AUCUNE LIGNE \`student_goals\` pour ce compte : la source canonique\n` +
          `   d'un titulaire n'existe pas encore. On ne lance pas le tir.\n`,
      );
      Deno.exit(4);
    }
    const pc = (lignes[0]?.practical_constraints ?? {}) as Record<string, unknown>;
    const lu = Array.isArray(pc.fixed_intakes) ? pc.fixed_intakes as Record<string, unknown>[] : [];
    for (const attendu of tir.fixedIntakes) {
      const trouve = lu.find((x) =>
        String(x.food_ref ?? "") === attendu.food_ref && String(x.slot ?? "") === attendu.slot
      ) ?? null;
      if (trouve === null) {
        echecs.push(
          `apport fixe : ${attendu.amount} ${attendu.unit} de « ${attendu.food_ref} » au ` +
            `${attendu.slot} absent de student_goals.practical_constraints.fixed_intakes ` +
            `(la source qu'un TITULAIRE fait lire)`,
        );
        continue;
      }
      if (Number(trouve.amount) !== attendu.amount || String(trouve.unit) !== attendu.unit) {
        echecs.push(
          `apport fixe : ${attendu.food_ref} relu à ${JSON.stringify(trouve.amount)} ` +
            `${JSON.stringify(trouve.unit)} au lieu de ${attendu.amount} ${attendu.unit}`,
        );
      }
    }
    console.log(
      `   relecture apport fixe   ${JSON.stringify(lu)} ` +
        `(student_goals.practical_constraints.fixed_intakes)`,
    );
  }
  if (tir.lightSlots.length > 0) {
    const vu = await rpc(SVC, "keel_household_habits_for", { p_user: me.userId });
    if (vu.status !== 200 || !Array.isArray(vu.body)) {
      console.error(
        `\n⛔ LA RELECTURE DES REPAS LÉGERS N'A PAS PU TOURNER — HTTP ${vu.status}.\n` +
          `   « pas mesuré » n'est pas « absent ». On ne lance pas le tir.\n`,
      );
      Deno.exit(4);
    }
    const lignes = vu.body as Record<string, unknown>[];
    const moi = lignes.find((r) => String(r.member_id ?? "") === memberId) ?? null;
    if (moi === null) {
      echecs.push(`repas léger : la bouche ${memberId} n'est pas relue par les habitudes`);
    } else {
      const lu = parseMemberLight(moi.slots);
      for (const slot of tir.lightSlots) {
        if (lu[slot] !== true) {
          echecs.push(
            `repas léger : « ${slot} » n'est pas relu à true par parseMemberLight`,
          );
        }
      }
      console.log(
        `   relecture léger        ${JSON.stringify(lu)} ` +
          `(keel_household_habits_for + parseMemberLight)`,
      );
    }
  }
  if (echecs.length > 0) {
    console.error(
      `\n⛔ LA DÉCLARATION N'EST PAS ARRIVÉE DANS LA SOURCE QUE LE MOTEUR LIT.\n` +
        echecs.map((l) => `   · ${l}`).join("\n") +
        `\n\n   Ce tir mesurerait un autre scénario que celui qu'il annonce. ` +
        `On ne le lance pas.\n`,
    );
    Deno.exit(3);
  }
  console.log(`   ✅ déclarations relues dans la source du moteur`);
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
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 3B — LES BOUCHES DE PLUS, POSÉES PAR LES RPC DU PRODUIT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ AUCUN `insert` DIRECT. Chaque bouche passe par `keel_household_add_member`,
// `keel_household_set_member_body`, `keel_household_set_member_goal`,
// `keel_household_set_member_diet` et `keel_household_add_allergy` — les mêmes
// portes que l'écran. Une bouche posée en SQL contournerait les gardes qu'on
// est en train de mesurer, et le tir dirait « ça marche » d'un décor que le
// produit ne sait pas fabriquer.
//
// ⚠️ IDEMPOTENT PAR PRÉNOM: une campagne se relance, et recréer la bouche
// ferait grossir le foyer à chaque tir.
for (const m of tir.mouths) {
  const rosterNow = await rpc(me.token, "keel_household_roster");
  const list = Array.isArray(rosterNow.body)
    ? rosterNow.body as Record<string, unknown>[]
    : [];
  let memberId = list.find((r) => String(r.first_name ?? "") === m.firstName)
    ?.member_id as string | undefined;
  if (!memberId) {
    await rpc(me.token, "keel_household_add_member", {
      p_first_name: m.firstName,
      p_birth_date: m.birthDate,
    });
    const again = await rpc(me.token, "keel_household_roster");
    const l2 = Array.isArray(again.body) ? again.body as Record<string, unknown>[] : [];
    memberId = l2.find((r) => String(r.first_name ?? "") === m.firstName)
      ?.member_id as string | undefined;
    if (!memberId) throw new Error(`la bouche « ${m.firstName} » n'a pas été créée`);
  }
  await poser("keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: m.heightCm,
    p_weight_kg: m.weightKg,
    p_gender: m.gender,
    p_activity_level: "sedentary",
    p_day_activity: "seated",
    p_sport_frequency: "none",
    p_activity_axes_asked: true,
    p_appetite: m.appetite,
    p_appetite_asked: true,
  });
  if (m.goal !== null) {
    const g = await rpc(me.token, "keel_household_set_member_goal", {
      p_member: memberId,
      p_goal: m.goal,
    });
    console.log(`   objectif ${m.firstName} → ${m.goal} ${JSON.stringify(g.body)}`);
  }
  if (m.regime !== null) {
    const d = await rpc(me.token, "keel_household_set_member_diet", {
      p_member: memberId,
      p_diet: m.regime,
    });
    console.log(`   régime ${m.firstName} → ${m.regime} ${JSON.stringify(d.body)}`);
  }
  if (m.allergie !== null) {
    const a = await rpc(me.token, "keel_household_add_allergy", {
      p_member: memberId,
      p_label: m.allergie,
    });
    console.log(`   allergie ${m.firstName} → « ${m.allergie} » ${JSON.stringify(a.body)}`);
  }
  if (m.away.length > 0) {
    // ⚠️ LA FORME EST CELLE DE `parseAwayDays`: `{day}` seul = absent toute la
    // journée. Un jeton hors vocabulaire est ignoré en silence par le parseur,
    // donc on n'invente rien ici.
    const w = await rpc(me.token, "keel_household_set_member_away", {
      p_member: memberId,
      p_away: m.away.map((d) => ({ day: d })),
    });
    console.log(`   absences ${m.firstName} → ${m.away.join(", ")} ${JSON.stringify(w.body)}`);
  }
}

if (tir.allergie && secondMember) {
  const a = await rpc(me.token, "keel_household_add_allergy", {
    p_member: secondMember,
    p_label: tir.allergie,
  });
  console.log(`   allergie      « ${tir.allergie} » sur la 2e bouche → ${JSON.stringify(a.body)}`);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · C0 ① — LA DEMANDE, FIGÉE ET DÉRIVÉE AVANT LE TIR
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUI A CHANGÉ, ET POURQUOI. La version du lot F écrivait
// `const premierJourEntier = heure < 12` — une règle recopiée à la main, juste
// ce soir-là et fausse en général : elle ignore l'heure des repas déclarés
// (`declaredHours`) et le délai d'achat (`SHOPPING_AND_COOKING_LEAD_HOURS`).
// On appelle maintenant `slotsUnservableToday`, `cookingAskedToday` et
// `withoutSpentFirstDay` — les fonctions que le handler appelle lui-même.
//
// ⛔ ET LA GRILLE NE VIENT TOUJOURS PAS DES PLATS : elle est écrite avant que
// le modèle n'existe, et la sortie la porte pour que l'analyseur la relise.
const bouches = (tir.duo ? 2 : 1) + tir.mouths.length;
const REPAS_DE_LA_MAISON: readonly EatingOccasion[] = ["breakfast", "lunch", "dinner"];
const rythmeDuTir: readonly EatingOccasion[] = tir.rhythm
  ? tir.rhythm.map((r) => r.slot as EatingOccasion)
  : REPAS_DE_LA_MAISON;
const heureMaintenant = Number(heureLocale.slice(0, 2));
const passesAujourdhui = slotsUnservableToday({
  hourNow: heureMaintenant,
  rhythm: rythmeDuTir.map((slot) => ({ slot })),
  declaredHours: [],
});
const fenetreAttendue = withoutSpentFirstDay(
  { startsOn: jourLocal, durationDays: 3 },
  {
    today: jourLocal,
    cookOnlyDay: null,
    declaredSlots: rythmeDuTir.map((s) => String(s)),
    passedSlots: passesAujourdhui.passed,
    heldSlots: passesAujourdhui.heldForShopping,
    shoppingCutoffReached: !cookingAskedToday({ hourNow: heureMaintenant }),
  },
);
const JOURS_TOKEN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const joursAttendus: string[] = [];
const jourVersDateAttendu: Record<string, string> = {};
for (let i = 0; i < fenetreAttendue.durationDays; i++) {
  const d = new Date(
    new Date(`${fenetreAttendue.startsOn}T00:00:00Z`).getTime() + i * 86_400_000,
  ).toISOString().slice(0, 10);
  const tok = JOURS_TOKEN[new Date(`${d}T00:00:00Z`).getUTCDay()];
  joursAttendus.push(tok);
  jourVersDateAttendu[tok] = d;
}
const perduesLePremierJour = new Set<string>(
  fenetreAttendue.startsOn === jourLocal
    ? [...passesAujourdhui.passed, ...passesAujourdhui.heldForShopping]
    : [],
);
const grilleParJour = Object.fromEntries(
  joursAttendus.map((j, i) => [
    j,
    rythmeDuTir.filter((s) => i > 0 || !perduesLePremierJour.has(s)).map((s) => String(s)),
  ]),
);
const casesAnnoncees = Object.values(grilleParJour).reduce((n, s) => n + s.length, 0);
console.log(`   fenêtre       3 jours, intent=prepare_next`);
console.log(
  `   CASES ANNONCÉES : ${casesAnnoncees} cases × ${bouches} bouche(s) = ` +
    `${casesAnnoncees * bouches} parts attendues`,
);
console.log(`   grille        ${JSON.stringify(grilleParJour)}`);
console.log(
  `   dérivation    plan_hours.ts + meal_plan_window.ts, appelées à ${heureLocale} : ` +
    `fenêtre de ${fenetreAttendue.durationDays} jour(s) depuis ${fenetreAttendue.startsOn}` +
    (fenetreAttendue.dropped
      ? `, ${fenetreAttendue.dropped} retiré (${fenetreAttendue.cause})`
      : "") +
    (perduesLePremierJour.size > 0
      ? `, premier jour PARTIEL (${[...perduesLePremierJour].join(", ")} hors de portée)`
      : ""),
);
console.log(
  `   ⛔ CE NOMBRE NE VIENT PAS DES PLATS. Une case sans plat restera attendue,` +
    ` et se comptera absente.`,
);
console.log(
  `   ⚠️ L'HORLOGE N'EST PAS INJECTABLE ICI : ce tir part par Kong, dans le` +
    ` processus de \`functions serve\`. Le cas « fenêtre d'après-midi » se prouve` +
    ` au banc ② (\`banc-lot-F.ts --horloge=…\`), pas ici.`,
);

const demandeFigee = {
  source: {
    instant: "harnais_avant_appel (horloge réelle du lancement)",
    fenetre: "plan_hours.ts + meal_plan_window.ts, appelées avant l'appel",
    jours: "dérivés de l'heure du lancement — JAMAIS de la liste des plats",
    slots: "rythme déclaré du tir, sinon les trois repas de la maison",
    bouches: "harnais_avant_appel (posées par les RPC du produit)",
  },
  instant: {
    lance_le: maintenant.toISOString(),
    jour_local: jourLocal,
    heure_locale: heureLocale,
    fuseau: "Europe/Paris",
    horloge_injectee: null,
    decalage_ms: 0,
  },
  fenetre: {
    demandee: { kind: "days", count: 3 },
    cases_annoncees: casesAnnoncees,
    bouches_annoncees: bouches,
    premier_jour_partiel: [...perduesLePremierJour],
    attendue: {
      starts_on: fenetreAttendue.startsOn,
      duration_days: fenetreAttendue.durationDays,
      dropped: fenetreAttendue.dropped,
      cause: fenetreAttendue.cause,
    },
    moments_passes: passesAujourdhui.passed,
    moments_retenus_pour_les_courses: passesAujourdhui.heldForShopping,
  },
  jours: joursAttendus,
  jour_vers_date: jourVersDateAttendu,
  cases_par_bouche: Object.fromEntries(
    [memberId, ...(secondMember ? [secondMember] : [])].map((
      id,
    ) => [id, grilleParJour]),
  ),
  cases_attendues_par_bouche: Object.fromEntries(
    [memberId, ...(secondMember ? [secondMember] : [])].map((id) => [id, casesAnnoncees]),
  ),
  cases_attendues_total: casesAnnoncees * bouches,
  appetit_pose: tir.appetite,
  repas_legers_poses: [...tir.lightSlots],
};

// ── LE TIR ────────────────────────────────────────────────────────────────
console.log(`\n   ⏳ appel réel en cours — modèle facturé, aucune relance automatique…`);
const t0 = Date.now();
let res: Response;
let erreurReseau: string | null = null;
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-15 · BÊTA — L'IDENTIFIANT EST À NOUS, ET IL PART AVANT L'APPEL.
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ MESURÉ LE 2026-09-15 (audit § R5). Le harnais lisait `request_id` DANS LA
// RÉPONSE. Un 546 et un 502 n'en ont pas — et ce sont précisément les deux tirs
// dont il fallait établir l'issue. Leurs deux baux sont restés en base 17 h et
// 6 h sans qu'aucun artefact ne puisse les nommer: l'attribution s'est faite à
// la main, par le compte et la seconde de départ.
//
// `getRequestId` (supabase/functions/_shared/http.ts) lit `x-request-id` et ne
// tire un identifiant que s'il n'en reçoit aucun. Le poser ici rend la demande
// traçable MÊME quand le worker meurt avant d'écrire quoi que ce soit.
const demandeId = crypto.randomUUID();
console.log(`   request_id    ${demandeId} (posé par le harnais, pas lu en réponse)`);
try {
  res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${me.token}`,
      "content-type": "application/json",
      "x-request-id": demandeId,
    },
    // ⟳ 2026-09-15 · BÊTA — `--brouillon` COMPOSE UN APERÇU AU LIEU D'ÉCRIRE.
    //
    // ⛔ MÊME MOTEUR, MÊME PROMPT, MÊME APPEL PAYÉ: c'est le corps que
    // `planDraft.ts::callGenerator` envoie pour le geste « Prévisualiser ».
    // Il existe pour qu'UNE génération serve à prouver l'adoption, le second
    // tap et la péremption d'empreinte — trois preuves pour un appel, au lieu
    // d'une génération par preuve.
    body: JSON.stringify(
      BROUILLON
        ? {
          operation: "compose",
          intent: "draft",
          replaces: null,
          window: { kind: "days", count: 3 },
          context: null,
          cooking_shape: null,
          one_cooking_session: false,
          preferences: null,
        }
        : { intent: "prepare_next", window: { kind: "days", count: 3 } },
    ),
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
// ⚠️ UN APERÇU N'ÉCRIT AUCUNE LIGNE, ET CE N'EST PAS UN ÉCHEC. Son identifiant
// de brouillon est ce qui sert ensuite à l'adopter.
const draftId = String((body as Record<string, unknown>)?.draft_id ?? "");
if (BROUILLON) console.log(`   brouillon     ${draftId || "(aucun)"}`);

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
// ⚠️ LE NÔTRE, PAS CELUI DE LA RÉPONSE. On vérifie quand même qu'ils
// coïncident: une divergence dirait que l'en-tête n'est plus lu par le handler.
const requestId = demandeId;
const requestIdRendu = String((body as Record<string, unknown>)?.request_id ?? "");
if (requestIdRendu && requestIdRendu !== demandeId) {
  console.log(
    `   ⛔ le serveur a rendu un AUTRE identifiant (${requestIdRendu}) :` +
      ` \`x-request-id\` n'est plus lu, la traçabilité est rompue`,
  );
}
let reponseBrute = "";
let etapes: Record<string, unknown> = {};
if (requestId) {
  // ⟳ 2026-09-11 · C0 ④ — TOUTES LES ÉTAPES, PAS SEULEMENT LE PREMIER SUCCÈS.
  //
  // ⛔ « Capturer séparément génération brute, ajustement, CHAQUE réparation,
  // finalisation et payload relu. Les identifiants absents du tir 2 se comptent
  // séparément au premier jet et après réparation ; ne pas attribuer les champs
  // finaux au premier jet. » La version du lot F ne gardait que
  // `reponse_brute` — le premier succès — et jetait les réparations, si bien que
  // « 20 ref sur 43 » était le payload d'APRÈS deux réparations, publié comme la
  // sortie du modèle.
  const rr = await fetch(
    `${API}/rest/v1/llm_raw_response_events?request_id=eq.${requestId}` +
      `&select=source,status,model,user_message,output_text,created_at&order=created_at.asc`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await rr.json().catch(() => []) as Record<string, unknown>[];
  const succes = lignes.filter((l) =>
    String(l.source) === "generate-household-meal-v1" && String(l.status) === "success"
  );
  reponseBrute = String(succes[0]?.output_text ?? "");
  const prompt = lignes.find((l) =>
    String(l.source) === "generate-household-meal-v1" &&
    String(l.status) === "attempt_start"
  );
  const reparations = lignes.filter((l) =>
    String(l.source) !== "generate-household-meal-v1" && String(l.status) === "success"
  );
  etapes = {
    prompt_envoye: prompt?.user_message ?? null,
    premier_jet: reponseBrute || null,
    reparations: reparations.map((l) => ({
      source: l.source,
      model: l.model,
      output_text: l.output_text,
    })),
    prompts_de_reparation: lignes
      .filter((l) =>
        String(l.source) !== "generate-household-meal-v1" &&
        String(l.status) === "attempt_start"
      )
      .map((l) => ({ source: l.source, user_message: l.user_message })),
    // ⟳ 2026-09-12 · LOT 3 — LES APPELS, CLASSÉS PAR L'INSTRUMENT.
    //
    // ⛔ PAS UN COMPTEUR DU MOTEUR. `c4CallsMade` ne compte que la passe
    // finale : le rapport C6 § 5.7 l'a publié comme un total de réparations et
    // a manqué trois appels sur le tir 4. On classe les lignes du FOURNISSEUR,
    // et `classerAppels` est épinglé par un test sur les six archives réelles.
    appels: classerAppels(lignes),
    echanges_resume: lignes.map((l) => ({
      source: l.source,
      status: l.status,
      model: l.model,
      user_message_len: String(l.user_message ?? "").length,
      output_text_len: String(l.output_text ?? "").length,
      created_at: l.created_at,
    })),
  };
  console.log(
    `   premier jet du modèle : ${reponseBrute.length} caractères` +
      `${succes.length > 1 ? ` (${succes.length} succès sur la lane principale, on garde le PREMIER)` : ""}` +
      ` · réparations archivées : ${reparations.length}` +
      ` · prompt : ${prompt ? String(prompt.user_message ?? "").length + " car." : "ABSENT"}`,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-15 · BÊTA — CE QUE LA BASE DIT DE CETTE DEMANDE, APRÈS COUP.
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ OBLIGATOIRE MÊME SUR ERREUR RÉSEAU, 502 OU 546. C'est le bloc qui manquait:
// « HTTP 546 » ne dit pas si le foyer est resté verrouillé, si un brouillon est
// resté en vol, ni combien d'appels modèle ont été payés pour rien. Les trois
// se lisent ici, par `request_id`, sans relancer quoi que ce soit.
//
// ⚠️ LE COÛT SE COMPTE DANS LE REGISTRE (`llm_raw_response_events`), jamais
// dans un compteur en mémoire du worker: un worker mort n'en rend aucun.
async function lire(path: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await fetch(`${API}/rest/v1/${path}`, {
      headers: { apikey: SVC, authorization: `Bearer ${SVC}` },
    });
    const j = await r.json().catch(() => []);
    return Array.isArray(j) ? j as Record<string, unknown>[] : [];
  } catch {
    return [];
  }
}
const verrous = await lire(
  `household_generation_lock?request_id=eq.${requestId}` +
    `&select=household_id,request_id,intent,actor_user_id,started_at`,
);
const brouillons = await lire(
  `student_meal_drafts?request_id=eq.${requestId}` +
    `&select=id,status,error_code,adopted_meal_id,created_at,expires_at`,
);
const registre = await lire(
  `llm_raw_response_events?request_id=eq.${requestId}&select=source,status,created_at`,
);
const appelsParSource: Record<string, number> = {};
for (const l of registre) {
  const cle = `${String(l.source)}:${String(l.status)}`;
  appelsParSource[cle] = (appelsParSource[cle] ?? 0) + 1;
}
const statutDemande = await rpc(me.token, "keel_household_request_status", {
  p_request: requestId,
});
const etatApres = {
  lu_le: new Date().toISOString(),
  request_id: requestId,
  request_id_rendu: requestIdRendu || null,
  verrou_restant: verrous[0] ?? null,
  verrou_age_s: verrous[0]
    ? Math.round((Date.now() - Date.parse(String(verrous[0].started_at))) / 1000)
    : null,
  brouillon: brouillons[0] ?? null,
  statut_rpc: statutDemande.body ?? null,
  appels_registre: appelsParSource,
  appels_registre_total: registre.length,
};
console.log(`\n── ÉTAT APRÈS ────────────────────────────────────────────`);
console.log(
  `   verrou restant  ${
    etatApres.verrou_restant ? `OUI (${etatApres.verrou_age_s} s)` : "non"
  }` +
    ` · brouillon ${String(etatApres.brouillon?.status ?? "aucun")}` +
    ` · statut ${JSON.stringify(etatApres.statut_rpc)}`,
);
console.log(
  `   appels modèle   ${etatApres.appels_registre_total} ` +
    JSON.stringify(appelsParSource),
);

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
const fichier = `${SORTIE}/campagne-tir${tir.n}${SUFFIXE ? "-" + SUFFIXE : ""}-${
  maintenant.toISOString().replace(/[:.]/g, "-")
}.json`;
Deno.writeTextFileSync(
  fichier,
  JSON.stringify({
    cas: tir.goal === "fat_loss"
      ? "perte"
      : tir.goal === "muscle_gain"
      ? "gain"
      : "maintien",
    tir: tir.n,
    titre: tir.titre,
    reel: true,
    lance_le: maintenant.toISOString(),
    jour_local: jourLocal,
    heure_locale: heureLocale,
    cases_annoncees: casesAnnoncees,
    bouches,
    // ⟳ 2026-09-11 · C0 ① — SANS ELLE, `analyse-lot-F.ts` REFUSE DE MESURER.
    demande: demandeFigee,
    duree_ms: ms,
    plafond_heberge_ms: PLAFOND_HEBERGE_MS,
    statut: res.status,
    erreur_reseau: erreurReseau,
    reponse: body,
    // ⟳ 2026-09-15 — l'issue RÉELLE de la demande, lue en base après le tir.
    etat_apres: etatApres,
    brouillon: BROUILLON ? { draft_id: draftId || null } : null,
    reponse_brute: reponseBrute,
    // ⟳ 2026-09-11 · C0 ④ — chaque étape, séparée et nommée.
    etapes,
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
      light_slots: tir.lightSlots,
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
