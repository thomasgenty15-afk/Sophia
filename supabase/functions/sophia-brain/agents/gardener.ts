import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateEmbedding, generateWithGemini } from "../../_shared/gemini.ts"

/**
 * Gardener = backend memory governor.
 * - Dedup + consolidation of raw Watcher insights into consolidated memories.
 * - Contradiction handling via status=disputed + metadata.
 *
 * IMPORTANT: This is NOT a conversational agent.
 */

type ConsolidationDecision =
  | { type: "MERGE"; existing_id: string; new_content: string; reasoning: string }
  | { type: "IGNORE"; existing_id: string; reasoning: string }
  | { type: "REPLACE"; existing_id: string; reasoning: string }
  | { type: "CONTRADICTION"; existing_id: string; reasoning: string }
  | { type: "CREATE_NEW"; reasoning: string }

export async function consolidateMemories(opts: {
  supabase: SupabaseClient
  userId: string
  maxRaw?: number
}) {
  const { supabase, userId } = opts
  const maxRaw = Math.max(1, Math.min(50, Number(opts.maxRaw ?? 10) || 10))

  // 1) Load raw insights
  const { data: rawInsights, error: rawErr } = await supabase
    .from("memories")
    .select("id, content, metadata")
    .eq("user_id", userId)
    .eq("type", "insight")
    .eq("status", "raw")
    .order("created_at", { ascending: true })
    .limit(maxRaw)

  if (rawErr) {
    console.warn("[Gardener] failed to load raw insights:", rawErr)
    return
  }
  if (!rawInsights || rawInsights.length === 0) return

  console.log(`[Gardener] Consolidating ${rawInsights.length} raw insights for user=${userId}`)

  for (const insight of rawInsights as any[]) {
    const insightId = String(insight?.id ?? "")
    const content = String(insight?.content ?? "").trim()
    if (!insightId || !content) {
      // best-effort: delete garbage
      if (insightId) await safeDeleteMemory({ supabase, id: insightId })
      continue
    }

    try {
      // 2) Find similar consolidated memories
      const embedding = await generateEmbedding(content)
      const { data: similar, error: simErr } = await supabase.rpc(
        "match_memories_for_user",
        {
          target_user_id: userId,
          query_embedding: embedding,
          match_threshold: 0.82,
          match_count: 3,
          filter_status: ["consolidated", "disputed"],
        } as any,
      )

      if (simErr) {
        console.warn("[Gardener] match_memories_for_user failed (non-blocking):", simErr)
      }

      const similarMemories = Array.isArray(similar) ? similar : []
      if (similarMemories.length === 0) {
        await markAsConsolidated({ supabase, id: insightId, finalContent: content })
        continue
      }

      // 3) LLM arbitration
      const decision = await arbitrateMemory({ newFact: content, existingFacts: similarMemories })

      // 4) Apply decision
      switch (decision.type) {
        case "MERGE":
          await archiveMemory({
            supabase,
            id: decision.existing_id,
            reason: `Merged into ${insightId}`,
          })
          await markAsConsolidated({ supabase, id: insightId, finalContent: decision.new_content })
          break

        case "REPLACE":
          await archiveMemory({
            supabase,
            id: decision.existing_id,
            reason: `Replaced by ${insightId}`,
          })
          await markAsConsolidated({ supabase, id: insightId, finalContent: content })
          break

        case "IGNORE":
          await safeDeleteMemory({ supabase, id: insightId })
          await refreshMemoryTimestamp({ supabase, id: decision.existing_id })
          break

        case "CONTRADICTION":
          await flagMemoryAsDisputed({
            supabase,
            id: decision.existing_id,
            conflictingContent: content,
          })
          await markAsConsolidated({ supabase, id: insightId, finalContent: content })
          break

        case "CREATE_NEW":
        default:
          await markAsConsolidated({ supabase, id: insightId, finalContent: content })
          break
      }
    } catch (e) {
      console.error(`[Gardener] Failed to consolidate insight id=${insightId}`, e)
      // leave it raw; we can retry later
    }
  }
}

