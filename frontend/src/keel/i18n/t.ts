// KEEL frontend i18n — flat message lookup with fail-loud semantics (R7).
//
// Messages is a flat record: { 'coach.dashboard.title': string, ... }.
// The key set is derived from the English seed (en.ts) so the seed stays the
// single source of truth — adding a key there immediately types t() calls.

import { en } from "./en"
import { fr } from "./fr"
import { isDeclaredPagePath, isTranslatedMessageKey } from "./catalog"
import { uiLocale } from "./runtime"

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

/**
 * Le seed anglais est la SOURCE DU TYPE et le fond de carte.
 *
 * Le français est livré sur la vitrine ET sur le couloir d'entrée (voir
 * `catalog.ts` pour le pourquoi de la frontière et la liste des namespaces).
 * En dehors, l'anglais est la langue DÉCLARÉE du produit, pas une dégradation
 * silencieuse: la frontière est portée par un type, testée par une ceinture de
 * parité, et signalée en DEV ci-dessous. Chaque fois que le périmètre
 * s'élargit, `TRANSLATED_NAMESPACES` gagne une ligne et le compilateur énumère
 * ce qui manque.
 */
function resolve(key: MessageKey): string | undefined {
  if (uiLocale() === "fr" && isTranslatedMessageKey(key)) {
    return fr[key]
  }
  return en[key]
}

/**
 * R7: token mappings fail loudly — but with a deliberate split by environment.
 * In dev we THROW, so an unknown key is caught at the first render, in the
 * test or the review, never shipped. In prod we console.error and return the
 * key itself: a throw during render would crash the whole React subtree and
 * take down the screen for one missing label — punishing the user for our
 * bug. Returning the raw key keeps the page usable while remaining visibly
 * broken (the key string is on screen) and loudly logged.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = resolve(key)
  if (import.meta.env.DEV && uiLocale() === "fr" && !isTranslatedMessageKey(key)) {
    // ── DEUX RÉGIMES, PARCE QU'IL Y A DEUX SITUATIONS DIFFÉRENTES ───────────
    //
    // Sur une page NON DÉCLARÉE (l'app authentifiée aujourd'hui), une clé hors
    // périmètre est la frontière qui fonctionne: on n'a jamais promis le
    // français ici. Visible pour NOUS, jamais pour l'utilisateur — un throw
    // ferait tomber l'app dès qu'un francophone s'y connecte, ce qui serait le
    // punir d'une frontière qu'on a choisie.
    //
    // Sur une page DÉCLARÉE dans `PAGE_NAMESPACES`, c'est l'inverse: on a
    // promis qu'elle se rend ENTIÈREMENT dans la langue du visiteur, et cette
    // clé prouve que c'est faux. C'est une COUTURE — un mot anglais au milieu
    // d'un écran français — et c'est exactement le défaut mesuré le 2026-08-12
    // sur `/start`. Aucune analyse statique ne peut la trouver: la page
    // emprunte la clé à un namespace voisin, parfois à travers `labels.ts` et
    // un jeton venu de la base. Le seul détecteur possible est celui-ci, à
    // l'exécution, et il doit être BRUYANT — sinon il finit dans un journal que
    // personne ne lit.
    const declared = isDeclaredPagePath(globalThis.location?.pathname ?? "")
    const msg =
      `t(): "${key}" est hors du périmètre traduit alors que cette page est ` +
      `DÉCLARÉE traduisible — c'est une couture. Ajoute son namespace à la ` +
      `déclaration de la page, ou traduis-le. Voir i18n/catalog.ts.`
    if (declared) throw new Error(msg)
    console.info(
      `t(): "${key}" est hors de la vitrine — rendu en anglais (frontière déclarée, voir i18n/catalog.ts)`,
    )
  }
  if (template === undefined) {
    const msg = `t(): unknown message key "${key}"`
    if (import.meta.env.DEV) {
      throw new Error(msg)
    }
    console.error(msg)
    return key
  }
  if (!params) return template
  // Interpolate {name} placeholders. Unknown placeholders fail loudly too:
  // a rendered "{name}" means a params mismatch, so we apply the same split.
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    if (value === undefined) {
      const msg = `t(): missing param "${name}" for key "${key}"`
      if (import.meta.env.DEV) {
        throw new Error(msg)
      }
      console.error(msg)
      return whole
    }
    return String(value)
  })
}
