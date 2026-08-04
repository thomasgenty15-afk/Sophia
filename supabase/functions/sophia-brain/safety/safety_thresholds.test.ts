import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RiskBand } from "../contracts/turn_frame.v1.ts";
import {
  allowsSideEffects,
  blocksDirectEffects,
  blocksToolSkills,
  forcesSafetyCrisisSkill,
  isAtLeast,
} from "./safety_thresholds.ts";

const ALL_BANDS: RiskBand[] = ["none", "low", "medium", "high", "critical"];

Deno.test("safety thresholds: full matrix is authoritative", () => {
  const matrix: Record<RiskBand, {
    direct: boolean;
    toolSkills: boolean;
    skill: boolean;
    side: boolean;
  }> = {
    none: { direct: false, toolSkills: false, skill: false, side: true },
    low: { direct: false, toolSkills: false, skill: false, side: true },
    medium: { direct: true, toolSkills: true, skill: false, side: false },
    high: { direct: true, toolSkills: true, skill: true, side: false },
    critical: { direct: true, toolSkills: true, skill: true, side: false },
  };
  for (const band of ALL_BANDS) {
    assertEquals(
      blocksDirectEffects(band),
      matrix[band].direct,
      `direct[${band}]`,
    );
    assertEquals(
      blocksToolSkills(band),
      matrix[band].toolSkills,
      `toolSkills[${band}]`,
    );
    assertEquals(
      forcesSafetyCrisisSkill(band),
      matrix[band].skill,
      `skill[${band}]`,
    );
    assertEquals(allowsSideEffects(band), matrix[band].side, `side[${band}]`);
  }
});

Deno.test("safety thresholds: side_effects is the strict complement of direct", () => {
  for (const band of ALL_BANDS) {
    assertEquals(allowsSideEffects(band), !blocksDirectEffects(band), band);
  }
});

Deno.test("safety thresholds: isAtLeast respects ordering", () => {
  assertEquals(isAtLeast("none", "none"), true);
  assertEquals(isAtLeast("low", "medium"), false);
  assertEquals(isAtLeast("medium", "medium"), true);
  assertEquals(isAtLeast("high", "medium"), true);
  assertEquals(isAtLeast("critical", "high"), true);
  assertEquals(isAtLeast("none", "critical"), false);
});
