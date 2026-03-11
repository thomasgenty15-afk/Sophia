/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts"
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts"

const MODEL = "gpt-5.2"
const EVENT_CONTEXT = "morning_active_actions_nudge"
const TARGET_LOCAL_TIME = "07:00"

type ActiveActionRow = {
  id: string
  title: string
  kind: "action" | "framework"
  source: "plan" | "personal" | "framework"
  scheduled_days: string[] | null
  time_of_day: string | null
}

type ActivePlanContext = {
  id: string
  deepWhy: string
  blockers: string
  lowMotivationMessage: string
  orderedActionTitles: string[]
}

type Slot = {
  dayOffset: number
  weekdayKey: string
  scheduledFor: string
  slotLabel: string
  todayActionTitles: string[]
  todayFrameworkTitles: string[]
  todayItemTitles: string[]
  allActionTitles: string[]
  allFrameworkTitles: string[]
  allItemTitles: string[]
}

function cleanText(v: unknown, fallback = ""): string {
  const t = String(v ?? "").trim()
  return t || fallback
}

function clampText(v: string, maxChars: number): string {
  if (v.length <= maxChars) return v
  return v.slice(0, maxChars - 1).trimEnd() + "…"
}

function normalizeKey(v: unknown): string {
  return String(v ?? "").trim().toLowerCase()
}

function isWhatsappSchedulingTierEligible(accessTierRaw: unknown): boolean {
  const tier = cleanText(accessTierRaw).toLowerCase()
  return tier === "trial" || tier === "alliance" || tier === "architecte"
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function fallbackDraftMessage(actionTitles: string[]): string {
  if (actionTitles.length === 0) {
    return "Ce matin, choisis une petite action simple pour te mettre en mouvement et créer l’élan du jour."
  }
  if (actionTitles.length === 1) {
    return `Bonjour. N’oublie pas ${actionTitles[0]} ce matin: c’est un vrai pas vers ce que tu veux construire, et tu peux le faire.`
  }
  return `Bonjour. N’oublie pas ${actionTitles.join(", ")} aujourd’hui: c’est important pour avancer vers ce qui compte pour toi, et tu peux le faire.`
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
    .map((m: unknown) => clampText(cleanText(m).replace(/\*\*/g, ""), 900))
    .filter(Boolean)
    .slice(0, expectedCount)
}

function localDateTimeParts(timezoneRaw: unknown, now = new Date()): {
  weekdayKey: string
  hour: number
  minute: number
} {
  const timezone = cleanText(timezoneRaw, "Europe/Paris")
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayShort = cleanText(parts.find((p) => p.type === "weekday")?.value).toLowerCase().slice(0, 3)
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  const weekdayMap: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  }
  return {
    weekdayKey: weekdayMap[weekdayShort] ?? "mon",
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  }
}

function weekdayKeyInTimezone(params: { timezone: string; dayOffset: number; now?: Date }): string {
  const timezone = cleanText(params.timezone, "Europe/Paris")
  const target = new Date((params.now ?? new Date()).getTime() + Math.max(0, params.dayOffset) * 24 * 60 * 60 * 1000)
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(target).toLowerCase().slice(0, 3)
  const map: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  }
  return map[short] ?? "mon"
}

