import { describe, expect, it } from "vitest";

import {
  habitEntriesToWrite,
  lightAnswered,
  LIGHT_BEARING_SLOTS as frontLightSlots,
  parseHabitLight,
  parseHabitSideCourses,
  setSideCourseChoice,
  SIDE_COURSE_CHOICES,
  SIDE_COURSE_KINDS as frontSideKinds,
  SIDE_COURSE_SLOTS as frontSideSlots,
  sideCourseChoiceOf,
  type SideCoursesDraft,
  toggleLight,
} from "./mealExtras";
import { LIGHT_BEARING_SLOTS as backLightSlots } from "../../../../supabase/functions/_shared/keel/meal_extras.ts";
import {
  SIDE_COURSE_KINDS as backSideKinds,
  SIDE_COURSE_SLOTS as backSideSlots,
} from "../../../../supabase/functions/_shared/keel/side_courses_types.ts";
import { draftFromKnown, knownMouthForOwner, mouthToPersist } from "./mouthForm";
import { habitDraft, habitPayload, parseHabitSlots } from "../api/householdHabits";
import { EATING_OCCASIONS } from "../api/mealGeneration";
import {
  LIGHT_SLOT_WEIGHT as backLightWeight,
  SLOT_DAY_WEIGHT as backSlotWeight,
} from "../../../../supabase/functions/_shared/keel/mouth_anchor.ts";
import {
  parseMemberHabits,
  parseMemberLight,
  parseMemberSideCourses,
} from "../../../../supabase/functions/_shared/keel/household_habits.ts";

// ===========================================================================
// ⟳ 2026-09-10 — LE MIROIR DES EXTRAS EST SUPPRIMÉ
//
// ⛔ CE QU'IL GARDAIT: les cinq jetons (`bread / cheese / yoghurt / fruit /
// dessert`), les deux moments qui les portaient, et l'aller-retour écran →
// base → écran de `extras`. Décision produit du 2026-09-10: le plan
// dimensionne les aliments qu'il prévoit et ne réserve plus d'énergie pour un
// accompagnement personnel hors plan.
//
// ⚠️ CE QUI RESTE À GARDER EST L'ALLER-RETOUR DE CE QUI SURVIT — la prose et
// le « repas léger ». Le miroir n'a pas changé de rôle, il a perdu un sujet.
// ===========================================================================

describe("l'aller-retour des habitudes", () => {
  it("⛔ ce que l'écran ÉCRIT, le serveur le RELIT à l'identique", () => {
    const written = habitEntriesToWrite({
      habits: { breakfast: "une pomme", dinner: "  du poisson " },
      light: { lunch: false },
      sideCourses: {},
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "lunch", kind: "household_dish", usual: "", light: false },
      { slot: "dinner", kind: "own_usual", usual: "du poisson" },
    ]);
    // ⚠️ LE SERVEUR, MOT POUR MOT — pas une réécriture du parseur d'écran.
    expect(parseMemberLight(written)).toEqual({ lunch: false });
    expect(parseMemberHabits(written).map((h) => h.usual)).toEqual([
      "une pomme",
      "du poisson",
    ]);
  });

  it("⛔ AUCUNE CLÉ `extras` N'EST PLUS ÉCRITE, même sur un moment qui en portait", () => {
    // ⛔ L'ÉPREUVE D'ABSENCE. Le sérialiseur est le SEUL chemin vers la base:
    // s'il n'écrit plus la clé, aucune réponse neuve ne peut naître. Les
    // anciennes restent en base et ne sont lues par personne.
    const written = habitEntriesToWrite({
      habits: { lunch: "un sandwich" },
      light: {},
      sideCourses: {},
      occasions: ["lunch", "dinner"],
    });
    for (const entry of written) {
      expect(Object.prototype.hasOwnProperty.call(entry, "extras")).toBe(false);
    }
    expect(JSON.stringify(written)).not.toContain("extras");
  });
});

