#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
/**
 * ══════════════════════════════════════════════════════════════════════════
 * V0-C — LA FIXTURE OBLIGATOIRE : un foyer de 4 bouches qui porte SIX
 * conditions en même temps.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Autorité : `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, section
 * « LA FIXTURE OBLIGATOIRE » et fiche `V0-C`. Cette fixture existe pour `V0-D`
 * (le run réel) et pour la vérification de fin de CHAQUE vague.
 *
 *   ① un végane          ④ deux objectifs OPPOSÉS (fat_loss / muscle_gain)
 *   ② un mineur          ⑤ une absence PARTIELLE
 *   ③ une allergie       ⑥ au moins une bouche SANS COMPTE
 *      `medical`
 *
 * ── LA RÈGLE QUI DÉCIDE DE LA QUALITÉ DE CE SCRIPT ────────────────────────
 *
 *   > « une fixture qui diverge du produit mesure autre chose. Chaque champ
 *   >   posé par LA MÊME RPC QUE L'ÉCRAN, jamais par un `insert` direct. »
 *
 * Tout ce qui suit passe donc par `keel_household_*`, appelées en PostgREST
 * avec le jeton du compte maître — c'est-à-dire exactement le chemin de
 * `frontend/src/keel/api/household.ts`. Aucun `insert into
 * household_members`, aucun `update` de colonne. L'ORDRE des appels est celui
 * de `SetupPage.tsx :: addMouth` (`add_member` → corps → cible → allergies →
 * régime), parce qu'un ordre différent est un autre produit.
 *
 * Deux écritures ne sont PAS des RPC, et ce n'est pas un contournement : le
 * produit lui-même les fait en PostgREST direct.
 *   · `profiles` (locale, pays, prénom, date) — `api/uiLanguage.ts`,
 *     `api/keelClient.ts` écrivent la table à la main.
 *   · `student_goals` du maître — `api/household.ts :: createOwnerGoalRow`,
 *     un `upsert` avec `ignoreDuplicates`. Sans cette ligne,
 *     `generate-household-meal-v1` refuse par `goal_required` (409), donc la
 *     fixture serait inutilisable par `V0-D`.
 * Les deux sont faites AVEC LE JETON DU MAÎTRE, sous RLS, jamais en
 * `service_role`.
 *
 * ── L'ARME : LE SCRIPT ÉCHOUE SI L'ALLERGÈNE NE RÉSOUT PAS ────────────────
 *
 * Une allergie dont le libellé ne rend aucun `allergen_ref` catalogué fait une
 * ceinture de sortie qui cherche une chaîne qu'elle ne trouvera jamais. C'est
 * le défaut mesuré sur `fruits_de_mer` (`surfaceFormsFor` rend `[]`). Le
 * contrôle est fait AVANT toute écriture, avec LE CODE DU PRODUIT lui-même
 * (`householdAllergenRefs` + `surfaceFormsFor` importés, pas recopiés) : une
 * table qui grandit ou rétrécit fait bouger ce script sans qu'on y touche.
 *
 * ── REJOUABLE, PAR UNE CLÉ NATURELLE QUE LA BASE TIENT ────────────────────
 *
 * La clé est l'e-mail du maître. `household_members_one_per_user` est UNIQUE
 * sur `user_id` : le maître ne peut appartenir qu'à UN foyer, donc relancer ce
 * script ne peut pas en créer un second — ce n'est pas une politesse du code,
 * c'est une contrainte de la base. Les bouches, elles, sont retrouvées par
 * PRÉNOM dans le roster ; les `set_member_*` sont des `update` idempotents et
 * `add_allergy` porte un `on conflict do nothing`.
 *
 * ── CE QUE CE SCRIPT NE FAIT PAS ──────────────────────────────────────────
 *
 * ⛔ Aucune suppression, aucun `delete`, aucune ligne d'un autre foyer touchée.
 * ⛔ Aucun appel de modèle. `V0-C` a un budget de ZÉRO génération ; c'est
 *    `V0-D` qui dépense.
 * ⛔ Aucun JWT forgé, aucune écriture dans `auth.sessions` : le maître se
 *    connecte par mot de passe, comme l'écran.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *
 *   deno run --allow-net --allow-read --allow-env \
 *     scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts
 *
 * Les trois variables sont lues dans l'environnement, et à défaut dans
 * `supabase/.env`. ⚠️ Ne JAMAIS les exporter dans un shell qui lancera ensuite
 * `deno test` du dépôt : 114 faux rouges connus.
 */

