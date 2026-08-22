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
import { ALLERGEN_SURFACE_FORMS } from "./allergen_surface_forms.ts";

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

// ── LES LIGATURES (lot S1, 2026-08-22) ─────────────────────────────────────
//
// MESURE AVANT, 2026-08-22 01:18:51 CEST, avant toute ligne de correctif :
//   « je suis allergique aux œufs »  ⇒ null          ← la graphie NORMALE
//   « je suis allergique aux oeufs » ⇒ egg/medical
// 0/6 ligature · 6/6 digramme · TOTAL 6/12. Sur un produit dont la locale par
// défaut est `fr-FR`, le plancher médical était donc muet sur l'orthographe
// que l'élève tape réellement, et retombait sur le tirage du dispatcher —
// c'est-à-dire sur le défaut EXACT que ce module existe pour fermer.
//
// ⚠️ Ces trois tests forment un trépied et se lisent ensemble : un qui MORD
// (la ligature), un qui NE MORD PAS (le message neutre — sans lui, une
// `normalize()` cassée bloquerait tout en ressemblant à une garde qui marche),
// et un BALAYAGE qui compte ses propres cas (un balayage vide est vert pour
// rien : c'est la cicatrice de `V0-B-bis`).

/** La graphie en digramme d'une chaîne à ligature. */
function digraphe(s: string): string {
  return s.replace(/œ/g, "oe").replace(/æ/g, "ae");
}

Deno.test("LIGATURE — les 6 formulations françaises mordent dans les DEUX graphies", () => {
  const formulations = [
    "je suis allergique aux œufs",
    "je suis sévèrement allergique aux œufs",
    "je suis allergique à l'œuf",
    "j'ai une allergie aux œufs",
    "je suis intolérant aux œufs",
    "j'ai une intolérance aux œufs",
  ];
  assertEquals(formulations.length, 6, "la grille doit porter ses 6 formulations");

  for (const ligature of formulations) {
    const digramme = digraphe(ligature);
    assert(
      ligature !== digramme,
      `cas dégénéré, la ligature a disparu du littéral: ${ligature}`,
    );

    const hitLig = detectDeclaredSafetyConstraint(ligature);
    assert(hitLig, `doit mordre sous ligature: ${ligature}`);
    assertEquals(hitLig!.allergen_ref, "egg", ligature);

    // ⚠️ AUCUNE RÉGRESSION SUR LE DIGRAMME: c'est la moitié qui marchait déjà.
    const hitDig = detectDeclaredSafetyConstraint(digramme);
    assert(hitDig, `doit mordre sous digramme: ${digramme}`);
    assertEquals(hitDig!.allergen_ref, "egg", digramme);

    // Et les deux graphies rendent le MÊME verdict, sévérité comprise.
    assertEquals(hitLig!.kind, hitDig!.kind, ligature);
    assertEquals(hitLig!.severity, hitDig!.severity, ligature);
  }
});

Deno.test("LIGATURE — BALAYAGE: toute forme de surface concernée du catalogue est couverte", () => {
  // MESURÉ le 2026-08-22: le catalogue ne porte AUCUNE ligature littérale.
  // Ce qu'il porte, ce sont des DIGRAMMES qu'un élève francophone écrit
  // normalement avec une ligature — aujourd'hui « oeuf », listé sous `egg` ET
  // sous `eggs`, et rien d'autre sur 100 formes distinctes.
  //
  // Le balayage est écrit sur le CATALOGUE et non sur une liste recopiée: le
  // jour où quelqu'un ajoute « soeur », « caecum » ou « nævus », il entre ici
  // tout seul, et ce test rougit s'il n'est pas couvert.
  const concernees: Array<{ ref: string; form: string }> = [];
  for (const [ref, forms] of Object.entries(ALLERGEN_SURFACE_FORMS)) {
    for (const form of forms) {
      if (/(oe|ae)/.test(form.toLowerCase()) || /[œæ]/.test(form)) {
        concernees.push({ ref, form });
      }
    }
  }

  // ⛔ L'ASSERTION DE CARDINALITÉ, et elle n'est pas décorative: une boucle
  // sur zéro cas est verte sans rien avoir prouvé.
  assert(
    concernees.length >= 1,
    "balayage vide — un balayage qui ne couvre rien n'est pas une preuve",
  );

  for (const { ref, form } of concernees) {
    const ligature = form.replace(/oe/g, "œ").replace(/ae/g, "æ");
    assert(ligature !== form, `${ref}: aucune ligature à produire pour ${form}`);

    const hitLig = detectDeclaredSafetyConstraint(`je suis allergique aux ${ligature}`);
    const hitDig = detectDeclaredSafetyConstraint(`je suis allergique aux ${form}`);

    // Le critère est l'ÉQUIVALENCE des deux graphies, pas « rend ce ref »:
    // « oeuf » est listé sous deux clés et l'index n'en résout qu'une.
    assert(hitDig, `${ref}: le digramme ${form} ne mord pas — prémisse cassée`);
    assert(hitLig, `${ref}: la ligature ${ligature} ne mord pas`);
    assertEquals(hitLig!.allergen_ref, hitDig!.allergen_ref, form);
    assertEquals(hitLig!.matched, hitDig!.matched, form);
  }
});

