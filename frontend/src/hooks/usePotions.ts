import { useCallback, useEffect, useState } from "react";

import type { LabScopeInput } from "../lib/labScope";
import { supabase } from "../lib/supabase";
import { POTION_LIST } from "../lib/potions";
import type {
  PotionDefinition,
  PotionType,
  UserPotionSessionRow,
} from "../types/v2";

export type UsePotionsResult = {
  loading: boolean;
  activatingPotionType: PotionType | null;
  schedulingSessionId: string | null;
  definitions: PotionDefinition[];
  sessions: UserPotionSessionRow[];
  latestSessionByType: Partial<Record<PotionType, UserPotionSessionRow>>;
  usageCountByType: Partial<Record<PotionType, number>>;
  activatePotion: (
    potionType: PotionType,
    answers: Record<string, string>,
    freeText: string,
  ) => Promise<void>;
  schedulePotionFollowUp: (
    sessionId: string,
    localTimeHHMM: string,
    durationDays: number,
  ) => Promise<void>;
  reactivatePotion: (
    definition: PotionDefinition,
    session: UserPotionSessionRow,
  ) => Promise<void>;
  refresh: () => Promise<void>;
};

export function usePotions(scope: LabScopeInput): UsePotionsResult {
  const [loading, setLoading] = useState(true);
  const [activatingPotionType, setActivatingPotionType] = useState<PotionType | null>(null);
  const [schedulingSessionId, setSchedulingSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<UserPotionSessionRow[]>([]);

  const refresh = useCallback(async () => {
    if (!scope) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("user_potion_sessions")
        .select("*")
        .eq("cycle_id", scope.cycleId)
        .eq("scope_kind", scope.kind)
        .eq("status", "completed")
        .order("generated_at", { ascending: false });

      query = scope.kind === "transformation"
        ? query.eq("transformation_id", scope.transformationId)
        : query.is("transformation_id", null);

      const { data, error } = await query;

      if (error) throw error;
      setSessions((data as UserPotionSessionRow[] | null) ?? []);
    } catch (error) {
      console.error("[usePotions] refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activatePotion = useCallback(async (
    potionType: PotionType,
    answers: Record<string, string>,
    freeText: string,
  ) => {
    if (!scope || activatingPotionType) return;
    setActivatingPotionType(potionType);
    try {
      const { error } = await supabase.functions.invoke("activate-potion-v1", {
        body: {
          scope_kind: scope.kind,
          transformation_id: scope.kind === "transformation" ? scope.transformationId : null,
          potion_type: potionType,
          answers,
          free_text: freeText.trim() || null,
        },
      });
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[usePotions] activatePotion failed:", error);
    } finally {
      setActivatingPotionType(null);
    }
  }, [activatingPotionType, refresh, scope]);

  const latestSessionByType: Partial<Record<PotionType, UserPotionSessionRow>> = {};
  const usageCountByType: Partial<Record<PotionType, number>> = {};

  const schedulePotionFollowUp = useCallback(async (
    sessionId: string,
    localTimeHHMM: string,
    durationDays: number,
  ) => {
    if (!sessionId || schedulingSessionId) return;
    setSchedulingSessionId(sessionId);
    try {
      const { error } = await supabase.functions.invoke("schedule-potion-follow-up-v1", {
        body: {
          session_id: sessionId,
          local_time_hhmm: localTimeHHMM,
          duration_days: durationDays,
        },
      });
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[usePotions] schedulePotionFollowUp failed:", error);
    } finally {
      setSchedulingSessionId(null);
    }
  }, [refresh, schedulingSessionId]);

  const reactivatePotion = useCallback(async (
    definition: PotionDefinition,
    session: UserPotionSessionRow,
  ) => {
    const localTimeHHMM = session.follow_up_strategy?.scheduled_local_time_hhmm ?? "09:00";
    const durationDays = session.follow_up_strategy?.scheduled_duration_days ??
      session.follow_up_strategy?.suggested_duration_days ??
      definition.default_follow_up_strategy.suggested_duration_days ??
      7;

    await schedulePotionFollowUp(session.id, localTimeHHMM, durationDays);
  }, [schedulePotionFollowUp]);

  for (const definition of POTION_LIST) {
    usageCountByType[definition.type] = 0;
  }
  for (const session of sessions) {
    usageCountByType[session.potion_type] = (usageCountByType[session.potion_type] ?? 0) + 1;
    if (!latestSessionByType[session.potion_type]) {
      latestSessionByType[session.potion_type] = session;
    }
  }

  return {
    loading,
    activatingPotionType,
    schedulingSessionId,
    definitions: POTION_LIST,
    sessions,
    latestSessionByType,
    usageCountByType,
    activatePotion,
    schedulePotionFollowUp,
    reactivatePotion,
    refresh,
  };
}
