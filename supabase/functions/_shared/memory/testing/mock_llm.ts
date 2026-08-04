import { type MemoryPromptName, PROMPT_VERSIONS } from "../prompts/index.ts";
import type { ScenarioRunOptions } from "./types.ts";

export type MockLlmCall = {
  scenario_id: string;
  prompt: MemoryPromptName;
  turn_index: number;
  input?: unknown;
  inline_fixture?: unknown;
};

export type MockLlmResult = {
  prompt_version: string;
  output: unknown;
  source: "inline" | "fixture" | "recorded" | "placeholder";
};

export interface RealLlmProvider {
  call(call: MockLlmCall): Promise<unknown>;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function defaultFixturesDir(options: ScenarioRunOptions): string {
  return options.fixtures_dir ??
    "supabase/functions/_shared/memory/testing/fixtures";
}

function fixturePath(
  options: ScenarioRunOptions,
  scenarioId: string,
  promptVersion: string,
): string {
  return `${defaultFixturesDir(options)}/${safeSegment(scenarioId)}/${
    safeSegment(promptVersion)
  }.json`;
}

async function readJsonFile(path: string): Promise<unknown> {
  const raw = await Deno.readTextFile(path);
  return JSON.parse(raw);
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeFixture(
  raw: unknown,
  expectedVersion: string,
): MockLlmResult {
  const obj = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : {};
  const promptVersion = String(obj.prompt_version ?? "");
  if (promptVersion !== expectedVersion) {
    throw new Error(
      `Fixture prompt_version mismatch: expected ${expectedVersion}, got ${
        promptVersion || "<missing>"
      }`,
    );
  }
  return {
    prompt_version: expectedVersion,
    output: "output" in obj ? obj.output : obj,
    source: "fixture",
  };
}

export class MemoryMockLlm {
  constructor(private readonly realProvider?: RealLlmProvider) {}

  async call(
    call: MockLlmCall,
    options: ScenarioRunOptions,
  ): Promise<MockLlmResult> {
    const promptVersion = PROMPT_VERSIONS[call.prompt];
    const path = fixturePath(options, call.scenario_id, promptVersion);

    if (options.llm_mode === "mock") {
      return {
        prompt_version: promptVersion,
        output: call.inline_fixture ?? {},
        source: call.inline_fixture ? "inline" : "placeholder",
      };
    }

    if (options.llm_mode === "replay") {
      try {
        return normalizeFixture(await readJsonFile(path), promptVersion);
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          throw new Error(`Missing replay fixture: ${path}`);
        }
        throw err;
      }
    }

    if (options.llm_mode === "record" || options.llm_mode === "refresh") {
      const output = this.realProvider
        ? await this.realProvider.call(call)
        : call.inline_fixture ?? {};
      await writeJsonFile(path, {
        prompt_version: promptVersion,
        scenario_id: call.scenario_id,
        prompt: call.prompt,
        turn_index: call.turn_index,
        output,
      });
      return { prompt_version: promptVersion, output, source: "recorded" };
    }

    const exhaustive: never = options.llm_mode;
    throw new Error(`Unsupported llm_mode: ${exhaustive}`);
  }
}

export function createMemoryMockLlm(
  realProvider?: RealLlmProvider,
): MemoryMockLlm {
  return new MemoryMockLlm(realProvider);
}