// ===========================================================================
// LE MIROIR DU « + REPAS LÉGER » — 2026-09-07
//
// ⛔ TROIS LISTES DOIVENT PORTER LES MÊMES CLÉS, et aucune n'est dérivée des
// autres: `LIGHT_BEARING_SLOTS` côté écran, la même côté moteur, et les clés de
// `LIGHT_SLOT_WEIGHT` qui donnent le POIDS. Un moment marquable sans poids
// serait une case qui ne fait rien; un poids sans case, un poids que rien
// n'atteint. La contrainte SQL en tient une quatrième copie, et son bloc de
// contrôle la vérifie côté base.
// ===========================================================================

describe("le miroir du repas léger", () => {
  it("nomme les MÊMES trois moments que le moteur ET que la table des poids", () => {
    expect([...frontLightSlots]).toEqual([...backLightSlots]);
    expect([...frontLightSlots].sort()).toEqual(Object.keys(backLightWeight).sort());
  });

  it("le petit-déjeuner en fait partie, les collations non", () => {
    // Le léger demande « ce moment pèse-t-il moins » — partout où le plan
    // compose un vrai repas. Mettre une bulle « léger » sur un goûter demanderait
    // au plan de composer ~40 kcal, et la base la refuse.
    expect(frontLightSlots).toContain("breakfast");
    for (const slot of ["snack_am", "snack_pm", "before_bed"]) {
      expect(frontLightSlots).not.toContain(slot);
    }
  });

  it("chaque poids léger est STRICTEMENT plus petit que l'ordinaire", () => {
    for (const slot of frontLightSlots) {
      expect(backLightWeight[slot]).toBeLessThan(
        backSlotWeight[slot as keyof typeof backSlotWeight],
      );
    }
  });

  it("l'aller-retour écran → base → écran garde la réponse", () => {
    // ⛔ LE VRAI RISQUE DU MIROIR: l'écran écrit une forme que le parseur du
    // moteur écarte en silence, et la réponse disparaît entre deux écrans.
    const written = habitEntriesToWrite({
      habits: {},
      light: { dinner: true, breakfast: false },
      sideCourses: {},
      occasions: ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"],
    });
    // Un moment dont SEUL le léger est répondu sort quand même — en
    // `household_dish`, la seule forme qu'accepte la RPC sans prose.
    expect(written).toEqual([
      { slot: "breakfast", kind: "household_dish", usual: "", light: false },
      { slot: "dinner", kind: "household_dish", usual: "", light: true },
    ]);
    // Le parseur du MOTEUR la relit à l'identique.
    expect(parseMemberLight(written)).toEqual({ breakfast: false, dinner: true });
    // Et celui de l'ÉCRAN aussi — les deux ne doivent jamais diverger.
    expect(parseHabitLight(written)).toEqual({ breakfast: false, dinner: true });
  });

  it("⛔ ALLUMÉ PUIS ÉTEINT ÉCRIT `false`, pas rien", () => {
    // Sans ça, personne ne pourrait dire « j'ai regardé, ce moment est comme
    // d'habitude » — et l'écran reposerait la question à chaque ouverture.
    const once = toggleLight({}, "dinner");
    expect(once).toEqual({ dinner: true });
    const twice = toggleLight(once, "dinner");
    expect(twice).toEqual({ dinner: false });
    expect(lightAnswered(twice, "dinner")).toBe(true);
    expect(lightAnswered({}, "dinner")).toBe(false);
    // Et `false` traverse jusqu'à la base.
    const written = habitEntriesToWrite({
      habits: {},
      light: twice,
      sideCourses: {},
      occasions: ["dinner"],
    });
    expect(written[0].light).toBe(false);
  });

  it("une collation marquée légère est ÉCARTÉE des deux côtés", () => {
    // La lecture, l'écriture et la base doivent refuser la même chose, sinon la
    // plus permissive des trois décide.
    const written = habitEntriesToWrite({
      habits: {},
      light: { snack_pm: true },
      sideCourses: {},
      occasions: ["snack_pm"],
    });
    expect(written).toEqual([]);
    expect(parseHabitLight([{ slot: "snack_pm", light: true }])).toEqual({});
    expect(parseMemberLight([{ slot: "snack_pm", light: true }])).toEqual({});
  });

  it("`light` et la PROSE cohabitent sur la même entrée", () => {
    const written = habitEntriesToWrite({
      habits: { dinner: "une soupe" },
      light: { dinner: true },
      sideCourses: {},
      occasions: ["dinner"],
    });
    expect(written).toEqual([
      { slot: "dinner", kind: "own_usual", usual: "une soupe", light: true },
    ]);
  });
});

