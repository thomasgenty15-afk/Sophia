// ⟳ LOTS `L6′-a` et `L6′-b` — LE DÉNOMINATEUR DES CONTENANTS, ET LE NOM DU ZÉRO.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LA PREMIÈRE ÉPREUVE EST CELLE QUI **PASSE** — une garde a besoin d'un cas
//    qui passe, sans quoi, cassée, elle bloque tout et ressemble à une garde
//    qui marche.
// ══════════════════════════════════════════════════════════════════════════
// `passe_le_foyer_sans_plat_dedie` ci-dessous: quatre bouches, aucun plat
// dédié, la partition d'AVANT est la bonne et le module ne doit RIEN changer.
// Elle est écrite en premier, exprès.
//
// ══════════════════════════════════════════════════════════════════════════
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
// ══════════════════════════════════════════════════════════════════════════
//   M1 — le module désarmé: `mouthsFedByDish` rend le roster entier sur TOUS
//        les plats (le comportement d'avant le lot). ROUGE attendu.
//   M2 — l'exclusion posée sur le PLAN au lieu de la CASE: une bouche qui a son
//        plat lundi midi quitte aussi le pot commun de mardi soir. ROUGE
//        attendu — c'est la sur-correction symétrique, et elle est plus
//        dangereuse que le défaut d'origine parce qu'elle a l'air d'un progrès.
//   M3 — un plat dédié nourrit le roster entier (on oublie la règle ①). ROUGE.
//   M4 — `boxDeliveryState` rend `"no_batch_cooking"` dès que `withBox === 0`,
//        c'est-à-dire qu'il refond les DEUX zéros en un seul. ROUGE attendu:
//        c'est la conclusion « c'est un tirage » écrite en code.
//
// ══════════════════════════════════════════════════════════════════════════
// LA FORME ÉPROUVÉE EST CELLE QUI A ÉTÉ MESURÉE
// ══════════════════════════════════════════════════════════════════════════
// `3c781a71` (plan de `V0-D`): douze cases, chacune portant le plat de la table
// ET le plat dédié d'Anouk. 24 plats boîtés, 12 dédiés, et les 12 de table dans
// la MÊME case qu'un dédié — 12/12, mesuré en SQL avant tout code.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  boxDeliveryState,
  type ExpectedDish,
  mouthsFedByDish,
} from "./box_expected.ts";

const CAMILLE = "f906405b-8346-49a3-9dd8-ea924e43a166";
const MALO = "cfc3b288-371f-4c42-b6db-592eefddfa14";
const ANOUK = "fa68cbac-6874-4b65-8fe7-5f4b2e0a24c7";
const YANIS = "97318cc9-e973-4750-bc7e-a6da801c2ca9";
const ROSTER = new Set([CAMILLE, MALO, ANOUK, YANIS]);

/** Les bouches à objectif, qui reçoivent chacune un contenant seule. */
const WEIGHED = new Set([MALO, ANOUK]);

function dish(part: Partial<ExpectedDish>): ExpectedDish {
  return { day: "mon", slot: "lunch", memberId: null, boxable: true, ...part };
}

/**
 * LE COMPTEUR DE L'APPELANT, RECOPIÉ — `weighed ∩ nourris` + une ligne pour le
 * reste. C'est la forme exacte de `meal_generation.ts` quand aucun régime ne
 * mord (le cas de tous les plans mesurés: `expected = 24 × 3` ⇒ `lines = 1`).
 */
function expectedFrom(dishes: readonly ExpectedDish[]): number {
  const { fedByDish } = mouthsFedByDish(dishes, ROSTER);
  let total = 0;
  for (const fed of fedByDish) {
    if (fed === null) continue;
    let weighed = 0;
    let rest = 0;
    for (const id of fed) {
      if (WEIGHED.has(id)) weighed++;
      else rest++;
    }
    total += weighed + (rest > 0 ? 1 : 0);
  }
  return total;
}

// ── ① LE CAS QUI PASSE — ÉCRIT EN PREMIER ─────────────────────────────────

