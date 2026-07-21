import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  localDateYmdInTimezone,
  mondayWeekStartForLocalDate,
} from "./action_occurrences.ts";

/**
 * Activation des items de plan par semaine.
 *
 * Modèle: plus aucune condition de déblocage entre items. La seule chose qui
 * détermine quand un item devient actif est la première semaine du niveau à
 * laquelle il est assigné (weeks[].item_assignments). Quand cette semaine
 * commence (calendrier local de l'ancre du plan), l'item passe pending → active.
 *
 * Fail-open: un item sans temp_id, sans assignation hebdo, ou un plan sans
 * ancre de calendrier est considéré débloqué immédiatement. On ne recrée
 * jamais de friction par prudence.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDateYmd(ymd: string): Date | null {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function diffDaysYmd(fromYmd: string, toYmd: string): number | null {
  const from = parseDateYmd(fromYmd);
  const to = parseDateYmd(toYmd);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export type ResolvedScheduleAnchor = {
  timezone: string;
  anchor_week_start: string;
};

export function resolveScheduleAnchor(
  planContent: unknown,
): ResolvedScheduleAnchor | null {
  if (!isRecord(planContent)) return null;
  const metadata = isRecord(planContent.metadata) ? planContent.metadata : null;
  const anchor = metadata && isRecord(metadata.schedule_anchor)
    ? metadata.schedule_anchor
    : isRecord(planContent.schedule_anchor)
    ? planContent.schedule_anchor
    : null;
  if (!anchor) return null;
  const timezone = typeof anchor.timezone === "string"
    ? anchor.timezone.trim()
    : "";
  const anchorWeekStart = typeof anchor.anchor_week_start === "string"
    ? anchor.anchor_week_start.trim()
    : "";
  if (!timezone || !anchorWeekStart) return null;
  return { timezone, anchor_week_start: anchorWeekStart };
}

/**
 * Semaine courante du plan (1-based). 0 si le plan n'a pas encore commencé,
 * null si l'ancre est absente ou illisible (les appelants doivent alors
 * fail-open).
 */
