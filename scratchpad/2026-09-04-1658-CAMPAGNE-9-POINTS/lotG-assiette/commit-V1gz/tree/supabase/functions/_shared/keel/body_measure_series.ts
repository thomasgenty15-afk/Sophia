/**
 * FF-031 — LA DÉRIVATION HEBDOMADAIRE D'UNE SÉRIE DE MESURES DATÉES.
 *
 * Fiche: `docs/fonctionnalites/suivi-quotidien/FF-031-mesures-corporelles-datees.md`
 *
 * ── POURQUOI CE MODULE EXISTE ───────────────────────────────────────────────
 * Le poids ne vit plus sur une ligne de semaine. Il vit dans
 * `student_body_measures`, une ligne par pesée, avec son instant.
 *
 * Or `restriction_guard.ts` — le plancher TCA, la ceinture la plus sensible du
 * produit — exige une SÉRIE HEBDOMADAIRE: ascendante, sans doublon, dont les
 * écarts sont des multiples de sept jours. Son contrat ne bouge pas (FF-031
 * R2): changer le stockage sous lui sans lui rendre cette série le désarme, et
 * une ceinture désarmée ne rend pas une erreur — elle rend
 * `restriction_flag: false`, c'est-à-dire « tout va bien ».
 *
 * Ce module est le pont, et il est PUR: aucune I/O, aucune horloge, aucun
 * import qui touche la base. Même frontière que partout dans `_shared/keel/` —
 * tout ce qui peut être faux (SQL, jsonb, fuseaux) vit dans la couche IO; tout
 * ce qui décide vit ici et se teste sans stack.
 *
 * ── LES DEUX TEMPS DE L'AGRÉGATION, ET ILS NE SONT PAS INTERCHANGEABLES ─────
 *   1. PAR JOUR — la DERNIÈRE mesure du jour gagne.
 *   2. PAR SEMAINE — la MOYENNE des valeurs journalières, au dixième.
 *
 * Moyenner directement les mesures brutes serait plus court et FAUX: un élève
 * qui tape « 87 » puis se corrige « pardon, 78 » verrait 82,5 s'inscrire dans
 * sa semaine — la moyenne d'un chiffre et de son démenti. Le passage par le
 * jour ferme ce cas, et il est testé.
 *
 * ── POURQUOI UNE MOYENNE, ET POURQUOI CE N'EST PAS UN CHANGEMENT DE SEUIL ───
 * Le champ que le garde lit s'appelle `weight_7d_avg_kg` depuis le premier
 * jour, et rien n'a jamais pu le calculer: le modèle pivot n'avait qu'un poids
 * par semaine. Le bruit hydrique d'un jour à l'autre (±1 à 2 kg) est du MÊME
 * ORDRE que le seuil de 1,2 %/semaine (≈ 1,9 kg sur 14 jours à 80 kg): un
 * point unique laisse ce bruit entier, une moyenne le divise par √n.
 *
 * Et surtout: UNE SEMAINE À UNE SEULE MESURE REND CETTE MESURE. Toutes les
 * données existantes, et tous les cas de `restriction_guard_test.ts`, gardent
 * donc exactement le résultat qu'ils ont aujourd'hui. La moyenne ne change le
 * chiffre que là où il existe des jours à moyenner — c'est-à-dire là où le
 * produit ne savait rien garder avant ce chantier.
 *
 * ── L'UNION, ET C'EST L'ENDROIT OÙ ÇA CASSE ────────────────────────────────
 * Le déclencheur n° 1 (`rapid_weight_loss`) lit le POIDS. Le déclencheur n° 4
 * (`overclaimed_adherence_with_hidden_logging`) lit `self_rated_adherence` et
 * `logging_coverage`, qui restent sur `weekly_reviews` et n'iront pas dans la
 * table des mesures. Les deux sources doivent donc être FUSIONNÉES, pas
 * choisies: ne lire que les mesures éteint le n° 4, ne lire que les revues
 * éteint le n° 1 pour tout élève qui ne parle qu'à la conversation. Dans les
 * deux cas, en silence.
 */

import type { WeeklyOutcomeSample } from "./restriction_guard.ts";
import type { BodyMeasureKind } from "./body_measure_floor.ts";

