/**
 * LES À-CÔTÉS — LE VOCABULAIRE ET LES CONSTANTES, ÉPINGLÉS.
 * ⟳ 2026-09-23 — vague 0 du chantier « assiettes normales ».
 *
 * ⛔ TOUS LES NOMBRES ATTENDUS SONT EN DUR. Changer une constante de
 * `side_courses_types.ts` doit faire rougir ce fichier
 * (`constant_pinning_gate_test.ts`: une constante numérique exportée,
 * importée par un test et non épinglée ⇒ ROUGE).
 *
 * ⛔ LA LISTE DE SECOURS EST CONFRONTÉE À UNE LECTURE DE LA BASE, RECOPIÉE EN
 * DUR ICI (`VERIFIED_GROUP_IN_BASE`, lecture SQL du 2026-09-23), et à la
 * migration 20260923110000 pour les slugs qu'elle crée ou corrige. Un slug
 * ajouté sans passer par l'une des deux n'a pas de groupe connu ici, et le
 * test le refuse.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { FoodGroupRef } from "./tokens.ts";
import {
  SIDE_COURSE_BASE_KCAL,
  SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G,
  SIDE_COURSE_DENSE_DESSERT_GROUPS,
  SIDE_COURSE_DENSE_DESSERT_MIN_G,
  SIDE_COURSE_DESSERT_COUNTED_FROM_G,
  SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G,
  SIDE_COURSE_FALLBACK_SLUGS,
  SIDE_COURSE_FALLBACK_TERMS,
  SIDE_COURSE_GOALS,
  SIDE_COURSE_GRAMS_BOUNDS,
  SIDE_COURSE_KIND_GROUPS,
  SIDE_COURSE_KIND_MAX_KCAL,
  SIDE_COURSE_KINDS,
  SIDE_COURSE_MAX_MEAL_SHARE,
  SIDE_COURSE_MAX_UNITS,
  SIDE_COURSE_MIN_ADDED_KCAL,
  SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL,
  SIDE_COURSE_REFUSALS,
  SIDE_COURSE_SLOTS,
  SIDE_COURSE_SOURCES,
} from "./side_courses_types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES VOCABULAIRES FERMÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("vocabulaires fermés des à-côtés, épinglés en dur", () => {
  assertEquals(SIDE_COURSE_KINDS, ["starter", "cheese", "dessert", "bread"]);
  assertEquals(SIDE_COURSE_SLOTS, ["lunch", "dinner"]);
  assertEquals(SIDE_COURSE_GOALS, ["fat_loss", "maintenance", "muscle_gain", "minor"]);
  assertEquals(SIDE_COURSE_SOURCES, ["model", "engine_fallback"]);
  assertEquals(SIDE_COURSE_REFUSALS, [
    "unknown_member",
    "not_asked",
    "duplicate",
    "unresolved",
    "wrong_kind",
    "excluded",
    "regime",
    "dairy_budget",
    "bad_preparation",
  ]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES CONSTANTES NUMÉRIQUES — épinglage littéral, objet entier
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — SIDE_COURSE_BASE_KCAL, par objectif et par type", () => {
  assertEquals(SIDE_COURSE_BASE_KCAL, {
    fat_loss: { starter: 60, cheese: 70, dessert: 80, bread: 70 },
    maintenance: { starter: 60, cheese: 110, dessert: 90, bread: 100 },
    muscle_gain: { starter: 80, cheese: 130, dessert: 110, bread: 160 },
    minor: { starter: 40, cheese: 80, dessert: 90, bread: 80 },
  });
});

Deno.test("épinglage — SIDE_COURSE_KIND_MAX_KCAL", () => {
  assertEquals(SIDE_COURSE_KIND_MAX_KCAL, { starter: 120, cheese: 160, dessert: 250, bread: 200 });
});

Deno.test("épinglage — SIDE_COURSE_MAX_MEAL_SHARE", () => {
  assertEquals(SIDE_COURSE_MAX_MEAL_SHARE, { adult: 0.35, minor: 0.25 });
});

Deno.test("épinglage — SIDE_COURSE_MIN_ADDED_KCAL vaut 50", () => {
  assertEquals(SIDE_COURSE_MIN_ADDED_KCAL, 50);
});

Deno.test("épinglage — SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL", () => {
  assertEquals(SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL, {
    starter: 2.5,
    cheese: 6,
    dessert: 1,
    bread: 3,
  });
});

Deno.test("épinglage — SIDE_COURSE_GRAMS_BOUNDS", () => {
  assertEquals(SIDE_COURSE_GRAMS_BOUNDS, {
    starter: { min: 80, max: 250 },
    cheese: { min: 15, max: 50 },
    dessert: { min: 80, max: 300 },
    bread: { min: 20, max: 100 },
  });
});

Deno.test("épinglage — SIDE_COURSE_MAX_UNITS vaut 2", () => {
  assertEquals(SIDE_COURSE_MAX_UNITS, 2);
});

// ⟳ 2026-09-23 — un gros fruit au plus par dessert; le dessert dense pesé.
Deno.test("épinglage — SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G vaut 100", () => {
  assertEquals(SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G, 100);
});

Deno.test("épinglage — SIDE_COURSE_DESSERT_COUNTED_FROM_G vaut 50", () => {
  assertEquals(SIDE_COURSE_DESSERT_COUNTED_FROM_G, 50);
});

Deno.test("épinglage — SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G vaut 200", () => {
  assertEquals(SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G, 200);
});

Deno.test("épinglage — SIDE_COURSE_DENSE_DESSERT_MIN_G vaut 15", () => {
  assertEquals(SIDE_COURSE_DENSE_DESSERT_MIN_G, 15);
});

Deno.test("épinglage — SIDE_COURSE_DENSE_DESSERT_GROUPS, sans laitage", () => {
  assertEquals(SIDE_COURSE_DENSE_DESSERT_GROUPS, [
    "berries",
    "citrus",
    "other_fruit",
    "nuts_seeds",
    "sugar_sweets",
  ]);
  // ⛔ Le groupe du cheesecake n'y est pas: sa borne basse de 80 g le refuse.
  assert(!(SIDE_COURSE_DENSE_DESSERT_GROUPS as readonly string[]).includes("dairy_yogurt"));
  // ⚠️ Elle n'ouvre aucun groupe: les oléagineux restent hors du dessert d'une
  // personne en perte, et d'un mineur.
  assert(!SIDE_COURSE_KIND_GROUPS.dessert.fat_loss.includes("nuts_seeds"));
  assert(!SIDE_COURSE_KIND_GROUPS.dessert.minor.includes("nuts_seeds"));
  assert(SIDE_COURSE_KIND_GROUPS.dessert.muscle_gain.includes("nuts_seeds"));
});

Deno.test("cohérence — les deux seuils de l'unité d'un dessert sont ordonnés", () => {
  // 50 g ≤ unité < 100 g: au plus deux; 100 g et plus: une seule.
  assert(SIDE_COURSE_DESSERT_COUNTED_FROM_G < SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G);
  // La borne basse d'un dessert dense reste sous celle d'un dessert ordinaire.
  assert(SIDE_COURSE_DENSE_DESSERT_MIN_G < SIDE_COURSE_GRAMS_BOUNDS.dessert.min);
});

Deno.test("cohérence — aucune base ne dépasse le plafond de son type", () => {
  // Un à-côté qui partirait au-dessus de son plafond ne pourrait plus grossir,
  // et le plafond mentirait. Vérifié sur les seize couples.
  for (const goal of SIDE_COURSE_GOALS) {
    for (const kind of SIDE_COURSE_KINDS) {
      assert(
        SIDE_COURSE_BASE_KCAL[goal][kind] <= SIDE_COURSE_KIND_MAX_KCAL[kind],
        `${goal}/${kind}`,
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES GROUPES ADMIS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — SIDE_COURSE_KIND_GROUPS, objet entier", () => {
  const starter: FoodGroupRef[] = ["non_starchy_veg", "leafy_greens", "cruciferous_veg"];
  const cheese: FoodGroupRef[] = ["dairy_cheese"];
  const dessert: FoodGroupRef[] = ["berries", "citrus", "other_fruit", "dairy_yogurt"];
  const bread: FoodGroupRef[] = ["refined_grain", "whole_grain"];
  assertEquals(SIDE_COURSE_KIND_GROUPS, {
    starter: { fat_loss: starter, maintenance: starter, muscle_gain: starter, minor: starter },
    cheese: { fat_loss: cheese, maintenance: cheese, muscle_gain: cheese, minor: cheese },
    dessert: {
      fat_loss: dessert,
      maintenance: [...dessert, "nuts_seeds"],
      muscle_gain: [...dessert, "nuts_seeds", "sugar_sweets"],
      minor: dessert,
    },
    bread: { fat_loss: bread, maintenance: bread, muscle_gain: bread, minor: bread },
  });
});

Deno.test("groupes admis — le sucré n'ouvre qu'en prise, jamais un féculent en entrée (mord)", () => {
  assert(SIDE_COURSE_KIND_GROUPS.dessert.muscle_gain.includes("sugar_sweets"));
  assert(!SIDE_COURSE_KIND_GROUPS.dessert.maintenance.includes("sugar_sweets"));
  assert(!SIDE_COURSE_KIND_GROUPS.dessert.fat_loss.includes("sugar_sweets"));
  assert(!SIDE_COURSE_KIND_GROUPS.dessert.minor.includes("nuts_seeds"));
  for (const goal of SIDE_COURSE_GOALS) {
    assert(!SIDE_COURSE_KIND_GROUPS.starter[goal].includes("starchy_veg"), goal);
    assert(!SIDE_COURSE_KIND_GROUPS.starter[goal].includes("refined_grain"), goal);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA LISTE DE SECOURS, CONFRONTÉE À LA BASE ET À LA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE GROUPE DE CHAQUE SLUG, TEL QUE LA BASE LE PORTE — recopié en dur de la
 * lecture SQL du 2026-09-23 (`food_composition_refs.food_group_ref`), avec le
 * libellé et le code CIQUAL qui justifient la présence du slug. Tous sont
 * `verifie` à la lecture (provenance `ciqual` ou `manual`, aucune exception
 * nommée, aucun code CIQUAL partagé), donc composables.
 */
