import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import { z } from "./http.ts";
import { extractOnboardingV2Payload } from "./professional-support.ts";
import type {
  LevelSnapshot,
  LevelToolRecommendationEventType,
  LevelToolRecommendationState,
  LevelToolRecommendationSupersededReason,
  PlanContentV3,
  ToolRecommendationCategoryKey,
  ToolRecommendationType,
  UserCycleRow,
  UserLevelToolRecommendationRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "./v2-types.ts";

const TOOL_RECOMMENDATION_CATEGORY_KEYS = [
  "measurement_tracking",
  "symptom_tracking",
  "sleep_support",
  "nutrition_prep",
  "hydration_support",
  "movement_training",
  "recovery_mobility",
  "pain_relief_support",
  "distraction_blocking",
  "reproductive_health",
  "consumption_reduction",
  "workspace_ergonomics",
] as const satisfies readonly ToolRecommendationCategoryKey[];

const TOOL_RECOMMENDATION_CATEGORY_ENUM = z.enum(
  [...TOOL_RECOMMENDATION_CATEGORY_KEYS] as [
    ToolRecommendationCategoryKey,
    ...ToolRecommendationCategoryKey[],
  ],
);

const TOOL_TYPE_ENUM = z.enum(["app", "product"] satisfies [
  ToolRecommendationType,
  ToolRecommendationType,
]);

const SOPHIA_OVERLAP_RISK_ENUM = z.enum(["low", "medium", "high"]);

const RECOMMENDATION_SCHEMA = z.object({
  priority_rank: z.number().int().min(1).max(2),
  tool_type: TOOL_TYPE_ENUM,
  category_key: TOOL_RECOMMENDATION_CATEGORY_ENUM,
  subcategory_key: z.string().trim().min(1).max(80).nullable(),
  display_name: z.string().trim().min(1).max(120),
  brand_name: z.string().trim().min(1).max(120).nullable(),
  reason: z.string().trim().min(1).max(260),
  why_this_level: z.string().trim().min(1).max(320),
  confidence_score: z.number().int().min(95).max(100),
  sophia_overlap_risk: SOPHIA_OVERLAP_RISK_ENUM,
}).superRefine((value, ctx) => {
  if (value.sophia_overlap_risk !== "low") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sophia_overlap_risk must be low",
      path: ["sophia_overlap_risk"],
    });
  }
});

const LEVEL_RECOMMENDATION_SCHEMA = z.object({
  target_level_order: z.number().int().min(2).max(12),
  target_level_id: z.string().trim().min(1).max(200).nullable(),
  no_recommendation_reason: z.string().trim().min(1).max(240).nullable(),
  recommendations: z.array(RECOMMENDATION_SCHEMA).max(2),
}).superRefine((value, ctx) => {
  const uniqueRanks = new Set<number>();
  for (const recommendation of value.recommendations) {
    if (uniqueRanks.has(recommendation.priority_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate priority rank ${recommendation.priority_rank}`,
        path: ["recommendations"],
      });
    }
    uniqueRanks.add(recommendation.priority_rank);
  }

  if (value.recommendations.length === 0 && !value.no_recommendation_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "no_recommendation_reason is required when recommendations is empty",
      path: ["no_recommendation_reason"],
    });
  }

  if (value.recommendations.length > 0 && value.no_recommendation_reason !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "no_recommendation_reason must be null when recommendations are present",
      path: ["no_recommendation_reason"],
    });
  }
});

const LEVEL_RECOMMENDATION_RESULT_SCHEMA = z.object({
  levels: z.array(LEVEL_RECOMMENDATION_SCHEMA).max(12),
}).superRefine((value, ctx) => {
  const uniqueOrders = new Set<number>();
  for (const level of value.levels) {
    if (uniqueOrders.has(level.target_level_order)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate target_level_order ${level.target_level_order}`,
        path: ["levels"],
      });
    }
    uniqueOrders.add(level.target_level_order);
  }
});

const BLOCKED_OVERLAP_PATTERNS = [
  /\bplanner\b/i,
  /\bhabit\s*tracker\b/i,
  /\broutine\s*builder\b/i,
  /\bai\s*coach\b/i,
  /\bdaily\s*coach\b/i,
  /\btask\s*manager\b/i,
  /\bguided\s*journal\b/i,
  /\baccountability\b/i,
];