Deno.test("passe_le_foyer_sans_plat_dedie: la partition d'avant est la bonne", () => {
  // Douze plats de table, aucun plat dédié: chaque plat nourrit les quatre
  // bouches, et attend `Malo seul + Anouk seule + {Camille, Yanis}` = 3.
  const dishes = Array.from({ length: 12 }, (_, i) =>
    dish({ day: ["mon", "tue", "wed"][i % 3], slot: i % 2 ? "dinner" : "lunch" }));
  const out = mouthsFedByDish(dishes, ROSTER);
  assertEquals(out.excluded, 0, "aucune bouche ne part: aucun plat dédié");
  assertEquals(out.sharedFedNobody, []);
  for (const fed of out.fedByDish) assertEquals(fed?.size, 4);
  assertEquals(expectedFrom(dishes), 36, "12 × 3 — inchangé par le lot");
});

// ── ② LA FORME MESURÉE SUR `3c781a71` ─────────────────────────────────────

/** Douze cases, chacune: le plat de la table + le plat dédié d'Anouk. */
function planV0D(): ExpectedDish[] {
  const cells: [string, string][] = [];
  for (const day of ["mon", "tue", "wed", "thu", "sat", "sun"]) {
    for (const slot of ["lunch", "dinner"]) cells.push([day, slot]);
  }
  const dishes: ExpectedDish[] = [];
  for (const [day, slot] of cells) {
    dishes.push(dish({ day, slot }));
    dishes.push(dish({ day, slot, memberId: ANOUK }));
  }
  return dishes;
}

Deno.test("3c781a71: 24 plats boîtés, 12 dédiés, tous en case partagée", () => {
  const dishes = planV0D();
  assertEquals(dishes.length, 24);
  assertEquals(dishes.filter((d) => d.memberId !== null).length, 12);
});

Deno.test("3c781a71: `expected` tombe de 72 à 36, pas à 48", () => {
  const dishes = planV0D();
  // Ce que la formule d'AVANT rendait: 24 × (weighed 2 + lines 1).
  assertEquals(24 * 3, 72, "le témoin de la mesure AVANT, en base");
  // ⛔ Le seuil de la fiche — 12×3 + 12×1 = 48 — laisse Anouk comptée une
  // SECONDE fois sur le plat de table de sa propre case. Corrigé à 36.
  assertEquals(expectedFrom(dishes), 36);
});

Deno.test("3c781a71: le plat dédié n'attend QU'UN contenant", () => {
  const out = mouthsFedByDish(planV0D(), ROSTER);
  const dedicated = out.fedByDish.filter((_, i) => i % 2 === 1);
  assertEquals(dedicated.length, 12);
  for (const fed of dedicated) {
    assertEquals(fed?.size, 1);
    assertEquals([...(fed ?? [])], [ANOUK]);
  }
});

Deno.test("3c781a71: le plat de la table perd Anouk, et elle SEULE", () => {
  const out = mouthsFedByDish(planV0D(), ROSTER);
  assertEquals(out.excluded, 12, "une bouche part de chacun des 12 plats de table");
  for (const [i, fed] of out.fedByDish.entries()) {
    if (i % 2 === 1) continue;
    assertEquals(fed?.size, 3);
    assertEquals(fed?.has(ANOUK), false);
    assertEquals(fed?.has(MALO), true, "Malo reste au pot commun: il n'a pas de plat");
  }
});

// ── ③ L'EXCLUSION EST PAR CASE, JAMAIS PAR PLAN — mutation M2 ──────────────

Deno.test("l'exclusion ne franchit pas la case: Anouk reste au pot commun ailleurs", () => {
  const dishes = [
    dish({ day: "mon", slot: "lunch" }),
    dish({ day: "mon", slot: "lunch", memberId: ANOUK }),
    dish({ day: "tue", slot: "dinner" }),
  ];
  const out = mouthsFedByDish(dishes, ROSTER);
  assertEquals(out.fedByDish[0]?.size, 3, "lundi midi: elle a son plat");
  assertEquals(out.fedByDish[2]?.size, 4, "mardi soir: elle mange au pot commun");
  assertEquals(out.fedByDish[2]?.has(ANOUK), true);
  assertEquals(out.excluded, 1);
});

