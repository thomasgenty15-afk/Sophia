import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { normalizeText, type RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  emptySafetySignal,
  normalizeSafetyRiskBand,
  type SafetyCrisisSnapshot,
  type SafetySignal,
} from "./contract.ts";
import { SAFETY_CRISIS_PROMPT } from "./prompt.ts";

export type SafetyCrisisIntakeInput = {
  user_message: string;
  normalized_user_message: string;
  recent_messages: RunSkillInput["context"]["recent_messages"];
  active_skill_working_state: RunSkillInput["context"][
    "active_skill_working_state"
  ];
  source_risk_band: SafetyCrisisSnapshot["source_risk_band"];
};

export type SafetyCrisisIntakeResult = {
  ok: boolean;
  signals: Partial<SafetySignal>;
  paraphrase?: string | null;
  reason?: string;
};

export type SafetyCrisisIntakeRunner = (
  input: SafetyCrisisIntakeInput,
) => SafetyCrisisIntakeResult | Promise<SafetyCrisisIntakeResult>;

let intakeRunnerForTest: SafetyCrisisIntakeRunner | null = null;

export function setSafetyCrisisIntakeRunnerForTest(
  runner: SafetyCrisisIntakeRunner | null,
) {
  intakeRunnerForTest = runner;
}

export function hasSafetyCrisisIntakeRunnerForTest(): boolean {
  return Boolean(intakeRunnerForTest);
}

function workingState(input: RunSkillInput): SafetyCrisisSnapshot[
  "previous_state"
] {
  const raw = input.context.active_skill_working_state?.working_state;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as SafetyCrisisSnapshot["previous_state"]
    : {};
}

export function buildSafetySnapshot(
  input: RunSkillInput,
): SafetyCrisisSnapshot {
  return {
    user_message: input.user_message,
    normalized_user_message: normalizeText(input.user_message),
    source_message_id: input.context.turn_frame.source_message_id,
    source_risk_band: normalizeSafetyRiskBand(
      input.context.turn_frame.safety.risk_band,
    ),
    previous_state: workingState(input),
  };
}

export function buildSafetyCrisisIntakeInput(args: {
  input: RunSkillInput;
  snapshot: SafetyCrisisSnapshot;
}): SafetyCrisisIntakeInput {
  return {
    user_message: args.input.user_message,
    normalized_user_message: args.snapshot.normalized_user_message,
    recent_messages: args.input.context.recent_messages,
    active_skill_working_state: args.input.context.active_skill_working_state,
    source_risk_band: args.snapshot.source_risk_band,
  };
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function uncertainty(value: unknown): SafetySignal["uncertainty"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "high";
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("safety_crisis_intake_missing_json");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("safety_crisis_intake_invalid_json");
  }
  return parsed as Record<string, unknown>;
}

function normalizeIntakeJson(raw: unknown): SafetyCrisisIntakeResult {
  const parsed = parseJsonObject(raw);
  const signals = emptySafetySignal({
    suicidal_ideation: booleanOrFalse(parsed.suicidal_ideation),
    self_harm_intent: booleanOrFalse(parsed.self_harm_intent),
    immediate_danger: booleanOrNull(parsed.immediate_danger),
    has_means_nearby: booleanOrNull(parsed.has_means_nearby),
    means_moved_away: booleanOrNull(parsed.means_moved_away),
    user_currently_alone: booleanOrNull(parsed.user_currently_alone),
    human_support_available: booleanOrNull(parsed.human_support_available),
    emergency_help_contacted: booleanOrNull(parsed.emergency_help_contacted),
    clarified_non_immediate: booleanOrFalse(parsed.clarified_non_immediate),
    deescalation_evidence: booleanOrFalse(parsed.deescalation_evidence),
    uncertainty: uncertainty(parsed.uncertainty),
  });
  return {
    ok: true,
    signals,
    paraphrase: typeof parsed.paraphrase === "string"
      ? parsed.paraphrase.trim().slice(0, 240) || null
      : null,
  };
}

function compactRecentMessages(
  recentMessages: SafetyCrisisIntakeInput["recent_messages"],
) {
  return recentMessages.slice(-6).map((message) => ({
    role: message.role,
    content: String(message.content ?? "").replace(/\s+/g, " ").trim().slice(
      0,
      240,
    ),
  }));
}

async function defaultSafetyCrisisIntakeRunner(
  input: SafetyCrisisIntakeInput,
): Promise<SafetyCrisisIntakeResult> {
  const userPrompt = JSON.stringify({
    current_user_message: input.user_message,
    normalized_user_message: input.normalized_user_message,
    source_risk_band: input.source_risk_band,
    recent_messages: compactRecentMessages(input.recent_messages),
    active_skill_working_state:
      input.active_skill_working_state?.working_state ?? null,
  });
  const raw = await generateWithGemini(
    SAFETY_CRISIS_PROMPT,
    userPrompt,
    0,
    true,
    [],
    "auto",
    {
      requestId: "safety_crisis_intake",
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "safety_crisis.structured_intake",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 30_000,
      maxRetries: 1,
    },
  );
  return normalizeIntakeJson(raw);
}

export async function runSafetyCrisisStructuredIntake(
  input: SafetyCrisisIntakeInput,
): Promise<SafetyCrisisIntakeResult> {
  try {
    const result = await (intakeRunnerForTest ??
      defaultSafetyCrisisIntakeRunner)(input);
    if (!result.ok) {
      return {
        ok: false,
        signals: emptySafetySignal({ uncertainty: "high" }),
        paraphrase: result.paraphrase ?? null,
        reason: result.reason ?? "safety_crisis_intake_not_ok",
      };
    }
    return {
      ok: true,
      signals: emptySafetySignal(result.signals),
      paraphrase: result.paraphrase ?? null,
      reason: result.reason,
    };
  } catch (error) {
    return {
      ok: false,
      signals: emptySafetySignal({ uncertainty: "high" }),
      reason: error instanceof Error
        ? error.message
        : "safety_crisis_intake_failed",
    };
  }
}
