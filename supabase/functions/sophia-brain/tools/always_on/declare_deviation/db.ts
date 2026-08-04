/**
 * KEEL W4.3 — the physical write for `declare_deviation`.
 *
 * `planned_deviations` carries no `source_message_id`, so there is no partial
 * unique index to lean on. Deduplication is therefore an explicit READ of an
 * equivalent live declaration for (user, plan_version, local_date, slot_key,
 * kind) BEFORE the insert.
 *
 * This is knowingly a check-then-act, i.e. racy under concurrent turns — the
 * exact shape that produced duplicate subscription messages in this repo
 * (`subscription-confirmation-messages`). It is acceptable here and nowhere
 * else because a duplicate `planned_deviations` row is idempotent in effect:
 * the evaluator emits `not_applicable` for the day/slot once, whether one row
 * or two say so. There is no counter to double-count — that is the dividend of
 * "zero incremental counters". If a unique index is added later
 * (`(user_id, plan_version_id, local_date, coalesce(slot_key,''), kind)`),
 * this function should switch to the 23505 path of
 * `log_protocol_event/db.ts`; nothing above it changes.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  PlannedDeviationRow,
  PlannedDeviationWrite,
  PlannedDeviationWriteResult,
} from "./contract.ts";

const READ_BACK_COLUMNS =
  "id,user_id,plan_version_id,local_date,slot_key,kind,declared_via,consumed_flex";

function asRow(value: unknown): PlannedDeviationRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    user_id: String(row.user_id ?? ""),
    plan_version_id: String(row.plan_version_id ?? ""),
    local_date: String(row.local_date ?? ""),
    slot_key: row.slot_key === null || row.slot_key === undefined
      ? null
      : String(row.slot_key),
    kind: String(row.kind ?? ""),
    declared_via: String(row.declared_via ?? ""),
    consumed_flex: row.consumed_flex === true,
  };
}

export function createPlannedDeviationWrite(args: {
  supabase: SupabaseClient;
}): PlannedDeviationWrite {
  return async (input): Promise<PlannedDeviationWriteResult> => {
    let existingQuery = args.supabase
      .from("planned_deviations")
      .select(READ_BACK_COLUMNS)
      .eq("user_id", input.user_id)
      .eq("plan_version_id", input.plan_version_id)
      .eq("local_date", input.local_date)
      .eq("kind", input.kind);
    existingQuery = input.slot_key === null
      ? existingQuery.is("slot_key", null)
      : existingQuery.eq("slot_key", input.slot_key);

    const existing = await existingQuery.limit(1).maybeSingle();
    if (existing.error) {
      throw new Error(
        `planned_deviations read failed: ${existing.error.message}`,
      );
    }
    const existingRow = asRow(existing.data);
    if (existingRow) return { outcome: "already_declared", row: existingRow };

    const inserted = await args.supabase
      .from("planned_deviations")
      .insert({
        user_id: input.user_id,
        plan_version_id: input.plan_version_id,
        local_date: input.local_date,
        slot_key: input.slot_key,
        kind: input.kind,
        declared_at: input.declared_at,
        declared_via: input.declared_via,
        note: input.note,
        content_locale: input.content_locale,
        consumed_flex: input.consumed_flex,
        coach_visible: input.coach_visible,
      })
      .select(READ_BACK_COLUMNS)
      .single();

    if (inserted.error) {
      throw new Error(
        `planned_deviations insert failed: ${inserted.error.message}`,
      );
    }
    const row = asRow(inserted.data);
    if (!row) {
      throw new Error(
        "planned_deviations insert returned no readable row (write-through violated)",
      );
    }
    return { outcome: "inserted", row };
  };
}
