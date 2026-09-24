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
import { fileURLToPath } from "node:url";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { sourceFamily } from "../../test/sourceFamily";

const read = (rel: string) =>
  sourceFamily(fileURLToPath(new URL(rel, import.meta.url)));

const READOUT = read("./plan/EnergyReadout.tsx");
const BUILDER = read("./MealBuilder.tsx");
const PLAN_PAGE = read("../pages/StudentWeekPlanPage.tsx");
// ⟳ 2026-09-23 · FF-066 lot 4 — la seule adresse des interrupteurs.
const KNOWN_PAGE = read("../pages/StudentKnownPage.tsx");

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
      expect(KNOWN_PAGE.includes(label), `${label} recopié dans « Ce que Sophia sait »`)
        .toBe(false);
    }
  });

  it("⟳ 2026-09-20 — UNE SEULE ADRESSE: LA SECTION « LES CHIFFRES »", () => {
    // Ce cas exigeait les DEUX montages. Celui de `MealBuilder` — la rangée
    // sous les plats, juste au-dessus du bouton qui compose l'aperçu — a été
    // retiré sur demande: on ne règle pas pendant qu'on compose.
    //
    // ⛔ ET C'EST L'AUTRE QUI RESTE, PAS L'INVERSE. Le lot 5 (2026-09-01) avait
    // ajouté la section justement parce qu'une extinction à un clic ne doit pas
    // demander une fouille pour être défaite. Garder `MealBuilder` et perdre la
    // section aurait rendu le produit d'avant ce lot-là.
    //
    // ⟳ 2026-09-23 · FF-066 LOT 4 — CETTE SECTION A DÉMÉNAGÉ. Elle vivait dans
    // la fenêtre « À propos de toi » de `/app/plan`, que plus rien n'ouvrait
    // depuis le 2026-09-21: le cas restait vert sur un réglage injoignable.
    // L'adresse unique est maintenant `/app/about-you`, où l'on vient régler.
    expect(BUILDER).not.toContain("<EnergySwitches");
    expect(PLAN_PAGE).not.toContain("<EnergySwitches");
    expect(KNOWN_PAGE).toContain("<EnergySwitches energy={energy} />");
    // ⚠️ ET LA CAPACITÉ EXISTE ENCORE: sans cette ligne, un retrait des DEUX
    // montages laisserait ce cas vert sur sa première moitié, et un chiffre
    // qu'on ne peut plus faire taire est un tracker.
    expect(KNOWN_PAGE.split("<EnergySwitches").length - 1).toBe(1);
    // ⚠️ ET ELLE EST MONTÉE: un composant défini mais jamais rendu serait la
    // même fenêtre sans ouvreur, une page plus loin.
    expect(KNOWN_PAGE).toContain("<PlanNumbersSection userId={userId} />");
  });

  it("le fronton « Les chiffres » ne se rend pas sans la bascule qu'il annonce", () => {
    // ⛔ Un `<SetupSection title="Numbers">` posé au-dessus d'un composant qui
    // rend `null` laisserait un fronton vide chez quelqu'un que le plancher
    // TCA, son âge ou son coach protègent — c'est-à-dire lui dire qu'un réglage
    // de calories existe et lui est refusé.
    const i = KNOWN_PAGE.indexOf('t("plan.section.numbers.title")');
    expect(i, "la section des chiffres a disparu").toBeGreaterThan(0);
    const before = KNOWN_PAGE.slice(Math.max(0, i - 400), i);
    expect(before).toContain("if (!energy.ready || !energy.switchOfferable) return null;");
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
