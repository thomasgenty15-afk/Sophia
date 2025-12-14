import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(supabase: SupabaseClient, message: string): Promise<string> {
  let contextString = "";
  try {
    const embedding = await generateEmbedding(message);

    // 1. Souvenirs (Memories)
    const { data: memories } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.65, 
      match_count: 5, 
    });

    if (memories && memories.length > 0) {
        contextString += "=== SOUVENIRS / CONTEXTE (FORGE) ===\n"
        contextString += memories.map((m: any) => {
          const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : 'Date inconnue';
          return `[Souvenir (${m.source_type}) du ${dateStr}] : ${m.content}`;
        }).join('\n\n');
        contextString += "\n\n";
    }

    // 2. Historique des Actions (Action Entries)
    // On cherche si des actions passées (réussites ou échecs) sont pertinentes pour la discussion
    const { data: actionEntries } = await supabase.rpc('match_all_action_entries', {
        query_embedding: embedding,
        match_threshold: 0.60, 
        match_count: 3
    });

    if (actionEntries && actionEntries.length > 0) {
        contextString += "=== HISTORIQUE DES ACTIONS PERTINENTES ===\n"
        contextString += actionEntries.map((e: any) => {
             const dateStr = new Date(e.performed_at).toLocaleDateString('fr-FR');
             const statusIcon = e.status === 'completed' ? '✅' : '❌';
             return `[${dateStr}] ${statusIcon} ${e.action_title} : "${e.note || 'Pas de note'}"`;
        }).join('\n');
        contextString += "\n\n";
    }

    return contextString;
  } catch (err) {
    console.error("Error retrieving context:", err);
    return "";
  }
}

// --- OUTILS ---
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

// --- HELPER DE TRACKING (Dupliqué pour indépendance) ---
async function handleTracking(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { target_name, value, operation, status } = args
    const searchTerm = target_name.trim()
    const entryStatus = status || 'completed' // Défaut à completed si pas précisé

    // 1. Chercher dans les ACTIONS actives
    const { data: actions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'pending'])
        .ilike('title', `%${searchTerm}%`)
        .limit(1)

    if (!actions || actions.length === 0) {
        // Aucune action trouvée => On ne tracke PAS. On renvoie un message naturel pour l'agent.
        // Important : On retourne une chaîne qui explique que l'action n'est pas suivie, pour que l'agent puisse rebondir.
        return `INFO_POUR_AGENT: L'action "${target_name}" n'est PAS dans le plan actif de l'utilisateur. Ne dis pas "C'est noté". Dis plutôt quelque chose comme "Ah trop bien pour [action], même si ce n'est pas dans ton plan officiel, c'est super !".`
    }

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
                        // DÉJÀ FAIT AUJOURD'HUI
                        // On ne crée PAS de nouvelle entrée dans l'historique pour éviter les doublons inutiles
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

        // A. Update user_actions (Aggregate)
        if (entryStatus === 'completed') {
             await supabase
                .from('user_actions')
                .update({ 
                    current_reps: newReps,
                    last_performed_at: new Date().toISOString()
                })
                .eq('id', action.id)
        }

        // B. Insert user_action_entries (History)
        const { error: entryError } = await supabase
            .from('user_action_entries')
            .insert({
                user_id: userId,
                action_id: action.id,
                action_title: action.title,
                status: entryStatus,
                value: value,
                performed_at: new Date().toISOString()
            })

        if (entryError) {
            console.error("Tracking Entry Error:", entryError)
        }

        if (entryStatus === 'missed') {
            return `C'est noté (Pas fait). 📉 (Action : ${action.title})`
        }
        return `Top, c'est noté ! ✅ (Action : ${action.title})`
    }

    // 2. Chercher dans les SIGNES VITAUX
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

        return `C'est enregistré. 📊 (${sign.label} : ${newValue} ${sign.unit || ''})`
    }

    // SI NI ACTION NI VITAL TROUVÉ (Double check de sécurité si on arrive ici)
    return `INFO_POUR_AGENT: Je ne trouve pas "${target_name}" dans le plan actif (Actions ou Signes Vitaux). Contente-toi de féliciter ou discuter, sans dire "C'est noté".`
}

