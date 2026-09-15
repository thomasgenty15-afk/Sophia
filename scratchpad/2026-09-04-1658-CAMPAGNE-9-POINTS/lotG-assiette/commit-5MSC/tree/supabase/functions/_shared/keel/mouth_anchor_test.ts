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
  DATED_NOTE_BOOST,
  ANCHOR_FACTOR_MAX,
  MEAL_KCAL_PER_G_COMPOSED,
  MEAL_KCAL_PER_G_FLOOR,
  MEAL_MAX_GRAMS_PER_KG,
  ANCHOR_FACTOR_MIN,
  ANCHOR_REASONS,
  type AnchorMouth,
  COMPOSED_DISH_MIN_MEAL_SHARE,
  mealStructureState,
  dayCoverageOf,
  SLOT_DAY_WEIGHT,
  WEIGHTED_SLOT_TOKENS,
  anchorFactorFor,
  householdAnchors,
  mouthTargetKcal,
} from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import { MEAL_SLOTS } from "./meal_generation.ts";

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
  slotExtraKcal: null,
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
  slotExtraKcal: null,
};

/**
 * CE QUE LE PLAN DOIT FOURNIR, EN PART DE LA CIBLE DE JOURNÉE — 2026-09-01.
 *
 * ⛔ DES LITTÉRAUX, ET LA DÉRIVATION EN COMMENTAIRE. Les calculer depuis
 * `SLOT_DAY_WEIGHT` et `UNANSWERED_EXTRAS_SHARE` ferait un banc paramétré par
 * les constantes qu'il vérifie: il resterait vert le jour où l'une d'elles
 * change, c'est-à-dire le jour où il devrait rougir.
 *
 * ── LES TROIS REPAS, FICHE MUETTE ─────────────────────────────────────────
 * ⟳ 2026-09-04 — CE N'EST PLUS UNE PART, C'EST UNE SOUSTRACTION.
 *
 *     petit-déjeuner  0,25 × cible        ← composé ENTIER
 *     déjeuner        0,40 × cible        ← rien d'indiqué, rien de retiré
 *     dîner           0,35 × cible
 *                                   ⇒ la CIBLE ENTIÈRE
 *
 * ⛔ LE RETRAIT SUPPOSÉ A DISPARU, décision du propriétaire du 2026-09-04.
 * L'ancien `0,42` faisait grandir le retrait avec le corps: plus quelqu'un
 * avait besoin de manger, plus on supposait qu'il mangeait ailleurs. Du pain
 * reste du pain. Mesuré: 4 bouches sur 143 déclarent un extra, donc ce repli
 * couvrait 97 % de la population — il n'arbitrait plus, il ÉTAIT le produit.
 *
 * ⚠️ ET LE FORFAIT EST BORNÉ: le plat garde au moins 30 % de son repas
 * (`COMPOSED_DISH_MIN_MEAL_SHARE`), donc sur un petit repas le retrait est
 * raboté à `0,70 × part_du_repas`. La fonction ci-dessous le rejoue en
 * littéraux — le calculer depuis les constantes de production ferait un banc
 * paramétré par ce qu'il vérifie.
 */
const UNANSWERED_KCAL = 0;

/**
 * Ce que le plan doit porter sur une fiche MUETTE à trois repas déclarés:
 * **toute la journée**. Rien d'indiqué, rien de retiré.
 */
function threeMealsTarget(target: number): number {
  const cut = (share: number) => {
    const meal = target * share;
    return meal - Math.min(UNANSWERED_KCAL, meal * 0.70);
  };
  return target * 0.25 + cut(0.40) + cut(0.35);
}

/**
 * L'ANCRE A-T-ELLE TIRÉ ? C'est la définition de la PRODUCTION, pas une opinion
 * de banc: `generate-household-meal-v1` écarte tout motif qui n'est ni
 * `anchored` ni `clamped` (« if (reason !== "anchored" && reason !== "clamped")
 * continue »). Les deux appliquent un facteur; seul le second a été raboté.
 *
 * ⟳ 2026-09-04 — IL EXISTE PARCE QUE LE RETRAIT SUPPOSÉ A DISPARU. Sans lui les
 * cibles montent, donc les facteurs aussi, donc `ANCHOR_FACTOR_MAX` mord plus
 * souvent. Un banc qui exigeait `anchored` mesurait la BORNE, pas le fait que
 * l'ancre tire — et il rougissait pour un lot qui marche.
 */
function fired(reason: string): boolean {
  return reason === "anchored" || reason === "clamped";
}

/**
 * UN SEUL MOMENT PORTEUR D'EXTRAS, FICHE MUETTE ⇒ **la part entière du repas**.
 *
 * ⟳ 2026-09-04 — C'ÉTAIT `0,42`. Le retrait supposé n'existe plus: rien
 * d'indiqué, rien de retiré. Une fiche qui A répondu garde son retrait, et ce
 * banc-là le vérifie ailleurs (`slotExtraKcal` explicite).
 */
const EXTRA_SLOT_SHARE = 1;

