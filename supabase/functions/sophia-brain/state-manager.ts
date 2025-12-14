import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type AgentMode = 
  | 'dispatcher' 
  | 'sentry' 
  | 'firefighter' 
  | 'investigator' 
  | 'architect' 
  | 'companion' 
  | 'assistant'

export interface UserChatState {
  current_mode: AgentMode
  risk_level: number
  investigation_state: any // JSON
  short_term_context: string
  unprocessed_msg_count: number
  last_processed_at: string
}

export async function getUserState(supabase: SupabaseClient, userId: string): Promise<UserChatState> {
  const { data, error } = await supabase
    .from('user_chat_states')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code === 'PGRST116') {
    // Pas d'état -> On initialise
    const initialState: UserChatState = {
      current_mode: 'companion',
      risk_level: 0,
      investigation_state: null,
      short_term_context: '',
      unprocessed_msg_count: 0,
      last_processed_at: new Date().toISOString()
    }
    await supabase.from('user_chat_states').insert({ user_id: userId, ...initialState })
    return initialState
  }

  if (error) throw error
  return data as UserChatState
}

export async function updateUserState(supabase: SupabaseClient, userId: string, updates: Partial<UserChatState>) {
  const { error } = await supabase
    .from('user_chat_states')
    .update(updates)
    .eq('user_id', userId)

  if (error) throw error
}

export async function logMessage(
  supabase: SupabaseClient, 
  userId: string, 
  role: 'user' | 'assistant' | 'system', 
  content: string, 
  agentUsed?: AgentMode
) {
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role,
    content,
    agent_used: agentUsed
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
    .select('title, deep_why, inputs_why, inputs_context, inputs_blockers, recraft_reason, content')
    .eq('user_id', userId)
    .in('status', ['active', 'in_progress', 'pending']) // Accepte tous les statuts "vivants"
    .order('created_at', { ascending: false }) // Prend le plus récent si plusieurs
    .limit(1)
    .maybeSingle();

  if (activePlan) {
    context += `=== PLAN ACTUEL (Tableau de Bord) ===\n`;
    context += `Titre: ${activePlan.title || 'Sans titre'}\n`;
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
  }

  // 2. ACTIONS DU JOUR
  const today = new Date().toISOString().split('T')[0];
  const { data: actions } = await supabase
    .from('user_actions')
    .select('title, status, time_of_day')
    .eq('user_id', userId)
    .in('status', ['active', 'pending']); 

  if (actions && actions.length > 0) {
    context += `=== ACTIONS ACTIVES DU PLAN ===\n`;
    actions.forEach(a => {
        // Simple listing pour contexte global
        context += `- ${a.title} (${a.time_of_day})\n`;
    });
    context += `\n`;
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
