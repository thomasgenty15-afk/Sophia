import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini } from "./gemini.ts";
import { z } from "./http.ts";
import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";
import {
  buildUnifiedIntakeUserPrompt,
  UNIFIED_INTAKE_SYSTEM_PROMPT,
  type UnifiedIntakeOutput,
} from "./v2-prompts/intake_to_transformations.ts";
import type {
  UserCycleRow,
  UserTransformationAspectRow,
  UserTransformationRow,
} from "./v2-types.ts";

const UNIFIED_INTAKE_OUTPUT_SCHEMA = z.object({
  aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().min(1),
    source_rank: z.number().int().min(1),
  })).max(15),
  deferred_aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().min(1),
    source_rank: z.number().int().min(1),
    deferred_reason: z.enum([
      "not_priority_now",
      "later_cycle",
      "out_of_scope",
      "user_choice",
      "unclear",
    ]).catch("unclear"),
  })).max(10),
  uncertain_aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().min(1),
    source_rank: z.number().int().min(1),
    uncertainty_level: z.enum(["low", "medium", "high"]).catch("medium"),
    uncertainty_reason: z.string().min(1),
  })).max(5),
  transformations: z.array(z.object({
    source_group_index: z.number().int().min(1),
    group_label: z.string().min(1),
    aspect_ranks: z.array(z.number().int().min(1)).min(1),
    title: z.string().min(1),
    internal_summary: z.string().min(1),
    user_summary: z.string().min(1),
    questionnaire_context: z.array(z.string().min(1)).min(3).max(5),
    recommended_progress_indicator: z.string().min(1),
    recommended_order: z.number().int().min(1),
    ordering_rationale: z.string().min(1),
  })).max(6),
  needs_clarification: z.boolean().optional().default(false),
  clarification_prompt: z.string().nullable().optional().default(null),
}).superRefine((value, ctx) => {
  const activeRanks = new Set<number>();
  for (const aspect of value.aspects) {
    if (activeRanks.has(aspect.source_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate active source_rank ${aspect.source_rank}`,
        path: ["aspects"],
      });
    }
    activeRanks.add(aspect.source_rank);
  }

  const deferredRanks = new Set<number>();
  for (const aspect of value.deferred_aspects) {
    if (deferredRanks.has(aspect.source_rank) || activeRanks.has(aspect.source_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid deferred source_rank ${aspect.source_rank}`,
        path: ["deferred_aspects"],
      });
    }
    deferredRanks.add(aspect.source_rank);
  }

  if (value.needs_clarification) {
    if (!String(value.clarification_prompt ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clarification_prompt is required when needs_clarification is true",
        path: ["clarification_prompt"],
      });
    }
    return;
  }

  if (value.aspects.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one active aspect is required",
      path: ["aspects"],
    });
  }
  if (value.transformations.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one transformation is required",
      path: ["transformations"],
    });
  }

  const usedRanks = new Set<number>();
  const orders = new Set<number>();
  const sourceIndexes = new Set<number>();
  const transformationCount = value.transformations.length;
  for (const transformation of value.transformations) {
    if (transformation.source_group_index > transformationCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `source_group_index ${transformation.source_group_index} exceeds transformations count ${transformationCount}`,
        path: ["transformations"],
      });
    }
    if (sourceIndexes.has(transformation.source_group_index)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate source_group_index ${transformation.source_group_index}`,
        path: ["transformations"],
      });
    }
    sourceIndexes.add(transformation.source_group_index);

    if (orders.has(transformation.recommended_order)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate recommended_order ${transformation.recommended_order}`,
        path: ["transformations"],
      });
    }
    if (transformation.recommended_order > transformationCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `recommended_order ${transformation.recommended_order} exceeds transformations count ${transformationCount}`,
        path: ["transformations"],
      });
    }
    orders.add(transformation.recommended_order);

    for (const rank of transformation.aspect_ranks) {
      if (!activeRanks.has(rank)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown active aspect rank ${rank}`,
          path: ["transformations"],
        });
      }
      if (usedRanks.has(rank)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Aspect rank ${rank} assigned to multiple transformations`,
          path: ["transformations"],
        });
      }
      usedRanks.add(rank);
    }
  }

  for (const rank of activeRanks) {
    if (!usedRanks.has(rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Active aspect rank ${rank} is not assigned to any transformation`,
        path: ["transformations"],
      });
    }
  }
});

export class UnifiedIntakeError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnifiedIntakeError";
    this.status = status;
  }
}

export async function previewUnifiedIntake(params: {
  requestId: string;
  userId?: string | null;
  rawIntakeText: string;
}): Promise<UnifiedIntakeOutput> {
  const raw = await generateUnifiedIntakeWithLlm({
    requestId: params.requestId,
    userId: params.userId ?? null,
    rawIntakeText: params.rawIntakeText,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "intake_unified_preview",
    request_id: params.requestId,
    output_length: raw.length,
    at: new Date().toISOString(),
  }));
  const output = parseUnifiedIntakeOutput(raw);
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "intake_unified_preview",
    request_id: params.requestId,
    needs_clarification: output.needs_clarification,
    aspects_count: output.aspects.length,
    deferred_aspects_count: output.deferred_aspects.length,
    transformations_count: output.transformations.length,
    at: new Date().toISOString(),
  }));
  return output;
}

export async function materializeUnifiedIntakeForCycle(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  rawIntakeText: string;
  cycleId: string | null;
}): Promise<{
  cycle: UserCycleRow;
  output: UnifiedIntakeOutput;
  transformations: UserTransformationRow[];
  eventWarnings: string[];
}> {
  const now = new Date().toISOString();
  const cycleContext = await loadOrCreateCycle({
    admin: params.admin,
    userId: params.userId,
    cycleId: params.cycleId,
    rawIntakeText: params.rawIntakeText,
    now,
  });
  await assertCycleCanBeRebuilt(params.admin, cycleContext.cycle.id);

  const raw = await generateUnifiedIntakeWithLlm({
    requestId: params.requestId,
    userId: params.userId,
    rawIntakeText: params.rawIntakeText,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "intake_unified",
    request_id: params.requestId,
    output_length: raw.length,
    at: new Date().toISOString(),
  }));
  const output = parseUnifiedIntakeOutput(raw);
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "intake_unified",
    request_id: params.requestId,
    needs_clarification: output.needs_clarification,
    aspects_count: output.aspects.length,
    deferred_aspects_count: output.deferred_aspects.length,
    transformations_count: output.transformations.length,
    at: new Date().toISOString(),
  }));

  const structurePayload = buildStructurePayload(output, now);
  const nextStatus = output.needs_clarification ? "clarification_needed" : "prioritized";

  const { error: deleteAspectsError } = await params.admin
    .from("user_transformation_aspects")
    .delete()
    .eq("cycle_id", cycleContext.cycle.id);
  if (deleteAspectsError) {
    throw new UnifiedIntakeError(500, "Failed to clear previous cycle aspects", {
      cause: deleteAspectsError,
    });
  }

  const { data: existingTransformations, error: existingTransformationsError } = await params.admin
    .from("user_transformations")
    .select("*")
    .eq("cycle_id", cycleContext.cycle.id);
  if (existingTransformationsError) {
    throw new UnifiedIntakeError(500, "Failed to load existing transformations", {
      cause: existingTransformationsError,
    });
  }
  const lockedTransformation = ((existingTransformations ?? []) as UserTransformationRow[]).find((row) =>
    row.status === "active" ||
    row.status === "completed" ||
    row.status === "abandoned" ||
    row.status === "cancelled" ||
    row.status === "archived" ||
    row.questionnaire_schema !== null ||
    row.questionnaire_answers !== null ||
    row.activated_at !== null ||
    row.completed_at !== null
  );
  if (lockedTransformation) {
    throw new UnifiedIntakeError(
      409,
      "Cycle transformations are already engaged downstream and cannot be replaced",
    );
  }
  if ((existingTransformations ?? []).length > 0) {
    const { error: deleteTransformationsError } = await params.admin
      .from("user_transformations")
      .delete()
      .eq("cycle_id", cycleContext.cycle.id);
    if (deleteTransformationsError) {
      throw new UnifiedIntakeError(500, "Failed to replace previous transformations", {
        cause: deleteTransformationsError,
      });
    }
  }

  const aspectRows = buildAspectRows({
    cycleId: cycleContext.cycle.id,
    output,
    now,
  });
  if (aspectRows.length > 0) {
    const { error: insertAspectsError } = await params.admin
      .from("user_transformation_aspects")
      .insert(aspectRows as any);
    if (insertAspectsError) {
      throw new UnifiedIntakeError(500, "Failed to persist transformation aspects", {
        cause: insertAspectsError,
      });
    }
  }

  let insertedTransformations: UserTransformationRow[] = [];
  if (!output.needs_clarification) {
    const transformationRows = buildTransformationRows({
      cycleId: cycleContext.cycle.id,
      output,
      now,
    });
    const { data, error } = await params.admin
      .from("user_transformations")
      .insert(transformationRows as any)
      .select("*");
    if (error) {
      throw new UnifiedIntakeError(
        500,
        `Failed to persist transformations: ${error.message}`,
        {
        cause: error,
      });
    }
    insertedTransformations = (data ?? []) as UserTransformationRow[];

    const insertedBySourceIndex = new Map<number, UserTransformationRow>();
    for (const row of insertedTransformations) {
      const sourceGroupIndex = Number(
        (row.handoff_payload?.onboarding_v2 as
          | { source_group_index?: unknown }
          | undefined)?.source_group_index,
      );
      if (Number.isFinite(sourceGroupIndex)) {
        insertedBySourceIndex.set(sourceGroupIndex, row);
      }
    }

    const aspectByRank = new Map<number, UserTransformationAspectRow>(
      aspectRows
        .filter((row) => row.status === "active" && row.source_rank != null)
        .map((row) => [row.source_rank as number, row]),
    );
    for (const transformation of output.transformations) {
      const inserted = insertedBySourceIndex.get(transformation.source_group_index);
      if (!inserted) continue;
      for (const rank of transformation.aspect_ranks) {
        const aspect = aspectByRank.get(rank);
        if (!aspect) continue;
        const { error } = await params.admin
          .from("user_transformation_aspects")
          .update({
            transformation_id: inserted.id,
            status: "active",
            metadata: {
              ...(isRecord(aspect.metadata) ? aspect.metadata : {}),
              crystallized_group_label: transformation.group_label,
              crystallized_at: now,
            },
            updated_at: now,
          } as any)
          .eq("id", aspect.id);
        if (error) {
          throw new UnifiedIntakeError(500, "Failed to assign aspects to transformations", {
            cause: error,
          });
        }
      }
    }
  }

  const activeTransformationId = !output.needs_clarification
    ? insertedTransformations.find((row) => row.priority_order === 1)?.id ?? null
    : null;

  const cyclePatch = {
    raw_intake_text: params.rawIntakeText,
    status: nextStatus,
    validated_structure: structurePayload,
    active_transformation_id: activeTransformationId,
    updated_at: now,
  } satisfies Partial<UserCycleRow>;
  const { error: updateCycleError } = await params.admin
    .from("user_cycles")
    .update(cyclePatch as any)
    .eq("id", cycleContext.cycle.id);
  if (updateCycleError) {
    throw new UnifiedIntakeError(500, "Failed to update cycle", {
      cause: updateCycleError,
    });
  }

  const eventWarnings: string[] = [];
  if (cycleContext.createdCycle) {
    try {
      await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_CREATED, {
        user_id: params.userId,
        cycle_id: cycleContext.cycle.id,
        reason: "intake_unified_started",
        metadata: { source: "intake-to-transformations-v2" },
      });
    } catch (error) {
      eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_CREATED, error));
    }
  }
  try {
    await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_STRUCTURED, {
      user_id: params.userId,
      cycle_id: cycleContext.cycle.id,
      reason: output.needs_clarification ? "clarification_needed" : "unified_materialized",
      metadata: {
        source: "intake-to-transformations-v2",
        aspects_count: output.aspects.length,
        transformations_count: output.transformations.length,
      },
    });
  } catch (error) {
    eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_STRUCTURED, error));
  }
  if (!output.needs_clarification) {
    try {
      await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_PRIORITIZED, {
        user_id: params.userId,
        cycle_id: cycleContext.cycle.id,
        reason: "unified_materialized",
        metadata: {
          source: "intake-to-transformations-v2",
          transformations_count: output.transformations.length,
        },
      });
    } catch (error) {
      eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_PRIORITIZED, error));
    }
  }

  return {
    cycle: { ...cycleContext.cycle, ...cyclePatch },
    output,
    transformations: insertedTransformations.sort((a, b) => a.priority_order - b.priority_order),
    eventWarnings,
  };
}

async function generateUnifiedIntakeWithLlm(params: {
  requestId: string;
  userId: string | null;
  rawIntakeText: string;
}): Promise<string> {
  const raw = await generateWithGemini(
    UNIFIED_INTAKE_SYSTEM_PROMPT,
    buildUnifiedIntakeUserPrompt(params.rawIntakeText),
    0.25,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:intake-unified-v2`,
      source: "intake-to-transformations-v2",
      ...(params.userId ? { userId: params.userId } : {}),
      model: "gemini-3.1-pro-preview",
      fallbackModel: "gemini-3-flash-preview",
      timeoutOverrides: {
        "gemini-3.1-pro-preview": 70_000,
        "gemini-3-flash-preview": 60_000,
      },
      maxRetries: 1,
      forceInitialModel: true,
      disableFallbackChain: false,
    },
  );

  if (typeof raw !== "string") {
    throw new UnifiedIntakeError(
      500,
      "LLM returned a tool call instead of unified intake JSON",
    );
  }
  return raw;
}

