// KEEL — LA CIBLE D'UN LIEN INTERNE, DANS LA LANGUE DE LA PAGE QUI LE PORTE.
//
// ── LE DÉFAUT QUE CE FICHIER FERME ────────────────────────────────────────
// Les quatre surfaces de vente existent en deux exemplaires depuis que l'URL
// porte la langue (`LOCALE_ROUTED_PATHS` dans `catalog.ts`). Un lien écrit en
// dur — `<Link to="/couples">` — renvoie donc TOUJOURS vers le français, y
// compris depuis `/en/families`. Trois conséquences, et la troisième est la
// plus chère:
//
//   1. le lecteur anglais tombe en français au premier clic;
//   2. le jeu `/en` n'a AUCUN lien entrant — un moteur ne le découvre que par
//      le sitemap, et une page sans lien interne est une page qu'on explore
//      rarement et qu'on classe mal;
//   3. la « couture » que tout `i18n/` combat revient par la porte des liens.
//
// ── POURQUOI UNE FONCTION ET PAS UNE PROP ─────────────────────────────────
// C'est le même arbitrage que `t()`: une prop « ma page est anglaise » se
// transmet une fois puis s'oublie au composant suivant, et le composant
// oublieux est invisible en relecture. Ici la réponse se dérive de l'URL
// COURANTE, donc aucun appelant n'a rien à savoir ni à faire suivre.

import { isLocaleRoutedPath, localePath } from "./catalog";
import { uiLocale } from "./runtime";

/**
 * La cible réelle d'un lien interne, vue depuis la page courante.
 *
 * Deux cas, et ils ne font pas la même chose:
 *
 *   · LA CIBLE EST UNE SURFACE ROUTÉE PAR LANGUE — on rend son jumeau dans la
 *     langue de la page courante. `/couples` depuis `/en/families` devient
 *     `/en/couples`.
 *
 *   · LA CIBLE EST UNE PORTE FONCTIONNELLE (`/start`, `/auth`, `/join`…) —
 *     elle n'a qu'une URL et suit le VISITEUR. Depuis une page dont la langue
 *     vient de l'URL, on lui passe donc `?lang=`, qui est déjà le seul
 *     override déterministe de `initUiLocale` (priorité 1, et il vaut choix).
 *     Sans lui, quelqu'un qui vient de lire `/en/families` en anglais avec un
 *     navigateur français trouve un formulaire d'inscription français — la
 *     couture exacte mesurée sur `/start` le 2026-08-12.
 *
 * Depuis une page NON routée par langue (tout le produit connecté), rien n'est
 * ajouté: la langue y appartient au visiteur, et un `?lang=` posé là
 * écraserait son choix au premier lien qu'il suit.
 */
export function localeHref(to: string): string {
  const target = String(to ?? "");
  // Une URL absolue ou une ancre n'est pas à nous: on ne la réécrit jamais.
  if (target === "" || /^[a-z]+:|^\/\//i.test(target) || target.startsWith("#")) {
    return target;
  }

  const here = globalThis.location?.pathname ?? "";
  const locale = uiLocale();

  if (isLocaleRoutedPath(target)) return localePath(target, locale);
  if (!isLocaleRoutedPath(here)) return target;

  // ⚠️ ON N'ÉCRASE PAS UN `?lang=` DÉJÀ ÉCRIT À LA MAIN, et on ne double pas
  // une query existante. `URL` fait les deux correctement; une concaténation
  // de `?` ne le fait pas, et c'est le bug qu'on écrit à sa place.
  const url = new URL(target, globalThis.location?.origin ?? "https://sophia-coach.ai");
  if (!url.searchParams.has("lang")) url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
