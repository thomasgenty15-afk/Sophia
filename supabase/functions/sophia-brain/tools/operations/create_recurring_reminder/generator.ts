import type { RecurringReminderBuilderInput } from "../_shared/operation_payload_builder.ts";

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
    destination: "current_plan" | "base_de_vie";
    related_plan_item_id?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

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
  if (/\bdemain\b|\bdans \d+/.test(message.toLowerCase())) {
    throw new Error("recurring_reminder_one_shot_payload");
  }
  const title = input.reminder_content.subject_hint
    ? `Rappel récurrent : ${input.reminder_content.subject_hint}`
    : `Rappel récurrent : ${message.slice(0, 42)}`;
  const frequency = frequencyLabel(input.recurrence);
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
      destination: input.destination.value,
      related_plan_item_id: input.destination.related_plan_item_id ?? null,
    },
    confirmation_message:
      `Je te propose de créer ce rappel récurrent : "${message}", ${frequency} à ${input.recurrence.time}. Tu veux que je le crée ?`,
    confirmation_actions: ["yes", "no"],
  };
}
