import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, RefreshCcw } from "lucide-react";

import { FreeTextCapture } from "../components/onboarding-v2/FreeTextCapture";
import { TransformationFocusStep } from "../components/onboarding-v2/TransformationFocusStep";
import { PlanGenerationScreen } from "../components/onboarding-v2/PlanGenerationScreen";
import { PlanReviewScreen } from "../components/onboarding-v2/PlanReviewScreen";
import { CustomQuestionnaire } from "../components/onboarding-v2/CustomQuestionnaire";
import { MinimalProfile } from "../components/onboarding-v2/MinimalProfile";
import { ProgressiveLoader } from "../components/onboarding-v2/ProgressiveLoader";
import { useAuth } from "../context/AuthContext";
import {
  clearOnboardingV2Draft,
  createEmptyOnboardingV2Draft,
  flushDraftSync,
  generateCycleDraftQuestionnaireGuest,
  getStoredAnonymousSessionId,
  hydrateDraftAfterAuth,
  intakeToTransformationsGuest,
  type JourneyContextTransition,
  loadDraftFromServer,
  loadOnboardingV2Draft,
  type OnboardingV2Draft,
  type PlanReviewDraft,
  persistOnboardingV2DraftLocally,
  type RoadmapTransitionDraft,
  type QuestionnaireSchemaV2,
  saveOnboardingV2Draft,
  toTransformationPreview,
  type TransformationPreviewV2,
} from "../lib/onboardingV2";
import { resolveOnboardingBackAction } from "../lib/onboardingBackNavigation";
import {
  isMultiPartTransitionQuestionnaireSchema,
  MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE,
} from "../lib/multiPartTransitionQuestionnaire";
import { newRequestId, requestHeaders } from "../lib/requestId";
import { supabase } from "../lib/supabase";
import type {
  PlanContentV3,
  PlanTypeClassificationV1,
} from "../types/v2";

type IntakeToTransformationsResponse = {
  cycle_id: string;
  status: OnboardingV2Draft["cycle_status"];
  needs_clarification: boolean;
  clarification_prompt: string | null;
  transformations: Array<{
    id: string;
    cycle_id: string;
    priority_order: number;
    status: TransformationPreviewV2["status"];
    title: string | null;
    internal_summary: string;
    user_summary: string;
    source_group_index: number | null;
    questionnaire_context: string[];
    ordering_rationale: string | null;
    recommended_order: number;
    recommended_progress_indicator: string | null;
  }>;
};

type GenerateQuestionnaireResponse = {
  cycle_id: string;
  cycle_status: OnboardingV2Draft["cycle_status"];
  transformation_id: string;
  schema?: QuestionnaireSchemaV2;
  questions: QuestionnaireSchemaV2["questions"];
};

type GeneratePlanResponse = {
  request_id: string;
  transformation_id: string;
  cycle_id: string;
  plan_id: string;
  plan_version: number;
  generation_attempts: number;
  distributed_items_count: number;
  event_warnings: string[];
  plan_preview?: PlanContentV3;
  plan_status?: string;
  roadmap_changed?: boolean;
  journey_context?: JourneyContextTransition | null;
};

type ClassifyPlanTypeResponse = {
  request_id: string;
  transformation_id: string;
  cycle_id: string;
  classification: PlanTypeClassificationV1;
};

type DraftTransformationFromTextResponse = {
  request_id: string;
  analysis: {
    updated_existing_transformations: Array<{
      id: string;
      title: string;
      internal_summary: string;
      user_summary: string;
      questionnaire_context: string[];
    }>;
    new_transformations: Array<{
      title: string;
      internal_summary: string;
      user_summary: string;
      questionnaire_context: string[];
    }>;
    recommended_selection: {
      kind: "existing" | "new";
      existing_transformation_id?: string | null;
      new_transformation_index?: number | null;
    };
  };
  // Authoritative list of transformations still open for this cycle at the
  // moment the edge function ran. The frontend should use this as the merge
  // base so that LLM "updated_existing_transformations" entries can always be
  // matched, even when the local draft.transformations was cleared/out-of-sync.
  open_transformations?: Array<{
    id: string;
    title: string | null;
    internal_summary: string;
    user_summary: string;
    priority_order: number | null;
    status: string;
  }>;
};

type PlanRegenerationVariant = "shorter" | "longer";

const QUICK_PLAN_REGENERATION_FEEDBACK: Record<PlanRegenerationVariant, string> = {
  shorter: [
    "Je veux une version plus courte de ce plan.",
    "Prends le plan précédent comme base de travail.",
    "Conserve les éléments les plus utiles déjà présents quand ils sont bons.",
    "Réduis la durée totale et le nombre d'étapes.",
    "Simplifie surtout le niveau courant pour qu'il soit plus direct et plus rapide à lancer.",
    "Évite d'ajouter de nouvelles couches ou des détours inutiles.",
  ].join("\n"),
  longer: [
    "Je veux une version plus longue de ce plan.",
    "Prends le plan précédent comme base de travail.",
    "Conserve les éléments les plus utiles déjà présents quand ils sont bons.",
    "Allonge la progression avec plus d'étapes intermédiaires et une montée en charge plus progressive.",
    "Si besoin, augmente la durée totale pour laisser plus de temps d'intégration.",
    "N'alourdis pas brutalement le premier niveau ; étale plutôt l'effort dans le temps.",
  ].join("\n"),
};

function buildPlanRegenerationFeedback(
  currentFeedback: string,
  variant?: PlanRegenerationVariant,
): string {
  const trimmedFeedback = currentFeedback.trim();
  const quickFeedback = variant ? QUICK_PLAN_REGENERATION_FEEDBACK[variant] : "";

  if (quickFeedback && trimmedFeedback) {
    return `${quickFeedback}\n\nFeedback complémentaire utilisateur :\n${trimmedFeedback}`;
  }

  return quickFeedback || trimmedFeedback;
}

function questionnaireAnswersEqual(
  left: Record<string, unknown>,
  right: Record<string, string | string[]>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of rightKeys) {
    const leftValue = left[key];
    const rightValue = right[key];

    if (typeof rightValue === "string") {
      if (leftValue !== rightValue) return false;
      continue;
    }

    if (!Array.isArray(leftValue) || leftValue.length !== rightValue.length) {
      return false;
    }

    if (leftValue.some((value, index) => value !== rightValue[index])) {
      return false;
    }
  }

  return true;
}

function deriveManualTransformationTitle(rawText: string): string {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (!normalized) return "Nouveau sujet prioritaire";

  const firstSentence = normalized.split(/[.!?\n]/)[0]?.trim() ?? normalized;
  const withoutLead = firstSentence
    .replace(/^(alors là|j'ai envie de|je veux|je voudrais|le but c'?est de|mon sujet c'?est)\s+/i, "")
    .trim();
  const candidate = withoutLead || firstSentence;

  return candidate.length > 72 ? `${candidate.slice(0, 69).trim()}...` : candidate;
}

function buildManualTransformationFromCapture(args: {
  rawText: string;
  cycleId: string | null;
  existingTransformations: TransformationPreviewV2[];
  aiDraft?: DraftTransformationFromTextResponse["analysis"]["new_transformations"][number] | null;
  priorityOrder?: number | null;
}): TransformationPreviewV2 {
  const normalized = args.rawText.replace(/\s+/g, " ").trim();
  const maxPriority = Math.max(
    0,
    ...args.existingTransformations.map((item) => item.priority_order ?? 0),
  );
  const aiDraft = args.aiDraft ?? null;
  const priorityOrder = args.priorityOrder ?? maxPriority + 1;

  return {
    id: `manual-${crypto.randomUUID()}`,
    cycle_id: args.cycleId ?? "",
    priority_order: priorityOrder,
    recommended_order: null,
    recommended_progress_indicator: null,
    status: "pending",
    title: aiDraft?.title?.trim() || deriveManualTransformationTitle(normalized),
    internal_summary: aiDraft?.internal_summary?.trim() ||
      (`Transformation ajoutée depuis le texte libre utilisateur. ` +
        `Sujet brut: ${normalized}`),
    user_summary: aiDraft?.user_summary?.trim() ||
      normalized ||
      "Tu as ajouté un nouveau sujet prioritaire à intégrer dans la suite du cycle.",
    questionnaire_context: Array.isArray(aiDraft?.questionnaire_context)
      ? aiDraft.questionnaire_context
      : [],
    questionnaire_schema: null,
    questionnaire_answers: null,
    source_group_index: null,
    ordering_rationale: null,
    selection_context: null,
    is_manual: true,
  };
}

function applyDraftTransformationAnalysis(args: {
  currentTransformations: TransformationPreviewV2[];
  cycleId: string | null;
  rawText: string;
  analysis: DraftTransformationFromTextResponse["analysis"];
}): {
  transformations: TransformationPreviewV2[];
  selectedTransformationId: string;
} | null {
  const updatedById = new Map(
    args.analysis.updated_existing_transformations.map((transformation) => [
      transformation.id,
      transformation,
    ]),
  );

  const nextTransformations = args.currentTransformations.map((transformation) => {
    const update = updatedById.get(transformation.id);
    if (!update) return transformation;
    return {
      ...transformation,
      title: update.title,
      internal_summary: update.internal_summary,
      user_summary: update.user_summary,
      questionnaire_context: update.questionnaire_context,
      questionnaire_schema: null,
      questionnaire_answers: null,
      selection_context: null,
    };
  });

  const nextPriorityBase = Math.max(
    0,
    ...nextTransformations.map((item) => item.priority_order ?? 0),
  );
  const createdTransformations = args.analysis.new_transformations.map((transformation, index) =>
    buildManualTransformationFromCapture({
      rawText: args.rawText,
      cycleId: args.cycleId,
      existingTransformations: nextTransformations,
      aiDraft: transformation,
      priorityOrder: nextPriorityBase + index + 1,
    })
  );

  const mergedTransformations = [...nextTransformations, ...createdTransformations];
  if (mergedTransformations.length === 0) return null;

  let selectedTransformationId: string | null = null;
  if (args.analysis.recommended_selection.kind === "existing") {
    selectedTransformationId =
      args.analysis.recommended_selection.existing_transformation_id ?? null;
  } else {
    const selectedNewIndex = args.analysis.recommended_selection.new_transformation_index ?? -1;
    selectedTransformationId = createdTransformations[selectedNewIndex]?.id ?? null;
  }

  if (!selectedTransformationId) {
    selectedTransformationId =
      createdTransformations[0]?.id ??
      args.analysis.updated_existing_transformations[0]?.id ??
      mergedTransformations[0]?.id ??
      null;
  }

  if (!selectedTransformationId) return null;

  return {
    transformations: mergedTransformations,
    selectedTransformationId,
  };
}

function isPendingCycleTransformation(transformation: TransformationPreviewV2): boolean {
  return transformation.status === "ready" || transformation.status === "pending";
}

function isManualTransformationId(transformationId: string | null | undefined): boolean {
  return typeof transformationId === "string" && transformationId.startsWith("manual-");
}

// Build a TransformationPreviewV2-shaped entry from the minimal payload the
// edge function returns when there is no richer local candidate available.
function buildPreviewFromServerOpenTransformation(args: {
  entry: NonNullable<DraftTransformationFromTextResponse["open_transformations"]>[number];
  cycleId: string;
}): TransformationPreviewV2 {
  const normalizedStatus = args.entry.status as TransformationPreviewV2["status"];
  return {
    id: args.entry.id,
    cycle_id: args.cycleId,
    priority_order: args.entry.priority_order ?? 0,
    recommended_order: null,
    recommended_progress_indicator: null,
    status: normalizedStatus,
    title: args.entry.title,
    internal_summary: args.entry.internal_summary,
    user_summary: args.entry.user_summary,
    questionnaire_context: [],
    questionnaire_schema: null,
    questionnaire_answers: null,
    source_group_index: null,
    ordering_rationale: null,
    selection_context: null,
    is_manual: false,
  };
}

// Merge the locally-held candidate transformations with the authoritative list
// of open transformations returned by the edge function. Local entries win
// whenever they exist for a given id (they carry extra UI metadata), but any
// id present server-side and missing locally is added back so the LLM's
// `updated_existing_transformations` entries can always be reconciled.
function reconcileCandidateTransformations(args: {
  candidateTransformations: TransformationPreviewV2[];
  serverOpenTransformations: DraftTransformationFromTextResponse["open_transformations"];
  cycleId: string | null;
}): TransformationPreviewV2[] {
  const serverList = args.serverOpenTransformations ?? [];
  if (serverList.length === 0) return args.candidateTransformations;

  const byId = new Map(
    args.candidateTransformations.map((item) => [item.id, item] as const),
  );
  const ordered: TransformationPreviewV2[] = [];
  for (const entry of serverList) {
    const existing = byId.get(entry.id);
    if (existing) {
      ordered.push(existing);
      byId.delete(entry.id);
      continue;
    }
    ordered.push(
      buildPreviewFromServerOpenTransformation({
        entry,
        cycleId: args.cycleId ?? "",
      }),
    );
  }

  // Preserve any strictly-local candidate (e.g. manual-*) not present on the
  // server snapshot, at the end of the list.
  for (const remaining of byId.values()) {
    ordered.push(remaining);
  }

  return ordered;
}

function mergeTransitionDebriefIntoHandoffPayload(args: {
  handoffPayload: Record<string, unknown> | null;
  answers: Record<string, string | string[]>;
  questionnaireSchema: QuestionnaireSchemaV2;
  previousTransformationId: string | null;
}): Record<string, unknown> {
  const current = args.handoffPayload && typeof args.handoffPayload === "object" &&
      !Array.isArray(args.handoffPayload)
    ? { ...args.handoffPayload }
    : {};
  const onboardingV2 = current.onboarding_v2 && typeof current.onboarding_v2 === "object" &&
      !Array.isArray(current.onboarding_v2)
    ? { ...(current.onboarding_v2 as Record<string, unknown>) }
    : {};

  return {
    ...current,
    onboarding_v2: {
      ...onboardingV2,
      transition_debrief: {
        source: MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE,
        previous_transformation_id: args.previousTransformationId,
        answered_at: new Date().toISOString(),
        questionnaire_schema: args.questionnaireSchema,
        answers: args.answers,
      },
    },
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    typeof (error as { context?: unknown }).context === "object"
  ) {
    const context = (error as { context?: { error?: string } }).context;
    if (context?.error) return context.error;
  }
  return fallback;
}

function getErrorStatus(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    (error as { context?: unknown }).context &&
    typeof (error as { context?: unknown }).context === "object"
  ) {
    const context = (error as { context?: { status?: unknown } }).context;
    if (typeof context?.status === "number") return context.status;
  }
  return null;
}

function isPlanGenerationTimeout(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 504) return true;

  const message = getErrorMessage(error, "").toLowerCase();
  return message.includes("gateway time-out") ||
    message.includes("gateway timeout") ||
    message.includes("timed out") ||
    message.includes("timeout");
}

