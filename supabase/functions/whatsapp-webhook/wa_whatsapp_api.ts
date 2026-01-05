export async function sendWhatsAppText(toE164: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim()
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim()
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID")

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
  const payload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "text",
    text: { body },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // In Meta test mode, the Cloud API phone number can only message recipients added to the allowlist
    // in "WhatsApp -> API Setup -> To". When missing, Meta returns code 131030.
    const metaCode = (data as any)?.error?.code
    if (res.status === 400 && metaCode === 131030) {
      console.warn("[whatsapp] recipient not in allowed list (Meta test mode)", {
        to: toE164,
        phone_number_id: phoneNumberId,
        status: res.status,
        metaCode,
        details: (data as any)?.error?.error_data?.details ?? null,
      })
      return { skipped: true, reason: "recipient_not_allowed_list", meta: data } as any
    }
    throw new Error(`WhatsApp send failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data as any
}


