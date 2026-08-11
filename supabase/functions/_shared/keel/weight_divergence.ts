/**
 * FF-056 — LE DÉTECTEUR DE DIVERGENCE. Pur, sans horloge, sans I/O.
 *
 * Fiche: `docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md`
 *
 * ── CE QU'IL RÉPOND, ET CE QU'IL NE RÉPOND PAS ─────────────────────────────
 * Il répond à UNE question: « le résultat suit-il ce que le plan attend ? ».
 * Il ne répond jamais à « pourquoi ». Le pourquoi n'est pas dans les données —
 * il est chez la personne, et c'est tout le sujet de la fiche (§1: proposer une
 * collation du soir à quelqu'un dont le problème est le matin, c'est se tromper
 * deux fois). Aucune sortie de ce module ne nomme une cause.
 *
 * ── POURQUOI IL MANGE DES MOYENNES HEBDOMADAIRES, PAS DES PESÉES ────────────
 * Le poids est bruyant: eau, sel, cycle, heure de la pesée. Le bruit d'un jour
 * à l'autre est de ±1 à 2 kg sur 80 kg — c'est-à-dire DU MÊME ORDRE que le
 * signal qu'on cherche. `body_measure_series.weeklyBodyPoints` fait déjà les
 * deux agrégations qu'il faut (dernière mesure du jour, puis moyenne des jours
 * de la semaine) et divise ce bruit par √n. Refaire ici une lecture directe des
 * pesées, c'est le faux positif de R1 — « un faux positif sur du bruit détruit
 * le canal, et fait arrêter de se peser ».
 *
 * ── LA FORME D'ENTRÉE EST CELLE DE LA PRODUCTION, EXPRÈS ───────────────────
 * L'entrée est `DatedBodyMeasure[]` — la ligne de `student_body_measures`
 * telle que `loadBodyMeasures` la rend, avec sa `localDate`, son `kind` et son
 * `measuredAt`. Prendre en entrée une série déjà agrégée aurait rendu ce module
 * plus court et ses tests FAUX: ce dépôt a déjà payé une fixture qui écrivait
 * `cookOn` là où la production écrit `cook_on`, avec quatorze tests verts par
 * dessus. Ici, une fixture qui date mal ses mesures ÉCHOUE.
 *
 * ── AUCUNE FORMULATION NE PRÉSUPPOSE LA PERTE (fiche §11) ──────────────────
 * Le vocabulaire du module est signé par rapport à l'OBJECTIF, jamais par
 * rapport au poids: `progressPct` est le mouvement VERS le but, quel qu'il
 * soit. Une prise de masse qui stagne emprunte exactement les mêmes branches
 * qu'une perte qui ne vient pas, et les mêmes verdicts.
 */

import type { DatedBodyMeasure } from "./body_measure_series.ts";
import { weeklyBodyPoints } from "./body_measure_series.ts";

// ---------------------------------------------------------------------------
// LA VERSION DU CALIBRAGE
// ---------------------------------------------------------------------------

/**
 * Change à CHAQUE modification d'un seuil ci-dessous.
 *
 * Elle est écrite sur l'épisode. Sans elle, une campagne de mesure (fiche §10:
 * « la divergence à l'épisode suivant baisse-t-elle ? ») mélangerait des
 * épisodes ouverts par deux calibrages différents et rendrait un chiffre qui ne
 * veut rien dire — le genre de métrique rassurante que ce dépôt collectionne.
 */
export const WEIGHT_DIVERGENCE_DETECTOR_VERSION = "ff056.v1";

// ---------------------------------------------------------------------------
// LES SEUILS — exportés, testés, et chacun avec sa raison
// ---------------------------------------------------------------------------

/**
 * La profondeur de série que l'appelant doit charger, en jours.
 *
 * Huit semaines: assez pour qu'un plateau de cinq semaines tienne dans la
 * fenêtre avec de la marge, pas assez pour qu'une pesée d'il y a un trimestre —
 * sur un plan qu'on a changé depuis — serve de référence.
 */
export const DIVERGENCE_LOOKBACK_DAYS = 56;

