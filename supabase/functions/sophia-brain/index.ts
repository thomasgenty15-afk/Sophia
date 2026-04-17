import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts"
import { processMessage } from './router.ts'
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"

Deno.serve(async (req) => {
  // Gestion du CORS
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }
  const corsBlock = enforceCors(req)
  if (corsBlock) return corsBlock

  const requestId = getRequestId(req)
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
    const compatibilityMode = (body?.mode ?? "").toString().trim()
    const compatibilityContext = body?.context
    if (!message && compatibilityMode && compatibilityContext && typeof compatibilityContext === 'object') {
      const userPrompt = (compatibilityContext?.userPrompt ?? compatibilityContext?.prompt ?? "").toString().trim()
      message = userPrompt || "Aide-moi à avancer."

      if (!contextOverride) {
        const safeContext = { ...compatibilityContext }
        // Avoid duplicating userPrompt in the context header.
        if ('userPrompt' in safeContext) delete (safeContext as any).userPrompt
        if ('prompt' in safeContext) delete (safeContext as any).prompt
        contextOverride = `CompatibilityMode: ${compatibilityMode}\nCompatibilityContext: ${JSON.stringify(safeContext)}`
      }

      // Older content modes now map to companion in the simplified router.
      if (!forceMode && (compatibilityMode === 'architect_help' || compatibilityMode === 'refine_module')) {
        forceMode = 'companion'
      }
    }
    
    // Auth Check
    const authHeader = (req.headers.get('Authorization') ?? "").trim()
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "missing_authorization" } },
      )
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "invalid_or_expired_jwt" } },
      )
    }
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

    // Extract roadmap context when scope is roadmap_review (sent by RoadmapReview.tsx)
    const roadmapContext = scope === "roadmap_review"
      ? {
          cycleId: typeof body?.cycle_id === "string" ? body.cycle_id : null,
          transformations: Array.isArray(body?.transformations) ? body.transformations : [],
          isFirstOnboarding: Boolean(body?.is_first_onboarding ?? true),
          previousTransformation:
            body?.previous_transformation &&
              typeof body.previous_transformation === "object"
              ? body.previous_transformation
              : null,
        }
      : undefined

    // LE CŒUR DU RÉACTEUR
    const response = await processMessage(
      supabaseClient,
      user.id,
      message,
      history,
      { requestId, channel, scope },
      {
        logMessages: typeof logMessages === "boolean" ? logMessages : undefined,
        forceMode: (forceMode === 'dispatcher' || forceMode === 'sentry' || forceMode === 'investigator' || forceMode === 'companion' || forceMode === 'roadmap_review')
          ? forceMode
          : scope === "roadmap_review"
            ? "roadmap_review"
            : undefined,
        contextOverride: contextOverride ? contextOverride.toString() : undefined,
        messageMetadata: messageMetadata ?? undefined,
        forceOnboardingFlow,
        roadmapContext,
      }
    )

    return jsonResponse(req, response)

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
    return jsonResponse(
      req,
      { error: (error as any)?.message ?? String(error), request_id: requestId },
      { status: 500, skipErrorLog: true },
    )
  }
})
