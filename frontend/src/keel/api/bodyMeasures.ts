/**
 * KEEL — L'INDICATEUR DE L'ÉLÈVE : quelle mesure compte, pour quelle dynamique.
 *
 * ---------------------------------------------------------------------------
 * LA RÈGLE DONT TOUT LE RESTE DÉCOULE
 * ---------------------------------------------------------------------------
 * Toutes les dynamiques n'ont pas le même indicateur, et deux d'entre elles
 * n'en ont aucun. Afficher un poids « objectif » à un élève dont l'objectif est
 * de mieux manger, ou à un élève en recomposition dont le poids doit justement
 * ne PAS bouger, c'est lui donner une cible qui contredit sa direction.
 *
 *   fat_loss      · poids ↓        · le tour de taille confirme (eau vs gras)
 *   muscle_gain   · poids ↑        · le tour de taille sert de garde-fou
 *   recomposition · TAILLE ↓       · à poids constant — le poids seul le rate
 *   performance   · aucun          · aucune mesure ne dit qu'on progresse
 *   health        · aucun          · le poids n'est pas le sujet
 *   maintenance   · poids DANS une bande — la stabilité, pas la progression
 *
 * ---------------------------------------------------------------------------
 * LA LECTURE VIENT DU SERVEUR, ELLE N'EST PAS RÉÉCRITE ICI
 * ---------------------------------------------------------------------------
 * `directionIsWorking` et les seuils de bruit sont importés de
 * `_shared/keel/student_body.ts` — le module que le générateur de semaine
 * exécute. La phrase que l'élève lit (« c'est ce que cet objectif demande »)
 * et l'instruction que le modèle reçoit (« n'alourdis pas la semaine ») sortent
 * donc du MÊME calcul.
 *
 * Recopier ces quatre lignes de règles ici aurait été le défaut que ce dépôt
 * connaît par cœur: deux implémentations d'une même règle, d'accord jusqu'au
 * jour où l'une change. Ici l'écran deviendrait MENTEUR — il féliciterait un
 * élève que le générateur traite comme stagnant.
 *
 * ---------------------------------------------------------------------------
 * PURE MODULE : aucune I/O, aucune horloge. Les lignes arrivent, les décisions
 * sortent.
 */

import {
  type DatedMeasure,
  directionIsWorking,
  type MeasureTrend,
  trendOf,
  WAIST_NOISE_CM,
  WEIGHT_NOISE_KG,
} from "../../../../supabase/functions/_shared/keel/student_body.ts";
import type { GoalToken } from "../../../../supabase/functions/_shared/keel/tokens.ts";

export type { DatedMeasure, MeasureTrend };
export { WAIST_NOISE_CM, WEIGHT_NOISE_KG };

/** Une ligne de `weekly_reviews`, réduite à ce que les mesures lisent. */
export interface ReviewRow {
  week_start_date: string;
  outcomes: Record<string, unknown> | null;
  biofeedback: Record<string, unknown> | null;
}

/**
 * Bornes de plausibilité — les MÊMES que le formulaire du dimanche.
 *
 * Volontairement larges: il ne s'agit pas de juger un corps mais d'attraper une
 * faute de frappe. Elles sont dupliquées depuis `weeklyCheckIn.ts`, qui les
 * duplique lui-même depuis le module Deno; `bodyMeasures.int.test.ts` vérifie
 * que les trois coïncident, pour la raison exacte donnée là-bas: un écran qui
 * accepte ce que le parseur écarte fait saisir dans le vide.
 */
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 400;
export const WAIST_CM_MIN = 30;
export const WAIST_CM_MAX = 250;

// ---------------------------------------------------------------------------
// 1. LIRE LES MESURES — un seul lecteur, et il connaît les deux modèles
// ---------------------------------------------------------------------------

