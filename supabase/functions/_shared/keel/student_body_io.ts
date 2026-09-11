/**
 * KEEL — LE CORPS DE L'ÉLÈVE, LU DEPUIS LA BASE.
 *
 * La moitié I/O de `student_age.ts` et du contrat de mesures. Même partage que
 * partout ici: tout ce qui peut être FAUX (SQL, jsonb, unités, lignes en
 * double) vit dans ce fichier; tout ce qui DÉCIDE reste pur et testable sans
 * base.
 *
 * ── CE QUE CE MODULE REFUSE DE FAIRE ───────────────────────────────────────
 * Aucun besoin énergétique, aucune cible de poids, aucun IMC. Le contrat
 * d'affichage (§3.3 du chantier) tient sur une frontière nette: on rend à
 * l'élève ce qu'il a DÉCLARÉ de son corps, on ne calcule rien à partir de sa
 * nourriture, et on ne recatégorise pas ce qu'il a déclaré en jugement. Un IMC
 * n'est pas une mesure de l'élève, c'est un verdict sur lui.
 *
 * ── NOTHING HERE IS BEST-EFFORT ────────────────────────────────────────────
 * Un chargeur qui avale son erreur et rend « pas de mesure » raconte qu'un
 * élève n'a rien saisi alors qu'on a échoué à le lire. Les erreurs remontent.
 */

import {
  ageBandOf,
  assessBirthDate,
  type BirthDateVerdict,
  usableAge,
} from "./student_age.ts";
import type { DatedMeasure } from "./student_body.ts";
import {
  type BodyMeasureKind,
  type DatedBodyMeasure,
  isoWeekStartOf,
  weeklyBodyPoints,
} from "./body_measure_series.ts";
import { loadBodyMeasures } from "./body_measure_io.ts";
import { addDays } from "./local_date.ts";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  DAY_ACTIVITY_LEVELS,
  type DayActivityLevel,
  SPORT_FREQUENCIES,
  type SportFrequency,
} from "./tokens.ts";
import type { ActivityAxes } from "./meal_envelope.ts";
import { WEIGHT_KG_MAX, WEIGHT_KG_MIN } from "./weight_bounds.ts";
import {
  MEAL_BODY_GENDERS,
  type MealBodyContext,
  type MealBodyGender,
} from "./meal_body.ts";

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export type { DatedMeasure };

export interface StudentBodySnapshot {
  verdict: BirthDateVerdict;
  timezone: string | null;
  /**
   * `profiles.height_cm`, en centimètres, ou `null`.
   *
   * ── POURQUOI ELLE ARRIVE ICI, ET PAS DANS UN SECOND CHARGEUR ─────────────
   * Ce module lit déjà `profiles`. La colonne existe depuis le 2026-08-08, avec
   * son écran, sa contrainte de bornes et un commentaire de migration qui dit
   * en toutes lettres « sert aux PORTIONS des repas composés » — et elle
   * n'avait AUCUN lecteur (FF-030 volet élève, §1). Deux colonnes de plus dans
   * un `select` qui part de toute façon, plutôt qu'un aller-retour de plus et
   * un second chargeur à tenir d'accord avec celui-ci.
   *
   * Elle n'entre dans AUCUNE tendance: la taille d'un adulte ne bouge pas, et
   * c'est écrit sur la migration.
   */
  heightCm: number | null;
  /** `profiles.gender`. Liste FERMÉE; une valeur hors liste vaut `null`. */
  gender: MealBodyGender | null;
  /**
   * `profiles.activity_level` — les quatre crans du 2026-08-18.
   *
   * ⚠️ ELLE ARRIVE ICI POUR LA MÊME RAISON QUE `heightCm`: ce module lit déjà
   * `profiles`, et un second chargeur serait un second endroit à tenir
   * d'accord avec celui-ci. Une colonne de plus dans un `select` qui part de
   * toute façon.
   *
   * `null` = personne n'a répondu, ET une valeur hors vocabulaire vaut `null`
   * aussi — même règle que `gender` juste au-dessus. Un jeton inconnu retombe
   * sur l'hypothèse (facteur 1,5) plutôt que d'entrer dans un `Record` et d'en
   * ressortir `undefined`, qui deviendrait un `NaN` de besoin énergétique.
   */
  activityLevel: ActivityLevel | null;
  /**
   * ⟳ 2026-09-09 — LES DEUX AXES, `profiles.day_activity` / `sport_frequency`.
   *
   * ⛔ POURQUOI ILS ARRIVENT ICI, ET CE QUE LEUR ABSENCE COÛTAIT. Ils étaient
   * ÉCRITS par l'entonnoir solo (`saveOwnProfile`, deux colonnes de `profiles`)
   * et LUS par personne: ce `select` ne prenait que `activity_level`, le cran
   * MÉLANGÉ, que le même entonnoir n'écrit plus. Mesuré le 2026-09-09 sur
   * poul@gmail.com — `day_activity = seated`, `sport_frequency = 3_4`,
   * `activity_level` VIDE: le facteur servi était 1,5 (« on ne sait pas »)
   * au lieu de 1,63, soit 230 kcal/jour d'entretien perdus sur quelqu'un qui
   * avait répondu aux deux questions.
   *
   * `asked` vient de `activity_axes_asked_at`, et il n'est pas décoratif:
   * `activityAnswerState` sépare « la question n'a pas été posée » de « elle a
   * été posée et refusée », et les deux ne demandent pas la même réparation.
   */
  activityAxes: ActivityAxes;
  /** Du plus ancien au plus récent. Vide = l'élève n'a jamais saisi de mesure. */
  weights: DatedMeasure[];
  waists: DatedMeasure[];
}

