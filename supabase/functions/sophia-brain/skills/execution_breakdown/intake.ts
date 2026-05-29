import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { EXECUTION_BREAKDOWN_PROMPT } from "./prompt.ts";
import {
  conservativeExecutionDecision,
  type ExecutionIntakeResult,
  normalizeExecutionDecision,
} from "./contract.ts";

export type ExecutionBreakdownStructuredIntakeInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_skill_working_state: unknown;
  turn_frame: unknown;
  plan_items: Array<Record<string, unknown>>;
  runtime_preferences?: Record<string, unknown>;
  user_id: string;
  request_id?: string | null;
};

export type ExecutionBreakdownIntakeModel = (
  input: ExecutionBreakdownStructuredIntakeInput,
) => Promise<unknown> | unknown;

let intakeModelForTest: ExecutionBreakdownIntakeModel | null = null;

export function setExecutionBreakdownIntakeForTest(
  intake: ExecutionBreakdownIntakeModel | null,
) {
  intakeModelForTest = intake;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("execution_breakdown_intake_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function compactTurnFrame(turnFrame: unknown): Record<string, unknown> {
  const frame = isRecord(turnFrame) ? turnFrame : {};
  return {
    channel: frame.channel ?? null,
    safety: frame.safety ?? null,
    skill_signals: frame.skill_signals ?? {},
    action_reference: frame.action_reference ?? null,
    tool_skill_intents: frame.tool_skill_intents ?? [],
    tool_skill_opportunity: frame.tool_skill_opportunity ?? null,
    direct_effects: frame.direct_effects ?? [],
    memory_plan: frame.memory_plan ?? null,
  };
}

function compactContext(input: ExecutionBreakdownStructuredIntakeInput) {
  return {
    recent_messages: input.recent_messages.slice(-8),
    active_skill_working_state: input.active_skill_working_state,
    turn_frame: compactTurnFrame(input.turn_frame),
    plan_items: input.plan_items.map((item) => ({
      id: item.id ?? null,
      title: item.title ?? null,
      status: item.status ?? null,
      kind: item.kind ?? null,
      dimension: item.dimension ?? null,
    })),
    runtime_preferences: input.runtime_preferences ?? {},
  };
}

async function defaultExecutionBreakdownIntakeModel(
  input: ExecutionBreakdownStructuredIntakeInput,
): Promise<unknown> {
  const systemPrompt = [
    EXECUTION_BREAKDOWN_PROMPT,
    "",
    "Tu es l'intake structure du conversation skill execution_breakdown.",
    "Retourne uniquement un JSON strict, sans Markdown.",
    "La compréhension métier appartient à cette décision structurée, pas au code.",
    "Le skill ne crée rien, ne programme rien, ne modifie aucun plan et n'exécute aucun tool.",
    "Aucune suggestion tool ne peut être autre chose qu'une proposition avec requires_user_consent=true.",
    "Ne dis jamais que quelque chose est fait, créé, programmé ou enregistré.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    output_contract: {
      skill_id: "execution_breakdown",
      intent:
        "target_resolution|diagnose_blocker|ask_first_step|asks_exact_phrase|asks_micro_action|action_too_large|recurrent_risk|relationship_repair_action|emotion_dominates|tool_request|status_or_meta_question|unclear",
      phase:
        "resolve_target|diagnose|give_micro_action|draft_phrase|suggest_tool|handoff_to_emotional_repair|exit",
      target: {
        kind: "plan_item|message|relationship|task|unknown",
        plan_item_id: "optional string",
        title: "optional string",
        raw_label: "optional string",
        confidence_band: "low|medium|high",
      },
      blocker:
        "flou|friction_demarrage|energie|peur|environnement|trop_grand|risque_rechute|relationnel|unknown",
      action_readiness: "none|needs_first_step|ready|blocked_after_first_step",
      emotional_dominance: "high|medium|low",
      constraints: [
        "no_tool",
        "no_potion",
        "no_questions",
        "one_question_max",
        "concrete_before_question",
        "short_reply",
        "exact_phrase_requested",
        "do_not_edit_plan",
        "do_not_create_card_without_consent",
      ],
      response_contract: {
        max_questions: "0|1",
        allow_tool_suggestion: "boolean",
        allow_plan_edit_suggestion: "boolean",
        allow_card_suggestion: "boolean",
        allow_exact_phrase: "boolean",
        must_start_with_concrete_action: "boolean",
        max_bullets: "0|1|2|3",
        tone: "direct_soft|practical|relationship_repair",
      },
      handoff_request:
        "optional { target_skill_id: emotional_repair, reason: string, confidence_band: low|medium|high }",
      operation_suggestions:
        "optional array of { operation_type: prepare_attack_card|prepare_defense_card|adjust_plan_item, reason: string, requires_user_consent: true, operation_input_hint?: object }",
      memory_write_candidates:
        "optional array of { source_text: string, should_persist_default: false, anti_identity_freeze_checked: true, sensitivity_level: number, reason: string }",
      reply: "string",
      state_patch: "object",
    },
    priority_rules: [
      "Cible avant diagnostic: si la cible est floue, phase resolve_target, target confidence low, max une question courte, aucune suggestion tool.",
      "Geste concret avant question: si le user demande un premier pas, un geste concret, pas de questions, ou quoi faire maintenant, reply commence par une action concrète et respecte max_questions.",
      "Phrase exacte: si une phrase exacte est demandée, produire la phrase prête à envoyer, ne pas proposer de carte d'abord, ne pas poser de question si le contexte suffit.",
      "Relationnel: si le contexte vise une réparation relationnelle, target.kind relationship et tone relationship_repair; la phrase s'adresse à l'autre personne.",
      "Émotion dominante: si honte ou auto-attaque domine, phase handoff_to_emotional_repair, handoff_request vers emotional_repair, aucune suggestion tool.",
      "Émotion présente mais non dominante: si le user demande clairement du concret, rester execution_breakdown et donner un geste sobre.",
      "No tool/no card/no plan edit: respecter strictement les contraintes; filtrer ou éviter les suggestions interdites.",
      "prepare_attack_card seulement pour blocage ponctuel avec cible claire; prepare_defense_card seulement pour risque/scénario récurrent; adjust_plan_item seulement si l'action est trop grande ou si le user demande d'alléger/modifier.",
      "Toutes les operation_suggestions exigent requires_user_consent=true.",
      "Réponse courte: sur WhatsApp ou short_reply, 3 à 5 lignes max, pas de protocole complet, pas d'option bonus.",
      "Aucune reply ne doit contenir: c'est fait, créé, programmé, enregistré.",
    ],
    current_user_message: input.user_message,
    context: compactContext(input),
  });
  return await generateWithGemini(
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
      source: "execution_breakdown.structured_intake",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
}

