import { assertEquals } from "jsr:@std/assert@1";
import { decidePotMassPublication } from "./pot_mass_publication.ts";

Deno.test("B4 — une casserole encore déficitaire produit zéro écriture", async () => {
  let writes = 0;
  const out = await decidePotMassPublication({
    overdrawn: 1,
    unreadable: 0,
    worstShortfallG: 35,
    publish: async () => ++writes,
  });
  assertEquals(out.kind, "blocked");
  assertEquals(writes, 0);
  if (out.kind === "blocked") assertEquals(out.worstShortfallG, 35);
});

Deno.test("B4 — une casserole servie mais illisible produit zéro écriture", async () => {
  let writes = 0;
  const out = await decidePotMassPublication({
    overdrawn: 0,
    unreadable: 1,
    worstShortfallG: 0,
    publish: async () => ++writes,
  });
  assertEquals(out.kind, "blocked");
  assertEquals(writes, 0);
});

Deno.test("B4 — l'identité tenue laisse exactement une publication", async () => {
  let writes = 0;
  const out = await decidePotMassPublication({
    overdrawn: 0,
    unreadable: 0,
    worstShortfallG: 0,
    publish: async () => ++writes,
  });
  assertEquals(out.kind, "published");
  assertEquals(writes, 1);
});
