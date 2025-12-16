/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"

console.log("Process Checkins: Function initialized")

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch pending checkins that are due
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from('scheduled_checkins')
      .select('id, user_id, draft_message, event_context')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50) // Batch size limit

    if (fetchError) throw fetchError

    if (!checkins || checkins.length === 0) {
      return jsonResponse(req, { message: "No checkins to process", request_id: requestId }, { includeCors: false })
    }

    console.log(`[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`)
    let processedCount = 0

    for (const checkin of checkins) {
      // 2. Insert into chat_messages
      const { error: msgError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: checkin.user_id,
          role: 'assistant',
          content: checkin.draft_message,
          agent_used: 'companion',
          metadata: {
            source: 'scheduled_checkin',
            event_context: checkin.event_context,
            original_checkin_id: checkin.id
          }
        })

      if (msgError) {
        console.error(`[process-checkins] request_id=${requestId} send_failed checkin_id=${checkin.id}`, msgError)
        continue
      }

      // 3. Mark as sent
      const { error: updateError } = await supabaseAdmin
        .from('scheduled_checkins')
        .update({
          status: 'sent',
          processed_at: new Date().toISOString()
        })
        .eq('id', checkin.id)

      if (updateError) {
        console.error(`[process-checkins] request_id=${requestId} mark_sent_failed checkin_id=${checkin.id}`, updateError)
        // Note: This might result in duplicate message if retried, but rare
      } else {
        processedCount++
      }
    }

    return jsonResponse(
      req,
      { success: true, processed: processedCount, request_id: requestId },
      { includeCors: false },
    )

  } catch (error) {
    console.error(`[process-checkins] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})

