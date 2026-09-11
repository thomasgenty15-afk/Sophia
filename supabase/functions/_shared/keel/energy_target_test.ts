// FF-059 LOT 3 — LA CIBLE. Ce que ces tests protègent, dans l'ordre de ce que
// ça coûte quand ça casse:
//
//   * LE POINT À LA PLACE DE LA FOURCHETTE — c'est la forme qui décide si un
//     chiffre devient un objectif. Personne ne « rate » un intervalle de 400
//     kcal; tout le monde rate un nombre;
//   * LE DÉFICIT DÉRIVÉ — cette fourchette est une MAINTENANCE. En tirer une
//     cible d'amaigrissement serait prescrire un régime chiffré à quelqu'un que
//     personne n'a examiné;
//   * LE FACTEUR D'ACTIVITÉ INVENTÉ — le rabbit hole nommé par la fiche. Un
//     test lit la source et refuse `estimatedMaintenanceKcal` ici;
//   * LES DEUX COPIES DES CONSTANTES — le front sert la même fourchette au
//     coach depuis toujours. Un test LIT son fichier et refuse le désaccord.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ACTIVITY_LEVELS } from "./tokens.ts";

import {
  directedRange,
  ENERGY_TARGET_BASIS,
  ENERGY_TARGET_BASIS_DIRECTED,
  MAINTENANCE_KCAL_PER_KG_HIGH,
  MAINTENANCE_KCAL_PER_KG_LOW,
  maintenanceRange,
  TARGET_DIRECTION_GAPS,
  TARGET_GAPS,
  TARGET_WEIGHT_KG_MAX,
  TARGET_WEIGHT_KG_MIN,
} from "./energy_target.ts";
import { canShowEnergy, canShowTarget } from "./energy_gate.ts";
import { assessBirthDate } from "./student_age.ts";

const TODAY = "2026-08-12";

// ---------------------------------------------------------------------------
// L'ARITHMÉTIQUE
// ---------------------------------------------------------------------------

Deno.test("FF-059 lot 3 — la fourchette, calculée à la main", () => {
  // 75 kg → 28 × 75 = 2100 · 33 × 75 = 2475 → arrondi aux 50 → 2100 – 2500.
  const t = maintenanceRange({ activityLevel: null, weightKg: 75, weightWeekStart: "2026-08-10" });
  assertEquals(t.range, { low: 2100, high: 2500 });
  assertEquals(t.basis, ENERGY_TARGET_BASIS);
  assertEquals(t.gap, null);
  assertEquals(t.weightKg, 75);
  assertEquals(t.weightWeekStart, "2026-08-10");
});

Deno.test("FF-059 lot 3 — c'est TOUJOURS une fourchette, jamais un point", () => {
  // La propriété qui décide si ce chiffre devient un objectif. Sur toute la
  // plage plausible, le haut est strictement au-dessus du bas — il n'existe
  // aucun poids où les deux se rejoignent et où la cible deviendrait un nombre.
  for (let w = TARGET_WEIGHT_KG_MIN; w <= TARGET_WEIGHT_KG_MAX; w += 1) {
    const t = maintenanceRange({ activityLevel: null, weightKg: w, weightWeekStart: null });
    assert(t.range !== null, `${w} kg n'a pas de fourchette`);
    assert(
      t.range.high > t.range.low,
      `${w} kg rend un POINT: ${t.range.low}–${t.range.high}`,
    );
  }
});

Deno.test("FF-059 lot 3 — arrondie aux 50, parce que la précision serait fausse", () => {
  const t = maintenanceRange({ activityLevel: null, weightKg: 68.4, weightWeekStart: null });
  // 28 × 68,4 = 1915,2 → 1900 ; 33 × 68,4 = 2257,2 → 2250.
  assertEquals(t.range, { low: 1900, high: 2250 });
  assertEquals(t.range!.low % 50, 0);
  assertEquals(t.range!.high % 50, 0);
});

// ---------------------------------------------------------------------------
// LES ABSTENTIONS
// ---------------------------------------------------------------------------

