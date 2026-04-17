import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import {
  extractOnboardingV2Payload,
  mergeProfessionalSupport,
  PROFESSIONAL_SUPPORT_CATALOG_DESCRIPTION,
  PROFESSIONAL_SUPPORT_KEYS,
} from "./professional-support.ts";
import { z } from "./http.ts";
import type {
  PlanContentV3,
  ProfessionalSupportKey,
  ProfessionalSupportRecommendationStatus,
  ProfessionalSupportTimingKind,
  ProfessionalSupportV1,
  UserCycleRow,
  UserPlanV2Row,
  UserProfessionalSupportRecommendationRow,
  UserTransformationRow,
} from "./v2-types.ts";

const PROFESSIONAL_SUPPORT_KEY_ENUM = z.enum(
  PROFESSIONAL_SUPPORT_KEYS as [ProfessionalSupportKey, ...ProfessionalSupportKey[]],
);

const ENRICHED_RECOMMENDATION_SCHEMA = z.object({
  key: PROFESSIONAL_SUPPORT_KEY_ENUM,
  reason: z.string().min(1).max(220),
  priority_rank: z.number().int().min(1).max(3),
  timing_kind: z.enum([
    "now",
    "after_phase1",
    "during_target_level",
    "before_next_level",
    "if_blocked",
  ] satisfies [ProfessionalSupportTimingKind, ...ProfessionalSupportTimingKind[]]),
  target_level_order: z.number().int().min(1).max(12).nullable(),
  timing_reason: z.string().min(1).max(240),
}).superRefine((value, ctx) => {
  if (
    (value.timing_kind === "during_target_level" ||
      value.timing_kind === "before_next_level") &&
    value.target_level_order == null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "target_level_order is required for level-based timing kinds",
      path: ["target_level_order"],
    });
  }
});

const ENRICHED_SUPPORT_SCHEMA = z.object({
  should_recommend: z.boolean(),
  recommendation_level: z.enum(["optional", "recommended"]),
  summary: z.string().min(1).max(320).nullable(),
  recommendations: z.array(ENRICHED_RECOMMENDATION_SCHEMA).max(3),
}).superRefine((value, ctx) => {
  const uniqueKeys = new Set<string>();
  const uniqueRanks = new Set<number>();

  for (const recommendation of value.recommendations) {
    if (uniqueKeys.has(recommendation.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate professional key ${recommendation.key}`,
        path: ["recommendations"],
      });
    }
    uniqueKeys.add(recommendation.key);

    if (uniqueRanks.has(recommendation.priority_rank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate priority rank ${recommendation.priority_rank}`,
        path: ["recommendations"],
      });
    }
    uniqueRanks.add(recommendation.priority_rank);
  }

  if (!value.should_recommend) {
    if (value.summary !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "summary must be null when should_recommend is false",
        path: ["summary"],
      });
    }
    if (value.recommendations.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recommendations must be empty when should_recommend is false",
        path: ["recommendations"],
      });
    }
    return;
  }

  if (!value.summary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "summary is required when should_recommend is true",
      path: ["summary"],
    });
  }
  if (value.recommendations.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "recommendations must contain at least one item when should_recommend is true",
      path: ["recommendations"],
    });
  }
});

export class ProfessionalSupportV2Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProfessionalSupportV2Error";
    this.status = status;
  }
}

