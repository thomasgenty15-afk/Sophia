function hexFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function safeEqual(a: string, b: string): boolean {
  // constant-time-ish string compare
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export async function verifyXHubSignature(req: Request, rawBody: ArrayBuffer): Promise<boolean> {
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET")?.trim()
  if (!appSecret) return false

  const header = req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256")
  if (!header) return false

  const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, rawBody)
  const expected = hexFromBuffer(sigBuf)
  return safeEqual(expected, provided)
}


