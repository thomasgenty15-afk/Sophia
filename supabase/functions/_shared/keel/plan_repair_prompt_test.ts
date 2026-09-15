/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 — LE MESSAGE SYSTÈME DE RÉPARATION NE PORTE QU'UN SCHÉMA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT ÉPROUVÉ ICI (revue du 2026-09-12, P1 §3). L'appel de réparation
 * transmettait `MEAL_SYSTEM_PROMPT`, qui se termine par un `OUTPUT JSON SCHEMA`
 * de PLAN COMPLET et ordonne de couvrir tous les jours, pendant que le message
 * utilisateur exigeait un patch.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEAL_PROMPT_SECTION_KEYS,
  MEAL_SYSTEM_PROMPT,
} from "./meal_generation.ts";
import {
  REPAIR_PROMPT_DROPPED_SECTIONS,
  REPAIR_PROMPT_KEPT_SECTIONS,
  repairSystemPrompt,
} from "./plan_repair_prompt.ts";

const SANS_LIMITES = repairSystemPrompt({
  safetyBlock: null,
  houseRuleBlock: null,
});

Deno.test("① les deux listes recouvrent EXACTEMENT le prompt de composition", () => {
  // ⛔ « Elle n'est pas dans la liste » n'est pas une décision, c'est un oubli.
  // Une section ajoutée au prompt de composition fait rougir ce test tant que
  // personne n'a dit à quel camp elle appartient — c'est voulu.
  const gardees = [...REPAIR_PROMPT_KEPT_SECTIONS];
  const ecartees = REPAIR_PROMPT_DROPPED_SECTIONS.map((x) => x.key);
  assertEquals(
    [...gardees, ...ecartees].sort(),
    [...MEAL_PROMPT_SECTION_KEYS].sort(),
  );
  assertEquals(
    new Set([...gardees, ...ecartees]).size,
    MEAL_PROMPT_SECTION_KEYS.length,
    "une section est à la fois gardée et écartée",
  );
});

Deno.test("① bis — chaque section écartée porte la RAISON de son absence", () => {
  for (const x of REPAIR_PROMPT_DROPPED_SECTIONS) {
    assert(
      x.why.trim().length > 20,
      `${x.key} est écartée sans raison écrite`,
    );
  }
});

Deno.test("② le prompt de réparation ne porte AUCUN schéma de plan", () => {
  const t = SANS_LIMITES.text;
  assert(!t.includes("== OUTPUT JSON SCHEMA =="), "le second schéma est revenu");
  assert(!t.includes('"cooking_sessions": ['), "le schéma de plan est revenu");
  assert(
    !t.includes("== COVER THE WHOLE STRETCH, WITH FEW COOKING SESSIONS =="),
    "l'ordre de couvrir tous les jours est revenu",
  );
  assert(!t.includes("== THE TWO MODES =="), "la consigne de courses est revenue");
  // ⛔ ET LE SEUL SCHÉMA EST CELUI DU PATCH, une seule fois.
  assertEquals(t.split('{"repair":{').length - 1, 1);
});

Deno.test("③ les règles de cuisine qui comptent encore sont là", () => {
  const t = SANS_LIMITES.text;
  for (const attendu of [
    // CIQUAL cru/cuit — sans elle une recette réparée repart `unmeasurable`.
    '"state":  "raw" or "cooked"',
    // La ligne rouge du produit.
    "== NEVER PUT A NUMBER ON NUTRITION ==",
    // Les proportions qu'un redimensionnement ne doit pas casser.
    "== SAY WHAT HOLDS THE RECIPE TOGETHER ==",
    // La méthode du coach et ses interdits.
    "== THE METHOD COMES FIRST, THE RECIPE IS YOURS ==",
    // Les deux lignes de chaque plat rendu.
    "== EVERY DISH HAS TWO LINES: A NAME, AND A TITLE ==",
  ]) {
    assert(t.includes(attendu), `règle perdue: ${attendu}`);
  }
});

Deno.test("④ l'ouverture dit qu'on RÉPARE, et interdit de couvrir la semaine", () => {
  const t = SANS_LIMITES.text;
  assert(t.startsWith("You are correcting a meal plan you already wrote"));
  assert(t.includes("YOU ARE NOT WRITING A PLAN"));
  assert(t.includes("AND YOU DO NOT COVER THE WEEK"));
});

Deno.test("⑤ les limites dures voyagent avec le message système", () => {
  const avec = repairSystemPrompt({
    safetyBlock: "- Zoé: peanut — allergy, severity=medical",
    houseRuleBlock: "HOUSE RULES: no pork at this table.",
  });
  assert(avec.text.includes("severity=medical"));
  assert(avec.text.includes("no pork at this table"));
  assertEquals(avec.counts.safety_block, true);
  assertEquals(avec.counts.house_rule_block, true);
  // ⛔ ET ELLES ARRIVENT AVANT LE SCHÉMA: elles bornent ce qu'on a le droit
  // d'écrire, le schéma dit sous quelle forme l'écrire.
  assert(avec.text.indexOf("severity=medical") < avec.text.indexOf('{"repair":{'));
});

Deno.test("⑤ bis — `null` ne pose pas un titre au-dessus de rien", () => {
  assertEquals(SANS_LIMITES.counts.safety_block, false);
  assertEquals(SANS_LIMITES.counts.house_rule_block, false);
  // ⚠️ ET UNE CHAÎNE VIDE VAUT `null`: un appelant qui rend `""` ne colle pas
  // deux sauts de ligne au milieu du prompt.
  const vide = repairSystemPrompt({ safetyBlock: "   ", houseRuleBlock: "" });
  assertEquals(vide.text, SANS_LIMITES.text);
});

Deno.test("⑥ il est PLUS COURT que le prompt de composition, et c'est mesuré", () => {
  // ⚠️ PAS UNE OPTIMISATION: la preuve que des sections sont réellement
  // tombées. Un prompt de réparation aussi long que celui de composition
  // voudrait dire que le filtre ne filtre rien.
  assert(
    SANS_LIMITES.counts.chars < MEAL_SYSTEM_PROMPT.length,
    `réparation ${SANS_LIMITES.counts.chars} vs composition ${MEAL_SYSTEM_PROMPT.length}`,
  );
  assertEquals(
    SANS_LIMITES.counts.sections_kept,
    REPAIR_PROMPT_KEPT_SECTIONS.length,
  );
});
