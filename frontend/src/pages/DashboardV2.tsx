import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight,
  Bell,
  Book,
  ChevronDown,
  ChevronUp,
  Compass,
  Hammer,
  Layout,
  Lightbulb,
  Loader2,
  Lock,
  Quote,
  RefreshCcw,
  Repeat,
  Settings,
  Shield,
  Sparkles,
  Map as MapIcon,
  Plus,
  Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import { hasArchitecteAccess } from "../lib/entitlements";

import { PlanActionCardsByLevel } from "../components/dashboard-v2/ActionCardsResourcePanel";
import { AtelierInspirations } from "../components/dashboard-v2/AtelierInspirations";
import { BaseDeVieSection } from "../components/dashboard-v2/BaseDeVieSection";
import { DefenseCard, DefenseCardSkeleton } from "../components/dashboard-v2/DefenseCard";
import { DimensionSection } from "../components/dashboard-v2/DimensionSection";
import { LabCardsPanel } from "../components/dashboard-v2/LabCardsPanel";
import { LevelCompletionModal } from "../components/dashboard-v2/LevelCompletionModal";
import { MultiPartTransitionGateModal } from "../components/dashboard-v2/MultiPartTransitionGateModal";
import { MultiPartTransitionQuestionnaireModal } from "../components/dashboard-v2/MultiPartTransitionQuestionnaireModal";
import { Phase1FoundationCard } from "../components/dashboard-v2/Phase1FoundationCard";
import { Phase1KickoffFlow } from "../components/dashboard-v2/Phase1KickoffFlow";
import { PhaseProgression } from "../components/dashboard-v2/PhaseProgression";
import { ProfessionalSupportTrackerCard } from "../components/dashboard-v2/ProfessionalSupportTrackerCard";
import {
  PlanRevisionPanel,
  type PlanRevisionConversationMode,
  type PlanReviewSessionStatus,
  type PlanRevisionProposal,
  type PlanRevisionPanelAction,
  type PlanRevisionThreadEntry,
} from "../components/dashboard-v2/PlanRevisionPanel";
import { PreferencesSection } from "../components/dashboard-v2/PreferencesSection";
import { RemindersSection } from "../components/dashboard-v2/RemindersSection";
import { StrategyHeader } from "../components/dashboard-v2/StrategyHeader";
import { TransformationClosureModal } from "../components/dashboard-v2/TransformationClosureModal";
import { UnlockPreview } from "../components/dashboard-v2/UnlockPreview";

import { WeekCard } from "../components/dashboard/WeekCard";
import { WishlistTab } from "../components/architect/WishlistTab";
import { StoriesTab } from "../components/architect/StoriesTab";
import { ReflectionsTab } from "../components/architect/ReflectionsTab";
import { QuotesTab } from "../components/architect/QuotesTab";

import { useDashboardV2Data, type DashboardV2PlanItemRuntime } from "../hooks/useDashboardV2Data";
import {
  useDashboardV2Logic,
  type DashboardV2DimensionGroup,
} from "../hooks/useDashboardV2Logic";
import { useDefenseCard } from "../hooks/useDefenseCard";
import { useLabCards } from "../hooks/useLabCards";
import { useModules } from "../hooks/useModules";
import { usePhase1 } from "../hooks/usePhase1";
import { usePotions } from "../hooks/usePotions";
import { isVisibleTransformationStatus } from "../lib/dashboardTransformations";
import { exportDefenseCardAsPdf } from "../lib/exportDefenseCard";
import { getPhase1MandatoryProgress } from "../lib/phase1";
import {
  buildBaseDeVieDraft,
  getBaseDeViePayload,
  isPlanReadyForClosure,
} from "../lib/baseDeVie";
import type { LabScopeInput } from "../lib/labScope";
import { buildLevelReviewQuestions } from "../lib/levelCompletion";
import {
  createEmptyOnboardingV2Draft,
  persistOnboardingV2DraftLocally,
  type QuestionnaireSchemaV2,
  toTransformationPreview,
} from "../lib/onboardingV2";
import { newRequestId, requestHeaders } from "../lib/requestId";
import {
  buildMultiPartTransitionQuestionnaireSchema,
  buildSimpleTransitionQuestionnaireSchema,
} from "../lib/multiPartTransitionQuestionnaire";
import { extractProfessionalSupport } from "../lib/professionalSupport";
import { getDisplayPhaseOrder } from "../lib/planPhases";
import { isPlanLevelReviewWindowOpen, parsePlanScheduleAnchor } from "../lib/planSchedule";
import { supabase } from "../lib/supabase";
import { extractLevelToolRecommendationState } from "../lib/toolRecommendations";
import type { PlanContentV3 } from "../types/v2";
import UserProfile from "../components/UserProfile";

const EMPTY_DIMENSION_GROUP: DashboardV2DimensionGroup = {
  all: [],
  active: [],
  pending: [],
  maintenance: [],
  stalled: [],
  completed: [],
};

function toPositiveIntegerOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

async function invokeFunctionWithTimeout<T>(
  name: string,
  body: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<T> {
  const requestId = newRequestId();
  const invokePromise = supabase.functions.invoke<T>(name, {
    body,
    headers: requestHeaders(requestId),
  });

  const result = await Promise.race([
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
  if (error) throw error;
  return data as T;
}

function extractTransformationJourneyMetadata(
  handoffPayload: Record<string, unknown> | null,
): {
  isMultiPart: boolean;
  partNumber: number | null;
  estimatedTotalParts: number | null;
  continuationHint: string | null;
} | null {
  const onboardingV2 = (
    handoffPayload as { onboarding_v2?: unknown } | null | undefined
  )?.onboarding_v2;
  if (!onboardingV2 || typeof onboardingV2 !== "object" || Array.isArray(onboardingV2)) {
    return null;
  }

  const multiPartJourney = (
    onboardingV2 as { multi_part_journey?: unknown }
  ).multi_part_journey;
  if (!multiPartJourney || typeof multiPartJourney !== "object" || Array.isArray(multiPartJourney)) {
    return null;
  }

  const raw = multiPartJourney as Record<string, unknown>;
  const rawIsMultiPart = raw.is_multi_part;
  const isMultiPart = rawIsMultiPart === true || rawIsMultiPart === "true";
  if (!isMultiPart) return null;

  return {
    isMultiPart: true,
    partNumber: toPositiveIntegerOrNull(raw.part_number),
    estimatedTotalParts: toPositiveIntegerOrNull(raw.estimated_total_parts),
    continuationHint:
      typeof raw.continuation_hint === "string" && raw.continuation_hint.trim().length > 0
        ? raw.continuation_hint.trim()
        : null,
  };
}

function extractTransformationJourneyMode(
  handoffPayload: Record<string, unknown> | null,
): string | null {
  const onboardingV2 = (
    handoffPayload as { onboarding_v2?: unknown } | null | undefined
  )?.onboarding_v2;
  if (!onboardingV2 || typeof onboardingV2 !== "object" || Array.isArray(onboardingV2)) {
    return null;
  }

  const classification = (onboardingV2 as { plan_type_classification?: unknown }).plan_type_classification;
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    return null;
  }

  const journeyStrategy = (classification as { journey_strategy?: unknown }).journey_strategy;
  if (!journeyStrategy || typeof journeyStrategy !== "object" || Array.isArray(journeyStrategy)) {
    return null;
  }

  return typeof (journeyStrategy as { mode?: unknown }).mode === "string"
    ? String((journeyStrategy as { mode?: unknown }).mode)
    : null;
}

function extractSplitTransformationGoal(
  handoffPayload: Record<string, unknown> | null,
  partNumber: 1 | 2,
): string | null {
  const onboardingV2 = (
    handoffPayload as { onboarding_v2?: unknown } | null | undefined
  )?.onboarding_v2;
  if (!onboardingV2 || typeof onboardingV2 !== "object" || Array.isArray(onboardingV2)) {
    return null;
  }

  const classification = (onboardingV2 as { plan_type_classification?: unknown }).plan_type_classification;
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    return null;
  }

  const splitMetricGuidance = (classification as { split_metric_guidance?: unknown }).split_metric_guidance;
  if (splitMetricGuidance && typeof splitMetricGuidance === "object" && !Array.isArray(splitMetricGuidance)) {
    const transformationKey = partNumber === 2 ? "transformation_2" : "transformation_1";
    const splitPart = (
      splitMetricGuidance as {
        transformation_1?: unknown;
        transformation_2?: unknown;
      }
    )[transformationKey];

    if (splitPart && typeof splitPart === "object" && !Array.isArray(splitPart)) {
      const successDefinition = (splitPart as { success_definition?: unknown }).success_definition;
      if (typeof successDefinition === "string" && successDefinition.trim().length > 0) {
        return successDefinition.trim();
      }
    }
  }

  const journeyStrategy = (classification as { journey_strategy?: unknown }).journey_strategy;
  if (!journeyStrategy || typeof journeyStrategy !== "object" || Array.isArray(journeyStrategy)) {
    return null;
  }

  const goalKey = partNumber === 2 ? "transformation_2_goal" : "transformation_1_goal";
  const goal = (journeyStrategy as {
    transformation_1_goal?: unknown;
    transformation_2_goal?: unknown;
  })[goalKey];

  return typeof goal === "string" && goal.trim().length > 0 ? goal.trim() : null;
}

type DashboardTab = "plan" | "lab" | "inspiration" | "reminders" | "preferences";
type ArchitectTab = "atelier" | "wishlist" | "stories" | "reflections" | "quotes";
type DashboardScopeId = string | "out_of_plan";

type ReviewPlanResponse = {
  request_id: string;
  review_id: string;
  review_kind: PlanRevisionProposal["review_kind"];
  adjustment_scope: PlanRevisionProposal["adjustment_scope"];
  decision: PlanRevisionProposal["decision"];
  understanding: string;
  impact: string;
  proposed_changes: string[];
  control_mode: PlanRevisionProposal["control_mode"];
  resistance_note: string | null;
  principle_reminder: string | null;
  offer_complete_level: boolean;
  regeneration_feedback: string | null;
  clarification_question: string | null;
  assistant_summary: string;
  assistant_message: string;
  conversation_mode: PlanRevisionConversationMode;
  conversation_thread: PlanRevisionThreadEntry[];
  precision_count: number;
  message_count: number;
  session_status: PlanReviewSessionStatus;
  session_expires_at: string | null;
};

type GeneratePlanPreviewResponse = {
  request_id: string;
  plan_id: string;
  plan_preview: PlanContentV3 | null;
  plan_status: "draft" | "generated" | "active" | "paused" | "completed" | "archived";
};

type CompleteLevelResponse = {
  request_id: string;
  review_id: string;
  generation_event_id: string;
  decision: "keep" | "shorten" | "extend" | "lighten";
  decision_reason: string;
  summary: string;
  next_level: {
    phase_id: string;
    level_order: number;
    title: string;
    duration_weeks: number;
  } | null;
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
};

const REACTIVATABLE_PLAN_STATUS_PRIORITY = {
  active: 0,
  paused: 1,
  completed: 2,
  archived: 3,
  generated: 4,
  draft: 5,
} as const;

const REACTIVATED_TRANSFORMATION_STORAGE_KEY =
  "sophia:dashboard:reactivated_transformation_id";

function readReactivatedTransformationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage
      .getItem(REACTIVATED_TRANSFORMATION_STORAGE_KEY)
      ?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function persistReactivatedTransformationId(transformationId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (transformationId) {
      window.sessionStorage.setItem(
        REACTIVATED_TRANSFORMATION_STORAGE_KEY,
        transformationId,
      );
    } else {
      window.sessionStorage.removeItem(REACTIVATED_TRANSFORMATION_STORAGE_KEY);
    }
  } catch {
    // ignore sessionStorage failures
  }
}

type ResourceFocusTarget = {
  defenseTriggerKey: string;
  token: number;
};

type PlanAdjustmentRevision = {
  effective_start_date: string;
  reason: string;
  scope: "level" | "plan";
  assistant_message?: string | null;
};

function getBrowserLocalYmd(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCompletedTransformationDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function buildPlanAdjustmentFeedback(args: {
  proposal: PlanRevisionProposal;
  initialComment: string;
  precisionComment: string | null;
}): string {
  return [
    args.proposal.regeneration_feedback?.trim() || null,
    `Commentaire initial du user: ${args.initialComment.trim()}`,
    args.precisionComment?.trim()
      ? `Précision ajoutée ensuite par le user: ${args.precisionComment.trim()}`
      : null,
    args.proposal.assistant_summary?.trim()
      ? `Lecture actuelle de Sophia: ${args.proposal.assistant_summary.trim()}`
      : null,
  ].filter((entry): entry is string => Boolean(entry && entry.trim().length > 0)).join("\n\n");
}

function getPreviewScope(mode: PlanRevisionConversationMode): "level" | "plan" | null {
  if (mode === "level_adjustment") return "level";
  if (mode === "plan_adjustment") return "plan";
  return null;
}

function parsePlanAdjustmentRevision(value: unknown): PlanAdjustmentRevision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const effectiveStartDate = typeof candidate.effective_start_date === "string"
    ? candidate.effective_start_date.trim()
    : "";
  const reason = typeof candidate.reason === "string"
    ? candidate.reason.trim()
    : "";
  const scope = candidate.scope === "level" ? "level" : candidate.scope === "plan" ? "plan" : null;

  if (!effectiveStartDate || !reason || !scope) return null;

  return {
    effective_start_date: effectiveStartDate,
    reason,
    scope,
    assistant_message: typeof candidate.assistant_message === "string"
      ? candidate.assistant_message.trim()
      : null,
  };
}

function mergeTransitionDebriefIntoHandoffPayload(args: {
  handoffPayload: Record<string, unknown> | null;
  answers: Record<string, string | string[]>;
  questionnaireSchema: QuestionnaireSchemaV2;
  previousTransformationId: string | null;
  source: string;
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
        source: args.source,
        previous_transformation_id: args.previousTransformationId,
        answered_at: new Date().toISOString(),
        questionnaire_schema: args.questionnaireSchema,
        answers: args.answers,
      },
    },
  };
}

