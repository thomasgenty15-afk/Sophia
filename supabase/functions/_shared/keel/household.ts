/**
 * LE FOYER — qui peut quoi, et qui voit quoi. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §8.5, « les deux autorités ».
 *
 * ── LE PARTAGE QUE CE MODULE TIENT ───────────────────────────────────────
 * Il y a dans ce produit DEUX pouvoirs de nature différente, et les confondre
 * casse les deux:
 *
 *   SOPHIA        épistémique  — explique, ne BLOQUE JAMAIS, dans aucun mode.
 *   COMPTE MAÎTRE domestique   — restreint, sous conditions strictes.
 *
 * Ce module ne décrit QUE le second. On n'y trouvera aucune fonction qui
 * autorise ou refuse un aliment à quelqu'un « pour son bien »: ça n'existe
 * pas dans ce produit, et l'absence est le sujet.
 *
 * ── POURQUOI DEUX RÉPONSES À « PEUT-IL RESTREINDRE ? » NE SUFFISENT PAS ──
 * `canRestrict` rend un MOTIF, pas un booléen. Une policy RLS rend « autorisé »
 * ou « zéro ligne », jamais POURQUOI — et l'écran doit dire laquelle des
 * raisons a mordu, sinon le produit paraît cassé au hasard. Le motif est donc
 * une donnée de premier ordre, pas un message d'erreur.
 *
 * ── L'ÂGE NE SE RECALCULE PAS ICI ────────────────────────────────────────
 * On prend un `BirthDateVerdict` de `student_age.ts`, jamais un `isMinor:
 * boolean`. Ce dépôt a déjà une définition du mineur, elle porte la ceinture
 * qui refuse un plan nutritionnel à un enfant, et une seconde définition
 * divergerait au premier ajustement — après quoi personne ne saurait laquelle
 * ment. La règle SQL (`keel_household_is_minor`) est le jumeau de celle-ci et
 * le test de la base la pinne.
 */

import type { BirthDateVerdict } from "./student_age.ts";

/** Reflet du CHECK `households_kind_check`. */
export const HOUSEHOLD_KINDS = ["family", "shared"] as const;
export type HouseholdKind = (typeof HOUSEHOLD_KINDS)[number];

export const HOUSEHOLD_ROLES = ["owner", "member"] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export interface HouseholdMemberSnapshot {
  userId: string;
  role: HouseholdRole;
  /**
   * Le verdict de `student_age.ts`, tel quel. Voir l'en-tête: jamais un
   * booléen recalculé.
   */
  birthDateVerdict: BirthDateVerdict;
  /** `household_members.restriction_consent_at`. `null` = pas d'accord. */
  restrictionConsentAt: string | null;
}

/**
 * Les motifs, en liste FERMÉE. Ils sont rendus à l'écran, donc ils font partie
 * du contrat: un motif ajouté sans étiquette d'affichage casse le typecheck du
 * front, et c'est voulu.
 */
export type RestrictVerdict =
  | { allowed: true }
  | { allowed: false; reason: RestrictRefusal };

export type RestrictRefusal =
  /** Le foyer n'est pas une famille: aucun verrouillage, pour personne. */
  | "not_a_family"
  /** L'acteur n'est pas le compte maître. */
  | "not_owner"
  /** La cible n'appartient pas à ce foyer. */
  | "not_a_member"
  /** Majeur qui n'a pas donné son accord — le défaut. */
  | "adult_without_consent"
  /** On ne se restreint pas soi-même par ce chemin. */
  | "self";

/**
 * LE MAJEUR EST LE DÉFAUT, ET C'EST LA DÉCISION QUI COMPTE.
 *
 * Une date de naissance absente ou illisible donne « majeur », donc NON
 * restreignable sans accord explicite. La direction est contre-intuitive —
 * « on ne sait pas » se traduit d'habitude par « on protège » — et elle est
 * pourtant la sûre ici: traiter l'inconnu comme un mineur donnerait au compte
 * maître un pouvoir sur tout adulte qui n'a pas renseigné sa date.
 */
export function isMinorMember(member: HouseholdMemberSnapshot): boolean {
  return member.birthDateVerdict.status === "minor";
}

/**
 * Le compte maître peut-il poser une restriction sur ce membre ?
 *
 * L'ORDRE DES REFUS N'EST PAS ARBITRAIRE. Le mode du foyer passe en premier
 * parce qu'il est la question la plus générale: dans une colocation, la
 * réponse est non quels que soient les rôles, les âges et les consentements,
 * et un écran qui dirait d'abord « tu n'es pas le compte maître » enverrait
 * l'utilisateur chercher un pouvoir qui n'existe pas dans son foyer.
 */
export function canRestrict(
  kind: HouseholdKind,
  actor: HouseholdMemberSnapshot,
  target: HouseholdMemberSnapshot,
): RestrictVerdict {
  if (kind !== "family") return { allowed: false, reason: "not_a_family" };
  if (actor.role !== "owner") return { allowed: false, reason: "not_owner" };
  if (actor.userId === target.userId) return { allowed: false, reason: "self" };
  if (isMinorMember(target)) return { allowed: true };
  if (!target.restrictionConsentAt) {
    return { allowed: false, reason: "adult_without_consent" };
  }
  return { allowed: true };
}

/**
 * CE QU'UN MEMBRE VOIT DE L'OBJECTIF D'UN AUTRE.
 *
 * `full` = l'écran peut afficher l'objectif nutritionnel de cette personne.
 * `own_only` = il ne le peut pas.
 *
 * ── POURQUOI ÇA NE PORTE QUE SUR L'OBJECTIF ──────────────────────────────
 * Qu'un parent voie l'objectif d'un enfant de sept ans est normal; qu'un
 * colocataire apprenne que l'autre est en sèche parce qu'ils partagent des
 * courses ne l'est pas.
 *
 * En revanche les CONSIGNES DE PORTION restent visibles de tout le foyer dans
 * les deux modes, et ce n'est pas une inconséquence: « Marc, 1,5 part » est une
 * instruction de service, pas un diagnostic. C'est exactement pour ça que
 * `household_portions.ts` interdit de faire figurer la RAISON dans la consigne
 * — l'instruction est publique, le pourquoi ne l'est pas.
 *
 * Et la protection réelle n'est pas cette fonction: c'est que `student_goals`
 * n'a gagné AUCUNE policy dans la migration du foyer. Celle-ci décide ce qu'on
 * demande; la base décide ce qu'on peut obtenir.
 */
export type GoalVisibility = "full" | "own_only";

export function goalVisibility(
  kind: HouseholdKind,
  viewer: HouseholdMemberSnapshot,
  viewed: HouseholdMemberSnapshot,
): GoalVisibility {
  if (viewer.userId === viewed.userId) return "full";
  return kind === "family" ? "full" : "own_only";
}

/**
 * Qui peut être invité, et par qui. Le plafond quotidien vit en base
 * (`keel_household_invite`) parce qu'une limite d'écran n'est pas une limite;
 * ici on ne décide que du rôle.
 */
export function canInvite(actor: HouseholdMemberSnapshot): boolean {
  return actor.role === "owner";
}
