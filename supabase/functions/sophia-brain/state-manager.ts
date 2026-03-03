import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateEmbedding } from '../_shared/gemini.ts'

export type AgentMode = 
  | 'dispatcher' 
  | 'watcher'
  | 'sentry' 
  | 'investigator' 
  | 'companion'

export interface UserChatState {
  current_mode: AgentMode
  risk_level: number
  investigation_state: any // JSON
  short_term_context: string
  unprocessed_msg_count: number
  last_processed_at: string
  // Free-form JSON used for lightweight, non-critical features (e.g. global parking-lot).
  temp_memory?: any
}

export function normalizeScope(input: unknown, fallback: string): string {
  const raw = (typeof input === "string" ? input : "").trim()
  const s = raw || fallback
  // Keep scopes short + safe for logs/DB.
  // Allowed: letters/digits/._:- (covers "module:week_1", etc)
  const cleaned = s.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 180)
  return cleaned || fallback
}

export async function getUserState(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown = "web",
): Promise<UserChatState> {
  const scope = normalizeScope(scopeRaw, "web")
  const { data, error } = await supabase
    .from('user_chat_states')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', scope)
    .single()

  if (error && error.code === 'PGRST116') {
    // Pas d'état -> On initialise
    const initialState: UserChatState = {
      current_mode: 'companion',
      risk_level: 0,
      investigation_state: null,
      short_term_context: '',
      unprocessed_msg_count: 0,
      last_processed_at: new Date().toISOString(),
      temp_memory: {}
    }
    await supabase.from('user_chat_states').insert({ user_id: userId, scope, ...initialState })
    return initialState
  }

  if (error) throw error
  return data as UserChatState
}

export async function updateUserState(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown,
  updates: Partial<UserChatState>
) {
  const scope = normalizeScope(scopeRaw, "web")
  const { error } = await supabase
    .from('user_chat_states')
    .update(updates)
    .eq('user_id', userId)
    .eq('scope', scope)

  if (error) throw error
}

export async function logMessage(
  supabase: SupabaseClient, 
  userId: string, 
  scopeRaw: unknown,
  role: 'user' | 'assistant' | 'system', 
  content: string, 
  agentUsed?: AgentMode,
  metadata?: Record<string, unknown>
) {
  const scope = normalizeScope(scopeRaw, "web")
  await supabase.from('chat_messages').insert({
    user_id: userId,
    scope,
    role,
    content,
    agent_used: agentUsed
    ,
    metadata: metadata ?? {}
  })
}

export async function getCoreIdentity(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    message?: string
    maxItems?: number
    semanticThreshold?: number
  },
): Promise<string> {
  const maxItems = Math.max(1, Math.min(2, Number(opts?.maxItems ?? 2) || 2))
  const semanticThreshold = Number(opts?.semanticThreshold ?? 0.52)
  const message = String(opts?.message ?? "").trim()

  const formatRows = (rows: Array<{ week_id: string; content: string }>) =>
    rows.map((d) => `[IDENTITÉ PROFONDE - ${d.week_id.toUpperCase()}]\n${d.content}`).join('\n\n')

  if (message.length > 0) {
    try {
      const queryEmbedding = await generateEmbedding(message)
      const { data: matched, error: matchErr } = await supabase.rpc(
        "match_core_identity_by_embedding",
        {
          target_user_id: userId,
          query_embedding: queryEmbedding,
          match_threshold: semanticThreshold,
          match_count: maxItems,
        } as any,
      )

      if (!matchErr && Array.isArray(matched) && matched.length > 0) {
        const rows = matched
          .slice(0, maxItems)
          .map((r: any) => ({
            week_id: String(r.week_id ?? ""),
            content: String(r.content ?? "").trim(),
          }))
          .filter((r) => r.week_id && r.content)
        if (rows.length > 0) return formatRows(rows)
      }
    } catch (e) {
      console.warn("[StateManager] semantic core identity retrieval failed (fallback latest):", e)
    }
  }

  // Fallback: latest identity blocks if no semantic match / missing embeddings
  const { data, error } = await supabase
    .from('user_core_identity')
    .select('week_id, content')
    .eq('user_id', userId)
    .order('last_updated_at', { ascending: false })
    .limit(maxItems)

  if (error || !data || data.length === 0) return ""
  return formatRows((data as any[]).map((d) => ({ week_id: String(d.week_id ?? ""), content: String(d.content ?? "").trim() })))
}

