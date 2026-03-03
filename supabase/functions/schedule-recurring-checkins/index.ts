/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts"
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts"
const RDV_GENERATION_MODEL = "gpt-5.2"

type RecurringReminderRow = {
  id: string
  user_id: string
  message_instruction: string
  rationale: string | null
  local_time_hhmm: string
  scheduled_days: string[]
  status: "active" | "inactive"
  personalization_level: number | null
  context_policy: Record<string, unknown> | null
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

function fallbackDraftMessage(instruction: string, slotLabel: string): string {
  return `Petit rappel (${slotLabel}) : ${clampText(cleanText(instruction), 180)}`
}

function normalizeGeneratedMessages(raw: unknown, expectedCount: number): string[] {
  let parsed: any = null
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch {
    parsed = null
  }
  const messages = Array.isArray(parsed?.messages) ? parsed.messages : []
  return messages
    .map((m: any) => clampText(cleanText(m).replace(/\*\*/g, ""), 900))
    .filter(Boolean)
    .slice(0, expectedCount)
}

function parsePersonalizationLevel(raw: unknown): 1 | 2 | 3 {
  const n = Number(raw)
  if (n === 3) return 3
  if (n === 2) return 2
  return 1
}

function boolFlag(obj: Record<string, unknown> | null | undefined, key: string, fallback: boolean): boolean {
  if (!obj || typeof obj !== "object") return fallback
  if (!(key in obj)) return fallback
  return Boolean((obj as any)[key])
}

function listUpcomingSlots(params: {
  timezone: string
  localTimeHHMM: string
  scheduledDays: string[]
  horizonDays?: number
}): Array<{ dayOffset: number; weekdayKey: string; scheduledFor: string; slotLabel: string }> {
  const horizon = Math.max(1, Math.min(10, Number(params.horizonDays ?? 7)))
  const slots: Array<{ dayOffset: number; weekdayKey: string; scheduledFor: string; slotLabel: string }> = []
  for (let dayOffset = 1; dayOffset <= horizon; dayOffset++) {
    const weekdayKey = weekdayKeyInTimezone({ timezone: params.timezone, dayOffset, now: new Date() })
    if (!params.scheduledDays.includes(weekdayKey)) continue
    const scheduledFor = computeScheduledForFromLocal({
      timezone: params.timezone,
      dayOffset,
      localTimeHHMM: params.localTimeHHMM,
    })
    slots.push({
      dayOffset,
      weekdayKey,
      scheduledFor,
      slotLabel: `J+${dayOffset} (${weekdayKey})`,
    })
  }
  return slots
}

async function buildPersonalContextBlock(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
  level: 1 | 2 | 3
  contextPolicy: Record<string, unknown> | null
}): Promise<{ effectiveLevel: 1 | 2 | 3; block: string }> {
  const includePlanWhy = boolFlag(params.contextPolicy, "include_plan_why", params.level >= 2)
  const includePlanBlockers = boolFlag(params.contextPolicy, "include_plan_blockers", params.level >= 2)
  const includeNorthStar = boolFlag(params.contextPolicy, "include_north_star", params.level >= 2)
  const includeTopicMemories = boolFlag(params.contextPolicy, "include_topic_memories_last_week", params.level >= 3)
  const includeTopicMetadata = boolFlag(params.contextPolicy, "include_topic_metadata", params.level >= 3)

  if (!includePlanWhy && !includePlanBlockers && !includeNorthStar && !includeTopicMemories) {
    return { effectiveLevel: 1, block: "Aucun contexte personnel externe (niveau 1)." }
  }

  const { data: activeGoal } = await params.supabaseAdmin
    .from("user_goals")
    .select("id,submission_id,north_star_id,axis_title")
    .eq("user_id", params.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const goalId = String((activeGoal as any)?.id ?? "").trim()
  const submissionId = String((activeGoal as any)?.submission_id ?? "").trim()
  const northStarId = String((activeGoal as any)?.north_star_id ?? "").trim()

  let deepWhy = ""
  let blockers = ""
  if (goalId || submissionId) {
    const q = params.supabaseAdmin
      .from("user_plans")
      .select("deep_why,inputs_why,inputs_blockers,created_at")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false })
      .limit(1)
    const filtered = goalId ? q.eq("goal_id", goalId) : q.eq("submission_id", submissionId)
    const { data: planRow } = await filtered.maybeSingle()
    deepWhy = cleanText((planRow as any)?.deep_why || (planRow as any)?.inputs_why || "")
    blockers = cleanText((planRow as any)?.inputs_blockers || "")
  }

  let northStarLine = ""
  if (includeNorthStar) {
    if (northStarId) {
      const { data: ns } = await params.supabaseAdmin
        .from("user_north_stars")
        .select("title,current_value,target_value,unit,status")
        .eq("id", northStarId)
        .eq("user_id", params.userId)
        .maybeSingle()
      if (ns) {
        northStarLine = `${cleanText((ns as any)?.title)} | actuel=${cleanText((ns as any)?.current_value)} | cible=${cleanText((ns as any)?.target_value)} ${cleanText((ns as any)?.unit)}`
      }
    } else if (submissionId) {
      const { data: ns } = await params.supabaseAdmin
        .from("user_north_stars")
        .select("title,current_value,target_value,unit,status")
        .eq("user_id", params.userId)
        .eq("submission_id", submissionId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ns) {
        northStarLine = `${cleanText((ns as any)?.title)} | actuel=${cleanText((ns as any)?.current_value)} | cible=${cleanText((ns as any)?.target_value)} ${cleanText((ns as any)?.unit)}`
      }
    }
  }

  let topicsBlock = ""
  if (includeTopicMemories) {
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: topics } = await params.supabaseAdmin
      .from("user_topic_memories")
      .select("title,synthesis,metadata,last_enriched_at,mention_count")
      .eq("user_id", params.userId)
      .eq("status", "active")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(6)
    const topicRows = (topics ?? [])
      .map((t: any) => {
        const title = cleanText(t?.title, "Topic")
        const synthesis = clampText(cleanText(t?.synthesis), 240)
        const mentionCount = Number(t?.mention_count ?? 0)
        const metadata = includeTopicMetadata && t?.metadata && typeof t.metadata === "object"
          ? ` | metadata=${clampText(JSON.stringify(t.metadata), 220)}`
          : ""
        return `- ${title} (mentions=${mentionCount})${metadata}\n  ${synthesis}`
      })
      .filter(Boolean)
      .join("\n")
    topicsBlock = topicRows
  }

  const lines: string[] = []
  if (includePlanWhy && deepWhy) lines.push(`Pourquoi profond:\n${clampText(deepWhy, 700)}`)
  if (includePlanBlockers && blockers) lines.push(`Blocages initiaux:\n${clampText(blockers, 700)}`)
  if (includeNorthStar && northStarLine) lines.push(`North Star:\n${northStarLine}`)
  if (includeTopicMemories && topicsBlock) lines.push(`Topics memories (7 derniers jours):\n${topicsBlock}`)

  if (lines.length === 0) {
    const fallbackLevel = params.level >= 2 ? 1 : params.level
    return { effectiveLevel: fallbackLevel, block: "Contexte personnel indisponible, rester en formulation sobre." }
  }

  const effectiveLevel: 1 | 2 | 3 =
    includeTopicMemories && topicsBlock ? 3 : 2
  return { effectiveLevel, block: lines.join("\n\n") }
}