export type { BodyMeasureKind };

// ---------------------------------------------------------------------------
// Les entrées
// ---------------------------------------------------------------------------

/** Une ligne de `student_body_measures`, réduite à ce que la dérivation lit. */
export interface DatedBodyMeasure {
  /**
   * `local_date` — le jour de l'ÉLÈVE dans SON fuseau, YYYY-MM-DD.
   *
   * Stockée à côté de `measured_at` plutôt que dérivée de lui, et le groupement
   * se fait sur ELLE. Reconvertir un `timestamptz` en jour ici referait, mal,
   * une conversion de fuseau que l'écrivain avait déjà faite juste — et ferait
   * changer de jour, donc parfois de semaine, la mesure de la moitié de la
   * planète.
   */
  localDate: string;
  kind: BodyMeasureKind;
  /** En SI: kg pour le poids, cm pour le tour de taille. */
  valueSi: number;
  /**
   * `measured_at`, ISO. Sert UNIQUEMENT à départager deux mesures du même jour.
   * À égalité, la dernière de la liste gagne (l'appelant lit en ordre stable).
   */
  measuredAt: string;
}

/**
 * Ce que `weekly_reviews` apporte et que la table de mesures n'a pas.
 *
 * Assemblée par `restriction_runtime`, qui fait déjà la conversion bruyante de
 * `logging_coverage` (fraction 0..1) en jours entiers 0..7.
 */
export interface WeeklyContextRow {
  weekStartDate: string;
  selfRatedAdherence: number | null;
  loggingCoverageDays: number | null;
}

// ---------------------------------------------------------------------------
// Les sorties
// ---------------------------------------------------------------------------

/** Une semaine, telle que la dérivation la voit — plus riche que le garde. */
export interface WeeklyBodyPoint {
  /** Le lundi ISO de la semaine, YYYY-MM-DD. */
  weekStart: string;
  /** La moyenne des valeurs journalières, au dixième. */
  value: number;
  /** Combien de JOURS distincts ont porté une mesure cette semaine-là. */
  days: number;
  /** Le dernier jour mesuré de la semaine — la vraie date, pas le lundi. */
  lastLocalDate: string;
}

// ---------------------------------------------------------------------------
// R7 — tout ce qui est incohérent JETTE. Rien ne dégrade en « pas de mesure ».
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/body_measure_series] ${message}`);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jours entiers depuis l'epoch. UTC, aucune arithmétique d'heure d'été. */
function isoDateToDays(value: unknown, field: string): number {
  const raw = String(value ?? "").trim();
  const match = ISO_DATE.exec(raw);
  if (!match) fail(`${field} n'est pas au format YYYY-MM-DD: ${JSON.stringify(value)}`);
  const [, y, m, d] = match!;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const back = new Date(utc);
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(m) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    fail(`${field} n'est pas une date réelle: ${JSON.stringify(value)}`);
  }
  return Math.round(utc / 86_400_000);
}

function daysToIsoDate(days: number): string {
  const d = new Date(days * 86_400_000);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${
    String(d.getUTCMonth() + 1).padStart(2, "0")
  }-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Le LUNDI ISO de la semaine qui contient `localDate`.
 *
 * ⚠️ C'est la seule fonction du module autorisée à fabriquer une clé de
 * semaine. `restriction_guard` exige que l'écart entre deux semaines soit un
 * multiple de sept jours: la seule façon de le garantir est que TOUTES les
 * clés soient des lundis, calculés au même endroit. Un second calcul « à la
 * main » quelque part est l'endroit exact où le décalage d'un jour entre.
 *
 * Même arithmétique que `week_review_io.weekStartOfLocalDate` — l'epoch UTC
 * commence un jeudi, d'où le `+3`.
 */
export function isoWeekStartOf(localDate: string, field = "localDate"): string {
  const days = isoDateToDays(localDate, field);
  return daysToIsoDate(days - ((days + 3) % 7));
}

/**
 * Un nombre fini, et `""` NE VAUT PAS ZÉRO.
 *
 * ⚠️ `Number("")` vaut **0** et `Number.isFinite(0)` vaut **true**. Ce dépôt a
 * déjà payé ce piège deux fois — `readScale` dans `weekly_flow.ts` (un axe
 * absent ressortait en « 0 is outside 1-5 ») et `targetValueOf` côté écran (une
 * référence de poids jamais saisie devenait une fourchette centrée sur zéro,
 * et l'élève lisait « you have drifted outside your range » à 73 kg). Ici, un
 * zéro fabriqué deviendrait une pesée de 0 kg dans une moyenne, donc une perte
 * spectaculaire dans une ceinture de sécurité.
 *
 * `numeric` de PostgREST peut arriver en nombre ou en chaîne selon le client:
 * les deux sont acceptés, le vide et le non-numérique jamais.
 */
function assertFinite(value: unknown, field: string): number {
  const usable = typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const n = usable ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) {
    fail(`${field} doit être un nombre fini, reçu ${JSON.stringify(value)}`);
  }
  return n;
}

