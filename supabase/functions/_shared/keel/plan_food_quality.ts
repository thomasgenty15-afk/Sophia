/**
 * LA QUALITÉ DES ALIMENTS D'UN PLAN LIVRÉ — 2026-09-21.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI CE MODULE EXISTE, AVEC SES CHIFFRES
 * ══════════════════════════════════════════════════════════════════════════
 * Le plan `3e121b21` (3 bouches, 5 jours) servait 100 % de l'énergie de
 * chacun, et un nutritionniste l'aurait refusé sur cinq points que rien ne
 * mesurait: deux légumes sur toute la semaine (oignon, poivron), 167 à 221 g
 * de légumes par jour et par bouche pour un repère de 400 g, de la saucisse à
 * quatre repas sur huit chez l'homme en perte, zéro poisson pour deux bouches
 * sur trois (tout le thon partait dans les goûters solo du troisième, 547 g
 * en quatre jours), et la même casserole servie mercredi midi ET soir.
 *
 * Ce module COMPTE ces cinq choses sur le plan tel qu'il part en base, à
 * partir des boîtes servies et des casseroles au prorata — jamais à partir
 * des titres. Les règles qui les demandent au modèle vivent dans
 * `household_meal_generation.ts` avec les MÊMES nombres, épinglés ici.
 *
 * ⚠️ IL NE BLOQUE RIEN ET NE RÉPARE RIEN. C'est un compteur
 * (`generated_from.food_quality`): un lot désarmé doit se lire, et c'est le
 * seul moyen de savoir si une consigne est suivie avant d'en faire une garde.
 *
 * ⛔ AUCUN MATCHER SUR DU TEXTE. Tout passe par le slug du référentiel et
 * son groupe (`food_composition_refs.food_group_ref`); la charcuterie est une
 * liste FERMÉE de slugs, relue dans la base le 2026-09-21.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/** Les groupes qui comptent comme « légume » (jamais les féculents). */
export const VEGETABLE_GROUPS: readonly string[] = Object.freeze([
  "non_starchy_veg",
  "leafy_greens",
  "cruciferous_veg",
]);
/** Les groupes qui comptent comme « poisson ». */
export const FISH_GROUPS: readonly string[] = Object.freeze([
  "white_fish",
  "fatty_fish",
  "shellfish",
]);
export const FRUIT_GROUPS: readonly string[] = Object.freeze([
  "berries",
  "citrus",
  "other_fruit",
]);
export const MAIN_SLOTS: readonly string[] = Object.freeze(["lunch", "dinner"]);

// ── LES NOMBRES DES RÈGLES — les mêmes que le prompt ────────────────────────
/** Légumes crus par part de déjeuner ou de dîner. */
export const VEG_FLOOR_G_PER_MAIN_SERVING = 150;
/** Légumes différents sur le plan. */
export const VEG_DISTINCT_FLOOR = 4;
/** Plats de charcuterie sur sept jours. */
export const CHARCUTERIE_MAX_DISHES_PER_7_DAYS = 1;
/** Déjeuners ou dîners dont la viande rouge est la protéine, sur sept jours. */
export const RED_MEAT_MAX_MAINS_PER_7_DAYS = 3;
/** Plats partagés de poisson exigés par tranche de cinq jours. */
export const FISH_MIN_SHARED_MAINS_PER_5_DAYS = 1;
/** Plats de poisson gras exigés sur sept jours. */
export const FATTY_FISH_MIN_PER_7_DAYS = 1;
/** ⟳ 2026-09-21 — et au plus deux: le maquereau, le saumon deux fois et les
 * sardines en quatre jours, c'est le double du repère hebdomadaire. */
