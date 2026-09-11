/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT E — CONTRÔLER LE PLAN RÉELLEMENT LIVRABLE (2026-09-11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, lot E.
 * Preuves   : `docs/keel/REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md` § 2 et § 7,
 *             `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-MESURE-2026-09-11.md`.
 *
 * ── LES TROIS DÉFAUTS QUE CES ÉPREUVES GARDENT, ET ILS SONT CHIFFRÉS ──────
 *
 * ① `final_gate.ok = true` sortait avec `energy: null`, `boxContract: null` et
 *   `energy_unmeasured: 1`. **Deux cases** — PERTE samedi déjeuner, GAIN
 *   vendredi dîner — avaient une recette, un titre, une méthode, et ZÉRO
 *   contenant. « Le plat existe » n'est pas « la portion est calculée ».
 *
 * ② **8 alertes `ingredient_not_bought` sur 9 étaient fausses**, toutes des
 *   singuliers/pluriels : `citron`/`citrons`, `tomate`/`tomates` (PERTE) et
 *   `carotte`/`carottes`, `citron`/`citrons`, `oignon`/`oignons`,
 *   `pita complète`/`pitas complètes`, `pomme de terre`/`pommes de terre`,
 *   `tomate`/`tomates` (GAIN). Et la SUFFISANCE des quantités n'était
 *   contrôlée nulle part.
 *
 * ③ Le plancher protéique de Paul vaut **176 g** ; sa seule journée complète et
 *   mesurable en porte **126,1 — soit −28 %**, et rien ne le refusait, ni même
 *   ne le disait. « Non applicable » était faux : c'est « non contrôlé ».
 *
 * ⛔ CHAQUE ÉPREUVE PORTE UN CAS QUI PASSE **ET** UN CAS QUI MORD. Une garde
 * qui ne mord jamais ressemble trait pour trait à une garde qui marche ; une
 * garde qui refuse tout aussi.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  type AuditCell,
  cellNutritionTable,
  COVERED_DAY_ENERGY_TOLERANCE,
  dayNutritionTable,
  foodIdentityOf,
  MEAL_ENERGY_TOLERANCE,
  proteinFloorAllocation,
  SHOPPING_SHORT_TOLERANCE,
  shoppingIdentityAudit,
} from "./final_plan_audit.ts";
import {
  DELIVERY_STATES,
  FINAL_GATE_CAUSES,
  FINAL_GATE_POLICY_LOT_1,
  FINAL_GATE_POLICY_LOT_4,
  finalGateDelivery,
  finalPlanGate,
  type GateContext,
  type GatePlan,
  type GateRefusal,
} from "./final_plan_gate.ts";
import {
  chooseReplacement,
  defectsFromRefusals,
  judgeCandidate,
  planRepairPass,
  type RepairDefect,
} from "./plan_repair_loop.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — les aliments des deux plans de la campagne, et LEURS alias réels
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

const REFS: CompositionRef[] = [
  ref({ slug: "lemon", foodGroupRef: "other_fruit", energyKcal: 29, proteinG: 1 }),
  ref({ slug: "tomato", energyKcal: 18, proteinG: 0.9 }),
  ref({ slug: "onion", energyKcal: 40, proteinG: 1.1 }),
  ref({ slug: "carrot", energyKcal: 41, proteinG: 0.9 }),
  ref({ slug: "potato", foodGroupRef: "starchy_veg", energyKcal: 77, proteinG: 2 }),
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
    slug: "chicken_breast",
    foodGroupRef: "poultry",
    energyKcal: 165,
    proteinG: 31,
    yieldClass: "meat_shrinks",
  }),
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    proteinG: 7,
    yieldClass: "grain_absorbs",
  }),
  ref({ slug: "salt", foodGroupRef: "sauce_dressing", energyKcal: 0, proteinG: 0, condimentGrams: 0.5 }),
  ref({ slug: "peanut", foodGroupRef: "nuts_seeds", energyKcal: 567, proteinG: 26, energyDense: true }),
];

/**
 * ⚠️ LA TABLE D'ALIAS EST CELLE DE LA BASE, ET SON ASYMÉTRIE EST LE POINT.
 * Le singulier ET le pluriel sont des alias pour les cinq légumes/fruits ;
 * pour la pita, la base porte « pitas completes » et **PAS** « pita complète »
 * (relevé du lot A). Cette ligne-là ne se résout donc QUE par son identifiant —
 * et c'est la démonstration la plus courte que le lot ferme le défaut par
 * l'IDENTITÉ et pas par un alias de plus.
 */
const INDEX: CompositionIndex = buildCompositionIndex(REFS, [
  { alias: "citron", slug: "lemon" },
  { alias: "citrons", slug: "lemon" },
  { alias: "tomate", slug: "tomato" },
  { alias: "tomates", slug: "tomato" },
  { alias: "oignon", slug: "onion" },
  { alias: "oignons", slug: "onion" },
  { alias: "carotte", slug: "carrot" },
  { alias: "carottes", slug: "carrot" },
  { alias: "pomme de terre", slug: "potato" },
  { alias: "pommes de terre", slug: "potato" },
  { alias: "pitas completes", slug: "pita_wholemeal" },
  { alias: "riz", slug: "white_rice" },
  { alias: "blanc de poulet", slug: "chicken_breast" },
  { alias: "sel", slug: "salt" },
  { alias: "arachide", slug: "peanut" },
]);

