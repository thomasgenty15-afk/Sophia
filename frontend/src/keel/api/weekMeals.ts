import { supabase } from "../../lib/supabase";
import { windowDates, windowDayOrder } from "./mealWindow";
import { type GeneratedMealResult, loadMealPlans } from "./mealGeneration";
import { loadHouseholdMeal } from "./household";
import { dishIsFor } from "../lib/planByPersonModel";

// ⟳ 2026-09-23 — « SUIVI DES REPAS »: CE QUE LA FENÊTRE LIT (`MealsTrackingDialog`).
//
// Une liste simple: pour chaque jour du plan qui couvre la date demandée, les
// repas prévus POUR CETTE PERSONNE. Rien d'autre — ni recette, ni courses, ni
// session: le détail vit sur `/app/plan`.
//
// ── QUEL PLAN ─────────────────────────────────────────────────────────────
// · la personne compose (solo, ou maître du foyer): son plan à elle, par
//   `loadMealPlans` — le courant, ou un plan écoulé si la date demandée est
//   antérieure (la question du soir peut être tapée après minuit);
// · la personne est un profil réclamé: le plan du foyer, par
//   `loadHouseholdMeal`. La coche s'écrit sous SON compte (FF-058 R10), et
//   `useMealTicks` s'en charge.
//
// ── QUELS PLATS ───────────────────────────────────────────────────────────
// Ceux de la table (`member_id` nul) et ceux dédiés à SA bouche — la règle de
// `dishIsFor`, la même que le journal (`tracking_v2_io.ts` saute un plat dédié à
// une autre bouche). Montrer le plat d'un enfant ici ferait cocher un repas qui
// ne compte dans aucun total.

export interface WeekMealDish {
  /** Sa position dans le `dishes[]` STOCKÉ — c'est elle qui nomme la coche. */
  dishIndex: number;
  day: string | null;
  slot: string | null;
  title: string;
}

export interface WeekMealsView {
  mealId: string;
  startsOn: string;
  durationDays: number;
  /** Les jetons de jour, dans l'ordre du plan. */
  order: string[];
  /** Jeton → date. Un jeton hors fenêtre n'a pas de date. */
  dates: Record<string, string>;
  dishes: WeekMealDish[];
}

async function myMouth(
  userId: string,
): Promise<{ memberId: string | null; composes: boolean }> {
  const { data, error } = await supabase
    .from("household_members")
    .select("member_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/weekMeals] member read failed: ${error.message}`);
  if (!data) return { memberId: null, composes: true };
  const row = data as { member_id?: unknown; role?: unknown };
  return {
    memberId: row.member_id ? String(row.member_id) : null,
    composes: String(row.role ?? "") === "owner",
  };
}

function covers(plan: GeneratedMealResult, date: string): boolean {
  return Object.values(windowDates(plan.startsOn, plan.durationDays)).includes(date);
}

/**
 * Le plan qui porte `date` (sinon le courant), réduit aux repas de la personne.
 * `null` = aucun plan vivant.
 */
export async function loadWeekMeals(args: {
  userId: string;
  today: string;
  date: string;
}): Promise<WeekMealsView | null> {
  const mouth = await myMouth(args.userId);

  if (mouth.composes) {
    const plans = await loadMealPlans(args.userId, args.today);
    const candidates = [plans.current, ...plans.elapsed].filter(
      (p): p is GeneratedMealResult => p !== null && Boolean(p.mealId),
    );
    const plan = candidates.find((p) => covers(p, args.date)) ??
      plans.current ?? null;
    if (!plan?.mealId) return null;
    return {
      mealId: plan.mealId,
      startsOn: plan.startsOn,
      durationDays: plan.durationDays,
      order: windowDayOrder(plan.startsOn, plan.durationDays),
      dates: windowDates(plan.startsOn, plan.durationDays),
      dishes: plan.dishes
        .map((d, dishIndex) => ({
          dishIndex,
          day: d.day,
          slot: d.slot,
          title: d.title,
          memberId: d.member_id,
        }))
        .filter((d) => d.title.trim() !== "" && dishIsFor(d, mouth.memberId))
        .map(({ memberId: _memberId, ...d }) => d),
    };
  }

  const household = await loadHouseholdMeal(args.today);
  if (!household) return null;
  return {
    mealId: household.mealId,
    startsOn: household.startsOn,
    durationDays: household.durationDays,
    order: windowDayOrder(household.startsOn, household.durationDays),
    dates: windowDates(household.startsOn, household.durationDays),
    dishes: household.dishes
      .filter((d) => dishIsFor(d, mouth.memberId))
      .map((d) => ({
        dishIndex: d.dishIndex,
        day: d.day,
        slot: d.slot,
        title: d.title,
      })),
  };
}

/**
 * La date d'un plat. Un plat sans jour tombe le premier jour du plan — la même
 * règle que le journal (`toTrackingPlan`), pour que la case et le total parlent
 * du même jour.
 */
export function weekMealDate(
  view: Pick<WeekMealsView, "dates" | "startsOn">,
  day: string | null,
): string | null {
  if (!day) return view.startsOn || null;
  return view.dates[day] ?? null;
}
