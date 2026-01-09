/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { retrieveContext } from './companion.ts' // Import retrieveContext to use RAG
import { verifyInvestigatorMessage } from '../verifier.ts'

function denoEnv(name: string): string | undefined {
  return (globalThis as any)?.Deno?.env?.get?.(name)
}

// --- OUTILS ---

const LOG_ACTION_TOOL = {
  name: "log_action_execution",
  description: "Enregistre le résultat d'une action, d'un framework ou d'un signe vital pour la journée.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "L'ID de l'action ou du signe vital." },
      item_type: { type: "STRING", enum: ["action", "vital", "framework"], description: "Type d'élément." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Résultat." },
      value: { type: "NUMBER", description: "Valeur numérique (pour les counters ou signes vitaux)." },
      note: { type: "STRING", description: "Raison de l'échec ou commentaire (ex: 'Trop fatigué', 'Super séance')." },
      share_insight: { type: "BOOLEAN", description: "True si l'utilisateur a partagé une info intéressante pour le coaching." }
    },
    required: ["item_id", "item_type", "status"]
  }
}

const ACTIVATE_ACTION_TOOL = {
  name: "activate_plan_action",
  description: "Active une action spécifique du plan qui était en attente (future). Vérifie d'abord si les phases précédentes sont complétées.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à activer." }
    },
    required: ["action_title_or_id"]
  }
}

const ARCHIVE_ACTION_TOOL = {
  name: "archive_plan_action",
  description: "Archive (désactive/supprime) une action du plan. À utiliser si l'utilisateur dit 'j'arrête le sport', 'supprime cette tâche', 'je ne veux plus faire ça'.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à archiver." },
      reason: { type: "STRING", description: "Raison de l'arrêt (ex: 'trop difficile', 'plus pertinent', 'n'aime pas'). Utile pour l'analyse future." }
    },
    required: ["action_title_or_id"]
  }
}

const BREAK_DOWN_ACTION_TOOL = {
  name: "break_down_action",
  description:
    "Génère une micro-étape (action intermédiaire) pour débloquer UNE action qui est ratée depuis plusieurs jours. À appeler uniquement si l'utilisateur accepte explicitement ('oui', 'ok', etc.).",
  parameters: {
    type: "OBJECT",
    properties: {
      problem: {
        type: "STRING",
        description:
          "Pourquoi ça bloque / ce que l'utilisateur dit (ex: 'pas le temps le soir', 'trop fatigué', 'j'oublie').",
      },
      apply_to_plan: {
        type: "BOOLEAN",
        description:
          "Si true, ajoute la micro-étape dans le plan actif (user_plans.content) et crée aussi la ligne user_actions correspondante.",
        default: true,
      },
    },
    required: ["problem"],
  },
}

// --- TYPES & STATE ---

interface CheckupItem {
  id: string
  type: 'action' | 'vital' | 'framework'
  title: string
  description?: string
  tracking_type: 'boolean' | 'counter'
  target?: number
  unit?: string
}

interface InvestigationState {
  status: 'init' | 'checking' | 'closing'
  pending_items: CheckupItem[]
  current_item_index: number
  temp_memory: any // Pour stocker des infos temporaires si besoin
}

// --- HELPERS ---

function isAffirmative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase()
  if (!t) return false
  return /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|let'?s go|carr[ée]|yep|yes)\b/i.test(t)
}

function isNegative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase()
  if (!t) return false
  return /\b(non|nope|nan|laisse|pas besoin|stop|on laisse|plus tard)\b/i.test(t)
}

function isExplicitStopBilan(text: string): boolean {
  const m = (text ?? "").toString().trim()
  if (!m) return false
  // IMPORTANT: Do NOT treat "plus tard / pas maintenant" as a stop.
  // Those are deferrals of a topic or an item and should be handled inside the checkup flow (parking-lot),
  // not as a cancellation of the whole bilan.
  return /\b(?:stop|pause|arr[êe]te|arr[êe]tons|annule|annulons|on\s+arr[êe]te|on\s+peut\s+arr[êe]ter|je\s+veux\s+arr[êe]ter|c['’]est\s+trop|c['’]est\s+lourd|arr[êe]te\s+le\s+bilan|stop\s+le\s+bilan|pas\s+de\s+bilan|on\s+arr[êe]te\s+le\s+bilan)\b/i.test(m)
}

