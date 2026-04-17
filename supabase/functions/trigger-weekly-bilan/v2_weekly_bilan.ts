import {
  buildWeeklyBilanV2Input,
  type WeeklyBilanV2Input,
} from "../_shared/v2-prompts/weekly-recalibrage.ts";
import {
  parseWeeklyBilanLLMResponse,
  type WeeklyBilanValidationResult,
} from "../_shared/v2-weekly-bilan-engine.ts";
import type {
  CurrentPhaseRuntimeContext,
  PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import type {
  ConversationPulse,
  MomentumStateV2,
  WeeklyConversationDigest,
  WeeklyBilanOutput,
} from "../_shared/v2-types.ts";

export const WEEKLY_BILAN_V2_EVENT_CONTEXT = "weekly_bilan_v2";

export const WEEKLY_BILAN_ACTIVE_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
  "sent",
] as const;

export type PreparedWeeklyBilanV2Checkin = {
  eventContext: string;
  input: WeeklyBilanV2Input;
  validation: WeeklyBilanValidationResult;
  output: WeeklyBilanOutput;
  draftMessage: string;
  messagePayload: Record<string, unknown>;
};

export type PrepareWeeklyBilanV2CheckinInput = {
  planItemsRuntime: PlanItemRuntimeRow[];
  phaseContext?: CurrentPhaseRuntimeContext | null;
  momentum: MomentumStateV2;
  conversationPulse?: ConversationPulse | null;
  conversationPulseId?: string | null;
  weeklyDigest?: WeeklyConversationDigest | null;
  weeklyDigestId?: string | null;
  weekStart: string;
  nowIso?: string;
  llmResponseText: string;
};

function extractUuidFromText(text: string): string | null {
  const match = String(text ?? "").match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1] ?? null;
}

