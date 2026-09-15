/**
 * Normalize a raw locale value, falling back to `fallback` when it is empty.
 *
 * `fallback` is REQUIRED. It used to default to "fr-FR", which read like a
 * decision and was one: it declared a fleet-wide language for every caller who
 * forgot to think about it. No call site ever relied on it (all four passed
 * their own), so making it required is a verified no-op — and it stops the next
 * caller from inheriting a language by omission.
 */
export function normalizeLocale(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").trim()
  return s || fallback
}

// WhatsApp template language codes are usually ISO 639-1 like "fr", "en", "es".
export function whatsappLangFromLocale(locale: unknown, fallback = "fr"): string {
  const loc = normalizeLocale(locale, "fr-FR").toLowerCase()
  if (loc.startsWith("fr")) return "fr"
  if (loc.startsWith("en")) return "en"
  if (loc.startsWith("es")) return "es"
  if (loc.startsWith("pt")) return "pt_BR" // common WhatsApp template locale
  if (loc.startsWith("it")) return "it"
  if (loc.startsWith("de")) return "de"
  return fallback
}



