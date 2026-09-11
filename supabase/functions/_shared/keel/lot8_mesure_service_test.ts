/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 8 · LE BANC DE LA FAMILLE « MESURE/SERVICE »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, § Lot 8, ligne Mesure/service:
 *
 *   « riz cru/cuit, eau, préparation tirée plusieurs fois, recette très
 *     dense/peu dense, complément, arrondi, contenants partagés, modification
 *     finale réévaluée ; N = 1, 2, 4 et limite supportée. »
 *
 * ⛔ CE FICHIER NE DUPLIQUE RIEN. Ce qui était déjà tenu ailleurs le reste, et
 * c'est écrit ici pour qu'une prochaine session ne le réécrive pas:
 *
 *   · `preparation_energy_test.ts`  — l'énergie d'une casserole, l'eau, le
 *     plafond qui déplace la densité, l'abstention sans grammes;
 *   · `yield_factor_parity_test.ts` — les cinq lecteurs du rendement, dont
 *     `gramsRawOf` sur une quantité déclarée CUITE;
 *   · `box_densify_test.ts`         — `weighedReadyGrams`, l'eau du riz;
 *   · `portion_sizing_test.ts`      — la part ÷ tirages, la moyenne de la
 *     casserole, les bornes, le complément (bloc ⑬), le bac, LOT 10/12/13;
 *   · `generation_context_wiring_test.ts` — la remesure finale CÂBLÉE après le
 *     regrammage des casseroles.
 *
 * ⚠️ CE QUI EST ICI EST CE QUI MANQUAIT: la chaîne de bout en bout — on MESURE
 * une vraie recette par le référentiel, on la DIMENSIONNE, on l'APPLIQUE, puis
 * on la REMESURE. Chaque cas dit le défaut qu'il ferme, et aucun nombre n'est
 * recopié d'une sortie: ils sont tous dérivés au-dessus de leur assertion.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE BASE. Tests purs (§ 10 du plan).
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
} from "./food_composition.ts";
import {
  applySizing,
  applySizingForEaters,
  clampToBounds,
  drawsByPreparation,
  type PlateBounds,
  plateBoundsFor,
  PORTION_SIZING_MAX_MOUTHS,
  potFactorAcross,
  sizeDishForMouth,
  sizingPathFor,
  splitPlateWithComplement,
  type StandardPortion,
  standardPortionOf,
} from "./portion_sizing.ts";
import { weighedReadyGrams } from "./box_densify.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOR — un référentiel minuscule, mais dont chaque ligne dit pourquoi
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

const INDEX: CompositionIndex = buildCompositionIndex([
  // `grain_absorbs` (×2,6): la classe qui fait diverger la masse et l'énergie.
  ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350 }),
  // L'eau: 0 kcal, et un `foodGroupRef` que la règle d'absorption reconnaît.
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0 }),
  // 900 kcal/100 g: la recette TRÈS dense tient en une ligne.
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900 }),
  // 20 kcal/100 g et `veg_shrinks` (×0,9): la recette TRÈS peu dense.
  ref({ slug: "courgette", foodGroupRef: "non_starchy_veg", energyKcal: 20, yieldClass: "veg_shrinks" }),
], []);

/**
 * ⚠️ LA PROSE EST ÉCRITE AUSSI, comme le prompt l'exige (« say the same
 * quantity twice »). Un ingrédient sans `quantity` n'est pas le cas courant.
 */
function g(
  term: string,
  amount: number,
  state: "raw" | "cooked" | null = "raw",
): CompositionInput {
  return { term, quantity: `${amount} g`, amount, unit: "g", state };
}

/** La part standard d'un plat simple, mesurée par les fonctions de production. */
function part(
  ingredients: readonly CompositionInput[],
  uses: readonly { preparationId: string }[] = [],
  preparations: readonly { id: string; ingredients: readonly CompositionInput[] }[] = [],
  drawsByPrep: ReadonlyMap<string, number> = new Map(),
): StandardPortion {
  return standardPortionOf({
    index: INDEX,
    dish: { method: "bouillir", ingredients },
    uses,
    preparations,
    drawsByPrep,
  });
}

/** Les bornes d'un dîner d'adulte, pour une part de moment donnée. */
function bornes(slotTargetKcal: number | null): PlateBounds {
  return plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal,
    light: false,
    appetite: null,
  });
}

interface Box {
  id: string;
  memberIds: string[];
  items: { preparationId: string | null; term: string; grams: number }[];
}

const sommeBoite = (b: Box): number => b.items.reduce((a, i) => a + i.grams, 0);