const UNIVERSAL_LEVEL_OFFSET = 1;

type LevelRecommendationOutput = z.infer<typeof LEVEL_RECOMMENDATION_SCHEMA>;
type EligibleLevel = {
  phase_id: string;
  phase_order: number;
  title: string;
  phase_objective: string;
  rationale: string | null;
  what_this_phase_targets: string | null;
  why_this_now: string | null;
  how_this_phase_works: string | null;
  duration_guidance: string | null;
};

export class LevelToolRecommendationsV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LevelToolRecommendationsV1Error";
    this.status = status;
  }
}

export async function loadLevelToolRecommendationPlanContext(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  planRow: UserPlanV2Row;
  plan: PlanContentV3;
}> {
  const { data: transformationData, error: transformationError } = await args.admin
    .from("user_transformations")
    .select("*")
    .eq("id", args.transformationId)
    .maybeSingle();

  if (transformationError) {
    throw new LevelToolRecommendationsV1Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }
  if (!transformationData) {
    throw new LevelToolRecommendationsV1Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await args.admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (cycleError) {
    throw new LevelToolRecommendationsV1Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new LevelToolRecommendationsV1Error(404, "Cycle not found for this user");
  }

  const { data: planData, error: planError } = await args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("transformation_id", transformation.id)
    .in("status", ["active", "paused", "completed"])
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    throw new LevelToolRecommendationsV1Error(500, "Failed to load active plan", {
      cause: planError,
    });
  }
  if (!planData) {
    throw new LevelToolRecommendationsV1Error(
      409,
      "A validated plan is required before classifying level tools",
    );
  }

  const planRow = planData as UserPlanV2Row;
  const plan = planRow.content as unknown as PlanContentV3;
  if (!plan || plan.version !== 3 || !Array.isArray(plan.phases)) {
    throw new LevelToolRecommendationsV1Error(500, "Active plan is invalid");
  }

  return {
    cycle: cycleData as UserCycleRow,
    transformation,
    planRow,
    plan,
  };
}

