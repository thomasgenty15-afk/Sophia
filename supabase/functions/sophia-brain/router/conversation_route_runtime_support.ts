import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
} from "../contracts/note_information.v1.ts";
import {
  clearActiveToolFlow,
  clearPendingToolConfirmation,
  readActiveFlowState,
} from "./active_flow_state.ts";
import { statePotionSubskillId } from "../tools/operations/select_state_potion/contract.ts";
import { createInitialStatePotionSubskillState } from "../tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts";
import { createInitialClarteState } from "../tools/operations/select_state_potion/subskills/clarte_flow.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  isSafetyRoute,
  selectedConversationSkillForRoute,
} from "./safety_crisis_runtime.ts";
import { isWeeklyAdaptiveReviewActive } from "../skills/weekly_review/runtime.ts";

const DEPRECATED_ACTION_BREAKDOWN_SKILL_ID = "execution" + "_breakdown";

function isDeprecatedConversationSkillId(skillId: unknown): boolean {
  return skillId === DEPRECATED_ACTION_BREAKDOWN_SKILL_ID;
}

function clearDeprecatedConversationSkillState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  const active = next.__active_skill_state ?? next.active_skill_state;
  if (isDeprecatedConversationSkillId(active?.skill_id)) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
  }
  return next;
}

function activeConversationSkillId(tempMemory: any): string | null {
  const active = tempMemory?.__active_skill_state ??
    tempMemory?.active_skill_state;
  const skillId = String(active?.skill_id ?? "").trim();
  return skillId || null;
}

type ConversationPotionBridgeSource =
  | "emotional_repair"
  | "demotivation_repair";

function conversationPotionHandoffPatch(
  skillOutput?: ConversationSkillOutput | null,
): {
  source_flow: ConversationPotionBridgeSource;
  selected_potion:
    | "amour"
    | "guerison"
    | "apaisement"
    | "clarte"
    | "courage"
    | "rappel";
  potion_bridge_context: Record<string, unknown>;
  note_information?: NoteInformation | null;
} | null {
  const patch = skillOutput?.state_patch;
  const patchRecord = patch && typeof patch === "object"
    ? patch as Record<string, unknown>
    : {};
  const source_flow: ConversationPotionBridgeSource =
    patchRecord.demotivation_repair_potion_handoff
      ? "demotivation_repair"
      : "emotional_repair";
  const handoff = source_flow === "demotivation_repair"
    ? patchRecord.demotivation_repair_potion_handoff
    : patchRecord.emotional_repair_potion_handoff;
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    return null;
  }
  const selected = String((handoff as any).selected_potion ?? "").trim();
  if (
    selected !== "amour" &&
    selected !== "guerison" &&
    selected !== "apaisement" &&
    selected !== "clarte" &&
    selected !== "courage" &&
    selected !== "rappel"
  ) return null;
  const context = (handoff as any).potion_bridge_context;
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }
  const rawNote = (handoff as any).note_information ??
    (context as any).note_information ??
    ((handoff as any).information_note &&
        typeof (handoff as any).information_note === "object"
      ? (handoff as any).information_note
      : null);
  const noteInformation = rawNote
    ? normalizeNoteInformation(rawNote, {
      source_flow_id: source_flow,
      source_flow_state_summary: String(
        (context as any).origin_turn_summary ??
          (context as any).demotivation_episode?.summary ??
          (context as any).emotional_episode?.summary ??
          "Conversation repair bridge to select_state_potion.",
      ),
      handoff_reason: "bridge",
      target_dispatcher: "select_state_potion",
      handoff_context_for_next_dispatcher: JSON.stringify(context),
      target_local_dispatcher_hint:
        "Use the origin bridge context as candidates and do not make the user repeat the episode.",
      structured_context: context as Record<string, unknown>,
      risk_score: 0,
    })
    : null;
  return {
    source_flow,
    selected_potion: selected,
    potion_bridge_context: context as Record<string, unknown>,
    note_information: noteInformation,
  };
}

