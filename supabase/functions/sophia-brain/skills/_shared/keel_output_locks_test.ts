// PIVOT NUTRITION — keel_output_locks.ts.
//
// The test that carries the finding this module exists for:
//   * "the medical guarantee applies to EVERY visible text, not one skill"
//     -- CONTRACT states it globally; before this belt it lived in
//        plan_question/renderer.ts alone.
//
// And the one that keeps it shippable:
//   * "a coeliac plan made of gluten-free items is not rejected every turn"
//     -- a belt that rejects legitimate turns gets switched off.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyKeelOutputLocks,
  DOCTRINE_BLOCK_FALLBACK_EN,
  MEDICAL_BLOCK_FALLBACK_EN,
  resolveDoctrineReplacement,
} from "./keel_output_locks.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

// `foods` est REQUIS par `Pick<CoachDoctrine, "forbidden" | "foods">` depuis
// que la doctrine porte les aliments (migration 20260804100000). Les deux
// fixtures ci-dessous ne le déclaraient pas: 1 erreur TS2741 qui empêchait
// TOUTE la suite `sophia-brain/` de tourner — elle échouait au typecheck avant
// d'exécuter un seul test. Vide et non `null`: ces cas testent le verrou des
// INTERDITS, pas celui des aliments.
const NO_FOODS = { recommended: [], discouraged: [] } as const;

const DOCTRINE = {
  foods: NO_FOODS,
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["6 petits repas", "six small meals"],
      reason: "it breaks the fasting window",
    },
  ],
};

