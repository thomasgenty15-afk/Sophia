import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserState, updateUserState, logMessage, AgentMode, getCoreIdentity, getDashboardContext, normalizeScope } from './state-manager.ts'
import { runSentry } from './agents/sentry.ts'
import { runFirefighter } from './agents/firefighter.ts'
import { runInvestigator } from './agents/investigator.ts'
import { runArchitect } from './agents/architect.ts'
import { runCompanion, retrieveContext } from './agents/companion.ts'
import { runAssistant } from './agents/assistant.ts'
import { runWatcher } from './agents/watcher.ts'
import { generateWithGemini } from '../_shared/gemini.ts'
import { appendPromptOverride, fetchPromptOverride } from '../_shared/prompt-overrides.ts'

function normalizeChatText(text: string): string {
  // Some model outputs include the literal characters "\n" instead of real newlines.
  // Convert them so UI and WhatsApp both display properly.
  const raw = (text ?? "").toString().replace(/\\n/g, "\n");

  // Guardrail: strip accidental tool/code leakage (Gemini sometimes outputs pseudo-code like
  // "print(default_api.track_progress(...))" instead of calling tools).
  // We never want to show these to users.
  const lines = raw.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) {
      cleaned.push("");
      continue;
    }
    // Drop code fences and obvious tool invocations.
    if (l.startsWith("```")) continue;
    if (/^print\s*\(/i.test(l)) continue;
    if (/default_api\./i.test(l)) continue;
    if (/(track_progress|create_simple_action|create_framework|log_action_execution|break_down_action)\s*\(/i.test(l)) continue;
    cleaned.push(line);
  }
  // Collapse excessive empty lines after filtering.
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\*\*/g, "").trim();
}

function isExplicitStopCheckup(message: string): boolean {
  const m = (message ?? "").toString().trim();
  if (!m) return false;
  // Explicit stop / change topic signals (keep this conservative: only "clear stop" phrases).
  // Notes:
  // - We accept both generic stops ("stop", "arrête") and stop+topic ("stop le bilan", "arrête le check").
  // - We avoid overly broad tokens like just "laisse" which could appear in normal sentences.
  return /\b(?:stop|pause|arr[êe]te|arr[êe]tons|annule|annulons|on\s+(?:arr[êe]te|arr[êe]te|arr[êe]tons|stop|annule|annulons)|je\s+veux\s+(?:arr[êe]ter|stopper)|on\s+peut\s+arr[êe]ter|change(?:r)?\s+de\s+sujet|on\s+change\s+de\s+sujet|parl(?:er)?\s+d['’]autre\s+chose|on\s+parle\s+d['’]autre\s+chose|pas\s+maintenant|plus\s+tard|on\s+reprendra\s+plus\s+tard|pas\s+de\s+(?:bilan|check|checkup)|stop\s+(?:le\s+)?(?:bilan|check|checkup)|arr[êe]te\s+(?:le\s+)?(?:bilan|check|checkup)|stop\s+this|stop\s+it|switch\s+topic)\b/i
    .test(m);
}

