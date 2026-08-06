// KEEL — response-locale resolution + prompt language blocks.
// CONTRACT R3: ui_locale / conversation_locale / content_locale never collapse.
// This module decides the CONVERSATION locale of a generated reply, and the
// CONTENT locale of a generated artifact. It is the only module allowed to.

import { normalizeLocale } from "../locale.ts"

/**
 * The final fallback of every chain in this module, in one place.
 *
 * Two resolvers with two hand-written fallbacks are two decisions that drift.
 */
const FINAL_FALLBACK_LOCALE = "en-US"

/**
 * PILOT PIN — the single switch that forces one language fleet-wide.
 *
 * Delete this constant and the two `if (PILOT_FORCED_LOCALE)` guards below to
 * activate the priority chains. That is NOT a disarmament (BELT_AUDIT §W9): the
 * belts below stay armed, they simply start reading their inputs. `locale_test.ts`
 * will fail on that commit — that red is the expected signal, not a regression.
 *
 * Deliberately typed `string | null` rather than left to inference: the chains
 * below must stay type-checked while the pin is in place, or they rot unseen.
 * That is exactly how this module reached production with a written, reviewed,
 * never-executed priority chain.
 */
const PILOT_FORCED_LOCALE: string | null = "en-US"

/**
 * Inputs of the conversation-locale chain. Every field is REQUIRED.
 *
 * They used to be optional, and eight of the nine production call sites passed
 * `{}` — a chain that resolved nothing, on inputs nobody had to think about.
 * An optional parameter here is a declared axis that is never armed; the type
 * is what forces each caller to state where its answer comes from, `null`
 * included. `null` is a real answer ("this caller has no such input"); an
 * absent field is only ever an unasked question.
 */
export type ResponseLocaleInputs = {
  /** The student explicitly asked for a language. Outranks the thread anchor. */
  userExplicit: string | null
  /** Locale already committed to this thread. Anti-oscillation anchor (R3). */
  persisted: string | null
  /** The coach tenant's default locale for their students. */
  tenantDefault: string | null
  /** Language detected on recent student messages. */
  detectedRecent: string | null
}

/** First non-empty candidate, normalized. The shared tail of both chains. */
function firstNonEmptyLocale(
  candidates: readonly (string | null)[],
): string {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim()
    if (value) return normalizeLocale(value, FINAL_FALLBACK_LOCALE)
  }
  return FINAL_FALLBACK_LOCALE
}

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
 * CALL THIS ONCE PER TURN, AT THE TURN'S OWNER, AND PASS THE RESULT DOWN.
 * A composer that resolves its own language is the module R3 exists to forbid.
 */
export function resolveResponseLocale(args: ResponseLocaleInputs): string {
  if (PILOT_FORCED_LOCALE) return PILOT_FORCED_LOCALE

  return firstNonEmptyLocale([
    args.userExplicit,
    args.persisted,
    args.tenantDefault,
    args.detectedRecent,
  ])
}

/**
 * Resolve the locale of a STORED ARTIFACT — the R2 sibling of the function above.
 *
 * Use this when there is no thread to anchor to: a generated meal, a week plan,
 * a re-engagement message, a `protocol_event` row. There is no `persisted` and
 * no `detectedRecent` here **on purpose** — an artifact has no conversation to
 * oscillate, and guessing a language from prose is precisely what R2 forbids
 * ("a bare text column whose language must be guessed a posteriori").
 *
 * NOT interchangeable with `resolveResponseLocale`: writing a thread's answer
 * language onto a stored row, or a row's language into a reply, is the collapse
 * of two of the three axes R3 keeps apart.
 */
export function resolveArtifactLocale(args: {
  /** `profiles.locale` of the student the artifact is for. */
  studentProfile: string | null
  /** `coaches.default_student_locale`. */
  tenantDefault: string | null
}): string {
  if (PILOT_FORCED_LOCALE) return PILOT_FORCED_LOCALE

  return firstNonEmptyLocale([args.studentProfile, args.tenantDefault])
}

/**
 * Where the thread's committed locale lives inside `temp_memory`.
 *
 * R1: these are machine keys, never translated.
 */
export const CONVERSATION_LOCALE_KEY = "conversation_locale"
export const CONVERSATION_LOCALE_EXPLICIT_KEY = "conversation_locale_explicit"

type TempMemory = Record<string, unknown> | null | undefined

function trimmedOrNull(raw: unknown): string | null {
  const value = String(raw ?? "").trim()
  return value ? value : null
}

/**
 * R3 — the `conversation_locale` already committed to this thread.
 *
 * Lives here, next to the resolver, and not in the companion agent: the reader
 * and the writer of a thread's language must be one pair, in one module. While
 * this reader lived in the composer, only the composer's turns persisted a
 * locale — a turn owned by a skill committed nothing, and the thread drifted.
 */
export function readPersistedConversationLocale(
  tempMemory: TempMemory,
): string | null {
  return trimmedOrNull(tempMemory?.[CONVERSATION_LOCALE_KEY])
}

/**
 * An EXPLICIT request from the student to be answered in a given language.
 * This is the only input allowed to move a thread already anchored on a
 * locale — everything else would re-open the oscillation R3 forbids.
 */
export function readExplicitConversationLocale(
  tempMemory: TempMemory,
): string | null {
  return trimmedOrNull(tempMemory?.[CONVERSATION_LOCALE_EXPLICIT_KEY])
}

