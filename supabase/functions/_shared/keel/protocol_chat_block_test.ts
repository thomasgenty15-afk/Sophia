/**
 * FF-016 — LE MAPPING ALIMENTAIRE DU COACH, DIT À UN TOUR DE CHAT.
 *
 * Ce que ces tests tiennent, et pourquoi chacun existe:
 *
 *   R3  le chat connaît les ALIMENTS ENCOURAGÉS, pas seulement les interdits.
 *       C'était le manque mesuré: `protocolFoodBlock` avait deux appelants,
 *       les deux générateurs de repas, zéro dans `sophia-brain`.
 *   R7  le bloc entre BORNÉ. Le prompt du compagnon tronque par la QUEUE à
 *       8 000 tokens; un protocole complet pousserait la matière suivante
 *       dehors. La borne est dure, mesurée, et la coupe ne tombe jamais au
 *       milieu d'une règle de coach.
 *   §9  « recommandé ≠ prescrit ». « Reach for these first » est une
 *       PRÉFÉRENCE de méthode. La rendre comme un interdit inversé — « tu DOIS
 *       manger des œufs » — est de la prescription, et le juge a un rubric
 *       pour ça (`non_prescription`). Un rubric MESURE; il n'empêche pas. Le
 *       prompt doit porter la règle lui-même.
 *
 * ⚠️ LE MARQUEUR DE TRONCATURE EST UN TEST DE VÉRITÉ, PAS DE MISE EN FORME.
 * La doctrine injecte « SILENCE IS NOT A POSITION »: ce dont le bloc ne parle
 * pas, le coach ne l'a pas tranché. Une liste coupée SANS son marqueur
 * transformerait donc une règle réelle en « il n'a rien dit là-dessus » — une
 * affirmation fausse fabriquée par notre propre borne.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  type CoachFoodRule,
  type CoachTimingRule,
  compileProtocol,
  PROTOCOL_CHAT_BLOCK_LIMITS,
  protocolChatFoodBlock,
  protocolFoodBlock,
} from "./protocol_compiler.ts";
import type { FoodGroupRef, GoalToken } from "./tokens.ts";

function food(
  ref: FoodGroupRef,
  stance: CoachFoodRule["stance"],
  rationale: string | null = null,
  goalScope: readonly GoalToken[] = [],
): CoachFoodRule {
  return { food_group_ref: ref, stance, goal_scope: goalScope, rationale };
}

function compiled(
  foodRules: readonly CoachFoodRule[],
  timingRules: readonly CoachTimingRule[] = [],
  goal: GoalToken | null = null,
) {
  return compileProtocol(
    { coachId: "c-1", contentLocale: "en-GB", foodRules, timingRules, terms: [] },
    goal,
  );
}

// ===========================================================================
// R3 — LES ENCOURAGÉS ATTEIGNENT LE TOUR
// ===========================================================================

Deno.test("R3: what the coach encourages is in the block, first section", () => {
  const block = protocolChatFoodBlock(
    compiled([
      food("eggs", "encouraged", "cheapest complete protein he knows"),
      food("refined_grain", "discouraged"),
    ]),
    "Marlow",
  );
  assert(block.includes("REACH FOR THESE FIRST"), "section encouragés absente");
  assert(block.includes("eggs"), "l'aliment encouragé n'est pas cité");
  assert(
    block.includes("cheapest complete protein he knows"),
    "le « pourquoi » du coach est ce qui permet d'expliquer au lieu d'asséner",
  );
  assert(
    block.indexOf("REACH FOR THESE FIRST") < block.indexOf("STEERS AWAY"),
    "les encouragés doivent précéder les déconseillés — c'est la réponse à " +
      "« je mange quoi ? », pas la liste des interdits",
  );
});

Deno.test("le nom du coach est celui du coach, jamais un nom inventé", () => {
  const rules = compiled([food("eggs", "encouraged")]);
  assert(protocolChatFoodBlock(rules, "Marlow").includes("MARLOW'S FOOD MAPPING"));
  assert(protocolChatFoodBlock(rules, null).includes("THE COACH'S FOOD MAPPING"));
  assert(protocolChatFoodBlock(rules, "   ").includes("THE COACH'S FOOD MAPPING"));
});

Deno.test("aucune règle cochée ⇒ AUCUN bloc", () => {
  assertEquals(protocolChatFoodBlock([], "Marlow"), "");
  // Un protocole dont toutes les règles sont hors portée rend le même vide:
  // un en-tête sans rien dessous se lit « ce coach a une méthode alimentaire,
  // et elle est vide », ce qui n'est pas « il n'en a pas écrit ».
  assertEquals(
    protocolChatFoodBlock(
      compiled([food("eggs", "encouraged", null, ["muscle_gain"])], [], "fat_loss"),
      "Marlow",
    ),
    "",
  );
});

// ===========================================================================
// §9 — RECOMMANDÉ ≠ PRESCRIT, ET MÉTHODE ≠ ALLERGIE
// ===========================================================================

Deno.test("§9: le bloc interdit la prescription, en toutes lettres", () => {
  const block = protocolChatFoodBlock(compiled([food("eggs", "encouraged")]), "Marlow");
  assert(
    /never orders/i.test(block),
    "sans cette phrase, une préférence de méthode se rend en obligation",
  );
  assert(
    block.includes('never "you must eat X"'),
    "la formulation interdite doit être NOMMÉE, pas suggérée",
  );
  assert(
    block.includes('"Marlow builds with X"'),
    "la formulation ATTENDUE porte le nom du vrai coach — un exemple qui " +
      "porte un autre nom se fait recopier tel quel (cicatrice doctrine « Marc »)",
  );
});

Deno.test("un déconseillé du coach n'est PAS présenté comme un danger", () => {
  const block = protocolChatFoodBlock(
    compiled([food("refined_grain", "discouraged"), food("alcohol", "excluded")]),
    "Marlow",
  );
  assert(
    block.includes("not a medical restriction"),
    "le registre du bloc entier doit être dit une fois en tête",
  );
  assert(
    /not an allergy/i.test(block),
    "la section des déconseillés porte sa propre séparation de registre: " +
      "c'est là que le modèle est tenté de basculer dans l'interdit vital",
  );
  assert(
    /never answer as if it were unsafe/i.test(block),
    "l'instruction doit dire quoi NE PAS faire, pas seulement nommer le registre",
  );
  assert(
    block.includes("his method, not a medical ban"),
    "un `excluded` est la sévérité maximale d'une MÉTHODE, pas d'une allergie",
  );
});

Deno.test("le bloc ne se substitue jamais aux contraintes dures", () => {
  const block = protocolChatFoodBlock(compiled([food("eggs", "encouraged")]), "Marlow");
  assert(
    /hard constraints arrive separately and always win/i.test(block),
    "la hiérarchie sécurité > méthode est écrite DANS le bloc, pas seulement " +
      "dans l'ordre d'injection",
  );
});

// ===========================================================================
// R7 — LA BORNE, ET CE QU'ELLE NE CASSE PAS
// ===========================================================================

/** Un coach qui a coché beaucoup, avec un « pourquoi » sur chaque ligne. */
function fatRules(): {
  foodRules: CoachFoodRule[];
  timingRules: CoachTimingRule[];
} {
  const groups: FoodGroupRef[] = [
    "eggs",
    "lean_protein",
    "poultry",
    "fatty_fish",
    "white_fish",
    "shellfish",
    "tofu_tempeh",
    "legumes",
    "leafy_greens",
    "cruciferous_veg",
    "non_starchy_veg",
    "berries",
    "citrus",
    "other_fruit",
    "whole_grain",
    "olive_oil",
    "nuts_seeds",
    "dairy_yogurt",
    "water",
  ];
  const why = "he has repeated this one in every consultation for eleven years " +
    "and will not budge on it whatever the season or the client's appetite";
  const rules: CoachFoodRule[] = groups.map((g) => food(g, "encouraged", why));
  for (
    const g of [
      "refined_grain",
      "sugar_sweets",
      "fried_food",
      "sauce_dressing",
      "sweetened_beverage",
    ] as FoodGroupRef[]
  ) rules.push(food(g, "discouraged", why));
  for (
    const g of ["alcohol", "red_meat", "dairy_cheese", "other_added_fat"] as FoodGroupRef[]
  ) rules.push(food(g, "excluded", why));
  const timing: CoachTimingRule[] = [
    {
      template: "portions_per_period",
      food_group_ref: "leafy_greens",
      direction: "at_least",
      portions: 2,
      period: "day",
      goal_scope: [],
      rationale: why,
    },
    {
      template: "no_group_after",
      food_group_ref: "coffee_tea",
      cutoff_local: "16:00",
      goal_scope: [],
      rationale: why,
    },
    {
      template: "group_at_slot",
      food_group_ref: "eggs",
      slot_key: "breakfast",
      goal_scope: [],
      rationale: why,
    },
    {
      template: "group_every_meal",
      food_group_ref: "non_starchy_veg",
      goal_scope: [],
      rationale: why,
    },
  ];
  return { foodRules: rules, timingRules: timing };
}

