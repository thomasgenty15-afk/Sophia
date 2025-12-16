import { assertEquals } from "std/testing/asserts.ts";
import { parseJsonBody, z } from "./http.ts";

Deno.test("parseJsonBody: ok", async () => {
  const req = new Request("http://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a: "x", b: 1 }),
  });

  const schema = z.object({ a: z.string(), b: z.number() }).strict();
  const out = await parseJsonBody(req, schema, "rid");
  assertEquals(out.ok, true);
  if (out.ok) assertEquals(out.data, { a: "x", b: 1 });
});

Deno.test("parseJsonBody: invalid json => 400", async () => {
  const req = new Request("http://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });

  const schema = z.object({ a: z.string() }).strict();
  const out = await parseJsonBody(req, schema, "rid");
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.response.status, 400);
});

Deno.test("parseJsonBody: zod fail => 400", async () => {
  const req = new Request("http://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a: 123 }),
  });

  const schema = z.object({ a: z.string() }).strict();
  const out = await parseJsonBody(req, schema, "rid");
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.response.status, 400);
});


