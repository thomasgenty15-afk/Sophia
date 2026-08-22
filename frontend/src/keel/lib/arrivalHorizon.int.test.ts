import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  ARRIVAL_HORIZON_COPY,
  ARRIVAL_HORIZONS,
  arrivalCopyIsCalendarFree,
  arrivalHorizonFor,
  CALENDAR_FREE_COPY,
  TARGET_WEIGHT_HINT_COPY,
} from "./arrivalHorizon";

// ===========================================================================
// L3 (2026-08-22) — LE PRODUIT NE PROMET PLUS DE DATE D'ARRIVÉE
//
// ⚠️ CE FICHIER EST LA MOITIÉ COMMITABLE DE LA GARDE, ET IL LE DIT. Le
// câblage (`lib/mouthForm.ts`, `components/MouthFormDialog.tsx`) et son test
// d'écran vivent dans l'ARBRE DE TRAVAIL: les deux fichiers portent du travail
// non commité d'autres sessions, et une garde de SOURCE écrite sur eux serait
// ROUGE depuis un checkout propre — la cicatrice `V0-A`, à laquelle cette
// campagne a déjà payé un lot. Ce fichier-ci ne lit QUE le module que le lot
// apporte, il est donc vert depuis un checkout propre.
//
// ⚠️ `.ts` ET PAS `.tsx`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. Un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const SOURCE = readFileSync(
  new URL("./arrivalHorizon.ts", import.meta.url),
  "utf8",
);

