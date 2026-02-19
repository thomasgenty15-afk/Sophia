/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"
import { processTopicsFromPlan } from "../sophia-brain/topic_memory.ts"

type Body = {
  plan_id?: string
  goal_id?: string
}

type PlanRow = {
  id: string
  user_id: string
  goal_id: string | null
  status: string | null
  title: string | null
  inputs_why: string | null
  inputs_blockers: string | null
  recraft_reason: string | null
  recraft_challenges: string | null
}

Deno.serve(async (req) => {
  const ctx = getRequestContext(req)
  if (req.method === "OPTIONS") return handleCorsOptions(req)

  const corsErr = enforceCors(req)
  if (corsErr) return corsErr
  const corsHeaders = getCorsHeaders(req)

  try {
    const authHeader = String(req.headers.get("Authorization") ?? "").trim()
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim()
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim()
    const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim()
    if (!url || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userId = String(authData.user.id)
    const body = await req.json().catch(() => ({} as Body)) as Body
    const planId = String(body.plan_id ?? "").trim()
    const goalId = String(body.goal_id ?? "").trim()

    if (!planId && !goalId) {
      return new Response(JSON.stringify({ error: "Missing plan_id or goal_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const admin = createClient(url, serviceRoleKey)

    let planRow: PlanRow | null = null
    if (planId) {
      const { data } = await admin
        .from("user_plans")
        .select("id,user_id,goal_id,status,title,inputs_why,inputs_blockers,recraft_reason,recraft_challenges")
        .eq("id", planId)
        .eq("user_id", userId)
        .maybeSingle()
      planRow = (data ?? null) as PlanRow | null
    } else {
      const { data } = await admin
        .from("user_plans")
        .select("id,user_id,goal_id,status,title,inputs_why,inputs_blockers,recraft_reason,recraft_challenges")
        .eq("goal_id", goalId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      planRow = (data ?? null) as PlanRow | null
    }

    if (!planRow) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (String(planRow.status ?? "").trim() !== "active") {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: "plan_not_active",
        plan_id: planRow.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const result = await processTopicsFromPlan({
      supabase: admin as any,
      userId,
      plan: {
        id: planRow.id,
        title: planRow.title,
        inputs_why: planRow.inputs_why,
        inputs_blockers: planRow.inputs_blockers,
        recraft_reason: planRow.recraft_reason,
        recraft_challenges: planRow.recraft_challenges,
      },
      meta: {
        requestId: ctx.requestId,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      skipped: false,
      plan_id: planRow.id,
      ...result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error(`[process-plan-topic-memory] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error)
    await logEdgeFunctionError({
      functionName: "process-plan-topic-memory",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    )
  }
})