import { householdAllergenRefs } from "../supabase/functions/_shared/keel/household_safety.ts";
import { surfaceFormsFor } from "../supabase/functions/_shared/keel/allergen_surface_forms.ts";

// ---------------------------------------------------------------------------
// LA FIXTURE, ÉCRITE UNE FOIS
// ---------------------------------------------------------------------------

/** LA CLÉ NATURELLE. Changer cet e-mail crée un SECOND foyer de fixture. */
const MASTER_EMAIL = "fixture.v0c.master@keeltest.dev";
/** Le mot de passe des personas locaux (`tests/real-personas/<nom>/connection.json`). */
const MASTER_PASSWORD = "1234567";
const MASTER_FULL_NAME = "Camille Fixture";
const MASTER_BIRTH_DATE = "1986-03-14";
const HOUSEHOLD_NAME = "Fixture V0-C — foyer pluriel";

/**
 * LA LANGUE DU FOYER, ÉCRITE EXPRÈS ET PAS HÉRITÉE DU DÉFAUT.
 *
 * `profiles.locale` vaut `fr-FR` par défaut en base, et
 * `generate-household-meal-v1` en fait LA langue du plan (`:1235`, et pas
 * `student_goals.content_locale`). Une fixture qui ne l'écrit pas mesure un
 * défaut de colonne en croyant mesurer un choix. On l'écrit — et on la rend
 * pilotable, parce que le référentiel alimentaire est mesuré 17,3 points moins
 * profond en français qu'en anglais : `V0-D` doit pouvoir basculer sans
 * rééditer ce fichier.
 */
const FIXTURE_LOCALE = Deno.env.get("FIXTURE_LOCALE") ?? "fr-FR";
/** `profiles.country` est la SEULE source du pays de crise. Jamais `null`. */
const FIXTURE_COUNTRY = Deno.env.get("FIXTURE_COUNTRY") ?? "FR";
const FIXTURE_TIMEZONE = "Europe/Paris";

/**
 * LE LIBELLÉ DE L'ALLERGIE, EN FRANÇAIS, PARCE QUE C'EST CE QUE LE MAÎTRE TAPE.
 *
 * `arachide` → `["peanut", "arachide"]`, et `peanut` porte 8 formes de surface
 * (« satay », « nut butter », « PB »…). C'est le cas qui EXERCE la ceinture.
 * ⛔ Ne pas le remplacer par « fruits de mer » : ce libellé ne rend que
 * `fruits_de_mer`, hors catalogue, et l'arme ci-dessous refusera d'écrire.
 *
 * ⚠️ IL EST SURCHARGEABLE, ET C'EST CE QUI REND L'ARME PROUVABLE. Une garde
 * paramétrée par sa propre constante reste verte quand on change la constante :
 * il faut pouvoir la MUTER depuis l'extérieur pour la voir mordre. D'où
 *
 *     FIXTURE_ALLERGY_LABEL="fruits de mer" deno run … → exit 1, RIEN d'écrit
 *
 * L'arme passe avant toute connexion, donc un libellé refusé ne touche pas la
 * base. Un libellé ACCEPTÉ mais différent, lui, ajoutera une seconde ligne
 * d'allergie à la même bouche — c'est un geste explicite, pas un accident.
 */
const ALLERGY_LABEL = Deno.env.get("FIXTURE_ALLERGY_LABEL") ?? "arachide";

