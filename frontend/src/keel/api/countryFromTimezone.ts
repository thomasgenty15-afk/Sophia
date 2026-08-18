// KEEL — LE PAYS, DÉDUIT DU FUSEAU, PARCE QU'ON A CESSÉ DE LE DEMANDER.
//
// ── LA DÉCISION, ET CE QU'ELLE COÛTE ───────────────────────────────────────
//
// Les trois portes d'inscription demandaient le pays, avec ce texte d'aide:
// « sert à vous donner le bon numéro d'urgence si une conversation en a besoin
// un jour ». C'était vrai, et c'est précisément la raison pour laquelle la
// question a été retirée: le routage du numéro d'urgence n'est pas un sujet du
// produit aujourd'hui, et un formulaire d'inscription se juge au nombre de
// questions qu'il pose. Ce qu'on demande maintenant, à la place, c'est la
// LANGUE — la seule réponse qui change ce que la personne va lire à chaque tour.
//
// ⚠️ CE QUE ÇA DÉGRADE, ÉCRIT NOIR SUR BLANC. `profiles.country` est lu par
// `crisis_resources.ts` pour choisir la ligne d'écoute servie en cas de crise.
// Il passe donc d'une valeur DÉCLARÉE par la personne à une valeur DÉDUITE par
// nous. Un fuseau inconnu, un VPN, un voyage au long cours, et la déduction est
// fausse — sans que rien ne le signale, puisqu'une déduction ne se distingue
// pas d'une déclaration une fois en base. C'est un arbitrage assumé, pas un
// oubli: le jour où l'urgence redevient un sujet, la réparation est de reposer
// la question, pas d'améliorer la table ci-dessous.
//
// ── POURQUOI LE FUSEAU, ET PAS LA LANGUE ───────────────────────────────────
//
// Déduire le pays de la LANGUE est exactement le défaut que la migration
// `20260804180000` a fermé: un élève britannique portant le `fr-FR` legacy
// recevait le 3114 avec `fallbackUsed: false`. Ça mettrait aussi tout Belge,
// Suisse, Québécois ou Sénégalais en France.
//
// Le fuseau, lui, dit où la personne EST. Les trois formulaires l'envoient
// déjà (`Intl.DateTimeFormat().resolvedOptions().timeZone`), donc la déduction
// ne coûte ni question, ni aller-retour. Et elle sert un SECOND consommateur
// qui n'a rien à voir avec l'urgence: `meal_generation.ts` lit le pays pour
// savoir ce qui pousse en ce moment là où la personne fait ses courses — et là,
// le fuseau est franchement meilleur que la langue.
//
// ── POURQUOI UNE TABLE ET PAS UN CALCUL ────────────────────────────────────
//
// Un identifiant IANA est `Région/Ville`, où « Région » est un continent. Rien
// dans `Europe/Paris` ne dit « FR » de façon calculable. Les navigateurs
// n'exposent pas non plus le pays du fuseau. Une table est donc la seule voie,
// et elle est FERMÉE et ORDONNÉE PAR PAYS pour qu'une entrée manquante se voie
// en relecture.

import { DEFAULT_UI_LOCALE, type UiLocale } from "../i18n/catalog";

/**
 * Fuseau IANA -> ISO 3166-1 alpha-2.
 *
 * Couvre les fuseaux d'Europe de l'Ouest, d'Amérique du Nord et d'Océanie, plus
 * les pays que le sélecteur retiré proposait. Ce n'est PAS la liste des pays
 * acceptés — la base valide une FORME (`profiles_country_iso3166_check`), pas
 * une liste — c'est la liste de ce qu'on sait déduire.
 */
