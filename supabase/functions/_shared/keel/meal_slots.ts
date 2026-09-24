// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LES CASES VIDES DE LA GRILLE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `emptySlotsIn`, `emptySlotsLine` et `cellChecklistLines`.
// Le type `MealSlotCase` qu'elles lisent est dans `meal_types.ts`.

import { type FixedIntake, slotIsTaken } from "./fixed_intakes.ts";
import {
  type AwayDay,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  isAway,
} from "./meal_vocabulary.ts";
import type { MealSlotCase } from "./meal_types.ts";

/**
 * LES CASES DE LA FENÊTRE QUE PERSONNE NE REMPLIT — le trou, nommé.
 *
 * ── LE DÉFAUT QU'ELLE REND LISIBLE, MESURÉ DEUX FOIS LE 2026-08-12 ─────────
 *
 * Un plat dont un ingrédient porte une cible chiffrée est rejeté ENTIER (le
 * verrou numérique, `findNumericTarget`). Sur une fusion, la matière du plan
 * personnel citait « whey protein 90 g » et **les cinq petits-déjeuners du
 * foyer sont tombés d'un coup**: le foyer s'est retrouvé sans aucun
 * petit-déjeuner, avec UNE ligne d'`issues` par plat rejeté pour tout signal —
 * c'est-à-dire une trace qui dit ce qui a été JETÉ et jamais ce qui MANQUE.
 *
 * ⚠️ ON CONSTATE, ON NE REBOUCHE PAS. Recomposer la case demanderait de choisir
 * quoi mettre à la place, et c'est un choix de PRODUIT que personne n'a pris.
 * Même posture que `observeMergeShape` et que le constat d'ancre protéique: le
 * plan est écrit, le trou est nommé. Le verrou numérique, lui, est JUSTE et
 * antérieur — on ne l'affaiblit pas d'un caractère.
 *
 * ── CE QUI N'EST PAS UN TROU, ET C'EST LA MOITIÉ QUI COMPTE ────────────────
 * Une garde qui déclarerait un trou partout serait indiscernable d'une garde
 * qui marche. Ne comptent donc PAS:
 *   · un moment où la personne (ou la tablée) est ABSENTE — la consigne
 *     l'interdit et le parseur le jette déjà, c'est un vide VOULU;
 *   · un moment déjà pris par un apport FIXE — même raison (FF-051);
 *   · un plat sans jour: il vaut pour la fenêtre entière (`windowSplit`), donc
 *     il couvre son moment tous les jours;
 *   · un plat sans moment: il couvre la JOURNÉE. On ne sait pas lequel de ses
 *     repas il est, et deviner fabriquerait un trou qui n'existe pas.
 *
 * PURE, et paramétrée par les MÊMES entrées que la consigne (`occasionList`,
 * `isAway`, `slotIsTaken`): un second avis sur « ce que cette journée devait
 * contenir » aurait divergé du prompt au premier ajustement.
 */
