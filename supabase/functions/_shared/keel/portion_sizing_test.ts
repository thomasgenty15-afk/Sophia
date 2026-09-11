import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  clampToBounds,
  dayTargetFor,
  RESTRICTION_FLOOR_SIZES_MAINTENANCE,
  drawsByPreparation,
  PLATE_MASS_BOUNDS_G,
  plateBandOf,
  plateBoundsFor,
  PORTION_SIZING_MAX_MOUTHS,
  sizeDishForMouth,
  sizeDishForEaters,
  lidPlanFor,
  potFactorAcross,
  HOUSEHOLD_MAX_MOUTHS,
  SHADOW_SIZING_AT_N,
  sizingCounters,
  applySizing,
  applySizingForEaters,
  potFactorOf,
  REPAIR_CALLS_PER_DISH,
  REPAIR_DENSITY_HEADROOM,
  REPAIR_MAX_DISHES_PER_PLAN,
  REPAIR_MIN_MASS_SURVIVAL,
  type RepairAsk,
  repairDecision,
  repairDecisionForDish,
  REPAIR_MINOR_NEVER_LIGHTEN,
  REPAIR_SHARED_LIGHTEN_REQUIRES_ALL,
  type SizingVerdict,
  repairIdentityHeld,
  dedicatedDishInstruction,
  MAX_ASKABLE_DENSITY_PER_100G,
  dedicatedRepairFor,
  potRepairability,
  repairabilityOf,
  repairInstruction,
  sizingPathFor,
  freshUnitOf,
  MISSING_PREPARATION_GAP,
  standardPortionOf,
  UNMEASURABLE_PORTION_FACTOR,
} from "./portion_sizing.ts";
import {
  // ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ dans le module du
  // contrat, avec un paramètre de plus: `rhythmSlots`, le rythme alimentaire
  // COMPLET de la bouche. Elle déduisait ce rythme de la GRILLE, ce qui donnait
  // la journée entière au dernier repas restant (facteur 2,86 mesuré).
  requiredDensityFor,
} from "./slot_nutrition_contract.ts";
import { weighedReadyGrams } from "./box_densify.ts";
import {
  type AnchorMouth,
  goalGapKcalOf,
  LIGHT_SLOT_WEIGHT,
  maintenanceKcalOf,
  MEAL_KCAL_PER_G_COMPOSED,
  MEAL_KCAL_PER_G_FLOOR,
  mouthTargetKcal,
  slotPlanTargets,
  SLOT_DAY_WEIGHT,
} from "./mouth_anchor.ts";
import { LIGHT_BEARING_SLOTS } from "./meal_extras.ts";

// ---------------------------------------------------------------------------
// UN RÉFÉRENTIEL MINIMAL, monté à la main
// ---------------------------------------------------------------------------
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
    ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350 }),
    ref({ slug: "chicken", foodGroupRef: "poultry", yieldClass: "meat_shrinks", energyKcal: 165 }),
    ref({ slug: "oil", foodGroupRef: "olive_oil", yieldClass: "neutral", energyKcal: 900 }),
  ],
  [{ alias: "riz", slug: "rice" }, { alias: "poulet", slug: "chicken" }, {
    alias: "huile",
    slug: "oil",
  }],
);
const g = (term: string, amount: number, state: "raw" | "cooked" = "raw") => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state,
});

// ═══════════════════════════════════════════════════════════════════════════
// ① LA GARDE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("la garde s'ouvre jusqu'au PLAFOND DE LA TABLE, et se ferme au-delà", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ BASCULE (2026-09-08) — CE TEST S'EST RETOURNÉ, IL N'A PAS DISPARU.
  // ══════════════════════════════════════════════════════════════════════
  // Sa rédaction d'origine disait « à UNE bouche, et se ferme partout
  // ailleurs »: c'était la vérité tant que le moteur ne savait dimensionner
  // qu'une personne. Depuis le 2026-09-08 il dimensionne la table, mesuré sur
  // deux foyers réels, et la borne est passée au plafond de la lane. Ce qui se
  // garde n'a pas changé — la porte s'ouvre SOUS la borne et se ferme AU-DESSUS
  // — mais la borne, elle, a bougé, et c'est une décision qui se commite.
  const base = { merge: false, unmerge: false, compositionLoaded: true };
  assertEquals(sizingPathFor({ ...base, platedMouths: 1 }), {
    path: "portion_v1",
    reason: "one_mouth",
  });
  assertEquals(sizingPathFor({ ...base, platedMouths: 4 }).path, "portion_v1");
  assertEquals(
    sizingPathFor({ ...base, platedMouths: PORTION_SIZING_MAX_MOUTHS }).path,
    "portion_v1",
  );
  // ⛔ ET ELLE SE FERME AU-DESSUS. Douze est le plafond de `servings` de la
  // lane: au-delà, on ne sait plus ce qu'on sert.
  assertEquals(sizingPathFor({ ...base, platedMouths: PORTION_SIZING_MAX_MOUTHS + 1 }), {
    path: "legacy_measure",
    reason: "several_mouths",
  });
  assertEquals(sizingPathFor({ ...base, platedMouths: 0 }).reason, "no_mouth");
  assertEquals(
    sizingPathFor({ ...base, platedMouths: 1, merge: true }).reason,
    "merge_requested",
  );
  assertEquals(
    sizingPathFor({ ...base, platedMouths: 1, unmerge: true }).reason,
    "unmerge_requested",
  );
  // ⛔ SANS COMPOSITION, RIEN NE SE DIMENSIONNE — et le motif le dit, plutôt
  // que de rendre un facteur 1 déguisé en mesure.
  assertEquals(
    sizingPathFor({ ...base, platedMouths: 1, compositionLoaded: false }).reason,
    "composition_unavailable",
  );
});

Deno.test("la borne est une CONSTANTE, et la baisser désarme tout", () => {
  // C'est le bouton de retour arrière du chantier: il doit se lire dans le
  // code, pas se déduire d'un `if`. La remettre à `1` referme le prompt v34,
  // les couvercles autorés et la réparation par mangeur, en une ligne.
  assertEquals(PORTION_SIZING_MAX_MOUTHS, 12);
  // ⚠️ ET IL VAUT LE PLAFOND DE LA LANE, pas un nombre à côté. `HOUSEHOLD_MAX_MOUTHS`
  // est le `Math.min(12, …)` de `presence.servings`, nommé: deux plafonds qui
  // divergeraient laisseraient un foyer armé que la lane ne sait pas servir.
  assertEquals(PORTION_SIZING_MAX_MOUTHS, HOUSEHOLD_MAX_MOUTHS);
  assert(
    sizingPathFor({
      platedMouths: PORTION_SIZING_MAX_MOUTHS + 1,
      merge: false,
      unmerge: false,
      compositionLoaded: true,
    }).path === "legacy_measure",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE PARTAGE DE LA JOURNÉE — le moment léger et le shaker
// ═══════════════════════════════════════════════════════════════════════════

const FOUR = ["breakfast", "lunch", "snack_pm", "dinner"];

Deno.test("sans rien de déclaré, les parts somment la cible du jour", () => {
  const r = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: FOUR,
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: null,
  });
  // ⟳ 2026-09-10 — AU KCAL PRÈS, ET C'EST LE LOT. Le retrait des extras (pain,
  // fromage, dessert pris hors plan) est supprimé: le plan dimensionne les
  // aliments qu'il prévoit, donc la somme des parts EST la cible du jour.
  assertEquals(Math.round(r.total), 2000);
  assertEquals(r.bySlot.size, 4);
  assertEquals(r.fixedCovered.size, 0);
});

Deno.test("LE DÎNER LÉGER: sa part baisse, les autres REPRENNENT la différence", () => {
  const args = {
    targetKcal: 2000,
    coveredSlots: FOUR,
    wholeSlots: FOUR,
    slotFixedKcal: null,
  };
  const plain = slotPlanTargets({ ...args, lightSlots: [] });
  const light = slotPlanTargets({ ...args, lightSlots: ["dinner"] });
  assert(light.bySlot.get("dinner")! < plain.bySlot.get("dinner")!);
  // ⛔ LE POINT DU LOT: un dîner léger ne fait pas maigrir la journée, il la
  // DÉPLACE. Les trois autres moments montent, et le total est le même.
  for (const s of ["breakfast", "lunch", "snack_pm"]) {
    assert(
      light.bySlot.get(s)! > plain.bySlot.get(s)!,
      `${s} devrait reprendre la différence`,
    );
  }
  assert(Math.abs(light.total - plain.total) < 1e-9, "la journée ne change pas de taille");
});

Deno.test("`lightSlots: []` rend un calcul OCTET-IDENTIQUE — la lane legacy", () => {
  // C'est la propriété qui autorise ce lot à exister sans toucher les foyers à
  // plusieurs bouches: quatre appelants legacy passent `[]`.
  const args = {
    targetKcal: 2100,
    coveredSlots: ["breakfast", "lunch", "dinner"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
    slotFixedKcal: null,
  };
  const a = slotPlanTargets({ ...args, lightSlots: [] });
  const b = slotPlanTargets({ ...args, lightSlots: ["snack_pm"] });
  // `snack_pm` n'est ni couvert ni déclaré: le marquer léger ne change RIEN.
  assertEquals(a.total, b.total);
  assertEquals([...a.bySlot.entries()].sort(), [...b.bySlot.entries()].sort());
});

Deno.test("la table de base n'est pas touchée, et elle somme encore 1,30", () => {
  // ⛔ `LIGHT_SLOT_WEIGHT` est une SECONDE table. Si un lot la fondait dans la
  // première, `dayCoverageOf`, le plafond de vraisemblance, `pot_demand` et le
  // bac changeraient tous les quatre pour la déclaration d'une personne.
  // ⚠️ 1,40 SUR SEPT CLÉS, PAS 1,30. Le plan de chantier écrivait 1,30 — il
  // comptait six moments et oubliait le jeton legacy `snack`, que la base
  // accepte encore sur un plat. La somme n'a d'ailleurs aucune raison de valoir
  // 1: `dayCoverageOf` en fait un RAPPORT (couvert / déclaré), jamais une
  // valeur absolue. Ce qui est épinglé ici, c'est qu'elle N'A PAS BOUGÉ.
  const sum = Object.values(SLOT_DAY_WEIGHT).reduce((a, b) => a + b, 0);
  assertEquals(Object.keys(SLOT_DAY_WEIGHT).length, 7);
  assertEquals(Math.round(sum * 100) / 100, 1.4);
  // Et les deux listes de moments légers sont d'accord.
  assertEquals(
    Object.keys(LIGHT_SLOT_WEIGHT).sort(),
    [...LIGHT_BEARING_SLOTS].sort(),
  );
  // Chaque poids léger est STRICTEMENT plus petit que son poids ordinaire.
  for (const [slot, w] of Object.entries(LIGHT_SLOT_WEIGHT)) {
    assert(
      w < SLOT_DAY_WEIGHT[slot as keyof typeof SLOT_DAY_WEIGHT],
      `${slot}: le poids léger doit être plus petit`,
    );
  }
});

Deno.test("LE SHAKER est retranché à SON moment, et nulle part ailleurs", () => {
  const args = {
    targetKcal: 2000,
    coveredSlots: FOUR,
    wholeSlots: FOUR,
    lightSlots: [],
  };
  const sans = slotPlanTargets({ ...args, slotFixedKcal: null });
  const avec = slotPlanTargets({
    ...args,
    slotFixedKcal: new Map([["snack_pm", 120]]),
  });
  assertEquals(
    Math.round(sans.bySlot.get("snack_pm")! - avec.bySlot.get("snack_pm")!),
    120,
  );
  for (const s of ["breakfast", "lunch", "dinner"]) {
    assertEquals(sans.bySlot.get(s), avec.bySlot.get(s), `${s} ne doit pas bouger`);
  }
  assertEquals(Math.round(sans.total - avec.total), 120);
});

Deno.test("⛔ L'APPORT FIXE EST RETRANCHÉ UNE FOIS, EN ENTIER, SANS PLANCHER", () => {
  // ⟳ 2026-09-10 — CE CAS REMPLACE « LE PLANCHER EST COMMUN AUX DEUX
  // RETRAITS ». Il n'y a plus qu'un retrait, et plus de plancher: la part à
  // composer est la soustraction, au kcal près.
  //
  // Un goûter de 2000 × 0,10/0,85 ≈ 235 kcal, un shaker de 120.
  const r = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: ["snack_pm"],
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: new Map([["snack_pm", 120]]),
  });
  const plein = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: ["snack_pm"],
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: null,
  });
  // ⛔ EXACTEMENT 120, PAS « AU MOINS 120 »: un plancher rendrait la différence
  // plus petite, et rien ne le dirait.
  assertEquals(
    Math.round(plein.bySlot.get("snack_pm")! - r.bySlot.get("snack_pm")!),
    120,
  );
  assertEquals(r.fixedCovered.size, 0, "120 tient dans la part du goûter");
});

Deno.test("⛔ UN APPORT FIXE QUI DÉBORDE NE FABRIQUE PAS UNE PORTION MINIMALE", () => {
  // ⛔ C'EST L'ÉTAT EXPLICITE QUI REMPLACE LE PLANCHER. 400 kcal de shaker sur
  // un goûter qui en vaut 235: il n'y a rien à composer, et le dire est le
  // travail de la fonction. Un plancher servirait ici un plat PAR-DESSUS une
  // boisson qu'on sait avalée.
  const r = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: ["snack_pm"],
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: new Map([["snack_pm", 400]]),
  });
  assertEquals(r.bySlot.get("snack_pm"), 0, "rien à composer, et pas un négatif");
  assert(r.fixedCovered.has("snack_pm"), "le moment doit être NOMMÉ");
  // ⚠️ `> 0` = CONFLIT: elle avale déjà plus que la part de sa journée. Le
  // nombre est rendu pour que l'appelant sache de combien.
  assert(r.fixedCovered.get("snack_pm")! > 0, "le dépassement se compte");
  assertEquals(r.total, 0);

  // Et « pile couvert » n'est PAS un conflit: la clé est là, le trop vaut 0.
  const part = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: ["snack_pm"],
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("snack_pm")!;
  const pile = slotPlanTargets({
    targetKcal: 2000,
    coveredSlots: ["snack_pm"],
    wholeSlots: FOUR,
    lightSlots: [],
    slotFixedKcal: new Map([["snack_pm", part]]),
  });
  assertEquals(pile.bySlot.get("snack_pm"), 0);
  assertEquals(pile.fixedCovered.get("snack_pm"), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA PART STANDARD
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DU PAIN DANS LA RECETTE COMPTE NORMALEMENT — 2026-09-10", () => {
  // ⚠️ LE CAS QUI PASSE À CÔTÉ DE LA SUPPRESSION DES EXTRAS, et sans lui « le
  // plan ne réserve plus d'énergie pour du pain » se relirait « le plan ne
  // compte plus le pain ». Les deux sont opposés: ce qui est SUPPRIMÉ est la
  // réservation pour un aliment pris HORS PLAN; un pain qui fait partie de la
  // recette est un ingrédient comme un autre, avec ses kcal et ses grammes.
  const index = buildCompositionIndex(
    [
      ref({ slug: "chicken", foodGroupRef: "poultry", yieldClass: "meat_shrinks", energyKcal: 165 }),
      ref({ slug: "white_bread", foodGroupRef: "refined_grain", energyKcal: 278 }),
      ref({ slug: "cheddar", foodGroupRef: "dairy_cheese", energyKcal: 399, carbsG: 0, fatG: 33.8 }),
    ],
    [{ alias: "pain", slug: "white_bread" }, { alias: "fromage", slug: "cheddar" }],
  );
  const sansPain = standardPortionOf({
    index,
    dish: { method: "rotir", ingredients: [g("chicken", 150)] },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  const avecPain = standardPortionOf({
    index,
    dish: {
      method: "rotir",
      ingredients: [g("chicken", 150), g("pain", 40), g("fromage", 30)],
    },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assert(sansPain.kcal !== null && avecPain.kcal !== null, "les deux se mesurent");
  // 40 g de pain à 278/100 = 111,2 ; 30 g de cheddar à 399/100 = 119,7 ⇒ 230,9.
  // ⚠️ UNE TOLÉRANCE D'UN KCAL, ET ELLE EST NOMMÉE: `standardPortionOf` arrondit
  // par ingrédient, donc la somme des deux forfaits et l'écart mesuré peuvent
  // différer d'une unité. Ce que ce cas garde est que les deux aliments PÈSENT
  // leur énergie, pas la troisième décimale.
  const ecart = avecPain.kcal! - sansPain.kcal!;
  assert(
    Math.abs(ecart - (278 * 0.40 + 399 * 0.30)) <= 1,
    `le pain et le fromage devraient ajouter ~231 kcal, mesuré ${ecart}`,
  );
  // Et les grammes suivent: rien n'est retiré de l'assiette.
  assert(
    (avecPain.cookedG ?? 0) > (sansPain.cookedG ?? 0),
    "le pain et le fromage doivent peser dans la part",
  );
});

Deno.test("100 g de riz CRU pèsent 260 g cuits, à kcal ÉGALES", () => {
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "bouillir", ingredients: [g("riz", 100)] },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assertEquals(p.kcal, 350);
  assertEquals(p.cookedG, 260);
  // La densité est celle de l'ASSIETTE, pas celle du sac de riz.
  assertEquals(p.densityPer100G, 134.6);
});

Deno.test("la part standard = LE FRAIS + LA CASSEROLE ÷ SES TIRAGES", () => {
  const preparations = [{ id: "pot", ingredients: [g("riz", 400)] }];
  const dishes = [
    { uses: [{ preparationId: "pot" }] },
    { uses: [{ preparationId: "pot" }] },
    { uses: [{ preparationId: "pot" }] },
    { uses: [{ preparationId: "pot" }] },
  ];
  const draws = drawsByPreparation(dishes);
  assertEquals(draws.get("pot"), 4);
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "servir", ingredients: [g("huile", 10)] },
    uses: [{ preparationId: "pot" }],
    preparations,
    drawsByPrep: draws,
  });
  // 400 g de riz ÷ 4 tirages = 100 g ⇒ 350 kcal, + 10 g d'huile ⇒ 90 kcal.
  assertEquals(p.kcal, 440);
  assertEquals(p.pots, [{ id: "pot", draws: 4 }]);
});

