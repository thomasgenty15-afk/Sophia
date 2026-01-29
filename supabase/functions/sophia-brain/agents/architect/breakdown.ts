import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { callBreakDownActionEdge } from "../investigator/breakdown.ts"

export function findActionInPlanContent(planContent: any, needle: string): { action: any; phaseIndex: number; actionIndex: number } | null {
  const s = String(needle ?? "").trim().toLowerCase()
  if (!s) return null
  const phases = planContent?.phases
  if (!Array.isArray(phases)) return null
  for (let pIdx = 0; pIdx < phases.length; pIdx++) {
    const p = phases[pIdx]
    const actions = p?.actions
    if (!Array.isArray(actions)) continue
    for (let aIdx = 0; aIdx < actions.length; aIdx++) {
      const a = actions[aIdx]
      const title = String(a?.title ?? "").trim().toLowerCase()
      const id = String(a?.id ?? "").trim().toLowerCase()
      if (!title && !id) continue
      if (id && id === s) return { action: a, phaseIndex: pIdx, actionIndex: aIdx }
      if (title && (title === s || title.includes(s))) return { action: a, phaseIndex: pIdx, actionIndex: aIdx }
    }
  }
  return null
}

function insertActionBeforeInPlanByTitle(planContent: any, targetTitle: string, newAction: any): { updated: any; inserted: boolean } {
  if (!planContent || typeof planContent !== "object") return { updated: planContent, inserted: false }
  const phases = (planContent as any)?.phases
  if (!Array.isArray(phases)) return { updated: planContent, inserted: false }

  const cloned = structuredClone(planContent)
  const phases2 = (cloned as any).phases
  for (const p of phases2) {
    const actions = p?.actions
    if (!Array.isArray(actions)) continue
    const idx = actions.findIndex((a: any) => String(a?.title ?? "").trim() === String(targetTitle ?? "").trim())
    if (idx >= 0) {
      actions.splice(idx, 0, newAction)
      return { updated: cloned, inserted: true }
    }
  }
  return { updated: planContent, inserted: false }
}

export async function handleBreakDownAction(opts: {
  supabase: SupabaseClient
  userId: string
  planRow: { id: string; submission_id: string; content: any }
  args: any
}): Promise<{ text: string; tool_execution: "success" | "failed" | "uncertain" }> {
  const { supabase, userId, planRow, args } = opts
  const problem = String(args?.problem ?? "").trim()
  const applyToPlan = args?.apply_to_plan !== false
  const actionNeedle = String(args?.action_title_or_id ?? "").trim()
  const proposedFromArgs = (args?.proposed_step && typeof args?.proposed_step === "object")
    ? args.proposed_step
    : null

  if (!problem) return { text: "Ok — j’ai besoin d’UNE phrase: qu’est-ce qui bloque exactement ?", tool_execution: "failed" }
  if (!actionNeedle) {
    return { text: "Ok. Quelle action tu veux débloquer exactement ? (donne-moi son titre)", tool_execution: "failed" }
  }

  const found = findActionInPlanContent(planRow.content, actionNeedle)
  if (!found?.action?.title) {
    return { text: `Je ne retrouve pas "${actionNeedle}" dans ton plan actif. Tu peux me redonner le titre exact ?`, tool_execution: "failed" }
  }

  const targetTitle = String(found.action.title)
  const { data: actionRow } = await supabase
    .from("user_actions")
    .select("title, description, tracking_type, time_of_day, target_reps, submission_id")
    .eq("user_id", userId)
    .eq("plan_id", planRow.id)
    .ilike("title", targetTitle)
    .maybeSingle()

  const helpingAction = {
    title: String(actionRow?.title ?? found.action.title),
    description: String(actionRow?.description ?? found.action.description ?? ""),
    tracking_type: String(actionRow?.tracking_type ?? found.action.tracking_type ?? "boolean"),
    time_of_day: String(actionRow?.time_of_day ?? found.action.time_of_day ?? "any_time"),
    targetReps: Number(actionRow?.target_reps ?? found.action.targetReps ?? 1) || 1,
  }

  const proposed = proposedFromArgs?.title
    ? proposedFromArgs
    : await callBreakDownActionEdge({
        action: helpingAction,
        problem,
        plan: planRow.content ?? null,
        submissionId: planRow.submission_id ?? (actionRow as any)?.submission_id ?? null,
      })

  const stepId = String(proposed?.id ?? `act_${Date.now()}`)
  const stepTitle = String(proposed?.title ?? "Micro-étape").trim()
  const stepDesc = String(proposed?.description ?? "").trim()
  const tip = String((proposed as any)?.tips ?? (proposed as any)?.tip ?? "").trim()
  const rawType = String(proposed?.type ?? "mission")

  const newActionJson = {
    id: stepId,
    type: rawType,
    title: stepTitle,
    description: stepDesc || "Micro-étape pour débloquer l'action.",
    questType: "side",
    targetReps: Number(proposed?.targetReps ?? 1) || 1,
    tips: tip,
    rationale: "Micro-étape générée pour débloquer une action.",
    tracking_type: String(proposed?.tracking_type ?? helpingAction.tracking_type ?? "boolean"),
    time_of_day: String(proposed?.time_of_day ?? helpingAction.time_of_day ?? "any_time"),
  }

  if (!applyToPlan) {
    const txt =
      `Ok. Micro-étape (2 min) pour "${targetTitle}":\n` +
      `- ${stepTitle}${stepDesc ? ` — ${stepDesc}` : ""}\n` +
      (tip ? `\nTip: ${tip}` : "") +
      `\n\nTu veux que je l’ajoute à ton plan ?`
    return { text: txt, tool_execution: "uncertain" }
  }

  const { updated, inserted } = insertActionBeforeInPlanByTitle(planRow.content, targetTitle, newActionJson)
  if (inserted) {
    const { error: upErr } = await supabase.from("user_plans").update({ content: updated }).eq("id", planRow.id)
    if (upErr) console.error("[Architect] Failed to update plan content for breakdown:", upErr)
  }

  const trackingType = String(newActionJson.tracking_type ?? "boolean")
  const timeOfDay = String(newActionJson.time_of_day ?? "any_time")
  const targetReps = Number(newActionJson.targetReps ?? 1) || 1
  const dbType = rawType === "habitude" ? "habit" : rawType
  const { error: insErr } = await supabase.from("user_actions").insert({
    user_id: userId,
    plan_id: planRow.id,
    submission_id: planRow.submission_id,
    type: dbType === "framework" ? "mission" : dbType,
    title: stepTitle,
    description: stepDesc || "Micro-étape pour débloquer l'action.",
    target_reps: targetReps,
    current_reps: 0,
    status: "active",
    tracking_type: trackingType,
    time_of_day: timeOfDay,
  })
  if (insErr) {
    console.error("[Architect] Failed to insert breakdown user_action:", insErr)
    return { text: "Je l’ai bien générée, mais j’ai eu un souci technique pour l’ajouter au plan. Retente dans 10s.", tool_execution: "failed" }
  }

  const reply =
    `Ok. Je te mets une micro-étape (2 min) pour débloquer "${targetTitle}":\n` +
    `- ${stepTitle}${stepDesc ? ` — ${stepDesc}` : ""}\n` +
    (tip ? `\nTip: ${tip}` : "") +
    `\n\nTu veux la faire maintenant (oui/non) ?`
  return { text: reply, tool_execution: "success" }
}


