// LOT 2 — L'ANCRAGE ABSOLU. Ce que ces tests protègent, dans l'ordre de ce que
// ça coûte quand ça casse:
//
//   * ANCRER SUR UNE JOURNÉE INCOMPLÈTE — le livré est sous-estimé, donc le
//     facteur trop grand, donc on sert DAVANTAGE parce qu'on a moins su lire.
//     La direction de l'erreur n'est pas neutre: elle nourrit trop;
//   * LE PLANCHER TCA DESSERRÉ — ① doit gagner contre tout, mineur et doctrine
//     compris, dans les deux passes de la chaîne;
//   * L'ÉCART OUVERT SOUS UN COACH QUI NE COMPTE PAS — ②③ ferment la cible
//     d'écart en entier, et seulement elle;
//   * LE RÉSIDU PERDU — `raw` est l'entrée du LOT 3; sans lui l'aval est un
//     habillage.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ANCHOR_FACTOR_MAX,
  MEAL_MAX_GRAMS_PER_KG,
  ANCHOR_FACTOR_MIN,
  ANCHOR_REASONS,
  type AnchorMouth,
  COMPOSED_DISH_KCAL,
  COMPOSED_DISH_MEAL_SHARE,
  composedDishShare,
  MEAL_COMPONENT_KCAL,
  type MealStructure,
  mealStructureState,
  dayCoverageOf,
  anchorFactorFor,
  householdAnchors,
  mouthTargetKcal,
} from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";

// ---------------------------------------------------------------------------
// LE BANC — les corps RÉELS du foyer `5600347f`, lus en base le 2026-08-19
// ---------------------------------------------------------------------------

const IKU: AnchorMouth = {
  memberId: "m_iku",
  ageState: "adult",
  restriction: "clear",
  body: {
    appetite: null,
    heightCm: 187,
    weightKg: 73,
    gender: "male",
    ageYears: 28,
    activityLevel: "trains_hard",
    activityAxes: { day: null, sport: null, asked: false },
  },
  direction: "up", // muscle_gain, 78 kg visés
  paceKgPerWeek: 0.35,
  // L0bis — aucune condition déclarée.
  conditionRefs: [],
  // Vide = les moments de la maison, c'est-à-dire les trois.
  declaredSlots: [],
  // `null` = ces trois questions n'ont jamais été posées à sa fiche, donc la
  // moyenne `COMPOSED_DISH_MEAL_SHARE` gouverne — le banc d'avant le LOT ①.
  structure: null,
};

const CHR: AnchorMouth = {
  memberId: "m_chr",
  ageState: "adult",
  restriction: "no_account",
  body: {
    appetite: null,
    heightCm: 169,
    weightKg: 59,
    gender: "female",
    ageYears: 55,
    activityLevel: "trains_some",
    activityAxes: { day: null, sport: null, asked: false },
  },
  direction: null, // maintenance
  paceKgPerWeek: null,
  // L0bis — aucune condition déclarée.
  conditionRefs: [],
  // Le cas RÉEL du foyer `5600347f`: elle ne déjeune et ne dîne que.
  declaredSlots: ["lunch", "dinner"],
  structure: null,
};

function day(over: Partial<MouthDayEnergy> & { memberId: string }): MouthDayEnergy {
  return {
    day: "thu",
    kcal: 2000,
    basis: "plan_quantities",
    complete: true,
    dishesCounted: 3,
    dishesTotal: 3,
    unattributedDishes: 0,
    subject: "the_day",
    slots: ["breakfast", "dinner", "lunch"],
    // ⚠️ VOLONTAIREMENT BAS: le plafond de vraisemblance physique dépend de
    // `grams`, et un banc qui le déclencherait partout empêcherait de tester
    // quoi que ce soit d'autre. Les tests qui veulent l'éprouver le passent
    // explicitement (voir « deux corps ne fusionnent PAS »).
    grams: 500,
    maxMealGrams: 250,
    gaps: [],
    ...over,
  } as MouthDayEnergy;
}

// ---------------------------------------------------------------------------
// ① LA CIBLE
// ---------------------------------------------------------------------------