/** Le corps d'une bouche, tel que `SetupPage` le collecte. */
interface FixtureBody {
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "other";
  activityLevel: "sedentary" | "on_feet" | "trains_some" | "trains_hard" | null;
  dayActivity: "seated" | "on_feet" | "physical_job" | null;
  sportFrequency: "none" | "1_2" | "3_4" | "5_plus" | null;
  appetite: "small" | "average" | "large" | null;
}

interface FixtureMouth {
  firstName: string;
  birthDate: string;
  /** `null` = aucune direction posée. */
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null;
  /** LES DEUX OU AUCUN — miroir de `keel_household_set_member_target`. */
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  diet: "omnivore" | "vegetarian" | "vegan" | "pescatarian" | null;
  allergies: string[];
  /** `[]` = présente toute la fenêtre. */
  awayDays: Array<{ day: string; kind: "away" | "eating_out"; slots: string[] }>;
  body: FixtureBody;
  /** À quoi cette bouche sert dans la fixture — pour le journal. */
  why: string;
}

/**
 * LES TROIS BOUCHES SANS COMPTE.
 *
 * ⚠️ SANS COMPTE, ET C'EST LE CAS NOMINAL — pas une économie. C'est l'état
 * dont `restrictionFlagOf` rend `false` (`no_account`), et le harnais QA
 * plafonne de toute façon à 3 sièges d'essai : un 4ᵉ élève à compte plante le
 * run en cours.
 *
 * ⚠️ LE VÉGANE ET L'ALLERGIQUE SONT DEUX BOUCHES DIFFÉRENTES. Fondus en une
 * seule, `dishBearingMembers` ne produirait qu'UN contenant et le lot `C1` (la
 * contamination croisée) n'aurait pas d'objet.
 *
 * ⚠️ LE MINEUR PORTE UN DES DEUX OBJECTIFS OPPOSÉS, sinon
 * `weighedPortionMembers` n'est jamais exercé sur lui — c'est la cinquième
 * surface du mineur. Il porte `muscle_gain` et PAS `fat_loss` : la base
 * compte déjà deux mineurs en `fat_loss`, et en ajouter un troisième
 * déplacerait la `mesure AVANT` de `S4` sans rien exercer de plus. Il ne
 * reçoit PAS de cible chiffrée non plus : `weighedPortionMembers` ne lit que
 * `goal`, donc une cible sur un enfant serait une surface de plus pour rien.
 */
const MOUTHS: FixtureMouth[] = [
  {
    firstName: "Malo",
    birthDate: "1992-07-09",
    goal: "fat_loss",
    targetWeightKg: 72,
    paceKgPerWeek: 0.4,
    diet: "vegan",
    allergies: [],
    awayDays: [],
    body: {
      heightCm: 181,
      weightKg: 78,
      gender: "male",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "3_4",
      appetite: "average",
    },
    why: "① le végane · ④ le premier des deux objectifs opposés (fat_loss)",
  },
  {
    firstName: "Anouk",
    birthDate: "2011-05-20",
    goal: "muscle_gain",
    targetWeightKg: null,
    paceKgPerWeek: null,
    diet: null,
    allergies: [],
    awayDays: [],
    body: {
      heightCm: 162,
      weightKg: 50,
      gender: "female",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "3_4",
      appetite: "average",
    },
    why: "② le mineur · ④ le second objectif (muscle_gain), porté par LUI",
  },
  {
    firstName: "Yanis",
    birthDate: "1989-11-02",
    goal: "maintenance",
    targetWeightKg: null,
    paceKgPerWeek: null,
    diet: null,
    allergies: [ALLERGY_LABEL],
    // ⑤ PARTIELLE, ET C'EST TOUT LE SUJET : des CRÉNEAUX nommés, jamais une
    // journée entière (une entrée sans `slots` vaut « toute la journée »). Les
    // deux `kind` sont représentés — `away` (absent) et `eating_out`
    // (l'occasion ESTIMÉE), qui ne suivent pas le même chemin de lecture.
    awayDays: [
      { day: "wed", kind: "away", slots: ["lunch", "dinner"] },
      { day: "sat", kind: "eating_out", slots: ["dinner"] },
    ],
    body: {
      heightCm: 175,
      weightKg: 72,
      gender: "male",
      activityLevel: "on_feet",
      dayActivity: "physical_job",
      sportFrequency: "1_2",
      appetite: "large",
    },
    why: "③ l'allergie `medical` · ⑤ l'absence partielle",
  },
];

