import { assertEquals } from "jsr:@std/assert@1";
import { decidePotMassPublication, potShortfallTolerated } from "./pot_mass_publication.ts";

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

Deno.test("2026-09-23 — un manque de moins d'un gramme ne bloque plus un plan (staging 03676bbf)", () => {
  assertEquals(potShortfallTolerated(420, 0.4), true);
  assertEquals(potShortfallTolerated(1_066, 25), true); // 2,3 % — tir 6 des 30
  assertEquals(potShortfallTolerated(363, 10), true); // plancher de 10 g
});

Deno.test("2026-09-23 — au-delà de max(10 g, 3 %), le manque reste bloquant", () => {
  assertEquals(potShortfallTolerated(200, 11), false); // 3 % = 6 g → plancher 10 g
  assertEquals(potShortfallTolerated(1_066, 33), false); // 3 % = 32 g
  assertEquals(potShortfallTolerated(Number.NaN, 1), false);
});
