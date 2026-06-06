import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import type { SkillContext } from "../_shared/context.ts";
import {
  conservativeDemotivationRepairDecision,
  type DemotivationRepairConstraint,
  type DemotivationRepairDecision,
  type DemotivationRepairIntakeResult,
  normalizeDemotivationRepairDecision,
} from "./contract.ts";
import { DEMOTIVATION_REPAIR_PROMPT } from "./prompt.ts";

export type DemotivationRepairStructuredIntakeInput = {
  user_message: string;
  context: SkillContext;
  dispatcher_constraints: DemotivationRepairConstraint[];
  request_id?: string | null;
};

export type DemotivationRepairIntakeInput =
  DemotivationRepairStructuredIntakeInput;

export type DemotivationRepairIntakeRunner = (
  input: DemotivationRepairIntakeInput,
) => Promise<DemotivationRepairIntakeResult> | DemotivationRepairIntakeResult;

export type DemotivationRepairIntakeModel = (
  input: DemotivationRepairStructuredIntakeInput,
) => Promise<unknown> | unknown;

let intakeRunnerForTest: DemotivationRepairIntakeRunner | null = null;

export function setDemotivationRepairIntakeRunnerForTest(
  runner: DemotivationRepairIntakeRunner | null,
) {
  intakeRunnerForTest = runner;
}

function structuredWorkingStateDecision(
  active: SkillContext["active_skill_working_state"],
): unknown {
  const workingState = active?.working_state;
  if (!workingState || typeof workingState !== "object") return null;
  const record = workingState as Record<string, unknown>;
  return record.demotivation_repair_decision ?? record.intake_decision ?? null;
}

function dispatcherConstraints(
  turnFrame: RunSkillInput["context"]["turn_frame"],
): DemotivationRepairConstraint[] {
  const constraints: DemotivationRepairConstraint[] = [];
  for (const intent of turnFrame.tool_skill_intents ?? []) {
    for (const rejected of intent.rejected_operations ?? []) {
      if (rejected === "select_state_potion") {
        constraints.push("no_potion");
      }
      if (
        rejected === "prepare_attack_card" ||
        rejected === "adjust_plan_item" ||
        rejected === "create_recurring_reminder" ||
        rejected === "select_state_potion"
      ) {
        constraints.push("no_tool");
      }
    }
  }
  return [...new Set(constraints)];
}

