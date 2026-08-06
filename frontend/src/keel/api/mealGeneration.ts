// KEEL — LE GÉNÉRATEUR DE REPAS, enfin relié à un écran.
//
// `generate-meal-v1` existait, complet et déployable, avec ZÉRO appelant: le
// seul endroit du dépôt qui le nommait était la liste du coverage-guard. Le
// moteur qui compose des plats pour un élève n'était atteignable par personne.
//
// CE QU'IL FAIT, ET QUI EST EXACTEMENT LE PRODUIT
// -----------------------------------------------
// Il lit la DOCTRINE PUBLIÉE du coach et les CONTRAINTES DE SÉCURITÉ de
// l'élève, puis compose des PLATS: un titre, un jour, un créneau, des
// ingrédients avec leur quantité, la méthode en prose, et pourquoi ce plat pour
// cet élève. Plus une liste de courses par rayon quand on lui demande.
//
// LA DOCTRINE NE S'AFFICHE JAMAIS.
// `GeneratedDish.honours_belief_keys` existe et son propre en-tête le dit:
// « Informatif — jamais exigé, jamais vérifié par un CHECK ». Les convictions du
// coach SERVENT à construire le repas; elles ne sont pas montrées à l'élève.
// C'est la différence avec le plan hebdo de méthode, qui cite la conviction
// exprès (`WeekPlanItem.source_belief_claim`). Ce module n'expose donc pas
// `honours_belief_keys`, pour qu'aucun écran ne puisse l'afficher par accident.

import { supabase } from "../../lib/supabase";
import { type MealWindowRequest, selectMealPlans } from "./mealWindow";
import { type DayToken } from "./types";

/** `MEAL_MODES` du moteur. Liste fermée: une valeur hors liste est refusée. */
export const MEAL_MODES = ["from_pantry", "to_shop"] as const;
export type MealMode = (typeof MEAL_MODES)[number];

/** `MEAL_SCOPES`. `day` plafonne à 3 plats, `several_days` à 8. */
export const MEAL_SCOPES = ["day", "several_days"] as const;
export type MealScope = (typeof MEAL_SCOPES)[number];

/**
 * LES MOMENTS OÙ ON MANGE. Miroir de `EATING_OCCASIONS` côté moteur.
 *
 * Il y en a six et plus quatre parce qu'un seul jeton `snack` ne pouvait pas
 * distinguer la faim de 10h de celle de 17h — donc un élève qui s'effondre à
 * 17h n'avait aucun moyen de le dire, et le moteur choisissait pour lui.
 *
 * `snack` n'est PAS ici: il n'est plus proposé. Il reste rendu par
 * `mealLabels` parce que des plats déjà composés le portent.
 */
export const EATING_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type EatingOccasion = (typeof EATING_OCCASIONS)[number];

/** Le créneau qu'on peut DEMANDER. Même liste: on ne propose pas le legacy. */
export const MEAL_SLOTS = EATING_OCCASIONS;
export type MealSlot = EatingOccasion;

/**
 * Un moment de la journée de l'élève, avec son heure SI il l'a donnée.
 *
 * L'heure est facultative et le reste: « je grignote l'après-midi » est utile
 * sans « à 17h », et une heure exigée serait une heure inventée — que le
 * moteur, lui, traiterait comme une contrainte.
 */
export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « 17:00 », ou `null`. */
  at: string | null;
}

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * MÊMES RÈGLES QUE `parseEatingRhythm` DU MOTEUR, et c'est délibéré: les deux
 * lisent la même colonne, et deux lectures qui divergent produiraient un écran
 * qui affiche autre chose que ce avec quoi on a composé. Écarter plutôt que
 * deviner, ordre de la journée plutôt qu'ordre de saisie, heure facultative.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, string | null>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const at = String(e.at ?? "").trim();
    bySlot.set(
      slot as EatingOccasion,
      /^([01]\d|2[0-3]):[0-5]\d$/.test(at) ? at : null,
    );
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    at: bySlot.get(s) ?? null,
  }));
}

