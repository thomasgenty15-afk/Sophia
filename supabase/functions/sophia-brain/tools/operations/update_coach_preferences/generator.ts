import type {
  CoachPreferenceKey,
  CoachPreferencesPatchBuilderInput,
} from "../_shared/operation_payload_builder.ts";
import type { CoachPreferenceHandoffDraft } from "./contract.ts";
import { COACH_PREFERENCE_VALUES } from "./workflow.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export type CoachPreferencesPatchDraftV1 = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";
  draft: {
    patch: Partial<Record<CoachPreferenceKey, string>>;
    summary: string;
    reason?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

const VALUE_ALIASES: Record<CoachPreferenceKey, Record<string, string>> = {
  "coach.tone": {
    doux: "soft",
    bienveillant_ferme: "warm_direct",
    tres_direct: "direct",
  },
  "coach.challenge_level": {
    leger: "low",
    equilibre: "balanced",
    eleve: "high",
  },
  "coach.question_tendency": {
    peu_de_questions: "low",
    equilibre: "normal",
    tres_questionnant: "high",
  },
};

export function normalizeCoachPreferenceValue(
  key: CoachPreferenceKey,
  value: unknown,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (COACH_PREFERENCE_VALUES[key].includes(raw)) return raw;
  return VALUE_ALIASES[key][raw] ?? null;
}

function labelForPatch(key: CoachPreferenceKey, value: string): string {
  if (key === "coach.tone") {
    return value === "soft"
      ? "un ton plus doux"
      : value === "direct"
      ? "un ton plus direct"
      : "un ton bienveillant et ferme";
  }
  if (key === "coach.challenge_level") {
    return value === "low"
      ? "un niveau de challenge plus léger"
      : value === "high"
      ? "un niveau de challenge plus élevé"
      : "un niveau de challenge équilibré";
  }
  return value === "low"
    ? "moins de questions"
    : value === "high"
    ? "plus de questions"
    : "un niveau de questions équilibré";
}

function settingLabel(key: CoachPreferenceKey): string {
  if (key === "coach.tone") return "Ton global";
  if (key === "coach.challenge_level") return "Niveau de challenge";
  return "Tendance à poser des questions";
}

function readableValueForPatch(key: CoachPreferenceKey, value: string): string {
  if (key === "coach.tone") {
    return value === "soft"
      ? "Doux"
      : value === "direct"
      ? "Très direct"
      : "Bienveillant ferme";
  }
  if (key === "coach.challenge_level") {
    return value === "low" ? "Léger" : value === "high" ? "Élevé" : "Équilibré";
  }
  return value === "low"
    ? "Peu de questions"
    : value === "high"
    ? "Très questionnant"
    : "Équilibré";
}

function summaryForPatch(
  key: CoachPreferenceKey,
  value: string,
): string {
  if (key === "coach.question_tendency" && value === "low") {
    return "je te poserai moins de questions, plus courtes, surtout quand tu es bloqué.";
  }
  if (key === "coach.question_tendency" && value === "high") {
    return "je prendrai plus souvent le temps de te questionner avant de trancher.";
  }
  if (key === "coach.question_tendency") {
    return "je garderai un équilibre entre questions utiles et réponses directes.";
  }
  if (key === "coach.tone" && value === "direct") {
    return "je serai plus directe, sans perdre le côté soutenant.";
  }
  if (key === "coach.tone" && value === "soft") {
    return "je prendrai un ton plus doux quand je te réponds.";
  }
  if (key === "coach.challenge_level" && value === "balanced") {
    return "je garderai un niveau de challenge équilibré.";
  }
  if (key === "coach.challenge_level" && value === "high") {
    return "je te challengerai davantage quand tu demandes un vrai coup de lucidité.";
  }
  if (key === "coach.challenge_level" && value === "low") {
    return "je garderai le challenge plus léger et moins frontal.";
  }
  return `j'utiliserai ${labelForPatch(key, value)}.`;
}

function confirmationForPatch(summary: string): string {
  return `Bien reçu. Pour la suite, réglage recommandé à reprendre dans les Préférences coach : ${summary}`;
}

export function validateCoachPreferencePatch(
  patch: Record<string, unknown>,
): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new Error("coach_preferences_patch_empty");
  for (const key of keys) {
    if (!(key in COACH_PREFERENCE_VALUES)) {
      throw new Error("coach_preferences_unsupported_key");
    }
    if (!normalizeCoachPreferenceValue(key as CoachPreferenceKey, patch[key])) {
      throw new Error("coach_preferences_unsupported_value");
    }
  }
}