// ═══════════════════════════════════════════════════════════════════════════
// ① RIZ CRU / RIZ CUIT — le ratio se compte contre le CRU, jamais l'assiette
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① 100 g de riz CRU et 260 g de riz CUIT sont la MÊME part", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME, ET IL A UN COMPTE: 130 lignes du référentiel
  // sont des lignes CUITES lues comme du cru. Lue comme du cru, la ligne « riz,
  // 260 g, cuit » vaudrait 260 × 2,6 = 676 g servis et 260 × 3,5 = 910 kcal —
  // deux fois et demie la part réelle, dans une assiette que personne ne
  // repèse.
  //
  // La conversion est celle de `gramsRawOf`: 260 ÷ 2,6 = 100 g crus. Donc
  // 350 kcal (100 × 3,5) et 260 g servis (100 × 2,6), exactement comme la
  // déclaration crue.
  const cru = part([g("rice", 100, "raw")]);
  const cuit = part([g("rice", 260, "cooked")]);
  assertEquals(cru.kcal, 350);
  assertEquals(cru.cookedG, 260);
  assertEquals(cru.densityPer100G, 134.6); // 350 ÷ 260 × 100, au dixième
  assertEquals(cuit.kcal, cru.kcal, "le riz cuit ne porte pas la même énergie");
  assertEquals(cuit.cookedG, cru.cookedG, "le riz cuit ne pèse pas la même chose");
  // ⛔ LA CONTRE-ÉPREUVE, ET C'EST ELLE QUI FAIT LA GARDE: lues comme du cru,
  // ces 260 g feraient 676 g et 910 kcal. Le moteur ne doit JAMAIS rendre ça.
  assert(cuit.cookedG !== 676, "260 g cuits ont été multipliés par le rendement");
  assert(cuit.kcal !== 910, "260 g cuits ont été comptés comme 260 g crus");
});

Deno.test("① un riz SANS ÉTAT ne se devine pas — et une huile n'a rien à deviner", () => {
  // ⛔ LE CAS QUI MORD. Sur une classe dont le rendement n'est pas 1,0, l'état
  // est la moitié de la quantité: « 260 g de riz » sans dire cru ou cuit peut
  // valoir 350 ou 910 kcal. `gramsRawOf` s'abstient, et la part avec elle.
  const sansEtat = part([{ term: "rice", quantity: "260 g", amount: 260, unit: "g", state: null }]);
  assertEquals(sansEtat.kcal, null, "un riz d'état inconnu a reçu une énergie");
  assertEquals(sansEtat.cookedG, null);
  assert(sansEtat.gaps.length > 0, "un trou sans nom se relit comme un trou qu'on n'a pas cherché");

  // ⚠️ ET LE CAS QUI PASSE, sans lequel la garde bloquerait tout et ressemblerait
  // à une garde qui marche: une huile est `neutral` (×1,0), cru et cuit y pèsent
  // pareil, donc l'état n'est pas exigé. 100 g ⇒ 900 kcal, 100 g servis.
  const huile = part([{ term: "oil", quantity: "100 g", amount: 100, unit: "g", state: null }]);
  assertEquals(huile.kcal, 900);
  assertEquals(huile.cookedG, 100);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② L'EAU — déjà dans le facteur de rendement, donc comptée une seule fois
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② l'eau d'un riz ne pèse rien — et sans cette règle le VERDICT bascule", () => {
  // ⛔ CE QUE LA RÈGLE COÛTE QUAND ELLE MANQUE, EN KCAL NON SERVIS. Mesuré sur
  // les plans réels du 2026-09-05: 4 casseroles de grain sur 13 listent leur eau
  // (1,7 à 3,7 L). `grain_absorbs` porte DÉJÀ cette eau dans les grammes prêts.
  //
  // La part: 100 g de riz + 200 g d'eau ⇒ 350 kcal, 260 g servis (l'eau est
  // exclue). Comptée deux fois, la masse serait 260 + 200 = 460 g.
  const vraie = part([g("rice", 100), g("water", 200)]);
  assertEquals(vraie.kcal, 350, "l'eau a porté de l'énergie");
  assertEquals(vraie.cookedG, 260, "l'eau a été ajoutée à la masse servie");
  assertEquals(weighedReadyGrams([g("rice", 100), g("water", 200)], INDEX), 260);

  // ⚠️ LA DÉMONSTRATION EST DANS LE VERDICT, PAS DANS LA MASSE. À 700 kcal de
  // cible, le facteur vaut 700 ÷ 350 = 2 dans les DEUX lectures — c'est
  // l'énergie qui le fixe. Ce qui change, c'est la masse jugée:
  //   · vraie   : 260 × 2 = 520 g, dans les bornes [250 ; 700];
  //   · comptée : 460 × 2 = 920 g, au-dessus ⇒ rabotée à 700 g.
  const b = bornes(700);
  assertEquals([b.min, b.max], [250, 700]);
  const juste = sizeDishForMouth({ standard: vraie, targetKcal: 700, bounds: b });
  assertEquals(juste.factor, 2);
  assertEquals(juste.personCookedG, 520);
  assertEquals(juste.verdict, "in_bounds");

  const douteuse: StandardPortion = { ...vraie, cookedG: 460, densityPer100G: 76.1 };
  const faux = sizeDishForMouth({ standard: douteuse, targetKcal: 700, bounds: b });
  assertEquals(faux.verdict, "over_max", "920 g devraient dépasser le plafond");
  const rabote = clampToBounds({ sized: faux, standard: douteuse, bounds: b });
  // facteur raboté = 700 ÷ 460 = 1,5217 ⇒ (2 − 1,5217) × 350 = 167 kcal perdues.
  assertEquals(rabote.personCookedG, 700);
  assertEquals(rabote.unmetKcal, 167);
});

