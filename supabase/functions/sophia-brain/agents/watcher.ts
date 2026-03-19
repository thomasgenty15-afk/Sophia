import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeScope } from '../state-manager.ts' // Need access to state
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../../_shared/user_time_context.ts"

type ExistingCheckin = {
  scheduled_for: string
  event_context: string
  origin: string | null
  status: string
  draft_message?: string | null
  message_payload?: Record<string, unknown> | null
}

type CoachingPauseDecision = {
  should_pause: boolean
  confidence_score: number
  pause_days: number
  rationale?: string
}

type WatcherEventCandidate = {
  event_context?: string
  scheduled_for?: string
  confidence_score?: number | string
  event_grounding?: string
}

type WatcherAnalysisResponse = {
  pause_decision?: Partial<CoachingPauseDecision> | null
  events?: WatcherEventCandidate[] | null
}

function simplePromptHash(input: string): string {
  let hash = 2166136261
  const text = String(input ?? "")
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function getWatcherIntervalMinutes(): number {
  const raw = Number((Deno.env.get("SOPHIA_WATCHER_INTERVAL_MINUTES") ?? "240").trim())
  if (!Number.isFinite(raw) || raw <= 0) return 240
  return Math.floor(raw)
}

function normalizeForMatch(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function dayKeyInTimezone(isoOrMs: string | number, timezone: string): string {
  const date = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function isPlanObjectiveContext(eventContext: string): boolean {
  const text = String(eventContext ?? "").toLowerCase()
  return /\b(plan|objectif|objectifs|habitude|routine|discipline|phase|north star|action du plan)\b/.test(text)
}

function isInsideDailyBilanWindow(params: { scheduledFor: string; timezone: string }): boolean {
  const date = new Date(params.scheduledFor)
  if (Number.isNaN(date.getTime())) return false
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: params.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  const minutes = hh * 60 + mm
  return minutes >= 19 * 60 + 30 && minutes < 20 * 60 + 30
}

function relatesToActivePlanActions(eventContext: string, actionTitles: string[]): boolean {
  if (!eventContext || actionTitles.length === 0) return false
  const ctx = normalizeForMatch(eventContext)
  if (!ctx) return false
  for (const title of actionTitles) {
    const t = normalizeForMatch(title)
    if (!t || t.length < 5) continue
    if (ctx.includes(t) || t.includes(ctx)) return true
    const tTokens = t.split(" ").filter((w) => w.length >= 4)
    if (tTokens.length === 0) continue
    const hitCount = tTokens.filter((w) => ctx.includes(w)).length
    if (hitCount >= Math.min(2, tTokens.length)) return true
  }
  return false
}

function compactOneLine(text: string, maxLen = 180): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
}

function stripRelativeTimePhrases(text: string): string {
  return String(text ?? "")
    .replace(/\b(?:dans\s+(?:\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quelques)\s+(?:minutes?|heures?|jours?|semaines?|mois))\b/gi, " ")
    .replace(/\b(?:aujourd['’]hui|demain|apr[eè]s-demain|ce\s+soir|cet\s+apr[eè]s-midi|la\s+semaine\s+prochaine|le\s+mois\s+prochain|lundi\s+prochain|mardi\s+prochain|mercredi\s+prochain|jeudi\s+prochain|vendredi\s+prochain|samedi\s+prochain|dimanche\s+prochain)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;!?])/g, "$1")
    .trim()
}

function sanitizeWatcherEventContext(text: string): string {
  const compact = compactOneLine(text, 180)
  const withoutRelative = stripRelativeTimePhrases(compact)
  return compactOneLine(withoutRelative || compact, 180)
}

function deriveTextContext(checkin: ExistingCheckin): string {
  const draft = compactOneLine(String(checkin.draft_message ?? ""))
  if (draft) return draft

  const payload =
    checkin.message_payload && typeof checkin.message_payload === "object"
      ? (checkin.message_payload as Record<string, unknown>)
      : null
  if (!payload) return ""

  const reminderInstruction = compactOneLine(String(payload.reminder_instruction ?? ""))
  if (reminderInstruction) return reminderInstruction

  const eventGrounding = compactOneLine(String(payload.event_grounding ?? ""))
  if (eventGrounding) return eventGrounding

  const genericInstruction = compactOneLine(String(payload.instruction ?? ""))
  if (genericInstruction) return genericInstruction

  return ""
}

function clampPauseDays(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(30, n))
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function computeLaterPauseUntil(currentValue: unknown, pauseDays: number): string {
  const requestedMs = Date.now() + Math.max(1, pauseDays) * 24 * 60 * 60 * 1000
  const existingMs = parseTimestampMs(currentValue)
  const nextMs = existingMs && existingMs > requestedMs ? existingMs : requestedMs
  return new Date(nextMs).toISOString()
}

async function applyCoachingPause(params: {
  supabase: SupabaseClient
  userId: string
  pauseUntilIso: string
}): Promise<void> {
  const nowIso = new Date().toISOString()

  const { error: profileErr } = await params.supabase
    .from("profiles")
    .update({
      whatsapp_coaching_paused_until: params.pauseUntilIso,
      whatsapp_bilan_paused_until: params.pauseUntilIso,
    } as any)
    .eq("id", params.userId)
  if (profileErr) throw profileErr

  const { error: morningCancelErr } = await params.supabase
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .eq("event_context", "morning_active_actions_nudge")
    .in("status", ["pending", "retrying", "awaiting_user"])
    .gte("scheduled_for", nowIso)
    .lt("scheduled_for", params.pauseUntilIso)
  if (morningCancelErr) throw morningCancelErr

  const pendingKinds = ["weekly_bilan", "bilan_reschedule"] as const
  const { error: pendingErr } = await params.supabase
    .from("whatsapp_pending_actions")
    .update({
      status: "cancelled",
      processed_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("kind", [...pendingKinds])
    .eq("status", "pending")
  if (pendingErr) throw pendingErr

  const { error: morningPendingErr } = await params.supabase
    .from("whatsapp_pending_actions")
    .update({
      status: "cancelled",
      processed_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter("payload->>event_context", "eq", "morning_active_actions_nudge")
  if (morningPendingErr) throw morningPendingErr
}

async function aiValidateDayCoherence(params: {
  candidateEventContext: string
  candidateScheduledFor: string
  candidateScore: number
  timezone: string
  sameDayCheckins: ExistingCheckin[]
  requestId?: string
}): Promise<boolean> {
  const dayList = params.sameDayCheckins
    .map((c, i) => {
      const localTime = new Intl.DateTimeFormat("fr-FR", {
        timeZone: params.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(c.scheduled_for))
      const textContext = deriveTextContext(c)
      const details = [
        `${i + 1}. ${localTime}`,
        `origin=${c.origin ?? "unknown"}`,
        `status=${c.status}`,
        `event_context=${compactOneLine(c.event_context, 140) || "unknown"}`,
        `text_context=${textContext || "(none)"}`,
      ]
      return details.join(" | ")
    })
    .join("\n")

  const stablePrompt = `
Tu es un arbitre de scheduling de check-ins Sophia.
Ta mission: décider si un nouveau check-in watcher doit être accepté le même jour que d'autres check-ins déjà planifiés.

Règles strictes:
- Rejette si le nouveau check-in semble redondant / même thème qu'un check-in déjà prévu ce jour-là.
- Rejette si l'ajout rend la journée insistante.
- Rejette les check-ins centrés sur objectifs/plan/habitudes quotidiennes, sauf besoin de support vraiment exceptionnel.
- Accepte si le nouveau check-in est clairement complémentaire et non répétitif.

Retourne JSON strict:
{"accept": true|false, "reason": "courte raison"}
  `.trim()

  const semiStablePrompt = `
Contexte runtime:
- timezone utilisateur: ${params.timezone}
`.trim()

  const candidateLocal = new Intl.DateTimeFormat("fr-FR", {
    timeZone: params.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(params.candidateScheduledFor))

  const volatilePrompt = `
Nouveau candidat:
- local_datetime: ${candidateLocal}
- event_context: ${params.candidateEventContext}
- confidence_score: ${params.candidateScore}

Check-ins déjà planifiés ce jour:
${dayList || "(aucun)"}
  `.trim()

  try {
    console.log(JSON.stringify({
      tag: "watcher_day_coherence_prompt_cache_ready",
      request_id: params.requestId ?? null,
      stable_hash: simplePromptHash(stablePrompt),
      semi_stable_hash: simplePromptHash(semiStablePrompt),
      stable_chars: stablePrompt.length,
      semi_stable_chars: semiStablePrompt.length,
      volatile_chars: volatilePrompt.length,
      full_chars: stablePrompt.length + 2 + semiStablePrompt.length + 2 + volatilePrompt.length,
    }))
  } catch {
    // non-blocking
  }

  try {
    const out = await generateWithGemini(
      `${stablePrompt}\n\n${semiStablePrompt}`,
      volatilePrompt,
      0.1,
      true,
      [],
      "auto",
      { requestId: params.requestId, model: getGlobalAiModel("gemini-2.5-flash"), source: "trigger-watcher-batch:day-coherence" },
    )
    const parsed = JSON.parse(String(out))
    return Boolean((parsed as any)?.accept)
  } catch {
    // Fail-safe: when coherence check fails, avoid adding potentially spammy check-ins.
    return false
  }
}

export async function runWatcher(
  supabase: SupabaseClient, 
  userId: string, 
  scopeRaw: unknown,
  lastProcessedAt: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
) {
  const watcherDisabled =
    (Deno.env.get("SOPHIA_WATCHER_DISABLED") ?? "").trim() === "1" ||
    (Deno.env.get("SOPHIA_VEILLEUR_DISABLED") ?? "").trim() === "1"
  if (watcherDisabled) return

  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(scopeRaw ?? meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")
  console.log(`[Veilleur] Triggered for user ${userId} scope=${scope}`)

  // Fetch messages since last_processed_at (watcher scope: punctual checkins/signals only)
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .gt('created_at', lastProcessedAt)
    .order('created_at', { ascending: true })

  if (error || !messages || messages.length === 0) {
    console.log('[Veilleur] No new messages found or error', error)
    return
  }

  // 3. Prepare transcript (kept for future punctual checkin detection)
  const batch = messages.slice(-50) // Safe upper limit
  const transcript = batch.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
  void transcript

  // Deterministic mode (MEGA): keep behavior stable for integration tests.
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    const archiveText = `MEGA_TEST_STUB: archive (${batch.length} msgs)`;
    console.log(`[Veilleur] MEGA stub: watcher only (${archiveText}).`);
    return;
  }

  // Watcher-only mode: detect future events and schedule punctual check-ins.
  const { data: prof } = await supabase
    .from("profiles")
    .select("timezone, locale, whatsapp_coaching_paused_until, whatsapp_bilan_paused_until")
    .eq("id", userId)
    .maybeSingle()
  const tctx = buildUserTimeContextFromValues({
    timezone: (prof as any)?.timezone ?? null,
    locale: (prof as any)?.locale ?? null,
  })

  const { data: activeActions } = await supabase
    .from("user_actions")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(20)
  const activeActionTitles = Array.isArray(activeActions)
    ? activeActions.map((a: any) => String(a?.title ?? "").trim()).filter(Boolean)
    : []
  const activeActionsBlock = activeActionTitles.length > 0
    ? activeActionTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(aucune action active)"

  const watcherIntervalMinutes = getWatcherIntervalMinutes()
  const windowStartMs = Date.now() - watcherIntervalMinutes * 60 * 1000
  const windowMessages = messages.filter((m: any) => {
    const ts = new Date(String(m?.created_at ?? "")).getTime()
    return Number.isFinite(ts) && ts > windowStartMs
  })

  if (windowMessages.length === 0) {
    console.log(
      `[Veilleur] No messages in watcher window for event detection user=${userId} scope=${scope} window_min=${watcherIntervalMinutes}`,
    )
    return
  }

  const fullTranscript = windowMessages
    .map((m: any) => `[${m.created_at}] ${m.role}: ${m.content}`)
    .join("\n")
  const now = tctx.now_utc
  const stablePrompt = `
Tu es "Le Veilleur", une IA bienveillante intégrée à l'assistant Sophia.
Ta mission est d'analyser les conversations récentes pour:
1. détecter si l'utilisateur demande explicitement une pause temporaire sur le coaching lié aux objectifs
2. identifier des événements futurs importants dans la vie de l'utilisateur

Repères temporels (CRITIQUES):
- Maintenant (UTC): ${now}
- Timezone utilisateur: ${tctx.user_timezone}
- Maintenant (local utilisateur): ${tctx.user_local_datetime} (${tctx.user_local_human})

RÈGLE DE TEMPS:
- Si l'utilisateur dit "aujourd'hui/demain/lundi prochain", interprète ces expressions en temps LOCAL utilisateur (timezone ci-dessus).
- Tu DOIS retourner "scheduled_for" en UTC (ISO 8601).

FENÊTRE D'OBSERVATION (STRICTE):
- L'historique fourni couvre uniquement les ${watcherIntervalMinutes} dernières minutes.
- Base ton analyse uniquement sur cette fenêtre. N'infère rien d'en-dehors.

Objectif :
1. Décider si l'utilisateur demande explicitement une pause temporaire sur le coaching lié aux objectifs.
2. Repérer les événements mentionnés (réunions, sorties, concerts, examens, rendez-vous, etc.).
3. Déterminer si un message de "suivi" (check-in) serait apprécié par l'utilisateur.
4. Calculer le moment IDÉAL pour envoyer ce message.
5. NE RÉDIGE PAS le message final ici. On génère le message au moment de l'envoi, avec le contexte le plus récent.

Format de sortie attendu : JSON strict uniquement, un objet avec cette forme:
{
  "pause_decision": {
    "should_pause": true|false,
    "confidence_score": 0,
    "pause_days": 0,
    "rationale": "court"
  },
  "events": [
    {
      "event_context": "Courte description de l'événement (ex: Présentation client)",
      "scheduled_for": "Date ISO 8601 précise (UTC) quand le message doit être envoyé",
      "confidence_score": "Score entre 0 et 10",
      "event_grounding": "1-2 phrases factuelles sur ce que l'utilisateur a dit (optionnel, max 280 caractères)"
    }
  ]
}

Règles CRITIQUES :
- Si aucun événement pertinent n'est trouvé, renvoie "events": [].
- Si aucune pause coaching explicite avec durée claire n'est demandée, renvoie "pause_decision" avec should_pause=false, confidence_score=0, pause_days=0.
- Pour la pause coaching, sois ULTRA conservateur.
- La pause coaching concerne uniquement:
  - le bilan quotidien du soir
  - le bilan hebdomadaire
  - le message de motivation du matin sur les actions actives
- N'inclus PAS dans la pause coaching:
  - les rappels récurrents configurés par l'utilisateur
  - les memory_echo
  - les check-ins ponctuels watcher d'événements
  - la simple volonté d'arrêter la conversation en cours
  - la pause d'une action précise
- N'active la pause coaching que si la demande est explicite et vise bien ces sollicitations de coaching.
- Si la durée de pause n'est pas claire, retourne should_pause=false.
- Interprète "quelques jours" seulement si c'est vraiment explicite et sans ambiguïté.
- Sois TRÈS CONSERVATEUR. Ne programme un check-in QUE pour des événements majeurs (examen, entretien important, etc.) OU si l'utilisateur demande explicitement qu'on le relance.
- IGNORE les événements mineurs, routiniers, ou le fait que l'utilisateur dise simplement "à demain" ou "bonne nuit".
- N'utilise PAS les actions actives du plan comme motif de check-in ponctuel watcher (elles sont déjà suivies ailleurs).
- Si l'utilisateur demande explicitement un rappel ponctuel a Sophia ("rappelle-moi", "envoie-moi un rappel", etc.), renvoie []: ce cas est géré par le tool de reminder one-shot, pas par le watcher.
- Si le sujet/rappel semble déjà pris en charge via le flux rendez-vous/dashboard (création/édition d'action, rappel récurrent, réglage de plan), ne crée PAS de future event watcher pour ce sujet.
- Si l'échange montre qu'un rendez-vous couvre déjà le besoin, renvoie [] pour éviter les doublons.
- event_context doit être une étiquette canonique et stable de l'événement, pas une formulation relative.
- Interdit dans event_context: "dans deux semaines", "demain", "vendredi prochain", "ce soir", etc.
- Préfère une formulation absolue ou neutre, par exemple "Rendez-vous galant" ou "Rendez-vous galant du 20 mars".
- event_grounding doit rester factuel. Si tu peux déduire une date/heure absolue grâce au contexte temporel, préfère-la aux formulations relatives.
- ÉTHIQUE / VERTU (OBLIGATOIRE):
  - Les check-ins doivent rester bienveillants, respectueux, non intrusifs et proportionnés.
  - Ne crée JAMAIS de check-in à tonalité culpabilisante, contrôlante, manipulatoire ou anxiogène.
  - Respecte l'autonomie de l'utilisateur: pas de relances excessives, pas de pression comportementale.
  - Évite les formulations de surveillance ("je vérifie que tu as bien..."), privilégie un soutien doux.
  - En cas de doute éthique, ne programme RIEN (renvoie []).
- Ne programme JAMAIS de check-in avec un confidence_score inférieur à 8.
- Ne propose pas de check-in pour des événements passés depuis longtemps.
- Assure-toi que "scheduled_for" est dans le FUTUR par rapport à "Maintenant".

Actions actives du plan (à exclure du watcher):
`.trim()

  const semiStablePrompt = `
Repères temporels (CRITIQUES):
- Maintenant (UTC): ${now}
- Timezone utilisateur: ${tctx.user_timezone}
- Maintenant (local utilisateur): ${tctx.user_local_datetime} (${tctx.user_local_human})

RÈGLE DE TEMPS:
- Si l'utilisateur dit "aujourd'hui/demain/lundi prochain", interprète ces expressions en temps LOCAL utilisateur (timezone ci-dessus).
- Tu DOIS retourner "scheduled_for" en UTC (ISO 8601).

FENÊTRE D'OBSERVATION (STRICTE):
- L'historique fourni couvre uniquement les ${watcherIntervalMinutes} dernières minutes.
- Base ton analyse uniquement sur cette fenêtre. N'infère rien d'en-dehors.

Actions actives du plan (à exclure du watcher):
${activeActionsBlock}
`.trim()

  const volatilePrompt = `Voici l'historique de la fenêtre d'observation (${watcherIntervalMinutes} minutes) :\n\n${fullTranscript}`

  try {
    console.log(JSON.stringify({
      tag: "watcher_main_prompt_cache_ready",
      request_id: meta?.requestId ?? null,
      stable_hash: simplePromptHash(stablePrompt),
      semi_stable_hash: simplePromptHash(semiStablePrompt),
      stable_chars: stablePrompt.length,
      semi_stable_chars: semiStablePrompt.length,
      volatile_chars: volatilePrompt.length,
      full_chars: stablePrompt.length + 2 + semiStablePrompt.length + 2 + volatilePrompt.length,
    }))
  } catch {
    // non-blocking
  }

  try {
    const responseText = await generateWithGemini(
      `${stablePrompt}\n\n${semiStablePrompt}`,
      volatilePrompt,
      0.4,
      true,
      [],
      "auto",
      { requestId: meta?.requestId, model: getGlobalAiModel("gemini-2.5-flash"), source: "trigger-watcher-batch" },
    )

    const parsed = JSON.parse(String(responseText)) as WatcherAnalysisResponse | WatcherEventCandidate[]
    const analysis: WatcherAnalysisResponse = Array.isArray(parsed)
      ? { pause_decision: null, events: parsed }
      : (parsed ?? {})

    const pauseDecision = analysis.pause_decision
      ? {
        should_pause: Boolean(analysis.pause_decision.should_pause),
        confidence_score: Number(analysis.pause_decision.confidence_score ?? 0),
        pause_days: clampPauseDays(analysis.pause_decision.pause_days),
        rationale: compactOneLine(String(analysis.pause_decision.rationale ?? ""), 180) || undefined,
      }
      : null

    if (
      pauseDecision?.should_pause &&
      Number.isFinite(pauseDecision.confidence_score) &&
      pauseDecision.confidence_score > 8 &&
      pauseDecision.pause_days >= 1
    ) {
      const pauseUntilIso = computeLaterPauseUntil(
        (() => {
          const coachingMs = parseTimestampMs((prof as any)?.whatsapp_coaching_paused_until ?? null)
          const bilanMs = parseTimestampMs((prof as any)?.whatsapp_bilan_paused_until ?? null)
          if ((coachingMs ?? 0) >= (bilanMs ?? 0)) return (prof as any)?.whatsapp_coaching_paused_until ?? null
          return (prof as any)?.whatsapp_bilan_paused_until ?? null
        })(),
        pauseDecision.pause_days,
      )
      await applyCoachingPause({
        supabase,
        userId,
        pauseUntilIso,
      })
      console.log(
        `[Veilleur] coaching_pause_applied user=${userId} days=${pauseDecision.pause_days} confidence=${pauseDecision.confidence_score} pause_until=${pauseUntilIso}`,
      )
    }

    const events = Array.isArray(analysis.events) ? analysis.events : []
    if (events.length === 0) return

    const candidates = events
      .map((event: any) => {
        const score = Number(event?.confidence_score)
        const scheduledFor = String(event?.scheduled_for ?? "")
        const scheduledTime = new Date(scheduledFor)
        const eventContext = String(event?.event_context ?? "").trim()
        const eventGrounding = String(event?.event_grounding ?? "").trim().slice(0, 280)
        return { score, scheduledFor, scheduledTime, eventContext, eventGrounding }
      })
      .filter((c: any) => !Number.isNaN(c.score) && c.score >= 8)
      .filter((c: any) => !Number.isNaN(c.scheduledTime.getTime()) && c.scheduledTime.getTime() > Date.now())
      .filter((c: any) => Boolean(c.eventContext))

    if (candidates.length === 0) return

    const minMs = Math.min(...candidates.map((c: any) => c.scheduledTime.getTime()))
    const maxMs = Math.max(...candidates.map((c: any) => c.scheduledTime.getTime()))
    const rangeStart = new Date(minMs - 72 * 60 * 60 * 1000).toISOString()
    const rangeEnd = new Date(maxMs + 72 * 60 * 60 * 1000).toISOString()

    const { data: existingRows, error: existingErr } = await supabase
      .from("scheduled_checkins")
      .select("scheduled_for,event_context,origin,status,draft_message,message_payload")
      .eq("user_id", userId)
      .in("status", ["pending", "awaiting_user", "sent"])
      .gte("scheduled_for", rangeStart)
      .lte("scheduled_for", rangeEnd)
    if (existingErr) throw existingErr

    const occupied: ExistingCheckin[] = Array.isArray(existingRows)
      ? (existingRows as ExistingCheckin[])
      : []

    const rows: Array<Record<string, unknown>> = []
    for (const candidate of candidates) {
      const score = Number(candidate.score)
      const scheduledFor = String(candidate.scheduledFor)
      const eventContext = sanitizeWatcherEventContext(String(candidate.eventContext))

      // Hard product rule: avoid check-ins about plan objectives unless exceptional support need (>0.9).
      if (isPlanObjectiveContext(eventContext) && score <= 9) continue
      if (relatesToActivePlanActions(eventContext, activeActionTitles)) continue
      if (isInsideDailyBilanWindow({ scheduledFor, timezone: tctx.user_timezone })) continue

      const candidateDay = dayKeyInTimezone(scheduledFor, tctx.user_timezone)
      const sameDayCheckins = occupied.filter(
        (c) => dayKeyInTimezone(c.scheduled_for, tctx.user_timezone) === candidateDay,
      )

      // Trigger AI verification only when the day already has at least one check-in.
      if (sameDayCheckins.length > 0) {
        const accepted = await aiValidateDayCoherence({
          candidateEventContext: eventContext,
          candidateScheduledFor: scheduledFor,
          candidateScore: score,
          timezone: tctx.user_timezone,
          sameDayCheckins,
          requestId: meta?.requestId,
        })
        if (!accepted) continue
      }

      rows.push({
        user_id: userId,
        origin: "watcher",
        event_context: eventContext,
        draft_message: null,
        message_mode: "dynamic",
        message_payload: {
          source: "trigger-watcher-batch",
          instruction:
            "Relance courte liée à l'événement. Utilise le tutoiement. 1 question max. Pas de markdown.",
          event_grounding: candidate.eventGrounding || null,
        },
        scheduled_for: scheduledFor,
        status: "pending",
      })
      occupied.push({
        scheduled_for: scheduledFor,
        event_context: eventContext,
        origin: "watcher",
        status: "pending",
        draft_message: null,
        message_payload: {
          event_grounding: candidate.eventGrounding || null,
        },
      })
    }

    if (rows.length === 0) return

    const { error: upsertErr } = await supabase
      .from("scheduled_checkins")
      .upsert(rows as any, { onConflict: "user_id,event_context,scheduled_for" })
    if (upsertErr) throw upsertErr
    console.log(`[Veilleur] scheduled_checkins_inserted=${rows.length} user=${userId} scope=${scope}`)
  } catch (e) {
    console.error(`[Veilleur] event_detection_error user=${userId} scope=${scope}`, e)
  }
}