export async function classifyAndPersistLevelToolRecommendations(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  planRow: UserPlanV2Row;
  plan: PlanContentV3;
}): Promise<{
  recommendations: UserLevelToolRecommendationRow[];
  state: LevelToolRecommendationState;
}> {
  const eligibleLevels = getEligibleLevels(args.plan);

  console.info("[level-tools][start]", {
    request_id: args.requestId,
    user_id: args.userId,
    transformation_id: args.transformation.id,
    plan_id: args.planRow.id,
    plan_version: args.planRow.version,
    total_phase_count: args.plan.phases.length,
    eligible_level_orders: eligibleLevels.map((phase) => phase.phase_order),
  });

  if (eligibleLevels.length === 0) {
    console.warn("[level-tools][no_eligible_levels]", {
      request_id: args.requestId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      phase_orders: args.plan.phases.map((phase) => phase.phase_order),
      phase_titles: args.plan.phases.map((phase) => ({
        phase_order: phase.phase_order,
        title: phase.title,
      })),
    });
    const state: LevelToolRecommendationState = {
      version: 1,
      plan_id: args.planRow.id,
      plan_version: args.planRow.version,
      plan_updated_at: args.planRow.updated_at,
      generated_at: new Date().toISOString(),
      levels: [],
    };
    await persistLevelToolRecommendationState({
      admin: args.admin,
      transformationId: args.transformation.id,
      state,
    });
    return {
      recommendations: [],
      state,
    };
  }

  const raw = await generateWithGemini(
    LEVEL_TOOL_RECOMMENDATION_SYSTEM_PROMPT,
    buildLevelToolRecommendationUserPrompt({
      cycle: args.cycle,
      transformation: args.transformation,
      plan: args.plan,
      planRow: args.planRow,
    }),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: `${args.requestId}:classify-level-tools-v1`,
      source: "classify-level-tools-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 3,
      httpTimeoutMs: 90_000,
    },
  );

  if (typeof raw !== "string") {
    throw new LevelToolRecommendationsV1Error(
      500,
      "LLM returned an unsupported response while classifying level tools",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "LLM returned invalid JSON for the level tool classification",
      { cause: error },
    );
  }

  const validation = LEVEL_RECOMMENDATION_RESULT_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "LLM returned a level tool classification that failed schema validation",
      { cause: validation.error },
    );
  }

  const normalizedLevels = normalizeLevelsOutput(validation.data.levels, eligibleLevels);
  console.info("[level-tools][llm_validated]", {
    request_id: args.requestId,
    transformation_id: args.transformation.id,
    plan_id: args.planRow.id,
    returned_level_orders: validation.data.levels.map((entry) => entry.target_level_order),
    normalized: normalizedLevels.map((entry) => ({
      target_level_order: entry.target_level_order,
      recommendation_count: entry.recommendations.length,
      no_recommendation_reason: entry.no_recommendation_reason,
    })),
  });
  const now = new Date().toISOString();

  const { data: existingRows, error: existingError } = await args.admin
    .from("user_level_tool_recommendations")
    .select("*")
    .eq("transformation_id", args.transformation.id)
    .order("target_level_order", { ascending: true })
    .order("priority_rank", { ascending: true })
    .order("updated_at", { ascending: false });

  if (existingError) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Failed to load existing level tool recommendations",
      { cause: existingError },
    );
  }

  const existingRecommendations =
    (existingRows as UserLevelToolRecommendationRow[] | null) ?? [];
  const activeByLevel = new Map<number, UserLevelToolRecommendationRow[]>();
  const latestBySignature = new Map<string, UserLevelToolRecommendationRow>();

  for (const row of existingRecommendations) {
    const signature = buildRecommendationSignature({
      tool_type: row.tool_type,
      category_key: row.category_key,
      subcategory_key: row.subcategory_key,
      display_name: row.display_name,
      brand_name: row.brand_name,
    });
    const known = latestBySignature.get(signature);
    if (!known || known.updated_at < row.updated_at) {
      latestBySignature.set(signature, row);
    }

    if (!row.is_active) continue;
    const bucket = activeByLevel.get(row.target_level_order) ?? [];
    bucket.push(row);
    activeByLevel.set(row.target_level_order, bucket);
  }

  const persistedRows: UserLevelToolRecommendationRow[] = [];
  const levelSummaries: LevelToolRecommendationState["levels"] = [];

  for (const levelOutput of normalizedLevels) {
    const activeRows = [...(activeByLevel.get(levelOutput.target_level_order) ?? [])]
      .sort((a, b) => a.priority_rank - b.priority_rank);
    const nextSnapshot = buildLevelSnapshot(levelOutput.phase);
    const sameLevelState = activeRows.length > 0 &&
      activeRows.every((row) =>
        row.plan_id === args.planRow.id &&
        row.plan_version === args.planRow.version &&
        row.plan_updated_at === args.planRow.updated_at &&
        areLevelSnapshotsEqual(row.level_snapshot, nextSnapshot)
      );

    if (sameLevelState && areRecommendationSetsEquivalent(activeRows, levelOutput.recommendations)) {
      console.info("[level-tools][level_unchanged]", {
        request_id: args.requestId,
        transformation_id: args.transformation.id,
        plan_id: args.planRow.id,
        target_level_order: levelOutput.target_level_order,
        active_recommendation_count: activeRows.length,
      });
      persistedRows.push(...activeRows);
      levelSummaries.push({
        target_level_id: levelOutput.phase.phase_id,
        target_level_order: levelOutput.phase.phase_order,
        recommendation_count: activeRows.length,
        no_recommendation_reason: activeRows.length === 0 ? levelOutput.no_recommendation_reason : null,
      });
      continue;
    }

    let supersededReason: LevelToolRecommendationSupersededReason =
      "regenerated_after_plan_change";
    if (activeRows.length > 0) {
      const existingSnapshot = activeRows[0]?.level_snapshot ?? null;
      if (!existingSnapshot) {
        supersededReason = "regenerated_after_plan_change";
      } else if (existingSnapshot.level_id !== nextSnapshot.level_id) {
        supersededReason = "level_removed";
      } else if (!areLevelSnapshotsEqual(existingSnapshot, nextSnapshot)) {
        supersededReason = "level_rewritten";
      } else {
        supersededReason = "level_recommendation_set_changed";
      }
    }

    if (levelOutput.recommendations.length === 0) {
      if (activeRows.length > 0) {
        await supersedeLevelRecommendations({
          admin: args.admin,
          rows: activeRows,
          now,
          reason: supersededReason,
          newRecommendationIdsByRank: new Map(),
        });
      }
      console.info("[level-tools][level_no_recommendation]", {
        request_id: args.requestId,
        transformation_id: args.transformation.id,
        plan_id: args.planRow.id,
        target_level_order: levelOutput.target_level_order,
        active_rows_superseded: activeRows.length,
        no_recommendation_reason: levelOutput.no_recommendation_reason,
      });
      levelSummaries.push({
        target_level_id: levelOutput.phase.phase_id,
        target_level_order: levelOutput.phase.phase_order,
        recommendation_count: 0,
        no_recommendation_reason: levelOutput.no_recommendation_reason,
      });
      continue;
    }

    const insertedRows: UserLevelToolRecommendationRow[] = [];
    for (const recommendation of levelOutput.recommendations) {
      const signature = buildRecommendationSignature(recommendation);
      const previous = latestBySignature.get(signature);
      const preservedStatus = previous?.status ?? "recommended";
      const insertPayload = {
        user_id: args.userId,
        cycle_id: args.cycle.id,
        transformation_id: args.transformation.id,
        plan_id: args.planRow.id,
        plan_version: args.planRow.version,
        plan_updated_at: args.planRow.updated_at,
        target_level_id: levelOutput.phase.phase_id,
        target_level_order: levelOutput.phase.phase_order,
        priority_rank: recommendation.priority_rank,
        tool_type: recommendation.tool_type,
        category_key: recommendation.category_key,
        subcategory_key: recommendation.subcategory_key,
        display_name: recommendation.display_name,
        brand_name: recommendation.brand_name,
        reason: recommendation.reason,
        why_this_level: recommendation.why_this_level,
        confidence_score: recommendation.confidence_score,
        status: preservedStatus,
        is_active: true,
        superseded_by_recommendation_id: null,
        superseded_reason: null,
        level_snapshot: nextSnapshot,
        metadata: {
          sophia_overlap_risk: recommendation.sophia_overlap_risk,
          no_recommendation_reason: null,
        },
        generated_at: now,
        updated_at: now,
      } satisfies Omit<UserLevelToolRecommendationRow, "id">;

      const { data, error } = await args.admin
        .from("user_level_tool_recommendations")
        .insert(insertPayload as never)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        throw new LevelToolRecommendationsV1Error(
          500,
          "Failed to insert level tool recommendation",
          { cause: error },
        );
      }

      const persisted = data as UserLevelToolRecommendationRow;
      insertedRows.push(persisted);
      persistedRows.push(persisted);

      await insertLevelToolRecommendationEvent({
        admin: args.admin,
        recommendationId: persisted.id,
        userId: args.userId,
        cycleId: args.cycle.id,
        transformationId: args.transformation.id,
        planId: args.planRow.id,
        eventType: activeRows.length > 0
          ? "regenerated_after_plan_adjustment"
          : "generated",
        payload: {
          target_level_order: persisted.target_level_order,
          priority_rank: persisted.priority_rank,
          tool_type: persisted.tool_type,
          category_key: persisted.category_key,
          display_name: persisted.display_name,
          preserved_status: preservedStatus,
        },
      });
    }

    if (activeRows.length > 0) {
      await supersedeLevelRecommendations({
        admin: args.admin,
        rows: activeRows,
        now,
        reason: supersededReason,
        newRecommendationIdsByRank: new Map(
          insertedRows.map((row) => [row.priority_rank, row.id]),
        ),
      });
    }

    console.info("[level-tools][level_persisted]", {
      request_id: args.requestId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      target_level_order: levelOutput.target_level_order,
      inserted_count: insertedRows.length,
      superseded_count: activeRows.length,
      superseded_reason: activeRows.length > 0 ? supersededReason : null,
      inserted: insertedRows.map((row) => ({
        id: row.id,
        priority_rank: row.priority_rank,
        tool_type: row.tool_type,
        category_key: row.category_key,
        display_name: row.display_name,
        status: row.status,
      })),
    });

    levelSummaries.push({
      target_level_id: levelOutput.phase.phase_id,
      target_level_order: levelOutput.phase.phase_order,
      recommendation_count: insertedRows.length,
      no_recommendation_reason: null,
    });
  }

  const nextLevelOrders = new Set(normalizedLevels.map((entry) => entry.target_level_order));
  const removedActiveRows = existingRecommendations.filter((row) =>
    row.is_active && !nextLevelOrders.has(row.target_level_order)
  );
  if (removedActiveRows.length > 0) {
    await supersedeLevelRecommendations({
      admin: args.admin,
      rows: removedActiveRows,
      now,
      reason: "level_removed",
      newRecommendationIdsByRank: new Map(),
    });
    console.info("[level-tools][removed_levels_superseded]", {
      request_id: args.requestId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      removed_count: removedActiveRows.length,
      removed_level_orders: [...new Set(removedActiveRows.map((row) => row.target_level_order))],
    });
  }

  const state: LevelToolRecommendationState = {
    version: 1,
    plan_id: args.planRow.id,
    plan_version: args.planRow.version,
    plan_updated_at: args.planRow.updated_at,
    generated_at: now,
    levels: levelSummaries.sort((a, b) => a.target_level_order - b.target_level_order),
  };

  const latestHandoffPayload = await loadLatestTransformationHandoffPayload({
    admin: args.admin,
    transformationId: args.transformation.id,
  });
  const nextHandoffPayload = mergeLevelToolRecommendationState(latestHandoffPayload, state);
  const { error: handoffError } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: nextHandoffPayload as unknown as Record<string, unknown>,
      updated_at: now,
    } as never)
    .eq("id", args.transformation.id);

  if (handoffError) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Failed to persist level tool recommendation state",
      { cause: handoffError },
    );
  }

  console.info("[level-tools][complete]", {
    request_id: args.requestId,
    transformation_id: args.transformation.id,
    plan_id: args.planRow.id,
    persisted_recommendation_count: persistedRows.length,
    level_summaries: state.levels,
  });

  return {
    recommendations: persistedRows.sort((a, b) =>
      a.target_level_order - b.target_level_order || a.priority_rank - b.priority_rank
    ),
    state,
  };
}

