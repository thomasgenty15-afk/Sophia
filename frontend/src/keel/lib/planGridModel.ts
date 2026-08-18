import type {
  AwayDay,
  EatingOccasion,
  EatingOccasionSlot,
  GeneratedDish,
  PlanDayProperty,
  PlanFixedIntake,
} from "../api/mealGeneration";
import { type AwayMark, awayKindOf, presenceStateOf } from "./presenceMarks";

// FF-053 — LE MODÈLE DE LA GRILLE. Pur, sans React, donc testable sans rendu.
//
// ── CE QUE LA GRILLE APPORTE, ET QUI N'EXISTAIT NULLE PART ─────────────────
// Une case vide dans la semaine d'un élève a QUATRE causes, et l'écran n'en
// distinguait aucune:
//
//   * il n'est pas là                    (FF-002, `away_days`)
//   * il déjeune dehors                  (L3, `away_days` + `kind`)
//   * son shaker remplace le moment      (FF-051, `fixed_intakes`)
//   * c'est son jour de restes           (FF-052, `day_properties`)
//   * le modèle n'a rien composé         ← LE SEUL QUI SOIT UN DÉFAUT
//
// Quatre de ces silences sont exactement ce que l'élève a DEMANDÉ. Le cinquième
// est une faute. Les rendre identiques, c'est rendre la faute invisible et les
// quatre autres inquiétants.
//
// ⚠️ LES DEUX PREMIERS SE RESSEMBLENT ET NE SONT PAS LA MÊME CHOSE (L3,
// 2026-08-18). Aucun plat dans les deux cas; ce qui les sépare est que « dehors »
// garde le droit à un conseil chiffré et « pas là » non. Les confondre ferait
// taire le conseil du midi, ou le ferait apparaître pendant des vacances.

/** Ce qu'une case dit. Six états, et le dernier est l'anomalie. */
export type PlanGridCell =
  | {
    kind: "dish";
    title: string;
    /**
     * Ce plat vient d'une préparation (`uses` non vide).
     *
     * ⚠️ SANS CE DRAPEAU, LA GRILLE MENT PAR OMISSION. Trois cases identiques
     * sont soit une casserole intelligente, soit un modèle paresseux, et à
     * l'œil nu ça se ressemble. Non marqué, le comportement que FF-052 cherche
     * à produire serait jugé comme un défaut — et le premier réflexe serait de
     * le corriger.
     */
    fromBatch: boolean;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * COMBIEN DE BOUCHES MANGENT LEUR PROPRE PLAT À CE MOMENT (D3b).
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ LE DÉFAUT: la grille prenait LE PREMIER plat du moment et le montrait
     * seul. Un dîner où Zoé mange autre chose se lisait donc « tout le monde
     * mange la même chose » — la seule case où le foyer se divise était
     * exactement celle où la grille l'affirmait uni. La vue JOUR sait déjà le
     * dire (`DayPersonSplit`); la vue d'ensemble le taisait.
     *
     * 0 = personne à part, et c'est le cas courant: les deux plans réels
     * mesurés le 2026-08-18 ne portent AUCUN plat dédié.
     */
    ownMouths: number;
    /**
     * Le titre montré est celui d'un plat DÉDIÉ, faute de plat de table.
     *
     * ⚠️ C'EST LE MENSONGE LE PLUS CHER DES DEUX, et il se produit sans qu'un
     * seul champ soit faux: sans plat commun, la case affichait l'assiette
     * d'UNE bouche au nom de toute la table. Le distinguer permet à l'écran de
     * dire « rien pour la table » au lieu de servir le plat de quelqu'un
     * d'autre.
     */
    titleIsOwn: boolean;
    /**
     * Les plats de TABLE en trop sur ce moment — au-delà du premier, le seul
     * que la case a la place de nommer. 0 dans un plan sain.
     *
     * ⚠️ ON NE REJETTE RIEN, ON COMPTE. C'est le pendant visible de
     * `issues`: la case dit qu'il y en a d'autres, `issues` dit lesquels.
     */
    extraTableDishes: number;
  }
  | { kind: "away" }
  /**
   * ELLE MANGE, MAIS PAS CE QUE LE PLAN COMPOSE — le déjeuner dehors (L3,
   * 2026-08-18).
   *
   * ⚠️ CE N'EST PAS `away`, ET LES SÉPARER EST TOUT L'INTÉRÊT. Les deux cases
   * sont vides de plat; ce qui les distingue est que celle-ci a le droit de
   * porter un nombre (« vise autour de 700 ») et l'autre non. Les rendre
   * identiques ferait l'une des deux fautes: taire le conseil du midi de
   * quelqu'un qui déjeune dehors tous les jours, ou le faire apparaître pendant
   * ses vacances.
   *
   * ⚠️ ELLE NE PORTE AUCUN CHIFFRE, et c'est délibéré. Ce modèle dit OÙ un
   * conseil a le droit d'exister; il ne sait pas le calculer et n'a rien pour
   * ça. Poser un `kcal` ici en ferait un producteur d'énergie.
   */
  | { kind: "eating_out" }
  | { kind: "fixed_intake"; label: string }
  | { kind: "leftovers" }
  | { kind: "empty" };

