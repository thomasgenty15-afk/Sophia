// ═══════════════════════════════════════════════════════════════════════════
// LOT C · C1 + C2 — LE CATALOGUE MONTRÉ AU MODÈLE, ET L'IDENTIFIANT QU'IL REND
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES CAS PEUVENT PROUVER, ET CE QU'ILS NE PEUVENT PAS. Aucun appel
// modèle n'a été fait (interdit du lot). Ils prouvent donc: que la sélection est
// DÉTERMINISTE, qu'elle tient sous ses plafonds, que son coût en caractères est
// mesuré et pas estimé, et que le parseur refuse un identifiant faux sans
// rapprochement de secours. Ils ne prouvent RIEN sur l'effet du bloc en
// génération — ça demandera un tir.

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
  YIELD_FACTORS,
} from "./food_composition.ts";
import {
  ANY_INDEXED_REF,
  buildCompositionCatalog,
  CATALOG_GROUP_CAPS,
  CATALOG_TOTAL_CAP,
  catalogLine,
  labelAddsToSlug,
  readRefSlug,
} from "./composition_contract.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";
import { gramsRawForIngredient, parseGeneratedMeal } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// Les fixtures
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "poultry",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 10,
    carbsG: null,
    fatG: null,
    fiberG: null,
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
  };
}

function index(
  refs: readonly CompositionRef[],
  aliases: readonly { alias: string; slug: string }[] = [],
) {
  return buildCompositionIndex([...refs], [...aliases]);
}

