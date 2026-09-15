// KEEL — LES DÉCISIONS DE LA PORTE FOYER, séparées de l'écran qui les rend.
//
// Chantier 4 (décision D1 de `docs/keel/CHANTIER-FOYER-SUITE.md`): « je rejoins
// un foyer » devient un chemin de CRÉATION DE COMPTE, sans rouvrir celui qui a
// été fermé pour raison de sécurité.
//
// ── POURQUOI UN MODULE PUR, ET PAS TROIS LIGNES DANS LA PAGE ──────────────
//
// Même partage que `freeSignup.ts`, et pour la même raison mesurée: une faute
// de frappe sur la clé `country` ou sur `keel_signup_intent` ne casse RIEN DE
// VISIBLE à l'écran. Le compte est créé, la page dit « vérifiez vos e-mails »,
// et le pays n'est jamais posé — c'est-à-dire que la hotline de crise de cette
// personne redevient déduite de sa langue. Le seul endroit où ce défaut peut
// être attrapé avant un utilisateur, c'est un test sur ces fonctions.
//
// ⚠️ DIFFÉRENCE AVEC `student_free`: côté base, le bloc de `handle_new_user()`
// qui lit `household_member` NE RATTRAPE PAS son erreur — il LÈVE, donc le
// compte n'est pas créé. Une métadonnée mal orthographiée ne produit donc pas
// un compte sans pays: elle produit un compte SANS INTENTION, c'est-à-dire un
// compte ordinaire qui se heurtera ensuite à `country_required` au moment de
// réclamer. Les deux gardes se rattrapent l'une l'autre; ce test les nomme.

import { type MessageKey } from "../i18n/t";

/**
 * L'intention que `handle_new_user()` reconnaît (migration 20260811060000 §2).
 * UN seul littéral, UN seul endroit — et il est neuf: aucune autre porte ne
 * l'émet, donc ce bloc ne peut pas mordre une inscription existante.
 */
export const HOUSEHOLD_SIGNUP_INTENT = "household_member";

export interface HouseholdSignupMetadataInput {
  /** Le nom que la personne porte sur SON compte. La bouche garde le sien. */
  fullName: string;
  /** ISO 3166-1 alpha-2, DÉCLARÉ. Jamais dérivé de la langue. */
  country: string;
  timezone: string;
  /** La langue CHOISIE. `signupProfileLocale()` la produit depuis le drapeau. */
  locale: string;
}

/**
 * Les métadonnées de `supabase.auth.signUp`, telles que `handle_new_user()` les
 * lit. Chaque clé a un lecteur SQL, et aucune n'est décorative:
 *
 *   full_name          -> profiles.full_name
 *   locale             -> profiles.locale (sinon le DÉFAUT LEGACY 'fr-FR', que
 *                         personne n'a choisi). C'est la LANGUE DU COMPTE, lue
 *                         à chaque tour par le backend.
 *   timezone           -> profiles.timezone. NULL fait rendre `null` à
 *                         `localHourFor`, ce qui range la personne en
 *                         `outside_window` à chaque tick, silencieusement.
 *   tz_follow_device   -> profiles.tz_follow_device
 *   keel_signup_intent -> déclenche le bloc « porte foyer » du trigger
 *   country            -> profiles.country. SANS LUI, LE COMPTE N'EST PAS CRÉÉ.
 *
 * ⚠️ CE QUI N'Y EST PAS, ET C'EST UNE DÉCISION: aucun jeton d'invitation. Le
 * patron du coach (`coach_invite_token` consommé dans la transaction de signup)
 * serait ici une régression de sécurité — l'aperçu d'invitation rend l'ADRESSE
 * invitée à qui détient le lien, donc un voleur n'aurait plus qu'à s'inscrire
 * avec cette adresse pour rafler la place, sans jamais ouvrir la boîte mail. La
 * réclamation exige une SESSION, c'est-à-dire une adresse confirmée.
 */
export function householdSignupMetadata(
  input: HouseholdSignupMetadataInput,
): Record<string, unknown> {
  return {
    full_name: input.fullName.trim(),
    locale: input.locale,
    timezone: input.timezone,
    tz_follow_device: true,
    keel_signup_intent: HOUSEHOLD_SIGNUP_INTENT,
    country: input.country,
  };
}