/** Un dixième — la précision d'une balance, et celle du formulaire. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * L'instant d'une mesure, en millisecondes. Sert au départage intra-journée.
 *
 * Un `measured_at` illisible JETTE plutôt que de valoir zéro: à zéro il
 * perdrait tous les départages et une correction cesserait de gagner — un
 * défaut invisible qui ne se manifesterait que sur le chiffre.
 */
function measuredAtMs(value: unknown, field: string): number {
  const raw = String(value ?? "").trim();
  if (raw === "") fail(`${field} est requis (départage des mesures du même jour)`);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    fail(`${field} n'est pas un instant lisible: ${JSON.stringify(value)}`);
  }
  return ms;
}

// ---------------------------------------------------------------------------
// TEMPS 1 — par jour, la dernière mesure gagne
// ---------------------------------------------------------------------------

export interface DailyBodyValue {
  localDate: string;
  value: number;
}

/**
 * Une valeur par JOUR, du plus ancien au plus récent.
 *
 * « La dernière gagne » est la règle de CORRECTION: un élève qui se trompe et
 * se reprend doit voir sa reprise l'emporter. Elle a un coût assumé, écrit dans
 * FF-031 §7 et laissé ouvert en §11 — deux pesées volontaires le même jour
 * (matin et soir) sont indiscernables d'une correction, et le soir gagne.
 */
export function dailyValues(
  measures: readonly DatedBodyMeasure[],
  kind: BodyMeasureKind,
): DailyBodyValue[] {
  if (!Array.isArray(measures)) fail("measures doit être un tableau");
  const byDay = new Map<string, { value: number; at: number }>();
  measures.forEach((row, index) => {
    const field = `measures[${index}]`;
    if (!row || typeof row !== "object") fail(`${field} doit être un objet`);
    if (row.kind !== "weight" && row.kind !== "waist") {
      fail(`${field}.kind inconnu: ${JSON.stringify(row.kind)}`);
    }
    if (row.kind !== kind) return;
    // Valide la date MÊME pour une grandeur qu'on ne retient pas: une ligne
    // cassée est une ligne cassée, et la découvrir seulement quand on lit
    // l'autre grandeur rendrait le défaut intermittent.
    const localDate = String(row.localDate ?? "").trim();
    isoDateToDays(localDate, `${field}.localDate`);
    const value = assertFinite(row.valueSi, `${field}.valueSi`);
    const at = measuredAtMs(row.measuredAt, `${field}.measuredAt`);
    const previous = byDay.get(localDate);
    // `>=` et pas `>`: à instant égal, la dernière de la liste gagne. L'appelant
    // lit dans un ordre stable (`measured_at`, puis `id`), donc « la dernière »
    // veut dire quelque chose.
    if (previous === undefined || at >= previous.at) {
      byDay.set(localDate, { value, at });
    }
  });
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([localDate, entry]) => ({ localDate, value: entry.value }));
}

// ---------------------------------------------------------------------------
// TEMPS 2 — par semaine, la moyenne des jours
// ---------------------------------------------------------------------------

/**
 * Une valeur par SEMAINE ISO, du plus ancien au plus récent.
 *
 * La sortie est ascendante, sans doublon, et toutes ses clés sont des lundis —
 * les trois invariants que `restriction_guard` exige. Ils ne sont pas vérifiés
 * après coup: ils sont vrais par construction (clé de Map + `isoWeekStartOf` +
 * tri), ce qui est la seule façon de ne pas avoir à y penser.
 */
