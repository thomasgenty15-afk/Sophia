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
    effect_type: "coach_preferences.update",
    operation_type: "update_coach_preferences",
    operation_id: "op-1",
    tool_id: "update_coach_preferences",
    source: "tool_skill",
  });
  assertEquals(entry.status, "requested");
  assertEquals(ledger.entries.length, 1);
});

Deno.test("recordCommittedEffect ajoute une entry committed", () => {
  const ledger = createEffectLedger("turn-1");
  const entry = recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    operation_type: "update_coach_preferences",
    operation_id: "op-1",
    committed_id: "coach.tone",
    tool_id: "update_coach_preferences",
    source: "executor",
    db_ref: { table: "user_profile_facts", key: "coach.tone" },
  });
  assertEquals(entry.status, "committed");
  assertEquals(entry.committed_id, "coach.tone");
  assertEquals(entry.db_ref?.key, "coach.tone");
});

Deno.test("hasCommittedEffect détecte le bon type", () => {
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "executor",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "coach_preferences.update",
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
    effect_type: "coach_preferences.update",
    source: "tool_skill",
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
    effect_type: "coach_preferences.update",
    source: "executor",
    reason_code: "db_down",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "coach_preferences.update",
    ),
    false,
  );
});

Deno.test("blocked ne compte pas comme committed", () => {
  const ledger = createEffectLedger("turn-1");
  recordBlockedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "executor",
    reason_code: "confirmation_required",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "coach_preferences.update",
    ),
    false,
  );
});

Deno.test("platform handoff proposed is a first-class ledger entry", () => {
  const ledger = createEffectLedger("turn-handoff-1");
  const entry = recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-1",
    operation_type: "adjust_plan_item",
    status: "proposed",
    source: "weekly_review",
    surface_id: "plan",
    reason_code: "weekly_recommended_plan_adjustment",
  });

  assertEquals(entry.kind, "platform_handoff");
  assertEquals(entry.status, "proposed");
  assertEquals(entry.no_chat_mutation, true);
  assertEquals(entry.committed, false);
  assertEquals(entry.executed_tool, false);
});

Deno.test("platform handoff delivered does not count as committed or executed", () => {
  const ledger = createEffectLedger("turn-handoff-2");
  recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-2",
    operation_type: "prepare_attack_card",
    status: "delivered",
    source: "dispatcher",
    surface_id: "attack_card",
  });

  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "prepare_attack_card",
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
    owner: "orientation_clarification",
    ambiguity_kind: "intent",
    candidate_ids: ["one_shot", "recurring"],
    source: "dispatcher",
  });

  assertEquals(entry.kind, "clarification");
  assertEquals(entry.status, "asked");
  assertEquals(entry.no_chat_mutation, true);
  assertEquals(entry.committed, false);
});

Deno.test("durable effect blocked remains distinct from platform handoff", () => {
  const ledger = createEffectLedger("turn-distinct-1");
  recordBlockedEffect(ledger, {
    effect_id: "blocked-1",
    effect_type: "one_shot_reminder.create",
    source: "tool_skill",
    reason_code: "missing_time",
  });
  recordPlatformHandoffInLedger(ledger, {
    effect_id: "handoff-1",
    operation_type: "adjust_plan_item",
    status: "delivered",
    source: "dispatcher",
  });

  assertEquals(ledger.entries[0].kind ?? "durable_effect", "durable_effect");
  assertEquals(ledger.entries[0].status, "blocked");
  assertEquals(ledger.entries[1].kind, "platform_handoff");
  assertEquals(ledger.entries[1].status, "delivered");
});
