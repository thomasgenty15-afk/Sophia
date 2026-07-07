import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";
import { type DispatcherLlmRunner, runDispatcher } from "./dispatcher.v2.ts";

function baseInput(message: string, llm_runner?: DispatcherLlmRunner) {
  return {
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web" as const,
    plan_snapshot: {
      items: [
        { id: "walk", title: "marche", kind: "habit", dimension: "habits" },
      ],
    },
    safety_context_output: {
      detected: false,
      risk_band: "none" as const,
      reason_codes: [],
      evidence: [],
      allow_side_effects: true,
      layer_contributions: {},
    } as any,
    source_message_id: "m1",
    turn_id: "t1",
    llm_runner,
  };
}

async function dispatch(message: string, raw: Record<string, unknown>) {
  return await runDispatcher(baseInput(message, async () => raw));
}

function assertNoLegacyRouteFields(frame: any) {
  const oldToolIntents = ["tool", "skill", "intents"].join("_");
  const oldOpportunity = ["flow", "opportunity"].join("_");
  const oldFitScore = ["normal", "reply", "fit", "score"].join("_");
  const oldFitEvidence = ["normal", "reply", "fit", "evidence"].join("_");
  assertEquals(oldToolIntents in frame, false);
  assertEquals(oldOpportunity in frame, false);
  assertEquals(oldFitScore in frame, false);
  assertEquals(oldFitEvidence in frame, false);
  assertEquals(frame.skill_signals.entry, undefined);
  assertEquals(frame.skill_signals.lifecycle, undefined);
  assertEquals(frame.skill_signals.exit, undefined);
}

Deno.test("dispatcher prompt is minimal and documents normal reply fallback", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Tu ne rediges pas la reponse finale"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("anciens flows locaux"),
    true,
  );
});

Deno.test("dispatcher prompt keeps action-linked emotion in action coaching", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Si la tension, peur, pression, boule au ventre",
    ),
    true,
  );
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message:
      "Le plus dur c'est le mail: je suis tendu avant de m'y mettre.",
    recent_messages: [],
    plan_snapshot: { items: [] },
  }));
  assertEquals(
    JSON.stringify(prompt).includes("action_linked_emotional_friction"),
    true,
  );
  assertEquals(
    JSON.stringify(prompt).includes(
      "The emotional friction is anchored to starting a concrete action",
    ),
    true,
  );
});

Deno.test("dispatcher prompt excludes active local runtime state from input", () => {
  const removedOperation = ["prepare", "attack", "card"].join("_");
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message: "ok",
    recent_messages: [],
    active_topic_state: { topic: "test" },
    flow_state_context: {
      last_local_flow_exit: {
        operation_type: removedOperation,
        target_dispatcher: removedOperation,
      },
    },
    plan_snapshot: { items: [] },
  }));

  assertEquals(prompt.prompt_version, DISPATCHER_V2_PROMPT_VERSION);
  assertEquals("active_skill_state" in prompt, false);
  assertEquals(
    ["active", "tool", "skill", "intake"].join("_") in prompt,
    false,
  );
  assertEquals(
    ["pending", "tool", "skill", "confirmation"].join("_") in prompt,
    false,
  );
});

