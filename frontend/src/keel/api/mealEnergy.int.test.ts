import { describe, expect, it } from "vitest";

import {
  attachEatingOutAdvice,
  dayEnergySubjectClause,
  finiteEnergyNumber,
  readBox,
  readBoxes,
  readDay,
  readDish,
  readTarget,
} from "./mealEnergy";

// L4-B — L'ABSENCE D'UN CHIFFRE N'EST PAS LE CHIFFRE ZÉRO.
//
// ── LE DÉFAUT, MESURÉ EN SESSION RÉELLE LE 2026-08-18 ──────────────────────
// `meal-energy-v1` rendait, pour une personne SANS PESÉE:
//
//     "target": { "low": null, "high": null, "basis": "weight_range",
//                 "gap": "no_weight", "weight_week_start": null }
//
// c'est-à-dire l'abstention exacte que la chaîne de gardes avait décidée. Et
// `/app/today` affichait, à 320 px comme à 1280 px, en anglais comme en
// français:
//
//     « Autour de 0–0 par jour pour ton poids »
//     « À peu près ce qu'un corps de ta taille dépense en une journée. »
//
// La cause tient en une identité de JavaScript: `Number(null) === 0`, et
// `Number.isFinite(0) === true`. Le garde tout-ou-rien du parseur était écrit
// `Number.isFinite(Number(x))`, donc il validait deux `null` et rendait deux
// zéros.
//
// ── POURQUOI CE BANC EXISTE, ET POURQUOI IL PORTE LA VALEUR RENDUE ─────────
// C'est le seul chiffre du produit qui parle du CORPS et non de la nourriture
// — le niveau C, celui qui ressemble le plus à un tracker. Il était FABRIQUÉ
// par l'écran pour quelqu'un dont le serveur s'était tu, et il EFFAÇAIT la
// copie qui dit comment réparer (`meals.energy.target_no_weight`): le motif
// `no_weight` voyageait, et plus personne ne l'atteignait.
//
// Le banc n'éprouve donc pas le garde, il éprouve CE QUI SORT: `low`, `high`,
// `kcal`. Un test qui n'aurait vérifié que « le garde existe » serait resté
// vert pendant tout le temps où le garde laissait passer deux zéros.

