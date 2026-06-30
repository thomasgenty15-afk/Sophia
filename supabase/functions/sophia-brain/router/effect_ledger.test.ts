import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createEffectLedger,
  hasCommittedEffect,
  recordBlockedEffect,
  recordClarificationInLedger,
  recordCommittedEffect,
  recordFailedEffect,
  recordPlatformHandoffInLedger,
  recordRequestedEffect,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";

Deno.test("createEffectLedger initialise un ledger vide", () => {
  const ledger = createEffectLedger("turn-1");
  assertEquals(ledger, { turn_id: "turn-1", entries: [] });
});

Deno.test("recordRequestedEffect ajoute une entry requested", () => {
  const ledger = createEffectLedger("turn-1");
  const entry = recordRequestedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    operation_type: "create_one_shot_reminder",
    operation_id: "op-1",
    tool_id: "create_one_shot_reminder",
    source: "router",
  });
  assertEquals(entry.status, "requested");
  assertEquals(ledger.entries.length, 1);
});

Deno.test("recordCommittedEffect ajoute une entry committed", () => {
  const ledger = createEffectLedger("turn-1");
  const entry = recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "plan_item_progress.track",
    operation_type: "track_progress_plan_item",
    operation_id: "op-1",
    committed_id: "progress-1",
    tool_id: "track_progress_plan_item",
    source: "executor",
    db_ref: { table: "plan_item_progress_logs", id: "progress-1" },
  });
  assertEquals(entry.status, "committed");
  assertEquals(entry.committed_id, "progress-1");
  assertEquals(entry.db_ref?.id, "progress-1");
});

Deno.test("hasCommittedEffect détecte le bon type", () => {
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    source: "executor",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "one_shot_reminder.create",
    ),
    true,
  );
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "one_shot_reminder.create",
    ),
    false,
  );
});

Deno.test("summarizeEffectLedgerForTrace ne leak pas de payload massif", () => {
  const ledger = createEffectLedger("turn-1");
  recordRequestedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    source: "router",
    payload_summary: {
      long_text: "x".repeat(1000),
      nested: { secret: "do-not-expand" },
    },
  });
  const summary = summarizeEffectLedgerForTrace(ledger) as any;
  assertEquals(summary.counts.requested, 1);
  assertEquals(
    summary.entries[0].payload_summary.long_text.length <= 180,
    true,
  );
  assertEquals(summary.entries[0].payload_summary.nested, "[object]");
});

Deno.test("failed ne compte pas comme committed", () => {
  const ledger = createEffectLedger("turn-1");
  recordFailedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    source: "executor",
    reason_code: "db_down",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "one_shot_reminder.create",
    ),
    false,
  );
});

Deno.test("blocked ne compte pas comme committed", () => {
  const ledger = createEffectLedger("turn-1");
  recordBlockedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "one_shot_reminder.create",
    source: "executor",
    reason_code: "confirmation_required",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "one_shot_reminder.create",
    ),
    false,
  );
});

Deno.test("platform handoff proposed is a first-class ledger entry", () => {
  const ledger = createEffectLedger("turn-handoff-1");
  const entry = recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-1",
    operation_type: "external_platform_action",
    status: "proposed",
    source: "router",
    surface_id: "external",
    reason_code: "external_platform_only",
  });

  assertEquals(entry.kind, "platform_handoff");
  assertEquals(entry.status, "proposed");
  assertEquals(entry.committed, false);
  assertEquals(entry.executed_tool, false);
});

Deno.test("platform handoff delivered does not count as committed or executed", () => {
  const ledger = createEffectLedger("turn-handoff-2");
  recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-2",
    operation_type: "external_platform_action",
    status: "delivered",
    source: "dispatcher",
    surface_id: "external",
  });

  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "external_platform_action",
    ),
    false,
  );
  assertEquals(ledger.entries[0].executed_tool, false);
});

Deno.test("clarification asked is a non-mutant ledger entry", () => {
  const ledger = createEffectLedger("turn-clarification-1");
  const entry = recordClarificationInLedger(ledger, {
    effect_id: "clarification-1",
    status: "asked",
    owner: "product_help",
    ambiguity_kind: "intent",
    candidate_ids: ["one_shot", "recurring"],
    source: "dispatcher",
  });

  assertEquals(entry.kind, "clarification");
  assertEquals(entry.status, "asked");
  assertEquals(entry.committed, false);
  assertEquals(entry.executed_tool, false);
});

Deno.test("durable effect blocked remains distinct from platform handoff", () => {
  const ledger = createEffectLedger("turn-distinct-1");
  recordBlockedEffect(ledger, {
    effect_id: "blocked-1",
    effect_type: "one_shot_reminder.create",
    source: "router",
    reason_code: "missing_time",
  });
  recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-1",
    operation_type: "external_platform_action",
    status: "delivered",
    source: "dispatcher",
  });

  assertEquals(ledger.entries[0].kind ?? "durable_effect", "durable_effect");
  assertEquals(ledger.entries[0].status, "blocked");
  assertEquals(ledger.entries[1].kind, "platform_handoff");
  assertEquals(ledger.entries[1].status, "delivered");
});
