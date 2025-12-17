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

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret()
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }
  return data
}

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

        // D. Decide whether to ask permission via template (window closed) or send immediately (window open).
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_opted_in, phone_invalid, whatsapp_last_inbound_at")
          .eq("id", userId)
          .maybeSingle()

        const canWhatsapp = Boolean(profile && profile.whatsapp_opted_in && !profile.phone_invalid)
        const lastInbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
        const in24h = lastInbound != null && Date.now() - lastInbound <= 24 * 60 * 60 * 1000

        if (canWhatsapp && !in24h) {
          // Window closed: send template + create pending action, generate later on "Oui".
          try {
            await callWhatsappSend({
              user_id: userId,
              message: {
                type: "template",
                name: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_NAME") ?? "sophia_memory_echo_v1").trim(),
                language: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_LANG") ?? "fr").trim(),
              },
              purpose: "memory_echo",
              require_opted_in: true,
              force_template: true,
              metadata_extra: { source: "memory_echo", strategy: selectedStrategy },
            })

            await supabaseAdmin.from("whatsapp_pending_actions").insert({
              user_id: userId,
              kind: "memory_echo",
              status: "pending",
              payload: { strategy: selectedStrategy, data: payload },
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })

            triggeredCount++
          } catch (e) {
            // ignore user-level failures
          }
          continue
        }

        // D. Generate the Echo (window open, or WhatsApp not available -> we'll log in-app)
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

        // E. Send via WhatsApp if possible (text if window open, template fallback if closed).
        // Also ensure a DB log with metadata.source='memory_echo' for cooldown tracking.
        let sentViaWhatsapp = false
        try {
          await callWhatsappSend({
            user_id: userId,
            message: { type: "text", body: echoMessage },
            purpose: "memory_echo",
            require_opted_in: true,
            metadata_extra: {
              source: "memory_echo",
              strategy: selectedStrategy,
              ref_id: payload?.id || "old_messages",
            },
          })
          sentViaWhatsapp = true
          triggeredCount++
        } catch (e) {
          const status = (e as any)?.status
          // 429 throttle => skip this user this run
          if (status === 429) continue
          // 409 not opted in / phone invalid => fall back to in-app log
          sentViaWhatsapp = false
        }

        if (!sentViaWhatsapp) {
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

          if (!msgError) triggeredCount++
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

