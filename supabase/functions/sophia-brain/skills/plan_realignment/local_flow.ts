import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  directEffectLocalDispatcherPromptLines,
  directEffectTimeContextFromTurnFrame,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
  localOneShotDirectEffectPromptLines,
  normalizeLocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import { noteReconciliationPromptLines } from "../_shared/note_reconciliation.ts";
import {
  flowEntryWindow,
  RECENT_MESSAGE_LIMITS,
} from "../../context/recent_messages_policy.ts";
import type {
  PlanRealignmentConversationContext,
  PlanRealignmentDriftType,
  PlanRealignmentFlowAction,
  PlanRealignmentLocalDispatcherOutput,
  PlanRealignmentLocalState,
  PlanRealignmentReducerResult,
  PlanRealignmentScope,
  PlanRealignmentVisibleTaskKind,
} from "./contract.ts";

const DRIFT_TYPES = new Set<PlanRealignmentDriftType>([
  "missed_plan",
  "late_on_plan",
  "lost_rhythm",
  "plan_too_heavy",
  "plan_too_light",
  "changed_context",
  "ambiguous",
]);

const SCOPES = new Set<PlanRealignmentScope>([
  "whole_plan",
  "week",
  "level",
  "unknown",
]);

const FLOW_ACTIONS = new Set<PlanRealignmentFlowAction>([
  "support",
  "platform_guidance",
  "answer_followup",
  "close_flow",
  "exit_to_global_dispatcher",
]);

const VISIBLE_TASKS = new Set<PlanRealignmentVisibleTaskKind>([
  "plan_realignment_support",
  "plan_realignment_platform_guidance",
  "plan_realignment_followup",
  "plan_realignment_close",
  "exit_ack",
]);

export type PlanRealignmentLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  previous_state: PlanRealignmentLocalState | null;
  inbound_note_information?: NoteInformation | null;
  turn_frame?: unknown;
  /** Vrai au tout premier tour possédé par ce flow (aucun état persisté). */
  is_flow_entry?: boolean;
  dispatcher_signal_context: PlanRealignmentLocalState[
    "dispatcher_signal_context"
  ];
};

export type PlanRealignmentLocalDispatcher = (
  input: PlanRealignmentLocalDispatcherInput,
) => Promise<PlanRealignmentLocalDispatcherOutput | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, 180)).filter(Boolean).slice(0, max)
    : [];
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const source = text(raw, 50_000);
  const unfenced = source.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("plan_realignment_not_json");
  }
  const parsed = JSON.parse(unfenced.slice(start, end + 1));
  if (!isRecord(parsed)) throw new Error("plan_realignment_not_object");
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  const candidate = text(value);
  return allowed.has(candidate as T) ? candidate as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function defaultConversationContext(
  patch: Partial<PlanRealignmentConversationContext> = {},
): PlanRealignmentConversationContext {
  return {
    drift_type: patch.drift_type ?? "ambiguous",
    scope: patch.scope ?? "unknown",
    explicit_adjust_request: patch.explicit_adjust_request ?? false,
    product_execution_allowed: false,
    user_need_summary: patch.user_need_summary ?? null,
    recommended_surface: "Dashboard > Plan",
    next_step: patch.next_step ??
      "ouvre Dashboard > Plan, puis remplis le cadre Ajuster mon plan en expliquant franchement ce qui n'a pas tenu, pourquoi, et ce que tu aimerais avoir a la place.",
    known_values: patch.known_values ?? {},
    direct_effect_confirmation_context:
      patch.direct_effect_confirmation_context ?? null,
    missing_or_weak_values: patch.missing_or_weak_values ?? [],
    evidence_used: patch.evidence_used ?? [],
    tone_constraints: [
      ...new Set(["short", "reassuring", ...(patch.tone_constraints ?? [])]),
    ],
    do_not_say: [
      ...new Set([
        "Ne dis jamais que Sophia a ajuste, modifie, allege, deplace ou enregistre le plan depuis le chat.",
        "Ne dis pas que le user peut supprimer, decaler, diminuer ou reprioriser directement les actions du plan depuis ce flow.",
        "Ne promets jamais une execution future depuis le chat.",
        "Ne mentionne pas JSON, dispatcher, reducer, DB, note_information ou outil interne.",
        ...(patch.do_not_say ?? []),
      ]),
    ],
  };
}

