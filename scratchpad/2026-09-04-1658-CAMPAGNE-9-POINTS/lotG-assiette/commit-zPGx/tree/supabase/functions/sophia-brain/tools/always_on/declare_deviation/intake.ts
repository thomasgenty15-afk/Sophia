/**
 * KEEL W4.3 — intake for `declare_deviation`.
 *
 * Same R7 posture as `log_protocol_event/intake.ts`: unknown tokens are named,
 * never coerced. Three fields are refused rather than guessed:
 *
 *  - `plan_version_id` — a deviation hangs off the PUBLISHED contract
 *    (NOT NULL FK). No published plan => no flex to spend. Supplied by the
 *    caller, not by the model.
 *  - `content_locale` — R2.
 *  - `local_date` — the deviated day. This one MAY come from the payload (the
 *    student is talking about Friday), but it must be an ISO date; a natural
 *    language hint is refused. Date resolution belongs to the runtime, which
 *    knows the timezone. Every night-time date bug in this repo
 *    (`date-anchoring-instability-rose-hard15`,
 *    `paul-untested16-durable-effect-reds`) came from resolving "tomorrow"
 *    inside a tool.
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { parseSlotKey, type SlotKey } from "../../../../_shared/keel/tokens.ts";
import {
  DEVIATION_DECLARED_VIA,
  DEVIATION_KINDS,
  type DeclareDeviationRequestedEffect,
  type DeviationDeclaredVia,
  type DeviationKind,
} from "./contract.ts";

export type DeclareDeviationIntakeResult =
  | { detected: false; reason_code: "no_effect_candidate" }
  | {
    detected: true;
    ok: false;
    reason_code:
      | "missing_time_context"
      | "missing_content_locale"
      | "missing_plan_version"
      | "missing_local_date"
      | "unknown_token";
    token_issue: string | null;
  }
  | {
    detected: true;
    ok: true;
    requested_effect: DeclareDeviationRequestedEffect;
  };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function effectFor(turnFrame: TurnFrame) {
  return turnFrame.direct_effects.find((candidate) =>
    candidate.effect_type === "declare_deviation"
  ) ?? null;
}

function payloadOf(turnFrame: TurnFrame): Record<string, unknown> {
  const raw = effectFor(turnFrame)?.payload_hint;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseKind(value: unknown): DeviationKind {
  const raw = optionalString(value);
  // 'other' is the honest default for a declared context we cannot classify:
  // the deviation is real even when its label is not. Refusing here would lose
  // a true fact over a taxonomy detail.
  if (raw === null) return "other";
  if ((DEVIATION_KINDS as readonly string[]).includes(raw)) {
    return raw as DeviationKind;
  }
  throw new Error(
    `Unknown planned_deviations.kind '${raw}' (expected one of: ${
      DEVIATION_KINDS.join(", ")
    })`,
  );
}

function parseDeclaredVia(
  value: unknown,
  fallback: DeviationDeclaredVia,
): DeviationDeclaredVia {
  const raw = optionalString(value);
  if (raw === null) return fallback;
  if ((DEVIATION_DECLARED_VIA as readonly string[]).includes(raw)) {
    return raw as DeviationDeclaredVia;
  }
  throw new Error(
    `Unknown planned_deviations.declared_via '${raw}' (expected one of: ${
      DEVIATION_DECLARED_VIA.join(", ")
    })`,
  );
}

function todayFrom(userLocalDatetime: string): string | null {
  const trimmed = userLocalDatetime.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  const head = trimmed.slice(0, 10);
  return ISO_DATE.test(head) ? head : null;
}

export function runDeclareDeviationIntake(input: {
  turn_frame: TurnFrame;
  /** Published `plan_versions.id` for this student; caller-resolved. */
  plan_version_id: string | null | undefined;
  content_locale: string | null | undefined;
  declared_via?: DeviationDeclaredVia;
}): DeclareDeviationIntakeResult {
  const effect = effectFor(input.turn_frame);
  if (!effect) return { detected: false, reason_code: "no_effect_candidate" };

  const timeContext = input.turn_frame.direct_effect_time_context;
  const today = timeContext
    ? todayFrom(timeContext.user_local_datetime ?? "")
    : null;
  if (!timeContext || !today || !timeContext.now_utc) {
    return {
      detected: true,
      ok: false,
      reason_code: "missing_time_context",
      token_issue: null,
    };
  }

  const planVersionId = optionalString(input.plan_version_id);
  if (!planVersionId) {
    return {
      detected: true,
      ok: false,
      reason_code: "missing_plan_version",
      token_issue: null,
    };
  }

  const contentLocale = optionalString(input.content_locale);
  if (!contentLocale) {
    return {
      detected: true,
      ok: false,
      reason_code: "missing_content_locale",
      token_issue: null,
    };
  }

  const payload = payloadOf(input.turn_frame);
  const rawDate = optionalString(payload.local_date);
  if (rawDate !== null && !ISO_DATE.test(rawDate)) {
    // A hint like "friday" is NOT resolved here (see the header). Named
    // refusal, so the runtime can resolve it and retry.
    return {
      detected: true,
      ok: false,
      reason_code: "missing_local_date",
      token_issue: `local_date '${rawDate}' is not an ISO date (YYYY-MM-DD)`,
    };
  }
  // Absent date => today. The student saying "I'm eating out tonight" is the
  // common case and today is not yet resolved, so it stays in-advance.
  const localDate = rawDate ?? today;

  let slotKey: SlotKey | null = null;
  let kind: DeviationKind;
  let declaredVia: DeviationDeclaredVia;
  try {
    const rawSlot = optionalString(payload.slot_key);
    slotKey = rawSlot === null ? null : parseSlotKey(rawSlot);
    kind = parseKind(payload.kind);
    declaredVia = parseDeclaredVia(
      payload.declared_via,
      input.declared_via ?? "chat",
    );
  } catch (error) {
    return {
      detected: true,
      ok: false,
      reason_code: "unknown_token",
      token_issue: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    detected: true,
    ok: true,
    requested_effect: {
      type: "declare_deviation",
      plan_version_id: planVersionId,
      local_date: localDate,
      slot_key: slotKey,
      kind,
      declared_at: timeContext.now_utc,
      declared_via: declaredVia,
      note: optionalString(payload.note),
      content_locale: contentLocale,
      // The flex allowance is the coach's budget. Spending a unit of it is a
      // decision of the evaluator/weekly review (W7), not of the chat turn:
      // the row is written with `consumed_flex=false` and the derived layer
      // decides. Zero incremental counters (CONTRACT).
      consumed_flex: false,
      coach_visible: true,
      today_local_date: today,
    },
  };
}
