import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type ActiveTransformationRuntime,
  getActiveTransformationRuntime,
} from "../../../../_shared/v2-runtime.ts";
import { logV2Event, V2_EVENT_TYPES } from "../../../../_shared/v2-events.ts";
import type {
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../../../_shared/v2-types.ts";
import type { TrackProgressWrite } from "./contract.ts";

export type V2TrackingResult = {
  mode: "logged" | "needs_clarify";
  message: string;
  target: string;
  status: string;
  logged_progress_id?: string;
};

async function resolveActiveTransformationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<ActiveTransformationRuntime> {
  if (args.runtime) return args.runtime;
  return await getActiveTransformationRuntime(args.supabase, args.userId);
}

function resolveLoggedAtIso(dateHint: string | null | undefined): string {
  const trimmed = String(dateHint ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000Z`).toISOString();
  }
  return new Date().toISOString();
}

function derivePlanItemEntryKind(args: {
  status: "completed" | "missed" | "partial";
  item: Pick<UserPlanItemRow, "tracking_type" | "kind">;
  value: number | null;
}): UserPlanItemEntryRow["entry_kind"] {
  if (args.status === "missed") return "skip";
  if (args.status === "partial") return "partial";

  if (
    args.item.tracking_type === "count" ||
    args.item.tracking_type === "scale" ||
    args.item.tracking_type === "milestone"
  ) {
    return "progress";
  }

  if (Number.isFinite(args.value) && Math.abs(Number(args.value)) > 1) {
    return "progress";
  }

  return args.item.kind === "milestone" ? "progress" : "checkin";
}

export async function logPlanItemProgressV2(args: {
  supabase: SupabaseClient;
  userId: string;
  planItemId: string;
  status: "completed" | "missed" | "partial";
  value?: number | null;
  dateHint?: string | null;
  source?: string | null;
  sourceMessageId?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<V2TrackingResult> {
  const {
    supabase,
    userId,
    planItemId,
    status,
    value,
    dateHint,
    source,
    sourceMessageId,
    runtime,
  } = args;

  const resolvedRuntime = await resolveActiveTransformationRuntime({
    supabase,
    userId,
    runtime,
  });
  if (
    !resolvedRuntime.cycle || !resolvedRuntime.transformation ||
    !resolvedRuntime.plan
  ) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas trouvé de plan V2 actif pour logger ce progrès maintenant.",
      target: planItemId,
      status,
    };
  }

  const itemResult = await supabase
    .from("user_plan_items")
    .select("*")
    .eq("id", planItemId)
    .eq("plan_id", resolvedRuntime.plan.id)
    .limit(1)
    .maybeSingle();

  if (itemResult.error) throw itemResult.error;

  const item = (itemResult.data as UserPlanItemRow | null) ?? null;
  if (!item) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas retrouvé ce plan item actif. Oriente vers le dashboard pour choisir l'item exact.",
      target: planItemId,
      status,
    };
  }

  const nowIso = new Date().toISOString();
  const effectiveAt = resolveLoggedAtIso(dateHint);
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : null;
  const entryKind = derivePlanItemEntryKind({
    status,
    item,
    value: numericValue,
  });
  const entryId = crypto.randomUUID();
  const entryRow: UserPlanItemEntryRow = {
    id: entryId,
    user_id: userId,
    cycle_id: resolvedRuntime.cycle.id,
    transformation_id: resolvedRuntime.transformation.id,
    plan_id: resolvedRuntime.plan.id,
    plan_item_id: item.id,
    entry_kind: entryKind,
    outcome: status,
    value_numeric: numericValue,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: nowIso,
    effective_at: effectiveAt,
    metadata: {
      source: "router_parallel_tracking_v2",
      channel: String(source ?? "").trim() || null,
      source_message_id: sourceMessageId ?? null,
      status_hint: status,
    },
  };

  const insertResult = await supabase
    .from("user_plan_item_entries")
    .insert(entryRow);
  if (insertResult.error) throw insertResult.error;

  await logV2Event(supabase, V2_EVENT_TYPES.PLAN_ITEM_ENTRY_LOGGED, {
    user_id: userId,
    cycle_id: resolvedRuntime.cycle.id,
    transformation_id: resolvedRuntime.transformation.id,
    plan_id: resolvedRuntime.plan.id,
    plan_item_id: item.id,
    entry_id: entryId,
    entry_kind: entryKind,
    effective_at: effectiveAt,
    metadata: {
      source: "router_parallel_tracking_v2",
      channel: String(source ?? "").trim() || null,
      source_message_id: sourceMessageId ?? null,
      status_hint: status,
    },
  });

  const title = String(item.title ?? "").trim() || planItemId;
  return {
    mode: "logged",
    message: "",
    target: title,
    status,
    logged_progress_id: entryId,
  };
}

export function createTrackProgressPlanItemWrite(args: {
  supabase: SupabaseClient;
  userId: string;
  source: string;
  sourceMessageId?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): TrackProgressWrite {
  return async (input) => {
    const written = await logPlanItemProgressV2({
      supabase: args.supabase,
      userId: args.userId,
      planItemId: input.target_item_id,
      status: input.progress_status,
      value: input.value,
      dateHint: input.date_hint ?? null,
      source: args.source,
      sourceMessageId: input.source_message_id || args.sourceMessageId,
      runtime: args.runtime,
    });
    if (written.mode !== "logged" || !written.logged_progress_id) {
      throw new Error(written.message);
    }
    return { logged_progress_id: written.logged_progress_id };
  };
}
