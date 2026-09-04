import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_CEILING_RATIO,
  DEFAULT_FLOOR_RATIO,
  densifyBoxes,
  densityFromComposition,
  type DensifyBox,
  type DensifyItem,
  type DensityOf,
  MAX_ITEM_G,
  MIN_MOVE_G,
  PROTEIN_CEILING_RATIO,
  servedDensityOf,
  VEG_FLOOR_RATIO,
  weighedReadyGrams,
} from "./box_densify.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";

const LEA = "m-lea";

// ── UN RÉFÉRENTIEL DE POCHE: trois densités, trois groupes ──────────────────
// kcal par gramme SERVI, comme le module les lit. Les valeurs sont rondes
// exprès: chaque assertion se recalcule à la main.
const DENSITY: Record<string, { kcal: number; group: string }> = {
  "légumes rôtis": { kcal: 0.4, group: "non_starchy_veg" },
  "couscous cuit": { kcal: 1.3, group: "whole_grain" },
  "tofu rôti": { kcal: 1.5, group: "tofu_tempeh" },
  "riz complet": { kcal: 1.3, group: "whole_grain" },
  "mystère": { kcal: 0, group: "" },
};
const densityOf: DensityOf = (item: DensifyItem) => {
  const d = DENSITY[item.term];
  if (!d || d.kcal === 0) return { kcalPerGram: null, group: null, reason: "unresolved" };
  return { kcalPerGram: d.kcal, group: d.group as never, reason: "resolved" };
};

function box(items: [string, number][], over: Partial<DensifyBox> = {}): DensifyBox {
  return {
    boxId: "box_lea_dinner",
    memberId: LEA,
    day: "fri",
    slot: "dinner",
    items: items.map(([term, grams]) => ({ term, grams, preparationId: null })),
    ...over,
  };
}
const mass = (grams: readonly number[]) => grams.reduce((a, b) => a + b, 0);

Deno.test("⛔ LA MASSE EST CONSERVÉE — ce module complète le plafond, il ne le contourne pas", () => {
  const b = box([["légumes rôtis", 300], ["riz complet", 200], ["tofu rôti", 100]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 60 }], densityOf });
  const after = out.grams.get(b.boxId);
  assert(after, "aucun déplacement");
  assertEquals(mass(after), 600);
  assertEquals(out.remaining, []);
  assertEquals(out.counts.stopped.closed, 1);
});

Deno.test("l'écart se ferme en déplaçant du MOINS dense vers le PLUS dense, dans l'ordre", () => {
  // 60 kcal à trouver. Cible la plus dense: le tofu (1,5), plafond protéine
  // 150 g → 50 g de marge, pris aux légumes (0,4): 50 × 1,1 = 55 kcal. Reste 5:
  // le tofu est au plafond, cible suivante le riz (1,3): 5 / 0,9 ≈ 6 g.
  const b = box([["légumes rôtis", 300], ["riz complet", 200], ["tofu rôti", 100]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 60 }], densityOf });
  const after = out.grams.get(b.boxId)!;
  assertEquals(after[2], 150, "le tofu n'est pas monté à son plafond de protéine");
  assertEquals(after[1], 206, "le reste n'est pas passé au riz");
  assertEquals(after[0], 244);
  assertEquals(out.moves.map((m) => [m.fromIndex, m.toIndex, m.grams]), [[0, 2, 50], [0, 1, 6]]);
  assert(out.counts.closed_kcal >= 60, `fermé ${out.counts.closed_kcal} kcal sur 60`);
});

Deno.test("⛔ LE PLANCHER DE LÉGUMES: 70 % de ce que le modèle a écrit, jamais moins", () => {
  // Écart énorme: seule la garde arrête. Les légumes s'arrêtent à 210 g.
  const b = box([["légumes rôtis", 300], ["riz complet", 200]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 5000 }], densityOf });
  const after = out.grams.get(b.boxId)!;
  assertEquals(after[0], Math.ceil(300 * VEG_FLOOR_RATIO));
  assertEquals(mass(after), 500);
  assertEquals(out.counts.stopped.floor, 1);
  assertEquals(out.remaining.length, 1);
  assert(out.remaining[0].unmetKcal > 0);
});