Deno.test("FF-059 lot 3 — sans pesée, pas de cible, et le motif le dit", () => {
  for (const weightKg of [null, 0, -5, Number.NaN]) {
    const t = maintenanceRange({ activityLevel: null, weightKg, weightWeekStart: null });
    assertEquals(t.range, null, String(weightKg));
    assertEquals(t.gap, "no_weight", String(weightKg));
    // ⚠️ Même sans cible, la base est là: un champ qui ne porterait sa base que
    // quand il porte un chiffre laisserait une forme sans base dans le produit.
    assertEquals(t.basis, ENERGY_TARGET_BASIS);
  }
});

Deno.test("FF-059 lot 3 — une pesée ABERRANTE se distingue d'une pesée absente", () => {
  // Les deux se réparent ailleurs: l'une demande une saisie, l'autre une
  // CORRECTION. Un motif unique ferait redemander son poids à quelqu'un qui
  // vient de taper 500.
  for (const weightKg of [TARGET_WEIGHT_KG_MIN - 1, TARGET_WEIGHT_KG_MAX + 1, 500]) {
    const t = maintenanceRange({ activityLevel: null, weightKg, weightWeekStart: null });
    assertEquals(t.range, null);
    assertEquals(t.gap, "implausible_weight");
  }
  // Prémisse fausse: les bornes elles-mêmes PASSENT.
  for (const weightKg of [TARGET_WEIGHT_KG_MIN, TARGET_WEIGHT_KG_MAX]) {
    assert(maintenanceRange({ activityLevel: null, weightKg, weightWeekStart: null }).range !== null);
  }
});

Deno.test("FF-059 lot 3 — les deux motifs sont atteignables, et il n'y en a que deux", () => {
  const seen = new Set<string>();
  for (const weightKg of [null, 500]) {
    seen.add(maintenanceRange({ activityLevel: null, weightKg, weightWeekStart: null }).gap!);
  }
  assertEquals([...seen].sort(), [...TARGET_GAPS].sort());
});

// ---------------------------------------------------------------------------
// LA CINQUIÈME PORTE
// ---------------------------------------------------------------------------

const ADULT = assessBirthDate("1990-01-01", TODAY);

function abGate(over: Partial<Parameters<typeof canShowEnergy>[0]> = {}) {
  return canShowEnergy({
    restrictionFlag: false,
    ageVerdict: ADULT,
    coachCounting: "no_position",
    studentSwitch: true,
    ...over,
  });
}

Deno.test("FF-059 lot 3 — la cible exige la chaîne A/B ENTIÈRE", () => {
  // Chaque porte de la chaîne A/B ferme AUSSI la cible, et son motif SURVIT.
  // C'est ce qui garantit que le plancher TCA ferme les trois niveaux — pas une
  // discipline d'appelant, mais le fait qu'il n'y a pas d'autre porte d'entrée.
  const cases: Array<[Partial<Parameters<typeof canShowEnergy>[0]>, string]> = [
    [{ restrictionFlag: true }, "restriction_floor"],
    [{ ageVerdict: assessBirthDate("2015-01-01", TODAY) }, "minor"],
    [{ coachCounting: "no_counting" }, "doctrine_no_counting"],
    [{ studentSwitch: false }, "student_off"],
  ];
  for (const [over, reason] of cases) {
    assertEquals(
      canShowTarget({ energy: abGate(over), targetSwitch: true }),
      { show: false, reason },
      JSON.stringify(over),
    );
  }
});

Deno.test("FF-059 lot 3 — l'interrupteur de la cible est le SIEN, et il est en dernier", () => {
  assertEquals(
    canShowTarget({ energy: abGate(), targetSwitch: false }),
    { show: false, reason: "target_off" },
  );
  assertEquals(
    canShowTarget({ energy: abGate(), targetSwitch: true }),
    { show: true, reason: "open" },
  );
});

Deno.test("FF-059 lot 3 — allumer la CIBLE n'ouvre rien de la chaîne A/B", () => {
  // L'angle adversarial de ce lot: une cinquième porte allumée ne doit pas
  // devenir un contournement des quatre premières.
  assertEquals(
    canShowTarget({ energy: abGate({ restrictionFlag: true }), targetSwitch: true }),
    { show: false, reason: "restriction_floor" },
  );
});