Deno.test("une prise de masse ouvre un SURPLUS, une maintenance n'ouvre rien", () => {
  const up = mouthTargetKcal(IKU, "no_position");
  const flat = mouthTargetKcal(CHR, "no_position");
  assertEquals(up.reason, "anchored");
  assertEquals(flat.reason, "anchored");
  // Le surplus est au-dessus de l'entretien; la maintenance EST l'entretien.
  const ikuMaintenance = mouthTargetKcal({ ...IKU, direction: null }, "no_position").kcal!;
  assert(up.kcal! > ikuMaintenance, `${up.kcal} <= ${ikuMaintenance}`);
  assertEquals(flat.kcal, mouthTargetKcal({ ...CHR, direction: null }, "no_position").kcal);
});

Deno.test("une PERTE creuse sous l'entretien, jamais au-dessus", () => {
  const loss = mouthTargetKcal({ ...IKU, direction: "down" }, "no_position");
  const maintenance = mouthTargetKcal({ ...IKU, direction: null }, "no_position").kcal!;
  assert(loss.kcal! < maintenance, `${loss.kcal} >= ${maintenance}`);
  // ⛔ Et jamais sous le plancher d'énergie: `executedPaceFor` le borne déjà, on
  // vérifie ici que le SIGNE n'a pas été perdu au passage.
  assert(loss.kcal! > 0);
});

Deno.test("③ un coach qui ne compte pas garde l'ENTRETIEN et ferme l'ÉCART", () => {
  // C'est la ligne du chantier: la position du coach gouverne une CIBLE
  // D'ÉCART, elle ne décide pas qui reçoit le plus grand creux de la casserole.
  const open = mouthTargetKcal(IKU, "no_position");
  const closed = mouthTargetKcal(IKU, "no_counting");
  assertEquals(closed.reason, "anchored");
  assertEquals(closed.kcal, mouthTargetKcal({ ...IKU, direction: null }, "no_position").kcal);
  assert(closed.kcal! < open.kcal!, "le surplus aurait dû être fermé");
});

Deno.test("② un mineur garde sa maintenance PÉDIATRIQUE, et aucun écart", () => {
  const minor: AnchorMouth = {
    ...IKU,
    memberId: "m_kid",
    ageState: "minor",
    body: { appetite: null, heightCm: 122, weightKg: 23, gender: "female", ageYears: 7, activityLevel: null , activityAxes: { day: null, sport: null, asked: false }},
    direction: "down", // écrit sur la fiche: il ne doit RIEN ouvrir
    paceKgPerWeek: 0.5,
  };
  const got = mouthTargetKcal(minor, "no_position");
  assertEquals(got.reason, "anchored");
  // Sa cible est son entretien, pas un déficit.
  assertEquals(got.kcal, mouthTargetKcal({ ...minor, direction: null }, "no_position").kcal);
});

Deno.test("① le plancher TCA ferme TOUT, et il gagne contre ② et ③", () => {
  for (const ageState of ["adult", "minor"] as const) {
    for (const stance of ["no_position", "no_counting"] as const) {
      const got = mouthTargetKcal({ ...IKU, ageState, restriction: "raised" }, stance);
      assertEquals(got.kcal, null);
      assertEquals(got.reason, "restriction_floor");
    }
  }
});

Deno.test("① bis « on n'a pas su lire » n'est PAS « son plancher est levé »", () => {
  const got = mouthTargetKcal({ ...IKU, restriction: "unreadable" }, "no_position");
  assertEquals(got.kcal, null);
  assertEquals(got.reason, "restriction_unknown");
});

Deno.test("un âge inconnu ferme: « je ne sais pas » n'est pas « c'est un adulte »", () => {
  const got = mouthTargetKcal({ ...IKU, ageState: "unknown" }, "no_position");
  assertEquals(got.kcal, null);
  assertEquals(got.reason, "age_unknown");
});

Deno.test("sans corps, aucune cible", () => {
  const got = mouthTargetKcal({ ...IKU, body: null }, "no_position");
  assertEquals(got.kcal, null);
  assertEquals(got.reason, "no_body");
});

// ---------------------------------------------------------------------------
// ② LE FACTEUR — et la garde qui compte le plus
// ---------------------------------------------------------------------------

