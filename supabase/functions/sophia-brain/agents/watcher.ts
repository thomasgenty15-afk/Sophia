import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../../_shared/gemini.ts'
import { getUserState, updateUserState, normalizeScope } from '../state-manager.ts' // Need access to state
import { getUserProfileFacts, formatUserProfileFactsForPrompt, upsertUserProfileFactWithEvent } from "../profile_facts.ts"
import { processTopicsFromWatcher } from "../topic_memory.ts"

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
  const transcript = batch.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
  // NOTE: We do not use keyword heuristics here.
  // Candidate extraction is LLM-based and appended to the Watcher JSON output.

  // Deterministic mode (MEGA): keep behavior stable for integration tests.
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    const archiveText = `MEGA_TEST_STUB: archive (${batch.length} msgs)`;
    const newContext = `MEGA_TEST_STUB: context updated`;

    try {
      await updateUserState(supabase, userId, scope, { short_term_context: newContext });
    } catch (e) { console.error("Error updating short_term_context", e) }

    console.log(`[Veilleur] MEGA stub: wrote short-term context only (${archiveText}).`);
    return;
  }

  // 4. Fetch existing user profile facts so the LLM can decide insert vs update
  let existingFactsPrompt = ""
  try {
    const existingFacts = await getUserProfileFacts({ supabase, userId, scopes: ["global", scope] })
    const formatted = formatUserProfileFactsForPrompt(existingFacts, scope)
    if (formatted) {
      existingFactsPrompt = `\n    FACTS UTILISATEUR DEJA CONNUS :\n    ${formatted}\n`
    }
  } catch (e) {
    console.warn("[Veilleur] Failed to fetch existing profile facts (non-blocking):", e)
  }

  // 5. Analyze with Gemini (Context + Profile Facts)
  const basePrompt = `
    Tu es "Le Veilleur" du système Sophia.
    Tu analyses le dernier bloc de conversation (15 messages) pour mettre à jour la mémoire du système.

    INPUTS :
    - Contexte Précédent (Fil Rouge) : "${currentContext}"
    - Nouveaux Messages : (Voir ci-dessous)
    ${existingFactsPrompt}

    TES 2 MISSIONS :
    1. FIL ROUGE (Contexte Actif) : Mets à jour le "Contexte Précédent" pour qu'il reflète la situation ACTUELLE. Supprime ce qui est obsolète, garde ce qui est en cours.

    2. PROFILE FACTS (application directe) :
    - Détecte les faits personnels EXPLICITES et NON-AMBIGUS dans la conversation.
    - IMPORTANT: ne fais PAS de déduction fragile. Seules les déclarations EXPLICITES comptent.
      - "je me lève à 6h30" = wake_time OK (explicite, habitude)
      - "je me lève tôt demain" = PAS wake_time (ponctuel, pas une habitude)
      - "j'aime pas les emojis" = emoji_preference OK (explicite)
      - "je suis fatigué" = PAS energy_peaks (pas un pattern permanent)
    - Compare avec les FACTS DEJA CONNUS ci-dessus. Si le fait existe déjà avec la même valeur, ne le propose pas.
    - Clés autorisées (max 3 candidats) :
      - schedule.work_schedule: horaires de travail (ex: "9h-18h", "mi-temps", "télétravail")
      - schedule.energy_peaks: moments d'énergie (ex: "matin", "après-midi")
      - schedule.wake_time: heure de réveil habituelle (ex: "6h30", "8h")
      - schedule.sleep_time: heure de coucher habituelle (ex: "23h", "minuit")
      - personal.job: métier/profession (ex: "développeur", "prof de maths")
      - personal.hobbies: loisirs/passions (ex: "course à pied", "lecture")
      - personal.family: situation familiale (ex: "2 enfants", "marié")
      - conversation.tone: préférence de ton ("direct" | "soft")
      - conversation.use_emojis: préférence emojis ("never" | "normal")
      - conversation.verbosity: préférence longueur ("short" | "detailed")
    - Confidence: 0.0-1.0. Mets >= 0.75 seulement si c'est une déclaration EXPLICITE et non-ambiguë.

    SORTIE JSON ATTENDUE :
    {
      "new_short_term_context": "Texte du nouveau fil rouge mis à jour...",
      "profile_fact_candidates": [
        { "key": "schedule.wake_time", "value": "6h30", "confidence": 0.9, "reason": "L'utilisateur a dit explicitement se lever à 6h30 chaque matin", "evidence": "je me lève tous les jours à 6h30" }
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
    const newContext = result.new_short_term_context
    const candidates = Array.isArray(result.profile_fact_candidates) ? result.profile_fact_candidates : []

    console.log(`[Veilleur] Analysis done. Profile candidates: ${candidates.length}.`)

    // A. Update Short Term Context (Flow)
    if (newContext) {
        await updateUserState(supabase, userId, scope, {
          short_term_context: newContext
          // Note: unprocessed_msg_count is acknowledged by trigger-watcher-batch, not here
        })
        console.log(`[Veilleur] Short Term Context Updated.`);
    }

    // B. Apply high-confidence profile facts directly (no confirmation needed).
    try {
      if (Array.isArray(candidates) && candidates.length > 0) {
        let applied = 0
        for (const c of candidates.slice(0, 3)) {
          const key = String((c as any)?.key ?? "").trim()
          if (!key) continue
          const value = (c as any)?.value
          const conf = Math.max(0, Math.min(1, Number((c as any)?.confidence ?? 0)))
          if (conf < 0.75) {
            console.log(`[Veilleur] Skipping low-confidence fact: ${key} (conf=${conf})`)
            continue
          }
          const reason = String((c as any)?.reason ?? "")

          const result = await upsertUserProfileFactWithEvent({
            supabase,
            userId,
            scope: "global",
            key,
            value,
            sourceType: "watcher",
            confidence: conf,
            reason,
          })
          if (result.changed) {
            applied++
            console.log(`[Veilleur] Applied profile fact: ${key} = ${JSON.stringify(value)} (conf=${conf})`)
          }
        }
        if (applied > 0) {
          console.log(`[Veilleur] Applied ${applied} profile fact(s).`)
        }
      }
    } catch (e) {
      console.warn("[Watcher] applying profile facts failed (non-blocking):", e)
    }

    // C. Topic Memory — Extraction et enrichissement des mémoires thématiques
    try {
      const topicMemoryDisabled = (Deno.env.get("SOPHIA_TOPIC_MEMORY_DISABLED") ?? "").trim() === "1"
      if (!topicMemoryDisabled) {
        console.log(`[Veilleur] Processing topic memories...`)
        const topicResult = await processTopicsFromWatcher({
          supabase,
          userId,
          transcript,
          currentContext,
          meta,
        })
        if (topicResult.topicsCreated > 0 || topicResult.topicsEnriched > 0) {
          console.log(`[Veilleur] Topic memories: ${topicResult.topicsCreated} created, ${topicResult.topicsEnriched} enriched.`)
        }
      }
    } catch (e) {
      console.error("[Veilleur] Error processing topic memories (non-blocking):", e)
    }

  } catch (err) {
    console.error('[Veilleur] Error processing batch:', err)
  }
}
