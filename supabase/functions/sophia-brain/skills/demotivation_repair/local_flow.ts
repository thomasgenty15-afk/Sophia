import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  type DemotivationRepairActionReadiness,
  type DemotivationRepairBridgePotion,
  type DemotivationRepairConfidence,
  type DemotivationRepairConstraint,
  type DemotivationRepairDurableNeedKind,
  type DemotivationRepairIntent,
  type DemotivationRepairLocalDispatcherOutput,
  type DemotivationRepairLocalFlowAction,
  type DemotivationRepairLocalState,
  type DemotivationRepairMotivationState,
  type DemotivationRepairNoteInformation,
  type DemotivationRepairPhase,
  type DemotivationRepairPotionBridgeContext,
  type DemotivationRepairResponseContract,
  type DemotivationRepairVisiblePotionLabel,
  type DemotivationRepairVisibleTask,
  type DemotivationRepairVisibleTaskKind,
  normalizeDemotivationRepairConstraints,
} from "./contract.ts";

export type DemotivationRepairLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: DemotivationRepairLocalState | null;
  previous_repair_summary: string | null;
  previous_potion_bridge_offer:
    | DemotivationRepairLocalState["last_potion_bridge_offer"]
    | null;
  turn_frame: TurnFrame | null;
  explicit_constraints: string[];
};

export type DemotivationRepairLocalDispatcher = (
  input: DemotivationRepairLocalDispatcherInput,
) => Promise<DemotivationRepairLocalDispatcherOutput | null>;

