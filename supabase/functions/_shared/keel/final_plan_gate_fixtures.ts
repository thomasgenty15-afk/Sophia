/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES FIXTURES DE LA GARDE FINALE — un plan RÉEL, réduit et anonymisé.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── D'OÙ ELLES VIENNENT ──────────────────────────────────────────────────
 * Du plan de production `A03-vegan4-7-r4` (foyer de 4 bouches, 36 plats, 14
 * préparations, 3 sessions, 29 lignes de courses), réduit à ce qui rend les
 * ONZE dénominateurs de `counters.checked` strictement positifs, et anonymisé
 * (identifiants de membres remplacés par `m-*`, aucun UUID réel).
 *
 * ⛔ RIEN N'EST LU DEPUIS `scratchpad/` À L'EXÉCUTION DES TESTS, et c'est
 * délibéré : un test qui lit un artefact hors du dépôt devient rouge le jour
 * où quelqu'un range son disque, et personne ne sait plus ce qu'il mesurait.
 * Les données sont INLINE, donc versionnées avec la garde qu'elles épinglent.
 *
 * ── CE QUE LE CAS PROPRE DOIT PROUVER ────────────────────────────────────
 * Zéro refus, ET onze dénominateurs > 0. Les deux moitiés comptent : une
 * garde qui refuse tout et une garde qui n'évalue rien rendent toutes deux un
 * résultat qui « a l'air » de marcher.
 *
 * ── CE QUI EST ARMÉ SANS MORDRE, EXPRÈS ──────────────────────────────────
 * · un régime (`vegetarian`) sur une table entièrement végétale ;
 * · une exclusion de table (« champignons ») qu'aucun plat ne sert ;
 * · une exclusion de bouche (« coriandre ») pour Nora ;
 * · une règle de maison (« nutella ») ;
 * · un garde-manger (« huile d'olive »).
 * Une garde qu'on ne fait tourner que sur des vocabulaires VIDES ne prouve
 * rien : elle rend le même zéro qu'une garde débranchée.
 *
 * PURE: aucune I/O, aucune horloge.
 */

import type { GateContext, GatePlan } from "./final_plan_gate.ts";
import { FINAL_GATE_POLICY_LOT_1 } from "./final_plan_gate.ts";

// ---------------------------------------------------------------------------
// Les bouches — anonymisées
// ---------------------------------------------------------------------------

export const PAUL = "m-paul";
export const CLAIRE = "m-claire";
export const LEO = "m-leo";
export const NORA = "m-nora";

/** `MAX_FRIDGE_DAYS`, épinglée par un littéral : voir `fridge_window.ts`. */
export const FIXTURE_MAX_FRIDGE_DAYS = 3;

/** Le dimanche d'où part la fenêtre. `windowDays[0]` est ce jour-là. */
export const FIXTURE_STARTS_ON = "2026-09-06";
export const FIXTURE_WINDOW_DAYS = ["sun", "mon", "tue"] as const;

// ---------------------------------------------------------------------------
// Le plan du foyer — propre
// ---------------------------------------------------------------------------

/**
 * ⚠️ NE PAS MUTER CET OBJET. Les tests en prennent une COPIE
 * (`structuredClone`) avant de le déformer ; c'est aussi ce qui permet
 * d'épingler la pureté de la garde.
 */
export const CLEAN_HOUSEHOLD_PLAN: GatePlan = {
  dishes: [
    {
      // ── Plat EN BOÎTES qui puise dans une casserole du dimanche ────────
      name: "Avoine aux prunes",
      title: "Flocons d'avoine, yaourt de soja et prunes",
      day: "sun",
      slot: "breakfast",
      method: "Réchauffez la portion d'avoine à la casserole, ajoutez le yaourt de soja.",
      why: "Un petit-déjeuner chaud et fruité.",
      member_id: null,
      ingredients: [],
      uses: [{ preparation_id: "prep_oats_sun", servings: 4, kept: "fridge" }],
      boxes: [
        {
          id: "box_sun_breakfast_paul",
          member_ids: [PAUL],
          items: [
            { preparation_id: "prep_oats_sun", term: "portion d'avoine aux prunes", grams: 444 },
          ],
        },
        {
          id: "box_sun_breakfast_claire_leo",
          member_ids: [CLAIRE, LEO],
          items: [
            { preparation_id: "prep_oats_sun", term: "portions d'avoine aux prunes", grams: 685 },
          ],
        },
        {
          id: "box_sun_breakfast_nora",
          member_ids: [NORA],
          items: [
            { preparation_id: "prep_oats_sun", term: "avoine et prunes", grams: 306 },
          ],
        },
      ],
    },
    {
      // ── Plat DE TABLE, cuisiné le jour même, sans aucune boîte ─────────
      name: "Dahl du dimanche soir",
      title: "Dahl de lentilles corail",
      day: "sun",
      slot: "dinner",
      method: "Faites revenir les oignons, ajoutez les lentilles et les tomates, laissez mijoter.",
      why: "Une protéine végétale que tout le monde partage.",
      member_id: null,
      ingredients: [
        { term: "lentilles corail", group: "legumes" },
        { term: "tomates concassées", group: "non_starchy_veg" },
        { term: "oignons", group: "non_starchy_veg" },
        { term: "huile d'olive", group: "olive_oil", in_pantry: true },
      ],
      uses: [],
      boxes: [],
    },
    {
      // ── Plat EN BOÎTES, mangé LE LENDEMAIN de sa cuisson ───────────────
      name: "Bowl du lundi",
      title: "Bowl quinoa, tofu et courgettes",
      day: "mon",
      slot: "dinner",
      method: "Réchauffez le bol au four quelques minutes.",
      why: "Le lot du dimanche, servi tiède.",
      member_id: null,
      ingredients: [],
      uses: [{ preparation_id: "prep_quinoa_sun", servings: 4, kept: "fridge" }],
      boxes: [
        {
          id: "box_mon_dinner_paul_claire",
          member_ids: [PAUL, CLAIRE],
          items: [
            { preparation_id: "prep_quinoa_sun", term: "quinoa, tofu et courgettes", grams: 820 },
          ],
        },
        {
          id: "box_mon_dinner_leo_nora",
          member_ids: [LEO, NORA],
          items: [
            { preparation_id: "prep_quinoa_sun", term: "quinoa, tofu et courgettes", grams: 640 },
          ],
        },
      ],
    },
  ],
  preparations: [
    {
      id: "prep_oats_sun",
      title: "Avoine aux fruits du week-end",
      method: "Faites mijoter les flocons avec la boisson de soja, ajoutez les prunes.",
      cook_on: "sun",
      ingredients: [
        { term: "flocons d'avoine", group: "whole_grain" },
        { term: "boisson de soja", group: "legumes" },
        { term: "prunes", group: "other_fruit" },
      ],
    },
    {
      id: "prep_quinoa_sun",
      title: "Quinoa et tofu rôti",
      method: "Rincez le quinoa, faites-le cuire, rôtissez le tofu et les courgettes.",
      cook_on: "sun",
      ingredients: [
        { term: "quinoa", group: "whole_grain" },
        { term: "tofu ferme", group: "tofu_tempeh" },
        { term: "courgettes", group: "non_starchy_veg" },
      ],
    },
  ],
  cooking_sessions: [
    {
      day: "sun",
      preparation_ids: ["prep_oats_sun", "prep_quinoa_sun"],
    },
  ],
  shopping_list: [
    {
      term: "flocons d'avoine",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "boisson de soja",
      aisle: "dairy",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "prunes",
      aisle: "produce",
      food_group: "other_fruit",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "quinoa",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "tofu ferme",
      aisle: "protein",
      food_group: "tofu_tempeh",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "courgettes",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "lentilles corail",
      aisle: "grains",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "tomates concassées",
      aisle: "grocery",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "oignons",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
  ],
};

const HOUSEHOLD_CELLS = [
  { day: "sun", slot: "breakfast" },
  { day: "sun", slot: "dinner" },
  { day: "mon", slot: "dinner" },
] as const;

/**
 * LE CONTEXTE DU FOYER PROPRE.
 *
 * ⚠️ `policy` VAUT `LOT_1` : le cas qui passe se lit sous la politique qui ne
 * mord pas, sinon on ne saurait pas distinguer « rien ne mord » de « rien
 * n'est refusé ». Les tests de sévérité re-passent le même plan sous `LOT_2`
 * et `LOT_3`.
 */
export const CLEAN_HOUSEHOLD_CONTEXT: GateContext = {
  lane: "household",
  startsOn: FIXTURE_STARTS_ON,
  windowDays: [...FIXTURE_WINDOW_DAYS],
  hasFreezer: true,
  maxFridgeDays: FIXTURE_MAX_FRIDGE_DAYS,
  mouths: [
    { memberId: PAUL, regime: null, cells: [...HOUSEHOLD_CELLS] },
    { memberId: CLAIRE, regime: null, cells: [...HOUSEHOLD_CELLS] },
    { memberId: LEO, regime: null, cells: [...HOUSEHOLD_CELLS] },
    { memberId: NORA, regime: "vegetarian", cells: [...HOUSEHOLD_CELLS] },
  ],
  boxContract: { expected: 8, roster: [PAUL, CLAIRE, LEO, NORA] },
  exclusions: {
    // Armée, et elle ne mord pas : aucun plat ne sert de champignons.
    table: [{ ruleId: "Pas de champignons à la maison", token: "champignons" }],
    byMember: [
      {
        memberId: NORA,
        terms: [{ ruleId: "Nora n'aime pas la coriandre", token: "coriandre" }],
      },
    ],
  },
  strictestRegime: "vegetarian",
  houseRuleLabels: ["nutella"],
  pantryTerms: ["huile d'olive"],
  policy: FINAL_GATE_POLICY_LOT_1,
};

// ---------------------------------------------------------------------------
// Le plan SOLO — une seule bouche, aucun contrat de boîtes
// ---------------------------------------------------------------------------

export const SOLO = "m-solo";

/**
 * ⚠️ `boxContract: null` — LES BOÎTES NE SONT PAS LE CONTRAT ICI. Les deux
 * causes de boîte ne doivent alors JAMAIS mordre, même sur un plan qui n'en
 * porte aucune : c'est ce que le test solo épingle, et c'est le défaut ④ vu
 * dans l'autre sens (refuser un solo pour une boîte manquante serait aussi
 * faux que laisser passer un foyer sans boîte).
 */
export const SOLO_PLAN: GatePlan = {
  dishes: [
    {
      name: "Porridge du matin",
      title: "Porridge aux prunes",
      day: "sun",
      slot: "breakfast",
      method: "Faites chauffer les flocons avec la boisson de soja et les prunes.",
      why: "Un départ simple.",
      member_id: null,
      ingredients: [
        { term: "flocons d'avoine", group: "whole_grain" },
        { term: "boisson de soja", group: "legumes" },
        { term: "prunes", group: "other_fruit" },
      ],
      uses: [],
      boxes: [],
    },
  ],
  preparations: [],
  cooking_sessions: [],
  shopping_list: [
    {
      term: "flocons d'avoine",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "boisson de soja",
      aisle: "dairy",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "prunes",
      aisle: "produce",
      food_group: "other_fruit",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
  ],
};

export const SOLO_CONTEXT: GateContext = {
  lane: "solo",
  startsOn: FIXTURE_STARTS_ON,
  windowDays: [...FIXTURE_WINDOW_DAYS],
  hasFreezer: false,
  maxFridgeDays: FIXTURE_MAX_FRIDGE_DAYS,
  mouths: [
    { memberId: SOLO, regime: null, cells: [{ day: "sun", slot: "breakfast" }] },
  ],
  boxContract: null,
  exclusions: { table: [], byMember: [] },
  strictestRegime: null,
  houseRuleLabels: [],
  pantryTerms: [],
  policy: FINAL_GATE_POLICY_LOT_1,
};
