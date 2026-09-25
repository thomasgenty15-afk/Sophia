import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresenceList, type PresenceRow } from "./PlanRequestFields";
import {
  awayMomentsIn,
  clearWindow,
  isAwayAllWindow,
  markAwayAllWindow,
} from "../lib/presenceAbsence";
import type { AwayMark } from "../lib/presenceMarks";
import { en as EN } from "../i18n/en";

// ===========================================================================
// ⟳ 2026-09-23 — « QUI MANGE À LA MAISON », LA LISTE DES DEUX ÉCRANS
//
// Demandé: une ligne par personne (la version de `/app/plan`), et un bouton
// « absence » pour retirer quelqu'un de tout le plan (vacances) sans décocher
// chaque repas.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: le glob de `vitest.config.ts`
// est `src/**/*.int.test.ts`. Les grilles sont montées FERMÉES: `Modal` rend
// `null`, donc pas de `createPortal` ni de `document`.
// ===========================================================================

const DAYS = ["mon", "tue", "wed"];
const DATES = ["2026-09-28", "2026-09-29", "2026-09-30"];
const RHYTHM = [
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

function row(over: Partial<PresenceRow> & { key: string }): PresenceRow {
  return {
    name: over.key,
    slots: RHYTHM,
    away: [],
    save: async () => {},
    ...over,
  };
}

function render(rows: PresenceRow[]): string {
  return renderToStaticMarkup(
    createElement(PresenceList, {
      rows,
      days: { tokens: DAYS, dates: DATES },
      disabled: false,
    }),
  );
}

describe("les fonctions de l'absence", () => {
  it("absent = aucun repas de la fenêtre, comme `absentAllWindow` côté serveur", () => {
    const all = markAwayAllWindow([], DAYS);
    expect(all).toEqual([
      { day: "mon", slots: [], kind: "away" },
      { day: "tue", slots: [], kind: "away" },
      { day: "wed", slots: [], kind: "away" },
    ]);
    expect(isAwayAllWindow(all, DAYS, ["lunch", "dinner"])).toBe(true);
    // Un seul repas encore à table: pas absent.
    const partial: AwayMark[] = [
      { day: "mon", slots: [], kind: "away" },
      { day: "tue", slots: [], kind: "away" },
      { day: "wed", slots: ["lunch"], kind: "away" },
    ];
    expect(isAwayAllWindow(partial, DAYS, ["lunch", "dinner"])).toBe(false);
  });

  it("⛔ les jours HORS fenêtre sont repris tels quels, à l'aller comme au retour", () => {
    const sunday: AwayMark = { day: "sun", slots: ["lunch"], kind: "away" };
    const marked = markAwayAllWindow([sunday], DAYS);
    expect(marked[0]).toEqual(sunday);
    expect(clearWindow(marked, DAYS)).toEqual([sunday]);
  });

  it("sans jour ou sans repas, personne n'est dit absent", () => {
    expect(isAwayAllWindow([], [], ["lunch"])).toBe(false);
    expect(isAwayAllWindow([], DAYS, [])).toBe(false);
  });

  it("le compteur: une journée entière compte tous ses repas", () => {
    expect(awayMomentsIn([{ day: "mon", slots: [], kind: "away" }], DAYS, 2)).toBe(2);
    expect(awayMomentsIn([{ day: "sun", slots: [], kind: "away" }], DAYS, 2)).toBe(0);
  });
});

describe("la liste rendue", () => {
  it("une ligne par personne, son état, et « Modifier »", () => {
    const html = render([
      row({ key: "Léa" }),
      row({ key: "Marc", away: [{ day: "mon", slots: ["dinner"], kind: "away" }] }),
    ]);
    expect(html).toContain(EN["plan.request.presence_title"]);
    expect(html).toContain("Léa");
    expect(html).toContain(EN["plan.request.presence_all_home"]);
    expect(html).toContain("1 meal away");
    expect(html.split(EN["plan.request.presence_open"]).length - 1).toBe(2);
  });

  it("« Absence » sur chaque ligne dès deux personnes", () => {
    const html = render([row({ key: "Léa" }), row({ key: "Marc" })]);
    expect(html.split(`>${EN["plan.request.presence_absence"]}<`).length - 1).toBe(2);
    expect(html).toContain('aria-label="Léa: away for this whole plan"');
  });

  it("⛔ seul, pas d'« Absence »: il ne resterait rien à composer", () => {
    const html = render([row({ key: "Léa" })]);
    expect(html).not.toContain(`>${EN["plan.request.presence_absence"]}<`);
  });

  it("une personne absente le dit, et offre de l'annuler", () => {
    const html = render([
      row({ key: "Léa" }),
      row({ key: "Marc", away: markAwayAllWindow([], DAYS) }),
    ]);
    expect(html).toContain(EN["plan.request.presence_absent"]);
    expect(html).toContain(EN["plan.request.presence_absence_undo"]);
    expect(html).not.toContain(EN["plan.request.presence_everyone_away"]);
  });

  it("⛔ personne à la maison: le refus est dit sous la liste, avant de composer", () => {
    const html = render([
      row({ key: "Léa", away: markAwayAllWindow([], DAYS) }),
      row({ key: "Marc", away: markAwayAllWindow([], DAYS) }),
    ]);
    expect(html).toContain(EN["plan.request.presence_everyone_away"]);
  });

  it("aucune ligne, aucune liste", () => {
    expect(render([])).toBe("");
  });
});
