import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { resolveDashboardTransformations } from "../lib/dashboardTransformations";
import { supabase } from "../lib/supabase";
import type {
  PlanContentV2,
  PlanContentV3,
  UserCycleRow,
  UserDefenseCardRow,
  UserAttackCardRow,
  UserLevelToolRecommendationRow,
  UserPlanItemEntryRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserProfessionalSupportRecommendationRow,
  UserTransformationRow,
} from "../types/v2";

const INCOMPLETE_CYCLE_STATUSES = [
  "draft",
  "clarification_needed",
  "structured",
  "prioritized",
  "questionnaire_in_progress",
  "signup_pending",
  "profile_pending",
  "ready_for_plan",
] as const;

export type DashboardV2PlanItemRuntime = UserPlanItemRow & {
  last_entry_at: string | null;
  recent_entries: UserPlanItemEntryRow[];
  cards_required: boolean;
  linked_defense_card: UserDefenseCardRow | null;
  linked_attack_card: UserAttackCardRow | null;
};

type DashboardV2Profile = {
  firstName: string;
};

function isMissingLevelToolRecommendationsStorage(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : "";

  return (
    (code === "PGRST205" || code === "42P01") &&
    message.includes("user_level_tool_recommendations")
  );
}

function getFirstName(fullName: string | null, fallbackEmail?: string | null) {
  const candidate = fullName?.trim();
  if (candidate) return candidate.split(/\s+/)[0];
  const emailUser = fallbackEmail?.split("@")[0]?.trim();
  return emailUser || "Toi";
}

function toPlanContent(content: Record<string, unknown> | null) {
  if (!content) return null;
  if (content.version !== 2) return null;
  return content as unknown as PlanContentV2;
}

function toPlanContentV3(content: Record<string, unknown> | null) {
  if (!content) return null;
  if (content.version !== 3) return null;
  return content as unknown as PlanContentV3;
}

function mapPlanItemRuntime(
  planItems: UserPlanItemRow[],
  entries: UserPlanItemEntryRow[],
  linkedDefenseCards: UserDefenseCardRow[] = [],
  linkedAttackCards: UserAttackCardRow[] = [],
): DashboardV2PlanItemRuntime[] {
  const byItem = new Map<string, UserPlanItemEntryRow[]>();
  const defenseById = new Map(linkedDefenseCards.map((card) => [card.id, card]));
  const attackById = new Map(linkedAttackCards.map((card) => [card.id, card]));

  for (const entry of entries) {
    const itemEntries = byItem.get(entry.plan_item_id) ?? [];
    if (itemEntries.length < 5) itemEntries.push(entry);
    byItem.set(entry.plan_item_id, itemEntries);
  }

  return planItems.map((item) => {
    const recentEntries = byItem.get(item.id) ?? [];
    return {
      ...item,
      last_entry_at: recentEntries[0]?.effective_at ?? null,
      recent_entries: recentEntries,
      cards_required: item.dimension === "missions" || item.dimension === "habits",
      linked_defense_card: item.defense_card_id ? defenseById.get(item.defense_card_id) ?? null : null,
      linked_attack_card: item.attack_card_id ? attackById.get(item.attack_card_id) ?? null : null,
    };
  });
}

