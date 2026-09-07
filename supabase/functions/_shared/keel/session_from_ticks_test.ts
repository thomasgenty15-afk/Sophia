// UNE COCHE CONSTATE LA SESSION QUI A PRODUIT LE PLAT — lot M8.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QU'UNE DÉCOCHE DEVIENNE UNE PREUVE. « Je n'ai pas mangé le plat » ne dit
//      RIEN de la session: la personne a pu commander sur une préparation
//      parfaitement faite. En déduire `happened: false` RETIRERAIT des repas
//      d'un plan sur une inférence fausse — et c'est le seul retour du produit
//      qui détruit au lieu d'ajuster.
//   2. QU'ON CONSTATE UNE SESSION DU FUTUR. Écrire « la cuisson de jeudi a eu
//      lieu » un mardi est une preuve fabriquée.
//   3. QU'UNE INFÉRENCE ÉCRASE UN TÉMOIGNAGE. Une ligne existante, quelle que
//      soit sa valeur, ferme la question POUR DE BON. Un `happened: false` que
//      la personne a DÉCLARÉ ne se remplace pas par un `true` déduit.
//   4. QU'ON RAPPROCHE PAR LA DATE. Un plat n'appartient à une session que par
//      `preparationIds` — le lien ÉCRIT, jamais la proximité des jours.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/session_from_ticks_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import { sessionsConfirmedByTicks } from "./session_from_ticks.ts";
import { type AccidentPlan, planDates } from "./accident.ts";

/**
 * Un plan de trois sessions, chacune avec sa préparation, et des plats qui y
 * puisent — la forme exacte mesurée sur un plan réel le 2026-09-01.
 */
function plan(): AccidentPlan {
  return {
    mealId: "11111111-2222-4333-8444-555555555555",
    startsOn: "2026-08-23", // un dimanche
    durationDays: 7,
    dishes: [
      { dishIndex: 0, day: "sun", title: "dhal", preparationIds: ["p-sun"] },
      { dishIndex: 1, day: "tue", title: "curry", preparationIds: ["p-tue"] },
      { dishIndex: 2, day: "wed", title: "salade", preparationIds: [] },
      { dishIndex: 3, day: "thu", title: "gratin", preparationIds: ["p-thu"] },
    ],
    preparations: [],
    sessions: [
      { day: "sun", preparationIds: ["p-sun"] },
      { day: "tue", preparationIds: ["p-tue"] },
      { day: "thu", preparationIds: ["p-thu"] },
    ],
    shoppingList: [],
  } as unknown as AccidentPlan;
}

function run(args: {
  dishIndexes: readonly number[];
  today?: string;
  known?: readonly string[];
}) {
  const p = plan();
  return sessionsConfirmedByTicks({
    plan: p,
    dishIndexes: args.dishIndexes,
    dates: planDates(p),
    known: new Set(args.known ?? []),
    today: args.today ?? "2026-09-01",
  });
}

// ===========================================================================
// 1. LE CAS QUI PASSE — sans lui, une garde cassée ressemble à une garde
// ===========================================================================

Deno.test("une coche sur un plat qui PUISE constate sa session", () => {
  const out = run({ dishIndexes: [0] });
  assertEquals(out.confirm.map((s) => s.cookOn), ["2026-08-23"]);
  // Les deux autres sessions ne sont pas reliées à CE plat: comptées, pas
  // silencieuses.
  assertEquals(out.skipped.unlinked, 2);
  assertEquals(out.skipped.future, 0);
  assertEquals(out.skipped.known, 0);
});

Deno.test("plusieurs coches constatent plusieurs sessions, sans doublon", () => {
  const out = run({ dishIndexes: [0, 1, 3] });
  assertEquals(out.confirm.map((s) => s.cookOn).sort(), [
    "2026-08-23",
    "2026-08-25",
    "2026-08-27",
  ]);
  // Deux plats de la MÊME session ne la constatent qu'une fois: la clé de la
  // table est `(user_id, generated_meal_id, cook_on)`.
  const twice = sessionsConfirmedByTicks({
    plan: {
      ...plan(),
      dishes: [
        { dishIndex: 0, day: "sun", title: "a", preparationIds: ["p-sun"] },
        { dishIndex: 1, day: "mon", title: "b", preparationIds: ["p-sun"] },
      ],
    } as unknown as AccidentPlan,
    dishIndexes: [0, 1],
    dates: planDates(plan()),
    known: new Set(),
    today: "2026-09-01",
  });
  assertEquals(twice.confirm.length, 1);
});

// ===========================================================================
// 2. ⛔ LES TROIS GARDES
// ===========================================================================

Deno.test("⛔ JAMAIS une session du FUTUR", () => {
  // Constater « la cuisson de jeudi a eu lieu » un mardi serait écrire une
  // preuve fabriquée — même règle que la question elle-même.
  const out = run({ dishIndexes: [0, 1, 3], today: "2026-08-24" });
  assertEquals(out.confirm.map((s) => s.cookOn), ["2026-08-23"]);
  assertEquals(out.skipped.future, 2, "une session à venir a été constatée");

  // Le jour MÊME compte comme passé: la session a eu lieu dans la journée.
  assertEquals(run({ dishIndexes: [0], today: "2026-08-23" }).confirm.length, 1);
});

