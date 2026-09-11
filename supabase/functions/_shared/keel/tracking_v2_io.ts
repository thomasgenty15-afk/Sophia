import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadEnergyGate } from "./energy_gate_io.ts";
import {
  loadDailyEnergyTarget,
  type PlanRow,
  readViewerAway,
} from "./meal_energy_shared.ts";
import { loadPlans, toTrackingPlan } from "./tracking_window_io.ts";
import { loadBodyMeasures } from "./body_measure_io.ts";
import { dailyValues } from "./body_measure_series.ts";
import { loadCompositionIndex } from "./food_composition_io.ts";
import { indexForReading } from "./composition_fill_io.ts";
import {
  readDishes,
  readEnergyBoxDishes,
  readPreparations,
} from "./plan_energy_read.ts";
import { boxEnergies } from "./mouth_energy.ts";
import { selfPresenceFrom } from "./self_presence.ts";
import { presenceStateFor } from "./household_presence.ts";
import { parseEatingRhythm } from "./meal_generation.ts";
import { effectiveRhythm } from "./daily_recommendation.ts";
import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import {
  intakeHappensOn,
  parseFixedIntakes,
  slotIsTaken,
} from "./fixed_intakes.ts";
import { fixedIntakeSlotKcal } from "./slot_fixed_kcal.ts";
import {
  ACCIDENT_OFF_PLAN_PREFIX,
  MEAL_TICK_PREFIX,
  readDishKey,
} from "./tracking_window.ts";
import {
  buildJournal,
  journalDate,
  type JournalEnergy,
  type JournalEvent,
  type JournalExpected,
  type JournalPlanned,
  journalSlot,
  type PlanRef,
  readMealContext,
  shiftJournalDate,
} from "./tracking_v2.ts";

export const JOURNAL_EVENT_COLUMNS =
  "id, local_date, slot_key, student_note, media_path, recognized, analyzed_at, disqualified_reason, source_message_id, occurred_at, meal_context";
const LEGACY_JOURNAL_EVENT_COLUMNS =
  "id, local_date, slot_key, student_note, media_path, recognized, analyzed_at, disqualified_reason, source_message_id, occurred_at";

type JournalEventsResult = {
  data: Record<string, unknown>[] | null;
  error: { code?: string; message?: string } | null;
};

/**
 * The V2 reader can be released before its additive migration. During that
 * short window, historical events are still readable through their reliable
 * source references; only the new explicit attachment is absent.
 */
export async function loadJournalEvents(
  db: SupabaseClient,
  args: { userId: string; from: string; to: string },
): Promise<JournalEventsResult> {
  const read = (columns: string) =>
    db.from("protocol_events").select(columns).eq("user_id", args.userId).gte(
      "local_date",
      args.from,
    ).lte("local_date", args.to).order("occurred_at");

  const current = await read(
    JOURNAL_EVENT_COLUMNS,
  ) as unknown as JournalEventsResult;
  const missingContextColumn = current.error?.code === "42703" &&
    current.error.message?.includes("meal_context");
  if (!missingContextColumn) return current;

  console.warn("journal_schema_legacy", {
    table: "protocol_events",
    missing: "meal_context",
  });
  const legacy = await read(
    LEGACY_JOURNAL_EVENT_COLUMNS,
  ) as unknown as JournalEventsResult;
  if (legacy.error) return legacy;
  return {
    data: (legacy.data ?? []).map((row) => ({ ...row, meal_context: null })),
    error: null,
  };
}

