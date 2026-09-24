/**
 * LA LISTE DES PLATS REFUSÉS — `rejected_dishes.ts`.
 *
 * Les valeurs attendues sont écrites à la main, jamais recalculées depuis les
 * constantes du module: un test paramétré par sa propre constante reste vert
 * quand on la change.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  dishTitleKey,
  readRejectedDishes,
  rejectedDishesLine,
  rejectedEntriesFrom,
  rejectedServedAgain,
} from "./rejected_dishes.ts";

const ROSTER = [
  { memberId: "m-paul", name: "Paul" },
  { memberId: "m-lea", name: "Léa" },
  { memberId: "m-tom", name: "Tom" },
];

Deno.test("dishTitleKey: espaces et majuscules ne comptent pas, les accents si", () => {
  assertEquals(
    dishTitleKey("  Lait,  pêche, avoine et purée de cacahuètes "),
    "lait, pêche, avoine et purée de cacahuètes",
  );
  assertEquals(dishTitleKey("Poulet ET Riz"), dishTitleKey("poulet et riz"));
  // « pâtes » n'est pas « pâté »: la clé garde l'accent.
  assert(dishTitleKey("Pâtes au thon") !== dishTitleKey("Pâté au thon"));
  // NFC: le « é » décomposé et le « é » composé font la même clé.
  assertEquals(dishTitleKey("Purée"), dishTitleKey("Purée"));
});

Deno.test("rejectedEntriesFrom: tout le foyer quand tous les mangeurs y sont", () => {
  const entries = rejectedEntriesFrom({
    rejections: [
      { title: "Poulet, champignons et riz", name: null, reason: "pas de champignons", eaterIds: ["m-tom", "m-paul", "m-lea"] },
      { title: "Lait, pêche et avoine", name: "Shake pêche", reason: "trop sucré", eaterIds: ["m-paul"] },
    ],
    householdMemberIds: ["m-paul", "m-lea", "m-tom"],
    at: "2026-09-24",
    draftId: "d-1",
  });
  assertEquals(entries, [
    {
      key: "poulet, champignons et riz",
      title: "Poulet, champignons et riz",
      name: null,
      household: true,
      member_ids: [],
      reason: "pas de champignons",
      at: "2026-09-24",
      draft_id: "d-1",
    },
    {
      key: "lait, pêche et avoine",
      title: "Lait, pêche et avoine",
      name: "Shake pêche",
      household: false,
      member_ids: ["m-paul"],
      reason: "trop sucré",
      at: "2026-09-24",
      draft_id: "d-1",
    },
  ]);
});

Deno.test("rejectedEntriesFrom: une raison trop longue est coupée à 280 signes", () => {
  const [entry] = rejectedEntriesFrom({
    rejections: [{ title: "Soupe", name: null, reason: "x".repeat(400), eaterIds: ["m-paul"] }],
    householdMemberIds: ["m-paul", "m-lea"],
    at: "2026-09-24",
    draftId: null,
  });
  assertEquals((entry.reason as string).length, 280);
});

Deno.test("rejectedEntriesFrom: sans mangeur connu, le plat est rangé pour tout le foyer", () => {
  const [entry] = rejectedEntriesFrom({
    rejections: [{ title: "Soupe", name: null, reason: "fade", eaterIds: [] }],
    householdMemberIds: ["m-paul", "m-lea"],
    at: "2026-09-24",
    draftId: null,
  });
  assertEquals(entry.household, true);
  assertEquals(entry.member_ids, []);
});

Deno.test("readRejectedDishes: une entrée illisible tombe seule", () => {
  const read = readRejectedDishes({
    rejected_dishes: [
      { key: "a", title: "A", household: true, member_ids: [], reason: "r", at: "2026-09-24", draft_id: null },
      42,
      { title: "" },
      // Personne visé et pas le foyer: l'entrée ne vise rien.
      { key: "b", title: "B", household: false, member_ids: [], reason: "r", at: "2026-09-24" },
      { key: "c", title: "C", household: false, member_ids: ["m-lea", 7], reason: "", at: "2026-09-23" },
    ],
  });
  assertEquals(read.map((e) => e.key), ["a", "c"]);
  assertEquals(read[1].memberIds, ["m-lea"]);
  assertEquals(read[1].reason, null);
  assertEquals(readRejectedDishes(null), []);
  assertEquals(readRejectedDishes({ rejected_dishes: "oops" }), []);
});

Deno.test("rejectedDishesLine: la promesse précède la liste, les prénoms viennent du roster", () => {
  const entries = readRejectedDishes({
    rejected_dishes: [
      { key: "k1", title: "Lait, pêche et avoine", household: false, member_ids: ["m-paul"], reason: "trop sucré", at: "2026-09-24" },
      { key: "k2", title: "Poulet, champignons et riz", name: "Poulet forestier", household: true, member_ids: [], reason: "pas de «champignons»", at: "2026-09-23" },
    ],
  });
  const line = rejectedDishesLine({ entries, roster: ROSTER });
  assertEquals(
    line,
    [
      "DISHES THEY TURNED DOWN — never serve these dishes again to the people named, not even renamed or " +
      "barely changed (another recipe with the same main foods is the same dish):",
      "- «Lait, pêche et avoine» — for Paul — they said: «trop sucré»",
      "- «Poulet, champignons et riz» («Poulet forestier») — for everyone — they said: «pas de \"champignons\"»",
    ].join("\n"),
  );
});

Deno.test("rejectedDishesLine: une personne sortie du foyer est retirée; seule, l'entrée tombe", () => {
  const entries = readRejectedDishes({
    rejected_dishes: [
      { key: "k1", title: "A", household: false, member_ids: ["m-gone"], reason: "r", at: "2026-09-24" },
      { key: "k2", title: "B", household: false, member_ids: ["m-gone", "m-lea"], reason: "r", at: "2026-09-24" },
    ],
  });
  const line = rejectedDishesLine({ entries, roster: ROSTER }) ?? "";
  assert(!line.includes("«A»"));
  assert(line.includes("- «B» — for Léa"));
  assertEquals(rejectedDishesLine({ entries: [], roster: ROSTER }), null);
  assertEquals(rejectedDishesLine({ entries: entries.slice(0, 1), roster: ROSTER }), null);
});

Deno.test("rejectedDishesLine: au plus `max` entrées, les premières (les plus récentes)", () => {
  const entries = readRejectedDishes({
    rejected_dishes: Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`, title: `T${i}`, household: true, member_ids: [], reason: "r", at: "2026-09-24",
    })),
  });
  const line = rejectedDishesLine({ entries, roster: ROSTER, max: 2 }) ?? "";
  assertEquals(line.split("\n").length, 3);
  assert(line.includes("«T0»") && line.includes("«T1»") && !line.includes("«T2»"));
});

Deno.test("rejectedServedAgain: seul un retour À L'IDENTIQUE, pour une personne visée, compte", () => {
  const entries = readRejectedDishes({
    rejected_dishes: [
      { key: "lait, pêche et avoine", title: "Lait, pêche et avoine", household: false, member_ids: ["m-paul"], reason: "r", at: "2026-09-24" },
      { key: "soupe", title: "Soupe", household: true, member_ids: [], reason: "r", at: "2026-09-24" },
    ],
  });
  assertEquals(
    rejectedServedAgain({
      entries,
      dishes: [
        { title: "LAIT, pêche et avoine", eaterIds: ["m-paul"] }, // compte
        { title: "Lait, pêche et avoine", eaterIds: ["m-lea"] }, // Léa n'est pas visée
        { title: "Soupe", eaterIds: ["m-tom"] }, // tout le foyer: compte
        { title: "Lait, pêche, avoine et miel", eaterIds: ["m-paul"] }, // autre titre: pas vu
      ],
    }),
    2,
  );
});
