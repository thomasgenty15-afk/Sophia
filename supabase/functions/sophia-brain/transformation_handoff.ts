import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  buildHandoffPlanItemSnapshot,
  buildHandoffTransformationSnapshot,
  buildPulseSummaryForHandoff,
  buildTransformationHandoffUserPrompt,
  parseTransformationHandoffLLMResponse,
  TRANSFORMATION_HANDOFF_SYSTEM_PROMPT,
  type HandoffPlanItemSnapshot,
  type TransformationHandoffInput,
  type TransformationHandoffPayload,
} from "../_shared/v2-prompts/transformation-handoff.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { getPlanItemRuntime } from "../_shared/v2-runtime.ts";
import { createRendezVous, getRendezVousHistory } from "../_shared/v2-rendez-vous.ts";
import type {
  ConversationPulse,
  UserCycleRow,
  UserMetricRow,
  UserPlanV2Row,
  UserTransformationRow,
  UserVictoryLedgerRow,
} from "../_shared/v2-types.ts";
import {
  loadCoachingInterventionTraceWindow,
  type CoachingTraceWindow,
} from "./lib/coaching_intervention_trace.ts";

type HandoffPayloadRecord = Record<string, unknown> | null;

export type StoredTransformationHandoff = TransformationHandoffPayload & {
  generated_at: string;
  valid: boolean;
  violations: string[];
  questionnaire_context: string[];
  pulse_context: {
    transformation_id: string;
    title: string | null;
    completed_at: string | null;
    wins: string[];
    relational_signals: string[];
    coaching_memory_summary: string;
  };
  mini_recap: {
    next_transformation_title: string | null;
    recap_lines: string[];
  };
};

export type ExecuteTransformationHandoffResult = {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  nextTransformation: UserTransformationRow | null;
  stored: StoredTransformationHandoff;
  persisted: boolean;
  rendezVousCreated: boolean;
  eventWarnings: string[];
};