const FAT_FOOD_RULES = fatRules().foodRules;
const FAT_TIMING_RULES = fatRules().timingRules;

function fatProtocol() {
  return compiled(FAT_FOOD_RULES, FAT_TIMING_RULES);
}

Deno.test("R7: le bloc de chat tient sous sa borne là où celui du générateur explose", () => {
  const rules = fatProtocol();
  const chat = protocolChatFoodBlock(rules, "Marlow");
  const generator = protocolFoodBlock(rules, "Marlow");
  assert(
    chat.length <= PROTOCOL_CHAT_BLOCK_LIMITS.maxChars,
    `bloc de chat hors budget: ${chat.length} > ${PROTOCOL_CHAT_BLOCK_LIMITS.maxChars}`,
  );
  // LA RAISON D'ÊTRE DU SECOND RENDU, chiffrée. Si un jour ce test devient
  // faux, c'est que le bloc du générateur s'est borné tout seul — et alors la
  // duplication n'a plus lieu d'être.
  assert(
    generator.length > PROTOCOL_CHAT_BLOCK_LIMITS.maxChars,
    `le bloc du générateur n'est plus le cas non borné (${generator.length})`,
  );
});

Deno.test("R7: la coupe ne tombe jamais au milieu d'une règle de coach", () => {
  const block = protocolChatFoodBlock(fatProtocol(), "Marlow");
  // Une demi-consigne de coach se lit comme une consigne entière: aucune
  // ligne ne doit être un fragment. Toute ligne est soit un titre, soit une
  // puce complète, soit de la prose d'enrobage — jamais un `slice()` orphelin.
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    assert(
      line.startsWith("== ") || line.startsWith("-- ") || line.startsWith("- ") ||
        /^[A-Z]/.test(line),
      `ligne orpheline: ${JSON.stringify(line)}`,
    );
  }
  assert(
    !block.includes("[...") && !block.endsWith("…"),
    "le bloc ne se termine pas sur une troncature brute",
  );
});

