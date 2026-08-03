import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight,
  Bell,
  Book,
  ChevronDown,
  ChevronUp,
  Compass,
  Hammer,
  Loader2,
  RefreshCcw,
  Repeat,
  Settings,
  Shield,
  Sparkles,
  Map as MapIcon,
  Menu,
  Plus,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";

import PlanSavedModal from "../components/dashboard-v2/PlanSavedModal";
import { PlanActionCardsByLevel } from "../components/dashboard-v2/ActionCardsResourcePanel";
import { DefenseCard, DefenseCardSkeleton } from "../components/dashboard-v2/DefenseCard";
import { DimensionSection } from "../components/dashboard-v2/DimensionSection";
import { PhaseProgression } from "../components/dashboard-v2/PhaseProgression";
import { PreferencesSection } from "../components/dashboard-v2/PreferencesSection";
import { StrategyHeader } from "../components/dashboard-v2/StrategyHeader";

// W2.B — les cartes d'attaque sont extraites vers `keel/components` (anglais, R1).
// `RemindersSection` reste dans l'arbre legacy tant que sa copie est française (voir son en-tête).
import { RemindersSection } from "../components/dashboard-v2/RemindersSection";
import { AttackCards } from "../keel/components/AttackCards";

import { useDashboardV2Data, type DashboardV2PlanItemRuntime } from "../hooks/useDashboardV2Data";
import {
  useDashboardV2Logic,
  type DashboardV2DimensionGroup,
} from "../hooks/useDashboardV2Logic";
import { useDefenseCard } from "../hooks/useDefenseCard";
import { useLabCards } from "../hooks/useLabCards";
import { isVisibleTransformationStatus } from "../lib/dashboardTransformations";
import { exportDefenseCardAsPdf } from "../lib/exportDefenseCard";
import type { LabScopeInput } from "../lib/labScope";
import { parsePlanScheduleAnchor } from "../lib/planSchedule";
import { supabase } from "../lib/supabase";
import UserProfile from "../components/UserProfile";

const EMPTY_DIMENSION_GROUP: DashboardV2DimensionGroup = {
  all: [],
  active: [],
  pending: [],
  maintenance: [],
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
type DashboardScopeId = string | "out_of_plan";
type DashboardLocationState = {
  planSavedConfirmation?: boolean;
};

const REACTIVATABLE_PLAN_STATUS_PRIORITY = {
  active: 0,
  paused: 1,
  completed: 2,
  archived: 3,
  generated: 4,
  draft: 5,
} as const;

type ResourceFocusTarget = {
  defenseTriggerKey: string;
  token: number;
};

type PlanAdjustmentRevision = {
  effective_start_date: string;
  reason: string;
  scope: "level" | "plan";
  user_change_summary?: string | null;
  assistant_message?: string | null;
};

function formatCompletedTransformationDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(parsed);
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
  const userChangeSummary = typeof candidate.user_change_summary === "string"
    ? candidate.user_change_summary.trim()
    : "";
  const scope = candidate.scope === "level" ? "level" : candidate.scope === "plan" ? "plan" : null;

  if (!effectiveStartDate || !reason || !scope) return null;

  return {
    effective_start_date: effectiveStartDate,
    reason,
    scope,
    user_change_summary: userChangeSummary || null,
    assistant_message: typeof candidate.assistant_message === "string"
      ? candidate.assistant_message.trim()
      : null,
  };
}

