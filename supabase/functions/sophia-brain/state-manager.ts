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
  return data.map(d => `[IDENTITÉ PROFONDE - ${d.week_id.toUpperCase()}]\n${d.content}`).join('\n\n')
}

export async function getDashboardContext(supabase: SupabaseClient, userId: string): Promise<string> {
  let context = "";

  // 1. ACTIVE PLAN
  const { data: activePlan } = await supabase
    .from('user_plans')
    .select('id, status, current_phase, title, deep_why, inputs_why, inputs_context, inputs_blockers, recraft_reason, content')
    .eq('user_id', userId)
    .in('status', ['active', 'in_progress', 'pending']) // Accepte tous les statuts "vivants"
    .order('created_at', { ascending: false }) // Prend le plus récent si plusieurs
    .limit(1)
    .maybeSingle();

  if (activePlan) {
    context += `=== PLAN ACTUEL (Tableau de Bord) ===\n`;
    context += `Titre: ${activePlan.title || 'Sans titre'}\n`;
    context += `Statut: ${activePlan.status || 'unknown'}\n`;
    if (activePlan.current_phase != null) context += `Phase courante (dashboard): ${activePlan.current_phase}\n`;
    context += `Pourquoi (Deep Why): ${activePlan.deep_why || activePlan.inputs_why}\n`;
    
    if (activePlan.inputs_context) context += `Contexte Initial: ${activePlan.inputs_context}\n`;
    if (activePlan.inputs_blockers) context += `Blocages identifiés: ${activePlan.inputs_blockers}\n`;
    if (activePlan.recraft_reason) context += `Pivot récent: ${activePlan.recraft_reason}\n`;

    // Injection intelligente du JSON Content
    if (activePlan.content) {
        context += `DÉTAIL COMPLET DU PLAN (Structure JSON) :\n`;
        // On envoie TOUT le contenu pour que l'IA ait une vision parfaite
        context += JSON.stringify(activePlan.content, null, 2);
    }
    context += `\n`;
  } else {
    context += `=== ÉTAT DU COMPTE ===\n`;
    context += `- AUCUN PLAN DE TRANSFORMATION ACTIF.\n`;
    context += `- L'utilisateur n'a pas encore fait son questionnaire ou activé un plan.\n\n`;
  }

  // 2. ACTIONS / FRAMEWORKS (live DB state)
  // Important: frameworks are also "actions" in the user experience, but are stored separately in DB.
  // Also: "active" vs "pending" must be taken from DB (dashboard is the only activation surface).
  const planId = (activePlan as any)?.id as string | undefined
  if (planId) {
    const [{ data: actions }, { data: frameworks }] = await Promise.all([
      supabase
        .from('user_actions')
        .select('title, status, time_of_day, type, tracking_type')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .in('status', ['active', 'pending']),
      supabase
        .from('user_framework_tracking')
        .select('title, status, type, tracking_type')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .in('status', ['active', 'pending']),
    ])

    const activeA = (actions ?? []).filter((a: any) => a.status === 'active')
    const pendingA = (actions ?? []).filter((a: any) => a.status === 'pending')
    const activeF = (frameworks ?? []).filter((f: any) => f.status === 'active')
    const pendingF = (frameworks ?? []).filter((f: any) => f.status === 'pending')

    if (activeA.length + pendingA.length + activeF.length + pendingF.length > 0) {
      context += `=== ACTIONS / FRAMEWORKS (ÉTAT RÉEL DB) ===\n`
      context += `RÈGLES IMPORTANTES:\n`
      context += `- Les frameworks comptent comme des actions côté utilisateur.\n`
      context += `- "active" = activée et visible comme active dans l'app. "pending" = pas active.\n`
      context += `- On n'active/désactive pas via WhatsApp: la seule manière d'activer/désactiver, c'est depuis le dashboard.\n\n`

      context += `Actives (${activeA.length + activeF.length}):\n`
      for (const a of activeA) context += `- [ACTION] ${a.title} (${a.time_of_day})\n`
      for (const f of activeF) context += `- [FRAMEWORK] ${f.title}\n`
      context += `\n`

      if (pendingA.length + pendingF.length > 0) {
        context += `Non actives / pending (${pendingA.length + pendingF.length}):\n`
        for (const a of pendingA) context += `- [ACTION] ${a.title} (${a.time_of_day})\n`
        for (const f of pendingF) context += `- [FRAMEWORK] ${f.title}\n`
        context += `\n`
      }
    }
  }

  // 3. VITAL SIGNS (Derniers relevés)
  // On récupère aussi le nom du vital sign via une jointure si possible, sinon on fera avec l'ID
  const { data: vitals } = await supabase
    .from('user_vital_signs')
    .select('label, current_value, unit')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (vitals && vitals.length > 0) {
      context += `=== SIGNES VITAUX (État Actuel) ===\n`;
      vitals.forEach(v => {
          context += `- ${v.label}: ${v.current_value || '?'} ${v.unit || ''}\n`;
      });
  }

  return context;
}