function run(text: string, over: Record<string, unknown> = {}) {
  return applyKeelOutputLocks({
    text,
    isKeelStudent: true,
    safetyConstraints: [constraint()],
    doctrine: DOCTRINE,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// THE FINDING
// ---------------------------------------------------------------------------

Deno.test("the medical guarantee applies to EVERY visible text, not one skill", () => {
  const result = run("Add a spoon of peanut butter to your morning oats.");
  assertEquals(result.reason, "blocked_medical_constraint");
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
  assertEquals(result.tokens, ["peanut"]);
});

Deno.test("the whole message is replaced, never trimmed of one sentence", () => {
  // A text amputated of its dangerous sentence is still a text that was
  // talking about peanuts to an anaphylactic student, and the surviving
  // context can carry the suggestion on its own.
  const result = run(
    "Great week! Add a spoon of peanut butter to your oats - it is a good protein source and you need more of those.",
  );
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
  assert(!result.text.includes("protein source"));
});

Deno.test("the fallback does NOT name the allergen back to the student", () => {
  // Naming it makes the incident visible and anxiogenic for zero benefit.
  const result = run("Have some peanut butter.");
  assert(!/peanut/i.test(result.text));
});

// ---------------------------------------------------------------------------
// The doctrine lock, and the precedence between the two
// ---------------------------------------------------------------------------

Deno.test("an endorsed coach interdit is replaced, and never sends the student away", () => {
  const result = run("Try 6 petits repas spread through the day.");
  assertEquals(result.reason, "blocked_coach_interdit");
  assertEquals(result.text, DOCTRINE_BLOCK_FALLBACK_EN);
  assertEquals(result.tokens, ["six_small_meals"]);
  // Le produit est une MASTERCLASSE: il n'y a pas de canal un-à-un vers le
  // coach. Renvoyer l'élève « demander à son coach » désigne une porte qui
  // n'existe pas, et c'est l'inverse de ce que le coach achète.
  assert(!/ask (them|your coach)/i.test(result.text));
});

// ---------------------------------------------------------------------------
// C2 — LE COACH RÉPOND À TRAVERS NOUS
// ---------------------------------------------------------------------------

const DOCTRINE_WITH_INSTEAD = {
  foods: NO_FOODS,
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["6 petits repas", "six small meals"],
      reason: "it breaks the fasting window",
      instead: "Three meals you actually finish. Grazing hides how much you eat.",
    },
  ],
};

Deno.test("when the coach said what he does INSTEAD, those are the words the student gets", () => {
  const result = run("Try 6 petits repas spread through the day.", {
    doctrine: DOCTRINE_WITH_INSTEAD,
  });
  assertEquals(result.reason, "blocked_coach_interdit");
  assertEquals(result.text, "Three meals you actually finish. Grazing hides how much you eat.");
});

Deno.test("a coach replacement that names a hard constraint is NOT served", () => {
  // LE PIÈGE: le texte du coach est injecté APRÈS les verrous. Sans
  // re-vérification, un `instead` malheureux contourne le verrou médical par
  // la sortie de secours du verrou de doctrine.
  const unsafe = resolveDoctrineReplacement(
    ["six_small_meals"],
    [{
      token: "six_small_meals",
      surfaceForms: [],
      reason: null,
      instead: "Three real meals, with peanut butter at breakfast.",
    }],
    [constraint()],
  );
  assertEquals(unsafe.usedCoachWords, false);
  assertEquals(unsafe.text, DOCTRINE_BLOCK_FALLBACK_EN);
  assert(!/peanut/i.test(unsafe.text));
});

Deno.test("the same replacement IS served to a student without that constraint", () => {
  // Contre-épreuve: sans elle, le test précédent passerait même si la fonction
  // refusait tous les `instead` du monde.
  const ok = resolveDoctrineReplacement(
    ["six_small_meals"],
    [{
      token: "six_small_meals",
      surfaceForms: [],
      reason: null,
      instead: "Three real meals, with peanut butter at breakfast.",
    }],
    [],
  );
  assertEquals(ok.usedCoachWords, true);
  assert(/peanut/i.test(ok.text));
});

Deno.test("the medical fallback points at a doctor, never at the coach", () => {
  // Un coach sportif n'est pas la bonne adresse pour une allergie, et le canal
  // n'existe de toute façon pas.
  assert(!/coach/i.test(MEDICAL_BLOCK_FALLBACK_EN));
  assert(/doctor/i.test(MEDICAL_BLOCK_FALLBACK_EN));
});

Deno.test("medical outranks doctrine when a text violates both", () => {
  // The most protective fallback must win, always.
  const result = run("Have peanut butter across 6 petits repas.");
  assertEquals(result.reason, "blocked_medical_constraint");
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
});

// ---------------------------------------------------------------------------
// DISARM CONDITIONS — the half that keeps the belt alive
// ---------------------------------------------------------------------------

Deno.test("a coeliac plan made of gluten-free items is not rejected every turn", () => {
  // SCHEMA.md acceptance fixture 3. Negated mentions pass, via the shared
  // matcher. Without this the belt rejects every legitimate turn and gets
  // switched off within a week.
  const glutenFree = applyKeelOutputLocks({
    text: "Your breakfast is gluten-free oats with berries. Avoid any gluten today.",
    isKeelStudent: true,
    safetyConstraints: [constraint({ allergenRef: "gluten" })],
    doctrine: null,
  });
  assertEquals(glutenFree.reason, "clean");
});

Deno.test("the agent may still EXPLAIN what the coach forbids", () => {
  const result = run("Marc ne fait pas de 6 petits repas, il tient la fenêtre.");
  assertEquals(result.reason, "clean");
});

Deno.test("the agent may EXPLAIN in ENGLISH — the language the product ships in", () => {
  // Le test ci-dessus existait seul, en français, et il passait pour une raison
  // qui ne s'exporte pas: la négation française est PRÉ-nominale (« pas DE 6
  // petits repas ») et tombe contre l'objet. L'anglaise est PRÉ-verbale
  // (« doesn't DO six small meals ») et ne l'atteignait jamais.
  //
  // L'élève qui demandait « pourquoi pas 6 petits repas ? » recevait donc, à la
  // place de la réponse, le `instead` du coach — un non-sequitur. Une ceinture
  // qui casse la conversation quand elle FONCTIONNE est une ceinture qu'on
  // débranche, exactement comme celle qui rejette le plan du cœliaque.
  for (
    const explanation of [
      "Your coach doesn't do six small meals - here is why.",
      "Your coach does not do six small meals.",
      "We don't do six small meals here.",
      "Your coach won't put you on six small meals.",
      "Rather than six small meals, he keeps three.",
    ]
  ) {
    assertEquals(run(explanation).reason, "clean", explanation);
  }
});

Deno.test("an endorsement spread over TWO sentences is still an endorsement", () => {
  // Le verrou ne raisonne pas par phrase: il scanne le texte entier. Une
  // suggestion posée en deux temps — l'adhésion d'abord, l'interdit ensuite —
  // ne doit pas passer entre les deux.
  const result = run(
    "Some people thrive on grazing. You could try six small meals through the day.",
  );
  assertEquals(result.reason, "blocked_coach_interdit");
  assertEquals(result.tokens, ["six_small_meals"]);
});

Deno.test("a negation aimed at something ELSE never blanches the sentence", () => {
  // La condition de désarmement de la négation porte SA condition: elle ne
  // s'applique que si la négation court jusqu'au token. Sinon toute réponse
  // contenant un « don't » quelque part deviendrait une passe libre.
  const doctrineDodge = run("Don't skip breakfast, have six small meals.");
  assertEquals(doctrineDodge.reason, "blocked_coach_interdit");

  const medicalDodge = run(
    "No peanuts at breakfast, but peanut butter at lunch is fine.",
  );
  assertEquals(medicalDodge.reason, "blocked_medical_constraint");
  assertEquals(medicalDodge.text, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("a protective negation about the allergen reaches the student intact", () => {
  // Symétrique du cas doctrine: dire « évite les cacahuètes » est le verrou qui
  // FONCTIONNE. Le remplacer par « pose la question à un médecin » retire à
  // l'élève l'avertissement qu'il avait déjà.
  for (
    const protective of [
      "Avoid peanuts, they're dangerous for you.",
      "Avoid the peanuts in that sauce.",
      "You can't have peanuts.",
      "Look for a peanut-free label.",
    ]
  ) {
    const result = run(protective);
    assertEquals(result.reason, "clean", protective);
    assertEquals(result.text, protective);
  }
});

Deno.test("disarmed outside a KEEL student turn", () => {
  const result = run("Add a spoon of peanut butter.", { isKeelStudent: false });
  assertEquals(result.reason, "disarmed_not_keel_student");
  assert(result.text.includes("peanut butter"));
});

Deno.test("disarmed with no constraints and no doctrine", () => {
  const result = run("Anything at all.", {
    safetyConstraints: [],
    doctrine: null,
  });
  assertEquals(result.reason, "disarmed_no_constraints");
});

Deno.test("disarmed on empty text", () => {
  assertEquals(applyKeelOutputLocks({ text: "  ", isKeelStudent: true }).reason, "disarmed_empty_text");
});

Deno.test("a non-medical severity does not block", () => {
  // Only severity='medical' rejects. A 'preference' dislike must not silence
  // the agent.
  const result = run("Some peanut butter?", {
    safetyConstraints: [constraint({ severity: "preference" })],
    doctrine: null,
  });
  assertEquals(result.reason, "clean");
});

Deno.test("a clean message passes through byte-for-byte", () => {
  const text = "Nice plate - that is exactly what Marc asks for this week.";
  const result = run(text);
  assertEquals(result.reason, "clean");
  assertEquals(result.text, text);
});

// ---------------------------------------------------------------------------
// QA agent 4 — CONDITION DE DÉSARMEMENT n°5: le tour de rétractation.
// ---------------------------------------------------------------------------

Deno.test("désarmement n°5 — la contrainte que CE tour retire ne piège plus l'élève", () => {
  const peanut = {
    id: "c1",
    userId: "u1",
    kind: "allergy" as const,
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    severity: "medical" as const,
    declaredBy: "student" as const,
    notes: null,
    contentLocale: "en-GB",
  };
  // Formulation choisie exprès SANS « peanut allergy »: cette collocation est
  // déjà blanchie par `NEGATION_AFTER` (déclarer une allergie n'est pas la
  // recommander). Le piège réel se referme sur l'accusé qui dit ce que la
  // rétractation AUTORISE — et c'est la phrase la plus naturelle à écrire.
  const ack = "Understood - that's off your record now, so peanuts are fine for you.";

  // AVANT: la ceinture voyait un token médical et remplaçait tout le message.
  // Chaque nouvelle tentative de correction renommait l'allergène et
  // redéclenchait le remplacement: l'élève ne pouvait jamais corriger.
  const trapped = applyKeelOutputLocks({
    text: ack,
    isKeelStudent: true,
    safetyConstraints: [peanut],
    doctrine: null,
  });
  assertEquals(trapped.reason, "blocked_medical_constraint");

  // APRÈS: le tour porte la rétractation, la ceinture se désarme POUR CE
  // TOKEN, et l'accusé passe.
  const freed = applyKeelOutputLocks({
    text: ack,
    isKeelStudent: true,
    safetyConstraints: [peanut],
    doctrine: null,
    retractedConstraintRefs: ["peanut"],
  });
  // La contrainte retirée sort de la liste; comme c'était la seule, la ceinture
  // se déclare désarmée faute de matière. Ce qui compte est l'invariant de
  // sortie: le TEXTE est intact, l'élève reçoit son accusé.
  assertEquals(freed.text, ack);
  assertEquals(freed.reason.startsWith("disarmed"), true, freed.reason);
});

Deno.test("désarmement n°5 — retirer UNE contrainte n'ouvre pas la porte aux autres", () => {
  // La portée est le point: sans elle, un tour de rétractation deviendrait une
  // fenêtre où TOUTES les contraintes de l'élève sont muettes.
  const base = {
    userId: "u1",
    substanceRef: null,
    medicationClass: null,
    severity: "medical" as const,
    declaredBy: "student" as const,
    notes: null,
    contentLocale: "en-GB",
  };
  const constraints = [
    { ...base, id: "c1", kind: "allergy" as const, allergenRef: "peanut" },
    { ...base, id: "c2", kind: "allergy" as const, allergenRef: "sesame" },
  ];
  const result = applyKeelOutputLocks({
    text: "I've removed the peanut note. Tahini on toast is a good snack.",
    isKeelStudent: true,
    safetyConstraints: constraints,
    doctrine: null,
    retractedConstraintRefs: ["peanut"],
  });
  // `tahini` est une forme de surface de `sesame`, qui n'est PAS retiré.
  assertEquals(result.reason, "blocked_medical_constraint");
});
