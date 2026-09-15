// LE RYTHME DE LA SEMAINE — ce que ces tests protègent.
//
//   * le moment vient de `occurred_at` et PAS de `slot_key` : mesuré en base,
//     `slot_key` est NULL sur 71 % des lignes, donc une grille bâtie dessus
//     afficherait une semaine trouée à un élève qui a tout déclaré ;
//   * mais un créneau NOMMÉ par l'élève surclasse l'horloge : c'est ce qui
//     rattrape « hier soir j'ai mangé… » tapé le lendemain matin ;
//   * un créneau relatif à une séance (`pre_workout`) ne surclasse RIEN : une
//     séance à 7 h et une à 20 h portent le même jeton ;
//   * une photo disqualifiée (menu, rayon, illisible) n'est pas un repas et
//     n'entre pas dans le rythme ;
//   * aucun nombre d'énergie nulle part, à aucun endroit de la sortie.

import { describe, expect, it } from "vitest";

import {
  aggregateRhythm,
  hourInZone,
  momentForHour,
  momentOf,
  type RhythmEventRow,
} from "./mealRhythm";

const TZ = "Europe/Paris";

function row(over: Partial<RhythmEventRow> = {}): RhythmEventRow {
  return {
    local_date: "2026-08-04",
    // 12 h 30 à Paris en août (UTC+2).
    occurred_at: "2026-08-04T10:30:00.000Z",
    slot_key: null,
    portion_band: "moderate",
    food_group_ref: null,
    recognized: null,
    ...over,
  };
}

describe("les bornes des moments", () => {
  it("couvrent les 24 heures, sans trou ni recouvrement", () => {
    const seen = new Set<string>();
    for (let h = 0; h < 24; h++) seen.add(momentForHour(h));
    expect([...seen].sort()).toEqual(
      ["afternoon", "evening", "midday", "morning", "night"],
    );
  });

  it("la nuit enjambe minuit", () => {
    expect(momentForHour(23)).toBe("night");
    expect(momentForHour(0)).toBe("night");
    expect(momentForHour(4)).toBe("night");
    expect(momentForHour(5)).toBe("morning");
  });
});

describe("hourInZone", () => {
  it("résout l'heure DANS le fuseau, pas celle du serveur", () => {
    // 22 h 30 UTC = 00 h 30 à Paris le lendemain: la même instant tombe dans
    // deux bandes différentes selon le fuseau, et c'est tout le sujet.
    expect(hourInZone("2026-08-04T22:30:00.000Z", "UTC")).toBe(22);
    expect(hourInZone("2026-08-04T22:30:00.000Z", "Europe/Paris")).toBe(0);
  });

  it("minuit rend 0 et jamais 24", () => {
    expect(hourInZone("2026-08-04T00:00:00.000Z", "UTC")).toBe(0);
  });

  it("un instant ou un fuseau illisible rend null, jamais une heure fausse", () => {
    expect(hourInZone("pas une date", "UTC")).toBeNull();
    expect(hourInZone("2026-08-04T10:00:00.000Z", "Mars/Olympus")).toBeNull();
  });
});

describe("d'où vient le moment", () => {
  it("sans slot_key, l'horloge décide", () => {
    expect(momentOf(row(), TZ)).toBe("midday");
  });

  it("un slot_key qui NOMME un moment surclasse l'horloge", () => {
    // Tapé à 12 h 30, mais l'élève a dit « au dîner ». C'est lui qui sait.
    expect(momentOf(row({ slot_key: "dinner" }), TZ)).toBe("evening");
    expect(momentOf(row({ slot_key: "breakfast" }), TZ)).toBe("morning");
    expect(momentOf(row({ slot_key: "before_bed" }), TZ)).toBe("night");
  });

  it("un slot RELATIF À UNE SÉANCE ne surclasse rien", () => {
    // `pre_workout` ne dit pas une heure: une séance à 7 h et une à 20 h
    // portent le même jeton. On retombe donc sur l'horloge.
    expect(momentOf(row({ slot_key: "pre_workout" }), TZ)).toBe("midday");
    expect(momentOf(row({ slot_key: "post_workout" }), TZ)).toBe("midday");
  });

  it("un slot VOLONTAIREMENT vague ne surclasse rien non plus", () => {
    expect(momentOf(row({ slot_key: "any_meal" }), TZ)).toBe("midday");
    expect(momentOf(row({ slot_key: "any_time" }), TZ)).toBe("midday");
  });

  it("sans horloge lisible et sans créneau nommé, le moment est null", () => {
    // On ne devine pas: la ligne sera comptée « sans moment » plutôt que rangée
    // dans une case au hasard.
    expect(momentOf(row({ occurred_at: "cassé" }), TZ)).toBeNull();
  });
});