/**
 * Commit `locale` to the thread. THE writer — call it on every exit path.
 *
 * A path that resolves a locale and returns without writing it has, by
 * construction, re-enabled the oscillation: the next turn reads nothing, falls
 * through to the tenant default, and answers in another language.
 */
export function withPersistedConversationLocale(
  tempMemory: Record<string, unknown>,
  locale: string,
): Record<string, unknown> {
  return { ...tempMemory, [CONVERSATION_LOCALE_KEY]: locale }
}

/**
 * True when `locale` is a French locale.
 *
 * This is the SURFACE_FORM freeze gate of BELT_AUDIT.md, exposed once so no
 * module re-implements `startsWith('fr')` with its own normalization. A belt
 * whose mechanism is French morphology stays armed only behind this predicate.
 */
export function isFrenchLocale(locale: string | null | undefined): boolean {
  return normalizeLocale(String(locale ?? ""), FINAL_FALLBACK_LOCALE)
    .slice(0, 2)
    .toLowerCase() === "fr"
}

/** The locales this product actually ships copy for. */
export type LocalePackKey = "en" | "fr"

/**
 * The pack key for a locale. R7: THROWS for a language we have not delivered.
 *
 * The alternative — silently falling back to English — ships a French screen
 * with English sentences in it, discovered by a customer instead of by a test.
 * Adding a language means adding its packs and one entry here, in that order.
 */
export function localePackKey(locale: string): LocalePackKey {
  const prefix = normalizeLocale(locale, FINAL_FALLBACK_LOCALE)
    .slice(0, 2)
    .toLowerCase()
  if (prefix === "en" || prefix === "fr") return prefix
  throw new Error(
    `localePackKey: no locale pack delivered for "${locale}" (R7). ` +
      `Delivered: en, fr.`,
  )
}

// Human-readable language names for the prompt blocks. R7 does not apply here:
// an unknown prefix degrades to naming the BCP-47 tag itself, which is still an
// unambiguous instruction for the model. A throw would take down a turn over a
// missing display name, which is the opposite of what the belt is for.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  de: "German",
}

function languageNameFor(locale: string): { tag: string; language: string } {
  const tag = normalizeLocale(locale, FINAL_FALLBACK_LOCALE)
  const prefix = tag.slice(0, 2).toLowerCase()
  return { tag, language: LANGUAGE_NAMES[prefix] ?? tag }
}

/**
 * Build the RESPONSE_LANGUAGE block. Callers MUST inject it as the LAST
 * instruction of a generated prompt (recency wins with LLMs; this repo has
 * already paid for cross-turn language oscillation — CONTRACT R3).
 */
export function buildResponseLanguageBlock(locale: string): string {
  const { tag, language } = languageNameFor(locale)
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

/**
 * Build the CONTENT_LANGUAGE block — the RESPONSE_LANGUAGE of a generator whose
 * output is a JSON object rather than a message.
 *
 * Why a separate block: "write your entire visible reply in French" is a
 * contradictory instruction for a prompt that also demands a bare JSON object
 * and nothing else. It invites the model to wrap the JSON in French prose. This
 * block names the language of the TEXT INSIDE the object, and — just as
 * importantly — names the fields that must NOT move. Being last, it wins by
 * recency over any "copy this key character for character" rule stated earlier
 * in the prompt, so it has to restate the token fields itself.
 *
 * R7: an empty `translatableFields` is a caller bug, not a degenerate case. A
 * block that names nothing to translate spends tokens telling the model to
 * change nothing, and reads in review like the language axis is wired.
 */
export function buildContentLanguageBlock(
  locale: string,
  translatableFields: readonly string[],
  tokenFields: readonly string[],
): string {
  if (translatableFields.length === 0) {
    throw new Error(
      "buildContentLanguageBlock: translatableFields is empty (R7). " +
        "A content-language block that names no field is a no-op instruction.",
    )
  }
  const { tag, language } = languageNameFor(locale)
  const lines = [
    "CONTENT_LANGUAGE:",
    `Write the human-readable TEXT of your JSON in ${language} (${tag}).`,
    `This applies to these fields and to nothing else: ${
      translatableFields.join(", ")
    }.`,
    'Numbers and unit symbols are unchanged: "400 g", "2", "1.2 kg" (R4).',
  ]
  if (tokenFields.length > 0) {
    lines.push(
      "These are MACHINE TOKENS and stay exactly as specified above — never",
      `translate, never localize, never accent them (R1): ${
        tokenFields.join(", ")
      }.`,
    )
  }
  lines.push(
    "JSON keys are never translated. Your output is still a single JSON object",
    "and nothing else: no prose outside it, no markdown fences.",
  )
  return lines.join("\n")
}

/**
 * Append the CONTENT_LANGUAGE block as the LAST thing in a generator prompt.
 *
 * Same positional contract as `appendResponseLanguageBlock`, same reason: it
 * must survive — and follow — any future budget pass. Idempotent.
 */
export function appendContentLanguageBlock(
  prompt: string,
  locale: string,
  translatableFields: readonly string[],
  tokenFields: readonly string[],
): string {
  const body = String(prompt ?? "").trimEnd()
  const block = buildContentLanguageBlock(locale, translatableFields, tokenFields)
  if (body.endsWith(block)) return body
  return body ? `${body}\n\n${block}` : block
}