Deno.test("FF-059 lot 3 — une entrée incomplète ou mal typée LÈVE", () => {
  const bad: unknown[] = [
    {},
    { energy: abGate() },
    { targetSwitch: true },
    { energy: abGate(), targetSwitch: undefined },
    { energy: undefined, targetSwitch: true },
    { energy: abGate(), targetSwitch: 1 },
    { energy: { show: true }, targetSwitch: true },
    { energy: { show: true, reason: "target_off" }, targetSwitch: true },
    { energy: true, targetSwitch: true },
  ];
  for (const input of bad) {
    let threw = false;
    try {
      canShowTarget(input as Parameters<typeof canShowTarget>[0]);
    } catch {
      threw = true;
    }
    assert(threw, `${JSON.stringify(input)} aurait dû lever`);
  }
});

// ---------------------------------------------------------------------------
// LES GARDES LUES SUR LA SOURCE
// ---------------------------------------------------------------------------

const SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./energy_target.ts", import.meta.url)),
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

Deno.test("FF-059 lot 3 — AUCUN facteur d'activité, et aucune soustraction", () => {
  // Le rabbit hole de la fiche, tenu sur le code. `estimatedMaintenanceKcal`
  // multiplie un métabolisme de base par une constante de 1,5 qu'aucune donnée
  // de cet élève ne justifie: rien ne collecte le niveau d'activité.
  for (const banned of ["estimatedMaintenanceKcal", "ACTIVITY_FACTOR", "MAX_DAILY_DEFICIT"]) {
    assert(!SOURCE.includes(banned), `« ${banned} » dans energy_target.ts`);
  }
  // ET AUCUN RESTE. « Il te reste 680 kcal » est LA phrase d'un tracker; ce
  // module ne soustrait rien, donc personne en aval ne peut la construire à
  // partir de ce qu'il rend.
  for (const banned of ["remaining", "deficit", "surplus", "consumed", " - "]) {
    assert(!SOURCE.includes(banned), `soustraction ou reste dans energy_target.ts: « ${banned} »`);
  }
});

Deno.test("FF-059 lot 3 — AUCUN objectif n'entre dans la fourchette", () => {
  // La maintenance est ce que ce corps DÉPENSE. Y faire entrer `fat_loss`
  // reviendrait à prescrire un déficit chiffré à quelqu'un que personne n'a
  // examiné — et le plafond de 500 kcal/j de `meal_envelope` existe justement
  // parce que ce calcul-là est dangereux.
  //
  // ⟳ 2026-09-09 — UNE SEULE EXCEPTION, ET ELLE EST UN NOM, PAS UN CALCUL.
  //
  // ⛔ CE QUE CETTE GARDE PROTÈGE N'A PAS BOUGÉ D'UN MOT: aucun objectif ne
  // doit ENTRER dans l'arithmétique de ce fichier. `maintenanceRange` rend ce
  // qu'un corps dépense, `directedRange` y ajoute un écart qu'on lui DONNE, et
  // ni l'une ni l'autre ne lit un jeton d'objectif. Les trois interdits qui
  // portent ça — `fat_loss`, `muscle_gain`, `GoalToken` — restent entiers.
  //
  // Ce qui change est qu'un JETON DE BASE porte désormais le mot dans son nom:
  // `body_equation_with_goal_band`. Ce n'est pas un calcul, c'est une étiquette
  // — et c'est même l'inverse d'un relâchement: elle existe pour que l'écran
  // dise SUR QUOI le chiffre est posé, au lieu de le laisser passer pour une
  // maintenance. La bande, elle, est appliquée dans `meal_energy_shared.ts`,
  // qui est le seul module à joindre une équation de corps et un objectif.
  //
  // ⚠️ ON RETIRE LE LITTÉRAL, PAS L'INTERDIT. Un `banned.filter()` ou un
  // `includes` assoupli aurait désarmé la règle pour tout le fichier; ici, la
  // seule chaîne que la garde ne voit plus est celle-ci, nommée en toutes
  // lettres. Une deuxième occurrence de `goal` ailleurs dans le fichier rougit
  // toujours.
  const withoutBasisToken = SOURCE.replaceAll("body_equation_with_goal_band", "");
  for (const banned of ["fat_loss", "muscle_gain", "GoalToken", "goal"]) {
    assert(
      !withoutBasisToken.includes(banned),
      `« ${banned} » dans energy_target.ts`,
    );
  }
});

