// KEEL — English label pack for data tokens.
// R1: tokens are ASCII snake_case English and are never translated; only these
// LABELS (human-read content) are locale-specific. A future labels.fr.ts etc.
// implements the same LocalePack shape.
// R7: labelFor throws on unknown vocab or token — never a silent fallback.

export type Vocab =
  | "days"
  | "slots"
  | "units"
  | "measures"
  | "activity_class"
  | "substances"
  | "food_groups"

export type LocalePack = Record<Vocab, Record<string, string>>

// SCHEMA: scheduled_days <@ ['mon'..'sun']
const days: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

// SCHEMA: slot_vocabulary seed (global, meal and non-meal slots unified)
const slots: Record<string, string> = {
  on_waking: "On waking",
  breakfast: "Breakfast",
  snack_am: "Morning snack",
  pre_workout: "Pre-workout",
  lunch: "Lunch",
  post_workout: "Post-workout",
  snack_pm: "Afternoon snack",
  dinner: "Dinner",
  before_bed: "Before bed",
  any_meal: "Any meal",
  any_time: "Any time",
}

// SCHEMA: plan_commitments.unit (R4: SI storage; these are display labels)
const units: Record<string, string> = {
  kcal: "kcal",
  g: "g",
  mg: "mg",
  mcg: "mcg",
  IU: "IU",
  ml: "ml",
  l: "L",
  min: "min",
  h: "h",
  km: "km",
  kg: "kg",
  capsule: "capsule",
  tablet: "tablet",
  scoop: "scoop",
  portion: "portion",
  serving: "serving",
  rep: "rep",
  session: "session",
  celsius: "°C",
  point: "point",
  hhmm: "time (hh:mm)",
  none: "",
}

// SCHEMA: plan_commitments.measure
const measures: Record<string, string> = {
  energy: "Energy",
  protein: "Protein",
  carb: "Carbohydrates",
  fat: "Fat",
  fiber: "Fiber",
  sodium: "Sodium",
  water: "Water",
  micronutrient: "Micronutrient",
  portion: "Portion",
  serving: "Serving",
  exchange: "Exchange",
  dose: "Dose",
  duration: "Duration",
  distance: "Distance",
  load: "Load",
  reps: "Repetitions",
  count: "Count",
  rpe: "RPE",
  scale: "Scale rating",
  clock_time: "Clock time",
  temperature: "Temperature",
  boolean: "Yes / no",
  presence: "Presence",
  composition: "Composition",
}

// SCHEMA: plan_commitments.activity_class (R6 exemption: display-only)
const activity_class: Record<string, string> = {
  nutrition: "Nutrition",
  supplement: "Supplement",
  movement: "Movement",
  recovery: "Recovery",
  exposure: "Exposure",
  sleep: "Sleep",
  mind: "Mind",
  measurement: "Measurement",
  other: "Other",
}

// CONTRACT: flat ~40-slug seed, no ontology. Mirrors SUBSTANCE_REFS in
// tokens.ts exactly (belt N3 false-premise test: every seeded slug labels
// without a throw).
const substances: Record<string, string> = {
  vitamin_d3: "Vitamin D3",
  omega3_epa_dha: "Omega-3 (EPA+DHA)",
  magnesium_glycinate: "Magnesium glycinate",
  iron_bisglycinate: "Iron bisglycinate",
  creatine_monohydrate: "Creatine monohydrate",
  vitamin_k2: "Vitamin K2",
  methylfolate: "Methylfolate",
  zinc: "Zinc",
  copper: "Copper",
  curcumin: "Curcumin",
  piperine: "Piperine",
  alcohol: "Alcohol",
  caffeine: "Caffeine",
  gluten: "Gluten",
  st_johns_wort: "St John's wort",
  melatonin: "Melatonin",
  ashwagandha: "Ashwagandha",
  berberine: "Berberine",
  vitamin_c: "Vitamin C",
  vitamin_a: "Vitamin A",
  vitamin_e: "Vitamin E",
  vitamin_b12: "Vitamin B12",
  niacin: "Niacin",
  selenium: "Selenium",
  iodine: "Iodine",
  calcium_citrate: "Calcium citrate",
  potassium: "Potassium",
  omega3_epa: "Omega-3 EPA",
  omega3_dha: "Omega-3 DHA",
  collagen: "Collagen",
  whey_protein: "Whey protein",
  casein: "Casein",
  fiber_psyllium: "Psyllium fiber",
  probiotic: "Probiotic",
  coq10: "CoQ10",
  nac: "NAC",
  glycine: "Glycine",
  taurine: "Taurine",
  electrolytes: "Electrolytes",
  sodium_chloride: "Salt (sodium chloride)",
}

// SCHEMA: food_groups seeded from USDA FNDDS. Mirrors the seed of
// migration 20260727090000_keel_p0_commitments.sql exactly (belt N3
// false-premise test: every seeded slug labels without a throw).
const food_groups: Record<string, string> = {
  lean_protein: "Lean protein",
  fatty_fish: "Fatty fish",
  white_fish: "White fish",
  shellfish: "Shellfish",
  poultry: "Poultry",
  red_meat: "Red meat",
  eggs: "Eggs",
  legumes: "Legumes",
  tofu_tempeh: "Tofu and tempeh",
  dairy_yogurt: "Yogurt",
  dairy_cheese: "Cheese",
  whole_grain: "Whole grains",
  refined_grain: "Refined grains",
  starchy_veg: "Starchy vegetables",
  cruciferous_veg: "Cruciferous vegetables",
  leafy_greens: "Leafy greens",
  non_starchy_veg: "Non-starchy vegetables",
  berries: "Berries",
  citrus: "Citrus fruit",
  other_fruit: "Other fruit",
  nuts_seeds: "Nuts and seeds",
  olive_oil: "Olive oil",
  other_added_fat: "Other added fats",
  sauce_dressing: "Sauces and dressings",
  sugar_sweets: "Sugar and sweets",
  fried_food: "Fried food",
  alcohol: "Alcohol",
  sweetened_beverage: "Sweetened beverages",
  water: "Water",
  coffee_tea: "Coffee and tea",
}

export const EN_LABELS: LocalePack = {
  days,
  slots,
  units,
  measures,
  activity_class,
  substances,
  food_groups,
}

// `labelFor` a DÉMÉNAGÉ dans `labels.ts`, avec son pack en argument REQUIS.
//
// Il vivait ici avec `localePack: LocalePack = EN_LABELS`, et aucun des trois
// appelants de production ne passait l'argument: le pack français aurait pu
// exister et n'être servi à personne. Ce fichier ne porte plus que les données
// EN et les types; qui veut un libellé passe par `labels.ts` et dit d'où vient
// sa locale.
