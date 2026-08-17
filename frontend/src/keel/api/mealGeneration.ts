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
import { readEdgeRefusal } from "./edgeErrors";
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
 * La taille d'un moment — liste FERMÉE, et facultative.
 *
 * Remplace l'heure, qui ne servait qu'à une parenthèse de prose dans la
 * consigne. Voir `MEAL_SIZES` du moteur pour l'arbitrage complet, et pour
 * pourquoi ce n'est pas une quantité au sens de CONTRACT.md.
 */
export const MEAL_SIZES = ["small", "medium", "large"] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

/**
 * Un moment de la journée de l'élève, avec sa taille SI il l'a donnée.
 *
 * La taille est facultative et le reste: « je grignote l'après-midi » est utile
 * sans savoir si c'est gros ou petit, et une taille exigée serait une taille
 * inventée — que le moteur, lui, traiterait comme une contrainte.
 */
export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « large », ou `null`. */
  size: MealSize | null;
}

/**
 * Un moment où l'élève NE MANGE PAS ICI — cantine, restaurant, absent.
 *
 * MIROIR de `AwayDay` du moteur. `slots` vide vaut la journée entière, et la
 * clé est `practical_constraints.away_days` — celle que FF-002 a posée pour
 * l'absence récurrente, pas une seconde pour la même chose.
 */
export interface AwayDay {
  day: string;
  slots: EatingOccasion[];
}

/**
 * Les absences lues depuis `practical_constraints.away_days`.
 *
 * MÊMES RÈGLES QUE `parseAwayDays` DU MOTEUR, et pour la même raison que les
 * deux `parseEatingRhythm`: les deux lisent la même colonne, et deux lectures
 * qui divergent produiraient une grille qui montre autre chose que ce avec
 * quoi on a composé.
 *
 * En particulier: « aucun créneau demandé » (journée entière) et « aucun
 * créneau lisible » (faute de frappe) ne sont pas la même chose. Confondre les
 * deux transformerait un mot mal tapé en journée entière supprimée.
 */
export function parseAwayDays(raw: unknown): AwayDay[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<EatingOccasion>>();
  const wholeDay = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim().toLowerCase();
    if (!(DAY_TOKENS as readonly string[]).includes(day)) continue;
    const askedSlots = Array.isArray(e.slots) && e.slots.length > 0;
    const slots = askedSlots
      ? (e.slots as unknown[])
        .map((s) => String(s ?? "").trim().toLowerCase())
        .filter((s): s is EatingOccasion =>
          (EATING_OCCASIONS as readonly string[]).includes(s)
        )
      : [];
    if (askedSlots && slots.length === 0) continue;
    if (!askedSlots) {
      wholeDay.add(day);
      byDay.delete(day);
      continue;
    }
    if (wholeDay.has(day)) continue;
    const set = byDay.get(day) ?? new Set<EatingOccasion>();
    slots.forEach((s) => set.add(s));
    byDay.set(day, set);
  }
  const out: AwayDay[] = [];
  for (const day of DAY_TOKENS) {
    if (wholeDay.has(day)) out.push({ day, slots: [] });
    else if (byDay.has(day)) {
      out.push({
        day,
        slots: EATING_OCCASIONS.filter((s) => byDay.get(day)!.has(s)),
      });
    }
  }
  return out;
}

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * MÊMES RÈGLES QUE `parseEatingRhythm` DU MOTEUR, et c'est délibéré: les deux
 * lisent la même colonne, et deux lectures qui divergent produiraient un écran
 * qui affiche autre chose que ce avec quoi on a composé. Écarter plutôt que
 * deviner, ordre de la journée plutôt qu'ordre de saisie, taille facultative,
 * la chaîne nue (`"lunch"`) lue comme le moment sans taille, et l'ancienne clé
 * `at` ignorée sans être migrée — voir l'en-tête du moteur pour chacune.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, MealSize | null>();
  for (const entry of raw) {
    if (typeof entry === "string") {
      const slot = entry.trim().toLowerCase();
      if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
      if (!bySlot.has(slot as EatingOccasion)) {
        bySlot.set(slot as EatingOccasion, null);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const size = String(e.size ?? "").trim().toLowerCase();
    bySlot.set(
      slot as EatingOccasion,
      (MEAL_SIZES as readonly string[]).includes(size) ? (size as MealSize) : null,
    );
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    size: bySlot.get(s) ?? null,
  }));
}