export function computeCurrentWeekOrder(
  planContent: unknown,
  now = new Date(),
): number | null {
  const anchor = resolveScheduleAnchor(planContent);
  if (!anchor) return null;
  const localToday = localDateYmdInTimezone(anchor.timezone, now);
  if (!localToday) return null;
  const currentWeekStart = mondayWeekStartForLocalDate(localToday);
  const diffDays = diffDaysYmd(anchor.anchor_week_start, currentWeekStart);
  if (diffDays == null) return null;
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

function readWeeksForPhase(
  planContent: unknown,
  phaseId: string | null,
): Array<Record<string, unknown>> {
  if (!isRecord(planContent)) return [];
  const runtime = isRecord(planContent.current_level_runtime)
    ? planContent.current_level_runtime
    : null;
  const runtimePhaseId = runtime && typeof runtime.phase_id === "string"
    ? runtime.phase_id
    : null;
  if (runtime && (!phaseId || runtimePhaseId === phaseId)) {
    const weeks = Array.isArray(runtime.weeks) ? runtime.weeks : [];
    if (weeks.length > 0) return weeks.filter(isRecord);
  }
  const phases = Array.isArray(planContent.phases) ? planContent.phases : [];
  for (const phase of phases) {
    if (!isRecord(phase)) continue;
    if (phaseId && phase.phase_id !== phaseId) continue;
    const weeks = Array.isArray(phase.weeks) ? phase.weeks : [];
    if (weeks.length > 0) return weeks.filter(isRecord);
    if (phaseId) break;
  }
  return [];
}

/**
 * Première semaine d'assignation de chaque temp_id dans le niveau donné.
 * Un temp_id absent de la map n'a aucune assignation hebdo (fail-open).
 */
export function firstAssignedWeekOrderByTempId(
  planContent: unknown,
  phaseId: string | null,
): Map<string, number> {
  const map = new Map<string, number>();
  const weeks = readWeeksForPhase(planContent, phaseId)
    .slice()
    .sort((left, right) =>
      Number(left.week_order ?? 0) - Number(right.week_order ?? 0)
    );
  for (const week of weeks) {
    const weekOrder = Number(week.week_order);
    if (!Number.isInteger(weekOrder) || weekOrder < 1) continue;
    const assignments = Array.isArray(week.item_assignments)
      ? week.item_assignments
      : [];
    for (const assignment of assignments) {
      if (!isRecord(assignment)) continue;
      const tempId = typeof assignment.temp_id === "string"
        ? assignment.temp_id.trim()
        : "";
      if (!tempId || map.has(tempId)) continue;
      map.set(tempId, weekOrder);
    }
  }
  return map;
}

export function readGeneratedTempId(
  item: { payload?: unknown },
): string | null {
  const payload = isRecord(item.payload) ? item.payload : null;
  if (!payload) return null;
  const generation = isRecord(payload._generation)
    ? payload._generation
    : isRecord(payload.generation)
    ? payload.generation
    : null;
  const tempId = String(generation?.temp_id ?? "").trim();
  return tempId || null;
}

/**
 * Première semaine assignée d'un temp_id, ou null si inconnue (fail-open).
 */
export function firstAssignedWeekForTempId(
  tempId: string | null,
  firstWeekByTempId: Map<string, number>,
): number | null {
  if (!tempId) return null;
  return firstWeekByTempId.get(tempId) ?? null;
}

/**
 * Un item est débloqué dès que sa première semaine assignée est commencée.
 * Toute information manquante (ancre, temp_id, assignation) débloque.
 */
export function isWeekUnlocked(args: {
  firstAssignedWeekOrder: number | null;
  currentWeekOrder: number | null;
}): boolean {
  if (args.firstAssignedWeekOrder == null) return true;
  if (args.currentWeekOrder == null) return true;
  return args.firstAssignedWeekOrder <= Math.max(1, args.currentWeekOrder);
}

type PendingPlanItemRow = {
  id: string;
  dimension: string | null;
  phase_id: string | null;
  payload: unknown;
};

export type ActivateDueWeekItemsResult = {
  activated_ids: string[];
  current_week_order: number | null;
  warnings: string[];
};

/**
 * Active tous les items pending du niveau courant dont la première semaine
 * assignée est commencée (ou qui n'ont aucune assignation). À appeler à la
 * matérialisation du plan, au rollover hebdomadaire et au passage de niveau.
 */
export async function activateDueWeekItems(args: {
  supabase: SupabaseClient;
  userId: string;
  planId: string;
  planContent: unknown;
  phaseId?: string | null;
  now?: Date;
}): Promise<ActivateDueWeekItemsResult> {
  const now = args.now ?? new Date();
  const warnings: string[] = [];
  const content = args.planContent;
  const runtime = isRecord(content) && isRecord(content.current_level_runtime)
    ? content.current_level_runtime
    : null;
  const phaseId = args.phaseId !== undefined
    ? args.phaseId
    : (runtime && typeof runtime.phase_id === "string"
      ? runtime.phase_id
      : null);

  let query = args.supabase
    .from("user_plan_items")
    .select("id,dimension,phase_id,payload")
    .eq("plan_id", args.planId)
    .eq("user_id", args.userId)
    .eq("status", "pending");
  if (phaseId) query = query.eq("phase_id", phaseId);

  const { data, error } = await query;
  if (error) {
    warnings.push(`activateDueWeekItems load failed: ${error.message}`);
    return { activated_ids: [], current_week_order: null, warnings };
  }

  const pendingItems = (data ?? []) as PendingPlanItemRow[];
  if (pendingItems.length === 0) {
    return {
      activated_ids: [],
      current_week_order: computeCurrentWeekOrder(content, now),
      warnings,
    };
  }

  const currentWeekOrder = computeCurrentWeekOrder(content, now);
  const firstWeekByTempId = firstAssignedWeekOrderByTempId(content, phaseId);

  const dueItems = pendingItems.filter((item) =>
    isWeekUnlocked({
      firstAssignedWeekOrder: firstAssignedWeekForTempId(
        readGeneratedTempId(item),
        firstWeekByTempId,
      ),
      currentWeekOrder,
    })
  );
  if (dueItems.length === 0) {
    return { activated_ids: [], current_week_order: currentWeekOrder, warnings };
  }

  const nowIso = now.toISOString();
  const habitIds = dueItems
    .filter((item) => item.dimension === "habits")
    .map((item) => item.id);
  const otherIds = dueItems
    .filter((item) => item.dimension !== "habits")
    .map((item) => item.id);

  const activatedIds: string[] = [];
  if (habitIds.length > 0) {
    const { error: habitError } = await args.supabase
      .from("user_plan_items")
      .update({
        status: "active",
        activated_at: nowIso,
        updated_at: nowIso,
        current_habit_state: "active_building",
      })
      .in("id", habitIds)
      .eq("status", "pending");
    if (habitError) {
      warnings.push(
        `activateDueWeekItems habit update failed: ${habitError.message}`,
      );
    } else {
      activatedIds.push(...habitIds);
    }
  }
  if (otherIds.length > 0) {
    const { error: otherError } = await args.supabase
      .from("user_plan_items")
      .update({
        status: "active",
        activated_at: nowIso,
        updated_at: nowIso,
      })
      .in("id", otherIds)
      .eq("status", "pending");
    if (otherError) {
      warnings.push(
        `activateDueWeekItems update failed: ${otherError.message}`,
      );
    } else {
      activatedIds.push(...otherIds);
    }
  }

  return {
    activated_ids: activatedIds,
    current_week_order: currentWeekOrder,
    warnings,
  };
}

/**
 * Variante multi-plans: active les items dus de tous les plans actifs du user
 * (ou des plans passés en argument). Ne lève jamais — les erreurs partent en
 * warnings pour ne pas bloquer les flux appelants (rollover hebdo, bilans).
 */
export async function activateDueWeekItemsForUser(args: {
  supabase: SupabaseClient;
  userId: string;
  planIds?: string[];
  now?: Date;
}): Promise<{ activated_ids: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const activatedIds: string[] = [];
  try {
    let query = args.supabase
      .from("user_plans_v2")
      .select("id,content")
      .eq("user_id", args.userId);
    query = args.planIds && args.planIds.length > 0
      ? query.in("id", args.planIds)
      : query.eq("status", "active");
    const { data, error } = await query;
    if (error) {
      warnings.push(
        `activateDueWeekItemsForUser load plans failed: ${error.message}`,
      );
      return { activated_ids: activatedIds, warnings };
    }
    for (const plan of (data ?? []) as Array<{ id: string; content: unknown }>) {
      const result = await activateDueWeekItems({
        supabase: args.supabase,
        userId: args.userId,
        planId: plan.id,
        planContent: plan.content,
        now: args.now,
      });
      activatedIds.push(...result.activated_ids);
      warnings.push(...result.warnings);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`activateDueWeekItemsForUser failed: ${message}`);
  }
  return { activated_ids: activatedIds, warnings };
}
