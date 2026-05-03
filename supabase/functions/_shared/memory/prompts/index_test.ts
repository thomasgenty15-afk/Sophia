import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PROMPT_VERSIONS } from "./index.ts";

const PROMPT_SNAPSHOTS = {
  extraction: {
    file: "extraction.v1.md",
    version: "memory.memorizer.extraction.v1",
    sha256: "af25a54c32ef8a9be267503f5c112e26dc7d19dacd3781b0b37a5cccc86b6374",
  },
  topic_router: {
    file: "topic_router.v1.md",
    version: "memory.runtime.topic_router.v1",
    sha256: "3ebaddecbf052548cc296d3cf820e56f5d77b7a817137d84fb97a78e1c561763",
  },
  compaction: {
    file: "compaction_topic.v1.md",
    version: "memory.compaction.topic.v1",
    sha256: "83878f02fc5a46b1fbd700f4138f3221415b613bcff9e4b43aa82825858eadc5",
  },
} as const;

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readPrompt(file: string): Promise<string> {
  const url = new URL(file, import.meta.url);
  return await Deno.readTextFile(url);
}

Deno.test("memory prompt helper exposes canonical versions", () => {
  assertEquals(PROMPT_VERSIONS, {
    extraction: "memory.memorizer.extraction.v1",
    topic_router: "memory.runtime.topic_router.v1",
    compaction: "memory.compaction.topic.v1",
  });
});

Deno.test("memory prompt files have versioned YAML headers", async () => {
  for (const snapshot of Object.values(PROMPT_SNAPSHOTS)) {
    const prompt = await readPrompt(snapshot.file);
    assertStringIncludes(prompt, `prompt_version: ${snapshot.version}`);
    assertStringIncludes(prompt, "model_recommended: gemini-3-flash-preview");
    assertStringIncludes(prompt, "created_at: 2026-05-01");
  }
});

Deno.test("memory prompt files match locked v1 snapshots", async () => {
  for (const snapshot of Object.values(PROMPT_SNAPSHOTS)) {
    const prompt = await readPrompt(snapshot.file);
    assertEquals(await sha256Hex(prompt), snapshot.sha256);
  }
});
