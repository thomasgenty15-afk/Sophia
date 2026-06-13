import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { buildUserTurnSnapshot } from "./user_turn_snapshot.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    selected_handler: undefined,
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "normal_reply_default",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...overrides,
  };
}

Deno.test("buildUserTurnSnapshot captures active flows and explicit constraints", () => {
  const snapshot = buildUserTurnSnapshot({
    turn_id: "turn-1",
    user_id: "user-1",
    source_message_id: "msg-1",
    message: "Ne crée rien, montre seulement le brouillon.",
    channel: "web",
    timezone: "Europe/Paris",
    turn_frame: turnFrame(),
    route_decision: routeDecision({
      selected_handler: "status_recap",
      reason_code: "status_recap_request_blocks_tool_start",
      blocked_paths: [{
        path: "tool_skill_flow",
        reason_code: "explicit_no_tool_request_blocks_tool_start",
      }],
    }),
    temp_memory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_attack_card",
        user_intent: "draft_only",
      },
      __pending_tool_skill_confirmation: {
        operation_type: "update_coach_preferences",
      },
      __turn_constraints: {
        no_potion: true,
        no_plan: true,
        no_protocol: true,
        no_technique: true,
        no_questions: true,
        soft_support_only: true,
      },
      active_reminders: [{ id: "r1" }],
    },
  });

  assertEquals(
    (snapshot.active_flows.active_operation_intake as any)?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(
    (snapshot.active_flows.pending_tool_confirmation as any)?.operation_type,
    "update_coach_preferences",
  );
  assertEquals(snapshot.explicit_constraints.status_only, true);
  assertEquals(snapshot.explicit_constraints.no_tool, true);
  assertEquals(snapshot.explicit_constraints.no_potion, true);
  assertEquals(snapshot.explicit_constraints.no_plan, true);
  assertEquals(snapshot.explicit_constraints.no_protocol, true);
  assertEquals(snapshot.explicit_constraints.no_technique, true);
  assertEquals(snapshot.explicit_constraints.no_questions, true);
  assertEquals(snapshot.explicit_constraints.soft_support_only, true);
  assertEquals(snapshot.explicit_constraints.draft_only, true);
  assertEquals(snapshot.durable_state.active_reminders?.length, 1);
});
