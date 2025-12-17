import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'
import { retrieveContext } from './companion.ts' // Import retrieveContext to use RAG
import { appendPromptOverride, fetchPromptOverride } from '../../_shared/prompt-overrides.ts'

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

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
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

async function getMissedStreakDays(
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

async function getCompletedStreakDays(
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

async function getYesterdayCheckupSummary(supabase: SupabaseClient, userId: string): Promise<{
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
    const today = new Date().toISOString().split('T')[0]
    
    // Règle des 18h : Si last_performed_at / last_checked_at > 18h ago, on doit checker.
    const now = new Date()
    const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000)

    const pending: CheckupItem[] = []

    // 1. Fetch Actions
    const { data: actions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // 2. Fetch Vital Signs
    const { data: vitals } = await supabase
        .from('user_vital_signs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

    // 3. Fetch Frameworks
    const { data: frameworks } = await supabase
        .from('user_framework_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

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

// --- MAIN FUNCTION ---

export async function runInvestigator(
  supabase: SupabaseClient, 
  userId: string, 
  message: string, 
  history: any[],
  state: any,
  meta?: { requestId?: string }
): Promise<{ content: string, investigationComplete: boolean, newState: any }> {

  // 1. INIT STATE
  let currentState: InvestigationState = state || {
      status: 'init',
      pending_items: [],
      current_item_index: 0,
      temp_memory: {}
  }

  // Si c'est le tout début, on charge les items
  if (currentState.status === 'init') {
      const items = await getPendingItems(supabase, userId)
      if (items.length === 0) {
          return {
              content: "Tout est à jour pour ce créneau ! Tu as déjà tout validé. 🎉",
              investigationComplete: true,
              newState: null
          }
      }
      currentState = {
          status: 'checking',
          pending_items: items,
          current_item_index: 0,
          temp_memory: { opening_done: false }
      }
  }

  // Soft, personalized opening (before the very first question)
  if (currentState?.status === "checking" && currentState.current_item_index === 0 && currentState?.temp_memory?.opening_done !== true) {
    try {
      const summary = await getYesterdayCheckupSummary(supabase, userId)
      const currentItem0 = currentState.pending_items[0]

      let opening = ""
      if (summary.completed === 0 && summary.missed === 0) {
        opening = "Ok. Petit bilan en douceur 🙂"
      } else if (summary.completed > 0 && summary.missed === 0) {
        opening = `Hier t’as été solide : ${summary.completed} truc(s) validé(s). On garde le rythme 🙂`
      } else if (summary.completed === 0 && summary.missed > 0) {
        opening = `Hier ça a été plus dur (${summary.missed} truc(s) ont sauté). Aucun jugement. On repart simple aujourd’hui.`
      } else {
        opening = `Hier t’as quand même avancé : ${summary.completed} validé(s), ${summary.missed} raté(s). On continue tranquille.`
      }

      if (summary.topBlocker) {
        opening += ` (Et je note que le blocage principal, c’était plutôt: ${summary.topBlocker}.)`
      } else if (summary.lastWinTitle) {
        opening += ` (Gros point positif: ${summary.lastWinTitle}.)`
      }

      const q =
        currentItem0.type === "vital"
          ? `\n\nOn commence : ${currentItem0.title} — c’est combien ?`
          : currentItem0.type === "framework"
            ? `\n\nOn commence : ${currentItem0.title} — tu l’as fait aujourd’hui ?`
            : `\n\nOn commence : ${currentItem0.title} — tu l’as fait aujourd’hui ?`

      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      return { content: `${opening}${q}`, investigationComplete: false, newState: nextState }
    } catch (e) {
      console.error("[Investigator] opening summary failed:", e)
      const currentItem0 = currentState.pending_items[0]
      const q = `On commence : ${currentItem0.title} — tu l’as fait aujourd’hui ?`
      const nextState = {
        ...currentState,
        temp_memory: { ...(currentState.temp_memory || {}), opening_done: true },
      }
      return { content: q, investigationComplete: false, newState: nextState }
    }
  }

  // 2. CHECK SI FINI
  if (currentState.current_item_index >= currentState.pending_items.length) {
       // DOUBLE CHECK : Si le temps a passé ou si on a raté des trucs, on refait un scan
       console.log("[Investigator] End of list reached. Scanning for new pending items...")
       const freshItems = await getPendingItems(supabase, userId)
       
       if (freshItems.length > 0) {
           console.log(`[Investigator] Found ${freshItems.length} new items. Extending session.`)
           currentState.pending_items = [...currentState.pending_items, ...freshItems]
       } else {
           return {
              content: "C'est tout bon pour le bilan ! Merci d'avoir pris ce temps. Repose-toi bien. 🌙",
              investigationComplete: true,
              newState: null
          }
       }
  }

  // 3. ITEM COURANT
  const currentItem = currentState.pending_items[currentState.current_item_index]
  
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
          content:
            "Ok. Dis-moi vite fait : qu’est-ce qui te bloquerait le plus sur cette action ? (temps, énergie, oubli, contexte…)\n\nEt surtout : qu’est-ce qui te permettrait d’avancer un tout petit peu ?",
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
          return { content: "Ok. On continue une autre fois. Le bilan est terminé. ✅", investigationComplete: true, newState: null }
        }
        const nextItem = currentState.pending_items[nextIndex]
        return {
          content: `Ok. On passe à la suite.\n\nEt pour ${nextItem.title} ?`,
          investigationComplete: false,
          newState: cleaned,
        }
      }
      return {
        content: "Juste pour être sûre : tu veux qu’on la découpe en une micro-étape ? (oui / non)",
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
            content: "Vas-y, dis-moi en 1 phrase ce qui bloque le plus (ex: temps, fatigue, oubli…).",
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
          content:
            `Ok. Voilà une micro-étape :\n${stepTitle}\n${stepDesc ? `→ ${stepDesc}\n` : ""}${tip ? `Tip : ${tip}\n` : ""}\nTu veux que je te la crée et que je l’ajoute à ton plan ? (oui / non)`,
          investigationComplete: false,
          newState: nextState,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] breakdown proposal failed:", e)
        return {
          content: `Ok, j’ai eu un souci pour générer la micro-étape (${msg}). Donne-moi juste une raison plus précise (ex: “je suis rincé le soir”), et je te propose une version simple.`, 
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
        return { content: "Je n’ai plus la micro-étape sous la main. Redis-moi en 1 phrase ce qui bloque et je la régénère.", investigationComplete: false, newState: nextState }
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
            return { content: "Ok, c’est créé. On s’arrête là pour ce soir. ✅", investigationComplete: true, newState: null }
          }
          const nextItem = currentState.pending_items[nextIndex]
          return {
            content: `Parfait. C’est créé.\n\nOn continue le bilan : ${nextItem.title} ?`,
            investigationComplete: false,
            newState: nextState,
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error("[Investigator] breakdown commit failed:", e)
          return {
            content: `Ok, j’ai compris, mais j’ai eu un souci pour la créer (${msg}). On continue le bilan et on la crée après si tu veux ?`,
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
          content: "Ok. Qu’est-ce que tu veux changer ? (plus simple / plus court / autre moment / autre forme) Dis-moi en 1 phrase.",
          investigationComplete: false,
          newState: nextState,
        }
      }

      return {
        content: "Tu veux que je la crée et que je l’ajoute au plan ? (oui / non)",
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
       -> POSE LA QUESTION. (Ex: "Alors, ce sommeil, combien d'heures ?").
    2. Si l'utilisateur a répondu (même avec un commentaire ou une question rhétorique) :
       -> APPELLE L'OUTIL "log_action_execution" IMMÉDIATEMENT.
       -> Interprète intelligemment : "Fait", "En entier", "Oui", "C'est bon" => status='completed'.
       -> Ne repose pas la question si la réponse est dedans ("Je l'ai fait mais..."). Loggue l'action et mets le reste en note.
       -> Si c'est un échec ("Non j'ai pas fait"), sois empathique et essaie de capter la raison dans le champ "note" de l'outil.
    3. Si l'utilisateur veut reporter ou ne pas répondre :
       -> Passe à la suite (appelle l'outil avec status='missed' et note='Reporté').

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
  `
  const override = await fetchPromptOverride("sophia.investigator")
  const systemPrompt = appendPromptOverride(basePrompt, override)

  console.log(`[Investigator] Generating response for item: ${currentItem.title}`)

  let response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3, 
    false,
    [LOG_ACTION_TOOL, BREAK_DOWN_ACTION_TOOL],
    "auto",
    {
      requestId: meta?.requestId,
      model: "gemini-2.0-flash",
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
                content: `Yes. ${winStreak} jours d’affilée sur "${currentItem.title}" — franchement solide. 🔥\nLe bilan est terminé. ✅`,
                investigationComplete: true,
                newState: null,
              }
            }

            const nextItem = currentState.pending_items[nextIndex]
            return {
              content: `Yes. ${winStreak} jours d’affilée sur "${currentItem.title}" — franchement solide. 🔥\n\nEt pour ${nextItem.title} ?`,
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
              content: `Ok. Je vois que "${currentItem.title}" bloque depuis ${streak} jours d’affilée.\nTu veux qu’on la découpe en une micro-étape (2 minutes) pour débloquer ? (oui / non)`,
              investigationComplete: false,
              newState: nextState,
            }
          }
        } catch (e) {
          console.error("[Investigator] streak check failed after missed log:", e)
        }
      }
      
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
              content: "Merci, c'est noté. Le bilan est terminé ! ✅",
              investigationComplete: true,
              newState: null
          }
      } else {
          const nextItem = currentState.pending_items[nextIndex]
          console.log(`[Investigator] Next item: ${nextItem.title}`)
          const transitionPrompt = `
            Tu viens de noter "${currentItem.title}" (${argsWithId.status}).
            Maintenant, enchaîne naturellement pour demander à propos de : "${nextItem.title}".
            Sois fluide. PAS DE GRAS (**).
            INTERDICTION ABSOLUE DE DIRE "BONJOUR", "SALUT", "HELLO". Enchaîne direct sur la question suivante.
            Exemple : "C'est noté. Et pour X ?"
          `
          let transitionText = await generateWithGemini(transitionPrompt, "Transitionne.", 0.7, false, [], "auto", {
            requestId: meta?.requestId,
            model: "gemini-2.0-flash",
            source: "sophia-brain:investigator_transition",
            forceRealAi: meta?.forceRealAi,
          })
          
          if (typeof transitionText === 'string') {
              transitionText = transitionText.replace(/\*\*/g, '')
          }
          
          return {
              content: typeof transitionText === 'string' ? transitionText : `C'est noté. Et pour ${nextItem.title} ?`,
              investigationComplete: false,
              newState: nextState
          }
      }
  }

  if (typeof response === "object" && response.tool === "break_down_action") {
      try {
        if (currentItem.type !== "action") {
          return {
            content: "Ok. Là je peux le faire seulement pour une action (pas un signe vital / framework). On continue ?",
            investigationComplete: false,
            newState: currentState,
          }
        }

        const problem = String((response as any)?.args?.problem ?? "").trim()
        const applyToPlan = (response as any)?.args?.apply_to_plan !== false
        if (!problem) {
          return {
            content: "Ok — dis-moi juste en 1 phrase ce qui bloque (temps, énergie, oubli, motivation…), et je te fais une micro-étape. On continue ?",
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
          content:
            `Ok. Voilà une micro-étape :\n${stepTitle}\n${stepDesc ? `→ ${stepDesc}\n` : ""}${tip ? `Tip : ${tip}\n` : ""}\nTu veux que je te la crée et que je l’ajoute à ton plan ? (oui / non)`,
          investigationComplete: false,
          newState: nextState,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[Investigator] break_down_action failed:", e)
        return {
          content: `Ok, j’ai essayé de générer une micro-étape mais j’ai eu un souci technique (${msg}). Donne-moi en 1 phrase ce qui bloque, et on fait ça à la main. On continue le bilan ?`,
          investigationComplete: false,
          newState: currentState,
        }
      }
  }

  // Sinon, c'est une question ou une réponse texte
  return {
      content: response as string,
      investigationComplete: false,
      newState: currentState
  }
}
