import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export type ProfileFactValue = string | number | boolean | null | Record<string, unknown> | unknown[]

export type UserProfileFactRow = {
  user_id: string
  scope: string
  key: string
  value: any
  status: string
  confidence: number
  source_type: string
  last_source_message_id: string | null
  reason: string | null
  created_at: string
  updated_at: string
  last_confirmed_at: string | null
}

function stableJsonEqual(a: any, b: any): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export async function getUserProfileFacts(opts: {
  supabase: SupabaseClient
  userId: string
  scopes: string[] // usually ["global", currentScope]
}): Promise<UserProfileFactRow[]> {
  const { supabase, userId, scopes } = opts
  const wanted = Array.from(new Set((scopes ?? []).map((s) => String(s ?? "").trim()).filter(Boolean)))
  if (wanted.length === 0) return []

  const { data, error } = await supabase
    .from("user_profile_facts")
    .select("*")
    .eq("user_id", userId)
    .in("scope", wanted)
    .eq("status", "active")

  if (error) throw error
  return (data ?? []) as any
}

export function formatUserProfileFactsForPrompt(rows: UserProfileFactRow[], currentScope: string): string {
  if (!Array.isArray(rows) || rows.length === 0) return ""

  // Merge: scope-specific overrides global for same key.
  const byKey = new Map<string, UserProfileFactRow>()
  const scopeRank = (scope: string): number => {
    const s = String(scope ?? "").toLowerCase()
    if (s === String(currentScope ?? "").toLowerCase()) return 2
    if (s === "global") return 1
    return 0
  }
  const sorted = [...rows].sort((a, b) => scopeRank(b.scope) - scopeRank(a.scope))
  for (const r of sorted) {
    if (!r?.key) continue
    if (!byKey.has(r.key)) byKey.set(r.key, r)
  }

  const lines: string[] = []
  lines.push("=== USER MODEL (FACTS) ===")
  for (const [key, r] of byKey.entries()) {
    const scope = String(r.scope ?? "")
    const conf = Number.isFinite(Number(r.confidence)) ? Number(r.confidence).toFixed(2) : "?"
    // Keep values compact (avoid huge JSON blobs).
    const v =
      typeof r.value === "string"
        ? JSON.stringify(r.value)
        : typeof r.value === "number" || typeof r.value === "boolean"
          ? String(r.value)
          : JSON.stringify(r.value ?? null)
    lines.push(`- ${key} = ${v} (scope=${scope}, conf=${conf}, src=${r.source_type})`)
  }
  return lines.join("\n")
}

export async function upsertUserProfileFactWithEvent(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  key: string
  value: ProfileFactValue
  sourceType: "explicit_user" | "ui" | "watcher" | "inferred" | string
  confidence?: number
  reason?: string
  sourceMessageId?: string | null
}): Promise<{ changed: boolean }> {
  const {
    supabase,
    userId,
    scope,
    key,
    value,
    sourceType,
    confidence = 1.0,
    reason,
    sourceMessageId,
  } = opts

  const scopeNorm = String(scope ?? "global").trim() || "global"
  const keyNorm = String(key ?? "").trim()
  if (!keyNorm) return { changed: false }

  // Read old (best-effort) so we can decide if we need an event.
  const { data: prev, error: prevErr } = await supabase
    .from("user_profile_facts")
    .select("value")
    .eq("user_id", userId)
    .eq("scope", scopeNorm)
    .eq("key", keyNorm)
    .maybeSingle()

  // If RLS blocks or table missing in some env, don't crash the whole chat.
  if (prevErr && (prevErr as any)?.code) {
    // If it's a real error, surface it to logs but keep non-blocking behavior.
    console.warn("[profile_facts] read prev failed (non-blocking):", prevErr)
  }

  const oldValue = (prev as any)?.value ?? null
  const isSame = stableJsonEqual(oldValue, value)

  // Upsert the fact (even if same: keep it “confirmed” and refresh updated_at).
  const nowIso = new Date().toISOString()
  const { error: upErr } = await supabase.from("user_profile_facts").upsert(
    {
      user_id: userId,
      scope: scopeNorm,
      key: keyNorm,
      value,
      status: "active",
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
      source_type: String(sourceType ?? "explicit_user"),
      last_source_message_id: sourceMessageId ?? null,
      reason: reason ?? null,
      updated_at: nowIso,
      last_confirmed_at: nowIso,
    },
    { onConflict: "user_id,scope,key" },
  )
  if (upErr) {
    console.warn("[profile_facts] upsert failed (non-blocking):", upErr)
    return { changed: false }
  }

  if (isSame) return { changed: false }

  // Write audit event
  const { error: evErr } = await supabase.from("user_profile_fact_events").insert({
    user_id: userId,
    scope: scopeNorm,
    key: keyNorm,
    old_value: oldValue,
    new_value: value,
    source_type: String(sourceType ?? "explicit_user"),
    source_message_id: sourceMessageId ?? null,
    reason: reason ?? null,
  })
  if (evErr) console.warn("[profile_facts] event insert failed (non-blocking):", evErr)

  return { changed: true }
}



