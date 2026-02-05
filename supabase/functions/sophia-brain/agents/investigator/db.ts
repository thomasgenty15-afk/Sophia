import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateEmbedding } from "../../../_shared/gemini.ts"
import type { CheckupItem } from "./types.ts"
import { addDays, isoDay } from "./utils.ts"
import { getMissedStreakDays } from "./streaks.ts"

function ymdInTz(d: Date, timeZone: string): string {
  // YYYY-MM-DD in a specific TZ (stable format via en-CA).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone)
  const [y, m, dd] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1))
  // ISO week starts Monday. JS UTC day: Sun=0..Sat=6
  const isoDayIndex = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex)
  return isoDay(dt)
}

async function getUserTimezone(supabase: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle()
    const tz = String((data as any)?.timezone ?? "").trim()
    return tz || "Europe/Paris"
  } catch {
    return "Europe/Paris"
  }
}

function localHourInTz(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const hh = parts.find(p => p.type === "hour")?.value
  return Number(hh ?? "0")
}

function weekdayKeyFromYmd(ymd: string): string {
  // ymd is local date in tz. Convert to a UTC date at midnight and infer day-of-week.
  const [y, m, dd] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1))
  const dow = dt.getUTCDay() // Sun=0..Sat=6
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
  return keys[dow] || "mon"
}