export async function loadProfessionalSupportPlanContext(args: {
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
    throw new ProfessionalSupportV2Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }
  if (!transformationData) {
    throw new ProfessionalSupportV2Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await args.admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (cycleError) {
    throw new ProfessionalSupportV2Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new ProfessionalSupportV2Error(404, "Cycle not found for this user");
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
    throw new ProfessionalSupportV2Error(500, "Failed to load active plan", {
      cause: planError,
    });
  }
  if (!planData) {
    throw new ProfessionalSupportV2Error(409, "A validated plan is required before classifying professional support");
  }

  const planRow = planData as UserPlanV2Row;
  const plan = planRow.content as unknown as PlanContentV3;
  if (!plan || plan.version !== 3 || !Array.isArray(plan.phases)) {
    throw new ProfessionalSupportV2Error(500, "Active plan is invalid");
  }

  return {
    cycle: cycleData as UserCycleRow,
    transformation,
    planRow,
    plan,
  };
}

export async function classifyAndPersistProfessionalSupport(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  planRow: UserPlanV2Row;
  plan: PlanContentV3;
}): Promise<{
  professionalSupport: ProfessionalSupportV1;
  recommendations: UserProfessionalSupportRecommendationRow[];
}> {
  const questionnaireAnswers = isRecord(args.transformation.questionnaire_answers)
    ? args.transformation.questionnaire_answers
    : {};
  const questionnaireSchema = isRecord(args.transformation.questionnaire_schema)
    ? args.transformation.questionnaire_schema
    : {};

  if (Object.keys(questionnaireAnswers).length === 0) {
    throw new ProfessionalSupportV2Error(
      400,
      "Questionnaire answers are required before classifying professional support",
    );
  }

  const raw = await generateWithGemini(
    PROFESSIONAL_SUPPORT_V2_SYSTEM_PROMPT,
    buildProfessionalSupportV2UserPrompt({
      cycle: args.cycle,
      transformation: args.transformation,
      plan: args.plan,
      questionnaireAnswers,
      questionnaireSchema,
    }),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: `${args.requestId}:classify-professional-support-v2`,
      source: "classify-professional-support-v2",
      userId: args.userId,
      model: getGlobalAiModel(),
      maxRetries: 3,
      httpTimeoutMs: 90_000,
    },
  );

  if (typeof raw !== "string") {
    throw new ProfessionalSupportV2Error(
      500,
      "LLM returned an unsupported response while classifying professional support",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProfessionalSupportV2Error(
      500,
      "LLM returned invalid JSON for the professional support classification",
      { cause: error },
    );
  }

  const validation = ENRICHED_SUPPORT_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    throw new ProfessionalSupportV2Error(
      500,
      "LLM returned a professional support classification that failed schema validation",
      { cause: validation.error },
    );
  }

  const professionalSupport = validation.data satisfies ProfessionalSupportV1;
  const now = new Date().toISOString();
  const latestHandoffPayload = await loadLatestTransformationHandoffPayload({
    admin: args.admin,
    transformationId: args.transformation.id,
  });
  const nextHandoffPayload = mergeProfessionalSupport(
    latestHandoffPayload,
    professionalSupport,
  );

  const { error: transformationUpdateError } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: nextHandoffPayload as unknown as Record<string, unknown>,
      updated_at: now,
    } as never)
    .eq("id", args.transformation.id);

  if (transformationUpdateError) {
    throw new ProfessionalSupportV2Error(
      500,
      "Failed to persist professional support summary",
      { cause: transformationUpdateError },
    );
  }

  const { data: existingRows, error: existingError } = await args.admin
    .from("user_professional_support_recommendations")
    .select("*")
    .eq("transformation_id", args.transformation.id);

  if (existingError) {
    throw new ProfessionalSupportV2Error(
      500,
      "Failed to load existing professional support recommendations",
      { cause: existingError },
    );
  }

  const existingRecommendations =
    (existingRows as UserProfessionalSupportRecommendationRow[] | null) ?? [];
  const existingByKey = new Map(
    existingRecommendations.map((row) => [row.professional_key, row]),
  );
  const nextKeys = new Set(
    professionalSupport.recommendations.map((recommendation) => recommendation.key),
  );

  for (const existing of existingRecommendations) {
    if (!nextKeys.has(existing.professional_key) && existing.is_active) {
      const { error } = await args.admin
        .from("user_professional_support_recommendations")
        .update({
          is_active: false,
          updated_at: now,
        } as never)
        .eq("id", existing.id);
      if (error) {
        throw new ProfessionalSupportV2Error(
          500,
          "Failed to deactivate stale professional support recommendations",
          { cause: error },
        );
      }
    }
  }

  const rows: UserProfessionalSupportRecommendationRow[] = [];

  for (const recommendation of professionalSupport.recommendations) {
    const existing = existingByKey.get(recommendation.key);
    const targetPhaseId = resolveTargetPhaseIdForRecommendation(args.plan, recommendation.target_level_order ?? null);
    const preservedStatus: ProfessionalSupportRecommendationStatus =
      existing?.status ?? "pending";
    const nextRow = {
      user_id: args.userId,
      cycle_id: args.cycle.id,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      professional_key: recommendation.key,
      priority_rank: recommendation.priority_rank ?? 1,
      recommendation_level: professionalSupport.recommendation_level,
      summary: professionalSupport.summary,
      reason: recommendation.reason,
      timing_kind: recommendation.timing_kind ?? "now",
      target_phase_id: targetPhaseId,
      target_level_order: recommendation.target_level_order ?? null,
      timing_reason: recommendation.timing_reason ?? recommendation.reason,
      status: preservedStatus,
      is_active: true,
      metadata: {},
      generated_at: existing?.generated_at ?? now,
      updated_at: now,
    } satisfies Omit<UserProfessionalSupportRecommendationRow, "id">;

    let persisted: UserProfessionalSupportRecommendationRow | null = null;

    if (existing) {
      const timingChanged = hasTimingChanged(existing, nextRow);
      const { data, error } = await args.admin
        .from("user_professional_support_recommendations")
        .update(nextRow as never)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        throw new ProfessionalSupportV2Error(
          500,
          "Failed to update professional support recommendation",
          { cause: error },
        );
      }

      persisted = data as UserProfessionalSupportRecommendationRow;

      if (timingChanged) {
        await insertProfessionalSupportEvent({
          admin: args.admin,
          recommendationId: persisted.id,
          userId: args.userId,
          cycleId: args.cycle.id,
          transformationId: args.transformation.id,
          planId: args.planRow.id,
          eventType: "retimed_after_plan_change",
          payload: {
            previous: {
              timing_kind: existing.timing_kind,
              target_level_order: existing.target_level_order,
              target_phase_id: existing.target_phase_id,
              timing_reason: existing.timing_reason,
            },
            next: {
              timing_kind: persisted.timing_kind,
              target_level_order: persisted.target_level_order,
              target_phase_id: persisted.target_phase_id,
              timing_reason: persisted.timing_reason,
            },
          },
        });
      }
    } else {
      const { data, error } = await args.admin
        .from("user_professional_support_recommendations")
        .insert(nextRow as never)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        throw new ProfessionalSupportV2Error(
          500,
          "Failed to insert professional support recommendation",
          { cause: error },
        );
      }

      persisted = data as UserProfessionalSupportRecommendationRow;
      await insertProfessionalSupportEvent({
        admin: args.admin,
        recommendationId: persisted.id,
        userId: args.userId,
        cycleId: args.cycle.id,
        transformationId: args.transformation.id,
        planId: args.planRow.id,
        eventType: "generated",
        payload: {
          professional_key: persisted.professional_key,
          priority_rank: persisted.priority_rank,
          timing_kind: persisted.timing_kind,
          target_level_order: persisted.target_level_order,
        },
      });
    }

    rows.push(persisted);
  }

  return {
    professionalSupport,
    recommendations: rows.sort((a, b) => a.priority_rank - b.priority_rank),
  };
}

