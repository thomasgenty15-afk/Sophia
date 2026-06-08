import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  type EmotionalRepairBridgePotion,
  type EmotionalRepairConfidence,
  type EmotionalRepairConstraint,
  type EmotionalRepairContextDomain,
  type EmotionalRepairDominance,
  type EmotionalRepairDurableNeedKind,
  type EmotionalRepairIntent,
  type EmotionalRepairLocalDispatcherOutput,
  type EmotionalRepairLocalFlowAction,
  type EmotionalRepairLocalState,
  type EmotionalRepairPhase,
  type EmotionalRepairPotionBridgeContext,
  type EmotionalRepairResponseTone,
  type EmotionalRepairVisibleTask,
  type EmotionalRepairVisibleTaskKind,
  normalizeEmotionalRepairConstraints,
} from "./contract.ts";

export type EmotionalRepairLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: EmotionalRepairLocalState | null;
  previous_repair_summary: string | null;
  previous_potion_bridge_offer:
    | EmotionalRepairLocalState["last_potion_bridge_offer"]
    | null;
  turn_frame: TurnFrame | null;
  explicit_constraints: string[];
};

export type EmotionalRepairLocalDispatcher = (
  input: EmotionalRepairLocalDispatcherInput,
) => Promise<EmotionalRepairLocalDispatcherOutput | null>;

