import { readFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import KitchenEquipmentCard from "../components/KitchenEquipmentCard";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// A5 (2026-09-03) — « PARAMÈTRES DU FOYER », ET CE QUI RESTE DANS L'ENTONNOIR
//
// ── D'OÙ VIENT CE FICHIER ─────────────────────────────────────────────────
// Il REMPLACE `components/tableStepPlanning.int.test.ts`: `TableStepPlanning`
// a disparu (A5, point 4). Ses cas ne sont pas supprimés — ils sont ici, sur
// leurs deux nouveaux sites:
//   · l'ordre « les moyens de cuisson AVANT les traditions » devient une
//     propriété de PAGE, pas d'un composant enveloppe: les deux cartes sont
//     maintenant sur `/app/household`, l'une au-dessus de l'autre;
//   · la porte de lecture de l'équipement et son refus « pas de ligne
//     d'objectif » restent mesurés sur le rendu de la carte elle-même, qui est
//     la MÊME des deux côtés;
//   · « le déjeuner n'est plus là » (A6) reste gardé par
//     `memberWorkLunchCard.int.test.ts` et `memberSheetFrames.int.test.ts`.
//
// ── CE QUE LE DÉPLACEMENT RÉPARE, ET QUI N'EST PAS UNE MISE EN PAGE ───────
// Les deux cartes vivaient à l'étape 3 d'un entonnoir QUE PERSONNE NE REJOUE.
// Changer de four, ou décider que le dimanche est un repas de famille, n'avait
// donc plus aucun écran après l'inscription. L'équipement RESTE aussi dans
// l'entonnoir (le congélateur décide du nombre de courses, lane CUISINE, donc
// la question doit être posée avant le premier plan); les traditions, qui ne
// gouvernent rien avant le premier plan, en SORTENT.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté.
//
// ⚠️ ON MONTE LA CARTE, PAS LA PAGE: `HouseholdPage` ne se rend pas sous
// `renderToStaticMarkup`. Ce que le rendu ne peut pas dire — QUI monte QUOI, et
// dans quel ordre — est lu dans la source, commentaires blanchis (cicatrice
// `caller-audit-must-strip-comments`: les deux fichiers PARLENT longuement des
// cartes déplacées, et un grep naïf compterait ces morts-là comme des vivants).
// ===========================================================================

const HOUSEHOLD_PATH = "/app/household";

/** Une colonne LUE et vide — « on a lu, il n'y a rien dedans ». */
const READ_EMPTY: PracticalConstraints = { cooking_time_min: 30 };

function equipmentHtml(props: {
  practicalConstraints?: PracticalConstraints | null;
  hasGoal?: boolean;
}): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la page,
  // pas seulement du visiteur —, donc un rendu sans `location` sort en anglais
  // quoi qu'on ait choisi.
  Object.defineProperty(globalThis, "location", {
    value: {
      pathname: HOUSEHOLD_PATH,
      search: "",
      href: `http://localhost${HOUSEHOLD_PATH}`,
    },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(KitchenEquipmentCard, {
      practicalConstraints: props.practicalConstraints === undefined
        ? READ_EMPTY
        : props.practicalConstraints,
      hasGoal: props.hasGoal ?? true,
      onSaved: () => {},
    }),
  );
}

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

/**
 * LA LANGUE EST UN ÉTAT DE MODULE, DONC ELLE FUIT D'UN TEST À L'AUTRE.
 * Un fichier qui laisserait `fr` derrière lui ferait tomber un voisin sur une
 * assertion anglaise, et le rouge apparaîtrait ailleurs que là où il est né.
 */
afterEach(() => setChosenUiLocaleForTest("en"));
afterAll(() => setChosenUiLocaleForTest("en"));

describe("⛔ le premier rendu n'affiche AUCUNE réponse non lue", () => {
  it("l'équipement dit qu'il lit tant que la colonne n'est pas arrivée", () => {
    setChosenUiLocaleForTest("fr");
    const out = equipmentHtml({ practicalConstraints: null });
    expect(out).toContain(fr["setup.equipment.loading"]);
    expect(out, "sept cases décochées s'affichent pendant la lecture")
      .not.toContain(fr["setup.equipment.tool_oven"]);
    setChosenUiLocaleForTest("en");
  });

  // LE CAS QUI PASSE: sans lui, une carte qui ne rendrait JAMAIS ses cases
  // passerait la garde ci-dessus, et la garde ressemblerait à une garde qui
  // marche.
  it("colonne lue: les cases sont là", () => {
    setChosenUiLocaleForTest("fr");
    const out = equipmentHtml({});
    expect(out).toContain(fr["setup.equipment.tool_oven"]);
    expect(out).not.toContain(fr["setup.equipment.loading"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("ce que la carte dit quand elle ne peut pas écrire", () => {
  it("sans ligne d'objectif, l'équipement le DIT au lieu de se taire", () => {
    setChosenUiLocaleForTest("fr");
    expect(equipmentHtml({ hasGoal: false })).toContain(fr["setup.equipment.no_goal"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("les deux cartes de maison ont déménagé sur /app/household", () => {
  const page = source("./HouseholdPage.tsx");

  it("la section existe, et elle porte les deux cartes dans cet ordre", () => {
    const label = page.indexOf('t("household.settings.title")');
    const oven = page.indexOf("<KitchenEquipmentCard");
    const traditions = page.indexOf("<HouseholdTraditionsCard");
    expect(label, "la section « Paramètres du foyer » n'existe pas")
      .toBeGreaterThan(0);
    expect(oven, "l'équipement n'est pas monté sur le Foyer").toBeGreaterThan(0);
    expect(traditions, "les traditions ne sont pas montées sur le Foyer")
      .toBeGreaterThan(0);
    // §2: « on demande AVEC QUOI on cuisine avant tout le reste ».
    expect(label).toBeLessThan(oven);
    expect(oven, "les traditions sont passées avant les moyens de cuisson")
      .toBeLessThan(traditions);
  });

  /**
   * ⛔ LA PORTE DE RENDU DE L'ÉQUIPEMENT EST NOURRIE PAR UNE VRAIE LECTURE.
   *
   * `practicalConstraints` doit venir d'un état qui part de `null` — sinon la
   * carte reçoit « lu, rien dedans » avant toute lecture, affiche sept cases
   * décochées, et le premier Enregistrer les écrit.
   */
  it("la colonne est LUE, et son état part de `null`", () => {
    expect(page).toContain("loadPracticalConstraints(userId)");
    expect(page).toMatch(
      /const \[practicalConstraints, setPracticalConstraints\] = React\.useState<\s*PracticalConstraints \| null\s*>\(null\)/,
    );
    expect(page, "la carte ne reçoit pas la colonne lue")
      .toContain("practicalConstraints={practicalConstraints}");
  });

  /**
   * AU MAÎTRE SEUL. `keel_household_set_traditions` refuse `not_owner`, et
   * l'équipement vit dans `student_goals` DU MAÎTRE: montrer à un secondaire
   * deux cartes que la base lui refusera est le bouton mort qu'on évite.
   */
  it("la section est réservée au maître", () => {
    const label = page.indexOf('t("household.settings.title")');
    const gate = page.lastIndexOf("{isOwner ? (", label);
    expect(gate, "la section n'est pas gardée par `isOwner`").toBeGreaterThan(0);
    expect(label - gate, "la garde `isOwner` est trop loin de la section")
      .toBeLessThan(2500);
  });
});

describe("ce que l'entonnoir garde, et ce qu'il a rendu", () => {
  const setup = source("./SetupPage.tsx");

  it("`TableStepPlanning` n'existe plus, ni comme fichier ni comme montage", () => {
    expect(setup, "l'enveloppe est encore montée").not.toContain(
      "<TableStepPlanning",
    );
    expect(() =>
      readFileSync(
        new URL("../components/TableStepPlanning.tsx", import.meta.url),
        "utf8",
      )
    ).toThrow();
  });

  /**
   * L'ÉQUIPEMENT RESTE DANS L'ENTONNOIR, ET C'EST LA MÊME CARTE.
   * Le congélateur décide du nombre de courses: la question doit être posée
   * AVANT le premier plan. Deux copies de cette carte divergeraient sur ce que
   * « avoir un congélateur » veut dire — or l'entonnoir ANNONCE déjà ce que la
   * composition fera, en lisant la même colonne par le miroir de sa fonction.
   */
  it("l'étape 3 monte l'équipement, et rien d'autre de la maison", () => {
    expect(setup).toContain("<KitchenEquipmentCard");
    expect(setup, "les traditions sont restées dans un entonnoir qu'on ne rejoue pas")
      .not.toContain("<HouseholdTraditionsCard");
  });
});

describe("i18n: le titre des traditions dit ce qu'il désigne", () => {
  it("la VALEUR a changé, la CLÉ n'a pas bougé", () => {
    // La clé est celle de l'entonnoir (`setup.*`) et elle le RESTE: la renommer
    // casserait la parité et `catalog.ts` sans rien réparer.
    expect(fr["setup.traditions.title"]).toBe("Les repas traditions");
    expect(en["setup.traditions.title"]).toBe("Tradition meals");
    expect(fr["setup.traditions.title"], "le français recopie l'anglais")
      .not.toBe(en["setup.traditions.title"]);
  });

  it("le titre de la section existe dans les deux packs", () => {
    expect(en["household.settings.title"]).toBeTruthy();
    expect(fr["household.settings.title"]).toBeTruthy();
    expect(fr["household.settings.title"]).not.toBe(en["household.settings.title"]);
  });

  /**
   * ⚠️ LES DEUX CARTES PARLENT `setup.*` SUR UNE PAGE `household`, et c'est
   * `pageSeams` qui l'exige: une page ne peut pas atteindre le namespace d'une
   * autre sans le DÉCLARER. `/app/household` déclare `setup` depuis le
   * 2026-08-18 (la fenêtre d'une bouche emprunte déjà son vocabulaire de
   * champ); ce lot s'y appuie et n'ajoute rien.
   */
  it("`/app/household` déclare bien le namespace `setup`", () => {
    expect(PAGE_NAMESPACES[HOUSEHOLD_PATH]).toContain("setup");
    expect(PAGE_NAMESPACES["/app/setup"]).toContain("setup");
  });
});
