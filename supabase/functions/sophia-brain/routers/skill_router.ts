import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { forcesSafetyCrisisSkill } from "../safety/safety_thresholds.ts";

export type SkillRouterStatus =
  | "start"
  | "continue"
  | "handoff"
  | "exit"
  | "none";

export type SkillRouterDecision = {
  status: SkillRouterStatus;
  selected_skill_id?: string;
  reason_code: string;
  blocked_paths: Array<{ path: string; reason_code: string }>;
};

const SKILL_PRIORITY = [
  "safety_crisis",
  "emotional_repair",
  "demotivation_repair",
  "product_help",
];

const DEPRECATED_ACTION_BREAKDOWN_SKILL_ID = "execution" + "_breakdown";

function activeSkillId(state: unknown): string | null {
  const skillId = typeof (state as any)?.skill_id === "string"
    ? String((state as any).skill_id)
    : null;
  return skillId === DEPRECATED_ACTION_BREAKDOWN_SKILL_ID ? null : skillId;
}

function bestEntrySkill(turnFrame: TurnFrame): string | null {
  const entries = turnFrame.skill_signals.entry ?? {};
  for (const skillId of SKILL_PRIORITY) {
    if (entries[skillId]?.detected) return skillId;
  }
  for (const [skillId, signal] of Object.entries(entries)) {
    if ((signal as any)?.detected) return skillId;
  }
  return null;
}

function needsMediumSafetyConversation(turnFrame: TurnFrame): boolean {
  if (turnFrame.safety.risk_band !== "medium") return false;
  const reasons = turnFrame.safety.reason_codes ?? [];
  return reasons.some((reason) =>
    reason === "recent_safety_context_caution" ||
    reason === "passive_ideation_negated_medium_caution" ||
    reason === "recent_safety_negated_medium_caution" ||
    reason === "active_safety_flow_caution" ||
    reason === "passive_disappear_ideation" ||
    reason === "passive_absence_ideation" ||
    reason === "explicit_suicidal_thoughts"
  );
}

export function runSkillRouter(input: {
  turn_frame: TurnFrame;
  active_skill_state?: unknown;
  pending_tool_skill_confirmation?: unknown;
}): SkillRouterDecision {
  const active = activeSkillId(input.active_skill_state);
  const mediumSafetyConversation = needsMediumSafetyConversation(
    input.turn_frame,
  );
  if (active === "safety_crisis") {
    return {
      status: "continue",
      selected_skill_id: "safety_crisis",
      reason_code: "active_safety_crisis_continue",
      blocked_paths: [{ path: "skills", reason_code: "safety_override" }],
    };
  }
  if (
    forcesSafetyCrisisSkill(input.turn_frame.safety.risk_band) ||
    mediumSafetyConversation
  ) {
    return {
      status: "start",
      selected_skill_id: "safety_crisis",
      reason_code: mediumSafetyConversation
        ? "safety_medium_context_override"
        : "safety_override",
      blocked_paths: [{ path: "skills", reason_code: "safety_override" }],
    };
  }

  if (input.pending_tool_skill_confirmation) {
    return {
      status: "none",
      reason_code: "pending_confirmation_blocks_skill_start",
      blocked_paths: [],
    };
  }

  const lifecycle = active
    ? input.turn_frame.skill_signals.lifecycle?.[active]
    : null;
  const exitSignals = input.turn_frame.skill_signals.exit ?? {};
  const exit = active
    ? exitSignals[active] ??
      ((exitSignals as any).skill_id === active ? exitSignals as any : null)
    : null;
  const entry = bestEntrySkill(input.turn_frame);
  if (
    active && exit &&
    (exit.detected ||
      exit.confidence_band === "high" ||
      exit.confidence_band === "critical" ||
      (exit as any).skill_id === active ||
      Boolean((exit as any).reason || (exit as any).evidence))
  ) {
    return {
      status: "exit",
      selected_skill_id: active,
      reason_code: "active_skill_exit_requested",
      blocked_paths: [],
    };
  }
  if (active && lifecycle?.detected && (!entry || entry === active)) {
    return {
      status: "continue",
      selected_skill_id: active,
      reason_code: "active_skill_continue",
      blocked_paths: [],
    };
  }
  if (active && entry && entry !== active) {
    return {
      status: "handoff",
      selected_skill_id: entry,
      reason_code: "skill_handoff_requested",
      blocked_paths: [],
    };
  }
  if (entry) {
    return {
      status: "start",
      selected_skill_id: entry,
      reason_code: "skill_entry_signal",
      blocked_paths: [],
    };
  }
  return {
    status: "none",
    reason_code: "no_skill_signal",
    blocked_paths: [],
  };
}
