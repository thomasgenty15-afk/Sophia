/**
 * ⟳ 2026-09-23 — LA QUESTION DU SOIR: LA LECTURE ET L'ENVOI.
 *
 * Le module pur voisin (`day_meals_ask.ts`) décide; celui-ci va chercher ce
 * dont la décision a besoin et livre la question. Le tap est routé par
 * `_shared/chat/deterministic_buttons.ts`.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import { localDateInZone } from "./local_date.ts";
import { dayTokenForLocalDate } from "./slot_reminders.ts";
import { plannedSlotsToday } from "./slot_meal_planned_io.ts";
import { memberIdOf } from "./slot_meal_io.ts";
import {
  decideDayMealsAsk,
  type DayMealsVerdict,
  type OpenDayMeals,
  parseDayMealsButton,
  renderDayMealsAsk,
} from "./day_meals_ask.ts";
import { type GoalToken, goalTokenOrNull } from "./tokens.ts";

/** Le `purpose` de la bulle — il porte l'idempotence du jour. */
export const DAY_MEALS_PURPOSE = "keel_day_meals";
export const DAY_MEALS_ACK_PURPOSE = "keel_day_meals_ack";

/**
 * La question de CE jour est-elle déjà partie ?
 *
 * La date se relit sur le JETON du bouton (comme `slotsAskedToday`): la borne
 * `created_at` en UTC n'est qu'un filtre de coût.
 *
 * ⚠️ FAIL-CLOSED: une lecture en panne vaut « déjà demandée ». Le pire cas est
 * un soir sans question, jamais deux questions le même soir.
 */
export async function dayMealsAskedOn(
  admin: SupabaseClient,
  args: { userId: string; localDate: string },
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", args.userId)
      .eq("scope", CHAT_SCOPE)
      .eq("role", "assistant")
      .gte("created_at", `${args.localDate}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    for (
      const row of (data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>
    ) {
      if (String(row.metadata?.purpose ?? "") !== DAY_MEALS_PURPOSE) continue;
      const buttons = Array.isArray(row.metadata?.buttons)
        ? (row.metadata!.buttons as Array<{ payload?: unknown }>)
        : [];
      if (
        buttons.some((b) => parseDayMealsButton(b?.payload)?.localDate === args.localDate)
      ) return true;
    }
    return false;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.day_meals.asked_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: la question est tenue pour deja posee",
    }));
    return true;
  }
}

export interface DayMealsStepOutcome {
  verdict: DayMealsVerdict;
  delivered: boolean;
  deliveryReason?: string;
}

/** Le pas complet pour UNE personne. Mêmes entrées que `runSlotMealStep`. */
export async function runDayMealsStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    timezone: string | null;
    locale: string | null;
    muted: boolean;
    /** `profiles.slot_meal_ask_enabled`, BRUT. REQUIS. */
    askEnabled: boolean | null;
    now: Date;
    dryRun?: boolean;
    requestId?: string;
  },
): Promise<DayMealsStepOutcome> {
  const zone = String(args.timezone ?? "").trim();
  if (!zone) {
    return { verdict: { ask: false, reason: "not_elapsed" }, delivered: false };
  }
  if (args.muted) {
    return { verdict: { ask: false, reason: "muted" }, delivered: false };
  }
  const today = localDateInZone(zone, args.now);
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(args.now),
  );

  // Le rythme vit dans `practical_constraints.eating_rhythm` — une CLÉ du
  // jsonb, pas une colonne (cicatrice mesurée de `runSlotMealStep`).
  const goalsRes = await admin
    .from("student_goals")
    .select("goal, practical_constraints")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (goalsRes.error) throw goalsRes.error;
  const row = (goalsRes.data ?? null) as Record<string, unknown> | null;
  const goal: GoalToken | null = goalTokenOrNull(row?.goal);
  const rhythmRaw = (row?.practical_constraints as Record<string, unknown> | null)
    ?.eating_rhythm;

  const decide = (open: OpenDayMeals | null, askedToday: boolean) =>
    decideDayMealsAsk({
      goal,
      muted: args.muted,
      askEnabled: args.askEnabled,
      localHour,
      rhythmRaw,
      open,
      askedToday,
    });

  // ── LES PORTES GRATUITES D'ABORD ──────────────────────────────────────
  // `nothing_open` est la DERNIÈRE porte de la décision: un premier passage
  // sans plats ni historique qui rend ce motif-là dit que toutes les portes
  // gratuites (objectif, interrupteur, heure) sont franchies. Les deux lectures
  // ci-dessous ne sont payées que dans ce cas.
  const gate = decide(null, false);
  if (gate.ask || gate.reason !== "nothing_open") {
    return { verdict: gate, delivered: false };
  }

  const askedToday = await dayMealsAskedOn(admin, {
    userId: args.userId,
    localDate: today,
  });
  if (askedToday) return { verdict: decide(null, true), delivered: false };

  // Les plats du jour encore SANS réponse — ni coche, ni « pas mangé ».
  // `plannedSlotsToday` porte déjà « quel plan possède ce jour » et le filtre
  // de la bouche (un plat dédié à un autre n'est pas le sien).
  const planned = await plannedSlotsToday(admin, {
    userId: args.userId,
    localDate: today,
    dayToken: dayTokenForLocalDate(today),
    resolveMemberId: () => memberIdOf(admin, args.userId),
  });
  const open: OpenDayMeals | null = planned.slots.length > 0
    ? {
      mealId: planned.slots[0].mealId,
      dishIndexes: [
        ...new Set(
          planned.slots
            .filter((s) => s.mealId === planned.slots[0].mealId)
            .flatMap((s) => s.dishIndexes),
        ),
      ].sort((a, b) => a - b),
    }
    : null;

  const verdict = decide(open, false);
  if (!verdict.ask) return { verdict, delivered: false };
  if (args.dryRun) return { verdict, delivered: false, deliveryReason: "dry_run" };

  const message = renderDayMealsAsk({
    locale: String(args.locale ?? "") || "en-US",
    localDate: today,
    open: verdict.open,
  });
  const res = await deliverChatMessage(admin, {
    userId: args.userId,
    content: message.body,
    buttons: message.buttons,
    purpose: DAY_MEALS_PURPOSE,
    requestId: args.requestId,
    now: args.now,
  });
  return {
    verdict,
    delivered: Boolean(res.chatMessageId),
    deliveryReason: res.reason,
  };
}
