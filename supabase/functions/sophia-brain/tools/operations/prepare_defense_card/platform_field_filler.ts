import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { DefenseCardStep } from "./workflow.ts";
import {
  type DefenseCardPlatformFieldDefinition,
  type DefenseCardPlatformFieldState,
  type DefenseCardPlatformRouteKind,
  normalizeDefenseCardPlatformFieldState,
} from "./platform_fields.ts";

export type DefenseCardPlatformFieldFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  route_kind: DefenseCardPlatformRouteKind;
  field_definitions: DefenseCardPlatformFieldDefinition[];
  current_state: DefenseCardPlatformFieldState;
  operation_input?: Record<string, unknown> | null;
};

export type DefenseCardPlatformFieldFillerOutput = {
  current_step: Extract<DefenseCardStep, "platform_field_intake"> |
    "handoff_ready";
  state_patch: {
    platform_fields: DefenseCardPlatformFieldState;
    generated_user_message?: string | null;
  };
  confidence: "low" | "medium" | "high";
  evidence: string[];
};

export type DefenseCardPlatformFieldFiller = (
  input: DefenseCardPlatformFieldFillerInput,
) => Promise<DefenseCardPlatformFieldFillerOutput | null>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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
    throw new Error("defense_card_platform_fields_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("defense_card_platform_fields_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" ? raw : "low";
}

export function normalizeDefenseCardPlatformFieldFillerOutput(
  raw: unknown,
  routeKind: DefenseCardPlatformRouteKind,
): DefenseCardPlatformFieldFillerOutput {
  const root = parseJsonObject(raw);
  const statePatch = objectValue(root.state_patch);
  const platformFields = normalizeDefenseCardPlatformFieldState(
    objectValue(statePatch)?.platform_fields,
    routeKind,
  );
  if (!platformFields) {
    throw new Error("defense_card_platform_fields_missing");
  }
  const step = platformFields.status === "complete"
    ? "handoff_ready"
    : "platform_field_intake";
  return {
    current_step: String(root.current_step ?? "") === "handoff_ready"
      ? "handoff_ready"
      : step,
    state_patch: {
      platform_fields: platformFields,
      generated_user_message:
        objectValue(root.state_patch)?.generated_user_message == null
          ? null
          : String(objectValue(root.state_patch)?.generated_user_message)
            .trim() || null,
    },
    confidence: confidence(root.confidence),
    evidence: stringArray(root.evidence),
  };
}

async function repairPlatformFieldJsonWithAi(
  input: DefenseCardPlatformFieldFillerInput,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const repaired = await generateWithGemini(
    [
      "Tu es un réparateur JSON interne pour l'unique champ UI prepare_defense_card.",
      "Tu retournes uniquement un objet JSON valide.",
      "Ne change pas la décision métier ni les valeurs données par le user.",
    ].join("\n"),
    JSON.stringify({
      task: "repair_prepare_defense_card_platform_field_json",
      invalid_or_malformed_output: String(raw ?? "").slice(0, 20_000),
      route_kind: input.route_kind,
      field_definitions: input.field_definitions,
      required_json_shape: {
        current_step: "platform_field_intake|handoff_ready",
        state_patch: {
          platform_fields: {
            route_kind: input.route_kind,
            fields: [{
              field_id: "support_need",
              question_label: "string",
              required: true,
              status: "missing|proposed|locked",
              proposed_value: "string|null",
              locked_value: "string|null",
              user_evidence: ["string"],
              needs_user_confirmation: false,
              evidence: ["string"],
            }],
            missing_field_ids: ["string"],
          },
          generated_user_message: "string|null",
        },
        confidence: "low|medium|high",
        evidence: ["string"],
      },
    }),
    0,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "prepare_defense_card.platform_field_filler.repair",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 30_000,
      maxRetries: 1,
    },
  );
  return parseJsonObject(repaired);
}

export async function fillDefenseCardPlatformFieldsWithAi(
  input: DefenseCardPlatformFieldFillerInput,
): Promise<DefenseCardPlatformFieldFillerOutput | null> {
  const systemPrompt = [
    "Tu remplis l'unique champ UI d'une carte de défense Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON.",
    "La plateforme ne demande qu'une question: Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
    "Tu dois aider à formuler cette seule réponse, pas une carte finale.",
    "Ne génère jamais un titre, un brouillon, une stratégie, un plan B ou un formulaire multi-champs.",
    "Tu peux utiliser les slots internes déjà compris (risque, moment, signal, geste) uniquement pour composer la réponse au champ support_need.",
    "Si la situation/contexte/pulsion du user est claire, mets support_need en status='locked'.",
    "Si la valeur est plausible mais encore déduite ou trop vague, mets status='proposed'.",
    "Si une valeur claire vient du user dans ce tour ou dans l'état courant, mets status='locked' avec user_evidence.",
    "Le champ support_need locked existant reste locked, sauf correction explicite du user.",
    "Si support_need manque, pose une seule question courte sur la situation, le contexte, l'environnement ou la pulsion à renseigner.",
    "Ne parle pas de création depuis le chat.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message.',
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_prepare_defense_card_platform_fields",
    route_kind: input.route_kind,
    field_definitions: input.field_definitions,
    current_state: input.current_state,
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    operation_input: input.operation_input ?? null,
    required_json_shape: {
      current_step: "platform_field_intake|handoff_ready",
      state_patch: {
        platform_fields: {
          route_kind: input.route_kind,
          fields: [{
            field_id:
              "support_need",
            question_label: "string",
            required: true,
            status: "missing|proposed|locked",
            proposed_value: "string|null",
            locked_value: "string|null",
            user_evidence: ["string"],
            needs_user_confirmation: false,
            evidence: ["string"],
          }],
          missing_field_ids: ["string"],
        },
        generated_user_message: "string|null",
      },
      confidence: "low|medium|high",
      evidence: ["string"],
    },
  });
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
      source: "prepare_defense_card.platform_field_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  try {
    return normalizeDefenseCardPlatformFieldFillerOutput(raw, input.route_kind);
  } catch {
    const repaired = await repairPlatformFieldJsonWithAi(input, raw);
    return normalizeDefenseCardPlatformFieldFillerOutput(
      repaired,
      input.route_kind,
    );
  }
}