Deno.test("⛔ une journée INCOMPLÈTE n'ancre pas — on ne devine pas vers le haut", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Un plat non lu sous-estime le livré. `cible /
  // livré` devient alors trop GRAND, et on servirait davantage à quelqu'un
  // parce qu'on n'a pas su lire son assiette.
  const got = anchorFactorFor(
    IKU,
    day({ memberId: "m_iku", kcal: 900, complete: false, gaps: ["dish_incomplete"] }),
    "no_position",
  );
  assertEquals(got.factor, 1);
  assertEquals(got.reason, "day_incomplete");
  assertEquals(got.raw, null);
  // La cible et le livré restent RENDUS: on dit ce qu'on savait, on refuse
  // seulement d'en tirer un facteur.
  assert(got.targetKcal !== null);
  assertEquals(got.deliveredKcal, 900);
});

Deno.test("le facteur ferme l'écart entre la cible et le livré", () => {
  const target = mouthTargetKcal(IKU, "no_position").kcal!;
  // Un livré volontairement PROCHE de la cible: le facteur reste dans les
  // bornes et vaut exactement le rapport.
  const delivered = Math.round(target * COMPOSED_DISH_MEAL_SHARE * 0.9);
  const got = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: delivered }), "no_position");
  assertEquals(got.reason, "anchored");
  // ⚠️ LE PLAT NE PORTE PAS LE REPAS ENTIER: la cible est réduite à la part que
  // le plan compose réellement. Le reste (pain, fromage, dessert) existe dans
  // l'assiette sans être composé.
  assertEquals(got.factor, (target * COMPOSED_DISH_MEAL_SHARE) / delivered);
  assertEquals(got.raw, (target * COMPOSED_DISH_MEAL_SHARE) / delivered);
});

Deno.test("deux corps différents reçoivent deux facteurs différents sur le MÊME plan", () => {
  // C'est la propriété que `bodyShareFactors` achetait par un rapport, et qui
  // doit tomber NATURELLEMENT de l'ancrage absolu — sinon les deux couches
  // seraient encore nécessaires, et elles se doubleraient.
  // Un livré COMMUN et bas, mais avec un plafond de repas qui ne mord pas: ce
  // qu'on éprouve est la divergence des cibles, pas les bornes.
  const same = 700;
  const a = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: same, maxMealGrams: 100 }), "no_position");
  const b = anchorFactorFor(CHR, day({ memberId: "m_chr", kcal: same, maxMealGrams: 100 }), "no_position");
  assert(a.factor > b.factor, `${a.factor} <= ${b.factor}`);
  // Et le rapport des facteurs est celui des cibles: le partage relatif est
  // contenu dans l'ancrage, il n'a plus besoin d'une seconde couche.
  // ⚠️ `toFixed(2)`: `targetKcal` est ARRONDI au rendu, et l'arrondi pèse
  // désormais plus lourd sur des cibles de PLAT (quelques centaines de kcal)
  // que sur des cibles de journée. Ce qu'on éprouve est le rapport, pas la
  // précision de l'arrondi.
  assertEquals(
    (a.raw! / b.raw!).toFixed(2),
    (a.targetKcal! / b.targetKcal!).toFixed(2),
  );
});

Deno.test("un facteur hors bornes est RABOTÉ et compté, jamais refusé en silence", () => {
  // Refuser rendrait `1`, c'est-à-dire le 450 g du modèle — très exactement le
  // produit que ce chantier corrige.
  // ⚠️ `maxMealGrams` haut EXPRÈS: c'est la borne de FACTEUR qu'on éprouve ici,
  // pas celle du repas (8×73/100 = 5,84 > ANCHOR_FACTOR_MAX, donc elle dort).
  const tiny = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 200, maxMealGrams: 100 }), "no_position");
  assertEquals(tiny.factor, ANCHOR_FACTOR_MAX);
  assertEquals(tiny.reason, "clamped");
  assert(tiny.raw! > ANCHOR_FACTOR_MAX, "le résidu doit survivre au rabotage");

  const huge = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 9000, maxMealGrams: 100 }), "no_position");
  assertEquals(huge.factor, ANCHOR_FACTOR_MIN);
  assertEquals(huge.reason, "clamped");
  assert(huge.raw! < ANCHOR_FACTOR_MIN);
});

