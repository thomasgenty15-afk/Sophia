import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FoldSection, { BoxingFold } from "./FoldSection";
import type { BoxLine } from "../../lib/mealBoxes";

// ⟳ 2026-09-23 — « TOUTES LES SECTIONS DOIVENT ÊTRE DÉPLIABLES, ÇA DOIT PAS
// ÊTRE DIRECTEMENT DÉPLIÉ ». Mesuré sur le rendu: au premier affichage, une
// section montre son titre et rien de ce qu'elle contient.

describe("une section de session, au premier affichage", () => {
  it("est REPLIÉE: le titre se lit, le contenu est masqué", () => {
    const html = renderToStaticMarkup(
      createElement(
        FoldSection,
        {
          title: "Déroulé global",
          meta: null,
          tone: "tinted",
          children: createElement("p", null, "Allumer le four à 200 °C."),
        },
      ),
    );
    expect(html).toContain("Déroulé global");
    expect(html).toContain('aria-expanded="false"');
    // Rendu, mais sous `hidden`: rien ne s'affiche tant qu'on n'a pas ouvert.
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*>.*Allumer le four/);
  });

  it("le boxing replié dit son compte, et ne rend aucun contenant", () => {
    const line = (id: string, frozen: boolean): BoxLine => ({
      id,
      eaters: ["Thomas"],
      eatersLabel: "Thomas",
      eaterCount: 1,
      meal: "Jeudi déjeuner",
      dish: "Poulet",
      lid: `Thomas — Jeudi déjeuner — Poulet (${id})`,
      items: [],
      sides: [],
      total: 300,
      shared: false,
      frozen,
      partial: false,
      restOnTheDay: false,
      fromOtherSessions: [],
    });
    const lines = [line("b1", false), line("b2", true)];
    const html = renderToStaticMarkup(createElement(BoxingFold, { lines }));
    expect(html).toMatch(/2 contenants à remplir|2 containers/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*>.*data-box-id/);
  });

  it("sans contenant, pas de section du tout", () => {
    expect(renderToStaticMarkup(createElement(BoxingFold, { lines: [] }))).toBe("");
  });
});

