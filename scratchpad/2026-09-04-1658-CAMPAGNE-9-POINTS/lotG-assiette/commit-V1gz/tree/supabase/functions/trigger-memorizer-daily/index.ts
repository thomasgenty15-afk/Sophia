/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import { runMemorizerAsyncIfEnabled } from "../_shared/memory/memorizer/memorizer_async.ts";
import { SupabaseMemorizerRepository } from "../_shared/memory/memorizer/persist.ts";
import type {
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
} from "../_shared/memory/memorizer/types.ts";
import {
  actionFamilyAliases,
  buildActionFamilyKey,
} from "../_shared/memory/action_family.ts";

const DEFAULT_USER_LIMIT = 100;
const DEFAULT_HOURS = 30;

function logDailyMemorizer(
  event: string,
  payload: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
) {
  const line = JSON.stringify({
    tag: "trigger-memorizer-daily",
    event,
    ...payload,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function optionalPositiveLimit(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.floor(n));
}

function clampHours(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_HOURS);
  if (!Number.isFinite(n)) return DEFAULT_HOURS;
  return Math.max(1, Math.min(72, Math.floor(n)));
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function loadCandidateUsers(args: {
  admin: any;
  since_iso: string;
  user_id: string;
  limit: number;
}): Promise<Array<{ id: string; timezone: string | null }>> {
  if (args.user_id) {
    const { data, error } = await args.admin
      .from("profiles")
      .select("id,timezone,account_status")
      .eq("id", args.user_id)
      .maybeSingle();
    if (error) throw error;
    // RGPD: accounts pending deletion are excluded from all proactive processing.
    if (data?.account_status === "deletion_pending") {
      console.log(
        `[trigger-memorizer-daily] skip user ${args.user_id}: account deletion_pending`,
      );
      return [];
    }
    return [{
      id: args.user_id,
      timezone: data?.timezone ?? null,
    }];
  }

  const { data, error } = await args.admin
    .from("chat_messages")
    .select("user_id")
    .eq("role", "user")
    .gte("created_at", args.since_iso)
    .order("created_at", { ascending: false })
    .limit(Math.max(args.limit * 20, args.limit));
  if (error) throw error;

  const userIds: string[] = [
    ...new Set<string>(
      (data ?? []).map((row: any) => String(row.user_id ?? "")).filter(Boolean),
    ),
  ].slice(0, args.limit);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await args.admin
    .from("profiles")
    .select("id,timezone")
    .in("id", userIds)
    .neq("account_status", "deletion_pending");
  if (profileError) throw profileError;

  const timezoneByUser = new Map<string, string | null>(
    (profiles ?? []).map((row: any): [string, string | null] => [
      String(row.id),
      row.timezone == null ? null : String(row.timezone),
    ]),
  );
  return userIds
    .filter((id) => timezoneByUser.has(id))
    .map((id) => ({
      id,
      timezone: timezoneByUser.get(id) ?? null,
    }));
}

// Les erreurs du client Supabase sont souvent des objets plats (pas des
// instances Error): String(error) donnerait "[object Object]" et masquerait
// la cause reelle (ex: "URI too long").
export function readableErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  if (typeof error === "string") return error;
  const anyErr = error as any;
  if (typeof anyErr?.message === "string" && anyErr.message) {
    const details = typeof anyErr?.details === "string" && anyErr.details
      ? ` (${anyErr.details})`
      : "";
    const code = typeof anyErr?.code === "string" && anyErr.code
      ? ` [${anyErr.code}]`
      : "";
    return `${anyErr.message}${details}${code}`;
  }
  try {
    return JSON.stringify(error ?? null);
  } catch {
    return String(error);
  }
}

// Reprise des batchs interrompus (nina-r2/paul-r4/rose-r2, BF-EFFECT-04):
// un worker tue en vol (timeout gateway) laissait un run `running` orphelin
// avec des messages deja marques `completed` et 0 memory_item — le retry
// repondait alors `no_unprocessed_messages` et la memoire du jour etait
// perdue definitivement. Invariant retabli: aucun `memory_message_processing`
// completed rattache a un run non termine au-dela du TTL. La re-extraction
// est idempotente (dedupe contre les items deja persistes).
export const ORPHAN_RUN_TTL_MINUTES = 30;

export async function recoverOrphanExtractionRuns(args: {
  admin: any;
  user_id: string;
  ttl_minutes?: number;
  now?: Date;
}): Promise<{
  recovered_run_ids: string[];
  released_message_count: number;
}> {
  const ttlMinutes = Math.max(1, args.ttl_minutes ?? ORPHAN_RUN_TTL_MINUTES);
  const nowMs = (args.now ?? new Date()).getTime();
  const cutoffIso = new Date(nowMs - ttlMinutes * 60_000).toISOString();
  const { data: orphanRuns, error: orphanError } = await args.admin
    .from("memory_extraction_runs")
    .select("id,created_at,metadata")
    .eq("user_id", args.user_id)
    .eq("status", "running")
    .lt("created_at", cutoffIso);
  if (orphanError) throw orphanError;
  const runs = Array.isArray(orphanRuns) ? orphanRuns : [];
  if (runs.length === 0) {
    return { recovered_run_ids: [], released_message_count: 0 };
  }
  let releasedMessageCount = 0;
  const recoveredRunIds: string[] = [];
  for (const run of runs) {
    const runId = String((run as any).id);
    const { data: released, error: releaseError } = await args.admin
      .from("memory_message_processing")
      .delete()
      .eq("user_id", args.user_id)
      .eq("extraction_run_id", runId)
      .select("message_id");
    if (releaseError) throw releaseError;
    releasedMessageCount += Array.isArray(released) ? released.length : 0;
    const { error: failError } = await args.admin
      .from("memory_extraction_runs")
      .update({
        status: "failed",
        finished_at: new Date(nowMs).toISOString(),
        error_message: "orphan_running_recovered",
        metadata: {
          ...(((run as any).metadata ?? {}) as Record<string, unknown>),
          orphan_recovered: true,
          orphan_ttl_minutes: ttlMinutes,
        },
      })
      .eq("id", runId)
      .eq("status", "running");
    if (failError) throw failError;
    recoveredRunIds.push(runId);
  }
  return {
    recovered_run_ids: recoveredRunIds,
    released_message_count: releasedMessageCount,
  };
}

// PostgREST encode `.in(...)` dans l'URL GET: au-dela de quelques centaines
// d'ids, la requete depasse la limite d'URI et le batch entier echoue
// ("URI too long") — aucun memory_item ecrit. On requete donc par paquets
// bornes et on unionne les resultats.
export const PROCESSED_IDS_CHUNK_SIZE = 100;

export async function loadProcessedMessageIds(args: {
  admin: any;
  user_id: string;
  message_ids: string[];
  chunk_size?: number;
}): Promise<Set<string>> {
  const chunkSize = Math.max(1, args.chunk_size ?? PROCESSED_IDS_CHUNK_SIZE);
  const processedIds = new Set<string>();
  for (let start = 0; start < args.message_ids.length; start += chunkSize) {
    const chunk = args.message_ids.slice(start, start + chunkSize);
    const { data: processed, error: processedError } = await args.admin
      .from("memory_message_processing")
      .select("message_id")
      .eq("user_id", args.user_id)
      .eq("processing_role", "primary")
      .eq("processing_status", "completed")
      .in("message_id", chunk);
    if (processedError) throw processedError;
    for (const row of processed ?? []) {
      processedIds.add(String((row as any).message_id));
    }
  }
  return processedIds;
}

async function loadUnprocessedMessages(args: {
  admin: any;
  user_id: string;
  since_iso: string;
  limit?: number | null;
}): Promise<MemorizerMessage[]> {
  let query = args.admin
    .from("chat_messages")
    .select("id,user_id,role,content,created_at,metadata")
    .eq("user_id", args.user_id)
    .eq("role", "user")
    .gte("created_at", args.since_iso)
    .order("created_at", { ascending: true });
  if (args.limit != null) query = query.limit(args.limit);

  const { data: messages, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(messages) ? messages : [];
  if (rows.length === 0) return [];

  const ids = rows.map((row: any) => String(row.id));
  const processedIds = await loadProcessedMessageIds({
    admin: args.admin,
    user_id: args.user_id,
    message_ids: ids,
  });

  return rows
    .filter((row: any) => !processedIds.has(String(row.id)))
    .map((row: any) => ({
      id: String(row.id),
      user_id: args.user_id,
      role: "user",
      content: String(row.content ?? ""),
      created_at: row.created_at ?? null,
      metadata: row.metadata ?? {},
    }));
}

async function loadKnownTopics(
  admin: any,
  userId: string,
): Promise<KnownTopic[]> {
  const { data, error } = await admin
    .from("user_topic_memories")
    .select("id,slug,title,lifecycle_stage,search_doc,status,metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    metadata: row.metadata ?? {},
    id: String(row.id),
    slug: row.slug ?? null,
    title: String(row.title ?? ""),
    lifecycle_stage: row.lifecycle_stage ?? null,
    search_doc: row.search_doc ?? null,
    domain_keys: Array.isArray(row.metadata?.domain_keys)
      ? row.metadata.domain_keys.map(String)
      : [],
  }));
}

