/**
 * `/coach/protocol` — « Recommended food », les fonctions pures de l'écran.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CET ÉCRAN A CHANGÉ DE FORME
 * ---------------------------------------------------------------------------
 * Il demandait au coach une posture sur 30 GROUPES abstraits (« matière grasse
 * ajoutée », « légumes non féculents »). Deux reproches, et ils étaient le même:
 * c'était illisible, ET c'était peu de choix. Un coach ne pense pas en groupes,
 * il pense en aliments — « huile de coco », « carotte », « saumon ».
 *
 * L'écran montre donc ~127 ALIMENTS concrets, rangés dans les catégories que le
 * coach a en tête. La posture de groupe que le pipeline lit est DÉRIVÉE
 * (`_shared/keel/food_items.ts`), et l'aperçu montre en permanence ce qu'elle
 * produit — le coach ne coche jamais à l'aveugle.
 *
 * ---------------------------------------------------------------------------
 * LA FRONTIÈRE DE LA LANGUE EST ICI, ET NULLE PART AILLEURS
 * ---------------------------------------------------------------------------
 * `food_items.ts` est SANS LOCALE (R2): il rend des descripteurs, jamais des
 * phrases. Ce module est le seul endroit où la langue entre, et il reste pur —
 * il reçoit la fonction de traduction plutôt que de l'importer, ce qui le rend
 * testable sans monter React. Même motif que `previewSentence`.
 *
 * ---------------------------------------------------------------------------
 * AUCUN ACCÈS BASE ICI
 * ---------------------------------------------------------------------------
 * Leçon déjà payée avec `coachCohort.ts`: un module qui mélange helpers et
 * accès base ne se teste qu'en montant un client, donc ne se teste pas. Les
 * lectures et écritures vivent dans la page; les décisions vivent ici.
 */

import type { MessageKey } from "../i18n/t";

import {
  type CoachFoodItem,
  COUNT_AXES,
  type CountAxis,
  defaultFrequency,
  deriveFoodRules,
  type DerivedRules,
  type FoodItemRow,
  type FrequencyDescriptor,
  frequencyDescriptor,
  frequencyFromRow,
  type FrequencyRule,
  frequencyToRow,
  type GroupConflict,
} from "../../../../supabase/functions/_shared/keel/food_items.ts";

export type {
  CoachFoodItem,
  CountAxis,
  DerivedRules,
  FoodItemRow,
  FrequencyDescriptor,
  FrequencyRule,
  GroupConflict,
};
export {
  COUNT_AXES,
  defaultFrequency,
  deriveFoodRules,
  frequencyDescriptor,
  frequencyFromRow,
  frequencyToRow,
};

// ---------------------------------------------------------------------------
// LA LISTE AFFICHÉE — le catalogue ET les ajouts du coach, ensemble
// ---------------------------------------------------------------------------
// Une seule liste, exprès. « Les nôtres » d'un côté et « les vôtres » de
// l'autre ferait des ajouts du coach des citoyens de seconde zone alors que ce
// sont exactement ceux auxquels il tient. Un aliment ajouté se distingue par un
// discret marqueur, pas par une section à part.

export interface DisplayFood {
  /** La clé de rendu: le slug de catalogue, ou l'id de la ligne du coach. */
  readonly key: string;
  readonly label: string;
  readonly foodGroupRef: string;
  readonly className: string;
  /** `null` pour un aliment ajouté par le coach. */
  readonly catalogSlug: string | null;
  readonly countAxis: CountAxis;
  readonly typicalAmount: number | null;
  /** La ligne du coach quand l'aliment est coché; `null` sinon. */
  readonly picked: CoachFoodItem | null;
  readonly sortOrder: number;
}

export interface FoodClass {
  readonly className: string;
  readonly foods: readonly DisplayFood[];
  /** Combien d'aliments de cette catégorie le coach a cochés. */
  readonly pickedCount: number;
}

/**
 * L'ordre des catégories — celui dans lequel un coach pense sa méthode, pas
 * l'ordre alphabétique ni celui de la base.
 *
 * Une classe absente est rendue À LA FIN plutôt que masquée: un groupe neuf
 * ajouté par migration doit apparaître même si personne n'a pensé à mettre à
 * jour cette constante. Masquer serait perdre du vocabulaire en silence.
 */
export const FOOD_CLASS_ORDER: readonly string[] = [
  "protein",
  "vegetable",
  "fruit",
  "grain",
  "legume",
  "dairy",
  "fat",
  "beverage",
  "discretionary",
];

export interface FoodGroupRow {
  readonly slug: string;
  readonly class: string;
  readonly label_i18n_key: string;
}

/**
 * Assemble ce que l'écran affiche.
 *
 * TRI DÉTERMINISTE et documenté: `sort_order` du catalogue d'abord (c'est la
 * curation — les aliments qu'un coach cherche en premier sont en tête), puis
 * le libellé. Les ajouts du coach arrivent APRÈS le catalogue de leur groupe,
 * triés entre eux: sans quoi ils se glisseraient au milieu d'une liste que le
 * coach a appris à parcourir des yeux.
 */
