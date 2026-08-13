/**
 * LE FOYER — l'identité d'une bouche, et son âge. PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-FOYER-PROFILS.md (lots 1, 2, 3).
 * PIVOT-FOYER §7, §7.5 et son modèle d'invitation sont PÉRIMÉS.
 *
 * ── CE QUE CE MODULE NE CONTIENT PLUS, ET POURQUOI ───────────────────────────
 *
 * Il portait `canRestrict`, `canInvite`, `memberVisibility` et `goalVisibility`.
 * Les quatre sont parties le 2026-08-10, et le motif n'est pas le même pour
 * toutes — il est écrit ici parce qu'un lecteur qui les cherche doit trouver la
 * raison, pas un vide:
 *
 *   `canRestrict` et `canInvite` n'ont JAMAIS eu d'appelant en production. La
 *   règle a toujours vécu en SQL (`keel_household_add_restriction`,
 *   `keel_household_invite`). Elles décrivaient un modèle, elles ne le
 *   tenaient pas — et un module pur qui a l'air d'être la règle sans l'être
 *   est pire qu'une absence.
 *
 *   `memberVisibility` et `goalVisibility` n'existaient que pour le mode
 *   `shared` (la colocation). Le modèle arrêté le 2026-08-08 sort la
 *   colocation du produit: un compte, un foyer, une personne qui gouverne le
 *   menu. En mode `family`, `memberVisibility` rendait DÉJÀ `full` pour tout
 *   le monde — les retirer ne change aucun comportement, ça supprime un mode
 *   qui n'a plus de sujet.
 *
 * Conséquence assumée, et elle est réelle: FF-010 R3 cachait la part d'autrui
 * DANS LA CONVERSATION en colocation. Un profil réclamé qui demande « c'est
 * quoi la part de Marc ? » l'obtient désormais. Cohérent avec la règle du
 * chantier — « ce qui touche le repas est partagé, ce qui touche le corps est à
 * soi » — mais c'est un changement, pas une simplification neutre.
 *
 * ── CE QU'IL CONTIENT MAINTENANT ────────────────────────────────────────────
 *
 * L'ÂGE, À TROIS ÉTATS. C'est le cœur du lot 2. `is_minor: boolean` ne peut
 * plus décrire le monde depuis qu'une bouche peut être saisie à la main sans
 * date: « je ne sais pas » et « majeur » doivent produire des résultats
 * OPPOSÉS — le premier ne donne AUCUNE direction d'objectif, le second en
 * donne une. Un booléen les confond, et l'ancien `coalesce(…, false)` de
 * `keel_household_is_minor` les confondait du mauvais côté: un enfant sans
 * date renseignée aurait reçu une direction d'adulte, en silence.
 */

import type { BirthDateVerdict } from "./student_age.ts";

export const HOUSEHOLD_ROLES = ["owner", "member"] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

/**
 * LE JUMEAU DE `keel_household_member_age(uuid)`.
 *
 * Les deux définitions doivent rendre les mêmes trois valeurs pour les mêmes
 * dates; le test de la base pinne la version SQL, celui d'ici pinne celle-ci.
 * Une divergence se verrait comme une portion d'adulte servie à un enfant —
 * c'est-à-dire trop tard.
 *
 * ⚠️ LE JUMELAGE PORTE SUR LA RÈGLE `date → état`, PAS SUR LA SOURCE DE LA
 * DATE. Depuis D18 (20260812180000), la base résout DEUX colonnes avant
 * d'appliquer la règle: `profiles.birth_date` — ce que la personne a rempli
 * dans son « about you » — fait autorité dès qu'elle est utilisable, et
 * `household_members.birth_date`, la fiche saisie par le maître, est le repli.
 * Ce module ne voit jamais qu'UNE date, donc il n'a rien à arbitrer; le côté
 * SQL de la règle s'appelle `keel_age_state(date)` et c'est le vrai jumeau
 * d'`ageStateFromVerdict` ci-dessous.
 */
export const MEMBER_AGE_STATES = ["minor", "adult", "unknown"] as const;
export type MemberAgeState = (typeof MEMBER_AGE_STATES)[number];

/**
 * Une bouche, telle que le roster la rend.
 *
 * `userId` est `null` tant que la personne n'a pas réclamé son profil. Ce n'est
 * PAS son identité — `memberId` l'est, et il ne change jamais, y compris le
 * jour de la réclamation. C'est ce qui fait que ses portions, ses contraintes
 * et son historique lui restent attachés.
 */