Deno.test("⛔ UNE CASSEROLE CITÉE MAIS ABSENTE rend le plat IMMESURABLE, et le dit", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR `IDENTITE` DU 2026-09-08 (foyer `quatre`)
  // ══════════════════════════════════════════════════════════════════════
  //
  // `if (!prep) continue;` sautait la casserole absente et mesurait le plat sur
  // ce qui restait — son frais seul. Après une réparation acceptée,
  // `mergeRetryCells` renomme les casseroles réécrites et des plats citaient un
  // identifiant disparu: le déjeuner « faisait » l'énergie de sa cuillère
  // d'huile.
  //
  // ⚠️ LA BONNE RÉPONSE EST `null`, PAS UN CHIFFRE PLAUSIBLE. Un plat dont on
  // ignore le contenu principal n'a pas d'énergie connue, et le moteur doit le
  // savoir pour s'abstenir au lieu de servir une part calculée sur un tiers de
  // l'assiette.
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "servir", ingredients: [g("huile", 10)] },
    uses: [{ preparationId: "pot_disparu" }],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assertEquals(p.kcal, null, "un plat au contenu inconnu rend une énergie");
  assert(
    p.gaps.includes(MISSING_PREPARATION_GAP),
    "le trou n'est pas nommé: `unmeasurable_by` resterait muet",
  );

  // ⛔ ET LA MÊME RECETTE AVEC SA CASSEROLE SE MESURE, sinon la garde
  // refuserait tout et ressemblerait à une garde qui marche.
  const ok = standardPortionOf({
    index: INDEX,
    dish: { method: "servir", ingredients: [g("huile", 10)] },
    uses: [{ preparationId: "pot" }],
    preparations: [{ id: "pot", ingredients: [g("riz", 100)] }],
    drawsByPrep: new Map([["pot", 1]]),
  });
  assertEquals(ok.kcal, 440);
  assertEquals(ok.gaps.length, 0);
});

Deno.test("⛔ IMMESURABLE SANS RAISON N'EXISTE PAS — le trou porte toujours un nom", () => {
  // Mesuré au même tir: huit assiettes `unmeasurable` et `unmeasurable_by: {}`.
  // Le compteur qui sert précisément à dire POURQUOI était vide, et un lecteur
  // y voyait « rien à signaler ».
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "servir", ingredients: [g("aliment_inconnu_du_referentiel", 200)] },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assertEquals(p.kcal, null);
  assert(p.gaps.length > 0, "une énergie absente sans trou nommé");
});

Deno.test("⛔ `servings_made` N'EST PAS LA SOURCE — le nombre de TIRAGES l'est", () => {
  // Mesuré faux sur les plans réels: `servings: 1` sur des pots que quinze
  // plats tirent. La casserole entière serait attribuée à chaque assiette.
  const preparations = [{ id: "pot", servings_made: 1, ingredients: [g("riz", 400)] }];
  const draws = drawsByPreparation([
    { uses: [{ preparationId: "pot" }] },
    { uses: [{ preparationId: "pot" }] },
  ]);
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "", ingredients: [] },
    uses: [{ preparationId: "pot" }],
    preparations,
    drawsByPrep: draws,
  });
  // 400 ÷ 2 = 200 g de riz ⇒ 700 kcal. Avec `servings_made: 1` on aurait lu 1400.
  assertEquals(p.kcal, 700);
});

Deno.test("un plat qu'on ne sait pas peser rend `null`, jamais une somme amputée", () => {
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "", ingredients: [g("licorne", 100)] },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assertEquals(p.kcal, null);
  assert(p.gaps.length > 0, "le motif est nommé");
});

Deno.test("⛔ AUCUN TERME NEUF EN SORTIE — l'invariant du chantier", () => {
  // Le module MULTIPLIE ce que le modèle a écrit. Il n'ajoute jamais un
  // aliment: un plat trop léger se répare en le rendant plus dense, pas en y
  // glissant une cuillère d'huile que personne n'a demandée.
  const entree = ["riz", "poulet"];
  const p = standardPortionOf({
    index: INDEX,
    dish: { method: "", ingredients: [g("riz", 80), g("poulet", 120)] },
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assert(p.kcal !== null);
  // La sortie ne porte que des agrégats — aucune liste d'ingrédients n'en sort.
  //
  // ⟳ 2026-09-11 · LOT B — `proteinG` REJOINT LA LISTE, ET L'INVARIANT TIENT.
  // Ce test épingle une PROPRIÉTÉ (« aucun terme ne sort d'ici »), pas un
  // nombre de champs: la protéine d'une part est un agrégat exactement comme
  // `kcal` et `cookedG`, elle ne nomme aucun aliment. Elle est ajoutée parce
  // que le pliage des casseroles au prorata servi est ce qui sépare 111 g/jour
  // de 167 (`preparations-must-be-folded-into-dishes`), et parce qu'un plancher
  // protéique sans mesure à comparer est une garde désarmée.
  assertEquals(Object.keys(p).sort(), [
    "cookedG",
    "densityPer100G",
    "gaps",
    "kcal",
    "pots",
    "proteinG",
  ]);
  assertEquals(entree.length, 2);
});

Deno.test("le module est DÉTERMINISTE, et n'abîme pas son entrée", () => {
  const dish = { method: "bouillir", ingredients: [g("riz", 100)] };
  const avant = JSON.stringify(dish);
  const a = standardPortionOf({
    index: INDEX,
    dish,
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  const b = standardPortionOf({
    index: INDEX,
    dish,
    uses: [],
    preparations: [],
    drawsByPrep: new Map(),
  });
  assertEquals(a, b);
  assertEquals(JSON.stringify(dish), avant);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES BORNES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("les bornes d'un ENFANT ne sont pas celles d'un adulte", () => {
  const adulte = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });
  const enfant = plateBoundsFor({ ageYears: 9, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });
  assertEquals(adulte.band, "adult");
  assertEquals(enfant.band, "child");
  assert(enfant.max < adulte.max && enfant.min < adulte.min);
  // ⛔ LA CICATRICE: `8 g/kg` donnait 288 g à une enfant de 36 kg. Le plafond
  // d'un enfant de 9 ans doit laisser passer un vrai dîner.
  assert(enfant.max >= 450, "le plafond enfant ne doit pas raboter un vrai dîner");
});

Deno.test("l'âge INCONNU retombe sur adulte, et la SOURCE le dit", () => {
  const b = plateBoundsFor({ ageYears: null, slot: "lunch", slotTargetKcal: null, light: false, appetite: null });
  assertEquals(b.band, "adult");
  assertEquals(b.source, "age_unknown");
  // ⛔ Le repli va vers la borne la plus LARGE: se tromper vers l'enfant
  // raboterait l'assiette d'un adulte, et c'est le sens d'erreur que ce
  // chantier existe pour fermer.
  assertEquals(b.max, PLATE_MASS_BOUNDS_G.adult.meal.max);
  assertEquals(plateBoundsFor({ ageYears: 35, slot: "lunch", slotTargetKcal: null, light: false, appetite: null }).source, "age_known");
  assertEquals(plateBandOf(null), { band: "adult", known: false });
});

Deno.test("une COLLATION n'a pas les bornes d'un repas", () => {
  const repas = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });
  const gouter = plateBoundsFor({ ageYears: 35, slot: "snack_pm", slotTargetKcal: null, light: false, appetite: null });
  assertEquals(repas.slotClass, "meal");
  assertEquals(gouter.slotClass, "snack");
  // ⚠️ ET PAS « une collation reste sous le plancher d'un repas »: 300 g de
  // goûter dépassent les 250 g de plancher d'un dîner, et c'est JUSTE — un
  // grand bol de fruits et de yaourt pèse plus qu'une petite assiette. Ce qui
  // doit tenir, c'est que les deux BORNES d'une collation sont plus basses que
  // celles d'un repas.
  assert(gouter.max < repas.max, "le plafond d'une collation est plus bas");
  assert(gouter.min < repas.min, "le plancher d'une collation est plus bas");
});

// ⟳ 2026-09-10 — CE QUI VIVAIT ICI: « l'appétit module LES DEUX bornes ». Il ne
// les module plus, et ce n'est pas un retrait — c'est un DÉPLACEMENT vers le
// seul point où un cran s'applique (`estimatedMaintenanceKcal`). Le test qui le
// prouve de bout en bout est dans `one_target_per_person_test.ts`: `large` doit
// bouger la cible ET le plafond de grammes, sur les DEUX lanes.

Deno.test("la bande de grammes DESCEND de la part kcal du moment", () => {
  const petit = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 300, light: false, appetite: null });
  const gros = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 600, light: false, appetite: null });
  // ⛔ LE PLAFOND SUIT LA PART, ET IL LA SUIT PROPORTIONNELLEMENT: c'est la
  // règle de `mealMassCapFor` — « le plus gros repas plausible pèse ce que
  // porte son énergie à la densité la plus basse qu'on accepte ».
  assertEquals(petit.max, Math.round(300 / MEAL_KCAL_PER_G_FLOOR));
  assertEquals(gros.max, Math.round(600 / MEAL_KCAL_PER_G_FLOOR));
  assertEquals(petit.boundSource, "target");
  assertEquals(gros.boundSource, "target");
});

Deno.test("la table d'âge reste un GARDE-FOU: elle rabat, elle ne source pas", () => {
  // Une part énorme sur un seul repas: l'arithmétique demanderait 1,2 kg
  // d'assiette. La capacité d'estomac de la tranche d'âge rabat, et le compteur
  // le DIT — sans lui, « la table ne mord jamais » et « la table mord partout »
  // rendraient le même objet.
  const enorme = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 1200, light: false, appetite: null });
  assertEquals(enorme.max, PLATE_MASS_BOUNDS_G.adult.meal.max);
  assertEquals(enorme.boundSource, "table");
  // Et sur un enfant, la même part rabat plus tôt — c'est tout l'objet du
  // garde-fou.
  const enfant = plateBoundsFor({ ageYears: 9, slot: "dinner", slotTargetKcal: 1200, light: false, appetite: null });
  assertEquals(enfant.max, PLATE_MASS_BOUNDS_G.child.meal.max);
  assertEquals(enfant.boundSource, "table");
});

Deno.test("SANS part lisible, la table est la SEULE source — le nombre d'avant", () => {
  const b = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });
  assertEquals(b.min, PLATE_MASS_BOUNDS_G.adult.meal.min);
  assertEquals(b.max, PLATE_MASS_BOUNDS_G.adult.meal.max);
  assertEquals(b.boundSource, "no_target");
  // ⛔ ET `0` COMPTE COMME ABSENT, pas comme « zéro gramme ». Une part nulle
  // rendrait un plafond de 0 g, c'est-à-dire une assiette vide servie comme une
  // décision.
  assertEquals(
    plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 0, light: false, appetite: null }).boundSource,
    "no_target",
  );
});

Deno.test("le PLANCHER ne monte jamais au-dessus de la table", () => {
  // ⛔ LE SENS LE MOINS INTUITIF, ET IL EST LA GARDE. `clampToBounds` fait
  // MONTER une assiette sous le plancher (`under_min` ⇒ on sert PLUS que la
  // cible). Un plancher dérivé au-dessus des 250 g de la table forcerait donc à
  // servir plus que la cible à toute assiette un peu dense — c'est-à-dire à
  // défaire, par la borne, le dimensionnement qu'on vient de calculer.
  const gros = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 900, light: false, appetite: null });
  assert(900 / MEAL_KCAL_PER_G_COMPOSED > PLATE_MASS_BOUNDS_G.adult.meal.min);
  assertEquals(gros.min, PLATE_MASS_BOUNDS_G.adult.meal.min);
  // Sur une petite part, c'est la dérivée qui gagne — et c'est ce qui protège
  // un goûter d'être gonflé jusqu'au plancher d'un repas.
  const petit = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 200, light: false, appetite: null });
  assertEquals(petit.min, Math.round(200 / MEAL_KCAL_PER_G_COMPOSED));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE DIMENSIONNEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ⟳ 2026-09-11 · LOT B — `proteinG` EST NÉ SUR `StandardPortion`. Ces décors
// mesurent des GRAMMES et des kcal; écrire un gramme de protéine inventé
// ferait croire qu'ils en disent quelque chose, donc `null`.
const STD = { kcal: 500, cookedG: 400, densityPer100G: 125, proteinG: null, pots: [], gaps: [] };
const BOUNDS = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });

Deno.test("facteur = cible ÷ kcal, et les grammes suivent", () => {
  const s = sizeDishForMouth({ standard: STD, targetKcal: 750, bounds: BOUNDS });
  assertEquals(s.factor, 1.5);
  assertEquals(s.personCookedG, 600);
  assertEquals(s.verdict, "in_bounds");
  // La densité ne bouge PAS: multiplier une recette ne la rend ni plus ni moins
  // dense. `grammes = cible ÷ densité` doit se retrouver.
  assertEquals(Math.round(750 / (STD.densityPer100G / 100)), 600);
});

Deno.test("un plat non mesurable est servi TEL QUEL, et c'est compté", () => {
  const s = sizeDishForMouth({
    standard: { ...STD, kcal: null },
    targetKcal: 750,
    bounds: BOUNDS,
  });
  assertEquals(s.factor, UNMEASURABLE_PORTION_FACTOR);
  assertEquals(s.verdict, "unmeasurable");
  // ⛔ Ni zéro (qui retirerait le plat) ni une moyenne (qui inventerait).
  assertEquals(UNMEASURABLE_PORTION_FACTOR, 1);
  // Une cible absente ferme aussi — un plancher TCA, par exemple.
  assertEquals(
    sizeDishForMouth({ standard: STD, targetKcal: null, bounds: BOUNDS }).verdict,
    "unmeasurable",
  );
});

Deno.test("hors bornes: le verdict est rendu, et la borne n'est PAS appliquée", () => {
  // ⛔ Les deux gestes sont séparés pour qu'on puisse compter combien de fois
  // la borne mord. Une borne qui mord toujours ressemble à une borne qui ne
  // mord jamais si personne ne compte.
  const gros = sizeDishForMouth({ standard: STD, targetKcal: 1200, bounds: BOUNDS });
  assertEquals(gros.verdict, "over_max");
  assertEquals(gros.personCookedG, 960, "le facteur nu est rendu tel quel");
  assertEquals(gros.unmetKcal, 0, "rien n'est encore raboté");

  const borne = clampToBounds({ sized: gros, standard: STD, bounds: BOUNDS });
  assertEquals(borne.personCookedG, BOUNDS.max);
  assert(borne.unmetKcal > 0, "le prix de la borne est dit à voix haute");
  // 700 g au lieu de 960 ⇒ facteur 1,75 au lieu de 2,4 ⇒ 325 kcal non servies.
  assertEquals(borne.unmetKcal, 325);
});

Deno.test("sous le plancher, la borne MONTE le facteur et le prix est NÉGATIF", () => {
  const petit = sizeDishForMouth({ standard: STD, targetKcal: 200, bounds: BOUNDS });
  assertEquals(petit.verdict, "under_min");
  const borne = clampToBounds({ sized: petit, standard: STD, bounds: BOUNDS });
  assertEquals(borne.personCookedG, BOUNDS.min);
  // On sert PLUS que la cible: une assiette sous le plancher ne ressemble pas
  // à un repas. Le signe dit dans quel sens la borne a poussé.
  assert(borne.unmetKcal < 0, "servir plus que la cible se compte NÉGATIF");
});

