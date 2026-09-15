// FF-059 LOT 5 (2026-09-01) — OÙ VIVENT LES DEUX INTERRUPTEURS, ET COMBIEN DE
// FOIS ILS SONT ÉCRITS.
//
// Ce que ces tests protègent, dans l'ordre de ce que ça coûte quand ça casse:
//
//   * LA SECONDE COPIE DE LA RANGÉE — deux `<Button>` « voir les calories »
//     écrits à deux endroits divergent, et c'est celui qu'on relit le moins qui
//     garde l'ancienne condition d'affichage. Or cette condition EST la garde:
//     proposer la bascule à quelqu'un que le plancher TCA protège, c'est encore
//     lui parler de calories. Un test compte les occurrences;
//   * LE FRONTON POSÉ AU-DESSUS DU VIDE — une section « Les chiffres » rendue
//     quand `switchOfferable` est faux annoncerait à la personne protégée qu'il
//     existe un réglage de calories qu'on lui refuse;
//   * LA PHRASE DE LA DATE MANQUANTE QUI PARLERAIT DE CALORIES — « donne ta
//     date, reçois des calories » est le marchandage que `mealEnergy.ts` refuse
//     nommément. La phrase doit parler des PORTIONS, et être celle de
//     l'entonnoir, pas une seconde formulation du même manque.
//
// ⚠️ DES TESTS DE SOURCE, ET C'EST ASSUMÉ. Ce dépôt n'a aucun harnais de rendu
// front (ni testing-library, ni jsdom, ni un `.test.tsx`). Ce qui se prouve ici
// est donc structurel — « une seule écriture », « la garde enveloppe le
// fronton » — pas visuel. Le rendu, lui, a été vérifié dans la vraie UI.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const READOUT = read("./plan/EnergyReadout.tsx");
const BUILDER = read("./MealBuilder.tsx");
const PLAN_PAGE = read("../pages/StudentWeekPlanPage.tsx");

describe("FF-059 lot 5 — la rangée d'interrupteurs n'est écrite qu'une fois", () => {
  it("les quatre libellés de bascule ne vivent QUE dans EnergyReadout", () => {
    // ⛔ LE DÉFAUT QU'ON FERME: la rangée recopiée dans un second écran, avec
    // sa propre condition d'affichage. La condition vient du SERVEUR
    // (`switch_offerable`), et une seconde écriture est une seconde occasion de
    // la relâcher.
    const labels = [
      "meals.energy.switch_on",
      "meals.energy.switch_off",
      "meals.energy.target_switch_on",
      "meals.energy.target_switch_off",
      "meals.energy.switch_hint",
      "meals.energy.switch_failed",
    ];
    for (const label of labels) {
      expect(READOUT.split(label).length - 1, `${label} dans EnergyReadout`)
        .toBeGreaterThan(0);
      expect(BUILDER.includes(label), `${label} recopié dans MealBuilder`).toBe(false);
      expect(PLAN_PAGE.includes(label), `${label} recopié dans la page du plan`)
        .toBe(false);
    }
  });

  it("les DEUX écrans montent le même composant", () => {
    // Sans ce test, le précédent resterait vert si un écran avait simplement
    // PERDU sa rangée — « une seule écriture » et « une seule adresse » ne sont
    // pas la même propriété, et c'est la seconde adresse qui est le lot.
    expect(BUILDER).toContain("<EnergySwitches energy={energy} />");
    expect(PLAN_PAGE).toContain("<EnergySwitches energy={energySwitches} />");
  });

  it("le fronton « Les chiffres » ne se rend pas sans la bascule qu'il annonce", () => {
    // ⛔ Un `<SetupSection title="Numbers">` posé au-dessus d'un composant qui
    // rend `null` laisserait un fronton vide chez quelqu'un que le plancher
    // TCA, son âge ou son coach protègent — c'est-à-dire lui dire qu'un réglage
    // de calories existe et lui est refusé.
    const i = PLAN_PAGE.indexOf('t("plan.section.numbers.title")');
    expect(i, "la section des chiffres a disparu").toBeGreaterThan(0);
    const before = PLAN_PAGE.slice(Math.max(0, i - 400), i);
    expect(before).toContain("energySwitches.ready && energySwitches.switchOfferable");
  });

  it("la section des chiffres a sa copie dans les deux langues", () => {
    for (const key of ["plan.section.numbers.title", "plan.section.numbers.intro"] as const) {
      expect(en[key], `absente de en.ts: ${key}`).toBeTruthy();
      expect(fr[key], `absente de fr.ts: ${key}`).toBeTruthy();
    }
    // ⚠️ LE FRONTON NE DIT PAS « CALORIES ». Il est lu par quelqu'un venu régler
    // autre chose, et le mot y transformerait un réglage en sujet. Les BOUTONS,
    // eux, le disent — ils sont le geste.
    expect(en["plan.section.numbers.title"].toLowerCase()).not.toContain("calorie");
    expect(fr["plan.section.numbers.title"].toLowerCase()).not.toContain("calorie");
    // ⛔ ET IL N'EST PAS « Numbers » TOUT COURT. Mesuré à l'écran le
    // 2026-09-01: la carte rend déjà `plan.about.numbers` — la taille et le
    // poids — dans le même flux. Deux frontons du même mot pour deux choses
    // sans rapport.
    expect(en["plan.section.numbers.title"]).not.toBe(en["plan.about.numbers"]);
    expect(fr["plan.section.numbers.title"]).not.toBe(fr["plan.about.numbers"]);
    // ⛔ ET L'INTRO NE REDIT PAS LA PHRASE DE LA RANGÉE. Elle la portait, et le
    // texte sortait EN DOUBLE à deux lignes d'intervalle.
    for (const pack of [en, fr]) {
      const hint = String(pack["meals.energy.switch_hint"]).toLowerCase();
      const tail = hint.replace(/[.!?]+$/, "").split(", ").pop() ?? hint;
      expect(
        String(pack["plan.section.numbers.intro"]).toLowerCase().includes(tail),
        `l'intro reprend « ${tail} », déjà dit par la rangée`,
      ).toBe(false);
    }
  });
});

