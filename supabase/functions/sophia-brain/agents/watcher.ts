import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeScope } from '../state-manager.ts' // Need access to state
import { generateWithGemini } from "../../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../../_shared/user_time_context.ts"

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
- Ne programme JAMAIS de check-in avec un confidence_score inférieur à 8.
- Ne propose pas de check-in pour des événements passés depuis longtemps.
- Assure-toi que "scheduled_for" est dans le FUTUR par rapport à "Maintenant" (${now}).
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

    const rows: Array<Record<string, unknown>> = []
    for (const event of events) {
      const score = Number((event as any)?.confidence_score)
      if (Number.isNaN(score) || score < 8) continue

      const scheduledFor = String((event as any)?.scheduled_for ?? "")
      const scheduledTime = new Date(scheduledFor)
      if (Number.isNaN(scheduledTime.getTime())) continue
      if (scheduledTime.getTime() <= Date.now()) continue

      const eventContext = String((event as any)?.event_context ?? "").trim()
      if (!eventContext) continue

      rows.push({
        user_id: userId,
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