Deno.test("② l'eau d'une SOUPE compte, elle — la règle ne déborde pas", () => {
  // ⚠️ LE CAS QUI PASSE DE LA MÊME GARDE. Sans grain absorbant, l'eau EST la
  // soupe: l'exclure partout ferait d'un bouillon de 770 g une assiette de
  // 270 g, et le moteur servirait trois fois ce qu'il faut pour l'atteindre.
  // 300 g de courgette (`veg_shrinks` ×0,9) ⇒ 270 g; + 500 g d'eau ⇒ 770 g.
  // Énergie: 300 × 0,20 = 60 kcal. Densité servie: 60 ÷ 770 × 100 = 7,8.
  const soupe = part([g("courgette", 300), g("water", 500)]);
  assertEquals(soupe.cookedG, 770, "l'eau de la soupe a été retirée de la masse");
  assertEquals(soupe.kcal, 60);
  assertEquals(soupe.densityPer100G, 7.8);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA CASSEROLE TIRÉE PLUSIEURS FOIS — le prorata, et sa conservation
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ ce que TOUS les plats tirent fait EXACTEMENT la casserole", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME: « Σ des facteurs » au lieu de leur moyenne
  // ferait cuisiner `n` fois trop, et la part standard divisée par les tirages
  // n'a de sens que si la casserole contient la somme des tirages. Les deux
  // moitiés du calcul n'ont jamais été éprouvées ENSEMBLE, sur un plan où les
  // plats n'ont PAS le même nombre de mangeurs.
  //
  // Le décor: une casserole de 400 g de riz + 800 g d'eau, tirée par deux
  // plats — un à UNE bouche, un à TROIS.
  //   prêt de la casserole  = 400 × 2,6 = 1 040 g (l'eau est dans le facteur)
  //   par tirage            = 1 040 ÷ 2 = 520 g
  //   plat A (1 mangeur)    = 520 × 1 =   520 g
  //   plat B (3 mangeurs)   = 520 × 3 = 1 560 g
  //   la casserole doit donc contenir 2 080 g prêts, soit un facteur 2.
  const meal = {
    dishes: [
      { day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] },
      { day: "tue", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] },
    ],
    preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 400), g("water", 800)] }],
  };
  assertEquals(weighedReadyGrams(meal.preparations[0].ingredients, INDEX), 1040);
  assertEquals(potFactorAcross([[1], [1, 1, 1]]), 2, "la casserole ne suit plus la moyenne des plats");
  // ⛔ LA CONTRE-ÉPREUVE: avec Σ, le facteur vaudrait 4 et la casserole
  // contiendrait 4 160 g — deux fois ce que la table mange.
  assert(potFactorAcross([[1], [1, 1, 1]]) !== 4, "la somme a remplacé la moyenne");

  const out = applySizingForEaters({
    meal,
    rows: [
      { dishIndex: 0, memberId: "a", factor: 1, sized: true },
      { dishIndex: 1, memberId: "a", factor: 1, sized: true },
      { dishIndex: 1, memberId: "b", factor: 1, sized: true },
      { dishIndex: 1, memberId: "c", factor: 1, sized: true },
    ],
    weighed: new Set<string>(),
    index: INDEX,
  });
  assertEquals(out.preparations[0].servingsMade, 2, "`servingsMade` n'est pas le nombre de tirages");
  assertEquals(weighedReadyGrams(out.preparations[0].ingredients, INDEX), 2080);
  const boites: Box[] = out.dishes.flatMap((d: { boxes?: Box[] }) => d.boxes ?? []);
  assertEquals(boites.map(sommeBoite), [520, 1560]);
  // ⛔ LA PROPRIÉTÉ, ÉCRITE EN UNE LIGNE: rien ne se perd, rien ne se crée.
  assertEquals(
    boites.reduce((a, b) => a + sommeBoite(b), 0),
    weighedReadyGrams(out.preparations[0].ingredients, INDEX),
    "la casserole et les contenants ne disent pas la même masse",
  );
});

