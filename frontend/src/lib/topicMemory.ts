export async function syncPlanTopicMemoryOnValidation(params: {
  supabase: any
  planId?: string | null
  goalId?: string | null
}): Promise<void> {
  const { supabase, planId, goalId } = params
  const normalizedPlanId = String(planId ?? "").trim()
  const normalizedGoalId = String(goalId ?? "").trim()
  if (!normalizedPlanId && !normalizedGoalId) return

  const body: Record<string, string> = {}
  if (normalizedPlanId) body.plan_id = normalizedPlanId
  if (!normalizedPlanId && normalizedGoalId) body.goal_id = normalizedGoalId

  try {
    const { error } = await supabase.functions.invoke("process-plan-topic-memory", { body })
    if (error) {
      console.warn("[topic-memory] plan validation sync failed:", error)
    }
  } catch (e) {
    console.warn("[topic-memory] plan validation sync threw:", e)
  }
}

