// Sonde du défaut 2 — le compteur `dietary_regime_breach` chez une végane.
// AVANT = la mécanique exacte de `generate-meal-v1:2373-2407` (aiguilles à
// plat, haystack concaténé). APRÈS = `scanDietaryRegime`.
import {
  excludedSurfaceFormsFor,
  scanDietaryRegime,
} from "../supabase/functions/_shared/keel/dietary_regime.ts";
import { findForbiddenMatches } from "../supabase/functions/_shared/keel/forbidden_matcher.ts";

type Dish = { title: string; why: string; ingredients: string[] };

// Les plats VÉGANES CORRECTS mesurés par 2V, remis en forme de plat.
const VEGAN_OK: Dish[] = [
  {
    title: "Soy yoghurt, gluten-free oats, cocoa and pumpkin seeds",
    why: "A cold breakfast you can build the night before.",
    ingredients: ["plain unsweetened soy yoghurt", "gluten-free oats", "cocoa"],
  },
  {
    title: "Oat milk porridge with almond butter",
    why: "Oat milk keeps it creamy without dairy.",
    ingredients: ["oat milk", "peanut butter", "rolled oats"],
  },
  {
    title: "Coconut milk dhal",
    why: "Coconut milk carries the spice.",
    ingredients: ["coconut milk", "red lentils", "cumin"],
  },
  {
    title: "Porridge au lait d'avoine et purée d'amande",
    why: "Le lait d'avoine tient la texture sans laitage.",
    ingredients: ["lait d'avoine", "purée d'amande", "flocons d'avoine"],
  },
  {
    title: "Vegan sausage and bean stew",
    why: "The soy sausage does the work of the meat here.",
    ingredients: ["vegan sausage", "tofu", "butter beans"],
  },
];

// LES VRAIES BRÈCHES — la contre-épreuve. Sans elle, « 0 morsure » ne prouve
// que le silence.
const VEGAN_BREACH: Dish[] = [
  {
    title: "Risotto crémeux",
    why: "Réconfortant.",
    ingredients: ["lardons fumés", "parmesan", "bouillon de volaille"],
  },
  {
    title: "Soy yoghurt bowl with chicken stock",
    why: "We use oat milk here, and the chicken stock adds depth.",
    ingredients: ["soy yoghurt", "chicken stock"],
  },
  {
    title: "Honey and greek yogurt pot",
    why: "Sweet finish.",
    ingredients: ["honey", "greek yogurt"],
  },
];

function before(dish: Dish): string[] {
  const terms = excludedSurfaceFormsFor("vegan").map((form) => ({
    ruleId: "diet:vegan",
    token: form,
  }));
  const haystack = [dish.title, dish.why, ...dish.ingredients]
    .filter((s) => s.trim() !== "")
    .join(" · ");
  return findForbiddenMatches(haystack, terms).map((h) => h.matchedText);
}

function after(dish: Dish) {
  return scanDietaryRegime("vegan", {
    prose: [dish.title, dish.why],
    terms: dish.ingredients,
  });
}

function report(label: string, dishes: Dish[]) {
  console.log(`\n=== ${label} ===`);
  let b = 0, a = 0, s = 0;
  for (const dish of dishes) {
    const bef = before(dish);
    const aft = after(dish);
    b += bef.length;
    a += aft.breaches.length;
    s += aft.silencedByPlantAnalogue.length;
    console.log(
      `  ${bef.length} → ${aft.breaches.length} (silencées ${aft.silencedByPlantAnalogue.length})  ${dish.title}`,
    );
    if (bef.length) console.log(`      avant: ${bef.join(", ")}`);
    if (aft.breaches.length) {
      console.log(
        `      après: ${aft.breaches.map((x) => x.matchedText).join(", ")}`,
      );
    }
  }
  console.log(`  TOTAL  avant=${b}  après=${a}  silencées=${s}`);
  return { b, a, s };
}

const ok = report("PLANS VÉGANES CORRECTS (attendu: après = 0)", VEGAN_OK);
const ko = report("VRAIES BRÈCHES (attendu: après > 0)", VEGAN_BREACH);
console.log(
  `\nRÉSUMÉ: faux positifs ${ok.b} → ${ok.a} · vraies morsures conservées ${ko.a}/${ko.b}`,
);
