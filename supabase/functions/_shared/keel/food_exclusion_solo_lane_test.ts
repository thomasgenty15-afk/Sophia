/**
 * ⟳ 2026-09-06 — LA LANE SOLO A UNE CEINTURE D'EXCLUSION, ET ELLE RETIRE LE PLAT.
 *
 * Mesuré (banc « un retour et les calories ») : `generate-meal-v1` passait
 * `boxMemberExclusions: []` et n'avait, pour une exclusion écrite, qu'une
 * `issue` `written_instruction_unanswered`. Le plat au saumon partait, ses
 * kcal comptés. Ces tests épinglent le câblage ; le comportement est celui de
 * `dishBitesExclusion` (testé à part) et de la relance des cases vides.
 */
import { assert } from "jsr:@std/assert@1";

const src = (await Deno.readTextFile(
  new URL("../../generate-meal-v1/index.ts", import.meta.url),
)).replace(/\/\*[\s\S]*?\*\//g, "");

Deno.test("la lane solo tire les termes d'exclusion de la table et les compte", () => {
  assert(/const soloExclusionTerms = exclusionTermsFor\(/.test(src), "la ceinture a disparu de la lane solo");
  assert(/subject: HOUSEHOLD_SUBJECT/.test(src), "le sujet n'est plus la table (un solo est sa table)");
  assert(/tag: "keel\.meal\.exclusion_belt"/.test(src), "le compteur a disparu");
});

Deno.test("⛔ une morsure survivante RETIRE le plat et rouvre sa case — jamais servie, jamais comptée", () => {
  const at = src.indexOf("const surviving = bitesOf(meal);");
  assert(at > 0, "le second passage après relance a disparu");
  const block = src.slice(at, at + 1800);
  assert(/meal\.dishes = kept;/.test(block), "le plat mordu n'est plus retiré");
  assert(/meal\.empty_slots\.push\(\{ day: d\.day, slot: d\.slot \}\)/.test(block), "la case du plat retiré n'est pas rouverte pour la relance des cases vides");
  assert(/dish dropped, slot left to refill/.test(block), "le retrait n'est plus dit");
});

Deno.test("la relance d'exclusion de la lane solo ne raccourcit pas le plan et n'est acceptée que si les morsures baissent", () => {
  const at = src.indexOf("`${FN_NAME}.exclusion_retry`");
  assert(at > 0, "la relance d'exclusion a disparu de la lane solo");
  const block = src.slice(at, at + 900);
  assert(/retried\.dishes\.length >= meal\.dishes\.length/.test(block));
  assert(/after\.length < before\.length/.test(block));
});

Deno.test("⛔ la ceinture solo tourne AVANT la relance des cases vides, qui recompose les trous qu'elle ouvre", () => {
  const belt = src.indexOf("const surviving = bitesOf(meal);");
  const refill = src.indexOf("`${FN_NAME}.empty_slots_retry`");
  assert(belt > 0 && refill > 0 && belt < refill, "la relance des cases vides tourne avant la ceinture: un trou ouvert par un retrait ne serait jamais recomposé");
});
