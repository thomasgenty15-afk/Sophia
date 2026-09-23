/**
 * ⟳ 2026-09-23 — LA QUESTION DU SOIR SUR LES REPAS PRÉVUS. PUR.
 *
 * « Est-ce que tu as mangé tous tes repas de la journée ? » — [Oui] [Non].
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE REMPLACE, ET POURQUOI (décision du propriétaire, 2026-09-23)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * C1 (`slot_meal_ask.ts`) posait une question PAR REPAS PRÉVU: « Tu as mangé
 * le « X » prévu pour le déjeuner ? », trois à quatre fois par jour. Le repas
 * prévu est désormais PRÉSUMÉ mangé (le journal le compte, `tracking_v2.ts`),
 * donc il n'y a plus rien à confirmer repas par repas — seulement l'exception
 * à capter. Une question, une fois par jour, après le dîner:
 *
 *   · « Oui »  → les plats du jour encore sans réponse sont cochés, et une
 *                phrase de félicitation (demandée explicitement: elle renverse
 *                le « aucun bravo » de FF-058, en connaissance de cause);
 *   · « Non »  → l'écran ouvre la fenêtre « Suivi des repas » sur ce jour-là,
 *                où l'on coche les repas qui ont été loupés.
 *
 * C1 garde la question des créneaux que le plan NE COMPOSE PAS (« Rien n'était
 * prévu pour le déjeuner — tu as mangé quoi ? »): celle-là, aucune présomption
 * ne la remplace.
 *
 * ── LA PORTÉE EST CELLE DE C1, ET ELLE N'EST PAS RÉÉCRITE ─────────────────
 * Les mêmes objectifs (`SLOT_MEAL_GOALS`: perte et prise — le total mangé ne
 * pilote rien sur un maintien) et le même interrupteur
 * (`profiles.slot_meal_ask_enabled`, réduit par `slotMealAskSwitchFrom`).
 * Une troisième écriture de « qui reçoit une question sur ses repas »
 * divergerait au premier réglage.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import { localePackKey, type LocalePackKey } from "./locale.ts";
import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import {
  SLOT_MEAL_GOALS,
  SLOT_MEAL_GRACE_HOURS,
  slotMealAskSwitchFrom,
} from "./slot_meal_ask.ts";
import type { GoalToken } from "./tokens.ts";

/** Le préfixe du jeton. Disjoint de tous les autres (`KEEL_SLOTMEAL_` compris). */
export const DAY_MEALS_BUTTON_PREFIX = "KEEL_DAYMEALS_";

export const DAY_MEALS_ACTIONS = ["yes", "no"] as const;
export type DayMealsAction = (typeof DAY_MEALS_ACTIONS)[number];

/**
 * `KEEL_DAYMEALS_yes|<date>|<mealId>@<i,j,…>` et `KEEL_DAYMEALS_no|<date>`.
 *
 * ⛔ « Oui » PORTE LES INDEX, ET ILS VIENNENT DE LA QUESTION, JAMAIS D'UNE
 * RELECTURE AU MOMENT DU TAP — la règle de `slotMealButtonId`: le tap n'écrit
 * que ce que la question couvrait. « Non » n'écrit rien: il ouvre une fenêtre.
 */
const PAYLOAD =
  /^KEEL_DAYMEALS_(yes|no)\|(\d{4}-\d{2}-\d{2})(?:\|([0-9a-f-]{36})@(\d+(?:,\d+)*))?$/;

export interface DayMealsTap {
  action: DayMealsAction;
  localDate: string;
  /** Présent SI ET SEULEMENT SI l'action est `yes`. */
  plan: { mealId: string; dishIndexes: readonly number[] } | null;
}

export function dayMealsButtonId(args: {
  action: DayMealsAction;
  localDate: string;
  /** REQUIS pour `yes`, INTERDIT pour `no`. */
  plan?: { mealId: string; dishIndexes: readonly number[] } | null;
}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.localDate ?? ""))) {
    throw new Error(
      `[keel/day_meals_ask] localDate invalide: ${JSON.stringify(args.localDate)}`,
    );
  }
  const plan = args.plan ?? null;
  if (args.action === "yes" && (!plan || plan.dishIndexes.length === 0)) {
    throw new Error("[keel/day_meals_ask] `yes` exige un segment de plan");
  }
  if (args.action === "no" && plan) {
    throw new Error("[keel/day_meals_ask] `no` n'accepte pas de segment de plan");
  }
  const tail = plan ? `|${plan.mealId}@${[...plan.dishIndexes].join(",")}` : "";
  return `${DAY_MEALS_BUTTON_PREFIX}${args.action}|${args.localDate}${tail}`;
}