/** Le corps du maître. Il a un compte : ni régime ni objectif par cette porte. */
const MASTER_BODY: FixtureBody = {
  heightCm: 168,
  weightKg: 62,
  gender: "female",
  activityLevel: "on_feet",
  dayActivity: "seated",
  sportFrequency: "1_2",
  appetite: "average",
};

// ---------------------------------------------------------------------------
// L'ARME — elle passe AVANT toute écriture
// ---------------------------------------------------------------------------

/**
 * Le `allergen_ref` catalogué que le libellé porte, ou `null`.
 *
 * ⚠️ ON N'INTERROGE PAS LA TABLE, ON APPELLE LE PRODUIT. `householdAllergenRefs`
 * est ce que `generate-household-meal-v1` appelle réellement, et
 * `surfaceFormsFor` est ce que la ceinture de sortie consulte. Recopier l'une
 * des deux ici ferait une seconde règle, qui divergerait au premier correctif.
 */
function resolvedCatalogRef(label: string): { ref: string; forms: string[] } | null {
  for (const ref of householdAllergenRefs(label)) {
    const forms = surfaceFormsFor(ref);
    if (forms.length > 0) return { ref, forms };
  }
  return null;
}

function armOrDie(): { ref: string; forms: string[] } {
  const resolved = resolvedCatalogRef(ALLERGY_LABEL);
  if (!resolved) {
    console.error(
      [
        "",
        "⛔ ARRÊT — l'allergène de la fixture NE RÉSOUT PAS.",
        "",
        `   libellé   : « ${ALLERGY_LABEL} »`,
        `   refs      : ${JSON.stringify(householdAllergenRefs(ALLERGY_LABEL))}`,
        "   formes    : AUCUN de ces refs n'est dans ALLERGEN_SURFACE_FORMS.",
        "",
        "   Écrire cette fixture produirait une allergie que la ceinture de",
        "   sortie ne peut pas voir : elle chercherait une chaîne qui n'existe",
        "   nulle part, et le lot mesurerait une garde désarmée en croyant",
        "   mesurer une garde. C'est le défaut mesuré sur `fruits_de_mer`.",
        "",
        "   Répare l'UNE des deux : choisis un libellé catalogué, ou ajoute la",
        "   clé à `_shared/keel/allergen_surface_forms.ts` (à la main, une paire",
        "   à la fois — jamais un matcher).",
        "",
      ].join("\n"),
    );
    Deno.exit(1);
  }
  console.log(
    `arme ✓ « ${ALLERGY_LABEL} » → \`${resolved.ref}\` · ${resolved.forms.length} formes de surface : [${resolved.forms.join(", ")}]`,
  );
  return resolved;
}

// ---------------------------------------------------------------------------
// La pile locale
// ---------------------------------------------------------------------------

async function envOf(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  // Même repli que `scripts/get-jwt.sh` : le fichier d'environnement local.
  // ⚠️ L'`URL` est passée telle quelle, PAS son `.pathname` : le dépôt vit dans
  // un dossier dont le nom porte une espace, et `.pathname` la rend `%20`.
  const path = new URL("../supabase/.env", import.meta.url);
  let text = "";
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`${name} absent de l'environnement, et supabase/.env illisible`);
  }
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} absent de l'environnement ET de supabase/.env`);
}

let API_URL = "";
let ANON_KEY = "";
let SERVICE_ROLE_KEY = "";

interface Reply {
  status: number;
  body: unknown;
}

async function call(path: string, init: RequestInit & { bearer: string }): Promise<Reply> {
  const { bearer, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      apikey: bearer === SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY : ANON_KEY,
      authorization: `Bearer ${bearer}`,
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw === "" ? null : JSON.parse(raw);
  } catch { /* du texte, on le garde tel quel */ }
  return { status: res.status, body };
}

