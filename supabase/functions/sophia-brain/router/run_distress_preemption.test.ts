import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../routers/routers.ts";

// Preemption detresse (paul-r3 T12, BF-SAFETY-01/BF-ROUTE-04): a band medium,
// worthlessness/hopelessness => tour de soutien sans lane de recommandation;
// ideation passive => le chemin safety possede le tour. Un decouragement
// simple (low / emotional_distress) ne change RIEN (anti-sur-declenchement,
// green alex-r1 T10 a proteger).

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t-distress-preemption",
    source_message_id: "m-distress-preemption",
    user_id: "u-distress-preemption",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    needs_research: { detected: false, value: false },
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

const activeCoachingFlow = {
  skill_id: "coaching_recommendation",
  status: "active",
  updated_at: new Date().toISOString(),
};

Deno.test("worthlessness medium blocks recommendation lanes even under active coaching flow (paul-r3 T12)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["emotional_distress", "worthlessness_thoughts"],
        evidence: ["au fond du trou", "pas servir à grand-chose"],
      },
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "support_request",
        },
      },
    }),
    active_skill_state: activeCoachingFlow,
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.reason_code, "distress_support_priority");
  const blockedPaths = decision.blocked_paths.map((path) => path.path);
  for (
    const lane of [
      "coaching_recommendation",
      "product_help",
      // W2.A: la lane "feature_opportunity" n'existe plus, elle a disparu des
      // blocked_paths de la préemption détresse.
      "plan_realignment",
    ]
  ) {
    assertEquals(blockedPaths.includes(lane), true, `${lane} must be blocked`);
  }
});

Deno.test("passive ideation medium routes to safety owner (paul-r3 T13 ownership)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["suicidal_ideation_passive"],
        evidence: ["ça changerait pas grand-chose si j'étais plus là"],
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.selected_handler, "safety_crisis");
  assertEquals(decision.reason_code, "distress_ideation_safety_priority");
});

Deno.test("simple discouragement stays untouched — no preemption (alex-r1 T10 green)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "low",
        reason_codes: ["emotional_distress", "demoralization"],
        evidence: ["dégoûté d'avoir raté mon sas"],
      },
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "stuck_action",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "coaching_recommendation");
});

Deno.test("medium WITHOUT distress codes keeps coaching available (substance urge doctrine 1c)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["substance_use_urge", "imminent_relapse_risk"],
        evidence: ["grosse envie de fumer là"],
      },
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "risk_moment",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "coaching_recommendation");
});

Deno.test("distress support keeps legitimate direct effects runnable (no mute path)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["worthlessness_thoughts"],
        evidence: ["je sers à rien"],
      },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { target_item_id: "item-1", status_hint: "missed" },
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.direct_effects_to_run, ["track_progress_plan_item"]);
});

Deno.test("high/critical branch keeps absolute priority over distress branches", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "high",
        reason_codes: ["explicit_suicidal_thoughts"],
        evidence: ["je veux en finir"],
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.reason_code, "safety_high_critical_priority");
});

Deno.test("active safety flow branch stays ahead of distress branches (continuity preserved)", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["worthlessness_thoughts"],
        evidence: ["je suis un poids"],
      },
    }),
    active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "safety");
  assertEquals(
    decision.active_flow_arbitration?.decision,
    "continue_active",
  );
});