/**
 * Bornes de plausibilité, alignées sur celles du formulaire hebdo.
 *
 * ⛔ CE COMMENTAIRE ÉTAIT FAUX, ET IL L'EST RESTÉ LONGTEMPS. Le formulaire
 * hebdo porte 25-400; ce module portait 25-**350**, en copie privée. Une pesée
 * de 360 kg passait donc le formulaire, passait le `check` de la base
 * (`student_body_measures_value_in_range`, 25-400) — et ce lecteur-ci, le seul
 * qui la relit, la jetait sans un mot. Corrigé par le lot `X1′` (2026-08-22):
 * les bornes sont IMPORTÉES de `weight_bounds.ts`, donc la phrase ci-dessus est
 * enfin vraie. Le tour de taille garde ses bornes propres, plus étroites: elles
 * n'ont jamais prétendu être celles du formulaire.
 *
 * (L'import vit dans le bloc d'imports en tête de fichier.)
 */
const WAIST_CM_MIN = 40;
const WAIST_CM_MAX = 200;
/** Celles de `profiles_height_cm_range_check`, relues plutôt que supposées. */
const HEIGHT_CM_MIN = 90;
const HEIGHT_CM_MAX = 250;

/**
 * La taille, ou `null`.
 *
 * Le CHECK SQL tient déjà les bornes; on les relit quand même. Pas par défiance
 * envers la contrainte, mais parce que ce lecteur sert un PROMPT: une taille
 * aberrante entrée avant que la contrainte n'existe produirait une portion
 * absurde que personne ne saurait rattacher à sa cause. Le repli est le
 * comportement d'avant FF-030 — pas de taille, pas de ligne.
 */
function readHeightCm(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < HEIGHT_CM_MIN || n > HEIGHT_CM_MAX) return null;
  return n;
}

/**
 * Le sexe déclaré, contre la liste FERMÉE de `profiles_gender_check`.
 *
 * Hors liste vaut `null` et jamais la valeur brute: elle partirait telle quelle
 * dans une consigne (« gender, as they picked it: <n'importe quoi> ») et le
 * modèle en ferait ce qu'il veut. Même posture que `readCookingCapacity`:
 * absent vaut mieux que faux.
 */
function readGender(raw: unknown): MealBodyGender | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (MEAL_BODY_GENDERS as readonly string[]).includes(value)
    ? (value as MealBodyGender)
    : null;
}

/**
 * Le cran d'activité, ou `null`.
 *
 * ⚠️ PAS `parseActivityLevel`, ET C'EST DÉLIBÉRÉ. Le parseur LÈVE sur un jeton
 * inconnu (R7), et c'est la bonne règle pour une ENTRÉE — quelqu'un qui écrit
 * un jeton inventé doit s'entendre refuser. Ici on LIT une colonne, et une
 * colonne illisible ne doit pas faire tomber la génération d'une semaine:
 * `null` veut dire « on ne sait pas », le repli existe déjà et vaut
 * exactement le comportement d'avant ce lot. Même arbitrage que `readGender`
 * juste au-dessus, et le CHECK de la colonne tient la porte d'écriture.
 */