function parseUnifiedIntakeOutput(raw: string): UnifiedIntakeOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UnifiedIntakeError(500, "LLM returned invalid JSON", { cause: error });
  }
  const result = UNIFIED_INTAKE_OUTPUT_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      `${issue.path.join(".") || "root"}: ${issue.message}`
    );
    throw new UnifiedIntakeError(
      500,
      `Unified intake output failed validation: ${issues.join("; ")}`,
    );
  }
  return result.data as UnifiedIntakeOutput;
}

function buildStructurePayload(output: UnifiedIntakeOutput, now: string): Record<string, unknown> {
  return {
    version: 1,
    stage: output.needs_clarification ? "clarification_needed" : "validated",
    analyzed_at: now,
    validated_at: now,
    provisional_groups: output.transformations.map((transformation) => ({
      group_label: transformation.group_label,
      grouping_rationale: transformation.ordering_rationale,
      aspect_ranks: transformation.aspect_ranks,
    })),
    validated_groups: output.transformations.map((transformation) => ({
      group_label: transformation.group_label,
      aspects: transformation.aspect_ranks.map((rank) => {
        const aspect = output.aspects.find((item) => item.source_rank === rank);
        return {
          label: aspect?.label ?? `Aspect ${rank}`,
          raw_excerpt: aspect?.raw_excerpt ?? null,
          source_rank: rank,
        };
      }),
    })),
    deferred_aspects: output.deferred_aspects,
    uncertain_aspects: output.uncertain_aspects,
    clarification_prompt: output.clarification_prompt,
    needs_clarification: output.needs_clarification,
    transformation_previews: output.transformations.map((transformation) => ({
      source_group_index: transformation.source_group_index,
      title: transformation.title,
      recommended_order: transformation.recommended_order,
      recommended_progress_indicator: transformation.recommended_progress_indicator,
    })),
  };
}

