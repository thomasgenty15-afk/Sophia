import { assertEquals, assertExists } from "jsr:@std/assert";

import {
  COACHING_BLOCKER_TECHNIQUE_MATRIX,
  getCoachingBlockerDefinition,
  getCoachingTechniqueDefinition,
  listAllTechniqueIdsForBlocker,
  listCoachingBlockers,
  listCoachingTechniques,
} from "./coaching_interventions.ts";

Deno.test("coaching_interventions: registry exposes 6 blockers and 10 techniques", () => {
  assertEquals(listCoachingBlockers().length, 6);
  assertEquals(listCoachingTechniques().length, 10);
});

Deno.test("coaching_interventions: each blocker has primary and secondary techniques", () => {
  for (const blocker of listCoachingBlockers()) {
    const bundle = COACHING_BLOCKER_TECHNIQUE_MATRIX[blocker.id];
    assertExists(bundle);
    assertEquals(bundle.primary.length >= 2, true);
    assertEquals(bundle.secondary.length >= 2, true);
  }
});

Deno.test("coaching_interventions: every technique is reachable from at least one blocker", () => {
  const used = new Set<string>();
  for (const blocker of listCoachingBlockers()) {
    for (const techniqueId of listAllTechniqueIdsForBlocker(blocker.id)) {
      used.add(techniqueId);
    }
  }

  for (const technique of listCoachingTechniques()) {
    assertEquals(used.has(technique.id), true);
  }
});

Deno.test("coaching_interventions: definitions stay queryable by id", () => {
  assertEquals(
    getCoachingBlockerDefinition("environment_mismatch").label,
    "Environnement defavorable",
  );
  assertEquals(
    getCoachingTechniqueDefinition("urge_delay").primary_goal,
    "absorber la pulsion",
  );
});