export default function DashboardV2() {
  const navigate = useNavigate();
  const { startSession } = useOnboardingAmbientAudio();
  const { subscription, accessTier } = useAuth();
  const [selectedScopeId, setSelectedScopeId] = useState<DashboardScopeId | null>(null);

  const {
    user,
    authLoading,
    loading,
    error,
    profile,
    cycle,
    transformations,
    transformation,
    plan,
    planContent,
    planContentV3,
    planItems,
    professionalSupportRecommendations,
    levelToolRecommendations,
    levelToolRecommendationsAvailable,
    nextTransformation,
    hasIncompleteCycle,
    refetch,
  } = useDashboardV2Data(
    selectedScopeId && selectedScopeId !== "out_of_plan" ? selectedScopeId : null,
  );

  const activePlanContent = planContentV3 ?? planContent;
  const isV3 = planContentV3 != null;
  const labScope: LabScopeInput = useMemo(() => {
    if (!cycle) return null;
    if (selectedScopeId === "out_of_plan") {
      return {
        kind: "out_of_plan",
        cycleId: cycle.id,
      };
    }
    if (!transformation) return null;
    return {
      kind: "transformation",
      cycleId: cycle.id,
      transformationId: transformation.id,
    };
  }, [cycle, selectedScopeId, transformation]);

  const defense = useDefenseCard(labScope);
  const labCards = useLabCards(labScope);
  const potions = usePotions(labScope);
  const phase1 = usePhase1(isV3 ? transformation : null, refetch);
  const {
    phase1: phase1State,
    preparingStart: phase1PreparingStart,
    phase1StartCooldownActive,
    prepareStart: preparePhase1Start,
  } = phase1;
  const phase1Progress = getPhase1MandatoryProgress(phase1State);
  const phase1Completed = phase1Progress.completed >= phase1Progress.total;

  const logic = useDashboardV2Logic({
    cycle,
    transformation,
    plan,
    planItems,
    planContentV3,
    phase1Completed,
    refetch,
  });
  const currentLevel = logic.phases.find((phase) => phase.state === "active") ?? null;
  const levelToolState = useMemo(
    () => extractLevelToolRecommendationState(transformation?.handoff_payload ?? null),
    [transformation?.handoff_payload],
  );
  const currentPlanLevelToolRecommendations = useMemo(
    () =>
      plan
        ? levelToolRecommendations.filter((recommendation) => recommendation.plan_id === plan.id)
        : [],
    [levelToolRecommendations, plan],
  );
  const hasCurrentPlanLevelToolRecommendations =
    currentPlanLevelToolRecommendations.length > 0;
  const levelToolStateCoversCurrentLevel = Boolean(
    !currentLevel ||
      currentLevel.phase_order < 2 ||
      levelToolState?.levels.some((entry) =>
        entry.target_level_id === currentLevel.phase_id &&
        entry.target_level_order === currentLevel.phase_order
      ),
  );
  const scheduleAnchor = useMemo(
    () => parsePlanScheduleAnchor(planContentV3?.metadata?.schedule_anchor),
    [planContentV3],
  );

  const { modules } = useModules();

  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"action" | "architecte">(
    searchParams.get("mode") === "architecte" ? "architecte" : "action"
  );
  const [isLabUsageOpen, setIsLabUsageOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("plan");
  const [architectTab, setArchitectTab] = useState<ArchitectTab>("atelier");
  const [isAtelierUsageOpen, setIsAtelierUsageOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<
    "general" | "subscription" | "settings"
  >("general");
  const [dashboardActionError, setDashboardActionError] = useState<string | null>(null);
  const [professionalSupportBootstrapId, setProfessionalSupportBootstrapId] =
    useState<string | null>(null);
  const [levelToolBootstrapId, setLevelToolBootstrapId] =
    useState<string | null>(null);
  const [planReviewInput, setPlanReviewInput] = useState("");
  const [planReviewThread, setPlanReviewThread] = useState<PlanRevisionThreadEntry[]>([]);
  const [planReviewProposal, setPlanReviewProposal] = useState<PlanRevisionProposal | null>(null);
  const [planReviewBusy, setPlanReviewBusy] = useState(false);
  const [planReviewBusyAction, setPlanReviewBusyAction] = useState<
    "submit" | "preview" | "confirm" | null
  >(null);
  const [planReviewSessionStatus, setPlanReviewSessionStatus] =
    useState<PlanReviewSessionStatus | null>(null);
  const [planReviewSessionExpiresAt, setPlanReviewSessionExpiresAt] = useState<string | null>(null);
  const [planReviewPreview, setPlanReviewPreview] = useState<PlanContentV3 | null>(null);
  const [planReviewPreviewPlanId, setPlanReviewPreviewPlanId] = useState<string | null>(null);
  const [planReviewComposerMode, setPlanReviewComposerMode] = useState<
    "initial" | "precision" | "chat" | "hidden"
  >("initial");
  const [planReviewInitialComment, setPlanReviewInitialComment] = useState<string | null>(null);
  const [planReviewPrecisionComment, setPlanReviewPrecisionComment] = useState<string | null>(null);
  const [isLevelCompletionModalOpen, setIsLevelCompletionModalOpen] = useState(false);
  const [levelCompletionBusy, setLevelCompletionBusy] = useState(false);
  const [levelCompletionError, setLevelCompletionError] = useState<string | null>(null);
  const [levelCompletionSummary, setLevelCompletionSummary] = useState<string | null>(null);
  const [resourceFocusTarget, setResourceFocusTarget] = useState<ResourceFocusTarget | null>(null);
  const [isTransformationLimitModalOpen, setIsTransformationLimitModalOpen] = useState(false);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [closureModalDismissedForId, setClosureModalDismissedForId] = useState<string | null>(null);
  const [completingTransformation, setCompletingTransformation] = useState(false);
  const [isMultiPartTransitionModalOpen, setIsMultiPartTransitionModalOpen] = useState(false);
  const [multiPartTransitionBusy, setMultiPartTransitionBusy] = useState(false);
  const [isTransitionQuestionnaireModalOpen, setIsTransitionQuestionnaireModalOpen] = useState(false);
  const [transitionQuestionnaireBusy, setTransitionQuestionnaireBusy] = useState(false);
  const [transitionQuestionnaireError, setTransitionQuestionnaireError] = useState<string | null>(null);
  const [reactivatingTransformationId, setReactivatingTransformationId] = useState<string | null>(null);
  const [reactivationError, setReactivationError] = useState<string | null>(null);
  const [phase1BypassTransformationId, setPhase1BypassTransformationId] = useState<string | null>(
    () => readReactivatedTransformationId(),
  );

  const isOutOfPlanScope = selectedScopeId === "out_of_plan";
  const shouldBypassPhase1 =
    Boolean(transformation?.id) && transformation?.id === phase1BypassTransformationId;
  const shouldBlockForPhase1 = Boolean(
    isV3 &&
      transformation &&
      !isOutOfPlanScope &&
      !shouldBypassPhase1 &&
      !phase1Completed,
  );
  const activeTransformations = transformations.filter((item) => item.status === "active");
  const scopeTransformations = activeTransformations;
  const visibleTransformations = useMemo(
    () => transformations.filter((item) => isVisibleTransformationStatus(item.status)),
    [transformations],
  );
  const completedTransformations = useMemo(
    () =>
      transformations
        .filter((item) => item.status === "completed")
        .sort((left, right) =>
          (right.completed_at ?? right.updated_at).localeCompare(left.completed_at ?? left.updated_at)
        ),
    [transformations],
  );
  const remainingTransformations = transformations.filter((item) =>
    item.status === "ready" || item.status === "pending"
  );
  const recommendedAdditionalTransformation = nextTransformation ?? remainingTransformations[0] ?? null;
  const canAddTransformation = activeTransformations.length < 2;
  const currentBaseDeViePayload = useMemo(
    () => getBaseDeViePayload(transformation?.base_de_vie_payload ?? null),
    [transformation?.base_de_vie_payload],
  );

  const openPlanDefenseResourceEditor = (item: DashboardV2PlanItemRuntime) => {
    const impulse = item.linked_defense_card?.content.impulses.find((entry) =>
      Array.isArray(entry.triggers) && entry.triggers.length > 0,
    );
    const trigger = impulse?.triggers?.[0];
    if (!item.linked_defense_card || !trigger) return;

    setResourceFocusTarget({
      defenseTriggerKey: `${item.linked_defense_card.id}:${trigger.trigger_id}`,
      token: Date.now(),
    });
    setActiveTab("lab");
  };

  const clearPlanReviewSessionState = () => {
    setPlanReviewThread([]);
    setPlanReviewProposal(null);
    setPlanReviewSessionStatus(null);
    setPlanReviewSessionExpiresAt(null);
    setPlanReviewPreview(null);
    setPlanReviewPreviewPlanId(null);
    setPlanReviewComposerMode("initial");
    setPlanReviewInitialComment(null);
    setPlanReviewPrecisionComment(null);
    setPlanReviewInput("");
  };

  useEffect(() => {
    if (!transformation) {
      clearPlanReviewSessionState();
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error: sessionError } = await supabase
        .from("user_plan_review_requests")
        .select("*")
        .eq("transformation_id", transformation.id)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (cancelled) return;
      if (sessionError) {
        console.error("[DashboardV2] load active plan review session failed", sessionError);
        clearPlanReviewSessionState();
        return;
      }

      const activeSession = (data ?? []).find((entry) =>
        entry?.session_status === "active" || entry?.session_status === "preview_ready"
      ) ?? null;

      if (!activeSession) {
        clearPlanReviewSessionState();
        return;
      }

      const thread = Array.isArray(activeSession.conversation_thread)
        ? activeSession.conversation_thread.filter((entry: unknown): entry is PlanRevisionThreadEntry =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              !Array.isArray(entry) &&
              ((entry as { role?: unknown }).role === "user" ||
                (entry as { role?: unknown }).role === "assistant") &&
              typeof (entry as { content?: unknown }).content === "string" &&
              typeof (entry as { created_at?: unknown }).created_at === "string",
          )
        )
        : [];

      const userMessages = thread.filter((entry: PlanRevisionThreadEntry) => entry.role === "user");

      setPlanReviewThread(thread);
      setPlanReviewProposal({
        review_id: activeSession.id,
        review_kind: activeSession.review_kind,
        adjustment_scope: activeSession.adjustment_scope,
        decision: activeSession.decision,
        understanding: activeSession.understanding,
        impact: activeSession.impact,
        proposed_changes: Array.isArray(activeSession.proposed_changes)
          ? activeSession.proposed_changes.filter((item: unknown): item is string => typeof item === "string")
          : [],
        control_mode: activeSession.control_mode,
        resistance_note: activeSession.resistance_note,
        principle_reminder: activeSession.principle_reminder,
        offer_complete_level: Boolean(activeSession.offer_complete_level),
        regeneration_feedback: activeSession.regeneration_feedback,
        clarification_question: activeSession.clarification_question,
        assistant_summary: typeof activeSession.assistant_message === "string"
          ? activeSession.assistant_message
          : typeof activeSession.assistant_summary === "string"
            ? activeSession.assistant_summary
            : "",
        conversation_mode: activeSession.conversation_mode,
        precision_count: typeof activeSession.precision_count === "number" ? activeSession.precision_count : Math.max(0, userMessages.length - 1),
        message_count: typeof activeSession.message_count === "number" ? activeSession.message_count : thread.length,
        session_status: activeSession.session_status,
        session_expires_at: typeof activeSession.session_expires_at === "string" ? activeSession.session_expires_at : null,
      });
      setPlanReviewSessionStatus(activeSession.session_status);
      setPlanReviewSessionExpiresAt(typeof activeSession.session_expires_at === "string" ? activeSession.session_expires_at : null);
      setPlanReviewInitialComment(userMessages[0]?.content ?? null);
      setPlanReviewPrecisionComment(userMessages[1]?.content ?? null);
      setPlanReviewComposerMode(activeSession.conversation_mode === "explanation_chat" || activeSession.conversation_mode === "guardrail_chat"
        ? "chat"
        : "hidden");
      setPlanReviewInput("");

      if (typeof activeSession.preview_plan_id === "string" && activeSession.preview_plan_id.length > 0) {
        const { data: previewRow, error: previewError } = await supabase
          .from("user_plans_v2")
          .select("id,content")
          .eq("id", activeSession.preview_plan_id)
          .maybeSingle();

        if (previewError) {
          console.error("[DashboardV2] load plan adjustment preview failed", previewError);
          setPlanReviewPreview(null);
          setPlanReviewPreviewPlanId(null);
          return;
        }

        const previewContent = previewRow?.content as Record<string, unknown> | null;
        if (previewContent?.version === 3 && Array.isArray(previewContent.phases)) {
          setPlanReviewPreview(previewContent as PlanContentV3);
          setPlanReviewPreviewPlanId(previewRow?.id ?? null);
        } else {
          setPlanReviewPreview(null);
          setPlanReviewPreviewPlanId(null);
        }
      } else {
        setPlanReviewPreview(null);
        setPlanReviewPreviewPlanId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transformation?.id]);

  useEffect(() => {
    if (!planReviewProposal?.review_id || !planReviewSessionExpiresAt) return;

    const intervalId = window.setInterval(() => {
      if (new Date(planReviewSessionExpiresAt).getTime() > Date.now()) return;

      const reviewId = planReviewProposal.review_id;
      const previewPlanId = planReviewPreviewPlanId;
      clearPlanReviewSessionState();
      if (previewPlanId) {
        void supabase
          .from("user_plans_v2")
          .update({
            status: "archived",
            archived_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", previewPlanId);
      }
      void supabase
        .from("user_plan_review_requests")
        .update({
          session_status: "expired",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reviewId);
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [planReviewPreviewPlanId, planReviewProposal?.review_id, planReviewSessionExpiresAt]);

  const completedPlanItemTitles = useMemo(
    () =>
      planItems
        .filter((item) => item.status === "completed" || item.status === "in_maintenance")
        .map((item) => item.title),
    [planItems],
  );
  const closureDraft = useMemo(
    () =>
      transformation
        ? buildBaseDeVieDraft({
            transformation,
            activePlanContent,
            completedItemTitles: completedPlanItemTitles,
          })
        : null,
    [activePlanContent, completedPlanItemTitles, transformation],
  );
  const currentLevelReviewQuestions = useMemo(
    () =>
      currentLevel
        ? buildLevelReviewQuestions({
            title: currentLevel.title,
            durationWeeks: currentLevel.duration_weeks,
            weeks: currentLevel.weeks,
            reviewFocus: currentLevel.review_focus,
            dimensions: [...new Set(currentLevel.items.map((item) => item.dimension))],
            primaryMetricLabel: planContentV3?.primary_metric?.label ?? null,
          })
        : [],
    [currentLevel, planContentV3?.primary_metric?.label],
  );
  const isCurrentLevelReviewUnlocked = Boolean(
    currentLevel &&
      (currentLevel.transition_ready ||
        isPlanLevelReviewWindowOpen({
          anchor: scheduleAnchor,
          durationWeeks: currentLevel.duration_weeks ?? (currentLevel.weeks.length || 1),
        })),
  );
  const levelToolRecommendationsByPhaseId = useMemo(() => {
    const grouped = new globalThis.Map<
      string,
      typeof currentPlanLevelToolRecommendations
    >();

    for (const recommendation of currentPlanLevelToolRecommendations) {
      const phaseId = recommendation.target_level_id;
      if (!phaseId) continue;
      const bucket = grouped.get(phaseId) ?? [];
      bucket.push(recommendation);
      grouped.set(phaseId, bucket);
    }

    return grouped;
  }, [currentPlanLevelToolRecommendations]);
  const isTransformationReadyForClosure = Boolean(
    transformation &&
      plan &&
      !isOutOfPlanScope &&
      transformation.status === "active" &&
      isPlanReadyForClosure(planItems.map((item) => item.status)) &&
      !currentBaseDeViePayload?.validated_at,
  );
  const phase1DeepWhyQuestionsLength = phase1State?.deep_why?.questions?.length ?? 0;
  const allPhasesCompleted =
    logic.phases.length > 0 && logic.phases.every((phase) => phase.state === "completed");
  const transformationJourneyMetadata = useMemo(
    () => extractTransformationJourneyMetadata(transformation?.handoff_payload ?? null),
    [transformation?.handoff_payload],
  );
  const transformationJourneyMode = useMemo(
    () => extractTransformationJourneyMode(transformation?.handoff_payload ?? null),
    [transformation?.handoff_payload],
  );
  const journeyContext = activePlanContent?.journey_context ?? null;
  const rawJourneyIsMultiPart = (journeyContext as { is_multi_part?: unknown } | null)?.is_multi_part;
  const journeyIsMultiPart =
    rawJourneyIsMultiPart === true ||
    rawJourneyIsMultiPart === "true" ||
    transformationJourneyMetadata?.isMultiPart === true ||
    transformationJourneyMode === "two_transformations";
  const inferredJourneyPartNumber = useMemo(() => {
    const explicitPartNumber = toPositiveIntegerOrNull(journeyContext?.part_number);
    if (explicitPartNumber != null) return explicitPartNumber;
    if (transformationJourneyMetadata?.partNumber != null) {
      return transformationJourneyMetadata.partNumber;
    }
    if (journeyIsMultiPart && recommendedAdditionalTransformation) return 1;
    if (!transformation || visibleTransformations.length !== 2) return null;
    const currentIndex = visibleTransformations.findIndex((item) => item.id === transformation.id);
    return currentIndex >= 0 ? currentIndex + 1 : null;
  }, [
    journeyContext?.part_number,
    transformationJourneyMetadata?.partNumber,
    journeyIsMultiPart,
    recommendedAdditionalTransformation,
    transformation,
    visibleTransformations,
  ]);
  const inferredJourneyTotalParts = useMemo(() => {
    const explicitTotalParts = toPositiveIntegerOrNull(journeyContext?.estimated_total_parts);
    if (explicitTotalParts != null) return explicitTotalParts;
    if (transformationJourneyMetadata?.estimatedTotalParts != null) {
      return transformationJourneyMetadata.estimatedTotalParts;
    }
    if (journeyIsMultiPart && recommendedAdditionalTransformation) return 2;
    return visibleTransformations.length === 2 ? 2 : null;
  }, [
    journeyContext?.estimated_total_parts,
    transformationJourneyMetadata?.estimatedTotalParts,
    journeyIsMultiPart,
    recommendedAdditionalTransformation,
    visibleTransformations.length,
  ]);
  const isMultiPartJourney = Boolean(
    !isOutOfPlanScope &&
      transformation &&
      (journeyIsMultiPart ||
        (inferredJourneyPartNumber != null &&
          inferredJourneyTotalParts != null &&
          inferredJourneyTotalParts > 1)),
  );
  const hasSequencedNextTransformation = Boolean(
    isMultiPartJourney &&
      (inferredJourneyPartNumber ?? 1) === 1 &&
      (inferredJourneyTotalParts ?? 2) >= 2 &&
      recommendedAdditionalTransformation,
  );
  const transitionCheckpointReached = Boolean(
    hasSequencedNextTransformation &&
      (allPhasesCompleted || transformation?.status === "completed" || isTransformationReadyForClosure),
  );
  const hasSimpleNextTransformation = Boolean(
    !hasSequencedNextTransformation &&
      recommendedAdditionalTransformation,
  );
  const canShowTransformationEndAction = Boolean(
    transformation &&
      transformation.status === "active" &&
      !isOutOfPlanScope,
  );
  const hasCycleRelaunchAction = Boolean(
    !hasSequencedNextTransformation &&
      !hasSimpleNextTransformation &&
      canShowTransformationEndAction,
  );
  const nextSequencedTransformation = hasSequencedNextTransformation
    ? recommendedAdditionalTransformation
    : null;
  const nextSequencedTransformationTitle =
    nextSequencedTransformation?.title ||
    (nextSequencedTransformation
      ? `Transformation ${nextSequencedTransformation.priority_order}`
      : null);
  const nextRecommendedTransformationTitle =
    recommendedAdditionalTransformation?.title ||
    (recommendedAdditionalTransformation
      ? `Transformation ${recommendedAdditionalTransformation.priority_order}`
      : null);
  const transitionTargetLabel = planContentV3?.primary_metric?.label ?? null;
  const transitionTargetValue = planContentV3?.primary_metric?.success_target ?? null;
  const nextSequencedTransformationObjective = useMemo(
    () =>
      nextSequencedTransformation?.success_definition?.trim() ||
      extractSplitTransformationGoal(nextSequencedTransformation?.handoff_payload ?? null, 2) ||
      extractSplitTransformationGoal(transformation?.handoff_payload ?? null, 2) ||
      nextSequencedTransformation?.user_summary?.trim() ||
      null,
    [
      nextSequencedTransformation?.handoff_payload,
      nextSequencedTransformation?.success_definition,
      nextSequencedTransformation?.user_summary,
      transformation?.handoff_payload,
    ],
  );
  const transitionGlobalObjective = hasSequencedNextTransformation
    ? nextSequencedTransformationObjective
    : planContentV3?.global_objective ?? null;
  const transitionQuestionnaireSchema = useMemo(
    () =>
      nextSequencedTransformation
        ? buildMultiPartTransitionQuestionnaireSchema({
          transformationId: nextSequencedTransformation.id,
          currentTransformationTitle: transformation?.title ?? activePlanContent?.title ?? null,
          nextTransformationTitle: nextSequencedTransformation.title,
          previousTransformationId:
            transformation?.id ?? activePlanContent?.transformation_id ?? null,
        })
        : hasSimpleNextTransformation && transformation
          ? buildSimpleTransitionQuestionnaireSchema({
            transformationId: transformation.id,
            currentTransformationTitle: transformation.title ?? activePlanContent?.title ?? null,
            nextTransformationTitle: nextRecommendedTransformationTitle,
          })
        : null,
    [
      activePlanContent?.title,
      activePlanContent?.transformation_id,
      hasSimpleNextTransformation,
      nextRecommendedTransformationTitle,
      nextSequencedTransformation,
      transformation?.id,
      transformation?.title,
    ],
  );

  useEffect(() => {
    if (selectedScopeId === "out_of_plan") return;
    if (transformation?.id && selectedScopeId !== transformation.id) {
      setSelectedScopeId(transformation.id);
    }
  }, [selectedScopeId, transformation?.id]);

  useEffect(() => {
    if (loading || !cycle || isOutOfPlanScope || transformation) return;
    if (activeTransformations.length === 0) {
      setSelectedScopeId("out_of_plan");
    }
  }, [
    activeTransformations.length,
    cycle,
    isOutOfPlanScope,
    loading,
    transformation,
  ]);

  useEffect(() => {
    if (
      isTransitionQuestionnaireModalOpen &&
      !hasSequencedNextTransformation &&
      !hasSimpleNextTransformation
    ) {
      setIsTransitionQuestionnaireModalOpen(false);
      setTransitionQuestionnaireError(null);
    }
  }, [
    hasSequencedNextTransformation,
    hasSimpleNextTransformation,
    isTransitionQuestionnaireModalOpen,
  ]);

  useEffect(() => {
    if (isOutOfPlanScope && activeTab !== "lab") {
      setActiveTab("lab");
    }
  }, [activeTab, isOutOfPlanScope]);

  useEffect(() => {
    if (
      isTransformationReadyForClosure &&
      transformation &&
      closureModalDismissedForId !== transformation.id
    ) {
      setIsClosureModalOpen(true);
    }
  }, [
    closureModalDismissedForId,
    isTransformationReadyForClosure,
    transformation,
  ]);

  useEffect(() => {
    if (!transformation || closureModalDismissedForId == null) return;
    if (closureModalDismissedForId !== transformation.id) {
      setClosureModalDismissedForId(null);
    }
  }, [closureModalDismissedForId, transformation]);

  useEffect(() => {
    const deepWhyAlreadyPrepared = phase1DeepWhyQuestionsLength > 0;

    if (
      !shouldBlockForPhase1 ||
      phase1PreparingStart ||
      phase1StartCooldownActive ||
      deepWhyAlreadyPrepared
    ) {
      return;
    }
    void preparePhase1Start();
  }, [
    phase1StartCooldownActive,
    phase1DeepWhyQuestionsLength,
    phase1PreparingStart,
    preparePhase1Start,
    shouldBlockForPhase1,
  ]);

  useEffect(() => {
    if (!transformation || !plan || !isV3) return;
    if (professionalSupportBootstrapId === transformation.id) return;

    const supportPayload = extractProfessionalSupport(transformation.handoff_payload);
    const supportAlreadyStructured = Boolean(
      supportPayload && (
        supportPayload.should_recommend === false ||
        supportPayload.recommendations.every((item) =>
          typeof item.priority_rank === "number" &&
          typeof item.timing_kind === "string" &&
          typeof item.timing_reason === "string"
        )
      ),
    );

    if (
      professionalSupportRecommendations.length > 0 ||
      supportAlreadyStructured
    ) {
      return;
    }

    setProfessionalSupportBootstrapId(transformation.id);
    void supabase.functions
      .invoke("classify-professional-support-v2", {
        body: { transformation_id: transformation.id },
      })
      .then(async ({ error: invokeError }) => {
        if (invokeError) throw invokeError;
        await refetch();
      })
      .catch((invokeError) => {
        console.error("[DashboardV2] professional support bootstrap failed", invokeError);
      });
  }, [
    isV3,
    plan,
    professionalSupportBootstrapId,
    professionalSupportRecommendations.length,
    refetch,
    transformation,
  ]);

  useEffect(() => {
    if (!transformation || !plan || !isV3) return;
    if (levelToolRecommendationsAvailable !== true) return;
    if (hasCurrentPlanLevelToolRecommendations) return;

    const stateMatchesCurrentPlan = Boolean(
      levelToolState &&
        levelToolState.plan_id === plan.id &&
        levelToolState.plan_version === plan.version &&
        levelToolState.plan_updated_at === plan.updated_at,
    );
    if (stateMatchesCurrentPlan && levelToolStateCoversCurrentLevel) return;

    const bootstrapKey = `${transformation.id}:${plan.id}:${plan.updated_at}`;
    if (levelToolBootstrapId === bootstrapKey) return;

    setLevelToolBootstrapId(bootstrapKey);
    void supabase.functions
      .invoke("classify-level-tools-v1", {
        body: { transformation_id: transformation.id },
      })
      .then(async ({ error: invokeError }) => {
        if (invokeError) throw invokeError;
        await refetch();
      })
      .catch((invokeError) => {
        console.error("[DashboardV2] level tool bootstrap failed", invokeError);
      });
  }, [
    isV3,
    hasCurrentPlanLevelToolRecommendations,
    levelToolBootstrapId,
    levelToolRecommendationsAvailable,
    levelToolStateCoversCurrentLevel,
    plan,
    refetch,
    levelToolState,
    transformation,
  ]);

  useEffect(() => {
    setPlanReviewInput("");
    setPlanReviewThread([]);
    setPlanReviewProposal(null);
    setPlanReviewBusy(false);
    setIsLevelCompletionModalOpen(false);
    setLevelCompletionBusy(false);
    setLevelCompletionError(null);
    setLevelCompletionSummary(null);
  }, [plan?.id, transformation?.id]);

  const isArchitectMode = mode === "architecte";
  const canAccessWhatsappFeatures =
    accessTier === "alliance" || accessTier === "architecte" || accessTier === "trial";
  const userInitials = (
    profile?.firstName?.trim()?.[0] ??
    user?.email?.trim()?.[0] ??
    "U"
  ).toUpperCase();
  const dashboardTabs: ReadonlyArray<{
    key: DashboardTab;
    icon: typeof MapIcon;
    label: string;
    activeColor: string;
    activeBg: string;
  }> = isOutOfPlanScope
    ? [
        {
          key: "lab",
          icon: Book,
          label: "Base de vie",
          activeColor: "text-emerald-600",
          activeBg: "bg-emerald-50",
        },
      ]
    : [
        {
          key: "plan",
          icon: MapIcon,
          label: "Plan",
          activeColor: "text-blue-600",
          activeBg: "bg-blue-50",
        },
        {
          key: "lab",
          icon: Hammer,
          label: "Ressources",
          activeColor: "text-emerald-600",
          activeBg: "bg-emerald-50",
        },
        {
          key: "inspiration",
          icon: Compass,
          label: "Boussole",
          activeColor: "text-violet-600",
          activeBg: "bg-violet-50",
        },
        {
          key: "reminders",
          icon: Bell,
          label: "Initiatives",
          activeColor: "text-amber-600",
          activeBg: "bg-amber-50",
        },
      ];

  const architectWeeks = Object.values(modules)
    .filter((m) => m.type === "week")
    .sort((a, b) => {
      const numA = parseInt(a.id.replace("week_", ""));
      const numB = parseInt(b.id.replace("week_", ""));
      return numA - numB;
    })
    .map((m) => {
      const weekNum = m.id.replace("week_", "");
      const cleanTitle = m.title.replace(/^Semaine \d+ : /, "");
      let status = "locked";
      const nextModuleIds = m.nextModuleIds ?? [];
      const isNextModuleStartedOrCompleted = nextModuleIds.some((nextId: string) => {
        const nextModule = modules[nextId];
        return !!nextModule?.state?.first_updated_at || nextModule?.state?.status === "completed";
      });

      if (m.state?.status === "completed") {
        status = isNextModuleStartedOrCompleted ? "completed" : "active";
      } else if (!m.isLocked && m.isAvailableNow) {
        if (m.id === "week_1" && isNextModuleStartedOrCompleted) status = "completed";
        else status = "active";
      }

      return { id: weekNum, title: cleanTitle, status };
    });

  if (authLoading || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du dashboard
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (hasIncompleteCycle) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.38)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Parcours en cours
          </p>
          <h1 className="mt-3 text-3xl font-bold text-stone-950">
            Ton cycle n'est pas encore terminé
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Il faut reprendre l'onboarding avant d'afficher un dashboard
            d'exécution complet.
          </p>
          <button
            type="button"
            onClick={handleStartOnboarding}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Reprendre l'onboarding
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.38)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-bold text-stone-950">
            Aucun plan actif
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Le cycle est peut-être en génération, ou aucun plan d'exécution
            n'a encore été activé.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartOnboarding}
              className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Lancer un parcours
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
            >
              <RefreshCcw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleItemAdapt = (itemId: string) => {
    navigate("/chat", {
      state: {
        source: "dashboard_v2_item_adjustment",
        plan_item_id: itemId,
      },
    });
  };

  const handlePlanReviewSubmit = async (overrideComment?: string) => {
    const rawComment = typeof overrideComment === "string"
      ? overrideComment
      : planReviewInput;
    const userComment = rawComment.trim();
    if (!userComment) return;

    if (!transformation || !plan || !planContentV3) {
      setDashboardActionError("Le plan actif n'est pas encore prêt pour une analyse de demande.");
      return;
    }

    setPlanReviewBusy(true);
    setPlanReviewBusyAction("submit");
    setDashboardActionError(null);

    try {
      const data = await invokeFunctionWithTimeout<ReviewPlanResponse>(
        "review-plan-v1",
        {
          review_id: planReviewProposal?.review_id ?? undefined,
          transformation_id: transformation.id,
          plan_id: plan.id,
          scope: "active_plan",
          user_comment: userComment,
          prior_thread: planReviewThread.map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
          current_level_context: currentLevel
            ? {
                phase_id: currentLevel.phase_id,
                phase_order: currentLevel.phase_order,
                title: currentLevel.title,
                objective: currentLevel.phase_objective,
              }
            : null,
          plan_content: planContentV3,
        },
        120_000,
      );
      if (!data) throw new Error("La proposition de révision est vide.");

      setPlanReviewThread(data.conversation_thread);
      setPlanReviewProposal({
        review_id: data.review_id,
        review_kind: data.review_kind,
        adjustment_scope: data.adjustment_scope,
        decision: data.decision,
        understanding: data.understanding,
        impact: data.impact,
        proposed_changes: data.proposed_changes,
        control_mode: data.control_mode,
        resistance_note: data.resistance_note,
        principle_reminder: data.principle_reminder,
        offer_complete_level: data.offer_complete_level,
        regeneration_feedback: data.regeneration_feedback,
        clarification_question: data.clarification_question,
        assistant_summary: data.assistant_summary,
        conversation_mode: data.conversation_mode,
        precision_count: data.precision_count,
        message_count: data.message_count,
        session_status: data.session_status,
        session_expires_at: data.session_expires_at,
      });
      setPlanReviewSessionStatus(data.session_status);
      setPlanReviewSessionExpiresAt(data.session_expires_at);
      if (!planReviewInitialComment) {
        setPlanReviewInitialComment(userComment);
      } else if (planReviewComposerMode === "precision") {
        setPlanReviewPrecisionComment(userComment);
      }
      setPlanReviewComposerMode(
        data.conversation_mode === "explanation_chat" || data.conversation_mode === "guardrail_chat"
          ? "chat"
          : "hidden",
      );
      setPlanReviewPreview(null);
      setPlanReviewPreviewPlanId(null);
      setPlanReviewInput("");
    } catch (reviewError) {
      console.error("[DashboardV2] active plan review failed", reviewError);
      setDashboardActionError(
        reviewError instanceof Error
          ? reviewError.message
          : "Impossible d'analyser cette demande de révision pour le moment.",
      );
    } finally {
      setPlanReviewBusy(false);
      setPlanReviewBusyAction(null);
    }
  };

  const handlePlanReviewRequestPrecision = () => {
    setDashboardActionError(null);
    setPlanReviewInput("");
    setPlanReviewComposerMode("precision");
  };

  const handlePlanReviewGeneratePreview = async () => {
    if (!transformation || !plan || !planReviewProposal || !planReviewInitialComment) return;

    const previewScope = getPreviewScope(planReviewProposal.conversation_mode);
    if (!previewScope) return;

    const effectiveStartDate = getBrowserLocalYmd();
    const feedback = buildPlanAdjustmentFeedback({
      proposal: planReviewProposal,
      initialComment: planReviewInitialComment,
      precisionComment: planReviewPrecisionComment,
    });

    setPlanReviewBusy(true);
    setPlanReviewBusyAction("preview");
    setDashboardActionError(null);

    try {
      const data = await invokeFunctionWithTimeout<GeneratePlanPreviewResponse>(
        "generate-plan-v2",
        {
          transformation_id: transformation.id,
          mode: "preview",
          feedback,
          force_regenerate: true,
          adjustment_context: {
            review_id: planReviewProposal.review_id,
            scope: previewScope,
            effective_start_date: effectiveStartDate,
            reason: planReviewProposal.understanding.slice(0, 280),
            assistant_message: planReviewProposal.assistant_summary,
          },
        },
      );
      if (!data?.plan_preview) throw new Error("Le preview du plan ajusté est vide.");

      const now = new Date().toISOString();
      const nextExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: updateError } = await supabase
        .from("user_plan_review_requests")
        .update({
          session_status: "preview_ready",
          preview_plan_id: data.plan_id,
          effective_start_date: effectiveStartDate,
          session_expires_at: nextExpiresAt,
          updated_at: now,
        })
        .eq("id", planReviewProposal.review_id);
      if (updateError) throw updateError;

      setPlanReviewPreview(data.plan_preview);
      setPlanReviewPreviewPlanId(data.plan_id);
      setPlanReviewSessionStatus("preview_ready");
      setPlanReviewSessionExpiresAt(nextExpiresAt);
      setPlanReviewProposal((current) => current
        ? {
          ...current,
          session_status: "preview_ready",
          session_expires_at: nextExpiresAt,
        }
        : current);
    } catch (previewError) {
      console.error("[DashboardV2] plan review preview failed", previewError);
      setDashboardActionError(
        previewError instanceof Error
          ? previewError.message
          : "Impossible de préparer le plan ajusté pour le moment.",
      );
    } finally {
      setPlanReviewBusy(false);
      setPlanReviewBusyAction(null);
    }
  };

  const handlePlanReviewConfirmPreview = async () => {
    if (!transformation || !plan || !planReviewProposal || !planReviewPreview) return;

    const previewScope = getPreviewScope(planReviewProposal.conversation_mode);
    if (!previewScope) return;

    setPlanReviewBusy(true);
    setPlanReviewBusyAction("confirm");
    setDashboardActionError(null);

    try {
      const effectiveStartDate =
        planReviewPreviewRevision?.effective_start_date ??
        getBrowserLocalYmd();
      const data = await invokeFunctionWithTimeout<GeneratePlanPreviewResponse>(
        "generate-plan-v2",
        {
          transformation_id: transformation.id,
          mode: "confirm",
          adjustment_context: {
            review_id: planReviewProposal.review_id,
            scope: previewScope,
            effective_start_date: effectiveStartDate,
            reason: planReviewProposal.understanding.slice(0, 280),
            assistant_message: planReviewProposal.assistant_summary,
          },
        },
      );

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("user_plan_review_requests")
        .update({
          session_status: "completed",
          completed_at: now,
          finalized_plan_id: data?.plan_id ?? null,
          updated_at: now,
        })
        .eq("id", planReviewProposal.review_id);
      if (updateError) throw updateError;

      clearPlanReviewSessionState();
      await refetch();
    } catch (confirmError) {
      console.error("[DashboardV2] plan review confirm failed", confirmError);
      setDashboardActionError(
        confirmError instanceof Error
          ? confirmError.message
          : "Impossible d'appliquer le plan ajusté pour le moment.",
      );
    } finally {
      setPlanReviewBusy(false);
      setPlanReviewBusyAction(null);
    }
  };

  const handlePlanReviewRestart = async () => {
    if (!planReviewProposal) return;

    const reviewId = planReviewProposal.review_id;
    const previewPlanId = planReviewPreviewPlanId;
    clearPlanReviewSessionState();

    if (previewPlanId) {
      await supabase
        .from("user_plans_v2")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", previewPlanId);
    }

    const { error: updateError } = await supabase
      .from("user_plan_review_requests")
      .update({
        session_status: "restarted",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId);

    if (updateError) {
      console.error("[DashboardV2] restart active plan review failed", updateError);
    }
  };

  const handlePlanReviewComplete = async () => {
    if (!planReviewProposal) {
      clearPlanReviewSessionState();
      return;
    }

    const reviewId = planReviewProposal.review_id;
    const previewPlanId = planReviewPreviewPlanId;
    clearPlanReviewSessionState();

    if (previewPlanId) {
      await supabase
        .from("user_plans_v2")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", previewPlanId);
    }

    const { error: updateError } = await supabase
      .from("user_plan_review_requests")
      .update({
        session_status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId);

    if (updateError) {
      console.error("[DashboardV2] complete active plan review failed", updateError);
    }
  };

  const planReviewPreviewRevision = parsePlanAdjustmentRevision(
    planReviewPreview?.metadata?.plan_adjustment_revision,
  );
  const planReviewShowComposer =
    !planReviewProposal ||
    planReviewComposerMode === "precision" ||
    (planReviewComposerMode === "chat" && planReviewThread.length < 10);
  const planReviewSubmitLabel = planReviewComposerMode === "precision"
    ? "Envoyer la précision"
    : planReviewComposerMode === "chat"
      ? "Envoyer"
      : "Analyser la demande";
  const planReviewHelperText = planReviewComposerMode === "precision"
    ? "Tu peux ajouter une seule précision avant de prévisualiser le plan ajusté."
    : planReviewComposerMode === "chat"
      ? "Tu peux poursuivre cet échange brièvement. La conversation se ferme automatiquement après 30 minutes d'inactivité."
      : null;
  const planReviewBusyLabel = planReviewBusyAction === "preview"
    ? "Sophia prépare le niveau ajusté…"
    : planReviewBusyAction === "confirm"
      ? "Sophia applique le niveau ajusté…"
      : planReviewBusyAction === "submit"
        ? "Sophia analyse ta demande…"
        : null;
  const planReviewActions: PlanRevisionPanelAction[] = (() => {
    if (!planReviewProposal) return [];

    const actions: PlanRevisionPanelAction[] = [];
    const previewScope = getPreviewScope(planReviewProposal.conversation_mode);
    const canAddPrecision = previewScope !== null &&
      planReviewProposal.precision_count === 0 &&
      !planReviewPreview;

    if (canAddPrecision) {
      actions.push({
        key: "precision",
        label: "Ajouter une précision",
        onClick: handlePlanReviewRequestPrecision,
        disabled: planReviewBusy,
        variant: "secondary",
      });
    }

    if (previewScope && !planReviewPreview) {
      actions.push({
        key: "preview",
        label: previewScope === "level" ? "Voir le niveau ajusté" : "Voir le plan ajusté",
        onClick: () => void handlePlanReviewGeneratePreview(),
        disabled: planReviewBusy,
        variant: "primary",
        isLoading: planReviewBusyAction === "preview",
        loadingLabel:
          previewScope === "level" ? "Chargement du niveau…" : "Chargement du plan…",
      });
    }

    if (planReviewProposal.offer_complete_level) {
      actions.push({
        key: "complete-level",
        label: "Valider ce niveau et passer au suivant",
        onClick: () => {
          setLevelCompletionError(null);
          setIsLevelCompletionModalOpen(true);
        },
        disabled: planReviewBusy,
        variant: "secondary",
      });
    }

    if (planReviewPreview) {
      actions.unshift({
        key: "confirm-preview",
        label: "Valider le plan ajusté",
        onClick: () => void handlePlanReviewConfirmPreview(),
        disabled: planReviewBusy,
        variant: "primary",
        isLoading: planReviewBusyAction === "confirm",
        loadingLabel: "Validation en cours…",
      });
    }

    actions.push({
      key: "restart",
      label: "Recommencer",
      onClick: () => void handlePlanReviewRestart(),
      disabled: planReviewBusy,
      variant: "ghost",
    });
    actions.push({
      key: "complete",
      label: "Terminer",
      onClick: () => void handlePlanReviewComplete(),
      disabled: planReviewBusy,
      variant: "danger",
    });

    return actions;
  })();
  const planReviewPreviewNode = planReviewPreview ? (
    <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            Prévisualisation
          </p>
          <h4 className="mt-2 text-lg font-semibold text-stone-950">
            {planReviewProposal?.conversation_mode === "level_adjustment"
              ? "Voici le niveau ajusté"
              : "Voici le plan ajusté"}
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
            {planReviewPreviewRevision
              ? `La modification s'applique à partir du ${planReviewPreviewRevision.effective_start_date}. Tout ce qui précède reste figé.`
              : "La modification s'applique à partir d'aujourd'hui. Tout ce qui précède reste figé."}
          </p>
        </div>
        {planReviewPreviewRevision ? (
          <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">
            {planReviewPreviewRevision.scope === "level" ? "Niveau ajusté" : "Plan ajusté"}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Cap actuel
        </p>
        <p className="mt-2 text-base font-semibold text-stone-950">
          {planReviewPreview.current_level_runtime?.title ?? planReviewPreview.title}
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {planReviewPreview.current_level_runtime?.phase_objective ?? planReviewPreview.progression_logic}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
          Marqueur de révision
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {planReviewPreviewRevision?.reason ?? planReviewProposal?.understanding}
        </p>
      </div>

      {Array.isArray(planReviewPreview.plan_blueprint?.levels) &&
      planReviewPreview.plan_blueprint.levels.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Suite visible
          </p>
          <div className="mt-3 space-y-2">
            {planReviewPreview.plan_blueprint.levels.slice(0, 4).map((level) => (
              <div key={level.phase_id} className="text-sm text-stone-700">
                Niveau {getDisplayPhaseOrder(level.level_order)} · {level.title}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  const handleLevelCompletionSubmit = async (answers: Record<string, string>) => {
    if (!transformation || !plan || !currentLevel) return;

    setLevelCompletionBusy(true);
    setLevelCompletionError(null);
    setDashboardActionError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke<CompleteLevelResponse>(
        "complete-level-v1",
        {
          body: {
            transformation_id: transformation.id,
            plan_id: plan.id,
            answers,
          },
        },
      );

      if (fnError) throw fnError;
      if (!data) throw new Error("La transition de niveau est vide.");

      setLevelCompletionSummary(data.summary);
      setIsLevelCompletionModalOpen(false);
      await refetch();
    } catch (actionError) {
      console.error("[DashboardV2] level completion failed", actionError);
      setLevelCompletionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de valider ce niveau pour le moment.",
      );
    } finally {
      setLevelCompletionBusy(false);
    }
  };

  const handleCloseClosureModal = () => {
    if (!transformation) {
      setIsClosureModalOpen(false);
      return;
    }
    setClosureModalDismissedForId(transformation.id);
    setIsClosureModalOpen(false);
  };

  const handleCompleteTransformation = async (payload: {
    lineGreenEntry: { action: string; why: string };
    lineRedEntry: { action: string; why: string };
    feedback: {
      helpfulness_rating: number;
      improvement_reasons: string[];
      improvement_detail: string | null;
      most_helpful_area: string;
    };
  }) => {
    if (!transformation || !closureDraft) return;

    setCompletingTransformation(true);
    setDashboardActionError(null);

    try {
      const { error } = await supabase.functions.invoke("complete-transformation-v1", {
        body: {
          transformation_id: transformation.id,
          line_green_entry: payload.lineGreenEntry,
          line_red_entry: payload.lineRedEntry,
          feedback: payload.feedback,
          declics_draft: closureDraft,
          declics_user: closureDraft,
        },
      });
      if (error) throw error;

      setIsClosureModalOpen(false);
      setClosureModalDismissedForId(null);
      await refetch();
      setSelectedScopeId("out_of_plan");
      setActiveTab("lab");
    } catch (actionError) {
      console.error("[DashboardV2] transformation completion failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de clôturer cette transformation pour le moment.",
      );
    } finally {
      setCompletingTransformation(false);
    }
  };

  const handleOpenAdditionalPlanFlow = () => {
    if (!cycle) return;
    setDashboardActionError(null);
    if (!canAddTransformation) {
      setIsTransformationLimitModalOpen(true);
      return;
    }
    startSession();
    navigate("/transformations/new");
  };

  const handleOpenMultiPartTransitionGate = () => {
    if (!hasSequencedNextTransformation && !hasSimpleNextTransformation && !hasCycleRelaunchAction) {
      return;
    }
    setDashboardActionError(null);
    setIsMultiPartTransitionModalOpen(true);
  };

  const handoffToNextTransformationSelection = () => {
    startSession();
    navigate("/transformations/new");
  };

  const releaseCurrentTransformationForNextStep = async (
    nextStatus: "completed" | "abandoned",
  ) => {
    if (!transformation || !cycle) return;

    const now = new Date().toISOString();
    const planUpdate =
      nextStatus === "completed"
        ? supabase
          .from("user_plans_v2")
          .update({
            status: "completed",
            completed_at: now,
            updated_at: now,
          })
          .eq("transformation_id", transformation.id)
          .in("status", ["active", "paused"])
        : supabase
          .from("user_plans_v2")
          .update({
            status: "archived",
            archived_at: now,
            updated_at: now,
          })
          .eq("transformation_id", transformation.id)
          .in("status", ["draft", "active", "paused"]);

    const [{ error: planError }, { error: transformationError }, cycleUpdateResult] =
      await Promise.all([
        planUpdate,
        supabase
          .from("user_transformations")
          .update({
            status: nextStatus,
            ...(nextStatus === "completed" ? { completed_at: now } : {}),
            updated_at: now,
          })
          .eq("id", transformation.id)
          .in("status", ["draft", "ready", "pending", "active"]),
        cycle.active_transformation_id === transformation.id
          ? supabase
            .from("user_cycles")
            .update({
              active_transformation_id: null,
              updated_at: now,
            })
            .eq("id", cycle.id)
          : Promise.resolve({ error: null }),
      ]);

    if (planError) throw planError;
    if (transformationError) throw transformationError;
    if (cycleUpdateResult.error) throw cycleUpdateResult.error;

    const reminderKinds =
      nextStatus === "completed"
        ? ["plan_free"]
        : ["plan_free", "potion_follow_up"];
    const reminderStatus =
      nextStatus === "completed"
        ? "completed"
        : "archived";
    const reminderEndReason =
      nextStatus === "completed"
        ? "plan_completed"
        : "plan_stopped";

    const { data: reminderRows, error: reminderError } = await supabase
      .from("user_recurring_reminders")
      .update({
        status: reminderStatus,
        ended_reason: reminderEndReason,
        deactivated_at: now,
        updated_at: now,
      } as any)
      .eq("user_id", user.id)
      .eq("transformation_id", transformation.id)
      .in("initiative_kind", reminderKinds)
      .in("status", ["active", "inactive"])
      .select("id");

    if (reminderError) throw reminderError;

    const reminderIds = ((reminderRows as Array<{ id: string }> | null) ?? []).map((row) => row.id);
    if (reminderIds.length > 0) {
      const { error: cancelCheckinsError } = await supabase
        .from("scheduled_checkins")
        .update({
          status: "cancelled",
          processed_at: now,
        } as any)
        .in("recurring_reminder_id", reminderIds)
        .in("status", ["pending", "retrying", "awaiting_user"]);

      if (cancelCheckinsError) throw cancelCheckinsError;
    }
  };

  const handleEndSimpleTransformation = async () => {
    if (!transformation || !cycle) return;

    if (isTransformationReadyForClosure) {
      setIsClosureModalOpen(true);
      return;
    }

    const confirmed = window.confirm(
      "Mettre fin à cette transformation maintenant ? Le plan en cours sera arrêté et cette transformation sortira du parcours actif.",
    );
    if (!confirmed) return;

    setMultiPartTransitionBusy(true);
    setDashboardActionError(null);

    try {
      await releaseCurrentTransformationForNextStep("abandoned");

      setSelectedScopeId("out_of_plan");
      setActiveTab("lab");
      await refetch();
    } catch (actionError) {
      console.error("[DashboardV2] simple transformation end failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de mettre fin à cette transformation pour le moment.",
      );
    } finally {
      setMultiPartTransitionBusy(false);
    }
  };

  const handleAdjustCurrentPlanForTransition = async (reason: string | null) => {
    if (!planContentV3) return;

    const targetSummary = transitionTargetLabel && transitionTargetValue
      ? `${transitionTargetLabel}: ${transitionTargetValue}`
      : transitionTargetValue || transitionTargetLabel || "l'objectif de cette 1re partie";

    const transitionComment = hasSequencedNextTransformation
      ? transitionCheckpointReached
        ? [
            `Je suis à la fin de cette première partie mais je n'ai pas encore atteint ${targetSummary}.`,
            reason ? `Pourquoi je voulais quand même passer à la suite : ${reason}` : null,
            "Aide-moi à ajuster la fin du plan pour atteindre ce cap avant de débloquer la 2e partie.",
          ].filter(Boolean).join("\n\n")
        : [
            "Je ne suis pas encore au point de passage vers la 2e partie.",
            `Cap à atteindre avant la suite : ${targetSummary}.`,
            "Aide-moi à ajuster le plan actuel pour rendre cette première partie atteignable et réaliste avant de débloquer la suite.",
          ].join("\n\n")
      : [
          `Je n'ai pas encore atteint l'objectif global de cette transformation : ${targetSummary}.`,
          reason ? `Ce qui me fait envisager la suite maintenant : ${reason}` : null,
          "Aide-moi à ajuster le plan actuel avant de passer à la prochaine transformation.",
        ].filter(Boolean).join("\n\n");

    setActiveTab("plan");
    setIsMultiPartTransitionModalOpen(false);
    setPlanReviewInput(transitionComment);
    await handlePlanReviewSubmit(transitionComment);
  };

  const handleContinueToNextPart = async () => {
    if (!cycle || !nextSequencedTransformation || !transitionQuestionnaireSchema) return;

    setTransitionQuestionnaireError(null);
    setDashboardActionError(null);

    try {
      setIsMultiPartTransitionModalOpen(false);
      window.setTimeout(() => {
        setIsTransitionQuestionnaireModalOpen(true);
      }, 0);
    } catch (actionError) {
      console.error("[DashboardV2] next part transition failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de préparer la 2e partie pour le moment.",
      );
    }
  };

  const handleCloseTransitionQuestionnaire = () => {
    if (transitionQuestionnaireBusy) return;
    setTransitionQuestionnaireError(null);
    setIsTransitionQuestionnaireModalOpen(false);
  };

  const handleSubmitTransitionQuestionnaire = async (
    answers: Record<string, string | string[]>,
  ) => {
    if (!cycle || !transformation || !transitionQuestionnaireSchema) {
      return;
    }

    setTransitionQuestionnaireBusy(true);
    setTransitionQuestionnaireError(null);
    setDashboardActionError(null);

    try {
      if (hasSimpleNextTransformation) {
        const { data: transformationRow, error: transformationLoadError } = await supabase
          .from("user_transformations")
          .select("handoff_payload")
          .eq("id", transformation.id)
          .maybeSingle();
        if (transformationLoadError) throw transformationLoadError;

        const handoffPayload = mergeTransitionDebriefIntoHandoffPayload({
          handoffPayload:
            (transformationRow as { handoff_payload?: Record<string, unknown> | null } | null)
              ?.handoff_payload ?? null,
          answers,
          questionnaireSchema: transitionQuestionnaireSchema,
          previousTransformationId: null,
          source: "simple_transition_debrief",
        });

        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("user_transformations")
          .update({
            handoff_payload: handoffPayload,
            updated_at: now,
          })
          .eq("id", transformation.id);
        if (updateError) throw updateError;

        await releaseCurrentTransformationForNextStep("completed");
        setIsTransitionQuestionnaireModalOpen(false);
        await refetch();
        handoffToNextTransformationSelection();
        return;
      }

      if (!nextSequencedTransformation) {
        throw new Error("La transformation suivante est introuvable.");
      }

      const { data: transformationRow, error: transformationLoadError } = await supabase
        .from("user_transformations")
        .select("handoff_payload")
        .eq("id", nextSequencedTransformation.id)
        .maybeSingle();
      if (transformationLoadError) throw transformationLoadError;

      const handoffPayload = mergeTransitionDebriefIntoHandoffPayload({
        handoffPayload:
          (transformationRow as { handoff_payload?: Record<string, unknown> | null } | null)
            ?.handoff_payload ?? null,
        answers,
        questionnaireSchema: transitionQuestionnaireSchema,
        previousTransformationId: transformation.id,
        source: "multi_part_transition_debrief",
      });

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("user_transformations")
        .update({
          questionnaire_schema: transitionQuestionnaireSchema,
          questionnaire_answers: answers,
          handoff_payload: handoffPayload,
          updated_at: now,
        })
        .eq("id", nextSequencedTransformation.id);
      if (updateError) throw updateError;

      const { data, error } = await supabase.functions.invoke("generate-plan-v2", {
        body: {
          transformation_id: nextSequencedTransformation.id,
          mode: "preview",
          pace: cycle.requested_pace ?? undefined,
        },
      });
      if (error) throw error;

      const response = data as GeneratePlanResponse | null;
      if (!response?.plan_preview) {
        throw new Error("Le preview du plan est manquant.");
      }

      await releaseCurrentTransformationForNextStep("completed");

      const baseDraft = createEmptyOnboardingV2Draft();
      const visibleTransformationPreviews = visibleTransformations.map((item) =>
        item.id === nextSequencedTransformation.id
          ? toTransformationPreview({
            ...item,
            questionnaire_schema: transitionQuestionnaireSchema,
            questionnaire_answers: answers,
          })
          : toTransformationPreview(item)
      );

      persistOnboardingV2DraftLocally({
        ...baseDraft,
        entry_mode: "add_transformation",
        preserved_active_transformation_id: transformation.id,
        cycle_id: cycle.id,
        cycle_status: "ready_for_plan",
        stage: "plan_review",
        raw_intake_text: cycle.raw_intake_text,
        transformations: visibleTransformationPreviews,
        active_transformation_id: nextSequencedTransformation.id,
        questionnaire_schema: transitionQuestionnaireSchema,
        questionnaire_answers: answers,
        plan_review: {
          plan_preview: response.plan_preview,
          feedback: "",
        },
        roadmap_transition: null,
      });

      setIsTransitionQuestionnaireModalOpen(false);
      startSession();
      navigate("/onboarding-v2");
    } catch (actionError) {
      console.error("[DashboardV2] transition questionnaire submit failed", actionError);
      setTransitionQuestionnaireError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de préparer la 2e partie pour le moment.",
      );
    } finally {
      setTransitionQuestionnaireBusy(false);
    }
  };

  const handleContinueToNextSimpleTransformation = async () => {
    if (!hasSimpleNextTransformation || !transitionQuestionnaireSchema) return;

    setDashboardActionError(null);
    setTransitionQuestionnaireError(null);

    try {
      setIsMultiPartTransitionModalOpen(false);
      window.setTimeout(() => {
        setIsTransitionQuestionnaireModalOpen(true);
      }, 0);
    } catch (actionError) {
      console.error("[DashboardV2] simple transformation handoff failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de passer à la prochaine transformation pour le moment.",
      );
    }
  };

  const handleReactivateTransformation = async (transformationId: string) => {
    if (!cycle) return;

    const targetTransformation = transformations.find((item) => item.id === transformationId);
    if (!targetTransformation) return;

    setReactivatingTransformationId(transformationId);
    setReactivationError(null);
    setDashboardActionError(null);

    try {
      const { data: existingPlans, error: existingPlanError } = await supabase
        .from("user_plans_v2")
        .select("id,status,activated_at,completed_at,archived_at,updated_at")
        .eq("cycle_id", cycle.id)
        .eq("transformation_id", targetTransformation.id)
        .in("status", ["draft", "generated", "active", "paused", "completed", "archived"]);
      if (existingPlanError) throw existingPlanError;

      const existingPlan = ((existingPlans ?? []) as Array<{
        id: string;
        status: keyof typeof REACTIVATABLE_PLAN_STATUS_PRIORITY;
        activated_at: string | null;
        completed_at: string | null;
        archived_at: string | null;
        updated_at: string;
      }>).sort((left, right) => {
        const leftPriority = REACTIVATABLE_PLAN_STATUS_PRIORITY[left.status] ?? 99;
        const rightPriority = REACTIVATABLE_PLAN_STATUS_PRIORITY[right.status] ?? 99;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;

        const leftDate =
          left.completed_at ??
          left.activated_at ??
          left.archived_at ??
          left.updated_at;
        const rightDate =
          right.completed_at ??
          right.activated_at ??
          right.archived_at ??
          right.updated_at;
        return rightDate.localeCompare(leftDate);
      })[0] ?? null;

      if (!existingPlan?.id) {
        throw new Error("Aucun plan existant n'a été trouvé pour cette transformation.");
      }

      const now = new Date().toISOString();
      const [{ error: cycleError }, { error: transformationError }, { error: planError }] =
        await Promise.all([
          supabase
            .from("user_cycles")
            .update({
              status: "active",
              active_transformation_id: targetTransformation.id,
              updated_at: now,
            })
            .eq("id", cycle.id),
          supabase
            .from("user_transformations")
            .update({
              status: "active",
              activated_at: now,
              completed_at: null,
              updated_at: now,
            })
            .eq("id", targetTransformation.id),
          supabase
            .from("user_plans_v2")
            .update({
              status: "active",
              activated_at: now,
              completed_at: null,
              archived_at: null,
              updated_at: now,
            })
            .eq("id", existingPlan.id),
        ]);

      if (cycleError) throw cycleError;
      if (transformationError) throw transformationError;
      if (planError) throw planError;

      persistReactivatedTransformationId(targetTransformation.id);
      setPhase1BypassTransformationId(targetTransformation.id);
      setActiveTab("plan");
      setSelectedScopeId(targetTransformation.id);
    } catch (actionError) {
      console.error("[DashboardV2] transformation reactivation failed", actionError);
      setReactivationError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de relancer cette transformation pour le moment.",
      );
    } finally {
      setReactivatingTransformationId(null);
    }
  };

  const handleContinueToNewCycle = async () => {
    if (!transformation || !cycle) return;

    setMultiPartTransitionBusy(true);
    setDashboardActionError(null);

    try {
      await releaseCurrentTransformationForNextStep("completed");

      const now = new Date().toISOString();
      const { error: cycleError } = await supabase
        .from("user_cycles")
        .update({
          status: "completed",
          updated_at: now,
        })
        .eq("id", cycle.id);
      if (cycleError) throw cycleError;

      setIsMultiPartTransitionModalOpen(false);
      handleStartOnboarding();
    } catch (actionError) {
      console.error("[DashboardV2] new cycle launch after completion failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de lancer un nouveau parcours pour le moment.",
      );
    } finally {
      setMultiPartTransitionBusy(false);
    }
  };

  const handleLetGoAndContinueToNextTransformation = async (reason: string) => {
    if (!hasSimpleNextTransformation) return;

    setMultiPartTransitionBusy(true);
    setDashboardActionError(null);

    try {
      console.info("[DashboardV2] simple transformation abandoned before next handoff", {
        transformation_id: transformation?.id ?? null,
        reason,
      });
      await releaseCurrentTransformationForNextStep("abandoned");
      setIsMultiPartTransitionModalOpen(false);
      await refetch();
      handoffToNextTransformationSelection();
    } catch (actionError) {
      console.error("[DashboardV2] let go and continue failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible d'abandonner cette transformation pour le moment.",
      );
    } finally {
      setMultiPartTransitionBusy(false);
    }
  };

  const handleLetGoAndStartNewCycle = async (reason: string) => {
    if (!transformation || !cycle) return;

    setMultiPartTransitionBusy(true);
    setDashboardActionError(null);

    try {
      console.info("[DashboardV2] cycle abandoned before restart", {
        transformation_id: transformation.id,
        reason,
      });

      await releaseCurrentTransformationForNextStep("abandoned");

      const now = new Date().toISOString();
      const { error: cycleError } = await supabase
        .from("user_cycles")
        .update({
          status: "abandoned",
          updated_at: now,
        })
        .eq("id", cycle.id);
      if (cycleError) throw cycleError;

      setIsMultiPartTransitionModalOpen(false);
      handleStartOnboarding();
    } catch (actionError) {
      console.error("[DashboardV2] cycle restart after let-go failed", actionError);
      setDashboardActionError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible de relancer un nouveau parcours pour le moment.",
      );
    } finally {
      setMultiPartTransitionBusy(false);
    }
  };

  function handleStartOnboarding() {
    startSession();
    navigate("/onboarding-v2");
  }

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-500 pb-24 ${
        isArchitectMode
          ? "bg-emerald-950 text-emerald-50"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <header
        className={`${
          isArchitectMode
            ? "bg-emerald-900/50 border-emerald-800"
            : "bg-white border-gray-100"
        } px-3 md:px-6 py-3 md:py-4 sticky top-0 z-50 shadow-sm border-b backdrop-blur-md transition-colors duration-500`}
      >
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 md:gap-4">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => navigate("/dashboard")}
              >
                <img
                  src="/apple-touch-icon.png"
                  alt="Sophia"
                  className="w-10 h-10 rounded-full drop-shadow-sm"
                />
              </div>

              <div className="flex flex-row bg-gray-100/10 p-1 rounded-full border border-gray-200/20 gap-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("action")}
                  className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                    !isArchitectMode
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-emerald-300 hover:text-white"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span className="hidden min-[360px]:inline">Action</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("architecte")}
                  className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                    isArchitectMode
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/50"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Compass className="w-3 h-3" />
                  <span className="hidden min-[360px]:inline">Architecte</span>
                </button>
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setProfileInitialTab("general");
                setIsProfileOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setProfileInitialTab("general");
                  setIsProfileOpen(true);
                }
              }}
              className="w-8 h-8 min-[310px]:w-10 min-[310px]:h-10 rounded-full bg-gray-200/20 flex items-center justify-center font-bold text-xs min-[310px]:text-base border-2 border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform shrink-0 z-30"
            >
              {isArchitectMode ? "🏛️" : userInitials}
            </div>
          </div>
        </header>

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 w-full flex-1 flex flex-col">
        {error ? (
          <div className="mb-4 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {logic.actionError ? (
          <div className="mb-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            {logic.actionError}
          </div>
        ) : null}

        {isArchitectMode ? (
          /* ══════════════════════════════════════════════════════════════
             MODE ARCHITECTE
             ══════════════════════════════════════════════════════════════ */
          <div className="animate-fade-in flex-1 flex flex-col">
            {/* Architect sub-tabs */}
            <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex w-full justify-start md:justify-center">
                <div className="flex bg-emerald-950/50 p-1.5 rounded-xl border border-emerald-800/50 shadow-lg min-w-max">
                  {(
                    [
                      { key: "atelier", icon: Sparkles, label: "Identité" },
                      { key: "wishlist", icon: MapIcon, label: "Envies" },
                      { key: "stories", icon: Book, label: "Histoires" },
                      { key: "reflections", icon: Lightbulb, label: "Réflexions" },
                      { key: "quotes", icon: Quote, label: "Citations" },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setArchitectTab(tab.key)}
                        className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
                          architectTab === tab.key
                            ? "bg-emerald-600 text-white shadow-md scale-105"
                            : "text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-900/30"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Architect tab content */}
            {architectTab === "atelier" && (
              <div className="flex-1 bg-emerald-950/20 rounded-3xl border border-emerald-800/30 overflow-hidden flex flex-col min-h-[600px] p-6 md:p-12">
                <div className="max-w-4xl mx-auto w-full">
                  <div className="text-center mb-12">
                    <h1 className="text-3xl md:text-5xl font-serif font-bold text-emerald-100 mb-4">
                      Identité
                    </h1>
                    <p className="text-sm md:text-base text-emerald-400 max-w-2xl mx-auto italic mb-6">
                      "On ne s'élève pas au niveau de ses objectifs. On tombe au niveau de ses systèmes."
                    </p>

                    <button
                      type="button"
                      onClick={() => setIsAtelierUsageOpen((value) => !value)}
                      className="text-xs font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center justify-center gap-2 mx-auto transition-colors"
                    >
                      {isAtelierUsageOpen
                        ? "Masquer les explications"
                        : "Comment utiliser cet espace"}
                      {isAtelierUsageOpen
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {isAtelierUsageOpen ? (
                      <div className="mt-6 p-6 bg-emerald-900/20 border border-emerald-800/50 rounded-2xl text-left text-emerald-100/80 text-sm leading-relaxed max-w-2xl mx-auto animate-fade-in">
                        <p className="mb-3">
                          Cet espace, c&apos;est l&apos;endroit où tu reviens à toi. Pas à ce que tu dois
                          produire, pas à l&apos;image qu&apos;il faut tenir, mais à ce qui te construit en
                          profondeur. Pendant 3 mois, tu traverses 37 modules d&apos;identité pour mieux
                          comprendre qui tu es, ce que tu portes, ce que tu veux vraiment incarner,
                          et la façon dont tu veux avancer dans ta vie.
                        </p>
                        <p>
                          Ici, on touche à ton rapport à toi, à ta vision, à tes blessures, à tes
                          élans, à tes standards, à ta solidité intérieure. Ce que ça change, ce
                          n&apos;est pas juste de la clarté sur le papier: c&apos;est une sensation plus
                          nette d&apos;alignement, plus de stabilité, plus de confiance, et des choix qui
                          commencent enfin à te ressembler. Et quand ce socle est posé, la Forge
                          s&apos;ouvre avec 148 modules pour aller encore plus loin, affiner ton
                          identité, renforcer ta structure et donner plus de puissance à la personne
                          que tu deviens.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Hammer className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">
                      Phase 1 : La construction du temple
                    </h2>
                  </div>

                  <div className="relative h-[600px] rounded-3xl bg-gradient-to-b from-emerald-950/30 via-emerald-900/05 to-emerald-950/30 shadow-inner overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />
                    <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide p-4 relative z-0">
                      <div className="space-y-4 py-20">
                        {architectWeeks.map((week) => (
                          <WeekCard key={week.id} week={week} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-emerald-800/50 pb-20">
                    <div className="flex items-center gap-3 mb-8 justify-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">
                        Phase 2 : Amélioration du Temple
                      </h2>
                    </div>

                    {(() => {
                      const forgeModule = modules["forge_access"];
                      const now = new Date();

                      const isForgeUnlocked =
                        forgeModule?.state &&
                        (!forgeModule.state.available_at ||
                          new Date(forgeModule.state.available_at) <= now);

                      const getUnlockText = (
                        mod: typeof forgeModule | undefined,
                      ) => {
                        if (!mod?.state) return "Débloqué après Semaine 12";
                        if (mod.state.available_at) {
                          const unlockDate = new Date(mod.state.available_at);
                          if (unlockDate > now) {
                            const diffDays = Math.ceil(
                              Math.abs(unlockDate.getTime() - now.getTime()) /
                                (1000 * 60 * 60 * 24),
                            );
                            return `Disponible dans ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
                          }
                        }
                        return "Débloqué après Semaine 12";
                      };

                      return (
                        <div className="grid gap-6">
                          <div
                            onClick={() => {
                              if (!isForgeUnlocked) return;
                              if (!hasArchitecteAccess(subscription))
                                return navigate("/upgrade");
                              navigate("/architecte/evolution");
                            }}
                            className={`bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-800 p-6 md:p-8 rounded-2xl relative overflow-hidden transition-transform group ${
                              isForgeUnlocked
                                ? "cursor-pointer hover:scale-[1.02]"
                                : "cursor-not-allowed opacity-70"
                            }`}
                          >
                            <div className="hidden min-[350px]:block absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <Layout className="w-12 h-12 md:w-24 md:h-24" />
                            </div>
                            <h3 className="text-white font-bold text-lg md:text-xl mb-2">
                              La Forge
                            </h3>
                            <p className="text-emerald-400 text-xs md:text-sm mb-6">
                              Patch Notes · v2.1, v2.2...
                            </p>

                            {isForgeUnlocked ? (
                              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-950 bg-amber-400 py-2 px-4 rounded-lg w-fit shadow-lg shadow-amber-900/50">
                                <Hammer className="w-3 h-3" /> Accès Ouvert
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                                <Lock className="w-3 h-3" />{" "}
                                {getUnlockText(forgeModule)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {architectTab === "wishlist" && (
              <div className="flex-1 bg-emerald-950/20 rounded-3xl border border-emerald-800/30 overflow-hidden flex flex-col min-h-[600px]">
                <WishlistTab />
              </div>
            )}

            {architectTab === "stories" && (
              <div className="flex-1 bg-emerald-950/20 rounded-3xl border border-emerald-800/30 overflow-hidden flex flex-col min-h-[600px]">
                <StoriesTab />
              </div>
            )}

            {architectTab === "reflections" && (
              <div className="flex-1 bg-emerald-950/20 rounded-3xl border border-emerald-800/30 overflow-hidden flex flex-col min-h-[600px]">
                <ReflectionsTab />
              </div>
            )}

            {architectTab === "quotes" && (
              <div className="flex-1 bg-emerald-950/20 rounded-3xl border border-emerald-800/30 overflow-hidden flex flex-col min-h-[600px]">
                <QuotesTab />
              </div>
            )}
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════════
            MODE ACTION
             ══════════════════════════════════════════════════════════════ */
          <div className="animate-fade-in flex-1 flex flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
              {/* ── SIDEBAR (Niveau 2 : Scope & Préférences) ── */}
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm flex flex-col gap-1">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Mes Parcours
                    </div>
                    {hasSequencedNextTransformation ? (
                      <p className="mt-2 text-sm leading-5 text-amber-800">
                        La 2e partie de ce parcours se débloque depuis la page du plan.
                      </p>
                    ) : null}
                  </div>
                  
                  {scopeTransformations.map((item) => {
                    const isActiveScope =
                      !isOutOfPlanScope && transformation?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedScopeId(item.id)}
                        className={`text-left px-4 py-3 rounded-[16px] text-sm font-semibold transition-colors ${
                          isActiveScope
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : "text-stone-600 hover:bg-stone-50 border border-transparent"
                        }`}
                      >
                        {item.title || `Transformation ${item.priority_order}`}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setSelectedScopeId("out_of_plan")}
                    className={`text-left px-4 py-3 rounded-[16px] text-sm font-semibold transition-colors mt-1 ${
                      isOutOfPlanScope
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "text-stone-600 hover:bg-stone-50 border border-transparent"
                    }`}
                  >
                    Base de vie
                  </button>

                  <div className="h-px bg-stone-100 my-3" />

                  <button
                    type="button"
                    onClick={handleOpenAdditionalPlanFlow}
                    className="flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors border border-transparent"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter une transformation
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("preferences")}
                    className={`flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-semibold transition-colors border ${
                      activeTab === "preferences"
                        ? "bg-stone-900 text-white border-stone-900"
                        : "text-stone-600 hover:bg-stone-50 border-transparent"
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    Préférences
                  </button>
                </div>

                {completedTransformations.length > 0 ? (
                  <div className="rounded-[24px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,1))] p-4 shadow-sm">
                    <div className="flex items-center gap-2 px-1">
                      <RefreshCcw className="h-4 w-4 text-amber-700" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Réactiver
                      </p>
                    </div>
                    <p className="mt-2 px-1 text-sm leading-5 text-stone-700">
                      Rouvre une transformation terminée directement en review de plan.
                    </p>

                    {reactivationError ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                        {reactivationError}
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      {completedTransformations.map((item) => {
                        const isBusy = reactivatingTransformationId === item.id;
                        const completedLabel = formatCompletedTransformationDate(
                          item.completed_at ?? item.updated_at,
                        );

                        return (
                          <div
                            key={item.id}
                            className="rounded-[18px] border border-amber-100 bg-white/80 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-stone-900">
                                  {item.title || `Transformation ${item.priority_order}`}
                                </p>
                                {completedLabel ? (
                                  <p className="mt-1 text-xs text-stone-500">
                                    Terminée le {completedLabel}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleReactivateTransformation(item.id)}
                                disabled={Boolean(reactivatingTransformationId)}
                                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                {isBusy ? "Ouverture..." : "Réactiver"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── MAIN CONTENT (Niveau 3 : Outils & Contenu) ── */}
              <div className="lg:col-span-9 space-y-5">
                {/* ── TAB NAVIGATION ─────────────────────────────────── */}
                <div className="flex w-full justify-start md:justify-center overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200/50 min-w-max w-full">
                    {dashboardTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key)}
                          className={`flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex-1 ${
                            isActive
                              ? `bg-white text-slate-900 shadow-sm border border-slate-200/50`
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${isActive ? tab.activeColor : ""}`}
                          />
                          <span className="whitespace-nowrap">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── TAB CONTENT ─────────────────────────────────────── */}
                {shouldBlockForPhase1 ? (
                  <div className="animate-fade-in">
                    <Phase1KickoffFlow
                      key={transformation?.id ?? "phase1-kickoff"}
                      phase1={phase1.phase1}
                      transformationTitle={
                        activePlanContent?.title ||
                        transformation?.title ||
                        "ton plan"
                      }
                      preparingStart={phase1.preparingStart}
                      deepWhyPreparing={phase1.preparingDeepWhy}
                      storyPreparing={phase1.preparingStory}
                      savingDeepWhy={phase1.savingDeepWhy}
                      onPrepareStart={() => void phase1.prepareStart({ force: true })}
                      onPrepareStory={() => void phase1.prepareStory()}
                      onRevealStory={() => void phase1.markStoryViewed()}
                      onSaveDeepWhyAnswers={(answers) =>
                        void phase1.saveDeepWhyAnswers(answers)}
                    />
                  </div>
                ) : activeTab === "plan" ? (
                  <div className="animate-fade-in space-y-5">
                    {!transformation || !activePlanContent ? (
                      <section className="rounded-[30px] border border-dashed border-stone-300 bg-white px-5 py-8 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                          Plan de transformation
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold text-stone-950">
                          Aucun plan actif pour ce scope
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                          Lance un plan supplémentaire depuis le bouton en haut, ou repasse sur une
                          transformation déjà active pour retrouver son exécution.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleOpenAdditionalPlanFlow}
                            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
                          >
                            <Plus className="h-4 w-4" />
                            Ajouter une transformation
                          </button>
                        </div>
                      </section>
                    ) : (
                      <>
                        {isTransformationReadyForClosure && transformation && closureDraft ? (
                          <section className="rounded-[30px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                                  Rituel de passage
                                </p>
                                <h3 className="mt-3 text-2xl font-semibold text-stone-950">
                                  Cette transformation est prête à être clôturée
                                </h3>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-700">
                                  Tous les éléments du plan sont terminés. Il ne reste plus qu'à
                                  valider ta Ligne Rouge et tes Déclics avant de faire entrer cette
                                  étape dans ta Base de vie.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsClosureModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                              >
                                Clôturer la transformation
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            </div>
                          </section>
                        ) : null}

                        {levelCompletionSummary ? (
                          <section className="rounded-[30px] border border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
                              Suite du parcours
                            </p>
                            <p className="mt-3 text-sm leading-6 text-stone-700">
                              {levelCompletionSummary}
                            </p>
                          </section>
                        ) : null}

                        <StrategyHeader
                          title={
                            activePlanContent.title ||
                            transformation.title ||
                            "Transformation active"
                          }
                          summary={
                            activePlanContent.user_summary ||
                            transformation.user_summary
                          }
                          situationContext={planContentV3?.situation_context ?? null}
                          mechanismAnalysis={planContentV3?.mechanism_analysis ?? null}
                          keyUnderstanding={planContentV3?.key_understanding ?? null}
                          progressionLogic={planContentV3?.progression_logic ?? null}
                          primaryMetric={planContentV3?.primary_metric ?? null}
                          successDefinition={
                            activePlanContent.strategy.success_definition
                          }
                          journeyContext={activePlanContent.journey_context}
                          professionalSupport={null}
                        />

                        <ProfessionalSupportTrackerCard
                          recommendations={professionalSupportRecommendations}
                          currentLevelOrder={currentLevel?.phase_order ?? null}
                          phase1Completed={phase1Completed}
                          onChanged={refetch}
                        />

                        {isV3 ? (
                          <>
                            <PhaseProgression
                              phases={logic.phases}
                              scheduleAnchor={scheduleAnchor}
                              phase1Node={
                                <Phase1FoundationCard
                                  phase1={phase1.phase1}
                                  onOpenInspiration={() => setActiveTab("inspiration")}
                                />
                              }
                              activePhaseFooterNode={
                                <>
                                  <PlanRevisionPanel
                                    value={planReviewInput}
                                    thread={planReviewThread}
                                    isBusy={planReviewBusy}
                                    errorMessage={dashboardActionError}
                                    currentLevelOrder={currentLevel?.phase_order ?? null}
                                    currentLevelTitle={currentLevel?.title ?? null}
                                    showComposer={planReviewShowComposer}
                                    submitLabel={planReviewSubmitLabel}
                                    helperText={planReviewHelperText}
                                    busyLabel={planReviewBusyLabel}
                                    previewNode={planReviewPreviewNode}
                                    actions={planReviewActions}
                                    onChange={setPlanReviewInput}
                                    onSubmit={handlePlanReviewSubmit}
                                  />
                                </>
                              }
                              levelToolRecommendationsByPhaseId={levelToolRecommendationsByPhaseId}
                              onLevelToolRecommendationChanged={refetch}
                              primaryMetricLabel={planContentV3?.primary_metric?.label ?? null}
                              unlockStateByItemId={logic.unlockStateByItemId}
                              busyItemId={logic.mutatingItemId}
                              onComplete={logic.completeItem}
                              onActivate={logic.activateItem}
                              onPrepareCards={logic.prepareItemCards}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                              onBlocker={logic.markItemBlocked}
                              onDeactivate={logic.deactivateItem}
                              onRemove={logic.removeItem}
                              onAdapt={(item) => handleItemAdapt(item.id)}
                              onLogHeartbeat={() =>
                                navigate("/chat", {
                                  state: {
                                    source: "dashboard_v2_heartbeat_checkin",
                                  },
                                })
                              }
                              onCompleteLevel={() => {
                                setLevelCompletionError(null);
                                setIsLevelCompletionModalOpen(true);
                              }}
                              completeLevelBusy={levelCompletionBusy}
                              onCompletionAction={
                                hasSequencedNextTransformation
                                  ? handleOpenMultiPartTransitionGate
                                  : hasSimpleNextTransformation
                                    ? handleOpenMultiPartTransitionGate
                                  : hasCycleRelaunchAction
                                    ? handleOpenMultiPartTransitionGate
                                  : canShowTransformationEndAction
                                    ? handleEndSimpleTransformation
                                  : undefined
                              }
                              completionActionLabel={
                                hasSequencedNextTransformation
                                  ? "Passer à la 2ème transformation"
                                  : hasSimpleNextTransformation
                                    ? "Passer à la prochaine transformation"
                                  : hasCycleRelaunchAction
                                    ? "Passer à la prochaine transformation"
                                  : canShowTransformationEndAction
                                    ? "Mettre fin à la transformation"
                                  : null
                              }
                              completionActionHint={
                                hasSequencedNextTransformation
                                  ? transitionCheckpointReached
                                    ? "Avant d'ouvrir la suite, confirme que l'objectif de cette 1re partie est réellement atteint."
                                    : "La 2e partie restera verrouillée tant que cette 1re partie n'est pas vraiment bouclée."
                                  : hasSimpleNextTransformation
                                    ? "Avant d'ouvrir la transformation suivante, confirme que l'objectif global de ta transformation actuelle est vraiment atteint."
                                  : hasCycleRelaunchAction
                                    ? "Avant de relancer un nouveau parcours, confirme que l'objectif global de cette transformation est vraiment atteint."
                                  : canShowTransformationEndAction
                                    ? isTransformationReadyForClosure
                                      ? "La transformation est terminée. Il ne reste plus qu'à valider la clôture pour la faire entrer dans ta Base de vie."
                                      : "Si tu veux arrêter ce chantier ici, tu peux mettre fin à cette transformation depuis ce bloc."
                                  : null
                              }
                              journeyContext={activePlanContent.journey_context}
                              planAdjustmentRevision={parsePlanAdjustmentRevision(
                                planContentV3?.metadata?.plan_adjustment_revision,
                              )}
                            />
                            {allPhasesCompleted ? (
                              <PlanRevisionPanel
                                value={planReviewInput}
                                thread={planReviewThread}
                                isBusy={planReviewBusy}
                                errorMessage={dashboardActionError}
                                currentLevelOrder={null}
                                currentLevelTitle={null}
                                showComposer={planReviewShowComposer}
                                submitLabel={planReviewSubmitLabel}
                                helperText={planReviewHelperText}
                                busyLabel={planReviewBusyLabel}
                                previewNode={planReviewPreviewNode}
                                actions={planReviewActions}
                                onChange={setPlanReviewInput}
                                onSubmit={handlePlanReviewSubmit}
                              />
                            ) : null}
                          </>
                        ) : (
                          <>
                            <DimensionSection
                              dimension="clarifications"
                              title="Clarifications"
                              subtitle="Les repères utiles pour mieux lire la route, comprendre le vrai blocage et choisir la bonne direction."
                              icon={Shield}
                              groups={
                                logic.dimensionGroups.get("clarifications") ??
                                EMPTY_DIMENSION_GROUP
                              }
                              unlockStateByItemId={logic.unlockStateByItemId}
                              busyItemId={logic.mutatingItemId}
                              onComplete={logic.completeItem}
                              onActivate={logic.activateItem}
                              onPrepareCards={logic.prepareItemCards}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                              onBlocker={logic.markItemBlocked}
                              onDeactivate={logic.deactivateItem}
                              onRemove={logic.removeItem}
                              onAdapt={(item) => handleItemAdapt(item.id)}
                            />

                            <DimensionSection
                              dimension="missions"
                              title="Missions"
                              subtitle="Les actions ponctuelles qui font avancer concrètement cette transformation."
                              icon={Hammer}
                              groups={
                                logic.dimensionGroups.get("missions") ??
                                EMPTY_DIMENSION_GROUP
                              }
                              unlockStateByItemId={logic.unlockStateByItemId}
                              busyItemId={logic.mutatingItemId}
                              onComplete={logic.completeItem}
                              onActivate={logic.activateItem}
                              onPrepareCards={logic.prepareItemCards}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                              onBlocker={logic.markItemBlocked}
                              onDeactivate={logic.deactivateItem}
                              onRemove={logic.removeItem}
                              onAdapt={(item) => handleItemAdapt(item.id)}
                            />

                            <DimensionSection
                              dimension="habits"
                              title="Habitudes"
                              subtitle="Les répétitions qui installent la transformation dans le quotidien."
                              icon={Repeat}
                              groups={
                                logic.dimensionGroups.get("habits") ??
                                EMPTY_DIMENSION_GROUP
                              }
                              unlockStateByItemId={logic.unlockStateByItemId}
                              busyItemId={logic.mutatingItemId}
                              onComplete={logic.completeItem}
                              onActivate={logic.activateItem}
                              onPrepareCards={logic.prepareItemCards}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                              onBlocker={logic.markItemBlocked}
                              onDeactivate={logic.deactivateItem}
                              onRemove={logic.removeItem}
                              onAdapt={(item) => handleItemAdapt(item.id)}
                            />

                            <UnlockPreview
                              preview={logic.nextUnlock}
                            />
                          </>
                        )}

                        <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                                Suite du parcours
                              </p>
                              <h3 className="mt-3 text-2xl font-semibold text-stone-950">
                                Choisir la bonne prochaine étape
                              </h3>
                              <p className="mt-2 text-sm leading-6 text-stone-600">
                                {hasSequencedNextTransformation
                                  ? "Ici, la suite n'est pas un choix libre: l'étape 2 se débloque seulement quand l'étape 1 a vraiment atteint son cap."
                                  : hasSimpleNextTransformation
                                    ? "Ici, tu peux passer à la prochaine transformation. Pour ajouter une nouvelle transformation en parallèle (max 2), passe par le menu."
                                    : hasCycleRelaunchAction
                                      ? "Ici, tu peux clôturer cette transformation et relancer un nouveau parcours si tu veux ouvrir un nouveau cycle."
                                    : "Aucune transformation suivante n'est prête ici pour le moment. Si tu veux en ajouter une, passe par le menu."}
                              </p>
                            </div>
                            {hasSequencedNextTransformation && nextSequencedTransformation ? (
                              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                  Étape 2 verrouillée
                                </p>
                                <p className="mt-2 font-semibold">
                                  {nextSequencedTransformationTitle}
                                </p>
                                {transitionGlobalObjective ? (
                                  <p className="mt-1 text-blue-900/80">
                                    {hasSequencedNextTransformation
                                      ? `Objectif de la 2ème transformation : ${transitionGlobalObjective}`
                                      : `Objectif global : ${transitionGlobalObjective}`}
                                  </p>
                                ) : null}
                                {nextSequencedTransformation.user_summary ? (
                                  <p className="mt-2 text-blue-900/80">
                                    {nextSequencedTransformation.user_summary}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {dashboardActionError ? (
                            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                              {dashboardActionError}
                            </div>
                          ) : null}

                          <div className="mt-5 flex flex-wrap gap-3">
                            {hasSequencedNextTransformation ? (
                              <button
                                type="button"
                                onClick={handleOpenMultiPartTransitionGate}
                                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
                              >
                                Passer à la 2ème transformation
                              </button>
                            ) : hasSimpleNextTransformation || hasCycleRelaunchAction ? (
                              <button
                                type="button"
                                onClick={handleOpenMultiPartTransitionGate}
                                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
                              >
                                Passer à la prochaine transformation
                              </button>
                            ) : null}
                            {canShowTransformationEndAction ? (
                              <button
                                type="button"
                                onClick={() => void handleEndSimpleTransformation()}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                              >
                                Mettre fin à cette transformation
                              </button>
                            ) : null}
                          </div>
                        </section>
                      </>
                    )}
                  </div>
                ) : activeTab === "lab" ? (
                  <div className="animate-fade-in">
                    {isOutOfPlanScope ? (
                      <BaseDeVieSection
                        cycleId={cycle.id}
                        userId={user.id}
                        transformations={transformations}
                        isLocked={!canAccessWhatsappFeatures}
                        onUnlockRequest={() => navigate("/upgrade")}
                      />
                    ) : isV3 ? (
                      <div className="space-y-5">
                        <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setIsLabUsageOpen((value) => !value)}
                            className="flex w-full items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-widest text-emerald-700 transition-colors hover:text-emerald-900"
                          >
                            {isLabUsageOpen ? "Masquer les explications" : "Comment utiliser cet espace"}
                            {isLabUsageOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>

                          {isLabUsageOpen ? (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-5 py-4 text-left text-sm leading-6 text-stone-700 animate-fade-in">
                              <p className="mb-3">
                                Cet espace sert a te donner des appuis concrets selon le moment que tu traverses. L'idee n'est pas
                                de tout theoriser, mais d'avoir la bonne aide au bon moment.
                              </p>
                              <p className="mb-3">
                                Les cartes de defense servent quand quelque chose surgit et que tu as besoin d'une reponse simple,
                                claire et applicable sur le moment. Les cartes d'attaque servent plus en amont, pour preparer le
                                terrain, reduire la friction et rendre le bon geste plus naturel.
                              </p>
                              <p>
                                Les potions, elles, servent a traverser un etat interieur quand il prend trop de place:
                                confusion, decrochage, peur, pression, culpabilite ou manque de douceur. Tu peux donc utiliser
                                cet espace soit pour reagir, soit pour te preparer, soit pour te recentrer.
                              </p>
                              <p className="mt-3">
                                Les cartes liees au plan sont optionnelles: tu peux lancer leur creation depuis une mission ou une
                                habitude quand tu sens que ca t'aiderait. Ensuite, elles se rangent directement dans les categories
                                Defense et Attaque, par niveau, sans t'empecher de creer aussi tes propres cartes en dehors de ces actions.
                              </p>
                            </div>
                          ) : null}
                        </section>

                        {defense.loading ? (
                          <DefenseCardSkeleton />
                        ) : (
                          <DefenseCard
                            content={defense.card?.content ?? { impulses: [] }}
                            onQuickLog={defense.logWin}
                            onExport={() => {
                              if (defense.card) {
                                void exportDefenseCardAsPdf(
                                  defense.card.content,
                                  defense.totalWins,
                                );
                              }
                            }}
                            onAddCard={(input) => defense.addCard(input)}
                            onPrepareAddCard={(need) => defense.prepareAddCard(need)}
                            onGenerateAddCardDraft={(need, answers) =>
                              defense.generateAddCardDraft(need, answers)}
                            onRemoveCard={(input) => defense.removeCard(input)}
                            onUpdateCard={(input) => defense.updateCard(input)}
                            busy={defense.loggingWin}
                            addingCard={defense.addingCard}
                            preparingCardDraft={defense.preparingCardDraft}
                            generatingCardDraft={defense.generatingCardDraft}
                            removingCard={defense.removingCard}
                            regenerating={defense.generating}
                            updatingCard={defense.updatingCard}
                            focusPlanDefenseTriggerKey={resourceFocusTarget?.defenseTriggerKey ?? null}
                            focusPlanDefenseToken={resourceFocusTarget?.token ?? null}
                            planCardsNode={
                              <PlanActionCardsByLevel
                                kind="defense"
                                planContentV3={planContentV3}
                                planItems={planItems}
                                embedded
                                onCardsChanged={refetch}
                                focusDefenseTriggerKey={resourceFocusTarget?.defenseTriggerKey ?? null}
                                focusDefenseToken={resourceFocusTarget?.token ?? null}
                              />
                            }
                            freeSectionTitle="Cartes de defense libres"
                            freeSectionSubtitle="Pour des actions qui peuvent t'aider, mais qui ne sont pas dans le plan."
                          />
                        )}

                        <LabCardsPanel
                          loading={labCards.loading}
                          generatingAttack={labCards.generatingAttack}
                          generatingTechniqueKey={labCards.generatingTechniqueKey}
                          analyzingTechniqueKey={labCards.analyzingTechniqueKey}
                          attackCard={labCards.attackCard?.content ?? null}
                          onGenerateAttack={() => void labCards.generateAttack()}
                          onRegenerateAttack={() => void labCards.regenerateAttack()}
                          onGenerateTechnique={(techniqueKey, answers, options) =>
                            labCards.generateTechnique(techniqueKey, answers, options)}
                          onAnalyzeTechniqueAdjustment={(techniqueKey, reasonKey, notes) =>
                            labCards.analyzeTechniqueAdjustment(techniqueKey, reasonKey, notes)}
                          potionsLoading={potions.loading}
                          potionDefinitions={potions.definitions}
                          potionLatestSessions={potions.latestSessionByType}
                          potionUsageCount={potions.usageCountByType}
                          activatingPotionType={potions.activatingPotionType}
                          schedulingPotionSessionId={potions.schedulingSessionId}
                          onActivatePotion={potions.activatePotion}
                          onReactivatePotion={potions.reactivatePotion}
                          onSchedulePotionFollowUp={potions.schedulePotionFollowUp}
                          planAttackCardsNode={
                            <PlanActionCardsByLevel
                              kind="attack"
                              planContentV3={planContentV3}
                              planItems={planItems}
                              embedded
                              onCardsChanged={refetch}
                            />
                          }
                        />
                      </div>
                    ) : (
                      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-8 text-center shadow-sm">
                        <Compass className="mx-auto h-10 w-10 text-stone-300" />
                        <p className="mt-4 text-sm text-stone-500">
                          L'espace Ressources est disponible avec les plans V3.
                        </p>
                      </section>
                    )}
                  </div>
                ) : activeTab === "inspiration" ? (
                  <div className="animate-fade-in">
                    {isOutOfPlanScope ? (
                      <BaseDeVieSection
                        cycleId={cycle.id}
                        userId={user.id}
                        transformations={transformations}
                        isLocked={!canAccessWhatsappFeatures}
                        onUnlockRequest={() => navigate("/upgrade")}
                      />
                    ) : isV3 && planContentV3 && transformation ? (
                      <AtelierInspirations
                        key={transformation.id}
                        inspirationNarrative={
                          planContentV3.inspiration_narrative
                        }
                        transformationTitle={
                          planContentV3.title || transformation.title
                        }
                        phase1Story={phase1.phase1?.story ?? null}
                        phase1DeepWhy={phase1.phase1?.deep_why ?? null}
                        storyPreparing={phase1.preparingStory}
                        deepWhyPreparing={phase1.preparingDeepWhy}
                        savingDeepWhy={phase1.savingDeepWhy}
                        onPrepareStory={(detailsAnswer) => void phase1.prepareStory(detailsAnswer)}
                        onPrepareDeepWhy={() => void phase1.prepareDeepWhy()}
                        onSaveDeepWhyAnswers={(answers) =>
                          void phase1.saveDeepWhyAnswers(answers)}
                        unlockedPrinciples={
                          transformation.unlocked_principles ?? {
                            kaizen: true,
                          }
                        }
                      />
                    ) : (
                      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-8 text-center shadow-sm">
                        <Sparkles className="mx-auto h-10 w-10 text-stone-300" />
                        <p className="mt-4 text-sm text-stone-500">
                          L'espace Boussole est disponible avec les plans V3.
                        </p>
                      </section>
                    )}
                  </div>
                ) : activeTab === "reminders" ? (
                  <div className="animate-fade-in">
                    <RemindersSection
                      userId={user.id}
                      cycleId={cycle?.id ?? null}
                      transformationId={transformation?.id ?? null}
                      transformationTitle={transformation?.title ?? null}
                      scopeKind="transformation"
                      isLocked={!canAccessWhatsappFeatures}
                      onUnlockRequest={() => navigate("/upgrade")}
                      onMoveToBaseDeVie={() => {
                        setSelectedScopeId("out_of_plan");
                        setActiveTab("lab");
                      }}
                    />
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <PreferencesSection
                      isLocked={!canAccessWhatsappFeatures}
                      onUnlockRequest={() => navigate("/upgrade")}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <UserProfile
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        mode={mode}
        initialTab={profileInitialTab}
      />

      {isTransformationLimitModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-amber-200 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
              Limite atteinte
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-950">
              C'est limite a 2 transformations
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Si tu veux absolument en lancer une autre, il faut d'abord mettre en pause ou
              supprimer une transformation active.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTransformationLimitModalOpen(false)}
                className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MultiPartTransitionGateModal
        key={`${isMultiPartTransitionModalOpen ? "open" : "closed"}:${transitionCheckpointReached ? "checkpoint" : "locked"}`}
        mode={hasSequencedNextTransformation ? "multi_part" : "simple"}
        isOpen={Boolean(
          isMultiPartTransitionModalOpen &&
            (hasSequencedNextTransformation || hasSimpleNextTransformation || hasCycleRelaunchAction),
        )}
        canEvaluateTarget={hasSequencedNextTransformation ? transitionCheckpointReached : true}
        busy={multiPartTransitionBusy || planReviewBusy}
        currentTransformationTitle={
          transformation?.title ??
          (transformation ? `Transformation ${transformation.priority_order}` : "Transformation active")
        }
        nextTransformationTitle={
          hasSequencedNextTransformation
            ? nextSequencedTransformationTitle
            : nextRecommendedTransformationTitle
        }
        targetLabel={transitionTargetLabel}
        targetValue={transitionTargetValue}
        globalObjective={transitionGlobalObjective}
        onClose={() => {
          if (multiPartTransitionBusy || planReviewBusy) return;
          setIsMultiPartTransitionModalOpen(false);
        }}
        onConfirmReached={
          hasSequencedNextTransformation
            ? handleContinueToNextPart
            : hasSimpleNextTransformation
              ? handleContinueToNextSimpleTransformation
              : handleContinueToNewCycle
        }
        onAdjustPlan={handleAdjustCurrentPlanForTransition}
        onLetGoAndContinue={
          hasSimpleNextTransformation
            ? handleLetGoAndContinueToNextTransformation
            : hasCycleRelaunchAction
              ? handleLetGoAndStartNewCycle
              : undefined
        }
      />

      <MultiPartTransitionQuestionnaireModal
        isOpen={Boolean(
          isTransitionQuestionnaireModalOpen &&
            transformation &&
            transitionQuestionnaireSchema,
        )}
        currentTransformationTitle={
          transformation?.title ??
          (transformation ? `Transformation ${transformation.priority_order}` : "Transformation active")
        }
        nextTransformationTitle={
          hasSequencedNextTransformation
            ? nextSequencedTransformationTitle
            : nextRecommendedTransformationTitle
        }
        schema={transitionQuestionnaireSchema}
        initialAnswers={
          hasSequencedNextTransformation
            ? nextSequencedTransformation?.questionnaire_answers ?? null
            : null
        }
        busy={transitionQuestionnaireBusy}
        error={transitionQuestionnaireError}
        onBackToPlan={handleCloseTransitionQuestionnaire}
        onClose={handleCloseTransitionQuestionnaire}
        onSubmit={handleSubmitTransitionQuestionnaire}
      />

      <TransformationClosureModal
        isOpen={Boolean(
          isClosureModalOpen &&
            transformation &&
            closureDraft &&
            isTransformationReadyForClosure,
        )}
        mode="create"
        transformationTitle={
          transformation?.title ??
          (transformation ? `Transformation ${transformation.priority_order}` : "")
        }
        initialLineGreenEntry={currentBaseDeViePayload?.line_green_entry ?? null}
        initialLineRedEntry={currentBaseDeViePayload?.line_red_entry ?? null}
        initialFeedback={currentBaseDeViePayload?.closure_feedback ?? null}
        busy={completingTransformation}
        onClose={handleCloseClosureModal}
        onSubmit={handleCompleteTransformation}
      />

      <LevelCompletionModal
        isOpen={Boolean(
          isLevelCompletionModalOpen &&
            currentLevel &&
            isCurrentLevelReviewUnlocked,
        )}
        levelOrder={currentLevel?.phase_order ?? null}
        levelTitle={currentLevel?.title ?? ""}
        questions={currentLevelReviewQuestions}
        busy={levelCompletionBusy}
        error={levelCompletionError}
        onClose={() => {
          if (levelCompletionBusy) return;
          setIsLevelCompletionModalOpen(false);
        }}
        onSubmit={handleLevelCompletionSubmit}
      />
    </div>
  );
}
