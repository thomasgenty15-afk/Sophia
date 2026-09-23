import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  dayMealsAskHour,
  dayMealsButtonId,
  decideDayMealsAsk,
  parseDayMealsButton,
  renderDayMealsAck,
  renderDayMealsAsk,
} from "./day_meals_ask.ts";
import { parseSlotMealButton } from "./slot_meal_ask.ts";

const MEAL = "11111111-2222-4333-8444-555555555555";
const DAY = "2026-09-23";
const OPEN = { mealId: MEAL, dishIndexes: [0, 2, 5] };

function decide(overrides: Partial<Parameters<typeof decideDayMealsAsk>[0]> = {}) {
  return decideDayMealsAsk({
    goal: "fat_loss",
    muted: false,
    askEnabled: null,
    localHour: 21,
    rhythmRaw: null,
    open: OPEN,
    askedToday: false,
    ...overrides,
  });
}

Deno.test("la question part après le dîner, une fois, quand des repas prévus sont ouverts", () => {
  const v = decide();
  assert(v.ask);
  if (!v.ask) return;
  assertEquals(v.atHour, 21);
  assertEquals(v.open, OPEN);
});

Deno.test("l'heure: une heure après le dîner DÉCLARÉ, sinon 21 h, jamais au-delà de 23 h", () => {
  assertEquals(dayMealsAskHour(null), 21);
  assertEquals(dayMealsAskHour([{ slot: "dinner", at: "19:30" }]), 20);
  assertEquals(dayMealsAskHour([{ slot: "dinner", at: "23:00" }]), 23);
  // Un dîner déclaré SANS heure retombe sur le repli.
  assertEquals(dayMealsAskHour([{ slot: "dinner" }]), 21);
  assertEquals(
    decide({ rhythmRaw: [{ slot: "dinner", at: "19:30" }], localHour: 19 }),
    { ask: false, reason: "not_elapsed" },
  );
  assert(decide({ rhythmRaw: [{ slot: "dinner", at: "19:30" }], localHour: 20 }).ask);
});

Deno.test("la fenêtre dure deux heures, puis la question meurt", () => {
  assert(decide({ localHour: 22 }).ask);
  assertEquals(decide({ localHour: 23 }), { ask: false, reason: "too_late" });
});

Deno.test("même portée que C1: perte et prise seulement, et le même interrupteur", () => {
  assertEquals(decide({ goal: "maintenance" }), {
    ask: false,
    reason: "goal_not_covered",
  });
  assertEquals(decide({ goal: null }), { ask: false, reason: "no_goal" });
  assertEquals(decide({ askEnabled: false }), { ask: false, reason: "ask_muted" });
  assertEquals(decide({ muted: true }), { ask: false, reason: "muted" });
  assert(decide({ goal: "muscle_gain" }).ask);
});

Deno.test("rien d'ouvert, ou déjà demandée ce jour-là: pas de question", () => {
  assertEquals(decide({ open: null }), { ask: false, reason: "nothing_open" });
  assertEquals(decide({ open: { mealId: MEAL, dishIndexes: [] } }), {
    ask: false,
    reason: "nothing_open",
  });
  assertEquals(decide({ askedToday: true }), {
    ask: false,
    reason: "already_asked",
  });
});

Deno.test("⛔ `nothing_open` est la DERNIÈRE porte — l'IO s'en sert pour ne payer ses lectures qu'après les portes gratuites", () => {
  // `runDayMealsStep` appelle d'abord la décision avec `open: null`: tant
  // qu'une porte gratuite ferme, elle doit rendre SON motif, jamais
  // `nothing_open`.
  assertEquals(decide({ open: null, goal: "maintenance" }).ask, false);
  assertEquals(
    (decide({ open: null, goal: "maintenance" }) as { reason: string }).reason,
    "goal_not_covered",
  );
  assertEquals(
    (decide({ open: null, localHour: 10 }) as { reason: string }).reason,
    "not_elapsed",
  );
  assertEquals(
    (decide({ open: null }) as { reason: string }).reason,
    "nothing_open",
  );
});

Deno.test("la question en mots, et ses deux boutons: Oui porte les plats, Non n'écrit rien", () => {
  const fr = renderDayMealsAsk({ locale: "fr-FR", localDate: DAY, open: OPEN });
  assertEquals(fr.body, "Est-ce que tu as mangé tous tes repas de la journée ?");
  assertEquals(fr.buttons.map((b) => b.label), ["Oui", "Non"]);
  const [yes, no] = fr.buttons.map((b) => parseDayMealsButton(b.payload));
  assertEquals(yes, {
    action: "yes",
    localDate: DAY,
    plan: { mealId: MEAL, dishIndexes: [0, 2, 5] },
  });
  assertEquals(no, { action: "no", localDate: DAY, plan: null });

  const en = renderDayMealsAsk({ locale: "en-GB", localDate: DAY, open: OPEN });
  assertEquals(en.buttons.map((b) => b.label), ["Yes", "No"]);
});

Deno.test("le jeton: le plan est OBLIGATOIRE pour Oui, INTERDIT pour Non, dans les deux sens", () => {
  assertThrows(() => dayMealsButtonId({ action: "yes", localDate: DAY }));
  assertThrows(() => dayMealsButtonId({ action: "no", localDate: DAY, plan: OPEN }));
  assertEquals(parseDayMealsButton(`KEEL_DAYMEALS_yes|${DAY}`), null);
  assertEquals(parseDayMealsButton(`KEEL_DAYMEALS_no|${DAY}|${MEAL}@1`), null);
  assertEquals(parseDayMealsButton(`KEEL_DAYMEALS_yes|${DAY}|${MEAL}@1,1`), null);
  assertEquals(parseDayMealsButton("KEEL_DAYMEALS_maybe|2026-09-23"), null);
});

Deno.test("les deux vocabulaires sont disjoints: aucun ne lit le jeton de l'autre", () => {
  const ours = dayMealsButtonId({ action: "yes", localDate: DAY, plan: OPEN });
  assertEquals(parseSlotMealButton(ours), null);
  assertEquals(
    parseDayMealsButton(`KEEL_SLOTMEAL_ate|${DAY}|lunch|${MEAL}@1`),
    null,
  );
});

Deno.test("l'accusé: la félicitation ne prétend pas quand la coche n'a pas pris", () => {
  assertEquals(
    renderDayMealsAck({ locale: "fr-FR", action: "yes", written: true }),
    "Bravo, journée tenue ! Tout est coché.",
  );
  const unwritten = renderDayMealsAck({ locale: "fr-FR", action: "yes", written: false });
  assert(!unwritten.includes("Tout est coché"), unwritten);
  assert(
    renderDayMealsAck({ locale: "fr-FR", action: "no", written: true })
      .includes("Coche les repas que tu n'as pas mangés"),
  );
});