function catalog(
  refs: readonly CompositionRef[],
  over: Partial<Parameters<typeof buildCompositionCatalog>[0]> = {},
  aliases: readonly { alias: string; slug: string }[] = [],
) {
  return buildCompositionCatalog({
    index: index(refs, aliases),
    isComposable: ANY_INDEXED_REF,
    excludedGroups: [],
    forbidden: [],
    totalCap: CATALOG_TOTAL_CAP,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// ① LA SÉLECTION
// ---------------------------------------------------------------------------

Deno.test("⛔ LE CLASSEMENT SUIT LE NOMBRE D'ALIAS, et c'est mesuré CONTRE la longueur du slug", () => {
  // ⛔ LE PREMIER RÉFLEXE A ÉTÉ ESSAYÉ ET IL EST FAUX SUR CE RÉFÉRENTIEL.
  // « Le slug le plus court est l'aliment le plus générique » classe
  // `duck_meat` (9), `capon_meat` (10), `goose_meat` (10), `liver_duck` (10) et
  // `guinea_fowl` (11) devant `chicken_meat` (12): à un plafond de 6 sur
  // `poultry`, le catalogue de volaille sortait SANS POULET.
  //
  // Le nombre d'alias donne l'inverse, et c'est ce que la base dit vraiment:
  // `chicken_breast` porte 13 alias, `chicken_thigh` 12, `duck_meat` 8.
  const cat = catalog(
    [
      ref({ slug: "duck_meat" }),
      ref({ slug: "chicken_breast" }),
      ref({ slug: "capon_meat" }),
    ],
    {},
    [
      { alias: "blanc de poulet", slug: "chicken_breast" },
      { alias: "poulet", slug: "chicken_breast" },
      { alias: "chicken", slug: "chicken_breast" },
      { alias: "canard", slug: "duck_meat" },
    ],
  );
  assertEquals(cat.entries.map((e) => e.slug), [
    "chicken_breast",
    "duck_meat",
    "capon_meat",
  ]);
});

Deno.test("à égalité d'alias, le slug le PLUS COURT passe, puis l'alphabet", () => {
  // La règle de départage doit être totale: deux exécutions du même
  // référentiel ne peuvent pas rendre deux catalogues différents, sinon le
  // prompt n'est plus reproductible et aucune mesure n'est comparable.
  const cat = catalog([
    ref({ slug: "zzz_short" }),
    ref({ slug: "aaa_short" }),
    ref({ slug: "a_very_long_slug_here" }),
  ]);
  assertEquals(cat.entries.map((e) => e.slug), [
    "aaa_short",
    "zzz_short",
    "a_very_long_slug_here",
  ]);
});

Deno.test("les GROUPES suivent l'ordre de `FOOD_GROUP_REFS`, jamais celui de la base", () => {
  const cat = catalog([
    ref({ slug: "olive_oil", foodGroupRef: "olive_oil" }),
    ref({ slug: "chicken", foodGroupRef: "poultry" }),
    ref({ slug: "rice", foodGroupRef: "refined_grain" }),
  ]);
  const groups = cat.entries.map((e) => e.group);
  const rank = (g: FoodGroupRef) => FOOD_GROUP_REFS.indexOf(g);
  for (let i = 1; i < groups.length; i++) {
    assert(rank(groups[i - 1]) <= rank(groups[i]), `${groups} n'est pas trié`);
  }
});

Deno.test("⛔ LE PLAFOND PAR GROUPE MORD, ET CE QU'IL COUPE EST COMPTÉ", () => {
  // `red_meat` porte 290 des 943 lignes du référentiel; son plafond vaut 6.
  // Sans compteur, un plafond serré et un référentiel vide rendraient le même
  // catalogue.
  const many = Array.from({ length: 20 }, (_, i) =>
    ref({ slug: `beef_${String(i).padStart(2, "0")}`, foodGroupRef: "red_meat" }));
  const cat = catalog(many);
  assertEquals(cat.entries.length, CATALOG_GROUP_CAPS.red_meat);
  assertEquals(cat.counters.over_group_cap, 20 - CATALOG_GROUP_CAPS.red_meat);
  assertEquals(cat.counters.kept, CATALOG_GROUP_CAPS.red_meat);
});

Deno.test("⛔ LE PLAFOND TOTAL MORD AUSSI — la garde a un cas qui la fait mordre", () => {
  // ⚠️ SANS CE CAS, LA SECONDE CEINTURE NE SERAIT JAMAIS EXERCÉE: la somme des
  // plafonds par groupe (122) est SOUS le plafond total (140), donc le nominal
  // ne l'atteint pas. « Une garde a besoin d'un cas qui passe » vaut aussi dans
  // l'autre sens: une garde qui ne mord jamais ressemble à une garde qui marche.
  const refs = [
    ...Array.from({ length: 8 }, (_, i) => ref({ slug: `g_${i}`, foodGroupRef: "whole_grain" })),
    ...Array.from({ length: 8 }, (_, i) => ref({ slug: `r_${i}`, foodGroupRef: "refined_grain" })),
  ];
  const cat = catalog(refs, { totalCap: 10 });
  assertEquals(cat.entries.length, 10);
  assertEquals(cat.counters.over_total_cap, 6);
});

Deno.test("⛔ UN GROUPE À ZÉRO NE SORT JAMAIS, et il est compté à part d'une exclusion", () => {
  // « Personne ne mange de sucreries ici » et « ce foyer a exclu le lait » ne
  // sont pas le même fait et n'appellent pas la même correction.
  const cat = catalog([
    ref({ slug: "candy", foodGroupRef: "sugar_sweets" }),
    ref({ slug: "beer", foodGroupRef: "alcohol" }),
    ref({ slug: "milk", foodGroupRef: "dairy_yogurt" }),
  ], { excludedGroups: ["dairy_yogurt"] });
  assertEquals(cat.entries.length, 0);
  assertEquals(cat.counters.group_never_composed, 2);
  assertEquals(cat.counters.group_excluded, 1);
});

Deno.test("⛔ UN INTERDIT ALIMENTAIRE RETIRE LA LIGNE — par LE matcher du dépôt, pas par `includes`", () => {
  // ⛔ « Jamais de matcher maison »: « laitue » contient « lait », et un
  // `includes` naïf a rendu 12 faux positifs sur 12 mesurés. Ce cas-ci est la
  // contre-épreuve: l'arachide part, la laitue reste.
  const cat = catalog([
    ref({ slug: "peanuts", foodGroupRef: "nuts_seeds", label: "Peanuts" }),
    ref({ slug: "lettuce", foodGroupRef: "leafy_greens", label: "Laitue" }),
    ref({ slug: "milk_semi", foodGroupRef: "dairy_yogurt", label: "Lait demi-écrémé" }),
  ], {
    forbidden: [
      { ruleId: "c1", token: "peanut", surfaceForms: ["arachide", "cacahuete"] },
      { ruleId: "c2", token: "lait", surfaceForms: [] },
    ],
  });
  assertEquals(cat.entries.map((e) => e.slug), ["lettuce"]);
  assertEquals(cat.counters.term_excluded, 2);
});

Deno.test("⛔ `isComposable` EST LA PORTE, ET ELLE EST INJECTÉE", () => {
  // Le lot A rendra ce prédicat depuis `food_reference_manifest.ts`. Ce module
  // n'en connaît que la signature — c'est ce qui a permis d'écrire les deux en
  // parallèle, et c'est ce qui rend ce cas testable sans référentiel.
  const cat = catalog([
    ref({ slug: "chicken_breast" }),
    ref({ slug: "mystery_meat", source: "sas" }),
  ], { isComposable: (r) => r.source !== "sas" });
  assertEquals(cat.entries.map((e) => e.slug), ["chicken_breast"]);
  assertEquals(cat.counters.not_composable, 1);
});

// ---------------------------------------------------------------------------
// ② CE QU'UNE LIGNE ÉCRIT
// ---------------------------------------------------------------------------

Deno.test("une ligne porte l'id, les kcal, les protéines, et rien d'inutile", () => {
  assertEquals(
    catalogLine({
      slug: "chicken_breast",
      group: "poultry",
      label: null,
      kcalPer100G: 110,
      proteinG: 23.1,
      cookedYield: 0.7,
      unitGrams: null,
      condimentGrams: null,
    }),
    "chicken_breast 110 23.1 x0.7",
  );
});

Deno.test("⛔ UNE VALEUR ABSENTE S'ÉCRIT `-`, JAMAIS 0", () => {
  // La cicatrice n°1 du dépôt. Un `0` de protéines sur une ligne dont la table
  // ne donne pas la valeur ferait calculer le modèle contre un fait faux.
  const line = catalogLine({
    slug: "stock",
    group: "sauce_dressing",
    label: null,
    kcalPer100G: 12,
    proteinG: null,
    cookedYield: null,
    unitGrams: null,
    condimentGrams: 5,
  });
  assertEquals(line, "stock 12 - pinch=5");
  assert(!line.includes(" 0 "), "un zéro inventé");
});

Deno.test("le RENDEMENT à 1 ne s'écrit pas: il n'y a rien à convertir", () => {
  const line = catalogLine({
    slug: "olive_oil",
    group: "olive_oil",
    label: null,
    kcalPer100G: 900,
    proteinG: 0,
    cookedYield: null,
    unitGrams: null,
    condimentGrams: null,
  });
  assertEquals(line, "olive_oil 900 0");
});

Deno.test("le rendement écrit est celui de la FICHE quand elle en porte un, sinon celui de la CLASSE", () => {
  // Même ordre que `yieldFactorOf`: deux lectures de ce rendement
  // divergeraient, et c'est celle qu'on relit le moins qui garderait l'ancienne.
  const cat = catalog([
    ref({ slug: "rice_a", foodGroupRef: "refined_grain", yieldClass: "grain_absorbs" }),
    ref({
      slug: "rice_b",
      foodGroupRef: "refined_grain",
      yieldClass: "grain_absorbs",
      yieldFactor: 2.2,
    }),
  ]);
  const byId = new Map(cat.entries.map((e) => [e.slug, e]));
  assertEquals(byId.get("rice_a")!.cookedYield, YIELD_FACTORS.grain_absorbs);
  assertEquals(byId.get("rice_b")!.cookedYield, 2.2);
});

Deno.test("⛔ LE LIBELLÉ NE SORT QUE QUAND IL DIT AUTRE CHOSE QUE L'IDENTIFIANT", () => {
  // Mesuré sur les 943 lignes: 304 libellés sont exactement la mise en mots du
  // slug, 200 de plus n'ajoutent que « raw », 13 « prepacked », 8 « average ».
  // Les écrire coûterait ~45 caractères la ligne pour zéro information.
  assertEquals(labelAddsToSlug("chicken_breast", "Chicken breast, raw"), false);
  assertEquals(labelAddsToSlug("cheesecake", "Cheesecake, prepacked"), false);
  assertEquals(labelAddsToSlug("custard_dessert", "Custard dessert, canned (average)"), true);
  // ⛔ ET LE CAS QUI FAIT TOUT LE CHANTIER: le frais et le sec.
  assertEquals(labelAddsToSlug("plum", "Plum, dried"), true);
  assertEquals(labelAddsToSlug("chickpeas_tinned", "Chickpeas, canned, drained"), true);
});

Deno.test("le coût du bloc est MESURÉ, pas estimé", () => {
  // ⛔ LE BUDGET EST LA CONTRAINTE DURE DE CE LOT. Un budget qu'on
  // n'instrumente pas est un budget qu'on dépasse sans le savoir: `chars` doit
  // porter EXACTEMENT le texte servi, pas une approximation calculée à côté.
  const cat = catalog([
    ref({ slug: "chicken_breast" }),
    ref({ slug: "rice", foodGroupRef: "refined_grain" }),
  ]);
  assertEquals(cat.counters.chars, cat.lines.join("\n").length);
  assert(cat.counters.chars > 0);
});

Deno.test("un catalogue VIDE ne rend aucune ligne — pas un en-tête tout seul", () => {
  // Un bloc qui promet une liste et n'en donne pas est pire qu'un bloc absent:
  // il fait croire au modèle qu'il a lu des identifiants.
  const cat = catalog([]);
  assertEquals(cat.lines.length, 0);
  assertEquals(cat.counters.chars, 0);
});

Deno.test("le bloc DIT que la liste ne limite pas la cuisine", () => {
  // ⛔ SANS CETTE PHRASE, UN MODÈLE BORNÉ À 121 ALIMENTS ÉCRIRAIT SEPT JOURS DE
  // RIZ ET DE POULET. Le plafond est une contrainte de BUDGET, jamais une règle
  // alimentaire; le confondre ferait du catalogue un garde-manger.
  const bloc = catalog([ref({ slug: "chicken_breast" })]).lines.join("\n");
  assert(bloc.includes("does NOT limit what you may cook"));
  assert(bloc.includes('leave "ref" out'));
  // Et la clé de schéma est DANS le bloc qui porte la liste: la promesse et la
  // clé doivent se toucher (0 % de conformité mesuré quand elles sont séparées).
  assert(bloc.includes('add "ref"'));
});

// ---------------------------------------------------------------------------
// ③ LA LECTURE D'UN `ref` — C2
// ---------------------------------------------------------------------------

Deno.test("⛔ UN IDENTIFIANT SE COMPARE CARACTÈRE POUR CARACTÈRE — aucun alias, aucune tolérance", () => {
  // ⛔ C'EST LA DIFFÉRENCE AVEC `resolveIngredient`, ET ELLE EST TOUT LE LOT.
  // Le résolveur de TERME essaie le slug direct avant les alias: le mot
  // français « prune » y rencontre l'identifiant anglais `prune` (fruit sec,
  // 229 kcal/100 g) sans qu'aucune erreur ne puisse apparaître. Un identifiant,
  // lui, a été LU dans une liste.
  const idx = index([ref({ slug: "chicken_breast" })], [
    { alias: "poulet", slug: "chicken_breast" },
  ]);
  assertEquals(readRefSlug("chicken_breast", idx, ANY_INDEXED_REF), {
    slug: "chicken_breast",
    outcome: "accepted",
  });
  // Un ALIAS n'est pas un identifiant, même s'il résout comme terme libre.
  assertEquals(readRefSlug("poulet", idx, ANY_INDEXED_REF), {
    slug: null,
    outcome: "unknown",
  });
  // Ni une casse différente, ni un pluriel.
  assertEquals(readRefSlug("Chicken_Breast", idx, ANY_INDEXED_REF).outcome, "unknown");
  assertEquals(readRefSlug("chicken_breasts", idx, ANY_INDEXED_REF).outcome, "unknown");
});

Deno.test("un identifiant ABSENT n'est pas un identifiant FAUX", () => {
  const idx = index([ref({ slug: "chicken_breast" })]);
  assertEquals(readRefSlug(undefined, idx, ANY_INDEXED_REF).outcome, "absent");
  assertEquals(readRefSlug("", idx, ANY_INDEXED_REF).outcome, "absent");
  assertEquals(readRefSlug("   ", idx, ANY_INDEXED_REF).outcome, "absent");
  assertEquals(readRefSlug(42, idx, ANY_INDEXED_REF).outcome, "absent");
});

Deno.test("une référence NON COMPOSABLE est refusée, et comptée séparément", () => {
  const idx = index([ref({ slug: "mystery", source: "sas" })]);
  assertEquals(readRefSlug("mystery", idx, (r) => r.source !== "sas"), {
    slug: null,
    outcome: "not_composable",
  });
});

Deno.test("⚠️ SANS RÉFÉRENTIEL, ON NE SAIT RIEN — et « je ne sais pas » n'est pas « c'est faux »", () => {
  // Le référentiel indisponible est un fail-open déjà assumé par le parseur
  // (`composition: null`). Refuser ici ferait payer au dîner d'un élève une
  // lecture de base en panne.
  assertEquals(readRefSlug("chicken_breast", null, ANY_INDEXED_REF).outcome, "absent");
});

// ---------------------------------------------------------------------------
// ④ CE QUE LE PARSEUR EN FAIT — C2, de bout en bout
// ---------------------------------------------------------------------------

const PARSE_INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken_breast", energyKcal: 110, yieldClass: "meat_shrinks" }),
    ref({ slug: "grapes", foodGroupRef: "other_fruit", energyKcal: 68.9 }),
    ref({ slug: "raisin", foodGroupRef: "other_fruit", energyKcal: 321 }),
    ref({ slug: "model_guess", foodGroupRef: "other_fruit", source: "sas", energyKcal: 50 }),
  ],
  [{ alias: "raisin frais", slug: "grapes" }],
);

function parse(ingredient: Record<string, unknown>, composable?: (r: CompositionRef) => boolean) {
  return parseGeneratedMeal(
    {
      dishes: [{
        title: "Salade",
        slot: "lunch",
        day: "mon",
        method: "Mélanger.",
        ingredients: [ingredient],
      }],
    },
    {
      doctrine: null,
      safetyConstraints: null,
      mode: "to_shop",
      scope: "several_days",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      soloBoxes: true,
      standardRecipe: true,
      cookOnlyDay: null,
      daysToFill: ["mon"],
      awayDays: [],
      cookingTimeMin: null,
      kitchenEquipment: null,
      composition: PARSE_INDEX,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
      boxMemberIds: [],
      weighedMemberIds: [],
      boxMemberDiets: [],
      boxMemberExclusions: [],
      ...(composable ? { composable } : {}),
    },
  );
}

Deno.test("⛔ UN IDENTIFIANT VALIDE GAGNE SUR LE TERME — c'est le défaut mesuré qui se ferme", () => {
  // Contrefactuel de l'enquête du 2026-09-11, à quantités inchangées: le
  // petit-déjeuner PERTE du samedi passe de 614 kcal à 388 quand « raisin »
  // désigne le fruit FRAIS et non le fruit SEC. Ici, le terme dit « raisin »
  // (que `resolveIngredient` envoie sur le slug anglais du fruit sec) et
  // l'identifiant dit `grapes`. C'est l'identifiant qui pèse.
  const out = parse({
    term: "raisin",
    ref: "grapes",
    quantity: "100 g",
    amount: 100,
    unit: "g",
    state: "raw",
  });
  const ing = out.dishes[0].ingredients[0];
  assertEquals(ing.ref, "grapes");
  assertEquals(ing.refRefused, false);
  assertEquals(ing.gramsRaw, 100);
  // ⚠️ LA CONTRE-ÉPREUVE, sur le MÊME terme sans identifiant: le chemin par
  // terme libre atteint bien le fruit sec. Sans elle, on ne saurait pas si
  // l'identifiant a changé quelque chose.
  const sans = parse({
    term: "raisin",
    quantity: "100 g",
    amount: 100,
    unit: "g",
    state: "raw",
  });
  assertEquals(sans.dishes[0].ingredients[0].ref, null);
  assert(
    sans.issues.some((i) => i.startsWith("ref_absent: 1/1")),
    `l'absence n'est pas comptée: ${JSON.stringify(sans.issues)}`,
  );
});

Deno.test("⛔ UN IDENTIFIANT INVENTÉ EST REFUSÉ, ET NE RETOMBE PAS SUR LE TERME", () => {
  // ⛔ « Sans rapprochement approximatif de secours » est la demande explicite
  // du chantier. Le terme « chicken_breast » se résoudrait parfaitement; on
  // refuse quand même, parce qu'un modèle qui écrit un identifiant AFFIRME
  // savoir de quel aliment il parle. On s'abstient, et on compte.
  const out = parse({
    term: "chicken_breast",
    ref: "poulet_roti_maison",
    quantity: "100 g",
    amount: 100,
    unit: "g",
    state: "raw",
  });
  const ing = out.dishes[0].ingredients[0];
  assertEquals(ing.ref, null);
  assertEquals(ing.refRefused, true);
  assertEquals(ing.gramsRaw, null, "un identifiant faux ne doit rien peser");
  // L'ingrédient SURVIT: le refus porte sur la pesée, jamais sur l'assiette.
  assertEquals(ing.term, "chicken_breast");
  assert(
    out.issues.some((i) => i.includes("ref_refused: 1 unknown, 0 not_composable")),
    `le refus n'est pas nommé: ${JSON.stringify(out.issues)}`,
  );
});

Deno.test("une référence non composable est refusée elle aussi, et distinguée", () => {
  const out = parse(
    {
      term: "fruit",
      ref: "model_guess",
      quantity: "100 g",
      amount: 100,
      unit: "g",
      state: "raw",
    },
    (r) => r.source !== "sas",
  );
  const ing = out.dishes[0].ingredients[0];
  assertEquals(ing.ref, null);
  assertEquals(ing.refRefused, true);
  assertEquals(ing.gramsRaw, null);
  assert(
    out.issues.some((i) => i.includes("0 unknown, 1 not_composable")),
    `les deux causes ne sont pas séparées: ${JSON.stringify(out.issues)}`,
  );
});

Deno.test("⛔ LA PORTE PAR DÉFAUT EST CELLE DU LOT A, ET ELLE EST FERMÉE", () => {
  // ⛔ `composable` est OPTIONNEL, et son défaut est la RÈGLE, pas son absence.
  // C'est ce qui évite ici la cicatrice « paramètre optionnel = garde
  // désarmée »: un appelant qui l'oublie obtient `isComposable`, donc le refus.
  // `model_guess` porte `source: "sas"` — une estimation modèle promue après
  // trois observations, que le chantier refuse explicitement à la composition.
  const out = parse({
    term: "fruit",
    ref: "model_guess",
    quantity: "100 g",
    amount: 100,
    unit: "g",
    state: "raw",
  });
  assertEquals(out.dishes[0].ingredients[0].ref, null);
  assertEquals(out.dishes[0].ingredients[0].refRefused, true);
  assert(
    out.issues.some((i) => i.includes("0 unknown, 1 not_composable")),
    `la porte par défaut laisse passer une estimation modèle: ${JSON.stringify(out.issues)}`,
  );
  // ⚠️ ET LA CONTRE-ÉPREUVE, qui est l'arbitrage ② du socle: la porte est à la
  // COMPOSITION, pas à la MESURE. `ANY_INDEXED_REF` l'ouvre sciemment, pour
  // rejouer un plan historique — et il porte son nom pour qu'on voie ce qu'il
  // désarme.
  const mesure = parse({
    term: "fruit",
    ref: "model_guess",
    quantity: "100 g",
    amount: 100,
    unit: "g",
    state: "raw",
  }, ANY_INDEXED_REF);
  assertEquals(mesure.dishes[0].ingredients[0].ref, "model_guess");
});

Deno.test("l'identifiant est lu sur les PRÉPARATIONS aussi — c'est là que vit la masse", () => {
  // Une casserole porte l'essentiel de la masse et de l'énergie d'une assiette
  // (`preparationReadyGrams`). N'exiger l'identifiant que sur les plats
  // laisserait le gros du calcul au terme libre.
  const out = parseGeneratedMeal(
    {
      dishes: [{
        title: "Bol",
        slot: "lunch",
        day: "mon",
        method: "Réchauffer.",
        ingredients: [],
        uses: [{ preparation_id: "prep_poulet", servings: 1 }],
      }],
      preparations: [{
        id: "prep_poulet",
        title: "Poulet rôti",
        servings_made: 4,
        method: "Rôtir.",
        ingredients: [
          { term: "raisin", ref: "grapes", quantity: "400 g", amount: 400, unit: "g", state: "raw" },
          { term: "poulet", ref: "inventé", quantity: "400 g", amount: 400, unit: "g", state: "raw" },
        ],
      }],
    },
    {
      doctrine: null,
      safetyConstraints: null,
      mode: "to_shop",
      scope: "several_days",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      soloBoxes: true,
      standardRecipe: true,
      cookOnlyDay: null,
      daysToFill: ["mon"],
      awayDays: [],
      cookingTimeMin: null,
      kitchenEquipment: null,
      composition: PARSE_INDEX,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
      boxMemberIds: [],
      weighedMemberIds: [],
      boxMemberDiets: [],
      boxMemberExclusions: [],
    },
  );
  const prep = out.preparations[0];
  assertEquals(prep.ingredients[0].ref, "grapes");
  assertEquals(prep.ingredients[0].gramsRaw, 400);
  assertEquals(prep.ingredients[1].ref, null);
  assertEquals(prep.ingredients[1].refRefused, true);
  assertEquals(prep.ingredients[1].gramsRaw, null);
});

// ---------------------------------------------------------------------------
// ⑤ LE CHEMIN DE REPLI DES PLANS DÉJÀ ÉCRITS
// ---------------------------------------------------------------------------

Deno.test("⛔ UN PLAN ÉCRIT AVANT CE LOT SE PÈSE ENCORE — la clé absente n'est pas une clé fausse", () => {
  // ⛔ C'EST LE CHEMIN DE REPLI, ET IL EST EXPLICITE. `dishes[].ingredients[]`
  // est du `jsonb`: les plans écrits avant ce lot n'ont simplement pas la clé
  // `ref`, donc `undefined`. Un test strict (`ing.ref !== null`) la lisait comme
  // « un identifiant est présent », cherchait `undefined` dans l'index et
  // rendait `null` — c'est-à-dire qu'il cessait de peser TOUT l'historique.
  // Mesuré pendant l'écriture du lot: quatre tests de repesée et quatre tests
  // d'énergie de casserole sont passés au rouge d'un coup.
  //
  // ⚠️ AUCUNE MIGRATION N'EST NÉCESSAIRE, et c'est la conséquence de cette
  // règle: une ligne sans `ref` se pèse par son TERME, exactement comme avant.
  const ancien = {
    term: "chicken_breast",
    quantity: "100 g",
    amount: 100,
    unit: "g" as const,
    state: "raw" as const,
    gramsRaw: null,
    in_pantry: false,
    group: null,
    quantitySource: null,
    part: null,
    // ⛔ PAS DE `ref` DU TOUT — c'est la forme exacte d'une ligne en base.
  };
  assertEquals(
    gramsRawForIngredient(PARSE_INDEX, ancien as unknown as Parameters<typeof gramsRawForIngredient>[1]),
    100,
  );
  // Et la contre-épreuve: la MÊME ligne avec un identifiant faux ne pèse rien.
  assertEquals(
    gramsRawForIngredient(PARSE_INDEX, {
      ...ancien,
      ref: null,
      refRefused: true,
    }),
    null,
  );
});