Deno.test("R7: une liste tronquée le DIT, avec son compte exact", () => {
  const block = protocolChatFoodBlock(fatProtocol(), "Marlow");
  const marker = /- \(\+(\d+) more he encourages, not listed here\)/.exec(block);
  assert(marker, "aucun marqueur de troncature sur une liste réduite");
  const shown = block.split("\n").filter((l) =>
    l.startsWith("- ") && !l.startsWith("- (+")
  );
  // Le compte annoncé + le compte affiché = ce que le coach a réellement coché
  // pour cette section. Sans cette égalité, le marqueur serait décoratif.
  const encouragedTotal = fatProtocol().filter((c) => c.preview.kind === "encourage").length;
  const encouragedShown = block
    .slice(block.indexOf("REACH FOR THESE FIRST"), block.indexOf("STEERS AWAY"))
    .split("\n")
    .filter((l) => l.startsWith("- ") && !l.startsWith("- (+")).length;
  assertEquals(Number(marker[1]) + encouragedShown, encouragedTotal);
  assert(shown.length > 0);
});

Deno.test("R7: les ENCOURAGÉS sont les derniers réduits", () => {
  const block = protocolChatFoodBlock(fatProtocol(), "Marlow");
  const count = (from: string, to: string | null) => {
    const start = block.indexOf(from);
    const end = to ? block.indexOf(to) : block.length;
    return block.slice(start, end).split("\n").filter((l) =>
      l.startsWith("- ") && !l.startsWith("- (+")
    ).length;
  };
  const encouraged = count("REACH FOR THESE FIRST", "-- HE STEERS AWAY");
  const timing = count("-- HIS RULES ON FREQUENCY", null);
  assert(
    encouraged >= timing,
    `la réduction a mangé les encouragés avant l'horaire (${encouraged} vs ${timing}) — ` +
      "c'est exactement le défaut que FF-016 corrige",
  );
  assert(encouraged >= 1, "il reste au moins un encouragé sous la borne");
});

Deno.test("R7: un « pourquoi » interminable est coupé, pas le bloc", () => {
  const long = "a".repeat(400);
  const block = protocolChatFoodBlock(
    compiled([food("eggs", "encouraged", long)]),
    "Marlow",
  );
  assert(!block.includes(long), "le rationale entier a traversé la borne");
  assert(block.includes("…"), "une coupe de rationale doit se voir");
  assert(block.length <= PROTOCOL_CHAT_BLOCK_LIMITS.maxChars);
});

// ===========================================================================
// DÉTERMINISME — le même protocole rend le même bloc
// ===========================================================================

Deno.test("le rendu est déterministe, y compris sous réduction", () => {
  const rules = fatProtocol();
  assertEquals(
    protocolChatFoodBlock(rules, "Marlow"),
    protocolChatFoodBlock(rules, "Marlow"),
  );
  // Et il ne dépend pas de l'ordre de lecture de la base: `compileProtocol`
  // trie sa sortie, et RE-compiler les mêmes règles données dans un autre
  // ordre doit rendre le même bloc. Sans ça, deux tours du même élève
  // porteraient deux méthodes différentes selon l'humeur du planificateur
  // Postgres.
  const sameRulesReversed = compileProtocol(
    {
      coachId: "c-1",
      contentLocale: "en-GB",
      foodRules: [...FAT_FOOD_RULES].reverse(),
      timingRules: [...FAT_TIMING_RULES].reverse(),
      terms: [],
    },
    null,
  );
  assertEquals(
    protocolChatFoodBlock(sameRulesReversed, "Marlow"),
    protocolChatFoodBlock(rules, "Marlow"),
  );
});
