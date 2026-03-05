/**
 * Topic Memory System — Mémoire thématique vivante
 *
 * Ce module gère des SYNTHÈSES ÉVOLUTIVES par topic, avec des mots-clés
 * vectorisés qui pointent vers ces synthèses.
 *
 * Flux :
 * 1. Le Watcher analyse la conversation → extrait des topics + infos
 * 2. Pour chaque topic : on cherche si un topic similaire existe déjà
 * 3. Si oui : on enrichit la synthèse existante
 * 4. Si non : on crée un nouveau topic
 * 5. On ajoute les mots-clés (aliases) qui pointent vers le topic
 *
 * Retrieval :
 * - Le message user est vectorisé
 * - On cherche par similarité dans les keywords → retourne les synthèses
 * - On cherche aussi par similarité directe sur les synthèses (backup)
 * - Les topics pertinents sont injectés dans le contexte du prompt
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateWithGemini, generateEmbedding, getGlobalAiModel } from "../_shared/gemini.ts"

type TopicEnrichmentSource = "chat" | "onboarding" | "bilan" | "module" | "plan"

const MATCH_HIGH = Number((Deno.env.get("SOPHIA_TOPIC_MATCH_HIGH") ?? "0.72").trim()) || 0.72
const KEYWORD_STRONG = Number((Deno.env.get("SOPHIA_TOPIC_KEYWORD_STRONG") ?? "0.86").trim()) || 0.86
const SYNTH_STRONG = Number((Deno.env.get("SOPHIA_TOPIC_SYNTH_STRONG") ?? "0.84").trim()) || 0.84
const NOOP_SEMANTIC_SIM = Number((Deno.env.get("SOPHIA_TOPIC_NOOP_SEMANTIC_SIM") ?? "0.90").trim()) || 0.90
const TITLE_STRONG = Number((Deno.env.get("SOPHIA_TOPIC_TITLE_STRONG") ?? "0.88").trim()) || 0.88
const MAX_KEYWORDS_PER_TOPIC_UPDATE = Number((Deno.env.get("SOPHIA_TOPIC_MAX_KEYWORDS_PER_UPDATE") ?? "12").trim()) || 12
const ALLOW_KEYWORD_REASSIGN = (Deno.env.get("SOPHIA_TOPIC_ALLOW_KEYWORD_REASSIGN") ?? "").trim() === "1"
const AUTO_MERGE_SYNTH_SIM = Number((Deno.env.get("SOPHIA_TOPIC_AUTO_MERGE_SYNTH_SIM") ?? "0.93").trim()) || 0.93
const AUTO_MERGE_TITLE_SIM = Number((Deno.env.get("SOPHIA_TOPIC_AUTO_MERGE_TITLE_SIM") ?? "0.95").trim()) || 0.95
const AUTO_MERGE_TITLE_JACCARD = Number((Deno.env.get("SOPHIA_TOPIC_AUTO_MERGE_TITLE_JACCARD") ?? "0.60").trim()) || 0.60
const MAX_TIMELINE_ITEMS = Number((Deno.env.get("SOPHIA_TOPIC_MAX_TIMELINE_ITEMS") ?? "10").trim()) || 10
const TOPIC_DEBUG = (Deno.env.get("SOPHIA_TOPIC_DEBUG") ?? "").trim() === "1"

const GENERIC_KEYWORDS = new Set([
  "sommeil", "sleep", "maman", "mere", "mother", "famille", "family",
  "travail", "work", "stress", "anxiete", "anxiety", "sante", "health",
  "routine", "habitude", "habit", "probleme", "problem", "objectif", "goal",
  "lecture", "book", "article", "temps", "time", "soir", "nuit", "jour",
])

function toVector(v: unknown): number[] | null {
  if (Array.isArray(v)) {
    const arr = v.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    return arr.length > 0 ? arr : null
  }
  return null
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  const den = Math.sqrt(na) * Math.sqrt(nb)
  if (den <= 0) return 0
  return Math.max(-1, Math.min(1, dot / den))
}

function tokens(text: string): Set<string> {
  const t = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
  return new Set(t)
}

function normalizeKeyword(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
}

function isGenericKeyword(raw: string): boolean {
  const k = normalizeKeyword(raw)
  if (!k) return true
  if (GENERIC_KEYWORDS.has(k)) return true
  // A single short token is generally too broad as an anchor.
  if (!k.includes(" ") && k.length <= 6) return true
  return false
}

function keywordSpecificity(raw: string): number {
  const k = normalizeKeyword(raw)
  if (!k) return 0
  const words = k.split(" ").filter(Boolean)
  if (words.length >= 2) return 1
  if (isGenericKeyword(k)) return 0.1
  return 0.6
}

function sanitizeKeywords(rawKeywords: string[], fallbackTitle: string): string[] {
  const normalized = [...new Set(
    (Array.isArray(rawKeywords) ? rawKeywords : [])
      .map((k) => normalizeKeyword(String(k ?? "")))
      .filter(Boolean),
  )]

  const contextual = normalized.filter((k) => !isGenericKeyword(k))
  const chosen = contextual.length > 0 ? contextual : normalized

  // Ensure at least one anchor exists using title as fallback.
  if (chosen.length === 0) {
    const fromTitle = normalizeKeyword(fallbackTitle)
    if (fromTitle) return [fromTitle]
  }

  return chosen.slice(0, MAX_KEYWORDS_PER_TOPIC_UPDATE)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const v of a) if (b.has(v)) inter++
  const union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

function recencyScore(lastEnrichedAt: string | null | undefined): number {
  if (!lastEnrichedAt) return 0.3
  const ts = new Date(lastEnrichedAt).getTime()
  if (!Number.isFinite(ts)) return 0.3
  const days = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24))
  return Math.max(0, Math.min(1, 1 - days / 30))
}

function slugTokenKey(raw: string): string {
  const norm = slugify(raw).replace(/_/g, " ").trim()
  if (!norm) return ""
  const parts = norm.split(/\s+/).map((p) => p.trim()).filter((p) => p.length >= 3)
  return [...new Set(parts)].sort().join("_")
}

function mergeSynthesisText(a: string, b: string): string {
  const aa = String(a ?? "").trim()
  const bb = String(b ?? "").trim()
  if (!aa) return bb
  if (!bb) return aa
  const aLower = aa.toLowerCase()
  const bLower = bb.toLowerCase()
  if (aLower.includes(bLower)) return aa
  if (bLower.includes(aLower)) return bb
  return `${aa}\n\n${bb}`
}

interface TimelineEvent {
  at: string
  note: string
  source?: TopicEnrichmentSource | "merge"
}

function formatDateFrDayMonthYear(input: string | null | undefined): string {
  if (!input) return "date inconnue"
  const dt = new Date(input)
  if (!Number.isFinite(dt.getTime())) return "date inconnue"
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(dt)
}

function timelineNote(raw: string, maxLen = 220): string {
  const cleaned = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return "Mise à jour contextuelle."
  if (cleaned.length <= maxLen) return cleaned
  return `${cleaned.slice(0, maxLen - 1).trim()}…`
}

function readTimeline(metadata: unknown): TimelineEvent[] {
  const md = (metadata && typeof metadata === "object") ? (metadata as Record<string, unknown>) : {}
  const raw = md.timeline
  if (!Array.isArray(raw)) return []
  const events: TimelineEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const at = String((item as Record<string, unknown>).at ?? "").trim()
    const note = String((item as Record<string, unknown>).note ?? "").trim()
    const sourceRaw = String((item as Record<string, unknown>).source ?? "").trim()
    if (!at || !note) continue
    const parsed = new Date(at)
    if (!Number.isFinite(parsed.getTime())) continue
    const source = sourceRaw ? sourceRaw as TimelineEvent["source"] : undefined
    events.push({ at: parsed.toISOString(), note, source })
  }
  return events.sort((a, b) => {
    const at = new Date(a.at).getTime()
    const bt = new Date(b.at).getTime()
    return at - bt
  })
}

function appendTimelineEvent(timeline: TimelineEvent[], event: TimelineEvent): TimelineEvent[] {
  const normalizedAt = new Date(event.at)
  const safeAt = Number.isFinite(normalizedAt.getTime()) ? normalizedAt.toISOString() : new Date().toISOString()
  const safeNote = timelineNote(event.note, 240)
  const dedupKey = `${safeAt.slice(0, 10)}|${safeNote.toLowerCase()}`
  const deduped = timeline.filter((e) => `${e.at.slice(0, 10)}|${e.note.toLowerCase()}` !== dedupKey)
  const next = [...deduped, { ...event, at: safeAt, note: safeNote }]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return next.slice(-MAX_TIMELINE_ITEMS)
}

// ============================================================================
// Types
// ============================================================================

/** Topic extrait d'une conversation par le LLM */
export interface ExtractedTopic {
  /** Slug canonique (ex: "cannabis_arret", "soeur_tania") */
  slug: string
  /** Titre lisible (ex: "Cannabis / Arrêt", "Sœur (Tania)") */
  title: string
  /** Nouvelles informations à intégrer dans la synthèse */
  new_information: string
  /** Mots-clés / aliases associés (ex: ["cannabis", "weed", "joint", "fumer"]) */
  keywords: string[]
  /** Domaine sémantique (ex: "santé", "famille", "travail", "loisirs") */
  domain?: string
}

