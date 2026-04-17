import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini } from "./gemini.ts";
import {
  buildCristallisationUserPrompt,
  CRISTALLISATION_SYSTEM_PROMPT,
  type CristallisationInput,
  type CristallisationOutput,
} from "./v2-prompts/cristallisation.ts";
import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";
import type {
  UserCycleRow,
  UserTransformationAspectRow,
  UserTransformationRow,
} from "./v2-types.ts";
import { z } from "./http.ts";

const VALIDATED_GROUP_SCHEMA = z.object({
  group_label: z.string().min(1),
  aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().nullable().optional(),
    source_rank: z.number().int().min(1).nullable().optional(),
  })).min(1),
});

const CRISTALLISATION_OUTPUT_SCHEMA = z.object({
  transformations: z.array(z.object({
    source_group_index: z.number().int().min(1),
    title: z.string().min(1),
    internal_summary: z.string().min(1),
    user_summary: z.string().min(1),
    questionnaire_context: z.array(z.string().min(1)).min(3).max(5),
    recommended_progress_indicator: z.string().min(1),
    recommended_order: z.number().int().min(1),
    ordering_rationale: z.string().min(1),
  })).min(1).max(6),
});

type ValidatedAspectInput = z.infer<
  typeof VALIDATED_GROUP_SCHEMA
>["aspects"][number];

export type ValidatedGroupInput = z.infer<typeof VALIDATED_GROUP_SCHEMA>;

type MaterializationContext = {
  cycle: UserCycleRow;
  aspects: UserTransformationAspectRow[];
  existingTransformations: UserTransformationRow[];
};

export class TransformationMaterializationError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransformationMaterializationError";
    this.status = status;
  }
}

export async function materializeTransformationsForCycle(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  cycleId: string;
  validatedGroups: ValidatedGroupInput[];
}): Promise<{
  cycle: UserCycleRow;
  transformations: UserTransformationRow[];
  eventWarnings: string[];
}> {
  const now = new Date().toISOString();
  const context = await loadMaterializationContext(
    params.admin,
    params.userId,
    params.cycleId,
  );
  assertCycleCanBeMaterialized(context);

  const matching = resolveValidatedGroupsToAspects(
    context.aspects,
    params.validatedGroups,
  );

  await assertNoPlansExistForCycle(params.admin, params.cycleId);

  const promptInput = buildCristallisationInput(
    context.cycle,
    params.validatedGroups,
    context.aspects,
  );
  const rawOutput = await generateTransformationMaterializationWithLlm({
    requestId: params.requestId,
    userId: params.userId,
    input: promptInput,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "transformation_materialization",
    request_id: params.requestId,
    output_length: rawOutput.length,
    at: new Date().toISOString(),
  }));
  const output = parseTransformationMaterializationOutput(
    rawOutput,
    params.validatedGroups.length,
  );
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "transformation_materialization",
    request_id: params.requestId,
    transformations_count: output.transformations.length,
    expected_groups_count: params.validatedGroups.length,
    at: new Date().toISOString(),
  }));

  if (context.existingTransformations.length > 0) {
    const { error: deleteTransformationsError } = await params.admin
      .from("user_transformations")
      .delete()
      .eq("cycle_id", params.cycleId);
    if (deleteTransformationsError) {
      throw new TransformationMaterializationError(
        500,
        "Failed to replace previous transformations",
        { cause: deleteTransformationsError },
      );
    }
  }

  const transformationRows = buildTransformationRows({
    cycleId: params.cycleId,
    output,
    now,
  });

  const { data: insertedTransformations, error: insertTransformationsError } =
    await params.admin
      .from("user_transformations")
      .insert(transformationRows as any)
      .select("*");
  if (insertTransformationsError) {
    throw new TransformationMaterializationError(
      500,
      "Failed to persist transformations",
      { cause: insertTransformationsError },
    );
  }

  const insertedBySourceIndex = new Map<number, UserTransformationRow>();
  for (const row of (insertedTransformations ?? []) as UserTransformationRow[]) {
    const sourceGroupIndex = Number(
      (row.handoff_payload?.onboarding_v2 as
        | { source_group_index?: unknown }
        | undefined)?.source_group_index,
    );
    if (Number.isFinite(sourceGroupIndex)) {
      insertedBySourceIndex.set(sourceGroupIndex, row);
    }
  }

  const groupedAspectIds = new Set<string>();
  for (const match of matching) {
    const transformation = insertedBySourceIndex.get(match.sourceGroupIndex);
    if (!transformation) {
      throw new TransformationMaterializationError(
        500,
        `Missing inserted transformation for validated group ${match.sourceGroupIndex}`,
      );
    }

    for (const aspect of match.aspectRows) {
      groupedAspectIds.add(aspect.id);
      const { error } = await params.admin
        .from("user_transformation_aspects")
        .update({
          transformation_id: transformation.id,
          status: "active",
          metadata: {
            ...(isRecord(aspect.metadata) ? aspect.metadata : {}),
            crystallized_group_label: match.group.group_label,
            crystallized_at: now,
          },
          updated_at: now,
        } as any)
        .eq("id", aspect.id);
      if (error) {
        throw new TransformationMaterializationError(
          500,
          "Failed to update aspect assignments",
          { cause: error },
        );
      }
    }
  }

  for (const aspect of context.aspects) {
    if (aspect.status !== "active") continue;
    if (groupedAspectIds.has(aspect.id)) continue;
    const { error } = await params.admin
      .from("user_transformation_aspects")
      .update({
        transformation_id: null,
        status: "rejected",
        metadata: {
          ...(isRecord(aspect.metadata) ? aspect.metadata : {}),
          rejected_during_crystallization: true,
          rejected_at: now,
        },
        updated_at: now,
      } as any)
      .eq("id", aspect.id);
    if (error) {
      throw new TransformationMaterializationError(
        500,
        "Failed to update aspect assignments",
        { cause: error },
      );
    }
  }

  const structurePayload = {
    ...(isRecord(context.cycle.validated_structure)
      ? context.cycle.validated_structure
      : {}),
    stage: "validated",
    validated_at: now,
    validated_groups: params.validatedGroups,
    transformation_previews: output.transformations.map((transformation) => ({
      source_group_index: transformation.source_group_index,
      title: transformation.title,
      recommended_order: transformation.recommended_order,
      recommended_progress_indicator:
        transformation.recommended_progress_indicator,
    })),
  } satisfies Record<string, unknown>;

  const cyclePatch = {
    status: "prioritized",
    validated_structure: structurePayload,
    updated_at: now,
  } satisfies Partial<UserCycleRow>;
  const { error: updateCycleError } = await params.admin
    .from("user_cycles")
    .update(cyclePatch as any)
    .eq("id", params.cycleId);
  if (updateCycleError) {
    throw new TransformationMaterializationError(
      500,
      "Failed to update cycle status",
      { cause: updateCycleError },
    );
  }

  const insertedSorted = [...insertedBySourceIndex.values()].sort((a, b) =>
    a.priority_order - b.priority_order
  );

  const eventWarnings: string[] = [];
  try {
    await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_PRIORITIZED, {
      user_id: params.userId,
      cycle_id: params.cycleId,
      reason: "materialized_transformations",
      metadata: {
        source: "transformation-materialization-v2",
        transformations_count: insertedSorted.length,
        validated_groups_count: params.validatedGroups.length,
      },
    });
  } catch (error) {
    eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_PRIORITIZED, error));
  }

  return {
    cycle: { ...context.cycle, ...cyclePatch },
    transformations: insertedSorted,
    eventWarnings,
  };
}