function normalizeConversationContext(
  raw: unknown,
  fallback: PlanRealignmentConversationContext,
): PlanRealignmentConversationContext {
  const root = isRecord(raw) ? raw : {};
  return defaultConversationContext({
    drift_type: enumValue(root.drift_type, DRIFT_TYPES, fallback.drift_type),
    scope: enumValue(root.scope, SCOPES, fallback.scope),
    explicit_adjust_request: root.explicit_adjust_request === true ||
      fallback.explicit_adjust_request,
    user_need_summary: text(root.user_need_summary, 240) ||
      fallback.user_need_summary,
    next_step: text(root.next_step, 240) || fallback.next_step,
    known_values: isRecord(root.known_values) ? root.known_values : {},
    direct_effect_confirmation_context: isRecord(
        root.direct_effect_confirmation_context,
      )
      ? root.direct_effect_confirmation_context
      : fallback.direct_effect_confirmation_context ?? null,
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 8),
    evidence_used: stringArray(root.evidence_used, 8),
    tone_constraints: stringArray(root.tone_constraints, 8),
    do_not_say: stringArray(root.do_not_say, 8),
  });
}

export function readPlanRealignmentState(
  activeSkillState: unknown,
): PlanRealignmentLocalState | null {
  if (!isRecord(activeSkillState)) return null;
  if (activeSkillState.skill_id !== "plan_realignment") return null;
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : activeSkillState;
  const local = isRecord(working.plan_realignment_local_state)
    ? working.plan_realignment_local_state
    : working;
  return normalizeStoredState(local);
}

function normalizeStoredState(
  value: unknown,
): PlanRealignmentLocalState | null {
  if (!isRecord(value)) return null;
  return {
    drift_type: enumValue(value.drift_type, DRIFT_TYPES, "ambiguous"),
    scope: enumValue(value.scope, SCOPES, "unknown"),
    explicit_adjust_request: value.explicit_adjust_request === true,
    product_execution_allowed: false,
    user_need_summary: text(value.user_need_summary, 240) || null,
    dispatcher_signal_context: isRecord(value.dispatcher_signal_context)
      ? value.dispatcher_signal_context as PlanRealignmentLocalState[
        "dispatcher_signal_context"
      ]
      : null,
    turn_count: Math.max(0, Number(value.turn_count ?? 0) || 0),
    max_turns: 4,
    last_visible_task_kind: enumValue(
      value.last_visible_task_kind,
      VISIBLE_TASKS,
      "plan_realignment_support",
    ),
    last_answer_summary: text(value.last_answer_summary, 240) || null,
  };
}

function noteForExit(args: {
  outputNote: unknown;
  userMessage: string;
  state: PlanRealignmentLocalState | null;
  output: PlanRealignmentLocalDispatcherOutput;
}): NoteInformation | null {
  const structured_context = {
    user_message_summary: args.output.user_need_summary ?? args.userMessage,
    active_flow_summary:
      "plan_realignment reassures plan drift and guides to Dashboard > Plan; it never executes plan changes from chat.",
    collected_state: {
      drift_type: args.output.drift_type ?? args.state?.drift_type ?? null,
      scope: args.output.scope ?? args.state?.scope ?? null,
      explicit_adjust_request: args.output.explicit_adjust_request ??
        args.state?.explicit_adjust_request ?? false,
      product_execution_allowed: false,
      dispatcher_signal_context: args.state?.dispatcher_signal_context ?? null,
    },
    unresolved_questions: [],
    recommended_next_focus: "global",
    evidence: args.output.evidence,
  };
  const fallback = createNoteInformation({
    source_flow_id: "plan_realignment",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: JSON.stringify(structured_context),
    user_words: [args.userMessage, ...args.output.evidence].filter(Boolean)
      .slice(0, 3),
    structured_context,
    confidence: args.output.confidence,
  });
  const outputNote = isRecord(args.outputNote) ? args.outputNote : null;
  return outputNote
    ? normalizeNoteInformation(
      {
        ...outputNote,
        user_words: fallback.user_words,
        structured_context: isRecord(outputNote.structured_context)
          ? outputNote.structured_context
          : structured_context,
      },
      fallback,
    )
    : fallback;
}