function buildSlots(params: {
  timezone: string
  actions: ActiveActionRow[]
  now?: Date
}): Slot[] {
  const now = params.now ?? new Date()
  const local = localDateTimeParts(params.timezone, now)
  const weekdayIndex: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  }
  const currentDow = weekdayIndex[local.weekdayKey] ?? 1
  const currentMinutes = (local.hour * 60) + local.minute
  const startOffset = currentMinutes < 7 * 60 ? 0 : 1
  const startDow = (currentDow + startOffset) % 7
  const slotCount = ((7 - startDow) % 7) + 1
  const allActionTitles = params.actions.map((a) => a.title).filter(Boolean)
  const allFrameworkTitles = params.actions
    .filter((a) => a.kind === "framework")
    .map((a) => a.title)
    .filter(Boolean)
  const allItemTitles = params.actions.map((a) => a.title).filter(Boolean)

  const slots: Slot[] = []
  for (let i = 0; i < slotCount; i++) {
    const dayOffset = startOffset + i
    const weekdayKey = weekdayKeyInTimezone({ timezone: params.timezone, dayOffset, now })
    const todayItems = params.actions
      .filter((action) => {
        const days = Array.isArray(action.scheduled_days) ? action.scheduled_days : null
        return !days || days.length === 0 || days.includes(weekdayKey)
      })
      .filter((action) => Boolean(action.title))
    const todayActionTitles = todayItems
      .filter((action) => action.kind === "action")
      .map((action) => action.title)
    const todayFrameworkTitles = todayItems
      .filter((action) => action.kind === "framework")
      .map((action) => action.title)
    const todayItemTitles = todayItems.map((action) => action.title)
    slots.push({
      dayOffset,
      weekdayKey,
      scheduledFor: computeScheduledForFromLocal({
        timezone: params.timezone,
        dayOffset,
        localTimeHHMM: TARGET_LOCAL_TIME,
        now,
      }),
      slotLabel: `J+${dayOffset} (${weekdayKey})`,
      todayActionTitles,
      todayFrameworkTitles,
      todayItemTitles,
      allActionTitles,
      allFrameworkTitles,
      allItemTitles,
    })
  }
  return slots
}

