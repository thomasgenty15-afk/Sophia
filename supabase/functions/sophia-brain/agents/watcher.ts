import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeScope } from '../state-manager.ts' // Need access to state
import { generateWithGemini } from "../../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../../_shared/user_time_context.ts"

type ExistingCheckin = {
  scheduled_for: string
  event_context: string
  origin: string | null
  status: string
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
      return `${i + 1}. ${localTime} | origin=${c.origin ?? "unknown"} | status=${c.status} | context=${c.event_context}`
    })
    .join("\n")

  const prompt = `
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

  const candidateLocal = new Intl.DateTimeFormat("fr-FR", {
    timeZone: params.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(params.candidateScheduledFor))

  const userPrompt = `
Nouveau candidat:
- local_datetime: ${candidateLocal}
- event_context: ${params.candidateEventContext}
- confidence_score: ${params.candidateScore}

Check-ins déjà planifiés ce jour:
${dayList || "(aucun)"}
  `.trim()

  try {
    const out = await generateWithGemini(
      prompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      { requestId: params.requestId, model: "gemini-2.5-flash", source: "trigger-watcher-batch:day-coherence" },
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
    .select("timezone, locale")
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

  // Use the last 48h for date resolution context ("demain", "lundi prochain", etc.).
  const { data: recentMessages, error: recentErr } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .gt("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })

  if (recentErr || !recentMessages || recentMessages.length === 0) {
    console.log("[Veilleur] No recent messages for event detection", recentErr)
    return
  }

  const fullTranscript = recentMessages
    .map((m: any) => `[${m.created_at}] ${m.role}: ${m.content}`)
    .join("\n")
  const now = tctx.now_utc
  const basePrompt = `
Tu es "Le Veilleur", une IA bienveillante intégrée à l'assistant Sophia.
Ta mission est d'analyser les conversations récentes pour identifier des événements futurs importants dans la vie de l'utilisateur.

Repères temporels (CRITIQUES):
- Maintenant (UTC): ${now}
- Timezone utilisateur: ${tctx.user_timezone}
- Maintenant (local utilisateur): ${tctx.user_local_datetime} (${tctx.user_local_human})

RÈGLE DE TEMPS:
- Si l'utilisateur dit "aujourd'hui/demain/lundi prochain", interprète ces expressions en temps LOCAL utilisateur (timezone ci-dessus).
- Tu DOIS retourner "scheduled_for" en UTC (ISO 8601).

Objectif :
1. Repérer les événements mentionnés (réunions, sorties, concerts, examens, rendez-vous, etc.).
2. Déterminer si un message de "suivi" (check-in) serait apprécié par l'utilisateur.
3. Calculer le moment IDÉAL pour envoyer ce message.
4. NE RÉDIGE PAS le message final ici. On génère le message au moment de l'envoi, avec le contexte le plus récent.

Format de sortie attendu : JSON uniquement, un tableau d'objets.
[
  {
    "event_context": "Courte description de l'événement (ex: Présentation client)",
    "scheduled_for": "Date ISO 8601 précise (UTC) quand le message doit être envoyé",
    "confidence_score": "Score entre 0 et 10"
  }
]

Règles CRITIQUES :
- Ne génère RIEN si aucun événement pertinent n'est trouvé. Renvoie un tableau vide [].
- Sois TRÈS CONSERVATEUR. Ne programme un check-in QUE pour des événements majeurs (examen, entretien important, etc.) OU si l'utilisateur demande explicitement qu'on le relance.
- IGNORE les événements mineurs, routiniers, ou le fait que l'utilisateur dise simplement "à demain" ou "bonne nuit".
- N'utilise PAS les actions actives du plan comme motif de check-in ponctuel watcher (elles sont déjà suivies ailleurs).
- Si le sujet/rappel semble déjà pris en charge via le flux initiatives/dashboard (création/édition d'action, rappel récurrent, réglage de plan), ne crée PAS de future event watcher pour ce sujet.
- Si l'échange montre qu'une initiative couvre déjà le besoin, renvoie [] pour éviter les doublons.
- ÉTHIQUE / VERTU (OBLIGATOIRE):
  - Les check-ins doivent rester bienveillants, respectueux, non intrusifs et proportionnés.
  - Ne crée JAMAIS de check-in à tonalité culpabilisante, contrôlante, manipulatoire ou anxiogène.
  - Respecte l'autonomie de l'utilisateur: pas de relances excessives, pas de pression comportementale.
  - Évite les formulations de surveillance ("je vérifie que tu as bien..."), privilégie un soutien doux.
  - En cas de doute éthique, ne programme RIEN (renvoie []).
- Ne programme JAMAIS de check-in avec un confidence_score inférieur à 8.
- Ne propose pas de check-in pour des événements passés depuis longtemps.
- Assure-toi que "scheduled_for" est dans le FUTUR par rapport à "Maintenant" (${now}).

Actions actives du plan (à exclure du watcher):
${activeActionsBlock}
`

  try {
    const responseText = await generateWithGemini(
      basePrompt,
      `Voici l'historique des dernières 48h :\n\n${fullTranscript}`,
      0.4,
      true,
      [],
      "auto",
      { requestId: meta?.requestId, model: "gemini-2.5-flash", source: "trigger-watcher-batch" },
    )

    const events = JSON.parse(String(responseText))
    if (!Array.isArray(events) || events.length === 0) return

    const candidates = events
      .map((event: any) => {
        const score = Number(event?.confidence_score)
        const scheduledFor = String(event?.scheduled_for ?? "")
        const scheduledTime = new Date(scheduledFor)
        const eventContext = String(event?.event_context ?? "").trim()
        return { score, scheduledFor, scheduledTime, eventContext }
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
      .select("scheduled_for,event_context,origin,status")
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
      const eventContext = String(candidate.eventContext)

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
        },
        scheduled_for: scheduledFor,
        status: "pending",
      })
      occupied.push({
        scheduled_for: scheduledFor,
        event_context: eventContext,
        origin: "watcher",
        status: "pending",
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
