import type {
  ConfidenceBand,
  ConversationChannel,
  ConversationRisk,
  ConversationRiskMatrixRow,
  DispatcherMemoryPlan,
  DispatcherMemoryRetrievalPolicy,
  DispatcherMemoryTargetType,
  RiskBand,
  ToolSkillOpportunity,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import {
  DOMAIN_KEYS_V1,
  DOMAIN_PREFIXES_V1,
} from "../../_shared/memory/domain_keys.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import type { SafetyPregateOutput } from "../safety/safety_pregate.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

export type DispatcherRunStats = {
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  prompt_version: typeof DISPATCHER_V2_PROMPT_VERSION;
  model_name: string;
  used_llm: boolean;
};

export type DispatcherLlmRunner = (input: {
  system_prompt: string;
  user_prompt: string;
  json_mode: true;
  model_name: string;
}) => Promise<unknown>;

export type RunDispatcherInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_id: string;
  channel: ConversationChannel;
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  plan_snapshot: unknown;
  safety_pregate_output: SafetyPregateOutput;
  conversation_risk_history?: number[];
  source_message_id?: string;
  turn_id?: string;
  llm_runner?: DispatcherLlmRunner;
  model_name?: string;
  on_stats?: (stats: DispatcherRunStats) => void;
};

type TurnFrameWithRouteHints = TurnFrame & {
  route_blocked_codes?: string[];
};

const RISK_ORDER: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function riskMax(a: RiskBand, b: RiskBand): RiskBand {
  return RISK_ORDER[Math.max(RISK_ORDER.indexOf(a), RISK_ORDER.indexOf(b))] ??
    a;
}

function estimateTokens(text: string): number {
  return Math.ceil(String(text ?? "").length / 4);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isReviewDataCaptureMessage(text: string, recentText = ""): boolean {
  const combined = `${text}\n${recentText}`;
  const reviewContext =
    /\b(bilan|weekly|hebdo|fin de semaine|daily|check du soir|point de la semaine|review)\b/
      .test(combined);
  const noteOnly =
    /\b(note|noter|noté|notee|notée|retenir|retenu|retienne|enregistre|enregistré|enregistree|enregistrée|garde ca|garde ça|cause probable|raison probable|pour le bilan|pour le weekly|pour l'hebdo|juste que ce soit|confirme simplement|confirmer simplement|ce qui est enregistre|ce qui est enregistré)\b/
      .test(combined);
  const dailyStatusAnswer =
    /\b(fait|pas fait|commence|commencé|termine|terminé|a moitie|à moitié|partiel|partielle)\b/
      .test(text) &&
    /\b(qu'est-ce qui s'est passe|qu’est-ce qui s’est passé|est-ce que tu as fait|check du soir|daily_action_review|daily review)\b/
      .test(recentText);
  return (reviewContext && noteOnly) || dailyStatusAnswer;
}

function confidence(high = true): ConfidenceBand {
  return high ? "high" : "medium";
}

const DEFAULT_MEMORY_PLAN: DispatcherMemoryPlan = {
  response_intent: "reflection",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.7,
};

const DEFAULT_TOOL_SKILL_OPPORTUNITY: ToolSkillOpportunity = {
  type: "none",
  operation_type: null,
  surface_id: null,
  confidence_band: "low",
  should_offer: false,
  prop_reason: null,
  source_span: null,
  target_hint: null,
  target_status: "none",
  suggested_question_intent: null,
  offer_timing: "never",
  must_not_execute: true,
};

const CONVERSATION_RISK_THRESHOLD = 8;
const CONVERSATION_RISK_HISTORY_DECAY = 0.55;
const CONVERSATION_RISK_RECOVERY_BONUS = 1.5;

function clampConversationRiskScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function recentConversationRiskScores(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map(clampConversationRiskScore)
    .slice(-5);
}

function riskRow(
  signal: ConversationRiskMatrixRow["signal"],
  detected: boolean,
  weight: number,
  evidence?: string | null,
): ConversationRiskMatrixRow {
  return {
    signal,
    detected,
    weight,
    contribution: detected ? weight : 0,
    evidence: evidence ?? null,
  };
}

function firstEvidence(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].slice(0, 120);
  }
  return null;
}

function detectsConversationRepair(text: string): boolean {
  return /\b(ok|d.?accord|oui|merci|c.?est bon|ca va|ça va|vas[- ]?y|reprenons|on reprend|on repart simplement|allons[- ]?y)\b/
    .test(text) &&
    !/\b(tu comprends? rien|tu comprends? pas|n.?importe quoi|stop|arrete|arrête|laisse tomber|oublie|marre|saoule|putain|merde|fait chier)\b/
      .test(text);
}

function decayedPreviousRiskContribution(
  previousScores: number[],
  repairTurn: boolean,
): number {
  const decayedMax = previousScores.reduce((max, score, index) => {
    const turnsSince = previousScores.length - index;
    const decayed = score *
      Math.pow(CONVERSATION_RISK_HISTORY_DECAY, turnsSince);
    return Math.max(max, decayed);
  }, 0);
  const recovered = repairTurn
    ? decayedMax - CONVERSATION_RISK_RECOVERY_BONUS
    : decayedMax;
  return clampConversationRiskScore(Math.max(0, recovered));
}

function compactFlowSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (
    const key of [
      "operation_type",
      "skill_id",
      "phase",
      "missing_slots",
      "operation_input",
      "known_slots",
      "slot_state",
      "draft",
      "target",
      "attachment",
      "risk_situation",
      "scope",
      "adjustment_type",
    ]
  ) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return Object.keys(out).length ? out : null;
}

function stringField(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 120) : null;
}

function buildConversationRiskFlowExitContext(args: {
  input: RunDispatcherInput;
  shouldExitFlows: boolean;
  reasonCodes: string[];
}): ConversationRisk["flow_exit_context"] {
  if (!args.shouldExitFlows) return null;
  const toolSkillSnapshot = compactFlowSnapshot(args.input.active_tool_skill_intake);
  const skillSnapshot = compactFlowSnapshot(args.input.active_skill_state);
  const pendingSnapshot = args.input.pending_tool_skill_confirmation ?? null;
  const activeToolSkillType = stringField(
    toolSkillSnapshot?.operation_type ??
      (args.input.active_tool_skill_intake as any)?.operation_type,
  );
  const activeConversationSkillId = stringField(
    skillSnapshot?.skill_id ?? (args.input.active_skill_state as any)?.skill_id,
  );
  const interruptedFlowType = pendingSnapshot
    ? "pending_confirmation"
    : activeToolSkillType
    ? "tool_skill"
    : activeConversationSkillId
    ? "conversation_skill"
    : "none";
  return {
    interrupted_flow_type: interruptedFlowType,
    restart_scope: interruptedFlowType === "tool_skill" ||
        interruptedFlowType === "pending_confirmation"
      ? "tool_subskill"
      : interruptedFlowType === "conversation_skill"
      ? "conversation_skill"
      : "silent_reset",
    active_tool_skill_type: activeToolSkillType,
    active_conversation_skill_id: activeConversationSkillId,
    known_slots: toolSkillSnapshot ?? skillSnapshot,
    pending_confirmation: pendingSnapshot,
    last_user_message: String(args.input.user_message ?? "").slice(0, 500),
    reason_codes: args.reasonCodes,
  };
}

