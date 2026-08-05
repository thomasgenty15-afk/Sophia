/**
 * LE RYTHME DE LA SEMAINE — les repas répartis par jour et par moment.
 *
 * ---------------------------------------------------------------------------
 * CE QUE ÇA RÉPOND, ET QUE RIEN NE RÉPONDAIT
 * ---------------------------------------------------------------------------
 * `weekInFood.ts` dit CE QUI a été mangé sur la période (« légumes à 9 repas
 * sur 13 »). Personne ne disait QUAND. Or c'est la moitié de la question d'un
 * élève qui regarde sa semaine : est-ce que je saute le petit-déjeuner ? est-ce
 * que tout se passe le soir ? est-ce que je mange encore à 23 h ?
 *
 * Un coach lit ça d'un coup d'œil sur une grille ; il ne le lit pas dans une
 * moyenne. D'où une grille 7 jours × 5 moments, et pas un chiffre.
 *
 * ---------------------------------------------------------------------------
 * D'OÙ VIENT LE MOMENT — ET POURQUOI PAS `slot_key`
 * ---------------------------------------------------------------------------
 * `slot_key` semblait le candidat évident. Mesuré en base : il est **NULL sur
 * 71 % des lignes** (105 sur 148). C'est voulu — ni le plancher de déclaration
 * ni le chemin photo ne DEVINENT un créneau depuis l'horloge, parce qu'un
 * créneau inventé est un fait inventé. Mais une grille bâtie dessus perdrait
 * les deux tiers des repas, et afficherait une semaine trouée à un élève qui a
 * tout déclaré.
 *
 * Le moment vient donc de `occurred_at`, qui est **toujours** présent (NOT NULL)
 * et posé par le serveur. Ordre de préséance :
 *
 *   1. `slot_key` QUAND IL NOMME UN MOMENT. « à midi » vaut mieux que l'horloge :
 *      c'est l'élève qui l'a dit, et ça rattrape « hier soir j'ai mangé… ».
 *   2. sinon, l'heure de `occurred_at` dans le fuseau de l'élève.
 *
 * Les créneaux qui ne nomment PAS un moment (`pre_workout`, `post_workout`,
 * `any_meal`, `any_time`) ne surclassent rien : ils sont relatifs à une séance
 * ou volontairement vagues, et les mapper sur une heure serait exactement
 * l'invention qu'on refuse ailleurs.
 *
 * LIMITE ASSUMÉE, écrite ici pour ne pas être redécouverte : `occurred_at` est
 * l'instant de la DÉCLARATION, pas celui du repas. Pour une photo les deux
 * coïncident (on photographie son assiette) ; pour « hier soir j'ai mangé une
 * pizza » tapé ce matin, la ligne tombe au matin — sauf si l'élève a nommé le
 * créneau, ce qui est précisément le cas où la règle n°1 mord. C'est la
 * meilleure approximation disponible sans demander une heure à l'élève à chaque
 * repas, ce qui est l'interrogatoire que §3.3bis interdit.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE MODULE NE PRODUIT JAMAIS
 * ---------------------------------------------------------------------------
 * Pas une calorie, pas un macro, pas un score, pas un pourcentage-objectif —
 * même règle que `weekInFood.ts`, et pour la raison mesurée dans
 * `docs/keel/PHOTO_QUANTIFICATION.md` (biais −26,6 %, pire sur les gros repas,
 * que l'agrégation hebdomadaire ne divise que par 1,04). La magnitude est
 * ORDINALE : `portion_band`, dont le jeton EST la barre d'erreur.
 *
 * PURE MODULE : aucun I/O, aucune horloge propre (l'appelant passe les dates et
 * le fuseau), aucun aléatoire.
 */

import {
  FRUIT_GROUPS,
  PROTEIN_GROUPS,
  VEG_GROUPS,
} from "./weekInFood";

// ---------------------------------------------------------------------------
// Le vocabulaire (R1 : des jetons, traduits à l'affichage seulement)
// ---------------------------------------------------------------------------

export const MOMENTS = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
] as const;
export type Moment = (typeof MOMENTS)[number];

export const MOMENT_LABELS: Readonly<Record<Moment, string>> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

/**
 * Les bornes, en heures locales. `night` enjambe minuit — c'est la seule bande
 * qui le fait, et c'est pour ça qu'elle est traitée en dernier plutôt que par
 * une comparaison d'intervalle.
 */
