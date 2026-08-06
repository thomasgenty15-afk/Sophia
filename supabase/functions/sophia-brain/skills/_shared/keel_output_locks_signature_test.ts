import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  DOCTRINE_BLOCK_FALLBACK_EN,
  resolveDoctrineReplacement,
} from "./keel_output_locks.ts";

const FORBIDDEN = [
  { token: "grazing", surfaceForms: [], reason: null, instead: "Three real meals." },
  { token: "detox_tea", surfaceForms: [], reason: null, instead: null },
] as unknown as Parameters<typeof resolveDoctrineReplacement>[1];

Deno.test("les mots du coach sont signés de son nom", () => {
  const r = resolveDoctrineReplacement(["grazing"], FORBIDDEN, [], "Marlow");
  assertEquals(r.usedCoachWords, true);
  assertStringIncludes(r.text, "Three real meals.");
  // Suffixe, jamais préfixe: `instead` s'adresse déjà à l'élève, un « Marlow
  // dit : » y remettrait un narrateur.
  assertEquals(r.text.endsWith("— Marlow"), true);
});

// LA MOITIÉ QUI COMPTE. Le repli est NOTRE phrase; la signer ferait dire au
// coach ce qu'il n'a pas écrit, au pire moment.
Deno.test("le repli générique n'est JAMAIS signé", () => {
  const r = resolveDoctrineReplacement(["detox_tea"], FORBIDDEN, [], "Marlow");
  assertEquals(r.usedCoachWords, false);
  assertEquals(r.text, DOCTRINE_BLOCK_FALLBACK_EN);
});

Deno.test("pas de nom, pas de signature — jamais « — the coach »", () => {
  for (const name of [null, undefined, "", "   "]) {
    const r = resolveDoctrineReplacement(["grazing"], FORBIDDEN, [], name);
    assertEquals(r.text, "Three real meals.");
    assertEquals(r.usedCoachWords, true);
  }
});
