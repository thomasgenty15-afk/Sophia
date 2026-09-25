/**
 * LA CONSIGNE v49 NE PROMET PLUS CE QUE RIEN NE TIENT — la jointure dans la
 * lane du foyer (2026-09-25, phase 3 du banc des trois foyers).
 *
 * Les modules purs ont leurs tests; celui-ci ne tient QUE ce que le handler
 * passe à ces modules. Un paramètre facultatif oublié rendrait la règle d'avant
 * en silence — la cicatrice « paramètre de garde optionnel = garde désarmée ».
 */
import { assert } from "jsr:@std/assert@1";
import { sourceFamilySync } from "./source_family.ts";

const SRC = sourceFamilySync(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);
const DOCTRINE = sourceFamilySync(new URL("./household_doctrine.ts", import.meta.url));

Deno.test("COURSES — la réponse de la personne voyage à part, et l'écart se nomme", () => {
  assert(SRC.includes('chosenRuns: typeof groceryRunsAnswer === "number" ? groceryRunsAnswer : null,'));
  assert(SRC.includes('cookDaysDeclared: capacity.plan.notes.includes("cook_days_declared"),'));
  assert(SRC.includes("`shopping_runs: chosen ${choisies ?? \"any\"}, planned ${capacity.plan.runs}, made ${faites}`"));
  assert(!SRC.includes("shopping_runs: asked"), "« asked » portait le nombre organisé, pas la réponse");
});

Deno.test("PROTÉINES — plafond de table proratisé, plat à soi hors de la table et sans demande", () => {
  assert(SRC.includes("coveredFraction: coveredDayFraction(d.dayTargetKcal, d.coveredBudgetGrossKcal),"));
  assert(SRC.includes("ownDishCells: dedicatedCellsByMember.get(memberId) ?? new Set<string>(),"));
  assert(SRC.includes("ownDishCells: declaredOwnCellsByMember.get(m.memberId) ?? new Set<string>(),"));
  // Le contrat de moment: ni densité sur ce qu'elle a déclaré manger.
  assert(SRC.includes("densityMin: c.corridor?.incompatible || ownCells?.has(`${c.dayToken}|${c.slot}`) === true"));
});

Deno.test("SHAKER — pas de mixeur déclaré, pas de shaker composé, et c'est compté", () => {
  assert(SRC.includes('const shakeWithoutBlender = missingKitchenTools(kitchenEquipment).includes("blender");'));
  const i = SRC.indexOf("if (shakeWithoutBlender) {");
  assert(i > 0);
  assert(SRC.slice(i, i + 120).includes("shakeTally.no_blender += 1;"));
});

Deno.test("GESTE DU JOUR — compté par moment sur la ligne écrite", () => {
  assert(SRC.includes("same_day_kinds: (() => {"));
});

Deno.test("HYGIÈNE — la quatrième population est comptée", () => {
  assert(SRC.includes('skipped_no_two_dishes: household.crossContact.skipped === "no_two_dishes" ? 1 : 0,'));
});

Deno.test("DOCTRINE — la lane du foyer ne sert pas la voix de conversation du coach", () => {
  assert(DOCTRINE.includes("voice: false,"));
});