export type DemotivationRepairReducerResult = {
  status: "continue" | "complete" | "exit" | "handoff" | "safety";
  response_intent: string;
  local_state: DemotivationRepairLocalState | null;
  visible_task: DemotivationRepairVisibleTask;
  potion_bridge_context: DemotivationRepairPotionBridgeContext | null;
  exit_to_global_dispatcher: boolean;
  reason_code: string;
  constraints: DemotivationRepairConstraint[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS: readonly DemotivationRepairLocalFlowAction[] = [
  "answer_repair",
  "ask_gentle_clarification",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "smaller_step",
  "action_card_candidate",
  "potion_bridge_offer",
  "confirm_potion_bridge",
  "revise_repair_context",
  "repeat_last_repair",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
];

const INTENTS: readonly DemotivationRepairIntent[] = [
  "fatigue_drop",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance_loop",
  "overwhelm",
  "concrete_action_emerged",
  "asks_smaller_step",
  "asks_no_tool_support",
  "asks_recurring_support",
  "status_or_meta_question",
  "unclear",
];

const PHASES: readonly DemotivationRepairPhase[] = [
  "diagnose",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "action_card_ready",
  "exit",
];

const MOTIVATION_STATES: readonly DemotivationRepairMotivationState[] = [
  "fatigue",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance",
  "overwhelm",
  "unclear",
];

const READINESS: readonly DemotivationRepairActionReadiness[] = [
  "none",
  "hypothetical",
  "ready",
  "already_chosen",
];

const BRIDGE_POTIONS: readonly DemotivationRepairBridgePotion[] = [
  "clarte",
  "courage",
  "rappel",
];

const NEEDS: readonly DemotivationRepairDurableNeedKind[] = [
  "meaning_reconnection",
  "courage_through_avoidance",
  "anti_dropout_anchor",
];

const VISIBLE_TASKS: readonly DemotivationRepairVisibleTaskKind[] = [
  "diagnose",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "smaller_step",
  "action_card_candidate",
  "potion_bridge_offer",
  "potion_bridge_choice",
  "potion_bridge_handoff",
  "ask_gentle_clarification",
  "repeat_repair",
  "exit_or_cancel",
  "safety",
];

const TONES: readonly DemotivationRepairResponseContract["tone"][] = [
  "grounded",
  "soft_direct",
  "energy_preserving",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(
      0,
      max,
    )
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

function nullableEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? value as T
    : null;
}

function confidence(value: unknown): DemotivationRepairConfidence {
  return enumValue(value, ["low", "medium", "high"] as const, "medium");
}

function bridgePotion(value: unknown): DemotivationRepairBridgePotion | null {
  return nullableEnumValue(value, BRIDGE_POTIONS);
}

export function demotivationRepairVisiblePotionLabel(
  potion: DemotivationRepairBridgePotion | null,
): DemotivationRepairVisiblePotionLabel | null {
  switch (potion) {
    case "clarte":
      return "Potion de clarté";
    case "courage":
      return "Potion de courage";
    case "rappel":
      return "Potion anti-décrochage";
    default:
      return null;
  }
}

function normalizeRepairState(
  raw: unknown,
): DemotivationRepairLocalState["repair_state"] {
  const root = isRecord(raw) ? raw : {};
  return {
    intent: enumValue(root.intent, INTENTS, "unclear"),
    phase: enumValue(root.phase, PHASES, "diagnose"),
    motivation_state: enumValue(
      root.motivation_state,
      MOTIVATION_STATES,
      "unclear",
    ),
    action_readiness: enumValue(
      root.action_readiness,
      READINESS,
      "none",
    ),
    summary: stringValue(root.summary) ??
      "Réparation motivationnelle en cours.",
    user_words: stringArray(root.user_words),
    identity_freeze_risk: root.identity_freeze_risk === true,
    motivation_source_diagnosed: root.motivation_source_diagnosed === true,
  };
}

function normalizeResponseContract(
  raw: unknown,
): DemotivationRepairResponseContract {
  const root = isRecord(raw) ? raw : {};
  return {
    max_questions: root.max_questions === 1 ? 1 : 0,
    allow_plan_edit: root.allow_plan_edit === true,
    allow_tool_suggestion: root.allow_tool_suggestion === true,
    allow_potion_suggestion: root.allow_potion_suggestion === true,
    allow_attack_card_suggestion: root.allow_attack_card_suggestion === true,
    allow_concrete_action: root.allow_concrete_action === true,
    tone: enumValue(root.tone, TONES, "energy_preserving"),
  };
}

function normalizePrefillCandidates(
  raw: unknown,
): DemotivationRepairLocalDispatcherOutput["potion_bridge"][
  "prefill_candidates"
] {
  const root = isRecord(raw) ? raw : {};
  return {
    plan_meaning_loss_reason: stringValue(root.plan_meaning_loss_reason),
    avoidance_target: stringValue(root.avoidance_target),
    blocker_kind: nullableEnumValue(
      root.blocker_kind,
      ["resultat", "regard", "inconfort", "conflit"] as const,
    ),
    drift_target: stringValue(root.drift_target),
    drift_style: nullableEnumValue(
      root.drift_style,
      ["oubli", "repousse", "laisse_filer", "baisse_elan"] as const,
    ),
  };
}

function normalizeNoteInformation(
  raw: unknown,
  targetFlow: DemotivationRepairNoteInformation["target_flow"],
  fallbackSummary: string,
): DemotivationRepairNoteInformation {
  const root = isRecord(raw) ? raw : {};
  return {
    source_flow_presentation: stringValue(root.source_flow_presentation) ??
      "demotivation_repair vient de clarifier une baisse d'élan, son origine motivationnelle, et le type de soutien durable utile.",
    handoff_context_for_next_dispatcher:
      stringValue(root.handoff_context_for_next_dispatcher) ??
        fallbackSummary,
    target_flow: enumValue(
      root.target_flow,
      ["global", "select_state_potion", "safety"] as const,
      targetFlow,
    ),
    target_local_dispatcher_hint: stringValue(
      root.target_local_dispatcher_hint,
    ),
  };
}

function normalizeVisibleTask(
  raw: unknown,
  selectedPotion: DemotivationRepairBridgePotion | null,
  repairSummary: string,
  userWords: string[],
): DemotivationRepairVisibleTask {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.required_data) ? root.required_data : {};
  const dataPotion = bridgePotion(data.selected_potion) ?? selectedPotion;
  return {
    kind: enumValue(root.kind, VISIBLE_TASKS, "diagnose"),
    required_data: {
      repair_summary: stringValue(data.repair_summary) ?? repairSummary,
      user_words: stringArray(data.user_words).length
        ? stringArray(data.user_words)
        : userWords,
      selected_potion: dataPotion,
      potion_label: demotivationRepairVisiblePotionLabel(dataPotion),
      bridge_context_summary: stringValue(data.bridge_context_summary),
    },
  };
}

export function normalizeDemotivationRepairLocalDispatcherOutput(
  raw: unknown,
): DemotivationRepairLocalDispatcherOutput | null {
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
  const exitMemo = isRecord(root.exit_memo) ? root.exit_memo : {};
  const bridgeNote = bridge.note_information === null
    ? null
    : normalizeNoteInformation(
      bridge.note_information,
      "select_state_potion",
      stringValue(bridge.why_ready_or_blocked) ?? repairState.summary,
    );
  return {
    flow_action: enumValue(root.flow_action, FLOW_ACTIONS, "answer_repair"),
    confidence: confidence(root.confidence),
    risk_score: Math.max(0, Math.min(10, Number(root.risk_score ?? 0) || 0)),
    repair_state: repairState,
    constraints: normalizeDemotivationRepairConstraints(root.constraints),
    response_contract: normalizeResponseContract(root.response_contract),
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
      visible_potion_label: demotivationRepairVisiblePotionLabel(
        selectedPotion,
      ),
      candidate_potions: Array.isArray(bridge.candidate_potions)
        ? bridge.candidate_potions.flatMap((item) => {
          if (!isRecord(item)) return [];
          const potion = bridgePotion(item.potion_type);
          if (!potion) return [];
          return [{
            potion_type: potion,
            visible_label: demotivationRepairVisiblePotionLabel(potion)!,
            confidence: confidence(item.confidence),
            reason: stringValue(item.reason) ?? "Candidat bridge potion.",
          }];
        }).slice(0, 2)
        : [],
      durable_need: {
        kind: nullableEnumValue(durable.kind, NEEDS),
        summary: stringValue(durable.summary),
      },
      prefill_candidates: normalizePrefillCandidates(
        bridge.prefill_candidates,
      ),
      missing_before_handoff: stringArray(bridge.missing_before_handoff),
      why_ready_or_blocked: stringValue(bridge.why_ready_or_blocked) ??
        "Non précisé.",
      note_information: bridgeNote,
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
      note_information: exitMemo.note_information === null
        ? null
        : normalizeNoteInformation(
          exitMemo.note_information,
          "global",
          stringValue(exitMemo.handoff_hint_for_global_dispatcher) ??
            repairState.summary,
        ),
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
    throw new Error("demotivation_repair_local_dispatcher_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow demotivation_repair.",
    "Tu n'es pas le dispatcher global et tu ne reponds jamais directement au user.",
    "Retourne uniquement un JSON strict conforme au contrat fourni.",
    "Safety preempt gagne sur tout.",
    "Tu peux seulement preparer un bridge vers clarte, courage ou rappel.",
    "Le label visible de rappel est toujours Potion anti-décrochage. N'ecris jamais Potion rappel.",
    "Ne propose pas de potion tant que la source du decrochage n'est pas diagnostiquee.",
    "Ne propose pas de potion si no_potion, no_tool ou asks_no_tool_support bloque les outils.",
    "Un bridge potion exige diagnostic et consentement; confirm_potion_bridge signifie que le user consent a une offre deja faite.",
    "La note d'information pour le flow suivant doit contenir une presentation du flow quitte et le contexte utile au dispatcher potion.",
    "Aucune session potion, aucun rappel, aucun scheduled_checkin, aucune confirmation executable, aucun write DB.",
  ].join("\n");
}

export const runDemotivationRepairLocalDispatcher:
  DemotivationRepairLocalDispatcher = async (input) => {
    const userPrompt = JSON.stringify({
      task: "dispatch_demotivation_repair_local_flow",
      required_json_shape: {
        flow_action:
          "answer_repair|ask_gentle_clarification|reduce_friction|restore_meaning|stabilize_energy|smaller_step|action_card_candidate|potion_bridge_offer|confirm_potion_bridge|revise_repair_context|repeat_last_repair|cancel_flow|exit_to_global_dispatcher|safety_preempt",
        confidence: "low|medium|high",
        risk_score: "number 0..10",
        repair_state: {
          intent:
            "fatigue_drop|loss_of_meaning|failure_accumulation|avoidance_loop|overwhelm|concrete_action_emerged|asks_smaller_step|asks_no_tool_support|asks_recurring_support|status_or_meta_question|unclear",
          phase:
            "diagnose|reduce_friction|restore_meaning|stabilize_energy|action_card_ready|exit",
          motivation_state:
            "fatigue|loss_of_meaning|failure_accumulation|avoidance|overwhelm|unclear",
          action_readiness: "none|hypothetical|ready|already_chosen",
          summary: "string",
          user_words: ["string"],
          identity_freeze_risk: true,
          motivation_source_diagnosed: false,
        },
        constraints: [
          "no_potion|no_tool|no_plan_edit|no_questions|one_question_max|concrete_before_question|short_reply|do_not_moralize|do_not_modify_plan_yet|prefer_smallest_action",
        ],
        response_contract: {
          max_questions: "0|1",
          allow_plan_edit: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_attack_card_suggestion: false,
          allow_concrete_action: false,
          tone: "grounded|soft_direct|energy_preserving",
        },
        potion_bridge: {
          status:
            "not_applicable|candidate|offered_waiting_consent|confirmed_handoff|blocked",
          selected_potion: "clarte|courage|rappel|null",
          visible_potion_label:
            "Potion de clarté|Potion de courage|Potion anti-décrochage|null",
          candidate_potions: [{
            potion_type: "clarte|courage|rappel",
            visible_label:
              "Potion de clarté|Potion de courage|Potion anti-décrochage",
            confidence: "low|medium|high",
            reason: "string",
          }],
          durable_need: {
            kind:
              "meaning_reconnection|courage_through_avoidance|anti_dropout_anchor|null",
            summary: "string|null",
          },
          prefill_candidates: {
            plan_meaning_loss_reason: "string|null",
            avoidance_target: "string|null",
            blocker_kind: "resultat|regard|inconfort|conflit|null",
            drift_target: "string|null",
            drift_style: "oubli|repousse|laisse_filer|baisse_elan|null",
          },
          missing_before_handoff: ["string"],
          why_ready_or_blocked: "string",
          note_information: {
            source_flow_presentation: "string|null",
            handoff_context_for_next_dispatcher: "string|null",
            target_flow: "select_state_potion|null",
            target_local_dispatcher_hint: "string|null",
          },
        },
        visible_task: {
          kind:
            "diagnose|reduce_friction|restore_meaning|stabilize_energy|smaller_step|action_card_candidate|potion_bridge_offer|potion_bridge_choice|potion_bridge_handoff|ask_gentle_clarification|repeat_repair|exit_or_cancel|safety",
          required_data: {
            repair_summary: "string",
            user_words: ["string"],
            selected_potion: "clarte|courage|rappel|null",
            potion_label:
              "Potion de clarté|Potion de courage|Potion anti-décrochage|null",
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
          note_information: {
            source_flow_presentation: "string|null",
            handoff_context_for_next_dispatcher: "string|null",
            target_flow: "global|select_state_potion|safety|null",
            target_local_dispatcher_hint: "string|null",
          },
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
      active_demotivation_repair_state: input.active_state,
      previous_repair_summary: input.previous_repair_summary,
      previous_potion_bridge_offer: input.previous_potion_bridge_offer,
      turn_frame_safety: input.turn_frame?.safety ?? null,
      turn_frame_risk: input.turn_frame?.conversation_risk ?? null,
      explicit_constraints: input.explicit_constraints,
      possible_potion_bridge_targets: {
        clarte: ["plan_meaning_loss_reason"],
        courage: [
          "avoidance_target",
          "blocker_kind:resultat|regard|inconfort|conflit",
        ],
        rappel: [
          "drift_target",
          "drift_style:oubli|repousse|laisse_filer|baisse_elan",
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
          source: "demotivation_repair.local_dispatcher",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      return normalizeDemotivationRepairLocalDispatcherOutput(
        parseJsonObject(raw),
      );
    } catch (error) {
      console.warn("[DemotivationRepair] local dispatcher failed", { error });
      return null;
    }
  };

function constraintsWithInvariants(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  explicitConstraints: string[];
}): DemotivationRepairConstraint[] {
  const constraints = new Set<DemotivationRepairConstraint>([
    ...args.output.constraints,
    ...normalizeDemotivationRepairConstraints(args.explicitConstraints),
    "do_not_moralize",
  ]);
  if (args.output.repair_state.intent === "asks_no_tool_support") {
    constraints.add("no_tool");
    constraints.add("no_potion");
  }
  if (constraints.has("no_tool")) constraints.add("no_potion");
  if (constraints.has("do_not_modify_plan_yet")) {
    constraints.add("no_plan_edit");
  }
  return [...constraints];
}

function bridgeBlocked(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  constraints: DemotivationRepairConstraint[];
}): boolean {
  return args.constraints.some((constraint) =>
    constraint === "no_potion" || constraint === "no_tool"
  ) ||
    args.output.repair_state.intent === "asks_no_tool_support" ||
    args.output.repair_state.motivation_source_diagnosed !== true ||
    args.output.response_contract.allow_tool_suggestion !== true ||
    args.output.response_contract.allow_potion_suggestion !== true;
}

function fieldConfidence(
  action: "offer" | "handoff",
): DemotivationRepairConfidence {
  return action === "handoff" ? "high" : "medium";
}

function bridgeCandidateObject(args: {
  value?: string | null;
  optionValue?: string | null;
  optionLabel?: string | null;
  confidence: DemotivationRepairConfidence;
}) {
  return {
    candidate_value: args.value ?? null,
    option_value: args.optionValue ?? null,
    option_label: args.optionLabel ?? null,
    confidence: args.confidence,
    source: "demotivation_repair" as const,
  };
}

function blockerKindLabel(value: string | null | undefined): string | null {
  switch (value) {
    case "resultat":
      return "Résultat";
    case "regard":
      return "Regard";
    case "inconfort":
      return "Inconfort";
    case "conflit":
      return "Conflit";
    default:
      return null;
  }
}

function driftStyleLabel(value: string | null | undefined): string | null {
  switch (value) {
    case "oubli":
      return "Oubli";
    case "repousse":
      return "Repousse";
    case "laisse_filer":
      return "Laisse filer";
    case "baisse_elan":
      return "Baisse d'élan";
    default:
      return null;
  }
}

function bridgePrefillsForContext(args: {
  selectedPotion: DemotivationRepairBridgePotion;
  prefill: DemotivationRepairLocalDispatcherOutput["potion_bridge"][
    "prefill_candidates"
  ];
  confidence: DemotivationRepairConfidence;
}): DemotivationRepairPotionBridgeContext["prefill_candidates"] {
  const p = args.prefill;
  if (args.selectedPotion === "clarte") {
    return {
      plan_meaning_loss_reason: bridgeCandidateObject({
        value: p.plan_meaning_loss_reason ?? null,
        confidence: args.confidence,
      }),
    };
  }
  if (args.selectedPotion === "courage") {
    return {
      avoidance_target: bridgeCandidateObject({
        value: p.avoidance_target ?? null,
        confidence: args.confidence,
      }),
      blocker_kind: bridgeCandidateObject({
        optionValue: p.blocker_kind ?? null,
        optionLabel: blockerKindLabel(p.blocker_kind),
        confidence: args.confidence,
      }),
    };
  }
  return {
    drift_target: bridgeCandidateObject({
      value: p.drift_target ?? null,
      confidence: args.confidence,
    }),
    drift_style: bridgeCandidateObject({
      optionValue: p.drift_style ?? null,
      optionLabel: driftStyleLabel(p.drift_style),
      confidence: args.confidence,
    }),
  };
}

function needKindForPotion(
  potion: DemotivationRepairBridgePotion,
): DemotivationRepairDurableNeedKind {
  if (potion === "clarte") return "meaning_reconnection";
  if (potion === "courage") return "courage_through_avoidance";
  return "anti_dropout_anchor";
}

function noteInformation(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  selectedPotion: DemotivationRepairBridgePotion;
}): DemotivationRepairNoteInformation {
  return args.output.potion_bridge.note_information ?? {
    source_flow_presentation:
      "demotivation_repair vient de clarifier une baisse d'élan, son origine motivationnelle, et le type de soutien durable utile.",
    handoff_context_for_next_dispatcher: JSON.stringify({
      origin_flow: "demotivation_repair",
      selected_potion: args.selectedPotion,
      visible_potion_label: demotivationRepairVisiblePotionLabel(
        args.selectedPotion,
      ),
      repair_intent: args.output.repair_state.intent,
      motivation_state: args.output.repair_state.motivation_state,
      user_words: args.output.repair_state.user_words,
      durable_need: args.output.potion_bridge.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      instruction:
        "Utiliser cette note comme contexte pour remplir le JSON du sous-flow potion, sans faire répéter l'épisode de décrochage.",
    }),
    target_flow: "select_state_potion",
    target_local_dispatcher_hint:
      "Entrer directement dans la potion sélectionnée, consommer les candidats fournis, et ne pas refaire diagnostiquer la démotivation.",
  };
}

function bridgeContext(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  selectedPotion: DemotivationRepairBridgePotion;
  confidence: DemotivationRepairConfidence;
}): DemotivationRepairPotionBridgeContext {
  const needKind = args.output.potion_bridge.durable_need.kind ??
    needKindForPotion(args.selectedPotion);
  const note = noteInformation({
    output: args.output,
    selectedPotion: args.selectedPotion,
  });
  return {
    origin_flow: "demotivation_repair",
    origin_flow_status: args.confidence === "high"
      ? "bridge_consented"
      : "diagnosed",
    note_information: note,
    origin_turn_summary: args.output.repair_state.summary,
    repair_intent: args.output.repair_state.intent,
    motivation_state: args.output.repair_state.motivation_state,
    action_readiness: args.output.repair_state.action_readiness,
    demotivation_episode: {
      summary: args.output.repair_state.summary,
      user_words: args.output.repair_state.user_words,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      already_diagnosed: args.output.repair_state.motivation_source_diagnosed,
    },
    durable_need: {
      kind: needKind,
      summary: args.output.potion_bridge.durable_need.summary ??
        args.output.potion_bridge.why_ready_or_blocked,
    },
    selected_potion: args.selectedPotion,
    visible_potion_label: demotivationRepairVisiblePotionLabel(
      args.selectedPotion,
    )!,
    selection_reason: args.output.potion_bridge.why_ready_or_blocked,
    prefill_candidates: bridgePrefillsForContext({
      selectedPotion: args.selectedPotion,
      prefill: args.output.potion_bridge.prefill_candidates,
      confidence: args.confidence,
    }),
    handoff_instruction_for_potion_subskill:
      "Use these as candidates, not forced locked values. Ask only for missing or low-confidence details. Do not ask the user to repeat the full demotivation episode.",
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
  };
}

function visibleKindForOutput(
  output: DemotivationRepairLocalDispatcherOutput,
  bridgeIsBlocked: boolean,
): DemotivationRepairVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "exit_to_global_dispatcher"
  ) return "exit_or_cancel";
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
  if (output.flow_action === "reduce_friction") return "reduce_friction";
  if (output.flow_action === "restore_meaning") return "restore_meaning";
  if (output.flow_action === "stabilize_energy") return "stabilize_energy";
  if (output.flow_action === "smaller_step") return "smaller_step";
  if (output.flow_action === "action_card_candidate") {
    return "action_card_candidate";
  }
  return output.visible_task.kind;
}

export function readDemotivationRepairLocalState(
  activeState: unknown,
): DemotivationRepairLocalState | null {
  const root = isRecord(activeState) ? activeState : {};
  const working = isRecord(root.working_state) ? root.working_state : root;
  const state = working.demotivation_repair_local_state;
  if (!isRecord(state) || state.skill_id !== "demotivation_repair") {
    return null;
  }
  return state as DemotivationRepairLocalState;
}

export function reduceDemotivationRepairLocalDispatcherOutput(args: {
  previous: DemotivationRepairLocalState | null;
  output: DemotivationRepairLocalDispatcherOutput;
  explicit_constraints?: string[];
  turn_frame?: TurnFrame | null;
}): DemotivationRepairReducerResult {
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
        type: "demotivation_repair",
        reason_code: "safety_preempt",
      }],
      evidence: args.output.evidence,
    };
  }
  const constraints = constraintsWithInvariants({
    output: args.output,
    explicitConstraints: args.explicit_constraints ?? [],
  });
  const blocked = bridgeBlocked({ output: args.output, constraints });
  const selectedPotion = args.output.potion_bridge.selected_potion ??
    args.previous?.last_potion_bridge_offer?.selected_potion ??
    null;
  const visibleTaskKind = visibleKindForOutput(args.output, blocked);
  const visibleTask: DemotivationRepairVisibleTask = {
    ...args.output.visible_task,
    kind: visibleTaskKind,
    required_data: {
      ...args.output.visible_task.required_data,
      selected_potion: blocked ? null : selectedPotion,
      potion_label: blocked
        ? null
        : demotivationRepairVisiblePotionLabel(selectedPotion),
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
      reason_code: "demotivation_repair_exit_to_global_dispatcher",
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
      reason_code: "demotivation_repair_cancelled",
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
          skill_id: "demotivation_repair",
          mode: "local_repair_flow",
          turn_count: 0,
          max_turns: 6,
          created_at: now,
        } as DemotivationRepairLocalState),
        status: "handoff_to_potion",
        repair_state: args.output.repair_state,
        last_visible_task: visibleTask.kind,
        previous_repair_summary: args.output.repair_state.summary,
        updated_at: now,
      },
      visible_task: visibleTask,
      potion_bridge_context: context,
      exit_to_global_dispatcher: false,
      reason_code: "demotivation_repair_handoff_to_select_state_potion",
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
      visible_potion_label: demotivationRepairVisiblePotionLabel(
        selectedPotion,
      )!,
      durable_need: offerContext!.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      selection_reason: args.output.potion_bridge.why_ready_or_blocked,
      offered_at_turn: turnCount,
      note_information: offerContext!.note_information,
    }
    : args.previous?.last_potion_bridge_offer ?? null;
  return {
    status: "continue",
    response_intent: args.output.repair_state.phase,
    local_state: {
      skill_id: "demotivation_repair",
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
      ? "demotivation_repair_potion_bridge_blocked"
      : "demotivation_repair_local_continue",
    constraints,
    blocked_effects:
      blocked && args.output.flow_action === "potion_bridge_offer"
        ? [{ type: "select_state_potion", reason_code: "bridge_not_mature" }]
        : [],
    evidence: args.output.evidence,
  };
}