Deno.test("un plat in_bounds ou non mesurable traverse la borne sans bouger", () => {
  const ok = sizeDishForMouth({ standard: STD, targetKcal: 750, bounds: BOUNDS });
  assertEquals(clampToBounds({ sized: ok, standard: STD, bounds: BOUNDS }), ok);
  const nm = sizeDishForMouth({ standard: { ...STD, kcal: null }, targetKcal: 750, bounds: BOUNDS });
  assertEquals(clampToBounds({ sized: nm, standard: { ...STD, kcal: null }, bounds: BOUNDS }), nm);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES COMPTEURS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("tous les compteurs existent à ZÉRO — absent ≠ zéro", () => {
  const c = sizingCounters();
  assertEquals(c.dishes, 0);
  assertEquals(c.measured, 0);
  assertEquals(c.verdicts, { in_bounds: 0, over_max: 0, under_min: 0, unmeasurable: 0 });
  assertEquals(c.bounds_source, { age_known: 0, age_unknown: 0 });
  assertEquals(c.clamped, { max: 0, min: 0 });
  assertEquals(c.unmet_band, { lt_200: 0, gte_200: 0 });
  // ⛔ Les quatre verdicts sont TOUS présents. Un journal où `over_max`
  // n'apparaît que lorsqu'il est non nul ne permet pas de distinguer « aucun
  // plat n'a débordé » de « le comptage n'est pas branché ».
  assertEquals(Object.keys(c.verdicts).length, 4);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ L'APPLICATION — lot 4
// ═══════════════════════════════════════════════════════════════════════════

const ing = (term: string, amount: number) => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state: "raw" as const,
  gramsRaw: amount,
  in_pantry: false,
  quantitySource: "structured",
  part: null,
  group: null,
});

function plan() {
  return {
    dishes: [
      {
        day: "mon",
        slot: "lunch",
        title: "Riz au poulet",
        method: "servir",
        ingredients: [ing("huile", 10)],
        uses: [{ preparationId: "pot" }],
        boxes: [],
      },
      {
        day: "mon",
        slot: "dinner",
        title: "Le même, le soir",
        method: "servir",
        ingredients: [ing("huile", 10)],
        uses: [{ preparationId: "pot" }],
        boxes: [],
      },
    ],
    preparations: [
      { id: "pot", title: "Riz cuit", servingsMade: 1, ingredients: [ing("riz", 200)] },
    ],
  };
}

Deno.test("⛔ LE FACTEUR D'UNE CASSEROLE EST LA MOYENNE, PAS LA SOMME", () => {
  // La démonstration, et l'erreur d'un facteur `n` que le plan de chantier
  // portait: la recette `R` sert `n` tirages, un tirage vaut `R/n`, le plat `i`
  // en réclame `(R/n)×fᵢ`, donc la casserole doit contenir `R × (Σfᵢ)/n`.
  assertEquals(potFactorOf([1, 1, 1]), 1, "trois plats à facteur 1 ⇒ la recette");
  assertEquals(potFactorOf([2, 2]), 2, "tous à 2 ⇒ deux fois la recette");
  assertEquals(potFactorOf([1, 3]), 2, "la moyenne, pas 4");
  assertEquals(potFactorOf([]), 1, "aucun tirage ⇒ rien à multiplier");
});

Deno.test("appliquer: le frais est multiplié, la casserole aussi, les portions réécrites", () => {
  const p = plan();
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: p,
    rows: [
      { dishIndex: 0, factor: 2, sized: true },
      { dishIndex: 1, factor: 1, sized: true },
    ],
  });
  // Frais: 10 g d'huile × 2 au déjeuner, × 1 au dîner.
  assertEquals(out.dishes[0].ingredients[0].amount, 20);
  assertEquals(out.dishes[1].ingredients[0].amount, 10);
  // Casserole: (2 + 1) / 2 = 1,5 ⇒ 200 g de riz deviennent 300.
  assertEquals(out.preparations[0].ingredients[0].amount, 300);
  // ⛔ `servingsMade` DEVIENT LE NOMBRE DE TIRAGES, jamais ce que le modèle a
  // écrit (`1`, sur un pot que deux plats tirent).
  assertEquals(out.preparations[0].servingsMade, 2);
  assertEquals(out.counts.servings_rewritten, 1);
  assertEquals(out.counts.pots_scaled, 1);
  assertEquals(out.counts.boxes_authored, 2);
});

Deno.test("appliquer: la boîte est une PRESCRIPTION — un seul nom, des items", () => {
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: plan(),
    rows: [
      { dishIndex: 0, factor: 1, sized: true },
      { dishIndex: 1, factor: 1, sized: true },
    ],
  });
  const box = out.dishes[0].boxes[0];
  assertEquals(box.memberIds, ["m-solo"], "un seul nom: le contenant EST sa portion");
  assertEquals(box.legacyTotalGrams, null, "le total se DÉRIVE des items");
  assertEquals(box.id, "box_mon_lunch_0");
  // Un item par casserole tirée, un par ingrédient frais résolu.
  assertEquals(box.items.length, 2);
  const pot = box.items.find((i: { preparationId: string | null }) => i.preparationId === "pot")!;
  // 200 g de riz cru ⇒ 520 g cuits, ÷ 2 tirages = 260 g par part, × 1.
  assertEquals(pot.grams, 260);
  const frais = box.items.find((i: { preparationId: string | null }) => i.preparationId === null)!;
  assertEquals(frais.term, "huile");
  assertEquals(frais.grams, 10);
  // Les deux boîtes ont des ids DIFFÉRENTS — deux couvercles du même nom dans
  // un frigo est le défaut que l'unicité existe pour empêcher.
  assert(out.dishes[0].boxes[0].id !== out.dishes[1].boxes[0].id);
});

Deno.test("appliquer: la boîte suit le facteur, et la somme des parts fait la casserole", () => {
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: plan(),
    rows: [
      { dishIndex: 0, factor: 2, sized: true },
      { dishIndex: 1, factor: 1, sized: true },
    ],
  });
  const part = (n: number) =>
    out.dishes[n].boxes[0].items.find((i: { preparationId: string | null }) =>
      i.preparationId === "pot"
    )!.grams;
  assertEquals(part(0), 520, "260 × 2");
  assertEquals(part(1), 260, "260 × 1");
  // ⛔ L'INVARIANT DU LOT: ce qui est cuisiné = ce qui est servi. La casserole
  // multipliée pèse exactement la somme des parts qu'elle sert.
  const cuisine = weighedReadyGrams(out.preparations[0].ingredients, INDEX)!;
  assertEquals(Math.round(cuisine), part(0) + part(1));
});

Deno.test("⛔ AUCUN TERME NEUF NE SORT — l'invariant du chantier", () => {
  const p = plan();
  const entree = new Set<string>();
  for (const d of p.dishes) for (const i of d.ingredients) entree.add(i.term);
  for (const pr of p.preparations) for (const i of pr.ingredients) entree.add(i.term);
  entree.add("Riz cuit"); // le TITRE de la casserole, étiquette de son item
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: p,
    rows: [
      { dishIndex: 0, factor: 1.4, sized: true },
      { dishIndex: 1, factor: 0.6, sized: true },
    ],
  });
  for (const d of out.dishes) {
    for (const i of d.ingredients) {
      assert(entree.has(i.term), `terme neuf dans un plat: ${i.term}`);
    }
    for (const b of d.boxes ?? []) {
      for (const it of b.items) {
        assert(entree.has(it.term), `terme neuf dans une boîte: ${it.term}`);
      }
    }
  }
  for (const pr of out.preparations) {
    for (const i of pr.ingredients) {
      assert(entree.has(i.term), `terme neuf dans une casserole: ${i.term}`);
    }
  }
});

Deno.test("un plat NON MESURÉ garde sa recette, ne reçoit pas de boîte, et compte", () => {
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: plan(),
    rows: [
      { dishIndex: 0, factor: 2, sized: true },
      { dishIndex: 1, factor: 1, sized: false },
    ],
  });
  assertEquals(out.dishes[1].ingredients[0].amount, 10, "la recette part telle quelle");
  assertEquals(out.dishes[1].boxes.length, 0, "aucune boîte");
  assertEquals(out.counts.dishes_unsized, 1);
  assertEquals(out.counts.boxes_authored, 1);
  // ⚠️ IL TIRE QUAND MÊME SA PORTION ENTIÈRE de la casserole: il est servi tel
  // que le modèle l'a écrit. (2 + 1) / 2 = 1,5.
  assertEquals(out.preparations[0].ingredients[0].amount, 300);
});

Deno.test("un ingrédient dont la quantité n'est qu'en PROSE n'est ni multiplié ni mis en boîte", () => {
  const p = plan();
  // deno-lint-ignore no-explicit-any
  (p.dishes[0].ingredients as any[]).push({
    term: "sel",
    quantity: "1 pincée de sel",
    amount: null,
    unit: null,
    state: null,
    gramsRaw: null,
    in_pantry: false,
    quantitySource: null,
    part: null,
    group: null,
  });
  const out = applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: p,
    rows: [{ dishIndex: 0, factor: 2, sized: true }, { dishIndex: 1, factor: 1, sized: true }],
  });
  // ⛔ « 1 pincée » NE SE MULTIPLIE PAS. Deux pincées ne sont pas une quantité.
  assertEquals(out.dishes[0].ingredients[1].amount, null);
  assertEquals(out.counts.fresh_unweighed, 1);
  assertEquals(
    out.dishes[0].boxes[0].items.filter((i: { term: string }) => i.term === "sel").length,
    0,
    "et elle n'entre pas dans la boîte: on ne pèse pas ce qu'on ne sait pas peser",
  );
});