Deno.test("⛔ JAMAIS par-dessus une ligne EXISTANTE", () => {
  // ⚠️ C'EST LA GARDE QUI PROTÈGE UN TÉMOIGNAGE CONTRE UNE INFÉRENCE. Si la
  // personne a DÉCLARÉ que la session de dimanche n'a pas eu lieu, une coche
  // sur un plat de dimanche ne doit pas réécrire `true` par-dessus: on
  // remplacerait ce qu'elle a dit par ce qu'on déduit.
  const out = run({ dishIndexes: [0], known: ["2026-08-23"] });
  assertEquals(out.confirm, []);
  assertEquals(out.skipped.known, 1);
});

Deno.test("⛔ LE LIEN ÉCRIT, jamais la proximité des dates", () => {
  // Le plat du mercredi n'a AUCUNE préparation: il a été fait sur le moment. Il
  // ne constate donc rien — même si une session tombe la veille.
  const out = run({ dishIndexes: [2] });
  assertEquals(out.confirm, []);
  // Et il ne compte pas non plus les trois sessions comme « non reliées »: sans
  // préparation tirée, il n'y a rien à relier du tout.
  assertEquals(out.skipped.unlinked, 0);
});

// ===========================================================================
// 3. LES CAS QUI NE DOIVENT RIEN PRODUIRE
// ===========================================================================

Deno.test("aucune coche, aucun plat, aucun index valide: rien, et sans jeter", () => {
  assertEquals(run({ dishIndexes: [] }).confirm, []);
  assertEquals(run({ dishIndexes: [-1, 1.5, NaN] }).confirm, []);
  // Un index qui ne désigne aucun plat du plan.
  assertEquals(run({ dishIndexes: [99] }).confirm, []);
});

Deno.test("un plan difforme ne fait pas tomber le tap", () => {
  // ⛔ CE MODULE NE PEUT PAS COÛTER LE GESTE DE LA PERSONNE. La coche est déjà
  // en base quand il tourne; une exception ici la laisserait écrite ET
  // l'accusé perdu.
  for (const broken of [null, undefined, {}, { dishes: null, sessions: null }]) {
    const out = sessionsConfirmedByTicks({
      plan: broken as unknown as AccidentPlan,
      dishIndexes: [0],
      dates: {},
      known: new Set(),
      today: "2026-09-01",
    });
    assertEquals(out.confirm, []);
  }
});

Deno.test("un jour de session illisible n'invente pas de date", () => {
  const out = sessionsConfirmedByTicks({
    plan: {
      ...plan(),
      sessions: [{ day: "nawak", preparationIds: ["p-sun"] }],
    } as unknown as AccidentPlan,
    dishIndexes: [0],
    dates: planDates(plan()),
    known: new Set(),
    today: "2026-09-01",
  });
  assertEquals(out.confirm, []);
  assertEquals(out.skipped.unlinked, 1);
});

// ===========================================================================
// ===========================================================================
// 4. ⛔ LE MODULE EST DÉBRANCHÉ, ET C'EST VOULU — Lot A.2, 2026-09-07
// ===========================================================================

Deno.test("LE DÉBRANCHEMENT — plus aucun appelant, et ça reste vrai", async () => {
  // ⚠️ CE TEST A CHANGÉ DE SENS, IL N'A PAS ÉTÉ AFFAIBLI.
  //
  // Il affirmait « la coche appelle ce module ». Son unique appelant était
  // `handleStripTap`, la lane du tap de la bande du soir, retirée par le lot
  // A.2 du chantier de réduction du chat: le message du soir ne fabrique plus
  // un seul bouton, donc plus personne ne tape, donc plus personne ne constate
  // une session par les coches.
  //
  // Le module lui-même est encore là — le désarmement retire l'ÉMETTEUR, la
  // suppression vient après, une fois prouvé sur huit jours qu'aucune ligne ne
  // s'écrit plus. Ses tests 1 à 3 gardent donc encore la fonction pure.
  //
  // ⛔ CE QUE CETTE ASSERTION-CI GARDE, ET POURQUOI ELLE VAUT L'ANCIENNE: un
  // rebranchement silencieux. Quelqu'un qui recâblerait `sessionsConfirmedByTicks`
  // sans rouvrir la décision produit ferait ROUGIR ce test. C'est la même
  // discipline dans l'autre sens, et c'est la seule qui reste juste tant que le
  // module vit sans appelant.
  const src = (await Deno.readTextFile(
    new URL("../chat/deterministic_buttons.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

  assert(
    !src.includes("sessionsConfirmedByTicks("),
    "LE MODULE A ÉTÉ REBRANCHÉ. La bande du soir est désarmée: si une coche " +
      "constate de nouveau une session, c'est qu'un émetteur est revenu — " +
      "rouvre la décision produit avant de rétablir ce câblage.",
  );
  assert(
    !src.includes("writeSessionState("),
    "`writeSessionState` est de retour dans le dispatch: la lane de la bande " +
      "écrit de nouveau, alors qu'elle ne doit plus rien émettre.",
  );
  assert(
    !src.includes('tag: "keel.evening_strip.sessions_confirmed"'),
    "le compteur de la bande est revenu dans le dispatch",
  );
});
