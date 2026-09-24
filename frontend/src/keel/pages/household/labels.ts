// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// Les trois libellés purs de la page: un refus de foyer, une direction, un refus d'invitation.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import type { MemberGoal } from "../../api/household";
import { householdErrorKey } from "../../copy/planRefusals";
import { t } from "../../i18n/t";

/**
 * Le motif de refus d'une RPC de foyer, traduit — liste FERMÉE.
 *
 * Même discipline que `inviteErrorText`: un motif inconnu rend `null` plutôt
 * qu'une clé brute, et l'écran retombe alors sur le motif tel quel. Le silence
 * force à ajouter l'étiquette au lieu de la tolérer.
 */
export function householdErrorText(reason: string): string | null {
  // ⚠️ LA LISTE A DÉMÉNAGÉ DANS `copy/planRefusals.ts`, et ce n'est pas un
  // rangement. Elle était un `switch` privé de ce fichier, donc invisible à la
  // carte de proposition — qui reçoit pourtant les mêmes motifs et affichait
  // `not_a_member` en toutes lettres (mesuré deux fois en HTTP réel). Une même
  // liste fermée, deux écrans, un seul exemplaire: c'est la raison d'être du
  // module de refus, écrite dans son en-tête.
  //
  // L'ORDRE EST CELUI D'AVANT: les motifs de foyer d'abord, les motifs propres
  // aux deux RPC de réglage de fusion ensuite (`muted_required`,
  // `member_is_owner`, `notice_moved_on`…). `householdErrorKey` le tient, et le
  // test appelle la même fonction que cette ligne.
  const key = householdErrorKey(reason);
  return key ? t(key) : null;
}

/**
 * ⟳ 2026-09-06 — `setup.goal.*` ET PLUS `household.goal.*`. La FICHE de cette
 * même page a changé de registre le même jour (voir `goalLabel` dans
 * `MouthFormDialog.tsx`, qui porte l'argument), et laisser cette ligne-ci sur
 * l'ancien aurait rendu « Perte de masse grasse » en lecture au-dessus d'une
 * fiche qui propose « Perdre du poids » — deux mots pour un seul jeton, dans la
 * même carte cette fois.
 */
export function goalLabel(goal: MemberGoal): string {
  switch (goal) {
    case "fat_loss":
      return t("setup.goal.fat_loss");
    case "muscle_gain":
      return t("setup.goal.muscle_gain");
    // `recomposition`, `performance` et `health` sont partis avec le
    // vocabulaire (2026-08-18): la base les refuse par `bad_goal`, donc un
    // `case` pour eux était une branche que rien ne pouvait plus atteindre.
    // Leurs clés i18n restent sur le disque — la parité en/fr n'est pas rompue
    // par des clés inutilisées, et c'est à L5 de les retirer avec l'écran.
    case "maintenance":
      return t("setup.goal.maintenance");
  }
}

/**
 * Le motif de refus d'invitation, traduit — liste FERMÉE.
 *
 * Un motif inconnu rend `null` plutôt qu'une clé brute: afficher
 * `household.invite.error.something` à quelqu'un est pire que ne rien
 * afficher, et le silence force à ajouter l'étiquette au lieu de la tolérer.
 */
export function inviteErrorText(reason: string): string | null {
  switch (reason) {
    case "rate_limited":
      return t("household.invite.error.rate_limited");
    case "bad_email":
      return t("household.invite.error.bad_email");
    case "not_owner":
      return t("household.invite.error.not_owner");
    // LOT 6 — les deux refus que la CIBLE peut produire. Ils sont rares à
    // l'écran (le sélecteur ne propose que des bouches libres du foyer) et ils
    // arrivent quand même: deux onglets ouverts, ou une bouche réclamée entre
    // le chargement et le clic. Sans étiquette, l'écran afficherait le jeton
    // brut `already_claimed` à quelqu'un.
    case "already_claimed":
      return t("household.invite.error.already_claimed");
    case "not_a_member":
      return t("household.error.not_a_member");
    default:
      return null;
  }
}
