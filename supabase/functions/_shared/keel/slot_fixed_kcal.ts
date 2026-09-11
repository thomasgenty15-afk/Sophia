/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LA PERSONNE AVALE DÉJÀ, RANGÉ PAR MOMENT — 2026-09-07
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, lot 2.
 *
 * ── LE TROU QU'IL FERME ───────────────────────────────────────────────────
 * `fixed_intakes.ts` sait DIRE au modèle qu'un shaker existe, et sait
 * l'empêcher d'occuper un créneau (`replacesMeal`). Il ne sait pas RETRANCHER
 * son énergie de la cible du moment. Un shaker de 120 kcal au goûter était
 * donc annoncé au modèle ET compté nulle part: la cible du goûter restait
 * entière, et la personne mangeait le plat composé EN PLUS de son shaker.
 *
 * ⚠️ IL EST LE SEUL RETRAIT QUI RESTE (2026-09-10), et il n'a jamais eu le
 * défaut des extras: un apport fixe est TOUJOURS déclaré — il n'existe que si
 * quelqu'un l'a écrit. Il n'y a donc rien à supposer, et **rien n'est retranché
 * pour quelqu'un qui n'a rien déclaré**. Les extras, eux, supposaient du pain
 * chez une population qui n'avait jamais été interrogée; ils sont supprimés.
 *
 * ── TROIS ABSTENTIONS, TOUTES COMPTÉES ───────────────────────────────────
 *   · `loose` — un yaourt à 16 h qui n'est PAS « le goûter ». On ne sait pas à
 *     quel moment l'imputer, donc on ne l'impute nulle part. ⛔ Le retrancher
 *     « au prorata » inventerait un placement que personne n'a déclaré, et
 *     l'imputer d'office au goûter serait pire: il rognerait un repas composé.
 *     Son énergie est rendue à part (`looseKcal`) pour que l'appelant SACHE
 *     combien de kcal il choisit d'ignorer.
 *   · `unresolved` — le référentiel ne lit pas ce terme. Retrait ZÉRO, jamais
 *     une estimation: un apport non résolu dont on devinerait l'énergie
 *     rognerait un vrai repas au profit d'un nombre inventé.
 *   · `off_day` — l'apport n'a pas lieu ce jour-là (`days` le dit).
 *
 * PURE: no I/O, no clock, no randomness. Le jour est un ARGUMENT.
 */
import {
  type CompositionIndex,
  nutrientsOf,
  resolveIngredients,
} from "./food_composition.ts";
import {
  augmentedIndexFor,
  type FixedIntake,
  intakeHappensOn,
} from "./fixed_intakes.ts";

export interface SlotFixedKcal {
  /** Les kcal à retrancher, par moment nommé. Un moment absent = rien à retrancher. */
  bySlot: Map<string, number>;
  /**
   * Les kcal des apports SANS moment. ⛔ Jamais retranchées — rendues pour que
   * l'appelant puisse les journaliser. Un chiffre qu'on ignore doit être
   * visible, sinon « on n'a rien ignoré » et « on a ignoré 400 kcal » se
   * relisent pareil.
   */
  looseKcal: number;
  counts: {
    /** Apports dont la composition vient de l'étiquette du pot. */
    declared: number;
    /** Apports résolus contre le référentiel. */
    referential: number;
    /** Terme illisible ⇒ retrait ZÉRO, compté. */
    unresolved: number;
    /** Sans moment nommé ⇒ jamais retranché, compté. */
    loose: number;
    /** N'a pas lieu ce jour-là. */
    off_day: number;
  };
}

/**
 * L'ÉNERGIE D'UN SEUL APPORT, PAR LA CHAÎNE DU PRODUIT.
 *
 * ⛔ UNE SEULE CHAÎNE POUR LES DEUX BRANCHES. `declared` et `referential` ne se
 * calculent PAS différemment: `augmentedIndexFor` pose la fiche déclarée dans
 * l'index, et `resolveIngredients → nutrientsOf` traite ensuite les deux à
 * l'identique. C'est ce qui rend cette lecture additive au sens strict — et
 * c'est la propriété que `fixed_intakes.ts` a payée pour obtenir.
 */
function intakeKcal(index: CompositionIndex, intake: FixedIntake): number | null {
  const r = resolveIngredients(index, [{
    term: intake.foodRef,
    amount: intake.amount,
    unit: intake.unit,
    // Un apport fixe est consommé TEL QUEL — même état que
    // `fixedIntakeInputsFor`, et pour la même raison: rien ne cuit.
    state: "raw",
  }]);
  if (r.resolved.length === 0) return null;
  const n = nutrientsOf(r.resolved);
  return n === "unknown" ? null : n.energyKcal;
}

export function fixedIntakeSlotKcal(args: {
  index: CompositionIndex;
  intakes: readonly FixedIntake[];
  /**
   * Le jour dont on parle, dans le vocabulaire de `days` (`mon`…`sun`).
   *
   * `null` = « je ne sais pas quel jour » ⇒ seuls les apports de TOUS les
   * jours (`days: []`) comptent. ⛔ La direction de l'erreur est choisie:
   * retrancher un apport qui n'a peut-être pas lieu rognerait un vrai repas.
   */
  dayToken: string | null;
}): SlotFixedKcal {
  const bySlot = new Map<string, number>();
  const counts = { declared: 0, referential: 0, unresolved: 0, loose: 0, off_day: 0 };
  let looseKcal = 0;
  if (args.intakes.length === 0) return { bySlot, looseKcal, counts };

  const index = augmentedIndexFor(args.index, args.intakes);
  for (const intake of args.intakes) {
    if (!intakeHappensOn(intake, args.dayToken)) {
      counts.off_day++;
      continue;
    }
    const kcal = intakeKcal(index, intake);
    if (kcal === null) {
      counts.unresolved++;
      continue;
    }
    if (intake.nutrition === "declared") counts.declared++;
    else counts.referential++;
    if (intake.placement === "loose") {
      counts.loose++;
      looseKcal += kcal;
      continue;
    }
    bySlot.set(intake.slot, (bySlot.get(intake.slot) ?? 0) + kcal);
  }
  return { bySlot, looseKcal, counts };
}