function day(over: Partial<MouthDayEnergy> & { memberId: string }): MouthDayEnergy {
  const base: MouthDayEnergy = {
    day: "thu",
    kcal: 2000,
    basis: "plan_quantities",
    complete: true,
    dishesCounted: 3,
    dishesTotal: 3,
    unattributedDishes: 0,
    subject: "the_day",
    slots: ["breakfast", "dinner", "lunch"],
    ownSlots: [],
    // ⚠️ VOLONTAIREMENT BAS: le plafond de vraisemblance physique dépend de
    // `grams`, et un banc qui le déclencherait partout empêcherait de tester
    // quoi que ce soit d'autre. Les tests qui veulent l'éprouver le passent
    // explicitement (voir « deux corps ne fusionnent PAS »).
    grams: 500,
    maxMealGrams: 250,
    gaps: [],
    ...over,
  };
  // ⚠️ `ownSlots` SUIT `slots` PAR DÉFAUT, ET C'EST LE CAS NOMINAL DU BANC: une
  // bouche seule sur ses couvercles. Un test qui veut un bac le dit
  // explicitement (`ownSlots: []` ou un sous-ensemble), ce qui rend la
  // divergence LISIBLE à l'endroit où elle est éprouvée.
  //
  // ⛔ ET LE `as MouthDayEnergy` A DISPARU. C'est lui qui a laissé `ownSlots`
  // absent traverser ce fichier sans qu'un compilateur le dise — la cicatrice
  // « `as` sur un type étranger désarme le typecheck », payée ici même.
  return { ...base, ownSlots: over.ownSlots ?? base.slots };
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
  const delivered = Math.round(threeMealsTarget(target) * 0.9);
  const got = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: delivered }), "no_position");
  assertEquals(got.reason, "anchored");
  // ⚠️ LE PLAT NE PORTE PAS LE REPAS ENTIER: la cible est réduite à la part que
  // le plan compose réellement. Le reste (pain, fromage, dessert) existe dans
  // l'assiette sans être composé.
  assertEquals(got.factor, threeMealsTarget(target) / delivered);
  assertEquals(got.raw, threeMealsTarget(target) / delivered);
});

Deno.test("deux corps différents reçoivent deux facteurs différents sur le MÊME plan", () => {
  // C'est la propriété que `bodyShareFactors` achetait par un rapport, et qui
  // doit tomber NATURELLEMENT de l'ancrage absolu — sinon les deux couches
  // seraient encore nécessaires, et elles se doubleraient.
  // Un livré COMMUN et bas, mais avec un plafond de repas qui ne mord pas: ce
  // qu'on éprouve est la divergence des cibles, pas les bornes.
  // ⟳ 2026-09-04 — ON COMPARE `raw`, PAS `factor`. Sans le retrait supposé les
  // cibles montent, les deux facteurs touchent `ANCHOR_FACTOR_MAX` et se
  // rejoignent à 3: le banc mesurait alors la BORNE, pas la divergence des
  // corps. `raw` existe exactement pour survivre au rabotage.
  const same = 700;
  const a = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: same, maxMealGrams: 100 }), "no_position");
  const b = anchorFactorFor(CHR, day({ memberId: "m_chr", kcal: same, maxMealGrams: 100 }), "no_position");
  assert(a.raw! > b.raw!, `${a.raw} <= ${b.raw}`);
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
    Math.round(threeMealsTarget(mouthTargetKcal(IKU, "no_position").kcal!)),
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
  assert(fired(got.reason), `l'ancre n'a pas tiré: ${got.reason}`);
  assert(got.raw !== null);
  // La cible est celle du seul moment couvert, pas celle de la journée.
  assert(got.targetKcal! < mouthTargetKcal(IKU, "no_position").kcal!);
});