export default function DashboardV2() {
  const navigate = useNavigate();
  const location = useLocation();
  const { startSession } = useOnboardingAmbientAudio();
  const { accessTier } = useAuth();
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
    levelToolRecommendations,
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
  const logic = useDashboardV2Logic({
    cycle,
    transformation,
    plan,
    planItems,
    planContentV3,
    refetch,
  });
  const currentPlanLevelToolRecommendations = useMemo(
    () =>
      plan
        ? levelToolRecommendations.filter((recommendation) => recommendation.plan_id === plan.id)
        : [],
    [levelToolRecommendations, plan],
  );
  // W2.B : `levelToolState` / `hasCurrentPlanLevelToolRecommendations` /
  // `levelToolStateCoversCurrentLevel` ne servaient qu'à décider s'il fallait
  // (re)lancer `classify-level-tools-v1`. La classification est supprimée,
  // ces dérivés aussi. Les recommandations DÉJÀ en base restent affichées.
  const scheduleAnchor = useMemo(
    () => parsePlanScheduleAnchor(planContentV3?.metadata?.schedule_anchor),
    [planContentV3],
  );

  // W2.B : le mode « architecte » (37 modules d'identité, Forge, ateliers) est supprimé.
  // Le mode reste dans la signature pour `UserProfile`, mais il vaut toujours "action".
  const mode = "action" as const;
  const [isLabUsageOpen, setIsLabUsageOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("plan");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<
    "general" | "subscription" | "settings"
  >("general");
  const [dashboardActionError, setDashboardActionError] = useState<string | null>(null);
  const [resourceFocusTarget, setResourceFocusTarget] = useState<ResourceFocusTarget | null>(null);
  const [isTransformationLimitModalOpen, setIsTransformationLimitModalOpen] = useState(false);
  const [reactivatingTransformationId, setReactivatingTransformationId] = useState<string | null>(null);
  const [reactivationError, setReactivationError] = useState<string | null>(null);
  const [isPlanSavedModalOpen, setIsPlanSavedModalOpen] = useState(false);

  useEffect(() => {
    const locationState = location.state as DashboardLocationState | null;
    if (!locationState?.planSavedConfirmation) return;

    setActiveTab("plan");
    setIsPlanSavedModalOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  const isOutOfPlanScope = selectedScopeId === "out_of_plan";
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
  const currentTransformationCompletionReached = Boolean(
    allPhasesCompleted || transformation?.status === "completed",
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
  const shouldWarnBeforeNextTransformation = Boolean(
    (hasSequencedNextTransformation || hasSimpleNextTransformation || hasCycleRelaunchAction) &&
      !currentTransformationCompletionReached,
  );
  const nextSequencedTransformation = hasSequencedNextTransformation
    ? recommendedAdditionalTransformation
    : null;
  const nextSequencedTransformationTitle =
    nextSequencedTransformation?.title ||
    (nextSequencedTransformation
      ? `Transformation ${nextSequencedTransformation.priority_order}`
      : null);
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
  // The objective resolution above can fall back to `user_summary` when the next
  // transformation has no dedicated objective yet. In that case the summary and
  // the objective are the same text, so we must not render the summary twice.
  const shouldShowNextTransformationSummary = Boolean(
    nextSequencedTransformation?.user_summary?.trim() &&
      nextSequencedTransformation.user_summary.trim() !==
        (transitionGlobalObjective?.trim() ?? null),
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
    if (isOutOfPlanScope && activeTab !== "lab") {
      setActiveTab("lab");
    }
  }, [activeTab, isOutOfPlanScope]);

  // W2.B : les deux amorçages automatiques qui appelaient
  // `classify-professional-support-v2` et `classify-level-tools-v1` sont
  // RETIRÉS — les deux edge functions sont supprimées avec le lot edge
  // functions (couture n°1, déjà neutralisée côté `generate-plan-v2`).
  // Ils partaient tout seuls au montage du dashboard V3 : les garder aurait
  // produit un 404 silencieux à chaque chargement, plus un `refetch()` inutile.
  // Ce qui est DÉJÀ en base (`professionalSupportRecommendations`,
  // `levelToolRecommendationsByPhaseId`) reste lu et affiché : on arrête d'en
  // fabriquer de nouveaux, on n'efface pas l'existant.

  const isArchitectMode = false;
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
    mobileLabel: string;
    activeColor: string;
    activeBg: string;
  }> = isOutOfPlanScope
    ? [
        {
          key: "lab",
          icon: Book,
          label: "Base de vie",
          mobileLabel: "Base",
          activeColor: "text-[#d1ded4]",
          activeBg: "bg-[#eef5ee]",
        },
      ]
    : [
        {
          key: "plan",
          icon: MapIcon,
          label: "Plan",
          mobileLabel: "Plan",
          activeColor: "text-[#d1ded4]",
          activeBg: "bg-[#eef5ee]",
        },
        {
          key: "lab",
          icon: Hammer,
          label: "Ressources",
          mobileLabel: "Ressources",
          activeColor: "text-[#d1ded4]",
          activeBg: "bg-[#eef5ee]",
        },
        {
          key: "inspiration",
          icon: Compass,
          label: "Inspirations",
          mobileLabel: "Inspi",
          activeColor: "text-[#d1ded4]",
          activeBg: "bg-[#eef5ee]",
        },
        {
          key: "reminders",
          icon: Bell,
          label: "Initiatives",
          mobileLabel: "Suivi",
          activeColor: "text-[#d1ded4]",
          activeBg: "bg-amber-50",
        },
      ];


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
            {error ? "Dashboard indisponible" : "Aucun plan actif"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {error ||
              "Le cycle est peut-être en génération, ou aucun plan d'exécution n'a encore été activé."}
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
      } as never)
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
        } as never)
        .in("recurring_reminder_id", reminderIds)
        .in("status", ["pending", "retrying", "awaiting_user"]);

      if (cancelCheckinsError) throw cancelCheckinsError;
    }
  };

  const handleEndSimpleTransformation = async () => {
    if (!transformation || !cycle) return;

    const confirmed = window.confirm(
      "Mettre fin à cette transformation maintenant ? Le plan en cours sera arrêté et cette transformation sortira du parcours actif.",
    );
    if (!confirmed) return;

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

  function handleStartOnboarding() {
    startSession();
    navigate("/onboarding-v2");
  }

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-500 pb-24 ${
        isArchitectMode
          ? "bg-emerald-950 text-emerald-50"
          : "sophia-action-skin bg-[radial-gradient(circle_at_12%_0%,rgba(0,45,33,0.12),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(0,45,33,0.09),transparent_34%),linear-gradient(180deg,#fbf7ef_0%,#f3f8f1_52%,#eef8f4_100%)] text-[#17211d]"
      }`}
    >
      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <header
        className={`${
          isArchitectMode
            ? "bg-emerald-900/50 border-emerald-800"
            : "bg-white/86 border-[#d7e7dc]"
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
              className={`w-8 h-8 min-[310px]:w-10 min-[310px]:h-10 rounded-full flex items-center justify-center font-bold text-xs min-[310px]:text-base border-2 shadow-sm cursor-pointer hover:scale-105 transition-transform shrink-0 z-30 ${
                isArchitectMode
                  ? "bg-gray-200/20 border-white/10"
                  : "bg-white text-[#002d21] border-[#b8d8cc]"
              }`}
            >
              {isArchitectMode ? "🏛️" : userInitials}
            </div>
          </div>
        </header>

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main className="sophia-mobile-type max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10 w-full flex-1 flex flex-col">
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

        {isArchitectMode ? null : (
          /* ══════════════════════════════════════════════════════════════
            MODE ACTION
             ══════════════════════════════════════════════════════════════ */
          <div className="animate-fade-in flex-1 flex flex-col">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-6 lg:grid-cols-12 lg:gap-10">
              {/* ── SIDEBAR (Niveau 2 : Scope & Préférences) ── */}
              <div className="hidden min-w-0 lg:col-span-3 lg:block lg:space-y-4">
                <div className="hidden rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm lg:flex lg:flex-col lg:gap-1">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Mes Parcours
                    </div>
                    {hasSequencedNextTransformation ? (
                      <p className="mt-2 text-sm leading-5 text-amber-800">
                        La 2ème transformation de ce parcours se débloque depuis la page du plan.
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
                            ? "bg-[#e9f8f0] text-[#002d21] border border-[#b8e9cf]"
                            : "text-stone-600 hover:bg-emerald-50 border border-transparent"
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
                        ? "bg-[#e9f8f0] text-[#002d21] border border-[#b8e9cf]"
                        : "text-stone-600 hover:bg-emerald-50 border border-transparent"
                    }`}
                  >
                    Base de vie
                  </button>

                  <div className="h-px bg-stone-100 my-3" />

                  <button
                    type="button"
                    onClick={handleOpenAdditionalPlanFlow}
                    className="flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-semibold text-[#002d21] hover:bg-[#e9f8f0] transition-colors border border-transparent"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter une transformation
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("preferences")}
                    className={`flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-semibold transition-colors border ${
                      activeTab === "preferences"
                        ? "bg-[#002d21] text-white border-[#002d21]"
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
              <div className="min-w-0 max-w-full lg:col-span-9 space-y-2.5 sm:space-y-5">
                {/* ── TAB NAVIGATION ─────────────────────────────────── */}
                <div className="relative flex max-w-full items-stretch gap-1 pb-1">
                  <details className="group relative z-20 shrink-0 lg:hidden">
                    <summary className="flex h-full min-h-[46px] w-[clamp(2.5rem,6vw,2.75rem)] cursor-pointer list-none items-center justify-center rounded-2xl border border-[#b8d8cc] bg-white/90 text-[#52635b] shadow-sm outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-[#b8d8cc] focus-visible:ring-offset-2">
                      <Menu className="h-4 w-4" />
                      <span className="sr-only">Choisir un parcours</span>
                    </summary>

                    <div className="absolute left-0 top-full mt-1 w-[230px] rounded-2xl border border-stone-200 bg-white p-1.5 shadow-lg">
                      {scopeTransformations.map((item) => {
                        const isActiveScope =
                          !isOutOfPlanScope && transformation?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={(event) => {
                              setSelectedScopeId(item.id);
                              event.currentTarget.closest("details")?.removeAttribute("open");
                            }}
                            className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                              isActiveScope
                                ? "bg-[#e9f8f0] text-[#002d21]"
                                : "text-stone-600 hover:bg-stone-50"
                            }`}
                          >
                            <span className="min-w-0 truncate">
                              {item.title || `Transformation ${item.priority_order}`}
                            </span>
                          </button>
                        );
                      })}

                        <button
                          type="button"
                          onClick={(event) => {
                            setSelectedScopeId("out_of_plan");
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                          className={`mt-0.5 flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                            isOutOfPlanScope
                              ? "bg-[#e9f8f0] text-[#002d21]"
                              : "text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          Base de vie
                        </button>

                        <div className="my-1 h-px bg-stone-100" />

                        <button
                          type="button"
                          onClick={(event) => {
                            handleOpenAdditionalPlanFlow();
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#002d21] transition-colors hover:bg-[#e9f8f0]"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          Ajouter une transformation
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            setActiveTab("preferences");
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                          className={`mt-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                            activeTab === "preferences"
                              ? "bg-[#002d21] text-white"
                              : "text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          <Settings className="h-3.5 w-3.5 shrink-0" />
                          Préférences
                        </button>
                    </div>
                  </details>

                  <div className="min-w-0 flex-1">
                    <div className="grid h-full w-full grid-flow-col auto-cols-fr gap-1 rounded-2xl border border-[#b8d8cc] bg-white/90 p-1.5 shadow-sm">
                      {dashboardTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex min-w-0 items-center justify-center gap-[clamp(0.25rem,0.8vw,0.5rem)] rounded-xl px-[clamp(0.25rem,2vw,1.25rem)] py-[clamp(0.5rem,1vw,0.625rem)] text-[clamp(0.625rem,calc(0.35rem+0.8vw),0.875rem)] font-bold transition-all duration-200 ${
                              isActive
                                ? `bg-[#002d21] text-white shadow-sm shadow-[#002d21]/20 border border-[#002d21]`
                                : "text-[#52635b] hover:text-[#002d21] hover:bg-[#e9f8f0]"
                            }`}
                          >
                            <Icon
                              className={`h-[clamp(0.8rem,1.6vw,1rem)] w-[clamp(0.8rem,1.6vw,1rem)] shrink-0 ${isActive ? tab.activeColor : ""}`}
                            />
                            <span className="min-w-0 whitespace-nowrap min-[560px]:hidden">{tab.mobileLabel}</span>
                            <span className="hidden min-w-0 whitespace-nowrap min-[560px]:inline">{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── TAB CONTENT ─────────────────────────────────────── */}
                {activeTab === "plan" ? (
                  <div className="animate-fade-in min-w-0 max-w-full space-y-2.5 sm:space-y-5">
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

                        {isV3 ? (
                          <>
                            <PhaseProgression
                              phases={logic.phases}
                              scheduleAnchor={scheduleAnchor}
                              levelToolRecommendationsByPhaseId={levelToolRecommendationsByPhaseId}
                              onLevelToolRecommendationChanged={refetch}
                              primaryMetricLabel={planContentV3?.primary_metric?.label ?? null}
                              unlockStateByItemId={logic.unlockStateByItemId}
                              busyItemId={logic.mutatingItemId}
                              onComplete={logic.completeItem}
                              onCardsChanged={refetch}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                              onLogHeartbeat={() =>
                                navigate("/chat", {
                                  state: {
                                    source: "dashboard_v2_heartbeat_checkin",
                                  },
                                })
                              }
                              onCompletionAction={
                                canShowTransformationEndAction
                                  ? handleEndSimpleTransformation
                                  : undefined
                              }
                              completionActionLabel={
                                canShowTransformationEndAction
                                  ? "Mettre fin à la transformation"
                                  : null
                              }
                              completionActionHint={
                                canShowTransformationEndAction
                                  ? "Si tu veux arrêter ce chantier ici, tu peux mettre fin à cette transformation depuis ce bloc."
                                  : null
                              }
                              journeyContext={activePlanContent.journey_context}
                              planAdjustmentRevision={parsePlanAdjustmentRevision(
                                planContentV3?.metadata?.plan_adjustment_revision,
                              )}
                            />
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
                              onCardsChanged={refetch}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
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
                              onCardsChanged={refetch}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
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
                              onCardsChanged={refetch}
                              onOpenDefenseResourceEditor={openPlanDefenseResourceEditor}
                            />
                          </>
                        )}

                        <section
                          className={`rounded-[30px] border px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)] ${
                            shouldWarnBeforeNextTransformation
                              ? "border-rose-200 bg-rose-50/90"
                              : "border-stone-200 bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p
                                className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
                                  shouldWarnBeforeNextTransformation
                                    ? "text-rose-700"
                                    : "text-stone-500"
                                }`}
                              >
                                Suite du parcours
                              </p>
                              <h3
                                className={`mt-3 text-2xl font-semibold ${
                                  shouldWarnBeforeNextTransformation
                                    ? "text-rose-950"
                                    : "text-stone-950"
                                }`}
                              >
                                Choisir la bonne prochaine transformation
                              </h3>
                              <p
                                className={`mt-2 text-sm leading-6 ${
                                  shouldWarnBeforeNextTransformation
                                    ? "text-rose-900"
                                    : "text-stone-600"
                                }`}
                              >
                                {hasSequencedNextTransformation
                                  ? "Tu dois passer à la 2ème transformation lorsque tu as atteint l'objectif de la 1ère transformation, c'est-à-dire l'objectif du plan ci-dessus."
                                  : hasSimpleNextTransformation
                                    ? "Ici, tu peux passer à la prochaine transformation. Pour ajouter une nouvelle transformation en parallèle (max 2), passe par le menu."
                                    : hasCycleRelaunchAction
                                      ? "Ici, tu peux clôturer cette transformation et relancer un nouveau parcours si tu veux ouvrir un nouveau cycle."
                                    : "Aucune transformation suivante n'est prête ici pour le moment. Si tu veux en ajouter une, passe par le menu."}
                              </p>
                            </div>
                            {hasSequencedNextTransformation && nextSequencedTransformation ? (
                              <div
                                className={`rounded-2xl border px-4 py-3 text-sm ${
                                  shouldWarnBeforeNextTransformation
                                    ? "border-rose-200 bg-white text-rose-950"
                                    : "border-blue-100 bg-blue-50 text-blue-950"
                                }`}
                              >
                                <p
                                  className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                                    shouldWarnBeforeNextTransformation
                                      ? "text-rose-700"
                                      : "text-blue-700"
                                  }`}
                                >
                                  2ème transformation verrouillée
                                </p>
                                <p className="mt-2 font-semibold">
                                  {nextSequencedTransformationTitle}
                                </p>
                                {transitionGlobalObjective ? (
                                  <p
                                    className={`mt-1 ${
                                      shouldWarnBeforeNextTransformation
                                        ? "text-rose-900/80"
                                        : "text-blue-900/80"
                                    }`}
                                  >
                                    {hasSequencedNextTransformation
                                      ? `Objectif de la 2ème transformation : ${transitionGlobalObjective}`
                                      : `Objectif global : ${transitionGlobalObjective}`}
                                  </p>
                                ) : null}
                                {shouldShowNextTransformationSummary ? (
                                  <p
                                    className={`mt-2 ${
                                      shouldWarnBeforeNextTransformation
                                        ? "text-rose-900/80"
                                        : "text-blue-900/80"
                                    }`}
                                  >
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
                            {canShowTransformationEndAction ? (
                              <button
                                type="button"
                                onClick={() => void handleEndSimpleTransformation()}
                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                                  shouldWarnBeforeNextTransformation
                                    ? "border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
                                    : "border-emerald-200 bg-emerald-50 text-[var(--action-green)] hover:bg-emerald-100"
                                }`}
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
                      <RemindersSection
                        userId={user.id}
                        cycleId={cycle.id}
                        scopeKind="out_of_plan"
                        isLocked={!canAccessWhatsappFeatures}
                        onUnlockRequest={() => navigate("/upgrade")}
                      />
                    ) : isV3 ? (
                      <div className="space-y-5">
                        <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setIsLabUsageOpen((value) => !value)}
                            className="flex w-full items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-widest text-[var(--action-green)] transition-colors hover:text-[var(--action-green)]"
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

                        <AttackCards
                          loading={labCards.loading}
                          generatingAttack={labCards.generatingAttack}
                          generatingTechniqueKey={labCards.generatingTechniqueKey}
                          analyzingTechniqueKey={labCards.analyzingTechniqueKey}
                          attackCard={labCards.attackCard?.content ?? null}
                          onGenerateTechnique={(techniqueKey, answers, options) =>
                            labCards.generateTechnique(techniqueKey, answers, options)}
                          onAnalyzeTechniqueAdjustment={(techniqueKey, reasonKey, notes) =>
                            labCards.analyzeTechniqueAdjustment(techniqueKey, reasonKey, notes)}
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
                      <RemindersSection
                        userId={user.id}
                        cycleId={cycle.id}
                        scopeKind="out_of_plan"
                        isLocked={!canAccessWhatsappFeatures}
                        onUnlockRequest={() => navigate("/upgrade")}
                      />
                    ) : (
                      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-8 text-center shadow-sm">
                        <Sparkles className="mx-auto h-10 w-10 text-stone-300" />
                        <p className="mt-4 text-sm text-stone-500">
                          L'espace Inspirations est disponible avec les plans V3.
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

      <PlanSavedModal
        open={isPlanSavedModalOpen}
        whatsappOptedIn={profile ? profile.whatsappOptedIn : true}
        onClose={() => setIsPlanSavedModalOpen(false)}
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
    </div>
  );
}
