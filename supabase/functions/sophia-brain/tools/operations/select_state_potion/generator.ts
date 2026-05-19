import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import {
  formatPotionBaseContextForPrompt,
  type PotionBaseContext,
} from "../../../../_shared/potion-base-context.ts";
import type { PotionSessionSelectorInput } from "../_shared/operation_payload_builder.ts";
import { buildStatePotionCatalogPrompt } from "./catalog.ts";
import { buildPotionFollowUpSchedulePlannerPrompt } from "./subskills/follow_up_schedule_planner.ts";

export type StatePotionTargetBinding = {
  kind:
    | "none"
    | "one_off_action"
    | "recurring_action"
    | "plan_item"
    | "action_family";
  label: string | null;
  related_plan_item_id: string | null;
  target_plan_item_id: string | null;
  target_action_family_key: string | null;
  target_generated_temp_id: string | null;
  recurrence_hint: string | null;
  date_or_window_hint: string | null;
  evidence: string[];
};

export type StatePotionSchedulePlan = {
  mode:
    | "daily_series"
    | "specific_dates"
    | "specific_weekdays"
    | "single_before_event";
  duration_days: number | null;
  local_time_hhmm: string;
  scheduled_days: string[];
  local_dates: string[];
  timing_relation: "before" | "during" | "after" | "daily";
  reason: string;
};