// ============================================================================
// CONTEXT MODULAIRE - Nouvelles fonctions granulaires
// ============================================================================

/**
 * Métadonnées du plan actif (version légère, ~200 tokens)
 */
export interface PlanMetadataResult {
  id: string
  title: string | null
  status: string
  current_phase: number | null
  deep_why: string | null
  inputs_why: string | null
  inputs_blockers: string | null
  recraft_reason: string | null
}

export async function getPlanMetadata(
  supabase: SupabaseClient, 
  userId: string
): Promise<PlanMetadataResult | null> {
  const { data: activePlan } = await supabase
    .from('user_plans')
    .select('id, status, current_phase, title, deep_why, inputs_why, inputs_blockers, recraft_reason')
    .eq('user_id', userId)
    .in('status', ['active', 'in_progress', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return activePlan as PlanMetadataResult | null
}

/**
 * Formate les métadonnées du plan en string pour le prompt (~200 tokens)
 */
export function formatPlanMetadata(plan: PlanMetadataResult | null): string {
  if (!plan) {
    return `=== ÉTAT DU COMPTE ===\n- AUCUN PLAN DE TRANSFORMATION ACTIF.\n- L'utilisateur n'a pas encore fait son questionnaire ou activé un plan.\n`
  }
  
  let ctx = `=== PLAN ACTUEL ===\n`
  ctx += `Titre: ${plan.title || 'Sans titre'}\n`
  ctx += `Statut: ${plan.status || 'unknown'}\n`
  if (plan.current_phase != null) ctx += `Phase: ${plan.current_phase}\n`
  ctx += `Pourquoi (Deep Why): ${plan.deep_why || plan.inputs_why || 'Non défini'}\n`
  if (plan.inputs_blockers) ctx += `Blocages: ${plan.inputs_blockers}\n`
  if (plan.recraft_reason) ctx += `Pivot récent: ${plan.recraft_reason}\n`
  
  return ctx
}

/**
 * JSON complet du plan (lourd - à charger uniquement si nécessaire)
 */
export async function getPlanFullJson(
  supabase: SupabaseClient, 
  planId: string
): Promise<object | null> {
  const { data } = await supabase
    .from('user_plans')
    .select('content')
    .eq('id', planId)
    .maybeSingle()

  return (data as any)?.content ?? null
}

/**
 * Formate le JSON complet du plan pour le prompt
 */
export function formatPlanJson(content: object | null): string {
  if (!content) return ""
  return `DÉTAIL COMPLET DU PLAN (Structure JSON):\n${JSON.stringify(content, null, 2)}\n`
}

/**
 * Résumé des actions (titres + status uniquement, ~100-300 tokens)
 */
export interface ActionSummary {
  title: string
  status: string
  time_of_day?: string
  type: string
}

function isPausedLikeStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? "").toLowerCase().trim()
  return s === "pending" || s === "paused" || s === "inactive" || s === "deactivated"
}

export async function getActionsSummary(
  supabase: SupabaseClient, 
  userId: string, 
  planId: string
): Promise<{ actions: ActionSummary[], frameworks: ActionSummary[] }> {
  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    supabase
      .from('user_actions')
      .select('title, status, time_of_day, type')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'paused', 'inactive', 'deactivated', 'completed']),
    supabase
      .from('user_framework_tracking')
      .select('title, status, type')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'paused', 'inactive', 'deactivated', 'completed']),
  ])

  return {
    actions: (actions ?? []) as ActionSummary[],
    frameworks: (frameworks ?? []) as ActionSummary[],
  }
}

/**
 * Formate le résumé des actions pour le prompt (version légère)
 */
