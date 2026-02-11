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

  const normalizeTitle = (raw: unknown): string =>
    String(raw ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")

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
    const prevPhaseActions = Array.isArray(prevPhase?.actions) ? prevPhase.actions : []
    const prevPhaseTitles = prevPhaseActions
      .map((a: any) => String(a?.title ?? "").trim())
      .filter((t: string) => t.length > 0)

    // Fetch all "activated" items for this plan.
    // IMPORTANT:
    // - previous phase may include frameworks (stored in user_framework_tracking, not user_actions)
    // - titles may differ slightly (case/whitespace), so we match on normalized titles
    // - statuses: treat active/pending as "activated"; deleted rows no longer exist
    const [{ data: dbActions }, { data: dbFrameworks }] = await Promise.all([
      supabase
        .from("user_actions")
        .select("title, status")
        .eq("plan_id", plan.id),
      supabase
        .from("user_framework_tracking")
        .select("title, status")
        .eq("plan_id", plan.id),
    ])

    const activatedTitleSet = new Set<string>()
    for (const row of (dbActions ?? [])) {
      activatedTitleSet.add(normalizeTitle((row as any)?.title))
    }
    for (const row of (dbFrameworks ?? [])) {
      activatedTitleSet.add(normalizeTitle((row as any)?.title))
    }

    const missingTitles = prevPhaseTitles.filter((t: string) => !activatedTitleSet.has(normalizeTitle(t)))
    if (missingTitles.length > 0) {
      const missingCount = missingTitles.length
      const phaseTitle = String(prevPhase?.title ?? `Phase ${prevPhaseIndex + 1}`).trim()
      const sample = missingTitles.slice(0, 3).map((t: string) => `- ${t}`).join("\n")
      const more = missingCount > 3 ? `\n(et ${missingCount - 3} autre(s))` : ""
      return [
        `Je peux activer “${targetAction.title}”, mais avant il reste ${missingCount} action(s) à activer dans la phase précédente (“${phaseTitle}”).`,
        sample ? `\n${sample}${more}` : "",
        `\nOn construit solide — on finit les fondations d’abord. Tu veux que je t’aide à activer l’action manquante ?`,
      ].join("\n").trim()
    }
  }

  // 4. Activate if not already active
  const rawType = String((targetAction as any)?.type ?? "").toLowerCase().trim()
  const isFramework = rawType === "framework"
  const step = String(targetAction?.description ?? "").trim()
  const firstStep = step ? step.split("\n")[0] : ""

  if (isFramework) {
    const { data: existingFw } = await supabase
      .from("user_framework_tracking")
      .select("id, status")
      .eq("plan_id", plan.id)
      .ilike("title", targetAction.title)
      .maybeSingle()

    if (existingFw) {
      const st = String((existingFw as any)?.status ?? "")
      if (st === "active") {
        return [
          `“${targetAction.title}” est déjà active.`,
          firstStep ? `Première étape: ${firstStep}` : "",
          `Tu veux la garder au feeling, ou la caler à un repère (ex: après le dîner) ?`,
        ].filter(Boolean).join("\n")
      }
      // Re-activate / promote pending → active
      await supabase.from("user_framework_tracking").update({ status: "active" }).eq("id", (existingFw as any).id)
      return [
        `C’est bon — j’ai activé “${targetAction.title}”.`,
        firstStep ? `Première étape: ${firstStep}` : "",
        `Tu préfères la faire au feeling, ou on fixe des jours ? (Si on “cale” un moment, c’est juste un repère dans le plan — pas une notification automatique.)`,
      ].filter(Boolean).join("\n")
    }
  } else {
    const { data: existing } = await supabase
      .from("user_actions")
      .select("id, status")
      .eq("plan_id", plan.id)
      .ilike("title", targetAction.title)
      .maybeSingle()

    if (existing) {
      const st = String((existing as any)?.status ?? "")
      if (st === "active") {
        return [
          `“${targetAction.title}” est déjà active.`,
          firstStep ? `Première étape: ${firstStep}` : "",
          `Tu veux la garder au feeling, ou la caler à un repère (ex: après le dîner) ?`,
        ].filter(Boolean).join("\n")
      }
      // Re-activate / promote pending → active
      await supabase.from("user_actions").update({ status: "active" }).eq("id", (existing as any).id)
      const isHabit = rawType === "habitude" || rawType === "habit"
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
  }

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
    const rawType = targetAction.type || "mission"
    const rawReps = Number(targetAction.targetReps) || 1
    // Habits: weekly frequency capped at 7
    const safeReps = (rawType === "habit" || rawType === "habitude") ? Math.max(1, Math.min(7, rawReps)) : rawReps

    await supabase.from("user_actions").insert({
      user_id: userId,
      plan_id: plan.id,
      submission_id: plan.submission_id,
      title: targetAction.title,
      description: targetAction.description,
      type: rawType,
      target_reps: safeReps,
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

export async function handleDeactivateAction(
  supabase: SupabaseClient,
  userId: string,
  args: any,
): Promise<string> {
  const { action_title_or_id } = args
  const rawInput = String(action_title_or_id ?? "").trim()
  const searchTerm = rawInput.toLowerCase()
  if (!searchTerm) {
    return "Je n'ai pas compris quelle action tu veux mettre en pause."
  }

  const plan = await getActivePlanForUser(supabase, userId)
  if (!plan) return "Je ne trouve pas de plan actif pour désactiver cette action."

  let action: any = null
  // 1. Try by ID in user_actions
  {
    const { data } = await supabase
      .from("user_actions")
      .select("id, title, status")
      .eq("plan_id", plan.id)
      .eq("id", rawInput)
      .maybeSingle()
    if (data) action = data
  }
  // 2. Try exact title (case-insensitive)
  if (!action) {
    const { data } = await supabase
      .from("user_actions")
      .select("id, title, status")
      .eq("plan_id", plan.id)
      .ilike("title", rawInput)
      .maybeSingle()
    if (data) action = data
  }
  // 3. Try partial title fallback
  if (!action) {
    const { data } = await supabase
      .from("user_actions")
      .select("id, title, status")
      .eq("plan_id", plan.id)
      .ilike("title", `%${rawInput}%`)
      .limit(1)
      .maybeSingle()
    if (data) action = data
  }

  if (action) {
    const st = String((action as any)?.status ?? "")
    if (st === "pending") {
      return `"${(action as any).title}" est déjà en pause (désactivée proprement).`
    }
    await supabase.from("user_actions").update({ status: "pending" }).eq("id", (action as any).id)
    return `C'est fait. J'ai mis en pause "${(action as any).title}" (désactivée proprement). Tu pourras la réactiver quand tu veux.`
  }

  let fw: any = null
  // 4. Try framework by DB row id
  {
    const { data } = await supabase
      .from("user_framework_tracking")
      .select("id, action_id, title, status")
      .eq("plan_id", plan.id)
      .eq("id", rawInput)
      .maybeSingle()
    if (data) fw = data
  }
  // 5. Try framework by action_id (plan JSON action id)
  if (!fw) {
    const { data } = await supabase
      .from("user_framework_tracking")
      .select("id, action_id, title, status")
      .eq("plan_id", plan.id)
      .eq("action_id", rawInput)
      .maybeSingle()
    if (data) fw = data
  }
  // 6. Try framework by title exact/partial
  if (!fw) {
    const { data } = await supabase
      .from("user_framework_tracking")
      .select("id, action_id, title, status")
      .eq("plan_id", plan.id)
      .ilike("title", rawInput)
      .maybeSingle()
    if (data) fw = data
  }
  if (!fw) {
    const { data } = await supabase
      .from("user_framework_tracking")
      .select("id, action_id, title, status")
      .eq("plan_id", plan.id)
      .ilike("title", `%${rawInput}%`)
      .limit(1)
      .maybeSingle()
    if (data) fw = data
  }

  if (fw) {
    const st = String((fw as any)?.status ?? "")
    if (st === "pending") {
      return `"${(fw as any).title}" est déjà en pause (désactivé proprement).`
    }
    await supabase.from("user_framework_tracking").update({ status: "pending" }).eq("id", (fw as any).id)
    return `C'est fait. J'ai mis en pause "${(fw as any).title}" (désactivé proprement). Tu pourras le réactiver quand tu veux.`
  }

  return `Je ne trouve pas l'action "${rawInput}" dans ton plan.`
}

export async function handleArchiveAction(
  supabase: SupabaseClient,
  userId: string,
  args: any,
): Promise<string> {
  const { action_title_or_id } = args
  const searchTerm = (action_title_or_id || "").trim().toLowerCase()

  // Fetch plan with content so we can also remove the action from the plan JSON
  const { data: plan, error: planError } = await supabase
    .from("user_plans")
    .select("id, submission_id, content")
    .eq("user_id", userId)
    .eq("status", "active")
    .single()

  if (planError || !plan) return "Je ne trouve pas de plan actif pour effectuer cette suppression."

  // Helper: remove action from plan JSON phases by title (case-insensitive)
  const removeFromPlanJson = async (title: string) => {
    if (!plan.content?.phases) return
    const normalizedTitle = title.toLowerCase().trim()
    const updatedPhases = plan.content.phases.map((p: any) => ({
      ...p,
      actions: (p.actions || []).filter(
        (a: any) => String(a.title || "").toLowerCase().trim() !== normalizedTitle,
      ),
    }))
    const updatedContent = { ...plan.content, phases: updatedPhases }
    await supabase.from("user_plans").update({ content: updatedContent }).eq("id", plan.id)
  }

  // 1. Try finding in user_actions
  const { data: action } = await supabase
    .from("user_actions")
    .select("id, title, status")
    .eq("plan_id", plan.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (action) {
    const title = (action as any).title
    await Promise.all([
      supabase.from("user_actions").delete().eq("id", (action as any).id),
      removeFromPlanJson(title),
    ])
    return `C'est fait. J'ai supprimé l'action "${title}" de ton plan.`
  }

  // 2. Try framework
  const { data: fw } = await supabase
    .from("user_framework_tracking")
    .select("id, action_id, title, status")
    .eq("plan_id", plan.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (fw) {
    const title = (fw as any).title
    await Promise.all([
      supabase.from("user_framework_tracking").delete().eq("id", (fw as any).id),
      removeFromPlanJson(title),
    ])
    return `C'est fait. J'ai supprimé l'exercice "${title}" de ton plan.`
  }

  return `Je ne trouve pas l'action "${action_title_or_id}" dans ton plan.`
}
