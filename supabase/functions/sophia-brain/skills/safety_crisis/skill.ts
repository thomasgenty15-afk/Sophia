import {
  baseOutput,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";
import { conversationEffectsFromCandidates } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import type { SafetyCrisisDecision } from "./contract.ts";
import {
  buildSafetyCrisisIntakeInput,
  buildSafetySnapshot,
  runSafetyCrisisStructuredIntake,
} from "./intake.ts";
import {
  applyConservativeSafetyOverrides,
  inferStructuredSafetySignals,
} from "./signals.ts";
import { reduceSafetyCrisis } from "./reducer.ts";
import { renderSafetyReply } from "./renderer.ts";

export async function runSafetyCrisisSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const snapshot = buildSafetySnapshot(input);
  const intakeResult = await runSafetyCrisisStructuredIntake(
    buildSafetyCrisisIntakeInput({ input, snapshot }),
  );
  const intakeSignals = inferStructuredSafetySignals({
    snapshot,
    intakeResult,
  });
  const safetySignals = applyConservativeSafetyOverrides({
    snapshot,
    signals: intakeSignals,
  });
  const reduction = reduceSafetyCrisis({
    previousState: snapshot.previous_state,
    signals: safetySignals,
    sourceRiskBand: snapshot.source_risk_band,
  });
  const rendered = renderSafetyReply({
    phase: reduction.phase,
    signals: safetySignals,
    previousState: snapshot.previous_state,
    riskBand: reduction.riskBand,
  });
  const decision: SafetyCrisisDecision = {
    skill_id: "safety_crisis",
    phase: reduction.phase,
    risk_band: reduction.riskBand,
    safety_signals: safetySignals,
    response_contract: rendered.responseContract,
    reply: rendered.reply,
    state_patch: reduction.statePatch,
  };
  const status = decision.phase === "resolved" ? "exit" : "continue";
  const memoryWriteCandidates = [
    statementCandidate(
      `Safety mode active; phase=${decision.phase}; risk=${decision.risk_band}.`,
      snapshot.source_message_id,
      decision.risk_band === "critical" || decision.risk_band === "high"
        ? 4
        : 3,
      false,
    ),
  ];

  return baseOutput("safety_crisis", {
    status,
    response_intent: decision.phase === "resolved"
      ? "deescalate_and_exit"
      : decision.phase === "acute_grounding"
      ? "ground_safety"
      : "continue_safety_flow",
    reply: decision.reply,
    diagnosis: {
      phase: decision.phase,
      source_risk_band: snapshot.source_risk_band,
      risk_band: decision.risk_band,
      safety_signals: decision.safety_signals,
      response_contract: decision.response_contract,
      intake_ok: intakeResult.ok,
      intake_reason: intakeResult.reason ?? null,
      intake_paraphrase: intakeResult.paraphrase ?? null,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "no_product_push_during_safety",
        "no_tool_suggestion_during_safety",
        "no_memory_persistence_by_default",
      ],
    },
    operation_suggestions: [],
    memory_write_candidates: memoryWriteCandidates,
    effects: conversationEffectsFromCandidates({
      intake_failed: !intakeResult.ok,
      memory_write_candidates: intakeResult.ok ? memoryWriteCandidates : [],
    }),
    state_patch: decision.state_patch,
  });
}
