import { describe, expect, it } from "vitest";

import {
  DRAFT_NOTE_MAX_CHARS,
  habitDraft,
  habitDraftBlocked,
  habitPayload,
  type MemberHabitsView,
  parseHabitNote,
  parseHabitSlots,
} from "./householdHabits";
import { householdErrorKey } from "../copy/planRefusals";

// CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS.
//
// Il tient les DÉCISIONS PURES de l'écran des habitudes: comment on relit ce
// que la base rend, ce qu'on affiche quand personne n'a rien dit, et ce qu'on
// consent à envoyer. Il ne tient RIEN de la garde — elle est en base et dans
// `plan_draft_note.ts`, et une seconde garde ici divergerait (spec §G3).
//
// Le cas qui a ouvert le chantier est nommé tel quel: une femme qui mange une
// pomme le matin, à qui un plan réel a servi des œufs brouillés sept matins
// d'affilée.

const APPLE: MemberHabitsView = {
  memberId: "m1",
  slots: [{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }],
  note: null,
};

describe("parseHabitSlots", () => {
  it("relit une habitude du matin", () => {
    expect(parseHabitSlots([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    ])).toEqual([{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }]);
  });

  it("écarte plutôt que de deviner: moment inconnu, kind hors liste, texte vide", () => {
    // Les trois se jettent, et aucun ne « se répare ». Une entrée réparée
    // ferait dire à l'écran autre chose que ce avec quoi on a composé.
    expect(parseHabitSlots([
      { slot: "brunch", kind: "own_usual", usual: "une pomme" },
      { slot: "lunch", kind: "own_dish", usual: "salade" },
      { slot: "dinner", kind: "own_usual", usual: "   " },
    ])).toEqual([]);
  });

  it("`household_dish` n'est PAS une ligne — il ne dit rien de plus que son absence", () => {
    expect(parseHabitSlots([
      { slot: "lunch", kind: "household_dish" },
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    ])).toEqual([{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }]);
  });

  it("rend l'ordre de LA JOURNÉE, pas celui de la saisie", () => {
    expect(parseHabitSlots([
      { slot: "dinner", kind: "own_usual", usual: "soupe" },
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    ]).map((s) => s.slot)).toEqual(["breakfast", "dinner"]);
  });

  it("un moment vu deux fois: la PREMIÈRE gagne", () => {
    expect(parseHabitSlots([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "breakfast", kind: "own_usual", usual: "des œufs" },
    ])[0].usual).toBe("une pomme");
  });

  it("ce qui n'est pas un tableau rend une liste vide, sans jeter", () => {
    expect(parseHabitSlots(null)).toEqual([]);
    expect(parseHabitSlots("breakfast")).toEqual([]);
    expect(parseHabitSlots({ slot: "breakfast" })).toEqual([]);
  });
});

describe("parseHabitNote", () => {
  it("le vide et le blanc se lisent `null` — « rien de dit »", () => {
    expect(parseHabitNote("")).toBeNull();
    expect(parseHabitNote("   ")).toBeNull();
    expect(parseHabitNote(null)).toBeNull();
    expect(parseHabitNote(42)).toBeNull();
  });

  it("garde le texte, sans ses bords", () => {
    expect(parseHabitNote("  elle grignote en cuisinant  "))
      .toBe("elle grignote en cuisinant");
  });
});

describe("habitDraft — le piège n°1 de la spec, en code", () => {
  it("AUCUNE LIGNE ⇒ RIEN N'EST COCHÉ", () => {
    // LA RÈGLE DU LOT. `null` veut dire « personne n'a rien dit », jamais
    // « elle mange comme tout le monde ». Une coche automatique écrirait, au
    // premier Save, un fait faux que l'utilisateur ne peut pas démentir —
    // cicatrice `auto-tick-writes-undeniable-false-facts`.
    const draft = habitDraft(["breakfast", "lunch", "dinner"], null);
    expect(draft.map((d) => d.choice)).toEqual([null, null, null]);
    expect(draft.map((d) => d.usual)).toEqual(["", "", ""]);
  });

  it("UNE LIGNE EXISTE ⇒ ce qui n'y est pas est « le plat de la maison »", () => {
    // Un humain a répondu pour cette bouche, et la réponse couvrait ses
    // moments. Ce n'est pas l'écran qui coche: c'est l'utilisateur, relu.
    const draft = habitDraft(["breakfast", "lunch", "dinner"], APPLE);
    expect(draft).toEqual([
      { slot: "breakfast", choice: "own_usual", usual: "une pomme" },
      { slot: "lunch", choice: "household_dish", usual: "" },
      { slot: "dinner", choice: "household_dish", usual: "" },
    ]);
  });

  it("les moments sont CEUX DE LA PERSONNE, pas une liste de six", () => {
    // Quelqu'un qui ne prend pas de collation ne doit pas lire une ligne vide
    // toutes les semaines (spec §H1).
    expect(habitDraft(["lunch", "dinner"], null).map((d) => d.slot))
      .toEqual(["lunch", "dinner"]);
  });

  it("une habitude sur un moment que la personne ne prend plus sort du brouillon", () => {
    // ⚠️ ET ELLE SORTIRA DONC DE LA BASE AU PROCHAIN ENREGISTREMENT — c'est
    // délibéré, et c'est le moins mauvais des deux. L'autre choix serait de la
    // réinjecter dans la charge utile pour la préserver: une habitude que
    // l'écran ne montre pas, que personne ne peut retirer, et qui continue de
    // gouverner la composition. Ce dépôt appelle ça un fait indémentable.
    // Ce qui est à l'écran est ce qui sera écrit.
    expect(habitDraft(["lunch"], APPLE).map((d) => d.slot)).toEqual(["lunch"]);
    expect(habitPayload(habitDraft(["lunch"], APPLE), {})).toEqual([]);
  });
});

