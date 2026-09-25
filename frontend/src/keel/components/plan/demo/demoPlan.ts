import { addDays, dayTokenOf } from "../../../api/dates";
import { type GeneratedMealResult, readMealRow } from "../../../api/mealGeneration";
import type { MemberDayEnergyView } from "../../../api/mealEnergy";
import type { UiLocale } from "../../../i18n/catalog";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-25 — LE PLAN DE DÉMONSTRATION, MONTRÉ PENDANT QU'UN VRAI SE COMPOSE.
// ══════════════════════════════════════════════════════════════════════════
//
// Demandé: « un vrai plan avec la vraie interface » pendant l'attente (deux à
// trois minutes), avec une visite guidée — « une vidéo n'est pas assez
// dynamique ». Ce module écrit une LIGNE de plan au format de la base
// (`student_generated_meals`) et la fait passer par le lecteur de production
// (`readMealRow`): l'écran reçoit exactement ce qu'il reçoit d'un vrai plan,
// et `PlanResult` le rend sans savoir que c'en est un faux.
//
// ⛔ RIEN ICI NE PART AU SERVEUR ET RIEN N'EN VIENT. Les prénoms, les plats,
// les grammes et les calories sont inventés; l'écran le dit en tête
// (`plan.demo.banner_*`).
//
// Trois jours, un foyer de deux: Camille (un objectif, donc une ligne de
// calories dans le tableau) et Alex. ⟳ 2026-09-25 — OU CAMILLE SEULE, quand
// la personne qui attend compose pour elle seule (`people: 1`): une boîte par
// repas, des casseroles et des courses de moitié. Une session de cuisine le premier jour,
// quatre casseroles, des boîtes par personne, un à-côté. Le saumon revient
// trois fois: c'est lui que la visite « change », et les deux autres plats au
// saumon sont ceux que « Sophia cherche plus loin » propose.

export const DEMO_MEMBER_CAMILLE = "demo-camille";
export const DEMO_MEMBER_ALEX = "demo-alex";

/** La famille d'un plat: « même raison » propose les plats de la même. */
export type DemoFamily = "breakfast" | "salmon" | "chicken";

interface DemoText {
  preps: Record<"salmon" | "chicken" | "rice" | "sweetPotato", { title: string; method: string }>;
  runThrough: string;
  dishes: Record<
    | "b0" | "l0" | "d0" | "b1" | "l1" | "d1" | "b2" | "l2" | "d2",
    { title: string; name: string; method: string }
  >;
  terms: Record<string, string>;
  /** La raison que la visite tape dans « Changer ». */
  reason: string;
}

