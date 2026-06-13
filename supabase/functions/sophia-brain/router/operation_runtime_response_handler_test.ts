import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendOperationFollowup,
  appendSafetyReminderPostCommitFollowup,
  ensureActiveConversationSkillStateBeforePersist,
  restoreWeeklyParentAfterChildDetour,
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

Deno.test("operation response restores suspended weekly parent after child handoff", () => {
  const result = restoreWeeklyParentAfterChildDetour({
    tempMemory: {
      __suspended_flow_v1: {
        owner: "conversation_skill",
        target_flow: "adjust_plan_item",
        state_snapshot: {
          skill_id: "weekly_adaptive_review_v1",
          status: "open",
          weekly_flow_state: {
            child_flow: {
              status: "active",
              flow_id: "adjust_plan_item",
              reason: "Plan detour",
              expected_return_focus: "weekly_synthesis_and_closure",
              result_summary: null,
            },
          },
        },
      },
      __adjust_plan_handoff_state: {
        operation_type: "adjust_plan_item",
        mode: "platform_handoff",
      },
    },
    operationRuntime: {
      toolExecution: "platform_handoff",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        operation_type: "adjust_plan_item",
        status: "handoff_delivered",
        reason_code: "platform_handoff_delivered",
        platform_handoff: {
          operation_type: "adjust_plan_item",
          status: "delivered",
          draft: {
            platform_flow: { route_kind: "plan_item_card" },
            recommendation: {
              platform_destination: "dans l'action concernée du Plan",
              platform_steps: ["ouvrir l'action", "saisir la proposition"],
            },
          },
        },
      },
    },
  });

  assertEquals(result.restored, true);
  assertEquals(result.childFlowId, "adjust_plan_item");
  assertEquals(result.tempMemory.__suspended_flow_v1, undefined);
  assertEquals(result.tempMemory.__adjust_plan_handoff_state, undefined);
  assertEquals(
    result.tempMemory.__active_skill_state.skill_id,
    "weekly_adaptive_review_v1",
  );
  assertEquals(
    result.tempMemory.__active_skill_state.weekly_flow_state.child_flow.status,
    "completed",
  );
  assertEquals(
    result.tempMemory.__active_skill_state.weekly_flow_state.stage,
    "synthesis",
  );
  assertEquals(
    result.tempMemory.__active_skill_state.weekly_flow_state.child_flow
      .result_details.created,
    false,
  );
  assertEquals(
    result.tempMemory.__active_skill_state.weekly_flow_state.child_flow
      .result_details.available,
    false,
  );
  assertEquals(
    result.tempMemory.__active_skill_state.weekly_flow_state.child_flow
      .result_details.route_kind,
    "plan_item_card",
  );
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

Deno.test("operation response keeps safety followup after committed reminder in active safety flow", () => {
  const content = appendSafetyReminderPostCommitFollowup({
    content:
      "C'est entendu, j'ai bien programmé ton rappel pour 16h08 afin de m'assurer que tu es toujours en sécurité.",
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        committed_effects: [{
          type: "create_one_shot_reminder",
          id: "scheduled-checkin-1",
          scheduled_for: "2026-06-12T14:08:00.000Z",
          reminder_instruction: "vérifier que je suis toujours en sécurité",
        }],
      },
    },
    turnFrame: {
      safety: {
        risk_band: "medium",
      },
    } as any,
  });

  assertEquals(
    content,
    "C'est entendu, j'ai bien programmé ton rappel pour 16h08 afin de m'assurer que tu es toujours en sécurité.\n\nD'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.",
  );
});

Deno.test("operation followup applies safety post-commit rule after natural confirmation", () => {
  const content = appendOperationFollowup({
    content: "Ton rappel est programmé pour 16h08.",
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        committed_effects: [{
          type: "create_one_shot_reminder",
          id: "scheduled-checkin-2",
        }],
      },
    },
    turnFrame: {
      safety: {
        risk_band: "critical",
      },
    } as any,
  });

  assertEquals(
    content,
    "Ton rappel est programmé pour 16h08.\n\nD'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.",
  );
});

Deno.test("operation response does not add safety followup without committed safety reminder", () => {
  const base = "C'est programmé pour 16h08.";
  const noSafety = appendSafetyReminderPostCommitFollowup({
    content: base,
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        committed_effects: [{
          type: "create_one_shot_reminder",
          id: "scheduled-checkin-1",
        }],
      },
    },
    turnFrame: {
      safety: {
        risk_band: "none",
      },
    } as any,
  });
  const noCommit = appendSafetyReminderPostCommitFollowup({
    content: base,
    operationRuntime: {
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        committed_effects: [],
      },
    },
    turnFrame: {
      safety: {
        risk_band: "medium",
      },
    } as any,
  });

  assertEquals(noSafety, base);
  assertEquals(noCommit, base);
});
