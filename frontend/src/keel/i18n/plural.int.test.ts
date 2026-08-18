// KEEL — « 0 jour » ET « 0 days », DANS LE MÊME CODE.
//
// La bascule singulier/pluriel de `api/labels.ts` était `count === 1`, c'est-à-
// dire la règle anglaise écrite en dur. Elle est fausse en français sur
// exactement une valeur — zéro —, et c'est une valeur que le produit atteint:
// un plancher à zéro (`>= 0 portions`) est une ligne qu'un extracteur produit.
//
// Deux niveaux ici, et les deux comptent:
//   · la RÈGLE, testée sans toucher à la locale du module;
//   · la CHAÎNE COMPLÈTE, du jeton d'unité jusqu'à la pastille que l'élève lit
//     — parce qu'une règle juste branchée nulle part ne rend rien.

import { afterEach, describe, expect, it } from "vitest";

import { commitmentAmount, type CommitmentShape } from "../api/labels";
import { isSingular, plural } from "./plural";
import { setChosenUiLocaleForTest } from "./runtime";

function inLocale(locale: "en" | "fr"): void {
  // `uiLocale()` lit `location.pathname` à l'appel: sans chemin déclaré ET
  // entièrement traduit, il rend l'anglais quoi qu'on choisisse.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/", search: "", href: "https://x.test/" },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

describe("isSingular — la seule divergence des deux langues livrées", () => {
  it("range ZÉRO au singulier en français, au pluriel en anglais", () => {
    // LE test du fichier. « 0 days » / « 0 jour ».
    expect(isSingular(0, "fr")).toBe(true);
    expect(isSingular(0, "en")).toBe(false);
  });

  it("s'accorde partout ailleurs", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(isSingular(1, locale), `1 ${locale}`).toBe(true);
      expect(isSingular(2, locale), `2 ${locale}`).toBe(false);
      expect(isSingular(30, locale), `30 ${locale}`).toBe(false);
    }
  });

  it("suit la même frontière sur une valeur décimale", () => {
    // « 1,5 minute » au singulier en français, « 1.5 minutes » au pluriel en
    // anglais. Rien ne produit ça aujourd'hui; la règle le dit quand même,
    // sinon c'est une frontière qui ne vaut que pour les entiers.
    expect(isSingular(1.5, "fr")).toBe(true);
    expect(isSingular(1.5, "en")).toBe(false);
  });

  it("ne se retourne pas sur un nombre négatif", () => {
    expect(isSingular(-1, "fr")).toBe(true);
    expect(isSingular(-3, "fr")).toBe(false);
  });
});

describe("plural — lit la langue de la page, pas un argument oublié", () => {
  it("choisit la forme du seed sans jamais en fabriquer une", () => {
    inLocale("fr");
    expect(plural(0, "jour", "jours")).toBe("jour");
    expect(plural(2, "jour", "jours")).toBe("jours");
    inLocale("en");
    expect(plural(0, "day", "days")).toBe("days");
    expect(plural(1, "day", "days")).toBe("day");
  });
});

describe("la chaîne entière — du jeton d'unité à la pastille de l'élève", () => {
  /** Un plancher à zéro portion: la ligne qui rendait « 0 portions ». */
  const zeroFloor: CommitmentShape = {
    polarity: "do",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 0,
    target_max: null,
    substance_ref: null,
    food_group_ref: null,
    evaluation_grain: "day",
    scheduled_days: null,
    required_days_per_week: 7,
    // ⚠️ PAS 0: `targetRestatesCadence` supprimerait la quantité si le plancher
    // répétait le nombre d'occasions, et la pastille serait vide — un test vert
    // qui ne mesure plus rien.
    expected_occasions_per_day: 1,
  };

  it("rend « 0 portion » en français et « 0 servings » en anglais", () => {
    inLocale("fr");
    expect(commitmentAmount(zeroFloor)).toBe("0 portion");
    inLocale("en");
    expect(commitmentAmount(zeroFloor)).toBe("0 servings");
  });

  it("garde l'accord ordinaire au-delà de un", () => {
    const two = { ...zeroFloor, target_min: 2 };
    inLocale("fr");
    expect(commitmentAmount(two)).toBe("2 portions");
    inLocale("en");
    expect(commitmentAmount(two)).toBe("2 servings");
  });
});
