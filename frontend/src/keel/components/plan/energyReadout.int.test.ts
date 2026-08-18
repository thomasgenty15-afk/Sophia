import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DayEnergyLine } from "./EnergyReadout";
import { type DayEnergyView, readDay } from "../../api/mealEnergy";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { setChosenUiLocaleForTest } from "../../i18n/runtime";

// ===========================================================================
// ② (2026-08-18) — LE CHIFFRE DU JOUR CHANGE DE SUJET, SUR LA VALEUR RENDUE
//
// ⛔ LE DÉFAUT, ÉNONCÉ PAR LA DÉCISION PRODUIT §2.2. Si un repas sur trois est
// pris dehors, « ta journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX,
// et faux dans le sens qui décourage: la personne lit un déficit alors qu'elle
// a peut-être mangé un burger. Le serveur nommait déjà `meals_out` et `subject`
// depuis L8 ③ — et AUCUN lecteur ne les lisait: `readDay` ne les copiait pas,
// `DayEnergyView` ne les portait pas, et l'écran continuait d'annoncer « sur la
// journée ». Un écrivain sans lecteur, la moitié débranchée que ce dépôt paie
// en boucle.
//
// ⚠️ CE BANC PORTE LE HTML, PAS LA FONCTION. Des tests de source sont restés
// verts sur du code mort dans ce dépôt. La seule question qui compte est « la
// phrase affichée revendique-t-elle encore la journée entière ».
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
  addon_kcal: 0,
  meals_out: 0,
  subject: "the_day",
});

/** Le même jour, un midi pris dehors: le plan n'a composé que deux repas. */
const ONE_MEAL_OUT = readDay({
  day: "tue",
  kcal: 1400,
  basis: "plan_quantities",
  complete: true,
  dishes_counted: 2,
  dishes_total: 2,
  addon_kcal: 0,
  meals_out: 1,
  subject: "what_the_plan_made",
});

describe("② le total d'un jour dit de quoi il parle", () => {
  it("LE CAS QUI PASSE: une journée entière parle toujours de la journée", () => {
    // Sans ce cas, un rendu qui dirait « sur les N repas que j'ai composés »
    // PARTOUT laisserait le banc vert, et le produit se mettrait à s'excuser
    // d'un plan complet.
    const body = text(html(WHOLE_DAY));
    expect(body).toContain(en["meals.energy.day"].replace("{n}", "1400"));
    expect(body).not.toContain("I composed");
  });

  it("⛔ un repas dehors: la phrase NE REVENDIQUE PLUS la journée", () => {
    const body = text(html(ONE_MEAL_OUT));
    // ⚠️ L'ASSERTION QUI PORTE TOUT LE LOT. « across the day » est très
    // exactement l'affirmation devenue fausse; l'incise ne s'y ajoute pas, elle
    // la remplace — sinon la ligne se contredirait dans sa propre longueur.
    expect(body).not.toContain(en["meals.energy.day"].replace("{n}", "1400"));
    expect(body).toContain("1400 kcal across the 2 meals I composed (1 meal out)");
  });

  it("… ET EN FRANÇAIS, sans l'anglais à côté", () => {
    const body = text(html(ONE_MEAL_OUT, "fr"));
    expect(body).toContain("1400 kcal sur les 2 repas que j'ai composés (1 repas dehors)");
    expect(body).not.toContain("I composed");
    expect(body).not.toContain(fr["meals.energy.day"].replace("{n}", "1400"));
  });

  it("⚠️ LES DEUX INCOMPLÉTUDES SE DISENT, l'une ne mange pas l'autre", () => {
    // « je n'ai pas su lire tous les plats » se répare par le référentiel;
    // « il manquait des plats à lire » ne se répare pas, c'est la vie de
    // quelqu'un. Un écran qui n'en dirait qu'une nommerait la mauvaise — et
    // proposerait de curer une table pour un midi au restaurant.
    const body = text(html(readDay({
      day: "tue",
      kcal: 700,
      complete: false,
      dishes_counted: 1,
      dishes_total: 2,
      addon_kcal: 0,
      meals_out: 1,
      subject: "what_the_plan_made",
    })));
    expect(body).toContain("1 of 2 dishes counted");
    expect(body).toContain("across the 2 meals I composed (1 meal out)");
  });

  it("⚠️ L'ADD-ON SURVIT AUSSI: le sujet s'y ajoute, il ne le remplace pas", () => {
    const body = text(html(readDay({
      day: "tue",
      kcal: 1580,
      complete: true,
      dishes_counted: 2,
      dishes_total: 2,
      addon_kcal: 180,
      meals_out: 1,
      subject: "what_the_plan_made",
    })));
    expect(body).toContain("180");
    expect(body).toContain("across the 2 meals I composed (1 meal out)");
  });

  it("⛔ LE PIÈGE DU 0–0 NE SE REJOUE PAS: pas de « 0 repas dehors »", () => {
    // Le 2026-08-18, `Number(null) === 0` a fabriqué « Autour de 0–0 par jour »
    // et effacé la phrase qui invitait à ajouter une pesée. Ici la forme
    // dégradée serait une incise qui restreint le sujet du nombre en avouant
    // qu'il n'y a aucune raison de le restreindre — et qui remplacerait « sur
    // la journée », lequel était vrai.
    for (const broken of [null, undefined, 0, "", -1]) {
      const body = text(html(readDay({
        day: "tue",
        kcal: 1400,
        complete: true,
        dishes_counted: 3,
        dishes_total: 3,
        addon_kcal: 0,
        meals_out: broken,
        subject: "what_the_plan_made",
      })));
      expect(body).toContain(en["meals.energy.day"].replace("{n}", "1400"));
      expect(body).not.toContain("I composed");
      expect(body).not.toContain("0 meal");
    }
  });

  it("⚠️ UNE JOURNÉE ILLISIBLE GARDE SA PHRASE, et n'en reçoit pas deux", () => {
    // « Pas assez de détail pour additionner cette journée » est la SEULE chose
    // à dire quand il n'y a pas de total: une incise qui commence par « ce
    // total » n'a rien à qualifier, et l'effacement d'une phrase de réparation
    // par une phrase fabriquée est le défaut exact que ce lot ne rejoue pas.
    const body = text(html(readDay({
      day: "tue",
      kcal: null,
      complete: false,
      dishes_counted: 0,
      dishes_total: 2,
      addon_kcal: 0,
      meals_out: 1,
      subject: "what_the_plan_made",
    })));
    expect(body).toBe(en["meals.energy.day_unreadable"]);
  });

  it("⛔ AUCUN SOLDE, AUCUN VERDICT, AUCUNE COULEUR NEUVE", () => {
    // Le total d'un jour tronqué est le point du produit où « il te reste 680
    // kcal » serait le plus tentant. Il n'existe nulle part, et la teinte reste
    // celle du total — décidée par `complete`, pas par le nombre de repas
    // dehors.
    const markup = html(ONE_MEAL_OUT);
    for (const word of ["left", "remaining", "missing", "deficit", "short"]) {
      expect(text(markup).toLowerCase()).not.toContain(word);
    }
    expect(markup).toContain("text-ink-soft");
    expect(markup).not.toContain("text-amber-700");
    expect(markup).not.toContain("text-red");
  });
});
