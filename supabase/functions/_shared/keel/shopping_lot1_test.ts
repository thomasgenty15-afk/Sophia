/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT 1 (2026-09-12) — LES COURSES SE PRODUISENT DEPUIS LES RECETTES, ET LA
 * FRONTIÈRE DE L'ARRONDI SE RÈGLE SANS RECOMPOSER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/REVUE-CLOTURE-C6-2026-09-12.md` § 5 et § 7.
 * Preuves  : `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/
 *            campagne-tir{1,3}-c6-*.json` — les deux plans REFUSÉS de la
 *            campagne des six tirs, lus et recopiés ici.
 *
 * ── LE DÉFAUT VISÉ ──────────────────────────────────────────────────────
 * `rebuildShoppingQuantities` parcourait les lignes que le MODÈLE avait
 * écrites : « le modèle décide encore quels achats existent ; le calcul ne
 * fait que corriger leurs quantités » (§ 5). Deux plans sur six refusés :
 *
 *   · tir 1 (`4d82720c`) — `ingredient_not_bought « champignons de Paris »`
 *     alors que la ligne EST sur la liste. Faux positif d'IDENTITÉ : la
 *     préparation porte `ref: button_mushroom_cultivated_mushroom` (le slug du
 *     modèle), la ligne de courses atteint `champignons_de_paris` (une entrée
 *     du sas, créée pour cette phrase française exacte).
 *   · tir 3 (`b6dba4b5`) — `ingredient_not_bought « blancs d'œuf »`. VRAI
 *     oubli : la préparation demande 15 `egg_white`, la liste porte 19
 *     `whole_eggs`. Le référentiel ne déclare AUCUNE couverture de l'une par
 *     l'autre — l'inventer serait un matcher maison.
 *
 * ⛔ CHAQUE ÉPREUVE PORTE UN CAS QUI MORD **ET** UN CAS QUI PASSE. Une garde
 * qui ne mord jamais ressemble trait pour trait à une garde qui marche
 * (`guards-need-a-passing-case`).
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE I/O. Les fixtures sont recopiées des archives.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  type CompositionUnit,
} from "./food_composition.ts";
import {
  MEAL_SYSTEM_PROMPT,
  MEAL_TRANSLATABLE_FIELDS,
  mealShoppingPayload,
  parseGeneratedMeal,
  type GeneratedMeal,
  type ShoppingItem,
} from "./meal_generation.ts";
import { aisleForFoodGroup } from "./shopping_identity.ts";
import {
  rebuildShoppingQuantities,
  shoppingNeedsOf,
  type SynthesizedShoppingLine,
} from "./shopping_rebuild.ts";
import { planGroceryWaves } from "./grocery_waves.ts";
import { fitPortionsToBounds } from "./portion_boundary.ts";
// ⟳ 2026-09-23 — `fitPortionsToBounds` exige `goalOf` (l'objectif de la
// bouche, qui choisit l'ordre du rabotage) et chaque item porte `kcalPerG`
// et `starch` (audit des dosages, lot 5). Ce fichier passe `goalOf: () =>
// null`, c'est-à-dire `largest_first`, la règle d'avant ce lot, et des items
// sans densité (`kcalPerG: null`) : les grammes attendus ne bougent pas.
// `starch` dit la vérité du groupe même si cet ordre ne le lit pas.

// ---------------------------------------------------------------------------
// LE DÉCOR — les aliments des deux tirs, avec les VALEURS DE LA BASE LOCALE
// ---------------------------------------------------------------------------
//
// ⚠️ `egg_white.unit_grams = 33` ET `whole_eggs.unit_grams = 55` SONT LUS DANS
// `food_composition_refs` (local, 2026-09-12). Ce ne sont pas des nombres
// choisis pour faire passer un test : c'est ce que le référentiel porte, et
// c'est ce qui rend le blanc d'œuf PESABLE sans passer par l'œuf entier.

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
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
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX: CompositionIndex = buildCompositionIndex([
  // ── TIR 3 : les deux œufs, DEUX aliments, deux slugs, aucun lien ────────
  ref({ slug: "egg_white", foodGroupRef: "eggs", energyKcal: 48.1, proteinG: 10.8, unitGrams: 33 }),
  ref({ slug: "whole_eggs", foodGroupRef: "eggs", energyKcal: 140, proteinG: 12.7, unitGrams: 55 }),
  // ── TIR 1 : les DEUX champignons, l'asymétrie exacte de la base ─────────
  ref({ slug: "button_mushroom_cultivated_mushroom", energyKcal: 22 }),
  ref({ slug: "champignons_de_paris", energyKcal: 22 }),
  // ── Le reste du décor ──────────────────────────────────────────────────
  ref({ slug: "lemon", foodGroupRef: "citrus", energyKcal: 29, unitGrams: 60 }),
  ref({ slug: "feta", foodGroupRef: "dairy_cheese", energyKcal: 264, proteinG: 14 }),
  ref({
    slug: "chicken_breast",
    foodGroupRef: "poultry",
    energyKcal: 165,
    yieldClass: "meat_shrinks",
  }),
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    yieldClass: "grain_absorbs",
  }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 884, energyDense: true }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, proteinG: 0 }),
  ref({ slug: "saffron", foodGroupRef: "sauce_dressing", energyKcal: 310 }),
], [
  { alias: "blancs d'oeuf", slug: "egg_white" },
  { alias: "oeufs", slug: "whole_eggs" },
  { alias: "oeufs entiers", slug: "whole_eggs" },
  // ⚠️ L'ASYMÉTRIE DE LA BASE, AU CARACTÈRE PRÈS : « champignons de paris »
  // n'atteint PAS le slug du modèle, il atteint l'entrée du sas.
  { alias: "champignons de paris", slug: "champignons_de_paris" },
  { alias: "citron", slug: "lemon" },
  { alias: "citrons", slug: "lemon" },
  { alias: "feta", slug: "feta" },
  { alias: "blanc de poulet", slug: "chicken_breast" },
  { alias: "riz", slug: "white_rice" },
  { alias: "huile d'olive", slug: "olive_oil" },
  { alias: "eau", slug: "water" },
]);

