import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type AgentMode = 
  | 'dispatcher' 
  | 'watcher'
  | 'sentry' 
  | 'firefighter' 
  | 'investigator' 
  | 'architect' 
  | 'librarian'
  | 'companion' 
  | 'assistant'

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

export async function getCoreIdentity(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_core_identity')
    .select('week_id, content')
    .eq('user_id', userId)
    .order('week_id', { ascending: true })

  if (error || !data || data.length === 0) return ""

  // Formatter : "AXE [week_id] : [content]"
  return data.map((d: { week_id: string; content: string }) => `[IDENTITÉ PROFONDE - ${d.week_id.toUpperCase()}]\n${d.content}`).join('\n\n')
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
  inputs_context: string | null
  inputs_blockers: string | null
  recraft_reason: string | null
}

export async function getPlanMetadata(
  supabase: SupabaseClient, 
  userId: string
): Promise<PlanMetadataResult | null> {
  const { data: activePlan } = await supabase
    .from('user_plans')
    .select('id, status, current_phase, title, deep_why, inputs_why, inputs_context, inputs_blockers, recraft_reason')
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
  if (plan.inputs_context) ctx += `Contexte: ${plan.inputs_context}\n`
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
      .in('status', ['active', 'pending', 'completed']),
    supabase
      .from('user_framework_tracking')
      .select('title, status, type')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'completed']),
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
  const pendingA = actions.filter(a => a.status === 'pending')
  const completedA = actions.filter(a => a.status === 'completed')
  const activeF = frameworks.filter(f => f.status === 'active')
  const pendingF = frameworks.filter(f => f.status === 'pending')
  const completedF = frameworks.filter(f => f.status === 'completed')
  
  const total = activeA.length + pendingA.length + completedA.length + activeF.length + pendingF.length + completedF.length
  if (total === 0) return ""
  
  let ctx = `=== ACTIONS (${activeA.length + activeF.length} actives, ${pendingA.length + pendingF.length} pending, ${completedA.length + completedF.length} completed) ===\n`
  
  if (activeA.length + activeF.length > 0) {
    ctx += `Actives:\n`
    for (const a of activeA) ctx += `- ${a.title}${a.time_of_day ? ` (${a.time_of_day})` : ''}\n`
    for (const f of activeF) ctx += `- [F] ${f.title}\n`
  }
  
  if (pendingA.length + pendingF.length > 0) {
    ctx += `Pending:\n`
    for (const a of pendingA) ctx += `- ${a.title}${a.time_of_day ? ` (${a.time_of_day})` : ''}\n`
    for (const f of pendingF) ctx += `- [F] ${f.title}\n`
  }

  if (completedA.length + completedF.length > 0) {
    ctx += `Completed (ne pas en parler sauf si l'utilisateur les mentionne):\n`
    for (const a of completedA) ctx += `- ${a.title} [completed]\n`
    for (const f of completedF) ctx += `- [F] ${f.title} [completed]\n`
  }
  
  return ctx
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
      .in('status', ['active', 'pending', 'completed']),
    supabase
      .from('user_framework_tracking')
      .select('title, status, type, tracking_type, description')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .in('status', ['active', 'pending', 'completed']),
  ])

  const activeA = (actions ?? []).filter((a: any) => a.status === 'active')
  const pendingA = (actions ?? []).filter((a: any) => a.status === 'pending')
  const completedA = (actions ?? []).filter((a: any) => a.status === 'completed')
  const activeF = (frameworks ?? []).filter((f: any) => f.status === 'active')
  const pendingF = (frameworks ?? []).filter((f: any) => f.status === 'pending')
  const completedF = (frameworks ?? []).filter((f: any) => f.status === 'completed')

  if (activeA.length + pendingA.length + completedA.length + activeF.length + pendingF.length + completedF.length === 0) return ""

  let context = `=== ACTIONS / FRAMEWORKS (ÉTAT RÉEL DB) ===\n`
  context += `RÈGLES IMPORTANTES:\n`
  context += `- Les frameworks comptent comme des actions côté utilisateur.\n`
  context += `- "active" = activée et visible comme active dans l'app. "pending" = désactivée / en attente (réactivable).\n`
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
    context += `Non actives / pending (${pendingA.length + pendingF.length}):\n`
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
