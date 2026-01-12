import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import type { CheckupItem, InvestigationState } from "./types.ts"
import { addDays } from "./utils.ts"
import { investigatorSay } from "./copy.ts"

export async function getMissedStreakDays(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<number> {
  // We only count what we have actually logged. If a day has no entry, we don't assume "missed".
  const { data: entries, error } = await supabase
    .from("user_action_entries")
    .select("status, performed_at")
    .eq("user_id", userId)
    .eq("action_id", actionId)
    .order("performed_at", { ascending: false })
    .limit(30)

  if (error || !entries || entries.length === 0) return 0

  // Build latest status per day (most recent entry wins).
  const dayToStatus = new Map<string, string>()
  for (const e of entries as any[]) {
    const day = String(e.performed_at ?? "").split("T")[0]
    if (!day) continue
    if (!dayToStatus.has(day)) dayToStatus.set(day, String(e.status ?? ""))
  }

  const days = Array.from(dayToStatus.keys()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  if (days.length === 0) return 0

  let streak = 0
  let cursor = days[0]
  while (true) {
    const st = dayToStatus.get(cursor)
    if (st !== "missed") break
    streak += 1
    const prev = addDays(cursor, -1)
    if (!dayToStatus.has(prev)) break
    cursor = prev
  }
  return streak
}

export async function getCompletedStreakDays(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<number> {
  // We only count what we have actually logged. If a day has no entry, we don't assume "completed".
  const { data: entries, error } = await supabase
    .from("user_action_entries")
    .select("status, performed_at")
    .eq("user_id", userId)
    .eq("action_id", actionId)
    .order("performed_at", { ascending: false })
    .limit(30)

  if (error || !entries || entries.length === 0) return 0

  // Build latest status per day (most recent entry wins).
  const dayToStatus = new Map<string, string>()
  for (const e of entries as any[]) {
    const day = String(e.performed_at ?? "").split("T")[0]
    if (!day) continue
    if (!dayToStatus.has(day)) dayToStatus.set(day, String(e.status ?? ""))
  }

  const days = Array.from(dayToStatus.keys()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  if (days.length === 0) return 0

  let streak = 0
  let cursor = days[0]
  while (true) {
    const st = dayToStatus.get(cursor)
    if (st !== "completed") break
    streak += 1
    const prev = addDays(cursor, -1)
    if (!dayToStatus.has(prev)) break
    cursor = prev
  }
  return streak
}

export async function checkAndHandleLevelUp(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<{ leveledUp: boolean; oldAction?: any; newAction?: any }> {
  // 1. Get current action details
  const { data: action, error } = await supabase
    .from("user_actions")
    .select("id, plan_id, title, current_reps, target_reps, status")
    .eq("id", actionId)
    .single()

  if (error || !action) return { leveledUp: false }

  // 2. Check if target reached
  const current = action.current_reps || 0
  const target = action.target_reps || 1

  if (current >= target) {
    console.log(`[Investigator] 🚀 LEVEL UP DETECTED for action ${actionId} (${current}/${target})`)

    // 3. Mark current as completed (so it stops appearing in daily check)
    await supabase.from("user_actions").update({ status: "completed" }).eq("id", actionId)

    // 4. Find next pending action in the same plan
    const { data: nextActions } = await supabase
      .from("user_actions")
      .select("id, title, description")
      .eq("plan_id", action.plan_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)

    if (nextActions && nextActions.length > 0) {
      const nextAction = nextActions[0]
      // 5. Activate it
      await supabase.from("user_actions").update({ status: "active" }).eq("id", nextAction.id)
      console.log(`[Investigator] 🔓 Unlocked next action: ${nextAction.title}`)

      return { leveledUp: true, oldAction: action, newAction: nextAction }
    } else {
      console.log("[Investigator] 🏁 No next action found. Plan completed?")
      return { leveledUp: true, oldAction: action, newAction: null }
    }
  }

  return { leveledUp: false }
}

export async function maybeHandleStreakAfterLog(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  currentState: InvestigationState
  currentItem: CheckupItem
  argsWithId: { status: string; note?: string | null }
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<null | { content: string; investigationComplete: boolean; newState: any }> {
  const { supabase, userId, message, currentState, currentItem, argsWithId, meta } = opts

  // If completed and streak>=3: congratulate BEFORE moving on.
  if (currentItem.type === "action" && argsWithId.status === "completed") {
    try {
      const winStreak = await getCompletedStreakDays(supabase, userId, currentItem.id)
      if (winStreak >= 3) {
        const nextIndex = currentState.current_item_index + 1
        const nextState = {
          ...currentState,
          current_item_index: nextIndex,
        }

        if (nextIndex >= currentState.pending_items.length) {
          return {
            content: await investigatorSay(
              "win_streak_end",
              {
                user_message: message,
                win_streak_days: winStreak,
                item: currentItem,
                last_item_log: argsWithId,
                channel: meta?.channel,
              },
              meta,
            ),
            investigationComplete: true,
            newState: null,
          }
        }

        const nextItem = currentState.pending_items[nextIndex]
        return {
          content: await investigatorSay(
            "win_streak_continue",
            { user_message: message, win_streak_days: winStreak, item: currentItem, last_item_log: argsWithId, next_item: nextItem },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }
    } catch (e) {
      console.error("[Investigator] completed streak check failed after completed log:", e)
    }
  }

  // If missed and streak>=5: propose breakdown flow BEFORE moving on.
  if (currentItem.type === "action" && argsWithId.status === "missed") {
    try {
      const streak = await getMissedStreakDays(supabase, userId, currentItem.id)
      if (streak >= 5) {
        const nextState = {
          ...currentState,
          temp_memory: {
            ...(currentState.temp_memory || {}),
            breakdown: {
              stage: "awaiting_consent",
              action_id: currentItem.id,
              action_title: currentItem.title,
              streak_days: streak,
              last_note: String(argsWithId.note ?? "").trim(),
            },
          },
        }
        return {
          content: await investigatorSay(
            "missed_streak_offer_breakdown",
            { user_message: message, streak_days: streak, item: currentItem, last_note: String(argsWithId.note ?? "").trim() },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }
    } catch (e) {
      console.error("[Investigator] streak check failed after missed log:", e)
    }
  }

  return null
}



