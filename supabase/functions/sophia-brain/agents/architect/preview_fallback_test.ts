import { createActionCandidate } from "./action_candidate_types.ts";
import { createBreakdownCandidate } from "./breakdown_candidate_types.ts";
import { processBreakdownPreviewResponse } from "./breakdown_action_flow.ts";
import { processPreviewResponse } from "./create_action_flow.ts";
import { processUpdatePreviewResponse } from "./update_action_flow.ts";
import { createUpdateCandidate } from "./update_action_candidate_types.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${msg ? msg + " — " : ""}Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

Deno.test("create_action preview fallback: elongated oui confirms", () => {
  const candidate = createActionCandidate({
    label: "S'étirer les bras",
    proposed_by: "sophia",
    status: "previewing",
    params: { title: "S'étirer les bras", target_reps: 7, time_of_day: "morning" },
  });

  const result = processPreviewResponse(candidate, "ouiiiuuu");
  assertEquals(result.shouldCreate, true, "should create");
  assertEquals(result.shouldAbandon, false, "not abandoned");
});

Deno.test("update_action preview fallback: short non declines", () => {
  const candidate = createUpdateCandidate({
    target_action: { title: "Plages Focus", current_reps: 5 },
    proposed_changes: { new_reps: 7 },
  });

  const result = processUpdatePreviewResponse(candidate, "non");
  assertEquals(result.shouldApply, false, "should not apply");
  assertEquals(result.shouldAbandon, true, "abandoned");
});

Deno.test("breakdown preview fallback: oui applies", () => {
  const candidate = createBreakdownCandidate({
    target_action: { title: "Sport" },
    blocker: "fatigue",
    status: "previewing",
  });
  candidate.proposed_step = {
    title: "Mettre les chaussures",
    description: "Juste 2 minutes",
  };

  const result = processBreakdownPreviewResponse(candidate, "oui");
  assertEquals(result.shouldApply, true, "should apply");
  assertEquals(result.shouldAbandon, false, "not abandoned");
});