export function weeklyBodyPoints(
  measures: readonly DatedBodyMeasure[],
  kind: BodyMeasureKind,
): WeeklyBodyPoint[] {
  const byWeek = new Map<string, DailyBodyValue[]>();
  for (const day of dailyValues(measures, kind)) {
    const week = isoWeekStartOf(day.localDate, "measures[].localDate");
    const bucket = byWeek.get(week);
    if (bucket) bucket.push(day);
    else byWeek.set(week, [day]);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, days]) => {
      const sum = days.reduce((acc, d) => acc + d.value, 0);
      return {
        weekStart,
        value: round1(sum / days.length),
        days: days.length,
        // `dailyValues` rend les jours triés: le dernier est le plus récent.
        lastLocalDate: days[days.length - 1].localDate,
      };
    });
}

// ---------------------------------------------------------------------------
// L'UNION — ce que le plancher TCA reçoit
// ---------------------------------------------------------------------------

/**
 * La série hebdomadaire que `restriction_guard` attend, à partir des mesures
 * datées ET des lignes de revue hebdomadaire.
 *
 * ── CE QUE LA SORTIE GARANTIT ─────────────────────────────────────────────
 *   · ascendante par `week_start_date`, sans doublon;
 *   · toutes les clés sont des lundis ISO, donc tous les écarts sont des
 *     multiples de sept jours (l'invariant « série hebdomadaire » du garde);
 *   · une semaine sans mesure porte `weight_7d_avg_kg: null` — jamais 0.
 *     `null` veut dire « pas reporté », et `weeklyLossPct` ignore la paire au
 *     lieu d'y lire une perte de 100 %.
 *
 * ── LES CLÉS DE `weekly_reviews` SONT RECALÉES, PAS REFUSÉES ──────────────
 * Une `week_start_date` qui ne serait pas un lundi est recalée sur le lundi de
 * sa semaine, et deux lignes qui atterrissent sur le même lundi sont
 * dédoublonnées (la dernière de la liste gagne — l'appelant a déjà trié et
 * dédoublonné par `created_at`). Refuser serait plus bruyant et plus juste sur
 * le papier; en pratique ça ferait JETER la ceinture sur une donnée héritée, et
 * une ceinture qui jette est une ceinture qui ne mord pas. Le lundi de la
 * semaine est la seule lecture défendable d'une clé de semaine mal posée.
 *
 * @param kind la grandeur qui arme la ceinture. `weight` en production; le
 *   paramètre existe pour que le tour de taille puisse être dérivé par le même
 *   code, pas pour qu'on choisisse ce que le plancher regarde.
 */
export function deriveWeeklyOutcomeSamples(args: {
  measures: readonly DatedBodyMeasure[];
  weeks: readonly WeeklyContextRow[];
  kind?: BodyMeasureKind;
}): WeeklyOutcomeSample[] {
  const kind = args.kind ?? "weight";
  const points = weeklyBodyPoints(args.measures ?? [], kind);

  if (!Array.isArray(args.weeks)) fail("weeks doit être un tableau");
  const context = new Map<
    string,
    { selfRated: number | null; loggedDays: number | null }
  >();
  args.weeks.forEach((row, index) => {
    const field = `weeks[${index}]`;
    if (!row || typeof row !== "object") fail(`${field} doit être un objet`);
    const week = isoWeekStartOf(row.weekStartDate, `${field}.weekStartDate`);
    context.set(week, {
      selfRated: row.selfRatedAdherence ?? null,
      loggedDays: row.loggingCoverageDays ?? null,
    });
  });

  const weights = new Map(points.map((p) => [p.weekStart, p.value]));
  const allWeeks = [...new Set([...weights.keys(), ...context.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  return allWeeks.map((week) => {
    const ctx = context.get(week);
    return {
      week_start_date: week,
      weight_7d_avg_kg: weights.has(week) ? weights.get(week)! : null,
      self_rated_adherence: ctx?.selfRated ?? null,
      logging_coverage_days: ctx?.loggedDays ?? null,
    };
  });
}