// ---------------------------------------------------------------------------
// LES FABRIQUES
// ---------------------------------------------------------------------------

function ing(
  term: string,
  amount: number | null,
  unit: CompositionUnit | null,
  over: { ref?: string; state?: "raw" | "cooked" } = {},
): CompositionInput {
  return {
    term,
    amount,
    unit,
    state: over.state ?? (amount === null ? null : "raw"),
    quantity: amount === null ? null : `${amount} ${unit ?? ""}`.trim(),
    ref: over.ref ?? null,
  };
}

/** Une ligne de courses telle que le MODÈLE l'écrivait encore. */
function ligne(term: string, quantity: string | null, amount: number | null, unit: CompositionUnit | null) {
  return { term, quantity, amount, unit };
}

type Rebuilt = ReturnType<typeof rebuildShoppingQuantities>;

function rebuild(args: {
  dishes?: readonly { ingredients: CompositionInput[] }[];
  preparations?: readonly { ingredients: CompositionInput[] }[];
  lines?: readonly { term: string; quantity: string | null; amount: number | null; unit: CompositionUnit | null }[];
  pantry?: readonly { term: string; quantity?: string | null }[];
  index?: CompositionIndex | null;
}): Rebuilt {
  const index = args.index === undefined ? INDEX : args.index;
  const { needs, identityByTerm } = shoppingNeedsOf({
    index,
    dishes: args.dishes ?? [],
    preparations: args.preparations ?? [],
  });
  return rebuildShoppingQuantities({
    index,
    lines: args.lines ?? [],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
    pantry: args.pantry,
  });
}

/**
 * ⛔ PAS UN `as`, UNE GARDE DE TYPE. « Un `as` sur un type étranger désarme le
 * typecheck » est une cicatrice datée de ce dépôt : forcer la lecture d'une
 * ligne comme PRODUITE ferait passer une ligne du modèle pour une ligne
 * produite, et le test resterait vert sur du code qui n'a rien fabriqué. Ici
 * la présence de `aisle` est vérifiée À L'EXÉCUTION, et elle est le fait
 * qu'on cherche : seule une ligne produite en porte un.
 */
function produite(
  line: { term: string } | SynthesizedShoppingLine,
): SynthesizedShoppingLine {
  assert("aisle" in line, `« ${line.term} » n'est pas une ligne produite`);
  return line as SynthesizedShoppingLine;
}

/**
 * ⛔ LA PREUVE D'ASSIGNABILITÉ EST AU COMPILATEUR, ET ELLE EST ICI. Si une
 * ligne produite cessait de satisfaire `ShoppingItem`, ce corps ne
 * compilerait plus — et la lane ne pourrait plus écrire la liste sans une
 * couche de conversion, c'est-à-dire sans un endroit de plus où un champ se
 * perd en silence.
 */
function _assignableAShoppingItem(line: SynthesizedShoppingLine): ShoppingItem {
  return line;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① TIR 1 — LE FAUX POSITIF D'IDENTITÉ : LA LIGNE EST LÀ, ET ELLE COMPTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ① — tir 1 : « champignons de Paris » n'est PLUS un achat manquant", () => {
  // Recopié de `campagne-tir1-c6-*.json`, `etapes.premier_jet` :
  //   ingrédient  {"term":"champignons de Paris","amount":200,"unit":"g",
  //                "ref":"button_mushroom_cultivated_mushroom"}
  //   courses     {"term":"champignons de Paris", …}   ⟵ ÉCRITE, au caractère
  const preparations = [{
    ingredients: [
      ing("champignons de Paris", 200, "g", { ref: "button_mushroom_cultivated_mushroom" }),
      ing("œufs entiers", 12, "unit", { ref: "whole_eggs" }),
    ],
  }];
  const out = rebuild({
    preparations,
    lines: [
      ligne("champignons de Paris", "200 g", 200, "g"),
      ligne("œufs entiers", "12", 12, "unit"),
    ],
  });
  // ⛔ AUCUNE LIGNE PRODUITE : la ligne du modèle était bonne, le PONT par
  // terme exact la rattache au besoin. Inventer une SECONDE ligne
  // « champignons de Paris » ferait acheter 400 g.
  assertEquals(out.counts.model_omitted, 0, "une ligne a été produite en double");
  assertEquals(out.counts.synthesized, 0);
  assertEquals(out.counts.needs_unbought, 0);
  assertEquals(out.items.map((l) => l.term), ["champignons de Paris", "œufs entiers"]);
  assertEquals(out.items[0].amount, 200);
});

