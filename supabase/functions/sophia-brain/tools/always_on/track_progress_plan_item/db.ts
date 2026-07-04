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
  mode: "logged" | "needs_clarify" | "already_logged";
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
  const parts = trimmed.split("-");
  const isIsoDate = parts.length === 3 &&
    parts[0].length === 4 &&
    parts[1].length === 2 &&
    parts[2].length === 2 &&
    parts.every((part) =>
      part.length > 0 && [...part].every((char) => char >= "0" && char <= "9")
    );
  if (isIsoDate) {
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

/**
 * Miroir du contrat d'ecriture du dashboard
 * (frontend/src/hooks/useDashboardV2Logic.ts, logItemEntry +
 * nextStatusForEntry): une entry completed incremente le compteur visible
 * (current_reps) et applique la meme transition de statut. Sans ce deuxieme
 * write, le chat felicite mais la carte reste a 0/target (R2-W01 /
 * BF-EFFECT-03). Les reports missed/partial n'incrementent jamais.
 */
export function planItemPatchForCompletedEntry(
  item: Pick<
    UserPlanItemRow,
    | "dimension"
    | "tracking_type"
    | "status"
    | "current_habit_state"
    | "target_reps"
    | "current_reps"
    | "activated_at"
  >,
  nowIso: string,
): Partial<UserPlanItemRow> | null {
  const isHabit = String(item.dimension ?? "") === "habits";
  const isBoolean = String(item.tracking_type ?? "") === "boolean";
  if (item.target_reps == null && !isHabit) {
    // Item sans compteur: seul un tracking boolean se termine (contrat
    // dashboard: tracking_type === "boolean" => completed).
    if (!isBoolean) return null;
    return {
      status: "completed",
      completed_at: nowIso,
      activated_at: item.activated_at ?? nowIso,
    };
  }
  const nextReps = Math.max((item.current_reps ?? 0) + 1, 0);
  if (isHabit) {
    const target = item.target_reps ?? 5;
    const reachedTarget = nextReps >= target;
    return {
      current_reps: nextReps,
      status: reachedTarget ? "in_maintenance" : "active",
      current_habit_state: reachedTarget ? "in_maintenance" : "active_building",
      activated_at: item.activated_at ?? nowIso,
      completed_at: reachedTarget ? nowIso : null,
    };
  }
  const target = item.target_reps ?? 1;
  const reachedTarget = nextReps >= target || isBoolean;
  return {
    current_reps: nextReps,
    status: reachedTarget ? "completed" : "active",
    activated_at: item.activated_at ?? nowIso,
    completed_at: reachedTarget ? nowIso : null,
  };
}

/**
 * Correction de cible (3h-bis): invalide l'entry conversationnelle du jour
 * sur l'item errone et restaure l'etat de l'item depuis item_patch_prior
 * (enregistre au commit) — revert exact, aucune devinette. Ne touche que les
 * entries ecrites par le chat (source router_parallel_tracking_v2).
 */
export async function invalidateChatEntryForRetarget(args: {
  supabase: SupabaseClient;
  userId: string;
  planItemId: string;
  outcome: "completed" | "missed" | "partial";
  effectiveDay: string;
}): Promise<{ invalidated: boolean }> {
  const { data, error } = await args.supabase
    .from("user_plan_item_entries")
    .select("id,metadata")
    .eq("user_id", args.userId)
    .eq("plan_item_id", args.planItemId)
    .eq("outcome", args.outcome)
    .gte("effective_at", `${args.effectiveDay}T00:00:00.000Z`)
    .lt("effective_at", `${args.effectiveDay}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const row = (data ?? []).find((candidate: any) =>
    String(
      (candidate?.metadata as Record<string, unknown> | null)?.source ?? "",
    ) === "router_parallel_tracking_v2"
  ) as { id: string; metadata: Record<string, unknown> | null } | undefined;
  if (!row) return { invalidated: false };
  const del = await args.supabase
    .from("user_plan_item_entries")
    .delete()
    .eq("id", row.id);
  if (del.error) throw del.error;
  const prior = row.metadata?.item_patch_prior as
    | Record<string, unknown>
    | undefined;
  if (prior && typeof prior === "object") {
    const restore = await args.supabase
      .from("user_plan_items")
      .update({
        status: prior.status ?? null,
        current_reps: prior.current_reps ?? null,
        current_habit_state: prior.current_habit_state ?? null,
        completed_at: prior.completed_at ?? null,
        activated_at: prior.activated_at ?? null,
      })
      .eq("id", args.planItemId);
    if (restore.error) {
      console.warn(
        "[TrackProgress] retarget item restore failed (non-blocking):",
        restore.error,
      );
    }
  }
  return { invalidated: true };
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
  retargetFromItemId?: string | null;
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
    retargetFromItemId,
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

  // Idempotence journaliere (garde anti-duplication, charte cmd 0): une entry
  // identique (item, jour, outcome) existe deja -> on ne re-ecrit pas.
  // Deux cas distincts:
  // - meme source_message_id = re-execution de la meme lane dans le tour ->
  //   on re-renvoie le commit existant (re-entrance, comme les rappels);
  // - autre message = question de verification ou double report -> mode
  //   already_logged, le renderer confirme l'existant au lieu de re-committer.
  const effectiveDay = effectiveAt.slice(0, 10);

  // Correction de cible (3h-bis): invalider d'abord l'ecriture erronee du
  // jour sur l'item source, puis committer normalement sur la bonne cible.
  if (retargetFromItemId && retargetFromItemId !== planItemId) {
    try {
      await invalidateChatEntryForRetarget({
        supabase,
        userId,
        planItemId: retargetFromItemId,
        outcome: status,
        effectiveDay,
      });
    } catch (error) {
      console.warn(
        "[TrackProgress] retarget invalidation failed (non-blocking):",
        error,
      );
    }
  }

  const sameDayResult = await supabase
    .from("user_plan_item_entries")
    .select("id,outcome,created_at,metadata")
    .eq("user_id", userId)
    .eq("plan_item_id", planItemId)
    .eq("outcome", status)
    .gte("effective_at", `${effectiveDay}T00:00:00.000Z`)
    .lt("effective_at", `${effectiveDay}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!sameDayResult.error) {
    const sameDayRows = (sameDayResult.data ?? []) as Array<
      Pick<UserPlanItemEntryRow, "id" | "outcome" | "created_at" | "metadata">
    >;
    const turnSourceMessageId = String(sourceMessageId ?? "").trim();
    const ownWrite = turnSourceMessageId
      ? sameDayRows.find((row) =>
        String(
          (row.metadata as Record<string, unknown> | null)
            ?.source_message_id ?? "",
        ).trim() === turnSourceMessageId
      )
      : undefined;
    const title = String(item.title ?? "").trim() || planItemId;
    if (ownWrite) {
      return {
        mode: "logged",
        message: "",
        target: title,
        status,
        logged_progress_id: String(ownWrite.id),
      };
    }
    if (sameDayRows.length > 0) {
      return {
        mode: "already_logged",
        message: "",
        target: title,
        status,
        logged_progress_id: String(sameDayRows[0].id),
      };
    }
  }

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
      // Etat de l'item AVANT le patch compteur/statut: permet une
      // invalidation deterministe (correction de cible 3h-bis) sans
      // deviner ce que le commit avait modifie.
      item_patch_prior: {
        status: item.status ?? null,
        current_reps: item.current_reps ?? null,
        current_habit_state: item.current_habit_state ?? null,
        completed_at: item.completed_at ?? null,
        activated_at: item.activated_at ?? null,
      },
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

  // Deuxieme write du contrat dashboard: compteur + transition de statut.
  // Non-bloquant: l'entry committee reste la source de verite si le patch
  // echoue (le compteur peut etre recalcule), on ne casse pas un commit reel.
  if (status === "completed") {
    const patch = planItemPatchForCompletedEntry(item, nowIso);
    if (patch) {
      const patchResult = await supabase
        .from("user_plan_items")
        .update(patch)
        .eq("id", item.id);
      if (patchResult.error) {
        console.warn(
          "[TrackProgress] current_reps/status patch failed (non-blocking):",
          patchResult.error,
        );
      }
    }
  }

  const title = String(item.title ?? "").trim() || planItemId;
  return {
    mode: "logged",
    message: "",
    target: title,
    status,
    logged_progress_id: entryId,
  };
}

export type TrackProgressSameDayEvidence = {
  entry_id: string;
  outcome: string;
  source: string | null;
};

export type TrackProgressSameDayEvidenceCheck = (input: {
  target_item_id: string;
  progress_status: "completed" | "missed" | "partial";
  date_hint?: string | null;
}) => Promise<TrackProgressSameDayEvidence | null>;

/**
 * Garde-fou d'integrite d'evidence (BF-EFFECT-01, run daily-2plans-20260703-r2):
 * un track_progress non confirme ne doit pas re-ecrire un outcome OPPOSE sur
 * une action qui porte deja une evidence committee le meme jour (daily review,
 * dashboard ou tour precedent). Complement du garde meme-outcome de
 * logPlanItemProgressV2 (already_logged): ici on detecte la contradiction, et
 * le router demande confirmation au lieu d'ecrire. Check deterministe non
 * semantique — il lit l'etat structure, il n'invente aucune intention; la
 * correction explicite passe par payload_hint.correction (contrat dispatcher
 * 3h). Meme convention de fenetre jour que resolveLoggedAtIso et que le filtre
 * already-resolved de process-checkins (journee UTC de la date visee).
 */
export function createTrackProgressSameDayEvidenceCheck(args: {
  supabase: SupabaseClient;
  userId: string;
}): TrackProgressSameDayEvidenceCheck {
  return async (input) => {
    const day = resolveLoggedAtIso(input.date_hint).slice(0, 10);
    const result = await args.supabase
      .from("user_plan_item_entries")
      .select("id,outcome,metadata,created_at")
      .eq("user_id", args.userId)
      .eq("plan_item_id", input.target_item_id)
      .in("outcome", ["completed", "missed", "partial"])
      .gte("effective_at", `${day}T00:00:00.000Z`)
      .lt("effective_at", `${day}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    const row = (result.data?.[0] ?? null) as
      | Pick<UserPlanItemEntryRow, "id" | "outcome" | "metadata">
      | null;
    if (!row) return null;
    const existingOutcome = String(row.outcome ?? "");
    if (existingOutcome === input.progress_status) return null;
    return {
      entry_id: String(row.id),
      outcome: existingOutcome,
      source: String(
        (row.metadata as Record<string, unknown> | null)?.source ?? "",
      ) || null,
    };
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
      retargetFromItemId: input.retarget_from_item_id ?? null,
    });
    if (written.mode === "already_logged" && written.logged_progress_id) {
      return {
        logged_progress_id: written.logged_progress_id,
        already_logged: true,
      };
    }
    if (written.mode !== "logged" || !written.logged_progress_id) {
      throw new Error(written.message);
    }
    return { logged_progress_id: written.logged_progress_id };
  };
}
