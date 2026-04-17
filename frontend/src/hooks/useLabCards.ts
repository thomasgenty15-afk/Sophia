import { useCallback, useEffect, useState } from "react";

import type { LabScopeInput } from "../lib/labScope";
import { supabase } from "../lib/supabase";
import type { AttackCardContent, UserAttackCardRow } from "../types/v2";

export type AttackTechniqueKey = AttackCardContent["techniques"][number]["technique_key"];
export type AttackTechniqueGeneratedResult =
  NonNullable<AttackCardContent["techniques"][number]["generated_result"]>;

export type AttackTechniqueAdjustmentReasonKey =
  | "forgot"
  | "too_abstract"
  | "too_hard"
  | "did_not_resonate"
  | "wrong_problem"
  | "other";

export type AttackTechniqueAdjustmentAnalysis = {
  decision: "refine" | "change";
  recommendedTechniqueKey: AttackTechniqueKey;
  recommendationReason: string;
  diagnosticQuestions: string[];
};

export type UseLabCardsResult = {
  loading: boolean;
  generatingAttack: boolean;
  generatingTechniqueKey: AttackTechniqueKey | null;
  analyzingTechniqueKey: AttackTechniqueKey | null;
  attackCard: UserAttackCardRow | null;
  generateAttack: () => Promise<void>;
  regenerateAttack: () => Promise<void>;
  generateTechnique: (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: {
      adjustmentContext?: {
        currentTechniqueKey: AttackTechniqueKey;
        failureReasonKey: AttackTechniqueAdjustmentReasonKey;
        failureNotes: string;
        recommendationReason: string;
        diagnosticQuestions: string[];
        diagnosticAnswers: string[];
      };
    },
  ) => Promise<AttackTechniqueGeneratedResult | null>;
  analyzeTechniqueAdjustment: (
    currentTechniqueKey: AttackTechniqueKey,
    failureReasonKey: AttackTechniqueAdjustmentReasonKey,
    failureNotes: string,
  ) => Promise<AttackTechniqueAdjustmentAnalysis | null>;
  refresh: () => Promise<void>;
};