Deno.test("LOT 1 ① — LE CAS QUI MORD : sans la ligne, elle est PRODUITE et l'oubli compté", () => {
  const preparations = [{
    ingredients: [
      ing("champignons de Paris", 200, "g", { ref: "button_mushroom_cultivated_mushroom" }),
    ],
  }];
  const out = rebuild({ preparations, lines: [] });
  // ⟳ 2026-09-12 · LOT 3 — SANS LISTE D'ENTRÉE, RIEN N'A ÉTÉ « OUBLIÉ ».
  // Le schéma du prompt ne demande plus `shopping_list` : chaque ligne est
  // produite, et compter ça comme un oubli du modèle faisait dire
  // `model_omitted:24` à un plan de 24 lignes — c'est-à-dire rien.
  assertEquals(out.counts.synthesized, 1);
  assertEquals(out.counts.model_omitted, 0);
  assertEquals(out.omitted.length, 0);
  assertEquals(out.items.length, 1);
  assertEquals(out.items[0].term, "champignons de Paris");
  assertEquals(out.items[0].amount, 200);
  assertEquals(out.items[0].unit, "g");
  // ⛔ L'IDENTIFIANT DE LA LIGNE PRODUITE EST CELUI DU BESOIN, donc celui de
  // l'INGRÉDIENT — pas le slug du sas que le libellé aurait atteint.
  assertEquals(produite(out.items[0]).ref, "button_mushroom_cultivated_mushroom");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② TIR 3 — LES BLANCS D'ŒUF S'ACHÈTENT, ET PAS SOUS FORME D'ŒUFS ENTIERS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ② — tir 3 : 15 blancs d'œuf produisent LEUR ligne, pas des œufs entiers", () => {
  // Recopié de `campagne-tir3-c6-*.json`, `etapes.premier_jet` :
  //   {"term":"blancs d'œuf","ref":"egg_white","amount":15,"unit":"unit"}
  //   {"term":"œufs entiers","ref":"whole_eggs","amount":4,"unit":"unit"}
  //   courses : « œufs » (19), et RIEN pour les blancs.
  const preparations = [{
    ingredients: [
      ing("blancs d'œuf", 15, "unit", { ref: "egg_white" }),
      ing("œufs entiers", 4, "unit", { ref: "whole_eggs" }),
    ],
  }];
  const out = rebuild({ preparations, lines: [ligne("œufs", "19", 19, "unit")] });
  // ⛔ LA LIGNE « œufs » RESTE SUR LES ŒUFS ENTIERS, ET ELLE EST RAMENÉE À 4.
  // Le modèle en demandait 19 parce qu'il comptait les blancs dedans ; le plan,
  // lui, n'en cuit que 4.
  assertEquals(out.items[0].term, "œufs");
  assertEquals(out.items[0].amount, 4);
  // ⛔ ET LE BLANC D'ŒUF A SA PROPRE LIGNE, avec sa propre identité.
  const blanc = produite(out.items[1]);
  assertEquals(blanc.term, "blancs d'œuf");
  assertEquals(blanc.ref, "egg_white");
  assertEquals(blanc.amount, 15);
  assertEquals(blanc.unit, "unit");
  assertEquals(blanc.food_group, "eggs");
  assertEquals(blanc.aisle, "protein");
  assertEquals(out.counts.model_omitted, 1);
  assertEquals(out.counts.needs_unbought, 0);
});

Deno.test("LOT 1 ② — LA QUANTITÉ VIENT DU RÉFÉRENTIEL, jamais d'une équivalence de noms", () => {
  // ⛔ `egg_white.unit_grams = 33` : 15 blancs pèsent 495 g CRUS, et c'est le
  // référentiel qui le dit. `whole_eggs.unit_grams = 55` : 15 œufs entiers en
  // pèseraient 825. Les confondre ferait acheter 67 % de trop, et surtout
  // ferait acheter LE MAUVAIS PRODUIT.
  const { needs } = shoppingNeedsOf({
    index: INDEX,
    dishes: [],
    preparations: [{ ingredients: [ing("blancs d'œuf", 15, "unit", { ref: "egg_white" })] }],
  });
  assertEquals(needs.get("egg_white")!.gramsRaw, 15 * 33);
  assertEquals(needs.get("egg_white")!.unweighed, 0);
  assert(!needs.has("whole_eggs"), "le blanc d'œuf a été assimilé à l'œuf entier");
});