/**
 * L'ANCIENNE RÈGLE, RECOPIÉE ICI COMME TÉMOIN — et nulle part ailleurs.
 *
 * ⛔ C'EST LE CORPS EXACT DE `final_plan_gate.ts::covers()`, retiré par ce lot.
 * Le garder ici EST l'épreuve : sans lui, « les 8 faux positifs ont disparu »
 * serait une affirmation sur du code qui n'existe plus, donc invérifiable.
 */
function ancienCovers(have: string, needle: string): boolean {
  if (!have || !needle) return false;
  if (have === needle) return true;
  return have.length >= 3 && needle.includes(have);
}

/** Les six couples nommés par la revue, dans les deux plans. */
const PLURIELS: readonly (readonly [string, string, string])[] = [
  ["citron", "citrons", "lemon"],
  ["tomate", "tomates", "tomato"],
  ["oignon", "oignons", "onion"],
  ["carotte", "carottes", "carrot"],
  ["pomme de terre", "pommes de terre", "potato"],
  ["pita complète", "pitas complètes", "pita_wholemeal"],
];

/** Un plan minimal dont les ingrédients sont au singulier et les courses au pluriel. */
function planDesPluriels(): GatePlan {
  return {
    dishes: [{
      title: "Salade et pita",
      name: "Salade et pita",
      day: "fri",
      slot: "dinner",
      method: "Assembler.",
      why: "",
      member_id: null,
      ingredients: PLURIELS.map(([singulier, , slug]) => ({
        term: singulier,
        group: null,
        // ⛔ LE MODÈLE A ÉCRIT L'IDENTIFIANT. C'est le fait mesuré du lot A :
        // 49 lignes sur 49 côté GAIN, aucune refusée.
        ref: slug,
        ref_refused: false,
        amount: 100,
        unit: "g",
        state: "raw",
      })) as unknown as GatePlan["dishes"][number]["ingredients"],
      uses: [],
      boxes: [],
    }],
    preparations: [],
    cooking_sessions: [],
    shopping_list: PLURIELS.map(([, pluriel]) => ({
      term: pluriel,
      quantity: "500 g",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-11",
      freeze_on_purchase: false,
    })),
  } as unknown as GatePlan;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES HUIT FAUX MANQUES PAR PLURIEL
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① LE CAS QUI MORD — l'ancienne règle produisait bien les 8 alertes", () => {
  // Sans ce témoin, l'épreuve suivante dirait seulement « la nouvelle règle ne
  // se plaint pas », ce qui est aussi vrai d'une règle débranchée.
  let fausses = 0;
  for (const [singulier, pluriel] of PLURIELS) {
    if (!ancienCovers(pluriel, singulier)) fausses++;
  }
  assertEquals(fausses, 6, "les six couples nommés par la revue échouaient tous");
  // Et la moitié qui explique POURQUOI : l'inclusion était asymétrique.
  assert(ancienCovers("tomate", "tomates cerises"), "le sens qui marchait");
  assert(!ancienCovers("tomates", "tomate"), "le sens que le modèle écrit");
});

Deno.test("① les huit faux manques par pluriel disparaissent", () => {
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: planDesPluriels() as unknown as Record<string, unknown>,
    pantryTerms: [],
  });
  assertEquals(audit.identities, 6, "six identités, pas douze libellés");
  assertEquals(audit.rows.filter((r) => r.state === "not_bought").length, 0);
  // ⛔ ET ELLES SONT VÉRIFIÉES, pas seulement silencieuses : 100 g requis,
  // 500 g achetés sur chacune des six.
  assertEquals(audit.quantified, 6);
  for (const r of audit.rows) assertEquals(r.state, "covered_measured", r.identity);
  // La pita est la preuve la plus courte : « pita complète » n'a AUCUN alias.
  assertEquals(foodIdentityOf(INDEX, { term: "pita complète" }).source, "unresolved");
  assertEquals(
    foodIdentityOf(INDEX, { term: "pita complète", ref: "pita_wholemeal" }).identity,
    "pita_wholemeal",
  );
});

Deno.test("① LE CAS QUI MORD — retirer réellement un ingrédient de la liste", () => {
  const plan = planDesPluriels() as unknown as Record<string, unknown>;
  // On retire la ligne « citrons » : personne n'achète plus le citron.
  plan.shopping_list = (plan.shopping_list as { term: string }[]).filter(
    (l) => l.term !== "citrons",
  );
  const audit = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  const manques = audit.rows.filter((r) => r.state === "not_bought");
  assertEquals(manques.length, 1);
  assertEquals(manques[0].identity, "lemon");
  assertEquals(manques[0].displayTerm, "citron");
});

Deno.test("② LE CAS QUI MORD — sous-acheter une quantité", () => {
  const plan = planDesPluriels() as unknown as Record<string, unknown>;
  // 40 g de citrons achetés pour 100 g requis : présent, et insuffisant.
  for (const l of plan.shopping_list as { term: string; quantity: string }[]) {
    if (l.term === "citrons") l.quantity = "40 g";
  }
  const audit = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  const courts = audit.rows.filter((r) => r.state === "short");
  assertEquals(courts.length, 1);
  assertEquals(courts[0].identity, "lemon");
  assertAlmostEquals(courts[0].boughtRawG ?? -1, 40, 0.001);
  assertAlmostEquals(courts[0].neededRawG ?? -1, 100, 0.001);
  // LE CAS QUI PASSE, À CÔTÉ : exactement 100 g suffit.
  for (const l of plan.shopping_list as { term: string; quantity: string }[]) {
    if (l.term === "citrons") l.quantity = "100 g";
  }
  const assez = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  assertEquals(assez.rows.filter((r) => r.state === "short").length, 0);
});