const TEXT: Record<UiLocale, DemoText> = {
  fr: {
    preps: {
      salmon: {
        title: "Saumon rôti au citron",
        method: "Poser le saumon sur une plaque, arroser d’huile d’olive et de citron, rôtir 15 min à 200 °C, puis répartir en portions.",
      },
      chicken: {
        title: "Poulet aux poivrons",
        method: "Couper le poulet et les poivrons en lanières, les faire sauter 12 min à la poêle avec l’huile d’olive, puis répartir.",
      },
      rice: {
        title: "Riz complet",
        method: "Cuire le riz 25 min dans deux fois son volume d’eau salée, égoutter et laisser tiédir avant de ranger.",
      },
      sweetPotato: {
        title: "Patates douces rôties",
        method: "Couper les patates douces en cubes, les rôtir 30 min à 200 °C avec un filet d’huile.",
      },
    },
    runThrough:
      "Allumer le four à 200 °C et lancer le riz. Enfourner les patates douces, puis le saumon 15 min avant la fin. Pendant ce temps, faire sauter le poulet et les poivrons. Laisser tiédir et répartir dans les boîtes.",
    dishes: {
      b0: { title: "Yaourt grec, flocons d’avoine et fruits rouges", name: "Bol du matin", method: "Verser le yaourt, ajouter les flocons et les fruits rouges." },
      l0: { title: "Saumon rôti, riz complet et haricots verts", name: "Saumon citron", method: "Réchauffer le saumon et le riz, ajouter les haricots verts cuits à la vapeur." },
      d0: { title: "Poulet aux poivrons et patates douces", name: "Poulet poivrons", method: "Réchauffer la boîte 3 min au micro-ondes." },
      b1: { title: "Porridge à la banane", name: "Porridge", method: "Cuire les flocons dans le lait 4 min, ajouter la banane en rondelles." },
      l1: { title: "Salade de saumon, riz et concombre", name: "Salade de saumon", method: "Émietter le saumon froid sur le riz, ajouter le concombre en dés." },
      d1: { title: "Wrap au poulet et crudités", name: "Wrap poulet", method: "Réchauffer le poulet, garnir la tortilla avec les carottes râpées." },
      b2: { title: "Yaourt grec, miel et noix", name: "Yaourt miel", method: "Verser le yaourt, ajouter le miel et les noix." },
      l2: { title: "Bol de poulet, riz et brocoli", name: "Bol poulet", method: "Réchauffer le poulet et le riz, ajouter le brocoli vapeur." },
      d2: { title: "Saumon, patate douce et épinards", name: "Saumon patate douce", method: "Réchauffer le saumon et la patate douce, servir sur les épinards." },
    },
    terms: {
      salmon: "saumon", chicken: "blanc de poulet", pepper: "poivrons", rice: "riz complet",
      sweetPotato: "patates douces", greenBeans: "haricots verts", cucumber: "concombre",
      broccoli: "brocoli", spinach: "épinards", lemon: "citron", oil: "huile d’olive",
      yogurt: "yaourt grec", berries: "fruits rouges", oats: "flocons d’avoine", milk: "lait",
      banana: "banane", tortilla: "tortillas", carrot: "carottes", honey: "miel",
      walnuts: "noix", apple: "pomme",
    },
    reason: "Pas de saumon cette semaine",
  },
  en: {
    preps: {
      salmon: {
        title: "Lemon roast salmon",
        method: "Lay the salmon on a tray, drizzle with olive oil and lemon, roast 15 min at 200 °C, then split into portions.",
      },
      chicken: {
        title: "Chicken with peppers",
        method: "Slice the chicken and peppers, stir-fry 12 min in olive oil, then split into portions.",
      },
      rice: {
        title: "Brown rice",
        method: "Cook the rice 25 min in twice its volume of salted water, drain and let it cool before storing.",
      },
      sweetPotato: {
        title: "Roast sweet potatoes",
        method: "Dice the sweet potatoes and roast 30 min at 200 °C with a drizzle of oil.",
      },
    },
    runThrough:
      "Heat the oven to 200 °C and start the rice. Put the sweet potatoes in, then the salmon 15 min before the end. Meanwhile, stir-fry the chicken and peppers. Let everything cool and fill the boxes.",
    dishes: {
      b0: { title: "Greek yogurt, oats and berries", name: "Morning bowl", method: "Spoon the yogurt, add the oats and the berries." },
      l0: { title: "Roast salmon, brown rice and green beans", name: "Lemon salmon", method: "Reheat the salmon and rice, add the steamed green beans." },
      d0: { title: "Chicken with peppers and sweet potatoes", name: "Pepper chicken", method: "Reheat the box 3 min in the microwave." },
      b1: { title: "Banana porridge", name: "Porridge", method: "Cook the oats in the milk for 4 min, add the sliced banana." },
      l1: { title: "Salmon, rice and cucumber salad", name: "Salmon salad", method: "Flake the cold salmon over the rice, add the diced cucumber." },
      d1: { title: "Chicken wrap with crunchy veg", name: "Chicken wrap", method: "Reheat the chicken, fill the tortilla with grated carrot." },
      b2: { title: "Greek yogurt, honey and walnuts", name: "Honey yogurt", method: "Spoon the yogurt, add the honey and walnuts." },
      l2: { title: "Chicken, rice and broccoli bowl", name: "Chicken bowl", method: "Reheat the chicken and rice, add the steamed broccoli." },
      d2: { title: "Salmon, sweet potato and spinach", name: "Salmon sweet potato", method: "Reheat the salmon and sweet potato, serve over the spinach." },
    },
    terms: {
      salmon: "salmon", chicken: "chicken breast", pepper: "peppers", rice: "brown rice",
      sweetPotato: "sweet potatoes", greenBeans: "green beans", cucumber: "cucumber",
      broccoli: "broccoli", spinach: "spinach", lemon: "lemon", oil: "olive oil",
      yogurt: "Greek yogurt", berries: "berries", oats: "oats", milk: "milk",
      banana: "banana", tortilla: "tortillas", carrot: "carrots", honey: "honey",
      walnuts: "walnuts", apple: "apple",
    },
    reason: "No salmon this week",
  },
};

export interface DemoPlan {
  plan: GeneratedMealResult;
  /** Titre de plat → sa famille (« même raison »). */
  families: ReadonlyMap<string, DemoFamily>;
  /** Le plat que la visite « change »: le déjeuner au saumon du premier jour. */
  tourDishTitle: string;
  reason: string;
  memberDayEnergy: (memberId: string, day: string) => MemberDayEnergyView | null;
}

