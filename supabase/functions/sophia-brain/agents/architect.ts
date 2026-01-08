import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../../_shared/gemini.ts'

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

async function handleTracking(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { target_name, value, operation, status } = args
    const searchTerm = target_name.trim()
    const entryStatus = status || 'completed'

    // 1. Actions (missions/habitudes)
    const { data: actions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'pending'])
        .ilike('title', `%${searchTerm}%`)
        .limit(1)

    if (actions && actions.length > 0) {
        const action = actions[0]
        const today = new Date().toISOString().split('T')[0]
        const lastPerformed = action.last_performed_at ? action.last_performed_at.split('T')[0] : null
        
        let newReps = action.current_reps || 0
        const trackingType = action.tracking_type || 'boolean'

        // Mise à jour des répétitions SEULEMENT si c'est 'completed' ou 'partial'
        if (entryStatus === 'completed' || entryStatus === 'partial') {
            if (trackingType === 'boolean') {
                if (operation === 'add' || operation === 'set') {
                    if (lastPerformed === today && operation === 'add') {
                        // Already done today, don't increment reps but log history
                        return `C'est noté, mais je vois que tu avais déjà validé "${action.title}" aujourd'hui. Je laisse validé ! ✅`
                    } else {
                        newReps = Math.max(newReps + 1, 1)
                    }
                }
            } else {
                if (operation === 'add') newReps += value
                else if (operation === 'set') newReps = value
            }
        } else if (entryStatus === 'missed') {
            // SI C'EST 'MISSED', on vérifie aussi si une entrée 'missed' existe déjà aujourd'hui
            const { data: existingMissed } = await supabase
                .from('user_action_entries')
                .select('id')
                .eq('user_id', userId)
                .eq('action_id', action.id)
                .eq('status', 'missed')
                .gte('performed_at', `${today}T00:00:00`)
                .limit(1)

            if (existingMissed && existingMissed.length > 0) {
                 return `Je sais, c'est déjà noté comme raté pour aujourd'hui. T'inquiète pas. 📉`
            }
        }

        if (entryStatus === 'completed') {
            const { error } = await supabase
                .from('user_actions')
                .update({ 
                    current_reps: newReps,
                    last_performed_at: new Date().toISOString()
                })
                .eq('id', action.id)
            if (error) console.error("Tracking Update Error:", error)
        }
        
        // Insert History Entry
        await supabase
            .from('user_action_entries')
            .insert({
                user_id: userId,
                action_id: action.id,
                action_title: action.title,
                status: entryStatus,
                value: value,
                performed_at: new Date().toISOString()
            })

        if (entryStatus === 'missed') {
             return `C'est noté (Pas fait). 📉\nAction : ${action.title}`
        }

        return `C'est noté ! ✅\nAction : ${action.title}\nTotal : ${newReps}`
    }

    // 2. Frameworks (exercices / journaling) — stockés séparément en DB
    const { data: frameworks } = await supabase
        .from('user_framework_tracking')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'pending'])
        .ilike('title', `%${searchTerm}%`)
        .limit(1)

    if (frameworks && frameworks.length > 0) {
        const fw = frameworks[0] as any
        const nowIso = new Date().toISOString()

        if (entryStatus === 'completed' || entryStatus === 'partial') {
            const curr = Number(fw.current_reps ?? 0)
            const next = operation === 'set' ? Math.max(curr, 1) : (curr + 1)
            await supabase
                .from('user_framework_tracking')
                .update({ current_reps: next, last_performed_at: nowIso })
                .eq('id', fw.id)
        }

        await supabase.from('user_framework_entries').insert({
            user_id: userId,
            plan_id: fw.plan_id ?? null,
            action_id: fw.action_id,
            framework_title: fw.title,
            framework_type: fw.type ?? 'unknown',
            content: { status: entryStatus, note: null, from: "chat" },
            created_at: nowIso,
            updated_at: nowIso,
        })

        if (entryStatus === 'missed') return `Je note (pas fait). 📉\nExercice : ${fw.title}`
        return `C'est noté ! ✅\nExercice : ${fw.title}`
    }

    // 3. Signes Vitaux
    const { data: vitalSigns } = await supabase
        .from('user_vital_signs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .ilike('label', `%${searchTerm}%`)
        .limit(1)

    if (vitalSigns && vitalSigns.length > 0) {
        const sign = vitalSigns[0]
        let newValue = parseFloat(sign.current_value) || 0
        
        if (operation === 'add') newValue += value
        else if (operation === 'set') newValue = value

        await supabase
            .from('user_vital_signs')
            .update({ 
                current_value: String(newValue),
                last_checked_at: new Date().toISOString()
            })
            .eq('id', sign.id)

        await supabase
            .from('user_vital_sign_entries')
            .insert({
                user_id: userId,
                vital_sign_id: sign.id,
                plan_id: sign.plan_id,
                submission_id: sign.submission_id,
                value: String(newValue),
                recorded_at: new Date().toISOString()
            })

        return `C'est enregistré. 📊\n${sign.label} : ${newValue} ${sign.unit || ''}`
    }

    // SI RIEN TROUVÉ (Actions / Frameworks / Signes Vitaux)
    return `INFO_POUR_AGENT: Je ne trouve pas "${target_name}" dans le plan actif (Actions / Frameworks / Signes Vitaux). Contente-toi de féliciter ou discuter, sans dire "C'est noté".`
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

// ---- Exports for deterministic tool testing (DB writes + plan JSON sync) ----
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

  // --- Deterministic shortcut: "Attrape-Rêves Mental" activation ---
  // This is intentionally handled without LLM/tool-calling to avoid "silent" failures on WhatsApp.
  // It creates the framework in the active plan (if any) and returns the exercise steps right away.
  const msgLower = (message ?? "").toString().toLowerCase()
  const looksLikeAttrapeReves =
    /(attrape)\s*[-–—]?\s*(r[eê]ves?|r[êe]ve)\b/i.test(msgLower) ||
    /\battrape[-\s]*r[eê]ves?\b/i.test(msgLower)
  const looksLikeActivation =
    /\b(active|activez|activer|lance|lancer|on\s+y\s+va|vas[-\s]*y|go)\b/i.test(msgLower)

  if (looksLikeAttrapeReves && looksLikeActivation) {
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

  const basePrompt = `
    Tu es Sophia. (Casquette : Architecte de Systèmes).
    Ton obsession : L'efficacité, la clarté, l'action.

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
  
  const historyText = history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  const response = await generateWithGemini(
    systemPrompt, 
    `Historique:\n${historyText}\n\nUser: ${message}`,
    0.7,
    false,
    [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL],
    "auto",
    {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-3-flash-preview",
      source: "sophia-brain:architect",
      forceRealAi: meta?.forceRealAi,
    }
  )

  if (typeof response === 'string') {
      // Nettoyage de sécurité pour virer les ** si l'IA a désobéi
      return response.replace(/\*\*/g, '')
  }

  if (typeof response === 'object') {
    console.log(`[Architect] 🛠️ Tool Call: ${response.tool}`)
    console.log(`[Architect] Args:`, JSON.stringify(response.args))

    // TRACKING (Pas besoin de plan)
    if (response.tool === 'track_progress') {
        const trackingResult = await handleTracking(supabase, userId, response.args)

        // Cas : Non trouvé dans le plan => Info pour agent
        if (trackingResult.startsWith("INFO_POUR_AGENT")) {
            const followUpPrompt = `
              Tu as voulu noter une action ("${response.args.target_name}") mais le système te dit :
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
            return typeof followUpResponse === 'string' ? followUpResponse.replace(/\*\*/g, '') : "Ok, c'est noté !"
        }

        // Cas : Succès => On génère une confirmation naturelle
        const confirmationPrompt = `
          ACTION VALIDÉE : "${response.args.target_name}"
          STATUT : ${response.args.status === 'missed' ? 'Raté / Pas fait' : 'Réussi / Fait'}
          
          CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
          Dernier message de l'utilisateur : "${message}"
          
          TA MISSION :
          1. Confirme que c'est pris en compte (sans dire "C'est enregistré").
          2. Enchaîne sur une question pour optimiser ou passer à la suite.
          3. SI l'utilisateur a donné des détails (ex: "J'ai lu et c'était pas mal"), REBONDIS SUR CES DÉTAILS.
          
          FORMAT :
          - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
          - Pas de gras.
          
          Exemple (User dit "J'ai lu un super livre") : "Top pour la lecture ! C'était quoi le titre ?"
          Exemple (User dit juste "Fait") : "C'est noté. On passe à la suite ?"
        `
        const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? "gemini-3-flash-preview",
          source: "sophia-brain:architect_confirmation",
          forceRealAi: meta?.forceRealAi,
        })
        return typeof confirmationResponse === 'string' ? confirmationResponse.replace(/\*\*/g, '') : "C'est noté."
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

    if (response.tool === 'update_action_structure') {
        return await handleUpdateAction(supabase, userId, plan.id, response.args)
    }

    if (response.tool === 'create_simple_action') {
      const { title, description, type, targetReps, tips, time_of_day } = response.args
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
        // Be honest: do not claim it's created if we can't confirm.
        return `Je viens de tenter de créer "${title}", mais je ne la vois pas encore clairement dans ton plan (il y a peut-être eu un loupé de synchro).\n\nOuvre le dashboard et dis-moi si tu la vois. Sinon, dis “retente” et je la recrée.`
      }

      return `C'est validé ! ✅\n\nJe viens de vérifier: l’action "${title}" est bien dans ton plan.\nOn s’y met quand ?`
    }

    if (response.tool === 'create_framework') {
      const { title, description, targetReps, frameworkDetails, time_of_day } = response.args
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

      return `C'est fait ! 🏗️\n\nJe viens de vérifier: "${title}" est bien dans ton plan.\nTu devrais le voir apparaître dans tes actions.`
    }
  }

  return response as unknown as string
}
