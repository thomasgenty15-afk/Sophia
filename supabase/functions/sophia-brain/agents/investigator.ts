import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../../_shared/gemini.ts'

// --- OUTILS ---

const LOG_ACTION_TOOL = {
  name: "log_action_execution",
  description: "Enregistre le résultat d'une action ou d'un signe vital pour la journée.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "L'ID de l'action ou du signe vital." },
      item_type: { type: "STRING", enum: ["action", "vital"], description: "Type d'élément." },
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
  type: 'action' | 'vital'
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

async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<CheckupItem[]> {
    const today = new Date().toISOString().split('T')[0]
    const hour = new Date().getHours()
    
    // Déterminer le "time_of_day" actuel approximatif
    let timeFilter: string[] = ['any_time']
    if (hour < 11) timeFilter.push('morning')
    if (hour >= 11 && hour < 18) timeFilter.push('afternoon')
    if (hour >= 18) timeFilter.push('evening', 'night')

    // 1. Fetch Actions
    const { data: actions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('time_of_day', timeFilter)

    // 2. Fetch Vital Signs
    const { data: vitals } = await supabase
        .from('user_vital_signs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // 3. Filter already done today
    // On doit checker user_action_entries et user_vital_sign_entries
    const { data: actionEntries } = await supabase
        .from('user_action_entries')
        .select('action_id')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00`)

    const { data: vitalEntries } = await supabase
        .from('user_vital_sign_entries')
        .select('vital_sign_id')
        .eq('user_id', userId)
        .gte('recorded_at', `${today}T00:00:00`)

    const doneActionIds = new Set(actionEntries?.map(e => e.action_id))
    const doneVitalIds = new Set(vitalEntries?.map(v => v.vital_sign_id))

    const pending: CheckupItem[] = []

    // Map Actions
    actions?.forEach(a => {
        if (!doneActionIds.has(a.id)) {
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

    // Map Vitals (Toujours prioritaires au checkup)
    vitals?.forEach(v => {
        if (!doneVitalIds.has(v.id)) {
            pending.push({
                id: v.id,
                type: 'vital',
                title: v.label || v.name, // Fallback name
                tracking_type: 'counter', // Vitals are mostly counters
                unit: v.unit
            })
        }
    })

    // Tri : Vitals d'abord, puis Actions
    return pending.sort((a, b) => (a.type === 'vital' ? -1 : 1))
}

async function logItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { item_id, item_type, status, value, note } = args
    
    if (item_type === 'action') {
        // Update Action Stats
        if (status === 'completed') {
             // Increment current_reps only if completed
             // Mais attention, user_actions.current_reps est un compteur global ou streak ? 
             // Dans le code actuel Architect, c'est un compteur. On fait +1.
             // On va lire la valeur actuelle pour faire +1 proprement ou utiliser rpc si on voulait être atomique.
             // Simplification : On update last_performed_at.
             
             await supabase.from('user_actions').update({
                 last_performed_at: new Date().toISOString()
             }).eq('id', item_id)
             
             // TODO: Gérer l'incrément de current_reps intelligemment (reset hebdo ?)
        }

        // Log Entry
        await supabase.from('user_action_entries').insert({
            user_id: userId,
            action_id: item_id,
            status: status,
            value: value,
            note: note,
            performed_at: new Date().toISOString()
        })
    } else {
        // Vital Sign
        await supabase.from('user_vital_signs').update({
             current_value: String(value),
             last_checked_at: new Date().toISOString()
        }).eq('id', item_id)

        // On a besoin du plan_id/submission_id pour vital_entries, on fait une requête rapide
        const { data: vital } = await supabase.from('user_vital_signs').select('plan_id, submission_id').eq('id', item_id).single()

        await supabase.from('user_vital_sign_entries').insert({
            user_id: userId,
            vital_sign_id: item_id,
            plan_id: vital?.plan_id,
            submission_id: vital?.submission_id,
            value: String(value),
            recorded_at: new Date().toISOString()
        })
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
      // On lance direct la première question sans attendre le user
      // Mais ici on est dans une fonction "run" appelée après un message user.
      // Sauf si le routeur appelle runInvestigator avec un message vide pour l'init ?
      // Supposons que le user a dit "Check du soir".
  }

  // 2. CHECK SI FINI
  if (currentState.current_item_index >= currentState.pending_items.length) {
       return {
          content: "C'est tout bon pour le bilan ! Merci d'avoir pris ce temps. Repose-toi bien. 🌙",
          investigationComplete: true,
          newState: null
      }
  }

  // 3. ITEM COURANT
  const currentItem = currentState.pending_items[currentState.current_item_index]
  
  // 4. GENERATE RESPONSE / TOOL CALL
  // On donne le contexte de l'item à l'IA et on lui demande soit de poser la question, soit de logguer si l'user a répondu.
  
  const systemPrompt = `
    Tu es Sophia (Mode : Investigateur / Bilan).
    Ton but : Faire le point sur les actions du jour avec l'utilisateur.
    Ton ton : Bienveillant, curieux, jamais dans le jugement, mais précis.

    ITEM ACTUEL À VÉRIFIER :
    - Type : ${currentItem.type === 'vital' ? 'Signe Vital (KPI)' : 'Action / Habitude'}
    - Titre : "${currentItem.title}"
    - Description : "${currentItem.description || ''}"
    - Tracking : ${currentItem.tracking_type} ${currentItem.unit ? `(Unité: ${currentItem.unit})` : ''}

    HISTORIQUE RÉCENT :
    ${history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
    User: "${message}"

    TA MISSION :
    1. Si on vient de commencer ou si l'utilisateur n'a pas encore donné l'info pour CET item : 
       -> POSE LA QUESTION. (Ex: "Alors, ce sommeil, combien d'heures ?").
    2. Si l'utilisateur a répondu :
       -> APPELLE L'OUTIL "log_action_execution".
       -> Si c'est un échec ("Non j'ai pas fait"), sois empathique et essaie de capter la raison dans le champ "note" de l'outil.
    3. Si l'utilisateur veut reporter ou ne pas répondre :
       -> Passe à la suite (appelle l'outil avec status='missed' et note='Reporté').

    RÈGLES :
    - Ne pose qu'une question à la fois.
    - Si l'utilisateur dit "J'ai tout fait", tu peux essayer de logguer l'item courant comme 'completed' mais méfie-toi, vérifie item par item si possible ou demande confirmation. Pour l'instant, check item par item.
  `

  const response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3, 
    false,
    [LOG_ACTION_TOOL]
  )

  if (typeof response === 'object' && response.tool === 'log_action_execution') {
      // L'IA a décidé de logguer
      console.log(`[Investigator] Logging item ${currentItem.title}:`, response.args)
      
      // On force l'ID car l'IA peut halluciner l'ID
      const argsWithId = { ...response.args, item_id: currentItem.id, item_type: currentItem.type }
      
      await logItem(supabase, userId, argsWithId)
      
      // On passe au suivant
      const nextIndex = currentState.current_item_index + 1
      const nextState = {
          ...currentState,
          current_item_index: nextIndex
      }
      
      // Récursion pour enchaîner directement la question suivante ?
      // Pour éviter les aller-retours vides, on peut générer la phrase de transition + question suivante.
      
      if (nextIndex >= currentState.pending_items.length) {
          return {
              content: "Merci, c'est noté. Le bilan est terminé ! ✅",
              investigationComplete: true,
              newState: null
          }
      } else {
          const nextItem = currentState.pending_items[nextIndex]
          const transitionPrompt = `
            Tu viens de noter "${currentItem.title}" (${argsWithId.status}).
            Maintenant, enchaîne naturellement pour demander à propos de : "${nextItem.title}".
            Sois fluide.
          `
          const transitionText = await generateWithGemini(transitionPrompt, "Transitionne.", 0.7)
          
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
