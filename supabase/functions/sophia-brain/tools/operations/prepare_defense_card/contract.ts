import type { DefenseCardDraftV1 } from "./generator.ts";
import type { DefenseCardToolSkillState } from "./workflow.ts";

export type PrepareDefenseCardUserIntent =
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

export type PrepareDefenseCardConstraint = {
  kind:
    | "draft_only"
    | "no_create"
    | "keep_short"
    | "single_card"
    | "protect_current_action"
    | "no_attack_card";
  value?: unknown;
  evidence: string[];
};

export type PrepareDefenseCardEffect = {
  type: "create_defense_card";
  operation_id: string;
  draft: DefenseCardDraftV1;
};

export type PrepareDefenseCardCommittedEffect = {
  type: "create_defense_card";
  operation_id: string;
  defense_card_id: string;
};

export type CardTechnicalBlockReason =
  | "ai_unavailable"
  | "structured_intake_failed"
  | "draft_generation_failed"
  | "missing_structured_intake_runner"
  | "invalid_ai_output";

export type PrepareDefenseCardSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "draft_ready"
    | "pending_confirmation"
    | "cancelled"
    | "revised"
    | "explained"
    | "topic_change"
    | "handoff_to_attack_card"
    | "executed"
    | "blocked"
    | "technical_blocked"
    | "failed";
  user_intent: PrepareDefenseCardUserIntent;
  updated_state?: DefenseCardToolSkillState | null;
  reply: string | null;
  requested_effects: PrepareDefenseCardEffect[];
  allowed_effects: PrepareDefenseCardEffect[];
  committed_effects: PrepareDefenseCardCommittedEffect[];
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

const USER_INTENTS: PrepareDefenseCardUserIntent[] = [
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

const CONSTRAINT_KINDS: PrepareDefenseCardConstraint["kind"][] = [
  "draft_only",
  "no_create",
  "keep_short",
  "single_card",
  "protect_current_action",
  "no_attack_card",
];

export function normalizePrepareDefenseCardUserIntent(
  value: unknown,
): PrepareDefenseCardUserIntent {
  const raw = String(value ?? "").trim();
  return USER_INTENTS.includes(raw as PrepareDefenseCardUserIntent)
    ? raw as PrepareDefenseCardUserIntent
    : "unknown";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

export function normalizePrepareDefenseCardConstraint(
  value: unknown,
): PrepareDefenseCardConstraint | null {
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const kind = raw === "draft_only" || raw === "no_create" ||
        raw === "keep_short" || raw === "single_card" ||
        raw === "protect_current_action" || raw === "no_attack_card"
      ? raw
      : null;
    if (!kind) return null;
    return { kind, value: raw, evidence: [raw] };
  }
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!root) return null;
  const rawKind = String(root.kind ?? "").trim();
  const kind = CONSTRAINT_KINDS.includes(
      rawKind as PrepareDefenseCardConstraint["kind"],
    )
    ? rawKind as PrepareDefenseCardConstraint["kind"]
    : null;
  if (!kind) return null;
  return {
    kind,
    ...(root.value !== undefined ? { value: root.value } : {}),
    evidence: stringArray(root.evidence),
  };
}

export function normalizePrepareDefenseCardConstraints(
  value: unknown,
): PrepareDefenseCardConstraint[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const constraint = normalizePrepareDefenseCardConstraint(entry);
      return constraint ? [constraint] : [];
    })
    : [];
}

export function hasPrepareDefenseCardNoCreateConstraint(
  constraints: PrepareDefenseCardConstraint[] | undefined,
): boolean {
  return (constraints ?? []).some((constraint) =>
    constraint.kind === "draft_only" || constraint.kind === "no_create"
  );
}
