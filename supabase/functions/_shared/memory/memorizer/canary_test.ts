import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isMemoryV2WriteCanaryUser, memoryV2CanaryBucket } from "./canary.ts";

Deno.test("canary bucket is deterministic and respects percentage bounds", async () => {
  const a = await memoryV2CanaryBucket("user-a");
  const b = await memoryV2CanaryBucket("user-a");
  assertEquals(a, b);
  assertEquals(a >= 0 && a < 100, true);
  assertEquals(await isMemoryV2WriteCanaryUser("user-a", 100), true);
  assertEquals(await isMemoryV2WriteCanaryUser("user-a", 0), false);
});
