import { describe, expect, it } from "vitest";

import {
  ARRIVAL_HORIZON_TEMPLATES,
  ARRIVAL_HORIZONS,
  arrivalCopyCarriesItsReserve,
  arrivalHorizonCopy,
  arrivalHorizonFor,
} from "./arrivalHorizon";
import { weeksToTarget } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

// ===========================================================================
// L3′ (2026-09-01) — LE NOMBRE DE SEMAINES EST REVENU, SA RÉSERVE AVEC LUI
//
// ⚠️ CE FICHIER A CHANGÉ DE CAMP, ET IL LE DIT. Il gardait l'ABSENCE de tout
// mot de calendrier (`arrivalCopyIsCalendarFree`, lot `L3` du 2026-08-22).
// La demande du 2026-09-01 rétablit le chiffre; la garde qui tenait son
// absence est donc RETIRÉE AVEC LA DÉCISION QU'ELLE TENAIT — pas laissée
// dans le fichier à guetter une phrase que plus personne n'écrit.
//
// ⛔ CE QU'ON GARDE À LA PLACE N'EST PAS RIEN, ET C'EST TOUT L'INTÉRÊT DU
// LOT: le chiffre a le droit d'exister, il n'a pas le droit d'exister SEUL.
// La mesure qui avait fait retirer le nombre (erreur d'estimation
// ±580 kcal/j > déficit visé 500 kcal/j, donc une borne haute à l'infini)
// est toujours vraie — c'est elle que la réserve porte à l'écran.
//
// ⚠️ `.ts` ET PAS `.tsx`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. Un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

describe("L3′ — le gabarit livré porte son nombre ET sa réserve", () => {
  it("⛔ LE CAS QUI PASSE: TOUS les gabarits traversent la garde, EN et FR", () => {
    // Sans ce cas, une garde qui refuse tout ressemblerait exactement à une
    // garde qui marche — cicatrice `guards-need-a-passing-case`.
    expect(ARRIVAL_HORIZONS.length).toBeGreaterThanOrEqual(1);
    for (const kind of ARRIVAL_HORIZONS) {
      const tpl = ARRIVAL_HORIZON_TEMPLATES[kind];
      expect([kind, arrivalCopyCarriesItsReserve(tpl.en, "en")])
        .toEqual([kind, null]);
      expect([kind, arrivalCopyCarriesItsReserve(tpl.fr, "fr")])
        .toEqual([kind, null]);
    }
  });

  it("les deux langues existent partout, et aucune n'est vide", () => {
    for (const kind of ARRIVAL_HORIZONS) {
      expect(ARRIVAL_HORIZON_TEMPLATES[kind].en.length).toBeGreaterThan(40);
      expect(ARRIVAL_HORIZON_TEMPLATES[kind].fr.length).toBeGreaterThan(40);
    }
  });

  it("⚠️ chaque jeton d'horizon a son gabarit, et réciproquement", () => {
    // Un jeton ajouté sans gabarit sortirait `undefined` à l'écran; un
    // gabarit sans jeton serait du texte que rien ne peut afficher.
    expect(Object.keys(ARRIVAL_HORIZON_TEMPLATES).sort())
      .toEqual([...ARRIVAL_HORIZONS].sort());
  });

  it("⛔ LE NOMBRE ET LA RÉSERVE SONT DANS LA MÊME CHAÎNE", () => {
    // C'est la garantie STRUCTURELLE, celle qu'aucun test ne peut remplacer:
    // il n'existe pas de moitié à rendre toute seule.
    for (const kind of ARRIVAL_HORIZONS) {
      for (const lang of ["en", "fr"] as const) {
        const tpl = ARRIVAL_HORIZON_TEMPLATES[kind][lang];
        expect(tpl).toContain("{weeks}");
        expect(tpl.split("{weeks}")).toHaveLength(2);
      }
    }
  });
});

