import { useCallback, useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import { extractPhase1Payload } from "../lib/phase1";
import type {
  Phase1Payload,
  UserTransformationRow,
} from "../types/v2";

type Phase1RuntimePatch = {
  story_viewed_or_validated?: boolean;
  deep_why_answered?: boolean;
};

const PHASE1_PREWARM_COOLDOWN_MS = 45_000;

function getPhase1PrewarmStorageKey(transformationId: string): string {
  return `sophia:phase1_prewarm_started_at:${transformationId}`;
}

function readPhase1PrewarmCooldownUntil(
  transformationId: string | null,
): number | null {
  if (!transformationId || typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(
      getPhase1PrewarmStorageKey(transformationId),
    );
    const startedAt = Number(rawValue);
    if (!Number.isFinite(startedAt) || startedAt <= 0) return null;

    const cooldownUntil = startedAt + PHASE1_PREWARM_COOLDOWN_MS;
    if (cooldownUntil <= Date.now()) {
      window.sessionStorage.removeItem(
        getPhase1PrewarmStorageKey(transformationId),
      );
      return null;
    }

    return cooldownUntil;
  } catch {
    return null;
  }
}

function markPhase1PrewarmStarted(transformationId: string): number {
  const startedAt = Date.now();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        getPhase1PrewarmStorageKey(transformationId),
        String(startedAt),
      );
    } catch {
      // ignore sessionStorage failures
    }
  }
  return startedAt + PHASE1_PREWARM_COOLDOWN_MS;
}