function functionsBaseUrl(): string {
  const supabaseUrl = (denoEnv("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

function isoDay(d: Date): string {
  return d.toISOString().split("T")[0]
}

function addDays(day: string, delta: number): string {
  const [y, m, dd] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return isoDay(dt)
}

export async function getMissedStreakDays(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<number> {
  // We only count what we have actually logged. If a day has no entry, we don't assume "missed".
  const { data: entries, error } = await supabase
    .from("user_action_entries")
    .select("status, performed_at")
    .eq("user_id", userId)
    .eq("action_id", actionId)
    .order("performed_at", { ascending: false })
    .limit(30)

  if (error || !entries || entries.length === 0) return 0

  // Build latest status per day (most recent entry wins).
  const dayToStatus = new Map<string, string>()
  for (const e of entries as any[]) {
    const day = String(e.performed_at ?? "").split("T")[0]
    if (!day) continue
    if (!dayToStatus.has(day)) dayToStatus.set(day, String(e.status ?? ""))
  }

  const days = Array.from(dayToStatus.keys()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  if (days.length === 0) return 0

  let streak = 0
  let cursor = days[0]
  while (true) {
    const st = dayToStatus.get(cursor)
    if (st !== "missed") break
    streak += 1
    const prev = addDays(cursor, -1)
    if (!dayToStatus.has(prev)) break
    cursor = prev
  }
  return streak
}

export async function getCompletedStreakDays(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<number> {
  // We only count what we have actually logged. If a day has no entry, we don't assume "completed".
  const { data: entries, error } = await supabase
    .from("user_action_entries")
    .select("status, performed_at")
    .eq("user_id", userId)
    .eq("action_id", actionId)
    .order("performed_at", { ascending: false })
    .limit(30)

  if (error || !entries || entries.length === 0) return 0

  // Build latest status per day (most recent entry wins).
  const dayToStatus = new Map<string, string>()
  for (const e of entries as any[]) {
    const day = String(e.performed_at ?? "").split("T")[0]
    if (!day) continue
    if (!dayToStatus.has(day)) dayToStatus.set(day, String(e.status ?? ""))
  }

  const days = Array.from(dayToStatus.keys()).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  if (days.length === 0) return 0

  let streak = 0
  let cursor = days[0]
  while (true) {
    const st = dayToStatus.get(cursor)
    if (st !== "completed") break
    streak += 1
    const prev = addDays(cursor, -1)
    if (!dayToStatus.has(prev)) break
    cursor = prev
  }
  return streak
}

async function callBreakDownActionEdge(payload: unknown): Promise<any> {
  const url = `${functionsBaseUrl()}/functions/v1/break-down-action`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`break-down-action failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

function findAndInsertInPlanByTitle(planContent: any, targetTitle: string, newAction: any): { updated: any; inserted: boolean } {
  if (!planContent || typeof planContent !== "object") return { updated: planContent, inserted: false }
  const phases = (planContent as any)?.phases
  if (!Array.isArray(phases)) return { updated: planContent, inserted: false }

  const cloned = structuredClone(planContent)
  const phases2 = (cloned as any).phases
  for (const p of phases2) {
    const actions = p?.actions
    if (!Array.isArray(actions)) continue
    const idx = actions.findIndex((a: any) => String(a?.title ?? "").trim() === String(targetTitle ?? "").trim())
    if (idx >= 0) {
      actions.splice(idx, 0, newAction)
      return { updated: cloned, inserted: true }
    }
  }
  return { updated: planContent, inserted: false }
}

async function fetchActivePlanRow(supabase: SupabaseClient, userId: string) {
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

async function fetchActionRowById(supabase: SupabaseClient, userId: string, actionId: string) {
  const { data: actionRow, error } = await supabase
    .from("user_actions")
    .select("id, plan_id, submission_id, title, description, tracking_type, time_of_day, target_reps")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return actionRow as any
}

async function commitIntermediateStep(
  supabase: SupabaseClient,
  userId: string,
  baseActionRow: any,
  planRow: any,
  newAction: any,
  applyToPlan: boolean,
): Promise<{ appliedToPlan: boolean; createdRow: boolean }> {
  let appliedToPlan = false
  let createdRow = false

  // 1) Update plan JSON (best effort)
  if (applyToPlan && planRow?.id && planRow?.content && baseActionRow?.title) {
    const { updated, inserted } = findAndInsertInPlanByTitle(planRow.content, baseActionRow.title, newAction)
    if (inserted) {
      const { error: upErr } = await supabase.from("user_plans").update({ content: updated }).eq("id", planRow.id)
      if (!upErr) appliedToPlan = true
      else console.error("[Investigator] Failed to update plan content for breakdown:", upErr)
    }
  }

  // 2) Create tracking row in DB
  const rawType = String(newAction?.type ?? "mission")
  const trackingType = String(newAction?.tracking_type ?? baseActionRow?.tracking_type ?? "boolean")
  const timeOfDay = String(newAction?.time_of_day ?? baseActionRow?.time_of_day ?? "any_time")
  const targetReps = Number(newAction?.targetReps ?? 1) || 1

  const planId = baseActionRow?.plan_id ?? planRow?.id
  const submissionId = baseActionRow?.submission_id ?? planRow?.submission_id ?? null
  if (!planId) return { appliedToPlan, createdRow: false }

  if (rawType === "framework") {
    const fwType = String(newAction?.frameworkDetails?.type ?? "one_shot")
    const { error: fwErr } = await supabase.from("user_framework_tracking").insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      action_id: String(newAction?.id ?? `inter_${Date.now()}`),
      title: String(newAction?.title ?? "Micro-étape"),
      type: fwType,
      target_reps: targetReps,
      current_reps: 0,
      status: "active",
      tracking_type: trackingType,
      last_performed_at: null,
    })
    if (fwErr) console.error("[Investigator] Failed to insert breakdown user_framework_tracking:", fwErr)
    else createdRow = true
  } else {
    // user_actions only supports mission/habit (not "habitude")
    const dbType = rawType === "habitude" ? "habit" : "mission"
    const { error: insErr } = await supabase.from("user_actions").insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      type: dbType,
      title: String(newAction?.title ?? "Micro-étape"),
      description: String(newAction?.description ?? "Micro-étape pour débloquer l'action."),
      target_reps: targetReps,
      current_reps: 0,
      status: "active",
      tracking_type: trackingType,
      time_of_day: timeOfDay,
    })
    if (insErr) console.error("[Investigator] Failed to insert breakdown user_action:", insErr)
    else createdRow = true
  }

  return { appliedToPlan, createdRow }
}

async function getItemHistory(supabase: SupabaseClient, userId: string, itemId: string, itemType: 'action' | 'vital' | 'framework', currentContext: string = ""): Promise<string> {
    let historyText = "";

    // 1. Chronologique (Le plus récent)
    if (itemType === 'action') {
        const { data: entries } = await supabase
            .from('user_action_entries')
            .select('status, note, performed_at')
            .eq('user_id', userId)
            .eq('action_id', itemId)
            .order('performed_at', { ascending: false })
            .limit(5)
        
        if (entries && entries.length > 0) {
            historyText += "DERNIERS ENREGISTREMENTS CHRONOLOGIQUES :\n"
            historyText += entries.map(e => {
                const date = new Date(e.performed_at).toLocaleDateString('fr-FR')
                const status = e.status === 'completed' ? '✅ Fait' : '❌ Non fait'
                return `- ${date} : ${status} ${e.note ? `(Note: "${e.note}")` : ''}`
            }).join('\n')
            historyText += "\n\n"
        }
    } else if (itemType === 'vital') {
         const { data: entries } = await supabase
            .from('user_vital_sign_entries')
            .select('value, recorded_at')
            .eq('user_id', userId)
            .eq('vital_sign_id', itemId)
            .order('recorded_at', { ascending: false })
            .limit(5)

         if (entries && entries.length > 0) {
             historyText += "DERNIÈRES MESURES :\n"
             historyText += entries.map(e => {
                 const date = new Date(e.recorded_at).toLocaleDateString('fr-FR')
                 return `- ${date} : ${e.value}`
             }).join('\n')
             historyText += "\n\n"
         }
    } else if (itemType === 'framework') {
        // Frameworks usually use user_framework_entries (JSON content) or potentially user_action_entries if migrated
        // For now, let's assume no deep history available for simple checkup, or try to fetch user_framework_entries
        // We can check last_performed_at from tracking table via separate query, but here we want logs.
        // Let's keep it simple for now.
    }

    // 2. Vectoriel / Sémantique (Patterns récurrents)
    if (itemType === 'action') {
        try {
            const query = "Difficulté, échec, raison, note importante";
            const embedding = await generateEmbedding(query);
            
            const { data: similarEntries } = await supabase.rpc('match_action_entries', {
                query_embedding: embedding,
                match_threshold: 0.5, 
                match_count: 3,
                filter_action_id: itemId
            });

            if (similarEntries && similarEntries.length > 0) {
                historyText += "INSIGHTS / RÉCURRENCES (RAG) :\n"
                historyText += similarEntries.map((e: any) => {
                     const date = new Date(e.performed_at).toLocaleDateString('fr-FR')
                     return `- [${date}] ${e.status} : "${e.note || 'Pas de note'}" (Sim: ${Math.round(e.similarity * 100)}%)`
                }).join('\n')
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

    return historyText || "Aucun historique disponible.";
}

export async function getYesterdayCheckupSummary(supabase: SupabaseClient, userId: string): Promise<{
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
        const key =
          lowered.includes("fatigu") ? "fatigue" :
          lowered.includes("temps") ? "manque de temps" :
          lowered.includes("oubli") ? "oubli" :
          lowered.includes("motivation") ? "motivation" :
          raw.slice(0, 80)
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

async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<CheckupItem[]> {
    // Bilan = on check les items actifs du PLAN COURANT (pas des anciens plans),
    // et on applique une logique "dernier check il y a >18h" pour éviter de re-demander.
    const planRow = await fetchActivePlanRow(supabase, userId).catch(() => null)
    const planId = planRow?.id as string | undefined

    // Règle des 18h : Si last_performed_at / last_checked_at > 18h ago, on doit checker.
    const now = new Date()
    const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

    const pending: CheckupItem[] = []

    // 1. Fetch Actions (plan courant uniquement)
    const actionsQ = supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
    const { data: actions } = planId ? await actionsQ.eq('plan_id', planId) : await actionsQ

    // 2. Fetch Vital Signs (plan courant si possible)
    const vitalsQ = supabase
        .from('user_vital_signs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
    const { data: vitals } = planId ? await vitalsQ.eq('plan_id', planId) : await vitalsQ

    // 3. Fetch Frameworks (plan courant uniquement)
    const fwQ = supabase
        .from('user_framework_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
    const { data: frameworks } = planId ? await fwQ.eq('plan_id', planId) : await fwQ

    // Apply 18h Logic
    actions?.forEach(a => {
        const lastPerformedDate = a.last_performed_at ? new Date(a.last_performed_at) : null
        // Si jamais fait (null) OU fait il y a plus de 18h -> On ajoute
        if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
            pending.push({
                id: a.id,
                type: 'action',
                title: a.title,
                description: a.description,
                tracking_type: a.tracking_type,
                target: a.target_reps
            })
        }
    })

    vitals?.forEach(v => {
        const lastCheckedDate = v.last_checked_at ? new Date(v.last_checked_at) : null
        if (!lastCheckedDate || lastCheckedDate < eighteenHoursAgo) {
            pending.push({
                id: v.id,
                type: 'vital',
                title: v.label || v.name, 
                tracking_type: 'counter', 
                unit: v.unit
            })
        }
    })

    frameworks?.forEach(f => {
        const lastPerformedDate = f.last_performed_at ? new Date(f.last_performed_at) : null
        if (!lastPerformedDate || lastPerformedDate < eighteenHoursAgo) {
            pending.push({
                id: f.id,
                type: 'framework',
                title: f.title, 
                tracking_type: 'boolean', // Usually frameworks are boolean completion for daily check
            })
        }
    })

    // Tri : Vitals d'abord, puis Actions, puis Frameworks
    return pending.sort((a, b) => {
        const typeOrder = { 'vital': 0, 'action': 1, 'framework': 2 }
        return typeOrder[a.type] - typeOrder[b.type]
    })
}

async function logItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
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

    if (item_type === 'action') {
        // Update Action Stats & Log Entry
        if (status === 'completed') {
             // 1. Fetch current state to check 18h rule & increment reps
             const { data: action } = await supabase
                .from('user_actions')
                .select('last_performed_at, current_reps')
                .eq('id', item_id)
                .single()
             
             const lastPerformedDate = action?.last_performed_at ? new Date(action.last_performed_at) : null
             const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)
             
             // Check 18h rule : Si fait il y a moins de 18h, on ne re-log pas (doublon)
             if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
                 console.log(`[Investigator] Action ${item_id} performed recently (${action?.last_performed_at}), skipping update & log.`)
                 return "Logged (Skipped duplicate)"
             }
             
             // Increment Reps (Si pas skipped)
             const newReps = (action?.current_reps || 0) + 1
             
             await supabase.from('user_actions').update({
                 last_performed_at: now.toISOString(),
                 current_reps: newReps
             }).eq('id', item_id)

             console.log(`[Investigator] Incremented reps for ${item_id} to ${newReps}`)
        }
             // Log Entry
             const { error: logError } = await supabase.from('user_action_entries').insert({
                user_id: userId,
                action_id: item_id,
                action_title: item_title,
                status: status,
                value: value,
                note: note,
                performed_at: now.toISOString(),
                embedding: embedding
            })

            if (logError) {
                console.error("[Investigator] ❌ Log Entry Error:", logError)
            } else {
                console.log("[Investigator] ✅ Entry logged successfully")
            }
        
    } else if (item_type === 'vital') {
        // Vital Sign
        await supabase.from('user_vital_signs').update({
             current_value: String(value),
             last_checked_at: new Date().toISOString()
        }).eq('id', item_id)

        const { data: vital } = await supabase.from('user_vital_signs').select('plan_id, submission_id').eq('id', item_id).single()

        await supabase.from('user_vital_sign_entries').insert({
            user_id: userId,
            vital_sign_id: item_id,
            plan_id: vital?.plan_id,
            submission_id: vital?.submission_id,
            value: String(value),
            title: item_title, // Ajout du titre
            note: note, // Ajout de la note
            recorded_at: new Date().toISOString(),
            embedding: embedding 
        })
    } else if (item_type === 'framework') {
        // Framework Tracking
        if (status === 'completed') {
             const { data: fw } = await supabase
                .from('user_framework_tracking')
                .select('last_performed_at, current_reps, action_id, plan_id, title')
                .eq('id', item_id)
                .single()
             
             const lastPerformedDate = fw?.last_performed_at ? new Date(fw.last_performed_at) : null
             const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)
             
             if (lastPerformedDate && lastPerformedDate > eighteenHoursAgo) {
                 console.log(`[Investigator] Framework ${item_id} performed recently, skipping update.`)
                 return "Logged (Skipped duplicate)"
             }
             
             const newReps = (fw?.current_reps || 0) + 1
             
             await supabase.from('user_framework_tracking').update({
                 last_performed_at: now.toISOString(),
                 current_reps: newReps
             }).eq('id', item_id)

             // Insert into user_framework_entries
             // Note: user_framework_entries requires 'content' (jsonb). We create a minimal entry.
             // Also requires framework_title, framework_type. We might not have 'type' easily here if checkup item structure didn't carry it.
             // But we have 'title' in args.
             
             // Ideally we should have passed more info in CheckupItem, but for now we do best effort.
             // We use action_id from tracking table because entries link via action_id string + plan_id.
             
             await supabase.from('user_framework_entries').insert({
                 user_id: userId,
                 plan_id: fw?.plan_id,
                 action_id: fw?.action_id, // This is the string ID
                 framework_title: fw?.title,
                 framework_type: 'unknown', // We miss this in tracking table? tracking has 'type'.
                 content: { status: status, note: note, checkup: true },
                 created_at: now.toISOString()
             })
        } else {
             // Missed framework
             // We still log it? user_framework_entries is usually for content. 
             // If missed, maybe we don't log to entries, or we log a "missed" entry.
             // Let's log it for consistency.
             const { data: fw } = await supabase.from('user_framework_tracking').select('action_id, plan_id, title').eq('id', item_id).single()

             await supabase.from('user_framework_entries').insert({
                 user_id: userId,
                 plan_id: fw?.plan_id,
                 action_id: fw?.action_id,
                 framework_title: fw?.title || item_title,
                 framework_type: 'unknown',
                 content: { status: status, note: note, checkup: true },
                 created_at: now.toISOString()
             })
        }
    }

    return "Logged"
}

// Exposed for deterministic tool testing (DB writes). This does not change runtime behavior.
export async function megaTestLogItem(supabase: SupabaseClient, userId: string, args: any): Promise<string> {
    return await logItem(supabase, userId, args)
}

// --- HELPER WRAPPER ---
async function handleArchiveAction(
    supabase: SupabaseClient, 
    userId: string, 
    args: any
): Promise<string> {
    const planRow = await fetchActivePlanRow(supabase, userId)
    if (!planRow) return "Je ne trouve pas de plan actif."
    
    const { action_title_or_id, reason } = args
    const searchTerm = (action_title_or_id || "").trim()
    
    const { data: action } = await supabase
        .from('user_actions')
        .select('id, title')
        .eq('plan_id', planRow.id)
        .ilike('title', searchTerm)
        .maybeSingle()
    
    if (action) {
        await supabase.from('user_actions').update({ status: 'archived' }).eq('id', action.id)
        return `C'est fait. J'ai retiré l'action "${action.title}" du plan.`
    }
    
    const { data: fw } = await supabase
        .from('user_framework_tracking')
        .select('id, title')
        .eq('plan_id', planRow.id)
        .ilike('title', searchTerm)
        .maybeSingle()
        
    if (fw) {
        await supabase.from('user_framework_tracking').update({ status: 'archived' }).eq('id', fw.id)
        return `C'est fait. J'ai retiré l'exercice "${fw.title}" du plan.`
    }
    
    return `Je ne trouve pas "${action_title_or_id}" dans ton plan.`
}

// --- LEVEL UP LOGIC ---

async function checkAndHandleLevelUp(
  supabase: SupabaseClient, 
  userId: string, 
  actionId: string
): Promise<{ leveledUp: boolean; oldAction?: any; newAction?: any }> {
  // 1. Get current action details
  const { data: action, error } = await supabase
    .from('user_actions')
    .select('id, plan_id, title, current_reps, target_reps, status')
    .eq('id', actionId)
    .single()

  if (error || !action) return { leveledUp: false }

  // 2. Check if target reached
  const current = action.current_reps || 0
  const target = action.target_reps || 1

  // On trigger SEULEMENT si on vient de dépasser ou atteindre la cible (et qu'on était pas déjà completed avant le log, 
  // mais ici status est probablement encore 'active' car logItem n'a pas changé le status table user_actions, juste les reps).
  // logItem ne change pas le status 'active' -> 'completed' dans user_actions (il change user_action_entries).
  // Donc si current >= target, c'est qu'on vient de le finir.
  
  if (current >= target) {
    console.log(`[Investigator] 🚀 LEVEL UP DETECTED for action ${actionId} (${current}/${target})`)

    // 3. Mark current as completed (so it stops appearing in daily check)
    // We update status to 'completed'
    await supabase.from('user_actions').update({ status: 'completed' }).eq('id', actionId)

    // 4. Find next pending action in the same plan
    // On suppose l'ordre de création (ou on pourrait avoir un champ 'rank', mais created_at est un bon proxy pour l'instant)
    const { data: nextActions } = await supabase
      .from('user_actions')
      .select('id, title, description')
      .eq('plan_id', action.plan_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }) 
      .limit(1)

    if (nextActions && nextActions.length > 0) {
      const nextAction = nextActions[0]
      // 5. Activate it
      await supabase.from('user_actions').update({ status: 'active' }).eq('id', nextAction.id)
      console.log(`[Investigator] 🔓 Unlocked next action: ${nextAction.title}`)
      
      return { leveledUp: true, oldAction: action, newAction: nextAction }
    } else {
      // No next action? Just mark completed.
      console.log(`[Investigator] 🏁 No next action found. Plan completed?`)
      return { leveledUp: true, oldAction: action, newAction: null }
    }
  }

  return { leveledUp: false }
}

// --- MAIN FUNCTION ---

function normalizeChatText(text: unknown): string {
  // Some model outputs include the literal characters "\n" instead of real newlines.
  return (text ?? "").toString().replace(/\\n/g, "\n").replace(/\*\*/g, "").trim()
}

function isMegaTestMode(meta?: { forceRealAi?: boolean }): boolean {
  return (denoEnv("MEGA_TEST_MODE") ?? "").trim() === "1" && !meta?.forceRealAi
}

async function investigatorSay(
  scenario: string,
  data: unknown,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string },
  opts?: { temperature?: number },
): Promise<string> {
  if (isMegaTestMode(meta)) {
    // Deterministic text for offline tests (avoid LLM dependency).
    return `(${scenario})`
  }

  const basePrompt = `
Tu es Sophia (Mode : Investigateur / Bilan).
Tu réponds en français, en tutoyant.
Objectif: être naturel(le) et fluide, même si l’utilisateur digresse, tout en gardant le fil du bilan.

    RÈGLES DE STYLE (OBLIGATOIRES):
    - Pas de message "en dur" robotique: réagis brièvement au message user si nécessaire, puis enchaîne.
    - Une seule question à la fois.
    - Interdiction absolue de dire "bonjour", "salut", "hello" (sauf historique vide — mais ici, évite).
    - Interdiction formelle d’utiliser du gras (pas d’astérisques **).
    - Maximum 2 emojis (0-1 recommandé).
    - Output: uniquement du texte brut (pas de JSON).
    - INTERDICTION d'utiliser des termes techniques internes (ex: "logs", "input", "database", "variable", "JSON"). Dis "bilan", "réponses", "notes" à la place.

    ${(scenario.includes("end_checkup") || scenario.endsWith("_end")) ? `
    INSTRUCTIONS CRITIQUES POUR LA FIN DU BILAN :
    1. Le bilan est terminé. Ne pose plus AUCUNE question de suivi (pas de "Bilan des réussites", pas de "Récap", rien).
    2. Valide brièvement la fin de l'exercice (ou la création de la micro-étape si pertinent).
    3. TA SEULE MISSION est d'ouvrir la discussion vers autre chose.
    4.     TU DOIS POSER CETTE QUESTION (ou une variation proche) : "Est-ce que tu veux qu'on parle de quelque chose en particulier ?" ou "Est-ce que tu veux me parler de quelque chose d'autres ?".
    ` : ""}

    ${scenario === "level_up" ? `
    SCÉNARIO SPÉCIAL : LEVEL UP (OBJECTIF ATTEINT)
    L'utilisateur vient de valider son action et a atteint le nombre de répétitions visé.
    1. FÉLICITE-LE chaleureusement (mais reste authentique, pas 'commercial').
    2. ANNONCE que cette action est validée/acquise ("On valide ça, c'est dans la poche").
    3. ANNONCE la prochaine action qui se débloque (si 'new_action' est présent dans les données).
       Exemple : "Du coup, ça débloque la suite du plan : [Titre de la nouvelle action]. Prêt à l'attaquer dès demain ?"
    4. Si pas de nouvelle action, célèbre juste la victoire.
    ` : ""}

    RÈGLE DU MIROIR (RADICALITÉ BIENVEILLANTE) :
    - Tu n'es pas là pour être gentil, tu es là pour être lucide.
    - Si l'utilisateur te donne une excuse générique ("pas le temps", "fatigué") pour la 3ème fois de suite : NE VALIDE PAS AVEUGLÉMENT.
    - Fais-lui remarquer le pattern gentiment mais fermement.
    - Exemple : "Ça fait 3 jours que c'est la course. C'est vraiment le temps qui manque, ou c'est juste que cette action t'ennuie ?"
    - Ton but est de percer l'abcès, pas de mettre un pansement.

SCÉNARIO: ${scenario}
DONNÉES (JSON): ${JSON.stringify(data)}
  `.trim()

  const systemPrompt = basePrompt

  const res = await generateWithGemini(
    systemPrompt,
    "Rédige le prochain message à envoyer à l’utilisateur.",
    opts?.temperature ?? 0.6,
    false,
    [],
    "auto",
    {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-3-flash-preview",
      source: `sophia-brain:investigator_copy:${scenario}`,
      forceRealAi: meta?.forceRealAi,
    },
  )

  const base = normalizeChatText(res)
  const verified = await verifyInvestigatorMessage({
    draft: base,
    scenario,
    data,
    meta: { ...meta, userId: undefined }, // no userId here; keep verifier stateless
  })
  return verified.text
}

export async function maybeHandleStreakAfterLog(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  currentState: InvestigationState
  currentItem: CheckupItem
  argsWithId: { status: string; note?: string | null }
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<null | { content: string; investigationComplete: boolean; newState: any }> {
  const { supabase, userId, message, currentState, currentItem, argsWithId, meta } = opts

  // If completed and streak>=3: congratulate BEFORE moving on.
  if (currentItem.type === "action" && argsWithId.status === "completed") {
    try {
      const winStreak = await getCompletedStreakDays(supabase, userId, currentItem.id)
      if (winStreak >= 3) {
        const nextIndex = currentState.current_item_index + 1
        const nextState = {
          ...currentState,
          current_item_index: nextIndex,
        }

        if (nextIndex >= currentState.pending_items.length) {
          return {
            content: await investigatorSay(
              "win_streak_end",
              { user_message: message, win_streak_days: winStreak, item: currentItem, last_item_log: argsWithId, channel: meta?.channel },
              meta,
            ),
            investigationComplete: true,
            newState: null,
          }
        }

        const nextItem = currentState.pending_items[nextIndex]
        return {
          content: await investigatorSay(
            "win_streak_continue",
            { user_message: message, win_streak_days: winStreak, item: currentItem, last_item_log: argsWithId, next_item: nextItem },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }
    } catch (e) {
      console.error("[Investigator] completed streak check failed after completed log:", e)
    }
  }

  // If missed and streak>=5: propose breakdown flow BEFORE moving on.
  if (currentItem.type === "action" && argsWithId.status === "missed") {
    try {
      const streak = await getMissedStreakDays(supabase, userId, currentItem.id)
      if (streak >= 5) {
        const nextState = {
          ...currentState,
          temp_memory: {
            ...(currentState.temp_memory || {}),
            breakdown: {
              stage: "awaiting_consent",
              action_id: currentItem.id,
              action_title: currentItem.title,
              streak_days: streak,
              last_note: String(argsWithId.note ?? "").trim(),
            },
          },
        }
        return {
          content: await investigatorSay(
            "missed_streak_offer_breakdown",
            { user_message: message, streak_days: streak, item: currentItem, last_note: String(argsWithId.note ?? "").trim() },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }
    } catch (e) {
      console.error("[Investigator] streak check failed after missed log:", e)
    }
  }

  return null
}

export async function runInvestigator(
  supabase: SupabaseClient, 
  userId: string, 
  message: string, 
  history: any[],
  state: any,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<{ content: string, investigationComplete: boolean, newState: any }> {

  // 1. INIT STATE
  let currentState: InvestigationState = state || {
      status: 'init',
      pending_items: [],
      current_item_index: 0,
      temp_memory: {}
  }

  // If the user explicitly wants to stop the bilan, comply immediately (no persuasion).
  if (currentState?.status === "checking" && isExplicitStopBilan(message)) {
    return {
      content: await investigatorSay(
        "user_stopped_checkup",
        { user_message: message, channel: meta?.channel, recent_history: history.slice(-3) },
        meta,
      ),
      investigationComplete: true,
      newState: null,
    }
  }

  // Si c'est le tout début, on charge les items
  if (currentState.status === 'init') {
      const items = await getPendingItems(supabase, userId)
      if (items.length === 0) {
          return {
              content: await investigatorSay("no_pending_items", { user_message: message, channel: meta?.channel }, meta),
              investigationComplete: true,
              newState: null
          }
      }
      // Déterminer day_scope en fonction de l'heure
      // Si > 17h, on check probablement la journée en cours ("today").
      // Sinon (matin), on check probablement la veille ("yesterday").
      const parisHour = new Date(new Date().getTime() + 1 * 60 * 60 * 1000).getUTCHours();
      const initialDayScope = parisHour >= 17 ? "today" : "yesterday";

      currentState = {
          status: 'checking',
          pending_items: items,
          current_item_index: 0,
          // locked_pending_items avoids pulling extra items mid-checkup (more stable UX).
          temp_memory: { opening_done: false, locked_pending_items: true, day_scope: initialDayScope }
      }
  }

  // Soft, personalized opening (before the very first question)
  if (currentState?.status === "checking" && currentState.current_item_index === 0 && currentState?.temp_memory?.opening_done !== true) {
    try {
      const summary = await getYesterdayCheckupSummary(supabase, userId)
      const currentItem0 = currentState.pending_items[0]

      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      const openingText = await investigatorSay(
        "opening_first_item",
        {
          user_message: message,
          channel: meta?.channel,
          summary_yesterday: summary,
          first_item: currentItem0,
          recent_history: history.slice(-3),
        },
        meta,
      )
      return { content: openingText, investigationComplete: false, newState: nextState }
    } catch (e) {
      console.error("[Investigator] opening summary failed:", e)
      const currentItem0 = currentState.pending_items[0]
      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      // Fallback plus engageant
      const dayScope = String(currentState?.temp_memory?.day_scope ?? "yesterday")
      const dayRef = dayScope === "today" ? "aujourd’hui" : "hier"
      const openingText = `Prêt pour le check ${dayRef} ? On regarde ça ensemble. Pour commencer : ${currentItem0.title}.`
      
      return { content: openingText, investigationComplete: false, newState: nextState }
    }
  }

  // 2. CHECK SI FINI
  if (currentState.current_item_index >= currentState.pending_items.length) {
       // If the checkup list is locked, we ALWAYS close cleanly (no "surprise" extra items).
       if (currentState?.temp_memory?.locked_pending_items === true) {
         return {
           content: await investigatorSay(
             "end_checkup_no_more_items",
             { user_message: message, channel: meta?.channel, recent_history: history.slice(-3) },
             meta,
           ),
           investigationComplete: true,
           newState: null,
         }
       }

       // Otherwise (legacy behavior): scan for new pending items.
       console.log("[Investigator] End of list reached. Scanning for new pending items...")
       const freshItems = await getPendingItems(supabase, userId)
       if (freshItems.length > 0) {
         console.log(`[Investigator] Found ${freshItems.length} new items. Extending session.`)
         currentState.pending_items = [...currentState.pending_items, ...freshItems]
       } else {
         return {
           content: await investigatorSay(
             "end_checkup_no_more_items",
             { user_message: message, channel: meta?.channel, recent_history: history.slice(-3) },
             meta,
           ),
           investigationComplete: true,
           newState: null,
         }
       }
  }

  // 3. ITEM COURANT
  const currentItem = currentState.pending_items[currentState.current_item_index]

  // NOTE: Parking-lot (post-bilan) state machine lives in router.ts.
  // Investigator only handles bilan items; it may store potential deferred topics in temp_memory if asked by the router logic.
  
  // --- BREAKDOWN STATE MACHINE (after user said "oui" etc.) ---
  const breakdown = currentState?.temp_memory?.breakdown
  const breakdownStage = breakdown?.stage as string | undefined
  const breakdownActionId = breakdown?.action_id as string | undefined

  if (breakdownStage && breakdownActionId && currentItem?.type === "action" && currentItem.id === breakdownActionId) {
    // 1) Wait for consent
    if (breakdownStage === "awaiting_consent") {
      if (isAffirmative(message)) {
        const nextState = {
          ...currentState,
          temp_memory: {
            ...(currentState.temp_memory || {}),
            breakdown: { ...breakdown, stage: "awaiting_blocker" },
          },
        }
        return {
          content: await investigatorSay(
            "breakdown_ask_blocker",
            { user_message: message, action_title: breakdown?.action_title ?? currentItem.title, streak_days: breakdown?.streak_days },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }
      if (isNegative(message)) {
        // user declined -> resume checkup by moving to next item
        const nextIndex = currentState.current_item_index + 1
        const cleaned = {
          ...currentState,
          current_item_index: nextIndex,
          temp_memory: { ...(currentState.temp_memory || {}), breakdown: null },
        }
        if (nextIndex >= currentState.pending_items.length) {
          return {
            content: await investigatorSay("breakdown_declined_end", { user_message: message, channel: meta?.channel }, meta),
            investigationComplete: true,
            newState: null,
          }
        }
        const nextItem = currentState.pending_items[nextIndex]
        return {
          content: await investigatorSay("breakdown_declined_continue", { user_message: message, next_item: nextItem }, meta),
          investigationComplete: false,
          newState: cleaned,
        }
      }
      return {
        content: await investigatorSay(
          "breakdown_reprompt_consent",
          { user_message: message, action_title: breakdown?.action_title ?? currentItem.title, streak_days: breakdown?.streak_days },
          meta,
        ),
        investigationComplete: false,
        newState: currentState,
      }
    }

    // 2) Collect blocker, then generate a proposed step (but do NOT write it yet)
    if (breakdownStage === "awaiting_blocker") {
      try {
        const problem = String(message ?? "").trim()
        if (!problem) {
          return {
            content: await investigatorSay(
              "breakdown_missing_problem",
              { user_message: message, action_title: breakdown?.action_title ?? currentItem.title },
              meta,
            ),
            investigationComplete: false,
            newState: currentState,
          }
        }

        const planRow = await fetchActivePlanRow(supabase, userId)
        const actionRow = await fetchActionRowById(supabase, userId, currentItem.id)
        const helpingAction = {
          title: actionRow?.title ?? currentItem.title,
          description: actionRow?.description ?? currentItem.description ?? "",
          tracking_type: actionRow?.tracking_type ?? currentItem.tracking_type ?? "boolean",
          time_of_day: actionRow?.time_of_day ?? "any_time",
          targetReps: actionRow?.target_reps ?? currentItem.target ?? 1,
        }

        const proposed = await callBreakDownActionEdge({
          action: helpingAction,
          problem,
          plan: planRow?.content ?? null,
          submissionId: planRow?.submission_id ?? actionRow?.submission_id ?? null,
        })

        const nextState = {
          ...currentState,
          temp_memory: {
            ...(currentState.temp_memory || {}),
            breakdown: {
              ...breakdown,
              stage: "awaiting_accept",
              problem,
              proposed_action: proposed,
            },
          },
        }

        const stepTitle = String(proposed?.title ?? "Micro-étape").trim()
        const stepDesc = String(proposed?.description ?? "").trim()
        const tip = String(proposed?.tips ?? "").trim()

        return {
          content: await investigatorSay(
            "breakdown_propose_step",
            {
              user_message: message,
              action_title: breakdown?.action_title ?? currentItem.title,
              problem,
              proposed_step: { title: stepTitle, description: stepDesc, tip },
            },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] breakdown proposal failed:", e)
        return {
          content: await investigatorSay(
            "breakdown_proposal_error",
            { user_message: message, error: msg, action_title: breakdown?.action_title ?? currentItem.title },
            meta,
          ),
          investigationComplete: false,
          newState: currentState,
        }
      }
    }

    // 3) Accept / decline the proposed step -> commit only on explicit yes
    if (breakdownStage === "awaiting_accept") {
      const proposed = breakdown?.proposed_action
      if (!proposed) {
        const nextState = {
          ...currentState,
          temp_memory: { ...(currentState.temp_memory || {}), breakdown: { ...breakdown, stage: "awaiting_blocker" } },
        }
        return {
          content: await investigatorSay(
            "breakdown_missing_proposed_step",
            { user_message: message, action_title: breakdown?.action_title ?? currentItem.title },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }

      if (isAffirmative(message)) {
        try {
          const planRow = await fetchActivePlanRow(supabase, userId)
          const actionRow = await fetchActionRowById(supabase, userId, currentItem.id)
          const applyToPlan = breakdown?.apply_to_plan !== false
          await commitIntermediateStep(supabase, userId, actionRow, planRow, proposed, applyToPlan)

          // Clear breakdown flow and resume checkup (move to next item)
          const nextIndex = currentState.current_item_index + 1
          const nextState = {
            ...currentState,
            current_item_index: nextIndex,
            temp_memory: { ...(currentState.temp_memory || {}), breakdown: null },
          }

          if (nextIndex >= currentState.pending_items.length) {
            return {
              content: await investigatorSay(
                "breakdown_committed_end",
                { user_message: message, created_step: proposed, channel: meta?.channel },
                meta,
              ),
              investigationComplete: true,
              newState: null,
            }
          }
          const nextItem = currentState.pending_items[nextIndex]
          return {
            content: await investigatorSay(
              "breakdown_committed_continue",
              { user_message: message, created_step: proposed, next_item: nextItem },
              meta,
            ),
            investigationComplete: false,
            newState: nextState,
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error("[Investigator] breakdown commit failed:", e)
          return {
            content: await investigatorSay(
              "breakdown_commit_error",
              { user_message: message, error: msg, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
              meta,
            ),
            investigationComplete: false,
            newState: currentState,
          }
        }
      }

      if (isNegative(message)) {
        const nextState = {
          ...currentState,
          temp_memory: { ...(currentState.temp_memory || {}), breakdown: { ...breakdown, stage: "awaiting_blocker", proposed_action: null } },
        }
        return {
          content: await investigatorSay(
            "breakdown_decline_ask_adjust",
            { user_message: message, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      }

      return {
        content: await investigatorSay(
          "breakdown_reprompt_accept",
          { user_message: message, proposed_step: proposed, action_title: breakdown?.action_title ?? currentItem.title },
          meta,
        ),
        investigationComplete: false,
        newState: currentState,
      }
    }
  }

  // RAG : Récupérer l'historique de cet item
  const itemHistory = await getItemHistory(supabase, userId, currentItem.id, currentItem.type)

  // RAG : Récupérer le contexte général (Memories + Insights)
  const generalContext = await retrieveContext(supabase, message)

  // 4. GENERATE RESPONSE / TOOL CALL
  
  const basePrompt = `
    Tu es Sophia (Mode : Investigateur / Bilan).
    Ton but : Faire le point sur les actions du jour avec l'utilisateur.
    Ton ton : Bienveillant, curieux, jamais dans le jugement, mais précis.
    
    RÈGLE ABSOLUE : TU TUTOIES L'UTILISATEUR. JAMAIS DE VOUVOIEMENT.
    Tu es sa partenaire, pas son médecin ou son patron.

    ITEM ACTUEL À VÉRIFIER :
    - Type : ${currentItem.type === 'vital' ? 'Signe Vital (KPI)' : (currentItem.type === 'framework' ? 'Exercice / Framework' : 'Action / Habitude')}
    - Titre : "${currentItem.title}"
    - Description : "${currentItem.description || ''}"
    - Tracking : ${currentItem.tracking_type} ${currentItem.unit ? `(Unité: ${currentItem.unit})` : ''}

    HISTORIQUE RÉCENT SUR CET ITEM (RAG) :
    ${itemHistory}
    (Utilise ces infos pour contextualiser ta question. Ex: "C'est mieux qu'hier ?" ou "Encore bloqué par la fatigue ?")

    CONTEXTE GÉNÉRAL / SOUVENIRS (RAG) :
    ${generalContext}

    HISTORIQUE RÉCENT DE LA CONVERSATION :
    ${history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
    User: "${message}"

    TA MISSION :
    1. Si on vient de commencer ou si l'utilisateur n'a pas encore donné l'info pour CET item : 
       -> POSE LA QUESTION DIRECTEMENT ET SIMPLEMENT.
       -> INTERDICTION DE DEMANDER "Est-ce que tu penses pouvoir le faire ?" ou "As-tu compris ?".
       -> DEMANDE UNIQUEMENT SI C'EST FAIT OU QUELLE EST LA VALEUR.
       -> Exemples valides : "Tu l'as fait hier ?", "Combien de minutes ?", "C'est fait ?".
       -> Contextualise avec l'historique si possible ("Mieux qu'hier ?").
    2. Si l'utilisateur a répondu (même avec un commentaire ou une question rhétorique) :
       -> APPELLE L'OUTIL "log_action_execution" IMMÉDIATEMENT SI C'EST FAIT.
       -> Interprète intelligemment : "Fait", "En entier", "Oui", "C'est bon" => status='completed'.
       
       -> CAS D'ÉCHEC ("Non pas fait") :
          - C'EST LE MOMENT CLÉ DU BILAN. INTERDICTION DE PASSER VITE.
          - Tâche 1 : Si la raison n'est pas claire, demande "Qu'est-ce qui a coincé ?" ou "Raconte-moi un peu."
          - Tâche 2 : Si la raison est donnée, NE LOGGUE PAS TOUT DE SUITE. Prends un court moment pour discuter, coacher ou valider la difficulté. 
          - Tâche 3 : N'appelle l'outil "log_action_execution" (avec status='missed') QUE quand cet échange a eu lieu (2-3 messages max) ou si l'utilisateur coupe court.
          
    3. Si l'utilisateur veut reporter ou ne pas répondre :
       -> Passe à la suite (appelle l'outil avec status='missed' et note='Reporté').

    RÈGLE D'OR (EMPATHIE) :
    Si l'utilisateur exprime du stress, de la fatigue ou une émotion difficile ("journée stressante", "j'ai couru", "je suis dispersé") :
    -> VALIDE SON RESSENTI avant de passer à la suite.
    -> Ne dis pas juste "Je note". Dis "Je comprends que c'est lourd" ou "C'est normal d'être à plat après ça".
    -> Montre que tu as entendu l'humain derrière la data. Mais reste bref pour garder le rythme.

    RÈGLE "BLOCAGE 5 JOURS" (BREAKDOWN) :
    - Si l'item courant est une ACTION et que l'historique contient "MISSED_STREAK_DAYS: N" avec N >= 5 :
      - Quand l'utilisateur répond que ce n'est PAS fait (missed), fais une remarque très courte du style :
        "Ok. Je vois que ça bloque depuis plusieurs jours. Tu veux qu'on la découpe en une micro-étape de 2 minutes ?"
      - Si et seulement si l'utilisateur accepte explicitement ("oui", "ok", "vas-y"), alors APPELLE l'outil "break_down_action".
      - Passe dans "problem" la raison telle que l'utilisateur l'exprime (ou le meilleur résumé possible en 1 phrase).
      - Ensuite, propose la micro-étape et termine par : "On continue le bilan ?"

    CAS PRÉCIS "JE L'AI FAIT" (URGENT):
    Si le message de l'utilisateur contient "fait", "fini", "ok", "bien", "oui", "réussi", "plitot", "plutôt" (même avec des fautes) :
    -> TU N'AS PAS LE CHOIX : APPELLE L'OUTIL "log_action_execution".
    -> NE RÉPONDS PAS PAR DU TEXTE. APPELLE L'OUTIL.
    -> Si tu as un doute, LOGGUE EN "completed".
    -> C'est mieux de logguer par erreur que de bloquer l'utilisateur.

    RÈGLES :
    - Ne pose qu'une question à la fois.
    - Si l'utilisateur semble avoir oublié ce qu'est l'item (ex: "C'est quoi ?", "C'est à dire ?"), utilise la DESCRIPTION fournie pour lui expliquer brièvement AVANT de redemander s'il l'a fait.
    - INTERDICTION ABSOLUE DE DIRE "BONJOUR", "SALUT", "HELLO" sauf si c'est le tout premier message de la conversation (historique vide).
    - Si l'utilisateur dit "J'ai tout fait", tu peux essayer de logguer l'item courant comme 'completed' mais méfie-toi, vérifie item par item si possible ou demande confirmation. Pour l'instant, check item par item.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Utilise 1 smiley (maximum 2) par message pour être sympa mais focus.

    RÈGLES BILAN (CRITIQUES)
    - Ne dis JAMAIS "bilan terminé" (ou équivalent) tant que tu n’as pas traité TOUS les points listés pour ce bilan (vital + actions + frameworks).
    - Si l’utilisateur mentionne un sujet à reprendre "après/plus tard" pendant le bilan (ex: organisation, stress), confirme brièvement ET continue le bilan.
    - À la fin du bilan, si un ou plusieurs sujets ont été reportés, tu DOIS IMPÉRATIVEMENT les proposer explicitement AVANT toute autre question. NE POSE AUCUNE question générique si des sujets reportés sont en attente.
      Exemple: "Tu m’avais parlé de ton organisation générale. On commence par ça ?"
  `
  const systemPrompt = basePrompt

  console.log(`[Investigator] Generating response for item: ${currentItem.title}`)

  let response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3, 
    false,
    [LOG_ACTION_TOOL, BREAK_DOWN_ACTION_TOOL, ACTIVATE_ACTION_TOOL, ARCHIVE_ACTION_TOOL],
    "auto",
    {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-3-flash-preview",
      source: "sophia-brain:investigator",
      forceRealAi: meta?.forceRealAi,
    }
  )

  if (typeof response === 'string') {
      response = response.replace(/\*\*/g, '')
  }

  if (typeof response === 'object' && response.tool === 'log_action_execution') {
      // L'IA a décidé de logguer
      console.log(`[Investigator] Logging item ${currentItem.title}:`, response.args)
      
      const argsWithId = { 
          ...response.args, 
          item_id: currentItem.id, 
          item_type: currentItem.type,
          item_title: currentItem.title 
      }
      
      await logItem(supabase, userId, argsWithId)

      // --- NEW: LEVEL UP CHECK ---
      if (currentItem.type === "action" && argsWithId.status === "completed") {
        try {
            const levelUpResult = await checkAndHandleLevelUp(supabase, userId, currentItem.id)
            if (levelUpResult.leveledUp) {
                // Level Up detected! Priority over everything.
                const nextIndex = currentState.current_item_index + 1
                const nextState = {
                    ...currentState,
                    current_item_index: nextIndex
                }
                
                const levelUpMsg = await investigatorSay(
                    "level_up",
                    { 
                        user_message: message, 
                        old_action: levelUpResult.oldAction, 
                        new_action: levelUpResult.newAction,
                        last_item_log: argsWithId
                    },
                    meta
                )

                if (nextIndex >= currentState.pending_items.length) {
                    // C'était le dernier item
                     return {
                        content: levelUpMsg, // Le message de Level Up sert de transition/conclusion pour cet item
                        investigationComplete: true, // On pourrait continuer sur un "end_checkup" mais le msg Level Up est fort. 
                        // Mieux : on envoie le msg Level Up, et on laisse le router gérer la suite ?
                        // Non, si investigationComplete=true, on sort. 
                        // Mais le message Level Up ne pose pas forcément la question "On parle d'autre chose ?".
                        // On devrait peut-être concaténer ou laisser l'utilisateur répondre au Level Up.
                        // Si on met investigationComplete=false, on va boucler sur un index hors bornes au prochain tour ?
                        // Non, check l'index au début de runInvestigator (étape 2).
                        // Si on renvoie un newState avec index++, au prochain tour on tombera dans "CHECK SI FINI".
                        // Donc il faut investigationComplete=false pour laisser le user répondre au Level Up, 
                        // PUIS au prochain tour on détecte la fin.
                        newState: nextState
                    }
                }

                return {
                    content: levelUpMsg,
                    investigationComplete: false,
                    newState: nextState
                }
            }
        } catch (e) {
            console.error("[Investigator] Level Up check failed:", e)
        }
      }
      // ---------------------------

      const streakIntercept = await maybeHandleStreakAfterLog({
        supabase,
        userId,
        message,
        currentState,
        currentItem,
        argsWithId: { status: argsWithId.status, note: argsWithId.note },
        meta,
      })
      if (streakIntercept) return streakIntercept
      
      // On passe au suivant
      const nextIndex = currentState.current_item_index + 1
      const nextState = {
          ...currentState,
          current_item_index: nextIndex
      }
      
      console.log(`[Investigator] Moving to item index ${nextIndex}. Total items: ${currentState.pending_items.length}`)
      
      if (nextIndex >= currentState.pending_items.length) {
          console.log("[Investigator] All items checked. Closing investigation.")
          return {
              content: await investigatorSay(
                "end_checkup_after_last_log",
                {
                  user_message: message,
                  channel: meta?.channel,
                  recent_history: history.slice(-3),
                  last_item: currentItem,
                  last_item_log: argsWithId,
                  day_scope: String(currentState?.temp_memory?.day_scope ?? "yesterday"),
                },
                meta,
              ),
              investigationComplete: true,
              newState: null
          }
      } else {
          const nextItem = currentState.pending_items[nextIndex]
          console.log(`[Investigator] Next item: ${nextItem.title}`)
          const dayScope = String(currentState?.temp_memory?.day_scope ?? "yesterday")
          const dayRef = dayScope === "today" ? "aujourd’hui" : "hier"
          const deferred = Boolean(currentState?.temp_memory?.deferred_topic)

          // Dynamic transition via LLM (avoid hardcoded robotic phrases)
          const transitionOut = await investigatorSay(
            "transition_to_next_item",
            {
              user_message: message,
              last_item_log: argsWithId, // Pass status/note so LLM can react ("Ah mince...")
              next_item: nextItem,
              day_scope: dayScope,
              deferred_topic: deferred ? "planning/organisation" : null
            },
            meta
          )
          
          return {
              content: transitionOut,
              investigationComplete: false,
              newState: nextState
          }
      }
  }

  if (typeof response === "object" && response.tool === "break_down_action") {
      try {
        if (currentItem.type !== "action") {
          return {
            content: await investigatorSay(
              "break_down_action_wrong_type",
              { user_message: message, item: currentItem },
              meta,
            ),
            investigationComplete: false,
            newState: currentState,
          }
        }

        const problem = String((response as any)?.args?.problem ?? "").trim()
        const applyToPlan = (response as any)?.args?.apply_to_plan !== false
        if (!problem) {
          return {
            content: await investigatorSay(
              "break_down_action_missing_problem",
              { user_message: message, item: currentItem },
              meta,
            ),
            investigationComplete: false,
            newState: currentState,
          }
        }

        const planRow = await fetchActivePlanRow(supabase, userId)
        const actionRow = await fetchActionRowById(supabase, userId, currentItem.id)

        const helpingAction = {
          title: actionRow?.title ?? currentItem.title,
          description: actionRow?.description ?? currentItem.description ?? "",
          tracking_type: actionRow?.tracking_type ?? currentItem.tracking_type ?? "boolean",
          time_of_day: actionRow?.time_of_day ?? "any_time",
          targetReps: actionRow?.target_reps ?? currentItem.target ?? 1,
        }

        const newAction = await callBreakDownActionEdge({
          action: helpingAction,
          problem,
          plan: planRow?.content ?? null,
          submissionId: planRow?.submission_id ?? actionRow?.submission_id ?? null,
        })

        const stepTitle = String(newAction?.title ?? "Micro-étape").trim()
        const stepDesc = String(newAction?.description ?? "").trim()
        const tip = String(newAction?.tips ?? "").trim()

        const nextState = {
          ...currentState,
          temp_memory: {
            ...(currentState.temp_memory || {}),
            breakdown: {
              stage: "awaiting_accept",
              action_id: currentItem.id,
              action_title: currentItem.title,
              problem,
              proposed_action: newAction,
              apply_to_plan: applyToPlan,
            },
          },
        }

        return {
          content: await investigatorSay(
            "break_down_action_propose_step",
            {
              user_message: message,
              action_title: currentItem.title,
              problem,
              proposed_step: { title: stepTitle, description: stepDesc, tip },
              apply_to_plan: applyToPlan,
            },
            meta,
          ),
          investigationComplete: false,
          newState: nextState,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] break_down_action failed:", e)
        return {
          content: await investigatorSay(
            "break_down_action_error",
            { user_message: message, error: msg, item: currentItem },
            meta,
          ),
          investigationComplete: false,
          newState: currentState,
        }
      }
  }

  if (typeof response === "object" && response.tool === "archive_plan_action") {
      const result = await handleArchiveAction(supabase, userId, response.args)
      return {
          content: result,
          investigationComplete: false,
          newState: currentState
      }
  }

  if (typeof response === "object" && response.tool === "activate_plan_action") {
      // Pour l'activation, on garde le message "Murs avant toit" ou on délègue à l'Architecte.
      // Pour faire simple ici, l'Investigateur ne fait QUE l'activation si c'est simple, sinon il renvoie vers l'Architecte.
      // Mais comme on n'a pas copié tout le code d'activation complexe ici, on fait une réponse statique pour l'instant.
      return {
          content: "Je note ton envie d'activer ça. Pour être sûr de respecter le plan (les murs avant le toit !), je laisse l'Architecte valider et l'activer tout de suite. (Transition vers Architecte...)",
          investigationComplete: true, // Ceci forcera le routeur à passer la main au prochain message (ou on pourrait forcer le mode dans le return, mais investigator return signature is fixed)
          newState: null 
      }
  }

  // Sinon, c'est une question ou une réponse texte
  if (typeof response === "string" && !isMegaTestMode(meta)) {
    const dayScope = String(currentState?.temp_memory?.day_scope ?? "yesterday")
    const dayRef = dayScope === "today" ? "aujourd’hui" : "hier"
    const verified = await verifyInvestigatorMessage({
      draft: response,
      scenario: "main_item_turn",
      data: {
        day_scope: dayScope,
        day_ref: dayRef,
        current_item: currentItem,
        pending_items: currentState?.pending_items ?? [],
        current_item_index: currentState?.current_item_index ?? 0,
        recent_history: history.slice(-3),
        user_message: message,
      },
      meta: { ...meta, userId: undefined },
    })
    response = verified.text
  }

  return {
    content: response as string,
    investigationComplete: false,
    newState: currentState
  }
}
