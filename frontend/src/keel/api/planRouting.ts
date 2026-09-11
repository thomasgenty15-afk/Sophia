/**
 * AI-JE LE DROIT DE COMPOSER — ET C'EST LA SEULE QUESTION QUI RESTE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 · LOT 7 — IL N'Y A PLUS QU'UN MOTEUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ce module portait `chooseGenerator`: « `generate-household-meal-v1` si le
 * foyer a AU MOINS DEUX bouches ET que je suis le maître; sinon
 * `generate-meal-v1` ». Cette règle n'existe plus, et sa disparition n'est pas
 * un nettoyage — c'est la décision produit du chantier: **une personne seule
 * est un foyer d'une personne.** Tout appel autorisé vise
 * `generate-household-meal-v1`, que la table compte une bouche ou six.
 *
 * ⛔ ON NE REMPLACE PAS LE ROUTAGE PAR UN CHOIX « POUR MOI / POUR LE FOYER ».
 * Le périmètre n'est pas une préférence: le serveur le résout depuis le foyer
 * rattaché au compte. Un sélecteur d'écran serait une SECONDE autorité sur le
 * même fait, et c'est toujours celle que l'écran ne montre pas qui gagne.
 *
 * ⛔ ET SURTOUT PAS DE BRANCHE SUR LE NOMBRE DE BOUCHES. C'est très exactement
 * la règle qu'on retire ici: `otherMouths` a disparu de la signature pour que
 * personne ne puisse la reconstruire « juste pour cet écran ». Un foyer d'une
 * bouche et un foyer de six passent par le même appel.
 *
 * ── CE QUI RESTE, ET POURQUOI IL RESTE ────────────────────────────────────
 * `isOwner` était « la moitié du routage »; il en est maintenant la TOTALITÉ,
 * sous une autre question. `generate-household-meal-v1` rend **403
 * `not_owner`** à un membre secondaire, sur toutes ses entrées (composer,
 * recomposer, éditer un brouillon, adopter, remplacer). Ce module dit à
 * l'écran s'il doit PROPOSER le geste — pas s'il a le droit de le faire.
 *
 * ⚠️ CE N'EST PAS LA GARDE. La garde est le `not_owner` du serveur, et elle
 * doit le rester: une limite d'UI n'est pas une limite. Ce que ce module
 * empêche est un BOUTON MORT — un geste offert dont la seule issue est un
 * refus. Cicatrice mesurée trois fois sur `SetupPage`: « refus loin du geste =
 * bouton mort ».
 *
 * PURE. Aucune I/O, aucune horloge, aucun `t()`, AUCUN IMPORT D'i18n — et ce
 * dernier point est une contrainte de couture, pas une élégance: le scanner de
 * `i18n/pageSeams.int.test.ts` suit les IMPORTS, pas les appels. Poser cette
 * fonction dans `api/onboarding.ts` (qui importe `../copy/allergens`, 13
 * littéraux `allergen.*`) ferait entrer `allergen` dans le périmètre de
 * `/app/plan`, qui ne le déclare pas. D'où ce fichier, sans aucun import.
 */

/**
 * Ce que l'écran a le droit de PROPOSER.
 *
 * `"not_owner"` porte le nom exact du refus serveur, et ce n'est pas une
 * coquetterie: l'écran affiche la même phrase (`plan.refusal.not_owner`) que
 * si l'appel était parti. Deux vocabulaires pour un seul refus finiraient par
 * décrire deux règles.
 */
export type ComposeRight = "allowed" | "not_owner";

/**
 * MA PLACE, TELLE QUE `loadMyHouseholdPlace` LA REND.
 *
 * ⚠️ AUCUN CHAMP OPTIONNEL. Un appelant qui ne sait pas s'il est maître ne doit
 * pas hériter de `false`: `false` est une AFFIRMATION. Sept paramètres
 * optionnels ont déjà été des gardes désarmées dans ce dépôt. L'ignorance se
 * dit par `null` sur l'objet entier, pas par un champ absent.
 */
export interface ComposePlace {
  /** Suis-je rattaché à un foyer ? REQUIS. */
  inHousehold: boolean;
  /** Suis-je le maître de ce foyer ? REQUIS. */
  isOwner: boolean;
}

/**
 * LE DROIT DE COMPOSER, EN UNE RÈGLE.
 *
 * @param place `null` = la place n'a pas encore été lue, ou sa lecture a
 *        échoué. **Et alors on autorise**, exprès:
 *
 *        · le chemin MAJORITAIRE est le maître de son propre foyer — cacher le
 *          bouton pendant une lecture lente ferait disparaître l'écran entier
 *          pour tout le monde;
 *        · `loadMyHouseholdPlace` rend `{inHousehold:false, isOwner:false}`
 *          quand la lecture ÉCHOUE, donc « pas maître » n'y est jamais une
 *          preuve — seul `inHousehold: true` l'est;
 *        · et le refus existe de toute façon: le serveur rend `not_owner`, que
 *          l'écran affiche à l'endroit du clic.
 *
 *        Fermer sur du non-lu serait le mauvais côté de l'arbitrage: un maître
 *        sans bouton n'a AUCUN recours, un secondaire qui clique lit une
 *        phrase.
 */
export function composeRight(place: ComposePlace | null): ComposeRight {
  // ⚠️ L'ORDRE COMPTE, ET C'EST TOUT LE MODULE. `inHousehold` D'ABORD: un
  // compte sans foyer n'est pas un secondaire, c'est un foyer d'une personne
  // que le serveur crée à l'entrée du générateur (lot 1). Tester `isOwner`
  // seul refuserait tous les comptes qui n'ont pas encore été rattachés —
  // c'est-à-dire, le jour de la bascule, la majorité d'entre eux.
  if (place === null) return "allowed";
  if (!place.inHousehold) return "allowed";
  return place.isOwner ? "allowed" : "not_owner";
}

/** Raccourci de lecture pour les écrans: `composeRight(...) === "allowed"`. */
export function mayCompose(place: ComposePlace | null): boolean {
  return composeRight(place) === "allowed";
}