const VERIFIED_GROUP_IN_BASE: Readonly<Record<string, FoodGroupRef>> = {
  carrot: "non_starchy_veg", // « Carotte, crue » 20009, 40,2 kcal
  tomato: "non_starchy_veg", // « Tomate, crue » 20047, 19,3 kcal
  cucumber: "non_starchy_veg", // « Concombre, pulpe, cru » 20210, 14,7 kcal
  feta: "dairy_cheese", // « Feta AOP » 12066, 285 kcal
  apple: "other_fruit", // « Pomme, pulpe, crue » 13050, 47,6 kcal, 150 g la pièce
  orange: "citrus", // « Orange, pulpe, crue » 13034, 45,5 kcal
  clementine: "citrus", // « Clémentine ou Mandarine, pulpe, crue » 13024, 47,3 kcal
  kiwi: "other_fruit", // « Kiwi, pulpe et graines, cru » 13021, 60,5 kcal
  banana: "other_fruit", // « Banane, pulpe, crue » 13005, 90,5 kcal
  apple_compote_reduced_sugar: "other_fruit", // « Apple compote, reduced sugar » 65,1 kcal
  plain_yogurt: "dairy_yogurt", // alias « yaourt nature », 59 kcal, 3,5 g
  fromage_blanc: "dairy_yogurt", // « Fromage blanc nature, 3% MG » 19646, 76,9 kcal
  skyr: "dairy_yogurt", // alias « skyr », 63 kcal, 11 g
  bread_wholemeal_integral_bread: "whole_grain", // « pain complet ou intégral », 244 kcal
  rye_bread: "whole_grain", // « Pain de seigle, et froment » 7125, 260 kcal
  country_style_bread_french: "refined_grain", // pain de campagne, 253 kcal
  bread_french_bread_baguette: "refined_grain", // baguette, 287 kcal
};

