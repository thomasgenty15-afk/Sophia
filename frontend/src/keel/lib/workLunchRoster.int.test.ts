import { describe, expect, it } from "vitest";

import { BIRTH_DATE_ON_FILE } from "../api/onboarding";
import {
  type FunnelMouthAge,
  funnelMouthAgeState,
  workLunchRoster,
} from "./workLunchRoster";
import { askableWorkLunchPeople } from "./workLunchForm";

// L6 — LA RECONSTRUCTION DE L'ÂGE, ET LE PIN QUI LA TIENT À L'ENTONNOIR.
//
// Ce module relit deux champs que `readFunnelFacts` a APLATIS depuis un état à
// trois valeurs. Une reconstruction est une SECONDE lecture de la même règle:
// elle dérive en silence le jour où la première change, et c'est celle qu'on
// regarde le moins qui garde l'ancien comportement. D'où le premier bloc, qui
// reconstruit les paires EXACTEMENT comme `api/onboarding.ts` les écrit, en
// important sa sentinelle plutôt qu'en recopiant `"on-file"`.

const TODAY = "2026-08-18";

/**
 * LA PAIRE QUE `readFunnelFacts` ÉCRIT POUR UN `ageState` DONNÉ.
 *
 * Recopiée ligne à ligne de `api/onboarding.ts` (le `.map()` des bouches), et
 * elle importe `BIRTH_DATE_ON_FILE` au lieu de le retaper: la sentinelle qui
 * changerait de valeur ferait tomber ce test AVANT de faire disparaître la
 * question de l'écran.
 */
function asFunnelWrites(
  ageState: "minor" | "adult" | "unknown",
): Pick<FunnelMouthAge, "kind" | "birthDate"> {
  return {
    kind: ageState === "minor" ? "child" : "adult",
    birthDate: ageState === "unknown" ? null : BIRTH_DATE_ON_FILE,
  };
}

describe("l'âge d'une bouche survit à l'aplatissement de l'entonnoir", () => {
  it("les trois états font l'aller-retour", () => {
    for (const ageState of ["minor", "adult", "unknown"] as const) {
      expect([ageState, funnelMouthAgeState({
        memberId: "m",
        firstName: "Zoé",
        ...asFunnelWrites(ageState),
      })]).toEqual([ageState, ageState]);
    }
  });

  it("⛔ `unknown` NE DEVIENT PAS `adult`, alors que `kind` le dit", () => {
    // C'EST LE DÉFAUT QUE CE MODULE EXISTE POUR NE PAS AVOIR. `readFunnelFacts`
    // écrit `kind: "adult"` sur un âge inconnu, exprès. Lire `kind` seul
    // poserait la question à quelqu'un que la base refuse (`not_adult` couvre
    // AUSSI l'âge inconnu), et le bouton rendrait un refus qu'on ne peut pas
    // corriger depuis cet écran.
    const unknown = asFunnelWrites("unknown");
    expect(unknown.kind).toBe("adult");
    expect(funnelMouthAgeState({ memberId: "m", firstName: "Zoé", ...unknown }))
      .toBe("unknown");
  });

  it("⛔ la sentinelle n'est PAS une date lisible", () => {
    // La garde qui empêche quelqu'un de « simplifier » en passant ce champ à
    // `ageStateFromBirthDate`: la sentinelle n'est pas au format ISO, donc ce
    // lecteur-là rendrait `unknown` sur TOUTE bouche majeure et la question
    // disparaîtrait de l'écran sans qu'aucun test d'écran ne bouge.
    expect(/^\d{4}-\d{2}-\d{2}$/.test(BIRTH_DATE_ON_FILE)).toBe(false);
  });
});

describe("le roster de l'étape `table`", () => {
  const self = {
    memberId: "own",
    firstName: "Ahmed",
    birthDate: "1990-04-02",
  };

  it("le titulaire est la PREMIÈRE bouche, et sa vraie date décide", () => {
    const roster = workLunchRoster({ self, mouths: [], todayLocalIso: TODAY });
    expect(roster).toEqual([
      { memberId: "own", firstName: "Ahmed", ageState: "adult" },
    ]);
  });

  it("un titulaire sans date de naissance n'est PAS interrogé", () => {
    // Ni « adulte » ni « mineur »: on ne pose pas une question d'adulte à
    // quelqu'un dont on ne sait pas s'il en est un.
    const roster = workLunchRoster({
      self: { ...self, birthDate: null },
      mouths: [],
      todayLocalIso: TODAY,
    });
    expect(roster[0].ageState).toBe("unknown");
    expect(askableWorkLunchPeople(roster)).toEqual([]);
  });

  it("un titulaire mineur n'est pas interrogé non plus", () => {
    const roster = workLunchRoster({
      self: { ...self, birthDate: "2015-01-01" },
      mouths: [],
      todayLocalIso: TODAY,
    });
    expect(roster[0].ageState).toBe("minor");
    expect(askableWorkLunchPeople(roster)).toEqual([]);
  });

  it("les bouches suivent, dans l'ordre reçu, avec leur âge relu", () => {
    const roster = workLunchRoster({
      self,
      mouths: [
        { memberId: "m1", firstName: "Christèle", ...asFunnelWrites("adult") },
        { memberId: "m2", firstName: "Lino", ...asFunnelWrites("minor") },
        { memberId: "m3", firstName: "Inconnu", ...asFunnelWrites("unknown") },
      ],
      todayLocalIso: TODAY,
    });
    expect(roster.map((p) => [p.firstName, p.ageState])).toEqual([
      ["Ahmed", "adult"],
      ["Christèle", "adult"],
      ["Lino", "minor"],
      ["Inconnu", "unknown"],
    ]);
    // La carte n'interroge que les deux majeurs — et c'est bien
    // `askableWorkLunchPeople` qui tranche, pas ce module.
    expect(askableWorkLunchPeople(roster).map((p) => p.firstName))
      .toEqual(["Ahmed", "Christèle"]);
  });

  it("⛔ une bouche qui a un compte RESTE interrogée", () => {
    // Le régime et les moments sont en lecture seule pour elle (la base refuse
    // `has_account`); la porte du déjeuner n'a PAS ce refus, exprès — « où
    // quelqu'un déjeune est un FAIT ». Ce module ne connaît donc même pas
    // `claimed`, et ce test le dit à voix haute.
    const roster = workLunchRoster({
      self,
      mouths: [{ memberId: "m1", firstName: "Christèle", ...asFunnelWrites("adult") }],
      todayLocalIso: TODAY,
    });
    expect(askableWorkLunchPeople(roster).map((p) => p.memberId))
      .toEqual(["own", "m1"]);
  });

  it("une bouche sans ligne en base n'est pas interrogée: nulle part où écrire", () => {
    const roster = workLunchRoster({
      self,
      mouths: [{ memberId: null, firstName: "Tapé à l'instant", ...asFunnelWrites("adult") }],
      todayLocalIso: TODAY,
    });
    expect(roster).toHaveLength(2);
    expect(askableWorkLunchPeople(roster).map((p) => p.firstName)).toEqual(["Ahmed"]);
  });

  it("un compte solo sans foyer n'a pas de ligne: personne n'est interrogé", () => {
    const roster = workLunchRoster({
      self: { ...self, memberId: null },
      mouths: [],
      todayLocalIso: TODAY,
    });
    expect(roster[0].ageState).toBe("adult");
    expect(askableWorkLunchPeople(roster)).toEqual([]);
  });
});
