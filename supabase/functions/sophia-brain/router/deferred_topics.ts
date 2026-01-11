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
    s = s.replace(/^c['’]est\s+vrai\s+que\s+/i, "").trim()
    // Remove surrounding quotes
    s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim()
    // If the user message contains an explicit deferral, keep only the part BEFORE it.
    // This prevents storing the whole paragraph including "on en reparlera après".
    s = s.split(/\bon\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b/i)[0]?.trim() ?? s
    // Remove trailing "after" / deferral / filler fragments that often follow the true topic
    s = s.replace(/\b(apr[èe]s\s+(?:le\s+)?bilan)\b/gi, "").trim()
    // If we have commas, the first clause is usually the clean topic BUT
    // avoid discourse markers like "D'ailleurs," / "Au fait," which are not the topic.
    if (s.includes(",")) {
      const parts = s.split(",").map((p) => p.trim()).filter(Boolean)
      const first = parts[0] ?? ""
      const isMarker = /^(d['’]?ailleurs|au\s+fait|sinon|bon|bref|du\s+coup|tiens|ok|alors)$/i.test(first)
      s = (isMarker ? (parts[1] ?? first) : first).trim()
    }
    // Strip common trailing fillers repeatedly
    for (let i = 0; i < 4; i++) {
      const before = s
      s = s
        .replace(/\s+(?:s['’]il\s+te\s+pla[iî]t|s['’]il\s+vous\s+pla[iî]t|si\s+tu\s+veux|si\s+vous\s+voulez|du\s+coup|enfin|bref)\s*$/i, "")
        .replace(/\s*(?:,|\.)?\s*(?:mais|par\s+contre|donc)\s*$/i, "")
        .trim()
      if (s === before) break
    }
    // Final safety: truncate overly long topics
    return s.slice(0, 160)
  }

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

export function appendDeferredTopicToState(currentState: any, topic: string): any {
  const prev = currentState?.temp_memory?.deferred_topics ?? []
  const t = String(topic ?? "").trim()
  if (!t) return currentState
  const norm = (x: unknown) =>
    String(x ?? "")
      .toLowerCase()
      .replace(/[“”"']/g, "")
      .replace(/\s+/g, " ")
      .trim()
  const tN = norm(t)
  // Drop useless topics that are too generic/noisy.
  if (!tN || tN.length < 4) return currentState
  if (/^(d['’]ailleurs|bref|ok|oui|merci|c['’]est\s+bon)$/i.test(tN)) return currentState
  const exists =
    Array.isArray(prev) &&
    prev.some((x: any) => {
      const xN = norm(x)
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