Deno.test("⛔ LE PLAFOND DE PROTÉINE: 150 % pour un item protéique, 200 % pour les autres", () => {
  // Deux sources abondantes, une cible protéique: elle s'arrête à 150 g.
  const prot = box([["légumes rôtis", 1000], ["tofu rôti", 100]]);
  const out = densifyBoxes({ boxes: [prot], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 5000 }], densityOf });
  assertEquals(out.grams.get(prot.boxId)![1], Math.floor(100 * PROTEIN_CEILING_RATIO));
  assertEquals(out.counts.stopped.ceiling, 1);
  // Un féculent monte jusqu'à 200 %.
  const grain = box([["légumes rôtis", 1000], ["riz complet", 100]], { boxId: "b2" });
  const out2 = densifyBoxes({ boxes: [grain], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 5000 }], densityOf });
  assertEquals(out2.grams.get("b2")![1], Math.floor(100 * DEFAULT_CEILING_RATIO));
});

Deno.test("⛔ UN ITEM NE DÉPASSE JAMAIS MAX_ITEM_G, même à 200 %", () => {
  const b = box([["légumes rôtis", 2000], ["riz complet", 300]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 5000 }], densityOf });
  assertEquals(out.grams.get(b.boxId)![1], MAX_ITEM_G);
});

Deno.test("⛔ UN ITEM NON RÉSOLU N'EST NI SOURCE NI CIBLE — l'énergie invisible ne se déplace pas", () => {
  // « mystère » pèse 500 g et pourrait tout absorber; il ne bouge pas d'un gramme.
  const b = box([["mystère", 500], ["légumes rôtis", 300], ["tofu rôti", 100]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 40 }], densityOf });
  const after = out.grams.get(b.boxId)!;
  assertEquals(after[0], 500);
  assertEquals(mass(after), 900);
  assert(out.moves.every((m) => m.fromIndex !== 0 && m.toIndex !== 0));
});

Deno.test("⛔ LA CASSEROLE N'EST PAS SUR-TIRÉE: un déplacement est borné par ce qu'il reste dans la casserole cible", () => {
  // Le riz cite `prep_rice`, dont il ne reste que 20 g toutes boîtes servies.
  // Sans la borne, 60 kcal / 0,9 = 67 g partiraient des légumes vers le riz —
  // et mercredi il manquerait du riz que lundi a pris. Avec: 20 g, et l'arrêt
  // se nomme `pot_exhausted`.
  const b: DensifyBox = {
    boxId: "b", memberId: LEA, day: "fri", slot: "dinner",
    items: [
      { term: "légumes rôtis", grams: 300, preparationId: "prep_veg" },
      { term: "riz complet", grams: 200, preparationId: "prep_rice" },
    ],
  };
  const out = densifyBoxes({
    boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 60 }], densityOf,
    potRoom: new Map([["prep_rice", 20], ["prep_veg", 500]]),
  });
  const after = out.grams.get("b")!;
  assertEquals(after[1], 220, "le riz a tiré plus que ce qu'il reste dans sa casserole");
  assertEquals(mass(after), 500);
  assertEquals(out.counts.stopped.pot_exhausted, 1);
  assert(out.remaining[0].unmetKcal > 0);
  // Une casserole déjà SUR-TIRÉE (marge ≤ 0) n'est jamais une cible.
  const over = densifyBoxes({
    boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 60 }], densityOf,
    potRoom: new Map([["prep_rice", -35]]),
  });
  assertEquals(over.moves, []);
  assertEquals(over.counts.stopped.pot_exhausted, 1);
  // Une casserole INCONNUE de la carte n'est pas bornée: on ne sait pas, comme avant.
  const unknown = densifyBoxes({
    boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 60 }], densityOf,
    potRoom: new Map([["prep_other", 1]]),
  });
  assert(unknown.grams.get("b")![1] > 220, "une casserole inconnue a été bornée");
});