export type EmotionalRepairReducerResult = {
  status: "continue" | "complete" | "exit" | "handoff" | "safety";
  response_intent: string;
  local_state: EmotionalRepairLocalState | null;
  visible_task: EmotionalRepairVisibleTask;
  potion_bridge_context: EmotionalRepairPotionBridgeContext | null;
  exit_to_global_dispatcher: boolean;
  reason_code: string;
  constraints: EmotionalRepairConstraint[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS: readonly EmotionalRepairLocalFlowAction[] = [
  "answer_repair",
  "ask_gentle_clarification",
  "repair_relationship",
  "provide_concrete_phrase",
  "soft_presence",
  "regulation_without_potion",
  "potion_bridge_offer",
  "confirm_potion_bridge",
  "revise_repair_context",
  "repeat_last_repair",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
];

const INTENTS: readonly EmotionalRepairIntent[] = [
  "acute_self_attack",
  "shame_or_guilt",
  "anxiety_or_panic",
  "relational_repair",
  "emotion_lowered_action_blocked",
  "asks_concrete_phrase",
  "asks_regulation_without_potion",
  "status_or_meta_question",
  "unclear",
];

const PHASES: readonly EmotionalRepairPhase[] = [
  "stabilize",
  "de_shame",
  "separate_fact_from_identity",
  "repair_relationship",
  "action_card_ready",
  "exit",
];

const DOMINANCE: readonly EmotionalRepairDominance[] = [
  "high",
  "medium",
  "low",
];

const DOMAINS: readonly EmotionalRepairContextDomain[] = [
  "relationship",
  "work",
  "body",
  "plan_execution",
  "unknown",
];

const TONES: readonly EmotionalRepairResponseTone[] = [
  "soft",
  "grounded",
  "direct_soft",
];

const BRIDGE_POTIONS: readonly EmotionalRepairBridgePotion[] = [
  "amour",
  "guerison",
  "apaisement",
];

const NEEDS: readonly EmotionalRepairDurableNeedKind[] = [
  "self_kindness",
  "healing_after_hurt",
  "pressure_relief",
];

const VISIBLE_TASKS: readonly EmotionalRepairVisibleTaskKind[] = [
  "soft_presence",
  "de_shame",
  "separate_fact_from_identity",
  "repair_relationship",
  "concrete_phrase",
  "stabilize_anxiety",
  "potion_bridge_offer",
  "potion_bridge_choice",
  "potion_bridge_handoff",
  "ask_gentle_clarification",
  "repeat_repair",
  "exit_or_cancel",
  "safety",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function confidence(value: unknown): EmotionalRepairConfidence {
  return enumValue(value, ["low", "medium", "high"] as const, "medium");
}

function bridgePotion(value: unknown): EmotionalRepairBridgePotion | null {
  return typeof value === "string" &&
      (BRIDGE_POTIONS as readonly string[]).includes(value)
    ? value as EmotionalRepairBridgePotion
    : null;
}

function potionLabel(value: EmotionalRepairBridgePotion | null) {
  switch (value) {
    case "amour":
      return "Potion d'amour" as const;
    case "guerison":
      return "Potion de guerison" as const;
    case "apaisement":
      return "Potion d'apaisement" as const;
    default:
      return null;
  }
}

function normalizeRepairState(
  raw: unknown,
): EmotionalRepairLocalState["repair_state"] {
  const root = isRecord(raw) ? raw : {};
  return {
    intent: enumValue(root.intent, INTENTS, "unclear"),
    phase: enumValue(root.phase, PHASES, "de_shame"),
    emotional_dominance: enumValue(
      root.emotional_dominance,
      DOMINANCE,
      "medium",
    ),
    context_domain: enumValue(root.context_domain, DOMAINS, "unknown"),
    summary: stringValue(root.summary) ?? "Réparation émotionnelle en cours.",
    user_words: stringArray(root.user_words),
    identity_freeze_risk: root.identity_freeze_risk === true,
    emotion_stabilized_enough_for_tool:
      root.emotion_stabilized_enough_for_tool === true,
  };
}

function normalizeVisibleTask(
  raw: unknown,
  selectedPotion: EmotionalRepairBridgePotion | null,
  repairSummary: string,
  userWords: string[],
): EmotionalRepairVisibleTask {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.required_data) ? root.required_data : {};
  return {
    kind: enumValue(root.kind, VISIBLE_TASKS, "soft_presence"),
    required_data: {
      repair_summary: stringValue(data.repair_summary) ?? repairSummary,
      user_words: stringArray(data.user_words).length
        ? stringArray(data.user_words)
        : userWords,
      selected_potion: bridgePotion(data.selected_potion) ?? selectedPotion,
      potion_label: potionLabel(
        bridgePotion(data.selected_potion) ?? selectedPotion,
      ),
      bridge_context_summary: stringValue(data.bridge_context_summary),
    },
  };
}

function normalizePrefillCandidates(
  raw: unknown,
): EmotionalRepairLocalDispatcherOutput["potion_bridge"]["prefill_candidates"] {
  const root = isRecord(raw) ? raw : {};
  return {
    love_lack_context: stringValue(root.love_lack_context),
    love_state: enumValue(
      root.love_state,
      ["dur", "seul", "vide"] as const,
      null as any,
    ),
    recent_hurt: stringValue(root.recent_hurt),
    dominant_feeling: enumValue(
      root.dominant_feeling,
      ["culpabilite", "honte", "decouragement", "fatigue"] as const,
      null as any,
    ),
    pressure_source: stringValue(root.pressure_source),
    pressure_state: enumValue(
      root.pressure_state,
      ["stresse", "a_cran", "submerge"] as const,
      null as any,
    ),
  };
}

export function normalizeEmotionalRepairLocalDispatcherOutput(
  raw: unknown,
): EmotionalRepairLocalDispatcherOutput | null {
  const root = isRecord(raw) ? raw : null;
  if (!root) return null;
  const repairState = normalizeRepairState(root.repair_state);
  const bridge = isRecord(root.potion_bridge) ? root.potion_bridge : {};
  const selectedPotion = bridgePotion(bridge.selected_potion);
  const durable = isRecord(bridge.durable_need) ? bridge.durable_need : {};
  const visibleTask = normalizeVisibleTask(
    root.visible_task,
    selectedPotion,
    repairState.summary,
    repairState.user_words,
  );
  const responseContract = isRecord(root.response_contract)
    ? root.response_contract
    : {};
  const exitMemo = isRecord(root.exit_memo) ? root.exit_memo : {};
  const noMutation = isRecord(root.no_chat_mutation)
    ? root.no_chat_mutation
    : {};
  return {
    flow_action: enumValue(root.flow_action, FLOW_ACTIONS, "answer_repair"),
    confidence: confidence(root.confidence),
    risk_score: Math.max(0, Math.min(10, Number(root.risk_score ?? 0) || 0)),
    repair_state: repairState,
    constraints: normalizeEmotionalRepairConstraints(root.constraints),
    response_contract: {
      max_questions: responseContract.max_questions === 1 ? 1 : 0,
      allow_plan: responseContract.allow_plan === true,
      allow_tool_suggestion: responseContract.allow_tool_suggestion === true,
      allow_potion_suggestion:
        responseContract.allow_potion_suggestion === true,
      allow_concrete_action: responseContract.allow_concrete_action === true,
      tone: enumValue(responseContract.tone, TONES, "soft"),
    },
    potion_bridge: {
      status: enumValue(
        bridge.status,
        [
          "not_applicable",
          "candidate",
          "offered_waiting_consent",
          "confirmed_handoff",
          "blocked",
        ] as const,
        "not_applicable",
      ),
      selected_potion: selectedPotion,
      candidate_potions: Array.isArray(bridge.candidate_potions)
        ? bridge.candidate_potions.flatMap((item) => {
          if (!isRecord(item)) return [];
          const potion = bridgePotion(item.potion_type);
          if (!potion) return [];
          return [{
            potion_type: potion,
            confidence: confidence(item.confidence),
            reason: stringValue(item.reason) ?? "Candidat bridge potion.",
          }];
        }).slice(0, 2)
        : [],
      durable_need: {
        kind: enumValue(
          durable.kind,
          [...NEEDS, null] as any,
          null as any,
        ),
        summary: stringValue(durable.summary),
      },
      prefill_candidates: normalizePrefillCandidates(
        bridge.prefill_candidates,
      ),
      missing_before_handoff: stringArray(bridge.missing_before_handoff),
      why_ready_or_blocked: stringValue(bridge.why_ready_or_blocked) ??
        "Non précisé.",
    },
    visible_task: visibleTask,
    exit_memo: {
      needed: exitMemo.needed === true,
      reason: enumValue(
        exitMemo.reason,
        [
          "topic_change",
          "explicit_tool_request",
          "cancelled",
          "safety",
          "potion_handoff",
          "none",
        ] as const,
        "none",
      ),
      flow_summary: stringValue(exitMemo.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        exitMemo.handoff_hint_for_global_dispatcher,
      ),
      potion_bridge_context: isRecord(exitMemo.potion_bridge_context)
        ? exitMemo.potion_bridge_context
        : null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
    },
    evidence: stringArray(root.evidence),
  };
}

function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("emotional_repair_local_dispatcher_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow emotional_repair.",
    "Tu n'es pas le dispatcher global et tu ne reponds jamais directement au user.",
    "Retourne uniquement un JSON strict conforme au contrat fourni.",
    "Safety preempt gagne sur tout.",
    "Tu peux seulement preparer un bridge vers amour, guerison ou apaisement.",
    "Ne propose pas de potion quand honte, culpabilite, panique ou auto-attaque dominent encore.",
    "Ne propose pas de potion si no_potion, no_tool, soft_support_only, no_protocol ou no_technique est present.",
    "Un bridge potion exige stabilisation et consentement; confirm_potion_bridge signifie que le user consent a une offre deja faite.",
    "La note d'information pour le flow suivant doit contenir un resume succinct du flow quitte et le contexte utile au dispatcher potion.",
    "Aucune session potion, aucun rappel, aucun scheduled_checkin, aucune confirmation executable, aucun write DB.",
  ].join("\n");
}

export const runEmotionalRepairLocalDispatcher: EmotionalRepairLocalDispatcher =
  async (input) => {
    const userPrompt = JSON.stringify({
      task: "dispatch_emotional_repair_local_flow",
      required_json_shape: {
        flow_action:
          "answer_repair|ask_gentle_clarification|repair_relationship|provide_concrete_phrase|soft_presence|regulation_without_potion|potion_bridge_offer|confirm_potion_bridge|revise_repair_context|repeat_last_repair|cancel_flow|exit_to_global_dispatcher|safety_preempt",
        confidence: "low|medium|high",
        risk_score: "number 0..10",
        repair_state: {
          intent:
            "acute_self_attack|shame_or_guilt|anxiety_or_panic|relational_repair|emotion_lowered_action_blocked|asks_concrete_phrase|asks_regulation_without_potion|status_or_meta_question|unclear",
          phase:
            "stabilize|de_shame|separate_fact_from_identity|repair_relationship|action_card_ready|exit",
          emotional_dominance: "high|medium|low",
          context_domain: "relationship|work|body|plan_execution|unknown",
          summary: "string",
          user_words: ["string"],
          identity_freeze_risk: true,
          emotion_stabilized_enough_for_tool: false,
        },
        constraints: [
          "no_potion|no_tool|no_plan|no_protocol|no_technique|no_questions|one_question_max|concrete_before_question|soft_support_only|short_reply|relationship_context|do_not_persist_identity_attack",
        ],
        response_contract: {
          max_questions: "0|1",
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: false,
          tone: "soft|grounded|direct_soft",
        },
        potion_bridge: {
          status:
            "not_applicable|candidate|offered_waiting_consent|confirmed_handoff|blocked",
          selected_potion: "amour|guerison|apaisement|null",
          candidate_potions: [{
            potion_type: "amour|guerison|apaisement",
            confidence: "low|medium|high",
            reason: "string",
          }],
          durable_need: {
            kind: "self_kindness|healing_after_hurt|pressure_relief|null",
            summary: "string|null",
          },
          prefill_candidates: {
            love_lack_context: "string|null",
            love_state: "dur|seul|vide|null",
            recent_hurt: "string|null",
            dominant_feeling: "culpabilite|honte|decouragement|fatigue|null",
            pressure_source: "string|null",
            pressure_state: "stresse|a_cran|submerge|null",
          },
          missing_before_handoff: ["string"],
          why_ready_or_blocked: "string",
        },
        visible_task: {
          kind:
            "soft_presence|de_shame|separate_fact_from_identity|repair_relationship|concrete_phrase|stabilize_anxiety|potion_bridge_offer|potion_bridge_choice|potion_bridge_handoff|ask_gentle_clarification|repeat_repair|exit_or_cancel|safety",
          required_data: {
            repair_summary: "string",
            user_words: ["string"],
            selected_potion: "amour|guerison|apaisement|null",
            potion_label:
              "Potion d'amour|Potion de guerison|Potion d'apaisement|null",
            bridge_context_summary: "string|null",
          },
        },
        exit_memo: {
          needed: false,
          reason:
            "topic_change|explicit_tool_request|cancelled|safety|potion_handoff|none",
          flow_summary: "string|null",
          handoff_hint_for_global_dispatcher: "string|null",
          potion_bridge_context: "object|null",
        },
        no_chat_mutation: {
          potion_session_created: false,
          recurring_reminder_created: false,
          scheduled_checkin_created: false,
          executable_confirmation_generated: false,
          db_write_committed: false,
        },
        evidence: ["string"],
      },
      current_user_message: input.user_message,
      recent_messages: input.recent_messages,
      active_emotional_repair_state: input.active_state,
      previous_repair_summary: input.previous_repair_summary,
      previous_potion_bridge_offer: input.previous_potion_bridge_offer,
      turn_frame_safety: input.turn_frame?.safety ?? null,
      explicit_constraints: input.explicit_constraints,
      possible_potion_bridge_targets: {
        amour: ["love_lack_context", "love_state:dur|seul|vide"],
        guerison: [
          "recent_hurt",
          "dominant_feeling:culpabilite|honte|decouragement|fatigue",
        ],
        apaisement: [
          "pressure_source",
          "pressure_state:stresse|a_cran|submerge",
        ],
      },
    });
    try {
      const raw = await generateWithGemini(
        localDispatcherSystemPrompt(),
        userPrompt,
        0.1,
        true,
        [],
        "auto",
        {
          requestId: input.request_id ?? undefined,
          userId: input.user_id,
          model: getGlobalAiModel("gemini-2.5-flash"),
          source: "emotional_repair.local_dispatcher",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      return normalizeEmotionalRepairLocalDispatcherOutput(
        parseJsonObject(raw),
      );
    } catch (error) {
      console.warn("[EmotionalRepair] local dispatcher failed", { error });
      return null;
    }
  };

function constraintsWithInvariants(
  output: EmotionalRepairLocalDispatcherOutput,
  explicitConstraints: string[],
): EmotionalRepairConstraint[] {
  const constraints = new Set<EmotionalRepairConstraint>([
    ...output.constraints,
    ...normalizeEmotionalRepairConstraints(explicitConstraints),
  ]);
  if (constraints.has("soft_support_only")) {
    constraints.add("no_plan");
    constraints.add("no_protocol");
    constraints.add("no_technique");
    constraints.add("no_questions");
    constraints.add("no_tool");
    constraints.add("no_potion");
  }
  if (constraints.has("no_technique")) constraints.add("no_protocol");
  return [...constraints];
}

function bridgeBlocked(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  constraints: EmotionalRepairConstraint[];
}): boolean {
  return args.constraints.some((constraint) =>
    constraint === "no_potion" ||
    constraint === "no_tool" ||
    constraint === "no_protocol" ||
    constraint === "no_technique" ||
    constraint === "soft_support_only"
  ) ||
    args.output.repair_state.emotional_dominance === "high" ||
    args.output.repair_state.emotion_stabilized_enough_for_tool !== true;
}

function fieldConfidence(
  action: "offer" | "handoff",
): EmotionalRepairConfidence {
  return action === "handoff" ? "high" : "medium";
}

function bridgeCandidateObject(args: {
  value?: string | null;
  optionValue?: string | null;
  optionLabel?: string | null;
  confidence: EmotionalRepairConfidence;
}) {
  return {
    candidate_value: args.value ?? null,
    option_value: args.optionValue ?? null,
    option_label: args.optionLabel ?? null,
    confidence: args.confidence,
    source: "emotional_repair" as const,
  };
}

function bridgePrefillsForContext(args: {
  selectedPotion: EmotionalRepairBridgePotion;
  prefill:
    EmotionalRepairLocalDispatcherOutput["potion_bridge"]["prefill_candidates"];
  confidence: EmotionalRepairConfidence;
}): EmotionalRepairPotionBridgeContext["prefill_candidates"] {
  const p = args.prefill;
  if (args.selectedPotion === "amour") {
    return {
      love_lack_context: bridgeCandidateObject({
        value: p.love_lack_context ?? null,
        confidence: args.confidence,
      }),
      love_state: bridgeCandidateObject({
        optionValue: p.love_state ?? null,
        optionLabel: p.love_state
          ? p.love_state === "dur"
            ? "Dur"
            : p.love_state === "seul"
            ? "Seul"
            : "Vide"
          : null,
        confidence: args.confidence,
      }),
    };
  }
  if (args.selectedPotion === "guerison") {
    return {
      recent_hurt: bridgeCandidateObject({
        value: p.recent_hurt ?? null,
        confidence: args.confidence,
      }),
      dominant_feeling: bridgeCandidateObject({
        optionValue: p.dominant_feeling ?? null,
        optionLabel: p.dominant_feeling
          ? p.dominant_feeling.charAt(0).toUpperCase() +
            p.dominant_feeling.slice(1)
          : null,
        confidence: args.confidence,
      }),
    };
  }
  return {
    pressure_source: bridgeCandidateObject({
      value: p.pressure_source ?? null,
      confidence: args.confidence,
    }),
    pressure_state: bridgeCandidateObject({
      optionValue: p.pressure_state ?? null,
      optionLabel: p.pressure_state
        ? p.pressure_state === "a_cran"
          ? "A cran"
          : p.pressure_state === "submerge"
          ? "Submerge"
          : "Stresse"
        : null,
      confidence: args.confidence,
    }),
  };
}

function needKindForPotion(
  potion: EmotionalRepairBridgePotion,
): EmotionalRepairDurableNeedKind {
  if (potion === "amour") return "self_kindness";
  if (potion === "guerison") return "healing_after_hurt";
  return "pressure_relief";
}

function informationNote(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  selectedPotion: EmotionalRepairBridgePotion;
}) {
  return {
    departed_flow_summary: args.output.repair_state.summary,
    context_for_next_dispatcher: {
      origin_flow: "emotional_repair",
      selected_potion: args.selectedPotion,
      repair_intent: args.output.repair_state.intent,
      context_domain: args.output.repair_state.context_domain,
      user_words: args.output.repair_state.user_words,
      durable_need: args.output.potion_bridge.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      instruction:
        "Utiliser cette note comme contexte pour remplir le JSON du sous-flow potion, sans faire répéter l'épisode complet.",
    },
  };
}

function bridgeContext(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  selectedPotion: EmotionalRepairBridgePotion;
  confidence: EmotionalRepairConfidence;
}): EmotionalRepairPotionBridgeContext {
  const needKind = args.output.potion_bridge.durable_need.kind ??
    needKindForPotion(args.selectedPotion);
  const note = informationNote({
    output: args.output,
    selectedPotion: args.selectedPotion,
  });
  return {
    origin_flow: "emotional_repair",
    origin_flow_status: args.confidence === "high"
      ? "bridge_consented"
      : "stabilized",
    information_note: note,
    origin_turn_summary: args.output.repair_state.summary,
    repair_intent: args.output.repair_state.intent,
    context_domain: args.output.repair_state.context_domain,
    emotional_episode: {
      summary: args.output.repair_state.summary,
      user_words: args.output.repair_state.user_words,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      already_stabilized:
        args.output.repair_state.emotion_stabilized_enough_for_tool,
    },
    durable_need: {
      kind: needKind,
      summary: args.output.potion_bridge.durable_need.summary ??
        args.output.potion_bridge.why_ready_or_blocked,
    },
    selected_potion: args.selectedPotion,
    selection_reason: args.output.potion_bridge.why_ready_or_blocked,
    prefill_candidates: bridgePrefillsForContext({
      selectedPotion: args.selectedPotion,
      prefill: args.output.potion_bridge.prefill_candidates,
      confidence: args.confidence,
    }),
    handoff_instruction_for_potion_subskill:
      "Use these as candidates, not forced locked values. Ask only for missing or low-confidence details. Do not ask the user to repeat the full emotional episode.",
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
  };
}

