import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createEffectLedger } from "./effect_ledger.ts";
import {
  effectTypeFromToolType,
  executedToolsForStatus,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";

Deno.test("effect_ledger_adapter maps only retained direct chat effect types", () => {
  assertEquals(
    effectTypeFromToolType("create_one_shot_reminder"),
    "one_shot_reminder.create",
  );
  assertEquals(
    effectTypeFromToolType("cancel_one_shot_reminder"),
    "one_shot_reminder.cancel",
  );
  assertEquals(
    effectTypeFromToolType("track_progress_plan_item"),
    "plan_item_progress.track",
  );
  assertEquals(effectTypeFromToolType("legacy_operation"), "legacy_operation");
});

Deno.test("effect_ledger_adapter records one-shot committed effect db ref", () => {
  const ledger = createEffectLedger("turn_1");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      operation_id: "op_1",
      committed_effects: [{ type: "create_one_shot_reminder", id: "rem_1" }],
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "committed");
  assertEquals(ledger.entries[0].effect_type, "one_shot_reminder.create");
  assertEquals(ledger.entries[0].operation_type, "create_one_shot_reminder");
  assertEquals(ledger.entries[0].db_ref, {
    table: "scheduled_checkins",
    id: "rem_1",
  });
});

Deno.test("effect_ledger_adapter records track-progress failed effect", () => {
  const ledger = createEffectLedger("turn_failed_array");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "failed",
    toolSkillRun: {
      selected_handler: "track_progress_plan_item",
      operation_id: "progress_1",
      failed_effects: [{
        type: "track_progress_plan_item",
        reason_code: "write_failed",
      }],
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "failed");
  assertEquals(ledger.entries[0].effect_type, "plan_item_progress.track");
});

Deno.test("executedToolsForStatus requires committed effects", () => {
  assertEquals(executedToolsForStatus("blocked", ["legacy_operation"], []), []);
  assertEquals(executedToolsForStatus("success", ["legacy_operation"], []), []);
  assertEquals(
    executedToolsForStatus("success", ["create_one_shot_reminder"], [{
      type: "create_one_shot_reminder",
    }]),
    ["create_one_shot_reminder"],
  );
});

Deno.test("effect_ledger_adapter ignores removed operation runtime effects", () => {
  const ledger = createEffectLedger("turn_removed_operation");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "removed_operation",
      operation_id: "legacy_1",
      committed_effects: [{ type: "removed_operation", id: "legacy_1" }],
    },
  });

  assertEquals(ledger.entries.length, 0);
});

Deno.test("effect_ledger_adapter records retained recommendation as request", () => {
  const ledger = createEffectLedger("turn_rec");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_1",
      decision: "recommend_operation",
      operation_type: "create_one_shot_reminder",
      executor_tool_id: "create_one_shot_reminder",
      reason: "clear_execution_block",
      requires_consent: true,
      presentation_level: 2,
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "requested");
  assertEquals(ledger.entries[0].effect_type, "one_shot_reminder.create");
});

Deno.test("blocked track_progress result without reply still reaches the ledger", async () => {
  const { operationRuntimeFromTrackProgress } = await import(
    "./operation_runtime_pipeline.ts"
  );
  const { createEffectLedger, summarizeEffectLedgerForTrace } = await import(
    "./effect_ledger.ts"
  );
  const { recordToolSkillEffectsInLedger } = await import(
    "./effect_ledger_adapter.ts"
  );

  // Resultat de lane bloque (gate/idempotence) SANS texte de fallback —
  // avant le fix, operationRuntimeFromTrackProgress retournait null et le
  // blocage disparaissait de la trace.
  const runtime = operationRuntimeFromTrackProgress({
    tempMemory: {},
    result: {
      detected: true,
      intent: "log_completed",
      status: "blocked",
      reply: null,
      executed_tools: [],
      requested_effects: [{
        type: "track_progress_plan_item",
        target_item_id: "item-1",
        target_title: "Faire un sas",
        progress_status: "completed",
        value: 1,
        date_hint: null,
        source_message_id: "msg-1",
      }],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "duplicate_recent_write",
      }],
      debug: {
        reason_code: "duplicate_recent_write",
        gate_reason: "recent_writes_idempotency",
      },
    } as any,
    sourceMessageId: "msg-1",
  });

  // Le resultat n'est plus jete...
  assertEquals(runtime !== null, true);
  // ...mais ne court-circuite jamais la composition (content vide).
  assertEquals(runtime?.content, "");

  // Et le ledger enregistre requested + blocked avec la raison.
  const ledger = createEffectLedger("turn-1");
  recordToolSkillEffectsInLedger({
    ledger,
    toolSkillRun: runtime?.toolSkillRun,
    toolExecution: runtime?.toolExecution ?? "none",
  });
  const summary = summarizeEffectLedgerForTrace(ledger) as {
    counts: Record<string, number>;
    entries: Array<Record<string, unknown>>;
  };
  assertEquals(summary.counts.requested >= 1, true);
  assertEquals(summary.counts.blocked >= 1, true);
  assertEquals(
    summary.entries.some((entry) =>
      entry.status === "blocked" &&
      String(entry.reason_code ?? "").includes("duplicate_recent_write")
    ),
    true,
  );
});
