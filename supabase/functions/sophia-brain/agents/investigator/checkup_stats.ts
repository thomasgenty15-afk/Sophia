import type { CheckupItem, InvestigationState, ItemProgressMap } from "./types.ts"

export type CheckupStats = {
  items: number
  completed: number
  missed: number
  /** Number of items that have any logged_status/logged_at recorded */
  logged: number
}

function normalizeStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase()
}

function isLoggedProgress(p: any): boolean {
  const st = normalizeStatus(p?.logged_status)
  return Boolean(st) || Boolean(p?.logged_at)
}

function countFromProgress(items: CheckupItem[], progress: ItemProgressMap, fillUnloggedAsMissed: boolean): CheckupStats {
  let completed = 0
  let missed = 0
  let logged = 0

  for (const item of items) {
    const p: any = (progress as any)?.[String(item.id)]
    if (!p) continue
    if (isLoggedProgress(p)) logged += 1

    const st = normalizeStatus(p?.logged_status)
    if (st === "missed") missed += 1
    else if (st === "completed" || st === "partial") completed += 1
    else {
      // Vitals/counters may not always use a strict status enum; if logged_at exists, count as completed.
      if (p?.logged_at) completed += 1
    }
  }

  const itemsCount = items.length
  if (fillUnloggedAsMissed) {
    const unlogged = Math.max(0, itemsCount - logged)
    missed += unlogged
  }

  return { items: itemsCount, completed, missed, logged }
}

function countFromLegacyItems(items: any[], fillUnloggedAsMissed: boolean): CheckupStats {
  const itemsCount = items.length
  let completed = 0
  let missed = 0
  let logged = 0
  for (const it of items) {
    const st = normalizeStatus((it as any)?.logged_status)
    if (!st) continue
    logged += 1
    if (st === "missed") missed += 1
    else if (st === "completed" || st === "partial") completed += 1
    else completed += 1
  }
  if (fillUnloggedAsMissed) {
    const unlogged = Math.max(0, itemsCount - logged)
    missed += unlogged
  }
  return { items: itemsCount, completed, missed, logged }
}

/**
 * Compute checkup stats from the persisted investigation state.
 * 
 * - Prefers `temp_memory.item_progress` (new system).
 * - Falls back to legacy `pending_items[].logged_status` if present.
 * - When `fillUnloggedAsMissed` is true (used for user-aborted checkups), any unlogged item is counted as missed
 *   so that \(completed + missed\) is closer to items_count.
 */
export function computeCheckupStatsFromInvestigationState(
  invState: InvestigationState | any | null | undefined,
  opts?: { fillUnloggedAsMissed?: boolean },
): CheckupStats {
  const fill = Boolean(opts?.fillUnloggedAsMissed)
  const items = Array.isArray(invState?.pending_items) ? (invState.pending_items as CheckupItem[]) : []
  const progress = invState?.temp_memory?.item_progress as ItemProgressMap | undefined

  if (progress && typeof progress === "object") {
    return countFromProgress(items, progress, fill)
  }

  // Legacy fallback
  return countFromLegacyItems(items as any[], fill)
}