/**
 * Les mesures d'une série de bilans, DATÉES, du plus ancien au plus récent.
 *
 * ── OÙ LE POIDS VIT VRAIMENT, ET LE BUG QUE ÇA A COÛTÉ ────────────────────
 * `/app/progress` lisait `outcomes.weight_7d_avg`. Personne n'écrit là dans le
 * modèle 1:N: le point du dimanche range le poids dans `biofeedback.weight_kg`.
 * La carte restait donc définitivement vide — « pas encore de poids » — juste
 * après que l'élève l'ait saisi. Le repli sur `outcomes` est GARDÉ parce que le
 * chemin 1:1 l'alimente toujours: les deux modèles coexistent dans la table.
 *
 * ── LA DATE N'EST PAS DÉCORATIVE ──────────────────────────────────────────
 * « 78 kg » ne dit rien. « 78 kg il y a trois semaines » dit quelque chose, et
 * surtout empêche l'élève de croire que c'est d'aujourd'hui. C'est pour ça que
 * ce module rend des `DatedMeasure` et jamais des nombres nus.
 */
export function datedMeasures(
  reviews: readonly ReviewRow[],
  kind: "weight" | "waist",
): DatedMeasure[] {
  const key = kind === "weight" ? "weight_kg" : "waist_cm";
  const fallbackKey = kind === "weight" ? "weight_7d_avg" : null;
  const min = kind === "weight" ? WEIGHT_KG_MIN : WAIST_CM_MIN;
  const max = kind === "weight" ? WEIGHT_KG_MAX : WAIST_CM_MAX;

  return [...reviews]
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
    .map((r) => {
      const bio = (r.biofeedback ?? {}) as Record<string, unknown>;
      let value = Number(bio[key]);
      if (!Number.isFinite(value) && fallbackKey) {
        value = Number((r.outcomes ?? {})[fallbackKey]);
      }
      return { weekStart: r.week_start_date, value };
    })
    // Une valeur hors bornes est une faute de frappe déjà écrite en base. La
    // laisser passer ferait une « tendance » sur un 780 kg, donc une phrase
    // fausse dite avec aplomb à l'élève.
    .filter((m) => Number.isFinite(m.value) && m.value >= min && m.value <= max);
}

/** La plus récente, ou `null` si l'élève n'a jamais rien saisi. */
export function latest(measures: readonly DatedMeasure[]): DatedMeasure | null {
  return measures.length > 0 ? measures[measures.length - 1] : null;
}

// ---------------------------------------------------------------------------
// 2. CE QUE CHAQUE DYNAMIQUE DEMANDE
// ---------------------------------------------------------------------------

/** La mesure qui PORTE l'objectif, ou `null` quand aucune ne le porte. */
export type PrimaryMeasure = "weight" | "waist" | null;

/**
 * La forme de la cible — et c'est ELLE qui interdit une colonne unique
 * `target_weight_kg` servie partout.
 *
 *   'weight' · un poids à atteindre (fat_loss, muscle_gain)
 *   'waist'  · un tour de taille à atteindre (recomposition)
 *   'band'   · un poids de RÉFÉRENCE, autour duquel on reste (maintenance)
 *   null     · aucune cible n'a de sens (performance, health)
 */
export type TargetKind = "weight" | "waist" | "band" | null;

export interface GoalIndicator {
  primary: PrimaryMeasure;
  /** La mesure de confirmation, montrée à côté. Jamais la même que `primary`. */
  secondary: PrimaryMeasure;
  target: TargetKind;
  /**
   * Cette dynamique se donne-t-elle un AXE à faire monter plutôt qu'un chiffre.
   *
   * Réservé aux dynamiques sans cible chiffrée. Ce n'est pas une restriction
   * arbitraire: un élève qui vise déjà un poids et un axe se donne deux
   * objectifs, et la semaine générée ne peut pas servir les deux en priorité.
   * L'invariant est donc `axisObjective === (target === null)`, et un test le
   * tient pour tous les objectifs.
   */
  axisObjective: boolean;
  /** Ce que l'élève doit surveiller, en une ligne — sa phrase de sélecteur. */
  reading: string;
}

