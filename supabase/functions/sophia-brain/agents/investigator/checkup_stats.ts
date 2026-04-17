/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type CheckupStats = {
  items: number;
  logged: number;
  completed: number;
  missed: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asItemArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
      Boolean(asRecord(entry))
    )
    : [];
}

function inferStatus(item: Record<string, unknown>): "completed" | "missed" | "pending" {
  const rawStatus = String(item.status ?? item.outcome ?? "").trim().toLowerCase();
  if (
    rawStatus === "completed" || rawStatus === "done" || rawStatus === "success"
  ) {
    return "completed";
  }
  if (
    rawStatus === "missed" || rawStatus === "skipped" || rawStatus === "failed"
  ) {
    return "missed";
  }
  if (item.completed === true || item.done === true) return "completed";
  if (item.missed === true || item.skipped === true) return "missed";
  return "pending";
}

export function computeCheckupStatsFromInvestigationState(
  investigationState: unknown,
  options?: { fillUnloggedAsMissed?: boolean },
): CheckupStats {
  const state = asRecord(investigationState);
  if (!state) {
    return { items: 0, logged: 0, completed: 0, missed: 0 };
  }

  const explicitStats = asRecord(state.stats);
  const itemsFromState = Number(state.items_count ?? explicitStats?.items ?? 0);
  const completedFromState = Number(
    state.completed_count ?? explicitStats?.completed ?? 0,
  );
  const missedFromState = Number(
    state.missed_count ?? explicitStats?.missed ?? 0,
  );
  const loggedFromState = Number(
    state.logged_count ?? explicitStats?.logged ?? (completedFromState + missedFromState),
  );

  const items = asItemArray(state.items ?? state.check_items ?? state.questions);
  if (items.length === 0 && itemsFromState > 0) {
    const fillUnlogged = options?.fillUnloggedAsMissed === true;
    const completed = Math.max(0, Math.floor(completedFromState));
    const missed = fillUnlogged
      ? Math.max(0, Math.floor(itemsFromState) - completed)
      : Math.max(0, Math.floor(missedFromState));
    const logged = fillUnlogged
      ? Math.max(0, Math.floor(itemsFromState))
      : Math.max(0, Math.floor(loggedFromState));
    return {
      items: Math.max(0, Math.floor(itemsFromState)),
      logged,
      completed,
      missed,
    };
  }

  let completed = 0;
  let missed = 0;
  let pending = 0;
  for (const item of items) {
    const status = inferStatus(item);
    if (status === "completed") completed += 1;
    else if (status === "missed") missed += 1;
    else pending += 1;
  }

  return {
    items: items.length,
    logged: options?.fillUnloggedAsMissed === true
      ? items.length
      : completed + missed,
    completed,
    missed: options?.fillUnloggedAsMissed === true ? missed + pending : missed,
  };
}