function visibleKindForOutput(
  output: EmotionalRepairLocalDispatcherOutput,
  bridgeIsBlocked: boolean,
): EmotionalRepairVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "exit_to_global_dispatcher"
  ) {
    return "exit_or_cancel";
  }
  if (output.flow_action === "repeat_last_repair") return "repeat_repair";
  if (output.flow_action === "ask_gentle_clarification") {
    return "ask_gentle_clarification";
  }
  if (output.flow_action === "confirm_potion_bridge" && !bridgeIsBlocked) {
    return "potion_bridge_handoff";
  }
  if (output.flow_action === "potion_bridge_offer" && !bridgeIsBlocked) {
    return output.potion_bridge.candidate_potions.length > 1
      ? "potion_bridge_choice"
      : "potion_bridge_offer";
  }
  if (output.flow_action === "repair_relationship") {
    return "repair_relationship";
  }
  if (output.flow_action === "provide_concrete_phrase") {
    return "concrete_phrase";
  }
  if (output.repair_state.intent === "anxiety_or_panic") {
    return "stabilize_anxiety";
  }
  if (output.repair_state.intent === "acute_self_attack") {
    return "separate_fact_from_identity";
  }
  if (output.repair_state.intent === "shame_or_guilt") return "de_shame";
  return output.visible_task.kind;
}

