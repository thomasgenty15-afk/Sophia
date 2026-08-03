/**
 * KEEL W4.3 — the physical write for `log_protocol_event`.
 *
 * The only file in this tool that knows Supabase exists. `executor.ts` depends
 * on the `ProtocolEventWrite` contract, so the whole chain is testable with a
 * fake and the doctrine ("no commit without a re-read row") is provable without
 * a database.
 *
 * Two paths, both ending on a row that came OUT of the database:
 *   - insert -> `.select(...).single()` — the read-back of the new row;
 *   - unique violation (23505 on `protocol_events_source_message_idx`) ->
 *     an explicit SELECT of the pre-existing row. Idempotence lives in the
 *     schema's partial unique index, not in a client-side "have I seen this?"
 *     check that races with itself (`subscription-confirmation-messages`).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  ProtocolEventRow,
  ProtocolEventWrite,
  ProtocolEventWriteResult,
} from "./contract.ts";

/**
 * Columns read back. Kept narrow: the ledger quotes identity, not payload —
 * with one exception, `recognized`, because it carries the explicit BINDING and
 * a binding the database did not keep must not be reported as credited.
 */
const READ_BACK_COLUMNS =
  "id,user_id,local_date,occurred_at,slot_key,source,source_message_id,recognized," +
  "food_group_ref,substance_ref";

const UNIQUE_VIOLATION = "23505";

/**
 * Mirror of `evaluate-adherence-v1/snapshot.ts :: extractCommitmentId` — the
 * reader that turns this jsonb into the evaluator's explicit binding. Kept as
 * one small local function rather than an import ACROSS edge functions (each
 * function bundles independently; `_shared` is the only legal shared root).
 * If the two ever drift, the binding silently stops being read: the tests below
 * pin the key name on this side.
 */
function boundCommitmentIdIn(recognized: unknown): string | null {
  if (!recognized || typeof recognized !== "object") return null;
  const value = (recognized as Record<string, unknown>).commitment_id;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asRow(value: unknown): ProtocolEventRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    user_id: String(row.user_id ?? ""),
    local_date: String(row.local_date ?? ""),
    occurred_at: String(row.occurred_at ?? ""),
    slot_key: row.slot_key === null || row.slot_key === undefined
      ? null
      : String(row.slot_key),
    source: String(row.source ?? ""),
    source_message_id: row.source_message_id === null ||
        row.source_message_id === undefined
      ? null
      : String(row.source_message_id),
    bound_commitment_id: boundCommitmentIdIn(row.recognized),
    food_group_ref: row.food_group_ref === null || row.food_group_ref === undefined
      ? null
      : String(row.food_group_ref),
    substance_ref: row.substance_ref === null || row.substance_ref === undefined
      ? null
      : String(row.substance_ref),
  };
}

export function createProtocolEventWrite(args: {
  supabase: SupabaseClient;
}): ProtocolEventWrite {
  return async (input): Promise<ProtocolEventWriteResult> => {
    const inserted = await args.supabase
      .from("protocol_events")
      .insert({
        user_id: input.user_id,
        occurred_at: input.occurred_at,
        local_date: input.local_date,
        slot_key: input.slot_key,
        source: input.source,
        media_path: input.media_path,
        quantity: input.quantity,
        unit: input.unit,
        substance_ref: input.substance_ref,
        food_group_ref: input.food_group_ref,
        // `protocol_events` has no commitment_id column: the binding lives in
        // `recognized`, which is the key the evaluator reads. TWO keys, as on
        // the photo path (`meal-photo-upload-v1:419`): `commitment_id` is the
        // binding itself; `student_commitment_id` records that a HUMAN stated
        // it, so a later machine reading can never silently overwrite it.
        // Chat is always the student speaking — both keys, or the column stays
        // null (never `{}`, which would read as "analysed, found nothing").
        recognized: input.commitment_id === null ? null : {
          commitment_id: input.commitment_id,
          student_commitment_id: input.commitment_id,
        },
        student_note: input.student_note,
        content_locale: input.content_locale,
        evidence_weight: input.evidence_weight,
        source_message_id: input.source_message_id,
      })
      .select(READ_BACK_COLUMNS)
      .single();

    if (!inserted.error) {
      const row = asRow(inserted.data);
      if (!row) {
        // Insert reported success with nothing readable. Throw: the executor
        // turns this into `failed`, and nothing is acknowledged.
        throw new Error(
          "protocol_events insert returned no readable row (write-through violated)",
        );
      }
      return { outcome: "inserted", row };
    }

    if (inserted.error.code !== UNIQUE_VIOLATION) {
      throw new Error(
        `protocol_events insert failed: ${inserted.error.message}`,
      );
    }

    // Idempotence path: the unique partial index already holds this fact.
    const existing = await args.supabase
      .from("protocol_events")
      .select(READ_BACK_COLUMNS)
      .eq("user_id", input.user_id)
      .eq("source_message_id", input.source_message_id)
      .maybeSingle();

    if (existing.error) {
      throw new Error(
        `protocol_events read-back failed: ${existing.error.message}`,
      );
    }
    const row = asRow(existing.data);
    if (!row) {
      // Unique violation but no row to read: the index fired on something we
      // cannot see. Never fabricate a commit out of a conflict.
      throw new Error(
        "protocol_events unique violation with no readable existing row",
      );
    }
    return { outcome: "already_logged", row };
  };
}
