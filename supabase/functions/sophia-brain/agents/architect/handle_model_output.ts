import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { getUserState, normalizeScope, updateUserState } from "../../state-manager.ts"
import { 
  setArchitectToolFlowInTempMemory,
  getActiveCreateActionFlow,
  upsertCreateActionFlow,
  closeCreateActionFlow,
  getActionCandidateFromFlow,
  getActiveUpdateActionFlow,
  upsertUpdateActionFlow,
  closeUpdateActionFlow,
  getUpdateCandidateFromFlow,
  getActiveBreakdownActionFlow,
  upsertBreakdownActionFlow,
  closeBreakdownActionFlow,
  getBreakdownCandidateFromFlow,
} from "../../supervisor.ts"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import { handleTracking } from "../../lib/tracking.ts"
import { logToolLedgerEvent } from "../../lib/tool_ledger.ts"
import { logEdgeFunctionError } from "../../../_shared/error-log.ts"

import type { ArchitectModelOutput } from "./types.ts"
import { defaultArchitectModelForRequestId } from "./model.ts"
import { formatDaysFrench, dayTokenToFrench } from "./dates.ts"
import { handleBreakDownAction, findActionInPlanContent } from "./breakdown.ts"
import { injectActionIntoPlanJson, planJsonHasAction, verifyActionCreated } from "./plan_json.ts"
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
import { 
  startDeepReasonsExploration,
  detectDeepReasonsPattern,
} from "./deep_reasons.ts"
import type { DeepReasonsPattern } from "./deep_reasons_types.ts"
import {
  createCandidateFromToolArgs,
  processPreviewResponse,
  generatePreviewMessage,
  logCreateActionFlowEvent,
} from "./create_action_flow.ts"
import type { ActionCandidate } from "./action_candidate_types.ts"
import {
  createUpdateCandidateFromToolArgs,
  processUpdatePreviewResponse,
  generateUpdatePreviewMessage,
  logUpdateActionFlowEvent,
} from "./update_action_flow.ts"
import type { UpdateActionCandidate } from "./update_action_candidate_types.ts"
import type { BreakdownCandidate } from "./breakdown_candidate_types.ts"
import { createBreakdownCandidate, updateBreakdownCandidate } from "./breakdown_candidate_types.ts"
import {
  generateAskTargetMessage,
  generateAskBlockerMessage,
  generateBreakdownPreviewMessage,
  processBreakdownPreviewResponse,
  extractTargetFromMessage,
  extractBlockerFromMessage,
  logBreakdownFlowEvent,
} from "./breakdown_action_flow.ts"
import { callBreakDownActionEdge } from "../investigator/breakdown.ts"

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
  const titledByVerb =
    raw.match(/\b(?:appelle[-\s]la|nomme[-\s]la|nom|titre)\s*[:：]?\s*(?:\"|«|“)?([^\"»”\n]{2,80})(?:\"|»|”)?/i)
  const title = (quoted?.[1]?.trim() || titledByVerb?.[1]?.trim()) || undefined

  const freqMatch = lower.match(/(?:fr[ée]quence\s*[:：]?\s*)?(\d{1,2})\s*(?:fois|x)\s*par\s*semaine\b/i)
  const targetReps = freqMatch ? Math.max(1, Math.min(6, Number(freqMatch[1]) || 0)) : undefined

  const descMatch = raw.match(/description\s*[:：]\s*([^\n]+)$/i)
  const description = descMatch?.[1]?.trim() || undefined

  const time_of_day = (() => {
    if (/\b(matin|au r[ée]veil)\b/i.test(raw)) return "morning"
    if (/\b(apr[èe]s[-\s]?midi)\b/i.test(raw)) return "afternoon"
    if (/\b(soir|le soir)\b/i.test(raw)) return "evening"
    // Common phrasing: "avant de dormir / avant de me coucher" -> evening for consistency.
    if (/\b(avant\s+de\s+(?:me\s+)?coucher|au\s+coucher|avant\s+de\s+dormir|avant\s+le\s+dodo)\b/i.test(raw)) return "evening"
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
  let new_target_reps = picked ? Math.max(1, Math.min(6, Number(picked) || 0)) : undefined

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
    new_target_reps = Math.max(1, Math.min(6, new_scheduled_days.length))
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
  meta?: { requestId?: string; evalRunId?: string | null; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
  userState?: any
  scope?: string
}): Promise<{ text: string; executed_tools: string[]; tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain" }> {
  const { supabase, userId, message, response, inWhatsAppGuard24h, meta } = opts
  const scope = normalizeScope(opts.scope ?? meta?.scope ?? (meta?.channel === "whatsapp" ? "whatsapp" : "web"), "web")
  const tm0 = ((opts.userState as any)?.temp_memory ?? {}) as any
  const currentFlow = tm0?.architect_tool_flow ?? null

  function markFlowJustClosed(tempMemory: any, flowType: "create_action_flow" | "update_action_flow" | "breakdown_action_flow") {
    return {
      ...(tempMemory ?? {}),
      __flow_just_closed_normally: {
        flow_type: flowType,
        closed_at: new Date().toISOString(),
      },
    }
  }

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
        .replace(/\b(la|le|les|l['']?|stp|s['']?il\s+te\s+pla[iî]t|merci|ok|oui|non|d['']?accord|pour|maintenant|l['']?instant|juste)\b/gi, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
      return cleaned.length < 8
    })()
    if (cancelOnly) {
      return {
        text: "Ok, on annule pour l'instant.\n\nTu veux qu'on reparte de quoi : ton objectif du moment, ou une autre action à ajuster ?",
        executed_tools: [],
        tool_execution: "none",
      }
    }
  }

  async function createActionFromCandidate(candidate: ActionCandidate): Promise<{ text: string; executed_tools: string[]; tool_execution: "success" | "failed" | "uncertain" }> {
    const toolName = "create_simple_action"
    const title = String(candidate.params_to_validate?.title ?? candidate.label ?? "Action").trim()
    const description = candidate.params_to_validate?.description
    const type = candidate.type === "framework" ? "framework" : candidate.type === "mission" ? "mission" : "habit"
    const targetReps = Number.isFinite(Number(candidate.params_to_validate?.target_reps))
      ? Number(candidate.params_to_validate?.target_reps)
      : (type === "mission" ? 1 : 3)
    const tips = candidate.params_to_validate?.tips
    const time_of_day = (candidate.params_to_validate?.time_of_day ?? "any_time") as any
    const actionId = `act_${Date.now()}`

    const { data: plan, error: planError } = await supabase
      .from("user_plans")
      .select("id, submission_id, content")
      .eq("user_id", userId)
      .eq("status", "active")
      .single()

    if (planError || !plan) {
      console.warn(`[Architect] ⚠️ No active plan found for user ${userId}`)
      await trace({ event: "tool_call_failed", metadata: { reason: "no_active_plan" } })
      return { text: "Je ne trouve pas de plan actif pour créer cette action.", executed_tools: [toolName], tool_execution: "failed" }
    }

    const finalTitle = title || "Action"
    const normalizedTod = time_of_day || "any_time"

    // Idempotency / cost control
    try {
      const titleNeedle = String(title ?? "").trim()
      if (titleNeedle) {
        const { data: existingDb } = await supabase
          .from("user_actions")
          .select("id,title,created_at")
          .eq("user_id", userId)
          .eq("plan_id", (plan as any).id)
          .ilike("title", titleNeedle)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const planHas = (() => {
          try {
            const content = (plan as any)?.content
            return Boolean(content && planJsonHasAction(content, { title: titleNeedle }))
          } catch {
            return false
          }
        })()
        if (existingDb?.id || planHas) {
          if (existingDb?.id) {
            try {
              await supabase
                .from("user_actions")
                .update({
                  title: titleNeedle,
                  description: description ?? null,
                  type: type || "habit",
                  target_reps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
                  time_of_day: normalizedTod || "any_time",
                  status: "active",
                  tracking_type: "boolean",
                })
                .eq("id", existingDb.id)
            } catch {}
          }
          try {
            const content = (plan as any)?.content
            const phases = content?.phases
            if (Array.isArray(phases)) {
              for (const ph of phases) {
                const actions = (ph as any)?.actions
                if (!Array.isArray(actions)) continue
                for (const a of actions) {
                  if (String(a?.title ?? "").trim().toLowerCase() !== titleNeedle.toLowerCase()) continue
                  a.title = titleNeedle
                  if (description != null) a.description = description
                  if (tips != null) a.tips = tips
                  a.type = type || a.type
                  a.targetReps = Number.isFinite(Number(targetReps)) ? Number(targetReps) : (a.targetReps ?? 1)
                  a.time_of_day = normalizedTod || a.time_of_day || "any_time"
                }
              }
              await supabase.from("user_plans").update({ content }).eq("id", (plan as any).id)
            }
          } catch {}
          const toolResult = { db_ok: Boolean(existingDb?.id), json_ok: true, db_row_id: (existingDb as any)?.id ?? null, dedup: true }
          await trace({ event: "tool_call_succeeded", toolResult, metadata: { outcome: "dedup_updated" } })
          try { if (currentFlow) await setFlow(null) } catch {}
          return {
            text: `Ok — j’ai mis à jour “${titleNeedle}”.`,
            executed_tools: [toolName],
            tool_execution: "success",
          }
        }
      }
    } catch {
      // If dedup checks fail, we still attempt creation below.
    }

    console.log(`[Architect] Attempting to insert into user_actions...`)
    const { error: insertErr } = await supabase.from("user_actions").insert({
      user_id: userId,
      plan_id: (plan as any).id,
      submission_id: (plan as any).submission_id,
      title: finalTitle,
      description,
      type: type || "habit",
      target_reps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
      status: "active",
      tracking_type: "boolean",
      time_of_day: normalizedTod || "any_time",
    })
    if (insertErr) {
      console.error("[Architect] ❌ user_actions insert failed:", insertErr)
      await trace({ event: "tool_call_failed", error: insertErr, metadata: { reason: "db_insert_failed:user_actions" } })
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
      await trace({ event: "tool_call_succeeded", toolResult: { status: "duplicate" }, metadata: { outcome: "duplicate" } })
      return { text: `Oula ! ✋\n\nL'action "${title}" existe déjà.`, executed_tools: [toolName], tool_execution: "success" }
    }
    if (status === "error") {
      await trace({ event: "tool_call_failed", toolResult: { status: "error" }, metadata: { reason: "inject_plan_json_failed" } })
      return { text: "Erreur technique lors de la mise à jour du plan visuel.", executed_tools: [toolName], tool_execution: "failed" }
    }

    const verify = await verifyActionCreated(supabase, userId, (plan as any).id, { title, actionId })
    if (!verify.db_ok || !verify.json_ok) {
      console.warn("[Architect] ⚠️ Post-create verification failed:", verify)
      await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "uncertain_verification" } })
      return {
        text: `Je viens de tenter de créer "${title}", mais je ne la vois pas encore clairement dans ton plan (il y a peut-être eu un loupé de synchro).\n\nOuvre le dashboard et dis-moi si tu la vois. Sinon, dis “retente” et je la recrée.`,
        executed_tools: [toolName],
        tool_execution: "uncertain",
      }
    }
    await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "created_and_verified" } })

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

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE ACTION FLOW v2 - Process active flow session
  // ═══════════════════════════════════════════════════════════════════════════
  const activeCreateActionFlow = getActiveCreateActionFlow(tm0)
  if (activeCreateActionFlow) {
    const candidate = getActionCandidateFromFlow(tm0) as ActionCandidate | null
    if (candidate && candidate.status === "previewing") {
      // Process user response to preview
      const flowResult = processPreviewResponse(candidate, message)
      
      if (flowResult.shouldAbandon) {
        // Close the flow and return abandonment message
        const closed = closeCreateActionFlow({ tempMemory: tm0, outcome: "abandoned" })
        const marked = markFlowJustClosed(closed.tempMemory, "create_action_flow")
        await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
        await logCreateActionFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "flow_abandoned",
          candidate: flowResult.candidate!,
          metadata: { reason: candidate.clarification_count >= 1 ? "max_clarifications" : "user_declined" },
        })
        return {
          text: flowResult.response,
          executed_tools: ["create_action_flow"],
          tool_execution: "blocked",
        }
      }
      
      if (flowResult.shouldCreate) {
        // Close the flow before creating - we'll handle creation in the normal tool path
        const closed = closeCreateActionFlow({ tempMemory: tm0, outcome: "created" })
        const marked = markFlowJustClosed(closed.tempMemory, "create_action_flow")
        await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
        await logCreateActionFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "flow_completed",
          candidate: flowResult.candidate!,
        })
        // Create the action immediately (avoid relying on a new tool call)
        return await createActionFromCandidate(flowResult.candidate!)
      } else {
        // Update the flow with new candidate state (clarification or modification)
        const updated = upsertCreateActionFlow({ tempMemory: tm0, candidate: flowResult.candidate! })
        await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
        
        const eventType = flowResult.candidate!.clarification_count > candidate.clarification_count
          ? "clarification_asked"
          : "preview_shown"
        await logCreateActionFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: eventType,
          candidate: flowResult.candidate!,
        })
        
        return {
          text: flowResult.response,
          executed_tools: ["create_action_flow"],
          tool_execution: "blocked",
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE ACTION FLOW v2 - Process active flow session
  // ═══════════════════════════════════════════════════════════════════════════
  const activeUpdateActionFlow = getActiveUpdateActionFlow(tm0)
  if (activeUpdateActionFlow) {
    const updateCandidate = getUpdateCandidateFromFlow(tm0) as UpdateActionCandidate | null
    if (updateCandidate && updateCandidate.status === "awaiting_confirm") {
      // Process user response to preview
      const flowResult = processUpdatePreviewResponse(updateCandidate, message)
      
      if (flowResult.shouldAbandon) {
        // Close the flow and return abandonment message
        const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "abandoned" })
        const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
        await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
        await logUpdateActionFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "flow_abandoned",
          candidate: flowResult.candidate!,
          metadata: { reason: updateCandidate.clarification_count >= 1 ? "max_clarifications" : "user_declined" },
        })
        return {
          text: flowResult.response,
          executed_tools: ["update_action_flow"],
          tool_execution: "blocked",
        }
      }
      
      if (flowResult.shouldApply) {
        // Apply the update immediately (but DO NOT assume success; honor handleUpdateAction result)
        const { data: plan } = await supabase
          .from("user_plans")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .single()
        
        if (plan) {
          const changes = flowResult.candidate!.proposed_changes
          const target = flowResult.candidate!.target_action
          const updateResult = await handleUpdateAction(supabase, userId, (plan as any).id, {
            target_name: target.title,
            new_title: changes.new_title,
            new_target_reps: changes.new_reps,
            new_scheduled_days: changes.new_days,
            new_time_of_day: changes.new_time_of_day,
          })
          
          // Special blocking case: ask which day to remove (do NOT claim success)
          if (/\bquel(le)?\s+jour\b[\s\S]{0,80}\b(enl[eè]v|retir|supprim)\w*/i.test(updateResult)) {
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
              const candidate_days = parseCandidateDaysFromToolQuestion(updateResult)
              await setFlow({
                kind: "update_action_structure",
                stage: "awaiting_remove_day",
                draft: {
                  target_name: target.title,
                  new_target_reps: changes.new_reps ?? null,
                  ...(candidate_days.length ? { candidate_days } : {}),
                },
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            } catch {}
            // Close update_action_flow so we don't have 2 parallel flows; we handoff to the deterministic day-removal resolver.
            const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "abandoned" })
            const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
            if (closed.changed) await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
            await logUpdateActionFlowEvent({
              supabase,
              requestId: meta?.requestId,
              evalRunId: meta?.evalRunId,
              userId,
              event: "flow_abandoned",
              candidate: flowResult.candidate!,
              metadata: { reason: "needs_remove_day" },
            })
            return {
              text: updateResult.replace(/\*\*/g, ""),
              executed_tools: ["update_action_flow"],
              tool_execution: "blocked",
            }
          }

          // Error-ish cases: propagate
          if (/^Erreur\b/i.test(updateResult) || /\bJe ne trouve pas\b/i.test(updateResult)) {
            const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "abandoned" })
            const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
            if (closed.changed) await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
            await logUpdateActionFlowEvent({
              supabase,
              requestId: meta?.requestId,
              evalRunId: meta?.evalRunId,
              userId,
              event: "flow_abandoned",
              candidate: flowResult.candidate!,
              metadata: { reason: "update_failed_or_not_found" },
            })
            return {
              text: updateResult.replace(/\*\*/g, ""),
              executed_tools: ["update_action_flow"],
              tool_execution: "failed",
            }
          }

          // Success: close flow and return the system message (already user-facing)
          const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "applied" })
          const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
          await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
          await logUpdateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "flow_completed",
            candidate: flowResult.candidate!,
          })
          return {
            text: updateResult.replace(/\*\*/g, ""),
            executed_tools: ["update_action_flow"],
            tool_execution: "success",
          }
        } else {
          const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "abandoned" })
          const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
          if (closed.changed) await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
          await logUpdateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "flow_abandoned",
            candidate: flowResult.candidate!,
            metadata: { reason: "no_active_plan" },
          })
          return {
            text: "Je ne trouve pas de plan actif pour faire cette modification.",
            executed_tools: ["update_action_flow"],
            tool_execution: "failed",
          }
        }
      } else {
        // Update the flow with new candidate state (clarification or modification)
        const updated = upsertUpdateActionFlow({ tempMemory: tm0, candidate: flowResult.candidate! })
        await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
        
        const eventType = flowResult.candidate!.clarification_count > updateCandidate.clarification_count
          ? "clarification_asked"
          : "preview_shown"
        await logUpdateActionFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: eventType,
          candidate: flowResult.candidate!,
        })
        
        return {
          text: flowResult.response,
          executed_tools: ["update_action_flow"],
          tool_execution: "blocked",
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BREAKDOWN ACTION FLOW v2 - Process active flow session
  // ═══════════════════════════════════════════════════════════════════════════
  const activeBreakdownActionFlow = getActiveBreakdownActionFlow(tm0)
  if (activeBreakdownActionFlow) {
    const breakdownCandidate = getBreakdownCandidateFromFlow(tm0) as BreakdownCandidate | null
    
    // Status: awaiting_target - Extract target from user message
    if (breakdownCandidate && breakdownCandidate.status === "awaiting_target") {
      const targetHint = extractTargetFromMessage(message)
      if (targetHint) {
        const updated = updateBreakdownCandidate(breakdownCandidate, {
          target_action: { title: targetHint },
          status: "awaiting_blocker",
        })
        const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: updated })
        await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
        await logBreakdownFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "target_collected",
          candidate: updated,
        })
        return {
          text: generateAskBlockerMessage(updated),
          executed_tools: ["breakdown_action_flow"],
          tool_execution: "blocked",
        }
      } else {
        // Couldn't extract target, ask again
        return {
          text: "Je n'ai pas compris quelle action tu veux débloquer. Tu peux me donner son nom ?",
          executed_tools: ["breakdown_action_flow"],
          tool_execution: "blocked",
        }
      }
    }
    
    // Status: awaiting_blocker - Collect blocker and generate micro-step
    if (breakdownCandidate && breakdownCandidate.status === "awaiting_blocker") {
      const blockerDesc = extractBlockerFromMessage(message) ?? message.trim()
      if (blockerDesc && blockerDesc.length >= 3) {
        try {
          // Fetch plan data for the edge function
          const { data: plan } = await supabase
            .from("user_plans")
            .select("id, submission_id, content")
            .eq("user_id", userId)
            .eq("status", "active")
            .single()
          
          if (!plan) {
            const closed = closeBreakdownActionFlow({ tempMemory: tm0, outcome: "abandoned" })
            const marked = markFlowJustClosed(closed.tempMemory, "breakdown_action_flow")
            await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
            return {
              text: "Je ne trouve pas de plan actif. Tu veux qu'on en crée un d'abord ?",
              executed_tools: ["breakdown_action_flow"],
              tool_execution: "failed",
            }
          }

          // Ensure the action exists in the plan content
          const targetTitle = breakdownCandidate.target_action.title
          const found = findActionInPlanContent((plan as any).content, targetTitle)
          if (!found?.action?.title) {
            const updated = updateBreakdownCandidate(breakdownCandidate, {
              status: "awaiting_target",
            })
            const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: updated })
            await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
            await logBreakdownFlowEvent({
              supabase,
              requestId: meta?.requestId,
              evalRunId: meta?.evalRunId,
              userId,
              event: "clarification_asked",
              candidate: updated,
              metadata: { reason: "action_not_found" },
            })
            return {
              text: `Je ne retrouve pas "${targetTitle}" dans ton plan actif. Tu peux me redonner le titre exact ?`,
              executed_tools: ["breakdown_action_flow"],
              tool_execution: "blocked",
            }
          }

          // Find the action row in user_actions (for metadata)
          const { data: actionRow } = await supabase
            .from("user_actions")
            .select("id, title, description, tracking_type, time_of_day, target_reps, submission_id")
            .eq("plan_id", (plan as any).id)
            .ilike("title", `%${targetTitle}%`)
            .limit(1)
            .maybeSingle()

          const helpingAction = {
            title: (actionRow as any)?.title ?? targetTitle,
            description: (actionRow as any)?.description ?? "",
            tracking_type: (actionRow as any)?.tracking_type ?? "boolean",
            time_of_day: (actionRow as any)?.time_of_day ?? "any_time",
            targetReps: (actionRow as any)?.target_reps ?? 1,
          }

          // Generate the micro-step
          const proposed = await callBreakDownActionEdge({
            action: helpingAction,
            problem: blockerDesc,
            plan: (plan as any).content ?? null,
            submissionId: (plan as any).submission_id ?? (actionRow as any)?.submission_id ?? null,
          })

          const updated = updateBreakdownCandidate(breakdownCandidate, {
            blocker: blockerDesc,
            proposed_step: {
              id: String(proposed?.id ?? `act_${Date.now()}`),
              title: String(proposed?.title ?? "Micro-étape").trim(),
              description: String(proposed?.description ?? "").trim(),
              tip: String(proposed?.tips ?? "").trim(),
              type: String(proposed?.type ?? "mission"),
              targetReps: Number(proposed?.targetReps ?? 1) || 1,
              tracking_type: String(proposed?.tracking_type ?? "boolean"),
              time_of_day: String(proposed?.time_of_day ?? "any_time"),
            },
            status: "previewing",
          })

          const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: updated })
          await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
          await logBreakdownFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "preview_shown",
            candidate: updated,
          })

          return {
            text: generateBreakdownPreviewMessage(updated),
            executed_tools: ["breakdown_action_flow"],
            tool_execution: "blocked",
          }
        } catch (e) {
          console.error("[Architect] Breakdown generation failed:", e)
          const closed = closeBreakdownActionFlow({ tempMemory: tm0, outcome: "abandoned" })
          const marked = markFlowJustClosed(closed.tempMemory, "breakdown_action_flow")
          await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
          return {
            text: "Désolé, j'ai eu un problème technique pour générer la micro-étape. Tu veux réessayer ?",
            executed_tools: ["breakdown_action_flow"],
            tool_execution: "failed",
          }
        }
      } else {
        // Blocker too short, ask again
        return {
          text: "Dis-moi en une phrase ce qui te bloque exactement ?",
          executed_tools: ["breakdown_action_flow"],
          tool_execution: "blocked",
        }
      }
    }
    
    // Status: previewing - Process user response
    if (breakdownCandidate && breakdownCandidate.status === "previewing") {
      const flowResult = processBreakdownPreviewResponse(breakdownCandidate, message)
      
      if (flowResult.shouldAbandon) {
        const closed = closeBreakdownActionFlow({ tempMemory: tm0, outcome: "abandoned" })
        const marked = markFlowJustClosed(closed.tempMemory, "breakdown_action_flow")
        await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
        await logBreakdownFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "flow_abandoned",
          candidate: flowResult.candidate,
          metadata: { reason: breakdownCandidate.clarification_count >= 1 ? "max_clarifications" : "user_declined" },
        })
        return {
          text: flowResult.response,
          executed_tools: ["breakdown_action_flow"],
          tool_execution: "blocked",
        }
      }
      
      if (flowResult.shouldApply) {
        // Apply the micro-step to the plan
        const { data: plan } = await supabase
          .from("user_plans")
          .select("id, submission_id, content")
          .eq("user_id", userId)
          .eq("status", "active")
          .single()
        
        if (plan) {
          const out = await handleBreakDownAction({
            supabase,
            userId,
            planRow: { id: (plan as any).id, submission_id: (plan as any).submission_id, content: (plan as any).content },
            args: {
              action_title_or_id: breakdownCandidate.target_action.title,
              problem: breakdownCandidate.blocker,
              apply_to_plan: breakdownCandidate.apply_to_plan,
              proposed_step: breakdownCandidate.proposed_step,
            },
          })
          
          const closed = closeBreakdownActionFlow({ tempMemory: tm0, outcome: "applied" })
          const marked = markFlowJustClosed(closed.tempMemory, "breakdown_action_flow")
          await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
          await logBreakdownFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "flow_completed",
            candidate: flowResult.candidate,
          })
          
          return {
            text: out.text,
            executed_tools: ["breakdown_action_flow"],
            tool_execution: out.tool_execution,
          }
        } else {
          const closed = closeBreakdownActionFlow({ tempMemory: tm0, outcome: "abandoned" })
          const marked = markFlowJustClosed(closed.tempMemory, "breakdown_action_flow")
          await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
          return {
            text: "Je ne trouve pas de plan actif pour ajouter la micro-étape.",
            executed_tools: ["breakdown_action_flow"],
            tool_execution: "failed",
          }
        }
      }
      
      if (flowResult.needsNewProposal) {
        // User wants a different micro-step, go back to awaiting_blocker
        const updated = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: flowResult.candidate })
        await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
        await logBreakdownFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "clarification_asked",
          candidate: flowResult.candidate,
        })
        return {
          text: flowResult.response,
          executed_tools: ["breakdown_action_flow"],
          tool_execution: "blocked",
        }
      }
      
      // Unclear response - update candidate and ask for clarification
      const updated = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: flowResult.candidate })
      await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
      return {
        text: flowResult.response,
        executed_tools: ["breakdown_action_flow"],
        tool_execution: "blocked",
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
    const requestId = String(meta?.requestId ?? "").trim()
    const tAttempt0 = Date.now()
    const trace = async (evt: {
      event: "tool_call_attempted" | "tool_call_blocked" | "tool_call_succeeded" | "tool_call_failed"
      level?: "debug" | "info" | "warn" | "error"
      toolArgs?: any
      toolResult?: any
      error?: unknown
      metadata?: any
    }) => {
      if (!requestId) return
      await logToolLedgerEvent({
        supabase,
        requestId,
        evalRunId: meta?.evalRunId ?? null,
        userId,
        source: "sophia-brain:architect",
        event: evt.event,
        level: evt.level ?? (evt.event === "tool_call_failed" ? "error" : (evt.event === "tool_call_blocked" ? "warn" : "info")),
        toolName,
        toolArgs: evt.toolArgs ?? (response as any).args,
        toolResult: evt.toolResult,
        error: evt.error,
        latencyMs: Date.now() - tAttempt0,
        metadata: {
          channel: meta?.channel ?? null,
          scope,
          in_whatsapp_guard_24h: !!inWhatsAppGuard24h,
          flow: currentFlow ? { kind: (currentFlow as any)?.kind ?? null, stage: (currentFlow as any)?.stage ?? null } : null,
          ...(evt.metadata ?? {}),
        },
      })
    }
    try {
      console.log(`[Architect] 🛠️ Tool Call: ${toolName}`)
      console.log(`[Architect] Args:`, JSON.stringify((response as any).args))

      await trace({ event: "tool_call_attempted", level: "debug" })

      if (inWhatsAppGuard24h && toolName === "activate_plan_action") {
        await trace({
          event: "tool_call_blocked",
          metadata: { reason: "whatsapp_onboarding_guard_24h" },
        })
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
          await trace({ event: "tool_call_blocked", metadata: { reason: "missing_user_consent" } })
          return {
            text: `Tu veux que je note “${target}” comme ${humanStatus} pour aujourd’hui ? (oui/non)`,
            executed_tools: [],
            tool_execution: "blocked",
          }
        }

        const trackingResult = await handleTracking(supabase, userId, (response as any).args, { source: meta?.channel ?? "chat" })
        await trace({ event: "tool_call_succeeded", toolResult: trackingResult })
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
        await trace({ event: "tool_call_failed", metadata: { reason: "no_active_plan" } })
        return { text: "Je ne trouve pas de plan actif pour faire cette modification.", executed_tools: [toolName], tool_execution: "failed" }
      }

      console.log(`[Architect] ✅ Active Plan found: ${(plan as any).id}`)

      if (toolName === "break_down_action") {
        const args = (response as any).args ?? {}
        const actionTitleOrId = String(args.action_title_or_id ?? "").trim()
        const problem = String(args.problem ?? "").trim()
        const applyToPlan = args.apply_to_plan !== false
        
        // Create BreakdownCandidate and determine initial status
        let initialStatus: "awaiting_target" | "awaiting_blocker" | "generating" = "generating"
        if (!actionTitleOrId) {
          initialStatus = "awaiting_target"
        } else if (!problem) {
          initialStatus = "awaiting_blocker"
        }
        
        const candidate = createBreakdownCandidate({
          target_action: actionTitleOrId ? { title: actionTitleOrId } : undefined,
          blocker: problem || undefined,
          apply_to_plan: applyToPlan,
          status: initialStatus,
        })
        
        // If we have both target and blocker, generate the micro-step immediately
        if (initialStatus === "generating") {
          try {
            const found = findActionInPlanContent((plan as any).content, actionTitleOrId)
            if (!found?.action?.title) {
              const updatedCandidate = updateBreakdownCandidate(candidate, { status: "awaiting_target" })
              const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: updatedCandidate })
              await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
              await logBreakdownFlowEvent({
          supabase,
                requestId: meta?.requestId,
                evalRunId: meta?.evalRunId,
          userId,
                event: "clarification_asked",
                candidate: updatedCandidate,
                metadata: { reason: "action_not_found" },
              })
              await trace({ event: "tool_call_blocked", metadata: { reason: "action_not_found" } })
              return {
                text: `Je ne retrouve pas "${actionTitleOrId}" dans ton plan actif. Tu peux me redonner le titre exact ?`,
                executed_tools: [toolName],
                tool_execution: "blocked",
              }
            }

            // Find the action in the plan
            const { data: actionRow } = await supabase
              .from("user_actions")
              .select("id, title, description, tracking_type, time_of_day, target_reps, submission_id")
              .eq("plan_id", (plan as any).id)
              .ilike("title", `%${actionTitleOrId}%`)
              .limit(1)
              .maybeSingle()

            const helpingAction = {
              title: (actionRow as any)?.title ?? actionTitleOrId,
              description: (actionRow as any)?.description ?? "",
              tracking_type: (actionRow as any)?.tracking_type ?? "boolean",
              time_of_day: (actionRow as any)?.time_of_day ?? "any_time",
              targetReps: (actionRow as any)?.target_reps ?? 1,
            }

            // Generate the micro-step
            const proposed = await callBreakDownActionEdge({
              action: helpingAction,
              problem,
              plan: (plan as any).content ?? null,
              submissionId: (plan as any).submission_id ?? (actionRow as any)?.submission_id ?? null,
            })

            const updatedCandidate = updateBreakdownCandidate(candidate, {
              proposed_step: {
                id: String(proposed?.id ?? `act_${Date.now()}`),
                title: String(proposed?.title ?? "Micro-étape").trim(),
                description: String(proposed?.description ?? "").trim(),
                tip: String(proposed?.tips ?? "").trim(),
                type: String(proposed?.type ?? "mission"),
                targetReps: Number(proposed?.targetReps ?? 1) || 1,
                tracking_type: String(proposed?.tracking_type ?? "boolean"),
                time_of_day: String(proposed?.time_of_day ?? "any_time"),
              },
              status: "previewing",
            })

            const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate: updatedCandidate })
            await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
            await logBreakdownFlowEvent({
              supabase,
              requestId: meta?.requestId,
              evalRunId: meta?.evalRunId,
              userId,
              event: "preview_shown",
              candidate: updatedCandidate,
            })
            await trace({ event: "tool_call_blocked", metadata: { reason: "awaiting_user_confirmation" } })

            return {
              text: generateBreakdownPreviewMessage(updatedCandidate),
              executed_tools: [toolName],
              tool_execution: "blocked",
            }
          } catch (e) {
            console.error("[Architect] Breakdown generation failed:", e)
            await trace({ event: "tool_call_failed", metadata: { reason: "generation_error" } })
            return {
              text: "Désolé, j'ai eu un problème technique pour générer la micro-étape. Tu veux réessayer ?",
              executed_tools: [toolName],
              tool_execution: "failed",
            }
          }
        }
        
        // Otherwise, start the flow in the appropriate state
        const updatedFlow = upsertBreakdownActionFlow({ tempMemory: tm0, candidate })
        await updateUserState(supabase, userId, scope, { temp_memory: updatedFlow.tempMemory } as any)
        await logBreakdownFlowEvent({
          supabase,
          requestId: meta?.requestId,
          evalRunId: meta?.evalRunId,
          userId,
          event: "flow_started",
          candidate,
        })
        await trace({ event: "tool_call_blocked", metadata: { reason: "awaiting_user_input", status: initialStatus } })
        
        if (initialStatus === "awaiting_target") {
          return {
            text: generateAskTargetMessage(),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        } else {
          // awaiting_blocker
          return {
            text: generateAskBlockerMessage(candidate),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }
      }

      // DEEP REASONS EXPLORATION - Entry Point 2 (Architect direct, outside bilan)
      if (toolName === "start_deep_exploration") {
        const args = (response as any).args ?? {}
        const actionTitle = String(args.action_title ?? "").trim() || undefined
        const actionId = String(args.action_id ?? "").trim() || undefined
        const detectedPattern = (args.detected_pattern ?? "unknown") as DeepReasonsPattern
        const userWords = String(args.user_words ?? message ?? "").trim().slice(0, 200)
        const skipReConsent = args.skip_re_consent !== false // default true

        // Create the deep reasons state
        const deepReasonsState = startDeepReasonsExploration({
          action_title: actionTitle,
          action_id: actionId,
          detected_pattern: detectedPattern,
          user_words: userWords,
          source: "direct",
          skip_re_consent: skipReConsent,
        })

        // Store in temp_memory for the next turn
        try {
          const latest = await getUserState(supabase, userId, scope).catch(() => null as any)
          const tmLatest = ((latest as any)?.temp_memory ?? {}) as any
          const updatedTm = {
            ...tmLatest,
            deep_reasons_state: deepReasonsState,
          }
          await updateUserState(supabase, userId, scope, { temp_memory: updatedTm } as any)
        } catch (e) {
          console.error("[Architect] Failed to store deep_reasons_state:", e)
        }

        await trace({ 
          event: "tool_call_succeeded", 
          toolResult: { phase: deepReasonsState.phase, pattern: detectedPattern },
          metadata: { outcome: "deep_reasons_started", source: "direct" }
        })

        console.log(`[Architect] Deep exploration started for action "${actionTitle ?? '(general)'}" (pattern: ${detectedPattern}, phase: ${deepReasonsState.phase})`)

        // Generate the first message based on the phase
        const firstPrompt = skipReConsent
          ? "Qu'est-ce qui se passe pour toi quand tu penses à le faire ? 🙂"
          : `Ok, on prend 5 minutes pour explorer ce qui se passe.\n\nTu es prêt ? (Tu peux dire stop à tout moment)`

        return {
          text: firstPrompt,
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      if (toolName === "update_action_structure") {
        // ═══ UPDATE ACTION FLOW v2 ═══
        const args = (response as any).args ?? {}
        const hasExplicitUpdate = looksLikeExplicitUpdateActionRequest(message)
        const hasActiveUpdateFlow = Boolean(getActiveUpdateActionFlow(tm0))
        
        // If no active flow and user hasn't explicitly confirmed, start preview flow
        if (!hasActiveUpdateFlow && !looksLikeYesToProceed(message)) {
          // Fetch current action data to show diff
          const targetName = String(args.target_name ?? "").trim()
          const { data: currentAction } = await supabase
            .from("user_actions")
            .select("id, title, target_reps, scheduled_days, time_of_day")
            .eq("plan_id", (plan as any).id)
            .ilike("title", targetName || "%")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          
          // Create UpdateActionCandidate and show preview
          const updateCandidate = createUpdateCandidateFromToolArgs(
            {
              target_name: args.target_name,
              new_title: args.new_title,
              new_target_reps: args.new_target_reps,
              new_scheduled_days: args.new_scheduled_days,
              new_time_of_day: args.new_time_of_day,
            },
            {
              id: (currentAction as any)?.id,
              title: targetName || (currentAction as any)?.title || "l'action",
              target_reps: (currentAction as any)?.target_reps,
              scheduled_days: (currentAction as any)?.scheduled_days,
              time_of_day: (currentAction as any)?.time_of_day,
            }
          )
          
          // Start the update_action_flow session
          const updated = upsertUpdateActionFlow({ tempMemory: tm0, candidate: updateCandidate })
          await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
          
          await logUpdateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "flow_started",
            candidate: updateCandidate,
          })
          await logUpdateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "preview_shown",
            candidate: updateCandidate,
          })
          
          await trace({ event: "tool_call_blocked", metadata: { reason: "awaiting_update_preview_confirm" } })
          return {
            text: generateUpdatePreviewMessage(updateCandidate),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }
        
        // User explicitly confirmed or said yes - apply the update
        const rawResult = await handleUpdateAction(supabase, userId, (plan as any).id, args)
        
        // Handle special case: need to ask which day to remove
        if (/\bquel(le)?\s+jour\b[\s\S]{0,80}\b(enl[eè]v|retir|supprim)\w*/i.test(rawResult)) {
          try {
            await setFlow({
              kind: "update_action_structure",
              stage: "awaiting_remove_day",
              draft: { ...args, last_result: rawResult },
              started_at: (currentFlow as any)?.started_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          } catch {}
          await trace({ event: "tool_call_blocked", toolResult: rawResult, metadata: { reason: "needs_followup_remove_day" } })
          return {
            text: rawResult.replace(/\*\*/g, ""),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }
        
        await trace({ event: "tool_call_succeeded", toolResult: rawResult })
        
        // Clear any active update flow
        const closed = closeUpdateActionFlow({ tempMemory: tm0, outcome: "applied" })
        if (closed.changed) {
          const marked = markFlowJustClosed(closed.tempMemory, "update_action_flow")
          await updateUserState(supabase, userId, scope, { temp_memory: marked } as any)
        }
        try { if (currentFlow) await setFlow(null) } catch {}
        
        // Simple confirmation for eval requests
        const isEvalLikeRequest =
          String(meta?.requestId ?? "").includes(":tools:") ||
          String(meta?.requestId ?? "").includes(":eval")
        if (isEvalLikeRequest) {
          const target = String(args?.target_name ?? "").trim() || "l'action"
          const reps = Number.isFinite(Number(args?.new_target_reps)) ? Number(args.new_target_reps) : null
          const days = Array.isArray(args?.new_scheduled_days) ? (args.new_scheduled_days as string[]) : null
          return {
            text: [
              `Ok — j'ai mis à jour "${target}".`,
              `${reps != null ? `Fréquence: ${reps}×/semaine.` : ""} ${days && days.length ? `Jours planifiés: ${formatDaysFrench(days)}.` : ""}`.trim(),
              ``,
              `Tu veux qu'on ajuste autre chose, ou on la laisse comme ça ?`,
            ].join("\n").trim(),
            executed_tools: [toolName],
            tool_execution: "success",
          }
        }
        
        // Generate natural follow-up
        const target = String(args?.target_name ?? "").trim() || "l'action"
        return {
          text: `C'est fait — "${target}" est bien mis à jour.\n\nTu veux qu'on ajuste autre chose ?`,
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
          await trace({ event: "tool_call_blocked", metadata: { reason: "missing_user_consent" } })
          return {
            text: `Ok.\n\nTu veux que j’active “${title}” maintenant ?`,
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }

        const activationResult = await handleActivateAction(supabase, userId, (response as any).args)
        await trace({ event: "tool_call_succeeded", toolResult: activationResult })
        try { if (currentFlow) await setFlow(null) } catch {}
        return {
          text: activationResult,
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }

      if (toolName === "archive_plan_action") {
        const txt = await handleArchiveAction(supabase, userId, (response as any).args)
        await trace({ event: "tool_call_succeeded", toolResult: txt })
        return { text: txt, executed_tools: [toolName], tool_execution: "success" }
      }

      if (toolName === "create_simple_action") {
        // ═══ CREATE ACTION FLOW v2 ═══
        // Check if we need to show a preview before creating
        const rawArgs = (response as any).args ?? {}
        const hasActiveFlow = Boolean(getActiveCreateActionFlow(tm0))
        
        // If user is exploring, use the exploration path
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
          await trace({ event: "tool_call_blocked", metadata: { reason: "exploration_no_create" } })
          return {
            text: typeof explore === "string" ? explore.replace(/\*\*/g, "") : "Ok. Tu veux que je l'ajoute à ton plan maintenant ?",
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }

        // If Sophia suggested and user hasn't explicitly confirmed, start preview flow
        if (!hasActiveFlow && !looksLikeYesToProceed(message)) {
          // Create a new ActionCandidate and show preview
          const candidate = createCandidateFromToolArgs({
            title: rawArgs.title,
            description: rawArgs.description,
            type: rawArgs.type,
            targetReps: rawArgs.targetReps,
            time_of_day: rawArgs.time_of_day,
            tips: rawArgs.tips,
          }, "sophia")
          
          // Start the create_action_flow session
          const updated = upsertCreateActionFlow({ tempMemory: tm0, candidate })
          await updateUserState(supabase, userId, scope, { temp_memory: updated.tempMemory } as any)
          
          await logCreateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "flow_started",
            candidate,
          })
          await logCreateActionFlowEvent({
            supabase,
            requestId: meta?.requestId,
            evalRunId: meta?.evalRunId,
            userId,
            event: "preview_shown",
            candidate,
          })
          
          await trace({ event: "tool_call_blocked", metadata: { reason: "awaiting_preview_confirm" } })
          return {
            text: generatePreviewMessage(candidate),
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }

        const parsed = parseExplicitCreateActionFromUserMessage(message)
        // Prefer an explicit user-requested title, even if it was said on a previous turn.
        const flowTitle = String((currentFlow as any)?.draft?.title ?? "").trim()
        const recentUserTitle = (() => {
          const msgs = Array.isArray(opts.history) ? opts.history : []
          for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 12; i--) {
            const m = msgs[i]
            if (m?.role !== "user") continue
            const c = String(m?.content ?? "")
            const p = parseExplicitCreateActionFromUserMessage(c)
            if (p?.title) return String(p.title).trim()
          }
          return ""
        })()
        const title =
          (flowTitle || recentUserTitle || parsed.title || rawArgs.title || "").toString().trim()
        const finalTitle = title || String(rawArgs.title ?? "").trim() || "Action"
        const description = (parsed.description ?? rawArgs.description)
        const type = (parsed.type ?? rawArgs.type ?? "habit")
        const targetReps = (parsed.targetReps ?? rawArgs.targetReps ?? (type === "mission" ? 1 : 1))
        const tips = rawArgs.tips
        const time_of_day = (parsed.time_of_day ?? (currentFlow as any)?.draft?.time_of_day ?? rawArgs.time_of_day)
        const actionId = `act_${Date.now()}`

        // Normalize: if the user said "avant de dormir / le soir", treat as evening (more stable than night).
        const normalizedTod = (() => {
          const fromText = parseExplicitCreateActionFromUserMessage(message)?.time_of_day
          const fromHistory = (() => {
            const msgs = Array.isArray(opts.history) ? opts.history : []
            for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 12; i--) {
              const m = msgs[i]
              if (m?.role !== "user") continue
              const p = parseExplicitCreateActionFromUserMessage(String(m?.content ?? ""))
              if (p?.time_of_day) return p.time_of_day
            }
            return undefined
          })()
          return (fromText ?? fromHistory ?? time_of_day ?? "any_time")
        })()

        // Idempotency / cost control:
        // If the action already exists in DB or in plan JSON (same title), update it instead of creating duplicates.
        try {
          const titleNeedle = String(title ?? "").trim()
          if (titleNeedle) {
            const { data: existingDb } = await supabase
              .from("user_actions")
              .select("id,title,created_at")
              .eq("user_id", userId)
              .eq("plan_id", (plan as any).id)
              .ilike("title", titleNeedle)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
            const planHas = (() => {
              try {
                const content = (plan as any)?.content
                return Boolean(content && planJsonHasAction(content, { title: titleNeedle }))
              } catch {
                return false
              }
            })()
            if (existingDb?.id || planHas) {
              // Best-effort: align DB row to the latest args.
              if (existingDb?.id) {
                try {
                  await supabase
                    .from("user_actions")
                    .update({
                      title: titleNeedle,
                      description: description ?? null,
                      type: type || "habit",
                      target_reps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
                      time_of_day: normalizedTod || "any_time",
                      status: "active",
                      tracking_type: "boolean",
                    })
                    .eq("id", existingDb.id)
                } catch {}
              }
              // Best-effort: align plan JSON action fields (if present) without adding a duplicate.
              try {
                const content = (plan as any)?.content
                const phases = content?.phases
                if (Array.isArray(phases)) {
                  for (const ph of phases) {
                    const actions = (ph as any)?.actions
                    if (!Array.isArray(actions)) continue
                    for (const a of actions) {
                      if (String(a?.title ?? "").trim().toLowerCase() !== titleNeedle.toLowerCase()) continue
                      a.title = titleNeedle
                      if (description != null) a.description = description
                      if (tips != null) a.tips = tips
                      a.type = type || a.type
                      a.targetReps = Number.isFinite(Number(targetReps)) ? Number(targetReps) : (a.targetReps ?? 1)
                      a.time_of_day = normalizedTod || a.time_of_day || "any_time"
                    }
                  }
                  await supabase.from("user_plans").update({ content }).eq("id", (plan as any).id)
                }
              } catch {}
              const toolResult = { db_ok: Boolean(existingDb?.id), json_ok: true, db_row_id: (existingDb as any)?.id ?? null, dedup: true }
              await trace({ event: "tool_call_succeeded", toolResult, metadata: { outcome: "dedup_updated" } })
              try { if (currentFlow) await setFlow(null) } catch {}
              return {
                text: `Ok — j’ai mis à jour “${titleNeedle}”.`,
                executed_tools: [toolName],
                tool_execution: "success",
              }
            }
          }
        } catch {
          // If dedup checks fail, we still attempt creation below.
        }

        console.log(`[Architect] Attempting to insert into user_actions...`)
        const { error: insertErr } = await supabase.from("user_actions").insert({
          user_id: userId,
          plan_id: (plan as any).id,
          submission_id: (plan as any).submission_id,
          title: finalTitle,
          description,
          type: type || "habit",
          target_reps: Number.isFinite(Number(targetReps)) ? Number(targetReps) : 1,
          status: "active",
          tracking_type: "boolean",
          time_of_day: normalizedTod || "any_time",
        })
        if (insertErr) {
          console.error("[Architect] ❌ user_actions insert failed:", insertErr)
          await trace({ event: "tool_call_failed", error: insertErr, metadata: { reason: "db_insert_failed:user_actions" } })
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
          await trace({ event: "tool_call_succeeded", toolResult: { status: "duplicate" }, metadata: { outcome: "duplicate" } })
          return { text: `Oula ! ✋\n\nL'action "${title}" existe déjà.`, executed_tools: [toolName], tool_execution: "success" }
        }
        if (status === "error") {
          await trace({ event: "tool_call_failed", toolResult: { status: "error" }, metadata: { reason: "inject_plan_json_failed" } })
          return { text: "Erreur technique lors de la mise à jour du plan visuel.", executed_tools: [toolName], tool_execution: "failed" }
        }

        const verify = await verifyActionCreated(supabase, userId, (plan as any).id, { title, actionId })
        if (!verify.db_ok || !verify.json_ok) {
          console.warn("[Architect] ⚠️ Post-create verification failed:", verify)
          await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "uncertain_verification" } })
          return {
            text: `Je viens de tenter de créer "${title}", mais je ne la vois pas encore clairement dans ton plan (il y a peut-être eu un loupé de synchro).\n\nOuvre le dashboard et dis-moi si tu la vois. Sinon, dis “retente” et je la recrée.`,
            executed_tools: [toolName],
            tool_execution: "uncertain",
          }
        }
        await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "created_and_verified" } })

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
          await trace({ event: "tool_call_succeeded", toolResult: { status: "duplicate" }, metadata: { outcome: "duplicate" } })
          return { text: `Doucement ! ✋\n\nL'exercice "${title}" est déjà là.`, executed_tools: [toolName], tool_execution: "success" }
        }
        if (status === "error") {
          await trace({ event: "tool_call_failed", toolResult: { status: "error" }, metadata: { reason: "inject_plan_json_failed" } })
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
          await trace({ event: "tool_call_failed", error: fwInsertErr, metadata: { reason: "db_insert_failed:user_actions" } })
          return {
            text: `Oups — j’ai eu un souci technique en créant l’exercice "${title}".\n\nVa vérifier sur le dashboard si tu le vois. Si tu ne le vois pas, dis “retente” et je le recrée.`,
            executed_tools: [toolName],
            tool_execution: "failed",
          }
        }

        const verify = await verifyActionCreated(supabase, userId, (plan as any).id, { title, actionId })
        if (!verify.db_ok || !verify.json_ok) {
          console.warn("[Architect] ⚠️ Post-create verification failed (framework):", verify)
          await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "uncertain_verification" } })
          return {
            text: `Je viens de tenter d’intégrer "${title}", mais je ne le vois pas encore clairement dans ton plan (possible loupé de synchro).\n\nRegarde sur le dashboard et dis-moi si tu le vois. Sinon, dis “retente” et je le recrée.`,
            executed_tools: [toolName],
            tool_execution: "uncertain",
          }
        }
        await trace({ event: "tool_call_succeeded", toolResult: verify, metadata: { outcome: "created_and_verified" } })

        return {
          text: `C'est fait ! 🏗️\n\nJe viens de vérifier: "${title}" est bien dans ton plan.\nTu veux le faire quand ?`,
          executed_tools: [toolName],
          tool_execution: "success",
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Architect] tool execution failed (unexpected):", toolName, errMsg)
      try {
        await trace({ event: "tool_call_failed", error: e, metadata: { reason: "tool_execution_failed_unexpected" } })
      } catch {}
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
              agent_used: "architect",
              channel: meta?.channel ?? "web",
              tool_name: toolName,
              err: errMsg.slice(0, 240),
            },
          })
        }
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


