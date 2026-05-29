import type {
  AdjustPlanChangeKind,
  AdjustPlanDecision,
  AdjustPlanDecisionDraft,
  AdjustPlanIntent,
  AdjustPlanScopeKind,
} from "./contract.ts";

type ParseAdjustPlanTurnInput = {
  user_message: string;
  previous_state?: unknown;
  plan_snapshot?: unknown;
  weekly_context?: unknown;
  pending_draft?: unknown;
  confirmation_context?: unknown;
  structured_decision?: unknown;
};

const INTENTS: AdjustPlanIntent[] = [
  "start_adjustment",
  "draft_only",
  "revise_draft",
  "confirm_draft",
  "reject_draft",
  "explain_draft",
  "change_scope",
  "weekly_bridge",
  "status_or_meta",
  "off_topic",
  "unclear",
];

const SCOPE_KINDS: AdjustPlanScopeKind[] = [
  "specific_plan_item",
  "action_cluster",
  "current_week",
  "current_level",
  "whole_plan",
  "unknown",
];

const CHANGE_KINDS: AdjustPlanChangeKind[] = [
  "reduce",
  "increase",
  "pause",
  "resume",
  "replace",
  "split",
  "reschedule",
  "copy_forward",
  "bridge_action",
  "clarify",
  "unknown",
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function intent(value: unknown): AdjustPlanIntent {
  const raw = String(value ?? "").trim();
  return INTENTS.includes(raw as AdjustPlanIntent)
    ? raw as AdjustPlanIntent
    : "unclear";
}

function scopeKind(value: unknown): AdjustPlanScopeKind {
  const raw = String(value ?? "").trim();
  return SCOPE_KINDS.includes(raw as AdjustPlanScopeKind)
    ? raw as AdjustPlanScopeKind
    : "unknown";
}

function changeKind(value: unknown): AdjustPlanChangeKind {
  const raw = String(value ?? "").trim();
  return CHANGE_KINDS.includes(raw as AdjustPlanChangeKind)
    ? raw as AdjustPlanChangeKind
    : "unknown";
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function patch(value: unknown): Record<string, unknown> | null {
  return record(value);
}

export function technicalAdjustPlanIntakeFailure(args: {
  operation_id?: string | null;
  reason?: string | null;
} = {}): AdjustPlanDecisionDraft {
  return {
    skill_id: "adjust_plan_item",
    operation_id: args.operation_id ?? crypto.randomUUID(),
    intent: "unclear",
    status: "blocked",
    scope: {
      kind: "unknown",
      plan_item_ids: [],
      target_hint: null,
      confidence: "low",
      missing_slots: ["scope"],
    },
    change: {
      kind: "unknown",
      user_problem: null,
      requested_change: null,
      exact_constraints: [],
      missing_slots: ["requested_change"],
    },
    draft: {
      available: false,
      requires_confirmation: true,
      summary: null,
      patch: null,
    },
    constraints: [
      "requires_confirmation",
      "do_not_apply",
      "preserve_user_exact_constraints",
      "no_done_language_without_commit",
    ],
    effect_plan: {
      allowed: false,
      effects: [],
      blocked_reason: args.reason ?? "structured_intake_unavailable",
    },
    reply: null,
    state_patch: {
      technical_blocked: true,
      reason_code: args.reason ?? "structured_intake_unavailable",
    },
  };
}

export function parseAdjustPlanTurn(
  input: ParseAdjustPlanTurnInput,
): AdjustPlanDecisionDraft {
  const root = record(input.structured_decision);
  if (!root) {
    return technicalAdjustPlanIntakeFailure({
      reason: "structured_intake_missing_ai_json",
    });
  }

  const scope = record(root.scope);
  const change = record(root.change);
  const draft = record(root.draft);
  if (!scope || !change || !draft) {
    return technicalAdjustPlanIntakeFailure({
      operation_id: optionalString(root.operation_id),
      reason: "structured_intake_contract_missing",
    });
  }

  const operationId = optionalString(root.operation_id) ?? crypto.randomUUID();
  const constraints = stringList(root.constraints).filter((constraint) =>
    [
      "requires_confirmation",
      "draft_only",
      "do_not_apply",
      "do_not_modify_level_objective",
      "do_not_touch_completed_items",
      "do_not_touch_support_items",
      "preserve_user_exact_constraints",
      "no_done_language_without_commit",
    ].includes(constraint)
  ) as AdjustPlanDecision["constraints"];

  return {
    skill_id: "adjust_plan_item",
    operation_id: operationId,
    intent: intent(root.intent),
    status: root.status === "draft_ready" ||
        root.status === "pending_confirmation" ||
        root.status === "revising" ||
        root.status === "rejected" ||
        root.status === "applied" ||
        root.status === "blocked" ||
        root.status === "off_topic"
      ? root.status
      : "collecting",
    scope: {
      kind: scopeKind(scope.kind),
      plan_item_ids: stringList(scope.plan_item_ids),
      target_hint: optionalString(scope.target_hint),
      confidence: confidence(scope.confidence),
      missing_slots: stringList(scope.missing_slots),
    },
    change: {
      kind: changeKind(change.kind),
      user_problem: optionalString(change.user_problem),
      requested_change: optionalString(change.requested_change),
      exact_constraints: stringList(change.exact_constraints),
      missing_slots: stringList(change.missing_slots),
    },
    draft: {
      available: draft.available === true,
      requires_confirmation: true,
      summary: optionalString(draft.summary),
      patch: patch(draft.patch),
    },
    constraints: [
      "requires_confirmation",
      "preserve_user_exact_constraints",
      "no_done_language_without_commit",
      ...constraints.filter((constraint) =>
        constraint !== "requires_confirmation"
      ),
    ],
    effect_plan: {
      allowed: false,
      effects: [],
      blocked_reason: "not_reduced_yet",
    },
    reply: optionalString(root.reply),
    state_patch: record(root.state_patch) ?? {},
  };
}