export async function runExecutionBreakdownStructuredIntake(
  input: ExecutionBreakdownStructuredIntakeInput & {
    intake_model?: ExecutionBreakdownIntakeModel;
  },
): Promise<ExecutionIntakeResult> {
  try {
    const raw = await (input.intake_model ?? intakeModelForTest ??
      defaultExecutionBreakdownIntakeModel)(input);
    const parsed = parseJsonObject(raw);
    return {
      ok: true,
      decision: normalizeExecutionDecision(parsed),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error
        ? error.message
        : "execution_breakdown_intake_failed",
      decision: conservativeExecutionDecision(
        error instanceof Error
          ? error.message
          : "execution_breakdown_intake_failed",
      ),
    };
  }
}

export function buildExecutionBreakdownIntakeInput(
  input: RunSkillInput,
  requestId?: string | null,
): ExecutionBreakdownStructuredIntakeInput {
  return {
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    active_skill_working_state: input.context.active_skill_working_state,
    turn_frame: input.context.turn_frame,
    plan_items: input.context.plan_items,
    runtime_preferences: isRecord(input.context.turn_frame.skill_signals)
      ? input.context.turn_frame.skill_signals as Record<string, unknown>
      : {},
    user_id: input.context.user_id,
    request_id: requestId ?? null,
  };
}
