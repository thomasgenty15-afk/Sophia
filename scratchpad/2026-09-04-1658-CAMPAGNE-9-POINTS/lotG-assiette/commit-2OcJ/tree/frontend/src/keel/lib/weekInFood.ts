/**
 * PIVOT C8 — « Your week in food » : l'agrégation du journal alimentaire.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE
 * ---------------------------------------------------------------------------
 * Chaque photo écrit déjà en base les aliments détectés, les groupes présents
 * et la taille de l'assiette. Ce qui n'existait pas, c'est l'étage au-dessus :
 * personne ne transformait 14 lignes en « ta semaine alimentaire ». L'élève
 * photographiait dans le vide — le payoff visible du geste quotidien, c'est ce
 * fichier.
 *
 * UNE implémentation, DEUX lecteurs : l'élève (/app/progress, ses propres
 * `protocol_events`) et le coach (fiche élève, la vue Tier B
 * `coach_student_events`). Même règle que WeekView : ce que l'élève voit, le
 * coach le voit, et le seul moyen que ça reste vrai est qu'il n'y ait pas de
 * seconde implémentation à maintenir.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE MODULE NE PRODUIT JAMAIS
 * ---------------------------------------------------------------------------
 * Pas une calorie, pas un gramme de macro, pas un pourcentage-objectif. Des
 * COMPTES (« vegetables at 9 of 13 meals ») — c'est l'analyse de fréquence
 * qu'un diététicien fait d'un journal alimentaire, et c'est honnête là où le
 * chiffre calorique mesuré sur notre propre modèle ment de −26,6 %.
 *
 * La seule exception vit dans `coachStartingNumbers`, et elle est d'une autre
 * NATURE : des besoins dérivés du POIDS CORPOREL (arithmétique par kg,
 * déterministe), jamais des photos. Réservée à l'écran du coach — la personne
 * qualifiée pour prescrire. Aucun chemin élève ne l'appelle, et le rester est
 * une règle produit, pas un hasard.
 */

import { en } from "../i18n/en";
import type { MessageKey } from "../i18n/t";
import { t } from "../i18n/t";