export function formatActionsSummary(
  data: { actions: ActionSummary[], frameworks: ActionSummary[] }
): string {
  const { actions, frameworks } = data
  
  const activeA = actions.filter(a => a.status === 'active')
  const pausedA = actions.filter(a => isPausedLikeStatus(a.status))
  const completedA = actions.filter(a => a.status === 'completed')
  const activeF = frameworks.filter(f => f.status === 'active')
  const pausedF = frameworks.filter(f => isPausedLikeStatus(f.status))
  const completedF = frameworks.filter(f => f.status === 'completed')
  
  const total = activeA.length + pausedA.length + completedA.length + activeF.length + pausedF.length + completedF.length
  if (total === 0) return ""
  
  let ctx = `=== ACTIONS (${activeA.length + activeF.length} actives, ${pausedA.length + pausedF.length} en pause, ${completedA.length + completedF.length} completed) ===\n`
  
  if (activeA.length + activeF.length > 0) {
    ctx += `Actives:\n`
    for (const a of activeA) ctx += `- ${a.title}${a.time_of_day ? ` (${a.time_of_day})` : ''}\n`
    for (const f of activeF) ctx += `- [F] ${f.title}\n`
  }
  
  if (pausedA.length + pausedF.length > 0) {
    ctx += `En pause:\n`
    for (const a of pausedA) ctx += `- ${a.title}${a.time_of_day ? ` (${a.time_of_day})` : ''}\n`
    for (const f of pausedF) ctx += `- [F] ${f.title}\n`
  }

  if (completedA.length + completedF.length > 0) {
    ctx += `Completed (ne pas en parler sauf si l'utilisateur les mentionne):\n`
    for (const a of completedA) ctx += `- ${a.title} [completed]\n`
    for (const f of completedF) ctx += `- [F] ${f.title} [completed]\n`
  }
  
  return ctx
}

export interface DispatcherActionSnapshotItem {
  title: string
  status: "active" | "paused" | "completed" | "other"
  kind: "action" | "framework" | "vital_sign" | "north_star"
  description?: string
}

function normalizeActionText(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokensOf(input: string): string[] {
  return normalizeActionText(input).split(" ").filter(Boolean)
}

function bigramsOf(input: string): string[] {
  const s = normalizeActionText(input).replace(/\s+/g, " ")
  if (s.length < 2) return s ? [s] : []
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter += 1
  const uni = new Set([...sa, ...sb]).size
  return uni > 0 ? inter / uni : 0
}

function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const counts = new Map<string, number>()
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1)
  let inter = 0
  for (const x of b) {
    const n = counts.get(x) ?? 0
    if (n > 0) {
      inter += 1
      counts.set(x, n - 1)
    }
  }
  return (2 * inter) / (a.length + b.length)
}

function levenshtein(a: string, b: string): number {
  const aa = String(a)
  const bb = String(b)
  if (aa === bb) return 0
  if (!aa.length) return bb.length
  if (!bb.length) return aa.length
  const prev = new Array(bb.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= aa.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= bb.length; j++) {
      const tmp = prev[j]
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + cost,
      )
      diag = tmp
    }
  }
  return prev[bb.length]
}

function tokenSimilarity(a: string, b: string): number {
  const aa = normalizeActionText(a)
  const bb = normalizeActionText(b)
  if (!aa || !bb) return 0
  if (aa === bb) return 1
  const dist = levenshtein(aa, bb)
  const denom = Math.max(aa.length, bb.length, 1)
  return Math.max(0, 1 - dist / denom)
}

function fuzzyTokenCoverage(hint: string, candidate: string): number {
  const ht = tokensOf(hint)
  const ct = tokensOf(candidate)
  if (ht.length === 0 || ct.length === 0) return 0
  let covered = 0
  for (const h of ht) {
    let best = 0
    for (const c of ct) best = Math.max(best, tokenSimilarity(h, c))
    if (best >= 0.72) covered += 1
  }
  return covered / ht.length
}

