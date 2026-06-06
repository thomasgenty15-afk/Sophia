import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendAgendaPlatformHandoffFollowup,
  routeDecisionForOperationTrace,
} from "./operation_runtime_response_handler.ts";

Deno.test("operation runtime trace route uses executed tool skill handler", () => {
  const routeDecision = {
    route_version: "v1",
    response_owner: "orientation_clarification",
    selected_handler: "orientation_clarification",
    reason_code: "active_handoff_turn_unclear",
    direct_effects_to_run: [],
    blocked_paths: [],
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  } as any;

  const traced = routeDecisionForOperationTrace({
    routeDecision,
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      operation_type: "adjust_plan_item",
    },
  });

  assertEquals(traced.response_owner, "tool_skill");
  assertEquals(traced.selected_handler, "adjust_plan_item");
  assertEquals(traced.reason_code, "active_handoff_turn_unclear");
});

Deno.test("operation response appends agenda platform handoff after atomic reminder effect", () => {
  const content = appendAgendaPlatformHandoffFollowup({
    content: "C'est programmé pour mercredi 03 juin à 15:28.",
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
    },
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      reason_code: "central_arbitrator_one_shot_reminder_structured_effect",
      direct_effects_to_run: ["create_one_shot_reminder"],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    turnAgendaSummary: {
      task_count: 2,
      owners: ["create_one_shot_reminder", "attack_card_handoff"],
      operation_types: ["create_one_shot_reminder", "prepare_attack_card"],
      constraints: {},
      tasks: [{
        task_id: "direct:create_one_shot_reminder:0",
        kind: "effect",
        owner: "create_one_shot_reminder",
        operation_type: "create_one_shot_reminder",
        intent: "create",
        source: "dispatcher",
        status: "pending",
        reason_code: null,
      }, {
        task_id: "dispatcher:prepare_attack_card:0",
        kind: "platform_handoff",
        owner: "attack_card_handoff",
        operation_type: "prepare_attack_card",
        intent: "create",
        source: "dispatcher",
        status: "proposed",
        reason_code: "complex_operation_redirect_to_platform",
      }],
    },
  });

  assertEquals(
    content,
    "C'est programmé pour mercredi 03 juin à 15:28.\n\nMaintenant, pour la carte d'attaque, c'est pour quelle action ?",
  );
});

Deno.test("operation response does not append handoff when operation failed", () => {
  const content = appendAgendaPlatformHandoffFollowup({
    content: "Je n'ai pas réussi à programmer ce rappel.",
    operationRuntime: {
      toolExecution: "failed",
      executedTools: [],
    },
    routeDecision: null,
    turnAgendaSummary: {
      task_count: 1,
      owners: ["attack_card_handoff"],
      operation_types: ["prepare_attack_card"],
      constraints: {},
      tasks: [{
        task_id: "dispatcher:prepare_attack_card:0",
        kind: "platform_handoff",
        owner: "attack_card_handoff",
        operation_type: "prepare_attack_card",
        intent: "create",
        source: "dispatcher",
        status: "proposed",
        reason_code: "complex_operation_redirect_to_platform",
      }],
    },
  });

  assertEquals(content, "Je n'ai pas réussi à programmer ce rappel.");
});

Deno.test("operation response keeps uncovered same-turn suffix after atomic effect", () => {
  const content = appendAgendaPlatformHandoffFollowup({
    content: "C'est programmé pour mercredi 03 juin à 15:28.",
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
    },
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      reason_code: "central_arbitrator_one_shot_reminder_structured_effect",
      direct_effects_to_run: ["create_one_shot_reminder"],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    turnAgendaSummary: {
      task_count: 1,
      owners: ["create_one_shot_reminder"],
      operation_types: ["create_one_shot_reminder"],
      constraints: {},
      tasks: [{
        task_id: "direct:create_one_shot_reminder:0",
        kind: "effect",
        owner: "create_one_shot_reminder",
        operation_type: "create_one_shot_reminder",
        intent: "create",
        source: "dispatcher",
        status: "pending",
        reason_code: null,
      }],
    },
    userMessage:
      "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque",
    turnFrame: {
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text:
            "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments",
        },
      }],
    } as any,
  });

  assertEquals(
    content,
    "C'est programmé pour mercredi 03 juin à 15:28.\n\nJe garde aussi la suite : « et là tout de suite j'aimerais qu'on crée une carte d'attaque ». Tu veux qu'on la traite maintenant ?",
  );
});