/**
 * ⟳ 2026-09-23 (vague 2) — LES SLUGS QUE LA MIGRATION 20260923110000 CRÉE OU
 * CORRIGE (CIQUAL 2025, `scratchpad/a-cotes/donnees.md` §1-2). Ils ne sont
 * justes qu'APRÈS elle: le test suivant relit la migration pour chacun.
 */
const MIGRATION_INSERTED: Readonly<Record<string, FoodGroupRef>> = {
  comte: "dairy_cheese", // 12110 « Comté », 413 kcal, 27,8 g
  emmental: "dairy_cheese", // 12115 « Emmental ou emmenthal », 373 kcal, 27,9 g
  camembert: "dairy_cheese", // 12001 « Camembert… », 280 kcal
  brie: "dairy_cheese", // 12020 « Brie, sans précision », 345 kcal
  fresh_goat_cheese: "dairy_cheese", // 12805 « Fromage de chèvre frais… », 194 kcal
  cantal: "dairy_cheese", // 12724 « Cantal », 378 kcal
  gouda: "dairy_cheese", // 12736 « Gouda », 369 kcal
};
const MIGRATION_CORRECTED: Readonly<Record<string, FoodGroupRef>> = {
  goat_cheese: "dairy_cheese", // viande de chevreau (21800) → 12812 « Fromage de chèvre bûche », 285 kcal
  pear: "other_fruit", // `a_verifier` → 13037 « Poire, chair et peau, crue », `verifie`
};