export function scoreActionHintMatch(hint: string, candidateTitle: string): number {
  const h = normalizeActionText(hint)
  const c = normalizeActionText(candidateTitle)
  if (!h || !c) return 0
  if (h === c) return 1

  const tokenScore = jaccard(tokensOf(h), tokensOf(c))
  const fuzzyTokenScore = fuzzyTokenCoverage(h, c)
  const bigramScore = dice(bigramsOf(h), bigramsOf(c))
  const containsScore = h.includes(c) || c.includes(h) ? 1 : 0
  const prefixScore = c.startsWith(h) || h.startsWith(c) ? 1 : 0

  const score =
    0.25 * tokenScore +
    0.3 * fuzzyTokenScore +
    0.25 * bigramScore +
    0.15 * containsScore +
    0.05 * prefixScore
  return Math.max(0, Math.min(1, score))
}

export async function getDispatcherActionSnapshot(
  supabase: SupabaseClient,
  userId: string,
  planId?: string | null,
  maxItems = 20,
): Promise<DispatcherActionSnapshotItem[]> {
  const limit = Math.max(1, Math.min(50, Number(maxItems) || 20))
  const effectivePlanId = String(planId ?? "").trim()
  const planScopedAllowedStatuses = ["active", "pending", "paused", "inactive", "deactivated", "completed"]

  const actionsQuery = supabase
    .from("user_actions")
    .select("title, status, description")
    .eq("user_id", userId)
    .in("status", planScopedAllowedStatuses)
    .limit(limit)
  const frameworksQuery = supabase
    .from("user_framework_tracking")
    .select("title, status, description")
    .eq("user_id", userId)
    .in("status", planScopedAllowedStatuses)
    .limit(limit)
  const actionsPlanScoped = effectivePlanId
    ? actionsQuery.eq("plan_id", effectivePlanId)
    : actionsQuery
  const frameworksPlanScoped = effectivePlanId
    ? frameworksQuery.eq("plan_id", effectivePlanId)
    : frameworksQuery

  const [{ data: actions }, { data: frameworks }, { data: vitalSigns }, { data: northStar }] = await Promise.all([
    actionsPlanScoped,
    frameworksPlanScoped,
    supabase
      .from("user_vital_signs")
      .select("label, status, current_value, unit")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(Math.min(8, limit)),
    supabase
      .from("user_north_stars")
      .select("title, status, metric_type, unit, current_value, target_value")
      .eq("user_id", userId)
      .in("status", ["active", "completed"])
      .order("updated_at", { ascending: false })
      .limit(1),
  ])

  const mapStatus = (s: unknown): DispatcherActionSnapshotItem["status"] => {
    const raw = String(s ?? "").toLowerCase().trim()
    if (raw === "active") return "active"
    if (raw === "completed") return "completed"
    if (isPausedLikeStatus(raw)) return "paused"
    return "other"
  }

  const rows: DispatcherActionSnapshotItem[] = []
  for (const a of (actions ?? []) as any[]) {
    const title = String(a?.title ?? "").trim().slice(0, 120)
    if (!title) continue
    const description = String(a?.description ?? "").trim().slice(0, 180)
    rows.push({
      title,
      status: mapStatus(a?.status),
      kind: "action",
      description: description || undefined,
    })
  }
  for (const f of (frameworks ?? []) as any[]) {
    const title = String(f?.title ?? "").trim().slice(0, 120)
    if (!title) continue
    const description = String(f?.description ?? "").trim().slice(0, 180)
    rows.push({
      title,
      status: mapStatus(f?.status),
      kind: "framework",
      description: description || undefined,
    })
  }
  for (const v of (vitalSigns ?? []) as any[]) {
    const title = String(v?.label ?? "").trim().slice(0, 120)
    if (!title) continue
    const current = String(v?.current_value ?? "").trim()
    const unit = String(v?.unit ?? "").trim()
    const description = `Signe vital: valeur actuelle ${current || "?"}${unit ? ` ${unit}` : ""}`
    rows.push({
      title,
      status: "active",
      kind: "vital_sign",
      description: description.slice(0, 180),
    })
  }
  for (const ns of (northStar ?? []) as any[]) {
    const title = String(ns?.title ?? "").trim().slice(0, 120)
    if (!title) continue
    const metricType = String(ns?.metric_type ?? "").trim()
    const current = String(ns?.current_value ?? "").trim()
    const target = String(ns?.target_value ?? "").trim()
    const unit = String(ns?.unit ?? "").trim()
    const status = String(ns?.status ?? "").toLowerCase().trim() === "completed"
      ? "completed"
      : "active"
    const description =
      `Etoile polaire${metricType ? ` (${metricType})` : ""}: actuel ${current || "?"}${
        unit ? ` ${unit}` : ""
      }, cible ${target || "?"}${unit ? ` ${unit}` : ""}`
    rows.push({
      title,
      status,
      kind: "north_star",
      description: description.slice(0, 180),
    })
  }

  return rows.slice(0, limit)
}

