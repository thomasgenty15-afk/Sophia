import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { weeklyBridgeDoesNotApplyDirectly } from "../skills/weekly_review/bridges.ts";
import {
  createEffectLedger,
  hasCommittedEffect,
  recordRequestedEffect,
} from "./effect_ledger.ts";
import { recordRecommendationEffectInLedger } from "./effect_ledger_adapter.ts";

const ROOT = new URL("../", import.meta.url);

const KNOWN_BRIDGE_BOUNDARIES = [{
  name: "weekly_review/bridges.ts",
  reason:
    "Weekly review may prepare adjust_plan_item input, but the bridge contract says it never applies directly.",
  removal_criteria:
    "Bridge is replaced by a typed requested-effect adapter with explicit must_not_execute semantics.",
}, {
  name: "recommendation/recommendation_tool.ts",
  reason:
    "Recommendation tool can suggest operations, but execution must remain with the owner tool after user consent.",
  removal_criteria:
    "Recommendation output is represented directly as a typed requested effect contract.",
}];

Deno.test("weekly_bridge_contract_is_request_only", () => {
  assertEquals(weeklyBridgeDoesNotApplyDirectly(), true);
  assertEquals(
    KNOWN_BRIDGE_BOUNDARIES.every((item) =>
      item.reason && item.removal_criteria
    ),
    true,
  );
});

Deno.test("weekly_and_recommendation_bridges_do_not_commit_directly", async () => {
  const files = [
    "./skills/weekly_review/bridges.ts",
    "./recommendation/recommendation_tool.ts",
  ];
  const forbidden = [
    "recordCommittedEffect",
    "committed_effects:",
    'toolExecution: "success"',
    "executedTools: [",
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const text = await Deno.readTextFile(new URL(file, ROOT));
    for (const token of forbidden) {
      if (text.includes(token)) offenders.push(`${file}:${token}`);
    }
  }
  assertEquals(offenders, []);
});

Deno.test("bridge_requested_effect_does_not_mark_executed_tool", () => {
  const ledger = createEffectLedger("turn-weekly-bridge");
  recordRequestedEffect(ledger, {
    effect_id: "weekly-adjust-request",
    effect_type: "plan_item.adjust",
    operation_type: "adjust_plan_item",
    tool_id: "adjust_plan_item",
    source: "bridge",
    reason_code: "weekly_review_bridge_request",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "adjust_plan_item",
    ),
    false,
  );
});

Deno.test("recommendation_suggestion_has_no_committed_effect", () => {
  const ledger = createEffectLedger("turn-recommendation");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_1",
      decision: "recommend_operation",
      operation_type: "select_state_potion",
      executor_tool_id: "select_state_potion",
      requires_consent: true,
      reason: "state_regulation_before_action",
    },
  });
  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "proposed");
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "select_state_potion",
    ),
    false,
  );
});