Deno.test("⛔ UN BAC AU DÉJEUNER NE BLOQUE PLUS SON DÎNER À ELLE", () => {
  // ⟳ 2026-09-04 — `common_pot` BLOQUAIT, ET SA RAISON A ÉTÉ RÉPARÉE. Un bac
  // laissait le MOMENT dans `slots` — elle a bien mangé ce midi — pendant qu'il
  // ne rendait aucun kcal: un seul côté du rapport baissait, donc `cible/livré`
  // gonflait. `ownSlots` fait baisser l'autre, et c'est l'argument exact qui a
  // exempté `no_box` juste au-dessus.
  //
  // LE DÉCOR: elle déclare et mange trois moments; midi est un bac partagé,
  // matin et soir sont à elle. On sait donc lire deux tiers de sa journée.
  const got = anchorFactorFor(
    IKU,
    day({
      memberId: "m_iku",
      kcal: 900,
      complete: false,
      slots: ["breakfast", "dinner", "lunch"],
      ownSlots: ["breakfast", "dinner"],
      gaps: ["common_pot"],
    }),
    "no_position",
  );
  assert(fired(got.reason), `l'ancre n'a pas tiré: ${got.reason}`);
  assert(got.raw !== null);

  // ⛔ ET LA CIBLE NE PORTE QUE SES DEUX MOMENTS. Le déjeuner reste au
  // DÉNOMINATEUR de la journée (elle l'a mangé) mais sort du NUMÉRATEUR (on ne
  // sait pas ce qu'il pesait). Sans cette moitié, le test passerait aussi bien
  // sur une exemption qui demanderait la journée entière à deux repas — très
  // exactement le 6,28 de Christèle, par un autre chemin.
  const whole = mouthTargetKcal(IKU, "no_position").kcal!;
  assert(
    got.targetKcal! < whole,
    `la cible n'a pas été réduite: ${got.targetKcal} pour une journée de ${whole}`,
  );

  // ⚠️ ET UNE JOURNÉE ENTIÈREMENT EN BAC NE PASSE TOUJOURS PAS. C'est la garde
  // qui compte 24 bouches sur 36; l'exemption ne doit pas l'emporter avec elle.
  const allPot = anchorFactorFor(
    IKU,
    day({
      memberId: "m_iku",
      kcal: null,
      complete: false,
      ownSlots: [],
      gaps: ["common_pot"],
    }),
    "no_position",
  );
  assertEquals(allPot.reason, "common_pot_day");
  assertEquals(allPot.factor, 1);
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
  // ⟳ ARBITRAGE 1 (2026-09-06) : à 0,17 kcal/g le plafond est celui du PLANCHER de
  // densité (cible du repas / 0,8), plus large qu'à 1,35 — les deux facteurs
  // butent alors sur ANCHOR_FACTOR_MAX et se rejoignent à 3. Ce que le test
  // éprouve — deux corps, deux plafonds — se lit sur `capGrams` et sur `raw`.
  assert(a.capGrams !== b.capGrams, `${a.capGrams} === ${b.capGrams}`);
  assertEquals(a.capBit, b.capBit);
  // Le plus lourd mange plus, en grammes comme en facteur.
  assert(a.raw! > b.raw!, `${a.raw} <= ${b.raw}`);
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
      kcal: Math.round(threeMealsTarget(target) * 0.9),
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
    // ⟳ 2026-09-04: la borne est celle que l'ancre REND (`capGrams`, dérivée de
    // la cible du repas), plus `8 g/kg` — voir `mealMassCapGrams`. Le 1,2 kg
    // reste mort: un adulte à 200 kcal livrées ne reçoit pas 1 200 g.
    assert(got.capGrams !== null && got.capGrams > 0, `${mouth.memberId}: aucun plafond rendu`);
    assert(
      biggestServed <= got.capGrams + 1,
      `${mouth.memberId}: ${Math.round(biggestServed)} g dans une boîte pour un plafond de ${got.capGrams} g (${kg} kg)`,
    );
    // ⛔ UN REPAS NE PORTE JAMAIS LA JOURNÉE: c'est le 1,2 kg d'origine — un
    // dîner qui portait toute la masse du jour pendant que la borne journalière
    // laissait passer. Le plafond d'un repas est STRICTEMENT sous la masse du jour.
    // ⟳ ARBITRAGE 1 (2026-09-06) : à 0,17 kcal/g la densité retenue est le
    // PLANCHER (0,8), pas 1,35 — le plafond d'un repas ne dépasse jamais ce que
    // sa cible pèse à cette densité-là.
    assert(
      got.targetKcal !== null && got.capGrams <= got.targetKcal / MEAL_KCAL_PER_G_FLOOR + 1,
      `${mouth.memberId}: le plafond d'un repas (${got.capGrams} g) porte plus que sa cible au plancher`,
    );
    assertEquals(got.capBit, "density_floor");
  }
  // ⛔ ET L'IKU RÉEL DU 2026-08-20 — 73 kg, entretien, un dîner — reste loin du
  // 1 232 g vu à l'écran. Ce n'est pas l'IKU en prise de masse de la fixture
  // (3 925 kcal sur trois moments, qui PÈSE ce qu'il pèse), c'est le corps
  // qui a produit le défaut.
  const ikuMaint: AnchorMouth = { ...IKU, direction: null, paceKgPerWeek: null };
  const dinner = anchorFactorFor(
    ikuMaint,
    day({ memberId: "m_iku", kcal: 200, grams: 1200, maxMealGrams: 1200, slots: ["breakfast", "lunch", "dinner"], ownSlots: ["dinner"] }),
    "no_position",
  );
  const dinnerServed = 1200 * dinner.factor;
  // Un entretien de ~3 570 kcal (187 cm, 73 kg, `trains_hard`) met ~1 250 kcal
  // au dîner, soit ~925 g à 1,35 kcal/g: c'est ce que PÈSE ce besoin, et le
  // plafond le dit. Le 1 232 g d'origine portait la masse d'une JOURNÉE dans
  // un dîner; il reste refusé, et la réparation d'un dîner de 925 g est de
  // composer plus dense, pas de servir moins.
  assert(dinner.capGrams !== null && dinner.targetKcal !== null);
  assert(dinnerServed <= dinner.capGrams + 1, `le dîner d'iku (${Math.round(dinnerServed)} g) dépasse son plafond (${dinner.capGrams} g)`);
  // À 0,17 kcal/g : le plancher de densité borne (cible / 0,8), et le dîner reste sous 1,2 kg.
  assertEquals(dinner.capGrams, Math.round(dinner.targetKcal / MEAL_KCAL_PER_G_FLOOR));
  // ⟳ ARBITRAGE 1 : la borne n'est plus « 1,2 kg », c'est « jamais plus que sa
  // cible au plancher de densité » — un plat à 0,17 kcal/g ne se répare pas en
  // grossissant, et le plancher le tient là.
  assert(
    dinnerServed <= dinner.targetKcal / MEAL_KCAL_PER_G_FLOOR + 1,
    `le dîner d'iku pèse ${Math.round(dinnerServed)} g pour une cible de ${dinner.targetKcal} kcal au plancher ${MEAL_KCAL_PER_G_FLOOR}`,
  );
});

Deno.test("⛔ ⟳ 2026-09-04 — une ENFANT de 36 kg qui s'entraîne ne perd plus sa boîte au kilo", () => {
  // MESURÉ SUR `qa-mois-20260904`: Léa, 12 ans, 36 kg, `trains_hard`. Le modèle
  // avait écrit 500 g pour son dîner; `8 g/kg` faisait 288 g; le moteur a
  // RÉDUIT la boîte à 300 g, puis compté qu'elle manque de ≥ 200 kcal. Il
  // créait le manque qu'il rapportait — `anchored: 0`, `clamped: 5/5`.
  const LEA: AnchorMouth = {
    memberId: "m_lea",
    ageState: "minor",
    restriction: "no_account",
    body: {
      appetite: null,
      heightCm: 145,
      weightKg: 36,
      gender: "female",
      ageYears: 12,
      activityLevel: "trains_hard",
      activityAxes: { day: null, sport: null, asked: false },
    },
    direction: null,
    paceKgPerWeek: null,
    conditionRefs: [],
    declaredSlots: ["breakfast", "lunch", "dinner"],
    slotExtraKcal: null,
  };
  // Un dîner de 500 g peu dense (1,0 kcal/g): 500 kcal livrées à sa seule boîte.
  const got = anchorFactorFor(
    LEA,
    day({ memberId: "m_lea", kcal: 500, grams: 500, maxMealGrams: 500, slots: ["dinner"], ownSlots: ["dinner"] }),
    "no_position",
  );
  assert(got.targetKcal !== null && got.targetKcal > 0, JSON.stringify(got));
  assert(got.capGrams !== null, "aucun plafond rendu");
  // ⛔ LA MUTATION QUI COMPTE: revenir à `8 g/kg` rend 288 g, et ce test rougit.
  assert(
    got.capGrams > MEAL_MAX_GRAMS_PER_KG * 36,
    `le plafond est retombé au kilo: ${got.capGrams} g pour 36 kg`,
  );
  // Le plafond est la cible du repas à la densité d'un plat ordinaire.
  // ⟳ ARBITRAGE 1 (2026-09-06) : son assiette pèse 1,0 kcal/g → le plafond suit
  // CETTE densité (cible / 1,0), plus large qu'à 1,35, et toujours pas le kilo.
  assertEquals(got.capGrams, Math.round(got.targetKcal / 1.0));
  assert(got.capGrams > Math.round(got.targetKcal / MEAL_KCAL_PER_G_COMPOSED));
  // Et la boîte de 500 g n'est plus RÉDUITE: le facteur ne descend pas sous 1.
  assert(got.factor >= 1, `la boîte d'une enfant est encore rabotée: ×${got.factor}`);
});