// ===========================================================================
// ⟳ 2026-09-23 — LE MIROIR DES À-CÔTÉS (entrée, fromage, dessert, pain)
//
// ⛔ TROIS COPIES D'UN MÊME VOCABULAIRE, ET AUCUNE N'EST DÉRIVÉE DES AUTRES:
// `SIDE_COURSE_KINDS` / `SIDE_COURSE_SLOTS` côté écran, les mêmes côté moteur
// (`_shared/keel/side_courses_types.ts`), et la contrainte SQL
// `household_member_habits_side_courses_check`. Un type que l'écran pose et que
// la base refuse ferait échouer TOUTE l'écriture de la fiche; un type que le
// moteur connaît et que l'écran ne montre pas serait un réglage que personne
// ne peut changer.
//
// ⚠️ LES LISTES SONT AUSSI ÉCRITES EN DUR: comparer deux copies entre elles
// resterait vert si les deux perdaient `bread` ensemble.
// ===========================================================================

describe("le miroir des à-côtés", () => {
  it("nomme les MÊMES quatre types et les MÊMES deux moments que le moteur", () => {
    expect([...frontSideKinds]).toEqual([...backSideKinds]);
    expect([...frontSideSlots]).toEqual([...backSideSlots]);
    expect([...frontSideKinds]).toEqual(["starter", "cheese", "dessert", "bread"]);
    expect([...frontSideSlots]).toEqual(["lunch", "dinner"]);
    expect([...SIDE_COURSE_CHOICES]).toEqual(["yes", "no", "auto"]);
  });

  it("⛔ la lecture de l'écran rend EXACTEMENT ce que lit le moteur", () => {
    // Le risque d'un miroir de lecture: l'écran affiche un « Non » que le plan
    // ne voit pas (ou l'inverse). Les deux parseurs passent sur les mêmes
    // entrées, y compris celles que la base refuserait.
    const cases: unknown[] = [
      null,
      "side_courses",
      [],
      [{ slot: "dinner", side_courses: { dessert: false, cheese: true } }],
      // un moment sans à-côté, une collation: jamais lus
      [{ slot: "breakfast", side_courses: { dessert: false } }],
      [{ slot: "snack_pm", side_courses: { bread: true } }],
      // un type inconnu est écarté, son voisin survit
      [{ slot: "lunch", side_courses: { soup: true, starter: false } }],
      // pas un vrai booléen: écarté
      [{ slot: "lunch", side_courses: { dessert: "no", bread: 1 } }],
      // pas un objet: écarté entier
      [{ slot: "dinner", side_courses: ["dessert"] }],
      [{ slot: "dinner", side_courses: "dessert" }],
      // le PREMIER qui porte la clé gagne, même s'il est illisible
      [
        { slot: "dinner", side_courses: ["x"] },
        { slot: "dinner", side_courses: { cheese: true } },
      ],
      // une entrée sans la clé ne « prend » pas le moment
      [
        { slot: "lunch", kind: "own_usual", usual: "une salade" },
        { slot: "lunch", side_courses: { starter: true } },
      ],
      // l'entrée écrite par la mémoire, sans `kind`
      [{ slot: " Dinner ", side_courses: { starter: false } }],
      [{ slot: "lunch", side_courses: {} }],
    ];
    for (const raw of cases) {
      expect(parseHabitSideCourses(raw), JSON.stringify(raw))
        .toEqual(parseMemberSideCourses(raw));
    }
    // ⚠️ LA PRÉMISSE, ARMÉE: si les deux rendaient `{}` partout, l'égalité
    // ci-dessus ne prouverait rien.
    expect(parseHabitSideCourses(cases[3])).toEqual({
      dinner: { dessert: false, cheese: true },
    });
    expect(parseHabitSideCourses(cases[6])).toEqual({ lunch: { starter: false } });
    expect(parseHabitSideCourses(cases[11])).toEqual({ lunch: { starter: true } });
    expect(parseHabitSideCourses(cases[12])).toEqual({ dinner: { starter: false } });
  });

  it("un moment qui ne porte QUE ses à-côtés s'écrit en `household_dish`", () => {
    // La RPC d'écran exige un `kind` sur chaque entrée, et refuse un
    // `own_usual` sans prose: c'est la forme qu'a déjà prise le « léger ».
    const written = habitEntriesToWrite({
      habits: { breakfast: "une pomme" },
      light: {},
      sideCourses: { dinner: { dessert: false } },
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "dinner", kind: "household_dish", usual: "", side_courses: { dessert: false } },
    ]);
    expect(parseMemberSideCourses(written)).toEqual({ dinner: { dessert: false } });
    // la prose relue par le moteur n'a pas bougé
    expect(parseMemberHabits(written).map((h) => h.usual)).toEqual(["une pomme"]);
  });

  it("la prose, le léger et les à-côtés cohabitent sur la même entrée", () => {
    const written = habitEntriesToWrite({
      habits: { lunch: "une soupe" },
      light: { lunch: true },
      sideCourses: { lunch: { bread: true, starter: false } },
      occasions: ["lunch"],
    });
    // ⚠️ L'ORDRE DES TYPES EST CELUI DU VOCABULAIRE, pas celui de la saisie:
    // deux fiches identiques s'écrivent pareil.
    expect(written).toEqual([
      {
        slot: "lunch",
        kind: "own_usual",
        usual: "une soupe",
        light: true,
        side_courses: { starter: false, bread: true },
      },
    ]);
    expect(Object.keys(written[0].side_courses ?? {})).toEqual(["starter", "bread"]);
  });

  it("⛔ CE QUE LA BASE REFUSERAIT NE PART PAS — et le reste de la fiche passe", () => {
    // Une clé refusée par la contrainte ferait échouer TOUTE l'écriture:
    // prose et léger compris. Le sérialiseur écarte donc ce qu'elle refuse.
    const written = habitEntriesToWrite({
      habits: {},
      light: { breakfast: true },
      sideCourses: {
        // un moment qui n'en porte pas
        ...({ breakfast: { dessert: false } } as SideCoursesDraft),
        // un type inconnu et une valeur qui n'est pas un booléen
        lunch: { ...({ soup: true, dessert: "no" } as unknown as SideCoursesDraft["lunch"]) },
        // un objet vide ne dit rien
        dinner: {},
      },
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([
      { slot: "breakfast", kind: "household_dish", usual: "", light: true },
    ]);
    expect(JSON.stringify(written)).not.toContain("side_courses");
  });
});

describe("un clic sur une ligne du champ", () => {
  it("écrit la MÊME réponse au déjeuner et au dîner", () => {
    const next = setSideCourseChoice({}, "dessert", "no");
    expect(next).toEqual({ lunch: { dessert: false }, dinner: { dessert: false } });
    expect(sideCourseChoiceOf(next, "dessert")).toBe("no");
    expect(setSideCourseChoice(next, "dessert", "yes")).toEqual({
      lunch: { dessert: true },
      dinner: { dessert: true },
    });
  });

  it("⛔ « Selon l'objectif » RETIRE la clé — il n'écrit jamais `null`", () => {
    const back = setSideCourseChoice(
      { lunch: { dessert: false }, dinner: { dessert: false } },
      "dessert",
      "auto",
    );
    // Un moment sans aucun type réglé sort du brouillon: rien à dire.
    expect(back).toEqual({});
    expect(sideCourseChoiceOf(back, "dessert")).toBe("auto");
    expect(
      habitEntriesToWrite({ habits: {}, light: {}, sideCourses: back, occasions: ["lunch", "dinner"] }),
    ).toEqual([]);
  });

  it("⛔ LES AUTRES TYPES NE BOUGENT PAS, moment par moment", () => {
    // « pas d'entrée le soir », posé par la mémoire sur le seul dîner, survit
    // à un clic sur « Dessert ».
    const fromMemory: SideCoursesDraft = { dinner: { starter: false } };
    const next = setSideCourseChoice(fromMemory, "dessert", "yes");
    expect(next).toEqual({
      lunch: { dessert: true },
      dinner: { starter: false, dessert: true },
    });
  });

  it("⚠️ déjeuner et dîner en désaccord ⇒ la ligne n'affirme rien", () => {
    const mixed: SideCoursesDraft = { dinner: { starter: false } };
    expect(sideCourseChoiceOf(mixed, "starter")).toBe(null);
    // la PRÉMISSE: les autres lignes, elles, s'affichent
    expect(sideCourseChoiceOf(mixed, "cheese")).toBe("auto");
    expect(sideCourseChoiceOf({ lunch: { cheese: true }, dinner: { cheese: true } }, "cheese"))
      .toBe("yes");
  });
});

// ===========================================================================
// ⛔ L'ALLER-RETOUR QUI A DÉJÀ COÛTÉ UNE CLÉ: écrire → relire → réécrire une
// AUTRE habitude → la clé est toujours là.
//
// `keel_household_set_member_habits` REMPLACE la liste entière. L'ancienne clé
// `extras` a été perdue exactement ainsi: un écrivain qui ne la reportait pas
// l'effaçait à chaque enregistrement d'une habitude. Les deux chemins
// d'écriture de l'écran sont rejoués ici, à travers les lecteurs RÉELS.
// ===========================================================================

describe("l'aller-retour des à-côtés à travers une autre écriture", () => {
  /** La base: ce que la porte stocke, tel quel (elle ne réécrit pas `slots`). */
  const first = habitEntriesToWrite({
    habits: { breakfast: "une pomme" },
    light: {},
    sideCourses: {
      lunch: { dessert: false },
      dinner: { dessert: false, cheese: true },
    },
    occasions: EATING_OCCASIONS,
  });

  it("LA PRÉMISSE — la première écriture porte bien les à-côtés", () => {
    expect(parseMemberSideCourses(first)).toEqual({
      lunch: { dessert: false },
      dinner: { dessert: false, cheese: true },
    });
  });

  it("⛔ la fiche (`mouthToPersist`), semée sur la lecture, les réécrit", () => {
    // Le chemin du titulaire et des bouches: la lecture sème la fiche, on
    // change la PROSE, on enregistre.
    const known = knownMouthForOwner({
      isOwner: true,
      displayName: "Fabrice",
      ownMouth: { birthDate: "1970-05-01", goal: "fat_loss", targetWeightKg: null, paceKgPerWeek: null },
      body: null,
      habits: parseHabitSlots(first),
      light: parseHabitLight(first),
      sideCourses: parseHabitSideCourses(first),
    });
    expect(known).not.toBeNull();
    const draft = draftFromKnown(known!);
    const edited = { ...draft, habits: { ...draft.habits, breakfast: "deux kiwis" } };
    const second = mouthToPersist(edited, "2026-09-23", "m-1").habits;
    expect(parseMemberHabits(second).map((h) => h.usual)).toEqual(["deux kiwis"]);
    expect(parseMemberSideCourses(second)).toEqual({
      lunch: { dessert: false },
      dinner: { dessert: false, cheese: true },
    });
  });

  it("⛔ la carte d'habitudes d'un membre les réécrit elle-même, depuis la lecture", () => {
    // ⟳ 2026-09-23 — `HouseholdHabitsCard` passe le réglage LU dans `carried`
    // (`habitPayload(…, { light, sideCourses })`); le report au montage n'avait
    // plus d'appelant à l'écran et a été retiré.
    const view = {
      slots: parseHabitSlots(first),
      light: parseHabitLight(first),
      sideCourses: parseHabitSideCourses(first),
    };
    const draft = habitDraft(["breakfast", "lunch", "dinner"], {
      memberId: "m-2",
      ...view,
      note: null,
    }).map((d) => d.slot === "breakfast" ? { ...d, usual: "un yaourt" } : d);
    // ⚠️ LE CAS QUI MORD: un `carried` vide EFFACE le réglage.
    expect(parseMemberSideCourses(habitPayload(draft, { light: view.light, sideCourses: {} })))
      .toEqual({});
    const second = habitPayload(draft, { light: view.light, sideCourses: view.sideCourses });
    expect(parseMemberHabits(second).map((h) => h.usual)).toEqual(["un yaourt"]);
    expect(parseMemberSideCourses(second)).toEqual({
      lunch: { dessert: false },
      dinner: { dessert: false, cheese: true },
    });
  });
});
