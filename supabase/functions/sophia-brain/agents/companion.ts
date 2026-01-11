import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { handleTracking } from "../lib/tracking.ts"
import { logEdgeFunctionError } from "../../_shared/error-log.ts"
import { getUserState, updateUserState } from "../state-manager.ts"
import { upsertUserProfileFactWithEvent } from "../profile_facts.ts"

export type CompanionModelOutput =
  | string
  | { tool: "track_progress"; args: any }
  | { tool: "set_profile_confirm_pending"; args: any }
  | { tool: "apply_profile_fact"; args: any }

export function buildCompanionSystemPrompt(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): string {
  const { isWhatsApp, lastAssistantMessage, context, userState } = opts
  const basePrompt = isWhatsApp ? `
    Tu es Sophia.
    Tu tutoies l'utilisateur. Tu écris comme un humain, naturel, direct.

    MODE WHATSAPP (CRITIQUE) :
    - Réponse courte par défaut (2–6 lignes).
    - 1 question MAX.
    - Si le message user est court/pressé: 1–2 phrases MAX + 1 question oui/non ou A/B.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Ne mentionne jamais des rôles internes (architecte/investigator/etc.) ni "je suis une IA".
    - Si tu utilises le contexte, ne l'expose pas ("je vois dans ta base..."): juste utilise-le.

    TON JOB :
    - Réponds d'abord à ce que l'utilisateur dit.
    - Ensuite, propose UNE relance utile (ou une micro-question) sans changer de sujet.

    TRACKING :
    - Si l'utilisateur dit qu'il a FAIT une action/habitude: appelle l'outil track_progress (status=completed).
    - S'il dit qu'il ne l'a PAS faite: track_progress (status=missed, value=0).

    USER MODEL (PRÉFÉRENCES) :
    - Le contexte peut contenir un bloc "=== USER MODEL (CANDIDATES / CONFIRMATION) ===".
    - Ces candidats ne sont PAS des faits: ils doivent être CONFIRMÉS avant d'être écrits.
    - TU ES LE SEUL mode autorisé à poser ces questions (Companion).
    - Si PENDING_CONFIRMATION est non-null:
      - Interprète la réponse du user.
      - Si c'est clair: appelle l'outil apply_profile_fact avec la clé + la valeur confirmée.
      - Si ce n'est pas clair: repose UNE question courte pour clarifier (sans écrire de fact).
    - Si PENDING_CONFIRMATION est null ET qu'il y a des CANDIDATES:
      - N'interromps pas une conversation importante.
      - Si le user est dans un moment "low-stakes" (ok/merci/super) et que ta réponse n'a pas déjà une question,
        tu peux poser UNE question de confirmation sur le candidat le plus important.
      - Quand tu poses la question, appelle set_profile_confirm_pending (key, scope).

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 120)}..."

    CONTEXTE (si présent) :
    ${context ? context : "(vide)"}
  ` : `
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
    - Ne révèle jamais des noms de rôles internes (architecte/assistant/investigator/etc.). Ne dis jamais "en tant que ..." ou "je suis une IA".

    ADAPTATION AU TON (CRITIQUE, WHATSAPP) :
    - Observe le ton du user. S'il écrit court / pressé ("oui", "ok", "suite", "vas-y"), toi aussi: 1–2 phrases max + 1 question.
    - Évite les envolées + slogans. Pas de slang type "gnaque", "soufflé", etc.
    - Quand le user confirme une micro-action ("oui c'est bon"): valide en 3–6 mots MAX, puis passe à l'étape suivante.
    - N'enchaîne PAS avec "comment tu te sens ?" sauf si le user exprime une émotion (stress, peur, motivation, fatigue).
    - RÈGLE STRICTE (user pressé) : si le dernier message du user fait <= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "go", "on y va":
      - MAX 2 phrases.
      - Puis 1 question courte (oui/non ou A/B).
      - Interdiction des paragraphes longs.

    ONBOARDING / CONTEXTE (CRITIQUE) :
    - N'affirme jamais "on a X dans ton plan" / "dans le plan" / "c'est prévu dans ton plan"
      sauf si le CONTEXTE OPÉRATIONNEL indique explicitement une action active correspondante.

    CONTEXTE UTILISATEUR :
    - Risque actuel : ${userState?.risk_level ?? 0}/10
    ${context ? `\nCONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${context}` : ""}
  `
  return basePrompt
}

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(supabase: SupabaseClient, userId: string, message: string): Promise<string> {
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
      match_count: 5,
    } as any);
    const { data: memoriesFallback } = memErr
      ? await supabase.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: 5,
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
    const { data: actionEntries, error: actErr } = await supabase.rpc('match_all_action_entries_for_user', {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.60,
      match_count: 3,
    } as any);
    const { data: actionEntriesFallback } = actErr
      ? await supabase.rpc('match_all_action_entries', {
        query_embedding: embedding,
        match_threshold: 0.60,
        match_count: 3,
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

const SET_PROFILE_CONFIRM_PENDING_TOOL = {
  name: "set_profile_confirm_pending",
  description:
    "Enregistre qu'une question de confirmation de préférence a été posée (sans écrire le fact final).",
  parameters: {
    type: "OBJECT",
    properties: {
      candidate_id: { type: "STRING", description: "ID du candidate (recommandé).", nullable: true },
      key: { type: "STRING", description: "Clé du fact à confirmer (ex: conversation.verbosity)" },
      scope: { type: "STRING", description: "'global' ou 'current'." },
      reason: { type: "STRING", description: "Raison (optionnel)." },
    },
    required: ["key", "scope"],
  },
}

const APPLY_PROFILE_FACT_TOOL = {
  name: "apply_profile_fact",
  description:
    "Applique un fact utilisateur CONFIRMÉ dans user_profile_facts et log un event. À utiliser uniquement après confirmation explicite.",
  parameters: {
    type: "OBJECT",
    properties: {
      candidate_id: { type: "STRING", description: "ID du candidate confirmé (recommandé).", nullable: true },
      key: { type: "STRING", description: "Clé du fact à écrire (ex: conversation.verbosity)" },
      value: { type: "ANY", description: "Valeur confirmée (string/bool)" },
      scope: { type: "STRING", description: "'global' ou 'current'." },
      reason: { type: "STRING", description: "Raison/trace (optionnel)." },
    },
    required: ["key", "value", "scope"],
  },
}

export async function generateCompanionModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<CompanionModelOutput> {
  const historyText = (opts.history ?? []).slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const response = await generateWithGemini(
    opts.systemPrompt,
    `Historique:\n${historyText}\n\nUser: ${opts.message}`,
    temperature,
    false,
    [TRACK_PROGRESS_TOOL, SET_PROFILE_CONFIRM_PENDING_TOOL, APPLY_PROFILE_FACT_TOOL],
    "auto",
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? "gemini-3-flash-preview",
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
}): Promise<string> {
  const { supabase, userId, scope, message, response, meta } = opts

  if (typeof response === 'string') {
    return response.replace(/\*\*/g, '')
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
        model: meta?.model ?? "gemini-3-flash-preview",
        source: "sophia-brain:companion_confirmation",
        forceRealAi: meta?.forceRealAi,
      })
      return typeof confirmationResponse === 'string'
        ? confirmationResponse.replace(/\*\*/g, '')
        : "Ça marche, c'est noté."
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
      // Quality/ops log
      try {
        await supabase.from("conversation_judge_events").insert({
          user_id: userId,
          scope: null,
          channel: meta?.channel ?? "web",
          agent_used: "companion",
          verifier_kind: "tool_execution_fallback",
          request_id: meta?.requestId ?? null,
          model: null,
          ok: null,
          rewritten: null,
          issues: ["tool_execution_failed_unexpected"],
          mechanical_violations: [],
          draft_len: null,
          final_len: null,
          draft_hash: null,
          final_hash: null,
          metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, err: errMsg.slice(0, 240) },
        } as any)
      } catch {}
      return `Ok, j’ai eu un souci technique en notant ça.\n\nDis “retente” et je réessaie.`
    }
  }

  if (typeof response === "object" && (response as any)?.tool === "set_profile_confirm_pending") {
    const args = (response as any).args ?? {}
    const candidateId = (args?.candidate_id ?? null) ? String(args?.candidate_id) : null
    const key = String(args?.key ?? "").trim()
    const rawScope = String(args?.scope ?? "current").trim().toLowerCase()
    const resolvedScope = rawScope === "global" ? "global" : scope
    const reason = String(args?.reason ?? "")
    if (key) {
      try {
        const st = await getUserState(supabase, userId, scope)
        const tm0 = (st as any)?.temp_memory ?? {}
        const now = new Date().toISOString()
        const confirm = (tm0 as any)?.user_profile_confirm ?? {}
        const tmNext = {
          ...tm0,
          user_profile_confirm: {
            ...(confirm ?? {}),
            pending: { candidate_id: candidateId, key, scope: resolvedScope, asked_at: now, reason },
            last_asked_at: now,
          },
        }
        await updateUserState(supabase, userId, scope, { temp_memory: tmNext })

        // Mark candidate as "asked" (best-effort, by id if available)
        if (candidateId) {
          const { data: row } = await supabase
            .from("user_profile_fact_candidates")
            .select("asked_count")
            .eq("id", candidateId)
            .maybeSingle()
          const prevAsked = Number((row as any)?.asked_count ?? 0)
          await supabase
            .from("user_profile_fact_candidates")
            .update({
              status: "asked",
              last_asked_at: now,
              asked_count: prevAsked + 1,
              updated_at: now,
            } as any)
            .eq("id", candidateId)
        }
      } catch (e) {
        console.warn("[Companion] set_profile_confirm_pending failed (non-blocking):", e)
      }
    }
    // The model is expected to have asked the question in its normal response content;
    // if it returned a tool call, we fall back to a safe generic question.
    if (key === "conversation.tone") return "Tu préfères que je sois plutôt direct, ou plutôt doux ?"
    if (key === "conversation.verbosity") return "Tu préfères plutôt des réponses courtes, ou détaillées ?"
    if (key === "conversation.use_emojis") return "Tu veux que je mette des emojis (oui/non) ?"
    if (key === "coaching.plan_push_allowed") return "Tu veux que je puisse te ramener à ton plan quand c’est utile (oui/non) ?"
    return "Tu préfères quoi, là ?"
  }

  if (typeof response === "object" && (response as any)?.tool === "apply_profile_fact") {
    const args = (response as any).args ?? {}
    const candidateId = (args?.candidate_id ?? null) ? String(args?.candidate_id) : null
    const key = String(args?.key ?? "").trim()
    const rawScope = String(args?.scope ?? "current").trim().toLowerCase()
    const resolvedScope = rawScope === "global" ? "global" : scope
    const value = (args as any)?.value
    const reason = String(args?.reason ?? "")
    if (key) {
      try {
        await upsertUserProfileFactWithEvent({
          supabase,
          userId,
          scope: resolvedScope,
          key,
          value,
          sourceType: "explicit_user",
          confidence: 1.0,
          reason: reason ? `confirmed:${reason}` : "confirmed_by_user",
          sourceMessageId: null,
        })

        // Mark candidate as confirmed, and optionally reject other values for same (user,scope,key)
        const now = new Date().toISOString()
        if (candidateId) {
          await supabase
            .from("user_profile_fact_candidates")
            .update({
              status: "confirmed",
              resolved_at: now,
              resolved_value: value,
              updated_at: now,
            } as any)
            .eq("id", candidateId)
        } else {
          await supabase
            .from("user_profile_fact_candidates")
            .update({
              status: "confirmed",
              resolved_at: now,
              resolved_value: value,
              updated_at: now,
            } as any)
            .eq("user_id", userId)
            .eq("scope", resolvedScope)
            .eq("key", key)
            .eq("proposed_value", value as any)
            .in("status", ["pending", "asked"])
        }

        await supabase
          .from("user_profile_fact_candidates")
          .update({
            status: "rejected",
            resolved_at: now,
            updated_at: now,
          } as any)
          .eq("user_id", userId)
          .eq("scope", resolvedScope)
          .eq("key", key)
          .neq("proposed_value", value as any)
          .in("status", ["pending", "asked"])

        // Clear pending (state machine)
        const st = await getUserState(supabase, userId, scope)
        const tm0 = (st as any)?.temp_memory ?? {}
        const confirm = (tm0 as any)?.user_profile_confirm ?? {}
        const tmNext = {
          ...tm0,
          user_profile_confirm: { ...(confirm ?? {}), pending: null },
        }
        await updateUserState(supabase, userId, scope, { temp_memory: tmNext })
      } catch (e) {
        console.warn("[Companion] apply_profile_fact failed (non-blocking):", e)
      }
    }
    return "Ok, c’est noté. On continue."
  }

  return String(response ?? "")
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
): Promise<string> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"

  const systemPrompt = buildCompanionSystemPrompt({ isWhatsApp, lastAssistantMessage, context, userState })
  const response = await generateCompanionModelOutput({ systemPrompt, message, history, meta })
  return await handleCompanionModelOutput({ supabase, userId, scope, message, response, meta })
}
