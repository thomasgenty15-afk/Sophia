import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import type { MemoryWriteCandidate } from "../../contracts/memory_write_candidate.v1.ts";
import type { SkillContext, SkillId } from "./context.ts";

export type RunSkillInput = {
  user_message: string;
  context: SkillContext;
};

export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function baseOutput(
  skillId: SkillId,
  patch: Partial<ConversationSkillOutput>,
): ConversationSkillOutput {
  return {
    skill_id: skillId,
    status: "continue",
    response_intent: "continue",
    memory_trace: {
      memory_used_for_response: false,
      memory_item_ids_used: [],
      correction_detected: false,
      correction_target_item_ids: [],
    },
    ...patch,
  };
}

export function statementCandidate(
  contentText: string,
  sourceId: string,
  sensitivityLevel: 0 | 1 | 2 | 3 | 4,
  shouldPersistDefault = false,
): MemoryWriteCandidate {
  return {
    kind: "statement",
    content_text: contentText,
    evidence_source_ids: [sourceId],
    confidence_band: "medium",
    sensitivity_level: sensitivityLevel,
    persistence_rationale:
      "Conversation skill observation; memorizer decides durable persistence.",
    should_persist_default: shouldPersistDefault,
    anti_identity_freeze_checked: true,
    scope_hint: "session",
  };
}
