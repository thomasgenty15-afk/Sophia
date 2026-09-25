import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DishCard, { type DishReplaceControl } from "./DishCard";
import type { GeneratedDish } from "../api/mealGeneration";
import { en } from "../i18n/en";

// ===========================================================================
// ⟳ 2026-09-24 — UNE LIGNE PAR PLAT SUR L'APERÇU, ET « REMPLACER ».
// ===========================================================================
//
// Demandé: « que les titres des repas, avec les ingrédients, sans grammages —
// le but est une lecture rapide, parfois à huit personnes », avec un dépliant
// par plat qui ramène l'affichage d'avant, et un bouton rouge « Remplacer ».
//
// Ce que ce fichier tient:
//   ① fermée, la carte compacte ne montre QUE son titre (et son chiffre): le
//      geste du jour est dans le DOM, sous `hidden` — le pli cache, il ne
//      démonte pas;
//   ② hors aperçu (`compact` absent), la carte est celle d'avant, sans titre
//      bouton;
//   ③ « Remplacer » se rend quand l'appelant fournit la commande, grisé quand
//      elle est fermée; un plat barré montre sa raison et « Garder ce plat ».
//
// ⚠️ `.ts` ET `createElement`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.

const DISH = {
  title: "Lait, pêche, avoine et purée de cacahuètes",
  name: null,
  slot: "afternoon_snack",
  day: "wed",
  ingredients: [],
  method: "Écraser la pêche à la fourchette, puis la mélanger avec le lait.",
  why: "",
  uses: [],
  boxes: [],
  side_courses: [],
  same_day: { kind: "assemble", minutes: 5 },
  member_id: null,
} as unknown as GeneratedDish;

function control(over: Partial<DishReplaceControl> = {}): DishReplaceControl {
  return {
    struck: null,
    canReplace: true,
    onReplace: () => {},
    onKeep: () => {},
    ...over,
  };
}

function markup(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(DishCard, { dish: DISH, slotBadge: false, ...props }),
  ).replace(/&#x27;/g, "'");
}

/** Le contenu de la ligne dépliable (`hidden` tant qu'elle est fermée). */
function rowBody(html: string): string {
  // React écrit les attributs dans l'ordre du JSX: `id` puis `hidden`.
  const m = /<div id="[^"]*" hidden="">/.exec(html);
  return m === null ? "" : html.slice(m.index);
}