export type UsePhase1Result = {
  phase1: Phase1Payload | null;
  preparingStart: boolean;
  phase1StartCooldownActive: boolean;
  preparingDeepWhy: boolean;
  preparingStory: boolean;
  savingDeepWhy: boolean;
  updatingRuntime: boolean;
  prepareStart: (options?: { force?: boolean }) => Promise<void>;
  prepareDeepWhy: () => Promise<void>;
  prepareStory: (detailsAnswer?: string | null) => Promise<void>;
  saveDeepWhyAnswers: (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => Promise<void>;
  updateRuntime: (patch: Phase1RuntimePatch) => Promise<void>;
  markStoryViewed: () => Promise<void>;
};

export function usePhase1(
  transformation: UserTransformationRow | null,
  refetch: () => Promise<void>,
): UsePhase1Result {
  const [preparingStart, setPreparingStart] = useState(false);
  const [phase1PrewarmCooldownUntil, setPhase1PrewarmCooldownUntil] = useState<number | null>(null);
  const [preparingDeepWhy, setPreparingDeepWhy] = useState(false);
  const [preparingStory, setPreparingStory] = useState(false);
  const [savingDeepWhy, setSavingDeepWhy] = useState(false);
  const [updatingRuntime, setUpdatingRuntime] = useState(false);

  const phase1 = extractPhase1Payload(transformation?.handoff_payload ?? null);
  const transformationId = transformation?.id ?? null;
  const phase1StartCooldownActive = Boolean(
    phase1PrewarmCooldownUntil && phase1PrewarmCooldownUntil > Date.now(),
  );

  useEffect(() => {
    setPhase1PrewarmCooldownUntil(
      readPhase1PrewarmCooldownUntil(transformationId),
    );
  }, [transformationId]);

  useEffect(() => {
    if (!phase1PrewarmCooldownUntil) return;

    const remainingMs = phase1PrewarmCooldownUntil - Date.now();
    if (remainingMs <= 0) {
      setPhase1PrewarmCooldownUntil(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPhase1PrewarmCooldownUntil(null);
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [phase1PrewarmCooldownUntil]);

  const prepareStart = useCallback(async (options?: { force?: boolean }) => {
    if (!transformationId || preparingStart) return;
    if (!options?.force) {
      const cooldownUntil = readPhase1PrewarmCooldownUntil(transformationId);
      if (cooldownUntil && cooldownUntil > Date.now()) {
        setPhase1PrewarmCooldownUntil(cooldownUntil);
        return;
      }
    }

    setPhase1PrewarmCooldownUntil(markPhase1PrewarmStarted(transformationId));
    setPreparingStart(true);
    try {
      const { error } = await supabase.functions.invoke("prepare-phase-1-deep-why-v1", {
        body: { transformation_id: transformationId },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[usePhase1] prepareStart failed:", error);
    } finally {
      setPreparingStart(false);
    }
  }, [preparingStart, refetch, transformationId]);

  const prepareDeepWhy = useCallback(async () => {
    if (!transformationId || preparingDeepWhy) return;
    setPreparingDeepWhy(true);
    try {
      const { error } = await supabase.functions.invoke("prepare-phase-1-deep-why-v1", {
        body: { transformation_id: transformationId },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[usePhase1] prepareDeepWhy failed:", error);
    } finally {
      setPreparingDeepWhy(false);
    }
  }, [preparingDeepWhy, refetch, transformationId]);

  const prepareStory = useCallback(async (detailsAnswer?: string | null) => {
    if (!transformationId || preparingStory) return;
    setPreparingStory(true);
    try {
      const { error } = await supabase.functions.invoke("prepare-phase-1-story-v1", {
        body: {
          transformation_id: transformationId,
          details_answer: detailsAnswer?.trim() || undefined,
        },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[usePhase1] prepareStory failed:", error);
    } finally {
      setPreparingStory(false);
    }
  }, [preparingStory, refetch, transformationId]);

  const saveDeepWhyAnswers = useCallback(async (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => {
    if (!transformationId || answers.length === 0 || savingDeepWhy) return;
    const questions = phase1?.deep_why?.questions ?? [];
    const answersByQuestionId = new Map(
      answers.map((item) => [item.questionId, item.answer.trim()]),
    );
    const shouldPrepareStory = questions.length > 0 &&
      questions.every((question) => Boolean(answersByQuestionId.get(question.id)));

    setSavingDeepWhy(true);
    try {
      const { error } = await supabase.functions.invoke("save-phase-1-deep-why-answer-v1", {
        body: {
          transformation_id: transformationId,
          answers: answers.map((item) => ({
            question_id: item.questionId,
            question: item.question,
            answer: item.answer,
          })),
        },
      });
      if (error) throw error;

      // Refresh as soon as the deep why is saved so the UI can move
      // immediately to the story-loading state instead of waiting for the
      // story generation request to complete.
      await refetch();

      if (shouldPrepareStory) {
        setPreparingStory(true);
        try {
          const { error: storyError } = await supabase.functions.invoke("prepare-phase-1-story-v1", {
            body: {
              transformation_id: transformationId,
            },
          });
          if (storyError) throw storyError;
          await refetch();
        } finally {
          setPreparingStory(false);
        }
      }
    } catch (error) {
      console.error("[usePhase1] saveDeepWhyAnswers failed:", error);
    } finally {
      setSavingDeepWhy(false);
    }
  }, [phase1?.deep_why?.questions, refetch, savingDeepWhy, transformationId]);

  const updateRuntime = useCallback(async (patch: Phase1RuntimePatch) => {
    if (!transformationId || updatingRuntime) return;
    setUpdatingRuntime(true);
    try {
      const { error } = await supabase.functions.invoke("update-phase-1-runtime-v1", {
        body: {
          transformation_id: transformationId,
          ...patch,
        },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[usePhase1] updateRuntime failed:", error);
    } finally {
      setUpdatingRuntime(false);
    }
  }, [refetch, transformationId, updatingRuntime]);

  const markStoryViewed = useCallback(async () => {
    if (phase1?.runtime.story_viewed_or_validated) return;
    await updateRuntime({ story_viewed_or_validated: true });
  }, [phase1?.runtime.story_viewed_or_validated, updateRuntime]);

  return {
    phase1,
    preparingStart,
    phase1StartCooldownActive,
    preparingDeepWhy,
    preparingStory,
    savingDeepWhy,
    updatingRuntime,
    prepareStart,
    prepareDeepWhy,
    prepareStory,
    saveDeepWhyAnswers,
    updateRuntime,
    markStoryViewed,
  };
}
