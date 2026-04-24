export async function loadHistory(
  admin: any,
  userId: string,
  limit = 20,
  scope = "whatsapp",
) {
  const { data, error } = await admin.from("chat_messages").select("role, content, created_at").eq("user_id", userId).eq("scope", scope).order("created_at", {
    ascending: false
  }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []).slice().reverse();
  return rows.map((r: any)=>({
      role: r.role,
      content: r.content,
      created_at: r.created_at
    }));
}
export async function hasWhatsappPersonalFact(admin: any, userId: string) {
  void admin;
  void userId;
  return false;
}
export async function fetchLatestPending(
  admin: any,
  userId: string,
  kind: string,
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_pending_actions").select("id, kind, status, scheduled_checkin_id, payload, created_at, expires_at").eq("user_id", userId).eq("kind", kind).eq("status", "pending").order("created_at", {
    ascending: false
  }).limit(20);
  if (error) throw error;
  const rows = data ?? [];
  for (const row of rows) {
    const expiresAt = typeof row?.expires_at === "string" ? row.expires_at : null;
    if (expiresAt && expiresAt <= nowIso) {
      await admin.from("whatsapp_pending_actions").update({
        status: "expired",
        processed_at: nowIso
      }).eq("id", row.id).eq("status", "pending");
      continue;
    }
    return row;
  }
  return null;
}
export async function markPending(admin: any, id: string, status: string) {
  await admin.from("whatsapp_pending_actions").update({
    status,
    processed_at: new Date().toISOString()
  }).eq("id", id);
}