function startSelectStatePotionFromConversationBridge(args: {
  tempMemory: any;
  skillOutput?: ConversationSkillOutput | null;
}): any | null {
  const handoff = conversationPotionHandoffPatch(args.skillOutput);
  if (!handoff) return null;
  const activeSubskillId = statePotionSubskillId(handoff.selected_potion);
  if (!activeSubskillId) return null;
  const now = new Date().toISOString();
  const clarteState = handoff.selected_potion === "clarte"
    ? createInitialClarteState(null, handoff.potion_bridge_context)
    : null;
  const potionSubskillState = handoff.selected_potion === "clarte"
    ? null
    : createInitialStatePotionSubskillState(
      handoff.selected_potion as any,
      null,
      handoff.potion_bridge_context,
    );
  const next = { ...(args.tempMemory ?? {}) };
  next.__active_tool_skill_intake = {
    skill_id: "select_state_potion",
    active_subskill_id: activeSubskillId,
    mode: "platform_handoff",
    status: "clarifying",
    phase: "detail_intake",
    draft: null,
    operation_input: {
      operation_type: "select_state_potion",
      potion_type: handoff.selected_potion,
      selected_potion: handoff.selected_potion,
      origin_bridge_context: handoff.potion_bridge_context,
      note_information: handoff.note_information ?? null,
      information_note: handoff.note_information ?? null,
      no_chat_mutation: true,
    },
    note_information: handoff.note_information ?? null,
    origin_bridge_context: handoff.potion_bridge_context,
    intake_state: null,
    clarte_state: clarteState,
    potion_subskill_state: potionSubskillState,
    turn_count: 0,
    max_turns: 6,
    created_at: now,
    updated_at: now,
    no_chat_mutation: true,
  };
  delete next.active_tool_skill_intake;
  delete next.__active_skill_state;
  delete next.active_skill_state;
  next[`__last_${handoff.source_flow}_potion_bridge`] = {
    selected_potion: handoff.selected_potion,
    origin_flow: handoff.source_flow,
    note_information: handoff.note_information ?? null,
    at: now,
    no_chat_mutation: true,
  };
  if (handoff.note_information) {
    console.info("[ConversationRoute] note_information_consumed", {
      ...noteInformationForTrace(handoff.note_information),
      transition_tag: "local_to_local_bridge_with_note",
    });
  }
  return next;
}

export function buildConversationRiskFlowExitAddon(
  conversationRisk: TurnFrame["conversation_risk"] | null | undefined,
): string | null {
  const flowExit = conversationRisk?.flow_exit_context;
  if (
    !conversationRisk?.should_exit_flows ||
    !flowExit ||
    flowExit.interrupted_flow_type === "none"
  ) return null;
  const knownContext = JSON.stringify({
    interrupted_flow_type: flowExit.interrupted_flow_type,
    restart_scope: flowExit.restart_scope,
    active_tool_skill_type: flowExit.active_tool_skill_type ?? null,
    active_conversation_skill_id: flowExit.active_conversation_skill_id ?? null,
    known_slots_before_clear: flowExit.known_slots ?? null,
    pending_confirmation_before_clear: flowExit.pending_confirmation ?? null,
    last_user_message: flowExit.last_user_message,
    score: conversationRisk.score,
    threshold: conversationRisk.threshold,
    reason_codes: conversationRisk.reason_codes,
    matrix: conversationRisk.matrix,
  });
  return [
    "=== ADDON CONVERSATION RISK FLOW EXIT ===",
    "Le dispatcher a detecte une frustration/rupture de conversation au-dessus du seuil et a coupe le flow actif.",
    "Les slots et etats actifs ont ete effaces: ne continue pas le slot filling courant, ne saute pas au prochain slot, ne cree rien, n'execute rien.",
    "Tu dois generer toi-meme une reponse naturelle, pas suivre un template fixe.",
    "",
    "Consigne visible:",
    "- Si interrupted_flow_type=tool_skill ou pending_confirmation: dis explicitement qu'on reprend au debut du sous-skill/operation concerne, puis resume ce que tu crois avoir compris avec les infos fiables ci-dessous, puis demande confirmation ou correction.",
    "- Si interrupted_flow_type=conversation_skill: dis qu'on repart proprement dans la conversation, resume ce que tu crois comprendre, puis demande confirmation/correction tres simplement.",
    "- Ne mentionne pas score, threshold, reason_codes, matrice, dispatcher, slots, temp_memory ou details techniques.",
    "- Ne relance pas immediatement le meme flow et ne demande aucun slot specifique.",
    "- Interdit sur ce tour: question A/B, choix de moment, demande de declencheur, demande de cible, demande de detail operationnel.",
    "- La seule question autorisee est une validation globale du resume: 'confirme-moi si c'est bien ca, ou dis-moi ce qu'il faut ajuster'.",
    "- Le resume a confirmer doit porter uniquement sur les informations utiles au travail: sujet, cible, moment, besoin, operation souhaitee, contrainte, intention.",
    "- Ne fais jamais confirmer la frustration elle-meme, ni le fait que l'utilisateur est en colere, ni que Sophia a mal compris, ni que tu as repondu a cote.",
    "- Si tu reconnais brievement la friction, reste neutre et oriente reprise: 'Ok, on reprend proprement.' Ne parle pas de ce que Sophia a compris ou rate.",
    "- Evite les formulations comme: 'tu es frustre parce que je...', 'a chaque fois je...', 'je t'ai fait tourner en rond', 'tu veux repartir a zero parce que je...', 'je n'ai pas compris', 'je ne comprends pas', 'je te suis pas', 'je t'ai perdu', 'je reponds a cote'.",
    "- Pour un tool_skill, nomme l'operation en langage user: 'carte de defense', 'ajustement du plan', 'carte d'attaque', etc., pas l'identifiant technique.",
    "",
    `Contexte structure pour toi: ${knownContext}`,
    "=== FIN ADDON CONVERSATION RISK FLOW EXIT ===",
  ].join("\n");
}