/** Topic tel qu'il existe en base */
export interface TopicMemory {
  id: string
  user_id: string
  slug: string
  title: string
  synthesis: string
  synthesis_embedding?: number[] | null
  title_embedding?: number[] | null
  status: string
  mention_count: number
  enrichment_count: number
  first_mentioned_at: string
  last_enriched_at: string | null
  last_retrieved_at: string | null
  created_at?: string
  updated_at?: string
  metadata: Record<string, unknown>
}

/** Résultat de la recherche de topics par similarité */
export interface TopicSearchResult {
  topic_id: string
  slug: string
  title: string
  synthesis: string
  keyword_matched?: string
  keyword_similarity?: number
  synthesis_similarity?: number
  title_similarity?: number
  mention_count: number
  last_enriched_at: string | null
  metadata: Record<string, unknown>
  recent_enrichments?: Array<{
    created_at: string
    enrichment_summary: string
    source_type?: string | null
  }>
}

// ============================================================================
// 1. EXTRACTION — Analyser la conversation pour détecter des topics
// ============================================================================

/**
 * Extrait les topics d'un transcript de conversation.
 * Appelé par le Watcher après chaque batch de messages.
 */
export async function extractTopicsFromTranscript(opts: {
  transcript: string
  existingTopicSlugs: string[]
  currentContext?: string
  userId?: string
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<ExtractedTopic[]> {
  const { transcript, existingTopicSlugs, currentContext, userId, meta } = opts

  const existingTopicsHint = existingTopicSlugs.length > 0
    ? `\nTOPICS DÉJÀ CONNUS pour cet utilisateur : ${existingTopicSlugs.join(", ")}\nSi une information enrichit un topic existant, utilise le MÊME slug.\n`
    : ""

  const prompt = `
Tu es un analyseur de mémoire thématique pour un coach IA.
Tu lis un bloc de conversation et tu extrais les TOPICS significatifs.

Un TOPIC = un sujet de vie récurrent ou important pour l'utilisateur.
Exemples de topics : une personne (sœur, patron), une habitude (sport, cannabis), un objectif (changer de job), une émotion récurrente (anxiété sociale), un événement (déménagement).

INPUTS :
- Conversation récente (ci-dessous)
- Contexte précédent : "${currentContext ?? "Aucun"}"
${existingTopicsHint}

TES RÈGLES :
1. Ne crée un topic QUE s'il y a de l'information SUBSTANTIELLE (pas juste une mention passagère).
2. Pour les PERSONNES mentionnées : le slug doit inclure le lien ET le prénom s'il est connu (ex: "soeur_tania", "patron_marc").
3. Les keywords doivent inclure TOUTES les façons dont l'utilisateur pourrait référencer ce topic :
   - Synonymes ("cannabis", "weed", "joint", "shit", "fumer")
   - Liens familiaux ("ma sœur", "tania", "ma frangine")
   - Termes connexes importants ("arrêter de fumer", "sevrage", "addiction")
   - IMPORTANT: privilégie des keywords contextualisés (ex: "sommeil mere", "article sommeil", "routine soir")
   - Évite les keywords trop génériques seuls (ex: "sommeil", "travail", "stress")
   - Si tu utilises un mot générique, ajoute au moins un alias contextualisé correspondant.
4. Le champ "new_information" doit contenir un résumé dense de ce qui a été dit dans CE bloc.
5. Le champ "domain" aide à connecter des topics entre eux (ex: "alimentation" et "allergie" sont dans le domaine "santé").
6. Maximum 4 topics par batch (garde seulement les plus significatifs).
7. Si RIEN de significatif n'a été dit (small talk, "ok", "merci"), retourne un tableau vide.

SORTIE JSON ATTENDUE :
{
  "topics": [
    {
      "slug": "cannabis_arret",
      "title": "Cannabis / Arrêt",
      "new_information": "L'utilisateur dit avoir réduit sa consommation de moitié depuis 2 semaines. Il ressent des insomnies mais se sent plus lucide le matin.",
      "keywords": ["cannabis", "weed", "joint", "fumer", "arrêter de fumer", "sevrage"],
      "domain": "santé"
    }
  ]
}
  `.trim()

  try {
    const raw = await generateWithGemini(prompt, transcript, 0.2, true, [], "json", {
      requestId: meta?.requestId,
      model: meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
      source: "sophia-brain:topic_extraction",
      forceRealAi: meta?.forceRealAi,
      userId,
    })

    const parsed = JSON.parse(String(raw ?? "{}"))
    const topics = Array.isArray(parsed?.topics) ? parsed.topics : []

    return topics
      .filter((t: any) => t?.slug && t?.title && t?.new_information)
      .slice(0, 4)
      .map((t: any) => ({
        slug: slugify(String(t.slug)),
        title: String(t.title).trim(),
        new_information: String(t.new_information).trim(),
        keywords: sanitizeKeywords(
          Array.isArray(t.keywords)
            ? t.keywords.map((k: any) => String(k))
            : [],
          String(t.title ?? ""),
        ),
        domain: t.domain ? String(t.domain).trim().toLowerCase() : undefined,
      }))
  } catch (e) {
    console.error("[TopicMemory] Failed to extract topics:", e)
    return []
  }
}

// ============================================================================
// PERSISTENCE GATE — Ne persister que les topics utiles long terme
// ============================================================================

/** Min chars for new_information to pass prefilter (avoid LLM on tiny snippets) */
const PREFILTER_MIN_INFO_LEN = 50

export interface PersistGateResult {
  persist: boolean
  value_score: number
  reason: string
  horizon: "short_term" | "long_term"
  duplicate_structured_data: boolean
}

/**
 * Détermine si un topic extrait mérite d'être persisté.
 * Prefilter rapide puis LLM pour éviter les mises à jour transitoires et doublons plan/bilan.
 */
export async function shouldPersistTopicMemory(opts: {
  extractedTopic: ExtractedTopic
  sourceType?: TopicEnrichmentSource
  userId?: string
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<PersistGateResult> {
  const { extractedTopic, meta, userId } = opts
  const sourceType = opts.sourceType ?? "chat"
  const info = String(extractedTopic.new_information ?? "").trim()
  const slug = extractedTopic.slug ?? ""

  // Prefilter: avoid LLM on obvious low-value tiny snippets
  if (info.length < PREFILTER_MIN_INFO_LEN) {
    return {
      persist: false,
      value_score: 0,
      reason: `new_information trop court (${info.length} chars)`,
      horizon: "short_term",
      duplicate_structured_data: false,
    }
  }

  const prompt = `
Tu évalues si une information thématique extraite d'une conversation mérite d'être persistée en mémoire long terme (2+ mois).

RÈGLES STRICTES :
- persist=false pour : mises à jour quotidiennes d'exécution (ex: "a fait X aujourd'hui"), micro-ajustements de routine déjà suivis dans le plan, doublons de données structurées (plan, bilan, modules), infos très éphémères, small talk.
- persist=true pour : contextes stables, contraintes de vie, patterns récurrents, relations significatives, objectifs/habitudes durables, infos qui resteront utiles au coach dans 2+ mois.

Schema JSON strict :
{
  "persist": boolean,
  "value_score": number (0-10),
  "reason": string (court),
  "horizon": "short_term" | "long_term",
  "duplicate_structured_data": boolean
}
  `.trim()

  const userPayload = JSON.stringify({
    source_type: sourceType,
    slug,
    title: extractedTopic.title,
    new_information: info.slice(0, 600),
  })

  try {
    const raw = await generateWithGemini(prompt, userPayload, 0.1, true, [], "json", {
      requestId: meta?.requestId,
      model: meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
      source: "sophia-brain:topic_persist_gate",
      forceRealAi: meta?.forceRealAi,
      userId,
    })

    const parsed = JSON.parse(String(raw ?? "{}"))
    const persist = Boolean(parsed.persist)
    const value_score = Math.max(0, Math.min(10, Number(parsed.value_score) || 0))
    const reason = String(parsed.reason ?? "").trim() || (persist ? "Valeur long terme" : "Valeur insuffisante")
    const horizon = parsed.horizon === "long_term" ? "long_term" : "short_term"
    const duplicate_structured_data = Boolean(parsed.duplicate_structured_data)

    return {
      persist,
      value_score,
      reason,
      horizon,
      duplicate_structured_data,
    }
  } catch (e) {
    console.warn("[TopicMemory] Persist gate LLM failed, defaulting to persist=false:", e)
    return { persist: false, value_score: 0, reason: "LLM fallback (fail-closed)", horizon: "short_term", duplicate_structured_data: false }
  }
}

// ============================================================================
// 2. MATCHING — Trouver les topics existants similaires
// ============================================================================

/**
 * Cherche les topics existants qui matchent un nouveau topic extrait.
 * Utilise à la fois le slug exact ET la similarité sémantique des keywords.
 */
export async function findMatchingTopic(opts: {
  supabase: SupabaseClient
  userId: string
  extractedTopic: ExtractedTopic
  meta?: { requestId?: string }
}): Promise<TopicMemory | null> {
  const { supabase, userId, extractedTopic, meta } = opts

  // 1. Chercher par slug exact (match direct)
  const { data: exactMatch } = await supabase
    .from("user_topic_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("slug", extractedTopic.slug)
    .eq("status", "active")
    .maybeSingle()

  if (exactMatch) return exactMatch as TopicMemory

  // 1b. Match canonique de slug (ignore l'ordre des tokens)
  const targetSlugKey = slugTokenKey(extractedTopic.slug)
  if (targetSlugKey) {
    const { data: activeTopics } = await supabase
      .from("user_topic_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(120)

    const sameSlugFamily = (Array.isArray(activeTopics) ? activeTopics : [])
      .filter((t: any) => slugTokenKey(String(t?.slug ?? "")) === targetSlugKey)
      .sort((a: any, b: any) => {
        const byMentions = (Number(b?.mention_count ?? 0) || 0) - (Number(a?.mention_count ?? 0) || 0)
        if (byMentions !== 0) return byMentions
        const at = new Date(String(a?.last_enriched_at ?? a?.updated_at ?? 0)).getTime() || 0
        const bt = new Date(String(b?.last_enriched_at ?? b?.updated_at ?? 0)).getTime() || 0
        return bt - at
      })

    if (sameSlugFamily.length > 0) {
      return sameSlugFamily[0] as TopicMemory
    }
  }

  // 2) Recherche sémantique + re-ranking fusion
  const searchText = `${extractedTopic.title}\n${extractedTopic.new_information}\n${extractedTopic.keywords.slice(0, 8).join(" ")}`
  const queryEmbedding = await generateEmbedding(searchText, {
    userId,
    requestId: meta?.requestId,
    source: "sophia-brain:topic_match_query_embedding",
    operationName: "embedding.topic_match_query",
  })

  const [keywordRes, synthesisRes, titleRes] = await Promise.all([
    supabase.rpc("match_topic_memories_by_keywords", {
      target_user_id: userId,
      query_embedding: queryEmbedding,
      match_threshold: 0.45,
      match_count: 6,
    } as any),
    supabase.rpc("match_topic_memories_by_synthesis", {
      target_user_id: userId,
      query_embedding: queryEmbedding,
      match_threshold: 0.45,
      match_count: 4,
    } as any),
    supabase.rpc("match_topic_memories_by_title", {
      target_user_id: userId,
      query_embedding: queryEmbedding,
      match_threshold: 0.45,
      match_count: 4,
    } as any),
  ])

  const byTopic = new Map<string, {
    topic_id: string
    title: string
    keyword_similarity: number
    synthesis_similarity: number
    title_similarity: number
    last_enriched_at: string | null
  }>()

  for (const r of (Array.isArray(keywordRes.data) ? keywordRes.data : []) as any[]) {
    const id = String(r.topic_id ?? "").trim()
    if (!id) continue
    const prev = byTopic.get(id) ?? {
      topic_id: id,
      title: String(r.title ?? ""),
      keyword_similarity: 0,
      synthesis_similarity: 0,
      title_similarity: 0,
      last_enriched_at: null,
    }
    prev.keyword_similarity = Math.max(prev.keyword_similarity, Number(r.keyword_similarity ?? 0) || 0)
    prev.title = prev.title || String(r.title ?? "")
    prev.last_enriched_at = (r.last_enriched_at ?? prev.last_enriched_at ?? null) as any
    byTopic.set(id, prev)
  }

  for (const r of (Array.isArray(synthesisRes.data) ? synthesisRes.data : []) as any[]) {
    const id = String(r.topic_id ?? "").trim()
    if (!id) continue
    const prev = byTopic.get(id) ?? {
      topic_id: id,
      title: String(r.title ?? ""),
      keyword_similarity: 0,
      synthesis_similarity: 0,
      title_similarity: 0,
      last_enriched_at: null,
    }
    prev.synthesis_similarity = Math.max(prev.synthesis_similarity, Number(r.synthesis_similarity ?? 0) || 0)
    prev.title = prev.title || String(r.title ?? "")
    prev.last_enriched_at = (r.last_enriched_at ?? prev.last_enriched_at ?? null) as any
    byTopic.set(id, prev)
  }

  for (const r of (Array.isArray(titleRes.data) ? titleRes.data : []) as any[]) {
    const id = String(r.topic_id ?? "").trim()
    if (!id) continue
    const prev = byTopic.get(id) ?? {
      topic_id: id,
      title: String(r.title ?? ""),
      keyword_similarity: 0,
      synthesis_similarity: 0,
      title_similarity: 0,
      last_enriched_at: null,
    }
    prev.title_similarity = Math.max(prev.title_similarity, Number(r.title_similarity ?? 0) || 0)
    prev.title = prev.title || String(r.title ?? "")
    prev.last_enriched_at = (r.last_enriched_at ?? prev.last_enriched_at ?? null) as any
    byTopic.set(id, prev)
  }

  if (byTopic.size > 0) {
    const queryTitleTokens = tokens(extractedTopic.title)
    const specificity =
      extractedTopic.keywords.length > 0
        ? extractedTopic.keywords
          .map((k) => keywordSpecificity(k))
          .reduce((a, b) => a + b, 0) / extractedTopic.keywords.length
        : 0.3

    const ranked = [...byTopic.values()]
      .map((c) => {
        const titleLexical = jaccard(queryTitleTokens, tokens(c.title))
        const titleSim = Math.max(titleLexical, c.title_similarity)
        const rec = recencyScore(c.last_enriched_at)
        const fused = 0.45 * c.keyword_similarity + 0.25 * c.synthesis_similarity + 0.20 * titleSim + 0.10 * rec
        return { ...c, title_similarity: titleSim, recency_score: rec, fused_score: fused }
      })
      .sort((a, b) => b.fused_score - a.fused_score)

    const best = ranked[0]
    const keywordStrongEnough = best.keyword_similarity >= KEYWORD_STRONG && specificity >= 0.45
    const synthesisStrongEnough = best.synthesis_similarity >= (SYNTH_STRONG + (specificity < 0.35 ? 0.03 : 0))
    const titleStrongEnough = best.title_similarity >= TITLE_STRONG
    const accept =
      best.fused_score >= MATCH_HIGH ||
      keywordStrongEnough ||
      synthesisStrongEnough ||
      titleStrongEnough

    if (accept) {
      const { data: fullTopic } = await supabase
        .from("user_topic_memories")
        .select("*")
        .eq("id", best.topic_id)
        .eq("status", "active")
        .maybeSingle()

      if (fullTopic) {
        console.log(
          `[TopicMemory] match accepted slug=${extractedTopic.slug} -> topic_id=${best.topic_id} fused=${best.fused_score.toFixed(3)} kw=${best.keyword_similarity.toFixed(3)} syn=${best.synthesis_similarity.toFixed(3)} title=${best.title_similarity.toFixed(3)} spec=${specificity.toFixed(3)} rec=${best.recency_score.toFixed(3)}`,
        )
        return fullTopic as TopicMemory
      }
    }
  }

  return null
}

// ============================================================================
// 3. ENRICHISSEMENT — Mettre à jour la synthèse d'un topic existant
// ============================================================================

/**
 * Enrichit la synthèse d'un topic existant avec de nouvelles informations.
 * Le LLM décide si les nouvelles infos apportent quelque chose de nouveau.
 */
export async function enrichTopicSynthesis(opts: {
  supabase: SupabaseClient
  userId: string
  topic: TopicMemory
  newInformation: string
  newKeywords: string[]
  sourceType?: TopicEnrichmentSource
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<{ enriched: boolean; newSynthesis?: string }> {
  const { supabase, userId, topic, newInformation, newKeywords, meta } = opts
  const sourceType = opts.sourceType ?? "chat"

  const oldSynth = String(topic.synthesis ?? "").trim()
  const newInfo = String(newInformation ?? "").trim()
  if (!newInfo) return { enriched: false }

  // Fast no-op guard (lexical overlap) before costly LLM enrichment.
  const lexSim = jaccard(tokens(oldSynth), tokens(newInfo))
  if (lexSim >= 0.72 || oldSynth.toLowerCase().includes(newInfo.toLowerCase())) {
    const keywordStats = await upsertKeywords({
      supabase,
      userId,
      topicId: topic.id,
      keywords: newKeywords,
      allowReassign: false,
      requestId: meta?.requestId,
    })
    await supabase
      .from("user_topic_memories")
      .update({
        mention_count: (topic.mention_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", topic.id)
    console.log(`[TopicMemory] NOOP (lexical) topic=${topic.slug} lex=${lexSim.toFixed(3)} keywords+${keywordStats.inserted}`)
    return { enriched: false }
  }

  // Semantic no-op guard
  try {
    const infoEmbedding = await generateEmbedding(newInfo, {
      userId,
      requestId: meta?.requestId,
      source: "sophia-brain:topic_enrichment",
      operationName: "embedding.topic_new_information",
    })
    let synthEmbedding = toVector((topic as any)?.synthesis_embedding)
    if (!synthEmbedding && oldSynth.length > 0) {
      synthEmbedding = await generateEmbedding(oldSynth, {
        userId,
        requestId: meta?.requestId,
        source: "sophia-brain:topic_enrichment",
        operationName: "embedding.topic_existing_synthesis",
      })
    }
    if (synthEmbedding && infoEmbedding) {
      const sem = cosineSimilarity(infoEmbedding, synthEmbedding)
      if (sem >= NOOP_SEMANTIC_SIM) {
        const keywordStats = await upsertKeywords({
          supabase,
          userId,
          topicId: topic.id,
          keywords: newKeywords,
          allowReassign: false,
          requestId: meta?.requestId,
        })
        await supabase
          .from("user_topic_memories")
          .update({
            mention_count: (topic.mention_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", topic.id)
        console.log(`[TopicMemory] NOOP (semantic) topic=${topic.slug} sem=${sem.toFixed(3)} keywords+${keywordStats.inserted}`)
        return { enriched: false }
      }
    }
  } catch (e) {
    console.warn(`[TopicMemory] semantic no-op check failed topic=${topic.slug}:`, e)
  }

  const prompt = `
Tu es le gestionnaire de mémoire d'un coach IA.
Tu dois décider si de nouvelles informations enrichissent un topic existant.

TOPIC EXISTANT :
- Titre : "${topic.title}"
- Synthèse actuelle :
"${topic.synthesis}"

NOUVELLES INFORMATIONS :
"${newInformation}"

TES RÈGLES :
1. Si les nouvelles infos sont un doublon ou n'apportent RIEN de nouveau → { "enriched": false }
2. Si les nouvelles infos enrichissent le topic → produis une NOUVELLE SYNTHÈSE qui :
   - Intègre les nouvelles infos DANS la synthèse existante (pas juste concaténer)
   - Maintient une progression chronologique naturelle
   - Respecte l'évolution du vécu au fil du temps (sans inventer de dates)
   - Garde les informations importantes du passé
   - Supprime les redondances
   - Reste dense et factuel (max 5 paragraphes courts)
   - Est écrite à la 3ème personne ("Il/Elle...")
3. Si une info CONTREDIT une info précédente, mets à jour (ex: "Il a repris le cannabis" remplace "Il a arrêté")

JSON ATTENDU :
{ "enriched": true, "new_synthesis": "..." }
ou
{ "enriched": false }
  `.trim()

  try {
    const raw = await generateWithGemini(prompt, "", 0.1, true, [], "json", {
      requestId: meta?.requestId,
      model: meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
      source: "sophia-brain:topic_enrichment",
      forceRealAi: meta?.forceRealAi,
      userId,
    })

    const result = JSON.parse(String(raw ?? "{}"))

    if (!result.enriched) {
      const keywordStats = await upsertKeywords({
        supabase,
        userId,
        topicId: topic.id,
        keywords: newKeywords,
        allowReassign: false,
        requestId: meta?.requestId,
      })
      // Pas d'enrichissement, mais on incrémente le mention_count
      await supabase
        .from("user_topic_memories")
        .update({
          mention_count: (topic.mention_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", topic.id)

      console.log(`[TopicMemory] NOOP (llm) topic=${topic.slug} keywords+${keywordStats.inserted}`)
      return { enriched: false }
    }

    const newSynthesis = String(result.new_synthesis ?? "").trim()
    if (!newSynthesis) return { enriched: false }

    // Mettre à jour le topic
    const synthesisEmbedding = await generateEmbedding(newSynthesis, {
      userId,
      requestId: meta?.requestId,
      source: "sophia-brain:topic_enrichment",
      operationName: "embedding.topic_enriched_synthesis",
    })
    const now = new Date().toISOString()

    // Log l'enrichissement (audit trail)
    await supabase.from("user_topic_enrichment_log").insert({
      user_id: userId,
      topic_id: topic.id,
      enrichment_summary: newInformation.slice(0, 500),
      previous_synthesis: topic.synthesis,
      source_type: sourceType,
    })

    // Mettre à jour le topic
    const baseMetadata = (topic.metadata && typeof topic.metadata === "object")
      ? topic.metadata
      : {}
    const timeline = appendTimelineEvent(
      readTimeline(baseMetadata),
      {
        at: now,
        note: timelineNote(newInformation),
        source: sourceType,
      },
    )
    await supabase
      .from("user_topic_memories")
      .update({
        synthesis: newSynthesis,
        synthesis_embedding: synthesisEmbedding,
        mention_count: (topic.mention_count ?? 0) + 1,
        enrichment_count: (topic.enrichment_count ?? 0) + 1,
        last_enriched_at: now,
        metadata: {
          ...baseMetadata,
          timeline,
        },
        updated_at: now,
      })
      .eq("id", topic.id)

    // Ajouter les nouveaux keywords
    const keywordStats = await upsertKeywords({
      supabase,
      userId,
      topicId: topic.id,
      keywords: newKeywords,
      allowReassign: false,
    })

    console.log(`[TopicMemory] Enriched topic "${topic.title}" (id=${topic.id}) keywords+${keywordStats.inserted}`)
    return { enriched: true, newSynthesis }
  } catch (e) {
    console.error(`[TopicMemory] Failed to enrich topic "${topic.title}":`, e)
    return { enriched: false }
  }
}

// ============================================================================
// 4. CRÉATION — Créer un nouveau topic
// ============================================================================

/**
 * Crée un nouveau topic à partir d'informations extraites.
 */
export async function createTopic(opts: {
  supabase: SupabaseClient
  userId: string
  extractedTopic: ExtractedTopic
  sourceType?: TopicEnrichmentSource
  meta?: { requestId?: string; forceRealAi?: boolean }
}): Promise<TopicMemory | null> {
  const { supabase, userId, extractedTopic, meta } = opts
  const sourceType = opts.sourceType ?? "chat"

  // Générer la synthèse initiale (reformulation à la 3ème personne)
  const prompt = `
Reformule les informations suivantes en une synthèse à la 3ème personne.
Sois dense, factuel, et organise par ordre chronologique si applicable.
1-2 paragraphes maximum. Commence directement par le contenu.

Informations : "${extractedTopic.new_information}"
Sujet : "${extractedTopic.title}"
  `.trim()

  let synthesis: string
  try {
    const raw = await generateWithGemini(prompt, "", 0.1, true, [], "auto", {
      requestId: meta?.requestId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "sophia-brain:topic_initial_synthesis",
      forceRealAi: meta?.forceRealAi,
      userId,
    })
    synthesis = String(raw ?? extractedTopic.new_information).trim()
  } catch {
    synthesis = extractedTopic.new_information
  }

  // Vectoriser la synthèse et le titre
  const [synthesisEmbedding, titleEmbedding] = await Promise.all([
    generateEmbedding(synthesis, {
      userId,
      requestId: meta?.requestId,
      source: "sophia-brain:topic_initial_synthesis",
      operationName: "embedding.topic_initial_synthesis",
    }),
    generateEmbedding(extractedTopic.title, {
      userId,
      requestId: meta?.requestId,
      source: "sophia-brain:topic_initial_synthesis",
      operationName: "embedding.topic_title",
    }),
  ])
  const now = new Date().toISOString()

  const { data: newTopic, error } = await supabase
    .from("user_topic_memories")
    .insert({
      user_id: userId,
      slug: extractedTopic.slug,
      title: extractedTopic.title,
      synthesis,
      synthesis_embedding: synthesisEmbedding,
      title_embedding: titleEmbedding,
      status: "active",
      mention_count: 1,
      enrichment_count: 0,
      first_mentioned_at: now,
      last_enriched_at: now,
      metadata: {
        domain: extractedTopic.domain ?? null,
        source_type: sourceType,
        timeline: [
          {
            at: now,
            note: timelineNote(extractedTopic.new_information),
            source: sourceType,
          },
        ],
      },
    })
    .select("*")
    .single()

  if (error) {
    console.error(`[TopicMemory] Failed to create topic "${extractedTopic.title}":`, error)
    return null
  }

  // Ajouter les keywords
  const keywordStats = await upsertKeywords({
    supabase,
    userId,
    topicId: newTopic.id,
    keywords: extractedTopic.keywords,
    allowReassign: false,
    requestId: meta?.requestId,
  })

  console.log(`[TopicMemory] Created topic "${extractedTopic.title}" keywords+${keywordStats.inserted}`)
  return await maybeAutoMergeNewTopic({
    supabase,
    userId,
    newTopic: newTopic as TopicMemory,
    sourceType,
  })
}

async function maybeAutoMergeNewTopic(opts: {
  supabase: SupabaseClient
  userId: string
  newTopic: TopicMemory
  sourceType: TopicEnrichmentSource
}): Promise<TopicMemory> {
  const { supabase, userId, newTopic, sourceType } = opts

  try {
    const { data: candidates } = await supabase
      .from("user_topic_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("id", newTopic.id)
      .limit(120)

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return newTopic
    }

    const currentSynth = toVector((newTopic as any).synthesis_embedding) ?? await generateEmbedding(newTopic.synthesis, {
      userId,
      source: "sophia-brain:topic_auto_merge",
      operationName: "embedding.topic_auto_merge_synthesis",
    })
    const currentTitle = toVector((newTopic as any).title_embedding) ?? await generateEmbedding(newTopic.title, {
      userId,
      source: "sophia-brain:topic_auto_merge",
      operationName: "embedding.topic_auto_merge_title",
    })
    const currentTitleTokens = tokens(newTopic.title)

    const ranked = candidates
      .map((c: any) => {
        const synth = toVector(c?.synthesis_embedding)
        const title = toVector(c?.title_embedding)
        const synthSim = synth ? cosineSimilarity(currentSynth, synth) : 0
        const titleSim = title ? cosineSimilarity(currentTitle, title) : 0
        const titleLex = jaccard(currentTitleTokens, tokens(String(c?.title ?? "")))
        const score = 0.70 * synthSim + 0.20 * titleSim + 0.10 * titleLex
        return {
          topic: c as TopicMemory,
          synthSim,
          titleSim,
          titleLex,
          score,
        }
      })
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]
    if (!best) return newTopic

    const shouldMerge =
      best.synthSim >= AUTO_MERGE_SYNTH_SIM ||
      (best.titleSim >= AUTO_MERGE_TITLE_SIM && best.titleLex >= AUTO_MERGE_TITLE_JACCARD)

    if (!shouldMerge) {
      return newTopic
    }

    const canonical = best.topic
    const now = new Date().toISOString()
    const { data: duplicateKeywords } = await supabase
      .from("user_topic_keywords")
      .select("keyword")
      .eq("user_id", userId)
      .eq("topic_id", newTopic.id)

    const dupKeywordList = (Array.isArray(duplicateKeywords) ? duplicateKeywords : [])
      .map((r: any) => String(r?.keyword ?? "").trim())
      .filter(Boolean)

    await upsertKeywords({
      supabase,
      userId,
      topicId: canonical.id,
      keywords: dupKeywordList,
      allowReassign: true,
    })

    const mergedSynthesis = mergeSynthesisText(String(canonical.synthesis ?? ""), String(newTopic.synthesis ?? ""))
    const mergedSynthesisEmbedding = await generateEmbedding(mergedSynthesis, {
      userId,
      source: "sophia-brain:topic_auto_merge",
      operationName: "embedding.topic_auto_merge_merged_synthesis",
    })
    const canonicalMetadata = (canonical.metadata && typeof canonical.metadata === "object")
      ? canonical.metadata
      : {}
    const canonicalTimeline = appendTimelineEvent(
      readTimeline(canonicalMetadata),
      {
        at: now,
        note: `Fusion du topic "${newTopic.title}" (${newTopic.slug}) dans "${canonical.title}".`,
        source: "merge",
      },
    )
    const existingMergedFrom = Array.isArray((canonicalMetadata as any).merged_from)
      ? (canonicalMetadata as any).merged_from
      : []
    const mergedFrom = [
      ...existingMergedFrom,
      {
        topic_id: newTopic.id,
        slug: newTopic.slug,
        merged_at: now,
      },
    ]

    await supabase
      .from("user_topic_memories")
      .update({
        synthesis: mergedSynthesis,
        synthesis_embedding: mergedSynthesisEmbedding,
        mention_count: (Number(canonical.mention_count ?? 0) || 0) + (Number(newTopic.mention_count ?? 0) || 0),
        enrichment_count: (Number(canonical.enrichment_count ?? 0) || 0) + (Number(newTopic.enrichment_count ?? 0) || 0),
        last_enriched_at: now,
        metadata: {
          ...canonicalMetadata,
          merged_from: mergedFrom,
          timeline: canonicalTimeline,
        },
        updated_at: now,
      })
      .eq("id", canonical.id)

    const duplicateMetadata = (newTopic.metadata && typeof newTopic.metadata === "object")
      ? newTopic.metadata
      : {}
    const duplicateTimeline = appendTimelineEvent(
      readTimeline(duplicateMetadata),
      {
        at: now,
        note: `Topic fusionné dans "${canonical.title}" (${canonical.slug}).`,
        source: "merge",
      },
    )
    await supabase
      .from("user_topic_memories")
      .update({
        status: "merged",
        metadata: {
          ...duplicateMetadata,
          merged_into: canonical.id,
          merged_at: now,
          timeline: duplicateTimeline,
        },
        updated_at: now,
      })
      .eq("id", newTopic.id)

    await supabase.from("user_topic_enrichment_log").insert({
      user_id: userId,
      topic_id: canonical.id,
      enrichment_summary: `Auto-merge du topic "${newTopic.title}" (${newTopic.slug}) dans "${canonical.title}".`,
      previous_synthesis: canonical.synthesis,
      source_type: sourceType,
    })

    const { data: refreshed } = await supabase
      .from("user_topic_memories")
      .select("*")
      .eq("id", canonical.id)
      .maybeSingle()

    console.log(
      `[TopicMemory] Auto-merged topic "${newTopic.title}" -> "${canonical.title}" (synth=${best.synthSim.toFixed(3)} title=${best.titleSim.toFixed(3)} lexical=${best.titleLex.toFixed(3)})`,
    )
    return (refreshed as TopicMemory) ?? canonical
  } catch (e) {
    console.warn(`[TopicMemory] auto-merge failed for topic=${newTopic.slug}:`, e)
    return newTopic
  }
}

// ============================================================================
// 5. KEYWORDS — Gestion des mots-clés vectorisés
// ============================================================================

/**
 * Ajoute ou met à jour des keywords pour un topic.
 * Par défaut, si un keyword existe déjà sur un autre topic, il est conservé.
 * La réaffectation est possible seulement via allowReassign (ou env flag).
 */
async function upsertKeywords(opts: {
  supabase: SupabaseClient
  userId: string
  topicId: string
  keywords: string[]
  allowReassign?: boolean
  requestId?: string
}): Promise<{ inserted: number; keptExisting: number; reassigned: number }> {
  const { supabase, userId, topicId, keywords } = opts
  const allowReassign = Boolean(opts.allowReassign) || ALLOW_KEYWORD_REASSIGN

  const uniqueKeywords = [...new Set(
    keywords
      .map((k) => normalizeKeyword(k))
      .filter((k) => Boolean(k) && k.length >= 3),
  )]
  const filtered = uniqueKeywords.filter((k) => !isGenericKeyword(k))
  const finalKeywords = (filtered.length > 0 ? filtered : uniqueKeywords)
    .slice(0, MAX_KEYWORDS_PER_TOPIC_UPDATE)

  let inserted = 0
  let keptExisting = 0
  let reassigned = 0

  for (const keyword of finalKeywords) {
    try {
      const { data: existing } = await supabase
        .from("user_topic_keywords")
        .select("id,topic_id")
        .eq("user_id", userId)
        .eq("keyword", keyword)
        .maybeSingle()

      if (!existing) {
        const embedding = await generateEmbedding(keyword, {
          userId,
          requestId: opts.requestId,
          source: "sophia-brain:topic_keyword_embedding",
          operationName: "embedding.topic_keyword",
        })
        const { error: insErr } = await supabase
          .from("user_topic_keywords")
          .insert({
            user_id: userId,
            topic_id: topicId,
            keyword,
            keyword_embedding: embedding,
            source: "llm_extracted",
          } as any)
        if (insErr) throw insErr
        inserted++
        continue
      }

      const existingTopicId = String((existing as any)?.topic_id ?? "")
      if (existingTopicId === topicId) {
        keptExisting++
        continue
      }

      if (!allowReassign) {
        // Anti-drift guard: avoid aggressively moving aliases across topics.
        keptExisting++
        continue
      }

      const embedding = await generateEmbedding(keyword, {
        userId,
        requestId: opts.requestId,
        source: "sophia-brain:topic_keyword_embedding",
        operationName: "embedding.topic_keyword_reassign",
      })
      const { error: updErr } = await supabase
        .from("user_topic_keywords")
        .update({
          topic_id: topicId,
          keyword_embedding: embedding,
          source: "llm_extracted",
        } as any)
        .eq("id", (existing as any).id)
      if (updErr) throw updErr
      reassigned++
    } catch (e) {
      console.warn(`[TopicMemory] Failed to upsert keyword "${keyword}":`, e)
    }
  }

  return { inserted, keptExisting, reassigned }
}

// ============================================================================
// 6. RETRIEVAL — Recherche de topics pertinents pour le contexte
// ============================================================================

/**
 * Recherche les topics pertinents pour un message utilisateur.
 * Combine la recherche par keywords ET par synthèse pour maximiser le recall.
 */
export async function retrieveTopicMemories(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  maxResults?: number
  meta?: { requestId?: string; forceRealAi?: boolean }
}): Promise<TopicSearchResult[]> {
  const { supabase, userId, message, maxResults = 3 } = opts

  const embedding = await generateEmbedding(message, {
    userId,
    requestId: opts.meta?.requestId,
    source: "sophia-brain:topic_retrieve",
    operationName: "embedding.topic_retrieval_query",
  })

  // Recherche parallèle : par keywords, synthèse ET title
  const [kwRaw, synRaw, titleRaw] = await Promise.all([
    supabase.rpc("match_topic_memories_by_keywords", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.55, // Lower threshold for retrieval (more permissive)
      match_count: maxResults + 2,
    } as any),

    supabase.rpc("match_topic_memories_by_synthesis", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.50,
      match_count: maxResults,
    } as any),

    supabase.rpc("match_topic_memories_by_title", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.55,
      match_count: maxResults,
    } as any),
  ])
  const keywordResults = (Array.isArray((kwRaw as any)?.data)
    ? (kwRaw as any).data
    : []) as TopicSearchResult[]
  const synthesisResults = (Array.isArray((synRaw as any)?.data)
    ? (synRaw as any).data
    : []) as TopicSearchResult[]
  const titleResults = (Array.isArray((titleRaw as any)?.data)
    ? (titleRaw as any).data
    : []) as TopicSearchResult[]
  const kwErr = (kwRaw as any)?.error
  const synErr = (synRaw as any)?.error
  const titleErr = (titleRaw as any)?.error
  if (TOPIC_DEBUG && (kwErr || synErr || titleErr)) {
    console.warn("[TopicMemory] retrieval RPC errors (non-blocking)", {
      kw_error: kwErr ? String((kwErr as any)?.message ?? kwErr).slice(0, 200) : null,
      syn_error: synErr ? String((synErr as any)?.message ?? synErr).slice(0, 200) : null,
      title_error: titleErr ? String((titleErr as any)?.message ?? titleErr).slice(0, 200) : null,
    })
  }

  // Dédupliquer et fusionner les résultats (priorité: keywords > synthesis > title)
  const byTopic = new Map<string, TopicSearchResult & {
    keyword_similarity: number
    synthesis_similarity: number
    title_similarity: number
    retrieval_score: number
  }>()

  const upsertRow = (
    row: TopicSearchResult,
    kind: "keyword" | "synthesis" | "title",
  ) => {
    const id = String(row.topic_id ?? "").trim()
    if (!id) return
    const prev = byTopic.get(id) ?? {
      ...row,
      keyword_similarity: 0,
      synthesis_similarity: 0,
      title_similarity: 0,
      retrieval_score: 0,
    }
    if (kind === "keyword") prev.keyword_similarity = Math.max(prev.keyword_similarity, Number(row.keyword_similarity ?? 0) || 0)
    if (kind === "synthesis") prev.synthesis_similarity = Math.max(prev.synthesis_similarity, Number(row.synthesis_similarity ?? 0) || 0)
    if (kind === "title") prev.title_similarity = Math.max(prev.title_similarity, Number(row.title_similarity ?? 0) || 0)
    prev.mention_count = Math.max(Number(prev.mention_count ?? 0) || 0, Number(row.mention_count ?? 0) || 0)
    if (!prev.last_enriched_at && row.last_enriched_at) prev.last_enriched_at = row.last_enriched_at
    byTopic.set(id, prev)
  }

  for (const r of keywordResults) upsertRow(r, "keyword")
  for (const r of synthesisResults) upsertRow(r, "synthesis")
  for (const r of titleResults) upsertRow(r, "title")

  const merged = [...byTopic.values()]
    .map((r) => {
      const rec = recencyScore(r.last_enriched_at)
      const mention = Math.max(0, Number(r.mention_count ?? 0) || 0)
      const mentionBoost = Math.min(1, Math.log1p(mention) / Math.log(10))
      r.retrieval_score =
        0.50 * r.keyword_similarity +
        0.30 * r.synthesis_similarity +
        0.20 * r.title_similarity +
        0.08 * rec +
        0.04 * mentionBoost
      return r
    })
    .sort((a, b) => b.retrieval_score - a.retrieval_score)

  // Mettre à jour last_retrieved_at pour les topics retournés
  const top = merged.slice(0, maxResults)
  // Optional: enrich top topics with latest linear enrichment snippets.
  if (top.length > 0) {
    try {
      const topicIds = top.map((r) => String(r.topic_id)).filter(Boolean)
      if (topicIds.length > 0) {
        const { data: enrichmentRows } = await supabase
          .from("user_topic_enrichment_log")
          .select("topic_id, enrichment_summary, source_type, created_at")
          .eq("user_id", userId)
          .in("topic_id", topicIds)
          .order("created_at", { ascending: false })
          .limit(Math.max(12, topicIds.length * 4))

        const byTopic = new Map<string, Array<{ created_at: string; enrichment_summary: string; source_type?: string | null }>>()
        for (const row of (enrichmentRows ?? []) as any[]) {
          const tid = String(row?.topic_id ?? "").trim()
          if (!tid) continue
          const createdAt = String(row?.created_at ?? "").trim()
          const summary = String(row?.enrichment_summary ?? "").trim()
          if (!createdAt || !summary) continue
          const arr = byTopic.get(tid) ?? []
          if (arr.length >= 3) continue
          arr.push({
            created_at: createdAt,
            enrichment_summary: timelineNote(summary, 220),
            source_type: row?.source_type ? String(row.source_type) : null,
          })
          byTopic.set(tid, arr)
        }

        for (const r of top) {
          const enrichments = byTopic.get(String(r.topic_id)) ?? []
          if (enrichments.length > 0) {
            (r as TopicSearchResult).recent_enrichments = enrichments
          }
        }
      }
    } catch (e) {
      if (TOPIC_DEBUG) {
        console.warn("[TopicMemory] failed to load recent enrichment snippets (non-blocking):", e)
      }
    }
  }
  if (TOPIC_DEBUG) {
    const topDebug = merged.slice(0, Math.max(maxResults, 6)).map((r) => ({
      topic_id: r.topic_id,
      slug: r.slug,
      title: r.title,
      keyword_similarity: Number(r.keyword_similarity.toFixed(3)),
      synthesis_similarity: Number(r.synthesis_similarity.toFixed(3)),
      title_similarity: Number(r.title_similarity.toFixed(3)),
      retrieval_score: Number(r.retrieval_score.toFixed(3)),
      mention_count: Number(r.mention_count ?? 0),
      last_enriched_at: r.last_enriched_at ?? null,
    }))
    console.log(
      JSON.stringify({
        tag: "topic_retrieval_debug",
        user_id: userId,
        message_preview: String(message ?? "").slice(0, 120),
        max_results: maxResults,
        counts: {
          keyword_results: keywordResults.length,
          synthesis_results: synthesisResults.length,
          title_results: titleResults.length,
          merged_results: merged.length,
          selected_results: top.length,
        },
        top: topDebug,
      }),
    )
  }
  const topicIds = top.map((r) => r.topic_id)
  if (topicIds.length > 0) {
    try {
      await supabase
        .from("user_topic_memories")
        .update({ last_retrieved_at: new Date().toISOString() })
        .in("id", topicIds)
    } catch {
      // non-blocking
    }
  }

  return top.map((r) => {
    const { retrieval_score: _ignored, ...rest } = r
    return rest
  })
}

/**
 * Formate les topic memories pour injection dans le prompt du Companion.
 */
export function formatTopicMemoriesForPrompt(topics: TopicSearchResult[]): string {
  if (!topics || topics.length === 0) return ""

  let block = "=== MÉMOIRE THÉMATIQUE (CE QUE TU SAIS DE LUI/ELLE) ===\n"

  for (const topic of topics) {
    const enrichedAt = topic.last_enriched_at
      ? new Date(topic.last_enriched_at).toLocaleDateString("fr-FR")
      : "inconnue"
    const mentions = topic.mention_count ?? 0

    block += `\n📌 ${topic.title} (mentionné ${mentions}x, dernière màj: ${enrichedAt})\n`
    block += `${topic.synthesis}\n`

    const timeline = readTimeline(topic.metadata).slice(-4)
    if (timeline.length > 0) {
      block += "Repères temporels (évolution):\n"
      for (const ev of timeline) {
        block += `- ${formatDateFrDayMonthYear(ev.at)}: ${ev.note}\n`
      }
    }
    const recent = Array.isArray(topic.recent_enrichments)
      ? topic.recent_enrichments.slice(0, 3)
      : []
    if (recent.length > 0) {
      block += "Derniers enrichissements (linéaires):\n"
      for (const e of recent) {
        block += `- ${formatDateFrDayMonthYear(e.created_at)}: ${timelineNote(e.enrichment_summary, 220)}\n`
      }
    }
  }

  block += "\n- Utilise ces informations NATURELLEMENT, sans les exposer.\n"
  block += "- Ne dis pas \"je sais que...\" ou \"dans ta mémoire...\". Juste utilise.\n"
  block += "- Si un topic est pertinent, intègre-le subtilement dans ta réponse.\n\n"

  return block
}

// ============================================================================
// 7. PIPELINE — Orchestration complète (appelé par le Watcher)
// ============================================================================

/**
 * Pipeline complet de traitement des topics après analyse d'un batch.
 * Appelé par le Watcher après l'extraction.
 */
export async function processTopicsFromWatcher(opts: {
  supabase: SupabaseClient
  userId: string
  transcript: string
  currentContext?: string
  sourceType?: TopicEnrichmentSource
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<{ topicsCreated: number; topicsEnriched: number; topicsNoop: number }> {
  const { supabase, userId, transcript, currentContext, meta } = opts
  const sourceType = opts.sourceType ?? "chat"

  // 1. Charger les slugs existants pour le LLM
  const { data: existingTopics } = await supabase
    .from("user_topic_memories")
    .select("slug")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(50)

  const existingTopicSlugs = (existingTopics ?? []).map((t: any) => String(t.slug))

  // 2. Extraire les topics de la conversation
  const extractedTopics = await extractTopicsFromTranscript({
    transcript,
    existingTopicSlugs,
    currentContext,
    userId,
    meta,
  })

  if (extractedTopics.length === 0) {
    console.log("[TopicMemory] No topics extracted from transcript.")
    return { topicsCreated: 0, topicsEnriched: 0, topicsNoop: 0 }
  }

  console.log(`[TopicMemory] Extracted ${extractedTopics.length} topics: ${extractedTopics.map(t => t.slug).join(", ")}`)

  let topicsCreated = 0
  let topicsEnriched = 0
  let topicsNoop = 0

  // 3. Pour chaque topic : gate de persistance, puis enrichir ou créer
  for (const extracted of extractedTopics) {
    try {
      const gate = await shouldPersistTopicMemory({ extractedTopic: extracted, sourceType, userId, meta })
      if (!gate.persist) {
        topicsNoop++
        console.log(
          `[TopicMemory] Rejected slug=${extracted.slug} score=${gate.value_score} reason="${gate.reason.slice(0, 80)}"`,
        )
        continue
      }

      const existingTopic = await findMatchingTopic({
        supabase,
        userId,
        extractedTopic: extracted,
        meta: { requestId: meta?.requestId },
      })

      if (existingTopic) {
        // Enrichir le topic existant
        const result = await enrichTopicSynthesis({
          supabase,
          userId,
          topic: existingTopic,
          newInformation: extracted.new_information,
          newKeywords: extracted.keywords,
          sourceType,
          meta,
        })
        if (result.enriched) topicsEnriched++
        else topicsNoop++
      } else {
        // Créer un nouveau topic
        const created = await createTopic({
          supabase,
          userId,
          extractedTopic: extracted,
          sourceType,
          meta,
        })
        if (created) topicsCreated++
        else topicsNoop++
      }
    } catch (e) {
      console.error(`[TopicMemory] Failed to process topic "${extracted.slug}":`, e)
      topicsNoop++
    }
  }

  console.log(`[TopicMemory] Pipeline done: ${topicsCreated} created, ${topicsEnriched} enriched, ${topicsNoop} noop.`)
  return { topicsCreated, topicsEnriched, topicsNoop }
}

/**
 * Ingestion ciblée des topics à partir des inputs utilisateur d'un plan.
 * Utilise uniquement les champs user-authored stockés dans user_plans.
 */
export async function processTopicsFromPlan(opts: {
  supabase: SupabaseClient
  userId: string
  plan: {
    id?: string
    title?: string | null
    inputs_why?: string | null
    inputs_blockers?: string | null
    recraft_reason?: string | null
    recraft_challenges?: string | null
  }
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<{ topicsCreated: number; topicsEnriched: number; topicsNoop: number }> {
  const { supabase, userId, plan, meta } = opts

  const rows: string[] = []
  const pushIfPresent = (label: string, value?: string | null) => {
    const text = String(value ?? "").trim()
    if (text.length > 0) rows.push(`USER: ${label}: ${text}`)
  }

  pushIfPresent("Mon pourquoi", plan.inputs_why)
  pushIfPresent("Mes blocages", plan.inputs_blockers)
  pushIfPresent("Raison du recraft", plan.recraft_reason)
  pushIfPresent("Difficultés du recraft", plan.recraft_challenges)

  if (rows.length === 0) {
    return { topicsCreated: 0, topicsEnriched: 0, topicsNoop: 0 }
  }

  const transcript = rows.join("\n")
  const currentContext = `Extraction depuis plan${plan.title ? `: ${String(plan.title)}` : ""}${plan.id ? ` (id=${String(plan.id)})` : ""}`

  return await processTopicsFromWatcher({
    supabase,
    userId,
    transcript,
    currentContext,
    sourceType: "plan",
    meta,
  })
}

// ============================================================================
// Helpers
// ============================================================================

/** Normalise un slug (lowercase, underscores, pas de caractères spéciaux) */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9_]/g, "_")     // Replace non-alphanumeric with _
    .replace(/_+/g, "_")             // Collapse multiple _
    .replace(/^_|_$/g, "")           // Trim leading/trailing _
    .slice(0, 80)                    // Max length
}
