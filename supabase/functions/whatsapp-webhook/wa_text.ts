function normalizeTextForStop(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    // Normalize apostrophes/accents for common French variants
    .replace(/[’']/g, "'")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

export function isStopKeyword(raw: string, interactiveId?: string | null): boolean {
  if ((interactiveId ?? "").trim().toUpperCase() === "STOP") return true
  const t = normalizeTextForStop(raw)
  // Common opt-out keywords (Meta-style + FR)
  return /^(stop|unsubscribe|unsub|opt\s*-?\s*out|desinscrire|desinscription)\b/.test(t)
}

export function isYesConfirm(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  return /^(oui|yes|ok|d['’]accord|je\s*suis\s*sur|je\s*suis\s*sure|je\s*confirme|confirm[eé])\b/.test(t)
}

export function isDonePhrase(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  return /^(c['’]est\s*bon|cest\s*bon|ok|fait|done|termin[eé]|j['’]ai\s*fini|j ai fini)\b/.test(t)
}

export function extractAfterDonePhrase(raw: string): string {
  const s = (raw ?? "").toString().trim()
  if (!s) return ""
  // Remove the leading "done" phrase (in various FR forms) and common separators.
  const cleaned = s.replace(
    /^(?:c['’]est\s*bon|cest\s*bon|ok|fait|done|termin[eé]|j['’]ai\s*fini|j ai fini)\b\s*[:\-–—,;.!?\n]*\s*/i,
    "",
  )
  return cleaned.trim()
}

export function parseMotivationScore(raw: string): number | null {
  const t = (raw ?? "").trim()
  const m = t.match(/\b(10|[0-9])\b/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
}

export function stripFirstMotivationScore(raw: string): { score: number | null; rest: string } {
  const t = (raw ?? "").toString()
  const m = t.match(/\b(10|[0-9])\b/)
  if (!m || typeof m.index !== "number") return { score: null, rest: t.trim() }
  const n = Number.parseInt(m[1], 10)
  const score = Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
  const rest = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).trim()
  return { score, rest }
}

export function isHelpOrAdviceRequest(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  // "conseil", "aide", "comment", "pour réussir", etc.
  return /\b(conseil|aide|aider|help|astuce|tips|comment|pourquoi|reussir|reussite|plan|objectif)\b/.test(t)
}

export function isConfusionOrRepair(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  // User indicates they didn't understand / wants clarification
  return /\b(pardon|hein|quoi|comment|j'ai pas compris|je ne comprends pas|comprends pas|repete|repetes|hello)\b/.test(t) || raw.includes("?")
}