function joinFrench(items: string[]): string {
  const clean = items.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean.at(-1)}`;
}

function describeAdjustment(
  adjustment: WeeklyBilanOutput["load_adjustments"][number],
  titleById: Map<string, string>,
): string {
  const targetTitle = titleById.get(adjustment.target_item_id) ??
    "cet item";

  switch (adjustment.type) {
    case "activate":
      return `activer ${targetTitle}`;
    case "deactivate":
      return `désactiver ${targetTitle}`;
    case "maintenance":
      return `passer ${targetTitle} en maintenance`;
    case "replace": {
      const replacementId = extractUuidFromText(adjustment.reason);
      const replacementTitle = replacementId
        ? (titleById.get(replacementId) ?? "un autre item")
        : "un autre item";
      return `remplacer ${targetTitle} par ${replacementTitle}`;
    }
  }
}

function decisionLine(output: WeeklyBilanOutput): string {
  switch (output.decision) {
    case "expand":
      return "Pour la semaine qui vient, on peut ouvrir un cran de plus.";
    case "consolidate":
      return "Pour la semaine qui vient, l'idée est surtout de stabiliser ce qui prend.";
    case "reduce":
      return "Pour la semaine qui vient, on allège pour remettre de l'air.";
    case "hold":
    default:
      return "Pour la semaine qui vient, on garde le cap sans charger plus.";
  }
}

function postureLine(output: WeeklyBilanOutput): string {
  switch (output.suggested_posture_next_week) {
    case "lighter":
      return "Posture: plus léger, plus simple.";
    case "support_first":
      return "Posture: soutien d'abord, exigence ensuite.";
    case "reengage":
      return "Posture: on rouvre la porte doucement.";
    case "steady":
    default:
      return "Posture: stable et tenable.";
  }
}

export function assembleWeeklyBilanV2Input(args: {
  planItemsRuntime: PlanItemRuntimeRow[];
  phaseContext?: CurrentPhaseRuntimeContext | null;
  momentum: MomentumStateV2;
  conversationPulse?: ConversationPulse | null;
  weeklyDigest?: WeeklyConversationDigest | null;
  nowIso?: string;
}): WeeklyBilanV2Input {
  const nowMs = args.nowIso ? new Date(args.nowIso).getTime() : undefined;
  return buildWeeklyBilanV2Input(
    args.planItemsRuntime,
    args.momentum,
    args.conversationPulse,
    nowMs,
    args.weeklyDigest,
    args.phaseContext,
  );
}

export function buildWeeklyBilanDecisionBullets(args: {
  output: WeeklyBilanOutput;
  planItemsRuntime: PlanItemRuntimeRow[];
}): string[] {
  const titleById = new Map(
    args.planItemsRuntime.map((item) => [item.id, item.title]),
  );

  const bullets: string[] = [];
  bullets.push(
    args.output.decision === "expand"
      ? "On ouvre un peu plus la semaine prochaine."
      : args.output.decision === "consolidate"
      ? "On consolide ce qui tient déjà."
      : args.output.decision === "reduce"
      ? "On réduit la charge pour retrouver de la marge."
      : "On garde la même charge pour la semaine prochaine.",
  );

  for (const adjustment of args.output.load_adjustments) {
    bullets.push(
      `${describeAdjustment(adjustment, titleById)}.`,
    );
  }

  return bullets.slice(0, 4);
}

export function buildWeeklyBilanV2DraftMessage(args: {
  output: WeeklyBilanOutput;
  planItemsRuntime: PlanItemRuntimeRow[];
}): string {
  const titleById = new Map(
    args.planItemsRuntime.map((item) => [item.id, item.title]),
  );
  const lines: string[] = [];
  const wins = args.output.retained_wins.slice(0, 3);
  const blockers = args.output.retained_blockers.slice(0, 2);

  if (wins.length > 0) {
    lines.push(`Cette semaine, tu as quand même tenu ${joinFrench(wins)}.`);
  } else {
    lines.push(
      "Cette semaine a été plus discrète, et c'est une info utile aussi.",
    );
  }

  lines.push(decisionLine(args.output));

  if (blockers.length > 0) {
    lines.push(`Les frottements qui reviennent: ${joinFrench(blockers)}.`);
  }

  if (args.output.load_adjustments.length > 0) {
    const changes = args.output.load_adjustments.map((adjustment) =>
      describeAdjustment(adjustment, titleById)
    );
    lines.push(`Ajustements retenus: ${joinFrench(changes)}.`);
  }

  lines.push(postureLine(args.output));

  if (args.output.coaching_note) {
    lines.push(args.output.coaching_note.trim());
  }

  return lines.join(" ");
}

export function buildWeeklyBilanV2MessagePayload(args: {
  input: WeeklyBilanV2Input;
  output: WeeklyBilanOutput;
  validation: WeeklyBilanValidationResult;
  weekStart: string;
  conversationPulseId?: string | null;
  weeklyDigestId?: string | null;
  nowIso?: string;
}): Record<string, unknown> {
  return {
    source: "trigger_weekly_bilan:v2",
    weekly_bilan_version: 2,
    week_start: args.weekStart,
    decision: args.output.decision,
    adjustment_count: args.output.load_adjustments.length,
    weekly_bilan_input: args.input,
    weekly_bilan_output: args.output,
    conversation_pulse_id: args.conversationPulseId ?? null,
    weekly_digest_id: args.weeklyDigestId ?? null,
    validation: args.validation.valid ? { valid: true } : {
      valid: false,
      violations: args.validation.violations,
    },
    generated_at: args.nowIso ?? new Date().toISOString(),
  };
}

export function prepareWeeklyBilanV2Checkin(
  input: PrepareWeeklyBilanV2CheckinInput,
): PreparedWeeklyBilanV2Checkin {
  const assembledInput = assembleWeeklyBilanV2Input({
    planItemsRuntime: input.planItemsRuntime,
    phaseContext: input.phaseContext,
    momentum: input.momentum,
    conversationPulse: input.conversationPulse,
    weeklyDigest: input.weeklyDigest,
    nowIso: input.nowIso,
  });
  const validation = parseWeeklyBilanLLMResponse(
    input.llmResponseText,
    assembledInput,
  );
  const output = validation.output;

  return {
    eventContext: WEEKLY_BILAN_V2_EVENT_CONTEXT,
    input: assembledInput,
    validation,
    output,
    draftMessage: buildWeeklyBilanV2DraftMessage({
      output,
      planItemsRuntime: input.planItemsRuntime,
    }),
    messagePayload: buildWeeklyBilanV2MessagePayload({
      input: assembledInput,
      output,
      validation,
      weekStart: input.weekStart,
      conversationPulseId: input.conversationPulseId,
      weeklyDigestId: input.weeklyDigestId,
      nowIso: input.nowIso,
    }),
  };
}