Deno.test("FF-059 lot 3 — les constantes sont CELLES du front, et le test les lie", () => {
  // Deux copies d'un même nombre divergent, et c'est celle qu'on regarde le
  // moins qui garde l'ancienne. `coachStartingNumbers` sert la MÊME fourchette
  // au coach depuis toujours; sans ce test, l'un des deux pourrait bouger et
  // le coach et son élève liraient deux maintenances pour le même corps.
  const front = Deno.readTextFileSync(
    fromFileUrl(
      new URL("../../../../frontend/src/keel/lib/weekInFood.ts", import.meta.url),
    ),
  );
  assert(
    front.includes(`round50(${MAINTENANCE_KCAL_PER_KG_LOW} * w)`),
    `weekInFood.ts n'utilise plus ${MAINTENANCE_KCAL_PER_KG_LOW} kcal/kg en bas de fourchette`,
  );
  assert(
    front.includes(`round50(${MAINTENANCE_KCAL_PER_KG_HIGH} * w)`),
    `weekInFood.ts n'utilise plus ${MAINTENANCE_KCAL_PER_KG_HIGH} kcal/kg en haut de fourchette`,
  );
  // Et les bornes de plausibilité, qui décident QUI n'a pas de cible.
  assert(front.includes(`w < ${TARGET_WEIGHT_KG_MIN} || w > ${TARGET_WEIGHT_KG_MAX}`));
});

// ---------------------------------------------------------------------------
// L'ACTIVITÉ COLLECTÉE — le trou nommé par l'en-tête, fermé le 2026-08-18
// ---------------------------------------------------------------------------

Deno.test("sans réponse, la fourchette est EXACTEMENT 28-33, comme avant", () => {
  // ⚠️ LA CONDITION DE DÉSARMEMENT. Toute la base d'avant ce lot, et le coach
  // dont l'écran ne connaît pas ce champ, doivent lire le même intervalle. Le
  // test qui lie ces deux constantes à `weekInFood.ts` porte sur CELLES-CI.
  const t = maintenanceRange({
    weightKg: 70,
    weightWeekStart: null,
    activityLevel: null,
  });
  assertEquals(t.range, { low: 1950, high: 2300 });
  assertEquals(Math.round(MAINTENANCE_KCAL_PER_KG_LOW * 70 / 50) * 50, 1950);
});

Deno.test("répondre RESSERRE et DÉPLACE la fourchette, dans les deux sens", () => {
  // « La fourchette d'origine n'était pas la vérité; elle était l'aveu qu'on ne
  // savait pas. » 28 reste trop haut pour qui est assis huit heures, 33 trop
  // bas pour qui s'entraîne quatre fois par semaine.
  const unknown = maintenanceRange({
    weightKg: 70,
    weightWeekStart: null,
    activityLevel: null,
  }).range!;
  const sitting = maintenanceRange({
    weightKg: 70,
    weightWeekStart: null,
    activityLevel: "sedentary",
  }).range!;
  const hard = maintenanceRange({
    weightKg: 70,
    weightWeekStart: null,
    activityLevel: "trains_hard",
  }).range!;
  assert(sitting.low < unknown.low, "un sédentaire doit descendre sous 28 kcal/kg");
  assert(hard.high > unknown.high, "un sportif doit monter au-dessus de 33 kcal/kg");
  // Et chaque fourchette reste une FOURCHETTE: on a gagné en justesse, pas en
  // précision affichée. Un intervalle de 100 kcal se lirait comme une cible.
  for (const r of [unknown, sitting, hard]) {
    assert(r.high - r.low >= 150, `fourchette trop étroite: ${r.low}-${r.high}`);
  }
});