export const FATTY_FISH_MAX_PER_7_DAYS = 2;
/** Un pot de viande rouge nourrit au plus deux plats. */
export const RED_MEAT_PREP_MAX_DRAWS = 2;
/** Parts de thon pour une même bouche, sur sept jours. */
export const TUNA_MAX_SERVINGS_PER_MOUTH_PER_7_DAYS = 2;
/** Au-dessous, un aliment n'est pas « la protéine du plat ». */
export const PROTEIN_OF_DISH_MIN_G = 40;
/** Au-dessous, une part ne « contient » pas du thon. */
export const TUNA_SERVING_MIN_G = 20;
// ⟳ 2026-09-21 — relu sur `c1ce4658`: 300 g de maquereau par part, 773 g de
// petits-suisses par jour, un ingrédient dans 12 plats sur 20, deux
// déjeuners tirés d'une casserole cuite le matin même.
/** Viande, volaille ou poisson, crus, par part principale. */
export const ANIMAL_PROTEIN_MAX_G_RAW_PER_SERVING = 150;
/** Laitages frais (yaourt, petit-suisse, skyr…) par bouche et par jour. */
export const DAIRY_MAX_G_PER_MOUTH_DAY = 250;
/** Laitages frais dans une collation. */
export const DAIRY_MAX_G_PER_SNACK = 150;
/** Part des plats du plan qu'un même ingrédient peut occuper. */
export const INGREDIENT_MAX_SHARE_OF_DISHES = 0.5;
export const ANIMAL_PROTEIN_GROUPS: readonly string[] = Object.freeze([
  "poultry",
  "red_meat",
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
]);
export const FRESH_DAIRY_GROUPS: readonly string[] = Object.freeze(["dairy_yogurt"]);
/**
 * Le lait est une boisson, pas le « laitage » de la règle: 200 ml dans un bol
 * d'avoine ou un shaker ne sont pas un petit-suisse. Mesuré sur `94c93ca9`:
 * 602 g comptés pour 251 g de petits-suisses et 351 ml de lait.
 */
export const MILK_SLUG_PREFIX = "milk";
/** Ce qui assaisonne et ne compte pas comme « ingrédient » d'un plat. */
export const SEASONING_GROUPS: readonly string[] = Object.freeze([
  "olive_oil",
  "other_added_fat",
  "sauce_dressing",
]);
/** Au-dessous, un slug est une pincée, pas un ingrédient du plat. */
export const INGREDIENT_MIN_G = 20;
export const SNACK_SLOTS: readonly string[] = Object.freeze([
  "snack_am",
  "snack_pm",
  "morning_snack",
  "afternoon_snack",
  "evening_snack",
]);

export const TUNA_SLUGS: ReadonlySet<string> = new Set(["tuna_tinned", "tuna_fresh"]);

/**
 * LA CHARCUTERIE — LES SLUGS, FERMÉS. Relus dans `food_composition_refs` le
 * 2026-09-21: groupes `red_meat` et `poultry`, formes salées, séchées, fumées
 * ou en pâté. Les jarrets et l'escalope de jambon FRAIS n'y sont pas: ce sont
 * des viandes fraîches. Un slug absent d'ici n'est pas de la charcuterie,
 * même s'il y ressemble — on ajoute une ligne, jamais un motif.
 */
