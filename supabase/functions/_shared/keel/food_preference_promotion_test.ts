// DE LA MÉMOIRE À LA COMPOSITION — ce que ces tests protègent.
//
// LE FILTRE QUI COMPTE LE PLUS: `sensitive` et `safety` ne montent jamais dans
// une carte souple et éditable. Le dur a sa table (`student_safety_constraints`,
// synchrone, sans cache, sans ranking), et une allergie qui arriverait ici
// serait exactement la confusion des deux couches que le pivot a tranchée.
//
// LE SECOND: `kind='event'` est exclu. « J'ai mangé une pizza mardi » est un
// fait daté, pas un goût. Le promouvoir mettrait une pizza dans toutes les
// semaines à venir.
//
// LE TROISIÈME, moins visible et tout aussi coûteux: les deux générateurs
// sérialisent `practical_constraints` EN ENTIER dans leur prompt. Tout ce qu'on
// range dedans est servi au modèle, y compris une liste d'UUID de comptabilité.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyFoodPreferenceDecision,
  constraintsForPrompt,
  FOOD_PREFERENCES_DISMISSED_KEY,
  FOOD_PREFERENCES_KEY,
  type MemoryItemForPromotion,
  proposeFoodPreferences,
} from "./food_preference_promotion.ts";

function item(over: Partial<MemoryItemForPromotion> = {}): MemoryItemForPromotion {
  return {
    id: "m-1",
    kind: "fact",
    status: "active",
    content_text: "The student dislikes broccoli.",
    normalized_summary: "Dislikes broccoli",
    domain_keys: ["sante.alimentation"],
    confidence: 0.9,
    sensitivity_level: "normal",
    ...over,
  };
}

Deno.test("un goût alimentaire actif est proposé", () => {
  const out = proposeFoodPreferences({ items: [item()] });
  assertEquals(out, [{ memoryItemId: "m-1", text: "Dislikes broccoli" }]);
});

Deno.test("LA LIGNE MÉDICALE: sensitive et safety ne montent jamais", () => {
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", sensitivity_level: "sensitive" }),
      item({ id: "b", sensitivity_level: "safety" }),
      item({ id: "c" }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("un ÉVÉNEMENT daté n'est pas un goût", () => {
  // « J'ai mangé une pizza mardi » ne doit pas devenir une contrainte de
  // composition pour toutes les semaines suivantes.
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", kind: "event" }),
      item({ id: "b", kind: "action_observation" }),
      item({ id: "c", kind: "statement" }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("un item que la MÉMOIRE elle-même n'a pas retenu ne monte pas", () => {
  // `candidate` = le système de mémoire ne l'a pas validé. Le promouvoir
  // sauterait par-dessus sa propre validation.
  for (const status of ["candidate", "superseded", "invalidated", "archived"]) {
    assertEquals(proposeFoodPreferences({ items: [item({ status })] }), []);
  }
});

Deno.test("ce que l'élève a DÉJÀ refusé ne remonte jamais", () => {
  // `hidden_by_user` / `deleted_by_user`: il a dit non une fois. Reproposer,
  // c'est insister.
  for (const status of ["hidden_by_user", "deleted_by_user"]) {
    assertEquals(proposeFoodPreferences({ items: [item({ status })] }), []);
  }
  // Et l'écart explicite tient aussi, sur un item resté actif.
  assertEquals(
    proposeFoodPreferences({ items: [item()], dismissed: ["m-1"] }),
    [],
  );
});

Deno.test("hors du domaine alimentaire, rien ne monte", () => {
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", domain_keys: ["sante.sommeil"] }),
      item({ id: "b", domain_keys: [] }),
      item({ id: "c", domain_keys: ["habitudes.execution", "sante.alimentation"] }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("sous le seuil de confiance, on ne propose pas", () => {
  assertEquals(proposeFoodPreferences({ items: [item({ confidence: 0.6 })] }), []);
  assertEquals(proposeFoodPreferences({ items: [item({ confidence: null })] }), []);
});

Deno.test("ce qui est déjà gardé n'est pas reproposé, à la casse près", () => {
  const out = proposeFoodPreferences({
    items: [item()],
    kept: ["dislikes BROCCOLI"],
  });
  assertEquals(out, []);
});

Deno.test("deux souvenirs du même texte ne font qu'une proposition", () => {
  const out = proposeFoodPreferences({
    items: [item({ id: "a" }), item({ id: "b" })],
  });
  assertEquals(out.length, 1);
});

// ---------------------------------------------------------------------------
// L'écriture dans practical_constraints
// ---------------------------------------------------------------------------

Deno.test("garder n'écrase AUCUNE autre clé", () => {
  // Le motif des deux cartes qui existent: chacune possède UNE clé et fusionne
  // le reste. Deux cartes ouvertes côte à côte ne doivent pas se désécrire.
  const before = {
    eating_rhythm: [{ slot: "breakfast" }],
    cook_days: ["mon", "wed"],
  };
  const after = applyFoodPreferenceDecision(before, {
    kind: "keep",
    text: "No broccoli",
    memoryItemId: "m-1",
  });
  assertEquals(after.eating_rhythm, before.eating_rhythm);
  assertEquals(after.cook_days, before.cook_days);
  assertEquals(after[FOOD_PREFERENCES_KEY], ["No broccoli"]);
  // Gardé ET marqué traité: sinon la proposition revient à chaque ouverture,
  // puisqu'elle n'est pas persistée.
  assertEquals(after[FOOD_PREFERENCES_DISMISSED_KEY], ["m-1"]);
});

Deno.test("garder deux fois le même texte ne le double pas", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "no BROCCOLI" });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["No broccoli"]);
});

Deno.test("l'élève peut éditer et retirer ce qu'il a gardé", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "Lunch at the canteen" });
  c = applyFoodPreferenceDecision(c, {
    kind: "edit",
    from: "No broccoli",
    to: "No broccoli, no cauliflower",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], [
    "No broccoli, no cauliflower",
    "Lunch at the canteen",
  ]);
  c = applyFoodPreferenceDecision(c, {
    kind: "remove",
    text: "Lunch at the canteen",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["No broccoli, no cauliflower"]);
});

Deno.test("éditer vers du vide RETIRE, plutôt que de garder une ligne blanche", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "edit", from: "No broccoli", to: "  " });
  assertEquals(c[FOOD_PREFERENCES_KEY], []);
});

Deno.test("LA GARDE DE PROMPT: la comptabilité interne ne part pas au modèle", () => {
  // Les deux générateurs sérialisent le jsonb EN ENTIER. Une liste d'UUID
  // « dismissed » servie au modèle occupe du budget pour du bruit — et un
  // modèle qui la voit à côté de préférences peut les appliquer à l'envers.
  const c = applyFoodPreferenceDecision(
    { cook_days: ["mon"] },
    { kind: "keep", text: "No broccoli", memoryItemId: "m-1" },
  );
  const forPrompt = constraintsForPrompt(c);
  assertEquals(forPrompt[FOOD_PREFERENCES_KEY], ["No broccoli"]);
  assertEquals(forPrompt[FOOD_PREFERENCES_DISMISSED_KEY], undefined);
  assertEquals(forPrompt.cook_days, ["mon"]);
  assert(!JSON.stringify(forPrompt).includes("m-1"));
});

Deno.test("le filtre de prompt ne casse pas sur un jsonb vide ou absent", () => {
  assertEquals(constraintsForPrompt(null), {});
  assertEquals(constraintsForPrompt(undefined), {});
  assertEquals(constraintsForPrompt({}), {});
});