/**
 * UNE RPC `keel_household_*`, APPELÉE COMME L'ÉCRAN L'APPELLE.
 *
 * Elles ne LÈVENT pas : elles rendent `{ok:false, reason:'…'}`. Un script qui
 * ne lit pas `ok` écrirait la moitié d'une fixture en affichant « terminé »,
 * ce qui est très exactement le mode d'échec que ce dépôt paie en boucle. On
 * lève ici, avec le motif nommé.
 */
async function rpc(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { status, body } = await call(`/rest/v1/rpc/${name}`, {
    method: "POST",
    bearer: token,
    body: JSON.stringify(args),
  });
  if (status >= 300) {
    throw new Error(`${name} → HTTP ${status} : ${JSON.stringify(body)}`);
  }
  const out = (body ?? {}) as Record<string, unknown>;
  if (out.ok === false) {
    throw new Error(`${name} → refus « ${String(out.reason)} »`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Le compte maître
// ---------------------------------------------------------------------------

async function signIn(): Promise<{ token: string; userId: string } | null> {
  const res = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: MASTER_EMAIL, password: MASTER_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

/**
 * LE COMPTE MAÎTRE, TROUVÉ OU CRÉÉ — dans cet ordre, et l'ordre est la clé de
 * rejouabilité : on essaie de se CONNECTER d'abord. Une création qui échoue
 * sur « e-mail déjà pris » serait un chemin d'exception ; ici le cas nominal
 * du second passage est le cas nominal tout court.
 *
 * ⚠️ Un foyer a besoin d'un propriétaire avec compte : `keel_household_create`
 * refuse `not_authenticated`. C'est la SEULE bouche à compte de la fixture.
 */
async function masterAccount(): Promise<{ token: string; userId: string }> {
  const existing = await signIn();
  if (existing) {
    console.log(`maître ✓ ${MASTER_EMAIL} déjà là (${existing.userId})`);
    return existing;
  }
  const { status, body } = await call("/auth/v1/admin/users", {
    method: "POST",
    bearer: SERVICE_ROLE_KEY,
    body: JSON.stringify({
      email: MASTER_EMAIL,
      password: MASTER_PASSWORD,
      email_confirm: true,
      user_metadata: { fixture: "V0-C", full_name: MASTER_FULL_NAME },
    }),
  });
  if (status >= 300) {
    throw new Error(`création du compte maître → HTTP ${status} : ${JSON.stringify(body)}`);
  }
  const fresh = await signIn();
  if (!fresh) throw new Error("compte maître créé mais non connectable");
  console.log(`maître + ${MASTER_EMAIL} créé (${fresh.userId})`);
  return fresh;
}

/**
 * LE PROFIL DU MAÎTRE — écrit AVANT le foyer, et ce n'est pas cosmétique :
 * `keel_household_create` RECOPIE `profiles.full_name` et `profiles.birth_date`
 * sur la ligne du propriétaire, une fois, puis elle vit sa vie.
 */
async function ensureProfile(token: string, userId: string): Promise<void> {
  const { status, body } = await call("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    bearer: token,
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      full_name: MASTER_FULL_NAME,
      birth_date: MASTER_BIRTH_DATE,
      gender: MASTER_BODY.gender,
      locale: FIXTURE_LOCALE,
      country: FIXTURE_COUNTRY,
      timezone: FIXTURE_TIMEZONE,
      onboarding_completed: true,
    }),
  });
  if (status >= 300) throw new Error(`profiles → HTTP ${status} : ${JSON.stringify(body)}`);
  console.log(`profil ✓ locale=${FIXTURE_LOCALE} country=${FIXTURE_COUNTRY} tz=${FIXTURE_TIMEZONE}`);
}

/**
 * LA LIGNE `student_goals` DU MAÎTRE — le miroir exact de
 * `api/household.ts :: createOwnerGoalRow`, `ignoreDuplicates` compris.
 *
 * Elle ne dimensionne AUCUNE portion : elle porte la situation, les
 * contraintes pratiques et la langue d'écriture. Sans elle,
 * `generate-household-meal-v1` rend `goal_required` (409) et `V0-D` n'a rien à
 * mesurer. `maintenance` exprès : ajouter une troisième direction brouillerait
 * les DEUX objectifs opposés que la fixture existe pour exercer.
 */
async function ensureOwnerGoal(token: string, userId: string): Promise<void> {
  const { status, body } = await call("/rest/v1/student_goals?on_conflict=user_id", {
    method: "POST",
    bearer: token,
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      goal: "maintenance",
      // `en-GB` : la valeur que TOUS les écrivains de cette colonne sèment.
      // La langue du PLAN, elle, vient de `profiles.locale` — deux colonnes,
      // deux questions.
      content_locale: "en-GB",
    }),
  });
  if (status >= 300) throw new Error(`student_goals → HTTP ${status} : ${JSON.stringify(body)}`);
  console.log("objectif du maître ✓ (student_goals, maintenance)");
}

