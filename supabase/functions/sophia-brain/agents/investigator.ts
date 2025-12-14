import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { retrieveContext } from './companion.ts' // Import retrieveContext to use RAG

// --- OUTILS ---

const LOG_ACTION_TOOL = {
  name: "log_action_execution",
  description: "Enregistre le résultat d'une action, d'un framework ou d'un signe vital pour la journée.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "L'ID de l'action ou du signe vital." },
      item_type: { type: "STRING", enum: ["action", "vital", "framework"], description: "Type d'élément." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Résultat." },
      value: { type: "NUMBER", description: "Valeur numérique (pour les counters ou signes vitaux)." },
      note: { type: "STRING", description: "Raison de l'échec ou commentaire (ex: 'Trop fatigué', 'Super séance')." },
      share_insight: { type: "BOOLEAN", description: "True si l'utilisateur a partagé une info intéressante pour le coaching." }
    },
    required: ["item_id", "item_type", "status"]
  }
}

// --- TYPES & STATE ---

interface CheckupItem {
  id: string
  type: 'action' | 'vital' | 'framework'
  title: string
  description?: string
  tracking_type: 'boolean' | 'counter'
  target?: number
  unit?: string
}

interface InvestigationState {
  status: 'init' | 'checking' | 'closing'
  pending_items: CheckupItem[]
  current_item_index: number
  temp_memory: any // Pour stocker des infos temporaires si besoin
}

// --- HELPERS ---

async function getItemHistory(supabase: SupabaseClient, userId: string, itemId: string, itemType: 'action' | 'vital' | 'framework', currentContext: string = ""): Promise<string> {
    let historyText = "";

    // 1. Chronologique (Le plus récent)
    if (itemType === 'action') {
        const { data: entries } = await supabase
            .from('user_action_entries')
            .select('status, note, performed_at')
            .eq('user_id', userId)
            .eq('action_id', itemId)
            .order('performed_at', { ascending: false })
            .limit(5)
        
        if (entries && entries.length > 0) {
            historyText += "DERNIERS ENREGISTREMENTS CHRONOLOGIQUES :\n"
            historyText += entries.map(e => {
                const date = new Date(e.performed_at).toLocaleDateString('fr-FR')
                const status = e.status === 'completed' ? '✅ Fait' : '❌ Non fait'
                return `- ${date} : ${status} ${e.note ? `(Note: "${e.note}")` : ''}`
            }).join('\n')
            historyText += "\n\n"
        }
    } else if (itemType === 'vital') {
         const { data: entries } = await supabase
            .from('user_vital_sign_entries')
            .select('value, recorded_at')
            .eq('user_id', userId)
            .eq('vital_sign_id', itemId)
            .order('recorded_at', { ascending: false })
            .limit(5)

         if (entries && entries.length > 0) {
             historyText += "DERNIÈRES MESURES :\n"
             historyText += entries.map(e => {
                 const date = new Date(e.recorded_at).toLocaleDateString('fr-FR')
                 return `- ${date} : ${e.value}`
             }).join('\n')
             historyText += "\n\n"
         }
    } else if (itemType === 'framework') {
        // Frameworks usually use user_framework_entries (JSON content) or potentially user_action_entries if migrated
        // For now, let's assume no deep history available for simple checkup, or try to fetch user_framework_entries
        // We can check last_performed_at from tracking table via separate query, but here we want logs.
        // Let's keep it simple for now.
    }

    // 2. Vectoriel / Sémantique (Patterns récurrents)
    if (itemType === 'action') {
        try {
            const query = "Difficulté, échec, raison, note importante";
            const embedding = await generateEmbedding(query);
            
            const { data: similarEntries } = await supabase.rpc('match_action_entries', {
                query_embedding: embedding,
                match_threshold: 0.5, 
                match_count: 3,
                filter_action_id: itemId
            });

            if (similarEntries && similarEntries.length > 0) {
                historyText += "INSIGHTS / RÉCURRENCES (RAG) :\n"
                historyText += similarEntries.map((e: any) => {
                     const date = new Date(e.performed_at).toLocaleDateString('fr-FR')
                     return `- [${date}] ${e.status} : "${e.note || 'Pas de note'}" (Sim: ${Math.round(e.similarity * 100)}%)`
                }).join('\n')
            }
        } catch (err) {
            console.error("Error in Investigator RAG:", err)
        }
    }

    return historyText || "Aucun historique disponible.";
}

