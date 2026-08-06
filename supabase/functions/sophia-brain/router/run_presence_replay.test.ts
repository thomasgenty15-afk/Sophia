/**
 * Replay étalon (offline) de la conversation du 09/07 (user f3bd26a5, sujet
 * intime) qui avait déraillé sous coaching_recommendation. On rejoue l'ARC au
 * niveau routeur + machine à états avec des signaux dispatcher mockés (pas de
 * LLM): entrée → maintien collant (y compris demandes de méthode) → sortie
 * tool_pull. C'est le juge de paix de la structure; la qualité des mots est
 * validée séparément en run QA staging.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  PresenceConversationKind,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { applyPresenceFlowState } from "../skills/presence_conversation/apply.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t",
    source_message_id: "m",
    user_id: "f3bd26a5",
    channel: "whatsapp",
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

function presence(
  confidence: "medium" | "high" | "critical",
  kind: PresenceConversationKind,
): TurnFrame["skill_signals"] {
  return {
    presence_conversation: {
      detected: true,
      confidence_band: confidence,
      context: { kind, topic_hint: "porno/anxiété de performance", reason: "" },
    },
  };
}

Deno.test("replay guard: with the flag OFF the whole arc stays out of presence", () => {
  const route = runConversationRouters({
    turn_frame: frame({ skill_signals: presence("critical", "maintain") }),
    active_skill_state: null,
    safety_context_risk_band: "none",
    presence_flow_enabled: false,
  });
  assertEquals(route.response_owner, "normal_reply");
});