Deno.test("appliquer ne MUTE pas son entrée — le module reste pur", () => {
  const p = plan();
  const avant = JSON.stringify(p);
  applySizing({
    index: INDEX,
    memberId: "m-solo",
    meal: p,
    rows: [{ dishIndex: 0, factor: 3, sized: true }, { dishIndex: 1, factor: 3, sized: true }],
  });
  assertEquals(JSON.stringify(p), avant, "le plan d'entrée est intact");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA RÉPARATION — lot 5
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("réparer: un plat TROP DILUÉ se densifie, et la cible est une DENSITÉ", () => {
  // 500 kcal pour 400 g = 125 kcal/100 g. Cible 1200 ⇒ 960 g, borne 700.
  const sized = sizeDishForMouth({ standard: STD, targetKcal: 1200, bounds: BOUNDS });
  assertEquals(sized.verdict, "over_max");
  const ask = repairDecision({ sized, standard: STD, bounds: BOUNDS, targetKcal: 1200 })!;
  assertEquals(ask.direction, "densify");
  assertEquals(ask.currentPer100G, 125);
  // Pour que 1200 kcal tiennent dans 700 g il faut 171,4 kcal/100 g; × 1,10 ⇒ 189.
  assertEquals(ask.aimPer100G, Math.ceil((1200 / BOUNDS.max) * 100 * REPAIR_DENSITY_HEADROOM));
  assertEquals(ask.aimPer100G, 189);
  // ⛔ ET LA MARGE ÉLOIGNE DE LA BORNE: viser le strict minimum reviendrait à
  // demander d'échouer, le moindre arrondi remettant le plat dehors.
  assert(ask.aimPer100G > (1200 / BOUNDS.max) * 100);
});

Deno.test("réparer: un plat TROP CONCENTRÉ s'allège, et la marge va dans l'AUTRE SENS", () => {
  const sized = sizeDishForMouth({ standard: STD, targetKcal: 200, bounds: BOUNDS });
  assertEquals(sized.verdict, "under_min");
  const ask = repairDecision({ sized, standard: STD, bounds: BOUNDS, targetKcal: 200 })!;
  assertEquals(ask.direction, "lighten");
  // Pour que 200 kcal remplissent 250 g il faut AU PLUS 80 kcal/100 g; ÷ 1,10 ⇒ 72.
  assertEquals(ask.aimPer100G, Math.floor((200 / BOUNDS.min) * 100 / REPAIR_DENSITY_HEADROOM));
  assertEquals(ask.aimPer100G, 72);
  // ⛔ LE PIÈGE ÉVITÉ: `× 1,10` ici aurait demandé de rendre ENCORE plus dense
  // un plat déjà trop dense — la marge doit toujours éloigner de la borne.
  assert(ask.aimPer100G < (200 / BOUNDS.min) * 100);
});

Deno.test("réparer: un plat DANS LES BORNES ou non mesurable ne demande RIEN", () => {
  const ok = sizeDishForMouth({ standard: STD, targetKcal: 750, bounds: BOUNDS });
  assertEquals(repairDecision({ sized: ok, standard: STD, bounds: BOUNDS, targetKcal: 750 }), null);
  const nm = sizeDishForMouth({
    standard: { ...STD, kcal: null },
    targetKcal: 750,
    bounds: BOUNDS,
  });
  assertEquals(
    repairDecision({ sized: nm, standard: { ...STD, kcal: null }, bounds: BOUNDS, targetKcal: 750 }),
    null,
  );
  // Sans cible (plancher TCA fermé), on ne demande rien non plus.
  const sansCible = sizeDishForMouth({ standard: STD, targetKcal: null, bounds: BOUNDS });
  assertEquals(
    repairDecision({ sized: sansCible, standard: STD, bounds: BOUNDS, targetKcal: null }),
    null,
  );
});

Deno.test("⛔ L'INSTRUCTION NE PORTE NI KCAL DE JOURNÉE, NI KG, NI PRÉNOM", () => {
  // C'est la garde du chantier: v33 a retiré le corps du prompt, et une relance
  // qui le rendrait par la bande annulerait le lot entier. Le plancher TCA du
  // lot 6 en dépend aussi.
  const ask = repairDecision({
    sized: sizeDishForMouth({ standard: STD, targetKcal: 1200, bounds: BOUNDS }),
    standard: STD,
    bounds: BOUNDS,
    targetKcal: 1200,
  })!;
  const texte = repairInstruction([{
    title: "Soupe de légumes",
    ask,
    fresh: [
      { term: "courgette", quantity: "300 g" },
      { term: "bouillon", quantity: "600 ml" },
    ],
    freshRepairability: "reworkable",
    pots: [],
  }])!;
  assert(!texte.includes("1200"), "la cible de la journée ne sort pas");
  assert(!texte.includes(String(BOUNDS.max)), "la borne de masse ne sort pas non plus");
  assertEquals(texte.match(/\bkg\b/), null);
  assertEquals(texte.match(/\bAlex\b/), null);
  // Ce qui SORT: la densité actuelle, la BANDE visée, et le titre du plat.
  // ⟳ 2026-09-10 — plus « at least N » : un seul bout laisse le modèle partir
  // de l'autre côté, mesuré dans les deux sens (23 densités sur 40 AU-DESSUS
  // de la consigne ; un bouillon à 57,8 sur la consigne inverse).
  assert(texte.includes("125 kcal per 100 g"));
  assert(texte.includes("between 172 and 250 kcal per 100 g"), texte.slice(0, 300));
  assert(texte.includes("aiming for 189"), "la visée a disparu de la consigne");
  assert(texte.includes('"Soupe de légumes"'));
  // ⛔ ET L'IDENTITÉ EST DEMANDÉE. Sans ça, « rends ce plat plus dense » se
  // satisfait en remplaçant la soupe par un gratin.
  assert(texte.includes("Keep each dish's identity"));
  assert(texte.includes("REPLACEMENT"));
  // ⛔ ET SA RECETTE LUI EST RENDUE, AVEC SES QUANTITÉS (2026-09-08). Mesuré:
  // le message de relance est le prompt d'ORIGINE plus cette consigne — le
  // modèle n'y relit nulle part le plan qu'il vient d'écrire. Nommer les
  // ingrédients sans leurs quantités lui demandait de re-proportionner de
  // mémoire, et il s'arrêtait à mi-chemin (142 rendus pour 182 demandés).
  assert(texte.includes("300 g courgette, 600 ml bouillon"));
  // ⛔ ET LE MOT « PROPORTIONS » A DISPARU: il se lit « sers-en moins », ce qui
  // laisse la personne avec la même assiette rabotée, par l'autre bout.
  assertEquals(texte.match(/PROPORTIONS/), null);
  // ⛔ ET « THE PLATE STAYS THE SAME SIZE » A ÉTÉ RETIRÉE LE 2026-09-08 SOIR:
  // elle contredisait la phrase d'avant. « Moins de légume aqueux » demande de
  // retirer 400 g de tomates; « ne rétrécis pas » l'interdit. Mesuré: le modèle
  // a composé un AUTRE plat, faute de manœuvre praticable (111 g de survie sur
  // 1 341). Voir le pavé de `repairInstruction`.
  assertEquals(texte.match(/stays the same size/), null);
  // ⛔ CE QUI LA REMPLACE DIT QUE LA RECETTE N'EST PAS UNE ASSIETTE. Depuis
  // v33 le modèle écrit une recette STANDARD que le moteur multiplie: la
  // portion servie n'est pas son affaire, et la recette a le droit de maigrir.
  assert(texte.includes("The recipe may end up smaller, and that is fine"), texte);
  assert(texte.includes("the app decides how much of it goes on a plate, you do not"));
});

Deno.test("⛔ LA RELANCE NOMME CE QU'ELLE INTERDIT DE TOUCHER", () => {
  // ⛔ UNE CASSEROLE GELÉE SE NOMME, ELLE NE SE TAIT PAS. La passer sous silence
  // ferait un plat dont la moitié des ingrédients semble absente — et un modèle
  // à qui manque la moitié d'une recette la réinvente.
  const ask = repairDecision({
    sized: sizeDishForMouth({ standard: STD, targetKcal: 1200, bounds: BOUNDS }),
    standard: STD,
    bounds: BOUNDS,
    targetKcal: 1200,
  })!;
  const texte = repairInstruction([{
    title: "Poulet et riz",
    ask,
    fresh: [{ term: "huile d'olive", quantity: "1 c. à s." }],
    freshRepairability: "reworkable",
    pots: [
      {
        id: "prep_riz",
        title: "Riz",
        ingredients: [{ term: "riz", quantity: "200 g" }],
        repairability: "frozen",
      },
      {
        id: "prep_poulet",
        title: "Poulet rôti",
        ingredients: [{ term: "cuisses de poulet", quantity: "400 g" }],
        repairability: "reworkable",
      },
    ],
  }])!;
  assert(texte.includes('Preparation prep_riz "Riz", FROZEN'), texte);
  assert(texte.includes("200 g riz"), "et son contenu est quand même rendu");
  assert(texte.includes('Preparation prep_poulet "Poulet rôti", REWORKABLE'));
  assert(texte.includes("A FROZEN part comes back unchanged"), "et la règle est dite");
});

Deno.test("le budget borne le NOMBRE de plats nommés, et le reste est compté ailleurs", () => {
  const ask = repairDecision({
    sized: sizeDishForMouth({ standard: STD, targetKcal: 1200, bounds: BOUNDS }),
    standard: STD,
    bounds: BOUNDS,
    targetKcal: 1200,
  })!;
  const six = Array.from({ length: 6 }, (_, i) => ({
    title: `Plat ${i}`,
    ask,
    fresh: [],
    freshRepairability: "reworkable" as const,
    pots: [],
  }));
  const texte = repairInstruction(six)!;
  const nommés = texte.split("\n").filter((l) => l.startsWith('- "')).length;
  assertEquals(nommés, REPAIR_MAX_DISHES_PER_PLAN);
  assertEquals(REPAIR_MAX_DISHES_PER_PLAN, 4);
  // ⚠️ Au-delà, ce n'est plus un plat à réparer, c'est un plan à recomposer —
  // et recomposer n'est pas ce que cette relance fait.
  assertEquals(repairInstruction([]), null);
});

Deno.test("épinglage — les trois constantes de la réparation", () => {
  // ⛔ `REPAIR_CALLS_PER_DISH = 2` DEPUIS LE 2026-09-09. La valeur 1 reposait
  // sur « un plat qu'on redemande deux fois est un plat que le modèle ne sait
  // pas rendre plus dense » — faux dans trois refus sur quatre: `title_changed`
  // (il a composé autre chose), `no_cell` (la case n'est pas revenue) et
  // `unparseable` ne disent rien de sa capacité à densifier. Le second appel ne
  // part QUE sur un refus: un plan qui passe du premier coup ne coûte rien.
  assertEquals(REPAIR_CALLS_PER_DISH, 2);
  assertEquals(REPAIR_MAX_DISHES_PER_PLAN, 4);
  assertEquals(REPAIR_DENSITY_HEADROOM, 1.10);
});

Deno.test("⛔ IDENTITÉ — les DEUX CAS RÉELS mesurés le 2026-09-07 se séparent", () => {
  // ⚠️ CES DEUX PLATS SONT DES MESURES, pas des exemples inventés. Ni le TITRE
  // ni le COMPTE DES TERMES ne les distingue — c'est la MASSE qui le fait.

  // ⛔ TIR `L5b` — REMPLACEMENT PUR. Rien ne survit; la personne recevrait autre
  // chose que ce qu'elle a demandé.
  const remplacement = repairIdentityHeld({
    before: [
      { term: "poulet", grams: 160 },
      { term: "quinoa", grams: 180 },
      { term: "courgette", grams: 120 },
      { term: "feta", grams: 40 },
    ],
    after: ["thon", "haricots blancs", "pain", "avocat", "tomate"],
  });
  assertEquals(remplacement.held, false);
  assertEquals(remplacement.survivedGrams, 0);

  // ✅ TIR `L5c` — VRAIE RÉPARATION. Le poulet et le riz restent; les légumes
  // aqueux cèdent la place, ce qui EST la consigne (« moins de légume aqueux »).
  //
  // ⛔ EN COMPTANT LES TERMES, CE CAS ÉTAIT REFUSÉ: 2 sur 4, la moitié
  // exactement. Compter les termes donne le même poids à un blanc de poulet et
  // à une rondelle de concombre. C'est un test qui l'a dit avant qu'un run ne
  // le fasse.
  const reparation = repairIdentityHeld({
    before: [
      { term: "poulet", grams: 160 },
      { term: "riz", grams: 200 },
      { term: "tomate", grams: 80 },
      { term: "concombre", grams: 60 },
    ],
    after: ["poulet", "riz", "laitue", "avocat"],
  });
  assertEquals(reparation.held, true);
  assertEquals(reparation.survivedGrams, 360);
  assertEquals(reparation.ofGrams, 500);
});

Deno.test("IDENTITÉ — « la majorité » est STRICTE, et l'égalité ne passe pas", () => {
  // Un plat dont exactement la moitié de la nourriture a disparu n'est plus le
  // même plat: le doute profite à la personne, pas à la relance.
  assertEquals(
    repairIdentityHeld({
      before: [{ term: "a", grams: 100 }, { term: "b", grams: 100 }],
      after: ["a"],
    }).held,
    false,
  );
  assertEquals(
    repairIdentityHeld({
      before: [{ term: "a", grams: 101 }, { term: "b", grams: 100 }],
      after: ["a"],
    }).held,
    true,
  );
  assertEquals(REPAIR_MIN_MASS_SURVIVAL, 0.5);
});

Deno.test("IDENTITÉ — la comparaison passe par le normaliseur DU PRODUIT", () => {
  // ⛔ AUCUN MATCHER MAISON. `normalizeTerm` est celui qui résout déjà tous les
  // ingrédients: la casse, les accents et les espaces se replient comme partout
  // ailleurs, et rien d'autre n'est deviné.
  assertEquals(
    repairIdentityHeld({
      before: [{ term: "Poulet rôti", grams: 200 }, { term: " RIZ ", grams: 200 }],
      after: ["poulet roti", "riz"],
    }).held,
    true,
  );
  // ⚠️ Et « laitue » ne compte JAMAIS pour « lait »: l'intersection est exacte.
  // C'est la cicatrice `never-hand-roll-a-matcher-here`, douze faux positifs
  // sur douze mesurés.
  assertEquals(
    repairIdentityHeld({ before: [{ term: "lait", grams: 200 }], after: ["laitue"] }).held,
    false,
  );
});

Deno.test("IDENTITÉ — un plat qui ne se pèse pas est REFUSÉ, jamais accepté", () => {
  // Le repli est l'abstention: un plat non jugeable qu'on accepterait serait la
  // porte grande ouverte à un remplacement.
  assertEquals(repairIdentityHeld({ before: [], after: ["poulet"] }).held, false);
  assertEquals(
    repairIdentityHeld({ before: [{ term: "poulet", grams: 0 }], after: ["poulet"] }).ofGrams,
    0,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LE PLANCHER TCA DIMENSIONNE — lot 6
// ═══════════════════════════════════════════════════════════════════════════

const CORPS = {
  heightCm: 170,
  weightKg: 70,
  gender: "male" as const,
  ageYears: 35,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: CORPS,
    direction: null,
    paceKgPerWeek: null,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}

Deno.test("⛔ SOUS PLANCHER TCA, L'ASSIETTE SE DIMENSIONNE — la cible est l'entretien", () => {
  const m = bouche({ restriction: "raised", direction: "down", paceKgPerWeek: 0.5 });
  // `mouthTargetKcal` refuse: c'est SA question — « quel objectif ? » — et la
  // bonne réponse est aucun.
  assertEquals(mouthTargetKcal(m, "no_position").kcal, null);
  assertEquals(mouthTargetKcal(m, "no_position").reason, "restriction_floor");
  // ⛔ `dayTargetFor` répond à une AUTRE question: « combien dans l'assiette ».
  // Refuser de dimensionner ne protège personne — la recette du modèle partirait
  // telle quelle, c'est-à-dire une quantité tirée au sort, et « pas assez » est
  // exactement le sens d'erreur qu'un plancher TCA existe pour empêcher.
  const t = dayTargetFor(m, "no_position");
  assert(t.kcal !== null && t.kcal > 0, "l'assiette se dimensionne");
  assertEquals(t.reason, "anchored");
  assertEquals(t.gapClosed, "restriction_floor");
  // ⛔ ET AUCUN DÉFICIT N'EST OUVERT: la cible EST l'entretien, au kcal près.
  assertEquals(t.kcal, maintenanceKcalOf(m).kcal);
});

Deno.test("hors plancher, `dayTargetFor` rend EXACTEMENT `mouthTargetKcal`", () => {
  // ⛔ LA CONTRE-ÉPREUVE. Sans elle, ce lot pourrait déplacer la cible de TOUTE
  // la population sans que rien ne le dise.
  for (
    const m of [
      bouche(),
      bouche({ direction: "down", paceKgPerWeek: 0.5 }),
      bouche({ direction: "up", paceKgPerWeek: 0.25 }),
      bouche({ ageState: "minor" }),
    ]
  ) {
    for (const stance of ["no_position", "no_counting"] as const) {
      assertEquals(
        dayTargetFor(m, stance).kcal,
        mouthTargetKcal(m, stance).kcal,
        `${m.direction}/${m.ageState}/${stance}`,
      );
      assertEquals(dayTargetFor(m, stance).gapClosed, "none");
    }
  }
});

Deno.test("⛔ `unreadable` RESTE FERMÉ — une ignorance n'est pas une décision", () => {
  // « Plancher levé » est une décision connue; « on n'a pas su lire » est une
  // ignorance, et sur une ignorance on s'abstient.
  const m = bouche({ restriction: "unreadable" });
  assertEquals(dayTargetFor(m, "no_position").kcal, null);
  assertEquals(dayTargetFor(m, "no_position").reason, "restriction_unknown");
  assertEquals(dayTargetFor(m, "no_position").gapClosed, "none");
});

Deno.test("un corps absent ou un âge inconnu ferment aussi, chacun sous son motif", () => {
  assertEquals(dayTargetFor(bouche({ body: null }), "no_position").reason, "no_body");
  assertEquals(dayTargetFor(bouche({ ageState: "unknown" }), "no_position").reason, "age_unknown");
});

Deno.test("la constante est le RETOUR ARRIÈRE, et elle est épinglée", () => {
  // `false` referme tout sans toucher une ligne de câblage.
  assertEquals(RESTRICTION_FLOOR_SIZES_MAINTENANCE, true);
});

Deno.test("⛔ LA FACTORISATION N'A PAS BOUGÉ `mouthTargetKcal` — entretien + écart", () => {
  // Les deux moitiés recomposent la fonction d'origine, sur les quatre chemins.
  for (
    const m of [
      bouche({ direction: "down", paceKgPerWeek: 0.5 }),
      bouche({ direction: "up", paceKgPerWeek: 0.25 }),
      bouche(),
    ]
  ) {
    const base = maintenanceKcalOf(m).kcal!;
    const gap = goalGapKcalOf(m, "no_position").gap;
    assertEquals(mouthTargetKcal(m, "no_position").kcal, base + gap);
  }
  // Et l'écart est SIGNÉ dans le bon sens.
  assert(goalGapKcalOf(bouche({ direction: "down", paceKgPerWeek: 0.5 }), "no_position").gap < 0);
  assert(goalGapKcalOf(bouche({ direction: "up", paceKgPerWeek: 0.25 }), "no_position").gap > 0);
  assertEquals(goalGapKcalOf(bouche(), "no_position").gap, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT 10 (2026-09-07) — PLUSIEURS MANGEURS SUR LA MÊME RECETTE
// ═══════════════════════════════════════════════════════════════════════════
//
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
//   N1 — `sizeDishForEaters` rend la MOYENNE des cibles: la portion unique du
//        modèle sous un autre nom. ROUGE.
//   N2 — `potFactorAcross` passe les facteurs à plat à `potFactorOf`: la
//        casserole est divisée par le nombre de bouches. ROUGE.
//   N3 — `lidPlanFor` rend un bac d'UN nom au lieu d'une boîte. ROUGE.
//   N4 — le bac rend la MOYENNE de ses parts au lieu de leur somme. ROUGE.

const BOUNDS_ADULTE = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });
const BOUNDS_ENFANT = plateBoundsFor({ ageYears: 9, slot: "dinner", slotTargetKcal: null, light: false, appetite: null });

const eater = (
  memberId: string,
  targetKcal: number | null,
  bounds = BOUNDS_ADULTE,
) => ({ memberId, bucket: "adult_maintenance", targetKcal, bounds });

Deno.test("LOT 10 — une recette, un facteur PAR MANGEUR, jamais une moyenne", () => {
  const rows = sizeDishForEaters({
    standard: STD, // 500 kcal, 400 g
    eaters: [eater("a", 750), eater("b", 250)],
  });
  assertEquals(rows.map((r) => r.memberId), ["a", "b"]);
  assertEquals(rows[0].factor, 1.5);
  assertEquals(rows[1].factor, 0.5);
  assertEquals(rows[0].personCookedG, 600);
  assertEquals(rows[1].personCookedG, 200);
  // ⛔ LA MOYENNE SERAIT 1 POUR LES DEUX — c'est la portion unique du modèle.
  assert(
    rows[0].factor !== rows[1].factor,
    "les deux mangeurs reçoivent la même part: la moyenne est revenue",
  );
});

Deno.test("LOT 10 — le verdict est celui de CHAQUE mangeur, sur ses bornes à lui", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [
      eater("adulte", 750, BOUNDS_ADULTE),
      { ...eater("enfant", 750, BOUNDS_ENFANT), bucket: "minor_6_11" },
    ],
  });
  // 750/500 = 1,5 ⇒ 600 g servis. L'adulte tient sous son plafond (700), pas
  // l'enfant (450) — MÊME plat, MÊME facteur, deux verdicts. C'est très
  // exactement le cas que la réparation du lot 13 devra trancher: densifier
  // pour l'adulte tirerait l'enfant vers le bas, et c'est interdit.
  assertEquals(rows[0].verdict, "in_bounds");
  assertEquals(rows[1].verdict, "over_max");
  assertEquals(rows[1].bucket, "minor_6_11");
  assertEquals(rows[0].personCookedG, rows[1].personCookedG, "la recette est la même");
});

Deno.test("LOT 10 — un mangeur sans cible ne bloque PAS la table", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [eater("a", 750), eater("sans_corps", null)],
  });
  assertEquals(rows[0].factor, 1.5, "l'autre garde sa part juste");
  assertEquals(rows[1].factor, UNMEASURABLE_PORTION_FACTOR);
  assertEquals(rows[1].verdict, "unmeasurable");
});

Deno.test("LOT 10 — aucun mangeur ⇒ aucune ligne", () => {
  assertEquals(sizeDishForEaters({ standard: STD, eaters: [] }), []);
});

Deno.test("LOT 10 — la casserole somme les MANGEURS et moyenne les PLATS", () => {
  // Deux plats tirent la casserole; chacun nourrit deux bouches à facteur 1.
  // La casserole doit contenir 2 parts par plat, soit un facteur 2 — pas 1
  // (moyenne à plat) et pas 4 (somme à plat).
  assertEquals(potFactorAcross([[1, 1], [1, 1]]), 2);
  // Trois plats, un seul mangeur chacun: on retombe sur `potFactorOf`.
  assertEquals(potFactorAcross([[1.5], [0.5], [1]]), potFactorOf([1.5, 0.5, 1]));
  // Un plat, quatre bouches inégales.
  assertEquals(potFactorAcross([[1.5, 1, 0.5, 1]]), 4);
  assertEquals(potFactorAcross([]), 1);
});

Deno.test("LOT 10 — un objectif de poids ouvre une boîte, le maintien un bac", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [eater("paul", 750), eater("claire", 500), eater("leo", 250)],
  });
  const plan = lidPlanFor({ rows, weighed: new Set(["paul"]) });
  assertEquals(plan.own, [{ memberId: "paul", factor: 1.5 }]);
  assertEquals(plan.tub?.memberIds, ["claire", "leo"]);
  // ⛔ LA SOMME, JAMAIS LA MOYENNE: 1 + 0,5.
  assertEquals(plan.tub?.factorSum, 1.5);
});