describe("la grille", () => {
  const dates = ["2026-08-03", "2026-08-04"];

  it("range chaque repas dans son jour et son moment", () => {
    const summary = aggregateRhythm([
      row({ local_date: "2026-08-03", occurred_at: "2026-08-03T06:00:00.000Z" }), // 8 h
      row({ local_date: "2026-08-04", occurred_at: "2026-08-04T10:30:00.000Z" }), // 12 h 30
      row({ local_date: "2026-08-04", occurred_at: "2026-08-04T18:00:00.000Z" }), // 20 h
    ], { dates, timeZone: TZ });

    expect(summary.meals).toBe(3);
    expect(summary.daysLogged).toBe(2);
    expect(summary.days[0].cells.morning?.count).toBe(1);
    expect(summary.days[0].cells.evening).toBeNull();
    expect(summary.days[1].cells.midday?.count).toBe(1);
    expect(summary.days[1].cells.evening?.count).toBe(1);
    expect(summary.byMoment).toEqual({
      morning: 1, midday: 1, afternoon: 0, evening: 1, night: 0,
    });
  });

  it("une case garde la bande la PLUS GROSSE, jamais une moyenne", () => {
    // Deux assiettes au même créneau dont une large décrivent un créneau
    // chargé. Une moyenne fabriquerait une bande que personne n'a observée.
    const summary = aggregateRhythm([
      row({ portion_band: "small" }),
      row({ portion_band: "large" }),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(summary.days[0].cells.midday?.band).toBe("large");
    expect(summary.days[0].cells.midday?.count).toBe(2);
    expect(summary.bands).toEqual({ small: 1, moderate: 0, large: 1, unclear: 0 });
  });

  it("une photo DISQUALIFIÉE n'est pas un repas", () => {
    // Un menu de restaurant photographié: la colonne le dit, la grille filtre.
    const summary = aggregateRhythm([
      row({ disqualified_reason: "food_not_eaten" }),
      row({ disqualified_reason: "not_food" }),
      row({ disqualified_reason: "unreadable" }),
      row(),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(summary.meals).toBe(1);
    expect(summary.days[0].cells.midday?.count).toBe(1);
  });

  it("un fait sans moment est COMPTÉ, pas rangé au hasard", () => {
    const summary = aggregateRhythm([
      row({ occurred_at: "cassé" }),
      row(),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(summary.unplaced).toBe(1);
    expect(summary.days[0].unplaced).toBe(1);
    expect(summary.meals).toBe(2);
    // Et il n'a gonflé aucune case.
    expect(summary.byMoment.midday).toBe(1);
  });

  it("les groupes remontent dans la case", () => {
    const summary = aggregateRhythm([
      row({
        food_group_ref: "poultry",
        recognized: { food_groups_present: ["leafy_greens", "poultry"] },
      }),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    const cell = summary.days[0].cells.midday!;
    expect(cell.hasProtein).toBe(true);
    expect(cell.hasVeg).toBe(true);
    expect(cell.hasFruit).toBe(false);
  });

  it("un jour de la fenêtre sans repas reste dans la grille, vide", () => {
    // La grille doit montrer les trous: c'est la moitié de l'information.
    const summary = aggregateRhythm([], { dates, timeZone: TZ });
    expect(summary.days).toHaveLength(2);
    expect(summary.days[0].cells.morning).toBeNull();
    expect(summary.meals).toBe(0);
    expect(summary.busiest).toBeNull();
  });

  it("le moment le plus chargé est null en cas d'ÉGALITÉ", () => {
    // Nommer une habitude qui n'en est pas une serait une lecture inventée.
    const tie = aggregateRhythm([
      row({ slot_key: "breakfast" }),
      row({ slot_key: "dinner" }),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(tie.busiest).toBeNull();

    const clear = aggregateRhythm([
      row({ slot_key: "dinner" }),
      row({ slot_key: "dinner" }),
      row({ slot_key: "breakfast" }),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(clear.busiest).toBe("evening");
  });

  it("un repas hors de la fenêtre n'apparaît dans aucun jour", () => {
    const summary = aggregateRhythm([
      row({ local_date: "2026-07-01" }),
    ], { dates: ["2026-08-04"], timeZone: TZ });
    expect(summary.days[0].cells.midday).toBeNull();
    // Il compte quand même comme repas lu: c'est l'appelant qui fenêtre.
    expect(summary.meals).toBe(1);
  });

  it("AUCUN nombre d'énergie ne peut sortir d'ici", () => {
    // La sortie est structurellement incapable d'en porter un: pas de champ,
    // et les seules valeurs numériques sont des COMPTES d'événements.
    const summary = aggregateRhythm([row(), row({ portion_band: "large" })], {
      dates: ["2026-08-04"],
      timeZone: TZ,
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/kcal|calorie|protein_g|carb|macro/i);
  });
});

// ---------------------------------------------------------------------------
// LES ALIMENTS NOMMÉS — le défaut mesuré sur une vraie ligne
//
// Un bol d'avoine au fromage blanc. Le modèle avait écrit, avec 0,95 et 0,98
// de confiance, `detected_foods: [yogurt, rolled oats]`, `portion moderate`,
// `image_quality clear`. L'écran de progression rendait « 1 meal logged » et
// une ligne de zéros: aucun aliment nulle part.
//
// Cause: le SEUL endroit qui nommait des aliments (`weekInFood.topFoods`)
// exige un compte >= 2. Sur une photo, tout vaut 1 — la liste est toujours
// vide. Photographier coûte un geste et ne rendait rien.
// ---------------------------------------------------------------------------

describe("les aliments de la case", () => {
  const OATS: RhythmEventRow = {
    local_date: "2026-08-05",
    occurred_at: "2026-08-05T06:30:00.000Z", // 8 h 30 à Paris
    slot_key: null,
    portion_band: "moderate",
    food_group_ref: null,
    recognized: {
      food_groups_present: ["dairy_yogurt", "whole_grain"],
      detected_foods: [{ label: "yogurt" }, { label: "rolled oats" }],
    },
  };

  it("UNE seule photo nomme déjà ses aliments", () => {
    const r = aggregateRhythm([OATS], { dates: ["2026-08-05"], timeZone: TZ });
    expect(r.days[0].cells.morning?.foods).toEqual(["Yogurt", "Rolled oats"]);
  });

  it("le libellé du modèle est gardé, pas le jeton de groupe", () => {
    // « Rolled oats » est ce que l'élève reconnaît sur sa photo; `whole_grain`
    // est un jeton de catalogue qui ne lui dit rien.
    const r = aggregateRhythm([OATS], { dates: ["2026-08-05"], timeZone: TZ });
    const foods = r.days[0].cells.morning!.foods.join(" ");
    expect(foods).not.toMatch(/whole_grain|dairy_yogurt/);
  });

  it("deux repas du même créneau fusionnent sans doublon", () => {
    const second: RhythmEventRow = {
      ...OATS,
      occurred_at: "2026-08-05T07:00:00.000Z",
      recognized: {
        detected_foods: [{ label: "Yogurt" }, { label: "banana" }],
      },
    };
    const r = aggregateRhythm([OATS, second], {
      dates: ["2026-08-05"],
      timeZone: TZ,
    });
    // « Yogurt » n'apparaît qu'une fois malgré deux graphies.
    expect(r.days[0].cells.morning?.foods).toEqual([
      "Yogurt",
      "Rolled oats",
      "Banana",
    ]);
  });

  it("une case plafonne le nombre d'aliments nommés", () => {
    const many: RhythmEventRow = {
      ...OATS,
      recognized: {
        detected_foods: Array.from({ length: 12 }, (_, i) => ({
          label: `food ${i}`,
        })),
      },
    };
    const r = aggregateRhythm([many], { dates: ["2026-08-05"], timeZone: TZ });
    expect(r.days[0].cells.morning?.foods).toHaveLength(6);
  });

  it("une ligne sans aliment lu donne une liste vide, jamais un libellé inventé", () => {
    const r = aggregateRhythm([{ ...OATS, recognized: null }], {
      dates: ["2026-08-05"],
      timeZone: TZ,
    });
    expect(r.days[0].cells.morning?.foods).toEqual([]);
    expect(r.days[0].cells.morning?.count).toBe(1);
  });
});

describe("la vignette et la phrase de portion", () => {
  const PHOTO: RhythmEventRow = {
    local_date: "2026-08-05",
    occurred_at: "2026-08-05T06:30:00.000Z",
    slot_key: null,
    portion_band: "moderate",
    food_group_ref: null,
    media_path: "u1/2026-08-05/a.png",
    recognized: {
      detected_foods: [{ label: "rolled oats" }],
      portion_rationale: "The bowl is mostly full with a substantial mound of oats.",
    },
  };

  it("le chemin de la photo remonte, pour être signé", () => {
    const r = aggregateRhythm([PHOTO], { dates: ["2026-08-05"], timeZone: TZ });
    expect(r.days[0].cells.morning?.mediaPaths).toEqual(["u1/2026-08-05/a.png"]);
  });

  it("la phrase de portion remonte telle quelle", () => {
    const r = aggregateRhythm([PHOTO], { dates: ["2026-08-05"], timeZone: TZ });
    expect(r.days[0].cells.morning?.rationale).toContain("mostly full");
  });

  it("une déclaration TEXTE n'efface pas la phrase d'une photo du même créneau", () => {
    // Le texte n'a ni photo ni rationale. S'il écrasait, un élève qui commente
    // sa photo perdrait ce qu'on avait lu de son assiette.
    const text: RhythmEventRow = {
      ...PHOTO,
      media_path: null,
      occurred_at: "2026-08-05T07:00:00.000Z",
      recognized: { detected_foods: [{ label: "coffee" }] },
    };
    const r = aggregateRhythm([PHOTO, text], {
      dates: ["2026-08-05"],
      timeZone: TZ,
    });
    const cell = r.days[0].cells.morning!;
    expect(cell.rationale).toContain("mostly full");
    expect(cell.mediaPaths).toEqual(["u1/2026-08-05/a.png"]);
    expect(cell.foods).toEqual(["Rolled oats", "Coffee"]);
  });

  it("aucune vignette et aucune phrase quand il n'y en a pas", () => {
    const r = aggregateRhythm([{ ...PHOTO, media_path: null, recognized: null }], {
      dates: ["2026-08-05"],
      timeZone: TZ,
    });
    expect(r.days[0].cells.morning?.mediaPaths).toEqual([]);
    expect(r.days[0].cells.morning?.rationale).toBeNull();
  });
});
