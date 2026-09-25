import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DayEnergyLine } from "./EnergyReadout";
import { type DayEnergyView, readDay } from "../../api/mealEnergy";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { setChosenUiLocaleForTest } from "../../i18n/runtime";

// ===========================================================================
// LE TOTAL D'UN JOUR, SUR LA VALEUR RENDUE
//
// ⟳ 2026-09-24 — l'incise « sur les N repas que j'ai composés (1 repas
// dehors) » et le conseil du midi (« vise autour de 700 ») sont partis avec
// l'état « dehors ». Ce banc garde les trois phrases qui restent, et qu'un
// serveur pas encore redéployé ne les fait pas revenir.
//
// ⚠️ CE BANC PORTE LE HTML, PAS LA FONCTION. Des tests de source sont restés
// verts sur du code mort dans ce dépôt.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

/** `/app/plan` et `/app/today` rendent tous deux `DayEnergyLine`. */
const PATH = "/app/plan";

function html(energy: DayEnergyView, locale: "en" | "fr" = "en"): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la
  // page, pas seulement du visiteur —, donc un rendu sans `location` sort en
  // anglais quoi qu'on ait choisi.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
  return renderToStaticMarkup(createElement(DayEnergyLine, { energy }));
}

function text(markup: string): string {
  return markup
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le jour NOMINAL: le plan a composé toute la journée. */
const WHOLE_DAY = readDay({
  day: "tue",
  kcal: 1400,
  basis: "plan_quantities",
  complete: true,
  dishes_counted: 3,
  dishes_total: 3,
});

describe("le total d'un jour", () => {
  it("LE CAS QUI PASSE: une journée lisible parle de la journée", () => {
    expect(text(html(WHOLE_DAY))).toBe(en["meals.energy.day"].replace("{n}", "1400"));
    expect(text(html(WHOLE_DAY, "fr"))).toBe(fr["meals.energy.day"].replace("{n}", "1400"));
  });

  it("⚠️ UN JOUR PARTIEL PORTE SES DEUX NOMBRES", () => {
    const body = text(html(readDay({
      day: "tue",
      kcal: 700,
      complete: false,
      dishes_counted: 1,
      dishes_total: 2,
    })));
    expect(body).toContain("1 of 2 dishes counted");
  });

  it("⛔ LOT A1 — AUCUN AJOUT INVISIBLE DANS LE TOTAL D'UN JOUR", () => {
    // La branche « dont {addon} ajoutées » est partie avec les `member_deltas`
    // de FF-043 (un riz sans boîte, sans ligne de courses et sans carte). Un
    // serveur qui renverrait encore `addon_kcal` ne doit RIEN changer au
    // rendu: ni le nombre, ni la phrase.
    const body = text(html(readDay({
      day: "tue",
      kcal: 1400,
      complete: true,
      dishes_counted: 2,
      dishes_total: 2,
      addon_kcal: 180,
    })));
    expect(body).not.toContain("180");
    expect(body).toBe(en["meals.energy.day"].replace("{n}", "1400"));
  });

  it("⛔ UN SERVEUR D'AVANT LE RETRAIT DE « DEHORS » NE CHANGE RIEN AU RENDU", () => {
    // `meals_out`, `subject` et `eating_out_advice` peuvent encore arriver d'une
    // fonction pas redéployée. Aucun lecteur ne doit les reprendre.
    const stale = readDay({
      day: "tue",
      kcal: 1400,
      complete: true,
      dishes_counted: 2,
      dishes_total: 2,
      meals_out: 1,
      subject: "what_the_plan_made",
      eating_out_advice: [{ slot: "lunch", kcal: 700 }],
    });
    for (const key of ["subject", "mealsOut", "eatingOutAdvice"]) {
      expect(Object.hasOwn(stale, key), key).toBe(false);
    }
    const body = text(html(stale));
    expect(body).toBe(en["meals.energy.day"].replace("{n}", "1400"));
    expect(body).not.toContain("I composed");
    expect(body).not.toContain("aim for around");
  });

  it("⚠️ UNE JOURNÉE ILLISIBLE GARDE SA PHRASE, et n'en reçoit pas deux", () => {
    const body = text(html(readDay({
      day: "tue",
      kcal: null,
      complete: false,
      dishes_counted: 0,
      dishes_total: 2,
    })));
    expect(body).toBe(en["meals.energy.day_unreadable"]);
  });

  it("⛔ AUCUN SOLDE, AUCUN VERDICT, AUCUNE COULEUR NEUVE", () => {
    const markup = html(WHOLE_DAY);
    for (const word of ["left", "remaining", "missing", "deficit", "short"]) {
      expect(text(markup).toLowerCase()).not.toContain(word);
    }
    expect(markup).toContain("text-ink-soft");
    expect(markup).not.toContain("text-amber-700");
    expect(markup).not.toContain("text-red");
  });
});
