/**
 * KEEL W4.3 — `log_protocol_event`: the durable effect that writes a FACT.
 *
 * Fork of `tools/always_on/track_progress_plan_item/` (which still serves the
 * French branch and is NOT mutated). Same doctrinal chain, same file layout:
 *
 *   contract.ts  — the types below: what may be requested, what may be
 *                  committed, what the ledger carries.
 *   intake.ts    — turn_frame.payload_hint -> requested effect, fail-loud on
 *                  unknown tokens (CONTRACT R7).
 *   db.ts        — the write, physically: insert + read-back.
 *   executor.ts  — write-through: no committed effect without a re-read row.
 *   renderer.ts  — never acknowledges anything the ledger does not carry.
 *   router.ts    — intake -> gate -> executor -> ledger -> renderer.
 *
 * WHAT THIS EFFECT IS: one row in `protocol_events` — a fact the student
 * reported ("I took my D3 this morning", a photo of lunch). Facts are
 * append-only; the DERIVED layer (`commitment_evaluations`) is recomputed from
 * them and never incremented here. There is deliberately NO counter to patch,
 * which is the whole point of the KEEL schema (CONTRACT, "zero incremental
 * counters"): the class of bug that needed `20260721130000` cannot occur.
 *
 * WHAT IT IS NOT: an evaluation. This module never decides `met`/`missed`, and
 * it never reads a commitment target. It records what was reported. The
 * evaluator (`_shared/keel/evaluator.ts`) is the only thing that grades.
 */

import type {
  FoodGroupRef,
  SlotKey,
  SubstanceRef,
  Unit,
} from "../../../../_shared/keel/tokens.ts";

/** `protocol_events.source` — CHECK-constrained in the migration. */
export const PROTOCOL_EVENT_SOURCES = [
  "photo",
  "text",
  "voice",
  "chat",
  "quick_tap",
  "integration",
  "coach_entry",
] as const;
export type ProtocolEventSource = (typeof PROTOCOL_EVENT_SOURCES)[number];

/**
 * The row as READ BACK from the database. Every field the ledger and the
 * renderer quote comes from here — never from the request. That is the
 * difference between "I wrote it" and "the database has it".
 */
export type ProtocolEventRow = {
  id: string;
  user_id: string;
  local_date: string;
  occurred_at: string;
  slot_key: string | null;
  source: string;
  source_message_id: string | null;
  /**
   * `recognized.commitment_id` as READ BACK — the evaluator's explicit binding
   * (`_shared/keel/evaluator.ts :: matchEvent`, first branch: "explicit binding
   * wins over every heuristic"). It is derived from the jsonb column, not from
   * the request, for the same reason `local_date` is: the ledger states what
   * the database holds. `null` = an unbound fact, which still matches lines
   * through `substance_ref` / `food_group_ref`.
   */
  bound_commitment_id: string | null;
  /**
   * READ-BACK identity of the fact. It is here for the same reason
   * `bound_commitment_id` is: D2's acknowledgement NAMES what was recorded
   * ("Recorded: Poultry and Cruciferous vegetables"), and a name must come out
   * of the database. Quoting the request instead would let the reply announce a
   * food group that an FK rejection or a trigger had nulled — the phantom-commit
   * family, moved from the row's existence to the row's content.
   */
  food_group_ref: string | null;
  substance_ref: string | null;
};

export type ProtocolEventWriteInput = {
  user_id: string;
  occurred_at: string;
  local_date: string;
  slot_key: SlotKey | null;
  source: ProtocolEventSource;
  media_path: string | null;
  quantity: number | null;
  unit: Unit | null;
  substance_ref: SubstanceRef | null;
  food_group_ref: FoodGroupRef | null;
  /**
   * EXPLICIT BINDING — the plan line the student themselves designated ("I did
   * my 30-minute walk"). Written into the `recognized` jsonb, which is what the
   * evaluator reads; there is no `commitment_id` column on `protocol_events`
   * (SCHEMA.md), and inventing one here would fork the schema.
   *
   * It is the ONLY way six of the nine `activity_class` families are loggable
   * by conversation at all: `SUBSTANCE_REFS` is a register of molecules and
   * `FOOD_GROUP_REFS` a closed food vocabulary — neither can carry daylight,
   * zone-2, a bedtime or a breathing drill (MEGA_REVIEW G2).
   *
   * Never accepted on trust: the intake validates it against the ids of the
   * student's own published plan, exactly as `meal-photo-upload-v1` does for
   * the photo path. An id off that list is refused, never coerced.
   */
  commitment_id: string | null;
  student_note: string | null;
  /** R2: the row states its own language; the caller passes it, no guessing. */
  content_locale: string;
  evidence_weight: number;
  /**
   * Idempotence key of the schema: unique partial (user_id, source_message_id).
   *
   * D2: it is NOT the bare message id any more, it is
   * `${source_message_id}#${component_key}` — see `protocolEventComponentKey`.
   * One message naming two foods writes two rows, and the index has to let it,
   * so the grain of the guarantee moves from "one event per source message" to
   * ONE EVENT PER REPORTED ITEM OF A SOURCE MESSAGE. Read the arbitration in
   * `intake.ts` before touching the shape: the discriminant is derived from the
   * item's own identity and never from its position, which is what makes a
   * retry that decomposes the same message differently converge instead of
   * duplicating.
   */
  source_message_id: string;
};

