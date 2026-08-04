/**
 * Le plancher de déclaration de repas, dans les DEUX directions.
 *
 * Les cas positifs sont les phrases EXACTES mesurées instables en run réel
 * (QA WEB L3-bis). Les cas négatifs sont les faux positifs qu'un plancher trop
 * large produirait — et ils comptent autant : une garde qu'on n'a pas vue
 * LÂCHER est une garde qui mordra un innocent.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectDeclaredMeal } from "./meal_declaration_floor.ts";

function refs(message: string, slot: string | null = null): string[] {
  const hit = detectDeclaredMeal(message, slot);
  return (hit?.components ?? []).map((c) => c.food_group_ref).sort();
}

Deno.test("les phrases EXACTES mesurées instables mordent, et complètement", () => {
  // « Grilled salmon with quinoa and green beans for dinner » → [0,0,0,0] en réel.
  assertEquals(
    refs("Grilled salmon with quinoa and green beans for dinner"),
    ["fatty_fish", "non_starchy_veg", "whole_grain"],
  );
  // « Poulet grillé, riz complet et brocolis à midi » → [0,3,3,0] en réel.
  assertEquals(
    refs("Poulet grillé, riz complet et brocolis à midi"),
    ["cruciferous_veg", "poultry", "whole_grain"],
  );
  // Le cas qui marchait déjà doit continuer.
  assertEquals(refs("j'ai mangé du poulet"), ["poultry"]);
  assertEquals(refs("I had eggs and rice for lunch"), ["eggs", "refined_grain"]);
});

Deno.test("le terme le PLUS LONG gagne — « brown rice » n'est pas « rice »", () => {
  assertEquals(refs("I had brown rice for lunch"), ["whole_grain"]);
  assertEquals(refs("I had white rice for lunch"), ["refined_grain"]);
  assertEquals(refs("j'ai mangé du riz complet"), ["whole_grain"]);
  // « green beans » est un légume, « beans » une légumineuse.
  assertEquals(refs("I had green beans for dinner"), ["non_starchy_veg"]);
  assertEquals(refs("I had beans for dinner"), ["legumes"]);
});

Deno.test("un même groupe nommé deux fois ne produit qu'UN composant", () => {
  // « chicken breast » et « chicken » sont le même groupe: une seule ligne.
  assertEquals(refs("I had chicken breast and chicken soup for lunch"), ["poultry"]);
});

Deno.test("LES DEUX PORTES, et elles se distinguent", () => {
  assertEquals(detectDeclaredMeal("j'ai mangé du poulet")?.gate, "past_tense_verb");
  assertEquals(
    detectDeclaredMeal("Poulet grillé, riz complet et brocolis à midi")?.gate,
    "noun_phrase_with_slot",
  );
  // Un groupe nominal SANS créneau et SANS verbe au passé ne passe pas: c'est
  // peut-être une liste de courses, une envie, une question tronquée.
  assertEquals(detectDeclaredMeal("chicken and rice"), null);
  // …sauf si le runtime a déjà lu un créneau ailleurs dans le message.
  assertEquals(refs("chicken and rice", "lunch"), ["poultry", "refined_grain"]);
});

Deno.test("DÉSARMEMENT — l'intention future n'écrit rien", () => {
  for (
    const message of [
      "I'm going to have chicken tonight",
      "je vais manger du poulet ce soir",
      "I'll have salmon for dinner",
      "je pense prendre du poisson demain",
      "I plan to eat more vegetables",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("DÉSARMEMENT — une question nomme des aliments sans en déclarer", () => {
  for (
    const message of [
      "what should I have for dinner, chicken or fish?",
      "can I have rice with my chicken at lunch?",
      "est-ce que je peux manger du riz à midi ?",
      "c'est quoi une bonne collation, du yaourt ?",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("DÉSARMEMENT — la négation, et l'assiette de quelqu'un d'autre", () => {
  for (
    const message of [
      "I didn't eat any chicken today",
      "je n'ai rien mangé ce midi",
      "my son had chicken and rice for lunch",
      "mon fils a mangé du poulet ce midi",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("R7 — un plat hors de la table fermée ne produit AUCUN fait", () => {
  // Un plat composé n'est PAS décomposé: on ne sait pas ce qu'il y avait
  // dedans, et un plancher qui le devinerait écrirait un fait que personne n'a
  // dit. Le tour retombe sur le dispatcher, qui a le droit de juger.
  assertEquals(detectDeclaredMeal("I had lasagne for dinner"), null);
  assertEquals(detectDeclaredMeal("j'ai mangé un tajine hier soir"), null);
});

Deno.test("un plat composé rend ce qu'il NOMME, et rien de plus", () => {
  // « couscous royal » nomme un couscous: c'est une céréale raffinée, et c'est
  // vrai quoi qu'il y ait eu d'autre dans le plat. Le fait est PARTIEL, pas
  // inventé — et ce plancher ne s'exécute QUE quand le dispatcher n'a rien
  // écrit du tout, donc « partiel » y bat « rien ».
  assertEquals(refs("j'ai mangé un couscous royal hier soir"), ["refined_grain"]);
});

Deno.test("un message ordinaire ne déclenche jamais le plancher", () => {
  for (
    const message of [
      "hey",
      "how are you?",
      "I'm allergic to peanuts, badly",
      "I feel exhausted this week",
      "",
      "   ",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message),
      null,
      `ne doit PAS mordre: ${JSON.stringify(message)}`,
    );
  }
});

Deno.test("un copier-coller n'est pas une déclaration de repas", () => {
  const wall = `I had chicken and rice for lunch. ${"blah ".repeat(200)}`;
  assertEquals(detectDeclaredMeal(wall), null);
});

Deno.test("les mots de l'élève sont conservés tels quels", () => {
  const hit = detectDeclaredMeal("J'ai mangé du poulet grillé, très bon");
  assert(hit);
  assertEquals(hit!.studentNote, "J'ai mangé du poulet grillé, très bon");
});
