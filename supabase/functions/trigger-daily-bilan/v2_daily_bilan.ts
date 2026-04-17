import {
  type DailyBilanDecision,
  decideDailyBilan,
} from "../_shared/v2-daily-bilan-decider.ts";
import type {
  CurrentPhaseRuntimeContext,
  PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import type {
  ConversationPulse,
  DailyBilanOutput,
  MomentumStateV2,
} from "../_shared/v2-types.ts";

export const DAILY_BILAN_V2_EVENT_CONTEXT = "daily_bilan_v2";

export const DAILY_BILAN_ACTIVE_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
  "sent",
] as const;

export type PreparedDailyBilanV2Checkin = {
  eventContext: string;
  decision: DailyBilanDecision;
  output: DailyBilanOutput;
  targetItems: PlanItemRuntimeRow[];
  draftMessage: string;
  messagePayload: Record<string, unknown>;
};

export type PrepareDailyBilanV2CheckinInput = {
  planItemsRuntime: PlanItemRuntimeRow[];
  momentum: MomentumStateV2;
  conversationPulse?: ConversationPulse | null;
  localDayOfWeek?: string | null;
  nowIso?: string;
  phaseContext?: CurrentPhaseRuntimeContext | null;
};

function formatTargetLabel(items: PlanItemRuntimeRow[]): string {
  const titles = items
    .map((item) => String(item.title ?? "").trim())
    .filter(Boolean);

  if (titles.length === 0) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} et ${titles[1]}`;
  return `${titles[0]}, ${titles[1]} et ${titles.length - 2} autres`;
}

export function buildDailyBilanV2DraftMessage(args: {
  output: DailyBilanOutput;
  targetItems: PlanItemRuntimeRow[];
}): string {
  const targetLabel = formatTargetLabel(args.targetItems);

  switch (args.output.mode) {
    case "check_supportive":
      return targetLabel
        ? `Petit point doux sur ${targetLabel}. De quoi tu aurais le plus besoin là maintenant ?`
        : "Petit point doux aujourd'hui. De quoi tu aurais le plus besoin là maintenant ?";
    case "check_blocker":
      return targetLabel
        ? `Petit point sur ${targetLabel}. Qu'est-ce qui bloque le plus en ce moment ?`
        : "Petit point rapide. Qu'est-ce qui bloque le plus en ce moment ?";
    case "check_progress":
      return targetLabel
        ? `J'ai l'impression qu'il y a de l'élan sur ${targetLabel}. Qu'est-ce qui a le plus avancé ?`
        : "J'ai l'impression qu'il y a un peu d'élan. Qu'est-ce qui a le plus avancé ?";
    case "check_light":
    default:
      return targetLabel
        ? `Petit point rapide sur ${targetLabel}. Ça s'est passé comment aujourd'hui ?`
        : "Petit point rapide. Ça s'est passé comment aujourd'hui ?";
  }
}

export function buildDailyBilanV2MessagePayload(args: {
  decision: DailyBilanDecision;
  targetItems: PlanItemRuntimeRow[];
  momentum: MomentumStateV2;
  conversationPulse?: ConversationPulse | null;
  localDayOfWeek?: string | null;
  nowIso?: string;
  phaseContext?: CurrentPhaseRuntimeContext | null;
}): Record<string, unknown> {
  return {
    source: "trigger_daily_bilan:v2",
    daily_bilan_version: 2,
    mode: args.decision.output.mode,
    decision_reason: args.decision.reason,
    deterministic: args.decision.deterministic,
    target_item_ids: args.targetItems.map((item) => item.id),
    target_item_titles: args.targetItems.map((item) => item.title),
    target_item_dimensions: args.targetItems.map((item) => item.dimension),
    target_item_kinds: args.targetItems.map((item) => item.kind),
    daily_bilan_output: args.decision.output,
    momentum_state_v2: {
      current_state: args.momentum.current_state,
      state_reason: args.momentum.state_reason,
      posture: args.momentum.posture.recommended_posture,
      emotional_load: args.momentum.dimensions.emotional_load.level,
      execution_traction: args.momentum.dimensions.execution_traction.level,
      engagement: args.momentum.dimensions.engagement.level,
      consent: args.momentum.dimensions.consent.level,
      plan_fit: args.momentum.dimensions.plan_fit.level,
      load_balance: args.momentum.dimensions.load_balance.level,
      active_load: args.momentum.active_load,
      blockers: args.momentum.blockers,
      assessment: args.momentum.assessment,
      updated_at: args.momentum.updated_at,
    },
    conversation_pulse: args.conversationPulse
      ? {
        generated_at: args.conversationPulse.generated_at,
        dominant_tone: args.conversationPulse.tone.dominant,
        emotional_load: args.conversationPulse.tone.emotional_load,
        relational_openness: args.conversationPulse.tone.relational_openness,
        likely_need: args.conversationPulse.signals.likely_need,
        proactive_risk: args.conversationPulse.signals.proactive_risk,
      }
      : null,
    phase_context: args.phaseContext
      ? {
        current_phase_title: args.phaseContext.current_phase_title,
        current_phase_order: args.phaseContext.current_phase_order,
        total_phases: args.phaseContext.total_phases,
        heartbeat_title: args.phaseContext.heartbeat_title,
        heartbeat_current: args.phaseContext.heartbeat_current,
        heartbeat_target: args.phaseContext.heartbeat_target,
        heartbeat_progress_ratio: args.phaseContext.heartbeat_progress_ratio,
        heartbeat_almost_reached: args.phaseContext.heartbeat_almost_reached,
        heartbeat_reached: args.phaseContext.heartbeat_reached,
        transition_ready: args.phaseContext.transition_ready,
        current_phase_completion_ratio:
          args.phaseContext.current_phase_completion_ratio,
      }
      : null,
    local_day_of_week: args.localDayOfWeek ?? null,
    generated_at: args.nowIso ?? new Date().toISOString(),
  };
}

export function prepareDailyBilanV2Checkin(
  input: PrepareDailyBilanV2CheckinInput,
): PreparedDailyBilanV2Checkin {
  const decision = decideDailyBilan({
    planItemsRuntime: input.planItemsRuntime,
    momentum: input.momentum,
    conversationPulse: input.conversationPulse,
    localDayOfWeek: input.localDayOfWeek,
    nowIso: input.nowIso,
  });

  const targetIdSet = new Set(decision.output.target_items);
  const targetItems = input.planItemsRuntime.filter((item) =>
    targetIdSet.has(item.id)
  );
  const draftMessage = buildDailyBilanV2DraftMessage({
    output: decision.output,
    targetItems,
  });

  return {
    eventContext: DAILY_BILAN_V2_EVENT_CONTEXT,
    decision,
    output: decision.output,
    targetItems,
    draftMessage,
    messagePayload: buildDailyBilanV2MessagePayload({
      decision,
      targetItems,
      momentum: input.momentum,
      conversationPulse: input.conversationPulse,
      localDayOfWeek: input.localDayOfWeek,
      nowIso: input.nowIso,
      phaseContext: input.phaseContext,
    }),
  };
}
