import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import {
  loadActiveWeeklyPlanning,
  type WeeklyPlanningOccurrenceRow,
  type WeeklyPlanningSnapshot,
} from "./weekly_planning_lifecycle.ts";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAYS[number];

type AiScheduleItem = {
  plan_item_id: string;
  days: DayCode[];
  reason: string;
};

export type WeeklyPlanningAiResult = {
  attempted: boolean;
  applied: boolean;
  reason: string;
  items: AiScheduleItem[];
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function firstJoinedItem(plan: WeeklyPlanningSnapshot["plans"][number]) {
  const value = plan.user_plan_items;
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function movableOccurrences(
  planning: WeeklyPlanningSnapshot,
): WeeklyPlanningOccurrenceRow[] {
  const pendingItemIds = new Set(
    planning.pending_plans.map((plan) => plan.plan_item_id),
  );
  return planning.occurrences.filter((occurrence) =>
    pendingItemIds.has(occurrence.plan_item_id) &&
    cleanText(occurrence.source) === "default_generated" &&
    cleanText(occurrence.status) !== "done" &&
    cleanText(occurrence.status) !== "partial"
  );
}

function schedulePrompt(
  planning: WeeklyPlanningSnapshot,
  occurrences: WeeklyPlanningOccurrenceRow[],
): string {
  const occurrencesByItem = new Map<string, WeeklyPlanningOccurrenceRow[]>();
  for (const occurrence of occurrences) {
    const list = occurrencesByItem.get(occurrence.plan_item_id) ?? [];
    list.push(occurrence);
    occurrencesByItem.set(occurrence.plan_item_id, list);
  }
  const items = planning.pending_plans
    .filter((plan) => occurrencesByItem.has(plan.plan_item_id))
    .map((plan) => {
      const item = firstJoinedItem(plan);
      const itemOccurrences = occurrencesByItem.get(plan.plan_item_id) ?? [];
      return {
        plan_item_id: plan.plan_item_id,
        title: cleanText(item?.title),
        description: cleanText(item?.description),
        dimension: cleanText(item?.dimension),
        kind: cleanText(item?.kind),
        time_of_day: cleanText(item?.time_of_day) || null,
        repetitions: itemOccurrences.length,
        current_proposed_days: itemOccurrences.map((row) => row.planned_day),
        preferred_days_from_plan: item?.scheduled_days ?? [],
        activation_condition: item?.activation_condition ?? null,
      };
    });

  return JSON.stringify({
    week_start_date: planning.week_start_date,
    week_end_date: planning.week_end_date,
    items,
  });
}

const SYSTEM_PROMPT =
  `Tu organises uniquement les jours d'une petite semaine d'actions Sophia.

Objectif: produire une semaine qui a du sens humainement, avec un minimum de charge et sans tasser toutes les actions au debut.

Regles:
- Garde exactement le nombre de repetitions demande pour chaque item.
- Choisis uniquement parmi mon,tue,wed,thu,fri,sat,sun, sans doublon pour un meme item.
- Repartis les habitudes sur toute la fenetre utile; evite par defaut lundi+mardi+mercredi.
- Une mission de preparation, d'observation ou de choix peut preceder l'habitude qu'elle rend plus intelligente. Exemple: mission lundi, premier essai mercredi, second essai vendredi ou samedi.
- Une mission de bilan ou consolidation peut venir apres les repetitions.
- Respecte les preferred_days_from_plan quand ils expriment une vraie contrainte, ainsi que time_of_day et activation_condition.
- Maximum par jour: une habitude et une action non-habitude.
- Ne change ni le contenu, ni la cadence, ni le nombre d'actions.

Retourne uniquement ce JSON:
{"items":[{"plan_item_id":"id exact","days":["mon"],"reason":"raison courte"}]}`;

function parseRawJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw.replace(/```json|```/gi, "").trim());
}