Deno.test("⟳ le plat composé PORTE son repas entier — sauf ce qui est DÉCLARÉ à côté", () => {
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
  // ⟳ 2026-09-04 — LA PRÉMISSE DE CE TEST EST RENVERSÉE, ET C'EST LA DÉCISION.
  // Il vérifiait que le plat porte MOINS que le repas (le retrait supposé de
  // 58 %). Le propriétaire a tranché: **rien d'indiqué, rien de retiré** — le
  // plat porte donc son repas ENTIER.
  //
  // ⚠️ CE QUI SURVIT DU TEST D'ORIGINE, ET C'EST L'ESSENTIEL: la cible reste
  // sous celle de la JOURNÉE. CHR ne compose que son dîner; lui demander sa
  // journée entière rendrait le 6,28 de Christèle — l'assiette de deux kilos.
  // La réduction par MOMENT tient, seule la réduction par EXTRAS a disparu.
  const wholeMeal = target * dayCoverageOf(CHR.declaredSlots, ["dinner"]);
  assertEquals(got.targetKcal, Math.round(wholeMeal * EXTRA_SLOT_SHARE));
  assert(got.targetKcal! < target, `${got.targetKcal} >= ${target}`);

  // ⛔ ET LA CONTRE-ÉPREUVE: une fiche qui DÉCLARE du pain le voit retiré. Sans
  // elle, « rien de retiré » se lirait « les extras n'existent plus ».
  const withBread = anchorFactorFor(
    { ...CHR, slotExtraKcal: { dinner: 111 } },
    day({ memberId: "m_chr", kcal: 400, slots: ["dinner"], maxMealGrams: 150 }),
    "no_position",
  );
  assertEquals(withBread.targetKcal, Math.round(wholeMeal) - 111);
});

// ---------------------------------------------------------------------------
// ① CE QU'ON PREND À CÔTÉ DU PLAT — ⟳ RÉÉCRIT LE 2026-09-01
//
// ⛔ QUATRE CAS ONT DISPARU D'ICI, ET AUCUN N'A ÉTÉ « ADAPTÉ ». Ils
// mesuraient `composedDishShare`, qui n'existe plus:
//
//   · « la part est CALCULÉE depuis la convention » — la convention
//     (300/120/120/80) est morte; les forfaits viennent de CIQUAL. Son
//     successeur est `meal_extras_test.ts :: « les cinq extras se résolvent »`.
//   · « la moyenne se trompe dans les DEUX sens » — c'est ce défaut-là que le
//     lot ferme pour de bon: il n'y a plus de moyenne du tout, il y a des kcal
//     lus par aliment.
//   · « le repli est neutre au bit près » — devenu
//     `meal_extras_test.ts :: « le repli de la fiche muette n'est pas zéro »`,
//     plus `EXTRA_SLOT_SHARE` ci-dessus, qui prouve le +0 % sur un moment seul.
//   · « `false` EST UNE RÉPONSE » — la distinction survit, sous une autre
//     forme: clé ABSENTE contre clé à `0`. Elle est testée juste en dessous.
//
// Ce qui reste ici est ce qui appartient à l'ANCRAGE: les quatre états, et le
// fait que la réponse atteigne vraiment le facteur.
// ---------------------------------------------------------------------------

Deno.test("⛔ ① QUATRE ÉTATS, PAS DEUX — `not_asked` ≠ `not_answered`", () => {
  // ⚠️ LE SUJET A CHANGÉ, LE VOCABULAIRE NON. Ces états comptaient trois CASES
  // par personne; ils comptent les deux MOMENTS qui portent des extras. Garder
  // les mêmes mots est ce qui rend les colonnes d'avant et d'après comparables.
  assertEquals(mealStructureState(null), "not_asked");
  assertEquals(mealStructureState({}), "not_answered");
  assertEquals(mealStructureState({ lunch: 0 }), "partial");
  assertEquals(mealStructureState({ lunch: 0, dinner: 0 }), "answered");
  // ⛔ UN MOMENT QUI NE PORTE PAS D'EXTRAS NE COMPTE PAS COMME UNE RÉPONSE.
  // Sans ça, renseigner son petit-déjeuner ferait passer la fiche pour
  // « répondue » sur des questions qu'on ne lui a jamais posées.
  assertEquals(mealStructureState({ breakfast: 0 }), "not_answered");
});

Deno.test("⟳ ① LE SILENCE ET « RIEN À CÔTÉ » DONNENT LA MÊME CIBLE — mais restent DISTINCTS", () => {
  // ⟳ 2026-09-04 — CE TEST EST LE RENVERSEMENT DE CELUI D'AVANT. Il épinglait
  // « une clé absente n'est pas une clé à zéro » et vérifiait que le silence
  // rendait une cible PLUS BASSE (le retrait supposé de 58 %).
  //
  // ⛔ DÉCISION DU PROPRIÉTAIRE: rien d'indiqué ⇒ rien de retiré. Les deux
  // fiches reçoivent donc la MÊME cible — le plat porte son repas entier dans
  // les deux cas.
  //
  // ⚠️ MAIS ELLES NE SE CONFONDENT PAS POUR AUTANT, et c'est ce que ce test
  // garde: `structureState` continue de distinguer « on ne lui a pas demandé »
  // de « elle a répondu rien ». Le jour où quelqu'un voudra reposer la question
  // aux fiches muettes, c'est ce compteur qui dira à qui.
  const d = day({ memberId: IKU.memberId, kcal: 700, maxMealGrams: 0 });
  const silent = anchorFactorFor({ ...IKU, slotExtraKcal: {} }, d, "no_position");
  const saidNone = anchorFactorFor(
    { ...IKU, slotExtraKcal: { lunch: 0, dinner: 0 } },
    d,
    "no_position",
  );
  assertEquals(silent.structureState, "not_answered");
  assertEquals(saidNone.structureState, "answered");
  // La cible est la même: le silence ne retire plus rien.
  assertEquals(saidNone.targetKcal, silent.targetKcal);
});