/**
 * COMBIEN DE POINTS HEBDOMADAIRES CONSÉCUTIFS ÉTABLISSENT UN ÉLOIGNEMENT.
 *
 * 3, et c'est le chiffre de la fiche (§3: « 2 à 3 mesures consécutives »). Le
 * haut de la fourchette, pas le bas, pour une raison mesurable: avec du bruit
 * pur, la probabilité que DEUX points consécutifs aillent dans le mauvais sens
 * est de 1/2; qu'il y en ait TROIS, de 1/6. Passer de 2 à 3 divise le faux
 * positif par trois pour le prix d'une semaine d'attente — et cette
 * fonctionnalité « a le droit d'être rare » (§3, hors périmètre).
 */
export const DIVERGENCE_MIN_WEEKS_AWAY = 3;

/**
 * COMBIEN DE POINTS HEBDOMADAIRES CONSÉCUTIFS ÉTABLISSENT UNE STAGNATION.
 *
 * 5, soit strictement PLUS que l'éloignement, et l'asymétrie est le cœur du
 * calibrage. Un plateau de trois semaines est un événement NORMAL sous un plan
 * de perte; le déclencher ferait de ce flow un rendez-vous mensuel — exactement
 * ce que §3 interdit (« mensuel, il devient une convocation »). Un plateau d'un
 * mois complet, lui, est le constat que le résultat ne suit pas.
 *
 * ⚠️ Cette branche est ce qui rend la fonctionnalité SYMÉTRIQUE. Sous
 * `muscle_gain`, la divergence n'est pas « le poids monte », c'est « le poids
 * ne monte pas »: sans elle, tout le mécanisme ne servirait que la perte, et la
 * fiche §11 demande explicitement le contraire.
 */
export const DIVERGENCE_MIN_WEEKS_STALLED = 5;

/**
 * L'AMPLITUDE MINIMALE DE L'ÉLOIGNEMENT, EN % DU POIDS DE DÉPART.
 *
 * 1,2 % — le chiffre est EMPRUNTÉ, pas inventé: c'est le seuil que
 * `restriction_guard` applique déjà à la perte rapide, et le seul point de
 * calibrage sur données corporelles que ce dépôt ait jamais assumé. Là-bas il
 * s'applique par semaine; ici au TOTAL sur les deux pas de la fenêtre, donc à
 * un rythme deux fois plus lent — ce qui est voulu: on ne cherche pas une
 * urgence, on cherche un fait établi.
 *
 * Sur 80 kg, cela vaut ≈ 0,96 kg pris en deux semaines alors qu'on suit un plan
 * de perte. Aucune quantité d'eau ne fait ça sur une moyenne de trois pesées
 * hebdomadaires.
 */
export const DIVERGENCE_MIN_MOVE_PCT = 1.2;

/**
 * CE QU'UN PAS DOIT FAIRE POUR COMPTER COMME « CONTRE ».
 *
 * 0,1 % — c'est-à-dire « strictement contre », à la précision de la balance
 * près (les points hebdomadaires sont arrondis au dixième de kilo par
 * `weeklyBodyPoints`, soit 0,125 % sur 80 kg).
 *
 * ⚠️ C'EST CE SEUIL QUI TIENT LE CRITÈRE §8 « une seule pesée en hausse dans
 * une série stable ⇒ rien ne part ». Une série 80,0 / 80,0 / 81,0 franchit
 * l'amplitude totale mais son premier pas est PLAT: il n'est pas « contre », la
 * série n'est donc pas une divergence, c'est un saut. Sans ce test pas à pas,
 * un unique sursaut de fin de série suffirait à déclencher, et c'est
 * précisément le faux positif que la fiche nomme.
 */
export const DIVERGENCE_MIN_STEP_PCT = 0.1;

/**
 * LE PROGRÈS QUI SUFFIT À DIRE « ÇA SUIT ».
 *
 * 0,5 % sur la fenêtre. En dessous, on ne conclut rien — on ne dit ni que ça
 * marche ni que ça diverge, et le verdict est `noisy`. Ce module n'a PAS de
 * branche « ça avance mal »: elle appellerait une conversation d'encouragement,
 * et ce produit n'en fait pas.
 */
export const DIVERGENCE_PROGRESS_OK_PCT = 0.5;

/**
 * LA LARGEUR DE LA BANDE « PLAT », EN % AUTOUR DU PREMIER POINT.
 *
 * ±0,5 %. Les cinq points doivent TOUS y tenir: une série qui sort de la bande
 * puis y revient n'est pas un plateau, c'est du bruit, et elle sort en `noisy`.
 */
export const DIVERGENCE_FLAT_BAND_PCT = 0.5;