Deno.test("③ un plat qui tire DEUX FOIS la même casserole reçoit DEUX parts", () => {
  // ⚠️ LE CAS QU'ON OUBLIE EN COMPTANT LES PLATS AU LIEU DES TIRAGES. Le nombre
  // de tirages est une propriété du PLAN (`drawsByPreparation` compte les
  // `uses`, pas les plats): une casserole citée deux fois par le même plat est
  // tirée deux fois, et ce plat reçoit la casserole ENTIÈRE.
  //   casserole = 300 g de riz ⇒ 1 050 kcal, 780 g prêts
  //   deux tirages ⇒ chaque tirage vaut 150 g crus ⇒ 525 kcal
  //   un plat qui en cite deux ⇒ 1 050 kcal, 780 g.
  const preparations = [{ id: "pot", ingredients: [g("rice", 300)] }];
  const deuxFois = drawsByPreparation([
    { uses: [{ preparationId: "pot" }, { preparationId: "pot" }] },
  ]);
  assertEquals(deuxFois.get("pot"), 2, "les tirages comptent les plats, pas les `uses`");
  const p = part([], [{ preparationId: "pot" }, { preparationId: "pot" }], preparations, deuxFois);
  assertEquals(p.kcal, 1050);
  assertEquals(p.cookedG, 780);

  // ⚠️ LA CONTRE-ÉPREUVE, sur le MÊME plan: un plat qui ne cite la casserole
  // qu'une fois n'en reçoit que la moitié.
  const uneFois = part([], [{ preparationId: "pot" }], preparations, deuxFois);
  assertEquals(uneFois.kcal, 525);
  assertEquals(uneFois.cookedG, 390);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ TRÈS PEU DENSE / TRÈS DENSE — la borne mord, et son prix est dit
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ une soupe à 7,8 kcal/100 g ne porte pas 700 kcal — et 645 se perdent", () => {
  // ⛔ CE QUE CE CAS INTERDIT: un plan « conforme » parce que son facteur
  // atteint la cible sur le papier. Le facteur vaut 700 ÷ 60 = 11,67, donc
  // 770 × 11,67 = 8 983 g de soupe — un seau. La borne raboté à 700 g, et le
  // PRIX de ce rabotage est 645 kcal que la personne ne mange pas.
  const soupe = part([g("courgette", 300), g("water", 500)]);
  const b = bornes(700);
  const sized = sizeDishForMouth({ standard: soupe, targetKcal: 700, bounds: b });
  assertEquals(sized.personCookedG, 8983); // 770 × 11,6667, arrondi
  assertEquals(sized.verdict, "over_max");
  // ⚠️ ET LA BORNE N'EST PAS APPLIQUÉE ICI: `sizeDishForMouth` rend le facteur
  // NU. Les fondre rendrait « la borne mord toujours » indistinguable de « la
  // borne ne mord jamais ».
  assertEquals(sized.unmetKcal, 0);

  const rabote = clampToBounds({ sized, standard: soupe, bounds: b });
  assertEquals(rabote.personCookedG, 700);
  // facteur raboté = 700 ÷ 770 = 0,9091 ⇒ (11,6667 − 0,9091) × 60 = 645 kcal.
  assertEquals(rabote.unmetKcal, 645);
  assertEquals(rabote.verdict, "over_max", "le verdict a été effacé par le rabotage");
});

Deno.test("④ 100 g d'huile portent la cible en 78 g — et le plancher SERT 1 550 kcal de plus", () => {
  // ⛔ LE SENS LE MOINS INTUITIF, ET IL EST DANS LES DEUX SENS. Sous le
  // plancher, la borne MONTE le facteur: une assiette de 78 g ne ressemble pas
  // à un dîner, donc on sert 250 g. Mais 250 g d'huile font 2 250 kcal pour une
  // cible de 700 — le prix est NÉGATIF, et il est énorme.
  //
  //   facteur nu = 700 ÷ 900 = 0,7778 ⇒ 78 g, sous les 250 g du plancher
  //   facteur raboté = 250 ÷ 100 = 2,5
  //   prix = (0,7778 − 2,5) × 900 = −1 550 kcal
  const dense = part([g("oil", 100)]);
  assertEquals(dense.densityPer100G, 900);
  const b = bornes(700);
  const sized = sizeDishForMouth({ standard: dense, targetKcal: 700, bounds: b });
  assertEquals(sized.personCookedG, 78);
  assertEquals(sized.verdict, "under_min");
  const rabote = clampToBounds({ sized, standard: dense, bounds: b });
  assertEquals(rabote.factor, 2.5);
  assertEquals(rabote.personCookedG, 250);
  assertEquals(rabote.unmetKcal, -1550, "le prix d'un plancher qui sert trop n'est pas compté");
  // ⚠️ CE QUE ÇA VEUT DIRE, ET POURQUOI IL EST COMPTÉ À PART: la personne reçoit
  // 2 250 kcal. Un compteur qui n'aurait que `unmetKcal ≥ 0` lirait « rien à
  // signaler » sur une assiette qui triple la cible.
  assertEquals(Math.round(rabote.factor * dense.kcal!), 2250);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES CONTENANTS PARTAGÉS — un bac déborde, ses PARTS non
// ═══════════════════════════════════════════════════════════════════════════

/** Le même plan à N bouches: une casserole de riz, un plat, N mangeurs. */
function planPourN(n: number) {
  return {
    meal: {
      dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] }],
      preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100), g("water", 200)] }],
    },
    rows: Array.from({ length: n }, (_, i) => ({
      dishIndex: 0,
      memberId: `m${i}`,
      factor: 1,
      sized: true,
    })),
  };
}

