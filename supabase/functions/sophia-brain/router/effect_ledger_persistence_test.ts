import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createEffectLedger,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  serializeEffectLedgerForPersistence,
} from "./effect_ledger.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";

function makeFakeSupabase(error: Error | null = null) {
  const calls: { rpc: Array<{ fn: string; args: any }> } = { rpc: [] };
  return {
    calls,
    supabase: {
      rpc: async (fn: string, args: any) => {
        calls.rpc.push({ fn, args });
        return { data: null, error };
      },
    },
  };
}

Deno.test("serialize_committed_effect_compact", () => {
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    operation_type: "one_shot_reminder",
    operation_id: "op-1",
    tool_id: "create_one_shot_reminder",
    source: "executor",
    payload_summary: {
      scheduled_for: "2026-05-29T11:20:00.000Z",
      reminder_instruction: "relire le brief",
      draft: { secret: "not persisted" },
    },
    db_ref: { table: "scheduled_checkins", id: "rem-1" },
  });

  const entries = serializeEffectLedgerForPersistence({
    ledger,
    userId: "user-1",
    sourceMessageId: "msg-1",
    requestId: "req-1",
    nowIso: "2026-05-29T10:00:00.000Z",
  });

  assertEquals(entries.length, 1);
  assertEquals(entries[0].status, "committed");
  assertEquals(entries[0].db_ref, {
    table: "scheduled_checkins",
    id: "rem-1",
    key: null,
  });
  assertEquals(
    entries[0].payload_summary.scheduled_for,
    "2026-05-29T11:20:00.000Z",
  );
  assertEquals("draft" in entries[0].payload_summary, false);
});

Deno.test("serialize_blocked_effect", () => {
  const ledger = createEffectLedger("turn-1");
  recordBlockedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "guard",
    reason_code: "confirmation_required",
  });
  const [entry] = serializeEffectLedgerForPersistence({
    ledger,
    userId: "user-1",
    nowIso: "2026-05-29T10:00:00.000Z",
  });
  assertEquals(entry.status, "blocked");
  assertEquals(entry.reason_code, "confirmation_required");
});

Deno.test("serialize_failed_effect", () => {
  const ledger = createEffectLedger("turn-1");
  recordFailedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "executor",
    reason_code: "db_error",
    error_message: "database unavailable".repeat(30),
  });
  const [entry] = serializeEffectLedgerForPersistence({
    ledger,
    userId: "user-1",
    nowIso: "2026-05-29T10:00:00.000Z",
  });
  assertEquals(entry.status, "failed");
  assertEquals(entry.error_message!.length <= 240, true);
});

Deno.test("does_not_persist_full_draft_payload", () => {
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "attack_card.create",
    source: "executor",
    payload_summary: {
      target_title: "Carte ancre",
      full_draft: { title: "secret", body: "x".repeat(1000) },
      raw_text: "user said a lot",
    },
    db_ref: { table: "user_attack_cards", id: "card-1" },
  });
  const [entry] = serializeEffectLedgerForPersistence({
    ledger,
    userId: "user-1",
    nowIso: "2026-05-29T10:00:00.000Z",
  });
  assertEquals(entry.payload_summary.target_title, "Carte ancre");
  assertEquals("full_draft" in entry.payload_summary, false);
  assertEquals("raw_text" in entry.payload_summary, false);
});

Deno.test("operation_path_persists_ledger", async () => {
  const { supabase, calls } = makeFakeSupabase();
  const ledger = createEffectLedger("turn-op");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "executor",
    db_ref: { table: "user_profile_facts", key: "coach.tone" },
  });

  const result = await persistEffectLedgerForTurn({
    supabase,
    ledger,
    userId: "user-1",
    sourceMessageId: "msg-1",
    requestId: "req-1",
    channel: "web",
    scope: "companion",
    nowIso: "2026-05-29T10:00:00.000Z",
  });

  assertEquals(result.persisted, true);
  assertEquals(result.destination, "turn_summary");
  assertEquals(calls.rpc.length, 1);
  assertEquals(calls.rpc[0].fn, "log_turn_summary_log");
  assertEquals(calls.rpc[0].args.p_payload.tag, "effect_ledger");
  assertEquals(calls.rpc[0].args.p_payload.entries.length, 1);
});

Deno.test("normal_path_persists_ledger", async () => {
  const { supabase, calls } = makeFakeSupabase();
  const ledger = createEffectLedger("turn-normal");
  recordBlockedEffect(ledger, {
    effect_id: "turn-normal:guard:uncommitted_reminder_create_claim",
    effect_type: "final_reply.claim",
    source: "guard",
    reason_code: "uncommitted_reminder_create_claim",
  });

  const result = await persistEffectLedgerForTurn({
    supabase,
    ledger,
    userId: "user-1",
    sourceMessageId: "msg-1",
    requestId: "req-1",
    channel: "web",
    scope: "companion",
    nowIso: "2026-05-29T10:00:00.000Z",
  });

  assertEquals(result.persisted, true);
  assertEquals(
    calls.rpc[0].args.p_payload.entries[0].effect_type,
    "final_reply.claim",
  );
  assertEquals(calls.rpc[0].args.p_payload.entries[0].status, "blocked");
});

Deno.test("persistence_failure_non_blocking", async () => {
  const { supabase } = makeFakeSupabase(new Error("write failed"));
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    source: "executor",
  });

  const result = await persistEffectLedgerForTurn({
    supabase,
    ledger,
    userId: "user-1",
    sourceMessageId: "msg-1",
    requestId: "req-1",
    channel: "web",
    scope: "companion",
    nowIso: "2026-05-29T10:00:00.000Z",
  });

  assertEquals(result.persisted, false);
  assertEquals(result.entries_count, 1);
  assertExists(result.error);
});