Deno.test("`raw` survit toujours au rabotage — c'est l'entrée du LOT 3", () => {
  // Sans lui, on ne peut pas savoir si la casserole doit GROSSIR plutôt que la
  // part être rabotée, et l'aval devient un habillage.
  const got = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 200, maxMealGrams: 100 }), "no_position");
  assertEquals(got.factor * (got.raw! / got.factor), got.raw);
  assert(got.raw !== got.factor);
});

Deno.test("aucun livré ⇒ aucun facteur, et le motif le dit", () => {
  for (const kcal of [null, 0]) {
    const got = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal }), "no_position");
    assertEquals(got.factor, 1);
    assertEquals(got.reason, "no_delivery");
  }
  const none = anchorFactorFor(IKU, null, "no_position");
  assertEquals(none.factor, 1);
  assertEquals(none.reason, "no_delivery");
});

Deno.test("tout motif rendu appartient au vocabulaire fermé", () => {
  const cases = [
    anchorFactorFor(IKU, day({ memberId: "m_iku" }), "no_position"),
    // ⚠️ `complete: false` NE SUFFIT PLUS: c'est la LACUNE qui décide, et
    // `no_box` ne bloque volontairement plus (voir son test dédié).
    anchorFactorFor(
      IKU,
      day({ memberId: "m_iku", complete: false, gaps: ["dish_incomplete"] }),
      "no_position",
    ),
    anchorFactorFor({ ...IKU, restriction: "raised" }, day({ memberId: "m_iku" }), "no_position"),
    anchorFactorFor({ ...IKU, body: null }, day({ memberId: "m_iku" }), "no_position"),
    anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 200 }), "no_position"),
  ];
  for (const c of cases) assert(ANCHOR_REASONS.includes(c.reason), c.reason);
});

Deno.test("un facteur non ancré vaut EXACTEMENT 1 — jamais 0, jamais null", () => {
  // Un `0` viderait l'assiette, un `null` traverserait les additions en
  // silence. `1` veut dire « la boîte que le modèle a écrite, inchangée ».
  const closed = [
    anchorFactorFor({ ...IKU, restriction: "raised" }, day({ memberId: "m_iku" }), "no_position"),
    anchorFactorFor({ ...IKU, ageState: "unknown" }, day({ memberId: "m_iku" }), "no_position"),
    // ⚠️ `complete: false` NE SUFFIT PLUS: c'est la LACUNE qui décide, et
    // `no_box` ne bloque volontairement plus (voir son test dédié).
    anchorFactorFor(
      IKU,
      day({ memberId: "m_iku", complete: false, gaps: ["dish_incomplete"] }),
      "no_position",
    ),
  ];
  for (const c of closed) assertEquals(c.factor, 1);
});

// ---------------------------------------------------------------------------
// ③ LA TABLE ENTIÈRE
// ---------------------------------------------------------------------------

Deno.test("householdAnchors clé sur (bouche, jour), comme mouthDayEnergy", () => {
  const got = householdAnchors(
    [IKU, CHR],
    [
      day({ memberId: "m_iku", day: "thu" }),
      day({ memberId: "m_iku", day: "fri" }),
      day({ memberId: "m_chr", day: "thu" }),
    ],
    "no_position",
  );
  assertEquals([...got.keys()].sort(), ["m_chr thu", "m_iku fri", "m_iku thu"]);
});

Deno.test("une journée dont la bouche est inconnue de la table est ignorée", () => {
  const got = householdAnchors([IKU], [day({ memberId: "m_ghost" })], "no_position");
  assertEquals(got.size, 0);
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const mouths = [IKU, CHR];
  const days = [day({ memberId: "m_iku" }), day({ memberId: "m_chr" })];
  const before = JSON.stringify(mouths) + JSON.stringify(days);
  const a = householdAnchors(mouths, days, "no_position");
  const b = householdAnchors(mouths, days, "no_position");
  assertEquals(JSON.stringify([...a]), JSON.stringify([...b]));
  assertEquals(JSON.stringify(mouths) + JSON.stringify(days), before);
});

// ---------------------------------------------------------------------------
// ④ LA PART DE JOURNÉE QUE LE PLAN PORTE — le défaut mesuré du 2026-08-20
// ---------------------------------------------------------------------------

