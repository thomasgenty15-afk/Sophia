import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateEmbedding } from "../_shared/gemini.ts"
import { mergeMemoryProvenanceRefs } from "./memory_provenance.ts"

export type EventTimePrecision =
  | "exact_datetime"
  | "date_only"
  | "relative_time"
  | "approximate"
  | "unknown"

export interface ExtractedEventCandidate {
  event_key: string
  title: string
  summary: string
  event_type: string
  starts_at?: string | null
  ends_at?: string | null
  relevance_until?: string | null
  time_precision?: EventTimePrecision
  confidence?: number
  related_topic_slug?: string | null
  semantic_aliases?: string[]
}

export interface EventMemory {
  id: string
  user_id: string
  event_key: string
  title: string
  summary: string
  event_type: string
  starts_at: string | null
  ends_at: string | null
  relevance_until: string | null
  time_precision: EventTimePrecision
  status: string
  confidence: number
  mention_count: number
  last_confirmed_at: string | null
  last_retrieved_at?: string | null
  metadata: Record<string, unknown>
}

export interface EventSearchResult {
  event_id: string
  event_key: string
  title: string
  summary: string
  event_type: string
  starts_at: string | null
  ends_at: string | null
  relevance_until: string | null
  time_precision: EventTimePrecision
  status: string
  confidence: number
  mention_count: number
  last_confirmed_at: string | null
  metadata: Record<string, unknown>
  event_similarity?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function asIso(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const dt = new Date(raw)
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function compactText(value: unknown, maxLen = 360): string {
  const txt = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!txt) return ""
  return txt.length <= maxLen ? txt : `${txt.slice(0, maxLen - 1).trim()}…`
}

function compactEventKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)
}