/** Les quantités d'un foyer de deux, ramenées à une personne. */
function scaled(amount: number, unit: "g" | "ml" | "unit", factor: number): number {
  if (factor === 1) return amount;
  if (unit === "unit") return Math.max(1, Math.ceil(amount * factor));
  return Math.max(5, Math.round((amount * factor) / 5) * 5);
}

/** Une ligne de courses au format de la base. */
function grocery(
  term: string,
  aisle: string,
  amount: number,
  unit: "g" | "ml" | "unit",
  buyOn: string,
) {
  return {
    ref: null,
    term,
    unit,
    aisle,
    state: "raw",
    amount,
    buy_on: buyOn,
    quantity: unit === "unit" ? String(amount) : `${amount} ${unit}`,
    food_group: null,
    purchasable: true,
    freeze_on_purchase: false,
  };
}

/** Un contenant: un repas, une personne. */
function box(id: string, member: string, items: Array<[string, number, string | null]>) {
  return {
    id,
    member_ids: [member],
    items: items.map(([term, grams, preparationId]) => ({
      term,
      grams,
      preparation_id: preparationId,
      ref: null,
      ref_refused: false,
    })),
    legacy_total_grams: null,
  };
}

/** Un ingrédient ajouté au plat le jour même. */
function fresh(term: string, grams: number) {
  return {
    term,
    quantity: `${grams} g`,
    amount: grams,
    unit: "g",
    state: "raw",
    grams_raw: grams,
    in_pantry: false,
    ref: null,
    ref_refused: false,
  };
}

/** Une casserole de la session. */
function potIngredient(term: string, amount: number, unit: "g" | "ml") {
  return {
    term,
    quantity: `${amount} ${unit}`,
    amount,
    unit,
    state: "raw",
    grams_raw: unit === "g" ? amount : null,
    in_pantry: false,
    ref: null,
    ref_refused: false,
  };
}

/**
 * LE PLAN DE DÉMONSTRATION, qui commence `startsOn` (aujourd'hui: le repère
 * « Aujourd'hui » et le premier jour du rail tombent sur la session).
 */
