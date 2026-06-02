import type { AttackCardDraftV1 } from "./generator.ts";
import type { AttackCardToolSkillState } from "./workflow.ts";

export type PrepareAttackCardUserIntent =
  | "draft_only"
  | "create"
  | "update"
  | "cancel"
  | "reject"
  | "revise"
  | "explain"
  | "topic_change"
  | "status_question"
  | "clarify"
  | "unknown";

export type AttackCardHandoffStatus =
  | "collecting"
  | "clarifying"
  | "handoff_ready"
  | "handoff_delivered"
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "cancelled"
  | "topic_change"
  | "blocked";

export type AttackCardPlatformFlowKind =
  | "free_attack_card"
  | "plan_action_cards"
  | "adjust_existing_attack_card";

export type AttackCardTechniqueKey =
  | "texte_recadrage"
  | "mantra_force"
  | "ancre_visuelle"
  | "visualisation_matinale"
  | "preparer_terrain"
  | "pre_engagement";

export type AttackCardPlatformInput = {
  question: string;
  suggested_answer: string;
};

export type AttackCardKeywordTriggerDraft = {
  activation_keyword: string;
  risk_situation: string;
  strength_anchor: string;
  first_response_intent: string;
  assistant_prompt: string;
};

export type AttackCardExpectedGeneratedResult = {
  output_title: string;
  generated_asset: string;
  supporting_points: string[];
  mode_emploi: string;
  keyword_trigger?: AttackCardKeywordTriggerDraft | null;
};

export type AttackCardPlatformHandoff = {
  flow_kind: AttackCardPlatformFlowKind;
  surface_label: string;
  destination: string;
  steps: string[];
  technique_key?: AttackCardTechniqueKey | null;
  technique_label?: string | null;
  inputs: AttackCardPlatformInput[];
  expected_result?: AttackCardExpectedGeneratedResult | null;
  plan_action_note?: string | null;
};

export type AttackCardHandoffDraft = {
  operation_type: "prepare_attack_card";
  mode: "platform_handoff";
  no_chat_mutation: true;
  executable_from_chat: false;
  target_summary: string;
  blocker_summary: string;
  recommendation: {
    technique_label: string;
    why_this_technique: string;
    card_draft_summary: string;
    preserve: string[];
    avoid: string[];
    platform_destination: string;
    platform_steps: string[];
  };
  platform_handoff?: AttackCardPlatformHandoff;
  missing_decisions: string[];
};

export type PrepareAttackCardConstraint = {
  kind:
    | "draft_only"
    | "no_create"
    | "max_proposals"
    | "single_proposal"
    | "no_extra_options"
    | "style";
  value?: unknown;
  evidence: string[];
};

export type PrepareAttackCardEffect = {
  type: "create_attack_card";
  operation_id: string;
  target: {
    kind: "plan_item" | "personal_action";
    plan_item_id?: string | null;
    title: string;
  };
  draft: AttackCardDraftV1;
};

export type PrepareAttackCardCommittedEffect = PrepareAttackCardEffect & {
  attack_card_id: string;
};

export type CardTechnicalBlockReason =
  | "ai_unavailable"
  | "structured_intake_failed"
  | "draft_generation_failed"
  | "missing_structured_intake_runner"
  | "invalid_ai_output";

export type PrepareAttackCardSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "draft_ready"
    | "handoff_ready"
    | "handoff_delivered"
    | "revise_handoff"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "revised"
    | "explained"
    | "topic_change"
    | "executed"
    | "blocked"
    | "technical_blocked"
    | "failed";
  user_intent: PrepareAttackCardUserIntent;
  updated_state?: AttackCardToolSkillState | null;
  reply: string | null;
  requested_effects: PrepareAttackCardEffect[];
  allowed_effects: PrepareAttackCardEffect[];
  committed_effects: PrepareAttackCardCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  pending_confirmation?: Record<string, unknown> | null;
  reason_code?: CardTechnicalBlockReason;
  should_preserve_pending?: boolean;
  retryable?: boolean;
  debug: {
    reason_code: string;
    evidence: string[];
  };
};

const USER_INTENTS: PrepareAttackCardUserIntent[] = [
  "draft_only",
  "create",
  "update",
  "cancel",
  "reject",
  "revise",
  "explain",
  "topic_change",
  "status_question",
  "clarify",
  "unknown",
];

const CONSTRAINT_KINDS: PrepareAttackCardConstraint["kind"][] = [
  "draft_only",
  "no_create",
  "max_proposals",
  "single_proposal",
  "no_extra_options",
  "style",
];

export function normalizePrepareAttackCardUserIntent(
  value: unknown,
): PrepareAttackCardUserIntent {
  const raw = String(value ?? "").trim();
  return USER_INTENTS.includes(raw as PrepareAttackCardUserIntent)
    ? raw as PrepareAttackCardUserIntent
    : "unknown";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

export function normalizePrepareAttackCardConstraint(
  value: unknown,
): PrepareAttackCardConstraint | null {
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const kind = raw === "draft_only" || raw === "no_create"
      ? raw
      : raw === "single_proposal" || raw === "one_proposal"
      ? "single_proposal"
      : raw === "no_extra_options"
      ? "no_extra_options"
      : raw === "max_proposals"
      ? "max_proposals"
      : "style";
    return { kind, value: raw, evidence: [raw] };
  }
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!root) return null;
  const rawKind = String(root.kind ?? "").trim();
  const kind = CONSTRAINT_KINDS.includes(
      rawKind as PrepareAttackCardConstraint["kind"],
    )
    ? rawKind as PrepareAttackCardConstraint["kind"]
    : null;
  if (!kind) return null;
  return {
    kind,
    ...(root.value !== undefined ? { value: root.value } : {}),
    evidence: stringArray(root.evidence),
  };
}

