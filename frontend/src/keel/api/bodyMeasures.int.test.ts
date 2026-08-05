// L'INDICATEUR PAR DYNAMIQUE — ce que l'élève voit, et ce qu'on refuse de lui
// montrer.
//
// Le test qui porte ce module: « la phrase que l'élève lit et l'instruction que
// le générateur reçoit sortent du même calcul ». Tout le reste en découle — si
// `directionIsWorking` était recopié ici, l'écran pourrait féliciter un élève
// que le serveur traite comme stagnant, et les deux suites resteraient vertes.

import { describe, expect, it } from "vitest";

import {
  axisReading,
  datedMeasures,
  FOCUS_AXES,
  indicatorFor,
  latest,
  MAINTENANCE_BAND_KG,
  readIndicator,
  readMeasureInput,
  type ReviewRow,
  targetValueOf,
  weeksInsideBand,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
} from "./bodyMeasures";
import {
  WAIST_CM_MAX as FORM_WAIST_MAX,
  WAIST_CM_MIN as FORM_WAIST_MIN,
  WEIGHT_KG_MAX as FORM_WEIGHT_MAX,
  WEIGHT_KG_MIN as FORM_WEIGHT_MIN,
} from "./weeklyCheckIn";
import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

function review(week: string, bio: Record<string, unknown>, out: Record<string, unknown> = {}): ReviewRow {
  return { week_start_date: week, biofeedback: bio, outcomes: out };
}

describe("l'indicateur de chaque dynamique", () => {
  it("CHAQUE objectif du vocabulaire en a un — aucun n'est laissé sans réponse", () => {
    // Dérivé de `GOAL_TOKENS`: un septième objectif fera tomber ce test avant
    // qu'un élève arrive sur un écran qui ne sait pas quoi lui mesurer.
    for (const goal of GOAL_TOKENS) {
      expect(() => indicatorFor(goal), goal).not.toThrow();
      expect(indicatorFor(goal).reading.length, goal).toBeGreaterThan(0);
    }
  });

  it("la mesure de confirmation n'est jamais la mesure principale", () => {
    for (const goal of GOAL_TOKENS) {
      const i = indicatorFor(goal);
      if (i.primary !== null) expect(i.secondary, goal).not.toBe(i.primary);
    }
  });

  it("recomposition ne propose PAS de cible de poids — elle la contredirait", () => {
    // La signature de cet objectif est « le poids ne bouge pas ». Une cible de
    // poids y serait une cible contre sa propre direction.
    const i = indicatorFor("recomposition");
    expect(i.primary).toBe("waist");
    expect(i.target).toBe("waist");
  });

  it("performance et health ne proposent AUCUNE cible chiffrée", () => {
    for (const goal of ["performance", "health"] as const) {
      expect(indicatorFor(goal).target, goal).toBeNull();
      expect(indicatorFor(goal).primary, goal).toBeNull();
    }
  });

  it("fat_loss et muscle_gain visent le poids, en sens opposés", () => {
    expect(indicatorFor("fat_loss").target).toBe("weight");
    expect(indicatorFor("muscle_gain").target).toBe("weight");
    expect(indicatorFor("maintenance").target).toBe("band");
  });
});