export function emptySlotsIn(args: {
  /** Les jetons de la fenêtre, dans son ordre. Vide ⇒ aucune case connue. */
  days: readonly string[];
  /**
   * LE JOUR DE CUISINE QUI NE PORTE AUCUN REPAS — « je cuisine la veille ».
   *
   * ⛔ REQUIS ET NULLABLE. Sans lui, la veille compte comme une journée entière
   * de cases vides: sur un rythme à trois moments, l'explication annoncerait
   * « le petit-déjeuner, le déjeuner et le dîner n'ont pas été composés » sur
   * le jour où, par construction, on ne mange pas. Un trou VOULU rendu comme un
   * trou subi est exactement le genre de fait faux que cette liste existe pour
   * ne plus produire.
   *
   * ⚠️ ET IL NE SORT PAS DE `days`: l'appelant passe la fenêtre ENTIÈRE, parce
   * que c'est elle qui situe les jours. C'est ici, une fois, qu'on décide de ne
   * rien attendre de ce jour-là.
   */
  cookOnlyDay: string | null;
  /** Le rythme déclaré. Vide ⇒ le défaut, exactement comme `occasionList`. */
  rhythm: readonly EatingOccasionSlot[];
  dishes: readonly { day?: string | null; slot?: string | null }[];
  awayDays: readonly AwayDay[];
  fixedIntakes: readonly FixedIntake[];
}): MealSlotCase[] {
  const occasions = (args.rhythm.length > 0 ? args.rhythm : DEFAULT_EATING_RHYTHM)
    .map((o) => o.slot);
  const out: MealSlotCase[] = [];
  for (const day of args.days) {
    if (args.cookOnlyDay !== null && day === args.cookOnlyDay) continue;
    for (const slot of occasions) {
      if (isAway(args.awayDays, day, slot)) continue;
      if (slotIsTaken(args.fixedIntakes, day, slot)) continue;
      const covered = args.dishes.some((d) => {
        const dDay = d.day ?? null;
        const dSlot = d.slot ?? null;
        if (dDay !== null && dDay !== day) return false;
        return dSlot === null || dSlot === slot;
      });
      if (!covered) out.push({ day, slot });
    }
  }
  return out;
}

/** Les cases vides, en une ligne lisible: `wed/breakfast, thu/breakfast`. */
export function emptySlotsLine(cases: readonly MealSlotCase[]): string {
  return cases.map((c) => `${c.day}/${c.slot}`).join(", ");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA MÊME GRILLE, MAIS EN LIGNES QU'ON PEUT COCHER — 2026-09-19
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `emptySlotsLine` met 42 cases sur UNE ligne. Mesuré le 2026-09-18 sur le
 * foyer `fagenty` (six moments déclarés × sept jours): le modèle a rempli
 * `snack_pm` lundi, mardi, mercredi et jeudi, puis a laissé les trois derniers
 * vides. Une liste plate ne donne rien à COMPTER: rien, dans ces 42 jetons, ne
 * dit qu'il manque trois `snack_pm`.
 *
 * ⛔ UNE LIGNE PAR MOMENT, AVEC SON COMPTE. `snack_pm (7): mon, tue, …` se
 * relit en une seconde et une omission s'y voit — c'est la différence entre
 * une liste et une CHECKLIST. Le compte est sur chaque ligne, pas seulement en
 * tête, parce que c'est lui qui rend l'oubli visible ligne par ligne.
 *
 * ⚠️ LES JETONS BRUTS, JAMAIS `OCCASION_PROSE`. Ce sont exactement les valeurs
 * que le modèle doit réécrire dans `day` et `slot`; les traduire en anglais
 * lisible ajouterait une étape de traduction à une consigne dont tout le point
 * est qu'elle se recopie.
 */
export function cellChecklistLines(
  cases: readonly MealSlotCase[],
  slotOrder: readonly string[],
  dayOrder: readonly string[],
): string[] {
  const bySlot = new Map<string, string[]>();
  for (const c of cases) {
    const days = bySlot.get(c.slot) ?? [];
    days.push(c.day);
    bySlot.set(c.slot, days);
  }
  const dayRank = new Map(dayOrder.map((d, i) => [d, i] as const));
  // ⚠️ L'ORDRE DES MOMENTS EST CELUI DU RYTHME, et les moments qu'il ne nomme
  // pas viennent après, dans l'ordre où la grille les a produits: une case
  // rendue invisible parce que son moment manque à `slotOrder` serait
  // exactement le trou que cette fonction existe pour empêcher.
  const known = slotOrder.filter((s) => bySlot.has(s));
  const extra = [...bySlot.keys()].filter((s) => !slotOrder.includes(s));
  const width = Math.max(...[...known, ...extra].map((s) => s.length), 0);
  return [...known, ...extra].map((slot) => {
    const days = (bySlot.get(slot) ?? []).slice().sort(
      (x, y) => (dayRank.get(x) ?? 0) - (dayRank.get(y) ?? 0),
    );
    return `  ${slot.padEnd(width)} (${days.length}): ${days.join(", ")}`;
  });
}
