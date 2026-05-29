import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";
import {
  COACH_PREFERENCE_VALUES,
  type CoachPreferenceConfidence,
  type CoachPreferenceIntakeState,
  type CoachPreferenceStep,
} from "./workflow.ts";

export type CoachPreferencesSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  current_state?: CoachPreferenceIntakeState | null;
  operation_input?: Record<string, unknown> | null;
  current_preferences?: Partial<Record<CoachPreferenceKey, string>>;
};

export type CoachPreferencesSlotFillerOutput = {
  current_step: CoachPreferenceStep;
  state_patch: Partial<CoachPreferenceIntakeState>;
  missing_slots: string[];
  confidence: CoachPreferenceConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type CoachPreferencesSlotFiller = (
  input: CoachPreferencesSlotFillerInput,
) => Promise<CoachPreferencesSlotFillerOutput | null>;

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
  if (start < 0 || end <= start) {
    throw new Error("coach_preferences_slots_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("coach_preferences_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): CoachPreferenceConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function step(value: unknown): CoachPreferenceStep {
  const raw = String(value ?? "").trim();
  return [
      "preference_resolution",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as CoachPreferenceStep
    : "preference_resolution";
}

function key(value: unknown): CoachPreferenceKey | null {
  const raw = String(value ?? "").trim();
  return raw === "coach.tone" || raw === "coach.challenge_level" ||
      raw === "coach.question_tendency" ||
      raw === "coach.response_max_lines" ||
      raw === "coach.emoji_policy" ||
      raw === "coach.final_question_policy" ||
      raw === "coach.action_first_policy"
    ? raw
    : null;
}

function normalizeStatePatch(
  value: unknown,
): Partial<CoachPreferenceIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<CoachPreferenceIntakeState> = {};
  const preference = objectValue(root.preference);
  if (preference) {
    const status = ["missing", "ambiguous", "identified"].includes(
        String(preference.status ?? ""),
      )
      ? String(preference.status) as "missing" | "ambiguous" | "identified"
      : "missing";
    patch.preference = {
      status,
      key: key(preference.key),
      confidence: confidence(preference.confidence),
      evidence: stringArray(preference.evidence),
    };
  }
  const desiredValue = objectValue(root.desired_value);
  if (desiredValue) {
    const status = ["missing", "ambiguous", "identified"].includes(
        String(desiredValue.status ?? ""),
      )
      ? String(desiredValue.status) as
        | "missing"
        | "ambiguous"
        | "identified"
      : "missing";
    patch.desired_value = {
      status,
      value: desiredValue.value == null
        ? null
        : String(desiredValue.value).trim() || null,
      confidence: confidence(desiredValue.confidence),
      evidence: stringArray(desiredValue.evidence),
    };
  }
  const reason = objectValue(root.reason);
  if (reason) {
    patch.reason = {
      evidence: stringArray(reason.evidence),
      confidence: confidence(reason.confidence),
    };
  }
  if (Array.isArray(root.constraints)) {
    patch.constraints = stringArray(root.constraints);
  }
  if (Array.isArray(root.missing_slots)) {
    patch.missing_slots = stringArray(root.missing_slots);
  }
  patch.generated_user_message = root.generated_user_message == null
    ? undefined
    : String(root.generated_user_message).trim() || null;
  patch.confidence = confidence(root.confidence);
  patch.current_step = step(root.current_step);
  return patch;
}

export function normalizeCoachPreferencesSlotFillerOutput(
  raw: unknown,
): CoachPreferencesSlotFillerOutput {
  const root = parseJsonObject(raw);
  return {
    current_step: step(root.current_step),
    state_patch: normalizeStatePatch(root.state_patch),
    missing_slots: stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillCoachPreferencesSlotsWithAi(
  input: CoachPreferencesSlotFillerInput,
): Promise<CoachPreferencesSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill update_coach_preferences de Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la compréhension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback métier.",
    "Tu identifies uniquement une préférence explicite sur la façon dont Sophia doit répondre.",
    "Ne déduis jamais une préférence durable depuis une émotion ponctuelle ou un simple contexte de crise.",
    "Les clés autorisées sont strictement coach.tone, coach.challenge_level, coach.question_tendency, coach.response_max_lines, coach.emoji_policy, coach.final_question_policy, coach.action_first_policy.",
    "Les valeurs doivent être canoniques: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high; coach.response_max_lines=three|normal; coach.emoji_policy=none|normal; coach.final_question_policy=avoid_unnecessary|normal; coach.action_first_policy=concrete_before_questions|normal.",
    "Distinction critique:",
    "- coach.question_tendency concerne le nombre de questions, de relances interrogatives, de demandes de précision, ou le fait d'aider le user à clarifier son raisonnement avant de conclure.",
    "- question_tendency=high si le user demande: plus de questions, fais-moi préciser, creuse avec moi, aide-moi à sortir le raisonnement, demande-moi deux/trois angles avant de répondre.",
    "- question_tendency=low si le user demande: moins de questions, va plus droit au point, tranche davantage, ne me fais pas tout détailler.",
    "- coach.challenge_level concerne le niveau d'exigence, confrontation, pression constructive, pousser/secouer/challenger le user sur ses objectifs.",
    "- challenge_level=high seulement si le user demande explicitement plus d'exigence/confrontation/challenge; ne l'utilise pas pour une demande de précision ou de questions.",
    "- challenge_level=low si le user demande moins de pression, moins d'intensité, moins de confrontation ou un challenge plus léger.",
    "- coach.tone concerne la couleur relationnelle: plus doux, plus chaleureux, plus direct, moins arrondi, plus ferme.",
    "- coach.response_max_lines concerne les limites de longueur explicites comme trois lignes max.",
    "- coach.emoji_policy concerne les demandes explicites sans emoji / zéro emoji.",
    "- coach.final_question_policy concerne les demandes de ne pas finir par une question inutile.",
    "- coach.action_first_policy concerne l'ordre de coaching: commencer par un geste/action concret avant de poser plusieurs questions.",
    "Si la demande est ambiguë entre ton et challenge, marque preference ou desired_value ambiguous et pose une question courte.",
    'Si le message contient plusieurs préférences distinctes (ex: ton plus direct ET moins de questions), ne choisis jamais une seule préférence silencieusement. Marque preference=ambiguous, missing_slots=["preference"], et demande laquelle appliquer en premier.',
    "Si current_state montre une preference ambiguous/missing apres une question de choix, et que le user repond en selectionnant une des options (ex: d'abord le ton plus direct, commence par moins de questions, traite le challenge plus doux), remplis directement preference et desired_value pour cette option. Ne repose pas la meme question.",
    "Dans une reponse de selection apres ambiguite: 'le ton plus direct' => coach.tone=direct; 'moins de questions' => coach.question_tendency=low; 'plus de questions' => coach.question_tendency=high; 'challenge plus doux/moins fort' => coach.challenge_level=low; 'challenge plus exigeant' => coach.challenge_level=high.",
    "Si le user corrige une préférence en attente de confirmation vers une autre préférence complète, remplis les nouveaux slots et laisse le builder produire une nouvelle confirmation. Ne génère pas de message libre disant que c'est mis à jour.",
    "Si des slots manquent, generated_user_message doit contenir une question WhatsApp courte.",
    "generated_user_message ne doit jamais annoncer qu'un réglage est appliqué, mis à jour, enregistré ou modifié. Il sert uniquement à clarifier un slot manquant.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand generated_user_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_update_coach_preferences_tool_skill_slots",
    required_json_shape: {
      current_step:
        "preference_resolution|draft_generation|draft_validation|confirmation",
      state_patch: {
        preference: {
          status: "missing|ambiguous|identified",
          key:
            "coach.tone|coach.challenge_level|coach.question_tendency|coach.response_max_lines|coach.emoji_policy|coach.final_question_policy|coach.action_first_policy|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        desired_value: {
          status: "missing|ambiguous|identified",
          value:
            "soft|warm_direct|direct|low|balanced|high|normal|three|none|avoid_unnecessary|concrete_before_questions|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        reason: {
          evidence: ["string"],
          confidence: "low|medium|high",
        },
        constraints: ["string"],
        missing_slots: ["preference|desired_value"],
        confidence: "low|medium|high",
        generated_user_message: "string|null",
      },
      missing_slots: ["preference|desired_value"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    current_preferences: input.current_preferences ?? {},
    allowed_values: COACH_PREFERENCE_VALUES,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.12,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "update_coach_preferences.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeCoachPreferencesSlotFillerOutput(raw);
}