describe("L3′ — la garde MORD, et sur quoi exactement", () => {
  it("⛔ LE CHIFFRE SEUL EST REFUSÉ — c'est l'état d'avant le 2026-08-22", () => {
    // Exactement la phrase que l'écran affichait, et qui a coûté le lot `L3`.
    expect(arrivalCopyCarriesItsReserve("About {weeks} weeks at this pace.", "en"))
      .toEqual({ kind: "missing_reserve", missing: "not a date" });
    expect(
      arrivalCopyCarriesItsReserve("Environ {weeks} semaines à ce rythme.", "fr"),
    ).toEqual({ kind: "missing_reserve", missing: "pas une date" });
  });

  it("une réserve à MOITIÉ est refusée aussi", () => {
    // Dire « pas une date » sans dire d'où viendra le rythme réel laisse la
    // personne sans rien à quoi se raccrocher; dire « la balance » sans dire
    // que ce n'est pas une date laisse la promesse intacte.
    expect(
      arrivalCopyCarriesItsReserve(
        "Environ {weeks} semaines à ce rythme. Pas une date.",
        "fr",
      ),
    ).toEqual({ kind: "missing_reserve", missing: "la balance" });
    expect(
      arrivalCopyCarriesItsReserve(
        "About {weeks} weeks. Only the scale knows.",
        "en",
      ),
    ).toEqual({ kind: "missing_reserve", missing: "not a date" });
  });

  it("CHAQUE marqueur mord, aucun n'est décoratif", () => {
    // Un marqueur qu'on peut retirer sans faire rougir le test est un
    // marqueur qui ne garde rien.
    const FULL = {
      en: "About {weeks} weeks at this pace. That is the slider's arithmetic, " +
        "not a date: only the scale will tell the real pace.",
      fr: "Environ {weeks} semaines à ce rythme. C'est le calcul du curseur, " +
        "pas une date : seule la balance dira le rythme réel.",
    };
    for (const [lang, markers] of [
      ["en", ["not a date", "the scale"]],
      ["fr", ["pas une date", "la balance"]],
    ] as const) {
      for (const marker of markers) {
        const stripped = FULL[lang].replace(marker, "…");
        expect([marker, arrivalCopyCarriesItsReserve(stripped, lang)?.kind])
          .toEqual([marker, "missing_reserve"]);
      }
    }
  });

  it("un gabarit SANS nombre est refusé — la réserve seule ne suffit pas", () => {
    // ⛔ C'est la garde dans l'autre sens: le lot rétablit un CHIFFRE. Un
    // gabarit qui ne porterait que la prudence serait le retour silencieux à
    // l'écran du 2026-08-22, sous couvert de passer la garde.
    expect(
      arrivalCopyCarriesItsReserve(
        "C'est le calcul du curseur, pas une date : seule la balance dira le " +
          "rythme réel.",
        "fr",
      ),
    ).toEqual({ kind: "no_number" });
  });

  it("⚠️ la casse ne fait pas passer un gabarit à travers", () => {
    expect(
      arrivalCopyCarriesItsReserve(
        "Environ {weeks} semaines. PAS UNE DATE : seule LA BALANCE dira le " +
          "rythme réel.",
        "fr",
      ),
    ).toBeNull();
  });
});

describe("L3′ — la prémisse: la phrase ne sort pas toute seule", () => {
  const ACCEPTED = { targetAccepted: true, currentKg: 60, targetKg: 55 };

  it("sans cible acceptée, rien", () => {
    expect(
      arrivalHorizonFor({ ...ACCEPTED, targetAccepted: false, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("sans curseur vivant, rien", () => {
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: null })).toBeNull();
  });

  it("un rythme nul ou négatif ne mène nulle part: rien", () => {
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: 0 })).toBeNull();
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: -1 })).toBeNull();
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: NaN })).toBeNull();
  });

  it("⛔ sans les DEUX poids, rien — on ne divise pas sur une ignorance", () => {
    expect(
      arrivalHorizonFor({ ...ACCEPTED, currentKg: null, paceKgPerWeek: 0.45 }),
    ).toBeNull();
    expect(
      arrivalHorizonFor({ ...ACCEPTED, targetKg: null, paceKgPerWeek: 0.45 }),
    ).toBeNull();
    expect(
      arrivalHorizonFor({ ...ACCEPTED, currentKg: NaN, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("un écart nul ne se dit pas « 0 semaine »", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 60,
        targetKg: 60,
        paceKgPerWeek: 0.45,
      }),
    ).toBeNull();
  });
});

