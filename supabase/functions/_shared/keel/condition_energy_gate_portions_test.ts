// ═══════════════════════════════════════════════════════════════════════════
// L0bis — LA MOITIÉ « GRAMMAGE » DU BANC DE LA GROSSESSE.
//
// ⛔ CE FICHIER N'EST PAS COMMITÉ, ET CE N'EST PAS UN OUBLI. Il importe
// `household_portions.ts`, qui portait **+1 532/−188 lignes non commitées d'une
// autre session** au moment du lot (mesuré le 2026-08-22 par `git diff
// --numstat`). La garde y est branchée DANS L'ARBRE DE TRAVAIL — c'est-à-dire
// dans ce que `functions serve` exécute — et son banc doit vivre au même
// endroit qu'elle. Le commiter casserait le typecheck de HEAD, qui ne connaît
// ni `FactorMouth`, ni `householdMouthFactors`, ni le sixième champ requis de
// `mouthTargetFactor`. Décision §⑨ n° 15, appliquée pour la quatrième fois.
//
// La moitié COMMITÉE est `condition_energy_gate_test.ts`: elle tient la même
// garde sur l'ancre absolue, qui est le chemin vivant du déficit.
//
// CE QUE CELUI-CI AJOUTE, ET QUE L'AUTRE NE PEUT PAS TENIR:
//   * `noSizing("pregnancy")` — le motif LITTÉRAL de la fiche du lot;
//   * la boîte **BYTE-IDENTIQUE** jusqu'aux GRAMMES rendus par
//     `sizeBoxesFromTarget`, c'est-à-dire jusqu'aux nombres qu'une personne
//     mange. Un motif identique ne prouve rien sur une assiette.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import { DEFICIT_CANCELLING_CONDITION_REFS } from "./condition_energy_gate.ts";
import {
  type FactorMouth,
  householdMouthFactors,
  mouthTargetFactor,
  type PortionMember,
  resolveBoxFactors,
  sizeBoxesFromTarget,
} from "./household_portions.ts";
import type { MouthBody } from "./meal_envelope.ts";

/**
 * LE CORPS DE LA MESURE DU 2026-08-22 À 03:19:55 CEST. Femme, 31 ans, 165 cm,
 * 68 kg, sédentaire — entretien estimé 1 980 kcal/j, facteur de boîte mesuré
 * **0,7475** au cran 0,5 kg/semaine. C'est ce nombre-là que le lot annule.
 */
const HER: MouthBody = {
  appetite: null,
  heightCm: 165,
  weightKg: 68,
  gender: "female",
  ageYears: 31,
  activityLevel: "sedentary",
  activityAxes: { day: null, sport: null, asked: false },
};

const MOUTH = (over: Partial<PortionMember> = {}): PortionMember => ({
  memberId: "m-her",
  displayName: "Awen",
  goal: "fat_loss",
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
  ...over,
});

type SizingArgs = Parameters<typeof mouthTargetFactor>[0];

const SIZING: SizingArgs = {
  ageState: "adult",
  restrictionFlag: false,
  coachCounting: "no_position",
  direction: "down",
  paceKgPerWeek: 0.5,
  conditionRefs: [],
  subject: { body: HER, isMinor: false },
};

Deno.test("⛔ LE CAS QUI MORD — enceinte + fat_loss ⇒ noSizing(\"pregnancy\")", () => {
  // LA PRÉMISSE D'ABORD: sans elle, un test vert ne prouverait que l'absence de
  // tout dimensionnement — une garde cassée bloque tout et ressemble à une
  // garde qui marche.
  const ouvert = mouthTargetFactor(SIZING);
  assertEquals(ouvert.reason, "sized", "prémisse: le déficit doit être OUVERT");
  assertEquals(
    Math.round(ouvert.factor * 10000) / 10000,
    0.7475,
    "prémisse: le facteur mesuré le 2026-08-22",
  );

  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    const out = mouthTargetFactor({ ...SIZING, conditionRefs: [ref] });
    assertEquals(out.reason, ref, ref);
    // ⛔ `1` EXACT, pas « proche de 1 »: ce facteur multiplie des grammes.
    assertEquals(out.factor, 1, ref);
  }
});

