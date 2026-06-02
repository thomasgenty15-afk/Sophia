import type {
  ClarificationAmbiguityKind,
  ClarificationCandidate,
} from "../clarification/contract.ts";
import type { ConfidenceBand, TurnFrame } from "../contracts/turn_frame.v1.ts";

export type ClarificationCandidateBuildResult = {
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
  known_context: Record<string, unknown>;
} | null;

export type ActiveSkillClarificationCandidateBuildResult = {
  owner: string;
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
  known_context: Record<string, unknown>;
} | null;

type CandidatePatch = ClarificationCandidate & {
  source:
    | "direct_effect"
    | "tool_skill_intent"
    | "skill_signal"
    | "opportunity"
    | "message_hint";
  confidence_band?: ConfidenceBand | null;
};

const OPERATION_LABELS: Record<string, string> = {
  create_one_shot_reminder: "un rappel ponctuel",
  create_recurring_reminder: "un rappel récurrent",
  prepare_attack_card: "préparer une carte d'attaque",
  prepare_defense_card: "préparer une carte de défense",
  adjust_plan_item: "ajuster le plan",
  select_state_potion: "changer d'état avec une potion",
  update_coach_preferences: "modifier une préférence de coaching",
};

const SKILL_LABELS: Record<string, string> = {
  product_help: "une explication sur Sophia",
  emotional_repair: "un soutien émotionnel",
  execution_breakdown: "découper une action",
  demotivation_repair: "faire le point sur la motivation",
  weekly_adaptive_review_v1: "continuer le point weekly",
};

const ACTIVE_SKILL_ALLOWED_CANDIDATES: Record<string, Set<string>> = {
  product_help: new Set([
    "product_help",
    "prepare_attack_card",
    "prepare_defense_card",
    "adjust_plan_item",
    "select_state_potion",
    "create_one_shot_reminder",
    "create_recurring_reminder",
  ]),
  execution_breakdown: new Set([
    "execution_breakdown",
    "adjust_plan_item",
    "emotional_repair",
    "demotivation_repair",
    "select_state_potion",
  ]),
  emotional_repair: new Set([
    "emotional_repair",
    "select_state_potion",
    "execution_breakdown",
    "adjust_plan_item",
    "demotivation_repair",
  ]),
  demotivation_repair: new Set([
    "demotivation_repair",
    "emotional_repair",
    "execution_breakdown",
    "adjust_plan_item",
    "select_state_potion",
  ]),
  weekly_adaptive_review_v1: new Set([
    "weekly_adaptive_review_v1",
    "adjust_plan_item",
    "execution_breakdown",
    "product_help",
  ]),
};

function operationLabel(operationType: string): string {
  return OPERATION_LABELS[operationType] ?? operationType.replaceAll("_", " ");
}

function skillLabel(skillId: string): string {
  return SKILL_LABELS[skillId] ?? skillId.replaceAll("_", " ");
}

function addCandidate(
  byId: Map<string, CandidatePatch>,
  candidate: CandidatePatch,
): void {
  if (!candidate.id || !candidate.label) return;
  const existing = byId.get(candidate.id);
  if (!existing) {
    byId.set(candidate.id, candidate);
    return;
  }
  byId.set(candidate.id, {
    ...existing,
    evidence: [
      ...(existing.evidence ?? []),
      ...(candidate.evidence ?? []),
    ].slice(0, 8),
  });
}

function candidateForActiveSkill(skillId: string): CandidatePatch | null {
  if (!ACTIVE_SKILL_ALLOWED_CANDIDATES[skillId]) return null;
  return {
    id: skillId,
    label: skillLabel(skillId),
    evidence: ["active_skill_state"],
    source: "skill_signal",
    confidence_band: "high",
  };
}

function normalizeHintText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasStatePotionHint(userMessage: unknown): boolean {
  const text = normalizeHintText(userMessage);
  return /\b(potion|changer d etat|change d etat|etat avec une potion|potion d etat)\b/
    .test(text);
}

function addActiveSkillMessageHintCandidates(args: {
  byId: Map<string, CandidatePatch>;
  allowed: Set<string>;
  userMessage?: string | null;
}): void {
  if (
    args.allowed.has("select_state_potion") &&
    hasStatePotionHint(args.userMessage)
  ) {
    addCandidate(args.byId, {
      id: "select_state_potion",
      label: operationLabel("select_state_potion"),
      operation_type: "select_state_potion",
      evidence: ["user_message.state_potion_hint"],
      source: "message_hint",
      confidence_band: "medium",
    });
  }
}

