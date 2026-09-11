/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT A — UNE IDENTITÉ ALIMENTAIRE JUSQU'AU DERNIER LECTEUR (2026-09-11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, lot A.
 * Preuves   : `docs/keel/REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md` § 3 et
 *             `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-MESURE-2026-09-11.md`.
 *
 * ── LE DÉFAUT QUE CES ÉPREUVES GARDENT, ET IL EST CHIFFRÉ ─────────────────
 * Le modèle a écrit un identifiant sur 100 % des lignes des deux plans de la
 * campagne (41/47 en frais côté PERTE, 49/49 côté GAIN), et AUCUN n'a été
 * refusé. Le parseur pesait bien : `pita_wholemeal` porte `unit_grams = 60`, et
 * `grams_raw` valait 60 sur les deux plans. Mais tout ce qui MESURE une portion
 * repartait du libellé français, et « pita complète » n'a aucun alias (la table
 * porte « pita complet » et « pitas completes »). Résultat enregistré :
 *
 *   PERTE sam./déjeuner  →  plat présent, AUCUNE boîte, aucune portion
 *   GAIN  ven./dîner     →  plat présent, AUCUNE boîte, aucune portion
 *   GAIN  sam./petit-déj →  boîte de 523 g, énergie ILLISIBLE (dish_incomplete)
 *
 * Sonde hors ligne sur ces fixtures figées, quantités inchangées, la SEULE
 * différence étant la présence du champ `ref` que le modèle avait déjà écrit :
 *
 *   PERTE sam./déjeuner  unknown_ingredient  →  668 kcal · 444 g · 150,5/100 g
 *   GAIN  ven./dîner     unknown_ingredient  →  995 kcal · 375 g · 265,6/100 g
 *   GAIN  sam./petit-déj dish_incomplete     →  546,00 kcal
 *   témoin PERTE dim./dîner : 895 kcal · 379 g des DEUX côtés — rien ne bouge.
 *
 * Les +60 g de masse prête des deux premières cases sont exactement le poids
 * d'unité de `pita_wholemeal`.
 *
 * ⛔ CHAQUE ÉPREUVE PORTE UN CAS QUI PASSE **ET** UN CAS QUI MORD. Ce dépôt a
 * une cicatrice nommée : une garde qui ne mord jamais ressemble trait pour trait
 * à une garde qui marche.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
  refTermConflict,
  resolveCompositionLine,
  resolveIngredient,
  resolveIngredients,
} from "./food_composition.ts";
import { dishEnergy } from "./plan_energy.ts";
import { readIngredients, readPreparations } from "./plan_energy_read.ts";
import { measureFresh, measurePreparation } from "./preparation_mass.ts";
import { fillRequestsFor } from "./composition_fill.ts";
import { adjustPlanProportions, unitsOfPlan } from "./plan_proportion_units.ts";
import { readRefSlug } from "./composition_contract.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — les lignes réelles des deux plans, réduites à ce qui se mesure
// ---------------------------------------------------------------------------

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

/**
 * ⚠️ LES VALEURS SONT CELLES DE LA BASE LOCALE DU 2026-09-11, relevées par
 * `select slug, source, energy_kcal, unit_grams from food_composition_refs`.
 * Un décor qui inventerait `unit_grams` ne prouverait rien du cas mesuré.
 */