Deno.test("chaque cran a sa fourchette, et elles sont STRICTEMENT croissantes", () => {
  // R6, et la garde qui compte: deux crans qui rendraient le même intervalle
  // feraient une question à quatre réponses dont deux ne changent rien.
  let previousLow = -1;
  let previousHigh = -1;
  for (const level of ACTIVITY_LEVELS) {
    const r = maintenanceRange({
      weightKg: 70,
      weightWeekStart: null,
      activityLevel: level,
    }).range!;
    assert(r.low > previousLow, `${level}: le bas ne monte pas`);
    assert(r.high > previousHigh, `${level}: le haut ne monte pas`);
    assert(r.low < r.high, `${level}: fourchette inversée`);
    previousLow = r.low;
    previousHigh = r.high;
  }
});

Deno.test("les motifs d'absence gagnent sur l'activité, quel que soit le cran", () => {
  // Un cran coché ne fabrique pas une cible pour quelqu'un dont on n'a pas le
  // poids: c'est le poids qui porte le calcul, l'activité ne fait que le
  // moduler.
  for (const level of [null, ...ACTIVITY_LEVELS]) {
    assertEquals(
      maintenanceRange({ weightKg: null, weightWeekStart: null, activityLevel: level }).gap,
      "no_weight",
    );
    assertEquals(
      maintenanceRange({ weightKg: 900, weightWeekStart: null, activityLevel: level }).gap,
      "implausible_weight",
    );
  }
});

Deno.test("FF-059 lot 3 — la constante DEVINÉE reste interdite ici", () => {
  // ⚠️ LA GARDE N'EST PAS LEVÉE, ELLE EST PRÉCISÉE. Le test historique bannit
  // `ACTIVITY_FACTOR` et `estimatedMaintenanceKcal` de ce fichier: ce sont la
  // constante de 1,5 « qu'aucune donnée de cet élève ne justifie » et la
  // fonction qui la multiplie. Elles restent bannies — ce lot les REMPLACE, il
  // ne les autorise pas à entrer.
  //
  // Ce qui est autorisé est différent en nature: un cran DÉCLARÉ par la
  // personne. Le nom le dit (`ACTIVITY_KCAL_PER_KG`, des kcal par kg, pas un
  // multiplicateur de métabolisme), et la garde ci-dessous est ce qui empêche
  // qu'on rouvre la porte en croyant l'avoir déjà ouverte.
  assert(!SOURCE.includes("ACTIVITY_FACTOR"));
  assert(!SOURCE.includes("estimatedMaintenanceKcal"));
  assert(SOURCE.includes("ACTIVITY_KCAL_PER_KG"));
});

// ===========================================================================
// ⟳ LOT 4 (2026-09-01) — LA FOURCHETTE SUIT LA DIRECTION
//
// Ce que ces tests protègent, dans l'ordre de ce que ça coûte quand ça casse:
//
//   * LA LARGEUR QUI SE RESSERRE — une fourchette qui rétrécit en gagnant une
//     direction se lit comme une cible qu'on vient de préciser, et « personne
//     ne rate un intervalle » est la phrase qui tient tout ce module;
//   * LE PLANCHER QUI SE FAIT RABOTER — raboter la borne basse produirait à la
//     fois une fourchette rétrécie ET un nombre que le moteur n'exécute pas.
//     On rend la MAINTENANCE, qui reste vraie;
//   * LE GARDE DE GROSSESSE QUI NE MORD PAS — `condition_energy_gate.ts` a été
//     écrit sur une mesure: une femme enceinte recevait une boîte pesée en
//     déficit. Ce lot lui donne un chiffre AFFICHÉ à annuler aussi;
//   * LA BASE QUI MENT — une direction posée sur une base d'entretien fait dire
//     « pour perdre à ton rythme » à des nombres qui n'ont pas bougé: le défaut
//     d'origine, avec une étiquette qui le rend indétectable.
// ===========================================================================

const FLOOR_FEMALE = 1200;

