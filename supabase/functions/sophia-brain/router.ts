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
import { verifyBilanAgentMessage, verifyPostCheckupAgentMessage } from './verifier.ts'

const SOPHIA_CHAT_MODEL =
  (Deno.env.get("GEMINI_SOPHIA_CHAT_MODEL") ?? "").trim() || "gemini-3-flash-preview";

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
  // - We avoid overly broad tokens like "plus tard" / "pas maintenant" which are often deferrals, not cancellations.
  return /\b(?:stop|pause|arr[êe]te|arr[êe]tons|annule|annulons|on\s+(?:arr[êe]te|arr[êe]tons|stop|annule|annulons)|je\s+veux\s+(?:arr[êe]ter|stopper)|on\s+peut\s+arr[êe]ter|change(?:r)?\s+de\s+sujet|on\s+change\s+de\s+sujet|parl(?:er)?\s+d['’]autre\s+chose|on\s+parle\s+d['’]autre\s+chose|pas\s+de\s+(?:bilan|check|checkup)|stop\s+(?:le\s+)?(?:bilan|check|checkup)|arr[êe]te\s+(?:le\s+)?(?:bilan|check|checkup)|stop\s+this|stop\s+it|switch\s+topic)\b/i
    .test(m);
}

function shouldBypassCheckupLockForDeepWork(message: string, targetMode: AgentMode): boolean {
  if (targetMode !== "architect") return false;
  const s = (message ?? "").toString().toLowerCase();
  // When the user brings a clear planning/organization pain during bilan,
  // we allow Architect to answer (otherwise the hard guard forces Investigator and feels robotic).
  return /\b(planning|agenda|organisation|organisatio|priorit[ée]s?|ing[ée]rable|d[ée]bord[ée]|trop\s+de\s+trucs|overbook|surcharg[ée]|charge\s+mentale)\b/i.test(s);
}

function looksLikeExplicitResumeCheckupIntent(m: string): boolean {
  const s = (m ?? "").toString().toLowerCase().trim();
  if (!s) return false;
  return (
    /\b(finir|termine(?:r)?|reprendre|reprenons|continuer|continue|on\s+peut\s+finir|on\s+peut\s+terminer)\b/i.test(s) &&
    /\b(bilan|check(?:up)?|check)\b/i.test(s)
  );
}

function looksLikeMotivationScoreAnswer(message: string): boolean {
  const s = (message ?? "").toString().trim();
  // Accept "8", "8/10", "8 / 10", "10", "10/10"
  return /^(?:10|[0-9])(?:\s*\/\s*10)?$/.test(s);
}

function lastAssistantAskedForMotivation(lastAssistantMessage: string): boolean {
  const s = (lastAssistantMessage ?? "").toString().toLowerCase();
  return (
    s.includes("niveau de motivation") ||
    s.includes("sur une échelle") ||
    s.includes("sur une echelle") ||
    s.includes("échelle de 1 à 10") ||
    s.includes("echelle de 1 a 10")
  );
}

function looksLikeHowToExerciseQuestion(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase();
  if (!s) return false;
  // "comment je fais", "comment je m'y prends", etc., about concrete exercises
  if (!/\b(comment|comment\s+faire|comment\s+je|je\s+m['’]y\s+prends|mode\s+d['’]emploi|proc[ée]dure)\b/i.test(s)) return false;
  return /\b(respir|cycle|journal|carnet|exercice|rituel|micro[-\s]?pause)\b/i.test(s);
}