Deno.test("dispatcher keeps one-shot reminder direct effect only", async () => {
  const frame = await dispatch("Rappelle-moi demain a 9h d'appeler Paul", {
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "demain a 9h appeler Paul" },
    }],
  });

  assertEquals(frame.direct_effects.map((effect) => effect.effect_type), [
    "create_one_shot_reminder",
  ]);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps track progress direct effect only", async () => {
  const frame = await dispatch("J'ai fait ma marche", {
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "walk", status_hint: "done" },
    }],
  });

  assertEquals(frame.direct_effects.map((effect) => effect.effect_type), [
    "track_progress_plan_item",
  ]);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher routes product explanation to product_help only", async () => {
  const frame = await dispatch("C'est quoi une carte de defense ?", {
    skill_signals: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "product_help_question",
      },
    },
  });

  assertEquals(frame.skill_signals.product_help?.detected, true);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps coaching recommendation signal", async () => {
  const frame = await dispatch(
    "Je n'y arrive pas sur cette action, je fais quoi ?",
    {
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "stuck_action_feature_recommendation",
        },
      },
    },
  );

  assertEquals(frame.skill_signals.coaching_recommendation?.detected, true);
  assertEquals(frame.skill_signals.product_help, undefined);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps plan_too_light drift direction through runtime sanitizer (nina-r4 B03)", async () => {
  const frame = await dispatch("Mon plan est trop mou, corse-le", {
    skill_signals: {
      plan_realignment: {
        detected: true,
        confidence_band: "high",
        reason: "plan_too_light_realignment",
        context: {
          drift_type: "plan_too_light",
          scope: "whole_plan",
          explicit_adjust_request: true,
          product_execution_allowed: false,
          reason: "User says the plan is too easy and asks to raise the level.",
        },
      },
    },
  });

  // Regression: le sanitizer runtime rabattait toute valeur hors liste sur
  // "ambiguous" — la direction UP doit survivre jusqu'au turn frame.
  assertEquals(
    frame.skill_signals.plan_realignment?.context?.drift_type,
    "plan_too_light",
  );
});

Deno.test("dispatcher normalizes coaching recommendation activation context", async () => {
  const frame = await dispatch("J'oublie mon action du soir du plan", {
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        reason: "plan_action_coaching_need",
          context: {
            coaching_type: "plan_action",
            confidence: 0.88,
            activation_checks: {
            is_coaching_need: true,
            is_about_plan_action: true,
            is_about_non_plan_action: false,
            is_about_emotional_state: false,
            has_concrete_plan_action: true,
            needs_type_confirmation: false,
          },
          action_context: {
            source: "plan",
            plan_item_id: "walk",
            action_title: "marche",
            action_type: "habit",
          },
          emotional_state_context: null,
          category: "plan_action_coaching",
          failure_mode: "forgetting",
          priority_features: ["attack_card"],
          reason: "User asks for coaching on a concrete plan action.",
        },
      },
    },
  });

  const context = frame.skill_signals.coaching_recommendation?.context;
  assertEquals(context?.coaching_type, "plan_action");
  assertEquals(context?.confidence, 0.88);
  assertEquals(context?.action_context?.plan_item_id, "walk");
  assertEquals(Object.hasOwn(context ?? {}, "activation_checks"), false);
  assertEquals(Object.hasOwn(context ?? {}, "needs_type_confirmation"), false);
  assertEquals(Object.hasOwn(context ?? {}, "emotional_state_context"), false);
  assertEquals(Object.hasOwn(context ?? {}, "category"), false);
  assertEquals(Object.hasOwn(context ?? {}, "failure_mode"), false);
  assertEquals(Object.hasOwn(context ?? {}, "priority_features"), false);
  assertEquals(Object.hasOwn(context?.action_context ?? {}, "action_type"), false);
});

Deno.test("dispatcher preserves plan realignment signal context without execution", async () => {
  const frame = await dispatch(
    "J'ai pris trop de retard sur mon plan, je crois qu'il faut le revoir.",
    {
      skill_signals: {
        plan_realignment: {
          detected: true,
          confidence_band: "high",
          reason: "plan_realignment_explicit_adjust",
          context: {
            drift_type: "late_on_plan",
            scope: "whole_plan",
            explicit_adjust_request: true,
            product_execution_allowed: true,
            reason: "User reports plan-level delay and wants to review it.",
            action_patch: { unsafe: true },
          },
        },
      },
    },
  );

  const context = frame.skill_signals.plan_realignment?.context;
  assertEquals(frame.skill_signals.plan_realignment?.detected, true);
  assertEquals(context?.drift_type, "late_on_plan");
  assertEquals(context?.scope, "whole_plan");
  assertEquals(context?.explicit_adjust_request, true);
  assertEquals(context?.product_execution_allowed, false);
  assertEquals(Object.hasOwn(context ?? {}, "action_patch"), false);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher preserves feature opportunity signal context", async () => {
  const frame = await dispatch(
    "Avant chaque diner j'ai du mal a ne pas fumer",
    {
      skill_signals: {
        feature_opportunity: {
          detected: true,
          confidence_band: "high",
          reason: "initiative_opportunity",
          context: {
            feature: "initiatives",
            opportunity_kind: "recurring_context",
            trigger_context: "avant chaque diner",
            user_problem_summary:
              "Difficulty not smoking before a repeated dinner context.",
            priority_reason: "Repeated context fits initiatives.",
          },
        },
      },
    },
  );

  const context = frame.skill_signals.feature_opportunity?.context;
  assertEquals(context?.feature, "initiatives");
  assertEquals(context?.opportunity_kind, "recurring_context");
  assertEquals(context?.trigger_context, "avant chaque diner");
});