export interface PlanGridRow {
  slot: EatingOccasion;
  cells: PlanGridCell[];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DEUX PLATS DE TABLE AU MÊME DÎNER — COMPTÉ ET NOMMÉ, JAMAIS REJETÉ (D3b).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MESURÉ SUR UN PLAN RÉEL, pas imaginé: `scratchpad/backup_dishes_6620682c
 * .json` porte « Prawn and tomato rice bowls » ET « Tomato lentil soup with
 * bread » sur `fri/dinner`, tous deux SANS `member_id`, donc tous deux pour la
 * table. Rien nulle part ne le relevait: la grille montrait le premier, la
 * liste du jour les montrait tous les deux sans rien dire, et aucun compteur
 * ne savait que le moteur avait composé deux dîners pour un seul dîner.
 *
 * ⚠️ C'EST UNE ANOMALIE NOMMÉE, PAS UN FILTRE. Rien n'est jeté — ni ici, ni
 * dans la case, ni dans la liste du jour: c'est la posture de tout le
 * chantier. Un plan qui compose deux dîners a peut-être raison (un soir à deux
 * services, une option), et un lecteur qui trancherait à notre place ferait
 * disparaître de l'assiette ce que le moteur a écrit. On le REND VISIBLE, et
 * on laisse l'humain décider.
 *
 * ⚠️ COMPTÉ SUR TOUS LES MOMENTS, PAS SEULEMENT SUR LES LIGNES DU RYTHME. Un
 * élève qui ne déclare pas de collation n'a pas de ligne « snack_pm », et une
 * collision qui y tombe n'aurait aucune case pour se voir — c'est-à-dire
 * exactement le silence que ce compteur existe pour rompre.
 */
export interface PlanGridIssue {
  kind: "two_table_dishes";
  day: string;
  /** Le moment, tel que le plat le porte — jamais réécrit ni normalisé. */
  slot: string;
  /** Les titres en collision, dans l'ordre du plan. Toujours au moins deux. */
  titles: string[];
}

export interface PlanGrid {
  /** Les jours, dans l'ordre du PLAN. Même longueur que chaque `cells`. */
  days: string[];
  rows: PlanGridRow[];
  /** Les anomalies relevées, jamais corrigées. Vide dans un plan sain. */
  issues: PlanGridIssue[];
}

/**
 * LES ABSENCES, RELUES AVEC LEUR SENS.
 *
 * ⚠️ LE PARAMÈTRE RESTE `AwayDay[]`, ET C'EST CE QUI REND CE LOT ADDITIF. Une
 * `AwayMark` EST une `AwayDay`: un appelant qui lit la colonne avec
 * `parseAwayMarks` fait apparaître « dehors » sans changer une seule signature,
 * et un appelant qui passe des absences nues obtient exactement l'écran d'hier
 * — tout en `away`, c'est-à-dire le silence. Le jeton voyage dans le même
 * tableau, invisible à qui ne le lit pas, comme `source` avant lui.
 */
function markify(rows: readonly AwayDay[]): AwayMark[] {
  return rows.map((a) => ({
    day: a.day,
    slots: a.slots,
    kind: awayKindOf(a),
  }));
}

/** Un apport fixe REMPLAÇANT occupe-t-il ce créneau ce jour-là ? */
function takenByIntake(
  intakes: readonly PlanFixedIntake[],
  day: string,
  slot: EatingOccasion,
): PlanFixedIntake | null {
  return intakes.find((i) =>
    i.replacesMeal && i.slot === slot &&
    // `days` vide = tous les jours, comme côté moteur (FF-051).
    (i.days.length === 0 || i.days.includes(day))
  ) ?? null;
}

export function dayHasProperty(
  properties: readonly PlanDayProperty[],
  day: string,
  property: string,
): boolean {
  return properties.some((p) => p.day === day && p.properties.includes(property));
}

/**
 * LA GRILLE.
 *
 * ── L'ORDRE DE PRÉCÉDENCE, ET POURQUOI IL EST CELUI-LÀ ────────────────────
 * Un plat GAGNE toujours: s'il existe, il se mange, quelle que soit la
 * déclaration. Les quatre autres états n'expliquent qu'une ABSENCE, et ils sont
 * ordonnés du plus fort au plus faible:
 *
 *   1. un plat            — il est là, on le montre
 *   2. absent OU dehors   — la déclaration la plus catégorique: rien n'est ni
 *                           composé, ni acheté. Les deux sortent au MÊME rang
 *                           (elles se distinguent par ce qu'on DIT, pas par ce
 *                           qu'on compose); les départager ici en ferait passer
 *                           une derrière un apport fixe, où elle disparaîtrait.
 *   3. apport fixe        — le moment est pris, mais par de la nourriture
 *   4. jour de restes     — le moment est libre, on y mange ce qui existe
 *   5. vide               — aucune des quatre. C'est le défaut.
 *
 * ── LES LIGNES VIENNENT DU RYTHME DÉCLARÉ ────────────────────────────────
 * Trois repas font trois lignes; la collation de 17 h en fait quatre. Une
 * grille à six lignes fixes ferait lire des lignes vides toutes les semaines,
 * pour des moments que l'élève a déjà dit ne pas prendre.
 */
export function buildPlanGrid(args: {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN (jamais du calendrier). */
  days: readonly string[];
  /** Les moments d'une journée normale — les lignes. */
  rhythm: readonly EatingOccasionSlot[];
  /** Les plats, DÉJÀ étendus par jour (`groupByDay`). */
  groups: ReadonlyArray<{ day: string | null; dishes: GeneratedDish[] }>;
  awayDays: readonly AwayDay[];
  fixedIntakes: readonly PlanFixedIntake[];
  dayProperties: readonly PlanDayProperty[];
}): PlanGrid {
  const byDay = new Map<string, GeneratedDish[]>();
  for (const g of args.groups) {
    if (g.day) byDay.set(g.day, g.dishes);
  }

  const marks = markify(args.awayDays);

  const rows: PlanGridRow[] = args.rhythm.map((r) => ({
    slot: r.slot,
    cells: args.days.map((day): PlanGridCell => {
      // ⚠️ TOUS LES PLATS DU MOMENT, PAS LE PREMIER. `find` rendait la case
      // aveugle aux deux défauts que ce lot répare: la bouche qui mange à
      // part, et le second plat de table que personne ne comptait.
      const atSlot = (byDay.get(day) ?? []).filter((d) => d.slot === r.slot);
      // ⚠️ `member_id` ABSENT ⇒ LE PLAT DE LA TABLE, jamais un plat dédié à
      // personne. C'est la lecture défensive du champ lui-même
      // (`mealGeneration.ts`), et c'est ce que ces plans étaient déjà pour
      // tout le monde avant que la clé existe.
      const table = atSlot.filter((d) => (d.member_id ?? null) === null);
      const own = atSlot.filter((d) => (d.member_id ?? null) !== null);
      // LE PLAT DE LA TABLE GAGNE LE TITRE. À défaut, c'est l'assiette d'une
      // bouche qui s'affiche — et `titleIsOwn` interdit de la lire comme
      // celle de tout le monde.
      const dish = table[0] ?? own[0] ?? null;
      if (dish) {
        return {
          kind: "dish",
          title: dish.title,
          fromBatch: dish.uses.length > 0,
          ownMouths: own.length,
          titleIsOwn: table.length === 0,
          extraTableDishes: Math.max(0, table.length - 1),
        };
      }
      // ⚠️ LES DEUX SORTENT AU MÊME RANG DE PRÉCÉDENCE, celui qu'occupait
      // `away` seul. « Dehors » est une déclaration aussi catégorique
      // qu'« absent » — rien n'est composé, rien n'est acheté — et lui donner
      // un rang différent le ferait passer derrière un apport fixe ou un jour
      // de restes, c'est-à-dire disparaître.
      const state = presenceStateOf(marks, day, r.slot);
      if (state === "away") return { kind: "away" };
      if (state === "eating_out") return { kind: "eating_out" };
      const intake = takenByIntake(args.fixedIntakes, day, r.slot);
      if (intake) return { kind: "fixed_intake", label: intake.label };
      if (dayHasProperty(args.dayProperties, day, "leftovers")) {
        return { kind: "leftovers" };
      }
      return { kind: "empty" };
    }),
  }));

  return { days: [...args.days], rows, issues: tableCollisions(args.groups) };
}

/**
 * Les moments où le plan a composé DEUX plats de table (ou plus).
 *
 * ⚠️ SUR `groups`, DONC SUR LA MÊME DONNÉE QUE LES CASES — jamais sur la liste
 * de plats brute. `groupByDay` a déjà dédupliqué (`title|slot|member_id`): ce
 * qui reste ici est deux titres DIFFÉRENTS sur un même moment, pas le même
 * plat compté deux fois. Compter en amont ferait crier ce compteur sur la
 * duplication que l'autre module vient d'absorber.
 *
 * Le groupe SANS jour est ignoré: « deux plats le même jour » n'a pas de sens
 * pour des plats qui n'en nomment aucun.
 */
function tableCollisions(
  groups: ReadonlyArray<{ day: string | null; dishes: GeneratedDish[] }>,
): PlanGridIssue[] {
  const out: PlanGridIssue[] = [];
  for (const group of groups) {
    if (!group.day) continue;
    const bySlot = new Map<string, GeneratedDish[]>();
    for (const d of group.dishes) {
      if ((d.member_id ?? null) !== null) continue;
      const slot = d.slot ?? "";
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), d]);
    }
    for (const [slot, dishes] of bySlot) {
      if (dishes.length < 2) continue;
      out.push({
        kind: "two_table_dishes",
        day: group.day,
        slot,
        titles: dishes.map((d) => d.title),
      });
    }
  }
  return out;
}

