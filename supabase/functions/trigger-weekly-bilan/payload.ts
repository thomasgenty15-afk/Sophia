import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

export type ActionWeekSummary = {
  id: string;
  title: string;
  source: "plan" | "personal";
  target_reps: number;
  week_reps: number;
  completed_count: number;
  missed_count: number;
};

export interface WeeklyReviewPayload {
  execution: {
    rate_pct: number;
    total: number;
    completed: number;
    top_action: string | null;
    blocker_action: string | null;
    details: ActionWeekSummary[];
  };
  etoile_polaire: {
    title: string;
    unit: string;
    start: number;
    current: number;
    target: number;
    delta_week: number;
    progression_pct: number;
  } | null;
  action_load: {
    active_count: number;
    verdict: "low" | "balanced" | "high";
    titles: string[];
  };
  previous_recap: {
    decisions: string[];
    coach_note: string | null;
  } | null;
  week_iso: string;
  week_start: string;
}

function ymdInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC((y ?? 1970), (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone);
  const [y, m, dd] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, dd ?? 1));
  const isoDayIndex = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ddd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
}

function isoWeekLabelFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function parseNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseHistoryValue(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const value = parseNumber((entry as any).value, NaN);
  return Number.isFinite(value) ? value : null;
}

function computeProgressionPct(start: number, current: number, target: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(current) || !Number.isFinite(target)) {
    return 0;
  }
  if (target === start) return current >= target ? 100 : 0;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.max(-100, Math.min(300, Math.round(pct)));
}

