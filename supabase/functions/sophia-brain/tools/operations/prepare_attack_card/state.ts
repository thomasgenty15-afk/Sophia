import type {
  AttackCardDraftV1,
  AttackCardHandoffDraft,
  AttackCardHandoffStatus,
} from "./contract.ts";
import type { PrepareAttackCardLocalState } from "./local_flow.ts";

export type AttackCardHandoffState = {
  skill_id: "prepare_attack_card";
  mode: "platform_handoff";
  status: AttackCardHandoffStatus;
  draft?: AttackCardHandoffDraft | null;
  source_draft?: AttackCardDraftV1 | null;
  local_state?: PrepareAttackCardLocalState | null;
  target?: Record<string, unknown> | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  executable_from_chat: false;
};

export function isAttackCardHandoffState(
  value: unknown,
): value is AttackCardHandoffState {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.skill_id === "prepare_attack_card" &&
      record.mode === "platform_handoff" &&
      record.executable_from_chat === false,
  );
}

export function buildAttackCardHandoffState(args: {
  draft: AttackCardHandoffDraft;
  sourceDraft?: AttackCardDraftV1 | null;
  target?: Record<string, unknown> | null;
  localState?: PrepareAttackCardLocalState | null;
  status?: AttackCardHandoffStatus;
  previous?: AttackCardHandoffState | null;
  now?: string;
}): AttackCardHandoffState {
  const now = args.now ?? new Date().toISOString();
  return {
    skill_id: "prepare_attack_card",
    mode: "platform_handoff",
    status: args.status ?? "handoff_delivered",
    draft: args.draft,
    source_draft: args.sourceDraft ?? args.previous?.source_draft ?? null,
    local_state: args.localState ?? args.previous?.local_state ?? null,
    target: args.target ?? args.previous?.target ?? null,
    turn_count: (args.previous?.turn_count ?? 0) + 1,
    max_turns: args.previous?.max_turns ?? 8,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    executable_from_chat: false,
  };
}
