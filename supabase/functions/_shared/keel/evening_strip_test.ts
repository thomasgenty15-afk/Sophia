import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  acceptStripText,
  buildEveningStrip,
  MAX_STRIP_TITLES,
  readStripReply,
  renderStripAck,
  renderStripDishStep,
  STRIP_BUTTON_PREFIX,
  stripAllId,
  stripShoppingId,
  stripTickId,
  stripUntickId,
  type StripDish,
} from "./evening_strip.ts";
import { mealTickKey, parseMealTickKey } from "./meal_tick.ts";
import { readPulseReply } from "./daily_pulse.ts";
import { planGroceryWaves } from "./grocery_waves.ts";
import { readRecommendationReply } from "./daily_recommendation.ts";

const MEAL = "11111111-2222-3333-4444-555555555555";

function dishes(...titles: string[]): StripDish[] {
  return titles.map((title, dishIndex) => ({ dishIndex, title }));
}

// ---------------------------------------------------------------------------
// R1 — LE CAS NOMINAL COÛTE UN TAP
// ---------------------------------------------------------------------------

Deno.test("R1 — a normal evening offers ONE aggregate tap, and it carries every index", () => {
  const strip = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Chicken and rice", "Soup", "Greek yoghurt"),
    language: "en",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  if (!strip) throw new Error("expected a strip");

  // Deux boutons: le tap unique, et la porte de sortie vers le détail.
  assertEquals(strip.buttons.length, 2);
  assertEquals(strip.buttons[0].title, "✓ All as planned");
  assertEquals(strip.buttons[1].title, "Not everything");
  assertEquals(strip.dishCount, 3);
  assertEquals(strip.carriesShopping, false);

  const reply = readStripReply(strip.buttons[0].id);
  assertEquals(reply.kind, "all");
  if (reply.kind === "all") {
    assertEquals(reply.mealId, MEAL);
    // RECONSTRUCTIBLE: la liste des index, pas un « tout » à réinterpréter.
    assertEquals(reply.dishIndexes, [0, 1, 2]);
  }
});

Deno.test("the line NAMES the dishes, in both languages", () => {
  const en = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Chicken and rice", "Soup"),
    language: "en",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  assertEquals(en?.line, "Today : Chicken and rice · Soup");

  const fr = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Poulet-riz", "Soupe"),
    language: "fr",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  assertEquals(fr?.line, "Aujourd'hui : Poulet-riz · Soupe");
});

