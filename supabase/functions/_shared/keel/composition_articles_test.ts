import { assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionRef,
  resolveIngredient,
} from "./food_composition.ts";

/**
 * ⟳ 2026-09-22 — UNE PRÉFÉRENCE S'ÉCRIT COMME ON PARLE. Mesuré sur un run réel
 * (`d52f0c5c`, `pinned_unresolved`) : « du lait d'avoine » et « flocons
 * d'avoines » ne se résolvaient pas alors que « lait d'avoine » et « flocons
 * d'avoine » étaient des alias. L'article de tête et le pluriel fautif du
 * seul dernier mot sont deux formes de plus, jamais à la place des autres.
 */
function ref(slug: string, foodGroupRef: string): CompositionRef {
  return { slug, foodGroupRef, label: slug, energyKcal: 100, proteinG: 1 } as unknown as CompositionRef;
}
const INDEX = buildCompositionIndex(
  [ref("oat_milk", "whole_grain"), ref("oats", "whole_grain"), ref("mixed_seeds", "nuts_seeds"), ref("eggs", "eggs")],
  [
    { alias: "lait d'avoine", slug: "oat_milk" },
    { alias: "flocons d'avoine", slug: "oats" },
    { alias: "graines", slug: "mixed_seeds" },
    { alias: "œufs", slug: "eggs" },
  ],
);
const slugOf = (t: string) => resolveIngredient(INDEX, t)?.slug ?? null;

Deno.test("l'article de tête ne cache plus l'aliment : du, des, les, de la, l'", () => {
  assertEquals(slugOf("du lait d'avoine"), "oat_milk");
  assertEquals(slugOf("des flocons d'avoine"), "oats");
  assertEquals(slugOf("les graines"), "mixed_seeds");
  assertEquals(slugOf("les œufs"), "eggs");
});

Deno.test("le pluriel fautif du dernier mot seul : « flocons d'avoines » atteint « flocons d'avoine »", () => {
  assertEquals(slugOf("flocons d'avoines"), "oats");
  assertEquals(slugOf("des flocons d'avoines"), "oats");
});

Deno.test("⛔ rien n'est inventé : sans alias, l'article ôté ne résout rien", () => {
  assertEquals(slugOf("du lait"), null);
  assertEquals(slugOf("de la crème"), null);
  assertEquals(slugOf("du"), null);
});

Deno.test("les formes exactes passent toujours en premier", () => {
  assertEquals(slugOf("lait d'avoine"), "oat_milk");
  assertEquals(slugOf("graines"), "mixed_seeds");
});
