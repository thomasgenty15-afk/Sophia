import { readFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TableStepPlanning from "./TableStepPlanning";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// L6 (2026-08-18) — LA TÊTE DE L'ÉTAPE `request`, SUR LA VALEUR RENDUE
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert. Patron de `kitchenEquipmentCard.int.test.ts`.
//
// ⚠️ `renderToStaticMarkup` NE JOUE AUCUN EFFET. C'est une contrainte, et c'est
// aussi ce que ce fichier mesure de plus utile: le PREMIER rendu est celui où
// rien n'a encore été lu, et c'est là qu'un formulaire figé au montage écrit du
// vide par-dessus une réponse.
//
// ── RÉDUIT LE 2026-09-03 (A6, P6) ──────────────────────────────────────────
// La troisième carte, « Le déjeuner en semaine », a quitté l'étape 3 pour la
// fiche de chaque bouche sur `/app/household`. Ses dix cas — la porte de
// lecture, la relecture avant `onSaved`, `null` ≠ `Map` vide — ont DÉMÉNAGÉ
// avec elle dans `memberWorkLunchCard.int.test.ts`; ils n'ont pas été
// supprimés. Ce qui reste ici: l'ordre des DEUX cartes restantes, et la porte
// de lecture de l'équipement.
// ===========================================================================

const SETUP_PATH = "/app/setup";

/** Une colonne LUE et vide — « on a lu, il n'y a rien dedans ». */
const READ_EMPTY: PracticalConstraints = { cooking_time_min: 30 };

function html(props: {
  practicalConstraints?: PracticalConstraints | null;
  hasGoal?: boolean;
}): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la page,
  // pas seulement du visiteur —, donc un rendu sans `location` sort en anglais
  // quoi qu'on ait choisi.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: SETUP_PATH, search: "", href: `http://localhost${SETUP_PATH}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(TableStepPlanning, {
      practicalConstraints: props.practicalConstraints === undefined
        ? READ_EMPTY
        : props.practicalConstraints,
      hasGoal: props.hasGoal ?? true,
      onSaved: () => {},
    }),
  );
}

/**
 * LA LANGUE EST UN ÉTAT DE MODULE, DONC ELLE FUIT D'UN TEST À L'AUTRE.
 * Même filet que `kitchenEquipmentCard.int.test.ts`: un fichier qui laisserait
 * `fr` derrière lui ferait tomber un voisin sur une assertion anglaise, et le
 * rouge apparaîtrait ailleurs que là où il est né.
 */
afterEach(() => setChosenUiLocaleForTest("en"));
afterAll(() => setChosenUiLocaleForTest("en"));

describe("l'ordre de l'étape `request`", () => {
  it("⛔ LES MOYENS DE CUISSON PASSENT AVANT LES TRADITIONS", () => {
    // §2: « on demande AVEC QUOI on cuisine avant tout le reste ». L'ordre est
    // mesuré sur le HTML RENDU, pas sur la lecture du fichier: un ordre qui ne
    // tient que par l'œil se défait au premier déplacement de bloc.
    setChosenUiLocaleForTest("fr");
    const out = html({});
    const oven = out.indexOf(fr["setup.equipment.tool_oven"]);
    const traditions = out.indexOf(fr["setup.traditions.title"]);
    expect([oven >= 0, traditions >= 0]).toEqual([true, true]);
    expect(oven).toBeLessThan(traditions);
    setChosenUiLocaleForTest("en");
  });

  it("les deux cartes sont là — et le déjeuner n'y est PLUS (A6)", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({});
    expect(out).toContain(fr["setup.equipment.legend"]);
    expect(out).toContain(fr["setup.traditions.hint"]);
    // La question du déjeuner vit sur `/app/household` depuis le 2026-09-03.
    // La retrouver ici, c'est deux formulaires sur la même colonne.
    expect(out).not.toContain(fr["setup.work_lunch.title"]);
    expect(out).not.toContain(fr["setup.work_lunch.loading"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("⛔ le premier rendu n'affiche AUCUNE réponse non lue", () => {
  it("l'équipement dit qu'il lit tant que la colonne n'est pas arrivée", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ practicalConstraints: null });
    expect(out).toContain(fr["setup.equipment.loading"]);
    expect(out).not.toContain(fr["setup.equipment.tool_oven"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("ce que l'étape dit quand elle ne peut pas écrire", () => {
  it("sans ligne d'objectif, l'équipement le DIT au lieu de se taire", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ hasGoal: false });
    expect(out).toContain(fr["setup.equipment.no_goal"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("⛔ le composant n'a plus ni état ni effet (A6)", () => {
  it("rien à lire ici: la lecture du déjeuner est partie avec sa carte", () => {
    // Lecture de source, commentaires blanchis (patron `routeGuards`): un
    // `useEffect` qui reviendrait ici serait une seconde lecture de la même
    // colonne, celle qu'on regarde le moins.
    const src = readFileSync(new URL("./TableStepPlanning.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(src).not.toContain("useEffect");
    expect(src).not.toContain("useState");
    expect(src).not.toContain("WorkLunch");
    expect(src).not.toContain("people");
    // Et les deux cartes qui restent sont bien là, dans cet ordre.
    expect(src.indexOf("<KitchenEquipmentCard")).toBeGreaterThan(0);
    expect(src.indexOf("<KitchenEquipmentCard")).toBeLessThan(
      src.indexOf("<HouseholdTraditionsCard"),
    );
  });
});
