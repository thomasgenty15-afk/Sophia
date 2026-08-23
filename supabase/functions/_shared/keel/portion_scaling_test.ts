import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  MAX_SCALE,
  MAX_SINGLE_INGREDIENT_G,
  MIN_SCALE,
  SCALE_DEAD_ZONE,
  type ScalableIngredient,
  scaleFactorFor,
  scaleFactorsFor,
  scaleIngredients,
} from "./portion_scaling.ts";
import { envelopeFor } from "./meal_envelope.ts";
import type { AgeBand } from "./student_age.ts";

function bodyOf(kg: number, cm: number, g: "male" | "female", flag = false) {
  return {
    heightCm: cm,
    ageBand: "30_44" as AgeBand,
    gender: g,
    latestWeight: { weekStart: "2026-08-09", value: kg },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: flag,
  };
}
const PER_KG = envelopeFor("fat_loss", bodyOf(92, 186, "male"), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null);
const PER_PORTION = envelopeFor(
  "fat_loss",
  bodyOf(92, 186, "male", true),
  "30_44",
  true,
  null,
null,
  { day: null, sport: null, asked: false },
  null,
  null,
);

function ing(over: Partial<ScalableIngredient> = {}): ScalableIngredient {
  return {
    term: "chicken breast",
    quantity: "120 g",
    amount: 120,
    unit: "g",
    state: "raw",
    gramsRaw: 120,
    ...over,
  };
}

// ===========================================================================
// LA MISE À L'ÉCHELLE — ce que ce fichier garde
//
// Mesuré sur six générations réelles le 2026-08-11: les plans servent 65-70 %
// de leur cible, uniformément, alors que les PROPORTIONS entre gabarits sont
// justes (×1,59 pour un attendu de ×1,64). Il manque un facteur constant, et
// aucune intervention par la consigne ne l'a déplacé (×1,21 au mieux).
//
// Les trois façons de rater ce module:
//   1. mettre à l'échelle sous le plancher TCA (une portion dérivée du corps)
//   2. laisser la PROSE diverger du chiffre (liste de courses ≠ assiette)
//   3. étirer un plan structurellement faux au lieu de le signaler
// ===========================================================================

