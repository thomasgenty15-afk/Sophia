/**
 * Application d'état du flow « Présence » à la temp memory.
 *
 * Miroir léger de applyConversationSkillState (run.ts) pour un flow qui n'a
 * PAS de gros skill runtime: il réutilise le générateur companion. Ce module
 * traduit une décision de la machine à états (state.ts) en écriture/effacement
 * de l'`active_skill_state`.
 */

import { clearActiveConversationSkillState } from "../../router/active_flow_state.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";
import {
  enterPresenceFlow,
  type AttackKeywordSupportPresenceEntryContext,
  type PresenceEntryContext,
  type PresenceFlowState,
  stepPresenceFlow,
} from "./state.ts";
import type { PresenceConversationKind } from "../../contracts/turn_frame.v1.ts";

export const PRESENCE_SKILL_ID = "presence_conversation";

function readActivePresenceState(
  activeSkillState: unknown,
): PresenceFlowState | null {
  if (
    !activeSkillState || typeof activeSkillState !== "object" ||
    Array.isArray(activeSkillState)
  ) {
    return null;
  }
  const record = activeSkillState as Record<string, unknown>;
  if (String(record.skill_id ?? "") !== PRESENCE_SKILL_ID) return null;
  const working = record.working_state &&
      typeof record.working_state === "object" &&
      !Array.isArray(record.working_state)
    ? record.working_state as Record<string, unknown>
    : {};
  const flow = working.presence_flow_state;
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return null;
  return flow as PresenceFlowState;
}

export type PresenceApplyResult = {
  tempMemory: Record<string, unknown>;
  // Décision effective de ce tour, pour la trace/observabilité.
  transition: "enter" | "maintain" | "exit";
  exit_reason?: string;
  flow_state: PresenceFlowState | null;
};

/**
 * Calcule et écrit l'état présence pour le tour courant.
 *
 * - Pas de flow actif → ENTRÉE (le routeur a déjà validé l'éligibilité).
 * - Flow actif → transition via stepPresenceFlow; exit ⇒ état effacé (poubelle
 *   + re-dispatch global au tour suivant, charte cmd 17).
 */
export function applyPresenceFlowState(input: {
  tempMemory: Record<string, unknown>;
  activeSkillState: unknown;
  kind: PresenceConversationKind;
  nowIso: string;
  localDate: string;
  topicHint?: string | null;
  entryReason?: string;
  entryContext?: PresenceEntryContext | null;
}): PresenceApplyResult {
  const existing = readActivePresenceState(input.activeSkillState);

  if (!existing) {
    const flow = enterPresenceFlow({
      nowIso: input.nowIso,
      localDate: input.localDate,
      topicHint: input.topicHint ?? null,
      entryReason: input.entryReason ?? "presence_conversation_entry",
      entryContext: input.entryContext ?? null,
    });
    return {
      tempMemory: writePresenceState(input.tempMemory, flow, input.nowIso),
      transition: "enter",
      flow_state: flow,
    };
  }

  const step = stepPresenceFlow({
    state: existing,
    kind: input.kind,
    nowIso: input.nowIso,
    localDate: input.localDate,
  });

  if (step.status === "exit") {
    return {
      tempMemory: clearActiveConversationSkillState(input.tempMemory),
      transition: "exit",
      exit_reason: step.exit_reason,
      flow_state: null,
    };
  }

  return {
    tempMemory: writePresenceState(
      input.tempMemory,
      step.next_state,
      input.nowIso,
    ),
    transition: "maintain",
    flow_state: step.next_state,
  };
}

/**
 * Applique la DÉCISION d'un PresenceApplyResult à une temp memory arbitraire
 * (typiquement celle rendue par la génération, pour ne pas se faire écraser).
 * Idempotent: exit → efface; enter/maintain → réécrit l'état du flow.
 */
export function commitPresenceResult(
  tempMemory: Record<string, unknown>,
  result: PresenceApplyResult,
  nowIso: string,
): Record<string, unknown> {
  if (result.transition === "exit" || !result.flow_state) {
    return clearActiveConversationSkillState(tempMemory);
  }
  return writePresenceState(tempMemory, result.flow_state, nowIso);
}

// W2.A: `armPotionSupportPresence` supprimé — plus aucun door-opener potion
// n'arme la Présence (le sas d'admission local est débranché).

/** Opens Presence after an inbound attack keyword received its first reply. */
export function armAttackKeywordSupportPresence(input: {
  tempMemory: Record<string, unknown>;
  nowIso: string;
  localDate: string;
  topicHint: string | null;
  entryContext: AttackKeywordSupportPresenceEntryContext;
}): Record<string, unknown> {
  const flow = enterPresenceFlow({
    nowIso: input.nowIso,
    localDate: input.localDate,
    topicHint: input.topicHint,
    entryReason: "attack_keyword_support_door_opener",
    entryContext: input.entryContext,
  });
  return writePresenceState(input.tempMemory, flow, input.nowIso);
}

/**
 * Purge d'un reste de Présence armée par un door-opener potion.
 *
 * W2.A: plus aucun code n'écrit ce contexte d'entrée, mais des états déjà
 * persistés peuvent encore le porter — la lecture reste donc défensive (le type
 * `PotionSupportPresenceEntryContext` n'existe plus). Appelée hors périmètre par
 * `process-checkins` et `whatsapp-webhook`; supprimée avec eux en W2.B.
 */
export function clearPotionSupportPresence(
  tempMemory: Record<string, unknown>,
): Record<string, unknown> {
  const existing = readActivePresenceState(
    tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
      tempMemory.__active_skill_state,
  );
  const source = String(
    (existing?.entry_context as { source?: unknown } | null | undefined)
      ?.source ?? "",
  );
  if (source !== "potion_support") {
    return tempMemory;
  }
  return clearActiveConversationSkillState(tempMemory);
}

function writePresenceState(
  tempMemory: Record<string, unknown>,
  flow: PresenceFlowState,
  nowIso: string,
): Record<string, unknown> {
  const next = { ...tempMemory };
  const activeSkillState = {
    version: 1,
    skill_id: PRESENCE_SKILL_ID,
    status: "active",
    turn_count: flow.turns_in_flow,
    started_at: flow.entered_at,
    updated_at: nowIso,
    working_state: { presence_flow_state: flow },
  };
  next[ACTIVE_CONVERSATION_SKILL_KEY] = activeSkillState;
  (next as Record<string, unknown>).__active_skill_state = activeSkillState;
  delete (next as Record<string, unknown>).active_skill_state;
  return next;
}

export { readActivePresenceState };
