import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { boxGateZero, decideBoxEnergy } from "./box_energy_decision.ts";
import type { BoxEnergy } from "./mouth_energy.ts";
import { BOX_ENERGY_REASONS } from "./energy_gate.ts";

// ⟳ LOT F · RELECTURE (2026-09-05) — LA DÉCISION PAR BOÎTE, ENFIN EXÉCUTÉE.
//
// La relecture croisée de `fc1642f0` a joué quatre mutations sur la version
// qui vivait dans `index.ts`, et toutes sont restées VERTES parce que rien ne
// l'exécutait: le plancher en dur à `false`, `emitted++` retiré, les motifs à
// zéro non écrits, et le lecteur `explicit_off` qui recevait les boîtes des
// autres. Chacune a ici son cas qui rougit — et d'abord LE CAS QUI PASSE.

const TODAY = "2026-09-05";
const box = (id: string, memberIds: string[], kcal: number | null): BoxEnergy => ({
  boxId: id, day: "sat", slot: "lunch", memberIds, grams: 350, kcal,
  gap: kcal === null ? "dish_incomplete" : null,
});
const MARC = { memberId: "m-marc", userId: null, birthDate: "1986-09-02", goal: "fat_loss" };
const JULIE = { memberId: "m-julie", userId: "u-julie", birthDate: "1989-02-20", goal: "maintenance" };
const LEO = { memberId: "m-leo", userId: null, birthDate: "2014-03-05", goal: "muscle_gain" };
const base = () => ({
  mouths: [MARC, JULIE, LEO],
  floors: new Map<string, boolean>([["u-julie", false]]),
  switches: new Map<string, boolean | null>([["u-julie", null]]),
  coachCounting: "no_position" as const,
  today: TODAY,
  viewer: "member" as const,
});

Deno.test("LOT F — LE CAS QUI PASSE: la boîte du mari sans compte, en perte, sort chiffrée", () => {
  const out = decideBoxEnergy({ ...base(), perBox: [box("b1", ["m-marc"], 404.4)] });
  assertEquals(out.boxes, [{ box_id: "b1", member_id: "m-marc", kcal: 404, basis: "plan_quantities" }]);
  assertEquals(out.gate.single, 1);
  assertEquals(out.gate.emitted, 1);
});

Deno.test("⛔ LOT F — la maintenance ne sort pas, et c'est `no_direction` qui le dit", () => {
  const out = decideBoxEnergy({ ...base(), perBox: [box("b1", ["m-julie"], 500)] });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.refused.no_direction, 1);
});

Deno.test("⛔ LOT F — un compte SOUS PLANCHER ne reçoit pas son kcal (la mutation M7 de la relecture)", () => {
  const out = decideBoxEnergy({
    ...base(),
    floors: new Map([["u-julie", true]]),
    switches: new Map([["u-julie", true]]), // elle a même allumé: le plancher gagne
    perBox: [box("b1", ["m-julie"], 500)],
  });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.refused.restriction_floor, 1);
});

Deno.test("⛔ LOT F — un compte dont le plancher n'a PAS été lu se ferme (fail-closed)", () => {
  // L'appelant a promis de remplir la carte; s'il a oublié, on ne sert pas un
  // chiffre à quelqu'un qu'on n'a pas su évaluer.
  const out = decideBoxEnergy({
    ...base(),
    floors: new Map(),
    switches: new Map([["u-julie", true]]),
    perBox: [box("b1", ["m-julie"], 500)],
  });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.refused.restriction_floor, 1);
});

Deno.test("⛔ LOT F — un compte qui a ÉTEINT reste éteint, objectif ou pas (R7)", () => {
  const out = decideBoxEnergy({
    ...base(),
    mouths: [{ ...JULIE, goal: "fat_loss" }],
    switches: new Map([["u-julie", false]]),
    perBox: [box("b1", ["m-julie"], 500)],
  });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.refused.student_off, 1);
});

Deno.test("⛔ LOT F — un mineur n'a JAMAIS de kcal sur sa boîte, même en prise de poids", () => {
  const out = decideBoxEnergy({ ...base(), perBox: [box("b1", ["m-leo"], 600)] });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.refused.minor, 1);
  const noDate = decideBoxEnergy({
    ...base(),
    mouths: [{ ...MARC, birthDate: null }],
    perBox: [box("b1", ["m-marc"], 600)],
  });
  assertEquals(noDate.gate.refused.age_unknown, 1);
});

Deno.test("⛔ LOT F — le lecteur qui n'est plus du foyer ne reçoit RIEN, et ça se compte", () => {
  // Le fait de lecture de la relecture: une ligne de plan non retirée garde son
  // `household_id`, et un ancien membre lisait encore les kcal des autres.
  const out = decideBoxEnergy({ ...base(), viewer: "not_member", perBox: [box("b1", ["m-marc"], 404)] });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.viewer_not_member, 1);
  assertEquals(out.gate.emitted, 0);
  // ⛔ ET « JAMAIS RATTACHÉ » N'EST PAS « SORTI »: deux compteurs, sinon l'un
  // ressemble à un compteur qui marche pendant que l'autre défaut passe.
  const none = decideBoxEnergy({ ...base(), viewer: "unattached", perBox: [box("b1", ["m-marc"], 404)] });
  assertEquals(none.boxes, []);
  assertEquals(none.gate.viewer_unattached, 1);
  assertEquals(none.gate.viewer_not_member, 0);
});

Deno.test("⛔ LOT F — un bac partagé n'entre pas; un plat illisible et une bouche inconnue se comptent", () => {
  const out = decideBoxEnergy({
    ...base(),
    perBox: [
      box("tub", ["m-marc", "m-julie"], 900),
      box("b2", ["m-marc"], null),
      box("b3", ["m-inconnu"], 300),
    ],
  });
  assertEquals(out.boxes, []);
  assertEquals(out.gate.single, 2, "le bac n'est pas compté du tout");
  assertEquals(out.gate.unreadable, 1);
  assertEquals(out.gate.unknown_mouth, 1);
});

Deno.test("⛔ LOT F — le compteur porte TOUS les motifs, à zéro (les mutations M3a/M3b)", () => {
  const zero = boxGateZero();
  for (const r of BOX_ENERGY_REASONS) if (r !== "open") assertEquals(zero.refused[r], 0, r);
  assertEquals(Object.keys(zero.refused).sort(), [...BOX_ENERGY_REASONS].filter((r) => r !== "open").sort());
  // et `emitted` compte vraiment
  const out = decideBoxEnergy({ ...base(), perBox: [box("b1", ["m-marc"], 400), box("b2", ["m-marc"], 380)] });
  assertEquals(out.gate.emitted, 2);
  assertEquals(out.boxes.length, 2);
});

Deno.test("⛔ LOT F — les entrées sont REQUISES", () => {
  const ok = { ...base(), perBox: [] as BoxEnergy[] };
  for (const key of Object.keys(ok)) {
    const bad = { ...ok } as Record<string, unknown>;
    delete bad[key];
    assertThrows(() => decideBoxEnergy(bad as Parameters<typeof decideBoxEnergy>[0]), Error, undefined, key);
  }
  assertThrows(() => decideBoxEnergy({ ...ok, viewer: "yes" as unknown as "member" }));
  assert(decideBoxEnergy(ok).boxes.length === 0);
});
