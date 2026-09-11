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
 * · un garde-manger (« huile d'olive ») ;
 * · QUATRE LIGNES D'ÉNERGIE RÉELLES, une par bouche, toutes AU-DESSUS du
 *   ratio. Un `ctx.energy` vide passerait aussi — et ne prouverait rien : ce
 *   serait une case qui passe parce que la règle n'a pas tourné, exactement ce
 *   que l'en-tête de la garde interdit.
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
      quantity: "600 g",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "boisson de soja",
      quantity: "1 l",
      aisle: "dairy",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "prunes",
      quantity: "800 g",
      aisle: "produce",
      food_group: "other_fruit",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "quinoa",
      quantity: "500 g",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "tofu ferme",
      quantity: "400 g",
      aisle: "protein",
      food_group: "tofu_tempeh",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "courgettes",
      quantity: "600 g",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "lentilles corail",
      quantity: "400 g",
      aisle: "grains",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "tomates concassées",
      quantity: "800 g",
      aisle: "grocery",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "oignons",
      quantity: "300 g",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
  ],
};

/**
 * ⟳ 2026-09-11 · LOT E — LES QUATRE BOUCHES, CASE PAR CASE.
 *
 * ⛔ CHAQUE CASE EST DANS ±10 % DE SA CIBLE ET CHAQUE LUNDI DANS ±5 %, avec un
 * plancher protéique ATTEINT: c'est un cas qui PASSE, pas un cas vide. Une
 * garde qu'on ne fait tourner que sur des tableaux vides rend le même zéro
 * qu'une garde débranchée.
 */
const HOUSEHOLD_ENERGY_ROWS = [
  {
    memberId: PAUL,
    breakfast: { target: 620, served: 615 },
    dinner: { target: 900, served: 890 },
    protein: { breakfast: 22, dinner: 46, floorMon: 44 },
  },
  {
    memberId: CLAIRE,
    breakfast: { target: 520, served: 512 },
    dinner: { target: 760, served: 748 },
    protein: { breakfast: 19, dinner: 39, floorMon: 37 },
  },
  {
    memberId: LEO,
    breakfast: { target: 470, served: 466 },
    dinner: { target: 690, served: 684 },
    protein: { breakfast: 17, dinner: 35, floorMon: 33 },
  },
  {
    memberId: NORA,
    breakfast: { target: 410, served: 404 },
    dinner: { target: 600, served: 594 },
    protein: { breakfast: 15, dinner: 31, floorMon: 29 },
  },
] as const;

