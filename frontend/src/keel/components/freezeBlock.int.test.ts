import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { frozenLinesForSession, thawLineFor } from "../lib/thawLine";
import type { MealPreparation, ShoppingItem } from "../api/mealGeneration";

// ⟳ 2026-09-09 — « À CONGELER » DOIT ÊTRE HYPER VISIBLE, ET LA VEILLE SE DIT.
//
// Mesuré sur un plan réel (2026-09-08): le badge par ligne existait, au fond
// d'une carte repliée de 46 lignes, et la personne a lu « dinde achetée
// mercredi, cuisinée dimanche » — la garde semblait avoir lâché.

const src = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

const SHOPPING = [
  { term: "dinde hachée", quantity: "450 g", aisle: "protein", food_group: "poultry", buy_on: "2026-09-09", freeze_on_purchase: true },
  { term: "persil", quantity: "1 bouquet", aisle: "produce", food_group: "leafy_greens", buy_on: "2026-09-10", freeze_on_purchase: false },
  { term: "poisson", quantity: "300 g", aisle: "protein", food_group: "white_fish", buy_on: "2026-09-09", freeze_on_purchase: true },
] as unknown as ShoppingItem[];
const PREPS = [
  { id: "prep_turkey_meatballs", cook_on: "sun", ingredients: [{ term: "Dinde hachée" }, { term: "persil" }] },
  { id: "prep_fish", cook_on: "fri", ingredients: [{ term: "poisson" }] },
] as unknown as MealPreparation[];

describe("la phrase de la veille", () => {
  it("nomme ce que CETTE session sort du congélateur, avec la quantité", () => {
    expect(frozenLinesForSession({ preparation_ids: ["prep_turkey_meatballs"] }, PREPS, SHOPPING).map((l) => l.term))
      .toEqual(["dinde hachée"]);
    const line = thawLineFor({ preparation_ids: ["prep_turkey_meatballs"] }, PREPS, SHOPPING);
    // `t()` suit la langue du navigateur de test: on accepte les deux catalogues.
    expect(line).toMatch(/congélateur|freezer/);
    expect(line).toContain("dinde hachée (450 g)");
  });
  it("se tait quand la session ne sort rien", () => {
    expect(thawLineFor({ preparation_ids: ["prep_nothing"] }, PREPS, SHOPPING)).toBeNull();
  });
  it("les clés existent dans les deux langues", () => {
    for (const key of ["meals.sessions.thaw_night_before", "meals.shopping.freeze_block_one", "meals.shopping.freeze_block_many"]) {
      expect(fr[key as keyof typeof fr]).toBeTruthy();
      expect(en[key as keyof typeof en]).toBeTruthy();
    }
  });
});

describe("les quatre surfaces la rendent", () => {
  it("la liste de courses ouvre chaque course par le bloc « à congeler », même à une seule course", () => {
    const s = src("./ShoppingListPanel.tsx");
    expect(s).toContain("renderFreezeBlock(wave.indices)");
    expect(s).toContain("renderFreezeBlock(props.items.map((_, i) => i))");
  });
  it("la carte du jour montre le bloc HORS du dépliant, et la carte de session porte la phrase", () => {
    const s = src("./plan/PlanDayBlock.tsx");
    const block = s.indexOf("frozenLines.length > 0 && (");
    const fold = s.indexOf("{open && (\n        <div id={panelId}");
    expect(block).toBeGreaterThan(0);
    expect(fold).toBeGreaterThan(block);
    expect(s).toContain("thawLineFor(session, props.preparations, props.shoppingList)");
  });
  it("« Tes sessions de cuisine » reçoit la liste et rend la phrase", () => {
    expect(src("./CookingSessions.tsx")).toContain("thawLineFor(session, preparations, shoppingList)");
    expect(src("./KitchenToday.tsx")).toContain("shoppingList={meals.shoppingList ?? []}");
    expect(src("./MealBuilder.tsx")).toContain("shoppingList={result?.shoppingList ?? []}");
  });
});