describe("lire les mesures là où elles vivent vraiment", () => {
  it("lit `biofeedback`, et retombe sur `outcomes` pour le poids du chemin 1:1", () => {
    const rows = [
      review("2026-07-06", {}, { weight_7d_avg: 80 }),
      review("2026-07-13", { weight_kg: 79.2 }),
    ];
    expect(datedMeasures(rows, "weight").map((m) => m.value)).toEqual([80, 79.2]);
  });

  it("rend les mesures DATÉES et triées, même si la base les rend en désordre", () => {
    const rows = [review("2026-07-20", { waist_cm: 88 }), review("2026-07-06", { waist_cm: 92 })];
    expect(datedMeasures(rows, "waist")).toEqual([
      { weekStart: "2026-07-06", value: 92 },
      { weekStart: "2026-07-20", value: 88 },
    ]);
  });

  it("écarte une valeur aberrante déjà écrite en base", () => {
    // 780 kg est une faute de frappe. La garder ferait une « tendance » et donc
    // une phrase fausse dite avec aplomb.
    const rows = [review("2026-07-06", { weight_kg: 78 }), review("2026-07-13", { weight_kg: 780 })];
    expect(datedMeasures(rows, "weight").map((m) => m.value)).toEqual([78]);
  });

  it("aucune mesure: une liste vide, jamais un zéro", () => {
    expect(datedMeasures([review("2026-07-06", {})], "weight")).toEqual([]);
    expect(latest([])).toBeNull();
  });

  it("les bornes SONT celles du formulaire du dimanche", () => {
    // Deux écrans qui écrivent la même colonne avec deux tolérances: l'un
    // accepterait ce que l'autre refuse, sur la même donnée.
    expect([WEIGHT_KG_MIN, WEIGHT_KG_MAX]).toEqual([FORM_WEIGHT_MIN, FORM_WEIGHT_MAX]);
    expect([WAIST_CM_MIN, WAIST_CM_MAX]).toEqual([FORM_WAIST_MIN, FORM_WAIST_MAX]);
  });
});

describe("la lecture rendue à l'élève", () => {
  const w = (week: string, value: number) => ({ weekStart: week, value });

  it("UNE seule pesée ne produit aucune phrase de tendance", () => {
    const r = readIndicator({ goal: "fat_loss", weights: [w("2026-07-06", 80)], waists: [] });
    expect(r.weightTrend).toBe("unknown");
    expect(r.sentence).toBeNull();
    // Mais la mesure elle-même est rendue: elle a une date, elle s'affiche.
    expect(r.weight).toEqual({ weekStart: "2026-07-06", value: 80 });
  });

  it("muscle_gain: un poids qui MONTE est la victoire", () => {
    // C'est le cas que l'absence du sixième objectif rendait illisible: sous
    // `performance`, ce même élève lisait que ses mesures ne disaient rien.
    const r = readIndicator({
      goal: "muscle_gain",
      weights: [w("2026-07-06", 72), w("2026-07-20", 74)],
      waists: [],
    });
    expect(r.working).toBe(true);
    expect(r.sentence).toContain("what this goal is asking for");

    const asPerformance = readIndicator({
      goal: "performance",
      weights: [w("2026-07-06", 72), w("2026-07-20", 74)],
      waists: [],
    });
    expect(asPerformance.working).toBe(false);
  });

  it("recomposition: c'est la TAILLE qui porte, un poids stable seul ne suffit pas", () => {
    const waistOnly = readIndicator({
      goal: "recomposition",
      weights: [w("2026-07-06", 74), w("2026-07-20", 74)],
      waists: [w("2026-07-06", 92), w("2026-07-20", 88)],
    });
    expect(waistOnly.working).toBe(true);

    const noWaist = readIndicator({
      goal: "recomposition",
      weights: [w("2026-07-06", 74), w("2026-07-20", 74)],
      waists: [],
    });
    expect(noWaist.working).toBe(false);
  });

  it("une direction qui ne se produit pas ne produit AUCUN reproche", () => {
    // « Personne ne note » vaut ici aussi: on constate la mesure, on n'ajoute
    // rien. Le contre-factuel de la phrase de félicitation.
    const r = readIndicator({
      goal: "fat_loss",
      weights: [w("2026-07-06", 78), w("2026-07-20", 81)],
      waists: [],
    });
    expect(r.working).toBe(false);
    expect(r.sentence).toBe("Your weight is rising.");
  });

  it("le bruit n'est pas une tendance", () => {
    // 800 g d'écart sur une balance de salle de bain n'est pas une direction.
    const r = readIndicator({
      goal: "fat_loss",
      weights: [w("2026-07-06", 80), w("2026-07-20", 79.3)],
      waists: [],
    });
    expect(r.weightTrend).toBe("stable");
    expect(r.working).toBe(false);
  });

  it("maintenance: la bande, et son état vide", () => {
    const inside = readIndicator({
      goal: "maintenance",
      weights: [w("2026-07-20", 74)],
      waists: [],
      targetWeightKg: 75,
    });
    expect(inside.insideBand).toBe(true);

    const outside = readIndicator({
      goal: "maintenance",
      weights: [w("2026-07-20", 75 + MAINTENANCE_BAND_KG + 0.5)],
      waists: [],
      targetWeightKg: 75,
    });
    expect(outside.insideBand).toBe(false);

    // Sans référence, on ne PRÉTEND pas savoir s'il dérive.
    const noRef = readIndicator({ goal: "maintenance", weights: [w("2026-07-20", 74)], waists: [] });
    expect(noRef.insideBand).toBeNull();
  });

  it("un objectif sans indicateur ne fabrique pas de verdict", () => {
    const r = readIndicator({
      goal: "health",
      weights: [w("2026-07-06", 80), w("2026-07-20", 78)],
      waists: [],
    });
    // La mesure reste visible — l'élève l'a saisie, on la lui rend…
    expect(r.weight?.value).toBe(78);
    // …mais `health` ne se juge pas au poids: la direction n'est pas « ce que
    // cet objectif demande », elle est seulement constatée.
    expect(r.working).toBe(false);
    expect(r.sentence).not.toContain("asking for");
  });
});