Deno.test("⛔ un seul moment composé ne se voit pas demander une JOURNÉE entière", () => {
  // LE DÉFAUT, MESURÉ SUR UN RUN RÉEL. Christèle déclare `lunch`+`dinner`; le
  // plan ne lui compose que `dinner`. Sa cible de journée (2 205 kcal)
  // confrontée à ce seul dîner (452 kcal) rendait un facteur brut de **6,28** —
  // une assiette de deux kilos, ou, une fois rabotée au plafond, la même que
  // celle de tout le monde. C'est le défaut qui a survécu à deux lots.
  // `maxMealGrams` bas: ce test éprouve la COUVERTURE, pas le plafond de repas
  // (8×59/150 = 3,15, au-dessus du facteur attendu — il dort).
  const dinnerOnly = day({ memberId: "m_chr", kcal: 452, slots: ["dinner"], maxMealGrams: 150 });
  const got = anchorFactorFor(CHR, dinnerOnly, "no_position");
  assertEquals(got.reason, "anchored");
  // Sa cible RENDUE est réduite à ce que le plan porte, pas sa journée.
  const wholeDay = mouthTargetKcal(CHR, "no_position").kcal!;
  assert(got.targetKcal! < wholeDay, `${got.targetKcal} >= ${wholeDay}`);
  // Et le facteur reste dans un ordre de grandeur qu'une assiette peut porter.
  assert(got.raw! < 3.5, `facteur brut ${got.raw}`);
});

Deno.test("une journée ENTIÈREMENT composée n'est pas réduite", () => {
  // Le cas nominal: iku déclare les moments de la maison et les reçoit tous.
  const full = day({ memberId: "m_iku", kcal: 2000, slots: ["breakfast", "lunch", "dinner"] });
  const got = anchorFactorFor(IKU, full, "no_position");
  // La COUVERTURE vaut 1 (tous ses moments sont composés); seule la part de
  // plat s'applique, et elle est nommée à part.
  assertEquals(
    got.targetKcal,
    Math.round(mouthTargetKcal(IKU, "no_position").kcal! * COMPOSED_DISH_MEAL_SHARE),
  );
});

Deno.test("dayCoverageOf — la règle, isolée", () => {
  // Rien de déclaré = les moments de la maison, c'est-à-dire les trois.
  assertEquals(dayCoverageOf([], ["breakfast", "lunch", "dinner"]), 1);
  // Tout ce qui est déclaré est composé.
  assertEquals(dayCoverageOf(["lunch", "dinner"], ["lunch", "dinner"]), 1);
  // La moitié d'une journée à deux moments.
  const half = dayCoverageOf(["lunch", "dinner"], ["dinner"]);
  assert(half > 0.4 && half < 0.5, String(half));
  // ⚠️ UN MOMENT COMPOSÉ QU'ELLE N'A PAS DÉCLARÉ COMPTE QUAND MÊME: le plan le
  // lui sert, donc il la nourrit. L'ignorer sous-estimerait ce qu'elle reçoit
  // et gonflerait sa part.
  assertEquals(dayCoverageOf(["dinner"], ["dinner", "breakfast"]), 1);
  // Aucun moment composé: on ne réduit rien plutôt que de rendre zéro, qui
  // ferait une division par zéro chez l'appelant.
  assertEquals(dayCoverageOf(["lunch", "dinner"], []), 1);
});

Deno.test("⛔ un plat SANS COUVERCLE ne bloque pas — sa cible a déjà été retirée", () => {
  // MESURÉ LE 2026-08-20, SIX RUNS RÉELS CONSÉCUTIFS. Tout plan contenant un
  // seul plat cuisiné le jour même sortait `day_incomplete` sur TOUTES ses
  // bouches, et l'ancrage ne s'appliquait jamais. Or un plat sans couvercle
  // n'entre pas dans `day.slots`: `dayCoverageOf` a déjà retiré son moment de
  // la cible, donc les deux côtés du rapport sont réduits ENSEMBLE.
  const got = anchorFactorFor(
    IKU,
    day({
      memberId: "m_iku",
      kcal: 900,
      complete: false,
      unattributedDishes: 2,
      subject: "what_could_be_attributed",
      slots: ["dinner"],
      gaps: ["no_box"],
    }),
    "no_position",
  );
  assertEquals(got.reason, "anchored");
  assert(got.raw !== null);
  // La cible est celle du seul moment couvert, pas celle de la journée.
  assert(got.targetKcal! < mouthTargetKcal(IKU, "no_position").kcal!);
});

