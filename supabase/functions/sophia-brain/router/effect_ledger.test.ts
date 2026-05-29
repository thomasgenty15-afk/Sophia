import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createEffectLedger,
  hasCommittedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
  rewriteUncommittedEffectClaims,
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
    tool_id: "update_coach_preferences",
    source: "executor",
    db_ref: { table: "user_profile_facts", key: "coach.tone" },
  });
  assertEquals(entry.status, "committed");
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
  assertEquals(summary.entries[0].payload_summary.long_text.length <= 180, true);
  assertEquals(summary.entries[0].payload_summary.nested, "[object]");
});

Deno.test("rewriteUncommittedEffectClaims retire preference enregistree sans commit", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "C'est fait, préférence enregistrée.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reason_codes, [
    "uncommitted_coach_preferences_update_claim",
  ]);
  assertEquals(rewritten.reply, "Je ne l'ai pas enregistré.");
});

Deno.test("rewriteUncommittedEffectClaims ne touche pas une reponse si commit present", () => {
  const ledger = createEffectLedger("turn-1");
  recordCommittedEffect(ledger, {
    effect_id: "effect-1",
    effect_type: "coach_preferences.update",
    source: "executor",
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "C'est fait, préférence enregistrée.",
    ledger,
  });
  assertEquals(rewritten.changed, false);
  assertEquals(rewritten.reply, "C'est fait, préférence enregistrée.");
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

Deno.test("rewriteUncommittedEffectClaims neutralise rappel programme sans commit", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Rappel programmé pour demain.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reason_codes, [
    "uncommitted_reminder_create_claim",
  ]);
});

Deno.test("rewriteUncommittedEffectClaims ne transforme pas carte preparee en carte creee", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Carte préparée, mais pas encore créée.",
    ledger,
  });
  assertEquals(rewritten.changed, false);
});

Deno.test("rewriteUncommittedEffectClaims neutralise potion activee sans commit", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Potion activée.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reason_codes, [
    "uncommitted_state_potion_activate_claim",
  ]);
  assertEquals(rewritten.reply, "Je ne l'ai pas activée.");
});

Deno.test("rewriteUncommittedEffectClaims neutralise plan modifie sans commit", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Plan ajusté pour la semaine.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reason_codes, [
    "uncommitted_plan_adjust_claim",
  ]);
  assertEquals(rewritten.reply, "Je ne l'ai pas modifié.");
});

Deno.test("rewriteUncommittedEffectClaims neutralise progres note sans commit", () => {
  const ledger = createEffectLedger("turn-1");
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Progression notée.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reason_codes, [
    "uncommitted_progress_track_claim",
  ]);
  assertEquals(rewritten.reply, "Je ne l'ai pas noté.");
});
