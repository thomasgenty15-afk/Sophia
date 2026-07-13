import { useCallback, useEffect, useState } from "react";

import type { LabScopeInput } from "../lib/labScope";
import { supabase } from "../lib/supabase";
import { POTION_LIST } from "../lib/potions";
import type {
  PotionDefinition,
  PotionScopeSelection,
  PotionType,
  UserPotionSessionRow,
} from "../types/v2";

export type UsePotionsResult = {
  loading: boolean;
  activatingPotionType: PotionType | null;
  schedulingSessionId: string | null;
  deletingSessionId: string | null;
  definitions: PotionDefinition[];
  sessions: UserPotionSessionRow[];
  latestSessionByType: Partial<Record<PotionType, UserPotionSessionRow>>;
  sessionsByType: Partial<Record<PotionType, UserPotionSessionRow[]>>;
  usageCountByType: Partial<Record<PotionType, number>>;
  activatePotion: (
    potionType: PotionType,
    answers: Record<string, string>,
    freeText: string,
    options?: { potionScope?: PotionScopeSelection | null },
  ) => Promise<void>;
  deletePotion: (sessionId: string) => Promise<void>;
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
  const [activatingPotionType, setActivatingPotionType] = useState<
    PotionType | null
  >(null);
  const [schedulingSessionId, setSchedulingSessionId] = useState<string | null>(
    null,
  );
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [sessions, setSessions] = useState<UserPotionSessionRow[]>([]);

  const refresh = useCallback(async () => {
    if (!scope) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Scope-agnostic on purpose: a potion is shown wherever the user is, in
      // the plan or out of it. We only scope to the active cycle + user, not to
      // scope_kind / transformation_id, so an activated potion is never hidden
      // behind the currently selected dashboard scope.
      const query = supabase
        .from("user_potion_sessions")
        .select("*")
        .eq("cycle_id", scope.cycleId)
        .eq("status", "completed")
        .order("generated_at", { ascending: false });

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
    options: { potionScope?: PotionScopeSelection | null } = {},
  ) => {
    if (!scope || activatingPotionType) return;
    setActivatingPotionType(potionType);
    try {
      const { error } = await supabase.functions.invoke("activate-potion-v1", {
        body: {
          scope_kind: scope.kind,
          transformation_id: scope.kind === "transformation"
            ? scope.transformationId
            : null,
          potion_type: potionType,
          answers,
          free_text: freeText.trim() || null,
          potion_scope: options.potionScope ?? null,
          rappel_scope: potionType === "rappel"
            ? options.potionScope ?? null
            : null,
        },
      });
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[usePotions] activatePotion failed:", error);
      // Re-throw so the caller can surface the failure to the user instead of
      // silently closing the modal as if the activation had succeeded.
      throw error;
    } finally {
      setActivatingPotionType(null);
    }
  }, [activatingPotionType, refresh, scope]);

  const latestSessionByType: Partial<Record<PotionType, UserPotionSessionRow>> =
    {};
  const sessionsByType: Partial<Record<PotionType, UserPotionSessionRow[]>> = {};
  const usageCountByType: Partial<Record<PotionType, number>> = {};

  const deletePotion = useCallback(async (sessionId: string) => {
    if (!sessionId || deletingSessionId) return;
    setDeletingSessionId(sessionId);
    try {
      const { error } = await supabase.functions.invoke(
        "archive-potion-session-v1",
        { body: { session_id: sessionId } },
      );
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[usePotions] deletePotion failed:", error);
      throw error;
    } finally {
      setDeletingSessionId(null);
    }
  }, [deletingSessionId, refresh]);

  const schedulePotionFollowUp = useCallback(async (
    sessionId: string,
    localTimeHHMM: string,
    durationDays: number,
  ) => {
    if (!sessionId || schedulingSessionId) return;
    setSchedulingSessionId(sessionId);
    try {
      const { error } = await supabase.functions.invoke(
        "schedule-potion-follow-up-v1",
        {
          body: {
            session_id: sessionId,
            local_time_hhmm: localTimeHHMM,
            duration_days: durationDays,
          },
        },
      );
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[usePotions] schedulePotionFollowUp failed:", error);
    } finally {
      setSchedulingSessionId(null);
    }
  }, [refresh, schedulingSessionId]);

  const reactivatePotion = useCallback(async (
    _definition: PotionDefinition,
    session: UserPotionSessionRow,
  ) => {
    const localTimeHHMM =
      session.follow_up_strategy?.scheduled_local_time_hhmm ?? "09:00";
    const durationDays = 7;

    await schedulePotionFollowUp(session.id, localTimeHHMM, durationDays);
  }, [schedulePotionFollowUp]);

  for (const definition of POTION_LIST) {
    usageCountByType[definition.type] = 0;
  }
  for (const session of sessions) {
    usageCountByType[session.potion_type] =
      (usageCountByType[session.potion_type] ?? 0) + 1;
    if (!latestSessionByType[session.potion_type]) {
      latestSessionByType[session.potion_type] = session;
    }
    (sessionsByType[session.potion_type] ??= []).push(session);
  }

  return {
    loading,
    activatingPotionType,
    schedulingSessionId,
    deletingSessionId,
    definitions: POTION_LIST,
    sessions,
    latestSessionByType,
    sessionsByType,
    usageCountByType,
    activatePotion,
    deletePotion,
    schedulePotionFollowUp,
    reactivatePotion,
    refresh,
  };
}
