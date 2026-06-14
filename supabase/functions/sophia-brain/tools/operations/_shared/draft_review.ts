import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";

declare const Deno: any;

export type ToolSkillDraftReviewDecision = {
  decision:
    | "approve"
    | "reject"
    | "revise"
    | "explain"
    | "topic_change"
    | "unclear";
  confidence: "low" | "medium" | "high";
  evidence: string[];
  generated_user_message?: string | null;
};

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function shouldUseToolSkillAiDraftReview(): boolean {
  return String(safeEnvGet("SOPHIA_TOOL_SKILL_AI_DRAFT_REVIEW") ?? "1")
    .trim() !== "0";
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
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("tool_skill_draft_review_not_json");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      end = index;
      break;
    }
  }
  if (end <= start) throw new Error("tool_skill_draft_review_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("tool_skill_draft_review_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeDecision(raw: unknown): ToolSkillDraftReviewDecision {
  const root = parseJsonObject(raw);
  const decisionRaw = String(root.decision ?? "").trim();
  const decision = [
      "approve",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "unclear",
    ].includes(decisionRaw)
    ? decisionRaw as ToolSkillDraftReviewDecision["decision"]
    : "unclear";
  const confidenceRaw = String(root.confidence ?? "").trim();
  const confidence = ["low", "medium", "high"].includes(confidenceRaw)
    ? confidenceRaw as ToolSkillDraftReviewDecision["confidence"]
    : "low";
  return {
    decision,
    confidence,
    evidence: stringArray(root.evidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
  };
}

export async function reviewToolSkillDraftWithAi(input: {
  operation_type: string;
  message: string;
  previous_draft: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
  user_id?: string | null;
}): Promise<ToolSkillDraftReviewDecision | null> {
  if (!shouldUseToolSkillAiDraftReview()) return null;
  const operationSpecificRules = input.operation_type === "select_state_potion"
    ? [
      "Regles specifiques select_state_potion:",
      "- approve uniquement si le user confirme explicitement l'activation/execution maintenant de la potion deja proposee.",
      "- Si le user donne un detail emotionnel, une contrainte de ton, une precision de rappel, une action cible, ou dit 'avant validation', c'est revise, pas approve.",
      "- Si le user demande le detail du suivi ou veut etre rassure avant de valider, c'est explain.",
      "- Ne considere jamais une simple reponse aux questions de detail comme une confirmation d'activation.",
    ].join("\n")
    : "";
  const prompt = [
    "Tu es le sous-skill draft_validation d'un Tool Skill Sophia.",
    "Tu lis le brouillon pending, le dernier message user et l'etat operationnel, puis tu retournes uniquement un JSON.",
    "Ne classe jamais avec des mots-cles. Interprete l'intention dans le contexte du brouillon.",
    "approve: le user demande clairement d'appliquer/creer/lancer maintenant.",
    "reject: le user refuse ou annule ce brouillon.",
    "revise: le user demande de modifier, corriger, refaire, ou donne une contrainte a integrer avant execution.",
    "explain: le user veut comprendre/voir les details avant de valider.",
    "topic_change: le user quitte clairement ce tool skill.",
    "unclear: le message ne permet pas de decider.",
    "Si le user dit juste oui a une demande de montrer/preparer/reformuler, ce n'est pas approve tant qu'il ne demande pas explicitement l'execution.",
    operationSpecificRules,
    "Si tu dois répondre au user sans executer, genere generated_user_message en langage naturel, sans vocabulaire technique.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand generated_user_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    'Sophia est feminine: quand generated_user_message parle de toi, accorde les adjectifs et participes au feminin ("contente", "prete", "desolee", "ravie", etc.).',
    JSON.stringify({
      operation_type: input.operation_type,
      user_message: input.message,
      previous_draft: input.previous_draft,
      operation_input: input.operation_input ?? null,
      recent_messages: input.recent_messages ?? [],
      required_json_shape: {
        decision: "approve|reject|revise|explain|topic_change|unclear",
        confidence: "low|medium|high",
        evidence: ["indices du message user"],
        generated_user_message: "message optionnel si aucune execution",
      },
    }),
  ].join("\n");
  try {
    const raw = await generateWithGemini(
      "Tu retournes uniquement le JSON de validation du brouillon.",
      prompt,
      0.1,
      true,
      [],
      "auto",
      {
        model: getGeminiFallbackModel("gemini-2.5-flash"),
        requestId: input.request_id ?? undefined,
        userId: input.user_id ?? undefined,
        source: "tool_skill_draft_review",
        forceRealAi: true,
        maxRetries: 1,
      },
    );
    return normalizeDecision(raw);
  } catch (error) {
    console.warn("[ToolSkillDraftReview] AI draft review failed", error);
    return null;
  }
}
