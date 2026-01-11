import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../../_shared/gemini.ts'
import { handleTracking } from "../lib/tracking.ts"
import { logEdgeFunctionError } from "../../_shared/error-log.ts"

export type ArchitectModelOutput =
  | string
  | { tool: string; args: any }

// --- OUTILS ---
const CREATE_ACTION_TOOL = {
  name: "create_simple_action",
  description: "Crée une action simple (Habitude ou Mission). À utiliser pour tout ce qui est tâche concrète (ex: 'Courir', 'Acheter X', 'Méditer').",
  parameters: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "Titre court et impactant." },
      description: { type: "STRING", description: "Description précise." },
      type: { type: "STRING", enum: ["habit", "mission"], description: "'habit' = récurrent, 'mission' = une fois." },
      targetReps: { type: "INTEGER", description: "Si habit, nombre de fois par SEMAINE. Doit être entre 7 (minimum) et 14 (maximum). Si mission, mettre 1." },
      tips: { type: "STRING", description: "Un petit conseil court pour réussir." },
      time_of_day: { type: "STRING", enum: ["morning", "afternoon", "evening", "night", "any_time"], description: "Moment idéal pour faire l'action." }
    },
    required: ["title", "description", "type", "time_of_day"]
  }
}

const CREATE_FRAMEWORK_TOOL = {
  name: "create_framework",
  description: "Crée un EXERCICE D'ÉCRITURE ou de RÉFLEXION (Journaling, Bilan, Worksheet). L'utilisateur devra écrire dans l'app.",
  parameters: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "Titre de l'exercice." },
      description: { type: "STRING", description: "À quoi ça sert ?" },
      targetReps: { type: "INTEGER", description: "Combien de fois à faire (ex: 7 pour une semaine, 1 pour one-shot)." },
      time_of_day: { type: "STRING", enum: ["morning", "afternoon", "evening", "night", "any_time"], description: "Moment idéal pour faire l'exercice." },
      frameworkDetails: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["one_shot", "recurring"], description: "Juste une fois ou à répéter ?" },
          intro: { type: "STRING", description: "Texte inspirant qui s'affiche avant l'exercice." },
          sections: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING", description: "Identifiant unique (s1, s2...)" },
                label: { type: "STRING", description: "La question posée à l'utilisateur." },
                inputType: { type: "STRING", enum: ["text", "textarea", "scale"], description: "Type de champ." },
                placeholder: { type: "STRING", description: "Exemple de réponse." }
              },
              required: ["id", "label", "inputType"]
            }
          }
        },
        required: ["type", "intro", "sections"]
      }
    },
    required: ["title", "description", "frameworkDetails", "time_of_day"]
  }
}

const TRACK_PROGRESS_TOOL = {
  name: "track_progress",
  description: "Enregistre une progression ou un raté (Action faite, Pas faite, ou Signe Vital mesuré). À utiliser quand l'utilisateur dit 'J'ai fait mon sport' ou 'J'ai raté mon sport'.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom approximatif de l'action ou du signe vital." },
      value: { type: "NUMBER", description: "Valeur à ajouter (ex: 1 pour 'J'ai fait', 0 pour 'Raté')." },
      operation: { type: "STRING", enum: ["add", "set"], description: "'add' = ajouter au total existant, 'set' = définir la valeur absolue." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Statut de l'action : 'completed' (fait), 'missed' (pas fait/raté), 'partial' (à moitié)." },
      date: { type: "STRING", description: "Date concernée (YYYY-MM-DD). Laisser vide pour aujourd'hui." }
    },
    required: ["target_name", "value", "operation"]
  }
}

const UPDATE_ACTION_TOOL = {
  name: "update_action_structure",
  description: "Modifie la structure d'une action existante (Titre, Description, Fréquence). À utiliser si l'utilisateur dit 'Change le nom en X', 'Mets la fréquence à 3'.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom actuel de l'action à modifier." },
      new_title: { type: "STRING", description: "Nouveau titre (optionnel)." },
      new_description: { type: "STRING", description: "Nouvelle description (optionnel)." },
      new_target_reps: { type: "INTEGER", description: "Nouveau nombre de répétitions cible (optionnel)." }
    },
    required: ["target_name"]
  }
}

const ACTIVATE_ACTION_TOOL = {
  name: "activate_plan_action",
  description: "Active une action spécifique du plan qui était en attente (future). Vérifie d'abord si les phases précédentes sont complétées.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à activer." }
    },
    required: ["action_title_or_id"]
  }
}

const ARCHIVE_ACTION_TOOL = {
  name: "archive_plan_action",
  description: "Archive (désactive/supprime) une action du plan. À utiliser si l'utilisateur dit 'j'arrête le sport', 'supprime cette tâche', 'je ne veux plus faire ça'.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à archiver." },
      reason: { type: "STRING", description: "Raison de l'arrêt (ex: 'trop difficile', 'plus pertinent', 'n'aime pas'). Utile pour l'analyse future." }
    },
    required: ["action_title_or_id"]
  }
}

export function getArchitectTools(opts: { inWhatsAppGuard24h: boolean }) {
  return opts.inWhatsAppGuard24h
    ? [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL, ARCHIVE_ACTION_TOOL]
    : [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL, ACTIVATE_ACTION_TOOL, ARCHIVE_ACTION_TOOL]
}

export function buildArchitectSystemPromptLite(opts: {
  channel: "web" | "whatsapp"
  lastAssistantMessage: string
  context: string
}): string {
  const isWa = opts.channel === "whatsapp"
  return `
Tu es Sophia (casquette: Architecte).
Objectif: aider l'utilisateur à avancer avec une prochaine étape concrète.

RÈGLES:
- Français, tutoiement.
- Texte brut (pas de **).
- WhatsApp: réponse courte + 1 question max (oui/non ou A/B).
- Ne mentionne pas les rôles internes ni "je suis une IA".
- Ne promets jamais un changement fait ("j'ai créé/activé") si ce n'est pas réellement exécuté via un outil.

OUTILS (si proposés):
- "track_progress": uniquement si l'utilisateur dit explicitement qu'il a fait/pas fait une action.
- "create_simple_action"/"create_framework"/"update_action_structure"/"archive_plan_action"/"activate_plan_action": uniquement si le contexte indique un plan actif et si l'utilisateur demande clairement ce changement.
${isWa ? `- IMPORTANT WhatsApp: éviter les opérations "activation" pendant onboarding si le contexte le bloque.\n` : ""}

Dernière réponse de Sophia: "${String(opts.lastAssistantMessage ?? "").slice(0, 160)}..."

=== CONTEXTE OPÉRATIONNEL ===
${String(opts.context ?? "").slice(0, 7000)}
  `.trim()
}

