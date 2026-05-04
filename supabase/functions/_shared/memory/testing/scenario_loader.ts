import type { GoldenScenario } from "./types.ts";

export const GOLDEN_SCENARIO_IDS = [
  "01_topic_continuity_breakup",
  "02_false_switch_lateral_detail",
  "03_true_switch_work",
  "04_reopen_dormant_cannabis",
  "05_cross_topic_psychology",
  "06_dated_event_friday",
  "07_action_missed_walk",
  "08_strong_statement_self_blame",
  "09_correction_wrong_memory",
  "10_forget_sensitive_item",
  "11_safety_minimal_context",
  "12_entity_father_aliases",
  "13_cross_topic_work",
  "14_cross_topic_family",
  "15_cross_topic_habits",
  "16_cross_topic_main_problem",
] as const;

export type GoldenScenarioFileId = typeof GOLDEN_SCENARIO_IDS[number];

export function parseScenarioText(text: string): GoldenScenario {
  const parsed = JSON.parse(stripJsonTrailingCommas(text)) as GoldenScenario;
  validateScenario(parsed);
  return parsed;
}

function stripJsonTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

export async function loadScenario(path: string): Promise<GoldenScenario> {
  return parseScenarioText(await Deno.readTextFile(path));
}

export async function loadScenarios(
  dir = "supabase/functions/_shared/memory/testing/scenarios",
): Promise<GoldenScenario[]> {
  const scenarios: GoldenScenario[] = [];
  for (const id of GOLDEN_SCENARIO_IDS) {
    scenarios.push(await loadScenario(`${dir}/${id}.yaml`));
  }
  return scenarios;
}

export function validateScenario(scenario: GoldenScenario): void {
  if (!scenario.id) throw new Error("Scenario id is required");
  if (!scenario.description) {
    throw new Error(`Scenario ${scenario.id} description is required`);
  }
  if (
    !Number.isInteger(scenario.scenario_version) ||
    scenario.scenario_version < 1
  ) {
    throw new Error(
      `Scenario ${scenario.id} scenario_version must be an integer >= 1`,
    );
  }
  if (
    !Array.isArray(scenario.turns) || scenario.turns.length < 2 ||
    scenario.turns.length > 5
  ) {
    throw new Error(`Scenario ${scenario.id} must contain 2 to 5 turns`);
  }
  for (const [index, turn] of scenario.turns.entries()) {
    if (!turn.expect) {
      throw new Error(
        `Scenario ${scenario.id} turn ${index + 1} is missing expect`,
      );
    }
  }
}