export function eventForJournal(row: Record<string, unknown>): JournalEvent {
  const recognized = (row.recognized ?? {}) as Record<string, unknown>;
  const estimate = recognized.energy_estimate as
    | Record<string, unknown>
    | undefined;
  const textAnalysis = recognized.journal_text as {
    status?: string;
    energy?: JournalEnergy;
  } | undefined;
  let energy: JournalEnergy | null = null;
  if (textAnalysis?.energy) energy = textAnalysis.energy;
  else if (
    estimate &&
    ["photo_estimate", "declared_quantities"].includes(
      String(estimate.basis),
    ) && Number(estimate.kcal) > 0
  ) {
    energy = {
      kcal: Number(estimate.kcal),
      basis: estimate.basis as JournalEnergy["basis"],
    };
  }
  const tick = readDishKey(
    String(row.source_message_id ?? ""),
    MEAL_TICK_PREFIX,
  );
  const accident = readDishKey(
    String(row.source_message_id ?? ""),
    ACCIDENT_OFF_PLAN_PREFIX,
  );
  const match = recognized.planned_dish as {
    verdict?: string;
    meal_id?: string;
    dish_index?: number;
  } | undefined;
  const refs: PlanRef[] = tick
    ? [{ planId: tick.mealId, dishIndex: tick.dishIndex }]
    : accident
    ? [{ planId: accident.mealId, dishIndex: accident.dishIndex }]
    : match?.verdict === "confident" && match.meal_id &&
        Number.isInteger(match.dish_index)
    ? [{ planId: match.meal_id, dishIndex: match.dish_index! }]
    : [];
  const analyzedPhoto = typeof recognized.analysis_version === "string" ||
    typeof row.analyzed_at === "string";
  const declarationOnly = !row.media_path && !row.student_note;
  return {
    id: String(row.id),
    date: String(row.local_date),
    slot: journalSlot(row.slot_key),
    note: typeof row.student_note === "string" ? row.student_note : null,
    mediaPath: typeof row.media_path === "string" ? row.media_path : null,
    energy,
    context: readMealContext(row.meal_context),
    refs,
    excluded: row.disqualified_reason != null,
    analysis: energy || analyzedPhoto || declarationOnly
      ? "ready"
      : textAnalysis?.status === "pending"
      ? "pending"
      : "unavailable",
    tick: !!tick || !!accident,
    updatedAt: String(row.occurred_at ?? ""),
  };
}
export async function loadJournal(
  db: SupabaseClient,
  args: {
    userId: string;
    from: string;
    to: string;
    requestId: string;
    forPrompts?: boolean;
  },
) {
  if (
    !journalDate(args.from) || !journalDate(args.to) || args.from > args.to ||
    args.to > shiftJournalDate(args.from, 91)
  ) throw new Error("bad_window");
  const loaded = await loadEnergyGate(db, { userId: args.userId });
  const energy = {
    open: loaded.gate.show && !args.forPrompts,
    reason: loaded.gate.reason,
  };
  const base = {
    today: loaded.today,
    from: args.from,
    to: args.to,
    hour: 0,
    slotHours: SLOT_PASSED_HOUR,
    floor: loaded.gate.reason === "restriction_floor",
    energy,
    target: null,
    planned: [],
    expected: [],
    events: [],
    weight: [],
  };
  if (base.floor) return buildJournal(base);
  const [rows, eventsRes, profile, member, weights] = await Promise.all([
    loadPlans(db, args),
    loadJournalEvents(db, args),
    db.from("profiles").select("timezone").eq("id", args.userId).single(),
    db.from("household_members").select("member_id, away_days").eq(
      "user_id",
      args.userId,
    ).maybeSingle(),
    args.forPrompts ? Promise.resolve([]) : loadBodyMeasures(db, {
      userId: args.userId,
      sinceLocalDate: shiftJournalDate(loaded.today, -3650),
      untilLocalDate: loaded.today,
      kinds: ["weight"],
    }),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (profile.error) throw profile.error;
  if (member.error) throw member.error;
  const tz = profile.data.timezone || "UTC";
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const pc = (loaded.goalsRow?.practical_constraints ?? {}) as Record<
    string,
    unknown
  >;
  const rhythm = effectiveRhythm(parseEatingRhythm(pc.eating_rhythm));
  const slotHours = { ...SLOT_PASSED_HOUR };
  for (const r of rhythmClockFrom(pc.eating_rhythm)) {
    if (r.hour !== null) slotHours[r.slot] = r.hour;
  }
  const events =
    ((eventsRes.data ?? []) as unknown as Record<string, unknown>[]).map(
      eventForJournal,
    );
  const selfAway = selfPresenceFrom({
    declared: pc.away_days,
    roster: member.data?.away_days ?? null,
  });
  const memberId = member.data?.member_id ?? null;
  let index: Awaited<ReturnType<typeof loadCompositionIndex>> | null = null;
  if (energy.open && rows.length) {
    const reading = await indexForReading({
      db,
      baseIndex: await loadCompositionIndex(db),
      inputs: rows.flatMap((r) => [
        ...readDishes(r.dishes).flatMap((d) => d.ingredients),
        ...readPreparations(r.preparations).flatMap((p) => p.ingredients),
      ]),
    });
    index = reading.index;
  }
  const planned: JournalPlanned[] = [];
  const expected: JournalExpected[] = [];
  const activeRows = [...rows].sort((a, b) =>
    String(b.created_at ?? b.starts_on).localeCompare(
      String(a.created_at ?? a.starts_on),
    )
  );
  const dayOwner = new Set<string>();
  for (const row of activeRows) {
    const plan = toTrackingPlan(row, index);
    const rawDishes = (row.dishes ?? []) as Record<string, unknown>[];
    const away = readViewerAway(row as unknown as PlanRow, memberId) ??
      selfAway;
    const gf = (row.generated_from ?? {}) as Record<string, unknown>;
    const fixed =
      parseFixedIntakes(gf.fixed_intakes ?? pc.fixed_intakes).intakes;
    const boxes = index && row.plan_kind === "household"
      ? readEnergyBoxDishes(row.dishes)
      : [];
    for (const d of plan.dishes) {
      if (!d.date || d.date < args.from || d.date > args.to) continue;
      const raw = rawDishes[d.dishIndex];
      if (raw?.member_id && raw.member_id !== memberId) continue;
      const day = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(d.date + "T12:00:00Z")).toLowerCase();
      if (d.slot && presenceStateFor(away, day, d.slot) !== "at_table") {
        continue;
      }
      const tick = events.find((e) =>
        e.tick &&
        e.refs.some((r) =>
          r.planId === plan.mealId && r.dishIndex === d.dishIndex
        )
      );
      let kcal = d.kcal;
      if (index && row.plan_kind === "household") {
        const boxDish = boxes[d.dishIndex];
        const mine = boxDish?.boxes.filter((b) =>
          b.memberIds.includes(memberId)
        ) ?? [];
        if (boxDish?.boxes.length && !mine.length) continue;
        const measured = boxDish
          ? boxEnergies({
            index,
            dishes: [boxDish],
            preparations: readPreparations(row.preparations),
          }).filter((b) => b.memberIds.includes(memberId))
          : [];
        kcal = measured.length && measured.every((b) =>
            b.memberIds.length === 1 && b.kcal !== null
          )
          ? measured.reduce((s, b) => s + b.kcal!, 0)
          : null;
      }
      planned.push({
        ref: { planId: plan.mealId, dishIndex: d.dishIndex },
        date: d.date,
        slot: d.slot,
        title: d.title,
        energy: energy.open && kcal !== null
          ? { kcal, basis: "plan_quantities" }
          : null,
        confirmed: !!tick && !tick.excluded,
        skipped: !!tick && tick.excluded,
        retired: plan.retired,
        priority: String(row.created_at ?? row.starts_on),
      });
    }
    for (
      let date = plan.startsOn;
      date <= shiftJournalDate(plan.startsOn, plan.durationDays - 1);
      date = shiftJournalDate(date, 1)
    ) {
      if (date < args.from || date > args.to || dayOwner.has(date)) continue;
      dayOwner.add(date);
      const day = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(date + "T12:00:00Z")).toLowerCase();
      const fixedEnergy = index && energy.open
        ? fixedIntakeSlotKcal({ index, intakes: fixed, dayToken: day })
        : null;
      for (const slot of rhythm.map((r) => r.slot)) {
        const matching = fixed.filter((i) =>
          i.placement === "at_slot" && i.slot === slot &&
          intakeHappensOn(i, day)
        );
        if (!matching.length) continue;
        expected.push({
          date,
          slot,
          kind: "fixed",
          title: matching.map((i) => i.label).join(" · "),
          energy: fixedEnergy?.bySlot.has(slot)
            ? {
              kcal: Math.round(fixedEnergy.bySlot.get(slot)!),
              basis: "declared_quantities",
            }
            : null,
          additive: !matching.some((i) =>
            i.placement === "at_slot" && i.replacesMeal
          ),
        });
      }
      const loose = fixed.filter((i) =>
        i.placement === "loose" && intakeHappensOn(i, day)
      );
      if (loose.length) {
        expected.push({
          date,
          slot: null,
          kind: "fixed",
          title: loose.map((i) => i.label).join(" · "),
          energy: fixedEnergy && fixedEnergy.looseKcal > 0
            ? {
              kcal: Math.round(fixedEnergy.looseKcal),
              basis: "declared_quantities",
            }
            : null,
          additive: true,
        });
      }
      for (const r of rhythm) {
        const presence = presenceStateFor(away, day, r.slot);
        if (presence === "away") continue;
        if (slotIsTaken(fixed, day, r.slot)) continue;
        // A hole in a plan is not evidence of a missed meal. Only an explicitly
        // declared outside slot creates a row that can be filled or skipped.
        if (presence === "eating_out") {
          expected.push({ date, slot: r.slot, kind: "outside" });
        }
      }
    }
  }
  let target = null;
  try {
    if (energy.open) {
      target = await loadDailyEnergyTarget(
        db,
        args.userId,
        loaded,
        args.requestId,
      );
    }
  } catch (error) {
    console.warn("journal_target_unavailable", String(error));
  }
  return buildJournal({
    ...base,
    hour,
    slotHours,
    target,
    planned,
    expected,
    events,
    weight: dailyValues(weights, "weight").map((w) => ({
      localDate: w.localDate,
      value: w.value,
    })),
  });
}