// ---------------------------------------------------------------------------
// Le foyer
// ---------------------------------------------------------------------------

interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  diet: string | null;
  away_days: unknown;
}

async function roster(token: string): Promise<RosterRow[]> {
  const { status, body } = await call("/rest/v1/rpc/keel_household_roster", {
    method: "POST",
    bearer: token,
    body: "{}",
  });
  if (status >= 300) throw new Error(`roster → HTTP ${status} : ${JSON.stringify(body)}`);
  return (body ?? []) as RosterRow[];
}

/**
 * LE FOYER, TROUVÉ OU CRÉÉ.
 *
 * ⚠️ C'EST ICI QU'EST LA REJOUABILITÉ, ET ELLE EST TENUE PAR LA BASE.
 * `household_members_one_per_user` est UNIQUE sur `user_id` : ce compte ne
 * peut appartenir qu'à un foyer. Un roster non vide veut donc dire « le foyer
 * de fixture existe », et `keel_household_create` refuserait de toute façon
 * par `already_in_household`. Aucun second foyer n'est atteignable.
 */
async function ensureHousehold(token: string): Promise<RosterRow[]> {
  const current = await roster(token);
  if (current.length > 0) {
    console.log(`foyer ✓ déjà là, ${current.length} bouche(s)`);
    return current;
  }
  const created = await rpc(token, "keel_household_create", { p_name: HOUSEHOLD_NAME });
  console.log(`foyer + créé ${String(created.household_id)}`);
  return await roster(token);
}

async function setBody(token: string, memberId: string, b: FixtureBody): Promise<void> {
  await rpc(token, "keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: b.heightCm,
    p_weight_kg: b.weightKg,
    p_gender: b.gender,
    p_activity_level: b.activityLevel,
    p_day_activity: b.dayActivity,
    p_sport_frequency: b.sportFrequency,
    p_activity_axes_asked: true,
    p_takes_dessert: null,
    p_takes_cheese: null,
    p_takes_bread: null,
    p_meal_structure_asked: false,
    p_appetite: b.appetite,
    p_appetite_asked: true,
  });
}

/**
 * UNE BOUCHE, POSÉE DANS L'ORDRE DE L'ÉCRAN.
 *
 * `SetupPage.tsx :: addMouth` fait, dans cet ordre exact :
 *   ① `keel_household_add_member(prénom, DATE, OBJECTIF)` — les trois d'un coup
 *   ② `keel_household_set_member_body`
 *   ③ `keel_household_set_member_target`
 *   ④ les allergies
 *   ⑤ le régime (sauté quand la bouche a un compte : `has_account`)
 *
 * ⚠️ ① EST LE POINT QUE `S4` DOIT FERMER, ET IL FAUT LE LIRE EN ENTIER. La
 * revue sécurité décrit un contournement DANS LE TEMPS (ajouter sans date,
 * poser l'objectif, saisir la date ensuite). Mesuré le 2026-08-21 : ce détour
 * n'est plus nécessaire. `goal_not_for_minor` a été retiré des DEUX portes
 * d'écriture le 2026-08-18 (migration `20260818100000`), et
 * `target_not_for_minor` n'a jamais existé. L'écran envoie donc la date de
 * naissance d'un enfant ET sa direction dans le MÊME appel, et la base
 * accepte. Cette fixture n'est constructible qu'avant `S4` ; `S4` la rendra
 * irreproductible telle quelle, et c'est voulu.
 */