Deno.test("LIGATURE — LE CAS QUI PASSE: le dépliage n'ouvre aucune porte", () => {
  // Sans ces cas, une `normalize()` cassée — qui ferait mordre tout — aurait
  // exactement la tête d'une garde qui marche.
  for (
    const message of [
      // Le témoin nommé par la fiche du lot.
      "jaime bien les pates",
      // Une ligature dans une phrase qui ne déclare rien.
      "j'ai mangé des œufs à midi",
      // Les conditions de désarmement tiennent SOUS ligature. Avant le
      // correctif elles rendaient `null` pour la mauvaise raison — le terme ne
      // se résolvait pas ; maintenant c'est bien le désarmement qui parle.
      "je ne suis pas allergique aux œufs",
      "mon fils est allergique aux œufs",
      "est ce que je suis allergique aux œufs ?",
      // R7 — la ligature ne doit pas inventer un slug: « nœud » se déplie en
      // « noeud », qui n'est dans aucune table.
      "je suis allergique aux nœuds papillon",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${message}`,
    );
  }
});

Deno.test("LIGATURE — æ est déplié par SYMÉTRIE, et n'a aucune cible aujourd'hui", () => {
  // ⛔ CE TEST DIT UNE ABSENCE, et il faut le lire comme tel: le dépliage
  // `æ → ae` de `safety_constraint_floor.ts` n'est exercé de bout en bout par
  // AUCUN allergène — zéro forme de surface du catalogue ne contient « ae ».
  // Il est posé parce que le module frère `allergen_catalog.ts` le porte, et
  // que deux normalisations qui divergent sont exactement ce que ce lot vient
  // de payer. Le jour où une forme en « ae » entre au catalogue, le BALAYAGE
  // ci-dessus la prend automatiquement — et ce test-ci rougit pour prévenir
  // que l'affirmation d'absence a cessé d'être vraie.
  const avecAe = Object.entries(ALLERGEN_SURFACE_FORMS)
    .flatMap(([ref, forms]) => forms.map((form) => ({ ref, form })))
    .filter(({ form }) => /ae/.test(form.toLowerCase()) || /æ/.test(form));
  assertEquals(
    avecAe.map(({ ref, form }) => `${ref}:${form}`),
    [],
    "une forme en « ae » est apparue — vérifier qu'elle est couverte sous « æ »",
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

// ═══════════════════════════════════════════════════════════════════════════
// LOT `S1b` (2026-08-22) — L'INTAKE : LE MOT DE LA CATÉGORIE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ MESURÉ AVANT LA PREMIÈRE LIGNE DE CORRECTIF, le 2026-08-22:
//
//     « je suis allergique aux fruits de mer » -> null
//     « I'm allergic to seafood »              -> null
//     « I'm allergic to shellfish »            -> shellfish
//     « je suis allergique aux crustaces »     -> shellfish
//
// Le plancher lit `ALLERGEN_SURFACE_FORMS`, et cette table portait neuf
// ANIMAUX (« prawn », « crab », « moule »…) sans aucun des deux mots
// COLLECTIFS sous lesquels une personne DÉCLARE cette allergie. La graphie
// n'était pas en cause — contrairement à `S1`, où la ligature l'était: ici la
// phrase est en ASCII pur des deux côtés, et c'est le VOCABULAIRE qui manquait.
//
// C'est la moitié « intake » du lot. La moitié « sortie » est dans
// `allergen_catalog_test.ts`, sur la ceinture.

Deno.test("S1b — « fruits de mer » et « seafood » déclenchent le plancher", () => {
  const attendu: ReadonlyArray<readonly [string, "allergy" | "intolerance"]> = [
    ["je suis allergique aux fruits de mer", "allergy"],
    ["j'ai une allergie aux fruits de mer", "allergy"],
    ["je suis intolérante aux fruits de mer", "intolerance"],
    ["I'm allergic to seafood", "allergy"],
    ["I have a seafood allergy", "allergy"],
  ];
  for (const [message, kind] of attendu) {
    const hit = detectDeclaredSafetyConstraint(message);
    assert(hit, `doit mordre: ${JSON.stringify(message)}`);
    assertEquals(
      hit!.allergen_ref,
      "shellfish",
      `${JSON.stringify(message)} doit se ramener sur le jeton du catalogue`,
    );
    assertEquals(hit!.kind, kind);
    // R7 tenu: c'est bien le jeton CATALOGUÉ qui sort, pas un slug inventé à
    // partir des mots de la personne.
    assertEquals(hit!.severity, kind === "allergy" ? "medical" : "strict");
  }
});

Deno.test("S1b — le mot du danger ne mord pas hors d'une déclaration", () => {
  // ⛔ LE CAS QUI PASSE, et il est indispensable: sans lui, un plancher devenu
  // « tout mord » serait vert sur le test du dessus. Chacun de ces messages
  // contient le mot ajouté par ce lot, et aucun ne déclare une allergie.
  for (
    const message of [
      "on a mangé des fruits de mer hier soir",
      "I had a seafood platter yesterday",
      "am I allergic to seafood?",
      "je ne suis pas allergique aux fruits de mer",
      "my son is allergic to seafood",
    ]
  ) {
    assertEquals(
      detectDeclaredSafetyConstraint(message),
      null,
      `ne doit PAS mordre: ${JSON.stringify(message)}`,
    );
  }
});