describe("FF-059 lot 5 — la date manquante se dit sans monnayer un chiffre", () => {
  it("la page réutilise la phrase de l'entonnoir, elle n'en écrit pas une seconde", () => {
    // Deux formulations du même manque divergent, et celle qu'on relit le moins
    // garde l'ancienne. `setupMisses.ts` porte déjà ce motif nommé.
    expect(PLAN_PAGE).toContain('t("setup.missing.adult_without_birth_date")');
  });

  it("la phrase parle des PORTIONS, jamais des calories", () => {
    // ⛔ LE MARCHANDAGE QUE `mealEnergy.ts` REFUSE NOMMÉMENT: « on ne connaît
    // pas ta date, donc pas de chiffre » se lit « donne ta date, reçois des
    // calories ». La porte ②bis ferme aussi le chiffre — on ne le dit pas.
    for (const [lang, pack] of [["en", en], ["fr", fr]] as const) {
      const text = String(pack["setup.missing.adult_without_birth_date"]).toLowerCase();
      for (const word of ["calorie", "kcal", "energy", "énergie"]) {
        expect(text.includes(word), `${lang} mentionne « ${word} »`).toBe(false);
      }
      // Et elle dit bien ce qu'elle coûte VRAIMENT: la direction ne s'applique pas.
      expect(text).toContain(lang === "fr" ? "direction" : "direction");
    }
  });

  it("elle ne s'affiche qu'à qui a une direction à perdre", () => {
    // `maintenance` n'a pas de direction: poser un reproche sous la case de
    // quelqu'un qui ne vise rien serait réclamer une donnée pour rien.
    const i = PLAN_PAGE.indexOf('t("setup.missing.adult_without_birth_date")');
    const before = PLAN_PAGE.slice(Math.max(0, i - 500), i);
    expect(before).toContain('props.goal === "fat_loss"');
    expect(before).toContain('props.goal === "muscle_gain"');
    expect(before).toContain('props.savedBasics.birthDate.trim() === ""');
  });
});