function signalDetected(signal: unknown): boolean {
  return Boolean(
    signal && typeof signal === "object" &&
      (signal as { detected?: unknown }).detected === true,
  );
}

function signalConfidence(signal: unknown): ConfidenceBand | null {
  const value = String(
    signal && typeof signal === "object"
      ? (signal as { confidence_band?: unknown }).confidence_band ?? ""
      : "",
  );
  return value === "low" || value === "medium" || value === "high" ||
      value === "critical"
    ? value
    : null;
}

function isCandidateConfidenceUsable(
  confidence: ConfidenceBand | null,
): boolean {
  return confidence == null || confidence === "medium" ||
    confidence === "high" || confidence === "critical";
}

function inferAmbiguityKind(candidates: ClarificationCandidate[]) {
  const ids = new Set(candidates.map((candidate) => candidate.id));
  if (
    ids.has("create_one_shot_reminder") && ids.has("create_recurring_reminder")
  ) {
    return "timing" as const;
  }
  if (
    ids.has("product_help") &&
    candidates.some((candidate) => candidate.operation_type)
  ) {
    return "intent" as const;
  }
  if (
    ids.has("emotional_repair") &&
    (ids.has("select_state_potion") || ids.has("execution_breakdown") ||
      ids.has("adjust_plan_item"))
  ) {
    return "target" as const;
  }
  if (
    ids.has("execution_breakdown") && ids.has("adjust_plan_item")
  ) {
    return "handoff_readiness" as const;
  }
  return "intent" as const;
}

function hasCandidate(
  candidates: ClarificationCandidate[],
  id: string,
): boolean {
  return candidates.some((candidate) => candidate.id === id);
}

function operationCount(candidates: ClarificationCandidate[]): number {
  return candidates.filter((candidate) => candidate.operation_type).length;
}

function activeSkillId(activeSkillState: unknown): string | null {
  const record = activeSkillState as { skill_id?: unknown } | null;
  const value = typeof record?.skill_id === "string"
    ? record.skill_id.trim()
    : "";
  return value || null;
}

function shouldClarifyCandidates(
  candidates: ClarificationCandidate[],
): boolean {
  const hasOperation = candidates.some((candidate) => candidate.operation_type);
  const hasProductHelp = hasCandidate(candidates, "product_help");
  const hasOneShot = hasCandidate(candidates, "create_one_shot_reminder");
  const hasRecurring = hasCandidate(candidates, "create_recurring_reminder");
  const hasExecutionBreakdown = hasCandidate(candidates, "execution_breakdown");
  const hasEmotionalRepair = hasCandidate(candidates, "emotional_repair");
  const hasDemotivationRepair = hasCandidate(candidates, "demotivation_repair");
  const hasAdjustPlan = hasCandidate(candidates, "adjust_plan_item");
  const hasStatePotion = hasCandidate(candidates, "select_state_potion");

  if (hasProductHelp && hasOperation) return true;
  if (hasOneShot && hasRecurring) return true;
  if (operationCount(candidates) > 1) return true;

  if (hasExecutionBreakdown && hasAdjustPlan) return true;
  if (hasExecutionBreakdown && hasStatePotion) return true;
  if (hasEmotionalRepair && (hasStatePotion || hasAdjustPlan)) return true;
  if (hasEmotionalRepair && hasExecutionBreakdown) return true;
  if (hasDemotivationRepair && (hasAdjustPlan || hasExecutionBreakdown)) {
    return true;
  }

  return false;
}