async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<CheckupItem[]> {
    const today = new Date().toISOString().split('T')[0]
    
    // Règle des 18h : Si last_performed_at / last_checked_at > 18h ago, on doit checker.
    const now = new Date()
    const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

    const pending: CheckupItem[] = []

    // 1. Fetch Actions
    const { data: actions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // 2. Fetch Vital Signs
    const { data: vitals } = await supabase
        .from('user_vital_signs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // 3. Fetch Frameworks
    const { data: frameworks } = await supabase
        .from('user_framework_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // Apply 18h Logic
    actions?.forEach(a => {
        const lastPerformedDate = a.last_performed_at ? new Date(a.last_performed_at) : null
        // Si jamais fait (null) OU fait il y a plus de 18h -> On ajoute
        if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
            pending.push({
                id: a.id,
                type: 'action',
                title: a.title,
                description: a.description,
                tracking_type: a.tracking_type,
                target: a.target_reps
            })
        }
    })

    vitals?.forEach(v => {
        const lastCheckedDate = v.last_checked_at ? new Date(v.last_checked_at) : null
        if (!lastCheckedDate || lastCheckedDate < eighteenHoursAgo) {
            pending.push({
                id: v.id,
                type: 'vital',
                title: v.label || v.name, 
                tracking_type: 'counter', 
                unit: v.unit
            })
        }
    })

    frameworks?.forEach(f => {
        const lastPerformedDate = f.last_performed_at ? new Date(f.last_performed_at) : null
        if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
            pending.push({
                id: f.id,
                type: 'framework',
                title: f.title, 
                tracking_type: 'boolean', // Usually frameworks are boolean completion for daily check
            })
        }
    })

    // Tri : Vitals d'abord, puis Actions, puis Frameworks
    return pending.sort((a, b) => {
        const typeOrder = { 'vital': 0, 'action': 1, 'framework': 2 }
        return typeOrder[a.type] - typeOrder[b.type]
    })
}

async function logItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { item_id, item_type, status, value, note, item_title } = args
    
    // Génération de l'embedding pour la note (si présente)
    let embedding: number[] | null = null
    if (note && note.trim().length > 0) {
        try {
            // On contextualise l'embedding avec le statut
            const textToEmbed = `Statut: ${status}. Note: ${note}`
            embedding = await generateEmbedding(textToEmbed)
        } catch (e) {
            console.error("Error generating embedding for log note:", e)
        }
    }

    const now = new Date()

    if (item_type === 'action') {
        // Update Action Stats & Log Entry
        if (status === 'completed') {
             // 1. Fetch current state to check 18h rule & increment reps
             const { data: action } = await supabase
                .from('user_actions')
                .select('last_performed_at, current_reps')
                .eq('id', item_id)
                .single()
             
             const lastPerformedDate = action?.last_performed_at ? new Date(action.last_performed_at) : null
             const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)
             
             // Check 18h rule : Si fait il y a moins de 18h, on ne re-log pas (doublon)
             if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
                 console.log(`[Investigator] Action ${item_id} performed recently (${action?.last_performed_at}), skipping update & log.`)
                 return "Logged (Skipped duplicate)"
             }
             
             // Increment Reps (Si pas skipped)
             const newReps = (action?.current_reps || 0) + 1
             
             await supabase.from('user_actions').update({
                 last_performed_at: now.toISOString(),
                 current_reps: newReps
             }).eq('id', item_id)

             console.log(`[Investigator] Incremented reps for ${item_id} to ${newReps}`)
        }
             // Log Entry
             const { error: logError } = await supabase.from('user_action_entries').insert({
                user_id: userId,
                action_id: item_id,
                action_title: item_title,
                status: status,
                value: value,
                note: note,
                performed_at: now.toISOString(),
                embedding: embedding
            })

            if (logError) {
                console.error("[Investigator] ❌ Log Entry Error:", logError)
            } else {
                console.log("[Investigator] ✅ Entry logged successfully")
            }
        
    } else if (item_type === 'vital') {
        // Vital Sign
        await supabase.from('user_vital_signs').update({
             current_value: String(value),
             last_checked_at: new Date().toISOString()
        }).eq('id', item_id)

        const { data: vital } = await supabase.from('user_vital_signs').select('plan_id, submission_id').eq('id', item_id).single()

        await supabase.from('user_vital_sign_entries').insert({
            user_id: userId,
            vital_sign_id: item_id,
            plan_id: vital?.plan_id,
            submission_id: vital?.submission_id,
            value: String(value),
            title: item_title, // Ajout du titre
            note: note, // Ajout de la note
            recorded_at: new Date().toISOString(),
            embedding: embedding 
        })
    } else if (item_type === 'framework') {
        // Framework Tracking
        if (status === 'completed') {
             const { data: fw } = await supabase
                .from('user_framework_tracking')
                .select('last_performed_at, current_reps, action_id, plan_id, title')
                .eq('id', item_id)
                .single()
             
             const lastPerformedDate = fw?.last_performed_at ? new Date(fw.last_performed_at) : null
             const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)
             
             if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
                 console.log(`[Investigator] Framework ${item_id} performed recently, skipping update.`)
                 return "Logged (Skipped duplicate)"
             }
             
             const newReps = (fw?.current_reps || 0) + 1
             
             await supabase.from('user_framework_tracking').update({
                 last_performed_at: now.toISOString(),
                 current_reps: newReps
             }).eq('id', item_id)

             // Insert into user_framework_entries
             // Note: user_framework_entries requires 'content' (jsonb). We create a minimal entry.
             // Also requires framework_title, framework_type. We might not have 'type' easily here if checkup item structure didn't carry it.
             // But we have 'title' in args.
             
             // Ideally we should have passed more info in CheckupItem, but for now we do best effort.
             // We use action_id from tracking table because entries link via action_id string + plan_id.
             
             await supabase.from('user_framework_entries').insert({
                 user_id: userId,
                 plan_id: fw?.plan_id,
                 action_id: fw?.action_id, // This is the string ID
                 framework_title: fw?.title,
                 framework_type: 'unknown', // We miss this in tracking table? tracking has 'type'.
                 content: { status: status, note: note, checkup: true },
                 created_at: now.toISOString()
             })
        } else {
             // Missed framework
             // We still log it? user_framework_entries is usually for content. 
             // If missed, maybe we don't log to entries, or we log a "missed" entry.
             // Let's log it for consistency.
             const { data: fw } = await supabase.from('user_framework_tracking').select('action_id, plan_id, title').eq('id', item_id).single()

             await supabase.from('user_framework_entries').insert({
                 user_id: userId,
                 plan_id: fw?.plan_id,
                 action_id: fw?.action_id,
                 framework_title: fw?.title || item_title,
                 framework_type: 'unknown',
                 content: { status: status, note: note, checkup: true },
                 created_at: now.toISOString()
             })
        }
    }

    return "Logged"
}