/**
 * LE RYTHME QUE LE MOTEUR IMPOSE QUAND RIEN N'EST DÉCLARÉ.
 *
 * MIROIR EXACT de `DEFAULT_EATING_RHYTHM` côté moteur, et pour la raison qui
 * vaut pour les deux parseurs de ce fichier: un écran qui propose de marquer
 * une absence doit proposer les moments avec lesquels on va COMPOSER. Une
 * troisième liste par défaut ferait cocher des cases sur des repas qui
 * n'existent pas, et laisserait invisibles ceux qui existent.
 */
export const DEFAULT_EATING_RHYTHM: readonly EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

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

/**
 * LOT 2 — LES QUATRE GESTES DU JOUR J, recopiés du moteur.
 *
 * ⚠️ RECOPIÉE ET PAS IMPORTÉE, comme tout ce fichier: le front ne partage aucun
 * module avec `supabase/functions/_shared/keel/`. La divergence est tenue par un
 * test qui lit la source du moteur — sans lui, un jeton ajouté côté serveur
 * arriverait ici sous forme de bandeau muet.
 */
export const SAME_DAY_KINDS = [
  "none",
  "reheat_only",
  "assemble",
  "cook_fresh",
] as const;

export type SameDayKind = typeof SAME_DAY_KINDS[number];

/**
 * CE QU'IL Y A À FAIRE LE JOUR MÊME POUR AVOIR CE PLAT DANS L'ASSIETTE.
 *
 * ⚠️ `minutes` EST UN TEMPS DE PLAT. Il ne se confond avec AUCUN des deux temps
 * qui existaient déjà, et la carte d'un plat n'a le droit d'afficher que
 * celui-ci: `MealPreparation.active_minutes` / `.total_minutes` sont des temps
 * de CUISSON et `CookingSession.total_minutes` un temps de SESSION — ils ont
 * leur surface (« tes sessions de cuisine »), et les remonter sur un plat
 * annoncerait « réchauffe une portion » à cinquante minutes. La ceinture est
 * dans `lib/dishSession.int.test.ts`, et elle reste mordante.
 *
 * `null` = le modèle a nommé le geste sans donner de durée. L'écran rend alors
 * le libellé seul: pas de « 0 min », qui se lirait « c'est instantané ».
 */
export interface DishSameDay {
  kind: SameDayKind;
  minutes: number | null;
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
  /**
   * LOT 2 — CE QU'ON FAIT LE JOUR MÊME, tel que le moteur l'a validé.
   *
   * `null` sur tout plan écrit AVANT le 2026-08-17 (la clé n'existait pas), et
   * sur tout plat où le modèle ne l'a pas déclaré. Ce n'est PAS « rien à
   * faire »: `none` dit ça, et il le dit exprès. L'écran se tait plutôt que
   * d'inventer — écrire « rien à préparer » sur un plat qui n'a rien déclaré
   * serait affirmer un fait que personne n'a écrit.
   */
  same_day: DishSameDay | null;
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: string;
}

/**
 * FF-053 — UN APPORT FIXE, TEL QUE LA FONCTION L'A LU.
 *
 * Aplati pour le transport: côté moteur c'est une union à deux branches
 * (FF-051), ici `slot: null` dit « hors moment nommé ». La grille n'a besoin que
 * de savoir QUEL créneau est pris, et par quel libellé le nommer.
 */
