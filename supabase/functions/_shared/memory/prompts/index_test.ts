import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PROMPT_VERSIONS } from "./index.ts";

// W2.D-2 — re-locked against the prompts that are actually shipped. The two stale entries and
// what they mean, on the record:
//
//   • extraction.v1.md — the prompt body was edited on 2026-05-19 (commit 94d8d50b) WITHOUT a
//     version bump, so the lock has been red ever since. The lock did its job; nobody read it.
//     `version` (the YAML header) is unchanged, only `sha256` moves. Anyone bumping this hash
//     again must ask whether `memory.memorizer.extraction.v1` should have become `.v2`.
//   • compaction_topic.v1.md — its header was moved to `memory.compaction.topic.v2_only` on
//     2026-05-04 (commit f889aa21) while `prompts/index.ts` still advertises
//     `memory.compaction.topic.v1`. That divergence is REAL and is pinned by its own test
//     below rather than smoothed over here.
const PROMPT_SNAPSHOTS = {
  extraction: {
    file: "extraction.v1.md",
    version: "memory.memorizer.extraction.v1",
    sha256: "b76c461474dfef65bbcc91157dee3cf6501b4a221fde37b917e0bb64d60fe8f2",
  },
  topic_router: {
    file: "topic_router.v1.md",
    version: "memory.runtime.topic_router.v1",
    sha256: "3ebaddecbf052548cc296d3cf820e56f5d77b7a817137d84fb97a78e1c561763",
  },
  compaction: {
    file: "compaction_topic.v1.md",
    version: "memory.compaction.topic.v2_only",
    sha256: "b18aace2f98054ce087036041ec22751ce364e392248d345b77c60a7656ef39c",
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

// ── Pinned divergence ────────────────────────────────────────────────────────────────────
// `prompts/index.ts` advertises `memory.compaction.topic.v1` while the prompt file it points
// at, and the runtime that uses it, both say `memory.compaction.topic.v2_only`
// (`compaction/types.ts:4`, `compaction/topic_compaction.ts:128`). Nothing in production reads
// `PROMPT_VERSIONS.compaction` today — only `testing/mock_llm.ts` does, to name its fixture
// file — so the divergence is dormant, not live. It is pinned here so it cannot rot further
// unnoticed: fixing `index.ts` makes this test RED and that is the intended signal.
Deno.test("PINNED DIVERGENCE: PROMPT_VERSIONS.compaction still says v1 while the prompt says v2_only", async () => {
  assertEquals(PROMPT_VERSIONS.compaction, "memory.compaction.topic.v1");
  const prompt = await readPrompt("compaction_topic.v1.md");
  assertStringIncludes(prompt, "prompt_version: memory.compaction.topic.v2_only");
});
