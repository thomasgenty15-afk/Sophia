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
  type BodyMeasureRow,
  datedMeasures,
  FOCUS_AXES,
  lastMeasuredOn,
  indicatorFor,
  latest,
  MAINTENANCE_BAND_KG,
  readIndicator,
  readMeasureInput,
  type ReviewRow,
  targetValueOf,
  weeklyMeasures,
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
import {
  GOAL_TOKENS,
  parseGoalToken,
  RETIRED_GOAL_TOKENS,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
// ⚠️ L'ÉCRAN LUI-MÊME, pas une copie de sa liste. C'est tout l'objet du test
// ci-dessous: la seule chose qui distingue « les jetons sont bons » de « les
// fiches proposées sont bonnes » est d'aller chercher ce que l'écran propose.
import { goalOptions } from "../lib/goalOptions";

function review(week: string, bio: Record<string, unknown>, out: Record<string, unknown> = {}): ReviewRow {
  return { week_start_date: week, biofeedback: bio, outcomes: out };
}

function measure(
  localDate: string,
  valueSi: number | string,
  kind: "weight" | "waist" = "weight",
  at = "07:00:00Z",
): BodyMeasureRow {
  return {
    local_date: localDate,
    kind,
    value_si: valueSi,
    measured_at: `${localDate}T${at}`,
  };
}

// ---------------------------------------------------------------------------
// FF-031 — la table datée, et le bilan hebdo en repli
// ---------------------------------------------------------------------------

describe("les mesures viennent de la table datée, le bilan hebdo comble", () => {
  it("une semaine vaut la MOYENNE de ses jours, pas la dernière pesée", () => {
    const rows = weeklyMeasures({
      reviews: [],
      measures: [
        measure("2026-08-03", 98.5),
        measure("2026-08-05", 98.1),
        measure("2026-08-07", 97.9),
      ],
      kind: "weight",
    });
    expect(rows).toEqual([{ weekStart: "2026-08-03", value: 98.2 }]);
  });

  it("la table L'EMPORTE sur le miroir pour une semaine que les deux portent", () => {
    // Le miroir n'a gardé que la dernière pesée; la table les a toutes. Si le
    // repli gagnait, l'écran afficherait un chiffre que la ceinture ne regarde
    // pas.
    const rows = weeklyMeasures({
      reviews: [review("2026-08-03", { weight_kg: 97.9 })],
      measures: [measure("2026-08-03", 98.5), measure("2026-08-07", 97.9)],
      kind: "weight",
    });
    expect(rows).toEqual([{ weekStart: "2026-08-03", value: 98.2 }]);
  });

  it("le miroir COMBLE une semaine antérieure à la reprise", () => {
    const rows = weeklyMeasures({
      reviews: [review("2026-07-20", { weight_kg: 100 })],
      measures: [measure("2026-08-03", 98)],
      kind: "weight",
    });
    expect(rows).toEqual([
      { weekStart: "2026-07-20", value: 100 },
      { weekStart: "2026-08-03", value: 98 },
    ]);
  });

  it("une correction du même jour ne se moyenne pas avec ce qu'elle corrige", () => {
    const rows = weeklyMeasures({
      reviews: [],
      measures: [
        measure("2026-08-05", 87, "weight", "08:00:00Z"),
        measure("2026-08-05", 78, "weight", "08:02:00Z"),
      ],
      kind: "weight",
    });
    expect(rows).toEqual([{ weekStart: "2026-08-03", value: 78 }]);
  });

  it("écarte une valeur aberrante venue de la table, comme celles du miroir", () => {
    const rows = weeklyMeasures({
      reviews: [],
      measures: [measure("2026-08-03", 780)],
      kind: "weight",
    });
    expect(rows).toEqual([]);
  });

  it("une valeur illisible est ÉCARTÉE, elle ne devient pas zéro kilo", () => {
    // `Number("")` vaut 0. Une carte qui afficherait « 0 kg » ou une tendance
    // calculée dessus serait pire qu'une carte vide.
    const rows = weeklyMeasures({
      reviews: [],
      measures: [measure("2026-08-03", ""), measure("2026-08-05", "78.4")],
      kind: "weight",
    });
    expect(rows).toEqual([{ weekStart: "2026-08-03", value: 78.4 }]);
  });

  it("les grandeurs ne se mélangent pas", () => {
    const measures = [measure("2026-08-05", 78), measure("2026-08-05", 84, "waist")];
    expect(weeklyMeasures({ reviews: [], measures, kind: "waist" })).toEqual([
      { weekStart: "2026-08-03", value: 84 },
    ]);
  });

  it("LE JOUR de la dernière pesée, pas le lundi de sa semaine", () => {
    // Le défaut nommé par FF-031: « week of 3 Aug » affiché sous une mesure du
    // vendredi.
    const measures = [measure("2026-08-03", 98.5), measure("2026-08-07", 97.9)];
    expect(lastMeasuredOn(measures, "weight")).toBe("2026-08-07");
    // Sans mesure datée, on ne prétend pas connaître le jour: l'appelant
    // retombe sur le libellé de semaine.
    expect(lastMeasuredOn([], "weight")).toBeNull();
    expect(lastMeasuredOn(measures, "waist")).toBeNull();
  });
});

// ===========================================================================
// LES DIRECTIONS QUE `/app/plan` PROPOSE VRAIMENT
//
// ⚠️ CE BLOC EXISTE PARCE QUE LE RESTE DU FICHIER EST RESTÉ VERT SUR UN ÉCRAN
// CASSÉ. Les tests d'`indicatorFor` itèrent `GOAL_TOKENS`; l'écran, lui,
// itérait SA PROPRE constante locale de six jetons (`GOAL_VALUES`, dont
// `recomposition`, `performance`, `health`). Deux listes, une seule mesurée:
// cliquer une des trois fiches mortes déréférençait `undefined` dans l'
// `onChange`, et l'enregistrement aurait envoyé un jeton que le `CHECK` de
// `student_goals.goal` refuse — sans qu'aucune suite ne bouge.
//
// Le geste qui arme la garde n'est PAS d'itérer `GOAL_TOKENS` une fois de
// plus: c'est d'aller chercher CE QUE L'ÉCRAN PROPOSE (`goalOptions()`) et de
// le confronter à la liste que la base accepte. Remettre une liste locale à
// l'écran fait tomber ce test; ajouter un jeton au socle le laisse passer,
// parce que l'écran suit alors le socle. C'est le sens de « une seule source ».
// ===========================================================================
describe("les directions que l'ÉCRAN propose", () => {
  it("exactement les jetons que la base accepte — ni un de plus, ni un de moins", () => {
    const offered = goalOptions().map((o) => o.value);
    expect(offered).toEqual([...GOAL_TOKENS]);
  });

  it("chaque fiche proposée passe le parseur du socle ET a un indicateur", () => {
    for (const { value } of goalOptions()) {
      // `parseGoalToken` LÈVE sur un jeton inconnu: c'est la même porte que le
      // `CHECK` de la colonne, donc « proposé à l'écran » ⇒ « écrivable ».
      expect(() => parseGoalToken(value), value).not.toThrow();
      // `indicatorFor` est un `switch` SANS `default`: un jeton en trop en
      // sort `undefined`, et c'est très exactement ce que l'`onChange` de la
      // fiche déréférençait.
      expect(indicatorFor(value), value).toBeDefined();
      expect(indicatorFor(value).reading.length, value).toBeGreaterThan(0);
    }
  });

  it("aucune des dynamiques RETIRÉES le 2026-08-18 n'est encore offerte", () => {
    const offered = goalOptions().map((o) => o.value as string);
    for (const retired of Object.keys(RETIRED_GOAL_TOKENS)) {
      expect(offered, retired).not.toContain(retired);
    }
  });
});

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

  it("maintenance vise une BANDE, jamais un point — le repli du 2026-08-18", () => {
    // ⚠️ CE TEST A CHANGÉ DE SUJET. Il gardait `recomposition` (« cible = tour
    // de taille, parce que le poids ne bouge pas »). Les quatre nuances du
    // « ni l'un ni l'autre » se replient sur `maintenance`, et la lecture juste
    // de la troisième position est le POIDS — c'est sur la balance qu'on voit
    // qu'elle ne bouge pas. Mais une BANDE, pas un point: viser un poids exact
    // dans une dynamique dont la signature est l'immobilité serait se donner
    // une cible qui contredit sa propre direction.
    const i = indicatorFor("maintenance");
    expect(i.primary).toBe("weight");
    expect(i.target).toBe("band");
    expect(i.axisObjective).toBe(false);
  });

  it("⚠️ plus AUCUNE dynamique ne renvoie vers l'axe du dimanche", () => {
    // ⚠️ CE TEST A ÉTÉ RENVERSÉ LE 2026-08-18, ET C'EST UNE PERTE ASSUMÉE.
    // Il gardait `performance` et `health`, qui ne proposaient aucune cible
    // chiffrée et renvoyaient vers l'axe du point du dimanche
    // (`axisObjective: true`). Les deux se replient sur `maintenance`, qui vise
    // une bande de poids — donc le drapeau n'est plus levé par personne.
    //
    // Ce qui reste vrai, et que l'invariant d'exclusivité juste en dessous
    // continue de tenir: axe et cible chiffrée ne coexistent jamais. Ce qui
    // n'est PLUS vrai: qu'une dynamique puisse choisir l'axe. `focus_axis`
    // reste écrivable en base (son CHECK a suivi le repli et vise
    // `maintenance`); c'est l'ÉCRAN des mesures qui ne l'annonce plus, et le
    // rebrancher est un lot d'écran, pas un lot de socle.
    for (const goal of GOAL_TOKENS) {
      expect(indicatorFor(goal).axisObjective, goal).toBe(false);
      expect(indicatorFor(goal).target, goal).not.toBeNull();
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

    // ⚠️ LE CONTRE-FACTUEL A CHANGÉ DE JETON. Il posait `performance`, qui
    // rendait `false` sur les mêmes mesures — c'était le défaut que
    // `muscle_gain` a fermé en 2026-08-05. `performance` n'existe plus; le
    // contre-factuel qui reste est `maintenance`, pour qui un poids qui MONTE
    // n'est pas une victoire mais une dérive.
    const asMaintenance = readIndicator({
      goal: "maintenance",
      weights: [w("2026-07-06", 72), w("2026-07-20", 74)],
      waists: [],
    });
    expect(asMaintenance.working).toBe(false);
  });

  it("maintenance: c'est le POIDS STABLE qui porte — le repli du 2026-08-18", () => {
    // ⚠️ CE TEST GARDAIT `recomposition`, la seule dynamique dont la lecture
    // passait par le TOUR DE TAILLE (« la taille descend pendant que le poids
    // ne descend pas »). Elle se replie sur `maintenance`, dont la signature
    // est le poids stable — la taille n'y entre plus.
    //
    // Ce qui rattrape en partie: `fat_loss` lit toujours une taille qui
    // descend (test plus haut), donc celui qui poursuit sa silhouette et
    // accepte que la balance descende un peu coche « perdre du poids ».
    const stable = readIndicator({
      goal: "maintenance",
      weights: [w("2026-07-06", 74), w("2026-07-20", 74)],
      waists: [w("2026-07-06", 92), w("2026-07-20", 88)],
    });
    expect(stable.working).toBe(true);

    // Et sans poids du tout, on ne dit rien: une taille seule ne prouve pas
    // qu'une balance ne bouge pas.
    const noWeight = readIndicator({
      goal: "maintenance",
      weights: [],
      waists: [w("2026-07-06", 92), w("2026-07-20", 88)],
    });
    expect(noWeight.working).toBe(false);
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

  it("une direction qui ne se produit PAS ne fabrique pas de verdict", () => {
    // ⚠️ CE TEST POSAIT `health`, qui n'avait aucun indicateur. Après le repli
    // du 2026-08-18, les trois objectifs en ont un — donc le cas « objectif
    // sans indicateur » n'existe plus. Ce qui reste, et qui est la propriété
    // qu'il gardait vraiment: une mesure qui ne va pas dans le sens de
    // l'objectif est CONSTATÉE, jamais reprochée.
    const r = readIndicator({
      goal: "maintenance",
      weights: [w("2026-07-06", 80), w("2026-07-20", 76)],
      waists: [],
    });
    // La mesure reste visible — l'élève l'a saisie, on la lui rend…
    expect(r.weight?.value).toBe(76);
    // …mais un poids qui descend n'est pas « ce que maintenir demande ».
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
