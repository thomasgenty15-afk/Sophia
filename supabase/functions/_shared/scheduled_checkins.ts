import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "./gemini.ts"
import { buildUserTimeContextFromValues } from "./user_time_context.ts"

function safeTrim(s: unknown): string {
  return String(s ?? "").trim()
}

function clampText(s: string, maxChars: number): string {
  const t = safeTrim(s)
  if (t.length <= maxChars) return t
  return t.slice(0, maxChars - 1).trimEnd() + "…"
}

export async function generateDynamicWhatsAppCheckinMessage(params: {
  admin: SupabaseClient
  userId: string
  eventContext: string
  instruction?: string
  requestId?: string
}): Promise<string> {
  const { admin, userId } = params
  const eventContext = clampText(params.eventContext, 180)
  const instruction = clampText(params.instruction ?? "", 500)

  const { data: prof } = await admin
    .from("profiles")
    .select("timezone, locale")
    .eq("id", userId)
    .maybeSingle()
  const tctx = buildUserTimeContextFromValues({ timezone: (prof as any)?.timezone ?? null, locale: (prof as any)?.locale ?? null })

  // Pull the most recent WhatsApp messages for grounding.
  const { data: msgs, error } = await admin
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(24)
  if (error) throw error

  const transcript = (msgs ?? [])
    .slice()
    .reverse()
    .map((m: any) => `${m.created_at} ${m.role.toUpperCase()}: ${String(m.content ?? "")}`)
    .join("\n")

  const systemPrompt =
    [
      "Tu es Sophia (mode Companion) et tu vas envoyer un message WhatsApp de relance (check-in).",
      "",
      "Contraintes WhatsApp (strict):",
      "- 1 message court (2–6 lignes), texte brut, pas de markdown.",
      "- 1 question MAX.",
      "- Naturel, chaleureux, tutoiement.",
      "- Ne promets pas d'autres relances automatiques.",
      "- N'invente pas de contexte non présent dans le transcript.",
      "",
      "Repères temporels (critiques):",
      tctx.prompt_block,
      "",
      `Contexte de relance (event_context): ${eventContext}`,
      instruction ? `Instruction additionnelle: ${instruction}` : "",
      "",
      "Tu dois prendre en compte la conversation récente ci-dessous (si elle est vide, reste générique).",
    ]
      .filter(Boolean)
      .join("\n")

  const out = await generateWithGemini(systemPrompt, transcript || "(pas d'historique)", 0.4, false, [], "auto", {
    requestId: params.requestId,
    // Avoid Gemini preview defaults in prod; rely on stable default.
    model: "gemini-2.5-flash",
    source: "scheduled_checkins:dynamic_whatsapp",
    forceRealAi: true,
  })

  const text = typeof out === "string" ? out : safeTrim((out as any)?.text ?? "")
  return clampText(text.replace(/\*\*/g, ""), 900) || "Petit check-in: comment ça va depuis tout à l’heure ?"
}

// Convert a target local time in an IANA timezone to an ISO UTC timestamp.
// This avoids adding a dependency and is robust enough for typical DST transitions.
export function computeScheduledForFromLocal(params: {
  timezone: string
  dayOffset: number
  localTimeHHMM: string
  now?: Date
}): string {
  const tz = safeTrim(params.timezone) || "Europe/Paris"
  const dayOffset = Number.isFinite(Number(params.dayOffset)) ? Math.max(0, Math.floor(Number(params.dayOffset))) : 1

  const m = safeTrim(params.localTimeHHMM).match(/^(\d{1,2}):(\d{2})$/)
  if (!m) throw new Error("Invalid local_time_hhmm (expected HH:MM)")
  const hh = Math.max(0, Math.min(23, Number(m[1])))
  const mm = Math.max(0, Math.min(59, Number(m[2])))

  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const now = params.now ?? new Date()
  const parts = dtf.formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  const y0 = get("year")
  const mo0 = get("month")
  const d0 = get("day")

  // Add dayOffset in calendar terms.
  const base = new Date(Date.UTC(y0, mo0 - 1, d0))
  base.setUTCDate(base.getUTCDate() + dayOffset)
  const y = base.getUTCFullYear()
  const mo = base.getUTCMonth() + 1
  const d = base.getUTCDate()

  const target = { y, mo, d, hh, mm }

  const fmtParts = (ms: number) => {
    const ps = dtf.formatToParts(new Date(ms))
    const g = (type: string) => Number(ps.find((p) => p.type === type)?.value ?? "0")
    return { y: g("year"), mo: g("month"), d: g("day"), hh: g("hour"), mm: g("minute") }
  }

  // Initial guess: treat local as UTC, then refine by comparing formatted parts.
  let guess = Date.UTC(target.y, target.mo - 1, target.d, target.hh, target.mm, 0, 0)
  for (let i = 0; i < 3; i++) {
    const got = fmtParts(guess)
    const desiredAsUtc = Date.UTC(target.y, target.mo - 1, target.d, target.hh, target.mm, 0, 0)
    const gotAsUtc = Date.UTC(got.y, got.mo - 1, got.d, got.hh, got.mm, 0, 0)
    const deltaMin = Math.round((gotAsUtc - desiredAsUtc) / 60000)
    if (deltaMin === 0) break
    guess -= deltaMin * 60000
  }

  return new Date(guess).toISOString()
}


