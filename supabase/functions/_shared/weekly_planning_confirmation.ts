export const WEEKLY_PLANNING_CONFIRMATION_EVENT_CONTEXT =
  "weekly_planning_confirmation_v2";

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

export type PlanningItemSnapshot = {
  plan_item: {
    id: string;
    title: string;
  };
  week: {
    plan: {
      status: "pending_confirmation" | "confirmed" | "auto_applied";
    };
    occurrences: Array<{
      planned_day: DayCode;
      status?: string | null;
    }>;
  };
};

export type PlanningBundleSnapshot = {
  week_start_date: string;
  bundle_status: "pending_confirmation" | "confirmed";
  items: PlanningItemSnapshot[];
};

export type WeeklyPlanningConfirmationPayload = {
  version: 1;
  source: "habit_week_planning_confirm_bundle";
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  dashboard_url: string;
  confirmation_kind: "first_confirmation" | "modification" | "no_change";
  changes: Array<{
    plan_item_id: string;
    title: string;
    change_kind: "added" | "removed" | "moved" | "unchanged";
    from_days: DayCode[];
    to_days: DayCode[];
    human_summary: string;
  }>;
  summary: {
    changed_action_count: number;
    added_count: number;
    removed_count: number;
    moved_count: number;
  };
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysYmd(ymd: string, days: number): string {
  const date = parseDateYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLong(day: DayCode): string {
  return {
    mon: "lundi",
    tue: "mardi",
    wed: "mercredi",
    thu: "jeudi",
    fri: "vendredi",
    sat: "samedi",
    sun: "dimanche",
  }[day];
}

function listDays(days: DayCode[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return dayLong(days[0]);
  const labels = days.map(dayLong);
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

function normalizeDays(days: DayCode[]): DayCode[] {
  const seen = new Set<DayCode>();
  for (const day of days) {
    if ((DAY_CODES as readonly string[]).includes(day)) seen.add(day);
  }
  return [...seen].sort((left, right) =>
    DAY_CODES.indexOf(left) - DAY_CODES.indexOf(right)
  );
}

function daysForItem(item: PlanningItemSnapshot): DayCode[] {
  return normalizeDays(
    item.week.occurrences
      .filter((occurrence) =>
        occurrence.status !== "done" && occurrence.status !== "partial"
      )
      .map((occurrence) => occurrence.planned_day),
  );
}

function sameDays(left: DayCode[], right: DayCode[]): boolean {
  return left.length === right.length &&
    left.every((day, index) => day === right[index]);
}

function titleFor(
  afterItem: PlanningItemSnapshot,
  beforeItem?: PlanningItemSnapshot,
) {
  return cleanText(
    afterItem.plan_item.title,
    cleanText(beforeItem?.plan_item.title, "Action"),
  );
}

function buildHumanSummary(args: {
  title: string;
  changeKind: "added" | "removed" | "moved" | "unchanged";
  fromDays: DayCode[];
  toDays: DayCode[];
}): string {
  if (args.changeKind === "unchanged") {
    return `"${args.title}" reste planifiee ${listDays(args.toDays)}.`;
  }
  if (args.changeKind === "moved") {
    return `"${args.title}" passe de ${listDays(args.fromDays)} a ${
      listDays(args.toDays)
    }.`;
  }
  if (args.changeKind === "added") {
    return `"${args.title}" est ajoutee ${listDays(args.toDays)}.`;
  }
  return `"${args.title}" est retiree ${listDays(args.fromDays)}.`;
}

export function buildWeeklyPlanningConfirmationPayload(args: {
  userId: string;
  weekStartDate: string;
  dashboardUrl: string;
  before: PlanningBundleSnapshot;
  after: PlanningBundleSnapshot;
}): WeeklyPlanningConfirmationPayload {
  const beforeByItemId = new Map(
    args.before.items.map((item) => [item.plan_item.id, item]),
  );
  const afterWasAlreadyConfirmed = args.before.items.every((item) =>
    item.week.plan.status === "confirmed" ||
    item.week.plan.status === "auto_applied"
  );

  let addedCount = 0;
  let removedCount = 0;
  let movedCount = 0;

  const changes = args.after.items.map((afterItem) => {
    const beforeItem = beforeByItemId.get(afterItem.plan_item.id);
    const fromDays = beforeItem ? daysForItem(beforeItem) : [];
    const toDays = daysForItem(afterItem);
    const addedDays = toDays.filter((day) => !fromDays.includes(day));
    const removedDays = fromDays.filter((day) => !toDays.includes(day));
    const title = titleFor(afterItem, beforeItem);
    let changeKind: "added" | "removed" | "moved" | "unchanged" = "unchanged";

    if (!sameDays(fromDays, toDays)) {
      if (addedDays.length > 0 && removedDays.length > 0) {
        changeKind = "moved";
        movedCount++;
      } else if (addedDays.length > 0) {
        changeKind = "added";
        addedCount++;
      } else if (removedDays.length > 0) {
        changeKind = "removed";
        removedCount++;
      }
    }

    const summaryFromDays = changeKind === "added"
      ? []
      : removedDays.length > 0
      ? removedDays
      : fromDays;
    const summaryToDays = changeKind === "removed"
      ? []
      : addedDays.length > 0
      ? addedDays
      : toDays;

    return {
      plan_item_id: afterItem.plan_item.id,
      title,
      change_kind: changeKind,
      from_days: summaryFromDays,
      to_days: summaryToDays,
      human_summary: buildHumanSummary({
        title,
        changeKind,
        fromDays: summaryFromDays,
        toDays: summaryToDays,
      }),
    };
  });

  const changedActionCount =
    changes.filter((change) => change.change_kind !== "unchanged").length;
  const confirmationKind = !afterWasAlreadyConfirmed
    ? "first_confirmation"
    : changedActionCount > 0
    ? "modification"
    : "no_change";

  return {
    version: 1,
    source: "habit_week_planning_confirm_bundle",
    user_id: args.userId,
    week_start_date: args.weekStartDate,
    week_end_date: addDaysYmd(args.weekStartDate, 6),
    dashboard_url: args.dashboardUrl,
    confirmation_kind: confirmationKind,
    changes,
    summary: {
      changed_action_count: changedActionCount,
      added_count: addedCount,
      removed_count: removedCount,
      moved_count: movedCount,
    },
  };
}

export function buildWeeklyPlanningConfirmationMessage(
  payload: WeeklyPlanningConfirmationPayload,
): string {
  const visibleChanges = payload.changes
    .filter((change) => change.change_kind !== "unchanged")
    .slice(0, 3);
  if (payload.confirmation_kind === "first_confirmation") {
    return `Ton planning de la semaine est valide. Je l'ai bien pris en compte.`;
  }
  if (visibleChanges.length === 0) {
    return "Ton planning est bien valide, aucun changement a signaler.";
  }
  const suffix = payload.summary.changed_action_count > visibleChanges.length
    ? ` + ${
      payload.summary.changed_action_count - visibleChanges.length
    } autre(s) changement(s).`
    : "";
  return `C'est note: ${
    visibleChanges.map((change) => change.human_summary).join(" ")
  }${suffix}`;
}
