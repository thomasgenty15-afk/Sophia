import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export async function getActivePlanForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; submission_id: string } | null> {
  const { data: plan, error: planError } = await supabase
    .from("user_plans")
    .select("id, submission_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single()

  if (planError || !plan) return null
  return plan as any
}

export async function handleActivateAction(
  supabase: SupabaseClient,
  userId: string,
  args: any,
): Promise<string> {
  const { action_title_or_id } = args
  const searchTerm = (action_title_or_id || "").trim().toLowerCase()

  // 1. Get Plan & JSON
  const { data: plan, error: planError } = await supabase
    .from("user_plans")
    .select("id, content, current_phase, submission_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single()

  if (planError || !plan || !plan.content) {
    return "Je ne trouve pas de plan actif pour activer cette action."
  }

  const phases = plan.content.phases || []

  // 2. Find target action & its phase
  let targetAction: any = null
  let targetPhaseIndex = -1

  for (let pIdx = 0; pIdx < phases.length; pIdx++) {
    const p = phases[pIdx]
    if (!p.actions) continue
    for (let aIdx = 0; aIdx < p.actions.length; aIdx++) {
      const a = p.actions[aIdx]
      const title = String(a.title || "").toLowerCase()
      const id = String(a.id || "").toLowerCase()
      if (title.includes(searchTerm) || id === searchTerm) {
        targetAction = a
        targetPhaseIndex = pIdx
        break
      }
    }
    if (targetAction) break
  }

  if (!targetAction) {
    return `Je ne trouve pas l'action "${action_title_or_id}" dans ton plan.`
  }

  // 3. "Murs avant toit" check
  if (targetPhaseIndex > 0) {
    const prevPhaseIndex = targetPhaseIndex - 1
    const prevPhase = phases[prevPhaseIndex]
    const prevPhaseActionTitles = prevPhase.actions.map((a: any) => a.title)

    const { data: dbActions } = await supabase
      .from("user_actions")
      .select("title, status")
      .eq("plan_id", plan.id)
      .in("title", prevPhaseActionTitles)

    const activatedCount = dbActions?.length || 0
    const totalInPrevPhase = prevPhase.actions.length
    if (activatedCount < totalInPrevPhase) {
      const missingCount = totalInPrevPhase - activatedCount
      return `REFUS_ACTIVATION_RAISON: "Murs avant toit".\n` +
        `Explique à l'utilisateur qu'il reste ${missingCount} action(s) à activer dans la phase précédente ("${prevPhase.title}") avant de pouvoir lancer celle-ci.\n` +
        `Sois pédagogue : "On construit solide, finissons les fondations d'abord."`
    }
  }

  // 4. Activate if not already active
  const { data: existing } = await supabase
    .from("user_actions")
    .select("id, status")
    .eq("plan_id", plan.id)
    .ilike("title", targetAction.title)
    .maybeSingle()

  if (existing) {
    const step = String(targetAction?.description ?? "").trim()
    const firstStep = step ? step.split("\n")[0] : ""
    return [
      `“${targetAction.title}” est déjà active.`,
      firstStep ? `Première étape: ${firstStep}` : "",
      `Tu veux la garder au feeling, ou la caler à un repère (ex: après le dîner) ?`,
    ].filter(Boolean).join("\n")
  }

  const rawType = String((targetAction as any)?.type ?? "").toLowerCase().trim()
  const isFramework = rawType === "framework"

  if (isFramework) {
    const fwType = String(targetAction.frameworkDetails?.type ?? "one_shot")
    await supabase.from("user_framework_tracking").insert({
      user_id: userId,
      plan_id: plan.id,
      submission_id: plan.submission_id,
      action_id: String(targetAction.id ?? `act_${Date.now()}`),
      title: String(targetAction.title),
      type: fwType,
      target_reps: Number(targetAction.targetReps ?? 1),
      current_reps: 0,
      status: "active",
      tracking_type: String(targetAction.tracking_type ?? "boolean"),
      last_performed_at: null,
    })
  } else {
    await supabase.from("user_actions").insert({
      user_id: userId,
      plan_id: plan.id,
      submission_id: plan.submission_id,
      title: targetAction.title,
      description: targetAction.description,
      type: targetAction.type || "mission",
      target_reps: targetAction.targetReps || 1,
      status: "active",
      tracking_type: targetAction.tracking_type || "boolean",
      time_of_day: targetAction.time_of_day || "any_time",
    })
  }

  // Auto-activate the phase in plan JSON if it's locked (so UI unlocks)
  const targetPhase = phases[targetPhaseIndex]
  if (targetPhase && (targetPhase.status === "locked" || !targetPhase.status)) {
    const updatedPhases = [...phases]
    updatedPhases[targetPhaseIndex] = { ...targetPhase, status: "active" }
    const updatedContent = { ...plan.content, phases: updatedPhases }
    await supabase.from("user_plans").update({ content: updatedContent }).eq("id", plan.id)
  }

  // Update plan current_phase if we just stepped into a new phase
  const newPhaseNumber = targetPhaseIndex + 1
  if (newPhaseNumber > (plan.current_phase || 1)) {
    await supabase.from("user_plans").update({ current_phase: newPhaseNumber }).eq("id", plan.id)
  }

  const isHabit = rawType === "habitude" || rawType === "habit"
  const step = String(targetAction?.description ?? "").trim()
  const firstStep = step ? step.split("\n")[0] : ""
  if (isHabit) {
    return [
      `C’est bon — j’ai activé “${targetAction.title}”.`,
      firstStep ? `Première étape: ${firstStep}` : "",
      `Tu préfères la faire au feeling, ou on fixe des jours ? (Si on “cale” un moment, c’est juste un repère dans le plan — pas une notification automatique.)`,
    ].filter(Boolean).join("\n")
  }
  return [
    `C’est bon — j’ai activé “${targetAction.title}”.`,
    firstStep ? `Première étape: ${firstStep}` : "",
    `Tu veux la caler à un moment précis (juste un repère dans le plan — pas une notification), ou tu préfères la garder au feeling ?`,
  ].filter(Boolean).join("\n")
}

export async function handleArchiveAction(
  supabase: SupabaseClient,
  userId: string,
  args: any,
): Promise<string> {
  const { action_title_or_id } = args
  const searchTerm = (action_title_or_id || "").trim().toLowerCase()

  const plan = await getActivePlanForUser(supabase, userId)
  if (!plan) return "Je ne trouve pas de plan actif pour effectuer cette suppression."

  // 1. Try finding in user_actions
  const { data: action } = await supabase
    .from("user_actions")
    .select("id, title, status")
    .eq("plan_id", plan.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (action) {
    await supabase.from("user_actions").update({ status: "archived" }).eq("id", (action as any).id)
    return `C'est fait. J'ai retiré l'action "${(action as any).title}" de ton plan actif.`
  }

  // 2. Try framework
  const { data: fw } = await supabase
    .from("user_framework_tracking")
    .select("id, title, status")
    .eq("plan_id", plan.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (fw) {
    await supabase.from("user_framework_tracking").update({ status: "archived" }).eq("id", (fw as any).id)
    return `C'est fait. J'ai retiré l'exercice "${(fw as any).title}" de ton plan actif.`
  }

  return `Je ne trouve pas l'action "${action_title_or_id}" dans ton plan.`
}


