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

// ⚠️ `PRODUCT_LOCALE = "en-US"` A ÉTÉ RETIRÉ D'ICI, ET SON ABSENCE EST LE
// CHANGEMENT. Il portait le commentaire « R3: les surfaces KEEL naissent en
// anglais » — vrai du pilote, faux du produit: la langue est désormais un CHOIX
// que la personne fait au moment de s'inscrire, avec le drapeau de la page.
//
// La locale devient donc un champ REQUIS de l'entrée ci-dessous, et pas une
// lecture de `chosenUiLocale()` faite ici. Deux raisons, et la seconde est la
// vraie: ces fonctions sont PURES et testées comme telles — lire un état de
// module les rendrait dépendantes de l'ordre d'initialisation du runtime; et un
// champ requis fait énumérer ses appelants par le compilateur, là où un défaut
// optionnel aurait laissé les quatre portes tranquilles avec l'ancienne valeur.

/** L'intention que `handle_new_user()` reconnaît. Un seul littéral, un seul endroit. */
export const FREE_SIGNUP_INTENT = "student_free";

/**
 * La forme d'un pays déclaré — DÉFINIE UNE SEULE FOIS, dans `countries.ts`.
 *
 * Ré-exportée ici parce que ce module était son domicile d'origine et que ses
 * appelants (la page `/start`, son test) la nomment par ce chemin. Elle a
 * déménagé au chantier 4: la porte foyer applique EXACTEMENT la même règle, et
 * deux copies d'une garde de pays sont deux copies à faire diverger — ce qui
 * est précisément le défaut qui a rendu la hotline de crise fausse.
 */
export { isDeclaredCountryValid } from "./countries";

export interface FreeSignupMetadataInput {
  fullName: string;
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
 *   locale             -> profiles.locale (sinon le défaut legacy 'fr-FR').
 *                         C'est la LANGUE DU COMPTE: le backend la lit à chaque
 *                         tour (`run.ts` -> `resolveResponseLocale`), donc ce
 *                         champ décide dans quelle langue l'agent répond.
 *   timezone           -> profiles.timezone. NULL fait rendre `null` à
 *                         `localHourFor`, ce qui range l'élève en
 *                         `outside_window` à CHAQUE tick du tap du soir —
 *                         silencieusement, pour toujours.
 *   tz_follow_device   -> profiles.tz_follow_device
 *   keel_signup_intent -> déclenche le rattachement au coach maison
 *   country            -> profiles.country, via le moteur de rattachement.
 *                         Sans lui le trigger REFUSE de rattacher: un pays
 *                         absent ferait déduire la hotline de crise depuis la
 *                         langue — et depuis que `locale` est un CHOIX, cette
 *                         déduction est devenue plus fausse qu'avant, pas moins.
 */
export function freeSignupMetadata(
  input: FreeSignupMetadataInput,
): Record<string, unknown> {
  return {
    full_name: input.fullName.trim(),
    locale: input.locale,
    timezone: input.timezone,
    tz_follow_device: true,
    keel_signup_intent: FREE_SIGNUP_INTENT,
    country: input.country,
  };
}

/**
 * CE QUE `signUp` VIENT DE FAIRE, LU DEPUIS SA RÉPONSE.
 *
 * ── POURQUOI CETTE BRANCHE MÉRITE UNE FONCTION À ELLE ─────────────────────
 * `enable_confirmations = false` en local: `signUp` y ouvre TOUJOURS une
 * session, donc la branche « vérifie tes mails » ne se joue jamais sur un poste
 * de dev. Elle ne se joue qu'en production, chez quelqu'un qu'on ne verra pas.
 * Jusqu'ici elle n'avait donc été vérifiée que par LECTURE — c'est-à-dire pas
 * vérifiée du tout, et n'importe quelle inversion de la condition serait partie
 * en prod sans que rien ne la rattrape.
 *
 * Sortie du composant, la décision devient une table de vérité de quatre
 * lignes qu'un test épingle. Et `config.toml` n'a pas à bouger pour ça: c'est
 * un fichier partagé qui part en prod, et changer le comportement de l'auth de
 * toute l'équipe pour observer un écran serait un prix absurde.
 *
 * ── LES QUATRE CAS, ET CELUI QUI SURPREND ─────────────────────────────────
 * `user` sans `session` est la confirmation d'e-mail. Le rattachement au coach
 * maison est DÉJÀ fait à ce moment: `handle_new_user()` part à l'INSERT de
 * l'utilisateur auth, pas à l'ouverture de la boîte mail. L'écran doit donc
 * dire « c'est créé, va confirmer », jamais « on finira quand tu reviendras ».
 *
 * `user` ET `session`: on rejoue la RPC de rattachement, qui est idempotente —
 * elle ne fait rien si le trigger a réussi, et répare s'il a échoué.
 *
 * Ni l'un ni l'autre: Supabase n'a rien créé et n'a pas levé. On ne montre
 * alors AUCUN écran de succès — c'est la faute qui a coûté une invitation
 * perdue sur /join, un message technique sous un bouton « Accepter ».
 */
export type SignUpOutcome = "check_email" | "attach" | "nothing";

export function signUpOutcome(
  result: { user: unknown | null; session: unknown | null } | null | undefined,
): SignUpOutcome {
  if (!result?.user) return "nothing";
  return result.session ? "attach" : "check_email";
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
    // ⚠️ `country_required` ARRIVE ENCORE DE LA BASE, ET N'A PLUS D'ÉCRAN POUR
    // Y RÉPONDRE. Le pays n'est plus saisi — il est déduit du fuseau — donc ce
    // refus ne peut plus vouloir dire « la personne n'a pas répondu ». Il veut
    // dire que la déduction a produit une valeur que la base rejette,
    // c'est-à-dire un défaut de NOTRE côté. On le range donc avec les pannes,
    // dont la phrase invite à réessayer, plutôt que de demander à quelqu'un de
    // corriger un champ qu'il n'a jamais vu.
    case "country_required":
      return "start.error.generic";
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
