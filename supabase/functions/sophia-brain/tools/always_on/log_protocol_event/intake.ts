/**
 * KEEL W4.3 — intake for `log_protocol_event`.
 *
 * Turns `turn_frame.direct_effects[].payload_hint` (LLM-authored, therefore
 * untrusted) into a typed requested effect, or into a NAMED refusal.
 *
 * R7 is the whole design here. The parsers in `_shared/keel/tokens.ts` throw on
 * an unknown token; this module catches the throw and returns
 * `unknown_token` + the parser's message. It never returns `undefined`, `[]`,
 * or a silent fallback — a slug the model invented (`epa_dha` on day one of
 * the plan import) must be visible at the boundary, not three layers later at
 * render time on data that looks valid.
 *
 * Time is NOT read from the clock here: `occurred_at` / `local_date` come from
 * `direct_effect_time_context`, which the runtime resolves in the student's
 * timezone. A tool that calls `new Date()` produces a different fact depending
 * on which server ran it, and the night-time date bugs this repo has already
 * paid for (`p3-safety-effects-deterministic-time`) all start there.
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  type FoodGroupRef,
  parseFoodGroupRef,
  parseSlotKey,
  parseSubstanceRef,
  parseUnit,
  type SlotKey,
  type SubstanceRef,
  type Unit,
} from "../../../../_shared/keel/tokens.ts";
import {
  MAX_PROTOCOL_EVENT_COMPONENTS,
  PROTOCOL_EVENT_SOURCES,
  protocolEventComponentKey,
  type LogProtocolEventRequestedEffect,
  type ProtocolEventSource,
} from "./contract.ts";

export type LogProtocolEventIntakeResult =
  | { detected: false; reason_code: "no_effect_candidate" }
  | {
    detected: true;
    ok: false;
    reason_code:
      | "missing_time_context"
      | "missing_content_locale"
      | "missing_source_message_id"
      | "unknown_token"
      | "unknown_commitment"
      | "too_many_components"
      | "empty_payload";
    token_issue: string | null;
  }
  | {
    detected: true;
    ok: true;
    /**
     * D2 — ONE REQUESTED EFFECT PER ITEM THE MESSAGE NAMED. "I had chicken and
     * broccoli" is two facts, in the order the payload listed them.
     */
    requested_effects: LogProtocolEventRequestedEffect[];
  };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function effectFor(turnFrame: TurnFrame) {
  return turnFrame.direct_effects.find((candidate) =>
    candidate.effect_type === "log_protocol_event"
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

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * `local_date` from the runtime's already-resolved local datetime. We accept
 * `YYYY-MM-DD` or an ISO datetime and take its date part — but only from the
 * time context, never from a free-text hint written by the model.
 */
function localDateFrom(userLocalDatetime: string): string | null {
  const trimmed = userLocalDatetime.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  const head = trimmed.slice(0, 10);
  return ISO_DATE.test(head) ? head : null;
}

/** R6-adjacent: the source decides the evidence weight; no free-form number. */
export function evidenceWeightForSource(source: ProtocolEventSource): number {
  // SCHEMA.md: photo 1.0 / detailed text 0.8 / thumbs-up 0.4. A device feed and
  // a coach entry are as good as a photo; a quick tap is the weakest signal.
  if (source === "photo" || source === "integration") return 1.0;
  if (source === "coach_entry") return 1.0;
  if (source === "quick_tap") return 0.4;
  return 0.8; // text | voice | chat
}

/**
 * EXPLICIT BINDING, allow-listed. Same posture as `parseSubstanceRef`, applied
 * to a value whose vocabulary is not a constant but the student's own day.
 *
 * Two refusals, and the second is the one that matters:
 *  1. an id absent from the allow-list — the model named a line that is not on
 *     this student's published plan. `meal-photo-upload-v1:330-353` already
 *     refuses exactly that from the CLIENT; a probabilistic layer gets no more
 *     credit than a browser;
 *  2. an id supplied while the allow-list is EMPTY OR ABSENT. Fail-closed on
 *     purpose: "I cannot check" and "it checks out" must not produce the same
 *     write. The caller that forgets to pass the day's plan gets a named
 *     refusal in the ledger, not a fact bound to an unverified line — this is
 *     the `p8-revalidation-rose-reds` lesson (a guard whose only enforcement is
 *     upstream discipline regresses in a real run).
 *
 * A commitment id is opaque (a uuid): there is no alias table and nothing to
 * normalise. Membership is the whole check.
 */
function resolveCommitmentId(
  raw: string | null,
  allowed: readonly string[] | null | undefined,
): string | null {
  if (raw === null) return null;
  const allowList = (allowed ?? []).map((id) => String(id ?? "").trim()).filter(
    (id) => id.length > 0,
  );
  if (allowList.length === 0) {
    throw new Error(
      `commitment_id '${raw}' cannot be verified: no plan line is in scope ` +
        `for this turn (R7: an unverifiable binding is refused, never assumed)`,
    );
  }
  if (!allowList.includes(raw)) {
    throw new Error(
      `commitment_id '${raw}' is not an active commitment of this student's ` +
        `published plan today (R7: a binding is never invented)`,
    );
  }
  return raw;
}

/**
 * ONE ITEM the message reported. Deliberately not "the payload": `slot_key`,
 * `source`, `student_note` and `media_path` describe the MESSAGE and are shared
 * by every fact it produces; only the identity of what was consumed, and any
 * number the student said about it, vary from one item to the next.
 */
type ComponentDraft = {
  substance_ref: SubstanceRef | null;
  food_group_ref: FoodGroupRef | null;
  quantity: number | null;
  unit: Unit | null;
  commitment_id: string | null;
};

function readComponent(raw: Record<string, unknown>, where: string): ComponentDraft {
  const named = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      // R7: the failing token is surfaced, and now it also says WHICH item it
      // came from — a message with three foods and one bad slug must not read
      // as "something, somewhere, was wrong".
      throw new Error(
        `${where}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const rawUnit = optionalString(raw.unit);
  const rawSubstance = optionalString(raw.substance_ref);
  const rawFoodGroup = optionalString(raw.food_group_ref);
  return {
    unit: rawUnit === null ? null : named(() => parseUnit(rawUnit)),
    substance_ref: rawSubstance === null
      ? null
      : named(() => parseSubstanceRef(rawSubstance)),
    food_group_ref: rawFoodGroup === null
      ? null
      : named(() => parseFoodGroupRef(rawFoodGroup)),
    quantity: optionalNumber(raw.quantity),
    commitment_id: optionalString(raw.commitment_id),
  };
}

function hasIdentity(component: ComponentDraft): boolean {
  return component.substance_ref !== null || component.food_group_ref !== null ||
    component.commitment_id !== null || component.quantity !== null ||
    component.unit !== null;
}

/**
 * D2 — THE CARDINALITY OF A REPORTED MESSAGE.
 *
 * Measured red: "I had chicken and broccoli" wrote ONE row, because the payload
 * had one `food_group_ref` and the prompt told the model to keep "the most
 * carrying entry". The model picked `poultry` — the group that did not count —
 * while the reply asserted the vegetables had been credited. Two failures in
 * one turn: a fact that lost half of what was said, and an acknowledgement of
 * something no row carried.
 *
 * THE SHAPE: `payload_hint.components` is an ARRAY of items. The top-level
 * identity fields are still read, as the implicit FIRST item, so the single-food
 * payload the model already emits keeps working unchanged and no caller has to
 * choose between two spellings. Both are merged, then deduped by identity.
 *
 * THE PRODUCT RULE, which this parser cannot break because it never looks at
 * prose: only what the payload EXPLICITLY names becomes a fact. `student_note`
 * is never mined for a second food, no group is inferred from a dish name, and
 * an item with no identity at all contributes no extra row.
 */
function readComponents(payload: Record<string, unknown>): ComponentDraft[] {
  const head = readComponent(payload, "payload");
  const rawList = payload.components;
  if (rawList !== undefined && rawList !== null && !Array.isArray(rawList)) {
    throw new Error(
      "payload.components must be an array of items (R7: a shape we cannot read is refused, never guessed)",
    );
  }
  const list = Array.isArray(rawList) ? rawList : [];
  const components: ComponentDraft[] = [];
  if (hasIdentity(head) || list.length === 0) components.push(head);
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `payload.components[${index}] is not an object (R7: refused, never coerced)`,
      );
    }
    components.push(
      readComponent(entry as Record<string, unknown>, `components[${index}]`),
    );
  });
  return components;
}

function parseSource(value: unknown, fallback: ProtocolEventSource) {
  const raw = optionalString(value);
  if (raw === null) return fallback;
  if ((PROTOCOL_EVENT_SOURCES as readonly string[]).includes(raw)) {
    return raw as ProtocolEventSource;
  }
  // R7: an unknown source is not silently coerced to 'chat'.
  throw new Error(
    `Unknown protocol_events.source '${raw}' (expected one of: ${
      PROTOCOL_EVENT_SOURCES.join(", ")
    })`,
  );
}

export function runLogProtocolEventIntake(input: {
  turn_frame: TurnFrame;
  /** R2/R3: the thread's persisted conversation_locale. Never inferred here. */
  content_locale: string | null | undefined;
  /** Channel default when the payload does not state a source. */
  default_source?: ProtocolEventSource;
  /**
   * Le créneau que l'élève a NOMMÉ dans son message, extrait
   * déterministiquement en amont (`_shared/keel/slot_from_message.ts`).
   * Utilisé UNIQUEMENT quand le payload n'en porte pas — le modèle prime.
   */
  slot_named_in_message?: SlotKey | null;
  /**
   * Ids of the commitments the student may bind a fact to this turn — the same
   * lines the dispatcher was shown. Absent/empty means "no binding is
   * verifiable": a payload that carries one is then refused, not written.
   */
  allowed_commitment_ids?: readonly string[] | null;
}): LogProtocolEventIntakeResult {
  const effect = effectFor(input.turn_frame);
  if (!effect) return { detected: false, reason_code: "no_effect_candidate" };

  const timeContext = input.turn_frame.direct_effect_time_context;
  const localDate = timeContext
    ? localDateFrom(timeContext.user_local_datetime ?? "")
    : null;
  if (!timeContext || !localDate || !timeContext.now_utc) {
    return {
      detected: true,
      ok: false,
      reason_code: "missing_time_context",
      token_issue: null,
    };
  }

  const contentLocale = optionalString(input.content_locale);
  if (!contentLocale) {
    // R2: a prose row with a guessed language is exactly what the contract
    // forbids. Refuse the write rather than default to 'fr-FR'.
    return {
      detected: true,
      ok: false,
      reason_code: "missing_content_locale",
      token_issue: null,
    };
  }

  const sourceMessageId = optionalString(input.turn_frame.source_message_id);
  if (!sourceMessageId) {
    // Without it the partial unique index cannot dedupe: a retry would append
    // a second fact. Refuse loudly instead of writing an undedupable row.
    return {
      detected: true,
      ok: false,
      reason_code: "missing_source_message_id",
      token_issue: null,
    };
  }

  const payload = payloadOf(input.turn_frame);

  let slotKey: SlotKey | null = null;
  let source: ProtocolEventSource;
  let components: ComponentDraft[];
  try {
    const rawSlot = optionalString(payload.slot_key);
    // REPLI DÉTERMINISTE SUR LE CRÉNEAU NOMMÉ (QA agent 4).
    //
    // Le payload du modèle PRIME toujours: `slot_key` explicite gagne, et si le
    // modèle émet un token inconnu on échoue bruyamment comme avant (R7). Le
    // repli ne sert QUE le cas mesuré: le modèle n'émet rien alors que l'élève
    // a nommé son créneau. 0/3 en run réel — « for lunch », « at breakfast »,
    // « for dinner » ont tous produit `slot_key = NULL`.
    //
    // `slotKeyNamedIn` ne lit que le MESSAGE, jamais l'horloge: la règle « ne
    // le deduis pas de l'heure qu'il est » est préservée par construction (la
    // fonction ne reçoit pas de date).
    slotKey = rawSlot === null
      ? (input.slot_named_in_message ?? null)
      : parseSlotKey(rawSlot);
    source = parseSource(payload.source, input.default_source ?? "chat");
    components = readComponents(payload);
  } catch (error) {
    return {
      detected: true,
      ok: false,
      reason_code: "unknown_token",
      token_issue: error instanceof Error ? error.message : String(error),
    };
  }

  // Named apart from the token block above: "you invented a slug" and "you
  // pointed at a line that is not yours" are two different failures, and the
  // ledger has to be able to tell them apart.
  try {
    for (const component of components) {
      component.commitment_id = resolveCommitmentId(
        component.commitment_id,
        input.allowed_commitment_ids,
      );
    }
  } catch (error) {
    return {
      detected: true,
      ok: false,
      reason_code: "unknown_commitment",
      token_issue: error instanceof Error ? error.message : String(error),
    };
  }

  const studentNote = optionalString(payload.student_note);
  const mediaPath = optionalString(payload.media_path);

  // Identity-keyed dedupe, BEFORE the write. Two components resolving to the
  // same key would hit the partial unique index, come back `already_logged`
  // with the SAME row id, and the ledger would carry two committed effects for
  // one row — the phantom cardinality of `fanout-reminder-phantom-commit`, with
  // the ack claiming two facts. Collapsing here is the only place the count can
  // still be made true.
  const byKey = new Map<string, ComponentDraft>();
  for (const component of components) {
    const key = protocolEventComponentKey(component);
    if (!byKey.has(key)) byKey.set(key, component);
  }
  const distinct = [...byKey.entries()];

  if (distinct.length > MAX_PROTOCOL_EVENT_COMPONENTS) {
    return {
      detected: true,
      ok: false,
      reason_code: "too_many_components",
      token_issue:
        `${distinct.length} distinct items in one message (max ${MAX_PROTOCOL_EVENT_COMPONENTS})`,
    };
  }

  // A fact with nothing in it is not a fact. Every other field is optional, but
  // at least one of them must say WHAT happened, otherwise the row is a
  // timestamp with a locale — noise in the denominator of nothing.
  const saysSomething = distinct.some(([, c]) =>
    c.substance_ref !== null || c.food_group_ref !== null ||
    c.commitment_id !== null || c.quantity !== null
  );
  if (
    !saysSomething && slotKey === null && studentNote === null &&
    mediaPath === null
  ) {
    return {
      detected: true,
      ok: false,
      reason_code: "empty_payload",
      token_issue: null,
    };
  }

  return {
    detected: true,
    ok: true,
    requested_effects: distinct.map(([key, component]) => ({
      type: "log_protocol_event" as const,
      occurred_at: timeContext.now_utc,
      local_date: localDate,
      slot_key: slotKey,
      source,
      media_path: mediaPath,
      quantity: component.quantity,
      unit: component.unit,
      substance_ref: component.substance_ref,
      food_group_ref: component.food_group_ref,
      commitment_id: component.commitment_id,
      // The note is the student's words about the whole message; each row is a
      // self-contained fact and carries them (with its own `content_locale`,
      // R2). Splitting prose across rows would need to know which words belong
      // to which food — a deduction, and D2's product rule forbids deductions.
      student_note: studentNote,
      content_locale: contentLocale,
      evidence_weight: evidenceWeightForSource(source),
      source_message_id: `${sourceMessageId}#${key}`,
    })),
  };
}