function isPlanContentV3Candidate(value: unknown): value is PlanContentV3 {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    version?: unknown;
    title?: unknown;
    phases?: unknown;
  };
  return candidate.version === 3 &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.phases);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAuthFunctionError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) return true;

  const message = getErrorMessage(error, "").toLowerCase();
  return message.includes("401") || message.includes("403") ||
    message.includes("unauthorized") || message.includes("forbidden");
}

function persistDraft(
  setDraft: Dispatch<SetStateAction<OnboardingV2Draft>>,
  patch: Partial<OnboardingV2Draft>,
  options?: { sync?: boolean },
) {
  setDraft((current) =>
    saveOnboardingV2Draft({
      ...current,
      ...patch,
      profile: {
        ...current.profile,
        ...(patch.profile ?? {}),
      },
    }, options)
  );
}

function mapCrystallizedTransformation(
  row: IntakeToTransformationsResponse["transformations"][number],
): TransformationPreviewV2 {
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    priority_order: row.priority_order,
    recommended_order: row.recommended_order,
    recommended_progress_indicator: row.recommended_progress_indicator,
    status: row.status,
    title: row.title,
    internal_summary: row.internal_summary,
    user_summary: row.user_summary,
    source_group_index: row.source_group_index,
    questionnaire_context: row.questionnaire_context,
    ordering_rationale: row.ordering_rationale,
    selection_context: null,
    is_manual: false,
    questionnaire_schema: null,
    questionnaire_answers: null,
  };
}

function findCurrentTransformation(draft: OnboardingV2Draft) {
  if (draft.active_transformation_id) {
    return draft.transformations.find((item) =>
      item.id === draft.active_transformation_id
    ) ?? null;
  }
  return [...draft.transformations].sort((a, b) =>
    a.priority_order - b.priority_order
  )[0] ?? null;
}

function getRecommendedTransformation(
  transformations: TransformationPreviewV2[],
) {
  return [...transformations].sort((a, b) => {
    const left = a.recommended_order ?? a.priority_order ?? Number.MAX_SAFE_INTEGER;
    const right = b.recommended_order ?? b.priority_order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return (a.title ?? "").localeCompare(b.title ?? "");
  })[0] ?? null;
}

function isDraftHydratableFromServer(draft: OnboardingV2Draft) {
  return !draft.cycle_id && !draft.raw_intake_text.trim() &&
    draft.transformations.length === 0;
}

const DRAFT_STAGE_ORDER: OnboardingV2Draft["stage"][] = [
  "capture",
  "validation",
  "priorities",
  "questionnaire_setup",
  "questionnaire",
  "profile",
  "generating_plan",
  "plan_review",
  "roadmap_transition",
];

function normalizeJourneyContextTransition(
  value: unknown,
): JourneyContextTransition | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const rawParts = Array.isArray(source.parts) ? source.parts : [];
  const parts = rawParts.flatMap((part): JourneyContextTransition["parts"] => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as Record<string, unknown>;
    const transformationId = typeof candidate.transformation_id === "string"
      ? candidate.transformation_id.trim()
      : "";
    const partNumber = typeof candidate.part_number === "number"
      ? candidate.part_number
      : Number(candidate.part_number);
    if (!transformationId || !Number.isFinite(partNumber) || partNumber < 1) {
      return [];
    }
    return [{
      transformation_id: transformationId,
      title: typeof candidate.title === "string" ? candidate.title : null,
      part_number: partNumber,
      estimated_duration_months:
        typeof candidate.estimated_duration_months === "number"
          ? candidate.estimated_duration_months
          : null,
      status: typeof candidate.status === "string"
        ? candidate.status as TransformationPreviewV2["status"]
        : null,
    }];
  });

  const isMultiPart = source.is_multi_part === true;
  if (!isMultiPart) return null;

  return {
    is_multi_part: true,
    part_number: typeof source.part_number === "number" ? source.part_number : null,
    estimated_total_parts:
      typeof source.estimated_total_parts === "number"
        ? source.estimated_total_parts
        : parts.length > 0
        ? parts.length
        : null,
    continuation_hint:
      typeof source.continuation_hint === "string"
        ? source.continuation_hint
        : null,
    estimated_total_duration_months:
      typeof source.estimated_total_duration_months === "number"
        ? source.estimated_total_duration_months
        : null,
    parts,
  };
}