export function extractLevelToolRecommendationState(
  handoffPayload: UserTransformationRow["handoff_payload"],
): LevelToolRecommendationState | null {
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);
  const raw = onboardingV2.level_tool_recommendations;
  if (!isRecord(raw)) return null;
  if (
    raw.version !== 1 ||
    typeof raw.plan_id !== "string" ||
    typeof raw.plan_version !== "number" ||
    typeof raw.plan_updated_at !== "string" ||
    typeof raw.generated_at !== "string" ||
    !Array.isArray(raw.levels)
  ) {
    return null;
  }

  return raw as LevelToolRecommendationState;
}

export function mergeLevelToolRecommendationState(
  handoffPayload: UserTransformationRow["handoff_payload"],
  state: LevelToolRecommendationState,
): Record<string, unknown> {
  const current = isRecord(handoffPayload) ? { ...handoffPayload } : {};
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);

  return {
    ...current,
    onboarding_v2: {
      ...onboardingV2,
      level_tool_recommendations: state,
    },
  };
}

async function supersedeLevelRecommendations(args: {
  admin: SupabaseClient;
  rows: UserLevelToolRecommendationRow[];
  now: string;
  reason: LevelToolRecommendationSupersededReason;
  newRecommendationIdsByRank: Map<number, string>;
}) {
  for (const row of args.rows) {
    const supersededById = args.newRecommendationIdsByRank.get(row.priority_rank) ?? null;
    const { error } = await args.admin
      .from("user_level_tool_recommendations")
      .update({
        is_active: false,
        superseded_by_recommendation_id: supersededById,
        superseded_reason: args.reason,
        updated_at: args.now,
      } as never)
      .eq("id", row.id);

    if (error) {
      throw new LevelToolRecommendationsV1Error(
        500,
        "Failed to supersede stale level tool recommendation",
        { cause: error },
      );
    }

    await insertLevelToolRecommendationEvent({
      admin: args.admin,
      recommendationId: row.id,
      userId: row.user_id,
      cycleId: row.cycle_id,
      transformationId: row.transformation_id,
      planId: row.plan_id,
      eventType: "superseded_after_plan_adjustment",
      payload: {
        reason: args.reason,
        superseded_by_recommendation_id: supersededById,
        target_level_order: row.target_level_order,
      },
    });
  }
}