export function momentForHour(hour: number): Moment {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

/**
 * Les créneaux qui NOMMENT un moment de la journée.
 *
 * `pre_workout` / `post_workout` sont absents exprès : ils situent un repas par
 * rapport à une séance, pas à une heure. Une séance à 7 h et une séance à 20 h
 * portent le même jeton. `any_meal` / `any_time` sont absents pour la raison
 * inverse : ils disent explicitement « peu importe quand ».
 */
const SLOT_MOMENTS: Readonly<Record<string, Moment>> = {
  on_waking: "morning",
  breakfast: "morning",
  snack_am: "morning",
  lunch: "midday",
  snack_pm: "afternoon",
  dinner: "evening",
  before_bed: "night",
};

// ---------------------------------------------------------------------------
// L'entrée
// ---------------------------------------------------------------------------

/** Le plafond d'aliments nommés par case. Un buffet ne doit pas noyer la page. */
const MAX_FOODS_PER_CELL = 6;

export interface RhythmEventRow {
  local_date: string;
  /** NOT NULL en base : c'est ce qui rend la grille possible. */
  occurred_at: string;
  slot_key: string | null;
  portion_band: string | null;
  food_group_ref: string | null;
  /**
   * Non nul = ce fait NE COMPTE PAS comme repas (photo d'un menu, d'un rayon,
   * image illisible). La colonne existe pour que les lecteurs filtrent au lieu
   * de ré-implémenter la règle ; ce module la filtre.
   */
  disqualified_reason?: string | null;
  /** Le chemin de bucket de la photo, quand ce fait en est une. */
  media_path?: string | null;
  recognized?: {
    detected_foods?: Array<{ label?: string | null }> | null;
    food_groups_present?: string[] | null;
    portion_rationale?: string | null;
  } | null;
}

/** L'heure locale d'un instant, dans le fuseau donné. `null` si illisible. */
export function hourInZone(iso: string, timeZone: string): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      // `h23` explicitement : sans lui, minuit remonte « 24 » dans certaines
      // locales et tombe hors de toutes les bandes.
      hourCycle: "h23",
    }).format(at);
    const hour = Number(formatted);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}

/**
 * Le moment d'un fait. `null` quand rien ne permet de le situer — on ne devine
 * pas, la ligne ira dans le compte « sans moment » plutôt que dans une case.
 */
export function momentOf(row: RhythmEventRow, timeZone: string): Moment | null {
  const named = SLOT_MOMENTS[String(row.slot_key ?? "").trim()];
  if (named) return named;
  const hour = hourInZone(row.occurred_at, timeZone);
  return hour === null ? null : momentForHour(hour);
}

// ---------------------------------------------------------------------------
// L'agrégat
// ---------------------------------------------------------------------------

/** Ce qu'une case de la grille porte. */
export interface RhythmCell {
  count: number;
  /** La bande la PLUS GROSSE de la case — la case est un résumé, pas une liste. */
  band: "small" | "moderate" | "large" | "unclear" | null;
  /**
   * LES ALIMENTS NOMMÉS, et c'est le champ qui justifie le geste de l'élève.
   *
   * ── LE DÉFAUT QU'IL CORRIGE, mesuré sur une vraie ligne ─────────────────
   * Un bol d'avoine au fromage blanc: le modèle avait écrit
   * `detected_foods: [yogurt 0.95, rolled oats 0.98]`, `portion_band: moderate`,
   * `image_quality: clear`. L'écran de progression n'en affichait AUCUN — il
   * rendait « 1 meal logged » et une ligne de zéros, parce que le seul endroit
   * qui nommait des aliments (`weekInFood.topFoods`) exige de les avoir vus
   * DEUX fois. Sur une photo, tout a un compte de 1: la liste est toujours
   * vide, et l'élève ne voit jamais ce qu'on a lu de son assiette.
   *
   * Photographier un repas coûte un geste; ne rien recevoir en retour est la
   * façon la plus sûre d'arrêter de le faire.
   */
  foods: string[];
  /**
   * Les photos de ce créneau — chemins de bucket, à faire signer.
   *
   * C'est la réponse la plus directe à « pourquoi je prends des photos »:
   * revoir son assiette à côté de ce qui en a été lu. Le chemin voyage, jamais
   * une URL: `meal-photos` est privé et sans policy.
   */
  mediaPaths: string[];
  /**
   * Ce que le modèle a dit de la TAILLE, dans ses mots — « The bowl is mostly
   * full with a substantial mound of oats in the center. »
   *
   * Une phrase observable, pas un nombre: elle prouve que la photo a été
   * regardée, là où un jeton `moderate` seul ressemble à un défaut. La première
   * du créneau suffit; les empiler ferait un mur de texte.
   */
  rationale: string | null;
  hasVeg: boolean;
  hasProtein: boolean;
  hasFruit: boolean;
}

export interface RhythmDay {
  date: string;
  cells: Record<Moment, RhythmCell | null>;
  /** Faits du jour qu'aucun moment ne situe. Comptés, jamais rangés au hasard. */
  unplaced: number;
}

export interface RhythmSummary {
  days: RhythmDay[];
  /** Repas retenus (hors disqualifiés) sur la période. */
  meals: number;
  daysLogged: number;
  /** Total par moment, tous jours confondus — la ligne « d'habitude ». */
  byMoment: Record<Moment, number>;
  /** Le moment le plus chargé, ou null en cas d'égalité ou de période vide. */
  busiest: Moment | null;
  /** Total de faits qu'aucun moment n'a pu situer. */
  unplaced: number;
  bands: Record<"small" | "moderate" | "large" | "unclear", number>;
}

