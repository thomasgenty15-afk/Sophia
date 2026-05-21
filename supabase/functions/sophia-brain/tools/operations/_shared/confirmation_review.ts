import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";

export type ToolSkillConfirmationKind =
  | "yes"
  | "no"
  | "correction_to_pending"
  | "topic_change"
  | "unknown";

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("confirmation_not_json");
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("confirmation_not_object");
  }
  return parsed as Record<string, unknown>;
}

function normalizeKind(raw: unknown): ToolSkillConfirmationKind {
  const value = String(raw ?? "").trim();
  return [
      "yes",
      "no",
      "correction_to_pending",
      "topic_change",
      "unknown",
    ].includes(value)
    ? value as ToolSkillConfirmationKind
    : "unknown";
}

export async function reviewToolSkillConfirmationWithAi(input: {
  operation_type: string;
  message: string;
  pending_context?: unknown;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
}): Promise<ToolSkillConfirmationKind> {
  const prompt = [
    "Tu es le sous-skill confirmation_validation d'un Tool Skill Sophia.",
    "Tu lis le dernier message user dans le contexte d'une proposition ou operation en attente, puis tu retournes uniquement un JSON.",
    "yes: le user accepte clairement de continuer, creer, lancer, appliquer ou valider la proposition en attente.",
    "no: le user refuse, annule, dit pas maintenant ou ne veut pas continuer.",
    "correction_to_pending: le user veut continuer mais corrige/modifie la proposition avant execution.",
    "topic_change: le user quitte clairement ce sujet.",
    "unknown: le message ne suffit pas a decider.",
    "N'utilise pas de mots-cles seuls: interprete l'intention dans le contexte.",
    JSON.stringify({
      operation_type: input.operation_type,
      user_message: input.message,
      pending_context: input.pending_context ?? null,
      recent_messages: input.recent_messages ?? [],
      required_json_shape: {
        kind: "yes|no|correction_to_pending|topic_change|unknown",
        confidence: "low|medium|high",
        evidence: ["indices du message user"],
      },
    }),
  ].join("\n");
  try {
    const raw = await generateWithGemini(
      "Tu retournes uniquement le JSON de validation de confirmation.",
      prompt,
      0.1,
      true,
      [],
      "auto",
      {
        model: getGeminiFallbackModel("gemini-2.5-flash"),
        requestId: input.request_id ?? undefined,
        source: "tool_skill.confirmation_validation",
        forceRealAi: true,
        maxRetries: 1,
      },
    );
    return normalizeKind(parseJsonObject(raw).kind);
  } catch (error) {
    console.warn(
      "[ToolSkillConfirmation] AI confirmation review failed",
      error,
    );
    return "unknown";
  }
}