// --- HELPERS ---

async function injectActionIntoPlanJson(supabase: SupabaseClient, planId: string, newAction: any): Promise<'success' | 'duplicate' | 'error'> {
    const { data: fullPlan, error: fullPlanError } = await supabase
        .from('user_plans')
        .select('content, current_phase')
        .eq('id', planId)
        .single()

    if (fullPlanError || !fullPlan || !fullPlan.content) {
        console.error("[Architect] ❌ Error fetching full plan JSON:", fullPlanError)
        return 'error'
    }

    const currentPhaseIndex = (fullPlan.current_phase || 1) - 1
    const phases = fullPlan.content.phases || []
    
    if (!phases[currentPhaseIndex]) {
        console.error(`[Architect] ❌ Phase index ${currentPhaseIndex} not found.`)
        return 'error'
    }

    const existingActions = phases[currentPhaseIndex].actions || []
    const isDuplicate = existingActions.some((a: any) => 
        a.title.trim().toLowerCase() === newAction.title.trim().toLowerCase()
    )

    if (isDuplicate) {
        console.warn(`[Architect] ⚠️ Duplicate action detected: "${newAction.title}"`)
        return 'duplicate'
    }

    console.log(`[Architect] Injecting into Phase ${currentPhaseIndex + 1}: ${phases[currentPhaseIndex].title}`)

    if (!phases[currentPhaseIndex].actions) phases[currentPhaseIndex].actions = []
    phases[currentPhaseIndex].actions.push(newAction)

    const { error: updateError } = await supabase
        .from('user_plans')
        .update({ content: fullPlan.content })
        .eq('id', planId)

    if (updateError) {
        console.error("[Architect] ❌ Error updating plan JSON:", updateError)
        return 'error'
    }
    
    console.log(`[Architect] ✅ Plan JSON updated successfully.`)
    return 'success'
}