function shouldAdoptServerDraft(
  localDraft: OnboardingV2Draft | null,
  serverDraft: { draft: OnboardingV2Draft; updated_at: string },
) {
  if (!localDraft) return true;

  const localUpdatedAt = Date.parse(localDraft.updated_at);
  const serverUpdatedAt = Date.parse(serverDraft.updated_at);
  if (Number.isNaN(serverUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;

  // The local draft has meaningful content if the user has progressed past step 1,
  // or if there is actual text entered at step 1. An empty/default local draft
  // (fresh tab, cleared storage) should always yield to the server.
  const localHasContent =
    localDraft.stage !== "capture" ||
    localDraft.raw_intake_text.trim().length > 0 ||
    localDraft.aspects.length > 0 ||
    localDraft.transformations.length > 0 ||
    localDraft.entry_mode === "add_transformation" ||
    Boolean(localDraft.cycle_id);

  if (localHasContent) {
    // Guard against a deliberately-reversed navigation being overwritten by a
    // server snapshot at a more advanced stage (e.g. user clicked "← Retour"
    // from the roadmap step but server still has stage = "priorities").
    const localStageIdx = DRAFT_STAGE_ORDER.indexOf(localDraft.stage);
    const serverStageIdx = DRAFT_STAGE_ORDER.indexOf(serverDraft.draft.stage);
    if (localStageIdx >= 0 && serverStageIdx > localStageIdx) {
      return false;
    }

    // Grace window: if local was updated very recently, always prefer it.
    // Guards against server clock being slightly ahead of the client.
    if (Date.now() - localUpdatedAt < 5_000) return false;
  }

  return serverUpdatedAt > localUpdatedAt;
}

function shouldAttemptPostAuthDraftHydration(draft: OnboardingV2Draft) {
  return !draft.cycle_id &&
    (
      draft.pending_auth_action === "analyze" ||
      draft.stage !== "capture"
    );
}

const AUTH_REDIRECT = `/auth?${
  new URLSearchParams({ redirect: "/onboarding-v2" }).toString()
}`;

type OnboardingAuthMode = "checking" | "authenticated" | "guest";

function clearTransformationQuestionnaires(
  transformations: TransformationPreviewV2[],
): TransformationPreviewV2[] {
  return transformations.map((transformation) => ({
    ...transformation,
    questionnaire_schema: null,
    questionnaire_answers: null,
  }));
}

function buildStageResetPatch(
  draft: OnboardingV2Draft,
  targetStage: OnboardingV2Draft["stage"],
): Partial<OnboardingV2Draft> {
  switch (targetStage) {
    case "capture":
      return {
        stage: "capture",
        cycle_status: draft.cycle_id ? "draft" : draft.cycle_status,
        needs_clarification: false,
        clarification_prompt: null,
        aspects: [],
        provisional_groups: [],
        validated_groups: [],
        deferred_aspects: [],
        transformations: [],
        active_transformation_id: null,
        questionnaire_schema: null,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      };
    case "priorities":
      return {
        stage: "priorities",
        cycle_status: draft.cycle_id ? "prioritized" : draft.cycle_status,
        transformations: clearTransformationQuestionnaires(draft.transformations),
        questionnaire_schema: null,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      };
    case "questionnaire":
      return {
        stage: "questionnaire",
        cycle_status: draft.cycle_id ? "questionnaire_in_progress" : draft.cycle_status,
        plan_review: null,
        roadmap_transition: null,
      };
    case "profile":
      return {
        stage: "profile",
        cycle_status: draft.cycle_id ? "profile_pending" : draft.cycle_status,
        plan_review: null,
        roadmap_transition: null,
      };
    default:
      return { stage: targetStage };
  }
}

export default function OnboardingV2() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const postAuthHydrationAttemptRef = useRef<string | null>(null);
  const activeOnboardingActionTokenRef = useRef(0);
  const [draft, setDraft] = useState<OnboardingV2Draft>(() =>
    loadOnboardingV2Draft() ?? createEmptyOnboardingV2Draft()
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<{
    id: "analyze" | "questionnaire" | "plan" | "focus" | "save" | "activate" | null;
    label?: string;
  }>({ id: null });
  const [postAuthHydrating, setPostAuthHydrating] = useState(false);
  const [hydrationRetryKey, setHydrationRetryKey] = useState(0);
  const [storedProfileFields, setStoredProfileFields] = useState({
    birthDate: false,
    gender: false,
    birthDateValue: "",
    genderValue: "",
  });
  const [onboardingAuthMode, setOnboardingAuthMode] = useState<
    OnboardingAuthMode
  >("guest");
  const currentTransformation = useMemo(
    () => findCurrentTransformation(draft),
    [draft],
  );
  const preservedCycleActiveTransformationId = useMemo(() => {
    if (draft.entry_mode !== "add_transformation") return null;
    const candidate = draft.preserved_active_transformation_id?.trim() ?? "";
    if (!candidate || candidate === currentTransformation?.id) return null;
    return candidate;
  }, [
    currentTransformation?.id,
    draft.entry_mode,
    draft.preserved_active_transformation_id,
  ]);
  const effectiveUser = onboardingAuthMode === "authenticated" ? user : null;
  const isMultiPartTransitionFlow = useMemo(
    () =>
      draft.entry_mode === "add_transformation" &&
      isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema),
    [draft.entry_mode, draft.questionnaire_schema],
  );
  const backAction = useMemo(
    () =>
      resolveOnboardingBackAction({
        entryMode: draft.entry_mode,
        stage: draft.stage,
        isMultiPartTransitionFlow,
      }),
    [draft.entry_mode, draft.stage, isMultiPartTransitionFlow],
  );
  const onboardingAuthLoading = authLoading || onboardingAuthMode === "checking";
  const beginOnboardingAction = useCallback((
    state: { id: "analyze" | "questionnaire" | "plan" | "focus" | "save" | "activate"; label: string },
  ) => {
    const token = activeOnboardingActionTokenRef.current + 1;
    activeOnboardingActionTokenRef.current = token;
    setLoadingState(state);
    return token;
  }, []);
  const isOnboardingActionCurrent = useCallback(
    (token: number) => activeOnboardingActionTokenRef.current === token,
    [],
  );
  const finishOnboardingAction = useCallback((token: number) => {
    if (!isOnboardingActionCurrent(token)) return;
    setLoadingState({ id: null });
  }, [isOnboardingActionCurrent]);
  const cancelOnboardingActions = useCallback(() => {
    activeOnboardingActionTokenRef.current += 1;
    setLoadingState({ id: null });
  }, []);
  const recoverPlanPreviewAfterTimeout = useCallback(async (args: {
    actionToken: number;
    transformationId: string;
    requestStartedAt: string;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<PlanContentV3 | null> => {
    const maxWaitMs = args.maxWaitMs ?? 90_000;
    const pollIntervalMs = args.pollIntervalMs ?? 3_000;
    const deadline = Date.now() + maxWaitMs;

    setLoadingState({
      id: "plan",
      label: "Le plan prend plus de temps que prévu, Sophia finalise le brouillon…",
    });

    while (Date.now() <= deadline) {
      if (!isOnboardingActionCurrent(args.actionToken)) return null;

      const { data, error } = await supabase
        .from("user_plans_v2")
        .select("id,status,content,updated_at")
        .eq("transformation_id", args.transformationId)
        .eq("status", "draft")
        .gte("updated_at", args.requestStartedAt)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isOnboardingActionCurrent(args.actionToken)) return null;

      if (error) {
        console.warn("[onboarding][plan_preview_recovery][query_failed]", {
          transformation_id: args.transformationId,
          request_started_at: args.requestStartedAt,
          error_message: getErrorMessage(error, "unknown_error"),
        });
      } else if (data && isPlanContentV3Candidate(data.content)) {
        console.info("[onboarding][plan_preview_recovery][draft_found]", {
          transformation_id: args.transformationId,
          plan_id: data.id,
          updated_at: data.updated_at ?? null,
        });
        return data.content;
      }

      if (Date.now() + pollIntervalMs > deadline) break;
      await wait(pollIntervalMs);
    }

    return null;
  }, [isOnboardingActionCurrent]);
  const handleQuestionnaireDraftChange = useCallback(
    (answers: Record<string, string | string[]>) => {
      setDraft((current) => {
        const activeTransformationId =
          current.questionnaire_schema?.transformation_id ??
          current.active_transformation_id;
        if (!activeTransformationId) return current;

        if (questionnaireAnswersEqual(current.questionnaire_answers, answers)) {
          return current;
        }

        return saveOnboardingV2Draft({
          ...current,
          questionnaire_answers: answers,
          transformations: current.transformations.map((transformation) =>
            transformation.id === activeTransformationId
              ? { ...transformation, questionnaire_answers: answers }
              : transformation
          ),
        }, { sync: false });
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const reconcileInitialDraft = async () => {
      const localDraft = loadOnboardingV2Draft();
      const sessionId = getStoredAnonymousSessionId() ??
        localDraft?.anonymous_session_id ??
        null;
      if (!sessionId) return;

      const serverSnapshot = await loadDraftFromServer(sessionId);
      if (cancelled || !serverSnapshot) return;

      // Never overwrite a signup_pending draft: it means the user just
      // submitted the questionnaire and is on their way through auth. The
      // local draft is the authoritative source at this moment, regardless
      // of what the server has. Overwriting it would cancel the in-flight
      // post-auth hydration and leave the user stuck at the questionnaire.
      if (
        localDraft?.cycle_status !== "signup_pending" &&
        shouldAdoptServerDraft(localDraft, serverSnapshot)
      ) {
        const adoptedDraft = persistOnboardingV2DraftLocally(serverSnapshot.draft);
        setDraft(adoptedDraft);
      }
    };

    void reconcileInitialDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return () => {
      cancelled = true;
    };

    if (!user) {
      setOnboardingAuthMode("guest");
      return () => {
        cancelled = true;
      };
    }

    setOnboardingAuthMode("checking");

    const validateOnboardingAuth = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        setOnboardingAuthMode("guest");
        return;
      }
      setOnboardingAuthMode("authenticated");
    };

    void validateOnboardingAuth();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (!effectiveUser) return;
    let cancelled = false;

    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("birth_date, gender")
        .eq("id", effectiveUser.id)
        .maybeSingle();
      if (cancelled) return;
      setStoredProfileFields({
        birthDate: Boolean(data?.birth_date),
        gender: Boolean(data?.gender),
        birthDateValue: data?.birth_date ?? "",
        genderValue: data?.gender ?? "",
      });
      if (!data) return;
      // Use functional setter so we read the *current* draft without adding
      // draft.profile to the dependency array (which would cause a re-run — and
      // DB overwrite — every time the user edits a field).
      setDraft((current) => {
        const nextBirthDate = current.profile.birthDate || data.birth_date || "";
        const nextGender = current.profile.gender || data.gender || "";
        if (
          nextBirthDate === current.profile.birthDate &&
          nextGender === current.profile.gender
        ) {
          return current;
        }
        return saveOnboardingV2Draft({
          ...current,
          profile: { ...current.profile, birthDate: nextBirthDate, gender: nextGender },
        });
      });
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUser]);

  useEffect(() => {
    if (!effectiveUser || !isDraftHydratableFromServer(draft)) return;
    let cancelled = false;

    const hydrateFromServer = async () => {
      const { data: cycleData } = await supabase
        .from("user_cycles")
        .select("*")
        .eq("user_id", effectiveUser.id)
        .in("status", [
          "draft",
          "clarification_needed",
          "structured",
          "prioritized",
          "questionnaire_in_progress",
          "profile_pending",
          "ready_for_plan",
        ])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !cycleData) return;

      const [{ data: aspectRows }, { data: transformationRows }] = await Promise
        .all([
          supabase
            .from("user_transformation_aspects")
            .select("*")
            .eq("cycle_id", cycleData.id)
            .order("source_rank", { ascending: true }),
          supabase
            .from("user_transformations")
            .select("*")
            .eq("cycle_id", cycleData.id)
            .order("priority_order", { ascending: true }),
        ]);

      if (cancelled) return;

      const structure = (cycleData.validated_structure ?? {}) as Record<
        string,
        any
      >;
      const transformations = (transformationRows ?? []).map((row) =>
        toTransformationPreview(row as any)
      );
      const activeTransformation = transformations.find((item) =>
        item.id === cycleData.active_transformation_id
      ) ?? transformations[0] ?? null;

      let stage: OnboardingV2Draft["stage"] = "capture";
      if (cycleData.status === "structured") {
        stage = "priorities";
      }
      if (cycleData.status === "prioritized") {
        stage = "priorities";
      }
      if (cycleData.status === "questionnaire_in_progress") {
        stage = activeTransformation?.questionnaire_schema
          ? "questionnaire"
          : "questionnaire_setup";
      }
      if (
        cycleData.status === "profile_pending" ||
        cycleData.status === "ready_for_plan"
      ) {
        stage = "profile";
      }

      persistDraft(setDraft, {
        raw_intake_text: cycleData.raw_intake_text,
        cycle_id: cycleData.id,
        cycle_status: cycleData.status,
        stage,
        profile: {
          birthDate: draft.profile.birthDate,
          gender: draft.profile.gender,
          pace: cycleData.requested_pace === "cool" ||
              cycleData.requested_pace === "normal" ||
              cycleData.requested_pace === "intense"
            ? cycleData.requested_pace
            : "",
        },
        needs_clarification: Boolean(structure.needs_clarification),
        clarification_prompt: typeof structure.clarification_prompt === "string"
          ? structure.clarification_prompt
          : null,
        provisional_groups: Array.isArray(structure.provisional_groups)
          ? structure.provisional_groups
          : [],
        aspects: (aspectRows ?? [])
          .filter((row: any) =>
            row.status === "active"
          )
          .map((row: any) => ({
            label: row.label,
            raw_excerpt: row.raw_excerpt,
            source_rank: row.source_rank,
            uncertainty_level: row.uncertainty_level,
            uncertainty_reason: row.metadata?.uncertainty_reason ?? null,
          })),
        deferred_aspects: (aspectRows ?? [])
          .filter((row: any) => row.status === "deferred")
          .map((row: any) => ({
            label: row.label,
            raw_excerpt: row.raw_excerpt,
            source_rank: row.source_rank,
            uncertainty_level: row.uncertainty_level ?? "low",
            deferred_reason: row.deferred_reason,
          })),
        transformations,
        active_transformation_id: activeTransformation?.id ?? null,
        questionnaire_schema: activeTransformation?.questionnaire_schema ??
          null,
        questionnaire_answers: activeTransformation?.questionnaire_answers ??
          {},
      });
    };

    void hydrateFromServer();

    return () => {
      cancelled = true;
    };
  }, [draft, effectiveUser]);

  useEffect(() => {
    if (!effectiveUser || !draft.cycle_id) return;
    if (draft.stage !== "profile") return;
    const currentClassification = currentTransformation?.plan_type_classification;
    const hasCompleteSplitMetricGuidance =
      currentClassification?.journey_strategy?.mode !== "two_transformations" ||
      (
        currentClassification?.split_metric_guidance?.transformation_1 &&
        currentClassification?.split_metric_guidance?.transformation_2
      );
    if (currentClassification && hasCompleteSplitMetricGuidance) return;

    let cancelled = false;

    const refreshProfileClassification = async () => {
      const [{ data: cycleData }, { data: transformationRows }] = await Promise.all([
        supabase
          .from("user_cycles")
          .select("id,status,active_transformation_id,requested_pace")
          .eq("id", draft.cycle_id)
          .eq("user_id", effectiveUser.id)
          .maybeSingle(),
        supabase
          .from("user_transformations")
          .select("*")
          .eq("cycle_id", draft.cycle_id)
          .order("priority_order", { ascending: true }),
      ]);

      if (cancelled || !cycleData || !Array.isArray(transformationRows)) return;

      const refreshedTransformations = transformationRows.map((row) =>
        toTransformationPreview(row as any)
      );
      const refreshedActiveTransformation = refreshedTransformations.find((item) =>
        item.id === cycleData.active_transformation_id
      ) ?? refreshedTransformations[0] ?? null;

      const refreshedClassification = refreshedActiveTransformation?.plan_type_classification;
      const refreshedHasCompleteSplitMetricGuidance =
        refreshedClassification?.journey_strategy?.mode !== "two_transformations" ||
        (
          refreshedClassification?.split_metric_guidance?.transformation_1 &&
          refreshedClassification?.split_metric_guidance?.transformation_2
        );

      if (!refreshedClassification || !refreshedHasCompleteSplitMetricGuidance) return;

      persistDraft(setDraft, {
        cycle_status: cycleData.status,
        active_transformation_id: refreshedActiveTransformation.id,
        transformations: refreshedTransformations,
        profile: {
          ...draft.profile,
          pace: cycleData.requested_pace === "cool" ||
              cycleData.requested_pace === "normal" ||
              cycleData.requested_pace === "intense"
            ? cycleData.requested_pace
            : draft.profile.pace,
        },
      }, { sync: false });
    };

    void refreshProfileClassification();

    return () => {
      cancelled = true;
    };
  }, [
    currentTransformation?.plan_type_classification,
    draft.cycle_id,
    draft.profile,
    draft.stage,
    effectiveUser,
  ]);

  useEffect(() => {
    if (!effectiveUser || !isDraftHydratableFromServer(draft)) return;
    let cancelled = false;

    const redirectIfActiveCycleExists = async () => {
      const { data: activeCycle } = await supabase
        .from("user_cycles")
        .select("id")
        .eq("user_id", effectiveUser.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !activeCycle) return;
      navigate("/dashboard", { replace: true });
    };

    void redirectIfActiveCycleExists();

    return () => {
      cancelled = true;
    };
  }, [draft, effectiveUser, navigate]);

  useEffect(() => {
    if (onboardingAuthLoading || !effectiveUser) return;
    if (draft.pending_auth_action !== "analyze") return;

    if (!draft.raw_intake_text.trim() || draft.cycle_id) {
      persistDraft(setDraft, { pending_auth_action: null });
      return;
    }

    persistDraft(setDraft, { pending_auth_action: null });
    void handleAnalyze();
  }, [
    onboardingAuthLoading,
    draft.pending_auth_action,
    draft.raw_intake_text,
    draft.cycle_id,
    effectiveUser,
  ]);

  useEffect(() => {
    if (onboardingAuthLoading || !effectiveUser) return;
    if (draft.pending_auth_action === "analyze") return;
    if (!shouldAttemptPostAuthDraftHydration(draft)) return;

    const sessionId = getStoredAnonymousSessionId();
    if (!sessionId) return;
    if (postAuthHydrationAttemptRef.current === sessionId) return;

    let cancelled = false;

    const migrateServerDraft = async () => {
      postAuthHydrationAttemptRef.current = sessionId;
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (cancelled || !accessToken) return;

      setPostAuthHydrating(true);
      setError(null);

      let response = await hydrateDraftAfterAuth({
        anonymousSessionId: sessionId,
        accessToken,
        draft,
      });

      // Retry once after a short delay — transient server errors are common
      // when the IA pipeline is under load.
      if (!cancelled && (!response || response.reason === "not_found")) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!cancelled) {
          response = await hydrateDraftAfterAuth({
            anonymousSessionId: sessionId,
            accessToken,
            draft,
          });
        }
      }

      if (cancelled) return;

      setPostAuthHydrating(false);

      if (!response || response.reason === "not_found") {
        setError(
          "La reprise de l'onboarding a échoué. Clique sur « Réessayer » pour relancer.",
        );
        // Reset the ref so the retry button can re-trigger the effect.
        postAuthHydrationAttemptRef.current = null;
        return;
      }

      if (response.hydrated && response.cycle_id) {
        clearOnboardingV2Draft();
        setDraft(createEmptyOnboardingV2Draft());
        setError(null);
        return;
      }

      // existing_cycle or reused_cycle with hydrated:false — clear the local
      // draft so hydrateFromServer can reload the real cycle state from DB
      // instead of leaving the user stuck at the questionnaire step.
      if (response.cycle_id) {
        clearOnboardingV2Draft();
        setDraft(createEmptyOnboardingV2Draft());
        return;
      }
    };

    void migrateServerDraft();

    return () => {
      cancelled = true;
    };
  }, [onboardingAuthLoading, draft, effectiveUser, hydrationRetryKey]);

  const isPostAuthTransition = Boolean(
    effectiveUser &&
    !draft.cycle_id &&
    draft.cycle_status === "signup_pending",
  );

  async function clearServerDownstreamState(args: {
    targetStage: "capture" | "priorities" | "questionnaire" | "profile";
    activeTransformationId?: string | null;
    clearQuestionnaires?: boolean;
  }) {
    if (!effectiveUser || !draft.cycle_id) return;

    const now = new Date().toISOString();
    const clearQuestionnaires =
      args.clearQuestionnaires ?? (
        args.targetStage === "capture" || args.targetStage === "priorities"
      );

    const { error: deletePlansError } = await supabase
      .from("user_plans_v2")
      .delete()
      .eq("cycle_id", draft.cycle_id);
    if (deletePlansError) throw deletePlansError;

    const transformationPatch: Record<string, unknown> = {
      status: "pending",
      activated_at: null,
      completed_at: null,
      updated_at: now,
    };
    if (clearQuestionnaires) {
      transformationPatch.questionnaire_schema = null;
      transformationPatch.questionnaire_answers = null;
    }

    const { error: updateTransformationsError } = await supabase
      .from("user_transformations")
      .update(transformationPatch)
      .eq("cycle_id", draft.cycle_id)
      .in("status", ["draft", "ready", "pending", "active"]);
    if (updateTransformationsError) throw updateTransformationsError;

    const cycleStatusByStage = {
      capture: "draft",
      priorities: "prioritized",
      questionnaire: "questionnaire_in_progress",
      profile: "profile_pending",
    } as const;

    const cyclePatch: Record<string, unknown> = {
      status: cycleStatusByStage[args.targetStage],
      updated_at: now,
    };
    if (args.targetStage === "capture") {
      cyclePatch.active_transformation_id = null;
    } else if (
      args.activeTransformationId !== undefined &&
      !isManualTransformationId(args.activeTransformationId)
    ) {
      cyclePatch.active_transformation_id = args.activeTransformationId;
    } else if (args.activeTransformationId !== undefined) {
      cyclePatch.active_transformation_id = null;
    }

    const { error: updateCycleError } = await supabase
      .from("user_cycles")
      .update(cyclePatch)
      .eq("id", draft.cycle_id);
    if (updateCycleError) throw updateCycleError;
  }

  async function handleStageBack(targetStage: OnboardingV2Draft["stage"]) {
    setError(null);
    cancelOnboardingActions();

    try {
      if (
        targetStage === "capture" ||
        targetStage === "priorities" ||
        targetStage === "questionnaire" ||
        targetStage === "profile"
      ) {
        await clearServerDownstreamState({
          targetStage,
          activeTransformationId: targetStage === "capture"
            ? null
            : draft.active_transformation_id,
        });
      }

      persistDraft(setDraft, buildStageResetPatch(draft, targetStage));
      if (draft.entry_mode === "add_transformation" && targetStage === "priorities") {
        navigate("/transformations/new");
      }
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          "Impossible de revenir en arrière pour le moment.",
        ),
      );
    }
  }

  async function completePreservedTransformationForMultiPartTransition() {
    if (!effectiveUser || !draft.cycle_id || !preservedCycleActiveTransformationId) return;

    const now = new Date().toISOString();
    const { data: previousTransformation, error: loadPreviousError } = await supabase
      .from("user_transformations")
      .select("id,status")
      .eq("id", preservedCycleActiveTransformationId)
      .eq("cycle_id", draft.cycle_id)
      .maybeSingle();

    if (loadPreviousError) throw loadPreviousError;
    if (!previousTransformation) return;
    if (
      previousTransformation.status === "completed" ||
      previousTransformation.status === "abandoned" ||
      previousTransformation.status === "archived" ||
      previousTransformation.status === "cancelled"
    ) {
      return;
    }

    const [{ error: planError }, { error: transformationError }, cycleUpdateResult] = await Promise.all([
      supabase
        .from("user_plans_v2")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("transformation_id", preservedCycleActiveTransformationId)
        .in("status", ["active", "paused"]),
      supabase
        .from("user_transformations")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("id", preservedCycleActiveTransformationId)
        .in("status", ["draft", "ready", "pending", "active"]),
      supabase
        .from("user_cycles")
        .update({
          active_transformation_id: null,
          updated_at: now,
        })
        .eq("id", draft.cycle_id),
    ]);

    if (planError) throw planError;
    if (transformationError) throw transformationError;
    if (cycleUpdateResult.error) throw cycleUpdateResult.error;

    const { data: reminderRows, error: reminderError } = await supabase
      .from("user_recurring_reminders")
      .update({
        status: "completed",
        ended_reason: "plan_completed",
        deactivated_at: now,
        updated_at: now,
      } as never)
      .eq("user_id", effectiveUser.id)
      .eq("transformation_id", preservedCycleActiveTransformationId)
      .in("initiative_kind", ["plan_free"])
      .in("status", ["active", "inactive"])
      .select("id");

    if (reminderError) throw reminderError;

    const reminderIds = ((reminderRows as Array<{ id: string }> | null) ?? []).map((row) => row.id);
    if (reminderIds.length === 0) return;

    const { error: cancelCheckinsError } = await supabase
      .from("scheduled_checkins")
      .update({
        status: "cancelled",
        processed_at: now,
      } as never)
      .in("recurring_reminder_id", reminderIds)
      .in("status", ["pending", "retrying", "awaiting_user"]);

    if (cancelCheckinsError) throw cancelCheckinsError;
  }

  function handleBackClick() {
    setError(null);
    cancelOnboardingActions();

    if (backAction.kind === "dashboard") {
      navigate("/dashboard");
      return;
    }

    if (backAction.kind === "local_stage_reset") {
      persistDraft(setDraft, buildStageResetPatch(draft, backAction.stage));
      return;
    }

    if (backAction.kind === "server_stage_reset") {
      void handleStageBack(backAction.stage);
    }
  }

  async function handleRestart() {
    setError(null);
    cancelOnboardingActions();

    try {
      if (effectiveUser && draft.cycle_id) {
        const { error: deleteCycleError } = await supabase
          .from("user_cycles")
          .delete()
          .eq("id", draft.cycle_id);
        if (deleteCycleError) throw deleteCycleError;
      }

      clearOnboardingV2Draft();
      setDraft(createEmptyOnboardingV2Draft());
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          "Impossible de recommencer pour le moment.",
        ),
      );
    }
  }

  useEffect(() => {
    // Note: effectiveUser can be null for guests — handleGenerateQuestionnaire handles both cases.
    if (onboardingAuthLoading) return;
    if (draft.stage !== "questionnaire_setup") return;
    if (!draft.active_transformation_id) return;
    if (
      draft.questionnaire_schema?.transformation_id ===
        draft.active_transformation_id
    ) {
      persistDraft(setDraft, { stage: "questionnaire" });
      return;
    }

    void handleGenerateQuestionnaire(draft.active_transformation_id);
  }, [
    onboardingAuthLoading,
    draft.active_transformation_id,
    draft.questionnaire_schema,
    draft.stage,
    effectiveUser,
  ]);

  async function invokeFunction<T>(
    name: string,
    body: Record<string, unknown>,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<T> {
    const requestId = newRequestId();
    const invokePromise = supabase.functions.invoke(name, {
      body,
      headers: requestHeaders(requestId),
    });
    const timeoutMs = options?.timeoutMs ?? null;
    const result = timeoutMs == null
      ? await invokePromise
      : await Promise.race([
        invokePromise,
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            const timeoutError = new Error(
              `La requête ${name} a dépassé ${Math.round(timeoutMs / 1000)} secondes.`,
            ) as Error & { status?: number };
            timeoutError.name = "FunctionInvokeTimeoutError";
            timeoutError.status = 408;
            reject(timeoutError);
          }, timeoutMs);
        }),
      ]);
    const { data, error } = result;
    if (error) {
      const errorRecord = error as {
        name?: string;
        message?: string;
        context?: {
          status?: number;
          statusText?: string;
          text?: () => Promise<string>;
          clone?: () => { text?: () => Promise<string> };
        };
      };

      let responseText: string | null = null;
      const responseLike = errorRecord.context;
      try {
        if (typeof responseLike?.text === "function") {
          responseText = await responseLike.text();
        } else if (typeof responseLike?.clone === "function") {
          const cloned = responseLike.clone();
          if (typeof cloned?.text === "function") {
            responseText = await cloned.text();
          }
        }
      } catch {
        responseText = null;
      }

      console.error("[frontend_function_invoke_failed]", {
        source: "auth",
        name,
        requestId,
        requestBody: body,
        error_name: errorRecord.name ?? null,
        error_message: errorRecord.message ?? null,
        response_status: responseLike?.status ?? null,
        response_status_text: responseLike?.statusText ?? null,
        response_text: responseText,
        raw_error: error,
      });
      throw error;
    }
    console.log("[frontend_response_received]", {
      source: "auth",
      name,
      requestId,
      at: new Date().toISOString(),
    });
    return data as T;
  }

  async function handleAnalyzeAsGuest() {
    const actionToken = beginOnboardingAction({
      id: "analyze",
      label: "Sophia structure tes pensées…",
    });
    try {
      const response = await intakeToTransformationsGuest({
        anonymousSessionId: draft.anonymous_session_id,
        rawIntakeText: draft.raw_intake_text,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;
      console.log("[frontend_response_received]", {
        source: "guest",
        name: "cycle-draft/intake",
        at: new Date().toISOString(),
      });
      const firstTransformation = getRecommendedTransformation(
        response.transformations,
      );

      persistDraft(setDraft, {
        cycle_id: null,
        cycle_status: response.cycle_status,
        stage: response.needs_clarification ? "capture" : "priorities",
        pending_auth_action: null,
        needs_clarification: response.needs_clarification,
        clarification_prompt: response.clarification_prompt,
        aspects: [],
        provisional_groups: [],
        validated_groups: [],
        deferred_aspects: [],
        transformations: response.transformations,
        active_transformation_id: firstTransformation?.id ?? null,
        questionnaire_schema: null,
        questionnaire_answers: {},
      }, { sync: false });
    } catch (error) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      throw error;
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handleAnalyze() {
    if (!draft.raw_intake_text.trim()) return;
    setError(null);
    const candidateTransformations = draft.transformations.filter(isPendingCycleTransformation);

    if (
      draft.entry_mode === "add_transformation" &&
      draft.stage === "capture" &&
      draft.cycle_id
    ) {
      const persistDraftTransformation = (
        params?: {
          analysis?: DraftTransformationFromTextResponse["analysis"] | null;
          serverOpenTransformations?: DraftTransformationFromTextResponse["open_transformations"];
        },
      ) => {
        // Reconcile the local candidate list with the authoritative list of
        // open transformations returned by the server. This guarantees that
        // any id the LLM references via updated_existing_transformations is
        // present in the merge base, even when draft.transformations was
        // stale or empty (e.g. after a server-snapshot adoption race).
        const mergeBase = reconcileCandidateTransformations({
          candidateTransformations,
          serverOpenTransformations: params?.serverOpenTransformations ?? [],
          cycleId: draft.cycle_id,
        });

        const analyzed =
          params?.analysis
            ? applyDraftTransformationAnalysis({
              currentTransformations: mergeBase,
              cycleId: draft.cycle_id,
              rawText: draft.raw_intake_text,
              analysis: params.analysis,
            })
            : null;

        const fallbackTransformation = buildManualTransformationFromCapture({
          rawText: draft.raw_intake_text,
          cycleId: draft.cycle_id,
          existingTransformations: mergeBase,
        });

        const nextTransformations = analyzed?.transformations ??
          [...mergeBase, fallbackTransformation];
        const nextSelectedId = analyzed?.selectedTransformationId ?? fallbackTransformation.id;

        persistDraft(setDraft, {
          cycle_status: "prioritized",
          stage: "priorities",
          transformations: nextTransformations,
          active_transformation_id: nextSelectedId,
          questionnaire_schema: null,
          questionnaire_answers: {},
          raw_intake_text: "",
        });
      };

      if (!effectiveUser) {
        persistDraftTransformation();
        return;
      }

      const actionToken = beginOnboardingAction({
        id: "analyze",
        label: "Sophia reformule ce nouveau sujet…",
      });
      try {
        const response = await invokeFunction<DraftTransformationFromTextResponse>(
          "draft-transformation-from-text-v1",
          {
            raw_text: draft.raw_intake_text,
            cycle_id: draft.cycle_id,
            existing_transformations: candidateTransformations.map((transformation) => ({
              id: transformation.id,
              title: transformation.title,
              internal_summary: transformation.internal_summary,
              user_summary: transformation.user_summary,
              priority_order: transformation.priority_order,
              status: transformation.status,
            })),
          },
          { timeoutMs: 45_000 },
        );
        if (!isOnboardingActionCurrent(actionToken)) return;
        persistDraftTransformation({
          analysis: response.analysis,
          serverOpenTransformations: response.open_transformations,
        });
      } catch (error) {
        console.warn("[OnboardingV2] Falling back to manual draft transformation", error);
        if (!isOnboardingActionCurrent(actionToken)) return;
        persistDraftTransformation();
      } finally {
        finishOnboardingAction(actionToken);
      }
      return;
    }

    if (!effectiveUser) {
      try {
        await handleAnalyzeAsGuest();
        return;
      } catch (invokeError) {
        setError(
          getErrorMessage(
            invokeError,
            "Impossible d’analyser ta réponse pour le moment.",
          ),
        );
        return;
      }
    }

    const actionToken = beginOnboardingAction({
      id: "analyze",
      label: "Sophia structure tes pensées…",
    });
    try {
      await clearServerDownstreamState({ targetStage: "capture" });
      if (!isOnboardingActionCurrent(actionToken)) return;
      const response = await invokeFunction<IntakeToTransformationsResponse>(
        "intake-to-transformations-v2",
        {
          raw_intake_text: draft.raw_intake_text,
          cycle_id: draft.cycle_id ?? undefined,
        },
      );
      if (!isOnboardingActionCurrent(actionToken)) return;
      const transformations = response.transformations.map(
        mapCrystallizedTransformation,
      );
      const firstTransformation = getRecommendedTransformation(transformations);

      persistDraft(setDraft, {
        cycle_id: response.cycle_id,
        cycle_status: response.status,
        stage: response.needs_clarification ? "capture" : "priorities",
        pending_auth_action: null,
        needs_clarification: response.needs_clarification,
        clarification_prompt: response.clarification_prompt,
        aspects: [],
        provisional_groups: [],
        validated_groups: [],
        deferred_aspects: [],
        transformations,
        active_transformation_id: firstTransformation?.id ?? null,
        questionnaire_schema: null,
        questionnaire_answers: {},
      });
    } catch (invokeError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      if (isAuthFunctionError(invokeError)) {
        try {
          setOnboardingAuthMode("guest");
          await handleAnalyzeAsGuest();
          return;
        } catch (guestError) {
          setError(
            getErrorMessage(
              guestError,
              "Impossible d’analyser ta réponse pour le moment.",
            ),
          );
          return;
        }
      }
      setError(
        getErrorMessage(
          invokeError,
          "Impossible d’analyser ta réponse pour le moment.",
        ),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function persistTransformationFocusSelection(params: {
    selectedTransformationId: string;
    transformations: TransformationPreviewV2[];
  }): Promise<{
    transformations: TransformationPreviewV2[];
    selectedTransformationId: string;
  }> {
    if (!draft.cycle_id) {
      return {
        transformations: params.transformations,
        selectedTransformationId: params.selectedTransformationId,
      };
    }

    const now = new Date().toISOString();
    const { data: cycleRows, error: cycleRowsError } = await supabase
      .from("user_transformations")
      .select("id, priority_order, status")
      .eq("cycle_id", draft.cycle_id);
    if (cycleRowsError) throw cycleRowsError;

    const cycleRowsList = (cycleRows as Array<{
      id: string;
      priority_order: number | null;
      status: TransformationPreviewV2["status"];
    }> | null) ?? [];
    const currentCycleMaxPriority = Math.max(
      0,
      ...cycleRowsList.map((item) => item.priority_order ?? 0),
    );

    const persistedExistingTransformations = params.transformations.filter((item) =>
      !item.id.startsWith("manual-")
    );
    const manualTransformations = params.transformations.filter((item) =>
      item.id.startsWith("manual-")
    );
    const removedTransformationIds = draft.transformations
      .filter((item) => !item.id.startsWith("manual-"))
      .map((item) => item.id)
      .filter((id) => !persistedExistingTransformations.some((item) => item.id === id));

    const buildOnboardingPayload = (transformation: TransformationPreviewV2) => ({
      onboarding_v2: {
        source_group_index: transformation.source_group_index ?? null,
        questionnaire_context: transformation.questionnaire_context ?? [],
        ordering_rationale: transformation.ordering_rationale ?? null,
        recommended_order: transformation.recommended_order ?? null,
        recommended_progress_indicator:
          transformation.recommended_progress_indicator?.trim() || null,
        selection_context: transformation.selection_context?.trim() || null,
        is_manual: transformation.is_manual === true,
        plan_type_classification: transformation.plan_type_classification ?? null,
        professional_support: transformation.professional_support ?? null,
      },
    });

    if (cycleRowsList.length > 0) {
      for (const [index, transformation] of cycleRowsList.entries()) {
        const { error: stageError } = await supabase
          .from("user_transformations")
          .update({
            priority_order: currentCycleMaxPriority + index + 1,
            updated_at: now,
          })
          .eq("id", transformation.id)
          .eq("cycle_id", draft.cycle_id);

        if (stageError) throw stageError;
      }
    }

    const insertedTransformations: TransformationPreviewV2[] = [];
    if (manualTransformations.length > 0) {
      const insertRows = manualTransformations.map((transformation, index) => ({
        cycle_id: draft.cycle_id,
        priority_order: currentCycleMaxPriority + cycleRowsList.length + index + 1,
        status: transformation.status,
        title: transformation.title,
        internal_summary: transformation.internal_summary,
        user_summary: transformation.user_summary,
        handoff_payload: buildOnboardingPayload(transformation),
        questionnaire_schema: null,
        questionnaire_answers: null,
        completion_summary: null,
        updated_at: now,
      }));

      const { data, error } = await supabase
        .from("user_transformations")
        .insert(insertRows)
        .select("*");
      if (error) throw error;

      const insertedRows = (data ?? []).map((row) => toTransformationPreview(row as any));
      manualTransformations.forEach((transformation, index) => {
        const inserted = insertedRows[index];
        if (!inserted) return;
        insertedTransformations.push({
          ...inserted,
          selection_context: transformation.selection_context ?? null,
          is_manual: true,
        });
      });
    }

    const removedTransformations = draft.transformations
      .filter((item) => removedTransformationIds.includes(item.id))
      .sort((a, b) => a.priority_order - b.priority_order)
      .map((transformation) => ({
        ...transformation,
        cycle_id: draft.cycle_id!,
        status: "abandoned" as const,
      }));

    const visibleTargets: Array<TransformationPreviewV2 & { cycle_id: string }> = [
      ...persistedExistingTransformations.map((transformation) => ({
        ...transformation,
        cycle_id: draft.cycle_id!,
      })),
      ...manualTransformations.map((transformation, index) => {
        const inserted = insertedTransformations[index];
        return {
          ...transformation,
          id: inserted?.id ?? transformation.id,
          cycle_id: draft.cycle_id!,
        };
      }),
    ];

    const untouchedCycleRows = cycleRowsList
      .filter((row) =>
        !visibleTargets.some((transformation) => transformation.id === row.id) &&
        !removedTransformations.some((transformation) => transformation.id === row.id)
      )
      .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0));

    const fullUpdateTargets: Array<TransformationPreviewV2 & {
      cycle_id: string;
      priority_order: number;
    }> = [
      ...visibleTargets.map((transformation, index) => ({
        ...transformation,
        priority_order: index + 1,
      })),
      ...removedTransformations,
    ].map((transformation, index) => ({
      ...transformation,
      priority_order: index + 1,
    }));

    const trailingOrderUpdates = untouchedCycleRows.map((row, index) => ({
        id: row.id,
        cycle_id: draft.cycle_id!,
        status: row.status,
        priority_order: fullUpdateTargets.length + index + 1,
    }));

    const updateTargets = [...fullUpdateTargets, ...trailingOrderUpdates];

    const updateResults: typeof fullUpdateTargets = [];
    for (const transformation of [...updateTargets].sort((a, b) => a.priority_order - b.priority_order)) {
      const baseUpdate = {
        priority_order: transformation.priority_order,
        status: transformation.status,
        updated_at: now,
      };
      const isFullUpdate =
        "title" in transformation &&
        "internal_summary" in transformation &&
        "user_summary" in transformation;
      if (!isFullUpdate) {
        const { error } = await supabase
          .from("user_transformations")
          .update(baseUpdate)
          .eq("id", transformation.id)
          .eq("cycle_id", draft.cycle_id);
        if (error) throw error;
        continue;
      }

      const fullTransformation =
        transformation as TransformationPreviewV2 & { cycle_id: string; priority_order: number };
      const updatePayload = {
          ...baseUpdate,
          title: fullTransformation.title,
          internal_summary: fullTransformation.internal_summary,
          user_summary: fullTransformation.user_summary,
          handoff_payload: buildOnboardingPayload(fullTransformation),
          questionnaire_schema: null,
          questionnaire_answers: null,
        };

      const { error } = await supabase
        .from("user_transformations")
        .update(updatePayload)
        .eq("id", transformation.id)
        .eq("cycle_id", draft.cycle_id);
      if (error) throw error;

      updateResults.push(fullTransformation);
    }

    const updatedById = new Map(updateResults.map((transformation) => [
      transformation.id,
      transformation,
    ]));

    const insertedByLocalId = new Map(
      manualTransformations.map((transformation, index) => [
        transformation.id,
        insertedTransformations[index],
      ]),
    );

    const persistedTransformations = params.transformations.map((transformation) => {
      if (transformation.is_manual) {
        const inserted = insertedByLocalId.get(transformation.id);
        return (inserted ? updatedById.get(inserted.id) : null) ??
          inserted ??
          transformation;
      }
      return updatedById.get(transformation.id) ??
        transformation;
    });

    const resolvedSelectedTransformation =
      persistedTransformations.find((item) =>
        item.id === params.selectedTransformationId
      ) ??
      insertedByLocalId.get(params.selectedTransformationId) ??
      persistedTransformations.find((item) => item.priority_order === 1) ??
      null;

    const { error: cycleError } = await supabase
      .from("user_cycles")
      .update({
        status: "prioritized",
        active_transformation_id: resolvedSelectedTransformation?.id ?? null,
        updated_at: now,
      })
      .eq("id", draft.cycle_id);
    if (cycleError) throw cycleError;

    return {
      transformations: persistedTransformations,
      selectedTransformationId: resolvedSelectedTransformation?.id ??
        params.selectedTransformationId,
    };
  }

  async function handleGenerateQuestionnaire(
    transformationId: string,
    transformationsOverride?: TransformationPreviewV2[],
  ) {
    setError(null);

    if (!effectiveUser) {
      const actionToken = beginOnboardingAction({
        id: "questionnaire",
        label: "Sophia prépare ton questionnaire…",
      });
      try {
        const source = transformationsOverride ?? draft.transformations;
        const transformation = source.find((item) => item.id === transformationId);
        if (!transformation) return;

        console.info("[onboarding][questionnaire][guest][start]", {
          transformation_id: transformationId,
          transformation_title: transformation.title ?? null,
          active_transformation_id: draft.active_transformation_id,
        });

        const response = await generateCycleDraftQuestionnaireGuest({
          anonymousSessionId: draft.anonymous_session_id,
          transformation,
        });
        if (!isOnboardingActionCurrent(actionToken)) return;

        const schema: QuestionnaireSchemaV2 = response.schema ?? {
          version: 1,
          transformation_id: transformationId,
          questions: response.questions,
          metadata: {
            design_principle: "court_adapte_utile_et_mesurable",
            measurement_hints: {
              metric_key: "weekly_aligned_days",
              metric_label: "Jours alignés par semaine",
              unit: "jours/semaine",
              direction: "increase",
              measurement_mode: "frequency",
              baseline_prompt: "Aujourd'hui, combien de jours alignés vis-tu en moyenne par semaine ?",
              target_prompt: "À combien de jours alignés par semaine veux-tu arriver ?",
              suggested_target_value: null,
              rationale: "Fallback frontend quand le schéma complet n'est pas fourni.",
              confidence: 0.2,
            },
            source: "cycle-draft/questionnaire",
          },
        };

        const transformations = source.map((item) =>
          item.id === transformationId
            ? { ...item, questionnaire_schema: schema }
            : { ...item, questionnaire_schema: null, questionnaire_answers: null }
        );

        persistDraft(setDraft, {
          cycle_id: null,
          cycle_status: "questionnaire_in_progress",
          stage: "questionnaire",
          transformations,
          active_transformation_id: transformationId,
          questionnaire_schema: schema,
        });
        return;
      } catch (invokeError) {
        if (!isOnboardingActionCurrent(actionToken)) return;
        setError(
          getErrorMessage(invokeError, "Impossible de générer le questionnaire."),
        );
        return;
      } finally {
        finishOnboardingAction(actionToken);
      }
    }

    const actionToken = beginOnboardingAction({
      id: "questionnaire",
      label: "Sophia prépare ton questionnaire…",
    });
    try {
      let source = transformationsOverride ?? draft.transformations;
      let resolvedTransformationId = transformationId;
      let transformation = source.find((item) => item.id === resolvedTransformationId) ?? null;
      console.info("[onboarding][questionnaire][auth][start]", {
        transformation_id: resolvedTransformationId,
        transformation_title: transformation?.title ?? null,
        active_transformation_id: draft.active_transformation_id,
      });

      if (draft.entry_mode === "add_transformation" && draft.stage === "questionnaire_setup") {
        const persistedSelection = await persistTransformationFocusSelection({
          selectedTransformationId: resolvedTransformationId,
          transformations: source,
        });
        if (!isOnboardingActionCurrent(actionToken)) return;
        source = persistedSelection.transformations;
        resolvedTransformationId = persistedSelection.selectedTransformationId;
        transformation = source.find((item) => item.id === resolvedTransformationId) ?? null;
      }
      await clearServerDownstreamState({
        targetStage: "questionnaire",
        activeTransformationId: resolvedTransformationId,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;
      const response = await invokeFunction<GenerateQuestionnaireResponse>(
        "generate-questionnaire-v2",
        { transformation_id: resolvedTransformationId },
      );
      if (!isOnboardingActionCurrent(actionToken)) return;

      const schema: QuestionnaireSchemaV2 = response.schema ?? {
        version: 1,
        transformation_id: resolvedTransformationId,
        questions: response.questions,
        metadata: {
          design_principle: "court_adapte_utile_et_mesurable",
          measurement_hints: {
            metric_key: "weekly_aligned_days",
            metric_label: "Jours alignés par semaine",
            unit: "jours/semaine",
            direction: "increase",
            measurement_mode: "frequency",
            baseline_prompt: "Aujourd'hui, combien de jours alignés vis-tu en moyenne par semaine ?",
            target_prompt: "À combien de jours alignés par semaine veux-tu arriver ?",
            suggested_target_value: null,
            rationale: "Fallback frontend quand le schéma complet n'est pas fourni.",
            confidence: 0.2,
          },
          source: "generate-questionnaire-v2",
        },
      };

      const transformations = source.map((transformation) =>
        transformation.id === resolvedTransformationId
          ? { ...transformation, questionnaire_schema: schema }
          : { ...transformation, questionnaire_schema: null, questionnaire_answers: null }
      );

      persistDraft(setDraft, {
        cycle_status: response.cycle_status,
        stage: "questionnaire",
        transformations,
        active_transformation_id: resolvedTransformationId,
        questionnaire_schema: schema,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      });
    } catch (invokeError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      setError(
        getErrorMessage(invokeError, "Impossible de générer le questionnaire."),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handleQuestionnaireSubmit(
    answers: Record<string, string | string[]>,
  ) {
    setError(null);

    if (isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema)) {
      if (!effectiveUser || !currentTransformation || !draft.questionnaire_schema) {
        setError("Impossible de préparer la 2e partie pour le moment.");
        return;
      }

      const actionToken = beginOnboardingAction({
        id: "plan",
        label: "Sophia prépare la 2e partie…",
      });
      const requestStartedAt = new Date().toISOString();
      try {
        const { data: transformationRow, error: transformationLoadError } = await supabase
          .from("user_transformations")
          .select("handoff_payload")
          .eq("id", currentTransformation.id)
          .maybeSingle();
        if (transformationLoadError) throw transformationLoadError;
        if (!isOnboardingActionCurrent(actionToken)) return;

        const handoffPayload = mergeTransitionDebriefIntoHandoffPayload({
          handoffPayload:
            (transformationRow as { handoff_payload?: Record<string, unknown> | null } | null)
              ?.handoff_payload ?? null,
          answers,
          questionnaireSchema: draft.questionnaire_schema,
          previousTransformationId: preservedCycleActiveTransformationId,
        });

        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("user_transformations")
          .update({
            questionnaire_schema: draft.questionnaire_schema,
            questionnaire_answers: answers,
            handoff_payload: handoffPayload,
            updated_at: now,
          })
          .eq("id", currentTransformation.id);
        if (updateError) throw updateError;
        if (!isOnboardingActionCurrent(actionToken)) return;

        await completePreservedTransformationForMultiPartTransition();
        if (!isOnboardingActionCurrent(actionToken)) return;

        persistDraft(setDraft, {
          questionnaire_answers: answers,
          transformations: draft.transformations.map((transformation) =>
            transformation.id === currentTransformation.id
              ? {
                ...transformation,
                questionnaire_schema: draft.questionnaire_schema,
                questionnaire_answers: answers,
              }
              : transformation
          ),
          stage: "generating_plan",
          plan_review: null,
          roadmap_transition: null,
        });
        if (!isOnboardingActionCurrent(actionToken)) return;

        const response = await invokeFunction<GeneratePlanResponse>("generate-plan-v2", {
          transformation_id: currentTransformation.id,
          mode: "preview",
          pace: draft.profile.pace || undefined,
        }, {
          timeoutMs: 180_000,
        });
        if (!response.plan_preview) {
          throw new Error("Le preview du plan est manquant.");
        }
        if (!isOnboardingActionCurrent(actionToken)) return;

        const planReview: PlanReviewDraft = {
          plan_preview: response.plan_preview,
          feedback: "",
        };

        persistDraft(setDraft, {
          stage: "plan_review",
          plan_review: planReview,
        });
      } catch (submitError) {
        if (!isOnboardingActionCurrent(actionToken)) return;
        if (isPlanGenerationTimeout(submitError)) {
          const recoveredPreview = await recoverPlanPreviewAfterTimeout({
            actionToken,
            transformationId: currentTransformation.id,
            requestStartedAt,
          });
          if (recoveredPreview && isOnboardingActionCurrent(actionToken)) {
            persistDraft(setDraft, {
              stage: "plan_review",
              plan_review: {
                plan_preview: recoveredPreview,
                feedback: "",
              },
            });
            return;
          }
        }
        persistDraft(setDraft, { stage: "questionnaire" });
        setError(
          getErrorMessage(
            submitError,
            "Impossible de préparer la 2e partie pour le moment.",
          ),
        );
      } finally {
        finishOnboardingAction(actionToken);
      }
      return;
    }

    // For guest users, we can proceed even if currentTransformation is null —
    // we just need to store the answers and redirect to auth.
    if (!effectiveUser) {
      const transformationId =
        currentTransformation?.id ??
        draft.questionnaire_schema?.transformation_id ??
        draft.active_transformation_id ??
        null;

      console.info("[onboarding][questionnaire][submit][guest]", {
        transformation_id: transformationId,
        current_transformation_title: currentTransformation?.title ?? null,
        schema_transformation_id: draft.questionnaire_schema?.transformation_id ?? null,
        active_transformation_id: draft.active_transformation_id,
      });

      persistDraft(setDraft, {
        cycle_id: null,
        cycle_status: "signup_pending",
        questionnaire_answers: answers,
        plan_review: null,
        roadmap_transition: null,
        transformations: draft.transformations.map((transformation) =>
          transformation.id === transformationId
            ? { ...transformation, questionnaire_answers: answers }
            : transformation
        ),
      });
      // Flush immediately so the server has the answers before the user
      // completes signup — don't rely on the 500ms debounce alone.
      flushDraftSync();
      navigate(AUTH_REDIRECT);
      return;
    }

    if (!currentTransformation) {
      setError("Impossible de soumettre le questionnaire : transformation introuvable.");
      return;
    }

    if (!draft.cycle_id) return;

    const actionToken = beginOnboardingAction({
      id: "save",
      label: "Enregistrement des réponses…",
    });
    try {
      await clearServerDownstreamState({
        targetStage: "profile",
        activeTransformationId: currentTransformation.id,
        clearQuestionnaires: false,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;

      const { error: updateError } = await supabase
        .from("user_transformations")
        .update({
          questionnaire_answers: answers,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentTransformation.id);

      if (updateError) throw updateError;
      if (!isOnboardingActionCurrent(actionToken)) return;

      const classificationResponse = await invokeFunction<ClassifyPlanTypeResponse>(
        "classify-plan-type-v1",
        {
          transformation_id: currentTransformation.id,
        },
      );
      if (!isOnboardingActionCurrent(actionToken)) return;

      const { error: cycleError } = await supabase
        .from("user_cycles")
        .update({
          status: "profile_pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.cycle_id);

      if (cycleError) throw cycleError;

      persistDraft(setDraft, {
        stage: "profile",
        cycle_status: "profile_pending",
        questionnaire_answers: answers,
        plan_review: null,
        roadmap_transition: null,
        transformations: draft.transformations.map((transformation) =>
          transformation.id === currentTransformation.id
            ? {
              ...transformation,
              questionnaire_answers: answers,
              plan_type_classification: classificationResponse.classification,
            }
            : transformation
        ),
      });
    } catch (submitError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      setError(
        getErrorMessage(submitError, "Impossible d’enregistrer les réponses."),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handleProfileSubmit() {
    if (!effectiveUser || !draft.cycle_id || !currentTransformation) {
      return;
    }

    setError(null);
    let updatedTransformations: TransformationPreviewV2[] | null = null;
    const resolvedBirthDate =
      draft.profile.birthDate || storedProfileFields.birthDateValue || null;
    const resolvedGender =
      draft.profile.gender || storedProfileFields.genderValue || null;

    const actionToken = beginOnboardingAction({
      id: "plan",
      label: "Sophia génère ton plan…",
    });
    const requestStartedAt = new Date().toISOString();
    try {
      const now = new Date().toISOString();
      await clearServerDownstreamState({
        targetStage: "profile",
        activeTransformationId: currentTransformation.id,
        clearQuestionnaires: false,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          birth_date: resolvedBirthDate,
          gender: resolvedGender,
        })
        .eq("id", effectiveUser.id);
      if (profileError) throw profileError;

      const { error: cycleError } = await supabase
        .from("user_cycles")
        .update({
          birth_date_snapshot: resolvedBirthDate,
          gender_snapshot: resolvedGender,
          requested_pace: draft.profile.pace || null,
          duration_months: 2,
          status: "ready_for_plan",
          updated_at: now,
        })
        .eq("id", draft.cycle_id);
      if (cycleError) throw cycleError;
      if (!isOnboardingActionCurrent(actionToken)) return;

      persistDraft(setDraft, {
        cycle_status: "ready_for_plan",
        stage: "generating_plan",
        plan_review: null,
        roadmap_transition: null,
      });

      const response = await invokeFunction<GeneratePlanResponse>("generate-plan-v2", {
        transformation_id: currentTransformation.id,
        mode: "preview",
        pace: draft.profile.pace || undefined,
      }, {
        timeoutMs: 180_000,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;
      if (!response.plan_preview) {
        throw new Error("Le preview du plan est manquant.");
      }

      const nextTransformations = draft.transformations;
      updatedTransformations = nextTransformations;

      const planReview: PlanReviewDraft = {
        plan_preview: response.plan_preview,
        feedback: "",
      };

      persistDraft(setDraft, {
        cycle_status: "ready_for_plan",
        stage: "plan_review",
        plan_review: planReview,
        transformations: nextTransformations,
      });
    } catch (submitError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      if (isPlanGenerationTimeout(submitError)) {
        const recoveredPreview = await recoverPlanPreviewAfterTimeout({
          actionToken,
          transformationId: currentTransformation.id,
          requestStartedAt,
        });
        if (recoveredPreview && isOnboardingActionCurrent(actionToken)) {
          persistDraft(setDraft, {
            cycle_status: "ready_for_plan",
            stage: "plan_review",
            plan_review: {
              plan_preview: recoveredPreview,
              feedback: "",
            },
            transformations: updatedTransformations ?? draft.transformations,
          });
          return;
        }
      }
      if (getErrorStatus(submitError) === 409) {
        const msg = getErrorMessage(submitError, "");

        // "Maximum attempts" → genuinely stuck, keep draft and show error.
        if (msg.toLowerCase().includes("maximum")) {
          persistDraft(setDraft, {
            stage: "profile",
            ...(updatedTransformations ? { transformations: updatedTransformations } : {}),
          });
          setError(
            "Le nombre maximum de tentatives de génération a été atteint. Contacte le support.",
          );
          return;
        }

        // Otherwise the plan is already active on the server — verify cycle
        // status before deciding whether to redirect or surface an error.
        let cycleIsActive = false;
        try {
          if (draft.cycle_id) {
            const { data: cycleCheck } = await supabase
              .from("user_cycles")
              .select("status")
              .eq("id", draft.cycle_id)
              .maybeSingle();
            cycleIsActive = cycleCheck?.status === "active";
          }
        } catch {
          // ignore — best-effort check
        }

        if (cycleIsActive) {
          // Plan fully generated and cycle activated — safe to go to dashboard.
          try {
            await supabase
              .from("profiles")
              .update({ onboarding_completed: true })
              .eq("id", effectiveUser.id);
          } catch {
            // best-effort
          }
          clearOnboardingV2Draft();
          navigate("/dashboard", { replace: true });
          return;
        }

        // Cycle not active yet — generation is still in progress or truly
        // failed. Keep the draft intact at the profile step so the user can
        // retry without losing their data.
        persistDraft(setDraft, {
          stage: "profile",
          ...(updatedTransformations ? { transformations: updatedTransformations } : {}),
        });
        setError(
          "La génération a été interrompue. Tes réponses sont sauvegardées — tu peux réessayer.",
        );
        return;
      }

      persistDraft(setDraft, {
        stage: "profile",
        ...(updatedTransformations ? { transformations: updatedTransformations } : {}),
      });
      setError(
        getErrorMessage(
          submitError,
          "Impossible de générer le plan pour le moment.",
        ),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handlePlanRegenerate(variant?: PlanRegenerationVariant) {
    if (!effectiveUser || !currentTransformation || !draft.plan_review) return;

    const feedback = buildPlanRegenerationFeedback(
      draft.plan_review.feedback,
      variant,
    );
    setError(null);

    const actionToken = beginOnboardingAction({
      id: "plan",
      label: "Sophia ajuste ton plan…",
    });
    const requestStartedAt = new Date().toISOString();
    try {
      persistDraft(setDraft, { stage: "generating_plan" });

      const response = await invokeFunction<GeneratePlanResponse>("generate-plan-v2", {
        transformation_id: currentTransformation.id,
        mode: "preview",
        force_regenerate: true,
        pace: draft.profile.pace || undefined,
        ...(feedback ? { feedback } : {}),
      }, {
        timeoutMs: 180_000,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;

      if (!response.plan_preview) {
        throw new Error("Le plan ajusté n'a pas pu être récupéré.");
      }

      persistDraft(setDraft, {
        stage: "plan_review",
        plan_review: {
          plan_preview: response.plan_preview,
          feedback,
        },
      });
    } catch (submitError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      if (isPlanGenerationTimeout(submitError)) {
        const recoveredPreview = await recoverPlanPreviewAfterTimeout({
          actionToken,
          transformationId: currentTransformation.id,
          requestStartedAt,
        });
        if (recoveredPreview && isOnboardingActionCurrent(actionToken)) {
          persistDraft(setDraft, {
            stage: "plan_review",
            plan_review: {
              plan_preview: recoveredPreview,
              feedback,
            },
          });
          return;
        }
      }
      persistDraft(setDraft, { stage: "plan_review" });
      setError(
        getErrorMessage(
          submitError,
          "Impossible d’ajuster le plan pour le moment.",
        ),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handlePlanConfirm() {
    if (!effectiveUser || !currentTransformation || !draft.cycle_id) return;

    setError(null);

    const actionToken = beginOnboardingAction({
      id: "activate",
      label: "Activation du plan…",
    });
    try {
      console.info("[onboarding][plan_confirm][start]", {
        user_id: effectiveUser.id,
        cycle_id: draft.cycle_id,
        transformation_id: currentTransformation.id,
        transformation_title: currentTransformation.title ?? null,
        preserved_active_transformation_id: preservedCycleActiveTransformationId,
        has_plan_review: Boolean(draft.plan_review),
        plan_review_title: draft.plan_review?.plan_preview?.title ?? null,
      });

      await invokeFunction<GeneratePlanResponse>("generate-plan-v2", {
        transformation_id: currentTransformation.id,
        mode: "confirm",
        ...(!isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema) &&
            preservedCycleActiveTransformationId
          ? { preserve_active_transformation_id: preservedCycleActiveTransformationId }
          : {}),
      }, {
        timeoutMs: 180_000,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;

      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", effectiveUser.id);
      if (!isOnboardingActionCurrent(actionToken)) return;

      clearOnboardingV2Draft();
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      console.error("[onboarding][plan_confirm][failed]", {
        cycle_id: draft.cycle_id,
        transformation_id: currentTransformation.id,
        transformation_title: currentTransformation.title ?? null,
        error_status: getErrorStatus(submitError),
        error_message: getErrorMessage(submitError, "plan_confirm_failed"),
        raw_error: submitError,
      });
      if (isPlanGenerationTimeout(submitError)) {
        try {
          const [{ data: cycleCheck }, { data: existingPlan }] = await Promise.all([
            supabase
              .from("user_cycles")
              .select("status,active_transformation_id")
              .eq("id", draft.cycle_id)
              .maybeSingle(),
            supabase
              .from("user_plans_v2")
              .select("id,status")
              .eq("transformation_id", currentTransformation.id)
              .in("status", ["generated", "active", "paused"])
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          const shouldRedirect =
            cycleCheck?.status === "active" ||
            existingPlan?.status === "active" ||
            existingPlan?.status === "paused";

          if (shouldRedirect) {
            try {
              await supabase
                .from("profiles")
                .update({ onboarding_completed: true })
                .eq("id", effectiveUser.id);
            } catch {
              // best-effort
            }
            clearOnboardingV2Draft();
            navigate("/dashboard", { replace: true });
            return;
          }
        } catch {
          // ignore recovery errors and fall through to standard handling
        }
      }
      if (getErrorStatus(submitError) === 409) {
        const msg = getErrorMessage(submitError, "").toLowerCase();
        let shouldRedirect = msg.includes("active v2 plan");

        if (!shouldRedirect) {
          try {
            const { data: existingPlan } = await supabase
              .from("user_plans_v2")
              .select("id,status,cycle_id,transformation_id")
              .eq("transformation_id", currentTransformation.id)
              .in("status", ["generated", "active", "paused"])
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            shouldRedirect = Boolean(existingPlan?.id);

            if (existingPlan?.id) {
              const now = new Date().toISOString();
              const cycleId = existingPlan.cycle_id ?? draft.cycle_id;

              if (cycleId) {
                await supabase
                  .from("user_cycles")
                  .update({
                    status: "active",
                    active_transformation_id:
                      preservedCycleActiveTransformationId ?? currentTransformation.id,
                    updated_at: now,
                  })
                  .eq("id", cycleId);
              }

              await supabase
                .from("user_transformations")
                .update({
                  status: "active",
                  activated_at: now,
                  updated_at: now,
                })
                .eq("id", currentTransformation.id);

              if (existingPlan.status !== "active") {
                await supabase
                  .from("user_plans_v2")
                  .update({
                    status: "active",
                    activated_at: now,
                    updated_at: now,
                  })
                  .eq("id", existingPlan.id);
              }
            }
          } catch {
            // ignore, we'll fall back to the normal error path
          }
        }

        if (shouldRedirect) {
          try {
            await supabase
              .from("profiles")
              .update({ onboarding_completed: true })
              .eq("id", effectiveUser.id);
          } catch {
            // best-effort
          }
          clearOnboardingV2Draft();
          navigate("/dashboard", { replace: true });
          return;
        }
      }

      persistDraft(setDraft, { stage: "plan_review" });
      setError(
        getErrorMessage(
          submitError,
          "Impossible d’activer le plan pour le moment.",
        ),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  async function handleTransformationFocusConfirm(payload: {
    selectedTransformationId: string;
    transformations: TransformationPreviewV2[];
  }) {
    setError(null);

    if (!effectiveUser) {
      persistDraft(setDraft, {
        stage: "questionnaire_setup",
        transformations: payload.transformations,
        active_transformation_id: payload.selectedTransformationId,
        questionnaire_schema: null,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      });
      return;
    }

    const actionToken = beginOnboardingAction({
      id: "focus",
      label: "Sophia prépare ton point de départ…",
    });
    try {
      await clearServerDownstreamState({
        targetStage: "priorities",
        activeTransformationId: isManualTransformationId(payload.selectedTransformationId)
          ? null
          : payload.selectedTransformationId,
      });
      if (!isOnboardingActionCurrent(actionToken)) return;
      const persisted = await persistTransformationFocusSelection(payload);
      if (!isOnboardingActionCurrent(actionToken)) return;
      persistDraft(setDraft, {
        cycle_status: "prioritized",
        stage: "questionnaire_setup",
        transformations: persisted.transformations,
        active_transformation_id: persisted.selectedTransformationId,
        questionnaire_schema: null,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      });
    } catch (submitError) {
      if (!isOnboardingActionCurrent(actionToken)) return;
      setError(
        getErrorMessage(
          submitError,
          "Impossible d’enregistrer ce choix pour le moment.",
        ),
      );
    } finally {
      finishOnboardingAction(actionToken);
    }
  }

  if (onboardingAuthLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  const isCycleReprioritizationCapture =
    draft.entry_mode === "add_transformation" &&
    draft.stage === "capture" &&
    Boolean(draft.cycle_id);

  const getStepInfo = (stage: OnboardingV2Draft["stage"]) => {
    switch (stage) {
      case "capture":
        return { current: 1, total: 5, label: "Expression des besoins" };
      case "validation":
      case "priorities":
        return { current: 2, total: 5, label: "Choix du focus" };
      case "questionnaire_setup":
      case "questionnaire":
        return {
          current: 3,
          total: 5,
          label: isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema)
            ? "Bilan de transition"
            : "Questionnaire sur mesure",
        };
      case "profile":
        return { current: 4, total: 5, label: "Profil & Engagements" };
      case "generating_plan":
        return { current: 5, total: 5, label: "Génération du plan" };
      case "plan_review":
        return { current: 5, total: 5, label: "Validation du plan" };
      default:
        return { current: 1, total: 5, label: "Onboarding" };
    }
  };

  const stepInfo = getStepInfo(draft.stage);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {draft.stage !== "generating_plan" && backAction.kind !== "none" && (
            <button
              type="button"
              onClick={handleBackClick}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:text-gray-900"
            >
              ←&nbsp;Retour
            </button>
          )}

          {draft.entry_mode !== "add_transformation" &&
            (["capture", "priorities", "questionnaire_setup", "questionnaire"] as OnboardingV2Draft["stage"][]).includes(draft.stage) && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Veux-tu vraiment tout effacer et recommencer ?")) {
                  void handleRestart();
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:text-gray-900"
            >
              <RefreshCcw className="h-4 w-4" />
              Recommencer
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm">
          <div className="text-sm font-medium text-gray-600">
            Étape {stepInfo.current} sur {stepInfo.total}
          </div>
          <div className="flex h-2 w-16 overflow-hidden rounded-full bg-gray-100 sm:w-24">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${(stepInfo.current / stepInfo.total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {isPostAuthTransition && (
        <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm">
          {(postAuthHydrating || !error) && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                Sophia prépare ton espace…
              </h2>
              <p className="text-base leading-relaxed text-gray-500">
                Tes réponses sont sauvegardées. On configure ton parcours, ça
                peut prendre quelques secondes.
              </p>
            </>
          )}
          {!postAuthHydrating && error && (
            <>
              <p className="text-base font-medium text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => {
                  postAuthHydrationAttemptRef.current = null;
                  setError(null);
                  setHydrationRetryKey((k) => k + 1);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
              >
                <RefreshCcw className="h-4 w-4" />
                Réessayer
              </button>
            </>
          )}
        </section>
      )}

      {!isPostAuthTransition && loadingState.id && (
        <ProgressiveLoader
          durationPerStep={
            loadingState.id === "analyze" ? 4300 :
            loadingState.id === "plan" ? 6000 :
            loadingState.id === "save" ? 5000 :
            2500
          }
          steps={
            loadingState.id === "analyze"
              ? [
                  "Analyse de ton texte...",
                  "Extraction des concepts clés...",
                  "Identification des priorités...",
                  "Structuration des idées...",
                  "Catégorisation des sujets...",
                  "Enrichissement du contexte...",
                  "Préparation des choix...",
                ]
              : loadingState.id === "questionnaire"
              ? [
                  "Analyse du focus...",
                  "Définition des axes...",
                  "Génération des questions...",
                  "Finalisation du questionnaire...",
                ]
              : loadingState.id === "plan"
              ? [
                  "Analyse de ton profil...",
                  "Étude de tes réponses au questionnaire...",
                  "Définition de la stratégie globale...",
                  "Création de la structure du plan...",
                  "Découpage en étapes actionnables...",
                  "Ajustement du rythme et de la durée...",
                  "Intégration des bonnes pratiques...",
                  "Vérification de la cohérence...",
                  "Personnalisation des conseils...",
                  "Finalisation de ton plan sur mesure...",
                ]
              : loadingState.id === "focus"
              ? [
                  "Analyse des priorités...",
                  "Préparation du point de départ...",
                ]
              : loadingState.id === "save"
              ? [
                  "Enregistrement des réponses...",
                  "Classification de la transformation...",
                  "Étude de la faisabilité one shot...",
                ]
              : [loadingState.label || "Chargement..."]
          }
        />
      )}

      {!isPostAuthTransition && error && (
        <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {draft.stage === "capture" && (
        <FreeTextCapture
          value={draft.raw_intake_text}
          onChange={(value) =>
            persistDraft(setDraft, { raw_intake_text: value })}
          onSubmit={handleAnalyze}
          isSubmitting={Boolean(loadingState.id !== null)}
          clarificationPrompt={draft.clarification_prompt}
          introTitle={
            isCycleReprioritizationCapture
              ? "Sophia repart de ton cycle actuel."
              : undefined
          }
          introText={
            isCycleReprioritizationCapture
              ? "Décris le sujet que tu veux faire passer devant. Sophia va relire les transformations déjà connues, fusionner les infos utiles et éviter les doublons."
              : undefined
          }
          title={
            isCycleReprioritizationCapture
              ? "Quel autre sujet veux-tu faire passer en priorité ?"
              : undefined
          }
          description={
            isCycleReprioritizationCapture
              ? "Tu peux ajouter un nouveau besoin, reformuler un sujet déjà présent, ou préciser ce qui compte le plus maintenant. La suite du cycle sera réanalysée sans repartir de zéro."
              : undefined
          }
          submitLabel={
            isCycleReprioritizationCapture
              ? "Réanalyser la suite du cycle"
              : undefined
          }
        />
      )}

      {draft.stage === "priorities" && (
        <TransformationFocusStep
          key={`${draft.active_transformation_id ?? "none"}:${draft.transformations.filter(isPendingCycleTransformation).map((item) => item.id).join(",")}`}
          transformations={draft.transformations.filter(isPendingCycleTransformation)}
          initialSelectedId={
            draft.transformations.some((item) =>
              item.id === draft.active_transformation_id && isPendingCycleTransformation(item)
            )
              ? draft.active_transformation_id
              : draft.transformations.find(isPendingCycleTransformation)?.id ?? null
          }
          onConfirm={handleTransformationFocusConfirm}
          isSubmitting={Boolean(loadingState.id !== null)}
        />
      )}

      {draft.stage === "questionnaire_setup" && !loadingState.id && (
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-3 text-2xl font-semibold text-gray-900">
            Préparation du questionnaire…
          </h2>
          <p className="mb-6 text-base leading-relaxed text-gray-600">
            {error
              ? "Une erreur est survenue lors de la génération du questionnaire."
              : "Le questionnaire sur mesure se prépare. Si rien ne se passe, utilise le bouton ci-dessous."}
          </p>
          <button
            type="button"
            disabled={Boolean(loadingState.id !== null)}
            onClick={() => {
              if (draft.active_transformation_id) {
                void handleGenerateQuestionnaire(draft.active_transformation_id);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            Réessayer
          </button>
        </section>
      )}

      {draft.stage === "questionnaire" && draft.questionnaire_schema && !isPostAuthTransition && (
        <CustomQuestionnaire
          schema={draft.questionnaire_schema}
          initialAnswers={draft.questionnaire_answers}
          onChange={handleQuestionnaireDraftChange}
          onSubmit={handleQuestionnaireSubmit}
          allowBackwardNavigation={
            !isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema)
          }
          onBack={() => {
            if (isMultiPartTransitionQuestionnaireSchema(draft.questionnaire_schema)) {
              return;
            }
            void handleStageBack("priorities");
          }}
          isSubmitting={Boolean(loadingState.id !== null)}
        />
      )}

      {draft.stage === "profile" && (
        <MinimalProfile
          value={draft.profile}
          onChange={(profile) => persistDraft(setDraft, { profile })}
          onSubmit={handleProfileSubmit}
          isSubmitting={Boolean(loadingState.id !== null)}
          currentTransformationTitle={currentTransformation?.title ?? null}
          planTypeClassification={currentTransformation?.plan_type_classification ?? null}
          questionnaireSchema={currentTransformation?.questionnaire_schema ?? null}
          questionnaireAnswers={currentTransformation?.questionnaire_answers ?? null}
          hasStoredBirthDate={storedProfileFields.birthDate}
          hasStoredGender={storedProfileFields.gender}
        />
      )}

      {draft.stage === "generating_plan" && <PlanGenerationScreen />}

      {draft.stage === "plan_review" && draft.plan_review && (
        <PlanReviewScreen
          plan={draft.plan_review.plan_preview}
          professionalSupport={currentTransformation?.professional_support ?? null}
          feedback={draft.plan_review.feedback}
          isBusy={Boolean(loadingState.id !== null)}
          onFeedbackChange={(feedback) =>
            persistDraft(setDraft, {
              plan_review: draft.plan_review
                ? { ...draft.plan_review, feedback }
                : null,
            })
          }
          onRegenerate={handlePlanRegenerate}
          onConfirm={handlePlanConfirm}
        />
      )}

    </div>
  );
}
