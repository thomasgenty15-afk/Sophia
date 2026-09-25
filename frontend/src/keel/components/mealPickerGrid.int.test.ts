import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealPickerGridBody } from "./MealPickerGrid";
import {
  type GridCell,
  lineStateOf,
  lineToggleTarget,
} from "../lib/presenceAbsence";
import {
  type AwayMark,
  parseAwayMarks,
  type PresenceState,
  presenceStateOf,
} from "../lib/presenceMarks";
import { en as EN } from "../i18n/en";

// ===========================================================================
// LA GRILLE DE PRÉSENCE, SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LE COMPOSANT ET LIT SON HTML. Un test de source serait
// vert sur du code mort. La seule question qui compte est « QU'EST-CE QUE LE
// LECTEUR VOIT ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: le glob de `vitest.config.ts` est
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert.
//
// ⟳ 2026-09-24 — le sélecteur à trois états (« dehors ») est retiré. Une case
// est cochée (à table) ou décochée (absent), et une ancienne entrée
// `kind: "eating_out"` se relit décochée.
// ===========================================================================

const DAYS = ["mon", "tue"];
const DATES = ["2026-08-17", "2026-08-18"];
const RHYTHM = [
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

/**
 * ⚠️ ON MONTE LE CORPS, PAS LA FENÊTRE. `Modal` passe par `createPortal` vers
 * `document.body`, et ce dépôt n'a ni jsdom ni testing-library: monter la
 * fenêtre entière tomberait sur « document is not defined ». Le corps est
 * exporté pour ça, et l'état qu'on lui passe ici est CELUI QUE LE COMPOSANT DU
 * DESSUS CALCULE — la même `presenceStateOf`, sur la même colonne relue.
 */
function render(away: readonly AwayMark[] = []): string {
  const state = new Map<string, PresenceState>();
  for (const day of DAYS) {
    for (const r of RHYTHM) {
      const at = presenceStateOf(away, day, r.slot);
      if (at !== "at_table") state.set(`${day}|${r.slot}`, at);
    }
  }
  return renderToStaticMarkup(
    createElement(MealPickerGridBody, {
      days: DAYS,
      dates: DATES,
      rhythm: RHYTHM,
      state,
      setCell: () => {},
      toggle: () => {},
      save: () => {},
      onClose: () => {},
      busy: false,
    }),
  );
}

/** Les cases de repas, sans les cases d'en-tête (`data-line`). */
function mealCells(html: string): string[] {
  return [...html.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !tag.includes("data-line"));
}

describe("deux états: une case à cocher par repas", () => {
  it("des cases à cocher, aucun sélecteur", () => {
    const html = render();
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("<select");
    expect(html).toContain("min-w-[26rem]");
  });

  it("une case absente est DÉCOCHÉE, les autres cochées", () => {
    const cells = mealCells(render([{ day: "tue", slots: ["lunch"], kind: "away" }]));
    // Deux jours × deux moments = quatre cases; trois cochées, une non.
    expect(cells.length).toBe(4);
    expect(cells.filter((tag) => tag.includes('checked=""')).length).toBe(3);
  });

  it("une ancienne case « dehors » se relit décochée — absente", () => {
    const legacy = parseAwayMarks([{ day: "tue", slots: ["lunch"], kind: "eating_out" }]);
    expect(legacy).toEqual([{ day: "tue", slots: ["lunch"], kind: "away" }]);
    const cells = mealCells(render(legacy));
    expect(cells.filter((tag) => tag.includes('checked=""')).length).toBe(3);
  });

  it("une JOURNÉE ENTIÈRE se déplie sur tous les moments du rythme", () => {
    // La grille n'a pas de case « toute la journée » — en avoir une ferait deux
    // façons de dire la même chose.
    const cells = mealCells(render([{ day: "mon", slots: [], kind: "away" }]));
    // Ordre de rendu: lundi/midi, mardi/midi, lundi/dîner, mardi/dîner.
    expect(cells.map((tag) => tag.includes('checked=""'))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});

// ===========================================================================
// ⟳ 2026-09-23 — TOUTE UNE LIGNE, TOUTE UNE COLONNE
//
// Demandé: décocher « dîner » une fois pour toute la semaine, ou « vendredi »
// une fois pour toute la journée.
// ===========================================================================
describe("les cases d'en-tête — une ligne = un repas, une colonne = un jour", () => {
  it("une case par ligne et une par colonne, nommées", () => {
    const html = render();
    const heads = [...html.matchAll(/<input[^>]*data-line[^>]*>/g)].map((m) => m[0]);
    // Deux moments + deux jours.
    expect(heads.length).toBe(4);
    expect(html).toContain(EN["meals.picker.bulk_hint"]);
    expect(html).toContain("Lunch — every day");
    expect(html).toContain("— every meal");
  });

  it("cochée quand la ligne est entière à table, pas quand elle est mêlée", () => {
    const html = render([{ day: "tue", slots: ["lunch"], kind: "away" }]);
    const heads = [...html.matchAll(/<input[^>]*data-line[^>]*>/g)].map((m) => m[0]);
    const checked = heads.filter((tag) => tag.includes('checked=""'));
    // Colonne lundi (entière) et ligne dîner (entière): cochées. Colonne mardi
    // et ligne midi (mêlées): non.
    expect(checked.length).toBe(2);
    expect(heads.filter((tag) => tag.includes('aria-checked="mixed"')).length).toBe(2);
  });

  it("tant qu'un repas de la ligne est à table, elle se retire en entier", () => {
    const row: GridCell[] = [["mon", "dinner"], ["tue", "dinner"]];
    expect(lineToggleTarget(new Map(), row)).toBe("away");
    // ⛔ MÊLÉE ⇒ RETIRÉE. « Je décoche dîner » avec un mardi soir déjà décoché
    // ne doit pas remettre la ligne à table.
    const mixed = new Map<string, PresenceState>([["tue|dinner", "away"]]);
    expect(lineStateOf(mixed, row)).toBe("mixed");
    expect(lineToggleTarget(mixed, row)).toBe("away");
    const none = new Map<string, PresenceState>([
      ["mon|dinner", "away"],
      ["tue|dinner", "away"],
    ]);
    expect(lineStateOf(none, row)).toBe("none");
    expect(lineToggleTarget(none, row)).toBe("at_table");
  });
});