export function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function buildRecentConversationContinuityAddon(args: {
  userMessage: string;
  history: any[];
}): string | null {
  void args.userMessage;
  void args.history;
  return null;
}

export function persistConversationSkillRoute(
  tempMemory: any,
  routeDecision: RouteDecision | null,
  skillOutput?: ConversationSkillOutput | null,
): any {
  let next = clearDeprecatedConversationSkillState(tempMemory);
  const now = new Date().toISOString();
  const arbitration = routeDecision?.active_flow_arbitration;
  if (
    arbitration?.decision === "inline_answer_then_resume" ||
    arbitration?.decision === "suspend_active" ||
    arbitration?.decision === "supersede_active"
  ) {
    const activeFlow = readActiveFlowState(next);
    const activeOwner = String(arbitration.active_owner ?? "none");
    const snapshot = activeOwner === "pending_confirmation"
      ? activeFlow.pendingToolSkillConfirmation
      : activeOwner === "tool_skill"
      ? activeFlow.activeToolSkillIntake
      : activeOwner === "conversation_skill"
      ? activeFlow.activeSkillState
      : null;
    if (snapshot) {
      next.__suspended_flow_v1 = {
        owner: activeOwner,
        state_snapshot: snapshot,
        suspended_by: routeDecision?.response_owner ?? "unknown",
        resume_policy: arbitration.resume_policy,
        turn_ttl: arbitration.resume_policy === "auto_after_answer" ? 1 : 2,
        created_at: new Date().toISOString(),
      };
    }
    if (
      arbitration.decision !== "inline_answer_then_resume" &&
      activeOwner === "tool_skill" &&
      arbitration.selected_owner !== "tool_skill"
    ) {
      next = clearActiveToolFlow(next);
    }
    if (
      arbitration.decision !== "inline_answer_then_resume" &&
      activeOwner === "pending_confirmation" &&
      arbitration.selected_owner !== "pending_confirmation"
    ) {
      next = clearPendingToolConfirmation(next);
    }
  }
  const selected = selectedConversationSkillForRoute(routeDecision);
  if (
    selected === "product_help" &&
    arbitration?.decision === "inline_answer_then_resume"
  ) {
    const trace = skillOutput?.skill_id === "product_help" &&
        skillOutput.state_patch &&
        typeof skillOutput.state_patch === "object"
      ? (skillOutput.state_patch as Record<string, unknown>)
        .product_help_subskill_trace
      : null;
    const active = next.__active_skill_state ?? next.active_skill_state;
    if (trace && active && typeof active === "object") {
      const previous = active as Record<string, unknown>;
      const workingState = previous.working_state &&
          typeof previous.working_state === "object"
        ? previous.working_state as Record<string, unknown>
        : {};
      next.__active_skill_state = {
        ...previous,
        working_state: {
          ...workingState,
          product_help_subskill_history: [
            ...(
              Array.isArray(workingState.product_help_subskill_history)
                ? workingState.product_help_subskill_history
                : []
            ),
            trace,
          ].slice(-5),
        },
        updated_at: now,
      };
      delete next.active_skill_state;
    }
    delete next.__suspended_flow_v1;
    return next;
  }
  if (selected) {
    const suspendedFlow = next.__suspended_flow_v1 &&
        typeof next.__suspended_flow_v1 === "object"
      ? next.__suspended_flow_v1 as Record<string, unknown>
      : null;
    const rawPrevious = next.__active_skill_state ?? next.active_skill_state ??
      (selected === "weekly_adaptive_review_v1" &&
          isWeeklyAdaptiveReviewActive(suspendedFlow?.state_snapshot)
        ? suspendedFlow?.state_snapshot
        : null);
    const previous = rawPrevious && typeof rawPrevious === "object"
      ? rawPrevious as Record<string, unknown>
      : {};
    const previousSkillId = typeof previous.skill_id === "string"
      ? previous.skill_id
      : null;
    const previousPreviousSkillId =
      typeof previous.previous_skill_id === "string"
        ? previous.previous_skill_id
        : null;
    const patch = skillOutput?.skill_id === selected &&
        skillOutput.state_patch &&
        typeof skillOutput.state_patch === "object"
      ? skillOutput.state_patch as Record<string, unknown>
      : {};
    if (selected === "product_help") {
      const activeSkillId = activeConversationSkillId(next);
      if (
        activeSkillId &&
        activeSkillId !== "product_help" &&
        arbitration?.decision !== "inline_answer_then_resume"
      ) {
        return next;
      }
      const productLocalState = patch.product_help_local_state;
      const productExitMemo = patch.product_help_exit_memo;
      if (productExitMemo && typeof productExitMemo === "object") {
        next.__last_product_help_exit_memo = productExitMemo;
      }
      const productStatus = productLocalState &&
          typeof productLocalState === "object"
        ? String((productLocalState as any).status ?? "")
        : "";
      if (
        !productLocalState ||
        productStatus === "closing" ||
        productStatus === "stopped" ||
        productStatus === "handoff" ||
        productStatus === "exit_to_global" ||
        productStatus === "safety"
      ) {
        delete next.__active_skill_state;
        delete next.active_skill_state;
        return next;
      }
    }
    if (
      (selected === "emotional_repair" ||
        selected === "demotivation_repair") &&
      skillOutput?.status === "handoff"
    ) {
      const safetyHandoff = selected === "emotional_repair"
        ? patch.emotional_repair_safety_handoff
        : patch.demotivation_repair_safety_handoff;
      if (safetyHandoff && typeof safetyHandoff === "object") {
        next.__active_skill_state = {
          version: 1,
          skill_id: "safety_crisis",
          status: "active",
          previous_skill_id: selected,
          turn_count: 0,
          started_at: now,
          updated_at: now,
          working_state: {
            note_information:
              (safetyHandoff as Record<string, unknown>).note_information ??
                null,
            source_flow: selected,
            no_chat_mutation: true,
          },
        };
        delete next.active_skill_state;
        return next;
      }
      const potionHandoffTempMemory =
        startSelectStatePotionFromConversationBridge(
          {
            tempMemory: next,
            skillOutput,
          },
        );
      if (potionHandoffTempMemory) return potionHandoffTempMemory;
    }
    if (
      (selected === "emotional_repair" ||
        selected === "demotivation_repair") &&
      (skillOutput?.status === "complete" || skillOutput?.status === "exit")
    ) {
      const nextMemo = selected === "emotional_repair"
        ? patch.emotional_repair_exit_memo
        : patch.demotivation_repair_exit_memo;
      if (nextMemo && typeof nextMemo === "object") {
        next[`__last_${selected}_exit_memo`] = {
          ...(nextMemo as Record<string, unknown>),
          at: now,
        };
      }
      delete next.__active_skill_state;
      delete next.active_skill_state;
      return next;
    }
    const workingState = {
      ...(previous.working_state && typeof previous.working_state === "object"
        ? previous.working_state as Record<string, unknown>
        : {}),
      ...patch,
    };
    const safetyExitState = applySafetyCrisisExitStateIfNeeded({
      tempMemory: next,
      selectedSkillId: selected,
      skillOutput,
      previous,
      workingState,
      now,
    });
    if (safetyExitState) return safetyExitState;
    next.__active_skill_state = {
      ...previous,
      version: Number(previous.version ?? 1),
      skill_id: selected,
      status: skillOutput?.status === "handoff" ? "handoff" : "active",
      previous_skill_id: previousSkillId && previousSkillId !== selected
        ? previousSkillId
        : previousPreviousSkillId,
      turn_count: Number(previous.turn_count ?? 0) + 1,
      started_at: typeof previous.started_at === "string"
        ? previous.started_at
        : now,
      updated_at: now,
      working_state: workingState,
    };
    delete next.active_skill_state;
    if (selected === "weekly_adaptive_review_v1") {
      delete next.__suspended_flow_v1;
    }
    return next;
  }

  const suspendedFlow = next.__suspended_flow_v1 &&
      typeof next.__suspended_flow_v1 === "object"
    ? next.__suspended_flow_v1 as Record<string, unknown>
    : null;
  const rawPrevious = next.__active_skill_state ?? next.active_skill_state ??
    (isWeeklyAdaptiveReviewActive(suspendedFlow?.state_snapshot)
      ? suspendedFlow?.state_snapshot
      : null);
  if (
    isWeeklyAdaptiveReviewActive(rawPrevious) &&
    !isSafetyRoute(routeDecision)
  ) {
    const previous = rawPrevious && typeof rawPrevious === "object"
      ? rawPrevious as Record<string, unknown>
      : {};
    next.__active_skill_state = {
      ...previous,
      skill_id: "weekly_adaptive_review_v1",
      turn_count: Number(previous.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    delete next.active_skill_state;
    delete next.__suspended_flow_v1;
    return next;
  }

  if (
    routeDecision?.response_owner === "normal_reply" ||
    routeDecision?.response_owner === "tool_skill"
  ) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
  }
  if (
    routeDecision?.response_owner === "product_help" &&
    arbitration?.decision !== "inline_answer_then_resume"
  ) {
    if (activeConversationSkillId(next)) return next;
    delete next.__active_skill_state;
    delete next.active_skill_state;
  }
  return next;
}
