export function normalizeFrom(from: string): string {
  const s = (from ?? "").trim().replace(/[()\s-]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) return s
  if (s.startsWith("00")) return `+${s.slice(2)}`
  if (/^\d+$/.test(s)) return `+${s}`
  return s
}

export function e164ToFrenchLocal(e164: string): string {
  const s = (e164 ?? "").trim()
  if (!s.startsWith("+33")) return ""
  const digits = s.slice(3)
  // France: +33 + 9 digits => local 0 + 9 digits (10 digits)
  if (!/^\d{9}$/.test(digits)) return ""
  return `0${digits}`
}

export function isPhoneUniqueViolation(err: unknown): boolean {
  const anyErr = err as any
  const code = String(anyErr?.code ?? "").trim()
  const msg = String(anyErr?.message ?? "").toLowerCase()
  if (code === "23505") return true
  return msg.includes("profiles_phone_number_verified_unique") || msg.includes("duplicate key")
}


