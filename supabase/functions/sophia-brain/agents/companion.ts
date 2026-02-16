import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { handleTracking } from "../lib/tracking.ts"
import { logEdgeFunctionError } from "../../_shared/error-log.ts"

export type CompanionModelOutput =
  | string
  | { tool: "track_progress"; args: any }

export type CompanionRunResult = {
  text: string
  executed_tools: string[]
  tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain"
}

export function buildCompanionSystemPrompt(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): string {
  const { isWhatsApp, lastAssistantMessage, context, userState } = opts
  const basePrompt = isWhatsApp ? `
    Tu es Sophia, une coach de vie orientée action.
    Tu tutoies l'utilisateur. Tu écris comme un humain, naturel, direct.

    MODE WHATSAPP (CRITIQUE) :
    - Réponse courte par défaut (2–6 lignes).
    - 1 question MAX.
    - Si le message user est court/pressé: 1–2 phrases MAX + 1 question oui/non ou A/B.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Emojis: 1 à 2 emojis max par message (minimum 1), placés naturellement; pas une ligne entière d'emojis. Tu peux utiliser n'importe quel emoji Unicode.
    - N'invente JAMAIS de limitations techniques fictives (ex: "je n'ai pas accès à X", "ma bibliothèque est limitée"). Si tu ne sais pas, dis-le simplement.
    - Ne mentionne jamais des rôles internes (architecte/investigator/etc.) ni "je suis une IA".
    - Si tu utilises le contexte, ne l'expose pas ("je vois dans ta base..."): juste utilise-le.

    TON JOB :
    - Avant de répondre, reconstitue mentalement le fil depuis le FIL ROUGE + l'historique récent.
    - Réponds toujours au DERNIER message utilisateur en priorité, sans perdre la cohérence du fil.
    - Réponds d'abord à ce que l'utilisateur dit.
    - Ensuite, propose UNE relance utile (ou une micro-question) sans changer de sujet.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== SESSION TOPIC ACTIVE ===", respecte la phase et reste sur le sujet.
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", suis strictement la redirection dashboard.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: ton calme, validation, une seule micro-question.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu l'aides avec une réponse coaching courte
      - Puis tu rediriges explicitement vers le tableau de bord pour effectuer l'opération
      - Tu n'annonces jamais qu'une action a été modifiée depuis le chat.

    TRACKING :
    - Si l'utilisateur dit qu'il a FAIT une action/habitude: appelle l'outil track_progress (status=completed).
    - S'il dit qu'il ne l'a PAS faite: track_progress (status=missed, value=0).

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les.

    USER MODEL (PRÉFÉRENCES - 10 types) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 120)}..."

    CONTEXTE (si présent) :
    ${context ? context : "(vide)"}
  ` : `
    Tu es Sophia, une coach de vie orientée action.
    Tu n'es PAS une assistante, ni une IA générique. Tu es une "Partenaire de Vie".
    Ton but n'est pas de "servir", mais d'AVANCER avec l'utilisateur.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."
    
    TON STYLE (ORGANIC & FLUIDE) :
    - Écris comme on parle (Oralité). Utilise des tournures directes.
    - Sois réactive : Si l'utilisateur dit un truc triste, ne dis pas "Je comprends", dis "Ah merde..." ou "C'est dur ça."
    - Humour subtil autorisé.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Emojis: 1 à 2 emojis max par message (minimum 1), placés naturellement; pas une ligne entière d'emojis. Tu peux utiliser n'importe quel emoji Unicode.
    - N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    - Ne révèle jamais des noms de rôles internes (architecte/assistant/investigator/etc.). Ne dis jamais "en tant que ..." ou "je suis une IA".

    ADAPTATION AU TON (CRITIQUE) :
    - Observe le ton du user. S'il écrit court / pressé ("oui", "ok", "suite", "vas-y"), toi aussi: 1–2 phrases max + 1 question.
    - Évite les envolées + slogans. Pas de slang type "gnaque", "soufflé", etc.
    - Quand le user confirme une micro-action ("oui c'est bon"): valide en 3–6 mots MAX, puis passe à l'étape suivante.
    - N'enchaîne PAS avec "comment tu te sens ?" sauf si le user exprime une émotion (stress, peur, motivation, fatigue).
    - RÈGLE STRICTE (user pressé) : si le dernier message du user fait <= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "go", "on y va":
      - MAX 2 phrases.
      - Puis 1 question courte (oui/non ou A/B).
      - Interdiction des paragraphes longs.

    COHÉRENCE CONTEXTUELLE (CRITIQUE) :
    - Avant de répondre, reconstruis le fil avec le FIL ROUGE + les ~15 derniers messages.
    - Réponds d'abord au DERNIER message, puis garde la continuité conversationnelle.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== SESSION TOPIC ACTIVE ===", respecte la phase et reste sur le sujet.
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", suis strictement la redirection dashboard.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: validation émotionnelle + 1 seule micro-question.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu aides d'abord (coaching, reformulation, clarification rapide),
      - puis tu rediriges clairement vers le tableau de bord pour faire l'opération.
    - Interdit d'affirmer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.

    USER MODEL (PRÉFÉRENCES - 10 types) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    
    TYPES DE FAITS PERSONNELS (10):
    1. conversation.tone: ton de communication ("direct", "doux", "cash")
    2. conversation.verbosity: longueur des reponses ("concis", "detaille")
    3. conversation.use_emojis: preference emojis ("avec", "sans", "peu")
    4. schedule.work_hours: horaires de travail ("9h-18h", "mi-temps")
    5. schedule.energy_peaks: moments d'energie ("matin", "soir")
    6. schedule.wake_time: heure de reveil ("6h30", "7h")
    7. schedule.sleep_time: heure de coucher ("23h", "minuit")
    8. personal.job: metier ("developpeur", "medecin")
    9. personal.hobbies: loisirs ("course", "lecture")
    10. personal.family: situation familiale ("2 enfants", "celibataire")
    
    - Si des facts existent, adapte ton style/timing sans le dire.

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les complètement.

    ONBOARDING / CONTEXTE (CRITIQUE) :
    - N'affirme jamais "on a X dans ton plan" / "dans le plan" / "c'est prévu dans ton plan"
      sauf si le CONTEXTE OPÉRATIONNEL indique explicitement une action active correspondante.

    CONTEXTE UTILISATEUR :
    - Risque actuel : ${userState?.risk_level ?? 0}/10
    ${context ? `\nCONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${context}` : ""}
  `
  return basePrompt
}

