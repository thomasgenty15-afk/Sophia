import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserState, updateUserState, logMessage, AgentMode } from './state-manager.ts'
import { runSentry } from './agents/sentry.ts'
import { runFirefighter } from './agents/firefighter.ts'
import { runInvestigator } from './agents/investigator.ts'
import { runArchitect } from './agents/architect.ts'
import { runCompanion } from './agents/companion.ts'
import { runAssistant } from './agents/assistant.ts'
import { generateWithGemini } from './lib/gemini.ts'

// Classification intelligente par Gemini
async function analyzeIntentAndRisk(message: string, currentState: any): Promise<{ targetMode: AgentMode, riskScore: number }> {
  const systemPrompt = `
    Tu es le "Chef de Gare" (Dispatcher) du système Sophia.
    Ton rôle est d'analyser le message de l'utilisateur pour décider QUEL AGENT doit répondre.
    
    LES AGENTS DISPONIBLES :
    1. sentry (DANGER VITAL) : Suicide, automutilation, violence immédiate. PRIORITÉ ABSOLUE.
    2. firefighter (URGENCE ÉMOTIONNELLE) : Panique, angoisse, craving fort, pleurs.
    3. investigator (DATA) : L'utilisateur donne des chiffres (cigarettes, sommeil) ou dit "J'ai fait mon sport".
    4. architect (DEEP WORK & AIDE MODULE) : L'utilisateur parle de ses Valeurs, Vision, Identité, ou demande de l'aide pour un exercice.
    5. assistant (TECHNIQUE) : Question sur l'app, bug, RGPD, prix, "Comment ça marche ?".
    6. companion (DÉFAUT) : Tout le reste. Discussion, "Salut", "Ça va", partage de journée.
    
    ÉTAT ACTUEL :
    Mode en cours : "${currentState.current_mode}"
    Risque précédent : ${currentState.risk_level}
    
    RÈGLE DE STABILITÉ :
    Si l'utilisateur est déjà en conversation suivie (ex: Architecte), ne change pas de mode sauf si c'est une URGENCE (Sentry/Firefighter) ou de la DATA (Investigator).
    
    SORTIE JSON ATTENDUE :
    {
      "targetMode": "le_nom_du_mode",
      "riskScore": (0 = calme, 10 = danger vital)
    }
  `

  try {
    const jsonStr = await generateWithGemini(systemPrompt, message, 0.0, true)
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error("Erreur Dispatcher Gemini:", e)
    // Fallback de sécurité
    return { targetMode: 'companion', riskScore: 0 }
  }
}

export async function processMessage(
  supabase: SupabaseClient, 
  userId: string, 
  userMessage: string,
  history: any[]
) {
  // 1. Log le message user
  await logMessage(supabase, userId, 'user', userMessage)

  // 2. Récupérer l'état actuel (Mémoire)
  const state = await getUserState(supabase, userId)

  // 3. Analyse du Chef de Gare (Dispatcher)
  const { targetMode, riskScore } = await analyzeIntentAndRisk(userMessage, state)

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await updateUserState(supabase, userId, { risk_level: riskScore })
  }

  // 5. Exécution de l'Agent Choisi
  let responseContent = ""
  let nextMode = targetMode

  console.log(`[Router] User: "${userMessage}" -> Dispatch: ${targetMode} (Risk: ${riskScore})`)

  switch (targetMode) {
    case 'sentry':
      responseContent = await runSentry(userMessage)
      break
    case 'firefighter':
      const ffResult = await runFirefighter(userMessage, history)
      responseContent = ffResult.content
      if (ffResult.crisisResolved) nextMode = 'companion'
      break
    case 'investigator':
      const invResult = await runInvestigator(supabase, userId, userMessage, state.investigation_state)
      responseContent = invResult.content
      if (invResult.investigationComplete) {
          nextMode = 'companion'
          await updateUserState(supabase, userId, { investigation_state: null })
      } else {
          await updateUserState(supabase, userId, { investigation_state: invResult.newState })
      }
      break
    case 'architect':
      responseContent = await runArchitect(userMessage, history)
      break
    case 'assistant':
      responseContent = await runAssistant(userMessage)
      nextMode = 'companion' 
      break
    case 'companion':
    default:
      responseContent = await runCompanion(userMessage, history, state)
      break
  }

  // 6. Mise à jour du mode final et log réponse
  await updateUserState(supabase, userId, { current_mode: nextMode })
  await logMessage(supabase, userId, 'assistant', responseContent, targetMode)

  return {
    content: responseContent,
    mode: targetMode
  }
}
