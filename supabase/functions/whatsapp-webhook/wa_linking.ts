function base64Url(bytes) {
  // btoa expects binary string
  let s = "";
  for (const b of bytes)s += String.fromCharCode(b);
  // Base64url without padding
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function newLinkToken() {
  const bytes = new Uint8Array(18) // ~24 chars base64url
  ;
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}
export function extractLinkToken(raw) {
  const t = (raw ?? "").trim();
  const m = t.match(/(?:^|\s)link\s*:\s*([A-Za-z0-9_-]{10,})/i);
  return m ? m[1] : null;
}
export async function createLinkToken(admin, userId, ttlDays = 30) {
  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("whatsapp_link_tokens").insert({
    token,
    user_id: userId,
    status: "active",
    expires_at: expiresAt
  });
  if (error) throw error;
  return {
    token,
    expires_at: expiresAt
  };
}