const BAND_RANK: Record<string, number> = {
  unclear: 0,
  small: 1,
  moderate: 2,
  large: 3,
};

function groupsOf(row: RhythmEventRow): Set<string> {
  const set = new Set<string>();
  for (const g of row.recognized?.food_groups_present ?? []) {
    const t = String(g ?? "").trim();
    if (t) set.add(t);
  }
  const ref = String(row.food_group_ref ?? "").trim();
  if (ref) set.add(ref);
  return set;
}

function emptyCell(): RhythmCell {
  return {
    count: 0,
    band: null,
    foods: [],
    mediaPaths: [],
    rationale: null,
    hasVeg: false,
    hasProtein: false,
    hasFruit: false,
  };
}

/**
 * Les aliments nommés par une ligne, dans l'ordre où le modèle les a vus.
 *
 * Le libellé est rendu TEL QUEL (juste la première lettre en capitale): c'est
 * « rolled oats » que l'élève reconnaît sur sa photo, pas le jeton
 * `whole_grain`. La normalisation ne sert qu'à dédupliquer deux orthographes du
 * même aliment dans un même créneau.
 */
function foodLabelsOf(row: RhythmEventRow): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of row.recognized?.detected_foods ?? []) {
    const label = String(f?.label ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label.charAt(0).toUpperCase() + label.slice(1));
  }
  return out;
}

export function aggregateRhythm(
  rows: readonly RhythmEventRow[],
  opts: { dates: readonly string[]; timeZone: string },
): RhythmSummary {
  // Le filtre de sujet, en premier : une photo de menu n'est pas un repas et
  // n'a pas de place dans un rythme. La colonne tranche, pas ce module.
  const meals = rows.filter((r) => !r.disqualified_reason);

  const byDate = new Map<string, RhythmEventRow[]>();
  for (const row of meals) {
    const list = byDate.get(row.local_date);
    if (list) list.push(row);
    else byDate.set(row.local_date, [row]);
  }

  const byMoment: Record<Moment, number> = {
    morning: 0, midday: 0, afternoon: 0, evening: 0, night: 0,
  };
  const bands = { small: 0, moderate: 0, large: 0, unclear: 0 };
  let unplaced = 0;

  const days: RhythmDay[] = opts.dates.map((date) => {
    const cells: Record<Moment, RhythmCell | null> = {
      morning: null, midday: null, afternoon: null, evening: null, night: null,
    };
    let dayUnplaced = 0;

    for (const row of byDate.get(date) ?? []) {
      const band = String(row.portion_band ?? "").trim();
      if (band in bands) bands[band as keyof typeof bands]++;

      const moment = momentOf(row, opts.timeZone);
      if (moment === null) {
        dayUnplaced++;
        unplaced++;
        continue;
      }
      byMoment[moment]++;
      const cell = cells[moment] ?? emptyCell();
      cell.count++;
      // La case garde la bande la plus grosse: deux assiettes dans le même
      // créneau, dont une `large`, décrivent un créneau chargé. Une moyenne
      // fabriquerait une bande que personne n'a observée.
      if (band in BAND_RANK) {
        if (cell.band === null || BAND_RANK[band] > BAND_RANK[cell.band]) {
          cell.band = band as RhythmCell["band"];
        }
      }
      for (const label of foodLabelsOf(row)) {
        if (cell.foods.length >= MAX_FOODS_PER_CELL) break;
        if (!cell.foods.some((f) => f.toLowerCase() === label.toLowerCase())) {
          cell.foods.push(label);
        }
      }
      const mediaPath = String(row.media_path ?? "").trim();
      if (mediaPath && !cell.mediaPaths.includes(mediaPath)) {
        cell.mediaPaths.push(mediaPath);
      }
      // La PREMIÈRE suffit — voir le champ. Une déclaration texte n'en a pas,
      // et l'absence ne doit pas effacer celle d'une photo du même créneau.
      const rationale = String(row.recognized?.portion_rationale ?? "").trim();
      if (!cell.rationale && rationale) cell.rationale = rationale;
      const gs = groupsOf(row);
      cell.hasVeg = cell.hasVeg || VEG_GROUPS.some((g) => gs.has(g));
      cell.hasProtein = cell.hasProtein || PROTEIN_GROUPS.some((g) => gs.has(g));
      cell.hasFruit = cell.hasFruit || FRUIT_GROUPS.some((g) => gs.has(g));
      cells[moment] = cell;
    }

    return { date, cells, unplaced: dayUnplaced };
  });

  // Le plus chargé, et `null` sur égalité: nommer un « moment principal » qui
  // en vaut un autre inventerait une habitude que la semaine ne montre pas.
  const ranked = [...MOMENTS].sort((a, b) => byMoment[b] - byMoment[a]);
  const busiest = byMoment[ranked[0]] > 0 && byMoment[ranked[0]] > byMoment[ranked[1]]
    ? ranked[0]
    : null;

  return {
    days,
    meals: meals.length,
    daysLogged: new Set(meals.map((r) => r.local_date)).size,
    byMoment,
    busiest,
    unplaced,
    bands,
  };
}