async function insertLevelToolRecommendationEvent(args: {
  admin: SupabaseClient;
  recommendationId: string;
  userId: string;
  cycleId: string;
  transformationId: string;
  planId: string;
  eventType: LevelToolRecommendationEventType;
  payload: Record<string, unknown>;
}) {
  const { error } = await args.admin
    .from("user_level_tool_recommendation_events")
    .insert({
      recommendation_id: args.recommendationId,
      user_id: args.userId,
      cycle_id: args.cycleId,
      transformation_id: args.transformationId,
      plan_id: args.planId,
      event_type: args.eventType,
      payload: args.payload,
    } as never);

  if (error) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Failed to persist level tool recommendation event",
      { cause: error },
    );
  }
}

function normalizeLevelsOutput(levels: LevelRecommendationOutput[], eligibleLevels: EligibleLevel[]) {
  const outputByOrder = new Map(levels.map((entry) => [entry.target_level_order, entry]));

  return eligibleLevels.map((level) => {
    const raw = outputByOrder.get(level.phase_order);
    if (!raw) {
      return {
        target_level_order: level.phase_order,
        target_level_id: level.phase_id,
        no_recommendation_reason: "Aucun outil n'atteint le seuil de confiance requis pour ce niveau.",
        recommendations: [],
        phase: level,
      };
    }

    const recommendations = raw.recommendations
      .map((entry) => ({
        ...entry,
        display_name: entry.display_name.trim(),
        brand_name: entry.brand_name?.trim() || null,
        subcategory_key: entry.subcategory_key?.trim() || null,
        reason: entry.reason.trim(),
        why_this_level: entry.why_this_level.trim(),
      }))
      .filter((entry) => !containsBlockedOverlap(entry))
      .map((entry, index) => ({
        ...entry,
        priority_rank: index + 1,
      }));

    return {
      target_level_order: level.phase_order,
      target_level_id: level.phase_id,
      no_recommendation_reason: recommendations.length === 0
        ? raw.no_recommendation_reason ??
          "Aucun outil n'atteint le seuil de confiance requis pour ce niveau."
        : null,
      recommendations,
      phase: level,
    };
  });
}

