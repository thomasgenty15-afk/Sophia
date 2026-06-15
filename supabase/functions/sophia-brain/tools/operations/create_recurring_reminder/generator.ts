import type { RecurringReminderBuilderInput } from "../_shared/operation_payload_builder.ts";
import type { RecurringReminderHandoffDraft } from "./contract.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export type RecurringReminderDraftMessages = {
  confirmation_message?: string;
  user_message_brief?: string;
  user_message_detailed?: string;
  execution_message?: string;
  revision_message?: string;
};

export type RecurringReminderDraftV1 = {
  operation_type: "create_recurring_reminder";
  output_schema: "recurring_reminder_draft_v1";
  draft: {
    title: string;
    message: string;
    frequency: "daily" | "weekly" | "specific_days" | "weekdays" | "custom";
    days?: string[];
    time: string;
    timezone: string;
    cadence_label?: string | null;
    destination: "current_plan" | "base_de_vie";
    related_plan_item_id?: string | null;
    target_binding?: {
      target_kind: "none" | "transformation" | "plan_item" | "action_family";
      target_plan_item_id?: string | null;
      target_action_family_key?: string | null;
      target_generated_temp_id?: string | null;
      binding_policy:
        | "none"
        | "snapshot"
        | "live_action"
        | "live_action_family";
      lifecycle_policy:
        | "independent"
        | "while_target_active"
        | "while_family_in_current_plan";
      target_label?: string | null;
    } | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
  user_message_brief?: string;
  user_message_detailed?: string;
  execution_message?: string;
  revision_message?: string;
};

export function recurringReminderManagementHint(
  draft: RecurringReminderDraftV1["draft"],
): string {
  if (draft.destination === "current_plan") {
    return "Si tu veux le modifier ou l'annuler, tu devras le faire depuis la plateforme, dans la partie Initiatives du plan.";
  }
  return "Si tu veux le modifier ou l'annuler, tu devras le faire depuis la plateforme, dans la Base de vie, section Initiatives et rappels.";
}

export function withRecurringReminderManagementHint(
  message: string,
  draft: RecurringReminderDraftV1["draft"],
): string {
  const trimmed = message.trim();
  const normalized = trimmed
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (
    normalized.includes("modifier") &&
    (normalized.includes("annuler") || normalized.includes("supprimer")) &&
    normalized.includes("initiative") &&
    normalized.includes("plateforme")
  ) {
    return trimmed;
  }
  return `${trimmed} ${recurringReminderManagementHint(draft)}`;
}

export function formatRecurringReminderDraftSummary(
  draft: RecurringReminderDraftV1["draft"],
): string {
  const frequency = draft.frequency === "daily"
    ? "tous les jours"
    : draft.frequency === "weekdays"
    ? "les jours de semaine"
    : (draft.days?.length ? draft.days.join(", ") : "chaque semaine");
  return `"${draft.message}" à ${draft.time}, ${frequency}`;
}

export function recurringReminderCadenceSummary(
  draft: RecurringReminderDraftV1["draft"],
): string {
  const cadenceLabel = String(draft.cadence_label ?? "").trim();
  if (cadenceLabel) return cadenceLabel;
  if (draft.frequency === "daily") return "tous les jours";
  if (draft.frequency === "weekdays") return "les jours de semaine";
  if (draft.frequency === "weekly") {
    return draft.days?.length
      ? `chaque semaine, ${draft.days.join(", ")}`
      : "chaque semaine";
  }
  if (draft.frequency === "specific_days") {
    return draft.days?.length
      ? `les jours suivants : ${draft.days.join(", ")}`
      : "certains jours de la semaine";
  }
  return "cadence personnalisée";
}

export function buildRecurringReminderHandoffDraft(
  draft: RecurringReminderDraftV1,
): RecurringReminderHandoffDraft {
  const handoffTarget = getHandoffTargetForOperation(
    "create_recurring_reminder",
  );
  const cadenceSummary = recurringReminderCadenceSummary(draft.draft);
  const timeSummary = draft.draft.time
    ? `${draft.draft.time}, ${draft.draft.timezone || "heure locale"}`
    : null;
  const platformDestination = handoffTarget?.user_facing_destination ??
    (draft.draft.destination === "current_plan"
      ? "Initiatives, depuis le plan concerné"
      : "Initiatives");
  return {
    operation_type: "create_recurring_reminder",
    mode: "platform_handoff",
    executable_from_chat: false,
    reminder_summary: `rappel récurrent pour ${draft.draft.message}`,
    cadence_summary: cadenceSummary,
    time_summary: timeSummary,
    content_summary: draft.draft.message,
    recommendation: {
      platform_destination: platformDestination,
      platform_steps: handoffTarget?.platform_steps ?? [
        "Ouvre la section Initiatives de la plateforme.",
        "Crée un rappel récurrent.",
        "Reprends le contenu, la cadence et l'heure ci-dessous.",
      ],
      preserve: [
        `Message exact du rappel: ${draft.draft.message}`,
        `Rythme prévu: ${cadenceSummary}`,
        ...(timeSummary ? [`Heure locale prévue: ${timeSummary}`] : []),
      ],
      avoid: [
        "Ne pas créer un rappel ponctuel si l'intention reste récurrente.",
        "Ne pas modifier le contenu sans validation utilisateur.",
      ],
    },
    missing_decisions: [
      !draft.draft.frequency ? "cadence" : "",
      !draft.draft.time ? "heure" : "",
      !draft.draft.message ? "contenu" : "",
    ].filter(Boolean),
  };
}

function recurringReminderLifecycleSentence(
  draft: RecurringReminderDraftV1["draft"],
): string {
  const binding = draft.target_binding;
  if (!binding) return "";
  if (
    binding.target_kind === "action_family" ||
    binding.lifecycle_policy === "while_family_in_current_plan"
  ) {
    return "Je le garderai lié à cette famille d'habitude tant qu'elle reste active dans ton plan.";
  }
  if (
    binding.target_kind === "plan_item" ||
    binding.lifecycle_policy === "while_target_active"
  ) {
    return "Je le garderai lié à cette action tant qu'elle reste active dans ton plan.";
  }
  return "";
}

export function buildRecurringReminderCreatedMessage(
  draft: RecurringReminderDraftV1,
): string {
  const lifecycle = recurringReminderLifecycleSentence(draft.draft);
  return withRecurringReminderManagementHint(
    `Je ne crée pas de rappel récurrent depuis le chat. Voici la version à reprendre dans la plateforme : ${
      formatRecurringReminderDraftSummary(draft.draft)
    }.${lifecycle ? ` ${lifecycle}` : ""}`,
    draft.draft,
  );
}

function frequencyLabel(input: RecurringReminderBuilderInput["recurrence"]) {
  if (input.frequency === "daily") return "tous les jours";
  if (input.frequency === "weekdays") return "les jours de semaine";
  if (input.frequency === "weekly") return "chaque semaine";
  if (input.frequency === "specific_days") {
    return `les jours suivants : ${(input.days ?? []).join(", ")}`;
  }
  return "selon le rythme défini";
}

export function runRecurringReminderBuilder(
  input: RecurringReminderBuilderInput,
  messages: RecurringReminderDraftMessages = {},
): RecurringReminderDraftV1 {
  if (input.operation_type !== "create_recurring_reminder") {
    throw new Error("recurring_reminder_operation_type_invalid");
  }
  if (!input.recurrence.time || !input.recurrence.timezone) {
    throw new Error("recurring_reminder_time_missing");
  }
  if (!input.reminder_content.message) {
    throw new Error("recurring_reminder_message_missing");
  }
  const message = input.reminder_content.message.trim();
  const title = input.reminder_content.subject_hint
    ? `Rappel récurrent : ${input.reminder_content.subject_hint}`
    : `Rappel récurrent : ${message.slice(0, 42)}`;
  const frequency = frequencyLabel(input.recurrence);
  const fallbackConfirmation =
    `Je te propose de préparer ce rappel récurrent pour la section Initiatives : "${message}", ${frequency} à ${input.recurrence.time}.`;
  return {
    operation_type: "create_recurring_reminder",
    output_schema: "recurring_reminder_draft_v1",
    draft: {
      title,
      message,
      frequency: input.recurrence.frequency,
      days: input.recurrence.days,
      time: input.recurrence.time,
      timezone: input.recurrence.timezone,
      cadence_label: input.recurrence.cadence_label ?? null,
      destination: input.destination.value,
      related_plan_item_id: input.destination.related_plan_item_id ?? null,
      target_binding: input.destination.target_kind
        ? {
          target_kind: input.destination.target_kind,
          target_plan_item_id: input.destination.target_plan_item_id ??
            input.destination.related_plan_item_id ?? null,
          target_action_family_key:
            input.destination.target_action_family_key ?? null,
          target_generated_temp_id:
            input.destination.target_generated_temp_id ?? null,
          binding_policy: input.destination.target_binding_policy ?? "none",
          lifecycle_policy: input.destination.target_lifecycle_policy ??
            "independent",
          target_label: input.destination.target_label ?? null,
        }
        : null,
    },
    confirmation_message: messages.confirmation_message ??
      fallbackConfirmation,
    confirmation_actions: ["yes", "no"],
    user_message_brief: messages.user_message_brief,
    user_message_detailed: messages.user_message_detailed,
    execution_message: undefined,
    revision_message: messages.revision_message,
  };
}