// --- MAIN FUNCTION ---

export async function runInvestigator(
  supabase: SupabaseClient, 
  userId: string, 
  message: string, 
  history: any[],
  state: any
): Promise<{ content: string, investigationComplete: boolean, newState: any }> {

  // 1. INIT STATE
  let currentState: InvestigationState = state || {
      status: 'init',
      pending_items: [],
      current_item_index: 0,
      temp_memory: {}
  }

  // Si c'est le tout début, on charge les items
  if (currentState.status === 'init') {
      const items = await getPendingItems(supabase, userId)
      if (items.length === 0) {
          return {
              content: "Tout est à jour pour ce créneau ! Tu as déjà tout validé. 🎉",
              investigationComplete: true,
              newState: null
          }
      }
      currentState = {
          status: 'checking',
          pending_items: items,
          current_item_index: 0,
          temp_memory: {}
      }
  }

  // 2. CHECK SI FINI
  if (currentState.current_item_index >= currentState.pending_items.length) {
       // DOUBLE CHECK : Si le temps a passé ou si on a raté des trucs, on refait un scan
       console.log("[Investigator] End of list reached. Scanning for new pending items...")
       const freshItems = await getPendingItems(supabase, userId)
       
       if (freshItems.length > 0) {
           console.log(`[Investigator] Found ${freshItems.length} new items. Extending session.`)
           currentState.pending_items = [...currentState.pending_items, ...freshItems]
       } else {
           return {
              content: "C'est tout bon pour le bilan ! Merci d'avoir pris ce temps. Repose-toi bien. 🌙",
              investigationComplete: true,
              newState: null
          }
       }
  }

  // 3. ITEM COURANT
  const currentItem = currentState.pending_items[currentState.current_item_index]
  
  // RAG : Récupérer l'historique de cet item
  const itemHistory = await getItemHistory(supabase, userId, currentItem.id, currentItem.type)

  // RAG : Récupérer le contexte général (Memories + Insights)
  const generalContext = await retrieveContext(supabase, message)

  // 4. GENERATE RESPONSE / TOOL CALL
  
  const systemPrompt = `
    Tu es Sophia (Mode : Investigateur / Bilan).
    Ton but : Faire le point sur les actions du jour avec l'utilisateur.
    Ton ton : Bienveillant, curieux, jamais dans le jugement, mais précis.
    
    RÈGLE ABSOLUE : TU TUTOIES L'UTILISATEUR. JAMAIS DE VOUVOIEMENT.
    Tu es sa partenaire, pas son médecin ou son patron.

    ITEM ACTUEL À VÉRIFIER :
    - Type : ${currentItem.type === 'vital' ? 'Signe Vital (KPI)' : (currentItem.type === 'framework' ? 'Exercice / Framework' : 'Action / Habitude')}
    - Titre : "${currentItem.title}"
    - Description : "${currentItem.description || ''}"
    - Tracking : ${currentItem.tracking_type} ${currentItem.unit ? `(Unité: ${currentItem.unit})` : ''}

    HISTORIQUE RÉCENT SUR CET ITEM (RAG) :
    ${itemHistory}
    (Utilise ces infos pour contextualiser ta question. Ex: "C'est mieux qu'hier ?" ou "Encore bloqué par la fatigue ?")

    CONTEXTE GÉNÉRAL / SOUVENIRS (RAG) :
    ${generalContext}

    HISTORIQUE RÉCENT DE LA CONVERSATION :
    ${history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
    User: "${message}"

    TA MISSION :
    1. Si on vient de commencer ou si l'utilisateur n'a pas encore donné l'info pour CET item : 
       -> POSE LA QUESTION. (Ex: "Alors, ce sommeil, combien d'heures ?").
    2. Si l'utilisateur a répondu (même avec un commentaire ou une question rhétorique) :
       -> APPELLE L'OUTIL "log_action_execution" IMMÉDIATEMENT.
       -> Interprète intelligemment : "Fait", "En entier", "Oui", "C'est bon" => status='completed'.
       -> Ne repose pas la question si la réponse est dedans ("Je l'ai fait mais..."). Loggue l'action et mets le reste en note.
       -> Si c'est un échec ("Non j'ai pas fait"), sois empathique et essaie de capter la raison dans le champ "note" de l'outil.
    3. Si l'utilisateur veut reporter ou ne pas répondre :
       -> Passe à la suite (appelle l'outil avec status='missed' et note='Reporté').

    CAS PRÉCIS "JE L'AI FAIT" (URGENT):
    Si le message de l'utilisateur contient "fait", "fini", "ok", "bien", "oui", "réussi", "plitot", "plutôt" (même avec des fautes) :
    -> TU N'AS PAS LE CHOIX : APPELLE L'OUTIL "log_action_execution".
    -> NE RÉPONDS PAS PAR DU TEXTE. APPELLE L'OUTIL.
    -> Si tu as un doute, LOGGUE EN "completed".
    -> C'est mieux de logguer par erreur que de bloquer l'utilisateur.

    RÈGLES :
    - Ne pose qu'une question à la fois.
    - Si l'utilisateur semble avoir oublié ce qu'est l'item (ex: "C'est quoi ?", "C'est à dire ?"), utilise la DESCRIPTION fournie pour lui expliquer brièvement AVANT de redemander s'il l'a fait.
    - INTERDICTION ABSOLUE DE DIRE "BONJOUR", "SALUT", "HELLO" sauf si c'est le tout premier message de la conversation (historique vide).
    - Si l'utilisateur dit "J'ai tout fait", tu peux essayer de logguer l'item courant comme 'completed' mais méfie-toi, vérifie item par item si possible ou demande confirmation. Pour l'instant, check item par item.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Utilise 1 smiley (maximum 2) par message pour être sympa mais focus.
  `

  console.log(`[Investigator] Generating response for item: ${currentItem.title}`)

  let response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3, 
    false,
    [LOG_ACTION_TOOL],
    "auto"
  )

  if (typeof response === 'string') {
      response = response.replace(/\*\*/g, '')
  }

  if (typeof response === 'object' && response.tool === 'log_action_execution') {
      // L'IA a décidé de logguer
      console.log(`[Investigator] Logging item ${currentItem.title}:`, response.args)
      
      const argsWithId = { 
          ...response.args, 
          item_id: currentItem.id, 
          item_type: currentItem.type,
          item_title: currentItem.title 
      }
      
      await logItem(supabase, userId, argsWithId)
      
      // On passe au suivant
      const nextIndex = currentState.current_item_index + 1
      const nextState = {
          ...currentState,
          current_item_index: nextIndex
      }
      
      console.log(`[Investigator] Moving to item index ${nextIndex}. Total items: ${currentState.pending_items.length}`)
      
      if (nextIndex >= currentState.pending_items.length) {
          console.log("[Investigator] All items checked. Closing investigation.")
          return {
              content: "Merci, c'est noté. Le bilan est terminé ! ✅",
              investigationComplete: true,
              newState: null
          }
      } else {
          const nextItem = currentState.pending_items[nextIndex]
          console.log(`[Investigator] Next item: ${nextItem.title}`)
          const transitionPrompt = `
            Tu viens de noter "${currentItem.title}" (${argsWithId.status}).
            Maintenant, enchaîne naturellement pour demander à propos de : "${nextItem.title}".
            Sois fluide. PAS DE GRAS (**).
            INTERDICTION ABSOLUE DE DIRE "BONJOUR", "SALUT", "HELLO". Enchaîne direct sur la question suivante.
            Exemple : "C'est noté. Et pour X ?"
          `
          let transitionText = await generateWithGemini(transitionPrompt, "Transitionne.", 0.7)
          
          if (typeof transitionText === 'string') {
              transitionText = transitionText.replace(/\*\*/g, '')
          }
          
          return {
              content: typeof transitionText === 'string' ? transitionText : `C'est noté. Et pour ${nextItem.title} ?`,
              investigationComplete: false,
              newState: nextState
          }
      }
  }

  // Sinon, c'est une question ou une réponse texte
  return {
      content: response as string,
      investigationComplete: false,
      newState: currentState
  }
}
