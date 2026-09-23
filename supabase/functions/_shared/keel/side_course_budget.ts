/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BUDGET DES À-CÔTÉS D'UN MOMENT — ce que le plat garde, ce que l'à-côté
 * porte.
 * ⟳ 2026-09-23 — vague 0 du chantier « assiettes normales ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`, « Les à-côtés par
 * objectif ». Vocabulaire: `side_courses_types.ts`.
 *
 * ── CE QUE ÇA TRANCHE ─────────────────────────────────────────────────────
 * Un moment a une énergie (`mealKcal`) et un plat qui ne doit pas dépasser
 * `dishCapKcal` (550 g × la densité de référence). L'à-côté prend d'abord ses
 * calories de BASE; il ne GROSSIT que si le plat dépasserait son plafond, et
 * jamais au-delà de la part maximale du repas. Ce qui reste au-dessus du
 * plafond du plat après croissance est le DÉBORDEMENT: le contrat (flux B)
 * l'envoie aux collations, sinon le plat monte jusqu'au plafond de repli.
 *
 * ⛔ L'ÉNERGIE DU MOMENT EST L'INVARIANT: `sideKcal + dishKcal = mealKcal`.
 * Rien ne se perd ni ne se crée ici — le débordement est une partie du plat,
 * nommée, pas une énergie en plus.
 *
 * ── L'ORDRE DE LA CROISSANCE ──────────────────────────────────────────────
 * ① LE PAIN EST AJOUTÉ D'ABORD, quand `bread` figure dans `growKinds`, qu'il
 *   n'est pas déjà prévu, que le moment n'est pas léger, et que la croissance
 *   atteint `SIDE_COURSE_MIN_ADDED_KCAL`. Sa position dans `growKinds` ne
 *   change pas cette priorité: elle ne sert qu'à étendre un pain DÉJÀ prévu.
 * ② PUIS LES À-CÔTÉS DÉJÀ PRÉVUS S'ÉTENDENT, dans l'ordre de `growKinds`,
 *   chacun jusqu'à son plafond (`SIDE_COURSE_KIND_MAX_KCAL`). Un type absent
 *   de `growKinds` ne grossit jamais; un type absent des à-côtés prévus n'est
 *   jamais créé — le pain excepté.
 *
 * ⚠️ UN MOMENT LÉGER N'AJOUTE PAS DE PAIN. Il garde un seul à-côté (règle du
 * plan); ajouter le pain en ferait deux. Il grossit par extension seulement.
 *
 * ⚠️ LA PART MAXIMALE EST BORNÉE PAR L'ÂGE, ICI. `input.capShare` est ce que
 * le planificateur demande; `SIDE_COURSE_MAX_MEAL_SHARE` est le plafond du
 * produit (adulte 0,35, mineur 0,25). Le plus petit des deux gagne: un
 * appelant qui passerait 0,35 pour un enfant n'en fait pas un second plat.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import {
  SIDE_COURSE_KIND_MAX_KCAL,
  SIDE_COURSE_MAX_MEAL_SHARE,
  SIDE_COURSE_MIN_ADDED_KCAL,
  SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL,
  type SideCourseAlloc,
  type SideCourseBudget,
  type SideCourseKind,
  type SideCourseSlotInput,
} from "./side_courses_types.ts";

/** Une calorie de base inutilisable (négative, NaN) vaut zéro, jamais un nombre inventé. */
function nonNegative(x: number): number {
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * LE BUDGET D'UN MOMENT — PURE: no I/O, no clock, no randomness.
 *
 * ① `side` = Σ des calories de base, ramenée au plafond de part si elle le
 *   dépasse (au prorata: chaque à-côté garde sa proportion). Refus: 0.
 * ② `dish` = `meal − side`. Si le plat dépasse `dishCapKcal`, l'à-côté grossit
 *   de `min(dish − dishCap, plafond − side)`, dans l'ordre de l'en-tête.
 * ③ `overflowKcal` = ce que le plat dépasse encore de `dishCapKcal`.
 */
export function sideBudgetFor(args: {
  mealKcal: number;
  dishCapKcal: number;
  input: SideCourseSlotInput;
  isMinor: boolean;
}): SideCourseBudget {
  const { mealKcal, dishCapKcal, input } = args;
  const overflowOf = (dish: number) => Math.max(0, dish - dishCapKcal);

  // ── La personne refuse tout: le repas entier va au plat. ──────────────────
  if (input.refused) {
    return {
      courses: [],
      sideKcal: 0,
      grownKcal: 0,
      dishKcal: mealKcal,
      overflowKcal: overflowOf(mealKcal),
      capped: false,
    };
  }

  // ── Le plafond de part: la demande du planificateur, bornée par l'âge. ────
  const ceiling = SIDE_COURSE_MAX_MEAL_SHARE[args.isMinor ? "minor" : "adult"];
  const share = Math.min(nonNegative(input.capShare), ceiling);
  // ⚠️ `mealKcal > 0` est faux pour NaN aussi: un repas illisible n'a pas d'à-côté.
  const cap = mealKcal > 0 ? share * mealKcal : 0;

  // ── ① Les calories de base, ramenées au plafond au prorata. ───────────────
  const bases = input.courses.map((c) => ({ kind: c.kind, kcal: nonNegative(c.baseKcal) }));
  const baseSum = bases.reduce((s, c) => s + c.kcal, 0);
  const truncated = baseSum > cap;
  const allocs: { kind: SideCourseKind; kcal: number }[] = truncated
    ? bases.map((c) => ({ kind: c.kind, kcal: baseSum > 0 ? (c.kcal * cap) / baseSum : 0 }))
    : bases;

  const sumOf = () => allocs.reduce((s, c) => s + c.kcal, 0);

  // ── ② La croissance, seulement si le plat dépasserait son plafond. ────────
  const sideBefore = sumOf();
  const need = mealKcal - sideBefore - dishCapKcal;
  const room = cap - sideBefore;
  let grown = 0;
  // ⚠️ `room > 1e-9` et pas `> 0`: une base rabotée au prorata laisse une
  // place de l'ordre de 1e-13, et une « croissance » de ce calibre ne doit ni
  // s'écrire dans `grownKcal` ni se lire comme une croissance.
  if (need > 0 && room > 1e-9) {
    let grow = Math.min(need, room);
    // ① Le pain d'abord.
    const breadPlanned = allocs.some((c) => c.kind === "bread");
    if (
      !input.light &&
      input.growKinds.includes("bread") &&
      !breadPlanned &&
      grow >= SIDE_COURSE_MIN_ADDED_KCAL
    ) {
      const add = Math.min(grow, SIDE_COURSE_KIND_MAX_KCAL.bread);
      allocs.push({ kind: "bread", kcal: add });
      grow -= add;
      grown += add;
    }
    // ② Puis l'extension des à-côtés prévus, dans l'ordre de `growKinds`.
    for (const kind of new Set(input.growKinds)) {
      if (grow <= 0) break;
      for (const alloc of allocs) {
        if (grow <= 0) break;
        if (alloc.kind !== kind) continue;
        const headroom = SIDE_COURSE_KIND_MAX_KCAL[kind] - alloc.kcal;
        if (headroom <= 0) continue;
        const take = Math.min(headroom, grow);
        alloc.kcal += take;
        grow -= take;
        grown += take;
      }
    }
  }

  // ── ③ Le partage final. ───────────────────────────────────────────────────
  const courses: SideCourseAlloc[] = allocs.map((c) => ({
    kind: c.kind,
    kcal: c.kcal,
    proteinEstG: (c.kcal * SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL[c.kind]) / 100,
  }));
  const sideKcal = sumOf();
  const dishKcal = mealKcal - sideKcal;
  // Le plafond a « arrêté quelque chose »: la base a été rabotée, ou la
  // croissance voulait plus que la place et l'a toute prise. Des à-côtés tous
  // à leur plafond de type, sous la part maximale, ne sont PAS `capped`.
  const capped = truncated || (need > room && room > 1e-9 && cap - sideKcal <= 1e-9);
  return {
    courses,
    sideKcal,
    grownKcal: grown,
    dishKcal,
    overflowKcal: overflowOf(dishKcal),
    capped,
  };
}