export function normalizePlanRealignmentLocalDispatcherOutput(
  raw: unknown,
): PlanRealignmentLocalDispatcherOutput {
  const root = parseObject(raw);
  const rawAction = text(root.flow_action);
  const action = rawAction === "safety_preempt"
    ? "exit_to_global_dispatcher"
    : enumValue(root.flow_action, FLOW_ACTIONS, "support");
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const drift = enumValue(root.drift_type, DRIFT_TYPES, "ambiguous");
  const scope = enumValue(root.scope, SCOPES, "unknown");
  const userNeedSummary = text(root.user_need_summary, 240) || null;
  const nextStep = text(root.next_step, 240) ||
    "ouvrir Dashboard > Plan > Ajuster mon plan et expliquer franchement ce qui n'a pas tenu.";
  const fallbackContext = defaultConversationContext({
    drift_type: drift,
    scope,
    explicit_adjust_request: root.explicit_adjust_request === true,
    user_need_summary: userNeedSummary,
    next_step: nextStep,
    evidence_used: stringArray(root.evidence, 8),
  });
  const visibleKindFallback: PlanRealignmentVisibleTaskKind =
    action === "platform_guidance"
      ? "plan_realignment_platform_guidance"
      : action === "answer_followup"
      ? "plan_realignment_followup"
      : action === "close_flow"
      ? "plan_realignment_close"
      : action === "exit_to_global_dispatcher"
      ? "exit_ack"
      : "plan_realignment_support";
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    drift_type: drift,
    scope,
    explicit_adjust_request: root.explicit_adjust_request === true,
    user_need_summary: userNeedSummary,
    next_step: nextStep,
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set(["active", "closing", "closed", "exit_to_global"]),
        action === "close_flow" ? "closed" : "active",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue(visibleRoot.kind, VISIBLE_TASKS, visibleKindFallback),
      instruction: text(visibleRoot.instruction),
      conversation_context: normalizeConversationContext(
        isRecord(visibleRoot) ? visibleRoot.conversation_context : null,
        fallbackContext,
      ),
    },
    note_information: null,
    evidence: stringArray(root.evidence, 8),
  };
}

export function reducePlanRealignmentLocalDispatcherOutput(args: {
  previous: PlanRealignmentLocalState | null;
  output: PlanRealignmentLocalDispatcherOutput;
  userMessage: string;
}): PlanRealignmentReducerResult {
  const output = args.output;
  if (
    output.flow_action === "exit_to_global_dispatcher" || output.risk_score >= 7
  ) {
    return {
      status: "exit",
      reason_code: "plan_realignment_exit_to_global",
      local_state: null,
      visible_task: "exit_ack",
      conversation_context: output.visible_task.conversation_context,
      note_information: noteForExit({
        outputNote: output.note_information,
        userMessage: args.userMessage,
        state: args.previous,
        output,
      }),
      effects: { requested: [], allowed: [], blocked: [], committed: [] },
    };
  }
  // plan_realignment est un flow one-shot: une fois le message de
  // rassurance + redirection vers Ajuster mon plan rendu, le flow se clot
  // et rend la main au dispatcher global. Un latch multi-tours capturait
  // les intentions suivantes du user (track progress, rappel, lecture).
  const status = "complete" as const;
  const signalContext = args.previous?.dispatcher_signal_context ?? null;
  return {
    status,
    reason_code: "plan_realignment_complete",
    local_state: null,
    visible_task: output.visible_task.kind,
    conversation_context: defaultConversationContext({
      ...output.visible_task.conversation_context,
      drift_type: output.drift_type ?? signalContext?.drift_type ??
        "ambiguous",
      scope: output.scope ?? signalContext?.scope ?? "unknown",
      explicit_adjust_request: output.explicit_adjust_request ||
        signalContext?.explicit_adjust_request === true,
      user_need_summary: output.user_need_summary ??
        args.previous?.user_need_summary ?? null,
      next_step: output.next_step,
      known_values: {
        ...output.visible_task.conversation_context.known_values,
        dispatcher_signal_context: signalContext,
      },
      evidence_used: output.evidence,
    }),
    note_information: null,
    effects: { requested: [], allowed: [], blocked: [], committed: [] },
  };
}