export function readEmotionalRepairLocalState(
  activeState: unknown,
): EmotionalRepairLocalState | null {
  const root = isRecord(activeState) ? activeState : {};
  const working = isRecord(root.working_state) ? root.working_state : root;
  const state = working.emotional_repair_local_state;
  if (!isRecord(state) || state.skill_id !== "emotional_repair") return null;
  return state as EmotionalRepairLocalState;
}

export function reduceEmotionalRepairLocalDispatcherOutput(args: {
  previous: EmotionalRepairLocalState | null;
  output: EmotionalRepairLocalDispatcherOutput;
  explicit_constraints?: string[];
  turn_frame?: TurnFrame | null;
}): EmotionalRepairReducerResult {
  const safetyRisk = args.turn_frame?.safety?.risk_band ?? "none";
  if (
    safetyRisk === "high" ||
    safetyRisk === "critical" ||
    args.output.flow_action === "safety_preempt"
  ) {
    return {
      status: "safety",
      response_intent: "handoff_to_safety",
      local_state: null,
      visible_task: { ...args.output.visible_task, kind: "safety" },
      potion_bridge_context: null,
      exit_to_global_dispatcher: false,
      reason_code: "safety_preempt",
      constraints: args.output.constraints,
      blocked_effects: [{
        type: "emotional_repair",
        reason_code: "safety_preempt",
      }],
      evidence: args.output.evidence,
    };
  }
  const constraints = constraintsWithInvariants(
    args.output,
    args.explicit_constraints ?? [],
  );
  const blocked = bridgeBlocked({ output: args.output, constraints });
  const selectedPotion = args.output.potion_bridge.selected_potion ??
    args.previous?.last_potion_bridge_offer?.selected_potion ??
    null;
  const visibleTaskKind = visibleKindForOutput(args.output, blocked);
  const visibleTask: EmotionalRepairVisibleTask = {
    ...args.output.visible_task,
    kind: visibleTaskKind,
    required_data: {
      ...args.output.visible_task.required_data,
      selected_potion: blocked ? null : selectedPotion,
      potion_label: blocked ? null : potionLabel(selectedPotion),
      bridge_context_summary: blocked
        ? null
        : args.output.visible_task.required_data.bridge_context_summary ??
          args.output.potion_bridge.why_ready_or_blocked,
    },
  };
  const now = new Date().toISOString();
  const turnCount = Number(args.previous?.turn_count ?? 0) + 1;

  if (args.output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: true,
      reason_code: "emotional_repair_exit_to_global_dispatcher",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }
  if (args.output.flow_action === "cancel_flow") {
    return {
      status: "complete",
      response_intent: "cancelled",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: false,
      reason_code: "emotional_repair_cancelled",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }

  const confirmed = args.output.flow_action === "confirm_potion_bridge" &&
    args.output.potion_bridge.status === "confirmed_handoff" &&
    selectedPotion &&
    !blocked &&
    args.previous?.last_potion_bridge_offer?.selected_potion === selectedPotion;
  if (confirmed) {
    const context = bridgeContext({
      output: args.output,
      selectedPotion,
      confidence: fieldConfidence("handoff"),
    });
    return {
      status: "handoff",
      response_intent: "handoff_to_select_state_potion",
      local_state: {
        ...(args.previous ?? {
          skill_id: "emotional_repair",
          mode: "local_repair_flow",
          turn_count: 0,
          max_turns: 6,
          created_at: now,
        } as EmotionalRepairLocalState),
        status: "handoff_to_potion",
        repair_state: args.output.repair_state,
        last_visible_task: visibleTask.kind,
        previous_repair_summary: args.output.repair_state.summary,
        updated_at: now,
      },
      visible_task: visibleTask,
      potion_bridge_context: context,
      exit_to_global_dispatcher: false,
      reason_code: "emotional_repair_handoff_to_select_state_potion",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }

  const shouldOffer = args.output.flow_action === "potion_bridge_offer" &&
    args.output.potion_bridge.status !== "blocked" &&
    selectedPotion &&
    !blocked;
  const offerContext = shouldOffer && selectedPotion
    ? bridgeContext({
      output: args.output,
      selectedPotion,
      confidence: fieldConfidence("offer"),
    })
    : null;
  const lastOffer = shouldOffer && selectedPotion
    ? {
      selected_potion: selectedPotion,
      durable_need: offerContext!.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      selection_reason: args.output.potion_bridge.why_ready_or_blocked,
      offered_at_turn: turnCount,
      information_note: offerContext!.information_note,
    }
    : constraints.includes("no_potion")
    ? null
    : args.previous?.last_potion_bridge_offer ?? null;
  return {
    status: "continue",
    response_intent: args.output.repair_state.phase,
    local_state: {
      skill_id: "emotional_repair",
      mode: "local_repair_flow",
      status: "active",
      repair_state: args.output.repair_state,
      last_visible_task: visibleTask.kind,
      last_potion_bridge_offer: lastOffer,
      previous_repair_summary: args.output.repair_state.summary,
      turn_count: turnCount,
      max_turns: Number(args.previous?.max_turns ?? 6) || 6,
      created_at: args.previous?.created_at ?? now,
      updated_at: now,
    },
    visible_task: visibleTask,
    potion_bridge_context: null,
    exit_to_global_dispatcher: false,
    reason_code: blocked && args.output.flow_action === "potion_bridge_offer"
      ? "emotional_repair_potion_bridge_blocked"
      : "emotional_repair_local_continue",
    constraints,
    blocked_effects:
      blocked && args.output.flow_action === "potion_bridge_offer"
        ? [{ type: "select_state_potion", reason_code: "bridge_not_mature" }]
        : [],
    evidence: args.output.evidence,
  };
}