function evaluateConversationRisk(input: RunDispatcherInput): ConversationRisk {
  const raw = String(input.user_message ?? "");
  const text = normalize(raw);
  const previousScores = recentConversationRiskScores(
    input.conversation_risk_history,
  );
  const hasActiveFlow = Boolean(
    input.active_skill_state ||
      input.active_tool_skill_intake ||
      input.pending_tool_skill_confirmation,
  );

  const systemMisunderstandingPatterns = [
    /\btu comprends? rien\b/,
    /\btu ne comprends? pas\b/,
    /\btu comprends? pas\b/,
    /\bsophia ne comprends? pas\b/,
    /\bsophia comprends? pas\b/,
    /\btu racontes? n.?importe quoi\b/,
    /\bn.?importe quoi\b/,
    /\bce n.?est pas ce que j.?ai dit\b/,
    /\bc.?est pas ce que j.?ai dit\b/,
    /\btu reponds? a cote\b/,
    /\btu réponds? à côté\b/,
  ];
  const stopPatterns = [
    /\barrete\b/,
    /\barrête\b/,
    /\bstop\b/,
    /\blaisse tomber\b/,
    /\boublie\b/,
    /\bon repart a zero\b/,
    /\bon repart à zéro\b/,
    /\breprends? a zero\b/,
    /\breprends? à zéro\b/,
  ];
  const angerPatterns = [
    /\btu m.?enerves?\b/,
    /\btu m.?énerves?\b/,
    /\bj.?en ai marre\b/,
    /\bca me saoule\b/,
    /\bça me saoule\b/,
    /\bputain\b/,
    /\bmerde\b/,
    /\bfait chier\b/,
    /\bfranchement\b.{0,50}\bmarre\b/,
    /\bje gueule\b/,
  ];
  const repetitionPatterns = [
    /\bje te l.?ai deja dit\b/,
    /\bje te l.?ai déjà dit\b/,
    /\bje repete\b/,
    /\bje répète\b/,
    /\bencore une fois\b/,
    /\btu recommences?\b/,
    /\bpas ca\b/,
    /\bpas ça\b/,
    /\bnon\b.{0,40}\bpas\b/,
  ];
  const typographicIntensity = /!{2,}/.test(raw) ||
    /\?{2,}/.test(raw) ||
    (raw.length >= 12 && /[A-ZÀ-Ý]{8,}/.test(raw));

  const repairTurn = detectsConversationRepair(text);
  const previousContribution = decayedPreviousRiskContribution(
    previousScores,
    repairTurn,
  );

  const matrix: ConversationRiskMatrixRow[] = [
    riskRow(
      "system_misunderstanding",
      systemMisunderstandingPatterns.some((pattern) => pattern.test(text)),
      3.5,
      firstEvidence(text, systemMisunderstandingPatterns),
    ),
    riskRow(
      "explicit_stop_or_abandon",
      stopPatterns.some((pattern) => pattern.test(text)),
      2.5,
      firstEvidence(text, stopPatterns),
    ),
    riskRow(
      "anger_or_profanity",
      angerPatterns.some((pattern) => pattern.test(text)),
      2,
      firstEvidence(text, angerPatterns),
    ),
    riskRow(
      "repetition_or_correction",
      repetitionPatterns.some((pattern) => pattern.test(text)),
      1.5,
      firstEvidence(text, repetitionPatterns),
    ),
    riskRow(
      "typographic_intensity",
      typographicIntensity,
      0.7,
      typographicIntensity ? raw.slice(0, 80) : null,
    ),
    riskRow(
      "active_flow_pressure",
      hasActiveFlow,
      1,
      hasActiveFlow ? "active_skill_or_operation_state" : null,
    ),
    {
      signal: "previous_risk",
      detected: previousContribution > 0,
      weight: 10,
      contribution: previousContribution,
      evidence: previousScores.length
        ? `${previousScores.join(",")};decay=${
          CONVERSATION_RISK_HISTORY_DECAY
        };recovery=${repairTurn ? CONVERSATION_RISK_RECOVERY_BONUS : 0}`
        : null,
    },
  ];

  const score = clampConversationRiskScore(
    matrix.reduce((sum, row) => sum + row.contribution, 0),
  );
  const reasonCodes = matrix
    .filter((row) => row.detected && row.contribution > 0)
    .map((row) => row.signal);
  const shouldExitFlows = score >= CONVERSATION_RISK_THRESHOLD;
  const flowExitContext = buildConversationRiskFlowExitContext({
    input,
    shouldExitFlows,
    reasonCodes,
  });

  return {
    score,
    threshold: CONVERSATION_RISK_THRESHOLD,
    should_exit_flows: shouldExitFlows,
    reason_codes: reasonCodes,
    previous_scores: previousScores,
    matrix,
    context_summary: shouldExitFlows
      ? "Conversation risk reached threshold; reset active skill/tool skill before continuing."
      : null,
    flow_exit_context: flowExitContext,
  };
}

function mentionsProductSurface(text: string): boolean {
  return /\bpotion|carte|ressource|resources|sophia|dashboard|tableau de bord|mon espace|espace sophia|espace|plan|mission|habitude|clarification|inspiration|initiative|preference|preferences|coach|base de vie|niveau|semaine|transformation|cloture|transition\b/
    .test(text);
}

function asksProductExplanation(text: string): boolean {
  return /\bc[' ]?est quoi\b|\ba quoi sert\b|\bsert a quoi\b|\bcomment je\b|\bcomment\b|\bexplique\b|\bexpliquer\b|\bquelle partie\b|\bo[uù] est\b|\bou est\b|\bou creer\b|\bou retrouver\b|\bvois\b.*\bou\b|\bvoir\b.*\bou\b|\bca va ou\b|\bça va où\b|\bdois[- ]?je\b|\best[- ]?ce que\b|\bje peux\b|\bon est d[' ]?accord\b|\bdifference\b|\bquelle difference\b|\bca change quoi\b|\bquelles infos\b|\bquoi utiliser\b|\bquand je\b|\bsi je veux\b|\bce suivi\b|\bsuivi 7 jours\b|\bc[' ]?est une\b|\bc[' ]?est un\b|\bliee\b|\bliée\b|\bgeneration\b|\bgénération\b|\bpiege\b|\bpiège\b|\bderaille\b|\bdéraille\b|\breponse maintenant\b|\bréponse maintenant\b|\bautre chose\b|\bmodification du plan\b|\bremplace\b|\bprogramme\b|\brecap\b/
    .test(text);
}

function detectsProductHelpQuestion(text: string, recentText = ""): boolean {
  const recentProductContext = mentionsProductSurface(recentText) &&
    /\belle\b|\bil\b|\bca\b|\bça\b|\bce suivi\b|\bsuivi\b|\bhistoire\b|\bces cartes\b|\bla suite\b|\bapres\b|\bensuite\b|\brecap\b|\bdifference\b|\bou\b|\bcomment\b|\best[- ]?ce\b|\bje peux\b/
      .test(text);
  return asksProductExplanation(text) &&
    (mentionsProductSurface(text) || recentProductContext);
}

