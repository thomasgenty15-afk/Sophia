import { generateWithGemini, getGeminiFallbackModel } from "../../_shared/gemini.ts";

export type EthicalEntityType =
  | "action"
  | "initiative"
  | "north_star"
  | "vital_sign";

export type EthicalOperation = "create" | "update";

export type EthicalDecision = "allow" | "block";

export type EthicalValidationInput = {
  entity_type: EthicalEntityType;
  operation: EthicalOperation;
  text_fields: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  request_id?: string;
};

export type EthicalValidationResult = {
  decision: EthicalDecision;
  reason_short: string;
  confidence: number;
};

function blockReasonByEntity(entityType: EthicalEntityType): string {
  switch (entityType) {
    case "action":
      return "Ce type d'action n'est pas en accord avec les valeurs de Sophia.";
    case "initiative":
      return "Ce type d'initiative n'est pas en accord avec les valeurs de Sophia.";
    case "north_star":
      return "Ce type d'etoile polaire n'est pas en accord avec les valeurs de Sophia.";
    case "vital_sign":
      return "Ce type de signe vital n'est pas en accord avec les valeurs de Sophia.";
    default:
      return "Ce type de contenu n'est pas en accord avec les valeurs de Sophia.";
  }
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeForCompare(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function shouldValidateOnUpdate(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  textFieldKeys: string[],
): boolean {
  const prev = previous ?? {};
  const nxt = next ?? {};
  for (const key of textFieldKeys) {
    const a = normalizeForCompare((prev as any)?.[key]);
    const b = normalizeForCompare((nxt as any)?.[key]);
    if (a !== b) return true;
  }
  return false;
}

export async function validateEthicalTextWithAI(
  input: EthicalValidationInput,
): Promise<EthicalValidationResult> {
  if (!envBool("ETHICAL_VALIDATION_ENABLED", true)) {
    return {
      decision: "allow",
      reason_short: "Validation éthique désactivée.",
      confidence: 1,
    };
  }

  const fields = Object.fromEntries(
    Object.entries(input.text_fields ?? {})
      .map(([k, v]) => [k, String(v ?? "").trim()])
      .filter(([, v]) => v.length > 0),
  );
  if (Object.keys(fields).length === 0) {
    return {
      decision: "allow",
      reason_short: "Aucun texte à valider.",
      confidence: 1,
    };
  }

  const systemPrompt = [
    "Tu es un validateur éthique strict pour une app de coaching bienveillant.",
    "Décide si les champs texte sont acceptables éthiquement.",
    "",
    "Critères de blocage (non exhaustif):",
    "- manipulation, contrôle excessif, culpabilisation, pression toxique",
    "- humiliation, menaces, langage dégradant",
    "- incitation à comportements non sains, dangereux ou non vertueux",
    "- formulation intrusive ou non respectueuse de l'autonomie",
    "",
    "Si doute éthique: bloque.",
    "Retourne UNIQUEMENT un JSON valide:",
    '{"decision":"allow|block","reason_short":"<=180 chars","confidence":0-1}',
  ].join("\n");

  const userPrompt = JSON.stringify({
    entity_type: input.entity_type,
    operation: input.operation,
    text_fields: fields,
    context: input.context ?? null,
  });

  try {
    const out = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0,
      true,
      [],
      "auto",
      {
        requestId: input.request_id,
        source: "ethical-text-validator",
        model:
          (Deno.env.get("ETHICAL_VALIDATION_MODEL") ?? "").trim() ||
          getGeminiFallbackModel("gemini-2.5-flash"),
        maxRetries: 2,
      },
    );
    const parsed = JSON.parse(String(out ?? "{}")) as any;
    const decisionRaw = String(parsed?.decision ?? "").trim().toLowerCase();
    const decision: EthicalDecision = decisionRaw === "block" ? "block" : "allow";
    const reason = String(parsed?.reason_short ?? "").trim().slice(0, 180);
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
    
    // Override reason for block decisions with a standard message by entity type
    const finalReason = decision === "block"
      ? blockReasonByEntity(input.entity_type)
      : reason || "Contenu conforme.";

    return {
      decision,
      reason_short: finalReason,
      confidence,
    };
  } catch (e) {
    console.warn("[ethical-text-validator] fallback allow on parse/runtime error", e);
    return {
      decision: "allow",
      reason_short: "Validation indisponible, passage en mode permissif.",
      confidence: 0.3,
    };
  }
}