async function ensureMouth(
  token: string,
  present: RosterRow[],
  m: FixtureMouth,
): Promise<string> {
  const found = present.find((r) => r.first_name === m.firstName);
  let memberId: string;
  if (found) {
    memberId = found.member_id;
    console.log(`  ${m.firstName} ✓ déjà là (${memberId})`);
    // Les portes de date et d'objectif sont des `update` idempotents : on les
    // rejoue pour qu'un foyer à moitié écrit se répare au second passage.
    await rpc(token, "keel_household_set_member_birth_date", {
      p_member: memberId,
      p_birth_date: m.birthDate,
    });
    await rpc(token, "keel_household_set_member_goal", { p_member: memberId, p_goal: m.goal });
  } else {
    const added = await rpc(token, "keel_household_add_member", {
      p_first_name: m.firstName,
      p_birth_date: m.birthDate,
      p_goal: m.goal,
    });
    memberId = String(added.member_id);
    console.log(`  ${m.firstName} + ajouté (${memberId})`);
  }

  await setBody(token, memberId, m.body);
  await rpc(token, "keel_household_set_member_target", {
    p_member: memberId,
    p_target_weight_kg: m.targetWeightKg,
    p_pace_kg_per_week: m.paceKgPerWeek,
  });
  for (const label of m.allergies) {
    await rpc(token, "keel_household_add_allergy", { p_member: memberId, p_label: label });
  }
  if (m.diet) {
    await rpc(token, "keel_household_set_member_diet", { p_member: memberId, p_diet: m.diet });
  }
  await rpc(token, "keel_household_set_member_away", {
    p_member: memberId,
    p_away: m.awayDays,
  });
  return memberId;
}

// ---------------------------------------------------------------------------
// LA VÉRIFICATION — le script se contrôle lui-même
// ---------------------------------------------------------------------------

/**
 * LES SIX CONDITIONS, RELUES DEPUIS LA BASE, PAR LE JETON DU MAÎTRE.
 *
 * ⚠️ RELUES, PAS DÉDUITES DE CE QU'ON VIENT D'ÉCRIRE. Un script qui affirme
 * l'état qu'il croit avoir posé est un script qui ne vérifie rien : c'est
 * exactement comme ça qu'un lot désarmé ressemble à un lot qui marche.
 */
