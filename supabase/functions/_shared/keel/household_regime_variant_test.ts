// ══════════════════════════════════════════════════════════════════════════
// § 2.2 — LA VARIANTE DE RÉGIME ARRIVE-T-ELLE DANS L'ASSIETTE ?
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE FICHIER SUIT UNE SEULE CHAÎNE, DE BOUT EN BOUT, SUR LE CAS QUI L'A
// RÉVÉLÉE: une personne VÉGANE dans un foyer OMNIVORE. Quatre maillons, et le
// défaut du 2026-09-13 en cassait trois:
//
//   ① DÉCIDÉ  — `householdCells` nomme les bouches que la base ne peut pas
//                nourrir. Une seule liste, réutilisée par tout le reste.
//   ② ENSEIGNÉ — `dedicatedDishBlock` + `dishOwnerSchemaBlock` disent COMMENT
//                l'écrire (`for_member_id`), et `householdDietBlock` n'y
//                renvoie que quand la section part vraiment.
//   ③ PARSÉ    — `parseGeneratedMeal` accepte le `for_member_id` d'un porteur
//                et REFUSE celui d'une bouche hors liste, sans jeter le plat.
//   ④ SERVI    — `eatersByDish` + `applySizingForEaters` mettent les items du
//                plat dédié dans la boîte de SON porteur, et de personne
//                d'autre.
//
// ══════════════════════════════════════════════════════════════════════════
// LE CAS QUI PASSE EST ÉCRIT EN PREMIER — une garde cassée refuse tout et
// ressemble trait pour trait à une garde qui marche.
// ══════════════════════════════════════════════════════════════════════════
// `le_foyer_sans_variante` ci-dessous: la MÊME table végane+omnivore, mais
// personne ne réclame plus de protéine que la casserole végane peut rendre.
// Zéro plat dédié, une seule recette commune, rien de cuisiné deux fois.
//
// ══════════════════════════════════════════════════════════════════════════
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
// ══════════════════════════════════════════════════════════════════════════
//   V1 — `dietDiverges` perd sa prémisse ① (`regimeCovers(own, strictest)`).
//        ROUGE: la table entièrement végane paierait un second plat.
//   V2 — `dedicatedInCell` ignore `m.demands`. ROUGE: l'omnivore en prise de
//        masse ne reçoit plus rien, et la table entière mange végane.
//   V3 — `dishBearerIds` vidé au budget. ROUGE: le `for_member_id` du porteur
//        est refusé par le parseur, et son plat revient à la table.
//   V4 — `householdDietBlock` renvoie à la section sans condition. ROUGE: le
//        renvoi mort du 2026-09-13 revient.

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  type CellMouth,
  eatersByDish,
  householdCells,
} from "./household_cells.ts";
import {
  dietDiverges,
  householdDietBlock,
  strictestRegimeAt,
} from "./household_diet.ts";
import {
  dedicatedDishBlock,
  dishOwnerSchemaBlock,
} from "./household_meal_generation.ts";
import type { MergedEater } from "./meal_generation.ts";
import { parseGeneratedMeal } from "./meal_generation.ts";
import { applySizingForEaters } from "./portion_sizing.ts";
import {
  buildCompositionIndex,
  type CompositionInput,
  type CompositionRef,
  nutrientsOf,
  resolveIngredients,
} from "./food_composition.ts";
import type { ServingAxisDemands } from "./household_portions.ts";

// ---------------------------------------------------------------------------
// LE FOYER — deux bouches, deux lignes qui ne se rencontrent pas
// ---------------------------------------------------------------------------

const MAX = "m-max";
const LEA = "m-lea";

const RIEN_DEMANDE: ServingAxisDemands = {
  protein: null,
  starch: null,
  vegetables: null,
};
/** Ce que `muscle_gain` écrit sur l'axe protéine — au-dessus de `full`. */
const PLUS_DE_PROTEINE: ServingAxisDemands = {
  protein: "larger",
  starch: null,
  vegetables: null,
};

