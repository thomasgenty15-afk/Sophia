import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildProductSurfaceRegistry,
  filterSurfacesByContraindications,
  loadProductSurfaceRegistry,
  PRODUCT_SURFACE_REGISTRY_REQUIRED_IDS,
} from "./registry.ts";

Deno.test("ProductSurfaceRegistry v2 loads surfaces.json and includes every required surface", async () => {
  const registry = await loadProductSurfaceRegistry();
  assertEquals(registry.surfaces.length, 8);
  assertEquals(registry.handoff_targets.length, 6);
  for (const id of PRODUCT_SURFACE_REGISTRY_REQUIRED_IDS) {
    assertEquals(registry.by_id.has(id), true, id);
  }
});

Deno.test("ProductSurfaceRegistry v2 validates schema and contraindications", async () => {
  const registry = await loadProductSurfaceRegistry();
  for (const surface of registry.surfaces) {
    assertEquals(surface.contraindications.length > 0, true, surface.id);
    assertEquals(surface.aliases.length > 0, true, surface.id);
    assertEquals(surface.trigger_keywords.length > 0, true, surface.id);
  }
});

Deno.test("ProductSurfaceRegistry v2 rejects missing required surfaces", async () => {
  const registry = await loadProductSurfaceRegistry();
  await assertRejects(
    async () => {
      buildProductSurfaceRegistry(
        registry.surfaces.filter((surface) => surface.id !== "attack_card"),
      );
    },
    Error,
    "surface_attack_card_missing",
  );
});

Deno.test("ProductSurfaceRegistry v2 filters active contraindications", async () => {
  const registry = await loadProductSurfaceRegistry();
  const allowed = filterSurfacesByContraindications(registry.surfaces, [
    "safety_active",
  ]);
  assertEquals(allowed.length, 0);
});
