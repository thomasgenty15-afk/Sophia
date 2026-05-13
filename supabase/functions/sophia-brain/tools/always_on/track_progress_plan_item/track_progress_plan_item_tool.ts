import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  type DirectEffectGateInput,
  runDirectEffectGate,
} from "../../../routers/direct_effect_gate.ts";

export type TrackProgressStatus = "completed" | "missed" | "partial";

export type TrackProgressPlanItemOutcome =
  | { detected: false }
  | {
    detected: true;
    status: "needs_clarify";
    reason:
      | "target_ambiguous"
      | "target_missing"
      | "status_missing"
      | "intent_implied_weak"
      | "ambiguity_present";
    message: string;
  }
  | {
    detected: true;
    status: "blocked";
    reason:
      | "safety_high"
      | "pending_confirmation_active"
      | "duplicate_source_message"
      | "duplicate_db"
      | "future_intent"
      | "target_not_in_plan";
    message: string;
  }
  | {
    detected: true;
    status: "logged";
    message: string;
    target_item_id: string;
    target_title: string;
    progress_status: TrackProgressStatus;
    value: number;
    logged_progress_id: string;
  };

export type TrackProgressWrite = (input: {
  user_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: TrackProgressStatus;
  value: number;
  source_message_id: string;
  date_hint?: string | null;
  idempotency_key: string;
}) => Promise<{ logged_progress_id: string }>;

function normalize(text: string): string {
  return String(text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function inferStatus(text: string): TrackProgressStatus | null {
  const normalized = normalize(text);
  if (/\bmoitie\b|\bpartiel|\bcommence mais pas termine\b/.test(normalized)) {
    return "partial";
  }
  if (/\brate\b|\bratee\b|\brater\b|\bpas fait\b|\bechoue\b/.test(normalized)) {
    return "missed";
  }
  if (/\bj[' ]?ai fait\b|\btermine\b|\bvalide\b|\bfini\b/.test(normalized)) {
    return "completed";
  }
  return null;
}

function inferValue(status: TrackProgressStatus, raw: unknown): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  if (status === "missed") return 0;
  if (status === "partial") return 0.5;
  return 1;
}

function planItems(
  planSnapshot: unknown,
): Array<{ id: string; title: string }> {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? ""),
    }))
    .filter((item: { id: string; title: string }) => item.id && item.title);
}

export async function runTrackProgressPlanItemV2(params: {
  turn_frame: TurnFrame;
  message: string;
  plan_snapshot: unknown;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressPlanItemOutcome> {
  const effect = params.turn_frame.direct_effects.find((candidate) =>
    candidate.effect_type === "track_progress_plan_item"
  );
  if (!effect) return { detected: false };

  const text = normalize(params.message);
  if (/\bje vais\b|\bje compte\b|\bje ferai\b/.test(text)) {
    return {
      detected: true,
      status: "blocked",
      reason: "future_intent",
      message: "Intention future: no progress write.",
    };
  }

  const gate = await runDirectEffectGate({
    effect_type: "track_progress_plan_item",
    turn_frame: params.turn_frame,
    pending_tool_skill_confirmation: params.pending_tool_skill_confirmation,
    recent_writes_idempotency: params.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: params.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    return {
      detected: true,
      status: "blocked",
      reason: gate.reason_code,
      message: gate.message,
    };
  }
  if (gate.decision === "needs_clarify") {
    return {
      detected: true,
      status: "needs_clarify",
      reason: gate.reason_code === "target_ambiguous"
        ? "target_ambiguous"
        : gate.reason_code === "ambiguity_present"
        ? "ambiguity_present"
        : gate.reason_code === "intent_implied_weak"
        ? "intent_implied_weak"
        : "target_missing",
      message: gate.suggested_clarification,
    };
  }

  const payload = gate.effect_payload ?? {};
  const targetItemId = String(payload.target_item_id ?? "");
  const status = (
    typeof payload.status_hint === "string"
      ? payload.status_hint
      : inferStatus(params.message)
  ) as TrackProgressStatus | null;
  if (!status || !["completed", "missed", "partial"].includes(status)) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "status_missing",
      message: "Le statut du progres n'est pas assez clair.",
    };
  }
  const item = planItems(params.plan_snapshot).find((candidate) =>
    candidate.id === targetItemId
  );
  if (!item) {
    return {
      detected: true,
      status: "blocked",
      reason: "target_not_in_plan",
      message: "Target item is not present in plan_snapshot.",
    };
  }

  const value = inferValue(status, payload.value_hint);
  const written = await params.write_progress({
    user_id: params.turn_frame.user_id,
    target_item_id: item.id,
    target_title: item.title,
    progress_status: status,
    value,
    source_message_id: params.turn_frame.source_message_id,
    date_hint: typeof payload.date_hint === "string" ? payload.date_hint : null,
    idempotency_key: gate.idempotency_key,
  });
  return {
    detected: true,
    status: "logged",
    message: status === "missed"
      ? `Note pour ${item.title}: rate.`
      : status === "partial"
      ? `Note pour ${item.title}: partiel.`
      : `Note pour ${item.title}: fait.`,
    target_item_id: item.id,
    target_title: item.title,
    progress_status: status,
    value,
    logged_progress_id: written.logged_progress_id,
  };
}
