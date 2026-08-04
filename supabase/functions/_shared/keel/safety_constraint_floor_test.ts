/**
 * Le plancher de déclaration d'allergie, dans les DEUX directions.
 *
 * Le rouge d'origine (QA WEB L3, run réel): « I'm allergic to peanuts, badly »
 * → accusé « I'll treat peanuts as a hard avoid going forward », et
 * `student_safety_constraints` vide. Le même message en français avait, lui,
 * écrit la ligne — donc un tirage, pas une panne.
 *
 * Une garde qu'on n'a pas vue mordre est une garde qu'on croit sur parole ; une
 * garde qu'on n'a pas vue LÂCHER est une garde qui mordra un innocent. Les deux
 * sont ici.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectDeclaredSafetyConstraint } from "./safety_constraint_floor.ts";

Deno.test("le message EXACT du run réel déclenche le plancher", () => {
  const hit = detectDeclaredSafetyConstraint("I'm allergic to peanuts, badly");
  assert(hit, "le message qui a produit un accusé fantôme doit mordre");
  assertEquals(hit!.allergen_ref, "peanut");
  assertEquals(hit!.kind, "allergy");
  assertEquals(hit!.severity, "medical");
  assertEquals(hit!.notes, "I'm allergic to peanuts, badly");
});

Deno.test("la même déclaration en français mord pareil", () => {
  // Défaut connu de ce dépôt: une garde testée dans une seule langue passe par
  // accident de grammaire.
  for (
    const message of [
      "je suis très allergique aux arachides",
      "je suis allergique à l arachide",
      "j'ai une allergie aux arachides",
    ]
  ) {
    const hit = detectDeclaredSafetyConstraint(message);
    assert(hit, `doit mordre: ${message}`);
    assertEquals(hit!.allergen_ref, "peanut");
  }
});

Deno.test("les autres formulations anglaises courantes", () => {
  for (
    const [message, ref] of [
      ["I have a severe peanut allergy", "peanut"],
      ["my gluten allergy makes eating out hard", "gluten"],
      ["I'm lactose intolerant", "lactose"],
      ["I have a soy intolerance", "soy"],
      ["im allergic to shellfish", "shellfish"],
    ] as const
  ) {
    const hit = detectDeclaredSafetyConstraint(message);
    assert(hit, `doit mordre: ${message}`);
    assertEquals(hit!.allergen_ref, ref, message);
  }
});

Deno.test("une intolérance n'est pas classée médicale", () => {
  const hit = detectDeclaredSafetyConstraint("I'm lactose intolerant");
  assertEquals(hit!.kind, "intolerance");
  // `medical` est la seule sévérité qui fait mordre la ceinture de sortie.
  // Une intolérance est tenue, pas urgente.
  assertEquals(hit!.severity, "strict");
});

Deno.test("le terme le plus LONG gagne — « tree nut » n'est pas « nut »", () => {
  const hit = detectDeclaredSafetyConstraint("I'm allergic to tree nuts");
  assertEquals(hit!.allergen_ref, "tree_nut");
});

Deno.test("CONDITION DE DÉSARMEMENT — la négation ne déclare rien", () => {
  for (
    const message of [
      "I'm not allergic to peanuts, don't worry",
      "je ne suis pas allergique aux arachides",
      "je ne suis plus allergique aux arachides",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${message}`,
    );
  }
});

Deno.test("CONDITION DE DÉSARMEMENT — l'allergie de quelqu'un d'autre", () => {
  for (
    const message of [
      "my son is allergic to peanuts so I cook without them",
      "mon fils est allergique aux arachides",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${message}`,
    );
  }
});

Deno.test("CONDITION DE DÉSARMEMENT — une question n'est pas une déclaration", () => {
  for (
    const message of [
      "am I allergic to peanuts if they make my mouth itch?",
      "what is a peanut allergy exactly?",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${message}`,
    );
  }
});

Deno.test("R7 — un allergène hors de la table fermée n'invente pas de slug", () => {
  // « kiwi » n'est pas dans `ALLERGEN_SURFACE_FORMS`. Le plancher se tait et
  // laisse le dispatcher juger, plutôt que de rapprocher du plus proche.
  assertEquals(
    detectDeclaredSafetyConstraint("I'm allergic to kiwi"),
    null,
  );
});

Deno.test("un message ordinaire ne déclenche jamais le plancher", () => {
  for (
    const message of [
      "I had eggs and rice for lunch",
      "what am I supposed to eat tonight?",
      "j'ai craqué sur une pizza hier soir",
      "",
      "   ",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${JSON.stringify(message)}`,
    );
  }
});