Deno.test("beyond the ceiling the line COUNTS instead of naming — and the tap still carries every index", () => {
  const many = dishes("A", "B", "C", "D", "E", "F");
  const strip = buildEveningStrip({
    mealId: MEAL,
    dishes: many,
    language: "en",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  if (!strip) throw new Error("expected a strip");
  assertEquals(strip.line.includes("2 more"), true);
  assertEquals(strip.line.includes("E"), false);
  const reply = readStripReply(strip.buttons[0].id);
  if (reply.kind !== "all") throw new Error("expected an aggregate reply");
  // La bande NOMME quatre plats et COCHE les six: le libellé abrège, le tap non.
  assertEquals(reply.dishIndexes.length, many.length);
  assertEquals(MAX_STRIP_TITLES, 4);
});

// ---------------------------------------------------------------------------
// R7 — ZÉRO PLAT PRÉVU, AUCUNE BANDE
// ---------------------------------------------------------------------------

Deno.test("R7 — no dish planned means no strip at all, shopping wave or not", () => {
  assertEquals(
    buildEveningStrip({
      mealId: MEAL,
      dishes: [],
      language: "en",
      shopping: null,
      masterOnly: true,
      restrictionFlag: false,
    }),
    null,
  );
  // Même avec une vague qui tombe ce soir: la ligne de courses voyage DANS la
  // bande, elle n'en est pas une à elle seule.
  assertEquals(
    buildEveningStrip({
      mealId: MEAL,
      dishes: [],
      language: "en",
      shopping: { buyOn: "2026-08-12" },
      masterOnly: true,
      restrictionFlag: false,
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// R14/R15 — LA LIGNE DE COURSES
// ---------------------------------------------------------------------------

Deno.test("R15 — the shopping line shows only on a buyOn evening", () => {
  const withWave = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup"),
    language: "en",
    shopping: { buyOn: "2026-08-12" },
    masterOnly: true,
    restrictionFlag: false,
  });
  assertEquals(withWave?.carriesShopping, true);
  assertEquals(withWave?.buttons.length, 4);

  // Le lendemain, sans `buyOn`, l'appelant ne passe aucune vague — même si
  // celle d'hier est toujours « pas encore ». C'est R15, et c'est ce qui sépare
  // un service d'un rappel de corvée.
  const nextDay = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup"),
    language: "en",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  assertEquals(nextDay?.carriesShopping, false);
  assertEquals(nextDay?.buttons.length, 2);
});

Deno.test("R14 — a claimed profile receives its dishes and NEVER the shopping line", () => {
  const claimed = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup", "Yoghurt"),
    language: "fr",
    shopping: { buyOn: "2026-08-12" },
    masterOnly: false,
    restrictionFlag: false,
  });
  if (!claimed) throw new Error("expected a strip");
  // Sa bande existe — la consommation est un fait de personne (R10).
  assertEquals(claimed.buttons.length, 2);
  // La cuisson et les courses sont des faits de FOYER: pas pour lui.
  assertEquals(claimed.carriesShopping, false);
  assertEquals(claimed.line.includes("courses"), false);
});

Deno.test("the shopping id round-trips its wave, and refuses a non-date", () => {
  const id = stripShoppingId("done", MEAL, "2026-08-12");
  const reply = readStripReply(id);
  assertEquals(reply.kind, "shopping");
  if (reply.kind === "shopping") {
    assertEquals(reply.done, true);
    assertEquals(reply.mealId, MEAL);
    assertEquals(reply.buyOn, "2026-08-12");
  }
  assertEquals(
    readStripReply(stripShoppingId("later", MEAL, "2026-08-12")).kind,
    "shopping",
  );
  assertThrows(() => stripShoppingId("done", MEAL, "tomorrow"));
  assertThrows(() => stripShoppingId("done", "", "2026-08-12"));
});

// ---------------------------------------------------------------------------
// LES DEUX PLANS — le piège du « 5 des 3 »
// ---------------------------------------------------------------------------

Deno.test("every id is bound to the plan that owns the day, and re-reads through parseMealTickKey", () => {
  const current = "aaaaaaaa-0000-0000-0000-000000000001";
  const next = "bbbbbbbb-0000-0000-0000-000000000002";

  const a = readStripReply(stripTickId(current, 2));
  const b = readStripReply(stripTickId(next, 2));
  if (a.kind !== "tick" || b.kind !== "tick") throw new Error("expected ticks");
  assertEquals(a.mealId, current);
  assertEquals(b.mealId, next);
  // Le même index sur deux plans donne DEUX clés distinctes: aucun numérateur ne
  // peut mélanger les deux (`meal_tick.ts`, le « 5 des 3 »).
  assertEquals(mealTickKey(current, 2) === mealTickKey(next, 2), false);

  // La charge du bouton EST la clé de coche: une seule forme, un seul lecteur.
  assertEquals(
    stripTickId(current, 2).endsWith(mealTickKey(current, 2)),
    true,
  );
  assertEquals(parseMealTickKey(mealTickKey(current, 2))?.mealId, current);
});

Deno.test("a malformed payload is NOT guessed at", () => {
  for (
    const bad of [
      "",
      "KEEL_STRIP_ALL",
      "KEEL_STRIP_ALL|",
      `KEEL_STRIP_ALL|${MEAL}|`,
      `KEEL_STRIP_ALL|${MEAL}|x`,
      `KEEL_STRIP_ALL|${MEAL}|-1`,
      `KEEL_STRIP_TICK|not_a_tick_key`,
      `KEEL_STRIP_TICK|meal_tick:${MEAL}`,
      `KEEL_STRIP_TICK|meal_tick:${MEAL}:x`,
      `KEEL_STRIP_SHOP_DONE|${MEAL}|2026-8-12`,
      "KEEL_STRIP_UNKNOWN|a|b",
      "SOMETHING_ELSE|a|b",
    ]
  ) {
    assertEquals(readStripReply(bad).kind, "none", bad);
  }
});

Deno.test("the three deterministic vocabularies do not collide", () => {
  const all = stripAllId(MEAL, [0, 1]);
  assertEquals(all.startsWith(STRIP_BUTTON_PREFIX), true);
  // Le lecteur du tap du soir et celui de la recommandation rendent « rien ».
  assertEquals(readPulseReply(all).kind, "none");
  assertEquals(readRecommendationReply(all).kind, "none");
  // Et symétriquement.
  assertEquals(readStripReply("KEEL_PULSE_GOOD").kind, "none");
  assertEquals(readStripReply(`KEEL_RECO_YES|${MEAL}`).kind, "none");
});

// ---------------------------------------------------------------------------
// L'ÉTAPE « PAS TOUT »
// ---------------------------------------------------------------------------

Deno.test("`Not everything` opens ✓ AND ✗ per dish — never ✗ alone", () => {
  const step = renderStripDishStep({
    mealId: MEAL,
    dishes: dishes("Soup", "Yoghurt"),
    language: "en",
  });
  if (!step) throw new Error("expected a step");
  // Deux boutons par plat. Un seul (« tape ce qui a raté ») ferait du silence
  // sur les autres une coche automatique — l'interdit le plus dur de la fiche.
  assertEquals(step.buttons.length, 4);
  assertEquals(step.buttons.map((b) => b.title), [
    "✓ Soup",
    "✗ Soup",
    "✓ Yoghurt",
    "✗ Yoghurt",
  ]);
  const tick = readStripReply(step.buttons[0].id);
  const untick = readStripReply(step.buttons[1].id);
  assertEquals(tick.kind, "tick");
  assertEquals(untick.kind, "untick");
  if (untick.kind === "untick") assertEquals(untick.dishIndex, 0);
});

Deno.test("a dish without a readable title keeps its position instead of vanishing", () => {
  const step = renderStripDishStep({
    mealId: MEAL,
    dishes: [{ dishIndex: 0, title: "Soup" }, { dishIndex: 1, title: "   " }],
    language: "en",
  });
  if (!step) throw new Error("expected a step");
  assertEquals(step.buttons.length, 4);
  assertEquals(step.buttons[2].title, "✓ #2");
  const reply = readStripReply(step.buttons[2].id);
  if (reply.kind !== "tick") throw new Error("expected a tick");
  assertEquals(reply.dishIndex, 1);
});

// ---------------------------------------------------------------------------
// R2 — L'AFFORDANCE QUI NE DOIT PAS REDEVENIR UNE QUESTION
// ---------------------------------------------------------------------------

Deno.test("R2 — the belt BITES on interrogative phrasing, EN and FR", () => {
  const biting: Array<[string, string]> = [
    ["Did you eat the chicken", "did you"],
    ["have you had dinner", "have you"],
    ["How was today", "how was"],
    ["What did you eat", "what did"],
    ["Which ones happened", "which ones"],
    ["As-tu mangé le poulet", "as-tu"],
    ["Est-ce que tout s'est passé comme prévu", "est-ce que"],
    ["T'as mangé la soupe", "t'as"],
    ["Comment ça s'est passé", "comment ca"],
    ["Qu'est-ce que tu as mangé", "qu'est-ce que"],
    ["Avez-vous fait les courses", "avez-vous"],
  ];
  for (const [text, expected] of biting) {
    const verdict = acceptStripText(text, false);
    assertEquals(verdict.ok, false, text);
    if (!verdict.ok) {
      assertEquals(verdict.reason, "interrogative_phrasing", text);
      assertEquals(
        verdict.detail.toLowerCase().normalize("NFD").replace(
          /\p{Diacritic}/gu,
          "",
        ).includes(expected),
        true,
        `${text} → ${verdict.detail}`,
      );
    }
  }
});

Deno.test("R2 — a question mark alone is refused, whatever the words are", () => {
  const verdict = acceptStripText("Today : Soup ?", false);
  assertEquals(verdict.ok, false);
  if (!verdict.ok) assertEquals(verdict.reason, "asks_a_question");
});

Deno.test("R2 — the belt DOES NOT bite the legitimate affordance, EN and FR", () => {
  // Une garde qui bloque tout ressemble à une garde qui marche. Voici le cas qui
  // doit PASSER, et c'est le texte réel de la bande dans les deux langues.
  const passing = [
    "Today\n✓ All as planned\nNot everything\nShopping was on the plan for today.\n✓ Shopping done\nNot yet",
    "Aujourd'hui\n✓ Tout comme prévu\nPas tout\nLes courses étaient au plan aujourd'hui.\n✓ Courses faites\nPas encore",
    "Today's dishes :\n✓ x\n✗ x",
    "Les plats du jour :\n✓ x\n✗ x",
    // Des titres qui contiennent des mots proches sans être des questions.
    "Today : Whatever soup · Comment-style gratin · Assiette comme à la maison",
  ];
  for (const text of passing) {
    const verdict = acceptStripText(text, false);
    assertEquals(verdict.ok, true, `${text} → ${JSON.stringify(verdict)}`);
  }
});

Deno.test("R2 — the real strip and step texts pass their own belt, EN and FR", () => {
  for (const language of ["en", "fr"] as const) {
    const strip = buildEveningStrip({
      mealId: MEAL,
      dishes: dishes("Soup", "Yoghurt"),
      language,
      shopping: { buyOn: "2026-08-12" },
      masterOnly: true,
      restrictionFlag: false,
    });
    if (!strip) throw new Error(`no strip in ${language}`);
    assertEquals(strip.line.includes("?"), false);
    for (const button of strip.buttons) {
      assertEquals(button.title.includes("?"), false, button.title);
    }
    const step = renderStripDishStep({
      mealId: MEAL,
      dishes: dishes("Soup"),
      language,
    });
    assertEquals(step?.body.includes("?"), false);
  }
});

Deno.test("a question mark inside a DISH TITLE is neutralised, not fatal", () => {
  // Un titre est de la donnée, pas une formulation de Sophia. Le supprimer ferait
  // disparaître la bande tous les soirs, en silence, chez cet élève-là.
  const strip = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup?", "Yoghurt"),
    language: "en",
    shopping: null,
    masterOnly: true,
    restrictionFlag: false,
  });
  if (!strip) throw new Error("expected a strip");
  assertEquals(strip.line.includes("?"), false);
  assertEquals(strip.line.includes("Soup"), true);
});

// ---------------------------------------------------------------------------
// R4 — AUCUN VERDICT, AUCUN SCORE, AUCUNE SÉRIE
// ---------------------------------------------------------------------------

Deno.test("R4 — the acks carry no verdict, no number, no streak, EN and FR", () => {
  const kinds = [
    "all",
    "tick",
    "untick",
    "shopping_done",
    "shopping_later",
    "stale",
  ] as const;
  for (const language of ["en", "fr"] as const) {
    for (const kind of kinds) {
      const ack = renderStripAck(kind, language);
      assertEquals(acceptStripText(ack, true).ok, true, `${language}/${kind}`);
      assertEquals(/\d/.test(ack), false, ack);
    }
  }
});

Deno.test("R4 — the ack belt BITES: praise, a score and a streak are all refused", () => {
  // La contre-épreuve: si la ceinture ne mordait pas, les tests ci-dessus
  // seraient verts sur n'importe quelle phrase.
  const refused: Array<[string, string]> = [
    ["Well done, all as planned", "qualifies_the_day"],
    ["Bien joué, tout est coché", "qualifies_the_day"],
    ["Nice work today", "qualifies_the_day"],
    ["Continue comme ça", "qualifies_the_day"],
    ["Noted — 3 of 3", "carries_a_number"],
    ["C'est noté, 4e soir d'affilée", "carries_a_number"],
  ];
  for (const [text, reason] of refused) {
    const verdict = acceptStripText(text, true);
    assertEquals(verdict.ok, false, text);
    if (!verdict.ok) assertEquals(verdict.reason, reason, text);
  }
});

Deno.test("banNumbers is REQUIRED, and it actually changes the verdict", () => {
  // La ligne qui nomme les plats a le droit de compter (« et 2 autres »);
  // l'accusé, non. Une valeur par défaut aurait rendu les deux identiques.
  assertEquals(acceptStripText("Today : A · B and 2 more", false).ok, true);
  assertEquals(acceptStripText("Today : A · B and 2 more", true).ok, false);
});

// ---------------------------------------------------------------------------
// LES IDENTIFIANTS — refus d'écrire ce qu'on ne peut pas relire
// ---------------------------------------------------------------------------

Deno.test("an aggregate id without a dish, or without a plan, is refused at build time", () => {
  assertThrows(() => stripAllId(MEAL, []));
  assertThrows(() => stripAllId("", [0]));
  assertThrows(() => stripAllId(MEAL, [-1]));
  assertThrows(() => stripAllId(MEAL, [1.5]));
  assertThrows(() => stripTickId("", 0));
  assertThrows(() => stripUntickId(MEAL, -1));
});

// ---------------------------------------------------------------------------
// R8 — LE PLANCHER DE RESTRICTION, PAR PERSONNE
// ---------------------------------------------------------------------------

Deno.test("R8 — under the restriction floor there is NO strip at all", () => {
  const base = {
    mealId: MEAL,
    dishes: dishes("Soup", "Yoghurt"),
    language: "en" as const,
    shopping: { buyOn: "2026-08-12" },
    masterOnly: true,
  };
  // Le plancher passe AVANT tout le reste: ni plats, ni ligne de courses.
  assertEquals(buildEveningStrip({ ...base, restrictionFlag: true }), null);
  // La contre-épreuve: le MÊME élève, plancher désarmé, reçoit sa bande. Sans
  // elle, une garde cassée qui bloque tout ressemblerait à une garde qui marche.
  const free = buildEveningStrip({ ...base, restrictionFlag: false });
  assertEquals(free !== null, true);
  assertEquals(free?.carriesShopping, true);
});

Deno.test("R8 — the floor is PER PERSON: it does not travel between members", () => {
  // Deux appels, deux personnes, deux réponses. Il n'existe aucun état partagé
  // dans ce module par lequel le plancher d'un membre pourrait taire un autre.
  const master = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup"),
    language: "fr",
    shopping: { buyOn: "2026-08-12" },
    masterOnly: true,
    restrictionFlag: true,
  });
  const spouse = buildEveningStrip({
    mealId: MEAL,
    dishes: dishes("Soup"),
    language: "fr",
    shopping: { buyOn: "2026-08-12" },
    masterOnly: false,
    restrictionFlag: false,
  });
  assertEquals(master, null);
  assertEquals(spouse !== null, true);
  // Et le conjoint garde sa bande SANS la ligne de courses (R14).
  assertEquals(spouse?.carriesShopping, false);
});

