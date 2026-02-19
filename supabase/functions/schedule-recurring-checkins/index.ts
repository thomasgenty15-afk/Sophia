/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts"
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts"

type RecurringReminderRow = {
  id: string
  user_id: string
  message_instruction: string
  rationale: string | null
  local_time_hhmm: string
  scheduled_days: string[]
  status: "active" | "inactive"
}

type ProfileRow = {
  id: string
  timezone: string | null
  locale: string | null
}

function weekdayKeyInTimezone(params: { timezone: string; dayOffset: number; now?: Date }): string {
  const tz = String(params.timezone || "Europe/Paris").trim() || "Europe/Paris"
  const base = params.now ?? new Date()
  const target = new Date(base.getTime() + Math.max(0, params.dayOffset) * 24 * 60 * 60 * 1000)
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(target).toLowerCase()
  const map: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  }
  return map[short.slice(0, 3)] ?? "mon"
}

function cleanText(v: unknown, fallback = ""): string {
  const t = String(v ?? "").trim()
  return t || fallback
}

function clampText(v: string, maxChars: number): string {
  if (v.length <= maxChars) return v
  return v.slice(0, maxChars - 1).trimEnd() + "…"
}

async function generateRecurringReminderDraft(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
  timezone: string
  locale: string | null
  reminderInstruction: string
  reminderRationale: string | null
  recentReminderDrafts: string[]
  requestId: string
}): Promise<string> {
  const tctx = buildUserTimeContextFromValues({
    timezone: params.timezone,
    locale: params.locale,
  })

  const { data: msgs, error: msgsErr } = await params.supabaseAdmin
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(18)
  if (msgsErr) throw msgsErr

  const transcript = (msgs ?? [])
    .slice()
    .reverse()
    .map((m: any) => `${m.created_at} ${String(m.role).toUpperCase()}: ${String(m.content ?? "")}`)
    .join("\n")

  const last5 = params.recentReminderDrafts
    .slice(0, 5)
    .map((m, i) => `${i + 1}. ${m}`)
    .join("\n")

  const systemPrompt = [
    "Tu es Sophia (mode Companion). Tu dois rédiger un message WhatsApp de rappel récurrent.",
    "",
    "Contraintes strictes:",
    "- Message court: 2 a 6 lignes max.",
    "- Texte brut (pas de markdown).",
    "- 1 question maximum.",
    "- Chaleureux, naturel, tutoiement.",
    "- Message actionnable tout de suite.",
    "- Pas de formulation repetitive robotique.",
    "",
    "Objectif utilisateur de ce rappel:",
    `- Instruction: ${clampText(params.reminderInstruction, 260)}`,
    params.reminderRationale ? `- Pourquoi c'est important: ${clampText(params.reminderRationale, 320)}` : "",
    "",
    "Variation obligatoire:",
    "- Tu dois varier l'angle et la formulation par rapport aux 5 derniers rappels.",
    "- Interdit de rephraser quasi-identique les exemples ci-dessous.",
    last5 ? `Derniers rappels:\n${last5}` : "Derniers rappels: (aucun)",
    "",
    "Repere temporel local utilisateur:",
    tctx.prompt_block,
    "",
    "Base-toi aussi sur le transcript recent ci-dessous (s'il existe).",
  ]
    .filter(Boolean)
    .join("\n")

  const out = await generateWithGemini(
    systemPrompt,
    transcript || "(pas d'historique whatsapp recent)",
    0.55,
    false,
    [],
    "auto",
    {
      requestId: params.requestId,
      model: "gemini-2.5-flash",
      source: "schedule-recurring-checkins",
      forceRealAi: true,
    },
  )
  const text = cleanText(typeof out === "string" ? out : (out as any)?.text ?? "")
  return clampText(text.replace(/\*\*/g, ""), 900) || `Petit rappel: ${clampText(params.reminderInstruction, 180)}`
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { data: reminders, error: remindersErr } = await supabaseAdmin
      .from("user_recurring_reminders")
      .select("id,user_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status")
      .eq("status", "active")
      .order("created_at", { ascending: true })

    if (remindersErr) throw remindersErr
    if (!reminders || reminders.length === 0) {
      return jsonResponse(req, { success: true, scheduled: 0, request_id: requestId }, { includeCors: false })
    }

    const userIds = [...new Set((reminders as RecurringReminderRow[]).map((r) => r.user_id))]
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from("profiles")
      .select("id,timezone,locale")
      .in("id", userIds)
    if (profilesErr) throw profilesErr

    const profileByUser = new Map<string, ProfileRow>((profiles ?? []).map((p: any) => [String(p.id), p as ProfileRow]))

    let scheduled = 0
    let skipped = 0

    for (const reminder of reminders as RecurringReminderRow[]) {
      const profile = profileByUser.get(reminder.user_id)
      const timezone = cleanText(profile?.timezone, "Europe/Paris")
      const locale = profile?.locale ?? null
      const tomorrowKey = weekdayKeyInTimezone({ timezone, dayOffset: 1, now: new Date() })
      const days = Array.isArray(reminder.scheduled_days) ? reminder.scheduled_days : []
      if (!days.includes(tomorrowKey)) {
        skipped++
        continue
      }

      const eventContext = `recurring_reminder:${reminder.id}`
      const scheduledFor = computeScheduledForFromLocal({
        timezone,
        dayOffset: 1,
        localTimeHHMM: reminder.local_time_hhmm,
      })

      const { data: historyRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("draft_message")
        .eq("user_id", reminder.user_id)
        .like("event_context", "recurring_reminder:%")
        .not("draft_message", "is", null)
        .order("created_at", { ascending: false })
        .limit(5)

      const recentDrafts = (historyRows ?? [])
        .map((r: any) => cleanText(r?.draft_message))
        .filter(Boolean)
        .slice(0, 5)

      let draftMessage = ""
      try {
        draftMessage = await generateRecurringReminderDraft({
          supabaseAdmin,
          userId: reminder.user_id,
          timezone,
          locale,
          reminderInstruction: reminder.message_instruction,
          reminderRationale: reminder.rationale ?? null,
          recentReminderDrafts: recentDrafts,
          requestId,
        })
      } catch (e) {
        console.warn(`[schedule-recurring-checkins] request_id=${requestId} generation_failed reminder_id=${reminder.id}`, e)
        draftMessage = `Petit rappel: ${clampText(cleanText(reminder.message_instruction), 180)}`
      }

      const payload = {
        source: "recurring_reminder_daily",
        recurring_reminder_id: reminder.id,
        reminder_instruction: reminder.message_instruction,
        reminder_rationale: reminder.rationale ?? null,
        generated_at: new Date().toISOString(),
      }

      const { error: upsertErr } = await supabaseAdmin
        .from("scheduled_checkins")
        .upsert(
          {
            user_id: reminder.user_id,
            event_context: eventContext,
            draft_message: draftMessage,
            message_mode: "static",
            message_payload: payload,
            scheduled_for: scheduledFor,
            status: "pending",
          } as any,
          { onConflict: "user_id,event_context,scheduled_for" },
        )
      if (upsertErr) {
        console.error(`[schedule-recurring-checkins] request_id=${requestId} upsert_failed reminder_id=${reminder.id}`, upsertErr)
        continue
      }

      const { error: markErr } = await supabaseAdmin
        .from("user_recurring_reminders")
        .update({
          last_drafted_at: new Date().toISOString(),
          last_draft_message: draftMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminder.id)
      if (markErr) {
        console.warn(`[schedule-recurring-checkins] request_id=${requestId} reminder_mark_failed reminder_id=${reminder.id}`, markErr)
      }

      scheduled++
    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        skipped,
        candidates: reminders.length,
        request_id: requestId,
      },
      { includeCors: false },
    )
  } catch (error) {
    console.error(`[schedule-recurring-checkins] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