export function buildDemoPlan(
  startsOn: string,
  locale: UiLocale,
  people: 1 | 2 = 2,
): DemoPlan {
  const x = TEXT[locale] ?? TEXT.fr;
  const solo = people === 1;
  const factor = solo ? 0.5 : 1;
  const days = [startsOn, addDays(startsOn, 1), addDays(startsOn, 2)];
  const [t0, t1, t2] = days.map(dayTokenOf);
  const C = DEMO_MEMBER_CAMILLE;
  const A = DEMO_MEMBER_ALEX;
  const w = x.terms;

  const preparations = [
    {
      id: "prep_salmon", title: x.preps.salmon.title, method: x.preps.salmon.method, cook_on: t0,
      servings_made: solo ? 3 : 6, active_minutes: 5, total_minutes: 20,
      ingredients: [potIngredient(w.salmon, scaled(720, "g", factor), "g"), potIngredient(w.lemon, scaled(60, "g", factor), "g"), potIngredient(w.oil, scaled(15, "ml", factor), "ml")],
    },
    {
      id: "prep_chicken", title: x.preps.chicken.title, method: x.preps.chicken.method, cook_on: t0,
      servings_made: solo ? 3 : 6, active_minutes: 15, total_minutes: 15,
      ingredients: [potIngredient(w.chicken, scaled(700, "g", factor), "g"), potIngredient(w.pepper, scaled(400, "g", factor), "g"), potIngredient(w.oil, scaled(20, "ml", factor), "ml")],
    },
    {
      id: "prep_rice", title: x.preps.rice.title, method: x.preps.rice.method, cook_on: t0,
      servings_made: solo ? 3 : 6, active_minutes: 5, total_minutes: 30,
      ingredients: [potIngredient(w.rice, scaled(420, "g", factor), "g")],
    },
    {
      id: "prep_sweet_potato", title: x.preps.sweetPotato.title, method: x.preps.sweetPotato.method, cook_on: t0,
      servings_made: solo ? 2 : 4, active_minutes: 10, total_minutes: 35,
      ingredients: [potIngredient(w.sweetPotato, scaled(800, "g", factor), "g"), potIngredient(w.oil, scaled(10, "ml", factor), "ml")],
    },
  ];

  const uses = (...ids: string[]) => ids.map((id) => ({ preparation_id: id, servings: 2, kept: "fridge" }));
  const dish = (
    key: keyof DemoText["dishes"],
    day: string,
    slot: "breakfast" | "lunch" | "dinner",
    rest: Record<string, unknown>,
  ) => ({
    title: x.dishes[key].title,
    name: x.dishes[key].name,
    method: x.dishes[key].method,
    why: "",
    day,
    slot,
    member_id: null,
    side_courses: [],
    ...rest,
  });

  const dishes = [
    dish("b0", t0, "breakfast", {
      uses: [], ingredients: [], same_day: { kind: "assemble", minutes: 3 },
      boxes: [
        box(`b0_${C}`, C, [[w.yogurt, 150, null], [w.oats, 40, null], [w.berries, 80, null]]),
        box(`b0_${A}`, A, [[w.yogurt, 200, null], [w.oats, 60, null], [w.berries, 100, null]]),
      ],
    }),
    dish("l0", t0, "lunch", {
      uses: uses("prep_salmon", "prep_rice"), ingredients: [fresh(w.greenBeans, 200)],
      same_day: { kind: "assemble", minutes: 5 },
      boxes: [
        box(`l0_${C}`, C, [[w.salmon, 120, "prep_salmon"], [w.rice, 120, "prep_rice"]]),
        box(`l0_${A}`, A, [[w.salmon, 160, "prep_salmon"], [w.rice, 180, "prep_rice"]]),
      ],
      side_courses: [{
        member_id: A, kind: "dessert", term: w.apple, ref: null, grams: 150, unit_count: 1,
        preparation_id: null, source: "model",
      }],
    }),
    dish("d0", t0, "dinner", {
      uses: uses("prep_chicken", "prep_sweet_potato"), ingredients: [],
      same_day: { kind: "reheat_only", minutes: 3 },
      boxes: [
        box(`d0_${C}`, C, [[w.chicken, 130, "prep_chicken"], [w.sweetPotato, 150, "prep_sweet_potato"]]),
        box(`d0_${A}`, A, [[w.chicken, 180, "prep_chicken"], [w.sweetPotato, 220, "prep_sweet_potato"]]),
      ],
    }),
    dish("b1", t1, "breakfast", {
      uses: [], ingredients: [], same_day: { kind: "cook_fresh", minutes: 5 },
      boxes: [
        box(`b1_${C}`, C, [[w.oats, 40, null], [w.milk, 200, null], [w.banana, 100, null]]),
        box(`b1_${A}`, A, [[w.oats, 60, null], [w.milk, 250, null], [w.banana, 120, null]]),
      ],
    }),
    dish("l1", t1, "lunch", {
      uses: uses("prep_salmon", "prep_rice"), ingredients: [fresh(w.cucumber, 200)],
      same_day: { kind: "assemble", minutes: 5 },
      boxes: [
        box(`l1_${C}`, C, [[w.salmon, 110, "prep_salmon"], [w.rice, 110, "prep_rice"]]),
        box(`l1_${A}`, A, [[w.salmon, 150, "prep_salmon"], [w.rice, 170, "prep_rice"]]),
      ],
    }),
    dish("d1", t1, "dinner", {
      uses: uses("prep_chicken"), ingredients: [fresh(w.tortilla, 120), fresh(w.carrot, 150)],
      same_day: { kind: "assemble", minutes: 8 },
      boxes: [
        box(`d1_${C}`, C, [[w.chicken, 120, "prep_chicken"]]),
        box(`d1_${A}`, A, [[w.chicken, 170, "prep_chicken"]]),
      ],
    }),
    dish("b2", t2, "breakfast", {
      uses: [], ingredients: [], same_day: { kind: "assemble", minutes: 2 },
      boxes: [
        box(`b2_${C}`, C, [[w.yogurt, 150, null], [w.honey, 10, null], [w.walnuts, 15, null]]),
        box(`b2_${A}`, A, [[w.yogurt, 200, null], [w.honey, 15, null], [w.walnuts, 25, null]]),
      ],
    }),
    dish("l2", t2, "lunch", {
      uses: uses("prep_chicken", "prep_rice"), ingredients: [fresh(w.broccoli, 250)],
      same_day: { kind: "assemble", minutes: 6 },
      boxes: [
        box(`l2_${C}`, C, [[w.chicken, 120, "prep_chicken"], [w.rice, 110, "prep_rice"]]),
        box(`l2_${A}`, A, [[w.chicken, 170, "prep_chicken"], [w.rice, 160, "prep_rice"]]),
      ],
    }),
    dish("d2", t2, "dinner", {
      uses: uses("prep_salmon", "prep_sweet_potato"), ingredients: [fresh(w.spinach, 150)],
      same_day: { kind: "reheat_only", minutes: 4 },
      boxes: [
        box(`d2_${C}`, C, [[w.salmon, 120, "prep_salmon"], [w.sweetPotato, 150, "prep_sweet_potato"]]),
        box(`d2_${A}`, A, [[w.salmon, 160, "prep_salmon"], [w.sweetPotato, 200, "prep_sweet_potato"]]),
      ],
    }),
  ];

  const buy = days[0];
  const shopping = [
    grocery(w.salmon, "protein", 720, "g", buy),
    grocery(w.chicken, "protein", 700, "g", buy),
    grocery(w.pepper, "produce", 400, "g", buy),
    grocery(w.sweetPotato, "produce", 800, "g", buy),
    grocery(w.greenBeans, "produce", 200, "g", buy),
    grocery(w.cucumber, "produce", 200, "g", buy),
    grocery(w.broccoli, "produce", 250, "g", buy),
    grocery(w.spinach, "produce", 150, "g", buy),
    grocery(w.carrot, "produce", 150, "g", buy),
    grocery(w.lemon, "produce", 1, "unit", buy),
    grocery(w.banana, "produce", 2, "unit", buy),
    grocery(w.apple, "produce", 1, "unit", buy),
    grocery(w.berries, "produce", 180, "g", buy),
    grocery(w.yogurt, "dairy", 700, "g", buy),
    grocery(w.milk, "dairy", 450, "ml", buy),
    grocery(w.rice, "grains", 420, "g", buy),
    grocery(w.oats, "grains", 200, "g", buy),
    grocery(w.tortilla, "grains", 2, "unit", buy),
    grocery(w.honey, "pantry", 25, "g", buy),
    grocery(w.walnuts, "pantry", 40, "g", buy),
    grocery(w.oil, "pantry", 45, "ml", buy),
  ];

  // Une personne: les courses de moitié, et les boîtes, les parts et l'à-côté
  // d'Alex retirés — l'à-côté passe à Camille, pour que la ligne « À côté »
  // se voie aussi.
  const shoppingRows = shopping.map((row) => {
    const amount = scaled(row.amount, row.unit as "g" | "ml" | "unit", factor);
    return {
      ...row,
      amount,
      quantity: row.unit === "unit" ? String(amount) : `${amount} ${row.unit}`,
    };
  });
  const dishRows = solo
    ? dishes.map((d) => {
      const row = d as Record<string, unknown>;
      return {
        ...row,
        boxes: (row.boxes as Array<{ member_ids: string[] }>).filter((b) => b.member_ids[0] === C),
        side_courses: (row.side_courses as Array<Record<string, unknown>>).map((sc) => ({ ...sc, member_id: C })),
      };
    })
    : dishes;
  const portions = [
    { member_id: C, display_name: "Camille", eating_slots: null, portion_note: null, preparation_shares: [] },
    ...(solo
      ? []
      : [{ member_id: A, display_name: "Alex", eating_slots: null, portion_note: null, preparation_shares: [] }]),
  ];

  const plan = readMealRow({
    id: null,
    starts_on: startsOn,
    duration_days: 3,
    plan_kind: solo ? "personal" : "household",
    dishes: dishRows,
    preparations,
    cooking_sessions: [{
      day: t0,
      run_through: x.runThrough,
      total_minutes: 55,
      preparation_ids: ["prep_salmon", "prep_chicken", "prep_rice", "prep_sweet_potato"],
    }],
    shopping_list: shoppingRows,
    member_portions: portions,
  });

  const familyOf: Record<keyof DemoText["dishes"], DemoFamily> = {
    b0: "breakfast", b1: "breakfast", b2: "breakfast",
    l0: "salmon", l1: "salmon", d2: "salmon",
    d0: "chicken", d1: "chicken", l2: "chicken",
  };
  const families = new Map<string, DemoFamily>(
    (Object.keys(familyOf) as Array<keyof DemoText["dishes"]>).map((k) => [x.dishes[k].title, familyOf[k]]),
  );

  // Les calories de Camille seulement: c'est elle qui a un objectif. Alex n'a
  // pas de chiffre, et sa ligne dit « — », comme dans un vrai plan.
  const camilleKcal: Record<string, number> = { [t0]: 1640, [t1]: 1610, [t2]: 1670 };
  const memberDayEnergy = (memberId: string, day: string): MemberDayEnergyView | null =>
    memberId === C && camilleKcal[day] !== undefined
      ? { memberId, day, kcal: camilleKcal[day], complete: true, mealsCounted: 3, mealsTotal: 3 }
      : null;

  return { plan, families, tourDishTitle: x.dishes.l0.title, reason: x.reason, memberDayEnergy };
}
