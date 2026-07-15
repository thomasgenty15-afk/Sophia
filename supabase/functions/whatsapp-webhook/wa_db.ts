export async function loadHistory(
  admin: any,
  userId: string,
  limit = 20,
  scope = "whatsapp",
) {
  const { data, error } = await admin.from("chat_messages").select(
    "role, content, created_at",
  ).eq("user_id", userId).eq("scope", scope).order("created_at", {
    ascending: false,
  }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []).slice().reverse();
  return rows.map((r: any) => ({
    role: r.role,
    content: r.content,
    created_at: r.created_at,
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
  const { data, error } = await admin.from("whatsapp_pending_actions").select(
    "id, kind, status, scheduled_checkin_id, payload, created_at, expires_at",
  ).eq("user_id", userId).eq("kind", kind).eq("status", "pending").order(
    "created_at",
    {
      ascending: false,
    },
  ).limit(20);
  if (error) throw error;
  const rows = data ?? [];
  for (const row of rows) {
    const expiresAt = typeof row?.expires_at === "string"
      ? row.expires_at
      : null;
    if (expiresAt && expiresAt <= nowIso) {
      await admin.from("whatsapp_pending_actions").update({
        status: "expired",
        processed_at: nowIso,
      }).eq("id", row.id).eq("status", "pending");
      continue;
    }
    return row;
  }
  return null;
}
// Resolve the pending action a quick-reply button actually answers, using the
// wamid of the template it replied to (`context.id`). Chains:
//   inbound context.id
//     → whatsapp_outbound_messages.provider_message_id
//     → metadata.original_checkin_id
//     → whatsapp_pending_actions.scheduled_checkin_id (status = pending)
// Returns null when nothing links up, so callers fall back to the latest pending.
export async function resolvePendingByReplyContext(
  admin: any,
  userId: string,
  kind: string,
  replyToWaMessageId: string | null | undefined,
) {
  const replyWamid = String(replyToWaMessageId ?? "").trim();
  if (!replyWamid) return null;

  const { data: outbound, error: outboundErr } = await admin
    .from("whatsapp_outbound_messages")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider_message_id", replyWamid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (outboundErr) throw outboundErr;
  const originalCheckinId = String(
    (outbound?.metadata as any)?.original_checkin_id ?? "",
  ).trim();
  const eventContext = String(
    (outbound?.metadata as any)?.event_context ?? "",
  ).trim();
  if (!originalCheckinId && !eventContext) return null;

  const nowIso = new Date().toISOString();
  let pendingQuery = admin
    .from("whatsapp_pending_actions")
    .select(
      "id, kind, status, scheduled_checkin_id, payload, created_at, expires_at",
    )
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "pending");
  pendingQuery = originalCheckinId
    ? pendingQuery.eq("scheduled_checkin_id", originalCheckinId)
    : pendingQuery.filter("payload->>event_context", "eq", eventContext);
  const { data: pending, error: pendErr } = await pendingQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendErr) throw pendErr;
  if (!pending) return null;

  const expiresAt = typeof pending?.expires_at === "string"
    ? pending.expires_at
    : null;
  if (expiresAt && expiresAt <= nowIso) {
    await admin.from("whatsapp_pending_actions").update({
      status: "expired",
      processed_at: nowIso,
    }).eq("id", pending.id).eq("status", "pending");
    return null;
  }
  return pending;
}

export async function markPending(admin: any, id: string, status: string) {
  await admin.from("whatsapp_pending_actions").update({
    status,
    processed_at: new Date().toISOString(),
  }).eq("id", id);
}