Deno.test("mais une lacune de LECTURE bloque toujours, même mélangée à `no_box`", () => {
  // La contre-épreuve: sans elle, « on ne bloque plus sur no_box » se
  // transformerait en « on ne bloque plus » au premier refactor.
  const got = anchorFactorFor(
    IKU,
    day({ memberId: "m_iku", kcal: 900, complete: false, gaps: ["no_box", "dish_incomplete"] }),
    "no_position",
  );
  assertEquals(got.reason, "day_incomplete");
  assertEquals(got.factor, 1);
});

Deno.test("⛔ deux corps ne fusionnent PAS en butant sur le plafond physique", () => {
  // ── LE DÉFAUT STRUCTUREL, MESURÉ SUR NEUF RUNS RÉELS LE 2026-08-20 ──────
  // Quand le plan compose ~1/3 de l'énergie nécessaire — le cas nominal d'un
  // plan de légumes rôtis — TOUTES les bouches dépassent le plafond, s'y
  // collent, et redeviennent identiques: `iku 1315 g · Christèle 1302 g`,
  // c'est-à-dire le défaut d'origine reproduit par sa propre ceinture.
  //
  // Un plafond COMMUN fusionne par construction; celui-ci est proportionnel au
  // corps, donc deux corps différents ne peuvent pas s'y rejoindre.
  // La plus grosse part au niveau où l'écran l'a montrée: 400 g écrits par le
  // modèle, et une cible 3 à 5 fois au-dessus du livré.
  // ⚠️ `kcal: 200` ET NON 400: depuis que la cible est celle du PLAT et non du
  // repas entier, un livré de 400 kcal suffit presque à Christèle — son facteur
  // ne bute plus. Il faut une vraie famine pour que LES DEUX butent, et c'est
  // ce cas-là que ce test existe pour éprouver.
  const starved = { kcal: 200, grams: 1200, maxMealGrams: 400 };
  const a = anchorFactorFor(IKU, day({ memberId: "m_iku", ...starved }), "no_position");
  const b = anchorFactorFor(CHR, day({ memberId: "m_chr", ...starved, slots: ["dinner"] }), "no_position");
  // Les deux butent — c'est le cas qu'on veut éprouver.
  assertEquals(a.reason, "clamped");
  assertEquals(b.reason, "clamped");
  // ⛔ ET ILS RESTENT DIFFÉRENTS. C'est toute la propriété.
  assert(a.factor !== b.factor, `${a.factor} === ${b.factor}`);
  // Le plus lourd mange plus, en grammes comme en facteur.
  assert(a.factor > b.factor, `${a.factor} <= ${b.factor}`);
  // Et le résidu survit, pour dire de combien le plan est trop peu dense.
  assert(a.raw! > a.factor);
});

Deno.test("le plafond physique ne mord pas sur une journée normale", () => {
  // La contre-épreuve: une garde qui morderait partout serait un interrupteur.
  const target = mouthTargetKcal(IKU, "no_position").kcal!;
  const got = anchorFactorFor(
    IKU,
    day({
      memberId: "m_iku",
      kcal: Math.round(target * COMPOSED_DISH_MEAL_SHARE * 0.9),
      grams: 1200,
      maxMealGrams: 450,
    }),
    "no_position",
  );
  assertEquals(got.reason, "anchored");
});

