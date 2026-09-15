// LE MAPPING ALIMENTAIRE ATTEINT LE GÉNÉRATEUR — protocol_loader.ts.
//
// LE TEST QUI PORTE LE FICHIER:
//   * « ce que le coach coche arrive dans le prompt du générateur de repas »
//     — parce que ça n'y arrivait PAS: `coach_food_rules` avait son écran, ses
//       gardes de schéma et trente tests de compilation, et aucun lecteur au
//       runtime. Un coach cochait, et Sophia composait sans rien en savoir.
//
// Les autres tiennent ce qui pourrait l'annuler en silence:
//   * la portée par objectif s'applique AUSSI ici, avec la même sémantique que
//     la doctrine (le chargeur lit `student_goals` lui-même);
//   * un `excluded` de coach ne se formule JAMAIS comme un risque vital;
//   * une lecture ratée rend un bloc vide, elle n'interrompt pas la génération.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  loadPublishedProtocol,
  protocolBlockFor,
} from "./protocol_loader.ts";

type Outcome = { data?: unknown; error?: unknown; throws?: boolean };

/**
 * Le faux client. Deux formes de chaîne coexistent chez le vrai:
 *   .select(c).eq(a,b)[.eq].limit(n).maybeSingle()   — une ligne
 *   .select(c).eq(a,b)                               — une liste, awaitée
 */
function fakeDb(byTable: Record<string, Outcome>) {
  const chain = (table: string) => {
    const outcome = byTable[table] ?? { data: null };
    const settle = () => {
      if (outcome.throws) throw new Error("connection reset");
      return { data: outcome.data ?? null, error: outcome.error ?? null };
    };
    const node: Record<string, unknown> = {
      eq: () => node,
      limit: () => node,
      maybeSingle: () => Promise.resolve(settle()),
      // Awaiter la chaîne sans `.maybeSingle()` rend la liste.
      then: (resolve: (v: unknown) => void) => Promise.resolve(settle()).then(resolve),
    };
    return node;
  };
  return { from: (table: string) => ({ select: () => chain(table) }) };
}

const LINKED = {
  coach_clients: { data: { coach_id: "coach-1" } },
  coach_protocols: { data: { id: "proto-1", content_locale: "en" } },
};

const FOOD_RULES = [
  { food_group_ref: "leafy_greens", stance: "encouraged", goal_scope: [], rationale: "volume" },
  { food_group_ref: "sugar_sweets", stance: "discouraged", goal_scope: [], rationale: null },
  { food_group_ref: "alcohol", stance: "excluded", goal_scope: [], rationale: null },
  // Ciblée: elle ne doit atteindre qu'un élève en perte de gras.
  {
    food_group_ref: "refined_grain",
    stance: "discouraged",
    goal_scope: ["fat_loss"],
    rationale: null,
  },
];

const TIMING_RULES = [
  {
    template: "group_every_meal",
    food_group_ref: "lean_protein",
    goal_scope: [],
    rationale: "l'ancre",
  },
  {
    template: "no_group_after",
    food_group_ref: "coffee_tea",
    cutoff_local: "16:00:00",
    goal_scope: [],
    rationale: null,
  },
];

function db(over: Record<string, Outcome> = {}) {
  return fakeDb({
    ...LINKED,
    coach_food_rules: { data: FOOD_RULES },
    coach_timing_rules: { data: TIMING_RULES },
    coach_terms: { data: [{ term: "green stuff", food_group_ref: "leafy_greens" }] },
    ...over,
  });
}

// ===========================================================================

