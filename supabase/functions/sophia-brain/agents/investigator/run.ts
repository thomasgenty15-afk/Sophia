import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import { retrieveContext } from "../companion.ts"
import { getUserTimeContext } from "../../../_shared/user_time_context.ts"
import type { InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { isAffirmative, isExplicitStopBilan, isNegative } from "./utils.ts"
import { investigatorSay } from "./copy.ts"
import { getItemHistory, getPendingItems, getYesterdayCheckupSummary } from "./db.ts"
// NOTE: Breakdown flow removed - signals are now deferred to post-bilan via deferred_topics_v2
import { buildMainItemSystemPrompt } from "./prompt.ts"
import { INVESTIGATOR_TOOLS } from "./tools.ts"
import { handleInvestigatorModelOutput } from "./turn.ts"

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
    const localHour = Number(timeCtx?.user_local_hour)
    const initialDayScope = Number.isFinite(localHour) && localHour >= 17 ? "today" : "yesterday"

    currentState = {
      status: "checking",
      pending_items: items,
      current_item_index: 0,
      // locked_pending_items avoids pulling extra items mid-checkup (more stable UX).
      temp_memory: { opening_done: false, locked_pending_items: true, day_scope: initialDayScope },
    }
  }

  // Soft, personalized opening (before the very first question)
  if (
    currentState?.status === "checking" &&
    currentState.current_item_index === 0 &&
    currentState?.temp_memory?.opening_done !== true
  ) {
    try {
      const summary = await getYesterdayCheckupSummary(supabase, userId)
      const currentItem0 = currentState.pending_items[0]

      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      const openingText = await investigatorSay(
        "opening_first_item",
        {
          user_message: message,
          channel: meta?.channel,
          summary_yesterday: summary,
          first_item: currentItem0,
          recent_history: history.slice(-15),
        },
        meta,
      )
      return { content: openingText, investigationComplete: false, newState: nextState }
    } catch (e) {
      console.error("[Investigator] opening summary failed:", e)
      const currentItem0 = currentState.pending_items[0]
      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      const dayScope = String(currentState?.temp_memory?.day_scope ?? "yesterday")
      const dayRef = dayScope === "today" ? "aujourd’hui" : "hier"
      const openingText = `Prêt pour le check ${dayRef} ? On regarde ça ensemble. Pour commencer : ${currentItem0.title}.`

      return { content: openingText, investigationComplete: false, newState: nextState }
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
      const nextIndex = currentState.current_item_index + 1
      const nextState = {
        ...currentState,
        current_item_index: nextIndex,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          bilan_defer_offer: undefined,
          breakdown_declined_action_ids: userSaysNo
            ? Array.from(new Set([...(currentState.temp_memory?.breakdown_declined_action_ids ?? []), pendingOffer.action_id]))
            : currentState.temp_memory?.breakdown_declined_action_ids,
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
            day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
          },
          meta,
        )
        const prefix = userSaysYes ? "Parfait, j'ai noté. " : "Ok, pas de souci. "
        return { content: `${prefix}${base}`.trim(), investigationComplete: true, newState: null }
      }

      const nextItem = currentState.pending_items[nextIndex]
      const transitionOut = await investigatorSay(
        "transition_to_next_item",
        {
          user_message: message,
          last_item_log: pendingOffer.last_item_log ?? null,
          next_item: nextItem,
          day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
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
  const itemHistory = await getItemHistory(supabase, userId, currentItem.id, currentItem.type)
  const generalContext = await retrieveContext(supabase, userId, message)

  const systemPrompt = buildMainItemSystemPrompt({
    currentItem,
    itemHistory,
    generalContext,
    history,
    message,
    timeContextBlock: timeCtx?.prompt_block ? `=== REPÈRES TEMPORELS ===\n${timeCtx.prompt_block}\n` : "",
  })

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
      model: meta?.model ?? "gemini-3-flash-preview",
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


