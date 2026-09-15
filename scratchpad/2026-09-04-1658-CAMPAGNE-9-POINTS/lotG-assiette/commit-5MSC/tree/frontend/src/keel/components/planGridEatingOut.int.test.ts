import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanGrid from "./plan/PlanGrid";
import PlanDayBlock from "./plan/PlanDayBlock";
import { buildPlanGrid } from "../lib/planGridModel";
import { dayMoments } from "../lib/planDayView";
import type { EatingOccasionSlot } from "../api/mealGeneration";
import type { AwayMark } from "../lib/presenceMarks";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// D4 ③ (2026-08-18) — LA CASE « MANGE DEHORS » NE RENDAIT RIEN.
//
// ⛔ LE DÉFAUT. `buildPlanGrid` produit `{ kind: "eating_out" }` depuis le lot
// du déjeuner dehors, `meals.grid.eating_out` existe dans LES DEUX langues —
// et les deux lecteurs rendaient un vide:
//   · `PlanGrid`      → un `<td>` vide, pas même le marqueur d'anomalie;
//   · `PlanDayBlock`  → « Déjeuner — » suivi de rien.
// Chacune des quatre autres branches (`dish`, `away`, `fixed_intake`,
// `leftovers`, `empty`) avait la sienne. C'est-à-dire: le seul état que ce lot
// existait pour SÉPARER d'« absent » était le seul qui ne se disait pas.
//
// ⚠️ POURQUOI ÇA COÛTE PLUS QU'UN MOT MANQUANT. « Dehors » et « absent » sont
// vides de plat tous les deux; ce qui les sépare est ce que le produit DIT —
// « dehors » garde le droit au conseil chiffré du midi (« vise autour de
// 700 »), « absent » non. Une case muette ne se lit donc pas comme « je mange
// ailleurs », elle se lit comme un moment que le plan a oublié de composer.
//
// ⚠️ ON REND ET ON LIT. Un test sur le seul modèle serait resté VERT tout du
// long: le modèle était juste, et c'est précisément pour ça que le trou a
// survécu au lot qui l'a créé.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const RHYTHM: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

/** Mardi midi dehors, mercredi midi absent — les deux états côte à côte. */
const MARKS: AwayMark[] = [
  { day: "tue", slots: ["lunch"], kind: "eating_out" },
  { day: "wed", slots: ["lunch"], kind: "away" },
];

