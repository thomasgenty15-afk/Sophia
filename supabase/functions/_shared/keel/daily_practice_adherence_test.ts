// FF-029 — l'adhérence aux pratiques: daily_practice_adherence.ts.
//
// Les tests qui portent la décision produit, et pas la couverture:
//
//   * "la série repart à zéro à la première réponse"
//     -- c'est ce qui distingue « a décroché » de « répond une fois sur deux ».
//        Un TAUX moyen noierait exactement le cas que R7 vise.
//   * "la rotation ne rend JAMAIS une liste vide"
//     -- retirer la dernière pratique ferait disparaître la voix du coach du
//        message du soir, en punition d'un silence que R5 déclare légitime.
//   * "seules les QUESTIONS comptent"
//     -- compter le silence d'un rappel fabriquerait un manquement à partir d'un
//        message qui ne demandait rien: `auto-tick-writes-undeniable-false-facts`
//        sous un autre nom.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  durablyIgnoredKeys,
  PRACTICE_ADHERENCE_WINDOW_DAYS,
  PRACTICE_IGNORED_ASKS,
  type PracticeAskRecord,
  readPracticeAdherence,
  rotationPool,
} from "./daily_practice_adherence.ts";
import { type DailyPractice, practiceKey } from "./daily_practices.ts";

function ask(
  localDate: string,
  key: string,
  answered: boolean,
): PracticeAskRecord {
  return { localDate, practiceKey: key, answered };
}

function practice(label: string, over: Partial<DailyPractice> = {}): DailyPractice {
  return {
    label,
    kind: "hydration",
    quantified: false,
    target: null,
    unit: null,
    goalScope: [],
    cadence: "rotating",
    askable: true,
    minorSafe: true,
    brief: "Keep it plain.",
    status: "active",
    collidesWith: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LA LECTURE
// ---------------------------------------------------------------------------

Deno.test("les constantes viennent de la fiche, pas d'un réglage", () => {
  // §8: « une pratique ignorée TROIS SEMAINES ».
  assertEquals(PRACTICE_ADHERENCE_WINDOW_DAYS, 21);
  assertEquals(PRACTICE_IGNORED_ASKS, 3);
});

Deno.test("chaque pratique compte pour elle-même", () => {
  const rows = readPracticeAdherence([
    ask("2026-08-01", "aaa", false),
    ask("2026-08-02", "bbb", true),
    ask("2026-08-03", "aaa", false),
  ]);
  const byKey = new Map(rows.map((r) => [r.practiceKey, r]));
  assertEquals(byKey.get("aaa"), {
    practiceKey: "aaa",
    asked: 2,
    answered: 0,
    ignoredStreak: 2,
  });
  assertEquals(byKey.get("bbb"), {
    practiceKey: "bbb",
    asked: 1,
    answered: 1,
    ignoredStreak: 0,
  });
});

Deno.test("la série repart à zéro à la première réponse", () => {
  // Quelqu'un qui a répondu HIER n'a pas décroché, même s'il s'est tu dix fois
  // le mois d'avant. Un taux moyen dirait l'inverse — d'où la série.
  const [row] = readPracticeAdherence([
    ask("2026-08-01", "k", false),
    ask("2026-08-02", "k", false),
    ask("2026-08-03", "k", false),
    ask("2026-08-04", "k", true),
    ask("2026-08-05", "k", false),
  ]);
  assertEquals(row.asked, 5);
  assertEquals(row.answered, 1);
  assertEquals(row.ignoredStreak, 1);
});

Deno.test("l'ordre du ledger n'est PAS supposé", () => {
  // Une garde qui dépend d'un `order by` casse le jour où il disparaît, sans
  // qu'une seule erreur ne le dise.
  const shuffled = readPracticeAdherence([
    ask("2026-08-05", "k", false),
    ask("2026-08-04", "k", true),
    ask("2026-08-01", "k", false),
  ]);
  assertEquals(shuffled[0].ignoredStreak, 1);
});

Deno.test("une clé vide n'est imputée à personne", () => {
  assertEquals(readPracticeAdherence([ask("2026-08-01", "  ", false)]).length, 0);
});

// ---------------------------------------------------------------------------
// LE SEUIL
// ---------------------------------------------------------------------------

Deno.test("un seul silence ne dit rien; trois disent quelque chose", () => {
  const two = durablyIgnoredKeys(
    readPracticeAdherence([
      ask("2026-08-01", "k", false),
      ask("2026-08-02", "k", false),
    ]),
  );
  assertEquals(two.size, 0);

  const three = durablyIgnoredKeys(
    readPracticeAdherence([
      ask("2026-08-01", "k", false),
      ask("2026-08-02", "k", false),
      ask("2026-08-03", "k", false),
    ]),
  );
  assert(three.has("k"));
});

// ---------------------------------------------------------------------------
// R7 — LE REMPLACEMENT
// ---------------------------------------------------------------------------

Deno.test("R7: la rotation passe à côté de ce qui ne porte plus", () => {
  const water = practice("Drink water across the day");
  const walk = practice("Move a little every day");
  const pool = rotationPool([water, walk], new Set([practiceKey(water.label)]));
  assertEquals(pool.practices.map((p) => p.label), [walk.label]);
  assertEquals(pool.allIgnored, false);
});

Deno.test("R7: la rotation ne rend JAMAIS une liste vide", () => {
  // Se taire complètement retirerait à l'élève la seule chose que le message du
  // soir lui DONNE, en punition d'un silence que R5 déclare légitime. On garde
  // la rotation et on arrête de demander — c'est `allIgnored` qui le porte.
  const water = practice("Drink water across the day");
  const walk = practice("Move a little every day");
  const pool = rotationPool(
    [water, walk],
    new Set([practiceKey(water.label), practiceKey(walk.label)]),
  );
  assertEquals(pool.practices.length, 2);
  assertEquals(pool.allIgnored, true);
});

Deno.test("aucune pratique du tout n'est pas « tout est ignoré »", () => {
  // Les deux produisent zéro question, et ils ne se disent pas pareil: le
  // compte-rendu du job doit pouvoir distinguer « ce coach n'a rien écrit » de
  // « cet élève a décroché ».
  assertEquals(rotationPool([], new Set(["k"])), {
    practices: [],
    allIgnored: false,
  });
});
