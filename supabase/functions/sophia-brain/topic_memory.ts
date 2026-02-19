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
import { generateWithGemini, generateEmbedding } from "../_shared/gemini.ts"

type TopicEnrichmentSource = "chat" | "onboarding" | "bilan" | "module" | "plan"

const MATCH_HIGH = Number((Deno.env.get("SOPHIA_TOPIC_MATCH_HIGH") ?? "0.72").trim()) || 0.72
const KEYWORD_STRONG = Number((Deno.env.get("SOPHIA_TOPIC_KEYWORD_STRONG") ?? "0.86").trim()) || 0.86
const SYNTH_STRONG = Number((Deno.env.get("SOPHIA_TOPIC_SYNTH_STRONG") ?? "0.84").trim()) || 0.84
const NOOP_SEMANTIC_SIM = Number((Deno.env.get("SOPHIA_TOPIC_NOOP_SEMANTIC_SIM") ?? "0.90").trim()) || 0.90
const MAX_KEYWORDS_PER_TOPIC_UPDATE = Number((Deno.env.get("SOPHIA_TOPIC_MAX_KEYWORDS_PER_UPDATE") ?? "12").trim()) || 12
const ALLOW_KEYWORD_REASSIGN = (Deno.env.get("SOPHIA_TOPIC_ALLOW_KEYWORD_REASSIGN") ?? "").trim() === "1"

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
  status: string
  mention_count: number
  enrichment_count: number
  first_mentioned_at: string
  last_enriched_at: string | null
  last_retrieved_at: string | null
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
  mention_count: number
  last_enriched_at: string | null
  metadata: Record<string, unknown>
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
  meta?: { requestId?: string; model?: string; forceRealAi?: boolean }
}): Promise<ExtractedTopic[]> {
  const { transcript, existingTopicSlugs, currentContext, meta } = opts

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
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:topic_extraction",
      forceRealAi: meta?.forceRealAi,
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
        keywords: Array.isArray(t.keywords)
          ? t.keywords.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean)
          : [],
        domain: t.domain ? String(t.domain).trim().toLowerCase() : undefined,
      }))
  } catch (e) {
    console.error("[TopicMemory] Failed to extract topics:", e)
    return []
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
}): Promise<TopicMemory | null> {
  const { supabase, userId, extractedTopic } = opts

  // 1. Chercher par slug exact (match direct)
  const { data: exactMatch } = await supabase
    .from("user_topic_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("slug", extractedTopic.slug)
    .eq("status", "active")
    .maybeSingle()

  if (exactMatch) return exactMatch as TopicMemory

  // 2) Recherche sémantique + re-ranking fusion
  const searchText = `${extractedTopic.title}\n${extractedTopic.new_information}\n${extractedTopic.keywords.slice(0, 8).join(" ")}`
  const queryEmbedding = await generateEmbedding(searchText)

  const [keywordRes, synthesisRes] = await Promise.all([
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
  ])

  const byTopic = new Map<string, {
    topic_id: string
    keyword_similarity: number
    synthesis_similarity: number
    last_enriched_at: string | null
  }>()

  for (const r of (Array.isArray(keywordRes.data) ? keywordRes.data : []) as any[]) {
    const id = String(r.topic_id ?? "").trim()
    if (!id) continue
    const prev = byTopic.get(id) ?? {
      topic_id: id,
      keyword_similarity: 0,
      synthesis_similarity: 0,
      last_enriched_at: null,
    }
    prev.keyword_similarity = Math.max(prev.keyword_similarity, Number(r.keyword_similarity ?? 0) || 0)
    prev.last_enriched_at = (r.last_enriched_at ?? prev.last_enriched_at ?? null) as any
    byTopic.set(id, prev)
  }

  for (const r of (Array.isArray(synthesisRes.data) ? synthesisRes.data : []) as any[]) {
    const id = String(r.topic_id ?? "").trim()
    if (!id) continue
    const prev = byTopic.get(id) ?? {
      topic_id: id,
      keyword_similarity: 0,
      synthesis_similarity: 0,
      last_enriched_at: null,
    }
    prev.synthesis_similarity = Math.max(prev.synthesis_similarity, Number(r.synthesis_similarity ?? 0) || 0)
    prev.last_enriched_at = (r.last_enriched_at ?? prev.last_enriched_at ?? null) as any
    byTopic.set(id, prev)
  }

  if (byTopic.size > 0) {
    const ranked = [...byTopic.values()]
      .map((c) => {
        const rec = recencyScore(c.last_enriched_at)
        const fused = 0.5 * c.keyword_similarity + 0.3 * c.synthesis_similarity + 0.2 * rec
        return { ...c, recency_score: rec, fused_score: fused }
      })
      .sort((a, b) => b.fused_score - a.fused_score)

    const best = ranked[0]
    const accept =
      best.fused_score >= MATCH_HIGH ||
      best.keyword_similarity >= KEYWORD_STRONG ||
      best.synthesis_similarity >= SYNTH_STRONG

    if (accept) {
      const { data: fullTopic } = await supabase
        .from("user_topic_memories")
        .select("*")
        .eq("id", best.topic_id)
        .eq("status", "active")
        .maybeSingle()

      if (fullTopic) {
        console.log(
          `[TopicMemory] match accepted slug=${extractedTopic.slug} -> topic_id=${best.topic_id} fused=${best.fused_score.toFixed(3)} kw=${best.keyword_similarity.toFixed(3)} syn=${best.synthesis_similarity.toFixed(3)} rec=${best.recency_score.toFixed(3)}`,
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
    const infoEmbedding = await generateEmbedding(newInfo)
    let synthEmbedding = toVector((topic as any)?.synthesis_embedding)
    if (!synthEmbedding && oldSynth.length > 0) {
      synthEmbedding = await generateEmbedding(oldSynth)
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
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:topic_enrichment",
      forceRealAi: meta?.forceRealAi,
    })

    const result = JSON.parse(String(raw ?? "{}"))

    if (!result.enriched) {
      const keywordStats = await upsertKeywords({
        supabase,
        userId,
        topicId: topic.id,
        keywords: newKeywords,
        allowReassign: false,
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
    const synthesisEmbedding = await generateEmbedding(newSynthesis)
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
    await supabase
      .from("user_topic_memories")
      .update({
        synthesis: newSynthesis,
        synthesis_embedding: synthesisEmbedding,
        mention_count: (topic.mention_count ?? 0) + 1,
        enrichment_count: (topic.enrichment_count ?? 0) + 1,
        last_enriched_at: now,
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
      model: "gemini-2.5-flash",
      source: "sophia-brain:topic_initial_synthesis",
      forceRealAi: meta?.forceRealAi,
    })
    synthesis = String(raw ?? extractedTopic.new_information).trim()
  } catch {
    synthesis = extractedTopic.new_information
  }

  // Vectoriser la synthèse
  const synthesisEmbedding = await generateEmbedding(synthesis)
  const now = new Date().toISOString()

  const { data: newTopic, error } = await supabase
    .from("user_topic_memories")
    .insert({
      user_id: userId,
      slug: extractedTopic.slug,
      title: extractedTopic.title,
      synthesis,
      synthesis_embedding: synthesisEmbedding,
      status: "active",
      mention_count: 1,
      enrichment_count: 0,
      first_mentioned_at: now,
      last_enriched_at: now,
      metadata: {
        domain: extractedTopic.domain ?? null,
        source_type: sourceType,
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
  })

  console.log(`[TopicMemory] Created topic "${extractedTopic.title}" keywords+${keywordStats.inserted}`)
  return newTopic as TopicMemory
}

// ============================================================================
// 5. KEYWORDS — Gestion des mots-clés vectorisés
// ============================================================================

/**
 * Ajoute ou met à jour des keywords pour un topic.
 * Si un keyword existe déjà pour un AUTRE topic, il est réaffecté.
 */
async function upsertKeywords(opts: {
  supabase: SupabaseClient
  userId: string
  topicId: string
  keywords: string[]
  allowReassign?: boolean
}): Promise<{ inserted: number; keptExisting: number; reassigned: number }> {
  const { supabase, userId, topicId, keywords } = opts
  const allowReassign = Boolean(opts.allowReassign) || ALLOW_KEYWORD_REASSIGN

  const uniqueKeywords = [...new Set(
    keywords
      .map((k) => k.trim().toLowerCase())
      .filter((k) => Boolean(k) && k.length >= 3),
  )].slice(0, MAX_KEYWORDS_PER_TOPIC_UPDATE)

  let inserted = 0
  let keptExisting = 0
  let reassigned = 0

  for (const keyword of uniqueKeywords) {
    try {
      const { data: existing } = await supabase
        .from("user_topic_keywords")
        .select("id,topic_id")
        .eq("user_id", userId)
        .eq("keyword", keyword)
        .maybeSingle()

      if (!existing) {
        const embedding = await generateEmbedding(keyword)
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

      const embedding = await generateEmbedding(keyword)
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

  const embedding = await generateEmbedding(message)

  // Recherche parallèle : par keywords ET par synthèse
  const [keywordResults, synthesisResults] = await Promise.all([
    supabase.rpc("match_topic_memories_by_keywords", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.55, // Lower threshold for retrieval (more permissive)
      match_count: maxResults + 2,
    } as any).then((r: any) => (Array.isArray(r.data) ? r.data : []) as TopicSearchResult[]),

    supabase.rpc("match_topic_memories_by_synthesis", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.50,
      match_count: maxResults,
    } as any).then((r: any) => (Array.isArray(r.data) ? r.data : []) as TopicSearchResult[]),
  ])

  // Dédupliquer et fusionner les résultats
  const seenIds = new Set<string>()
  const merged: TopicSearchResult[] = []

  // Priorité aux keyword matches (plus précis)
  for (const r of keywordResults) {
    if (!seenIds.has(r.topic_id)) {
      seenIds.add(r.topic_id)
      merged.push(r)
    }
  }

  // Ajouter les synthesis matches manquants
  for (const r of synthesisResults) {
    if (!seenIds.has(r.topic_id)) {
      seenIds.add(r.topic_id)
      merged.push(r)
    }
  }

  // Mettre à jour last_retrieved_at pour les topics retournés
  const topicIds = merged.slice(0, maxResults).map(r => r.topic_id)
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

  return merged.slice(0, maxResults)
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

  // 3. Pour chaque topic : enrichir ou créer
  for (const extracted of extractedTopics) {
    try {
      const existingTopic = await findMatchingTopic({
        supabase,
        userId,
        extractedTopic: extracted,
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