export interface PlanFixedIntake {
  foodRef: string;
  label: string;
  slot: EatingOccasion | null;
  replacesMeal: boolean;
  /** Vide = tous les jours (même convention que `AwayDay.slots`). */
  days: string[];
}

/** FF-053 — Ce qu'un jour EST, tel que la fonction l'a lu (FF-052). */
export interface PlanDayProperty {
  day: string;
  properties: string[];
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
   * FF-053 — CE QUI EXPLIQUE UNE CASE VIDE.
   *
   * Renvoyés par la FONCTION, jamais relus depuis `practical_constraints` par
   * l'écran: elle seule sait ce qu'elle a réellement lu, entrées malformées
   * écartées. Un marqueur pour une déclaration que la composition a ignorée est
   * pire que pas de marqueur.
   */
  fixedIntakes: PlanFixedIntake[];
  dayProperties: PlanDayProperty[];
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
  /**
   * L3 — LA NATURE DE CE PLAN, et elle n'est PAS déductible de `household_id`.
   *
   * `personal` est ce qu'un secondaire compose pour lui; `household` est ce que
   * le maître cuisine pour toute la table. Un plan PERSONNEL porte aussi le
   * `household_id` (`generate-meal-v1` l'estampe exprès, pour que la fusion le
   * retrouve): deux lecteurs indépendants s'y sont trompés le 2026-08-12, et
   * c'est pour ça que la colonne voyage désormais jusqu'ici.
   */
  planKind: "personal" | "household";
  /**
   * D7 — QUAND SON PORTEUR A DÉCLARÉ LE CUISINER LUI-MÊME. `null` = jamais.
   *
   * C'est ce que le foyer lit pour savoir qui a pris la main, et ce que D8
   * compare pour détecter « validé APRÈS la fusion ». Écrit par la seule
   * `keel_validate_meal_plan`, sous le jeton du titulaire.
   */
  validatedAt: string | null;
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
   *
   * ── `draft` — LE TROISIÈME, ET IL N'ÉCRIT RIEN ──────────────────────────
   * Toutes les gardes AMONT s'appliquent à l'identique (gel, objectif requis,
   * méthode publiée, fenêtre, chevauchement, TCA, doctrine, règles de maison):
   * le SEUL saut est l'écriture. Ni plan, ni parts, ni quota de fusion
   * consommé. La réponse porte le même contenu, plus `draft: true` et un
   * `meal.id` nul.
   *
   * ⚠️ `replaces` EST REFUSÉ AVEC `draft` (`unknown_intent`), et c'est
   * cohérent: un aperçu ne remplace rien, puisqu'il n'écrit rien. Passer les
   * deux serait demander au serveur de retirer un plan au profit d'un plan qui
   * n'existera pas.
   */
  intent: "replace_current" | "prepare_next" | "draft";
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
    fixedIntakes: readFixedIntakes(payload.fixed_intakes),
    dayProperties: readDayProperties(payload.day_properties),
    // `generate-meal-v1` ne compose QUE des plans personnels (D2: le plan du
    // maître EST le plan du foyer, et il se compose depuis l'écran du foyer).
    // Écrit en dur plutôt que lu dans la réponse: la fonction ne rend pas la
    // nature, et la deviner d'un champ absent la rendrait `undefined` — donc
    // « pas personnel » pour tout lecteur naïf.
    planKind: "personal",
    // Une composition neuve n'est JAMAIS validée: prendre la main est un geste
    // séparé, et l'écran le demande explicitement (O2).
    validatedAt: null,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O2 — LA GÂCHETTE. PRENDRE LA MAIN SUR SA PROPRE SEMAINE (D2, D7).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ C'EST LE SEUL APPELANT DE `keel_validate_meal_plan` DU PRODUIT, et jusqu'à
 * ce lot il n'y en avait AUCUN. Le registre l'a écrit trois lots de suite:
 * « aucune surface produit n'appelle `keel_validate_meal_plan` — la prise de
 * main est inatteignable par un vrai utilisateur ». Sans cette ligne, personne
 * ne prend la main, donc rien n'est jamais proposé au maître, donc ni fusion,
 * ni défusion, ni avertissement n'existent: sept lots de serveur reposent sur
 * ce geste.
 *
 * ── POURQUOI PAR POSTGREST, ET PAS PAR UNE FONCTION EDGE ─────────────────
 * La RPC est gatée sur `auth.uid()` et son `EXECUTE` est RÉVOQUÉ à
 * `service_role` (migration 20260811140000, exprès: `auth.uid()` y est NULL, et
 * l'appel rendait un 200 qui n'écrivait rien). AUCUNE fonction edge ne peut
 * donc la porter. La gâchette est structurellement un appel PostgREST sous le
 * jeton du titulaire — c'est-à-dire cette ligne-ci.
 *
 * ── `already` N'EST PAS UN ÉCHEC ─────────────────────────────────────────
 * La RPC est idempotente SOUS CONCURRENCE: la garde est dans le prédicat de
 * l'`update`, et quatre appels simultanés ne redatent pas la ligne (mesuré le
 * 2026-08-11 sur six plans, zéro collision). `already: true` veut dire
 * « c'était déjà validé », ce qui est le résultat souhaité — le traiter comme
 * une erreur ferait d'un double-clic un écran rouge, et pousserait à recliquer.
 */
