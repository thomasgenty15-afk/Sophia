import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runEffectGateOrchestrator } from "./effect_gate_orchestrator.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

Deno.test("orchestrator: gates each effect and partitions outcomes", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { text: "rappel" },
        },
        {
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        },
      ],
    }),
    direct_effects_to_run: [
      "create_one_shot_reminder",
      "track_progress_plan_item",
    ],
  });

  assertEquals(result.allowed, ["create_one_shot_reminder"]);
  assertEquals(result.clarifications.length, 1);
  assertEquals(
    result.clarifications[0].effect_type,
    "track_progress_plan_item",
  );
  assertEquals(result.clarifications[0].reason_code, "target_ambiguous");
  assertEquals(result.outcomes.create_one_shot_reminder.decision, "allow");
  assertEquals(
    result.outcomes.track_progress_plan_item.decision,
    "needs_clarify",
  );
  assertEquals(result.additional_blocked_paths, [
    { path: "track_progress_plan_item", reason_code: "target_ambiguous" },
  ]);
});

Deno.test("orchestrator: safety band allows one-shot reminder and blocks other direct effects", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame({
      safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        },
        {
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        },
      ],
    }),
    direct_effects_to_run: [
      "create_one_shot_reminder",
      "track_progress_plan_item",
    ],
  });
  assertEquals(result.allowed, ["create_one_shot_reminder"]);
  assertEquals(
    result.outcomes.create_one_shot_reminder.decision,
    "allow",
  );
  assertEquals(
    result.outcomes.track_progress_plan_item.decision,
    "blocked",
  );
  assertEquals(result.additional_blocked_paths, [
    { path: "track_progress_plan_item", reason_code: "safety_high" },
  ]);
});

Deno.test("orchestrator: db idempotency duplicate is blocked", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        },
      ],
    }),
    direct_effects_to_run: ["create_one_shot_reminder"],
    db_idempotency_check: async () => true,
  });
  assertEquals(result.allowed, []);
  assertEquals(
    (result.outcomes.create_one_shot_reminder as { reason_code: string })
      .reason_code,
    "duplicate_db",
  );
});

Deno.test("orchestrator: unknown effect types are rejected without invoking gate", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame(),
    direct_effects_to_run: ["mystery_effect"],
  });
  assertEquals(result.allowed, []);
  assertEquals(result.outcomes.mystery_effect.decision, "blocked");
  assertEquals(result.additional_blocked_paths, [
    { path: "mystery_effect", reason_code: "unknown_effect_type" },
  ]);
});

Deno.test("orchestrator: deduplicates repeated effect types", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        },
      ],
    }),
    direct_effects_to_run: [
      "create_one_shot_reminder",
      "create_one_shot_reminder",
    ],
  });
  assertEquals(result.allowed, ["create_one_shot_reminder"]);
  assertEquals(Object.keys(result.outcomes).length, 1);
});

Deno.test("gate never arms a recurring reminder request as one-shot (alex-r1 B02)", async () => {
  const result = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          cardinality: "recurring",
          when_hint: "tous les matins a 7h",
        },
      }],
    }),
    direct_effects_to_run: ["create_one_shot_reminder"],
  });
  // La selection est propre AVANT l'executor: rien d'arme, raison canonique.
  assertEquals(result.allowed, []);
  assertEquals(
    result.additional_blocked_paths[0]?.reason_code,
    "recurring_not_supported",
  );
});

Deno.test("gate keeps arming a one-shot (cardinality once) and a cancel of a recurring-tagged payload (anti-faux-positif)", async () => {
  const once = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { cardinality: "once", when_hint: "demain a 7h" },
      }],
    }),
    direct_effects_to_run: ["create_one_shot_reminder"],
  });
  assertEquals(once.allowed, ["create_one_shot_reminder"]);

  const cancel = await runEffectGateOrchestrator({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { intent: "cancel", cardinality: "recurring" },
      }],
    }),
    direct_effects_to_run: ["create_one_shot_reminder"],
  });
  assertEquals(cancel.allowed, ["create_one_shot_reminder"]);
});