const COUNTRY_BY_TIMEZONE: Readonly<Record<string, string>> = {
  // ── FRANCE ET FRANCOPHONIE EUROPÉENNE ────────────────────────────────────
  "Europe/Paris": "FR",
  "Europe/Brussels": "BE",
  "Europe/Luxembourg": "LU",
  "Europe/Zurich": "CH",
  "Europe/Monaco": "MC",
  // ── ÎLES BRITANNIQUES ────────────────────────────────────────────────────
  "Europe/London": "GB",
  "Europe/Belfast": "GB",
  "Europe/Dublin": "IE",
  // ── RESTE DE L'EUROPE ────────────────────────────────────────────────────
  "Europe/Berlin": "DE",
  "Europe/Vienna": "AT",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Europe/Lisbon": "PT",
  "Atlantic/Azores": "PT",
  "Atlantic/Madeira": "PT",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Copenhagen": "DK",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO",
  "Europe/Athens": "GR",
  "Europe/Sofia": "BG",
  "Europe/Zagreb": "HR",
  "Europe/Ljubljana": "SI",
  "Europe/Bratislava": "SK",
  "Europe/Tallinn": "EE",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Malta": "MT",
  "Asia/Nicosia": "CY",
  "Atlantic/Reykjavik": "IS",
  // ── ÉTATS-UNIS ───────────────────────────────────────────────────────────
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Indiana/Indianapolis": "US",
  "America/Kentucky/Louisville": "US",
  // ── CANADA ───────────────────────────────────────────────────────────────
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Regina": "CA",
  // ── OCÉANIE ──────────────────────────────────────────────────────────────
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Hobart": "AU",
  "Australia/Darwin": "AU",
  "Pacific/Auckland": "NZ",
  // ── AILLEURS, LES PAYS QUE LE SÉLECTEUR PROPOSAIT ────────────────────────
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  "Africa/Johannesburg": "ZA",
  "Africa/Casablanca": "MA",
  "Africa/Tunis": "TN",
  "Africa/Algiers": "DZ",
  "Africa/Dakar": "SN",
  "Africa/Abidjan": "CI",
  "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Kolkata": "IN",
  "Asia/Jerusalem": "IL",
  "Asia/Beirut": "LB",
};

/**
 * Le pays d'un fuseau, ou `null` si on ne sait pas.
 *
 * `null` et pas un défaut: c'est l'appelant qui décide quoi faire d'une
 * déduction ratée, et il n'y a qu'un appelant.
 */
export function countryFromTimezone(timezone: string | null | undefined): string | null {
  const zone = String(timezone ?? "").trim();
  if (zone === "") return null;
  return COUNTRY_BY_TIMEZONE[zone] ?? null;
}

/**
 * LE DERNIER RECOURS, quand le fuseau est inconnu.
 *
 * ⚠️ C'EST ICI QUE LE DÉFAUT FERMÉ PAR `20260804180000` REVIENT, EN PETIT, ET
 * C'EST DÉLIBÉRÉ. Déduire le pays de la langue met tout francophone en France.
 * On ne l'accepte que parce que l'alternative est de n'avoir AUCUN pays — et
 * sans pays, `handle_new_user()` refuse de rattacher l'inscrit libre à son
 * coach (silencieusement, donc un compte sans plan) et `keel_household_join`
 * lève `country_required`. Une déduction grossière vaut mieux qu'un compte
 * cassé, tant que l'urgence n'est pas un sujet.
 *
 * Le jour où elle le redevient: on repose la question, on ne raffine pas ceci.
 */
const LAST_RESORT_COUNTRY: Readonly<Record<UiLocale, string>> = {
  fr: "FR",
  en: "US",
};

/**
 * Le pays à écrire dans `profiles.country`, sans avoir posé la question.
 *
 * Ordre: le FUSEAU (où la personne est), puis la région du navigateur (ce que
 * son système déclare), puis la langue choisie (le dernier recours ci-dessus).
 *
 * La région du navigateur est au milieu et pas en premier: `navigator.language`
 * vaut souvent `en-US` chez quelqu'un qui a simplement mis son système en
 * anglais, alors que son fuseau, lui, ne ment pas sur l'endroit où il est.
 */
export function declaredCountryFor(
  timezone: string | null | undefined,
  locale: UiLocale,
): string {
  const fromZone = countryFromTimezone(timezone);
  if (fromZone) return fromZone;

  const fromNavigator = browserRegion();
  if (fromNavigator) return fromNavigator;

  return LAST_RESORT_COUNTRY[locale] ?? LAST_RESORT_COUNTRY[DEFAULT_UI_LOCALE];
}

/** `fr-BE` -> `BE`. `null` dès que la forme n'est pas un alpha-2 franc. */
function browserRegion(): string | null {
  const tag = String(globalThis.navigator?.language ?? "").trim();
  const region = /^[a-zA-Z]{2,3}-([A-Za-z]{2})$/.exec(tag)?.[1];
  return region ? region.toUpperCase() : null;
}