Deno.test("sans item plus dense, rien ne bouge — et c'est DIT (`no_dense_target`)", () => {
  const b = box([["riz complet", 200], ["couscous cuit", 200]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 100 }], densityOf });
  assertEquals(out.moves, []);
  assertEquals(out.counts.stopped.no_dense_target, 1);
  assertEquals(out.remaining, [{ memberId: LEA, day: "fri", unmetKcal: 100 }]);
});

Deno.test("sans densité connue du tout, on s'abstient (`no_density`); sans boîte à soi, `no_box`", () => {
  const dark = box([["mystère", 300]]);
  const out = densifyBoxes({ boxes: [dark], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 100 }], densityOf });
  assertEquals(out.counts.stopped.no_density, 1);
  const none = densifyBoxes({ boxes: [], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 100 }], densityOf });
  assertEquals(none.counts.stopped.no_box, 1);
  assertEquals(none.remaining.length, 1);
});

Deno.test("l'écart d'un JOUR se répartit entre ses boîtes au prorata de leurs kcal", () => {
  // Déjeuner 300 kcal, dîner 600 kcal → 2/3 de l'écart au dîner.
  const lunch = box([["légumes rôtis", 250], ["riz complet", 150]], { boxId: "lunch", slot: "lunch" });
  const dinner = box([["légumes rôtis", 500], ["riz complet", 300]], { boxId: "dinner", slot: "dinner" });
  const out = densifyBoxes({ boxes: [lunch, dinner], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 90 }], densityOf });
  const gained = (id: string) => out.moves.filter((m) => m.boxId === id).reduce((n, m) => n + m.kcalGained, 0);
  assert(Math.abs(gained("lunch") - 30) <= 6, `déjeuner: ${gained("lunch")} kcal`);
  assert(Math.abs(gained("dinner") - 60) <= 6, `dîner: ${gained("dinner")} kcal`);
  assertEquals(out.counts.boxes_touched, 2);
});

Deno.test("une boîte d'une AUTRE bouche ou d'un AUTRE jour n'est jamais touchée", () => {
  const mine = box([["légumes rôtis", 300], ["riz complet", 200]]);
  const other = box([["légumes rôtis", 300], ["riz complet", 200]], { boxId: "marc", memberId: "m-marc" });
  const thu = box([["légumes rôtis", 300], ["riz complet", 200]], { boxId: "thu", day: "thu" });
  const out = densifyBoxes({ boxes: [mine, other, thu], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 30 }], densityOf });
  assertEquals([...out.grams.keys()], [mine.boxId]);
});

Deno.test("la poussière ne bouge pas: sous MIN_MOVE_G on ferme ou on nomme la garde", () => {
  // 2 kcal d'écart → 2 g: on ne touche pas, et c'est fermé.
  const b = box([["légumes rôtis", 300], ["riz complet", 200]]);
  const out = densifyBoxes({ boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 2 }], densityOf });
  assertEquals(out.moves, []);
  assert(out.moves.every((m) => m.grams >= MIN_MOVE_G));
  assertEquals(out.counts.stopped.closed, 1);
});

Deno.test("déterministe: la même entrée rend la même sortie, deux fois", () => {
  const b = box([["légumes rôtis", 300], ["couscous cuit", 150], ["tofu rôti", 120]]);
  const args = { boxes: [b], deficits: [{ memberId: LEA, day: "fri", unmetKcal: 80 }], densityOf };
  assertEquals(JSON.stringify(densifyBoxes(args)), JSON.stringify(densifyBoxes(args)));
});

Deno.test("les gardes sont des CONSTANTES nommées, et elles disent le produit", () => {
  assertEquals(VEG_FLOOR_RATIO, 0.7);
  assertEquals(DEFAULT_FLOOR_RATIO, 0.5);
  assertEquals(PROTEIN_CEILING_RATIO, 1.5);
  assertEquals(DEFAULT_CEILING_RATIO, 2.0);
  assertEquals(MAX_ITEM_G, 400);
  assertEquals(MIN_MOVE_G, 5);
});