Deno.test("⑤ le bac de QUATRE pèse 1 040 g — et ce sont ses PARTS qui se contrôlent", () => {
  // ⛔ LA RÈGLE DU LOT 5, ÉCRITE EN TOUTES LETTRES DANS LE CHANTIER: « un
  // contenant de quatre personnes peut dépasser 700 g ; ce sont ses portions
  // individuelles qui se contrôlent ». Le défaut symétrique — juger le BAC
  // contre le plafond d'assiette — raboterait quatre parts justes parce qu'on
  // les a mises dans le même récipient.
  //
  //   la casserole: 100 g de riz + 200 g d'eau ⇒ 260 g prêts (l'eau est dedans)
  //   la part d'un mangeur à facteur 1 ⇒ 260 g, dans les bornes [250 ; 700]
  //   le bac de quatre ⇒ 260 × 4 = 1 040 g, bien au-dessus de 700.
  const { meal, rows } = planPourN(4);
  const out = applySizingForEaters({ meal, rows, weighed: new Set<string>(), index: INDEX });
  const boites: Box[] = out.dishes[0].boxes;
  assertEquals(boites.length, 1, "quatre bouches sans objectif partagent UN bac");
  assertEquals(boites[0].memberIds.length, 4);
  assertEquals(sommeBoite(boites[0]), 1040);
  assert(sommeBoite(boites[0]) > bornes(700).max, "le bac ne dépasse pas: le cas ne prouve rien");

  // ⚠️ ET LA PART INDIVIDUELLE, ELLE, EST DANS LES BORNES. C'est la moitié qui
  // compte: le bac déborde parce qu'il contient quatre parts, pas parce qu'une
  // part est trop grosse.
  const p = part([], [{ preparationId: "pot" }], meal.preparations, new Map([["pot", 1]]));
  const jugee = sizeDishForMouth({ standard: p, targetKcal: p.kcal, bounds: bornes(700) });
  assertEquals(jugee.personCookedG, 260);
  assertEquals(jugee.verdict, "in_bounds");
});

Deno.test("⑤ N = 1, 2, 4 et 12: la même part, un contenant qui suit", () => {
  // ⛔ LA LIMITE EST LUE, PAS SUPPOSÉE: `PORTION_SIZING_MAX_MOUTHS` vaut 12, et
  // c'est le dernier N que la lane dimensionne. Au-delà, le chemin se ferme —
  // un test qui s'arrêterait à 4 laisserait la borne haute sans épreuve.
  assertEquals(PORTION_SIZING_MAX_MOUTHS, 12);
  const porte = { merge: false, unmerge: false, compositionLoaded: true };
  assertEquals(sizingPathFor({ ...porte, platedMouths: PORTION_SIZING_MAX_MOUTHS }).path, "portion_v1");
  assertEquals(sizingPathFor({ ...porte, platedMouths: PORTION_SIZING_MAX_MOUTHS + 1 }).path, "legacy_measure");

  for (const n of [1, 2, 4, PORTION_SIZING_MAX_MOUTHS]) {
    const { meal, rows } = planPourN(n);
    const out = applySizingForEaters({ meal, rows, weighed: new Set<string>(), index: INDEX });
    const boites: Box[] = out.dishes[0].boxes;
    assertEquals(boites.length, 1, `N=${n}: un seul contenant attendu`);
    // ⛔ LA PART NE BOUGE PAS AVEC LA TABLE: 260 g par bouche, à 1 comme à 12.
    // Une moyenne servirait à quatre personnes le quart de ce qu'il leur faut.
    assertEquals(sommeBoite(boites[0]), 260 * n, `N=${n}: le contenant ne somme pas les parts`);
    assertEquals(boites[0].memberIds.length, n);
    // ⚠️ ET LA CASSEROLE SUIT: 100 g de riz × n.
    assertEquals(out.preparations[0].ingredients[0].amount, 100 * n, `N=${n}: la casserole`);
    assertEquals(weighedReadyGrams(out.preparations[0].ingredients, INDEX), 260 * n);
  }

  // ⚠️ À UNE BOUCHE, C'EST UNE BOÎTE À SON NOM, JAMAIS UN BAC D'UN. L'écran lit
  // `memberIds.length > 1` pour dire « partagé »: un bac d'un s'afficherait
  // comme un plat commun pour une personne seule.
  const { meal, rows } = planPourN(1);
  const seul: Box[] = applySizingForEaters({ meal, rows, weighed: new Set<string>(), index: INDEX })
    .dishes[0].boxes;
  assertEquals(seul[0].memberIds, ["m0"]);
  assert(!String(seul[0].id).endsWith("_tub"), "une personne seule a reçu un bac");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'ARRONDI — des grammes représentables, et des trous qui se nomment
// ═══════════════════════════════════════════════════════════════════════════

/** Le plan de référence: une casserole de riz, 10 g d'huile dans le plat. */
function planSimple() {
  return {
    dishes: [{
      day: "mon",
      slot: "dinner",
      uses: [{ preparationId: "pot" }],
      ingredients: [g("oil", 10)],
    }],
    preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100)] }],
  };
}