async function verify(token: string, ref: string): Promise<void> {
  const rows = await roster(token);
  const { status, body } = await call(
    "/rest/v1/household_member_allergies?select=member_id,label",
    { method: "GET", bearer: token },
  );
  if (status >= 300) throw new Error(`allergies → HTTP ${status} : ${JSON.stringify(body)}`);
  const allergies = (body ?? []) as Array<{ member_id: string; label: string }>;

  const awayOf = (r: RosterRow) => (Array.isArray(r.away_days) ? r.away_days : []) as Array<
    Record<string, unknown>
  >;
  const vegan = rows.filter((r) => r.diet === "vegan");
  const minors = rows.filter((r) => r.age_state === "minor");
  const fatLoss = rows.filter((r) => r.goal === "fat_loss");
  const muscle = rows.filter((r) => r.goal === "muscle_gain");
  const noAccount = rows.filter((r) => r.user_id === null);
  // PARTIELLE = au moins une entrée qui NOMME des créneaux. Une entrée sans
  // `slots` vaut « toute la journée » (`parseAwayDays`), donc elle ne compte
  // pas ici : ce serait une autre condition.
  const partial = rows.filter((r) =>
    awayOf(r).some((e) => Array.isArray(e.slots) && (e.slots as unknown[]).length > 0)
  );
  const minorWithGoal = minors.filter((r) => r.goal === "fat_loss" || r.goal === "muscle_gain");
  const allergicMemberIds = new Set(allergies.map((a) => a.member_id));
  const veganIds = new Set(vegan.map((r) => r.member_id));
  const distinctVeganAllergic = [...allergicMemberIds].some((id) => !veganIds.has(id));

  const checks: Array<[boolean, string]> = [
    [rows.length === 4, `4 bouches (${rows.length})`],
    [vegan.length >= 1, `① un végane (${vegan.length})`],
    [minors.length >= 1, `② un mineur (${minors.length})`],
    [allergies.length >= 1, `③ une allergie \`medical\` (${allergies.length})`],
    [
      fatLoss.length >= 1 && muscle.length >= 1,
      `④ deux objectifs opposés (fat_loss=${fatLoss.length}, muscle_gain=${muscle.length})`,
    ],
    [partial.length >= 1, `⑤ une absence partielle (${partial.length})`],
    [noAccount.length >= 1, `⑥ au moins une bouche sans compte (${noAccount.length})`],
    [
      minorWithGoal.length >= 1,
      `précision 2 — le mineur porte un objectif (${minorWithGoal.map((r) => `${r.first_name}:${r.goal}`).join(", ") || "aucun"})`,
    ],
    [
      distinctVeganAllergic,
      "précision 3 — le végane et l'allergique sont deux bouches différentes",
    ],
    [surfaceFormsFor(ref).length > 0, `précision 1 — surfaceFormsFor('${ref}') non vide`],
  ];

  console.log("\n── les six conditions, relues en base ─────────────────────");
  let failed = 0;
  for (const [ok, label] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  }
  console.log("\n── le foyer ──────────────────────────────────────────────");
  for (const r of rows) {
    console.log(
      `  ${r.first_name.padEnd(8)} ${r.member_id}  role=${r.role.padEnd(6)} age=${r.age_state.padEnd(7)} goal=${String(r.goal ?? "—").padEnd(12)} diet=${String(r.diet ?? "—").padEnd(10)} compte=${r.user_id ? "oui" : "non"}`,
    );
  }
  if (failed > 0) {
    console.error(`\n⛔ ${failed} condition(s) manquante(s) — la fixture n'exerce pas ce qu'elle prétend.`);
    Deno.exit(1);
  }
  console.log("\n✓ la fixture porte les SIX conditions.");
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ⛔ L'ARME D'ABORD. Rien n'est écrit tant que l'allergène ne résout pas.
  const { ref } = armOrDie();

  API_URL = await envOf("SUPABASE_URL");
  ANON_KEY = await envOf("SUPABASE_ANON_KEY");
  SERVICE_ROLE_KEY = await envOf("SUPABASE_SERVICE_ROLE_KEY");
  console.log(`pile   ✓ ${API_URL}`);

  const { token, userId } = await masterAccount();
  await ensureProfile(token, userId);
  await ensureOwnerGoal(token, userId);

  const present = await ensureHousehold(token);
  const owner = present.find((r) => r.user_id === userId);
  if (!owner) throw new Error("le maître n'est pas dans son propre roster");
  await rpc(token, "keel_household_set_member_name", {
    p_member: owner.member_id,
    p_first_name: MASTER_FULL_NAME.split(" ")[0],
  });
  await rpc(token, "keel_household_set_member_birth_date", {
    p_member: owner.member_id,
    p_birth_date: MASTER_BIRTH_DATE,
  });
  await setBody(token, owner.member_id, MASTER_BODY);
  console.log(`  ${MASTER_FULL_NAME.split(" ")[0].padEnd(8)} ✓ maître (${owner.member_id})`);

  for (const m of MOUTHS) {
    await ensureMouth(token, present, m);
  }

  await verify(token, ref);
}

if (import.meta.main) {
  await main();
}
