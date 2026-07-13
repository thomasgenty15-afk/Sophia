import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { PresenceConversationKind } from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../routers/routers.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t-presence",
    source_message_id: "m-presence",
    user_id: "u-presence",
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

function presenceSignal(
  confidence: "low" | "medium" | "high" | "critical",
  kind: PresenceConversationKind = "maintain",
): TurnFrame["skill_signals"] {
  return {
    presence_conversation: {
      detected: true,
      confidence_band: confidence,
      context: { kind, reason: "test" },
    },
  };
}

const activePresence = {
  skill_id: "presence_conversation",
  status: "active",
  updated_at: new Date().toISOString(),
};
const activeCoaching = {
  skill_id: "coaching_recommendation",
  status: "active",
  updated_at: new Date().toISOString(),
};
const activeWeekly = {
  skill_id: "weekly_adaptive_review_v1",
  status: "active",
  updated_at: new Date().toISOString(),
};

Deno.test("presence entry: strong signal from clean state enters presence", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("high") }),
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "presence_conversation");
  assertEquals(d.reason_code, "presence_conversation_entry");
});

// Pas de préemption parent→enfant: un coaching actif garde le tour même face
// à un signal présence fort. C'est le flow coaching lui-même qui rend la main
// (exit_to_global_dispatcher sur dépôt discursif → re-dispatch global le même
// tour, état purgé), et l'entrée présence se fait alors sur l'état propre.
Deno.test("active coaching keeps the turn even on a strong presence signal (exit belongs to the local flow)", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("critical") }),
    active_skill_state: activeCoaching,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "coaching_recommendation");
  assertEquals(d.reason_code, "active_coaching_recommendation");
});

Deno.test("post-exit re-dispatch: strong presence signal on a purged state enters presence", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("critical") }),
    active_skill_state: null,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "presence_conversation");
  assertEquals(d.reason_code, "presence_conversation_entry");
});

Deno.test("fresh presence entry outranks a concurrent fresh coaching signal", () => {
  const d = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        ...presenceSignal("high"),
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "concurrent",
        },
      },
    }),
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "presence_conversation");
  assertEquals(d.reason_code, "presence_conversation_entry");
});

Deno.test("flag off: no entry even on a strong signal", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("high") }),
    safety_context_risk_band: "none",
    presence_flow_enabled: false,
  });
  assertEquals(d.response_owner, "normal_reply");
});

Deno.test("conservative entry: a medium signal does NOT enter", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("medium") }),
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "normal_reply");
});

Deno.test("active presence continues (sticky), even with a bare/ambiguous turn", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: {} }),
    active_skill_state: activePresence,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "presence_conversation");
  assertEquals(d.reason_code, "active_presence_conversation");
});

Deno.test("safety high preempts even an active presence flow", () => {
  const d = runConversationRouters({
    turn_frame: frame({
      safety: { risk_band: "high", reason_codes: [], evidence: [] },
    }),
    active_skill_state: activePresence,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "safety");
});

Deno.test("weekly review active blocks presence entry (hard lock)", () => {
  const d = runConversationRouters({
    turn_frame: frame({ skill_signals: presenceSignal("high") }),
    active_skill_state: activeWeekly,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "weekly_adaptive_review_v1");
});

Deno.test("active presence passes direct effects through (parenthèse tâche)", () => {
  const d = runConversationRouters({
    turn_frame: frame({
      skill_signals: {},
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
      }] as any,
    }),
    active_skill_state: activePresence,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "presence_conversation");
  assertEquals(d.direct_effects_to_run, ["create_one_shot_reminder"]);
  assertEquals(d.reason_code, "active_presence_conversation_with_direct_effects");
});

Deno.test("no regression: coaching signal without presence still routes coaching", () => {
  const d = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "x",
        },
      },
    }),
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(d.response_owner, "coaching_recommendation");
});