function planJsonHasAction(planContent: any, match: { id?: string; title?: string }): boolean {
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

async function verifyActionCreated(
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

async function handleUpdateAction(supabase: SupabaseClient, userId: string, planId: string, args: any): Promise<string> {
    console.log(`[Architect] 🛠️ handleUpdateAction called with args:`, JSON.stringify(args))
    
    const { target_name, new_title, new_description, new_target_reps } = args
    const searchTerm = target_name.trim().toLowerCase()

    // 1. Récupérer le plan JSON
    console.log(`[Architect] Fetching plan ${planId}...`)
    const { data: fullPlan, error: fullPlanError } = await supabase
        .from('user_plans')
        .select('content')
        .eq('id', planId)
        .single()

    if (fullPlanError || !fullPlan || !fullPlan.content) {
        console.error("[Architect] ❌ Error fetching plan:", fullPlanError)
        return "Erreur technique : Impossible de lire le plan."
    }

    // 2. Trouver l'action dans le JSON
    let actionFound = false
    let oldTitle = ""
    let isFramework = false 

    console.log(`[Architect] Searching for action matching "${searchTerm}" in JSON plan...`)

    const phases = fullPlan.content.phases || []
    for (const phase of phases) {
        if (phase.actions) {
            for (const action of phase.actions) {
                const actionTitle = action.title.trim().toLowerCase()
                if (actionTitle.includes(searchTerm) || searchTerm.includes(actionTitle)) {
                    console.log(`[Architect] ✅ Match found! Action ID: ${action.id}, Title: "${action.title}"`)
                    
                    // Bingo !
                    actionFound = true
                    oldTitle = action.title
                    if (action.type === 'framework') isFramework = true
                    
                    // Update JSON object
                    if (new_title) {
                        console.log(`[Architect] Updating title: "${action.title}" -> "${new_title}"`)
                        action.title = new_title
                    }
                    if (new_description) {
                        console.log(`[Architect] Updating description`)
                        action.description = new_description
                    }
                    if (new_target_reps !== undefined) {
                        console.log(`[Architect] Updating targetReps: ${action.targetReps} -> ${new_target_reps}`)
                        action.targetReps = new_target_reps
                    }
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

    // 3. Save JSON
    console.log(`[Architect] Saving updated JSON to user_plans...`)
    const { error: updateJsonError } = await supabase
        .from('user_plans')
        .update({ content: fullPlan.content })
        .eq('id', planId)

    if (updateJsonError) {
        console.error("[Architect] ❌ Error saving JSON:", updateJsonError)
        return "Erreur lors de la sauvegarde des modifications du plan."
    }

    // 4. Update SQL (Sync user_actions et/ou user_framework_tracking)
    const updates: any = {}
    if (new_title) updates.title = new_title
    if (new_description) updates.description = new_description
    if (new_target_reps !== undefined) updates.target_reps = new_target_reps

    if (Object.keys(updates).length > 0) {
        console.log(`[Architect] Syncing updates to SQL tables...`)
        
        console.log(`[Architect] Updating user_actions where title matches "${oldTitle}"...`)
        
        const { error: sqlError } = await supabase
            .from('user_actions')
            .update(updates)
            .eq('plan_id', planId)
            .ilike('title', oldTitle) 

        if (sqlError) console.error("[Architect] ❌ SQL Update Error (user_actions):", sqlError)

        if (isFramework) {
             const frameworkUpdates: any = {}
             if (new_title) frameworkUpdates.title = new_title
             if (new_target_reps !== undefined) frameworkUpdates.target_reps = new_target_reps
             
             if (Object.keys(frameworkUpdates).length > 0) {
                 console.log(`[Architect] Updating user_framework_tracking...`)
                 await supabase
                    .from('user_framework_tracking')
                    .update(frameworkUpdates)
                    .eq('plan_id', planId)
                    .ilike('title', oldTitle)
             }
        }
    }

    return `C'est modifié ! ✏️\nL'action "${new_title || oldTitle}" a été mise à jour.`
}

// Exposed for deterministic tool testing (DB writes + plan JSON sync) ----
// These wrappers keep production behavior unchanged, but let Deno tests call tool handlers directly.

async function getActivePlanForUser(supabase: SupabaseClient, userId: string): Promise<{ id: string; submission_id: string } | null> {
    const { data: plan, error: planError } = await supabase
      .from('user_plans')
      .select('id, submission_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (planError || !plan) return null
    return plan as any
}

// --- NEW TOOL: ACTIVATE ACTION (PHASE LOGIC) ---

async function handleActivateAction(
    supabase: SupabaseClient, 
    userId: string, 
    args: any
): Promise<string> {
    const { action_title_or_id } = args
    const searchTerm = (action_title_or_id || "").trim().toLowerCase()

    // 1. Get Plan & JSON
    const { data: plan, error: planError } = await supabase
      .from('user_plans')
      .select('id, content, current_phase')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (planError || !plan || !plan.content) {
        return "Je ne trouve pas de plan actif pour activer cette action."
    }

    const phases = plan.content.phases || []
    
    // 2. Find target action & its phase
    let targetAction: any = null
    let targetPhaseIndex = -1
    let targetActionIndex = -1

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
                targetActionIndex = aIdx
                break
            }
        }
        if (targetAction) break
    }

    if (!targetAction) {
        return `Je ne trouve pas l'action "${action_title_or_id}" dans ton plan.`
    }

    // 3. Check "Walls before Roof" Logic
    // Logic: To activate an action in Phase N, ALL actions in Phase N-1 must be ACTIVE or COMPLETED.
    // (We check user_actions status for actions of previous phase).

    if (targetPhaseIndex > 0) {
        const prevPhaseIndex = targetPhaseIndex - 1
        const prevPhase = phases[prevPhaseIndex]
        
        // Check status of all actions in prevPhase
        // We need to query user_actions for these IDs/titles to know their real status.
        // Or we assume that if they are in "active" status in DB, it's good.
        // Actually, the requirement is "activees" (activated).
        // So we just need to check if they have a row in user_actions with status 'active' or 'completed'.
        
        // Let's get all actions of prevPhase from DB
        const prevPhaseActionTitles = prevPhase.actions.map((a: any) => a.title)
        
        const { data: dbActions } = await supabase
            .from('user_actions')
            .select('title, status')
            .eq('plan_id', plan.id)
            .in('title', prevPhaseActionTitles)
        
        // We need to count how many are active/completed
        // Note: user_actions only contains ACTIVATED actions. If an action is not in user_actions, it's not active.
        const activatedCount = dbActions?.length || 0
        const totalInPrevPhase = prevPhase.actions.length

        // Strict rule: "Si les deux de la phase précédente n'ont pas été activées"
        // So we expect ALL actions of prev phase to be present in DB (status active/completed).
        if (activatedCount < totalInPrevPhase) {
             const missingCount = totalInPrevPhase - activatedCount
             return `REFUS_ACTIVATION_RAISON: "Murs avant toit".\n` +
                    `Explique à l'utilisateur qu'il reste ${missingCount} action(s) à activer dans la phase précédente ("${prevPhase.title}") avant de pouvoir lancer celle-ci.\n` +
                    `Sois pédagogue : "On construit solide, finissons les fondations d'abord."`
        }
    }

    // 4. Activate the action
    // Check if already active
    const { data: existing } = await supabase
        .from('user_actions')
        .select('id, status')
        .eq('plan_id', plan.id)
        .ilike('title', targetAction.title)
        .maybeSingle()
        
    if (existing) {
        return `ACTION_DEJA_ACTIVE: "${targetAction.title}" est déjà active. Dis-lui qu'il peut s'y mettre !`
    }

    // Insert into DB based on type
    const isFramework = targetAction.type === 'framework'
    
    if (isFramework) {
        const fwType = String(targetAction.frameworkDetails?.type ?? "one_shot")
        await supabase.from('user_framework_tracking').insert({
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
        await supabase.from('user_actions').insert({
            user_id: userId,
            plan_id: plan.id,
            submission_id: plan.submission_id,
            title: targetAction.title,
            description: targetAction.description,
            type: targetAction.type || 'mission',
            target_reps: targetAction.targetReps || 1,
            status: 'active',
            tracking_type: targetAction.tracking_type || 'boolean',
            time_of_day: targetAction.time_of_day || 'any_time'
        })
    }

    // Update plan current_phase if we just stepped into a new phase
    const newPhaseNumber = targetPhaseIndex + 1
    if (newPhaseNumber > (plan.current_phase || 1)) {
        await supabase.from('user_plans').update({ current_phase: newPhaseNumber }).eq('id', plan.id)
    }

    return `SUCCES_ACTIVATION: J'ai activé "${targetAction.title}".\n` +
           `Confirme-le à l'utilisateur et encourage-le.`
}

async function handleArchiveAction(
    supabase: SupabaseClient, 
    userId: string, 
    args: any
): Promise<string> {
    const { action_title_or_id, reason } = args
    const searchTerm = (action_title_or_id || "").trim().toLowerCase()

    const plan = await getActivePlanForUser(supabase, userId)
    if (!plan) return "Je ne trouve pas de plan actif pour effectuer cette suppression."

    // 1. Try finding in user_actions
    const { data: action } = await supabase
        .from('user_actions')
        .select('id, title, status')
        .eq('plan_id', plan.id)
        .ilike('title', searchTerm)
        .maybeSingle()

    if (action) {
        await supabase.from('user_actions').update({ status: 'archived' }).eq('id', action.id)
        // Optionally update JSON to reflect archived status? 
        // For now, SQL is the source of truth for execution.
        return `C'est fait. J'ai retiré l'action "${action.title}" de ton plan actif.`
    }

    // 2. Try framework
    const { data: fw } = await supabase
        .from('user_framework_tracking')
        .select('id, title, status')
        .eq('plan_id', plan.id)
        .ilike('title', searchTerm)
        .maybeSingle()
    
    if (fw) {
        await supabase.from('user_framework_tracking').update({ status: 'archived' }).eq('id', fw.id)
        return `C'est fait. J'ai retiré l'exercice "${fw.title}" de ton plan actif.`
    }

    return `Je ne trouve pas l'action "${action_title_or_id}" dans ton plan.`
}


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

    await supabase.from('user_actions').insert({
        user_id: userId,
        plan_id: plan.id,
        submission_id: plan.submission_id,
        title,
        description,
        type: type || 'habit',
        target_reps: targetReps || 1,
        status: 'active',
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
    })

    const newActionJson = {
        id: actionId,
        type: type || 'habit',
        title: title,
        description: description,
        questType: "side",
        targetReps: targetReps || 1,
        tips: tips || "",
        rationale: "Ajouté via discussion avec Sophia.",
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
    }

    const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
    if (status === 'duplicate') return `Oula ! ✋\n\nL'action "${title}" existe déjà.`
    if (status === 'error') return "Erreur technique lors de la mise à jour du plan visuel."
    return `C'est validé ! ✅\n\nJ'ai ajouté l'action "${title}" à ton plan.\nOn s'y met quand ?`
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
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
    }

    const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
    if (status === 'duplicate') return `Doucement ! ✋\n\nL'exercice "${title}" est déjà là.`
    if (status === 'error') return "Erreur technique lors de l'intégration du framework."

    await supabase.from('user_actions').insert({
        user_id: userId,
        plan_id: plan.id,
        submission_id: plan.submission_id,
        title: title,
        description: description,
        type: 'mission',
        status: 'active',
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
    })

    return `C'est fait ! 🏗️\n\nJ'ai intégré le framework "${title}" directement dans ton plan interactif.\nTu devrais le voir apparaître dans tes actions du jour.`
}

// --- FONCTION PRINCIPALE ---

export async function generateArchitectModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  tools: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<ArchitectModelOutput> {
  const historyText = (opts.history ?? []).slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const response = await generateWithGemini(
    opts.systemPrompt,
    `Historique:\n${historyText}\n\nUser: ${opts.message}`,
    temperature,
    false,
    opts.tools,
    "auto",
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? "gemini-3-flash-preview",
      source: "sophia-brain:architect",
      forceRealAi: opts.meta?.forceRealAi,
    },
  )
  return response as any
}

export async function handleArchitectModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  response: ArchitectModelOutput
  inWhatsAppGuard24h: boolean
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<string> {
  const { supabase, userId, message, response, inWhatsAppGuard24h, meta } = opts

  if (typeof response === 'string') {
    // Nettoyage de sécurité pour virer les ** si l'IA a désobéi
    return response.replace(/\*\*/g, '')
  }

  if (typeof response === 'object') {
    const toolName = String((response as any).tool ?? "").trim()
    try {
      console.log(`[Architect] 🛠️ Tool Call: ${toolName}`)
      console.log(`[Architect] Args:`, JSON.stringify((response as any).args))

      // HARD GUARD (WhatsApp onboarding 24h): never activate via WhatsApp.
      if (inWhatsAppGuard24h && toolName === "activate_plan_action") {
        return "Je peux te guider, mais pendant l’onboarding WhatsApp je ne peux pas activer d’actions depuis ici.\n\nVa sur le dashboard pour l’activer, et dis-moi quand c’est fait."
      }

      // TRACKING (Pas besoin de plan)
      if (toolName === 'track_progress') {
        const trackingResult = await handleTracking(supabase, userId, (response as any).args, { source: meta?.channel ?? "chat" })

        // Cas : Non trouvé dans le plan => Info pour agent
        if (trackingResult.startsWith("INFO_POUR_AGENT")) {
          const followUpPrompt = `
          Tu as voulu noter une action ("${(response as any).args?.target_name ?? ""}") mais le système te dit :
          "${trackingResult}"
          
          RÉAGIS MAINTENANT :
          - Félicite ou discute normalement de ce sujet.
          - NE DIS PAS "C'est noté" ou "J'ai enregistré".
          - Sois naturel, efficace et concis.
          
          FORMAT :
          - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        `
          const followUpResponse = await generateWithGemini(followUpPrompt, "Réagis à l'info.", 0.7, false, [], "auto", {
            requestId: meta?.requestId,
            model: meta?.model ?? "gemini-3-flash-preview",
            source: "sophia-brain:architect_followup",
            forceRealAi: meta?.forceRealAi,
          })
          return typeof followUpResponse === 'string' ? followUpResponse.replace(/\*\*/g, '') : "Ok."
        }

        // Cas : Succès => On génère une confirmation naturelle
        const confirmationPrompt = `
        ACTION VALIDÉE : "${(response as any).args?.target_name ?? ""}"
        STATUT : ${(response as any).args?.status === 'missed' ? 'Raté / Pas fait' : 'Réussi / Fait'}
        
        CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
        Dernier message de l'utilisateur : "${message}"
        
        TA MISSION :
        1. Confirme que c'est pris en compte (sans dire "C'est enregistré").
        2. Enchaîne sur une question pour optimiser ou passer à la suite.
        3. SI l'utilisateur a donné des détails, REBONDIS SUR CES DÉTAILS.
        
        FORMAT :
        - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        - Pas de gras.
      `
        const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? "gemini-3-flash-preview",
          source: "sophia-brain:architect_confirmation",
          forceRealAi: meta?.forceRealAi,
        })
        return typeof confirmationResponse === 'string' ? confirmationResponse.replace(/\*\*/g, '') : "Ok."
      }

      // OPERATIONS SUR LE PLAN (Besoin du plan actif)
      const { data: plan, error: planError } = await supabase
        .from('user_plans')
        .select('id, submission_id') 
        .eq('user_id', userId)
        .eq('status', 'active')
        .single()

      if (planError || !plan) {
        console.warn(`[Architect] ⚠️ No active plan found for user ${userId}`)
        return "Je ne trouve pas de plan actif pour faire cette modification."
      }
    
      console.log(`[Architect] ✅ Active Plan found: ${plan.id}`)

      if (toolName === 'update_action_structure') {
        return await handleUpdateAction(supabase, userId, plan.id, (response as any).args)
      }

      if (toolName === 'activate_plan_action') {
        const activationResult = await handleActivateAction(supabase, userId, (response as any).args)
        const followUpPrompt = `
        RÉSULTAT DE L'ACTIVATION :
        "${activationResult}"
        
        TA MISSION :
        - Traduis ce résultat technique en une réponse naturelle et conversationnelle.
        - Si c'est un REFUS ("Murs avant toit"), sois bienveillant mais ferme sur la méthode.
        - Si c'est un SUCCÈS, sois encourageant.
        
        FORMAT :
        - Réponse aérée en 2-3 lignes.
        - Pas de gras.
      `
        const activationResponse = await generateWithGemini(followUpPrompt, "Génère la réponse.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? "gemini-3-flash-preview",
          source: "sophia-brain:architect_activation_response",
          forceRealAi: meta?.forceRealAi,
        })
        return typeof activationResponse === 'string' ? activationResponse.replace(/\*\*/g, '') : activationResult
      }

      if (toolName === 'archive_plan_action') {
        return await handleArchiveAction(supabase, userId, (response as any).args)
      }

      if (toolName === 'create_simple_action') {
        const { title, description, type, targetReps, tips, time_of_day } = (response as any).args
        const actionId = `act_${Date.now()}`

      console.log(`[Architect] Attempting to insert into user_actions...`)
      const { error: insertErr } = await supabase.from('user_actions').insert({
        user_id: userId,
        plan_id: plan.id,
        submission_id: plan.submission_id,
        title,
        description,
        type: type || 'habit',
        target_reps: targetReps || 1,
        status: 'active',
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
      })
      if (insertErr) {
        console.error("[Architect] ❌ user_actions insert failed:", insertErr)
        return `Oups — j’ai eu un souci technique en créant l’action "${title}".\n\nVa jeter un œil sur le dashboard pour confirmer si elle apparaît. Si tu veux, dis-moi “retente” et je la recrée proprement.`
      }

      const newActionJson = {
        id: actionId,
        type: type || 'habit',
        title: title,
        description: description,
        questType: "side",
        targetReps: targetReps || 1,
        tips: tips || "",
        rationale: "Ajouté via discussion avec Sophia.",
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
      }
      
      const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
      if (status === 'duplicate') return `Oula ! ✋\n\nL'action "${title}" existe déjà.`
      if (status === 'error') return "Erreur technique lors de la mise à jour du plan visuel."

      const verify = await verifyActionCreated(supabase, userId, plan.id, { title, actionId })
      if (!verify.db_ok || !verify.json_ok) {
        console.warn("[Architect] ⚠️ Post-create verification failed:", verify)
        return `Je viens de tenter de créer "${title}", mais je ne la vois pas encore clairement dans ton plan (il y a peut-être eu un loupé de synchro).\n\nOuvre le dashboard et dis-moi si tu la vois. Sinon, dis “retente” et je la recrée.`
      }

        return `C'est validé ! ✅\n\nJe viens de vérifier: l’action "${title}" est bien dans ton plan.\nOn s’y met quand ?`
      }

      if (toolName === 'create_framework') {
        const { title, description, targetReps, frameworkDetails, time_of_day } = (response as any).args
        const actionId = `act_${Date.now()}`

      const newActionJson = {
        id: actionId,
        type: "framework",
        title: title,
        description: description,
        questType: "side",
        targetReps: targetReps || 1,
        frameworkDetails: frameworkDetails,
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
      }

      const status = await injectActionIntoPlanJson(supabase, plan.id, newActionJson)
      if (status === 'duplicate') return `Doucement ! ✋\n\nL'exercice "${title}" est déjà là.`
      if (status === 'error') return "Erreur technique lors de l'intégration du framework."

      const { error: fwInsertErr } = await supabase.from('user_actions').insert({
        user_id: userId,
        plan_id: plan.id,
        submission_id: plan.submission_id,
        title: title,
        description: description,
        type: 'mission', 
        status: 'active',
        tracking_type: 'boolean',
        time_of_day: time_of_day || 'any_time'
      })
      if (fwInsertErr) {
        console.error("[Architect] ❌ user_actions insert failed (framework):", fwInsertErr)
        return `Oups — j’ai eu un souci technique en créant l’exercice "${title}".\n\nVa vérifier sur le dashboard si tu le vois. Si tu ne le vois pas, dis “retente” et je le recrée.`
      }

      const verify = await verifyActionCreated(supabase, userId, plan.id, { title, actionId })
      if (!verify.db_ok || !verify.json_ok) {
        console.warn("[Architect] ⚠️ Post-create verification failed (framework):", verify)
        return `Je viens de tenter d’intégrer "${title}", mais je ne le vois pas encore clairement dans ton plan (possible loupé de synchro).\n\nRegarde sur le dashboard et dis-moi si tu le vois. Sinon, dis “retente” et je le recrée.`
      }

        return `C'est fait ! 🏗️\n\nJe viens de vérifier: "${title}" est bien dans ton plan.\nTu veux le faire quand ?`
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Architect] tool execution failed (unexpected):", toolName, errMsg)
      // System error log (admin production log)
      await logEdgeFunctionError({
        functionName: "sophia-brain",
        error: e,
        severity: "error",
        title: "tool_execution_failed_unexpected",
        requestId: meta?.requestId ?? null,
        userId,
        source: "sophia-brain:architect",
        metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, channel: meta?.channel ?? "web" },
      })
      // Quality/ops log
      try {
        await supabase.from("conversation_judge_events").insert({
          user_id: userId,
          scope: null,
          channel: meta?.channel ?? "web",
          agent_used: "architect",
          verifier_kind: "tool_execution_fallback",
          request_id: meta?.requestId ?? null,
          model: null,
          ok: null,
          rewritten: null,
          issues: ["tool_execution_failed_unexpected"],
          mechanical_violations: [],
          draft_len: null,
          final_len: null,
          draft_hash: null,
          final_hash: null,
          metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, err: errMsg.slice(0, 240) },
        } as any)
      } catch {}
      return (
        "Ok, j’ai eu un souci technique en faisant ça.\n\n" +
        "Va voir sur le dashboard pour confirmer, et dis-moi si tu vois le changement. Sinon, dis “retente”."
      )
    }
  }

  return String(response ?? "")
}

