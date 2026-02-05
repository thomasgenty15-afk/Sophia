import type { AgentMode } from "../state-manager.ts"

// NOTE: Most semantic trigger functions have been migrated to dispatcher signals.
// This file now only contains helper functions that check assistant context or are internal helpers.

export function looksLikeDailyBilanAnswer(userMsg: string, lastAssistantMsg: string): boolean {
  const last = (lastAssistantMsg ?? "").toString().toLowerCase()
  const u = (userMsg ?? "").toString().trim()
  if (!u) return false
  // Our daily bilan prompt includes these two anchors; if the user replies right after it,
  // we treat it as a checkup kickoff so the Investigator covers vitals + actions + frameworks.
  const looksLikePrompt =
    last.includes("un truc dont tu es fier") &&
    last.includes("un truc à ajuster")
  return looksLikePrompt
}

export function shouldBypassCheckupLockForDeepWork(message: string, targetMode: AgentMode): boolean {
  if (targetMode !== "architect") return false
  const s = (message ?? "").toString().toLowerCase()
  // When the user brings a clear planning/organization pain during bilan,
  // we allow Architect to answer (otherwise the hard guard forces Investigator and feels robotic).
  return /\b(planning|agenda|organisation|organisatio|priorit[ée]s?|ing[ée]rable|d[ée]bord[ée]|trop\s+de\s+trucs|overbook|surcharg[ée]|charge\s+mentale)\b/i
    .test(s)
}

export function lastAssistantAskedForStepConfirmation(lastAssistantMessage: string): boolean {
  const s = (lastAssistantMessage ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // Keep conservative: only direct "is it done?" patterns.
  return (
    /\b(c['']est\s*fai?t|c['']est\s*bon|c['']est\s*ok)\s*\?/i.test(s) ||
    /\btu\s+l['']as\s+fait\s*\?/i.test(s) ||
    /\btu\s+l['']as\s+pos[ée]\s*\?/i.test(s) ||
    /\b(?:est[-\s]*ce\s+que\s+)?tu\s+peux\b.*\?/i.test(s) ||
    /\best[-\s]*ce\s+que\s+tu\s+peux\b.*\?/i.test(s) ||
    /\bdis[-\s]*moi\s+quand\s+c['']est\s+fait\b/i.test(s) ||
    /\btu\s+as\s+pu\b.*\?/i.test(s) ||
    /\bok\s*\?\s*$/i.test(s)
  )
}

export function lastAssistantAskedForMotivation(lastAssistantMessage: string): boolean {
  const s = (lastAssistantMessage ?? "").toString().toLowerCase()
  return (
    s.includes("niveau de motivation") ||
    s.includes("sur une échelle") ||
    s.includes("sur une echelle") ||
    s.includes("échelle de 1 à 10") ||
    s.includes("echelle de 1 a 10")
  )
}

// NOTE: looksLikeUserClaimsPlanIsDone replaced by onboarding_status signal from dispatcher

export function countNoPlanBlockerMentions(history: any[]): number {
  const recent = (history ?? []).filter((m: any) => m?.role === "assistant").slice(-12)
  let n = 0
  for (const m of recent) {
    const t = String(m?.content ?? "").toLowerCase()
    // Canonical "no plan detected" patterns (architect + companion variants).
    if (
      /je\s+ne\s+vois\s+pas\s+(?:encore\s+)?(?:ton\s+)?plan/.test(t) ||
      /ne\s+d[ée]tecte\s+pas\s+(?:encore\s+)?(?:ton\s+)?plan/.test(t) ||
      /aucun\s+plan\s+actif/.test(t) ||
      /plan\s+.*pas\s+actif/.test(t)
    ) {
      n += 1
    }
  }
  return n
}