function collectCandidatesFromTurnFrame(
  turnFrame: TurnFrame | null | undefined,
): { candidates: CandidatePatch[]; safetyRiskBand: string | null } | null {
  if (!turnFrame) return null;
  if (
    turnFrame.safety.risk_band === "high" ||
    turnFrame.safety.risk_band === "critical"
  ) {
    return null;
  }

  const byId = new Map<string, CandidatePatch>();

  for (const effect of turnFrame.direct_effects ?? []) {
    if (effect.confidence_band === "low") continue;
    addCandidate(byId, {
      id: effect.effect_type,
      label: operationLabel(effect.effect_type),
      operation_type: effect.effect_type,
      evidence: ["turn_frame.direct_effects"],
      source: "direct_effect",
      confidence_band: effect.confidence_band,
    });
  }

  for (const intent of turnFrame.tool_skill_intents ?? []) {
    if (
      intent.confidence_band === "low" ||
      intent.user_intent === "explain_only"
    ) continue;
    addCandidate(byId, {
      id: intent.operation_type,
      label: operationLabel(intent.operation_type),
      operation_type: intent.operation_type,
      evidence: ["turn_frame.tool_skill_intents"],
      source: "tool_skill_intent",
      confidence_band: intent.confidence_band,
    });
  }

  const entries = turnFrame.skill_signals?.entry ?? {};
  for (const [skillId, signal] of Object.entries(entries)) {
    const confidence = signalConfidence(signal);
    if (!signalDetected(signal) || !isCandidateConfidenceUsable(confidence)) {
      continue;
    }
    const skillIsOperation = OPERATION_LABELS[skillId] !== undefined;
    addCandidate(byId, {
      id: skillId,
      label: skillIsOperation ? operationLabel(skillId) : skillLabel(skillId),
      operation_type: skillIsOperation ? skillId : undefined,
      evidence: ["turn_frame.skill_signals.entry"],
      source: "skill_signal",
      confidence_band: confidence,
    });
  }

  const opportunity = turnFrame.tool_skill_opportunity;
  if (
    opportunity?.type !== "none" &&
    opportunity.operation_type &&
    (opportunity.should_offer ||
      opportunity.confidence_band === "medium" ||
      opportunity.confidence_band === "high")
  ) {
    addCandidate(byId, {
      id: opportunity.operation_type,
      label: operationLabel(opportunity.operation_type),
      operation_type: opportunity.operation_type,
      surface_id: opportunity.surface_id ?? null,
      evidence: ["turn_frame.tool_skill_opportunity"],
      source: "opportunity",
      confidence_band: opportunity.confidence_band,
    });
  }

  return {
    candidates: [...byId.values()],
    safetyRiskBand: turnFrame.safety.risk_band,
  };
}

export function buildClarificationCandidatesFromTurnFrame(
  turnFrame: TurnFrame | null | undefined,
): ClarificationCandidateBuildResult {
  const collected = collectCandidatesFromTurnFrame(turnFrame);
  if (!collected) return null;
  const candidates = collected.candidates;
  if (candidates.length < 2) return null;

  if (!shouldClarifyCandidates(candidates)) return null;

  return {
    ambiguity_kind: inferAmbiguityKind(candidates),
    candidates,
    known_context: {
      candidate_sources: candidates.map((candidate) => ({
        id: candidate.id,
        source: (candidate as CandidatePatch).source,
        confidence_band: (candidate as CandidatePatch).confidence_band ?? null,
      })),
      safety_risk_band: collected.safetyRiskBand,
    },
  };
}

export function buildActiveSkillClarificationCandidatesFromTurnFrame(args: {
  turnFrame: TurnFrame | null | undefined;
  activeSkillState: unknown;
  userMessage?: string | null;
}): ActiveSkillClarificationCandidateBuildResult {
  const owner = activeSkillId(args.activeSkillState);
  if (!owner) return null;
  const allowed = ACTIVE_SKILL_ALLOWED_CANDIDATES[owner];
  if (!allowed) return null;

  const collected = collectCandidatesFromTurnFrame(args.turnFrame);
  if (!collected) return null;

  const byId = new Map<string, CandidatePatch>();
  const activeCandidate = candidateForActiveSkill(owner);
  if (activeCandidate) addCandidate(byId, activeCandidate);
  addActiveSkillMessageHintCandidates({
    byId,
    allowed,
    userMessage: args.userMessage,
  });

  for (const candidate of collected.candidates) {
    if (!allowed.has(candidate.id)) continue;
    addCandidate(byId, candidate);
  }

  const candidates = [...byId.values()];
  if (candidates.length < 2) return null;
  if (!hasCandidate(candidates, owner)) return null;

  return {
    owner,
    ambiguity_kind: inferAmbiguityKind(candidates),
    candidates,
    known_context: {
      active_skill_id: owner,
      candidate_sources: candidates.map((candidate) => ({
        id: candidate.id,
        source: (candidate as CandidatePatch).source,
        confidence_band: (candidate as CandidatePatch).confidence_band ?? null,
      })),
      safety_risk_band: collected.safetyRiskBand,
    },
  };
}