function buildAspectRows(params: {
  cycleId: string;
  output: UnifiedIntakeOutput;
  now: string;
}): UserTransformationAspectRow[] {
  const uncertainByRank = new Map(
    params.output.uncertain_aspects.map((aspect) => [aspect.source_rank, aspect]),
  );

  const activeRows = params.output.aspects.map((aspect) => {
    const uncertain = uncertainByRank.get(aspect.source_rank);
    return {
      id: crypto.randomUUID(),
      cycle_id: params.cycleId,
      transformation_id: null,
      label: aspect.label,
      raw_excerpt: aspect.raw_excerpt,
      status: "active",
      uncertainty_level: uncertain?.uncertainty_level ?? "low",
      deferred_reason: null,
      source_rank: aspect.source_rank,
      metadata: uncertain ? { uncertainty_reason: uncertain.uncertainty_reason } : {},
      created_at: params.now,
      updated_at: params.now,
    } satisfies UserTransformationAspectRow;
  });

  const deferredRows = params.output.deferred_aspects.map((aspect) => ({
    id: crypto.randomUUID(),
    cycle_id: params.cycleId,
    transformation_id: null,
    label: aspect.label,
    raw_excerpt: aspect.raw_excerpt,
    status: "deferred",
    uncertainty_level: "low",
    deferred_reason: aspect.deferred_reason,
    source_rank: aspect.source_rank,
    metadata: {},
    created_at: params.now,
    updated_at: params.now,
  } satisfies UserTransformationAspectRow));

  return [...activeRows, ...deferredRows];
}