// deno-lint-ignore no-explicit-any
function remesure(m: { dishes: any[]; preparations: any[] }): StandardPortion {
  return standardPortionOf({
    index: INDEX,
    dish: m.dishes[0],
    uses: m.dishes[0].uses,
    preparations: m.preparations,
    drawsByPrep: drawsByPreparation(m.dishes),
  });
}

Deno.test("⑥ les grammes écrits sont ENTIERS, et ils somment la masse remesurée", () => {
  // ⛔ « L'ARRONDI FINAL DOIT PRODUIRE DES GRAMMES REPRÉSENTABLES » (§ lot 4).
  // Une balance de cuisine ne pèse pas 86,67 g: si le moteur écrit un décimal,
  // c'est la personne qui arrondit, et personne ne sait de combien.
  //
  // La part standard: 100 g de riz ⇒ 260 g prêts, 350 kcal; + 10 g d'huile ⇒
  // 10 g et 90 kcal. Total 270 g, 440 kcal.
  const avant = remesure(planSimple());
  assertEquals(avant.kcal, 440);
  assertEquals(avant.cookedG, 270);

  // ⚠️ LES FACTEURS FRACTIONNAIRES SONT LE POINT. À facteur 1 tout tombe juste,
  // et un arrondi cassé serait invisible.
  for (const f of [1 / 3, 0.37, 0.91, 1.6, 2.13]) {
    const out = applySizing({
      meal: planSimple(),
      memberId: "m",
      rows: [{ dishIndex: 0, factor: f, sized: true }],
      index: INDEX,
    });
    const items = (out.dishes[0].boxes[0] as Box).items;
    for (const i of items) {
      assert(Number.isInteger(i.grams), `f=${f}: « ${i.term} » vaut ${i.grams} g`);
      assert(i.grams > 0, `f=${f}: « ${i.term} » est écrit à zéro`);
    }
    // ⛔ ET LA SOMME DES ITEMS EST LA MASSE DU PLAN ÉCRIT. Chaque item est
    // arrondi séparément: sans cette épreuve, deux arrondis dans le même sens
    // feraient dériver le contenant de sa propre recette.
    const apres = remesure({ dishes: out.dishes, preparations: out.preparations });
    assertEquals(
      sommeBoite(out.dishes[0].boxes[0]),
      apres.cookedG,
      `f=${f}: le contenant et la recette ne pèsent pas pareil`,
    );
  }
});