const RYTHME2 = [
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

function mouth(over: Partial<CellMouth> & { memberId: string }): CellMouth {
  return {
    eatingSlots: null,
    away: [],
    lightSlots: [],
    diet: null,
    demands: RIEN_DEMANDE,
    ownMealSlots: [],
    ownMealDays: null,
    ...over,
  };
}

/**
 * LA TABLE DU CAS: Max omnivore en prise de masse, Lea végane.
 * `demandesDeMax` permet d'éteindre la seule exigence qui ouvre un plat.
 */
function tableVeganeEtOmnivore(demandesDeMax: ServingAxisDemands) {
  const mouths = [
    mouth({ memberId: MAX, demands: demandesDeMax }),
    mouth({ memberId: LEA, diet: "vegan" as const }),
  ];
  // ⛔ LE MÊME APPEL QUE LE HANDLER: la ligne de la base est `strictestRegimeAt`
  // du roster, c'est-à-dire très exactement ce que `householdDietBlock` écrit
  // au modèle. La recopier en dur ici ferait un test qui ne mesure plus la
  // jonction qu'il existe pour tenir.
  const baseRegime = strictestRegimeAt(mouths.map((m) => m.diet));
  return {
    baseRegime,
    outcome: householdCells({
      mouths,
      baseRegime,
      houseRhythm: RYTHME2,
      windowDays: ["wed", "thu"],
      gridSlots: ["lunch", "dinner"],
      spentSlots: { day: null, slots: [] },
      cookOnlyDay: null,
    }),
  };
}

/** La projection du handler: la grille → la liste que le prompt emporte. */
function porteursDe(cells: readonly { dedicated: { memberId: string }[] }[]) {
  const ids = new Set(cells.flatMap((c) => c.dedicated.map((d) => d.memberId)));
  return [{ memberId: MAX, displayName: "Max" }, {
    memberId: LEA,
    displayName: "Lea",
  }].filter((m) => ids.has(m.memberId));
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA DÉCISION — une seule, et elle nomme la bonne bouche
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("le_foyer_sans_variante — une végane et un omnivore SANS exigence: aucun second plat", () => {
  // ⛔ LE CAS QUI PASSE, ET C'EST LE CAS NOMINAL. La base suit la ligne la plus
  // stricte: elle est mangeable par les deux, et le contrat de Max en sort.
  // Une recette commune compatible suffit.
  const { baseRegime, outcome } = tableVeganeEtOmnivore(RIEN_DEMANDE);
  assertEquals(baseRegime, "vegan");
  assertEquals(outcome.counters.dedicated_cells, 0);
  assertEquals(outcome.counters.dedicated_mouths, 0);
  assertEquals(porteursDe(outcome.cells), []);
  for (const c of outcome.cells) assertEquals(c.regime, "vegan");
});

Deno.test("⛔ l'OMNIVORE EN PRISE DE MASSE reçoit son plat — et la VÉGANE jamais", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ SUR LE PROMPT RÉELLEMENT TRANSMIS (N=4, 2026-09-13)
  // ══════════════════════════════════════════════════════════════════════
  // La section `A DISH OF THEIR OWN` commandait un plat à **Lea**, la végane,
  // sur une page qui déclarait la base végane — donc SA ligne — et qui nommait
  // deux autres bouches comme celles qui mangent le leur. Le même message
  // excluait ensuite Lea des plats qu'il venait de lui commander.
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  assertEquals(outcome.counters.dedicated_cells, 4, "2 jours × 2 moments");
  assertEquals(outcome.counters.dedicated_by_reason.regime, 4);
  for (const c of outcome.cells) {
    // ⟳ 2026-09-14 · BÊTA 1A — `baseEdible: true`, ET C'EST LE POINT. Max est
    // omnivore à une table végane: la casserole lui est parfaitement
    // MANGEABLE, c'est sa direction de service qui réclame autre chose. La
    // garde finale ne refuse donc PAS ce plan-là — elle le compte.
    assertEquals(c.dedicated, [
      { memberId: MAX, reason: "regime", baseEdible: true },
    ]);
  }
  assertEquals(porteursDe(outcome.cells).map((m) => m.memberId), [MAX]);
});

Deno.test("⛔ CONTRE-CAS QUI MORD — une table ENTIÈREMENT végane ne paie aucun second plat", () => {
  // La même prise de masse, mais la bouche PORTE elle-même la ligne: le plat
  // commun EST son plat. C'est la prémisse ① de `dietDiverges`, et sans elle on
  // cuisinerait un plat végane à côté d'un plat végane.
  assertEquals(
    dietDiverges({
      strictest: "vegan",
      own: "vegan",
      demands: PLUS_DE_PROTEINE,
    }),
    false,
  );
  const mouths = [
    mouth({ memberId: MAX, diet: "vegan" as const, demands: PLUS_DE_PROTEINE }),
    mouth({ memberId: LEA, diet: "vegan" as const }),
  ];
  const out = householdCells({
    mouths,
    baseRegime: strictestRegimeAt(mouths.map((m) => m.diet)),
    houseRhythm: RYTHME2,
    windowDays: ["wed", "thu"],
    gridSlots: ["lunch", "dinner"],
    spentSlots: { day: null, slots: [] },
    cookOnlyDay: null,
  });
  assertEquals(out.counters.dedicated_cells, 0);
  assertEquals(porteursDe(out.cells), []);
});

Deno.test("⛔ CONTRE-CAS QUI MORD — un foyer SANS aucun régime ne paie aucun second plat", () => {
  // Aucune ligne déclarée ⇒ aucune impossibilité. « Il lui en faut plus » n'est
  // pas « il ne peut pas manger ça », et la part a son canal.
  const mouths = [
    mouth({ memberId: MAX, demands: PLUS_DE_PROTEINE }),
    mouth({ memberId: LEA, demands: PLUS_DE_PROTEINE }),
  ];
  const out = householdCells({
    mouths,
    baseRegime: strictestRegimeAt(mouths.map((m) => m.diet)),
    houseRhythm: RYTHME2,
    windowDays: ["wed", "thu"],
    gridSlots: ["lunch", "dinner"],
    spentSlots: { day: null, slots: [] },
    cookOnlyDay: null,
  });
  assertEquals(out.counters.dedicated_cells, 0);
});

Deno.test("les présences DIFFÉRENTES ne dédient que les cases réellement mangées", () => {
  // Max déjeune et dîne; Lea ne dîne pas. La case du dîner du jeudi ne compte
  // donc qu'une bouche — et Max y reste dédié, parce que la LIGNE de la table
  // ne dépend pas de qui est présent ce soir-là (R4, sur `platedMembers`).
  const mouths = [
    mouth({ memberId: MAX, demands: PLUS_DE_PROTEINE }),
    mouth({
      memberId: LEA,
      diet: "vegan" as const,
      eatingSlots: [{ slot: "lunch" as const, size: null }],
    }),
  ];
  const out = householdCells({
    mouths,
    baseRegime: strictestRegimeAt(mouths.map((m) => m.diet)),
    houseRhythm: RYTHME2,
    windowDays: ["wed", "thu"],
    gridSlots: ["lunch", "dinner"],
    spentSlots: { day: null, slots: [] },
    cookOnlyDay: null,
  });
  const diners = out.cells.filter((c) => c.slot === "dinner");
  assertEquals(diners.length, 2);
  for (const c of diners) assertEquals(c.eaters, [MAX]);
  assertEquals(out.counters.dedicated_cells, 4);
  assertEquals(out.counters.dedicated_mouths, 4, "Max seul, sur ses quatre cases");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② ENSEIGNÉ — la promesse et la clé de schéma se touchent
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("ENSEIGNÉ — la section nomme le porteur, et la clé `for_member_id` sort avec", () => {
  const { baseRegime, outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const bearers = porteursDe(outcome.cells);
  const consigne = dedicatedDishBlock(bearers, 4);
  const schema = dishOwnerSchemaBlock(bearers).join("\n");
  assert(consigne.includes("== A DISH OF THEIR OWN =="));
  assert(consigne.includes(`Max = ${MAX}`), "le porteur n'est pas nommé par son id");
  assert(!consigne.includes(LEA), "la végane est commandée un plat qu'elle n'a pas à avoir");
  assert(
    consigne.includes("for_member_id") || schema.includes("for_member_id"),
    "la clé n'est enseignée nulle part: le calendrier commande un plat sans forme",
  );

  const diet = householdDietBlock({
    strictest: baseRegime,
    heldBy: ["Lea"],
    freeNames: ["Max"],
    divergingNames: bearers.map((m) => m.displayName),
    dedicatedSectionSent: bearers.length > 0,
    boxChannelOpen: true,
  });
  assert(diet.includes("A DISH OF THEIR OWN"), "le renvoi a disparu du bloc de régime");
  assert(
    diet.includes("Max eat a dish of their OWN"),
    "le bloc de régime nomme une autre bouche que la section",
  );
});

Deno.test("ENSEIGNÉ — ⛔ SANS SECTION, PAS DE RENVOI: le mensonge du 2026-09-13", () => {
  // ⛔ L'ÉTAT EXACT DU PROMPT N=2 DU 2026-09-13, REJOUÉ: le bloc nommait Max
  // (« eat a dish of their OWN … see A DISH OF THEIR OWN ») pendant que la
  // section, elle, n'était pas émise. Une occurrence de la chaîne dans tout le
  // message, et c'était le renvoi lui-même.
  const menteur = householdDietBlock({
    strictest: "vegan",
    heldBy: ["Lea"],
    freeNames: ["Max"],
    divergingNames: ["Max"],
    dedicatedSectionSent: false,
    boxChannelOpen: true,
  });
  assert(
    !menteur.includes("A DISH OF THEIR OWN"),
    "le bloc renvoie à une section que le message n'envoie pas",
  );
  // ⚠️ ET IL GARDE CE QU'IL A DE VRAI: ces bouches ne sont pas liées par la
  // ligne du dessus, et le canal qui existe réellement est nommé.
  assert(menteur.includes("Max are NOT bound by the sentence above"));
  assert(menteur.includes("their own box of the dish"));

  // Rien du tout quand personne ne porte de plat.
  const muet = householdDietBlock({
    strictest: "vegan",
    heldBy: ["Lea"],
    freeNames: ["Max"],
    divergingNames: [],
    dedicatedSectionSent: false,
    boxChannelOpen: true,
  });
  assert(!muet.includes("A DISH OF THEIR OWN"));
  assertEquals(dedicatedDishBlock([], 0), "");
  assertEquals(dishOwnerSchemaBlock([]), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ PARSÉ — la liste fermée accepte le porteur, refuse les autres
// ═══════════════════════════════════════════════════════════════════════════

const DEUX_MOMENTS = RYTHME2;
const DEUX_JOURS = ["wed", "thu"];

const PARSE_BASE = {
  doctrine: null,
  safetyConstraints: [],
  safetyConstraintTable: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: DEUX_MOMENTS,
  daysToFill: DEUX_JOURS,
  awayDays: [],
  cookingTimeMin: null,
  composition: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null as MergedEater | null,
  boxMemberIds: [] as readonly string[],
  weighedMemberIds: [] as readonly string[],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  groceryCadence: null,
  standardRecipe: false,
  boxMemberDiets: [] as readonly {
    memberId: string;
    regime: "vegan" | "vegetarian" | "pescatarian" | "gluten_free" | null;
  }[],
  boxMemberExclusions: [],
};

/** Le budget que le handler compose depuis la grille — jamais un second calcul. */
function budgetDe(cells: readonly {
  day: string;
  slot: string;
  dedicated: { memberId: string }[];
}[]): MergedEater {
  return {
    shape: "one_session",
    ownDishesShown: 0,
    dedicatedDishesAsked: Math.max(
      1,
      cells.flatMap((c) => c.dedicated).length,
    ),
    // ⟳ 2026-09-14 · BÊTA 1A ② — LA MÊME EXPRESSION QUE LE HANDLER: la case
    // porte la bouche que la grille y attend.
    dedicatedCells: cells.flatMap((c) =>
      c.dedicated.map((d) => ({
        day: c.day,
        slot: c.slot as "lunch" | "dinner",
        memberId: d.memberId,
      }))
    ),
    dishBearerIds: [
      ...new Set(cells.flatMap((c) => c.dedicated.map((d) => d.memberId))),
    ],
  };
}

/** Le plat de la table (végane) et celui de Max (jambon), sur la même case. */
function platsDeLaCase(day: string, slot: string) {
  return [
    {
      title: `Tofu et riz — ${day} ${slot}`,
      day,
      slot,
      method: "Cuire.",
      why: "Chaud et rapide.",
      ingredients: [
        { term: "tofu", quantity: "150 g", amount: 150, unit: "g", state: "raw" },
        { term: "riz", quantity: "80 g", amount: 80, unit: "g", state: "raw" },
        { term: "huile", quantity: "10 g", amount: 10, unit: "g", state: "raw" },
      ],
    },
    {
      title: `Jambon et riz — ${day} ${slot}`,
      day,
      slot,
      for_member_id: MAX,
      method: "Cuire.",
      why: "Chaud et rapide.",
      ingredients: [
        { term: "jambon", quantity: "150 g", amount: 150, unit: "g", state: "raw" },
        { term: "riz", quantity: "80 g", amount: 80, unit: "g", state: "raw" },
        { term: "huile", quantity: "10 g", amount: 10, unit: "g", state: "raw" },
      ],
    },
  ];
}

function planDeLaFenetre() {
  return {
    dishes: DEUX_JOURS.flatMap((d) =>
      ["lunch", "dinner"].flatMap((s) => platsDeLaCase(d, s))
    ),
    preparations: [],
    shopping_list: [],
  };
}

Deno.test("PARSÉ — le `for_member_id` du porteur est GARDÉ, sur les huit plats", () => {
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const meal = parseGeneratedMeal(planDeLaFenetre(), {
    ...PARSE_BASE,
    merge: budgetDe(outcome.cells),
  });
  assertEquals(meal.dishes.length, 8, "quatre cases × (table + porteur)");
  assertEquals(meal.dishes.filter((d) => d.memberId === MAX).length, 4);
  assertEquals(meal.dishes.filter((d) => d.memberId === null).length, 4);
  assert(
    !meal.issues.some((i) => i.includes("for_member_id")),
    `un for_member_id juste a été refusé: ${meal.issues.join(" · ")}`,
  );
});

Deno.test("PARSÉ — ⛔ un `for_member_id` HORS LISTE est refusé, et le plat TOMBE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 — CE TEST DISAIT L'INVERSE, ET IL ENCODAIT LE DÉFAUT.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Il attendait 8 plats: « un id refusé ne retire jamais un dîner à
  // quelqu'un ». Sauf que le plat revenu à la table est le SECOND plat de table
  // de sa case — la première en portait déjà un. Chaque bouche de la case se
  // retrouvait nommée sur deux couvercles, `mealsDelivered` rendait `double`,
  // et la porte finale refusait le PLAN ENTIER en 422. Mesuré sur 6 tirs sur
  // 13: la promesse « on ne retire le dîner de personne » produisait des plans
  // où personne n'avait de dîner.
  //
  // ⛔ CE QUI EST RETIRÉ ICI EST UN DOUBLON, PAS UN DÎNER. La case garde son
  // plat de table — les quatre plats de table sont intacts — donc tout le monde
  // y mange, exactement une fois.
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const plan = planDeLaFenetre();
  plan.dishes[1] = { ...plan.dishes[1], for_member_id: LEA };
  const meal = parseGeneratedMeal(plan, {
    ...PARSE_BASE,
    merge: budgetDe(outcome.cells),
  });
  assertEquals(meal.dishes.length, 7, "le doublon de table n'est pas tombé");
  assertEquals(meal.dishes.filter((d) => d.memberId === MAX).length, 3);
  // ⛔ LE PLAT DE LA TABLE DE CHAQUE CASE EST TOUJOURS LÀ, ET UN SEUL.
  assertEquals(meal.dishes.filter((d) => d.memberId === null).length, 4);
  assert(
    meal.issues.some((i) =>
      i.includes("for_member_id") && i.includes("not a") && i.includes(LEA) &&
      i.includes("feed everyone there twice")
    ),
    `le refus n'est pas nommé: ${meal.issues.join(" · ")}`,
  );
  // ⛔ ET IL EST COMPTÉ: un plat retiré qui ne se lit que dans du texte est un
  // plat retiré en silence.
  assertEquals(meal.dish_owner_counts.refused_dropped, 1);
  assertEquals(meal.dish_owner_counts.refused, 0);
});

Deno.test("PARSÉ — ⛔ SANS BUDGET, aucune attribution ne passe", () => {
  // C'est le contre-cas de V3: `merge: null` (aucun porteur décidé) doit
  // refuser toute attribution. Une liste vide qui accepterait tout serait « une
  // ceinture armée sur un coffre vide ».
  const meal = parseGeneratedMeal(planDeLaFenetre(), PARSE_BASE);
  assertEquals(meal.dishes.filter((d) => d.memberId === MAX).length, 0);
  assert(meal.issues.some((i) => i.includes("no dedicated dish was")));
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ SERVI — les items du plat dédié n'entrent que dans la boîte de son porteur
// ═══════════════════════════════════════════════════════════════════════════

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 8,
    carbsG: 75,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex(
  [
    ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350, proteinG: 7 }),
    ref({
      slug: "tofu",
      foodGroupRef: "tofu_tempeh",
      yieldClass: "neutral",
      energyKcal: 145,
      proteinG: 16,
    }),
    ref({
      slug: "ham",
      foodGroupRef: "red_meat",
      yieldClass: "meat_shrinks",
      energyKcal: 145,
      proteinG: 21,
    }),
    ref({
      slug: "oil",
      foodGroupRef: "olive_oil",
      yieldClass: "neutral",
      energyKcal: 900,
      proteinG: 0,
    }),
  ],
  [
    { alias: "riz", slug: "rice" },
    { alias: "tofu", slug: "tofu" },
    { alias: "jambon", slug: "ham" },
    { alias: "huile", slug: "oil" },
  ],
);

/** Les protéines d'une liste d'ingrédients, en grammes de matière première. */
function proteinesDe(ingredients: readonly CompositionInput[]): number {
  const r = resolveIngredients(INDEX, ingredients);
  const n = nutrientsOf(r.resolved);
  assert(n !== "unknown", "le référentiel du test ne résout pas ses propres termes");
  assert(n.proteinG !== null, "une macro manque: le test ne mesurerait rien");
  return n.proteinG;
}

Deno.test("SERVI — le jambon n'entre QUE dans la boîte de Max, jamais dans celle de Lea", () => {
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const meal = parseGeneratedMeal(planDeLaFenetre(), {
    ...PARSE_BASE,
    merge: budgetDe(outcome.cells),
  });

  // ── QUI MANGE QUOI, LU SUR LA GRILLE — jamais un second parcours.
  const fed = eatersByDish({
    dishes: meal.dishes.map((d) => ({
      day: d.day ?? null,
      slot: d.slot ?? null,
      memberId: d.memberId ?? null,
      complementsShared: false,
      // ⟳ 2026-09-23 — `heldOff` est requis (`judgeDishEaters`, la ceinture
      // des boîtes du moteur). `[]` : personne n'est retenu ; ce fichier juge
      // la variante de régime dans la GRILLE, pas la ceinture.
      heldOff: [],
    })),
    cells: outcome.cells,
  });
  // Le plat de table de chaque case ne nourrit plus que Lea; celui de Max, Max.
  meal.dishes.forEach((d, i) => {
    assertEquals(
      [...(fed.fedByDish[i] ?? [])],
      d.memberId === MAX ? [MAX] : [LEA],
      `plat ${i} (${d.title})`,
    );
  });
  assertEquals(fed.counters.excluded, 4, "Max quitte le plat de table de ses quatre cases");

  // ── LES CONTENANTS, AUTORÉS PAR LE MOTEUR (c'est l'écriture qui écrase
  //    celles du modèle sous `portion_v1`: on la mesure ici, pas ailleurs).
  const sized = applySizingForEaters({
    meal: { dishes: meal.dishes, preparations: meal.preparations },
    rows: meal.dishes.flatMap((d, i) =>
      [...(fed.fedByDish[i] ?? [])].map((memberId) => ({
        dishIndex: i,
        memberId,
        factor: 1,
        sized: true,
        recipeShare: null,
        starchSide: null,
      }))
    ),
    weighed: new Set([MAX, LEA]),
    index: INDEX,
  });

  for (const [i, d] of sized.dishes.entries()) {
    const boxes = (d.boxes ?? []) as {
      memberIds: string[];
      items: { term: string; grams: number }[];
    }[];
    assertEquals(boxes.length, 1, `plat ${i}: une bouche, un contenant`);
    const [box] = boxes;
    if (meal.dishes[i].memberId === MAX) {
      assertEquals(box.memberIds, [MAX]);
      assert(
        box.items.some((it) => it.term === "jambon"),
        "le plat dédié perd son jambon en route",
      );
    } else {
      assertEquals(box.memberIds, [LEA]);
      assertEquals(
        box.items.filter((it) => it.term === "jambon"),
        [],
        "⛔ la variante de l'un a modifié l'assiette de l'autre",
      );
      assert(box.items.some((it) => it.term === "tofu"));
    }
  }
});

Deno.test("SERVI — les protéines finales suivent le CONTRAT de chacun", () => {
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const meal = parseGeneratedMeal(planDeLaFenetre(), {
    ...PARSE_BASE,
    merge: budgetDe(outcome.cells),
  });
  const platDeMax = meal.dishes.find((d) => d.memberId === MAX);
  const platDeLaTable = meal.dishes.find((d) => d.memberId === null);
  assert(platDeMax && platDeLaTable);

  // ⛔ SUR LES INGRÉDIENTS FINAUX, pas sur le texte du modèle: c'est la liste
  // que le plan porte après le parseur.
  const pMax = proteinesDe(platDeMax.ingredients as readonly CompositionInput[]);
  const pLea = proteinesDe(platDeLaTable.ingredients as readonly CompositionInput[]);
  // 150 g de jambon à 21 g/100 g + 80 g de riz à 7 g/100 g = 37,1 g.
  assertEquals(Math.round(pMax * 10) / 10, 37.1);
  // 150 g de tofu à 16 g/100 g + 80 g de riz à 7 g/100 g = 29,6 g.
  assertEquals(Math.round(pLea * 10) / 10, 29.6);
  assert(
    pMax > pLea,
    "le porteur en prise de masse n'obtient pas plus de protéine que la table",
  );
});

Deno.test("SERVI — ⛔ SANS VARIANTE, les DEUX mangent la même casserole et rien n'est doublé", () => {
  // Le contre-cas du maillon ④, et il est le cas nominal: sans plat dédié, le
  // plat de table nourrit les deux, et son contenant est PARTAGÉ.
  const { outcome } = tableVeganeEtOmnivore(RIEN_DEMANDE);
  const plan = planDeLaFenetre();
  // Le modèle n'écrit qu'un plat par case quand la consigne n'en promet qu'un.
  plan.dishes = plan.dishes.filter((d) => !("for_member_id" in d));
  const meal = parseGeneratedMeal(plan, PARSE_BASE);
  assertEquals(meal.dishes.length, 4);
  const fed = eatersByDish({
    dishes: meal.dishes.map((d) => ({
      day: d.day ?? null,
      slot: d.slot ?? null,
      memberId: d.memberId ?? null,
      complementsShared: false,
      // ⟳ 2026-09-23 — `heldOff` est requis (`judgeDishEaters`, la ceinture
      // des boîtes du moteur). `[]` : personne n'est retenu ; ce fichier juge
      // la variante de régime dans la GRILLE, pas la ceinture.
      heldOff: [],
    })),
    cells: outcome.cells,
  });
  for (const set of fed.fedByDish) {
    assertEquals([...(set ?? [])].sort(), [LEA, MAX].sort());
  }
  const sized = applySizingForEaters({
    meal: { dishes: meal.dishes, preparations: meal.preparations },
    rows: meal.dishes.flatMap((d, i) =>
      [...(fed.fedByDish[i] ?? [])].map((memberId) => ({
        dishIndex: i,
        memberId,
        factor: 1,
        sized: true,
        recipeShare: null,
        starchSide: null,
      }))
    ),
    weighed: new Set<string>(),
    index: INDEX,
  });
  for (const d of sized.dishes) {
    const boxes = (d.boxes ?? []) as { memberIds: string[] }[];
    assertEquals(boxes.length, 1);
    assertEquals(boxes[0].memberIds.sort(), [LEA, MAX].sort(), "un bac pour les deux");
  }
  // ── LES QUANTITÉS COMMUNES — la casserole contient DEUX parts.
  const tofu = (d: { ingredients: { term: string; amount: number }[] }) =>
    d.ingredients.find((x) => x.term === "tofu")!.amount;
  for (const d of sized.dishes) assertEquals(tofu(d), 300, "150 g × 2 mangeurs");
});

Deno.test("SERVI — AVEC variante, la casserole commune ne cuit plus que pour qui y mange", () => {
  // ⛔ LA MOITIÉ QU'ON OUBLIE. Ouvrir un plat dédié RETIRE son porteur du plat
  // de table: la casserole commune doit rétrécir d'autant, sans quoi on achète
  // et on cuisine une part que personne ne mange.
  const { outcome } = tableVeganeEtOmnivore(PLUS_DE_PROTEINE);
  const meal = parseGeneratedMeal(planDeLaFenetre(), {
    ...PARSE_BASE,
    merge: budgetDe(outcome.cells),
  });
  const fed = eatersByDish({
    dishes: meal.dishes.map((d) => ({
      day: d.day ?? null,
      slot: d.slot ?? null,
      memberId: d.memberId ?? null,
      complementsShared: false,
      // ⟳ 2026-09-23 — `heldOff` est requis (`judgeDishEaters`, la ceinture
      // des boîtes du moteur). `[]` : personne n'est retenu ; ce fichier juge
      // la variante de régime dans la GRILLE, pas la ceinture.
      heldOff: [],
    })),
    cells: outcome.cells,
  });
  const sized = applySizingForEaters({
    meal: { dishes: meal.dishes, preparations: meal.preparations },
    rows: meal.dishes.flatMap((d, i) =>
      [...(fed.fedByDish[i] ?? [])].map((memberId) => ({
        dishIndex: i,
        memberId,
        factor: 1,
        sized: true,
        recipeShare: null,
        starchSide: null,
      }))
    ),
    weighed: new Set([MAX, LEA]),
    index: INDEX,
  });
  sized.dishes.forEach((d, i) => {
    const ing = (t: string) =>
      (d.ingredients as { term: string; amount: number }[])
        .find((x) => x.term === t)?.amount ?? 0;
    if (meal.dishes[i].memberId === MAX) {
      assertEquals(ing("jambon"), 150, "le plat de Max cuit pour une bouche");
    } else {
      assertEquals(
        ing("tofu"),
        150,
        "la casserole commune cuit encore deux parts pour une seule bouche",
      );
    }
  });
});

Deno.test("⟳ 2026-09-19 — le bloc « A DISH OF THEIR OWN » nomme les jours d'un porteur plafonné, et se tait sinon", () => {
  const bloc = dedicatedDishBlock([
    { memberId: "m-fab", displayName: "Fabrice", ownMealDays: ["mon", "thu"] },
    { memberId: "m-tom", displayName: "Tom" },
  ], 4);
  assert(bloc.includes("Fabrice = m-fab -- their own dish on Monday and Thursday ONLY"), bloc);
  assert(bloc.includes("on every other day they eat the table's dish, and it is sized for them"), bloc);
  assert(bloc.includes("  Tom = m-tom\n"), "un porteur sans plafond garde sa ligne d'avant, mot pour mot");
});
