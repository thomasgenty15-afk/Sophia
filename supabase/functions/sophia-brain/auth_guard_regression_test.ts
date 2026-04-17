import { assertEquals, assertMatch } from "jsr:@std/assert@1";

function loadIndexSource(): Promise<string> {
  const fileUrl = new URL("./index.ts", import.meta.url);
  return Deno.readTextFile(fileUrl);
}

Deno.test("sophia-brain auth regression: explicit 401 on missing Authorization", async () => {
  const src = await loadIndexSource();
  assertMatch(src, /if\s*\(!authHeader\)\s*\{/);
  assertMatch(src, /status:\s*401/);
});

Deno.test("sophia-brain auth regression: user identity comes from auth.getUser", async () => {
  const src = await loadIndexSource();
  assertMatch(src, /auth\.getUser\(\)/);
  assertMatch(src, /processMessage\(\s*[\s\S]*?\buser\.id\b/);
});

Deno.test("sophia-brain auth regression: history query is scoped to authenticated user", async () => {
  const src = await loadIndexSource();
  assertMatch(src, /\.from\(\"chat_messages\"\)[\s\S]*?\.eq\(\"user_id\",\s*user\.id\)/);
  assertEquals(src.includes("body?.user_id"), false);
});
