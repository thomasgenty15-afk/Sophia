// KEEL — response-locale resolution + prompt language block.
// CONTRACT R3: ui_locale / conversation_locale / content_locale never collapse.
// This module only decides the CONVERSATION locale of a generated reply.

import { normalizeLocale } from "../locale.ts"

/**
 * Resolve the locale the AI must write its visible reply in.
 *
 * Priority (highest wins):
 *   1. userExplicit   — the student explicitly set a response language
 *   2. persisted      — the locale already committed to THIS thread (R3)
 *   3. tenantDefault  — the coach tenant's default locale
 *   4. detectedRecent — language detected on recent student messages
 *   5. 'en-US'        — final fallback
 *
 * WHY `persisted` OUTRANKS DETECTION (R3, and this repo has paid for it):
 * `detectedRecent` is per-message. A student who drops one English sentence
 * into a French thread flips the language mid-conversation, then flips back on
 * the next turn — the oscillation failure mode CONTRACT R3 names explicitly.
 * The thread's committed locale is the anchor; only an EXPLICIT request from
 * the student may move it. A caller that never persists the result has, by
 * construction, re-enabled the oscillation.
 *
 * PILOT NOTE: during the pilot every caller receives 'en-US'. This function is
 * deliberately the SINGLE point of change — when multi-language ships, delete
 * the early return below and the priority chain takes over. No other module
 * may hardcode a response locale.
 */
export function resolveResponseLocale(args: {
  userExplicit?: string | null
  /** Locale already committed to this thread. Anti-oscillation anchor (R3). */
  persisted?: string | null
  tenantDefault?: string | null
  detectedRecent?: string | null
}): string {
  // PILOT: force English everywhere. Remove this line to enable the chain.
  return "en-US"

  // Unreachable during the pilot; kept so the real logic is reviewed now.
  // deno-lint-ignore no-unreachable
  const candidates = [
    args.userExplicit,
    args.persisted,
    args.tenantDefault,
    args.detectedRecent,
  ]
  for (const c of candidates) {
    const s = String(c ?? "").trim()
    if (s) return normalizeLocale(s, "en-US")
  }
  return "en-US"
}

/**
 * True when `locale` is a French locale.
 *
 * This is the SURFACE_FORM freeze gate of BELT_AUDIT.md, exposed once so no
 * module re-implements `startsWith('fr')` with its own normalization. A belt
 * whose mechanism is French morphology stays armed only behind this predicate.
 */
export function isFrenchLocale(locale: string | null | undefined): boolean {
  return normalizeLocale(String(locale ?? ""), "en-US")
    .slice(0, 2)
    .toLowerCase() === "fr"
}

// Human-readable language names for the prompt block. R7: unknown prefixes do
// not throw here — the block degrades to naming the BCP-47 tag itself, which
// is still an unambiguous instruction for the model.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  de: "German",
}

/**
 * Build the RESPONSE_LANGUAGE block. Callers MUST inject it as the LAST
 * instruction of a generated prompt (recency wins with LLMs; this repo has
 * already paid for cross-turn language oscillation — CONTRACT R3).
 */
export function buildResponseLanguageBlock(locale: string): string {
  const tag = normalizeLocale(locale, "en-US")
  const prefix = tag.slice(0, 2).toLowerCase()
  const language = LANGUAGE_NAMES[prefix] ?? tag
  return [
    "RESPONSE_LANGUAGE:",
    `You MUST write your entire visible reply in ${language} (${tag}).`,
    "Data tokens remain English snake_case: never translate slugs, enum values,",
    "slot keys, day tokens, units, or any machine-read identifier (R1).",
  ].join("\n")
}

/**
 * Append the RESPONSE_LANGUAGE block as the LAST instruction of `prompt`.
 *
 * CALL THIS AFTER EVERY OTHER TRANSFORMATION — in particular after any prompt
 * budget/truncation pass. A composer that truncates by the tail (companion
 * does) and appends the block before truncating simply deletes it, and the
 * language instruction is gone with no error anywhere. Position is the whole
 * mechanism: recency wins with LLMs.
 *
 * Idempotent: appending twice yields one block.
 */
export function appendResponseLanguageBlock(
  prompt: string,
  locale: string,
): string {
  const body = String(prompt ?? "").trimEnd()
  const block = buildResponseLanguageBlock(locale)
  if (body.endsWith(block)) return body
  return body ? `${body}\n\n${block}` : block
}
