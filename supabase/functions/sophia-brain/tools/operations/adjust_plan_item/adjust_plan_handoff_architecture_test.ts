import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildAdjustPlanHandoffDraft } from "./handoff.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";
import { buildTurnAgenda } from "../../../router/turn_agenda.ts";
import type { UserTurnSnapshot } from "../../../router/user_turn_snapshot.ts";

Deno.test("adjust_plan handoff draft contract is no-mutation and not executable from chat", () => {
  const handoff = buildAdjustPlanHandoffDraft({
    fallbackSummary: "Alléger le plan cette semaine.",
  });

  assertEquals(handoff.operation_type, "adjust_plan_item");
  assertEquals(handoff.mode, "platform_handoff");
  assertEquals(handoff.no_chat_mutation, true);
  assertEquals(handoff.executable_from_chat, false);
  assertStringIncludes(
    handoff.recommendation.platform_destination,
    "section Plan",
  );
});

Deno.test("adjust_plan handoff renderer redirects to Plan without done language", () => {
  const handoff = buildAdjustPlanHandoffDraft({
    fallbackSummary: "Alléger l'action du soir.",
  });
  const content = renderAdjustPlanHandoffDraft(handoff);

  assertStringIncludes(content, "section Plan");
  assertStringIncludes(content, "Il ne te reste plus qu'à ouvrir Plan");
  assertEquals(content.includes("Je ne modifie pas"), false);
  assertEquals(/\bc['’]?est fait\b/i.test(content), false);
  assertEquals(/\bdis[- ]moi oui\b/i.test(content), false);
  assertEquals(/\bje peux l['’]?appliquer\b/i.test(content), false);
});

Deno.test("turn agenda represents adjust_plan_item as platform handoff, not effect task", () => {
  const snapshot = {
    turn_id: "turn-1",
    turn_frame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        confidence_band: "high",
        target_hint: "mon plan",
      }],
      direct_effects: [],
    },
    route_decision: null,
    explicit_constraints: {},
    active_flows: {},
  } as unknown as UserTurnSnapshot;

  const agenda = buildTurnAgenda(snapshot);
  const task = agenda.tasks.find((item) =>
    item.operation_type === "adjust_plan_item"
  );

  assert(task);
  assertEquals(task.kind, "platform_handoff");
  assertEquals(task.requires_confirmation, false);
  assertEquals(task.reason_code, "complex_operation_redirect_to_platform");
});
