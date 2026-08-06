// KEEL frontend i18n — flat message lookup with fail-loud semantics (R7).
//
// Messages is a flat record: { 'coach.dashboard.title': string, ... }.
// The key set is derived from the English seed (en.ts) so the seed stays the
// single source of truth — adding a key there immediately types t() calls.

import { en } from "./en"
import { fr } from "./fr.public"
import { isPublicMessageKey } from "./catalog"
import { uiLocale } from "./runtime"

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

/**
 * Le seed anglais est la SOURCE DU TYPE et le fond de carte.
 *
 * Le français est livré sur la VITRINE (voir `catalog.ts` pour le pourquoi de
 * la frontière et la liste des namespaces). En dehors, l'anglais est la langue
 * DÉCLARÉE du produit, pas une dégradation silencieuse: la frontière est
 * portée par un type, testée par une ceinture de parité, et signalée en DEV
 * ci-dessous. Le jour où l'app authentifiée est traduite, `PUBLIC_NAMESPACES`
 * s'élargit et le compilateur énumère ce qui manque.
 */
function resolve(key: MessageKey): string | undefined {
  if (uiLocale() === "fr" && isPublicMessageKey(key)) {
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
  if (import.meta.env.DEV && uiLocale() === "fr" && !isPublicMessageKey(key)) {
    // Visible pour NOUS, jamais pour l'utilisateur. Un throw ici ferait tomber
    // l'app authentifiée dès qu'un visiteur ayant choisi le français s'y
    // connecte — punir l'utilisateur pour une frontière qu'on a décidée.
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