Deno.test("LOT 1 ② — LE CAS QUI MORD : une conversion INCONNUE ne fabrique aucun gramme", () => {
  // Un aliment que le référentiel ne sait pas peser à la pièce (`unit_grams`
  // absent) : la ligne existe, elle NOMME l'aliment, et elle n'invente rien.
  // Le compteur dit combien d'achats sortent sans nombre.
  const index = buildCompositionIndex(
    [ref({ slug: "quail_egg", foodGroupRef: "eggs", energyKcal: 154 })],
    [{ alias: "oeufs de caille", slug: "quail_egg" }],
  );
  const { needs } = shoppingNeedsOf({
    index,
    dishes: [],
    preparations: [{ ingredients: [ing("œufs de caille", 6, "unit", { ref: "quail_egg" })] }],
  });
  assertEquals(needs.get("quail_egg")!.gramsRaw, null, "un gramme a été inventé");
  assertEquals(needs.get("quail_egg")!.unweighed, 1);
  const out = rebuild({
    index,
    preparations: [{ ingredients: [ing("œufs de caille", 6, "unit", { ref: "quail_egg" })] }],
  });
  // ⚠️ L'UNITÉ DU PLAN RESTE LISIBLE : « 6 » œufs de caille s'achètent même
  // quand personne ne sait ce qu'ils pèsent.
  assertEquals(out.items[0].amount, 6);
  assertEquals(out.items[0].unit, "unit");
  assertEquals(out.counts.synthesized_unquantified, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UN ACHAT TOTALEMENT OMIS — LE PLAN ENTIER SANS UNE SEULE LIGNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ③ — un plan SANS liste de courses en produit une complète", () => {
  const preparations = [{
    ingredients: [
      ing("blanc de poulet", 900, "g", { ref: "chicken_breast" }),
      ing("riz", 300, "g", { ref: "white_rice" }),
      ing("eau", 600, "ml", { ref: "water" }),
    ],
  }];
  const dishes = [{
    ingredients: [ing("feta", 60, "g", { ref: "feta" }), ing("citron", 1, "unit", { ref: "lemon" })],
  }];
  const out = rebuild({ dishes, preparations, lines: [] });
  // ⛔ L'EAU DU ROBINET N'EST PAS UN ACHAT : elle n'est pas produite, et son
  // absence n'est pas un manque.
  assertEquals(out.items.map((l) => l.term), ["blanc de poulet", "riz", "feta", "citron"]);
  assertEquals(out.counts.synthesized, 4);
  // ⟳ LOT 3 — aucune liste en entrée ⇒ aucun oubli à imputer au modèle.
  assertEquals(out.counts.model_omitted, 0);
  assertEquals(out.counts.needs_unbought, 0);
  // ⛔ LE RAYON EST DÉRIVÉ DU GROUPE, pas d'un libellé.
  assertEquals(out.items.map((l) => produite(l).aisle), [
    "protein",
    "grains",
    "dairy",
    "produce",
  ]);
  assertEquals(out.counts.aisle_other, 0);
});

Deno.test("LOT 1 ③ — sans référentiel, la ligne existe quand même et tombe en `other`", () => {
  // ⚠️ LE REPLI EST LE REPLI SÛR. Sans index, aucune identité n'est un slug,
  // donc aucun groupe n'est connu : la ligne part en `other`, ET ELLE PART.
  const out = rebuild({
    index: null,
    preparations: [{ ingredients: [ing("safran", 1, "g")] }],
    lines: [],
  });
  assertEquals(out.items.length, 1);
  assertEquals(out.items[0].term, "safran");
  assertEquals(produite(out.items[0]).aisle, "other");
  assertEquals(produite(out.items[0]).food_group, null);
  assertEquals(out.counts.aisle_other, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES PLURIELS — `citron` / `citrons` NE FONT QU'UN SEUL ACHAT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ④ — deux lignes du modèle pour le MÊME aliment sont REGROUPÉES", () => {
  // ⛔ LE DÉFAUT QUE LE REGROUPEMENT FERME, ET IL EST NOUVEAU. C3 réécrivait la
  // quantité du besoin sur CHAQUE ligne qui l'atteignait : « citron » et
  // « citrons » recevaient TOUTES LES DEUX les 3 citrons du plan — donc six
  // citrons au panier pour trois dans la recette.
  const dishes = [
    { ingredients: [ing("citron", 2, "unit", { ref: "lemon" })] },
    { ingredients: [ing("citron", 1, "unit", { ref: "lemon" })] },
  ];
  const out = rebuild({
    dishes,
    lines: [ligne("citron", "1 citron", 1, "unit"), ligne("citrons", "2 citrons", 2, "unit")],
  });
  assertEquals(out.items.length, 1, "le même achat sort deux fois");
  assertEquals(out.items[0].term, "citron");
  assertEquals(out.items[0].amount, 3);
  assertEquals(out.counts.merged, 1);
  assertEquals(out.counts.synthesized, 0);
});

Deno.test("LOT 1 ④ — LE CAS QUI MORD : deux aliments DIFFÉRENTS restent deux lignes", () => {
  const out = rebuild({
    dishes: [{
      ingredients: [
        ing("citron", 2, "unit", { ref: "lemon" }),
        ing("feta", 80, "g", { ref: "feta" }),
      ],
    }],
    lines: [ligne("citrons", "2", 2, "unit"), ligne("feta", "80 g", 80, "g")],
  });
  assertEquals(out.items.map((l) => l.term), ["citrons", "feta"]);
  assertEquals(out.counts.merged, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE GARDE-MANGER — ON NE DÉDUIT QUE CE QU'ON SAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑤ — un STOCK INCONNU laisse le besoin entier, et se marque", () => {
  // ⛔ « Ne pas inventer une quantité de stock si seule sa présence est
  // déclarée. » `household_pantry` n'a aucune colonne de quantité, et
  // « 3 boîtes » n'est pas un nombre lisible (`readQuantityFromProse` ne lit
  // AUCUN mot). Le besoin reste chiffré, entier, et il se NOMME.
  const dishes = [{ ingredients: [ing("feta", 200, "g", { ref: "feta" })] }];
  for (const stock of [undefined, "", "3 boîtes", "un reste"]) {
    const out = rebuild({ dishes, pantry: [{ term: "feta", quantity: stock ?? null }] });
    assertEquals(out.items[0].amount, 200, `stock « ${stock} » a été déduit`);
    assertEquals(out.counts.pantry_unknown, 1);
    assertEquals(out.pantryCheck.map((n) => n.term), ["feta"]);
    assertEquals(out.counts.pantry_deducted, 0);
    assertEquals(out.counts.pantry_covered, 0);
  }
});

Deno.test("LOT 1 ⑤ — LE CAS QUI PASSE : un stock CHIFFRÉ se déduit, et un stock suffisant retire la ligne", () => {
  const dishes = [{ ingredients: [ing("feta", 200, "g", { ref: "feta" })] }];
  const partiel = rebuild({ dishes, pantry: [{ term: "feta", quantity: "50 g" }] });
  assertEquals(partiel.items[0].amount, 150);
  assertEquals(partiel.items[0].quantity, "150 g");
  assertEquals(partiel.counts.pantry_deducted, 1);
  assertEquals(partiel.counts.pantry_unknown, 0);

  const suffisant = rebuild({ dishes, pantry: [{ term: "feta", quantity: "500 g" }] });
  assertEquals(suffisant.items.length, 0, "un achat inutile est resté au panier");
  assertEquals(suffisant.counts.pantry_covered, 1);
  assertEquals(suffisant.counts.needs_unbought, 0, "le besoin couvert compte comme non acheté");
});

Deno.test("LOT 1 ⑤ — DEUX UNITÉS QUI NE SE CONVERTISSENT PAS NE SE DÉDUISENT PAS", () => {
  // ⛔ AUCUNE CONVERSION INVENTÉE. « 2 » citrons au garde-manger contre un
  // besoin en grammes : le poids d'une pièce existe au référentiel, mais le
  // besoin et le stock ne parlent pas la même langue et ce module ne pèse
  // rien. On marque, on ne déduit pas.
  const dishes = [{ ingredients: [ing("citron", 120, "g", { ref: "lemon" })] }];
  const out = rebuild({ dishes, pantry: [{ term: "citrons", quantity: "2" }] });
  assertEquals(out.items[0].amount, 120);
  assertEquals(out.counts.pantry_unknown, 1);
  assertEquals(out.counts.pantry_deducted, 0);
  // ⛔ ET LE GARDE-MANGER EST RAPPROCHÉ PAR IDENTITÉ, PAS PAR LIBELLÉ :
  // « citrons » au placard a bien rejoint « citron » de la recette.
  assertEquals(out.pantryCheck.map((n) => n.term), ["citron"]);
});

Deno.test("LOT 1 ⑤ — l'eau du robinet reste dans la recette et hors du panier", () => {
  const out = rebuild({
    preparations: [{
      ingredients: [ing("riz", 100, "g", { ref: "white_rice" }), ing("eau", 500, "ml", { ref: "water" })],
    }],
    lines: [ligne("eau", "500 ml", 500, "ml")],
  });
  // La ligne du modèle reste LISIBLE, marquée non achetable ; et aucune ligne
  // d'eau n'est PRODUITE quand le modèle n'en écrit pas.
  assertEquals(out.counts.not_purchasable, 1);
  assertEquals(out.items.find((l) => l.term === "eau")!.amount, null);
  const sansLigne = rebuild({
    preparations: [{
      ingredients: [ing("riz", 100, "g", { ref: "white_rice" }), ing("eau", 500, "ml", { ref: "water" })],
    }],
  });
  assertEquals(sansLigne.items.map((l) => l.term), ["riz"]);
  // ⟳ LOT 3 — sans liste d'entrée, `model_omitted` ne compte rien ; ce qui
  // importe ici reste que l'eau n'est NI produite NI réclamée.
  assertEquals(sansLigne.counts.model_omitted, 0);
  assertEquals(sansLigne.counts.needs_unbought, 0, "l'eau a été réclamée comme un achat");
  assertEquals(sansLigne.omitted.map((n) => n.term), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · LOT 3 — L'OUBLI SE MESURE CONTRE UNE LISTE QUI EXISTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 3 — une liste ÉCRITE à qui il manque une ligne compte UN oubli", () => {
  // ⛔ LE CAS QUI DOIT MORDRE, et c'est le seul qui mesure encore le modèle :
  // une réponse ARCHIVÉE (ou d'avant le lot 1) porte une liste, et il lui
  // manque un aliment. C'est le tir 3 du 2026-09-11, « blancs d'œuf ».
  const out = rebuild({
    preparations: [{
      ingredients: [
        ing("riz", 100, "g", { ref: "white_rice" }),
        ing("feta", 60, "g", { ref: "feta" }),
      ],
    }],
    lines: [ligne("riz", "100 g", 100, "g")],
  });
  assertEquals(out.counts.model_omitted, 1);
  assertEquals(out.omitted.map((n) => n.term), ["feta"]);
  assertEquals(out.counts.synthesized, 1);
  assertEquals(out.counts.needs_unbought, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ CRU / CUIT — ON N'ACHÈTE PAS DU RIZ CUIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑥ — une ligne déclarée CUITE s'achète en grammes CRUS", () => {
  // `white_rice` est `grain_absorbs` : facteur 2,6. 260 g de riz CUIT valent
  // 100 g de riz au magasin. ⛔ La conversion est celle de `resolveIngredients`,
  // la seule du dépôt — aucune arithmétique n'est réécrite ici.
  const out = rebuild({
    preparations: [{ ingredients: [ing("riz", 260, "g", { ref: "white_rice", state: "cooked" })] }],
  });
  assertEquals(out.items.length, 1);
  assertEquals(out.items[0].amount, 100, "on achète la masse cuite");
  assertEquals(out.items[0].unit, "g");
  assertEquals(produite(out.items[0]).state, "raw");
});

Deno.test("LOT 1 ⑥ — cru ET cuit du même aliment : la somme est en grammes crus", () => {
  // ⛔ L'UNITÉ COMMUNE TOMBE dès qu'une ligne est cuite (`shoppingNeedsOf`),
  // et c'est ce qui empêche « 260 » et « 100 » de s'additionner à 360.
  const out = rebuild({
    preparations: [{
      ingredients: [
        ing("riz", 260, "g", { ref: "white_rice", state: "cooked" }),
        ing("riz", 80, "g", { ref: "white_rice" }),
      ],
    }],
  });
  assertEquals(out.items[0].amount, 180, "100 g crus + 80 g crus");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ UNE PRÉPARATION PARTAGÉE — CE QU'ON ACHÈTE EST LE LOT, PAS UNE PART
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑦ — une casserole cuisinée UNE fois pour trois plats s'achète UNE fois", () => {
  const preparations = [{
    ingredients: [ing("blanc de poulet", 900, "g", { ref: "chicken_breast" })],
  }];
  // Les trois plats CONSOMMENT la casserole ; ils ne répètent pas sa recette
  // (le prompt système le leur interdit). Leur frais propre s'ajoute.
  const dishes = [
    { ingredients: [ing("citron", 1, "unit", { ref: "lemon" })] },
    { ingredients: [ing("citron", 1, "unit", { ref: "lemon" })] },
    { ingredients: [ing("citron", 1, "unit", { ref: "lemon" })] },
  ];
  const out = rebuild({ dishes, preparations });
  assertEquals(out.items.map((l) => l.term), ["blanc de poulet", "citron"]);
  assertEquals(out.items[0].amount, 900, "le lot a été compté par plat");
  assertEquals(out.items[1].amount, 3, "les trois citrons des trois plats");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LES PIÈCES — UN NOMBRE QUI SE COMPTE, PAS UN POIDS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑧ — un ingrédient EN PIÈCES produit une ligne en pièces", () => {
  const out = rebuild({
    dishes: [{ ingredients: [ing("citron", 3, "unit", { ref: "lemon" })] }],
  });
  const l = produite(out.items[0]);
  assertEquals(l.amount, 3);
  assertEquals(l.unit, "unit");
  // ⚠️ « 3 », PAS « 3 unités » : le vocabulaire de stockage ne s'écrit pas à
  // l'écran (`UNIT_WORDS.fr.unit` rend la chaîne vide). Le terme est à côté.
  assertEquals(l.quantity, "3");
  assertEquals(l.aisle, "produce");
});

Deno.test("LOT 1 ⑧ — pièces ET grammes du même aliment : le repli est le gramme CRU", () => {
  // `lemon.unit_grams = 60`. Un citron en pièce et 30 g de zeste ne
  // s'additionnent pas dans l'unité du plan ; ils s'additionnent en grammes.
  const out = rebuild({
    dishes: [{
      ingredients: [
        ing("citron", 1, "unit", { ref: "lemon" }),
        ing("citron", 30, "g", { ref: "lemon" }),
      ],
    }],
  });
  assertEquals(out.items[0].amount, 90);
  assertEquals(out.items[0].unit, "g");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ IDEMPOTENCE — UNE SECONDE FINALISATION EST SANS EFFET
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑨ — rejouer la reconstruction sur SA PROPRE SORTIE ne change rien", () => {
  const preparations = [{
    ingredients: [
      ing("blancs d'œuf", 15, "unit", { ref: "egg_white" }),
      ing("riz", 260, "g", { ref: "white_rice", state: "cooked" }),
      ing("eau", 500, "ml", { ref: "water" }),
    ],
  }];
  const dishes = [{
    ingredients: [ing("feta", 200, "g", { ref: "feta" }), ing("citron", 2, "unit", { ref: "lemon" })],
  }];
  const pantry = [{ term: "feta", quantity: "50 g" }, { term: "riz", quantity: "un sachet" }];
  const index = INDEX;
  const { needs, identityByTerm } = shoppingNeedsOf({ index, dishes, preparations });
  const premier = rebuildShoppingQuantities({
    index,
    lines: [ligne("œufs", "19", 19, "unit"), ligne("eau", "500 ml", 500, "ml")],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
    pantry,
  });
  const second = rebuildShoppingQuantities({
    index,
    lines: premier.items,
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
    pantry,
  });
  // ⛔ LES MÊMES LIGNES, DANS LE MÊME ORDRE, AVEC LES MÊMES NOMBRES.
  assertEquals(
    second.items.map((l) => [l.term, l.amount, l.unit, l.quantity]),
    premier.items.map((l) => [l.term, l.amount, l.unit, l.quantity]),
  );
  // ⛔ ET LES COMPTEURS DE MUTATION RETOMBENT À ZÉRO : rien n'a été réécrit,
  // rien n'a été produit, rien n'a été regroupé.
  assertEquals(second.counts.requantified, 0);
  assertEquals(second.counts.synthesized, 0);
  assertEquals(second.counts.model_omitted, 0);
  assertEquals(second.counts.merged, 0);
  assertEquals(second.counts.dropped, 0);
  assertEquals(second.counts.needs_unbought, 0);
  // ⚠️ LE GARDE-MANGER NE SE DÉDUIT PAS DEUX FOIS : la feta reste à 150 g,
  // parce que la déduction part du BESOIN et jamais de la ligne précédente.
  assertEquals(second.items.find((l) => l.term === "feta")!.amount, 150);
  assertEquals(premier.items.find((l) => l.term === "feta")!.amount, 150);
  // ⚠️ LE CONTREFACTUEL : une troisième passe non plus.
  const troisieme = rebuildShoppingQuantities({
    index,
    lines: second.items,
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
    pantry,
  });
  assertEquals(
    troisieme.items.map((l) => [l.term, l.amount]),
    premier.items.map((l) => [l.term, l.amount]),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ RELECTURE UI — LE FORMAT PUBLIC RESTE LISIBLE, ET LA VAGUE PLACE LA LIGNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑩ — une ligne produite traverse `mealShoppingPayload` sans perdre un champ", () => {
  const preparations = [{
    ingredients: [ing("blanc de poulet", 900, "g", { ref: "chicken_breast" })],
  }];
  const { needs, identityByTerm } = shoppingNeedsOf({ index: INDEX, dishes: [], preparations });
  // ⛔ LA LISTE D'ENTRÉE EST TYPÉE COMME EN PRODUCTION (`meal.shopping_list`),
  // et c'est ce qui rend l'épreuve suivante vraie : la lane reçoit exactement
  // ce type-là.
  const depart: ShoppingItem[] = [];
  const out = rebuildShoppingQuantities({
    index: INDEX,
    lines: depart,
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  // ⛔ L'ASSIGNABILITÉ EST LA MOITIÉ DE L'ÉPREUVE, ET ELLE EST AU COMPILATEUR,
  // SANS UN SEUL `as` : si une ligne produite cessait de satisfaire
  // `ShoppingItem`, cette ligne-ci ne compilerait pas — et la lane ne pourrait
  // plus faire son `meal.shopping_list.splice(…, ...rebuilt.items)`.
  const items: ShoppingItem[] = out.items;
  const meal = { shopping_list: items } as unknown as GeneratedMeal;
  const paye = mealShoppingPayload(meal);
  assertEquals(paye.length, 1);
  assertEquals(paye[0].term, "blanc de poulet");
  assertEquals(paye[0].quantity, "900 g");
  assertEquals(paye[0].aisle, "protein");
  assertEquals(paye[0].food_group, "poultry");
  assertEquals(paye[0].ref, "chicken_breast");
  assertEquals(paye[0].amount, 900);
  assertEquals(paye[0].unit, "g");
  assertEquals(paye[0].state, "raw");
  assertEquals(paye[0].purchasable, true);
  // ⚠️ POSÉS PAR LA LANE, PAS ICI — et rendus quand même, `null`/`false`.
  assertEquals(paye[0].buy_on, null);
  assertEquals(paye[0].freeze_on_purchase, false);
});

Deno.test("LOT 1 ⑩ — la vague DATE une ligne produite, parce qu'elle porte le terme de l'ingrédient", () => {
  // ⛔ `grocery_waves.ts` rattache un article à sa cuisson par ÉGALITÉ EXACTE
  // du terme normalisé. Une ligne produite qui reformulerait le libellé
  // perdrait sa date d'achat en silence, et la personne achèterait tout le
  // premier jour — le défaut que `buy_on` existe pour fermer.
  const preparations = [{ ingredients: [ing("blanc de poulet", 900, "g", { ref: "chicken_breast" })] }];
  const out = rebuild({ preparations });
  const waves = planGroceryWaves({
    startsOn: "2026-09-14",
    durationDays: 7,
    shoppingList: out.items.map((l) => ({
      term: l.term,
      aisle: produite(l).aisle,
      food_group: produite(l).food_group,
      // ⟳ 2026-09-12 · FERMETURE LOT 2 — l'identifiant porte la conservation.
      ref: produite(l).ref,
    })),
    preparations: [{ id: "p1", cookOn: "sat", ingredientTerms: ["blanc de poulet"] }],
    runs: null,
    freezer: false,
  });
  assert(waves.length > 0, "aucune vague");
  const date = waves.find((w) => w.items.some((i) => i.term === "blanc de poulet"))!.buyOn;
  // La volaille se garde 3 jours crus ; la cuisson est le samedi 19.
  assert(date > "2026-09-14", `la ligne produite n'a pas été datée sur sa cuisson : ${date}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LA FRONTIÈRE DE L'ARRONDI — 631 g POUR UNE BORNE DE 630
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑪ — la portion à 631 g rentre à 630, et rien d'autre ne bouge", () => {
  // ⛔ LE CAS EXACT DE LA CAMPAGNE, tir 4 (petit appétit) :
  //   {"day":"sun","slot":"breakfast","grams":631,"limit":630,"bound":"max"}
  const box = {
    boxId: "b1",
    day: "sun",
    slot: "breakfast",
    memberIds: ["m1"],
    items: [
      { preparationId: "prep_eggs", grams: 401, group: null, kcalPerG: null, starch: false },
      { preparationId: null, grams: 150, group: null, kcalPerG: null, starch: false },
      { preparationId: null, grams: 80, group: null, kcalPerG: null, starch: false },
    ],
  };
  const counts = fitPortionsToBounds({
    boxes: [box],
    boundsFor: () => ({ min: 350, max: 630 }),
    potReadyGrams: new Map([["prep_eggs", 800]]),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(box.items.map((i) => i.grams), [400, 150, 80], "le rabotage n'a pas pris le plus gros");
  assertEquals(box.items.reduce((s, i) => s + i.grams, 0), 630);
  assertEquals(counts.shaved, 1);
  assertEquals(counts.grams_shaved, 1);
  assertEquals(counts.still_over_max, 0);
});

Deno.test("LOT 1 ⑪ — LE CAS QUI PASSE : une portion DANS ses bornes n'est pas touchée", () => {
  const box = {
    boxId: "b1",
    day: "sun",
    slot: "lunch",
    memberIds: ["m1"],
    items: [{ preparationId: null, grams: 300, group: null, kcalPerG: null, starch: false }, { preparationId: null, grams: 250, group: null, kcalPerG: null, starch: false }],
  };
  const counts = fitPortionsToBounds({
    boxes: [box],
    boundsFor: () => ({ min: 350, max: 630 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(box.items.map((i) => i.grams), [300, 250]);
  assertEquals(counts.already_in_bounds, 1);
  assertEquals(counts.shaved, 0);
  assertEquals(counts.raised, 0);
});

Deno.test("LOT 1 ⑪ — une remontée NE DÉPASSE JAMAIS le lot disponible", () => {
  // La casserole produit 300 g prêts, marge d'identité 1 % ⇒ 303 g au plus.
  // Deux contenants en tirent déjà 298. Le premier manque de 20 g pour son
  // plancher : il ne peut en obtenir que 5, donc il n'est PAS touché, et le
  // refus se NOMME.
  const boxes = [
    {
      boxId: "b1",
      day: "sat",
      slot: "dinner",
      memberIds: ["m1"],
      items: [{ preparationId: "p1", grams: 149, group: null, kcalPerG: null, starch: false }],
    },
    {
      boxId: "b2",
      day: "sat",
      slot: "dinner",
      memberIds: ["m2"],
      items: [{ preparationId: "p1", grams: 149, group: null, kcalPerG: null, starch: false }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    // ⟳ 2026-09-13 · LOT 2 § 2.4 — LE RAPPEL PREND LE REPAS. Ici m1 et m2 sont
    // deux bouches, donc deux repas distincts: seul celui de m1 a des bornes.
    boundsFor: (m) => (m.memberId === "m1" ? { min: 169, max: 400 } : null),
    potReadyGrams: new Map([["p1", 300]]),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(boxes[0].items[0].grams, 149, "le lot a été dépassé");
  assertEquals(counts.still_under_min, 1);
  assertEquals(counts.pot_headroom_blocked, 1);
  assertEquals(counts.raised, 0);
});

Deno.test("LOT 1 ⑪ — LE CAS QUI PASSE : une remontée que le lot autorise est appliquée", () => {
  const boxes = [{
    boxId: "b1",
    day: "sat",
    slot: "dinner",
    memberIds: ["m1"],
    items: [{ preparationId: "p1", grams: 149, group: null, kcalPerG: null, starch: false }],
  }];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 169, max: 400 }),
    potReadyGrams: new Map([["p1", 300]]),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(boxes[0].items[0].grams, 169);
  assertEquals(counts.raised, 1);
  assertEquals(counts.grams_raised, 20);
});

Deno.test("LOT 1 ⑪ — le FRAIS d'un plat ne se remonte pas : on n'invente pas un aliment", () => {
  const boxes = [{
    boxId: "b1",
    day: "sat",
    slot: "dinner",
    memberIds: ["m1"],
    items: [{ preparationId: null, grams: 100, group: null, kcalPerG: null, starch: false }],
  }];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 300, max: 600 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(boxes[0].items[0].grams, 100);
  assertEquals(counts.still_under_min, 1);
  assertEquals(counts.pot_headroom_blocked, 0, "aucune casserole n'était en cause");
});

Deno.test("LOT 1 ⑪ — un rabotage IMPOSSIBLE laisse la portion intacte, et se compte", () => {
  // Deux items à 1 g : il n'y a plus rien à retirer sans supprimer un aliment,
  // et supprimer un aliment serait une recomposition.
  const boxes = [{
    boxId: "b1",
    day: "sat",
    slot: "dinner",
    memberIds: ["m1"],
    items: [{ preparationId: null, grams: 1, group: null, kcalPerG: null, starch: false }, { preparationId: null, grams: 1, group: null, kcalPerG: null, starch: false }],
  }];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 0, max: 1 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
    goalOf: () => null,
  });
  assertEquals(boxes[0].items.map((i) => i.grams), [1, 1]);
  assertEquals(counts.still_over_max, 1);
  assertEquals(counts.shaved, 0);
});

Deno.test("LOT 1 ⑪ — IDEMPOTENT : un second passage ne bouge plus rien", () => {
  const boxes = [{
    boxId: "b1",
    day: "sun",
    slot: "breakfast",
    memberIds: ["m1"],
    items: [{ preparationId: "p1", grams: 401, group: null, kcalPerG: null, starch: false }, { preparationId: null, grams: 230, group: null, kcalPerG: null, starch: false }],
  }];
  const args = {
    boxes,
    boundsFor: () => ({ min: 350, max: 630 }),
    potReadyGrams: new Map([["p1", 800]]),
    potMarginPercent: 1,
    goalOf: () => null,
  };
  const un = fitPortionsToBounds(args);
  const apres = boxes[0].items.map((i) => i.grams);
  const deux = fitPortionsToBounds(args);
  assertEquals(boxes[0].items.map((i) => i.grams), apres);
  assertEquals(un.shaved, 1);
  assertEquals(deux.shaved, 0);
  assertEquals(deux.already_in_bounds, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ LE PROMPT — LA CLÉ EST PARTIE, LA LECTURE RESTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑫ — le schéma de sortie ne demande PLUS de liste de courses", () => {
  // ⛔ LA PROMESSE ET LA CLÉ DE SCHÉMA DOIVENT SE TOUCHER
  // (`promise-and-schema-key-must-be-adjacent`). Elles sont parties ENSEMBLE :
  // la clé du JSON, la consigne `mode = to_shop`, et les deux lignes
  // traduisibles.
  assert(
    !MEAL_SYSTEM_PROMPT.includes('"shopping_list"'),
    "la clé `shopping_list` est encore demandée au modèle",
  );
  assert(
    !MEAL_TRANSLATABLE_FIELDS.some((f) => f.startsWith("shopping_list")),
    "un champ de courses est encore annoncé traduisible",
  );
  // ⛔ ET LE TERME PRODUIT VIENT D'UN CHAMP QUI, LUI, RESTE TRADUIT — c'est la
  // seule raison pour laquelle une ligne produite sort dans la bonne langue.
  assert(MEAL_TRANSLATABLE_FIELDS.includes("dishes[].ingredients[].term"));
  assert(MEAL_TRANSLATABLE_FIELDS.includes("preparations[].ingredients[].term"));
});

Deno.test("LOT 1 ⑫ — LE CAS QUI PASSE : une réponse d'ARCHIVE qui porte la liste se lit encore", () => {
  // ⛔ LA LECTURE RESTE, ET C'EST LA MOITIÉ DU LOT. Les plans déjà écrits et
  // les réponses de la campagne portent `shopping_list` ; la refuser les
  // rendrait illisibles au banc comme au rejeu.
  const brut = {
    dishes: [{
      day: "sat",
      slot: "dinner",
      title: "Poulet et riz",
      method: "Cuire.",
      ingredients: [{
        term: "blanc de poulet",
        quantity: "900 g",
        amount: 900,
        unit: "g",
        state: "raw",
      }],
    }],
    preparations: [],
    cooking_sessions: [],
    shopping_list: [{ term: "blanc de poulet", quantity: "900 g", aisle: "protein" }],
  };
  const meal = parseGeneratedMeal(brut, {
    doctrine: null,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["sat"],
    awayDays: [],
    cookingTimeMin: null,
    composition: INDEX,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
    kitchenEquipment: null,
    cookOnlyDay: null,
    soloBoxes: false,
    standardRecipe: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
  });
  assertEquals(meal.shopping_list.length, 1);
  assertEquals(meal.shopping_list[0].term, "blanc de poulet");
  assertEquals(meal.shopping_list[0].aisle, "protein");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑬ LA TABLE DES RAYONS — FERMÉE DES DEUX CÔTÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 1 ⑬ — le rayon se dérive du GROUPE, et `null` tombe en `other` chez l'appelant", () => {
  assertEquals(aisleForFoodGroup("poultry"), "protein");
  assertEquals(aisleForFoodGroup("dairy_yogurt"), "dairy");
  assertEquals(aisleForFoodGroup("whole_grain"), "grains");
  assertEquals(aisleForFoodGroup("leafy_greens"), "produce");
  assertEquals(aisleForFoodGroup("olive_oil"), "pantry");
  // ⛔ LES CHOIX DISCUTABLES SONT DES CHOIX, et ils sont épinglés ici pour que
  // les déplacer soit un geste visible.
  assertEquals(aisleForFoodGroup("legumes"), "pantry");
  assertEquals(aisleForFoodGroup("fried_food"), "other");
  assertEquals(aisleForFoodGroup("alcohol"), "other");
  assertEquals(aisleForFoodGroup(null), null);
});
