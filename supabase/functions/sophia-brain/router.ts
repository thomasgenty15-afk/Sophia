import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserState, updateUserState, logMessage, AgentMode, getCoreIdentity } from './state-manager.ts'
import { runSentry } from './agents/sentry.ts'
import { runFirefighter } from './agents/firefighter.ts'
import { runInvestigator } from './agents/investigator.ts'
import { runArchitect } from './agents/architect.ts'
import { runCompanion } from './agents/companion.ts'
import { runAssistant } from './agents/assistant.ts'
import { runWatcher } from './agents/watcher.ts'
import { generateWithGemini, generateEmbedding } from '../_shared/gemini.ts'

// RAG Helper
async function retrieveContext(supabase: SupabaseClient, message: string): Promise<string> {
  try {
    const embedding = await generateEmbedding(message);
    const { data: memories } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.65, 
      match_count: 3,
      filter_type: 'insight' // Default: Only search ACTIVE insights (not history)
      // Note: We don't filter by source_type here, we want EVERYTHING (module, daily, plan)
    });

    if (!memories || memories.length === 0) return "";

    return memories.map((m: any) => 
      `[Souvenir (${m.source_type} - ${m.source_id || '?'}): ${m.content}]`
    ).join('\n\n');
  } catch (err) {
    console.error("Error retrieving context:", err);
    return "";
  }
}

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

  // --- LOGIC VEILLEUR (Watcher) ---
  let msgCount = (state.unprocessed_msg_count || 0) + 1
  let lastProcessed = state.last_processed_at || new Date().toISOString()

  if (msgCount >= 15) {
      // Trigger watcher analysis
      await runWatcher(supabase, userId, lastProcessed)
      msgCount = 0
      lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // 3. Analyse du Chef de Gare (Dispatcher)
  const { targetMode, riskScore } = await analyzeIntentAndRisk(userMessage, state)

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await updateUserState(supabase, userId, { risk_level: riskScore })
  }

  // 4.5 RAG Retrieval (Forge Memory)
  // Only for Architect, Companion, Firefighter
  let context = "";
  if (['architect', 'companion', 'firefighter'].includes(targetMode)) {
    // A. Vector Memory
    const vectorContext = await retrieveContext(supabase, userMessage);
    
    // B. Core Identity (Temple)
    const identityContext = await getCoreIdentity(supabase, userId);
    
    context = ""
    if (identityContext) context += `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identityContext}\n\n`;
    if (vectorContext) context += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${vectorContext}`;
    
    if (context) {
      console.log(`[Context] Loaded Identity (${identityContext.length} chars) + Vectors (${vectorContext.length} chars)`);
    }
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
      const ffResult = await runFirefighter(userMessage, history, context)
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
      responseContent = await runArchitect(userMessage, history, context)
      break
    case 'assistant':
      responseContent = await runAssistant(userMessage)
      nextMode = 'companion' 
      break
    case 'companion':
    default:
      responseContent = await runCompanion(userMessage, history, state, context)
      break
  }

  // 6. Mise à jour du mode final et log réponse
  await updateUserState(supabase, userId, { 
    current_mode: nextMode,
    unprocessed_msg_count: msgCount,
    last_processed_at: lastProcessed
  })
  await logMessage(supabase, userId, 'assistant', responseContent, targetMode)

  return {
    content: responseContent,
    mode: targetMode
  }
}
