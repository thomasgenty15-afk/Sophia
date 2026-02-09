function normalizeConsentText(message: string): string {
  return String(message ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function looksLikeElongatedOui(raw: string): boolean {
  const compact = raw.replace(/\s+/g, "")
  // Handles forms like "ouiiii", "ouiiu", "ouiuuu", "ouiiiiii"
  return /^ou+i+u*$/.test(compact) || /^ou+i+$/.test(compact)
}

export function looksLikeYesToProceed(message: string): boolean {
  const t = normalizeConsentText(message)
  if (!t) return false
  if (looksLikeElongatedOui(t)) return true
  return /^(oui|ouais|ok|d accord|vas y|go|yes|ca marche|c est bon|bien sur)\b/i.test(t) ||
    /\b(oui|ouais|ok|vas y|tu peux|d accord|go|yes|bien sur)\b/i.test(t)
}

export function looksLikeNoToProceed(message: string): boolean {
  const t = normalizeConsentText(message)
  if (!t) return false
  const compact = t.replace(/\s+/g, "")
  if (/^no+n+$/.test(compact) || /^na+n+$/.test(compact)) return true
  return /^(non|nope|nan|pas maintenant|pas besoin|laisse|laisse tomber|plus tard)\b/i.test(t) ||
    /\b(non|pas maintenant|pas besoin|laisse tomber|plus tard)\b/i.test(t)
}

export function looksLikeExplicitTrackProgressRequest(message: string): boolean {
  const t = String(message ?? "").toLowerCase()
  const hasVerb =
    /\b(note|noter|marque|marquer|enregistre|enregistrer|mets(-|\s)?le|met[-\s]?le|compte|comptabilise)\b/i.test(t)
  const hasPermission =
    /\b(tu\s+peux|peux[-\s]?tu|stp|s['’]il\s+te\s+pla[iî]t|merci)\b/i.test(t)
  const hasAsStatus =
    /\b(comme\s+(?:fait|pas\s+fait|rat[ée]|compl[eé]t[ée]))\b/i.test(t) ||
    /\b(pour\s+aujourd['’]hui|aujourd['’]hui|hier)\b/i.test(t)
  return (hasVerb && hasPermission) || (hasVerb && hasAsStatus)
}

export function looksLikeExplicitCreateActionRequest(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  const hasVerb = /\b(ajoute|ajouter|cr[ée]e|cr[ée]er|mets|mettre)\b/.test(s)
  const hasPlan = /\b(mon plan|dans mon plan|plan)\b/.test(s)
  const hasQuotedTitle = /(\"[^\"]{2,80}\"|«[^»]{2,80}»|“[^”]{2,80}”)/.test(message ?? "")
  const hasFreq = /\bfr[ée]quence\b/.test(s) || /\b\d+\s*(?:fois|x)\s*par\s*semaine\b/.test(s)
  return hasVerb && (hasPlan || hasQuotedTitle) && (hasQuotedTitle || hasFreq)
}

export function looksLikeUserAsksToAddToPlanLoosely(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  const hasVerb = /\b(ajoute|ajouter|cr[ée]e|cr[ée]er|mets|mettre)\b/.test(s)
  const hasPlan = /\b(mon plan|dans mon plan|au plan|sur mon plan)\b/.test(s)
  return hasVerb && hasPlan
}

export function looksLikeExplicitUpdateActionRequest(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  const hasRequest =
    /\b(tu\s+peux|peux[-\s]?tu|est-ce\s+qu['’]?on\s+peut|on\s+peut|j['’]?aimerais\s+que\s+tu|je\s+veux\s+que\s+tu|mets|met|passe|change|modifie|ajuste|renomme|enl[eè]ve|retire|supprime)\b/i
      .test(message ?? "")
  if (!hasRequest) return false
  const mentionsHabit =
    /\b(action|habitude|plan|lecture)\b/i.test(message ?? "") ||
    /(?:\"|«|“)[^\"»”]{2,120}(?:\"|»|”)/.test(message ?? "")
  const mentionsStructure =
    /\b(\d{1,2})\s*(fois|x)\s*(?:par\s*semaine|\/\s*semaine)\b/i.test(message ?? "") ||
    /\b(lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?|mon|tue|wed|thu|fri|sat|sun)\b/i.test(message ?? "")
  const mentionsRenameOrDesc =
    /\b(intitul[ée]?|titre|nom|renomm|libell[ée]?|description)\b/i.test(message ?? "")
  return mentionsHabit && (mentionsStructure || mentionsRenameOrDesc)
}

export function looksLikeExploringActionIdea(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  const hesitates =
    /\b(je pense [àa]|j'y pense|j'h[ée]site|pas s[ûu]r|je sais pas|je ne sais pas|peut[-\s]?être|ça vaut le coup|tu en penses quoi|t'en penses quoi)\b/.test(s) ||
    /\b(j'aimerais|j'ai envie)\b/.test(s)
  const isQuestion = /\?\s*$/.test(s) || /\b(quoi|comment|tu en penses quoi)\b/.test(s)
  const explicitAdd = looksLikeExplicitCreateActionRequest(message) || looksLikeUserAsksToAddToPlanLoosely(message)
  return (hesitates || isQuestion) && !explicitAdd
}

export function looksLikeExplicitActivateActionRequest(message: string): boolean {
  const t = String(message ?? "").toLowerCase()
  const hasVerb =
    /\b(active|activer|active[-\s]?la|active[-\s]?le|je\s+veux\s+activer|tu\s+peux\s+activer|on\s+peut\s+activer)\b/i.test(t) ||
    /\b(lance|lancer|d[ée]marre|d[ée]marrer|mets(-|\s)?la\s+en\s+route|on\s+peut\s+la\s+lancer|vas[-\s]?y\s+lance)\b/i.test(t)
  const isHypothetical =
    /\b(si\s+(?:on|je)\s+l['’]?active|si\s+(?:on|je)\s+l['’]?activer|ça\s+change\s+quoi\s+si|qu['’]est-ce\s+que\s+ça\s+implique\s+si)\b/i
      .test(t)
  const hasImperative =
    /\b(vas[-\s]?y|allons[-\s]?y|on\s+y\s+va|tu\s+peux|peux[-\s]?tu|j(?:e|')\s+veux|j(?:e|')\s+aimerais|maintenant|stp|s['’]il\s+te\s+pla[iî]t)\b/i
      .test(t)
  const isJustClarifyingPending =
    /\b(pending|plus\s+tard|en\s+attente)\b/i.test(t) && /\b(ça\s+veut\s+dire|c['’]est\s+quoi|comment)\b/i.test(t) && !/\b(vas[-\s]?y|tu\s+peux|active)\b/i.test(t)
  if (isHypothetical && !hasImperative) return false
  return hasVerb && !isJustClarifyingPending
}

export function parseQuotedActionTitle(message: string): string | null {
  const s = String(message ?? "")
  const m = s.match(/[""«]\s*([^""»]{2,80})\s*[""»]/)
  const title = String(m?.[1] ?? "").trim()
  return title ? title : null
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE ACTION FLOW v2 - Modification detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect if user wants to modify proposed action parameters.
 * Used in the create_action_flow v2 when user responds to a preview.
 * 
 * Examples:
 * - "oui mais 3 fois" → true
 * - "non, plutôt le matin" → true
 * - "change la fréquence" → true
 * - "non" → false (rejection, not modification)
 * - "oui" → false (acceptance, not modification)
 */
export function looksLikeModificationRequest(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  // "oui mais..." or "ok mais..." patterns
  const yesBut = /^(oui|ok|d['']accord|ça\s+marche)\s+(mais|sauf|par\s+contre)\b/i.test(s)
  if (yesBut) return true

  // "non, plutôt..." or "non, je préfère..." patterns
  const noPrefer = /^non[\s,]+(plut[oô]t|je\s+pr[ée]f[èe]re|je\s+voudrais|mets|change)/i.test(s)
  if (noPrefer) return true

  // Explicit modification verbs with parameter context
  const hasModVerb = /\b(change|modifie|ajuste|mets|met|passe|préfère|voudrais|plutôt)\b/i.test(s)
  const hasParamContext = /\b(fréquence|fois|jour|jours|matin|soir|nuit|après[-\s]?midi|semaine|titre|nom|description)\b/i.test(s)
  if (hasModVerb && hasParamContext) return true

  // Specific frequency change patterns
  if (/\b(\d+)\s*(fois|x)\s*(par\s+semaine|\/\s*semaine)?\b/i.test(s)) {
    // Contains frequency, but check if it's in context of modification
    const notJustNumber = s.length > 15 || /\b(plutôt|préfère|change|mets|met)\b/i.test(s)
    if (notJustNumber) return true
  }

  // Day preference patterns
  if (/\b(plut[oô]t\s+le|pas\s+le|enl[eè]ve|retire|ajoute)\s+(lun|mar|mer|jeu|ven|sam|dim)/i.test(s)) {
    return true
  }

  // Time of day preference
  if (/\b(plut[oô]t|pas|préfère)\s+(le\s+)?(matin|soir|nuit|après[-\s]?midi)/i.test(s)) {
    return true
  }

  return false
}

/**
 * Extract modification information from user message.
 * Returns the field being modified and the new value if detectable.
 */
export function extractModificationInfo(message: string): {
  field?: "frequency" | "time_of_day" | "days" | "title" | "description"
  value?: string | number | string[]
  raw_modification?: string
} | null {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return null

  // Frequency extraction: "3 fois par semaine", "plutôt 2x"
  const freqMatch = s.match(/(\d+)\s*(?:fois|x)\s*(?:par\s*semaine|\/\s*semaine)?/i)
  if (freqMatch) {
    const freq = Math.max(1, Math.min(7, parseInt(freqMatch[1], 10)))
    return { field: "frequency", value: freq, raw_modification: freqMatch[0] }
  }

  // Time of day extraction
  const todPatterns: Record<string, string> = {
    matin: "morning",
    soir: "evening",
    nuit: "night",
    "après-midi": "afternoon",
    "apres-midi": "afternoon",
    "après midi": "afternoon",
    "apres midi": "afternoon",
  }
  for (const [fr, en] of Object.entries(todPatterns)) {
    if (s.includes(fr)) {
      return { field: "time_of_day", value: en, raw_modification: fr }
    }
  }

  // Days extraction
  const dayMap: Record<string, string> = {
    lundi: "mon", lun: "mon",
    mardi: "tue", mar: "tue",
    mercredi: "wed", mer: "wed",
    jeudi: "thu", jeu: "thu",
    vendredi: "fri", ven: "fri",
    samedi: "sat", sam: "sat",
    dimanche: "sun", dim: "sun",
  }
  const mentionedDays: string[] = []
  for (const [fr, en] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${fr}\\b`, "i").test(s) && !mentionedDays.includes(en)) {
      mentionedDays.push(en)
    }
  }
  if (mentionedDays.length > 0) {
    return { field: "days", value: mentionedDays, raw_modification: mentionedDays.join(", ") }
  }

  // If we detect modification intent but can't extract specific info
  if (looksLikeModificationRequest(message)) {
    return { raw_modification: s.slice(0, 100) }
  }

  return null
}

/**
 * Detect if user is abandoning the action creation flow.
 * Stronger signal than just "no" - explicit rejection.
 */
export function looksLikeAbandonActionCreation(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  // Explicit abandonment patterns
  const abandonPatterns = [
    /^(non|nan|nope)\s*[.!]?\s*$/i,  // Just "non"
    /\b(laisse\s+tomber|oublie|on\s+oublie|pas\s+maintenant|plus\s+tard|annule)\b/i,
    /\b(je\s+veux\s+pas|je\s+ne\s+veux\s+pas|j'en\s+veux\s+pas)\b/i,
    /\b(finalement\s+non|en\s+fait\s+non|non\s+merci)\b/i,
  ]

  return abandonPatterns.some((p) => p.test(s))
}

/**
 * Detect positive response strength for action creation.
 * Returns "strong", "weak", or null.
 */
export function detectPositiveResponseStrength(message: string): "strong" | "weak" | null {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return null

  // Strong positive: enthusiastic, clear yes
  const strongPatterns = [
    /^(oui|yes|ok|d['']accord|parfait|super|g[ée]nial|top|vas[-\s]?y|go)\s*[!]?\s*$/i,
    /\b(c['']est\s+parfait|ça\s+me\s+va|exactement|nickel|impec)\b/i,
  ]
  if (strongPatterns.some((p) => p.test(s))) return "strong"

  // Weak positive: acceptance with hesitation or condition
  const weakPatterns = [
    /^(oui|ok)\s+(mais|sauf|par\s+contre)/i,
    /\b(pourquoi\s+pas|ok\s+je\s+suppose|si\s+tu\s+veux|allez)\b/i,
    /\b(mouais|ouais|bof\s+ok)\b/i,
  ]
  if (weakPatterns.some((p) => p.test(s))) return "weak"

  // General positive without enthusiasm
  if (looksLikeYesToProceed(message) && !looksLikeModificationRequest(message)) {
    return "weak"
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE ACTION FLOW v2 - Intent detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect if user explicitly wants to update an existing action.
 * More specific than looksLikeExplicitUpdateActionRequest - focuses on intent rather than structure.
 * 
 * Examples:
 * - "passe lecture à 5 fois" → true
 * - "mets sport à 3x/semaine" → true
 * - "change méditation le matin" → true
 */
export function looksLikeExplicitUpdateIntent(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  // Pattern: "passe X à Y" or "mets X à Y"
  const passePattern = /\b(passe|mets|change|modifie|ajuste)\s+[\w\s]{2,30}\s+(à|a|en)\s+\d/i.test(s)
  if (passePattern) return true

  // Pattern: action name + frequency change
  const freqChange = /\b(fois|x)\s*(par\s+semaine|\/\s*semaine)?\b/i.test(s) &&
    /\b(passe|mets|change|modifie|lecture|sport|méditation|habitude)\b/i.test(s)
  if (freqChange) return true

  // Pattern: explicit day change
  const dayChange = /\b(enl[eè]ve|retire|ajoute|supprime)\s+.{0,20}(lun|mar|mer|jeu|ven|sam|dim)/i.test(s)
  if (dayChange) return true

  // Pattern: time of day change
  const timeChange = /\b(mets|passe|change).{0,30}(matin|soir|nuit|après[-\s]?midi)/i.test(s)
  if (timeChange) return true

  return false
}

/**
 * Extract the target action name from an update request.
 * 
 * Examples:
 * - "passe lecture à 5 fois" → "lecture"
 * - "mets sport à 3x/semaine" → "sport"
 */
export function extractUpdateTargetHint(message: string): string | null {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return null

  // Pattern: "passe/mets/change [action] à/en..."
  const match = s.match(/\b(?:passe|mets|change|modifie|ajuste)\s+([\w\s]{2,30}?)\s+(?:à|a|en)\s/i)
  if (match && match[1]) {
    const target = match[1].trim()
    // Filter out common noise words
    const cleaned = target.replace(/\b(la|le|les|l'|ma|mon|mes|une?)\b/gi, "").trim()
    if (cleaned.length >= 2) return cleaned
  }

  // Pattern: "[action] à X fois"
  const match2 = s.match(/([\w]+)\s+(?:à|a)\s+\d+\s*(?:fois|x)/i)
  if (match2 && match2[1]) {
    const target = match2[1].trim()
    if (target.length >= 2 && !/^(passe|mets|change)$/i.test(target)) {
      return target
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// BREAKDOWN ACTION FLOW DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detects if user explicitly wants to break down / simplify an action.
 * 
 * Examples:
 * - "je bloque sur le sport"
 * - "j'arrive pas à méditer"
 * - "micro-étape pour la lecture"
 * - "découpe l'action sport"
 */
export function looksLikeExplicitDeleteActionRequest(message: string): boolean {
  const t = String(message ?? "").toLowerCase()
  const hasVerb =
    /\b(supprime|supprimer|retire|retirer|enl[eè]ve|enlever|arr[eê]te|arr[eê]ter|vire|virer|supprime[-\s]?la|retire[-\s]?la|enl[eè]ve[-\s]?la)\b/i.test(t) ||
    /\b(je\s+veux\s+(?:supprimer|retirer|enlever|arr[eê]ter)|tu\s+peux\s+(?:supprimer|retirer|enlever)|on\s+peut\s+(?:supprimer|retirer|enlever))\b/i.test(t)
  const hasActionContext =
    /\b(action|habitude|plan|mon\s+plan)\b/i.test(t) ||
    /(?:\"|«|")[^\"»"]{2,120}(?:\"|»|")/.test(message ?? "")
  const hasImperative =
    /\b(vas[-\s]?y|stp|s['']il\s+te\s+pla[iî]t|maintenant|tout\s+de\s+suite)\b/i.test(t)
  return hasVerb && (hasActionContext || hasImperative)
}

export function looksLikeExplicitDeactivateActionRequest(message: string): boolean {
  const t = String(message ?? "").toLowerCase()
  const hasVerb =
    /\b(d[ée]sactive|d[ée]sactiver|mets?\s+en\s+pause|mettre\s+en\s+pause|pause|stoppe|stopper|suspends?|suspendre)\b/i.test(t) ||
    /\b(je\s+veux\s+(?:d[ée]sactiver|mettre\s+en\s+pause|suspendre)|tu\s+peux\s+(?:d[ée]sactiver|mettre\s+en\s+pause)|on\s+peut\s+(?:d[ée]sactiver|mettre\s+en\s+pause))\b/i.test(t) ||
    /\b(arr[eê]te\s+temporairement|arr[eê]ter\s+temporairement|pause\s+(?:le|la|l['']|sur))\b/i.test(t)
  const hasActionContext =
    /\b(action|habitude|plan|mon\s+plan)\b/i.test(t) ||
    /(?:\"|«|")[^\"»"]{2,120}(?:\"|»|")/.test(message ?? "")
  const hasImperative =
    /\b(vas[-\s]?y|stp|s['']il\s+te\s+pla[iî]t|maintenant|tout\s+de\s+suite)\b/i.test(t)
  return hasVerb && (hasActionContext || hasImperative)
}

export function looksLikeExplicitBreakdownIntent(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  // Explicit breakdown requests
  const hasBreakdownVerb = /\b(d[ée]coupe|d[ée]composer|simplifi|micro[-\s]?[ée]tape|d[ée]bloqu)\w*\b/i.test(s)
  if (hasBreakdownVerb) return true

  // Blocking/stuck expressions
  const isBlocked = /\b(je\s+bloque|j['']?y\s+arrive\s+pas|j['']?arrive\s+pas|c['']?est\s+trop\s+dur|insurmontable|je\s+repousse|je\s+procrastine)\b/i.test(s)
  const hasActionContext = /\b(action|habitude|sport|lecture|m[ée]ditation|exercice|faire|commencer)\b/i.test(s)
  if (isBlocked && hasActionContext) return true

  // "too hard" with action context
  const isTooHard = /\b(trop\s+(?:dur|difficile|lourd|compliqu[ée])|pas\s+(?:capable|possible))\b/i.test(s)
  if (isTooHard && hasActionContext) return true

  // Request for simpler version
  const wantsSimpler = /\b(plus\s+simple|plus\s+petit|encore\s+plus\s+facile|version\s+(?:plus\s+)?facile|petit\s+pas)\b/i.test(s)
  if (wantsSimpler) return true

  return false
}

/**
 * Extract the target action hint from a breakdown request.
 * 
 * Examples:
 * - "je bloque sur le sport" → "sport"
 * - "micro-étape pour la lecture" → "lecture"
 * - "j'arrive pas à méditer" → "méditer"
 */
export function extractBreakdownTargetHint(message: string): string | null {
  const s = String(message ?? "").trim()
  if (!s) return null

  // Try to extract quoted title first
  const quotedMatch = s.match(/[""«]([^""»]{2,80})[""»]/i)
  if (quotedMatch?.[1]) return quotedMatch[1].trim()

  // Pattern: "je bloque sur [action]"
  const blockerMatch = s.match(/\b(?:bloque|coince)\s+sur\s+(?:l['']?|le\s+|la\s+|mon\s+|ma\s+)?([^\s,.!?]{2,30})/i)
  if (blockerMatch?.[1]) {
    const target = blockerMatch[1].trim().replace(/^(la|le|l'|mon|ma)$/i, "")
    if (target.length >= 2) return target
  }

  // Pattern: "j'arrive pas à [action]"
  const arriveMatch = s.match(/\b(?:j['']?y?\s*arrive\s+pas\s+[àa]|j['']?arrive\s+pas\s+[àa])\s+(?:faire\s+)?([^\s,.!?]{2,30})/i)
  if (arriveMatch?.[1]) {
    const target = arriveMatch[1].trim()
    if (target.length >= 2) return target
  }

  // Pattern: "micro-étape pour [action]"
  const microMatch = s.match(/\b(?:micro[-\s]?[ée]tape|d[ée]coupe|simplifie)\s+(?:pour\s+)?(?:l['']?|le\s+|la\s+)?([^\s,.!?]{2,30})/i)
  if (microMatch?.[1]) {
    const target = microMatch[1].trim()
    if (target.length >= 2) return target
  }

  // Pattern: "[action] c'est trop dur"
  const hardMatch = s.match(/\b([\w]+)\s+(?:c['']?est\s+trop\s+(?:dur|difficile)|je\s+(?:bloque|procrastine))/i)
  if (hardMatch?.[1]) {
    const target = hardMatch[1].trim()
    if (target.length >= 2 && !/^(ça|c'|le|la)$/i.test(target)) return target
  }

  return null
}

/**
 * Extract the blocker description from the message (if any).
 * 
 * Examples:
 * - "je bloque sur le sport, trop fatigué le soir" → "trop fatigué le soir"
 * - "j'arrive pas à méditer parce que j'ai pas le temps" → "j'ai pas le temps"
 */
export function extractBlockerHint(message: string): string | null {
  const s = String(message ?? "").trim()
  if (!s) return null

  // Pattern: "parce que / car / vu que [blocker]"
  const becauseMatch = s.match(/\b(?:parce\s+que?|car|vu\s+que?|[àa]\s+cause\s+de?)\s+(.{5,100})/i)
  if (becauseMatch?.[1]) {
    return becauseMatch[1].trim().slice(0, 200)
  }

  // Pattern: ", [blocker]" after the main statement
  const commaMatch = s.match(/(?:bloque|coince|arrive\s+pas)[^,]{0,40},\s+(.{5,100})$/i)
  if (commaMatch?.[1]) {
    return commaMatch[1].trim().slice(0, 200)
  }

  return null
}