Deno.test("⛔ ① LA RÉPONSE ATTEINT VRAIMENT LE FACTEUR ET LA CIBLE", () => {
  // Un lot construit et non branché rend le même nombre qu'avant. On mesure la
  // sortie d'`anchorFactorFor`, pas la table.
  const d = day({ memberId: IKU.memberId, kcal: 700, maxMealGrams: 0 });
  const before = anchorFactorFor(IKU, d, "no_position");
  const after = anchorFactorFor(
    // Du pain aux deux repas, chiffré: ~111 kcal la portion de 40 g.
    { ...IKU, slotExtraKcal: { lunch: 111, dinner: 111 } },
    d,
    "no_position",
  );
  assertEquals(before.structureState, "not_asked");
  assertEquals(after.structureState, "answered");
  // ⟳ 2026-09-04 — LE SENS S'EST INVERSÉ, ET C'EST LE LOT. Avant, une fiche
  // muette se voyait retirer 58 % et déclarer du pain FAISAIT MONTER sa cible
  // (111 kcal, c'est bien moins que 58 %). Maintenant le silence ne retire
  // RIEN, donc déclarer du pain fait DESCENDRE la cible — de très exactement
  // ce que le pain pèse.
  //
  // ⚠️ C'EST LA SEULE DIRECTION HONNÊTE: une réponse ne doit jamais rapporter
  // plus à manger que le silence. Sinon répondre devient une punition, et
  // personne ne répond.
  assert(after.raw! < before.raw!, "la réponse n'atteint pas le facteur");
  assert(after.targetKcal! < before.targetKcal!, "la cible rendue n'a pas suivi");
});

Deno.test("⛔ ① LE MOMENT COMPTE — quand le plan n'en compose qu'un", () => {
  // ⚠️ MA PREMIÈRE RÉDACTION NE DISCRIMINAIT RIEN, et le rouge me l'a appris:
  // comparer {midi:300, soir:0} à {midi:0, soir:300} sur une journée où les
  // DEUX sont composés rend le même total — 300 kcal de pain sont 300 kcal, où
  // qu'on les mette. Une déduction absolue ne dépend pas du poids du moment.
  //
  // Ce que la granularité par moment change vraiment, c'est QUELS repas sont
  // touchés. On compose donc UN seul des deux.
  const dinnerDay = day({
    memberId: IKU.memberId,
    kcal: 700,
    slots: ["dinner"],
    maxMealGrams: 0,
  });
  const onDinner = anchorFactorFor(
    { ...IKU, slotExtraKcal: { lunch: 0, dinner: 300 } },
    dinnerDay,
    "no_position",
  );
  const onLunch = anchorFactorFor(
    { ...IKU, slotExtraKcal: { lunch: 300, dinner: 0 } },
    dinnerDay,
    "no_position",
  );
  // ⛔ LE PAIN DU MIDI NE DOIT PAS RÉDUIRE UN DÎNER. C'est très exactement ce
  // qu'aucune version d'avant ne savait exprimer: la question ne disait pas de
  // quel repas elle parlait, et son ratio les touchait tous.
  assert(
    onLunch.targetKcal! > onDinner.targetKcal!,
    `midi ${onLunch.targetKcal} devrait dépasser soir ${onDinner.targetKcal}`,
  );
  // Et le midi non composé n'est retranché de rien: sa cible est celle d'une
  // fiche qui ne prend rien à côté.
  const none = anchorFactorFor(
    { ...IKU, slotExtraKcal: { lunch: 0, dinner: 0 } },
    dinnerDay,
    "no_position",
  );
  assertEquals(onLunch.targetKcal, none.targetKcal);
});

Deno.test("⛔ ① LE PLANCHER MORD, ET IL EST NOMMÉ", () => {
  // Cinq extras sur une petite cible rendraient la part du plat négative — une
  // assiette vide servie comme une décision. L'ancien ratio ne pouvait pas
  // descendre sous 0,48 par construction; une somme de forfaits, si.
  const d = day({ memberId: IKU.memberId, kcal: 700, maxMealGrams: 0 });
  const absurd = anchorFactorFor(
    { ...IKU, slotExtraKcal: { lunch: 99999, dinner: 99999 } },
    d,
    "no_position",
  );
  assert(absurd.targetKcal! > 0, `cible ${absurd.targetKcal}`);
  // Le plat garde au moins 30 % de chacun de ses deux repas.
  const target = mouthTargetKcal(IKU, "no_position").kcal!;
  const floor = target * (0.25 + (0.40 + 0.35) * COMPOSED_DISH_MIN_MEAL_SHARE);
  assertEquals(absurd.targetKcal, Math.round(floor));
});