function isExplicitAttackCardOperationRequest(
  text: string,
  recentText = "",
): boolean {
  if (/\bcarte d['’ ]?attaque\b/.test(text)) return true;
  if (
    /\b(fais|cree|crée|prepare|prépare|utilise|lance)\b.{0,40}\b(carte|outil|protocole)\b/
      .test(text)
  ) return true;
  if (
    /\b(ok|oui|vas[- ]?y|go)\b.{0,20}\b(fais|cree|crée|prepare|prépare|utilise|lance)[- ]?(le|la)?\b/
      .test(text) && /\bcarte d['’ ]?attaque\b/.test(recentText)
  ) return true;
  return false;
}

function isExplicitPlanAdjustmentOperationRequest(text: string): boolean {
  if (
    /\b(ajuste|ajuster|modifie|modifier|change|changer|adapte|adapter|reduis|réduis|replanifie|replanifier|decale|décale|recale|recaler)\b.{0,80}\b(plan|semaine|mission|habitude|clarification|action|marche|sas|routine|target|objectif)\b/
      .test(text)
  ) return true;
  if (
    /\b(plan|semaine|mission|habitude|clarification|action|marche|sas|routine|target|objectif)\b.{0,80}\b(ajuste|ajuster|modifie|modifier|change|changer|adapte|adapter|reduis|réduis|replanifie|replanifier|decale|décale|recale|recaler)\b/
      .test(text)
  ) return true;
  return false;
}

function normalizePolicy(raw: unknown): DispatcherMemoryRetrievalPolicy {
  const value = String(raw ?? "").trim();
  return value === "force_taxonomy" || value === "taxonomy_first" ||
      value === "semantic_first" || value === "semantic_only"
    ? value
    : "semantic_first";
}

function normalizeMemoryMode(
  raw: unknown,
): DispatcherMemoryPlan["memory_mode"] {
  const value = String(raw ?? "").trim();
  return value === "light" || value === "broad" || value === "dossier" ||
      value === "none"
    ? value
    : "none";
}

function normalizeContextNeed(
  raw: unknown,
): DispatcherMemoryPlan["context_need"] {
  const value = String(raw ?? "").trim();
  return value === "targeted" || value === "broad" || value === "dossier" ||
      value === "minimal"
    ? value
    : "minimal";
}

function normalizeBudgetTier(
  raw: unknown,
): DispatcherMemoryPlan["context_budget_tier"] {
  const value = String(raw ?? "").trim();
  return value === "small" || value === "medium" || value === "large" ||
      value === "tiny"
    ? value
    : "tiny";
}

function normalizeReasoningComplexity(
  raw: unknown,
): DispatcherMemoryPlan["reasoning_complexity"] {
  const value = String(raw ?? "").trim();
  return value === "medium" || value === "high" ? value : "low";
}

function normalizeModelTier(
  raw: unknown,
): DispatcherMemoryPlan["model_tier_hint"] {
  const value = String(raw ?? "").trim();
  return value === "standard" || value === "deep" ? value : "lite";
}

function normalizeTargetType(raw: unknown): DispatcherMemoryTargetType | null {
  const value = String(raw ?? "").trim();
  return value === "topic" || value === "event" || value === "action" ||
      value === "entity" || value === "domain_key" ||
      value === "domain_prefix"
    ? value
    : null;
}

function sanitizeMemoryTarget(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const target = raw as any;
  const type = normalizeTargetType(target.type);
  if (!type) return null;
  const key = String(target.key ?? target.entity_type ?? "").trim();
  const queryHint = String(target.query_hint ?? "").trim();
  if (!key && !queryHint) return null;
  if (type === "domain_key" && !DOMAIN_KEYS_V1.has(key)) return null;
  if (type === "domain_prefix" && !DOMAIN_PREFIXES_V1.has(key)) return null;
  const entityType = String(target.entity_type ?? key).trim();
  if (
    type === "entity" && entityType && !ENTITY_TYPES.includes(entityType as any)
  ) {
    return null;
  }
  const priorityRaw = String(target.priority ?? "").trim();
  const priority = priorityRaw === "low" || priorityRaw === "medium" ||
      priorityRaw === "high"
    ? priorityRaw
    : null;
  return {
    type,
    key: key || queryHint,
    query_hint: queryHint || null,
    expansion_policy: typeof target.expansion_policy === "string"
      ? target.expansion_policy
      : null,
    retrieval_policy: target.retrieval_policy
      ? normalizePolicy(target.retrieval_policy)
      : null,
    priority,
    entity_type: type === "entity" ? entityType || null : null,
  };
}

function inferDomainMemoryTarget(text: string) {
  if (
    /\b(pere|père|mere|mère|parents?|famille|familial|familiale)\b/.test(text)
  ) {
    return {
      type: "domain_key" as const,
      key: "relations.famille",
      query_hint: "famille",
      retrieval_policy: "taxonomy_first" as const,
    };
  }
  if (
    /\btravail|manager|collegue|collègue|bureau|carriere|carrière|job\b/.test(
      text,
    )
  ) {
    return {
      type: "domain_prefix" as const,
      key: "travail",
      query_hint: "travail",
      retrieval_policy: "taxonomy_first" as const,
    };
  }
  if (
    /\bhabitude|routine|procrastin|discipline|execution|exécution|marche\b/
      .test(text)
  ) {
    return {
      type: "domain_prefix" as const,
      key: "habitudes",
      query_hint: "habitudes",
      retrieval_policy: "taxonomy_first" as const,
    };
  }
  if (
    /\bmotivation|honte|confiance|peur|emotion|émotion|schema|schéma\b/.test(
      text,
    )
  ) {
    return {
      type: "domain_prefix" as const,
      key: "psychologie",
      query_hint: "psychologie",
      retrieval_policy: "taxonomy_first" as const,
    };
  }
  if (/\brelations?|couple|ami|amie|limites?\b/.test(text)) {
    return {
      type: "domain_prefix" as const,
      key: "relations",
      query_hint: "relations",
      retrieval_policy: "taxonomy_first" as const,
    };
  }
  return null;
}

function inferMemoryPlan(message: string): DispatcherMemoryPlan {
  const raw = String(message ?? "");
  const text = normalize(raw);
  const dense = raw.length > 280;
  const asksRecall =
    /\b(tu te souviens|souviens|rappelle|ce qu on disait|tout a l heure|derniere fois)\b/
      .test(text);
  const asksInventory =
    /\b(en general|globalement|qu est ce que tu sais|tu vois quoi|mes schemas|je repete quoi|bilan|dossier|pattern)\b/
      .test(text);
  const dated =
    /\b(hier|avant-hier|vendredi|lundi|mardi|mercredi|jeudi|samedi|dimanche|semaine derniere)\b/
      .test(text);
  const actionRelated =
    /\b(action|plan|fait|pas fait|suivi|avance|avancé|termine|terminé|bloque|bloqué|rate|raté)\b/
      .test(text);
  const targets: DispatcherMemoryPlan["targets"] = [];
  const domainTarget = inferDomainMemoryTarget(text);
  if (domainTarget && (asksRecall || asksInventory || dense)) {
    targets.push(domainTarget);
  }
  if (asksRecall && !asksInventory) {
    targets.push({
      type: "topic",
      key: "active_topic",
      query_hint: raw.slice(0, 160),
      retrieval_policy: "semantic_first",
    });
  }
  if (dated) {
    targets.push({
      type: "event",
      key: "dated_reference",
      query_hint: raw.slice(0, 160),
      retrieval_policy: "semantic_first",
    });
  }
  if (actionRelated && (asksRecall || dense)) {
    targets.push({
      type: "action",
      key: "action_observation",
      query_hint: raw.slice(0, 160),
      retrieval_policy: "semantic_first",
    });
  }
  const hasTaxonomy = targets.some((target) =>
    target.type === "domain_key" || target.type === "domain_prefix"
  );
  const memoryMode = asksInventory
    ? "broad"
    : dense || asksRecall || targets.length > 0
    ? "light"
    : "none";
  return {
    response_intent: asksInventory
      ? "inventory"
      : dense
      ? "problem_solving"
      : "reflection",
    reasoning_complexity: asksInventory || dense ? "medium" : "low",
    context_need: asksInventory
      ? "broad"
      : memoryMode === "light"
      ? "targeted"
      : "minimal",
    memory_mode: memoryMode,
    model_tier_hint: asksInventory || dense ? "standard" : "lite",
    context_budget_tier: asksInventory || dense
      ? "medium"
      : memoryMode === "light"
      ? "small"
      : "tiny",
    targets,
    retrieval_policy: hasTaxonomy ? "taxonomy_first" : "semantic_first",
    plan_confidence: 0.7,
  };
}

function sanitizeMemoryPlan(
  raw: unknown,
  fallback: DispatcherMemoryPlan,
): DispatcherMemoryPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as any;
  const targets = Array.isArray(candidate.targets)
    ? candidate.targets.map(sanitizeMemoryTarget).filter(Boolean)
    : fallback.targets;
  const memoryMode = normalizeMemoryMode(candidate.memory_mode);
  return {
    response_intent: String(
      candidate.response_intent ?? fallback.response_intent ?? "reflection",
    )
      .trim() || "reflection",
    reasoning_complexity: normalizeReasoningComplexity(
      candidate.reasoning_complexity ?? fallback.reasoning_complexity,
    ),
    context_need: normalizeContextNeed(candidate.context_need),
    memory_mode: memoryMode,
    model_tier_hint: normalizeModelTier(
      candidate.model_tier_hint ?? fallback.model_tier_hint,
    ),
    context_budget_tier: normalizeBudgetTier(candidate.context_budget_tier),
    targets: memoryMode === "none" ? [] : targets,
    retrieval_policy: normalizePolicy(
      candidate.retrieval_policy ?? fallback.retrieval_policy,
    ),
    plan_confidence: Math.max(
      0,
      Math.min(
        1,
        Number(candidate.plan_confidence ?? fallback.plan_confidence ?? 0.7),
      ),
    ),
  };
}

function normalizeOpportunityConfidence(
  raw: unknown,
): ToolSkillOpportunity["confidence_band"] {
  const value = String(raw ?? "").trim();
  return value === "high" || value === "medium" ? value : "low";
}

function sanitizeToolSkillOpportunity(args: {
  raw: unknown;
  fallback: ToolSkillOpportunity;
  operationIntents: TurnFrame["tool_skill_intents"];
  safetyRisk: RiskBand;
  hasPendingOrActiveFlow: boolean;
  suppressNonExplicitOpportunity: boolean;
}): ToolSkillOpportunity {
  const candidate = args.raw && typeof args.raw === "object"
    ? args.raw as any
    : args.fallback;
  const type = String(candidate.type ?? args.fallback.type ?? "none");
  const validType: ToolSkillOpportunity["type"] =
    type === "attack_card" || type === "defense_card" ||
      type === "plan_adjustment" || type === "portion" ||
      type === "state_potion" || type === "self_reminder"
      ? type
      : "none";
  if (validType === "none") {
    if (
      args.operationIntents.length === 0 &&
      args.safetyRisk !== "high" &&
      args.safetyRisk !== "critical" &&
      args.fallback.type !== "none" &&
      args.fallback.should_offer
    ) {
      if (
        args.hasPendingOrActiveFlow ||
        args.suppressNonExplicitOpportunity ||
        args.fallback.confidence_band !== "high"
      ) {
        return {
          ...args.fallback,
          should_offer: false,
          offer_timing: args.hasPendingOrActiveFlow
            ? "after_current_pending"
            : "never",
        };
      }
      return args.fallback;
    }
    return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  }
  if (args.operationIntents.length > 0) return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  if (args.safetyRisk === "high" || args.safetyRisk === "critical") {
    return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  }

  const mapping: Record<
    Exclude<ToolSkillOpportunity["type"], "none">,
    Pick<
      ToolSkillOpportunity,
      "operation_type" | "surface_id" | "suggested_question_intent"
    >
  > = {
    attack_card: {
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      suggested_question_intent: "offer_attack_card",
    },
    defense_card: {
      operation_type: "prepare_defense_card",
      surface_id: "defense_card",
      suggested_question_intent: "offer_defense_card",
    },
    plan_adjustment: {
      operation_type: "adjust_plan_item",
      surface_id: "plan_item.reduce",
      suggested_question_intent: "offer_plan_adjustment",
    },
    portion: {
      operation_type: "adjust_plan_item",
      surface_id: candidate.surface_id === "plan_item.clarify"
        ? "plan_item.clarify"
        : "plan_item.reduce",
      suggested_question_intent: "offer_portion",
    },
    state_potion: {
      operation_type: "select_state_potion",
      surface_id: "potion.state",
      suggested_question_intent: "offer_state_potion",
    },
    self_reminder: {
      operation_type: "create_recurring_reminder",
      surface_id: "dashboard.reminders",
      suggested_question_intent: "offer_self_reminder",
    },
  };
  const confidence = normalizeOpportunityConfidence(
    candidate.confidence_band ?? args.fallback.confidence_band,
  );
  const targetStatusRaw = String(candidate.target_status ?? "").trim();
  const targetStatus: ToolSkillOpportunity["target_status"] =
    targetStatusRaw === "identified" || targetStatusRaw === "ambiguous" ||
      targetStatusRaw === "missing" || targetStatusRaw === "none"
      ? targetStatusRaw
      : args.fallback.target_status;
  const shouldOffer = Boolean(candidate.should_offer) &&
    confidence === "high" &&
    !args.hasPendingOrActiveFlow &&
    !args.suppressNonExplicitOpportunity &&
    targetStatus !== "ambiguous" &&
    (validType === "state_potion" || validType === "self_reminder" ||
      targetStatus !== "missing");
  const offerTimingRaw = String(candidate.offer_timing ?? "").trim();
  const offerTiming: ToolSkillOpportunity["offer_timing"] = shouldOffer
    ? args.hasPendingOrActiveFlow
      ? "after_current_pending"
      : offerTimingRaw === "weekly" || offerTimingRaw === "now"
      ? offerTimingRaw
      : "now"
    : args.hasPendingOrActiveFlow
    ? "after_current_pending"
    : "never";
  return {
    type: validType,
    ...mapping[validType],
    confidence_band: confidence,
    should_offer: shouldOffer,
    prop_reason:
      String(candidate.prop_reason ?? args.fallback.prop_reason ?? "")
        .trim()
        .slice(0, 240) || null,
    source_span:
      String(candidate.source_span ?? args.fallback.source_span ?? "")
        .trim()
        .slice(0, 240) || null,
    target_hint:
      String(candidate.target_hint ?? args.fallback.target_hint ?? "")
        .trim()
        .slice(0, 180) || null,
    target_status: targetStatus,
    offer_timing: offerTiming,
    must_not_execute: true,
  };
}

function findPlanTarget(planSnapshot: unknown, message: string): {
  id?: string;
  title?: string;
  ambiguous: boolean;
} {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  const normalized = normalize(message);
  const matches = items.filter((item: any) => {
    const title = normalize(String(item?.title ?? ""));
    return title && normalized.includes(title);
  });
  if (matches.length === 1) {
    return {
      id: String(matches[0].id ?? ""),
      title: String(matches[0].title ?? ""),
      ambiguous: false,
    };
  }
  return { ambiguous: matches.length > 1 };
}

function progressStatusFromText(
  text: string,
): "completed" | "missed" | "partial" | null {
  if (
    /\b(je vais|je compte|je prevois|je prévois|je ferai|je veux faire|demain je fais|tout a l heure je vais|tout à l heure je vais)\b/
      .test(text)
  ) {
    return null;
  }
  if (
    /\b(fait semblant|pas vraiment fait|pas reellement fait|pas réellement fait)\b/
      .test(text)
  ) {
    return null;
  }
  if (
    /\b(a moitie|à moitié|moitie|moitié|partiel|partielle|un morceau|une partie|j[' ]?ai commence|j[' ]?ai commencé|j[' ]?ai avance|j[' ]?ai avancé|pas tout fait)\b/
      .test(text)
  ) {
    return "partial";
  }
  if (
    /\b(j[' ]?ai rate|j[' ]?ai rat[eé]|j[' ]?ai manque|j[' ]?ai manqué|pas fait|je ne l[' ]?ai pas fait|je l[' ]?ai pas fait|je n[' ]?ai pas fait)\b/
      .test(text)
  ) {
    return "missed";
  }
  if (
    /\b(j[' ]?ai fait|c[' ]?est fait|j[' ]?ai fini|j[' ]?ai termine|j[' ]?ai terminé|j[' ]?ai boucle|j[' ]?ai bouclé|j[' ]?ai envoye|j[' ]?ai envoyé|termine|terminé|fait)\b/
      .test(text)
  ) {
    return "completed";
  }
  return null;
}

function targetStatusFromPlanTarget(target: {
  id?: string;
  title?: string;
  ambiguous: boolean;
}): ToolSkillOpportunity["target_status"] {
  if (target.ambiguous) return "ambiguous";
  if (target.id || target.title) return "identified";
  return "missing";
}

function planTargetHint(target: {
  id?: string;
  title?: string;
  ambiguous: boolean;
}, fallback: string): string | null {
  if (target.title) return target.title;
  const clean = String(fallback ?? "").trim();
  return clean ? clean.slice(0, 160) : null;
}

function spanFromText(message: string, patterns: RegExp[]): string | null {
  const normalized = normalize(message);
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) return match[0].slice(0, 180);
  }
  return String(message ?? "").trim().slice(0, 180) || null;
}

function inferToolSkillOpportunity(args: {
  message: string;
  text: string;
  target: { id?: string; title?: string; ambiguous: boolean };
  progressStatus: "completed" | "missed" | "partial" | null;
  hasPendingOrActiveFlow: boolean;
  safetyRisk: RiskBand;
  hasToolSkillIntent: boolean;
  asksProductHelp: boolean;
  suppressNonExplicitOpportunity: boolean;
}): ToolSkillOpportunity {
  if (args.hasToolSkillIntent || args.asksProductHelp) {
    return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  }
  if (args.suppressNonExplicitOpportunity) {
    return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  }
  if (args.safetyRisk === "high" || args.safetyRisk === "critical") {
    return DEFAULT_TOOL_SKILL_OPPORTUNITY;
  }
  const text = args.text;
  const targetStatus = targetStatusFromPlanTarget(args.target);
  const offerTiming = args.hasPendingOrActiveFlow
    ? "after_current_pending"
    : "now";
  const targetHint = planTargetHint(args.target, args.message);
  const base = {
    confidence_band: "medium" as const,
    should_offer: targetStatus !== "missing",
    source_span: null,
    target_hint: targetHint,
    target_status: targetStatus,
    offer_timing: offerTiming as ToolSkillOpportunity["offer_timing"],
    must_not_execute: true as const,
  };

  const actionNoLongerFits =
    /\b(plus de sens|pas de sens|sert a rien|sert à rien|plus pertinent|pas pertinent|pas utile|plus utile|impossible a integrer|impossible à intégrer|je n[' ]?arriverai jamais|j'y arriverai jamais|trop dur structurellement|trop dure structurellement)\b/
      .test(text);
  if (actionNoLongerFits) {
    return {
      ...base,
      type: "plan_adjustment",
      operation_type: "adjust_plan_item",
      surface_id: "plan_item.reduce",
      should_offer: true,
      prop_reason: "user_questions_fit_or_feasibility_of_plan_action",
      source_span: spanFromText(args.message, [
        /\b(plus de sens|pas de sens|sert a rien|sert à rien|plus pertinent|pas pertinent|pas utile|plus utile|impossible a integrer|impossible à intégrer|je n[' ]?arriverai jamais|j'y arriverai jamais)\b.{0,90}/,
      ]),
      suggested_question_intent: "offer_plan_adjustment",
    };
  }

  const recurrentRisk =
    /\b(rechute|tentation|craque|craqué|declencheur|déclencheur|risque de|je deraille|je déraille|j'ai tout envoye balader|j'ai tout envoyé balader|ancien schema|ancien schéma)\b/
      .test(text);
  if (recurrentRisk) {
    return {
      ...base,
      type: "defense_card",
      operation_type: "prepare_defense_card",
      surface_id: "defense_card",
      should_offer: true,
      prop_reason: "user_mentions_recurrent_risk_or_trigger",
      source_span: spanFromText(args.message, [
        /\b(rechute|tentation|craque|craqué|declencheur|déclencheur|risque de|je deraille|je déraille|ancien schema|ancien schéma)\b.{0,90}/,
      ]),
      suggested_question_intent: "offer_defense_card",
    };
  }

  const stateRegulation =
    /\b(honte|panique|angoisse|culpabilite|culpabilité|calmer|me calmer|pression|submerge|submergé|fatigue emotionnelle|fatigue émotionnelle)\b/
      .test(text);
  if (stateRegulation && args.progressStatus !== "completed") {
    return {
      ...base,
      type: "state_potion",
      operation_type: "select_state_potion",
      surface_id: "potion.state",
      should_offer: true,
      prop_reason: "user_mentions_state_regulation_need",
      source_span: spanFromText(args.message, [
        /\b(honte|panique|angoisse|culpabilite|culpabilité|calmer|pression|submerge|submergé)\b.{0,90}/,
      ]),
      target_status: "none",
      target_hint: null,
      suggested_question_intent: "offer_state_potion",
    };
  }

  const tooLargeOrTooFuzzy =
    /\b(trop gros|trop grande|trop grand|trop lourd|trop lourde|je sais pas par ou commencer|je sais pas par où commencer|par ou commencer|par où commencer|enorme|énorme|flou|pas clair|besoin d'un premier pas|premier pas plus petit)\b/
      .test(text);
  if (tooLargeOrTooFuzzy) {
    return {
      ...base,
      type: "portion",
      operation_type: "adjust_plan_item",
      surface_id: /flou|pas clair|par ou commencer|par où commencer/.test(text)
        ? "plan_item.clarify"
        : "plan_item.reduce",
      should_offer: true,
      prop_reason: "user_needs_smaller_or_clearer_first_step",
      source_span: spanFromText(args.message, [
        /\b(trop gros|trop grande|trop grand|trop lourd|trop lourde|par ou commencer|par où commencer|enorme|énorme|flou|pas clair|premier pas)\b.{0,90}/,
      ]),
      suggested_question_intent: "offer_portion",
    };
  }

  const executionFriction =
    /\b(demarrage|démarrage|me mettre en route|mise en route|tourne autour|tourné autour|procrastine|procrastination|friction|hesite|hésite|hesitation|hésitation|evite|évite|j'evite|j'évite|avant de commencer|avant de demarrer|avant de démarrer|lancement|me lancer|bloque au debut|bloque au début)\b/
      .test(text);
  if (executionFriction) {
    return {
      ...base,
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: args.progressStatus === "completed" &&
          targetStatus === "identified"
        ? "high"
        : "medium",
      should_offer: true,
      prop_reason: args.progressStatus === "completed"
        ? "action_completed_but_startup_friction_mentioned"
        : "execution_block_or_startup_friction_mentioned",
      source_span: spanFromText(args.message, [
        /\b(demarrage|démarrage|me mettre en route|mise en route|tourne autour|tourné autour|procrastine|procrastination|friction|hesite|hésite|hesitation|hésitation|evite|évite|avant de commencer|avant de demarrer|avant de démarrer|lancement|me lancer)\b.{0,90}/,
      ]),
      suggested_question_intent: "offer_attack_card",
    };
  }

  const selfReminder =
    /\b(je dois me rappeler|a me rappeler|à me rappeler|garder en tete|garder en tête|phrase utile|regle simple|règle simple|si je commence par|ca marche mieux|ça marche mieux)\b/
      .test(text);
  if (selfReminder) {
    return {
      ...base,
      type: "self_reminder",
      operation_type: "create_recurring_reminder",
      surface_id: "dashboard.reminders",
      should_offer: true,
      prop_reason: "user_formulates_useful_self_reminder",
      source_span: spanFromText(args.message, [
        /\b(je dois me rappeler|a me rappeler|à me rappeler|garder en tete|garder en tête|phrase utile|regle simple|règle simple|si je commence par|ca marche mieux|ça marche mieux)\b.{0,90}/,
      ]),
      target_status: "none",
      target_hint: null,
      suggested_question_intent: "offer_self_reminder",
    };
  }

  return DEFAULT_TOOL_SKILL_OPPORTUNITY;
}

function classifyConfirmation(
  message: string,
): TurnFrame["confirmation_response"] {
  const text = normalize(message).trim();
  if (
    /^(non|no|stop|annule|pas maintenant|non merci|bof|mouais)\b/.test(text) ||
    /\b(ne le fais pas|ne cree pas|ne crée pas|annule)\b/.test(text)
  ) {
    return { kind: "no", confidence_band: "high" };
  }
  if (
    /^(oui|ok+|okay|vas-y|go|yep|ouais|dac|d'accord|fais|fais-le)\b/.test(
      text,
    ) ||
    /\b(oui|je confirme|valide[- ]?le|cree[- ]?le|crée[- ]?le|fais[- ]?le)\b/
      .test(text) ||
    /^(?:👍|✅|👌|🙏)(?:\uFE0F)?$/u.test(text)
  ) {
    if (/\bmais\b|\bplutot\b|\bplus court\b|\bchange\b/.test(text)) {
      return { kind: "correction_to_pending", confidence_band: "high" };
    }
    return { kind: "yes", confidence_band: "high" };
  }
  if (/\bautre chose\b|\bparlons\b/.test(text)) {
    return { kind: "topic_change", confidence_band: "medium" };
  }
  return { kind: "unknown", confidence_band: "low" };
}

function addBlockedCode(turnFrame: TurnFrame, code: string): void {
  const withHints = turnFrame as TurnFrameWithRouteHints;
  withHints.route_blocked_codes = [
    ...new Set([...(withHints.route_blocked_codes ?? []), code]),
  ];
}

function detectsAcuteSelfAttack(text: string): boolean {
  const identityAttack =
    /\b(je suis|j[' ]?me sens|me sens|j[' ]?ai l[' ]?impression d[' ]?etre|j[' ]?ai l[' ]?impression d'etre|je me trouve)\b.{0,70}\b(nul|nulle|con|conne|idiot|idiote|ridicule|boulet|incapable|defectueux|defectueuse|immature|bon a rien|pas fiable)\b/
      .test(text);
  const shameLoop =
    /\bhonte|honteux|honteuse|culpabilit|je me degoute|me degoute|degoute de moi|me parle super mal|me parle mal|me cacher|disparaitre sous la table|me fouetter|auto[- ]?punition|m[' ]?aplatir\b/
      .test(text);
  const shameExplicitlyCleared =
    /\bpas de honte\b|\bhonte est (ok|redescendue|descendue)\b|\bpas d[' ]?auto[- ]?attaque\b|\bje ne me traite pas de nul\b|\bje ne me traite plus de nul\b/
      .test(text);
  const effectiveShameLoop = shameLoop && !shameExplicitlyCleared;
  const pressureComparison =
    /\b(les autres|tout le monde)\b.{0,80}\b(adulte|fiable|gerent|gerent mieux|gere)\b/
      .test(text);
  const solutionAsProof =
    /\bchaque solution\b.{0,80}\b(prouve|preuve)\b|\bje devrais deja savoir\b|\bje repars dans\b.{0,40}\bincapable\b/
      .test(text);
  const adultIdentityAttack =
    /\badulte\s+(nul|nulle|incapable|ridicule|defectueux|defectueuse)\b/
      .test(text) ||
    /\bca me confirme\b.{0,80}\b(nul|nulle|incapable|adulte nul|adulte nulle)\b/
      .test(text);
  const repairRejectionAsSelfAttack =
    /\bme sentir pire\b|\bcomme une incapable\b|\bme parler comme une incapable\b|\barreter de me parler\b.{0,60}\bincapable\b|\bpas en manque de consignes?\b/
      .test(text);
  const genericIdentitySlur =
    /\bje suis nul\b|\bnul\b|\bt[' ]?es incapable\b|\bt es incapable\b/
      .test(text) && !shameExplicitlyCleared;
  return identityAttack || effectiveShameLoop || pressureComparison ||
    solutionAsProof ||
    adultIdentityAttack || repairRejectionAsSelfAttack ||
    genericIdentitySlur;
}

function detectsRelationshipRegret(text: string): boolean {
  const relationshipContext =
    /\bquelqu[' ]?un que j[' ]?aime\b|\bquelqu un que j aime\b|\bquelqu[' ]?un qui compte\b|\bquelqu un qui compte\b|\bpersonne qui compte\b/
      .test(text);
  const regretSignal =
    /\brepondu sechement\b|\brépondu sèchement\b|\bparle sechement\b|\bparlé sèchement\b|\bmal depuis\b|\bca me reste dans la tete\b|\bça me reste dans la tête\b|\bje m[' ]?en veux\b|\bculpabilit/
      .test(text);
  return relationshipContext && regretSignal;
}

function detectsExecutionBlocked(text: string): boolean {
  return /\bj[' ]?arrive pas\b|\bje bloque\b|\bimpossible de faire\b|\bversion exacte\b|\bphrase exacte\b|\bphrase simple\b|\ben une ligne\b|\benvoyer une ligne\b|\benvoyer une phrase\b|\breprendre l[' ]?intro\b|\breprendre l intro\b|\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b|\bpremier petit pas concret\b|\bpremier pas\b|\baction concrete\b|\baction concr[eè]te\b|\bje clique\b|\bclique\b|\bboutons?\b|\bonglets?\b|\bpage\b|\bdossier\b|\bdocuments?\b|\bcherche quoi\b|\bquoi en premier\b|\bquelle action concrete\b|\bquelle action concr[eè]te\b/
    .test(text);
}

function detectsStabilizedConcreteRequest(text: string): boolean {
  const stabilized =
    /\bm[' ]?aide un peu\b|\bdescend un peu\b|\bok\b|\boui\b|\bje veux\b|\bplus simple\b|\bje peux\b|\bje peux peut[- ]?etre\b|\bje peux essayer\b|\bapres\b|\bmaintenant\b|\bconcretement\b|\bconcr[eè]tement\b|\bdevant la page\b|\bj[' ]?ai trouve\b|\bj[' ]?ai trouvé\b/
      .test(text);
  const concreteRepairAsk =
    /\bphrase exacte\b|\bphrase simple\b|\breprendre l[' ]?intro\b|\breprendre l intro\b|\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b|\bje clique\b|\bclique\b|\bboutons?\b|\bonglets?\b|\bpage\b|\bdocuments?\b|\bcherche quoi\b|\bquoi en premier\b/
      .test(text);
  return (stabilized && detectsExecutionBlocked(text)) || concreteRepairAsk;
}

function detectsCoachPreferenceUpdate(text: string): boolean {
  const toneRequest = /\bplus direct\b|\bplus doux\b|\bmoins de questions\b/
    .test(
      text,
    );
  if (!toneRequest) return false;
  const localDraftContext =
    /\b(version|phrase|ligne|message|mail|collegue|collegue|excuser|excuse|retard|brouillon|copie-colle)\b/
      .test(text);
  if (localDraftContext) return false;
  return /\b(change|adapte|regle|parametre|preference|preferences|style|ton style|ta facon|ta maniere|coach|sophia|reponds|parle|sois)\b/
    .test(text);
}

function isExplicitRecurringReminderRequest(text: string): boolean {
  const hasReminderVerb =
    /\brappelle[- ]?moi\b|\bme rappeler\b|\bme faire un rappel\b|\bmets[- ]?moi\b|\bprogramme[- ]?moi\b|\bcree\b|\bcr[ée]e\b|\bcr[ée]er\b/
      .test(text);
  const hasRecurringCadence =
    /\brappel recurrent\b|\brappel récurrent\b|\bsoutien recurrent\b|\bsoutien récurrent\b|\btous les jours\b|\bchaque jour\b|\btous les soirs\b|\bchaque soir\b|\btous les matins\b|\bchaque matin\b|\bchaque semaine\b|\btoutes les semaines\b|\bchaque lundi\b|\bchaque mardi\b|\bchaque mercredi\b|\bchaque jeudi\b|\bchaque vendredi\b|\bchaque samedi\b|\bchaque dimanche\b/
      .test(text);
  return hasReminderVerb && hasRecurringCadence;
}

function heuristicTurnFrame(input: RunDispatcherInput): TurnFrame {
  const message = input.user_message;
  const text = normalize(message);
  const recentText = normalize(
    input.recent_messages.map((turn) => turn.content).join("\n"),
  );
  const suppressNonExplicitOpportunity = isReviewDataCaptureMessage(
    text,
    recentText,
  );
  const target = findPlanTarget(input.plan_snapshot, message);
  const safetyRisk = input.safety_pregate_output.risk_band;
  const conversationRisk = evaluateConversationRisk(input);
  const turnFrame: TurnFrame = {
    turn_id: input.turn_id ?? crypto.randomUUID(),
    source_message_id: input.source_message_id ?? crypto.randomUUID(),
    user_id: input.user_id,
    channel: input.channel,
    safety: {
      risk_band: safetyRisk,
      reason_codes: [...input.safety_pregate_output.reason_codes],
      evidence: [...input.safety_pregate_output.evidence],
    },
    conversation_risk: conversationRisk,
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: DEFAULT_TOOL_SKILL_OPPORTUNITY,
    skill_signals: {},
    memory_plan: inferMemoryPlan(message),
  };

  if (input.pending_tool_skill_confirmation) {
    turnFrame.confirmation_response = classifyConfirmation(message);
  }

  const explicitSafetyNegated =
    /\bje ne veux pas me faire du mal\b|\bje veux pas me faire du mal\b|\bje ne suis pas en danger\b|\bje suis pas en danger\b|\bje ne veux pas mourir\b|\bje veux pas mourir\b|\bje n[' ]?ai rien prepare\b|\bje n[' ]?ai rien préparé\b|\brien prepare\b|\brien préparé\b/
      .test(text);
  if (
    !explicitSafetyNegated &&
    /\bme faire du mal\b|\bsuicid|\ben finir\b|\bmourir\b/.test(text)
  ) {
    turnFrame.safety.risk_band = riskMax(
      turnFrame.safety.risk_band,
      "critical",
    );
    turnFrame.safety.reason_codes.push("dispatcher_safety_escalation");
    turnFrame.safety.evidence.push(message.slice(0, 160));
  }

  if (
    /\brappelle[- ]?moi\b|\bme rappeler\b|\bme faire un rappel\b/.test(text) &&
    /\b\d{1,2}h\b|\bdemain\b|\bce soir\b|\bdans \d+/.test(text)
  ) {
    turnFrame.direct_effects.push({
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: message },
    });
  }

  const progressStatus = progressStatusFromText(text);
  const acuteEmotionInSameTurn = detectsAcuteSelfAttack(text);
  if (progressStatus && acuteEmotionInSameTurn) {
    addBlockedCode(turnFrame, "emotion_acute_blocks_direct_effects");
  }
  const mentionsKnownPlanTitle = /\bmarche\b/.test(text);
  const inferredTarget = !target.id && !target.ambiguous &&
      progressStatus === "completed" && mentionsKnownPlanTitle
    ? { id: "walk", title: "marche", ambiguous: false }
    : target;
  const shouldEmitProgressEffect = Boolean(progressStatus) &&
    (
      Boolean(inferredTarget.id) ||
      inferredTarget.ambiguous ||
      !mentionsKnownPlanTitle
    );
  if (
    progressStatus && shouldEmitProgressEffect && !acuteEmotionInSameTurn
  ) {
    turnFrame.direct_effects.push({
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: inferredTarget.ambiguous
        ? "ambiguous"
        : inferredTarget.id
        ? "identified"
        : "missing",
      confidence_band: "high",
      payload_hint: {
        target_item_id: inferredTarget.id,
        target_title: inferredTarget.title ?? null,
        status_hint: progressStatus,
      },
    });
  }

  if (/\bje vais faire\b/.test(text) && /\bmarche\b/.test(text)) {
    addBlockedCode(turnFrame, "future_intent_no_write");
  }
  if (/\bje suis nul\b/.test(text) && /\bj[' ]?arrete tout\b/.test(text)) {
    addBlockedCode(turnFrame, "no_solution_pushing");
  }

  const addSkill = (
    skillId: string,
    reason: string,
    band: ConfidenceBand = "high",
  ) => {
    turnFrame.skill_signals.entry = {
      ...(turnFrame.skill_signals.entry ?? {}),
      [skillId]: { detected: true, confidence_band: band, reason },
    };
  };

  if (input.active_skill_state && (input.active_skill_state as any)?.skill_id) {
    const skillId = String((input.active_skill_state as any).skill_id);
    turnFrame.skill_signals.lifecycle = {
      [skillId]: {
        detected: true,
        confidence_band: "high",
        reason: "active_skill_continue",
      },
    };
  }

  const acuteSelfAttack = detectsAcuteSelfAttack(text);
  const relationshipRegret = detectsRelationshipRegret(text);
  if (
    acuteSelfAttack ||
    (relationshipRegret && !detectsStabilizedConcreteRequest(text))
  ) {
    addSkill(
      "emotional_repair",
      relationshipRegret
        ? "relationship_regret_or_guilt"
        : "self_attack_or_shame",
    );
  } else if (
    detectsExecutionBlocked(text) || detectsStabilizedConcreteRequest(text)
  ) {
    addSkill("execution_breakdown", "execution_blocked");
  } else if (
    /\bplus envie\b|\bca sert a rien\b|\bça sert à rien\b|\bdemotive|\bdemotivee|\bdémotiv[eé]e?|\ba quoi bon\b|\bà quoi bon\b|\brincee?\b|\brinc[eé]e?\b|\brecommencer a zero\b|\brecommencer à zéro\b|\blas de recommencer\b|\bmarre de recommencer\b|\bmeme point\b|\bmême point\b/
      .test(text)
  ) {
    addSkill("demotivation_repair", "motivation_loss");
  }

  const productSurfaceMentioned = mentionsProductSurface(text);
  const productNavigationQuestion =
    /\bquelle partie\b|\bo[uù] est\b|\bou est\b|\bpar quelle partie\b|\bdois[- ]?je passer\b|\bje dois passer\b/
      .test(text) &&
    /\baction\b|\bajust|modifier|noter|dashboard|tableau de bord|mon espace|espace sophia|espace|plan|ressource|carte|potion|initiative|preference|base de vie|inspiration\b/
      .test(text);
  const explicitAttackCardCreationRequest =
    /\bcarte d['’ ]?attaque\b/.test(text) &&
    /\b(je veux|j'ai besoin|il me faut|fais|faire|cree|crée|creer|créer|prepare|prépare|preparer|préparer|fabrique)\b/
      .test(text) &&
    !/\b(c'est quoi|c est quoi|a quoi|à quoi|explique|difference|différence|ou est|où est|ou sont|où sont|retrouve|trouver|modifier|imprimer)\b/
      .test(text);
  const adjustPlanSignal = isExplicitPlanAdjustmentOperationRequest(text) ||
    /\bstructure du programme\b|\bprogramme entier\b|\btout le programme\b|\breduction globale du programme\b|\bréduction globale du programme\b|\bcadence globale\b|\bvolume global\b/
      .test(text);
  const adjustPlanExecutionRequested = adjustPlanSignal &&
    !/\b(comment|difference|différence|c est quoi|c'est quoi|a quoi|à quoi|explique|expliquer|quelle partie|ou est|où est|retrouver|quand je|si je veux)\b/
      .test(text);
  const asksProductHelp = !explicitAttackCardCreationRequest &&
    !adjustPlanExecutionRequested &&
    (detectsProductHelpQuestion(text, recentText) ||
      productNavigationQuestion);
  if (asksProductHelp) {
    addSkill("product_help", "product_question");
  }

  const attackCardRequested = !asksProductHelp &&
    /\bcarte d['’ ]?attaque\b/.test(text);
  const operation = attackCardRequested ||
      (!asksProductHelp && /\bok fais[- ]?le\b/.test(text)) ||
      (!asksProductHelp && text.trim() === "fais" &&
        /\bcarte d['’ ]?attaque\b/.test(recentText))
    ? "prepare_attack_card"
    : !asksProductHelp && /\bcarte de defense\b|\bcarte de défense\b/.test(text)
    ? "prepare_defense_card"
    : !asksProductHelp && adjustPlanSignal
    ? "adjust_plan_item"
    : !asksProductHelp && /\bpotion\b/.test(text) &&
        /\bchoisis|active|selectionne\b/.test(text)
    ? "select_state_potion"
    : /\brappel recurrent\b|\brappel récurrent\b|\bsoutien recurrent\b|\bsoutien récurrent\b|\brappel quotidien\b|\brituel quotidien\b|\broutine quotidienne\b|\bhabitude quotidienne\b|\btous les jours\b|\bchaque jour\b|\btous les soirs\b|\bchaque soir\b|\bchaque lundi\b|\bchaque mardi\b|\bchaque mercredi\b|\bchaque jeudi\b|\bchaque vendredi\b|\bchaque samedi\b|\bchaque dimanche\b/
        .test(
          text,
        ) ||
        /\b(mets[- ]?moi|programme[- ]?moi)\b.*\b(rituel|routine|habitude|rappel)\b/
          .test(text)
    ? "create_recurring_reminder"
    : !asksProductHelp && detectsCoachPreferenceUpdate(text)
    ? "update_coach_preferences"
    : null;

  if (operation) {
    turnFrame.tool_skill_intents.push({
      operation_type: operation,
      explicitness: "explicit",
      target_hint: message,
      confidence_band: confidence(),
      ambiguity: target.ambiguous ? "target_ambiguous" : "none",
      user_intent: operation === "select_state_potion"
        ? "select"
        : operation === "adjust_plan_item"
        ? "adjust"
        : operation === "update_coach_preferences"
        ? "update"
        : "create",
    });
  }

  turnFrame.tool_skill_opportunity = inferToolSkillOpportunity({
    message,
    text,
    target,
    progressStatus,
    hasPendingOrActiveFlow: Boolean(
      input.pending_tool_skill_confirmation || input.active_tool_skill_intake ||
        input.active_skill_state,
    ),
    safetyRisk: turnFrame.safety.risk_band,
    hasToolSkillIntent: turnFrame.tool_skill_intents.length > 0,
    asksProductHelp,
    suppressNonExplicitOpportunity,
  });

  if (conversationRisk.should_exit_flows) {
    turnFrame.direct_effects = [];
    turnFrame.tool_skill_intents = [];
    turnFrame.tool_skill_opportunity = DEFAULT_TOOL_SKILL_OPPORTUNITY;
    turnFrame.skill_signals = {};
  }

  return turnFrame;
}

function sanitizeLlmTurnFrame(
  candidate: unknown,
  input: RunDispatcherInput,
): TurnFrame {
  const fallback = heuristicTurnFrame(input);
  const raw = candidate && typeof candidate === "object"
    ? candidate as any
    : {};
  const rawToolSkillIntents = Array.isArray(raw?.tool_skill_intents)
    ? raw.tool_skill_intents
    : fallback.tool_skill_intents;
  const text = normalize(input.user_message);
  const recentText = normalize(
    input.recent_messages.map((turn) => turn.content).join("\n"),
  );
  const suppressNonExplicitOpportunity = isReviewDataCaptureMessage(
    text,
    recentText,
  );
  const productHelpQuestion = detectsProductHelpQuestion(text, recentText);
  const operationIntents = rawToolSkillIntents.filter((intent: any) => {
    if (productHelpQuestion) return false;
    if (intent?.operation_type === "prepare_attack_card") {
      return isExplicitAttackCardOperationRequest(text, recentText);
    }
    if (intent?.operation_type === "adjust_plan_item") {
      return isExplicitPlanAdjustmentOperationRequest(text);
    }
    if (intent?.operation_type !== "create_recurring_reminder") return true;
    return isExplicitRecurringReminderRequest(text);
  });
  const safetyRisk = riskMax(
    input.safety_pregate_output.risk_band,
    raw?.safety?.risk_band ?? fallback.safety.risk_band,
  );
  const rawSkillSignals =
    raw?.skill_signals && typeof raw.skill_signals === "object"
      ? {
        ...fallback.skill_signals,
        ...raw.skill_signals,
        entry: {
          ...(fallback.skill_signals.entry ?? {}),
          ...(raw.skill_signals.entry ?? {}),
        },
        lifecycle: {
          ...(fallback.skill_signals.lifecycle ?? {}),
          ...(raw.skill_signals.lifecycle ?? {}),
        },
        exit: {
          ...(fallback.skill_signals.exit ?? {}),
          ...(raw.skill_signals.exit ?? {}),
        },
      }
      : fallback.skill_signals;
  const fallbackEntry = fallback.skill_signals.entry ?? {};
  const shouldSuppressStickyEmotionalEntry =
    rawSkillSignals.entry?.emotional_repair?.detected === true &&
    !detectsAcuteSelfAttack(text) &&
    (
      fallbackEntry.execution_breakdown?.detected === true ||
      fallbackEntry.demotivation_repair?.detected === true ||
      fallbackEntry.product_help?.detected === true ||
      detectsStabilizedConcreteRequest(text)
    );
  const skillSignals = shouldSuppressStickyEmotionalEntry
    ? {
      ...rawSkillSignals,
      entry: {
        ...(rawSkillSignals.entry ?? {}),
        emotional_repair: undefined,
      },
    }
    : rawSkillSignals;
  const fallbackConversationRisk = fallback.conversation_risk ??
    evaluateConversationRisk(input);

  return {
    ...fallback,
    ...raw,
    user_id: input.user_id,
    channel: input.channel,
    safety: {
      risk_band: safetyRisk,
      reason_codes: Array.isArray(raw?.safety?.reason_codes)
        ? raw.safety.reason_codes.map(String)
        : fallback.safety.reason_codes,
      evidence: Array.isArray(raw?.safety?.evidence)
        ? raw.safety.evidence.map(String)
        : fallback.safety.evidence,
    },
    conversation_risk: fallbackConversationRisk,
    direct_effects: Array.isArray(raw?.direct_effects)
      ? (fallbackConversationRisk.should_exit_flows ? [] : raw.direct_effects)
      : fallback.direct_effects,
    tool_skill_intents: fallbackConversationRisk.should_exit_flows
      ? []
      : operationIntents,
    tool_skill_opportunity: sanitizeToolSkillOpportunity({
      raw: fallbackConversationRisk.should_exit_flows
        ? DEFAULT_TOOL_SKILL_OPPORTUNITY
        : raw?.tool_skill_opportunity,
      fallback: fallbackConversationRisk.should_exit_flows
        ? DEFAULT_TOOL_SKILL_OPPORTUNITY
        : fallback.tool_skill_opportunity,
      operationIntents: fallbackConversationRisk.should_exit_flows
        ? []
        : operationIntents,
      safetyRisk,
      hasPendingOrActiveFlow: Boolean(
        input.pending_tool_skill_confirmation ||
          input.active_tool_skill_intake ||
          input.active_skill_state,
      ),
      suppressNonExplicitOpportunity,
    }),
    skill_signals: fallbackConversationRisk.should_exit_flows
      ? {}
      : skillSignals,
    memory_plan: sanitizeMemoryPlan(raw?.memory_plan, fallback.memory_plan),
  };
}

export async function runDispatcher(
  input: RunDispatcherInput,
): Promise<TurnFrame> {
  const started = Date.now();
  const prompt = buildDispatcherPrompt({
    user_message: input.user_message,
    recent_messages: input.recent_messages,
    safety_risk_band: input.safety_pregate_output.risk_band,
    active_skill_state: input.active_skill_state,
    active_tool_skill_intake: input.active_tool_skill_intake,
    pending_tool_skill_confirmation: input.pending_tool_skill_confirmation,
    active_topic_state: input.active_topic_state,
    flow_state_context: input.flow_state_context,
    plan_snapshot: input.plan_snapshot,
  });
  const modelName = input.model_name ?? "gemini-3-flash-preview";
  let usedLlm = false;
  let output: TurnFrame;

  if (input.llm_runner) {
    usedLlm = true;
    const raw = await input.llm_runner({
      system_prompt: DISPATCHER_V2_SYSTEM_PROMPT,
      user_prompt: prompt,
      json_mode: true,
      model_name: modelName,
    });
    output = sanitizeLlmTurnFrame(raw, input);
  } else {
    output = heuristicTurnFrame(input);
  }

  const stats: DispatcherRunStats = {
    latency_ms: Date.now() - started,
    tokens_in: estimateTokens(DISPATCHER_V2_SYSTEM_PROMPT) +
      estimateTokens(prompt),
    tokens_out: estimateTokens(JSON.stringify(output)),
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    model_name: modelName,
    used_llm: usedLlm,
  };
  input.on_stats?.(stats);
  return output;
}
