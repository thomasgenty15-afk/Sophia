import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import type { CheckupItem, InvestigationState } from "./types.ts"
import { addDays } from "./utils.ts"
import { investigatorSay } from "./copy.ts"
import { getItemProgress, updateItemProgress } from "./item_progress.ts"

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysBetweenYmd(startYmd: string, endYmd: string): number {
  if (!startYmd || !endYmd) return 0
  const start = new Date(`${startYmd}T00:00:00.000Z`).getTime()
  const end = new Date(`${endYmd}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const diff = Math.floor((end - start) / (24 * 60 * 60 * 1000))
  return Math.max(0, diff)
}

async function getMissedStreakDaysFromActivation(opts: {
  supabase: SupabaseClient
  userId: string
  table: "user_actions" | "user_framework_tracking"
  itemId: string
}): Promise<number> {
  const { supabase, userId, table, itemId } = opts
  const { data, error } = await supabase
    .from(table)
    .select("created_at, status")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data?.created_at) return 0
  if (String(data.status ?? "").toLowerCase() !== "active") return 0
  const startYmd = String(data.created_at).split("T")[0]
  const todayYmd = toYmd(new Date())
  return daysBetweenYmd(startYmd, todayYmd)
}

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

  const isMissedStatus = (st: string | undefined): boolean => {
    const s = String(st ?? "").toLowerCase()
    return s === "missed" || s === "skipped" || s === "failed"
  }

  let streak = 0
  let cursor = days[0]
  while (true) {
    const st = dayToStatus.get(cursor)
    if (!isMissedStatus(st)) break
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

export async function getMissedStreakDaysForCheckupItem(
  supabase: SupabaseClient,
  userId: string,
  item: CheckupItem,
): Promise<number> {
  if (item.type === "action") {
    if (item.action_source === "personal") return 0
    // IMPORTANT: We only count what we have actually logged in `user_action_entries`.
    // Using `user_actions.created_at` as a proxy for activation is incorrect because actions can be created long
    // before being activated (e.g., plan activated today). That produced huge fake streaks and premature
    // breakdown offers after a single miss.
    return await getMissedStreakDays(supabase, userId, item.id)
  }
  return 0
}

export async function checkAndHandleLevelUp(
  _supabase: SupabaseClient,
  _userId: string,
  _actionId: string,
): Promise<{ leveledUp: boolean; oldAction?: any; newAction?: any }> {
  // Product rule: investigator daily is log-only and must not mutate plan/action state.
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
        let nextState = {
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
        
        // Update next item to awaiting_answer
        nextState = updateItemProgress(nextState, nextItem.id, {
          phase: "awaiting_answer",
          last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
        })
        
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

  // Release 1: keep bilan track-only.
  // We no longer open post-bilan breakdown/deep-reasons offers from this flow.
  const missedLike = ["missed", "skipped", "failed"].includes(String(argsWithId.status ?? "").toLowerCase());
  if (currentItem.type === "action" && missedLike) {
    try {
      await getMissedStreakDaysForCheckupItem(supabase, userId, currentItem)
    } catch (e) {
      console.error("[Investigator] streak check failed after missed log:", e)
    }
  }

  return null
}

