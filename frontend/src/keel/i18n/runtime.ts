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
  parseUiLocale,
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
  applyDocumentLang(resolved);
  // Un `?lang=` explicite vaut choix: sinon le visiteur qui suit un lien
  // français repasse en anglais dès qu'il clique sur une autre page.
  if (fromQuery) safeStorage()?.setItem(UI_LOCALE_STORAGE_KEY, resolved);
  return resolved;
}

/** La locale courante. Lecture seule — `t()` et `format` s'en servent. */
export function uiLocale(): UiLocale {
  return current;
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