// ── LA DENSITÉ PAR LE RÉFÉRENTIEL, JAMAIS PAR UN TEXTE ──────────────────────
function ref(over: Partial<CompositionRef> & { slug: string; energyKcal: number }): CompositionRef {
  return {
    foodGroupRef: "whole_grain",
    label: over.slug,
    source: "ciqual" as never,
    proteinG: null,
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
    atwaterDiscount: 1,
    energyDense: false,
    ...over,
  } as CompositionRef;
}

Deno.test("servedDensityOf lit l'énergie par 100 g CRUS et la ramène au gramme SERVI", () => {
  // Couscous: 370 kcal / 100 g cru, absorbe ×2,6 → 1,42 kcal par gramme cuit.
  const couscous = ref({ slug: "couscous", energyKcal: 370, yieldClass: "grain_absorbs" });
  assert(Math.abs(servedDensityOf(couscous) - 370 / 100 / 2.6) < 1e-9);
  // Une remise Atwater s'applique avant.
  const nuts = ref({ slug: "amande", energyKcal: 600, atwaterDiscount: 0.8 });
  assert(Math.abs(servedDensityOf(nuts) - 4.8) < 1e-9);
});

Deno.test("densityFromComposition: un terme résolu a sa densité et son groupe; un inconnu vaut null", () => {
  const index = buildCompositionIndex(
    [
      ref({ slug: "tofu", energyKcal: 120, foodGroupRef: "tofu_tempeh" }),
      ref({ slug: "courgette", energyKcal: 17, foodGroupRef: "non_starchy_veg", yieldClass: "veg_shrinks" }),
    ],
    [{ alias: "tofu rôti", slug: "tofu" }],
  );
  const densityOf = densityFromComposition(index, []);
  const tofu = densityOf({ term: "tofu rôti", grams: 100, preparationId: null });
  assertEquals(tofu.reason, "resolved");
  assertEquals(tofu.group, "tofu_tempeh");
  assert(Math.abs((tofu.kcalPerGram ?? 0) - 1.2) < 1e-9);
  const unknown = densityOf({ term: "chose inconnue", grams: 100, preparationId: null });
  assertEquals(unknown, { kcalPerGram: null, group: null, reason: "unresolved" });
  // Un item qui cite une préparation absente vaut null aussi.
  assertEquals(densityOf({ term: "x", grams: 1, preparationId: "prep_nope" }).kcalPerGram, null);
});

// ── LE CÂBLAGE: un module pur qui n'est pas appelé est un module qui ne densifie rien ──
Deno.test("CÂBLAGE — le générateur densifie APRÈS unmetDemand, sur les seuls écarts plafonnés, et le compte sur les deux surfaces", async () => {
  const src = await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  const unmetAt = src.indexOf("const unmet = unmetDemand(");
  const densifyAt = src.indexOf("densifyBoxes({");
  const logAt = src.indexOf('tag: "keel.household_meal.box_sizing"');
  assert(unmetAt > 0 && densifyAt > unmetAt, "la densification ne suit pas unmetDemand: elle n'aurait pas d'écart à fermer");
  assert(densifyAt < logAt, "la densification est branchée APRÈS le journal: le compteur ne la verrait pas");
  // ⛔ SEULS LES ÉCARTS PLAFONNÉS. Un `pot_ceiling` est l'écart d'un bac partagé, sans besoin unique.
  assert(/row\.cause === "factor_clamped" \|\| row\.cause === "both"/.test(src), "la densification ne se limite plus aux écarts plafonnés");
  // ⛔ SEULES LES BOÎTES À UNE BOUCHE.
  assert(/\.filter\(\(box\) => box\.memberIds\.length === 1\)/.test(src), "une boîte partagée pourrait être densifiée");
  // Les grammes rendus sont ÉCRITS sur le plan.
  assert(/const next = densify\.grams\.get\(box\.id\);/.test(src), "les grammes densifiés ne sont pas écrits sur les boîtes");
  // Compté sur les deux surfaces, même à zéro.
  assertEquals((src.match(/densify: densifyCounts,/g) || []).length, 2, "le compteur ne sort pas sur le journal ET l'archive");
  assert(/skipped: "no_composition"/.test(src), "« pas de référentiel » ne se distingue plus de « rien à faire »");
  // ⛔ ET LA CASSEROLE EST BORNÉE PAR CE QU'IL EN RESTE, toutes boîtes servies:
  // `sum_over` a rendu son verdict avant, sur les grammes du modèle.
  const potAt = src.indexOf("potRoom: (() => {");
  assert(potAt > densifyAt && potAt < logAt, "la marge des casseroles n'est pas passée à la densification");
  assert(/room\.set\(prep\.id, ready - \(drawn\.get\(prep\.id\) \?\? 0\)\);/.test(src), "la marge n'est plus « prêt moins déjà tiré »");
});