describe("L3′ — le nombre, et d'où il vient", () => {
  it("le cas du design: 60 kg → 55 kg à 0,45 kg/semaine = 12 semaines", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 60,
        targetKg: 55,
        paceKgPerWeek: 0.45,
      }),
    ).toEqual({ kind: "weeks_at_this_pace", weeks: 12 });
  });

  it("le second cas mesuré: 94 kg → 80 kg à 0,45 kg/semaine = 32 semaines", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 94,
        targetKg: 80,
        paceKgPerWeek: 0.45,
      }),
    ).toEqual({ kind: "weeks_at_this_pace", weeks: 32 });
  });

  it("⚠️ LA DIVISION EST CELLE DE `weeksToTarget`, PAS UNE SECONDE", () => {
    // Une arithmétique recopiée ici divergerait au premier changement
    // d'arrondi — et `weeksToTarget` arrondit AU SUPÉRIEUR par décision
    // (annoncer trop tôt est une déception programmée).
    for (const [cur, tgt, pace] of [
      [60, 55, 0.45],
      [94, 80, 0.45],
      [70, 78, 0.25],
      [80, 74.2, 0.5],
    ] as const) {
      const horizon = arrivalHorizonFor({
        targetAccepted: true,
        currentKg: cur,
        targetKg: tgt,
        paceKgPerWeek: pace,
      });
      expect([cur, tgt, pace, horizon?.weeks ?? null])
        .toEqual([cur, tgt, pace, weeksToTarget(cur, tgt, pace)]);
    }
  });

  it("⚠️ LA PRISE DE POIDS AUSSI — l'écart est une valeur absolue", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 60,
        targetKg: 66,
        paceKgPerWeek: 0.25,
      }),
    ).toEqual({ kind: "weeks_at_this_pace", weeks: 24 });
  });
});

describe("L3′ — la phrase rendue", () => {
  const HORIZON = { kind: "weeks_at_this_pace", weeks: 32 } as const;

  it("⛔ elle porte le nombre ET sa réserve, dans les deux langues", () => {
    const fr = arrivalHorizonCopy(HORIZON, "fr");
    expect(fr).toContain("32 semaines");
    expect(fr).toContain("pas une date");
    expect(fr).toContain("la balance");

    const en = arrivalHorizonCopy(HORIZON, "en");
    expect(en).toContain("32 weeks");
    expect(en).toContain("not a date");
    expect(en).toContain("the scale");
  });

  it("⛔ AUCUN `{weeks}` NE SURVIT AU RENDU", () => {
    // Un gabarit non substitué se lit comme un bug à l'écran, et il est
    // passé une fois par une clé i18n de ce dépôt.
    for (const lang of ["en", "fr"] as const) {
      expect(arrivalHorizonCopy(HORIZON, lang)).not.toContain("{weeks}");
    }
  });

  it("⚠️ le nombre est formaté dans la langue de la phrase", () => {
    // « 1 040 semaines » ne s'écrit pas « 1,040 » en français.
    const long = { kind: "weeks_at_this_pace", weeks: 1040 } as const;
    expect(arrivalHorizonCopy(long, "fr")).not.toContain("1,040");
    expect(arrivalHorizonCopy(long, "en")).toContain("1,040");
  });

  it("⛔ AUCUN kcal DANS LA PHRASE — clause C5", () => {
    // Une grandeur d'énergie PAR BOUCHE sortirait ici sans avoir traversé la
    // moindre porte, à côté d'un curseur que le compte maître règle POUR
    // QUELQU'UN D'AUTRE.
    for (const lang of ["en", "fr"] as const) {
      expect(arrivalHorizonCopy(HORIZON, lang)).not.toMatch(/kcal|calorie/i);
    }
  });

  it("⛔ et elle ne promet PAS que le plan suivra les pesées", () => {
    // `L11★`: 9 comptes portent plus d'une pesée, ZÉRO BOUCHE, et aucun
    // écrivain ne propage vers `household_member_bodies.weight_kg`. Une
    // phrase qui l'annoncerait remplacerait une promesse fausse par une
    // autre. « Seule la balance dira le rythme réel » parle de ce que la
    // personne VERRA, pas de ce que le produit FERA.
    expect(arrivalHorizonCopy(HORIZON, "fr"))
      .not.toMatch(/le plan (s'|se )?(adapte|ajuste|suivra|suit)/i);
    expect(arrivalHorizonCopy(HORIZON, "en"))
      .not.toMatch(/the plan will (follow|adjust|adapt|track)/i);
  });

  it("⛔ ET AUCUNE FOURCHETTE — la borne haute est l'infini", () => {
    // « 12 à 24 semaines » serait une seconde promesse, fausse comme la
    // première: l'intervalle de l'écart quotidien exécuté traverse zéro.
    for (const lang of ["en", "fr"] as const) {
      const copy = arrivalHorizonCopy(HORIZON, lang);
      expect(copy).not.toMatch(/\d+\s*(à|to|–|-|—)\s*\d+/);
      expect(copy).not.toMatch(/±|\+\/-/);
    }
  });
});
