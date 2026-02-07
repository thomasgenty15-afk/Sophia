import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { verifyInvestigatorMessage } from "../../verifier.ts"
import { normalizeChatText } from "../../chat_text.ts"
import type { CheckupItem, InvestigationState, InvestigatorTurnResult, ItemProgress } from "./types.ts"
import { investigatorSay } from "./copy.ts"
// NOTE: investigatorSay is used both in run.ts and here for the weekly target flow.
import { isMegaTestMode } from "./utils.ts"
import { logItem } from "./db.ts"
import {
  checkAndHandleLevelUp,
  maybeHandleStreakAfterLog,
  getCompletedStreakDays,
  getMissedStreakDaysForCheckupItem,
} from "./streaks.ts"
import { logEdgeFunctionError } from "../../../_shared/error-log.ts"
import { getItemProgress, updateItemProgress } from "./item_progress.ts"
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
  // Track any state adjustments we want to carry to the text-response path.
  let stateForTextResponse: InvestigationState = currentState

  function updateMissedStreakCache(actionId: string, streak: number) {
    const tm = currentState.temp_memory ?? {}
    const existing = (tm as any).missed_streaks_by_action ?? {}
    const next = { ...existing, [String(actionId)]: Math.max(0, Math.floor(Number(streak) || 0)) }
    currentState.temp_memory = { ...(tm as any), missed_streaks_by_action: next }
  }

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
    const responseLooksLikeReasonQuestion = /\?/.test(String(response ?? "")) ||
      /\b(coinc[ée]?|bloqu[ée]?|raconte|pourquoi|qu['’]est-ce|qu["’]est ce)\b/i
        .test(String(response ?? ""))
    if (userSaysMissed && !userSaysDone && responseLooksLikeReasonQuestion) {
      // The model is asking for the reason — move to awaiting_reason instead of auto-logging.
      stateForTextResponse = updateItemProgress(currentState, currentItem.id, {
        phase: "awaiting_reason",
        last_question_kind: "ask_reason",
      })
    }
    if (userSaysMissed && !userSaysDone && !responseLooksLikeReasonQuestion) {
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
      
      // Update item progress: mark as logged
      let stateWithProgress = updateItemProgress(currentState, currentItem.id, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: "missed",
      })
      
      // Offer breakdown if streak>=5, otherwise move on.
      try {
        const streakIntercept = await maybeHandleStreakAfterLog({
          supabase,
          userId,
          message,
          currentState: stateWithProgress,
          currentItem,
          argsWithId: { status: "missed", note: argsWithId.note },
          meta,
        })
        if (streakIntercept) return streakIntercept
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] auto-log maybeHandleStreakAfterLog failed (unexpected):", errMsg)
      }
      // Move to next item with enriched transition (comment on reason + next question)
      const nextIndex = stateWithProgress.current_item_index + 1
      let nextState = { ...stateWithProgress, current_item_index: nextIndex }
      if (nextIndex >= stateWithProgress.pending_items.length) {
        const base = await investigatorSay(
          "end_checkup_after_last_log",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: argsWithId,
            // Use item's own day_scope (based on time_of_day)
            day_scope: String(currentItem.day_scope ?? stateWithProgress?.temp_memory?.day_scope ?? "yesterday"),
          },
          meta,
        )
        return { content: base, investigationComplete: true, newState: null }
      }
      const nextItem = stateWithProgress.pending_items[nextIndex]
      
      // Update next item to awaiting_answer
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      })
      
      // Get missed streak for context
      let missedStreak = 0
      try {
        missedStreak = await getMissedStreakDaysForCheckupItem(supabase, userId, currentItem)
      } catch {}
      updateMissedStreakCache(currentItem.id, missedStreak)
      
      const note = String(argsWithId.note ?? "").trim()
      const hasReason = note.length > 2 && !/^(pas\s+fait|non|rat[ée]?|pas\s+r[eé]ussi)$/i.test(note)
      
      // Use enriched scenario only if a reason is provided
      const transitionOut = hasReason
        ? await investigatorSay(
          "action_missed_comment_transition",
          {
            user_message: message,
            missed_item: currentItem,
            reason_given: note,
            last_item_log: argsWithId,
            next_item: nextItem,
            missed_streak: missedStreak,
            // Use next item's day_scope for the transition question
            day_scope: String(nextItem.day_scope ?? stateWithProgress?.temp_memory?.day_scope ?? "yesterday"),
            channel: meta?.channel,
          },
          meta,
        )
        : await investigatorSay(
          "transition_to_next_item",
          {
            user_message: message,
            last_item_log: argsWithId,
            next_item: nextItem,
            // Use next item's day_scope for the transition question
            day_scope: String(nextItem.day_scope ?? stateWithProgress?.temp_memory?.day_scope ?? "yesterday"),
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

    // Update item progress: mark as logged
    let stateWithLog = updateItemProgress(currentState, currentItem.id, {
      phase: "logged",
      logged_at: new Date().toISOString(),
      logged_status: argsWithId.status,
    })

    if (currentItem.type === "action" && argsWithId.status === "completed") {
      updateMissedStreakCache(currentItem.id, 0)
    }

    // --- VITAL SIGN: Personalized reaction + transition ---
    if (currentItem.type === "vital") {
      const nextIndex = stateWithLog.current_item_index + 1
      let nextState = { ...stateWithLog, current_item_index: nextIndex }

      if (nextIndex >= stateWithLog.pending_items.length) {
        // Last item was a vital sign
        const endMsg = await investigatorSay(
          "end_checkup_after_last_log",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: argsWithId,
            // Use item's own day_scope
            day_scope: String(currentItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
          },
          meta,
        )
        return { content: endMsg, investigationComplete: true, newState: null }
      }

      const nextItem = stateWithLog.pending_items[nextIndex]
      
      // Update next item to awaiting_answer
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      })
      
      const transitionMsg = await investigatorSay(
        "vital_logged_transition",
        {
          user_message: message,
          vital_title: currentItem.title,
          vital_value: argsWithId.value ?? argsWithId.status,
          vital_unit: currentItem.unit,
          previous_vital_value: currentItem.previous_vital_value ?? null,
          target_vital_value: currentItem.target_vital_value ?? null,
          next_item: nextItem,
          // Use next item's day_scope for the transition question
          day_scope: String(nextItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
          channel: meta?.channel,
        },
        meta,
      )
      return { content: transitionMsg, investigationComplete: false, newState: nextState }
    }

    // --- WEEKLY HABIT TARGET REACHED: Interactive flow (Case 3) ---
    // For habits, target_reps is a weekly frequency. When current_reps reaches target_reps (within the ISO week),
    // we congratulate AND offer to activate another action.
    // This returns early, so the flow below (level up, streak, transition) only runs for non-target-reached cases.
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
            // Generate interactive congrats + activate offer
            const congratsMsg = await investigatorSay(
              "weekly_target_reached_activate_offer",
              {
                user_message: message,
                channel: meta?.channel,
                action_title: String((a as any).title ?? currentItem.title),
                current_reps: curr,
                current_target: target,
              },
              meta,
            )

            // Store pending offer for activate_action
            const nextStateWithOffer: InvestigationState = {
              ...stateWithLog,
              temp_memory: {
                ...(stateWithLog.temp_memory || {}),
                bilan_defer_offer: {
                  stage: "awaiting_consent",
                  kind: "activate_action",
                  action_id: currentItem.id,
                  action_title: String((a as any).title ?? currentItem.title),
                  current_target: target,
                  last_item_log: argsWithId,
                },
              },
            }
            return { content: congratsMsg, investigationComplete: false, newState: nextStateWithOffer }
          }
        }
      } catch (e) {
        console.error("[Investigator] weekly habit target check failed:", e)
      }
    }

    // --- LEVEL UP CHECK ---
    if (currentItem.type === "action" && argsWithId.status === "completed") {
      try {
        const levelUpResult = await checkAndHandleLevelUp(supabase, userId, currentItem.id)
        if (levelUpResult.leveledUp) {
          const nextIndex = stateWithLog.current_item_index + 1
          let nextState = { ...stateWithLog, current_item_index: nextIndex }
          
          // Update next item to awaiting_answer if there is one
          if (nextIndex < stateWithLog.pending_items.length) {
            const nextItem = stateWithLog.pending_items[nextIndex]
            nextState = updateItemProgress(nextState, nextItem.id, {
              phase: "awaiting_answer",
              last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
            })
          }

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

          if (nextIndex >= stateWithLog.pending_items.length) {
            return {
              content: levelUpMsg,
              investigationComplete: true,
              newState: nextState,
            }
          }

          return {
            content: levelUpMsg,
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
        currentState: stateWithLog,
        currentItem,
        argsWithId: { status: argsWithId.status, note: argsWithId.note },
        meta,
      })
      if (streakIntercept) {
        return streakIntercept
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] maybeHandleStreakAfterLog failed (unexpected):", errMsg)
      await logToolFallback({ tool_name: "maybeHandleStreakAfterLog", error: e })
      return { content: fallbackUserMessage(), investigationComplete: false, newState: stateWithLog }
    }

    // Move to next item
    const nextIndex = stateWithLog.current_item_index + 1
    let nextState = { ...stateWithLog, current_item_index: nextIndex }

    console.log(`[Investigator] Moving to item index ${nextIndex}. Total items: ${stateWithLog.pending_items.length}`)

    if (nextIndex >= stateWithLog.pending_items.length) {
      console.log("[Investigator] All items checked. Closing investigation.")
      const base = await investigatorSay(
        "end_checkup_after_last_log",
        {
          user_message: message,
          channel: meta?.channel,
          recent_history: history.slice(-15),
          last_item: currentItem,
          last_item_log: argsWithId,
          // Use item's own day_scope
          day_scope: String(currentItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
        },
        meta,
      )
      return {
        content: base,
        investigationComplete: true,
        newState: null,
      }
    }

    const nextItem = stateWithLog.pending_items[nextIndex]
    console.log(`[Investigator] Next item: ${nextItem.title}`)
    
    // Update next item to awaiting_answer
    nextState = updateItemProgress(nextState, nextItem.id, {
      phase: "awaiting_answer",
      last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
    })
    
    const deferred = Boolean(stateWithLog?.temp_memory?.deferred_topic)

    // Use enriched scenario for action completed (félicitation + transition in same message)
    if (currentItem.type === "action" && argsWithId.status === "completed") {
      // Get win streak for context (already checked for >= 3 earlier, but we pass it anyway)
      let winStreak = 0
      try {
        winStreak = await getCompletedStreakDays(supabase, userId, currentItem.id)
      } catch {}

      const transitionOut = await investigatorSay(
        "action_completed_transition",
        {
          user_message: message,
          completed_item: currentItem,
          last_item_log: argsWithId,
          next_item: nextItem,
          win_streak: winStreak,
          // Use next item's day_scope for the transition question
          day_scope: String(nextItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
          channel: meta?.channel,
        },
        meta,
      )
      return {
        content: transitionOut,
        investigationComplete: false,
        newState: nextState,
      }
    }

    // Handle missed actions with enriched transition (comment on reason + next question)
    if (currentItem.type === "action" && argsWithId.status === "missed") {
      let missedStreak = 0
      try {
        missedStreak = await getMissedStreakDaysForCheckupItem(supabase, userId, currentItem)
      } catch {}
      updateMissedStreakCache(currentItem.id, missedStreak)

      const note = String(argsWithId.note ?? "").trim()
      const hasReason = note.length > 2 && !/^(pas\s+fait|non|rat[ée]?|pas\s+r[eé]ussi)$/i.test(note)

      const transitionOut = hasReason
        ? await investigatorSay(
          "action_missed_comment_transition",
          {
            user_message: message,
            missed_item: currentItem,
            reason_given: note,
            last_item_log: argsWithId,
            next_item: nextItem,
            missed_streak: missedStreak,
            // Use next item's day_scope for the transition question
            day_scope: String(nextItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
            channel: meta?.channel,
          },
          meta,
        )
        : await investigatorSay(
          "transition_to_next_item",
          {
            user_message: message,
            last_item_log: argsWithId,
            next_item: nextItem,
            // Use next item's day_scope for the transition question
            day_scope: String(nextItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
            deferred_topic: deferred ? "planning/organisation" : null,
          },
          meta,
        )
      return { content: transitionOut, investigationComplete: false, newState: nextState }
    }

    // Default transition for other cases (frameworks, etc.)
    const transitionOut = await investigatorSay(
      "transition_to_next_item",
      {
        user_message: message,
        last_item_log: argsWithId,
        next_item: nextItem,
        // Use next item's day_scope for the transition question
        day_scope: String(nextItem.day_scope ?? stateWithLog?.temp_memory?.day_scope ?? "yesterday"),
        deferred_topic: deferred ? "planning/organisation" : null,
      },
      meta,
    )

    return {
      content: transitionOut,
      investigationComplete: false,
      newState: nextState,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TOOL: increase_week_target
  // Called when the AI decides to increase the weekly target (from prompt addon)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (typeof response === "object" && response?.tool === "increase_week_target") {
    const { action_id, confirmed } = response.args ?? {}
    const targetActionId = String(action_id ?? currentItem.id)

    if (!confirmed) {
      // AI called the tool with confirmed=false, just acknowledge
      const ackMsg = await investigatorSay(
        "increase_target_declined",
        { user_message: message, channel: meta?.channel, action_title: currentItem.title },
        meta,
      )
      const nextIndex = currentState.current_item_index + 1
      let nextState = updateItemProgress(currentState, currentItem.id, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: "completed",
      })
      nextState = { ...nextState, current_item_index: nextIndex }
      if (nextIndex >= currentState.pending_items.length) {
        return { content: ackMsg, investigationComplete: true, newState: null }
      }
      const nextItem = currentState.pending_items[nextIndex]
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      })
      return { content: ackMsg, investigationComplete: false, newState: nextState }
    }

    // Execute the increase
    try {
      const { increaseWeekTarget } = await import("./db.ts")
      const result = await increaseWeekTarget(supabase, userId, targetActionId)
      const confirmMsg = await investigatorSay(
        "increase_target_confirmed",
        {
          user_message: message,
          channel: meta?.channel,
          action_title: currentItem.title,
          increase_result: result,
        },
        meta,
      )
      const nextIndex = currentState.current_item_index + 1
      let nextState = updateItemProgress(currentState, currentItem.id, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: "completed",
      })
      nextState = { ...nextState, current_item_index: nextIndex }
      if (nextIndex >= currentState.pending_items.length) {
        return { content: confirmMsg, investigationComplete: true, newState: null }
      }
      const nextItem = currentState.pending_items[nextIndex]
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      })
      return { content: confirmMsg, investigationComplete: false, newState: nextState }
    } catch (e) {
      console.error("[Investigator] increase_week_target failed:", e)
      return {
        content: "Oups, souci technique. On continue le bilan.",
        investigationComplete: false,
        newState: currentState,
      }
    }
  }

  // NOTE: Tool handlers for break_down_action, archive_plan_action, activate_plan_action,
  // defer_deep_exploration have been removed. These tools are no longer available to the
  // Investigator. The Investigator now only proposes these actions verbally; if the user
  // consents, the Dispatcher detects the signal and stores it in deferred_topics_v2 for
  // processing after the bilan ends.

  // Text response (no tool call) - this usually means a digression or clarification
  // Update digression count only if we're still awaiting an answer
  let stateAfterTextResponse = stateForTextResponse
  const currentProgress = getItemProgress(stateAfterTextResponse, currentItem.id)
  
  if (currentProgress.phase === "awaiting_answer") {
    // Increment digression count since user didn't provide a clear answer
    stateAfterTextResponse = updateItemProgress(stateAfterTextResponse, currentItem.id, {
      digression_count: (currentProgress.digression_count || 0) + 1,
    })
  }

  // Text response: verify copy rules (unless in mega test)
  if (typeof response === "string" && !isMegaTestMode(meta)) {
    // Use item's own day_scope (based on time_of_day)
    const dayScope = String(currentItem.day_scope ?? stateAfterTextResponse?.temp_memory?.day_scope ?? "yesterday")
    const dayRef = dayScope === "today" ? "aujourd'hui" : "hier"
    const verified = await verifyInvestigatorMessage({
      draft: response,
      scenario: "main_item_turn",
      data: {
        day_scope: dayScope,
        day_ref: dayRef,
        current_item: currentItem,
        pending_items: stateAfterTextResponse?.pending_items ?? [],
        current_item_index: stateAfterTextResponse?.current_item_index ?? 0,
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
    newState: stateAfterTextResponse,
  }
}


