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
import type { UpdateCoachPreferenceUserIntent } from "./contract.ts";

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
  user_intent: UpdateCoachPreferenceUserIntent;
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

function userIntent(value: unknown): UpdateCoachPreferenceUserIntent {
  const raw = String(value ?? "").trim();
  return [
      "set_preference",
      "preview_only",
      "verify_preference",
      "cancel",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "status_question",
      "clarify",
      "unknown",
    ].includes(raw)
    ? raw as UpdateCoachPreferenceUserIntent
    : "unknown";
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
      raw === "coach.question_tendency"
    ? raw
    : null;
}

function normalizeRequestedPatch(
  value: unknown,
): Partial<Record<CoachPreferenceKey, string>> | undefined {
  const root = objectValue(value);
  if (!root) return undefined;
  const patch: Partial<Record<CoachPreferenceKey, string>> = {};
  for (const [rawKey, rawValue] of Object.entries(root)) {
    const canonicalKey = key(rawKey);
    if (!canonicalKey) continue;
    const valueText = String(rawValue ?? "").trim();
    if (!COACH_PREFERENCE_VALUES[canonicalKey].includes(valueText)) continue;
    patch[canonicalKey] = valueText;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function normalizeStructuredConstraints(value: unknown) {
  const root = objectValue(value);
  if (!root) return undefined;
  return {
    draft_only: root.draft_only === true,
    do_not_store: root.do_not_store === true,
  };
}

function normalizeStatePatch(
  value: unknown,
): Partial<CoachPreferenceIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<CoachPreferenceIntakeState> = {};
  patch.user_intent = userIntent(root.user_intent);
  const requestedPatch = normalizeRequestedPatch(root.requested_patch);
  if (requestedPatch) patch.requested_patch = requestedPatch;
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
  const structuredConstraints = normalizeStructuredConstraints(
    root.structured_constraints,
  );
  if (structuredConstraints) {
    patch.structured_constraints = structuredConstraints;
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
    user_intent: userIntent(root.user_intent),
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
    "Les clés autorisées sont strictement coach.tone, coach.challenge_level, coach.question_tendency.",
    "Les valeurs doivent être canoniques: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Distinction critique:",
    "- coach.question_tendency concerne le nombre de questions, de relances interrogatives, de demandes de précision, ou le fait d'aider le user à clarifier son raisonnement avant de conclure.",
    "- question_tendency=high si le user demande: plus de questions, fais-moi préciser, creuse avec moi, aide-moi à sortir le raisonnement, demande-moi deux/trois angles avant de répondre.",
    "- question_tendency=low si le user demande: moins de questions, va plus droit au point, tranche davantage, ne me fais pas tout détailler.",
    "- coach.challenge_level concerne le niveau d'exigence, confrontation, pression constructive, pousser/secouer/challenger le user sur ses objectifs.",
    "- challenge_level=high seulement si le user demande explicitement plus d'exigence/confrontation/challenge; ne l'utilise pas pour une demande de précision ou de questions.",
    "- challenge_level=low si le user demande moins de pression, moins d'intensité, moins de confrontation ou un challenge plus léger.",
    "- coach.tone concerne la couleur relationnelle: plus doux, plus chaleureux, plus direct, moins arrondi, plus ferme.",
    "- Les demandes de longueur, emoji, question finale, ordre action-avant-question, ou autre comportement hors de ces 3 clés ne doivent pas être stockées comme préférence durable.",
    "Si la demande est ambiguë entre ton et challenge, marque preference ou desired_value ambiguous et pose une question courte.",
    "Si le message contient plusieurs préférences distinctes compatibles ou une préférence composite (ex: mode tunnel, ton plus direct ET moins de questions), renseigne state_patch.requested_patch uniquement avec les clés canoniques supportées. N'invente pas de règle durable hors UI et ne produis pas de metadata runtime.",
    "Exemples de mapping composite:",
    "- mode tunnel durable => requested_patch coach.tone=direct et coach.question_tendency=low. Ne stocke pas sans emoji, pas de question finale, ni action-first.",
    "- geste concret avant questions => éventuellement coach.question_tendency=low si le user demande durablement moins de questions; sinon clarify/preview_only. Ne crée pas de clé action-first.",
    "- challenge-moi doucement quand la technique ne colle pas => coach.challenge_level=balanced ou low selon l'intensité demandée; ne stocke pas la condition comme règle runtime.",
    "user_intent est obligatoire: set_preference pour garder une préférence durable; preview_only si le user demande juste une proposition sans enregistrer; verify_preference/status_question s'il demande si c'est gardé; cancel/reject pour finalement non; revise pour correction; explain pour explication; topic_change si le message sort du sujet; clarify si une question est nécessaire.",
    "Renseigne structured_constraints seulement avec draft_only/do_not_store pour preview.",
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
      user_intent:
        "set_preference|preview_only|verify_preference|cancel|reject|revise|explain|topic_change|status_question|clarify|unknown",
      current_step:
        "preference_resolution|draft_generation|draft_validation|confirmation",
      state_patch: {
        user_intent:
          "set_preference|preview_only|verify_preference|cancel|reject|revise|explain|topic_change|status_question|clarify|unknown",
        requested_patch: {
          "coach.tone": "soft|warm_direct|direct",
          "coach.challenge_level": "low|balanced|high",
          "coach.question_tendency": "low|normal|high",
        },
        preference: {
          status: "missing|ambiguous|identified",
          key: "coach.tone|coach.challenge_level|coach.question_tendency|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        desired_value: {
          status: "missing|ambiguous|identified",
          value: "soft|warm_direct|direct|low|balanced|high|normal|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        reason: {
          evidence: ["string"],
          confidence: "low|medium|high",
        },
        constraints: ["string"],
        structured_constraints: {
          draft_only: "boolean",
          do_not_store: "boolean",
        },
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