export const CHARCUTERIE_SLUGS: ReadonlySet<string> = new Set([
  "bacon", "bacon_back", "bayonne_cured_ham_smoked", "breton_pate",
  "chicken_ham_slices", "chipolata_sausage", "chipolata_slim_sausage",
  "chitterling_sausage", "chitterling_sausage_guemene", "chitterling_sausage_pan",
  "chitterling_sausage_sauteed_pan", "chitterling_sausage_troyes",
  "chitterling_sausage_vire", "chorizo", "cocktail_sausage",
  "country_style_pate_mushrooms", "country_style_pate_terrine", "cured_ham",
  "cured_ham_smoked", "cured_ham_smoked_reduced", "cured_meat_sausages",
  "dry_cured_ham", "dry_cured_ham_fat", "dry_sausage", "dry_sausage_pure_pork",
  "dry_sausage_w_walnuts", "dry_spicy_pork_sausage", "frankfurter_sausage",
  "game_pate", "garlic_sausage", "goose_liver_pate", "ham_choice",
  "ham_choice_rind_less", "ham_choice_w_rind", "ham_cube", "ham_on_bone",
  "ham_parisian_style_rind", "ham_pastry_crusty", "ham_sausage", "ham_smoked",
  "ham_superior_quality", "ham_superior_quality_reduced",
  "ham_superior_quality_rind", "head_cheese_pate_brawn", "knuckle_ham",
  "liver_sausage", "merguez_sausage", "merguez_sausage_beef_mutton",
  "montbeliard_sausage", "morteaux_sausage", "morteaux_sausage_water",
  "parma_dry_cured_ham", "pate", "pate_crust", "pate_w_green_pepper",
  "plant_based_ham", "plant_based_pate", "plant_based_sausage_tofu",
  "plant_based_sausage_wheat", "pork_belly_salt_cured", "pork_ear_sat_cured",
  "pork_ham_w_parsley", "pork_liver_pate", "pork_liver_pate_superior",
  "pork_trotters_salt_cured", "poultry_ham_cube", "poultry_liver_pate",
  "poultry_sausage", "poultry_sausage_delicatessen_style", "rabbit_pate",
  "rosette_dry_sausage", "round_ham", "salami", "salami_danish_style",
  "salami_pork_beef", "salami_pure_pork", "sausage", "sausage_brioche_crust",
  "sausage_meat", "sausage_meat_pork_beef", "sausage_meat_pure_pork",
  "sausage_paris", "sausage_paris_smoked", "sausage_pure_pork",
  "serrano_dry_cured_ham", "spicy_pork_sausage_red", "strasbourg_sausage",
  "toulouse_sausage", "turkey_ham_slices",
]);

export interface FoodQualityBoxItem {
  readonly ref: string | null;
  readonly preparationId: string | null;
  readonly grams: number;
}
export interface FoodQualityDish {
  readonly day: string;
  readonly slot: string;
  readonly boxes: readonly {
    readonly memberIds: readonly string[];
    readonly items: readonly FoodQualityBoxItem[];
  }[];
}
export interface FoodQualityPreparation {
  readonly id: string;
  /** Le jeton du jour de cuisson (`cook_on`), ou `null`. */
  readonly cookOn: string | null;
  readonly ingredients: readonly { readonly ref: string | null; readonly amount: number | null }[];
}

export interface FoodQualityInput {
  /** Le nombre de jours du plan, pour proratiser les plafonds « sur 7 jours ». */
  readonly days: number;
  readonly dishes: readonly FoodQualityDish[];
  readonly preparations: readonly FoodQualityPreparation[];
  /** Le groupe d'un slug, ou `null` quand le référentiel ne le connaît pas. */
  readonly groupOf: (slug: string) => string | null;
  /**
   * Le premier jour mangé du plan, ou `null`. Un déjeuner tiré d'une casserole
   * cuite le jour même y est toléré (courses et cuisson du matin), pas ailleurs.
   */
  readonly firstDay: string | null;
}

