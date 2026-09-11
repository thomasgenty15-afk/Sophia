// KEEL — LES PAGES DONT L'URL PORTE LA LANGUE, ET RIEN D'AUTRE.
//
// ⚠️ CE FICHIER EST SÉPARÉ DE `catalog.ts` POUR UNE RAISON MÉCANIQUE, PAS
// ESTHÉTIQUE. `scripts/prerender.mjs` a besoin de `localePath` au BUILD, sous
// `node --experimental-strip-types`. `catalog.ts` importe `react-router-dom`
// (pour `matchPath`) et `./en` sans extension: Node ne résout ni l'un ni
// l'autre, et bundler tout le routeur React pour composer une URL serait
// absurde. Ce module n'a AUCUN import de valeur — seulement un type, effacé à
// la compilation — donc Node l'importe tel quel.
//
// `catalog.ts` réexporte tout ce qui est ici: aucun appelant existant ne change.

import type { UiLocale } from "./catalog";

// ── LES PAGES DONT L'URL DÉCIDE LA LANGUE ──────────────────────────────────
//
// Partout ailleurs, la langue d'une page est celle du VISITEUR (son clic, son
// `localStorage`, son navigateur). Sur ces quatre surfaces-là, c'est l'URL qui
// tranche: `/couples` est française, `/en/couples` est anglaise, et le
// navigateur du lecteur n'y peut rien.
//
// ── POURQUOI CETTE EXCEPTION EXISTE ───────────────────────────────────────
// Ce sont les quatre pages qu'on veut voir INDEXÉES. Une page bilingue servie
// sur une seule URL et choisie côté client n'a pas de langue stable pour un
// moteur: Googlebot explore sans `localStorage` avec `Accept-Language: en`, il
// rendait donc l'anglais pendant que le HTML statique de `index.html` promet
// du français. Deux réponses contradictoires sur la même URL, et aucune
// balise `hreflang` possible — une alternative se DÉCLARE par son URL, et il
// n'y en avait qu'une.
//
// ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE: un
// visiteur au navigateur anglais qui ouvre `/` lit désormais du FRANÇAIS. La
// détection automatique ne s'applique plus à ces quatre chemins. Ce qui la
// remplace est le sélecteur de langue de `PublicHeader`, qui NAVIGUE vers le
// jumeau au lieu de recharger. Le jour où on rétablit une détection, elle doit
// rester une SUGGESTION (un lien « Read in English ») et jamais une
// redirection: une redirection par langue vue par un robot fait disparaître
// l'une des deux versions de l'index.
//
// ⚠️ N'AJOUTE PAS `/start`, `/auth` NI `/join` ICI. Ce sont des portes
// fonctionnelles, pas des surfaces indexées; elles suivent le visiteur, et les
// pages anglaises les atteignent en portant `?lang=en` sur leur lien.
// ⚠️ UNE SEULE ENTRÉE DEPUIS LE 2026-09-08: les trois pages de vente sont
// retirées. Le mécanisme reste (l'URL décide la langue du hall), et une
// page indexée qui naîtrait demain s'ajoute ici ET dans `INDEXED_PAGES`.
export const LOCALE_ROUTED_PATHS = [
  "/",
] as const;

/** Le segment qui porte l'anglais. Le français est le chemin nu. */
export const EN_PATH_PREFIX = "/en";

const LOCALE_ROUTED_SET: ReadonlySet<string> = new Set(LOCALE_ROUTED_PATHS);

/**
 * Sépare un chemin en (langue portée par l'URL, chemin canonique français).
 *
 * `/en/couples` → `{ locale: "en", path: "/couples" }`
 * `/en`         → `{ locale: "en", path: "/" }`
 * `/couples`    → `{ locale: null, path: "/couples" }`
 *
 * `locale` vaut `null` quand l'URL ne dit rien — et `null` n'est PAS « le
 * français »: sur un chemin hors de `LOCALE_ROUTED_PATHS` il veut dire « cette
 * page suit le visiteur », ce qui reste le cas de tout le produit connecté.
 */
export function stripLocalePrefix(
  pathname: string,
): { locale: UiLocale | null; path: string } {
  const raw = String(pathname ?? "").trim();
  if (raw === EN_PATH_PREFIX || raw === `${EN_PATH_PREFIX}/`) {
    return { locale: "en", path: "/" };
  }
  if (raw.startsWith(`${EN_PATH_PREFIX}/`)) {
    return { locale: "en", path: raw.slice(EN_PATH_PREFIX.length) };
  }
  return { locale: null, path: raw };
}

/** Ce chemin est-il une des surfaces dont l'URL porte la langue ? */
export function isLocaleRoutedPath(pathname: string): boolean {
  const { path } = stripLocalePrefix(pathname);
  // Un slash final ne fait pas une autre page — `namespacesForPath` l'ignore
  // déjà, et une alternative `hreflang` qui différerait par lui déclarerait
  // deux URL pour une seule page.
  const normalised = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  return LOCALE_ROUTED_SET.has(normalised);
}

/**
 * L'URL de cette page DANS une langue donnée. C'est la source unique dont
 * sortent à la fois les `hreflang`, le `canonical`, le sélecteur de langue et
 * les liens internes des pages anglaises.
 *
 * Rend le chemin inchangé si la page n'est pas routée par langue: un appelant
 * n'a pas à savoir laquelle l'est, et un lien vers `/start` reste `/start`.
 */
export function localePath(pathname: string, locale: UiLocale): string {
  if (!isLocaleRoutedPath(pathname)) return pathname;
  const { path } = stripLocalePrefix(pathname);
  if (locale === "fr") return path;
  return path === "/" ? EN_PATH_PREFIX : `${EN_PATH_PREFIX}${path}`;
}
