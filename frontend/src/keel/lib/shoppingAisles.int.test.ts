import { describe, expect, it } from "vitest";
import { groupByAisle } from "./mealBuilderModel";
import { SHOPPING_AISLE_ORDER } from "../api/mealLabels";
import { type ShoppingItem } from "../api/mealGeneration";

// ===========================================================================
// LA LISTE DE COURSES, PAR RAYON
//
// LE DÉFAUT. Vingt-huit lignes à plat, dans l'ordre où le modèle les a sorties
// — le poulet entre les tomates et le riz. On fait ses courses en suivant les
// rayons; une liste qui les ignore se reparcourt en entier à chaque article.
//
// CE QUI EST TESTÉ. Une partition: rien de perdu, rien en double, et l'ordre
// d'un magasin. Plus l'index d'origine, qui est ce qui rend une ligne
// rayable — et qui est le seul endroit où une erreur passerait inaperçue.
// ===========================================================================

// `food_group: null` — requis depuis le 2026-08-23. Ce fichier ne teste que le
// GROUPEMENT PAR RAYON, qui ne le lit pas: la valeur est neutre ici, et elle est
// écrite plutôt qu'omise pour que l'oubli redevienne impossible ailleurs.
function item(term: string, aisle: string): ShoppingItem {
  return { term, quantity: null, aisle, food_group: null };
}

describe("groupByAisle", () => {
  it("suit l'ordre du magasin, pas celui de la donnée", () => {
    const groups = groupByAisle([
      item("rice", "grains"),
      item("chicken", "protein"),
      item("tomatoes", "produce"),
    ]);
    expect(groups.map((g) => g.aisle)).toEqual(["produce", "protein", "grains"]);
    // Et c'est bien l'ordre du PDF: l'élève lit à l'écran, imprime, et cherche
    // au magasin. Deux ordres différents = un article cherché au mauvais bout.
    expect(SHOPPING_AISLE_ORDER.indexOf("produce"))
      .toBeLessThan(SHOPPING_AISLE_ORDER.indexOf("grains"));
  });

  it("ne rend pas un rayon vide", () => {
    // Un titre « Frozen » suivi de rien fait chercher un article qui n'existe
    // pas.
    const groups = groupByAisle([item("tomatoes", "produce")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].aisle).toBe("produce");
  });

  it("ne perd rien, et ne duplique rien", () => {
    const items = [
      item("a", "produce"),
      item("b", "pantry"),
      item("c", "produce"),
      item("d", "frozen"),
    ];
    const flat = groupByAisle(items).flatMap((g) => g.items);
    expect(flat).toHaveLength(items.length);
    expect(new Set(flat.map((f) => f.index)).size).toBe(items.length);
  });

  // UN RAYON INCONNU NE FAIT PAS DISPARAÎTRE UNE CAROTTE. Le vocabulaire est
  // fermé côté moteur, mais une ligne ancienne ou un jeton inattendu doit
  // rester ACHETABLE — c'est une liste de courses, pas un schéma.
  it("range un rayon inconnu dans «other» au lieu de le perdre", () => {
    const groups = groupByAisle([item("mystery", "vegetables")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].aisle).toBe("other");
    expect(groups[0].items[0].item.term).toBe("mystery");
  });

  // L'INDEX EST L'IDENTITÉ D'UNE LIGNE, et pas son terme: deux rayons peuvent
  // porter le même mot, et rayer « lemon » au rayon fruits ne doit pas rayer
  // « lemon » au rayon épicerie.
  it("garde l'index d'origine, pas la position dans le groupe", () => {
    const groups = groupByAisle([
      item("lemon", "pantry"),
      item("apple", "produce"),
      item("lemon", "produce"),
    ]);
    const produce = groups.find((g) => g.aisle === "produce")!;
    expect(produce.items.map((i) => i.index)).toEqual([1, 2]);
    const pantry = groups.find((g) => g.aisle === "pantry")!;
    expect(pantry.items.map((i) => i.index)).toEqual([0]);
  });

  it("rend une liste vide sans rien inventer", () => {
    expect(groupByAisle([])).toEqual([]);
  });
});