export const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Une durée en minutes, ou `null`. Miroir de `readMinutes` du moteur.
 *
 * PAS DE ZÉRO PAR DÉFAUT: « 0 min » se lit « c'est instantané », ce qui est une
 * promesse; `null` se lit « on ne sait pas », et l'écran sait taire ce qu'il ne
 * sait pas. Plafonné à quatre heures, au-delà c'est une erreur d'unité qui
 * ferait renoncer devant une session qui prend en fait une heure.
 */
function readMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.round(n));
}

export interface DishIngredient {
  term: string;
  quantity: string | null;
  /** Vrai quand l'élève l'a déjà. Calculé par le moteur, jamais par le modèle. */
  in_pantry: boolean;
}

export interface DishBatch {
  servings_made: number;
  covers_days: string[];
  cook_on: string | null;
}

/** Ce qui se CUISINE. Plusieurs plats y puisent — une cuisson, plusieurs repas. */
export interface MealPreparation {
  id: string;
  title: string;
  servings_made: number;
  ingredients: DishIngredient[];
  method: string;
  /**
   * LE TEMPS, EN DEUX NOMBRES QUI NE DISENT PAS LA MÊME CHOSE.
   *
   * `active_minutes` = les mains dessus. `total_minutes` = du début à la fin,
   * attente comprise. Un rôti fait 10 actives et 50 totales, et cet écart EST la
   * raison pour laquelle cuisiner en lot marche: le temps de four est libre.
   * `null` = le modèle n'a rien rendu d'exploitable, et l'écran se tait.
   */
  active_minutes: number | null;
  total_minutes: number | null;
  cook_on: string | null;
}

/** Quand on cuisine, et dans quel ORDRE. Le déroulé est le champ qui compte. */
export interface CookingSession {
  day: string;
  preparation_ids: string[];
  run_through: string;
  /** La durée AU MUR de la session, pas la somme de ses préparations. */
  total_minutes: number | null;
}

export interface GeneratedDish {
  title: string;
  slot: MealSlot | null;
  day: string | null;
  ingredients: DishIngredient[];
  method: string;
  why: string;
  /**
   * Ce que ce plat PRÉLÈVE sur des préparations déjà faites. Vide = il se fait
   * de zéro, et ses `ingredients` sont pour une assiette.
   */
  uses: Array<{ preparation_id: string; servings: number }>;
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: string;
}

export interface GeneratedMealResult {
  mealId: string | null;
  dishes: GeneratedDish[];
  /** Ce qui se CUISINE. Plusieurs plats y puisent. */
  preparations: MealPreparation[];
  /** Quand on cuisine, et dans quel ordre. */
  cookingSessions: CookingSession[];
  shoppingList: ShoppingItem[];
  /**
   * LE CONTEXTE QUI A PRODUIT CETTE COMPOSITION, tel qu'il a été demandé.
   *
   * Il est renvoyé pour être REPROPOSÉ: « cantine le midi », « je m'entraîne
   * mardi et jeudi », « le week-end je suis chez mes parents » ne changent pas
   * d'une semaine sur l'autre, et les retaper à chaque génération est le genre
   * de friction qui fait qu'on ne les redit plus du tout — après quoi le moteur
   * compose pour une vie que l'élève n'a pas.
   */
  context: string | null;
  /**
   * CE DONT L'ÉLÈVE AVAIT ENVIE POUR CETTE COMPOSITION — « mezze d'été, plein
   * de carottes ». Renvoyé pour être REPROPOSÉ au formulaire, comme `context`.
   *
   * DISTINCT des goûts durables (`practical_constraints.food_preferences`), qui
   * viennent de la conversation et valent pour toutes ses semaines. Celui-ci est
   * daté: il a été tapé au moment de générer, et il se réécrit à chaque fois.
   */
  preferences: string | null;
  /**
   * QUAND CETTE COMPOSITION A ÉTÉ FAITE — l'ancre de sa semaine.
   *
   * Un plat ne nomme qu'un jour (« tue »), jamais une date. Le moteur remplit
   * sept jours À PARTIR DU JOUR OÙ ON GÉNÈRE, donc c'est cet instant, et lui
   * seul, qui dit à quelle date « mardi » correspond. Sans lui, l'écran ne peut
   * ni ranger les jours dans l'ordre du plan, ni savoir si un plat est déjà
   * passé (`api/mealStretch.ts`).
   *
   * `null` sur une composition qu'on vient de recevoir: elle commence
   * aujourd'hui, ce qui est vrai par construction.
   */
  createdAt: string | null;
  /**
   * LA FENÊTRE DE CE PLAN — le premier jour couvert et leur nombre.
   *
   * C'est ce qui donne une DATE à un jeton (« tue »), et ce qui permet à deux
   * plans de coexister sans qu'aucun écran n'ait à deviner lequel regarder.
   * Avant `20260807090000_meal_plan_window`, la table n'en portait aucune et
   * l'écran la déduisait de `created_at`.
   */
  startsOn: string;
  durationDays: number;
}