Deno.test("① le motif de structure est rendu MÊME quand rien n'est ancré", () => {
  // Un compteur qui ne parlerait que sur les journées ancrées ferait lire
  // « personne n'a répondu » sur un foyer où tout le monde a répondu et où
  // chaque journée est incomplète.
  const answered = { ...CHR, slotExtraKcal: { lunch: 120, dinner: 120 } };
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

// ===========================================================================
// LES SIX MOMENTS PÈSENT — LOT A, 2026-09-01
//
// ⛔ CE QUE CE BLOC RÉPARE N'ÉTAIT VISIBLE NULLE PART. `SLOT_DAY_WEIGHT` ne
// portait que `breakfast`, `lunch` et `dinner`; les trois collations tombaient
// sur le `?? 0` de `dayCoverageOf`. Zéro n'est pas neutre ici: l'énergie d'une
// habitude composée à l'après-midi entre au DÉNOMINATEUR du facteur
// (`day.kcal`) en comptant pour rien au NUMÉRATEUR. Le facteur rétrécit
// systématiquement, la personne reçoit moins, et aucun test ne bougeait.
// ===========================================================================

Deno.test("⚠️ AUCUNE RÉGRESSION — les trois repas rendent EXACTEMENT ce qu'avant", () => {
  // ⛔ CE CAS PASSE EN PREMIER, ET C'EST DÉLIBÉRÉ. Le lot ajoute quatre poids;
  // s'il déplaçait d'un cheveu la couverture de qui n'a déclaré que les trois
  // repas, il déplacerait des grammes dans toutes les assiettes du parc.
  //
  // Les valeurs attendues sont des LITTÉRAUX, jamais dérivées de
  // `SLOT_DAY_WEIGHT`: un test paramétré par la table qu'il vérifie resterait
  // vert quand on la change.
  assertEquals(dayCoverageOf([], ["breakfast", "lunch", "dinner"]), 1);
  assertEquals(dayCoverageOf(["lunch", "dinner"], ["lunch", "dinner"]), 1);
  // 0,35 / (0,40 + 0,35) — le « half » du test historique, chiffré.
  assertEquals(
    Number(dayCoverageOf(["lunch", "dinner"], ["dinner"]).toFixed(6)),
    Number((0.35 / 0.75).toFixed(6)),
  );
  // 0,25 / (0,25 + 0,40 + 0,35)
  assertEquals(
    dayCoverageOf(["breakfast", "lunch", "dinner"], ["breakfast"]),
    0.25,
  );
});

Deno.test("⛔ RIEN DE DÉCLARÉ VAUT TROIS MOMENTS, PAS TOUTE LA TABLE", () => {
  // ⚠️ LE PIÈGE DE CE LOT, ET IL A FAILLI PASSER. `dayCoverageOf` lisait
  // `Object.keys(SLOT_DAY_WEIGHT)` comme repli — juste TANT QUE la table ne
  // portait que trois moments. À sept clés, le total serait passé de 1,00 à
  // 1,30 et la couverture de TOUTE la population muette de 1 à 0,77: 23 % de
  // part en moins, en silence.
  assertEquals(dayCoverageOf([], ["breakfast", "lunch", "dinner"]), 1);
  // Et un moment composé hors des trois est bien AJOUTÉ au total, lui.
  const withSnack = dayCoverageOf([], ["breakfast", "lunch", "dinner", "snack_pm"]);
  assertEquals(withSnack, 1);
});

Deno.test("⛔ UNE COLLATION DÉCLARÉE ET NON COMPOSÉE RÉDUIT LA CIBLE", () => {
  // Le cas que le lot répare. Avant: `snack_pm` pesait 0, donc le total valait
  // 0,40 et la couverture 1 — on demandait à un seul déjeuner de porter une
  // journée qui compte aussi un goûter.
  //
  // Après: 0,40 / (0,40 + 0,10) = 0,80.
  assertEquals(dayCoverageOf(["lunch", "snack_pm"], ["lunch"]), 0.8);
  // Et composer les deux rend bien la journée entière.
  assertEquals(dayCoverageOf(["lunch", "snack_pm"], ["lunch", "snack_pm"]), 1);
});

Deno.test("le jeton LEGACY `snack` pèse comme une collation", () => {
  // ⚠️ IL ARRIVE DEPUIS LA BASE, PAS DU MODÈLE. `dish.slot` est validé contre
  // `MEAL_SLOTS`, qui porte `snack` pour la donnée ancienne. Sans poids, il
  // rejouait le même défaut sur les plans déjà écrits.
  //
  // ⛔ ET ON NE DEVINE PAS SON MOMENT: il pèse ce que pèse une collation, on
  // n'affirme pas qu'il est du matin ou de l'après-midi.
  assertEquals(dayCoverageOf(["lunch", "snack"], ["lunch"]), 0.8);
});

Deno.test("⛔ LA TABLE COUVRE EXACTEMENT LE VOCABULAIRE D'UN PLAT", () => {
  // ⚠️ MIROIR, PAS IMPORT: `mouth_anchor.ts` ne tire pas les sept mille lignes
  // de `meal_generation.ts` pour une liste de sept mots. C'est CE test qui
  // empêche les deux de diverger — l'idiome de `meal_plan_window.ts`.
  //
  // Un septième moment ajouté à `MEAL_SLOTS` sans son poids tombe ici, et pas
  // dans une assiette.
  assertEquals(
    [...WEIGHTED_SLOT_TOKENS].sort(),
    [...MEAL_SLOTS].sort(),
  );
  // Et chacun porte un poids STRICTEMENT positif: un zéro serait le défaut
  // qu'on vient de fermer, réintroduit par la porte du type.
  for (const slot of WEIGHTED_SLOT_TOKENS) {
    const w = SLOT_DAY_WEIGHT[slot as keyof typeof SLOT_DAY_WEIGHT];
    assert(w > 0, `${slot} pèse ${w}`);
  }
});

// ===========================================================================
// LE PLANCHER DU PLAT SE COMPTE — il ne se devine pas
//
// ⛔ POURQUOI UN COMPTEUR SUR UNE BORNE. `COMPOSED_DISH_MIN_MEAL_SHARE = 0,30`
// existe pour un cas absurde: cinq extras sur une petite cible laisseraient au
// plat une cuillère servie comme un repas. Mais une borne qui mordrait sur la
// population entière ne serait plus une borne — ce serait LE calcul, et rien
// ne le dirait. `ANCHOR_FACTOR_MAX` et `BOX_FACTOR_MIN` ont déjà coûté ça deux
// fois à ce dépôt.
// ===========================================================================

Deno.test("⛔ LE PLANCHER SE DIT quand il mord, et se tait quand il ne mord pas", () => {
  const avec = (lunch: number): AnchorMouth => ({
    ...IKU,
    declaredSlots: ["lunch", "dinner"],
    slotExtraKcal: { lunch, dinner: 0 },
  });
  const journee = day({
    memberId: "m_iku",
    kcal: 1400,
    slots: ["lunch", "dinner"],
  });
  // ⚠️ LE CAS QUI PASSE D'ABORD. Un forfait ordinaire ne touche pas la borne;
  // sans lui, un `extrasFloored` toujours vrai serait vert.
  // ⚠️ ON NE MESURE PAS `reason` ICI: le plafond de vraisemblance PHYSIQUE
  // mord sur ce banc (250 g de part max), et il n'a rien à voir avec le
  // plancher du plat. Deux bornes, deux mesures.
  const ordinaire = anchorFactorFor(avec(150), journee, "no_position");
  assertEquals(ordinaire.extrasFloored, false);
  // Et le cas absurde: un forfait qui dépasse 70 % du repas est raboté, DIT.
  const absurde = anchorFactorFor(avec(100_000), journee, "no_position");
  assertEquals(absurde.extrasFloored, true);
  // ⛔ ET LE RABOTAGE A UN EFFET: sans lui la cible serait négative. La borne
  // n'est pas décorative — elle décide d'un facteur.
  assert((absurde.targetKcal ?? 0) > 0, `cible ${absurde.targetKcal}`);
});

Deno.test("une sortie sans journée ne prétend pas avoir raboté", () => {
  // `extrasFloored` dit ce que le CALCUL a fait, pas ce que la fiche porte —
  // l'écart exact avec `structureState`, qui se rend sur toutes les sorties.
  const sansJour = anchorFactorFor(
    { ...IKU, declaredSlots: ["lunch"], slotExtraKcal: { lunch: 100_000 } },
    null,
    "no_position",
  );
  assertEquals(sansJour.extrasFloored, false);
  assertEquals(sansJour.structureState, "partial");
});

// ---------------------------------------------------------------------------
// ⟳ ARBITRAGE 1 (2026-09-06) — LE PLAFOND DE MASSE SUIT LA DENSITÉ MESURÉE
// ---------------------------------------------------------------------------
//
// Avant : `capGrams = cible du repas / 1,35`. Sur C03, la boîte de Paul pesait
// exactement 880 / 1,35 = 652 g et portait 386 kcal — le plafond créait le
// manque qu'il rapportait. Ces tests tiennent la règle et son compteur ; les
// deux tests « le 1,2 kg est mort » et « une ENFANT de 36 kg » au-dessus
// tiennent que le kilo ne revient pas.

import { MEAL_CAP_BITS, mealMassCapFor } from "./mouth_anchor.ts";

Deno.test("ARBITRAGE 1 — une assiette moins dense qu'un plat ordinaire PEUT peser plus : le plafond suit sa densité mesurée", () => {
  // 500 g livrés pour 550 kcal = 1,1 kcal/g, un seul moment à son nom.
  const got = anchorFactorFor(
    IKU,
    day({ memberId: "m_iku", kcal: 550, grams: 500, maxMealGrams: 500, slots: ["dinner"], ownSlots: ["dinner"] }),
    "no_position",
  );
  assert(Math.abs(got.capGrams! - got.targetKcal! / 1.1) <= 1, `${got.capGrams} vs ${got.targetKcal! / 1.1}`);
  assert(got.capGrams! > got.targetKcal! / MEAL_KCAL_PER_G_COMPOSED, "plus de grammes qu'à 1,35");
  // Sur une journée à un repas, plafond et cible coïncident : seul le rabot ×3 a pu mordre.
  assert(got.capBit === "none" || got.capBit === "factor_bound", got.capBit);
  assert((MEAL_CAP_BITS as readonly string[]).includes(got.capBit));
});

Deno.test("ARBITRAGE 1 — sur deux repas inégaux, le plus gros est borné à sa part, et ça se compte `density`", () => {
  const got = anchorFactorFor(
    IKU,
    day({ memberId: "m_iku", kcal: 550, grams: 500, maxMealGrams: 450, slots: ["breakfast", "dinner"], ownSlots: ["breakfast", "dinner"] }),
    "no_position",
  );
  assertEquals(got.capBit, "density");
  assert(got.factor < got.raw!, `${got.factor} devrait être sous ${got.raw}`);
  assertEquals(got.reason, "clamped");
});

Deno.test("ARBITRAGE 1 — une assiette à 0,2 kcal/g ne devient pas un seau : le PLANCHER de densité borne, et ça se compte", () => {
  const got = anchorFactorFor(
    IKU,
    day({ memberId: "m_iku", kcal: 100, grams: 500, maxMealGrams: 500, slots: ["dinner"], ownSlots: ["dinner"] }),
    "no_position",
  );
  assertEquals(got.capBit, "density_floor");
  assert(Math.abs(got.capGrams! - got.targetKcal! / MEAL_KCAL_PER_G_FLOOR) <= 1, `${got.capGrams} vs ${got.targetKcal! / MEAL_KCAL_PER_G_FLOOR}`);
  assert(got.factor < got.raw!);
});

Deno.test("ARBITRAGE 1 — plus dense que 1,35 n'est JAMAIS borné plus serré qu'hier ; sans grammes, 1,35 reste et se nomme", () => {
  // 2 kcal/g : le plafond reste celui de 1,35 (garde de volume, pas dosage).
  const dense = mealMassCapFor({ mealKcal: 810, deliveredKcal: 1000, deliveredGrams: 500 });
  assertEquals(Math.round(dense.grams!), 600);
  assertEquals(dense.source, "density");
  const blind = mealMassCapFor({ mealKcal: 810, deliveredKcal: 300, deliveredGrams: 0 });
  assertEquals(blind.source, "assumed_density");
  assertEquals(Math.round(blind.grams!), 600);
  // Et la MUTATION évidente — remettre 8 g/kg — casserait « une ENFANT de 36 kg » plus haut.
});

Deno.test("épinglage — MEAL_KCAL_PER_G_FLOOR vaut 1,0 (sous quoi une assiette se densifie au lieu de grossir)", () => {
  assertEquals(MEAL_KCAL_PER_G_FLOOR, 1.0);
});


// ===========================================================================
// ⟳ 2026-09-06 — UN MOMENT PERDU PAR LA LIGNE GARDE SA PART DANS LA CIBLE
// ===========================================================================

Deno.test("⛔ un moment perdu par la ligne ne rétrécit pas la journée: sa part est REDEMANDÉE aux boîtes restantes", () => {
  // Mesuré FB3: Nora (végane) sans son yaourt de soja perd le petit-déjeuner,
  // et sa cible suit `ownSlots` — 44 % de sa cible sans qu'un compteur bouge.
  const d = day({ memberId: IKU.memberId, slots: ["dinner", "lunch"], ownSlots: ["dinner", "lunch"], kcal: 1200 });
  const without = anchorFactorFor(IKU, d, "no_position");
  const withLost = anchorFactorFor(IKU, d, "no_position", 500);
  assert(without.raw !== null && withLost.raw !== null);
  assertEquals(withLost.lostLineKcal, 500);
  assertEquals(without.lostLineKcal, 0);
  assertEquals(withLost.targetKcal, (without.targetKcal ?? 0) + 500);
  assert(withLost.raw > without.raw, "la part perdue n'est pas redemandée");
  // 0, négatif, NaN: comportement d'avant, à l'identique.
  for (const z of [0, -50, Number.NaN]) {
    const same = anchorFactorFor(IKU, d, "no_position", z);
    assertEquals(same.raw, without.raw);
    assertEquals(same.lostLineKcal, 0);
  }
});

Deno.test("householdAnchors passe les kcal perdus par clé `<memberId> <day>`, et rien aux autres", () => {
  const d1 = day({ memberId: IKU.memberId, day: "thu", slots: ["dinner"], ownSlots: ["dinner"], kcal: 700 });
  const d2 = day({ memberId: IKU.memberId, day: "fri", slots: ["dinner"], ownSlots: ["dinner"], kcal: 700 });
  const out = householdAnchors([IKU], [d1, d2], "no_position", new Map([[`${IKU.memberId} thu`, 400]]));
  assertEquals(out.get(`${IKU.memberId} thu`)?.lostLineKcal, 400);
  assertEquals(out.get(`${IKU.memberId} fri`)?.lostLineKcal, 0);
  assert((out.get(`${IKU.memberId} thu`)?.raw ?? 0) > (out.get(`${IKU.memberId} fri`)?.raw ?? 0));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-06 — ARBITRAGE 3 : la note datée grossit la cible du jour d'un cran fixe
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("une note datée grossit la cible du jour de DATED_NOTE_BOOST, et l'ancre suit", () => {
  const plain = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 2000 }), "no_position");
  const boosted = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 2000 }), "no_position", 0, DATED_NOTE_BOOST);
  assert(fired(plain.reason) && fired(boosted.reason), `${plain.reason} / ${boosted.reason}`);
  assertEquals(boosted.noteBoost, DATED_NOTE_BOOST);
  assertEquals(plain.noteBoost, 0);
  const ratio = boosted.targetKcal! / plain.targetKcal!;
  assert(Math.abs(ratio - (1 + DATED_NOTE_BOOST)) < 0.01, `cible ×${ratio.toFixed(3)}, attendu ×${1 + DATED_NOTE_BOOST}`);
  assert(boosted.raw! > plain.raw!, "le facteur brut ne suit pas la cible grossie");
});

