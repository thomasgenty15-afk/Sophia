import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini } from "./gemini.ts";
import {
  buildStructurationUserPrompt,
  STRUCTURATION_SYSTEM_PROMPT,
  type StructurationOutput,
} from "./v2-prompts/structuration.ts";
import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";
import type {
  UserCycleRow,
  UserTransformationAspectRow,
} from "./v2-types.ts";
import { z } from "./http.ts";

const STRUCTURATION_OUTPUT_SCHEMA = z.object({
  aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().nullable().optional().default(null),
    source_rank: z.number().int().min(0),
  })).max(15),
  provisional_groups: z.array(z.object({
    group_label: z.string().min(1),
    grouping_rationale: z.string().optional().default(""),
    aspect_ranks: z.array(z.number().int().min(0)).min(1),
  })).max(6),
  deferred_aspects: z.array(z.object({
    label: z.string().min(1),
    raw_excerpt: z.string().nullable().optional().default(null),
    source_rank: z.number().int().min(0),
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
    raw_excerpt: z.string().nullable().optional().default(null),
    source_rank: z.number().int().min(0),
    uncertainty_level: z.enum(["low", "medium", "high"]).catch("medium"),
    uncertainty_reason: z.string().optional().default(""),
  })).max(5),
  needs_clarification: z.boolean().optional().default(false),
  clarification_prompt: z.string().nullable().optional().default(null),
}).superRefine((value, ctx) => {
  const aspectRanks = new Set<number>();
  for (const aspect of value.aspects) {
    if (aspectRanks.has(aspect.source_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate aspect source_rank ${aspect.source_rank}`,
        path: ["aspects"],
      });
    }
    aspectRanks.add(aspect.source_rank);
  }

  const deferredRanks = new Set<number>();
  for (const aspect of value.deferred_aspects) {
    if (deferredRanks.has(aspect.source_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate deferred source_rank ${aspect.source_rank}`,
        path: ["deferred_aspects"],
      });
    }
    deferredRanks.add(aspect.source_rank);
  }

  for (const uncertain of value.uncertain_aspects) {
    if (!aspectRanks.has(uncertain.source_rank)) {
      console.warn(
        `[intake-structuring-v2] uncertain source_rank ${uncertain.source_rank} has no matching active aspect — will be ignored`,
      );
    }
  }

  for (const group of value.provisional_groups) {
    for (const rank of group.aspect_ranks) {
      if (!aspectRanks.has(rank)) {
        console.warn(
          `[intake-structuring-v2] group "${group.group_label}" references missing rank ${rank} — will be ignored`,
        );
      }
    }
  }

  if (value.needs_clarification) {
    if (!String(value.clarification_prompt ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "clarification_prompt is required when needs_clarification is true",
        path: ["clarification_prompt"],
      });
    }
  } else {
    if (!value.aspects.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one aspect is required when clarification is not needed",
        path: ["aspects"],
      });
    }
    if (!value.provisional_groups.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one provisional group is required when clarification is not needed",
        path: ["provisional_groups"],
      });
    }
  }
});

type IntakeStructuringContext = {
  cycle: UserCycleRow;
  createdCycle: boolean;
};

export class IntakeStructuringError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntakeStructuringError";
    this.status = status;
  }
}

export async function structureIntakeForCycle(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  rawIntakeText: string;
  cycleId: string | null;
}): Promise<{
  cycle: UserCycleRow;
  output: StructurationOutput;
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

  await assertCycleCanBeStructured(params.admin, cycleContext.cycle.id);

  const rawOutput = await generateStructurationWithLlm({
    requestId: params.requestId,
    userId: params.userId,
    rawIntakeText: params.rawIntakeText,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "intake_structuring",
    request_id: params.requestId,
    output_length: rawOutput.length,
    at: new Date().toISOString(),
  }));
  const output = parseStructurationOutput(rawOutput);
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "intake_structuring",
    request_id: params.requestId,
    needs_clarification: output.needs_clarification,
    aspects_count: output.aspects.length,
    provisional_groups_count: output.provisional_groups.length,
    deferred_aspects_count: output.deferred_aspects.length,
    at: new Date().toISOString(),
  }));

  const structurePayload = {
    version: 1,
    stage: output.needs_clarification ? "clarification_needed" : "provisional",
    analyzed_at: now,
    provisional_groups: output.provisional_groups,
    deferred_aspects: output.deferred_aspects,
    uncertain_aspects: output.uncertain_aspects,
    clarification_prompt: output.clarification_prompt,
    needs_clarification: output.needs_clarification,
  } satisfies Record<string, unknown>;

  const nextStatus = output.needs_clarification
    ? "clarification_needed"
    : "structured";

  const { error: deleteAspectsError } = await params.admin
    .from("user_transformation_aspects")
    .delete()
    .eq("cycle_id", cycleContext.cycle.id);
  if (deleteAspectsError) {
    throw new IntakeStructuringError(
      500,
      "Failed to clear previous cycle aspects",
      { cause: deleteAspectsError },
    );
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
      throw new IntakeStructuringError(
        500,
        "Failed to persist transformation aspects",
        { cause: insertAspectsError },
      );
    }
  }

  const cyclePatch = {
    raw_intake_text: params.rawIntakeText,
    status: nextStatus,
    validated_structure: structurePayload,
    updated_at: now,
  } satisfies Partial<UserCycleRow>;
  const { error: updateCycleError } = await params.admin
    .from("user_cycles")
    .update(cyclePatch as any)
    .eq("id", cycleContext.cycle.id);
  if (updateCycleError) {
    throw new IntakeStructuringError(500, "Failed to update cycle", {
      cause: updateCycleError,
    });
  }

  const eventWarnings: string[] = [];
  if (cycleContext.createdCycle) {
    try {
      await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_CREATED, {
        user_id: params.userId,
        cycle_id: cycleContext.cycle.id,
        reason: "intake_structuring_started",
        metadata: { source: "intake-structuring-v2" },
      });
    } catch (error) {
      eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_CREATED, error));
    }
  }

  try {
    await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_STRUCTURED, {
      user_id: params.userId,
      cycle_id: cycleContext.cycle.id,
      reason: nextStatus,
      metadata: {
        source: "intake-structuring-v2",
        aspects_count: output.aspects.length,
        provisional_groups_count: output.provisional_groups.length,
        deferred_aspects_count: output.deferred_aspects.length,
        uncertain_aspects_count: output.uncertain_aspects.length,
        needs_clarification: output.needs_clarification,
      },
    });
  } catch (error) {
    eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_STRUCTURED, error));
  }

  return {
    cycle: { ...cycleContext.cycle, ...cyclePatch },
    output,
    eventWarnings,
  };
}

