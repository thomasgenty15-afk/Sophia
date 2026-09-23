/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PASSE COMMUNE — UNE CANDIDATE FINALISÉE, **TOUS** SES DÉFAUTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE MODULE FERME, ET LE PLAN LE NOMME (§ C4) : « extraire/réutiliser
 * une passe commune qui finalise une candidate et collecte **tous** ses défauts
 * applicables : identités, portions, nutrition, courses, restrictions, structure
 * culinaire et quantités. Conserver les contrôles précoces utiles, mais **aucun
 * ne possède une boucle de réparation indépendante**. »
 *
 * Avant lui, six contrôles rendaient six verdicts dans six formes différentes :
 *
 *   · `finalPlanGate`            → `GateRefusal[]`  (22 causes)
 *   · `checkOutputContract`      → `OutputContractReport`
 *   · l'arrondi (étape C2)       → deux compteurs et deux `issues:`
 *   · `finalPortionCheck`        → des seaux `out_of_bounds`
 *   · `shoppingIdentityAudit`    → des lignes d'achat
 *   · `shadowSizing`             → des `repair_asks`
 *
 * Et **un seul** de ces six pouvait déclencher une réparation, chacun avec sa
 * propre décision locale, prise avant que les cinq autres aient mesuré quoi que
 * ce soit. Mesuré sur la campagne du 2026-09-11 : quatre plans sur six sortent
 * sous leur plancher protéique, `protein_floor_short` est COMPTÉ, la livraison
 * reste `deliverable_with_gaps`, et **rien ne répare**.
 *
 * ⛔ CE MODULE NE MESURE RIEN LUI-MÊME. Il ne refait aucun des six contrôles :
 * il les TRADUIT dans le seul type que le budget de réparation comprend
 * (`RepairDefect`, `plan_repair_loop.ts`). Un septième calcul serait un septième
 * avis, et c'est celui qu'on relit le moins qui finirait par décider.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

import type { GateRefusal } from "./final_plan_gate.ts";
import type { OutputContractReport } from "./composition_contract.ts";
import {
  COVERED_DAY_ENERGY_TOLERANCE,
  MEAL_ENERGY_TOLERANCE,
} from "./final_plan_audit.ts";
import type { CellNutritionRow, DayNutritionRow } from "./final_plan_audit.ts";
import {
  CHASED_CAUSES,
  defectsFromOutputContract,
  defectsFromRefusals,
  measureUnit,
  orderDefects,
  violationKey,
} from "./plan_repair_loop.ts";
import type {
  CandidateVerdict,
  RepairDefect,
  RepairMeasure,
} from "./plan_repair_loop.ts";
import { planProjection } from "./plan_repair_context.ts";
import type {
  PlanProjection,
  RepairNutritionTables,
  RepairPlanShape,
  RepairScope,
} from "./plan_repair_context.ts";
import { repairPatchScopeLines } from "./plan_repair_patch.ts";
import type {
  RepairSessionIndex,
  RepairUnitIndex,
} from "./plan_repair_unit.ts";
import type { RepairHouseholdContext } from "./side_courses_types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ⓪ ⟳ 2026-09-12 · LOT 2 — LE CONTRAT D'UNE CASE, TEL QUE LE MOTEUR L'A POSÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QUE CETTE PASSE LIT DU CONTRAT D'UNE CASE.
 *
 * ⛔ UN TYPE STRUCTUREL, PAS UN IMPORT DE `AuditCell`. Même raison que
 * `ShoppingCoverRow` dans la garde: le type décrit CE QU'ON LIT, et `AuditCell`
 * (`final_plan_audit.ts`) le satisfait par construction — le compilateur
 * l'épingle au site d'appel. Ça garde ce module appelable là où le référentiel
 * n'existe pas.
 *
 * ⛔ ET ON NE RECALCULE RIEN. Ces nombres viennent du contrat de composition
 * (`slot_nutrition_contract.ts` → `contractAt`), le MÊME qui a dimensionné les
 * portions et qui est parti dans le prompt. Un septième calcul serait un
 * septième avis, et c'est celui qu'on relit le moins qui finirait par décider.
 */
export interface CellContractRow {
  readonly memberId: string;
  /** Le jeton de jour du plan (`sun`), pas la date: c'est la clé de la case. */
  readonly day: string;
  readonly slot: string;
  readonly targetKcal: number | null;
  readonly gramsMin: number | null;
  readonly gramsMax: number | null;
  readonly densityMin: number | null;
  readonly densityMax: number | null;
}

const cellKey = (memberId: string, day: string, slot: string) =>
  `${memberId}|${day}|${slot}`;

/** L'index des contrats par (bouche, jour, moment). PURE. */
function contractIndex(
  contracts: readonly CellContractRow[] | undefined,
): (row: { memberId: string; day: string; slot: string }) => CellContractRow | null {
  if (contracts === undefined || contracts.length === 0) return () => null;
  const m = new Map<string, CellContractRow>();
  for (const c of contracts) m.set(cellKey(c.memberId, c.day, c.slot), c);
  return (row) => m.get(cellKey(row.memberId, row.day, row.slot)) ?? null;
}

/** Quelle borne est franchie, et de combien. `null` = on ne peut pas le dire. */
interface BoundsGap {
  readonly of: "mass" | "density";
  readonly gap: number;
  readonly measure: RepairMeasure;
  readonly sentence: string;
}

/**
 * LA BORNE FRANCHIE D'UNE CASE `bounds_off`, CHIFFRÉE.
 *
 * ⛔ LA MASSE SE LIT AVANT LA DENSITÉ, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE:
 * c'est l'ordre de `cellStateOf` (`final_plan_audit.ts`), qui teste les bornes
 * de masse puis le couloir. Lire dans l'autre sens ferait dire « la densité »
 * d'une case que le moteur a classée sur sa masse — deux lectures du même fait
 * qui divergent.
 *
 * ⚠️ QUAND LES DEUX SONT FRANCHIES, LA PHRASE LE DIT ET L'AMPLEUR EST CELLE DE
 * LA MASSE. Les deux unités ne s'additionnent pas (`magnitudeComparison`
 * apparie par nature); en taire une serait pire.
 *
 * PURE: no I/O, no clock, no randomness.
 */
function boundsGap(
  row: CellNutritionRow | null,
  contract: CellContractRow | null,
): BoundsGap | null {
  if (row === null || contract === null) return null;
  const masseHors = row.grams !== null &&
    ((contract.gramsMin !== null && row.grams < contract.gramsMin) ||
      (contract.gramsMax !== null && row.grams > contract.gramsMax));
  const densiteHors = row.densityPer100G !== null &&
    ((contract.densityMin !== null && row.densityPer100G < contract.densityMin) ||
      (contract.densityMax !== null && row.densityPer100G > contract.densityMax));
  const bande = (min: number | null, max: number | null, unit: string) =>
    min !== null && max !== null
      ? `${round(min)} to ${round(max)} ${unit}`
      : min !== null
      ? `at least ${round(min)} ${unit}`
      : max !== null
      ? `at most ${round(max)} ${unit}`
      : `(no bound given)`;
  if (masseHors && row.grams !== null) {
    const limite = contract.gramsMin !== null && row.grams < contract.gramsMin
      ? contract.gramsMin
      : contract.gramsMax as number;
    const aussi = densiteHors && row.densityPer100G !== null
      ? ` Its density is also outside its corridor: ${
        round(row.densityPer100G)
      } kcal/100 g, and it must be ${
        bande(contract.densityMin, contract.densityMax, "kcal/100 g")
      }.`
      : "";
    return {
      of: "mass",
      gap: Math.abs(row.grams - limite),
      measure: {
        of: "mass",
        grams: row.grams,
        minG: contract.gramsMin,
        maxG: contract.gramsMax,
      },
      sentence: `its calories are already right; the plate weighs ${
        round(row.grams)
      } g cooked and a plate here must be ${
        bande(contract.gramsMin, contract.gramsMax, "g")
      }.${aussi}`,
    };
  }
  if (densiteHors && row.densityPer100G !== null) {
    const limite =
      contract.densityMin !== null && row.densityPer100G < contract.densityMin
        ? contract.densityMin
        : contract.densityMax as number;
    return {
      of: "density",
      gap: Math.abs(row.densityPer100G - limite),
      measure: {
        of: "density",
        per100G: row.densityPer100G,
        minPer100G: contract.densityMin,
        maxPer100G: contract.densityMax,
      },
      sentence: `its calories are already right; the dish carries ${
        round(row.densityPer100G)
      } kcal per 100 g and it must be ${
        bande(contract.densityMin, contract.densityMax, "kcal/100 g")
      }.`,
    };
  }
  return null;
}

