// KEEL — la locale d'interface COURANTE, résolue une fois au démarrage.
//
// ── POURQUOI UNE VARIABLE DE MODULE ET PAS UN CONTEXTE REACT ───────────────
// `t()` est une fonction pure appelable de partout, et c'est ce qui rend la
// traduction bon marché: `keel/api/labels.ts` (723 lignes), `coachProtocol.ts`,
// `inviteStudent.ts`, `freeSignup.ts` l'appellent depuis du code qui n'est pas
// un composant. Un hook obligerait à faire passer `t` à travers toute cette
// couche, ou à maintenir un SECOND point de vérité pour la locale courante —
// exactement la classe de bug que ce chantier existe pour fermer.
//
// Le prix: changer de langue RECHARGE la page. Pour une préférence qu'on
// modifie une fois par visiteur, c'est le bon échange.

import {
  DEFAULT_UI_LOCALE,
  isPendingTranslationNamespace,
  parseUiLocale,
  PUBLIC_PAGE_NAMESPACES,
  type UiLocale,
} from "./catalog";

/** Là où le choix du visiteur survit à un rechargement. */
export const UI_LOCALE_STORAGE_KEY = "sophia.ui_locale";

let current: UiLocale = DEFAULT_UI_LOCALE;
let initialised = false;