export async function previewTransformationMaterialization(params: {
  requestId: string;
  userId?: string | null;
  rawIntakeText: string;
  validatedGroups: ValidatedGroupInput[];
  deferredLabels?: string[];
}): Promise<Array<{
  id: string;
  priority_order: number;
  recommended_order: number;
  recommended_progress_indicator: string;
  status: "ready" | "pending";
  title: string | null;
  internal_summary: string;
  user_summary: string;
  questionnaire_context: string[];
  questionnaire_schema: null;
  questionnaire_answers: null;
  source_group_index: number;
  ordering_rationale: string;
}>> {
  const promptInput = buildCristallisationInputFromDraft({
    rawIntakeText: params.rawIntakeText,
    validatedGroups: params.validatedGroups,
    deferredLabels: params.deferredLabels ?? [],
  });
  const rawOutput = await generateTransformationMaterializationWithLlm({
    requestId: params.requestId,
    userId: params.userId ?? null,
    input: promptInput,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "transformation_materialization_preview",
    request_id: params.requestId,
    output_length: rawOutput.length,
    at: new Date().toISOString(),
  }));
  const output = parseTransformationMaterializationOutput(
    rawOutput,
    params.validatedGroups.length,
  );
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "transformation_materialization_preview",
    request_id: params.requestId,
    transformations_count: output.transformations.length,
    expected_groups_count: params.validatedGroups.length,
    at: new Date().toISOString(),
  }));

  return output.transformations.map((transformation) => ({
    id: crypto.randomUUID(),
    priority_order: transformation.recommended_order,
    recommended_order: transformation.recommended_order,
    recommended_progress_indicator: transformation.recommended_progress_indicator,
    status: "pending",
    title: transformation.title,
    internal_summary: transformation.internal_summary,
    user_summary: transformation.user_summary,
    questionnaire_context: transformation.questionnaire_context,
    questionnaire_schema: null,
    questionnaire_answers: null,
    source_group_index: transformation.source_group_index,
    ordering_rationale: transformation.ordering_rationale,
  }));
}