/** L'écart en POURCENTS, arrondi nulle part: le test lit un nombre, pas un texte. */
function pct(served: number, target: number): number {
  return ((served - target) / target) * 100;
}

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
  // Servi ≥ 90 % de l'enveloppe pour les quatre : la règle TOURNE (dénominateur
  // à 4) et ne mord pas. Les ratios sont 97 %, 96 %, 97 % et 98 %.
  energy: [
    { memberId: PAUL, envelopeKcal: 2450, deliveredKcal: 2380 },
    { memberId: CLAIRE, envelopeKcal: 2050, deliveredKcal: 1975 },
    { memberId: LEO, envelopeKcal: 1850, deliveredKcal: 1790 },
    { memberId: NORA, envelopeKcal: 1600, deliveredKcal: 1560 },
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
  // ⟳ 2026-09-11 · LOT E — LES COURSES, PAR IDENTITÉ, ET ELLES NE MORDENT PAS.
  //
  // ⛔ NEUF IDENTITÉS CHIFFRÉES DES DEUX CÔTÉS, plus « huile d'olive » qui est
  // au garde-manger et dont la quantité est donc INCONNUE. La dixième prouve la
  // moitié qu'on oublie: le garde-manger déclare une PRÉSENCE, jamais un stock,
  // et cet état-là n'est pas un manque — il ne produit AUCUN refus, seulement
  // `checked.shopping_unverified: 1`.
  shopping: [
    ...([
      ["oats_rolled", "flocons d'avoine"],
      ["soy_drink", "boisson de soja"],
      ["plum", "prunes"],
      ["quinoa", "quinoa"],
      ["tofu_firm", "tofu ferme"],
      ["zucchini", "courgettes"],
      ["lentils_red", "lentilles corail"],
      ["tomato_canned", "tomates concassées"],
      ["onion", "oignons"],
    ] as const).map(([identity, displayTerm]) => ({
      identity,
      displayTerm,
      state: "covered_measured" as const,
      reason: "acheté ≥ requis",
    })),
    {
      identity: "olive_oil",
      displayTerm: "huile d'olive",
      state: "present_unquantified" as const,
      reason: "déclaré au garde-manger — présence seule, quantité inconnue",
    },
  ],
  // ⟳ 2026-09-11 · LOT E — LA NUTRITION PAR PERSONNE / DATE / CRÉNEAU.
  //
  // ⛔ TROIS CASES × QUATRE BOUCHES. Les deux cases EN BOÎTES portent une
  // portion pour chacun; la case de TABLE (`sun/dinner`, le dahl) n'en porte
  // pour personne — et c'est normal: `portionExpected: false`, état
  // `not_personal`. Sans cette distinction, la garde refuserait tous les repas
  // partagés d'un foyer, c'est-à-dire le produit lui-même.
  nutrition: {
    cells: HOUSEHOLD_ENERGY_ROWS.flatMap(({ memberId, breakfast, dinner, protein }) => [
      {
        memberId,
        day: "sun",
        date: "2026-09-06",
        slot: "breakfast",
        hasDish: true,
        hasPortion: true,
        targetKcal: breakfast.target,
        servedKcal: breakfast.served,
        proteinG: protein.breakfast,
        deltaPct: pct(breakfast.served, breakfast.target),
        gap: null,
        portionExpected: true,
        state: "conforme" as const,
      },
      {
        memberId,
        day: "sun",
        date: "2026-09-06",
        slot: "dinner",
        hasDish: true,
        hasPortion: false,
        targetKcal: null,
        servedKcal: null,
        proteinG: null,
        deltaPct: null,
        gap: null,
        portionExpected: false,
        state: "not_personal" as const,
      },
      {
        memberId,
        day: "mon",
        date: "2026-09-07",
        slot: "dinner",
        hasDish: true,
        hasPortion: true,
        targetKcal: dinner.target,
        servedKcal: dinner.served,
        proteinG: protein.dinner,
        deltaPct: pct(dinner.served, dinner.target),
        gap: null,
        portionExpected: true,
        state: "conforme" as const,
      },
    ]),
    // ⚠️ LE DIMANCHE EST `unmeasurable`, ET C'EST HONNÊTE: sa somme manque la
    // part du dahl, qu'aucun contenant ne porte. Publier un écart sur une
    // journée à trou ferait passer une MESURE absente pour de la NOURRITURE
    // absente. Le lundi, lui, est complet — c'est lui qui fait tourner
    // `measured_days` et `protein_days`.
    days: HOUSEHOLD_ENERGY_ROWS.flatMap(({ memberId, breakfast, dinner, protein }) => [
      {
        memberId,
        date: "2026-09-06",
        cellsExpected: 2,
        cellsMeasured: 1,
        coveredBudgetKcal: null,
        servedKcal: breakfast.served,
        deltaPct: null,
        proteinG: null,
        protein: { coveredFloorG: null, reason: "coverage_unknown" },
        state: "unmeasurable" as const,
      },
      {
        memberId,
        date: "2026-09-07",
        cellsExpected: 1,
        cellsMeasured: 1,
        coveredBudgetKcal: dinner.target,
        servedKcal: dinner.served,
        deltaPct: pct(dinner.served, dinner.target),
        proteinG: protein.dinner,
        protein: { coveredFloorG: protein.floorMon, reason: "applied_covered_window" },
        state: "conforme" as const,
      },
    ]),
  },
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
      quantity: "600 g",
      aisle: "grains",
      food_group: "whole_grain",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "boisson de soja",
      quantity: "1 l",
      aisle: "dairy",
      food_group: "legumes",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    },
    {
      term: "prunes",
      quantity: "800 g",
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
  // Une ligne RÉELLE, au-dessus du ratio (96 %) : le solo aussi doit faire
  // tourner la règle, sinon son cas propre serait propre par vacuité.
  energy: [{ memberId: SOLO, envelopeKcal: 2100, deliveredKcal: 2020 }],
  boxContract: null,
  exclusions: { table: [], byMember: [] },
  strictestRegime: null,
  houseRuleLabels: [],
  pantryTerms: [],
  // ⟳ 2026-09-11 · LOT E — LE SOLO AUSSI FAIT TOURNER LES COURSES. Sinon son
  // cas propre serait propre PAR VACUITÉ.
  shopping: [
    { identity: "oats_rolled", displayTerm: "flocons d'avoine", state: "covered_measured", reason: "acheté ≥ requis" },
    { identity: "soy_drink", displayTerm: "boisson de soja", state: "covered_measured", reason: "acheté ≥ requis" },
    { identity: "plum", displayTerm: "prunes", state: "covered_measured", reason: "acheté ≥ requis" },
  ],
  // ⛔ UNE SEULE CASE, SANS AUCUNE BOÎTE, ET ELLE NE DOIT PAS MORDRE. Le solo
  // de cette fixture mange à table; `portionExpected: false` dit qu'aucune
  // portion individuelle n'est attendue. Le cas SYMÉTRIQUE — une lane qui
  // dimensionne des portions personnelles et livre une case à zéro contenant —
  // est le défaut ① du 2026-09-11, et il a son propre test.
  nutrition: {
    cells: [
      {
        memberId: SOLO,
        day: "sun",
        date: "2026-09-06",
        slot: "breakfast",
        hasDish: true,
        hasPortion: true,
        targetKcal: 560,
        servedKcal: 553,
        proteinG: 21,
        deltaPct: pct(553, 560),
        gap: null,
        portionExpected: true,
        state: "conforme",
      },
    ],
    days: [
      {
        memberId: SOLO,
        date: "2026-09-06",
        cellsExpected: 1,
        cellsMeasured: 1,
        coveredBudgetKcal: 560,
        servedKcal: 553,
        deltaPct: pct(553, 560),
        proteinG: 21,
        protein: { coveredFloorG: 20, reason: "applied_covered_window" },
        state: "conforme",
      },
    ],
  },
  policy: FINAL_GATE_POLICY_LOT_1,
};