export function useLabCards(
  scope: LabScopeInput,
  preferredCardId?: string | null,
): UseLabCardsResult {
  const [loading, setLoading] = useState(true);
  const [generatingAttack, setGeneratingAttack] = useState(false);
  const [generatingTechniqueKey, setGeneratingTechniqueKey] = useState<AttackTechniqueKey | null>(null);
  const [analyzingTechniqueKey, setAnalyzingTechniqueKey] = useState<AttackTechniqueKey | null>(null);
  const [attackCard, setAttackCard] = useState<UserAttackCardRow | null>(null);

  const loadCurrentAttackCard = useCallback(async (): Promise<UserAttackCardRow | null> => {
    if (!scope) return null;

    const { data, error } = preferredCardId
      ? await supabase
        .from("user_attack_cards")
        .select("*")
        .eq("id", preferredCardId)
        .maybeSingle()
      : await (scope.kind === "transformation"
        ? supabase
          .from("user_attack_cards")
          .select("*")
          .eq("cycle_id", scope.cycleId)
          .eq("scope_kind", scope.kind)
          .eq("transformation_id", scope.transformationId)
          .is("plan_item_id", null)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        : supabase
          .from("user_attack_cards")
          .select("*")
          .eq("cycle_id", scope.cycleId)
          .eq("scope_kind", scope.kind)
          .is("transformation_id", null)
          .is("plan_item_id", null)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle());
    if (error) throw error;
    return (data as UserAttackCardRow | null) ?? null;
  }, [preferredCardId, scope]);

  const refresh = useCallback(async () => {
    if (!scope) {
      setAttackCard(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextCard = await loadCurrentAttackCard();
      setAttackCard(nextCard);
    } catch (error) {
      console.error("[useLabCards] refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, [loadCurrentAttackCard, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAttackGeneration = useCallback(async (
    forceRegenerate: boolean,
  ): Promise<UserAttackCardRow | null> => {
    if (!scope || generatingAttack) return null;
    setGeneratingAttack(true);
    try {
      const { error } = await supabase.functions.invoke("generate-attack-card-v1", {
        body: {
          attack_card_id: attackCard?.id ?? undefined,
          scope_kind: scope.kind,
          transformation_id:
            scope.kind === "transformation" ? scope.transformationId : undefined,
          force_regenerate: forceRegenerate,
        },
      });
      if (error) throw error;

      const nextCard = await loadCurrentAttackCard();
      setAttackCard(nextCard);
      return nextCard;
    } catch (error) {
      console.error("[useLabCards] generateAttack failed:", await formatFunctionError(error));
      return null;
    } finally {
      setGeneratingAttack(false);
    }
  }, [generatingAttack, loadCurrentAttackCard, scope, attackCard?.id]);

  const generateAttack = useCallback(async () => {
    await runAttackGeneration(false);
  }, [runAttackGeneration]);

  const regenerateAttack = useCallback(async () => {
    await runAttackGeneration(true);
  }, [runAttackGeneration]);

  const generateTechnique = useCallback(async (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: {
      adjustmentContext?: {
        currentTechniqueKey: AttackTechniqueKey;
        failureReasonKey: AttackTechniqueAdjustmentReasonKey;
        failureNotes: string;
        recommendationReason: string;
        diagnosticQuestions: string[];
        diagnosticAnswers: string[];
      };
    },
  ): Promise<AttackTechniqueGeneratedResult | null> => {
    if (generatingTechniqueKey) return null;

    let currentCard = attackCard;
    const needsBaseCard = !currentCard;
    const needsRepair = Boolean(
      currentCard &&
      (
        !Array.isArray(currentCard.content.techniques) ||
        currentCard.content.techniques.length === 0
      ),
    );

    if (needsBaseCard || needsRepair) {
      currentCard = await runAttackGeneration(needsRepair);
    }

    if (!currentCard) return null;

    setGeneratingTechniqueKey(techniqueKey);
    try {
      const { data, error } = await supabase.functions.invoke("generate-attack-technique-v1", {
        body: {
          attack_card_id: currentCard.id,
          technique_key: techniqueKey,
          answers,
          adjustment_context: options?.adjustmentContext
            ? {
              current_technique_key: options.adjustmentContext.currentTechniqueKey,
              failure_reason_key: options.adjustmentContext.failureReasonKey,
              failure_notes: options.adjustmentContext.failureNotes.trim() || null,
              recommendation_reason: options.adjustmentContext.recommendationReason.trim() || null,
              diagnostic_questions: options.adjustmentContext.diagnosticQuestions,
              diagnostic_answers: options.adjustmentContext.diagnosticAnswers,
            }
            : undefined,
        },
      });
      if (error) throw error;

      const nextContent = extractAttackCardContent(data);
      if (nextContent) {
        setAttackCard({
          ...currentCard,
          content: nextContent,
          last_updated_at: new Date().toISOString(),
        });
      }

      await refresh();

      return nextContent?.techniques.find((technique) =>
        technique.technique_key === techniqueKey
      )?.generated_result ?? null;
    } catch (error) {
      console.error("[useLabCards] generateTechnique failed:", await formatFunctionError(error));
      return null;
    } finally {
      setGeneratingTechniqueKey(null);
    }
  }, [attackCard, generatingTechniqueKey, refresh, runAttackGeneration]);

  const analyzeTechniqueAdjustment = useCallback(async (
    currentTechniqueKey: AttackTechniqueKey,
    failureReasonKey: AttackTechniqueAdjustmentReasonKey,
    failureNotes: string,
  ): Promise<AttackTechniqueAdjustmentAnalysis | null> => {
    if (!attackCard || analyzingTechniqueKey) return null;

    setAnalyzingTechniqueKey(currentTechniqueKey);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-attack-technique-adjustment-v1", {
        body: {
          attack_card_id: attackCard.id,
          current_technique_key: currentTechniqueKey,
          failure_reason_key: failureReasonKey,
          failure_notes: failureNotes.trim() || null,
        },
      });
      if (error) throw error;

      const recommendationReason = typeof data?.recommendation_reason === "string"
        ? data.recommendation_reason.trim()
        : "";
      const decision = data?.decision === "change" ? "change" : "refine";
      const recommendedTechniqueKey = typeof data?.recommended_technique_key === "string"
        ? data.recommended_technique_key as AttackTechniqueKey
        : null;
      const diagnosticQuestions = Array.isArray(data?.diagnostic_questions)
        ? data.diagnostic_questions.filter((item: unknown): item is string =>
          typeof item === "string" && item.trim().length > 0
        ).slice(0, 2)
        : [];

      if (!recommendedTechniqueKey || !recommendationReason) {
        throw new Error("Invalid adjustment analysis payload");
      }

      return {
        decision,
        recommendedTechniqueKey,
        recommendationReason,
        diagnosticQuestions,
      };
    } catch (error) {
      console.error("[useLabCards] analyzeTechniqueAdjustment failed:", await formatFunctionError(error));
      return null;
    } finally {
      setAnalyzingTechniqueKey(null);
    }
  }, [attackCard, analyzingTechniqueKey]);

  return {
    loading,
    generatingAttack,
    generatingTechniqueKey,
    analyzingTechniqueKey,
    attackCard,
    generateAttack,
    regenerateAttack,
    generateTechnique,
    analyzeTechniqueAdjustment,
    refresh,
  };
}

function extractAttackCardContent(value: unknown): AttackCardContent | null {
  if (!isRecord(value) || !isRecord(value.content)) return null;
  return value.content as AttackCardContent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function formatFunctionError(error: unknown): Promise<unknown> {
  if (!error || typeof error !== "object") return error;

  const maybeContext = (error as { context?: unknown }).context;
  if (maybeContext instanceof Response) {
    try {
      const body = await maybeContext.clone().json() as Record<string, unknown>;
      return {
        ...error,
        function_status: maybeContext.status,
        function_body: body,
      };
    } catch {
      try {
        const text = await maybeContext.clone().text();
        return {
          ...error,
          function_status: maybeContext.status,
          function_body: text,
        };
      } catch {
        return error;
      }
    }
  }

  return error;
}
