import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { getUserState, updateUserState, normalizeScope } from '../state-manager.ts' // Need access to state
import { consolidateMemories } from "./gardener.ts"

export async function runWatcher(
  supabase: SupabaseClient, 
  userId: string, 
  scopeRaw: unknown,
  lastProcessedAt: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
) {
  const watcherDisabled =
    (Deno.env.get("SOPHIA_WATCHER_DISABLED") ?? "").trim() === "1" ||
    (Deno.env.get("SOPHIA_VEILLEUR_DISABLED") ?? "").trim() === "1"
  if (watcherDisabled) return

  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(scopeRaw ?? meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")
  console.log(`[Veilleur] Triggered for user ${userId} scope=${scope}`)

  // 1. Fetch State (to get current Short Term Context)
  const state = await getUserState(supabase, userId, scope);
  const currentContext = state.short_term_context || "Aucun contexte précédent.";

  // 2. Fetch messages since last_processed_at
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .gt('created_at', lastProcessedAt)
    .order('created_at', { ascending: true })

  if (error || !messages || messages.length === 0) {
    console.log('[Veilleur] No new messages found or error', error)
    return
  }

  // 3. Prepare transcript
  const batch = messages.slice(-50) // Safe upper limit
  const transcript = batch.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
  // NOTE: We do not use keyword heuristics here.
  // Candidate extraction is LLM-based and appended to the Watcher JSON output.

  // Deterministic mode (MEGA): ensure this pipeline actually writes DB rows (so we can test it).
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    const insights = [
      `MEGA_TEST_STUB: insight 1 (${batch.length} msgs)`,
      `MEGA_TEST_STUB: insight 2 (${batch.length} msgs)`,
    ];
    const archiveText = `MEGA_TEST_STUB: archive (${batch.length} msgs)`;
    const newContext = `MEGA_TEST_STUB: context updated`;

    for (const insight of insights) {
      try {
        const embedding = await generateEmbedding(insight);
        await supabase.from('memories').insert({
          user_id: userId,
          content: insight,
          type: 'insight',
          source_type: 'chat',
          source_id: `insight_${Date.now()}`,
          embedding
        });
      } catch (e) { console.error("Error storing insight", e) }
    }

    try {
      const embedding = await generateEmbedding(archiveText);
      await supabase.from('memories').insert({
        user_id: userId,
        content: archiveText,
        type: 'chat_history',
        source_type: 'chat',
        source_id: `batch_${new Date().toISOString()}`,
        embedding
      });
    } catch (e) { console.error("Error storing history", e) }

    try {
      await updateUserState(supabase, userId, scope, { short_term_context: newContext });
    } catch (e) { console.error("Error updating short_term_context", e) }

    console.log(`[Veilleur] MEGA stub: wrote insights + archive + context.`);
    return;
  }

  // 4. Analyze with Gemini (TRIPLE ACTION: Insights + Archive + Context)
  const basePrompt = `
    Tu es "Le Veilleur" du système Sophia.
    Tu analyses le dernier bloc de conversation (15 messages) pour mettre à jour la mémoire du système.

    INPUTS :
    - Contexte Précédent (Fil Rouge) : "${currentContext}"
    - Nouveaux Messages : (Voir ci-dessous)

    TES 3 MISSIONS :
    1. PÉPITES (RAG Précis) : Extrait les faits atomiques NOUVEAUX (ex: "Il aime le jazz", "Il veut changer de job").
    2. ARCHIVAGE (RAG Narratif) : Rédige un paragraphe dense (3-4 phrases) résumant ce bloc de conversation pour l'histoire.
    3. FIL ROUGE (Contexte Actif) : Mets à jour le "Contexte Précédent" pour qu'il reflète la situation ACTUELLE. Supprime ce qui est obsolète, garde ce qui est en cours.

    4. CANDIDATS "USER MODEL" (NE PAS ÉCRIRE EN DB DIRECTEMENT) :
    - Propose des candidats de préférences/contraintes qui méritent d'être CONFIRMÉS par l'utilisateur.
    - IMPORTANT: ne fais PAS de déduction fragile sur un message "de flemme". Si tu n'es pas sûr, mets confidence faible ou ne propose rien.
    - Tu ne proposes que des clés parmi:
      - conversation.tone: "direct" | "soft"
      - conversation.verbosity: "short" | "detailed"
      - conversation.use_emojis: "never" | "normal"
      - coaching.plan_push_allowed: true | false
    - Sors au maximum 3 candidats.

    SORTIE JSON ATTENDUE :
    {
      "insights": ["Pépite 1", "Pépite 2"],
      "chat_history_paragraph": "Texte du résumé narratif pour archivage...",
      "new_short_term_context": "Texte du nouveau fil rouge mis à jour...",
      "profile_fact_candidates": [
        { "key": "conversation.verbosity", "value": "short", "confidence": 0.7, "reason": "string", "evidence": "snippet" }
      ]
    }
  `
  const systemPrompt = basePrompt

  try {
    const jsonStr = await generateWithGemini(systemPrompt, transcript, 0.3, true, [], "auto", {
      requestId: meta?.requestId,
      // Do not force Gemini here; rely on global default (gpt-5-mini) unless explicitly overridden.
      model: meta?.model,
      source: "sophia-brain:watcher",
      forceRealAi: meta?.forceRealAi,
    })
    if (typeof jsonStr !== "string") {
      throw new Error("Watcher expected JSON string from generateWithGemini()");
    }
    const result = JSON.parse(jsonStr)
    const insights = result.insights || []
    const archiveText = result.chat_history_paragraph
    const newContext = result.new_short_term_context
    const candidates = Array.isArray(result.profile_fact_candidates) ? result.profile_fact_candidates : []

    console.log(`[Veilleur] Analysis done. Insights: ${insights.length}.`)

    // A. Store Insights (Atomic Facts)
    for (const insight of insights) {
      try {
        const embedding = await generateEmbedding(insight)
        await supabase.from('memories').insert({
          user_id: userId,
          content: insight,
          type: 'insight',
          source_type: 'chat',
          source_id: `insight_${Date.now()}`,
          embedding
        })
      } catch (e) { console.error("Error storing insight", e) }
    }

    // B. Store Narrative Archive (History Paragraph)
    if (archiveText && archiveText.length > 10) {
        try {
            const embedding = await generateEmbedding(archiveText);
            await supabase.from('memories').insert({
                user_id: userId,
                content: archiveText,
                type: 'chat_history', // New type
                source_type: 'chat',
                source_id: `batch_${new Date().toISOString()}`,
                embedding
            });
            console.log(`[Veilleur] Chat History Archived.`);
        } catch (e) { console.error("Error storing history", e) }
    }

    // C. Update Short Term Context (Flow)
    if (newContext) {
        await updateUserState(supabase, userId, scope, {
          short_term_context: newContext
          // Note: unprocessed_msg_count is reset by the router, not here
        })
        console.log(`[Veilleur] Short Term Context Updated.`);
    }

    // D. Store profile fact candidates in temp_memory (for Companion confirmation later).
    // We keep it small and best-effort; candidates do NOT become facts without explicit confirmation.
    try {
      if (Array.isArray(candidates) && candidates.length > 0) {
        const now = new Date().toISOString()
        for (const c of candidates.slice(0, 3)) {
          const key = String((c as any)?.key ?? "").trim()
          if (!key) continue
          const value = (c as any)?.value
          const conf = Math.max(0, Math.min(1, Number((c as any)?.confidence ?? 0)))
          if (conf < 0.45) continue // ignore weak candidates
          const reason = String((c as any)?.reason ?? "")
          const evidence = String((c as any)?.evidence ?? "")

          // Upsert candidate row (unique on user_id, scope, key, value_hash).
          // On conflict, bump hits + recency and keep the max confidence.
          const { data: existing } = await supabase
            .from("user_profile_fact_candidates")
            .select("id, hits, confidence")
            .eq("user_id", userId)
            .eq("scope", scope)
            .eq("key", key)
            .eq("proposed_value", value as any)
            .maybeSingle()

          if (existing?.id) {
            const nextHits = Number(existing.hits ?? 0) + 1
            const nextConf = Math.max(Number(existing.confidence ?? 0), conf)
            await supabase
              .from("user_profile_fact_candidates")
              .update({
                status: "pending",
                hits: nextHits,
                confidence: nextConf,
                reason,
                evidence,
                last_seen_at: now,
                updated_at: now,
              })
              .eq("id", existing.id)
          } else {
            await supabase.from("user_profile_fact_candidates").insert({
              user_id: userId,
              scope,
              key,
              proposed_value: value,
              status: "pending",
              confidence: conf,
              hits: 1,
              reason,
              evidence,
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
              updated_at: now,
            } as any)
          }
        }
      }
    } catch (e) {
      console.warn("[Watcher] storing profile fact candidates failed (non-blocking):", e)
    }

    // E. Trigger Memory Consolidation (Fire & Forget)
    try {
      const gardenerDisabled = (Deno.env.get("SOPHIA_GARDENER_DISABLED") ?? "").trim() === "1"
      if (gardenerDisabled) return

      // Don't await, let it run in background (if runtime allows) or just await it if we want safety.
      // Deno Deploy edge functions usually kill async tasks after response is sent if not awaited, 
      // but here we are inside a background task (watcher) which is already decoupled from user response.
      // So awaiting is safer to ensure completion before the isolate dies.
      console.log(`[Veilleur] Triggering memory consolidation...`)
      await consolidateMemories({ supabase, userId })
    } catch (e) {
      console.error("Error triggering consolidation", e)
    }

  } catch (err) {
    console.error('[Veilleur] Error processing batch:', err)
  }
}
