// KEEL — la ceinture de STRUCTURE, testée avec son cas qui passe.
//
// Elle vient du plan réel A06-r2 (2026-09-05): un ingrédient `œufs` portant
// `group = "eggs"`, servi à un allergique médical, avec une ceinture de texte
// aveugle à la ligature. Le correctif de texte vit dans `forbidden_matcher.ts`;
// ici on éprouve l'autre moitié, celle que l'orthographe ne peut pas tromper.

import { assertEquals } from "jsr:@std/assert@1";

import {
  allergenGroupViolations,
  foodGroupsCoveredBy,
  groupedIngredientCount,
} from "./allergen_food_groups.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

function constraint(
  over: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "egg",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    severity: "medical",
    ...over,
  } as unknown as StudentSafetyConstraint;
}

const EGG_DISH = {
  title: "Raviolis aux champignons",
  ingredients: [
    { term: "farine", group: "refined_grain" },
    { term: "œufs", group: "eggs" },
  ],
};
const SAFE_DISH = {
  title: "Tofu, riz et courgettes",
  ingredients: [
    { term: "tofu", group: "tofu_tempeh" },
    { term: "riz", group: "whole_grain" },
  ],
};

Deno.test("STRUCTURE ① le groupe déclaré mord là où la graphie échappait", () => {
  const bites = allergenGroupViolations([EGG_DISH], [constraint()]);
  assertEquals(bites.length, 1);
  assertEquals(bites[0].foodGroup, "eggs");
  assertEquals(bites[0].allergenRef, "egg");
  assertEquals(bites[0].term, "œufs");
  assertEquals(bites[0].bearer, "Raviolis aux champignons");
});

Deno.test("STRUCTURE ② LE CAS QUI PASSE: un plat sans le groupe ne dit rien", () => {
  assertEquals(allergenGroupViolations([SAFE_DISH], [constraint()]).length, 0);
  // Et le dénominateur prouve que la ceinture a bien REGARDÉ.
  assertEquals(groupedIngredientCount([SAFE_DISH]), 2);
});

Deno.test("STRUCTURE ③ une préférence ne bloque pas, une sévérité bloquante oui", () => {
  assertEquals(
    allergenGroupViolations([EGG_DISH], [constraint({ severity: "preference" })])
      .length,
    0,
  );
  assertEquals(
    allergenGroupViolations([EGG_DISH], [constraint({ severity: "strict" })])
      .length,
    1,
  );
});

Deno.test("STRUCTURE ④ un slug que la table ne connaît pas fait s'abstenir", () => {
  assertEquals(foodGroupsCoveredBy("carmine"), null);
  assertEquals(
    allergenGroupViolations([EGG_DISH], [constraint({ allergenRef: "carmine" })])
      .length,
    0,
  );
  // Une contrainte qui nomme DÉJÀ un groupe est résolvable telle quelle.
  assertEquals(foodGroupsCoveredBy("eggs"), ["eggs"]);
});

Deno.test("STRUCTURE ⑤ un ingrédient sans groupe est invisible, et c'est dit", () => {
  const noGroup = {
    title: "Omelette",
    ingredients: [{ term: "œufs" }, { term: "beurre", group: null }],
  };
  assertEquals(allergenGroupViolations([noGroup], [constraint()]).length, 0);
  assertEquals(groupedIngredientCount([noGroup]), 0);
});

Deno.test("STRUCTURE ⑥ la graphie snake_case du parseur est lue aussi", () => {
  const snake = {
    title: "Flan",
    ingredients: [{ term: "oeufs", food_group: "eggs" }],
  };
  assertEquals(allergenGroupViolations([snake], [constraint()]).length, 1);
});

Deno.test("STRUCTURE ⑦ une occurrence est une morsure, pas deux", () => {
  const twice = {
    title: "Quiche",
    ingredients: [
      { term: "œufs", group: "eggs" },
      { term: "œufs", group: "eggs" },
      { term: "crème", group: "dairy_cheese" },
    ],
  };
  assertEquals(allergenGroupViolations([twice], [constraint()]).length, 1);
  // Deux contraintes distinctes sur le même plat restent deux constats.
  const both = allergenGroupViolations([twice], [
    constraint(),
    constraint({ id: "c2", allergenRef: "dairy" }),
  ]);
  assertEquals(both.length, 2);
});

Deno.test("STRUCTURE ⑧ la table couvre les groupes du lait et des fruits à coque", () => {
  assertEquals(foodGroupsCoveredBy("milk"), ["dairy_yogurt", "dairy_cheese"]);
  assertEquals(foodGroupsCoveredBy("peanut"), ["nuts_seeds"]);
  assertEquals(foodGroupsCoveredBy(""), null);
});


// ── LE CAS QUI A TUÉ LE PREMIER RUN RÉEL (V1, 2026-09-06) ──────────────────
//
// Foyer de cinq, une allergie `peanut`. Le modèle a écrit `nuts_seeds` sur des
// graines de courge et des noix; la ceinture, câblée sur la table de
// CONTENANCE, a refusé le plan entier (`draft_not_composed`, zéro plat). Une
// graine de courge n'est pas une arachide, et le groupe ne les distingue pas:
// c'est au mot de trancher, donc à la garde de TEXTE.

Deno.test("STRUCTURE ⑨ `nuts_seeds` n'implique pas l'arachide — le plan vit", () => {
  const seeds = {
    title: "Flocons d'avoine, yaourt, poire et graines",
    ingredients: [
      { term: "graines de courge", group: "nuts_seeds" },
      { term: "noix", group: "nuts_seeds" },
    ],
  };
  const peanut = constraint({ id: "cp", allergenRef: "peanut" });
  assertEquals(allergenGroupViolations([seeds], [peanut]).length, 0);
  // Et la table de CONTENANCE, elle, continue de répondre oui — c'est son
  // travail, pour une autre question (la substitution).
  assertEquals(foodGroupsCoveredBy("peanut"), ["nuts_seeds"]);
});

Deno.test("STRUCTURE ⑩ une céréale n'implique pas le gluten", () => {
  const rice = {
    title: "Riz, tofu et courgettes",
    ingredients: [{ term: "riz", group: "whole_grain" }],
  };
  assertEquals(
    allergenGroupViolations([rice], [constraint({ id: "cg", allergenRef: "gluten" })])
      .length,
    0,
  );
});

Deno.test("STRUCTURE ⑪ les implications VRAIES mordent toujours", () => {
  const cases: [string, string, string][] = [
    ["eggs", "egg", "œufs"],
    ["dairy_cheese", "milk", "fromage"],
    ["white_fish", "fish", "colin"],
    ["shellfish", "crustacean", "crevettes"],
    ["tofu_tempeh", "soy", "tofu"],
    ["legumes", "legume", "lentilles"],
  ];
  for (const [group, ref, term] of cases) {
    const bites = allergenGroupViolations(
      [{ title: "Plat", ingredients: [{ term, group }] }],
      [constraint({ id: "c", allergenRef: ref })],
    );
    assertEquals(bites.length, 1, `${group} devrait impliquer ${ref}`);
    assertEquals(bites[0].foodGroup, group);
  }
});
