// KEEL — LA FORME D'UN PAYS, ET RIEN D'AUTRE.
//
// ── CE QUE CE FICHIER PORTAIT, ET QUI EST PARTI ────────────────────────────
//
// Il portait `SIGNUP_COUNTRIES` (dix-huit pays proposés) et
// `NO_COUNTRY_SELECTED` (l'état « personne n'a répondu »), parce que TROIS
// portes d'inscription demandaient le pays. Aucune ne le demande plus: la
// question se justifiait par le numéro d'urgence — un sujet que le produit ne
// traite pas aujourd'hui — et elle occupait la place de la seule qui change
// quelque chose tous les jours, la LANGUE.
//
// Le pays est désormais DÉDUIT du fuseau (`api/countryFromTimezone.ts`, où le
// prix de la déduction est écrit noir sur blanc). Ce fichier ne garde donc que
// ce qui reste vrai: la FORME.
//
// ⚠️ CE QUI N'A PAS CHANGÉ, ET QU'IL FAUT SAVOIR AVANT DE TOUCHER À CECI:
// `profiles.country` est lu EN PREMIER par le résolveur de ressources de crise,
// et son absence le fait retomber sur la LANGUE. C'est l'incident qui a coûté
// l'inscription générique de `/auth` et que la migration `20260804180000` a
// fermé. La déduction est un arbitrage assumé, pas une réparation: le jour où
// l'urgence redevient un sujet, on REPOSE la question.

/**
 * La FORME d'un pays: deux lettres majuscules, ISO 3166-1 alpha-2.
 *
 * La même forme est vérifiée deux fois de plus côté serveur —
 * `profiles_country_iso3166_check` sur la colonne, et le refus `bad_country` de
 * `keel_household_join`. Trois contrôles de la même règle et aucun ne dérive:
 * c'est une forme, pas une politique. Une LISTE fermée, elle, refuserait un
 * pays légitime le jour où quelqu'un s'y inscrit — c'est pour ça qu'il n'y en a
 * jamais eu.
 *
 * Elle reste exportée alors que plus aucun formulaire ne saisit de pays: c'est
 * la ceinture qui vérifie que la DÉDUCTION rend bien quelque chose d'écrivable,
 * et un test s'en sert sur chaque entrée de la table de fuseaux.
 */
export function isDeclaredCountryValid(country: string): boolean {
  return /^[A-Z]{2}$/.test(country);
}