/** 75 kg, aucune activité déclarée: 2 100 – 2 500. Le banc de tout ce bloc. */
const BASE_75KG = maintenanceRange({
  activityLevel: null,
  weightKg: 75,
  weightWeekStart: "2026-08-10",
});

Deno.test("FF-059 lot 4 — LE CAS QUI PASSE: une perte décale la fourchette VERS LE BAS", () => {
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: "down",
    dailyDeltaKcal: 400,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, { low: 1700, high: 2100 });
  assertEquals(t.basis, ENERGY_TARGET_BASIS_DIRECTED);
  assertEquals(t.direction, "down");
  assertEquals(t.directionGap, null);
  // Le poids et sa date SURVIVENT au décalage: l'élève doit toujours savoir
  // sur quelle pesée sa fourchette est posée.
  assertEquals(t.weightKg, 75);
  assertEquals(t.weightWeekStart, "2026-08-10");
});

Deno.test("FF-059 lot 4 — une prise décale VERS LE HAUT, et le plancher ne s'en mêle pas", () => {
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: "up",
    dailyDeltaKcal: 300,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, { low: 2400, high: 2800 });
  assertEquals(t.direction, "up");
});

Deno.test("FF-059 lot 4 — LA LARGEUR NE CHANGE JAMAIS, quel que soit l'écart", () => {
  // ⛔ LA PROPRIÉTÉ QUI TIENT LE MODULE. Un décalage qui rétrécirait la
  // fourchette la ferait glisser vers la forme qu'on refuse: le point.
  const width = BASE_75KG.range!.high - BASE_75KG.range!.low;
  for (const delta of [30, 50, 137, 200, 425, 500]) {
    for (const direction of ["up", "down"] as const) {
      const t = directedRange({
        maintenance: BASE_75KG,
        direction,
        dailyDeltaKcal: delta,
        energyFloorKcal: FLOOR_FEMALE,
        cancelled: null,
      });
      if (t.range === null) continue;
      assertEquals(
        t.range.high - t.range.low,
        width,
        `largeur déplacée par ${direction} ${delta}`,
      );
      // Et les deux bornes restent des multiples de 50: l'arrondi porte sur
      // l'ÉCART, jamais sur chaque borne séparément.
      assertEquals(t.range.low % 50, 0, `borne basse non arrondie: ${t.range.low}`);
      assertEquals(t.range.high % 50, 0, `borne haute non arrondie: ${t.range.high}`);
    }
  }
});

Deno.test("FF-059 lot 4 — un écart sous l'arrondi ne déplace RIEN, et le dit", () => {
  // 24 kcal/jour ne déplacent pas une fourchette large de 400. Le motif est
  // `no_pace` et pas un silence: c'est lui qu'on compte.
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: "down",
    dailyDeltaKcal: 24,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, BASE_75KG.range);
  assertEquals(t.basis, ENERGY_TARGET_BASIS);
  assertEquals(t.direction, null);
  assertEquals(t.directionGap, "no_pace");
});

Deno.test("FF-059 lot 4 — AUCUNE direction: la fourchette ne bouge pas, et SANS motif", () => {
  // Il n'y a rien à expliquer à quelqu'un qui ne vise rien. Un motif ici ferait
  // compter comme « la direction n'a pas été appliquée » toute la population
  // qui n'en a pas.
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: null,
    dailyDeltaKcal: 400,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, BASE_75KG.range);
  assertEquals(t.basis, ENERGY_TARGET_BASIS);
  assertEquals(t.direction, null);
  assertEquals(t.directionGap, null);
});