export interface PantryItem {
  term: string;
  quantity?: string | null;
}

export interface GenerateMealInput {
  mode: MealMode;
  /**
   * CE QU'ON DEMANDE, résolu par le SERVEUR avec le fuseau de l'élève.
   *
   * `scope` était une entrée et ne l'est plus: il se dérive de la durée, ce qui
   * rend inexprimable une ligne « un jour » portant une fenêtre de sept jours.
   */
  window: MealWindowRequest;
  /**
   * `replace_current` refait le plan de l'onglet qu'on REGARDE — d'où
   * `replaces`. `prepare_next` en crée un second qui démarre plus tard.
   */
  intent: "replace_current" | "prepare_next";
  replaces: string | null;
  slot: MealSlot | null;
  servings: number;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  /** L'envie du moment: « mezze d'été, plein de carottes ». */
  preferences: string | null;
  pantry: PantryItem[];
}

/**
 * Demande une composition. Le JWT de l'élève décide de qui il s'agit: aucun
 * `user_id` n'est envoyé, et le moteur n'en accepterait pas.
 *
 * Les erreurs métier du moteur (`mode_required`, `pantry_required`,
 * `empty_meal`) remontent telles quelles: elles sont NOMMÉES, et les traduire
 * en « une erreur est survenue » ferait perdre la seule information utile.
 */
export async function generateMeal(
  input: GenerateMealInput,
): Promise<GeneratedMealResult> {
  const { data, error } = await supabase.functions.invoke("generate-meal-v1", {
    body: {
      mode: input.mode,
      window: input.window.kind === "exact"
        ? {
          kind: "exact",
          starts_on: input.window.startsOn,
          duration_days: input.window.durationDays,
        }
        : input.window,
      intent: input.intent,
      replaces: input.replaces,
      meal_slot: input.slot,
      servings: input.servings,
      context: input.context,
      preferences: input.preferences,
      pantry: input.pantry,
    },
  });
  if (error) {
    // `FunctionsHttpError` porte le corps: on va y chercher le motif nommé
    // plutôt que de rendre « non-2xx status code », qui n'apprend rien.
    const detail = await readInvokeError(error);
    throw new Error(detail || `[keel/mealGeneration] ${error.message}`);
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const dishes = Array.isArray(payload.dishes) ? payload.dishes : [];
  const shopping = Array.isArray(payload.shopping_list) ? payload.shopping_list : [];
  const meal = payload.meal as { id?: string } | null | undefined;
  return {
    mealId: meal?.id ?? null,
    preparations: readPreparations(payload.preparations),
    cookingSessions: readSessions(payload.cooking_sessions),
    // Ce qu'on a DEMANDÉ, pas ce que la réponse raconte: c'est la même valeur
    // que la ligne vient d'enregistrer, et elle est connue à coup sûr ici.
    context: input.context,
    preferences: input.preferences,
    // Elle vient d'être composée: sa semaine commence aujourd'hui, et
    // `stretchStartDate(null)` le dit sans avoir à lire une horloge ici.
    createdAt: null,
    // La fenêtre RÉSOLUE PAR LE SERVEUR, renvoyée telle quelle: c'est elle qui
    // fait foi, pas celle que le navigateur avait prévisualisée.
    startsOn: String(
      ((payload.window ?? {}) as Record<string, unknown>).starts_on ?? "",
    ),
    durationDays: Number(
      ((payload.window ?? {}) as Record<string, unknown>).duration_days ?? 7,
    ),
    // On ne recopie QUE les champs de l'écran. `honours_belief_keys` est
    // volontairement laissé de côté: la doctrine du coach ne s'affiche pas.
    dishes: readDishes(dishes),
    shoppingList: readShopping(shopping),
  };
}

/** Les ingrédients d'un plat ou d'une préparation — même forme des deux côtés. */
function readIngredients(raw: unknown): DishIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const i = (entry ?? {}) as Record<string, unknown>;
    return {
      term: String(i.term ?? ""),
      quantity: i.quantity === null || i.quantity === undefined
        ? null
        : String(i.quantity),
      in_pantry: i.in_pantry === true,
    };
  });
}

