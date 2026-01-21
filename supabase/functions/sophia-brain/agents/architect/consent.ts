export function looksLikeYesToProceed(message: string): boolean {
  const t = String(message ?? "").trim().toLowerCase()
  return /^(oui|ok|d['’]accord|vas[-\s]?y|go|ça\s+marche|c['’]est\s+bon)\b/i.test(t) ||
    /\b(oui|ok|vas[-\s]?y|tu\s+peux|d['’]accord)\b/i.test(t)
}

export function looksLikeNoToProceed(message: string): boolean {
  const t = String(message ?? "").trim().toLowerCase()
  return /^(non|nope|nan|pas\s+maintenant|pas\s+besoin|laisse|laisse\s+tomber)\b/i.test(t) ||
    /\b(non|pas\s+maintenant|pas\s+besoin)\b/i.test(t)
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
  const m = s.match(/["“«]\s*([^"”»]{2,80})\s*["”»]/)
  const title = String(m?.[1] ?? "").trim()
  return title ? title : null
}