/**
 * L'ÂGE MAXIMAL DE LA DERNIÈRE PESÉE, EN JOURS.
 *
 * 10 — un peu plus d'une semaine, pour qu'une semaine sautée ne fasse pas
 * disparaître le constat, et assez peu pour qu'on ne parle jamais du corps de
 * quelqu'un sur des données périmées.
 *
 * ⚠️ C'est aussi la ceinture qui protège LE RED MAJEUR de la fiche (§10). Si la
 * personne cesse de se peser après un épisode, ce module devient muet de
 * lui-même au bout de dix jours — il ne peut pas continuer à poser des
 * questions sur une série qui s'est arrêtée.
 */
export const DIVERGENCE_STALE_DAYS = 10;

// ---------------------------------------------------------------------------
// LA DIRECTION DE L'OBJECTIF
// ---------------------------------------------------------------------------

/**
 * Les objectifs qui portent une direction de poids, et elle seule.
 *
 * ── POURQUOI `recomposition` N'EST PAS DEDANS, ET C'EST LE CHOIX QUI COMPTE ─
 * Une recomposition attend précisément que le poids NE BOUGE PAS pendant que la
 * composition change. Y lire une divergence sur une stagnation reviendrait à
 * poser la question à quelqu'un dont le plan se déroule exactement comme prévu
 * — le mode de défaillance le plus coûteux de cette fonctionnalité, parce qu'il
 * est indéfendable une fois qu'il s'est produit.
 *
 * `maintenance`, `health` et `performance` sortent pour la même raison: aucune
 * tendance de poids n'y dit que le plan marche ou ne marche pas.
 */
const GOAL_DIRECTIONS: Readonly<Record<string, WeightGoalDirection>> = Object
  .freeze({
    fat_loss: "down",
    muscle_gain: "up",
  });

/** Le sens dans lequel le plan attend que le poids aille. */
export type WeightGoalDirection = "down" | "up";

export function weightGoalDirection(
  goal: string | null | undefined,
): WeightGoalDirection | null {
  const key = String(goal ?? "").trim();
  return Object.prototype.hasOwnProperty.call(GOAL_DIRECTIONS, key)
    ? GOAL_DIRECTIONS[key]
    : null;
}

// ---------------------------------------------------------------------------
// LES VERDICTS — nommés, fermés, et tous journalisés
// ---------------------------------------------------------------------------

export const WEIGHT_DIVERGENCE_VERDICTS = [
  /** L'objectif ne porte aucune direction de poids. Rien à constater. */
  "no_directional_goal",
  /** Pas assez de points hebdomadaires consécutifs pour conclure. */
  "insufficient_data",
  /**
   * Il y a de la matière dans la fenêtre, mais elle est TROUÉE — les semaines
   * ne se suivent pas. C'est la conséquence assumée de §3: « ce mécanisme ne
   * couvre que les gens qui se pèsent ». Distinct de `insufficient_data`
   * exprès: l'un dit « pas encore », l'autre dit « pas régulièrement », et les
   * deux n'appellent pas la même lecture du chiffre de §10.
   */
  "irregular_measurements",
  /** La dernière pesée est trop vieille. On ne parle pas d'un corps au passé. */
  "stale_measurements",
  /** Le résultat suit le plan. */
  "aligned",
  /** Ça bouge, mais sans tendance lisible. Le seuil fait son travail. */
  "noisy",
  /**
   * Le dernier point va contre, et il est seul à le faire. C'est le cas §8
   * « une seule pesée en hausse dans une série stable ⇒ rien ne part »,
   * nommé plutôt que fondu dans `noisy` — parce que c'est le faux positif
   * qu'on cherche à ne pas produire, et qu'un motif muet ne se surveille pas.
   */
  "wrong_direction_but_single",
  /** Le constat. C'est le seul verdict qui autorise quoi que ce soit en aval. */
  "divergence_established",
] as const;
export type WeightDivergenceVerdict =
  (typeof WEIGHT_DIVERGENCE_VERDICTS)[number];

/** La FORME de la divergence. Jamais sa cause — ce module n'en connaît aucune. */
export type WeightDivergenceShape = "moving_away" | "stalled";

export interface WeightDivergenceWeekly {
  weekStart: string;
  value: number;
  /** Combien de jours distincts ont porté une pesée cette semaine-là. */
  days: number;
  lastLocalDate: string;
}

