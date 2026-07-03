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
  // Correction explicite d'un report deja fait (contrat dispatcher 3h):
  // seule voie qui autorise a re-ecrire un outcome oppose le meme jour.
  is_correction: boolean;
  confidence: "high" | "medium" | "low";
  reason_code: string;
  evidence: string[];
};

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
  // Frontiere de contrat avec le dispatcher: l'enum canonique est
  // completed|partial|missed, mais des versions du prompt ont enseigne
  // "done" — on normalise l'alias sur ce slot structure plutot que de
  // bloquer un effet explicite avec status_missing.
  if (value === "completed" || value === "done") return "completed";
  if (value === "missed") return "missed";
  if (value === "partial") return "partial";
  return null;
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

export function isTrackProgressFutureIntent(message: string): boolean {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  if (containsAnyPhrase(normalized, completedProgressPhrases)) return false;
  return containsAnyPhrase(normalized, futureProgressPhrases);
}

function normalizeIntentText(value: string): string {
  const stripped = value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll("\u0300", "")
    .replaceAll("\u0301", "")
    .replaceAll("\u0302", "")
    .replaceAll("\u0303", "")
    .replaceAll("\u0308", "")
    .replaceAll("\u0327", "");
  let out = "";
  let previousWasSpace = true;
  for (const char of stripped) {
    const isAsciiLetterOrDigit =
      (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAsciiLetterOrDigit) {
      out += char;
      previousWasSpace = false;
    } else if (!previousWasSpace) {
      out += " ";
      previousWasSpace = true;
    }
  }
  return ` ${out.trim()} `;
}

function containsAnyPhrase(message: string, phrases: string[]): boolean {
  return phrases.some((phrase) => message.includes(` ${phrase} `));
}

const completedProgressPhrases = [
  "c est fait",
  "cest fait",
  "j ai fait",
  "je l ai fait",
  "je lai fait",
  "j ai termine",
  "j ai fini",
  "je viens de faire",
  "je viens d avancer",
  "j ai avance",
  "j ai marche",
  "j ai reussi",
];

const futureProgressPhrases = [
  "je vais faire",
  "je vais le faire",
  "je vais la faire",
  "je vais m y mettre",
  "je vais essayer",
  "je vais tenter",
  "j vais faire",
  "jvais faire",
  "je compte faire",
  "je prevois de faire",
  "je prevois faire",
  "je pense faire",
  "je dois faire",
  "je devrais faire",
  "je le ferai",
  "je la ferai",
  "je ferai",
  "je vais pas faire",
  "je ne vais pas faire",
  "je ne vais pas le faire",
  "je ne vais pas la faire",
];

const statusQuestionPhrases = [
  "est ce que tu as note",
  "est ce que tu l as note",
  "est ce que tu as enregistre",
  "est ce que tu l as enregistre",
  "est ce que c est note",
  "est ce que c est enregistre",
  "tu as note",
  "tu l as note",
  "tu as enregistre",
  "tu l as enregistre",
  "c est note",
  "c est enregistre",
  "tu as pris en compte",
  "tu l as pris en compte",
];

export function isTrackProgressStatusQuestion(
  message: string,
  turnFrame: TurnFrame,
): boolean {
  const payload = payloadFromTurnFrame(turnFrame);
  if (payload.intent_hint === "status_question") return true;
  return containsAnyPhrase(
    normalizeIntentText(message),
    statusQuestionPhrases,
  );
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
      is_correction: false,
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
      is_correction: false,
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
      is_correction: false,
      confidence: "high",
      reason_code: "future_intent",
      evidence: [args.message],
    };
  }

  const payload = payloadFromTurnFrame(args.turn_frame);
  const status = validStatus(payload.status_hint);
  // Le champ canonique est target_item_id; plan_item_id est tolere car
  // c'est le nom du champ dans active_action_candidates_for_direct_effects
  // que le dispatcher recopie.
  const rawItemId = typeof payload.target_item_id === "string"
    ? payload.target_item_id
    : typeof payload.plan_item_id === "string"
    ? payload.plan_item_id
    : "";
  const targetItemId = rawItemId.trim();
  const targetTitle = typeof payload.target_title === "string"
    ? payload.target_title.trim()
    : "";
  const dateHint = typeof payload.date_hint === "string"
    ? payload.date_hint
    : null;
  const isCorrection = payload.correction === true;

  if (!status) {
    return {
      detected: true,
      intent: "clarify",
      progress_status: null,
      target_item_id: targetItemId || null,
      target_title: targetTitle || null,
      value: null,
      date_hint: dateHint,
      is_correction: isCorrection,
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
    is_correction: isCorrection,
    confidence: "high",
    reason_code: "dispatcher_status_hint",
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