export async function fetchActivePlanRow(supabase: SupabaseClient, userId: string) {
  const { data: planRow, error } = await supabase
    .from("user_plans")
    .select("id, submission_id, content")
    .eq("user_id", userId)
    .in("status", ["active", "in_progress", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return planRow as any
}

export async function fetchActionRowById(supabase: SupabaseClient, userId: string, actionId: string) {
  const { data: actionRow, error } = await supabase
    .from("user_actions")
    .select("id, plan_id, submission_id, title, description, tracking_type, time_of_day, target_reps")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return actionRow as any
}

export async function getYesterdayCheckupSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  completed: number
  missed: number
  lastWinTitle: string | null
  topBlocker: string | null
}> {
  const today = isoDay(new Date())
  const yday = addDays(today, -1)

  // Pull yesterday's action entries only (simple, reliable, low cost)
  const { data: entries, error } = await supabase
    .from("user_action_entries")
    .select("status, action_title, note, performed_at")
    .eq("user_id", userId)
    .gte("performed_at", `${yday}T00:00:00`)
    .lt("performed_at", `${today}T00:00:00`)
    .order("performed_at", { ascending: false })
    .limit(50)

  if (error || !entries || entries.length === 0) {
    return { completed: 0, missed: 0, lastWinTitle: null, topBlocker: null }
  }

  let completed = 0
  let missed = 0
  let lastWinTitle: string | null = null
  const blockerCounts = new Map<string, number>()

  for (const e of entries as any[]) {
    const st = String(e.status ?? "")
    if (st === "completed") {
      completed += 1
      if (!lastWinTitle) lastWinTitle = String(e.action_title ?? "").trim() || null
    } else if (st === "missed") {
      missed += 1
      const raw = String(e.note ?? "").trim()
      if (raw) {
        // Normalize common blockers a bit (lightweight)
        const lowered = raw.toLowerCase()
        const key = lowered.includes("fatigu")
          ? "fatigue"
          : lowered.includes("temps")
            ? "manque de temps"
            : lowered.includes("oubli")
              ? "oubli"
              : lowered.includes("motivation")
                ? "motivation"
                : raw.slice(0, 80)
        blockerCounts.set(key, (blockerCounts.get(key) ?? 0) + 1)
      }
    }
  }

  let topBlocker: string | null = null
  let bestCount = 0
  for (const [k, v] of blockerCounts.entries()) {
    if (v > bestCount) {
      bestCount = v
      topBlocker = k
    }
  }

  return { completed, missed, lastWinTitle, topBlocker }
}

/**
 * Compute the day_scope for an action based on its time_of_day and the current local hour.
 * - Before 16h: always "yesterday" (morning bilan = checking yesterday)
 * - After 16h: depends on the action's time_of_day
 *   - Evening/night actions → "yesterday" (asking about last night)
 *   - Morning/afternoon actions → "today" (asking about today)
 */
function computeActionDayScope(timeOfDay: string | null | undefined, localHour: number): "today" | "yesterday" {
  // Before 16h = always "yesterday" (morning bilan)
  if (!Number.isFinite(localHour) || localHour < 16) return "yesterday"
  
  // After 16h: evening/night actions → "yesterday", others → "today"
  const eveningKeywords = ["evening", "night", "soir", "nuit"]
  const tod = String(timeOfDay ?? "").toLowerCase().trim()
  if (eveningKeywords.some(k => tod.includes(k))) {
    return "yesterday"  // Action du soir/nuit → on demande pour hier soir
  }
  return "today"  // Action de journée → on demande pour aujourd'hui
}

export async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<CheckupItem[]> {
  // Bilan = on check les items actifs du PLAN COURANT (pas des anciens plans),
  // et on applique une logique "dernier check il y a >18h" pour éviter de re-demander.
  const planRow = await fetchActivePlanRow(supabase, userId).catch(() => null)
  const planId = planRow?.id as string | undefined

  // Day scope based on user's LOCAL hour (timezone-aware).
  const tz = await getUserTimezone(supabase, userId)
  const localHour = localHourInTz(new Date(), tz)
  // Global day scope for vitals/frameworks (fallback)
  const globalDayScope: "today" | "yesterday" = Number.isFinite(localHour) && localHour >= 16 ? "today" : "yesterday"
  const localTodayYmd = ymdInTz(new Date(), tz)
  const localDayYmd = globalDayScope === "today" ? localTodayYmd : addDays(localTodayYmd, -1)
  const weekdayKey = weekdayKeyFromYmd(localDayYmd)

  // Règle des 18h : Si last_performed_at / last_checked_at > 18h ago, on doit checker.
  const now = new Date()
  const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

  const pending: CheckupItem[] = []

  // 1. Fetch Actions (plan courant uniquement)
  const actionsQ = supabase
    .from("user_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
  const { data: actions } = planId ? await actionsQ.eq("plan_id", planId) : await actionsQ

  // 2. Fetch Vital Signs (plan courant si possible)
  const vitalsQ = supabase
    .from("user_vital_signs")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
  const { data: vitals } = planId ? await vitalsQ.eq("plan_id", planId) : await vitalsQ

  // 3. Fetch Frameworks (plan courant uniquement)
  const fwQ = supabase
    .from("user_framework_tracking")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
  const { data: frameworks } = planId ? await fwQ.eq("plan_id", planId) : await fwQ

  // Apply 18h Logic
  actions?.forEach((a: any) => {
    const lastPerformedDate = a.last_performed_at ? new Date(a.last_performed_at) : null
    // Si jamais fait (null) OU fait il y a plus de 18h -> On ajoute
    if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
      const isHabit = String(a.type ?? "") === "habit"
      const scheduledDays: string[] = Array.isArray(a.scheduled_days) ? a.scheduled_days : []
      const isScheduledDay = scheduledDays.length === 0 ? true : scheduledDays.includes(weekdayKey)
      // Habitudes planifiées: ne pas "forcer" les jours off -> on ne les inclut pas si aujourd'hui n'est pas prévu.
      if (isHabit && scheduledDays.length > 0 && !isScheduledDay) return

      // Weekly progress (ISO week in user's timezone)
      const weekNow = isoWeekStartYmdInTz(now, tz)
      const weekLast = lastPerformedDate ? isoWeekStartYmdInTz(lastPerformedDate, tz) : null
      const weekReps = weekLast && weekLast === weekNow ? Number(a.current_reps ?? 0) : 0
      const target = Number(a.target_reps ?? 1)
      // If habit already achieved for the week, no need to ask during bilan.
      if (isHabit && target > 0 && weekReps >= target) return

      // Compute day_scope per action based on time_of_day
      const actionDayScope = computeActionDayScope(a.time_of_day, localHour)
      
      pending.push({
        id: a.id,
        type: "action",
        title: a.title,
        description: a.description,
        tracking_type: a.tracking_type,
        target: target,
        current: isHabit ? weekReps : undefined,
        scheduled_days: scheduledDays.length > 0 ? scheduledDays : undefined,
        is_scheduled_day: isScheduledDay,
        day_scope: actionDayScope,
        is_habit: isHabit,
        time_of_day: a.time_of_day ?? undefined,
      })
    }
  })

  vitals?.forEach((v: any) => {
    const lastCheckedDate = v.last_checked_at ? new Date(v.last_checked_at) : null
    if (!lastCheckedDate || lastCheckedDate < eighteenHoursAgo) {
      pending.push({
        id: v.id,
        type: "vital",
        title: v.label || v.name,
        tracking_type: "counter",
        unit: v.unit,
        day_scope: globalDayScope,  // Vitals use global day_scope
      })
    }
  })

  frameworks?.forEach((f: any) => {
    const lastPerformedDate = f.last_performed_at ? new Date(f.last_performed_at) : null
    if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
      const fwTrackingType = String(f.tracking_type ?? "boolean").toLowerCase().trim()
      const trackingType = (fwTrackingType === "counter" ? "counter" : "boolean") as "boolean" | "counter"
      pending.push({
        id: f.id,
        type: "framework",
        title: f.title,
        tracking_type: trackingType,
        day_scope: globalDayScope,  // Frameworks use global day_scope
      })
    }
  })

  // Tri : Vitals d'abord, puis Actions, puis Frameworks
  return pending.sort((a, b) => {
    const typeOrder: Record<string, number> = { vital: 0, action: 1, framework: 2 }
    return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
  })
}


