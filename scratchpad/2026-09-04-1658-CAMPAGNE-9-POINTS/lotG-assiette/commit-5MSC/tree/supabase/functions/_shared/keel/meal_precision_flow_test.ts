// PIVOT NUTRITION §3.2 — meal_precision_flow.ts.
//
// The tests that carry the doctrine:
//   * "the escape hatch works from EVERY state, unconditionally"
//     -- §3.3bis: a flow that holds a user against their intent is a design
//        bug, not an edge case. This repo has paid for it twice.
//   * "answering the question AMENDS the event, it never logs a second one"
//     -- §7.4 J1 evening. Otherwise the student ate once and the protocol
//        counts twice, inflating the metric that actually predicts outcome.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEAL_PRECISION_INTENTS,
  MEAL_PRECISION_MAX_TURNS,
  MEAL_PRECISION_STATES,
  MEAL_PRECISION_TIMEOUT_MINUTES,
  type MealPrecisionFlowState,
  openMealPrecisionFlow,
  reduceMealPrecisionFlow,
} from "./meal_precision_flow.ts";

const NOW = new Date("2026-07-27T20:00:00.000Z");
const EVENT = "evt-1";

function flow(over: Partial<MealPrecisionFlowState> = {}): MealPrecisionFlowState {
  return {
    state: "awaiting_clarification",
    source: "photo",
    eventIds: [EVENT],
    tickEventIds: [],
    componentKeys: ["food_group:poultry"],
    turns: 0,
    openedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    question: "Did you cook these with oil?",
    axis: "preparation",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// THE CASE THE FLOW EXISTS FOR
// ---------------------------------------------------------------------------

Deno.test("answering the question AMENDS the event, it never logs a second one", () => {
  const d = reduceMealPrecisionFlow({ flow: flow(), intent: "answers_question", now: NOW });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  assertEquals(d.eventIds, [EVENT]);
  assertEquals(d.amendment, "answer");
  // Une RÉPONSE peut ajouter ce qu'elle nomme de NOUVEAU (« avec du riz » est
  // un fait que le coach doit pouvoir compter), mais jamais réécrire ce qui est
  // déjà là — c'est `componentKeys` qui l'interdit, en aval.
  assertEquals(d.allowsNewComponents, true);
  // ── CE QUE CETTE ASSERTION DISAIT AVANT, ET POURQUOI ELLE A CHANGÉ ────────
  // Elle affirmait « the flow closes: the question is answered, there is
  // nothing left to hold the student for ». Il restait pourtant quelque chose:
  // LA PORTE DE CORRECTION. Mesuré 6/6 le 2026-08-06 — l'élève qui répond puis
  // se ravise (« en fait non, c'était des pâtes ») n'avait plus aucun flow, son
  // démenti n'amendait rien, la coche du plat démenti restait, et Sophia
  // répondait quand même « Got it ». Répondre ne règle pas l'identité du repas;
  // seule une correction la tranche.
  assertEquals(d.nextFlow.state, "awaiting_correction");
  // Le tour est compté: la porte reste ouverte, elle ne devient pas éternelle.
  assertEquals(d.nextFlow.turns, 1);
});

Deno.test("a correction also amends, and is distinguishable from an answer", () => {
  const d = reduceMealPrecisionFlow({ flow: flow(), intent: "corrects_declaration", now: NOW });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  assertEquals(d.amendment, "correction");
  // Une CORRECTION remplace, elle n'ajoute pas: lui laisser écrire une ligne
  // produirait le doublon que ce flow existe pour empêcher.
  assertEquals(d.allowsNewComponents, false);
});

Deno.test("une CORRECTION rend les coches à décocher", () => {
  // Mesuré 6/6 le 2026-08-05: Sophia disait « then the chicken line doesn't
  // apply » et la ligne `quick_tap` restait non disqualifiée, continuant de
  // nourrir la couverture du coach avec un plat que l'élève venait de démentir.
  const d = reduceMealPrecisionFlow({
    flow: flow({ tickEventIds: ["tick-1"] }),
    intent: "corrects_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  assertEquals(d.tickEventIds, ["tick-1"]);
  // La coche ne rejoint JAMAIS `eventIds`: `targetAmbiguous` s'y calcule, et
  // l'y verser ferait passer toute photo cochée pour une cible ambiguë — le
  // crédit cesserait alors d'être effacé sur correction (mesuré 3/3).
  assertEquals(d.eventIds, [EVENT]);
});

Deno.test("une CONFIRMATION laisse la porte de correction OUVERTE", () => {
  // ── LE DÉFAUT MESURÉ 6/6, DÉTERMINISTE ────────────────────────────────────
  // Les trois branches d'amendement rendaient `closed(...)`, donc un flow ne
  // portait jamais qu'UN amendement. « oui c'est bien ça » puis, au tour
  // suivant, « en fait non, c'était des pâtes »: le démenti n'amendait plus
  // rien, la coche du plat démenti RESTAIT, et Sophia répondait quand même
  // « Got it ». Accusé fantôme sur la porte que le produit venait d'ouvrir.
  const d = reduceMealPrecisionFlow({
    flow: flow({ tickEventIds: ["tick-1"] }),
    intent: "confirms_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  assertEquals(d.nextFlow.state, "awaiting_correction");
  // La question, s'il y en avait une, vient d'obtenir sa réponse.
  assertEquals(d.nextFlow.question, null);
  // Et le tour est COMPTÉ: la porte reste ouverte, elle ne devient pas
  // éternelle — `MAX_TURNS` redevient atteignable, ce qu'il n'était plus.
  assertEquals(d.nextFlow.turns, 1);
});

Deno.test("le démenti qui SUIT une confirmation amende encore, et décoche", () => {
  // La séquence complète, celle qui était 6/6 rouge.
  const first = reduceMealPrecisionFlow({
    flow: flow({ tickEventIds: ["tick-1"] }),
    intent: "confirms_declaration",
    now: NOW,
  });
  if (first.kind !== "amend") throw new Error("premier tour non amendé");
  const second = reduceMealPrecisionFlow({
    flow: first.nextFlow,
    intent: "corrects_declaration",
    now: NOW,
  });
  assertEquals(second.kind, "amend");
  if (second.kind !== "amend") return;
  assertEquals(second.amendment, "correction");
  // La coche du plat démenti tombe — elle survivait à ce démenti-là.
  assertEquals(second.tickEventIds, ["tick-1"]);
  // Et CELLE-CI ferme: l'élève vient de dire ce que c'était, l'identité est
  // tranchée. C'est la condition de désarmement de l'ouverture prolongée.
  assertEquals(second.nextFlow.state, "closed");
});

Deno.test("une CORRECTION ferme, elle ne laisse pas la porte ouverte", () => {
  const d = reduceMealPrecisionFlow({
    flow: flow(),
    intent: "corrects_declaration",
    now: NOW,
  });
  if (d.kind !== "amend") throw new Error("non amendé");
  assertEquals(d.nextFlow.state, "closed");
});

Deno.test("CONDITION DE DÉSARMEMENT ATTEIGNABLE: une CONFIRMATION ne décoche rien", () => {
  // ── POURQUOI CE TEST EXISTE ────────────────────────────────────────────────
  // La condition de désarmement du décochage reposait sur `answers_question`,
  // interdit quand aucune question n'a été posée. Or `clarifying_question` est
  // NULL sur 100 % des lignes photo: le flow s'ouvre TOUJOURS en
  // `awaiting_correction`, donc le jeton était inatteignable par construction —
  // morte-née, pas fragile. « yes, cooked with olive oil » partait en
  // `corrects_declaration` 4 fois sur 6 et effaçait le crédit de la photo.
  //
  // `confirms_declaration` ne dépend d'AUCUNE question. C'est ce qui rend le
  // désarmement réel.
  const d = reduceMealPrecisionFlow({
    flow: flow({ state: "awaiting_correction", question: null, tickEventIds: ["tick-1"] }),
    intent: "confirms_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  // Elle AMENDE — le détail ajouté est un fait réel, il se garde…
  assertEquals(d.amendment, "answer");
  assertEquals(d.allowsNewComponents, true);
  // …et elle ne retire RIEN: ni la coche, ni (via `amendment: "answer"`) le
  // crédit de la photo.
  assertEquals(d.tickEventIds, []);
});

Deno.test("CONDITION DE DÉSARMEMENT: une RÉPONSE ne décoche rien", () => {
  // « oui, avec du riz » précise le repas sans démentir le plat. Décocher ici
  // ferait tomber une identification correcte, et la garde serait débranchée
  // dans la semaine.
  const d = reduceMealPrecisionFlow({
    flow: flow({ tickEventIds: ["tick-1"] }),
    intent: "answers_question",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
  if (d.kind !== "amend") return;
  assertEquals(d.amendment, "answer");
  assertEquals(d.tickEventIds, []);
});

// ---------------------------------------------------------------------------
// THE ESCAPE HATCH
// ---------------------------------------------------------------------------

Deno.test("the escape hatch works from EVERY state, unconditionally", () => {
  for (const state of MEAL_PRECISION_STATES) {
    const d = reduceMealPrecisionFlow({
      flow: flow({ state }),
      intent: "unrelated",
      now: NOW,
    });
    assertEquals(d.kind, "exit", `state ${state} trapped the student`);
    if (d.kind === "exit") assertEquals(d.reason, "topic_changed");
  }
});

Deno.test("the escape hatch fires BEFORE timeout and max-turns", () => {
  // Ordering matters: if timeout were checked first, an expired flow would
  // report `timeout` for a student who simply changed subject — a wrong reason
  // in the trace, and a step towards checking other things first too.
  const d = reduceMealPrecisionFlow({
    flow: flow({
      turns: 99,
      openedAt: new Date(NOW.getTime() - 10 * 3600_000).toISOString(),
    }),
    intent: "unrelated",
    now: NOW,
  });
  if (d.kind === "exit") assertEquals(d.reason, "topic_changed");
});

Deno.test("a crisis turn closes the flow before anything else", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    const d = reduceMealPrecisionFlow({
      flow: flow(),
      intent: "answers_question",
      safetyBand: band,
      now: NOW,
    });
    assertEquals(d.kind, "exit", band);
    if (d.kind === "exit") assertEquals(d.reason, "safety");
  }
});

// ---------------------------------------------------------------------------
// BOUNDS
// ---------------------------------------------------------------------------

Deno.test("a new photo closes the old flow instead of capturing the new one", () => {
  const d = reduceMealPrecisionFlow({ flow: flow(), intent: "new_photo", now: NOW });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "new_photo");
});

Deno.test("past the window, it is no longer the same photo", () => {
  const late = new Date(NOW.getTime() + (MEAL_PRECISION_TIMEOUT_MINUTES + 1) * 60_000);
  const d = reduceMealPrecisionFlow({ flow: flow(), intent: "answers_question", now: late });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "timeout");
  // The point: amending a two-hour-old fact on an ambiguous message would
  // overwrite real data with a guess.
});

Deno.test("max turns is a bound, and it is two", () => {
  assertEquals(MEAL_PRECISION_MAX_TURNS, 2);
  const d = reduceMealPrecisionFlow({
    flow: flow({ turns: MEAL_PRECISION_MAX_TURNS }),
    intent: "answers_question",
    now: NOW,
  });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "max_turns");
});

Deno.test("an unclassified message does NOT guess, it waits one turn", () => {
  // §3.3bis: of guess / clarify / proceed-while-saying-so, guessing is the
  // forbidden one. Staying lets the global dispatcher answer normally.
  const d = reduceMealPrecisionFlow({ flow: flow(), intent: "unknown", now: NOW });
  assertEquals(d.kind, "stay");
  if (d.kind === "stay") assertEquals(d.nextFlow.turns, 1);

  // ... and it cannot wait forever: the next unknown hits max-turns.
  const again = reduceMealPrecisionFlow({
    flow: flow({ turns: 2 }),
    intent: "unknown",
    now: NOW,
  });
  assertEquals(again.kind, "exit");
});

Deno.test("a closed flow never reopens", () => {
  for (const intent of MEAL_PRECISION_INTENTS) {
    const d = reduceMealPrecisionFlow({
      flow: flow({ state: "closed" }),
      intent,
      now: NOW,
    });
    assertEquals(d.kind, "exit", intent);
  }
});

// ---------------------------------------------------------------------------
// OPENING
// ---------------------------------------------------------------------------

Deno.test("the opening state says whether a question is outstanding", () => {
  // The renderer must not re-ask a question it never asked.
  const withQuestion = openMealPrecisionFlow({
    source: "photo",
    eventIds: [EVENT],
    question: "Oil?",
    now: NOW,
  });
  assertEquals(withQuestion.state, "awaiting_clarification");
  const without = openMealPrecisionFlow({
    source: "photo",
    eventIds: [EVENT],
    question: null,
    now: NOW,
  });
  assertEquals(without.state, "awaiting_correction");
  assertEquals(without.turns, 0);
  assertEquals(without.eventIds, [EVENT]);
});

Deno.test("une déclaration textuelle porte TOUTES ses lignes, pas la première", () => {
  // « du poulet et du riz » écrit DEUX lignes. Un flow qui n'en retiendrait
  // qu'une amenderait la moitié du repas et laisserait l'autre moitié porter
  // une lecture que l'élève vient de contester.
  const opened = openMealPrecisionFlow({
    source: "text",
    eventIds: ["evt-1", "evt-2"],
    componentKeys: ["food_group:poultry", "food_group:whole_grain"],
    question: "And what did you have with it?",
    axis: "accompaniment",
    now: NOW,
  });
  assertEquals(opened.eventIds, ["evt-1", "evt-2"]);
  assertEquals(opened.source, "text");
  assertEquals(opened.axis, "accompaniment");
  const d = reduceMealPrecisionFlow({
    flow: opened,
    intent: "corrects_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
  if (d.kind === "amend") assertEquals(d.eventIds, ["evt-1", "evt-2"]);
});

Deno.test("un AUTRE repas déclaré ferme le flow au lieu de l'absorber", () => {
  // Sans cette sortie, « et ce soir j'ai mangé des pâtes » serait avalé comme
  // une précision du déjeuner: le dîner ne serait jamais écrit.
  const d = reduceMealPrecisionFlow({
    flow: flow(),
    intent: "new_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "new_declaration");
});

Deno.test("a student can still correct even when no question was asked", () => {
  const d = reduceMealPrecisionFlow({
    flow: openMealPrecisionFlow({
      source: "photo",
      eventIds: [EVENT],
      question: null,
      now: NOW,
    }),
    intent: "corrects_declaration",
    now: NOW,
  });
  assertEquals(d.kind, "amend");
});

Deno.test("this module never reads message text (no semantic regex can hide here)", async () => {
  // §3.1: the reducer receives an already-classified intent. A module that
  // cannot see the text cannot grow a regex that interprets a human.
  const src = await Deno.readTextFile(new URL("./meal_precision_flow.ts", import.meta.url));
  assert(!/\.match\(|RegExp\(|\/\^|toLowerCase\(\)/.test(src), "text inspection crept in");
});
