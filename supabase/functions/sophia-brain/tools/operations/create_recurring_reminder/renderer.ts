import type {
  CreateRecurringReminderCommittedEffect,
  RecurringReminderHandoffDraft,
  RecurringReminderHandoffStatus,
} from "./contract.ts";
import {
  buildRecurringReminderCreatedMessage,
  buildRecurringReminderHandoffDraft,
  type RecurringReminderDraftV1,
} from "./generator.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export function renderRecurringReminderPendingConfirmation(input: {
  confirmationMessage?: string | null;
}): string {
  return renderNonCommittedReply(
    input.confirmationMessage,
    "Je peux préparer la version à reprendre dans la section Initiatives.",
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

function cadenceForSentence(summary: string): string {
  return summary.trim();
}

export function renderRecurringReminderPlatformHandoff(input: {
  handoffDraft?: RecurringReminderHandoffDraft | null;
  draft?: RecurringReminderDraftV1 | null;
  prefix?: string | null;
  status?: RecurringReminderHandoffStatus | null;
}): string {
  const handoff = input.handoffDraft ??
    (input.draft ? buildRecurringReminderHandoffDraft(input.draft) : null);
  if (!handoff) {
    return "Je ne crée pas de rappel récurrent depuis le chat. Va dans Initiatives pour créer le rappel récurrent.";
  }
  const target = getHandoffTargetForOperation("create_recurring_reminder");
  const destination = target?.user_facing_destination ??
    handoff.recommendation.platform_destination;
  const missing = handoff.missing_decisions.length > 0
    ? ` Il reste encore à préciser ${handoff.missing_decisions.join(", ")}.`
    : "";
  const time = handoff.time_summary ? `, à ${handoff.time_summary}` : "";
  const cadence = cadenceForSentence(handoff.cadence_summary);
  const status = input.status ?? "handoff_delivered";
  const opening = input.prefix?.trim()
    ? input.prefix.trim()
    : status === "apply_attempt"
    ? "Je ne peux pas programmer ce rappel récurrent depuis le chat. Je te redonne ce qu'il faut reprendre dans Initiatives."
    : status === "revise_handoff"
    ? "Oui, je te mets la version à jour pour la section Initiatives."
    : status === "repeat_handoff"
    ? "Bien sûr, voici quoi reprendre dans la section Initiatives."
    : "Ok, je te prépare ça pour la section Initiatives.";

  return `${opening}

Pour le rappel, garde le message « ${handoff.content_summary} ». Il doit revenir ${cadence}${time}.${missing}

Dans la plateforme, va ${destination}, puis crée un rappel récurrent avec ces éléments.

Je ne crée pas de rappel récurrent depuis le chat.`;
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
