import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";

declare const Deno: any;

export type AdjustPlanCoachScope = "action" | "level" | "whole_plan";

export type WholePlanChangeFamily =
  | "sequence_order_issue"
  | "missing_bridge_or_level"
  | "direction_change"
  | "success_criteria_change"
  | "future_phase_mismatch"
  | "style_or_method_mismatch"
  | "maintenance_or_consolidation_gap"
  | "global_capacity_change"
  | "value_preference_conflict"
  | "plan_no_longer_relevant"
  | "split_merge_restructure"
  | "diagnostic_unclear"
  | "cancel_or_reject";

export type WholePlanCandidateOperation =
  | "diagnostic_only"
  | "reorder"
  | "insert_phase"
  | "replace_phase"
  | "change_emphasis"
  | "change_success_criteria"
  | "pace_change"
  | "maintenance_layer"
  | "split_or_merge_phase"
  | "cancel_or_revise";

export type WholePlanReadiness =
  | "diagnose"
  | "draft_ready"
  | "needs_confirmation"
  | "execute_after_confirmation";

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
  change_family?: WholePlanChangeFamily | null;
  candidate_operation?: WholePlanCandidateOperation | null;
  readiness?: WholePlanReadiness | null;
  must_not_execute_reason?: string | null;
  trajectory_hypothesis?: string | null;
  next_best_question?: string | null;
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
  const explicitFlag = String(
    safeEnvGet("SOPHIA_ADJUST_PLAN_COACH_GUIDANCE") ?? "",
  ).trim();
  if (explicitFlag === "0" || explicitFlag.toLowerCase() === "false") {
    return false;
  }
  return true;
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

function wholePlanChangeFamily(value: unknown): WholePlanChangeFamily | null {
  const raw = String(value ?? "").trim();
  return [
      "sequence_order_issue",
      "missing_bridge_or_level",
      "direction_change",
      "success_criteria_change",
      "future_phase_mismatch",
      "style_or_method_mismatch",
      "maintenance_or_consolidation_gap",
      "global_capacity_change",
      "value_preference_conflict",
      "plan_no_longer_relevant",
      "split_merge_restructure",
      "diagnostic_unclear",
      "cancel_or_reject",
    ].includes(raw)
    ? raw as WholePlanChangeFamily
    : null;
}

function wholePlanCandidateOperation(
  value: unknown,
): WholePlanCandidateOperation | null {
  const raw = String(value ?? "").trim();
  return [
      "diagnostic_only",
      "reorder",
      "insert_phase",
      "replace_phase",
      "change_emphasis",
      "change_success_criteria",
      "pace_change",
      "maintenance_layer",
      "split_or_merge_phase",
      "cancel_or_revise",
    ].includes(raw)
    ? raw as WholePlanCandidateOperation
    : null;
}

function wholePlanReadiness(value: unknown): WholePlanReadiness | null {
  const raw = String(value ?? "").trim();
  return [
      "diagnose",
      "draft_ready",
      "needs_confirmation",
      "execute_after_confirmation",
    ].includes(raw)
    ? raw as WholePlanReadiness
    : null;
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
    change_family: scope === "whole_plan"
      ? wholePlanChangeFamily(root.change_family)
      : null,
    candidate_operation: scope === "whole_plan"
      ? wholePlanCandidateOperation(root.candidate_operation)
      : null,
    readiness: scope === "whole_plan"
      ? wholePlanReadiness(root.readiness)
      : null,
    must_not_execute_reason: root.must_not_execute_reason == null
      ? null
      : String(root.must_not_execute_reason).trim() || null,
    trajectory_hypothesis: root.trajectory_hypothesis == null
      ? null
      : String(root.trajectory_hypothesis).trim() || null,
    next_best_question: root.next_best_question == null
      ? null
      : String(root.next_best_question).trim() || null,
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
    "Si le message ou l'historique donne deja la cible, le changement concret ou les blocs concernes, ne repose pas cette question dans questions_to_clarify.",
    "Le champ preserve liste ce qu'il faut garder stable dans le plan ou l'action.",
    "Le champ avoid liste ce que Sophia ne doit pas proposer dans sa prochaine reponse.",
    "Le champ guidelines contient des regles concretes que le writer doit suivre pour ce scope.",
    "Pour whole_plan, tu dois classer la demande dans change_family: sequence_order_issue, missing_bridge_or_level, direction_change, success_criteria_change, future_phase_mismatch, style_or_method_mismatch, maintenance_or_consolidation_gap, global_capacity_change, value_preference_conflict, plan_no_longer_relevant, split_merge_restructure, diagnostic_unclear, cancel_or_reject.",
    "Pour whole_plan, candidate_operation doit etre l'operation de trajectoire la plus probable: diagnostic_only, reorder, insert_phase, replace_phase, change_emphasis, change_success_criteria, pace_change, maintenance_layer, split_or_merge_phase, cancel_or_revise.",
    "Pour whole_plan, readiness vaut diagnose si Sophia doit d'abord comprendre; draft_ready si le user a donne une solution concrete; needs_confirmation si un brouillon existe et doit etre valide; execute_after_confirmation seulement apres validation explicite.",
    "Pour whole_plan reorder, si le user donne l'ordre actuel et l'ordre cible/test, readiness=draft_ready, questions_to_clarify=[], candidate_operation=reorder, change_family=sequence_order_issue.",
    "Pour whole_plan reorder, ne redemande pas les blocs ou l'ordre actuel quand le message contient deja une liste inline ou numerotee des blocs.",
    "Pour whole_plan, must_not_execute_reason explique pourquoi il ne faut pas appliquer maintenant si le user corrige, refuse, annule, ou si la demande reste vague.",
    "Pour whole_plan, trajectory_hypothesis resume la trajectoire actuelle et la trajectoire possible en une phrase.",
    "Pour whole_plan, next_best_question donne la meilleure question de clarification si readiness=diagnose.",
    "Guidelines action: role de l'action, intention preservee, pont mini si besoin, pas de changement de nature sans demande explicite.",
    "Pour action, si le user donne une cible d'action et une version concrete plus tenable (duree, frequence, format, demarrage, ou contexte), questions_to_clarify=[] et la recommendation doit etre directement exploitable comme handoff.",
    "Pour action, ne redemande pas ce qu'il faut garder si le user a deja donne l'intention ou les elements a preserver.",
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
      change_family:
        "sequence_order_issue|missing_bridge_or_level|direction_change|success_criteria_change|future_phase_mismatch|style_or_method_mismatch|maintenance_or_consolidation_gap|global_capacity_change|value_preference_conflict|plan_no_longer_relevant|split_merge_restructure|diagnostic_unclear|cancel_or_reject|null",
      candidate_operation:
        "diagnostic_only|reorder|insert_phase|replace_phase|change_emphasis|change_success_criteria|pace_change|maintenance_layer|split_or_merge_phase|cancel_or_revise|null",
      readiness:
        "diagnose|draft_ready|needs_confirmation|execute_after_confirmation|null",
      must_not_execute_reason: "string|null",
      trajectory_hypothesis: "string|null",
      next_best_question: "string|null",
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
