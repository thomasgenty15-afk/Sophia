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
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · ÉTAPE C1 — LES **PROTÉINES** DU MÊME APPORT, PAR MOMENT.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LA MÊME LIGNE, LA MÊME RÉSOLUTION, LE MÊME PASSAGE. Elle n'est pas
   * calculée ailleurs ni plus tard : `nutrientsOf` rend l'énergie ET la
   * protéine du même `resolveIngredients`, et les séparer en deux lectures
   * ferait deux réponses le jour où la résolution change. Le plan de clôture
   * l'exige en toutes lettres : « mesurer calories **et** protéines des apports
   * fixes depuis leurs références ».
   *
   * ⚠️ MÊMES ABSTENTIONS, EXACTEMENT. Un apport `loose` n'entre pas ici (son
   * énergie ne se retranche nulle part, donc sa protéine non plus — retrancher
   * l'une sans l'autre rendrait une exigence protéique plus basse sur une
   * énergie inchangée). Un apport illisible ne retranche rien du tout.
   *
   * ⚠️ UNE PROTÉINE INCONNUE N'EST PAS ZÉRO. `nutrientsOf` peut rendre une
   * énergie sans protéine ; ce moment-là n'est alors PAS posé dans cette carte,
   * et `proteinUnknown` le compte. Poser `0` ferait dire « ce pot n'apporte
   * aucune protéine » à propos d'un pot qu'on n'a pas su lire.
   */
  proteinBySlot: Map<string, number>;
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
    /**
     * ⟳ 2026-09-12 · C1 — apports dont l'ÉNERGIE est lisible et la PROTÉINE
     * non. Ils retranchent des kcal et zéro gramme de protéine, et ce compteur
     * est la seule chose qui distingue « le pot n'en apporte pas » de « on n'a
     * pas su lire ».
     */
    protein_unknown: number;
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
function intakeNutrients(
  index: CompositionIndex,
  intake: FixedIntake,
): { kcal: number; proteinG: number | null } | null {
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
  if (n === "unknown") return null;
  // ⛔ `null` ET JAMAIS ZÉRO. `nutrientsOf` rend `proteinG: null` quand la table
  // ne porte pas la colonne; le convertir en `0` ferait dire « ce pot n'apporte
  // aucune protéine » de quelque chose qu'on n'a pas su lire — et c'est la
  // direction d'erreur qui abaisse un plancher médical.
  const protein = typeof n.proteinG === "number" && Number.isFinite(n.proteinG)
    ? n.proteinG
    : null;
  return { kcal: n.energyKcal, proteinG: protein };
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
  const proteinBySlot = new Map<string, number>();
  const counts = {
    declared: 0,
    referential: 0,
    unresolved: 0,
    loose: 0,
    off_day: 0,
    protein_unknown: 0,
  };
  let looseKcal = 0;
  if (args.intakes.length === 0) {
    return { bySlot, proteinBySlot, looseKcal, counts };
  }

  const index = augmentedIndexFor(args.index, args.intakes);
  for (const intake of args.intakes) {
    if (!intakeHappensOn(intake, args.dayToken)) {
      counts.off_day++;
      continue;
    }
    const n = intakeNutrients(index, intake);
    if (n === null) {
      counts.unresolved++;
      continue;
    }
    if (intake.nutrition === "declared") counts.declared++;
    else counts.referential++;
    if (intake.placement === "loose") {
      counts.loose++;
      looseKcal += n.kcal;
      continue;
    }
    bySlot.set(intake.slot, (bySlot.get(intake.slot) ?? 0) + n.kcal);
    // ⛔ LA PROTÉINE NE SE POSE QUE SI ELLE EST LUE. Un moment absent de
    // `proteinBySlot` veut dire « rien à retrancher ici »; un `0` posé
    // voudrait dire la même chose, et c'est précisément pourquoi on ne le
    // pose pas: `protein_unknown` doit rester distinguable d'un vrai zéro.
    if (n.proteinG === null) counts.protein_unknown++;
    else {
      proteinBySlot.set(
        intake.slot,
        (proteinBySlot.get(intake.slot) ?? 0) + n.proteinG,
      );
    }
  }
  return { bySlot, proteinBySlot, looseKcal, counts };
}
