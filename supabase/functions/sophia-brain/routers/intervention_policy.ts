import type { BlockedPath } from "../contracts/route_decision.v1.ts";
import type { ConfidenceBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { SkillRouterDecision } from "./skill_router.ts";
import type { ToolSkillRouterDecision } from "./tool_skill_router.ts";

export type FlowInterventionContext = {
  last_flow_target?: string | null;
  turns_since_last_flow_offer?: number | null;
  turns_since_last_flow_entry?: number | null;
  turns_since_last_flow_exit?: number | null;
  turns_since_last_flow_decline?: number | null;
  recent_flow_offer_count?: number | null;
};

export type InterventionPolicyDecision = {
  block_tool_skill_start: boolean;
  block_conversation_skill_start: boolean;
  block_flow_opportunity: boolean;
  blocked_paths: BlockedPath[];
};

function clampScore(score: unknown): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.max(0, Math.min(1, score));
}

function scoreFromBand(confidence: ConfidenceBand | undefined): number {
  switch (confidence) {
    case "critical":
      return 0.95;
    case "high":
      return 0.82;
    case "medium":
      return 0.6;
    case "low":
      return 0.35;
    default:
      return 0.5;
  }
}

function selectedToolIntent(
  turnFrame: TurnFrame,
  toolSkill: ToolSkillRouterDecision,
) {
  if (!toolSkill.operation_type) return null;
  return turnFrame.tool_skill_intents.find((intent) =>
    intent.operation_type === toolSkill.operation_type
  ) ?? null;
}

function selectedEntrySkillSignal(
  turnFrame: TurnFrame,
  skill: SkillRouterDecision,
) {
  if (!skill.selected_skill_id) return null;
  return turnFrame.skill_signals.entry?.[skill.selected_skill_id] ?? null;
}

function targetForOpportunity(
  opportunity: NonNullable<TurnFrame["flow_opportunity"]>,
): string | null {
  return opportunity.target_flow ?? opportunity.opportunity_id ?? null;
}

function normalizedEvidenceText(parts: unknown[]): string {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function demotivationSignalSupportsActionRefusal(signal: unknown): boolean {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    return false;
  }
  const record = signal as Record<string, unknown>;
  if (record.detected === false) return false;
  const confidence = String(record.confidence_band ?? "").trim();
  const score = clampScore(record.score);
  const strong = confidence === "high" || confidence === "critical" ||
    (score !== null && score >= 0.75);
  if (!strong) return false;
  const evidence = normalizedEvidenceText([
    record.reason,
    ...(Array.isArray(record.evidence) ? record.evidence : []),
  ]);
  if (!evidence) return false;
  const hasActionRefusal = evidence.includes("explicit_action_refusal") ||
    evidence.includes("refus") || evidence.includes("refuse") ||
    evidence.includes("pas de carte") ||
    evidence.includes("pas d'action") ||
    evidence.includes("pas maintenant");
  const hasRepairFocus = evidence.includes("loss_of_desire") ||
    evidence.includes("perte d'envie") ||
    evidence.includes("perte envie") ||
    evidence.includes("demotivation") ||
    evidence.includes("ressenti") ||
    evidence.includes("comprendre");
  return hasActionRefusal && hasRepairFocus;
}

export function demotivationRepairOwnsAfterActionRefusal(
  turnFrame: TurnFrame | null,
): boolean {
  const signal = turnFrame?.skill_signals?.entry?.demotivation_repair ??
    turnFrame?.skill_signals?.lifecycle?.demotivation_repair;
  return demotivationSignalSupportsActionRefusal(signal);
}

function recencyPenalty(args: {
  target?: string | null;
  context?: FlowInterventionContext;
}): number {
  const context = args.context;
  if (!context) return 0;

  let penalty = 0;
  const sameTarget = args.target && context.last_flow_target === args.target;
  if (
    sameTarget &&
    typeof context.turns_since_last_flow_decline === "number" &&
    context.turns_since_last_flow_decline <= 3
  ) {
    penalty += 0.35;
  }
  if (
    typeof context.turns_since_last_flow_entry === "number" &&
    context.turns_since_last_flow_entry <= 2
  ) {
    penalty += 0.2;
  }
  if (
    sameTarget &&
    typeof context.turns_since_last_flow_exit === "number" &&
    context.turns_since_last_flow_exit <= 2
  ) {
    penalty += 0.2;
  }
  if (
    typeof context.turns_since_last_flow_offer === "number" &&
    context.turns_since_last_flow_offer <= 1
  ) {
    penalty += 0.12;
  }
  if (
    typeof context.recent_flow_offer_count === "number" &&
    context.recent_flow_offer_count >= 2
  ) {
    penalty += 0.1;
  }
  return Math.min(0.5, penalty);
}

function shouldBlockImplicitStart(args: {
  rawScore: number;
  adjustedScore: number;
  normalReplyFitScore: number;
  margin?: number;
}): boolean {
  const margin = args.margin ?? 0.08;
  if (args.adjustedScore < 0.72) return true;
  return args.adjustedScore < args.normalReplyFitScore + margin;
}