function readActivityLevel(raw: unknown): ActivityLevel | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (ACTIVITY_LEVELS as readonly string[]).includes(value)
    ? (value as ActivityLevel)
    : null;
}

/**
 * Les deux axes, lus avec la MÊME règle que le cran ci-dessus: un jeton hors
 * vocabulaire vaut `null`, jamais une valeur inventée. `activityAnswerState`
 * retombe alors sur le cran, c'est-à-dire sur le nombre d'avant ce lot.
 */
function readDayActivity(raw: unknown): DayActivityLevel | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (DAY_ACTIVITY_LEVELS as readonly string[]).includes(value)
    ? (value as DayActivityLevel)
    : null;
}

function readSportFrequency(raw: unknown): SportFrequency | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (SPORT_FREQUENCIES as readonly string[]).includes(value)
    ? (value as SportFrequency)
    : null;
}

/**
 * Lit une mesure d'un `biofeedback`, avec repli documenté.
 *
 * Le repli sur `outcomes.weight_7d_avg` est repris tel quel de
 * `frontend/src/keel/pages/studentProgressWeight.ts`: le chemin 1:1 alimente
 * cette clé-là, le point du dimanche alimente `biofeedback.weight_kg`, et les
 * deux modèles coexistent dans la même table. Lire une seule des deux est
 * exactement le bug écrivain/lecteur qui a laissé la carte poids vide.
 */
function readMeasure(
  row: { biofeedback: unknown; outcomes: unknown },
  key: string,
  fallbackKey: string | null,
  min: number,
  max: number,
): number | null {
  const bio = (row.biofeedback ?? {}) as Record<string, unknown>;
  const primary = Number(bio[key]);
  if (Number.isFinite(primary) && primary >= min && primary <= max) return primary;
  if (fallbackKey) {
    const out = (row.outcomes ?? {}) as Record<string, unknown>;
    const secondary = Number(out[fallbackKey]);
    if (Number.isFinite(secondary) && secondary >= min && secondary <= max) {
      return secondary;
    }
  }
  return null;
}

/**
 * Combien de semaines de bilans on relit pour la tendance.
 *
 * Huit: assez pour qu'une tendance existe, assez peu pour qu'une mesure de
 * février ne soit pas présentée en août comme « la dernière ».
 */
export const BODY_HISTORY_WEEKS = 8;

/**
 * Charge ce qu'on sait du corps de cet élève.
 *
 * @param todayLocalIso la date locale de l'élève. Passée par l'appelant plutôt
 *   que calculée ici, pour que la fonction reste rejouable: deux appels le même
 *   jour doivent rendre le même verdict d'âge, y compris à cheval sur minuit
 *   UTC.
 */