/**
 * Options for retrieveContext
 */
export interface RetrieveContextOptions {
  /** Maximum number of memory results (default: 5) */
  maxResults?: number
  /** Whether to include action history (default: true) */
  includeActionHistory?: boolean
}

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(
  supabase: SupabaseClient, 
  userId: string, 
  message: string,
  opts?: RetrieveContextOptions
): Promise<string> {
  const maxResults = opts?.maxResults ?? 5
  const includeActionHistory = opts?.includeActionHistory ?? true
  // For minimal mode (firefighter), we limit action history too
  const actionResultsCount = maxResults <= 2 ? 1 : 3
  
  let contextString = "";
  try {
    const embedding = await generateEmbedding(message);

    // 1. Souvenirs (Memories)
    // IMPORTANT:
    // - On web, the client is authed as the user -> auth.uid() works (use match_memories).
    // - On WhatsApp, we call Sophia via a service_role client -> auth.uid() is NULL.
    //   We therefore use service-role-only RPCs that accept an explicit user_id.
    const { data: memories, error: memErr } = await supabase.rpc('match_memories_for_user', {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.65,
      match_count: maxResults,
      filter_status: ["consolidated"],
    } as any);
    const { data: memoriesFallback } = memErr
      ? await supabase.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: maxResults,
        filter_status: ["consolidated"],
      } as any)
      : ({ data: null } as any);
    const effectiveMemories = (memErr ? memoriesFallback : memories) as any[] | null;

    if (effectiveMemories && effectiveMemories.length > 0) {
        contextString += effectiveMemories.map((m: any) => {
          const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : 'Date inconnue';
          return `[Souvenir (${m.source_type}) du ${dateStr}] : ${m.content}`;
        }).join('\n\n');
        contextString += "\n\n";
    }

    // 2. Historique des Actions (Action Entries)
    // On cherche si des actions passées (réussites ou échecs) sont pertinentes pour la discussion
    // Skip for minimal mode (firefighter) if explicitly disabled
    if (includeActionHistory) {
      const { data: actionEntries, error: actErr } = await supabase.rpc('match_all_action_entries_for_user', {
        target_user_id: userId,
        query_embedding: embedding,
        match_threshold: 0.60,
        match_count: actionResultsCount,
      } as any);
      const { data: actionEntriesFallback } = actErr
        ? await supabase.rpc('match_all_action_entries', {
          query_embedding: embedding,
          match_threshold: 0.60,
          match_count: actionResultsCount,
        } as any)
        : ({ data: null } as any);
      const effectiveActionEntries = (actErr ? actionEntriesFallback : actionEntries) as any[] | null;

      if (effectiveActionEntries && effectiveActionEntries.length > 0) {
          contextString += "=== HISTORIQUE DES ACTIONS PERTINENTES ===\n"
          contextString += effectiveActionEntries.map((e: any) => {
               const dateStr = new Date(e.performed_at).toLocaleDateString('fr-FR');
               const statusIcon = e.status === 'completed' ? '✅' : '❌';
               return `[${dateStr}] ${statusIcon} ${e.action_title} : "${e.note || 'Pas de note'}"`;
          }).join('\n');
          contextString += "\n\n";
      }
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

export async function generateCompanionModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<CompanionModelOutput> {
  const isEvalLike =
    String(opts.meta?.requestId ?? "").includes(":tools:") ||
    String(opts.meta?.requestId ?? "").includes(":eval");
  // IMPORTANT: do not hardcode Gemini preview models in prod.
  // Let `generateWithGemini` pick its default model chain (defaults to gpt-5-mini) unless meta.model overrides.
  const DEFAULT_MODEL = isEvalLike ? "gemini-2.5-flash" : undefined;
  const historyText = (opts.history ?? []).slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const response = await generateWithGemini(
    opts.systemPrompt,
    `Historique:\n${historyText}\n\nUser: ${opts.message}`,
    temperature,
    false,
    [TRACK_PROGRESS_TOOL],
    "auto",
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? DEFAULT_MODEL,
      source: "sophia-brain:companion",
      forceRealAi: opts.meta?.forceRealAi,
    },
  )
  return response as any
}