type ActionDetailsLookupResult =
  | {
    status: "matched"
    details: string
    matched_title: string
    confidence: number
  }
  | {
    status: "ambiguous"
    candidates: string[]
    confidence: number
  }
  | {
    status: "not_found"
    confidence: number
  }

function formatSingleActionDetails(row: any, kind: "action" | "framework"): string {
  const title = String(row?.title ?? "Action").trim() || "Action"
  const status = String(row?.status ?? "unknown").trim() || "unknown"
  const description = String(row?.description ?? "").trim()
  const trackingType = String(row?.tracking_type ?? "").trim()
  const timeOfDay = String(row?.time_of_day ?? "").trim()
  const target = String(row?.target ?? "").trim()
  const days = Array.isArray(row?.scheduled_days) ? row.scheduled_days : []
  const type = String(row?.type ?? "").trim()

  let out = "=== ACTION DETAIL CIBLEE ===\n"
  out += `- Type: ${kind === "framework" ? "FRAMEWORK" : "ACTION"}\n`
  out += `- Titre: ${title}\n`
  out += `- Statut: ${status}\n`
  if (type) out += `- Catégorie: ${type}\n`
  if (timeOfDay) out += `- Heure: ${timeOfDay}\n`
  if (days.length > 0) out += `- Jours: ${days.join(", ")}\n`
  if (target) out += `- Cible: ${target}\n`
  if (trackingType) out += `- Tracking: ${trackingType}\n`
  if (description) out += `- Description: ${description.slice(0, 220)}\n`
  out += "- Consigne: reste focalisée sur CETTE action sauf si le user change explicitement.\n"
  return out
}