export async function loadStudentBody(
  db: Db,
  userId: string,
  todayLocalIso: string,
): Promise<StudentBodySnapshot> {
  const profileRes = await db
    .from("profiles")
    .select(
      "birth_date, timezone, height_cm, gender, activity_level, " +
        "day_activity, sport_frequency, activity_axes_asked_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  const profile = (profileRes.data ?? {}) as Record<string, unknown>;

  const reviewsRes = await db
    .from("weekly_reviews")
    .select("week_start_date, biofeedback, outcomes")
    .eq("user_id", userId)
    .order("week_start_date", { ascending: false })
    .limit(BODY_HISTORY_WEEKS);
  if (reviewsRes.error) throw reviewsRes.error;

  const rows = ((reviewsRes.data ?? []) as Array<Record<string, unknown>>)
    // Rendu du plus ancien au plus récent: une tendance se lit dans le sens du
    // temps, et l'appelant ne devrait pas avoir à s'en souvenir.
    .slice()
    .reverse();

  // ── FF-031 — LA TABLE DATÉE D'ABORD, LE MIROIR EN REPLI ──────────────────
  // Même ordre que `restriction_runtime.loadWeeklyOutcomeSamples`, et pour la
  // même raison: une règle de préférence écrite deux fois différemment
  // divergerait, et ici l'écran de l'élève et la ceinture afficheraient alors
  // deux poids pour la même semaine.
  //
  // Une lecture en panne ne vide pas la série: elle retombe sur le miroir,
  // c'est-à-dire sur le comportement d'avant ce chantier, et elle le dit.
  let measures: DatedBodyMeasure[] = [];
  try {
    measures = await loadBodyMeasures(db as never, {
      userId,
      sinceLocalDate: addDays(todayLocalIso, -7 * BODY_HISTORY_WEEKS),
      untilLocalDate: todayLocalIso,
    });
  } catch (error) {
    console.warn("keel.student_body.body_measures_unreadable", {
      user_id: userId,
      detail: error instanceof Error ? error.message : String(error),
      effect: "repli sur weekly_reviews.biofeedback (comportement d'avant FF-031)",
    });
  }

  const derived: Record<BodyMeasureKind, Map<string, number>> = {
    weight: new Map(),
    waist: new Map(),
  };
  for (const kind of ["weight", "waist"] as const) {
    const min = kind === "weight" ? WEIGHT_KG_MIN : WAIST_CM_MIN;
    const max = kind === "weight" ? WEIGHT_KG_MAX : WAIST_CM_MAX;
    for (const point of weeklyBodyPoints(measures, kind)) {
      // Les mêmes bornes de lecture que le miroir: une valeur aberrante déjà
      // écrite ne doit pas produire une « tendance » sur un 780 kg, quelle que
      // soit la table d'où elle sort.
      if (point.value >= min && point.value <= max) {
        derived[kind].set(point.weekStart, point.value);
      }
    }
  }

  const weights: DatedMeasure[] = [];
  const waists: DatedMeasure[] = [];
  const seen: Record<BodyMeasureKind, Set<string>> = {
    weight: new Set(),
    waist: new Set(),
  };
  for (const row of rows) {
    const weekStart = String(row.week_start_date ?? "").trim();
    if (!weekStart) continue;
    const week = isoWeekStartOf(weekStart, "weekly_reviews.week_start_date");
    const typed = { biofeedback: row.biofeedback, outcomes: row.outcomes };
    const w = derived.weight.get(week) ??
      readMeasure(typed, "weight_kg", "weight_7d_avg", WEIGHT_KG_MIN, WEIGHT_KG_MAX);
    if (w !== null) {
      weights.push({ weekStart: week, value: w });
      seen.weight.add(week);
    }
    // Pas de repli `outcomes` pour le tour de taille: aucun autre écrivain n'y
    // existe, et inventer une clé de repli créerait un lecteur sans écrivain —
    // le défaut exact que le repli du poids documente.
    const c = derived.waist.get(week) ??
      readMeasure(typed, "waist_cm", null, WAIST_CM_MIN, WAIST_CM_MAX);
    if (c !== null) {
      waists.push({ weekStart: week, value: c });
      seen.waist.add(week);
    }
  }

  // Les semaines que SEULE la table datée connaît — un élève qui se pèse en
  // conversation sans jamais remplir de point hebdo n'a aucune ligne de revue,
  // et sa série serait vide si on n'ajoutait que ce que `weekly_reviews` porte.
  for (const [kind, out] of [["weight", weights], ["waist", waists]] as const) {
    for (const [week, value] of derived[kind]) {
      if (!seen[kind].has(week)) out.push({ weekStart: week, value });
    }
    out.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  return {
    verdict: assessBirthDate(profile.birth_date, todayLocalIso),
    timezone: String(profile.timezone ?? "").trim() || null,
    heightCm: readHeightCm(profile.height_cm),
    gender: readGender(profile.gender),
    activityLevel: readActivityLevel(profile.activity_level),
    activityAxes: {
      day: readDayActivity(profile.day_activity),
      sport: readSportFrequency(profile.sport_frequency),
      asked: String(profile.activity_axes_asked_at ?? "").trim() !== "",
    },
    weights,
    waists,
  };
}

/** La dernière mesure d'une série, ou `null`. */
export function latest(measures: readonly DatedMeasure[]): DatedMeasure | null {
  return measures.length > 0 ? measures[measures.length - 1] : null;
}

/**
 * FF-030 — LE CORPS, MIS À LA FORME QU'UNE CONSIGNE DE COMPOSITION LIT.
 *
 * ── POURQUOI CETTE JOINTURE VIT DANS LA COUCHE IO ──────────────────────────
 * C'est ici qu'on sait que l'âge se DÉRIVE d'un `birth_date` (jamais d'une
 * colonne d'âge, qui serait fausse le lendemain d'un anniversaire), et que la
 * « dernière » mesure est la queue d'une série rendue du plus ancien au plus
 * récent. `meal_body.ts` reste pur et ne connaît que la forme d'arrivée.
 *
 * ── `restrictionFlag` EST UN PARAMÈTRE, PAS UNE LECTURE ────────────────────
 * Ce module ne va PAS chercher le plancher lui-même, et c'est délibéré:
 * `evaluateRestrictionForStudent` fait trois requêtes et son arbitrage
 * d'échec appartient à l'appelant (FF-030 R6 le veut fail-closed sur cette
 * lane, là où `meal-photo-upload-v1` le veut fail-open sur la sienne, pour des
 * raisons écrites des deux côtés). Le rendre implicite ici imposerait un des
 * deux arbitrages à l'autre lane, en silence.
 *
 * Il reste REQUIS: on ne peut pas construire ce contexte sans avoir répondu à
 * la question. C'est la moitié « type » de la garde dont `meal_body.ts` porte
 * la moitié « comportement ».
 */
export function mealBodyContextFrom(
  snapshot: StudentBodySnapshot,
  restrictionFlag: boolean,
): MealBodyContext {
  return {
    heightCm: snapshot.heightCm,
    // DÉRIVÉE, à chaque lecture, et en BANDE (FF-030 R8). `usableAge` rend
    // `null` sur tout ce qui n'est ni `minor` ni `adult`, donc une date
    // illisible ou aberrante ne produit pas de bande — elle n'en invente pas
    // une « par défaut », qui serait une propriété fausse sur une personne.
    ageBand: ageBandOf(usableAge(snapshot.verdict)),
    gender: snapshot.gender,
    latestWeight: latest(snapshot.weights),
    latestWaist: latest(snapshot.waists),
    // CE CHEMIN EST CELUI D'UN COMPTE: il porte des pesées DATÉES, pas une
    // fiche. Le poids déclaré n'existe que pour les bouches sans compte, et il
    // est posé par `loadHouseholdMemberBodies`. Le laisser à `null` ici est ce
    // qui garantit qu'une série ne se fera jamais doubler par une déclaration.
    declaredWeightKg: null,
    restrictionFlag,
    // LE CRAN D'ACTIVITÉ, tel que `readActivityLevel` l'a déjà lu au-dessus:
    // aucune lecture nouvelle, aucune requête de plus. `null` quand personne
    // n'a répondu — et `meal_body.ts` n'écrit alors aucune ligne.
    activityLevel: snapshot.activityLevel,
  };
}

// ---------------------------------------------------------------------------
// L'escalade « mineur » — le coach l'apprend, il n'a pas à la déduire
// ---------------------------------------------------------------------------

export interface MinorEscalation {
  escalated: boolean;
  reason: "raised" | "already_open";
  contractChangeRequestId: string | null;
}

/**
 * C5 ① — LA LANGUE DE LA PROSE QUE **CE MODULE** ÉCRIT, PAS CELLE DE L'ÉLÈVE.
 *
 * ── LE DÉFAUT QU'ELLE FERME (QA du 2026-08-12) ────────────────────────────
 * `contract_change_requests.content_locale` est `not null` SANS DÉFAUT
 * (20260727090000, « R2: prose rows carry a locale »). L'insert ci-dessous
 * l'avait perdu en recopiant `escalateRestrictionSignal`, et l'escalade ne
 * pouvait donc JAMAIS atterrir:
 *
 *     HTTP 500  {"ok":false,"error":"[object Object]"}   en 5,5 s
 *     system_error_logs: 'null value in column "content_locale" … 23502'
 *     select count(*) … where reason_code='minor_student'  →  0
 *
 * Le `409 minor_student` était donc INATTEIGNABLE, aucune ligne d'escalade
 * n'existait, et le coach n'apprenait jamais qu'un mineur avait été bloqué. La
 * génération était bien bloquée — par un 500, c'est-à-dire par accident.
 *
 * ── D'OÙ VIENT LA VALEUR, ET POURQUOI CE N'EST PAS UNE DEVINETTE ──────────
 * Du FRÈRE, qui n'a pas le défaut: `restrictionEffect` (restriction_guard.ts)
 * type sa ligne avec `content_locale: "en"` — un littéral, pas une variable —
 * parce que la prose de cette ligne est écrite EN DUR EN ANGLAIS par le module
 * lui-même. R3 (`_shared/keel/locale.ts`) sépare `ui_locale`,
 * `conversation_locale` et `content_locale`: cette colonne dit dans quelle
 * langue est le TEXTE DE LA LIGNE, pas dans quelle langue l'élève parle.
 * Écrire ici `profiles.locale` ferait mentir la colonne — la phrase resterait
 * anglaise et se déclarerait française.
 *
 * ⚠️ LE JOUR OÙ CETTE PHRASE SERA TRADUITE, CETTE CONSTANTE DOIT BOUGER AVEC
 * ELLE. Un test les tient ensemble (`student_body_test.ts`).
 */
export const MINOR_ESCALATION_CONTENT_LOCALE = "en";

/** La ligne exacte que l'escalade insère. Type litéral sur `content_locale`,
 * comme `RestrictionContractChangeRequest`: retirer la clé ne compile plus,
 * au lieu de rendre `23502` en production. */
export interface MinorEscalationRow {
  user_id: string;
  reason_code: "minor_student";
  raised_by: "system";
  urgency: "immediate";
  status: "open";
  student_words: string;
  content_locale: typeof MINOR_ESCALATION_CONTENT_LOCALE;
}

/**
 * LA LIGNE, CONSTRUITE À PART DE L'INSERT — et c'est ce qui la rend testable.
 *
 * Le défaut de ① était invisible à tout test pur parce qu'aucun test ne pouvait
 * VOIR la ligne sans une base: elle naissait à l'intérieur d'un `.insert(…)`.
 * Ici elle existe avant d'être écrite, donc une assertion sur ses colonnes
 * `not null` ne demande plus une pile vivante.
 */
export function minorEscalationRow(userId: string, age: number): MinorEscalationRow {
  return {
    user_id: userId,
    reason_code: "minor_student",
    raised_by: "system",
    urgency: "immediate",
    status: "open",
    // L'âge, pas la date: le coach a besoin de savoir qu'il accompagne un
    // mineur et de combien, pas de sa date de naissance.
    student_words: `This student is ${age} — under 18. Plan generation is held ` +
      `until you decide: nutrition coaching for a minor sits inside your ` +
      `professional framework, not ours.`,
    // ⚠️ R2 — SANS ELLE, RIEN N'ATTERRIT. Voir
    // `MINOR_ESCALATION_CONTENT_LOCALE` juste au-dessus: c'est la langue de la
    // phrase ci-dessus, pas celle de l'élève.
    content_locale: MINOR_ESCALATION_CONTENT_LOCALE,
  };
}

/**
 * Écrit la ligne `contract_change_requests` qu'un mineur détecté doit au coach.
 *
 * Idempotent PAR LIGNE OUVERTE, pas par jour: l'élève va réessayer de générer
 * sa semaine, et trente alertes identiques pour un seul fait ne sont pas trente
 * fois plus d'information — c'est une boîte de réception que le coach cesse de
 * lire. Repris mot pour mot de `escalateRestrictionSignal`, qui a déjà arbitré
 * ça.
 *
 * `raised_by: 'system'`: ni l'élève ni Sophia n'ont demandé cette alerte, c'est
 * une règle du produit qui l'a levée.
 */
export async function escalateMinorStudent(
  db: Db,
  params: { userId: string; age: number },
): Promise<MinorEscalation> {
  const { data: existing, error: existingErr } = await db
    .from("contract_change_requests")
    .select("id")
    .eq("user_id", params.userId)
    .eq("reason_code", "minor_student")
    .eq("status", "open")
    .limit(1);
  if (existingErr) throw existingErr;
  const openRow = ((existing ?? []) as Array<Record<string, unknown>>)[0];
  if (openRow) {
    return {
      escalated: false,
      reason: "already_open",
      contractChangeRequestId: String(openRow.id ?? "") || null,
    };
  }

  const { data, error } = await db
    .from("contract_change_requests")
    .insert(minorEscalationRow(params.userId, params.age))
    // Vérité d'exécution: la ligne est RELUE, donc l'appelant ne journalise
    // jamais « escaladé » sur un insert qu'il n'a pas vu atterrir.
    .select("id")
    .single();
  if (error) throw error;
  return {
    escalated: true,
    reason: "raised",
    contractChangeRequestId: String((data as Record<string, unknown>)?.id ?? "") || null,
  };
}
