import { describe, expect, it } from "vitest";

import { presenceRoster, type PresenceSelf } from "./presenceRoster";
import type { FunnelMouth } from "../api/onboarding";
import type { AwayMark } from "./presenceMarks";

// ===========================================================================
// D4 ② — LE TITULAIRE A UNE GRILLE DANS LE TUNNEL.
//
// ⛔ LE DÉFAUT. La fiche du foyer lui pose la question du déjeuner
// (`MemberWorkLunchCard`; à l'étape 3 avant A6, `workLunchRoster`, « le
// titulaire, premier et pareil ») et sa réponse pré-remplit CINQ de ses
// midis « dehors » sur sa ligne membre. L'étape 4 listait `facts.mouths` — dont
// `readFunnelFacts` le retire. Il pouvait donc voir cinq de ses déjeuners
// sortir du plan sans trouver, dans tout le tunnel, une seule case pour en
// contredire un: la règle « pré-remplir n'est pas décider, la grille gagne »
// n'était pas tenue pour celui-là même qui remplit le formulaire.
//
// ⚠️ LE PIÈGE À TENIR EST L'AUTRE MOITIÉ: le compte SOLO n'a pas de ligne
// membre. Lui rendre une grille montrerait un contrôle qui échoue à tous les
// coups — `setMemberAway(null)` n'a rien à écrire.
// ===========================================================================

const PREFILLED: AwayMark[] = [
  { day: "mon", slots: ["lunch"], kind: "eating_out" },
  { day: "tue", slots: ["lunch"], kind: "eating_out" },
  { day: "wed", slots: ["lunch"], kind: "eating_out" },
  { day: "thu", slots: ["lunch"], kind: "eating_out" },
  { day: "fri", slots: ["lunch"], kind: "eating_out" },
];

function self(over: Partial<PresenceSelf> = {}): PresenceSelf {
  return {
    ownMemberId: "mem-owner",
    firstName: "Kai",
    away: PREFILLED,
    eatingSlots: null,
    ...over,
  };
}

function mouth(over: Partial<FunnelMouth> = {}): FunnelMouth {
  return {
    memberId: "mem-zoe",
    claimed: false,
    eatingSlots: null,
    away: [],
    firstName: "Zoé",
    kind: "adult",
    birthDate: null,
    goal: null,
    allergiesReviewed: false,
    diet: null,
    heightCm: null,
    weightKg: null,
    gender: null,
    activityLevel: null,
    ...over,
  };
}

describe("D4 ② · le titulaire entre dans la liste des grilles", () => {
  it("⛔ LE DÉFAUT — il est là, et il est PREMIER", () => {
    const roster = presenceRoster({ self: self(), mouths: [mouth()] });
    expect(roster).toHaveLength(2);
    expect(roster[0].memberId).toBe("mem-owner");
    expect(roster[0].firstName).toBe("Kai");
    expect(roster[1].memberId).toBe("mem-zoe");
  });

  it("⛔ SES CINQ MIDIS PRÉ-REMPLIS ARRIVENT JUSQU'À LA GRILLE", () => {
    // Sans eux, la grille s'ouvre VIERGE sur une ligne qui porte cinq marques:
    // le premier enregistrement les effacerait toutes, en silence — et la
    // question de l'étape 3 se retrouverait démentie par un geste que personne
    // n'a fait.
    const roster = presenceRoster({ self: self(), mouths: [] });
    expect(roster[0].away).toHaveLength(5);
    expect(roster[0].away.every((a) => a.kind === "eating_out")).toBe(true);
    // ⚠️ UNE COPIE, PAS LA MÊME RÉFÉRENCE: la grille réécrit ce qu'on lui
    // donne, et rendre le tableau des faits laisserait un écran muter la
    // lecture d'une autre carte.
    expect(roster[0].away).not.toBe(PREFILLED);
  });

  it("son rythme à lui traverse, `null` compris", () => {
    // `null` = « aux moments de la maison », le repli du produit. Le remplacer
    // par les moments de la maison ICI pré-cocherait sur sa ligne des repas que
    // personne n'a déclarés pour lui.
    expect(presenceRoster({ self: self(), mouths: [] })[0].eatingSlots).toBe(null);
    const slots = [{ slot: "lunch" as const, size: null }];
    const roster = presenceRoster({ self: self({ eatingSlots: slots }), mouths: [] });
    expect(roster[0].eatingSlots).toEqual(slots);
  });

  it("⛔ SANS LIGNE MEMBRE, AUCUNE GRILLE — le compte solo", () => {
    // Pas de foyer ⇒ rien où écrire. Une carte ouverte sur `setMemberAway(null)`
    // est un bouton qui échoue à tous les coups.
    const roster = presenceRoster({
      self: self({ ownMemberId: null }),
      mouths: [mouth()],
    });
    expect(roster).toHaveLength(1);
    expect(roster[0].memberId).toBe("mem-zoe");
  });

  it("solo SANS aucune autre bouche: la liste est vide, la carte ne se rend pas", () => {
    // La carte de présence est gardée par `mouths.length > 0`: une liste vide
    // est ce qui la garde fermée, et c'est le comportement d'avant ce lot.
    expect(presenceRoster({ self: self({ ownMemberId: null }), mouths: [] }))
      .toEqual([]);
  });

  it("⛔ IL N'APPARAÎT JAMAIS DEUX FOIS, même si `mouths` le porte", () => {
    // `readFunnelFacts` le retire déjà — mais on ne le croit pas sur parole.
    // Deux cartes au même nom, chacune écrivant la même colonne, laisseraient
    // gagner celle qu'on enregistre en dernier.
    const roster = presenceRoster({
      self: self(),
      mouths: [mouth({ memberId: "mem-owner", firstName: "Kai" }), mouth()],
    });
    expect(roster).toHaveLength(2);
    expect(roster.filter((m) => m.memberId === "mem-owner")).toHaveLength(1);
  });

  it("une bouche sans `memberId` (jamais écrite) n'a pas de grille", () => {
    // La porte prend un `member_id`. Une bouche saisie et pas encore
    // enregistrée n'en a pas: lui ouvrir une grille rendrait `not_a_member`.
    const roster = presenceRoster({
      self: self(),
      mouths: [mouth({ memberId: null })],
    });
    expect(roster).toHaveLength(1);
    expect(roster[0].memberId).toBe("mem-owner");
  });
});
