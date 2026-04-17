import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  materializeUnifiedIntakeForCycle,
  previewUnifiedIntake,
} from "./v2-intake-unified.ts";
import type { UserCycleRow, UserTransformationRow } from "./v2-types.ts";

export async function materializeCycleTransformationsFromIntake(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  rawIntakeText: string;
  cycleId: string | null;
}): Promise<{
  cycle: UserCycleRow;
  needsClarification: boolean;
  clarificationPrompt: string | null;
  transformations: UserTransformationRow[];
  eventWarnings: string[];
}> {
  const result = await materializeUnifiedIntakeForCycle({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    rawIntakeText: params.rawIntakeText,
    cycleId: params.cycleId,
  });

  return {
    cycle: result.cycle,
    needsClarification: result.output.needs_clarification,
    clarificationPrompt: result.output.clarification_prompt,
    transformations: result.transformations,
    eventWarnings: result.eventWarnings,
  };
}

export async function previewTransformationsFromIntake(params: {
  requestId: string;
  userId?: string | null;
  rawIntakeText: string;
}) {
  const output = await previewUnifiedIntake({
    requestId: `${params.requestId}:guest-intake`,
    userId: params.userId ?? null,
    rawIntakeText: params.rawIntakeText,
  });

  if (output.needs_clarification) {
    return {
      cycle_status: "clarification_needed" as const,
      needs_clarification: true,
      clarification_prompt: output.clarification_prompt,
      transformations: [],
    };
  }

  return {
    cycle_status: "prioritized" as const,
    needs_clarification: false,
    clarification_prompt: null,
    transformations: output.transformations.map((transformation) => ({
      id: crypto.randomUUID(),
      cycle_id: "",
      priority_order: transformation.recommended_order,
      recommended_order: transformation.recommended_order,
      recommended_progress_indicator: transformation.recommended_progress_indicator,
      status: "pending" as const,
      title: transformation.title,
      internal_summary: transformation.internal_summary,
      user_summary: transformation.user_summary,
      questionnaire_context: transformation.questionnaire_context,
      questionnaire_schema: null,
      questionnaire_answers: null,
      source_group_index: transformation.source_group_index,
      ordering_rationale: transformation.ordering_rationale,
    })),
  };
}