export async function logItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
  const { item_id, item_type, status, value, note, item_title } = args

  // Génération de l'embedding pour la note (si présente)
  let embedding: number[] | null = null
  if (note && note.trim().length > 0) {
    try {
      // On contextualise l'embedding avec le statut
      const textToEmbed = `Statut: ${status}. Note: ${note}`
      embedding = await generateEmbedding(textToEmbed)
    } catch (e) {
      console.error("Error generating embedding for log note:", e)
    }
  }

  const now = new Date()

  if (item_type === "action") {
    // Idempotency / correction guard (all statuses):
    // If we already logged this action recently, avoid inserting duplicate entries.
    // - If the status differs, update the latest recent entry (supports "oops finalement je l'ai fait").
    // - If status is the same, skip.
    {
      const eighteenHoursAgoIso = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString()
      const { data: recent } = await supabase
        .from("user_action_entries")
        .select("id, status, performed_at")
        .eq("user_id", userId)
        .eq("action_id", item_id)
        .gte("performed_at", eighteenHoursAgoIso)
        .order("performed_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recent?.id) {
        const prevStatus = String((recent as any).status ?? "")
        const nextStatus = String(status ?? "")
        if (prevStatus === nextStatus) {
          console.log(
            `[Investigator] Recent action entry exists for ${item_id} (${prevStatus}), skipping duplicate insert.`,
          )
          return "Logged (Skipped duplicate)"
        }
        // Status changed within the same 18h window → update latest entry instead of inserting a new one.
        await supabase.from("user_action_entries").update({
          status: status,
          value: value,
          note: note,
          performed_at: now.toISOString(),
          embedding: embedding,
        }).eq("id", (recent as any).id)
        console.log(
          `[Investigator] Updated recent action entry for ${item_id}: ${prevStatus} -> ${nextStatus}`,
        )
        // If it's now completed, also update action stats as usual below.
      }
    }

    // Update Action Stats & Log Entry
    if (status === "completed") {
      // 1. Fetch current state to check 18h rule & increment reps
      const { data: action } = await supabase
        .from("user_actions")
        .select("type, target_reps, last_performed_at, current_reps")
        .eq("id", item_id)
        .single()

      const lastPerformedDate = action?.last_performed_at ? new Date(action.last_performed_at) : null
      const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

      // Check 18h rule : Si fait il y a moins de 18h, on ne re-log pas (doublon)
      if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
        console.log(
          `[Investigator] Action ${item_id} performed recently (${action?.last_performed_at}), skipping update & log.`,
        )
        return "Logged (Skipped duplicate)"
      }

      // Increment Reps (Si pas skipped)
      let base = Number(action?.current_reps || 0)
      if (String(action?.type ?? "") === "habit") {
        const tz = await getUserTimezone(supabase, userId)
        const weekNow = isoWeekStartYmdInTz(now, tz)
        const weekLast = lastPerformedDate ? isoWeekStartYmdInTz(lastPerformedDate, tz) : null
        if (!weekLast || weekLast !== weekNow) base = 0
      }
      const newReps = base + 1

      await supabase.from("user_actions").update({
        last_performed_at: now.toISOString(),
        current_reps: newReps,
      }).eq("id", item_id)

      console.log(`[Investigator] Incremented reps for ${item_id} to ${newReps}`)
    }
    // Log Entry (only if we didn't update a recent one above)
    // NOTE: If a recent row existed with different status, we updated it and should not insert.
    const { data: already } = await supabase
      .from("user_action_entries")
      .select("id, performed_at")
      .eq("user_id", userId)
      .eq("action_id", item_id)
      .gte("performed_at", new Date(now.getTime() - 10 * 1000).toISOString()) // 10s: intra-request safety
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const shouldInsert = !already?.id
    const { error: logError } = shouldInsert ? await supabase.from("user_action_entries").insert({
      user_id: userId,
      action_id: item_id,
      action_title: item_title,
      status: status,
      value: value,
      note: note,
      performed_at: now.toISOString(),
      embedding: embedding,
    }) : ({ error: null } as any)

    if (logError) {
      console.error("[Investigator] ❌ Log Entry Error:", logError)
    } else {
      if (shouldInsert) console.log("[Investigator] ✅ Entry logged successfully")
    }
  } else if (item_type === "vital") {
    // Vital Sign
    await supabase.from("user_vital_signs").update({
      current_value: String(value),
      last_checked_at: new Date().toISOString(),
    }).eq("id", item_id)

    const { data: vital } = await supabase.from("user_vital_signs").select("plan_id, submission_id").eq("id", item_id)
      .single()

    await supabase.from("user_vital_sign_entries").insert({
      user_id: userId,
      vital_sign_id: item_id,
      plan_id: vital?.plan_id,
      submission_id: vital?.submission_id,
      value: String(value),
      title: item_title,
      note: note,
      recorded_at: new Date().toISOString(),
      embedding: embedding,
    })
  } else if (item_type === "framework") {
    // Framework Tracking
    if (status === "completed") {
      const { data: fw } = await supabase
        .from("user_framework_tracking")
        .select("last_performed_at, current_reps, target_reps, type, action_id, plan_id, title")
        .eq("id", item_id)
        .single()

      const lastPerformedDate = fw?.last_performed_at ? new Date(fw.last_performed_at) : null
      const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

      if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
        console.log(`[Investigator] Framework ${item_id} performed recently, skipping update.`)
        return "Logged (Skipped duplicate)"
      }

      const currReps = Number(fw?.current_reps || 0)
      const newReps = currReps + 1
      const target = Math.max(1, Number(fw?.target_reps ?? 1) || 1)
      // Mark completed when target reached (one_shot usually has target=1)
      const shouldComplete = newReps >= target
      const nextStatus = shouldComplete ? "completed" : "active"

      await supabase.from("user_framework_tracking").update({
        last_performed_at: now.toISOString(),
        current_reps: newReps,
        status: nextStatus,
      }).eq("id", item_id)

      await supabase.from("user_framework_entries").insert({
        user_id: userId,
        plan_id: fw?.plan_id,
        action_id: fw?.action_id,
        framework_title: fw?.title,
        framework_type: "unknown",
        content: { status: status, note: note, checkup: true },
        created_at: now.toISOString(),
      })
    } else {
      const { data: fw } = await supabase.from("user_framework_tracking").select("action_id, plan_id, title").eq(
        "id",
        item_id,
      ).single()

      await supabase.from("user_framework_entries").insert({
        user_id: userId,
        plan_id: fw?.plan_id,
        action_id: fw?.action_id,
        framework_title: fw?.title || item_title,
        framework_type: "unknown",
        content: { status: status, note: note, checkup: true },
        created_at: now.toISOString(),
      })
    }
  }

  return "Logged"
}