describe("finiteEnergyNumber — les trois formes de « pas de chiffre »", () => {
  it("`null` ne devient PAS zéro", () => {
    // La ligne du défaut: `Number.isFinite(Number(null))` est VRAI.
    expect(Number.isFinite(Number(null))).toBe(true); // la cause, épinglée
    expect(finiteEnergyNumber(null)).toBeNull();
  });

  it("`undefined` et la chaîne vide non plus", () => {
    expect(finiteEnergyNumber(undefined)).toBeNull();
    // `Number("")` vaut zéro lui aussi — même piège, autre forme.
    expect(Number.isFinite(Number(""))).toBe(true);
    expect(finiteEnergyNumber("")).toBeNull();
  });

  it("LE CAS QUI PASSE: un vrai chiffre traverse, zéro compris", () => {
    // Sans cette ligne, une fonction qui rendrait toujours `null` serait
    // indiscernable de celle-ci — et elle effacerait TOUS les chiffres du
    // produit sans qu'un test rougisse.
    expect(finiteEnergyNumber(204)).toBe(204);
    expect(finiteEnergyNumber("115")).toBe(115);
    // Un zéro EXPLICITEMENT envoyé par le serveur reste un zéro: c'est une
    // valeur, pas une absence. La distinction est tout l'objet de ce module.
    expect(finiteEnergyNumber(0)).toBe(0);
  });

  it("un texte qui n'est pas un nombre s'abstient", () => {
    expect(finiteEnergyNumber("beaucoup")).toBeNull();
    expect(finiteEnergyNumber(Number.NaN)).toBeNull();
    expect(finiteEnergyNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("readTarget — la fourchette de maintenance (niveau C)", () => {
  it("l'abstention du serveur reste une abstention à l'écran", () => {
    // LA RÉPONSE EXACTE mesurée le 2026-08-18, recopiée telle qu'elle est
    // passée sur le fil.
    const target = readTarget({
      low: null,
      high: null,
      basis: "weight_range",
      gap: "no_weight",
      weight_week_start: null,
    });
    expect(target).not.toBeNull();
    // ⛔ CE QUI S'AFFICHAIT: 0 et 0.
    expect(target!.low).toBeNull();
    expect(target!.high).toBeNull();
    // Et le motif SURVIT: c'est lui qui déclenche « ajoute une pesée ». Sans
    // lui, l'écran ne dit rien du tout, ce qui se lit comme une panne.
    expect(target!.gap).toBe("no_weight");
  });

  it("une borne seule ne devient PAS un point", () => {
    // Un point est la forme qu'on refuse: personne ne rate un intervalle.
    expect(readTarget({ low: 2100, high: null, gap: null })!.low).toBeNull();
    expect(readTarget({ low: null, high: 2600, gap: null })!.high).toBeNull();
  });

  it("LE CAS QUI PASSE: une vraie fourchette traverse entière", () => {
    const target = readTarget({
      low: 2100,
      high: 2500,
      basis: "weight_range",
      gap: null,
      weight_week_start: "2026-08-10",
    });
    expect(target).toEqual({
      low: 2100,
      high: 2500,
      basis: "weight_range",
      gap: null,
      weightWeekStart: "2026-08-10",
      // ⟳ LOT 4 — UNE MAINTENANCE N'A PAS DE DIRECTION, et elle n'a rien à
      // expliquer non plus: `directionGap` ne sert qu'à dire pourquoi une
      // direction QUI EXISTE n'a pas été suivie.
      direction: null,
      directionGap: null,
    });
  });

  it("porte ⑤ fermée: le serveur n'envoie aucune cible, et rien n'est inventé", () => {
    expect(readTarget(null)).toBeNull();
    expect(readTarget(undefined)).toBeNull();
  });

  // ── ⟳ LOT 4 (2026-09-01) · LA FOURCHETTE QUI A SUIVI LA DIRECTION ───────

  it("LE CAS QUI PASSE: une fourchette décalée traverse avec sa direction", () => {
    const target = readTarget({
      low: 2100,
      high: 2550,
      basis: "weight_range_with_direction",
      gap: null,
      direction: "down",
      direction_gap: null,
      weight_week_start: "2026-08-10",
    });
    expect(target!.direction).toBe("down");
    expect(target!.basis).toBe("weight_range_with_direction");
    expect(target!.low).toBe(2100);
  });

  it("une direction SANS sa base ne survit pas — l'énoncé serait faux", () => {
    // ⛔ LE DÉFAUT EXACT QU'ON FERME: « Autour de 2 600–3 050 par jour pour
    // perdre à ton rythme » posé sur des nombres D'ENTRETIEN qui n'ont pas
    // bougé. C'est le défaut d'origine avec une étiquette qui le rend
    // indétectable — pire que le défaut d'origine.
    const target = readTarget({
      low: 2600,
      high: 3050,
      basis: "weight_range",
      gap: null,
      direction: "down",
      weight_week_start: "2026-08-10",
    });
    expect(target!.direction).toBeNull();
  });

  it("un jeton de direction inconnu retombe sur la maintenance", () => {
    // Sans ce filtre, la clé de copie serait construite sur un jeton libre et
    // la phrase sortirait vide — ou avec « undefined » dedans.
    const target = readTarget({
      low: 2100,
      high: 2550,
      basis: "weight_range_with_direction",
      gap: null,
      direction: "sideways",
    });
    expect(target!.direction).toBeNull();
  });

  it("une direction annoncée SANS fourchette ne survit pas", () => {
    // Promettre « pour perdre à ton rythme » au-dessus d'un `no_weight`
    // annoncerait une fourchette adaptée là où il n'y a aucun nombre.
    const target = readTarget({
      low: null,
      high: null,
      basis: "weight_range_with_direction",
      gap: "no_weight",
      direction: "down",
    });
    expect(target!.direction).toBeNull();
    expect(target!.gap).toBe("no_weight");
  });

  it("le motif de non-application voyage même quand la direction ne s'applique pas", () => {
    // Il voyage pour être COMPTÉ (§10 de la fiche), jamais pour être dit: la
    // copie ne le rend nulle part, exprès.
    const target = readTarget({
      low: 2100,
      high: 2500,
      basis: "weight_range",
      gap: null,
      direction: null,
      direction_gap: "below_energy_floor",
    });
    expect(target!.direction).toBeNull();
    expect(target!.directionGap).toBe("below_energy_floor");
  });
});

describe("readDay — le total d'un jour", () => {
  it("un jour dont AUCUN plat n'est lisible ne vaut pas « 0 kcal »", () => {
    // `plan_energy.ts` laisse `kcal` à `null` exprès sur ce cas, et
    // `DayEnergyLine` teste `kcal === null` pour rendre « journée illisible ».
    // Le parseur rendait `0`, donc ce garde-là ne se déclenchait JAMAIS et
    // l'écran disait « 0 kcal » — le sens exactement inverse.
    const day = readDay({
      day: "tue",
      kcal: null,
      basis: "plan_quantities",
      complete: false,
      dishes_counted: 0,
      dishes_total: 4,
      addon_kcal: 0,
    });
    expect(day.kcal).toBeNull();
    expect(day.dishesTotal).toBe(4);
  });

  it("LE CAS QUI PASSE: un total réel traverse", () => {
    const day = readDay({ day: "tue", kcal: 204, complete: false, dishes_counted: 3, dishes_total: 9 });
    expect(day.kcal).toBe(204);
    expect(day.dishesCounted).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ② — LE SUJET DU NOMBRE, ET LE PIÈGE DU ZÉRO QU'ON NE REJOUE PAS
// ---------------------------------------------------------------------------

describe("readDay — de quoi ce nombre parle", () => {
  const OUT_DAY = {
    day: "tue",
    kcal: 1400,
    basis: "plan_quantities",
    complete: true,
    dishes_counted: 2,
    dishes_total: 2,
    addon_kcal: 0,
    meals_out: 1,
    subject: "what_the_plan_made",
  };

  it("LE CAS QUI PASSE: le sujet restreint traverse avec son compte", () => {
    // Sans ce cas, une garde qui refuserait TOUT laisserait le banc vert et
    // l'écran continuerait d'annoncer « ta journée » sur deux repas sur trois.
    const day = readDay(OUT_DAY);
    expect(day.subject).toBe("what_the_plan_made");
    expect(day.mealsOut).toBe(1);
    expect(day.kcal).toBe(1400);
  });

  it("le cas NOMINAL reste `the_day`, et son compte est zéro", () => {
    const day = readDay({ ...OUT_DAY, meals_out: 0, subject: "the_day" });
    expect(day.subject).toBe("the_day");
    expect(day.mealsOut).toBe(0);
  });

  it("⚠️ un plan d'AVANT la trace se lit comme hier, pas comme une journée tronquée", () => {
    // Les deux clés absentes du fil. Le repli doit être EXACTEMENT le
    // comportement d'avant ce champ — sinon un plan composé la semaine dernière
    // se mettrait à parler d'une restriction que personne n'a déclarée.
    const day = readDay({
      day: "tue",
      kcal: 1400,
      complete: true,
      dishes_counted: 2,
      dishes_total: 2,
    });
    expect(day.subject).toBe("the_day");
    expect(day.mealsOut).toBe(0);
  });

  it("⛔ LE PIÈGE DU 0–0, DANS SA FORME SYMÉTRIQUE: un sujet sans son compte", () => {
    // Le 2026-08-18, `Number(null) === 0` a fabriqué « Autour de 0–0 par jour »
    // et EFFACÉ la phrase qui invitait à ajouter une pesée. Ici la forme
    // dégradée serait « sur les 2 repas que j'ai composés (0 repas dehors) » —
    // une phrase qui restreint le sujet du nombre en avouant qu'il n'y a aucune
    // raison de le restreindre, et qui remplacerait « sur la journée », lequel
    // était vrai.
    for (
      const broken of [
        { ...OUT_DAY, meals_out: null },
        { ...OUT_DAY, meals_out: undefined },
        { ...OUT_DAY, meals_out: "" },
        { ...OUT_DAY, meals_out: 0 },
        { ...OUT_DAY, meals_out: -2 },
      ]
    ) {
      const day = readDay(broken);
      expect(day.subject).toBe("the_day");
      expect(day.mealsOut).toBe(0);
    }
  });

  it("un jour où le plan n'a composé AUCUN repas n'a pas de sujet à restreindre", () => {
    // « sur les 0 repas que j'ai composés » n'est pas un sujet, c'est une
    // journée vide — et `day_unreadable` le dit déjà mieux.
    const day = readDay({ ...OUT_DAY, dishes_total: 0, kcal: null });
    expect(day.subject).toBe("the_day");
    expect(day.mealsOut).toBe(0);
  });

  it("un jeton de sujet INCONNU retombe sur le comportement d'hier", () => {
    for (const token of ["the_week", "", "WHAT_THE_PLAN_MADE", 42, null]) {
      const day = readDay({ ...OUT_DAY, subject: token });
      expect(day.subject).toBe("the_day");
      expect(day.mealsOut).toBe(0);
    }
  });

  it("le compte est un ENTIER: un fil bavard ne rend pas « 1,4 repas dehors »", () => {
    expect(readDay({ ...OUT_DAY, meals_out: 1.4 }).mealsOut).toBe(1);
    expect(readDay({ ...OUT_DAY, meals_out: "3" }).mealsOut).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ① — LE CONSEIL DU MIDI, LU SANS RIEN RÉPARER
// ---------------------------------------------------------------------------

describe("attachEatingOutAdvice — l'ordre de grandeur d'une case « dehors »", () => {
  const days = [
    readDay({ day: "mon", kcal: 1400, complete: true, dishes_total: 2, dishes_counted: 2 }),
    readDay({ day: "tue", kcal: 1900, complete: true, dishes_total: 3, dishes_counted: 3 }),
  ];

  it("LE CAS QUI PASSE: le conseil se range sur SON jour, et sur lui seul", () => {
    const out = attachEatingOutAdvice(days, [
      { day: "mon", slot: "lunch", kcal: 700 },
    ]);
    expect(out[0].eatingOutAdvice).toEqual([{ slot: "lunch", kcal: 700 }]);
    // ⚠️ ET PAS SUR L'AUTRE JOUR. Lire les deux tableaux par index servirait à
    // quelqu'un l'ordre de grandeur d'un autre midi — les deux ne sont pas
    // alignés: un jour peut n'avoir aucun conseil.
    expect(out[1].eatingOutAdvice).toEqual([]);
  });

  it("plusieurs cases du même jour tiennent ensemble", () => {
    const out = attachEatingOutAdvice(days, [
      { day: "tue", slot: "lunch", kcal: 700 },
      { day: "tue", slot: "dinner", kcal: 900 },
    ]);
    expect(out[1].eatingOutAdvice).toEqual([
      { slot: "lunch", kcal: 700 },
      { slot: "dinner", kcal: 900 },
    ]);
  });

  it("⛔ UN MOMENT HORS VOCABULAIRE TOMBE, il n'est jamais rendu brut", () => {
    // Sinon `EATING_OUT_SLOT_LABELS[slot]` vaut `undefined` et la phrase sort
    // avec « undefined » dedans, sous les yeux de quelqu'un.
    for (const slot of ["brunch", "", "LUNCH", null, 3]) {
      const out = attachEatingOutAdvice(days, [{ day: "mon", slot, kcal: 700 }]);
      expect(out[0].eatingOutAdvice).toEqual([]);
    }
  });

  it("⛔ « VISE AUTOUR DE 0 » N'EXISTE PAS: `Number(null)` ne devient pas un conseil", () => {
    // Le piège du 0–0, troisième forme. « Au déjeuner, vise autour de 0 » se
    // lirait « ne mange rien » — le sens exactement inverse, et sur la phrase
    // la plus directive du produit.
    for (const kcal of [null, undefined, "", 0, -50]) {
      const out = attachEatingOutAdvice(days, [{ day: "mon", slot: "lunch", kcal }]);
      expect(out[0].eatingOutAdvice).toEqual([]);
    }
  });

  it("un serveur muet laisse les jours intacts", () => {
    for (const raw of [null, undefined, [], "nope", {}]) {
      const out = attachEatingOutAdvice(days, raw);
      expect(out.map((d) => d.eatingOutAdvice)).toEqual([[], []]);
    }
  });
});

describe("dayEnergySubjectClause — le sujet, dans les deux langues", () => {
  it("le pluriel et le singulier sont ÉCRITS, pas interpolés", () => {
    expect(dayEnergySubjectClause("fr", { dishes: 2, mealsOut: 1 })).toBe(
      "sur les 2 repas que j'ai composés (1 repas dehors)",
    );
    expect(dayEnergySubjectClause("fr", { dishes: 1, mealsOut: 2 })).toBe(
      "sur le seul repas que j'ai composé (2 repas dehors)",
    );
    expect(dayEnergySubjectClause("en", { dishes: 2, mealsOut: 1 })).toBe(
      "across the 2 meals I composed (1 meal out)",
    );
    expect(dayEnergySubjectClause("en", { dishes: 1, mealsOut: 2 })).toBe(
      "across the one meal I composed (2 meals out)",
    );
  });

  it("⛔ AUCUN SOLDE, AUCUN VERDICT — dans aucune des deux langues", () => {
    // « Il te reste 680 kcal » est LA phrase d'un tracker. Elle n'existe sur
    // aucun chemin de ce produit, et celui-ci est le plus tentant de tous:
    // c'est le seul endroit où l'écran commente un total incomplet.
    const forbidden = [
      "reste",
      "manque",
      "left",
      "remaining",
      "missing",
      "deficit",
      "déficit",
      "kcal",
      "calorie",
      "objectif",
      "target",
      "goal",
    ];
    for (const locale of ["en", "fr"] as const) {
      for (const dishes of [1, 2, 5]) {
        for (const mealsOut of [1, 3, 6]) {
          const text = dayEnergySubjectClause(locale, { dishes, mealsOut })
            .toLowerCase();
          for (const word of forbidden) {
            expect(text.includes(word)).toBe(false);
          }
        }
      }
    }
  });
});

describe("readDish — le chiffre d'un plat", () => {
  it("un plat sans quantité ne vaut pas « 0 kcal », même déclaré complet", () => {
    // La double écriture de la règle: `complete: false` le couvrait déjà. Ce
    // cas-ci est celui où le serveur se contredirait — et c'est précisément
    // celui où un zéro fabriqué passerait pour un fait.
    expect(readDish({ kcal: null, complete: true, gaps: [] }).kcal).toBeNull();
    expect(readDish({ kcal: 300, complete: false, gaps: ["missing_quantity"] }).kcal)
      .toBeNull();
  });

  it("LE CAS QUI PASSE: un plat compté traverse", () => {
    expect(readDish({ kcal: 115, complete: true, basis: "plan_quantities", gaps: [] }))
      .toEqual({ kcal: 115, basis: "plan_quantities", complete: true, gaps: [] });
  });
});

// ⟳ LOT F (2026-09-04) — LE KCAL D'UN CONTENANT À UN NOM, LU TOUT-OU-RIEN.
describe("readBox — le chiffre d'un contenant à un nom", () => {
  it("lit une boîte complète, arrondie, avec sa base", () => {
    expect(readBox({ box_id: "box_sat_lunch_marc", member_id: "m-marc", kcal: 612.4, basis: "plan_quantities" }))
      .toEqual({ boxId: "box_sat_lunch_marc", memberId: "m-marc", kcal: 612, basis: "plan_quantities" });
  });
  it("⛔ TOUT OU RIEN: sans id, sans bouche ou sans nombre, rien — jamais un zéro", () => {
    // Un kcal qu'on ne saurait pas poser sur un couvercle précis atterrirait
    // sur le mauvais. Et `null` n'est pas 0 (cicatrice `finiteEnergyNumber`).
    expect(readBox({ member_id: "m", kcal: 300 })).toBeNull();
    expect(readBox({ box_id: "b", kcal: 300 })).toBeNull();
    expect(readBox({ box_id: "b", member_id: "m", kcal: null })).toBeNull();
    expect(readBox({ box_id: "b", member_id: "m", kcal: "n/a" })).toBeNull();
    expect(readBox(null)).toBeNull();
  });
  it("readBoxes garde les lignes lisibles et jette les autres, sans décaler", () => {
    const out = readBoxes([
      { box_id: "a", member_id: "m1", kcal: 100 },
      { box_id: "", member_id: "m2", kcal: 200 },
      { box_id: "c", member_id: "m3", kcal: 300 },
    ]);
    expect(out.map((b) => b.boxId)).toEqual(["a", "c"]);
    expect(readBoxes(undefined)).toEqual([]);
  });
});
