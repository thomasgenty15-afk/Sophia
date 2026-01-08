import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { getUserState, updateUserState, normalizeScope } from '../state-manager.ts' // Need access to state
import { appendPromptOverride, fetchPromptOverride } from '../../_shared/prompt-overrides.ts'

export async function runWatcher(
  supabase: SupabaseClient, 
  userId: string, 
  scopeRaw: unknown,
  lastProcessedAt: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
) {
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

    SORTIE JSON ATTENDUE :
    {
      "insights": ["Pépite 1", "Pépite 2"],
      "chat_history_paragraph": "Texte du résumé narratif pour archivage...",
      "new_short_term_context": "Texte du nouveau fil rouge mis à jour..."
    }
  `
  const override = await fetchPromptOverride("sophia.watcher")
  const systemPrompt = appendPromptOverride(basePrompt, override)

  try {
    const jsonStr = await generateWithGemini(systemPrompt, transcript, 0.3, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
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

  } catch (err) {
    console.error('[Veilleur] Error processing batch:', err)
  }
}
