// Single source of truth for safety threshold decisions across the conversation
// pipeline. All routers, gates and pre-gates MUST consume these predicates so
// behaviour stays consistent. Changing a threshold here is a deliberate,
// audited operation; never inline a band comparison elsewhere.
//
// The matrix below is the authoritative safety contract:
//
//   risk_band  | side_effects | direct_effects | tool_skills | safety_crisis_skill
//   none       | allow        | allow          | allow      | no
//   low        | allow        | allow          | allow      | no
//   medium     | block        | block          | block      | no*
//   high       | block        | block          | block      | yes
//   critical   | block        | block          | block      | yes
//
// Notes:
// - "side_effects" is the safety context compatibility flag; it MUST equal the
//   complement of `blocksDirectEffects`. They are kept distinct only for
//   downstream audit clarity.
// - "tool_skills" applies to tool_skill_router pending/active/intent paths.
// - "safety_crisis_skill" is the skill_router override threshold.
// - Medium recent-safety continuation is handled by skill_router using
//   reason_codes, while this generic predicate remains the floor for
//   unconditional safety override.
import type { RiskBand } from "../contracts/turn_frame.v1.ts";

const RISK_ORDER: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function riskScore(risk: RiskBand): number {
  const index = RISK_ORDER.indexOf(risk);
  return index < 0 ? 0 : index;
}

export function isAtLeast(risk: RiskBand, threshold: RiskBand): boolean {
  return riskScore(risk) >= riskScore(threshold);
}

export function blocksDirectEffects(risk: RiskBand): boolean {
  return isAtLeast(risk, "medium");
}

export function blocksToolSkills(risk: RiskBand): boolean {
  return isAtLeast(risk, "medium");
}

export function forcesSafetyCrisisSkill(risk: RiskBand): boolean {
  return isAtLeast(risk, "high");
}

export function allowsSideEffects(risk: RiskBand): boolean {
  return !blocksDirectEffects(risk);
}

export const SAFETY_THRESHOLDS = {
  direct_effects_blocked_at: "medium" as RiskBand,
  tool_skills_blocked_at: "medium" as RiskBand,
  safety_crisis_skill_at: "high" as RiskBand,
} as const;
