import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { verifyInvestigatorMessage } from "../../verifier.ts"
import { normalizeChatText } from "../../chat_text.ts"
import type { CheckupItem, InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { investigatorSay } from "./copy.ts"
import { isMegaTestMode } from "./utils.ts"
import { logItem } from "./db.ts"
import { checkAndHandleLevelUp, maybeHandleStreakAfterLog } from "./streaks.ts"
import { logEdgeFunctionError } from "../../../_shared/error-log.ts"
// NOTE: Tool handlers for break_down_action, defer_deep_exploration, activate_plan_action,
// archive_plan_action have been removed. These are now handled post-bilan via deferred_topics_v2.

export async function handleInvestigatorModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  history: any[]
  currentState: InvestigationState
  currentItem: CheckupItem
  response: unknown
  systemPrompt?: string
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<InvestigatorTurnResult> {
  const { supabase, userId, message, history, currentState, currentItem, meta } = opts
  let response: any = opts.response

  async function logToolFallback(args: { tool_name: string; error: unknown }) {
    const errMsg = args.error instanceof Error ? args.error.message : String(args.error)
    // System error log (admin production log)
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      error: args.error,
      severity: "error",
      title: "tool_execution_failed_unexpected",
      requestId: meta?.requestId ?? null,
      userId,
      source: "sophia-brain:investigator",
      metadata: {
        reason: "tool_execution_failed_unexpected",
        tool_name: args.tool_name,
        channel: meta?.channel ?? "web",
        err: errMsg.slice(0, 240),
      },
    })
    // Quality/ops log (optional, does not block)
    try {
      const { logVerifierEvalEvent } = await import("../../lib/verifier_eval_log.ts")
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
            agent_used: "investigator",
            channel: meta?.channel ?? "web",
            tool_name: args.tool_name,
            err: errMsg.slice(0, 240),
          },
        })
      }
    } catch {}
  }

  function fallbackUserMessage(): string {
    return (
      "Ok, j’ai eu un souci technique en faisant ça.\n\n" +
      "On continue quand même: tu peux me redire juste “fait / pas fait” (ou une phrase), et je reprends."
    )
  }

  if (typeof response === "string") {
    response = normalizeChatText(response)
  }

  // Deterministic safety net: during bilan, if the user clearly indicates "pas fait" for the current action
  // but the model returns plain text (no tool call), we log the miss immediately so the flow can progress
  // (including missed-streak breakdown offers) instead of looping on the same question.
  if (typeof response === "string" && currentItem?.type === "action") {
    const u = String(message ?? "").trim().toLowerCase()
    const userSaysDone = /\b(fait|ok|c['’]est\s+fait|j['’]ai\s+fait|termin[ée]?|réussi)\b/i.test(u)
    const userSaysMissed =
      /\b(pas\s+fait|pas\s+r[eé]ussi|rat[ée]|non\b|j['’]ai\s+pas\s+fait|pas\s+aujourd['’]hui|pas\s+hier)\b/i
        .test(u)
    if (userSaysMissed && !userSaysDone) {
      const argsWithId = {
        status: "missed",
        item_id: currentItem.id,
        item_type: currentItem.type,
        item_title: currentItem.title,
        // Keep a short note (best effort) so streak offer has context.
        note: String(message ?? "").trim().slice(0, 220) || null,
      }
      try {
        await logItem(supabase, userId, argsWithId)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] auto-log missed failed (unexpected):", errMsg)
        await logToolFallback({ tool_name: "log_action_execution(auto_missed)", error: e })
        return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
      }
      // Offer breakdown if streak>=5, otherwise move on.
      try {
        const streakIntercept = await maybeHandleStreakAfterLog({
          supabase,
          userId,
          message,
          currentState,
          currentItem,
          argsWithId: { status: "missed", note: argsWithId.note },
          meta,
        })
        if (streakIntercept) return streakIntercept
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] auto-log maybeHandleStreakAfterLog failed (unexpected):", errMsg)
      }
      // Move to next item (same as normal log path)
      const nextIndex = currentState.current_item_index + 1
      const nextState = { ...currentState, current_item_index: nextIndex }
      if (nextIndex >= currentState.pending_items.length) {
        const base = await investigatorSay(
          "end_checkup_after_last_log",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: argsWithId,
            day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
          },
          meta,
        )
        return { content: base, investigationComplete: true, newState: null }
      }
      const nextItem = currentState.pending_items[nextIndex]
      const transitionOut = await investigatorSay(
        "transition_to_next_item",
        {
          user_message: message,
          last_item_log: argsWithId,
          next_item: nextItem,
          day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
          deferred_topic: null,
        },
        meta,
      )
      return { content: transitionOut, investigationComplete: false, newState: nextState }
    }
  }

  if (typeof response === "object" && response?.tool === "log_action_execution") {
    console.log(`[Investigator] Logging item ${currentItem.title}:`, response.args)

    const argsWithId = {
      ...response.args,
      item_id: currentItem.id,
      item_type: currentItem.type,
      item_title: currentItem.title,
    }

    try {
      await logItem(supabase, userId, argsWithId)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] log_action_execution failed (unexpected):", errMsg)
      await logToolFallback({ tool_name: "log_action_execution", error: e })
      return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
    }

    // --- WEEKLY HABIT TARGET CONGRATS (immediate) ---
    // For habits, target_reps is a weekly frequency. When current_reps reaches target_reps (within the ISO week),
    // we congratulate right away (no extra storage required).
    let weeklyCongrats: string | null = null
    if (currentItem.type === "action" && argsWithId.status === "completed") {
      try {
        const { data: a } = await supabase
          .from("user_actions")
          .select("type, title, current_reps, target_reps")
          .eq("id", currentItem.id)
          .maybeSingle()
        if (a && String((a as any).type ?? "") === "habit") {
          const curr = Number((a as any).current_reps ?? 0)
          const target = Number((a as any).target_reps ?? 1)
          if (target > 0 && curr === target) {
            weeklyCongrats = `Bravo. Objectif atteint : ${target}× cette semaine — "${String((a as any).title ?? currentItem.title)}".`
          }
        }
      } catch (e) {
        console.error("[Investigator] weekly habit congrats check failed:", e)
      }
    }

    // --- LEVEL UP CHECK ---
    if (currentItem.type === "action" && argsWithId.status === "completed") {
      try {
        const levelUpResult = await checkAndHandleLevelUp(supabase, userId, currentItem.id)
        if (levelUpResult.leveledUp) {
          const nextIndex = currentState.current_item_index + 1
          const nextState = { ...currentState, current_item_index: nextIndex }

          const levelUpMsg = await investigatorSay(
            "level_up",
            {
              user_message: message,
              old_action: levelUpResult.oldAction,
              new_action: levelUpResult.newAction,
              last_item_log: argsWithId,
            },
            meta,
          )

          if (nextIndex >= currentState.pending_items.length) {
            return {
              content: weeklyCongrats ? `${weeklyCongrats}\n\n${levelUpMsg}` : levelUpMsg,
              investigationComplete: true,
              newState: nextState,
            }
          }

          return {
            content: weeklyCongrats ? `${weeklyCongrats}\n\n${levelUpMsg}` : levelUpMsg,
            investigationComplete: false,
            newState: nextState,
          }
        }
      } catch (e) {
        console.error("[Investigator] Level Up check failed:", e)
      }
    }

    try {
      const streakIntercept = await maybeHandleStreakAfterLog({
        supabase,
        userId,
        message,
        currentState,
        currentItem,
        argsWithId: { status: argsWithId.status, note: argsWithId.note },
        meta,
      })
      if (streakIntercept) {
        return weeklyCongrats
          ? { ...streakIntercept, content: `${weeklyCongrats}\n\n${streakIntercept.content}` }
          : streakIntercept
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] maybeHandleStreakAfterLog failed (unexpected):", errMsg)
      await logToolFallback({ tool_name: "maybeHandleStreakAfterLog", error: e })
      return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
    }

    // Move to next item
    const nextIndex = currentState.current_item_index + 1
    const nextState = { ...currentState, current_item_index: nextIndex }

    console.log(`[Investigator] Moving to item index ${nextIndex}. Total items: ${currentState.pending_items.length}`)

    if (nextIndex >= currentState.pending_items.length) {
      console.log("[Investigator] All items checked. Closing investigation.")
      const base = await investigatorSay(
        "end_checkup_after_last_log",
        {
          user_message: message,
          channel: meta?.channel,
          recent_history: history.slice(-15),
          last_item: currentItem,
          last_item_log: argsWithId,
          day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
        },
        meta,
      )
      return {
        content: weeklyCongrats ? `${weeklyCongrats}\n\n${base}` : base,
        investigationComplete: true,
        newState: null,
      }
    }

    const nextItem = currentState.pending_items[nextIndex]
    console.log(`[Investigator] Next item: ${nextItem.title}`)
    const deferred = Boolean(currentState?.temp_memory?.deferred_topic)

    const transitionOut = await investigatorSay(
      "transition_to_next_item",
      {
        user_message: message,
        last_item_log: argsWithId,
        next_item: nextItem,
        day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
        deferred_topic: deferred ? "planning/organisation" : null,
      },
      meta,
    )

    return {
      content: weeklyCongrats ? `${weeklyCongrats}\n\n${transitionOut}` : transitionOut,
      investigationComplete: false,
      newState: nextState,
    }
  }

  // NOTE: Tool handlers for break_down_action, archive_plan_action, activate_plan_action,
  // defer_deep_exploration have been removed. These tools are no longer available to the
  // Investigator. The Investigator now only proposes these actions verbally; if the user
  // consents, the Dispatcher detects the signal and stores it in deferred_topics_v2 for
  // processing after the bilan ends.

  // Text response: verify copy rules (unless in mega test)
  if (typeof response === "string" && !isMegaTestMode(meta)) {
    const dayScope = String(currentState?.temp_memory?.day_scope ?? "yesterday")
    const dayRef = dayScope === "today" ? "aujourd’hui" : "hier"
    const verified = await verifyInvestigatorMessage({
      draft: response,
      scenario: "main_item_turn",
      data: {
        day_scope: dayScope,
        day_ref: dayRef,
        current_item: currentItem,
        pending_items: currentState?.pending_items ?? [],
        current_item_index: currentState?.current_item_index ?? 0,
        recent_history: history.slice(-15),
        user_message: message,
        now_iso: new Date().toISOString(),
        system_prompt_excerpt: String(opts.systemPrompt ?? "").slice(0, 1600),
        tools_available: ["log_action_execution"],
      },
      meta: { ...meta, userId },
    })
    response = normalizeChatText(verified.text)
  }

  return {
    content: String(response ?? ""),
    investigationComplete: false,
    newState: currentState,
  }
}