describe("habitPayload", () => {
  it("n'écrit QUE les habitudes — un `household_dish` est une absence", () => {
    expect(habitPayload([
      { slot: "breakfast", choice: "own_usual", usual: "une pomme" },
      { slot: "lunch", choice: "household_dish", usual: "" },
      { slot: "dinner", choice: "household_dish", usual: "" },
    ], {})).toEqual([{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }]);
  });

  it("un moment sans réponse n'écrit RIEN", () => {
    // On n'écrit pas « elle mange le plat de la maison » au nom de quelqu'un
    // qui n'a pas répondu. C'est la même règle que `habitDraft`, à l'envers.
    expect(habitPayload([
      { slot: "breakfast", choice: null, usual: "" },
      { slot: "lunch", choice: null, usual: "" },
    ], {})).toEqual([]);
  });

  it("un `usual` resté vide ne part pas — la base le refuserait", () => {
    expect(habitPayload([
      { slot: "breakfast", choice: "own_usual", usual: "   " },
    ], {})).toEqual([]);
  });

  it("le texte part sans ses bords", () => {
    expect(habitPayload([
      { slot: "breakfast", choice: "own_usual", usual: "  une pomme  " },
    ], {})[0].usual).toBe("une pomme");
  });

  it("⛔ LES EXTRAS DÉJÀ ÉCRITS SURVIVENT À UN ENREGISTREMENT D'ICI", () => {
    // ⚠️ CETTE CARTE N'ÉDITE QUE LA PROSE, et la porte REMPLACE la liste
    // entière: sans le report, enregistrer une habitude depuis
    // `/app/household` effacerait les bulles cochées dans la fiche.
    expect(habitPayload(
      [{ slot: "breakfast", choice: "own_usual", usual: "une pomme" }],
      { lunch: ["bread"], dinner: [] },
    )).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      // Aucune prose au déjeuner ⇒ `household_dish`, la seule forme que la
      // porte accepte pour une entrée sans texte.
      { slot: "lunch", kind: "household_dish", usual: "", extras: ["bread"] },
      // ⛔ ET LE TABLEAU VIDE PART QUAND MÊME: c'est « on m'a demandé, je ne
      // prends rien à côté », une réponse distincte de la clé absente.
      { slot: "dinner", kind: "household_dish", usual: "", extras: [] },
    ]);
  });

  it("un texte tapé puis rebasculé sur « le plat de la maison » ne part pas", () => {
    // Le champ garde ce qui a été tapé (on ne l'efface pas sous les doigts),
    // et c'est le CHOIX qui décide de ce qui s'écrit.
    expect(habitPayload([
      { slot: "breakfast", choice: "household_dish", usual: "une pomme" },
    ], {})).toEqual([]);
  });
});

describe("habitDraftBlocked", () => {
  it("nomme LE moment fautif, pas un booléen", () => {
    expect(habitDraftBlocked([
      { slot: "breakfast", choice: "own_usual", usual: "" },
      { slot: "lunch", choice: "own_usual", usual: "salade" },
      { slot: "dinner", choice: null, usual: "" },
    ])).toEqual(["breakfast"]);
  });

  it("un brouillon où personne n'a rien dit n'est pas bloquant", () => {
    // Il n'écrira rien, et « ne rien écrire » est une réponse valide.
    expect(habitDraftBlocked([
      { slot: "breakfast", choice: null, usual: "" },
    ])).toEqual([]);
  });
});

describe("les refus de la RPC ont tous une PHRASE", () => {
  // ⚠️ LE DÉFAUT QUE LOT C A MESURÉ AU NAVIGATEUR: un motif rendu en jeton
  // brut. La liste est celle de la spec §G2, écrite en LITTÉRAUX — un ternaire
  // rendrait un motif orphelin en silence (`planRefusals.int.test.ts` ne lit
  // que les littéraux).
  it.each([
    "not_authenticated",
    "not_a_member",
    "bad_slots",
    "bad_note",
    "not_your_line",
  ])("`%s` se traduit", (reason) => {
    expect(householdErrorKey(reason)).not.toBeNull();
  });

  it("un motif inconnu rend `null`, et l'écran affiche le jeton tel quel (R7)", () => {
    expect(householdErrorKey("habit_unusable")).toBeNull();
  });
});

describe("le plafond de texte est celui du serveur", () => {
  it("280, importé et non recopié", () => {
    // Une seconde constante ici divergerait au premier ajustement, et c'est
    // l'écran qui aurait raison contre la base.
    expect(DRAFT_NOTE_MAX_CHARS).toBe(280);
  });
});
