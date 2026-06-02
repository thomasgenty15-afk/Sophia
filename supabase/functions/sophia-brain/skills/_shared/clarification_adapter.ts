import {
  buildClarificationRequest,
  type ClarificationAmbiguityKind,
  type ClarificationCandidate,
  type ClarificationOwner,
  type ClarificationToolOutput,
} from "../../clarification/contract.ts";
import type { ClarificationState } from "../../clarification/state.ts";
import {
  type ClarificationLlmRunner,
  runClarificationTool,
} from "../../clarification/tool.ts";

export type ConversationSkillClarificationRequest = {
  owner: ClarificationOwner;
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
  known_context?: Record<string, unknown>;
};

export async function runSkillClarification(args: {
  owner: ClarificationOwner;
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
  known_context?: Record<string, unknown>;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_flow_state?: unknown;
  previous_state?: ClarificationState | null;
  llm_runner: ClarificationLlmRunner;
  model_name?: string;
  request_id?: string | null;
}): Promise<ClarificationToolOutput> {
  const request = buildClarificationRequest({
    clarification_id: args.request_id
      ? `${args.request_id}:${args.owner}:clarification`
      : `${args.owner}:clarification`,
    owner: args.owner,
    ambiguity_kind: args.ambiguity_kind,
    user_message: args.user_message,
    recent_messages: args.recent_messages,
    active_flow_state: args.active_flow_state,
    known_context: args.known_context,
    candidates: args.candidates,
  });
  return await runClarificationTool({
    request,
    previous_state: args.previous_state ?? null,
    llm_runner: args.llm_runner,
    model_name: args.model_name,
    request_id: args.request_id ?? null,
  });
}
