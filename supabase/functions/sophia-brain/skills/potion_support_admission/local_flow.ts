import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import type { PotionSupportAdmissionContext } from "./state.ts";

export type PotionSupportLocalPhase =
  | "first_reply"
  | "presence_continuation";

export type PotionSupportLocalAction =
  | "continue_support"
  | "close_session"
  | "cancel_campaign"
  | "exit_to_global_dispatcher"
  | "safety_exit";

export type PotionSupportTerminalReason =
  | "cancelled_user_boundary"
  | "cancelled_context_obsolete"
  | "completed_resolved";

export type PotionSupportLocalDecision = {
  action: PotionSupportLocalAction;
  confidence: "low" | "medium" | "high";
  relation: "related" | "session_boundary" | "campaign_boundary" | "other";
  reason: string;
  terminal_reason: PotionSupportTerminalReason | null;
  note_information: NoteInformation | null;
};

type ModelDecision = {
  action?: unknown;
  confidence?: unknown;
  relation?: unknown;
  reason?: unknown;
  terminal_reason?: unknown;
};

export type PotionSupportLocalDispatcherRunner = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<unknown>;

const ACTIONS = new Set<PotionSupportLocalAction>([
  "continue_support",
  "close_session",
  "cancel_campaign",
  "exit_to_global_dispatcher",
  "safety_exit",
]);

const TERMINAL_REASONS = new Set<PotionSupportTerminalReason>([
  "cancelled_user_boundary",
  "cancelled_context_obsolete",
  "completed_resolved",
]);

const SYSTEM_PROMPT = [
  "Tu es le dispatcher LOCAL d'une session de soutien ouverte par une potion Sophia.",
  "Tu classes le mouvement du message courant; tu ne rediges jamais la reponse visible.",
  "Ce dispatcher n'a AUCUNE destination locale produit: il peut continuer le soutien ou rendre la main au dispatcher GLOBAL.",
  "continue_support: le user repond a l'ouverture, donne une evolution, exprime encore son etat, pose une question conversationnelle ou demande quoi faire dans ce moment sans demander un dispositif Sophia nomme.",
  "close_session: le user ferme seulement l'echange courant (pas maintenant, pour ce soir, merci bonne nuit) sans refuser les futurs messages de la potion.",
  "cancel_campaign: uniquement si le user demande explicitement d'arreter les futurs messages de cette potion, dit clairement que le suivi n'est plus pertinent, que son contexte a disparu, ou que le sujet est completement resolu.",
  "exit_to_global_dispatcher: changement de sujet, question produit, commande, statut, ou demande explicite d'un dispositif nomme (carte, autre potion, plan, rappel). Ne nomme jamais le prochain flow.",
  "safety_exit: ideation suicidaire, auto-agression, danger immediat ou signal de crise; le global safety reprendra.",
  "Une amelioration partielle n'est jamais une resolution. 'Je m'arrete pour ce soir' n'annule jamais la campagne.",
  "En cas de doute entre continuer et sortir, continue_support si le message reste sur le sujet; sinon exit_to_global_dispatcher. N'annule jamais dans le doute.",
  "Pour cancel_campaign, terminal_reason vaut cancelled_user_boundary, cancelled_context_obsolete ou completed_resolved. Sinon terminal_reason=null.",
  "Reponds uniquement en JSON: {action,confidence,relation,reason,terminal_reason}.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseModel(raw: unknown): ModelDecision | null {
  if (isRecord(raw)) return raw;
  const text = cleanText(raw, 4_000)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function noteForExit(input: {
  action: PotionSupportLocalAction;
  reason: string;
  userMessage: string;
  phase: PotionSupportLocalPhase;
  context: PotionSupportAdmissionContext;
  terminalReason: PotionSupportTerminalReason | null;
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: "potion_support_admission_v1",
    handoff_reason: input.action === "safety_exit"
      ? "safety"
      : input.action === "exit_to_global_dispatcher"
      ? "topic_change"
      : "flow_interruption",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      `Potion support released ownership: ${input.reason}`,
    user_words: [input.userMessage],
    structured_context: {
      source_flow: "potion_support_admission_v1",
      phase: input.phase,
      exit_action: input.action,
      exit_reason: input.reason,
      campaign_status: input.terminalReason ? "terminal_requested" : "active",
      terminal_reason: input.terminalReason,
      source_potion_session_id: input.context.source_potion_session_id,
      recurring_reminder_id: input.context.recurring_reminder_id,
      scheduled_checkin_id: input.context.scheduled_checkin_id,
      day_index: input.context.day_index,
      opening_focus: input.context.opening_focus,
      support_topic_hint: input.context.topic_hint,
      recommended_next_focus: "global_dispatcher_reclassify_current_message",
    },
    confidence: "high",
  });
}

