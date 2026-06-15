import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { noteForInlineInfo } from "./inline_info_tools.ts";

Deno.test("inline info note stays compact and does not dump parent flow context", () => {
  const note = noteForInlineInfo({
    active_flow: "create_recurring_reminder",
    active_flow_status: "collecting",
    question_to_answer: "ou est la section initiative ?",
    dispatcher_context: {
      flow_action: "get_info_product",
      evidence: ["section initiative"],
    },
    active_flow_context: {
      fields: {
        recurrence: {
          status: "identified",
          time: "18:10",
        },
        reminder_content: {
          status: "identified",
          message: "boire de l eau",
        },
        destination: {
          status: "identified",
          value: "base_de_vie",
        },
      },
      handoff_draft: {
        ready: true,
        platform_destination: "Initiatives",
      },
      visible_task: {
        conversation_context: {
          raw: "must-not-leak",
        },
      },
      note_information: {
        handoff_context_for_next_dispatcher: "must-not-be-copied",
      },
    },
  }, "product_help");

  const encoded = JSON.stringify(note);
  assertEquals(note.source_flow_id, "create_recurring_reminder");
  assertEquals(note.target_dispatcher, "product_help");
  assert(!encoded.includes("active_flow_context"));
  assert(!encoded.includes("dispatcher_context"));
  assert(!encoded.includes("conversation_context"));
  assert(!encoded.includes("visible_task"));
  assert(!encoded.includes("must-not-leak"));
  assert(!encoded.includes("must-not-be-copied"));
  assert(note.handoff_context_for_next_dispatcher.length < 220);
  assertEquals(
    (note.structured_context as any).collected_state.platform_destination,
    "Initiatives",
  );
});