export function normalizePrepareAttackCardConstraints(
  value: unknown,
): PrepareAttackCardConstraint[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const constraint = normalizePrepareAttackCardConstraint(entry);
      return constraint ? [constraint] : [];
    })
    : [];
}

export function hasPrepareAttackCardNoCreateConstraint(
  constraints: PrepareAttackCardConstraint[] | undefined,
): boolean {
  return (constraints ?? []).some((constraint) =>
    constraint.kind === "draft_only" || constraint.kind === "no_create"
  );
}

function intentFromDraftReviewDecision(
  decision: string | undefined,
  fallback: PrepareAttackCardUserIntent,
): PrepareAttackCardUserIntent {
  if (decision === "approve") return "create";
  if (decision === "reject") return "reject";
  if (decision === "revise") return "revise";
  if (decision === "explain") return "explain";
  if (decision === "topic_change") return "topic_change";
  if (decision === "unclear") {
    return fallback === "unknown" ? "clarify" : fallback;
  }
  return fallback;
}

function executableAttackCardTarget(value: unknown):
  | PrepareAttackCardEffect[
    "target"
  ]
  | null {
  const target = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!target) return null;
  const kind = target.kind === "personal_action"
    ? "personal_action"
    : "plan_item";
  const title = String(target.title ?? "").trim();
  const planItemId = target.plan_item_id == null
    ? null
    : String(target.plan_item_id).trim() || null;
  if (!title) return null;
  if (kind === "plan_item" && !planItemId) return null;
  return { kind, title, plan_item_id: planItemId };
}

function createEffectFromPending(
  pendingRaw: any,
): PrepareAttackCardEffect | null {
  const operationId = String(pendingRaw?.operation_id ?? "").trim();
  const draft = pendingRaw?.draft as AttackCardDraftV1 | undefined;
  const target = executableAttackCardTarget(pendingRaw?.target);
  if (!operationId || !draft || !target) return null;
  return {
    type: "create_attack_card",
    operation_id: operationId,
    target,
    draft,
  };
}

export function decidePrepareAttackCardNextStep(input: {
  pendingRaw?: any;
  user_intent?: PrepareAttackCardUserIntent;
  constraints?: PrepareAttackCardConstraint[];
  draft_review_decision?: {
    decision?: string;
    evidence?: string[];
  } | null;
}): PrepareAttackCardSkillResult {
  const constraints = input.constraints ?? [];
  const userIntent = intentFromDraftReviewDecision(
    input.draft_review_decision?.decision,
    input.user_intent ?? "unknown",
  );
  const evidence = [
    ...(input.draft_review_decision?.evidence ?? []),
    ...constraints.flatMap((constraint) => constraint.evidence ?? []),
  ];
  const requestedEffect = createEffectFromPending(input.pendingRaw);
  const noCreate = hasPrepareAttackCardNoCreateConstraint(constraints) ||
    userIntent === "draft_only";
  const base = {
    handled: true,
    user_intent: userIntent,
    updated_state: null,
    reply: null,
    requested_effects: requestedEffect ? [requestedEffect] : [],
    allowed_effects: [] as PrepareAttackCardEffect[],
    committed_effects: [] as PrepareAttackCardCommittedEffect[],
    blocked_effects: [] as Array<{ type: string; reason_code: string }>,
    pending_confirmation: input.pendingRaw ?? null,
    debug: { reason_code: "pending_review", evidence },
  };

  if (noCreate) {
    return {
      ...base,
      status: "draft_ready",
      requested_effects: requestedEffect ? [requestedEffect] : [],
      blocked_effects: requestedEffect
        ? [{ type: "create_attack_card", reason_code: "no_create_constraint" }]
        : [],
      debug: { reason_code: "draft_only_no_create", evidence },
    };
  }
  if (userIntent === "cancel" || userIntent === "reject") {
    return {
      ...base,
      status: "cancelled",
      requested_effects: [],
      debug: { reason_code: `user_${userIntent}`, evidence },
    };
  }
  if (userIntent === "explain") {
    return {
      ...base,
      status: "explained",
      requested_effects: [],
      debug: { reason_code: "user_requested_explanation", evidence },
    };
  }
  if (userIntent === "topic_change") {
    return {
      ...base,
      handled: false,
      status: "topic_change",
      requested_effects: [],
      debug: { reason_code: "user_topic_change", evidence },
    };
  }
  if (userIntent === "status_question") {
    return {
      ...base,
      handled: false,
      status: "blocked",
      requested_effects: [],
      debug: { reason_code: "user_status_question", evidence },
    };
  }
  if (userIntent === "create") {
    return {
      ...base,
      status: "apply_attempt",
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [{
        type: "create_attack_card",
        reason_code: "chat_creation_disabled_platform_handoff",
      }],
      debug: { reason_code: "apply_attempt_no_chat_mutation", evidence },
    };
  }
  return {
    ...base,
    status: userIntent === "revise" ? "revised" : "blocked",
    requested_effects: [],
    debug: { reason_code: `user_${userIntent}`, evidence },
  };
}
