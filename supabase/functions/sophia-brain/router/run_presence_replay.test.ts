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

Deno.test("replay 09/07: entry → sticky maintain → pivot offer → tool_pull exit", () => {
  let tempMemory: Record<string, unknown> = {};
  const localDate = "2026-07-09";

  // ── T1: message long et vulnérable (« ça fait 9 mois... ») → ENTRÉE.
  let active: unknown = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ?? null;
  let route = runConversationRouters({
    turn_frame: frame({ skill_signals: presence("critical", "maintain") }),
    active_skill_state: active,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(route.response_owner, "presence_conversation");
  assertEquals(route.reason_code, "presence_conversation_entry");
  let step = applyPresenceFlowState({
    tempMemory,
    activeSkillState: active,
    kind: "maintain",
    nowIso: "2026-07-09T01:09:00.000Z",
    localDate,
  });
  assertEquals(step.transition, "enter");
  tempMemory = step.tempMemory;

  // ── T2: « Oui mais comment on fait ça ? » — ambigu → MAINTIEN (le piège de
  // la vraie nuit: là ça basculait en coaching). Ici on reste collant.
  active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  route = runConversationRouters({
    turn_frame: frame({ skill_signals: {} }),
    active_skill_state: active,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(route.response_owner, "presence_conversation");
  assertEquals(route.reason_code, "active_presence_conversation");
  step = applyPresenceFlowState({
    tempMemory,
    activeSkillState: active,
    kind: "maintain",
    nowIso: "2026-07-09T01:10:00.000Z",
    localDate,
  });
  assertEquals(step.transition, "maintain");
  tempMemory = step.tempMemory;

  // ── T3: « comment je fais pour relâcher la pression avec une fille ? » —
  // demande de MÉTHODE = maintain: la méthode se donne en conversation,
  // aucune offre produit dans ce flow.
  active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  step = applyPresenceFlowState({
    tempMemory,
    activeSkillState: active,
    kind: "maintain",
    nowIso: "2026-07-09T01:24:00.000Z",
    localDate,
  });
  assertEquals(step.transition, "maintain");
  tempMemory = step.tempMemory;

  // ── T4: « Ok vas-y la carte » → tool_pull: SORTIE propre vers le dispatcher
  // global (le coaching prendra le relais au tour suivant, contexte frais).
  active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  step = applyPresenceFlowState({
    tempMemory,
    activeSkillState: active,
    kind: "tool_pull",
    nowIso: "2026-07-09T01:30:00.000Z",
    localDate,
  });
  assertEquals(step.transition, "exit");
  assertEquals(step.exit_reason, "tool_pull");
  tempMemory = step.tempMemory;
  assertEquals(tempMemory[ACTIVE_CONVERSATION_SKILL_KEY], undefined);

  // ── T5: après la sortie, le tour suivant re-dispatch globalement. Un signal
  // coaching explicite route bien coaching (le relais fonctionne).
  route = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "defense_card_pull",
        },
      },
    }),
    active_skill_state: null,
    safety_context_risk_band: "none",
    presence_flow_enabled: true,
  });
  assertEquals(route.response_owner, "coaching_recommendation");
});

Deno.test("replay guard: with the flag OFF the whole arc stays out of presence", () => {
  const route = runConversationRouters({
    turn_frame: frame({ skill_signals: presence("critical", "maintain") }),
    active_skill_state: null,
    safety_context_risk_band: "none",
    presence_flow_enabled: false,
  });
  assertEquals(route.response_owner, "normal_reply");
});
