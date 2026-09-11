import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildJournal,
  type JournalEvent,
  type JournalPlanned,
  promptEligibleJournalSlots,
} from "./tracking_v2.ts";

const TODAY = "2026-09-09";

function planned(overrides: Partial<JournalPlanned> = {}): JournalPlanned {
  return {
    ref: { planId: "plan-a", dishIndex: 0 },
    date: "2026-09-08",
    slot: "lunch",
    title: "Lentilles et feta",
    energy: { kcal: 640, basis: "plan_quantities" },
    confirmed: false,
    skipped: false,
    retired: false,
    priority: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function event(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "event-a",
    date: "2026-09-08",
    slot: "lunch",
    note: null,
    mediaPath: null,
    energy: { kcal: 510, basis: "photo_estimate" },
    context: null,
    refs: [],
    excluded: false,
    analysis: "ready",
    tick: false,
    updatedAt: "2026-09-08T12:30:00Z",
    ...overrides,
  };
}

function report(args: {
  planned?: JournalPlanned[];
  expected?: Parameters<typeof buildJournal>[0]["expected"];
  events?: JournalEvent[];
  energyOpen?: boolean;
  weight?: Parameters<typeof buildJournal>[0]["weight"];
}) {
  return buildJournal({
    today: TODAY,
    from: "2026-09-08",
    to: "2026-09-08",
    hour: 20,
    slotHours: { lunch: 12, dinner: 19 },
    floor: false,
    energy: { open: args.energyOpen ?? true, reason: "open" },
    target: {
      low: 1900,
      high: 2200,
      basis: "body",
      gap: null,
      direction: "down",
      weight_week_start: "2026-09-07",
    },
    planned: args.planned ?? [],
    expected: args.expected ?? [],
    events: args.events ?? [],
    weight: args.weight ?? [],
  });
}

Deno.test("journal keeps planned calories out of the reported subtotal until confirmation", () => {
  const day = report({ planned: [planned()] }).days[0];
  assertEquals(day.plannedKcal, 640);
  assertEquals(day.reportedKcal, null);
  assertEquals(day.meals[0].state, "planned");
});

Deno.test("a planned confirmation plus a photo remains one meal and uses plan energy once", () => {
  const photo = event({
    context: {
      version: 1,
      occurrenceId: "plan:plan-a:2026-09-08:lunch",
      relation: "planned",
      state: "reported",
      planRefs: [{ planId: "plan-a", dishIndex: 0 }],
    },
  });
  const day =
    report({ planned: [planned({ confirmed: true })], events: [photo] })
      .days[0];
  assertEquals(day.meals.length, 1);
  assertEquals(day.reportedKcal, 640);
  assertEquals(day.meals[0].reportedEnergy?.basis, "plan_quantities");
});

Deno.test("un goûter non déclaré OUVRE un créneau ce jour-là, sans toucher la préférence", () => {
  // ⛔ LA DEMANDE DU 2026-09-09, MOT POUR MOT: quelqu'un qui a déclaré trois
  // créneaux et qui prend une crêpe au Nutella à 16 h doit voir un créneau
  // s'ouvrir CE JOUR-LÀ dans le suivi — « ce n'est pas en mode ça change sa
  // préférence alimentaire ».
  //
  // Ce test tient la MOITIÉ JOURNAL de cette demande. L'autre moitié est dans
  // `photo_slot_inference_test.ts`: c'est elle qui range la photo de 16 h au
  // goûter. Ici, on prouve que le journal en fait une LIGNE VISIBLE et un
  // chiffre COMPTÉ, sur une journée dont le plan ne connaît que le déjeuner.
  //
  // ⚠️ ET LA PRÉFÉRENCE EST HORS DE PORTÉE PAR CONSTRUCTION: `buildJournal` est
  // pur, il ne reçoit pas `practical_constraints` et n'écrit rien. Aucun
  // écrivain de ce dépôt ne recopie un `slot_key` de fait vers
  // `eating_rhythm` — la préférence ne se change que par l'écran qui la porte.
  const snack = event({
    id: "event-snack",
    slot: "snack_pm",
    note: "une crêpe au Nutella",
    energy: { kcal: 320, basis: "photo_estimate" },
    updatedAt: "2026-09-08T16:10:00Z",
  });
  const day = report({
    planned: [planned({ confirmed: true })],
    events: [snack],
  }).days[0];

  const opened = day.meals.find((m) => m.slot === "snack_pm");
  assert(opened, "aucun créneau ne s'est ouvert pour le goûter");
  // ⛔ PAS « unattached ». Une ligne non rattachée ne compte PAS son énergie:
  // le goûter serait visible et invisible à la fois.
  assertEquals(opened.origin, "outside");
  assertEquals(opened.state, "reported");
  assertEquals(opened.reportedEnergy?.kcal, 320);
  assertEquals(opened.title, "une crêpe au Nutella");
  // Et il ENTRE dans le total du jour, à côté du déjeuner prévu.
  assertEquals(day.reportedKcal, 640 + 320);
  // Le déjeuner du plan, lui, n'a pas bougé.
  assert(day.meals.some((m) => m.slot === "lunch" && m.origin === "planned"));
});

Deno.test("an outside slot is missing only when the plan explicitly marks that slot", () => {
  const outside = report({
    expected: [{ date: "2026-09-08", slot: "lunch", kind: "outside" }],
  }).days[0];
  assertEquals(outside.meals[0].state, "missing");
  assertEquals(outside.meals[0].actions.describe, true);

  const noPlan = report({}).days[0];
  assertEquals(noPlan.meals, []);
  assertEquals(noPlan.reportedKcal, null);
});

Deno.test("a description and complementary photo share one occurrence while an explicit extra stays separate", () => {
  const context = {
    version: 1 as const,
    occurrenceId: "slot:2026-09-08:lunch",
    relation: "outside" as const,
    state: "reported" as const,
    planRefs: [],
  };
  const description = event({
    id: "text",
    note: "Salade et pain",
    energy: { kcal: 480, basis: "text_estimate" },
    context,
  });
  const photo = event({
    id: "photo",
    mediaPath: "user/photo.webp",
    context,
    updatedAt: "2026-09-08T13:00:00Z",
  });
  const extra = event({
    id: "extra",
    slot: "snack_pm",
    energy: { kcal: 190, basis: "text_estimate" },
    context: { ...context, occurrenceId: "extra:snack", relation: "extra" },
  });
  const day = report({ events: [description, photo, extra] }).days[0];
  assertEquals(day.meals.length, 2);
  assertEquals(day.reportedKcal, 700);
  assertEquals(
    day.meals.find((meal) => meal.id === context.occurrenceId)?.events.length,
    2,
  );
});

Deno.test("replacement and skipped states never add the planned dish to reported calories", () => {
  const replacement = event({
    note: "Restaurant",
    context: {
      version: 1,
      occurrenceId: "plan:plan-a:2026-09-08:lunch",
      relation: "replacement",
      state: "reported",
      planRefs: [{ planId: "plan-a", dishIndex: 0 }],
    },
  });
  const replaced =
    report({ planned: [planned()], events: [replacement] }).days[0];
  assertEquals(replaced.plannedKcal, 640);
  assertEquals(replaced.reportedKcal, 510);

  const skipped = event({
    ...replacement,
    id: "skip",
    energy: null,
    context: { ...replacement.context!, state: "skipped" },
  });
  const skippedDay =
    report({ planned: [planned()], events: [skipped] }).days[0];
  assertEquals(skippedDay.reportedKcal, null);
  assertEquals(skippedDay.meals[0].state, "skipped");
});

Deno.test("unattached ambiguity is visible without calories and energy-off strips nested estimates", () => {
  const ambiguous = event({ context: null });
  const visible = report({ planned: [planned()], events: [ambiguous] }).days[0];
  assertEquals(
    visible.meals.find((meal) => meal.origin === "unattached")?.reportedEnergy,
    null,
  );

  const hidden = report({ events: [event()], energyOpen: false }).days[0];
  assertEquals(hidden.reportedKcal, null);
  assertEquals(hidden.meals[0].events[0].energy, null);
});

Deno.test("weight history is independent from the food week", () => {
  const weights = [
    { localDate: "2026-01-02", value: 84.2 },
    { localDate: "2026-09-09", value: 80.1 },
  ];
  const built = report({ weight: weights });
  assertEquals(built.weight, weights);
  assert(built.weight && built.weight.length > 0);
  assert(built.weight[0].localDate < built.window.from);
});

Deno.test("a replaced plan keeps the evidenced historical meal without merging both versions", () => {
  const old = planned({
    ref: { planId: "plan-old", dishIndex: 0 },
    title: "Ancien déjeuner",
    energy: { kcal: 610, basis: "plan_quantities" },
    confirmed: true,
    retired: true,
    priority: "2026-09-01T08:00:00Z",
  });
  const current = planned({
    ref: { planId: "plan-new", dishIndex: 0 },
    title: "Nouveau déjeuner",
    energy: { kcal: 680, basis: "plan_quantities" },
    priority: "2026-09-08T08:00:00Z",
  });
  const day = report({ planned: [old, current] }).days[0];
  assertEquals(day.meals.length, 1);
  assertEquals(day.meals[0].title, "Ancien déjeuner");
  assertEquals(day.plannedKcal, 610);
  assertEquals(day.reportedKcal, 610);
});

Deno.test("a known fixed intake is reported and can sit beside a planned meal", () => {
  const day = report({
    planned: [planned()],
    expected: [{
      date: "2026-09-08",
      slot: "lunch",
      kind: "fixed",
      title: "Mon shaker",
      energy: { kcal: 180, basis: "declared_quantities" },
      additive: true,
    }],
  }).days[0];
  assertEquals(day.meals.length, 2);
  assertEquals(
    day.meals.find((meal) => meal.origin === "fixed")?.state,
    "reported",
  );
  assertEquals(day.reportedKcal, 180);
  assertEquals(day.plannedKcal, 640);
});

Deno.test("a response without an estimate still closes the planned meal", () => {
  const response = event({
    energy: null,
    analysis: "unavailable",
    refs: [{ planId: "plan-a", dishIndex: 0 }],
  });
  const side = planned({
    ref: { planId: "plan-a", dishIndex: 1 },
    title: "Fruit",
    energy: { kcal: 90, basis: "plan_quantities" },
  });
  const day =
    report({ planned: [planned(), side], events: [response] }).days[0];
  assertEquals(day.meals[0].state, "reported");
  assertEquals(day.meals[0].reportedEnergy, null);
  assertEquals(day.state, "incomplete");
  assertEquals(promptEligibleJournalSlots(day), []);
});

Deno.test("a day without a plan cannot trigger an automatic meal question", () => {
  const day = report({}).days[0];
  assertEquals(promptEligibleJournalSlots(day), []);
});
