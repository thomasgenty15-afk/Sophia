import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  buildInitialOfferDispatcherOutput,
  reduceFlowOpportunityDispatcherOutput,
} from "./reducer.ts";
import {
  maybeRunFlowOpportunityVerificationRuntime,
  selectFlowOpportunityForTurn,
} from "./runtime.ts";
import {
  createFlowOpportunityState,
  readFlowOpportunityState,
  writeFlowOpportunityState,
} from "./state.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "test",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn_1",
    source_message_id: "msg_1",
    user_id: "user_1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
    ...overrides,
  };
}

const opportunity = {
  opportunity_id: "status_recap.attack_card_uncertainty",
  target_flow: "status_recap" as const,
  target_action: "run_status_recap",
  confidence: "high" as const,
  priority: 80,
  reason: "implicit status need from dispatcher",
  evidence: ["structured evidence"],
  seed_context: {
    focus: ["attack_card"],
    surface: "attack_card",
  },
};

Deno.test("flow opportunity selection keeps direct status as direct route", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "structured status signal",
          },
        },
      },
    }),
    routeDecision: routeDecision({
      selected_handler: "status_only_no_mutation_check",
      reason_code: "status_only_no_mutation_check",
    }),
    tempMemory: {},
  });
  assertEquals(selected, null);
});

Deno.test("flow opportunity selection promotes implicit status signal", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "implicit status need",
          },
        },
      },
    }),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected?.target_flow, "status_recap");
  assertEquals(selected?.opportunity_id, "status_recap.implicit_need");
});

Deno.test("flow opportunity selection accepts legacy coach preference opportunity", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      tool_skill_opportunity: {
        type: "coach_preferences",
        operation_type: "update_coach_preferences",
        surface_id: "dashboard.preferences",
        confidence_band: "medium",
        should_offer: true,
        prop_reason: "too many questions",
        source_span: "structured source",
        target_hint: "question_tendency",
        target_status: "identified",
        suggested_question_intent: "offer_coach_preferences",
        offer_timing: "now",
        must_not_execute: true,
      },
    }),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected?.target_flow, "update_coach_preferences");
  assertEquals(
    selected?.opportunity_id,
    "update_coach_preferences.coach_preferences",
  );
});

Deno.test("flow opportunity reducer preserves anchor through product_help", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      local_action: "get_info_product",
      visible_task: { kind: "none", instruction: "" },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "inline product question",
        context_for_subskill: { preserve_active_flow: true },
      },
    },
    userMessage: "C'est quoi une carte d'attaque ?",
  });
  assertEquals(reduced.get_info_product, true);
  assertEquals(
    reduced.local_state?.confirmation_anchor,
    previous.confirmation_anchor,
  );
  assertEquals(reduced.local_state?.target_flow, "status_recap");
});

Deno.test("flow opportunity reducer preserves anchor through status_recap info round-trip", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      local_action: "get_info_db",
      visible_task: { kind: "none", instruction: "" },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "inline db status question",
        context_for_subskill: { preserve_active_flow: true },
      },
    },
    userMessage: "Qu'est-ce que j'ai deja dans mon recap ?",
  });
  assertEquals(reduced.get_info_db, true);
  assertEquals(
    reduced.local_state?.confirmation_anchor,
    previous.confirmation_anchor,
  );
  assertEquals(reduced.local_state?.target_flow, "status_recap");
});

Deno.test("flow opportunity reducer blocks low confidence launch", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      local_action: "launch_target_flow",
      confidence: "low",
      visible_task: {
        kind: "accept_and_launch_status_recap",
        instruction: "launch",
      },
    },
    userMessage: "Oui",
  });
  assertEquals(reduced.launch_target_flow, false);
  assertEquals(
    reduced.blocked_effects[0].reason_code,
    "low_confidence_blocks_launch",
  );
});

Deno.test("flow opportunity reducer requires exit memo for global handoff", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      local_action: "exit_to_global_dispatcher",
      exit_memo: {
        ...output.exit_memo,
        needed: false,
      },
    },
    userMessage: "Au fait aide-moi à revoir mon plan.",
  });
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.blocked_effects[0].reason_code, "exit_memo_required");
});

Deno.test("flow opportunity runtime initial offer creates active state without tools", async () => {
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: turnFrame({ flow_opportunity: opportunity }),
    routeDecision: routeDecision(),
    safetyPregateOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runVisibleAgent: () => Promise.resolve("Tu veux un rappel rapide ?"),
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.toolSkillRun as any).committed_effects,
    [],
  );
  assertEquals(runtime.content, "Tu veux un rappel rapide ?");
  const state = readFlowOpportunityState(runtime.nextTempMemory);
  assertEquals(state?.skill_id, "flow_opportunity_verification");
  assertEquals(state?.target_flow, "status_recap");
  assert(state?.confirmation_anchor);
});

Deno.test("flow opportunity runtime launches accepted prepare_attack_card opportunity", async () => {
  const attackOpportunity = {
    opportunity_id: "attack_card.startup_friction",
    target_flow: "prepare_attack_card" as const,
    target_action: "prepare attack card for sas",
    confidence: "high" as const,
    priority: 80,
    reason: "startup friction on planned action",
    evidence: ["tourne autour du carnet"],
    seed_context: {
      target_hint: "Faire le sas de déchargement",
      focus: ["startup_friction"],
    },
  };
  const previous = createFlowOpportunityState({
    opportunity: attackOpportunity,
    userMessage:
      "Ce soir je tourne autour du carnet avant le sas de déchargement.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: attackOpportunity.opportunity_id,
    target_flow: attackOpportunity.target_flow,
    target_action: attackOpportunity.target_action,
    target_context: attackOpportunity.seed_context,
    reason: attackOpportunity.reason,
    evidence: attackOpportunity.evidence,
  });
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Oui, on fait ça.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: writeFlowOpportunityState({}, previous),
    turnFrame: turnFrame(),
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "flow_opportunity_verification",
    }),
    safetyPregateOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runLocalDispatcher: async () => ({
      ...output,
      local_action: "launch_target_flow",
      confidence: "high",
      visible_task: {
        kind: "accept_and_launch_target_flow",
        instruction: "launch attack card",
      },
    }),
    runPrepareAttackCardOperation: async (input: any) => {
      assertEquals(input.routeDecision.selected_handler, "prepare_attack_card");
      assertEquals(
        input.turnFrame.tool_skill_intents[0].operation_type,
        "prepare_attack_card",
      );
      assertEquals(
        input.turnFrame.tool_skill_intents[0].target_hint,
        "Faire le sas de déchargement",
      );
      return {
        content: "Quel est le piège au moment de commencer ?",
        nextTempMemory: { attack: true },
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "collecting",
          committed_effects: [],
        },
      };
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "Quel est le piège au moment de commencer ?");
  assertEquals(runtime.toolExecution, "blocked");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "prepare_attack_card",
  );
  assertEquals(
    (runtime.toolSkillRun as any).launched_by,
    "flow_opportunity_verification",
  );
  assertEquals(readFlowOpportunityState(runtime.nextTempMemory), null);
});
