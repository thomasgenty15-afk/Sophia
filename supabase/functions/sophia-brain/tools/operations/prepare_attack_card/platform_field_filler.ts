import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { ConversationChannel } from "../../../contracts/turn_frame.v1.ts";
import type {
  AttackCardPlatformFieldState,
  AttackCardTechniqueKey,
} from "./contract.ts";
import type { AttackCardIntakeState } from "./workflow.ts";
import {
  getAttackCardPlatformFieldDefinitions,
  mergeAttackCardPlatformFieldPatch,
} from "./platform_fields.ts";

export type AttackCardPlatformFieldFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  current_state: AttackCardIntakeState;
  operation_input?: Record<string, unknown> | null;
  technique_key: AttackCardTechniqueKey;
  timezone: string;
  channel: ConversationChannel;
};

export type AttackCardPlatformFieldFillerOutput = {
  current_step: "platform_field_intake" | "handoff_ready";
  state_patch: {
    platform_fields?: AttackCardPlatformFieldState | null;
    generated_user_message?: string | null;
  };
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  generated_user_message?: string | null;
  evidence?: string[];
};

export type AttackCardPlatformFieldFiller = (
  input: AttackCardPlatformFieldFillerInput,
) => Promise<AttackCardPlatformFieldFillerOutput | null>;

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
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("attack_card_platform_fields_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attack_card_platform_fields_not_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

export function normalizeAttackCardPlatformFieldFillerOutput(
  raw: unknown,
  args: {
    current: AttackCardPlatformFieldState | null | undefined;
    techniqueKey: AttackCardTechniqueKey;
  },
): AttackCardPlatformFieldFillerOutput {
  const root = parseJsonObject(raw);
  const statePatch = objectValue(root.state_patch) ?? {};
  const normalizedFields = mergeAttackCardPlatformFieldPatch(
    args.current,
    objectValue(statePatch.platform_fields) ??
      objectValue(root.platform_fields),
    args.techniqueKey,
  );
  const missing = normalizedFields.missing_field_ids.map((fieldId) =>
    `platform_field:${fieldId}`
  );
  const generatedUserMessage = statePatch.generated_user_message == null
    ? root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null
    : String(statePatch.generated_user_message).trim() || null;
  return {
    current_step: missing.length > 0
      ? "platform_field_intake"
      : "handoff_ready",
    state_patch: {
      platform_fields: normalizedFields,
      generated_user_message: generatedUserMessage,
    },
    missing_slots: missing.length > 0
      ? missing
      : stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: generatedUserMessage,
    evidence: stringArray(root.evidence),
  };
}

export async function fillAttackCardPlatformFieldsWithAi(
  input: AttackCardPlatformFieldFillerInput,
): Promise<AttackCardPlatformFieldFillerOutput | null> {
  const definitions = getAttackCardPlatformFieldDefinitions(
    input.technique_key,
  );
  const systemPrompt = [
    "Tu es le sous-skill interne de remplissage des champs UI du Tool Skill prepare_attack_card.",
    "Tu ne reponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Tu remplis les champs de la plateforme pour une carte d'attaque, pas le contenu final de la carte.",
    "Tu peux verrouiller plusieurs champs dans le meme tour si le user les fournit clairement.",
    "Ne deduis pas les champs manquants depuis une comprehension globale.",
    "Si une valeur est plausible mais non donnee explicitement par le user, mets status='proposed' et demande validation.",
    "Si une valeur est exploitable et vient clairement du user, mets status='locked', locked_value, user_evidence, et needs_user_confirmation=false.",
    "Ne mets jamais status='locked' sans preuve utilisateur directe ou validation explicite.",
    "Si le user corrige un ou plusieurs champs, renvoie uniquement les champs corriges avec user_evidence.",
    "Si des champs manquent, pose une question courte qui peut couvrir naturellement les champs manquants.",
    "Ne genere jamais un brouillon, un titre final, un texte de carte, un modele ou un apercu.",
    "Ne liste pas un formulaire entier si une seule question naturelle suffit.",
    "Tu tutoies toujours l'utilisateur.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_prepare_attack_card_platform_fields",
    required_json_shape: {
      current_step: "platform_field_intake|handoff_ready",
      state_patch: {
        platform_fields: {
          technique_key: input.technique_key,
          fields: [{
            field_id: definitions.map((field) => field.field_id),
            technique_key: input.technique_key,
            question: "string",
            required: true,
            status: "missing|proposed|locked",
            proposed_value: "string|null",
            locked_value: "string|null",
            user_evidence: ["string"],
            needs_user_confirmation: "boolean",
            evidence: ["string"],
          }],
          missing_field_ids: ["string"],
        },
        generated_user_message: "string|null",
      },
      missing_slots: ["platform_field:<field_id>"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    current_state: input.current_state,
    current_platform_fields: input.current_state.platform_fields ?? null,
    operation_input: input.operation_input ?? null,
    field_definitions: definitions,
    timezone: input.timezone,
    channel: input.channel,
  });
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "prepare_attack_card.platform_field_intake",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeAttackCardPlatformFieldFillerOutput(raw, {
      current: input.current_state.platform_fields,
      techniqueKey: input.technique_key,
    });
  } catch (error) {
    console.warn("[PrepareAttackCard] platform field filler failed", error);
    return null;
  }
}
