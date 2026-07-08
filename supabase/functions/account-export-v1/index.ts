// @ts-nocheck
// RGPD data export ("droit à la portabilité") — structured JSON inside a ZIP,
// delivered through a short-lived signed URL from the private gdpr-exports bucket.
//
// Non-negotiable security posture:
//   1. fresh re-authentication: the password is verified server-side right now;
//   2. immediate out-of-band notification (WhatsApp + email);
//   3. 1 export / 24 h (atomic enforce_rate_limit RPC), plus a tighter limiter
//      on password attempts so this endpoint is not a credential oracle;
//   4. signed URL with a short TTL — never an email attachment.
//
// Scope: what the user sees in the app — profile, transformations & plans,
// conversations, tracking entries, memories. Column allowlists below are the
// contract: NO system prompts, NO internal scores/classifications
// (risk_band, momentum, confidence, sensitivity levels…), NO raw LLM logs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  formatFrenchDate,
  sendInternalWhatsApp,
  verifyPasswordFresh,
} from "../_shared/account_lifecycle.ts";

const EXPORT_BUCKET = "gdpr-exports";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const PAGE = 1000;

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function fetchAllRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  userColumn: string,
  userId: string,
  extra?: (q: any) => any,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < 200; page++) {
    let q = admin
      .from(table)
      .select(columns)
      .eq(userColumn, userId)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Column allowlists — the RGPD scope contract. Everything not listed here
// (internal summaries, generation snapshots, sensitivity/confidence scores,
// embeddings, raw metadata) never leaves the database.
const SCOPE = {
  cycles:
    "id,status,raw_intake_text,duration_months,requested_pace,created_at,completed_at,archived_at",
  transformations:
    "id,cycle_id,priority_order,status,title,user_summary,success_definition,main_constraint,questionnaire_answers,completion_summary,created_at,activated_at,completed_at",
  plans: "id,cycle_id,transformation_id,status,version,title,content,created_at,activated_at,completed_at,archived_at",
  planItems:
    "id,plan_id,dimension,kind,status,title,description,tracking_type,cadence_label,scheduled_days,time_of_day,target_reps,current_reps,created_at,activated_at,completed_at",
  planEntries:
    "id,plan_item_id,entry_kind,outcome,value_numeric,value_text,difficulty_level,blocker_hint,effective_at,created_at",
  memories: "id,kind,content_text,normalized_summary,observed_at,event_start_at,event_end_at,created_at",
  conversations: "role,content,scope,created_at",
};

async function buildExportPayload(
  admin: ReturnType<typeof createClient>,
  user: { id: string; email: string | null; created_at?: string },
) {
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("full_name,email,phone_number,birth_date,gender,timezone,locale,whatsapp_opted_in")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) throw profErr;

  const [cycles, transformations, plans, planItems, planEntries, memories, conversations] =
    await Promise.all([
      fetchAllRows(admin, "user_cycles", SCOPE.cycles, "user_id", user.id),
      // user_transformations hangs off user_cycles (no user_id of its own).
      (async () => {
        const { data: cycleIds, error } = await admin
          .from("user_cycles")
          .select("id")
          .eq("user_id", user.id);
        if (error) throw error;
        const ids = (cycleIds ?? []).map((c) => c.id);
        if (ids.length === 0) return [];
        const { data, error: trErr } = await admin
          .from("user_transformations")
          .select(SCOPE.transformations)
          .in("cycle_id", ids)
          .order("created_at", { ascending: true });
        if (trErr) throw trErr;
        return data ?? [];
      })(),
      fetchAllRows(admin, "user_plans_v2", SCOPE.plans, "user_id", user.id),
      fetchAllRows(admin, "user_plan_items", SCOPE.planItems, "user_id", user.id),
      fetchAllRows(admin, "user_plan_item_entries", SCOPE.planEntries, "user_id", user.id),
      fetchAllRows(
        admin,
        "memory_items",
        SCOPE.memories,
        "user_id",
        user.id,
        // Memories as the user would see them: active knowledge only, not
        // superseded/hidden internals.
        (q) => q.in("status", ["candidate", "active"]),
      ),
      fetchAllRows(
        admin,
        "chat_messages",
        SCOPE.conversations,
        "user_id",
        user.id,
        (q) => q.in("role", ["user", "assistant"]),
      ),
    ]);

  const exportedAt = new Date().toISOString();
  return {
    exportedAt,
    files: {
      "profil.json": {
        exporte_le: exportedAt,
        email_du_compte: user.email ?? profile?.email ?? null,
        compte_cree_le: user.created_at ?? null,
        nom_complet: profile?.full_name ?? null,
        telephone: profile?.phone_number ?? null,
        date_de_naissance: profile?.birth_date ?? null,
        genre: profile?.gender ?? null,
        fuseau_horaire: profile?.timezone ?? null,
        langue: profile?.locale ?? null,
        whatsapp_active: Boolean(profile?.whatsapp_opted_in),
      },
      "transformations.json": { cycles, transformations },
      "plans.json": { plans, actions: planItems },
      "suivi.json": { entrees: planEntries },
      "souvenirs.json": { souvenirs: memories },
      "conversations.json": { messages: conversations },
    },
  };
}