describe("la carte compacte de l'aperçu", () => {
  it("① fermée: le titre est le bouton, le reste est caché sans être démonté", () => {
    const html = markup({ compact: true });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(DISH.title);
    const body = rowBody(html);
    expect(body, "la ligne n'est plus repliée").not.toBe("");
    // Le geste du jour existe, mais sous le pli.
    expect(body).toContain(DISH.method);
    expect(body).toContain(en["meals.same_day.assemble"]);
  });

  it("① bis — la ligne SE VOIT dépliable: une pastille ronde, un chevron qui tourne, et toute la ligne est la cible", () => {
    // ⟳ 2026-09-24 — retour du propriétaire: « on comprend pas vraiment
    // qu'on peut cliquer pour déplier ». Le « ▸ » de 12 px est parti.
    const closed = markup({ compact: true });
    const button = closed.slice(closed.indexOf("<button"), closed.indexOf("</button>"));
    expect(button).toContain("rounded-full border");
    expect(button).toContain("<svg");
    expect(button).not.toContain("rotate-90");
    expect(button, "la ligne entière est la cible").toContain("flex-1");
    expect(closed).not.toContain("▸");
    // Le titre de l'aperçu est en `text-sm` (« les titres sont trop gros »).
    expect(button).toMatch(/text-sm font-medium[^"]*"[^>]*>Lait, pêche/);
  });

  it("① ter — ⟳ 2026-09-25: TOUTE la carte est la cible, « partout sauf Changer »", () => {
    // Retour du propriétaire: seul le titre ouvrait la carte, et l'anneau de
    // focus ne cernait que lui. Le clic de surface est un confort de souris
    // (`onCardClick`); le bouton du titre reste le contrôle du clavier.
    const closed = markup({ compact: true, replace: control() });
    const card = closed.slice(0, closed.indexOf(">"));
    expect(card).toContain("cursor-pointer");
    expect(card).toContain("hover:bg-paper-2");
    // L'anneau de focus du bouton du titre est porté par la CARTE.
    expect(card).toContain("has-[[data-row-toggle]:focus-visible]:outline-2");
    const button = closed.slice(closed.indexOf("<button"), closed.indexOf("</button>"));
    expect(button).toContain("data-row-toggle");
    // Et le bouton n'a plus son propre anneau (règle hors `@layer`, `tokens.css`).
    const tokens = readFileSync(resolve(__dirname, "../../tokens.css"), "utf8");
    expect(tokens).toMatch(/\[data-row-toggle\]:focus-visible \{\s*outline: none;/);
    expect(button, "le survol est celui de la carte").not.toContain("hover:bg-paper-2");
    // « Changer » et la marge autour sont hors de la cible.
    const replace = closed.slice(closed.indexOf("data-no-row-toggle"));
    expect(replace).toContain(en["meals.dish.replace"]);
    // Ouverte, la carte ne se replie plus sous la souris: plus de curseur ni de
    // survol sur la surface, seulement sur la tête.
    const source = readFileSync(resolve(__dirname, "DishCard.tsx"), "utf8");
    expect(source).toContain('if (rowOpen && !target.closest("[data-row-head]")) return;');
    expect(source).toContain('"button, a, input, select, textarea, label, [role=dialog], [data-no-row-toggle]"');
    // Hors aperçu, aucune de ces cibles.
    const plain = markup({});
    expect(plain).not.toContain("data-row-toggle");
    expect(plain).not.toContain("data-row-head");
    expect(plain.slice(0, plain.indexOf(">"))).not.toContain("cursor-pointer");
  });

  it("② hors aperçu, la carte est celle d'avant", () => {
    const html = markup({});
    expect(html).not.toContain('aria-expanded="false" aria-controls');
    expect(rowBody(html), "la carte du plan adopté s'est repliée").toBe("");
    expect(html).toContain(DISH.method);
  });

  it("③ « Changer » se rend, en gris de la palette, quand la commande est là", () => {
    const html = markup({ compact: true, replace: control() });
    expect(html).toContain(en["meals.dish.replace"]);
    // ⟳ 2026-09-24 — retour du propriétaire: pas de rouge, les gris du
    // bouton secondaire (bord `line-strong`, texte `ink-soft`).
    expect(html).toMatch(/border-line-strong[^"]*text-ink-soft/);
    expect(html).not.toMatch(/red-|#A34A4A|#B86B6B/);
    expect(markup({ compact: true }), "un bouton sans commande").not.toContain(
      en["meals.dish.replace"],
    );
  });

  it("③ fermée (plus de reprise, plafond, travail en cours), elle est grisée", () => {
    const html = markup({ compact: true, replace: control({ canReplace: false }) });
    const button = html.slice(html.lastIndexOf("<button", html.indexOf(en["meals.dish.replace"])));
    expect(button.slice(0, button.indexOf(">"))).toContain("disabled");
  });

  it("③ barré: le titre est rayé, la raison est dite, et on peut le garder", () => {
    const html = markup({
      compact: true,
      replace: control({ struck: { reason: "trop sucré" } }),
    });
    expect(html).toContain("line-through");
    expect(html, "la raison du plat barré n'est plus en rouge").not.toMatch(/red-|#A34A4A/);
    expect(html).toContain(en["meals.dish.replace_reason"].replace("{reason}", "trop sucré"));
    expect(html).toContain(en["meals.dish.keep"]);
    expect(html, "« Remplacer » reste à côté d'un plat déjà barré").not.toContain(
      `>${en["meals.dish.replace"]}<`,
    );
  });
});