export function runCoachPreferencesPatchBuilder(
  input: CoachPreferencesPatchBuilderInput,
): CoachPreferencesPatchDraftV1 {
  validateCoachPreferencePatch(input.requested_patch);
  const reason = input.reason?.evidence?.[0] ?? null;
  const patch: Partial<Record<CoachPreferenceKey, string>> = {};
  const summaries: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(input.requested_patch)) {
    const key = rawKey as CoachPreferenceKey;
    const value = normalizeCoachPreferenceValue(key, rawValue);
    if (!value) throw new Error("coach_preferences_unsupported_value");
    patch[key] = value;
    summaries.push(summaryForPatch(key, value));
  }
  const summary = summaries.join(" ");
  return {
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    draft: {
      patch,
      summary,
      reason,
    },
    confirmation_message: confirmationForPatch(summary),
    confirmation_actions: ["yes", "no"],
  };
}

export function runCoachPreferenceHandoffDraftBuilder(input: {
  user_request_summary: string;
  requested_patch?: Partial<Record<CoachPreferenceKey, string>> | null;
  unsupported_parts?: string[];
  missing_decisions?: string[];
  preference_kind?: CoachPreferenceHandoffDraft["preference_kind"];
}): CoachPreferenceHandoffDraft {
  const handoffTarget = getHandoffTargetForOperation(
    "update_coach_preferences",
  );
  const patch = input.requested_patch ?? {};
  const supported_settings: CoachPreferenceHandoffDraft["supported_settings"] =
    [];
  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey as CoachPreferenceKey;
    const value = normalizeCoachPreferenceValue(key, rawValue);
    if (!value) continue;
    supported_settings.push({
      key,
      label: settingLabel(key),
      recommended_value: readableValueForPatch(key, value),
      explanation: summaryForPatch(key, value),
    });
  }
  const unsupportedParts = (input.unsupported_parts ?? []).filter(Boolean);
  const platformSteps = handoffTarget?.platform_steps ??
    (supported_settings.length
    ? [
      "Ouvre la plateforme.",
      "Va dans Préférences coach.",
      ...supported_settings.map((setting) =>
        `Règle ${setting.label} sur ${setting.recommended_value}.`
      ),
    ]
    : [
      "Ouvre la plateforme.",
      "Va dans Préférences coach pour voir les réglages disponibles.",
    ]);
  return {
    operation_type: "update_coach_preferences",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_request_summary: input.user_request_summary,
    preference_kind: input.preference_kind ??
      (supported_settings.length ? "durable_supported" : "durable_unsupported"),
    supported_settings,
    unsupported_parts: unsupportedParts,
    recommendation: {
      platform_destination: handoffTarget?.user_facing_destination ??
        "dans la plateforme, depuis les Préférences coach",
      platform_steps: platformSteps,
      preserve: ["garder les réponses utiles et concrètes"],
      avoid: unsupportedParts.length
        ? unsupportedParts.map((part) =>
          `stocker comme préférence durable: ${part}`
        )
        : [
          "transformer ça en règle trop rigide sur la longueur, les questions ou le format si ce n'est pas ton intention",
        ],
    },
    missing_decisions: input.missing_decisions ?? [],
  };
}