const groupOf = (slug: string): FoodGroupRef | undefined =>
  VERIFIED_GROUP_IN_BASE[slug] ?? MIGRATION_INSERTED[slug] ?? MIGRATION_CORRECTED[slug];

/** Les slugs que la base porte mais qui désignent un AUTRE aliment, ou le désignent mal. */
const KNOWN_WRONG = [
  "young_goat", // « Chevreau, cru » — de la viande
  "radish", // les valeurs du radis NOIR
  "white_bread", // « Pain de mie, au son »
  "wholemeal_bread", // « Pain de mie, complet »
  "emmental_rape", // du fromage RÂPÉ: un ingrédient, pas un fromage servi
  "greek_yogurt", // yaourt à la grecque entier
  "cheesecake", // rangé dans `dairy_yogurt`, 330 kcal
];

/**
 * LES SLUGS JUSTES MAIS NON COMPOSABLES: une génération neuve refuse un
 * identifiant `a_verifier` (`isComposable`). `pear` et `emmental_rape` en
 * sortent par la migration 20260923110000.
 */
const NOT_COMPOSABLE = [
  "ricotta", // provenance `sas`
];

/** La migration, sans ses commentaires SQL, découpée en instructions. */
function migrationStatements(): string[] {
  const text = Deno.readTextFileSync(
    new URL(
      "../../../migrations/20260923110000_le_referentiel_des_a_cotes.sql",
      import.meta.url,
    ),
  );
  const code = text.split("\n").map((line) => {
    const at = line.indexOf("--");
    return at === -1 ? line : line.slice(0, at);
  }).join("\n");
  return code.split(";");
}

Deno.test("épinglage — SIDE_COURSE_FALLBACK_SLUGS, objet entier", () => {
  const starter = ["carrot", "tomato", "cucumber"];
  assertEquals(SIDE_COURSE_FALLBACK_SLUGS, {
    starter: { fat_loss: starter, maintenance: starter, muscle_gain: starter, minor: starter },
    cheese: {
      fat_loss: ["camembert", "fresh_goat_cheese", "emmental", "feta"],
      maintenance: ["comte", "camembert", "goat_cheese", "emmental", "brie"],
      muscle_gain: ["comte", "emmental", "cantal", "gouda"],
      minor: ["camembert", "emmental", "comte"],
    },
    dessert: {
      fat_loss: [
        "apple",
        "plain_yogurt",
        "pear",
        "fromage_blanc",
        "orange",
        "skyr",
        "kiwi",
        "clementine",
      ],
      maintenance: [
        "apple",
        "plain_yogurt",
        "pear",
        "fromage_blanc",
        "banana",
        "skyr",
        "kiwi",
        "apple_compote_reduced_sugar",
      ],
      muscle_gain: [
        "banana",
        "fromage_blanc",
        "pear",
        "skyr",
        "apple",
        "plain_yogurt",
        "apple_compote_reduced_sugar",
      ],
      minor: [
        "apple",
        "plain_yogurt",
        "pear",
        "fromage_blanc",
        "clementine",
        "apple_compote_reduced_sugar",
      ],
    },
    bread: {
      fat_loss: ["bread_wholemeal_integral_bread", "rye_bread", "country_style_bread_french"],
      maintenance: [
        "bread_wholemeal_integral_bread",
        "bread_french_bread_baguette",
        "country_style_bread_french",
        "rye_bread",
      ],
      muscle_gain: [
        "bread_french_bread_baguette",
        "bread_wholemeal_integral_bread",
        "country_style_bread_french",
        "rye_bread",
      ],
      minor: [
        "bread_french_bread_baguette",
        "bread_wholemeal_integral_bread",
        "country_style_bread_french",
      ],
    },
  });
});

