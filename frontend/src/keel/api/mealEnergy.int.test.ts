import { describe, expect, it } from "vitest";

import { finiteEnergyNumber, readDay, readDish, readTarget } from "./mealEnergy";

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
    });
  });

  it("porte ⑤ fermée: le serveur n'envoie aucune cible, et rien n'est inventé", () => {
    expect(readTarget(null)).toBeNull();
    expect(readTarget(undefined)).toBeNull();
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
