import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { formatDaysFrench } from "./dates.ts"

export async function handleUpdateAction(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  args: any,
): Promise<string> {
  console.log(`[Architect] 🛠️ handleUpdateAction called with args:`, JSON.stringify(args))

  const { target_name, new_title, new_description, new_target_reps, new_scheduled_days, new_time_of_day } = args
  const searchTerm = target_name.trim().toLowerCase()

  // 1. Récupérer le plan JSON
  console.log(`[Architect] Fetching plan ${planId}...`)
  const { data: fullPlan, error: fullPlanError } = await supabase
    .from("user_plans")
    .select("content")
    .eq("id", planId)
    .single()

  if (fullPlanError || !fullPlan || !fullPlan.content) {
    console.error("[Architect] ❌ Error fetching plan:", fullPlanError)
    return "Erreur technique : Impossible de lire le plan."
  }

  // 2. Trouver l'action dans le JSON
  let actionFound = false
  let oldTitle = ""
  let isFramework = false
  let matchedAction: any = null

  console.log(`[Architect] Searching for action matching "${searchTerm}" in JSON plan...`)

  const phases = fullPlan.content.phases || []
  for (const phase of phases) {
    if (phase.actions) {
      for (const action of phase.actions) {
        const actionTitle = action.title.trim().toLowerCase()
        if (actionTitle.includes(searchTerm) || searchTerm.includes(actionTitle)) {
          console.log(`[Architect] ✅ Match found! Action ID: ${action.id}, Title: "${action.title}"`)
          actionFound = true
          oldTitle = action.title
          if (action.type === "framework") isFramework = true
          matchedAction = action
          break
        }
      }
    }
    if (actionFound) break
  }

  if (!actionFound) {
    console.warn(`[Architect] ⚠️ No action matched "${searchTerm}" in the plan.`)
    return `Je ne trouve pas l'action "${target_name}" dans ton plan.`
  }

  // Validation habitude: si on réduit la fréquence en dessous du nombre de jours planifiés,
  // on demande explicitement quel jour retirer (sans appliquer la modif).
  if (new_target_reps !== undefined || Array.isArray(new_scheduled_days)) {
    try {
      const { data: row } = await supabase
        .from("user_actions")
        .select("type, title, target_reps, scheduled_days")
        .eq("plan_id", planId)
        .ilike("title", oldTitle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (row && String((row as any).type ?? "") === "habit") {
        const existingDaysSql = Array.isArray((row as any).scheduled_days) ? ((row as any).scheduled_days as string[]) : []
        const existingDaysJson = Array.isArray((matchedAction as any)?.scheduledDays) ? (((matchedAction as any).scheduledDays as string[])) : []
        const baseDays = existingDaysJson.length > 0 ? existingDaysJson : existingDaysSql
        const candidateDays = Array.isArray(new_scheduled_days) ? (new_scheduled_days as string[]) : baseDays
        const candidateTarget = Number(new_target_reps ?? (row as any).target_reps ?? 1) || 1
        if (candidateDays.length > candidateTarget) {
          return `Tu veux passer à ${candidateTarget}×/semaine, mais tu as ${candidateDays.length} jours planifiés (${formatDaysFrench(candidateDays)}).\n\nQuel jour tu veux retirer ?`
        }
      }
    } catch (e) {
      console.error("[Architect] scheduled_days validation failed:", e)
    }
  }

  // Apply JSON mutations only AFTER validation passes.
  if (matchedAction) {
    if (new_title) {
      console.log(`[Architect] Updating title: "${matchedAction.title}" -> "${new_title}"`)
      matchedAction.title = new_title
    }
    if (new_description) {
      console.log(`[Architect] Updating description`)
      matchedAction.description = new_description
    }
    if (new_target_reps !== undefined) {
      const isHabitJson = String(matchedAction.type ?? "").toLowerCase() === "habit" || String(matchedAction.type ?? "").toLowerCase() === "habitude"
      const safeJsonReps = isHabitJson ? Math.max(1, Math.min(7, Number(new_target_reps) || 1)) : new_target_reps
      console.log(`[Architect] Updating targetReps: ${matchedAction.targetReps} -> ${safeJsonReps}`)
      matchedAction.targetReps = safeJsonReps
    }
    if (Array.isArray(new_scheduled_days)) {
      matchedAction.scheduledDays = new_scheduled_days
    }
    if (new_time_of_day) {
      // JSON can have either snake_case or camelCase depending on legacy content.
      ;(matchedAction as any).time_of_day = new_time_of_day
      ;(matchedAction as any).timeOfDay = new_time_of_day
    }
  }

  // 3. Save JSON
  console.log(`[Architect] Saving updated JSON to user_plans...`)
  const { error: updateJsonError } = await supabase
    .from("user_plans")
    .update({ content: fullPlan.content })
    .eq("id", planId)

  if (updateJsonError) {
    console.error("[Architect] ❌ Error saving JSON:", updateJsonError)
    return "Erreur lors de la sauvegarde des modifications du plan."
  }

  // 4. Update SQL (Sync user_actions et/ou user_framework_tracking)
  const updates: any = {}
  if (new_title) updates.title = new_title
  if (new_description) updates.description = new_description
  if (new_target_reps !== undefined) {
    // Habits: weekly frequency capped at 7
    const isHabitRow = matchedAction && (String(matchedAction.type ?? "").toLowerCase() === "habit" || String(matchedAction.type ?? "").toLowerCase() === "habitude")
    updates.target_reps = isHabitRow ? Math.max(1, Math.min(7, Number(new_target_reps) || 1)) : new_target_reps
  }
  if (Array.isArray(new_scheduled_days)) updates.scheduled_days = new_scheduled_days
  if (new_time_of_day) updates.time_of_day = new_time_of_day

  if (Object.keys(updates).length > 0) {
    console.log(`[Architect] Syncing updates to SQL tables...`)
    console.log(`[Architect] Updating user_actions where title matches "${oldTitle}"...`)

    const { error: sqlError } = await supabase
      .from("user_actions")
      .update(updates)
      .eq("plan_id", planId)
      .ilike("title", oldTitle)

    if (sqlError) console.error("[Architect] ❌ SQL Update Error (user_actions):", sqlError)

    if (isFramework) {
      const frameworkUpdates: any = {}
      if (new_title) frameworkUpdates.title = new_title
      if (new_target_reps !== undefined) frameworkUpdates.target_reps = new_target_reps

      if (Object.keys(frameworkUpdates).length > 0) {
        console.log(`[Architect] Updating user_framework_tracking...`)
        await supabase
          .from("user_framework_tracking")
          .update(frameworkUpdates)
          .eq("plan_id", planId)
          .ilike("title", oldTitle)
      }
    }
  }

  // Return a user-facing, fully-French confirmation (no debug/sentinel strings).
  const titleOut = String(new_title || oldTitle || "").trim() || "l’action"
  const repsOut = (new_target_reps !== undefined && new_target_reps !== null) ? Number(new_target_reps) : null
  const daysOut = Array.isArray(new_scheduled_days) ? new_scheduled_days : null
  const bits: string[] = []
  if (Number.isFinite(repsOut as any)) bits.push(`Fréquence: ${repsOut}×/semaine.`)
  if (daysOut && daysOut.length) bits.push(`Jours planifiés: ${daysOut.join(", ")}.`)
  if (new_time_of_day) bits.push(`Moment: ${String(new_time_of_day)}.`)
  return `C’est fait — “${titleOut}” est bien mise à jour.${bits.length ? ` ${bits.join(" ")}` : ""}`.trim()
}


