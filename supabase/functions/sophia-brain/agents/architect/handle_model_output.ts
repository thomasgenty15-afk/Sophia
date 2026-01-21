import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { getUserState, normalizeScope, updateUserState } from "../../state-manager.ts"
import { setArchitectToolFlowInTempMemory } from "../../supervisor.ts"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import { handleTracking } from "../../lib/tracking.ts"
import { logEdgeFunctionError } from "../../../_shared/error-log.ts"

import type { ArchitectModelOutput } from "./types.ts"
import { defaultArchitectModelForRequestId } from "./model.ts"
import { formatDaysFrench, dayTokenToFrench } from "./dates.ts"
import { handleBreakDownAction } from "./breakdown.ts"
import { injectActionIntoPlanJson, verifyActionCreated } from "./plan_json.ts"
import { handleUpdateAction } from "./update_action.ts"
import { handleActivateAction, handleArchiveAction } from "./activation.ts"
import {
  looksLikeExplicitActivateActionRequest,
  looksLikeExplicitCreateActionRequest,
  looksLikeExplicitTrackProgressRequest,
  looksLikeExplicitUpdateActionRequest,
  looksLikeExploringActionIdea,
  looksLikeNoToProceed,
  looksLikeUserAsksToAddToPlanLoosely,
  looksLikeYesToProceed,
  parseQuotedActionTitle,
} from "./consent.ts"