const REFS: CompositionRef[] = [
  ref({
    slug: "pita_wholemeal",
    label: "Wholemeal pita bread",
    source: "manual",
    foodGroupRef: "whole_grain",
    energyKcal: 265,
    proteinG: 9,
    unitGrams: 60,
  }),
  ref({
    slug: "pita_bread",
    label: "Pita bread",
    source: "manual",
    foodGroupRef: "refined_grain",
    energyKcal: 275,
    unitGrams: 60,
  }),
  ref({
    slug: "petit_suisse_cream_cheese",
    label: "Petit-Suisse, fresh cream cheese type, plain, around 4% fat",
    foodGroupRef: "dairy_cheese",
    energyKcal: 88.8,
    proteinG: 9.4,
  }),
  // ⛔ LA LIGNE QUE LE SAS A FABRIQUÉE CE JOUR-LÀ, à 258 kcal, `fill_source:
  // model` ⇒ `a_verifier` ⇒ NON composable. `pita_wholemeal` existait déjà,
  // vérifiée, à 265. On a payé un appel modèle pour ré-estimer une valeur qu'on
  // avait, et le résultat était moins bon.
  ref({
    slug: "whole_wheat_pita_bread",
    label: "whole wheat pita bread",
    source: "model",
    foodGroupRef: "whole_grain",
    energyKcal: 258,
  }),
  // Les deux faux amis mesurés le 2026-09-11 : le mot français `raisin` EST le
  // slug anglais du raisin SEC, et `prune` celui du pruneau.
  ref({ slug: "raisin", label: "Raisins, dried", foodGroupRef: "other_fruit", energyKcal: 321 }),
  ref({ slug: "grapes", label: "Grapes, fresh", foodGroupRef: "other_fruit", energyKcal: 68.9 }),
  ref({ slug: "prune", label: "Prunes, dried", foodGroupRef: "other_fruit", energyKcal: 229 }),
  ref({ slug: "plum", label: "Plum, fresh", foodGroupRef: "other_fruit", energyKcal: 46 }),
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    proteinG: 7,
    yieldClass: "grain_absorbs",
  }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, fatG: 100, energyDense: true }),
  ref({ slug: "tahini", foodGroupRef: "nuts_seeds", energyKcal: 595, proteinG: 17, energyDense: true }),
  ref({ slug: "tomato", energyKcal: 18 }),
  ref({ slug: "lamb_leg", foodGroupRef: "red_meat", energyKcal: 180, proteinG: 20, yieldClass: "meat_shrinks" }),
  ref({ slug: "salt", foodGroupRef: "sauce_dressing", energyKcal: 0, proteinG: 0, condimentGrams: 0.5 }),
];

/**
 * ⚠️ LA TABLE D'ALIAS EST CELLE DE LA BASE : « pita complet » (masculin) et
 * « pitas completes » (pluriel) existent, « pita complete » NON. C'est cette
 * absence-là qui a coûté deux repas, et l'enlever du décor rendrait le cas
 * mesuré introuvable.
 */
const INDEX: CompositionIndex = buildCompositionIndex(
  REFS,
  [
    { alias: "pita complet", slug: "pita_bread" },
    { alias: "pitas completes", slug: "pita_wholemeal" },
    { alias: "riz", slug: "white_rice" },
    { alias: "huile d'olive", slug: "olive_oil" },
    { alias: "tomate", slug: "tomato" },
    { alias: "sel", slug: "salt" },
    { alias: "tahini", slug: "tahini" },
    { alias: "agneau", slug: "lamb_leg" },
  ],
  // Les faux amis posés en base pour la langue française.
  [{ alias: "raisin", slug: "grapes" }, { alias: "prune", slug: "plum" }],
);

/** La ligne GAIN ven./dîner, telle que `plans.json` la porte. */
const PITA_UNIT = {
  term: "pita complète",
  ref: "pita_wholemeal",
  refRefused: false,
  amount: 1,
  unit: "unit" as const,
  state: "raw" as const,
  quantity: "1 pita complète",
};

/** La ligne PERTE sam./déjeuner, telle que `plans.json` la porte. */
const PITA_GRAMS = {
  term: "pita complète",
  ref: "pita_wholemeal",
  refRefused: false,
  amount: 60,
  unit: "g" as const,
  state: "raw" as const,
  quantity: "60 g de pita complète",
};

/** La ligne GAIN sam./petit-déjeuner, telle que `plans.json` la porte. */
const PETIT_SUISSE = {
  term: "petits-suisses nature",
  ref: "petit_suisse_cream_cheese",
  refRefused: false,
  amount: 258.15602836879435,
  unit: "g" as const,
  state: "raw" as const,
  quantity: "200 g de petits-suisses nature",
};

