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
// 4. ⛔ LE CÂBLAGE — un lot débranché rend 0, et 0 se lit « rien à constater »
// ===========================================================================

Deno.test("LE CÂBLAGE — la coche appelle ce module, et la décoche JAMAIS", async () => {
  // ⚠️ CE FICHIER EXISTE À CAUSE DU DÉFAUT QU'IL VIENT DE FERMER:
  // `writeSessionState` n'avait qu'UN appelant, et rien ne rougissait. Un
  // second lot débranché serait indiscernable — et sa table à zéro se relirait
  // « la chaîne ne marche pas », exactement comme la première fois.
  const src = (await Deno.readTextFile(
    new URL("../chat/deterministic_buttons.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

  assert(
    src.includes("sessionsConfirmedByTicks("),
    "MODULE DÉBRANCHÉ: la coche ne constate plus la session, et la table " +
      "redevient muette sans qu'un seul test ne tombe.",
  );
  assert(
    src.includes("writeSessionState("),
    "L'ÉCRITURE A DISPARU: le module calcule et personne n'écrit.",
  );

  // ⛔ LA GARDE LA PLUS IMPORTANTE: les décoches n'entrent pas. Une décoche
  // n'est preuve de rien, et l'inférence inverse retirerait des repas.
  const at = src.indexOf("sessionsConfirmedByTicks(");
  const before = src.slice(Math.max(0, at - 1600), at);
  assert(
    before.includes('reply.kind !== "untick"'),
    "LES DÉCOCHES ENTRENT DANS LA DÉRIVATION: « je n'ai pas mangé le plat » " +
      "deviendrait une preuve sur la session, alors que la personne a pu " +
      "commander sur une préparation parfaitement faite.",
  );
  // Et `happened` est écrit à `true` LITTÉRAL, jamais dérivé d'une variable
  // qu'un refactor pourrait inverser.
  const after = src.slice(at, at + 1600);
  assert(
    after.includes("happened: true"),
    "`happened` n'est plus le littéral `true`: le sens de l'inférence peut " +
      "désormais s'inverser sans qu'on le voie.",
  );

  // ⚠️ LE DÉNOMINATEUR. Sans lui, « 0 session constatée » ne se distingue pas
  // de « 0 soir observé » — la forme exacte sous laquelle ce lot est resté
  // invisible.
  assert(
    src.includes('tag: "keel.evening_strip.sessions_confirmed"'),
    "LE COMPTEUR A DISPARU: la table à zéro redevient illisible.",
  );
  for (const field of ["ticked:", "confirmed:", "skipped_future:", "skipped_known:"]) {
    assert(src.includes(field), `le champ \`${field}\` a disparu du compteur`);
  }
});