Deno.test("⛔ AUCUNE part servie ne dépasse ce qu'un repas peut peser — le 1,2 kg est mort", () => {
  // LE DÉFAUT VU À L'ÉCRAN LE 2026-08-20: « iku 1232 g · Christèle 1209 g »
  // dans UNE boîte de dîner. La borne journalière laissait passer, parce que la
  // journée entière restait plausible pendant qu'un repas devenait inmangeable.
  // ⚠️ `kcal: 200` ET NON 400: depuis que la cible est celle du PLAT et non du
  // repas entier, un livré de 400 kcal suffit presque à Christèle — son facteur
  // ne bute plus. Il faut une vraie famine pour que LES DEUX butent, et c'est
  // ce cas-là que ce test existe pour éprouver.
  const starved = { kcal: 200, grams: 1200, maxMealGrams: 400 };
  for (const [mouth, kg] of [[IKU, 73], [CHR, 59]] as const) {
    const slots = mouth === CHR ? { slots: ["dinner"] } : {};
    const got = anchorFactorFor(mouth, day({ memberId: mouth.memberId, ...starved, ...slots }), "no_position");
    const biggestServed = 400 * got.factor;
    assert(
      biggestServed <= MEAL_MAX_GRAMS_PER_KG * kg + 1,
      `${mouth.memberId}: ${Math.round(biggestServed)} g dans une boîte`,
    );
  }
});

Deno.test("⛔ le plat composé ne porte pas le REPAS ENTIER — le fromage et le dessert existent", () => {
  // NOMMÉ PAR LE PROPRIÉTAIRE LE 2026-08-20, ET VÉRIFIÉ: sur le plan servi ce
  // jour-là, NEUF plats sur NEUF sont des plats principaux. Aucun fromage,
  // aucun dessert, aucun pain. Le moteur faisait donc porter au seul plat
  // l'énergie du repas entier — c'est l'erreur de `dayCoverageOf` rejouée un
  // cran plus bas, repas contre plat.
  const target = mouthTargetKcal(CHR, "no_position").kcal!;
  const got = anchorFactorFor(
    CHR,
    day({ memberId: "m_chr", kcal: 400, slots: ["dinner"], maxMealGrams: 150 }),
    "no_position",
  );
  // La cible du plat est STRICTEMENT sous celle du repas, elle-même sous la
  // journée: trois réductions emboîtées, chacune nommée.
  const wholeMeal = target * dayCoverageOf(CHR.declaredSlots, ["dinner"]);
  assert(got.targetKcal! < wholeMeal, `${got.targetKcal} >= ${wholeMeal}`);
  assertEquals(got.targetKcal, Math.round(wholeMeal * COMPOSED_DISH_MEAL_SHARE));
});

// ---------------------------------------------------------------------------
// ① LA STRUCTURE DU REPAS (2026-08-20)
// ---------------------------------------------------------------------------

Deno.test("① la part du plat est CALCULÉE depuis la convention, pas tabulée", () => {
  //     part = 300 / (300 + 80 x pain + 120 x fromage + 120 x dessert)
  const all: MealStructure = { dessert: true, cheese: true, bread: true };
  assertEquals(
    composedDishShare(all).share,
    COMPOSED_DISH_KCAL /
      (COMPOSED_DISH_KCAL + MEAL_COMPONENT_KCAL.dessert +
        MEAL_COMPONENT_KCAL.cheese + MEAL_COMPONENT_KCAL.bread),
  );
  // iku: du pain, rien d'autre.
  const breadOnly: MealStructure = { dessert: false, cheese: false, bread: true };
  assertEquals(
    composedDishShare(breadOnly).share,
    COMPOSED_DISH_KCAL / (COMPOSED_DISH_KCAL + MEAL_COMPONENT_KCAL.bread),
  );
  // Rien du tout: le plat EST le repas. Ce n'est pas une borne, c'est la
  // définition — la ceinture qui empêche une assiette inmangeable est
  // physique, et elle est ailleurs.
  assertEquals(
    composedDishShare({ dessert: false, cheese: false, bread: false }).share,
    1,
  );
});

Deno.test("⛔ ① LE DÉFAUT MESURÉ — la moyenne se trompe dans les DEUX sens", () => {
  // « Christèle est à peu près juste par accident; iku reçoit environ la
  // moitié de ce qu'il lui faut. » Les deux parts encadrent la moyenne, et
  // celle d'iku en est loin.
  const chr = composedDishShare({ dessert: true, cheese: true, bread: true }).share;
  const iku = composedDishShare({ dessert: false, cheese: false, bread: true }).share;
  assert(chr > COMPOSED_DISH_MEAL_SHARE, "Christèle devrait monter un peu");
  assert(iku > chr, "iku devrait monter BEAUCOUP plus que Christèle");
  assert(iku / COMPOSED_DISH_MEAL_SHARE > 1.7, `iku ne monte que de ${iku / COMPOSED_DISH_MEAL_SHARE}`);
});