Deno.test("⑥ ⛔ DÉFAUT ÉPINGLÉ — un FRAIS arrondi à zéro sort de la boîte SANS COMPTEUR", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CE N'EST PAS UNE ÉNERGIE PERDUE, C'EST UN TROU QUI NE SE DIT PAS.
  // ══════════════════════════════════════════════════════════════════════
  //
  // `applySizing` et `applySizingForEaters` écrivent chaque item à
  // `Math.round(prêt × facteur)`. Un item qui tombe sous 0,5 g est retiré de la
  // boîte. Les deux branches ne le disent PAS de la même façon:
  //
  //   · CASSEROLE : `if (grams <= 0) { counts.items_unresolved++; continue; }`
  //   · FRAIS     : `if (grams <= 0) continue;`            ← aucun compteur
  //
  // La recette, elle, garde l'ingrédient (`fresh_scaled` l'a multiplié): le
  // plat contient 0,4 g d'huile et sa boîte n'en parle pas. C'est exactement
  // la paire que ce module dit ne jamais vouloir — « l'un se voit dans un
  // compteur, l'autre sert ».
  //
  // ⚠️ CE QUE CE TEST FAIT: il épingle l'écart. Le jour où la branche du frais
  // compte comme sa jumelle, ce test ROUGIT, et c'est le signal — pas un bug.
  const fresh = {
    dishes: [{ day: "mon", slot: "dinner", uses: [], ingredients: [g("oil", 2), g("rice", 100)] }],
    preparations: [],
  };
  // 2 g d'huile × 0,2 = 0,4 g ⇒ arrondi à 0 ⇒ retiré.
  const petit = applySizing({
    meal: fresh,
    memberId: "m",
    rows: [{ dishIndex: 0, factor: 0.2, sized: true }],
    index: INDEX,
  });
  const items = (petit.dishes[0].boxes[0] as Box).items;
  assertEquals(items.map((i) => i.term), ["rice"], "l'huile est encore dans la boîte");
  assertEquals(petit.counts.fresh_scaled, 2, "les deux ingrédients ont bien été multipliés");
  // ⛔ LE DÉFAUT, EN UNE LIGNE: un item a disparu, et le compteur dit zéro.
  assertEquals(petit.counts.items_unresolved, 0, "⛔ DÉFAUT ÉPINGLÉ: le compteur parle enfin");

  // ⚠️ LA MÊME PERTE, DU CÔTÉ CASSEROLE, EST COMPTÉE. C'est ce qui prouve que
  // le silence du frais est un oubli et non une convention du module.
  const pot = {
    dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "p" }], ingredients: [g("rice", 100)] }],
    preparations: [{ id: "p", servingsMade: 1, ingredients: [g("oil", 2)] }],
  };
  const petitPot = applySizing({
    meal: pot,
    memberId: "m",
    rows: [{ dishIndex: 0, factor: 0.2, sized: true }],
    index: INDEX,
  });
  assertEquals((petitPot.dishes[0].boxes[0] as Box).items.map((i) => i.term), ["rice"]);
  assertEquals(petitPot.counts.items_unresolved, 1, "la branche casserole ne compte plus");

  // ⛔ ET C'EST VRAI DES DEUX ÉCRIVAINS, dont celui que la lane du foyer
  // emploie réellement à partir de deux bouches. Épingler le seul chemin solo
  // aurait laissé le chemin vivant sans épreuve.
  const aTable = applySizingForEaters({
    meal: fresh,
    rows: [
      { dishIndex: 0, memberId: "a", factor: 0.1, sized: true },
      { dishIndex: 0, memberId: "b", factor: 0.1, sized: true },
    ],
    weighed: new Set<string>(),
    index: INDEX,
  });
  // 2 g d'huile × 0,1 par part ⇒ 0,2 g ⇒ arrondi à 0 dans le bac.
  assertEquals((aTable.dishes[0].boxes[0] as Box).items.map((i) => i.term), ["rice"]);
  assertEquals(aTable.counts.items_unresolved, 0, "⛔ DÉFAUT ÉPINGLÉ, chemin de la table");
});

