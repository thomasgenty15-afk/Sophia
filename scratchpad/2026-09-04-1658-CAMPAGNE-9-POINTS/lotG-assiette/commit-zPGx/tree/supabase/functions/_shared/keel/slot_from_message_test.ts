import { assertEquals } from "jsr:@std/assert@1";
import { slotKeyNamedIn } from "./slot_from_message.ts";

Deno.test("les trois messages qui perdaient leur créneau en run réel", () => {
  // Mesurés 0/3 le 2026-08-03: l'élève nommait son créneau, `slot_key` sortait
  // NULL, et le correctif B2 de l'évaluateur serait arrivé sur une colonne vide.
  assertEquals(slotKeyNamedIn("I had chicken and rice for lunch"), "lunch");
  assertEquals(
    slotKeyNamedIn("I ate yoghurt at breakfast this morning"),
    "breakfast",
  );
  assertEquals(slotKeyNamedIn("I had salmon for dinner tonight"), "dinner");
});

Deno.test("l'HEURE n'est jamais une source — la règle du prompt tenue par construction", () => {
  // « Absent s'il ne le dit pas — ne le deduis pas de l'heure qu'il est. »
  // Ce module ne reçoit aucune horloge: il ne PEUT pas la lire. Ces messages
  // sont tous datables par le contexte et tous sans créneau nommé.
  for (
    const noSlot of [
      "I had salmon",
      "just ate, feeling good",
      "I had a big plate of pasta at 8pm",
      "grabbed something quick before the meeting",
      "",
    ]
  ) {
    assertEquals(slotKeyNamedIn(noSlot), null, noSlot);
  }
});

Deno.test("« snack » seul n'est PAS résolu: snack_am et snack_pm sont deux créneaux", () => {
  // Trancher demanderait l'heure, qu'on s'interdit de lire. Un null honnête
  // vaut mieux qu'un créneau inventé.
  assertEquals(slotKeyNamedIn("I had a snack"), null);
  assertEquals(slotKeyNamedIn("just had an afternoon snack"), null);
});

Deno.test("les formes composées gagnent sur les simples (le piège du petit-déjeuner)", () => {
  // Sans l'ordre, « petit-déjeuner » serait lu comme « déjeuner » et un
  // petit-déjeuner français deviendrait un déjeuner — une erreur d'un repas
  // d'écart, tous les matins, en silence.
  assertEquals(slotKeyNamedIn("j'ai pris mon petit-déjeuner"), "breakfast");
  assertEquals(slotKeyNamedIn("petit dej avalé"), "breakfast");
  assertEquals(slotKeyNamedIn("au déjeuner j'ai mangé du poulet"), "lunch");
  assertEquals(slotKeyNamedIn("dîner léger ce soir"), "dinner");
});

Deno.test("diacritiques et casse ne changent rien", () => {
  assertEquals(slotKeyNamedIn("DÎNER"), "dinner");
  assertEquals(slotKeyNamedIn("Petit-Déjeuner"), "breakfast");
  assertEquals(slotKeyNamedIn("diner"), "dinner");
});

Deno.test("séances et coucher", () => {
  assertEquals(slotKeyNamedIn("protein shake post-workout"), "post_workout");
  assertEquals(slotKeyNamedIn("a banana before training"), "pre_workout");
  assertEquals(slotKeyNamedIn("magnesium before bed"), "before_bed");
  assertEquals(slotKeyNamedIn("water on waking"), "on_waking");
});

Deno.test("DEUX créneaux nommés = aucun: on ne choisit pas à sa place", () => {
  // Un message qui parle de deux repas ne désigne pas un créneau, il en décrit
  // deux. En choisir un serait inventer; `null` reproduit exactement l'état
  // d'avant ce module, donc aucune régression possible sur ce cas.
  assertEquals(
    slotKeyNamedIn("eggs at breakfast and chicken at lunch"),
    null,
  );
});

Deno.test("pas de match à l'intérieur d'un autre mot", () => {
  // La frontière de mot est ce qui empêche un extracteur déterministe de
  // devenir un générateur de faux positifs.
  assertEquals(slotKeyNamedIn("we discussed the lunchbox industry"), null);
  assertEquals(slotKeyNamedIn("brunchtime"), null);
});

// ===========================================================================
// FF-017 R6 — LES DÉICTIQUES DE REPAS, et la parité entre les deux langues
// ===========================================================================

Deno.test("« à midi » et « ce soir » nomment un créneau — mesuré NULL 3/3", () => {
  // Run réel 2026-08-08: « Poulet grillé, riz complet et brocolis à midi »
  // écrivait trois faits avec `slot_key = NULL`, pendant que son équivalent
  // anglais « … for dinner » écrivait `dinner`. Le plancher de FF-017 accepte
  // pourtant « à midi » comme mot de créneau pour OUVRIR sa porte: la
  // déclaration passait grâce au créneau et s'écrivait sans lui.
  assertEquals(
    slotKeyNamedIn("Poulet grillé, riz complet et brocolis à midi"),
    "lunch",
  );
  assertEquals(slotKeyNamedIn("j'ai mangé une salade ce midi"), "lunch");
  assertEquals(slotKeyNamedIn("hier soir j'ai mangé du saumon"), "dinner");
  assertEquals(slotKeyNamedIn("j'ai mangé du poulet ce soir"), "dinner");
  // La parité anglaise des mêmes formes déictiques.
  assertEquals(slotKeyNamedIn("I had chicken tonight"), "dinner");
  assertEquals(slotKeyNamedIn("I had a sandwich at lunchtime"), "lunch");
  assertEquals(slotKeyNamedIn("I had soup at midday"), "lunch");
});

Deno.test("« ce matin » n'est PAS un petit-déjeuner, dans les deux langues", () => {
  // Un fruit à 10 h n'est pas un petit-déjeuner. Le mapper inventerait le repas
  // le plus souvent sauté — et le module préfère un `null` honnête à un créneau
  // supposé, exactement comme pour `snack`.
  assertEquals(slotKeyNamedIn("j'ai mangé une pomme ce matin"), null);
  assertEquals(slotKeyNamedIn("I had an apple this morning"), null);
});

Deno.test("les déictiques comptent AUSSI dans la règle « deux créneaux = aucun »", () => {
  assertEquals(slotKeyNamedIn("j'ai mangé à midi et ce soir"), null);
  assertEquals(slotKeyNamedIn("eggs at breakfast, chicken tonight"), null);
});