function safeStorage(): Storage | null {
  // Un navigateur en navigation privée peut jeter sur l'accès lui-même, pas
  // seulement sur l'écriture. Le switch de langue ne doit pas faire tomber la
  // vitrine parce qu'un visiteur a désactivé le stockage.
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Résout la locale d'interface. Appelé UNE fois, avant le premier rendu.
 *
 * Ordre de priorité, du plus explicite au plus deviné:
 *   1. `?lang=fr` — un lien partagé qui nomme sa langue
 *   2. le choix précédent du visiteur (`localStorage`)
 *   3. `navigator.languages` — sa préférence système
 *   4. l'anglais, qui est le défaut DÉCLARÉ (et le `x-default` du SEO)
 *
 * On ne lit PAS le profil ici, et c'est délibéré: la session met deux
 * allers-retours à se résoudre, et bloquer le premier rendu derrière elle
 * donnerait une vitrine blanche au visiteur anonyme — c'est-à-dire à
 * l'acheteur. Le rapprochement avec `profiles.locale` se fait après, une fois
 * la session connue.
 */
export function initUiLocale(): UiLocale {
  if (initialised) return current;

  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const fromQuery = params.get("lang");
  const fromStorage = safeStorage()?.getItem(UI_LOCALE_STORAGE_KEY) ?? null;
  const fromNavigator = (globalThis.navigator?.languages ?? []).find((tag) =>
    parseUiLocale(tag) !== DEFAULT_UI_LOCALE
  ) ?? globalThis.navigator?.language ?? null;

  const resolved = fromQuery
    ? parseUiLocale(fromQuery)
    : fromStorage
    ? parseUiLocale(fromStorage)
    : parseUiLocale(fromNavigator);

  current = resolved;
  initialised = true;
  // La langue du DOCUMENT est celle de la PAGE, pas celle du visiteur: sur une
  // page non traduite les deux diffèrent, et c'est la page qu'un lecteur
  // d'écran va prononcer.
  applyDocumentLang(uiLocale());
  // Un `?lang=` explicite vaut choix: sinon le visiteur qui suit un lien
  // français repasse en anglais dès qu'il clique sur une autre page.
  if (fromQuery) safeStorage()?.setItem(UI_LOCALE_STORAGE_KEY, resolved);
  return resolved;
}

// ── LA FRONTIÈRE DE LANGUE, ET POURQUOI ELLE EST ICI ───────────────────────
//
// Elle était censée passer AU BORD des pages non traduites. Elle passait en
// fait EN PLEIN MILIEU: mesuré le 2026-08-12 sur `/start`, un visiteur au
// navigateur français lisait un en-tête et un pied de page traduits autour
// d'un corps entièrement anglais, parce que `public.*` est traduit et que le
// namespace du corps ne l'était pas. Le même défaut valait pour `/gyms`,
// `/communities`, `/join` et `/join-household`.
//
// ── POURQUOI LA RÉSOUDRE ICI ET PAS DANS LE CHROME ────────────────────────
// Donner une prop « ma page n'est pas traduite » à `PublicHeader` marcherait
// une fois, puis la page suivante l'oublierait. `t()` est le SEUL point par
// où passe chaque mot rendu; corriger la langue ici, c'est la corriger pour
// tout ce qu'une page affiche, y compris ce qu'on écrira demain. Aucun écran
// ne peut plus se tromper individuellement — il n'y a plus de choix par écran.
//
// Le prix, et il est assumé: `uiLocale()` dépend maintenant de l'URL courante.
// C'est pour ça que `chosenUiLocale()` existe juste en dessous — un sélecteur
// de langue doit montrer le CHOIX du visiteur, jamais ce que la page a pu en
// faire, sinon son clic ressemble à un bouton mort.

/** Sans slash final (sauf la racine): `/gyms/` et `/gyms` sont la même page. */
function normalisePath(pathname: string): string {
  const trimmed = String(pathname ?? "").trim();
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed;
}

/**
 * La langue dans laquelle une page donnée peut se rendre ENTIÈREMENT.
 *
 * Un chemin inconnu rend le choix du visiteur, et c'est volontaire: l'app
 * connectée, `/legal`, `/auth` et tout ce qui n'est pas une page de vitrine ne
 * déclarent aucun namespace, donc rien ne change pour eux.
 */
export function uiLocaleForPath(pathname: string): UiLocale {
  const namespaces = PUBLIC_PAGE_NAMESPACES[normalisePath(pathname)];
  if (namespaces?.some(isPendingTranslationNamespace)) return DEFAULT_UI_LOCALE;
  return current;
}

/**
 * La locale EFFECTIVE de ce qui est à l'écran. `t()` et `SEO` s'en servent.
 *
 * Lue à l'appel plutôt que mémorisée au montage: sous React Router, une
 * navigation client met `history` à jour AVANT de prévenir ses abonnés, donc
 * `location.pathname` est déjà le bon quand le rendu suivant appelle `t()`.
 */
export function uiLocale(): UiLocale {
  return uiLocaleForPath(globalThis.location?.pathname ?? "");
}

/**
 * Ce que le VISITEUR a choisi, indépendamment de la page qu'il lit.
 *
 * Le sélecteur de langue lit celle-ci. Avec `uiLocale()`, il afficherait
 * « EN » actif sur une page non traduite alors que le choix enregistré est le
 * français — et le clic sur « FR » n'aurait aucun effet visible sur cette
 * page-là, ce qui se lit comme un bouton cassé plutôt que comme une frontière.
 */
export function chosenUiLocale(): UiLocale {
  return current;
}

/**
 * RÉSERVÉ AUX TESTS. La vitrine passe par `initUiLocale` (au démarrage) ou
 * `setUiLocaleAndReload` (au clic); ni l'un ni l'autre n'est rejouable dans un
 * même processus, ce qui rend les deux langues intestables sans ce point
 * d'entrée. Nommé pour qu'un appel hors test se voie en relecture.
 */
export function setChosenUiLocaleForTest(locale: UiLocale): void {
  current = locale;
  initialised = true;
}

/**
 * L'attribut `lang` du document, écrit à UN endroit.
 *
 * Il était réécrit en dur à `"en"` par trois composants (`PublicHeader`,
 * `KeelAppShell`, `Auth`), chacun au montage. Trois écrivains pour un attribut
 * veut dire que le dernier monté gagne — donc que la valeur dépend de l'ordre
 * de rendu, ce qui n'est pas une décision qu'on prend.
 */
export function applyDocumentLang(locale: UiLocale): void {
  const root = globalThis.document?.documentElement;
  if (root) root.lang = locale;
}

/**
 * Change de langue et RECHARGE.
 *
 * Le rechargement n'est pas une paresse: `t()` est résolu à l'appel depuis une
 * variable de module, et plusieurs constantes de module (les données
 * structurées SEO de la landing, la table des refus d'invitation) appellent
 * `t()` à l'IMPORT. Elles se figeraient à la langue du premier chargement.
 * Recharger rend la bascule totale et sans cas particulier.
 */
export function setUiLocaleAndReload(next: UiLocale): void {
  if (next === current) return;
  safeStorage()?.setItem(UI_LOCALE_STORAGE_KEY, next);
  // On retire `?lang` de l'URL: le laisser ferait gagner l'ancienne valeur au
  // rechargement (priorité 1), et le clic n'aurait aucun effet visible.
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("lang");
  globalThis.location.replace(url.toString());
}