export type PotionSessionDraftV1 = {
  operation_type: "select_state_potion";
  output_schema: "potion_session_draft_v1";
  draft: {
    potion_type: PotionSessionSelectorInput["potion_type"];
    title: string;
    opening_prompt: string;
    instant_support_message: string;
    potion_info_message: string;
    expected_duration: "short";
    why_this_potion: string;
    target_binding: StatePotionTargetBinding;
    follow_up: {
      reminder_instruction: string;
      local_time_hhmm: string;
      duration_days: number;
      reason_for_time: string;
      schedule_plan: StatePotionSchedulePlan;
    };
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export type PotionSessionDraftGeneratorInput = PotionSessionSelectorInput & {
  user_id?: string | null;
  request_id?: string | null;
  base_context?: PotionBaseContext | null;
};

export type PotionSessionDraftGenerator = (
  input: PotionSessionDraftGeneratorInput,
) => Promise<PotionSessionDraftV1 | null>;

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("potion_draft_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("potion_draft_not_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function potionType(
  value: unknown,
): PotionSessionSelectorInput["potion_type"] | null {
  const raw = text(value);
  return [
      "rappel",
      "courage",
      "guerison",
      "clarte",
      "amour",
      "apaisement",
    ].includes(raw)
    ? raw as PotionSessionSelectorInput["potion_type"]
    : null;
}

function timeString(value: unknown): string | null {
  const raw = text(value);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  return match ? raw : null;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = text(value);
  return allowed.includes(raw as T) ? raw as T : fallback;
}

function optionalText(value: unknown): string | null {
  const raw = text(value);
  return raw || null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean).slice(0, 14)
    : [];
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function weekdayList(value: unknown): string[] {
  return stringList(value).filter((day) =>
    (WEEKDAYS as readonly string[]).includes(day)
  );
}

function localDateList(value: unknown): string[] {
  return stringList(value).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function durationDays(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  return Number.isFinite(raw)
    ? Math.max(1, Math.min(14, Math.trunc(raw)))
    : fallback;
}

function normalizeTargetBinding(raw: unknown): StatePotionTargetBinding {
  const target = objectValue(raw);
  return {
    kind: enumValue(
      target?.kind,
      [
        "none",
        "one_off_action",
        "recurring_action",
        "plan_item",
        "action_family",
      ] as const,
      "none",
    ),
    label: optionalText(target?.label),
    related_plan_item_id: optionalText(target?.related_plan_item_id),
    target_plan_item_id: optionalText(target?.target_plan_item_id),
    target_action_family_key: optionalText(target?.target_action_family_key),
    target_generated_temp_id: optionalText(target?.target_generated_temp_id),
    recurrence_hint: optionalText(target?.recurrence_hint),
    date_or_window_hint: optionalText(target?.date_or_window_hint),
    evidence: stringList(target?.evidence),
  };
}

function normalizeSchedulePlan(
  raw: unknown,
  fallbackLocalTime: string,
  fallbackDurationDays: number,
): StatePotionSchedulePlan {
  const schedule = objectValue(raw);
  const mode = enumValue(
    schedule?.mode,
    [
      "daily_series",
      "specific_dates",
      "specific_weekdays",
      "single_before_event",
    ] as const,
    "daily_series",
  );
  const localTime = timeString(schedule?.local_time_hhmm) ?? fallbackLocalTime;
  const normalized: StatePotionSchedulePlan = {
    mode,
    duration_days: mode === "single_before_event"
      ? null
      : durationDays(schedule?.duration_days, fallbackDurationDays),
    local_time_hhmm: localTime,
    scheduled_days: weekdayList(schedule?.scheduled_days),
    local_dates: localDateList(schedule?.local_dates),
    timing_relation: enumValue(
      schedule?.timing_relation,
      [
        "before",
        "during",
        "after",
        "daily",
      ] as const,
      mode === "daily_series" ? "daily" : "before",
    ),
    reason: text(schedule?.reason) || "Suivi court adapte a cette potion.",
  };
  if (mode === "daily_series") {
    normalized.scheduled_days = [];
    normalized.local_dates = [];
  }
  return normalized;
}

function assertSchedulePlanIsUsable(plan: StatePotionSchedulePlan) {
  if (!timeString(plan.local_time_hhmm)) {
    throw new Error("potion_schedule_time_invalid");
  }
  if (
    (plan.mode === "specific_dates" || plan.mode === "single_before_event") &&
    plan.local_dates.length === 0
  ) {
    throw new Error("potion_schedule_dates_missing");
  }
  if (plan.mode === "specific_weekdays" && plan.scheduled_days.length === 0) {
    throw new Error("potion_schedule_weekdays_missing");
  }
}

export function normalizePotionSessionDraft(
  raw: unknown,
  input: PotionSessionSelectorInput,
): PotionSessionDraftV1 {
  if (input.operation_type !== "select_state_potion") {
    throw new Error("potion_operation_type_invalid");
  }
  if (!input.state.kind || !input.potion_type) {
    throw new Error("potion_state_or_type_missing");
  }
  const root = parseJsonObject(raw);
  const draftRoot = objectValue(root.draft);
  const followUp = objectValue(draftRoot?.follow_up);
  const targetBinding = normalizeTargetBinding(draftRoot?.target_binding);
  const normalizedPotionType = potionType(draftRoot?.potion_type) ??
    input.potion_type;
  const title = text(draftRoot?.title);
  const openingPrompt = text(draftRoot?.opening_prompt);
  const instantSupportMessage = text(draftRoot?.instant_support_message);
  const potionInfoMessage = text(draftRoot?.potion_info_message);
  const whyThisPotion = text(draftRoot?.why_this_potion);
  const reminderInstruction = text(followUp?.reminder_instruction);
  const localTime = timeString(followUp?.local_time_hhmm);
  const normalizedDurationDays = durationDays(followUp?.duration_days, 7);
  const reasonForTime = text(followUp?.reason_for_time);
  const schedulePlan = normalizeSchedulePlan(
    followUp?.schedule_plan,
    localTime ?? "09:00",
    normalizedDurationDays,
  );
  const confirmationMessage = text(root.confirmation_message);
  assertSchedulePlanIsUsable(schedulePlan);
  if (
    normalizedPotionType !== input.potion_type ||
    !title ||
    !openingPrompt ||
    !instantSupportMessage ||
    !potionInfoMessage ||
    !whyThisPotion ||
    !reminderInstruction ||
    !localTime ||
    !reasonForTime ||
    !confirmationMessage
  ) {
    throw new Error("potion_draft_invalid");
  }
  return {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    draft: {
      potion_type: normalizedPotionType,
      title,
      opening_prompt: openingPrompt,
      instant_support_message: instantSupportMessage,
      potion_info_message: potionInfoMessage,
      expected_duration: "short",
      why_this_potion: whyThisPotion,
      target_binding: targetBinding,
      follow_up: {
        reminder_instruction: reminderInstruction,
        local_time_hhmm: localTime,
        duration_days: normalizedDurationDays,
        reason_for_time: reasonForTime,
        schedule_plan: schedulePlan,
      },
    },
    confirmation_message: confirmationMessage,
    confirmation_actions: ["yes", "no"],
  };
}

export async function generatePotionSessionDraftWithAi(
  input: PotionSessionDraftGeneratorInput,
): Promise<PotionSessionDraftV1 | null> {
  const { base_context: baseContext, ...modelInput } = input;
  const systemPrompt = [
    "Tu es le generator interne du Tool Skill select_state_potion de Sophia.",
    "Tu retournes uniquement un JSON conforme au schema demande.",
    "Tu rediges les messages visibles pour l'utilisateur; le code ne les templatisera pas.",
    "La potion est courte, rassurante, non medicale, sans moralisation et ne remplace jamais la securite.",
    buildStatePotionCatalogPrompt(),
    buildPotionFollowUpSchedulePlannerPrompt(input.potion_type),
    "Le message instant_support_message est le premier message apres activation: il rassure et aide a redescendre maintenant.",
    "Le message potion_info_message est le deuxieme message apres activation: il explique la potion activee et le suivi/reminder qui va etre mis en place.",
    "Utilise le contexte de base DB quand il est fourni, sans inventer de faits absents de ce contexte ou du message user.",
    "confirmation_message presente le draft, inclut le rythme du reminder, et demande une validation explicite avant activation.",
    "Pour courage, clarte et rappel: si le contexte parle d'une action ponctuelle ou recurrente, target_binding et follow_up.schedule_plan doivent refleter cette action au lieu d'un suivi quotidien general.",
    "Si le timing necessaire manque, ne genere pas de draft action-aware incomplet: utilise daily_series seulement si l'etat est vraiment general.",
    "follow_up.local_time_hhmm doit etre au format HH:mm local.",
    "follow_up.duration_days vaut 7 par defaut, mais peut etre plus court quand schedule_plan cible une action ponctuelle ou des jours specifiques.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "generate_state_potion_draft",
    required_json_shape: {
      operation_type: "select_state_potion",
      output_schema: "potion_session_draft_v1",
      draft: {
        potion_type: input.potion_type,
        title: "string",
        opening_prompt: "string",
        instant_support_message: "string",
        potion_info_message: "string",
        expected_duration: "short",
        why_this_potion: "string",
        target_binding: {
          kind: "none|one_off_action|recurring_action|plan_item|action_family",
          label: "string|null",
          related_plan_item_id: "string|null",
          target_plan_item_id: "string|null",
          target_action_family_key: "string|null",
          target_generated_temp_id: "string|null",
          recurrence_hint: "string|null",
          date_or_window_hint: "string|null",
          evidence: ["string"],
        },
        follow_up: {
          reminder_instruction: "string",
          local_time_hhmm: "HH:mm",
          duration_days: "number",
          reason_for_time: "string",
          schedule_plan: {
            mode:
              "daily_series|specific_dates|specific_weekdays|single_before_event",
            duration_days: "number|null",
            local_time_hhmm: "HH:mm",
            scheduled_days: ["mon|tue|wed|thu|fri|sat|sun"],
            local_dates: ["YYYY-MM-DD"],
            timing_relation: "before|during|after|daily",
            reason: "string",
          },
        },
      },
      confirmation_message: "string",
      confirmation_actions: ["yes", "no"],
    },
    base_context: formatPotionBaseContextForPrompt(baseContext),
    input: modelInput,
  });
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.2,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id ?? undefined,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.generator",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePotionSessionDraft(raw, input);
  } catch (error) {
    console.warn("[SelectStatePotion] draft generator failed", error);
    return null;
  }
}