Deno.test("la fraction est FIXE : le quart est une décision, pas un calcul (2026-09-05, arbitrage 3)", () => {
  assertEquals(DATED_NOTE_BOOST, 0.25);
});

Deno.test("la note datée s'ajoute AVANT les kcal perdus par la ligne, qui restent tels quels", () => {
  const a = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 2000 }), "no_position", 300, 0);
  const b = anchorFactorFor(IKU, day({ memberId: "m_iku", kcal: 2000 }), "no_position", 300, DATED_NOTE_BOOST);
  assertEquals(b.lostLineKcal, 300);
  assert(Math.abs((b.targetKcal! - 300) - (a.targetKcal! - 300) * (1 + DATED_NOTE_BOOST)) < 2, `${a.targetKcal} → ${b.targetKcal}`);
});

Deno.test("householdAnchors porte la note par (bouche, jour) et rien d'autre", () => {
  const days = [day({ memberId: "m_iku", day: "tue", kcal: 2000 }), day({ memberId: "m_iku", day: "wed", kcal: 2000 })];
  const got = householdAnchors([IKU], days, "no_position", new Map(), new Map([["m_iku tue", DATED_NOTE_BOOST]]));
  assertEquals(got.get("m_iku tue")!.noteBoost, DATED_NOTE_BOOST);
  assertEquals(got.get("m_iku wed")!.noteBoost, 0);
  assert(got.get("m_iku tue")!.targetKcal! > got.get("m_iku wed")!.targetKcal!);
});

Deno.test("CÂBLAGE — la lane foyer lit la note datée d'une bouche et la passe à l'ancre", async () => {
  const src = await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  const at = src.indexOf("const noteBoostByKey = new Map<string, number>();");
  assert(at > -1, "la lane foyer ne construit plus la note datée par (bouche, jour)");
  const block = src.slice(at, src.indexOf("const anchors = householdAnchors(", at));
  assert(/memoFrom\(memoConstraints\)/.test(block), "la note datée ne vient plus des mémos de la fiche");
  assert(/when\?\.weekday/.test(block), "le jour de la note n'est plus lu sur `when.weekday`");
  assert(/DATED_NOTE_BOOST/.test(block), "la fraction n'est plus la constante arbitrée");
  assert(/householdAnchors\(anchorMouthList, dayEnergy, coachCounting, lostLineKcalByKey, noteBoostByKey\)/.test(src), "la note n'atteint plus `householdAnchors`");
  assertEquals((src.match(/note_boost: noteBoost,/g) || []).length, 2, "`note_boost` absent du journal ou de l'archive");
});
