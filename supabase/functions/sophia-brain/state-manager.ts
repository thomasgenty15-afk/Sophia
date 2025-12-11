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

