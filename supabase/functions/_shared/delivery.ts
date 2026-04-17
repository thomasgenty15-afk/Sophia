import "jsr:@supabase/functions-js/edge-runtime.d.ts"

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase()
  if (!raw) return defaultValue
  if (["1", "true", "yes", "on"].includes(raw)) return true
  if (["0", "false", "no", "off"].includes(raw)) return false
  return defaultValue
}

export function isEmailDeliveryEnabled(): boolean {
  return envFlag("EMAIL_DELIVERY_ENABLED", true)
}

export function isWhatsAppDeliveryEnabled(): boolean {
  return envFlag("WHATSAPP_DELIVERY_ENABLED", true)
}
