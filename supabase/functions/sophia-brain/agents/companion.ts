import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../../_shared/gemini.ts'

// --- OUTILS ---
const TRACK_PROGRESS_TOOL = {
  name: "track_progress",
  description: "Enregistre une progression (Action faite ou Signe Vital mesuré). À utiliser quand l'utilisateur dit 'J'ai fait mon sport', 'J'ai fumé 3 clopes', 'J'ai dormi 8h'.",
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

// --- HELPER DE TRACKING (Dupliqué pour indépendance) ---
async function handleTracking(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    const { target_name, value, operation } = args
    const searchTerm = target_name.trim()

    // 1. Chercher dans les ACTIONS actives
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

        return `Top, c'est noté ! ✅ (Action : **${action.title}**)`
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

        return `C'est enregistré. 📊 (**${sign.label}** : ${newValue} ${sign.unit || ''})`
    }

    return `Je voulais noter "**${target_name}**" mais je ne le trouve pas dans ton plan actif. On l'a peut-être nommé autrement ?`
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
    
    TON SUPER-POUVOIR (TRACKING) :
    - Si l'utilisateur te dit qu'il a fait quelque chose ("J'ai couru", "J'ai bien mangé", "J'ai fumé"), UTILISE L'OUTIL "track_progress" pour le noter.
    - Fais-le naturellement, sans casser la conversation. Valide et continue.

    LISTE NOIRE (MOTS INTERDITS) :
    - "N'hésite pas à..."
    - "Je suis là pour t'aider"
    - "En tant que..."
    - "Salut" (Sauf si l'user vient de le dire)

    CONTEXTE UTILISATEUR :
    - Risque actuel : ${userState.risk_level}/10
    ${context ? `\nCONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${context}` : ""}
  `

  const historyText = history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  const response = await generateWithGemini(
    systemPrompt, 
    `Historique:\n${historyText}\n\nUser: ${message}`,
    0.7,
    false,
    [TRACK_PROGRESS_TOOL]
  )

  if (typeof response === 'object' && response.tool === 'track_progress') {
      console.log(`[Companion] 🛠️ Tool Call: track_progress`)
      return await handleTracking(supabase, userId, response.args)
  }

  return response as string
}