/**
 * Ce que `keel_household_join(p_token, p_country)` peut répondre.
 *
 * LISTE FERMÉE. Les deux derniers motifs sont neufs au chantier 4 et portent
 * toute la garde de pays: `country_required` quand le compte n'a pas de pays
 * déclaré et n'en apporte pas, `bad_country` quand la forme est fausse.
 */
export type HouseholdClaimRefusal =
  | "unknown_token"
  | "expired"
  | "already_used"
  | "already_claimed"
  | "email_mismatch"
  | "already_in_household"
  | "not_authenticated"
  | "country_required"
  | "bad_country"
  /** PAS un refus de la base: le réseau. Les confondre ment sur l'invitation. */
  | "unreachable";

/**
 * Le motif de refus -> la phrase que la personne lit.
 *
 * Un motif INCONNU rend `null`, et l'écran retombe sur une phrase générique
 * plutôt que d'afficher `already_claimed` à quelqu'un. Le silence force à
 * ajouter l'étiquette au lieu de la tolérer.
 */
export function claimRefusalMessageKey(reason: string): MessageKey | null {
  switch (reason) {
    case "unknown_token":
      return "household_claim.refused.unknown_token";
    case "expired":
      return "household_claim.refused.expired";
    case "already_used":
      return "household_claim.refused.already_used";
    case "already_claimed":
      return "household_claim.refused.already_claimed";
    case "email_mismatch":
      return "household_claim.refused.email_mismatch";
    case "already_in_household":
      return "household_claim.refused.already_in_household";
    case "not_authenticated":
      return "household_claim.refused.not_authenticated";
    case "country_required":
      return "household_claim.refused.country_required";
    case "bad_country":
      return "household_claim.refused.bad_country";
    case "unreachable":
      return "household_claim.refused.unreachable";
    default:
      return null;
  }
}

/**
 * LA PORTE EST-ELLE OUVERTE ?
 *
 * ── LA DÉCISION, ET SON MOTIF (chantier 4, §3 de la mission) ──────────────
 *
 * OUI, le verrou pré-lancement s'applique à cette porte.
 *
 * `VITE_PRELAUNCH_LOCKDOWN` est l'interrupteur GLOBAL « le produit n'est pas
 * ouvert ». Une surface de création de compte qui l'ignore est un verrou avec
 * un trou, et le trou est INVISIBLE: personne ne rejoue la troisième porte avec
 * le verrou armé, donc l'oubli ne se découvre que le jour où quelqu'un entre
 * par là pendant qu'on croit le produit fermé.
 *
 * Le coût du choix inverse n'est pas symétrique. Verrou respecté: une personne
 * invitée lit « ce n'est pas encore ouvert », phrase vraie, et une variable
 * d'environnement rouvre tout. Verrou ignoré: des comptes naissent pendant une
 * fermeture décidée, et rien ne le dit.
 *
 * ⚠️ CE N'EST PAS SYMÉTRIQUE AVEC `/start`, qui ne lit PAS ce drapeau
 * aujourd'hui — la porte d'inscription libre reste ouverte sous verrou. Ce
 * n'est pas corrigé ici (autre porte, autre chantier) mais c'est NOMMÉ: soit
 * `/start` doit lire le drapeau, soit le drapeau ne veut pas dire ce que son
 * message annonce (« Only the master_admin account can sign in »).
 *
 * ── ET LA RÉCLAMATION, ELLE ? ─────────────────────────────────────────────
 *
 * Elle reste OUVERTE sous verrou, pour quelqu'un qui a DÉJÀ un compte. Le
 * verrou parle de créer des comptes et d'entrer dans l'app; `/app/household`
 * n'est pas sous `RequireAppAccess` et ne l'a jamais été. Fermer aussi la
 * réclamation étendrait le verrou à une surface qu'il n'a jamais gardée, sans
 * qu'aucune décision ne l'ait dit.
 */
export function isHouseholdSignupOpen(prelaunchLockdown: boolean): boolean {
  return !prelaunchLockdown;
}
