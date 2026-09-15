/**
 * LES ALIMENTS DU COACH — la couche qu'il touche, au-dessus de celle que le
 * pipeline lit.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE MODULE EXISTE POUR RÉSOUDRE
 * ---------------------------------------------------------------------------
 * Le coach pense en ALIMENTS (« huile de coco », « carotte », « saumon »). Le
 * pipeline travaille en GROUPES: `food_groups` porte 30 slugs, le prompt de
 * vision les énumère, `parseFoodGroupRef` rejette l'inconnu, et c'est cette
 * fermeture qui rend la jointure photo↔méthode possible SANS modèle.
 *
 * Les deux échelles doivent coexister sans que l'une mente sur l'autre. Ce
 * module est la traduction, et elle est PURE et TESTÉE — pas une heuristique
 * enfouie dans un composant React.
 *
 * ---------------------------------------------------------------------------
 * LA RÈGLE DE DÉRIVATION, ET SON CAS DIFFICILE
 * ---------------------------------------------------------------------------
 * Pour un groupe donné, on regarde les aliments que le coach a cochés dedans:
 *
 *   * QUE DU « POUR »        -> le groupe est `encouraged`.
 *   * QUE DU « CONTRE »      -> `excluded` si au moins un aliment est exclu,
 *                               `discouraged` sinon. La sévérité la plus forte
 *                               gagne: amollir une exclusion serait décider à
 *                               la place du coach.
 *   * LES DEUX À LA FOIS     -> AUCUNE règle de groupe. Le groupe reste neutre.
 *
 * Ce dernier cas est le seul qui mérite une justification. Un coach qui
 * recommande le saumon et écarte le thon n'a pas d'opinion sur « les poissons
 * gras » en tant que groupe — il en a deux, opposées, sur deux aliments. En
 * dériver une posture de groupe reviendrait à lui faire dire ce qu'il n'a pas
 * dit, et l'élève recevrait un engagement que son coach n'a jamais écrit.
 *
 * La nuance n'est PAS perdue: elle reste au niveau de l'aliment, où elle
 * gouverne ce que Sophia construit. Mais elle ne remonte pas, et l'écran le
 * DIT (`deriveConflicts`) — un coach qui exclut un aliment doit savoir si son
 * exclusion compile ou pas.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ CE QU'UNE RÈGLE DE FRÉQUENCE PAR ALIMENT NE PEUT PAS FAIRE
 * ---------------------------------------------------------------------------
 * Elle n'est PAS vérifiable sur une photo. L'analyse photo rend des GROUPES;
 * elle ne dira jamais « c'était de l'huile de coco » plutôt que « de la
 * matière grasse ajoutée ». Une règle par aliment gouverne donc ce que Sophia
 * CONSTRUIT et DIT (générateur de repas, plan de semaine, réponses), jamais ce
 * qu'elle VÉRIFIE dans l'assiette.
 *
 * C'est pour ça qu'aucune fonction de ce fichier ne compile une fréquence
 * d'aliment en `plan_commitments`. Le faire donnerait au coach une garantie
 * fausse — « max 2 portions de matière grasse ajoutée » n'est pas « max 2
 * cuillères d'huile de coco », et personne ne verrait la différence avant que
 * l'élève reçoive la mauvaise.
 *
 * PURE MODULE: no I/O, no clock, no randomness, no locale.
 */

import type { CoachFoodRule, Stance } from "./protocol_compiler.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE CATALOGUE — la GRAMMAIRE d'un aliment, jamais l'opinion qu'on en a
// ---------------------------------------------------------------------------

/**
 * L'axe sur lequel un aliment se compte.
 *
 * C'est la distinction qui a motivé tout ce lot: une huile ne se règle pas
 * comme une carotte. « 3 portions par semaine » n'a aucun sens pour de l'huile
 * de coco, « 30 ml par semaine » en a un. Et c'est un fait de MESURE — huile de
 * coco et huile d'avocat partagent le même axe et peuvent porter des opinions
 * opposées.
 */
export const COUNT_AXES = ["portion", "volume", "count"] as const;
export type CountAxis = (typeof COUNT_AXES)[number];

/** Une ligne de `food_items`. */
export interface FoodItemRow {
  readonly slug: string;
  readonly food_group_ref: FoodGroupRef;
  readonly label: string;
  readonly count_axis: CountAxis;
  readonly typical_amount: number | null;
  readonly typical_unit: "g" | "ml" | "unit" | null;
  readonly default_why: string | null;
  readonly sort_order: number;
}

// ---------------------------------------------------------------------------
// LA RÈGLE DE FRÉQUENCE — gabarits FERMÉS, trous typés
// ---------------------------------------------------------------------------
// Pas de texte libre: le texte libre ne se rend pas de façon déterministe et ne
// se passe pas à un générateur sans réinterprétation. Quatre gabarits, comme
// pour les règles de groupe — et volontairement les MÊMES formes, pour qu'un
// coach n'ait pas deux grammaires à apprendre sur le même écran.

