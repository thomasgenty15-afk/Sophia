/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { generateWithGemini } from '../_shared/gemini.ts'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"

console.log("Memory Echo: Function initialized")

// Config
// "Memory Echo" should primarily be based on curated insights (table `memories`),
// not raw chat logs. We therefore look back ~3 months by default.
// We want the echo to feel like "Sophia has memory", so we avoid very recent items.
// Primary window: 1 to 4 months old (≈ 30–120 days).
const MEMORY_MIN_AGE_DAYS = 30
const MEMORY_MAX_AGE_DAYS = 120
// Fallback window (if no good memories in 1–4 months): 1 to 6 months old.
const MEMORY_FALLBACK_MAX_AGE_DAYS = 180
// Plans: keep up to 6 months (structural victory)
const PLAN_LOOKBACK_DAYS = 180
const COOLDOWN_DAYS = 10 // Don't trigger if triggered recently

type EchoCandidate = {
  kind: "memory" | "chat"
  id?: string | null
  created_at?: string | null
  content: string
  source_type?: string | null
  type?: string | null
  metadata?: unknown
}

function cleanText(s: string): string {
  return (s ?? "").toString().replace(/\s+/g, " ").trim()
}

function isLowSignalText(s: string): boolean {
  const t = cleanText(s).toLowerCase()
  if (!t) return true
  // Too short → almost always a terrible memory echo.
  if (t.length < 40) return true
  // Emoji / punctuation only
  if (!/[a-zàâçéèêëîïôûùüÿñæœ]/i.test(t)) return true
  // Greetings / acknowledgements / one-word replies
  if (/^(salut|coucou|hello|yo|ok|okay|mdr|lol|merci|thanks|oui|non|go|vas[-\s]*y|👍|✅|👌)\b/.test(t) && t.length < 80) return true
  // “ping” / empty check
  if (/^(salut\s*\?|tu\s+es\s+l[àa]\s*\?|t[’']es\s+l[àa]\s*\?|y['’]a\s+quelqu['’]un\s*\?|test)\b/.test(t)) return true
  return false
}

function scoreCandidate(c: EchoCandidate): number {
  const t = cleanText(c.content)
  const lower = t.toLowerCase()
  let score = Math.min(250, t.length)
  if (/\bje\b|\bj['’]ai\b|\bje\s+suis\b/.test(lower)) score += 40
  if (/\b(peur|anx|angoiss|stress|fatigu|doute|honte|triste|col[eè]re|content|fi[eè]r|motiv|objectif|plan)\b/.test(lower)) score += 60
  if (t.includes("?") && t.length > 80) score += 20
  // Down-rank meta “ping Sophia” kind of content even if long enough.
  if (/\b(pourquoi|tu)\s+(m['’]as\s+pas\s+r[ée]pondu|r[ée]ponds)\b/.test(lower)) score -= 40
  return score
}

async function pickBestCandidate(candidates: EchoCandidate[], requestId: string): Promise<{ picked: EchoCandidate | null; reason: string }> {
  const filtered = candidates.filter((c) => !isLowSignalText(c.content))
  if (filtered.length === 0) return { picked: null, reason: "all_candidates_low_signal" }
  if (filtered.length === 1) return { picked: filtered[0], reason: "single_candidate" }

  // Let Gemini pick the best one, but force strict JSON output.
  const list = filtered.slice(0, 20).map((c, i) => ({
    i,
    kind: c.kind,
    created_at: c.created_at ?? null,
    id: c.id ?? null,
    excerpt: cleanText(c.content).slice(0, 220),
  }))

  const selectionPrompt =
    `Tu dois choisir 1 seul élément dans une liste pour faire un "Memory Echo" utile.\n\n` +
    `Règles STRICTES:\n` +
    `- Ne choisis JAMAIS un simple "salut", "ok", ou un message court / banal.\n` +
    `- Choisis un contenu qui montre une émotion, un enjeu, une question de fond, une difficulté, un objectif.\n` +
    `- Si aucun élément n'est vraiment bon, réponds selected_index=-1.\n\n` +
    `Liste (extraits):\n${JSON.stringify(list, null, 2)}\n\n` +
    `Réponds UNIQUEMENT en JSON: {"selected_index": number, "reason": string}`

  try {
    const raw = await generateWithGemini(selectionPrompt, "Choisis.", 0.0, true, [], "auto", {
      requestId,
      model: "gemini-2.0-flash",
      source: "trigger-memory-echo:picker",
    })
    const parsed = JSON.parse(String(raw)) as any
    const idx = Number(parsed?.selected_index)
    if (!Number.isFinite(idx) || idx < 0) return { picked: null, reason: String(parsed?.reason ?? "no_good_candidate") }
    const found = filtered.find((c) => (list as any[]).some((x) => x.i === idx && x.id === (c.id ?? null) && x.kind === c.kind)) ??
      filtered[idx] ??
      null
    return { picked: found, reason: String(parsed?.reason ?? "picked_by_model") }
  } catch {
    // Fallback: deterministic heuristic
    const best = filtered.slice().sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] ?? null
    return { picked: best, reason: "picked_by_heuristic" }
  }
}

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret()
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }
  return data
}

function minutes(ms: number): number {
  return ms / (60 * 1000)
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json().catch(() => ({} as any)) as any
    const filterUserId = String(body?.user_id ?? "").trim()
    const filterEmail = String(body?.email ?? "").trim().toLowerCase()
    const force = Boolean(body?.force)
    const debug = Boolean(body?.debug)
    const quietMinutes = Number.isFinite(Number(body?.quiet_minutes)) ? Number(body?.quiet_minutes) : 20
    const bypassQuiet = Boolean(body?.bypass_quiet)

    // Optional targeting: run only for a specific user (user_id or email).
    let userIds: string[] = []
    if (filterUserId) {
      userIds = [filterUserId]
    } else if (filterEmail) {
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id,email")
        .ilike("email", filterEmail)
        .maybeSingle()
      if (profErr) throw profErr
      if (!prof?.id) {
        return jsonResponse(
          req,
          { success: false, error: `User not found for email=${filterEmail}`, request_id: requestId },
          { status: 404, includeCors: false },
        )
      }
      userIds = [String((prof as any).id)]
    }

    // 1. Identify users eligible (active recently, but not triggered in last 10 days)
    // We check `user_chat_states` to see last interaction, and maybe a new field `last_memory_echo_at`
    // For now, let's just pick active users and check a log table or metadata.
    // To keep it simple without migration: we'll check chat_messages history for 'memory_echo' source in metadata.

    if (userIds.length === 0) {
      const { data: activeUsers, error: usersError } = await supabaseAdmin
        .from('chat_messages')
        .select('user_id')
        .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Active in last week
      if (usersError) throw usersError
      userIds = [...new Set((activeUsers ?? []).map((u: any) => u.user_id))]
    }

    let triggeredCount = 0
    const debugByUser: Array<{ user_id: string; reason: string; strategy?: string; whatsapp_send?: unknown; error?: unknown }> = []

    for (const userId of userIds) {
        // A. Check Cooldown (Has echo been sent in last 10 days?)
        if (!force) {
          const { data: recentEchoes } = await supabaseAdmin
            .from('chat_messages')
            .select('id')
            .eq('user_id', userId)
            .eq('role', 'assistant')
            .contains('metadata', { source: 'memory_echo' })
            .gt('created_at', new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString())
          if (recentEchoes && recentEchoes.length > 0) {
            continue
          }
        }

        // B. STRATEGY 1: STRUCTURAL (Completed Plans)
        // Find plans completed between 1 and 6 months ago
        const { data: completedPlans } = await supabaseAdmin
            .from('user_plans')
            .select('id, title, created_at, completed_at, goal_id')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .gt('completed_at', new Date(Date.now() - PLAN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
            .lt('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Completed at least a week ago
            .limit(1)

        let selectedStrategy = null
        let payload: any = null
        let refId: string | null = null

        if (completedPlans && completedPlans.length > 0) {
            selectedStrategy = 'structural_victory'
            payload = completedPlans[0]
            refId = String((payload as any)?.id ?? "") || null
        } else {
            // B2. STRATEGY 1.5: FORGE MEMORIES (curated insights table)
            // Primary source of truth: use `memories` that are 1–4 months old.
            // If none are usable, we widen up to 6 months (still excluding <30 days).
            const now = Date.now()
            const minAgeIso = new Date(now - MEMORY_MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
            const maxAgeIso = new Date(now - MEMORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
            const fallbackMaxAgeIso = new Date(now - MEMORY_FALLBACK_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

            const fetchMemoriesWindow = async (olderThanIso: string) => {
              const { data } = await supabaseAdmin
                .from("memories")
                .select("id, content, created_at, source_type, type, metadata")
                .eq("user_id", userId)
                // created_at between [olderThanIso, minAgeIso]
                .gte("created_at", olderThanIso)
                .lte("created_at", minAgeIso)
                .not("type", "eq", "whatsapp_personal_fact")
                .order("created_at", { ascending: false })
                .limit(200)
              return data ?? []
            }

            let oldMemories = await fetchMemoriesWindow(maxAgeIso)
            if (!oldMemories.length) oldMemories = await fetchMemoriesWindow(fallbackMaxAgeIso)

            const memoryCandidates: EchoCandidate[] = (oldMemories ?? []).map((m: any) => ({
              kind: "memory",
              id: String(m?.id ?? ""),
              created_at: String(m?.created_at ?? ""),
              content: String(m?.content ?? ""),
              source_type: String(m?.source_type ?? ""),
              type: String(m?.type ?? ""),
              metadata: m?.metadata ?? null,
            }))

            // Provide recent context (last 30 days) so selection avoids topics already recently discussed.
            const recentSinceIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
            const { data: recentChat } = await supabaseAdmin
              .from("chat_messages")
              .select("role, content, created_at")
              .eq("user_id", userId)
              .gte("created_at", recentSinceIso)
              .order("created_at", { ascending: false })
              .limit(40)
            const recentContext = (recentChat ?? [])
              .slice()
              .reverse()
              .map((m: any) => `${m.role}: ${cleanText(String(m.content ?? "")).slice(0, 180)}`)
              .join("\n")

            const picked = await (async () => {
              // Wrap picker to include recent context as an additional constraint.
              const filtered = memoryCandidates.filter((c) => !isLowSignalText(c.content))
              if (filtered.length === 0) return { picked: null as any, reason: "all_candidates_low_signal" }
              if (filtered.length === 1) return { picked: filtered[0], reason: "single_candidate" }

              const list = filtered.slice(0, 20).map((c, i) => ({
                i,
                created_at: c.created_at ?? null,
                id: c.id ?? null,
                type: c.type ?? null,
                source_type: c.source_type ?? null,
                excerpt: cleanText(c.content).slice(0, 240),
              }))

              const selectionPrompt =
                `Tu dois choisir 1 seul souvenir (table memories) pour faire un "Memory Echo" utile.\n\n` +
                `Objectif: donner l'impression d'un vrai suivi: Sophia prend des nouvelles d'un sujet important, car on n'en a pas reparlé récemment.\n\n` +
                `Règles STRICTES:\n` +
                `- Ne choisis JAMAIS un souvenir trop récent ou banal.\n` +
                `- Ne choisis PAS un sujet qui a été discuté dans les 30 derniers jours (voir contexte).\n` +
                `- Choisis un souvenir qui montre un enjeu/émotion/objectif clair.\n` +
                `- Si aucun n'est bon, réponds selected_index=-1.\n\n` +
                `Contexte des 30 derniers jours (extraits):\n${recentContext || "(vide)"}\n\n` +
                `Liste des souvenirs candidats (extraits):\n${JSON.stringify(list, null, 2)}\n\n` +
                `Réponds UNIQUEMENT en JSON: {"selected_index": number, "reason": string}`

              try {
                const raw = await generateWithGemini(selectionPrompt, "Choisis.", 0.0, true, [], "auto", {
                  requestId,
                  model: "gemini-2.0-flash",
                  source: "trigger-memory-echo:picker_memories",
                })
                const parsed = JSON.parse(String(raw)) as any
                const idx = Number(parsed?.selected_index)
                if (!Number.isFinite(idx) || idx < 0) return { picked: null, reason: String(parsed?.reason ?? "no_good_candidate") }
                const best = filtered[idx] ?? null
                return { picked: best, reason: String(parsed?.reason ?? "picked_by_model") }
              } catch {
                const best = filtered.slice().sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] ?? null
                return { picked: best, reason: "picked_by_heuristic" }
              }
            })()

            if (picked.picked) {
              selectedStrategy = "forge_memory"
              payload = picked.picked
              refId = String(picked.picked.id ?? "") || null
              if (debug) debugByUser.push({ user_id: userId, reason: `picked:${picked.reason}`, strategy: selectedStrategy })
            }
        }

        // Fallback (manual/targeted only): if there are ZERO memories, we can still build an echo
        // from raw chat messages. This should not be the normal path.
        if (!selectedStrategy && force && (filterUserId || filterEmail)) {
          const { data: recentMessages } = await supabaseAdmin
            .from("chat_messages")
            .select("id, content, created_at")
            .eq("user_id", userId)
            .eq("role", "user")
            .order("created_at", { ascending: false })
            .limit(200)

          const recents: EchoCandidate[] = (recentMessages ?? []).map((m: any) => ({
            kind: "chat",
            id: String(m?.id ?? ""),
            created_at: String(m?.created_at ?? ""),
            content: String(m?.content ?? ""),
          }))
          const picked = await pickBestCandidate(recents, requestId)
          if (picked.picked) {
            selectedStrategy = "time_capsule_force_recent"
            payload = picked.picked
            refId = String(picked.picked.id ?? "") || null
            if (debug) debugByUser.push({ user_id: userId, reason: `picked_recent:${picked.reason}`, strategy: selectedStrategy })
          } else if (debug) {
            debugByUser.push({ user_id: userId, reason: `no_good_recent:${picked.reason}`, strategy: "time_capsule_force_recent" })
          }
        }

        if (!selectedStrategy) {
          const reason = "no_candidate_data"
          if (debug || (force && (filterUserId || filterEmail))) {
            debugByUser.push({ user_id: userId, reason })
            console.log(`[trigger-memory-echo] request_id=${requestId} user_id=${userId} ${reason}`)
          }
          continue
        }

        // D. Decide whether to ask permission via template (window closed) or send immediately (window open).
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_opted_in, phone_invalid, whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", userId)
          .maybeSingle()

        const canWhatsapp = Boolean(profile && profile.whatsapp_opted_in && !profile.phone_invalid)
        const lastInbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
        const in24h = lastInbound != null && Date.now() - lastInbound <= 24 * 60 * 60 * 1000
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at ? new Date((profile as any).whatsapp_last_outbound_at).getTime() : null
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0)
        const quietOk = lastActivity > 0 ? (Date.now() - lastActivity >= quietMinutes * 60 * 1000) : true

        if (canWhatsapp && !in24h) {
          // Window closed: send template + create pending action, generate later on "Oui".
          try {
            const sendRes = await callWhatsappSend({
              user_id: userId,
              message: {
                type: "template",
                name: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_NAME") ?? "sophia_memory_echo_v1").trim(),
                language: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_LANG") ?? "fr").trim(),
              },
              purpose: "memory_echo",
              require_opted_in: true,
              force_template: true,
              metadata_extra: { source: "memory_echo", strategy: selectedStrategy },
            })

            await supabaseAdmin.from("whatsapp_pending_actions").insert({
              user_id: userId,
              kind: "memory_echo",
              status: "pending",
              payload: { strategy: selectedStrategy, data: payload },
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })

            // Count only if delivery wasn't skipped by whatsapp-send.
            if (!(sendRes as any)?.skipped) triggeredCount++
            if (debug) debugByUser.push({ user_id: userId, reason: "template_sent", strategy: selectedStrategy, whatsapp_send: sendRes })
          } catch (e) {
            // ignore user-level failures
            if (debug) debugByUser.push({ user_id: userId, reason: "template_send_failed", strategy: selectedStrategy })
          }
          continue
        }

        // D. Generate the Echo (window open, or WhatsApp not available -> we'll log in-app)
        const prompt = `
Tu es "L'Archiviste", une facette de Sophia.
Ton rôle est de reconnecter l'utilisateur avec son passé pour lui donner de la perspective.

IMPORTANT: ton message doit être VRAIMENT utile. Interdiction de choisir/mentionner un "salut ?", "ok", ou un ping banal.
Objectif: donner l'impression d'un vrai suivi (on n'en a pas reparlé récemment), sans être lourd ni culpabilisant.
TON (CRITIQUE): léger, chaleureux, pas dramatique. Tu prends des nouvelles avec tact.
- Ajoute 0 ou 1 smiley maximum (ex: 🙂), placé naturellement.
- Évite les guillemets et les termes trop cliniques ("hypervigilance", etc.). Préfère une paraphrase simple ("être sur ses gardes", "peur du regard").
- Ne fais pas une "grosse" discussion thérapeutique: juste un check-in doux + une question claire.
- Ne commence PAS par "Salut/Hello/Bonjour" (sauf si l'utilisateur vient de dire bonjour juste avant — sinon attaque direct).
- Ne fais PAS un rewind complet du sujet : fais juste une allusion courte au point, puis bascule sur le chemin parcouru / l'état actuel.
- Idée clé: "on en avait parlé il y a quelques mois" + "depuis, comment ça a bougé ?" plutôt que re-décrire le problème.

Stratégie: ${selectedStrategy}

Donnée sélectionnée (déjà filtrée): ${JSON.stringify(payload)}

CONSIGNES:
- Fais 1 à 2 petits paragraphes max.
- Dans le 1er: une allusion courte + date relative ("il y a 2-3 mois"). Maximum 1 phrase.
- Dans le 2e: une question simple et légère orientée progrès ("depuis, ça a bougé comment ?" / "tu te sens plus à l'aise sur ce point ?").
- Ton naturel, pas robot ("je repensais à un truc..." ok).
        `

        const echoMessage = await generateWithGemini(prompt, "Génère le message d'écho.", 0.7)

        // E. Send via WhatsApp if possible (text if window open, template fallback if closed).
        // Also ensure a DB log with metadata.source='memory_echo' for cooldown tracking.
        let sentViaWhatsapp = false
        try {
          // If user is active (recent inbound/outbound), defer the proactive message to avoid interrupting.
          if (canWhatsapp && in24h && !bypassQuiet && !quietOk) {
            const waitMs = Math.max(0, quietMinutes * 60 * 1000 - (Date.now() - lastActivity))
            const notBefore = new Date(Date.now() + waitMs).toISOString()
            const { error: pendErr } = await supabaseAdmin.from("whatsapp_pending_actions").insert({
              user_id: userId,
              kind: "deferred_send",
              status: "pending",
              payload: {
                purpose: "memory_echo",
                message: { type: "text", body: echoMessage },
                require_opted_in: true,
                metadata_extra: { source: "memory_echo", strategy: selectedStrategy, ref_id: refId || "unknown" },
              },
              not_before: notBefore,
              // keep a short expiry: if we can't deliver within 24h, we'd rather skip than surprise later
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })
            if (debug) {
              debugByUser.push({
                user_id: userId,
                reason: "deferred_due_to_recent_activity",
                strategy: selectedStrategy,
                error: pendErr ? { message: String(pendErr) } : { not_before: notBefore, quiet_minutes: quietMinutes, last_activity_minutes_ago: lastActivity ? minutes(Date.now() - lastActivity) : null },
              })
            }
            // Consider it "handled" for this run (we don't send now).
            continue
          }

          const sendRes = await callWhatsappSend({
            user_id: userId,
            message: { type: "text", body: echoMessage },
            purpose: "memory_echo",
            require_opted_in: true,
            metadata_extra: {
              source: "memory_echo",
              strategy: selectedStrategy,
              ref_id: refId || "unknown",
            },
          })
          sentViaWhatsapp = !(sendRes as any)?.skipped
          if (sentViaWhatsapp) triggeredCount++
          if (debug) debugByUser.push({ user_id: userId, reason: sentViaWhatsapp ? "text_sent" : "text_skipped", strategy: selectedStrategy, whatsapp_send: sendRes })
        } catch (e) {
          const status = (e as any)?.status
          const data = (e as any)?.data
          const msg = e instanceof Error ? e.message : String(e)
          // 429 throttle => skip this user this run
          if (status === 429) continue
          // 409 not opted in / phone invalid => fall back to in-app log
          sentViaWhatsapp = false
          if (debug) debugByUser.push({ user_id: userId, reason: "text_send_failed", strategy: selectedStrategy, error: { status: status ?? null, message: msg, data: data ?? null } })
        }

        if (!sentViaWhatsapp) {
          const { error: msgError } = await supabaseAdmin
              .from('chat_messages')
              .insert({
                  user_id: userId,
                  role: 'assistant',
                  content: echoMessage,
                  agent_used: 'philosopher', // Or a new 'archivist' agent
                  metadata: {
                      source: 'memory_echo',
                      strategy: selectedStrategy,
                      ref_id: refId || 'unknown'
                  }
              })

          if (!msgError) {
            triggeredCount++
            if (debug) debugByUser.push({ user_id: userId, reason: "in_app_logged", strategy: selectedStrategy })
          } else {
            if (debug) debugByUser.push({ user_id: userId, reason: "in_app_log_failed", strategy: selectedStrategy, error: { message: String(msgError) } })
          }
        }
    }

    console.log(`[trigger-memory-echo] request_id=${requestId} triggered=${triggeredCount}`)
    return jsonResponse(
      req,
      { success: true, triggered: triggeredCount, request_id: requestId, ...(debug ? { debug_by_user: debugByUser } : {}) },
      { includeCors: false },
    )

  } catch (error) {
    console.error(`[trigger-memory-echo] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})

