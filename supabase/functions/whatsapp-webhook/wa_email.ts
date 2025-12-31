import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export function looksLikeEmail(raw: string): string | null {
  const t = (raw ?? "").trim()
  // Conservative email regex; good enough for onboarding.
  const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? m[0] : null
}

export function normalizeEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase()
}

export async function maybeSendEmail(params: { to: string; subject: string; html: string }) {
  const { sendResendEmail } = await import("../_shared/resend.ts")
  const out = await sendResendEmail({ to: params.to, subject: params.subject, html: params.html, maxAttempts: 6 })
  if (!out.ok) return { ok: false as const, error: out.error }
  return { ok: true as const, data: (out as any).data }
}

export async function getAccountEmailForProfile(
  admin: SupabaseClient,
  profileId: string,
  profileEmail?: string | null,
): Promise<string> {
  const direct = (profileEmail ?? "").trim()
  if (direct) return direct
  const { data: userData } = await admin.auth.admin.getUserById(profileId)
  return (userData?.user?.email ?? "").trim()
}