export async function runCompanion(
  supabase: SupabaseClient,
  userId: string,
  message: string, 
  history: any[], 
  userState: any, 
  context: string = ""
): Promise<string> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";

  const systemPrompt = `
    Tu es Sophia.
    Tu n'es PAS une assistante, ni une IA générique. Tu es une "Partenaire de Vie".
    Ton but n'est pas de "servir", mais d'AVANCER avec l'utilisateur.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."
    
    TON STYLE (ORGANIC & FLUIDE) :
    - Écris comme on parle (Oralité). Utilise des tournures directes.
    - Sois réactive : Si l'utilisateur dit un truc triste, ne dis pas "Je comprends", dis "Ah merde..." ou "C'est dur ça."
    - Humour subtil autorisé.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Utilise 1 smiley (maximum 2) par message pour rendre le ton chaleureux, mais ne spamme pas. Place-les naturellement.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    
    TON SUPER-POUVOIR (TRACKING) :
    - Si l'utilisateur dit qu'il a FAIT une action : UTILISE "track_progress" avec status="completed".
    - Si l'utilisateur dit qu'il n'a PAS FAIT une action ("Non pas encore", "J'ai raté") : UTILISE "track_progress" avec status="missed" et value=0.
    - IMPORTANT : N'UTILISE "track_progress" QUE SI C'EST UNE ACTION/HABITUDE EXPLICITE (Sport, Cigarette, Sommeil, Lecture, etc.).
    - NE TRACKE PAS les états d'âme ou les projets généraux (ex: "J'ai fini mon projet pro"). Pour ça, discute juste.
    - NE JAMAIS AFFICHER DE CODE PYTHON OU D'APPEL D'API DANS LA RÉPONSE.

    LISTE NOIRE (MOTS INTERDITS) :
    - "N'hésite pas à..."
    - "Je suis là pour t'aider"
    - "En tant que..."
    - "Salut" (Sauf si l'user vient de le dire)

    CONTEXTE UTILISATEUR :
    - Risque actuel : ${userState.risk_level}/10
    ${context ? `\nCONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${context}` : ""}
    ${userState?.investigation_state ? `
    ⚠️ ATTENTION : UN CHECKUP EST ACTUELLEMENT EN COURS (investigation_state actif).
    L'utilisateur a fait une digression ou une remarque.
    Ton objectif ABSOLU est de ramener l'utilisateur vers le checkup.
    1. Réponds à sa remarque avec ton style "partenaire de vie" (empathie, humour si adapté).
    2. Termine OBLIGATOIREMENT par une question de relance pour le checkup (ex: "Bref, on continue le bilan ?", "Prêt pour la suite ?").
    Ne te lance pas dans une conversation longue. La priorité est de finir le checkup.
    ` : ""}
  `

  const historyText = history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  const response = await generateWithGemini(
    systemPrompt, 
    `Historique:\n${historyText}\n\nUser: ${message}`,
    0.7,
    false,
    [TRACK_PROGRESS_TOOL]
  )

  if (typeof response === 'string') {
    return response.replace(/\*\*/g, '')
  }

  if (typeof response === 'object' && response.tool === 'track_progress') {
      console.log(`[Companion] 🛠️ Tool Call: track_progress`)
      const trackingResult = await handleTracking(supabase, userId, response.args)
      
      // 3. Cas Standard : Succès du tracking
      // On veut éviter le message robotique "Top c'est noté !".
      // On demande à l'IA de générer une petite phrase de validation sympa + une ouverture.
      const confirmationPrompt = `
        ACTION VALIDÉE : "${response.args.target_name}"
        STATUT : ${response.args.status === 'missed' ? 'Raté / Pas fait' : 'Réussi / Fait'}
        
        CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
        Dernier message de l'utilisateur : "${message}"
        
        TA MISSION :
        1. Confirme que c'est pris en compte (sans dire "C'est enregistré dans la base de données").
        2. Félicite (si réussi) ou Encourage (si raté).
        3. SI l'utilisateur a donné des détails (ex: "J'ai lu et c'était pas mal"), REBONDIS SUR CES DÉTAILS. Ne pose pas une question générique.
        
        Exemple (User a dit "J'ai lu un super livre") : "Génial pour la lecture ! C'était quoi comme bouquin ?"
        Exemple (User a juste dit "J'ai fait") : "Super ! Tu te sens comment ?"
      `
      const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7)
      return typeof confirmationResponse === 'string' ? confirmationResponse.replace(/\*\*/g, '') : "Ça marche, c'est noté ! 👍"

  }

  return response as string
}
