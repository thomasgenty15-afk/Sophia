// FF-001 — la classification: daily_practices_classify.ts.
//
// LE TEST QUI PORTE LA DÉCISION PRODUIT, et c'est le rabbit hole que FF-001
// nomme en premier:
//
//   * "le classifieur propose, il n'arbitre pas" (R8)
//     -- un modèle à qui on montre « jeûne jusqu'à midi » a des choses à en
//        dire, et elles ont l'air raisonnables. Elles ne le sont pas ici: ce
//        produit vend la méthode du coach, pas la nôtre. Sans cette frontière on
//        aura reconstruit un avis maison déguisé en analyse.
//
// La frontière est tenue par la STRUCTURE et pas par une consigne: le modèle ne
// rend pas `status` (il n'y a pas de champ pour refuser), et `collides_with` est
// validé contre une liste fermée de quatre ceintures du produit.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildPracticeClassifyPrompt,
  dailyPracticeToRow,
  parseClassifiedPractice,
  PRACTICE_CLASSIFY_SYSTEM_PROMPT,
  unclassifiedPractice,
} from "./daily_practices_classify.ts";
import { parseDailyPractices } from "./daily_practices.ts";

/** Une sortie de modèle bien formée. */
function output(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "hydration",
    quantified: true,
    target: 4,
    unit: "glasses",
    goal_scope: [],
    cadence: "rotating",
    askable: true,
    minor_safe: true,
    brief: "Water is this coach's cheapest lever. Plain, never preachy.",
    collides_with: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// R8 — LA FRONTIÈRE
// ---------------------------------------------------------------------------

Deno.test("R8: le modèle ne peut pas refuser — il n'a pas de champ pour le dire", () => {
  // Un `status` rendu par le modèle est IGNORÉ, quelle que soit sa valeur: le
  // statut est dérivé, jamais lu. C'est la moitié structurelle de R8.
  const { practice } = parseClassifiedPractice(
    output({ status: "blocked", refusal: "I do not recommend fasting" }),
    "Fast until noon, every day",
  );
  assertEquals(practice.status, "active");
  assertEquals(practice.collidesWith, null);
});

Deno.test("R8: une collision inventée est comptée et ignorée, pas appliquée", () => {
  const { practice, issues } = parseClassifiedPractice(
    output({ collides_with: "unscientific_advice" }),
    "Fast until noon, every day",
  );
  assertEquals(practice.status, "active");
  assertEquals(practice.collidesWith, null);
  // Comptée: un modèle qui essaie régulièrement de refuser est un prompt à
  // corriger, et un rejet silencieux ne le dirait jamais.
  assert(issues.some((i) => i.includes("not a product surface")));
});

Deno.test("R9: une vraie ceinture, elle, bloque — proposée OU détectée", () => {
  // Proposée par le classifieur, sur un label que le matcher ne connaît pas.
  const claimed = parseClassifiedPractice(
    output({ collides_with: "adherence_score" }),
    "Rate how well you followed the plan out of ten",
  );
  assertEquals(claimed.practice.status, "blocked");
  assertEquals(claimed.practice.collidesWith, "adherence_score");

  // Détectée déterministiquement, quoi que le modèle en dise.
  const detected = parseClassifiedPractice(
    output({ collides_with: null }),
    "Weigh yourself every morning",
  );
  assertEquals(detected.practice.status, "blocked");
  assertEquals(detected.practice.collidesWith, "weight_readout");
});

Deno.test("le label du coach n'est JAMAIS lu de la sortie du modèle", () => {
  // Un modèle qui « améliore » la formulation du coach est précisément ce que
  // ce produit ne vend pas. La seule façon de le rendre impossible est de ne
  // pas lui laisser le champ.
  const { practice } = parseClassifiedPractice(
    output({ label: "Stay properly hydrated throughout the day" }),
    "bois de la flotte, arrête de te plaindre",
  );
  assertEquals(practice.label, "bois de la flotte, arrête de te plaindre");
});

// ---------------------------------------------------------------------------
// LA DÉRIVATION DU STATUT
// ---------------------------------------------------------------------------

Deno.test("`askable: false` donne remind_only — la branche nommée du champ", () => {
  const { practice } = parseClassifiedPractice(
    output({ askable: false }),
    "Sit down to eat, every meal",
  );
  assertEquals(practice.status, "remind_only");
});

Deno.test("§7: une sortie illisible GARDE la saisie du coach en needs_review", () => {
  for (const bad of [null, "not json at all", [], { kind: "vibes" }]) {
    const { practice } = parseClassifiedPractice(bad, "Ten minutes of walking after dinner");
    assertEquals(practice.status, "needs_review", JSON.stringify(bad));
    assertEquals(practice.label, "Ten minutes of walking after dinner", JSON.stringify(bad));
  }
});

Deno.test("l'appel en panne stocke quand même la pratique, et bloque quand même", () => {
  const kept = unclassifiedPractice("Ten minutes of walking after dinner");
  assertEquals(kept.status, "needs_review");
  assertEquals(kept.label, "Ten minutes of walking after dinner");
  // Une pratique qui contredit une ceinture ne devient pas acceptable parce que
  // le modèle était en panne.
  const blocked = unclassifiedPractice("Pèse-toi tous les matins");
  assertEquals(blocked.status, "blocked");
  assertEquals(blocked.collidesWith, "weight_readout");
  assertThrows(() => unclassifiedPractice("  "));
});

// ---------------------------------------------------------------------------
// L'ALLER-RETOUR — le champ oublié est le champ effacé
// ---------------------------------------------------------------------------

Deno.test("classifier puis relire rend la MÊME pratique", () => {
  // La cicatrice de `doctrine_editor_shape.ts`: l'écran relit pour modifier, et
  // le premier « enregistrer » réécrit ce qu'il a relu. Un champ que la
  // sérialisation laisse tomber est effacé sans message.
  const { practice } = parseClassifiedPractice(
    output({ goal_scope: ["fat_loss"], cadence: "constant" }),
    "4 glasses of water across the day",
  );
  const { practices, issues } = parseDailyPractices([dailyPracticeToRow(practice)]);
  assertEquals(issues, []);
  assertEquals(practices[0], practice);
});

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

Deno.test("le prompt interdit le refus et ferme la liste des collisions", () => {
  assert(PRACTICE_CLASSIFY_SYSTEM_PROMPT.includes("NEVER refuse"));
  assert(PRACTICE_CLASSIFY_SYSTEM_PROMPT.includes("NEVER rewrite the coach's words"));
  // Les quatre ceintures, nommées. `compliance_reminder` n'y est pas: R4 dit
  // qu'une question de pratique EN EST une, donc l'ajouter tuerait toutes les
  // pratiques dans leur propre garde-fou.
  assert(PRACTICE_CLASSIFY_SYSTEM_PROMPT.includes("weight_readout"));
  assert(!PRACTICE_CLASSIFY_SYSTEM_PROMPT.includes("compliance_reminder"));
});

Deno.test("le tour utilisateur porte le label VERBATIM et la langue du coach", () => {
  const prompt = buildPracticeClassifyPrompt({
    label: 'Bois 4 verres d\'eau — "pas plus compliqué que ça"',
    contentLocale: "fr-FR",
    existingLabels: ["Marche 10 minutes après le dîner"],
  });
  // JSON.stringify plutôt qu'une interpolation nue: un label qui porte des
  // guillemets casserait la délimitation, et le modèle lirait deux champs.
  assert(prompt.includes(JSON.stringify('Bois 4 verres d\'eau — "pas plus compliqué que ça"')));
  assert(prompt.includes("fr-FR"));
  // Le contexte sert la CADENCE et rien d'autre — d'où la consigne explicite.
  assert(prompt.includes("do not classify them"));
});