/**
 * The discriminant that lets one message carry several facts, and the reason
 * this is one exported function rather than a template literal at the call
 * site: the WRITE and any later read of these rows must agree on it exactly.
 *
 * It is built from the item's IDENTITY, in a fixed field order, never from its
 * index in the array. Two consequences, both wanted:
 *  - a retry that lists the same foods in another order produces the same keys,
 *    so the partial unique index reports `already_logged` and no duplicate fact
 *    is appended (`protocol_events` is APPEND-ONLY: a duplicate cannot be taken
 *    back from the chat, and it would double-count a `serving` target);
 *  - two components with the same identity ("broccoli and cauliflower" — one
 *    slug, `cruciferous_veg`) collapse to one key. The closed vocabulary cannot
 *    tell them apart, so the honest count is one fact, not two.
 */
export function protocolEventComponentKey(component: {
  food_group_ref: string | null;
  substance_ref: string | null;
  commitment_id: string | null;
}): string {
  const parts: string[] = [];
  if (component.food_group_ref) {
    parts.push(`food_group:${component.food_group_ref}`);
  }
  if (component.substance_ref) parts.push(`substance:${component.substance_ref}`);
  if (component.commitment_id) parts.push(`commitment:${component.commitment_id}`);
  // A fact with no structured identity (a slot and a note) is still a fact, and
  // there can only be one of it per message.
  return parts.length > 0 ? parts.join("+") : "item";
}

/**
 * How many facts one message may write. Not a performance guard: a message that
 * decomposes into a dozen "items" is a model narrating a meal, not a student
 * reporting one, and every row it writes is an append-only fact nobody can
 * retract from the chat. Above the cap the turn is refused, loudly and whole —
 * never truncated, which would acknowledge a subset while dropping the rest.
 */
export const MAX_PROTOCOL_EVENT_COMPONENTS = 6;

/**
 * Contract of the write. Two legal outcomes, both carrying a row that came
 * OUT of the database:
 *  - `inserted`    — the row is new; `row` is the read-back of the insert.
 *  - `already_logged` — the partial unique index rejected the insert; `row`
 *    is the pre-existing row, SELECTed. The turn acknowledges the existing
 *    fact and writes nothing (append-only does not mean append-twice).
 * Anything else throws; the executor turns a throw into `failed`, and a failed
 * write never reaches the renderer.
 */
export type ProtocolEventWriteResult =
  | { outcome: "inserted"; row: ProtocolEventRow }
  | { outcome: "already_logged"; row: ProtocolEventRow };

export type ProtocolEventWrite = (
  input: ProtocolEventWriteInput,
) => Promise<ProtocolEventWriteResult>;

export type LogProtocolEventRequestedEffect = {
  type: "log_protocol_event";
  occurred_at: string;
  local_date: string;
  slot_key: SlotKey | null;
  source: ProtocolEventSource;
  media_path: string | null;
  quantity: number | null;
  unit: Unit | null;
  substance_ref: SubstanceRef | null;
  food_group_ref: FoodGroupRef | null;
  /** Validated against the day's plan at intake. See ProtocolEventWriteInput. */
  commitment_id: string | null;
  student_note: string | null;
  content_locale: string;
  evidence_weight: number;
  source_message_id: string;
};

/**
 * What the ledger carries once the row exists. `protocol_event_id`,
 * `local_date` and `slot_key` are the READ-BACK values: if the database
 * normalized or defaulted something, the ledger and the reply say what the
 * database says, not what the turn intended.
 */
export type LogProtocolEventCommittedEffect = {
  type: "log_protocol_event";
  protocol_event_id: string;
  local_date: string;
  slot_key: string | null;
  source: string;
  /** true = the row already existed for this source message (idempotence). */
  already_logged: boolean;
  /**
   * READ-BACK, not an echo (it used to be one). The acknowledgement names these
   * values, so they are the database's, and the type widens to `string` for the
   * same reason `local_date` is a string: what came back is what is said, even
   * if it is not what we sent.
   */
  substance_ref: string | null;
  food_group_ref: string | null;
  /**
   * READ-BACK, not an echo: the binding the database actually holds. If the
   * `recognized` payload did not survive the write, the ledger says `null` and
   * the turn cannot claim a line was credited.
   */
  commitment_id: string | null;
  quantity: number | null;
  unit: Unit | null;
};

export type LogProtocolEventStatus =
  | "logged"
  | "needs_clarify"
  | "blocked"
  | "ignored"
  | "failed";

export type LogProtocolEventDirectEffectResult = {
  detected: boolean;
  status: LogProtocolEventStatus;
  reply: string | null;
  executed_tools: ["log_protocol_event"] | [];
  requested_effects: LogProtocolEventRequestedEffect[];
  allowed_effects: LogProtocolEventRequestedEffect[];
  committed_effects: LogProtocolEventCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  debug: {
    reason_code: string;
    gate_reason?: string | null;
    /** R7: the exact token that failed to parse, surfaced instead of dropped. */
    token_issue?: string | null;
  };
};
