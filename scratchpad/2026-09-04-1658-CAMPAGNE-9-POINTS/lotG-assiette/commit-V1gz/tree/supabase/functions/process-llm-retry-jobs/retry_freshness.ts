export function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function completeSkippedJob(
  admin: any,
  jobId: string,
  job: any,
  reason: string,
) {
  const nowIso = new Date().toISOString();
  await admin
    .from("llm_retry_jobs")
    .update({
      status: "completed",
      completed_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...metadataRecord(job?.metadata),
        skipped: true,
        skip_reason: reason,
        skipped_at: nowIso,
      },
    })
    .eq("id", jobId);
}

export async function whatsappRetrySkipReason(
  admin: any,
  args: {
    job: any;
    userId: string;
    scope: string;
  },
): Promise<string | null> {
  const meta = metadataRecord(args.job?.metadata);
  const sourceChatMessageId = String(meta.source_chat_message_id ?? "").trim();
  if (!sourceChatMessageId) return null;

  const { data: sourceMsg, error: sourceErr } = await admin
    .from("chat_messages")
    .select("id,created_at")
    .eq("id", sourceChatMessageId)
    .eq("user_id", args.userId)
    .eq("scope", args.scope)
    .maybeSingle();
  if (sourceErr) throw sourceErr;

  const sourceCreatedAt = String(
    sourceMsg?.created_at ?? meta.source_chat_message_created_at ?? "",
  ).trim();
  if (!sourceCreatedAt) return null;

  const { data: newer, error: newerErr } = await admin
    .from("chat_messages")
    .select("id,role,created_at")
    .eq("user_id", args.userId)
    .eq("scope", args.scope)
    .gt("created_at", sourceCreatedAt)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (newerErr) throw newerErr;

  const role = String(newer?.role ?? "");
  if (role === "assistant") return "already_answered";
  if (role === "user") return "newer_user_message";
  return null;
}