async function loadKnownMemoryItems(
  admin: any,
  userId: string,
): Promise<KnownMemoryItem[]> {
  const { data, error } = await admin
    .from("memory_items")
    .select(
      "id,kind,content_text,normalized_summary,canonical_key,domain_keys,status,source_message_id,event_start_at,event_end_at",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as KnownMemoryItem[];
}

function numericOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

async function loadPlanSignals(_args: {
  admin: any;
  user_id: string;
  since_iso: string;
}): Promise<PlanSignal[]> {
  // RETRAIT RÉSIDUS (2026-08-08): les tables du plan V2 (user_plan_items,
  // user_plan_item_entries) sont supprimées — 0 utilisateur grand public.
  // Même motif que user_metric_entries en phase 1: le tableau vide que la
  // requête aurait produit, sans l'appel réseau.
  return [];
}

async function loadExtractionRunSummary(
  admin: any,
  extractionRunId: string | null | undefined,
) {
  if (!extractionRunId) return null;
  const { data, error } = await admin
    .from("memory_extraction_runs")
    .select(
      "id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,proposed_entity_count,accepted_entity_count,duration_ms,error_message,metadata",
    )
    .eq("id", extractionRunId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const metadata = data.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
  const durableWrites = metadata.durable_writes &&
      typeof metadata.durable_writes === "object"
    ? metadata.durable_writes
    : {};
  const rejected = Array.isArray(metadata.rejected_observations)
    ? metadata.rejected_observations
    : [];
  const writeDecisions = Array.isArray(metadata.write_decisions)
    ? metadata.write_decisions
    : [];
  const rejectionReasons = rejected.reduce(
    (acc: Record<string, number>, entry: any) => {
      const reason = String(entry?.reason ?? "unknown");
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const decisionStatuses = writeDecisions.reduce(
    (acc: Record<string, number>, entry: any) => {
      const status = String(entry?.status ?? "unknown");
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  return {
    id: data.id,
    status: data.status,
    trigger_type: data.trigger_type,
    proposed_item_count: data.proposed_item_count ?? 0,
    accepted_item_count: data.accepted_item_count ?? 0,
    rejected_item_count: data.rejected_item_count ?? 0,
    proposed_entity_count: data.proposed_entity_count ?? 0,
    accepted_entity_count: data.accepted_entity_count ?? 0,
    duration_ms: data.duration_ms ?? null,
    error_message: data.error_message ?? null,
    durable_writes: durableWrites,
    pre_filter_skip_count: metadata.pre_filter_skip_count ?? 0,
    statement_as_fact_violation_count:
      metadata.statement_as_fact_violation_count ?? 0,
    rejection_reasons: rejectionReasons,
    write_decision_statuses: decisionStatuses,
  };
}

async function runDailyMemorizerForUser(args: {
  admin: any;
  user_id: string;
  messages: MemorizerMessage[];
  since_iso: string;
}) {
  if (args.messages.length === 0) {
    return {
      status: "skipped",
      reason: "no_unprocessed_messages",
      processed_message_count: 0,
      persisted_count: 0,
    };
  }

  const knownTopics = await loadKnownTopics(args.admin, args.user_id);
  const knownItems = await loadKnownMemoryItems(args.admin, args.user_id);
  const planSignals = await loadPlanSignals({
    admin: args.admin,
    user_id: args.user_id,
    since_iso: args.since_iso,
  });
  logDailyMemorizer("user_context_loaded", {
    user_id: args.user_id,
    message_count: args.messages.length,
    known_topics_count: knownTopics.length,
    known_memory_items_count: knownItems.length,
    plan_signal_count: planSignals.length,
  });
  // P2-5b (eva-global17 R1-B05, paul-untested R1-B06): les instructions des
  // rappels reels alimentent le filtre write-policy « objet rappel » — un
  // item memoire qui recouvre une instruction de rappel + un horaire est un
  // etat d'outil, jamais un fait de vie.
  const reminderInstructions = await loadReminderInstructions(
    args.admin,
    args.user_id,
  );
  const userProfile = await loadUserProfileForExtraction(
    args.admin,
    args.user_id,
  );
  const result = await runMemorizerAsyncIfEnabled(
    new SupabaseMemorizerRepository(args.admin),
    {
      user_id: args.user_id,
      messages: args.messages,
      known_topics: knownTopics,
      existing_memory_items: knownItems,
      plan_signals: planSignals,
      active_topic: knownTopics[0] ?? null,
      trigger_type: "daily_batch",
      reminder_instructions: reminderInstructions,
      user_profile: userProfile,
    },
  );
  const extractionRunSummary = await loadExtractionRunSummary(
    args.admin,
    result?.extraction_run_id,
  );

  return {
    status: result?.status ?? "disabled",
    reason: result?.skip_reason ?? null,
    processed_message_count: result?.status === "completed"
      ? args.messages.length
      : 0,
    persisted_count: result?.persisted.length ?? 0,
    extraction_run_id: result?.extraction_run_id ?? null,
    batch_hash: result?.batch_hash ?? null,
    write_decision_count: result?.write_decisions.length ?? 0,
    extraction_run: extractionRunSummary,
  };
}

async function handleRequest(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  try {
    logDailyMemorizer("request_received", {
      request_id: requestId,
      method: req.method,
      has_internal_secret_header: Boolean(req.headers.get("x-internal-secret")),
      has_authorization_header: Boolean(req.headers.get("authorization")),
    });
    const authResp = ensureInternalRequest(req);
    if (authResp) {
      logDailyMemorizer("request_rejected_by_internal_auth", {
        request_id: requestId,
        status: authResp.status,
      }, "warn");
      return authResp;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const admin = adminClient();
    const hours = clampHours(payload.hours);
    const sinceIso = cleanText(payload.since_iso) ||
      new Date(Date.now() - hours * 3_600_000).toISOString();
    const userLimit = clampLimit(payload.user_limit, DEFAULT_USER_LIMIT, 500);
    const messageLimit = optionalPositiveLimit(payload.message_limit);
    const userId = cleanText(payload.user_id);
    logDailyMemorizer("request_configured", {
      request_id: requestId,
      user_id: userId || null,
      since_iso: sinceIso,
      hours,
      user_limit: userLimit,
      message_limit: messageLimit ?? null,
      memory_observability_on:
        String(Deno.env.get("MEMORY_OBSERVABILITY_ON") ?? "").trim() || null,
      memorizer_enabled:
        String(Deno.env.get("memory_v2_memorizer_enabled") ?? "").trim() ||
        null,
      memorizer_disabled:
        String(Deno.env.get("memory_v2_memorizer_disabled") ?? "").trim() ||
        null,
    });
    const users = await loadCandidateUsers({
      admin,
      since_iso: sinceIso,
      user_id: userId,
      limit: userLimit,
    });
    logDailyMemorizer("candidate_users_loaded", {
      request_id: requestId,
      candidate_user_count: users.length,
      user_ids: users.map((user) => user.id).slice(0, 20),
    });

    const processed = [];
    for (const user of users) {
      logDailyMemorizer("user_started", {
        request_id: requestId,
        user_id: user.id,
        timezone: user.timezone ?? "Europe/Paris",
      });
      const orphanRecovery = await recoverOrphanExtractionRuns({
        admin,
        user_id: user.id,
      });
      if (orphanRecovery.recovered_run_ids.length > 0) {
        logDailyMemorizer("orphan_runs_recovered", {
          request_id: requestId,
          user_id: user.id,
          ...orphanRecovery,
        }, "warn");
      }
      const messages = await loadUnprocessedMessages({
        admin,
        user_id: user.id,
        since_iso: sinceIso,
        limit: messageLimit,
      });
      logDailyMemorizer("messages_loaded", {
        request_id: requestId,
        user_id: user.id,
        message_count: messages.length,
        message_ids: messages.map((message) => message.id).slice(0, 20),
      });
      const memorizer = await runDailyMemorizerForUser({
        admin,
        user_id: user.id,
        messages,
        since_iso: sinceIso,
      });
      logDailyMemorizer("user_completed", {
        request_id: requestId,
        user_id: user.id,
        message_count: messages.length,
        memorizer,
      });
      await logMemoryObservabilityEvent({
        supabase: admin,
        userId: user.id,
        requestId,
        sourceComponent: "trigger-memorizer-daily",
        eventName: "memory.daily_memorizer.completed",
        payload: {
          since_iso: sinceIso,
          hours,
          message_limit: messageLimit ?? null,
          message_count: messages.length,
          memorizer,
        },
      });
      processed.push({
        user_id: user.id,
        timezone: user.timezone ?? "Europe/Paris",
        message_count: messages.length,
        memorizer,
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      since_iso: sinceIso,
      processed_count: processed.length,
      processed,
    });
  } catch (error) {
    logDailyMemorizer("request_failed", {
      request_id: requestId,
      error: readableErrorMessage(error),
    }, "error");
    await logEdgeFunctionError({
      functionName: "trigger-memorizer-daily",
      severity: "error",
      title: "daily_memorizer_failed",
      error,
      requestId,
      source: "internal",
    });
    return jsonResponse(req, {
      ok: false,
      request_id: requestId,
      error: readableErrorMessage(error),
    }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

// P2-5b: instructions des rappels ponctuels du user (tous statuts, 14 jours)
// pour le filtre write-policy « objet rappel » du memorizer.
async function loadReminderInstructions(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  try {
    const sinceIso = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();
    const { data, error } = await (admin as any)
      .from("scheduled_checkins")
      .select("message_payload")
      .eq("user_id", userId)
      .like("event_context", "one_shot_reminder:%")
      .gte("created_at", sinceIso)
      .limit(50);
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map((row: any) =>
        String(row?.message_payload?.reminder_instruction ?? "").trim()
      )
      .filter(Boolean);
  } catch (_error) {
    // best-effort: sans instructions, le filtre garde son volet lexical.
    return [];
  }
}

// P2-5c (nina-untested R1-B07): prenom/genre pour la redaction des items —
// sans eux, l'extraction inferait le masculin par defaut.
//
// 🔴 CE CHARGEUR ETAIT MORT DEPUIS SA CREATION (QA agent 4, 2026-08-03).
// Il selectionnait `first_name`, une colonne qui N'EXISTE PAS sur `profiles`
// (c'est `full_name`). PostgREST rendait une erreur, le `catch` la mangeait et
// rendait `null` — donc `user_profile` etait TOUJOURS null, et la regle
// « GENRE ET STYLE DE REDACTION » du prompt d'extraction, ecrite exprès pour
// corriger un incident de mauvais genre, n'a jamais eu de donnee a lire.
//
// Le try/catch silencieux est ce qui a rendu la panne invisible: une colonne
// absente est une erreur de SCHEMA, pas un aleas reseau, et elle ne devrait
// jamais se degrader en « pas de profil ». Le catch est conserve (une panne de
// lecture ne doit pas tuer le batch memoire d'un user) mais il LOGUE
// desormais, et il distingue les deux cas.
async function loadUserProfileForExtraction(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<
  { first_name: string | null; gender: string | null; locale: string | null } | null
> {
  try {
    const { data, error } = await (admin as any)
      .from("profiles")
      .select("full_name,gender,locale")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      // `full_name` est le nom REEL de la colonne. On n'envoie que le premier
      // mot: le prompt demande un PRENOM pour tutoyer correctement, pas une
      // identite civile complete dans chaque item de memoire.
      first_name: String(data.full_name ?? "").trim().split(/\s+/)[0] || null,
      gender: String(data.gender ?? "").trim() || null,
      // QA agent 4: la LANGUE de la mémoire. Sans elle, le prompt d'extraction
      // écrivait en français en dur, y compris pour un élève `en-GB` — mesuré
      // le 2026-08-03 (4 items français sur un élève anglais).
      locale: String(data.locale ?? "").trim() || null,
    };
  } catch (error) {
    // Bruyant, R7: c'est exactement le silence qui a laisse ce chargeur mort
    // pendant toute sa vie. Le batch continue (une memoire sans prenom vaut
    // mieux que pas de memoire), mais l'incident est nomme.
    console.warn("[memorizer] user_profile load failed", {
      user_id: userId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