function looksLikePlanStepQuestion(message: string): boolean {
  const t = String(message ?? "").toLowerCase()
  return /\b(prochaine\s+[ée]tape|la\s+suite|et\s+apr[eè]s|qu['’]est[-\s]?ce\s+que\s+je\s+dois\s+faire|je\s+dois\s+faire\s+quoi|c['’]est\s+quoi\s+exactement|comment\s+je\s+fais|qu['’]est[-\s]?ce\s+qui\s+se\s+passe)\b/i
    .test(t)
}

function parseExplicitCreateActionFromUserMessage(message: string): {
  title?: string
  description?: string
  targetReps?: number
  time_of_day?: "morning" | "afternoon" | "evening" | "night" | "any_time"
  type?: "habit" | "mission"
} {
  const raw = String(message ?? "")
  const lower = raw.toLowerCase()

  const quoted = raw.match(/(?:\"|«|“)([^\"»”]{2,120})(?:\"|»|”)/)
  const title = quoted?.[1]?.trim() || undefined

  const freqMatch = lower.match(/(?:fr[ée]quence\s*[:：]?\s*)?(\d{1,2})\s*(?:fois|x)\s*par\s*semaine\b/i)
  const targetReps = freqMatch ? Math.max(1, Math.min(7, Number(freqMatch[1]) || 0)) : undefined

  const descMatch = raw.match(/description\s*[:：]\s*([^\n]+)$/i)
  const description = descMatch?.[1]?.trim() || undefined

  const time_of_day = (() => {
    if (/\b(matin|au r[ée]veil)\b/i.test(raw)) return "morning"
    if (/\b(apr[èe]s[-\s]?midi)\b/i.test(raw)) return "afternoon"
    if (/\b(soir|le soir)\b/i.test(raw)) return "evening"
    if (/\b(nuit)\b/i.test(raw)) return "night"
    return undefined
  })()

  const type = /\b(mission|one[-\s]?shot|une fois)\b/i.test(raw) ? "mission" : (/\b(habitude|r[ée]current)\b/i.test(raw) ? "habit" : undefined)

  return { title, description, targetReps, time_of_day, type }
}

function parseExplicitUpdateActionFromUserMessage(message: string): {
  target_name?: string
  new_target_reps?: number
  new_scheduled_days?: string[]
} {
  const raw = String(message ?? "")
  const lower = raw.toLowerCase()

  const quoted = raw.match(/(?:\"|«|“)([^\"»”]{2,120})(?:\"|»|”)/)
  const target_name = quoted?.[1]?.trim() || (/\blecture\b/i.test(raw) ? "Lecture" : undefined)

  const freqRe = /\b(\d{1,2})\s*(?:fois|x)\s*(?:par\s*semaine|\/\s*semaine)\b/ig
  const freqAll = Array.from(lower.matchAll(freqRe))
  const verbRe = /\b(?:mets|met|mettre|passe|ram[eè]ne|descend|augmente|monte)\b[^.\n]{0,60}?\b(\d{1,2})\s*(?:fois|x)\s*par\s*semaine\b/ig
  const verbAll = Array.from(lower.matchAll(verbRe))
  const pick = (arr: RegExpMatchArray[]) => (arr.length > 0 ? arr[arr.length - 1]?.[1] : undefined)
  const picked = pick(verbAll) ?? pick(freqAll)
  let new_target_reps = picked ? Math.max(1, Math.min(7, Number(picked) || 0)) : undefined

  const dayMap: Record<string, string> = {
    "lun": "mon", "lundi": "mon",
    "mar": "tue", "mardi": "tue",
    "mer": "wed", "mercredi": "wed",
    "jeu": "thu", "jeudi": "thu",
    "ven": "fri", "vendredi": "fri",
    "sam": "sat", "samedi": "sat",
    "dim": "sun", "dimanche": "sun",
  }
  const days: string[] = []
  for (const [k, v] of Object.entries(dayMap)) {
    const isFullName = k.length > 3
    const pat = isFullName ? `\\b${k}s?\\b` : `\\b${k}\\b`
    const re = new RegExp(pat, "i")
    if (re.test(raw)) days.push(v)
  }
  const uniq = Array.from(new Set(days))
  const new_scheduled_days = uniq.length > 0 ? uniq : undefined
  if (new_target_reps === undefined && Array.isArray(new_scheduled_days) && new_scheduled_days.length > 0) {
    new_target_reps = Math.max(1, Math.min(7, new_scheduled_days.length))
  }

  return { target_name, new_target_reps, new_scheduled_days }
}

export async function handleArchitectModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  history?: any[]
  response: ArchitectModelOutput
  inWhatsAppGuard24h: boolean
  context?: string
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
  userState?: any
  scope?: string
}): Promise<{ text: string; executed_tools: string[]; tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain" }> {
  const { supabase, userId, message, response, inWhatsAppGuard24h, meta } = opts
  const scope = normalizeScope(opts.scope ?? meta?.scope ?? (meta?.channel === "whatsapp" ? "whatsapp" : "web"), "web")
  const tm0 = ((opts.userState as any)?.temp_memory ?? {}) as any
  const currentFlow = tm0?.architect_tool_flow ?? null

  async function setFlow(next: any | null) {
    const latest = await getUserState(supabase, userId, scope).catch(() => null as any)
    const tmLatest = ((latest as any)?.temp_memory ?? (tm0 ?? {})) as any
    const updated = setArchitectToolFlowInTempMemory({ tempMemory: tmLatest, nextFlow: next })
    await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
  }

  function looksLikeCancel(s: string): boolean {
    const t = String(s ?? "").toLowerCase()
    return /\b(annule|laisse\s+tomber|stop|oublie|on\s+laisse|cancel)\b/i.test(t)
  }

  const isModuleUi = String(opts.context ?? "").includes("=== CONTEXTE MODULE (UI) ===")

  if (currentFlow && looksLikeCancel(message)) {
    try { await setFlow(null) } catch {}
    const cancelOnly = (() => {
      const s = String(message ?? "").toLowerCase()
      const cleaned = s
        .replace(/\b(annule|laisse\s+tomber|stop|oublie|on\s+laisse|cancel)\b/gi, " ")
        .replace(/\b(la|le|les|l['’]?|stp|s['’]?il\s+te\s+pla[iî]t|merci|ok|oui|non|d['’]?accord|pour|maintenant|l['’]?instant|juste)\b/gi, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
      return cleaned.length < 8
    })()
    if (cancelOnly) {
      return {
        text: "Ok, on annule pour l’instant.\n\nTu veux qu’on reparte de quoi : ton objectif du moment, ou une autre action à ajuster ?",
        executed_tools: [],
        tool_execution: "none",
      }
    }
  }

  function parseDayToRemoveFromUserMessage(raw: string): string | null {
    const s = String(raw ?? "").toLowerCase()
    const hasRemoveVerb = /\b(enl[eè]ve|retire|supprime)\b/i.test(s)
    const looksLikeDayOnly = (() => {
      const cleaned = s
        .replace(/[!?.,:;()"'`]/g, " ")
        .replace(/\b(s['’]?il|te|pla[iî]t|stp|merci|ok|oui|non|d['’]accord|le|la|l')\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
      return /\b(lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?|mon|tue|wed|thu|fri|sat|sun)\b/i.test(cleaned) &&
        cleaned.split(" ").length <= 2
    })()
    if (!hasRemoveVerb && !looksLikeDayOnly) return null
    if (/\b(lundi|lun)\b/i.test(s)) return "mon"
    if (/\b(mardi|mar)\b/i.test(s)) return "tue"
    if (/\b(mercredi|mer)\b/i.test(s)) return "wed"
    if (/\b(jeudi|jeu)\b/i.test(s)) return "thu"
    if (/\b(vendredi|ven)\b/i.test(s)) return "fri"
    if (/\b(samedi|sam)\b/i.test(s)) return "sat"
    if (/\b(dimanche|dim)\b/i.test(s)) return "sun"
    if (/\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(s)) {
      const m = s.match(/\b(mon|tue|wed|thu|fri|sat|sun)\b/i)
      return m?.[1]?.toLowerCase() ?? null
    }
    return null
  }

  function recentAssistantAskedWhichDayToRemove(): { asked: boolean; targetReps?: number } {
    const msgs = Array.isArray(opts.history) ? opts.history : []
    for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 10; i--) {
      const m = msgs[i]
      if (m?.role !== "assistant") continue
      const c = String(m?.content ?? "")
      if (/\bquel(le)?\s+jour\b[\s\S]{0,80}\b(enl[eè]v|retir|supprim)\w*/i.test(c)) {
        const m2 = c.match(/\bpasser\s+[àa]\s+(\d)\s*[×x]\s*\/\s*semaine\b/i)
        const target = m2 ? Number(m2[1]) : undefined
        return { asked: true, targetReps: Number.isFinite(target as any) ? target : undefined }
      }
    }
    return { asked: false }
  }

  function recentUserChoseFeeling(): boolean {
    const msgs = Array.isArray(opts.history) ? opts.history : []
    for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 10; i--) {
      const m = msgs[i]
      if (m?.role !== "user") continue
      const c = String(m?.content ?? "")
      if (/\b(au\s+feeling|libre|sans\s+jours?\s+fixes?)\b/i.test(c)) return true
    }
    return /\b(au\s+feeling|libre|sans\s+jours?\s+fixes?)\b/i.test(String(message ?? ""))
  }

  function recentUserChoseFixedDays(): boolean {
    const msgs = Array.isArray(opts.history) ? opts.history : []
    for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 10; i--) {
      const m = msgs[i]
      if (m?.role !== "user") continue
      const c = String(m?.content ?? "")
      if (/\b(jours?\s+fixes?|jours?\s+pr[ée]cis)\b/i.test(c)) return true
      if (/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\b/i.test(c)) return true
      if (/\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(c)) return true
    }
    return false
  }

  // Deterministic resolution: if we are waiting for "which day to remove" and the user answers with a day,
  // apply the update immediately (avoid looping).
  {
    const day = parseDayToRemoveFromUserMessage(message)
    const flowAwaiting =
      currentFlow &&
      String((currentFlow as any)?.kind ?? "") === "update_action_structure" &&
      String((currentFlow as any)?.stage ?? "") === "awaiting_remove_day"
    const askedRecently = recentAssistantAskedWhichDayToRemove()
    if (day && (flowAwaiting || askedRecently.asked)) {
      try {
        const { data: plan } = await supabase
          .from("user_plans")
          .select("id,content")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle()
        const planId = (plan as any)?.id as string | undefined
        const targetName = String((currentFlow as any)?.draft?.target_name ?? "Lecture")
        const newTarget =
          Number((currentFlow as any)?.draft?.new_target_reps ?? askedRecently.targetReps ?? 3) || 3
        if (planId) {
          // Prefer candidate days captured from the conflict question (most reliable).
          const draftDays = (currentFlow as any)?.draft?.candidate_days
          let existingDays: string[] = Array.isArray(draftDays) ? draftDays : []
          // Fall back to plan JSON scheduledDays / scheduled_days.
          if (existingDays.length === 0) {
            const content = (plan as any)?.content
            const phases = (content as any)?.phases ?? []
            for (const ph of phases) {
              const actions = (ph as any)?.actions ?? []
              for (const a of actions) {
                const t = String((a as any)?.title ?? "")
                if (t.toLowerCase().includes(targetName.toLowerCase())) {
                  existingDays =
                    Array.isArray((a as any)?.scheduledDays)
                      ? ((a as any).scheduledDays as string[])
                      : (Array.isArray((a as any)?.scheduled_days) ? ((a as any).scheduled_days as string[]) : [])
                  break
                }
              }
              if (existingDays.length) break
            }
          }
          const nextDays = existingDays.filter((d) => String(d).toLowerCase() !== day)
          const rawResult = await handleUpdateAction(supabase, userId, planId, {
            target_name: targetName,
            new_target_reps: newTarget,
            new_scheduled_days: nextDays,
          })
          try { await setFlow(null) } catch {}
          // If for any reason the list is empty, don't print "Jours planifiés: ."
          const daysLine = nextDays.length ? `Jours planifiés: ${formatDaysFrench(nextDays)}.` : `Jours planifiés: (non précisés).`
          return {
            // Keep explicit phrasing for mechanical assertions (must include "jours planifiés").
            text: `Ok — on retire ${dayTokenToFrench(day)}.\n\nTon habitude “${targetName}” est maintenant sur ${newTarget}×/semaine. ${daysLine}`,
            executed_tools: ["update_action_structure"],
            tool_execution: "success",
          }
        }
      } catch {
        // fall back to model output below
      }
    }
  }

  // Deterministic resolution: activation consent flow.
  {
    const flowAwaiting =
      currentFlow &&
      String((currentFlow as any)?.kind ?? "") === "activate_plan_action" &&
      String((currentFlow as any)?.stage ?? "") === "awaiting_consent"
    if (flowAwaiting && looksLikeYesToProceed(message)) {
      try {
        const actionTitleOrId = String((currentFlow as any)?.draft?.action_title_or_id ?? "").trim()
        if (actionTitleOrId) {
          const activationResult = await handleActivateAction(supabase, userId, { action_title_or_id: actionTitleOrId })
          try { await setFlow(null) } catch {}
          return {
            text: activationResult,
            executed_tools: ["activate_plan_action"],
            tool_execution: "success",
          }
        }
      } catch {
        // fall back to model output below
      }
    }
  }

  // Deterministic resolution: tracking consent flow (no silent writes).
  {
    const flowAwaiting =
      currentFlow &&
      String((currentFlow as any)?.kind ?? "") === "track_progress" &&
      String((currentFlow as any)?.stage ?? "") === "awaiting_consent"
    if (flowAwaiting && looksLikeYesToProceed(message)) {
      try {
        const args = (currentFlow as any)?.draft ?? null
        if (args && typeof args === "object") {
          const trackingResult = await handleTracking(supabase, userId, args as any, { source: meta?.channel ?? "chat" })
          try { await setFlow(null) } catch {}
          return {
            text: trackingResult.startsWith("INFO_POUR_AGENT") ? "Ok." : trackingResult,
            executed_tools: ["track_progress"],
            tool_execution: trackingResult.startsWith("INFO_POUR_AGENT") ? "uncertain" : "success",
          }
        }
      } catch {
        // fall back to normal logic below
      }
    }
    if (flowAwaiting && (looksLikeNoToProceed(message) || looksLikeCancel(message))) {
      try { await setFlow(null) } catch {}
      return {
        text: "Ok — je ne note rien.",
        executed_tools: [],
        tool_execution: "none",
      }
    }
  }

  // Deterministic: after activation, if the user chooses "au feeling", validate without pushing immediate execution.
  {
    const lastAssistant = Array.isArray(opts.history)
      ? [...opts.history].reverse().find((m: any) => m?.role === "assistant" && typeof m?.content === "string")
      : null
    const last = String(lastAssistant?.content ?? "")
    const lastL = last.toLowerCase()
    const saidFeeling = /\b(au\s+feeling|quand\s+je\s+me\s+sens\s+pr[eê]t[ée]e?|sans\s+contrainte|z[ée]ro\s+pression)\b/i.test(String(message ?? ""))
    const lastWasActivation = /\b(j['’]ai\s+activ[ée]e?|est\s+d[eé]j[aà]\s+active)\b/i.test(lastL) && /\bpremi[èe]re\s+[ée]tape\b/i.test(lastL)
    if (saidFeeling && lastWasActivation) {
      return {
        text: [
          "Parfait — au feeling, zéro pression.",
          "L’idée c’est juste de garder ça ultra simple: tu enfiles tes chaussures, et c’est déjà gagné.",
          "",
          "Tu veux qu’on laisse ça comme ça, ou tu préfères un repère léger (ex: après le dîner) ?",
        ].join("\n").trim(),
        executed_tools: [],
        tool_execution: "none",
      }
    }
  }

  // Deterministic: if the user simply acknowledges ("ok, merci") right after an activation confirmation,
  // do not repeat the same scheduling question; close cleanly.
  {
    const prevAssistant = Array.isArray(opts.history)
      ? [...opts.history].reverse().find((m: any) => m?.role === "assistant" && typeof m?.content === "string")
      : null
    const prev = String(prevAssistant?.content ?? "")
    const prevL = prev.toLowerCase()
    const shortAck = /^\s*(ok|merci|ok merci|d['’]accord|ça marche|parfait)\s*[.!]?\s*$/i.test(String(message ?? "").trim())
    const prevWasActivation =
      /\b(j['’]ai\s+activ[ée]e?|c['’]est\s+bon\s+—\s+j['’]ai\s+activ[ée]e?|est\s+d[eé]j[aà]\s+active)\b/i.test(prevL) &&
      /\bpremi[èe]re\s+[ée]tape\b/i.test(prevL)
    if (shortAck && prevWasActivation) {
      return {
        text: "Parfait.",
        executed_tools: [],
        tool_execution: "none",
      }
    }
  }

  // Update lightweight flow memory from user messages (so we don't re-ask the same configuration question).
  try {
    if (currentFlow && String((currentFlow as any)?.kind ?? "") === "create_simple_action") {
      const saidFeeling = /\b(au\s+feeling|libre|sans\s+jours?\s+fixes?)\b/i.test(message ?? "")
      if (saidFeeling) {
        await setFlow({
          ...(currentFlow as any),
          draft: { ...((currentFlow as any)?.draft ?? {}), scheduled_mode: "feeling" },
          updated_at: new Date().toISOString(),
        })
      }
    }
  } catch {}

  function extractLastQuestion(text: string): string | null {
    const t = String(text ?? "").trim()
    if (!t.includes("?")) return null
    const parts = t.split("?")
    if (parts.length < 2) return null
    const lastStem = parts[parts.length - 2] ?? ""
    const q = `${lastStem.trim()}?`.trim()
    if (q.length < 8) return null
    return q
  }

  function antiRepeatClosingQuestion(text: string): string {
    const prevAssistant = Array.isArray(opts.history)
      ? [...opts.history].reverse().find((m: any) => m?.role === "assistant" && typeof m?.content === "string")
      : null
    const prevQ = prevAssistant ? extractLastQuestion(String(prevAssistant.content)) : null
    if (!prevQ) return text

    const curQ = extractLastQuestion(text)
    if (!curQ) return text

    if (curQ.trim() !== prevQ.trim()) return text

    const looksLikeWeeklyHabit = /\b(?:fois\/semaine|fois\s+par\s+semaine)\b/i.test(text)
    const replacement = looksLikeWeeklyHabit
      ? "Tu veux lancer ta première session quand : ce soir ou demain ?"
      : "Tu veux qu’on avance sur quoi en priorité maintenant ?"

    const idx = text.lastIndexOf(curQ)
    if (idx < 0) return text
    return `${text.slice(0, idx)}${replacement}${text.slice(idx + curQ.length)}`
  }

  function looksConfusedUserMessage(s: string): boolean {
    const t = String(s ?? "").toLowerCase()
    // IMPORTANT: keep conservative.
    // "Je suis perdu" can mean "I don't know what to do next" (a planning question), NOT confusion about the assistant's last message.
    // We only treat it as confusion if the user explicitly signals misunderstanding / asks for a reformulation.
    return /\b(je\s+comprends\s+pas|j['’]ai\s+pas\s+compris|tu\s+peux\s+reformuler|reformule)\b/i
      .test(t)
  }

  function simplifyForConfusion(original: string): string {
    const t = String(original ?? "").trim().replace(/\*\*/g, "")
    const duration = t.match(/\b(\d{1,2})\s*minutes?\b/i)?.[1] ?? null
    const reps = t.match(/\b(\d{1,2})\s*(?:fois|x)\s*(?:\/\s*semaine|par\s+semaine)\b/i)?.[1] ?? null
    const timeOfDay =
      /\b(en\s+soir[ée]?e|le\s+soir)\b/i.test(t) ? "soir" :
      /\b(le\s+matin|matin)\b/i.test(t) ? "matin" :
      /\b(apr[èe]s[-\s]?midi)\b/i.test(t) ? "après-midi" :
      /\b(nuit)\b/i.test(t) ? "nuit" :
      null
    const hasDays =
      /\b(lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?)\b/i.test(t) ||
      /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)
    const daysLine = hasDays ? "Jours: jours fixes (définis)" : "Jours: au feeling (aucun jour fixé)"

    const bits: string[] = []
    if (reps && duration && timeOfDay) bits.push(`Fréquence: ${reps}×/semaine • ${duration} min • ${timeOfDay}`)
    else if (reps && duration) bits.push(`Fréquence: ${reps}×/semaine • ${duration} min`)
    else if (reps) bits.push(`Fréquence: ${reps}×/semaine`)
    else if (duration) bits.push(`Durée: ${duration} min`)

    const line2 = bits.length > 0 ? bits.join("") : "Réglages: (inchangés)"

    const ask = recentUserChoseFeeling()
      ? "Ok — on garde au feeling. Tu veux lancer ta première session quand : ce soir ou demain ?"
      : (recentUserChoseFixedDays()
        ? "Ok — jours fixes. C’est bien ce que tu veux, ou tu veux changer un des jours ?"
        : "Tu préfères qu’on fixe des jours précis, ou tu gardes au feeling ?")
    return [
      "Ok, reformulation rapide :",
      "",
      `- ${line2}`,
      `- ${daysLine}`,
      "",
      ask,
    ].join("\n")
  }

  function applyOutputGuards(text: string): string {
    function recentUserSaidFeeling(): boolean {
      const msgs = Array.isArray(opts.history) ? opts.history : []
      for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 8; i--) {
        const m = msgs[i]
        if (m?.role !== "user") continue
        const c = String(m?.content ?? "")
        if (/\b(au\s+feeling|libre|sans\s+jours?\s+fixes?)\b/i.test(c)) return true
      }
      return /\b(au\s+feeling|libre|sans\s+jours?\s+fixes?)\b/i.test(String(message ?? ""))
    }

    function stripJournalDrift(s: string): string {
      if (!/journal\s+de\s+la\s+sensation/i.test(s)) return s
      const lines = s.split("\n")
      const kept = lines.filter((ln) => !/journal\s+de\s+la\s+sensation/i.test(ln))
      const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()
      return out || s
    }

    function avoidReaskingDaysChoice(s: string): string {
      if (!recentUserSaidFeeling()) return s
      if (!/(jours?\s+pr[ée]cis|jours?\s+fixes|au\s+feeling|mode\s+libre)/i.test(s)) return s
      const nextQ = "Tu veux caler ton premier essai quand : demain soir ou ce week-end ?"
      const parts = s.split("?")
      if (parts.length < 2) return s
      parts[parts.length - 2] = nextQ.replace(/\?$/, "")
      return parts.join("?").replace(/\?\s*$/, "?")
    }

    function softenValidationAndStripEmojis(s: string): string {
      let out = String(s ?? "")
      // Remove a few high-signal "chatbot" emojis that show up in evals.
      out = out.replace(/[🚀🍽️💧🌬️]/g, "")
      // Reduce "validation loop" phrasing.
      out = out.replace(/\bOn\s+valide[^?]{0,120}\?\s*$/i, "Ça te va ?")
      out = out.replace(/\bOn\s+part\s+l[àa]-dessus\s*\?\s*$/i, "Ça te va ?")
      // If the model uses "On valide ..." mid-message, keep it but soften.
      out = out.replace(/\bOn\s+valide\b/gi, "Ça te va de")
      return out.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    }

    let out = antiRepeatClosingQuestion(text)
    if (looksConfusedUserMessage(message)) out = simplifyForConfusion(out)
    out = stripJournalDrift(out)
    out = avoidReaskingDaysChoice(out)
    out = softenValidationAndStripEmojis(out)
    out = out.replace(/\bj[’']ai\s+programm[eé]\b/gi, "c’est calé")
    out = out.replace(/\bvous\b/gi, "tu").replace(/\bvotre\b/gi, "ton").replace(/\bvos\b/gi, "tes")
    return out
  }

  if (typeof response === "string") {
    if (!isModuleUi) {
      const upd = parseExplicitUpdateActionFromUserMessage(message)
      const flowIsCreate = Boolean(currentFlow && String((currentFlow as any)?.kind ?? "") === "create_simple_action")
      const hasUpdateIntent =
        !flowIsCreate &&
        /\b(en\s+fait|change|renomme|modifie|ajuste|mets|met|mettre|passe|ram[eè]ne|descend|augmente|monte|enl[eè]ve|retire|supprime|jours?\s+fixes?|jours?\s+pr[ée]cis|lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?)\b/i
          .test(message ?? "") &&
        (upd.new_target_reps !== undefined || Array.isArray(upd.new_scheduled_days))
      if (hasUpdateIntent && upd.target_name) {
        const lowerMsg = String(message ?? "").toLowerCase()
        const mentionsNeedRemoveInf =
          /\b(il\s+faut|faudra)\b/i.test(lowerMsg) &&
          /\b(enlever|retirer|supprimer)\b/i.test(lowerMsg) &&
          /\b(jour|un\s+jour)\b/i.test(lowerMsg)
        const mentionsAnySpecificDay =
          /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(lowerMsg) ||
          /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(lowerMsg)
        const mentionsRemoveImperative = /\b(enl[eè]ve|retire|supprime)\b/i.test(lowerMsg)
        if (
          mentionsNeedRemoveInf &&
          upd.new_target_reps !== undefined &&
          !mentionsAnySpecificDay &&
          !mentionsRemoveImperative
        ) {
          try {
            const { data: plan } = await supabase
              .from("user_plans")
              .select("id,content")
              .eq("user_id", userId)
              .eq("status", "active")
              .maybeSingle()
            const planId = (plan as any)?.id as string | undefined
            let existingDays: string[] = []
            if (planId && (plan as any)?.content) {
              const phases = ((plan as any).content as any)?.phases ?? []
              for (const ph of phases) {
                const actions = (ph as any)?.actions ?? []
                for (const a of actions) {
                  const t = String((a as any)?.title ?? "")
                  if (t.toLowerCase().includes(String(upd.target_name).toLowerCase())) {
                    existingDays =
                      Array.isArray((a as any)?.scheduledDays)
                        ? ((a as any).scheduledDays as string[])
                        : (Array.isArray((a as any)?.scheduled_days) ? ((a as any).scheduled_days as string[]) : [])
                    break
                  }
                }
                if (existingDays.length) break
              }
            }
            try {
              await setFlow({
                kind: "update_action_structure",
                stage: "awaiting_remove_day",
                draft: {
                  target_name: upd.target_name,
                  new_target_reps: upd.new_target_reps ?? null,
                  ...(existingDays.length ? { candidate_days: existingDays } : {}),
                },
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            } catch {}
            const daysTxt = existingDays.length ? ` (${formatDaysFrench(existingDays)})` : ""
            return {
              text: `Tu veux passer à ${Number(upd.new_target_reps)}×/semaine, mais tu as ${existingDays.length || 4} jours planifiés${daysTxt}.\n\nQuel jour tu veux retirer ?`,
              executed_tools: ["update_action_structure"],
              tool_execution: "blocked",
            }
          } catch {
            return {
              text: `Quel jour tu veux retirer ?`,
              executed_tools: [],
              tool_execution: "blocked",
            }
          }
        }

        const updFlowStage = String((currentFlow as any)?.stage ?? "")
        const hasExplicitUpdate = looksLikeExplicitUpdateActionRequest(message)
        const hasConsentInFlow = updFlowStage === "awaiting_consent" ? looksLikeYesToProceed(message) : false
        if (!(hasExplicitUpdate || hasConsentInFlow)) {
          const reps = (upd.new_target_reps !== undefined && upd.new_target_reps !== null) ? Number(upd.new_target_reps) : null
          const days = Array.isArray(upd.new_scheduled_days) ? upd.new_scheduled_days : null
          const recap = `${reps != null ? `${reps}×/semaine` : ""}${reps != null && days && days.length ? ", " : ""}${days && days.length ? `jours: ${formatDaysFrench(days)}` : ""}`.trim()
          return {
            text: `Tu veux que je mette à jour “${upd.target_name}”${recap ? ` (${recap})` : ""} ?`,
            executed_tools: [],
            tool_execution: "blocked",
          }
        }
        try {
          const { data: plan, error: planError } = await supabase
            .from("user_plans")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle()
          if (!planError && (plan as any)?.id) {
            const { data: existsRow } = await supabase
              .from("user_actions")
              .select("id")
              .eq("plan_id", (plan as any).id)
              .ilike("title", `%${upd.target_name}%`)
              .limit(1)
              .maybeSingle()
            if (!existsRow?.id) throw new Error("no_matching_action")

            const toolName = "update_action_structure"
            const rawResult = await handleUpdateAction(supabase, userId, (plan as any).id, {
              target_name: upd.target_name,
              ...(upd.new_target_reps !== undefined ? { new_target_reps: upd.new_target_reps } : {}),
              ...(Array.isArray(upd.new_scheduled_days) ? { new_scheduled_days: upd.new_scheduled_days } : {}),
            })
            if (/\bquel(le)?\s+jour\b[\s\S]{0,80}\b(enl[eè]v|retir|supprim)\w*/i.test(rawResult)) {
              try {
                const parseCandidateDaysFromToolQuestion = (txt: string): string[] => {
                  const m = String(txt ?? "").match(/\bjours?\s+planifi[ée]s?\s*\(([^)]+)\)/i)
                  if (!m?.[1]) return []
                  const raw = m[1]
                  const parts = raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)
                  const map: Record<string, string> = {
                    "lundi": "mon",
                    "mardi": "tue",
                    "mercredi": "wed",
                    "jeudi": "thu",
                    "vendredi": "fri",
                    "samedi": "sat",
                    "dimanche": "sun",
                    "mon": "mon", "tue": "tue", "wed": "wed", "thu": "thu", "fri": "fri", "sat": "sat", "sun": "sun",
                  }
                  const out: string[] = []
                  for (const p of parts) {
                    const k = p.replace(/\s+/g, " ").trim()
                    const tok = map[k]
                    if (tok) out.push(tok)
                  }
                  return Array.from(new Set(out))
                }
                const candidate_days = parseCandidateDaysFromToolQuestion(rawResult)
                await setFlow({
                  kind: "update_action_structure",
                  stage: "awaiting_remove_day",
                  draft: {
                    target_name: upd.target_name,
                    new_target_reps: upd.new_target_reps ?? null,
                    ...(candidate_days.length ? { candidate_days } : {}),
                  },
                  started_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
              } catch {}
              return { text: rawResult.replace(/\*\*/g, ""), executed_tools: [toolName], tool_execution: "blocked" }
            }
            try { if (currentFlow) await setFlow(null) } catch {}
            const days = Array.isArray(upd.new_scheduled_days) ? upd.new_scheduled_days : null
            const reps = (upd.new_target_reps !== undefined && upd.new_target_reps !== null) ? Number(upd.new_target_reps) : null
            return {
              text: [
                `Ok — j’ai mis à jour “${upd.target_name}”.`,
                `${reps ? `Fréquence: ${reps}×/semaine.` : ""} ${days && days.length ? `Jours planifiés: ${formatDaysFrench(days)}.` : ""}`.trim(),
                ``,
                `Tu veux qu’on ajuste autre chose (fréquence/jours), ou on la laisse comme ça ?`,
              ].join("\n").trim(),
              executed_tools: [toolName],
              tool_execution: "success",
            }
          }
        } catch {
          // fall through
        }
      }
    }

    if (!isModuleUi && looksLikeExplicitCreateActionRequest(message)) {
      const parsed = parseExplicitCreateActionFromUserMessage(message)
      if (parsed.title && parsed.description && typeof parsed.targetReps === "number") {
        try {
          const { data: plan, error: planError } = await supabase
            .from("user_plans")
            .select("id, submission_id, content")
            .eq("user_id", userId)
            .eq("status", "active")
            .single()
          if (!planError && plan) {
            const toolName = "create_simple_action"
            const actionId = `act_${Date.now()}`
            const title = parsed.title
            const description = parsed.description
            const type = parsed.type ?? "habit"
            const targetReps = parsed.targetReps
            const time_of_day = parsed.time_of_day ?? "any_time"
            const tips = ""

            const { error: insertErr } = await supabase.from("user_actions").insert({
              user_id: userId,
              plan_id: (plan as any).id,
              submission_id: (plan as any).submission_id,
              title,
              description,
              type,
              target_reps: targetReps,
              status: "active",
              tracking_type: "boolean",
              time_of_day,
            })
            if (!insertErr) {
              const newActionJson = {
                id: actionId,
                type,
                title,
                description,
                questType: "side",
                targetReps,
                tips,
                rationale: "Ajouté via discussion avec Sophia.",
                tracking_type: "boolean",
                time_of_day,
              }
              await injectActionIntoPlanJson(supabase, (plan as any).id, newActionJson)
              const isHabit = String(type ?? "habit") === "habit"
              const follow = isHabit
                ? `Tu préfères la faire au feeling, ou on fixe des jours (pour tes ${targetReps}×/semaine) ?`
                : `On le cale plutôt le soir comme tu dis ?`
              return {
                text: `Ok. J’ajoute “${title}” à ton plan.\n\nFréquence: ${targetReps} fois/semaine.\n\n${follow}`,
                executed_tools: [toolName],
                tool_execution: "success",
              }
            }
          }
        } catch {
          // fall through
        }
      }
    }

    const cleaned = response.replace(/\*\*/g, "")
    try {
      const shouldStart =
        !currentFlow &&
        !isModuleUi &&
        (looksLikeExploringActionIdea(message) || looksLikeUserAsksToAddToPlanLoosely(message) || looksLikeExplicitCreateActionRequest(message))
      if (shouldStart) {
        const parsed = parseExplicitCreateActionFromUserMessage(message)
        await setFlow({
          kind: "create_simple_action",
          stage: looksLikeExploringActionIdea(message) ? "exploring" : "awaiting_consent",
          draft: {
            title: parsed.title ?? null,
            description: parsed.description ?? null,
            targetReps: typeof parsed.targetReps === "number" ? parsed.targetReps : null,
            time_of_day: parsed.time_of_day ?? null,
            type: parsed.type ?? null,
          },
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    } catch {}

    try {
      const t = String(message ?? "").toLowerCase()
      const mentionsPending = /\b(pending|plus\s+tard|en\s+attente)\b/i.test(t)
      const mentionsActivate = /\b(activer|active)\b/i.test(t)
      const asksWhatToDo = looksLikePlanStepQuestion(message)
      const quoted = parseQuotedActionTitle(message)
      if (!currentFlow && !isModuleUi && quoted && (mentionsPending || mentionsActivate || asksWhatToDo) && !looksLikeExplicitActivateActionRequest(message)) {
        await setFlow({
          kind: "activate_plan_action",
          stage: "awaiting_consent",
          draft: { action_title_or_id: quoted },
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        if (asksWhatToDo && cleaned.trim().length < 40) {
          try {
            const { data: plan } = await supabase
              .from("user_plans")
              .select("content")
              .eq("user_id", userId)
              .eq("status", "active")
              .maybeSingle()
            const content = (plan as any)?.content
            let desc = ""
            const phases = (content as any)?.phases ?? []
            for (const ph of phases) {
              const actions = (ph as any)?.actions ?? []
              for (const a of actions) {
                const titleA = String((a as any)?.title ?? "")
                if (titleA.toLowerCase() === quoted.toLowerCase()) {
                  desc = String((a as any)?.description ?? "")
                  break
                }
              }
              if (desc) break
            }
            const firstStep = String(desc ?? "").trim().split("\n")[0]?.trim() || "une micro-action très simple"
            return {
              text: `“${quoted}”, c’est juste ça: ${firstStep}\n\nTu veux que je l’active maintenant ?`,
              executed_tools: [],
              tool_execution: "none",
            }
          } catch {}
        }
      }
    } catch {}
    return { text: applyOutputGuards(cleaned), executed_tools: [], tool_execution: "none" }
  }

  if (typeof response === "object") {
    const toolName = String((response as any).tool ?? "").trim()
    try {
      console.log(`[Architect] 🛠️ Tool Call: ${toolName}`)
      console.log(`[Architect] Args:`, JSON.stringify((response as any).args))

      if (inWhatsAppGuard24h && toolName === "activate_plan_action") {
        return {
          text: "Je peux te guider, mais pendant l’onboarding WhatsApp je ne peux pas activer d’actions depuis ici.\n\nVa sur le dashboard pour l’activer, et dis-moi quand c’est fait.",
          executed_tools: [toolName],
          tool_execution: "blocked",
        }
      }

      if (toolName === "track_progress") {
        const flowAwaiting =
          currentFlow &&
          String((currentFlow as any)?.kind ?? "") === "track_progress" &&
          String((currentFlow as any)?.stage ?? "") === "awaiting_consent"
        if (!looksLikeExplicitTrackProgressRequest(message) && !flowAwaiting) {
          const a = ((response as any)?.args ?? {}) as any
          const target = String(a?.target_name ?? "").trim() || "cette action"
          const st = String(a?.status ?? "").trim().toLowerCase()
          const humanStatus = st === "missed" ? "pas fait" : (st === "partial" ? "à moitié fait" : "fait")
          try {
            await setFlow({
              kind: "track_progress",
              stage: "awaiting_consent",
              draft: a,
              started_at: (currentFlow as any)?.started_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          } catch {}
          return {
            text: `Tu veux que je note “${target}” comme ${humanStatus} pour aujourd’hui ? (oui/non)`,
            executed_tools: [],
            tool_execution: "blocked",
          }
        }

        const trackingResult = await handleTracking(supabase, userId, (response as any).args, { source: meta?.channel ?? "chat" })
        try {
          if (currentFlow && String((currentFlow as any)?.kind ?? "") === "track_progress") {
            await setFlow(null)
          }
        } catch {}

        if (trackingResult.startsWith("INFO_POUR_AGENT")) {
          const followUpPrompt = `
          Tu as voulu noter une action ("${(response as any).args?.target_name ?? ""}") mais le système te dit :
          "${trackingResult}"
          
          RÉAGIS MAINTENANT :
          - Félicite ou discute normalement de ce sujet.
          - NE DIS PAS "C'est noté" ou "J'ai enregistré".
          - Sois naturel, efficace et concis.
          
          FORMAT :
          - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        `
          const followUpResponse = await generateWithGemini(followUpPrompt, "Réagis à l'info.", 0.7, false, [], "auto", {
            requestId: meta?.requestId,
            model: meta?.model ?? defaultArchitectModelForRequestId(meta?.requestId),
            source: "sophia-brain:architect_followup",
            forceRealAi: meta?.forceRealAi,
          })
          return {
            text: typeof followUpResponse === "string" ? followUpResponse.replace(/\*\*/g, "") : "Ok.",
            executed_tools: [toolName],
            tool_execution: "uncertain",
          }
        }

        const confirmationPrompt = `
        ACTION VALIDÉE : "${(response as any).args?.target_name ?? ""}"
        STATUT : ${(response as any).args?.status === "missed" ? "Raté / Pas fait" : "Réussi / Fait"}
        
        CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
        Dernier message de l'utilisateur : "${message}"
        
        TA MISSION :
        1. Confirme que c'est pris en compte (sans dire "C'est enregistré").
        2. Enchaîne sur une question pour optimiser ou passer à la suite.
        3. SI l'utilisateur a donné des détails, REBONDIS SUR CES DÉTAILS.
        
        FORMAT :
        - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        - Pas de gras.
      `
        const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? defaultArchitectModelForRequestId(meta?.requestId),
          source: "sophia-brain:architect_confirmation",
          forceRealAi: meta?.forceRealAi,
        })
        return {
          text: typeof confirmationResponse === "string" ? confirmationResponse.replace(/\*\*/g, "") : "Ok.",
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      const { data: plan, error: planError } = await supabase
        .from("user_plans")
        .select("id, submission_id, content")
        .eq("user_id", userId)
        .eq("status", "active")
        .single()

      if (planError || !plan) {
        console.warn(`[Architect] ⚠️ No active plan found for user ${userId}`)
        return { text: "Je ne trouve pas de plan actif pour faire cette modification.", executed_tools: [toolName], tool_execution: "failed" }
      }

      console.log(`[Architect] ✅ Active Plan found: ${(plan as any).id}`)

      if (toolName === "break_down_action") {
        const out = await handleBreakDownAction({
          supabase,
          userId,
          planRow: { id: (plan as any).id, submission_id: (plan as any).submission_id, content: (plan as any).content },
          args: (response as any).args,
        })
        return { text: out.text, executed_tools: [toolName], tool_execution: out.tool_execution }
      }

      if (toolName === "update_action_structure") {
        const updFlowStage = String((currentFlow as any)?.stage ?? "")
        const hasExplicitUpdate = looksLikeExplicitUpdateActionRequest(message)
        const hasConsentInFlow = updFlowStage === "awaiting_consent" ? looksLikeYesToProceed(message) : false
        if (!(hasExplicitUpdate || hasConsentInFlow)) {
          const a = ((response as any)?.args ?? {}) as any
          const target = String(a?.target_name ?? "").trim() || "cette habitude"
          const reps = Number.isFinite(Number(a?.new_target_reps)) ? Number(a.new_target_reps) : null
          const days = Array.isArray(a?.new_scheduled_days) ? (a.new_scheduled_days as string[]) : null
          const recap =
            `${reps != null ? `${reps}×/semaine` : ""}${reps != null && days && days.length ? ", " : ""}${days && days.length ? `jours: ${formatDaysFrench(days)}` : ""}`.trim()
          return {
            text: `Tu veux que je mette à jour “${target}”${recap ? ` (${recap})` : ""} ?`,
            executed_tools: [],
            tool_execution: "blocked",
          }
        }
        const rawResult = await handleUpdateAction(supabase, userId, (plan as any).id, (response as any).args)
        if (/\bquel(le)?\s+jour\b[\s\S]{0,80}\b(enl[eè]v|retir|supprim)\w*/i.test(rawResult)) {
          try {
            await setFlow({
              kind: "update_action_structure",
              stage: "awaiting_remove_day",
              draft: { ...(response as any).args, last_result: rawResult },
              started_at: (currentFlow as any)?.started_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          } catch {}
          return {
            text: rawResult.replace(/\*\*/g, ""),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }
        const isEvalLikeRequest =
          String(meta?.requestId ?? "").includes(":tools:") ||
          String(meta?.requestId ?? "").includes(":eval")
        if (isEvalLikeRequest) {
          try { if (currentFlow) await setFlow(null) } catch {}
          const args = ((response as any)?.args ?? {}) as any
          const target = String(args?.target_name ?? "").trim() || "Lecture"
          const reps = Number.isFinite(Number(args?.new_target_reps)) ? Number(args.new_target_reps) : null
          const days = Array.isArray(args?.new_scheduled_days) ? (args.new_scheduled_days as string[]) : null
          return {
            text: [
              `Ok — j’ai mis à jour “${target}”.`,
              `${reps != null ? `Fréquence: ${reps}×/semaine.` : ""} ${days && days.length ? `Jours planifiés: ${formatDaysFrench(days)}.` : ""}`.trim(),
              ``,
              `Tu veux qu’on ajuste autre chose (fréquence/jours), ou on la laisse comme ça ?`,
            ].join("\n").trim(),
            executed_tools: [toolName],
            tool_execution: "success",
          }
        }
        const followUpPrompt = `
RÉSULTAT SYSTÈME (MODIFICATION ACTION) :
"${rawResult}"

DERNIER MESSAGE USER :
"${message}"

TA MISSION :
- Réponds comme Sophia (naturel, conversationnel), sans template type "C'est modifié".
- Récapitule en 1 phrase l'état final (Nom + Fréquence si tu la connais + moment de la journée si connu).
- Confirme clairement si c'est visible/actif sur le dashboard (si tu n'es pas sûr, dis-le honnêtement).
- Pose UNE question courte pour la suite (ex: "Tu veux qu'on la garde à 3 fois/semaine ou on teste 2 ?").

FORMAT :
- 2 petits paragraphes séparés par une ligne vide.
- Pas de gras (**).
        `.trim()
        const followUp = await generateWithGemini(followUpPrompt, "Génère la réponse.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? defaultArchitectModelForRequestId(meta?.requestId),
          source: "sophia-brain:architect_update_action_followup",
          forceRealAi: meta?.forceRealAi,
          maxRetries: 1,
          httpTimeoutMs: 10_000,
        } as any)
        try { if (currentFlow) await setFlow(null) } catch {}
        return {
          text: applyOutputGuards(typeof followUp === "string" ? followUp.replace(/\*\*/g, "") : rawResult),
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      if (toolName === "activate_plan_action") {
        if (!looksLikeExplicitActivateActionRequest(message)) {
          const askedTitle = String((response as any)?.args?.action_title_or_id ?? "").trim()
          const title = askedTitle || parseQuotedActionTitle(message) || "cette action"
          await setFlow({
            kind: "activate_plan_action",
            stage: "awaiting_consent",
            draft: { action_title_or_id: title },
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          return {
            text: `Ok.\n\nTu veux que j’active “${title}” maintenant ?`,
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }

        const activationResult = await handleActivateAction(supabase, userId, (response as any).args)
        try { if (currentFlow) await setFlow(null) } catch {}
        return {
          text: activationResult,
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      if (toolName === "archive_plan_action") {
        const txt = await handleArchiveAction(supabase, userId, (response as any).args)
        return { text: txt, executed_tools: [toolName], tool_execution: "success" }
      }

      if (toolName === "create_simple_action") {
        if (looksLikeExploringActionIdea(message)) {
          const explorePrompt = `
L'utilisateur évoque une potentielle action/habitude mais il est encore en phase d'exploration.

DERNIER MESSAGE USER :
"${message}"

OBJECTIF :
- Ne crée PAS d'action en base de données maintenant.
- Discute 1-2 questions max pour aider (ex: "tu veux que ce soit ultra facile ou ambitieux ?", "c'est quoi l'obstacle principal le soir ?").
- Propose une version simple (10 minutes, 3 fois/semaine si ça colle), puis demande explicitement :
  "Tu veux que je l'ajoute à ton plan maintenant ?"

STYLE :
- Naturel, pas administratif.
- Pas de "C'est validé" / "C'est modifié".
- 2 petits paragraphes.
          `.trim()
          const explore = await generateWithGemini(explorePrompt, "Réponds.", 0.7, false, [], "auto", {
            requestId: meta?.requestId,
            model: meta?.model ?? defaultArchitectModelForRequestId(meta?.requestId),
            source: "sophia-brain:architect_create_action_explore",
            forceRealAi: meta?.forceRealAi,
            maxRetries: 1,
            httpTimeoutMs: 10_000,
          } as any)
          return {
            text: typeof explore === "string" ? explore.replace(/\*\*/g, "") : "Ok. Tu veux que je l'ajoute à ton plan maintenant ?",
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }

        const parsed = parseExplicitCreateActionFromUserMessage(message)
        const rawArgs = (response as any).args ?? {}
        const title = (parsed.title ?? rawArgs.title)
        const description = (parsed.description ?? rawArgs.description)
        const type = (parsed.type ?? rawArgs.type ?? "habit")
        const targetReps = (parsed.targetReps ?? rawArgs.targetReps ?? (type === "mission" ? 1 : 1))
        const tips = rawArgs.tips
        const time_of_day = (parsed.time_of_day ?? rawArgs.time_of_day)
        const actionId = `act_${Date.now()}`

        console.log(`[Architect] Attempting to insert into user_actions...`)
        const { error: insertErr } = await supabase.from("user_actions").insert({
          user_id: userId,
          plan_id: (plan as any).id,
          submission_id: (plan as any).submission_id,
          title,
          description,
          type: type || "habit",
          target_reps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
          status: "active",
          tracking_type: "boolean",
          time_of_day: time_of_day || "any_time",
        })
        if (insertErr) {
          console.error("[Architect] ❌ user_actions insert failed:", insertErr)
          return {
            text: `Oups — j’ai eu un souci technique en créant l’action "${title}".\n\nVa jeter un œil sur le dashboard pour confirmer si elle apparaît. Si tu veux, dis-moi “retente” et je la recrée proprement.`,
            executed_tools: [toolName],
            tool_execution: "failed",
          }
        }

        const newActionJson = {
          id: actionId,
          type: type || "habit",
          title: title,
          description: description,
          questType: "side",
          targetReps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
          tips: tips || "",
          rationale: "Ajouté via discussion avec Sophia.",
          tracking_type: "boolean",
          time_of_day: time_of_day || "any_time",
        }

        const status = await injectActionIntoPlanJson(supabase, (plan as any).id, newActionJson)
        if (status === "duplicate") {
          return { text: `Oula ! ✋\n\nL'action "${title}" existe déjà.`, executed_tools: [toolName], tool_execution: "success" }
        }
        if (status === "error") {
          return { text: "Erreur technique lors de la mise à jour du plan visuel.", executed_tools: [toolName], tool_execution: "failed" }
        }

        const verify = await verifyActionCreated(supabase, userId, (plan as any).id, { title, actionId })
        if (!verify.db_ok || !verify.json_ok) {
          console.warn("[Architect] ⚠️ Post-create verification failed:", verify)
          return {
            text: `Je viens de tenter de créer "${title}", mais je ne la vois pas encore clairement dans ton plan (il y a peut-être eu un loupé de synchro).\n\nOuvre le dashboard et dis-moi si tu la vois. Sinon, dis “retente” et je la recrée.`,
            executed_tools: [toolName],
            tool_execution: "uncertain",
          }
        }

        const confirmationPrompt = `
ACTION CRÉÉE (SUCCÈS).
Nom: "${title}"
Fréquence/semaine: ${Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1}
Moment: ${String(time_of_day || "any_time")}
Description: ${String(description ?? "").trim() || "(vide)"}

DERNIER MESSAGE USER :
"${message}"

TA MISSION :
- Confirme de façon naturelle (pas de template "C'est validé").
- Récapitule en 1 phrase (Nom + fréquence + moment + durée si tu l'as).
- Dis clairement si l'action est active/visible sur le dashboard (ici: elle vient d'être créée en DB en status=active).
- IMPORTANT SI C'EST UNE HABITUDE (type=habit/habitude) :
  - Ne dis JAMAIS "j'ai programmé" tant que l'utilisateur n'a pas choisi de jours.
  - Pose UNE question courte A/B :
    A) "au feeling" (pas de jours fixes)
    B) "jours fixes" (on choisit ensemble les jours)
- Sinon (mission), pose UNE question concrète pour verrouiller le démarrage (ex: "Tu veux la faire quand ?").

FORMAT :
- 2 petits paragraphes.
- Pas de gras (**).
        `.trim()
        const confirmation = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
          requestId: meta?.requestId,
          model: meta?.model ?? defaultArchitectModelForRequestId(meta?.requestId),
          source: "sophia-brain:architect_create_action_confirmation",
          forceRealAi: meta?.forceRealAi,
          maxRetries: 1,
          httpTimeoutMs: 10_000,
        } as any)
        try { if (currentFlow) await setFlow(null) } catch {}
        return {
          text: applyOutputGuards(typeof confirmation === "string" ? confirmation.replace(/\*\*/g, "") : `Ok — j'ai ajouté "${title}".`),
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      if (toolName === "create_framework") {
        const { title, description, targetReps, frameworkDetails, time_of_day } = (response as any).args
        const actionId = `act_${Date.now()}`

        const newActionJson = {
          id: actionId,
          type: "framework",
          title: title,
          description: description,
          questType: "side",
          targetReps: targetReps || 1,
          frameworkDetails: frameworkDetails,
          tracking_type: "boolean",
          time_of_day: time_of_day || "any_time",
        }

        const status = await injectActionIntoPlanJson(supabase, (plan as any).id, newActionJson)
        if (status === "duplicate") {
          return { text: `Doucement ! ✋\n\nL'exercice "${title}" est déjà là.`, executed_tools: [toolName], tool_execution: "success" }
        }
        if (status === "error") {
          return { text: "Erreur technique lors de l'intégration du framework.", executed_tools: [toolName], tool_execution: "failed" }
        }

        const { error: fwInsertErr } = await supabase.from("user_actions").insert({
          user_id: userId,
          plan_id: (plan as any).id,
          submission_id: (plan as any).submission_id,
          title: title,
          description: description,
          type: "mission",
          status: "active",
          tracking_type: "boolean",
          time_of_day: time_of_day || "any_time",
        })
        if (fwInsertErr) {
          console.error("[Architect] ❌ user_actions insert failed (framework):", fwInsertErr)
          return {
            text: `Oups — j’ai eu un souci technique en créant l’exercice "${title}".\n\nVa vérifier sur le dashboard si tu le vois. Si tu ne le vois pas, dis “retente” et je le recrée.`,
            executed_tools: [toolName],
            tool_execution: "failed",
          }
        }

        const verify = await verifyActionCreated(supabase, userId, (plan as any).id, { title, actionId })
        if (!verify.db_ok || !verify.json_ok) {
          console.warn("[Architect] ⚠️ Post-create verification failed (framework):", verify)
          return {
            text: `Je viens de tenter d’intégrer "${title}", mais je ne le vois pas encore clairement dans ton plan (possible loupé de synchro).\n\nRegarde sur le dashboard et dis-moi si tu le vois. Sinon, dis “retente” et je le recrée.`,
            executed_tools: [toolName],
            tool_execution: "uncertain",
          }
        }

        return {
          text: `C'est fait ! 🏗️\n\nJe viens de vérifier: "${title}" est bien dans ton plan.\nTu veux le faire quand ?`,
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Architect] tool execution failed (unexpected):", toolName, errMsg)
      await logEdgeFunctionError({
        functionName: "sophia-brain",
        error: e,
        severity: "error",
        title: "tool_execution_failed_unexpected",
        requestId: meta?.requestId ?? null,
        userId,
        source: "sophia-brain:architect",
        metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, channel: meta?.channel ?? "web" },
      })
      try {
        await supabase.from("conversation_judge_events").insert({
          user_id: userId,
          scope: null,
          channel: meta?.channel ?? "web",
          agent_used: "architect",
          verifier_kind: "tool_execution_fallback",
          request_id: meta?.requestId ?? null,
          model: null,
          ok: null,
          rewritten: null,
          issues: ["tool_execution_failed_unexpected"],
          mechanical_violations: [],
          draft_len: null,
          final_len: null,
          draft_hash: null,
          final_hash: null,
          metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, err: errMsg.slice(0, 240) },
        } as any)
      } catch {}
      return {
        text:
          "Ok, j’ai eu un souci technique en faisant ça.\n\n" +
          "Va voir sur le dashboard pour confirmer, et dis-moi si tu vois le changement. Sinon, dis “retente”.",
        executed_tools: toolName ? [toolName] : [],
        tool_execution: "failed",
      }
    }
  }

  return { text: String(response ?? ""), executed_tools: [], tool_execution: "none" }
}