export function buildFoodClasses(
  catalog: readonly FoodItemRow[],
  groups: readonly FoodGroupRow[],
  picked: readonly CoachFoodItem[],
): FoodClass[] {
  const classOf = new Map(groups.map((g) => [g.slug, g.class]));
  const byRef = new Map(picked.filter((p) => p.food_item_ref).map((p) => [p.food_item_ref!, p]));

  const foods: DisplayFood[] = catalog.map((row) => ({
    key: row.slug,
    label: row.label,
    foodGroupRef: row.food_group_ref,
    className: classOf.get(row.food_group_ref) ?? "other",
    catalogSlug: row.slug,
    countAxis: row.count_axis,
    typicalAmount: row.typical_amount,
    picked: byRef.get(row.slug) ?? null,
    sortOrder: row.sort_order,
  }));

  // Les aliments que le coach a ajoutés lui-même. Ils n'ont pas d'axe de
  // comptage en base — c'est `coach-protocol-v1` qui le propose à la création
  // et le stocke dans la ligne. À défaut, `portion`: le cas le plus fréquent,
  // et le coach peut changer l'unité dans le panneau.
  for (const p of picked) {
    if (p.food_item_ref) continue;
    foods.push({
      key: p.id,
      label: p.label,
      foodGroupRef: p.food_group_ref,
      className: classOf.get(p.food_group_ref) ?? "other",
      catalogSlug: null,
      countAxis: "portion",
      typicalAmount: null,
      picked: p,
      // Après tout le catalogue de la catégorie.
      sortOrder: 10_000,
    });
  }

  const byClass = new Map<string, DisplayFood[]>();
  for (const food of foods) {
    const list = byClass.get(food.className) ?? [];
    list.push(food);
    byClass.set(food.className, list);
  }

  const known = FOOD_CLASS_ORDER.filter((c) => byClass.has(c));
  const unknown = [...byClass.keys()].filter((c) => !FOOD_CLASS_ORDER.includes(c)).sort();

  return [...known, ...unknown].map((className) => {
    const list = (byClass.get(className) ?? []).slice().sort((a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.label < b.label
        ? -1
        : a.label > b.label
        ? 1
        : 0
    );
    return {
      className,
      foods: list,
      pickedCount: list.filter((f) => f.picked).length,
    };
  });
}

// ---------------------------------------------------------------------------
// LA RECHERCHE — complément, jamais remplacement
// ---------------------------------------------------------------------------
// Elle accélère le coach qui sait déjà ce qu'il cherche, sans imposer la page
// blanche à celui qui découvre. Elle cherche dans le libellé ET dans le slug
// du groupe: quelqu'un qui tape « fish » doit trouver le saumon.

export function matchesFoodSearch(food: DisplayFood, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  if (food.label.toLowerCase().includes(q)) return true;
  if (food.foodGroupRef.toLowerCase().includes(q)) return true;
  return (food.catalogSlug ?? "").toLowerCase().includes(q);
}

// ---------------------------------------------------------------------------
// LA FRÉQUENCE, EN PHRASE
// ---------------------------------------------------------------------------

/**
 * Rend une règle de fréquence dans la langue de l'écran.
 *
 * PURE malgré la langue: elle reçoit `tr` au lieu de l'importer, donc elle se
 * teste sans monter React ni charger le catalogue de messages. Le pluriel est
 * traité par une clé par forme et pas par un `+ "s"`: la première langue qui
 * n'est pas l'anglais casserait la concaténation, en silence.
 */
export function frequencySentence(
  rule: FrequencyRule,
  tr: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  const d = frequencyDescriptor(rule);
  switch (d.kind) {
    case "amount": {
      const unitKey: MessageKey = d.unit === "portion"
        ? (d.amount === 1
          ? "coach.food.freq.unit.portion.one"
          : "coach.food.freq.unit.portion.many")
        : d.unit === "unit"
        ? (d.amount === 1 ? "coach.food.freq.unit.count.one" : "coach.food.freq.unit.count.many")
        : d.unit === "g"
        ? "coach.food.freq.unit.g"
        : "coach.food.freq.unit.ml";
      return tr("coach.food.freq.amount", {
        direction: tr(
          d.direction === "at_least"
            ? "coach.food.freq.at_least"
            : "coach.food.freq.at_most",
        ),
        amount: d.amount,
        unit: tr(unitKey),
        period: tr(
          d.period === "day" ? "coach.food.freq.period.day" : "coach.food.freq.period.week",
        ),
      }).replace(/\s+/g, " ").trim();
    }
    case "every_meal":
      return tr("coach.food.freq.every_meal");
    case "not_after":
      return tr("coach.food.freq.not_after", { time: d.cutoff });
    case "at_slot":
      return tr("coach.food.freq.at_slot", { slot: d.slot });
  }
}

/**
 * Les unités proposées pour un aliment donné.
 *
 * L'axe de comptage décide de l'unité PAR DÉFAUT, il ne l'impose pas: un coach
 * qui veut raisonner en portions sur une huile doit pouvoir le faire. Ce qu'on
 * ne veut pas, c'est qu'il ait à trouver « ml » dans une liste de quatre à
 * chaque huile — d'où l'unité de l'axe en tête.
 */
export function unitsForAxis(axis: CountAxis): readonly ("portion" | "g" | "ml" | "unit")[] {
  switch (axis) {
    case "volume":
      return ["ml", "portion", "g"];
    case "count":
      return ["unit", "portion", "g"];
    case "portion":
      return ["portion", "g", "ml", "unit"];
  }
}

// ---------------------------------------------------------------------------
// LE POURQUOI — d'où il vient, et ce que ça autorise
// ---------------------------------------------------------------------------

/**
 * Est-ce que l'IA a le droit de réécrire ce « pourquoi » ?
 *
 * NON dès que le coach y a touché. Ce dépôt a déjà payé ce défaut exact sur la
 * carte de défense: l'enrichissement LLM réécrivait par-dessus les éditions du
 * coach, qui perdait son texte sans comprendre ce qui l'avait effacé.
 *
 * La garde REELLE est côté base (`update ... where why_source <> 'coach'`);
 * celle-ci ne fait que ne pas proposer un bouton qui ne ferait rien.
 */
export function canRewriteWhy(item: Pick<CoachFoodItem, "why_source">): boolean {
  return item.why_source !== "coach";
}