/**
 * Les jours qu'une préparation nourrit, dans l'ordre où ils apparaissent.
 *
 * Dérivé des `dish.uses`, pas d'un champ neuf: la donnée existe déjà, et un
 * second champ à tenir d'accord finirait par diverger du premier. C'est cette
 * ligne qui fait dire à « rôti du dimanche » qu'on en mange lundi, mardi et
 * mercredi — sans elle, le bloc cuisine ne vaut pas son titre.
 */
export function daysFedBy(
  preparationId: string,
  dishes: readonly GeneratedDish[],
): string[] {
  const seen: string[] = [];
  for (const d of dishes) {
    if (!d.day) continue;
    if (!d.uses.some((u) => u.preparation_id === preparationId)) continue;
    if (!seen.includes(d.day)) seen.push(d.day);
  }
  return seen;
}

/**
 * Combien de cases sont VRAIMENT vides — le seul état qui soit une anomalie.
 *
 * Sorti à part parce que c'est un taux de défaut de composition, et qu'il
 * n'avait aucun endroit où se voir avant cet écran (FF-053 §10).
 */
export function emptyCellCount(grid: PlanGrid): number {
  return grid.rows.reduce(
    (n, row) => n + row.cells.filter((c) => c.kind === "empty").length,
    0,
  );
}