function looksLikeWorkPressureVenting(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase();
  if (!s) return false;
  // Typical WhatsApp venting language: not necessarily an emotional emergency.
  if (!/\b(boulot|travail|job|boss|client|réunion|reunion|deadline)\b/i.test(s)) return false;
  if (!/\b(pression|stress|sous\s+pression|débord[ée]|deborde|cerveau\s+en\s+vrac|surcharg[ée]|charge\s+mentale|j'en\s+peux\s+plus)\b/i.test(s)) return false;
  // Do NOT match explicit panic/crisis keywords (handled elsewhere).
  if (/\b(panique|crise|attaque|je\s+craque|d[ée]tresse|urgence)\b/i.test(s)) return false;
  return true;
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

    STABILITÉ CHECKUP (RENFORCÉE) :
    - Si \`investigation_state\` est actif (bilan en cours), tu renvoies \`investigator\` dans 100% des cas.
    - SEULE EXCEPTION: l’utilisateur demande explicitement d’arrêter le bilan / changer de sujet (ex: "stop le bilan", "arrête le check", "on arrête", "on change de sujet").
    - "plus tard", "pas maintenant", "on en reparlera" NE sont PAS des stops.

    POST-BILAN (PARKING LOT) :
    - Si \`investigation_state.status = post_checkup\`, le bilan est terminé.
    - Tu ne dois JAMAIS proposer de "continuer/reprendre le bilan".
    - Tu dois router vers l’agent adapté au sujet reporté (companion par défaut, architect si organisation/planning/priorités, firefighter si détresse).
    
    2. Si le mode en cours est 'architect' :
       - RESTE en 'architect' sauf si c'est une URGENCE VITALE (Sentry).
       - Même si l'utilisateur râle ("ça marche pas", "je ne vois rien"), l'Architecte est le mieux placé pour réessayer. L'assistant technique ne sert à rien pour le contenu du plan.
    
    SORTIE JSON ATTENDUE :
    {
      "targetMode": "le_nom_du_mode",
      "riskScore": (0 = calme, 10 = danger vital)
    }
  `
  const systemPrompt = basePrompt

  try {
    const response = await generateWithGemini(systemPrompt, message, 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher",
    })
    return JSON.parse(response as string)
  } catch (e) {
    console.error("Erreur Dispatcher Gemini:", e)
    // Fallback de sécurité
    return { targetMode: 'companion', riskScore: 0 }
  }
}

function looksLikeAcuteDistress(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase();
  if (!s.trim()) return false;
  // Keep conservative: only clear crisis/panic language.
  return /\b(panique|crise|je\s+craque|je\s+n['’]en\s+peux\s+plus|au\s+bout|d[ée]tresse|angoisse\s+(?:forte|intense)|aide\s+vite|urgence)\b/i
    .test(s);
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
  const isEvalParkingLotTest =
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("MODE TEST PARKING LOT")) ||
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("CONSIGNE TEST PARKING LOT"));
  function looksLikeAttrapeRevesActivation(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase()
    if (!s) return false
    // "Attrape-Rêves Mental" can be written in many ways; keep the matcher permissive but specific.
    const mentions =
      /(attrape)\s*[-–—]?\s*(r[eê]ves?|r[êe]ve)\b/i.test(s) ||
      /\battrape[-\s]*r[eê]ves?\b/i.test(s)
    if (!mentions) return false
    // Activation intent: user explicitly asks to activate/do it now.
    return /\b(active|activez|activer|lance|lancer|on\s+y\s+va|vas[-\s]*y|go)\b/i.test(s)
  }

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
  let loggedMessageId: string | null = null
  if (logMessages) {
    const { data: inserted } = await supabase.from('chat_messages').insert({
      user_id: userId,
      scope,
      role: 'user',
      content: userMessage,
      metadata: opts?.messageMetadata ?? {}
    }).select('id').single()
    loggedMessageId = inserted?.id
  }

  // --- DEBOUNCE / ANTI-RACE CONDITION (Option 2) ---
  // On attend un court instant pour laisser arriver d'autres messages en rafale.
  // Ensuite, on vérifie si notre message est toujours le "dernier" en date.
  // Si un message plus récent existe, on abandonne ce thread (le thread du message suivant traitera le tout).
  
  const DEBOUNCE_WAIT_MS = 3500 // 3.5s : Le bon compromis réactivité / sécurité
  
  if (loggedMessageId) {
      await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS))

      // Vérification : Suis-je toujours le dernier message user ?
      const { data: latestMsg } = await supabase
          .from('chat_messages')
          .select('id, created_at')
          .eq('user_id', userId)
          .eq('scope', scope)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

      if (latestMsg && latestMsg.id !== loggedMessageId) {
          console.log(`[Router] 🛑 Race condition avoided. Current msg ${loggedMessageId} is older than latest ${latestMsg.id}. Aborting.`)
          // On renvoie une réponse vide ou un signal spécial pour dire "j'ai rien fait"
          // Le webhook appelant doit gérer ça (ignorer le retour).
          return { content: "", mode: "companion", aborted: true }
      }
      
      // Si on est le dernier, on continue.
      // Note : On doit re-récupérer l'historique complet pour inclure les messages arrivés pendant le sleep.
      // (La fonction processMessage reçoit `history` en argument, mais il est peut-être périmé maintenant).
      // Dans l'architecture actuelle, `history` est passé par l'appelant (run-evals/serve ou whatsapp-webhook).
      // Idéalement, on devrait refetcher l'historique ICI.
      
      // On va patcher `history` avec les messages manqués si besoin, ou on fait confiance au context retrieval.
      // Pour faire simple et robuste : on recharge les derniers messages user depuis la DB et on les ajoute à `history`.
      
      const { data: recentMessages } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('user_id', userId)
          .eq('scope', scope)
          .order('created_at', { ascending: false })
          .limit(5) // On regarde juste les tout derniers
      
      // On reconstruit un petit historique frais
      if (recentMessages) {
          // L'historique passé en arg est peut-être [A], alors qu'en base on a [B, A].
          // On veut s'assurer que `history` contient bien A et B.
          // Le plus simple est de remplacer les derniers items de history par la vérité terrain, 
          // ou de concaténer ce qui manque.
          // Vu que `processMessage` est stateless, on peut juste utiliser recentMessages inversé pour la fin de l'historique ?
          // Non, `history` contient aussi tout le contexte précédent.
          
          // Hack propre : On concatène le message actuel (déjà dans history normalement ?) 
          // Attends, `userMessage` est passé en arg. Il n'est PAS dans `history` (history = passé).
          // Donc si B arrive après A :
          // Thread A : userMessage = A. Sleep. Check DB -> B existe. Abort.
          // Thread B : userMessage = B. Sleep. Check DB -> B est last. Continue.
          // MAIS : Thread B a reçu `history` qui ne contient QUE le passé avant B... c'est à dire A !
          // Donc Thread B va traiter B, avec A dans son historique. C'est EXACTEMENT ce qu'on veut.
          // Le seul risque, c'est si A n'était pas encore commité en base quand B a fetché son history.
          // Mais Thread A a fait son insert AVANT le sleep de B (en théorie, ou presque).
          
          // Pour être SÛR à 100% que le message A est pris en compte dans le contexte de B :
          // On va re-fetcher les messages récents de l'utilisateur (rôle user) qui sont arrivés
          // entre le début du thread B et maintenant.
          
          // En fait, le `history` passé à processMessage vient du client ou d'un fetch pré-process.
          // Si on est dans le cas WhatsApp, le webhook fetch l'historique AVANT d'appeler processMessage.
          // Donc si A et B arrivent très vite :
          // 1. Webhook A fetch history (vide). Appelle process(A). Log A. Sleep.
          // 2. Webhook B fetch history (vide, car A pas encore commité ou race). Appelle process(B). Log B. Sleep.
          // 3. A wake up. B est là. A abort.
          // 4. B wake up. B est last. B continue.
          // PROBLÈME : B a été appelé avec un history VIDE (il a raté A).
          // SOLUTION : B doit, après son sleep, aller chercher les messages "orphelins" (comme A) qui sont en base 
          // mais pas dans son `history` local, et les concaténer à `userMessage` ou à `history`.
          
          // Stratégie "Agglomération" :
          // On prend tous les messages USER récents (depuis 10s) qui sont en base.
          // On les concatène dans l'ordre chrono.
          // Le "userMessage" effectif devient "Message A. Message B."
          
          const now = new Date()
          const tenSecondsAgo = new Date(now.getTime() - 10000).toISOString()
          
          const { data: burstMessages } = await supabase
              .from('chat_messages')
              .select('content, created_at')
              .eq('user_id', userId)
              .eq('scope', scope)
              .eq('role', 'user')
              .gte('created_at', tenSecondsAgo)
              .order('created_at', { ascending: true })
              
          if (burstMessages && burstMessages.length > 1) {
              // On a détecté une rafale (A, B...)
              // On remplace `userMessage` par la concaténation de tout ça.
              const combinedContent = burstMessages.map(m => m.content).join(" \n\n")
              console.log(`[Router] 🔗 Burst detected. Merging ${burstMessages.length} messages into one prompt.`)
              userMessage = combinedContent
              // On ne touche pas à history, car history c'est le passé lointain.
              // Les messages récents de la rafale sont maintenant dans `userMessage`.
          }
      }
  }

  // 2. Récupérer l'état actuel (Mémoire)
  let state = await getUserState(supabase, userId, scope)
  // Context string injected into agent prompts (must be declared before any post-checkup logic uses it).
  let context = ""
  
  const outageTemplate =
    "Je te réponds dès que je peux, je dois gérer une urgence pour le moment."

  async function enqueueLlmRetryJob(reason: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("enqueue_llm_retry_job", {
        p_user_id: userId,
        p_scope: scope,
        p_channel: channel,
        p_message: userMessage,
        p_metadata: {
          reason,
          request_id: meta?.requestId ?? null,
          source: "sophia-brain:router",
          investigation_active: Boolean(state?.investigation_state),
        },
      })
      if (error) throw error
      return data ? String(data) : null
    } catch (e) {
      console.error("[Router] enqueue_llm_retry_job failed (non-blocking):", e)
      return null
    }
  }

  // Emergency AI response:
  // If an agent throws (often due to provider overload), we still want to return a real AI-written reply.
  // We try a minimal, robust generation (with the global retry+fallback inside generateWithGemini).
  async function tryEmergencyAiReply(params: {
    targetMode: AgentMode;
    checkupActive: boolean;
    isPostCheckup: boolean;
  }): Promise<string | null> {
    try {
      const emergencySystem = `
Tu es Sophia.
Contrainte: le système a eu un souci temporaire, mais tu DOIS quand même répondre utilement et naturellement.

RÈGLES:
- Français, tutoiement.
- Ne mentionne pas d'erreur technique, pas de "je suis saturée", pas de "renvoie ton message".
- Réponse courte (max ~6 lignes). 1 question max.
- Si CHECKUP actif: ne pars pas sur un autre sujet, garde le fil.
- Si POST-BILAN actif: traite le sujet en cours, ne propose jamais de "reprendre le bilan".

CONTEXTE:
- targetMode=${params.targetMode}
- checkupActive=${params.checkupActive ? "true" : "false"}
- postCheckup=${params.isPostCheckup ? "true" : "false"}
      `.trim();

      const model =
        (Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "").trim() ||
        // Last resort: stable model name
        "gemini-2.0-flash";

      const out = await generateWithGemini(emergencySystem, userMessage, 0.2, false, [], "auto", {
        requestId: meta?.requestId,
        userId,
        model,
        source: "sophia-brain:router_emergency",
        forceRealAi: meta?.forceRealAi,
      });
      if (typeof out === "string" && out.trim()) return out;
      return null;
    } catch (e) {
      console.error("[Router] emergency AI reply failed:", e);
      return null;
    }
  }

  // --- LOGIC VEILLEUR (Watcher) ---
  let msgCount = (state.unprocessed_msg_count || 0) + 1
  let lastProcessed = state.last_processed_at || new Date().toISOString()

  if (msgCount >= 15 && !isEvalParkingLotTest) {
    // Trigger watcher analysis (best effort).
    // IMPORTANT: do NOT block the user response on watcher work (it can add significant wall-clock time).
    runWatcher(supabase, userId, scope, lastProcessed, meta).catch((e) => {
      console.error("[Router] watcher failed (non-blocking):", e)
    })
    msgCount = 0
    lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // 3. Analyse du Chef de Gare (Dispatcher)
  // On récupère le dernier message de l'assistant pour le contexte
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const lastAssistantAgent = history.filter((m: any) => m.role === 'assistant').pop()?.agent_used || null;
  
  const analysis = await analyzeIntentAndRisk(userMessage, state, lastAssistantMessage, meta)
  const riskScore = analysis.riskScore
  // If a forceMode is requested (e.g. module conversation), we keep safety priority for sentry.
  let targetMode: AgentMode = (analysis.targetMode === 'sentry' ? 'sentry' : (opts?.forceMode ?? analysis.targetMode))

  // WhatsApp routing guardrails:
  // When Architect is running an onboarding "micro-sequence" (motivation score -> first concrete step),
  // do not let the dispatcher fall back to Companion on short numeric replies.
  if ((meta?.channel ?? "web") === "whatsapp") {
    if (
      looksLikeMotivationScoreAnswer(userMessage) &&
      lastAssistantAskedForMotivation(lastAssistantMessage) &&
      lastAssistantAgent === "architect"
    ) {
      targetMode = "architect";
    }
    if (looksLikeHowToExerciseQuestion(userMessage)) {
      // Prefer Architect for "how-to" instructions about concrete exercises/actions.
      targetMode = "architect";
    }
    // Avoid over-triggering Firefighter for normal work pressure venting on WhatsApp.
    if (targetMode === "firefighter" && looksLikeWorkPressureVenting(userMessage) && !looksLikeAcuteDistress(userMessage)) {
      targetMode = "companion";
    }
  }

  // Guardrail: during an active checkup, do NOT route to firefighter for "stress" talk unless
  // risk is elevated or the message clearly signals acute distress.
  // This prevents breaking the checkup flow for normal "stress/organisation" topics.
  const checkupActive = Boolean(state?.investigation_state);
  const stopCheckup = isExplicitStopCheckup(userMessage);
  if (checkupActive && !stopCheckup && targetMode === "firefighter" && riskScore <= 1 && !looksLikeAcuteDistress(userMessage)) {
    targetMode = "investigator";
  }

  // Manual checkup resumption:
  // If the user explicitly asks to finish/resume the bilan while we are in post-bilan,
  // exit post-bilan state and route to investigator so the checkup can be restarted cleanly.
  if (
    looksLikeExplicitResumeCheckupIntent(userMessage) &&
    (state?.investigation_state?.status === "post_checkup" || state?.investigation_state?.status === "post_checkup_done")
  ) {
    try {
      await updateUserState(supabase, userId, scope, { investigation_state: null })
      state = { ...(state ?? {}), investigation_state: null }
    } catch (e) {
      console.error("[Router] failed to exit post-checkup for resume request (non-blocking):", e)
    }
    targetMode = "investigator"
  }

  // Deterministic routing for specific exercise activations (important on WhatsApp).
  // This avoids the message being treated as small-talk and ensures the framework can be created.
  if (targetMode !== "sentry" && targetMode !== "firefighter" && looksLikeAttrapeRevesActivation(userMessage)) {
    targetMode = "architect"
  }

  // Start checkup/investigator only when it makes sense:
  // - If a checkup is already active, the hard guard below keeps investigator stable.
  // - Otherwise, require explicit intent ("bilan/check") OR a clear progress signal tied to an action/plan.
  // This prevents accidental "bilan mode" launches from noisy classifier outputs.
  // (moved earlier) const checkupActive / stopCheckup
  const dailyBilanReply = looksLikeDailyBilanAnswer(userMessage, lastAssistantMessage)
  if (!checkupActive && !stopCheckup && dailyBilanReply) {
    targetMode = 'investigator'
  }
  const shouldStartInvestigator = looksLikeExplicitCheckupIntent(userMessage) || looksLikeActionProgress(userMessage)
  if (!checkupActive && targetMode === 'investigator' && !shouldStartInvestigator) {
    targetMode = 'companion'
  }

  // Capture deferred topics ONLY when Sophia explicitly defers them during an active checkup.
  // We do this in router (not in investigator) to keep the checkup agent simple.
  function assistantDeferredTopic(assistantText: string): boolean {
    const s = (assistantText ?? "").toString().toLowerCase()
    // Examples to catch:
    // - "On pourra en reparler après / à la fin du bilan"
    // - "On garde ça pour la fin"
    // - "On verra ça après"
    // - "On en discute après le bilan"
    const hasLater =
      /\b(apr[èe]s|plus\s+tard|tout\s+[àa]\s+l['’]?heure|quand\s+on\s+aura\s+fini|fin\s+du\s+bilan|à\s+la\s+fin|quand\s+tu\s+veux|quand\s+tu\s+voudr\w*)\b/i.test(s)
    const hasDeferralVerb =
      // include conjugations like "on gardera", "on garde", etc. (use prefix "on gard")
      /\b(on\s+pourra|on\s+peut|on\s+gard\w*|on\s+verra|on\s+reviendr\w*|on\s+revien\w*|on\s+reprendr\w*|on\s+repren\w*|on\s+prendr\w*|on\s+prend\w*|on\s+en\s+reparl\w*|on\s+en\s+parl\w*|on\s+en\s+discut\w*|on\s+met\s+[çc]a\s+de\s+c[oô]t[eé]|on\s+le\s+met\s+de\s+c[oô]t[eé]|on\s+met\s+[çc]a\s+de\s+c[oô]t[eé])\b/i
        .test(s)
    // Accept explicit "on en reparlera / on en discutera" even without a time anchor.
    const explicitWeWillTalkAgain =
      /\bon\s+en\s+reparl\w*\b/i.test(s) ||
      /\bon\s+en\s+discut\w*\b/i.test(s) ||
      /\bon\s+pourra\s+en\s+reparler\b/i.test(s) ||
      /\bon\s+pourra\s+en\s+discuter\b/i.test(s) ||
      /\bon\s+peut\s+en\s+reparler\b/i.test(s) ||
      /\bon\s+peut\s+en\s+discuter\b/i.test(s) ||
      // Common phrasing: "on pourra y revenir / revenir sur X"
      /\bon\s+pourra\s+y\s+revenir\b/i.test(s) ||
      /\bon\s+pourra\s+revenir\b/i.test(s) ||
      // Catch "on y reviendra" (very common in FR) + generic "on reviendra"
      /\bon\s+y\s+reviendr\w*\b/i.test(s) ||
      /\bon\s+reviendr\w*\b/i.test(s) ||
      // Catch "on reviendra dessus / là-dessus"
      /\bon\s+reviendr\w*\s+(?:dessus|l[àa]-?dessus)\b/i.test(s)
    return (hasLater && hasDeferralVerb) || explicitWeWillTalkAgain
  }

  function extractDeferredTopicFromUserMessage(userMsg: string): string {
    const m = (userMsg ?? "").toString().trim()
    if (!m) return ""

    const normalizeTopic = (raw: string): string => {
      let s = (raw ?? "").toString().trim()
      if (!s) return ""
      // Strip leading discourse fillers that are not the topic.
      s = s.replace(/^(?:mais|en\s+fait|du\s+coup|bon|bref|alors|ok)\b[,:]?\s*/i, "").trim()
      s = s.replace(/^c['’]est\s+vrai\s+que\s+/i, "").trim()
      // Remove surrounding quotes
      s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim()
      // If the user message contains an explicit deferral, keep only the part BEFORE it.
      // This prevents storing the whole paragraph including "on en reparlera après".
      s = s.split(/\bon\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b/i)[0]?.trim() ?? s
      // Remove trailing "after" / deferral / filler fragments that often follow the true topic
      // e.g. "mon organisation générale si tu veux, mais" -> "mon organisation générale"
      // e.g. "mon stress, si tu veux" -> "mon stress"
      s = s.replace(/\b(apr[èe]s\s+(?:le\s+)?bilan)\b/gi, "").trim()
      // If we have commas, the first clause is usually the clean topic BUT
      // avoid discourse markers like "D'ailleurs," / "Au fait," which are not the topic.
      if (s.includes(",")) {
        const parts = s.split(",").map((p) => p.trim()).filter(Boolean)
        const first = parts[0] ?? ""
        const isMarker =
          /^(d['’]?ailleurs|au\s+fait|sinon|bon|bref|du\s+coup|tiens|ok|alors)$/i.test(first)
        s = (isMarker ? (parts[1] ?? first) : first).trim()
      }
      // Strip common trailing fillers repeatedly
      for (let i = 0; i < 4; i++) {
        const before = s
        s = s
          .replace(/\s+(?:s['’]il\s+te\s+pla[iî]t|s['’]il\s+vous\s+pla[iî]t|si\s+tu\s+veux|si\s+vous\s+voulez|du\s+coup|enfin|bref)\s*$/i, "")
          .replace(/\s*(?:,|\.)?\s*(?:mais|par\s+contre|donc)\s*$/i, "")
          .trim()
        if (s === before) break
      }
      // Final safety: truncate overly long topics
      return s.slice(0, 160)
    }

    // High-precision shortcuts (common in FR): extract the noun phrase directly.
    const org = /\b(?:mon|ma|mes)\s+organisation(?:\s+(?:au|du)\s+travail)?\b/i.exec(m)
    if (org?.[0]) return normalizeTopic(org[0])
    const stress = /\b(?:mon|ma|mes)\s+stress(?:\s+(?:au|du)\s+travail)?\b/i.exec(m)
    if (stress?.[0]) return normalizeTopic(stress[0])

    // Direct "on en reparlera de X" patterns.
    const r0 =
      /\bon\s+en\s+(?:reparl\w*|parl\w*|discut\w*)\s+(?:de|du|des|d['’])\s+(.+?)(?:\b(?:apr[èe]s|plus\s+tard)\b|[.?!]|$)/i
        .exec(m)
    if (r0?.[1]) return normalizeTopic(r0[1])

    // "pour X, on en reparle après" patterns (very common).
    const r0b =
      /(?:\b(?:pour|concernant|sur)\b)\s+(.+?)[,;:]\s*on\s+en\s+(?:reparl\w*|parl\w*|discut\w*)\s+(?:apr[èe]s|plus\s+tard)\b/i.exec(
        m,
      )
    if (r0b?.[1]) return normalizeTopic(r0b[1])
    // Try to extract the clause right before a "we'll talk later" marker.
    // Example:
    //  "… j'ai l'impression que mon organisation est chaotique…, on pourra en parler plus tard"
    const r1 =
      /(?:j['’]ai\s+l['’]impression\s+que|je\s+pense\s+que|je\s+crois\s+que|c['’]est\s+que)\s+(.+?)(?:[,.!?]\s*)?(?:on\s+(?:pourra|peut)\s+(?:en\s+parler|en\s+reparler|en\s+discuter|y\s+revenir|revenir)\s+(?:plus\s+tard|apr[èe]s)|on\s+y\s+reviendr\w*|on\s+en\s+reparler\w*)\b/i
        .exec(m)
    if (r1?.[1]) return normalizeTopic(r1[1])

    // Fallback: keep the tail sentence (often the topic is right before the deferral phrase).
    const parts = m.split(/[.?!]/).map((x) => x.trim()).filter(Boolean)
    let tail = parts.length ? parts[parts.length - 1] : m
    // If the tail is just a deferral marker ("On en reparle après..."), the actual topic is usually the previous sentence.
    if (parts.length >= 2 && userExplicitlyDefersTopic(tail) && tail.length <= 80) {
      tail = parts[parts.length - 2] ?? tail
    }
    // If we still ended up with a pure deferral phrase, bail out.
    if (/^\s*on\s+(?:en\s+)?reparl\w*/i.test(tail)) {
      tail = parts.length >= 2 ? (parts[parts.length - 2] ?? tail) : tail
    }
    return normalizeTopic(tail)
  }

  function userExplicitlyDefersTopic(userMsg: string): boolean {
    const s = (userMsg ?? "").toString().toLowerCase()
    if (!s.trim()) return false
    // User indicates "let's talk later" (we capture topic for post-bilan parking-lot).
    return (
      /\b(on\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b)/i.test(s) &&
      /\b(apr[èe]s|plus\s+tard)\b/i.test(s)
    )
  }

  function appendDeferredTopicToState(currentState: any, topic: string): any {
    const prev = currentState?.temp_memory?.deferred_topics ?? []
    const t = String(topic ?? "").trim()
    if (!t) return currentState
    const norm = (x: unknown) =>
      String(x ?? "")
        .toLowerCase()
        .replace(/[“”"']/g, "")
        .replace(/\s+/g, " ")
        .trim()
    const tN = norm(t)
    // Drop useless topics that are too generic/noisy.
    if (!tN || tN.length < 4) return currentState
    if (/^(d['’]ailleurs|bref|ok|oui|merci|c['’]est\s+bon)$/i.test(tN)) return currentState
    const exists =
      Array.isArray(prev) &&
      prev.some((x: any) => {
        const xN = norm(x)
        return xN === tN || xN.includes(tN) || tN.includes(xN)
      })
    const nextTopics = exists ? prev : [...(Array.isArray(prev) ? prev : []), t.slice(0, 120)]
    // Keep the list bounded (avoid loops).
    const bounded = Array.isArray(nextTopics) ? nextTopics.slice(-3) : nextTopics
    return {
      ...(currentState ?? {}),
      temp_memory: { ...((currentState ?? {})?.temp_memory ?? {}), deferred_topics: bounded },
    }
  }

  const isPostCheckup = state?.investigation_state?.status === "post_checkup"

  // HARD GUARD: during an active checkup/bilan, only investigator may answer (unless explicit stop).
  // We still allow safety escalation (sentry/firefighter) to override.
  if (
    checkupActive &&
    !isPostCheckup &&
    !stopCheckup &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    !shouldBypassCheckupLockForDeepWork(userMessage, targetMode)
  ) {
    targetMode = "investigator";
  }

  // If the user explicitly says "we'll talk about X later/after", capture that topic immediately.
  // This ensures the end-of-bilan transition can reliably enter post-checkup mode.
  if (checkupActive && !isPostCheckup && !stopCheckup && userExplicitlyDefersTopic(userMessage)) {
    try {
      const latest = await getUserState(supabase, userId, scope)
      if (latest?.investigation_state) {
        const extracted = extractDeferredTopicFromUserMessage(userMessage)
        const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || "Sujet à reprendre"
        const updatedInv = appendDeferredTopicToState(latest.investigation_state, topic)
        await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
        // Keep local in-memory state in sync so later "preserve deferred_topics" merges don't drop it.
        // (The Investigator branch below uses `state` as a baseline when it writes invResult.newState.)
        state = { ...(state ?? {}), investigation_state: updatedInv }
      }
    } catch (e) {
      console.error("[Router] user deferred topic store failed (non-blocking):", e)
    }
  }

  // --- POST-CHECKUP PARKING LOT (router-owned state machine) ---
  // State shape stored in user_chat_states.investigation_state:
  // { status: "post_checkup", temp_memory: { deferred_topics: string[], current_topic_index: number } }
  function userSignalsTopicDone(m: string): boolean {
    const s = (m ?? "").toString().trim().toLowerCase()
    if (!s) return false
    // Include "oui" because users commonly answer "Oui, merci" to the closing question.
    return /\b(oui|c['’]est\s+bon|ok|merci|suivant|passons|on\s+avance|continue|on\s+continue|ça\s+va|c['’]est\s+clair)\b/i.test(s)
  }

  if (isPostCheckup && targetMode !== "sentry") {
    const deferredTopics = state?.investigation_state?.temp_memory?.deferred_topics ?? []
    const idx = Number(state?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
    let closedThisTurn = false

    // If the user explicitly stops during post-bilan, close the parking lot immediately.
    if (stopCheckup) {
      if (isEvalParkingLotTest) {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            status: "post_checkup_done",
            temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString(), stopped_by_user: true },
          },
        })
      } else {
        await updateUserState(supabase, userId, scope, { investigation_state: null })
      }
      targetMode = "companion"
      closedThisTurn = true
    }

    // If user confirms "ok/next" -> advance to next topic immediately (no agent call for this turn).
    if (!closedThisTurn && userSignalsTopicDone(userMessage)) {
      const nextIdx = idx + 1
      if (nextIdx >= deferredTopics.length) {
        if (isEvalParkingLotTest) {
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: nextIdx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
        closedThisTurn = true
      } else {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            ...state.investigation_state,
            temp_memory: { ...state.investigation_state.temp_memory, current_topic_index: nextIdx },
          },
        })
        targetMode = "companion"
      }
    }

    // If still in post-checkup after the potential advance, route to handle current topic.
    // IMPORTANT: if we just closed post-checkup (e.g. user said "merci/ok"), do NOT proceed to topic-selection.
    // Otherwise we may overwrite the just-written post_checkup_done marker (current_topic_index) in the "Nothing to do -> close" branch.
    if (!closedThisTurn) {
      const state2 = await getUserState(supabase, userId, scope)
      const deferred2 = state2?.investigation_state?.temp_memory?.deferred_topics ?? []
      const idx2 = Number(state2?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
      const topic = deferred2[idx2]

      if (topic) {
        // Choose agent
        if (/\b(planning|agenda|organisation|programme|plan)\b/i.test(topic)) targetMode = "architect"
        else if (/\b(panique|crise|je\s+craque|d[ée]tresse|urgence)\b/i.test(topic)) targetMode = "firefighter"
        else if (/\b(stress|angoisse|tension)\b/i.test(topic)) targetMode = "companion"
        else targetMode = "companion"

        const topicContext =
          `=== MODE POST-BILAN (SUJET REPORTÉ ${idx2 + 1}/${deferred2.length}) ===\n` +
          `SUJET À TRAITER MAINTENANT : "${topic}"\n` +
          `CONSIGNE : C'est le moment d'en parler. Traite ce point.\n` +
          `RÈGLES CRITIQUES :\n` +
          `- Le bilan est DÉJÀ TERMINÉ.\n` +
          `- Interdiction de dire "après le bilan" ou de proposer de continuer/reprendre le bilan.\n` +
          `- Ne pose pas de questions de bilan sur d'autres actions/vitals.\n` +
          `- Ne pousse pas "le plan" / des actions/frameworks non activés. Sois compagnon: si l'utilisateur n'en parle pas, n'insiste pas.\n` +
        `VALIDATION : Termine par "C'est bon pour ce point ?" UNIQUEMENT quand tu as donné ton conseil principal et que tu veux valider/avancer.\n` +
        `NE LE RÉPÈTE PAS à chaque message si la discussion continue.`;
        context = `${topicContext}\n\n${context}`.trim()
      } else {
        // Nothing to do -> close
        if (isEvalParkingLotTest) {
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
      }
    }
  }

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore })
  }

  // 4.5 RAG Retrieval (Forge Memory)
  // Only for Architect, Companion, Firefighter
  const injectedContext = context
  context = ""
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
    if (injectedContext) context += `${injectedContext}\n\n`
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
        const emergency = await tryEmergencyAiReply({ targetMode, checkupActive, isPostCheckup })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob("firefighter_failed_all_models")
          responseContent = outageTemplate
        }
        nextMode = 'companion'
      }
      break
    case 'investigator':
      try {
          console.log("[Router] Starting Investigator execution...")
          const invResult = await runInvestigator(
            supabase,
            userId,
            userMessage,
            history,
            state.investigation_state,
            { ...(meta ?? {}), model: SOPHIA_CHAT_MODEL },
          )
          console.log("[Router] Investigator result received:", invResult ? "OK" : "NULL")
          
          responseContent = invResult.content
          if (invResult.investigationComplete) {
              // If we have deferred topics, transition into router-owned post-checkup mode.
              // Edge case: Investigator completion can clear investigation_state immediately.
              // We must also consider the pre-existing deferred topics from the in-memory state,
              // otherwise we lose the parking-lot and end with a generic close.
              const prevDeferred = state?.investigation_state?.temp_memory?.deferred_topics ?? []
              const stAfter = await getUserState(supabase, userId, scope)
              const deferred = stAfter?.investigation_state?.temp_memory?.deferred_topics ?? prevDeferred
              if (deferred.length > 0) {
                await updateUserState(supabase, userId, scope, {
                  investigation_state: { status: "post_checkup", temp_memory: { deferred_topics: deferred, current_topic_index: 0 } },
                })
                responseContent =
                  // Transition message: make it explicit that the bilan is done, then pivot to the deferred topic.
                  `Ok, on a fini le bilan.\n\n` +
                  `Tu m'avais dit qu'on reparlerait de : "${deferred[0]}".\n` +
                  `Tu veux qu'on commence par ça ?`
                nextMode = 'companion'
              } else {
                nextMode = 'companion'
                await updateUserState(supabase, userId, scope, { investigation_state: null })
              }
          } else {
              // Always preserve existing deferred_topics when Investigator updates state.
              // IMPORTANT: deferred_topics can be appended by router earlier in this same turn.
              // If we only look at the stale in-memory `state`, we can accidentally drop them.
              const latestSt = await getUserState(supabase, userId, scope)
              const prevTopics = latestSt?.investigation_state?.temp_memory?.deferred_topics ?? []
              if (Array.isArray(prevTopics) && prevTopics.length > 0) {
                invResult.newState = {
                  ...(invResult.newState ?? {}),
                  temp_memory: { ...((invResult.newState ?? {})?.temp_memory ?? {}), deferred_topics: prevTopics },
                }
              }
              await updateUserState(supabase, userId, scope, { investigation_state: invResult.newState })
          }
      } catch (err) {
          console.error("[Router] ❌ CRITICAL ERROR IN INVESTIGATOR:", err)
          const emergency = await tryEmergencyAiReply({ targetMode, checkupActive, isPostCheckup })
          if (emergency) {
            responseContent = emergency
          } else {
            await enqueueLlmRetryJob("investigator_failed_all_models")
            responseContent = outageTemplate
          }
          nextMode = 'companion'
      }
      break
    case 'architect':
      try {
        responseContent = await runArchitect(
          supabase,
          userId,
          userMessage,
          history,
          state,
          context,
          { ...(meta ?? {}), model: SOPHIA_CHAT_MODEL },
        )
      } catch (e) {
        console.error("[Router] architect failed:", e)
        const emergency = await tryEmergencyAiReply({ targetMode, checkupActive, isPostCheckup })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob("architect_failed_all_models")
          responseContent = outageTemplate
        }
        nextMode = 'companion'
      }
      // Post-bilan rule: always end with the validation phrase (routing injected context requires it).
      if (isPostCheckup && typeof responseContent === "string" && responseContent.trim() && !/c['’]est\s+bon\s+pour\s+ce\s+point\s*\?/i.test(responseContent)) {
        responseContent = `${responseContent.trim()}\n\nC'est bon pour ce point ?`
      }
      break
    case 'assistant':
      try {
        responseContent = await runAssistant(userMessage, meta)
        nextMode = 'companion'
      } catch (e) {
        console.error("[Router] assistant failed:", e)
        const emergency = await tryEmergencyAiReply({ targetMode, checkupActive, isPostCheckup })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob("assistant_failed_all_models")
          responseContent = outageTemplate
        }
        nextMode = 'companion'
      }
      break
    case 'companion':
    default:
      try {
        responseContent = await runCompanion(
          supabase,
          userId,
          userMessage,
          history,
          state,
          context,
          { ...(meta ?? {}), model: SOPHIA_CHAT_MODEL },
        )
      } catch (e) {
        console.error("[Router] companion failed:", e)
        const emergency = await tryEmergencyAiReply({ targetMode, checkupActive, isPostCheckup })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob("companion_failed_all_models")
          responseContent = outageTemplate
        }
        nextMode = 'companion'
      }
      break
  }

  responseContent = normalizeChatText(responseContent)

  // During an active checkup, if ANY agent explicitly defers ("on pourra en reparler après"),
  // we store the current user message as a deferred topic in investigation_state.temp_memory.deferred_topics.
  // This must happen regardless of which agent answered (investigator/firefighter/architect/companion),
  // otherwise we cannot test or use the parking-lot reliably.
  if (checkupActive && !stopCheckup && targetMode !== "sentry" && assistantDeferredTopic(responseContent)) {
    try {
      const latest = await getUserState(supabase, userId, scope)
      const extracted = extractDeferredTopicFromUserMessage(userMessage)
      const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || "Sujet à reprendre"
      if (latest?.investigation_state) {
        const updatedInv = appendDeferredTopicToState(latest.investigation_state, topic)
        await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
      } else {
        // Critical edge case:
        // Investigator may have just cleared investigation_state at the end of the bilan, then produced
        // a closing message that *also* defers a topic (or acknowledges a user deferral).
        // If we don't persist it here, the parking-lot is lost and the post-bilan flow never runs.
        await updateUserState(supabase, userId, scope, {
          investigation_state: { status: "post_checkup", temp_memory: { deferred_topics: [topic], current_topic_index: 0 } },
        })
      }
    } catch (e) {
      console.error("[Router] deferred topic store failed (non-blocking):", e)
    }
  }

  // --- BILAN VERIFIER (global): if a checkup is active, verify ANY non-investigator response too ---
  // This keeps Architect/Companion/Firefighter outputs short and coherent while the bilan is ongoing.
  // We never rewrite Sentry outputs, and we avoid double-verifying Investigator (already gated inside).
  if (checkupActive && !stopCheckup && targetMode !== "sentry" && targetMode !== "investigator") {
    try {
      const verified = await verifyBilanAgentMessage({
        draft: responseContent,
        agent: targetMode,
        data: {
          user_message: userMessage,
          agent: targetMode,
          channel,
          // Minimal but critical context for coherence during bilan:
          investigation_state: state?.investigation_state ?? null,
          // Extra helpful context (already computed for these agents):
          context_excerpt: (context ?? "").toString().slice(0, 2000),
        },
        meta: {
          requestId: meta?.requestId,
          forceRealAi: meta?.forceRealAi,
          channel: meta?.channel,
          // Use a model that is known to exist on the configured Gemini endpoint.
          // (Some environments don't have "gemini-3-flash", which causes long retry loops.)
          model: (Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "").trim() || "gemini-2.5-flash",
          userId,
        },
      })
      responseContent = normalizeChatText(verified.text)
    } catch (e) {
      console.error("[Router] bilan verifier failed (non-blocking):", e)
    }
  }

  // --- POST-CHECKUP VERIFIER (extra strict) ---
  // In post-bilan mode, enforce "no more bilan" language and a consistent close question.
  if (isPostCheckup && targetMode !== "sentry") {
    try {
      const verified = await verifyPostCheckupAgentMessage({
        draft: responseContent,
        agent: targetMode,
        data: {
          user_message: userMessage,
          agent: targetMode,
          channel,
          post_checkup: true,
          investigation_state: state?.investigation_state ?? null,
          context_excerpt: (context ?? "").toString().slice(0, 2200),
        },
        meta: {
          requestId: meta?.requestId,
          forceRealAi: meta?.forceRealAi,
          channel: meta?.channel,
          model: (Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "").trim() || "gemini-2.5-flash",
          userId,
        },
      })
      responseContent = normalizeChatText(verified.text)
    } catch (e) {
      console.error("[Router] post_checkup verifier failed (non-blocking):", e)
    }
  }

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