export interface FoodQualityTrace {
  readonly days: number;
  readonly vegetables: {
    /** Parts de déjeuner et de dîner mesurées. */
    readonly main_servings: number;
    readonly under_floor: number;
    readonly floor_g: number;
    readonly distinct: number;
    readonly distinct_floor: number;
    /** Le plus petit total de légumes d'une journée-bouche, en grammes crus. */
    readonly min_g_per_mouth_day: number | null;
    readonly mouth_days: number;
  };
  readonly charcuterie: {
    readonly dishes: number;
    readonly cap: number;
    readonly over: number;
    readonly max_g_per_mouth_day: number | null;
  };
  readonly red_meat: {
    readonly main_dishes: number;
    readonly cap: number;
    readonly over: number;
    /** ⟳ 2026-09-21 — le plus grand nombre de plats tirés d'un même pot de viande rouge. */
    readonly max_draws: number;
    readonly draws_cap: number;
    readonly draws_over: number;
  };
  readonly fish: {
    readonly shared_mains: number;
    readonly required: number;
    readonly missing: number;
    readonly fatty_dishes: number;
    readonly fatty_required: number;
    readonly tuna_servings_max_per_mouth: number;
    readonly tuna_cap: number;
    readonly tuna_over: number;
    /** ⟳ 2026-09-21 — plafond de poisson gras, proratisé sur la fenêtre. */
    readonly fatty_cap: number;
    readonly fatty_over: number;
    /** Plats de petit-déjeuner ou de collation qui portent du poisson. */
    readonly outside_mains: number;
  };
  readonly repetition: {
    readonly same_pot_twice_a_day: number;
    readonly breakfast_dishes: number;
    readonly breakfast_bases: number;
    readonly under_two_bases: boolean;
  };
  readonly animal_protein: {
    readonly main_servings: number;
    readonly max_g_raw: number | null;
    readonly cap_g: number;
    readonly over: number;
  };
  readonly dairy: {
    readonly max_g_per_mouth_day: number | null;
    readonly cap_g: number;
    readonly over_mouth_days: number;
    readonly snack_max_g: number | null;
    readonly snack_cap_g: number;
    readonly snack_over: number;
  };
  readonly ingredients: {
    readonly dishes: number;
    readonly top_slug: string | null;
    readonly top_dishes: number;
    readonly max_share: number;
    readonly over_half: boolean;
  };
  readonly timing: {
    /** Déjeuners (ou moments d'avant) tirés d'une casserole cuite le jour même. */
    readonly lunch_from_same_day_pot: number;
    readonly of_which_first_day: number;
  };
  /** Slugs vus dans le plan et inconnus du référentiel. */
  readonly unresolved_refs: number;
}

/** Un plafond « N sur 7 jours », proratisé et jamais sous 1. */
export function perWindowCap(perSevenDays: number, days: number): number {
  if (!(days > 0)) return perSevenDays;
  return Math.max(1, Math.round((perSevenDays * days) / 7));
}

/** Une exigence « N par tranche de M jours ». */
export function perWindowFloor(perMDays: number, m: number, days: number): number {
  if (!(days > 0)) return 0;
  return perMDays * Math.floor(days / m);
}

/**
 * LES GRAMMES CRUS D'UNE PART, PAR SLUG — l'item frais tel quel, la casserole
 * au prorata de ce que la part en tire sur tout ce qui en est tiré.
 */
function servingGramsBySlug(
  items: readonly FoodQualityBoxItem[],
  preps: ReadonlyMap<string, FoodQualityPreparation>,
  drawn: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (slug: string, g: number) => {
    if (!(g > 0)) return;
    out.set(slug, (out.get(slug) ?? 0) + g);
  };
  for (const it of items) {
    if (!(it.grams > 0)) continue;
    if (it.preparationId !== null) {
      const prep = preps.get(it.preparationId);
      const total = drawn.get(it.preparationId) ?? 0;
      if (prep === undefined || !(total > 0)) continue;
      const share = it.grams / total;
      for (const ing of prep.ingredients) {
        if (ing.ref === null || ing.amount === null || !(ing.amount > 0)) continue;
        add(ing.ref, ing.amount * share);
      }
    } else if (it.ref !== null) {
      add(it.ref, it.grams);
    }
  }
  return out;
}

