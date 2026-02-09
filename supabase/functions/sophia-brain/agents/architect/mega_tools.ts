import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { injectActionIntoPlanJson } from "./plan_json.ts"
import { getActivePlanForUser } from "./activation.ts"
import { handleUpdateAction } from "./update_action.ts"

export async function megaToolUpdateActionStructure(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
  const plan = await getActivePlanForUser(supabase, userId)
  if (!plan) return "Je ne trouve pas de plan actif pour faire cette modification."
  return await handleUpdateAction(supabase, userId, plan.id, args)
}

export async function megaToolCreateSimpleAction(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
  const plan = await getActivePlanForUser(supabase, userId)
  if (!plan) return "Je ne trouve pas de plan actif pour faire cette modification."

  const { title, description, type, targetReps, tips, time_of_day } = args
  const actionId = `act_${Date.now()}`

  const resolvedType = type || "habit"
  const rawReps = Number(targetReps) || 1
  // Habits: weekly frequency capped at 7
  const safeReps = (resolvedType === "habit" || resolvedType === "habitude") ? Math.max(1, Math.min(7, rawReps)) : rawReps

  await supabase.from("user_actions").insert({
    user_id: userId,
    plan_id: plan.id,
    submission_id: plan.submission_id,
    title,
    description,
    type: resolvedType,
    target_reps: safeReps,
    status: "active",
    tracking_type: "boolean",
    time_of_day: time_of_day || "any_time",
  })

  const newActionJson = {
    id: actionId,
    type: resolvedType,
    title: title,
    description: description,
    questType: "side",
    targetReps: safeReps,
    tips: tips || "",
    rationale: "Ajouté via discussion avec Sophia.",
    tracking_type: "boolean",
    time_of_day: time_of_day || "any_time",
  }

  const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
  if (status === "duplicate") return `Oula ! ✋\n\nL'action "${title}" existe déjà.`
  if (status === "error") return "Erreur technique lors de la mise à jour du plan visuel."
  const tOut = String(title ?? "").trim() || "l’action"
  const repsOut = Number.isFinite(Number(targetReps)) ? Number(targetReps) : null
  const bits: string[] = []
  if (repsOut != null) bits.push(`Fréquence: ${repsOut}×/semaine.`)
  return `C’est fait — j’ai ajouté “${tOut}” à ton plan.${bits.length ? ` ${bits.join(" ")}` : ""}`.trim()
}

export async function megaToolCreateFramework(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
  const plan = await getActivePlanForUser(supabase, userId)
  if (!plan) return "Je ne trouve pas de plan actif pour faire cette modification."

  const { title, description, targetReps, frameworkDetails, time_of_day } = args
  const actionId = `act_${Date.now()}`

  const newActionJson = {
    id: actionId,
    type: "framework",
    title: title,
    description: description,
    questType: "side",
    targetReps: targetReps || 1,
    frameworkDetails: frameworkDetails,
    tracking_type: "boolean",
    time_of_day: time_of_day || "any_time",
  }

  const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
  if (status === "duplicate") return `Doucement ! ✋\n\nL'exercice "${title}" est déjà là.`
  if (status === "error") return "Erreur technique lors de l'intégration du framework."

  await supabase.from("user_actions").insert({
    user_id: userId,
    plan_id: plan.id,
    submission_id: plan.submission_id,
    title: title,
    description: description,
    type: "mission",
    status: "active",
    tracking_type: "boolean",
    time_of_day: time_of_day || "any_time",
  })

  return `C'est fait ! 🏗️\n\nJ'ai intégré le framework "${title}" directement dans ton plan interactif.\nTu devrais le voir apparaître dans tes actions du jour.`
}