// ---------------------------------------------------------------------------
// §7 — DEUX VAGUES LE MÊME JOUR ⇒ UNE SEULE LIGNE
// ---------------------------------------------------------------------------

Deno.test("§7 — two waves cannot fall on the same day: the calculation buckets by buyOn", () => {
  // La règle n'est pas gardée par la bande, elle est IMPOSSIBLE À VIOLER en
  // amont: `planGroceryWaves` range les articles dans une `Map` clé par date
  // d'achat. Deux cuissons différentes qui produisent la même date d'achat
  // partagent donc UNE vague, et la bande ne peut structurellement porter
  // qu'une ligne. On le prouve plutôt que de le supposer.
  const waves = planGroceryWaves({
    startsOn: "2026-08-10",
    durationDays: 7,
    shoppingList: [
      // `food_group: null` — requis depuis le 2026-08-23 (`WaveItem`). Ce test
      // porte sur le REGROUPEMENT par date d'achat, pas sur la fenêtre crue:
      // `null` rend le repli `MAX_FRIDGE_DAYS`, c'est-à-dire exactement les
      // dates que ce fichier assertait déjà.
      { term: "chicken", aisle: "protein", food_group: null },
      { term: "salmon", aisle: "protein", food_group: null },
      { term: "rice", aisle: "grain", food_group: null },
    ],
    preparations: [
      // Deux cuissons distinctes, toutes deux à J+3 de la même date d'achat.
      { id: "a", cookOn: "thu", ingredientTerms: ["chicken"] },
      { id: "b", cookOn: "thu", ingredientTerms: ["salmon"] },
    ],
  });
  const buyDays = new Set(waves.map((w) => w.buyOn));
  assertEquals(buyDays.size, waves.length, JSON.stringify(waves));
  assertEquals(waves.filter((w) => w.buyOn === "2026-08-10").length, 1);
});
