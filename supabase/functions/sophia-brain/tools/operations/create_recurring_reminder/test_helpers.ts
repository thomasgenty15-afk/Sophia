import type {
  CreateRecurringReminderSlotFiller,
  RecurringReminderFrequency,
} from "./intake.ts";

export function structuredRecurringReminderSlotFiller(input: {
  frequency?: RecurringReminderFrequency | null;
  days?: string[];
  time?: string | null;
  message?: string | null;
  missing_slots?: string[];
  generated_user_message?: string | null;
  confirmation_message?: string;
  execution_message?: string;
}): CreateRecurringReminderSlotFiller {
  return async () => {
    const missing = input.missing_slots ??
      [
        !input.frequency ? "frequency" : "",
        !input.time ? "time" : "",
        !input.message ? "message" : "",
      ].filter(Boolean);
    return {
      current_sub_skill: missing.length === 0
        ? "draft_generation"
        : missing.includes("message")
        ? "content_intake"
        : "recurrence_resolution",
      state_patch: {
        recurrence: {
          status: input.frequency && input.time ? "identified" : "missing",
          frequency: input.frequency ?? null,
          days: input.days ?? [],
          time: input.time ?? null,
          timezone: "Europe/Paris",
          confidence: "high",
          evidence: ["structured_test_fixture"],
        },
        reminder_content: {
          status: input.message ? "identified" : "missing",
          message: input.message ?? null,
          subject_hint: input.message ?? null,
          confidence: "high",
          evidence: ["structured_test_fixture"],
        },
        destination: {
          status: "identified",
          value: "base_de_vie",
          related_plan_item_id: null,
          target_kind: "none",
          target_plan_item_id: null,
          target_action_family_key: null,
          target_generated_temp_id: null,
          target_binding_policy: "none",
          target_lifecycle_policy: "independent",
          target_label: null,
          confidence: "high",
          evidence: ["structured_test_fixture"],
        },
        draft_messages: {
          confirmation_message: input.confirmation_message ??
            (input.message && input.time
              ? `Confirmer le rappel "${input.message}" à ${input.time} ?`
              : undefined),
          user_message_brief: input.message
            ? `Rappel proposé: ${input.message}.`
            : undefined,
          user_message_detailed: input.message
            ? `Rappel proposé: ${input.message}.`
            : undefined,
          execution_message: input.execution_message ??
            (input.message
              ? `C'est fait. J'ai créé ce rappel récurrent: ${input.message}. Tu peux le modifier dans ton espace sur sophia-coach.ai.`
              : undefined),
          revision_message: input.message
            ? `J'ai mis à jour le brouillon du rappel: ${input.message}.`
            : undefined,
        },
        missing_slots: missing,
        generated_user_message: input.generated_user_message ?? null,
        confidence: missing.length === 0 ? "high" : "medium",
      },
      missing_slots: missing,
      confidence: missing.length === 0 ? "high" : "medium",
      generated_user_message: input.generated_user_message ?? null,
      evidence: ["structured_test_fixture"],
    };
  };
}