/**
 * LES PLATS, NORMALISÉS — et c'est le SEUL chemin vers `GeneratedDish[]`.
 *
 * Deux appelants montent la même liste: la réponse du moteur, et une ligne
 * `student_generated_meals` relue plus tard. La ligne relue a été écrite par une
 * version antérieure du moteur, donc ses plats n'ont pas forcément les champs
 * d'aujourd'hui — `uses` est arrivé après des compositions déjà en base. Un
 * `as GeneratedDish[]` sur ce JSONB compile et jure que `dish.uses` existe;
 * l'écran fait `dish.uses.map(...)` et casse à l'ouverture, sans qu'aucun test
 * de type n'ait pu le voir. D'où: un lecteur qui DONNE les champs manquants,
 * partagé, plutôt qu'un cast qui les suppose.
 */
export function readDishes(raw: unknown): GeneratedDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      title: String(d.title ?? ""),
      slot: (d.slot ?? null) as MealSlot | null,
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      why: String(d.why ?? ""),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparation_id: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
          };
        }).filter((u) => u.preparation_id !== "")
        : [],
      ingredients: readIngredients(d.ingredients),
    };
  });
}

/** La liste de courses, même arbitrage: relue d'une ligne, elle est normalisée. */
function readShopping(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const s = (entry ?? {}) as Record<string, unknown>;
    return {
      term: String(s.term ?? ""),
      quantity: s.quantity === null || s.quantity === undefined
        ? null
        : String(s.quantity),
      aisle: String(s.aisle ?? "other"),
    };
  });
}

function readPreparations(raw: unknown): MealPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      title: String(p.title ?? ""),
      servings_made: Number(p.servings_made) || 0,
      method: String(p.method ?? ""),
      active_minutes: readMinutes(p.active_minutes),
      total_minutes: readMinutes(p.total_minutes),
      cook_on: p.cook_on === null || p.cook_on === undefined ? null : String(p.cook_on),
      ingredients: readIngredients(p.ingredients),
    };
  }).filter((p) => p.id !== "" && p.title !== "");
}

function readSessions(raw: unknown): CookingSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const sess = (entry ?? {}) as Record<string, unknown>;
    return {
      day: String(sess.day ?? ""),
      preparation_ids: Array.isArray(sess.preparation_ids)
        ? sess.preparation_ids.map((v) => String(v))
        : [],
      run_through: String(sess.run_through ?? ""),
      total_minutes: readMinutes(sess.total_minutes),
    };
  }).filter((s) => s.day !== "" && s.preparation_ids.length > 0);
}

async function readInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof (context as Response).json !== "function") return null;
  try {
    const body = await (context as Response).json();
    const named = String((body as Record<string, unknown>)?.error ?? "").trim();
    const detail = String((body as Record<string, unknown>)?.detail ?? "").trim();
    if (!named) return null;
    return detail ? `${named}: ${detail}` : named;
  } catch {
    return null;
  }
}

/** Les colonnes qu'un plan doit rendre pour être affichable ET situable. */
const MEAL_COLUMNS =
  "id, dishes, preparations, cooking_sessions, shopping_list, context, " +
  "preferences, starts_on, duration_days, retired_at, created_at";

/**
 * Une ligne de plan, telle que l'écran la lit.
 *
 * Défensif dans une seule direction: ce qui manque devient vide, jamais deviné.
 * `duration_days` retombe sur sept parce que c'est la fenêtre qu'une ligne
 * ancienne portait implicitement — et le backfill de la migration a écrit ce
 * même sept sur toutes les lignes historiques, donc les deux s'accordent.
 */