// Exposed for deterministic tool testing (DB writes). This does not change runtime behavior.
export async function megaTestLogItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
  return await logItem(supabase, userId, args)
}

export async function handleArchiveAction(
  supabase: SupabaseClient,
  userId: string,
  args: any,
): Promise<string> {
  const planRow = await fetchActivePlanRow(supabase, userId)
  if (!planRow) return "Je ne trouve pas de plan actif."

  const { action_title_or_id } = args
  const searchTerm = (action_title_or_id || "").trim()

  const { data: action } = await supabase
    .from("user_actions")
    .select("id, title")
    .eq("plan_id", planRow.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (action) {
    await supabase.from("user_actions").update({ status: "archived" }).eq("id", action.id)
    return `C'est fait. J'ai retiré l'action "${action.title}" du plan.`
  }

  const { data: fw } = await supabase
    .from("user_framework_tracking")
    .select("id, title")
    .eq("plan_id", planRow.id)
    .ilike("title", searchTerm)
    .maybeSingle()

  if (fw) {
    await supabase.from("user_framework_tracking").update({ status: "archived" }).eq("id", fw.id)
    return `C'est fait. J'ai retiré l'exercice "${fw.title}" du plan.`
  }

  return `Je ne trouve pas "${action_title_or_id}" dans ton plan.`
}

export async function getItemHistory(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  itemType: "action" | "vital" | "framework",
  _currentContext: string = "",
): Promise<string> {
  let historyText = ""

  // 1. Chronologique (Le plus récent)
  if (itemType === "action") {
    const { data: entries } = await supabase
      .from("user_action_entries")
      .select("status, note, performed_at")
      .eq("user_id", userId)
      .eq("action_id", itemId)
      .order("performed_at", { ascending: false })
      .limit(5)

    if (entries && entries.length > 0) {
      historyText += "DERNIERS ENREGISTREMENTS CHRONOLOGIQUES :\n"
      historyText += entries.map((e: any) => {
        const date = new Date(e.performed_at).toLocaleDateString("fr-FR")
        const status = e.status === "completed" ? "✅ Fait" : "❌ Non fait"
        return `- ${date} : ${status} ${e.note ? `(Note: "${e.note}")` : ""}`
      }).join("\n")
      historyText += "\n\n"
    }
  } else if (itemType === "vital") {
    const { data: entries } = await supabase
      .from("user_vital_sign_entries")
      .select("value, recorded_at")
      .eq("user_id", userId)
      .eq("vital_sign_id", itemId)
      .order("recorded_at", { ascending: false })
      .limit(5)

    if (entries && entries.length > 0) {
      historyText += "DERNIÈRES MESURES :\n"
      historyText += entries.map((e: any) => {
        const date = new Date(e.recorded_at).toLocaleDateString("fr-FR")
        return `- ${date} : ${e.value}`
      }).join("\n")
      historyText += "\n\n"
    }
  } else if (itemType === "framework") {
    // Keep it simple for now.
  }

  // 2. Vectoriel / Sémantique (Patterns récurrents)
  if (itemType === "action") {
    try {
      const query = "Difficulté, échec, raison, note importante"
      const embedding = await generateEmbedding(query)

      const { data: similarEntries } = await supabase.rpc("match_action_entries", {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 3,
        filter_action_id: itemId,
      })

      if (similarEntries && similarEntries.length > 0) {
        historyText += "INSIGHTS / RÉCURRENCES (RAG) :\n"
        historyText += similarEntries.map((e: any) => {
          const date = new Date(e.performed_at).toLocaleDateString("fr-FR")
          return `- [${date}] ${e.status} : "${e.note || "Pas de note"}" (Sim: ${Math.round(e.similarity * 100)}%)`
        }).join("\n")
      }
    } catch (err) {
      console.error("Error in Investigator RAG:", err)
    }
  }

  // 3. Streak info (for "5 jours d'affilée" logic)
  if (itemType === "action") {
    try {
      const streak = await getMissedStreakDays(supabase, userId, itemId)
      historyText += `\n\nMISSED_STREAK_DAYS: ${streak}\n`
    } catch (e) {
      console.error("[Investigator] streak compute failed:", e)
    }
  }

  return historyText || "Aucun historique disponible."
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKUP COMPLETION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if the user has already completed a checkup today (in their timezone).
 * Used to prevent duplicate checkups and route to track_progress instead.
 */
export async function wasCheckupDoneToday(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    // Get user's timezone for accurate "today" calculation
    const tz = await getUserTimezone(supabase, userId)
    const today = ymdInTz(new Date(), tz)
    
    const { data } = await supabase
      .from("user_checkup_logs")
      .select("id")
      .eq("user_id", userId)
      .gte("completed_at", `${today}T00:00:00`)
      .limit(1)
      .maybeSingle()
    
    return Boolean(data)
  } catch (e) {
    console.error("[Investigator] wasCheckupDoneToday failed:", e)
    return false // Fail open: allow checkup if DB check fails
  }
}

/**
 * Log a completed checkup to the database.
 * Called when investigation_state completes successfully.
 */
export async function logCheckupCompletion(
  supabase: SupabaseClient,
  userId: string,
  stats: { items: number; completed: number; missed: number },
  source: "chat" | "chat_stop" | "cron" | "manual" = "chat"
): Promise<void> {
  try {
    await supabase.from("user_checkup_logs").insert({
      user_id: userId,
      items_count: stats.items,
      completed_count: stats.completed,
      missed_count: stats.missed,
      source,
    })
    console.log(`[Investigator] Checkup logged: ${stats.completed}/${stats.items} completed, ${stats.missed} missed`)
  } catch (e) {
    console.error("[Investigator] logCheckupCompletion failed (non-blocking):", e)
  }
}

