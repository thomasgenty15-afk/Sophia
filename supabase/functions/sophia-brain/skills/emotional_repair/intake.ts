import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { SkillContext } from "../_shared/context.ts";
import { EMOTIONAL_REPAIR_PROMPT } from "./prompt.ts";
import {
  type EmotionalRepairSkillDecision,
  normalizeEmotionalRepairDecision,
} from "./contract.ts";

export type EmotionalRepairStructuredIntakeInput = {
  user_message: string;
  context: SkillContext;
  explicit_constraints?: string[];
  request_id?: string | null;
};

export type EmotionalRepairStructuredIntakeResult = {
  decision: EmotionalRepairSkillDecision | null;
  errors: string[];
  raw?: unknown;
  trace?: EmotionalRepairIntakeTrace;
};

export type EmotionalRepairIntakeModel = (
  input: EmotionalRepairStructuredIntakeInput,
) => Promise<unknown> | unknown;

export type EmotionalRepairIntakeTrace = {
  raw_type: string;
  top_level_keys: string[];
  has_decision_wrapper: boolean;
  selected_envelope: "decision" | "root" | "none";
};

function intakeTraceFor(raw: unknown): EmotionalRepairIntakeTrace {
  const isObject = Boolean(raw) && typeof raw === "object" &&
    !Array.isArray(raw);
  const record = isObject ? raw as Record<string, unknown> : {};
  const hasDecisionWrapper = Boolean(
    record.decision && typeof record.decision === "object" &&
      !Array.isArray(record.decision),
  );
  return {
    raw_type: Array.isArray(raw) ? "array" : typeof raw,
    top_level_keys: Object.keys(record).sort(),
    has_decision_wrapper: hasDecisionWrapper,
    selected_envelope: hasDecisionWrapper
      ? "decision"
      : isObject
      ? "root"
      : "none",
  };
}

function compactContext(context: SkillContext) {
  return {
    recent_messages: context.recent_messages,
    active_skill_working_state: context.active_skill_working_state,
    turn_frame: {
      safety: context.turn_frame.safety,
      skill_signals: context.turn_frame.skill_signals,
      action_reference: context.turn_frame.action_reference ?? null,
      tool_skill_intents: context.turn_frame.tool_skill_intents,
      tool_skill_opportunity: context.turn_frame.tool_skill_opportunity,
      direct_effects: context.turn_frame.direct_effects,
      memory_plan: context.turn_frame.memory_plan,
    },
    plan_items: context.plan_items,
    relevant_memory_items: context.relevant_memory_items,
    exclusions: context.exclusions,
  };
}