// Classification intelligente par Gemini
async function analyzeIntentAndRisk(
  message: string,
  currentState: any,
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
): Promise<{ targetMode: AgentMode, riskScore: number }> {
  // Deterministic test mode: avoid LLM dependency and avoid writing invalid risk levels.
  if ((Deno.env.get("MEGA_TEST_MODE") ?? "").trim() === "1" && !meta?.forceRealAi) {
    const m = (message ?? "").toString().toLowerCase();
    // If an investigation is already active, ALWAYS keep investigator unless explicit stop.
    const hasStop = /\b(stop|arr[êe]te|on arr[êe]te|pause)\b/i.test(message ?? "");
    if (currentState?.investigation_state && !hasStop) return { targetMode: "investigator", riskScore: 0 };
    // Trigger investigator on common checkup intents.
    if (/\b(check|checkup|bilan)\b/i.test(m)) return { targetMode: "investigator", riskScore: 0 };
    return { targetMode: "companion", riskScore: 0 };
  }

  const basePrompt = `
    Tu es le "Chef de Gare" (Dispatcher) du système Sophia.
    Ton rôle est d'analyser le message de l'utilisateur pour décider QUEL AGENT doit répondre.
    
    DERNIER MESSAGE DE L'ASSISTANT (Contexte) :
    "${lastAssistantMessage.substring(0, 200)}..."
    
    LES AGENTS DISPONIBLES :
    1. sentry (DANGER VITAL) : Suicide, automutilation, violence immédiate. PRIORITÉ ABSOLUE.
    2. firefighter (URGENCE ÉMOTIONNELLE) : Panique, angoisse, craving fort, pleurs.
    3. investigator (DATA & BILAN) : L'utilisateur veut faire son bilan ("Check du soir", "Bilan"), donne des chiffres (cigarettes, sommeil), dit "J'ai fait mon sport", OU répond "Oui" à une invitation au bilan.
    4. architect (DEEP WORK & AIDE MODULE) : L'utilisateur parle de ses Valeurs, Vision, Identité, ou demande de l'aide pour un exercice. C'est AUSSI lui qui gère la création/modification du plan.
    5. assistant (TECHNIQUE PUR) : BUGS DE L'APPLICATION (Crash, écran blanc, login impossible). ATTENTION : Si l'utilisateur dit "Tu n'as pas créé l'action" ou "Je ne vois pas le changement", C'EST ENCORE DU RESSORT DE L'ARCHITECTE. Ne passe à 'assistant' que si l'app est cassée techniquement.
    6. companion (DÉFAUT) : Tout le reste. Discussion, "Salut", "Ça va", partage de journée.
    
    ÉTAT ACTUEL :
    Mode en cours : "${currentState.current_mode}"
    Checkup en cours : ${currentState.investigation_state ? "OUI" : "NON"}
    Risque précédent : ${currentState.risk_level}
    
    RÈGLE DE STABILITÉ (CRITIQUE) :
    1. Si un CHECKUP est en cours (investigation_state = OUI) :
       - RESTE sur 'investigator' si l'utilisateur répond à la question, même s'il râle, se plaint du budget ou fait une remarque.
       - L'investigateur doit finir son travail.
       - Ne change de mode que si l'utilisateur demande EXPLICITEMENT d'arrêter ("Stop", "Je veux parler d'autre chose").
    
    2. Si le mode en cours est 'architect' :
       - RESTE en 'architect' sauf si c'est une URGENCE VITALE (Sentry).
       - Même si l'utilisateur râle ("ça marche pas", "je ne vois rien"), l'Architecte est le mieux placé pour réessayer. L'assistant technique ne sert à rien pour le contenu du plan.
    
    SORTIE JSON ATTENDUE :
    {
      "targetMode": "le_nom_du_mode",
      "riskScore": (0 = calme, 10 = danger vital)
    }
  `
  const override = await fetchPromptOverride("sophia.dispatcher")
  const systemPrompt = appendPromptOverride(basePrompt, override)

  try {
    const response = await generateWithGemini(systemPrompt, message, 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.0-flash",
      source: "sophia-brain:dispatcher",
    })
    return JSON.parse(response as string)
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
  history: any[],
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string },
  opts?: { 
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
  }
) {
  function looksLikeExplicitCheckupIntent(m: string): boolean {
    const s = (m ?? "").toString()
    // Explicit user intent to run a checkup/bilan
    return /\b(check(?:up)?|bilan)\b/i.test(s)
  }

  function looksLikeActionProgress(m: string): boolean {
    const s = (m ?? "").toString()
    // Signals of progress/completion around actions/habits.
    // Keep conservative to avoid flipping into investigator on normal small talk.
    const progress =
      /\b(j['’]ai|j\s+ai|je\s+(?:n['’]?ai\s+pas|n['’]?ai|ai))\s+(?:fait|pas\s+fait|avanc[ée]e?|progress[ée]e?|termin[ée]e?|r[ée]ussi|tenu|coch[ée]e?|valid[ée]e?|compl[ée]t[ée]e?)\b/i
        .test(s) ||
      /\b(c['’]est\s+fait|c['’]est\s+bon|done)\b/i.test(s)
    const mentionsAction = /\b(action|objectif|habitude|t[âa]che|plan)\b/i.test(s)
    return progress && mentionsAction
  }

  function looksLikeDailyBilanAnswer(userMsg: string, lastAssistantMsg: string): boolean {
    const last = (lastAssistantMsg ?? "").toString().toLowerCase()
    const u = (userMsg ?? "").toString().trim()
    if (!u) return false
    // Our daily bilan prompt includes these two anchors; if the user replies right after it,
    // we treat it as a checkup kickoff so the Investigator covers vitals + actions + frameworks.
    const looksLikePrompt =
      last.includes("un truc dont tu es fier") &&
      last.includes("un truc à ajuster")
    return looksLikePrompt
  }

  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")

  const logMessages = opts?.logMessages !== false
  // 1. Log le message user
  if (logMessages) {
    await logMessage(supabase, userId, scope, 'user', userMessage, undefined, opts?.messageMetadata)
  }

  // 2. Récupérer l'état actuel (Mémoire)
  const state = await getUserState(supabase, userId, scope)

  // --- LOGIC VEILLEUR (Watcher) ---
  let msgCount = (state.unprocessed_msg_count || 0) + 1
  let lastProcessed = state.last_processed_at || new Date().toISOString()

  if (msgCount >= 15) {
      // Trigger watcher analysis (best effort: do not block user response on transient LLM errors)
      try {
        await runWatcher(supabase, userId, scope, lastProcessed, meta)
      } catch (e) {
        console.error("[Router] watcher failed (non-blocking):", e)
      }
      msgCount = 0
      lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // 3. Analyse du Chef de Gare (Dispatcher)
  // On récupère le dernier message de l'assistant pour le contexte
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  
  const analysis = await analyzeIntentAndRisk(userMessage, state, lastAssistantMessage, meta)
  const riskScore = analysis.riskScore
  // If a forceMode is requested (e.g. module conversation), we keep safety priority for sentry.
  let targetMode: AgentMode = (analysis.targetMode === 'sentry' ? 'sentry' : (opts?.forceMode ?? analysis.targetMode))

  // Start checkup/investigator only when it makes sense:
  // - If a checkup is already active, the hard guard below keeps investigator stable.
  // - Otherwise, require explicit intent ("bilan/check") OR a clear progress signal tied to an action/plan.
  // This prevents accidental "bilan mode" launches from noisy classifier outputs.
  const checkupActive = Boolean(state?.investigation_state);
  const stopCheckup = isExplicitStopCheckup(userMessage);
  const dailyBilanReply = looksLikeDailyBilanAnswer(userMessage, lastAssistantMessage)
  if (!checkupActive && !stopCheckup && dailyBilanReply) {
    targetMode = 'investigator'
  }
  const shouldStartInvestigator = looksLikeExplicitCheckupIntent(userMessage) || looksLikeActionProgress(userMessage)
  if (!checkupActive && targetMode === 'investigator' && !shouldStartInvestigator) {
    targetMode = 'companion'
  }

  // HARD GUARD: during an active checkup/bilan, only investigator may answer (unless explicit stop).
  // We still allow safety escalation (sentry/firefighter) to override.
  if (checkupActive && !stopCheckup && targetMode !== 'sentry' && targetMode !== 'firefighter') {
    targetMode = 'investigator';
  }

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore })
  }

  // 4.5 RAG Retrieval (Forge Memory)
  // Only for Architect, Companion, Firefighter
  let context = "";
  if (['architect', 'companion', 'firefighter'].includes(targetMode)) {
    // A. Vector Memory
    const vectorContext = await retrieveContext(supabase, userMessage);
    
    // B. Core Identity (Temple)
    const identityContext = await getCoreIdentity(supabase, userId);

    // C. Dashboard Context (Live Data)
    const dashboardContext = await getDashboardContext(supabase, userId);

    // D. Context Temporel
    const now = new Date();
    // Hack rapide pour l'heure de Paris (UTC+1 ou +2). On simplifie à UTC+1 pour l'instant
    const parisTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
    const timeContext = `NOUS SOMMES LE ${parisTime.toLocaleDateString('fr-FR')} À ${parisTime.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}.`;

    context = ""
    if (dashboardContext) context += `${dashboardContext}\n\n`; 
    if (timeContext) context += `=== REPÈRES TEMPORELS ===\n${timeContext}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`;
    if (identityContext) context += `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identityContext}\n\n`;
    if (vectorContext) context += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${vectorContext}`;
    
    if (context) {
      console.log(`[Context] Loaded Dashboard + Identity + Vectors`);
    }
  }
  if (opts?.contextOverride) {
    context = `=== CONTEXTE MODULE (UI) ===\n${opts.contextOverride}\n\n${context}`.trim()
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
      try {
        const ffResult = await runFirefighter(userMessage, history, context, meta)
        responseContent = ffResult.content
        if (ffResult.crisisResolved) nextMode = 'companion'
      } catch (e) {
        console.error("[Router] firefighter failed:", e)
        responseContent = "Je suis un peu saturée là. Donne-moi 10 secondes et renvoie ton message, ok ?"
        nextMode = 'companion'
      }
      break
    case 'investigator':
      try {
          console.log("[Router] Starting Investigator execution...")
          const invResult = await runInvestigator(supabase, userId, userMessage, history, state.investigation_state, meta)
          console.log("[Router] Investigator result received:", invResult ? "OK" : "NULL")
          
          responseContent = invResult.content
          if (invResult.investigationComplete) {
              nextMode = 'companion'
              await updateUserState(supabase, userId, scope, { investigation_state: null })
          } else {
              await updateUserState(supabase, userId, scope, { investigation_state: invResult.newState })
          }
      } catch (err) {
          console.error("[Router] ❌ CRITICAL ERROR IN INVESTIGATOR:", err)
          responseContent = "Désolée, j'ai eu un petit bug de cerveau pendant le bilan. On reprend ?"
          nextMode = 'companion'
      }
      break
    case 'architect':
      try {
        responseContent = await runArchitect(supabase, userId, userMessage, history, state, context, meta)
      } catch (e) {
        console.error("[Router] architect failed:", e)
        responseContent = "Je suis un peu saturée là. Renvoie ton dernier message dans quelques secondes et on reprend."
        nextMode = 'companion'
      }
      break
    case 'assistant':
      try {
        responseContent = await runAssistant(userMessage, meta)
        nextMode = 'companion'
      } catch (e) {
        console.error("[Router] assistant failed:", e)
        responseContent = "Je suis saturée. Rafraîchis et réessaie dans 10 secondes."
        nextMode = 'companion'
      }
      break
    case 'companion':
    default:
      try {
        responseContent = await runCompanion(supabase, userId, userMessage, history, state, context, meta)
      } catch (e) {
        console.error("[Router] companion failed:", e)
        responseContent = "Je suis un peu saturée. Réessaie dans quelques secondes."
        nextMode = 'companion'
      }
      break
  }

  responseContent = normalizeChatText(responseContent)

  // 6. Mise à jour du mode final et log réponse
  await updateUserState(supabase, userId, scope, { 
    current_mode: nextMode,
    unprocessed_msg_count: msgCount,
    last_processed_at: lastProcessed
  })
  if (logMessages) {
    await logMessage(supabase, userId, scope, 'assistant', responseContent, targetMode, opts?.messageMetadata)
  }

  return {
    content: responseContent,
    mode: targetMode
  }
}