Deno.test("⛔ LA GARDE NE MORD QUE VERS LE BAS — un surplus traverse intact", () => {
  // Rabattre un surplus retirerait de l'énergie à une femme enceinte qui en
  // demande, sous le nom d'une protection. Ce module retire des DÉFICITS.
  const nu = mouthTargetFactor({ ...SIZING, direction: "up" });
  assert(nu.factor > 1, `prémisse: ${nu.factor} n'est pas un surplus`);
  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    assertEquals(
      JSON.stringify(mouthTargetFactor({ ...SIZING, direction: "up", conditionRefs: [ref] })),
      JSON.stringify(nu),
      ref,
    );
  }
  // Et sans direction du tout, le motif reste celui d'hier: la garde ne prend
  // pas la place de `no_direction`.
  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    assertEquals(
      mouthTargetFactor({ ...SIZING, direction: null, conditionRefs: [ref] }).reason,
      "no_direction",
      ref,
    );
  }
});

Deno.test("⛔ LE CAS QUI PASSE — un AUTRE condition_ref rend une boîte BYTE-IDENTIQUE", () => {
  // ⚠️ COMPARÉ SUR LES GRAMMES RENDUS, PAS SUR LE MOTIF. Un motif identique ne
  // prouve rien sur l'assiette; c'est `sizeBoxesFromTarget` qui écrit les
  // nombres qu'une personne mange.
  const table = (conditionRefs: readonly string[]): FactorMouth[] => [
    {
      member: MOUTH({ memberId: "m-her", goal: "fat_loss" }),
      restriction: "clear",
      body: HER,
      paceKgPerWeek: 0.5,
      conditionRefs,
    },
    {
      member: MOUTH({ memberId: "m-him", goal: null }),
      restriction: "clear",
      body: { ...HER, gender: "male", weightKg: 82, heightCm: 181 },
      paceKgPerWeek: null,
      conditionRefs: [],
    },
  ];
  const meals = [
    {
      boxId: "b1",
      memberIds: ["m-her"],
      day: "thu",
      items: [{ preparationId: "p1", grams: 320 }, { preparationId: null, grams: 90 }],
      uses: [{ preparationId: "p1", servings: 1 }],
    },
  ];
  const preparations = [{ id: "p1", servingsMade: 4, readyGrams: 1600 }];

  const boxesFor = (conditionRefs: readonly string[]): string => {
    const factors = householdMouthFactors(table(conditionRefs), "no_position");
    const relative = new Map<string, number>();
    for (const [id, f] of factors) relative.set(id, f.factor);
    // ⟳ 2026-09-04 — PAR CONTENANT. `sizeBoxesFromTarget` lit une table par
    // `boxId`; passer la table par `member_id` compilerait (les deux sont des
    // `Map<string, number>`) et rendrait silencieusement 1 partout, donc des
    // boîtes identiques quel que soit le `condition_ref` — ce test passerait au
    // vert en n'éprouvant plus rien. On traverse le résolveur, comme la
    // production.
    const byBox = resolveBoxFactors({
      boxes: meals,
      anchors: new Map(),
      relative,
    });
    return JSON.stringify(sizeBoxesFromTarget(
      meals,
      preparations,
      new Map([...byBox].map(([id, r]) => [id, r.factor])),
      0.05,
    ));
  };

  const nu = boxesFor([]);
  // ⛔ LES QUATRE AUTRES JETONS DE LA LISTE FERMÉE DU PLANCHER DE MALADIE, ET
  // PAS UN SEUL: chacun de ces gens a le droit de viser une perte de poids.
  for (const ref of ["diabetes", "hypertension", "coeliac_disease", "gout"]) {
    assertEquals(boxesFor([ref]), nu, `${ref}: la boîte a bougé`);
  }
  // Un ref INCONNU passe aussi — la garde est une liste fermée, jamais un
  // rapprochement: « pregnancy_test » n'est pas « pregnancy ».
  assertEquals(boxesFor(["pregnancy_test"]), nu, "un ref inconnu ne doit pas mordre");

  // ── ET LA PRÉMISSE: LA MÊME BOÎTE **BOUGE** SOUS `pregnancy` ───────────
  // Sans elle, « byte-identique partout » serait vert sur une garde qui ne fait
  // rien du tout.
  assert(boxesFor(["pregnancy"]) !== nu, "prémisse: la garde ne change RIEN");
  assertEquals(
    boxesFor(["pregnancy"]),
    boxesFor(["breastfeeding"]),
    "les deux conditions rendent la même assiette",
  );
  // ⛔ ET LA BOUCHE D'À CÔTÉ NE PAIE RIEN. Une garde posée sur l'une qui
  // retirerait à l'autre est un défaut que ce dépôt a déjà mesuré, par les deux
  // bouts.
  const voisin = (refs: readonly string[]) =>
    householdMouthFactors(table(refs), "no_position").get("m-him")!;
  assertEquals(
    JSON.stringify(voisin(["pregnancy"])),
    JSON.stringify(voisin([])),
    "la bouche voisine a bougé",
  );
});
