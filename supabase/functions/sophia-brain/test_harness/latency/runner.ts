import type { ReplayFixture } from "../conversation_route_replay/runner.ts";
import {
  type ReplayResult,
  runReplayFixture,
} from "../conversation_route_replay/runner.ts";

export type LatencySample = {
  fixture_id: string;
  latency_ms: number;
  passed: boolean;
  diff: string[];
};

export type LatencyBudget = {
  average_ms: number;
  p95_ms: number;
  samples: number;
  average_budget_ms: number;
  p95_budget_ms: number;
  passed: boolean;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function roundMs(value: number): number {
  return Math.round(value);
}

export async function measureReplayLatency(
  fixtures: ReplayFixture[],
): Promise<LatencySample[]> {
  const samples: LatencySample[] = [];
  for (const fixture of fixtures) {
    const started = performance.now();
    const result: ReplayResult = await runReplayFixture(fixture, {
      mode: "s2",
    });
    samples.push({
      fixture_id: fixture.fixture_id,
      latency_ms: performance.now() - started,
      passed: result.passed,
      diff: result.diff,
    });
  }
  return samples;
}

export function evaluateLatencyBudget(
  samples: LatencySample[],
  budget: { average_budget_ms?: number; p95_budget_ms?: number } = {},
): LatencyBudget {
  const averageBudget = budget.average_budget_ms ?? 4_000;
  const p95Budget = budget.p95_budget_ms ?? 6_000;
  const latencies = samples.map((sample) => sample.latency_ms);
  const average = latencies.length === 0
    ? 0
    : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const p95 = percentile(latencies, 95);
  const passed = samples.every((sample) => sample.passed) &&
    average < averageBudget &&
    p95 < p95Budget;
  return {
    average_ms: roundMs(average),
    p95_ms: roundMs(p95),
    samples: samples.length,
    average_budget_ms: averageBudget,
    p95_budget_ms: p95Budget,
    passed,
  };
}

export function renderLatencyMarkdown(input: {
  samples: LatencySample[];
  budget: LatencyBudget;
}): string {
  const lines = [
    "# S8 latency",
    "",
    `Samples: ${input.budget.samples}`,
    `Average: ${input.budget.average_ms}ms / ${input.budget.average_budget_ms}ms`,
    `P95: ${input.budget.p95_ms}ms / ${input.budget.p95_budget_ms}ms`,
    `Passed: ${input.budget.passed ? "yes" : "no"}`,
    "",
    "| Fixture | Passed | Latency ms |",
    "| --- | --- | ---: |",
  ];
  for (const sample of input.samples) {
    lines.push(
      `| ${sample.fixture_id} | ${sample.passed ? "yes" : "no"} | ${
        roundMs(sample.latency_ms)
      } |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
