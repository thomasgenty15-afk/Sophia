import type { TrackingWeightPoint } from "../api/tracking";

/**
 * LA COURBE DE POIDS — géométrie PURE, aucun composant, aucune horloge.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ RENVERSEMENT ÉCRIT — FF-031 §3 : « ❌ AUCUNE NOUVELLE SURFACE D'AFFICHAGE.
 *    Pas de graphe quotidien, pas de moyenne mobile montrée à l'élève. »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cette phrase a été écrite le 2026-08-10, avec une raison qui reste vraie: le
 * poids est la métrique la plus associée aux troubles alimentaires, et la
 * variation d'eau quotidienne (±1-2 kg) dépasse le signal hebdomadaire. Un
 * graphe QUOTIDIEN donnerait donc du bruit la forme d'une information, tous les
 * jours, sur l'écran le plus sensible du produit.
 *
 * D7.10 la renverse le 2026-09-03, et la fiche est amendée au même commit.
 * Ce qui a changé, et pourquoi ce n'est pas la même surface:
 *
 *  · CE QUE LE NOMBRE SEUL NE POUVAIT PAS FAIRE. L'écran rendait « 71,4 kg » et
 *    un delta sur la période. Un chiffre du jour est PIRE que la ligne pour la
 *    raison même qui interdisait la ligne: il EST la variation d'eau, sans rien
 *    autour pour la relativiser. La courbe est ce qui rend le bruit lisible
 *    COMME du bruit.
 *  · LA PÉRIODE EST UN GESTE, PAS UN DÉFAUT. Six fenêtres, de la semaine à la
 *    création du compte. Personne n'est mis devant une pente sans l'avoir
 *    demandée.
 *  · ⛔ CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL: sous plancher TCA, il n'y a
 *    NI chiffre NI courbe. Ce n'est pas un `if` dans ce fichier — le serveur
 *    rend `weight: null` avant d'avoir lu une seule pesée
 *    (`tracking_window.ts`, invariant C5). `weight_readout` reste suspendu
 *    quand la ceinture est armée, exactement comme la fiche l'exigeait.
 *  · ET AUCUNE MOYENNE MOBILE. La fiche interdisait aussi « une moyenne mobile
 *    montrée à l'élève »: cette partie-là N'EST PAS renversée. On rend les
 *    pesées, la dernière de chaque jour, et rien de lissé — un lissage est une
 *    interprétation, et il ferait disparaître exactement le bruit qu'on veut
 *    montrer.
 */

/** Les six fenêtres. `all` = tout ce que la série contient. */
export const WEIGHT_PERIODS = ["1w", "1m", "3m", "6m", "12m", "all"] as const;
export type WeightPeriod = (typeof WEIGHT_PERIODS)[number];

/** Combien de jours chaque fenêtre remonte. `all` n'en a pas. */
const PERIOD_DAYS: Readonly<Record<WeightPeriod, number | null>> = Object.freeze(
  {
    "1w": 7,
    "1m": 30,
    "3m": 91,
    "6m": 182,
    "12m": 365,
    all: null,
  },
);

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La borne basse d'une fenêtre, ou `null` pour « depuis la création ». */
export function periodStart(period: WeightPeriod, today: string): string | null {
  const days = PERIOD_DAYS[period];
  if (days === null || days === undefined) return null;
  // `days - 1`: une fenêtre de sept jours contient AUJOURD'HUI et les six
  // d'avant. C'est le décalage exact que `/app/progress` a payé le 2026-08-05
  // — un J-7 qui entrait dans les dénominateurs sans pouvoir s'afficher.
  return addDays(today, -(days - 1));
}

/** Les points de la fenêtre, croissants. La série d'entrée est déjà triée. */
export function pointsInPeriod(
  points: readonly TrackingWeightPoint[],
  period: WeightPeriod,
  today: string,
): TrackingWeightPoint[] {
  const from = periodStart(period, today);
  return points
    .filter((p) => (from === null || p.localDate >= from) && p.localDate <= today)
    .slice()
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export interface CurveBox {
  width: number;
  height: number;
  padding: number;
}

export interface CurveDot {
  x: number;
  y: number;
  localDate: string;
  value: number;
}

export interface CurveGeometry {
  /** L'attribut `d` d'un `<path>`. Vide quand il y a moins de deux points. */
  path: string;
  dots: CurveDot[];
  /** Les bornes RÉELLES de la série, pas celles de l'échelle. */
  min: number;
  max: number;
  /** Les bornes de l'échelle, après marge. */
  low: number;
  high: number;
}

/**
 * LA GÉOMÉTRIE, ET LES TROIS PIÈGES QU'ELLE ÉVITE.
 *
 *  ① UNE SÉRIE PLATE NE DIVISE PAS PAR ZÉRO. Trois pesées identiques donnent
 *    une amplitude nulle; on ouvre alors l'échelle d'un kilo de chaque côté et
 *    la ligne passe au milieu. Sans ça, `NaN` dans un `d=` et un SVG vide.
 *  ② L'ÉCHELLE NE PART PAS DE ZÉRO, ET C'EST VOULU. Un axe à zéro écraserait
 *    trois kilos de variation en un trait plat sur un écran de téléphone. La
 *    marge est de 5 % de l'amplitude, jamais moins de 0,5 kg — donc une
 *    variation d'eau reste visible comme une variation d'eau, pas comme une
 *    falaise.
 *  ③ L'AXE DU TEMPS EST LE TEMPS. Espacer les points régulièrement mentirait
 *    sur une série trouée: deux pesées à un mois d'écart deviendraient
 *    voisines. On positionne par la DATE.
 */
export function curveGeometry(
  points: readonly TrackingWeightPoint[],
  box: CurveBox,
): CurveGeometry | null {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const margin = Math.max(0.5, span * 0.05);
  const low = min - margin;
  const high = max + margin;

  const innerW = box.width - box.padding * 2;
  const innerH = box.height - box.padding * 2;

  const firstDay = Date.parse(`${points[0].localDate}T00:00:00Z`);
  const lastDay = Date.parse(
    `${points[points.length - 1].localDate}T00:00:00Z`,
  );
  const daySpan = Math.max(1, lastDay - firstDay);

  const dots: CurveDot[] = points.map((p) => {
    const t = points.length === 1
      ? 0.5
      : (Date.parse(`${p.localDate}T00:00:00Z`) - firstDay) / daySpan;
    const x = box.padding + t * innerW;
    const y = box.padding + (1 - (p.value - low) / (high - low)) * innerH;
    return { x: round2(x), y: round2(y), localDate: p.localDate, value: p.value };
  });

  const path = dots.length < 2
    ? ""
    : dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.x} ${d.y}`).join(" ");

  return { path, dots, min, max, low, high };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
