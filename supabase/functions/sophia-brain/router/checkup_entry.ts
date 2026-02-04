export type CheckupEntryResolution =
  | { kind: "yes"; via: "dispatcher" | "deterministic" }
  | { kind: "no"; via: "dispatcher" | "deterministic" }

function normalizeLoose(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Resolve the user's answer to the checkup entry confirmation question.
 *
 * Important: we normalize user input (accents/punctuation) so patterns must match normalized text.
 * Example: "d'accord" becomes "d accord".
 *
 * Returns null when the answer is unclear (so we keep waiting).
 */
export function resolveCheckupEntryConfirmation(opts: {
  userMessage: string
  /** Signal from dispatcher (preferred when available) */
  wantsToCheckupFromDispatcher?: boolean | undefined
}): CheckupEntryResolution | null {
  const wants = opts.wantsToCheckupFromDispatcher
  if (wants !== undefined) {
    return { kind: wants ? "yes" : "no", via: "dispatcher" }
  }

  const s = normalizeLoose(opts.userMessage)
  if (!s) return null

  // Keep deterministic fallback strict to avoid false positives on long messages.
  const yes =
    /\b(oui|ok|yes|yep|yeah|d\s*accord|vas\s*y|go|on\s*y\s+va|carr[eé]ment|volontiers|bien\s+s[uû]r)\b/i.test(s) &&
    s.length <= 60
  const no =
    /\b(non|no|nope|pas\s+maintenant|plus\s+tard|laisse|une\s+autre\s+fois|on\s+verra|pas\s+aujourd\s*hui)\b/i.test(s) &&
    s.length <= 80

  if (yes) return { kind: "yes", via: "deterministic" }
  if (no) return { kind: "no", via: "deterministic" }
  return null
}


