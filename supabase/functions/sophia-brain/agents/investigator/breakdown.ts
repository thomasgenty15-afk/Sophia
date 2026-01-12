import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import type { CheckupItem, InvestigationState, InvestigatorTurnResult } from "./types.ts"
import { investigatorSay } from "./copy.ts"
import { isAffirmative, isNegative, functionsBaseUrl } from "./utils.ts"
import { fetchActionRowById, fetchActivePlanRow } from "./db.ts"

export async function callBreakDownActionEdge(payload: unknown): Promise<any> {
  const url = `${functionsBaseUrl()}/functions/v1/break-down-action`
  const internalSecret =
    (globalThis as any)?.Deno?.env?.get?.("INTERNAL_FUNCTION_SECRET")?.trim() ||
    (globalThis as any)?.Deno?.env?.get?.("SECRET_KEY")?.trim() ||
    ""
  if (!internalSecret) {
    throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`break-down-action failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

function findAndInsertInPlanByTitle(
  planContent: any,
  targetTitle: string,
  newAction: any,
): { updated: any; inserted: boolean } {
  if (!planContent || typeof planContent !== "object") return { updated: planContent, inserted: false }
  const phases = (planContent as any)?.phases
  if (!Array.isArray(phases)) return { updated: planContent, inserted: false }

  const cloned = structuredClone(planContent)
  const phases2 = (cloned as any).phases
  for (const p of phases2) {
    const actions = p?.actions
    if (!Array.isArray(actions)) continue
    const idx = actions.findIndex((a: any) => String(a?.title ?? "").trim() === String(targetTitle ?? "").trim())
    if (idx >= 0) {
      actions.splice(idx, 0, newAction)
      return { updated: cloned, inserted: true }
    }
  }
  return { updated: planContent, inserted: false }
}

async function commitIntermediateStep(
  supabase: SupabaseClient,
  userId: string,
  baseActionRow: any,
  planRow: any,
  newAction: any,
  applyToPlan: boolean,
): Promise<{ appliedToPlan: boolean; createdRow: boolean }> {
  let appliedToPlan = false
  let createdRow = false

  // 1) Update plan JSON (best effort)
  if (applyToPlan && planRow?.id && planRow?.content && baseActionRow?.title) {
    const { updated, inserted } = findAndInsertInPlanByTitle(planRow.content, baseActionRow.title, newAction)
    if (inserted) {
      const { error: upErr } = await supabase.from("user_plans").update({ content: updated }).eq("id", planRow.id)
      if (!upErr) appliedToPlan = true
      else console.error("[Investigator] Failed to update plan content for breakdown:", upErr)
    }
  }

  // 2) Create tracking row in DB
  const rawType = String(newAction?.type ?? "mission")
  const trackingType = String(newAction?.tracking_type ?? baseActionRow?.tracking_type ?? "boolean")
  const timeOfDay = String(newAction?.time_of_day ?? baseActionRow?.time_of_day ?? "any_time")
  const targetReps = Number(newAction?.targetReps ?? 1) || 1

  const planId = baseActionRow?.plan_id ?? planRow?.id
  const submissionId = baseActionRow?.submission_id ?? planRow?.submission_id ?? null
  if (!planId) return { appliedToPlan, createdRow: false }

  if (rawType === "framework") {
    const fwType = String(newAction?.frameworkDetails?.type ?? "one_shot")
    const { error: fwErr } = await supabase.from("user_framework_tracking").insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      action_id: String(newAction?.id ?? `inter_${Date.now()}`),
      title: String(newAction?.title ?? "Micro-étape"),
      type: fwType,
      target_reps: targetReps,
      current_reps: 0,
      status: "active",
      tracking_type: trackingType,
      last_performed_at: null,
    })
    if (fwErr) console.error("[Investigator] Failed to insert breakdown user_framework_tracking:", fwErr)
    else createdRow = true
  } else {
    // user_actions only supports mission/habit (not "habitude")
    const dbType = rawType === "habitude" ? "habit" : "mission"
    const { error: insErr } = await supabase.from("user_actions").insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      type: dbType,
      title: String(newAction?.title ?? "Micro-étape"),
      description: String(newAction?.description ?? "Micro-étape pour débloquer l'action."),
      target_reps: targetReps,
      current_reps: 0,
      status: "active",
      tracking_type: trackingType,
      time_of_day: timeOfDay,
    })
    if (insErr) console.error("[Investigator] Failed to insert breakdown user_action:", insErr)
    else createdRow = true
  }

  return { appliedToPlan, createdRow }
}

export async function maybeHandleBreakdownFlow(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  currentState: InvestigationState
  currentItem: CheckupItem
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<InvestigatorTurnResult | null> {
  const { supabase, userId, message, currentState, currentItem, meta } = opts

  const breakdown = currentState?.temp_memory?.breakdown
  const breakdownStage = breakdown?.stage as string | undefined
  const breakdownActionId = breakdown?.action_id as string | undefined

  if (!(breakdownStage && breakdownActionId && currentItem?.type === "action" && currentItem.id === breakdownActionId)) {
    return null
  }

  // 1) Wait for consent
  if (breakdownStage === "awaiting_consent") {
    if (isAffirmative(message)) {
      const nextState = {
        ...currentState,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          breakdown: { ...breakdown, stage: "awaiting_blocker" },
        },
      }
      return {
        content: await investigatorSay(
          "breakdown_ask_blocker",
          { user_message: message, action_title: breakdown?.action_title ?? currentItem.title, streak_days: breakdown?.streak_days },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    }
    if (isNegative(message)) {
      // user declined -> resume checkup by moving to next item
      const nextIndex = currentState.current_item_index + 1
      const cleaned = {
        ...currentState,
        current_item_index: nextIndex,
        temp_memory: { ...(currentState.temp_memory || {}), breakdown: null },
      }
      if (nextIndex >= currentState.pending_items.length) {
        return {
          content: await investigatorSay("breakdown_declined_end", { user_message: message, channel: meta?.channel }, meta),
          investigationComplete: true,
          newState: null,
        }
      }
      const nextItem = currentState.pending_items[nextIndex]
      return {
        content: await investigatorSay("breakdown_declined_continue", { user_message: message, next_item: nextItem }, meta),
        investigationComplete: false,
        newState: cleaned,
      }
    }
    return {
      content: await investigatorSay(
        "breakdown_reprompt_consent",
        { user_message: message, action_title: breakdown?.action_title ?? currentItem.title, streak_days: breakdown?.streak_days },
        meta,
      ),
      investigationComplete: false,
      newState: currentState,
    }
  }

  // 2) Collect blocker, then generate a proposed step (but do NOT write it yet)
  if (breakdownStage === "awaiting_blocker") {
    try {
      const problem = String(message ?? "").trim()
      if (!problem) {
        return {
          content: await investigatorSay(
            "breakdown_missing_problem",
            { user_message: message, action_title: breakdown?.action_title ?? currentItem.title },
            meta,
          ),
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

      const proposed = await callBreakDownActionEdge({
        action: helpingAction,
        problem,
        plan: planRow?.content ?? null,
        submissionId: planRow?.submission_id ?? actionRow?.submission_id ?? null,
      })

      const nextState = {
        ...currentState,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          breakdown: {
            ...breakdown,
            stage: "awaiting_accept",
            problem,
            proposed_action: proposed,
          },
        },
      }

      const stepTitle = String(proposed?.title ?? "Micro-étape").trim()
      const stepDesc = String(proposed?.description ?? "").trim()
      const tip = String(proposed?.tips ?? "").trim()

      return {
        content: await investigatorSay(
          "breakdown_propose_step",
          {
            user_message: message,
            action_title: breakdown?.action_title ?? currentItem.title,
            problem,
            proposed_step: { title: stepTitle, description: stepDesc, tip },
          },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[Investigator] breakdown proposal failed:", e)
      return {
        content: await investigatorSay(
          "breakdown_proposal_error",
          { user_message: message, error: msg, action_title: breakdown?.action_title ?? currentItem.title },
          meta,
        ),
        investigationComplete: false,
        newState: currentState,
      }
    }
  }

  // 3) Accept / decline the proposed step -> commit only on explicit yes
  if (breakdownStage === "awaiting_accept") {
    const proposed = breakdown?.proposed_action
    if (!proposed) {
      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), breakdown: { ...breakdown, stage: "awaiting_blocker" } },
      }
      return {
        content: await investigatorSay(
          "breakdown_missing_proposed_step",
          { user_message: message, action_title: breakdown?.action_title ?? currentItem.title },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    }

    if (isAffirmative(message)) {
      try {
        const planRow = await fetchActivePlanRow(supabase, userId)
        const actionRow = await fetchActionRowById(supabase, userId, currentItem.id)
        const applyToPlan = breakdown?.apply_to_plan !== false
        await commitIntermediateStep(supabase, userId, actionRow, planRow, proposed, applyToPlan)

        // Clear breakdown flow and resume checkup (move to next item)
        const nextIndex = currentState.current_item_index + 1
        const nextState = {
          ...currentState,
          current_item_index: nextIndex,
          temp_memory: { ...(currentState.temp_memory || {}), breakdown: null },
        }

        if (nextIndex >= currentState.pending_items.length) {
          return {
            content: await investigatorSay(
              "breakdown_committed_end",
              { user_message: message, created_step: proposed, channel: meta?.channel },
              meta,
            ),
            investigationComplete: true,
            newState: null,
          }
        }
        const nextItem = currentState.pending_items[nextIndex]
        return {
          content: await investigatorSay(
            "breakdown_committed_continue",
            { user_message: message, created_step: proposed, next_item: nextItem },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] breakdown commit failed:", e)
        return {
          content: await investigatorSay(
            "breakdown_commit_error",
            { user_message: message, error: msg, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
            meta,
          ),
          investigationComplete: false,
          newState: currentState,
        }
      }
    }

    if (isNegative(message)) {
      const nextState = {
        ...currentState,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          breakdown: { ...breakdown, stage: "awaiting_blocker", proposed_action: null },
        },
      }
      return {
        content: await investigatorSay(
          "breakdown_decline_ask_adjust",
          { user_message: message, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
          meta,
        ),
        investigationComplete: false,
        newState: nextState,
      }
    }

    return {
      content: await investigatorSay(
        "breakdown_reprompt_accept",
        { user_message: message, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
        meta,
      ),
      investigationComplete: false,
      newState: currentState,
    }
  }

  return null
}


