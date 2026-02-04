import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import { retrieveContext } from "../companion.ts"
import { getUserTimeContext } from "../../../_shared/user_time_context.ts"
import type { InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { isAffirmative, isExplicitStopBilan, isNegative } from "./utils.ts"
import { investigatorSay } from "./copy.ts"
import { getItemHistory, getPendingItems, getYesterdayCheckupSummary } from "./db.ts"
// NOTE: Breakdown flow removed - signals are now deferred to post-bilan via deferred_topics_v2
import { buildMainItemSystemPrompt, buildDeferQuestionAddon, buildItemProgressAddon } from "./prompt.ts"
import { INVESTIGATOR_TOOLS } from "./tools.ts"
import { handleInvestigatorModelOutput } from "./turn.ts"
import { getMissedStreakDaysForCheckupItem } from "./streaks.ts"
import { getItemProgress, updateItemProgress, initializeItemProgress } from "./item_progress.ts"

// Re-export for backward compatibility
export { getItemProgress, updateItemProgress } from "./item_progress.ts"

export async function runInvestigator(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  history: any[],
  state: any,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string },
): Promise<InvestigatorTurnResult> {
  const timeCtx = await getUserTimeContext({ supabase, userId }).catch(() => null as any)

  // 1. INIT STATE
  let currentState: InvestigationState = state || {
    status: "init",
    pending_items: [],
    current_item_index: 0,
    temp_memory: {},
  }

  // If the user explicitly wants to stop the bilan, comply immediately (no persuasion).
  if (currentState?.status === "checking" && isExplicitStopBilan(message)) {
    return {
      content: await investigatorSay(
        "user_stopped_checkup",
        { user_message: message, channel: meta?.channel, recent_history: history.slice(-15) },
        meta,
      ),
      investigationComplete: true,
      newState: null,
    }
  }

  // Start: load items
  if (currentState.status === "init") {
    const items = await getPendingItems(supabase, userId)
    if (items.length === 0) {
      return {
        content: await investigatorSay("no_pending_items", { user_message: message, channel: meta?.channel }, meta),
        investigationComplete: true,
        newState: null,
      }
    }

    // Day scope from user's LOCAL hour (timezone-aware).
    // Note: Each item now has its own day_scope based on time_of_day, but we keep a global fallback.
    const localHour = Number(timeCtx?.user_local_hour)
    const initialDayScope = Number.isFinite(localHour) && localHour >= 16 ? "today" : "yesterday"

    // Precompute missed streaks for all action/framework items (cache for the bilan)
    const actionItems = items.filter((i) => i.type === "action" || i.type === "framework")
    const missedStreaksByAction: Record<string, number> = {}
    if (actionItems.length > 0) {
      try {
        const streakPairs = await Promise.all(
          actionItems.map(async (item) => {
            const streak = await getMissedStreakDaysForCheckupItem(supabase, userId, item).catch(() => 0)
            return [String(item.id), Number.isFinite(streak) ? streak : 0] as [string, number]
          }),
        )
        for (const [actionId, streak] of streakPairs) {
          missedStreaksByAction[actionId] = streak
        }
      } catch (e) {
        console.error("[Investigator] missed streak cache build failed:", e)
      }
    }

    currentState = {
      status: "checking",
      pending_items: items,
      current_item_index: 0,
      // locked_pending_items avoids pulling extra items mid-checkup (more stable UX).
      temp_memory: {
        opening_done: false,
        locked_pending_items: true,
        day_scope: initialDayScope,
        missed_streaks_by_action: missedStreaksByAction,
        item_progress: initializeItemProgress(items),
      },
    }
  }

  // Soft, personalized opening (before the very first question)
  if (
    currentState?.status === "checking" &&
    currentState.current_item_index === 0 &&
    currentState?.temp_memory?.opening_done !== true
  ) {
    const currentItem0 = currentState.pending_items[0]

    // Update item progress: first item is now awaiting_answer
    let nextState = updateItemProgress(currentState, currentItem0.id, {
      phase: "awaiting_answer",
      last_question_kind: currentItem0.type === "vital" ? "vital_value" : "did_it",
    })
    nextState = {
      ...nextState,
      temp_memory: { ...(nextState.temp_memory || {}), opening_done: true },
    }

    function normalizeLite(s: string): string {
      return String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    }

    function keywordsFromTitle(title: string): string[] {
      const stop = new Set([
        "de", "du", "des", "la", "le", "les", "un", "une", "et", "ou", "a", "au", "aux",
        "en", "pour", "avec", "sans", "sur", "dans", "entre", "vers", "plus", "moins",
        "temps", "mode", "operation",
      ])
      const toks = normalizeLite(title).split(" ").filter((t) => t.length >= 5 && !stop.has(t))
      // Prefer the most discriminative words
      return Array.from(new Set(toks)).slice(0, 3)
    }

    const fallbackFirstQuestion = (() => {
      // Use the item's own day_scope (based on time_of_day), fallback to global
      const dayScope = String(currentItem0.day_scope ?? currentState?.temp_memory?.day_scope ?? "yesterday")
      const dayRef = dayScope === "today" ? "aujourd'hui" : "hier"
      if (currentItem0.type === "vital") {
        const title = String(currentItem0.title ?? "").trim() || "ce point"
        const unit = String((currentItem0 as any)?.unit ?? "").trim()
        if (/tete\s+sur\s+l.?oreiller|endormissement|temps\s+entre/i.test(normalizeLite(title))) {
          return `Pour commencer: en ce moment, il te faut environ combien de minutes pour t'endormir ?`
        }
        return unit
          ? `Pour commencer: ${title} — tu dirais combien (en ${unit}) ?`
          : `Pour commencer: ${title} — tu dirais combien ?`
      }
      if (currentItem0.type === "action") return `Pour commencer: "${currentItem0.title}" — tu l'as faite ${dayRef} ?`
      if (currentItem0.type === "framework") return `Pour commencer: "${currentItem0.title}" — tu l'as fait ${dayRef} ?`
      return `Pour commencer: ${currentItem0.title}.`
    })()

    try {
      const summary = await getYesterdayCheckupSummary(supabase, userId)
      const openingText = await investigatorSay(
        "opening_first_item",
        {
          user_message: message,
          channel: meta?.channel,
          summary_yesterday: summary,
          first_item: currentItem0,
          recent_history: history.slice(-15),
          // Use the item's own day_scope (based on time_of_day)
          day_scope: String(currentItem0.day_scope ?? currentState?.temp_memory?.day_scope ?? "yesterday"),
        },
        meta,
      )

      // Guardrail: if the opening doesn't reference the first item at all, fall back (rare).
      const outNorm = normalizeLite(openingText)
      const keys = keywordsFromTitle(String(currentItem0.title ?? ""))
      const mentionsFirst = keys.length === 0 ? true : keys.some((k) => outNorm.includes(k))
      const hasQ = outNorm.includes("?")
      if (!mentionsFirst || !hasQ) {
        const safe = `Ok, on fait le bilan.\n\n${fallbackFirstQuestion}`
        return { content: safe, investigationComplete: false, newState: nextState }
      }

      return { content: openingText, investigationComplete: false, newState: nextState }
    } catch (e) {
      console.error("[Investigator] opening summary failed:", e)
      const safe = `Ok, on fait le bilan.\n\n${fallbackFirstQuestion}`
      return { content: safe, investigationComplete: false, newState: nextState }
    }
  }

  // 2. CHECK IF FINISHED
  if (currentState.current_item_index >= currentState.pending_items.length) {
    if (currentState?.temp_memory?.locked_pending_items === true) {
      return {
        content: await investigatorSay(
          "end_checkup_no_more_items",
          { user_message: message, channel: meta?.channel, recent_history: history.slice(-15) },
          meta,
        ),
        investigationComplete: true,
        newState: null,
      }
    }

    // Otherwise (legacy behavior): scan for new pending items.
    console.log("[Investigator] End of list reached. Scanning for new pending items...")
    const freshItems = await getPendingItems(supabase, userId)
    if (freshItems.length > 0) {
      console.log(`[Investigator] Found ${freshItems.length} new items. Extending session.`)
      currentState.pending_items = [...currentState.pending_items, ...freshItems]
    } else {
      return {
        content: await investigatorSay(
          "end_checkup_no_more_items",
          { user_message: message, channel: meta?.channel, recent_history: history.slice(-15) },
          meta,
        ),
        investigationComplete: true,
        newState: null,
      }
    }
  }

  // 3. CURRENT ITEM
  const currentItem = currentState.pending_items[currentState.current_item_index]

  // Handle pending post-bilan offer (micro-étape / deep reasons) before normal flow
  const pendingOffer = (currentState as any)?.temp_memory?.bilan_defer_offer
  if (pendingOffer?.stage === "awaiting_consent") {
    const userSaysYes = isAffirmative(message)
    const userSaysNo = isNegative(message)
    if (userSaysYes || userSaysNo) {
      const offerItemId = String(pendingOffer?.action_id ?? currentItem?.id ?? "")
      const offerLoggedStatus = String(pendingOffer?.last_item_log?.status ?? "missed")
      // Ensure the offer item is marked as logged before moving on.
      let nextState = updateItemProgress(currentState, offerItemId, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: offerLoggedStatus,
      })
      const nextIndex = currentState.current_item_index + 1
      nextState = {
        ...nextState,
        current_item_index: nextIndex,
        temp_memory: {
          ...(nextState.temp_memory || {}),
          bilan_defer_offer: undefined,
          breakdown_declined_action_ids: userSaysNo
            ? Array.from(new Set([...(nextState.temp_memory?.breakdown_declined_action_ids ?? []), pendingOffer.action_id]))
            : nextState.temp_memory?.breakdown_declined_action_ids,
        },
      }

      if (nextIndex >= currentState.pending_items.length) {
        const base = await investigatorSay(
          "end_checkup_after_last_log",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: pendingOffer.last_item_log ?? null,
            // Use item's own day_scope
            day_scope: String(currentItem.day_scope ?? nextState?.temp_memory?.day_scope ?? "yesterday"),
          },
          meta,
        )
        const prefix = userSaysYes ? "Parfait, j'ai noté. " : "Ok, pas de souci. "
        return { content: `${prefix}${base}`.trim(), investigationComplete: true, newState: null }
      }

      const nextItem = currentState.pending_items[nextIndex]
      // Mark next item as awaiting_answer since we're asking about it now.
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      })
      const transitionOut = await investigatorSay(
        "transition_to_next_item",
        {
          user_message: message,
          last_item_log: pendingOffer.last_item_log ?? null,
          next_item: nextItem,
          // Use next item's day_scope
          day_scope: String(nextItem.day_scope ?? nextState?.temp_memory?.day_scope ?? "yesterday"),
          deferred_topic: userSaysYes ? "micro-étape après le bilan" : null,
        },
        meta,
      )
      const prefix = userSaysYes ? "Parfait, j'ai noté. " : "Ok, pas de souci. "
      return { content: `${prefix}${transitionOut}`.trim(), investigationComplete: false, newState: nextState }
    }

    // User response unclear: clarify once, then continue bilan
    return {
      content: await investigatorSay(
        "bilan_defer_offer_clarify",
        { user_message: message, item: currentItem },
        meta,
      ),
      investigationComplete: false,
      newState: currentState,
    }
  }

  // NOTE: Breakdown/deep_reasons flows are now handled post-bilan via deferred_topics_v2.
  // The Investigator only proposes these actions; if user consents, the Dispatcher
  // stores the signal and auto-relaunches the appropriate machine after the bilan.

  // RAG : history for this item + general context
  const itemHistoryRaw = await getItemHistory(supabase, userId, currentItem.id, currentItem.type)
  const generalContextRaw = await retrieveContext(supabase, userId, message)
  // Prompt-size guardrails (latency/cost): keep only the most useful parts.
  const itemHistory = String(itemHistoryRaw ?? "").trim().slice(0, 1800)
  const generalContext = String(generalContextRaw ?? "").trim().slice(0, 1200)

  // Build defer question addon if there's a pending question to ask
  const pendingDeferQuestion = currentState?.temp_memory?.pending_defer_question
  const deferAddon = buildDeferQuestionAddon({ pendingDeferQuestion })

  // Get current item progress for state machine context
  const itemProgress = getItemProgress(currentState, currentItem.id)
  const progressAddon = buildItemProgressAddon({ currentItem, itemProgress })

  const basePrompt = buildMainItemSystemPrompt({
    currentItem,
    itemHistory,
    generalContext,
    history,
    message,
    timeContextBlock: timeCtx?.prompt_block ? `=== REPÈRES TEMPORELS ===\n${timeCtx.prompt_block}\n` : "",
  })
  
  // Combine base prompt with addons
  let systemPrompt = basePrompt
  if (progressAddon) systemPrompt += `\n\n${progressAddon}`
  if (deferAddon) systemPrompt += `\n\n${deferAddon}`

  console.log(`[Investigator] Generating response for item: ${currentItem.title}`)

  const response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3,
    false,
    INVESTIGATOR_TOOLS,
    "auto",
    {
      requestId: meta?.requestId,
      // Avoid Gemini preview defaults in prod; rely on global default (gpt-5-mini) unless overridden.
      model: meta?.model,
      source: "sophia-brain:investigator",
      forceRealAi: meta?.forceRealAi,
    },
  )

  return await handleInvestigatorModelOutput({
    supabase,
    userId,
    message,
    history,
    currentState,
    currentItem,
    response,
    systemPrompt,
    meta,
  })
}


