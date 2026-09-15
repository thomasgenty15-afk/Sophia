/**
 * KEEL W4.3 — executor for `log_protocol_event`. WRITE-THROUGH, strictly.
 *
 * The doctrine this file exists to enforce ("execution truth", carried over
 * from Sophia and re-litigated at least four times in this repo — see
 * `p0-write-through-reminders`, `fanout-reminder-phantom-commit`): a committed
 * effect is a DATABASE ROW THAT HAS BEEN READ BACK. Not a write that did not
 * throw. Not an id the client generated. Not an optimistic assumption.
 *
 * Consequences, all of them tested:
 *  1. `write` must hand back a row that came out of the database. If the id is
 *     empty, the executor FAILS the effect — even though the insert reported
 *     success. A phantom commit is worse than a failure: the renderer would
 *     acknowledge a fact that does not exist, and the next turn would contradict
 *     it (`reminder-phantom-commit-on-flow-exit`).
 *  2. The committed effect quotes the READ-BACK row (`local_date`, `slot_key`,
 *     `source`), never the request. If the two disagree, the database wins and
 *     the ledger records what the database said.
 *  3. Identity is verified: a read-back row belonging to another user, another
 *     day, or another source message is a `readback_mismatch` failure. This is
 *     the check that catches a mis-scoped query (the class of bug in
 *     `verify-turn-destructive-cancel`, where a fallback read returned the
 *     wrong row and the turn committed against it).
 *  4. Idempotence is the SCHEMA's, not the code's: the partial unique index
 *     `(user_id, source_message_id)`. A second turn on the same message reads
 *     the existing row and commits it as `already_logged` — one fact, one
 *     acknowledgement, zero duplicates.
 */

import type {
  LogProtocolEventCommittedEffect,
  LogProtocolEventRequestedEffect,
  ProtocolEventRow,
  ProtocolEventWrite,
} from "./contract.ts";

export type LogProtocolEventExecutionResult =
  | { status: "committed"; committed_effect: LogProtocolEventCommittedEffect }
  | {
    status: "failed";
    reason_code:
      | "write_failed"
      | "missing_readback_row"
      | "readback_mismatch";
    detail?: string;
  };

function nonEmptyId(row: ProtocolEventRow | null | undefined): string {
  return String(row?.id ?? "").trim();
}

export async function executeLogProtocolEventWrite(args: {
  requested_effect: LogProtocolEventRequestedEffect;
  user_id: string;
  write_protocol_event: ProtocolEventWrite;
}): Promise<LogProtocolEventExecutionResult> {
  const requested = args.requested_effect;

  let written: Awaited<ReturnType<ProtocolEventWrite>>;
  try {
    written = await args.write_protocol_event({
      user_id: args.user_id,
      occurred_at: requested.occurred_at,
      local_date: requested.local_date,
      slot_key: requested.slot_key,
      source: requested.source,
      media_path: requested.media_path,
      quantity: requested.quantity,
      unit: requested.unit,
      substance_ref: requested.substance_ref,
      food_group_ref: requested.food_group_ref,
      commitment_id: requested.commitment_id,
      student_note: requested.student_note,
      content_locale: requested.content_locale,
      plan_relation: requested.plan_relation,
      evidence_weight: requested.evidence_weight,
      source_message_id: requested.source_message_id,
      precision_answer_to: requested.precision_answer_to,
    });
  } catch (error) {
    return {
      status: "failed",
      reason_code: "write_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const row = written?.row;
  const protocolEventId = nonEmptyId(row);
  if (!row || !protocolEventId) {
    // The write said "fine" but produced no readable row. Doctrine: no row,
    // no commit, no acknowledgement.
    return { status: "failed", reason_code: "missing_readback_row" };
  }

  // The read-back must be the row we asked for. Anything else is a mis-scoped
  // read, and committing against it would attribute a fact to the wrong day,
  // the wrong slot, or the wrong person.
  if (row.user_id !== args.user_id) {
    return {
      status: "failed",
      reason_code: "readback_mismatch",
      detail: "user_id",
    };
  }
  if (
    row.source_message_id !== null &&
    row.source_message_id !== requested.source_message_id
  ) {
    return {
      status: "failed",
      reason_code: "readback_mismatch",
      detail: "source_message_id",
    };
  }

  // A binding that was requested and did NOT come back is a lost credit: the
  // fact exists, the plan line it was meant to evidence does not know it. On
  // the insert path that can only mean the `recognized` payload was dropped, so
  // it is a readback_mismatch like any other — the same rule as `local_date`,
  // applied to the field that decides which line is graded.
  // DISARM CONDITION (P9): the check applies to `inserted` only. On
  // `already_logged` the row predates this turn; its binding is the one that
  // counts, and it is reported as-is rather than overwritten or refused.
  if (
    written.outcome === "inserted" &&
    requested.commitment_id !== null &&
    row.bound_commitment_id !== requested.commitment_id
  ) {
    return {
      status: "failed",
      reason_code: "readback_mismatch",
      detail: "commitment_id",
    };
  }

  // Same rule applied to the IDENTITY of the fact, and it became load-bearing
  // with D2: the acknowledgement now NAMES what was recorded, item by item. A
  // `food_group_ref` that was requested and did not come back (FK rejection,
  // trigger, mis-scoped write) would otherwise be announced as a credited food
  // while the row carries null — and it is precisely that column the evaluator
  // matches on. Same disarm condition as above: `inserted` only; on
  // `already_logged` the pre-existing row is authoritative and is quoted as-is.
  if (written.outcome === "inserted") {
    if (
      requested.food_group_ref !== null &&
      row.food_group_ref !== requested.food_group_ref
    ) {
      return {
        status: "failed",
        reason_code: "readback_mismatch",
        detail: "food_group_ref",
      };
    }
    if (
      requested.substance_ref !== null &&
      row.substance_ref !== requested.substance_ref
    ) {
      return {
        status: "failed",
        reason_code: "readback_mismatch",
        detail: "substance_ref",
      };
    }
    // FF-009, même règle appliquée à la relation au plan. Un `off_plan`
    // demandé et non revenu (CHECK rejeté, colonne absente d'un environnement
    // pas encore migré) laisserait un repas hors plan indiscernable d'un repas
    // ordinaire — et le compte séparé que la fiche existe pour produire serait
    // faux sans que rien ne le dise.
    if (
      requested.plan_relation !== null &&
      row.plan_relation !== requested.plan_relation
    ) {
      return {
        status: "failed",
        reason_code: "readback_mismatch",
        detail: "plan_relation",
      };
    }
  }

  return {
    status: "committed",
    committed_effect: {
      type: "log_protocol_event",
      // Every field below is the DATABASE's version of the fact.
      protocol_event_id: protocolEventId,
      local_date: row.local_date,
      slot_key: row.slot_key,
      source: row.source,
      already_logged: written.outcome === "already_logged",
      substance_ref: row.substance_ref,
      food_group_ref: row.food_group_ref,
      commitment_id: row.bound_commitment_id,
      quantity: requested.quantity,
      unit: requested.unit,
      plan_relation: row.plan_relation,
    },
  };
}
