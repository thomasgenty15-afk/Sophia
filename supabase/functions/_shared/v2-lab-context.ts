import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { LabScopeKind, PlanTypeClassificationV1 } from "./v2-types.ts";
import { buildTransformationFocusMaterial } from "./v2-transformation-focus.ts";

export type LabTransformationContext = {
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  transformation_title: string;
  user_summary: string;
  focus_context: string;
  free_text: string;
  questionnaire_answers: Record<string, unknown> | null;
  plan_strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  classification: PlanTypeClassificationV1 | null;
};

function isVisibleTransformationStatus(status: unknown) {
  return status !== "abandoned" && status !== "cancelled" && status !== "archived";
}

async function loadOutOfPlanContext(args: {
  admin: SupabaseClient;
  userId: string;
}): Promise<LabTransformationContext> {
  const { admin, userId } = args;

  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("id, user_id, raw_intake_text")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) throw cycleError;
  if (!cycleData) throw new Error("Active cycle not found");

  const { data: transformations, error: transformationsError } = await admin
    .from("user_transformations")
    .select("title, user_summary, status")
    .eq("cycle_id", cycleData.id)
    .order("priority_order", { ascending: true });

  if (transformationsError) throw transformationsError;

  const visibleTransformations = (transformations ?? []).filter((row: any) =>
    isVisibleTransformationStatus(row.status)
  );
  const titles = visibleTransformations
    .map((row: any) => String(row.title ?? "").trim())
    .filter(Boolean);
  const summaries = visibleTransformations
    .map((row: any) => String(row.user_summary ?? "").trim())
    .filter(Boolean)
    .slice(0, 2);

  return {
    cycle_id: String(cycleData.id),
    scope_kind: "out_of_plan",
    transformation_id: null,
    transformation_title: "Hors transformations",
    user_summary: summaries.join(" ") || (
      titles.length > 0
        ? `Contexte general hors plan autour de : ${titles.slice(0, 3).join(", ")}.`
        : "Contexte general hors transformation."
    ),
    focus_context: String(cycleData.raw_intake_text ?? "").trim(),
    free_text: String(cycleData.raw_intake_text ?? "").trim(),
    questionnaire_answers: null,
    plan_strategy: {
      identity_shift: null,
      core_principle: null,
      success_definition: null,
      main_constraint: null,
    },
    classification: null,
  };
}

export async function loadLabScopeContext(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId?: string | null;
  scopeKind?: LabScopeKind;
}): Promise<LabTransformationContext> {
  const scopeKind = args.scopeKind ?? "transformation";
  if (scopeKind === "out_of_plan") {
    return loadOutOfPlanContext({
      admin: args.admin,
      userId: args.userId,
    });
  }

  const transformationId = String(args.transformationId ?? "").trim();
  if (!transformationId) {
    throw new Error("Transformation id is required for transformation scope");
  }

  const { admin, userId } = args;

  const { data: transformationData, error: transformationError } = await admin
    .from("user_transformations")
    .select("id, cycle_id, title, internal_summary, user_summary, success_definition, main_constraint, questionnaire_answers, handoff_payload")
    .eq("id", transformationId)
    .maybeSingle();

  if (transformationError) throw transformationError;
  if (!transformationData) throw new Error("Transformation not found");

  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("id, user_id, raw_intake_text")
    .eq("id", transformationData.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleError || !cycleData) {
    throw new Error("Cycle not found or not owned by user");
  }

  const { data: planData } = await admin
    .from("user_plans_v2")
    .select("content")
    .eq("transformation_id", transformationId)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const content = (planData as { content?: Record<string, unknown> | null } | null)
    ?.content;
  const strategy = isRecord(content?.strategy) ? content?.strategy as Record<string, unknown> : {};
  const focusContext = buildTransformationFocusMaterial({
    transformation: {
      title: transformationData.title ?? null,
      internal_summary: String(transformationData.internal_summary ?? "").trim(),
      user_summary: String(transformationData.user_summary ?? "").trim(),
      success_definition: typeof transformationData.success_definition === "string"
        ? transformationData.success_definition
        : null,
      main_constraint: typeof transformationData.main_constraint === "string"
        ? transformationData.main_constraint
        : null,
    },
  });

  return {
    cycle_id: String(cycleData.id),
    scope_kind: "transformation",
    transformation_id: String(transformationData.id),
    transformation_title: String(transformationData.title ?? "").trim() || "Transformation",
    user_summary: String(transformationData.user_summary ?? "").trim(),
    focus_context: focusContext,
    free_text: focusContext,
    questionnaire_answers: isRecord(transformationData.questionnaire_answers)
      ? transformationData.questionnaire_answers
      : null,
    plan_strategy: {
      identity_shift: typeof strategy.identity_shift === "string"
        ? strategy.identity_shift
        : null,
      core_principle: typeof strategy.core_principle === "string"
        ? strategy.core_principle
        : null,
      success_definition: typeof strategy.success_definition === "string"
        ? strategy.success_definition
        : null,
      main_constraint: typeof strategy.main_constraint === "string"
        ? strategy.main_constraint
        : null,
    },
    classification: extractPlanTypeClassification(
      transformationData.handoff_payload,
    ),
  };
}

export async function loadLabTransformationContext(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
}): Promise<LabTransformationContext> {
  return loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind: "transformation",
  });
}

function extractPlanTypeClassification(
  handoffPayload: unknown,
): PlanTypeClassificationV1 | null {
  if (!isRecord(handoffPayload)) return null;
  const onboarding = handoffPayload.onboarding_v2;
  if (!isRecord(onboarding) || !isRecord(onboarding.plan_type_classification)) {
    return null;
  }

  const classification = onboarding.plan_type_classification;
  return typeof classification.type_key === "string"
    ? classification as PlanTypeClassificationV1
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
