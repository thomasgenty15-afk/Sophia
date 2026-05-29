import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  TrackProgressIntent,
  TrackProgressRequestedEffect,
  TrackProgressStatus,
} from "./contract.ts";

export type TrackProgressIntakeResult = {
  detected: boolean;
  intent: TrackProgressIntent;
  progress_status: TrackProgressStatus | null;
  target_item_id: string | null;
  target_title: string | null;
  value: number | null;
  date_hint: string | null;
  confidence: "high" | "medium" | "low";
  reason_code: string;
  evidence: string[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function trackEffect(turnFrame: TurnFrame) {
  return turnFrame.direct_effects.find((effect) =>
    effect.effect_type === "track_progress_plan_item"
  ) ?? null;
}

function payloadFromTurnFrame(turnFrame: TurnFrame): Record<string, unknown> {
  const payload = trackEffect(turnFrame)?.payload_hint ?? {};
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function validStatus(value: unknown): TrackProgressStatus | null {
  return value === "completed" || value === "missed" || value === "partial"
    ? value
    : null;
}

function intentForStatus(status: TrackProgressStatus): TrackProgressIntent {
  if (status === "missed") return "log_missed";
  if (status === "partial") return "log_partial";
  return "log_completed";
}

function valueForStatus(status: TrackProgressStatus, raw: unknown): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  if (status === "missed") return 0;
  if (status === "partial") return 0.5;
  return 1;
}

// TRANSITIONAL fallback. Prefer dispatcher `status_hint`; this only completes
// an otherwise explicit, gated direct-effect payload and is covered by anti-FP
// tests.
function inferStatusFallback(message: string): TrackProgressStatus | null {
  const text = normalizeText(message);
  if (/\bmoitie\b|\bpartiel|\bcommence mais pas termine\b/.test(text)) {
    return "partial";
  }
  if (/\brate\b|\bratee\b|\brater\b|\bpas fait\b|\bechoue\b/.test(text)) {
    return "missed";
  }
  if (/\bj ai fait\b|\btermine\b|\bvalide\b|\bfini\b/.test(text)) {
    return "completed";
  }
  return null;
}

export function isTrackProgressFutureIntent(message: string): boolean {
  const text = normalizeText(message);
  return /\bje vais\b|\bje compte\b|\bje ferai\b/.test(text);
}

export function isTrackProgressStatusQuestion(
  message: string,
  turnFrame: TurnFrame,
): boolean {
  const payload = payloadFromTurnFrame(turnFrame);
  if (payload.intent_hint === "status_question") return true;

  const text = normalizeText(message);
  if (!text) return false;
  if (/\bj ai\b/.test(text)) return false;
  return /\b(est ce que|as tu|tu as|deja|statut|status|recap|resume|confirme)\b/
    .test(text) &&
    /\b(note|notee|enregistre|enregistree|marque|marquee|logge|loggee|fait|rate|partiel|progres)\b/
      .test(text);
}

export function runTrackProgressIntake(args: {
  turn_frame: TurnFrame;
  message: string;
}): TrackProgressIntakeResult {
  const effect = trackEffect(args.turn_frame);
  if (!effect) {
    return {
      detected: false,
      intent: "ignore",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      confidence: "low",
      reason_code: "no_track_progress_direct_effect",
      evidence: [],
    };
  }

  if (isTrackProgressStatusQuestion(args.message, args.turn_frame)) {
    return {
      detected: true,
      intent: "status_question",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      confidence: "high",
      reason_code: "status_question",
      evidence: [args.message],
    };
  }

  if (isTrackProgressFutureIntent(args.message)) {
    return {
      detected: true,
      intent: "future_intent",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      confidence: "high",
      reason_code: "future_intent",
      evidence: [args.message],
    };
  }

  const payload = payloadFromTurnFrame(args.turn_frame);
  const status = validStatus(payload.status_hint) ??
    inferStatusFallback(args.message);
  const targetItemId = typeof payload.target_item_id === "string"
    ? payload.target_item_id.trim()
    : "";
  const targetTitle = typeof payload.target_title === "string"
    ? payload.target_title.trim()
    : "";
  const dateHint = typeof payload.date_hint === "string"
    ? payload.date_hint
    : null;

  if (!status) {
    return {
      detected: true,
      intent: "clarify",
      progress_status: null,
      target_item_id: targetItemId || null,
      target_title: targetTitle || null,
      value: null,
      date_hint: dateHint,
      confidence: "low",
      reason_code: "status_missing",
      evidence: [args.message],
    };
  }

  return {
    detected: true,
    intent: intentForStatus(status),
    progress_status: status,
    target_item_id: targetItemId || null,
    target_title: targetTitle || null,
    value: valueForStatus(status, payload.value_hint),
    date_hint: dateHint,
    confidence: payload.status_hint === status ? "high" : "medium",
    reason_code: payload.status_hint === status
      ? "dispatcher_status_hint"
      : "legacy_status_fallback",
    evidence: [args.message],
  };
}

export function requestedEffectFromIntake(args: {
  intake: TrackProgressIntakeResult;
  target_title: string;
  source_message_id: string;
}): TrackProgressRequestedEffect | null {
  if (
    !args.intake.target_item_id ||
    !args.intake.progress_status ||
    !Number.isFinite(args.intake.value)
  ) return null;

  return {
    type: "track_progress_plan_item",
    target_item_id: args.intake.target_item_id,
    target_title: args.target_title,
    progress_status: args.intake.progress_status,
    value: Number(args.intake.value),
    date_hint: args.intake.date_hint,
    source_message_id: args.source_message_id,
  };
}