export async function handleCompanionModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  message: string
  response: CompanionModelOutput
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<CompanionRunResult> {
  const { supabase, userId, scope, message, response, meta } = opts

  if (typeof response === 'string') {
    return { text: response.replace(/\*\*/g, ''), executed_tools: [], tool_execution: "none" }
  }

  if (typeof response === 'object' && (response as any)?.tool === 'track_progress') {
    const toolName = "track_progress"
    try {
      console.log(`[Companion] 🛠️ Tool Call: track_progress`)
      await handleTracking(supabase, userId, (response as any).args, { source: meta?.channel ?? "chat" })

      const confirmationPrompt = `
        ACTION VALIDÉE : "${(response as any).args?.target_name ?? ""}"
        STATUT : ${(response as any).args?.status === 'missed' ? 'Raté / Pas fait' : 'Réussi / Fait'}
        
        CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
        Dernier message de l'utilisateur : "${message}"
        
        TA MISSION :
        1. Confirme que c'est pris en compte (sans dire "C'est enregistré dans la base de données").
        2. Félicite (si réussi) ou Encourage (si raté).
        3. SI l'utilisateur a donné des détails, REBONDIS SUR CES DÉTAILS. Ne pose pas une question générique.

        FORMAT :
        - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        - Pas de gras.
      `
      const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
        requestId: meta?.requestId,
        model: meta?.model ?? (String(meta?.requestId ?? "").includes(":tools:") ? "gemini-2.5-flash" : undefined),
        source: "sophia-brain:companion_confirmation",
        forceRealAi: meta?.forceRealAi,
      })
      return {
        text: typeof confirmationResponse === 'string'
          ? confirmationResponse.replace(/\*\*/g, '')
          : "Ça marche, c'est noté.",
        executed_tools: [toolName],
        tool_execution: "success",
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Companion] tool execution failed (unexpected):", errMsg)
      // System error log (admin production log)
      await logEdgeFunctionError({
        functionName: "sophia-brain",
        error: e,
        severity: "error",
        title: "tool_execution_failed_unexpected",
        requestId: meta?.requestId ?? null,
        userId,
        source: "sophia-brain:companion",
        metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, channel: meta?.channel ?? "web" },
      })
      // Best-effort eval trace (during eval runs only).
      try {
        const { logVerifierEvalEvent } = await import("../lib/verifier_eval_log.ts")
        const rid = String(meta?.requestId ?? "").trim()
        if (rid) {
          await logVerifierEvalEvent({
            supabase: supabase as any,
            requestId: rid,
            source: "sophia-brain:verifier",
            event: "verifier_tool_execution_fallback",
            level: "warn",
            payload: {
              verifier_kind: "verifier_1:tool_execution_fallback",
              agent_used: "companion",
              channel: meta?.channel ?? "web",
              tool_name: toolName,
              err: errMsg.slice(0, 240),
            },
          })
        }
      } catch {}
      return {
        text: `Ok, j’ai eu un souci technique en notant ça.\n\nDis “retente” et je réessaie.`,
        executed_tools: [toolName],
        tool_execution: "failed",
      }
    }
  }

  // Catch-all: never stringify arbitrary objects into chat (it becomes "[object Object]").
  // If we get an unexpected tool call, return a safe user-facing message and log.
  if (response && typeof response === "object") {
    const maybeTool = (response as any)?.tool ?? null
    const maybeText =
      (response as any)?.text ??
      (response as any)?.message ??
      (response as any)?.next_message ??
      null
    if (typeof maybeText === "string" && maybeText.trim()) {
      return { text: maybeText.replace(/\*\*/g, ""), executed_tools: [], tool_execution: "none" }
    }
    if (maybeTool) {
      console.warn("[Companion] Unexpected tool call (ignored):", maybeTool)
      return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "blocked" }
    }
    console.warn("[Companion] Unexpected non-string response (ignored).")
    return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "none" }
  }

  return { text: String(response ?? ""), executed_tools: [], tool_execution: "none" }
}

export async function runCompanion(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  message: string, 
  history: any[], 
  userState: any, 
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<CompanionRunResult> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"

  const systemPrompt = buildCompanionSystemPrompt({ isWhatsApp, lastAssistantMessage, context, userState })
  const response = await generateCompanionModelOutput({ systemPrompt, message, history, meta })
  return await handleCompanionModelOutput({ supabase, userId, scope, message, response, meta })
}
