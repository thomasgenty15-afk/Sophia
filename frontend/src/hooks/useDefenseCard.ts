import { useCallback, useEffect, useMemo, useState } from "react";

import type { LabScopeInput } from "../lib/labScope";
import { supabase } from "../lib/supabase";
import type {
  UserDefenseCardRow,
  UserDefenseWinRow,
} from "../types/v2";

type WeeklyWinBucket = {
  weekStart: string;
  count: number;
};

export type AddDefenseCardInput = {
  label: string;
  situation: string;
  signal: string;
  defenseResponse: string;
  planB: string;
};

export type DefenseDraftQuestion = {
  id: string;
  label: string;
  helperText: string | null;
  placeholder: string | null;
  required: boolean;
};

export type DefenseDraftQuestionnaire = {
  cardExplanation: string;
  questions: DefenseDraftQuestion[];
};

export type DefenseDraftPreview = {
  label: string;
  situation: string;
  signal: string;
  defenseResponse: string;
  planB: string;
};

export type UpdateDefenseCardInput = {
  impulseId: string;
  triggerId: string;
  situation: string;
  signal: string;
  defenseResponse: string;
  planB: string;
};

export type RemoveDefenseCardInput = {
  impulseId: string;
  triggerId: string;
};

export type UseDefenseCardResult = {
  loading: boolean;
  card: UserDefenseCardRow | null;
  wins: UserDefenseWinRow[];
  totalWins: number;
  weeklyWins: WeeklyWinBucket[];
  trend: "rising" | "stable" | "falling";
  logWin: (impulseId: string, triggerId?: string | null) => Promise<boolean>;
  loggingWin: boolean;
  generating: boolean;
  addingCard: boolean;
  preparingCardDraft: boolean;
  generatingCardDraft: boolean;
  removingCard: boolean;
  updatingCard: boolean;
  generate: () => Promise<void>;
  regenerate: () => Promise<void>;
  addCard: (input: AddDefenseCardInput) => Promise<boolean>;
  prepareAddCard: (need: string) => Promise<DefenseDraftQuestionnaire | null>;
  generateAddCardDraft: (
    need: string,
    answers: Record<string, string>,
  ) => Promise<DefenseDraftPreview | null>;
  removeCard: (input: RemoveDefenseCardInput) => Promise<boolean>;
  updateCard: (input: UpdateDefenseCardInput) => Promise<boolean>;
};

function applyScopeFilter(query: any, scope: Exclude<LabScopeInput, null>) {
  const base = query
    .eq("cycle_id", scope.cycleId)
    .eq("scope_kind", scope.kind);
  return scope.kind === "transformation"
    ? base.eq("transformation_id", scope.transformationId)
    : base.is("transformation_id", null);
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyBuckets(wins: UserDefenseWinRow[]): WeeklyWinBucket[] {
  const buckets = new Map<string, number>();
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - i * 7);
    buckets.set(getWeekStart(weekDate), 0);
  }

  for (const win of wins) {
    const ws = getWeekStart(new Date(win.logged_at));
    if (buckets.has(ws)) {
      buckets.set(ws, (buckets.get(ws) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, count]) => ({ weekStart, count }));
}

function computeTrend(weeklyWins: WeeklyWinBucket[]): "rising" | "stable" | "falling" {
  if (weeklyWins.length < 3) return "stable";

  const recent = weeklyWins.slice(-3);
  const first = recent[0].count;
  const last = recent[recent.length - 1].count;

  if (last > first + 1) return "rising";
  if (last < first - 1) return "falling";
  return "stable";
}