export function foodQualityOf(input: FoodQualityInput): FoodQualityTrace {
  const preps = new Map(input.preparations.map((p) => [p.id, p]));
  const drawn = new Map<string, number>();
  for (const d of input.dishes) {
    for (const b of d.boxes) {
      for (const it of b.items) {
        if (it.preparationId === null || !(it.grams > 0)) continue;
        drawn.set(it.preparationId, (drawn.get(it.preparationId) ?? 0) + it.grams);
      }
    }
  }
  const unresolved = new Set<string>();
  const groupOf = (slug: string): string | null => {
    const g = input.groupOf(slug);
    if (g === null) unresolved.add(slug);
    return g;
  };

  let mainServings = 0;
  let underFloor = 0;
  const vegSlugs = new Set<string>();
  const vegByMouthDay = new Map<string, number>();
  const charcByMouthDay = new Map<string, number>();
  let charcDishes = 0;
  let redMeatMains = 0;
  let fishSharedMains = 0;
  let fattyDishes = 0;
  const tunaByMouth = new Map<string, number>();
  const potsByMouthDay = new Map<string, Map<string, number>>();
  let breakfastDishes = 0;
  const breakfastBases = new Set<string>();
  let animalMax: number | null = null;
  let animalOver = 0;
  const dairyByMouthDay = new Map<string, number>();
  let snackDairyMax: number | null = null;
  let snackDairyOver = 0;
  const dishesBySlug = new Map<string, number>();
  let dishCount = 0;
  let lunchFromSameDayPot = 0;
  let lunchFromSameDayPotFirstDay = 0;
  let fishOutsideMains = 0;
  const drawsByPrep = new Map<string, number>();
  const EARLY_SLOTS = new Set(["breakfast", "snack_am", "morning_snack", "lunch"]);

  for (const d of input.dishes) {
    const eaters = new Set(d.boxes.flatMap((b) => b.memberIds));
    const isMain = MAIN_SLOTS.includes(d.slot);
    const isSnack = SNACK_SLOTS.includes(d.slot);
    if (d.boxes.length > 0) dishCount += 1;
    const dishSlugs = new Set<string>();
    // ⟳ 2026-09-21 — un repas d'avant le dîner tiré d'une casserole cuite le
    // jour même: courses et cuisine avant midi, un jour de semaine.
    if (EARLY_SLOTS.has(d.slot)) {
      const sameDayPot = d.boxes.some((b) =>
        b.items.some((it) =>
          it.preparationId !== null && it.grams > 0 &&
          preps.get(it.preparationId)?.cookOn === d.day
        )
      );
      if (sameDayPot) {
        lunchFromSameDayPot += 1;
        if (input.firstDay !== null && d.day === input.firstDay) {
          lunchFromSameDayPotFirstDay += 1;
        }
      }
    }
    let dishCharc = false;
    let dishRedMeat = false;
    let dishFish = false;
    let dishFatty = false;
    let dishAnyFish = false;
    const potsOfDish = new Set<string>();
    for (const b of d.boxes) {
      const grams = servingGramsBySlug(b.items, preps, drawn);
      let veg = 0;
      let charc = 0;
      let red = 0;
      let fish = 0;
      let fatty = 0;
      let tuna = 0;
      let animal = 0;
      let dairy = 0;
      for (const [slug, g] of grams) {
        const group = groupOf(slug);
        if (g >= INGREDIENT_MIN_G && !(group !== null && SEASONING_GROUPS.includes(group))) {
          dishSlugs.add(slug);
        }
        if (group !== null && ANIMAL_PROTEIN_GROUPS.includes(group)) animal += g;
        if (
          group !== null && FRESH_DAIRY_GROUPS.includes(group) &&
          !slug.startsWith(MILK_SLUG_PREFIX)
        ) dairy += g;
        if (group !== null && VEGETABLE_GROUPS.includes(group)) {
          veg += g;
          vegSlugs.add(slug);
        }
        if (CHARCUTERIE_SLUGS.has(slug)) charc += g;
        else if (group === "red_meat") red += g;
        if (group !== null && FISH_GROUPS.includes(group)) fish += g;
        if (group === "fatty_fish") fatty += g;
        if (TUNA_SLUGS.has(slug)) tuna += g;
      }
      if (isMain) {
        mainServings += b.memberIds.length;
        if (veg < VEG_FLOOR_G_PER_MAIN_SERVING) underFloor += b.memberIds.length;
        if (animal > 0) {
          animalMax = animalMax === null ? animal : Math.max(animalMax, animal);
          if (animal > ANIMAL_PROTEIN_MAX_G_RAW_PER_SERVING) animalOver += b.memberIds.length;
        }
      }
      if (isSnack && dairy > 0) {
        snackDairyMax = snackDairyMax === null ? dairy : Math.max(snackDairyMax, dairy);
        if (dairy > DAIRY_MAX_G_PER_SNACK) snackDairyOver += b.memberIds.length;
      }
      if (charc > 0) dishCharc = true;
      if (isMain && red >= PROTEIN_OF_DISH_MIN_G) dishRedMeat = true;
      if (isMain && fish >= PROTEIN_OF_DISH_MIN_G) dishFish = true;
      if (fish >= TUNA_SERVING_MIN_G) dishAnyFish = true;
      for (const it of b.items) {
        if (it.preparationId !== null && it.grams > 0) potsOfDish.add(it.preparationId);
      }
      if (fatty >= PROTEIN_OF_DISH_MIN_G) dishFatty = true;
      for (const m of b.memberIds) {
        const key = `${m}|${d.day}`;
        vegByMouthDay.set(key, (vegByMouthDay.get(key) ?? 0) + veg);
        charcByMouthDay.set(key, (charcByMouthDay.get(key) ?? 0) + charc);
        dairyByMouthDay.set(key, (dairyByMouthDay.get(key) ?? 0) + dairy);
        if (tuna >= TUNA_SERVING_MIN_G) tunaByMouth.set(m, (tunaByMouth.get(m) ?? 0) + 1);
        const pots = potsByMouthDay.get(key) ?? new Map<string, number>();
        for (const it of b.items) {
          if (it.preparationId === null || !(it.grams > 0)) continue;
          pots.set(it.preparationId, (pots.get(it.preparationId) ?? 0) + 1);
        }
        potsByMouthDay.set(key, pots);
      }
    }
    if (d.boxes.length > 0) {
      for (const slug of dishSlugs) dishesBySlug.set(slug, (dishesBySlug.get(slug) ?? 0) + 1);
    }
    if (dishCharc) charcDishes += 1;
    if (dishRedMeat) redMeatMains += 1;
    if (dishAnyFish && !isMain) fishOutsideMains += 1;
    for (const pid of potsOfDish) drawsByPrep.set(pid, (drawsByPrep.get(pid) ?? 0) + 1);
    if (dishFish && eaters.size >= 2) fishSharedMains += 1;
    if (dishFatty) fattyDishes += 1;
    if (d.slot === "breakfast" && d.boxes.length > 0) {
      breakfastDishes += 1;
      // La base d'un petit-déjeuner: ses slugs hors fruit, triés.
      const slugs = new Set<string>();
      for (const b of d.boxes) {
        for (const slug of servingGramsBySlug(b.items, preps, drawn).keys()) {
          const group = groupOf(slug);
          if (group !== null && FRUIT_GROUPS.includes(group)) continue;
          slugs.add(slug);
        }
      }
      breakfastBases.add([...slugs].sort().join("+"));
    }
  }

  let samePotTwice = 0;
  for (const pots of potsByMouthDay.values()) {
    for (const n of pots.values()) if (n >= 2) samePotTwice += 1;
  }
  const vegMin = vegByMouthDay.size === 0
    ? null
    : Math.round(Math.min(...vegByMouthDay.values()));
  const charcMax = charcByMouthDay.size === 0
    ? null
    : Math.round(Math.max(...charcByMouthDay.values()));
  const charcCap = perWindowCap(CHARCUTERIE_MAX_DISHES_PER_7_DAYS, input.days);
  const redCap = perWindowCap(RED_MEAT_MAX_MAINS_PER_7_DAYS, input.days);
  const fishRequired = perWindowFloor(FISH_MIN_SHARED_MAINS_PER_5_DAYS, 5, input.days);
  const fattyRequired = perWindowFloor(FATTY_FISH_MIN_PER_7_DAYS, 7, input.days);
  const tunaCap = perWindowCap(TUNA_MAX_SERVINGS_PER_MOUTH_PER_7_DAYS, input.days);
  const tunaMax = tunaByMouth.size === 0 ? 0 : Math.max(...tunaByMouth.values());
  const fattyCap = perWindowCap(FATTY_FISH_MAX_PER_7_DAYS, input.days);
  // Un pot « de viande rouge »: un de ses ingrédients est du groupe red_meat
  // hors charcuterie.
  let redMeatMaxDraws = 0;
  for (const [pid, n] of drawsByPrep) {
    const prep = preps.get(pid);
    if (prep === undefined) continue;
    const red = prep.ingredients.some((ing) =>
      ing.ref !== null && !CHARCUTERIE_SLUGS.has(ing.ref) && groupOf(ing.ref) === "red_meat"
    );
    if (red) redMeatMaxDraws = Math.max(redMeatMaxDraws, n);
  }
  const dairyMax = dairyByMouthDay.size === 0
    ? null
    : Math.round(Math.max(...dairyByMouthDay.values()));
  const dairyOver = [...dairyByMouthDay.values()]
    .filter((g) => g > DAIRY_MAX_G_PER_MOUTH_DAY).length;
  let topSlug: string | null = null;
  let topDishes = 0;
  for (const [slug, n] of dishesBySlug) {
    if (n > topDishes) {
      topSlug = slug;
      topDishes = n;
    }
  }
  const maxShare = dishCount === 0 ? 0 : Math.round((topDishes / dishCount) * 100) / 100;
  return {
    days: input.days,
    vegetables: {
      main_servings: mainServings,
      under_floor: underFloor,
      floor_g: VEG_FLOOR_G_PER_MAIN_SERVING,
      distinct: vegSlugs.size,
      distinct_floor: VEG_DISTINCT_FLOOR,
      min_g_per_mouth_day: vegMin,
      mouth_days: vegByMouthDay.size,
    },
    charcuterie: {
      dishes: charcDishes,
      cap: charcCap,
      over: Math.max(0, charcDishes - charcCap),
      max_g_per_mouth_day: charcMax,
    },
    red_meat: {
      main_dishes: redMeatMains,
      cap: redCap,
      over: Math.max(0, redMeatMains - redCap),
      max_draws: redMeatMaxDraws,
      draws_cap: RED_MEAT_PREP_MAX_DRAWS,
      draws_over: Math.max(0, redMeatMaxDraws - RED_MEAT_PREP_MAX_DRAWS),
    },
    fish: {
      shared_mains: fishSharedMains,
      required: fishRequired,
      missing: Math.max(0, fishRequired - fishSharedMains),
      fatty_dishes: fattyDishes,
      fatty_required: fattyRequired,
      tuna_servings_max_per_mouth: tunaMax,
      tuna_cap: tunaCap,
      tuna_over: Math.max(0, tunaMax - tunaCap),
      fatty_cap: fattyCap,
      fatty_over: Math.max(0, fattyDishes - fattyCap),
      outside_mains: fishOutsideMains,
    },
    repetition: {
      same_pot_twice_a_day: samePotTwice,
      breakfast_dishes: breakfastDishes,
      breakfast_bases: breakfastBases.size,
      under_two_bases: breakfastDishes >= 3 && breakfastBases.size < 2,
    },
    animal_protein: {
      main_servings: mainServings,
      max_g_raw: animalMax === null ? null : Math.round(animalMax),
      cap_g: ANIMAL_PROTEIN_MAX_G_RAW_PER_SERVING,
      over: animalOver,
    },
    dairy: {
      max_g_per_mouth_day: dairyMax,
      cap_g: DAIRY_MAX_G_PER_MOUTH_DAY,
      over_mouth_days: dairyOver,
      snack_max_g: snackDairyMax === null ? null : Math.round(snackDairyMax),
      snack_cap_g: DAIRY_MAX_G_PER_SNACK,
      snack_over: snackDairyOver,
    },
    ingredients: {
      dishes: dishCount,
      top_slug: topSlug,
      top_dishes: topDishes,
      max_share: maxShare,
      over_half: dishCount >= 4 && maxShare > INGREDIENT_MAX_SHARE_OF_DISHES,
    },
    timing: {
      lunch_from_same_day_pot: lunchFromSameDayPot,
      of_which_first_day: lunchFromSameDayPotFirstDay,
    },
    unresolved_refs: unresolved.size,
  };
}
