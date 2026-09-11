// Sonde 3 — la boucle mesure → application → remesure, et l'arrondi.
import { buildCompositionIndex, type CompositionRef } from "../../supabase/functions/_shared/keel/food_composition.ts";
import {
  applySizing,
  applySizingForEaters,
  drawsByPreparation,
  splitPlateWithComplement,
  standardPortionOf,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";

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

const INDEX = buildCompositionIndex([
  ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350 }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0 }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900 }),
], []);

const g = (term: string, amount: number, state: "raw" | "cooked" | null = "raw") => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state,
  // deno-lint-ignore no-explicit-any
}) as any;

const plan = () => ({
  dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [g("oil", 10)] }],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100)] }],
});

const mesure = (m: ReturnType<typeof plan>) =>
  standardPortionOf({
    index: INDEX,
    dish: m.dishes[0],
    uses: m.dishes[0].uses,
    preparations: m.preparations,
    drawsByPrep: drawsByPreparation(m.dishes),
  });

const avant = mesure(plan());
console.log("avant", avant);
for (const f of [0.5, 1, 1.6]) {
  const out = applySizing({ meal: plan(), memberId: "m", rows: [{ dishIndex: 0, factor: f, sized: true }], index: INDEX });
  const apres = mesure({ dishes: out.dishes, preparations: out.preparations } as never);
  const boite = out.dishes[0].boxes[0].items.reduce((a: number, i: { grams: number }) => a + i.grams, 0);
  console.log(`f=${f}`, "kcal attendu", avant.kcal! * f, "kcal remesuré", apres.kcal, "masse remesurée", apres.cookedG, "boîte", boite);
}

// ── LA MUTATION NON PROPORTIONNELLE: un plafond entre la mesure et l'écriture
const out = applySizing({ meal: plan(), memberId: "m", rows: [{ dishIndex: 0, factor: 2, sized: true }], index: INDEX });
// l'huile est plafonnée à 10 g par une garde d'ingrédient en aval
out.dishes[0].ingredients[0].amount = 10;
const apresPlafond = mesure({ dishes: out.dishes, preparations: out.preparations } as never);
console.log("plafond: attendu", avant.kcal! * 2, "réel", apresPlafond.kcal);

// ── L'ARRONDI DU COMPLÉMENT ──────────────────────────────────────────────
const DILUE = { kcal: 450, cookedG: 500, densityPer100G: 90, pots: [], gaps: [] };
const entree = { kcal: 300, cookedG: 100, densityPer100G: 300, pots: [], gaps: [] };
const BORNES = { min: 250, max: 700 } as never;
for (const t of [800, 799.05, 801.05, 790.65]) {
  const s = splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: t, bounds: BORNES, verdict: "over_max" });
  if (s) console.log(`cible ${t}`, s.sharedG, s.complementG, "somme", s.sharedG + s.complementG);
}

// ── L'ARRONDI D'UN ITEM DE BOÎTE ─────────────────────────────────────────
const menu = {
  dishes: [{ day: "mon", slot: "dinner", uses: [], ingredients: [g("oil", 2), g("rice", 100)] }],
  preparations: [],
};
const petit = applySizing({ meal: menu, memberId: "m", rows: [{ dishIndex: 0, factor: 0.2, sized: true }], index: INDEX });
console.log("frais arrondi à 0", JSON.stringify(petit.dishes[0].boxes[0].items), JSON.stringify(petit.counts));
const potMenu = {
  dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "p" }], ingredients: [g("rice", 100)] }],
  preparations: [{ id: "p", servingsMade: 1, ingredients: [g("oil", 2)] }],
};
const petitPot = applySizing({ meal: potMenu, memberId: "m", rows: [{ dishIndex: 0, factor: 0.2, sized: true }], index: INDEX });
console.log("casserole arrondie à 0", JSON.stringify(petitPot.dishes[0].boxes[0].items), JSON.stringify(petitPot.counts));