async function fetchActiveActionsForUser(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
}): Promise<{ actions: ActiveActionRow[]; planContext: ActivePlanContext | null }> {
  const { supabaseAdmin, userId } = params
  const { data: activePlan } = await supabaseAdmin
    .from("user_plans")
    .select("id,deep_why,inputs_why,inputs_blockers,inputs_low_motivation_message,content")
    .eq("user_id", userId)
    .in("status", ["active", "in_progress", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const planId = cleanText((activePlan as any)?.id)

  const planActionsQuery = supabaseAdmin
    .from("user_actions")
    .select("id,title,scheduled_days,time_of_day")
    .eq("user_id", userId)
    .eq("status", "active")

  const { data: planActions, error: planErr } = planId
    ? await planActionsQuery.eq("plan_id", planId)
    : await planActionsQuery
  if (planErr) throw planErr

  const { data: personalActions, error: personalErr } = await supabaseAdmin
    .from("user_personal_actions")
    .select("id,title,scheduled_days,time_of_day,created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
  if (personalErr) throw personalErr

  const frameworksQuery = supabaseAdmin
    .from("user_framework_tracking")
    .select("id,title,created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  const { data: activeFrameworks, error: frameworksErr } = planId
    ? await frameworksQuery.eq("plan_id", planId)
    : await frameworksQuery
  if (frameworksErr) throw frameworksErr

  const orderedPlanTitles = Array.isArray((activePlan as any)?.content?.phases)
    ? ((activePlan as any).content.phases as any[])
      .flatMap((phase: any) => Array.isArray(phase?.actions) ? phase.actions : [])
      .map((action: any) => cleanText(action?.title))
      .filter(Boolean)
    : []
  const planOrder = new Map<string, number>()
  orderedPlanTitles.forEach((title, index) => {
    const key = normalizeKey(title)
    if (!planOrder.has(key)) planOrder.set(key, index)
  })

  const sortedPlanRows = [...(planActions ?? [])].sort((a: any, b: any) => {
    const aIdx = planOrder.get(normalizeKey(a?.title))
    const bIdx = planOrder.get(normalizeKey(b?.title))
    if (aIdx != null && bIdx != null) return aIdx - bIdx
    if (aIdx != null) return -1
    if (bIdx != null) return 1
    return cleanText(a?.title).localeCompare(cleanText(b?.title), "fr")
  })

  const rows: ActiveActionRow[] = []
  for (const row of sortedPlanRows as any[]) {
    const title = cleanText(row?.title)
    if (!title) continue
    rows.push({
      id: cleanText(row?.id),
      title,
      kind: "action",
      source: "plan",
      scheduled_days: Array.isArray(row?.scheduled_days) ? row.scheduled_days : null,
      time_of_day: cleanText(row?.time_of_day) || null,
    })
  }
  for (const row of (personalActions ?? []) as any[]) {
    const title = cleanText(row?.title)
    if (!title) continue
    rows.push({
      id: cleanText(row?.id),
      title,
      kind: "action",
      source: "personal",
      scheduled_days: Array.isArray(row?.scheduled_days) ? row.scheduled_days : null,
      time_of_day: cleanText(row?.time_of_day) || null,
    })
  }
  for (const row of (activeFrameworks ?? []) as any[]) {
    const title = cleanText(row?.title)
    if (!title) continue
    rows.push({
      id: cleanText(row?.id),
      title,
      kind: "framework",
      source: "framework",
      scheduled_days: null,
      time_of_day: null,
    })
  }
  const planContext = activePlan
    ? {
      id: cleanText((activePlan as any)?.id),
      deepWhy: cleanText((activePlan as any)?.deep_why || (activePlan as any)?.inputs_why),
      blockers: cleanText((activePlan as any)?.inputs_blockers),
      lowMotivationMessage: cleanText((activePlan as any)?.inputs_low_motivation_message),
      orderedActionTitles: orderedPlanTitles,
    }
    : null
  return { actions: rows, planContext }
}

async function generateWeeklyDrafts(params: {
  userId: string
  timezone: string
  locale: string | null
  recentDrafts: string[]
  slots: Slot[]
  planContext: ActivePlanContext | null
  requestId: string
}): Promise<string[]> {
  const tctx = buildUserTimeContextFromValues({
    timezone: params.timezone,
    locale: params.locale,
  })
  const recentBlock = params.recentDrafts
    .slice(0, 3)
    .map((msg, index) => `${index + 1}. ${msg}`)
    .join("\n")
  const slotsBlock = params.slots
    .map((slot, index) => {
      const focus = slot.todayItemTitles.length > 0
        ? slot.todayItemTitles.join(", ")
        : slot.allItemTitles.join(", ")
      return `${index + 1}. ${slot.slotLabel} | scheduled_for=${slot.scheduledFor} | items=${focus || "aucun"}`
    })
    .join("\n")
  const planContextBlock = [
    params.planContext?.deepWhy
      ? `Pourquoi profond du plan:\n${clampText(params.planContext.deepWhy, 700)}`
      : "",
    params.planContext?.blockers
      ? `Blocages connus du plan:\n${clampText(params.planContext.blockers, 700)}`
      : "",
    params.planContext?.lowMotivationMessage
      ? `Quand la personne a la flemme, elle veut entendre:\n${clampText(params.planContext.lowMotivationMessage, 700)}`
      : "",
  ].filter(Boolean).join("\n\n")

  const systemPrompt = [
    "Tu es Sophia (mode Companion). Tu rédiges une semaine de messages WhatsApp du matin.",
    "",
    "Contraintes strictes:",
    "- Réponse JSON valide uniquement.",
    `- Retourne exactement ${params.slots.length} messages.`,
    '- Schéma: {"messages":["...", "..."]}',
    "- Chaque message: 3 à 5 lignes maximum, texte brut, 1 question max.",
    "- Ton chaleureux, encourageant, naturel, tutoiement.",
    "- Ouvre naturellement avec un bonjour positif du matin.",
    "- Mets toujours 1 emoji naturel juste après le bonjour / l'ouverture du matin sur la première ligne.",
    "- Ne parle jamais d'automatisation, de cron, de template ou de rappel programmé.",
    "- Le but est d'aider la personne a se mettre en mouvement pour sa journee, sans pression excessive.",
    "- Meme si le message est envoye le matin, parle de la journee dans son ensemble, pas seulement de 'ce matin'.",
    "- Evite les formulations qui reduisent le rappel a la matinee seule, sauf si une action est explicitement matinale.",
    "- Les frameworks actifs comptent ici comme des actions a rappeler a l'utilisateur.",
    "- Quand des items sont fournis pour le jour, tu dois tous les citer, y compris les frameworks.",
    "- Respecte strictement l'ordre des items tel qu'il est fourni dans le slot.",
    "- N'invente aucun item absent du contexte.",
    "- Si un contexte de plan est fourni, utilise-le pour choisir le bon angle d'encouragement.",
    "- Si un message special 'quand j'ai la flemme' est fourni, inspire-t-en sans le recopier mot pour mot a chaque fois.",
    "- Chaque message doit melanger 4 ingredients, de facon fluide et humaine:",
    "  1. un bonjour positif,",
    "  2. un rappel de faire les actions du jour,",
    "  3. un rappel bref de pourquoi c'est important pour cette personne,",
    "  4. une phrase de confiance ou d'elan final.",
    "- Le message ne doit pas etre culpabilisant.",
    "- Le rappel du pourquoi doit rester concret et personnel, pas abstrait.",
    "- Reste dense et clair, mais n'omets aucune action active du slot.",
    "- Vraie variation entre les messages d'un meme lot.",
    "- Evite les enumerations mecaniques du type 'Aujourd'hui: action 1, action 2, action 3'.",
    "- Evite que plusieurs messages du lot commencent ou se structurent de la meme facon.",
    "- Varie la facon de citer les actions: parfois en sequence fluide dans une phrase, parfois en deux temps, parfois en mettant une action en avant puis les autres ensuite.",
    "- Ne donne pas l'impression d'un template repete chaque matin.",
    "- La derniere phrase doit varier d'un message a l'autre: interdiction de reutiliser systematiquement 'tu peux le faire'.",
    "- Varie les fins avec des formulations comme elan, confiance, ancrage, pas concret, cap, souffle, demarrage, sans toujours reprendre la meme phrase.",
    "",
    "Repere temporel local utilisateur:",
    tctx.prompt_block,
    "",
    "Contexte de transformation autorise:",
    planContextBlock || "(aucun contexte de plan a injecter)",
    "",
    "Historique recent pour eviter les repetitions:",
    recentBlock || "(aucun)",
    "",
    "Messages a couvrir dans l'ordre:",
    slotsBlock,
    "",
    "Auto-check avant de repondre:",
    `- Il y a exactement ${params.slots.length} messages.`,
    "- Chaque message aide a lancer la journee et a tenir le cap jusqu'au soir.",
  ].join("\n")

  let normalized: string[] = []
  try {
    const outRaw = await generateWithGemini(
      systemPrompt,
      "Genere les messages maintenant.",
      0.5,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        userId: params.userId,
        model: MODEL,
        source: "schedule-morning-active-action-checkins",
        forceRealAi: true,
      },
    )
    normalized = normalizeGeneratedMessages(outRaw, params.slots.length)
  } catch {
    normalized = []
  }

  if (normalized.length !== params.slots.length) {
    try {
      const repairedRaw = await generateWithGemini(
        systemPrompt,
        `Corrige et retourne EXACTEMENT ${params.slots.length} messages en JSON valide.`,
        0.4,
        true,
        [],
        "auto",
        {
          requestId: `${params.requestId}:repair`,
          userId: params.userId,
          model: MODEL,
          source: "schedule-morning-active-action-checkins",
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
    return params.slots.map((slot, index) => normalized[index] || fallbackDraftMessage(
      slot.todayItemTitles.length > 0 ? slot.todayItemTitles : slot.allItemTitles,
    ))
  }

  return normalized.slice(0, params.slots.length)
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const body = await req.json().catch(() => ({} as any))
    const userIdFilter = cleanText((body as any)?.user_id)
    const fullReset = Boolean((body as any)?.full_reset)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    let activeUsersQuery = supabaseAdmin
      .from("profiles")
      .select("id,timezone,locale,whatsapp_coaching_paused_until,whatsapp_opted_in,access_tier")
      .order("id", { ascending: true })

    if (userIdFilter) activeUsersQuery = activeUsersQuery.eq("id", userIdFilter)
    const { data: profiles, error: profilesErr } = await activeUsersQuery
    if (profilesErr) throw profilesErr

    let scheduled = 0
    let skipped = 0
    let candidates = 0

    for (const profile of (profiles ?? []) as any[]) {
      const userId = cleanText(profile?.id)
      if (!userId) continue
      if (!Boolean(profile?.whatsapp_opted_in)) {
        skipped++
        continue
      }
      const coachingPauseUntilRaw = cleanText(profile?.whatsapp_coaching_paused_until)
      const coachingPauseUntilMs = coachingPauseUntilRaw ? new Date(coachingPauseUntilRaw).getTime() : NaN
      if (Number.isFinite(coachingPauseUntilMs) && coachingPauseUntilMs > Date.now()) {
        const nowIso = new Date().toISOString()
        const pauseUntilIso = new Date(coachingPauseUntilMs).toISOString()
        const { error: pauseCancelErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: nowIso,
          } as any)
          .eq("user_id", userId)
          .eq("event_context", EVENT_CONTEXT)
          .in("status", ["pending", "awaiting_user"])
          .gte("scheduled_for", nowIso)
          .lt("scheduled_for", pauseUntilIso)
        if (pauseCancelErr) throw pauseCancelErr
        skipped++
        continue
      }
      if (fullReset) {
        const nowIso = new Date().toISOString()
        const { error: resetErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .delete()
          .eq("user_id", userId)
          .eq("event_context", EVENT_CONTEXT)
          .in("status", ["pending", "awaiting_user"])
          .gte("scheduled_for", nowIso)
        if (resetErr) throw resetErr
      }
      if (!isWhatsappSchedulingTierEligible(profile?.access_tier)) {
        skipped++
        continue
      }

      const { actions, planContext } = await fetchActiveActionsForUser({ supabaseAdmin, userId })
      if (actions.length === 0) continue
      candidates++

      const timezone = cleanText(profile?.timezone, "Europe/Paris")
      const locale = profile?.locale ?? null
      const slots = buildSlots({ timezone, actions })
      if (slots.length === 0) {
        skipped++
        continue
      }

      const horizonEndIso = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
      const { data: existingFutureRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("id")
        .eq("user_id", userId)
        .eq("event_context", EVENT_CONTEXT)
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
        .eq("user_id", userId)
        .eq("event_context", EVENT_CONTEXT)
        .not("draft_message", "is", null)
        .order("created_at", { ascending: false })
        .limit(3)

      const recentDrafts = (historyRows ?? [])
        .map((row: any) => cleanText(row?.draft_message))
        .filter(Boolean)
        .slice(0, 3)

      const weeklyDrafts = await generateWeeklyDrafts({
        userId,
        timezone,
        locale,
        recentDrafts,
        slots,
        planContext,
        requestId: `${requestId}:${userId}`,
      })

      const expectedDayOffsets = new Set(slots.map((slot) => slot.dayOffset))

      for (let index = 0; index < slots.length; index++) {
        const slot = slots[index]
        const draftMessage = cleanText(
          weeklyDrafts[index],
          fallbackDraftMessage(slot.todayItemTitles.length > 0 ? slot.todayItemTitles : slot.allItemTitles),
        )
        const payload = {
          source: "morning_active_actions_weekly",
          slot_day_offset: slot.dayOffset,
          slot_weekday: slot.weekdayKey,
          active_action_titles: slot.allActionTitles,
          active_framework_titles: slot.allFrameworkTitles,
          active_item_titles: slot.allItemTitles,
          today_action_titles: slot.todayActionTitles,
          today_framework_titles: slot.todayFrameworkTitles,
          today_item_titles: slot.todayItemTitles,
          generated_at: new Date().toISOString(),
        }
        const { error: upsertErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: userId,
              origin: "rendez_vous",
              event_context: EVENT_CONTEXT,
              draft_message: draftMessage,
              message_mode: "static",
              message_payload: payload,
              scheduled_for: slot.scheduledFor,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          )
        if (upsertErr) {
          console.error(`[schedule-morning-active-action-checkins] request_id=${requestId} upsert_failed user_id=${userId}`, upsertErr)
        }
      }

      const { data: finalRows } = await supabaseAdmin
        .from("scheduled_checkins")
        .select("message_payload")
        .eq("user_id", userId)
        .eq("event_context", EVENT_CONTEXT)
        .in("status", ["pending", "awaiting_user"])

      const finalOffsets = new Set<number>(
        (finalRows ?? [])
          .map((row: any) => Number((row?.message_payload ?? {})?.slot_day_offset))
          .filter((n: number) => Number.isFinite(n) && expectedDayOffsets.has(n)),
      )

      scheduled += finalOffsets.size
    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        skipped,
        candidates,
        request_id: requestId,
        user_id: userIdFilter || null,
      },
      { includeCors: false },
    )
  } catch (error) {
    console.error(`[schedule-morning-active-action-checkins] request_id=${requestId}`, error)
    const message = errorToMessage(error)
    await logEdgeFunctionError({
      functionName: "schedule-morning-active-action-checkins",
      requestId,
      error,
      metadata: {
        source: "edge",
      },
    })
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})
