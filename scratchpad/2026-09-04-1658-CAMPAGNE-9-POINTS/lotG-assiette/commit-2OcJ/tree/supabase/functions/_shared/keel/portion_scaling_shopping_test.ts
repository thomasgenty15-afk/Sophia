/**
 * LA LISTE DE COURSES QUI SUIT L'ASSIETTE — `scaleShoppingList`.
 *
 * ⛔ CE QUE CES ÉPREUVES GARDENT: qu'un plan ancré reste ACHETABLE. Mettre à
 * l'échelle ce qu'on cuisine sans mettre à l'échelle ce qu'on achète produit un
 * plan qui demande 630 g de poulet à la casserole avec 450 g sur la liste — et
 * ce défaut-là ne se voit que devant le frigo.
 *
 * Chaque propriété a son cas qui PASSE et son cas qui REFUSE.
 */
import { assertEquals } from "jsr:@std/assert@1";

import { scaleShoppingList } from "./portion_scaling.ts";

const line = (term: string, quantity: string | null) => ({ term, quantity });

Deno.test("une masse en tête suit le facteur, et le NOM de l'aliment survit", () => {
  // ⛔ « 300 g carrots » → « 420 g carrots ». Écrire `${next} ${unit}` comme le
  // fait la branche pesée des ingrédients rendrait « 420 g » tout court, et une
  // liste de courses sans nom d'aliment n'est pas une liste.
  const out = scaleShoppingList(
    [line("carrots", "300 g carrots"), line("chicken thighs", "450 g")],
    1.4,
  );
  assertEquals(out.items[0].quantity, "420 g carrots");
  assertEquals(out.items[1].quantity, "630 g");
  assertEquals(out.changed, 2);
  assertEquals(out.unrewritable, []);
});

Deno.test("un dénombrable au pluriel suit aussi", () => {
  const out = scaleShoppingList([line("lemons", "3 lemons")], 1.4);
  assertEquals(out.items[0].quantity, "4 lemons");
  assertEquals(out.changed, 1);
});

Deno.test("⛔ UN CONTENANT DU COMMERCE NE BOUGE PAS — sans qu'aucun lexique existe", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // C'EST LA PROPRIÉTÉ LA PLUS IMPORTANTE DE CE FICHIER.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Un pot de cumin reste un pot: on n'en achète pas deux parce que l'assiette
  // a grandi de 40 %. Et ce refus ne vient PAS d'une liste de mots — il vient
  // de la garde du singulier/pluriel de `rewriteCountableQuantity`, qui refuse
  // de traverser la frontière du 1 parce qu'elle ne sait pas fléchir.
  //
  // Mesuré le 2026-08-23 sur 273 lignes de courses réelles: les contenants du
  // commerce commencent TOUS par « 1 ». Écrire « jar », « pack », « loaf »
  // quelque part aurait été un matcher maison — la cicatrice la plus chère de
  // ce dépôt — pour un résultat que la garde existante rend déjà.
  const out = scaleShoppingList([
    line("smoked paprika", "1 jar smoked paprika"),
    line("wholemeal tortillas", "1 pack"),
    line("wholemeal bread", "1 small loaf"),
    line("cucumber", "1 cucumber"),
  ], 1.6);
  assertEquals(out.items.map((i) => i.quantity), [
    "1 jar smoked paprika",
    "1 pack",
    "1 small loaf",
    "1 cucumber",
  ]);
  assertEquals(out.changed, 0);
  // ⛔ ET LE REFUS SE COMPTE. Une liste laissée entière ressemblerait sinon à
  // une liste à jour.
  assertEquals(out.unrewritable.length, 4);
});

Deno.test("une ligne SANS nombre n'est pas un refus — il n'y avait rien à suivre", () => {
  // ⚠️ LA DISTINCTION COMPTE: « to taste » n'a pas de quantité, ce n'est pas une
  // quantité qu'on a échoué à réécrire. Les confondre gonflerait le compteur
  // d'abstention avec du sel et du poivre.
  const out = scaleShoppingList(
    [line("salt", "to taste"), line("pepper", null)],
    1.4,
  );
  assertEquals(out.changed, 0);
  assertEquals(out.unrewritable, []);
});

Deno.test("les DEUX facteurs se partagent par le même prédicat que l'assiette", () => {
  // La protéine grossit plus vite que le reste (`ScaleFactors`), et la liste
  // doit suivre CE partage-là, pas une moyenne — sinon on achèterait le riz
  // d'un plan et le poulet d'un autre.
  const out = scaleShoppingList(
    [line("chicken thighs", "400 g"), line("rice", "400 g")],
    { protein: 1.5, other: 1.0 },
    (term) => term === "chicken thighs",
  );
  assertEquals(out.items[0].quantity, "600 g");
  assertEquals(out.items[1].quantity, "400 g");
  assertEquals(out.changed, 1);
});

Deno.test("⚠️ LE CAS QUI NE CHANGE RIEN — un facteur de 1 laisse la liste intacte", () => {
  // ⛔ SANS CE CAS, une réécriture systématique passerait pour une mise à
  // l'échelle. `changed: 0` doit être atteignable.
  const items = [line("carrots", "300 g carrots"), line("lemons", "3 lemons")];
  const out = scaleShoppingList(items, 1);
  assertEquals(out.items.map((i) => i.quantity), ["300 g carrots", "3 lemons"]);
  assertEquals(out.changed, 0);
  assertEquals(out.unrewritable, []);
});

Deno.test("les kilos ne se réécrivent pas, et ça se COMPTE", () => {
  // `kg` et `l` sont hors du vocabulaire de mesure du dépôt (`g`, `ml`), comme
  // dans `quantity_from_prose.ts`. « 1.2 kg » retombe donc sur la porte
  // dénombrable, dont l'arrondi à l'entier refuse de traverser le 1.
  const out = scaleShoppingList([line("chicken thighs", "1.2 kg")], 1.4);
  assertEquals(out.items[0].quantity, "1.2 kg");
  assertEquals(out.unrewritable, ["chicken thighs"]);
});

Deno.test("l'entrée n'est jamais mutée — le module est pur", () => {
  const items = [line("carrots", "300 g carrots")];
  scaleShoppingList(items, 2);
  assertEquals(items[0].quantity, "300 g carrots");
});
