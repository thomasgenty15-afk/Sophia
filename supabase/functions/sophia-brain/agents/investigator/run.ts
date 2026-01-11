import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import { retrieveContext } from "../companion.ts"
import { approxParisHourUtcPlusOne } from "../../time.ts"
import type { InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { isExplicitStopBilan } from "./utils.ts"
import { investigatorSay } from "./copy.ts"
import { getItemHistory, getPendingItems, getYesterdayCheckupSummary } from "./db.ts"
import { maybeHandleBreakdownFlow } from "./breakdown.ts"
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

    // Day scope from (approx) Paris hour
    const parisHour = approxParisHourUtcPlusOne()
    const initialDayScope = parisHour >= 17 ? "today" : "yesterday"

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

  // NOTE: Parking-lot (post-bilan) state machine lives in router.ts.
  const breakdownResult = await maybeHandleBreakdownFlow({ supabase, userId, message, currentState, currentItem, meta })
  if (breakdownResult) return breakdownResult

  // RAG : history for this item + general context
  const itemHistory = await getItemHistory(supabase, userId, currentItem.id, currentItem.type)
  const generalContext = await retrieveContext(supabase, userId, message)

  const systemPrompt = buildMainItemSystemPrompt({
    currentItem,
    itemHistory,
    generalContext,
    history,
    message,
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