describe("la saisie", () => {
  it("vide = non renseigné, jamais zéro", () => {
    expect(readMeasureInput("", WEIGHT_KG_MIN, WEIGHT_KG_MAX, "Weight")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("accepte la virgule décimale et arrondit au dixième", () => {
    expect(readMeasureInput("78,35", WEIGHT_KG_MIN, WEIGHT_KG_MAX, "Weight")).toEqual({
      ok: true,
      value: 78.4,
    });
  });

  it("refuse hors bornes et non-numérique, en le DISANT", () => {
    const tooLow = readMeasureInput("3", WEIGHT_KG_MIN, WEIGHT_KG_MAX, "Weight");
    expect(tooLow.ok).toBe(false);
    expect(tooLow.ok === false && tooLow.message).toContain("25");

    expect(readMeasureInput("abc", WEIGHT_KG_MIN, WEIGHT_KG_MAX, "Weight").ok).toBe(false);
  });
});

describe("l'objectif quand ce n'est pas un chiffre", () => {
  it("l'axe et la cible chiffrée sont EXCLUSIFS, pour les six", () => {
    // Un élève qui vise un poids ET un axe se donne deux objectifs, et la
    // semaine générée ne peut pas servir les deux en priorité. L'invariant est
    // aussi une ceinture SQL (`student_goals_focus_axis_goal_check`).
    for (const goal of GOAL_TOKENS) {
      const i = indicatorFor(goal);
      expect(i.axisObjective, goal).toBe(i.target === null);
    }
  });

  it("les six axes sont ceux du point du dimanche", () => {
    // Un axe que cet écran proposerait sans que le formulaire le collecte
    // serait un objectif qu'on ne peut jamais mesurer.
    expect([...FOCUS_AXES].sort()).toEqual(
      ["digestion", "energy", "hunger", "mood", "sleep", "training"],
    );
  });

  it("deux crans pour bouger — un seul est du bruit du dimanche soir", () => {
    const rows = (vals: number[]) =>
      vals.map((v, i) => review(`2026-07-0${i + 1}`, { sleep: v }));
    expect(axisReading(rows([2, 3]), "sleep").trend).toBe("stable");
    expect(axisReading(rows([2, 4]), "sleep").trend).toBe("rising");
    expect(axisReading(rows([2, 4]), "sleep").improving).toBe(true);
    expect(axisReading(rows([4, 2]), "sleep").improving).toBe(false);
  });

  it("un axe jamais rempli ne fabrique pas de lecture", () => {
    const r = axisReading([review("2026-07-06", { weight_kg: 78 })], "sleep");
    expect(r.latest).toBeNull();
    expect(r.trend).toBe("unknown");
    expect(r.improving).toBe(false);
  });

  it("une note hors échelle est écartée, pas ramenée au bord", () => {
    const r = axisReading(
      [review("2026-07-06", { mood: 4 }), review("2026-07-13", { mood: 9 })],
      "mood",
    );
    expect(r.latest?.value).toBe(4);
  });
});

describe("tenir sa fourchette, en semaines", () => {
  const w = (week: string, value: number) => ({ weekStart: week, value });

  it("compte les semaines CONSÉCUTIVES, à rebours depuis la dernière", () => {
    // Un total cumulé survivrait à un mois de dérive et flatterait l'élève.
    const weights = [w("2026-07-06", 75), w("2026-07-13", 80), w("2026-07-20", 74.5), w("2026-07-27", 76)];
    expect(weeksInsideBand(weights, 75)).toBe(2);
  });

  it("une semaine dehors remet à zéro, sans commentaire", () => {
    expect(weeksInsideBand([w("2026-07-06", 75), w("2026-07-13", 79)], 75)).toBe(0);
  });

  it("sans référence, on ne compte rien", () => {
    expect(weeksInsideBand([w("2026-07-06", 75)], null)).toBe(0);
    expect(weeksInsideBand([], 75)).toBe(0);
  });
});

describe("la cible saisie — RÉGRESSION: un champ vide n'est pas zéro", () => {
  it("champ vide => AUCUNE cible, pas une cible de 0", () => {
    // LE BUG, EN UNE LIGNE. `Number("")` vaut 0 et `Number.isFinite(0)` vaut
    // true, donc l'écran prenait un champ jamais rempli pour une référence de
    // zéro kilo — et annonçait à un élève de 73 kg qu'il était « sorti de sa
    // fourchette », qui était en effet centrée sur 0.
    expect(targetValueOf("", "band")).toBeNull();
    expect(targetValueOf("   ", "weight")).toBeNull();
    expect(targetValueOf("", "waist")).toBeNull();
  });

  it("le verdict de fourchette DISPARAÎT quand il n'y a pas de fourchette", () => {
    // Le bout en bout du défaut: la valeur rendue par le parseur entre telle
    // quelle dans la lecture, et `insideBand` doit valoir `null` — l'écran
    // n'affiche alors aucune des deux phrases de verdict.
    const r = readIndicator({
      goal: "maintenance",
      weights: [{ weekStart: "2026-08-03", value: 73 }],
      waists: [],
      targetWeightKg: targetValueOf("", "band"),
    });
    expect(r.insideBand).toBeNull();
    expect(weeksInsideBand([{ weekStart: "2026-08-03", value: 73 }], targetValueOf("", "band")))
      .toBe(0);
  });

  it("une saisie illisible ou hors bornes ne vaut pas zéro non plus", () => {
    expect(targetValueOf("abc", "weight")).toBeNull();
    expect(targetValueOf("0", "weight")).toBeNull();
    expect(targetValueOf("900", "weight")).toBeNull();
  });

  it("une cible valide passe, virgule comprise, et sur les bonnes bornes", () => {
    expect(targetValueOf("74,5", "band")).toBe(74.5);
    expect(targetValueOf("88", "waist")).toBe(88);
    // 88 est un poids plausible ET un tour de taille plausible; 40 n'est un
    // poids plausible que parce que les bornes du poids sont plus basses.
    expect(targetValueOf("40", "weight")).toBe(40);
    expect(targetValueOf("20", "waist")).toBeNull();
  });

  it("sans cible possible (performance, health), il n'y a rien à lire", () => {
    expect(targetValueOf("75", null)).toBeNull();
  });
});
