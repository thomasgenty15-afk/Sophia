/// <reference path="../../tsserver-shims.d.ts" />

import type { PersistedEffectLedgerEntry } from "./effect_ledger.ts";

const VALID_EFFECT_LEDGER_STATUSES = new Set([
  "requested",
  "allowed",
  "blocked",
  "committed",
  "failed",
  "proposed",
  "delivered",
  "cancelled",
  "superseded",
  "asked",
  "resolved",
  "topic_change",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeEntry(value: unknown): PersistedEffectLedgerEntry | null {
  if (!isRecord(value)) return null;
  const status = String(value.status ?? "");
  if (!VALID_EFFECT_LEDGER_STATUSES.has(status)) return null;
  return {
    turn_id: String(value.turn_id ?? ""),
    user_id: String(value.user_id ?? ""),
    source_message_id: String(value.source_message_id ?? "").trim() || null,
    request_id: String(value.request_id ?? "").trim() || null,
    created_at: String(value.created_at ?? ""),
    status: status as PersistedEffectLedgerEntry["status"],
    effect_type: String(value.effect_type ?? "unknown_effect"),
    operation_type: String(value.operation_type ?? "").trim() || null,
    operation_id: String(value.operation_id ?? "").trim() || null,
    committed_id: String(value.committed_id ?? "").trim() || null,
    tool_id: String(value.tool_id ?? "").trim() || null,
    source: String(value.source ?? "router") as PersistedEffectLedgerEntry[
      "source"
    ],
    reason_code: String(value.reason_code ?? "").trim() || null,
    payload_summary: isRecord(value.payload_summary)
      ? value.payload_summary
      : {},
    db_ref: isRecord(value.db_ref)
      ? {
        table: String(value.db_ref.table ?? "").trim() || null,
        id: String(value.db_ref.id ?? "").trim() || null,
        key: String(value.db_ref.key ?? "").trim() || null,
      }
      : null,
    error_message: String(value.error_message ?? "").trim() || null,
  };
}

function entriesFromTurnSummaryRows(
  rows: unknown[],
): PersistedEffectLedgerEntry[] {
  const entries: PersistedEffectLedgerEntry[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const payload = row.payload;
    if (!isRecord(payload) || payload.tag !== "effect_ledger") continue;
    const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
    for (const rawEntry of rawEntries) {
      const entry = normalizeEntry(rawEntry);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function entriesFromConversationTraceRows(
  rows: unknown[],
): PersistedEffectLedgerEntry[] {
  const entries: PersistedEffectLedgerEntry[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const ledger = row.effect_ledger;
    if (!isRecord(ledger)) continue;
    const rawEntries = Array.isArray(ledger.entries) ? ledger.entries : [];
    for (const rawEntry of rawEntries) {
      if (!isRecord(rawEntry)) continue;
      const entry = normalizeEntry({
        ...rawEntry,
        turn_id: rawEntry.turn_id ?? ledger.turn_id ?? row.turn_id,
        user_id: row.user_id,
        source_message_id: row.source_message_id ?? null,
        request_id: null,
        created_at: row.ts ?? row.created_at ?? "",
      });
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function orderRecent(
  entries: PersistedEffectLedgerEntry[],
  limit: number,
): PersistedEffectLedgerEntry[] {
  return [...entries]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(0, limit));
}

function keepRecentTurnWindow(
  entries: PersistedEffectLedgerEntry[],
  turnLimit: number,
): PersistedEffectLedgerEntry[] {
  if (!Number.isFinite(turnLimit) || turnLimit <= 0) return entries;
  const allowedTurnIds = new Set<string>();
  for (const entry of entries) {
    const turnId = String(entry.turn_id ?? "").trim();
    if (!turnId || allowedTurnIds.has(turnId)) continue;
    if (allowedTurnIds.size >= turnLimit) break;
    allowedTurnIds.add(turnId);
  }
  if (allowedTurnIds.size === 0) return [];
  return entries.filter((entry) => allowedTurnIds.has(entry.turn_id));
}

// Reader for recent execution history only. Callers must still query business
// tables before answering what is active now.
export async function loadRecentEffectHistory(args: {
  supabase: any;
  userId: string;
  limit: number;
  scope?: string | null;
  turnLimit?: number | null;
  sinceIso?: string | null;
}): Promise<PersistedEffectLedgerEntry[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit || 20)));
  const turnLimit = Math.max(
    0,
    Math.min(20, Math.floor(args.turnLimit || 0)),
  );
  const queryLimit = turnLimit > 0 ? Math.max(limit, turnLimit * 12) : limit;
  const scope = String(args.scope ?? "").trim();
  const sinceIso = String(args.sinceIso ?? "").trim();
  try {
    let query = args.supabase
      .from("turn_summary_logs")
      .select("created_at,payload")
      .eq("user_id", args.userId)
      .order("created_at", { ascending: false })
      .limit(queryLimit);
    if (scope) query = query.eq("scope", scope);
    if (sinceIso && typeof query.gte === "function") {
      query = query.gte("created_at", sinceIso);
    }
    const res = await query;
    if (res?.error) throw res.error;
    const ordered = orderRecent(
      entriesFromTurnSummaryRows(res?.data ?? []),
      100,
    );
    return keepRecentTurnWindow(ordered, turnLimit).slice(0, limit);
  } catch {
    let query = args.supabase
      .from("conversation_turn_traces")
      .select(
        "turn_id,user_id,source_message_id,ts,created_at,effect_ledger",
      )
      .eq("user_id", args.userId)
      .order("ts", { ascending: false })
      .limit(queryLimit);
    if (sinceIso && typeof query.gte === "function") {
      query = query.gte("ts", sinceIso);
    }
    const res = await query;
    if (res?.error) return [];
    const ordered = orderRecent(
      entriesFromConversationTraceRows(res?.data ?? []),
      100,
    );
    return keepRecentTurnWindow(ordered, turnLimit).slice(0, limit);
  }
}