function containsBlockedOverlap(value: {
  display_name: string;
  reason: string;
  why_this_level: string;
}) {
  const haystack = `${value.display_name}\n${value.reason}\n${value.why_this_level}`;
  return BLOCKED_OVERLAP_PATTERNS.some((pattern) => pattern.test(haystack));
}

function buildRecommendationSignature(value: {
  tool_type: ToolRecommendationType;
  category_key: ToolRecommendationCategoryKey;
  subcategory_key: string | null;
  display_name: string;
  brand_name: string | null;
}) {
  return [
    value.tool_type,
    value.category_key,
    normalizeSignatureText(value.subcategory_key),
    normalizeSignatureText(value.display_name),
    normalizeSignatureText(value.brand_name),
  ].join("::");
}

function normalizeSignatureText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildLevelSnapshot(phase: EligibleLevel): LevelSnapshot {
  return {
    level_id: phase.phase_id,
    level_order: phase.phase_order,
    level_title: phase.title,
    level_objective: phase.phase_objective,
    what_this_level_targets: phase.what_this_phase_targets ?? null,
    why_this_now: phase.why_this_now ?? phase.rationale ?? null,
    how_this_level_works: phase.how_this_phase_works ?? phase.phase_objective,
  };
}

function areLevelSnapshotsEqual(a: LevelSnapshot, b: LevelSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function areRecommendationSetsEquivalent(
  existingRows: UserLevelToolRecommendationRow[],
  nextRecommendations: Array<{
    priority_rank: number;
    tool_type: ToolRecommendationType;
    category_key: ToolRecommendationCategoryKey;
    subcategory_key: string | null;
    display_name: string;
    brand_name: string | null;
    reason: string;
    why_this_level: string;
    confidence_score: number;
  }>,
) {
  if (existingRows.length !== nextRecommendations.length) return false;

  for (const existing of existingRows) {
    const next = nextRecommendations.find((entry) => entry.priority_rank === existing.priority_rank);
    if (!next) return false;
    if (
      existing.tool_type !== next.tool_type ||
      existing.category_key !== next.category_key ||
      existing.subcategory_key !== next.subcategory_key ||
      existing.display_name !== next.display_name ||
      existing.brand_name !== next.brand_name ||
      existing.reason !== next.reason ||
      existing.why_this_level !== next.why_this_level ||
      existing.confidence_score !== next.confidence_score
    ) {
      return false;
    }
  }

  return true;
}

async function loadLatestTransformationHandoffPayload(args: {
  admin: SupabaseClient;
  transformationId: string;
}): Promise<UserTransformationRow["handoff_payload"]> {
  const { data, error } = await args.admin
    .from("user_transformations")
    .select("handoff_payload")
    .eq("id", args.transformationId)
    .maybeSingle();

  if (error) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Failed to reload transformation handoff payload",
      { cause: error },
    );
  }

  return (data as { handoff_payload?: Record<string, unknown> | null } | null)
    ?.handoff_payload ?? null;
}