/** Lit un tap de la question du soir, ou rend `null`. */
export function parseDayMealsButton(raw: unknown): DayMealsTap | null {
  const m = PAYLOAD.exec(String(raw ?? "").trim());
  if (!m) return null;
  const action = m[1] as DayMealsAction;
  const mealId = m[3] ?? null;
  if ((action === "yes") !== Boolean(mealId)) return null;
  let plan: DayMealsTap["plan"] = null;
  if (mealId && m[4]) {
    const indexes = m[4].split(",").map((n) => Number(n));
    if (indexes.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const unique = [...new Set(indexes)];
    if (unique.length !== indexes.length) return null;
    plan = { mealId, dishIndexes: unique };
  }
  return { action, localDate: m[2], plan };
}

/** Pourquoi la question ne part pas. Vocabulaire FERMÉ. */
export const DAY_MEALS_SKIPS = [
  "muted",
  "no_goal",
  "goal_not_covered",
  "ask_muted",
  /** Aucun plat prévu aujourd'hui, ou tous ont déjà une réponse. */
  "nothing_open",
  /** L'heure de la question n'est pas encore là. */
  "not_elapsed",
  /** Passé l'heure de la question depuis trop longtemps. */
  "too_late",
  "already_asked",
] as const;
export type DayMealsSkip = (typeof DAY_MEALS_SKIPS)[number];

/** Les plats du jour qui n'ont encore AUCUNE réponse (ni coche, ni « pas mangé »). */
export interface OpenDayMeals {
  mealId: string;
  dishIndexes: readonly number[];
}

export type DayMealsVerdict =
  | { ask: true; atHour: number; open: OpenDayMeals }
  | { ask: false; reason: DayMealsSkip };

/**
 * L'HEURE DE LA QUESTION: une heure après le dîner DÉCLARÉ, sinon 21 h.
 *
 * Arbitrage du propriétaire (2026-09-23): « après le dîner prévu ». 21 h est le
 * repli du dîner dans ce dépôt (`SLOT_PASSED_HOUR.dinner`), déjà utilisé par C1
 * et par le journal. Plafonnée à 23: une heure de 24 n'arrive jamais.
 */
export function dayMealsAskHour(rhythmRaw: unknown): number {
  const dinner = rhythmClockFrom(rhythmRaw).find((r) => r.slot === "dinner");
  if (dinner && dinner.hour !== null) return Math.min(23, dinner.hour + 1);
  return SLOT_PASSED_HOUR.dinner ?? 21;
}

export function decideDayMealsAsk(args: {
  goal: GoalToken | null;
  muted: boolean;
  /** `profiles.slot_meal_ask_enabled`, BRUT (tri-état). */
  askEnabled: boolean | null;
  localHour: number;
  rhythmRaw: unknown;
  /** REQUIS, même `null`: « rien d'ouvert » est une déclaration. */
  open: OpenDayMeals | null;
  askedToday: boolean;
}): DayMealsVerdict {
  if (args.muted) return { ask: false, reason: "muted" };
  if (!args.goal) return { ask: false, reason: "no_goal" };
  if (!SLOT_MEAL_GOALS.has(args.goal)) {
    return { ask: false, reason: "goal_not_covered" };
  }
  if (!slotMealAskSwitchFrom({ stored: args.askEnabled, goal: args.goal }).on) {
    return { ask: false, reason: "ask_muted" };
  }
  const at = dayMealsAskHour(args.rhythmRaw);
  const hour = Number(args.localHour);
  if (!Number.isFinite(hour) || hour < at) {
    return { ask: false, reason: "not_elapsed" };
  }
  if (hour >= at + SLOT_MEAL_GRACE_HOURS) {
    return { ask: false, reason: "too_late" };
  }
  if (args.askedToday) return { ask: false, reason: "already_asked" };
  if (!args.open || args.open.dishIndexes.length === 0) {
    return { ask: false, reason: "nothing_open" };
  }
  return { ask: true, atHour: at, open: args.open };
}

// ---------------------------------------------------------------------------
// LA QUESTION, EN MOTS
// ---------------------------------------------------------------------------

const DAY_MEALS_COPY: Record<LocalePackKey, {
  ask: string;
  yes: string;
  no: string;
  /** L'accusé du « Oui »: les repas du jour sont cochés. */
  congrats: string;
  /** Le même quand la coche n'a pas pu s'écrire: on félicite sans prétendre. */
  congratsUnwritten: string;
  /** L'accusé du « Non »: l'écran de la journée vient de s'ouvrir. */
  missed: string;
}> = {
  en: {
    ask: "Did you eat all your meals today?",
    yes: "Yes",
    no: "No",
    congrats: "Well done — your whole day is ticked off.",
    congratsUnwritten:
      "Well done. I could not tick your meals just now, but they still count as planned.",
    missed: "Tick the meals you did not eat — the rest is counted automatically.",
  },
  fr: {
    ask: "Est-ce que tu as mangé tous tes repas de la journée ?",
    yes: "Oui",
    no: "Non",
    congrats: "Bravo, journée tenue ! Tout est coché.",
    congratsUnwritten:
      "Bravo ! Je n'ai pas pu cocher tes repas à l'instant, mais ils restent comptés comme prévu.",
    missed:
      "Coche les repas que tu n'as pas mangés — le reste est automatiquement pris en compte.",
  },
};

export interface DayMealsMessage {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

export function renderDayMealsAsk(args: {
  locale: string;
  localDate: string;
  open: OpenDayMeals;
}): DayMealsMessage {
  const copy = DAY_MEALS_COPY[localePackKey(String(args.locale ?? ""))];
  return {
    body: copy.ask,
    buttons: [
      {
        payload: dayMealsButtonId({
          action: "yes",
          localDate: args.localDate,
          plan: args.open,
        }),
        label: copy.yes,
      },
      {
        payload: dayMealsButtonId({ action: "no", localDate: args.localDate }),
        label: copy.no,
      },
    ],
  };
}

export function renderDayMealsAck(args: {
  locale: string;
  action: DayMealsAction;
  /** Pour `yes`: la coche est-elle en base ? Un accusé ne prétend jamais. */
  written: boolean;
}): string {
  const copy = DAY_MEALS_COPY[localePackKey(String(args.locale ?? ""))];
  if (args.action === "no") return copy.missed;
  return args.written ? copy.congrats : copy.congratsUnwritten;
}

export const DAY_MEALS_COPY_PACKS = Object.freeze(DAY_MEALS_COPY);