export type FrequencyRule =
  | {
    readonly template: "amount_per_period";
    readonly direction: "at_least" | "at_most";
    readonly amount: number;
    readonly amount_unit: "portion" | "g" | "ml" | "unit";
    readonly period: "day" | "week";
  }
  | { readonly template: "every_meal" }
  | { readonly template: "not_after"; readonly cutoff_local: string }
  | { readonly template: "at_slot"; readonly slot_key: string };

/** Une ligne de `coach_food_items`. */
export interface CoachFoodItem {
  readonly id: string;
  /** `null` quand le coach a ajouté l'aliment lui-même. */
  readonly food_item_ref: string | null;
  readonly label: string;
  readonly food_group_ref: FoodGroupRef;
  readonly stance: Stance;
  readonly frequency: FrequencyRule | null;
  readonly why: string | null;
  readonly why_source: "seeded" | "ai" | "coach";
}

/**
 * La fréquence par défaut que l'écran PROPOSE quand le coach ouvre le panneau.
 *
 * Elle ne présume RIEN du sens (`at_least` sur un aliment encouragé,
 * `at_most` sinon) et elle emprunte son unité à l'axe de comptage, jamais à
 * une opinion. Un coach qui ouvre le panneau d'une huile doit voir des
 * millilitres; un coach qui ouvre celui d'une carotte doit voir des portions.
 * Sans ça il retape la même conversion à chaque aliment.
 */
export function defaultFrequency(
  item: Pick<FoodItemRow, "count_axis" | "typical_amount">,
  stance: Stance,
): FrequencyRule {
  const unit: "portion" | "g" | "ml" | "unit" = item.count_axis === "volume"
    ? "ml"
    : item.count_axis === "count"
    ? "unit"
    : "portion";
  const amount = item.count_axis === "volume"
    ? (item.typical_amount ?? 15)
    : 1;
  return {
    template: "amount_per_period",
    direction: stance === "encouraged" ? "at_least" : "at_most",
    amount,
    amount_unit: unit,
    period: "week",
  };
}

// ---------------------------------------------------------------------------
// LA DÉRIVATION ALIMENT -> GROUPE
// ---------------------------------------------------------------------------

const AGAINST: ReadonlySet<Stance> = new Set<Stance>(["discouraged", "excluded"]);

/**
 * Un groupe où le coach a coché DANS LES DEUX SENS.
 *
 * Rendu à l'écran, pas avalé: sans ça, un coach qui exclut un aliment dans un
 * groupe où il en recommande un autre croirait que son exclusion compile. Elle
 * ne compile pas — elle reste au niveau de l'aliment. C'est défendable, ça ne
 * l'est plus si personne ne le lui dit.
 */
export interface GroupConflict {
  readonly food_group_ref: FoodGroupRef;
  readonly forLabels: readonly string[];
  readonly againstLabels: readonly string[];
}

export interface DerivedRules {
  readonly rules: readonly CoachFoodRule[];
  readonly conflicts: readonly GroupConflict[];
}

/**
 * Dérive les postures de groupe à partir des aliments cochés.
 *
 * SORTIE DÉTERMINISTE, triée par slug de groupe. Ce n'est pas de la coquetterie:
 * l'aperçu et le diff de publication se comparent d'une compilation à l'autre,
 * et un ordre qui dépendrait de l'ordre de lecture en base montrerait au coach
 * des mouvements fantômes sur un brouillon qu'il n'a pas touché.
 */
export function deriveFoodRules(
  items: readonly CoachFoodItem[],
): DerivedRules {
  const byGroup = new Map<string, CoachFoodItem[]>();
  for (const item of items) {
    const list = byGroup.get(item.food_group_ref) ?? [];
    list.push(item);
    byGroup.set(item.food_group_ref, list);
  }

  const rules: CoachFoodRule[] = [];
  const conflicts: GroupConflict[] = [];

  for (const group of [...byGroup.keys()].sort()) {
    const inGroup = byGroup.get(group) ?? [];
    const forItems = inGroup.filter((i) => i.stance === "encouraged");
    const againstItems = inGroup.filter((i) => AGAINST.has(i.stance));

    if (forItems.length > 0 && againstItems.length > 0) {
      conflicts.push({
        food_group_ref: group as FoodGroupRef,
        forLabels: forItems.map((i) => i.label).sort(),
        againstLabels: againstItems.map((i) => i.label).sort(),
      });
      continue;
    }

    const winners = forItems.length > 0 ? forItems : againstItems;
    if (winners.length === 0) continue;

    const stance: Stance = forItems.length > 0
      ? "encouraged"
      // La sévérité la plus forte gagne. Amollir une exclusion en « déconseillé »
      // parce qu'un autre aliment du groupe n'est que déconseillé serait décider
      // à la place du coach, dans le sens qui l'expose.
      : againstItems.some((i) => i.stance === "excluded")
      ? "excluded"
      : "discouraged";

    rules.push({
      food_group_ref: group as FoodGroupRef,
      stance,
      goal_scope: [],
      // LE « POURQUOI » NE REMONTE QUE S'IL EST SANS AMBIGUÏTÉ.
      // Un seul aliment porte la posture du groupe et il a un pourquoi: c'est
      // bien la raison de cette posture, on la fait suivre. Plusieurs aliments:
      // en choisir un serait arbitraire, et les concaténer fabriquerait une
      // phrase que le coach n'a pas écrite. Dans le doute, rien.
      rationale: winners.length === 1 ? (winners[0].why?.trim() || null) : null,
    });
  }

  return { rules, conflicts };
}