async function loadMaterializationContext(
  admin: SupabaseClient,
  userId: string,
  cycleId: string,
): Promise<MaterializationContext> {
  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (cycleError) {
    throw new TransformationMaterializationError(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new TransformationMaterializationError(404, "Cycle not found for this user");
  }

  const { data: aspectsData, error: aspectsError } = await admin
    .from("user_transformation_aspects")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("source_rank", { ascending: true, nullsFirst: false });
  if (aspectsError) {
    throw new TransformationMaterializationError(500, "Failed to load cycle aspects", {
      cause: aspectsError,
    });
  }

  const { data: transformationsData, error: transformationsError } = await admin
    .from("user_transformations")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("priority_order", { ascending: true });
  if (transformationsError) {
    throw new TransformationMaterializationError(
      500,
      "Failed to load existing transformations",
      { cause: transformationsError },
    );
  }

  return {
    cycle: cycleData as UserCycleRow,
    aspects: (aspectsData ?? []) as UserTransformationAspectRow[],
    existingTransformations:
      (transformationsData ?? []) as UserTransformationRow[],
  };
}

function assertCycleCanBeMaterialized(context: MaterializationContext): void {
  if (!["structured", "prioritized"].includes(context.cycle.status)) {
    throw new TransformationMaterializationError(
      409,
      `Cycle status ${context.cycle.status} cannot be materialized`,
    );
  }

  const activeAspectCount =
    context.aspects.filter((aspect) => aspect.status === "active").length;
  if (activeAspectCount === 0) {
    throw new TransformationMaterializationError(
      409,
      "Cycle has no active aspects available for materialization",
    );
  }

  const lockedTransformation = context.existingTransformations.find((row) =>
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
    throw new TransformationMaterializationError(
      409,
      "Cycle transformations are already engaged downstream and cannot be replaced",
    );
  }
}

async function assertNoPlansExistForCycle(
  admin: SupabaseClient,
  cycleId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("user_plans_v2")
    .select("id,status")
    .eq("cycle_id", cycleId)
    .limit(1);
  if (error) {
    throw new TransformationMaterializationError(500, "Failed to verify existing plans", {
      cause: error,
    });
  }
  if ((data ?? []).length > 0) {
    throw new TransformationMaterializationError(
      409,
      "Cycle already has V2 plans and cannot be materialized again",
    );
  }
}

function resolveValidatedGroupsToAspects(
  aspects: UserTransformationAspectRow[],
  groups: ValidatedGroupInput[],
): Array<{
  sourceGroupIndex: number;
  group: ValidatedGroupInput;
  aspectRows: UserTransformationAspectRow[];
}> {
  const activeAspects = aspects.filter((aspect) => aspect.status === "active");
  const byRank = new Map<number, UserTransformationAspectRow>();
  const byKey = new Map<string, UserTransformationAspectRow[]>();

  for (const aspect of activeAspects) {
    if (aspect.source_rank != null) {
      byRank.set(aspect.source_rank, aspect);
    }
    const key = makeAspectFallbackKey(aspect.label, aspect.raw_excerpt);
    const existing = byKey.get(key) ?? [];
    existing.push(aspect);
    byKey.set(key, existing);
  }

  const seenAspectIds = new Set<string>();
  return groups.map((group, groupIndex) => {
    const aspectRows = group.aspects.map((aspect) => {
      const matched = resolveAspectInput(aspect, byRank, byKey);
      if (!matched) {
        throw new TransformationMaterializationError(
          400,
          `Validated group ${groupIndex + 1} references an unknown aspect`,
        );
      }
      if (seenAspectIds.has(matched.id)) {
        throw new TransformationMaterializationError(
          400,
          `Aspect ${matched.label} is assigned to multiple validated groups`,
        );
      }
      seenAspectIds.add(matched.id);
      return matched;
    });

    return {
      sourceGroupIndex: groupIndex + 1,
      group,
      aspectRows,
    };
  });
}

function resolveAspectInput(
  aspect: ValidatedAspectInput,
  byRank: Map<number, UserTransformationAspectRow>,
  byKey: Map<string, UserTransformationAspectRow[]>,
): UserTransformationAspectRow | null {
  if (aspect.source_rank != null) {
    return byRank.get(aspect.source_rank) ?? null;
  }

  const key = makeAspectFallbackKey(aspect.label, aspect.raw_excerpt ?? null);
  const matches = byKey.get(key) ?? [];
  if (matches.length === 1) return matches[0];
  return null;
}

function makeAspectFallbackKey(
  label: string,
  rawExcerpt: string | null,
): string {
  return `${label.trim().toLowerCase()}::${
    String(rawExcerpt ?? "").trim().toLowerCase()
  }`;
}

function buildCristallisationInput(
  cycle: UserCycleRow,
  validatedGroups: ValidatedGroupInput[],
  aspects: UserTransformationAspectRow[],
): CristallisationInput {
  const deferredLabels = aspects
    .filter((aspect) => aspect.status === "deferred")
    .map((aspect) => aspect.label);

  return {
    raw_intake_text: cycle.raw_intake_text,
    validated_groups: validatedGroups.map((group) => ({
      group_label: group.group_label,
      aspects: group.aspects.map((aspect) => ({
        label: aspect.label,
        raw_excerpt: String(aspect.raw_excerpt ?? "").trim() || aspect.label,
      })),
    })),
    deferred_labels: deferredLabels,
  };
}

function buildCristallisationInputFromDraft(params: {
  rawIntakeText: string;
  validatedGroups: ValidatedGroupInput[];
  deferredLabels: string[];
}): CristallisationInput {
  return {
    raw_intake_text: params.rawIntakeText,
    validated_groups: params.validatedGroups.map((group) => ({
      group_label: group.group_label,
      aspects: group.aspects.map((aspect) => ({
        label: aspect.label,
        raw_excerpt: String(aspect.raw_excerpt ?? "").trim() || aspect.label,
      })),
    })),
    deferred_labels: params.deferredLabels,
  };
}

async function generateTransformationMaterializationWithLlm(params: {
  requestId: string;
  userId: string | null;
  input: CristallisationInput;
}): Promise<string> {
  const raw = await generateWithGemini(
    CRISTALLISATION_SYSTEM_PROMPT,
    buildCristallisationUserPrompt(params.input),
    0.35,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:transformation-materialization-v2`,
      source: "transformation-materialization-v2",
      ...(params.userId ? { userId: params.userId } : {}),
      model: "gemini-3.1-pro-preview",
      fallbackModel: "gemini-3-flash-preview",
      maxRetries: 1,
      httpTimeoutMs: 40_000,
      forceInitialModel: true,
      disableFallbackChain: false,
    },
  );

  if (typeof raw !== "string") {
    throw new TransformationMaterializationError(
      500,
      "LLM returned a tool call instead of transformation materialization JSON",
    );
  }

  return raw;
}

function parseTransformationMaterializationOutput(
  raw: string,
  expectedGroupCount: number,
): CristallisationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new TransformationMaterializationError(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }

  const result = CRISTALLISATION_OUTPUT_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      `${issue.path.join(".") || "root"}: ${issue.message}`
    );
    throw new TransformationMaterializationError(
      500,
      `Transformation materialization output failed validation: ${issues.join("; ")}`,
    );
  }

  const output = result.data as CristallisationOutput;
  if (output.transformations.length !== expectedGroupCount) {
    throw new TransformationMaterializationError(
      500,
      `Materialization output count mismatch: expected ${expectedGroupCount}, got ${output.transformations.length}`,
    );
  }

  const expectedIndexes = new Set(
    Array.from({ length: expectedGroupCount }, (_, index) => index + 1),
  );
  const seenSourceIndexes = new Set<number>();
  const seenRecommendedOrders = new Set<number>();
  for (const transformation of output.transformations) {
    if (!expectedIndexes.has(transformation.source_group_index)) {
      throw new TransformationMaterializationError(
        500,
        `Invalid source_group_index ${transformation.source_group_index}`,
      );
    }
    if (seenSourceIndexes.has(transformation.source_group_index)) {
      throw new TransformationMaterializationError(
        500,
        `Duplicate source_group_index ${transformation.source_group_index}`,
      );
    }
    if (
      transformation.recommended_order < 1 ||
      transformation.recommended_order > expectedGroupCount
    ) {
      throw new TransformationMaterializationError(
        500,
        `Invalid recommended_order ${transformation.recommended_order}`,
      );
    }
    if (seenRecommendedOrders.has(transformation.recommended_order)) {
      throw new TransformationMaterializationError(
        500,
        `Duplicate recommended_order ${transformation.recommended_order}`,
      );
    }

    seenSourceIndexes.add(transformation.source_group_index);
    seenRecommendedOrders.add(transformation.recommended_order);
  }

  return output;
}

function buildTransformationRows(params: {
  cycleId: string;
  output: CristallisationOutput;
  now: string;
}): UserTransformationRow[] {
  return params.output.transformations.map((transformation) => ({
    id: crypto.randomUUID(),
    cycle_id: params.cycleId,
    priority_order: transformation.recommended_order,
    status: "pending",
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

function eventWarning(eventType: string, error: unknown): string {
  return `Failed to log ${eventType}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
