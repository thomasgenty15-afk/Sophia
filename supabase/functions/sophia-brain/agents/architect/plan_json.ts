import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export async function injectActionIntoPlanJson(
  supabase: SupabaseClient,
  planId: string,
  newAction: any,
): Promise<"success" | "duplicate" | "error"> {
  const { data: fullPlan, error: fullPlanError } = await supabase
    .from("user_plans")
    .select("content, current_phase")
    .eq("id", planId)
    .single()

  if (fullPlanError || !fullPlan || !fullPlan.content) {
    console.error("[Architect] ❌ Error fetching full plan JSON:", fullPlanError)
    return "error"
  }

  const currentPhaseIndex = (fullPlan.current_phase || 1) - 1
  const phases = fullPlan.content.phases || []

  if (!phases[currentPhaseIndex]) {
    console.error(`[Architect] ❌ Phase index ${currentPhaseIndex} not found.`)
    return "error"
  }

  const existingActions = phases[currentPhaseIndex].actions || []
  const isDuplicate = existingActions.some((a: any) =>
    a.title.trim().toLowerCase() === newAction.title.trim().toLowerCase()
  )

  if (isDuplicate) {
    console.warn(`[Architect] ⚠️ Duplicate action detected: "${newAction.title}"`)
    return "duplicate"
  }

  console.log(`[Architect] Injecting into Phase ${currentPhaseIndex + 1}: ${phases[currentPhaseIndex].title}`)

  if (!phases[currentPhaseIndex].actions) phases[currentPhaseIndex].actions = []
  phases[currentPhaseIndex].actions.push(newAction)

  const { error: updateError } = await supabase
    .from("user_plans")
    .update({ content: fullPlan.content })
    .eq("id", planId)

  if (updateError) {
    console.error("[Architect] ❌ Error updating plan JSON:", updateError)
    return "error"
  }

  console.log(`[Architect] ✅ Plan JSON updated successfully.`)
  return "success"
}

export function planJsonHasAction(planContent: any, match: { id?: string; title?: string }): boolean {
  const phases = planContent?.phases
  if (!Array.isArray(phases)) return false
  const idNeedle = (match.id ?? "").trim()
  const titleNeedle = (match.title ?? "").trim().toLowerCase()
  for (const p of phases) {
    const actions = p?.actions
    if (!Array.isArray(actions)) continue
    for (const a of actions) {
      if (idNeedle && String(a?.id ?? "") === idNeedle) return true
      if (titleNeedle && String(a?.title ?? "").trim().toLowerCase() === titleNeedle) return true
    }
  }
  return false
}

export async function verifyActionCreated(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  expected: { title: string; actionId: string },
): Promise<{ db_ok: boolean; json_ok: boolean; db_row_id?: string | null }> {
  const title = String(expected.title ?? "").trim()
  const actionId = String(expected.actionId ?? "").trim()
  if (!title) return { db_ok: false, json_ok: false, db_row_id: null }

  const [{ data: dbRow }, { data: planRow }] = await Promise.all([
    supabase
      .from("user_actions")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .ilike("title", title)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_plans")
      .select("content")
      .eq("id", planId)
      .maybeSingle(),
  ])

  const dbOk = Boolean(dbRow?.id)
  const jsonOk = Boolean(planRow?.content && planJsonHasAction((planRow as any).content, { id: actionId, title }))
  return { db_ok: dbOk, json_ok: jsonOk, db_row_id: (dbRow as any)?.id ?? null }
}


