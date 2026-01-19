function denoEnv(name: string): string | undefined {
  return (globalThis as any)?.Deno?.env?.get?.(name)
}

export function isMegaTestMode(meta?: { forceRealAi?: boolean }): boolean {
  return (denoEnv("MEGA_TEST_MODE") ?? "").trim() === "1" && !meta?.forceRealAi
}

export function isAffirmative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase()
  if (!t) return false
  return /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|let'?s go|carr[ée]|yep|yes)\b/i.test(t)
}

export function isNegative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase()
  if (!t) return false
  return /\b(non|nope|nan|laisse|pas besoin|stop|on laisse|plus tard)\b/i.test(t)
}

export function isExplicitStopBilan(text: string): boolean {
  const m = (text ?? "").toString().trim()
  if (!m) return false
  // IMPORTANT: Do NOT treat "plus tard / pas maintenant" as a stop.
  // Those are deferrals of a topic or an item and should be handled inside the checkup flow (parking-lot),
  // not as a cancellation of the whole bilan.
  return /\b(?:stop|pause|arr[êe]te|arr[êe]tons|annule|annulons|on\s+arr[êe]te|on\s+peut\s+arr[êe]ter|je\s+veux\s+arr[êe]ter|c['’]est\s+trop|c['’]est\s+lourd|arr[êe]te\s+le\s+bilan|stop\s+le\s+bilan|pas\s+de\s+bilan|on\s+arr[êe]te\s+le\s+bilan)\b/i
    .test(m)
}

export function functionsBaseUrl(): string {
  const supabaseUrl = (denoEnv("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

export function isoDay(d: Date): string {
  return d.toISOString().split("T")[0]
}

export function addDays(day: string, delta: number): string {
  const [y, m, dd] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return isoDay(dt)
}




