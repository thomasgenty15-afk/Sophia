// KEEL — LE PAYS DÉCLARÉ, ET POURQUOI IL A SON PROPRE FICHIER.
//
// ── CE QUE LE PAYS DÉCIDE ─────────────────────────────────────────────────
//
// `profiles.country` est lu EN PREMIER par le résolveur de ressources de crise.
// Quand il est NULL, le résolveur retombe sur la LANGUE — et `locale` vaut
// `en-US` sur toutes les surfaces KEEL. Un utilisateur français en détresse
// recevait donc un numéro américain, `fallbackUsed` à faux, et rien ne le
// signalait. C'est l'incident qui a coûté l'inscription générique de `/auth`
// (voir `pages/Auth.tsx:37-62`) et que la migration `20260804180000` a fermé.
//
// D'où la règle que toute porte d'entrée applique: LE PAYS EST DEMANDÉ, jamais
// dérivé de la langue. « country is not a language ».
//
// ── POURQUOI CETTE LISTE N'EST PAS UNE VALIDATION ─────────────────────────
//
// C'est un ORDRE DE COMMODITÉ, pas un filtre. La validation est la FORME
// (`isDeclaredCountryValid` ici, `profiles_country_iso3166_check` en base):
// une liste fermée refuserait un pays légitime le jour où quelqu'un s'y
// inscrit, ce qui est un mur invisible dans les tests.
//
// ── LES TROIS PORTES, ET CELLE QUI GARDE SA COPIE ─────────────────────────
//
// `/start` (inscription libre) et `/join-household` (porte foyer, chantier 4)
// lisent CE fichier. `pages/Auth.tsx` garde sa propre copie (`COACH_COUNTRIES`)
// et ce n'est pas un oubli: ce fichier est la PORTE DE CONNEXION UNIQUE du
// produit — « une régression ici est une panne totale » — et l'y toucher pour
// factoriser une constante n'en vaut pas le risque. Les deux listes sont
// identiques; si elles divergent, c'est de l'ordre d'affichage, jamais de la
// validation.
//
// La LISTE reste donc dupliquée là-bas. `NO_COUNTRY_SELECTED` ci-dessous ne
// l'est PAS, et la différence est exactement celle qui compte: un ordre
// d'affichage qui diverge est cosmétique, une valeur initiale qui diverge
// redonne un pays à quelqu'un qui n'en a pas déclaré.

export interface SignupCountry {
  code: string;
  label: string;
}

/**
 * L'ÉTAT INITIAL DE TOUT SÉLECTEUR DE PAYS — « personne n'a encore répondu ».
 *
 * ── LE DÉFAUT QUE CETTE CONSTANTE FERME ────────────────────────────────────
 * `/start` naissait à `"US"`. Mesuré le 2026-08-12 en jouant le parcours: un
 * compte créé sans jamais toucher le champ est né avec `profiles.country='US'`,
 * sous une aide qui dit « pour te donner le bon numéro d'urgence ». Autrement
 * dit la colonne dont dépend la hotline de crise était pré-remplie au mauvais
 * pays pour tout non-Américain qui ne remarquait pas le champ. Une valeur
 * préchoisie n'est pas un défaut commode: c'est une réponse fabriquée par nous
 * et attribuée à la personne, sur le seul champ où se tromper coûte cher.
 *
 * ── POURQUOI UNE CONSTANTE, ET PAS `""` ÉCRIT TROIS FOIS ───────────────────
 * Trois portes demandent le pays (`/start`, `/join-household`, la porte coach
 * de `/auth`). Un littéral par porte, c'est trois endroits où quelqu'un peut
 * réécrire `"US"` « pour éviter un champ vide » — et l'écrire là ne casse
 * AUCUN test, puisque `"US"` est une valeur parfaitement valide. Nommée ici,
 * elle est gardée une fois: `isDeclaredCountryValid(NO_COUNTRY_SELECTED)` doit
 * rendre `false`, et ce test rougit le jour où on lui redonne un pays.
 *
 * La valeur vide est aussi ce que la base attend: `keel_join_house_coach` rend
 * `country_required`, et `keel_household_join` rend `bad_country`. Le refus est
 * donc armé des deux côtés — l'écran ne fait qu'éviter l'aller-retour.
 */
export const NO_COUNTRY_SELECTED = "";

/** Les pays proposés d'abord. PAS une liste de validation — voir l'en-tête. */
export const SIGNUP_COUNTRIES: SignupCountry[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "FR", label: "France" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IE", label: "Ireland" },
  { code: "NZ", label: "New Zealand" },
  { code: "BE", label: "Belgium" },
  { code: "CH", label: "Switzerland" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "PT", label: "Portugal" },
  { code: "SE", label: "Sweden" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "ZA", label: "South Africa" },
];

/**
 * La FORME d'un pays déclaré: deux lettres majuscules, ISO 3166-1 alpha-2.
 *
 * La même forme est vérifiée deux fois de plus côté serveur —
 * `profiles_country_iso3166_check` sur la colonne, et le refus `bad_country`
 * de `keel_household_join`. Trois contrôles de la même règle et aucun ne
 * dérive: c'est une forme, pas une politique.
 *
 * ⚠️ La chaîne VIDE est fausse, et c'est le point. Un sélecteur qui démarre
 * sur un pays préchoisi enregistre le pays de personne; les portes qui
 * demandent le pays partent donc d'une valeur vide, que cette fonction refuse.
 */
export function isDeclaredCountryValid(country: string): boolean {
  return /^[A-Z]{2}$/.test(country);
}