function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("emotional_repair_intake_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function defaultIntakeModel(
  input: EmotionalRepairStructuredIntakeInput,
): Promise<unknown> {
  const systemPrompt = [
    EMOTIONAL_REPAIR_PROMPT,
    "",
    "Tu es l'intake structure du conversation skill emotional_repair.",
    "Retourne uniquement un JSON strict, sans Markdown.",
    "Ne fais pas de regex mentale ni de matching lexical: comprends le tour et le contexte.",
    "La reply visible appartient a ce JSON et doit respecter le contrat.",
    "Le skill ne cree rien et ne programme rien: ne dis jamais que quelque chose est fait, cree, programme ou enregistre.",
    "Une auto-attaque ne doit jamais devenir un fait durable. Toute candidate memoire liee a une auto-attaque doit rester should_persist_default=false et anti_identity_freeze_checked=true.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    output_contract: {
      skill_id: "emotional_repair",
      intent:
        "acute_self_attack|shame_or_guilt|anxiety_or_panic|relational_repair|emotion_lowered_action_blocked|asks_concrete_phrase|asks_regulation_without_potion|asks_recurring_support|status_or_meta_question|action_card_ready|unclear",
      phase:
        "stabilize|de_shame|separate_fact_from_identity|repair_relationship|action_card_ready|exit",
      emotional_dominance: "high|medium|low",
      context_domain: "relationship|work|body|plan_execution|unknown",
      constraints: [
        "no_potion",
        "no_tool",
        "no_plan",
        "no_protocol",
        "no_technique",
        "no_questions",
        "one_question_max",
        "concrete_before_question",
        "soft_support_only",
        "short_reply",
        "relationship_context",
        "do_not_persist_identity_attack",
      ],
      response_contract: {
        max_questions: "0|1",
        allow_plan: "boolean",
        allow_tool_suggestion: "boolean",
        allow_potion_suggestion: "boolean",
        allow_concrete_action: "boolean",
        tone: "soft|grounded|direct_soft",
      },
      handoff_request:
        "optional { target_skill_id: safety_crisis, reason: string, confidence_band: low|medium|high }",
      operation_suggestions:
        "optional array of { operation_type: prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder, reason: string, requires_user_consent: true, operation_input_hint?: object. Pour select_state_potion: { potion_type?: amour|guerison|apaisement, state?: { kind?: self_harshness|shame_guilt|stress_pressure, intensity?: low|medium|high, evidence?: string[] }, context?: { handoff_summary: string, target_hint?: string, topic_hint?: string } } }",
      memory_write_candidates:
        "optional array of { source_text: string, should_persist_default: false, anti_identity_freeze_checked: true, sensitivity_level: 0|1|2|3|4, reason: string }",
      reply: "string",
      state_patch: "object",
    },
    behavioral_rules: [
      "Si honte ou auto-attaque aiguë domine: pas de plan, pas de chrono, pas de choix A/B, pas de brouillon, pas de tool push, zero ou une question courte.",
      "Si le user demande seulement douceur/presence, 'ramene-moi doucement', pas de plan, pas de protocole, pas de technique ou pas de question: constraints doit contenir les contraintes correspondantes; response_contract.max_questions=0 si no_questions ou soft_support_only; allow_plan=false; allow_concrete_action=false si no_protocol, no_technique ou soft_support_only.",
      "no_protocol/no_technique/soft_support_only interdisent aussi les exercices de respiration, grounding, checklist, micro-action et question finale. La reply doit rester une presence emotionnelle courte.",
      "Si contexte relationnel: parler du lien et du geste de reparation; si phrase exacte demandee, donner une phrase adressee a l'autre personne.",
      "Si emotion basse ou moyenne et action concrete presente: reste proprietaire du soutien et propose prepare_attack_card ou prepare_defense_card en operation_suggestions si un support produit est utile.",
      "Si l'utilisateur refuse potion/reset/protocole/outil de regulation produit: constraints contient no_potion, allow_potion_suggestion=false, aucune suggestion select_state_potion.",
      "create_recurring_reminder seulement si soutien recurrent explicitement demande.",
      "Si honte, culpabilite, panique ou auto-attaque dominent encore: allow_potion_suggestion=false et aucune suggestion select_state_potion, meme si une potion pourrait aider plus tard.",
      "Champ d'action potions: amour=douceur/chaleur/dialogue interieur moins dur; guerison=reparer apres episode douloureux, craquage, honte ou culpabilite deja posee; apaisement=pression/tension/stress/saturation a faire redescendre durablement.",
      "Bridge select_state_potion seulement comme complement consenti apres stabilisation, jamais comme reparation primaire: etat initial repair conversationnel; condition de maturite=emotion assez stabilisee et besoin durable nomme.",
      "Pour toute suggestion select_state_potion, operation_input_hint.context.handoff_summary resume en 1-3 phrases l'episode ou l'emotion stabilisee, les mots user importants, et le besoin durable que la potion doit soutenir.",
      "La reply doit demander le consentement pour la potion en complement et ne jamais dire qu'elle est lancee/activee/programmee.",
      "Dans un bridge potion, ne substitue pas product_help generique, plan edit, carte d'attaque, carte de defense, priorisation ou prochaine action, sauf demande produit/operation explicite du user.",
      "Toute suggestion de potion doit avoir requires_user_consent=true, aucun effet durable, et ne doit pas remplacer la reply de soutien emotionnel.",
    ],
    current_user_message: input.user_message,
    explicit_constraints: input.explicit_constraints ?? [],
    context: compactContext(input.context),
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
      userId: input.context.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "emotional_repair.structured_intake",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
}

export async function runEmotionalRepairStructuredIntake(
  input: EmotionalRepairStructuredIntakeInput & {
    intake_model?: EmotionalRepairIntakeModel;
  },
): Promise<EmotionalRepairStructuredIntakeResult> {
  let raw: unknown;
  try {
    raw = await (input.intake_model ?? defaultIntakeModel)(input);
    const parsed = parseJsonObject(raw);
    const normalized = normalizeEmotionalRepairDecision(parsed);
    return {
      decision: normalized.decision,
      errors: normalized.errors,
      raw: parsed,
      trace: intakeTraceFor(parsed),
    };
  } catch (error) {
    return {
      decision: null,
      errors: [
        error instanceof Error
          ? error.message
          : "emotional_repair_intake_failed",
      ],
      trace: raw === undefined ? undefined : intakeTraceFor(raw),
    };
  }
}