/**
 * L'indicateur d'une dynamique. `switch` exhaustif: un septième objectif ne
 * compilera pas tant que quelqu'un n'aura pas décidé ce qu'on lui mesure.
 */
export function indicatorFor(goal: GoalToken): GoalIndicator {
  switch (goal) {
    case "fat_loss":
      return {
        primary: "weight",
        secondary: "waist",
        target: "weight",
        axisObjective: false,
        reading: "The scale coming down — your waist says whether it is fat or water.",
      };
    case "muscle_gain":
      return {
        primary: "weight",
        secondary: "waist",
        target: "weight",
        axisObjective: false,
        reading: "The scale going up — your waist is the guardrail, not the goal.",
      };
    case "recomposition":
      return {
        primary: "waist",
        secondary: "weight",
        target: "waist",
        axisObjective: false,
        // Le poids est SECONDAIRE ici, et sa cible n'existe pas: viser un poids
        // dans une dynamique dont la signature est « le poids ne bouge pas »
        // serait se donner une cible qui contredit sa propre direction.
        reading: "Your waist coming down while the scale holds still.",
      };
    case "maintenance":
      return {
        primary: "weight",
        secondary: null,
        target: "band",
        axisObjective: false,
        reading: "Staying inside your range — this one is about not drifting.",
      };
    case "performance":
      // AUCUNE cible, et ce n'est pas un oubli: `directionIsWorking` rend
      // `false` pour cet objectif parce qu'aucune tendance de poids ou de
      // taille ne dit qu'une performance progresse. Prétendre le contraire ici
      // serait exactement la mesure décorative que le produit refuse.
      return {
        primary: null,
        secondary: "weight",
        target: null,
        axisObjective: true,
        reading: "How your sessions go — no measurement on this page says that.",
      };
    case "health":
      return {
        primary: null,
        secondary: "weight",
        target: null,
        axisObjective: true,
        reading: "How you feel and how regular you are. Body weight is not the point here.",
      };
  }
}

/** La demi-largeur de la bande de maintien, autour du poids de référence. */
export const MAINTENANCE_BAND_KG = 2;

/**
 * DEPUIS COMBIEN DE SEMAINES D'AFFILÉE l'élève tient sa fourchette.
 *
 * L'objectif de `maintenance` n'est pas un point à atteindre — il y est déjà.
 * C'est une DURÉE, et c'est la seule forme d'objectif qui dise quelque chose de
 * vrai sur « ne pas dériver ». Un poids cible affiché à quelqu'un qui pèse déjà
 * ce poids-là ne lui apprend rien.
 *
 * Compté à rebours depuis la dernière mesure et interrompu au premier écart:
 * « 6 semaines » doit vouloir dire six semaines de suite, sinon c'est un total
 * flatteur qui survit à un mois de dérive.
 *
 * ── CE QUE CE COMPTEUR N'EST PAS ──────────────────────────────────────────
 * Pas une série, pas un score. Il ne se « casse » pas et rien ne le célèbre:
 * une semaine dehors le remet à zéro sans commentaire, et l'écran n'affiche
 * ni badge ni record. Le modèle a supprimé les séries EXPRÈS — un compteur qui
 * punit sa propre rupture les réintroduirait par la porte de derrière.
 */