export interface FoodEventRow {
  local_date: string;
  slot_key: string | null;
  portion_band: string | null;
  food_group_ref: string | null;
  /**
   * FF-009 — `protocol_events.source`. Optionnel: certains appelants ne le
   * sélectionnent pas, et `undefined` veut alors dire « pas lu », jamais
   * « pas une photo ».
   */
  source?: string | null;
  /**
   * FF-009 — `protocol_events.plan_relation`: `as_planned` | `off_plan` | null.
   * `null` est un état (« inconnu »), jamais un défaut à combler.
   */
  plan_relation?: string | null;
  recognized: {
    /**
     * `label` est le nom ANGLAIS (un matcher serveur le lit);
     * `label_localized` est le nom dans la langue de l'élève, absent sur toute
     * ligne analysée avant `meal_analysis.v4`.
     */
    detected_foods?: Array<
      { label?: string | null; label_localized?: string | null }
    > | null;
    food_groups_present?: string[] | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Le vocabulaire (R1 : les tokens viennent du vocab fermé de labels.en.ts)
// ---------------------------------------------------------------------------

export const VEG_GROUPS: readonly string[] = [
  "leafy_greens",
  "cruciferous_veg",
  "non_starchy_veg",
  "starchy_veg",
];
/**
 * LES SOURCES DE PROTÉINES — les laitages inclus, et c'était un défaut.
 *
 * Mesuré sur une vraie ligne: un bol d'avoine au fromage blanc, identifié par
 * le modèle avec 0,95 et 0,98 de confiance, rendait « protein at 0 of 1 meals »
 * — parce que `dairy_yogurt` et `dairy_cheese` n'appartenaient à AUCUN des
 * trois paniers. Ce n'est pas un manque d'affichage, c'est une affirmation
 * fausse: le yaourt grec est l'une des sources de protéines les plus courantes
 * d'un petit-déjeuner, et l'élève lisait qu'il n'en avait pas eu.
 *
 * La liste suit les classes du catalogue serveur (`FOOD_GROUP_CLASSES` dans
 * `_shared/keel/meal_analysis.ts`), qui range `legumes` en `legume` et les
 * laitages en `dairy`: on regroupe ici par ce que l'aliment APPORTE, ce qui est
 * la question que l'élève se pose, et pas par la taxonomie du catalogue.
 */
export const PROTEIN_GROUPS: readonly string[] = [
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "legumes",
  "tofu_tempeh",
  "dairy_yogurt",
  "dairy_cheese",
];
export const FRUIT_GROUPS: readonly string[] = ["berries", "citrus", "other_fruit"];

/**
 * Les groupes « à l'œil » — affichés en COMPTE, jamais en jugement. « Fried
 * food ×3 » est un fait qu'un coach sait lire ; « attention aux fritures » est
 * une morale qu'on ne rend pas.
 */
export const WATCH_GROUPS: readonly string[] = [
  "fried_food",
  "sugar_sweets",
  "sweetened_beverage",
  "alcohol",
];

/**
 * LE MOT D'UN GROUPE — LU DANS LE SEED, PLUS DANS UNE TABLE LOCALE.
 *
 * ── CE QUE ÇA RÉPARE ──────────────────────────────────────────────────────
 * Un `GROUP_LABELS` vivait ici avec ses quatre phrases anglaises en dur, alors
 * que `food_group.fried_food`, `.sugar_sweets`, `.sweetened_beverage` et
 * `.alcohol` sont dans le seed ET traduits depuis le lot 3. C'était une
 * CINQUIÈME copie du même vocabulaire, invisible à la garde de `t()` comme au
 * scanner de coutures — et elle sortait « Fried food ×3 » au milieu de la fiche
 * française d'un élève, sur `/coach/clients/:id`.
 *
 * ── POURQUOI PAS `foodGroupLabel()` D'`api/labels.ts` ─────────────────────
 * Parce que celui-là LÈVE sur un jeton inconnu (R7 strict), et que ce
 * compteur-ci lit `recognized.detected_foods`, c'est-à-dire une sortie de
 * modèle: un groupe neuf y apparaît AVANT d'entrer dans le seed. Un écran de
 * coach qui tombe parce qu'un modèle a inventé un mot est pire que le mot. R7
 * reste donc ADOUCI ici, et il l'est délibérément — mais il ne l'est plus
 * qu'après avoir demandé au seed.
 *
 * ── LA MAJUSCULE EST À NOUS ───────────────────────────────────────────────
 * Les `food_group.*` sont des FRAGMENTS de phrase, écrits en minuscules pour se
 * coller dans « 2 portions de fritures ». Ici, ils commencent une pastille de
 * compte: la capitale se pose au rendu, pas dans le seed.
 */
export function labelForGroup(token: string): string {
  const key = `food_group.${token}`;
  const pretty = Object.prototype.hasOwnProperty.call(en, key)
    ? t(key as MessageKey)
    : token.replace(/_/g, " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

// ---------------------------------------------------------------------------
// L'agrégat
// ---------------------------------------------------------------------------

export interface WeekInFoodSummary {
  meals: number;
  daysLogged: number;
  daysInRange: number;
  /**
   * FF-009 — LES TROIS COMPTES, ET ILS NE SE SOMMENT JAMAIS.
   *
   * Une coche est exacte, une photo est biaisée, un repas hors plan est autre
   * chose. `meals` reste le total des faits LUS, ce qui est vrai; ces trois-là
   * disent de quoi il est fait, et aucune surface n'a le droit d'en afficher la
   * somme ni un taux. « 71 % de repas comme prévu » est un score d'adhérence
   * déguisé, et `adherence_score` est suspendu par la garde de restriction.
   */
  asPlannedMeals: number;
  offPlanMeals: number;
  photoMeals: number;
  /** Repas où au moins un groupe protéiné est présent. */
  proteinMeals: number;
  vegMeals: number;
  fruitMeals: number;
  /** Uniquement les groupes « watch » VUS (count > 0), triés par compte. */
  watchCounts: Array<{ group: string; label: string; count: number }>;
  /** Aliments détectés ≥ 2 fois, top 6, comptés sur libellé normalisé. */
  topFoods: Array<{ label: string; count: number }>;
  /** Dîners et combien étaient larges. Null si aucun dîner loggé. */
  dinnerLarge: { large: number; total: number } | null;
  /** Dates de la fenêtre sans AUCUN log. Vide si `dates` absent. */
  missingDays: string[];
  /**
   * Direction de la présence de légumes vs la période précédente. Le biais
   * systématique d'un même instrument s'annule dans une comparaison — on peut
   * donner la DIRECTION sans jamais donner un chiffre absolu. Null tant que
   * l'une des deux périodes a moins de 4 repas : une tendance sur 2 points
   * n'est pas une tendance.
   */
  vegTrend: "up" | "down" | "steady" | null;
}

function groupsOf(row: FoodEventRow): Set<string> {
  const set = new Set<string>();
  for (const g of row.recognized?.food_groups_present ?? []) {
    const t = String(g ?? "").trim();
    if (t) set.add(t);
  }
  const ref = String(row.food_group_ref ?? "").trim();
  if (ref) set.add(ref);
  return set;
}

function mealsWithAny(rows: FoodEventRow[], groups: readonly string[]): number {
  return rows.filter((r) => {
    const gs = groupsOf(r);
    return groups.some((g) => gs.has(g));
  }).length;
}

function vegRate(rows: FoodEventRow[]): number | null {
  if (rows.length < 4) return null;
  return mealsWithAny(rows, VEG_GROUPS) / rows.length;
}

export function aggregateWeekInFood(
  rows: FoodEventRow[],
  opts: {
    /** Les dates EXACTES de la fenêtre, pour nommer les jours sans log. */
    dates?: string[];
    /** La période précédente, pour la direction. */
    prevRows?: FoodEventRow[];
  } = {},
): WeekInFoodSummary {
  const dates = opts.dates ?? [];

  // Groupes « watch », comptés par repas où le groupe apparaît.
  const watch = WATCH_GROUPS
    .map((group) => ({
      group,
      label: labelForGroup(group),
      count: mealsWithAny(rows, [group]),
    }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));

  // Aliments détectés : compte sur libellé normalisé, tri déterministe.
  //
  // ⚠️ ON COMPTE SUR `label`, ON AFFICHE `label_localized`. Compter sur le
  // localisé ferait deux compteurs pour un seul aliment — les lignes d'avant
  // `meal_analysis.v4` n'en portent pas, et rien ne les réécrit (ce sont des
  // lectures faites à une date, pas des données à normaliser). La clé reste
  // donc l'anglais, stable sur toute l'histoire de la table; le nom affiché est
  // le dernier localisé rencontré pour cette clé, et l'anglais à défaut.
  const foodCounts = new Map<string, number>();
  const foodDisplay = new Map<string, string>();
  for (const row of rows) {
    for (const f of row.recognized?.detected_foods ?? []) {
      const norm = String(f?.label ?? "").trim().toLowerCase();
      if (!norm) continue;
      foodCounts.set(norm, (foodCounts.get(norm) ?? 0) + 1);
      const localized = String(f?.label_localized ?? "").trim();
      if (localized) foodDisplay.set(norm, localized);
    }
  }
  const topFoods = [...foodCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([key, count]) => {
      const label = foodDisplay.get(key) ?? key;
      return { label: label.charAt(0).toUpperCase() + label.slice(1), count };
    });

  const dinners = rows.filter((r) => (r.slot_key ?? "") === "dinner");
  const dinnerLarge = dinners.length === 0 ? null : {
    large: dinners.filter((r) => r.portion_band === "large").length,
    total: dinners.length,
  };

  const daysWith = new Set(rows.map((r) => r.local_date));

  let vegTrend: WeekInFoodSummary["vegTrend"] = null;
  const nowRate = vegRate(rows);
  const prevRate = opts.prevRows ? vegRate(opts.prevRows) : null;
  if (nowRate !== null && prevRate !== null) {
    const diff = nowRate - prevRate;
    vegTrend = diff > 0.1 ? "up" : diff < -0.1 ? "down" : "steady";
  }

  return {
    meals: rows.length,
    asPlannedMeals: rows.filter((r) => r.plan_relation === "as_planned").length,
    offPlanMeals: rows.filter((r) => r.plan_relation === "off_plan").length,
    photoMeals: rows.filter((r) => r.source === "photo").length,
    daysLogged: daysWith.size,
    daysInRange: dates.length,
    proteinMeals: mealsWithAny(rows, PROTEIN_GROUPS),
    vegMeals: mealsWithAny(rows, VEG_GROUPS),
    fruitMeals: mealsWithAny(rows, FRUIT_GROUPS),
    watchCounts: watch,
    topFoods,
    dinnerLarge,
    missingDays: dates.filter((d) => !daysWith.has(d)),
    vegTrend,
  };
}

// ---------------------------------------------------------------------------
// Les chiffres de départ du coach — depuis le POIDS, jamais depuis les photos
// ---------------------------------------------------------------------------

export interface CoachStartingNumbers {
  /** kcal/jour, fourchette de maintenance ~28-33 kcal/kg, arrondie aux 50. */
  maintenanceLow: number;
  maintenanceHigh: number;
  /** g/jour de protéines, 1.6-2.2 g/kg (Morton 2018), arrondis aux 5. */
  proteinLow: number;
  proteinHigh: number;
  weightKg: number;
}

/**
 * Des FOURCHETTES de départ, pas une prescription — et côté coach uniquement.
 *
 * ⚠️ CORRIGÉ LE 2026-08-12 (FF-059) — CE COMMENTAIRE A MENTI. Il disait « sans
 * taille, âge, sexe ni niveau d'activité (ON NE LES COLLECTE PAS) », et c'est
 * faux depuis le 2026-08-08 : `profiles.height_cm` existe avec son écran et ses
 * bornes (migration `20260808020000`), `profiles.gender` est une liste fermée,
 * l'âge se dérive de `profiles.birth_date`, et `loadStudentBody` rend les trois
 * DANS LA MÊME REQUÊTE. Seul le **niveau d'activité** manque réellement, et
 * c'est lui qui bloque le lot 3 de FF-059 : sans lui, Mifflin-St Jeor donne un
 * métabolisme de base, pas un besoin.
 *
 * Ce qui reste vrai, et qui est la raison de la fourchette : cette fonction-ci
 * ne reçoit QUE le poids. Une valeur unique tirée d'un seul paramètre serait une
 * fausse précision. La fourchette par kg est exactement le raccourci qu'un coach
 * utilise de tête ; on lui épargne le calcul, on ne lui vole pas le jugement.
 *
 * ── « L'ÉLÈVE NE VOIT JAMAIS CES NOMBRES » TIENT TOUJOURS, ET CE N'EST PAS UNE
 *    CONTRADICTION AVEC FF-059 ────────────────────────────────────────────────
 * FF-059 affiche à l'élève l'énergie de SES PLATS — un fait sur la nourriture,
 * calculé depuis des quantités que le produit a écrites (MAPE 2,3 %). Ces
 * nombres-ci sont une CIBLE estimée sur son corps : un jugement sur la personne,
 * c'est-à-dire un tracker. C'est la distinction A/B contre C de la fiche, et
 * c'est elle qui garde la phrase ci-dessous vraie : un chiffre affiché à l'élève
 * devient un objectif. Le niveau C est le lot 3, il est BLOQUÉ sur trois
 * décisions humaines, et rien de FF-059 ne le franchit.
 */
export function coachStartingNumbers(weightKg: unknown): CoachStartingNumbers | null {
  const w = Number(weightKg);
  // Mêmes bornes de plausibilité que le point hebdo: hors bornes, pas de
  // nombres — un 500 kg d'erreur de frappe produirait des cibles absurdes
  // présentées avec l'aplomb d'un tableau.
  if (!Number.isFinite(w) || w < 25 || w > 400) return null;
  const round50 = (n: number) => Math.round(n / 50) * 50;
  const round5 = (n: number) => Math.round(n / 5) * 5;
  return {
    maintenanceLow: round50(28 * w),
    maintenanceHigh: round50(33 * w),
    proteinLow: round5(1.6 * w),
    proteinHigh: round5(2.2 * w),
    weightKg: w,
  };
}