async function generateRecurringReminderWeeklyDrafts(params: {
  timezone: string
  locale: string | null
  reminderInstruction: string
  reminderRationale: string | null
  recentReminderDrafts: string[]
  slots: Array<{ dayOffset: number; weekdayKey: string; scheduledFor: string; slotLabel: string }>
  personalizationLevel: 1 | 2 | 3
  personalContextBlock: string
  requestId: string
}): Promise<{ drafts: string[]; generatedCount: number; missingCount: number; repairAttempts: number }> {
  const tctx = buildUserTimeContextFromValues({
    timezone: params.timezone,
    locale: params.locale,
  })

  const last3 = params.recentReminderDrafts
    .slice(0, 3)
    .map((m, i) => `${i + 1}. ${m}`)
    .join("\n")

  const slotsBlock = params.slots
    .map((s, i) => `${i + 1}. ${s.slotLabel} | scheduled_for=${s.scheduledFor}`)
    .join("\n")

  const systemPrompt = [
    "Tu es Sophia (mode Companion). Tu dois rédiger une semaine de rendez-vous WhatsApp.",
    "",
    "Contraintes strictes:",
    "- Réponse JSON valide uniquement.",
    `- Tu dois retourner exactement ${params.slots.length} messages (un par slot).`,
    '- Schéma: {"messages":["...", "..."]}',
    "- Chaque message: 2 à 5 lignes, texte brut, 1 question max.",
    "- Ton chaleureux, naturel, tutoiement.",
    "- N'ouvre pas avec Bonjour/Salut/Coucou/Hello.",
    "- Le message doit commencer par une introduction douce et contextuelle (bilan/check-in de fin de journée) avant la question.",
    "- N'ouvre jamais directement avec une métrique, un nombre de minutes, ou une question brute.",
    "- N'utilise pas de formulation qui demande l'autorisation de répondre (ex: 'si tu veux', 'tu peux', 'ça te dit').",
    "- Actionnable tout de suite.",
    "- Variations réelles entre les messages (pas de répétition).",
    "",
    "Objectif utilisateur de ce rappel:",
    `- Instruction: ${clampText(params.reminderInstruction, 260)}`,
    params.reminderRationale ? `- Pourquoi c'est important: ${clampText(params.reminderRationale, 320)}` : "",
    "- Priorité absolue: respecte l'instruction utilisateur. N'altère jamais son intention pour varier le style.",
    "",
    "Niveau de personnalisation requis:",
    `- Niveau attendu: ${params.personalizationLevel}`,
    "- Respecte strictement les sources autorisées ci-dessous.",
    "Contexte autorisé:",
    params.personalContextBlock,
    "",
    "Variation obligatoire:",
    "- Les 3 derniers rendez-vous servent UNIQUEMENT à éviter les répétitions.",
    "- Tu dois varier l'angle et la formulation par rapport aux 3 derniers rendez-vous envoyés.",
    "- Tu ne dois jamais privilégier la variation au détriment de l'instruction utilisateur.",
    "- Interdit de rephraser quasi-identique les exemples ci-dessous.",
    last3 ? `Derniers rendez-vous:\n${last3}` : "Derniers rendez-vous: (aucun)",
    "",
    "Repere temporel local utilisateur:",
    tctx.prompt_block,
    "",
    "Slots à couvrir (dans l'ordre):",
    slotsBlock,
    "",
    "Auto-check avant de répondre:",
    "- Vérifie que chaque message est cohérent avec l'instruction utilisateur.",
    `- Vérifie que tu renvoies exactement ${params.slots.length} messages.`,
  ]
    .filter(Boolean)
    .join("\n")

  let repairAttempts = 0
  let normalized: string[] = []
  try {
    const outRaw = await generateWithGemini(
      systemPrompt,
      "Génère les messages maintenant.",
      0.5,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        model: RDV_GENERATION_MODEL,
        source: "schedule-recurring-checkins",
        forceRealAi: true,
      },
    )
    normalized = normalizeGeneratedMessages(outRaw, params.slots.length)
  } catch {
    normalized = []
  }

  if (normalized.length !== params.slots.length) {
    repairAttempts++
    try {
      const repairPrompt = [
        "La sortie précédente n'avait pas le bon nombre de messages.",
        `Corrige et retourne EXACTEMENT ${params.slots.length} messages.`,
        "- Priorité absolue: respecter l'instruction utilisateur.",
        "- Les 3 derniers rendez-vous ne servent qu'à éviter les répétitions.",
        "Slots à couvrir (ordre strict):",
        slotsBlock,
      ].join("\n")
      const repairedRaw = await generateWithGemini(
        systemPrompt,
        repairPrompt,
        0.4,
        true,
        [],
        "auto",
        {
          requestId: `${params.requestId}:repair`,
          model: RDV_GENERATION_MODEL,
          source: "schedule-recurring-checkins",
          forceRealAi: true,
        },
      )
      const repaired = normalizeGeneratedMessages(repairedRaw, params.slots.length)
      if (repaired.length > 0) normalized = repaired
    } catch {
      // Keep fallback below.
    }
  }

  if (normalized.length < params.slots.length) {
    normalized = params.slots.map((slot, idx) => {
      const existing = normalized[idx]
      if (existing) return existing
      return fallbackDraftMessage(params.reminderInstruction, slot.slotLabel)
    })
  }

  return {
    drafts: normalized.slice(0, params.slots.length),
    generatedCount: normalized.length,
    missingCount: Math.max(0, params.slots.length - normalized.length),
    repairAttempts,
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp
    const body = await req.json().catch(() => ({} as any))
    const reminderIdFilter = cleanText((body as any)?.reminder_id)
    const userIdFilter = cleanText((body as any)?.user_id)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    let remindersQuery = supabaseAdmin
      .from("user_recurring_reminders")
      .select("id,user_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,personalization_level,context_policy")
      .eq("status", "active")
      .order("created_at", { ascending: true })
    if (reminderIdFilter) remindersQuery = remindersQuery.eq("id", reminderIdFilter)
    if (userIdFilter) remindersQuery = remindersQuery.eq("user_id", userIdFilter)
    const { data: reminders, error: remindersErr } = await remindersQuery

    if (remindersErr) throw remindersErr
    if (!reminders || reminders.length === 0) {
      return jsonResponse(
        req,
        {
          success: true,
          scheduled: 0,
          request_id: requestId,
          reminder_id: reminderIdFilter || null,
          user_id: userIdFilter || null,
        },
        { includeCors: false },
      )
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
      const days = Array.isArray(reminder.scheduled_days) ? reminder.scheduled_days : []
      const slots = listUpcomingSlots({
        timezone,
        localTimeHHMM: reminder.local_time_hhmm,
        scheduledDays: days,
        horizonDays: 7,
      })
      if (slots.length === 0) {
        skipped++
        continue
      }

      const eventContext = `recurring_reminder:${reminder.id}`

      // Batch weekly generation once per rendez-vous:
      // if there are still future pending/awaiting checkins in the next 7 days, skip generation.
      const horizonEndIso = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
      const { data: existingFutureRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("id")
        .eq("user_id", reminder.user_id)
        .eq("event_context", eventContext)
        .in("status", ["pending", "awaiting_user"])
        .gte("scheduled_for", new Date().toISOString())
        .lt("scheduled_for", horizonEndIso)
        .limit(1)
      if ((existingFutureRows ?? []).length > 0) {
        skipped++
        continue
      }

      const { data: historyRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("draft_message")
        .eq("user_id", reminder.user_id)
        .like("event_context", "recurring_reminder:%")
        .not("draft_message", "is", null)
        .order("created_at", { ascending: false })
        .limit(3)

      const recentDrafts = (historyRows ?? [])
        .map((r: any) => cleanText(r?.draft_message))
        .filter(Boolean)
        .slice(0, 3)

      const configuredLevel = parsePersonalizationLevel(reminder.personalization_level)
      const personalContext = await buildPersonalContextBlock({
        supabaseAdmin,
        userId: reminder.user_id,
        level: configuredLevel,
        contextPolicy: reminder.context_policy ?? null,
      })

      let weeklyDrafts: string[] = []
      let generationStats = { generatedCount: 0, missingCount: 0, repairAttempts: 0 }
      try {
        const generation = await generateRecurringReminderWeeklyDrafts({
          timezone,
          locale,
          reminderInstruction: reminder.message_instruction,
          reminderRationale: reminder.rationale ?? null,
          recentReminderDrafts: recentDrafts,
          slots,
          personalizationLevel: personalContext.effectiveLevel,
          personalContextBlock: personalContext.block,
          requestId,
        })
        weeklyDrafts = generation.drafts
        generationStats = {
          generatedCount: generation.generatedCount,
          missingCount: generation.missingCount,
          repairAttempts: generation.repairAttempts,
        }
      } catch (e) {
        console.warn(`[schedule-recurring-checkins] request_id=${requestId} generation_failed reminder_id=${reminder.id}`, e)
        weeklyDrafts = slots.map((slot) => fallbackDraftMessage(reminder.message_instruction, slot.slotLabel))
        generationStats = {
          generatedCount: 0,
          missingCount: slots.length,
          repairAttempts: 0,
        }
      }

      let insertedForReminder = 0
      for (let idx = 0; idx < slots.length; idx++) {
        const slot = slots[idx]
        const draftMessage = cleanText(weeklyDrafts[idx], `Petit rappel: ${clampText(cleanText(reminder.message_instruction), 180)}`)
        const payload = {
          source: "recurring_reminder_weekly",
          recurring_reminder_id: reminder.id,
          reminder_instruction: reminder.message_instruction,
          reminder_rationale: reminder.rationale ?? null,
          personalization_level_configured: configuredLevel,
          personalization_level_effective: personalContext.effectiveLevel,
          generated_at: new Date().toISOString(),
          slot_day_offset: slot.dayOffset,
          slot_weekday: slot.weekdayKey,
        }

        const { error: upsertErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: reminder.user_id,
              origin: "rendez_vous",
              event_context: eventContext,
              draft_message: draftMessage,
              message_mode: "static",
              message_payload: payload,
              scheduled_for: slot.scheduledFor,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          )
        if (upsertErr) {
          console.error(`[schedule-recurring-checkins] request_id=${requestId} upsert_failed reminder_id=${reminder.id}`, upsertErr)
          continue
        }
        insertedForReminder++
      }

      // Strict exact-match safeguard at DB level: verify all expected slots exist, then repair missing rows.
      let repairDbAttempts = 0
      const expectedScheduledFor = new Set(slots.map((s) => s.scheduledFor))
      const { data: existingRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("scheduled_for")
        .eq("user_id", reminder.user_id)
        .eq("event_context", eventContext)
        .in("scheduled_for", [...expectedScheduledFor])

      const existingSet = new Set((existingRows ?? []).map((r: any) => String(r.scheduled_for ?? "")))
      const missingSlots = slots.filter((s) => !existingSet.has(s.scheduledFor))
      if (missingSlots.length > 0) {
        repairDbAttempts++
        for (const slot of missingSlots) {
          const payload = {
            source: "recurring_reminder_weekly_repair",
            recurring_reminder_id: reminder.id,
            reminder_instruction: reminder.message_instruction,
            reminder_rationale: reminder.rationale ?? null,
            personalization_level_configured: configuredLevel,
            personalization_level_effective: personalContext.effectiveLevel,
            generated_at: new Date().toISOString(),
            slot_day_offset: slot.dayOffset,
            slot_weekday: slot.weekdayKey,
          }
          const fallbackDraft = fallbackDraftMessage(reminder.message_instruction, slot.slotLabel)
          await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: reminder.user_id,
                origin: "rendez_vous",
                event_context: eventContext,
                draft_message: fallbackDraft,
                message_mode: "static",
                message_payload: payload,
                scheduled_for: slot.scheduledFor,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            )
        }
      }

      const { data: finalRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("scheduled_for")
        .eq("user_id", reminder.user_id)
        .eq("event_context", eventContext)
        .in("scheduled_for", [...expectedScheduledFor])

      const finalInserted = (finalRows ?? []).length
      console.log(
        JSON.stringify({
          tag: "recurring_weekly_cardinality",
          request_id: requestId,
          reminder_id: reminder.id,
          model: RDV_GENERATION_MODEL,
          expected_slots: slots.length,
          generated_messages: generationStats.generatedCount,
          missing_count: Math.max(0, slots.length - finalInserted),
          repair_attempts: generationStats.repairAttempts + repairDbAttempts,
          final_inserted: finalInserted,
        }),
      )

      const { error: markErr } = await supabaseAdmin
        .from("user_recurring_reminders")
        .update({
          last_drafted_at: new Date().toISOString(),
          last_draft_message: weeklyDrafts[0] ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminder.id)
      if (markErr) {
        console.warn(`[schedule-recurring-checkins] request_id=${requestId} reminder_mark_failed reminder_id=${reminder.id}`, markErr)
      }

      scheduled += finalInserted
    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        skipped,
        candidates: reminders.length,
        request_id: requestId,
        reminder_id: reminderIdFilter || null,
        user_id: userIdFilter || null,
      },
      { includeCors: false },
    )
  } catch (error) {
    console.error(`[schedule-recurring-checkins] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


