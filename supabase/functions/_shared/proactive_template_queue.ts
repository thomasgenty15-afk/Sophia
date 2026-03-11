import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export const PROACTIVE_TEMPLATE_CANDIDATE_KIND = "proactive_template_candidate"

export const PROACTIVE_TEMPLATE_PURPOSE_PRIORITIES: Record<string, number> = {
  daily_bilan_winback: 100,
  weekly_bilan: 80,
  daily_bilan: 70,
  memory_echo: 50,
  recurring_reminder: 10,
}

export function proactiveTemplatePriorityForPurpose(purposeRaw: unknown): number {
  const purpose = String(purposeRaw ?? "").trim()
  return PROACTIVE_TEMPLATE_PURPOSE_PRIORITIES[purpose] ?? 0
}

type TemplateMessage = {
  type: "template"
  name: string
  language: string
  components?: unknown[]
}

export async function enqueueProactiveTemplateCandidate(
  admin: SupabaseClient,
  params: {
    userId: string
    purpose: string
    message: TemplateMessage
    requireOptedIn?: boolean
    forceTemplate?: boolean
    metadataExtra?: Record<string, unknown>
    payloadExtra?: Record<string, unknown>
    dedupeKey: string
    expiresAt?: string | null
    notBefore?: string | null
  },
): Promise<{ id: string; inserted: boolean }> {
  const priority = proactiveTemplatePriorityForPurpose(params.purpose)
  if (priority <= 0) {
    throw new Error(`Unsupported proactive template purpose: ${params.purpose}`)
  }

  const { data: existing, error: existingError } = await admin
    .from("whatsapp_pending_actions")
    .select("id")
    .eq("user_id", params.userId)
    .eq("kind", PROACTIVE_TEMPLATE_CANDIDATE_KIND)
    .eq("status", "pending")
    .filter("payload->>dedupe_key", "eq", params.dedupeKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.id) {
    return { id: String(existing.id), inserted: false }
  }

  const payload = {
    purpose: params.purpose,
    priority,
    message: params.message,
    require_opted_in: params.requireOptedIn !== false,
    force_template: params.forceTemplate !== false,
    metadata_extra: params.metadataExtra ?? {},
    dedupe_key: params.dedupeKey,
    ...(params.payloadExtra ?? {}),
  }

  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .insert({
      user_id: params.userId,
      kind: PROACTIVE_TEMPLATE_CANDIDATE_KIND,
      status: "pending",
      payload,
      expires_at: params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      not_before: params.notBefore ?? null,
    } as any)
    .select("id")
    .maybeSingle()
  if (error) throw error

  return {
    id: String((data as any)?.id ?? ""),
    inserted: true,
  }
}