export function runInterventionPolicy(input: {
  turn_frame: TurnFrame;
  skill: SkillRouterDecision;
  tool_skill: ToolSkillRouterDecision;
  flow_intervention_context?: FlowInterventionContext;
}): InterventionPolicyDecision {
  const normalReplyFitScore = clampScore(
    input.turn_frame.normal_reply_fit_score,
  );
  const blocked_paths: BlockedPath[] = [];
  let blockToolSkillStart = false;
  let blockConversationSkillStart = false;
  let blockFlowOpportunity = false;
  const actionRefusalPrefersDemotivation =
    demotivationRepairOwnsAfterActionRefusal(input.turn_frame);

  if (
    input.tool_skill.status === "start" &&
    input.tool_skill.operation_type === "prepare_attack_card" &&
    actionRefusalPrefersDemotivation
  ) {
    blockToolSkillStart = true;
    blocked_paths.push({
      path: "tool_skill.prepare_attack_card",
      reason_code: "explicit_action_refusal_prefers_demotivation_repair",
    });
  }

  const flowOpportunityDecision = evaluateFlowOpportunityIntervention({
    turn_frame: input.turn_frame,
    flow_intervention_context: input.flow_intervention_context,
  });
  blockFlowOpportunity = flowOpportunityDecision.block_flow_opportunity;
  blocked_paths.push(...flowOpportunityDecision.blocked_paths);

  if (normalReplyFitScore === null) {
    return {
      block_tool_skill_start: blockToolSkillStart,
      block_conversation_skill_start: blockConversationSkillStart,
      block_flow_opportunity: blockFlowOpportunity,
      blocked_paths,
    };
  }

  if (input.tool_skill.status === "start") {
    const intent = selectedToolIntent(input.turn_frame, input.tool_skill);
    if (
      intent?.operation_type === "prepare_attack_card" &&
      actionRefusalPrefersDemotivation
    ) {
      blockToolSkillStart = true;
    } else if (intent && intent.explicitness !== "explicit") {
      const rawScore = clampScore(intent.score) ??
        scoreFromBand(intent.confidence_band);
      const adjustedScore = Math.max(
        0,
        rawScore -
          recencyPenalty({
            target: intent.operation_type,
            context: input.flow_intervention_context,
          }),
      );
      blockToolSkillStart = shouldBlockImplicitStart({
        rawScore,
        adjustedScore,
        normalReplyFitScore,
      });
      if (blockToolSkillStart) {
        blocked_paths.push({
          path: `tool_skill.${intent.operation_type}`,
          reason_code: "normal_reply_fit_dominates",
          raw_score: rawScore,
          adjusted_score: adjustedScore,
          normal_reply_fit_score: normalReplyFitScore,
        });
      }
    }
  }

  if (
    input.skill.status === "start" &&
    (input.skill.selected_skill_id === "emotional_repair" ||
      input.skill.selected_skill_id === "demotivation_repair") &&
    !(
      input.skill.selected_skill_id === "demotivation_repair" &&
      actionRefusalPrefersDemotivation
    )
  ) {
    const signal = selectedEntrySkillSignal(input.turn_frame, input.skill);
    const rawScore = clampScore(signal?.score) ??
      scoreFromBand(signal?.confidence_band);
    const adjustedScore = rawScore;
    blockConversationSkillStart = shouldBlockImplicitStart({
      rawScore,
      adjustedScore,
      normalReplyFitScore,
      margin: 0.1,
    });
    if (blockConversationSkillStart && input.skill.selected_skill_id) {
      blocked_paths.push({
        path: `conversation_skill.${input.skill.selected_skill_id}`,
        reason_code: "normal_reply_fit_dominates",
        raw_score: rawScore,
        adjusted_score: adjustedScore,
        normal_reply_fit_score: normalReplyFitScore,
      });
    }
  }

  return {
    block_tool_skill_start: blockToolSkillStart,
    block_conversation_skill_start: blockConversationSkillStart,
    block_flow_opportunity: blockFlowOpportunity,
    blocked_paths,
  };
}

export function evaluateFlowOpportunityIntervention(input: {
  turn_frame: TurnFrame | null;
  flow_intervention_context?: FlowInterventionContext;
}): Pick<
  InterventionPolicyDecision,
  "block_flow_opportunity" | "blocked_paths"
> {
  const turnFrame = input.turn_frame;
  const normalReplyFitScore = clampScore(turnFrame?.normal_reply_fit_score);
  const opportunity = turnFrame?.flow_opportunity ?? null;
  const blocked_paths: BlockedPath[] = [];
  if (
    opportunity?.target_flow === "prepare_attack_card" &&
    demotivationRepairOwnsAfterActionRefusal(turnFrame)
  ) {
    blocked_paths.push({
      path: "flow_opportunity.prepare_attack_card",
      reason_code: "explicit_action_refusal_prefers_demotivation_repair",
    });
    return { block_flow_opportunity: true, blocked_paths };
  }
  if (normalReplyFitScore === null || !opportunity) {
    return { block_flow_opportunity: false, blocked_paths };
  }

  const rawScore = clampScore(opportunity.score) ??
    scoreFromBand(opportunity.confidence);
  const adjustedScore = Math.max(
    0,
    rawScore -
      recencyPenalty({
        target: targetForOpportunity(opportunity),
        context: input.flow_intervention_context,
      }),
  );
  const blockFlowOpportunity = shouldBlockImplicitStart({
    rawScore,
    adjustedScore,
    normalReplyFitScore,
  });
  if (blockFlowOpportunity) {
    blocked_paths.push({
      path: `flow_opportunity.${opportunity.target_flow}`,
      reason_code: "normal_reply_fit_dominates",
      raw_score: rawScore,
      adjusted_score: adjustedScore,
      normal_reply_fit_score: normalReplyFitScore,
    });
  }
  return { block_flow_opportunity: blockFlowOpportunity, blocked_paths };
}