function buildLevelToolRecommendationUserPrompt(input: {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  planRow: UserPlanV2Row;
}): string {
  const onboardingV2 = extractOnboardingV2Payload(input.transformation.handoff_payload);
  const levelContexts = getEligibleLevels(input.plan)
    .map((phase) => ({
      target_level_order: phase.phase_order,
      target_level_id: phase.phase_id,
      title: phase.title,
      objective: phase.phase_objective,
      what_this_level_targets: phase.what_this_phase_targets ?? null,
      why_this_now: phase.why_this_now ?? phase.rationale ?? null,
      how_this_level_works: phase.how_this_phase_works ?? phase.phase_objective,
      duration_guidance: phase.duration_guidance ?? null,
    }));

  return `## Transformation

- Title: ${String(input.transformation.title ?? input.plan.title).trim() || "Untitled transformation"}
- User summary: ${input.transformation.user_summary}
- Internal summary: ${input.transformation.internal_summary}
- Success definition: ${String(input.transformation.success_definition ?? input.plan.strategy.success_definition).trim() || "Not provided"}
- Main constraint: ${String(input.transformation.main_constraint ?? input.plan.strategy.main_constraint).trim() || "Not provided"}

## Plan metadata

- plan_id: ${input.planRow.id}
- plan_version: ${input.planRow.version}
- plan_updated_at: ${input.planRow.updated_at}

## Existing classification hints

${JSON.stringify({
    plan_type_classification: onboardingV2.plan_type_classification ?? null,
    questionnaire_context: onboardingV2.questionnaire_context ?? null,
    professional_support: onboardingV2.professional_support ?? null,
  }, null, 2)}

## User profile snapshot

${JSON.stringify({
    birth_date_snapshot: input.cycle.birth_date_snapshot ?? null,
    gender_snapshot: input.cycle.gender_snapshot ?? null,
    pace_preference: input.cycle.requested_pace ?? null,
  }, null, 2)}

## Levels that can receive tool recommendations

${JSON.stringify(levelContexts, null, 2)}

Return JSON only.`;
}