export interface HouseholdMemberSnapshot {
  memberId: string;
  userId: string | null;
  firstName: string;
  role: HouseholdRole;
  ageState: MemberAgeState;
  /** Six jetons, ou `null` = aucune direction = part standard. */
  goal: string | null;
}

/**
 * Le verdict riche de `student_age.ts`, projeté sur les trois états.
 *
 * Ses six statuts se réduisent à trois, et la réduction n'est pas une perte:
 * `absent`, `unreadable`, `future` et `implausible` disent tous la même chose
 * du point de vue d'une portion — ON NE SAIT PAS. Les distinguer ici
 * autoriserait un appelant à traiter « date aberrante » différemment de « pas
 * de date », ce qui est exactement la nuance qui se perd puis se retourne.
 */
export function ageStateFromVerdict(verdict: BirthDateVerdict): MemberAgeState {
  if (verdict.status === "minor") return "minor";
  if (verdict.status === "adult") return "adult";
  return "unknown";
}

/**
 * LES DEUX DIRECTIONS QU'UN MINEUR NE PORTE JAMAIS.
 *
 * ── CE QUI A CHANGÉ LE 2026-08-13, ET CE QUI N'A PAS CHANGÉ ───────────────
 * `PIVOT-FOYER.md` §8.4 disait: « un membre mineur du foyer n'a JAMAIS
 * d'objectif nutritionnel individuel ». Décision humaine du 2026-08-13: un
 * enfant PEUT porter une direction. La règle était plus large que sa propre
 * raison.
 *
 * Relire §8.4 mot pour mot: « avec un mineur, le registre est éducatif — jamais
 * CORRECTIF SUR LE CORPS. Aucune mention de poids, de silhouette, de
 * restriction. On parle de ce que l'aliment APPORTE, pas de ce qu'il fait
 * grossir. » La raison n'a jamais été « pas de direction »; elle a toujours été
 * « pas de direction qui fasse d'un enfant une cible de poids ».
 *
 * « Manger mieux » et « mieux s'entraîner » sont exactement ce que l'aliment
 * APPORTE. `fat_loss` et `recomposition` sont l'autre registre — celui qui
 * retire, et qui parle de silhouette. Ces deux-là restent inconstructibles: la
 * base les refuse à l'écriture (`keel_household_set_member_goal`), et cette
 * fonction les refuserait de toute façon à la lecture.
 *
 * ⚠️ DEUX CEINTURES POUR UNE RÈGLE, ET C'EST VOULU. Une ligne peut porter une
 * valeur écrite AVANT ce lot, ou saisie à dix-sept ans par quelqu'un qui en a
 * seize aujourd'hui. La base empêche d'en écrire de nouvelles; la lecture
 * garantit que les anciennes ne s'appliquent pas. Une garde qui dépendrait d'un
 * nettoyage de données n'est pas une garde.
 */
export const MINOR_FORBIDDEN_GOALS: readonly string[] = [
  "fat_loss",
  "recomposition",
];

/**
 * L'OBJECTIF S'APPLIQUE-T-IL À CETTE BOUCHE ?
 *
 * La règle du lot 3, en un endroit, parce qu'elle est lue par le générateur ET
 * par l'écran — et que deux copies divergeraient sur le cas `unknown`, qui est
 * précisément celui qui compte.
 *
 * ⚠️ `unknown` rend `false`, et c'est le sens SÛR. L'âge reste facultatif à la
 * saisie — le flux de 90 secondes ne se bloque pas — mais tant qu'il manque, la
 * personne reçoit une part standard. La garde échoue du bon côté, et
 * l'incitation à compléter est intégrée: renseigner l'âge est ce qui active
 * l'objectif.
 *
 * ⚠️ ET `unknown` NE SUIT PAS LE MINEUR SUR L'OUVERTURE DE 2026-08-13. Un âge
 * inconnu ne reçoit AUCUNE direction, pas même celles qu'un enfant peut porter:
 * « je ne sais pas » et « c'est un enfant » ne sont pas la même phrase, et
 * traiter la première comme la seconde ferait exactement ce que la ceinture de
 * l'âge inconnu existe pour empêcher — décider à la place de quelqu'un dont on
 * ignore s'il a huit ou quarante ans.
 */
export function goalApplies(member: {
  ageState: MemberAgeState;
  goal: string | null;
}): boolean {
  if (member.goal === null || member.goal === "") return false;
  if (member.ageState === "adult") return true;
  if (member.ageState === "minor") {
    return !MINOR_FORBIDDEN_GOALS.includes(member.goal);
  }
  return false;
}