export function validateWeeklyPlanningAiProposal(params: {
  raw: unknown;
  planning: WeeklyPlanningSnapshot;
  occurrences: WeeklyPlanningOccurrenceRow[];
}): { ok: true; items: AiScheduleItem[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = parseRawJson(params.raw);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid_root" };
  }
  const rawItems = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(rawItems)) return { ok: false, reason: "items_missing" };

  const expectedCounts = new Map<string, number>();
  for (const occurrence of params.occurrences) {
    expectedCounts.set(
      occurrence.plan_item_id,
      (expectedCounts.get(occurrence.plan_item_id) ?? 0) + 1,
    );
  }
  const planByItemId = new Map(
    params.planning.pending_plans.map((plan) => [plan.plan_item_id, plan]),
  );
  const seen = new Set<string>();
  const items: AiScheduleItem[] = [];
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      return { ok: false, reason: "invalid_item" };
    }
    const record = rawItem as Record<string, unknown>;
    const planItemId = cleanText(record.plan_item_id);
    if (!expectedCounts.has(planItemId) || seen.has(planItemId)) {
      return { ok: false, reason: "unknown_or_duplicate_item" };
    }
    const days = Array.isArray(record.days)
      ? record.days.map(cleanText) as DayCode[]
      : [];
    const uniqueDays = [...new Set(days)];
    if (
      uniqueDays.length !== expectedCounts.get(planItemId) ||
      uniqueDays.some((day) => !(DAYS as readonly string[]).includes(day))
    ) {
      return { ok: false, reason: "invalid_days_or_cadence" };
    }
    seen.add(planItemId);
    items.push({
      plan_item_id: planItemId,
      days: uniqueDays.sort((left, right) =>
        DAYS.indexOf(left) - DAYS.indexOf(right)
      ),
      reason: cleanText(record.reason).slice(0, 240),
    });
  }
  if (seen.size !== expectedCounts.size) {
    return { ok: false, reason: "incomplete_items" };
  }

  const loadByDay = new Map<DayCode, { habits: number; other: number }>();
  for (const item of items) {
    const joinedItem = firstJoinedItem(planByItemId.get(item.plan_item_id)!);
    const bucket = cleanText(joinedItem?.dimension) === "habits"
      ? "habits"
      : "other";
    for (const day of item.days) {
      const load = loadByDay.get(day) ?? { habits: 0, other: 0 };
      load[bucket]++;
      loadByDay.set(day, load);
      if (load[bucket] > 1) return { ok: false, reason: "daily_load_exceeded" };
    }
  }

  const scheduledDaysByItemId = new Map(
    items.map((item) => [item.plan_item_id, item.days]),
  );
  for (const item of items) {
    const joinedItem = firstJoinedItem(planByItemId.get(item.plan_item_id)!);
    const condition = joinedItem?.activation_condition;
    const conditionType = cleanText(condition?.type);
    if (
      conditionType !== "after_item_completion" &&
      conditionType !== "after_milestone"
    ) continue;
    const rawDependencies = condition?.depends_on;
    const dependencyIds = (Array.isArray(rawDependencies)
      ? rawDependencies
      : typeof rawDependencies === "string"
      ? [rawDependencies]
      : []).map(cleanText).filter(Boolean);
    const prerequisiteDays = dependencyIds.flatMap((dependencyId) =>
      scheduledDaysByItemId.get(dependencyId) ?? []
    );
    if (prerequisiteDays.length === 0 || item.days.length === 0) {
      continue;
    }
    const latestPrerequisite = Math.max(
      ...prerequisiteDays.map((day) =>
        DAYS.indexOf(day)
      ),
    );
    const firstDependentDay = Math.min(
      ...item.days.map((day) => DAYS.indexOf(day)),
    );
    if (firstDependentDay <= latestPrerequisite) {
      return { ok: false, reason: "prerequisite_order_invalid" };
    }
  }

  const totalOccurrences = items.reduce(
    (sum, item) => sum + item.days.length,
    0,
  );
  const usedIndexes = items.flatMap((item) =>
    item.days.map((day) => DAYS.indexOf(day))
  );
  if (
    totalOccurrences >= 2 && usedIndexes.length > 0 &&
    Math.max(...usedIndexes) <= DAYS.indexOf("tue")
  ) {
    return { ok: false, reason: "front_loaded_week" };
  }

  return { ok: true, items };
}

export async function optimizePendingWeeklyPlanningWithAi(
  admin: SupabaseClient,
  params: {
    userId: string;
    weekStartDate: string;
    requestId?: string;
    llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
  },
): Promise<WeeklyPlanningAiResult> {
  const planning = await loadActiveWeeklyPlanning(admin, params);
  const pendingItemIds = new Set(
    planning.pending_plans.map((plan) => plan.plan_item_id),
  );
  const hasUserAdjustedOccurrence = planning.occurrences.some((occurrence) =>
    pendingItemIds.has(occurrence.plan_item_id) &&
    cleanText(occurrence.source) !== "default_generated"
  );
  if (hasUserAdjustedOccurrence) {
    return {
      attempted: false,
      applied: false,
      reason: "user_adjusted_schedule_preserved",
      items: [],
    };
  }
  const occurrences = movableOccurrences(planning);
  if (!planning.has_pending || occurrences.length === 0) {
    return {
      attempted: false,
      applied: false,
      reason: "nothing_to_schedule",
      items: [],
    };
  }

  let raw: unknown;
  try {
    const userPrompt = schedulePrompt(planning, occurrences);
    raw = params.llmRunner
      ? await params.llmRunner(SYSTEM_PROMPT, userPrompt)
      : await generateWithGemini(
        SYSTEM_PROMPT,
        userPrompt,
        0.1,
        true,
        [],
        "auto",
        {
          requestId: params.requestId,
          userId: params.userId,
          source: "weekly_planning_auto_scheduler_v1",
          model: getGlobalAiModel(),
          forceInitialModel: true,
          forceRealAi: true,
          maxRetries: 1,
          httpTimeoutMs: 30_000,
          reasoningEffort: "none",
        },
      );
  } catch (error) {
    return {
      attempted: true,
      applied: false,
      reason: `llm_failed:${
        error instanceof Error ? error.message : String(error)
      }`
        .slice(0, 280),
      items: [],
    };
  }

  const proposal = validateWeeklyPlanningAiProposal({
    raw,
    planning,
    occurrences,
  });
  if (!proposal.ok) {
    return {
      attempted: true,
      applied: false,
      reason: proposal.reason,
      items: [],
    };
  }

  const occurrencesByItem = new Map<string, WeeklyPlanningOccurrenceRow[]>();
  for (const occurrence of occurrences) {
    const list = occurrencesByItem.get(occurrence.plan_item_id) ?? [];
    list.push(occurrence);
    occurrencesByItem.set(occurrence.plan_item_id, list);
  }
  const nowIso = new Date().toISOString();
  for (const item of proposal.items) {
    const itemOccurrences = (occurrencesByItem.get(item.plan_item_id) ?? [])
      .slice()
      .sort((left, right) =>
        Number(left.ordinal ?? 0) - Number(right.ordinal ?? 0)
      );
    for (let index = 0; index < itemOccurrences.length; index++) {
      const { error } = await admin
        .from("user_habit_week_occurrences")
        .update({
          planned_day: item.days[index],
          default_day: item.days[index],
          updated_at: nowIso,
        } as any)
        .eq("id", itemOccurrences[index].id)
        .eq("user_id", params.userId)
        .eq("source", "default_generated");
      if (error) throw error;
    }
  }

  return {
    attempted: true,
    applied: true,
    reason: "ai_schedule_applied",
    items: proposal.items,
  };
}