function hasTimingChanged(
  existing: UserProfessionalSupportRecommendationRow,
  nextRow: Omit<UserProfessionalSupportRecommendationRow, "id">,
): boolean {
  return existing.timing_kind !== nextRow.timing_kind ||
    existing.target_level_order !== nextRow.target_level_order ||
    existing.target_phase_id !== nextRow.target_phase_id ||
    existing.timing_reason !== nextRow.timing_reason;
}

async function insertProfessionalSupportEvent(args: {
  admin: SupabaseClient;
  recommendationId: string;
  userId: string;
  cycleId: string;
  transformationId: string;
  planId: string;
  eventType:
    | "generated"
    | "dismissed_not_needed"
    | "marked_booked"
    | "marked_completed"
    | "retimed_after_plan_change";
  payload: Record<string, unknown>;
}) {
  const { error } = await args.admin
    .from("user_professional_support_events")
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
    throw new ProfessionalSupportV2Error(
      500,
      "Failed to persist professional support event",
      { cause: error },
    );
  }
}

function resolveTargetPhaseIdForRecommendation(
  plan: PlanContentV3,
  targetLevelOrder: number | null,
): string | null {
  if (targetLevelOrder == null) return null;
  const phase = plan.phases.find((entry) => entry.phase_order === targetLevelOrder);
  if (phase?.phase_id) return phase.phase_id;

  const blueprintPhase = plan.plan_blueprint?.levels.find((entry) =>
    entry.level_order === targetLevelOrder
  );
  return blueprintPhase?.phase_id ?? null;
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
    throw new ProfessionalSupportV2Error(
      500,
      "Failed to reload transformation handoff payload",
      { cause: error },
    );
  }
  return (data as { handoff_payload?: Record<string, unknown> | null } | null)
    ?.handoff_payload ?? null;
}

