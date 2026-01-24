import { generateWithGemini } from "../../_shared/gemini.ts"
import type { 
  EnrichedDeferredTopic, 
  DeepReasonsPattern,
  DeepReasonsDeferredContext 
} from "../agents/architect/deep_reasons_types.ts"
import { 
  createDeepReasonsDeferredTopic,
  isDeepReasonsDeferredTopic 
} from "../agents/architect/deep_reasons_types.ts"

// Re-export types for convenience
export type { EnrichedDeferredTopic, DeepReasonsPattern, DeepReasonsDeferredContext }
export { createDeepReasonsDeferredTopic, isDeepReasonsDeferredTopic }

/**
 * VALIDATE + FORMALIZE a potential deferred topic using AI.
 * Called at STORAGE TIME (not at reprise) to ensure we only store clean, valid topics.
 * 
 * Returns:
 * - { isValid: true, formalizedTopic: "la situation avec ton boss" } → Store this
 * - { isValid: false } → Don't store, it's noise
 */
export async function validateAndFormalizeDeferredTopic(opts: {
  rawMessage: string
  extractedTopic?: string
  source: "user_digression" | "user_explicit_defer" | "assistant_defer"
}): Promise<{ isValid: boolean; formalizedTopic?: string }> {
  const raw = String(opts.rawMessage ?? "").trim()
  const extracted = String(opts.extractedTopic ?? "").trim()
  
  if (!raw && !extracted) return { isValid: false }
  
  // Quick rule-based rejection for obvious noise
  const combined = `${raw} ${extracted}`.toLowerCase()
  if (/^(?:ok|oui|non|merci|euh|hm+|bof|ah|oh)$/i.test(combined.trim())) {
    return { isValid: false }
  }
  
  try {
    const prompt = `Tu es un assistant qui analyse si un message contient un VRAI sujet à reprendre plus tard.

SOURCE: ${opts.source === "user_digression" ? "L'utilisateur a fait une digression pendant le bilan" : opts.source === "user_explicit_defer" ? "L'utilisateur a dit 'on en reparle après'" : "Sophia a dit 'on en reparlera après le bilan'"}
MESSAGE COMPLET: "${raw.slice(0, 400)}"
SUJET EXTRAIT (règles): "${extracted.slice(0, 200)}"

TÂCHE: Analyse et réponds en JSON strict.

RÈGLES DE VALIDATION:
- Un VRAI sujet = quelque chose de concret dont on peut discuter (boss, travail, stress, organisation, famille, projet, etc.)
- PAS un vrai sujet = expressions vagues, incertitudes, fillers ("je sais pas", "peut-être", "bof", "euh")
- Si le message mentionne un problème réel (boss stressant, organisation, anxiété, etc.), c'est VALIDE même si entouré de "je sais pas trop"

RÈGLES DE FORMULATION (si valide):
- Utilise "tu/ton/ta" (pas "je/mon/ma")  
- Max 10 mots, naturel et clair
- Exemples:
  - "j'ai mon boss qui me stresse, je sais pas trop" → "la situation avec ton boss"
  - "mon organisation au travail" → "ton organisation au travail"
  - "je sais pas trop" (seul) → INVALIDE

RÉPONDS EN JSON:
{"isValid": true, "topic": "description formalisée"} 
ou
{"isValid": false}

JSON:`

    const result = await generateWithGemini({
      model: "gemini-2.0-flash",
      systemInstruction: "Tu analyses des sujets de conversation. Réponds uniquement en JSON valide.",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      maxOutputTokens: 80,
      temperature: 0.1,
    })
    
    const text = String(result?.text ?? "").trim()
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[deferred_topics] AI returned non-JSON:", text.slice(0, 100))
      return { isValid: false }
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    const isValid = Boolean(parsed?.isValid)
    const topic = String(parsed?.topic ?? "").trim()
      .replace(/^["'""'']+|["'""'']+$/g, "")
      .trim()
    
    if (isValid && topic && topic.length >= 3 && topic.length <= 120) {
      console.log(`[deferred_topics] Validated & formalized: "${extracted.slice(0, 30) || raw.slice(0, 30)}" → "${topic}"`)
      return { isValid: true, formalizedTopic: topic }
    }
    
    if (!isValid) {
      console.log(`[deferred_topics] Rejected as invalid: "${extracted.slice(0, 40) || raw.slice(0, 40)}"`)
    }
    
    return { isValid: false }
  } catch (e) {
    console.warn("[deferred_topics] AI validation failed:", e)
    // Fallback: use rule-based validation
    if (isValidDeferredTopic(extracted || raw)) {
      return { isValid: true, formalizedTopic: extracted || raw.slice(0, 120) }
    }
    return { isValid: false }
  }
}

/**
 * LEGACY: Simple formalization without validation (used at reprise if topic wasn't pre-formalized)
 */
export async function formalizeDeferredTopicWithAI(
  rawTopic: string,
  userMessageContext?: string,
): Promise<string> {
  const raw = String(rawTopic ?? "").trim()
  if (!raw || raw.length < 5) return raw
  
  // If the topic already looks clean (short, no filler), skip AI
  if (raw.length <= 30 && !/\b(?:je\s+sais?\s+pas|euh|hm|bof|peut[-\s]?être)\b/i.test(raw)) {
    return raw
  }
  
  // Use the new validation function
  const result = await validateAndFormalizeDeferredTopic({
    rawMessage: userMessageContext || raw,
    extractedTopic: raw,
    source: "user_digression",
  })
  
  return result.formalizedTopic || raw
}

export function assistantDeferredTopic(assistantText: string): boolean {
  const s = (assistantText ?? "").toString().toLowerCase()
  // Examples to catch:
  // - "On pourra en reparler après / à la fin du bilan"
  // - "On garde ça pour la fin"
  // - "On verra ça après"
  // - "On en discute après le bilan"
  const hasLater =
    /\b(apr[èe]s|plus\s+tard|tout\s+[àa]\s+l['’]?heure|quand\s+on\s+aura\s+fini|fin\s+du\s+bilan|à\s+la\s+fin|quand\s+tu\s+veux|quand\s+tu\s+voudr\w*)\b/i
      .test(s)
  const hasDeferralVerb =
    // include conjugations like "on gardera", "on garde", etc. (use prefix "on gard")
    /\b(on\s+pourra|on\s+peut|on\s+gard\w*|on\s+verra|on\s+reviendr\w*|on\s+revien\w*|on\s+reprendr\w*|on\s+repren\w*|on\s+prendr\w*|on\s+prend\w*|on\s+en\s+reparl\w*|on\s+en\s+parl\w*|on\s+en\s+discut\w*|on\s+met\s+[çc]a\s+de\s+c[oô]t[eé]|on\s+le\s+met\s+de\s+c[oô]t[eé]|on\s+met\s+[çc]a\s+de\s+c[oô]t[eé])\b/i
      .test(s)
  // Accept explicit "on en reparlera / on en discutera" even without a time anchor.
  const explicitWeWillTalkAgain =
    /\bon\s+en\s+reparl\w*\b/i.test(s) ||
    /\bon\s+en\s+discut\w*\b/i.test(s) ||
    /\bon\s+pourra\s+en\s+reparler\b/i.test(s) ||
    /\bon\s+pourra\s+en\s+discuter\b/i.test(s) ||
    /\bon\s+peut\s+en\s+reparler\b/i.test(s) ||
    /\bon\s+peut\s+en\s+discuter\b/i.test(s) ||
    // Common phrasing: "on pourra y revenir / revenir sur X"
    /\bon\s+pourra\s+y\s+revenir\b/i.test(s) ||
    /\bon\s+pourra\s+revenir\b/i.test(s) ||
    // Catch "on y reviendra" (very common in FR) + generic "on reviendra"
    /\bon\s+y\s+reviendr\w*\b/i.test(s) ||
    /\bon\s+reviendr\w*\b/i.test(s) ||
    // Catch "on reviendra dessus / là-dessus"
    /\bon\s+reviendr\w*\s+(?:dessus|l[àa]-?dessus)\b/i.test(s)
  return (hasLater && hasDeferralVerb) || explicitWeWillTalkAgain
}

export function userExplicitlyDefersTopic(userMsg: string): boolean {
  const s = (userMsg ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // User indicates "let's talk later" (we capture topic for post-bilan parking-lot).
  return (
    /\b(on\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b)/i.test(s) &&
    /\b(apr[èe]s|plus\s+tard)\b/i.test(s)
  )
}

export function extractDeferredTopicFromUserMessage(userMsg: string): string {
  const m = (userMsg ?? "").toString().trim()
  if (!m) return ""

  const normalizeTopic = (raw: string): string => {
    let s = (raw ?? "").toString().trim()
    if (!s) return ""
    // Strip leading discourse fillers that are not the topic.
    s = s.replace(/^(?:mais|en\s+fait|du\s+coup|bon|bref|alors|ok)\b[,:]?\s*/i, "").trim()
    s = s.replace(/^c['']est\s+vrai\s+que\s+/i, "").trim()
    // Remove surrounding quotes
    s = s.replace(/^["'""'']+|["'""'']+$/g, "").trim()
    // If the user message contains an explicit deferral, keep only the part BEFORE it.
    // This prevents storing the whole paragraph including "on en reparlera après".
    s = s.split(/\bon\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b/i)[0]?.trim() ?? s
    // Remove trailing "after" / deferral / filler fragments that often follow the true topic
    s = s.replace(/\b(apr[èe]s\s+(?:le\s+)?bilan)\b/gi, "").trim()
    // Remove uncertainty expressions that aren't the topic
    s = s.replace(/\b(?:mais\s+)?(?:je\s+(?:ne\s+)?sais?\s+pas\s+(?:trop|vraiment)?|j['']?h[ée]site|je\s+suis\s+pas\s+s[ûu]r(?:e)?|peut[-\s]?être)\b/gi, "").trim()
    // If we have commas, the first clause is usually the clean topic BUT
    // avoid discourse markers like "D'ailleurs," / "Au fait," which are not the topic.
    if (s.includes(",")) {
      const parts = s.split(",").map((p) => p.trim()).filter(Boolean)
      const first = parts[0] ?? ""
      const isMarker = /^(d['']?ailleurs|au\s+fait|sinon|bon|bref|du\s+coup|tiens|ok|alors)$/i.test(first)
      s = (isMarker ? (parts[1] ?? first) : first).trim()
    }
    // Strip common trailing fillers repeatedly
    for (let i = 0; i < 4; i++) {
      const before = s
      s = s
        .replace(/\s+(?:s['']il\s+te\s+pla[iî]t|s['']il\s+vous\s+pla[iî]t|si\s+tu\s+veux|si\s+vous\s+voulez|du\s+coup|enfin|bref)\s*$/i, "")
        .replace(/\s*(?:,|\.)?\s*(?:mais|par\s+contre|donc)\s*$/i, "")
        .trim()
      if (s === before) break
    }
    // Final safety: truncate overly long topics
    return s.slice(0, 160)
  }
  
  // PRIORITY EXTRACTION: Look for common work/life stress indicators FIRST
  // These are often buried in uncertainty ("j'ai mon boss qui..., je sais pas trop")
  const bossMatch = m.match(/\b(?:mon\s+)?(?:boss|chef|manager|sup[eé]rieur|patron|directeur)(?:\s+qui\s+[^,.!?]+)?/i)
  if (bossMatch?.[0]) return normalizeTopic(bossMatch[0])
  
  const workMatch = m.match(/\b(?:mon\s+)?(?:travail|boulot|taff|job)(?:\s+qui\s+[^,.!?]+)?/i)
  if (workMatch?.[0]) return normalizeTopic(workMatch[0])
  
  const stressMatch = m.match(/\b(?:le\s+|mon\s+)?stress(?:\s+(?:au|du|avec)\s+[^,.!?]+)?/i)
  if (stressMatch?.[0]) return normalizeTopic(stressMatch[0])

  // High-precision shortcuts (common in FR): extract the noun phrase directly.
  const org = /\b(?:mon|ma|mes)\s+organisation(?:\s+(?:au|du)\s+travail)?\b/i.exec(m)
  if (org?.[0]) return normalizeTopic(org[0])
  const stress = /\b(?:mon|ma|mes)\s+stress(?:\s+(?:au|du)\s+travail)?\b/i.exec(m)
  if (stress?.[0]) return normalizeTopic(stress[0])

  // Direct "on en reparlera de X" patterns.
  const r0 =
    /\bon\s+en\s+(?:reparl\w*|parl\w*|discut\w*)\s+(?:de|du|des|d['’])\s+(.+?)(?:\b(?:apr[èe]s|plus\s+tard)\b|[.?!]|$)/i
      .exec(m)
  if (r0?.[1]) return normalizeTopic(r0[1])

  // "pour X, on en reparle après" patterns (very common).
  const r0b =
    /(?:\b(?:pour|concernant|sur)\b)\s+(.+?)[,;:]\s*on\s+en\s+(?:reparl\w*|parl\w*|discut\w*)\s+(?:apr[èe]s|plus\s+tard)\b/i
      .exec(m)
  if (r0b?.[1]) return normalizeTopic(r0b[1])

  // Try to extract the clause right before a "we'll talk later" marker.
  const r1 =
    /(?:j['’]ai\s+l['’]impression\s+que|je\s+pense\s+que|je\s+crois\s+que|c['’]est\s+que)\s+(.+?)(?:[,.!?]\s*)?(?:on\s+(?:pourra|peut)\s+(?:en\s+parler|en\s+reparler|en\s+discuter|y\s+revenir|revenir)\s+(?:plus\s+tard|apr[èe]s)|on\s+y\s+reviendr\w*|on\s+en\s+reparler\w*)\b/i
      .exec(m)
  if (r1?.[1]) return normalizeTopic(r1[1])

  // Fallback: keep the tail sentence (often the topic is right before the deferral phrase).
  const parts = m.split(/[.?!]/).map((x) => x.trim()).filter(Boolean)
  let tail = parts.length ? parts[parts.length - 1] : m
  // If the tail is just a deferral marker, the actual topic is usually the previous sentence.
  if (parts.length >= 2 && userExplicitlyDefersTopic(tail) && tail.length <= 80) {
    tail = parts[parts.length - 2] ?? tail
  }
  // If we still ended up with a pure deferral phrase, bail out.
  if (/^\s*on\s+(?:en\s+)?reparl\w*/i.test(tail)) {
    tail = parts.length >= 2 ? (parts[parts.length - 2] ?? tail) : tail
  }
  return normalizeTopic(tail)
}

/**
 * Check if a candidate topic is actually a real subject worth storing,
 * or just noise/filler/uncertainty expressions.
 */
export function isValidDeferredTopic(topic: string): boolean {
  const t = String(topic ?? "").trim().toLowerCase()
  if (!t || t.length < 4) return false
  
  // Reject pure uncertainty/filler expressions
  const invalidPatterns = [
    /^(?:je\s+(?:ne\s+)?sais?\s+pas(?:\s+trop)?|j['']?h[ée]site|peut[-\s]?[êe]tre|bof|euh+|hm+)$/i,
    /^(?:d['']?ailleurs|bref|ok|oui|non|merci|c['']est\s+bon|voil[àa]|bon|alors)$/i,
    /^(?:je\s+(?:ne\s+)?sais?\s+pas(?:\s+trop)?)/i, // starts with "je sais pas"
    /^(?:pas\s+s[ûu]r|pas\s+sure)/i,
  ]
  
  for (const p of invalidPatterns) {
    if (p.test(t)) return false
  }
  
  // Must contain at least one "real" noun or subject
  const hasRealSubject = /\b(?:boss|chef|travail|boulot|stress|famille|parents|ami|relation|sommeil|sant[ée]|argent|projet|objectif|plan|exercice|action|routine|habitude|organisation|temps|emploi|job|sport|lecture)\b/i.test(t)
  
  // Or be long enough to likely be meaningful
  return hasRealSubject || t.length >= 15
}

export function appendDeferredTopicToState(currentState: any, topic: string): any {
  const prev = currentState?.temp_memory?.deferred_topics ?? []
  const t = String(topic ?? "").trim()
  if (!t) return currentState
  
  // STRICT VALIDATION: reject invalid/noise topics
  if (!isValidDeferredTopic(t)) {
    console.warn(`[deferred_topics] Rejecting invalid topic: "${t.slice(0, 50)}"`)
    return currentState
  }
  
  const norm = (x: unknown) =>
    String(x ?? "")
      .toLowerCase()
      .replace(/["""']/g, "")
      .replace(/\s+/g, " ")
      .trim()
  const tN = norm(t)
  
  const exists =
    Array.isArray(prev) &&
    prev.some((x: any) => {
      const xN = norm(typeof x === "string" ? x : x?.topic)
      return xN === tN || xN.includes(tN) || tN.includes(xN)
    })
  const nextTopics = exists ? prev : [...(Array.isArray(prev) ? prev : []), t.slice(0, 120)]
  // Keep the list bounded (avoid loops).
  const bounded = Array.isArray(nextTopics) ? nextTopics.slice(-3) : nextTopics
  return {
    ...(currentState ?? {}),
    temp_memory: { ...((currentState ?? {})?.temp_memory ?? {}), deferred_topics: bounded },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENRICHED DEFERRED TOPICS (deep_reasons support)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Append an enriched deferred topic (with type and context) to state.
 * Used for deep_reasons topics created by the Investigator.
 */
export function appendEnrichedDeferredTopicToState(
  currentState: any, 
  enrichedTopic: EnrichedDeferredTopic
): any {
  const prev = currentState?.temp_memory?.deferred_topics ?? []
  
  if (!enrichedTopic?.topic) return currentState
  
  const norm = (x: unknown) =>
    String(typeof x === "string" ? x : (x as any)?.topic ?? "")
      .toLowerCase()
      .replace(/["""']/g, "")
      .replace(/\s+/g, " ")
      .trim()
  
  const tN = norm(enrichedTopic.topic)
  
  // Check for duplicates (compare topic strings)
  const exists =
    Array.isArray(prev) &&
    prev.some((x: any) => {
      const xN = norm(x)
      return xN === tN || xN.includes(tN) || tN.includes(xN)
    })
  
  if (exists) {
    console.log(`[deferred_topics] Enriched topic already exists: "${enrichedTopic.topic.slice(0, 40)}"`)
    return currentState
  }
  
  const nextTopics = [...(Array.isArray(prev) ? prev : []), enrichedTopic]
  // Keep the list bounded (avoid loops) - deep_reasons topics have higher priority
  const bounded = nextTopics.slice(-4)
  
  console.log(`[deferred_topics] Added enriched topic (${enrichedTopic.type}): "${enrichedTopic.topic.slice(0, 40)}"`)
  
  return {
    ...(currentState ?? {}),
    temp_memory: { ...((currentState ?? {})?.temp_memory ?? {}), deferred_topics: bounded },
  }
}

/**
 * Get the first deep_reasons deferred topic from state (if any).
 * Used to check if there's a deep_reasons topic ready to be explored.
 */
export function getDeepReasonsDeferredTopic(tempMemory: any): EnrichedDeferredTopic | null {
  const topics = tempMemory?.deferred_topics ?? []
  if (!Array.isArray(topics)) return null
  
  for (const t of topics) {
    if (isDeepReasonsDeferredTopic(t)) {
      return t
    }
  }
  return null
}

/**
 * Check if there's any deep_reasons deferred topic in state.
 */
export function hasDeepReasonsDeferredTopic(tempMemory: any): boolean {
  return getDeepReasonsDeferredTopic(tempMemory) !== null
}

/**
 * Remove a deep_reasons deferred topic from state (after it's been processed).
 */
export function removeDeepReasonsDeferredTopic(currentState: any): any {
  const prev = currentState?.temp_memory?.deferred_topics ?? []
  if (!Array.isArray(prev) || prev.length === 0) return currentState
  
  const filtered = prev.filter((t: any) => !isDeepReasonsDeferredTopic(t))
  
  if (filtered.length === prev.length) return currentState // Nothing removed
  
  console.log(`[deferred_topics] Removed deep_reasons deferred topic`)
  
  return {
    ...(currentState ?? {}),
    temp_memory: { 
      ...((currentState ?? {})?.temp_memory ?? {}), 
      deferred_topics: filtered.length > 0 ? filtered : undefined 
    },
  }
}