Deno.test("dispatcher keeps initiative product question as product_help", async () => {
  const frame = await dispatch("C'est quoi une initiative ?", {
    skill_signals: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "product_help_question",
      },
    },
  });

  assertEquals(frame.skill_signals.product_help?.detected, true);
  assertEquals(frame.skill_signals.feature_opportunity, undefined);
});

Deno.test("dispatcher normalizes legacy entry coaching signal", async () => {
  const frame = await dispatch(
    "Je ne sais pas si je dois changer l'action ou mettre un rappel",
    {
      skill_signals: {
        entry: {
          coaching_recommendation: {
            detected: true,
            confidence_band: "medium",
            reason: "feature_choice",
          },
        },
      },
    },
  );

  assertEquals(frame.skill_signals.coaching_recommendation?.detected, true);
  assertEquals(
    frame.skill_signals.coaching_recommendation?.confidence_band,
    "medium",
  );
  assertEquals((frame.skill_signals as any).entry, undefined);
});

Deno.test("dispatcher treats personal active-state requests as normal fallback", async () => {
  const frame = await dispatch("J'ai quelles cartes de defense actives ?", {
    skill_signals: {},
    memory_plan: {
      response_intent: "personal_state_question",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "standard",
      context_budget_tier: "small",
      targets: [{ type: "runtime_snapshot", key: "active_surfaces" }],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.8,
    },
  });

  assertEquals(frame.skill_signals.product_help, undefined);
  assertEquals(frame.direct_effects, []);
  assertEquals(frame.memory_plan.context_need, "targeted");
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher filters hostile legacy LLM output", async () => {
  const frame = await dispatch("Je suis degoute j'ai rien fait", {
    [["normal", "reply", "fit", "score"].join("_")]: 0.1,
    [["normal", "reply", "fit", "evidence"].join("_")]: ["legacy"],
    [["tool", "skill", "intents"].join("_")]: [{
      operation_type: "removed_operation",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "create",
    }],
    [["flow", "opportunity"].join("_")]: {
      opportunity_id: "legacy",
      target_kind: "removed_operation",
      target_flow: "removed_operation",
      confidence: "high",
      priority: 99,
      reason: "legacy",
      evidence: ["legacy"],
      seed_context: {},
    },
    skill_signals: {
      entry: {
        removed_entry: { detected: true, confidence_band: "high" },
      },
      lifecycle: {
        removed_lifecycle: { detected: true, confidence_band: "high" },
      },
      exit: {
        product_help: { detected: true, confidence_band: "high" },
      },
    },
    direct_effects: [{
      effect_type: "removed_effect",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
  });

  assertEquals(frame.direct_effects, []);
  assertEquals(frame.skill_signals, {});
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher safety high clears product_help, research and direct effects", async () => {
  const frame = await runDispatcher({
    ...baseInput("Je veux me faire du mal"),
    safety_context_output: {
      detected: true,
      risk_band: "high" as const,
      reason_codes: ["self_harm"],
      evidence: ["Je veux me faire du mal"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
    llm_runner: async () => ({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
      needs_research: { detected: true, value: true, confidence: 0.9 },
    }),
  });

  assertEquals(frame.safety.risk_band, "high");
  assertEquals(frame.direct_effects, []);
  assertEquals(frame.skill_signals, {});
  assertEquals(frame.needs_research?.value, false);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher preserves needs_research without creating a route", async () => {
  const frame = await dispatch("Cherche la derniere version de cette API", {
    needs_research: {
      detected: true,
      value: true,
      query: "derniere version API",
      domain_hint: "software",
      confidence: 0.9,
      reason: "fresh_information_requested",
    },
  });

  assertEquals(frame.needs_research?.value, true);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});