Deno.test("ce que le coach coche arrive dans le prompt du générateur", async () => {
  const loaded = await loadPublishedProtocol(
    db({ student_goals: { data: { goal: "health" } } }),
    "student-1",
  );
  assertEquals(loaded.reason, "loaded");
  assertEquals(loaded.coachId, "coach-1");
  assertEquals(loaded.protocolId, "proto-1");

  const block = protocolBlockFor(loaded, "Marlow");
  assert(block.includes("MARLOW'S FOOD MAPPING"), "le bloc porte le nom du coach");
  assert(block.includes("-- REACH FOR THESE FIRST --"));
  assert(block.includes("-- THIS COACH STEERS AWAY FROM THESE"));
  assert(block.includes("-- THIS COACH DOES NOT USE THESE"));
  assert(block.includes("-- THIS COACH'S RULES ON FREQUENCY AND TIMING --"));

  // Le MOT DU COACH porte le titre quand il en a posé un — c'est tout
  // l'intérêt de `coach_terms`, et ça se perdrait sans cette lecture.
  assert(block.includes("green stuff"), "le terme du coach doit primer sur le slug");
  assert(!block.includes("leafy_greens"), "le slug ne doit pas apparaître à côté du terme");

  // Le « pourquoi » du coach voyage: c'est ce qui permet d'expliquer.
  assert(block.includes("(volume)"));
  assert(block.includes("lean_protein — at every meal"));
  assert(block.includes("coffee_tea — not after 16:00"), block);
});

Deno.test("la portée par objectif s'applique au mapping comme à la doctrine", async () => {
  const health = await loadPublishedProtocol(
    db({ student_goals: { data: { goal: "health" } } }),
    "s",
  );
  const fatLoss = await loadPublishedProtocol(
    db({ student_goals: { data: { goal: "fat_loss" } } }),
    "s",
  );
  assertEquals(health.goal, "health");
  assertEquals(fatLoss.goal, "fat_loss");

  assert(!protocolBlockFor(health, "Marlow").includes("refined_grain"));
  assert(protocolBlockFor(fatLoss, "Marlow").includes("refined_grain"));
  // Le noyau atteint les deux.
  for (const l of [health, fatLoss]) {
    assert(protocolBlockFor(l, "Marlow").includes("green stuff"));
    assert(protocolBlockFor(l, "Marlow").includes("alcohol"));
  }
});

Deno.test("un élève sans objectif ne reçoit que les règles GLOBALES", async () => {
  const loaded = await loadPublishedProtocol(db({ student_goals: { data: null } }), "s");
  assertEquals(loaded.goal, null);
  const block = protocolBlockFor(loaded, "Marlow");
  assert(block.includes("green stuff"));
  assert(!block.includes("refined_grain"), "aucune règle ciblée pour qui n'a pas déclaré de but");
});

Deno.test("le mode test du coach choisit la variante du mapping", async () => {
  const loaded = await loadPublishedProtocol(
    db({ student_goals: { data: { goal: "health" } } }),
    "s",
    { goalOverride: "fat_loss" },
  );
  assertEquals(loaded.goal, "fat_loss");
  assert(protocolBlockFor(loaded, "Marlow").includes("refined_grain"));
});

Deno.test("⚠️ un `excluded` de coach ne se formule JAMAIS comme un risque vital", async () => {
  // La séparation méthode / sécurité est la garde la plus importante de tout ce
  // chemin. Une aversion de coach durcie en danger apprend au modèle à traiter
  // les deux registres pareil — et donc, tôt ou tard, l'inverse.
  const block = protocolBlockFor(
    await loadPublishedProtocol(db({ student_goals: { data: { goal: "health" } } }), "s"),
    "Marlow",
  );

  // L'ASSERTION PORTE SUR LES RÈGLES, PAS SUR LE PRÉAMBULE — et la nuance est
  // la même que celle qui fait vivre `forbidden_matcher.ts`: le préambule DIT
  // « not a medical restriction », donc un `includes("medical")` sur le bloc
  // entier mord sur la phrase qui dément exactement ce qu'il cherche. Une
  // garde qui ne distingue pas une négation d'une affirmation est une garde
  // qui se déclenche sur son propre démenti.
  const ruleLines = block
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .join("\n")
    .toLowerCase();
  assert(ruleLines.length > 0, "il doit y avoir des règles à examiner");
  for (const word of ["allergy", "allergic", "medical", "dangerous", "unsafe", "life-threatening"]) {
    assert(!ruleLines.includes(word), `aucune règle ne doit dire « ${word} »: ${ruleLines}`);
  }

  // Et le préambule, lui, DIT ce que le bloc est — plutôt que de laisser
  // deviner au modèle dans quel registre il lit.
  assert(block.includes("METHOD, not a medical restriction"));
  assert(block.includes("hard constraints arrive separately and always win"));
});

