import { assert, assertEquals } from "jsr:@std/assert@1";
import { needlesOf, runThroughWithoutPreparations, splitSentences } from "./session_run_through.ts";
import { sourceFamily } from "./source_family.ts";

const CABILLAUD = {
  id: "prep_cod_barley",
  title: "Cabillaud à l'orge et brocoli",
  ingredientTerms: ["cabillaud", "orge perlé", "brocoli", "huile d'olive"],
};

Deno.test("le cas mesuré : la phrase du cabillaud tombe, les autres restent, sans accent ni casse", () => {
  const out = runThroughWithoutPreparations({
    runThrough:
      "Mettre l’orge et le poulet à cuire en premier. Pendant les mijotages, préparer les muffins d’œufs. " +
      "Poêler le CABILLAUD, terminer les trois préparations. Garder les portions proches au réfrigérateur.",
    removed: [CABILLAUD],
    remainingTitles: ["Poulet aux pois chiches", "Muffins d’œufs à la dinde"],
  });
  // « l'orge » (4 lettres, ingrédient) et « CABILLAUD » (titre) font tomber
  // leurs deux phrases — la seconde emporte « terminer les trois
  // préparations », qui mêlait le retiré et le gardé : elle tombe entière.
  assertEquals(out.droppedSentences, 2);
  assertEquals(out.keptSentences, 2);
  assertEquals(out.fellBackToTitles, false);
  assertEquals(
    out.text,
    "Pendant les mijotages, préparer les muffins d’œufs. Garder les portions proches au réfrigérateur.",
  );
});

Deno.test("mot ENTIER, jamais sous-chaîne : « gorgé » ne fait pas tomber une phrase pour « orge »", () => {
  const out = runThroughWithoutPreparations({
    runThrough: "Un gâteau gorgé de sirop. Cuire l'orge vingt minutes.",
    removed: [{ id: "p", title: "Salade d'orge", ingredientTerms: ["orge"] }],
    remainingTitles: ["Gâteau"],
  });
  // « orge » est un ingrédient (4 lettres, admis) : « Cuire l'orge » tombe,
  // « gorgé » ne le contient pas comme MOT — il reste.
  assertEquals(out.droppedSentences, 1);
  assertEquals(out.text, "Un gâteau gorgé de sirop.");
});

Deno.test("quand tout tombe, le déroulé devient la liste des casseroles restantes — jamais vide", () => {
  const out = runThroughWithoutPreparations({
    runThrough: "Poêler le cabillaud. Servir le brocoli.",
    removed: [CABILLAUD],
    remainingTitles: ["Poulet aux pois chiches", "Muffins d’œufs"],
  });
  assertEquals(out.keptSentences, 0);
  assertEquals(out.fellBackToTitles, true);
  assertEquals(out.text, "Poulet aux pois chiches · Muffins d’œufs");
});

Deno.test("LE CAS QUI PASSE — rien de retiré, rien ne bouge, au caractère près", () => {
  const texte = "Cuire les pâtes. Mélanger avec le thon.";
  const out = runThroughWithoutPreparations({ runThrough: texte, removed: [], remainingTitles: ["Pâtes au thon"] });
  assertEquals(out.text, texte);
  assertEquals(out.droppedSentences, 0);
});

Deno.test("les mots-clés : titre et ingrédients pliés, cinq lettres et plus, sans doublon", () => {
  assertEquals(needlesOf(CABILLAUD).sort(), ["brocoli", "cabillaud", "huile", "olive", "orge", "perle"]);
  assertEquals(splitSentences("Un. Deux !  Trois ? Quatre"), ["Un.", "Deux !", "Trois ?", "Quatre"]);
});

Deno.test("⛔ CÂBLAGE — la casserole retirée est retirée du déroulé de sa session, au même endroit", async () => {
  const src = await sourceFamily(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const retrait = src.indexOf("no box draws on any more -- not cooked, not bought");
  const reecriture = src.indexOf("runThroughWithoutPreparations({");
  assert(retrait > 0 && reecriture > 0, "le retrait ou la réécriture a disparu");
  assert(Math.abs(reecriture - retrait) < 3500, "la réécriture ne vit plus à côté du retrait");
  assert(src.includes("keel.household_meal.run_through_rewritten"), "une réécriture muette ne se compte pas");
});
