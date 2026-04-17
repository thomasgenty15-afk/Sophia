import type { Phase1Payload } from "../types/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function extractPhase1Payload(handoffPayload: unknown): Phase1Payload | null {
  if (!isRecord(handoffPayload) || !isRecord(handoffPayload.phase_1)) {
    return null;
  }

  const phase1 = handoffPayload.phase_1;
  if (!isRecord(phase1.context) || !isRecord(phase1.runtime)) {
    return null;
  }

  return phase1 as Phase1Payload;
}

export function isPhase1DeepWhyComplete(phase1: Phase1Payload | null): boolean {
  if (!phase1) return false;
  if (phase1.runtime.deep_why_answered) return true;

  const questions = phase1.deep_why?.questions ?? [];
  if (questions.length === 0) return false;

  const answersByQuestionId = new Map(
    (phase1.deep_why?.answers ?? []).map((item) => [item.question_id, item.answer.trim()]),
  );

  return questions.every((question) => Boolean(answersByQuestionId.get(question.id)));
}

export function getPhase1MandatoryProgress(phase1: Phase1Payload | null): {
  completed: number;
  total: number;
} {
  if (!phase1) {
    return { completed: 0, total: 2 };
  }

  const checks = [
    phase1.runtime.story_viewed_or_validated,
    isPhase1DeepWhyComplete(phase1),
  ];

  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
  };
}