Deno.test("⛔ ① LE REPLI EST NEUTRE AU BIT PRÈS — trois cas sur quatre", () => {
  // La contre-épreuve « fiches vides » du chantier, écrite comme une propriété:
  // tout ce qui n'est pas `answered` rend EXACTEMENT la moyenne d'hier.
  const cases: (MealStructure | null)[] = [
    null,
    { dessert: null, cheese: null, bread: null },
    { dessert: true, cheese: null, bread: null },
    { dessert: true, cheese: false, bread: null },
  ];
  for (const c of cases) {
    assertEquals(composedDishShare(c).share, COMPOSED_DISH_MEAL_SHARE);
  }
});

Deno.test("⛔ ① QUATRE ÉTATS, PAS DEUX — `not_asked` ≠ `not_answered`", () => {
  assertEquals(mealStructureState(null), "not_asked");
  assertEquals(
    mealStructureState({ dessert: null, cheese: null, bread: null }),
    "not_answered",
  );
  assertEquals(
    mealStructureState({ dessert: true, cheese: null, bread: null }),
    "partial",
  );
  assertEquals(
    mealStructureState({ dessert: false, cheese: false, bread: false }),
    "answered",
  );
});

Deno.test("⛔ ① `false` EST UNE RÉPONSE, `null` NE L'EST PAS", () => {
  // La cicatrice « coche auto = faits faux indémentables », dans le sens qui
  // nourrit trop: une case décochée au fond d'un formulaire enregistré sans
  // être lu ne doit pas pouvoir dire « je ne prends ni pain ni fromage ni
  // dessert », c'est-à-dire un plat qui porte 100 % du repas.
  const answeredNo = composedDishShare({ dessert: false, cheese: false, bread: false });
  const notAnswered = composedDishShare({ dessert: null, cheese: null, bread: null });
  assertEquals(answeredNo.share, 1);
  assertEquals(notAnswered.share, COMPOSED_DISH_MEAL_SHARE);
  assert(answeredNo.share !== notAnswered.share, "les deux ne peuvent pas coïncider");
});

Deno.test("⛔ ① LA PART ATTEINT VRAIMENT LE FACTEUR ET LA CIBLE", () => {
  // Un lot construit et non branché rend le même nombre qu'avant. On mesure la
  // sortie d'`anchorFactorFor`, pas la table.
  const d = day({ memberId: IKU.memberId, kcal: 700, maxMealGrams: 0 });
  const before = anchorFactorFor(IKU, d, "no_position");
  const after = anchorFactorFor(
    { ...IKU, structure: { dessert: false, cheese: false, bread: true } },
    d,
    "no_position",
  );
  assertEquals(before.structureState, "not_asked");
  assertEquals(after.structureState, "answered");
  assert(after.raw! > before.raw!, "la part déclarée n'atteint pas le facteur");
  assert(after.targetKcal! > before.targetKcal!, "la cible rendue n'a pas suivi");
  // Le rapport EST celui des deux parts — pas « quelque chose de plus grand ».
  assertEquals(
    Math.round((after.raw! / before.raw!) * 1000) / 1000,
    Math.round(
      (composedDishShare({ dessert: false, cheese: false, bread: true }).share /
        COMPOSED_DISH_MEAL_SHARE) * 1000,
    ) / 1000,
  );
});

Deno.test("① le motif de structure est rendu MÊME quand rien n'est ancré", () => {
  // Un compteur qui ne parlerait que sur les journées ancrées ferait lire
  // « personne n'a répondu » sur un foyer où tout le monde a répondu et où
  // chaque journée est incomplète.
  const answered = { ...CHR, structure: { dessert: true, cheese: true, bread: true } };
  assertEquals(anchorFactorFor(answered, null, "no_position").structureState, "answered");
  const incomplete = day({
    memberId: CHR.memberId,
    kcal: 500,
    complete: false,
    gaps: ["dish_incomplete"],
  });
  const got = anchorFactorFor(answered, incomplete, "no_position");
  assertEquals(got.reason, "day_incomplete");
  assertEquals(got.structureState, "answered");
});
