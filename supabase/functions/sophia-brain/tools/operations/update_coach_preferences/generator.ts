import type {
  CoachPreferenceKey,
  CoachPreferencesPatchBuilderInput,
} from "../_shared/operation_payload_builder.ts";
import { COACH_PREFERENCE_VALUES } from "./workflow.ts";

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

function normalizePreferenceEvidenceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function summaryForPatch(
  key: CoachPreferenceKey,
  value: string,
  evidenceText = "",
): string {
  const evidence = normalizePreferenceEvidenceText(evidenceText);
  if (key === "coach.question_tendency" && value === "low") {
    if (
      /\bune action\b/.test(evidence) ||
      /\baction concrete\b/.test(evidence) ||
      /\bpas trois options\b/.test(evidence) ||
      /\bpas 3 options\b/.test(evidence)
    ) {
      return "je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué.";
    }
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
  if (key === "coach.challenge_level" && value === "high") {
    return "je te challengerai davantage quand tu demandes un vrai coup de lucidité.";
  }
  if (key === "coach.challenge_level" && value === "low") {
    return "je garderai le challenge plus léger et moins frontal.";
  }
  return `j'utiliserai ${labelForPatch(key, value)}.`;
}

function confirmationForPatch(summary: string): string {
  return `Bien reçu. Pour la suite, ${summary} Si c'est bien ça, je le garde comme préférence.`;
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
  if (Object.keys(input.requested_patch).length > 1) {
    throw new Error("coach_preferences_too_many_inferred_keys");
  }
  const [rawKey, rawValue] = Object.entries(input.requested_patch)[0];
  const key = rawKey as CoachPreferenceKey;
  const value = normalizeCoachPreferenceValue(key, rawValue);
  if (!value) throw new Error("coach_preferences_unsupported_value");
  const patch = { [key]: value } as Partial<Record<CoachPreferenceKey, string>>;
  const reason = input.reason?.evidence?.[0] ?? null;
  const summary = summaryForPatch(key, value, reason ?? "");
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
