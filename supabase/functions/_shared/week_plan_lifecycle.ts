import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

export const ARCHIVED_WEEK_PLAN_STATUS = "archived";
export const PENDING_WEEK_PLAN_STATUS = "pending_confirmation";

export type WeekPlanLifecycleStatus =
  | typeof PENDING_WEEK_PLAN_STATUS
  | "confirmed"
  | "auto_applied"
  | typeof ARCHIVED_WEEK_PLAN_STATUS;

export function normalizePlanIds(planIds: readonly string[]): string[] {
  return [...new Set(planIds.map((id) => String(id).trim()).filter(Boolean))];
}

export async function archivePendingWeekPlansForPlans(
  admin: SupabaseClient,
  params: {
    planIds: readonly string[];
    nowIso: string;
  },
): Promise<number | null> {
  const planIds = normalizePlanIds(params.planIds);
  if (planIds.length === 0) return 0;

  const { data, error, count } = await admin
    .from("user_habit_week_plans")
    .update({
      status: ARCHIVED_WEEK_PLAN_STATUS,
      updated_at: params.nowIso,
    } as any, { count: "exact" })
    .in("plan_id", planIds)
    .eq("status", PENDING_WEEK_PLAN_STATUS)
    .select("id");

  if (error) throw error;
  return count ?? (Array.isArray(data) ? data.length : null);
}