export function buildDemotivationRepairIntakeInput(
  input: RunSkillInput,
  requestId?: string | null,
): DemotivationRepairIntakeInput {
  return {
    user_message: input.user_message,
    context: input.context,
    dispatcher_constraints: dispatcherConstraints(input.context.turn_frame),
    request_id: requestId ?? null,
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
      level_reference: context.turn_frame.level_reference ?? null,
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
    throw new Error("demotivation_repair_intake_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function defaultIntakeModel(
  input: DemotivationRepairStructuredIntakeInput,
): Promise<unknown> {
  const systemPrompt = [
    DEMOTIVATION_REPAIR_PROMPT,
    "",
    "Tu es l'intake structure du conversation skill demotivation_repair.",
    "Retourne uniquement un JSON strict, sans Markdown.",
    "Ne fais pas de regex mentale ni de matching lexical: comprends le tour et le contexte.",
    "La reply visible appartient a ce JSON et doit respecter le contrat.",
    "Le skill ne cree rien, ne programme rien, ne modifie aucun plan: ne dis jamais que quelque chose est fait, cree, programme ou enregistre.",
    "Les phrases identitaires negatives ne doivent jamais devenir un fait durable. Droppe la candidate memoire ou reformule-la en episode non identitaire.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    output_contract: {
      skill_id: "demotivation_repair",
      intent:
        "fatigue_drop|loss_of_meaning|failure_accumulation|avoidance_loop|overwhelm|concrete_action_emerged|asks_smaller_step|asks_no_tool_support|asks_recurring_support|status_or_meta_question|unclear",
      phase:
        "diagnose|reduce_friction|restore_meaning|stabilize_energy|action_card_ready|exit",
      motivation_state:
        "fatigue|loss_of_meaning|failure_accumulation|avoidance|overwhelm|unclear",
      action_readiness: "none|hypothetical|ready|already_chosen",
      constraints: [
        "no_potion",
        "no_tool",
        "no_plan_edit",
        "no_questions",
        "one_question_max",
        "concrete_before_question",
        "short_reply",
        "do_not_moralize",
        "do_not_modify_plan_yet",
        "prefer_smallest_action",
      ],
      response_contract: {
        max_questions: "0|1",
        allow_plan_edit: "boolean",
        allow_tool_suggestion: "boolean",
        allow_potion_suggestion: "boolean",
        allow_attack_card_suggestion: "boolean",
        allow_concrete_action: "boolean",
        tone: "grounded|soft_direct|energy_preserving",
      },
      operation_suggestions:
        "optional array of { operation_type: select_state_potion|prepare_attack_card|prepare_defense_card|adjust_plan_item|create_recurring_reminder, reason: string, requires_user_consent: true, operation_input_hint?: object. Pour select_state_potion: { potion_type?: clarte|courage|rappel, state?: { kind?: loss_of_meaning|fear_avoidance|decrochage, intensity?: low|medium|high, evidence?: string[] }, context?: { handoff_summary: string, target_hint?: string, topic_hint?: string } } }",
      memory_write_candidates:
        "optional array of { source_text: string, should_persist_default: false, anti_identity_freeze_checked: true, sensitivity_level: number, reason: string }",
      reply: "string",
      state_patch: "object",
    },
    behavioral_rules: [
      "Distingue fatigue, perte de sens, accumulation d'echecs, avoidance, surcharge, action concrete vraiment prete.",
      "Une action hypothetique ou conditionnelle reste action_readiness=hypothetical et ne handoff pas.",
      "Une action immediate/deja choisie peut produire une suggestion prepare_attack_card ou prepare_defense_card avec consentement.",
      "Si l'utilisateur refuse potion/protocole/outil: contraintes no_potion ou no_tool et aucune suggestion interdite.",
      "create_recurring_reminder seulement si soutien repete explicitement demande.",
      "adjust_plan_item seulement si demande explicite d'alleger/modifier ou consentement demande apres diagnostic que l'action est trop lourde.",
      "Si le user ne sait plus pourquoi il fait ses actions, ou dit que ca n'a plus de sens, reste dans demotivation_repair avec motivation_state=loss_of_meaning; ne route pas directement select_state_potion.",
      "Champ d'action potions: clarte=sens/cap/pourquoi profond deja clarifie; courage=peur/apprehension/evitement identifie; rappel=geste/cap/repere deja connu qui glisse.",
      "Bridge select_state_potion seulement en complement consenti apres diagnostic: etat initial repair conversationnel; condition de maturite=cap/peur/repere suffisamment nomme pour devenir un support durable; jamais si no_potion/no_tool.",
      "Pour toute suggestion select_state_potion, operation_input_hint.context.handoff_summary resume en 1-3 phrases ce qui a ete clarifie, les mots user importants, et ce que la potion doit soutenir ensuite.",
      "La reply doit demander le consentement pour la potion en complement et ne jamais dire qu'elle est lancee/activee/programmee.",
      "Dans un bridge potion, ne substitue pas product_help generique, plan edit, carte d'attaque, carte de defense, priorisation ou prochaine action, sauf demande produit/operation explicite du user.",
      "Ne suggere pas clarte pour prioriser, choisir la prochaine tache ou decouper une action.",
      "N'ecris jamais de morale, de discipline brute, ni de verdict identitaire.",
      "Ne force aucun emoji; reste sobre si le contexte demande sobriete ou tunnel.",
    ],
    current_user_message: input.user_message,
    dispatcher_constraints: input.dispatcher_constraints,
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
      source: "demotivation_repair.structured_intake",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
}

export async function runDemotivationRepairStructuredIntake(
  input: DemotivationRepairIntakeInput & {
    intake_model?: DemotivationRepairIntakeModel;
  },
): Promise<DemotivationRepairIntakeResult> {
  if (intakeRunnerForTest) {
    const result = await intakeRunnerForTest(input);
    return {
      ...result,
      decision: normalizeDemotivationRepairDecision(result.decision),
    };
  }

  const existingDecision = structuredWorkingStateDecision(
    input.context.active_skill_working_state,
  );
  if (existingDecision) {
    return {
      ok: true,
      decision: normalizeDemotivationRepairDecision(existingDecision),
    };
  }

  try {
    const raw = await (input.intake_model ?? defaultIntakeModel)(input);
    const parsed = parseJsonObject(raw);
    return {
      ok: true,
      decision: normalizeDemotivationRepairDecision(parsed),
    };
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : "demotivation_repair_intake_failed";
    return conservativeFallback(input, reason);
  }
}

function conservativeFallback(
  input: DemotivationRepairIntakeInput,
  reason: string,
): DemotivationRepairIntakeResult {
  const conservative = conservativeDemotivationRepairDecision(
    reason,
  );
  const decision: DemotivationRepairDecision = {
    ...conservative,
    constraints: [
      ...conservative.constraints,
      ...input.dispatcher_constraints,
    ],
    state_patch: {
      ...conservative.state_patch,
      dispatcher_constraints: input.dispatcher_constraints,
    },
  };
  return {
    ok: false,
    reason,
    decision: normalizeDemotivationRepairDecision(decision),
  };
}
