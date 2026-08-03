// KEEL frontend i18n — flat message lookup with fail-loud semantics (R7).
//
// Messages is a flat record: { 'coach.dashboard.title': string, ... }.
// The key set is derived from the English seed (en.ts) so the seed stays the
// single source of truth — adding a key there immediately types t() calls.

import { en } from "./en"

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

// Pilot: English only. resolveResponseLocale (backend) is the single point of
// change for conversation language; this table is the UI-locale equivalent.
const messages: Messages = en

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
  const template = messages[key]
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