Deno.test("LOT 10 — un SEUL mangeur au bac reçoit une boîte à son nom", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [eater("paul", 750), eater("claire", 500)],
  });
  const plan = lidPlanFor({ rows, weighed: new Set(["paul"]) });
  assertEquals(plan.tub, null, "un bac d'un nom mentirait sur ses grammes");
  assertEquals(plan.own.map((l) => l.memberId), ["claire", "paul"]);
});

Deno.test("LOT 10 — tout le monde pesé ⇒ aucun bac", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [eater("a", 500), eater("b", 750)],
  });
  const plan = lidPlanFor({ rows, weighed: new Set(["a", "b"]) });
  assertEquals(plan.tub, null);
  assertEquals(plan.own.length, 2);
});

Deno.test("LOT 10 — personne pesé ⇒ un seul bac qui nomme tout le monde", () => {
  const rows = sizeDishForEaters({
    standard: STD,
    eaters: [eater("c", 500), eater("a", 500), eater("b", 500)],
  });
  const plan = lidPlanFor({ rows, weighed: new Set() });
  assertEquals(plan.own, []);
  assertEquals(plan.tub?.memberIds, ["a", "b", "c"], "triés, jamais l'ordre du roster");
  assertEquals(plan.tub?.factorSum, 3);
});

Deno.test("LOT 10 — les deux constantes de la table sont épinglées", () => {
  assertEquals(HOUSEHOLD_MAX_MOUTHS, 12);
  assertEquals(SHADOW_SIZING_AT_N, true);
  assert(
    PORTION_SIZING_MAX_MOUTHS <= HOUSEHOLD_MAX_MOUTHS,
    "la borne du chemin armé dépasse le plafond de la lane",
  );
});

Deno.test("CÂBLAGE — l'ombre tourne à plusieurs bouches, et ne pose RIEN", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const shadowAt = src.indexOf("const shadowSizing = (): Record<string, unknown> =>");
  const blockAt = src.indexOf("const portionSizing = await (async () => {");
  assert(shadowAt > 0, "l'ombre n'est pas branchée: le module ne compare rien");
  assert(shadowAt < blockAt, "l'ombre est définie après le bloc qui l'appelle");
  assert(src.includes("shadow: shadowSizing(),"), "l'ombre n'entre pas dans le journal");

  // ⛔ ELLE NE TOURNE QUE SUR LE CHEMIN NON ARMÉ. Sur `portion_v1` le moteur
  // sert déjà ses grammes: il n'a pas de contrefactuel à porter, et en
  // calculer un ferait payer un second dimensionnement pour rien.
  const early = src.slice(
    src.indexOf('if (sizing.path !== "portion_v1" || composition === null) {'),
    src.indexOf("shadow: shadowSizing(),"),
  );
  assert(early.length > 0 && early.length < 4000, "l'ombre a quitté le repli");

  // ⛔ L'OMBRE NE POSE RIEN. Aucune écriture sur le plan dans son corps: ni
  // `meal.dishes =`, ni `applySizing(`, ni une boîte. C'est ce qui la rend
  // sûre à faire tourner sur la population entière.
  const body = src.slice(shadowAt, blockAt);
  assert(!/meal\.(dishes|preparations)\s*=/.test(body), "l'ombre écrit sur le plan");
  assert(!body.includes("applySizing("), "l'ombre applique: ce n'est plus une ombre");
  assert(!/\.boxes\s*=/.test(body), "l'ombre écrit une boîte");

  // ⛔ AUCUN `member_id` DANS UNE LIGNE DE JOURNAL — seulement un seau.
  const rowsAt = body.indexOf("shadowRows.push({");
  const rowsEnd = body.indexOf("});", rowsAt);
  const rowLiteral = body.slice(rowsAt, rowsEnd);
  assert(rowsAt > 0, "l'ombre ne rend aucune ligne");
  assert(
    !/member_id|memberId:/.test(rowLiteral),
    "une ligne d'ombre porte un member_id à côté d'un kcal — le défaut de `residualGaps`",
  );
  assert(rowLiteral.includes("eater_bucket"), "la ligne ne dit pas de quel seau elle parle");

  // La grille du lot 9 est la SEULE source des mangeurs.
  assert(
    body.includes("cells: householdGrid.cells"),
    "l'ombre recalcule qui mange quoi au lieu de lire la grille",
  );
  // Les apports fixes sont ceux de CETTE bouche.
  assert(
    body.includes("fixedIntakeLoad.perMouth[m.memberId]"),
    "l'ombre retranche le shaker de la table à chaque bouche",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LA DENSITÉ REQUISE, DITE AVANT LA COMPOSITION — 2026-09-08
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE CORPS DU TIR DU 2026-09-07 — 187 cm, 72 kg, 28 ans, prise de masse.
 *
 * ⚠️ CE N'EST PAS UNE FIXTURE DÉCORATIVE. C'est le corps sur lequel le défaut a
 * été mesuré: 383 kcal sur 3 080 jamais servies, parce que les plats du modèle
 * (142 et 113 kcal/100 g) demandaient 813 g et 897 g d'assiette pour porter
 * leur cible. Les nombres ci-dessous sont ceux que ce corps EXIGE.
 */
const GRAND = {
  heightCm: 187,
  weightKg: 72,
  gender: "male" as const,
  ageYears: 28,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const QUATRE_MOMENTS = ["breakfast", "lunch", "snack_pm", "dinner"];

function densite(over: Partial<Parameters<typeof requiredDensityFor>[0]> = {}) {
  return requiredDensityFor({
    mouth: bouche({
      body: GRAND,
      direction: "up",
      paceKgPerWeek: 0.35,
      declaredSlots: QUATRE_MOMENTS,
    }),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", QUATRE_MOMENTS]]),
    // ⟳ 2026-09-11 · LOT B — LE RYTHME COMPLET DE LA BOUCHE, distinct de la
    // grille. ⛔ Un test qui rétrécit `slotsByDay` seul décrit désormais une
    // FENÊTRE PARTIELLE, et la part des moments restants ne grossit plus.
    rhythmSlots: QUATRE_MOMENTS,
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 28,
    floors: { normal: 100, light: 60 },
    ...over,
  });
}

Deno.test("DENSITÉ — chaque moment exige ce que son plafond d'assiette impose", () => {
  // ⛔ LES NOMBRES SONT DÉRIVÉS À LA MAIN, PAS RECOPIÉS DE LA SORTIE. Un test
  // qui affirme « le code rend ce que le code rend » reste vert quand la
  // formule change de sens.
  //
  // ⟳ 2026-09-10 — L'ENTRETIEN EST CELUI DE L'ÉQUATION DU CORPS, comme celui
  // que l'écran affiche depuis le 2026-09-09 après-midi. Ce corps-ci EST celui
  // sur lequel le raccourci `28-33 kcal/kg` a été mesuré faux (187 cm, 72 kg:
  // un PAL implicite de 1,13-1,35, sous le plancher de 1,40 de la FAO):
  //
  //   BMR = 10×72 + 6,25×187 − 5×24 + 5 = 1 773,75   (bande 18_29, milieu 24)
  //   M   = 1 773,75 × 1,80 (`trains_some`) = **3 193**
  //
  //   ⚠️ 3 193 était déjà le nombre que ce test citait comme repoussoir avant
  //   ce lot (« contre 3 193 sous Mifflin-St Jeor »). C'est le même corps et la
  //   même équation; ce qui a changé, c'est quel des deux nombres le produit
  //   sert — et il sert maintenant celui que la personne voit.
  //
  // Le curseur reste le contrat: 0,35 kg/sem vaut 0,35 × 7700 / 7 = 385
  // kcal/jour, exécutés tels quels. Cible: 3 193 + 385 = **3 578**.
  //
  // Les quatre moments pèsent 0,25 + 0,40 + 0,10 + 0,35 = 1,10, et la densité
  // se demande contre le plafond PHYSIQUE (`physicalMax`, la capacité
  // d'estomac), jamais contre le plafond dérivé de la part — sans quoi la
  // question serait circulaire et rendrait le même nombre pour tout le monde.
  // ⟳ 2026-09-10 — LA MARGE EST SORTIE DE LA BORNE BASSE. `kcalPer100G` est
  // désormais le PLANCHER du couloir — ce qu'il faut *strictement* pour que la
  // part tienne dans l'assiette — et la marge vit dans `preferredPer100G`, à
  // l'intérieur. Pousser le plancher de 10 % le rendait faux dans son propre
  // nom: il annonçait comme nécessaire un nombre qui ne l'était pas.
  //
  //   déjeuner  3578 × 0,40/1,10 = 1301,1 kcal ; 1301,1/700 × 100 = 185,9 → 186
  //   dîner     3578 × 0,35/1,10 = 1138,5 kcal ; 1138,5/700 × 100 = 162,6 → 163
  //   p-déj     3578 × 0,25/1,10 =  813,2 kcal ;  813,2/700 × 100 = 116,2 → 117
  //   goûter    3578 × 0,10/1,10 =  325,3 kcal ;  325,3/300 × 100 = 108,4 → 109
  //
  // ⚠️ ET LES QUATRE PASSENT DÉSORMAIS LE PLANCHER DE 100, là où deux le
  // rataient sous le raccourci au poids. Ce n'est pas un effet cherché: c'est ce
  // que « ce corps dépense 900 kcal/jour de plus qu'on ne le croyait » produit
  // en aval, et c'est la mesure qui rend le changement lisible.
  const r = densite();
  assertEquals(dayTargetFor(bouche({
    body: GRAND,
    direction: "up",
    paceKgPerWeek: 0.35,
    declaredSlots: QUATRE_MOMENTS,
  }), "no_position").kcal, 3578);
  assertEquals(
    r.named.map((d) => [d.slot, d.kcalPer100G]),
    [["breakfast", 117], ["lunch", 186], ["snack_pm", 109], ["dinner", 163]],
  );
  // ⛔ ET LA MARGE EST BIEN LÀ, INTÉRIEURE: la visée dépasse le plancher sans
  // sortir du couloir. Sans cette ligne, retirer la visée passerait inaperçu.
  for (const d of r.named) {
    assert(d.preferredPer100G > d.minPer100G, `${d.slot}: la visée ne dépasse pas le plancher`);
    assert(d.preferredPer100G <= d.maxPer100G, `${d.slot}: la visée sort du couloir`);
    assertEquals(d.kcalPer100G, d.minPer100G);
  }
  assertEquals(r.floorOnly, []);
  assertEquals(r.counters, {
    slots: 4,
    above_floor: 4,
    days_varied: 0,
    capped: 0,
    fixed_covered: 0,
    // ⟳ 2026-09-10 · LOT 4 — les quatre dépassent leur plancher, donc aucun
    // couloir n'est transmis « pour son plafond seul », et aucune journée n'a
    // d'intersection vide.
    floor_min_kept: 0,
    empty_intersection: 0,
    relaxed_days: 0,
    relax_refused: {},
  });

  // ── LA MOITIÉ QUE LE PLANCHER CACHERAIT, ET C'EST TOUT LE POINT DU TEST ──
  // Le goûter emploie le plafond de COLLATION (300 g), pas celui d'un repas —
  // c'est ce qui le rend presque aussi exigeant que le petit-déjeuner malgré
  // une cible DEUX FOIS ET DEMIE plus petite (109 contre 117). Un test qui les
  // traiterait pareil le manquerait.
  const bas = densite({ floors: { normal: 50, light: 30 } });
  assertEquals(
    bas.named.map((d) => [d.slot, d.kcalPer100G]),
    [["breakfast", 117], ["lunch", 186], ["snack_pm", 109], ["dinner", 163]],
  );
});

Deno.test("DENSITÉ — l'ordre est celui de la JOURNÉE, pas celui de la grille", () => {
  // Une ligne qui dirait « 176 au dîner, 201 au déjeuner » se lit comme deux
  // faits sans rapport; dans l'ordre, elle se lit comme une journée.
  // ⟳ 2026-09-09 — LE PLANCHER EST BAISSÉ ICI, ET SEULEMENT ICI: ce test parle
  // de l'ORDRE, et deux moments suffiraient à le rendre indécidable. L'abaisser
  // rend les quatre visibles sans rien changer à ce qu'on mesure.
  const r = densite({
    slotsByDay: new Map([["mon", ["dinner", "snack_pm", "breakfast", "lunch"]]]),
    floors: { normal: 50, light: 30 },
  });
  assertEquals(r.named.map((d) => d.slot), ["breakfast", "lunch", "snack_pm", "dinner"]);
});

Deno.test("DENSITÉ — sous le plancher, la borne basse est MARQUÉE, plus jetée", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LOT 4 — CONTRAT RENVERSÉ, ET LA RAISON EST MESURABLE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // CE TEST DISAIT: « sous le plancher de sa classe, un moment ne se dit PAS »,
  // parce que « répéter 69 en face d'un goûter ajoute un nombre sans ajouter
  // une contrainte ». L'objection était juste, la conséquence ne l'était pas:
  // le filtre jetait la LIGNE, donc le PLAFOND avec elle. Or le bloc commun ne
  // dit « au moins 100 » qu'en bas — il ne dit RIEN en haut, et rien d'autre
  // dans le produit ne porte le plafond d'un moment.
  //
  // Mesuré (contre-exemple CE-1): un goûter de 250 kcal a un couloir
  // [100, 135]. Le jeter perdait le 135 — la borne qui empêche de servir trois
  // cuillères de quelque chose de très dense.
  //
  // CE QUI REMPLACE LE FILTRE: `redundantMin`. Le calcul garde tout, le RENDU
  // décide de ne pas répéter. On cesse de perdre une information pour éviter
  // une répétition.
  //
  // Corps ordinaire (170 cm, 70 kg, entretien): cible 2 465 kcal, dîner
  // 2465 × 0,35/1,00 = 863 kcal → bien au-dessus de 100.
  // Goûter ajouté: sa part tombe à 224 kcal → sa borne basse passe sous 100.
  const r = requiredDensityFor({
    mouth: bouche({ declaredSlots: ["breakfast", "lunch", "snack_pm", "dinner"] }),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", ["breakfast", "lunch", "snack_pm", "dinner"]]]),
    rhythmSlots: ["breakfast", "lunch", "snack_pm", "dinner"],
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 35,
    floors: { normal: 100, light: 60 },
  });
  const gouter = r.named.find((d) => d.slot === "snack_pm");
  assert(gouter !== undefined, "le goûter n'est plus transmis du tout");
  assertEquals(gouter.redundantMin, true, "sa borne basse n'ajoute rien au bloc");
  // ⛔ LA LIGNE QUI JUSTIFIE TOUT LE CHANGEMENT: son plafond existe, il est
  // fini, et il n'est porté par rien d'autre.
  assert(
    gouter.maxPer100G > gouter.minPer100G,
    "le plafond du goûter a disparu avec l'ancien filtre",
  );

  const dejeuner = r.named.find((d) => d.slot === "lunch");
  assert(dejeuner !== undefined && !dejeuner.redundantMin, "le déjeuner exige vraiment");

  assertEquals(r.counters.slots, 4);
  // ⚠️ `above_floor` GARDE SON SENS D'ORIGINE — ceux qui dépassent vraiment —
  // et il ne vaut plus `named.length`: c'est exactement ce que le lot change.
  assertEquals(r.counters.above_floor, r.named.filter((d) => !d.redundantMin).length);
  assert(
    r.counters.floor_min_kept >= 1,
    "aucun couloir n'est transmis pour son seul plafond: le filtre est revenu",
  );
});

Deno.test("DENSITÉ — un moment LÉGER est jugé contre le plancher léger", () => {
  // ⛔ SANS CETTE BRANCHE, UN DÎNER LÉGER SERAIT MUET. Sa cible est réduite par
  // `LIGHT_SLOT_WEIGHT`, donc sa densité requise l'est aussi — et elle passerait
  // sous 100 alors que la consigne qui vaut pour lui est 60.
  const leger = requiredDensityFor({
    mouth: bouche({ body: GRAND, direction: "up", paceKgPerWeek: 0.35, declaredSlots: QUATRE_MOMENTS }),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", QUATRE_MOMENTS]]),
    rhythmSlots: QUATRE_MOMENTS,
    lightSlots: ["dinner"],
    slotFixedKcalByDay: new Map(),
    ageYears: 28,
    floors: { normal: 100, light: 60 },
  });
  const dinner = leger.named.find((d) => d.slot === "dinner");
  assert(dinner !== undefined, "le dîner léger porte quand même une exigence");
  assertEquals(dinner!.light, true);
  // Et il est MOINS exigeant que le même dîner non léger: sa part a baissé.
  const ordinaire = densite().named.find((d) => d.slot === "dinner")!;
  assert(
    dinner!.kcalPer100G < ordinaire.kcalPer100G,
    `léger ${dinner!.kcalPer100G} devrait être sous ordinaire ${ordinaire.kcalPer100G}`,
  );
});

Deno.test("⛔ DENSITÉ — SOUS PLANCHER TCA, RIEN N'EST NOMMÉ (et rien n'est perdu)", () => {
  // ⛔ LES DEUX MOITIÉS, ET C'EST TOUT LE LOT. Une bouche sous plancher ne peut
  // recevoir aucun chiffre en face de son nom; son exigence doit pourtant
  // atteindre le modèle, sans quoi on la sous-nourrit pour la protéger d'un
  // nombre. Elle passe par `floorOnly`, que `densityFloorsOf` fond dans le
  // plancher COMMUN du bloc.
  const r = densite({
    mouth: bouche({
      body: GRAND,
      restriction: "raised",
      direction: "up",
      paceKgPerWeek: 0.35,
      declaredSlots: QUATRE_MOMENTS,
    }),
  });
  assertEquals(r.gapClosed, "restriction_floor");
  assertEquals(r.named, [], "aucune ligne ne porte son chiffre");
  assert(r.floorOnly.length > 0, "et son exigence n'est pas perdue");
  assert(
    r.floorOnly.some((d) => d.kcalPer100G > 100),
    "elle relève bien le plancher commun",
  );
});

Deno.test("DENSITÉ — le MAX sur les jours, jamais la moyenne", () => {
  // ⛔ UNE FENÊTRE DONT UN SEUL JOUR EXIGE PLUS DOIT EXIGER PLUS. Une moyenne
  // servirait six jours corrects et un jour raboté — le défaut mesuré, réduit
  // d'un facteur sept et donc invisible.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — CE TEST A CHANGÉ DE DÉCOR, PAS DE SUJET
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL FAISAIT VARIER, ET POURQUOI ÇA NE VARIE PLUS. Il donnait au
  // mardi « déjeuner et dîner SEULS » et attendait que la part du déjeuner
  // MONTE (0,40/0,75 au lieu de 0,40/1,10). C'est très exactement le défaut que
  // le lot B ferme: une grille rétrécie n'est pas un rythme rétréci, et les
  // repas qu'on ne compose pas ne transfèrent pas leur énergie aux autres.
  // Mesuré: cette confusion valait un facteur **2,86** sur un dîner de
  // vendredi (2 454 kcal au lieu de 858,90).
  //
  // ⚠️ CE QUE LE TEST DÉFEND RESTE VRAI, et il le prouve maintenant par la
  // seule chose qui fait VRAIMENT varier une journée à rythme constant: un
  // apport fixe déclaré ce jour-là. Mardi, 400 kcal de shaker au déjeuner ⇒ sa
  // part à composer BAISSE, donc sa densité requise aussi, donc c'est LUNDI qui
  // commande — et c'est bien le max des deux qui sort.
  const r = densite({
    slotsByDay: new Map([
      ["mon", QUATRE_MOMENTS],
      ["tue", QUATRE_MOMENTS],
    ]),
    slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 400]])]]),
  });
  const lunch = r.named.find((d) => d.slot === "lunch")!;
  const lundiSeul = densite({ slotsByDay: new Map([["mon", QUATRE_MOMENTS]]) })
    .named.find((d) => d.slot === "lunch")!;
  assertEquals(
    lunch.kcalPer100G,
    lundiSeul.kcalPer100G,
    "le jour le plus exigeant ne commande plus",
  );
  // ⛔ LE CAS QUI MORD: une MOYENNE rendrait un nombre STRICTEMENT ENTRE les
  // deux. Le mardi, allégé de son shaker, exige moins.
  const mardiSeul = densite({
    slotsByDay: new Map([["tue", QUATRE_MOMENTS]]),
    slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 400]])]]),
  }).named.find((d) => d.slot === "lunch")!;
  assert(
    mardiSeul.kcalPer100G < lundiSeul.kcalPer100G,
    `le décor ne fait rien varier: ${mardiSeul.kcalPer100G} vs ${lundiSeul.kcalPer100G}`,
  );
  assertEquals(r.counters.days_varied, 1, "seul le déjeuner varie d'un jour à l'autre");
  assertEquals(r.counters.slots, 8, "huit moments examinés, deux jours confondus");

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ ET LA MOITIÉ QUE LE LOT B AJOUTE: UNE GRILLE RÉTRÉCIE NE MONTE PLUS.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le mardi ne porte que déjeuner et dîner — la personne, elle, mange toujours
  // quatre fois. Sa part de déjeuner est donc la MÊME que le lundi, et rien du
  // petit-déjeuner qu'on ne compose pas ne lui est transféré.
  const fenetrePartielle = densite({
    slotsByDay: new Map([
      ["mon", QUATRE_MOMENTS],
      ["tue", ["lunch", "dinner"]],
    ]),
  });
  const dejPartiel = fenetrePartielle.named.find((d) => d.slot === "lunch")!;
  assertEquals(
    dejPartiel.kcalPer100G,
    lundiSeul.kcalPer100G,
    "une grille rétrécie gonfle encore la part des moments restants",
  );
  assertEquals(
    fenetrePartielle.counters.days_varied,
    0,
    "les deux jours demandent la même chose: le rythme n'a pas bougé",
  );
});