// ---------------------------------------------------------------------------
// L'APERÇU D'UNE FRÉQUENCE — une structure, jamais une phrase
// ---------------------------------------------------------------------------
// R2: ce module est SANS LOCALE. Il rend de quoi rendre la phrase; la frontière
// où la langue entre vit côté front (`api/coachFoodItems.ts`), et elle est la
// seule. Même motif que `previewSentence` pour les engagements.

export type FrequencyDescriptor =
  | {
    readonly kind: "amount";
    readonly direction: "at_least" | "at_most";
    readonly amount: number;
    readonly unit: "portion" | "g" | "ml" | "unit";
    readonly period: "day" | "week";
  }
  | { readonly kind: "every_meal" }
  | { readonly kind: "not_after"; readonly cutoff: string }
  | { readonly kind: "at_slot"; readonly slot: string };

export function frequencyDescriptor(rule: FrequencyRule): FrequencyDescriptor {
  switch (rule.template) {
    case "amount_per_period":
      return {
        kind: "amount",
        direction: rule.direction,
        amount: rule.amount,
        unit: rule.amount_unit,
        period: rule.period,
      };
    case "every_meal":
      return { kind: "every_meal" };
    case "not_after":
      return { kind: "not_after", cutoff: rule.cutoff_local };
    case "at_slot":
      return { kind: "at_slot", slot: rule.slot_key };
  }
}

// ---------------------------------------------------------------------------
// LES LIGNES DE BASE <-> LE MODÈLE
// ---------------------------------------------------------------------------
// La table étale la règle de fréquence en colonnes (R5: ce qui branche doit
// être contraignable par la base). Le modèle, lui, est une union discriminée —
// c'est ce qui rend le `switch` exhaustif au typeur. Les deux conversions
// vivent ici, ensemble, pour qu'on ne puisse pas en changer une sans voir
// l'autre.

export function frequencyFromRow(row: Record<string, unknown>): FrequencyRule | null {
  const template = row.frequency_template as FrequencyRule["template"] | null;
  if (!template) return null;
  switch (template) {
    case "amount_per_period":
      return {
        template,
        direction: row.direction as "at_least" | "at_most",
        amount: Number(row.amount),
        amount_unit: row.amount_unit as "portion" | "g" | "ml" | "unit",
        period: row.period as "day" | "week",
      };
    case "every_meal":
      return { template };
    case "not_after":
      return { template, cutoff_local: String(row.cutoff_local) };
    case "at_slot":
      return { template, slot_key: String(row.slot_key) };
  }
}

/**
 * Les colonnes de fréquence, TOUTES, y compris celles qu'on remet à `null`.
 *
 * Un `update` partiel laisserait traîner le trou du gabarit précédent — et la
 * CHECK `coach_food_items_slots_match_frequency` refuserait la ligne, ce qui
 * est le bon comportement de la base mais un bug ici. Passer d'une règle
 * horaire à une règle de quantité doit EFFACER l'heure.
 */
export function frequencyToRow(
  rule: FrequencyRule | null,
): Record<string, string | number | null> {
  const empty = {
    frequency_template: null,
    direction: null,
    amount: null,
    amount_unit: null,
    period: null,
    cutoff_local: null,
    slot_key: null,
  } as Record<string, string | number | null>;

  if (!rule) return empty;
  switch (rule.template) {
    case "amount_per_period":
      return {
        ...empty,
        frequency_template: rule.template,
        direction: rule.direction,
        amount: rule.amount,
        amount_unit: rule.amount_unit,
        period: rule.period,
      };
    case "every_meal":
      return { ...empty, frequency_template: rule.template };
    case "not_after":
      return { ...empty, frequency_template: rule.template, cutoff_local: rule.cutoff_local };
    case "at_slot":
      return { ...empty, frequency_template: rule.template, slot_key: rule.slot_key };
  }
}