Deno.test("⛔ ⟳ UNE PINCÉE DE SEL NE REND PAS LA DENSITÉ D'UNE CASSEROLE INCONNUE", () => {
  // Mesuré sur le premier tir réel: « cuisses de poulet 2 720 g » + « 1 pincée
  // de sel » ⇒ `no_density`, rien déplacé. Toutes les vraies casseroles ont
  // une pincée de quelque chose.
  const index = buildCompositionIndex(
    [
      ref({ slug: "poulet", energyKcal: 200, foodGroupRef: "poultry", yieldClass: "meat_shrinks" }),
      // Une pincée: `condimentGrams` porte sa masse conventionnelle.
      ref({ slug: "sel", energyKcal: 0, foodGroupRef: "sauce_dressing" as never, condimentGrams: 1 } as never),
      // Une huile non pesée: `energyDense`, refusée par `condimentMassFor`.
      ref({ slug: "huile d olive", energyKcal: 900, foodGroupRef: "olive_oil", energyDense: true, condimentGrams: 5 } as never),
    ],
    [],
  );
  // `state: "raw"` sur le pesé: sans état, une viande n'a pas de grammes crus.
  const ing = (term: string, gramsRaw: number | null, amount: number | null, unit: "g" | null) => ({
    term, quantity: null, in_pantry: false, amount, unit, state: gramsRaw === null ? null : "raw", gramsRaw, quantitySource: null,
  }) as never;
  const prep = {
    id: "prep_chicken",
    method: "Rôtir.",
    ingredients: [ing("poulet", 600, 600, "g"), ing("sel", null, null, null)],
  };
  // Les grammes prêts: 600 g crus × 0,7, plus la masse CONVENTIONNELLE du sel (1 g).
  assertEquals(weighedReadyGrams(prep.ingredients, index), 421);
  const densityOf = densityFromComposition(index, [prep]);
  const d = densityOf({ term: "poulet rôti", grams: 300, preparationId: "prep_chicken" });
  assertEquals(d.reason, "resolved", "une pincée de sel a rendu la casserole inconnue");
  assertEquals(d.group, "poultry");
  assert(d.kcalPerGram !== null && d.kcalPerGram > 0, JSON.stringify(d));
  // ⛔ UNE HUILE NON PESÉE rend la casserole INCONNUE — pas « mesurée sur son
  // poulet seul », ce qui la ferait paraître moins dense qu'elle n'est et
  // ferait déplacer PLUS de grammes que nécessaire, sans qu'aucun compteur ne
  // le voie. C'est la contre-épreuve de `condimentMassFor`, réutilisée ici.
  const oily = { id: "prep_oily", method: "Rôtir.", ingredients: [ing("poulet", 600, 600, "g"), ing("huile d olive", null, null, null)] };
  assertEquals(densityFromComposition(index, [oily])({ term: "poulet rôti", grams: 300, preparationId: "prep_oily" }).kcalPerGram, null);
  // Sans AUCUN ingrédient résolu (un terme que le référentiel ignore), on ne sait toujours pas.
  const dark = { id: "prep_dark", method: "", ingredients: [ing("chose inconnue", null, null, null)] };
  assertEquals(weighedReadyGrams(dark.ingredients, index), null);
  assertEquals(densityFromComposition(index, [dark])({ term: "x", grams: 1, preparationId: "prep_dark" }).kcalPerGram, null);
});