Deno.test("③ le garde-manger déclare une PRÉSENCE, jamais un stock", () => {
  const plan = planDesPluriels() as unknown as Record<string, unknown>;
  plan.shopping_list = (plan.shopping_list as { term: string }[]).filter(
    (l) => l.term !== "citrons",
  );
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: ["citron"],
  });
  const ligne = audit.rows.find((r) => r.identity === "lemon");
  // ⛔ NI `not_bought` (il est là) NI `covered_measured` (on ne sait pas combien).
  assertEquals(ligne?.state, "present_unquantified");
  assertEquals(ligne?.boughtRawG, null);
  assertEquals(ligne?.inPantry, true);
  // LE CAS QUI PASSE : la même identité ACHETÉE avec sa quantité est mesurée.
  const achete = shoppingIdentityAudit({
    index: INDEX,
    plan: planDesPluriels() as unknown as Record<string, unknown>,
    pantryTerms: [],
  });
  assertEquals(achete.rows.find((r) => r.identity === "lemon")?.state, "covered_measured");
});

Deno.test("③ un conditionnement non convertible est un contrôle INCOMPLET", () => {
  const plan = planDesPluriels() as unknown as Record<string, unknown>;
  for (const l of plan.shopping_list as { term: string; quantity: string }[]) {
    if (l.term === "citrons") l.quantity = "2 filets";
  }
  const audit = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  const ligne = audit.rows.find((r) => r.identity === "lemon");
  assertEquals(ligne?.state, "check_incomplete");
  // ⛔ AUCUN MANQUE CHIFFRÉ N'EST INVENTÉ.
  assertEquals(ligne?.boughtRawG, null);
  assertEquals(audit.rows.filter((r) => r.state === "short").length, 0);
});

Deno.test("③ l'alias EXPLICITE du plan : le même libellé des deux côtés", () => {
  // ⛔ LE FAUX POSITIF NEUF QUE CE LOT AURAIT CRÉÉ. L'ingrédient porte
  // `ref: pita_wholemeal`, la ligne de courses n'en porte aucun et « pita
  // complète » n'a AUCUN alias au référentiel. Les deux côtés partaient donc
  // sur deux identités — et le produit était sur la liste, au caractère près.
  // Mesuré sur les fixtures : trois faux manques (`pita complète`, `agneau`,
  // `petits-suisses nature`).
  const plan = {
    dishes: [{
      day: "fri",
      slot: "dinner",
      ingredients: [
        { term: "pita complète", ref: "pita_wholemeal", amount: 1, unit: "unit", state: "raw" },
      ],
      uses: [],
      boxes: [],
    }],
    preparations: [],
    shopping_list: [{ term: "pita complète", quantity: "120 g", aisle: "bakery" }],
  };
  const audit = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  assertEquals(audit.identities, 1, "une seule identité, pas deux");
  assertEquals(audit.rows[0].identity, "pita_wholemeal");
  assertEquals(audit.rows[0].state, "covered_measured");
  assertAlmostEquals(audit.rows[0].boughtRawG ?? -1, 120, 0.001);
  // ⛔ LE CAS QUI MORD : l'égalité est EXACTE après normalisation, jamais une
  // sous-chaîne. Un libellé DIFFÉRENT n'hérite de rien — sinon on aurait
  // remplacé `covers()` par un matcher maison (« lait » dans « laitue »).
  const autre = shoppingIdentityAudit({
    index: INDEX,
    plan: { ...plan, shopping_list: [{ term: "pain pita", quantity: "120 g", aisle: "bakery" }] },
    pantryTerms: [],
  });
  assertEquals(autre.rows.find((r) => r.identity === "pita_wholemeal")?.state, "not_bought");
});

Deno.test("③ un arrondi de panier n'est pas un manque, 10 % en est un", () => {
  assertEquals(SHOPPING_SHORT_TOLERANCE, 0.05, "⛔ ne pas élargir pour faire passer un banc");
  const faire = (achete: string) =>
    shoppingIdentityAudit({
      index: INDEX,
      plan: {
        dishes: [{
          day: "fri",
          slot: "dinner",
          ingredients: [{ term: "tomate", ref: "tomato", amount: 446.82, unit: "g", state: "raw" }],
          uses: [],
          boxes: [],
        }],
        preparations: [],
        shopping_list: [{ term: "tomates", quantity: achete, aisle: "produce" }],
      },
      pantryTerms: [],
    }).rows[0];
  // 440 g pour 446,82 requis : 1,5 % — un arrondi de panier.
  assertEquals(faire("440 g").state, "covered_measured");
  // 400 g pour 446,82 : 10,5 % — le sous-achat RÉEL mesuré sur PERTE.
  assertEquals(faire("400 g").state, "short");
});