export function useDefenseCard(
  scope: LabScopeInput,
  preferredCardId?: string | null,
): UseDefenseCardResult {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [preparingCardDraft, setPreparingCardDraft] = useState(false);
  const [generatingCardDraft, setGeneratingCardDraft] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [loggingWin, setLoggingWin] = useState(false);
  const [card, setCard] = useState<UserDefenseCardRow | null>(null);
  const [wins, setWins] = useState<UserDefenseWinRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!scope) {
      setCard(null);
      setWins([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const cardQuery = preferredCardId
        ? supabase
          .from("user_defense_cards")
          .select("*")
          .eq("id", preferredCardId)
          .maybeSingle()
        : applyScopeFilter(
          supabase
            .from("user_defense_cards")
            .select("*")
            .is("plan_item_id", null)
            .order("generated_at", { ascending: false })
            .limit(1),
          scope,
        ).maybeSingle();
      const { data: cardRow, error: cardError } = await cardQuery;
      if (cardError) throw cardError;

      if (!cardRow) {
        setCard(null);
        setWins([]);
        setLoading(false);
        return;
      }

      setCard(cardRow as unknown as UserDefenseCardRow);

      const { data: winRows, error: winsError } = await supabase
        .from("user_defense_wins")
        .select("*")
        .eq("defense_card_id", cardRow.id)
        .order("logged_at", { ascending: false });
      if (winsError) throw winsError;

      setWins((winRows as unknown as UserDefenseWinRow[] | null) ?? []);
    } catch (err) {
      console.error("[useDefenseCard] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [preferredCardId, scope]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalWins = wins.length;
  const weeklyWins = useMemo(() => buildWeeklyBuckets(wins), [wins]);
  const trend = useMemo(() => computeTrend(weeklyWins), [weeklyWins]);

  const logWin = useCallback(
    async (impulseId: string, triggerId?: string | null) => {
      if (!card) return false;

      setLoggingWin(true);
      try {
        const { error } = await supabase.from("user_defense_wins").insert({
          defense_card_id: card.id,
          impulse_id: impulseId,
          trigger_id: triggerId ?? null,
          source: "quick_log",
          logged_at: new Date().toISOString(),
        });

        if (error) {
          console.error("[useDefenseCard] logWin failed:", error);
          return false;
        }

        await fetchData();
        return true;
      } finally {
        setLoggingWin(false);
      }
    },
    [card, fetchData],
  );

  const runGeneration = useCallback(async (forceRegenerate: boolean) => {
    if (!scope || generating) return;

    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-defense-card-v3", {
        body: {
          defense_card_id: card?.id ?? undefined,
          scope_kind: scope.kind,
          transformation_id:
            scope.kind === "transformation" ? scope.transformationId : undefined,
          force_regenerate: forceRegenerate,
        },
      });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      console.error("[useDefenseCard] generate failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [scope, generating, fetchData, card?.id]);

  const generate = useCallback(async () => {
    await runGeneration(false);
  }, [runGeneration]);

  const regenerate = useCallback(async () => {
    await runGeneration(true);
  }, [runGeneration]);

  const addCard = useCallback(async (input: AddDefenseCardInput) => {
    if (!scope || addingCard) return false;

    setAddingCard(true);
    try {
      const { error } = await supabase.functions.invoke("update-defense-card-v3", {
        body: card
          ? {
            action: "add_impulse",
            defense_card_id: card.id,
            label: input.label.trim(),
            generic_defense: input.planB.trim(),
            triggers: [{
              situation: input.situation.trim(),
              signal: input.signal.trim(),
              defense_response: input.defenseResponse.trim(),
              plan_b: input.planB.trim(),
            }],
          }
          : {
            action: "create_card_with_impulse",
            cycle_id: scope.cycleId,
            scope_kind: scope.kind,
            transformation_id: scope.kind === "transformation"
              ? scope.transformationId
              : undefined,
            label: input.label.trim(),
            generic_defense: input.planB.trim(),
            triggers: [{
              situation: input.situation.trim(),
              signal: input.signal.trim(),
              defense_response: input.defenseResponse.trim(),
              plan_b: input.planB.trim(),
            }],
          },
      });
      if (error) throw error;
      await fetchData();
      return true;
    } catch (err) {
      console.error("[useDefenseCard] addCard failed:", err);
      return false;
    } finally {
      setAddingCard(false);
    }
  }, [scope, card, addingCard, fetchData]);

  const prepareAddCard = useCallback(async (need: string) => {
    if (!scope || preparingCardDraft) return null;

    setPreparingCardDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-defense-card-v1", {
        body: {
          stage: "questionnaire",
          free_text: need.trim(),
          scope_kind: scope.kind,
          transformation_id:
            scope.kind === "transformation" ? scope.transformationId : undefined,
        },
      });
      if (error) throw error;

      const explanation = typeof data?.card_explanation === "string"
        ? data.card_explanation.trim()
        : "";
      const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
      const questions = rawQuestions
        .map((question: unknown): DefenseDraftQuestion | null => {
          if (!question || typeof question !== "object") return null;
          const candidate = question as Record<string, unknown>;
          const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
          const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
          if (!id || !label) return null;
          return {
            id,
            label,
            helperText: typeof candidate.helper_text === "string" ? candidate.helper_text : null,
            placeholder: typeof candidate.placeholder === "string" ? candidate.placeholder : null,
            required: candidate.required !== false,
          };
        })
        .filter((question: DefenseDraftQuestion | null): question is DefenseDraftQuestion => question !== null)
        .slice(0, 3);

      if (!explanation || questions.length === 0) {
        throw new Error("Invalid defense draft questionnaire payload");
      }

      return {
        cardExplanation: explanation,
        questions,
      };
    } catch (err) {
      console.error("[useDefenseCard] prepareAddCard failed:", err);
      return null;
    } finally {
      setPreparingCardDraft(false);
    }
  }, [scope, preparingCardDraft]);

  const generateAddCardDraft = useCallback(async (
    need: string,
    answers: Record<string, string>,
  ) => {
    if (!scope || generatingCardDraft) return null;

    setGeneratingCardDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-defense-card-v1", {
        body: {
          stage: "draft",
          free_text: need.trim(),
          answers,
          scope_kind: scope.kind,
          transformation_id:
            scope.kind === "transformation" ? scope.transformationId : undefined,
        },
      });
      if (error) throw error;

      const label = typeof data?.label === "string" ? data.label.trim() : "";
      const situation = typeof data?.situation === "string" ? data.situation.trim() : "";
      const signal = typeof data?.signal === "string" ? data.signal.trim() : "";
      const defenseResponse = typeof data?.defense_response === "string"
        ? data.defense_response.trim()
        : "";
      const planB = typeof data?.plan_b === "string" ? data.plan_b.trim() : "";

      if (!label || !situation || !signal || !defenseResponse || !planB) {
        throw new Error("Invalid defense draft payload");
      }

      return {
        label,
        situation,
        signal,
        defenseResponse,
        planB,
      };
    } catch (err) {
      console.error("[useDefenseCard] generateAddCardDraft failed:", err);
      return null;
    } finally {
      setGeneratingCardDraft(false);
    }
  }, [scope, generatingCardDraft]);

  const updateCard = useCallback(async (input: UpdateDefenseCardInput) => {
    if (!card || updatingCard) return false;

    setUpdatingCard(true);
    try {
      const { error } = await supabase.functions.invoke("update-defense-card-v3", {
        body: {
          action: "update_card",
          defense_card_id: card.id,
          impulse_id: input.impulseId,
          trigger_id: input.triggerId,
          situation: input.situation,
          signal: input.signal,
          defense_response: input.defenseResponse,
          generic_defense: input.planB,
          plan_b: input.planB,
        },
      });
      if (error) throw error;
      await fetchData();
      return true;
    } catch (err) {
      console.error("[useDefenseCard] updateCard failed:", err);
      return false;
    } finally {
      setUpdatingCard(false);
    }
  }, [card, updatingCard, fetchData]);

  const removeCard = useCallback(async (input: RemoveDefenseCardInput) => {
    if (!card || removingCard) return false;

    setRemovingCard(true);
    try {
      const { error } = await supabase.functions.invoke("update-defense-card-v3", {
        body: {
          action: "remove_trigger",
          defense_card_id: card.id,
          impulse_id: input.impulseId,
          trigger_id: input.triggerId,
        },
      });
      if (error) throw error;
      await fetchData();
      return true;
    } catch (err) {
      console.error("[useDefenseCard] removeCard failed:", err);
      return false;
    } finally {
      setRemovingCard(false);
    }
  }, [card, removingCard, fetchData]);

  return {
    loading,
    card,
    wins,
    totalWins,
    weeklyWins,
    trend,
    logWin,
    loggingWin,
    generating,
    addingCard,
    preparingCardDraft,
    generatingCardDraft,
    removingCard,
    updatingCard,
    generate,
    regenerate,
    addCard,
    prepareAddCard,
    generateAddCardDraft,
    removeCard,
    updateCard,
  };
}
