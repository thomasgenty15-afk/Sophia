/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { generateWithGemini } from '../_shared/gemini.ts'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"

console.log("Memory Echo: Function initialized")

// Config
const MIN_DAYS_OLD = 30 // Minimum 1 month old memories
const MAX_DAYS_OLD = 180 // Max 6 months
const COOLDOWN_DAYS = 10 // Don't trigger if triggered recently

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Identify users eligible (active recently, but not triggered in last 10 days)
    // We check `user_chat_states` to see last interaction, and maybe a new field `last_memory_echo_at`
    // For now, let's just pick active users and check a log table or metadata.
    // To keep it simple without migration: we'll check chat_messages history for 'memory_echo' source in metadata.

    const { data: activeUsers, error: usersError } = await supabaseAdmin
        .from('chat_messages')
        .select('user_id')
        .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Active in last week
    
    if (usersError) throw usersError
    const userIds = [...new Set(activeUsers.map(u => u.user_id))]

    let triggeredCount = 0

    for (const userId of userIds) {
        // A. Check Cooldown (Has echo been sent in last 10 days?)
        const { data: recentEchoes } = await supabaseAdmin
            .from('chat_messages')
            .select('id')
            .eq('user_id', userId)
            .eq('role', 'assistant')
            .contains('metadata', { source: 'memory_echo' })
            .gt('created_at', new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString())
        
        if (recentEchoes && recentEchoes.length > 0) {
            continue
        }

        // B. STRATEGY 1: STRUCTURAL (Completed Plans)
        // Find plans completed between 1 and 6 months ago
        const { data: completedPlans } = await supabaseAdmin
            .from('user_plans')
            .select('id, title, created_at, completed_at, goal_id')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .gt('completed_at', new Date(Date.now() - MAX_DAYS_OLD * 24 * 60 * 60 * 1000).toISOString())
            .lt('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Completed at least a week ago
            .limit(1)

        let selectedStrategy = null
        let payload = null

        if (completedPlans && completedPlans.length > 0) {
            selectedStrategy = 'structural_victory'
            payload = completedPlans[0]
        } else {
            // C. STRATEGY 2: TIME CAPSULE (Old Fears/Doubts)
            // We search for memories/messages with negative sentiment or specific keywords
            // Ideally we use embeddings, but here we'll use a simple time query + LLM selection
            const { data: oldMessages } = await supabaseAdmin
                .from('chat_messages')
                .select('content, created_at')
                .eq('user_id', userId)
                .eq('role', 'user')
                .gte('created_at', new Date(Date.now() - MAX_DAYS_OLD * 24 * 60 * 60 * 1000).toISOString())
                .lte('created_at', new Date(Date.now() - MIN_DAYS_OLD * 24 * 60 * 60 * 1000).toISOString())
                .limit(20) // Grab a sample
            
            if (oldMessages && oldMessages.length > 0) {
                selectedStrategy = 'time_capsule'
                payload = oldMessages
            }
        }

        if (!selectedStrategy) {
            continue
        }

        // D. Generate the Echo
        const prompt = `
            Tu es "L'Archiviste", une facette de Sophia.
            Ton rôle est de reconnecter l'utilisateur avec son passé pour lui donner de la perspective.
            
            Stratégie choisie : ${selectedStrategy}
            
            Données : ${JSON.stringify(payload)}
            
            Objectif : 
            1. Si "structural_victory" : Célèbre le fait qu'un plan ("${payload?.title}") est terminé depuis un moment. Rappelle le chemin parcouru.
            2. Si "time_capsule" : Analyse les messages fournis. Trouve un doute, une peur ou une question marquante d'il y a quelques mois.
               Demande avec bienveillance : "Je suis retombée sur ce message d'il y a quelques mois... C'est toujours d'actualité ou c'est de l'histoire ancienne ?"
            
            Contrainte :
            - Sois bref, impactant et bienveillant.
            - Cite (ou paraphrase) l'élément du passé pour que l'utilisateur comprenne la référence.
            - Ne sois pas robotique ("J'ai analysé vos données"). Sois naturelle ("Je repensais à un truc...").
        `

        const echoMessage = await generateWithGemini(prompt, "Génère le message d'écho.", 0.7)

        // E. Send Message
        const { error: msgError } = await supabaseAdmin
            .from('chat_messages')
            .insert({
                user_id: userId,
                role: 'assistant',
                content: echoMessage,
                agent_used: 'philosopher', // Or a new 'archivist' agent
                metadata: {
                    source: 'memory_echo',
                    strategy: selectedStrategy,
                    ref_id: payload?.id || 'old_messages'
                }
            })

        if (!msgError) {
            triggeredCount++
        }
    }

    console.log(`[trigger-memory-echo] request_id=${requestId} triggered=${triggeredCount}`)
    return jsonResponse(req, { success: true, triggered: triggeredCount, request_id: requestId }, { includeCors: false })

  } catch (error) {
    console.error(`[trigger-memory-echo] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})