function grid(marks: readonly AwayMark[] = MARKS) {
  return buildPlanGrid({
    days: ["mon", "tue", "wed"],
    rhythm: RHYTHM,
    groups: [],
    awayDays: marks,
    fixedIntakes: [],
    dayProperties: [],
  });
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function gridMarkup(marks: readonly AwayMark[] = MARKS): string {
  return decode(renderToStaticMarkup(createElement(PlanGrid, {
    grid: grid(marks),
    dates: ["2026-08-17", "2026-08-18", "2026-08-19"],
    today: "2026-08-17",
  })));
}

/** Le bloc du MARDI, avec ses moments lus dans la grille — comme la vue jour. */
function dayMarkup(marks: readonly AwayMark[] = MARKS): string {
  return decode(renderToStaticMarkup(createElement(PlanDayBlock, {
    group: { day: "tue", dishes: [] },
    date: "2026-08-18",
    today: "2026-08-17",
    preparations: [],
    cookingSessions: [],
    wave: null,
    shoppingList: [],
    moments: dayMoments(grid(marks), "tue"),
    portions: [],
  })));
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("D4 ③ · la grille dit « dehors »", () => {
  it("⛔ LE DÉFAUT — le mot est RENDU, et le `<td>` n'est plus vide", () => {
    expect(gridMarkup()).toContain(en["meals.grid.eating_out"]);
  });

  it("« dehors » n'est PAS « absent »: les deux mots sortent, une fois chacun", () => {
    // Le cœur du lot. Les confondre ferait taire le conseil du midi de
    // quelqu'un qui déjeune dehors, ou le ferait apparaître pendant ses
    // vacances.
    const html = gridMarkup();
    expect(occurrences(html, en["meals.grid.eating_out"])).toBe(1);
    expect(occurrences(html, en["meals.grid.away"])).toBe(1);
    expect(en["meals.grid.eating_out"]).not.toBe(en["meals.grid.away"]);
  });

  it("⛔ ET CE N'EST PAS LE MARQUEUR D'ANOMALIE — l'ambre reste au vrai vide", () => {
    // « Dehors » est une déclaration de la personne, pas un défaut du plan.
    // La peindre en ambre accuserait quelqu'un d'avoir déjeuné au restaurant.
    // Le `<span>` du mot porte donc le ton des silences.
    const html = gridMarkup();
    const at = html.indexOf(en["meals.grid.eating_out"]);
    const span = html.lastIndexOf("<span", at);
    expect(html.slice(span, at)).toContain("text-ink-soft");
    expect(html.slice(span, at)).not.toContain("amber");
    // ⚠️ LE CAS QUI PASSE, sinon cette assertion tiendrait sur un écran qui
    // aurait perdu l'ambre PARTOUT: les six moments restants du rythme sont
    // vides, et ceux-là sont bien l'anomalie.
    expect(html).toContain(en["meals.grid.empty"]);
    expect(html).toContain("text-amber-700");
  });

  it("le jour rend le motif à côté du nom du moment, pas un tiret nu", () => {
    const html = dayMarkup();
    expect(html).toContain(en["meals.grid.eating_out"]);
    // Le moment est nommé juste avant: sans lui, la ligne dit « dehors » sans
    // dire de QUEL repas elle parle.
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain(`${en["meals.slot.lunch"]} — ${en["meals.grid.eating_out"]}`);
  });

  it("le jour ne se dit PAS « rien à faire » quand il porte un dehors", () => {
    // `quiet` se lirait comme une panne au-dessus d'une ligne qui, elle, a
    // quelque chose à dire.
    expect(dayMarkup()).not.toContain(en["meals.result.day_nothing"]);
  });
});

describe("D4 ③ · les deux langues", () => {
  // ═════════════════════════════════════════════════════════════════════════
  // ⚠️ `meals` N'EST PAS DANS `TRANSLATED_NAMESPACES`, ET CE N'EST PAS UN
  // OUBLI DE CE LOT. L'app authentifiée se rend en anglais par décision
  // déclarée (`i18n/catalog.ts`): `t()` retombe sur le pack anglais pour toute
  // clé hors périmètre, même quand le pack français la porte. Le mot français
  // existe donc, écrit et testé, et il attend que le namespace entre.
  //
  // ⛔ CE QUE CE FICHIER A MESURÉ EN L'ÉCRIVANT: une assertion « le français
  // sort en français » posée ici est ROUGE, et elle l'est sur la frontière, pas
  // sur ce lot. La garder aurait fait réparer la frontière en passant — sous
  // couvert d'un lot sur une case de grille. Elle est donc remplacée par ce qui
  // est vrai des deux côtés: le rendu suit le pack anglais, et les DEUX packs
  // séparent « dehors » d'« absent ».
  // ═════════════════════════════════════════════════════════════════════════
  it("la frontière tient: le rendu reste anglais, jeton français ou non", () => {
    setChosenUiLocaleForTest("fr");
    try {
      const html = gridMarkup();
      expect(html).toContain(en["meals.grid.eating_out"]);
      expect(dayMarkup()).toContain(en["meals.grid.eating_out"]);
    } finally {
      setChosenUiLocaleForTest("en");
    }
  });

  it("les deux packs séparent « dehors » d'« absent »", () => {
    // Deux libellés identiques rendraient le lot invisible dans la langue où
    // ils le sont — c'est la cicatrice « garde testée dans une seule langue ».
    for (const pack of [en, fr]) {
      expect(pack["meals.grid.eating_out"].trim()).not.toBe("");
      expect(pack["meals.grid.eating_out"]).not.toBe(pack["meals.grid.away"]);
    }
  });
});
