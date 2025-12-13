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
      targetReps: { type: "INTEGER", description: "Si habit, nombre de fois par semaine/jour (défaut 1). Si mission, mettre 1." },
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
  description: "Enregistre une progression (Action faite ou Signe Vital mesuré). À utiliser quand l'utilisateur dit 'J'ai fait mon sport' ou 'J'ai fumé 3 clopes'.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom approximatif de l'action ou du signe vital." },
      value: { type: "NUMBER", description: "Valeur à ajouter (ex: 1 pour 'J'ai fait', 3 pour '3 clopes')." },
      operation: { type: "STRING", enum: ["add", "set"], description: "'add' = ajouter au total existant, 'set' = définir la valeur absolue (écraser)." },
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

async function handleTracking(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { target_name, value, operation } = args
    const searchTerm = target_name.trim()

    // 1. Actions
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

        if (trackingType === 'boolean') {
            if (operation === 'add' || operation === 'set') {
                if (lastPerformed === today && operation === 'add') {
                    return `C'est noté, mais je vois que tu avais déjà validé "**${action.title}**" aujourd'hui. Je laisse validé ! ✅`
                }
                newReps = Math.max(newReps + 1, 1)
            }
        } else {
            if (operation === 'add') newReps += value
            else if (operation === 'set') newReps = value
        }

        const { error } = await supabase
            .from('user_actions')
            .update({ 
                current_reps: newReps,
                last_performed_at: new Date().toISOString()
            })
            .eq('id', action.id)

        if (error) {
            console.error("Tracking Error:", error)
            return "Oups, petit bug technique en notant ton action."
        }

        return `C'est noté ! ✅\nAction : **${action.title}**\nTotal : ${newReps}`
    }

    // 2. Signes Vitaux
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

        return `C'est enregistré. 📊\n**${sign.label}** : ${newValue} ${sign.unit || ''}`
    }

    return `Je ne trouve pas l'action ou le signe vital "**${target_name}**" dans ton plan actif.`
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
        return `Je ne trouve pas l'action "**${target_name}**" dans ton plan.`
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

    return `C'est modifié ! ✏️\nL'action **"${new_title || oldTitle}"** a été mise à jour.`
}

// --- FONCTION PRINCIPALE ---

export async function runArchitect(
  supabase: SupabaseClient,
  userId: string,
  message: string, 
  history: any[], 
  context: string = ""
): Promise<string> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";

  const systemPrompt = `
    Tu es Sophia. (Casquette : Architecte de Systèmes).
    Ton obsession : L'efficacité, la clarté, l'action.
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    TES OUTILS :
    1. "create_simple_action" : CRÉER action simple. (Validation requise).
    2. "create_framework" : CRÉER exercice. (Validation requise).
    3. "track_progress" : VALIDER/TRACKER. (Pas de validation requise).
    4. "update_action_structure" : MODIFIER une action existante (Nom, Description, Fréquence).
       - Utilise cet outil si l'utilisateur dit "Change le nom en...", "Mets la fréquence à 3".
       - Demande confirmation si le changement est drastique, sinon exécute.

    RÈGLE D'OR (CRÉATION/MODIF) :
    - Pour créer ou modifier la structure, assure-toi d'avoir l'accord de l'utilisateur.
    - Lors de la création, n'oublie PAS de définir le 'time_of_day' le plus pertinent (Matin, Soir, etc.).
    
    CONTEXTE OPÉRATIONNEL :
    ${context ? `${context}\n(Utilise ces infos intelligemment)` : ""}
  `
  
  const historyText = history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  const response = await generateWithGemini(
    systemPrompt, 
    `Historique:\n${historyText}\n\nUser: ${message}`,
    0.7,
    false,
    [CREATE_ACTION_TOOL, CREATE_FRAMEWORK_TOOL, TRACK_PROGRESS_TOOL, UPDATE_ACTION_TOOL]
  )

  if (typeof response === 'object') {
    console.log(`[Architect] 🛠️ Tool Call: ${response.tool}`)
    console.log(`[Architect] Args:`, JSON.stringify(response.args))

    // TRACKING (Pas besoin de plan)
    if (response.tool === 'track_progress') {
        return await handleTracking(supabase, userId, response.args)
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
      if (status === 'duplicate') return `Oula ! ✋\n\nL'action **"${title}"** existe déjà.`
      if (status === 'error') return "Erreur technique lors de la mise à jour du plan visuel."

      return `C'est validé ! ✅\n\nJ'ai ajouté l'action **"${title}"** à ton plan.\nOn s'y met quand ?`
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
      if (status === 'duplicate') return `Doucement ! ✋\n\nL'exercice **"${title}"** est déjà là.`
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

      return `C'est fait ! 🏗️\n\nJ'ai intégré le framework **"${title}"** directement dans ton plan interactif.\nTu devrais le voir apparaître dans tes actions du jour.`
    }
  }

  return response as string
}
