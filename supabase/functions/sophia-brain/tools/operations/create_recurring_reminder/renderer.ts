import type { CreateRecurringReminderCommittedEffect } from "./contract.ts";
import {
  buildRecurringReminderCreatedMessage,
  type RecurringReminderDraftV1,
} from "./generator.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";

export function renderRecurringReminderPendingConfirmation(input: {
  confirmationMessage?: string | null;
}): string {
  return renderNonCommittedReply(
    input.confirmationMessage,
    "Tu veux que je crée ce rappel récurrent ?",
  );
}

export function renderRecurringReminderAskQuestion(input: {
  question?: string | null;
}): string {
  return input.question?.trim() || "Tu veux ce rappel à quel moment ?";
}

export function renderRecurringReminderHandoffToOneShot(input: {
  ack?: string | null;
}): string {
  return renderNonCommittedReply(
    input.ack,
    "Je laisse le rappel ponctuel gérer ça.",
  );
}

export function renderRecurringReminderCancelled(input: {
  ack?: string | null;
} = {}): string {
  return renderNonCommittedReply(input.ack, "Ok, je ne crée pas ce rappel.");
}

export function renderRecurringReminderDraftReady(input: {
  draft?: RecurringReminderDraftV1 | null;
  ack?: string | null;
}): string {
  const explicit = input.ack?.trim();
  if (explicit) {
    return renderNonCommittedReply(
      explicit,
      "J'ai préparé le brouillon du rappel récurrent, sans le créer.",
    );
  }
  if (!input.draft) {
    return "J'ai préparé le brouillon du rappel récurrent, sans le créer.";
  }
  return `J'ai préparé le brouillon du rappel récurrent : "${input.draft.draft.message}" à ${input.draft.draft.time}. Je ne le crée pas sans validation explicite.`;
}

export function renderRecurringReminderBlocked(input: {
  reasonCode?: string | null;
  ack?: string | null;
} = {}): string {
  const explicit = input.ack?.trim();
  if (explicit) {
    return renderNonCommittedReply(
      explicit,
      "Je ne crée pas ce rappel tant que les conditions de validation ne sont pas réunies.",
    );
  }
  if (input.reasonCode === "draft_invalid") {
    return "Je ne peux pas créer ce rappel : le brouillon est incomplet.";
  }
  return "Je ne crée pas ce rappel tant que les conditions de validation ne sont pas réunies.";
}

export function renderRecurringReminderFailed(input: {
  reasonCode?: string | null;
  ack?: string | null;
} = {}): string {
  const explicit = input.ack?.trim();
  if (explicit) {
    return renderNonCommittedReply(
      explicit,
      "Je n'ai pas réussi à créer ce rappel techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
    );
  }
  return "Je n'ai pas réussi à créer ce rappel techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.";
}

export function renderRecurringReminderExecuted(input: {
  draft: RecurringReminderDraftV1;
  committedEffects: CreateRecurringReminderCommittedEffect[];
}): string {
  if (input.committedEffects.length === 0) {
    return renderRecurringReminderFailed({
      reasonCode: "missing_committed_effect",
    });
  }
  return buildRecurringReminderCreatedMessage(input.draft);
}
