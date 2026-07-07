import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePlanRealignmentLocalDispatcherOutput,
  reducePlanRealignmentLocalDispatcherOutput,
} from "./local_flow.ts";

Deno.test("plan_realignment local output keeps product execution disabled", () => {
  const output = normalizePlanRealignmentLocalDispatcherOutput({
    flow_action: "platform_guidance",
    confidence: "high",
    risk_score: 0,
    drift_type: "late_on_plan",
    scope: "week",
    explicit_adjust_request: true,
    user_need_summary: "retard sur le plan de la semaine",
    next_step: "ouvrir Dashboard > Plan",
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "plan_realignment_platform_guidance",
      instruction: "guider vers le Plan",
      conversation_context: {
        drift_type: "late_on_plan",
        scope: "week",
        explicit_adjust_request: true,
        product_execution_allowed: true,
        recommended_surface: "Dashboard > Plan",
        next_step: "ouvrir Dashboard > Plan",
      },
    },
    evidence: ["j'ai pris du retard sur mon plan"],
  });

  assertEquals(output.flow_action, "platform_guidance");
  assertEquals(output.visible_task.kind, "plan_realignment_platform_guidance");
  assertEquals(
    output.visible_task.conversation_context.product_execution_allowed,
    false,
  );
  assertEquals(
    output.visible_task.conversation_context.recommended_surface,
    "Dashboard > Plan",
  );
});

Deno.test("plan_realignment reducer completes as one-shot after rendering guidance", () => {
  const output = normalizePlanRealignmentLocalDispatcherOutput({
    flow_action: "platform_guidance",
    confidence: "medium",
    risk_score: 0,
    drift_type: "lost_rhythm",
    scope: "week",
    explicit_adjust_request: false,
    user_need_summary: "a perdu le rythme du plan",
    next_step: "aller dans Dashboard > Plan pour realigner la semaine",
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "plan_realignment_platform_guidance",
      instruction: "expliquer ou le trouver",
      conversation_context: {
        drift_type: "lost_rhythm",
        scope: "week",
        explicit_adjust_request: false,
        product_execution_allowed: false,
        recommended_surface: "Dashboard > Plan",
        next_step: "aller dans Dashboard > Plan",
      },
    },
    evidence: ["je ne sais pas ou ajuster"],
  });

  const reduced = reducePlanRealignmentLocalDispatcherOutput({
    previous: null,
    output,
    userMessage: "je ne sais pas ou ajuster mon plan",
  });

  assertEquals(reduced.status, "complete");
  assertEquals(reduced.reason_code, "plan_realignment_complete");
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.visible_task, "plan_realignment_platform_guidance");
  assertEquals(
    reduced.conversation_context.recommended_surface,
    "Dashboard > Plan",
  );
});

Deno.test("plan_realignment reducer exits with global note only on explicit exit", () => {
  const output = normalizePlanRealignmentLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    risk_score: 0,
    drift_type: "ambiguous",
    scope: "unknown",
    explicit_adjust_request: false,
    user_need_summary: "le user recentre sur une action precise",
    next_step: null,
    state_updates: {
      status: "exit_to_global",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "exit_ack",
      instruction: "sortir proprement",
      conversation_context: {
        drift_type: "ambiguous",
        scope: "unknown",
        explicit_adjust_request: false,
        product_execution_allowed: false,
        recommended_surface: "Dashboard > Plan",
        next_step: null,
      },
    },
    evidence: ["je bloque sur le mail a Camille"],
  });

  const reduced = reducePlanRealignmentLocalDispatcherOutput({
    previous: null,
    output,
    userMessage: "je bloque sur le mail a Camille",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.note_information?.source_flow_id, "plan_realignment");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("plan_too_light drift type is accepted and keeps its direction (nina-r4 B03)", () => {
  const output = normalizePlanRealignmentLocalDispatcherOutput({
    flow_action: "platform_guidance",
    confidence: "high",
    risk_score: 0,
    drift_type: "plan_too_light",
    scope: "whole_plan",
    explicit_adjust_request: true,
    user_need_summary: "veut un plan plus ambitieux avec du sport",
    next_step: "ouvrir Dashboard > Plan > Ajuster mon plan",
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "plan_realignment_platform_guidance",
      instruction: "guider vers l'ajustement pour corser",
      conversation_context: {
        drift_type: "plan_too_light",
        scope: "whole_plan",
        explicit_adjust_request: true,
        product_execution_allowed: false,
        recommended_surface: "Dashboard > Plan",
        next_step: "ouvrir Dashboard > Plan > Ajuster mon plan",
      },
    },
    evidence: ["mon plan est trop mou, corse-le"],
  });

  // La direction « corser » n'est pas retombee sur ambiguous ni inversee en
  // plan_too_heavy (nina-r4 B03: l'enum collapsait les deux directions).
  assertEquals(output.drift_type, "plan_too_light");
  assertEquals(
    output.visible_task.conversation_context.drift_type,
    "plan_too_light",
  );
});
