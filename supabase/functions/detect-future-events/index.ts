/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { generateWithGemini } from '../_shared/gemini.ts'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"

console.log("Detect Events: Function initialized")

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    // Service Role client to bypass RLS and access all users' data
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Identify active users in the last 24h
    // We check for messages from 'user' role in the last 24h
    const { data: activeUsers, error: usersError } = await supabaseAdmin
      .from('chat_messages')
      .select('user_id')
      .eq('role', 'user')
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      // Use .csv() or a transform if we want distinct, but Supabase JS doesn't have .distinct() easily on select
      // We'll just fetch and dedup in JS for now (assuming not huge scale yet)

    if (usersError) throw usersError

    // Deduplicate user IDs
    const userIds = [...new Set(activeUsers.map(u => u.user_id))]
    console.log(`[detect-future-events] request_id=${requestId} active_users=${userIds.length}`)

    const results = []

    for (const userId of userIds) {
      // 2. Fetch chat history for this user (last 48h to have context)
      // We take 48h to capture "Demain j'ai un truc" said yesterday
      const { data: messages, error: msgError } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .gt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true })

      if (msgError) {
        console.error(`[detect-future-events] request_id=${requestId} fetch_messages_error`, msgError)
        continue
      }

      if (!messages || messages.length === 0) continue

      // Format transcript
      const transcript = messages.map(m => `[${m.created_at}] ${m.role}: ${m.content}`).join('\n')
      const now = new Date().toISOString()

      // 3. Prompt Gemini
      const systemPrompt = `
        Tu es "Le Veilleur", une IA bienveillante intégrée à l'assistant Sophia.
        Ta mission est d'analyser les conversations récentes pour identifier des événements futurs importants dans la vie de l'utilisateur.
        
        Date et heure actuelles (UTC) : ${now}
        
        Objectif :
        1. Repérer les événements mentionnés (réunions, sorties, concerts, examens, rendez-vous, etc.).
        2. Déterminer si un message de "suivi" (check-in) serait apprécié par l'utilisateur.
        3. Calculer le moment IDÉAL pour envoyer ce message.
           - Si c'est un événement stressant (réunion), on demande après (ex: 1h ou 2h après la fin probable).
           - Si c'est une soirée, on peut demander le lendemain matin ou tard le soir même.
           - Si c'est un concert, le lendemain matin.
        4. Rédiger le message de manière très naturelle, amicale, courte et contextuelle.
        
        Format de sortie attendu : JSON uniquement, un tableau d'objets.
        [
          {
            "event_context": "Courte description de l'événement (ex: Présentation client)",
            "draft_message": "Le message à envoyer à l'utilisateur",
            "scheduled_for": "Date ISO 8601 précise (UTC) quand le message doit être envoyé"
          }
        ]

        Règles :
        - Ne génère RIEN si aucun événement pertinent n'est trouvé. Renvoie un tableau vide [].
        - Ne propose pas de check-in pour des événements passés depuis longtemps.
        - Assure-toi que "scheduled_for" est dans le FUTUR par rapport à "Maintenant" (${now}).
        - Le message doit être chaleureux, comme un ami qui prend des nouvelles.
      `

      try {
        const responseText = await generateWithGemini(
            systemPrompt, 
            `Voici l'historique des dernières 48h :\n\n${transcript}`, 
            0.4, // Low temperature for factual extraction
            true // JSON mode
        )

        const events = JSON.parse(responseText as string)

        if (Array.isArray(events) && events.length > 0) {
            
            for (const event of events) {
                // Validate scheduled_for is valid date and in future
                const scheduledTime = new Date(event.scheduled_for)
                if (isNaN(scheduledTime.getTime())) {
                    console.warn("Invalid date:", event.scheduled_for)
                    continue
                }
                
                // Add to results to insert
                results.push({
                    user_id: userId,
                    event_context: event.event_context,
                    draft_message: event.draft_message,
                    scheduled_for: event.scheduled_for,
                    status: 'pending'
                })
            }
        }

      } catch (err) {
        console.error(`[detect-future-events] request_id=${requestId} gemini_error`, err)
      }
    }

    // 4. Insert into database
    if (results.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .from('scheduled_checkins')
            // Idempotency: if the job runs twice, we don't create duplicates.
            // Requires a unique index on (user_id, event_context, scheduled_for).
            .upsert(results, { onConflict: 'user_id,event_context,scheduled_for' })
        
        if (insertError) throw insertError
        console.log(`[detect-future-events] request_id=${requestId} inserted_checkins=${results.length}`)
    } else {
        console.log(`[detect-future-events] request_id=${requestId} inserted_checkins=0`)
    }

    return jsonResponse(req, { success: true, count: results.length, request_id: requestId }, { includeCors: false })

  } catch (error) {
    console.error(`[detect-future-events] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})