function getEligibleLevels(plan: PlanContentV3): EligibleLevel[] {
  const levels = new Map<number, EligibleLevel>();

  for (const phase of plan.phases) {
    const displayOrder = getDisplayLevelOrder(phase.phase_order);
    if (displayOrder < 2) continue;
    levels.set(displayOrder, {
      phase_id: phase.phase_id,
      phase_order: displayOrder,
      title: phase.title,
      phase_objective: phase.phase_objective,
      rationale: phase.rationale ?? null,
      what_this_phase_targets: phase.what_this_phase_targets ?? null,
      why_this_now: phase.why_this_now ?? null,
      how_this_phase_works: phase.how_this_phase_works ?? null,
      duration_guidance: phase.duration_guidance ?? null,
    });
  }

  const currentLevelOrder = plan.current_level_runtime?.level_order
    ?? plan.phases[0]?.phase_order
    ?? 1;
  for (const level of plan.plan_blueprint?.levels ?? []) {
    const displayOrder = getDisplayLevelOrder(level.level_order);
    if (displayOrder < 2) continue;
    if (level.level_order <= currentLevelOrder) continue;
    if (levels.has(displayOrder)) continue;
    levels.set(displayOrder, {
      phase_id: level.phase_id,
      phase_order: displayOrder,
      title: level.title,
      phase_objective: level.intention,
      rationale: level.preview_summary ?? null,
      what_this_phase_targets: level.preview_summary ?? null,
      why_this_now: level.preview_summary ?? null,
      how_this_phase_works: level.intention,
      duration_guidance: level.estimated_duration_weeks
        ? `${level.estimated_duration_weeks} semaine${level.estimated_duration_weeks > 1 ? "s" : ""}`
        : null,
    });
  }

  return [...levels.values()].sort((a, b) => a.phase_order - b.phase_order);
}

function getDisplayLevelOrder(rawLevelOrder: number) {
  return rawLevelOrder + UNIVERSAL_LEVEL_OFFSET;
}

async function persistLevelToolRecommendationState(args: {
  admin: SupabaseClient;
  transformationId: string;
  state: LevelToolRecommendationState;
}) {
  const latestHandoffPayload = await loadLatestTransformationHandoffPayload({
    admin: args.admin,
    transformationId: args.transformationId,
  });
  const nextHandoffPayload = mergeLevelToolRecommendationState(latestHandoffPayload, args.state);
  const { error } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: nextHandoffPayload as unknown as Record<string, unknown>,
      updated_at: args.state.generated_at,
    } as never)
    .eq("id", args.transformationId);

  if (error) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Failed to persist level tool recommendation state",
      { cause: error },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const LEVEL_TOOL_RECOMMENDATION_SYSTEM_PROMPT =
  `You generate recommended tools for Sophia plan levels.

Sophia already covers planning, accountability, routine management, journaling, environment setup, and general coaching.
Never recommend anything whose primary value overlaps with those Sophia capabilities.

Your task:
- Work level by level.
- Levels start at level 2. Level 1 is Sophia's foundation and must never receive tool recommendations.
- Recommend between 0 and 2 tools per level.
- Return 0 only when nothing reaches the required confidence threshold.
- confidence_score must represent your internal product confidence that this tool will materially help the user execute THIS level.
- Only output recommendations with confidence_score >= 95.
- Prefer direct execution support over generic wellness advice.
- Recommendations can be apps or physical products.
- The tool name can be free-form, but the category_key must come from the allowed taxonomy below.

Allowed category_key values:
- measurement_tracking
- symptom_tracking
- sleep_support
- nutrition_prep
- hydration_support
- movement_training
- recovery_mobility
- pain_relief_support
- distraction_blocking
- reproductive_health
- consumption_reduction
- workspace_ergonomics

Forbidden recommendation families because they compete with Sophia:
- planning/accountability apps
- routine builders
- habit trackers
- general AI coaches
- guided journals
- environment setup systems
- task managers

Rules:
- No links.
- No marketplaces.
- No long catalogues.
- No more than 2 recommendations per level.
- priority_rank must be unique inside each level and start at 1.
- sophia_overlap_risk must be "low" for every recommendation.
- why_this_level must explain why this tool helps execute this specific level now.
- no_recommendation_reason is required when a level gets 0 tools.

Output shape:
{
  "levels": [
    {
      "target_level_order": 2,
      "target_level_id": "phase_x",
      "no_recommendation_reason": null,
      "recommendations": [
        {
          "priority_rank": 1,
          "tool_type": "product",
          "category_key": "nutrition_prep",
          "subcategory_key": "batch_cooking",
          "display_name": "Lunch box set in glass",
          "brand_name": null,
          "reason": "Concrete reason",
          "why_this_level": "Why it helps this level specifically",
          "confidence_score": 97,
          "sophia_overlap_risk": "low"
        }
      ]
    }
  ]
}

Return JSON only.`;
