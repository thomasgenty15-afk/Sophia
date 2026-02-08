import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export async function loadHistory(admin: SupabaseClient, userId: string, limit = 20, scope: string = "whatsapp") {
  const { data, error } = await admin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  const rows = (data ?? []).slice().reverse()
  return rows.map((r: any) => ({ role: r.role, content: r.content, created_at: r.created_at }))
}

export async function hasWhatsappPersonalFact(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("memories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "whatsapp_personal_fact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return false
  return Boolean((data as any)?.id)
}

export async function fetchLatestPending(admin: SupabaseClient, userId: string, kind: "scheduled_checkin" | "memory_echo" | "bilan_reschedule") {
  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .select("id, kind, status, scheduled_checkin_id, payload, created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return (data ?? [])[0] ?? null
}

export async function markPending(admin: SupabaseClient, id: string, status: "done" | "cancelled" | "expired") {
  await admin
    .from("whatsapp_pending_actions")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id)
}