export async function buildWeeklyReviewPayload(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<WeeklyReviewPayload> {
  const { data: profile } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  const tz = String((profile as any)?.timezone ?? "").trim() || "Europe/Paris";
  const weekStart = isoWeekStartYmdInTz(new Date(), tz);
  const weekEnd = addDaysYmd(weekStart, 7);
  const previousWeekStart = addDaysYmd(weekStart, -7);

  const { data: activePlan } = await admin
    .from("user_plans")
    .select("id, submission_id")
    .eq("user_id", userId)
    .in("status", ["active", "in_progress", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planId = String((activePlan as any)?.id ?? "").trim();
  const submissionId = String((activePlan as any)?.submission_id ?? "").trim();

  const planActionsQuery = admin
    .from("user_actions")
    .select("id,title,target_reps,current_reps,last_performed_at")
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: planActions } = planId
    ? await planActionsQuery.eq("plan_id", planId)
    : await planActionsQuery;

  const { data: personalActions } = await admin
    .from("user_personal_actions")
    .select("id,title,target_reps,current_reps,last_performed_at")
    .eq("user_id", userId)
    .eq("status", "active");

  const planActionIds = (planActions ?? []).map((a: any) => String(a.id)).filter(Boolean);

  const { data: weekEntries } = planActionIds.length > 0
    ? await admin
      .from("user_action_entries")
      .select("action_id,status")
      .eq("user_id", userId)
      .gte("performed_at", `${weekStart}T00:00:00`)
      .lt("performed_at", `${weekEnd}T00:00:00`)
      .in("action_id", planActionIds)
    : { data: [] as any[] };

  const completedByAction = new Map<string, number>();
  const missedByAction = new Map<string, number>();

  for (const row of (weekEntries ?? []) as any[]) {
    const actionId = String(row?.action_id ?? "");
    if (!actionId) continue;
    const status = String(row?.status ?? "").toLowerCase();
    if (status === "completed" || status === "partial") {
      completedByAction.set(actionId, (completedByAction.get(actionId) ?? 0) + 1);
    } else if (status === "missed") {
      missedByAction.set(actionId, (missedByAction.get(actionId) ?? 0) + 1);
    }
  }

  const details: ActionWeekSummary[] = [];

  for (const action of (planActions ?? []) as any[]) {
    const id = String(action?.id ?? "");
    if (!id) continue;
    const completed = completedByAction.get(id) ?? 0;
    const missed = missedByAction.get(id) ?? 0;
    details.push({
      id,
      title: String(action?.title ?? "Action").trim() || "Action",
      source: "plan",
      target_reps: Math.max(1, Math.floor(parseNumber(action?.target_reps, 1))),
      week_reps: completed,
      completed_count: completed,
      missed_count: missed,
    });
  }

  for (const action of (personalActions ?? []) as any[]) {
    const id = String(action?.id ?? "");
    if (!id) continue;
    const lastPerformed = String(action?.last_performed_at ?? "").trim();
    const lastInWeek = lastPerformed >= `${weekStart}T00:00:00` && lastPerformed < `${weekEnd}T00:00:00`;
    const weekReps = lastInWeek ? Math.max(0, Math.floor(parseNumber(action?.current_reps, 0))) : 0;
    details.push({
      id,
      title: String(action?.title ?? "Action perso").trim() || "Action perso",
      source: "personal",
      target_reps: Math.max(1, Math.floor(parseNumber(action?.target_reps, 1))),
      week_reps: weekReps,
      completed_count: weekReps,
      missed_count: 0,
    });
  }

  const completedTotal = details.reduce((sum, d) => sum + d.completed_count, 0);
  const missedTotal = details.reduce((sum, d) => sum + d.missed_count, 0);
  const total = completedTotal + missedTotal;
  const ratePct = total > 0 ? Math.round((completedTotal / total) * 100) : 0;

  const topAction = details
    .slice()
    .sort((a, b) => b.completed_count - a.completed_count)[0] ?? null;
  const blockerAction = details
    .slice()
    .sort((a, b) => b.missed_count - a.missed_count)[0] ?? null;

  let etoile: WeeklyReviewPayload["etoile_polaire"] = null;

  let nsQuery = admin
    .from("user_north_stars")
    .select("title,unit,start_value,current_value,target_value,history,updated_at,status")
    .eq("user_id", userId)
    .in("status", ["active", "completed"]) as any;

  if (submissionId) {
    nsQuery = nsQuery.eq("submission_id", submissionId);
  }

  const { data: northStar } = await nsQuery
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (northStar) {
    const start = parseNumber((northStar as any).start_value, 0);
    const current = parseNumber((northStar as any).current_value, 0);
    const target = parseNumber((northStar as any).target_value, 0);
    const history = Array.isArray((northStar as any).history) ? (northStar as any).history : [];
    const prevEntry = history.length > 0 ? history[history.length - 1] : null;
    const prevValue = parseHistoryValue(prevEntry);
    const deltaWeek = current - (prevValue ?? start);

    etoile = {
      title: String((northStar as any).title ?? "Etoile Polaire").trim() || "Etoile Polaire",
      unit: String((northStar as any).unit ?? "").trim(),
      start,
      current,
      target,
      delta_week: Math.round(deltaWeek * 100) / 100,
      progression_pct: computeProgressionPct(start, current, target),
    };
  }

  const activeCount = details.length;
  const verdict: "low" | "balanced" | "high" = activeCount <= 1
    ? "low"
    : activeCount >= 6
    ? "high"
    : "balanced";

  const { data: previousRecap } = await admin
    .from("weekly_bilan_recaps")
    .select("decisions_next_week,coach_note")
    .eq("user_id", userId)
    .eq("week_start", previousWeekStart)
    .maybeSingle();

  return {
    execution: {
      rate_pct: ratePct,
      total,
      completed: completedTotal,
      top_action: (topAction && topAction.completed_count > 0) ? topAction.title : null,
      blocker_action: (blockerAction && blockerAction.missed_count > 0) ? blockerAction.title : null,
      details,
    },
    etoile_polaire: etoile,
    action_load: {
      active_count: activeCount,
      verdict,
      titles: details.map((d) => d.title),
    },
    previous_recap: previousRecap
      ? {
        decisions: Array.isArray((previousRecap as any).decisions_next_week)
          ? (previousRecap as any).decisions_next_week.map((x: unknown) => String(x)).filter(Boolean)
          : [],
        coach_note: typeof (previousRecap as any).coach_note === "string"
          ? (previousRecap as any).coach_note
          : null,
      }
      : null,
    week_iso: isoWeekLabelFromYmd(weekStart),
    week_start: weekStart,
  };
}