Deno.test("FF-059 lot 4 — LE PLANCHER REFUSE, IL NE RABOTE PAS", () => {
  // 45 kg → 1 250 – 1 500. Un déficit de 400 poserait la borne basse à 850,
  // sous le plancher féminin de 1 200. On rend la MAINTENANCE — vraie, et qui
  // n'est un nombre de famine pour personne — jamais une borne rabotée.
  const light = maintenanceRange({
    activityLevel: null,
    weightKg: 45,
    weightWeekStart: null,
  });
  assertEquals(light.range, { low: 1250, high: 1500 });
  const t = directedRange({
    maintenance: light,
    direction: "down",
    dailyDeltaKcal: 400,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, light.range, "la fourchette a été rabotée au lieu d'être refusée");
  assertEquals(t.basis, ENERGY_TARGET_BASIS);
  assertEquals(t.direction, null);
  assertEquals(t.directionGap, "below_energy_floor");
});

Deno.test("FF-059 lot 4 — le plancher ne ferme QUE la perte", () => {
  // Une PRISE sur le même corps passe: le plancher garde le bas, pas le haut.
  // Sans ce cas, la garde du dessus serait indistinguable d'un « on refuse
  // toujours sur les corps légers ».
  const light = maintenanceRange({
    activityLevel: null,
    weightKg: 45,
    weightWeekStart: null,
  });
  const t = directedRange({
    maintenance: light,
    direction: "up",
    dailyDeltaKcal: 400,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, { low: 1650, high: 1900 });
  assertEquals(t.direction, "up");
});

Deno.test("FF-059 lot 4 — une condition déclarée annule l'écart, et le motif la NOMME", () => {
  // Le bon chiffre de déficit en grossesse est ZÉRO, pas « un déficit plus
  // petit » — `condition_energy_gate.ts`, mesuré. Et le motif doit être
  // `condition_cancelled` et pas `no_pace`: une femme enceinte dont le rythme
  // est nul par ailleurs ne se répare pas comme quelqu'un sans rythme.
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: "down",
    dailyDeltaKcal: 500,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: "condition_cancelled",
  });
  assertEquals(t.range, BASE_75KG.range);
  assertEquals(t.direction, null);
  assertEquals(t.directionGap, "condition_cancelled");
});

Deno.test("FF-059 lot 4 — l'annulation passe DEVANT le rythme", () => {
  // Ordre des motifs: une condition avec un écart nul doit lire
  // `condition_cancelled`, pas `no_pace`. Le motif rendu est celui qui se
  // répare — et celui-ci ne se répare pas du tout.
  const t = directedRange({
    maintenance: BASE_75KG,
    direction: "down",
    dailyDeltaKcal: 0,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: "condition_cancelled",
  });
  assertEquals(t.directionGap, "condition_cancelled");
});

Deno.test("FF-059 lot 4 — sans fourchette, il n'y a rien à décaler et rien à expliquer", () => {
  // `gap` dit déjà tout (« ajoute une pesée »). Un `directionGap` en plus
  // ferait deux motifs pour une seule absence, et l'écran choisirait mal.
  const none = maintenanceRange({
    activityLevel: null,
    weightKg: null,
    weightWeekStart: null,
  });
  assertEquals(none.gap, "no_weight");
  const t = directedRange({
    maintenance: none,
    direction: "down",
    dailyDeltaKcal: 400,
    energyFloorKcal: FLOOR_FEMALE,
    cancelled: null,
  });
  assertEquals(t.range, null);
  assertEquals(t.gap, "no_weight");
  assertEquals(t.direction, null);
  assertEquals(t.directionGap, null);
});

Deno.test("FF-059 lot 4 — `maintenanceRange` ne rend JAMAIS de direction", () => {
  // L'en-tête de la fonction promet « aucun objectif n'entre ici », et le lot 4
  // ne l'a pas ouverte: la direction s'applique APRÈS, sur son résultat. Si
  // cette assertion casse, il existe deux endroits où un écart peut naître.
  for (const level of [null, ...ACTIVITY_LEVELS]) {
    for (const kg of [45, 75, 120]) {
      const t = maintenanceRange({
        activityLevel: level,
        weightKg: kg,
        weightWeekStart: null,
      });
      assertEquals(t.direction, null, `${level} ${kg}`);
      assertEquals(t.directionGap, null, `${level} ${kg}`);
      assertEquals(t.basis, ENERGY_TARGET_BASIS, `${level} ${kg}`);
    }
  }
});