function readmeText(exportedAtIso: string): string {
  return [
    "EXPORT DE TES DONNÉES SOPHIA",
    "============================",
    "",
    `Export généré le : ${formatFrenchDate(exportedAtIso)}`,
    "",
    "Contenu de l'archive :",
    "  - profil.json          : tes informations de compte (nom, email, téléphone…).",
    "  - transformations.json : tes cycles et transformations tels que visibles dans l'app.",
    "  - plans.json           : tes plans et les actions qui les composent.",
    "  - suivi.json           : tes entrées de suivi (check-ins, progrès, blocages).",
    "  - souvenirs.json       : les souvenirs que Sophia a retenus de vos échanges.",
    "  - conversations.json   : l'historique de tes conversations avec Sophia.",
    "",
    "⚠ AVERTISSEMENT",
    "Ce fichier contient des données personnelles sensibles (dont l'historique de",
    "tes conversations). Conserve-le en lieu sûr, ne le partage pas et supprime-le",
    "des espaces partagés ou synchronisés si tu n'en as plus besoin.",
    "",
    "Format : JSON (UTF-8), lisible avec n'importe quel éditeur de texte.",
    "Pour toute question : sophia@sophia-coach.ai",
    "",
  ].join("\n");
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    currentUserId = user.id;

    // (3a) Password attempts limiter — before touching GoTrue.
    const authRate = await enforceRateLimit(req, requestId, {
      key: `gdpr-export-auth:${user.id}`,
      windows: [
        { limit: 5, windowSeconds: 3600 },
        { limit: 10, windowSeconds: 86_400 },
      ],
    });
    if (authRate) return authRate;

    // (1) Fresh re-authentication.
    const body = await req.json().catch(() => ({}));
    const passwordOk = await verifyPasswordFresh({
      createClient,
      email: user.email ?? "",
      password: String(body?.password ?? ""),
    });
    if (!passwordOk) {
      return jsonResponse(req, { error: "invalid_password", request_id: requestId }, { status: 403 });
    }

    // (3b) The actual export quota: 1 / 24 h, only counted after a valid password.
    const exportRate = await enforceRateLimit(req, requestId, {
      key: `gdpr-export:${user.id}`,
      windows: [{ limit: 1, windowSeconds: 86_400 }],
    });
    if (exportRate) return exportRate;

    const admin = createClient(supabaseUrl, supabaseServiceRole);

    // (2) Out-of-band notification, fired before delivery so a hijacked session
    // can't quietly siphon the archive.
    const notifyBody =
      "Un export de tes données Sophia vient d'être demandé depuis ton compte. " +
      "Si ce n'est pas toi, change ton mot de passe immédiatement.";
    const [waNotified, emailResult] = await Promise.all([
      sendInternalWhatsApp({
        user_id: user.id,
        purpose: "gdpr_export_requested",
        body: notifyBody,
        metadata_extra: { gdpr_export: true },
      }),
      user.email
        ? sendResendEmail({
          to: user.email,
          subject: "Sophia — un export de tes données vient d'être demandé",
          html:
            `<p>Bonjour,</p><p>${notifyBody}</p><p>— L'équipe Sophia</p>`,
        })
        : Promise.resolve({ ok: false, error: "no_email" }),
    ]);

    // Build the archive.
    const payload = await buildExportPayload(admin, user);
    const zipEntries: Record<string, Uint8Array> = {
      "README.txt": strToU8(readmeText(payload.exportedAt)),
    };
    for (const [name, content] of Object.entries(payload.files)) {
      zipEntries[name] = strToU8(JSON.stringify(content, null, 2));
    }
    const zipBytes = zipSync(zipEntries, { level: 6 });

    // One export at a time per user: previous archives are replaced.
    try {
      const { data: existing } = await admin.storage.from(EXPORT_BUCKET).list(user.id);
      const stale = (existing ?? []).map((o) => `${user.id}/${o.name}`);
      if (stale.length > 0) await admin.storage.from(EXPORT_BUCKET).remove(stale);
    } catch (err) {
      console.warn("[account-export-v1] stale export cleanup failed (non-blocking)", err);
    }

    const objectPath = `${user.id}/export-sophia-${payload.exportedAt.slice(0, 10)}-${requestId.slice(0, 8)}.zip`;
    const { error: uploadErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(objectPath, zipBytes, { contentType: "application/zip", upsert: true });
    if (uploadErr) throw uploadErr;

    // (4) Short-lived signed URL.
    const { data: signed, error: signErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS, {
        download: "export-donnees-sophia.zip",
      });
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("signed_url_failed");

    return jsonResponse(req, {
      ok: true,
      url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      notified_whatsapp: waNotified,
      notified_email: Boolean((emailResult as any)?.ok),
      request_id: requestId,
    });
  } catch (err) {
    console.error("[account-export-v1] error", err);
    await logEdgeFunctionError({
      functionName: "account-export-v1",
      error: err,
      severity: "error",
      title: "gdpr_export_failed",
      requestId,
      userId: currentUserId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});
