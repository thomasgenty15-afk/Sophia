import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const LEGACY_RUNTIME_PATTERNS = [
  "topic_memory.ts",
  "global_memory.ts",
  "scope_memory.ts",
  "event_memory.ts",
  "user_global_memories",
  "user_event_memories",
  "user_topic_enrichment_log",
  "match_topic_memories",
  "match_global_memories",
  "match_event_memories",
] as const;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (path.includes("/__tests__")) continue;
      yield* walk(path);
    } else if (entry.isFile && /\.(ts|tsx|js|mjs|toml)$/.test(entry.name)) {
      yield path;
    }
  }
}

Deno.test("Memory V2-only runtime has no V1 memory references", async () => {
  const root = decodeURIComponent(
    new URL("../../../", import.meta.url).pathname.replace(/\/$/, ""),
  );
  const hits: string[] = [];
  for await (const path of walk(root)) {
    const text = await Deno.readTextFile(path);
    for (const pattern of LEGACY_RUNTIME_PATTERNS) {
      if (text.includes(pattern)) hits.push(`${path}: ${pattern}`);
    }
  }
  assertEquals(hits, []);
});