Deno.test("FF-059 lot 4 — la BASE ne dit `with_direction` que si elle a bougé", () => {
  // ⛔ L'ÉNONCÉ FAUX QU'ON FERME: « Autour de 2 100–2 500 pour perdre à ton
  // rythme » posé sur des nombres d'entretien inchangés. Le front s'appuie sur
  // la base pour choisir sa phrase (`readTarget`), donc une base qui mentirait
  // ici mentirait à l'écran.
  const cases = [
    { delta: 400, cancelled: null, moved: true },
    { delta: 0, cancelled: null, moved: false },
    { delta: 400, cancelled: "condition_cancelled" as const, moved: false },
  ];
  for (const c of cases) {
    const t = directedRange({
      maintenance: BASE_75KG,
      direction: "down",
      dailyDeltaKcal: c.delta,
      energyFloorKcal: FLOOR_FEMALE,
      cancelled: c.cancelled,
    });
    const moved = t.range!.low !== BASE_75KG.range!.low;
    assertEquals(moved, c.moved, JSON.stringify(c));
    assertEquals(
      t.basis === ENERGY_TARGET_BASIS_DIRECTED,
      c.moved,
      `la base et le mouvement ne sont plus d'accord: ${JSON.stringify(c)}`,
    );
  }
});

Deno.test("FF-059 lot 4 — tous les motifs de non-application sont ATTEIGNABLES", () => {
  // Un vocabulaire qui déclare un motif que rien ne produit est un compteur
  // désarmé qui ressemble à un compteur qui marche.
  const light = maintenanceRange({ activityLevel: null, weightKg: 45, weightWeekStart: null });
  const produced = new Set<string>([
    directedRange({
      maintenance: BASE_75KG,
      direction: "down",
      dailyDeltaKcal: 10,
      energyFloorKcal: FLOOR_FEMALE,
      cancelled: null,
    }).directionGap!,
    directedRange({
      maintenance: light,
      direction: "down",
      dailyDeltaKcal: 400,
      energyFloorKcal: FLOOR_FEMALE,
      cancelled: null,
    }).directionGap!,
    directedRange({
      maintenance: BASE_75KG,
      direction: "down",
      dailyDeltaKcal: 400,
      energyFloorKcal: FLOOR_FEMALE,
      cancelled: "condition_cancelled",
    }).directionGap!,
  ]);
  assertEquals([...produced].sort(), [...TARGET_DIRECTION_GAPS].sort());
});

Deno.test("FF-059 lot 4 — `directedRange` n'invente aucun entretien: la source le prouve", () => {
  // ⛔ LE RABBIT HOLE DE LA FICHE, ET IL VISAIT CE MODULE. `mouthTargetKcal`
  // rend un POINT calculé sur Mifflin-St Jeor. Le décalage doit venir de
  // l'écart EXÉCUTÉ passé en argument — jamais d'une équation recalculée ici,
  // sinon la fourchette affichée cesserait d'être posée sur le POIDS et ce
  // module perdrait la base qu'il annonce.
  const source = Deno.readTextFileSync(
    fromFileUrl(new URL("./energy_target.ts", import.meta.url)),
  );
  const start = source.indexOf("export function directedRange(");
  assert(start > 0, "`directedRange` a disparu ou changé de nom");
  // ⟳ 2026-09-09 — LES COMMENTAIRES SORTENT AVANT LA RECHERCHE, ET LA GARDE Y
  // GAGNE. Elle lisait la source BRUTE de `directedRange` jusqu'à la fin du
  // fichier: n'importe quelle PROSE qui NOMME l'équation écartée la faisait
  // tomber, y compris le pavé qui explique pourquoi elle est écartée. Ce
  // qu'elle doit prouver est qu'aucun CODE ne recalcule un entretien ici —
  // c'est ce qu'elle prouve maintenant, et sur la même étendue.
  const body = source.slice(start)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  for (const forbidden of ["estimatedMaintenance", "Mifflin", "ACTIVITY_FACTOR", "KCAL_PER_KG_BODY_MASS"]) {
    assert(
      !body.includes(forbidden),
      `« ${forbidden} » est entré dans directedRange — la base n'est plus le poids`,
    );
  }
});
