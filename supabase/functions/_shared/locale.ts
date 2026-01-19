export function normalizeLocale(raw: unknown, fallback = "fr-FR"): string {
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