Deno.test("le facteur ferme l'écart mesuré", () => {
  const band = "energy" in PER_KG ? PER_KG.energy! : null;
  assert(band);
  const target = (band.low + band.high) / 2;

  // Le cas réel: 1637 kcal/j servis pour ~2390 visés.
  const f = scaleFactorFor({ computedKcal: 1637, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assert(f !== null);
  assert(f > 1.3 && f < 1.6, `facteur inattendu: ${f}`);
  // Et il vise bien le centre de bande.
  assertEquals(Math.round(1637 * f!), Math.round(target));
});

Deno.test("SOUS LE PLANCHER TCA, rien ne se met à l'échelle", () => {
  // Une portion recalculée depuis une cible énergétique serait un chiffre
  // dérivé du corps d'un élève sous plancher. `null`, structurellement: le
  // mode `per_portion` ne porte pas de bande, il n'y a rien à viser.
  assertEquals(
    scaleFactorFor({ computedKcal: 800, envelope: PER_PORTION, daysCovered: 1, resolvedShare: 1 }),
    null,
  );
  // Corps inconnu: même silence, ce qui rend les deux indiscernables.
  const unknown = envelopeFor("fat_loss", null, null, false, null, null, { day: null, sport: null, asked: false }, null, null);
  assertEquals(
    scaleFactorFor({ computedKcal: 800, envelope: unknown, daysCovered: 1, resolvedShare: 1 }),
    null,
  );
});

Deno.test("on ne touche PAS à un plan déjà bon", () => {
  // Sans zone morte, chaque génération serait réécrite pour ±3 % et les
  // quantités rondes du modèle (100 g, 150 g) deviendraient des 103 et 146.
  const band = "energy" in PER_KG ? PER_KG.energy! : null;
  const target = (band!.low + band!.high) / 2;
  assertEquals(scaleFactorFor({ computedKcal: target, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }), null);
  // Juste dans la zone morte.
  const inside = target / (1 + SCALE_DEAD_ZONE * 0.9);
  assertEquals(scaleFactorFor({ computedKcal: inside, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }), null);
  // Juste en dehors: ça mord.
  const outside = target / (1 + SCALE_DEAD_ZONE * 1.5);
  assert(scaleFactorFor({ computedKcal: outside, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }) !== null);
});

Deno.test("le facteur est BORNÉ des deux côtés", () => {
  // Un plan à 300 kcal/j n'est pas « trop petit », il est structurellement
  // faux — il manque un repas. L'étirer ×8 produirait une assiette absurde au
  // lieu de signaler le vrai problème.
  const huge = scaleFactorFor({ computedKcal: 300, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assertEquals(huge, MAX_SCALE);
  const tiny = scaleFactorFor({ computedKcal: 9000, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assertEquals(tiny, MIN_SCALE);
});

Deno.test("une énergie non calculable n'autorise AUCUNE mise à l'échelle", () => {
  // Mettre à l'échelle sur une énergie douteuse ferait exactement le dégât que
  // l'abstention du verdict existe pour éviter.
  assertEquals(scaleFactorFor({ computedKcal: null, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }), null);
  assertEquals(scaleFactorFor({ computedKcal: 0, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }), null);
  assertEquals(scaleFactorFor({ computedKcal: NaN, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }), null);
});

Deno.test("la fenêtre ramène l'énergie au JOUR", () => {
  // 7 jours à 1637 kcal/j font 11 459 kcal sur la fenêtre. Sans la division,
  // le module croirait le plan sept fois trop copieux et le réduirait.
  const week = scaleFactorFor({ computedKcal: 1637 * 7, envelope: PER_KG, daysCovered: 7, resolvedShare: 1 });
  const day = scaleFactorFor({ computedKcal: 1637, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assertEquals(week, day);
});

Deno.test("seuls les grammes et millilitres bougent", () => {
  // « 1/2 avocado » mis à l'échelle donnerait « 0,7 avocat », et « 1 tortilla »
  // deviendrait « 1,4 tortilla » — des quantités qu'on ne peut ni acheter ni
  // servir.
  const r = scaleIngredients([
    ing({ term: "chicken", amount: 120, unit: "g", quantity: "120 g" }),
    ing({ term: "olive oil", amount: 10, unit: "ml", quantity: "10 ml" }),
    ing({ term: "avocado", amount: 0.5, unit: "unit", quantity: "1/2 avocado" }),
    ing({ term: "tortilla", amount: 1, unit: "unit", quantity: "1 tortilla" }),
    ing({ term: "black pepper", amount: null, unit: null, quantity: "a pinch" }),
  ], 1.45);

  assertEquals(r.items[0].amount, 175);
  assertEquals(r.items[1].amount, 15);
  // Les dénombrables et les aromates sont INTACTS, prose comprise.
  assertEquals(r.items[2].amount, 0.5);
  assertEquals(r.items[2].quantity, "1/2 avocado");
  assertEquals(r.items[3].amount, 1);
  assertEquals(r.items[4].quantity, "a pinch");
  assertEquals(r.changed, 2);
});

Deno.test("LA PROSE SUIT LE CHIFFRE — sinon la liste de courses ment", () => {
  // Le défaut le plus dur à voir en production: l'élève lit « 120 g » et le
  // moteur compte 175 g. La liste de courses ne correspond plus à l'assiette.
  const r = scaleIngredients([ing({ amount: 120, quantity: "120 g" })], 1.45);
  assertEquals(r.items[0].amount, 175);
  assertEquals(r.items[0].quantity, "175 g");
  // Et `gramsRaw` est REMIS À NULL, pas recalculé à la main: seul le résolveur
  // connaît les rendements cru/cuit.
  assertEquals(r.items[0].gramsRaw, null);
});

Deno.test("un ingrédient ne dépasse jamais le plafond, et le dit", () => {
  const r = scaleIngredients([ing({ term: "rice", amount: 400, unit: "g" })], 2.0);
  assertEquals(r.items[0].amount, MAX_SINGLE_INGREDIENT_G);
  assertEquals(r.capped, ["rice"]);
});

// ---------------------------------------------------------------------------
// LES DÉNOMBRABLES — élargis le 2026-08-12, avec deux refus
// ---------------------------------------------------------------------------

Deno.test("« 2 eggs » devient « 3 eggs » — nombre ET prose", () => {
  // ── POURQUOI CE LOT ─────────────────────────────────────────────────────
  // Les migrations `unit_grams` ont donné un poids aux aliments comptés à la
  // pièce: ils sont passés d'INVISIBLES au calcul à LUS MAIS IMMOBILES. Mesuré
  // en run réel: `reste ×2,00` ne déplaçait l'énergie que de 3 points, ~60 %
  // du plat étant hors de portée du facteur.
  const r = scaleIngredients(
    [ing({ term: "eggs", quantity: "2 eggs", amount: 2, unit: "unit" })],
    1.4,
  );
  assertEquals(r.items[0].amount, 3);
  assertEquals(r.items[0].quantity, "3 eggs");
  assertEquals(r.items[0].gramsRaw, null);
  assertEquals(r.changed, 1);
});

Deno.test("une cuillère s'arrondit au DEMI, un œuf à l'entier", () => {
  // Une demi-cuillère est une vraie mesure de cuisine; un demi-œuf non.
  const spoon = scaleIngredients(
    [ing({ term: "olive oil", quantity: "1 tbsp", amount: 1, unit: "tbsp" })],
    1.6,
  );
  assertEquals(spoon.items[0].amount, 1.5);
  assertEquals(spoon.items[0].quantity, "1.5 tbsp");

  const eggs = scaleIngredients(
    [ing({ term: "eggs", quantity: "4 eggs", amount: 4, unit: "unit" })],
    1.3,
  );
  assertEquals(eggs.items[0].amount, 5);
});

Deno.test("REFUS 1 — « 1/2 avocado » n'est jamais réécrit", () => {
  // ⚠️ C'EST L'EXEMPLE QUI JUSTIFIAIT LE REFUS GLOBAL des dénombrables, et
  // c'est la règle générale qui le neutralise, pas un cas particulier sur
  // l'avocat: la prose commence par « 1 » alors que `amount` vaut 0,5. Les
  // réécrire donnerait « 2/2 avocado » dans une liste de courses.
  const r = scaleIngredients(
    [ing({ term: "avocado", quantity: "1/2 avocado", amount: 0.5, unit: "unit" })],
    1.5,
  );
  assertEquals(r.items[0].amount, 0.5, "l'ingrédient sort INTACT");
  assertEquals(r.items[0].quantity, "1/2 avocado");
  assertEquals(r.changed, 0);
});

Deno.test("REFUS 2 — la frontière du singulier/pluriel ne se traverse pas", () => {
  // « 1 egg » → « 2 egg » et « 2 eggs » → « 1 eggs » sont faux tous les deux,
  // dans les deux langues. Fléchir demanderait un moteur de grammaire, et le
  // dépôt a déjà payé « jamais de matcher maison ».
  const monte = scaleIngredients(
    [ing({ term: "eggs", quantity: "1 egg", amount: 1, unit: "unit" })],
    2.0,
  );
  assertEquals(monte.items[0].quantity, "1 egg");
  assertEquals(monte.changed, 0);

  const descend = scaleIngredients(
    [ing({ term: "eggs", quantity: "2 eggs", amount: 2, unit: "unit" })],
    0.75,
  );
  assertEquals(descend.items[0].quantity, "2 eggs");
  assertEquals(descend.changed, 0);
});

Deno.test("une prose SANS nombre de tête n'est pas touchée", () => {
  // « a couple of eggs » porte un `amount` structuré mais aucune prise pour
  // réécrire. Le refus est la valeur par défaut.
  const r = scaleIngredients(
    [ing({ term: "eggs", quantity: "a couple of eggs", amount: 2, unit: "unit" })],
    1.5,
  );
  assertEquals(r.items[0].amount, 2);
  assertEquals(r.changed, 0);
});

Deno.test("la prose garde son texte, seul le NOMBRE bouge", () => {
  // Le mot compte autant que le chiffre: « 3 unit » serait une liste de
  // courses illisible.
  const r = scaleIngredients(
    [ing({
      term: "chickpeas",
      quantity: "2 tins of chickpeas, drained",
      amount: 2,
      unit: "unit",
    })],
    1.6,
  );
  assertEquals(r.items[0].quantity, "3 tins of chickpeas, drained");
});

Deno.test("condition de désarmement: ni g ni ml ni dénombrable ⇒ intact", () => {
  // Une pincée n'a pas de quantité structurée: elle sort sans qu'on ait eu à
  // la nommer.
  const r = scaleIngredients(
    [ing({ term: "salt", quantity: "a pinch", amount: null, unit: null })],
    2.0,
  );
  assertEquals(r.items[0].quantity, "a pinch");
  assertEquals(r.changed, 0);
});

Deno.test("le plafond REFUSE DE GRANDIR, il ne rapetisse jamais", () => {
  // ── LE DÉFAUT MESURÉ (2026-08-12, recomposition 78 kg) ──────────────────
  // Une PRÉPARATION porte 1 kg de cuisses pour quatre portions. Le facteur
  // ×1,32 donnait 1320 g, et le plafond ramenait à 500 g: une mise à
  // l'échelle qui, en cherchant à agrandir, RETIRAIT 500 g de poulet et 117 g
  // de protéine. Le plancher restait ouvert à 144/156 alors que le facteur
  // n'était même pas borné.
  //
  // Les 500 g bornent une portion d'assiette absurde; ils n'ont aucun sens sur
  // un lot cuisiné pour quatre, où le kilo est le cas nominal.
  const r = scaleIngredients(
    [ing({ term: "chicken thighs", amount: 1000, unit: "g" })],
    1.32,
  );
  assertEquals(r.items[0].amount, 1000, "le lot sort INTACT, jamais tronqué");
  assertEquals(r.changed, 0);
  // ⚠️ ET IL N'EST PAS COMPTÉ COMME PLAFONNÉ: « le plafond a mordu » et « le
  // plafond a refusé de grandir » ne sont pas la même information, et la
  // seconde ne demande aucune action.
  assertEquals(r.capped, []);
});

Deno.test("les arrondis restent des portions, pas des pesées", () => {
  // Au-dessus de 20 g on arrondit à 5: « 137 g » n'est pas une portion.
  assertEquals(scaleIngredients([ing({ amount: 100 })], 1.37).items[0].amount, 135);
  // En dessous, à l'unité: arrondir 8 g d'huile à 10 le fausserait de 25 %.
  const oil = scaleIngredients([ing({ term: "olive oil", amount: 5, unit: "g" })], 1.6);
  assertEquals(oil.items[0].amount, 8);
});

Deno.test("désarmement: facteur 1 ⇒ rien ne bouge, copies identiques", () => {
  const src = [ing(), ing({ term: "rice", amount: 60 })];
  const r = scaleIngredients(src, 1);
  assertEquals(r.changed, 0);
  assertEquals(JSON.stringify(r.items), JSON.stringify(src));
  // Et l'entrée n'est jamais mutée.
  assertEquals(src[0].amount, 120);
});

// ---------------------------------------------------------------------------
// LA PART ÉCHELONNABLE — mesurée sur six générations réelles le 2026-08-11
// ---------------------------------------------------------------------------

Deno.test("le facteur vise la CIBLE, pas le total brut", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Les unités dénombrables ne bougent pas
  // (« 1 tortilla », « 1/2 avocat »). Appliquer le facteur brut aux seuls
  // pesables laissait l'écart ouvert: mesuré, un ×1,81 ne rendait que ×1,39
  // effectif, et le plan restait à 77 % de sa cible.
  const band = "energy" in PER_KG ? PER_KG.energy! : null;
  const target = (band!.low + band!.high) / 2;

  // 1600 kcal servis, dont 1000 échelonnables et 600 figés.
  const f = scaleFactorFor({
    computedKcal: 1600,
    scalableKcal: 1000,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 })!;
  assert(f !== null);
  // Après mise à l'échelle: 600 + 1000×f doit valoir la cible.
  assertEquals(Math.round(600 + 1000 * f), Math.round(target));

  // Et il est PLUS GRAND que le facteur brut, puisqu'il doit rattraper la
  // part figée.
  const brut = scaleFactorFor({ computedKcal: 1600, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 })!;
  assert(f > brut, `${f} devrait dépasser le facteur brut ${brut}`);
});

Deno.test("sans part échelonnable connue, le comportement d'avant est intact", () => {
  // Condition de désarmement: un appelant qui ne passe pas l'information
  // obtient exactement ce qu'il obtenait.
  const a = scaleFactorFor({ computedKcal: 1600, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  const b = scaleFactorFor({
    computedKcal: 1600, scalableKcal: undefined, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assertEquals(a, b);
});

Deno.test("la zone morte se juge sur le TOTAL, pas sur la part échelonnable", () => {
  // Sinon un plan déjà bon, mais dont peu d'ingrédients sont pesables, se
  // ferait réécrire pour rien — et ses quantités rondes abîmées.
  const band = "energy" in PER_KG ? PER_KG.energy! : null;
  const target = (band!.low + band!.high) / 2;
  assertEquals(
    scaleFactorFor({
      computedKcal: target, scalableKcal: target * 0.2, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 }),
    null,
  );
});

Deno.test("une part échelonnable nulle ne fait rien exploser", () => {
  // Tout en dénombrables: il n'y a rien à étirer. On retombe sur le facteur
  // brut plutôt que de diviser par zéro.
  const f = scaleFactorFor({
    computedKcal: 1600, scalableKcal: 0, envelope: PER_KG, daysCovered: 1, resolvedShare: 1 });
  assert(f !== null && Number.isFinite(f));
  assert(f >= MIN_SCALE && f <= MAX_SCALE);
});

// ---------------------------------------------------------------------------
// LES DEUX FACTEURS — le plancher protéique que le facteur unique n'atteint pas
// ---------------------------------------------------------------------------

Deno.test("la protéine grossit PLUS VITE que le reste", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Un facteur unique a ramené l'énergie à
  // 86-96 % de la cible, mais la protéine restait courte là où le plancher est
  // haut: 137 g pour 184 sur un homme de 92 kg en fat_loss.
  //
  // C'est arithmétique: `fat_loss` demande 2,0-2,7 g/kg dans une enveloppe
  // d'énergie RÉDUITE. Étirer tout le plat du même facteur monte l'énergie
  // aussi vite que la protéine — on touche la cible énergétique bien avant le
  // plancher, et on s'arrête là.
  const f = scaleFactorsFor({
    computedKcal: 1800,
    computedProteinG: 120,
    proteinFoodKcal: 600,
    otherScalableKcal: 900,
    proteinFoodProteinG: 110,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 })!;
  assert(f !== null);
  assert(
    f.protein > f.other,
    `la protéine devrait grossir plus vite: ${f.protein} vs ${f.other}`,
  );
  // ── ET ELLE VISE LE PLANCHER — sur la part QUI BOUGE ────────────────────
  // Cette assertion disait `120 × facteur ≈ plancher`, ce qui supposait que
  // TOUTE la protéine grossit. Elle ne grossit pas: `scaleIngredients` ne
  // touche que les lignes en g et ml, donc les 10 g portés ici par des
  // aliments non pesables (un œuf à l'unité, une tranche de pain) restent où
  // ils sont. L'ancienne formulation encodait le défaut qu'elle était censée
  // garder — et le run réel du 2026-08-12 l'a payé: plancher 156, plan monté
  // à 133 seulement, sur une mise à l'échelle qui se croyait terminée.
  const floor = "proteinFloorG" in PER_KG ? PER_KG.proteinFloorG : 0;
  const fixe = 120 - 110;
  assertEquals(Math.round(fixe + 110 * f.protein), Math.round(floor));
});

Deno.test("le facteur protéique tient compte de la protéine NON pesable", () => {
  // ── LE DÉFAUT MESURÉ EN RUN RÉEL (2026-08-12) ───────────────────────────
  // Recomposition 78 kg sur 5 jours: plancher 156 g, plan à 118 g, facteur
  // rendu ×1,32 — et la protéine n'est montée qu'à 133 g. Le plancher restait
  // ouvert de 23 g, ce qui est PIRE que de n'avoir rien fait: le plan a
  // grossi et manque toujours sa grandeur de rang 2.
  //
  // Ici, 90 g des 118 sont pesables et 28 ne le sont pas. Un facteur calculé
  // sur le total rendrait 184/118 = 1,56 et atterrirait à 168 g; le bon est
  // (184 − 28)/90 = 1,73, et il atterrit sur le plancher.
  const floor = "proteinFloorG" in PER_KG ? PER_KG.proteinFloorG : 0;
  const totalProt = 118;
  const scalableProt = 90;
  const f = scaleFactorsFor({
    computedKcal: 1843 * 5,
    computedProteinG: totalProt * 5,
    proteinFoodKcal: 500 * 5,
    otherScalableKcal: 900 * 5,
    proteinFoodProteinG: scalableProt * 5,
    envelope: PER_KG,
    daysCovered: 5,
    resolvedShare: 1,
  })!;
  assert(f !== null);
  // La grandeur qui compte n'est pas le facteur, c'est où atterrit la protéine.
  const apres = (totalProt - scalableProt) + scalableProt * f.protein;
  assertEquals(Math.round(apres), Math.round(floor));
  // ⚠️ LA CONTRE-ÉPREUVE: l'ancien calcul rendait 1,32 et atterrissait sous le
  // plancher. Sans cette assertion, un retour en arrière repasserait vert.
  assert(
    f.protein > floor / totalProt,
    `le facteur doit dépasser le naïf ${(floor / totalProt).toFixed(2)}: ${f.protein}`,
  );
});

Deno.test("le reste RECULE quand la protéine prend toute la place", () => {
  // C'est le comportement voulu, et c'est ce qui distingue une assiette
  // RECOMPOSÉE d'une assiette simplement plus grosse. Sans ça, servir le
  // plancher protéique ferait exploser l'énergie.
  const f = scaleFactorsFor({
    computedKcal: 2300,
    computedProteinG: 90,
    proteinFoodKcal: 500,
    otherScalableKcal: 1500,
    proteinFoodProteinG: 85,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 })!;
  assert(f.protein > 1.5, `protéine: ${f.protein}`);
  assert(f.other < 1, `le reste devrait reculer: ${f.other}`);
});

Deno.test("sans aliment protéique pesable, on retombe sur le facteur unique", () => {
  // Condition de désarmement: rien à différencier, donc rien de différent.
  const f = scaleFactorsFor({
    computedKcal: 1600,
    computedProteinG: 100,
    proteinFoodKcal: 0,
    otherScalableKcal: 1000,
    proteinFoodProteinG: 0,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 })!;
  assertEquals(f.protein, f.other);
});

Deno.test("sous le plancher TCA, AUCUN des deux facteurs n'existe", () => {
  assertEquals(
    scaleFactorsFor({
      computedKcal: 1600, computedProteinG: 100, proteinFoodKcal: 600,
      otherScalableKcal: 900, proteinFoodProteinG: 90,
      envelope: PER_PORTION, daysCovered: 1, resolvedShare: 1 }),
    null,
  );
});

Deno.test("`scaleIngredients` applique le BON facteur à chaque famille", () => {
  const isProtein = (t: string) => t === "chicken breast";
  const r = scaleIngredients(
    [ing({ term: "chicken breast", amount: 100 }), ing({ term: "rice", amount: 100 })],
    { protein: 2.0, other: 1.0 },
    isProtein,
  );
  assertEquals(r.items[0].amount, 200);
  assertEquals(r.items[1].amount, 100);

  // Sans classifieur, TOUT est traité comme « autre » — le comportement du
  // facteur unique, à l'identique.
  const noClassifier = scaleIngredients(
    [ing({ term: "chicken breast", amount: 100 })],
    { protein: 2.0, other: 1.0 },
  );
  assertEquals(noClassifier.items[0].amount, 100);
});

Deno.test("le plancher protéique n'est PAS gouverné par la zone morte d'énergie", () => {
  // LE DÉFAUT QUE CE TEST GARDE, et il est de hiérarchie. La première version
  // démarrait par « si l'énergie est dans la zone morte, ne rien faire » — donc
  // un plan à la bonne énergie mais à la moitié du plancher protéique repartait
  // intact. La protéine est la grandeur de RANG 2, celle qu'aucune doctrine ne
  // peut éteindre: une telle assiette doit être RECOMPOSÉE.
  const band = "energy" in PER_KG ? PER_KG.energy! : null;
  const target = (band!.low + band!.high) / 2;

  const f = scaleFactorsFor({
    computedKcal: target,          // énergie PARFAITE
    computedProteinG: 90,          // protéine à la moitié du plancher (184)
    proteinFoodKcal: 500,
    otherScalableKcal: 1500,
    proteinFoodProteinG: 85,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 });
  assert(f !== null, "un plancher protéique manqué doit déclencher une recomposition");
  assert(f!.protein > 1.5, `protéine: ${f!.protein}`);
  assert(f!.other < 1, `le reste doit reculer pour garder l'énergie: ${f!.other}`);

  // Et quand LES DEUX sont en ordre, on ne touche à rien.
  const ok = scaleFactorsFor({
    computedKcal: target,
    computedProteinG: 190,
    proteinFoodKcal: 500,
    otherScalableKcal: 1500,
    proteinFoodProteinG: 180,
    envelope: PER_KG,
    daysCovered: 1, resolvedShare: 1 });
  assertEquals(ok, null);
});

Deno.test("un plan qu'on ne sait pas LIRE ne se met jamais à l'échelle", () => {
  // LE DÉFAUT MESURÉ EN RUN RÉEL (2026-08-12), et c'est le plus dangereux du
  // module. Un plan résolu à 52 % a produit un facteur de ×2 et s'est fait
  // doubler — alors qu'à 52 %, l'énergie calculée est un SOUS-COMPTE: la
  // moitié des aliments n'est pas lue. Le plan était peut-être déjà à sa
  // cible, et on venait d'en faire une assiette de deux fois trop.
  //
  // Le verdict, lui, se contente de se TAIRE dans ce cas. La mise à l'échelle
  // AGIT — donc la même abstention lui est encore plus nécessaire.
  for (const share of [0, 0.3, 0.52, 0.79]) {
    assertEquals(
      scaleFactorFor({ computedKcal: 900, envelope: PER_KG, daysCovered: 1, resolvedShare: share }),
      null,
      `résolution ${share}: la mise à l'échelle ne doit pas agir`,
    );
    assertEquals(
      scaleFactorsFor({
        computedKcal: 900, computedProteinG: 40, proteinFoodKcal: 300,
        otherScalableKcal: 400, proteinFoodProteinG: 35,
        envelope: PER_KG, daysCovered: 1, resolvedShare: share,
      }),
      null,
      `résolution ${share}: les deux facteurs non plus`,
    );
  }
  // Au seuil, ça reprend — sinon on aurait remplacé un défaut par une garde morte.
  assert(
    scaleFactorFor({ computedKcal: 900, envelope: PER_KG, daysCovered: 1, resolvedShare: 0.8 }) !== null,
  );
});