Deno.test("DENSITÉ — sans cible, le motif sort quand même", () => {
  // ⛔ ON NE REND PAS `null` POUR DIRE « JE N'AI PAS SU ». L'appelant décide si
  // « aucune cible » vaut un compteur ou un silence, et il ne peut le décider
  // qu'en lisant le motif.
  const r = densite({ mouth: bouche({ body: null }) });
  assertEquals(r.named, []);
  assertEquals(r.floorOnly, []);
  assert(r.reason !== "anchored", `un motif est rendu: ${r.reason}`);
  assertEquals(r.counters, {
    slots: 0,
    above_floor: 0,
    days_varied: 0,
    capped: 0,
    fixed_covered: 0,
    floor_min_kept: 0,
    empty_intersection: 0,
    relaxed_days: 0,
    relax_refused: {},
  });
});

Deno.test("DENSITÉ — le shaker et les extras retranchent, comme en aval", () => {
  // ⛔ MÊME ARITHMÉTIQUE QUE `measureDish`, ET C'EST LA PROPRIÉTÉ QUI COMPTE.
  // Annoncer au modèle une densité que le moteur ne demandera pas ferait deux
  // vérités sur la même assiette. 300 kcal de shaker au goûter retirent sa
  // part, donc son exigence baisse.
  const sans = densite().named.find((d) => d.slot === "snack_pm")!;
  const avec = densite({
    slotFixedKcalByDay: new Map([["mon", new Map([["snack_pm", 300]])]]),
  }).named.find((d) => d.slot === "snack_pm");
  assert(
    avec === undefined || avec.kcalPer100G < sans.kcalPer100G,
    "le shaker fait baisser ce qu'on exige du plat",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LA RÈGLE DES MANGEURS — qui a le droit de faire bouger une casserole
// ═══════════════════════════════════════════════════════════════════════════

function unites(
  dishes: readonly {
    eaters: string[];
    uses: string[];
    verdicts: [string, "over_max" | "under_min" | "in_bounds"][];
  }[],
) {
  return potRepairability({
    dishes: dishes.map((d) => ({
      eaters: new Set(d.eaters),
      uses: d.uses.map((preparationId) => ({ preparationId })),
      verdicts: new Map(d.verdicts),
    })),
  });
}

Deno.test("MANGEURS — solo, tout ce que la bouche mange est réécrivable", () => {
  // ⛔ LA PROPRIÉTÉ QUI REND LE CHEMIN SOLO SÛR. Une seule bouche ne peut jamais
  // contredire personne: si elle dépasse son plafond, chaque casserole de son
  // plat va dans son sens.
  const u = unites([{
    eaters: ["m-solo"],
    uses: ["prep_riz", "prep_poulet"],
    verdicts: [["m-solo", "over_max"]],
  }]);
  assertEquals([...u.keys()].sort(), ["prep_poulet", "prep_riz"]);
  for (const [, unit] of u) {
    assertEquals(repairabilityOf(unit, "densify").repairability, "reworkable");
    assertEquals(repairabilityOf(unit, "densify").dissenting, 0);
  }
});

Deno.test("⛔ MANGEURS — un seul dissident GÈLE la casserole", () => {
  // ⛔ C'EST LA DÉCISION PRODUIT DU 2026-09-08, ET ELLE REMPLACE « au moins un
  // over_max ⇒ on densifie ». Sonia dépasse son plafond, Zoé est dans ses
  // bornes: densifier le riz que les deux mangent répare Sonia en enrichissant
  // l'assiette de Zoé — et Zoé ne le saura jamais, sa boîte est juste plus
  // riche. On gèle, et Sonia recevra un plat à elle.
  const u = unites([{
    eaters: ["sonia", "zoe"],
    uses: ["prep_riz"],
    verdicts: [["sonia", "over_max"], ["zoe", "in_bounds"]],
  }]);
  const riz = u.get("prep_riz")!;
  assertEquals(repairabilityOf(riz, "densify").repairability, "frozen");
  assertEquals(repairabilityOf(riz, "densify").dissenting, 1, "Zoé est la dissidente");
});

Deno.test("⛔ MANGEURS — deux besoins OPPOSÉS gèlent dans les DEUX sens", () => {
  // Sonia doit densifier, Paul doit alléger. Aucune réécriture du riz ne les
  // sert tous les deux: le geler est la seule réponse honnête.
  const u = unites([{
    eaters: ["sonia", "paul"],
    uses: ["prep_riz"],
    verdicts: [["sonia", "over_max"], ["paul", "under_min"]],
  }]);
  const riz = u.get("prep_riz")!;
  assertEquals(repairabilityOf(riz, "densify").repairability, "frozen");
  assertEquals(repairabilityOf(riz, "lighten").repairability, "frozen");
});

Deno.test("MANGEURS — tous dans le même sens: la casserole bouge", () => {
  // ⛔ LA CONTRE-ÉPREUVE, ET ELLE EST INDISPENSABLE. Une règle qui gèle tout
  // ressemble trait pour trait à une règle qui marche: le plan ne se répare
  // jamais, et personne ne voit pourquoi.
  const u = unites([{
    eaters: ["sonia", "zoe"],
    uses: ["prep_riz"],
    verdicts: [["sonia", "over_max"], ["zoe", "over_max"]],
  }]);
  assertEquals(repairabilityOf(u.get("prep_riz")!, "densify").repairability, "reworkable");
});

Deno.test("MANGEURS — une casserole tirée par DEUX plats réunit leurs mangeurs", () => {
  // ⛔ L'UNION, PAS LE DERNIER PLAT VU. Le riz du déjeuner de Sonia et celui du
  // dîner de la table sont la MÊME casserole: la réécrire pour Sonia la réécrit
  // pour tout le monde, y compris ceux qui ne sont pas à son déjeuner.
  const u = unites([
    { eaters: ["sonia"], uses: ["prep_riz"], verdicts: [["sonia", "over_max"]] },
    {
      eaters: ["sonia", "paul"],
      uses: ["prep_riz"],
      verdicts: [["sonia", "over_max"], ["paul", "in_bounds"]],
    },
  ]);
  const riz = u.get("prep_riz")!;
  assertEquals([...riz.eaters].sort(), ["paul", "sonia"]);
  assertEquals(repairabilityOf(riz, "densify").repairability, "frozen");
});

Deno.test("⛔ MANGEURS — « pas besoin » n'est PAS « besoin du contraire »", () => {
  // ⛔ LE PIÈGE DE LA RÈGLE, ET IL EST SUBTIL. Écrite « aucun mangeur ne veut
  // l'inverse », elle serait presque toujours vraie: quelqu'un dans ses bornes
  // ne veut rien. Elle est écrite « CHAQUE mangeur en a besoin », et ce test
  // est ce qui les sépare.
  const u = unites([{
    eaters: ["sonia", "zoe"],
    uses: ["prep_riz"],
    verdicts: [["sonia", "over_max"], ["zoe", "in_bounds"]],
  }]);
  const riz = u.get("prep_riz")!;
  // Personne ne veut alléger — et pourtant densifier reste refusé.
  assertEquals([...riz.needs.values()].some((v) => v.has("lighten")), false);
  assertEquals(repairabilityOf(riz, "densify").repairability, "frozen");
});

Deno.test("MANGEURS — une unité sans mangeur ne se répare pas", () => {
  // Le repli est l'abstention: une casserole que personne ne mange est une
  // anomalie de lecture, pas une invitation à la réécrire.
  assertEquals(
    repairabilityOf({ eaters: new Set(), needs: new Map() }, "densify").repairability,
    "frozen",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ LE PLAT DÉDIÉ — le rattrapage quand tout est gelé
// ═══════════════════════════════════════════════════════════════════════════

const DENSIFIER: RepairAsk = { direction: "densify", currentPer100G: 113, aimPer100G: 176, floorPer100G: null, ceilingPer100G: null };
const ALLEGER: RepairAsk = { direction: "lighten", currentPer100G: 320, aimPer100G: 150, floorPer100G: 60, ceilingPer100G: null };

Deno.test("DÉDIÉ — tout gelé ⇒ un plat à son nom, dans SA direction", () => {
  const r = dedicatedRepairFor({
    memberId: "sonia",
    day: "mon",
    slot: "dinner",
    ask: DENSIFIER,
    freshRepairability: "frozen",
    pots: [{ id: "prep_riz", repairability: "frozen" }],
  });
  assertEquals(r, {
    memberId: "sonia",
    day: "mon",
    slot: "dinner",
    direction: "densify",
    aimPer100G: 176, floorPer100G: null,
  });
});

Deno.test("⛔ DÉDIÉ — la direction MAIGRE existe aussi, et c'est le même mécanisme", () => {
  // ⛔ CE N'EST PAS UN CAS D'ENFANT, C'EST UN CAS DE PERTE DE POIDS. Un plat
  // riche servi à quelqu'un en déficit passe SOUS son plancher d'assiette: sa
  // part tient dans trois cuillères. Il lui faut du VOLUME, exactement comme
  // l'autre avait besoin de densité.
  const r = dedicatedRepairFor({
    memberId: "paul",
    day: "tue",
    slot: "lunch",
    ask: ALLEGER,
    freshRepairability: "frozen",
    pots: [{ id: "prep_gratin", repairability: "frozen" }],
  })!;
  assertEquals(r.direction, "lighten");
  const texte = dedicatedDishInstruction([r])!;
  assert(texte.includes("bulky and light"), texte);
  // ⟳ RETOURNÉE LE 2026-09-08 : « alléger » demande une BANDE, pas un plafond.
  // Mesuré au tir SPLICE3 : « reste sous 145 » a rendu un bouillon à 58, et
  // l'assiette est passée de trop petite à trop grosse.
  assert(texte.includes("between 60 and 150 kcal per 100 g"), texte);
  assert(texte.includes("Below 60 the plate becomes enormous"), texte);
});

Deno.test("⛔ DÉDIÉ — tant qu'UNE unité bouge, on répare la recette", () => {
  // ⛔ AJOUTER UN PLAT PENDANT QU'ON POUVAIT RÉÉCRIRE CELUI QUI EXISTE fait deux
  // plats là où la personne en attendait un — et le second n'a été demandé par
  // personne.
  assertEquals(
    dedicatedRepairFor({
      memberId: "sonia",
      day: "mon",
      slot: "dinner",
      ask: DENSIFIER,
      freshRepairability: "reworkable",
      pots: [{ id: "prep_riz", repairability: "frozen" }],
    }),
    null,
    "le frais bouge encore",
  );
  assertEquals(
    dedicatedRepairFor({
      memberId: "sonia",
      day: "mon",
      slot: "dinner",
      ask: DENSIFIER,
      freshRepairability: "frozen",
      pots: [
        { id: "prep_riz", repairability: "frozen" },
        { id: "prep_poulet", repairability: "reworkable" },
      ],
    }),
    null,
    "une casserole bouge encore",
  );
});

Deno.test("⛔ DÉDIÉ — à UNE bouche, il ne se déclenche JAMAIS", () => {
  // ⛔ STRUCTUREL, PAS CONVENTIONNEL. Une bouche seule ne contredit personne:
  // `repairabilityOf` rend `reworkable` sur chacune de ses unités, donc
  // `dedicatedRepairFor` reçoit toujours au moins un `reworkable` et rend
  // `null`. C'est ce qui rend ce bloc inerte sur la lane solo — et c'est
  // pourquoi son câblage appartient à la lane du foyer.
  const u = unites([{
    eaters: ["m-solo"],
    uses: ["prep_riz", "prep_poulet"],
    verdicts: [["m-solo", "over_max"]],
  }]);
  const pots = [...u.entries()].map(([id, unit]) => ({
    id,
    repairability: repairabilityOf(unit, "densify").repairability,
  }));
  assertEquals(pots.every((p) => p.repairability === "reworkable"), true);
  assertEquals(
    dedicatedRepairFor({
      memberId: "m-solo",
      day: "mon",
      slot: "dinner",
      ask: DENSIFIER,
      freshRepairability: "reworkable",
      pots,
    }),
    null,
  );
});

Deno.test("⛔ DÉDIÉ — l'instruction ne porte NI PRÉNOM, NI KCAL DE JOURNÉE, NI KG", () => {
  // Même garde que `repairInstruction`, et pour la même raison: v33 a retiré le
  // corps de tout le monde, et un plat de rattrapage qui le rendrait par la
  // bande annulerait le lot entier. `for_member_id` est un identifiant, pas une
  // personne.
  const texte = dedicatedDishInstruction([{
    memberId: "m-sonia-42",
    day: "mon",
    slot: "dinner",
    direction: "densify",
    aimPer100G: 176, floorPer100G: null,
  }])!;
  assertEquals(texte.match(/\bkg\b/), null);
  assertEquals(texte.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/), null, "aucun kcal nu");
  assert(texte.includes('for_member_id "m-sonia-42"'));
  assert(texte.includes("nuts, cheese, oil, bread"), "les aliments sont NOMMÉS");
  assert(texte.includes("Do not touch any other dish"));
  assertEquals(dedicatedDishInstruction([]), null);
});

Deno.test("⛔ DENSITÉ — ce qu'on DEMANDE est plafonné, ce dont on a BESOIN ne l'est pas", () => {
  // ⛔ MESURÉ AU SECOND TIR DU 2026-09-08, ET C'EST CE QUI A CRÉÉ LA BORNE.
  // Le `max` sur les jours a exigé **389 kcal/100 g** au dîner: la veille de
  // cuisine ne porte qu'UN moment pour cette bouche, donc ce moment-là pèse la
  // journée entière. Le calcul est juste; l'exigence est intenable — aucun plat
  // ne tient 389 (un gratin fait 180, des lasagnes 150). Le modèle a rendu
  // 126,7, c'est-à-dire qu'il a ignoré la consigne.
  //
  // ⛔ ET UNE CONSIGNE INTENABLE EST PIRE QU'UNE CONSIGNE ABSENTE: elle apprend
  // au modèle que ces nombres-là sont décoratifs, sur toute la ligne.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — LE DÉCOR CHANGE, LA BORNE RESTE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE DÉCOR DISAIT `["mon", ["dinner"]]` AVEC UN RYTHME À QUATRE MOMENTS,
  // c'est-à-dire « la veille de cuisine ne porte qu'un moment, donc ce
  // moment-là pèse la journée entière ». C'était le BUG, pas la borne: une
  // grille rétrécie n'est pas un rythme rétréci. Le lot B le ferme, et ce
  // dîner-là vaut désormais sa part ordinaire.
  //
  // ⚠️ CE QUI FAIT VRAIMENT PORTER LA JOURNÉE À UN SEUL REPAS EXISTE ENCORE, et
  // c'est le cas légitime: un RYTHME déclaré à un seul repas. La personne mange
  // une fois par jour; son dîner porte sa journée; l'exigence est intenable et
  // la borne la nomme. Le même 389 → 250, par le chemin qui le mérite.
  const r = densite({
    rhythmSlots: ["dinner"],
    slotsByDay: new Map([["mon", ["dinner"]], ["tue", ["dinner"]]]),
  });
  const dinner = r.named.find((d) => d.slot === "dinner")!;
  assertEquals(dinner.kcalPer100G, MAX_ASKABLE_DENSITY_PER_100G);
  assertEquals(MAX_ASKABLE_DENSITY_PER_100G, 250);
  // ⛔ ET ÇA SE COMPTE. Une borne qui mordrait sur la population entière ne
  // serait plus une borne, ce serait LE calcul — ce dépôt l'a mesuré trois fois.
  assertEquals(r.counters.capped, 1);
  // ⚠️ LE BESOIN N'EST PAS PERDU: sans la borne, ce dîner exigeait bien plus.
  // Ce qui reste sort en `unmet_kcal` quand l'assiette plafonne, et c'est la
  // réponse honnête — « un seul repas ne peut pas porter la journée ».
  const sansVeille = densite().named.find((d) => d.slot === "dinner")!;
  assert(
    sansVeille.kcalPer100G < MAX_ASKABLE_DENSITY_PER_100G,
    "une journée ordinaire n'atteint pas la borne",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT 12 (2026-09-08) — LES COUVERCLES DE TOUTE LA TABLE, AUTORÉS
// ═══════════════════════════════════════════════════════════════════════════
//
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
//   Q1 — le frais d'un plat est multiplié par UN facteur au lieu de la SOMME:
//        une casserole pour une personne, trois assiettes vides. ROUGE.
//   Q2 — le bac porte la moyenne des parts au lieu de leur somme. ROUGE.
//   Q3 — la casserole moyenne les mangeurs: elle est divisée par leur nombre.
//        ROUGE.

function planForEaters() {
  return {
    dishes: [
      {
        day: "mon",
        slot: "dinner",
        ingredients: [ing("huile", 10)],
        uses: [{ preparationId: "p1" }],
        boxes: [],
      },
    ],
    preparations: [
      { id: "p1", title: "Riz au poulet", servingsMade: 9, ingredients: [ing("riz", 100), ing("poulet", 200)] },
    ],
  };
}

Deno.test("LOT 12 — une boîte par objectif, un bac pour les autres", () => {
  const out = applySizingForEaters({
    meal: planForEaters(),
    rows: [
      { dishIndex: 0, memberId: "paul", factor: 1.5, sized: true },
      { dishIndex: 0, memberId: "claire", factor: 1, sized: true },
      { dishIndex: 0, memberId: "leo", factor: 0.5, sized: true },
    ],
    weighed: new Set(["paul"]),
    index: INDEX,
  });
  const boxes = out.dishes[0].boxes;
  assertEquals(boxes.length, 2, "une boîte pour Paul, un bac pour les deux autres");
  assertEquals(out.counts.own_authored, 1);
  assertEquals(out.counts.tubs_authored, 1);
  const own = boxes.find((b: { memberIds: string[] }) => b.memberIds.length === 1);
  const tub = boxes.find((b: { memberIds: string[] }) => b.memberIds.length > 1);
  assertEquals(own.memberIds, ["paul"]);
  assertEquals(tub.memberIds, ["claire", "leo"]);
  // ⛔ LE BAC PORTE LA SOMME (1 + 0,5 = 1,5), PAS LA MOYENNE (0,75).
  const g = (b: { items: { grams: number }[] }) => b.items.reduce((a, i) => a + i.grams, 0);
  assertEquals(
    Math.round(g(tub) / g(own) * 100) / 100,
    1,
    "le bac de deux (Σ 1,5) doit peser comme la boîte de Paul (1,5)",
  );
});

Deno.test("LOT 12 — le FRAIS du plat est multiplié par la SOMME de ses mangeurs", () => {
  const un = applySizingForEaters({
    meal: planForEaters(),
    rows: [{ dishIndex: 0, memberId: "a", factor: 1, sized: true }],
    weighed: new Set(),
    index: INDEX,
  });
  const trois = applySizingForEaters({
    meal: planForEaters(),
    rows: [
      { dishIndex: 0, memberId: "a", factor: 1, sized: true },
      { dishIndex: 0, memberId: "b", factor: 1, sized: true },
      { dishIndex: 0, memberId: "c", factor: 1, sized: true },
    ],
    weighed: new Set(),
    index: INDEX,
  });
  const huile = (o: { dishes: { ingredients: { term: string; amount: number }[] }[] }) =>
    o.dishes[0].ingredients.find((x) => x.term === "huile")!.amount;
  assertEquals(huile(un), 10);
  assertEquals(huile(trois), 30, "trois mangeurs, trois fois le frais");
});

Deno.test("LOT 12 — la CASSEROLE somme les mangeurs, pas seulement les tirages", () => {
  const un = applySizingForEaters({
    meal: planForEaters(),
    rows: [{ dishIndex: 0, memberId: "a", factor: 1, sized: true }],
    weighed: new Set(),
    index: INDEX,
  });
  const quatre = applySizingForEaters({
    meal: planForEaters(),
    rows: ["a", "b", "c", "d"].map((memberId) => ({
      dishIndex: 0,
      memberId,
      factor: 1,
      sized: true,
    })),
    weighed: new Set(),
    index: INDEX,
  });
  const riz = (o: { preparations: { ingredients: { term: string; amount: number }[] }[] }) =>
    o.preparations[0].ingredients.find((x) => x.term === "riz")!.amount;
  assertEquals(riz(un), 100);
  assertEquals(riz(quatre), 400, "quatre bouches réclament quatre parts de casserole");
  // ⛔ ET LE NOMBRE DE PARTS SUIT LES TIRAGES, pas les bouches.
  assertEquals(quatre.preparations[0].servingsMade, 1);
});

Deno.test("LOT 12 — un mangeur seul au bac reçoit une BOÎTE, jamais un bac d'un", () => {
  const out = applySizingForEaters({
    meal: planForEaters(),
    rows: [
      { dishIndex: 0, memberId: "paul", factor: 1.5, sized: true },
      { dishIndex: 0, memberId: "claire", factor: 1, sized: true },
    ],
    weighed: new Set(["paul"]),
    index: INDEX,
  });
  assertEquals(out.counts.tubs_authored, 0);
  assertEquals(out.counts.own_authored, 2);
  for (const b of out.dishes[0].boxes) assertEquals(b.memberIds.length, 1);
});

Deno.test("LOT 12 — aucun terme neuf, et les ids de couvercle sont uniques", () => {
  const out = applySizingForEaters({
    meal: planForEaters(),
    rows: [
      { dishIndex: 0, memberId: "a", factor: 1, sized: true },
      { dishIndex: 0, memberId: "b", factor: 1, sized: true },
    ],
    weighed: new Set(["a", "b"]),
    index: INDEX,
  });
  const ids = out.dishes[0].boxes.map((b: { id: string }) => b.id);
  assertEquals(new Set(ids).size, ids.length, "deux couvercles portent le même id");
  const terms = new Set(
    out.dishes[0].boxes.flatMap((b: { items: { term: string }[] }) => b.items.map((i) => i.term)),
  );
  for (const t of terms) {
    assert(
      t === "Riz au poulet" || t === "huile",
      `terme neuf dans un couvercle: ${t}`,
    );
  }
});

Deno.test("LOT 12 — un plat qu'aucun mangeur ne dimensionne n'est pas touché", () => {
  const out = applySizingForEaters({
    meal: planForEaters(),
    rows: [{ dishIndex: 0, memberId: "a", factor: 1, sized: false }],
    weighed: new Set(),
    index: INDEX,
  });
  assertEquals(out.dishes[0].boxes, []);
  assertEquals(out.counts.dishes_unsized, 1);
  assertEquals(out.counts.eaters_unsized, 1);
});

Deno.test("CÂBLAGE — à plusieurs bouches, le chemin armé APPLIQUE, et par mangeur", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const branchAt = src.indexOf("      if (platedMembers.length > 1) {");
  const soloAt = src.indexOf("      const mouth = platedMembers[0];");
  const applyAt = src.indexOf("applySizingForEaters({");
  // ⛔ LE SITE D'APPEL, PAS UNE MENTION. `indexOf("applyHouseRuleLock(")` trouve
  // d'abord un COMMENTAIRE, mille lignes plus haut, qui explique justement
  // cette contrainte d'ordre — et la garde se comparait alors à sa propre
  // documentation. Deuxième fois que ce piège se referme sur ce chantier.
  const lockAt = src.indexOf("const lock = applyHouseRuleLock(");

  assert(branchAt > 0, "la table n'a pas de branche: elle retombe au solo");
  assert(branchAt < soloAt, "la branche de la table passe après le chemin d'une bouche");
  assert(applyAt > branchAt && applyAt < soloAt, "l'application n'est pas dans la branche");
  // ⛔ AVANT L'INSTANTANÉ DE LA CHARGE. `applyHouseRuleLock(mealDishesPayload(meal))`
  // fige les plats: des couvercles posés après lui n'atteindraient ni la RPC ni
  // l'aperçu — le défaut « iku 544 g / écran 400 g », par l'autre bout.
  assert(applyAt < lockAt, "les couvercles sont posés APRÈS l'instantané du plan");

  // ⛔ UN SEUL CALCUL. L'ombre mesure et rend ses lignes; la branche les pose.
  // Un second `sizeDishForEaters` dans la lane serait le contrefactuel et le
  // servi qui divergent.
  assertEquals(
    src.split("sizeDishForEaters({").length - 1,
    1,
    "le dimensionnement par mangeur est calculé deux fois",
  );
  // ⚠️ LA RÈGLE DES COUVERCLES EST APPELÉE, JAMAIS RECOPIÉE.
  assert(
    src.includes("weighed: new Set(\n            weighedPortionMembers(platedMembers).map((m) => m.memberId),\n          ),"),
    "la liste des bouches à boîte propre n'est pas `weighedPortionMembers`",
  );
  // ⚠️ ET LE RE-PESAGE SUIT L'APPLICATION: `gramsRaw` est un cache que le
  // module pur ne touche pas.
  const branch = src.slice(branchAt, soloAt);
  assert(branch.includes("regramMeal(meal, composition)"), "le plan n'est pas re-pesé");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT 13 (2026-09-08) — LA RÉPARATION D'UN PLAT QUE PLUSIEURS MANGENT
// ═══════════════════════════════════════════════════════════════════════════

const eaterAt = (
  verdict: SizingVerdict,
  targetKcal: number | null,
  bounds = BOUNDS_ADULTE,
  isMinor = false,
) => ({ verdict, targetKcal, bounds, isMinor });

const STD_DILUE = { kcal: 300, cookedG: 600, densityPer100G: 50, proteinG: null, pots: [], gaps: [] };
const STD_DENSE = { kcal: 900, cookedG: 300, densityPer100G: 300, proteinG: null, pots: [], gaps: [] };

Deno.test("LOT 13 — UN SEUL mangeur au-dessus du plafond suffit à densifier", () => {
  const out = repairDecisionForDish({
    standard: STD_DILUE,
    eaters: [eaterAt("over_max", 900), eaterAt("in_bounds", 400)],
  });
  assertEquals(out.ask?.direction, "densify");
  assertEquals(out.reason, "over_max");
  assertEquals(out.clampedEaters, 1);
});

Deno.test("LOT 13 — on densifie vers le PLUS EXIGEANT, jamais vers la moyenne", () => {
  const seul = repairDecisionForDish({
    standard: STD_DILUE,
    eaters: [eaterAt("over_max", 900)],
  });
  const deux = repairDecisionForDish({
    standard: STD_DILUE,
    eaters: [eaterAt("over_max", 900), eaterAt("over_max", 400)],
  });
  // ⛔ AJOUTER UN MANGEUR MOINS EXIGEANT NE DOIT PAS BAISSER LA CIBLE: le plus
  // contraint resterait au-dessus de sa borne, c'est-à-dire non nourri.
  assertEquals(deux.ask?.aimPer100G, seul.ask?.aimPer100G);
});

Deno.test("LOT 13 — ON N'ALLÈGE JAMAIS pour un enfant sur un plat partagé", () => {
  const out = repairDecisionForDish({
    standard: STD_DENSE,
    eaters: [
      eaterAt("under_min", 300, BOUNDS_ENFANT, true),
      eaterAt("under_min", 400, BOUNDS_ADULTE, false),
    ],
  });
  assertEquals(out.ask, null, "alléger servirait un volume que personne d'autre n'a demandé");
  assertEquals(out.reason, "minor_blocks_lighten");
  assertEquals(out.clampedEaters, 2, "les deux seront bornés, et ça se compte");
});

Deno.test("LOT 13 — on n'allège QUE si TOUT LE MONDE est sous son plancher", () => {
  const partiel = repairDecisionForDish({
    standard: STD_DENSE,
    eaters: [eaterAt("under_min", 300), eaterAt("in_bounds", 700)],
  });
  assertEquals(partiel.ask, null);
  assertEquals(partiel.reason, "partial_under_min");
  const tous = repairDecisionForDish({
    standard: STD_DENSE,
    eaters: [eaterAt("under_min", 300), eaterAt("under_min", 350)],
  });
  assertEquals(tous.ask?.direction, "lighten");
  assertEquals(tous.reason, "all_under_min");
});

Deno.test("LOT 13 — plafond ET plancher sur le même plat: on densifie, et on le dit", () => {
  const out = repairDecisionForDish({
    standard: STD_DILUE,
    eaters: [eaterAt("over_max", 900), eaterAt("under_min", 200)],
  });
  assertEquals(out.ask?.direction, "densify");
  assertEquals(
    out.reason,
    "conflict",
    "quelqu'un non nourri est plus grave qu'une assiette qui paraît petite",
  );
});

Deno.test("LOT 13 — tout le monde dans les bornes: aucune réparation", () => {
  const out = repairDecisionForDish({
    standard: STD,
    eaters: [eaterAt("in_bounds", 500), eaterAt("in_bounds", 600)],
  });
  assertEquals(out.ask, null);
  assertEquals(out.reason, "none");
  assertEquals(out.clampedEaters, 0);
});

Deno.test("LOT 13 — une densité illisible ne demande rien, et ne devine rien", () => {
  const out = repairDecisionForDish({
    standard: { kcal: null, cookedG: null, densityPer100G: null, proteinG: null, pots: [], gaps: ["x"] },
    eaters: [eaterAt("over_max", 900)],
  });
  assertEquals(out.ask, null);
  assertEquals(out.reason, "none");
});

Deno.test("LOT 13 — les deux règles de la table sont épinglées", () => {
  assertEquals(REPAIR_MINOR_NEVER_LIGHTEN, true);
  assertEquals(REPAIR_SHARED_LIGHTEN_REQUIRES_ALL, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE FRAIS EST UNE UNITÉ COMME UNE AUTRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LE FRAIS D'UN PLAT PARTAGÉ EST GELÉ dès qu'un mangeur ne veut pas la direction", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LA LANE LE DÉCLARAIT `reworkable` EN DUR (trouvé le 2026-09-08)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Sur un plat partagé, le frais est mangé par toute la table. Le densifier
  // pour Sonia, qui dépasse, enrichit l'assiette de Zoé, qui était dans ses
  // bornes — et Zoé ne le saura jamais, sa boîte est juste plus riche. C'est
  // très exactement le défaut que la règle des mangeurs existe pour empêcher,
  // et il n'était gardé que sur les casseroles.
  const partage = freshUnitOf({
    eaters: new Set(["sonia", "zoe"]),
    verdicts: new Map<string, SizingVerdict>([
      ["sonia", "over_max"],
      ["zoe", "in_bounds"],
    ]),
  });
  const verdict = repairabilityOf(partage, "densify");
  assertEquals(verdict.repairability, "frozen");
  // ⚠️ « PAS BESOIN » N'EST PAS « BESOIN DU CONTRAIRE »: Zoé, dans ses bornes,
  // n'inscrit aucune direction et DISSENT quand même. Écrite « personne ne veut
  // l'inverse », la règle serait presque toujours vraie et ne protégerait
  // personne.
  assertEquals(verdict.dissenting, 1);
});

Deno.test("⛔ LE FRAIS EST RÉÉCRIVABLE quand TOUS ses mangeurs vont dans le même sens", () => {
  // La contre-épreuve, sans laquelle la garde précédente bloquerait tout et
  // ressemblerait à une garde qui marche.
  const ensemble = freshUnitOf({
    eaters: new Set(["sonia", "zoe"]),
    verdicts: new Map<string, SizingVerdict>([
      ["sonia", "over_max"],
      ["zoe", "over_max"],
    ]),
  });
  assertEquals(repairabilityOf(ensemble, "densify").repairability, "reworkable");
  // ⛔ ET PAS DANS L'AUTRE SENS: alléger ce que deux personnes veulent densifier
  // les casserait toutes les deux.
  assertEquals(repairabilityOf(ensemble, "lighten").repairability, "frozen");
});

Deno.test("⛔ À UNE BOUCHE, LE FRAIS RESTE RÉÉCRIVABLE — le chemin solo ne bouge pas", () => {
  // Une bouche ne peut contredire personne: c'est la première ligne des cinq
  // cas, et c'est ce qui garantit que ce lot n'a rien changé au solo.
  const solo = freshUnitOf({
    eaters: new Set(["seul"]),
    verdicts: new Map<string, SizingVerdict>([["seul", "over_max"]]),
  });
  assertEquals(repairabilityOf(solo, "densify").repairability, "reworkable");
  assertEquals(repairabilityOf(solo, "densify").dissenting, 0);
});

Deno.test("⛔ LE FRAIS N'APPARTIENT QU'À SON PLAT — jamais l'union comme une casserole", () => {
  // La différence entre les deux sortes d'unité: une casserole tirée par le
  // déjeuner de Sonia et le dîner de la table a pour mangeurs Sonia ET toute la
  // table. Le frais d'un plat, lui, n'a que les mangeurs de CE plat.
  const fresh = freshUnitOf({
    eaters: new Set(["sonia"]),
    verdicts: new Map<string, SizingVerdict>([["sonia", "over_max"]]),
  });
  assertEquals([...fresh.eaters], ["sonia"]);
  const pots = potRepairability({
    dishes: [
      {
        eaters: new Set(["sonia"]),
        uses: [{ preparationId: "riz" }],
        verdicts: new Map<string, SizingVerdict>([["sonia", "over_max"]]),
      },
      {
        eaters: new Set(["paul", "zoe"]),
        uses: [{ preparationId: "riz" }],
        verdicts: new Map<string, SizingVerdict>([
          ["paul", "in_bounds"],
          ["zoe", "in_bounds"],
        ]),
      },
    ],
  });
  assertEquals([...pots.get("riz")!.eaters].sort(), ["paul", "sonia", "zoe"]);
  // Et la casserole partagée est donc GELÉE là où le frais de Sonia ne l'est pas.
  assertEquals(repairabilityOf(pots.get("riz")!, "densify").repairability, "frozen");
  assertEquals(repairabilityOf(fresh, "densify").repairability, "reworkable");
});

Deno.test("⛔ ALLÉGER porte un PLANCHER : sous lui l'assiette dépasse son plafond de masse", () => {
  // Mesuré au tir SPLICE3 : « reste sous N » sans plancher a produit un bouillon
  // à 57,8 kcal/100 g, et l'assiette est passée de trop petite à trop grosse.
  const standard = { kcal: 500, cookedG: 250, densityPer100G: 200, proteinG: null, pots: [], gaps: [] };
  const bounds = plateBoundsFor({ ageYears: 40, slot: "breakfast", slotTargetKcal: null, light: false, appetite: null });
  const eaters = [{ targetKcal: 400, bounds, verdict: "under_min" as const, isMinor: false }];
  const d = repairDecisionForDish({ standard, eaters });
  assert(d.ask !== null && d.ask.direction === "lighten");
  assert(d.ask.floorPer100G !== null && d.ask.floorPer100G >= 1, "aucun plancher sur « alléger »");
  // plancher = target ÷ max × 100, arrondi au-dessus ; plafond = target ÷ min × 100 ÷ 1,1
  assertEquals(d.ask.floorPer100G, Math.ceil((400 / bounds.max) * 100));
  assert(d.ask.floorPer100G < d.ask.aimPer100G, "le plancher dépasse le plafond");
  // ⟳ 2026-09-10 — ET DENSIFY EN PORTE UN AUSSI, DÉSORMAIS. Il n'en portait pas
  // parce que « le plafond de masse borne déjà »; c'était vrai du besoin, pas de
  // la consigne. Mesuré: 23 densités sur 40 sont revenues AU-DESSUS de ce qu'on
  // demandait, jusqu'à +63 % — un plat trop dense n'est pas un bonus, sa part
  // tient dans trois cuillères et déclenche la réparation inverse.
  const over = repairDecisionForDish({ standard: { ...standard, densityPer100G: 90, kcal: 225 }, eaters: [{ ...eaters[0], verdict: "over_max" as const }] });
  assert(over.ask !== null && over.ask.direction === "densify");
  assert(over.ask!.floorPer100G !== null && over.ask!.ceilingPer100G !== null, "densify sans couloir");
  assert(
    over.ask!.floorPer100G! <= over.ask!.aimPer100G &&
      over.ask!.aimPer100G <= over.ask!.ceilingPer100G!,
    "la visée densify sort de son couloir",
  );
});

Deno.test("⛔ le plat dédié « alléger » demande une BANDE, pas un simple plafond", () => {
  const txt = dedicatedDishInstruction([{ memberId: "m1", day: "wed", slot: "breakfast", direction: "lighten", aimPer100G: 145, floorPer100G: 58 }]);
  assert(txt !== null && txt.includes("between 58 and 145 kcal per 100 g"), "la bande n'est pas dite");
  assert(txt.includes("Below 58 the plate becomes enormous"), "la conséquence du plancher n'est pas dite");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑬ LE COMPLÉMENT — raboter la part gelée à la borne, l'entrée porte le reste
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-09 — décision du propriétaire : « dans le cas où tout est gelé,
// on diminue la portion et on ajoute de la calorie dans l'entrée ».

import { absorbIndexInto, complementAskFor, COMPLEMENT_PLATE_SHARE, splitPlateWithComplement } from "./portion_sizing.ts";

const ADULTE_DINER = { min: 250, max: 700, band: "adult", slotClass: "meal", source: "age_known", appetiteFactor: 1 } as unknown as Parameters<typeof splitPlateWithComplement>[0]["bounds"];
/** Un plat partagé à 90 kcal/100 g : 800 kcal ⇒ 889 g, au-dessus des 700. */
const DILUE = { kcal: 450, cookedG: 500, densityPer100G: 90, proteinG: null, pots: [], gaps: [] };

Deno.test("COMPLÉMENT — trop gros : la part partagée descend à la BORNE et l'entrée porte exactement ce qui manque", () => {
  // Pain-fromage à 300 kcal/100 g.
  const entree = { kcal: 300, cookedG: 100, densityPer100G: 300, proteinG: null, pots: [], gaps: [] };
  const s = splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" })!;
  assert(s !== null, "insoluble alors que l'entrée est plus dense");
  assertEquals(s.bound, "max");
  // masse totale = 700, énergie totale = 800 : deux équations, deux inconnues.
  assertEquals(s.sharedG + s.complementG, 700);
  const kcal = s.sharedFactor * DILUE.kcal + s.complementFactor * entree.kcal;
  assert(Math.abs(kcal - 800) < 1, `énergie ${kcal}`);
  // gC = (800 − 700×0,9) ÷ (3 − 0,9) = 170 ÷ 2,1 ≈ 81 g
  assertEquals(s.complementG, 81);
  assertEquals(s.sharedG, 619);
  assert(Math.abs(s.complementKcal - 243) <= 1, `${s.complementKcal}`);
});

Deno.test("⛔ COMPLÉMENT — une entrée MOINS dense que le plat ne résout pas un « trop gros » : null, jamais « presque »", () => {
  const bouillon = { kcal: 58, cookedG: 100, densityPer100G: 58, proteinG: null, pots: [], gaps: [] };
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: bouillon, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" }), null);
  // ⛔ ET UNE ENTRÉE À PEINE PLUS DENSE, qui prendrait TOUTE l'assiette : null aussi.
  const tiede = { kcal: 100, cookedG: 100, densityPer100G: 100, proteinG: null, pots: [], gaps: [] };
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: tiede, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" }), null);
});

Deno.test("COMPLÉMENT — trop petit : la part partagée MONTE à la borne basse et une entrée légère prend le reste", () => {
  // Gratin à 250 kcal/100 g ; 450 kcal ⇒ 180 g, sous les 250 g.
  const dense = { kcal: 500, cookedG: 200, densityPer100G: 250, proteinG: null, pots: [], gaps: [] };
  const salade = { kcal: 40, cookedG: 100, densityPer100G: 40, proteinG: null, pots: [], gaps: [] };
  const s = splitPlateWithComplement({ shared: dense, complement: salade, targetKcal: 450, bounds: ADULTE_DINER, verdict: "under_min" })!;
  assert(s !== null);
  assertEquals(s.bound, "min");
  assertEquals(s.sharedG + s.complementG, 250);
  const kcal = s.sharedFactor * dense.kcal + s.complementFactor * salade.kcal;
  assert(Math.abs(kcal - 450) < 1, `énergie ${kcal}`);
  // ⛔ une entrée PLUS dense que le plat ne résout pas un « trop petit ».
  assertEquals(splitPlateWithComplement({ shared: dense, complement: { ...dense }, targetKcal: 450, bounds: ADULTE_DINER, verdict: "under_min" }), null);
});

Deno.test("⛔ COMPLÉMENT — rien à compléter (dans les bornes, impesable) ⇒ null", () => {
  const entree = { kcal: 300, cookedG: 100, densityPer100G: 300, proteinG: null, pots: [], gaps: [] };
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: 800, bounds: ADULTE_DINER, verdict: "in_bounds" }), null);
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: 800, bounds: ADULTE_DINER, verdict: "unmeasurable" }), null);
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: { ...entree, kcal: null, densityPer100G: null, gaps: ["x"] }, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" }), null);
  assertEquals(splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: null, bounds: ADULTE_DINER, verdict: "over_max" }), null);
});

Deno.test("COMPLÉMENT — la densité DEMANDÉE donne à l'entrée un cinquième de l'assiette, pas la moitié", () => {
  const ask = complementAskFor({ shared: DILUE, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" })!;
  assert(ask !== null);
  assertEquals(ask.direction, "densify");
  assertEquals(ask.floorPer100G, null);
  // ρc = 0,9 + (800 − 630) ÷ (0,2 × 700) = 0,9 + 1,214 ⇒ 212 kcal/100 g
  assertEquals(ask.aimPer100G, 212);
  // ⛔ LA CONTRE-ÉPREUVE : à cette densité, l'entrée fait `COMPLEMENT_PLATE_SHARE` × max.
  const entree = { kcal: 212, cookedG: 100, densityPer100G: 212, proteinG: null, pots: [], gaps: [] };
  const s = splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: 800, bounds: ADULTE_DINER, verdict: "over_max" })!;
  assert(Math.abs(s.complementG - COMPLEMENT_PLATE_SHARE * 700) <= 1, `${s.complementG}`);
  // ⛔ ET PAS LA RÈGLE SOLO SUR UNE LIGNE (cible ÷ plafond × 1,1 = 126) : à 126,
  // l'entrée prendrait 170 ÷ 0,36 = 472 g, les deux tiers de l'assiette.
  const solo = repairDecisionForDish({ standard: DILUE, eaters: [{ verdict: "over_max", targetKcal: 800, bounds: ADULTE_DINER, isMinor: false }] }).ask!;
  assert(solo.aimPer100G < ask.aimPer100G, "la demande solo n'est pas plus basse");
  // trop petit : la moitié de la densité du plat, sans plancher.
  const dense = { kcal: 500, cookedG: 200, densityPer100G: 250, proteinG: null, pots: [], gaps: [] };
  const light = complementAskFor({ shared: dense, targetKcal: 450, bounds: ADULTE_DINER, verdict: "under_min" })!;
  assertEquals(light, { direction: "lighten", currentPer100G: 250, floorPer100G: null, ceilingPer100G: null, aimPer100G: 125 });
  assertEquals(complementAskFor({ shared: DILUE, targetKcal: 800, bounds: ADULTE_DINER, verdict: "in_bounds" }), null);
});

Deno.test("COMPLÉMENT — l'instruction dit au modèle que la personne GARDE le plat partagé, et ne porte ni kcal nu ni kg", () => {
  const txt = dedicatedDishInstruction([{ memberId: "m-1", day: "mon", slot: "dinner", direction: "densify", aimPer100G: 212, floorPer100G: null }])!;
  assert(txt.includes("keeps eating the shared dish"), txt);
  assert(txt.includes("sizes this side dish to the difference"), txt);
  assert(txt.includes("at least 212 kcal per 100 g"), txt);
  assertEquals(txt.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/), null, "aucun kcal nu");
  assertEquals(txt.match(/\bkg\b/), null);
  const leger = dedicatedDishInstruction([{ memberId: "m-1", day: "mon", slot: "dinner", direction: "lighten", aimPer100G: 125, floorPer100G: null }])!;
  assert(leger.includes("at or under 125 kcal per 100 g"), leger);
  assert(!leger.includes("Below 0"), "un plancher nul est dit « 0 »");
});

Deno.test("absorbIndexInto — copie les entrées NEUVES en place, n'écrase rien, jette un alias sans slug", () => {
  const a = { slug: "a", energyKcal: 100 } as unknown as Parameters<typeof absorbIndexInto>[0]["bySlug"] extends ReadonlyMap<string, infer R> ? R : never;
  const target = { bySlug: new Map([["a", a]]), byAlias: new Map([["aa", "a"]]) };
  const b = { ...a, slug: "b" };
  const source = { bySlug: new Map([["a", { ...a, energyKcal: 999 }], ["b", b]]), byAlias: new Map([["bb", "b"], ["zz", "z"]]) };
  const out = absorbIndexInto(target, source);
  assertEquals(out, { slugs_added: 1, aliases_added: 1 });
  assertEquals((target.bySlug.get("a") as { energyKcal: number }).energyKcal, 100, "une entrée présente a été écrasée");
  assertEquals(target.bySlug.get("b"), b);
  assertEquals(target.byAlias.get("bb"), "b");
  assertEquals(target.byAlias.has("zz"), false);
});