Deno.test("④ le besoin est en poids CRU/ACHETABLE, jamais la masse cuite", () => {
  // 260 g de riz CUIT ; le référentiel dit qu'il en faut 100 g crus
  // (`grain_absorbs`, facteur 2,6). On achète du riz cru.
  const plan = {
    dishes: [{
      day: "fri",
      slot: "dinner",
      ingredients: [
        { term: "riz", amount: 260, unit: "g", state: "cooked" },
      ],
      uses: [],
      boxes: [{ id: "b1", member_ids: ["m1"], items: [{ term: "riz", grams: 260 }] }],
    }],
    preparations: [],
    shopping_list: [{ term: "riz", quantity: "100 g", aisle: "grains" }],
  };
  const audit = shoppingIdentityAudit({ index: INDEX, plan, pantryTerms: [] });
  const ligne = audit.rows.find((r) => r.identity === "white_rice");
  assertAlmostEquals(ligne?.neededRawG ?? -1, 100, 0.001);
  assertEquals(ligne?.state, "covered_measured");
  // LE CAS QUI MORD : si l'on avait compté les 260 g de la boîte, 100 g achetés
  // auraient été un manque. Le test échoue si quelqu'un rebranche la boîte.
  assert((ligne?.neededRawG ?? 0) < 200, "la masse CUITE ne doit pas être le besoin");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE CASE SANS PORTION NE PASSE PAS PARCE QUE SON TITRE EXISTE
// ═══════════════════════════════════════════════════════════════════════════

/** Le cas mesuré : une recette complète, et zéro contenant. */
const PLAN_SANS_BOITE = {
  dishes: [{
    title: "Salade de poulet grillé et pita complète",
    day: "sat",
    slot: "lunch",
    method: "Griller le poulet, garnir la pita.",
    ingredients: [
      { term: "blanc de poulet", ref: "chicken_breast", amount: 150, unit: "g", state: "raw" },
      { term: "pita complète", ref: "pita_wholemeal", amount: 1, unit: "unit", state: "raw" },
    ],
    uses: [],
    boxes: [],
  }],
  preparations: [],
  shopping_list: [],
};

const CELL_SAT_LUNCH: AuditCell = {
  memberId: "m1",
  day: "sat",
  date: "2026-09-12",
  slot: "lunch",
  targetKcal: 700,
  gramsMin: null,
  gramsMax: null,
  densityMin: null,
  densityMax: null,
};

Deno.test("⑤ un titre n'est pas une portion — la case sort `no_portion`", () => {
  const rows = cellNutritionTable({
    index: INDEX,
    plan: PLAN_SANS_BOITE,
    cells: [CELL_SAT_LUNCH],
    // Cette lane dimensionne des portions personnelles : chaque case en doit une.
    portionsArePersonal: true,
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].hasDish, true, "le plat EXISTE — c'est tout le piège");
  assertEquals(rows[0].hasPortion, false);
  assertEquals(rows[0].state, "no_portion");
  assertEquals(rows[0].servedKcal, null);
});

Deno.test("⑤ LE CAS QUI PASSE — un plat de TABLE n'est pas une case oubliée", () => {
  const rows = cellNutritionTable({
    index: INDEX,
    plan: PLAN_SANS_BOITE,
    cells: [CELL_SAT_LUNCH],
    // Les portions ne sont pas individualisées : on mange dans le plat.
    portionsArePersonal: false,
  });
  assertEquals(rows[0].state, "not_personal");
  assertEquals(rows[0].portionExpected, false);
});

Deno.test("⑤ la garde REFUSE la case sans portion, et seulement elle", () => {
  const rows = cellNutritionTable({
    index: INDEX,
    plan: PLAN_SANS_BOITE,
    cells: [CELL_SAT_LUNCH],
    portionsArePersonal: true,
  });
  const outcome = finalPlanGate(minimalPlan(), ctxAvec({ cells: rows, days: [] }));
  assertEquals(outcome.counters.refusals_by_cause.cell_without_portion, 1);
  assertEquals(outcome.counters.checked.portion_cells, 1);
  // ⛔ SOUS LE LOT 4 ELLE MORD VRAIMENT, et la livraison bascule.
  const strict = finalPlanGate(
    minimalPlan(),
    { ...ctxAvec({ cells: rows, days: [] }), policy: FINAL_GATE_POLICY_LOT_4 },
  );
  assertEquals(strict.ok, false);
  assertEquals(finalGateDelivery(strict).state, "not_deliverable");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA PORTION PARTAGÉE EST ATTRIBUABLE À CHACUN DE SES CONSOMMATEURS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ un bac partagé donne sa part à chacun, et le DIT", () => {
  const plan = {
    dishes: [{
      day: "fri",
      slot: "dinner",
      ingredients: [{ term: "riz", ref: "white_rice", amount: 200, unit: "g", state: "raw" }],
      uses: [],
      boxes: [{
        id: "bac",
        member_ids: ["m1", "m2"],
        items: [{ term: "riz", grams: 200 }],
      }],
    }],
    preparations: [],
    shopping_list: [],
  };
  const cells: AuditCell[] = ["m1", "m2"].map((memberId) => ({
    memberId,
    day: "fri",
    date: "2026-09-11",
    slot: "dinner",
    targetKcal: 350,
    gramsMin: null,
    gramsMax: null,
    densityMin: null,
    densityMax: null,
  }));
  const rows = cellNutritionTable({ index: INDEX, plan, cells, portionsArePersonal: true });
  assertEquals(rows.length, 2);
  for (const r of rows) {
    // 200 g à 350 kcal/100 g = 700 kcal dans le BAC ; 350 pour chacun des deux.
    assertAlmostEquals(r.servedKcal ?? -1, 350, 0.001);
    assertAlmostEquals(r.grams ?? -1, 100, 0.001);
    assertEquals(r.sharedWith, 2, "la case DIT qu'elle porte une part, pas une pesée");
    assertEquals(r.state, "conforme");
  }
  // LE CAS QUI MORD : le même bac pour UNE bouche vaut 700, pas 350.
  const solo = cellNutritionTable({
    index: INDEX,
    plan: {
      ...plan,
      dishes: [{ ...plan.dishes[0], boxes: [{ ...plan.dishes[0].boxes[0], member_ids: ["m1"] }] }],
    },
    cells: [cells[0]],
    portionsArePersonal: true,
  });
  assertAlmostEquals(solo[0].servedKcal ?? -1, 700, 0.001);
  assertEquals(solo[0].sharedWith, 1);
  assertEquals(solo[0].state, "energy_off");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ PAS DE COMPENSATION ENTRE JOURS NI ENTRE PERSONNES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ +30 % un jour et −30 % l'autre font DEUX écarts, pas une somme nulle", () => {
  const cells = [
    cellRow({ memberId: "m1", date: "2026-09-12", servedKcal: 1300, targetKcal: 1000 }),
    cellRow({ memberId: "m1", date: "2026-09-13", servedKcal: 700, targetKcal: 1000 }),
  ];
  const outcome = finalPlanGate(minimalPlan(), ctxAvec({ cells, days: [] }));
  assertEquals(outcome.counters.refusals_by_cause.cell_energy_off, 2);
  // ⛔ LE TÉMOIN : l'agrégat par BOUCHE, lui, est parfait — 2 000 servies pour
  // 2 000 attendues. C'est exactement ce que `ctx.energy` seul laissait passer.
  const parBouche = finalPlanGate(minimalPlan(), {
    ...ctxAvec({ cells: [], days: [] }),
    energy: [{ memberId: "m1", envelopeKcal: 2000, deliveredKcal: 2000 }],
  });
  assertEquals(parBouche.counters.refusals_by_cause.mouth_energy_short, 0);
  assertEquals(parBouche.counters.checked.energy_mouths, 1);
});

Deno.test("⑦ LE CAS QUI PASSE — ±10 % exactement ne mord pas, un pas de plus mord", () => {
  const dedans = finalPlanGate(minimalPlan(), ctxAvec({
    cells: [cellRow({ memberId: "m1", date: "2026-09-12", servedKcal: 1100, targetKcal: 1000 })],
    days: [],
  }));
  assertEquals(dedans.counters.refusals_by_cause.cell_energy_off, 0);
  const dehors = finalPlanGate(minimalPlan(), ctxAvec({
    cells: [cellRow({ memberId: "m1", date: "2026-09-12", servedKcal: 1101, targetKcal: 1000 })],
    days: [],
  }));
  assertEquals(dehors.counters.refusals_by_cause.cell_energy_off, 1);
  assertEquals(MEAL_ENERGY_TOLERANCE, 0.10, "⛔ ne pas élargir pour faire passer un banc");
  assertEquals(COVERED_DAY_ENERGY_TOLERANCE, 0.05);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ CALORIES CONFORMES, PROTÉINES INSUFFISANTES ⇒ NON CONFORME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ le cas de Paul : 126,1 g pour un plancher de 176", () => {
  const day = {
    memberId: "m1",
    date: "2026-09-13",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2454,
    servedKcal: 2455.69,
    deltaPct: ((2455.69 - 2454) / 2454) * 100,
    proteinG: 126.1,
    protein: { coveredFloorG: 176, reason: "applied_full_day" },
    state: "conforme" as const,
  };
  const outcome = finalPlanGate(minimalPlan(), ctxAvec({ cells: [], days: [day] }));
  // ⛔ L'ÉNERGIE EST À +0,07 % — la journée est ÉNERGÉTIQUEMENT irréprochable.
  assertEquals(outcome.counters.refusals_by_cause.day_energy_off, 0);
  // …et la protéine manque de 28 %.
  assertEquals(outcome.counters.refusals_by_cause.protein_floor_short, 1);
  assertEquals(outcome.counters.checked.protein_days, 1);
  assert(outcome.refusals[0].detail.includes("126,1".replace(",", ".")));
  // ⛔ LE VERDICT DE LIVRAISON N'EST PAS « CONFORME ».
  assertEquals(finalGateDelivery(outcome).state, "deliverable_with_gaps");
});

Deno.test("⑧ LE CAS QUI PASSE — la même journée avec 180 g ne mord pas", () => {
  const day = {
    memberId: "m1",
    date: "2026-09-13",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2454,
    servedKcal: 2455.69,
    deltaPct: 0.07,
    proteinG: 180,
    protein: { coveredFloorG: 176, reason: "applied_full_day" },
    state: "conforme" as const,
  };
  const outcome = finalPlanGate(minimalPlan(), ctxAvec({ cells: [], days: [day] }));
  assertEquals(outcome.counters.refusals_by_cause.protein_floor_short, 0);
  assertEquals(outcome.counters.checked.protein_days, 1, "le dénominateur a TOURNÉ");
});

Deno.test("⑧ une abstention PROTÉGÉE n'est pas une donnée perdue", () => {
  const protege = finalPlanGate(minimalPlan(), ctxAvec({
    cells: [],
    days: [dayRow({ proteinG: 10, coveredFloorG: null, reason: "protected" })],
  }));
  assertEquals(protege.counters.checked.protein_protected, 1);
  assertEquals(protege.counters.checked.protein_unmeasured, 0);
  assertEquals(protege.counters.checked.protein_days, 0);
  // LE CAS QUI MORD : un adulte SANS corps, lui, est un trou — et il se compte
  // dans un autre champ. Les confondre était la faute n° 4 du lot 0.
  const trou = finalPlanGate(minimalPlan(), ctxAvec({
    cells: [],
    days: [dayRow({ proteinG: 10, coveredFloorG: null, reason: "no_body" })],
  }));
  assertEquals(trou.counters.checked.protein_protected, 0);
  assertEquals(trou.counters.checked.protein_unmeasured, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LE PLANCHER PROTÉIQUE EST PRORATÉ, ET AUCUN BARÈME N'EST CRÉÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑨ une fenêtre partielle ne met pas toute la journée sur le dîner", () => {
  // Paul, 176 g/jour, et la fenêtre ne compose que son dîner (858,90 sur 2 454).
  const part = proteinFloorAllocation({
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    coveredBudgetKcal: 858.9,
    dayTargetKcal: 2454,
    fixedProteinG: null,
  });
  assertEquals(part.reason, "applied_covered_window");
  assertAlmostEquals(part.coveredFloorG ?? -1, 176 * (858.9 / 2454), 0.001);
  assert((part.coveredFloorG ?? 0) < 70, "un dîner ne doit pas 176 g");
  // LE CAS QUI MORD : la journée entière, elle, les doit.
  const plein = proteinFloorAllocation({
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    coveredBudgetKcal: 2454,
    dayTargetKcal: 2454,
    fixedProteinG: null,
  });
  assertEquals(plein.reason, "applied_full_day");
  assertAlmostEquals(plein.coveredFloorG ?? -1, 176, 0.001);
});

Deno.test("⑨ les apports fixes sont comptés UNE fois, et jamais devinés", () => {
  const avec = proteinFloorAllocation({
    dayFloorG: 100,
    perMealFloorG: null,
    abstention: "none",
    coveredBudgetKcal: 2000,
    dayTargetKcal: 2000,
    fixedProteinG: 30,
  });
  assertAlmostEquals(avec.coveredFloorG ?? -1, 70, 0.001);
  // ⛔ `null` NE RETIRE RIEN, et c'est la direction d'erreur SÛRE : on exige un
  // peu plus, jamais moins. Un zéro implicite aurait fait le contraire.
  const sans = proteinFloorAllocation({
    dayFloorG: 100,
    perMealFloorG: null,
    abstention: "none",
    coveredBudgetKcal: 2000,
    dayTargetKcal: 2000,
    fixedProteinG: null,
  });
  assertAlmostEquals(sans.coveredFloorG ?? -1, 100, 0.001);
});

Deno.test("⑨ une enveloppe `per_portion` s'abstient, et dit laquelle des deux", () => {
  assertEquals(
    proteinFloorAllocation({
      dayFloorG: null,
      perMealFloorG: null,
      abstention: "protected",
      coveredBudgetKcal: 2000,
      dayTargetKcal: 2000,
      fixedProteinG: null,
    }).reason,
    "protected",
  );
  assertEquals(
    proteinFloorAllocation({
      dayFloorG: null,
      perMealFloorG: null,
      abstention: "no_body",
      coveredBudgetKcal: 2000,
      dayTargetKcal: 2000,
      fixedProteinG: null,
    }).reason,
    "no_body",
  );
});

Deno.test("⑨ une journée à trou est NON MESURABLE, pas en écart", () => {
  const cells = [
    cellRow({ memberId: "m1", date: "2026-09-12", servedKcal: 800, targetKcal: 800 }),
    { ...cellRow({ memberId: "m1", date: "2026-09-12", servedKcal: null, targetKcal: 900 }), slot: "dinner" },
  ];
  const jours = dayNutritionTable({
    cells,
    days: [{
      memberId: "m1",
      date: "2026-09-12",
      coveredBudgetKcal: 1700,
      protein: {
        dayFloorG: 100,
        coveredFloorG: 100,
        perMealFloorG: null,
        fixedProteinG: null,
        reason: "applied_full_day",
      },
    }],
  });
  assertEquals(jours[0].state, "unmeasurable");
  assertEquals(jours[0].deltaPct, null, "⛔ pas de −53 % sur une portion absente");
  // LE CAS QUI PASSE : la même journée complète est mesurée, et conforme.
  const pleines = dayNutritionTable({
    cells: [cells[0], { ...cells[1], servedKcal: 900, proteinG: 50 }],
    days: [{
      memberId: "m1",
      date: "2026-09-12",
      coveredBudgetKcal: 1700,
      protein: {
        dayFloorG: 100,
        coveredFloorG: 100,
        perMealFloorG: null,
        fixedProteinG: null,
        reason: "applied_full_day",
      },
    }],
  });
  assertEquals(pleines[0].state, "conforme");
  assertAlmostEquals(pleines[0].servedKcal ?? -1, 1700, 0.001);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LA LIVRAISON — trois états, et la liste des contrôles NON ÉVALUÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑩ les trois états, et un plan propre les distingue", () => {
  assertEquals([...DELIVERY_STATES], ["conforme", "deliverable_with_gaps", "not_deliverable"]);
  const propre = finalPlanGate(minimalPlan(), ctxAvec({ cells: [], days: [] }));
  const verdict = finalGateDelivery(propre);
  assertEquals(verdict.state, "conforme");
  // ⛔ ET « CONFORME » NE VEUT PAS DIRE « TOUT A ÉTÉ REGARDÉ ». Sur ce plan
  // minimal, presque rien n'a tourné — et la liste le dit, nommément.
  assert(verdict.unevaluated.length > 0);
  assert(verdict.unevaluated.includes("protein_floor_short"));
  assert(verdict.unevaluated.includes("ingredient_not_bought"));
});

Deno.test("⑩ un contrôle INCOMPLET n'est ni un écart ni un défaut", () => {
  const outcome = finalPlanGate(minimalPlan(), {
    ...ctxAvec({ cells: [], days: [] }),
    shopping: [{
      identity: "olive_oil",
      displayTerm: "huile d'olive",
      state: "present_unquantified",
      reason: "déclaré au garde-manger — présence seule, quantité inconnue",
    }],
  });
  assertEquals(outcome.refusals.length, 0, "⛔ aucun refus : rien n'accuse le plan");
  const verdict = finalGateDelivery(outcome);
  assertEquals(verdict.state, "conforme");
  assertEquals(verdict.incomplete.find((i) => i.control === "shopping_quantity")?.count, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LES RÉPARATIONS — allergène, budget, et l'ancien plan qu'on préserve
// ═══════════════════════════════════════════════════════════════════════════

function refus(over: Partial<GateRefusal> & { cause: GateRefusal["cause"] }): GateRefusal {
  return {
    severity: "refuse",
    day: null,
    slot: null,
    dish: null,
    preparation_id: null,
    member_id: null,
    term: null,
    detail: "",
    ...over,
  };
}

function defaut(over: Partial<RepairDefect> & { kind: RepairDefect["kind"] }): RepairDefect {
  return {
    day: null,
    slot: null,
    dish: null,
    memberId: null,
    detail: "",
    repairable: true,
    magnitude: null,
    ...over,
  };
}

Deno.test("⑪ une candidate qui apporte un allergène est rejetée, densité ou pas", () => {
  const avantRefus = [refus({ cause: "cell_energy_off", day: "fri", slot: "dinner" })];
  const apresRefus = [
    refus({ cause: "member_exclusion_served", member_id: "m2", term: "arachide" }),
  ];
  const verdict = judgeCandidate({
    beforeRefusals: avantRefus,
    afterRefusals: apresRefus,
    // ⛔ LA CANDIDATE EST MEILLEURE SUR LA DENSITÉ : un défaut de moins ET une
    // amplitude réduite. Elle est rejetée quand même.
    beforeDefects: [
      defaut({ kind: "sizing", magnitude: 40 }),
      defaut({ kind: "sizing", magnitude: 30 }),
    ],
    afterDefects: [defaut({ kind: "safety", magnitude: null })],
  });
  assertEquals(verdict.verdict, "safety_regression");
  assertEquals(verdict.safety.added.length, 1);
  // LE CAS QUI PASSE : la MÊME amélioration sans allergène est adoptée.
  const propre = judgeCandidate({
    beforeRefusals: avantRefus,
    afterRefusals: [],
    beforeDefects: [defaut({ kind: "sizing", magnitude: 40 }), defaut({ kind: "sizing", magnitude: 30 })],
    afterDefects: [defaut({ kind: "sizing", magnitude: 10 })],
  });
  assertEquals(propre.verdict, "adopt");
});

Deno.test("⑪ après deux réparations : un état EXPLICITE, pas un troisième appel", () => {
  const defauts = [defaut({ kind: "protein", detail: "il manque 50 g" })];
  const premiere = planRepairPass({ defects: defauts, attemptsUsed: 0, maxAttempts: 2, remainingMs: 120_000 });
  assertEquals(premiere.call, true);
  const seconde = planRepairPass({ defects: defauts, attemptsUsed: 1, maxAttempts: 2, remainingMs: 120_000 });
  assertEquals(seconde.call, true);
  const troisieme = planRepairPass({ defects: defauts, attemptsUsed: 2, maxAttempts: 2, remainingMs: 120_000 });
  assertEquals(troisieme.call, false);
  assertEquals(troisieme.call === false ? troisieme.reason : null, "attempts_exhausted");
  // ⛔ ET « PLUS DE TEMPS » RESTE DISTINCT DE « PLUS DE TENTATIVE ».
  const sansTemps = planRepairPass({ defects: defauts, attemptsUsed: 0, maxAttempts: 2, remainingMs: 1_000 });
  assertEquals(sansTemps.call === false ? sansTemps.reason : null, "no_time_left");
});

Deno.test("⑪ un défaut déterministe ne consomme AUCUNE tentative", () => {
  const pass = planRepairPass({
    defects: [defaut({ kind: "preference", repairable: false })],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 120_000,
  });
  assertEquals(pass.call === false ? pass.reason : null, "nothing_repairable");
});

Deno.test("⑪ les causes de la garde deviennent des défauts, dans le bon ordre", () => {
  const defauts = defectsFromRefusals([
    refus({ cause: "cell_energy_off" }),
    refus({ cause: "protein_floor_short" }),
    refus({ cause: "member_exclusion_served" }),
    refus({ cause: "cell_without_portion" }),
    refus({ cause: "cell_energy_unmeasurable" }),
  ]);
  assertEquals(defauts.map((d) => d.kind), [
    "safety",
    "missing_meal",
    "sizing",
    "protein",
    "preference",
  ]);
  // ⛔ UNE PORTION ILLISIBLE N'EST PAS RÉPARABLE PAR UN APPEL : le modèle ne
  // fera pas exister une fiche du référentiel.
  assertEquals(defauts.find((d) => d.kind === "preference")?.repairable, false);
  assertEquals(defauts.find((d) => d.kind === "safety")?.repairable, true);
});

Deno.test("⑪ toutes les causes de la garde sont classées — aucune n'est oubliée", () => {
  // ⛔ SANS CETTE ÉPREUVE, une cause ajoutée demain tomberait en `preference`
  // non réparable sans que personne le voie. Elle tombera toujours là — mais
  // ce test le RENDRA VISIBLE au moment du commit qui l'ajoute.
  const classees = defectsFromRefusals(FINAL_GATE_CAUSES.map((cause) => refus({ cause })));
  assertEquals(classees.length, FINAL_GATE_CAUSES.length);
  assert(classees.some((d) => d.kind === "safety"));
  assert(classees.some((d) => d.kind === "missing_meal"));
  assert(classees.some((d) => d.kind === "sizing"));
  assert(classees.some((d) => d.kind === "protein"));
});

Deno.test("⑪ un plan non livrable n'écrase PAS un plan valide", () => {
  assertEquals(
    chooseReplacement({ candidate: "not_deliverable", previousIsUsable: true }),
    "keep_previous",
  );
  assertEquals(
    chooseReplacement({ candidate: "not_deliverable", previousIsUsable: false }),
    "fail_explicit",
  );
  // LE CAS QUI PASSE : une version avec écarts EST servie — c'est la politique
  // déjà acceptée, et elle ne masque aucun motif.
  assertEquals(
    chooseReplacement({ candidate: "deliverable_with_gaps", previousIsUsable: true }),
    "replace",
  );
  assertEquals(
    chooseReplacement({ candidate: "conforme", previousIsUsable: false }),
    "replace",
  );
});

// ---------------------------------------------------------------------------
// Le décor minimal de la garde — un plan vide, pour n'exercer QUE la nutrition
// ---------------------------------------------------------------------------

function minimalPlan(): GatePlan {
  return {
    dishes: [],
    preparations: [],
    cooking_sessions: [],
    shopping_list: [],
  };
}

function ctxAvec(
  nutrition: GateContext["nutrition"],
): GateContext {
  return {
    lane: "household",
    startsOn: "2026-09-11",
    windowDays: ["fri", "sat", "sun"],
    hasFreezer: true,
    maxFridgeDays: 3,
    // ⚠️ AUCUNE BOUCHE : ce décor n'exerce QUE les causes de nutrition, et une
    // grille non vide allumerait `cell_without_dish` sur un plan vide.
    mouths: [],
    energy: null,
    boxContract: null,
    exclusions: { table: [], byMember: [] },
    strictestRegime: null,
    houseRuleLabels: [],
    pantryTerms: [],
    shopping: null,
    nutrition,
    policy: FINAL_GATE_POLICY_LOT_1,
  };
}

function cellRow(over: {
  memberId: string;
  date: string;
  servedKcal: number | null;
  targetKcal: number | null;
}) {
  const delta = over.servedKcal !== null && over.targetKcal !== null && over.targetKcal > 0
    ? ((over.servedKcal - over.targetKcal) / over.targetKcal) * 100
    : null;
  const state = over.servedKcal === null
    ? "unmeasurable" as const
    : delta !== null && Math.abs(delta) > MEAL_ENERGY_TOLERANCE * 100
    ? "energy_off" as const
    : "conforme" as const;
  return {
    memberId: over.memberId,
    day: "fri",
    date: over.date,
    slot: "lunch",
    hasDish: true,
    hasPortion: true,
    targetKcal: over.targetKcal,
    servedKcal: over.servedKcal,
    proteinG: null,
    grams: over.servedKcal === null ? null : 400,
    densityPer100G: over.servedKcal === null ? null : over.servedKcal / 4,
    sharedWith: 1,
    deltaPct: delta,
    gap: over.servedKcal === null ? "dish_incomplete" : null,
    portionExpected: true,
    state,
  };
}

function dayRow(over: {
  proteinG: number | null;
  coveredFloorG: number | null;
  reason: string;
}) {
  return {
    memberId: "m1",
    date: "2026-09-12",
    cellsExpected: 1,
    cellsMeasured: 1,
    coveredBudgetKcal: 1000,
    servedKcal: 1000,
    deltaPct: 0,
    proteinG: over.proteinG,
    protein: { coveredFloorG: over.coveredFloorG, reason: over.reason },
    state: "conforme" as const,
  };
}
