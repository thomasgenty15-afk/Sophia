import { retryOn429 } from "./retry429.ts";
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("retryOn429: retries until non-429 (respects maxAttempts)", async () => {
  let calls = 0;
  const statuses = [429, 429, 200];

  const res = await retryOn429(
    async () => {
      calls++;
      const status = statuses[calls - 1] ?? 200;
      return new Response(JSON.stringify({ ok: true }), { status, headers: { "Content-Type": "application/json" } });
    },
    {
      maxAttempts: 5,
      delayMs: 1,
      sleep: async () => {}, // no real wait
    },
  );

  assertEquals(res.status, 200);
  assertEquals(calls, 3);
});

Deno.test("retryOn429: stops at maxAttempts and returns 429", async () => {
  let calls = 0;
  const res = await retryOn429(
    async () => {
      calls++;
      return new Response("quota", { status: 429 });
    },
    {
      maxAttempts: 4,
      delayMs: 1,
      sleep: async () => {},
    },
  );

  assertEquals(res.status, 429);
  assertEquals(calls, 4);
});