export async function runArchitect(
  supabase: SupabaseClient,
  userId: string,
  message: string, 
  history: any[], 
  userState: any,
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<string> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"
  const inWhatsAppGuard24h = isWhatsApp && /WHATSAPP_ONBOARDING_GUARD_24H=true/i.test(context ?? "")

  // --- Deterministic shortcut: "Attrape-Rêves Mental" activation ---
  // This is intentionally handled without LLM/tool-calling to avoid "silent" failures on WhatsApp.
  // It creates the framework in the active plan (if any) and returns the exercise steps right away.
  const msgLower = (message ?? "").toString().toLowerCase()
  const looksLikeAttrapeReves =
    /(attrape)\s*[-–—]?\s*(r[eê]ves?|r[êe]ve)\b/i.test(msgLower) ||
    /\battrape[-\s]*r[eê]ves?\b/i.test(msgLower)
  const looksLikeActivation =
    /\b(active|activez|activer|lance|lancer|on\s+y\s+va|vas[-\s]*y|go)\b/i.test(msgLower)

  if (!isWhatsApp && looksLikeAttrapeReves && looksLikeActivation) {
    const createdMsg = await megaToolCreateFramework(supabase, userId, {
      title: "Attrape-Rêves Mental",
      description: "Un mini exercice d’écriture (2–4 minutes) pour relâcher les pensées intrusives avant de dormir.",
      targetReps: 7,
      time_of_day: "night",
      frameworkDetails: {
        type: "recurring",
        intro:
          "But: vider la tête (pas résoudre).\n\nRègle: écris vite, sans te censurer. 2 à 4 minutes max. Puis tu fermes.",
        sections: [
          {
            id: "s1",
            label: "Ce qui tourne en boucle (1 phrase).",
            inputType: "textarea",
            placeholder: "Ex: J’ai peur de ne pas réussir demain…",
          },
          {
            id: "s2",
            label: "Le scénario catastrophe (en brut).",
            inputType: "textarea",
            placeholder: "Ex: Je vais mal dormir, être nul au boulot, tout s’écroule…",
          },
          {
            id: "s3",
            label: "La version plus vraie / plus utile (une réponse sobre).",
            inputType: "textarea",
            placeholder: "Ex: Même fatigué, je gère. Je fais 1 petit pas demain matin.",
          },
          {
            id: "s4",
            label: "Je le dépose pour demain à… (heure) + 1 micro-action.",
            inputType: "textarea",
            placeholder: "Ex: Demain 10h. Micro-action: noter 3 priorités sur papier.",
          },
        ],
      },
    })

    const steps =
      `Ok. Attrape‑Rêves Mental activé.\n\n` +
      `On le fait maintenant (2–4 min) :\n` +
      `- 1) Note la pensée qui tourne en boucle (1 phrase)\n` +
      `- 2) Écris le scénario catastrophe (sans filtre)\n` +
      `- 3) Écris une version plus vraie / plus utile (sobre)\n` +
      `- 4) Dépose‑le pour demain à une heure + 1 micro‑action\n\n` +
      `Envoie-moi juste ta ligne 1 quand tu veux, et je t’aide à faire le 2→3 proprement.`

    // If the framework couldn't be created (no active plan), be honest but still deliver the exercise.
    if (String(createdMsg || "").toLowerCase().includes("je ne trouve pas de plan actif")) {
      return `${steps}\n\n(Je peux te le mettre dans ton plan dès que tu as un plan actif.)`
    }
    return steps
  }

  const basePrompt = isWhatsApp ? `
    Tu es Sophia. (Casquette : Architecte).
    Objectif: aider à exécuter le plan avec des micro-étapes concrètes.

    MODE WHATSAPP (CRITIQUE) :
    - Réponse courte par défaut (3–7 lignes).
    - 1 question MAX (oui/non ou A/B de préférence).
    - Si message user court/pressé: 1–2 phrases MAX + 1 question.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Ne mentionne jamais des rôles internes ni "je suis une IA".

    OUTILS :
    - track_progress: quand l'utilisateur dit qu'il a fait / pas fait une action.
    - update_action_structure: si l'utilisateur demande un changement sur une action existante.
    - create_simple_action / create_framework: uniquement si un plan actif existe (sinon refuse).
    - activate_plan_action: pour activer une action future (sauf si guard onboarding 24h).

    RÈGLES CRITIQUES :
    - N'invente jamais un changement ("j'ai activé/créé") sans preuve (outil + succès).
    - Distingue active vs pending quand tu parles d'actions.
    - Si le contexte contient ARCHITECT_LOOP_GUARD, tu obéis.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 120)}..."

    CONTEXTE OPÉRATIONNEL :
    ${context ? context : "(vide)"}
  ` : `
    Tu es Sophia. (Casquette : Architecte de Systèmes).
    Ton obsession : L'efficacité, la clarté, l'action.

    MODE WHATSAPP (CRITIQUE) :
    - Si le canal est WhatsApp, tu optimises pour des messages très courts et actionnables.
    - Si le dernier message du user est court/pressé (<= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "on démarre", "go", "on enchaîne"):
      - MAX 2 phrases au total.
      - Puis 1 question courte (oui/non OU choix A/B).
      - Zéro explication longue. Zéro storytelling. Zéro “cours”.
      - Objectif: faire faire une micro-action maintenant.

    PRIORITÉ CONTEXTE (CRITIQUE) :
    - Si le contexte contient "ARCHITECT_LOOP_GUARD", tu DOIS suivre ses règles avant tout.

    RÈGLE DE BRIÈVETÉ (CRITIQUE) :
    - Par défaut, réponds court : 3 à 7 lignes max.
    - Tu ne développes longuement QUE si l'utilisateur demande explicitement des détails ("explique", "pourquoi", "comment", "plus de détail").
    - Si tu as plusieurs idées, propose 1 option claire + 1 question (au lieu d'un long exposé).
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    TES OUTILS :
    1. "create_simple_action" : CRÉER action simple. (Validation requise).
    2. "create_framework" : CRÉER exercice. (Validation requise).
    3. "track_progress" : VALIDER/TRACKER. (Pas de validation requise).
       - Si l'utilisateur dit qu'il a FAIT une action : UTILISE "track_progress" avec status="completed".
       - Si l'utilisateur dit qu'il n'a PAS FAIT une action ("Non pas encore", "J'ai raté") : UTILISE "track_progress" avec status="missed" et value=0.
    4. "update_action_structure" : MODIFIER une action existante (Nom, Description, Fréquence).
       - Utilise cet outil si l'utilisateur dit "Change le nom en...", "Mets la fréquence à 3".
       - Demande confirmation si le changement est drastique, sinon exécute.
    5. "activate_plan_action" : ACTIVER une action du futur (Plan).
       - À utiliser si l'utilisateur veut avancer plus vite et lancer une action d'une phase suivante.
       - L'outil vérifiera AUTOMATIQUEMENT si les fondations (phase précédente) sont posées. Tu n'as pas à faire le check toi-même.
       - Si l'outil refuse (message "murs avant le toit"), transmets ce message pédagogique à l'utilisateur.

    RÈGLE D'OR (CRÉATION/MODIF) :
    - Regarde le CONTEXTE ci-dessous. Si tu vois "AUCUN PLAN DE TRANSFORMATION ACTIF" :
       - REFUSE TOUTES LES CRÉATIONS D'ACTIONS (Outils create_simple_action, create_framework interdits).
       - Explique que tu es l'Architecte, mais que tu as besoin de fondations (un plan) pour travailler.
       - Redirige vers la plateforme pour l'initialisation (Questionnaire).
       - Mentionne : "Tu peux aussi utiliser l'option 'Besoin d'aide pour choisir' sur le site si tu veux que je te construise une stratégie complète."
    
    - Une fois le plan actif :
       - Tu peux AJOUTER ou MODIFIER des actions sur ce plan EXISTANT.
       - Pour créer ou modifier la structure d'une action, assure-toi d'avoir l'accord de l'utilisateur.
       - Lors de la création d'une action, n'oublie PAS de définir le 'time_of_day' le plus pertinent (Matin, Soir, etc.).

    STATUTS D'ACTIONS (IMPORTANT, WHATSAPP) :
    - Quand tu parles d'actions/exercices du plan, distingue toujours :
      - "active" = à faire maintenant (priorité)
      - "pending" = plus tard / pas encore lancé
    - Si l'utilisateur demande "quoi faire" ou "par quoi commencer" : répond d'abord avec les actions "active".
    - Tu peux mentionner une action "pending" UNIQUEMENT en la présentant explicitement comme "plus tard".
    - Ne fais jamais croire qu'une action est active si elle est pending.

    DIRECTIVE FLOW (IMPORTANT) :
    - INTERDICTION: après avoir lancé un protocole/phase OU validé un score (motivation), ne pose JAMAIS une question générique
      ("Et sinon…", "Tu veux parler de quoi ?", "Tu as envie qu'on parle de quoi ?", etc.).
      À la place, enchaîne directement sur la 1ère étape CONCRÈTE de l'action active (1 question courte et spécifique).
    - FORMAT: termine toujours par UNE question, et elle doit être actionnable (pas une ouverture générale).
    - Évite les doublons: ne produis pas 2 messages d'affilée qui répètent la même consigne avec des mots différents.

    RIGUEUR (DIAGNOSTIC / SCORES) :
    - Si tu demandes un score (1–10) pour un item, tu DOIS demander un score (1–10) pour TOUS les items du même inventaire.
    - Interdiction d'attribuer un score toi-même ("score élevé", "8/10") à partir d'une description qualitative.
      Tu peux qualifier ("souvent ça pèse"), mais si tu veux un chiffre, tu le demandes explicitement.

    DOMAIN GUARDRAIL (CRITIQUE) :
    - Tu es un coach/architecte d'actions (plan, habitudes, exercices).
    - INTERDICTION de parler de "texte", "rédaction", "sujet", "brouillon", "document", "copie", "orthographe"
      sauf si l'utilisateur a explicitement demandé de l'aide sur un texte/document.

    TEMPS (CRITIQUE) :
    - N'invente jamais une heure ("il est 17h", "il est 16h55"). Si tu cites l'heure, utilise UNIQUEMENT celle du bloc
      "=== REPÈRES TEMPORELS ===" dans le contexte, et ne la change pas ensuite.

    ANTI-BOUCLE (CRITIQUE) :
    - Évite les méta-questions répétées ("on continue ?", "on ajuste ?") qui font tourner la conversation en rond.
      À chaque tour, propose UNE étape suivante concrète OU pose UNE question concrète. Pas de question "de flow".

    WHATSAPP + PLAN-ADHERENCE (CRITIQUE) :
    - Sur WhatsApp, l'utilisateur a déjà un ensemble d'actions organisé par le plan. Ton job n'est PAS d'en rajouter.
    - Si le contexte contient un plan (actions/phase/plan_title), tu dois :
      1) Prioriser uniquement les actions déjà dans le plan (surtout celles actives).
      2) INTERDICTION d'inventer des étapes/rituels/phases non présentes dans le plan (ex: "phase d'ancrage", "pause respiratoire")
         sauf si l'utilisateur demande explicitement un exercice de respiration OU si c'est nécessaire pour sécurité (panic/anxiété).
      3) Si l'utilisateur demande "Et après ?" de façon répétée :
         - Donne UNE fois la vision courte (1 phrase), puis stop.
         - Répète le focus du jour (1 seule action) et passe en exécution (1 question concrète).
         - Ne boucle pas en répétant "la suite du plan..." à l'infini.

    EXÉCUTION IMMÉDIATE (CRITIQUE) :
    - Si l'utilisateur choisit une option ("un truc complet", "on enchaîne", "ok vas-y", "continue", "next"),
      tu DOIS exécuter le contenu immédiatement dans CE message (donner les étapes/exercice), puis poser 1 question concrète.
    - INTERDICTION de re-demander "on passe à la suite ?" juste après qu'il a dit oui.

    CONTEXT CHECK (CRITIQUE) :
    - Avant de poser une question de diagnostic ("ta distraction principale ?", "ce qui te pompe le plus ?"),
      vérifie si l'utilisateur a déjà répondu dans les 5 derniers tours.
      - Si OUI: acknowledge la réponse et avance (next step / assignation / micro-action), ne repose pas la question.

    MÉMO COURTE DURÉE (CRITIQUE, WHATSAPP) :
    - Avant de poser une question de configuration (heure, lieu, outil) du type:
      "à quelle heure ?", "où ?", "tu as un réveil ?", "tu charges où ?", etc.
      SCAN les 5 derniers tours. Si la réponse est déjà donnée (ex: "salon", "19h"),
      INTERDICTION de redemander. Valide ("ok, salon") et passe à l'étape suivante.

    COHÉRENCE DE PROCESS (CRITIQUE) :
    - Si tu dis "on commence maintenant", alors tu fais l'étape maintenant (dans le chat) et tu ne la repousses pas à demain.
    - Si tu planifies "demain", alors tu présentes l'étape comme "à faire demain" (dashboard) et tu ne dis pas "on commence immédiatement".

    ANTI-REPROPOSITION (CRITIQUE) :
    - Si l'utilisateur vient de valider/faire une action ("ok c'est fait", "oui je l'ai déplacé", "c'est bon"),
      ne repropose JAMAIS la même action dans les 5 tours suivants.
      Passe à une action STRICTEMENT différente (next step).

    ANTI-RÉPÉTITION (STYLE) :
    - Évite de répéter exactement la même phrase de validation ("C'est parfait...") sur 2 tours consécutifs.
      Si tu dois valider deux fois, varie fortement (ou valide en 2-3 mots).

    TON WHATSAPP (CRITIQUE) :
    - Si le user écrit court/pressé, toi aussi: 1–2 phrases max + 1 question.
    - Interdiction des formulations administratives type "c'est bien pris en compte".
      Préfère: "Ok." / "Parfait." puis next step.
    
    FILTRE QUALITÉ (RADICALITÉ BIENVEILLANTE) :
    - Si l'utilisateur propose une action "faible" ou d'évitement (ex: ranger son bureau alors qu'il doit lancer sa boite, ou une habitude triviale), DIS-LUI.
    - Exemple : "Je peux le noter. Mais honnêtement, est-ce que c'est VRAIMENT ça qui va changer ta semaine ? Ou c'est pour te rassurer ?"
    - Tu es le gardien de son ambition. Ne sois pas un simple scribe.

    RÈGLE ANTI-HALLUCINATION (CRITIQUE) :
    - Ne dis JAMAIS "je l'ai créé / c'est fait / c'est créé" si tu n'as PAS :
      1) appelé un outil de création ("create_simple_action" ou "create_framework") ET
      2) reçu une confirmation explicite de succès (dans le flow, le système vérifie la DB).
    - Si l'utilisateur demande "tu l'as créé ?", et que tu n'as pas cette preuve :
      - Réponds honnêtement ("je ne le vois pas"), propose de retenter, et renvoie vers le dashboard pour vérifier.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut uniquement.
    - Utilise 1 smiley (maximum 2) par message pour rendre le ton plus humain et moins "machine", mais reste pro.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    - GESTION DU BONJOUR : Regarde l'historique. Si la conversation a déjà commencé ou si l'utilisateur ne dit pas bonjour, NE DIS PAS BONJOUR. Attaque direct.
    - FORMAT (IMPORTANT) : Réponse aérée. Fais 2 à 3 petits paragraphes séparés par une ligne vide.
      Si tu proposes un mini-plan, utilise une liste avec des tirets "- " et laisse une ligne vide avant la liste.

    ANTI-BOUCLE "PLAN NON DÉTECTÉ" (CRITIQUE, ONBOARDING/TECH) :
    - Si tu as déjà dit au moins 1 fois dans les 5 derniers tours que tu ne vois pas / ne détectes pas de plan actif,
      et que l'utilisateur insiste ("c'est bon", "j'ai validé", "ça ne marche pas", "je tourne en rond") :
      1) ARRÊTE de renvoyer vers le site et d'inventer une UI ("bouton de validation finale", "en haut à droite", etc.).
      2) Explique qu'il peut s'agir d'un délai de synchro ou d'un bug.
      3) Donne une sortie claire: "écris à sophia@sophia-coach.ai" + demande une capture du dashboard + l’email du compte + téléphone/navigateur.
      4) Ne bloque pas la conversation: propose de démarrer "hors-app" avec une question simple sur son objectif #1 du moment.
    
    CONTEXTE OPÉRATIONNEL :
    ${context ? `${context}\n(Utilise ces infos intelligemment)` : ""}
    ${userState?.investigation_state ? `
    ⚠️ ATTENTION : UN CHECKUP EST ACTUELLEMENT EN COURS (investigation_state actif).
    L'utilisateur a peut-être fait une digression.
    Ton objectif ABSOLU est de ramener l'utilisateur vers le checkup.
    1. Réponds à sa remarque courtoisement mais brièvement.
    2. Termine OBLIGATOIREMENT par une question de relance pour le checkup (ex: "On continue le bilan ?", "On passe à la suite ?").
    Ne te lance pas dans une conversation longue. La priorité est de finir le checkup. (2-4 lignes max ici.)
    ` : ""}

    MODE POST-BILAN (IMPORTANT)
    - Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", le bilan est terminé.
    - Interdiction de poser des questions de bilan.
    - Traite le sujet reporté (organisation, planning, priorités).
    - Termine par "C’est bon pour ce point ?" UNIQUEMENT si tu as fini ton explication ou ton conseil. Ne le répète pas à chaque message intermédiaire.
  `
  const systemPrompt = basePrompt
  const tools = inWhatsAppGuard24h
    ? [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL, ARCHIVE_ACTION_TOOL]
    : [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL, ACTIVATE_ACTION_TOOL, ARCHIVE_ACTION_TOOL]

  const response = await generateArchitectModelOutput({ systemPrompt, message, history, tools, meta })
  return await handleArchitectModelOutput({ supabase, userId, message, response, inWhatsAppGuard24h, meta })

      return `C'est fait ! 🏗️\n\nJe viens de vérifier: "${title}" est bien dans ton plan.\nTu devrais le voir apparaître dans tes actions.`
    }
  }

  return response as unknown as string
}