Deno.test("secours — chaque slug a été vérifié (base ou migration), et son groupe est admis pour son type", () => {
  for (const kind of SIDE_COURSE_KINDS) {
    for (const goal of SIDE_COURSE_GOALS) {
      for (const slug of SIDE_COURSE_FALLBACK_SLUGS[kind][goal]) {
        const group = groupOf(slug);
        assert(group !== undefined, `${kind}/${goal}: « ${slug} » n'a pas été vérifié`);
        assert(
          SIDE_COURSE_KIND_GROUPS[kind][goal].includes(group),
          `${kind}/${goal}: « ${slug} » est ${group}, non admis`,
        );
      }
    }
  }
});

Deno.test("secours — la migration 20260923110000 écrit chaque slug qu'elle crée ou corrige (mord)", () => {
  const statements = migrationStatements();
  const used = new Set<string>();
  for (const kind of SIDE_COURSE_KINDS) {
    for (const goal of SIDE_COURSE_GOALS) {
      for (const slug of SIDE_COURSE_FALLBACK_SLUGS[kind][goal]) used.add(slug);
    }
  }
  // Tous les slugs de la migration servent la liste, et la liste s'en sert bien.
  const fromMigration = [...used].filter((s) => VERIFIED_GROUP_IN_BASE[s] === undefined).sort();
  assertEquals(fromMigration, [
    "brie",
    "camembert",
    "cantal",
    "comte",
    "emmental",
    "fresh_goat_cheese",
    "goat_cheese",
    "gouda",
    "pear",
  ]);
  const insert = statements.find((s) => s.includes("insert into public.food_composition_refs"));
  assert(insert !== undefined, "l'insertion des fromages a disparu de la migration");
  for (const [slug, group] of Object.entries(MIGRATION_INSERTED)) {
    assert(insert.includes(`('${slug}','${group}',`), `« ${slug} » n'est pas inséré en ${group}`);
  }
  const goat = statements.find((s) => s.includes("where slug = 'goat_cheese'"));
  assert(goat !== undefined && goat.includes("ciqual_code = '12812'"), "goat_cheese non corrigé");
  assert(goat.includes("energy_kcal = 285"), "goat_cheese garde les kcal de la viande");
  const pear = statements.find((s) => s.includes("where slug = 'pear'"));
  assert(pear !== undefined && pear.includes("validation_state = 'verifie'"), "pear non levée");
  assert(pear.includes("ciqual_code = '13037'"), "pear sans son code CIQUAL 2025");
});

Deno.test("secours — au moins trois aliments par type et par objectif, fromage du mineur compris", () => {
  for (const kind of SIDE_COURSE_KINDS) {
    for (const goal of SIDE_COURSE_GOALS) {
      const list = SIDE_COURSE_FALLBACK_SLUGS[kind][goal];
      assertEquals(new Set(list).size, list.length, `${kind}/${goal}: doublon`);
      assert(list.length >= 3, `${kind}/${goal}: ${list.length} aliment(s)`);
    }
  }
  // ⛔ Le fromage FORCÉ d'un mineur (`cheese: true`) a de quoi être servi.
  assertEquals(SIDE_COURSE_FALLBACK_SLUGS.cheese.minor.length, 3);
});

Deno.test("secours — aucun slug connu pour désigner un autre aliment, aucun non composable (mord)", () => {
  for (const kind of SIDE_COURSE_KINDS) {
    for (const goal of SIDE_COURSE_GOALS) {
      for (const slug of SIDE_COURSE_FALLBACK_SLUGS[kind][goal]) {
        assert(!KNOWN_WRONG.includes(slug), `${kind}/${goal}: « ${slug} » désigne mal l'aliment`);
        assert(!NOT_COMPOSABLE.includes(slug), `${kind}/${goal}: « ${slug} » n'est pas composable`);
      }
    }
  }
});

Deno.test("secours — deux desserts laitiers ne se suivent jamais dans une liste", () => {
  for (const goal of SIDE_COURSE_GOALS) {
    const list = SIDE_COURSE_FALLBACK_SLUGS.dessert[goal];
    for (let i = 1; i < list.length; i++) {
      const both = groupOf(list[i - 1]) === "dairy_yogurt" && groupOf(list[i]) === "dairy_yogurt";
      assert(!both, `${goal}: « ${list[i - 1]} » puis « ${list[i]} »`);
    }
  }
});

/**
 * LES KCAL POUR 100 g DES FROMAGES DE SECOURS — migration 20260923110000
 * (CIQUAL 2025), feta lue en base le 2026-09-23.
 */