export function useDashboardV2Data(selectedTransformationId: string | null) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DashboardV2Profile | null>(null);
  const [cycle, setCycle] = useState<UserCycleRow | null>(null);
  const [transformations, setTransformations] = useState<UserTransformationRow[]>([]);
  const [activeTransformation, setActiveTransformation] =
    useState<UserTransformationRow | null>(null);
  const [transformation, setTransformation] = useState<UserTransformationRow | null>(
    null,
  );
  const [plan, setPlan] = useState<UserPlanV2Row | null>(null);
  const [planContent, setPlanContent] = useState<PlanContentV2 | null>(null);
  const [planContentV3, setPlanContentV3] = useState<PlanContentV3 | null>(null);
  const [planItems, setPlanItems] = useState<DashboardV2PlanItemRuntime[]>([]);
  const [professionalSupportRecommendations, setProfessionalSupportRecommendations] =
    useState<UserProfessionalSupportRecommendationRow[]>([]);
  const [levelToolRecommendations, setLevelToolRecommendations] =
    useState<UserLevelToolRecommendationRow[]>([]);
  const [levelToolRecommendationsAvailable, setLevelToolRecommendationsAvailable] =
    useState<boolean | null>(null);
  const [nextTransformation, setNextTransformation] =
    useState<UserTransformationRow | null>(null);
  const [hasIncompleteCycle, setHasIncompleteCycle] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setLevelToolRecommendationsAvailable(null);

    try {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("onboarding_completed, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile({
        firstName: getFirstName(profileRow?.full_name ?? null, user.email),
      });

      const { data: cycleRow, error: cycleError } = await supabase
        .from("user_cycles")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cycleError) throw cycleError;

      if (!cycleRow) {
        const { data: incompleteCycleRow, error: incompleteCycleError } =
          await supabase
            .from("user_cycles")
            .select("id")
            .eq("user_id", user.id)
            .in("status", [...INCOMPLETE_CYCLE_STATUSES])
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (incompleteCycleError) throw incompleteCycleError;

        setHasIncompleteCycle(Boolean(incompleteCycleRow?.id));
        setCycle(null);
        setTransformations([]);
        setActiveTransformation(null);
        setTransformation(null);
        setPlan(null);
        setPlanContent(null);
        setPlanContentV3(null);
        setPlanItems([]);
        setProfessionalSupportRecommendations([]);
        setLevelToolRecommendations([]);
        setLevelToolRecommendationsAvailable(null);
        setNextTransformation(null);
        return;
      }

      setHasIncompleteCycle(false);
      setCycle(cycleRow as UserCycleRow);

      const { data: transformationRows, error: transformationsError } = await supabase
        .from("user_transformations")
        .select("*")
        .eq("cycle_id", cycleRow.id)
        .order("priority_order", { ascending: true })
        .order("updated_at", { ascending: false });

      if (transformationsError) throw transformationsError;

      const allTransformations =
        (transformationRows as UserTransformationRow[] | null) ?? [];
      setTransformations(allTransformations);

      const resolvedTransformations = resolveDashboardTransformations({
        transformations: allTransformations,
        cycleActiveTransformationId: cycleRow.active_transformation_id,
        selectedTransformationId,
      });

      setActiveTransformation(resolvedTransformations.activeTransformation);
      setTransformation(resolvedTransformations.transformation);
      setNextTransformation(resolvedTransformations.nextTransformation);

      if (!resolvedTransformations.transformation) {
        setPlan(null);
        setPlanContent(null);
        setPlanContentV3(null);
        setPlanItems([]);
        setProfessionalSupportRecommendations([]);
        setLevelToolRecommendations([]);
        setLevelToolRecommendationsAvailable(null);
        return;
      }

      const planResult = await supabase
        .from("user_plans_v2")
        .select("*")
        .eq("cycle_id", cycleRow.id)
        .eq("transformation_id", resolvedTransformations.transformation.id)
        .in("status", ["active", "paused", "completed"])
        .order("activated_at", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planResult.error) throw planResult.error;

      const activePlan = (planResult.data as UserPlanV2Row | null) ?? null;
      setPlan(activePlan);
      const rawContent = (activePlan?.content ?? null) as Record<string, unknown> | null;
      setPlanContent(toPlanContent(rawContent));
      setPlanContentV3(toPlanContentV3(rawContent));

      if (!activePlan) {
        setPlanItems([]);
        setProfessionalSupportRecommendations([]);
        setLevelToolRecommendations([]);
        setLevelToolRecommendationsAvailable(null);
        return;
      }

      const [planItemsResult, entriesResult, professionalSupportResult, levelToolsResult] = await Promise.all([
        supabase
          .from("user_plan_items")
          .select("*")
          .eq("plan_id", activePlan.id)
          .order("dimension", { ascending: true })
          .order("activation_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("user_plan_item_entries")
          .select("*")
          .eq("plan_id", activePlan.id)
          .order("effective_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("user_professional_support_recommendations")
          .select("*")
          .eq("transformation_id", resolvedTransformations.transformation.id)
          .eq("is_active", true)
          .order("priority_rank", { ascending: true })
          .order("generated_at", { ascending: true }),
        supabase
          .from("user_level_tool_recommendations")
          .select("*")
          .eq("transformation_id", resolvedTransformations.transformation.id)
          .eq("is_active", true)
          .order("target_level_order", { ascending: true })
          .order("priority_rank", { ascending: true })
          .order("generated_at", { ascending: true }),
      ]);

      if (planItemsResult.error) throw planItemsResult.error;
      if (entriesResult.error) throw entriesResult.error;
      if (professionalSupportResult.error) throw professionalSupportResult.error;

      const rawPlanItems = (planItemsResult.data as UserPlanItemRow[] | null) ?? [];
      setProfessionalSupportRecommendations(
        (professionalSupportResult.data as UserProfessionalSupportRecommendationRow[] | null) ?? [],
      );
      if (levelToolsResult.error) {
        if (isMissingLevelToolRecommendationsStorage(levelToolsResult.error)) {
          console.warn(
            "[useDashboardV2Data] level tool recommendations unavailable locally; skipping optional feature",
            levelToolsResult.error,
          );
          setLevelToolRecommendations([]);
          setLevelToolRecommendationsAvailable(false);
        } else {
          throw levelToolsResult.error;
        }
      } else {
        setLevelToolRecommendations(
          (levelToolsResult.data as UserLevelToolRecommendationRow[] | null) ?? [],
        );
        setLevelToolRecommendationsAvailable(true);
      }
      const defenseIds = rawPlanItems
        .map((item) => item.defense_card_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      const attackIds = rawPlanItems
        .map((item) => item.attack_card_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

      const [defenseCardsResult, attackCardsResult] = await Promise.all([
        defenseIds.length > 0
          ? supabase.from("user_defense_cards").select("*").in("id", defenseIds)
          : Promise.resolve({ data: [], error: null } as const),
        attackIds.length > 0
          ? supabase.from("user_attack_cards").select("*").in("id", attackIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);

      if (defenseCardsResult.error) throw defenseCardsResult.error;
      if (attackCardsResult.error) throw attackCardsResult.error;

      setPlanItems(
        mapPlanItemRuntime(
          rawPlanItems,
          (entriesResult.data as UserPlanItemEntryRow[] | null) ?? [],
          (defenseCardsResult.data as UserDefenseCardRow[] | null) ?? [],
          (attackCardsResult.data as UserAttackCardRow[] | null) ?? [],
        ),
      );
    } catch (fetchError) {
      console.error("[useDashboardV2Data] load failed", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Impossible de charger le dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedTransformationId, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    void refetch();
  }, [authLoading, navigate, refetch, user]);

  return {
    user,
    authLoading,
    loading,
    error,
    profile,
    cycle,
    transformations,
    activeTransformation,
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
  };
}
