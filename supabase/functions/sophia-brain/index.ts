import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { processMessage } from './router.ts'
import { logEdgeFunctionError } from "../_shared/error-log.ts"

Deno.serve(async (req) => {
  // Gestion du CORS
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }
  const corsBlock = enforceCors(req)
  if (corsBlock) return corsBlock

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  let authedUserId: string | null = null

  try {
    const body = await req.json()
    let message = (body?.message ?? body?.content ?? "").toString()
    const clientHistory = Array.isArray(body?.history) ? body.history : []
    let forceMode = (body?.forceMode ?? body?.force_mode) as string | undefined
    let contextOverride = (body?.contextOverride ?? body?.context_override ?? body?.context) as string | undefined
    const logMessages = body?.logMessages ?? body?.log_messages
    const messageMetadata = (body?.messageMetadata ?? body?.message_metadata ?? body?.metadata) as Record<string, unknown> | undefined
    const channel = (body?.channel as ("web" | "whatsapp") | undefined) ?? "web"
    const scope = (body?.scope ?? body?.conversationScope ?? body?.conversation_scope ?? body?.chat_scope) as string | undefined
    const forceOnboardingFlow =
      Boolean(
        body?.forceOnboardingFlow ??
          body?.force_onboarding_flow ??
          body?.debug_force_onboarding_flow ??
          body?.debug?.force_onboarding_flow
      )
    // Backward compatibility: some frontend calls used { mode, context } without { message }.
    // We synthesize a user message and a textual context override, and force the appropriate agent.
    const legacyMode = (body?.mode ?? "").toString().trim()
    const legacyContext = body?.context
    if (!message && legacyMode && legacyContext && typeof legacyContext === 'object') {
      const userPrompt = (legacyContext?.userPrompt ?? legacyContext?.prompt ?? "").toString().trim()
      message = userPrompt || "Aide-moi à avancer."

      if (!contextOverride) {
        const safeContext = { ...legacyContext }
        // Avoid duplicating userPrompt in the context header.
        if ('userPrompt' in safeContext) delete (safeContext as any).userPrompt
        if ('prompt' in safeContext) delete (safeContext as any).prompt
        contextOverride = `LegacyMode: ${legacyMode}\nLegacyContext: ${JSON.stringify(safeContext)}`
      }

      // Force architect for these legacy content modes.
      if (!forceMode && (legacyMode === 'architect_help' || legacyMode === 'refine_module')) {
        forceMode = 'architect'
      }
    }
    
    // Auth Check
    const authHeader = (req.headers.get('Authorization') ?? "").trim()
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')
    authedUserId = user.id

    function sanitizeHistory(raw: any[]): any[] {
      const rows = Array.isArray(raw) ? raw : []
      return rows
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({
          role: m.role,
          content: String(m.content ?? "").slice(0, 1200),
          created_at: (m as any)?.created_at ?? null,
          agent_used: (m as any)?.agent_used ?? null,
        }))
        .slice(-20)
    }

    let history: any[] = []
    try {
      const scopeResolved = (scope ?? (channel === "whatsapp" ? "whatsapp" : "web")).toString()
      const t0 = Date.now()
      const { data: rows } = await supabaseClient
        .from("chat_messages")
        .select("role, content, created_at, agent_used")
        .eq("user_id", user.id)
        .eq("scope", scopeResolved)
        .order("created_at", { ascending: false })
        .limit(20)
      const durationMs = Date.now() - t0
      console.log(JSON.stringify({
        tag: "db_history_load",
        request_id: requestId,
        user_id: user.id,
        scope: scopeResolved,
        rows: Array.isArray(rows) ? rows.length : null,
        duration_ms: durationMs,
      }))
      history = (rows ?? []).slice().reverse().map((r: any) => ({
        role: r.role,
        content: r.content,
        created_at: r.created_at,
        agent_used: r.agent_used,
      }))
    } catch {
      history = sanitizeHistory(clientHistory)
    }

    // LE CŒUR DU RÉACTEUR
    const response = await processMessage(
      supabaseClient,
      user.id,
      message,
      history,
      { requestId, channel, scope },
      {
        logMessages: typeof logMessages === "boolean" ? logMessages : undefined,
        forceMode: (forceMode === 'dispatcher' || forceMode === 'sentry' || forceMode === 'firefighter' || forceMode === 'investigator' || forceMode === 'architect' || forceMode === 'librarian' || forceMode === 'companion' || forceMode === 'assistant')
          ? forceMode
          : undefined,
        contextOverride: contextOverride ? contextOverride.toString() : undefined,
        messageMetadata: messageMetadata ?? undefined,
        forceOnboardingFlow,
      }
    )

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("Error processing message:", error)
    // Best-effort: persist a crash record so Admin Production log can show it.
    // Avoid storing full message/history (PII); keep only small context.
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      error,
      requestId,
      userId: authedUserId,
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    })
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
