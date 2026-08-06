// KEEL — pack de libellés FRANÇAIS pour les jetons de données.
//
// R1: les jetons sont de l'ASCII snake_case anglais et ne sont JAMAIS traduits.
// Seuls ces LIBELLÉS (du contenu, lu par un humain) portent la langue. Les clés
// de ce fichier sont donc identiques, caractère pour caractère, à celles de
// `labels.en.ts` — c'est pinné par `labels_fr_test.ts`, parce qu'une clé qui
// diverge produit un `labelFor` qui répond en anglais et jette en français,
// pour le même slug.
//
// R7: `labelFor` jette sur un jeton inconnu. Un pack partiel n'est donc pas une
// dégradation gracieuse, c'est une panne — d'où la parité de clés exigée.

import type { LocalePack } from "./labels.en.ts"

// SCHEMA: scheduled_days <@ ['mon'..'sun']
// Minuscules: le français ne capitalise pas les jours, et ces libellés sont
// composés dans des phrases (« tu t'entraînes le mardi »), pas affichés seuls.
const days: Record<string, string> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
}

// SCHEMA: slot_vocabulary seed (global, créneaux repas et hors-repas unifiés)
const slots: Record<string, string> = {
  on_waking: "Au réveil",
  breakfast: "Petit-déjeuner",
  snack_am: "Collation du matin",
  pre_workout: "Avant l'entraînement",
  lunch: "Déjeuner",
  post_workout: "Après l'entraînement",
  snack_pm: "Collation de l'après-midi",
  dinner: "Dîner",
  before_bed: "Avant le coucher",
  any_meal: "N'importe quel repas",
  any_time: "N'importe quand",
}

// SCHEMA: plan_commitments.unit (R4: stockage SI; ce sont des libellés d'affichage)
// Les symboles d'unité sont INTERNATIONAUX: g, mg, kg, ml, min ne se traduisent
// pas. Seuls les mots en toutes lettres bougent.
const units: Record<string, string> = {
  kcal: "kcal",
  g: "g",
  mg: "mg",
  mcg: "µg",
  IU: "UI",
  ml: "ml",
  l: "L",
  min: "min",
  h: "h",
  km: "km",
  kg: "kg",
  capsule: "gélule",
  tablet: "comprimé",
  scoop: "dosette",
  portion: "portion",
  serving: "part",
  rep: "répétition",
  session: "séance",
  celsius: "°C",
  point: "point",
  hhmm: "heure (hh:mm)",
  none: "",
}

// SCHEMA: plan_commitments.measure
const measures: Record<string, string> = {
  energy: "Énergie",
  protein: "Protéines",
  carb: "Glucides",
  fat: "Lipides",
  fiber: "Fibres",
  sodium: "Sodium",
  water: "Eau",
  micronutrient: "Micronutriment",
  portion: "Portion",
  serving: "Part",
  exchange: "Équivalence",
  dose: "Dose",
  duration: "Durée",
  distance: "Distance",
  load: "Charge",
  reps: "Répétitions",
  count: "Nombre",
  rpe: "RPE",
  scale: "Note sur une échelle",
  clock_time: "Heure",
  temperature: "Température",
  boolean: "Oui / non",
  presence: "Présence",
  composition: "Composition",
}

// SCHEMA: plan_commitments.activity_class (exemption R6: affichage seulement)
const activity_class: Record<string, string> = {
  nutrition: "Nutrition",
  supplement: "Complément",
  movement: "Mouvement",
  recovery: "Récupération",
  exposure: "Exposition",
  sleep: "Sommeil",
  mind: "Mental",
  measurement: "Mesure",
  other: "Autre",
}

// CONTRACT: seed plat d'environ 40 slugs, pas d'ontologie. Miroir exact de
// SUBSTANCE_REFS dans tokens.ts (ceinture N3, test de prémisse fausse: chaque
// slug semé se libelle sans jeter).
//
// Les noms de molécules et les nomenclatures INCI/DCI ne se traduisent pas
// (« creatine monohydrate » est le nom du produit qu'on achète en France, pas
// un mot anglais à franciser). Ne bougent que les mots courants.
const substances: Record<string, string> = {
  vitamin_d3: "Vitamine D3",
  omega3_epa_dha: "Oméga-3 (EPA+DHA)",
  magnesium_glycinate: "Glycinate de magnésium",
  iron_bisglycinate: "Bisglycinate de fer",
  creatine_monohydrate: "Créatine monohydrate",
  vitamin_k2: "Vitamine K2",
  methylfolate: "Méthylfolate",
  zinc: "Zinc",
  copper: "Cuivre",
  curcumin: "Curcumine",
  piperine: "Pipérine",
  alcohol: "Alcool",
  caffeine: "Caféine",
  gluten: "Gluten",
  st_johns_wort: "Millepertuis",
  melatonin: "Mélatonine",
  ashwagandha: "Ashwagandha",
  berberine: "Berbérine",
  vitamin_c: "Vitamine C",
  vitamin_a: "Vitamine A",
  vitamin_e: "Vitamine E",
  vitamin_b12: "Vitamine B12",
  niacin: "Niacine",
  selenium: "Sélénium",
  iodine: "Iode",
  calcium_citrate: "Citrate de calcium",
  potassium: "Potassium",
  omega3_epa: "Oméga-3 EPA",
  omega3_dha: "Oméga-3 DHA",
  collagen: "Collagène",
  whey_protein: "Protéine de lactosérum (whey)",
  casein: "Caséine",
  fiber_psyllium: "Fibres de psyllium",
  probiotic: "Probiotique",
  coq10: "CoQ10",
  nac: "NAC",
  glycine: "Glycine",
  taurine: "Taurine",
  electrolytes: "Électrolytes",
  sodium_chloride: "Sel (chlorure de sodium)",
}

// SCHEMA: food_groups semés depuis l'USDA FNDDS. Miroir exact du seed de la
// migration 20260727090000_keel_p0_commitments.sql (ceinture N3, test de
// prémisse fausse: chaque slug semé se libelle sans jeter).
const food_groups: Record<string, string> = {
  lean_protein: "Protéines maigres",
  fatty_fish: "Poissons gras",
  white_fish: "Poissons blancs",
  shellfish: "Fruits de mer",
  poultry: "Volaille",
  red_meat: "Viande rouge",
  eggs: "Œufs",
  legumes: "Légumineuses",
  tofu_tempeh: "Tofu et tempeh",
  dairy_yogurt: "Yaourt",
  dairy_cheese: "Fromage",
  whole_grain: "Céréales complètes",
  refined_grain: "Céréales raffinées",
  starchy_veg: "Légumes féculents",
  cruciferous_veg: "Crucifères",
  leafy_greens: "Légumes verts à feuilles",
  non_starchy_veg: "Légumes non féculents",
  berries: "Fruits rouges",
  citrus: "Agrumes",
  other_fruit: "Autres fruits",
  nuts_seeds: "Fruits à coque et graines",
  olive_oil: "Huile d'olive",
  other_added_fat: "Autres matières grasses ajoutées",
  sauce_dressing: "Sauces et assaisonnements",
  sugar_sweets: "Sucre et sucreries",
  fried_food: "Fritures",
  alcohol: "Alcool",
  sweetened_beverage: "Boissons sucrées",
  water: "Eau",
  coffee_tea: "Café et thé",
}

export const FR_LABELS: LocalePack = {
  days,
  slots,
  units,
  measures,
  activity_class,
  substances,
  food_groups,
}