function normalizeDecision(input: {
  raw: unknown;
  phase: PotionSupportLocalPhase;
  userMessage: string;
  context: PotionSupportAdmissionContext;
}): PotionSupportLocalDecision {
  const parsed = parseModel(input.raw);
  if (!parsed) {
    const reason = "local_dispatcher_invalid_output";
    return {
      action: "exit_to_global_dispatcher",
      confidence: "low",
      relation: "other",
      reason,
      terminal_reason: null,
      note_information: noteForExit({
        action: "exit_to_global_dispatcher",
        reason,
        userMessage: input.userMessage,
        phase: input.phase,
        context: input.context,
        terminalReason: null,
      }),
    };
  }
  let action = ACTIONS.has(cleanText(parsed.action) as PotionSupportLocalAction)
    ? cleanText(parsed.action) as PotionSupportLocalAction
    : "exit_to_global_dispatcher";
  const confidence = parsed.confidence === "high" ||
      parsed.confidence === "medium" || parsed.confidence === "low"
    ? parsed.confidence
    : "low";
  const relation = parsed.relation === "related" ||
      parsed.relation === "session_boundary" ||
      parsed.relation === "campaign_boundary" || parsed.relation === "other"
    ? parsed.relation
    : "other";
  let terminalReason = TERMINAL_REASONS.has(
      cleanText(parsed.terminal_reason) as PotionSupportTerminalReason,
    )
    ? cleanText(parsed.terminal_reason) as PotionSupportTerminalReason
    : null;
  const reason = cleanText(parsed.reason) || "potion_support_local_decision";

  // Terminality is default-deny. A low-confidence or structurally
  // contradictory model output can release the session, never cancel days.
  if (
    action === "cancel_campaign" &&
    (confidence !== "high" || relation !== "campaign_boundary" ||
      !terminalReason)
  ) {
    action = "exit_to_global_dispatcher";
    terminalReason = null;
  }
  if (action !== "cancel_campaign") terminalReason = null;
  const note = action === "continue_support" ? null : noteForExit({
    action,
    reason,
    userMessage: input.userMessage,
    phase: input.phase,
    context: input.context,
    terminalReason,
  });
  return {
    action,
    confidence,
    relation,
    reason,
    terminal_reason: terminalReason,
    note_information: note,
  };
}

export async function runPotionSupportLocalDispatcher(input: {
  userId: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  phase: PotionSupportLocalPhase;
  context: PotionSupportAdmissionContext;
  runner?: PotionSupportLocalDispatcherRunner;
}): Promise<PotionSupportLocalDecision> {
  const userPrompt = JSON.stringify({
    phase: input.phase,
    opening: {
      topic_hint: input.context.topic_hint,
      focus: input.context.opening_focus,
      day_index: input.context.day_index,
    },
    recent_messages: input.recentMessages.slice(-8),
    current_user_message: input.userMessage,
  });
  const raw = input.runner
    ? await input.runner(SYSTEM_PROMPT, userPrompt)
    : await generateWithGemini(
      SYSTEM_PROMPT,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.requestId ?? undefined,
        userId: input.userId,
        source: "potion-support-local-dispatcher-v1",
        model: getGlobalAiModel("gemini-2.5-flash"),
        maxRetries: 1,
        httpTimeoutMs: 15_000,
      },
    );
  return normalizeDecision({
    raw,
    phase: input.phase,
    userMessage: input.userMessage,
    context: input.context,
  });
}

export function potionSupportLocalFailureDecision(input: {
  userMessage: string;
  phase: PotionSupportLocalPhase;
  context: PotionSupportAdmissionContext;
}): PotionSupportLocalDecision {
  return normalizeDecision({ ...input, raw: null });
}

export { SYSTEM_PROMPT as POTION_SUPPORT_LOCAL_DISPATCHER_SYSTEM_PROMPT };