export async function previewStructuredIntake(params: {
  requestId: string;
  userId?: string | null;
  rawIntakeText: string;
}): Promise<StructurationOutput> {
  const rawOutput = await generateStructurationWithLlm({
    requestId: params.requestId,
    userId: params.userId ?? null,
    rawIntakeText: params.rawIntakeText,
  });
  console.log(JSON.stringify({
    tag: "after_llm_return",
    stage: "intake_structuring_preview",
    request_id: params.requestId,
    output_length: rawOutput.length,
    at: new Date().toISOString(),
  }));
  const output = parseStructurationOutput(rawOutput);
  console.log(JSON.stringify({
    tag: "after_parse_output",
    stage: "intake_structuring_preview",
    request_id: params.requestId,
    needs_clarification: output.needs_clarification,
    aspects_count: output.aspects.length,
    provisional_groups_count: output.provisional_groups.length,
    deferred_aspects_count: output.deferred_aspects.length,
    at: new Date().toISOString(),
  }));
  return output;
}

async function loadOrCreateCycle(params: {
  admin: SupabaseClient;
  userId: string;
  cycleId: string | null;
  rawIntakeText: string;
  now: string;
}): Promise<IntakeStructuringContext> {
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
      throw new IntakeStructuringError(500, "Failed to create cycle", {
        cause: error,
      });
    }

    return {
      cycle: data as UserCycleRow,
      createdCycle: true,
    };
  }

  const { data, error } = await params.admin
    .from("user_cycles")
    .select("*")
    .eq("id", params.cycleId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) {
    throw new IntakeStructuringError(500, "Failed to load cycle", {
      cause: error,
    });
  }
  if (!data) {
    throw new IntakeStructuringError(404, "Cycle not found for this user");
  }

  const cycle = data as UserCycleRow;
  if (!["draft", "clarification_needed", "structured"].includes(cycle.status)) {
    throw new IntakeStructuringError(
      409,
      `Cycle status ${cycle.status} cannot be structured`,
    );
  }

  return { cycle, createdCycle: false };
}

async function assertCycleCanBeStructured(
  admin: SupabaseClient,
  cycleId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("user_transformations")
    .select("id")
    .eq("cycle_id", cycleId)
    .limit(1);
  if (error) {
    throw new IntakeStructuringError(
      500,
      "Failed to verify cycle preconditions",
      { cause: error },
    );
  }
  if ((data ?? []).length > 0) {
    throw new IntakeStructuringError(
      409,
      "Cycle already has materialized transformations",
    );
  }
}

async function generateStructurationWithLlm(params: {
  requestId: string;
  userId: string | null;
  rawIntakeText: string;
}): Promise<string> {
  const raw = await generateWithGemini(
    STRUCTURATION_SYSTEM_PROMPT,
    buildStructurationUserPrompt(params.rawIntakeText),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:intake-structuring-v2`,
      source: "intake-structuring-v2",
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
    throw new IntakeStructuringError(
      500,
      "LLM returned a tool call instead of intake structure JSON",
    );
  }

  return raw;
}

function parseStructurationOutput(raw: string): StructurationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[intake-structuring-v2] JSON.parse failed. raw preview:", raw.slice(0, 300));
    throw new IntakeStructuringError(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }

  const result = STRUCTURATION_OUTPUT_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      `${issue.path.join(".") || "root"}: ${issue.message}`
    );
    console.error(
      "[intake-structuring-v2] Zod validation failed:",
      issues.join("; "),
      "| keys in parsed:",
      parsed && typeof parsed === "object" ? Object.keys(parsed as object).join(", ") : String(parsed).slice(0, 100),
    );
    throw new IntakeStructuringError(
      500,
      `Structuration output failed validation: ${issues.join("; ")}`,
    );
  }

  return result.data as StructurationOutput;
}

function buildAspectRows(params: {
  cycleId: string;
  output: StructurationOutput;
  now: string;
}): UserTransformationAspectRow[] {
  const uncertainByRank = new Map(
    params.output.uncertain_aspects.map((
      aspect,
    ) => [aspect.source_rank, aspect]),
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
      metadata: uncertain
        ? { uncertainty_reason: uncertain.uncertainty_reason }
        : {},
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

function eventWarning(eventType: string, error: unknown): string {
  return `Failed to log ${eventType}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
