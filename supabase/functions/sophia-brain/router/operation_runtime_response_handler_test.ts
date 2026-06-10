import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendOperationFollowup,
  ensureActiveConversationSkillStateBeforePersist,
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

Deno.test("operation runtime persist guard restores active emotional_repair on local continue", () => {
  const result = ensureActiveConversationSkillStateBeforePersist({
    tempMemory: {
      __conversation_risk_history: [0],
    },
    activeSkillState: {
      skill_id: "emotional_repair",
      status: "active",
      turn_count: 2,
      working_state: {
        emotional_repair_local_state: {
          stage: "concrete_phrase",
        },
      },
    },
    operationRuntime: {
      toolSkillRun: {
        skill_id: "emotional_repair",
        mode: "conversation_skill_local_flow",
        status: "continue",
      },
    },
  });

  assertEquals(result.restored, true);
  assertEquals(result.reasonCode, "local_flow_continue_missing_active_state");
  assertEquals(
    result.tempMemory.__active_skill_state.skill_id,
    "emotional_repair",
  );
  assertEquals(result.tempMemory.__active_skill_state.status, "active");
  assertEquals(
    result.tempMemory.__active_skill_state.working_state
      .emotional_repair_local_state.stage,
    "concrete_phrase",
  );
});

Deno.test("operation runtime persist guard does not restore completed local flow", () => {
  const result = ensureActiveConversationSkillStateBeforePersist({
    tempMemory: {},
    activeSkillState: {
      skill_id: "emotional_repair",
      status: "active",
    },
    operationRuntime: {
      toolSkillRun: {
        skill_id: "emotional_repair",
        mode: "conversation_skill_local_flow",
        status: "complete",
      },
    },
  });

  assertEquals(result.restored, false);
  assertEquals(result.reasonCode, null);
  assertEquals(result.tempMemory.__active_skill_state, undefined);
});

Deno.test("operation runtime persist guard does not overwrite different active skill", () => {
  const result = ensureActiveConversationSkillStateBeforePersist({
    tempMemory: {
      __active_skill_state: {
        skill_id: "product_help",
        status: "active",
      },
    },
    activeSkillState: {
      skill_id: "emotional_repair",
      status: "active",
    },
    operationRuntime: {
      toolSkillRun: {
        skill_id: "emotional_repair",
        mode: "conversation_skill_local_flow",
        status: "continue",
      },
    },
  });

  assertEquals(result.restored, false);
  assertEquals(result.reasonCode, "local_flow_continue_different_active_state");
  assertEquals(result.tempMemory.__active_skill_state.skill_id, "product_help");
});

Deno.test("operation response does not append handoff when operation failed", () => {
  const content = appendOperationFollowup({
    content: "Je n'ai pas réussi à programmer ce rappel.",
    operationRuntime: {
      toolExecution: "failed",
      executedTools: [],
    },
  });

  assertEquals(content, "Je n'ai pas réussi à programmer ce rappel.");
});

Deno.test("operation response keeps uncovered same-turn suffix after atomic effect", () => {
  const content = appendOperationFollowup({
    content: "C'est programmé pour mercredi 03 juin à 15:28.",
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
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
