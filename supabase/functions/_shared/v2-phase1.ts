import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type {
  Phase1Context,
  Phase1DeepWhyAnswer,
  Phase1DeepWhyState,
  Phase1LabState,
  Phase1Payload,
  Phase1RecommendedInspiration,
  Phase1RecommendedLabObject,
  Phase1Runtime,
  Phase1RuntimeStatus,
  Phase1StoryPrincipleKey,
  Phase1StoryPrincipleSection,
  Phase1StoryState,
  PlanContentV3,
  PlanTypeClassificationV1,
  UserCycleRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "./v2-types.ts";

const PHASE1_RECOMMENDED_INSPIRATIONS: Phase1RecommendedInspiration[] = [
  "story",
  "deep_why",
  "japanese_principles",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPlanContentV3(value: unknown): value is PlanContentV3 {
  return Boolean(
    isRecord(value) &&
      value.version === 3 &&
      Array.isArray(value.phases),
  );
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function truncateText(value: unknown, maxLen: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function extractPlanTypeClassification(
  handoffPayload: UserTransformationRow["handoff_payload"],
): PlanTypeClassificationV1 | null {
  if (!isRecord(handoffPayload)) return null;
  const onboarding = handoffPayload.onboarding_v2;
  if (!isRecord(onboarding) || !isRecord(onboarding.plan_type_classification)) {
    return null;
  }
  return typeof onboarding.plan_type_classification.type_key === "string"
    ? onboarding.plan_type_classification as PlanTypeClassificationV1
    : null;
}

export function extractPhase1Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): Phase1Payload | null {
  if (!isRecord(handoffPayload) || !isRecord(handoffPayload.phase_1)) {
    return null;
  }

  const payload = handoffPayload.phase_1;
  if (!isRecord(payload.context) || !isRecord(payload.runtime)) {
    return null;
  }

  return payload as Phase1Payload;
}

export function shouldSuggestPhase1SupportCard(args: {
  classification: PlanTypeClassificationV1 | null;
  transformation: Pick<UserTransformationRow, "main_constraint" | "questionnaire_answers">;
  plan: Pick<PlanContentV3, "strategy">;
}): boolean {
  const supportBias = (args.classification?.support_bias ?? []).join(" ").toLowerCase();
  if (
    /emotion|stress|stabil|recovery|soutien|support|regulation|anx|fatigue/.test(
      supportBias,
    )
  ) {
    return true;
  }

  const constraintText = [
    String(args.transformation.main_constraint ?? ""),
    String(args.plan.strategy.main_constraint ?? ""),
  ].join(" ").toLowerCase();
  if (
    /stress|fatigue|epuis|burn|anx|panic|debord|charge|emotion|rechute|solitude|sommeil/.test(
      constraintText,
    )
  ) {
    return true;
  }

  const answers = isRecord(args.transformation.questionnaire_answers)
    ? args.transformation.questionnaire_answers
    : {};
  const flattened = JSON.stringify(answers).toLowerCase();
  return /stress|fatigue|anx|epuis|difficile|replonge|overwhelm|alone|solitude/.test(
    flattened,
  );
}

export function buildPhase1Context(args: {
  cycle: Pick<UserCycleRow, "id">;
  transformation: Pick<
    UserTransformationRow,
    "id" | "user_summary" | "main_constraint" | "questionnaire_answers" | "handoff_payload"
  >;
  planRow: Pick<UserPlanV2Row, "id" | "content">;
  now: string;
}): Phase1Context | null {
  if (!isPlanContentV3(args.planRow.content)) {
    return null;
  }

  const plan = args.planRow.content;
  const phase1 = [...plan.phases].sort((a, b) => a.phase_order - b.phase_order)[0];
  if (!phase1) return null;

  const classification = extractPlanTypeClassification(args.transformation.handoff_payload);
  const recommendedLabObjects: Phase1RecommendedLabObject[] = [
    "defense_card",
    "attack_card",
  ];

  if (
    shouldSuggestPhase1SupportCard({
      classification,
      transformation: args.transformation,
      plan,
    })
  ) {
    recommendedLabObjects.push("support_card");
  }

  return {
    cycle_id: args.cycle.id,
    transformation_id: args.transformation.id,
    plan_id: args.planRow.id,
    plan_type_classification: classification,
    transformation_summary: String(args.transformation.user_summary ?? "").trim(),
    global_objective: plan.global_objective,
    phase_1_objective: phase1.phase_objective ?? null,
    phase_1_heartbeat: phase1.heartbeat?.title ?? null,
    recommended_lab_objects: recommendedLabObjects,
    recommended_inspirations: [...PHASE1_RECOMMENDED_INSPIRATIONS],
    created_at: args.now,
  };
}

export function buildDefaultPhase1Runtime(now: string): Phase1Runtime {
  return {
    status: "pending",
    started_at: null,
    completed_at: null,
    updated_at: now,
    story_viewed_or_validated: false,
    deep_why_answered: false,
    defense_card_ready: false,
    attack_card_ready: false,
    support_card_ready: false,
  };
}

function computePhase1RuntimeStatus(runtime: Phase1Runtime): Phase1RuntimeStatus {
  const mandatoryReady = runtime.story_viewed_or_validated &&
    runtime.deep_why_answered;
  if (mandatoryReady) return "completed";

  const anyProgress = runtime.story_viewed_or_validated ||
    runtime.deep_why_answered ||
    runtime.defense_card_ready ||
    runtime.attack_card_ready ||
    runtime.support_card_ready;
  return anyProgress ? "in_progress" : "pending";
}

export function normalizePhase1Runtime(
  runtime: Partial<Phase1Runtime> | null | undefined,
  now: string,
): Phase1Runtime {
  const next: Phase1Runtime = {
    ...buildDefaultPhase1Runtime(now),
    ...(runtime ?? {}),
    updated_at: now,
  };
  const status = computePhase1RuntimeStatus(next);
  next.status = status;
  next.started_at = next.started_at ?? (status !== "pending" ? now : null);
  next.completed_at = status === "completed" ? (next.completed_at ?? now) : null;
  return next;
}

function normalizePhase1LabState(
  value: Partial<Phase1LabState> | null | undefined,
): Phase1LabState | null {
  if (!value) return null;
  const normalizeCandidates = (
    candidates: unknown,
  ): NonNullable<Phase1LabState["defense_candidates"]> =>
    Array.isArray(candidates)
      ? candidates.flatMap((item) => {
        if (!isRecord(item)) return [];
        const cardId = String(item.card_id ?? "").trim();
        const title = String(item.title ?? "").trim();
        const rationale = typeof item.rationale === "string"
          ? item.rationale.trim()
          : null;
        const selectionState = item.selection_state === "selected" ||
            item.selection_state === "not_selected"
          ? item.selection_state
          : "pending";
        return cardId && title
          ? [{
            card_id: cardId,
            title,
            rationale,
            selection_state: selectionState,
          }]
          : [];
      })
      : [];
  return {
    prepared_at: value.prepared_at ?? null,
    defense_revealed_at:
      typeof value.defense_revealed_at === "string" ? value.defense_revealed_at : null,
    attack_revealed_at:
      typeof value.attack_revealed_at === "string" ? value.attack_revealed_at : null,
    support_card_suggested: Boolean(value.support_card_suggested),
    support_card_reason: value.support_card_reason ?? null,
    defense_card_id: value.defense_card_id ?? null,
    attack_card_id: value.attack_card_id ?? null,
    support_card_id: value.support_card_id ?? null,
    defense_candidates: normalizeCandidates(value.defense_candidates),
    attack_candidates: normalizeCandidates(value.attack_candidates),
  };
}

function normalizePhase1DeepWhyState(
  value: Partial<Phase1DeepWhyState> | null | undefined,
): Phase1DeepWhyState | null {
  if (!value) return null;
  return {
    prepared_at: value.prepared_at ?? null,
    questions: Array.isArray(value.questions)
      ? value.questions.filter((item): item is Phase1DeepWhyState["questions"][number] =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.question === "string" &&
        Array.isArray(item.suggested_answers)
      ).map((item) => ({
        id: item.id,
        question: item.question,
        suggested_answers: toStringArray(item.suggested_answers).slice(0, 2),
      }))
      : [],
    answers: Array.isArray(value.answers)
      ? value.answers.filter((item): item is Phase1DeepWhyAnswer =>
        isRecord(item) &&
        typeof item.question_id === "string" &&
        typeof item.question === "string" &&
        typeof item.answer === "string" &&
        typeof item.answered_at === "string"
      )
      : [],
  };
}

function normalizePhase1StoryState(
  value: Partial<Phase1StoryState> | null | undefined,
): Phase1StoryState | null {
  if (!value) return null;
  const validPrincipleKeys = new Set<Phase1StoryPrincipleKey>([
    "ikigai",
    "kaizen",
    "hara_hachi_bu",
    "wabi_sabi",
    "gambaru",
    "shoshin",
    "kintsugi",
    "ma",
    "zanshin",
    "mottainai",
    "sunao",
    "fudoshin",
  ]);
  const status = value.status === "ready_to_generate" ||
      value.status === "needs_details" ||
      value.status === "generated"
    ? value.status
    : "idle";
  const principleSections: Phase1StoryPrincipleSection[] = Array.isArray(value.principle_sections)
    ? value.principle_sections.flatMap((item) => {
      if (!isRecord(item)) return [];
      const principleKey = String(item.principle_key ?? "").trim() as Phase1StoryPrincipleKey;
      const title = String(item.title ?? "").trim();
      const meaning = String(item.meaning ?? "").trim();
      const inYourStory = String(item.in_your_story ?? "").trim();
      const concreteExample = String(item.concrete_example ?? "").trim();
      if (!validPrincipleKeys.has(principleKey) || !title || !meaning || !inYourStory || !concreteExample) {
        return [];
      }
      return [{
        principle_key: principleKey,
        title,
        meaning,
        in_your_story: inYourStory,
        concrete_example: concreteExample,
      }];
    })
    : [];
  return {
    status,
    detail_questions: toStringArray(value.detail_questions),
    details_answer: typeof value.details_answer === "string" ? value.details_answer : null,
    story_prompt_hints: toStringArray(value.story_prompt_hints),
    intro: typeof value.intro === "string" ? value.intro : null,
    key_takeaway: typeof value.key_takeaway === "string" ? value.key_takeaway : null,
    principle_sections: principleSections,
    story: typeof value.story === "string" ? value.story : null,
    generated_at: typeof value.generated_at === "string" ? value.generated_at : null,
  };
}

export function mergePhase1Payload(args: {
  handoffPayload: UserTransformationRow["handoff_payload"];
  context?: Phase1Context | null;
  runtime?: Partial<Phase1Runtime> | null;
  lab?: Partial<Phase1LabState> | null;
  deepWhy?: Partial<Phase1DeepWhyState> | null;
  story?: Partial<Phase1StoryState> | null;
  now: string;
}): Record<string, unknown> {
  const current = isRecord(args.handoffPayload) ? { ...args.handoffPayload } : {};
  const currentPhase1 = extractPhase1Payload(args.handoffPayload);

  const runtime = normalizePhase1Runtime(
    {
      ...(currentPhase1?.runtime ?? {}),
      ...(args.runtime ?? {}),
    },
    args.now,
  );
  const lab = normalizePhase1LabState({
    ...(currentPhase1?.lab ?? {}),
    ...(args.lab ?? {}),
  });
  const deep_why = normalizePhase1DeepWhyState({
    ...(currentPhase1?.deep_why ?? {}),
    ...(args.deepWhy ?? {}),
  });
  const story = normalizePhase1StoryState({
    ...(currentPhase1?.story ?? {}),
    ...(args.story ?? {}),
  });

  return {
    ...current,
    phase_1: {
      context: args.context ?? currentPhase1?.context ?? null,
      runtime,
      lab,
      deep_why,
      story,
    },
  };
}

function getFirstNameFromFullName(fullName: string | null): string | null {
  const candidate = String(fullName ?? "").trim();
  if (!candidate) return null;
  return candidate.split(/\s+/)[0] ?? null;
}

function calculateAgeFromBirthDate(
  birthDate: string | null,
  nowIso: string,
): number | null {
  if (!birthDate) return null;

  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const now = new Date(nowIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) return null;

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export async function loadPhase1GenerationContext(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  planRow: UserPlanV2Row;
  plan: PlanContentV3;
  classification: PlanTypeClassificationV1 | null;
  phase1: Phase1Payload | null;
  profileFirstName: string | null;
  userAge: number | null;
  userGender: string | null;
  planLevelsCount: number;
  journeyPartNumber: number | null;
  journeyTotalParts: number | null;
  journeyContinuationHint: string | null;
  previousCompletedTransformation: string | null;
}> {
  const transformationResult = await args.admin
    .from("user_transformations")
    .select("*")
    .eq("id", args.transformationId)
    .maybeSingle();

  if (transformationResult.error || !transformationResult.data) {
    throw new Error("Transformation not found");
  }

  const transformation = transformationResult.data as UserTransformationRow;
  const cycleResult = await args.admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (cycleResult.error || !cycleResult.data) {
    throw new Error("Cycle not found or not owned by user");
  }

  const planResult = await args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("transformation_id", args.transformationId)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planResult.error || !planResult.data || !isPlanContentV3(planResult.data.content)) {
    throw new Error("Active V3 plan not found");
  }

  const profileResult = await args.admin
    .from("profiles")
    .select("full_name")
    .eq("id", args.userId)
    .maybeSingle();

  const cycleTransformationsResult = await args.admin
    .from("user_transformations")
    .select("*")
    .eq("cycle_id", transformation.cycle_id)
    .order("priority_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (cycleTransformationsResult.error) {
    throw new Error("Failed to load cycle transformations for phase 1 context");
  }

  const visibleTransformations = ((cycleTransformationsResult.data as UserTransformationRow[] | null) ?? [])
    .filter((item) => item.status !== "cancelled" && item.status !== "abandoned" && item.status !== "archived");
  const currentIndex = visibleTransformations.findIndex((item) => item.id === transformation.id);
  const journeyPartNumber = currentIndex >= 0 ? currentIndex + 1 : null;
  const journeyTotalParts = visibleTransformations.length === 2 ? 2 : null;
  const previousTransformation = currentIndex > 0
    ? visibleTransformations[currentIndex - 1] ?? null
    : null;
  const previousCompletedTransformation = previousTransformation?.status === "completed"
    ? (() => {
      const title = String(
        previousTransformation.title ?? `Transformation ${previousTransformation.priority_order}`,
      ).trim();
      const summary = truncateText(
        previousTransformation.completion_summary ?? previousTransformation.user_summary,
        180,
      );
      return summary ? `${title}: ${summary}` : title;
    })()
    : null;
  const journeyContinuationHint = journeyPartNumber != null && journeyTotalParts === 2
    ? journeyPartNumber === 1
      ? "Cette transformation ouvre la première partie d'un parcours en 2 parties."
      : previousCompletedTransformation
      ? "Cette transformation prolonge directement ce qui a déjà été construit dans la partie précédente."
      : `Cette transformation correspond à la partie ${journeyPartNumber} sur 2 du parcours.`
    : null;

  return {
    cycle: cycleResult.data as UserCycleRow,
    transformation,
    planRow: planResult.data as UserPlanV2Row,
    plan: planResult.data.content as PlanContentV3,
    classification: extractPlanTypeClassification(transformation.handoff_payload),
    phase1: extractPhase1Payload(transformation.handoff_payload),
    profileFirstName: getFirstNameFromFullName(
      profileResult.error ? null : String((profileResult.data as Record<string, unknown> | null)?.full_name ?? ""),
    ),
    userAge: calculateAgeFromBirthDate(
      (cycleResult.data as UserCycleRow).birth_date_snapshot,
      new Date().toISOString(),
    ),
    userGender: (cycleResult.data as UserCycleRow).gender_snapshot,
    planLevelsCount: (planResult.data.content as PlanContentV3).phases.length,
    journeyPartNumber,
    journeyTotalParts,
    journeyContinuationHint,
    previousCompletedTransformation,
  };
}