Deno.test("⑥ l'arrondi du COMPLÉMENT retombe exactement sur la borne, sur 206 cibles", () => {
  // ⛔ LE DÉFAUT QUE CE BALAYAGE CHERCHE: `splitPlateWithComplement` arrondit
  // SÉPARÉMENT la part partagée et l'entrée. Deux arrondis dans le même sens
  // donneraient 701 g sur une assiette bornée à 700 — un dépassement fabriqué
  // par l'arrondi lui-même, invisible sur un seul exemple.
  //
  // Le décor est celui du bloc ⑬: un plat dilué à 90 kcal/100 g, une entrée à
  // 300. gC = (cible − 700 × 0,9) ÷ (3 − 0,9), et gS = 700 − gC.
  // ⟳ 2026-09-11 · LOT B — `proteinG` EST NÉ SUR `StandardPortion` (pliage des
  // casseroles au prorata servi). Il vaut `null` ici parce que ce bloc ne
  // mesure QUE l'arrondi de la masse: écrire un gramme de protéine inventé
  // ferait croire que ce test en dit quelque chose.
  const dilue: StandardPortion = { kcal: 450, cookedG: 500, densityPer100G: 90, proteinG: null, pots: [], gaps: [] };
  const entree: StandardPortion = { kcal: 300, cookedG: 100, densityPer100G: 300, proteinG: null, pots: [], gaps: [] };
  const b = bornes(null);
  assertEquals([b.min, b.max], [250, 700]);

  let resolus = 0;
  for (let cible = 640; cible <= 2080; cible += 7) {
    const s = splitPlateWithComplement({
      shared: dilue,
      complement: entree,
      targetKcal: cible,
      bounds: b,
      verdict: "over_max",
    });
    assert(s !== null, `cible ${cible}: insoluble alors que l'entrée est plus dense`);
    resolus++;
    assertEquals(s.sharedG + s.complementG, b.max, `cible ${cible}: la somme rate la borne`);
    assert(s.sharedG > 0 && s.complementG > 0, `cible ${cible}: une part écrite à zéro`);
    assert(Number.isInteger(s.sharedG) && Number.isInteger(s.complementG), `cible ${cible}`);
  }
  assertEquals(resolus, 206);

  // ⚠️ ET LE CAS QUI MORD, dans le même geste: sous 630 kcal (700 × 0,9), il
  // n'y a rien à compléter et la fonction rend `null` — jamais « presque ».
  assertEquals(
    splitPlateWithComplement({
      shared: dilue,
      complement: entree,
      targetKcal: 600,
      bounds: b,
      verdict: "over_max",
    }),
    null,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA MODIFICATION FINALE RÉÉVALUÉE — mesurer, appliquer, REMESURER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ mesurer → appliquer → remesurer: la boucle se ferme", () => {
  // ⛔ LA PROMESSE DU CHANTIER: « le résultat mesuré doit être le payload
  // réellement enregistré ». Elle ne se démontre qu'en REMESURANT le plan écrit
  // avec la même fonction qui a décidé du facteur — comparer le facteur à
  // lui-même ne prouve rien.
  //
  // Part standard: 440 kcal, 270 g. À facteur f, le plan écrit doit peser
  // 270 × f et porter 440 × f.
  const avant = remesure(planSimple());
  assertEquals([avant.kcal, avant.cookedG], [440, 270]);
  for (const f of [0.5, 1, 1.6]) {
    const out = applySizing({
      meal: planSimple(),
      memberId: "m",
      rows: [{ dishIndex: 0, factor: f, sized: true }],
      index: INDEX,
    });
    const apres = remesure({ dishes: out.dishes, preparations: out.preparations });
    assert(
      Math.abs(apres.kcal! - 440 * f) <= 1,
      `f=${f}: le plan écrit porte ${apres.kcal} kcal au lieu de ${440 * f}`,
    );
    assertEquals(apres.cookedG, Math.round(270 * f), `f=${f}: la masse écrite`);
    // ⚠️ LA DENSITÉ NE BOUGE PAS: un regrammage proportionnel change la taille
    // de l'assiette, pas sa nature. C'est le cas NOMINAL, et il doit rendre
    // zéro dérive — sinon le compteur de dérive sonnerait sur tout.
    assertEquals(apres.densityPer100G, avant.densityPer100G, `f=${f}: la densité a dérivé`);
  }
});

Deno.test("⑦ ⛔ une mutation NON PROPORTIONNELLE rend FAUX le verdict d'avant", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE CAS QUI MORD, ET C'EST LUI QUI JUSTIFIE `portion_sizing.final`.
  // ══════════════════════════════════════════════════════════════════════
  //
  // La lane MESURE les plats, puis REGRAMME les casseroles (croissance,
  // rétrécissement d'identité, plafonds d'ingrédient), PUIS écrit la ligne.
  // Entre les deux, un ingrédient plafonné casse la proportionnalité: le
  // verdict inscrit décrit un plan qui n'existe plus.
  //
  // Ici: facteur 2 sur 100 g de riz + 10 g d'huile. Le plan écrit devrait
  // porter 880 kcal (440 × 2). Une garde d'ingrédient en aval replafonne
  // l'huile à 10 g ⇒ riz 200 g = 700 kcal, huile 10 g = 90 ⇒ 790 kcal.
  // 90 kcal d'écart, soit 10 % de l'assiette, annoncés comme servis.
  const out = applySizing({
    meal: planSimple(),
    memberId: "m",
    rows: [{ dishIndex: 0, factor: 2, sized: true }],
    index: INDEX,
  });
  const sansPlafond = remesure({ dishes: out.dishes, preparations: out.preparations });
  assertEquals(sansPlafond.kcal, 880);

  out.dishes[0].ingredients[0].amount = 10; // le plafond, en aval de la mesure
  out.dishes[0].ingredients[0].quantity = "10 g";
  const apresPlafond = remesure({ dishes: out.dishes, preparations: out.preparations });
  assertEquals(apresPlafond.kcal, 790, "le plafond n'a pas déplacé l'énergie: le cas ne prouve rien");
  assertEquals(sansPlafond.kcal! - apresPlafond.kcal!, 90);
  // ⛔ ET LA DENSITÉ AUSSI A BOUGÉ — c'est le signal que `pot_density_drifted`
  // cherche, et la raison pour laquelle une tolérance de 1 % le laisse passer
  // sur un regrammage proportionnel mais pas ici.
  assert(
    Math.abs(apresPlafond.densityPer100G! - sansPlafond.densityPer100G!) >
      sansPlafond.densityPer100G! * 0.01,
    "un plafond n'a pas déplacé la densité",
  );
});

Deno.test("⑦ appliquer n'ABÎME PAS le plan d'entrée — la remesure porte sur des copies", () => {
  // ⚠️ SANS CETTE PROPRIÉTÉ, LA REMESURE NE VEUT RIEN DIRE. Si `applySizing`
  // mutait son entrée, mesurer « avant » et « après » lirait deux fois le même
  // objet, et la boucle du cas ⑦ serait une tautologie verte.
  const entree = planSimple();
  const avant = JSON.stringify(entree);
  applySizing({
    meal: entree,
    memberId: "m",
    rows: [{ dishIndex: 0, factor: 3, sized: true }],
    index: INDEX,
  });
  assertEquals(JSON.stringify(entree), avant, "le plan d'entrée a été muté");
});