function buildProfessionalSupportV2UserPrompt(input: {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  questionnaireAnswers: Record<string, unknown>;
  questionnaireSchema: Record<string, unknown>;
}): string {
  const ageYears = calculateAgeFromBirthDate(input.cycle.birth_date_snapshot);
  const biologicalSexSnapshot = normalizeBiologicalSex(input.cycle.gender_snapshot);
  const profileLines = [
    ageYears != null ? `- Age years: ${ageYears}` : null,
    input.cycle.birth_date_snapshot
      ? `- Birth date snapshot: ${input.cycle.birth_date_snapshot}`
      : null,
    biologicalSexSnapshot
      ? `- Biological sex snapshot: ${biologicalSexSnapshot}`
      : null,
    input.cycle.gender_snapshot && !biologicalSexSnapshot
      ? `- Stored sex/gender raw value: ${input.cycle.gender_snapshot}`
      : null,
  ].filter(Boolean).join("\n");

  const onboardingV2 = extractOnboardingV2Payload(input.transformation.handoff_payload);
  const futureLevels = Array.isArray(input.plan.plan_blueprint?.levels)
    ? input.plan.plan_blueprint.levels.map((level) => ({
      level_order: level.level_order,
      title: level.title,
      intention: level.intention,
      estimated_duration_weeks: level.estimated_duration_weeks,
      preview_summary: level.preview_summary,
    }))
    : [];

  return `## Transformation

- Title: ${String(input.transformation.title ?? "").trim() || "Untitled transformation"}
- Internal summary: ${input.transformation.internal_summary}
- User summary: ${input.transformation.user_summary}
- Success definition: ${String(input.transformation.success_definition ?? "").trim() || "Not provided"}
- Main constraint: ${String(input.transformation.main_constraint ?? "").trim() || "Not provided"}

## Profile

${profileLines || "- No profile snapshot"}

## Existing classification hints

${JSON.stringify({
    plan_type_classification: onboardingV2.plan_type_classification ?? null,
    questionnaire_context: onboardingV2.questionnaire_context ?? null,
  }, null, 2)}

## Product timing model

- Sophia has a universal foundation step before the generated plan levels. Use timing_kind = "after_phase1" if the recommendation should appear only once that foundation step is done.
- Generated plan levels start at level_order ${input.plan.current_level_runtime?.level_order ?? 1}.
- Use target_level_order only when the recommendation is meaningfully tied to a specific generated level.

## Current generated level

${JSON.stringify(input.plan.current_level_runtime ?? null, null, 2)}

## Future generated levels

${JSON.stringify(futureLevels, null, 2)}

## Questionnaire schema

${JSON.stringify(input.questionnaireSchema, null, 2)}

## Questionnaire answers

${JSON.stringify(input.questionnaireAnswers, null, 2)}

Return the JSON classification only.`;
}

function calculateAgeFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const date = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - date.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= 0 && age <= 120 ? age : null;
}

function normalizeBiologicalSex(value: string | null): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["male", "man", "m", "homme"].includes(normalized)) return "male";
  if (["female", "woman", "f", "femme"].includes(normalized)) return "female";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PROFESSIONAL_SUPPORT_V2_SYSTEM_PROMPT =
  `You classify whether a Sophia transformation would benefit from a calm recommendation to seek help from one or more professionals after the plan has been validated.

This is NOT triage, diagnosis, or emergency guidance.
Your goal is to produce a product-safe recommendation block plus timing guidance tied to the user's generated plan.

Available professional keys:
${PROFESSIONAL_SUPPORT_CATALOG_DESCRIPTION}

Rules:
- Recommend between 0 and 3 professionals.
- Only recommend a professional if there is a concrete reason tied to the transformation and questionnaire.
- Prefer precision over breadth.
- When age or biological sex is relevant, explicitly take into account the provided age_years and biological_sex_snapshot.
- For sex-specific professionals such as urologist, andrologist, gynecologist, midwife, fertility specialist, or pelvic floor physio, only recommend them when the transformation and profile context justify it.
- If the case does not clearly benefit from external professional help, return should_recommend=false.
- recommendation_level:
  - optional: could help but not central
  - recommended: likely to materially improve the user's chances
- summary must be short, concrete, and personalized to the transformation.
- Each recommendation.reason must explain why this professional is relevant in this specific case.
- priority_rank must be unique and start at 1.
- timing_kind must be one of:
  - now
  - after_phase1
  - during_target_level
  - before_next_level
  - if_blocked
- target_level_order should be null unless the recommendation is clearly tied to a generated level.
- timing_reason must explain why this is the right moment in the journey.
- Each recommendation object MUST use the property name "key" exactly.
- Do not mention links, products, marketplaces, brands, or clinics.
- Do not mention emergencies, danger, crisis, or urgent warnings.
- Do not over-medicalize routine self-improvement topics.
- Output shape:
{
  "should_recommend": true,
  "recommendation_level": "recommended",
  "summary": "Short personalized summary",
  "recommendations": [
    {
      "key": "general_practitioner",
      "reason": "Concrete reason",
      "priority_rank": 1,
      "timing_kind": "after_phase1",
      "target_level_order": null,
      "timing_reason": "Why the timing makes sense"
    }
  ]
}
- Return JSON only.`;