function buildTransformationRows(params: {
  cycleId: string;
  output: UnifiedIntakeOutput;
  now: string;
}): UserTransformationRow[] {
  return params.output.transformations.map((transformation) => ({
    id: crypto.randomUUID(),
    cycle_id: params.cycleId,
    priority_order: transformation.recommended_order,
    status: transformation.recommended_order === 1 ? "ready" : "pending",
    title: transformation.title,
    internal_summary: transformation.internal_summary,
    user_summary: transformation.user_summary,
    success_definition: null,
    main_constraint: null,
    questionnaire_schema: null,
    questionnaire_answers: null,
    completion_summary: null,
    base_de_vie_payload: null,
    unlocked_principles: { kaizen: true },
    handoff_payload: {
      onboarding_v2: {
        source_group_index: transformation.source_group_index,
        group_label: transformation.group_label,
        questionnaire_context: transformation.questionnaire_context,
        recommended_order: transformation.recommended_order,
        recommended_progress_indicator: transformation.recommended_progress_indicator,
        ordering_rationale: transformation.ordering_rationale,
      },
    },
    created_at: params.now,
    updated_at: params.now,
    activated_at: null,
    completed_at: null,
  }));
}

async function loadOrCreateCycle(params: {
  admin: SupabaseClient;
  userId: string;
  cycleId: string | null;
  rawIntakeText: string;
  now: string;
}): Promise<{ cycle: UserCycleRow; createdCycle: boolean }> {
  if (!params.cycleId) {
    const cycleRow = {
      user_id: params.userId,
      status: "draft",
      raw_intake_text: params.rawIntakeText,
      intake_language: null,
      validated_structure: null,
      duration_months: null,
      birth_date_snapshot: null,
      gender_snapshot: null,
      requested_pace: null,
      active_transformation_id: null,
      version: 1,
      completed_at: null,
      archived_at: null,
      created_at: params.now,
      updated_at: params.now,
    } satisfies Partial<UserCycleRow>;

    const { data, error } = await params.admin
      .from("user_cycles")
      .insert(cycleRow as any)
      .select("*")
      .single();
    if (error) {
      throw new UnifiedIntakeError(500, "Failed to create cycle", { cause: error });
    }

    return { cycle: data as UserCycleRow, createdCycle: true };
  }

  const { data, error } = await params.admin
    .from("user_cycles")
    .select("*")
    .eq("id", params.cycleId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) {
    throw new UnifiedIntakeError(500, "Failed to load cycle", { cause: error });
  }
  if (!data) {
    throw new UnifiedIntakeError(404, "Cycle not found for this user");
  }
  const cycle = data as UserCycleRow;
  if (!["draft", "clarification_needed", "structured", "prioritized"].includes(cycle.status)) {
    throw new UnifiedIntakeError(409, `Cycle status ${cycle.status} cannot be rebuilt`);
  }
  return { cycle, createdCycle: false };
}

async function assertCycleCanBeRebuilt(
  admin: SupabaseClient,
  cycleId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("user_plans_v2")
    .select("id")
    .eq("cycle_id", cycleId)
    .limit(1);
  if (error) {
    throw new UnifiedIntakeError(500, "Failed to verify existing plans", { cause: error });
  }
  if ((data ?? []).length > 0) {
    throw new UnifiedIntakeError(409, "Cycle already has V2 plans and cannot be rebuilt");
  }
}

function eventWarning(eventType: string, error: unknown): string {
  return `Failed to log ${eventType}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