function summaryLooksRelative(value: string): boolean {
  return /\b(?:dans\s+(?:\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quelques)\s+(?:minutes?|heures?|jours?|semaines?|mois)|aujourd['’]hui|demain|apr[eè]s-demain|ce\s+soir|cet\s+apr[eè]s-midi|la\s+semaine\s+prochaine|le\s+mois\s+prochain|lundi\s+prochain|mardi\s+prochain|mercredi\s+prochain|jeudi\s+prochain|vendredi\s+prochain|samedi\s+prochain|dimanche\s+prochain)\b/i
    .test(String(value ?? ""))
}

function mergeSummary(existing: string, incoming: string): string {
  const a = compactText(existing, 500)
  const b = compactText(incoming, 500)
  if (!a) return b
  if (!b) return a
  const aRelative = summaryLooksRelative(a)
  const bRelative = summaryLooksRelative(b)
  if (aRelative !== bRelative) return aRelative ? b : a
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  if (al.includes(bl)) return a
  if (bl.includes(al)) return b
  if (b.length >= a.length) return b
  return a
}

function mergeAliases(existing: unknown, incoming: string[] | undefined): string[] {
  const current = Array.isArray(existing) ? existing.map((x) => String(x ?? "").trim()).filter(Boolean) : []
  const next = Array.isArray(incoming) ? incoming.map((x) => String(x ?? "").trim()).filter(Boolean) : []
  return [...new Set([...current, ...next])].slice(0, 12)
}

function temporalDistanceScore(candidateStart: string | null, existingStart: string | null): number {
  if (!candidateStart || !existingStart) return 0.35
  const a = new Date(candidateStart).getTime()
  const b = new Date(existingStart).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0.35
  const diffDays = Math.abs(a - b) / DAY_MS
  if (diffDays <= 1) return 1
  if (diffDays <= 3) return 0.8
  if (diffDays <= 7) return 0.55
  if (diffDays <= 14) return 0.25
  return 0
}

function futureWindowStatus(params: {
  nowIso: string
  startsAt?: string | null
  relevanceUntil?: string | null
  lastConfirmedAt?: string | null
}): "upcoming" | "active" | "recently_past" | "stale" {
  const now = new Date(params.nowIso).getTime()
  const starts = params.startsAt ? new Date(params.startsAt).getTime() : Number.NaN
  const until = params.relevanceUntil ? new Date(params.relevanceUntil).getTime() : Number.NaN
  const lastConfirmed = params.lastConfirmedAt ? new Date(params.lastConfirmedAt).getTime() : Number.NaN

  if (Number.isFinite(until) && now > until) return "stale"
  if (Number.isFinite(starts)) {
    if (now < starts - 2 * 60 * 60 * 1000) return "upcoming"
    if (now <= starts + DAY_MS) return "active"
    if (now <= starts + 3 * DAY_MS) return "recently_past"
  }
  if (!Number.isFinite(starts) && Number.isFinite(lastConfirmed) && (now - lastConfirmed) > 14 * DAY_MS) {
    return "stale"
  }
  if (Number.isFinite(until) && now <= until) return "active"
  return "upcoming"
}

async function refreshEventMemoryStatuses(params: {
  supabase: SupabaseClient
  userId: string
  nowIso: string
}): Promise<void> {
  const { data: rows, error } = await params.supabase
    .from("user_event_memories")
    .select("id,starts_at,relevance_until,last_confirmed_at,status")
    .eq("user_id", params.userId)
    .in("status", ["upcoming", "active", "recently_past"])
    .limit(120)

  if (error || !Array.isArray(rows) || rows.length === 0) return

  for (const row of rows as any[]) {
    const nextStatus = futureWindowStatus({
      nowIso: params.nowIso,
      startsAt: row?.starts_at ? String(row.starts_at) : null,
      relevanceUntil: row?.relevance_until ? String(row.relevance_until) : null,
      lastConfirmedAt: row?.last_confirmed_at ? String(row.last_confirmed_at) : null,
    })
    const currentStatus = String(row?.status ?? "").trim()
    if (nextStatus === currentStatus) continue
    await params.supabase
      .from("user_event_memories")
      .update({
        status: nextStatus,
        updated_at: params.nowIso,
      })
      .eq("id", String(row?.id ?? ""))
  }
}

function deriveRelevanceUntil(params: {
  startsAt?: string | null
  endsAt?: string | null
  timePrecision?: EventTimePrecision | null
  provided?: string | null
}): string | null {
  const provided = asIso(params.provided)
  if (provided) return provided
  const endsAt = asIso(params.endsAt)
  if (endsAt) return endsAt
  const startsAt = asIso(params.startsAt)
  if (!startsAt) return null
  const base = new Date(startsAt).getTime()
  if (!Number.isFinite(base)) return null
  const precision = params.timePrecision ?? "unknown"
  const extraDays =
    precision === "exact_datetime" ? 2 :
    precision === "date_only" ? 3 :
    precision === "relative_time" ? 5 :
    precision === "approximate" ? 7 :
    4
  return new Date(base + extraDays * DAY_MS).toISOString()
}

function bestPrecision(a: EventTimePrecision | null | undefined, b: EventTimePrecision | null | undefined): EventTimePrecision {
  const rank: Record<EventTimePrecision, number> = {
    exact_datetime: 5,
    date_only: 4,
    relative_time: 3,
    approximate: 2,
    unknown: 1,
  }
  const aa = a ?? "unknown"
  const bb = b ?? "unknown"
  return rank[bb] > rank[aa] ? bb : aa
}

function eventEmbeddingText(event: {
  title: string
  summary: string
  event_type: string
  semantic_aliases?: string[]
  related_topic_slug?: string | null
}): string {
  return [
    compactText(event.title, 140),
    compactText(event.summary, 280),
    compactText(event.event_type, 80),
    compactText(event.related_topic_slug ?? "", 80),
    Array.isArray(event.semantic_aliases) ? event.semantic_aliases.join(" ") : "",
  ].filter(Boolean).join("\n")
}

function startsAtLabel(iso: string | null): string {
  if (!iso) return "date floue"
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return "date floue"
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt)
}

async function findExistingEventMemory(params: {
  supabase: SupabaseClient
  userId: string
  candidate: ExtractedEventCandidate
  nowIso: string
  requestId?: string
}): Promise<EventMemory | null> {
  const { supabase, userId, candidate, nowIso } = params
  await refreshEventMemoryStatuses({
    supabase,
    userId,
    nowIso,
  })
  const key = compactEventKey(candidate.event_key)
  const candidateStart = asIso(candidate.starts_at)

  if (key) {
    const { data: keyedRows } = await supabase
      .from("user_event_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("event_key", key)
      .in("status", ["upcoming", "active", "recently_past"])
      .order("starts_at", { ascending: true })
      .limit(8)
    const keyed = Array.isArray(keyedRows) ? keyedRows as EventMemory[] : []
    if (keyed.length > 0) {
      keyed.sort((a, b) => temporalDistanceScore(candidateStart, b.starts_at) - temporalDistanceScore(candidateStart, a.starts_at))
      return keyed[0]
    }
  }

  const queryText = eventEmbeddingText({
    title: candidate.title,
    summary: candidate.summary,
    event_type: candidate.event_type,
    semantic_aliases: candidate.semantic_aliases,
    related_topic_slug: candidate.related_topic_slug,
  })
  const queryEmbedding = await generateEmbedding(queryText, {
    userId,
    requestId: params.requestId,
    source: "sophia-brain:event_match_query",
    operationName: "embedding.event_match_query",
  })

  const { data, error } = await supabase.rpc("match_event_memories", {
    target_user_id: userId,
    query_embedding: queryEmbedding,
    match_threshold: 0.42,
    match_count: 6,
  } as any)
  if (error || !Array.isArray(data) || data.length === 0) return null

  const ranked = (data as EventSearchResult[])
    .map((row) => {
      const sameType = String(row.event_type ?? "").trim() === String(candidate.event_type ?? "").trim() ? 1 : 0
      const exactKey = compactEventKey(row.event_key) && compactEventKey(row.event_key) === key ? 1 : 0
      const temporal = temporalDistanceScore(candidateStart, row.starts_at)
      const sim = clampConfidence(row.event_similarity, 0)
      const fresh = row.last_confirmed_at
        ? Math.max(0, 1 - ((new Date(nowIso).getTime() - new Date(row.last_confirmed_at).getTime()) / (21 * DAY_MS)))
        : 0.2
      const score = 0.42 * sim + 0.24 * temporal + 0.18 * sameType + 0.12 * exactKey + 0.04 * fresh
      return { row, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 0.68) return null

  const { data: fullRow } = await supabase
    .from("user_event_memories")
    .select("*")
    .eq("id", best.row.event_id)
    .maybeSingle()

  return fullRow ? fullRow as EventMemory : null
}

export async function upsertEventMemoryFromCandidate(params: {
  supabase: SupabaseClient
  userId: string
  candidate: ExtractedEventCandidate
  requestId?: string
  nowIso?: string
  sourceMetadata?: Record<string, unknown>
}): Promise<{ created: boolean; updated: boolean; noop: boolean; eventId?: string }> {
  const nowIso = asIso(params.nowIso) ?? new Date().toISOString()
  const candidate: ExtractedEventCandidate = {
    ...params.candidate,
    event_key: compactEventKey(params.candidate.event_key || params.candidate.title),
    title: compactText(params.candidate.title, 140),
    summary: compactText(params.candidate.summary, 420),
    event_type: compactText(params.candidate.event_type || "generic", 60) || "generic",
    starts_at: asIso(params.candidate.starts_at),
    ends_at: asIso(params.candidate.ends_at),
    relevance_until: deriveRelevanceUntil({
      startsAt: params.candidate.starts_at,
      endsAt: params.candidate.ends_at,
      provided: params.candidate.relevance_until,
      timePrecision: params.candidate.time_precision,
    }),
    time_precision: params.candidate.time_precision ?? "unknown",
    confidence: clampConfidence(params.candidate.confidence, 0.65),
    semantic_aliases: Array.isArray(params.candidate.semantic_aliases)
      ? params.candidate.semantic_aliases.map((x) => compactText(x, 80)).filter(Boolean)
      : [],
  }
  if (!candidate.title || !candidate.summary || !candidate.event_key) {
    return { created: false, updated: false, noop: true }
  }

  const existing = await findExistingEventMemory({
    supabase: params.supabase,
    userId: params.userId,
    candidate,
    nowIso,
    requestId: params.requestId,
  })

  const embedding = await generateEmbedding(eventEmbeddingText(candidate), {
    userId: params.userId,
    requestId: params.requestId,
    source: "sophia-brain:event_memory_upsert",
    operationName: "embedding.event_memory",
  })

  if (!existing) {
    const status = futureWindowStatus({
      nowIso,
      startsAt: candidate.starts_at,
      relevanceUntil: candidate.relevance_until,
      lastConfirmedAt: nowIso,
    })
    const { data, error } = await params.supabase
      .from("user_event_memories")
      .insert({
        user_id: params.userId,
        event_key: candidate.event_key,
        title: candidate.title,
        summary: candidate.summary,
        event_type: candidate.event_type,
        starts_at: candidate.starts_at,
        ends_at: candidate.ends_at,
        relevance_until: candidate.relevance_until,
        time_precision: candidate.time_precision,
        status,
        confidence: candidate.confidence,
        mention_count: 1,
        last_confirmed_at: nowIso,
        event_embedding: embedding,
        metadata: {
          related_topic_slug: candidate.related_topic_slug ?? null,
          semantic_aliases: candidate.semantic_aliases ?? [],
          source_refs: mergeMemoryProvenanceRefs([], params.sourceMetadata),
          latest_source_ref: params.sourceMetadata ?? null,
        },
      })
      .select("id")
      .single()
    if (error) throw error
    return { created: true, updated: false, noop: false, eventId: String((data as any)?.id ?? "") }
  }

  const nextStartsAt = candidate.starts_at ?? existing.starts_at
  const nextEndsAt = candidate.ends_at ?? existing.ends_at
  const nextRelevance = deriveRelevanceUntil({
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    provided: candidate.relevance_until ?? existing.relevance_until,
    timePrecision: bestPrecision(existing.time_precision, candidate.time_precision),
  })
  const nextStatus = futureWindowStatus({
    nowIso,
    startsAt: nextStartsAt,
    relevanceUntil: nextRelevance,
    lastConfirmedAt: nowIso,
  })
  const nextSummary = mergeSummary(existing.summary, candidate.summary)
  const nextMetadata = {
    ...(existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
    related_topic_slug: candidate.related_topic_slug ?? (existing.metadata as any)?.related_topic_slug ?? null,
    semantic_aliases: mergeAliases((existing.metadata as any)?.semantic_aliases, candidate.semantic_aliases),
    source_refs: mergeMemoryProvenanceRefs(
      (existing.metadata as any)?.source_refs,
      params.sourceMetadata,
    ),
    latest_source_ref: params.sourceMetadata ?? (existing.metadata as any)?.latest_source_ref ?? null,
  }

  const isNoop =
    nextSummary === String(existing.summary ?? "").trim() &&
    nextStartsAt === existing.starts_at &&
    nextEndsAt === existing.ends_at &&
    nextStatus === existing.status &&
    nextRelevance === existing.relevance_until

  const { error } = await params.supabase
    .from("user_event_memories")
    .update({
      title: candidate.title || existing.title,
      summary: nextSummary,
      event_type: candidate.event_type || existing.event_type,
      starts_at: nextStartsAt,
      ends_at: nextEndsAt,
      relevance_until: nextRelevance,
      time_precision: bestPrecision(existing.time_precision, candidate.time_precision),
      status: nextStatus,
      confidence: Math.max(clampConfidence(existing.confidence, 0.5), candidate.confidence ?? 0.5),
      mention_count: (existing.mention_count ?? 0) + 1,
      last_confirmed_at: nowIso,
      event_embedding: embedding,
      metadata: nextMetadata,
      updated_at: nowIso,
    })
    .eq("id", existing.id)
  if (error) throw error

  return { created: false, updated: !isNoop, noop: isNoop, eventId: existing.id }
}

export async function retrieveEventMemories(params: {
  supabase: SupabaseClient
  userId: string
  message: string
  nowIso?: string
  maxResults?: number
  requestId?: string
}): Promise<EventSearchResult[]> {
  const maxResults = Math.max(1, Math.min(4, Math.floor(params.maxResults ?? 2)))
  const nowIso = asIso(params.nowIso) ?? new Date().toISOString()
  await refreshEventMemoryStatuses({
    supabase: params.supabase,
    userId: params.userId,
    nowIso,
  })
  const queryEmbedding = await generateEmbedding(compactText(params.message, 600), {
    userId: params.userId,
    requestId: params.requestId,
    source: "sophia-brain:event_retrieval",
    operationName: "embedding.event_retrieval_query",
  })

  const { data, error } = await params.supabase.rpc("match_event_memories", {
    target_user_id: params.userId,
    query_embedding: queryEmbedding,
    match_threshold: 0.42,
    match_count: maxResults + 4,
  } as any)
  if (error || !Array.isArray(data) || data.length === 0) return []

  const ranked = (data as EventSearchResult[])
    .map((row) => {
      const similarity = clampConfidence(row.event_similarity, 0)
      const startsAt = asIso(row.starts_at)
      const diffScore = startsAt
        ? (() => {
          const diffDays = Math.abs(new Date(startsAt).getTime() - new Date(nowIso).getTime()) / DAY_MS
          if (diffDays <= 3) return 1
          if (diffDays <= 7) return 0.8
          if (diffDays <= 14) return 0.55
          if (diffDays <= 30) return 0.25
          return 0.05
        })()
        : 0.25
      const statusBoost =
        row.status === "active" ? 1 :
        row.status === "upcoming" ? 0.9 :
        row.status === "recently_past" ? 0.45 :
        0
      const confidence = clampConfidence(row.confidence, 0.5)
      const score = 0.48 * similarity + 0.28 * diffScore + 0.14 * statusBoost + 0.10 * confidence
      return { row, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((x) => x.row)

  const ids = ranked.map((row) => row.event_id).filter(Boolean)
  if (ids.length > 0) {
    await params.supabase
      .from("user_event_memories")
      .update({ last_retrieved_at: nowIso })
      .in("id", ids)
  }

  return ranked
}

export function formatEventMemoriesForPrompt(events: EventSearchResult[]): string {
  if (!Array.isArray(events) || events.length === 0) return ""

  let block = "=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ===\n"
  for (const event of events) {
    block += `\n- ${event.title}`
    block += ` | type=${event.event_type}`
    block += ` | quand=${startsAtLabel(event.starts_at)}`
    block += ` | statut=${event.status}\n`
    block += `${compactText(event.summary, 260)}\n`
  }
  block += "\n- Priorité aux événements imminents ou encore actifs.\n"
  block += "- Le champ 'quand=' ci-dessus est la source de vérité temporelle.\n"
  block += "- Si un résumé contient une vieille formulation relative, ne la reprends pas si elle contredit la date absolue.\n"
  block += "- Si un événement est pertinent, utilise-le naturellement sans citer la mémoire.\n\n"
  return block
}