const CHEESE_KCAL_PER_100G: Readonly<Record<string, number>> = {
  comte: 413,
  emmental: 373,
  camembert: 280,
  brie: 345,
  fresh_goat_cheese: 194,
  goat_cheese: 285,
  cantal: 378,
  gouda: 369,
  feta: 285,
};

Deno.test("secours — la base de chaque objectif tient dans 15-50 g de chacun de ses fromages", () => {
  // Les bases du fromage, recopiées EN DUR (épinglées plus haut).
  const base = { fat_loss: 70, maintenance: 110, muscle_gain: 130, minor: 80 } as const;
  for (const goal of SIDE_COURSE_GOALS) {
    assertEquals(SIDE_COURSE_BASE_KCAL[goal].cheese, base[goal], goal);
    for (const slug of SIDE_COURSE_FALLBACK_SLUGS.cheese[goal]) {
      const grams = base[goal] / CHEESE_KCAL_PER_100G[slug] * 100;
      assert(grams >= 15 && grams <= 50, `${goal}: ${slug} ⇒ ${grams.toFixed(1)} g`);
    }
  }
  // Le cas qui mord: le chèvre frais en maintien et en prise sortirait de la borne.
  assertEquals(Math.round(110 / 194 * 100), 57);
  assertEquals(Math.round(130 / 194 * 100), 67);
  assert(!SIDE_COURSE_FALLBACK_SLUGS.cheese.maintenance.includes("fresh_goat_cheese"));
  assert(!SIDE_COURSE_FALLBACK_SLUGS.cheese.muscle_gain.includes("fresh_goat_cheese"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE MOT À L'ÉCRAN D'UN SECOURS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — SIDE_COURSE_FALLBACK_TERMS, objet entier", () => {
  assertEquals(SIDE_COURSE_FALLBACK_TERMS, {
    carrot: { fr: "carottes râpées", en: "grated carrots" },
    tomato: { fr: "tomate", en: "tomato" },
    cucumber: { fr: "concombre", en: "cucumber" },
    camembert: { fr: "camembert", en: "camembert" },
    fresh_goat_cheese: { fr: "chèvre frais", en: "fresh goat cheese" },
    emmental: { fr: "emmental", en: "emmental" },
    feta: { fr: "feta", en: "feta" },
    comte: { fr: "comté", en: "comté" },
    goat_cheese: { fr: "fromage de chèvre", en: "goat cheese" },
    brie: { fr: "brie", en: "brie" },
    cantal: { fr: "cantal", en: "cantal" },
    gouda: { fr: "gouda", en: "gouda" },
    apple: { fr: "pomme", en: "apple" },
    pear: { fr: "poire", en: "pear" },
    orange: { fr: "orange", en: "orange" },
    clementine: { fr: "clémentine", en: "clementine" },
    kiwi: { fr: "kiwi", en: "kiwi" },
    banana: { fr: "banane", en: "banana" },
    apple_compote_reduced_sugar: {
      fr: "compote de pommes sans sucre",
      en: "unsweetened apple compote",
    },
    plain_yogurt: { fr: "yaourt nature", en: "plain yoghurt" },
    fromage_blanc: { fr: "fromage blanc", en: "fromage blanc" },
    skyr: { fr: "skyr", en: "skyr" },
    bread_wholemeal_integral_bread: { fr: "pain complet", en: "wholemeal bread" },
    rye_bread: { fr: "pain de seigle", en: "rye bread" },
    country_style_bread_french: { fr: "pain de campagne", en: "country bread" },
    bread_french_bread_baguette: { fr: "baguette", en: "baguette" },
  });
});

Deno.test("mots d'écran — une entrée par slug de secours, ni plus ni moins (mord)", () => {
  const used = new Set<string>();
  for (const kind of SIDE_COURSE_KINDS) {
    for (const goal of SIDE_COURSE_GOALS) {
      for (const slug of SIDE_COURSE_FALLBACK_SLUGS[kind][goal]) used.add(slug);
    }
  }
  assertEquals(Object.keys(SIDE_COURSE_FALLBACK_TERMS).sort(), [...used].sort());
  assertEquals(used.size, 26);
  for (const [slug, t] of Object.entries(SIDE_COURSE_FALLBACK_TERMS)) {
    assert(t.fr.trim() !== "" && t.en.trim() !== "", slug);
    // Un slug n'est pas un mot d'écran: aucun `_` dans un terme affiché.
    assert(!t.fr.includes("_") && !t.en.includes("_"), slug);
  }
});