function dispatcherPrompt(input: PlanRealignmentLocalDispatcherInput) {
  const conversationWindow = flowEntryWindow({
    recent_messages: input.recent_messages,
    user_message: input.user_message,
    is_cold_entry: input.is_flow_entry === true,
    continuation_limit: RECENT_MESSAGE_LIMITS.subskillHistory,
  });
  return [
    "Tu es le dispatcher local du skill plan_realignment.",
    ...conversationWindow.framing,
    ...noteReconciliationPromptLines(),
    "Retourne uniquement le JSON demande. Ne reponds pas au user.",
    "Responsabilite du flow: le user s'est deconnecte du plan, a pris du retard, a perdu le rythme, trouve la semaine/le plan trop lourd ou dit que le contexte a change.",
    "Objectif: rassurer sans culpabiliser, expliquer que le bon mouvement Sophia est de realigner le plan, puis guider vers Dashboard > Plan > Ajuster mon plan.",
    "Le produit ne permet pas d'ajuster le plan depuis le chat. product_execution_allowed est toujours false. Ne promets jamais une execution, creation, modification, sauvegarde ou patch de plan depuis le chat.",
    "Produit: le user ne supprime pas, ne decale pas, ne diminue pas et ne repriorise pas directement les actions depuis ce flow. Il remplit le cadre Ajuster mon plan; l'IA prendra automatiquement en compte son input pour adapter la suite du plan.",
    "Le visible agent ne doit pas donner une petite phrase a copier par defaut ni une liste fermee d'elements au hasard. Il doit ouvrir des axes de reflexion pour aider le user a donner ses propres infos: ce qui n'a pas tenu, pourquoi il pense que c'est arrive, ce qu'il aimerait avoir a la place, ce qu'il veut garder, ce qui est devenu impossible ou trop lourd, contraintes de temps/energie/contexte, niveau de retard, rythme plus tenable, arbitrages acceptes/refuses.",
    "Le visible agent ne doit pas dire 'raconter a Sophia' ou 'dire a Sophia'. Il doit parler d'ecrire dans Ajuster mon plan, de donner du contexte dans le cadre, ou de decrire la situation pour que le plan soit realigne.",
    "Si le dernier message demande ou/comment faire ce realignement dans Sophia, reste dans le flow et choisis platform_guidance.",
    "Si le dernier message demande seulement une definition, une difference ou une explication liee au realignement du plan, reste dans le flow et choisis answer_followup.",
    "Si le dernier message recentre sur une action precise bloquee et demande quel levier choisir, utilise exit_to_global_dispatcher vers global avec note_information; ne lance pas coaching_recommendation directement.",
    "Si le message sort vraiment du scope, utilise exit_to_global_dispatcher avec target_dispatcher=global.",
    ...directEffectLocalDispatcherPromptLines(),
    ...localOneShotDirectEffectPromptLines("plan_realignment actif"),
    "Regle create_one_shot_reminder pendant plan_realignment: si current_user_message contient une demande explicite de rappel ponctuel avec un delai ou moment exploitable, remplis direct_effect_request et continue le besoin plan_realignment restant. Le rappel ne doit jamais absorber le tour.",
    JSON.stringify({
      current_user_message: input.user_message,
      recent_messages: conversationWindow.messages,
      previous_state: input.previous_state,
      dispatcher_signal_context: input.dispatcher_signal_context,
      inbound_note_information: input.inbound_note_information ?? null,
      platform_context: withDirectEffectLocalContext(
        {},
        (input.turn_frame as any)?.plan_snapshot ?? null,
        undefined,
        directEffectTimeContextFromTurnFrame(input.turn_frame),
      ),
      direct_effect_lane: (input.turn_frame as any)?.direct_effect_lane ?? null,
      direct_effect_confirmation_context:
        (input.turn_frame as any)?.direct_effect_confirmation_context ?? null,
      product_guidance: {
        recommended_surface: "Dashboard > Plan",
        execution_from_chat_allowed: false,
        user_action:
          "ouvrir Dashboard > Plan > Ajuster mon plan, puis ecrire dans le cadre ce qui n'a pas tenu, pourquoi, et ce que le user aimerait avoir a la place; ne pas presenter de suppression, decalage, diminution ou repriorisation directe.",
      },
      expected_json_shape: {
        flow_action:
          "support|platform_guidance|answer_followup|close_flow|exit_to_global_dispatcher",
        confidence: "low|medium|high",
        risk_score: 0,
        drift_type:
          "missed_plan|late_on_plan|lost_rhythm|plan_too_heavy|changed_context|ambiguous",
        scope: "whole_plan|week|level|unknown",
        explicit_adjust_request: false,
        user_need_summary: "string|null",
        next_step: "string|null",
        direct_effect_request: LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
        state_updates: {
          status: "active|closing|closed|exit_to_global",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind:
            "plan_realignment_support|plan_realignment_platform_guidance|plan_realignment_followup|plan_realignment_close|exit_ack",
          instruction: "string",
          conversation_context: {
            drift_type:
              "missed_plan|late_on_plan|lost_rhythm|plan_too_heavy|changed_context|ambiguous",
            scope: "whole_plan|week|level|unknown",
            explicit_adjust_request: false,
            product_execution_allowed: false,
            recommended_surface: "Dashboard > Plan",
            next_step: "string|null",
            direct_effect_confirmation_context:
              "copie filtree du direct_effect_confirmation_context ou null",
          },
        },
        note_information: null,
        evidence: [],
      },
    }),
  ].join("\n");
}

export async function runPlanRealignmentLocalDispatcher(
  input: PlanRealignmentLocalDispatcherInput,
): Promise<PlanRealignmentLocalDispatcherOutput | null> {
  try {
    const raw = await generateWithGemini(
      dispatcherPrompt(input),
      input.user_message,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: "plan_realignment.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePlanRealignmentLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[PlanRealignment] local dispatcher failed", error);
    return null;
  }
}