describe("L3 — la phrase de remplacement ne promet aucun calendrier", () => {
  it("⛔ LE CAS QUI PASSE: TOUTE la copie livrée traverse la garde, EN et FR", () => {
    // Sans ce cas, une garde qui refuse tout ressemblerait exactement à une
    // garde qui marche — c'est la cicatrice `guards-need-a-passing-case`.
    //
    // ⚠️ ON ITÈRE `CALENDAR_FREE_COPY`, ON NE LISTE PAS DEUX ASSERTIONS À LA
    // MAIN: une entrée ajoutée plus tard sans son test serait exactement le
    // trou que ce lot vient fermer (le `hint` du champ, oublié par la fiche).
    expect(CALENDAR_FREE_COPY.length).toBeGreaterThanOrEqual(2);
    for (const entry of CALENDAR_FREE_COPY) {
      expect(
        [entry.label, arrivalCopyIsCalendarFree(entry.en, "en")],
      ).toEqual([entry.label, null]);
      expect(
        [entry.label, arrivalCopyIsCalendarFree(entry.fr, "fr")],
      ).toEqual([entry.label, null]);
    }
  });

  it("les deux langues existent partout, et aucune n'est vide", () => {
    for (const entry of CALENDAR_FREE_COPY) {
      expect(entry.en.length).toBeGreaterThan(40);
      expect(entry.fr.length).toBeGreaterThan(40);
    }
  });

  it("⚠️ chaque jeton d'horizon a sa copie, et réciproquement", () => {
    // Un jeton ajouté sans copie sortirait `undefined` à l'écran; une copie
    // sans jeton serait du texte que rien ne peut afficher.
    expect(Object.keys(ARRIVAL_HORIZON_COPY).sort())
      .toEqual([...ARRIVAL_HORIZONS].sort());
  });

  it("⛔ LA SECONDE SURFACE: le `hint` du champ ne promet plus de date", () => {
    // Il disait: « With the pace below, this gives a date to arrive on. » /
    // « Avec le rythme ci-dessous, il donne une date d'arrivée. » — la
    // promesse énoncée PLUS explicitement que le nombre, et rendue SANS
    // CONDITION. Elle n'était comptée dans aucune fiche.
    expect(TARGET_WEIGHT_HINT_COPY.en).not.toContain("date");
    expect(TARGET_WEIGHT_HINT_COPY.fr).not.toContain("date");
    // ⛔ ET IL DIT CE QUE LE CHAMP FAIT VRAIMENT: le sens de marche.
    expect(TARGET_WEIGHT_HINT_COPY.fr).toContain("sens de marche");
    expect(TARGET_WEIGHT_HINT_COPY.en).toContain("which way to go");
  });

  it("la copie NOMME la raison de l'absence de date, elle ne se tait pas", () => {
    // ⛔ Retirer une promesse n'est pas retirer une information. La phrase doit
    // porter les trois choses de la `direction` du lot: la direction (« vers
    // ce poids » / « toward that weight »), la raison (l'erreur d'estimation),
    // et ce qui donnera le rythme réel (la balance).
    const { en, fr } = ARRIVAL_HORIZON_COPY.no_arrival_date;
    expect(fr).toContain("vers ce poids");
    expect(fr).toContain("erreur");
    expect(fr).toContain("balance");
    expect(en).toContain("toward that weight");
    expect(en).toContain("error");
    expect(en).toContain("scale");
  });

  it("⛔ et elle ne promet PAS que le plan suivra les pesées", () => {
    // `L11★`: 9 comptes portent plus d'une pesée, ZÉRO BOUCHE, et aucun
    // écrivain ne propage vers `household_member_bodies.weight_kg`. Une phrase
    // qui l'annoncerait remplacerait une promesse fausse par une autre.
    const { en, fr } = ARRIVAL_HORIZON_COPY.no_arrival_date;
    expect(fr).not.toMatch(/le plan (s'|se )?(adapte|ajuste|suivra|suit)/i);
    expect(en).not.toMatch(/the plan will (follow|adjust|adapt|track)/i);
  });
});

describe("L3 — la garde MORD, et sur quoi exactement", () => {
  it("un chiffre est refusé, dans les deux langues", () => {
    expect(arrivalCopyIsCalendarFree("About 12 weeks at this pace.", "en"))
      .toEqual({ kind: "digit", found: "1" });
    expect(arrivalCopyIsCalendarFree("Environ 12 semaines à ce rythme.", "fr"))
      .toEqual({ kind: "digit", found: "1" });
  });

  it("une unité de calendrier SANS chiffre est refusée aussi", () => {
    // C'est la forme qu'un chiffre reprend au premier raccourcissement de
    // copie: « quelques semaines » devient « douze semaines » devient « 12 ».
    expect(arrivalCopyIsCalendarFree("A few weeks at this pace.", "en"))
      .toEqual({ kind: "calendar_word", found: "weeks" });
    expect(arrivalCopyIsCalendarFree("Quelques semaines à ce rythme.", "fr"))
      .toEqual({ kind: "calendar_word", found: "semaines" });
  });

  it("CHAQUE mot du vocabulaire fermé mord, aucun n'est décoratif", () => {
    const EN = ["week", "weeks", "month", "months", "day", "days", "year",
      "years", "date", "dates", "deadline", "deadlines"];
    const FR = ["semaine", "semaines", "mois", "jour", "jours", "journée",
      "journées", "an", "ans", "année", "années", "date", "dates",
      "échéance", "échéances"];
    for (const w of EN) {
      expect(arrivalCopyIsCalendarFree(`about a ${w} from now`, "en"))
        .toEqual({ kind: "calendar_word", found: w });
    }
    for (const w of FR) {
      const hit = arrivalCopyIsCalendarFree(`environ ${w} à ce rythme`, "fr");
      expect(hit?.kind).toBe("calendar_word");
    }
  });

  it("⚠️ les bornes de mot: « l'an » mord, « dans » ne mord PAS", () => {
    // `\b` est ASCII en JavaScript. La garde borne sur « pas une lettre »,
    // apostrophe comprise, sinon « l'an » passerait et « dans » serait un faux
    // positif — les deux erreurs symétriques d'un matcher écrit à la main.
    expect(arrivalCopyIsCalendarFree("d'ici l'an prochain", "fr"))
      .toEqual({ kind: "calendar_word", found: "an" });
    expect(arrivalCopyIsCalendarFree("dans le sens de la balance", "fr"))
      .toBeNull();
    expect(arrivalCopyIsCalendarFree("today the plate changes", "en"))
      .toBeNull();
  });

  it("⚠️ un mot accentué est borné correctement (`année`)", () => {
    expect(arrivalCopyIsCalendarFree("vers la fin de l'année", "fr"))
      .toEqual({ kind: "calendar_word", found: "année" });
  });

  it("⚠️ « quotidien » et « daily » PASSENT: ils qualifient un rythme", () => {
    expect(arrivalCopyIsCalendarFree("l'écart quotidien visé", "fr")).toBeNull();
    expect(arrivalCopyIsCalendarFree("the daily gap it aims for", "en"))
      .toBeNull();
  });
});

describe("L3 — la prémisse: la phrase ne sort pas toute seule", () => {
  it("sans cible acceptée, rien", () => {
    expect(
      arrivalHorizonFor({ targetAccepted: false, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("sans curseur vivant, rien", () => {
    expect(
      arrivalHorizonFor({ targetAccepted: true, paceKgPerWeek: null }),
    ).toBeNull();
  });

  it("un rythme nul ou négatif ne mène nulle part: rien", () => {
    expect(arrivalHorizonFor({ targetAccepted: true, paceKgPerWeek: 0 }))
      .toBeNull();
    expect(arrivalHorizonFor({ targetAccepted: true, paceKgPerWeek: -1 }))
      .toBeNull();
    expect(arrivalHorizonFor({ targetAccepted: true, paceKgPerWeek: NaN }))
      .toBeNull();
  });

  it("cible acceptée + curseur vivant → le jeton, et RIEN QUE le jeton", () => {
    const horizon = arrivalHorizonFor({
      targetAccepted: true,
      paceKgPerWeek: 0.45,
    });
    expect(horizon).toBe("no_arrival_date");
    // ⛔ Un jeton, pas un objet portant un nombre: il n'existe aucun champ où
    // une recopie pourrait réécrire des semaines.
    expect(typeof horizon).toBe("string");
  });
});

describe("L3 — le module lui-même ne peut pas reconstruire une date", () => {
  it("⛔ il n'appelle ni n'importe `weeksToTarget`", () => {
    const code = SOURCE
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    // Un grep naïf compterait les commentaires de ce fichier comme des
    // appelants vivants — cicatrice `caller-audit-must-strip-comments`.
    expect(code).not.toContain("weeksToTarget");
    expect(code).not.toContain("weight_pace");
  });

  it("⛔ aucun champ `weeks` ne traverse ce module", () => {
    const code = SOURCE
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\bweeks\s*[:?]/);
  });
});