const sansRef = <T extends { ref: string | null }>(l: T) => ({ ...l, ref: null });

// ═══════════════════════════════════════════════════════════════════════════
// ① LES DEUX PITAS DEVIENNENT MESURABLES, ET `1 unit` VAUT 60 g
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① LE CAS QUI PASSE — `1 unit` de pita complète pèse les 60 g de sa fiche vérifiée", () => {
  const r = resolveIngredients(INDEX, [PITA_UNIT]);
  assertEquals(r.unresolvedTerms, []);
  assertEquals(r.unweighedTerms, []);
  assertEquals(r.refusedTerms, []);
  assertEquals(r.resolved.length, 1);
  assertEquals(r.resolved[0].ref.slug, "pita_wholemeal");
  // ⛔ LE NOMBRE, ET PAS SEULEMENT « ça résout ». 60 g est `unit_grams` de la
  // fiche; un `1 unit` sans poids d'unité resterait NON PESÉ, ce qui est le
  // défaut d'origine — la ligne tombait alors sur le sas, dont la vue
  // `food_composition_pending_by_form` n'a même pas de colonne `unit_grams`.
  assertEquals(r.resolved[0].gramsRaw, 60);
});

Deno.test("① LE CAS QUI MORD — sans identifiant, « pita complète » n'est toujours pas pesée", () => {
  // ⚠️ C'EST L'ÉTAT D'AVANT LE LOT, conservé exprès. La table d'alias n'a pas
  // changé: « pita complete » n'y est toujours pas, et le lot ne l'y met pas.
  // Si cette épreuve devenait verte, quelqu'un aurait fermé le cas par un alias
  // — ce que la revue interdit en toutes lettres: « ajouter seulement un alias
  // pour "pita complète" laisserait le défaut structurel intact ».
  assertEquals(resolveIngredient(INDEX, "pita complète"), null);
  const r = resolveIngredients(INDEX, [sansRef(PITA_UNIT)]);
  assertEquals(r.resolved, []);
  assertEquals(r.unresolvedTerms, ["pita complete"]);
});

Deno.test("① le plat entier passe de `unknown_ingredient` à une énergie, par le seul `ref`", () => {
  // Le plat GAIN ven./dîner, réduit à ce qui se mesure.
  const plat = {
    method: "Réchauffe et assemble.",
    ingredients: [
      PITA_UNIT,
      { term: "agneau", ref: "lamb_leg", refRefused: false, amount: 150, unit: "g" as const, state: "raw" as const },
      { term: "tahini", ref: "tahini", refRefused: false, amount: 40, unit: "g" as const, state: "raw" as const },
      { term: "tomate", ref: "tomato", refRefused: false, amount: 80, unit: "g" as const, state: "raw" as const },
    ],
  };
  const avec = dishEnergy(INDEX, plat);
  assertEquals(avec.complete, true);
  assert(avec.kcal !== null && avec.kcal > 0);

  const sans = dishEnergy(INDEX, {
    ...plat,
    ingredients: plat.ingredients.map(sansRef),
  });
  assertEquals(sans.complete, false);
  assertEquals(sans.gaps, ["unknown_ingredient"]);
  assertEquals(sans.kcal, null);
  // ⛔ ET L'ÉCART EST EXACTEMENT LA PITA: 60 g × 265 kcal/100 g = 159 kcal.
  assertAlmostEquals(avec.kcal!, 159 + 270 + 238 + 14.4, 1.5);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE PETIT-SUISSE — MÊME RÉFÉRENCE À LA MESURE, À L'AJUSTEMENT, À LA RELECTURE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② le petit-suisse emploie la même référence aux trois étapes", () => {
  // ⚠️ 258,156 g × 88,8 kcal/100 g = 229,24 kcal. C'est la ligne seule; les
  // 546 kcal du rapport sont la BOÎTE entière (avoine, fraises, noix compris).
  const mesure = resolveIngredients(INDEX, [PETIT_SUISSE]);
  assertEquals(mesure.resolved[0].ref.slug, "petit_suisse_cream_cheese");
  assertAlmostEquals(mesure.resolved[0].gramsRaw, 258.156, 0.001);

  // ① la mesure d'un plat frais (`measureFresh` → `boxNutritionByItems`)
  const frais = measureFresh(INDEX, { method: "", ingredients: [PETIT_SUISSE] });
  assertAlmostEquals(frais.kcal!, 229.24, 0.5);

  // ② l'ajusteur: la ligne ne doit pas être verrouillée `unresolved`
  const built = unitsOfPlan({
    index: INDEX,
    dishes: [{ method: "", ingredients: [{ ...PETIT_SUISSE, gramsRaw: 258.156, group: null }] }],
    preparations: [],
    baselineOf: () => null,
  });
  assertEquals(built.counts.lines_locked.unresolved, 0);
  assertEquals(built.units[0].ingredients[0].fixed, false);
  assertEquals(built.units[0].ingredients[0].group, "dairy_cheese");

  // ③ la relecture depuis le JSON du plan (clés snake_case)
  const relu = readIngredients([{
    term: PETIT_SUISSE.term,
    ref: PETIT_SUISSE.ref,
    amount: PETIT_SUISSE.amount,
    unit: "g",
    state: "raw",
    quantity: PETIT_SUISSE.quantity,
  }]);
  assertEquals(relu[0].ref, "petit_suisse_cream_cheese");
  assertEquals(resolveIngredients(INDEX, relu).resolved[0].ref.slug, "petit_suisse_cream_cheese");
});