export interface WeightDivergenceResult {
  verdict: WeightDivergenceVerdict;
  detectorVersion: string;
  /** `null` dès que l'objectif ne porte pas de direction. */
  direction: WeightGoalDirection | null;
  /**
   * La forme, seulement sur `divergence_established`. `null` partout ailleurs —
   * un champ rempli sur un non-constat finit par être lu comme un constat.
   */
  shape: WeightDivergenceShape | null;
  /**
   * Le mouvement VERS l'objectif sur la fenêtre retenue, en % du premier point.
   * Négatif = éloignement. `null` quand aucune fenêtre n'a pu être retenue.
   */
  progressPct: number | null;
  /** Les points hebdomadaires consécutifs retenus, du plus ancien au plus récent. */
  window: readonly WeightDivergenceWeekly[];
  /** Jours écoulés depuis la dernière pesée. `null` s'il n'y en a aucune. */
  daysSinceLastMeasure: number | null;
}

// ---------------------------------------------------------------------------
// L'ARITHMÉTIQUE DE DATES — la même que `body_measure_series`, en local
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function fail(message: string): never {
  throw new Error(`[keel/weight_divergence] ${message}`);
}

/** Jours entiers depuis l'epoch, UTC — aucune arithmétique d'heure d'été. */
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

// ---------------------------------------------------------------------------
// LE DÉTECTEUR
// ---------------------------------------------------------------------------

export interface WeightDivergenceInput {
  /** La série datée, forme de production (`loadBodyMeasures`). Non triée requise. */
  measures: readonly DatedBodyMeasure[];
  /** `student_goals.goal`. */
  goal: string | null | undefined;
  /** La journée LOCALE de l'élève, résolue par l'appelant. Ce module n'a pas d'horloge. */
  todayLocalDate: string;
}

/**
 * LE CONSTAT. Pur, total, et sans effet de bord.
 *
 * ⚠️ IL NE JETTE QUE SUR UNE DONNÉE MALFORMÉE, jamais sur une donnée absente.
 * Une série vide est un verdict (`insufficient_data`), pas une erreur: le cas
 * nominal du produit est quelqu'un qui ne s'est jamais pesé.
 */