Deno.test("aucun protocole publié: bloc VIDE, jamais une invention", async () => {
  const loaded = await loadPublishedProtocol(
    db({ coach_protocols: { data: null }, student_goals: { data: { goal: "health" } } }),
    "s",
  );
  assertEquals(loaded.reason, "no_published_protocol");
  assertEquals(protocolBlockFor(loaded, "Marlow"), "");
});

Deno.test("un protocole publié mais VIDE ne se dit pas chargé", async () => {
  // Un en-tête sans rien dessous se lit comme « ce coach a un mapping, et il
  // est vide » — une affirmation différente de « il n'en a pas écrit ».
  const loaded = await loadPublishedProtocol(
    db({
      coach_food_rules: { data: [] },
      coach_timing_rules: { data: [] },
      student_goals: { data: { goal: "health" } },
    }),
    "s",
  );
  assertEquals(loaded.reason, "empty_protocol");
  assertEquals(protocolBlockFor(loaded, "Marlow"), "");
});

Deno.test("toutes les règles ciblées ailleurs: rien pour cet élève, et pas une erreur", async () => {
  const loaded = await loadPublishedProtocol(
    db({
      coach_food_rules: {
        data: [{
          food_group_ref: "refined_grain",
          stance: "discouraged",
          goal_scope: ["fat_loss"],
          rationale: null,
        }],
      },
      coach_timing_rules: { data: [] },
      student_goals: { data: { goal: "health" } },
    }),
    "s",
  );
  assertEquals(loaded.reason, "empty_protocol");
  assertEquals(protocolBlockFor(loaded, "Marlow"), "");
});

Deno.test("chaque lecture ratée dégrade en bloc vide, elle n'interrompt pas", async () => {
  const cases: Array<[string, Record<string, Outcome>, string]> = [
    ["pas de coach", { coach_clients: { data: null } }, "no_coach"],
    ["coach illisible", { coach_clients: { throws: true } }, "load_failed"],
    ["protocole illisible", { coach_protocols: { throws: true } }, "load_failed"],
    ["règles illisibles", { coach_food_rules: { throws: true } }, "load_failed"],
    ["termes illisibles", { coach_terms: { error: { message: "boom" } } }, "load_failed"],
  ];
  for (const [label, over, expected] of cases) {
    const loaded = await loadPublishedProtocol(
      db({ ...over, student_goals: { data: { goal: "health" } } }),
      "s",
    );
    assertEquals(loaded.reason, expected, label);
    assertEquals(protocolBlockFor(loaded, "Marlow"), "", label);
  }
});

Deno.test("un objectif illisible retombe sur les règles globales, sans interrompre", async () => {
  const loaded = await loadPublishedProtocol(db({ student_goals: { throws: true } }), "s");
  assertEquals(loaded.reason, "loaded");
  assertEquals(loaded.goal, null);
  assert(!protocolBlockFor(loaded, "Marlow").includes("refined_grain"));
});

Deno.test("un identifiant vide ne touche jamais la base", async () => {
  const loaded = await loadPublishedProtocol(db(), "   ");
  assertEquals(loaded.reason, "no_coach");
});

Deno.test("sans nom de coach, l'en-tête retombe sur la formule neutre", async () => {
  const loaded = await loadPublishedProtocol(
    db({ student_goals: { data: { goal: "health" } } }),
    "s",
  );
  assert(protocolBlockFor(loaded, null).includes("THE COACH'S FOOD MAPPING"));
  assert(protocolBlockFor(loaded, "   ").includes("THE COACH'S FOOD MAPPING"));
});