export async function getActionDetailsByHint(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  hintRaw: string,
): Promise<ActionDetailsLookupResult> {
  const hint = String(hintRaw ?? "").trim()
  if (!hint) return { status: "not_found", confidence: 0 }

  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    supabase
      .from("user_actions")
      .select("title, status, time_of_day, type, tracking_type, description, scheduled_days, is_habit, target")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .in("status", ["active", "pending", "paused", "inactive", "deactivated", "completed"]),
    supabase
      .from("user_framework_tracking")
      .select("title, status, type, tracking_type, description")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .in("status", ["active", "pending", "paused", "inactive", "deactivated", "completed"]),
  ])

  const candidates = [
    ...((actions ?? []) as any[]).map((a) => ({ ...a, __kind: "action" as const })),
    ...((frameworks ?? []) as any[]).map((f) => ({ ...f, __kind: "framework" as const })),
  ].filter((row) => String(row?.title ?? "").trim().length > 0)

  if (candidates.length === 0) return { status: "not_found", confidence: 0 }

  const scored = candidates
    .map((row) => ({
      row,
      score: scoreActionHintMatch(hint, String(row.title ?? "")),
    }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const second = scored[1]
  const topScore = top?.score ?? 0
  const secondScore = second?.score ?? 0

  if (topScore < 0.55) return { status: "not_found", confidence: topScore }

  if (second && topScore - secondScore < 0.08 && secondScore >= 0.58) {
    return {
      status: "ambiguous",
      confidence: topScore,
      candidates: [String(top.row.title), String(second.row.title)].slice(0, 2),
    }
  }

  return {
    status: "matched",
    details: formatSingleActionDetails(top.row, top.row.__kind),
    matched_title: String(top.row.title ?? "").trim(),
    confidence: topScore,
  }
}

/**
 * Détails complets des actions (pour opérations - plus lourd)
 */
export async function getActionsDetails(
  supabase: SupabaseClient, 
  userId: string, 
  planId: string
): Promise<string> {
  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    supabase
      .from('user_actions')
      .select('title, status, time_of_day, type, tracking_type, description, scheduled_days, is_habit, target')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'paused', 'inactive', 'deactivated', 'completed']),
    supabase
      .from('user_framework_tracking')
      .select('title, status, type, tracking_type, description')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'paused', 'inactive', 'deactivated', 'completed']),
  ])

  const activeA = (actions ?? []).filter((a: any) => a.status === 'active')
  const pendingA = (actions ?? []).filter((a: any) => isPausedLikeStatus((a as any)?.status))
  const completedA = (actions ?? []).filter((a: any) => a.status === 'completed')
  const activeF = (frameworks ?? []).filter((f: any) => f.status === 'active')
  const pendingF = (frameworks ?? []).filter((f: any) => isPausedLikeStatus((f as any)?.status))
  const completedF = (frameworks ?? []).filter((f: any) => f.status === 'completed')

  if (activeA.length + pendingA.length + completedA.length + activeF.length + pendingF.length + completedF.length === 0) return ""

  let context = `=== ACTIONS / FRAMEWORKS (ÉTAT RÉEL DB) ===\n`
  context += `RÈGLES IMPORTANTES:\n`
  context += `- Les frameworks comptent comme des actions côté utilisateur.\n`
  context += `- "active" = activée et visible comme active dans l'app. "pending/paused/inactive/deactivated" = désactivée / en pause (réactivable).\n`
  context += `- "completed" = terminée (mission accomplie). NE PAS en parler sauf si l'utilisateur les mentionne.\n`
  context += `- On peut activer/désactiver/supprimer via conversation OU depuis le dashboard.\n\n`

  context += `Actives (${activeA.length + activeF.length}):\n`
  for (const a of activeA) {
    context += `- [ACTION] ${a.title} (${(a as any).time_of_day})`
    if ((a as any).scheduled_days?.length) context += ` - jours: ${(a as any).scheduled_days.join(', ')}`
    if ((a as any).is_habit) context += ` - habitude: ${(a as any).target}×/sem`
    context += `\n`
  }
  for (const f of activeF) context += `- [FRAMEWORK] ${f.title}\n`
  context += `\n`

  if (pendingA.length + pendingF.length > 0) {
    context += `Non actives / en pause (${pendingA.length + pendingF.length}):\n`
    for (const a of pendingA) context += `- [ACTION] ${a.title} (${(a as any).time_of_day})\n`
    for (const f of pendingF) context += `- [FRAMEWORK] ${f.title}\n`
    context += `\n`
  }

  if (completedA.length + completedF.length > 0) {
    context += `Completed (${completedA.length + completedF.length}) — titre uniquement, ne pas en parler sauf si l'utilisateur les mentionne:\n`
    for (const a of completedA) context += `- ${a.title} [completed]\n`
    for (const f of completedF) context += `- ${f.title} [completed]\n`
    context += `\n`
  }

  return context
}

/**
 * Signes vitaux
 */
export async function getVitalSignsContext(
  supabase: SupabaseClient, 
  userId: string
): Promise<string> {
  const { data: vitals } = await supabase
    .from('user_vital_signs')
    .select('label, current_value, unit')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!vitals || vitals.length === 0) return ""

  let context = `=== SIGNES VITAUX ===\n`
  for (const v of vitals) {
    context += `- ${v.label}: ${v.current_value || '?'} ${v.unit || ''}\n`
  }
  return context
}