function readMealRow(raw: unknown): GeneratedMealResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    mealId: String(row.id ?? "") || null,
    dishes: readDishes(row.dishes),
    preparations: readPreparations(row.preparations),
    cookingSessions: readSessions(row.cooking_sessions),
    shoppingList: readShopping(row.shopping_list),
    context: typeof row.context === "string" && row.context.trim() !== ""
      ? row.context
      : null,
    preferences: typeof row.preferences === "string" && row.preferences.trim() !== ""
      ? row.preferences
      : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days) || 7,
  };
}

/**
 * LES DEUX PLANS DE L'ÉLÈVE: celui d'aujourd'hui, et celui qu'il a préparé.
 *
 * ── CE QUI REMPLACE `loadLatestGeneratedMeal` ────────────────────────────
 * L'ancien chargeur prenait `order by created_at desc limit 1`: « le dernier
 * écrit gagne ». C'était le seul choix possible tant que la ligne ne portait pas
 * sa fenêtre — et ça devenait faux à la seconde où un élève préparait la semaine
 * suivante: le plan à venir aurait pris la place de celui qu'il suit ce soir.
 *
 * IL EST SUPPRIMÉ, PAS ALIASÉ. Une fonction encore appelée
 * `loadLatestGeneratedMeal` promettrait que la règle supprimée tient encore.
 *
 * ── LE TRI EST FAIT PAR `mealWindow`, PAS ICI ────────────────────────────
 * On rapatrie les lignes vivantes et `selectMealPlans` tranche. C'est le même
 * module, avec la même table de cas, que celui du moteur: deux définitions de
 * « courant » divergent au premier ajustement, et personne ne sait alors
 * laquelle ment.
 *
 * ÉCHOUE FORT. « Tu n'as pas de plan » et « on n'a pas pu le lire » sont deux
 * phrases différentes, et montrer la première pour la seconde inviterait
 * l'élève à en régénérer un par-dessus celui qui existe.
 */
export async function loadMealPlans(
  userId: string,
  today: string,
): Promise<{
  current: GeneratedMealResult | null;
  next: GeneratedMealResult | null;
  elapsed: GeneratedMealResult[];
}> {
  const result = await supabase
    .from("student_generated_meals")
    .select(MEAL_COLUMNS)
    .eq("user_id", userId)
    .is("retired_at", null)
    // Borne de coût, pas de sémantique: la contrainte d'exclusion garantit déjà
    // qu'au plus une fenêtre vivante contient un jour donné. Douze lignes
    // couvrent largement le courant, le suivant et les écoulés récents.
    .order("starts_on", { ascending: false })
    .limit(12);
  if (result.error) {
    throw new Error(`[keel/mealGeneration] load failed: ${result.error.message}`);
  }

  const rows = ((result.data ?? []) as unknown[]).map(readMealRow);
  const picked = selectMealPlans(rows, today);
  return {
    current: picked.current,
    next: picked.next,
    elapsed: picked.elapsed,
  };
}

/**
 * LES PLATS DU JOUR, séparés de ceux qui ne nomment aucun jour.
 *
 * `day: null` n'est pas une anomalie: la portée « un jour » produit des plats
 * sans jour nommé, et le modèle en produit aussi en portée « plusieurs jours »
 * quand il ne place pas. Les glisser dans la liste du jour ferait lire « c'est
 * pour aujourd'hui » à quelqu'un à qui personne ne l'a dit; les jeter ferait
 * disparaître un plat qu'on a composé pour lui. Ils sont donc mis à part —
 * même règle que `weekPlanDaySplit` sur l'autre source.
 *
 * Les plats des AUTRES jours ne sortent pas d'ici: c'est l'écran d'aujourd'hui,
 * et la semaine entière se lit sur `/app/plan`.
 */
export function dishDaySplit(
  dishes: readonly GeneratedDish[],
  day: DayToken,
): { today: GeneratedDish[]; anyDay: GeneratedDish[] } {
  const today: GeneratedDish[] = [];
  const anyDay: GeneratedDish[] = [];
  for (const dish of dishes) {
    if (!dish.day) anyDay.push(dish);
    else if (dish.day === day) today.push(dish);
  }
  return { today, anyDay };
}