/** Un nombre arrondi, lisible dans une phrase. */
function round(v: number): number {
  return Math.round(v);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES AMPLEURS — « de combien ça manque », lues sur les MÊMES lignes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'AMPLEUR DE CHAQUE REFUS MESURABLE, INDEXÉE PAR SON IDENTITÉ DE VIOLATION.
 *
 * ⛔ POURQUOI ELLE EXISTE. `judgeCandidate` rejette une candidate qui ne baisse
 * pas le NOMBRE de défauts — et le lot E a mesuré ce que ça jette : une
 * réparation qui amenait trois assiettes de 105,4 / 119,9 / 125,5 à 118,4 /
 * 133,6 / 138,1 kcal/100 g fermait les trois quarts de l'écart et partait à la
 * poubelle (`no_improvement`). `magnitudeComparison` sait s'en servir ; encore
 * faut-il que quelqu'un renseigne le champ.
 *
 * ⛔ ET ELLE SE LIT SUR LES LIGNES QUI ONT PRODUIT LE REFUS, jamais sur une
 * seconde mesure. Les deux tables (`cells`, `days`) sont exactement celles que
 * `finalPlanGate` a reçues : la garde et l'ampleur ne peuvent donc pas parler
 * de deux plans différents.
 *
 * ⚠️ UNE CAUSE DONT L'AMPLEUR N'EST PAS LISIBLE N'ENTRE PAS. `magnitude: null`
 * est un aveu — `magnitudeComparison` s'abstient alors au lieu de comparer des
 * grandeurs inventées. Inscrire `0` dirait « il ne manque rien ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function nutritionMagnitudes(
  refusals: readonly GateRefusal[],
  nutrition: {
    readonly cells: readonly CellNutritionRow[];
    readonly days: readonly DayNutritionRow[];
  } | null,
  /**
   * ⟳ 2026-09-12 · LOT 2 — LES BORNES DE LA CASE, POUR `cell_bounds_off`.
   *
   * ⛔ SANS ELLES, UNE DENSITÉ INSUFFISANTE N'A PAS D'AMPLEUR. `CellNutritionRow`
   * porte les MESURES et pas les BORNES: l'écart « 94 kcal/100 g pour un
   * minimum de 100 » n'est calculable qu'ici. Absentes, on écrit `null` —
   * `magnitudeComparison` s'abstient alors au lieu d'inventer.
   */
  contracts?: readonly CellContractRow[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (nutrition === null) return out;
  const contractAt = contractIndex(contracts);
  for (const r of refusals ?? []) {
    const key = violationKey(r);
    if (r.cause === "cell_bounds_off") {
      const row = nutrition.cells.find((c) =>
        c.memberId === r.member_id && c.day === r.day && c.slot === r.slot
      ) ?? null;
      const bornes = row === null ? null : contractAt(row);
      const ecart = boundsGap(row, bornes);
      if (ecart !== null) out.set(key, ecart.gap);
      continue;
    }
    if (r.cause === "protein_floor_short") {
      // ⛔ LA CLÉ DE LA JOURNÉE EST `member_id` + LA DATE. C'est pour ça que la
      // garde pose `day: day.date` sur cette cause: sans elle, deux journées de
      // la même bouche portaient la même identité de violation et leurs
      // ampleurs s'écrasaient l'une l'autre.
      const row = nutrition.days.find((d) =>
        d.memberId === r.member_id && d.date === r.day
      );
      const floor = row?.protein.coveredFloorG ?? null;
      const now = row?.proteinG ?? null;
      if (row && floor !== null && now !== null && floor > now) {
        out.set(key, floor - now);
      }
      continue;
    }
    if (r.cause === "protein_ceiling_over") {
      // ⟳ 2026-09-21 — même clé que le plancher (bouche + date), l'ampleur
      // est ce qui DÉPASSE le plafond couvert.
      const row = nutrition.days.find((d) =>
        d.memberId === r.member_id && d.date === r.day
      );
      const ceiling = row?.protein.coveredCeilingG ?? null;
      const now = row?.proteinG ?? null;
      if (row && ceiling !== null && now !== null && now > ceiling) {
        out.set(key, now - ceiling);
      }
      continue;
    }
    if (r.cause === "day_energy_off") {
      const row = nutrition.days.find((d) =>
        d.memberId === r.member_id && d.date === r.day
      );
      const budget = row?.coveredBudgetKcal ?? null;
      const served = row?.servedKcal ?? null;
      if (row && budget !== null && served !== null) {
        out.set(key, Math.abs(served - budget));
      }
      continue;
    }
    if (r.cause === "cell_energy_off") {
      const row = nutrition.cells.find((c) =>
        c.memberId === r.member_id && c.day === r.day && c.slot === r.slot
      );
      const target = row?.targetKcal ?? null;
      const served = row?.servedKcal ?? null;
      if (row && target !== null && served !== null) {
        out.set(key, Math.abs(served - target));
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① bis · ⟳ 2026-09-12 · LOT 2 — LA MESURE, SA CIBLE, ET LA PHRASE ANGLAISE
// ═══════════════════════════════════════════════════════════════════════════

export interface NutritionReadout {
  /** La mesure et sa cible, par identité de violation. */
  readonly measures: ReadonlyMap<string, RepairMeasure>;
  /** La phrase ANGLAISE, chiffrée, qui remplace le `detail` français de la garde. */
  readonly details: ReadonlyMap<string, string>;
  /**
   * ⛔ LE TÉMOIN, ET IL EST OBLIGATOIRE. Le nombre de refus de la famille
   * nutrition qu'on n'a PAS su chiffrer — contrat absent, mesure illisible.
   * Sans lui, « zéro mesure » et « le contrat n'est pas branché » se relisent
   * pareil, et le dépôt paie en boucle les lots désarmés qui ressemblent à des
   * lots qui marchent.
   */
  readonly unnumbered: number;
}

/**
 * CE QUE CHAQUE REFUS DE NUTRITION A MESURÉ, ET CONTRE QUOI.
 *
 * ⛔ LES QUATRE FAMILLES SONT SÉPARÉES, ET C'EST LE LOT. La revue § 3: « il
 * faut transporter séparément: calories réelles/cible/tolérance, masse
 * réelle/bornes, densité réelle/couloir. Ne pas demander une correction
 * calorique quand ces calories sont déjà acceptables. »
 *
 * ⛔ LA PHRASE EST EN ANGLAIS, ET C'EST UNE CORRECTION MESURÉE. Le `detail` de
 * la garde est français (journal, écran); la consigne de réparation est
 * anglaise. Le tir n° 1 archivé porte « "champignons de Paris" n'est ni sur la
 * liste de courses ni au garde-manger » au milieu d'un bloc anglais.
 *
 * ⚠️ ON NE RÉÉCRIT QUE CE QU'ON SAIT CHIFFRER. Un refus dont le contrat manque
 * garde le `detail` de la garde et entre dans `unnumbered`: une phrase
 * approximative vaut mieux qu'une phrase inventée.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function nutritionReadout(
  refusals: readonly GateRefusal[],
  nutrition: {
    readonly cells: readonly CellNutritionRow[];
    readonly days: readonly DayNutritionRow[];
  } | null,
  contracts?: readonly CellContractRow[],
): NutritionReadout {
  const measures = new Map<string, RepairMeasure>();
  const details = new Map<string, string>();
  let unnumbered = 0;
  if (nutrition === null) {
    return { measures, details, unnumbered: (refusals ?? []).length };
  }
  const contractAt = contractIndex(contracts);
  const celluleOf = (r: GateRefusal) =>
    nutrition.cells.find((c) =>
      c.memberId === r.member_id && c.day === r.day && c.slot === r.slot
    ) ?? null;
  const journeeOf = (r: GateRefusal) =>
    nutrition.days.find((d) => d.memberId === r.member_id && d.date === r.day) ??
      null;
  for (const r of refusals ?? []) {
    const key = violationKey(r);
    if (r.cause === "cell_energy_off") {
      const row = celluleOf(r);
      if (row === null || row.servedKcal === null || row.targetKcal === null) {
        unnumbered++;
        continue;
      }
      measures.set(key, {
        of: "energy",
        servedKcal: row.servedKcal,
        targetKcal: row.targetKcal,
        deltaPct: row.deltaPct,
        tolerancePct: MEAL_ENERGY_TOLERANCE * 100,
      });
      details.set(
        key,
        `the ${r.slot ?? "meal"} dish carries ${round(row.servedKcal)} kcal in ` +
          `one serving and it must carry ${round(row.targetKcal)} kcal, within ` +
          `${round(MEAL_ENERGY_TOLERANCE * 100)}%. Change what the recipe is MADE ` +
          `OF, not how much is served — the app decides that.`,
      );
      continue;
    }
    if (r.cause === "cell_bounds_off") {
      const row = celluleOf(r);
      const ecart = boundsGap(row, row === null ? null : contractAt(row));
      if (ecart === null) {
        unnumbered++;
        continue;
      }
      measures.set(key, ecart.measure);
      // ⛔ LA PHRASE COMMENCE PAR « ses calories sont déjà justes ». C'est
      // littéralement ce que le tir n° 4 n'a pas su dire: il a demandé de
      // corriger « 0 % contre 728 kcal visées ».
      details.set(
        key,
        `${ecart.sentence} Keep the calories where they are and reach it by ` +
          `what the dish is MADE OF${
            ecart.of === "density"
              ? " — less water and less watery vegetable for a denser dish, more of them for a lighter one"
              : ""
          }. Do NOT change how much is served.`,
      );
      continue;
    }
    if (r.cause === "day_energy_off") {
      const row = journeeOf(r);
      if (
        row === null || row.servedKcal === null || row.coveredBudgetKcal === null
      ) {
        unnumbered++;
        continue;
      }
      measures.set(key, {
        of: "energy",
        servedKcal: row.servedKcal,
        targetKcal: row.coveredBudgetKcal,
        deltaPct: row.deltaPct,
        tolerancePct: COVERED_DAY_ENERGY_TOLERANCE * 100,
      });
      details.set(
        key,
        `across that day the plates carry ${round(row.servedKcal)} kcal and they ` +
          `must carry ${round(row.coveredBudgetKcal)} kcal, within ${
            round(COVERED_DAY_ENERGY_TOLERANCE * 100)
          }%.`,
      );
      continue;
    }
    if (r.cause === "protein_floor_short") {
      const row = journeeOf(r);
      const floor = row?.protein.coveredFloorG ?? null;
      const now = row?.proteinG ?? null;
      if (row === null || floor === null || now === null) {
        unnumbered++;
        continue;
      }
      measures.set(key, {
        of: "protein",
        servedG: now,
        floorG: floor,
        ceilingG: row.protein.coveredCeilingG,
      });
      // ⛔ « AU MOINS », ET AUCUNE CONSIGNE DE MAXIMISATION. La revue § 7 le
      // mesure: environ 276–292 g servis pour un plancher de 176 g. « Sans
      // conclure à un risque médical, cette marge n'est pas un critère de
      // meilleure recette. » Une phrase qui pousse au-dessus du plancher
      // fabrique cette marge-là.
      details.set(
        key,
        `that day's plates carry ${round(now)} g of protein and they must carry ` +
          `at least ${round(floor)} g. Reaching the floor is enough — going far ` +
          `above it is not better.`,
      );
      continue;
    }
    if (r.cause === "protein_ceiling_over") {
      // ⟳ 2026-09-21 — LE SENS INVERSE, ET OÙ RETIRER: chez ce qu'on mange
      // seul. Mesuré: le dépassement venait d'un goûter de thon, jamais de la
      // casserole partagée — la toucher ferait descendre toute la table.
      const row = journeeOf(r);
      const ceiling = row?.protein.coveredCeilingG ?? null;
      const now = row?.proteinG ?? null;
      if (row === null || ceiling === null || now === null) {
        unnumbered++;
        continue;
      }
      measures.set(key, {
        of: "protein",
        servedG: now,
        floorG: row.protein.coveredFloorG,
        ceilingG: ceiling,
      });
      details.set(
        key,
        `that day's plates carry ${round(now)} g of protein and they must carry ` +
          `at most ${round(ceiling)} g. Take the protein out of what this person ` +
          `eats ALONE first — a snack or a dish of their own: swap tinned fish, ` +
          `cheese or a second meat for starch, fruit, nuts or vegetables, at the ` +
          `same calories. A shared dish stays as it is unless its line below says ` +
          `everyone at that table is above their floor.`,
      );
      continue;
    }
  }
  return { measures, details, unnumbered };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LES DÉFAUTS DES CONTRÔLES QUI N'EN PRODUISAIENT PAS
// ═══════════════════════════════════════════════════════════════════════════

/** Une ligne que l'arrondi de l'étape C2 ramènerait à zéro. */
export interface RoundedToZeroLine {
  readonly term: string;
  readonly day: string | null;
  readonly slot: string | null;
  readonly dish: string | null;
}

/**
 * Une assiette hors bornes de masse APRÈS arrondi.
 *
 * ⚠️ LA FORME EST CELLE DE `FinalPortionCheck.outOfBounds`, À L'IDENTIQUE — et
 * elle ne porte AUCUN `member_id`, exprès: « le seau d'un jour et d'un moment
 * dit assez pour lire, et pas assez pour nommer » (précédent `residualGaps`).
 */
export interface OutOfBoundsPlate {
  readonly day: string | null;
  readonly slot: string | null;
  readonly grams: number;
  readonly limit: number;
  readonly bound: "min" | "max";
}

/**
 * LES DÉFAUTS QUE L'ARRONDI ET LA MESURE FINALE LAISSENT DERRIÈRE EUX.
 *
 * ⛔ L'ÉTAPE C2 LES A ÉCRITS DANS `issues[]`, ET `issues[]` NE RÉPARE RIEN.
 * `quantity_rounds_to_zero:N`, `rounding_pot_overdrawn:N` et
 * `final_sizing.out_of_bounds` étaient trois chaînes de caractères posées sur
 * la réponse : lisibles par un humain qui relit un journal, invisibles pour le
 * budget de réparation. Le plan de clôture l'exige : « si les quantités
 * arrondies sortent des bornes, transmettre le défaut à C4 ».
 *
 * ⛔ `rounding_pot_overdrawn` EST `repairable: false`, ET C'EST MESURÉ. Les deux
 * dépassements du plan GAIN (2026-09-12, pire cas **3,4 ‰**) sont
 * PRÉEXISTANTS — ils existaient avant l'arrondi — et ils viennent d'une
 * casserole dont le nombre de parts ne divise pas ce que les contenants tirent.
 * Un appel modèle ne fera pas mieux : la correction est arithmétique, dans le
 * moteur. Le compter réparable brûlerait une tentative que le plancher
 * protéique attend.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ⟳ 2026-09-15 · BÊTA — LA CAUSE DU REFUS DE MASSE, NOMMÉE SUR LE CONSTAT.
 *
 * ⛔ C'EST LE JETON QUE LE HANDLER REND EN 422
 * (`detail: ["preparation_quantity_unreconciled"]`,
 * `generate-household-meal-v1/index.ts`) — le MÊME mot, pour que la décision
 * de réparation compte ce constat comme BLOQUANT. Sans lui, le journal disait
 * `plan_repair_skipped:no_blocking_defect` sur un plan que la ligne suivante
 * refusait tout entier (tirs 6 et 13 de la campagne des 30). Le constat reste
 * `repairable: false` — un appel modèle ne fait pas cette arithmétique — donc
 * la décision rend `nothing_repairable`, qui est la vérité.
 *
 * ⚠️ Le littéral reste écrit tel quel dans le handler: la garde des refus ne
 * lit que les littéraux (`refusal-token-guard-reads-only-literals`).
 */
export const POT_MASS_UNRECONCILED_CAUSE = "preparation_quantity_unreconciled";

export function defectsFromQuantities(args: {
  readonly roundedToZero: readonly RoundedToZeroLine[];
  readonly potsOverdrawn: number;
  readonly potsOverdrawnWorstPerMille: number;
  readonly outOfBounds: readonly OutOfBoundsPlate[];
}): RepairDefect[] {
  const out: RepairDefect[] = [];
  for (const line of args.roundedToZero) {
    out.push({
      kind: "sizing",
      day: line.day,
      slot: line.slot,
      dish: line.dish,
      cause: null,
      date: null,
      preparationId: null,
      source: "quantities",
      // ⚠️ UN CONSTAT DE QUANTITÉ PORTE SUR UNE ASSIETTE, jamais sur un déroulé.
      sessionIndex: null,
      memberId: null,
      // ⛔ LA PHRASE DIT LE GESTE, PAS LE CODE. `RepairDefect.detail` porte « la
      // phrase qui part au modèle. Jamais un code interne ».
      detail: `"${line.term}" is written in a quantity so small that it rounds ` +
        `to nothing once we cook it. Either write it in a finer unit that is ` +
        `real in a kitchen, or leave it out of the recipe.`,
      repairable: true,
      magnitude: null,
      // ⛔ NI KCAL NI GRAMMES DE CONTRAT: une ligne qui s'arrondit à rien est
      // un défaut d'ÉCRITURE, pas un écart mesuré contre une cible.
      measure: null,
    });
  }
  if (args.potsOverdrawn > 0) {
    out.push({
      kind: "sizing",
      day: null,
      slot: null,
      dish: null,
      cause: POT_MASS_UNRECONCILED_CAUSE,
      date: null,
      // ⚠️ AUCUNE PRÉPARATION NOMMÉE, et c'est la vérité de ce compteur: il
      // agrège N casseroles en une phrase. En nommer une serait choisir au
      // hasard laquelle des N porte le dépassement.
      preparationId: null,
      source: "quantities",
      // ⚠️ UN CONSTAT DE QUANTITÉ PORTE SUR UNE ASSIETTE, jamais sur un déroulé.
      sessionIndex: null,
      memberId: null,
      detail:
        `${args.potsOverdrawn} preparation(s) do not hold what the plates draw ` +
        `from them once amounts are whole (worst gap ${args.potsOverdrawnWorstPerMille} ` +
        `per mille).`,
      // ⛔ `false`: voir le pavé ci-dessus. Un rappel modèle ne répare pas une
      // division qui ne tombe pas juste.
      repairable: false,
      magnitude: args.potsOverdrawnWorstPerMille,
      // ⛔ UNE DIVISION QUI NE TOMBE PAS JUSTE N'A NI CIBLE NI BORNE: son
      // ampleur est un pour-mille, pas une mesure contre un contrat.
      measure: null,
    });
  }
  for (const plate of args.outOfBounds) {
    const bande = plate.bound === "max"
      ? `at most ${plate.limit} g`
      : `at least ${plate.limit} g`;
    const geste = plate.bound === "max"
      ? `make the recipe DENSER — less water and less watery vegetable, more ` +
        `of the starch, protein or fat it already carries`
      : `make the recipe LIGHTER — more vegetable and more water-rich food, ` +
        `less oil and less dense starch`;
    out.push({
      kind: "sizing",
      day: plate.day,
      slot: plate.slot,
      dish: null,
      cause: null,
      date: null,
      preparationId: null,
      source: "quantities",
      // ⚠️ UN CONSTAT DE QUANTITÉ PORTE SUR UNE ASSIETTE, jamais sur un déroulé.
      sessionIndex: null,
      memberId: null,
      detail: `the ${plate.slot ?? "meal"} plate weighs ${plate.grams} g ` +
        `cooked, and a plate here must be ${bande}. Keep the same energy and ` +
        `${geste}. Do NOT change how much is served — the app decides that.`,
      repairable: true,
      // ⚠️ L'AMPLEUR EST EN GRAMMES, l'unité du défaut. Elle ne s'additionne
      // jamais avec des kcal/100 g: `magnitudeComparison` apparie par nature.
      magnitude: Math.abs(plate.grams - plate.limit),
      // ⟳ 2026-09-12 · LOT 2 — LA MASSE MESURÉE ET SA BORNE, PAS SEULEMENT
      // L'ÉCART. « De combien » ne veut rien dire sans « par rapport à quoi ».
      measure: {
        of: "mass",
        grams: plate.grams,
        minG: plate.bound === "min" ? plate.limit : null,
        maxG: plate.bound === "max" ? plate.limit : null,
      },
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA PASSE — TOUT CE QU'UNE CANDIDATE A DE FAUX, EN UNE LISTE
// ═══════════════════════════════════════════════════════════════════════════

export interface PlanControlFindings {
  /** La sortie de `finalPlanGate` sur le payload EXACT qui partirait en base. */
  readonly refusals: readonly GateRefusal[];
  /** La sortie de `checkOutputContract`. `null` = pas de contrat lisible. */
  readonly outputContract: OutputContractReport | null;
  /** Les tables qui ont produit les refus de nutrition. `null` = pas mesuré. */
  readonly nutrition: {
    readonly cells: readonly CellNutritionRow[];
    readonly days: readonly DayNutritionRow[];
  } | null;
  readonly roundedToZero: readonly RoundedToZeroLine[];
  readonly potsOverdrawn: number;
  readonly potsOverdrawnWorstPerMille: number;
  readonly outOfBounds: readonly OutOfBoundsPlate[];
  /**
   * ⟳ 2026-09-12 · LOT 2 — LES CONTRATS DES CASES (cible, bornes, couloir).
   *
   * ⛔ FACULTATIF DANS LE TYPE, MAIS SON ABSENCE SE COMPTE. Le générateur les a
   * déjà sous la main (`auditCells`, la liste même qu'il passe à
   * `cellNutritionTable`); un appelant qui ne les passe pas rend
   * `measured.unnumbered > 0` et `measured.contracts === 0`, deux nombres qui
   * partent au journal. Les rendre obligatoires aurait cassé le chemin
   * d'ADOPTION, qui relit une ligne de base et n'a aucun contrat — et c'est
   * exactement le chemin où « je n'ai pas les bornes » est la vérité.
   */
  readonly contracts?: readonly CellContractRow[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 1 — LES CONSTATS D'AMONT
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QU'ILS PORTENT, ET QUE LES TROIS AUTRES SOURCES N'ONT PAS. Sept
   * sites du générateur mesuraient des choses que la garde finale ne mesure
   * pas — une ancre protéique absente, une bouche non nourrie, une préférence
   * jamais composée, et surtout la RÉPARABILITÉ PAR COMPOSANT d'une assiette
   * hors bornes (quel ingrédient est gelé, lequel peut être retravaillé). Ils
   * appelaient chacun le modèle pour leur compte ; ils déposent maintenant leur
   * constat ici, et une seule décision part.
   *
   * ⚠️ FACULTATIF, ET SON ABSENCE SE COMPTE (`bySource.upstream`). Le chemin
   * d'adoption relit une ligne de base et n'a aucun de ces sept sites derrière
   * lui : `0` y est la vérité, pas un oubli.
   */
  readonly upstream?: readonly RepairDefect[];
}

export interface PlanDefectPass {
  /** TOUS les défauts, dans l'ordre du chantier. */
  readonly defects: readonly RepairDefect[];
  /** Ceux qu'un appel modèle peut réparer. Sous-ensemble de `defects`. */
  readonly repairable: readonly RepairDefect[];
  /**
   * ⟳ 2026-09-15 · DÉCISION PRODUIT — CEUX QUI EMPÊCHERAIENT LE PLAN DE PARTIR.
   *
   * Sous-ensemble de `defects` : les défauts issus d'une cause de la garde
   * finale dont la sévérité, DANS CE RUN, est `refuse`. Un écart compté
   * (`protein_floor_short`, `cell_bounds_off`…) n'en fait pas partie : le plan
   * part avec lui, nommé.
   *
   * ⛔ MESURÉ SUR HUIT TIRS LE 2026-09-15 : les deux tirs réparés l'ont été sur
   * des écarts comptés, quatre appels payés, zéro écart fermé.
   *
   * ⟳ 2026-09-19 — CE N'EST PLUS CE NOMBRE QUI AUTORISE L'APPEL : c'est
   * `mustRepair`, juste en dessous. `blocking` reste ce qu'il dit — ce qui
   * empêche la LIVRAISON — et c'est ce que les journaux continuent d'écrire.
   */
  readonly blocking: readonly RepairDefect[];
  /**
   * ⟳ 2026-09-19 — CE QUI VAUT UN APPEL DE RÉPARATION : `blocking` ∪ les causes
   * chassées (`CHASED_CAUSES`, `plan_repair_loop.ts`). Depuis ce jour une case
   * trouée ne refuse plus le plan, mais elle se répare tant qu'il reste du
   * budget ; sans cette liste, la bascule en `count` aurait éteint sa
   * réparation. C'est ce nombre, et lui seul, que lit
   * `planRepairDecision.mustRepair`.
   */
  readonly mustRepair: readonly RepairDefect[];
  /** Le compte par nature — le dénominateur du rapport. */
  readonly byKind: Readonly<Record<string, number>>;
  /** ⛔ D'OÙ VIENT CHAQUE DÉFAUT. Sans lui, « 37 défauts » ne se relit pas. */
  readonly bySource: {
    readonly gate: number;
    readonly output_contract: number;
    readonly quantities: number;
    /** ⟳ 2026-09-12 · FERMETURE LOT 1 — les sept sites d'amont, réunis. */
    readonly upstream: number;
  };
  /**
   * ⟳ 2026-09-12 · LOT 2 — CE QU'ON A SU CHIFFRER, ET CE QU'ON N'A PAS SU.
   *
   * ⛔ OBLIGATOIRE, PARCE QU'UN LOT DÉSARMÉ RESSEMBLE À UN LOT QUI MARCHE.
   * `contracts: 0` dit « personne ne m'a passé les bornes »; `unnumbered > 0`
   * dit « des refus de nutrition sont partis sans mesure ». Sans ces deux
   * nombres, une passe qui ne reçoit rien rend exactement la même liste de
   * défauts qu'une passe complète — avec des phrases plus vagues que personne
   * ne relit.
   */
  readonly measured: {
    readonly contracts: number;
    readonly measures: number;
    readonly unnumbered: number;
  };
}

/**
 * LA PASSE COMMUNE. Une candidate finalisée entre, tous ses défauts sortent.
 *
 * ⛔ AUCUNE DES TROIS SOURCES N'A DE BOUCLE À ELLE. C'est la phrase du plan, et
 * c'est la propriété qui rend l'arbitrage possible : on ne peut pas décider
 * « garde-t-on un slot pour la densité » au site de la protéine si la densité
 * n'a pas encore été mesurée. Tout est mesuré, PUIS on décide une fois.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function collectPlanDefects(
  findings: PlanControlFindings,
): PlanDefectPass {
  const magnitudes = nutritionMagnitudes(
    findings.refusals,
    findings.nutrition,
    findings.contracts,
  );
  // ⛔ TOUJOURS CONSTRUITE, TOUJOURS PASSÉE. `defectsFromRefusals` rend ses
  // deux derniers arguments facultatifs pour le chemin d'adoption; ICI, le
  // chemin armé, ils ne le sont pas. Un test épingle les deux.
  const readout = nutritionReadout(
    findings.refusals,
    findings.nutrition,
    findings.contracts,
  );
  const fromGate = defectsFromRefusals(
    findings.refusals,
    magnitudes,
    readout.measures,
    readout.details,
  );
  const fromContract = findings.outputContract === null
    ? []
    : defectsFromOutputContract(findings.outputContract);
  const fromQuantities = defectsFromQuantities({
    roundedToZero: findings.roundedToZero,
    potsOverdrawn: findings.potsOverdrawn,
    potsOverdrawnWorstPerMille: findings.potsOverdrawnWorstPerMille,
    outOfBounds: findings.outOfBounds,
  });
  // ⛔ LES QUATRE SOURCES ENTRENT DANS LE MÊME TRI. C'est la propriété qui rend
  // l'arbitrage possible : on ne peut pas décider « garde-t-on un slot pour la
  // densité » au site de la protéine si la densité n'a pas encore été mesurée.
  const fromUpstream = findings.upstream ?? [];
  const defects = orderDefects([
    ...fromGate,
    ...fromContract,
    ...fromQuantities,
    ...fromUpstream,
  ]);
  const byKind: Record<string, number> = {};
  for (const d of defects) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  // ⛔ LA SÉVÉRITÉ EST CELLE DU RUN, PAS D'UNE TABLE RELUE ICI : la garde a déjà
  // appliqué sa politique, et un même `cause` porte la même sévérité pour tout
  // le plan. On ne recopie aucune politique — on lit ce que la garde a décidé.
  const causesBloquantes = new Set(
    findings.refusals.filter((r) => r.severity === "refuse").map((r) => r.cause),
  );
  return {
    defects,
    repairable: defects.filter((d) => d.repairable),
    // ⟳ 2026-09-15 · BÊTA — le refus de masse est bloquant par construction
    // (le handler le rend en 422), même s'il n'est pas un refus de la garde.
    blocking: defects.filter((d) =>
      d.cause !== null &&
      (causesBloquantes.has(d.cause as never) || d.cause === POT_MASS_UNRECONCILED_CAUSE)
    ),
    // ⟳ 2026-09-19 — bloquants ∪ chassés. La liste est lue ICI et nulle part
    // ailleurs ; `blocking` ne change pas de sens.
    mustRepair: defects.filter((d) =>
      d.cause !== null &&
      (causesBloquantes.has(d.cause as never) ||
        d.cause === POT_MASS_UNRECONCILED_CAUSE ||
        CHASED_CAUSES.has(d.cause))
    ),
    byKind,
    bySource: {
      gate: fromGate.length,
      output_contract: fromContract.length,
      quantities: fromQuantities.length,
      upstream: fromUpstream.length,
    },
    measured: {
      contracts: findings.contracts?.length ?? 0,
      measures: readout.measures.size,
      unnumbered: readout.unnumbered,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA DEMANDE DE CORRECTION — identifiants stables, mesures, contrats
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'une journée en défaut a servi, et ce qu'elle devait. */
export interface RepairDayContext {
  readonly memberId: string;
  /**
   * ⛔ LA DATE, PARCE QUE C'EST L'IDENTITÉ DU REFUS. Depuis l'étape C4,
   * `protein_floor_short` et `day_energy_off` portent `day: <date>` — c'est ce
   * que `DayNutritionRow` connaît. L'appariement se fait dessus.
   */
  readonly date: string;
  /** Le jeton de jour du plan (`sat`), la langue du modèle. */
  readonly dayToken: string;
  readonly proteinNowG: number | null;
  readonly proteinFloorG: number | null;
  /** ⟳ 2026-09-21 — le plafond couvert de la journée, ou `null`. */
  readonly proteinCeilingG: number | null;
  readonly kcalNow: number | null;
  readonly kcalBudget: number | null;
  /** Les plats qui nourrissent cette journée-là, dans l'ordre du jour. */
  readonly dishes: readonly {
    readonly slot: string;
    readonly title: string;
    readonly proteinG: number | null;
    readonly servedKcal: number | null;
    readonly grams: number | null;
    /** ⟳ 2026-09-21 — d'autres bouches mangent ce plat à cette case. */
    readonly shared: boolean;
    /**
     * ⟳ 2026-09-21 — vrai quand le plat est partagé ET que chaque autre
     * bouche de la case est au-dessus de son plancher (marge de 10 %): sa
     * protéine peut descendre sans affamer personne. C'est le seul geste qui
     * ramène un gros mangeur sous son plafond quand ses cases seules sont
     * déjà justes — mesuré: Thomas à +56 % avec des collations à la carte.
     */
    readonly sharedLowerable: boolean;
  }[];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 1 — LE PLAFOND COMPTE DES BLOCS, PLUS DES LIGNES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE L'ANCIEN PLAFOND FAISAIT, ET IL EST ARCHIVÉ. `REPAIR_MAX_LINES = 24`
 * coupait la liste à la 24ᵉ LIGNE et posait « … and 41 more of the same kind. »
 * (tir `perte-h4n4`, 2026-09-11). Les 41 défauts perdus n'étaient pas « du même
 * genre » : c'étaient les journées de deux bouches sur quatre, leurs cibles, et
 * leurs créneaux. Une personne disparaissait par troncature, en silence.
 *
 * ⛔ CE QUI CHANGE : CE QU'ON COMPTE. Un BLOC, c'est-à-dire une adresse et
 * TOUTES les personnes qu'elle porte. Un bloc entre entier ou n'entre pas ; il
 * n'est jamais amputé d'une bouche. Regrouper les quatre contrats d'une même
 * journée sous une seule adresse fait tenir un foyer de quatre bouches sur
 * trois jours là où quatre lignes séparées ne tenaient pas.
 *
 * ⛔ ET AU-DELÀ : le surplus se COMPTE (`dropped`) ; l'appel s'arrête seulement
 * si une bouche nommée disparaît, si un interdit ou un repas manquant sort, ou
 * si le plafond de caractères invalide tout le rendu. Un grammage de trop de
 * la même bouche n'est plus un arrêt — mesuré tir2-s2, campagne 2026-09-14.
 *
 * ⛔ LA VALEUR VIENT D'UNE MESURE, PAS D'UN CONFORT. Sur la forme du tir
 * `perte-h4n4` — 4 bouches, 3 jours, 55 défauts réparables mêlant sécurité,
 * journées, cases, densité d'amont, complément et protéines — le rendu groupé
 * fait **31 blocs, 245 lignes, 20 272 caractères**. 24 en laissait 7 dehors,
 * c'est-à-dire refusait l'appel sur le cas nominal du foyer. 40 couvre cette
 * forme avec de la marge, et ne laisse pas passer une liste sans fond : au-delà,
 * `contextIncomplete` mord. `plan_repair_attribution_test.ts` § ⑤ épingle les
 * deux côtés.
 */
export const REPAIR_MAX_BLOCKS = 40;

/**
 * ⛔ LE SECOND PLAFOND, EN CARACTÈRES, ET IL EST LA VRAIE LIMITE DE LECTURE.
 *
 * Un bloc porte autant de lignes qu'il a de bouches : compter des blocs ne borne
 * donc pas la taille. Mesuré sur la même forme : 31 blocs, 20 272 caractères.
 * 30 000 laisse la marge d'un foyer plus grand et arrête net une liste qui n'en
 * finit pas — auquel cas on rend `contextIncomplete`, on ne coupe pas.
 */
export const REPAIR_DEFECT_HARD_CHARS = 30_000;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LE PLAFOND DU FOYER DANS LA RÉPARATION, EN CARACTÈRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les quatre blocs de `RepairHouseholdContext` (notes, fiches, recette de
 * référence, à-côtés) passent en ENTIER ou pas du tout — un bloc coupé au
 * milieu est un contexte amputé présenté comme complet. L'audit du 2026-09-23
 * estime l'ajout à ~3 Ko sur le foyer audité; 8 000 laisse la marge d'un
 * foyer de six sans laisser passer un corpus de notes sans fond. Le plafond
 * porte sur le CONTENU des blocs ; l'en-tête fixe (quatre lignes) s'y ajoute.
 *
 * ⚠️ AU-DELÀ, ON LE DIT (`household.dropped`), et si ce sont les NOTES qui ne
 * tiennent pas, on ne part pas (`contextIncomplete`) : sans elles, la
 * réparation a resservi des œufs à Christèle sur e0325544.
 */
export const REPAIR_HOUSEHOLD_MAX_CHARS = 8_000;

/**
 * LES QUATRE BLOCS DU FOYER, DANS L'ORDRE OÙ ILS ENTRENT SOUS LE PLAFOND.
 *
 * ⛔ Les notes d'abord : ce que quelqu'un a demandé d'éviter est la seule
 * perte qui fait resservir un aliment refusé. Puis les fiches (qui mange, avec
 * quel objectif), la recette de référence (ce qu'est une part), les à-côtés.
 * Le RENDU, lui, suit l'ordre de lecture : qui, ce qu'ils ont demandé, une
 * part, les à-côtés.
 */
export const REPAIR_HOUSEHOLD_BLOCKS = [
  "notes",
  "cards",
  "standardRecipe",
  "sideCourses",
] as const;
export type RepairHouseholdBlock = (typeof REPAIR_HOUSEHOLD_BLOCKS)[number];

/** L'ordre de lecture des blocs dans le message. */
const HOUSEHOLD_READING_ORDER: readonly RepairHouseholdBlock[] = [
  "cards",
  "notes",
  "standardRecipe",
  "sideCourses",
];

/** Ce que le rendu du foyer a produit, et ce qu'il a laissé dehors. */
export interface RepairHouseholdRender {
  readonly lines: readonly string[];
  /** Les blocs rendus, dans l'ordre de lecture. */
  readonly kept: readonly RepairHouseholdBlock[];
  /** Les blocs NON VIDES laissés dehors par le plafond. */
  readonly dropped: readonly RepairHouseholdBlock[];
  /** Les blocs vides — rien à dire, pas une perte. */
  readonly empty: readonly RepairHouseholdBlock[];
  readonly chars: number;
}

/**
 * ⟳ 2026-09-23 — LE FOYER, RENDU POUR LA RÉPARATION.
 *
 * ⛔ CE QU'IL FERME, MESURÉ (audit du 2026-09-23, lot 4 d). La réparation ne
 * recevait ni les fiches, ni les notes, ni la recette de référence : sur
 * cc012345 elle a réécrit 12 boîtes — sardines et 3 tranches de pain, tofu au
 * déjeuner, 200 g de yaourt pour tout le monde ; sur e0325544 elle a resservi
 * des œufs à Christèle. Elle composait pour une table qu'on ne lui avait pas
 * décrite.
 *
 * ⚠️ LES BLOCS SONT DÉJÀ RÉDIGÉS PAR L'APPELANT, par les mêmes fonctions que le
 * premier jet. Les réécrire ici serait une seconde formulation de la même
 * règle, à deux fichiers d'écart.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairHouseholdLines(
  household: RepairHouseholdContext,
  maxChars: number,
): RepairHouseholdRender {
  const texte = (b: RepairHouseholdBlock): string => String(household[b] ?? "").trim();
  const empty = REPAIR_HOUSEHOLD_BLOCKS.filter((b) => texte(b) === "");
  const kept = new Set<RepairHouseholdBlock>();
  const dropped: RepairHouseholdBlock[] = [];
  let used = 0;
  for (const b of REPAIR_HOUSEHOLD_BLOCKS) {
    const t = texte(b);
    if (t === "") continue;
    // +2 : la ligne vide qui sépare deux blocs.
    if (used + t.length + 2 > maxChars) {
      dropped.push(b);
      continue;
    }
    used += t.length + 2;
    kept.add(b);
  }
  const ordre = HOUSEHOLD_READING_ORDER.filter((b) => kept.has(b));
  if (ordre.length === 0) {
    return { lines: [], kept: [], dropped, empty, chars: 0 };
  }
  const lines = [
    "== THE HOUSEHOLD THIS PLAN FEEDS — THE SAME FACTS THE FIRST PLAN WAS WRITTEN FROM ==",
    // ⛔ L'ÉCHAPPATOIRE NOMMÉE : une réparation qui ne voit que ses défauts
    // compose pour personne, et resservir un aliment refusé est exactement ce
    // qu'elle a fait (œufs, e0325544).
    "⛔ Every dish you return is eaten by these people. What a note asks to avoid",
    // ⚠️ « below » NE RENVOIE À LA RECETTE QUE SI ELLE EST IMPRIMÉE : un renvoi
    // vers un bloc absent est la cicatrice du « ci-dessus » qui ne pointe nulle
    // part.
    ...(kept.has("standardRecipe")
      ? [
        "stays avoided in the dishes you rewrite, and one serving stays the size of",
        "the reference recipe below — fixing one figure never licenses breaking these.",
      ]
      : ["stays avoided in the dishes you rewrite — fixing one figure never licenses that."]),
    "",
  ];
  for (const [k, b] of ordre.entries()) {
    if (k > 0) lines.push("");
    lines.push(...texte(b).split("\n"));
  }
  return { lines, kept: ordre, dropped, empty, chars: lines.join("\n").length };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ bis · ⟳ 2026-09-13 · LOT 1 — L'ADRESSE STRUCTURÉE D'UNE INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES CAUSES DONT LE DÉFAUT APPARTIENT À **UNE** PERSONNE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI UNE LISTE FERMÉE, ET PAS UNE DEVINETTE. Un `day_energy_off` est le
 * contrat d'UNE bouche : trois bouches au même jour rendent TROIS refus, avec
 * trois cibles. Un `table_exclusion_served`, lui, appartient à la table. La
 * différence ne se lit ni dans `kind` ni dans `detail` — seulement dans la
 * cause. Sans cette liste, « personne non résolue » et « défaut collectif » se
 * relisent pareil, et on repart anonyme.
 *
 * ⛔ UN DÉFAUT DE CETTE FAMILLE SANS `memberId` EST UN CONTEXTE INCOMPLET. Il
 * n'est pas rendu anonyme : il fait rendre `contextIncomplete`, et l'appelant
 * ne part pas.
 */
export const PERSONAL_DEFECT_CAUSES: ReadonlySet<string> = new Set([
  "cell_energy_off",
  "day_energy_off",
  "protein_floor_short",
  "protein_ceiling_over",
  "mouth_energy_short",
  "mouth_unfed",
  "cell_without_portion",
  "dedicated_complement_needed",
]);

/**
 * LES CAUSES QU'ON REGROUPE PAR JOURNÉE, ET DONT LES NOMBRES SONT STRUCTURÉS.
 *
 * ⛔ LA PHRASE DU BLOC NE PORTE AUCUN CHIFFRE, ET C'EST LA MOITIÉ DE LA
 * CORRECTION. Trois personnes au même jour partageaient la même phrase « they
 * must carry N kcal » avec trois N différents : la phrase de l'une se lisait
 * comme la règle de toutes. Les nombres descendent sur la ligne de leur
 * propriétaire ; la phrase, elle, dit le GESTE, qui est commun.
 */
const GROUPED_CAUSE_HEADS: Readonly<Record<string, readonly string[]>> = Object
  .freeze({
    cell_energy_off: [
      "ONE SERVING OF THIS MEAL DOES NOT CARRY WHAT IT OWES. Each line below is",
      "ONE person's contract at ONE slot. Change what the recipe is MADE OF, not",
      "how much is served — the app decides that.",
    ],
    cell_bounds_off: [
      "THESE PLATES ARE OUTSIDE THEIR BAND, and their calories are already right.",
      "Each line below is ONE person's plate. Reach the band by what the dish is",
      "MADE OF — less water and less watery vegetable for a denser dish, more of",
      "them for a lighter one. Do NOT change how much is served.",
    ],
    day_energy_off: [
      "ACROSS THIS DAY, THE PLATES DO NOT CARRY WHAT THEY OWE. Each line below is",
      "ONE person's contract for the whole day. Change what the meals are MADE OF,",
      "not how much is served.",
    ],
  });

/**
 * ⛔ LA LIGNE QUI FERME LES DEUX ÉCHAPPATOIRES D'UN BLOC À PLUSIEURS CONTRATS.
 *
 * Ce dépôt a mesuré qu'une consigne dont l'échappatoire n'est pas nommée se fait
 * satisfaire par elle. Deux cibles opposées sur une recette unique en ont deux :
 * en faire la moyenne, ou élargir la tolérance jusqu'à ce que les deux passent.
 */
const PER_PERSON_GUARD: readonly string[] = [
  "⛔ These figures are PER PERSON. Do not average them, and do not widen any",
  "   tolerance. If two of them cannot hold in one recipe, leave the shared dish",
  "   right for the others and use the unit listed for that person instead.",
];

/** Un nombre pour une ligne de champs. `?` quand on ne sait pas. */
function champ(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "?";
  }
  return String(Math.round(value));
}

/**
 * CE QUI A ÉTÉ MESURÉ, EN CHAMPS — jamais en prose.
 *
 * ⛔ LA NATURE ET L'UNITÉ SONT DANS LE NOM DU CHAMP. `measureUnit()` dit la même
 * chose en toutes lettres ; l'écrire deux fois ferait deux formulations de la
 * même grandeur, et c'est la seconde qu'on relit le moins.
 */
export function repairMeasureFields(m: RepairMeasure): string {
  switch (m.of) {
    case "energy":
      return [
        `measure=energy(${measureUnit(m)})`,
        `energy_served_kcal=${champ(m.servedKcal)}`,
        `target_kcal=${champ(m.targetKcal)}`,
        `tolerance_pct=${champ(m.tolerancePct)}`,
      ].join(" | ");
    case "mass":
      return [
        `measure=mass(${measureUnit(m)})`,
        `mass_served_g=${champ(m.grams)}`,
        `min_g=${champ(m.minG)}`,
        `max_g=${champ(m.maxG)}`,
      ].join(" | ");
    case "density":
      return [
        `measure=density(${measureUnit(m)})`,
        `density_served_per_100g=${champ(m.per100G)}`,
        `min_per_100g=${champ(m.minPer100G)}`,
        `max_per_100g=${champ(m.maxPer100G)}`,
      ].join(" | ");
    case "protein":
      return [
        `measure=protein(${measureUnit(m)})`,
        `protein_served_g=${champ(m.servedG)}`,
        `protein_floor_g=${champ(m.floorG)}`,
        `protein_ceiling_g=${champ(m.ceilingG)}`,
      ].join(" | ");
  }
}

/** L'étendue d'un défaut — ce que son adresse recouvre. */
type DefectScope = "session" | "preparation" | "meal" | "day" | "plan";

function scopeOf(d: RepairDefect): DefectScope {
  if (d.sessionIndex !== null) return "session";
  if (d.preparationId !== null && d.preparationId.trim() !== "") {
    return "preparation";
  }
  const slot = String(d.slot ?? "").trim();
  if (slot !== "") return "meal";
  const jour = String(d.date ?? d.day ?? "").trim();
  return jour === "" ? "plan" : "day";
}

/** Une date ISO, par opposition à un jeton de jour (`sat`). */
function estDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * LES UNITÉS QU'UN DÉFAUT DÉSIGNE — par la table, jamais par un titre.
 *
 * ⛔ CE N'EST PAS `repairScopeOf`, ET LES DEUX NE SE REMPLACENT PAS. Le
 * PÉRIMÈTRE décide de ce que le modèle a le droit de changer, et il agrège tous
 * les défauts ; ici on écrit l'ADRESSE d'UN défaut, pour que sa phrase désigne
 * quelque chose. Une adresse vide est une adresse vide — on n'élargit pas.
 *
 * ⚠️ `index === null` ⇒ aucune unité citée. Le repli rend quand même la
 * personne, la date et le créneau : une table d'unités absente ne doit pas
 * effacer l'identité, elle doit effacer les seuls jetons qu'on ne peut pas
 * connaître.
 */
function unitsForDefect(
  index: RepairUnitIndex | null,
  d: RepairDefect,
): string[] {
  if (index === null) return [];
  const membre = d.memberId === null || d.memberId.trim() === ""
    ? null
    : d.memberId.trim();
  const pourLui = (u: { ownerId: string | null; eaters: readonly string[] }) =>
    membre === null || u.ownerId === membre || u.eaters.includes(membre);
  const pot = d.preparationId === null ? "" : d.preparationId.trim();
  if (pot !== "") {
    const tirees = index.units.filter((u) => u.preparationIds.includes(pot));
    if (tirees.length > 0) {
      const miennes = tirees.filter(pourLui);
      return (miennes.length > 0 ? miennes : tirees).map((u) => u.unitId);
    }
  }
  const slot = String(d.slot ?? "").trim();
  const jour = String(d.day ?? "").trim();
  const date = String(d.date ?? "").trim();
  const memeJour = (u: { date: string | null; dayToken: string }) => {
    if (date !== "" && u.date === date) return true;
    if (jour === "") return date === "";
    return estDate(jour) ? u.date === jour : u.dayToken === jour;
  };
  if (jour === "" && date === "" && slot === "") return [];
  const cibles = index.units.filter((u) =>
    memeJour(u) && (slot === "" || u.slot === slot) && pourLui(u)
  );
  return cibles.map((u) => u.unitId);
}

/**
 * L'ADRESSE D'UN DÉFAUT, EN CHAMPS STRUCTURÉS.
 *
 * ⛔ « sat/dinner "Poulet quinoa": » ÉTAIT L'ANCIENNE ADRESSE, ET ELLE JETAIT LE
 * PROPRIÉTAIRE. `RepairDefect.memberId` était présent sur le défaut et absent de
 * la phrase — c'est le défaut A du tir archivé `perte-h4n4`.
 *
 * ⛔ L'IDENTIFIANT CANONIQUE, JAMAIS LE PRÉNOM. Deux personnes du même prénom
 * restent deux personnes ; un prénom n'est pas une clé de jointure, et ce dépôt
 * a déjà payé les rapprochements par texte.
 *
 * ⚠️ UN DÉFAUT COLLECTIF N'EN PORTE PAS. Une session de cuisine n'a ni bouche ni
 * propriétaire : lui attribuer le maître de maison serait l'attribution
 * arbitraire que le chantier interdit.
 */
function defectAddress(
  d: RepairDefect,
  index: RepairUnitIndex | null,
  options?: { readonly withMember?: boolean; readonly withDay?: boolean },
): string {
  const avecBouche = options?.withMember ?? true;
  const avecJour = options?.withDay ?? true;
  const champs: string[] = [];
  const membre = d.memberId === null ? "" : d.memberId.trim();
  if (avecBouche && membre !== "") champs.push(`member_id=${membre}`);
  const date = String(d.date ?? "").trim();
  const jour = String(d.day ?? "").trim();
  if (avecJour) {
    if (date !== "") champs.push(`date=${date}`);
    if (jour !== "" && jour !== date) champs.push(`day=${jour}`);
  }
  const slot = String(d.slot ?? "").trim();
  if (slot !== "") champs.push(`slot=${slot}`);
  champs.push(`scope=${scopeOf(d)}`);
  const dish = d.dish === null ? "" : d.dish.trim();
  if (dish !== "") champs.push(`dish=${JSON.stringify(dish)}`);
  const pot = d.preparationId === null ? "" : d.preparationId.trim();
  if (pot !== "") champs.push(`preparation=${pot}`);
  if (d.sessionIndex !== null) champs.push(`session_index=${d.sessionIndex}`);
  const unites = unitsForDefect(index, d);
  if (unites.length > 0) champs.push(`units=${unites.join(",")}`);
  return champs.join(" | ");
}

/**
 * LA CONSIGNE DE RÉPARATION, POUR TOUS LES DÉFAUTS D'UN COUP.
 *
 * ⛔ UNE SEULE INSTRUCTION, PAS UNE PAR DÉFAUT. C'est la moitié de
 * `plan_repair_loop.ts` : « deux défauts présents en même temps partaient en
 * DEUX appels au lieu d'une instruction ». L'ordre des sections est celui de
 * `REPAIR_DEFECT_KINDS` — sécurité, repas manquant, grammage, protéine,
 * préférence — parce qu'« une instruction qui commence par "ajoute des
 * lentilles" avant de dire "ce plat contient l'allergène de quelqu'un" fait
 * lire le second comme un détail ».
 *
 * ⛔ POUR LA PROTÉINE, ON DONNE LES TROIS NOMBRES ET ON FERME LES DEUX
 * ÉCHAPPATOIRES. Le plan l'écrit : « recomposer à calories et masse
 * compatibles ; ne pas ajouter mécaniquement de la viande ou augmenter tout le
 * plat. » Les deux interdits sont donc LITTÉRAUX — ce dépôt a mesuré qu'une
 * consigne dont l'échappatoire n'est pas nommée se fait satisfaire par elle.
 *
 * `null` = rien à demander.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function planRepairRequest(args: {
  readonly defects: readonly RepairDefect[];
  /** Le contexte des journées en défaut protéique. Vide = aucun. */
  readonly days: readonly RepairDayContext[];
  /**
   * ⟳ 2026-09-13 · LOT 1 — LA TABLE DES UNITÉS, REQUISE ET NULLABLE.
   *
   * ⛔ JAMAIS `?`, ET C'EST LA RÈGLE DU DÉPÔT
   * (`optional-gate-params-are-disarmed-gates`). Facultative, elle ferait de
   * « je n'ai pas la table » la réponse silencieuse de tous les appelants, et
   * l'adresse repartirait sans jeton d'unité sans que personne le voie.
   *
   * ⚠️ `null` EST UNE RÉPONSE, PAS UN OUBLI : le chemin d'adoption relit une
   * ligne de base et n'a pas de table. On rend alors la personne, la date et le
   * créneau — et AUCUNE unité, parce qu'on n'en connaît aucune.
   */
  readonly index: RepairUnitIndex | null;
}): string | null {
  const rendu = repairDefectLines(args);
  if (rendu === null) return null;
  return rendu.lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · FERMETURE LOT 1 — `REPAIR_CLOSING_LINES` A ÉTÉ SUPPRIMÉE
// ══════════════════════════════════════════════════════════════════════════
//
// Elle disait « Return the full plan JSON with only the dishes named above […]
// changed » — à un modèle qui ne voit qu'une PROJECTION COMPACTE. On lui
// demandait donc de recopier des objets qu'on ne lui avait pas donnés, et le
// garde-fou d'en face rejetait ensuite toute réponse plus courte que le plan
// (`shorter_plan`). Les deux se contredisaient, et la revue du 2026-09-12 l'a
// nommé : « la projection liste les plats sains sans leur contenu complet, tout
// en demandant encore de renvoyer le plan entier ».
//
// CE QUI LA REMPLACE: `repairPatchContractLines` (`plan_repair_patch.ts`), qui
// demande un PATCH — les seules unités autorisées, sous leur `unit_id`.

/** Un bloc d'instruction : une adresse, et TOUT ce qu'elle porte. */
interface DefectBlock {
  /** L'ordre de section — `REPAIR_DEFECT_KINDS`. */
  readonly kind: RepairDefect["kind"];
  readonly lines: readonly string[];
  /**
   * Les bouches nommées dans ce bloc. Vide = défaut collectif, ou propriétaire
   * déjà rangé dans `ownerless`. Sert à savoir si le plafond a fait disparaître
   * une PERSONNE, pas seulement un jour de grammage de trop.
   */
  readonly memberIds: readonly string[];
}

/** Ce que la composition des sections a produit, et ce qu'elle n'a pas su dire. */
export interface RepairDefectLines {
  readonly lines: readonly string[];
  /**
   * ⛔ LES DÉFAUTS PERSONNELS SANS PROPRIÉTAIRE RÉSOLVABLE. Non vide = le
   * contexte est INCOMPLET : un objectif individuel partirait anonyme, et le
   * modèle n'aurait aucun moyen de savoir à qui il obéit.
   */
  readonly ownerless: readonly string[];
  /** Le nombre de blocs composés, et celui qui n'a pas tenu sous le plafond. */
  readonly counts: {
    readonly blocks: number;
    readonly dropped: number;
  };
  /**
   * ⛔ `true` = NE PAS ENVOYER. Ce n'est plus « un bloc a débordé ». Tir2-s2
   * (campagne 2026-09-14) : 2 blocs de grammage hors plafond arrêtaient toute
   * réparation alors que le repas manquant tenait. On s'arrête si une bouche
   * nommée disparaît, si un bloc de sécurité / repas manquant sort, ou si le
   * plafond de caractères a tout invalidé.
   */
  readonly incomplete: boolean;
}

/**
 * LES SECTIONS DE DÉFAUTS, EN BLOCS ADRESSÉS. `null` = rien à demander.
 *
 * ⛔ UN BLOC PORTE UNE ADRESSE ET TOUTES SES PERSONNES. Les causes dont les
 * nombres sont structurés (`GROUPED_CAUSE_HEADS`) sont regroupées PAR JOURNÉE :
 * la phrase du geste est dite une fois, sans chiffre, et chaque contrat descend
 * sur la ligne de son propriétaire. C'est ce qui fait tenir quatre bouches sur
 * trois jours là où quatre lignes séparées débordaient.
 */
function repairDefectLines(args: {
  readonly defects: readonly RepairDefect[];
  readonly days: readonly RepairDayContext[];
  readonly index: RepairUnitIndex | null;
}): RepairDefectLines | null {
  const reparables = args.defects.filter((d) => d.repairable);
  if (reparables.length === 0) return null;
  const index = args.index;

  // ── LES DÉFAUTS PERSONNELS SANS PROPRIÉTAIRE ────────────────────────────
  //
  // ⛔ ON NE LES REND PAS ANONYMES. Un contrat individuel dont on a perdu la
  // bouche ferait composer au hasard : il rend `ownerless`, et l'appelant
  // s'arrête avant de dépenser une tentative.
  const ownerless = reparables
    .filter((d) =>
      d.cause !== null && PERSONAL_DEFECT_CAUSES.has(d.cause) &&
      (d.memberId === null || d.memberId.trim() === "")
    )
    .map((d) => `${d.cause}@${d.date ?? d.day ?? "?"}/${d.slot ?? "?"}`);

  const blocks: DefectBlock[] = [];

  /** Un bloc d'un seul défaut : son adresse, puis sa phrase. */
  const solo = (d: RepairDefect): DefectBlock => {
    const mesure = d.measure === null
      ? ""
      : ` | ${repairMeasureFields(d.measure)}`;
    const detail = String(d.detail ?? "").split("\n").filter((l) =>
      l.trim() !== ""
    );
    const owner = String(d.memberId ?? "").trim();
    return {
      kind: d.kind,
      lines: [
        `- ${defectAddress(d, index)}${mesure}`,
        ...detail.map((l) => `  ${l}`),
      ],
      memberIds: owner === "" ? [] : [owner],
    };
  };

  /**
   * LES DÉFAUTS D'UNE MÊME CAUSE ET D'UNE MÊME JOURNÉE, EN UN BLOC.
   *
   * ⚠️ LA CLÉ EST LA JOURNÉE, PAS LA CASE. Le créneau ne disparaît pas : il
   * descend sur la ligne de la personne, avec sa mesure et ses unités.
   */
  const groupes = (
    kind: RepairDefect["kind"],
    cause: string,
    tete: readonly string[],
    membres: readonly RepairDefect[],
  ): DefectBlock => {
    const premier = membres[0];
    // ⛔ LA TÊTE NE PORTE QUE LE GESTE, LA CAUSE ET LE JOUR. Le créneau et les
    // unités du premier défaut décriraient SA case et vaudraient pour les
    // autres : c'est très exactement l'erreur qu'on répare.
    const entete: string[] = [`cause=${cause}`];
    const date = String(premier.date ?? "").trim();
    const jour = String(premier.day ?? "").trim();
    if (date !== "") entete.push(`date=${date}`);
    if (jour !== "" && jour !== date) entete.push(`day=${jour}`);
    entete.push(`people=${membres.length}`);
    const lignes: string[] = [
      `- ${entete.join(" | ")}`,
      ...tete.map((l) => `  ${l}`),
    ];
    // ⛔ CHAQUE LIGNE PORTE SON ADRESSE ENTIÈRE. Un « voir ci-dessus » ne
    // traverse pas : ce dépôt a mesuré qu'une promesse et sa clé doivent se
    // toucher, sans quoi le modèle relit la première ligne du bloc comme la
    // règle de toutes.
    for (const d of membres) {
      const bout = [
        defectAddress(d, index),
        ...(d.measure === null ? [] : [repairMeasureFields(d.measure)]),
      ].join(" | ");
      lignes.push(`  · ${bout}`);
      // ⛔ ET SA PHRASE JUSTE EN DESSOUS, PAS EN TÊTE DE BLOC. Elle porte ce
      // que les champs ne portent pas — la densité servie à côté d'une borne
      // de masse, par exemple — et elle doit TOUCHER l'identifiant de la
      // personne dont elle parle. C'est le défaut A du tir archivé, pris à
      // l'endroit : une phrase chiffrée sans propriétaire adjacent se lit comme
      // la règle de tout le monde.
      for (const l of String(d.detail ?? "").split("\n")) {
        if (l.trim() !== "") lignes.push(`      ${l.trim()}`);
      }
    }
    lignes.push(...PER_PERSON_GUARD.map((l) => `  ${l}`));
    const memberIds = [
      ...new Set(
        membres.map((d) => String(d.memberId ?? "").trim()).filter((x) =>
          x !== ""
        ),
      ),
    ];
    return { kind, lines: lignes, memberIds };
  };

  /** Les défauts d'une nature, groupés quand leur cause le permet. */
  const composer = (kind: RepairDefect["kind"]): void => {
    const miens = reparables.filter((d) => d.kind === kind);
    if (miens.length === 0) return;
    /** clé → défauts, dans l'ordre d'arrivée. */
    const paquets = new Map<string, RepairDefect[]>();
    const ordre: string[] = [];
    for (const d of miens) {
      const groupable = d.cause !== null &&
        Object.hasOwn(GROUPED_CAUSE_HEADS, d.cause) && d.measure !== null &&
        d.memberId !== null && d.memberId.trim() !== "";
      const cle = groupable
        ? `g|${d.cause}|${d.date ?? d.day ?? ""}`
        : `s|${ordre.length}`;
      if (!paquets.has(cle)) {
        paquets.set(cle, []);
        ordre.push(cle);
      }
      paquets.get(cle)!.push(d);
    }
    for (const cle of ordre) {
      const lot = paquets.get(cle)!;
      if (cle.startsWith("g|") && lot.length >= 1) {
        const cause = lot[0].cause!;
        blocks.push(groupes(kind, cause, GROUPED_CAUSE_HEADS[cause], lot));
        continue;
      }
      for (const d of lot) blocks.push(solo(d));
    }
  };

  composer("safety");
  composer("missing_meal");
  composer("sizing");

  // ── LA PROTÉINE: LA SECTION QUI PORTE LES TROIS NOMBRES ──────────────────
  const proteines = reparables.filter((d) => d.kind === "protein");
  for (const d of proteines) {
    // ⚠️ LE CONTEXTE EST FACULTATIF ET SON ABSENCE SE VOIT: sans lui on rend
    // le `detail` de la garde, qui porte déjà la date et les deux grammages.
    // Un contexte manquant ne doit pas faire disparaître le défaut — mais
    // l'ADRESSE, elle, est rendue dans les deux cas.
    const ctx = args.days.find((c) =>
      c.memberId === d.memberId &&
      (d.day === null || c.date === d.day || c.dayToken === d.day)
    ) ?? null;
    const mesure = d.measure === null
      ? ""
      : ` | ${repairMeasureFields(d.measure)}`;
    const tete = `- ${defectAddress(d, index)}${mesure}`;
    const owner = String(d.memberId ?? "").trim();
    const memberIds = owner === "" ? [] : [owner];
    if (ctx === null) {
      blocks.push({
        kind: "protein",
        lines: [tete, `  ${d.detail}`],
        memberIds,
      });
      continue;
    }
    const lignes = [
      tete,
      d.cause === "protein_ceiling_over"
        ? `  On ${ctx.dayToken}, the plates served carry ${
          num(ctx.proteinNowG)
        } g of protein; they must carry at most ${
          num(ctx.proteinCeilingG)
        } g. Take it out of what this person eats alone first.`
        : `  On ${ctx.dayToken}, the plates served carry ${
          num(ctx.proteinNowG)
        } g of protein; they must carry at least ${num(ctx.proteinFloorG)} g.`,
    ];
    for (const dish of ctx.dishes) {
      // ⟳ 2026-09-21 — SUR UN DÉPASSEMENT, CHAQUE PLAT DIT S'IL PEUT BAISSER.
      const geste = d.cause !== "protein_ceiling_over"
        ? ""
        : !dish.shared
        ? " This person's own dish: take the protein out HERE first."
        : dish.sharedLowerable
        ? " Shared, and everyone at this table is above their floor: its protein MAY come down."
        : " Shared: leave it as it is, someone at this table needs it.";
      lignes.push(
        `  · "${dish.title}" at ${dish.slot} — ${num(dish.proteinG)} g protein, ` +
          `${num(dish.servedKcal)} kcal, ${num(dish.grams)} g cooked, in one serving.${geste}`,
      );
    }
    if (ctx.kcalBudget !== null) {
      lignes.push(
        `  The day's energy must stay at ${
          num(ctx.kcalBudget)
        } kcal (it is ${num(ctx.kcalNow)} now): the protein has to come from ` +
          `swapping food, not from adding it.`,
      );
    }
    blocks.push({ kind: "protein", lines: lignes, memberIds });
  }

  composer("preference");

  // ── LES BLOCS, DANS L'ORDRE DES SECTIONS ────────────────────────────────
  const ordreNature: Record<RepairDefect["kind"], number> = {
    safety: 0,
    missing_meal: 1,
    sizing: 2,
    protein: 3,
    preference: 4,
  };
  const ranges = blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) =>
      ordreNature[x.b.kind] - ordreNature[y.b.kind] || x.i - y.i
    )
    .map((x) => x.b);
  // ⛔ LE PLAFOND COUPE DES BLOCS, JAMAIS UNE PERSONNE DANS UN BLOC. Et ce qui
  // ne tient pas se DIT (`counts.dropped`), il ne se remplace pas par « et N
  // autres du même genre ».
  const gardes = ranges.slice(0, REPAIR_MAX_BLOCKS);
  const exclus = ranges.slice(REPAIR_MAX_BLOCKS);
  let dropped = exclus.length;

  const TITRES: Record<RepairDefect["kind"], readonly string[]> = {
    safety: ["⛔ SOMEONE IS SERVED WHAT THEY MUST NOT EAT:"],
    missing_meal: ["⛔ A MEAL IS MISSING:"],
    sizing: ["THESE DISHES DO NOT WORK AS WRITTEN:"],
    protein: [
      "THESE DAYS DO NOT CARRY ENOUGH PROTEIN. The figures below are grams of",
      "protein in the food as served:",
    ],
    preference: ["ALSO WRONG, AND SMALLER:"],
  };
  /**
   * ⛔ LES DEUX ÉCHAPPATOIRES DE LA PROTÉINE, LITTÉRALEMENT NOMMÉES, ET
   * REFERMÉES JUSTE APRÈS SA SECTION. Ce dépôt a mesuré qu'une consigne dont
   * l'échappatoire n'est pas nommée se fait satisfaire par elle.
   */
  const QUEUE_PROTEINE: readonly string[] = [
    "⛔ Keep each day's calories and each dish's cooked weight where they are",
    "(within a tenth). Reach the protein by RECOMPOSING: swap part of the starch",
    "or the fat for a protein-dense food already at home in that dish — fish,",
    "eggs, dairy, pulses, lean meat — or raise the protein share of a",
    "preparation the dish draws on.",
    "⛔ Do NOT simply add meat on top, and do NOT scale the whole dish up: both",
    "break the energy target the plates were sized on, and the app will refuse",
    "the result.",
  ];
  const lines: string[] = [];
  let nature: RepairDefect["kind"] | null = null;
  for (const b of gardes) {
    if (b.kind !== nature) {
      if (nature === "protein") lines.push(...QUEUE_PROTEINE);
      lines.push(...TITRES[b.kind]);
      nature = b.kind;
    }
    lines.push(...b.lines);
  }
  if (nature === "protein") lines.push(...QUEUE_PROTEINE);
  // ⛔ LE PLAFOND DE CARACTÈRES SE JUGE SUR LE RENDU, PAS SUR UN COMPTE DE
  // BLOCS: un bloc porte autant de lignes qu'il a de bouches. Au-delà, on ne
  // coupe pas — on le DIT, et l'appelant garde sa version.
  if (lines.join("\n").length > REPAIR_DEFECT_HARD_CHARS && dropped === 0) {
    dropped = ranges.length;
  }
  const truncatedHard = dropped === ranges.length && ranges.length > 0 &&
    lines.join("\n").length > REPAIR_DEFECT_HARD_CHARS;
  const bouchesDe = (lots: readonly DefectBlock[]): Set<string> => {
    const out = new Set<string>();
    for (const b of lots) for (const m of b.memberIds) out.add(m);
    return out;
  };
  const tenues = truncatedHard ? new Set<string>() : bouchesDe(gardes);
  const toutes = bouchesDe(ranges);
  const boucheAbsente = [...toutes].some((m) => !tenues.has(m));
  const requisDehors = truncatedHard ||
    exclus.some((b) => b.kind === "safety" || b.kind === "missing_meal");
  return {
    lines,
    ownerless,
    counts: { blocks: ranges.length, dropped },
    incomplete: requisDehors || boucheAbsente,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ⟳ 2026-09-12 · LOT 2 — LA DEMANDE QUI PORTE LE PLAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CONSIGNE DE RÉPARATION **AVEC** LE PLAN À RÉPARER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'ELLE FERME, ET LA MESURE EST SUR LES ARCHIVES. `planRepairRequest`
 * ci-dessus dit « garde tous les autres plats identiques » — et ne dit JAMAIS
 * lesquels. Le message de réparation partait comme le brief INITIAL plus cette
 * phrase : ni le plan, ni son texte source. Résultat mesuré sur les tirs n° 1
 * et n° 3 : **0/9 titres conservés, 2/5 identifiants de préparation**. Une
 * consigne n'est pas une donnée.
 *
 * ⛔ ET IL N'Y A AUCUN HISTORIQUE À L'AUTRE BOUT. `_shared/gemini.ts` envoie le
 * message comme `input`, sans `previous_response_id` : le modèle ne relit pas
 * sa propre réponse. Le plan doit être DANS la chaîne, ou il n'est nulle part.
 *
 * ⚠️ L'ORDRE EST CELUI DE LA LECTURE : ce qui a été jeté (s'il y a lieu), ce
 * qui ne va pas, le plan tel qu'il est, puis la consigne de sortie. La queue
 * est la même que `planRepairRequest` — `REPAIR_CLOSING_LINES`.
 *
 * `null` = rien à demander.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function planRepairMessage(args: {
  readonly defects: readonly RepairDefect[];
  readonly days: readonly RepairDayContext[];
  readonly plan: RepairPlanShape;
  /** La table des unités — c'est elle qui donne son adresse à chaque portion. */
  readonly index: RepairUnitIndex;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LA TABLE DES SESSIONS, REQUISE.
   *
   * ⛔ Sans elle, un déroulé à réécrire n'est ni projeté ni nommé dans le
   * périmètre : l'appel partirait en annonçant une réparation de session et le
   * modèle n'aurait ni le texte d'aujourd'hui ni son adresse.
   */
  readonly sessions: RepairSessionIndex;
  readonly scope: RepairScope;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-13 · LOT 2 — LES DEUX TABLES DES CASES, REQUISES ET NULLABLES
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QU'ELLES FERMENT, ET C'EST UN CRITÈRE DE SORTIE (§ 1.3) : « lorsque la
   * préparation modifiée nourrit plusieurs personnes ou plusieurs jours,
   * inclure les contrats nécessaires de TOUS ses consommateurs, y compris ceux
   * déjà conformes ». Sans ces tables, la projection dit qui mange dans la
   * casserole et combien de parts il en tire — jamais la cible ni les bornes de
   * ceux qui sont déjà justes.
   *
   * ⛔ JAMAIS `?`. Facultatives, « je n'ai pas les contrats » deviendrait la
   * réponse silencieuse de tous les appelants. `null` veut dire « il n'y a pas
   * de table de nutrition » — c'est la vérité du chemin d'adoption, qui relit
   * une ligne de base — et ça se compte (`projection.counters`).
   *
   * ⚠️ LES NOMBRES VIENNENT DE CES TABLES ET DE NULLE PART AILLEURS : la table
   * finale pour le SERVI, le contrat de composition pour la CIBLE et les
   * BORNES. Aucun recopiage d'une bouche sur une autre, aucune moyenne.
   */
  readonly nutrition: RepairNutritionTables | null;
  /**
   * ⛔ LA VERSION DU PLAN SUR LAQUELLE ON DEMANDE DE TRAVAILLER. Elle repart
   * dans le patch, et un patch qui cite une autre version est rejeté : c'est
   * la seule façon de distinguer « le modèle a répondu à la question d'avant »
   * d'une réparation qui n'a rien réparé.
   */
  readonly baseVersion: string;
  /**
   * ⛔ POURQUOI LA RÉPONSE PRÉCÉDENTE A ÉTÉ JETÉE. `null` = premier appel.
   * Un second essai qui ne le dit pas redemande la même chose et reçoit la
   * même réponse — c'est ce que la revue § 4 appelle « ne pas assurer qu'un
   * second essai réussira » pris à l'envers : on ne promet rien, mais on
   * donne au modèle ce qui manquait.
   */
  readonly afterVerdict: CandidateVerdict | null;
  /**
   * ⟳ 2026-09-19 — LE CATALOGUE D'ALIMENTS, LES MÊMES LIGNES QU'AU PREMIER JET.
   *
   * ⛔ REQUIS, JAMAIS `?` : `[]` est une réponse (« aucun catalogue en main »),
   * un oubli n'en est pas une. Mesuré sur le plan adopté du 2026-09-19 (foyer
   * `fagenty`) : le message de réparation ne portait AUCUNE liste d'ids, et
   * les plats créés pour les cases vides citaient `hummus`, `smoked_salmon`
   * (inconnus de la table), « lentilles » et « pain complet » sans ref. Un
   * seul ingrédient non résolu rend le plat entier non mesurable
   * (`measurePlate`), donc sans boîte, donc « repas sans portion » — 14 fois
   * sur ce plan. Le premier jet, lui, reçoit le catalogue et écrit des refs.
   */
  readonly catalogLines: readonly string[];
  /**
   * ⟳ 2026-09-23 — LE FOYER : fiches, notes, recette de référence, à-côtés.
   *
   * ⛔ REQUIS, JAMAIS `?`. Optionnel, « je n'ai pas le foyer » serait devenu la
   * réponse silencieuse de chaque appelant — c'est l'état mesuré par l'audit
   * (lot 4 d). Un bloc vide (`""`) est une réponse : rien à dire, rien
   * d'imprimé. Voir `repairHouseholdLines`.
   */
  readonly household: RepairHouseholdContext;
  readonly softMaxChars?: number;
  readonly hardMaxChars?: number;
}): PlanRepairMessage | null {
  const rendu = repairDefectLines({
    defects: args.defects,
    days: args.days,
    // ⛔ LA TABLE DES UNITÉS DE CE TOUR-CI, ET C'EST ELLE QUI DONNE SON ADRESSE
    // À CHAQUE CONTRAT. La même que celle de la projection et du périmètre : un
    // message qui citerait `U3` d'une autre table désignerait un autre repas.
    index: args.index,
  });
  if (rendu === null) return null;
  const lignes = rendu.lines;
  const projection = planProjection({
    plan: args.plan,
    index: args.index,
    sessions: args.sessions,
    scope: args.scope,
    nutrition: args.nutrition,
    // ⛔ LES CASES QUE LES CONSIGNES CI-DESSUS NOMMENT, ET SEULEMENT ELLES. La
    // projection s'en sert pour ne pas annoncer « déjà juste » une portion que
    // le même message demande de corriger — un fait faux dans son propre texte.
    defects: args.defects.filter((d) => d.repairable),
    softMaxChars: args.softMaxChars,
    hardMaxChars: args.hardMaxChars,
  });
  const rejet = args.afterVerdict === null || args.afterVerdict === "adopt"
    ? []
    : [
      args.afterVerdict === "safety_regression"
        ? "⛔ YOUR PREVIOUS ANSWER WAS THROWN AWAY: it put a forbidden food on " +
          "somebody's plate. The plan below is the one before it."
        : "⛔ YOUR PREVIOUS ANSWER WAS THROWN AWAY: it did not bring any of the " +
          "figures below closer. The plan below is the one before it.",
      "",
    ];
  // ⛔ LE PÉRIMÈTRE NON RÉSOLU SE DIT AU MODÈLE, PAS SEULEMENT AU JOURNAL. Un
  // défaut qu'on a mesuré et qu'on ne sait pas adresser n'est pas de sa faute —
  // mais lui laisser croire que la liste ci-dessus est complète lui ferait
  // chercher ailleurs, dans les unités qu'on vient de geler.
  const perdus = args.scope.unresolved.length === 0 ? [] : [
    "",
    `⚠️ ${args.scope.unresolved.length} other problem(s) could not be tied to a`,
    `meal we can let you change. They are not yours to fix in this answer.`,
  ];
  // ⟳ 2026-09-23 — LE FOYER, ENTRE CE QUI NE VA PAS ET LE PLAN : le modèle
  // lit ce qu'il doit corriger, POUR QUI il le corrige, puis ce qui existe.
  const foyer = repairHouseholdLines(args.household, REPAIR_HOUSEHOLD_MAX_CHARS);
  return {
    text: [
      ...rejet,
      ...lignes,
      ...perdus,
      ...(foyer.lines.length === 0 ? [] : ["", ...foyer.lines]),
      "",
      "== THE PLAN AS THE APP READS IT RIGHT NOW ==",
      projection.text,
      "",
      // ⟳ 2026-09-19 — LE CATALOGUE APRÈS LE PLAN ET AVANT LE CONTRAT : le
      // modèle lit d'abord ce qu'il corrige, puis avec quoi il pèse, puis la
      // forme de sa réponse. Absent (`[]`), rien n'est ajouté, pas même un vide.
      ...(args.catalogLines.length === 0 ? [] : [...args.catalogLines, ""]),
      // ⟳ 2026-09-13 · LOT 2 — LE PÉRIMÈTRE SEUL. Le SCHÉMA est passé dans le
      // message SYSTÈME de réparation (`plan_repair_prompt.ts`), pour qu'il
      // n'existe qu'UN schéma de sortie dans l'appel — c'est le défaut P1 §3
      // de la revue, et l'écrire deux fois le rouvrirait à moitié.
      ...repairPatchScopeLines({
        baseVersion: args.baseVersion,
        scope: args.scope,
      }),
    ].join("\n"),
    projection,
    tooLarge: projection.tooLarge,
    // ⛔ DEUX ÉTATS SÉPARÉS, ET ILS NE DISENT PAS LA MÊME CHOSE. `tooLarge` =
    // « ça ne rentre pas » ; `contextIncomplete` = « je ne sais pas à qui
    // appartient un objectif, ou le plafond a fait disparaître une bouche /
    // un repas manquant / un interdit ». Un grammage de trop laissé dehors
    // n'est plus un arrêt : mesuré tir2-s2, ça empêchait de réparer le lundi
    // soir absent.
    //
    // ⟳ 2026-09-23 — ET LES NOTES DU FOYER QUI NE TIENNENT PAS SOUS LEUR
    // PLAFOND : partir sans elles, c'est la réparation qui resservait des œufs.
    contextIncomplete: rendu.ownerless.length > 0 || rendu.incomplete ||
      foyer.dropped.includes("notes"),
    defectCounts: {
      blocks: rendu.counts.blocks,
      dropped: rendu.counts.dropped,
      ownerless: rendu.ownerless.length,
    },
    ownerless: rendu.ownerless,
    household: {
      chars: foyer.chars,
      kept: foyer.kept,
      dropped: foyer.dropped,
      empty: foyer.empty,
    },
  };
}

/** Ce que la composition du message a produit — le texte ET ce qu'il a coûté. */
export interface PlanRepairMessage {
  readonly text: string;
  readonly projection: PlanProjection;
  /**
   * ⛔ `true` = NE PARS PAS. Le contexte obligatoire ne tient pas sous le
   * plafond dur : le chantier exige de déclarer `context_too_large` AVANT
   * l'appel plutôt que d'envoyer un contexte amputé en le présentant comme
   * exploitable.
   */
  readonly tooLarge: boolean;
  /**
   * ⟳ 2026-09-13 · LOT 1 — ⛔ `true` = NE PARS PAS NON PLUS.
   *
   * Deux causes, et chacune a été mesurée sur le tir `perte-h4n4` :
   *
   *   · un objectif individuel dont la bouche n'est pas résolvable — il
   *     partirait anonyme, et le modèle composerait pour personne ;
   *   · des blocs laissés dehors par le plafond — c'est la troncature qui a
   *     fait disparaître 41 défauts derrière « and 41 more of the same kind ».
   */
  readonly contextIncomplete: boolean;
  /** Les nombres qui rendent `contextIncomplete` relisible au journal. */
  readonly defectCounts: {
    readonly blocks: number;
    readonly dropped: number;
    readonly ownerless: number;
  };
  /** Les défauts personnels sans propriétaire, par cause et par case. */
  readonly ownerless: readonly string[];
  /**
   * ⟳ 2026-09-23 — ce que le foyer a coûté au message, et ce qui n'a pas
   * tenu (`repairHouseholdLines`). À journaliser avec `defectCounts`.
   */
  readonly household: {
    readonly chars: number;
    readonly kept: readonly RepairHouseholdBlock[];
    readonly dropped: readonly RepairHouseholdBlock[];
    readonly empty: readonly RepairHouseholdBlock[];
  };
}

/** Un nombre lisible, ou `?`. ⛔ Jamais `0` pour « on ne sait pas ». */
function num(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "?";
  return String(Math.round(value));
}