async function arbitrateMemory(opts: { newFact: string; existingFacts: any[] }): Promise<ConsolidationDecision> {
  const { newFact, existingFacts } = opts

  const prompt = `
Tu es le Gardener de la mémoire de Sophia (worker backend).
Ton job: décider comment consolider un nouveau fait "raw" extrait d'une conversation.

NOUVEAU FAIT (raw):
"${newFact}"

FAITS EXISTANTS (déjà consolidés, similaires):
${existingFacts
  .map((f: any) => `- [ID: ${String(f?.id ?? "")}] "${String(f?.content ?? "")}"`)
  .join("\n")}

CHOISIS UNE ACTION:
- IGNORE: doublon strict / n'apporte rien de nouveau
- REPLACE: mise à jour claire, l'ancien devient obsolète
- MERGE: complément (et PRODUIS new_content)
- CONTRADICTION: incompatible (ex: "j'aime X" vs "je déteste X")
- CREATE_NEW: même domaine mais fait distinct à garder

RÈGLES:
- Réponds en JSON STRICT.
- existing_id doit être l'ID du fait existant concerné quand applicable.
- new_content doit être non-vide uniquement pour MERGE, sinon null.

JSON:
{ "type": "...", "existing_id": "...", "new_content": "...", "reasoning": "..." }
  `.trim()

  const raw = await generateWithGemini(prompt, "", 0.0, true, [], "json", {
    model: "gemini-2.5-flash",
    source: "sophia-brain:gardener_arbitration",
  })

  try {
    const obj = JSON.parse(String(raw ?? "{}"))
    const type = String(obj?.type ?? "").toUpperCase()
    if (
      type !== "MERGE" &&
      type !== "IGNORE" &&
      type !== "REPLACE" &&
      type !== "CONTRADICTION" &&
      type !== "CREATE_NEW"
    ) {
      return { type: "CREATE_NEW", reasoning: "invalid_type" }
    }
    const existing_id = String(obj?.existing_id ?? "").trim()
    const new_content = obj?.new_content == null ? null : String(obj?.new_content ?? "").trim()
    const reasoning = String(obj?.reasoning ?? "").trim()

    if (type === "MERGE") {
      if (!existing_id || !new_content) return { type: "CREATE_NEW", reasoning: "merge_missing_fields" }
      return { type: "MERGE", existing_id, new_content, reasoning }
    }
    if (type === "IGNORE") {
      if (!existing_id) return { type: "CREATE_NEW", reasoning: "ignore_missing_existing_id" }
      return { type: "IGNORE", existing_id, reasoning }
    }
    if (type === "REPLACE") {
      if (!existing_id) return { type: "CREATE_NEW", reasoning: "replace_missing_existing_id" }
      return { type: "REPLACE", existing_id, reasoning }
    }
    if (type === "CONTRADICTION") {
      if (!existing_id) return { type: "CREATE_NEW", reasoning: "contradiction_missing_existing_id" }
      return { type: "CONTRADICTION", existing_id, reasoning }
    }
    return { type: "CREATE_NEW", reasoning }
  } catch {
    return { type: "CREATE_NEW", reasoning: "parse_failed" }
  }
}

async function markAsConsolidated(opts: { supabase: SupabaseClient; id: string; finalContent: string }) {
  const { supabase, id, finalContent } = opts
  await supabase
    .from("memories")
    .update({ status: "consolidated", content: finalContent, consolidated_at: new Date().toISOString() })
    .eq("id", id)
}

async function archiveMemory(opts: { supabase: SupabaseClient; id: string; reason: string }) {
  const { supabase, id, reason } = opts
  const now = new Date().toISOString()
  await supabase
    .from("memories")
    .update({ status: "archived", metadata: { archive_reason: reason, archived_at: now } })
    .eq("id", id)
}

async function safeDeleteMemory(opts: { supabase: SupabaseClient; id: string }) {
  try {
    await opts.supabase.from("memories").delete().eq("id", opts.id)
  } catch {
    // ignore
  }
}

async function refreshMemoryTimestamp(opts: { supabase: SupabaseClient; id: string }) {
  const { supabase, id } = opts
  await supabase.from("memories").update({ last_reinforced_at: new Date().toISOString() }).eq("id", id)
}

async function flagMemoryAsDisputed(opts: { supabase: SupabaseClient; id: string; conflictingContent: string }) {
  const { supabase, id, conflictingContent } = opts
  const { data } = await supabase.from("memories").select("metadata").eq("id", id).maybeSingle()
  const meta = (data as any)?.metadata ?? {}
  await supabase
    .from("memories")
    .update({
      status: "disputed",
      metadata: { ...meta, conflict_with: conflictingContent, disputed_at: new Date().toISOString() },
    })
    .eq("id", id)
}



