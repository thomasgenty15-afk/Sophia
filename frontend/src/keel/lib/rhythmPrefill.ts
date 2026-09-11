import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES MOMENTS DÉRIVÉS SONT PROPOSÉS COCHÉS — la décision, en un endroit pur.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Autorité produit: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
 *
 * ── ⟳ 2026-09-08 — CE QUI EST REVENU, ET CE QUI A CHANGÉ AVEC ─────────────
 * La pré-coche avait été retirée le 2026-09-06, sur le motif qu'un plancher
 * dérivé n'est pas une réponse et que l'écrire comme une réponse rendait
 * impossible de dire « je ne goûte pas ». **Le propriétaire a tranché
 * autrement, et son argument porte:** la fiche est remplie DANS L'ENTONNOIR,
 * sous les yeux de la personne, et c'est elle qui l'enregistre. Des cases
 * pré-cochées qu'on voit, qu'on peut décocher et qu'on valide en enregistrant
 * ne sont pas un fait inventé dans son dos — c'est un formulaire pré-rempli,
 * et l'enregistrement EST la confirmation.
 *
 * Ce qui reste vrai de la cicatrice, et qui vit donc ici plutôt que dans le
 * commentaire d'un effet: **la proposition ne doit se faire qu'UNE FOIS.** Une
 * pré-coche qui se rejoue reprend la main à qui vient de la retirer.
 *
 * ── ⛔ AUCUNE FORMULE ICI, ET CE N'EST PAS NÉGOCIABLE ──────────────────────
 * Quels moments, et combien, est décidé par `_shared/keel/eating_structure.ts`
 * — le MÊME module pur que le générateur — et rendu par `eating-structure-v1`.
 * Ce fichier ne fait que choisir QUAND recopier cette réponse dans le
 * brouillon. Le jour où il déciderait lui-même d'ouvrir un goûter, l'écran et
 * le plan diraient deux choses différentes et chacun aurait raison chez lui.
 *
 * PURE: no I/O, no clock, no randomness.
 */

export interface RhythmPrefillInput {
  /**
   * CE QUE LE BROUILLON PORTE DÉJÀ. `null` = rien de coché — ce qui veut dire
   * « comme la maison », jamais « elle ne mange pas ».
   */
  declared: readonly EatingOccasionSlot[] | null;
  /**
   * LES MOMENTS QUE LE SERVEUR RETIENT (`structure.slots`), déclarés ∪ ouverts.
   *
   * ⚠️ ET PAS `structure.opened`. `opened` est le DELTA — ce que la dérivation
   * a ajouté — et il retombe à zéro dès que le brouillon porte les moments.
   * Recopier le delta poserait une liste incomplète le jour où une partie est
   * déjà cochée. C'est la même confusion qui avait rendu la phrase muette le
   * 2026-09-04.
   */
  derived: readonly string[];
  /**
   * A-T-ON DÉJÀ PROPOSÉ, OU LA PERSONNE A-T-ELLE DÉJÀ RÉPONDU, SUR CETTE FICHE ?
   *
   * ⛔ SANS CE VERROU, « TOUT DÉCOCHER » EST INATTEIGNABLE. Décocher le dernier
   * moment remet `rhythm` à `null`, ce qui est exactement l'état sur lequel on
   * propose: la liste se recocherait sous les doigts, et « comme la maison »
   * deviendrait un état que le produit refuse d'atteindre. Le même verrou
   * protège une fiche existante dont la personne viderait le rythme.
   */
  latched: boolean;
}

/**
 * CE QU'IL FAUT ÉCRIRE DANS LE BROUILLON, ou `null` — « n'écris rien ».
 *
 * ⚠️ `null` ET PAS UN TABLEAU VIDE. Le vide est une VALEUR dans ce champ (« la
 * base refuse `empty_rhythm` », et l'écran le relit comme « comme la maison »):
 * le rendre ici ferait écrire une réponse là où on voulait s'abstenir.
 */
export function rhythmPrefillFor(
  input: RhythmPrefillInput,
): EatingOccasionSlot[] | null {
  // Elle a une réponse — la sienne, ou celle qu'on vient de proposer et qu'elle
  // n'a pas retirée. On ne repasse jamais par-dessus.
  if (input.declared !== null) return null;
  if (input.latched) return null;

  const held = new Set(input.derived);
  // ⛔ FILTRÉ PAR LE VOCABULAIRE DE L'ÉCRAN, ET DANS L'ORDRE DE LA JOURNÉE. Le
  // module serveur conserve les jetons qu'il ne connaît pas (`snack`, legacy):
  // les recopier poserait sur la fiche une case qu'aucune rangée ne rend, donc
  // un moment que la personne ne pourrait ni voir ni décocher.
  const slots: EatingOccasion[] = EATING_OCCASIONS.filter((s) => held.has(s));
  if (slots.length === 0) return null;

  // ⚠️ `size: null` — ON PROPOSE UN MOMENT, PAS UNE PORTION. La taille est une
  // seconde question, posée sous la case une fois qu'elle est cochée; la
  // remplir ici ferait dire à la personne une chose de plus qu'elle n'a pas
  // dite, et celle-là ne se voit pas.
  return slots.map((slot) => ({ slot, size: null }));
}

/**
 * LE VERROU DOIT-IL S'ARMER ? — appelé à chaque rendu, avant la proposition.
 *
 * Il s'arme dès que le brouillon porte une réponse, quelle qu'en soit
 * l'origine: la fiche d'un membre qui avait déjà coché ses moments ne doit pas
 * se faire re-remplir au premier vidage.
 */
export function rhythmPrefillLatches(
  declared: readonly EatingOccasionSlot[] | null,
): boolean {
  return declared !== null;
}
