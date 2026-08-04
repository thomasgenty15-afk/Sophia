import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  sanitizeLocalExitNoteInformation,
} from "./note_information.v1.ts";

Deno.test("createNoteInformation keeps simplified contract shape", () => {
  const note = createNoteInformation({
    source_flow_id: "removed_local_flow",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "Close the removed local flow without adding another step.",
    user_words: ["j'arrete la", "deux objets"],
    structured_context: {
      user_message_summary: "User stops after a small step.",
      executable_from_chat: { db_write_committed: false },
      risk_score: 0,
    },
  });

  assertEquals(Object.keys(note).sort(), [
    "handoff_context_for_next_dispatcher",
    "handoff_reason",
    "source_flow_id",
    "structured_context",
    "target_dispatcher",
    "user_words",
  ]);
  assertEquals(note.user_words, ["j'arrete la", "deux objets"]);
  assertFalse("risk_score" in note);
  assertFalse("executable_from_chat" in note);
  assertFalse("source_flow_presentation" in note);
  assertFalse("source_flow_state_summary" in note);
  assertFalse("target_local_dispatcher_hint" in note);
  assertFalse("risk_score" in note.structured_context);
  assertFalse("executable_from_chat" in note.structured_context);
});

Deno.test("normalizeNoteInformation completes poor transition note from fallback", () => {
  const note = normalizeNoteInformation({
    source_flow_id: "removed_local_flow",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    user_words: [],
    structured_context: {},
  }, {
    source_flow_id: "removed_local_flow",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "User chose a minimal action and wants to stop for today.",
    user_words: ["Ok je garde juste ces deux objets"],
    current_user_message:
      "Ok je garde juste ces deux objets, et apres j'arrete la pour aujourd'hui.",
    structured_context: {
      active_flow_summary: "Meaning restored around a tiny kitchen reset.",
      constraints: ["stop_after_micro_step"],
      recommended_next_focus: "brief closure",
    },
    confidence: "high",
  });

  assertEquals(note.user_words, [
    "Ok je garde juste ces deux objets",
    "Ok je garde juste ces deux objets, et apres j'arrete la pour aujourd'hui.",
  ]);
  assertEquals(note.confidence, "high");
  assertEquals(
    note.handoff_context_for_next_dispatcher,
    "User chose a minimal action and wants to stop for today.",
  );
  assertEquals(
    note.structured_context.recommended_next_focus,
    "brief closure",
  );
});

Deno.test("normalizeNoteInformation builds minimal structured context when none exists", () => {
  const note = normalizeNoteInformation(null, {
    source_flow_id: "product_help",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "",
    current_user_message: "ok on revient a ma journee",
  });

  assertEquals(note.source_flow_id, "product_help");
  assertEquals(note.target_dispatcher, "global");
  assertEquals(note.user_words, ["ok on revient a ma journee"]);
  assert(note.handoff_context_for_next_dispatcher.length > 0);
  assert(Object.keys(note.structured_context).length > 0);
  assertEquals(note.structured_context.target_dispatcher, "global");
});

Deno.test("sanitizeLocalExitNoteInformation maps legacy local targets to global", () => {
  const removedTarget = ["prepare", "attack", "card"].join("_");
  const removedFocus = ["adjust", "plan", "item"].join("_");
  const removedFlow = ["select", "state", "potion"].join("_");
  const note = sanitizeLocalExitNoteInformation({
    source_flow_id: "weekly_adaptive_review_v1",
    handoff_reason: "bridge",
    target_dispatcher: removedTarget as any,
    handoff_context_for_next_dispatcher:
      "User asked for a card while weekly was active.",
    user_words: ["prepare une carte"],
    structured_context: {
      target_dispatcher: removedTarget,
      recommended_next_focus: removedFocus,
      target_flow: removedFlow,
      target_local_dispatcher_hint: removedTarget,
      source_flow_state_summary: "legacy detour",
    },
    confidence: "high",
  });

  assertEquals(note.target_dispatcher, "global");
  assertEquals(note.handoff_reason, "explicit_user_request");
  assertEquals(note.structured_context.target_dispatcher, "global");
  assertEquals(note.structured_context.recommended_next_focus, "global");
  assertEquals(note.structured_context.target_flow, "global");
  assertEquals(
    note.structured_context.sanitized_from_target_dispatcher,
    removedTarget,
  );
  assertFalse("target_local_dispatcher_hint" in note.structured_context);
  assertFalse("source_flow_state_summary" in note.structured_context);
});
