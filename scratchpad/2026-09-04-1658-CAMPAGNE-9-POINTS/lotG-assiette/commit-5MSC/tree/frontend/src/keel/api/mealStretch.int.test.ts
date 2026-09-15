import { describe, expect, it } from "vitest";
import {
  dishDate,
  isReportable,
  stretchDates,
  stretchDayOrder,
} from "./mealStretch";
import { groupByDay } from "../lib/mealBuilderModel";
import { type GeneratedDish } from "./mealGeneration";

// ===========================================================================
// LA SEMAINE D'UNE COMPOSITION — deux défauts qui n'en faisaient qu'un
//
// Un plat nomme un JOUR (« tue »), jamais une date, et la table ne porte pas de
// `week_start`. Tant que rien ne résolvait ce jeton en date:
//
//  1. LE PLAN S'OUVRAIT SUR DES JOURS QUI PARAISSAIENT RATÉS. Composé un
//     mercredi, il remplit wed→sun puis mon, tue — la semaine SUIVANTE. Le
//     rendu parcourait lundi→dimanche, donc ces deux-là arrivaient en tête.
//  2. ON NE POUVAIT PAS RATTRAPER UNE COCHE. Faute de date, la seule règle sûre
//     était « aujourd'hui seulement », et le déjeuner d'hier restait à jamais
//     non rapportable.
//
// 2026-08-05 est un MERCREDI: c'est le cas qui a produit le rapport.
// ===========================================================================

const WED = "2026-08-05";

function dish(title: string, day: string | null, covers?: string[]): GeneratedDish {
  return {
    title,
    slot: null,
    day,
    ingredients: [],
    method: "",
    why: "",
    batch: covers
      ? { servings_made: 3, covers_days: covers, cook_on: day }
      : null,
  };
}

describe("l'ordre du plan", () => {
  it("part du jour de composition, pas de lundi", () => {
    expect(stretchDayOrder(WED)).toEqual([
      "wed", "thu", "fri", "sat", "sun", "mon", "tue",
    ]);
  });

  // LE RAPPORT, MOT POUR MOT: « il y a toujours les plats pour lundi et mardi ».
  // Ils existent bel et bien — ils sont la semaine prochaine — mais ils
  // s'affichaient AVANT aujourd'hui, ce qui les faisait lire comme du retard.
  it("range lundi et mardi APRÈS aujourd'hui, pas avant", () => {
    const groups = groupByDay(
      [dish("mardi prochain", "tue"), dish("ce soir", "wed"), dish("lundi prochain", "mon")],
      stretchDayOrder(WED),
    );
    expect(groups.map((g) => g.day)).toEqual(["wed", "mon", "tue"]);
  });

  it("garde l'ordre calendaire quand personne ne donne d'ancre", () => {
    // Le défaut de la fonction reste défini: un appelant sans composition ne
    // reçoit pas un ordre au hasard.
    const groups = groupByDay([dish("a", "tue"), dish("b", "mon")]);
    expect(groups.map((g) => g.day)).toEqual(["mon", "tue"]);
  });

  it("laisse les plats sans jour en tête, quel que soit l'ordre", () => {
    const groups = groupByDay(
      [dish("libre", null), dish("mercredi", "wed")],
      stretchDayOrder(WED),
    );
    expect(groups.map((g) => g.day)).toEqual([null, "wed"]);
  });
});

describe("le jour d'un plat a une date", () => {
  it("chaque jeton tombe une fois et une seule sur les sept jours", () => {
    const dates = stretchDates(WED);
    expect(dates.wed).toBe("2026-08-05");
    expect(dates.sun).toBe("2026-08-09");
    // Lundi et mardi sont la semaine SUIVANTE — c'est ce que le moteur a
    // demandé, et c'est ce qui les rend non cochables un mercredi.
    expect(dates.mon).toBe("2026-08-10");
    expect(dates.tue).toBe("2026-08-11");
    expect(Object.keys(dates)).toHaveLength(7);
  });

  it("un plat sans jour se rapporte au jour où on le rapporte", () => {
    expect(dishDate(null, stretchDates(WED), "2026-08-07")).toBe("2026-08-07");
  });
});

describe("ce qui est rapportable", () => {
  const dates = stretchDates(WED);

  // LA DEMANDE: « les plats à venir ne doivent pas être cochables, les plats
  // passés si ».
  it("le passé se rattrape", () => {
    // Vendredi, on coche encore le dîner de mercredi — daté de mercredi.
    expect(isReportable(dates.wed, "2026-08-07")).toBe(true);
    expect(isReportable(dates.thu, "2026-08-07")).toBe(true);
  });

  it("aujourd'hui se coche", () => {
    expect(isReportable(dates.wed, WED)).toBe(true);
  });

  // L'INTERDICTION QUI RESTE, et la seule qui compte: un « j'ai mangé » daté de
  // vendredi, posé mercredi, n'est pas une approximation — c'est une preuve
  // fabriquée, dans la table même qui nourrit la couverture que le coach lit.
  it("le futur ne se coche pas", () => {
    expect(isReportable(dates.fri, WED)).toBe(false);
    expect(isReportable(dates.mon, WED)).toBe(false);
  });

  it("une date inconnue ne se coche pas non plus", () => {
    // Écrire « aujourd'hui » par défaut daterait un fait au hasard.
    expect(isReportable(null, WED)).toBe(false);
  });

  it("la fenêtre de rattrapage est bornée par la composition", () => {
    // Sept jours couverts, donc six jours de retard au maximum. Personne ne
    // remonte à la semaine d'avant par ce chemin.
    const oldest = dates.wed;
    const last = dates.tue;
    expect(isReportable(oldest, last)).toBe(true);
    const dayCount = (Date.parse(last) - Date.parse(oldest)) / 86_400_000;
    expect(dayCount).toBe(6);
  });
});
