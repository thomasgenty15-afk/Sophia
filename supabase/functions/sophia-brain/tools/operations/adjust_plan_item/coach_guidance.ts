import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";

declare const Deno: any;

export type AdjustPlanCoachScope = "action" | "level" | "whole_plan";

export type AdjustPlanCoachGuidance = {
  scope: AdjustPlanCoachScope;
  observation: string;
  recommendation: string;
  warnings: string[];
  options_to_discuss: string[];
  questions_to_clarify: string[];
  preserve: string[];
  avoid: string[];
  guidelines: string[];
  confidence: "low" | "medium" | "high";
};

export type AdjustPlanCoachGuidanceInput = {
  user_id: string;
  request_id?: string | null;
  scope: AdjustPlanCoachScope;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: unknown;
  operation_input?: Record<string, unknown> | null;
};

export type AdjustPlanCoachGuidanceRunner = (
  input: AdjustPlanCoachGuidanceInput,
) => Promise<AdjustPlanCoachGuidance | null>;

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function shouldUseAdjustPlanCoachGuidance(): boolean {
  return String(safeEnvGet("SOPHIA_ADJUST_PLAN_COACH_GUIDANCE") ?? "")
        .trim() === "1" ||
    String(safeEnvGet("SOPHIA_ADJUST_PLAN_AI_SLOT_FILLING") ?? "").trim() ===
      "1";
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
  if (start < 0) throw new Error("adjust_plan_coach_guidance_not_json");
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
  if (end <= start) throw new Error("adjust_plan_coach_guidance_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_coach_guidance_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function scopedGuidelines(scope: AdjustPlanCoachScope): string[] {
  if (scope === "action") {
    return [
      "Verifier le role de l'action dans le plan avant de la reduire, remplacer ou mettre en pause.",
      "Preserver l'intention de l'action d'origine quand le user demande seulement de la rendre plus faisable.",
      "Preferer un ajustement minimal ou une action-pont quand le blocage est local.",
      "Ne pas transformer une habitude en mission ponctuelle sans demande explicite.",
      "Signaler si modifier cette action risque de casser un prerequis ou une dependance du plan.",
    ];
  }
  if (scope === "level") {
    return [
      "Traiter le niveau comme le perimetre courant: rythme, charge, focus, ordre ou intensite du bloc actuel.",
      "Respecter le rythme du user sans transformer une baisse temporaire en refonte globale.",
      "Si la periode demandee depasse la fin du niveau, garder ce repere pour le prochain niveau sans modifier toute la trajectoire.",
      "Preserver le coeur du niveau et identifier ce qui peut etre allege en premier.",
      "Eviter de supprimer une action structurante quand une simplification ou un reequilibrage suffit.",
    ];
  }
  return [
    "Traiter le whole plan comme une decision de trajectoire: objectif, coherence, ordre des phases, prochaine etape ou architecture globale.",
    "Verifier que le changement reste coherent avec l'objectif global et les reponses du questionnaire.",
    "Preserver explicitement ce que le user veut garder avant de proposer une reorganisation.",
    "Raisonner en prerequis, sequencing et phases futures plutot qu'en patch arbitraire d'actions courantes.",
    "Signaler les risques de supprimer, inverser ou accelerer une etape qui sert de socle coaching.",
  ];
}

function normalizeGuidance(
  raw: unknown,
  scope: AdjustPlanCoachScope,
): AdjustPlanCoachGuidance {
  const root = parseJsonObject(raw);
  const rawConfidence = String(root.confidence ?? "").trim();
  const confidence = rawConfidence === "high" || rawConfidence === "medium" ||
      rawConfidence === "low"
    ? rawConfidence
    : "low";
  const observation = String(root.observation ?? "").trim();
  const recommendation = String(root.recommendation ?? "").trim();
  return {
    scope,
    observation: observation ||
      "La demande doit etre interpretee comme une decision de coaching, pas seulement comme un patch technique.",
    recommendation: recommendation ||
      "Avancer avec un ajustement minimal, explicite, et coherent avec la progression du plan.",
    warnings: stringArray(root.warnings),
    options_to_discuss: stringArray(root.options_to_discuss),
    questions_to_clarify: stringArray(root.questions_to_clarify),
    preserve: stringArray(root.preserve),
    avoid: stringArray(root.avoid),
    guidelines: [
      ...scopedGuidelines(scope),
      ...stringArray(root.guidelines),
    ],
    confidence,
  };
}

export async function generateAdjustPlanCoachGuidance(
  input: AdjustPlanCoachGuidanceInput,
): Promise<AdjustPlanCoachGuidance | null> {
  const systemPrompt = [
    "Tu es le coach specialise interne du flow adjust_plan de Sophia.",
    "Tu ne parles jamais directement au user. Tu fournis une guidance qualitative au sous-skill operationnel.",
    "Tu ne valides pas, tu ne bloques pas, tu n'appliques rien et tu ne remplis pas le JSON operationnel.",
    "Ton role est d'aider le sous-skill a raisonner sur le sens coaching du changement: coherence, options, risques, questions utiles, preservation.",
    "Tu dois toujours distinguer ce qui est humainement pertinent de ce qui est techniquement faisable.",
    "Tu dois produire uniquement du JSON valide.",
    "Le champ observation formule ce qui se joue vraiment dans la demande du user.",
    "Le champ recommendation donne la direction coaching la plus pertinente a ce stade.",
    "Le champ warnings liste les propositions a eviter ou les risques de coherence.",
    "Le champ options_to_discuss liste des options utiles a explorer avec le user.",
    "Le champ questions_to_clarify liste uniquement les vraies questions manquantes; laisse vide si le sous-skill peut avancer.",
    "Le champ preserve liste ce qu'il faut garder stable dans le plan ou l'action.",
    "Le champ avoid liste ce que Sophia ne doit pas proposer dans sa prochaine reponse.",
    "Le champ guidelines contient des regles concretes que le writer doit suivre pour ce scope.",
    "Guidelines action: role de l'action, intention preservee, pont mini si besoin, pas de changement de nature sans demande explicite.",
    "Guidelines niveau: charge et rythme du niveau courant, baisse temporaire non globale, boundary de fin de niveau, coeur du niveau preserve.",
    "Guidelines whole_plan: trajectoire, coherence globale, prerequis, ordre des phases, objectif et questionnaire preserves.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "adjust_plan_specialized_coach_guidance",
    required_json_shape: {
      observation: "string",
      recommendation: "string",
      warnings: ["string"],
      options_to_discuss: ["string"],
      questions_to_clarify: ["string"],
      preserve: ["string"],
      avoid: ["string"],
      guidelines: ["string"],
      confidence: "low|medium|high",
    },
    scope: input.scope,
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.2,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGeminiFallbackModel("gemini-2.5-flash"),
      source: "adjust_plan.specialized_coach_guidance",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeGuidance(raw, input.scope);
}
