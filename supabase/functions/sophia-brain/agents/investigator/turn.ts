import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { verifyInvestigatorMessage } from "../../verifier.ts"
import { normalizeChatText } from "../../chat_text.ts"
import type { CheckupItem, InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { investigatorSay } from "./copy.ts"
import { isMegaTestMode } from "./utils.ts"
import { fetchActionRowById, fetchActivePlanRow, handleArchiveAction, logItem } from "./db.ts"
import { checkAndHandleLevelUp, maybeHandleStreakAfterLog } from "./streaks.ts"
import { callBreakDownActionEdge } from "./breakdown.ts"
import { logEdgeFunctionError } from "../../../_shared/error-log.ts"
import { 
  appendEnrichedDeferredTopicToState, 
  createDeepReasonsDeferredTopic 
} from "../../router/deferred_topics.ts"
import type { DeepReasonsPattern } from "../architect/deep_reasons_types.ts"

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

  if (typeof response === "object" && response?.tool === "break_down_action") {
    try {
      if (currentItem.type !== "action") {
        return {
          content: await investigatorSay("break_down_action_wrong_type", { user_message: message, item: currentItem }, meta),
          investigationComplete: false,
          newState: currentState,
        }
      }

      const problem = String((response as any)?.args?.problem ?? "").trim()
      const applyToPlan = (response as any)?.args?.apply_to_plan !== false
      if (!problem) {
        return {
          content: await investigatorSay("break_down_action_missing_problem", { user_message: message, item: currentItem }, meta),
          investigationComplete: false,
          newState: currentState,
        }
      }

      const planRow = await fetchActivePlanRow(supabase, userId)
      const actionRow = await fetchActionRowById(supabase, userId, currentItem.id)

      const helpingAction = {
        title: actionRow?.title ?? currentItem.title,
        description: actionRow?.description ?? currentItem.description ?? "",
        tracking_type: actionRow?.tracking_type ?? currentItem.tracking_type ?? "boolean",
        time_of_day: actionRow?.time_of_day ?? "any_time",
        targetReps: actionRow?.target_reps ?? currentItem.target ?? 1,
      }

      let newAction: any
      try {
        newAction = await callBreakDownActionEdge({
          action: helpingAction,
          problem,
          plan: planRow?.content ?? null,
          submissionId: planRow?.submission_id ?? actionRow?.submission_id ?? null,
        })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] break_down_action tool failed (unexpected):", errMsg)
        await logToolFallback({ tool_name: "break_down_action", error: e })
        return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
      }

      const stepTitle = String(newAction?.title ?? "Micro-étape").trim()
      const stepDesc = String(newAction?.description ?? "").trim()
      const tip = String(newAction?.tips ?? "").trim()

      const nextState = {
        ...currentState,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          breakdown: {
            stage: "awaiting_accept",
            action_id: currentItem.id,
            action_title: currentItem.title,
            problem,
            proposed_action: newAction,
            apply_to_plan: applyToPlan,
          },
        },
      }

      return {
        content: await investigatorSay(
          "break_down_action_propose_step",
          { user_message: message, action_title: currentItem.title, problem, proposed_step: { title: stepTitle, description: stepDesc, tip }, apply_to_plan: applyToPlan },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] break_down_action failed:", e)
      await logToolFallback({ tool_name: "break_down_action", error: e })
      return {
        content: await investigatorSay("break_down_action_error", { user_message: message, error: msg, item: currentItem }, meta),
        investigationComplete: false,
        newState: currentState,
      }
    }
  }

  if (typeof response === "object" && response?.tool === "archive_plan_action") {
    try {
      const result = await handleArchiveAction(supabase, userId, response.args)
      return { content: result, investigationComplete: false, newState: currentState }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] archive_plan_action failed (unexpected):", errMsg)
      await logToolFallback({ tool_name: "archive_plan_action", error: e })
      return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
    }
  }

  if (typeof response === "object" && response?.tool === "activate_plan_action") {
    return {
      content:
        "Je note ton envie d'activer ça. Pour être sûr de respecter le plan (les murs avant le toit !), je laisse l'Architecte valider et l'activer tout de suite. (Transition vers Architecte...)",
      investigationComplete: true,
      newState: null,
    }
  }

  // DEFER DEEP EXPLORATION TOOL
  // Used when detecting a motivational/deep blocker during bilan
  // The exploration will happen AFTER the bilan ends
  if (typeof response === "object" && response?.tool === "defer_deep_exploration") {
    try {
      const args = (response as any)?.args ?? {}
      const actionId = String(args.action_id ?? currentItem?.id ?? "").trim()
      const actionTitle = String(args.action_title ?? currentItem?.title ?? "").trim()
      const detectedPattern = (args.detected_pattern ?? "unknown") as DeepReasonsPattern
      const userWords = String(args.user_words ?? message ?? "").trim().slice(0, 200)
      const consentObtained = Boolean(args.consent_obtained)

      if (!consentObtained) {
        // User hasn't consented yet - just acknowledge and continue
        return {
          content: "Ok, on n'y touche pas. On continue le bilan ? 🙂",
          investigationComplete: false,
          newState: currentState,
        }
      }

      // Create an enriched deferred topic for deep exploration
      const enrichedTopic = createDeepReasonsDeferredTopic({
        action_id: actionId,
        action_title: actionTitle,
        detected_pattern: detectedPattern,
        user_words: userWords,
      })

      // Add to state (will be picked up after bilan)
      const updatedState = appendEnrichedDeferredTopicToState(currentState, enrichedTopic)
      
      console.log(`[Investigator] Deep exploration deferred for action "${actionTitle}" (pattern: ${detectedPattern})`)

      // Move to next item
      const nextIndex = currentState.current_item_index + 1
      const nextState = { 
        ...updatedState, 
        current_item_index: nextIndex,
      }

      if (nextIndex >= currentState.pending_items.length) {
        // End of bilan - the deferred topic will be picked up by router
        return {
          content: await investigatorSay(
            "deep_exploration_deferred_end",
            { 
              user_message: message, 
              action_title: actionTitle,
              channel: meta?.channel,
            },
            meta,
          ),
          investigationComplete: true,
          newState: nextState,
        }
      }

      const nextItem = currentState.pending_items[nextIndex]
      return {
        content: await investigatorSay(
          "deep_exploration_deferred_continue",
          { 
            user_message: message, 
            action_title: actionTitle, 
            next_item: nextItem,
          },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] defer_deep_exploration failed (unexpected):", errMsg)
      await logToolFallback({ tool_name: "defer_deep_exploration", error: e })
      return { content: fallbackUserMessage(), investigationComplete: false, newState: currentState }
    }
  }

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
        tools_available: ["log_action_execution", "break_down_action", "activate_plan_action", "archive_plan_action"],
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