export function weeksInsideBand(
  weights: readonly DatedMeasure[],
  reference: number | null,
): number {
  if (reference === null || !Number.isFinite(reference)) return 0;
  let n = 0;
  for (let i = weights.length - 1; i >= 0; i--) {
    if (Math.abs(weights[i].value - reference) > MAINTENANCE_BAND_KG) break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 2 bis. L'AXE À FAIRE MONTER — l'objectif quand il n'y a pas de chiffre
// ---------------------------------------------------------------------------

/** Les six axes du point du dimanche. Vocabulaire fermé, côté base aussi. */
export const FOCUS_AXES = [
  "energy",
  "hunger",
  "sleep",
  "digestion",
  "mood",
  "training",
] as const;
export type FocusAxis = (typeof FOCUS_AXES)[number];

export const FOCUS_AXIS_LABELS: Readonly<Record<FocusAxis, string>> = {
  energy: "Day-to-day energy",
  hunger: "Hunger between meals",
  sleep: "Sleep quality",
  digestion: "Digestion",
  mood: "Mood",
  training: "Training quality",
};

/**
 * DE COMBIEN UN AXE DOIT BOUGER pour que ce soit autre chose que du bruit.
 *
 * 1,5 sur une échelle de 1 à 5, c'est-à-dire DEUX crans pour des entiers. Un
 * seul cran d'écart entre deux dimanches soir, c'est la différence entre une
 * semaine correcte et une bonne nuit la veille — pas une amélioration. Le
 * seuil est plus exigeant, relativement, que celui du poids, et c'est voulu:
 * une auto-évaluation est plus bruyante qu'une balance.
 */
export const AXIS_NOISE = 1.5;

export interface AxisReading {
  axis: FocusAxis;
  label: string;
  latest: DatedMeasure | null;
  trend: MeasureTrend;
  /** Toutes les valeurs vont de 1 (mauvais) à 5 (très bien): monter = mieux. */
  improving: boolean;
}

/**
 * Ce que l'axe désigné a fait ces dernières semaines.
 *
 * Les six axes sont tous orientés dans le même sens — `WEEKLY_SCALE_LABELS` va
 * de « 1 — bad » à « 5 — great », y compris pour la faim, qui note le confort
 * entre les repas et pas la quantité de faim. « Rising » veut donc dire
 * « mieux » pour les six, sans exception à retenir.
 */
export function axisReading(
  reviews: readonly ReviewRow[],
  axis: FocusAxis,
): AxisReading {
  const measures = [...reviews]
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
    .map((r) => ({
      weekStart: r.week_start_date,
      value: Number((r.biofeedback ?? {})[axis]),
    }))
    .filter((m) => Number.isFinite(m.value) && m.value >= 1 && m.value <= 5);

  const trend = trendOf(measures, AXIS_NOISE);
  return {
    axis,
    label: FOCUS_AXIS_LABELS[axis],
    latest: latest(measures),
    trend,
    improving: trend === "rising",
  };
}

// ---------------------------------------------------------------------------
// 3. LA LECTURE RENDUE À L'ÉLÈVE
// ---------------------------------------------------------------------------

export interface IndicatorReading {
  indicator: GoalIndicator;
  weight: DatedMeasure | null;
  waist: DatedMeasure | null;
  weightTrend: MeasureTrend;
  waistTrend: MeasureTrend;
  /** `true` quand ce que les mesures montrent EST ce que l'objectif demande. */
  working: boolean;
  /** Ce qu'on dit à l'élève, ou `null` quand on n'a pas de quoi le dire. */
  sentence: string | null;
  /** Pour `maintenance`: dans la bande, ou non. `null` sans référence. */
  insideBand: boolean | null;
}

/**
 * LA PHRASE, ET CE QU'ELLE NE FAIT JAMAIS.
 *
 * Elle ne félicite pas et ne réprimande pas — « personne ne note » vaut ici
 * comme partout. Quand la direction se produit, on le CONSTATE; quand elle ne
 * se produit pas, on ne dit rien de plus que la mesure elle-même. La symétrie
 * est délibérée: `student_body.ts` documente que l'inverse (« ça ne marche
 * pas ») n'ajoute jamais de charge, parce que ce serait punir un élève d'un
 * résultat, et cet écran tient la même ligne en mots.
 *
 * Une seule mesure ne produit AUCUNE phrase de tendance: `trendOf` rend
 * `unknown` sous deux points, et dire « stable » d'un point unique est une
 * affirmation qu'on n'a pas les moyens de faire.
 */
export function readIndicator(args: {
  goal: GoalToken;
  weights: readonly DatedMeasure[];
  waists: readonly DatedMeasure[];
  targetWeightKg?: number | null;
}): IndicatorReading {
  const indicator = indicatorFor(args.goal);
  const weightTrend = trendOf(args.weights, WEIGHT_NOISE_KG);
  const waistTrend = trendOf(args.waists, WAIST_NOISE_CM);
  const working = directionIsWorking(args.goal, {
    ageBand: null,
    weightTrend,
    waistTrend,
  });

  const weight = latest(args.weights);
  const waist = latest(args.waists);

  const reference = args.targetWeightKg ?? null;
  const insideBand = indicator.target === "band" && reference !== null && weight !== null
    ? Math.abs(weight.value - reference) <= MAINTENANCE_BAND_KG
    : null;

  const observed: string[] = [];
  if (weightTrend !== "unknown") observed.push(`your weight is ${weightTrend}`);
  if (waistTrend !== "unknown") observed.push(`your waist is ${waistTrend}`);

  let sentence: string | null = null;
  if (observed.length > 0) {
    sentence = working
      ? `${cap(observed.join(" and "))} — that is what this goal is asking for.`
      : cap(observed.join(" and ")) + ".";
  }

  return { indicator, weight, waist, weightTrend, waistTrend, working, sentence, insideBand };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// 4. LA SAISIE
// ---------------------------------------------------------------------------

/**
 * Lit un champ de saisie. `""` vaut « non renseigné », pas « zéro ».
 *
 * Rendre `{ ok, value }` plutôt que de lever: les deux appelants (mesure du
 * jour, cible) affichent l'erreur à côté du champ, et une exception les
 * forcerait à l'attraper pour la remettre là où elle était.
 */
/**
 * LA CIBLE SAISIE, EN NOMBRE — OU `null`. Le champ vide vaut `null`, PAS ZÉRO.
 *
 * ── LE BUG QUE CETTE FONCTION EXISTE POUR RENDRE IMPOSSIBLE ───────────────
 * L'écran faisait `Number(raw)` et gardait le résultat s'il était fini. Or
 * `Number("")` vaut **0**, et `Number.isFinite(0)` vaut **true**: un champ
 * « poids de référence » jamais rempli devenait une référence de zéro kilo.
 *
 * Constaté en vrai, sur `maintenance`: l'élève n'avait rien saisi, pesait
 * 73 kg, et l'écran lui annonçait « You have drifted outside your range » —
 * il était en effet à 73 kg d'une fourchette centrée sur 0. Une phrase de
 * verdict, affirmée avec aplomb, sur une fourchette qui n'existait pas.
 *
 * `weeksInsideBand` recevait la même référence fantôme et rendait 0 semaine,
 * silencieusement: un seul défaut, deux mensonges.
 *
 * Ce dépôt avait DÉJÀ écrit cette leçon, dans `readScale` (`weekly_flow.ts`):
 * « `Number("")` vaut 0, et l'ancien code laissait donc un axe absent
 * ressortir en “0 is outside 1-5” ». La conversion est donc retirée de
 * l'écran: elle vit ici, avec les bornes, et un test la tient.
 */
export function targetValueOf(raw: string, kind: TargetKind): number | null {
  if (kind === null) return null;
  const min = kind === "waist" ? WAIST_CM_MIN : WEIGHT_KG_MIN;
  const max = kind === "waist" ? WAIST_CM_MAX : WEIGHT_KG_MAX;
  const parsed = readMeasureInput(raw, min, max, "Target");
  // Une saisie ILLISIBLE ne vaut pas non plus zéro: tant qu'elle n'est pas
  // valide, il n'y a pas de cible, et l'écran n'a rien à conclure.
  return parsed.ok ? parsed.value : null;
}

export function readMeasureInput(
  raw: string,
  min: number,
  max: number,
  label: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, message: `${label}: numbers only.` };
  if (n < min || n > max) {
    return { ok: false, message: `${label}: expected between ${min} and ${max}.` };
  }
  // Une décimale suffit et évite les 78.30000000000001 du flottant.
  return { ok: true, value: Math.round(n * 10) / 10 };
}
