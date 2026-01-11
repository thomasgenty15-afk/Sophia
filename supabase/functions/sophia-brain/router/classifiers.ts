import type { AgentMode } from "../state-manager.ts"

export function looksLikeAttrapeRevesActivation(m: string): boolean {
  const s = (m ?? "").toString().toLowerCase()
  if (!s) return false
  // "Attrape-Rêves Mental" can be written in many ways; keep the matcher permissive but specific.
  const mentions =
    /(attrape)\s*[-–—]?\s*(r[eê]ves?|r[êe]ve)\b/i.test(s) ||
    /\battrape[-\s]*r[eê]ves?\b/i.test(s)
  if (!mentions) return false
  // Activation intent: user explicitly asks to activate/do it now.
  return /\b(active|activez|activer|lance|lancer|on\s+y\s+va|vas[-\s]*y|go)\b/i.test(s)
}

export function looksLikeExplicitCheckupIntent(m: string): boolean {
  const s = (m ?? "").toString()
  // Explicit user intent to run a checkup/bilan
  return /\b(check(?:up)?|bilan)\b/i.test(s)
}

export function looksLikeActionProgress(m: string): boolean {
  const s = (m ?? "").toString()
  // Signals of progress/completion around actions/habits.
  // Keep conservative to avoid flipping into investigator on normal small talk.
  const progress =
    /\b(j['’]ai|j\s+ai|je\s+(?:n['’]?ai\s+pas|n['’]?ai|ai))\s+(?:fait|pas\s+fait|avanc[ée]e?|progress[ée]e?|termin[ée]e?|r[ée]ussi|tenu|coch[ée]e?|valid[ée]e?|compl[ée]t[ée]e?)\b/i
      .test(s) ||
    /\b(c['’]est\s+fait|c['’]est\s+bon|done)\b/i.test(s)
  const mentionsAction = /\b(action|objectif|habitude|t[âa]che|plan)\b/i.test(s)
  return progress && mentionsAction
}

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

export function isExplicitStopCheckup(message: string): boolean {
  const m = (message ?? "").toString().trim()
  if (!m) return false
  // Explicit stop / change topic signals (keep this conservative: only "clear stop" phrases).
  // Notes:
  // - We accept both generic stops ("stop", "arrête") and stop+topic ("stop le bilan", "arrête le check").
  // - We avoid overly broad tokens like "plus tard" / "pas maintenant" which are often deferrals, not cancellations.
  return /\b(?:stop|pause|arr[êe]te|arr[êe]tons|annule|annulons|on\s+(?:arr[êe]te|arr[êe]tons|stop|annule|annulons)|je\s+veux\s+(?:arr[êe]ter|stopper)|on\s+peut\s+arr[êe]ter|change(?:r)?\s+de\s+sujet|on\s+change\s+de\s+sujet|parl(?:er)?\s+d['’]autre\s+chose|on\s+parle\s+d['’]autre\s+chose|pas\s+de\s+(?:bilan|check|checkup)|stop\s+(?:le\s+)?(?:bilan|check|checkup)|arr[êe]te\s+(?:le\s+)?(?:bilan|check|checkup)|stop\s+this|stop\s+it|switch\s+topic)\b/i
    .test(m)
}

export function shouldBypassCheckupLockForDeepWork(message: string, targetMode: AgentMode): boolean {
  if (targetMode !== "architect") return false
  const s = (message ?? "").toString().toLowerCase()
  // When the user brings a clear planning/organization pain during bilan,
  // we allow Architect to answer (otherwise the hard guard forces Investigator and feels robotic).
  return /\b(planning|agenda|organisation|organisatio|priorit[ée]s?|ing[ée]rable|d[ée]bord[ée]|trop\s+de\s+trucs|overbook|surcharg[ée]|charge\s+mentale)\b/i
    .test(s)
}

export function looksLikeExplicitResumeCheckupIntent(m: string): boolean {
  const s = (m ?? "").toString().toLowerCase().trim()
  if (!s) return false
  return (
    /\b(finir|termine(?:r)?|reprendre|reprenons|continuer|continue|on\s+peut\s+finir|on\s+peut\s+terminer)\b/i.test(s) &&
    /\b(bilan|check(?:up)?|check)\b/i.test(s)
  )
}

export function looksLikeMotivationScoreAnswer(message: string): boolean {
  const s = (message ?? "").toString().trim()
  // Accept "8", "8/10", "8 / 10", "10", "10/10"
  return /^(?:10|[0-9])(?:\s*\/\s*10)?$/.test(s)
}

export function lastAssistantAskedForStepConfirmation(lastAssistantMessage: string): boolean {
  const s = (lastAssistantMessage ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // Keep conservative: only direct "is it done?" patterns.
  return (
    /\b(c['’]est\s*fai?t|c['’]est\s*bon|c['’]est\s*ok)\s*\?/i.test(s) ||
    /\btu\s+l['’]as\s+fait\s*\?/i.test(s) ||
    /\btu\s+l['’]as\s+pos[ée]\s*\?/i.test(s) ||
    /\b(?:est[-\s]*ce\s+que\s+)?tu\s+peux\b.*\?/i.test(s) ||
    /\best[-\s]*ce\s+que\s+tu\s+peux\b.*\?/i.test(s) ||
    /\bdis[-\s]*moi\s+quand\s+c['’]est\s+fait\b/i.test(s) ||
    /\btu\s+as\s+pu\b.*\?/i.test(s) ||
    /\bok\s*\?\s*$/i.test(s)
  )
}

export function looksLikeUserConfirmsStep(message: string): boolean {
  const s = (message ?? "").toString().trim().toLowerCase()
  if (!s) return false
  // Common short confirmations on WhatsApp.
  return (
    /^(?:oui|ok|okay|d['’]accord|ça\s+marche|ca\s+marche|c['’]est\s+bon|c['’]est\s+fait|fait|done)\s*!*\.?$/.test(s) ||
    /\b(oui|ok|okay|d['’]accord|ça\s+marche|ca\s+marche)\b.*\b(je\s+le\s+fais|je\s+fais\s+ça|je\s+vais\s+le\s+faire|je\s+m['’]en\s+occupe|c['’]est\s+bon|c['’]est\s+fait)\b/i.test(s) ||
    /\b(oui|ok|d['’]accord)\b.*\b(c['’]est\s+bon|c['’]est\s+fait)\b/i.test(s)
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

export function looksLikeHowToExerciseQuestion(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase()
  if (!s) return false
  // "comment je fais", "comment je m'y prends", etc., about concrete exercises
  if (!/\b(comment|comment\s+faire|comment\s+je|je\s+m['’]y\s+prends|mode\s+d['’]emploi|proc[ée]dure)\b/i.test(s)) return false
  return /\b(respir|cycle|journal|carnet|exercice|rituel|micro[-\s]?pause)\b/i.test(s)
}

export function looksLikeWorkPressureVenting(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase()
  if (!s) return false
  // Typical WhatsApp venting language: not necessarily an emotional emergency.
  if (!/\b(boulot|travail|job|boss|client|réunion|reunion|deadline)\b/i.test(s)) return false
  if (!/\b(pression|stress|sous\s+pression|débord[ée]|deborde|cerveau\s+en\s+vrac|surcharg[ée]|charge\s+mentale|j'en\s+peux\s+plus)\b/i.test(s)) return false
  // Do NOT match explicit panic/crisis keywords (handled elsewhere).
  if (/\b(panique|crise|attaque|je\s+craque|d[ée]tresse|urgence)\b/i.test(s)) return false
  return true
}

export function looksLikeUserClaimsPlanIsDone(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // Common phrases when the user thinks onboarding is done, but we still don't see a plan.
  return (
    /\bc['’]est\s*bon\b/i.test(s) ||
    /\bj['’]ai\s+(?:fini|termin[ée]|valid[ée]|cliqu[ée]|soumis|envoy[ée])\b/i.test(s) ||
    /\bje\s+ne\s+vois\s+rien\b/i.test(s) ||
    /\b(le\s+site|l['’]app)\s+(?:bug|bugue|bloque|ne\s+marche\s+pas)\b/i.test(s) ||
    /\bje\s+veux\s+juste\s+commencer\b/i.test(s)
  )
}

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