Deno.test("l'ordre du document ne change rien: le plat dédié écrit APRÈS compte", () => {
  const before = mouthsFedByDish([
    dish({ memberId: ANOUK }),
    dish({}),
  ], ROSTER);
  const after = mouthsFedByDish([
    dish({}),
    dish({ memberId: ANOUK }),
  ], ROSTER);
  assertEquals(before.excluded, 1);
  assertEquals(after.excluded, 1);
  assertEquals(before.fedByDish[1]?.size, 3);
  assertEquals(after.fedByDish[0]?.size, 3);
});

Deno.test("un plat dédié NON boîté exclut quand même du pot commun", () => {
  // Le brief: « the people who cannot be served from the shared pot ». Un plat
  // dédié cuisiné le jour même remplace le pot commun tout autant.
  const out = mouthsFedByDish([
    dish({}),
    dish({ memberId: ANOUK, boxable: false }),
  ], ROSTER);
  assertEquals(out.fedByDish[0]?.size, 3);
  assertEquals(out.fedByDish[1], null, "un plat non boîté ne réclame rien");
  assertEquals(out.excluded, 1);
});

// ── ④ LES CAS QUI DOIVENT SE NOMMER AU LIEU DE SE TAIRE ────────────────────

Deno.test("un plat de table sans mangeur se NOMME, et n'invente aucun groupe", () => {
  const dishes: ExpectedDish[] = [dish({})];
  for (const id of ROSTER) dishes.push(dish({ memberId: id }));
  const out = mouthsFedByDish(dishes, ROSTER);
  assertEquals(out.fedByDish[0]?.size, 0);
  assertEquals(out.sharedFedNobody, ["mon/lunch"]);
  assertEquals(expectedFrom(dishes), 4, "quatre plats dédiés, un chacun; la table: zéro");
});

Deno.test("une bouche dédiée hors roster se COMPTE et n'exclut personne", () => {
  const out = mouthsFedByDish([
    dish({}),
    dish({ memberId: "00000000-0000-0000-0000-000000000000" }),
  ], ROSTER);
  assertEquals(out.dedicatedOffRoster.length, 1);
  assertEquals(out.fedByDish[0]?.size, 4, "personne ne quitte le pot commun");
  assertEquals(out.fedByDish[1]?.size, 4, "le plat retombe au régime du plat de table");
  assertEquals(out.excluded, 0);
});

Deno.test("un plat sans jour ni moment garde sa propre case", () => {
  const out = mouthsFedByDish([
    dish({ day: null, slot: null }),
    dish({ day: null, slot: null, memberId: ANOUK }),
    dish({ day: "mon", slot: "lunch" }),
  ], ROSTER);
  assertEquals(out.fedByDish[0]?.size, 3, "case `any/any`");
  assertEquals(out.fedByDish[2]?.size, 4, "`mon/lunch` n'est pas `any/any`");
});

Deno.test("le roster vide ne fabrique aucun groupe", () => {
  const out = mouthsFedByDish([dish({})], new Set<string>());
  assertEquals(out.fedByDish[0]?.size, 0);
  assertEquals(out.sharedFedNobody, ["mon/lunch"]);
});

// ── ⑤ `L6′-b` — LES DEUX ZÉROS NE SONT PAS LE MÊME ZÉRO ────────────────────

Deno.test("09240cb5: zéro préparation ⇒ `no_batch_cooking`, pas un manquement", () => {
  // Sortie brute `531e11f6`: `"preparations": []`, 12 plats, aucun `uses`.
  assertEquals(
    boxDeliveryState({ clean: true, roster: 4, meals: 0, withBox: 0 }),
    "no_batch_cooking",
  );
});