export function detectWeightDivergence(
  input: WeightDivergenceInput,
): WeightDivergenceResult {
  const today = isoDateToDays(input.todayLocalDate, "todayLocalDate");
  const direction = weightGoalDirection(input.goal);

  const empty: WeightDivergenceResult = {
    verdict: "no_directional_goal",
    detectorVersion: WEIGHT_DIVERGENCE_DETECTOR_VERSION,
    direction,
    shape: null,
    progressPct: null,
    window: [],
    daysSinceLastMeasure: null,
  };
  if (direction === null) return empty;

  // La fenêtre de chargement est bornée ICI aussi, et pas seulement chez
  // l'appelant: un appelant généreux ne doit pas pouvoir élargir le calibrage
  // en passant plus de matière que le module n'en assume.
  const since = today - DIVERGENCE_LOOKBACK_DAYS;
  const inWindow = (input.measures ?? []).filter((row) => {
    if (!row || typeof row !== "object") fail("measures[] doit contenir des objets");
    if (row.kind !== "weight") return false;
    const day = isoDateToDays(row.localDate, "measures[].localDate");
    return day >= since && day <= today;
  });

  const points = weeklyBodyPoints(inWindow, "weight");
  if (points.length === 0) {
    return { ...empty, verdict: "insufficient_data" };
  }

  const last = points[points.length - 1];
  const daysSinceLastMeasure = today -
    isoDateToDays(last.lastLocalDate, "weeklyPoint.lastLocalDate");
  if (daysSinceLastMeasure > DIVERGENCE_STALE_DAYS) {
    return {
      ...empty,
      verdict: "stale_measurements",
      daysSinceLastMeasure,
    };
  }

  // LA SUITE CONSÉCUTIVE DE FIN DE SÉRIE. Les semaines doivent se SUIVRE:
  // `weeklyBodyPoints` n'émet que les semaines mesurées, donc deux points
  // voisins dans le tableau peuvent être séparés d'un mois. Comparer 80 kg de
  // mars à 81 kg de mai et appeler ça « trois mesures consécutives » serait le
  // mensonge le plus facile à commettre ici.
  const run: WeightDivergenceWeekly[] = [last];
  for (let i = points.length - 2; i >= 0; i--) {
    const gap = isoDateToDays(run[0].weekStart, "weeklyPoint.weekStart") -
      isoDateToDays(points[i].weekStart, "weeklyPoint.weekStart");
    if (gap !== 7) break;
    run.unshift(points[i]);
  }

  const base = {
    ...empty,
    daysSinceLastMeasure,
    window: run as readonly WeightDivergenceWeekly[],
  };

  if (run.length < DIVERGENCE_MIN_WEEKS_AWAY) {
    // L'IRRÉGULARITÉ PASSE AVANT LA FORME, et l'ordre est un choix. Quand il y
    // a assez de points dans la fenêtre mais qu'ils ne se suivent pas, le fait
    // saillant n'est pas le dernier pas: c'est que cette personne se pèse trop
    // rarement pour qu'on puisse constater quoi que ce soit. C'est ce chiffre
    // que §10 surveille, et le fondre dans un motif de forme le rendrait
    // invisible.
    if (points.length >= DIVERGENCE_MIN_WEEKS_AWAY) {
      return { ...base, verdict: "irregular_measurements" };
    }
    // Deux points suffisent à NOMMER le pas qui va contre — c'est le §8 qu'on
    // veut voir dans les journaux, et pas confondu avec « pas encore de série ».
    if (run.length >= 2 && stepGoesAgainst(run, direction, run.length - 1)) {
      return { ...base, verdict: "wrong_direction_but_single" };
    }
    return { ...base, verdict: "insufficient_data" };
  }

  // ── ÉLOIGNEMENT: les N derniers points, chacun contre le précédent ────────
  const away = run.slice(-DIVERGENCE_MIN_WEEKS_AWAY);
  const awayProgress = progressPctOf(away, direction);
  const everyStepAgainst = away.every((_, i) =>
    i === 0 || stepGoesAgainst(away, direction, i)
  );
  if (everyStepAgainst && awayProgress <= -DIVERGENCE_MIN_MOVE_PCT) {
    return {
      ...base,
      verdict: "divergence_established",
      shape: "moving_away",
      progressPct: awayProgress,
      window: away as readonly WeightDivergenceWeekly[],
    };
  }

  // ── STAGNATION: N points plus longs, TOUS dans la bande plate ─────────────
  if (run.length >= DIVERGENCE_MIN_WEEKS_STALLED) {
    const flat = run.slice(-DIVERGENCE_MIN_WEEKS_STALLED);
    const anchor = flat[0].value;
    const allFlat = anchor !== 0 &&
      flat.every((p) => Math.abs((p.value - anchor) / anchor) * 100 <= DIVERGENCE_FLAT_BAND_PCT);
    if (allFlat) {
      return {
        ...base,
        verdict: "divergence_established",
        shape: "stalled",
        progressPct: progressPctOf(flat, direction),
        window: flat as readonly WeightDivergenceWeekly[],
      };
    }
  }

  const runProgress = progressPctOf(run, direction);
  if (runProgress >= DIVERGENCE_PROGRESS_OK_PCT) {
    return { ...base, verdict: "aligned", progressPct: runProgress };
  }
  return { ...base, verdict: "noisy", progressPct: runProgress };
}

/**
 * Le mouvement VERS l'objectif, du premier au dernier point, en % du premier.
 *
 * Signé par rapport au BUT et pas par rapport au poids: c'est ce qui fait qu'une
 * prise de masse traverse le même code qu'une perte, sans une seule branche
 * `if (direction === "down")` dans la logique de décision.
 */
function progressPctOf(
  window: readonly WeightDivergenceWeekly[],
  direction: WeightGoalDirection,
): number {
  const first = window[0].value;
  const lastValue = window[window.length - 1].value;
  if (first === 0) fail("un point hebdomadaire à zéro ne peut pas servir de base");
  const delta = direction === "down" ? first - lastValue : lastValue - first;
  return round2((delta / first) * 100);
}

/** Le pas `i-1 → i` va-t-il contre l'objectif d'au moins le seuil de pas ? */
function stepGoesAgainst(
  window: readonly WeightDivergenceWeekly[],
  direction: WeightGoalDirection,
  i: number,
): boolean {
  const previous = window[i - 1].value;
  const current = window[i].value;
  if (previous === 0) return false;
  const towards = direction === "down" ? previous - current : current - previous;
  return round2((towards / previous) * 100) <= -DIVERGENCE_MIN_STEP_PCT;
}

/** Deux décimales: la précision d'un pourcentage sur un dixième de kilo. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
