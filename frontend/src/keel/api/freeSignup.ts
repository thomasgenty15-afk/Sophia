// KEEL — les DÉCISIONS de l'inscription libre, séparées de la page qui les rend.
//
// Même partage que `_shared/keel/doctrine_loader.ts` côté serveur: la décision
// est pure et testable, la lecture ne l'est pas. Ici la décision qui compte tient
// en une phrase — QUOI ENVOYER À `signUp` — et elle est la seule chose de tout ce
// chantier qu'un test peut attraper avant un utilisateur:
//
// `handle_new_user()` REFUSE de rattacher un inscrit libre dont les métadonnées
// ne portent pas de pays. Une faute de frappe sur la clé `country`, ou un
// `keel_signup_intent` mal orthographié, ne casse RIEN de visible: le compte est
// créé, l'écran dit « vous êtes dedans », et l'élève se retrouve sans coach —
// donc sans plan, sans photo, sans doctrine. Le trigger avale l'échec par
// conception (un rattachement raté ne doit pas coûter le compte), donc la seule
// alarme possible est ici.

import { type MessageKey } from "../i18n/t";

/** R3: les surfaces KEEL naissent en anglais. C'est `ui_locale`. */
export const PRODUCT_LOCALE = "en-US";

/** L'intention que `handle_new_user()` reconnaît. Un seul littéral, un seul endroit. */
export const FREE_SIGNUP_INTENT = "student_free";

/**
 * La forme d'un pays déclaré. La base valide la MÊME forme
 * (`profiles_country_iso3166_check`), et volontairement pas une liste fermée:
 * une liste refuserait un pays légitime le jour où quelqu'un s'y inscrit.
 */
export function isDeclaredCountryValid(country: string): boolean {
  return /^[A-Z]{2}$/.test(country);
}

export interface FreeSignupMetadataInput {
  fullName: string;
  country: string;
  timezone: string;
}

/**
 * Les métadonnées de `supabase.auth.signUp`, telles que `handle_new_user()` les
 * lit. Chaque clé a un lecteur SQL, et aucune n'est décorative:
 *
 *   full_name          -> profiles.full_name
 *   locale             -> profiles.locale (sinon le défaut legacy 'fr-FR')
 *   timezone           -> profiles.timezone. NULL fait rendre `null` à
 *                         `localHourFor`, ce qui range l'élève en
 *                         `outside_window` à CHAQUE tick du tap du soir —
 *                         silencieusement, pour toujours.
 *   tz_follow_device   -> profiles.tz_follow_device
 *   keel_signup_intent -> déclenche le rattachement au coach maison
 *   country            -> profiles.country, via le moteur de rattachement.
 *                         Sans lui le trigger REFUSE de rattacher: un pays
 *                         absent ferait déduire la hotline de crise depuis la
 *                         langue, et `locale` vaut 'en-US' pour tout le monde.
 */
export function freeSignupMetadata(
  input: FreeSignupMetadataInput,
): Record<string, unknown> {
  return {
    full_name: input.fullName.trim(),
    locale: PRODUCT_LOCALE,
    timezone: input.timezone,
    tz_follow_device: true,
    keel_signup_intent: FREE_SIGNUP_INTENT,
    country: input.country,
  };
}

/** Ce que la RPC `keel_join_house_coach` peut répondre. */
export type JoinRefusalReason =
  | "country_required"
  | "already_coached"
  | "caller_is_coach"
  | "house_coach_unavailable";

/**
 * Le refus de la base -> la phrase que la personne lit.
 *
 * Un refus inconnu tombe sur `start.error.generic` plutôt que d'afficher le
 * token brut: `already_coached` sur un écran est un message pour nous, pas pour
 * elle. Mais il ne tombe JAMAIS sur un écran de succès — c'est la faute qui a
 * coûté une invitation perdue sur /join (un message technique sous un bouton
 * « Accepter », et le visiteur repart en croyant avoir rejoint).
 */
export function joinRefusalMessageKey(reason: string | null | undefined): MessageKey {
  switch (reason) {
    case "country_required":
      return "start.error.country_required";
    case "already_coached":
      return "start.error.already_coached";
    case "caller_is_coach":
      return "start.error.caller_is_coach";
    case "house_coach_unavailable":
      return "start.error.unavailable";
    default:
      return "start.error.generic";
  }
}

/**
 * Supabase refuse une inscription pour une adresse déjà prise. Le libellé n'est
 * pas un contrat, donc le match est large et l'appelant retombe sur le message
 * brut du serveur: un match raté montre l'erreur réelle, jamais un écran faux.
 */
export function isAlreadyRegistered(message: string): boolean {
  return /already\s*(been\s*)?regist|already\s*exists|user\s*already/i.test(message);
}