type LoadedTransformationHandoffContext = {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  nextTransformation: UserTransformationRow | null;
  plan: UserPlanV2Row | null;
  input: TransformationHandoffInput;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asStringArray(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function dedupeStrings(items: string[], max = items.length): string[] {
  return [...new Set(items.map((item) => String(item ?? "").trim()).filter(Boolean))]
    .slice(0, max);
}

function truncateText(value: unknown, maxLen: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function parseNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function eventWarning(eventType: string, error: unknown): string {
  return `Failed to log ${eventType}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function buildPlanItemTitleMaps(
  planItems: HandoffPlanItemSnapshot[],
): {
  byId: Map<string, HandoffPlanItemSnapshot>;
  titleByFailedKey: Map<string, string>;
} {
  const byId = new Map<string, HandoffPlanItemSnapshot>();
  const titleByFailedKey = new Map<string, string>();

  for (const item of planItems) {
    byId.set(item.id, item);
    titleByFailedKey.set(item.id, item.title);
  }

  return { byId, titleByFailedKey };
}

export function buildQuestionnaireContextFromHandoff(args: {
  handoff: TransformationHandoffPayload;
  planItems: HandoffPlanItemSnapshot[];
}): string[] {
  const { byId, titleByFailedKey } = buildPlanItemTitleMaps(args.planItems);
  const context: string[] = [];

  if (args.handoff.wins.length > 0) {
    context.push(
      `Acquis récents à prendre en compte: ${
        args.handoff.wins.slice(0, 2).join(" ; ")
      }.`,
    );
  }

  const supportTitles = args.handoff.supports_to_keep
    .map((id) => byId.get(id)?.title ?? null)
    .filter((title): title is string => !!title)
    .slice(0, 3);
  if (supportTitles.length > 0) {
    context.push(
      `Supports déjà aidants à conserver: ${supportTitles.join(", ")}.`,
    );
  }

  const habitTitles = args.handoff.habits_in_maintenance
    .map((id) => byId.get(id)?.title ?? null)
    .filter((title): title is string => !!title)
    .slice(0, 3);
  if (habitTitles.length > 0) {
    context.push(
      `Habitudes à garder en maintenance: ${habitTitles.join(", ")}.`,
    );
  }

  const failedLabels = args.handoff.techniques_that_failed
    .map((value) => titleByFailedKey.get(value) ?? value)
    .slice(0, 3);
  if (failedLabels.length > 0) {
    context.push(
      `À éviter de reproposer tel quel: ${failedLabels.join(", ")}.`,
    );
  }

  for (const signal of args.handoff.relational_signals.slice(0, 2)) {
    context.push(`Signal relationnel à garder en tête: ${signal}.`);
  }

  const coachingSummary = truncateText(args.handoff.coaching_memory_summary, 220);
  if (coachingSummary) {
    context.push(`Mémoire coaching utile: ${coachingSummary}`);
  }

  return dedupeStrings(context, 6);
}

export function buildMiniRecapFromHandoff(args: {
  handoff: TransformationHandoffPayload;
  planItems: HandoffPlanItemSnapshot[];
  nextTransformationTitle: string | null;
}): string[] {
  const { byId, titleByFailedKey } = buildPlanItemTitleMaps(args.planItems);
  const recap: string[] = [];

  if (args.handoff.wins.length > 0) {
    recap.push(
      `Tu as posé des bases utiles: ${
        args.handoff.wins.slice(0, 2).join(" ; ")
      }.`,
    );
  }

  const supportTitles = args.handoff.supports_to_keep
    .map((id) => byId.get(id)?.title ?? null)
    .filter((title): title is string => !!title)
    .slice(0, 2);
  if (supportTitles.length > 0) {
    recap.push(`On garde comme appui: ${supportTitles.join(", ")}.`);
  }

  if (args.handoff.relational_signals.length > 0) {
    recap.push(
      `Sophia retient aussi: ${args.handoff.relational_signals[0]}.`,
    );
  }

  if (args.nextTransformationTitle) {
    recap.push(
      `La suite pourra s'appuyer là-dessus pour ${args.nextTransformationTitle}.`,
    );
  }

  const failedLabels = args.handoff.techniques_that_failed
    .map((value) => titleByFailedKey.get(value) ?? value)
    .slice(0, 2);
  if (failedLabels.length > 0) {
    recap.push(`On évite de refaire pareil sur: ${failedLabels.join(", ")}.`);
  }

  return dedupeStrings(recap, 4);
}

export function buildCoachingSnapshotsFromTrace(
  trace: CoachingTraceWindow,
): TransformationHandoffInput["coaching_snapshots"] {
  return trace.interventions
    .map((entry) => ({
      technique_key: entry.recommended_technique,
      created_at: entry.proposed_at,
      outcome: asString(
        entry.follow_up?.payload?.follow_up_outcome ??
          entry.follow_up?.payload?.outcome ??
          null,
      ),
    }))
    .filter((entry) => !!entry.created_at)
    .slice(-12);
}

function buildMetricSnapshots(metrics: UserMetricRow[]): TransformationHandoffInput["metrics"] {
  return metrics.map((metric) => ({
    metric_kind: metric.kind,
    label: metric.title,
    current_value: parseNumberOrNull(metric.current_value),
    target_value: parseNumberOrNull(metric.target_value),
  }));
}

function buildStoredTransformationHandoff(args: {
  transformation: UserTransformationRow;
  handoff: TransformationHandoffPayload;
  planItems: HandoffPlanItemSnapshot[];
  nextTransformationTitle: string | null;
  generatedAt: string;
  valid: boolean;
  violations: string[];
}): StoredTransformationHandoff {
  return {
    ...args.handoff,
    generated_at: args.generatedAt,
    valid: args.valid,
    violations: args.violations,
    questionnaire_context: buildQuestionnaireContextFromHandoff({
      handoff: args.handoff,
      planItems: args.planItems,
    }),
    pulse_context: {
      transformation_id: args.transformation.id,
      title: args.transformation.title,
      completed_at: args.transformation.completed_at,
      wins: args.handoff.wins.slice(0, 3),
      relational_signals: args.handoff.relational_signals.slice(0, 3),
      coaching_memory_summary: args.handoff.coaching_memory_summary,
    },
    mini_recap: {
      next_transformation_title: args.nextTransformationTitle,
      recap_lines: buildMiniRecapFromHandoff({
        handoff: args.handoff,
        planItems: args.planItems,
        nextTransformationTitle: args.nextTransformationTitle,
      }),
    },
  };
}

function mergeStoredTransformationHandoff(
  existingPayload: HandoffPayloadRecord,
  stored: StoredTransformationHandoff,
): Record<string, unknown> {
  const base = asRecord(existingPayload) ?? {};
  return {
    ...base,
    transformation_handoff_v2: stored,
  };
}

export function extractStoredTransformationHandoff(
  handoffPayload: HandoffPayloadRecord,
): StoredTransformationHandoff | null {
  const base = asRecord(handoffPayload);
  const raw = asRecord(base?.transformation_handoff_v2);
  if (!raw) return null;

  const wins = asStringArray(raw.wins, 5);
  const supportsToKeep = asStringArray(raw.supports_to_keep, 50);
  const habitsInMaintenance = asStringArray(raw.habits_in_maintenance, 50);
  const techniquesThatFailed = asStringArray(raw.techniques_that_failed, 50);
  const relationalSignals = asStringArray(raw.relational_signals, 3);
  const coachingMemorySummary = asString(raw.coaching_memory_summary) ?? "";
  const generatedAt = asString(raw.generated_at);
  if (!generatedAt) return null;

  const pulseContext = asRecord(raw.pulse_context);
  const miniRecap = asRecord(raw.mini_recap);

  return {
    wins,
    supports_to_keep: supportsToKeep,
    habits_in_maintenance: habitsInMaintenance,
    techniques_that_failed: techniquesThatFailed,
    relational_signals: relationalSignals,
    coaching_memory_summary: coachingMemorySummary,
    generated_at: generatedAt,
    valid: raw.valid === true,
    violations: asStringArray(raw.violations, 20),
    questionnaire_context: asStringArray(raw.questionnaire_context, 8),
    pulse_context: {
      transformation_id:
        asString(pulseContext?.transformation_id) ?? asString(base?.id) ?? "",
      title: asString(pulseContext?.title),
      completed_at: asString(pulseContext?.completed_at),
      wins: asStringArray(pulseContext?.wins, 3),
      relational_signals: asStringArray(pulseContext?.relational_signals, 3),
      coaching_memory_summary:
        asString(pulseContext?.coaching_memory_summary) ?? coachingMemorySummary,
    },
    mini_recap: {
      next_transformation_title: asString(miniRecap?.next_transformation_title),
      recap_lines: asStringArray(miniRecap?.recap_lines, 5),
    },
  };
}

export function extractQuestionnaireContextFromStoredHandoff(
  handoffPayload: HandoffPayloadRecord,
): string[] {
  return extractStoredTransformationHandoff(handoffPayload)?.questionnaire_context ??
    [];
}

export type ConversationPulseHandoffSummary = {
  transformation_id: string;
  title: string | null;
  completed_at: string | null;
  wins: string[];
  relational_signals: string[];
  coaching_memory_summary: string;
  questionnaire_context: string[];
};

export function extractConversationPulseHandoffSummary(
  handoffPayload: HandoffPayloadRecord,
): ConversationPulseHandoffSummary | null {
  const stored = extractStoredTransformationHandoff(handoffPayload);
  if (!stored) return null;
  if (!stored.pulse_context.transformation_id) return null;
  return {
    transformation_id: stored.pulse_context.transformation_id,
    title: stored.pulse_context.title,
    completed_at: stored.pulse_context.completed_at,
    wins: stored.pulse_context.wins,
    relational_signals: stored.pulse_context.relational_signals,
    coaching_memory_summary: stored.pulse_context.coaching_memory_summary,
    questionnaire_context: stored.questionnaire_context,
  };
}

async function loadTransformationHandoffContext(args: {
  supabase: SupabaseClient;
  userId: string;
  transformationId: string;
}): Promise<LoadedTransformationHandoffContext> {
  const { data: transformationData, error: transformationError } = await args
    .supabase
    .from("user_transformations")
    .select("*")
    .eq("id", args.transformationId)
    .maybeSingle();
  if (transformationError) throw transformationError;
  if (!transformationData) {
    throw new Error(`Transformation "${args.transformationId}" not found.`);
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await args.supabase
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (cycleError) throw cycleError;
  if (!cycleData) {
    throw new Error("Cycle not found for this user.");
  }

  const cycle = cycleData as UserCycleRow;
  const completedAt = transformation.completed_at ?? new Date().toISOString();
  const fromIso = transformation.activated_at ?? transformation.created_at;

  const [
    planResult,
    victoriesResult,
    cycleMetricsResult,
    transformationMetricsResult,
    pulseResult,
    nextTransformationResult,
    coachingTrace,
  ] = await Promise.all([
    args.supabase
      .from("user_plans_v2")
      .select("*")
      .eq("cycle_id", transformation.cycle_id)
      .eq("transformation_id", transformation.id)
      .in("status", ["generated", "active", "paused", "completed"] as never)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    args.supabase
      .from("user_victory_ledger")
      .select("*")
      .eq("user_id", args.userId)
      .eq("cycle_id", transformation.cycle_id)
      .eq("transformation_id", transformation.id)
      .order("created_at", { ascending: true })
      .limit(20),
    args.supabase
      .from("user_metrics")
      .select("*")
      .eq("user_id", args.userId)
      .eq("cycle_id", transformation.cycle_id)
      .eq("scope", "cycle")
      .eq("kind", "north_star")
      .in("status", ["active", "paused", "completed"] as never)
      .order("updated_at", { ascending: false })
      .limit(1),
    args.supabase
      .from("user_metrics")
      .select("*")
      .eq("user_id", args.userId)
      .eq("cycle_id", transformation.cycle_id)
      .eq("transformation_id", transformation.id)
      .eq("scope", "transformation")
      .in("kind", ["progress_marker", "support_metric", "custom"] as never)
      .in("status", ["active", "paused", "completed"] as never)
      .order("updated_at", { ascending: false }),
    args.supabase
      .from("system_runtime_snapshots")
      .select("payload")
      .eq("user_id", args.userId)
      .eq("cycle_id", transformation.cycle_id)
      .eq("transformation_id", transformation.id)
      .eq("snapshot_type", "conversation_pulse")
      .lte("created_at", completedAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    args.supabase
      .from("user_transformations")
      .select("*")
      .eq("cycle_id", transformation.cycle_id)
      .gt("priority_order", transformation.priority_order)
      .order("priority_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
    loadCoachingInterventionTraceWindow({
      supabase: args.supabase,
      userId: args.userId,
      from: fromIso,
      to: completedAt,
    }),
  ]);

  if (planResult.error) throw planResult.error;
  if (victoriesResult.error) throw victoriesResult.error;
  if (cycleMetricsResult.error) throw cycleMetricsResult.error;
  if (transformationMetricsResult.error) throw transformationMetricsResult.error;
  if (pulseResult.error) throw pulseResult.error;
  if (nextTransformationResult.error) throw nextTransformationResult.error;

  const plan = (planResult.data as UserPlanV2Row | null) ?? null;
  const planItemsRuntime = plan
    ? await getPlanItemRuntime(args.supabase, plan.id, {
      maxEntriesPerItem: Number.MAX_SAFE_INTEGER,
    })
    : [];

  const planItems = planItemsRuntime.map((item) =>
    buildHandoffPlanItemSnapshot(item as unknown as Record<string, unknown>, [
      ...item.recent_entries,
    ] as unknown as Array<Record<string, unknown>>)
  );
  const victories = ((victoriesResult.data as UserVictoryLedgerRow[] | null) ?? [])
    .map((row) => ({
      title: row.title,
      created_at: row.created_at,
    }));
  const metrics = buildMetricSnapshots([
    ...((cycleMetricsResult.data as UserMetricRow[] | null) ?? []),
    ...((transformationMetricsResult.data as UserMetricRow[] | null) ?? []),
  ]);
  const pulse = asRecord((pulseResult.data as { payload?: unknown } | null)?.payload) as
    | ConversationPulse
    | null;
  const nextTransformation =
    (nextTransformationResult.data as UserTransformationRow | null) ?? null;

  return {
    cycle,
    transformation,
    nextTransformation,
    plan,
    input: {
      transformation: buildHandoffTransformationSnapshot(transformation),
      plan_items: planItems,
      victories,
      coaching_snapshots: buildCoachingSnapshotsFromTrace(coachingTrace),
      metrics,
      pulse_summary: buildPulseSummaryForHandoff(pulse),
    },
  };
}

async function generateStoredTransformationHandoff(args: {
  requestId?: string;
  userId: string;
  context: LoadedTransformationHandoffContext;
  model?: string;
  nowIso: string;
}): Promise<StoredTransformationHandoff> {
  const raw = await generateWithGemini(
    TRANSFORMATION_HANDOFF_SYSTEM_PROMPT.trim(),
    buildTransformationHandoffUserPrompt(args.context.input).trim(),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: args.requestId
        ? `${args.requestId}:transformation-handoff`
        : undefined,
      userId: args.userId,
      source: "transformation_handoff",
      model:
        (args.model ?? Deno.env.get("TRANSFORMATION_HANDOFF_MODEL") ??
          getGlobalAiModel("gemini-2.5-flash")).trim() || "gemini-2.5-flash",
    },
  );

  const rawText = typeof raw === "string"
    ? raw
    : JSON.stringify((raw as any)?.args ?? raw);
  const validation = parseTransformationHandoffLLMResponse(
    rawText,
    args.context.input,
  );

  return buildStoredTransformationHandoff({
    transformation: args.context.transformation,
    handoff: validation.payload,
    planItems: args.context.input.plan_items,
    nextTransformationTitle: args.context.nextTransformation?.title ?? null,
    generatedAt: args.nowIso,
    valid: validation.valid,
    violations: validation.valid ? [] : validation.violations,
  });
}

async function persistStoredTransformationHandoff(args: {
  supabase: SupabaseClient;
  transformation: UserTransformationRow;
  stored: StoredTransformationHandoff;
  nowIso: string;
}): Promise<UserTransformationRow> {
  const patch = {
    handoff_payload: mergeStoredTransformationHandoff(
      args.transformation.handoff_payload,
      args.stored,
    ),
    updated_at: args.nowIso,
  } satisfies Partial<UserTransformationRow>;

  const { data, error } = await args.supabase
    .from("user_transformations")
    .update(patch as never)
    .eq("id", args.transformation.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("Failed to persist transformation handoff payload.");
  }
  return data as UserTransformationRow;
}

async function tryLogTransformationHandoffGenerated(args: {
  supabase: SupabaseClient;
  userId: string;
  cycleId: string;
  transformationId: string;
  stored: StoredTransformationHandoff;
}): Promise<string | null> {
  try {
    await logV2Event(args.supabase, V2_EVENT_TYPES.TRANSFORMATION_HANDOFF_GENERATED, {
      user_id: args.userId,
      cycle_id: args.cycleId,
      transformation_id: args.transformationId,
      reason: "transformation_completed",
      metadata: {
        valid: args.stored.valid,
        wins_count: args.stored.wins.length,
        supports_count: args.stored.supports_to_keep.length,
        habits_count: args.stored.habits_in_maintenance.length,
        failed_techniques_count: args.stored.techniques_that_failed.length,
        validation_violations: args.stored.violations,
      },
    });
    return null;
  } catch (error) {
    return eventWarning(V2_EVENT_TYPES.TRANSFORMATION_HANDOFF_GENERATED, error);
  }
}

async function ensureTransitionHandoffRendezVous(args: {
  supabase: SupabaseClient;
  userId: string;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  nextTransformation: UserTransformationRow | null;
  stored: StoredTransformationHandoff;
  nowIso: string;
}): Promise<boolean> {
  if (!args.nextTransformation) return false;

  const existing = await getRendezVousHistory(args.supabase, args.userId, {
    transformationId: args.transformation.id,
    kind: "transition_handoff",
    limit: 1,
  });
  if (existing.length > 0) return false;

  const recapLines = args.stored.mini_recap.recap_lines.length > 0
    ? args.stored.mini_recap.recap_lines
    : [
      `Transformation terminée: ${args.transformation.title ?? "étape précédente"}.`,
    ];

  await createRendezVous(
    args.supabase,
    {
      user_id: args.userId,
      cycle_id: args.cycle.id,
      transformation_id: args.transformation.id,
      kind: "transition_handoff",
      budget_class: "notable",
      trigger_reason:
        recapLines[0] ??
        "Partager un mini recap et ouvrir la transformation suivante.",
      confidence: "high",
      scheduled_for: args.nowIso,
      posture: "supportive",
      source_refs: {
        transformation_handoff: {
          previous_transformation_id: args.transformation.id,
          previous_transformation_title: args.transformation.title,
          next_transformation_id: args.nextTransformation.id,
          next_transformation_title: args.nextTransformation.title,
          recap_lines: recapLines,
          wins: args.stored.wins.slice(0, 3),
          relational_signals: args.stored.relational_signals.slice(0, 3),
          coaching_memory_summary: truncateText(
            args.stored.coaching_memory_summary,
            280,
          ),
        },
      },
    },
    {
      nowIso: args.nowIso,
      eventMetadata: {
        source: "transformation_handoff",
        previous_transformation_id: args.transformation.id,
        next_transformation_id: args.nextTransformation.id,
      },
    },
  );

  return true;
}

function assertTransformationCanGenerateHandoff(
  transformation: UserTransformationRow,
): void {
  if (transformation.status !== "completed") {
    throw new Error(
      `Transformation status ${transformation.status} cannot generate a handoff.`,
    );
  }
  if (!transformation.completed_at) {
    throw new Error("Completed transformation requires completed_at.");
  }
}

export async function executeTransformationHandoff(
  supabase: SupabaseClient,
  userId: string,
  transformationId: string,
  options: {
    requestId?: string;
    nowIso?: string;
    model?: string;
  } = {},
): Promise<ExecuteTransformationHandoffResult> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const context = await loadTransformationHandoffContext({
    supabase,
    userId,
    transformationId,
  });
  assertTransformationCanGenerateHandoff(context.transformation);

  let transformation = context.transformation;
  let stored = extractStoredTransformationHandoff(transformation.handoff_payload);
  let persisted = false;
  const eventWarnings: string[] = [];

  if (!stored) {
    stored = await generateStoredTransformationHandoff({
      requestId: options.requestId,
      userId,
      context,
      model: options.model,
      nowIso,
    });
    transformation = await persistStoredTransformationHandoff({
      supabase,
      transformation,
      stored,
      nowIso,
    });
    persisted = true;

    const warning = await tryLogTransformationHandoffGenerated({
      supabase,
      userId,
      cycleId: context.cycle.id,
      transformationId: transformation.id,
      stored,
    });
    if (warning) eventWarnings.push(warning);
  }

  const rendezVousCreated = await ensureTransitionHandoffRendezVous({
    supabase,
    userId,
    cycle: context.cycle,
    transformation,
    nextTransformation: context.nextTransformation,
    stored,
    nowIso,
  });

  return {
    cycle: context.cycle,
    transformation,
    nextTransformation: context.nextTransformation,
    stored,
    persisted,
    rendezVousCreated,
    eventWarnings,
  };
}