Deno.test("5058be6a: vingt repas dus, zéro rendu ⇒ `none_delivered`", () => {
  // Sortie brute `a571831b`: 6 préparations, 26 plats qui y prélèvent, zéro clé
  // `boxes`, et onze mentions des boîtes EN PROSE.
  assertEquals(
    boxDeliveryState({ clean: true, roster: 4, meals: 20, withBox: 0 }),
    "none_delivered",
  );
});

Deno.test("les deux zéros de `L6′-b` ne portent PAS le même nom — mutation M4", () => {
  const vide = boxDeliveryState({ clean: true, roster: 4, meals: 0, withBox: 0 });
  const manquant = boxDeliveryState({ clean: true, roster: 4, meals: 20, withBox: 0 });
  assertEquals(vide === manquant, false, "c'est tout le lot: 0 ≠ 0");
});

Deno.test("un plan servi et un plan partiel se distinguent aussi", () => {
  assertEquals(boxDeliveryState({ clean: true, roster: 4, meals: 25, withBox: 25 }), "served");
  assertEquals(boxDeliveryState({ clean: true, roster: 4, meals: 28, withBox: 8 }), "partial");
});

Deno.test("⛔ LA LANE SOLO NE DÉCLENCHE RIEN: `not_asked`, pas `none_delivered`", () => {
  // ⛔ MESURÉ EN BASE, PAS SUPPOSÉ: le plan solo porte `{meals: 10, with_box: 0,
  // expected: 0}`, parce que `generate-meal-v1` passe `boxMemberIds: []` EXPRÈS.
  // Sans la porte du roster, l'alarme de `L6′-b` sonnerait sur CHAQUE plan
  // individuel — et une garde qui alarme là où rien n'a été demandé se fait
  // désarmer, en emportant les deux cas où elle avait raison.
  assertEquals(
    boxDeliveryState({ clean: true, roster: 0, meals: 10, withBox: 0 }),
    "not_asked",
  );
});

Deno.test("un plan vidé par le verrou de sortie n'est pas un foyer sans batch", () => {
  assertEquals(
    boxDeliveryState({ clean: false, roster: 4, meals: 0, withBox: 0 }),
    "plan_emptied",
  );
});

Deno.test("les dix plans du 2026-08-22 se ventilent 6/2/1/1", () => {
  const mesure: [number, number][] = [
    [8, 8], [0, 0], [16, 8], [28, 8], [4, 4],
    [14, 14], [20, 0], [25, 25], [16, 16], [24, 24],
  ];
  const noms = mesure.map(([meals, withBox]) =>
    boxDeliveryState({ clean: true, roster: 4, meals, withBox })
  );
  assertEquals(noms.filter((n) => n === "served").length, 6);
  assertEquals(noms.filter((n) => n === "partial").length, 2);
  assertEquals(noms.filter((n) => n === "no_batch_cooking").length, 1);
  assertEquals(noms.filter((n) => n === "none_delivered").length, 1);
});

// ⟳ 2026-09-09 — LE COMPLÉMENT NE RETIRE PAS SON PORTEUR DE LA TABLE.
Deno.test("un plat à un nom marqué complément nourrit sa bouche ET la laisse sur le plat de la table", () => {
  const dishes = [
    dish({ memberId: null }),
    dish({ memberId: MALO, complementsShared: true }),
  ];
  const out = mouthsFedByDish(dishes, ROSTER);
  assertEquals([...(out.fedByDish[0] ?? [])].sort(), [CAMILLE, MALO, ANOUK, YANIS].sort(), "le porteur a quitté la table");
  assertEquals([...(out.fedByDish[1] ?? [])], [MALO]);
  assertEquals(out.excluded, 0);
  assertEquals(out.complements, 1);
  // ⛔ ET SANS LE DRAPEAU, LA RÈGLE D'AVANT TIENT : le dédié remplace.
  const before = mouthsFedByDish([dish({ memberId: null }), dish({ memberId: MALO })], ROSTER);
  assertEquals([...(before.fedByDish[0] ?? [])].sort(), [CAMILLE, ANOUK, YANIS].sort());
  assertEquals(before.excluded, 1);
  assertEquals(before.complements, 0);
});