export interface ValidateMealPlanResult {
  ok: boolean;
  /** Vrai quand ce plan était DÉJÀ validé. Un succès, pas un refus. */
  already: boolean;
  /** Le motif NOMMÉ du refus, ou `""`. Traduit par `copy/planRefusals.ts`. */
  reason: string;
}

export async function validateMealPlan(
  planId: string,
): Promise<ValidateMealPlanResult> {
  const { data, error } = await supabase.rpc("keel_validate_meal_plan", {
    p_plan: planId,
  });
  if (error) throw new Error(`[keel/mealGeneration] validate failed: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    already: row.already === true,
    reason: String(row.reason ?? ""),
  };
}

/**
 * Les apports fixes de la réponse. Défensif dans une seule direction, comme
 * tous les lecteurs de ce fichier: ce qu'on ne sait pas lire tombe SEUL.
 *
 * ⚠️ `export` AJOUTÉ POUR `api/planDraft.ts`, ET C'EST LE SEUL GESTE POSSIBLE.
 * Le brouillon (`intent: "draft"`) reçoit EXACTEMENT le même payload qu'un plan
 * écrit, et il doit le monter dans le MÊME `PlanResult`. Sans cet export, le
 * module du brouillon devrait recopier ce lecteur — c'est-à-dire un second
 * normaliseur du même JSON, qui divergerait au premier champ ajouté, et c'est
 * toujours celui qu'on regarde le moins qui garde l'ancien comportement.
 * Aucune ligne de LOGIQUE n'a changé ici: seulement la visibilité.
 */
export function readFixedIntakes(raw: unknown): PlanFixedIntake[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanFixedIntake[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const foodRef = String(e.food_ref ?? "").trim();
    if (!foodRef) continue;
    const slot = String(e.slot ?? "").trim();
    out.push({
      foodRef,
      // Le libellé retombe sur l'identifiant: la grille doit pouvoir nommer la
      // case, et un identifiant est un plus mauvais nom que rien n'est pire.
      label: String(e.label ?? "").trim() || foodRef,
      slot: EATING_OCCASIONS.includes(slot as EatingOccasion)
        ? (slot as EatingOccasion)
        : null,
      replacesMeal: e.replaces_meal === true,
      days: Array.isArray(e.days) ? e.days.map((d) => String(d)) : [],
    });
  }
  return out;
}

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readDayProperties(raw: unknown): PlanDayProperty[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanDayProperty[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim();
    const properties = Array.isArray(e.properties)
      ? e.properties.map((p) => String(p)).filter(Boolean)
      : [];
    if (!day || properties.length === 0) continue;
    out.push({ day, properties });
  }
  return out;
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
      same_day: readSameDay(d.same_day),
    };
  });
}

/**
 * LOT 2 — LE GESTE DU JOUR J, RELU D'UNE LIGNE ET REVALIDÉ ICI.
 *
 * ⚠️ LA LISTE FERMÉE EST VÉRIFIÉE UNE SECONDE FOIS, et ce n'est pas de la
 * paranoïa: ce lecteur monte aussi des lignes `student_generated_meals` écrites
 * par une AUTRE version du moteur. Un `as SameDayKind` compilerait et jurerait
 * que le jeton est bon; l'écran ferait alors `mealCopy("meals.same_day." + kind)`
 * sur une clé qui n'existe pas — et en DEV, une clé absente LÈVE. Le plan entier
 * disparaîtrait pour un champ décoratif.
 *
 * Même arbitrage que `uses` juste au-dessus: un lecteur qui DONNE les champs
 * manquants, jamais un cast qui les suppose.
 */
function readSameDay(raw: unknown): DishSameDay | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const sd = raw as Record<string, unknown>;
  const kind = String(sd.kind ?? "");
  if (!(SAME_DAY_KINDS as readonly string[]).includes(kind)) return null;
  const minutes = Number(sd.minutes);
  return {
    kind: kind as SameDayKind,
    // `null` et JAMAIS zéro par défaut: « 0 min » se lit « c'est instantané »,
    // ce qui est une affirmation que le moteur n'a pas faite.
    minutes: Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null,
  };
}

/**
 * La liste de courses, même arbitrage: relue d'une ligne, elle est normalisée.
 *
 * `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`: depuis
 * le LOT 1, le brouillon rend ses courses jour par jour, et il les relit donc
 * de la MÊME façon que le plan adopté. Deux lectures de la même ligne
 * divergeraient.
 */
export function readShopping(raw: unknown): ShoppingItem[] {
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

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readPreparations(raw: unknown): MealPreparation[] {
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

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readSessions(raw: unknown): CookingSession[] {
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

/**
 * « JETON: DÉTAIL » — la forme que `MealBuilder` découpe sur le premier `:`.
 *
 * ⚠️ LA LECTURE DU CORPS N'EST PLUS ICI. Ce fichier avait son propre lecteur,
 * jumeau de `namedEdgeRefusal`, et les deux avaient le MÊME trou: un 401 dont
 * le corps ne porte pas de clé `error` — c'est-à-dire la session périmée, le
 * cas le plus banal qui soit — rendait `null`, et l'élève lisait la phrase de
 * supabase-js (« Edge Function returned a non-2xx status code ») au lieu d'une
 * phrase sur sa session. Voir `api/edgeErrors.ts`.
 */
async function readInvokeError(error: unknown): Promise<string | null> {
  const refusal = await readEdgeRefusal(error);
  if (!refusal) return null;
  return refusal.detail ? `${refusal.token}: ${refusal.detail}` : refusal.token;
}

/** Les colonnes qu'un plan doit rendre pour être affichable ET situable. */
const MEAL_COLUMNS =
  // L8 — `plan_kind` sert à ne montrer QUE le plan qu'on cuisine (D9), et
  // `validated_at` à dire si on a pris la main dessus (D7). Voir `cookedPlans`.
  "plan_kind, validated_at, " +
  "id, dishes, preparations, cooking_sessions, shopping_list, context, " +
  // `generated_from` porte, depuis FF-053, ce SOUS QUOI le plan a été composé —
  // apports fixes et propriétés de jour. Sans cette colonne, la grille
  // expliquerait ses cases vides juste après la génération et se tairait au
  // premier rafraîchissement.
  "preferences, starts_on, duration_days, retired_at, created_at, generated_from";

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
    // Les DEUX lectures figées à la composition. Une ligne écrite avant FF-053
    // n'en a pas: la grille montre alors des cases vides sans explication, ce
    // qui est exactement ce qui était vrai pour ce plan-là.
    fixedIntakes: readFixedIntakes(
      ((row.generated_from ?? {}) as Record<string, unknown>).fixed_intakes,
    ),
    dayProperties: readDayProperties(
      ((row.generated_from ?? {}) as Record<string, unknown>).day_properties,
    ),
    context: typeof row.context === "string" && row.context.trim() !== ""
      ? row.context
      : null,
    preferences: typeof row.preferences === "string" && row.preferences.trim() !== ""
      ? row.preferences
      : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days) || 7,
    // Hors vocabulaire ⇒ `personal`, qui est le DÉFAUT de la colonne en base
    // (`not null default 'personal'`) et la direction sûre: se tromper vers
    // « personnel » montre à quelqu'un un plan qui est le sien, se tromper vers
    // « foyer » lui cacherait le seul plan qu'il a.
    planKind: row.plan_kind === "household" ? "household" : "personal",
    validatedAt: typeof row.validated_at === "string" ? row.validated_at : null,
  };
}

/**
 * D9 — LE PLAN QU'ON CUISINE, ET LUI SEUL.
 *
 * > « Le maître ACCÈDE à tous les plans, mais sa surface de cuisine n'affiche
 * > QUE le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas: le
 * > but est de simplifier sa cuisine, pas de lui faire suivre N plans. »
 *
 * ── POURQUOI LA RÈGLE SE LIT SUR LES LIGNES, ET PAS SUR LE RÔLE ──────────
 * Seul un compte MAÎTRE porte des lignes `plan_kind = 'household'`: c'est la
 * fonction du foyer qui les écrit, sur son user_id. « J'ai un plan de foyer
 * vivant » est donc exactement « je suis le maître d'un foyer qui a composé »,
 * sans lire ni `household_members`, ni un rôle, ni une seconde requête. Une
 * lecture de plus aurait été une seconde définition de la même chose — et le
 * jour où les deux divergent, personne ne sait laquelle ment.
 *
 * ⚠️ CE N'EST PAS DÉFENSIF, C'EST NÉCESSAIRE. Les deux natures peuvent couvrir
 * LES MÊMES JOURS: la contrainte d'exclusion est scopée `(user_id, plan_kind)`,
 * exprès (« sans ça le maître ne peut pas tenir les deux »). Sans ce filtre,
 * `selectMealPlans` choisirait entre deux plans vivants du même jour selon leur
 * seule date de début — le maître verrait tantôt sa semaine de foyer, tantôt un
 * plan personnel oublié, sans rien pour distinguer les deux à l'écran.
 *
 * ── LE REPLI EST LE PLAN PERSONNEL ───────────────────────────────────────
 * Aucun plan de foyer vivant ⇒ on rend tout le reste. C'est le cas du compte
 * individuel (l'entrée du produit est à 1), celui du secondaire qui a pris la
 * main, et celui du maître qui n'a pas encore composé — à qui on ne montre pas
 * un écran vide alors qu'il a un plan.
 */
export function cookedPlans(
  rows: readonly GeneratedMealResult[],
): GeneratedMealResult[] {
  const household = rows.filter((r) => r.planKind === "household");
  return household.length > 0 ? household : rows.filter((r) => r.planKind !== "household");
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

  // D9 — ON NE TRIE QUE CE QU'ON CUISINE. Le filtre est AVANT `selectMealPlans`
  // et pas après: deux plans de natures différentes peuvent couvrir le même
  // jour, et « le courant » n'a de sens qu'une fois la nature tranchée.
  const rows = cookedPlans(((result.data ?? []) as unknown[]).map(readMealRow));
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