Deno.test("② LE CAS QUI MORD — sans son identifiant, la même ligne éteint la boîte", () => {
  const sans = measureFresh(INDEX, { method: "", ingredients: [sansRef(PETIT_SUISSE)] });
  assertEquals(sans.kcal, null);
  const built = unitsOfPlan({
    index: INDEX,
    dishes: [{
      method: "",
      ingredients: [{ ...PETIT_SUISSE, ref: null, gramsRaw: 258.156, group: null }],
    }],
    preparations: [],
    baselineOf: () => null,
  });
  assertEquals(built.counts.lines_locked.unresolved, 1);
  assertEquals(built.units[0].ingredients[0].fixed, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ IDENTIFIANT VALIDE + LIBELLÉ INCONNU / PLURIEL / ACCENTUÉ ⇒ MÊME RÉFÉRENCE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ un identifiant valide gagne, quel que soit le libellé écrit à côté", () => {
  const libelles = [
    "pita complète", // accentué, sans alias
    "pitas complètes", // pluriel accentué
    "PITA COMPLÈTE", // casse
    "galette libanaise que personne n'a jamais indexée", // inconnu
    "pita complet", // ⚠️ alias EXISTANT, et il pointe sur `pita_bread` (275 kcal)
  ];
  for (const term of libelles) {
    const r = resolveCompositionLine(INDEX, { term, ref: "pita_wholemeal", refRefused: false });
    assertEquals(r.ref?.slug, "pita_wholemeal", `libellé « ${term} »`);
    assertEquals(r.source, "ref");
  }
  // ⛔ LA DERNIÈRE LIGNE EST LE CŒUR DU LOT: « pita complet » A un alias, et il
  // mène à `pita_bread` (275 kcal, raffiné). L'identifiant le supplante — sans
  // quoi le libellé pourrait contredire l'identité déclarée en silence.
  assertEquals(resolveIngredient(INDEX, "pita complet")?.slug, "pita_bread");
});

Deno.test("③ LE CAS QUI MORD — identifiant invalide + libellé CONNU ⇒ refus explicite", () => {
  // Le libellé « riz » a un alias parfaitement valide.
  assertEquals(resolveIngredient(INDEX, "riz")?.slug, "white_rice");
  const r = resolveCompositionLine(INDEX, {
    term: "riz",
    ref: "riz_basmati_invente",
    refRefused: false,
  });
  // ⛔ AUCUN SECOURS PAR ALIAS. « Sans rapprochement approximatif de secours »
  // est la demande explicite du chantier: un modèle qui écrit un identifiant a
  // AFFIRMÉ savoir de quel aliment il parle.
  assertEquals(r.ref, null);
  assertEquals(r.refusal, "ref_unknown");
  const res = resolveIngredients(INDEX, [{
    term: "riz",
    ref: "riz_basmati_invente",
    amount: 80,
    unit: "g",
    state: "raw",
  }]);
  assertEquals(res.resolved, []);
  assertEquals(res.refusedTerms, ["riz"]);
  assertEquals(res.refusedBy, ["ref_unknown"]);
  // ⛔ ET UNE LIGNE REFUSÉE N'EST PAS « CONNUE »: la porte des 80 % doit la voir.
  assertEquals(res.coverage, 0);
  // ⛔ NI BORNÉE PAR SON GROUPE. Le plat s'éteint, avec son propre motif.
  const e = dishEnergy(INDEX, {
    method: "",
    ingredients: [
      { term: "riz", ref: "riz_basmati_invente", amount: 80, unit: "g", state: "raw" },
      { term: "tomate", ref: "tomato", amount: 500, unit: "g", state: "raw" },
    ],
  });
  assertEquals(e.complete, false);
  assertEquals(e.gaps, ["ref_refused"]);
});

Deno.test("③ un refus du PARSEUR survit, et ne retombe jamais sur le terme", () => {
  // `refRefused: true` avec un `ref` nul — la forme exacte que le parseur écrit.
  const r = resolveCompositionLine(INDEX, { term: "riz", ref: null, refRefused: true });
  assertEquals(r.ref, null);
  assertEquals(r.refusal, "ref_refused");
  // Le cas qui passe, immédiatement à côté: SANS le drapeau, le terme pèse.
  const ok = resolveCompositionLine(INDEX, { term: "riz", ref: null, refRefused: false });
  assertEquals(ok.ref?.slug, "white_rice");
  assertEquals(ok.source, "term");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ RAISIN FRAIS/SEC, PRUNE FRAÎCHE/SÉCHÉE, CRU/CUIT, ET LA LIGNE SANS `ref`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ raisin et prune — l'identifiant dit lequel des deux, le faux ami garde le terme", () => {
  // Par le TERME français, la porte des faux amis donne le FRAIS.
  const parTerme = resolveCompositionLine(INDEX, { term: "raisin", ref: null, refRefused: false });
  assertEquals(parTerme.ref?.slug, "grapes");
  assertEquals(parTerme.viaFalseFriend, true);
  // Par l'IDENTIFIANT, le modèle peut dire « je parle bien du SEC ».
  const sec = resolveCompositionLine(INDEX, { term: "raisin", ref: "raisin", refRefused: false });
  assertEquals(sec.ref?.slug, "raisin");
  assertEquals(sec.ref?.energyKcal, 321);
  assertEquals(sec.viaFalseFriend, false);
  // Et la contradiction se COMPTE, sans être tranchée par le libellé.
  assertEquals(refTermConflict(INDEX, { term: "raisin", ref: "raisin" }), {
    declared: "raisin",
    viaTerm: "grapes",
  });
  // Même jeu sur la prune.
  assertEquals(
    resolveCompositionLine(INDEX, { term: "prune", ref: null, refRefused: false }).ref?.slug,
    "plum",
  );
  assertEquals(
    resolveCompositionLine(INDEX, { term: "prune", ref: "prune", refRefused: false }).ref?.energyKcal,
    229,
  );
  // ⛔ LE CAS QUI NE DOIT PAS COMPTER: un identifiant qui dit la MÊME chose que
  // son libellé n'est pas une contradiction. Sinon le compteur crierait partout.
  assertEquals(refTermConflict(INDEX, { term: "raisin", ref: "grapes" }), null);
  // ⛔ ET AUCUNE ÉGALITÉ TEXTUELLE N'EST EXIGÉE entre un libellé français et un
  // slug anglais: « pita complète » / `pita_wholemeal` n'est pas un conflit, le
  // libellé n'atteignant aucune ligne.
  assertEquals(refTermConflict(INDEX, { term: "pita complète", ref: "pita_wholemeal" }), null);
});

Deno.test("④ cru/cuit — l'identifiant ne dispense pas de l'état, et le facteur reste celui de la fiche", () => {
  const cru = resolveIngredients(INDEX, [{
    term: "riz",
    ref: "white_rice",
    amount: 100,
    unit: "g",
    state: "raw",
  }]);
  assertEquals(cru.resolved[0].gramsRaw, 100);
  const cuit = resolveIngredients(INDEX, [{
    term: "riz",
    ref: "white_rice",
    amount: 260,
    unit: "g",
    state: "cooked",
  }]);
  assertAlmostEquals(cuit.resolved[0].gramsRaw, 100, 0.001);
  // ⛔ LE CAS QUI MORD: un `state` ABSENT sur une classe où il compte reste NON
  // PESÉ, identifiant ou pas. Deviner « raw » sur du riz vaut un facteur 2,6, et
  // toujours dans le sens qui gonfle.
  const sansEtat = resolveIngredients(INDEX, [{
    term: "riz",
    ref: "white_rice",
    amount: 100,
    unit: "g",
    state: null,
  }]);
  assertEquals(sansEtat.resolved, []);
  assertEquals(sansEtat.unweighedTerms, ["riz"]);
});

Deno.test("④ une ancienne ligne SANS `ref` garde exactement le chemin historique", () => {
  // ⚠️ `undefined`, pas `null`: un plan écrit avant le lot C n'a pas la clé.
  const ligne = { term: "riz", amount: 80, unit: "g" as const, state: "raw" as const };
  const r = resolveCompositionLine(INDEX, ligne);
  assertEquals(r.ref?.slug, "white_rice");
  assertEquals(r.source, "term");
  assertEquals(r.refusal, null);
  const res = resolveIngredients(INDEX, [ligne]);
  assertEquals(res.resolved[0].gramsRaw, 80);
  assertEquals(res.refusedTerms, []);
  // ⛔ ET LE REPLI NE PERMET PAS D'OMETTRE `ref` SUR UN PLAN NEUF: c'est le
  // parseur qui le compte (`ref_absent`), et `readRefSlug` le nomme.
  assertEquals(readRefSlug(undefined, INDEX, () => true).outcome, "absent");
  assertEquals(readRefSlug("pita_wholemeal", INDEX, () => true).outcome, "accepted");
  assertEquals(readRefSlug("pas_un_slug", INDEX, () => true).outcome, "unknown");
  assertEquals(readRefSlug("pita_wholemeal", INDEX, () => false).outcome, "not_composable");
});

Deno.test("④ les lignes non pesées par convention ne comptent pas comme références vérifiées", () => {
  // Le condiment est pesé par convention — sa masse vient de la fiche, pas du
  // modèle — et il est COMPTÉ à part. C'est l'exception explicite du chantier.
  const r = resolveIngredients(INDEX, [
    { term: "sel", ref: null, amount: null, unit: null, state: null },
    { term: "riz", ref: "white_rice", amount: 80, unit: "g", state: "raw" },
  ]);
  assertEquals(r.conventionalTerms, ["sel"]);
  assertEquals(r.resolved.length, 2);
  assertEquals(r.refusedTerms, []);
  // ⛔ LE CAS QUI MORD: un condiment dont l'identifiant est inventé reste REFUSÉ.
  // La convention pèse une pincée; elle ne valide pas une identité.
  const faux = resolveIngredients(INDEX, [
    { term: "sel", ref: "sel_de_guerande_invente", amount: null, unit: null, state: null },
  ]);
  assertEquals(faux.resolved, []);
  assertEquals(faux.refusedTerms, ["sel"]);
  assertEquals(faux.conventionalTerms, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ALLER-RETOUR — parseur → transformation → payload → lecteurs
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ l'identité traverse une préparation PARTAGÉE et deux lignes homonymes", () => {
  // ⚠️ DEUX LIGNES « huile d'olive » DANS LA MÊME CASSEROLE: l'une déclarée sur
  // l'huile, l'autre sur une identité DIFFÉRENTE. Un rapprochement par libellé
  // les confondrait — c'est le cas que le chantier nomme.
  const prep = {
    id: "prep_partagee",
    method: "Fais revenir, puis mijote.",
    servingsMade: 2,
    ingredients: [
      { term: "riz", ref: "white_rice", refRefused: false, amount: 200, unit: "g" as const, state: "raw" as const },
      { term: "huile d'olive", ref: "olive_oil", refRefused: false, amount: 10, unit: "g" as const, state: "raw" as const },
      { term: "huile d'olive", ref: "tahini", refRefused: false, amount: 20, unit: "g" as const, state: "raw" as const },
    ],
  };
  const m = measurePreparation(INDEX, prep);
  // 200 g riz (700) + 10 g huile (90) + 20 g tahini (119) = 909 kcal.
  assertAlmostEquals(m.kcal!, 909, 1);
  // ⛔ LE CAS QUI MORD: par le seul libellé, les DEUX lignes « huile d'olive »
  // vaudraient 900 kcal/100 g, et la casserole sortirait à 970 kcal.
  const parLibelle = measurePreparation(INDEX, {
    ...prep,
    ingredients: prep.ingredients.map(sansRef),
  });
  assertAlmostEquals(parLibelle.kcal!, 970, 1);
  assert(Math.abs(m.kcal! - parLibelle.kcal!) > 50, "les deux lectures DOIVENT différer");
});

Deno.test("⑤ l'aller-retour JSON préserve identités et valeurs — y compris le REFUS", () => {
  // Le payload tel que `ingredientPayload` l'écrit (R1: snake_case).
  const payload = [
    { term: "pita complète", ref: "pita_wholemeal", ref_refused: false, amount: 1, unit: "unit", state: "raw", quantity: "1 pita complète" },
    { term: "riz", ref: null, ref_refused: true, amount: 80, unit: "g", state: "raw", quantity: "80 g de riz" },
    { term: "tomate", ref: null, ref_refused: false, amount: 90, unit: "g", state: "raw", quantity: "90 g de tomate" },
  ];
  const relu = readIngredients(payload);
  assertEquals(relu.map((i) => i.ref), ["pita_wholemeal", null, null]);
  assertEquals(relu.map((i) => i.refRefused), [false, true, false]);
  const r = resolveIngredients(INDEX, relu);
  // ① l'identifiant pèse, ③ le terme historique pèse…
  assertEquals(r.resolved.map((x) => x.ref.slug).sort(), ["pita_wholemeal", "tomato"]);
  assertEquals(r.resolved.find((x) => x.ref.slug === "pita_wholemeal")!.gramsRaw, 60);
  // ⛔ … ET ② RESTE REFUSÉE. C'est la ligne du lot: sans `ref_refused` en base,
  // `ref: null` rendait « refusé » indiscernable de « jamais écrit », et la
  // ligne repassait par le terme libre, qui résout parfaitement « riz ».
  assertEquals(r.refusedTerms, ["riz"]);
  assertEquals(r.refusedBy, ["ref_refused"]);
  // ⛔ LE CAS QUI MORD, ET C'EST LE MÊME PAYLOAD SANS LA CLÉ: un plan d'AVANT ce
  // lot n'a pas `ref_refused`, et sa ligne doit continuer à peser par le terme.
  const ancien = payload.map(({ ref_refused: _r, ...reste }) => reste);
  const rAncien = resolveIngredients(INDEX, readIngredients(ancien));
  assertEquals(rAncien.refusedTerms, []);
  assertEquals(rAncien.resolved.map((x) => x.ref.slug).sort(), [
    "pita_wholemeal",
    "tomato",
    "white_rice",
  ]);
});

Deno.test("⑤ une préparation relue par `readPreparations` porte l'identité de ses lignes", () => {
  const preps = readPreparations([{
    id: "prep_partagee",
    servings_made: 2,
    method: "Mijote.",
    ingredients: [
      { term: "pita complète", ref: "pita_wholemeal", ref_refused: false, amount: 2, unit: "unit", state: "raw" },
    ],
  }]);
  assertEquals(preps[0].ingredients[0].ref, "pita_wholemeal");
  const m = measurePreparation(INDEX, {
    id: preps[0].id,
    method: preps[0].method ?? "",
    ingredients: preps[0].ingredients,
  });
  // 2 × 60 g = 120 g crus, rendement neutre ⇒ 120 g prêts, 318 kcal.
  assertEquals(m.readyG, 120);
  assertAlmostEquals(m.kcal!, 318, 1);
});

Deno.test("⑤ l'ajusteur mesure ses candidates sur la MÊME identité que le moteur", () => {
  const lignes = [
    { term: "pita complète", ref: "pita_wholemeal", refRefused: false, amount: 1, unit: "unit" as const, state: "raw" as const, gramsRaw: 60, quantity: "1 pita complète", group: null },
    { term: "tomate", ref: "tomato", refRefused: false, amount: 200, unit: "g" as const, state: "raw" as const, gramsRaw: 200, quantity: "200 g de tomate", group: null },
  ];
  const plan = adjustPlanProportions({
    index: INDEX,
    dishes: [{ method: "Assemble.", ingredients: lignes, uses: [] }],
    preparations: [],
    corridors: [{
      dishIndex: 0,
      eaterKey: "m1",
      minPer100G: 50,
      maxPer100G: 250,
      preferredPer100G: 120,
    }],
    baselineOf: () => null,
    now: () => 0,
  })!;
  // ⛔ LA PITA N'EST PAS VERROUILLÉE `unresolved` — elle l'était avant le lot, et
  // l'ajusteur travaillait alors sur une assiette amputée de son pain.
  assertEquals(plan.units.lines_locked.unresolved, 0);
  // ⚠️ Elle reste verrouillée `counted_unit`: « 1 pita » ne devient pas « 1,2 ».
  assertEquals(plan.units.lines_locked.counted_unit, 1);
  assertEquals(plan.apply.prose_stale, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE SAS N'EST PLUS APPELÉ POUR UN ALIMENT DONT L'IDENTIFIANT EXISTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ LE CAS QUI PASSE — un aliment sans alias mais avec identifiant ne part pas au sas", () => {
  const { requests, overCap } = fillRequestsFor(INDEX, [PITA_UNIT, PITA_GRAMS]);
  assertEquals(requests, []);
  assertEquals(overCap, []);
});

Deno.test("⑥ LE CAS QUI MORD — sans identifiant, le même aliment part au sas", () => {
  // ⚠️ C'EST CE QUI S'EST PASSÉ LE 2026-09-11: le sas a fabriqué
  // `whole wheat pita bread` à 258 kcal (`fill_source: model`, donc NON
  // composable) alors que `pita_wholemeal` existait, vérifiée, à 265.
  const { requests } = fillRequestsFor(INDEX, [sansRef(PITA_UNIT)]);
  assertEquals(requests.map((r) => r.term), ["pita complete"]);
});

Deno.test("⑥ une ligne REFUSÉE par son identifiant n'est pas une worklist", () => {
  // Remplir le libellé ne rendrait pas la ligne valide: l'identifiant est
  // refusé AVANT le terme. Payer un appel pour ça serait payer pour rien.
  const { requests } = fillRequestsFor(INDEX, [
    { term: "galette inconnue", ref: "slug_invente", refRefused: false },
    { term: "riz", ref: null, refRefused: true },
    // … et le cas qui PASSE, immédiatement à côté: un vrai terme inconnu.
    { term: "galette inconnue bis", ref: null, refRefused: false },
  ]);
  assertEquals(requests.map((r) => r.term), ["galette inconnue bis"]);
});
