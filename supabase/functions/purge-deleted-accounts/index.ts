// @ts-nocheck
// J+7 hard purge of accounts flagged deletion_pending (internal cron, daily).
//
// Idempotent and crash-resumable by construction: the profile row (and thus the
// selection criterion) only disappears at the very last step (auth user delete),
// so a run that dies mid-user simply redoes that user on the next tick. Every
// intermediate write is an upsert or an unconditional DELETE.
//
// Per-user order:
//   1. upsert the anonymised proof into deletion_records (hashes only)
//   2. delete storage objects (gdpr-exports/<user_id>/…)
//   3. explicit deletes for tables whose FK is ON DELETE SET NULL but whose rows
//      still carry personal data (message contents, phone numbers, error payloads)
//   4. auth.admin.deleteUser → cascades profiles + the ~80 ON DELETE CASCADE tables;
//      llm_usage_events is anonymised (user_id → NULL) by its SET NULL FK, keeping
//      cost accounting without personal data.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  ACCOUNT_STATUS_DELETION_PENDING,
  hashEmail,
  hashPhone,
  hashUserId,
} from "../_shared/account_lifecycle.ts";

const BATCH_SIZE = 25;
const EXPORT_BUCKET = "gdpr-exports";

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function deleteUserExports(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data: objects, error } = await admin.storage.from(EXPORT_BUCKET).list(userId);
  if (error) {
    // Bucket missing locally is not a purge blocker.
    console.warn(`[purge-deleted-accounts] storage list failed for ${userId}`, error);
    return;
  }
  const paths = (objects ?? []).map((o) => `${userId}/${o.name}`);
  if (paths.length > 0) {
    const { error: rmErr } = await admin.storage.from(EXPORT_BUCKET).remove(paths);
    if (rmErr) throw rmErr;
  }
}

async function purgeWhatsAppTraces(
  admin: ReturnType<typeof createClient>,
  userId: string,
  phoneDigits: string,
): Promise<void> {
  // whatsapp_outbound_status_events has no FK at all; it links back via
  // provider_message_id and carries the recipient's phone in recipient_id.
  const providerIds: string[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await admin
      .from("whatsapp_outbound_messages")
      .select("provider_message_id")
      .eq("user_id", userId)
      .not("provider_message_id", "is", null)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = String(row?.provider_message_id ?? "").trim();
      if (id) providerIds.push(id);
    }
    if (!data || data.length < 1000) break;
  }
  for (const ids of chunk(providerIds, 200)) {
    const { error } = await admin
      .from("whatsapp_outbound_status_events")
      .delete()
      .in("provider_message_id", ids);
    if (error) throw error;
  }
  if (phoneDigits) {
    const { error } = await admin
      .from("whatsapp_outbound_status_events")
      .delete()
      .eq("recipient_id", phoneDigits);
    if (error) throw error;
  }

  // ON DELETE SET NULL tables that still hold personal data → hard delete.
  const { error: costErr } = await admin
    .from("whatsapp_cost_events")
    .delete()
    .eq("user_id", userId);
  if (costErr) throw costErr;
  const { error: outErr } = await admin
    .from("whatsapp_outbound_messages")
    .delete()
    .eq("user_id", userId);
  if (outErr) throw outErr;
  const { error: linkErr } = await admin
    .from("whatsapp_link_requests")
    .delete()
    .eq("linked_user_id", userId);
  if (linkErr) throw linkErr;
}

async function purgeOneUser(
  admin: ReturnType<typeof createClient>,
  profile: { id: string; email: string | null; phone_number: string | null },
): Promise<void> {
  const userId = profile.id;

  // Canonical email lives in auth; profiles.email can lag behind.
  let authEmail: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    authEmail = data?.user?.email ?? null;
  } catch {
    // The auth user may already be gone from a previous partial run.
  }

  // 1) Proof of deletion first: if we crash later, the retry upserts the same
  //    row (user_id_hash is unique) without duplicating it.
  const record = {
    user_id_hash: await hashUserId(userId),
    email_hash: await hashEmail(authEmail ?? profile.email),
    phone_hash: await hashPhone(profile.phone_number),
  };
  const { error: recErr } = await admin
    .from("deletion_records")
    .upsert(record, { onConflict: "user_id_hash", ignoreDuplicates: true });
  if (recErr) throw recErr;

  // 2) Stored exports.
  await deleteUserExports(admin, userId);

  // 3) Personal data in SET-NULL / FK-less tables.
  const phoneDigits = String(profile.phone_number ?? "").replace(/\D/g, "");
  await purgeWhatsAppTraces(admin, userId, phoneDigits);
  const { error: selErr } = await admin
    .from("system_error_logs")
    .delete()
    .eq("user_id", userId);
  if (selErr) throw selErr;

  // 4) Final step: delete the auth user (SQL RPC — see purge_auth_user in the
  //    migration). This cascades profiles and every ON DELETE CASCADE table,
  //    and anonymises llm_usage_events via SET NULL. Deleting an already-gone
  //    user is a no-op, which keeps re-runs safe.
  const { error: delErr } = await admin.rpc("purge_auth_user", { p_user_id: userId });
  if (delErr) throw delErr;
  // Orphaned profile without an auth user (should not happen, but a partial
  // historical state must not wedge the purge forever).
  const { error: orphanErr } = await admin.from("profiles").delete().eq("id", userId);
  if (orphanErr) throw orphanErr;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  const guard = ensureInternalRequest(req);
  if (guard) return guard;

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();
    let purged = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    // Loop until the batch drains; a failing user is skipped (it stays selected,
    // so we must not loop forever on it — hence the seen-set).
    const seen = new Set<string>();
    for (let round = 0; round < 40; round++) {
      const { data: due, error } = await admin
        .from("profiles")
        .select("id,email,phone_number")
        .eq("account_status", ACCOUNT_STATUS_DELETION_PENDING)
        .lte("purge_at", nowIso)
        .order("purge_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (error) throw error;

      const fresh = (due ?? []).filter((p) => !seen.has(p.id));
      if (fresh.length === 0) break;

      for (const profile of fresh) {
        seen.add(profile.id);
        try {
          await purgeOneUser(admin, profile);
          purged++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[purge-deleted-accounts] purge failed for ${profile.id}`, err);
          errors.push({ user_id: profile.id, error: msg });
          await logEdgeFunctionError({
            functionName: "purge-deleted-accounts",
            error: err,
            severity: "error",
            title: "purge_failed_for_user",
            requestId,
            userId: profile.id,
            source: "edge",
          });
        }
      }
    }

    return jsonResponse(
      req,
      { ok: true, purged, errors, request_id: requestId },
      { includeCors: false },
    );
  } catch (err) {
    console.error("[purge-deleted-accounts] error", err);
    await logEdgeFunctionError({
      functionName: "purge-deleted-accounts",
      error: err,
      severity: "error",
      title: "purge_run_failed",
      requestId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return jsonResponse(req, { error: msg, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
