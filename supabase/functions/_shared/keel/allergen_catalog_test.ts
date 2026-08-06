// LE CATALOGUE ET LA TABLE QUI DÉCIDE — le test de dérive.
//
// Le catalogue est ce qu'un formulaire PROPOSE; `ALLERGEN_SURFACE_FORMS` est ce
// que le verrou SAIT TENIR. Le jour où les deux divergent, le produit propose un
// allergène en promettant une protection forte qu'il n'a pas — c'est-à-dire le
// pire des deux mondes, et en silence.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ALLERGEN_CATALOG,
  hasSurfaceFormCoverage,
  normalizeAllergenRef,
} from "./allergen_catalog.ts";
import { ALLERGEN_SURFACE_FORMS } from "./allergen_surface_forms.ts";

Deno.test("tout ce que le catalogue propose est couvert par des formes de surface", () => {
  // C'est LA promesse du catalogue: choisir dans la liste = être reconnu sous
  // ses autres noms. Une entrée sans formes de surface la romprait en silence.
  for (const entry of ALLERGEN_CATALOG) {
    assert(
      hasSurfaceFormCoverage(entry.slug),
      `'${entry.slug}' est proposé mais n'a aucune forme de surface — la ` +
        `protection promise serait plus faible que ce que l'écran dit`,
    );
  }
});

Deno.test("le catalogue n'invente aucun slug hors de la table", () => {
  for (const entry of ALLERGEN_CATALOG) {
    assert(
      entry.slug in ALLERGEN_SURFACE_FORMS,
      `'${entry.slug}' n'existe pas dans ALLERGEN_SURFACE_FORMS`,
    );
  }
});

Deno.test("aucun doublon de slug, et aucun libellé vide", () => {
  const slugs = ALLERGEN_CATALOG.map((e) => e.slug);
  assertEquals(
    slugs.length,
    new Set(slugs).size,
    "deux entrées pour le même slug donneraient deux cases pour un danger",
  );
  for (const entry of ALLERGEN_CATALOG) {
    assert(entry.label.trim() !== "", `'${entry.slug}' n'a pas de libellé`);
    // R1: le slug est de la donnée ASCII, le libellé est de la prose.
    assertEquals(entry.slug, entry.slug.toLowerCase());
    assert(/^[a-z0-9_]+$/.test(entry.slug), `'${entry.slug}' n'est pas un slug`);
  }
});

Deno.test("les alias du même danger ne sont pas proposés deux fois", () => {
  // `dairy` / `milk` / `lactose` / `casein` portent les mêmes formes de surface.
  // En proposer plusieurs demanderait à l'élève un arbitrage clinique qui n'est
  // pas le sien.
  const proposed = new Set(ALLERGEN_CATALOG.map((e) => e.slug));
  for (const family of [["dairy", "milk", "lactose", "casein"], ["egg", "eggs"], ["soy", "soya"]]) {
    const shown = family.filter((slug) => proposed.has(slug));
    assertEquals(
      shown.length,
      1,
      `la famille ${family.join("/")} est proposée ${shown.length} fois: ${shown.join(", ")}`,
    );
  }
});

Deno.test("aucune clé vide: la CLÉ suffit à décider de la couverture", () => {
  // LE PONT AVEC LE MIROIR NAVIGATEUR. `frontend/src/keel/copy/allergens.ts`
  // ne peut mirroir que les CLÉS de la table (il ne charge pas ce module
  // Deno/JSR), alors que `hasSurfaceFormCoverage` exige AUSSI un tableau non
  // vide. Les deux prédicats ne coïncident que tant qu'aucune clé n'est vide —
  // sinon le front dirait « reconnu sous ses autres noms » là où le moteur dit
  // non, c'est-à-dire une promesse de protection que le verrou ne tient pas.
  for (const [slug, forms] of Object.entries(ALLERGEN_SURFACE_FORMS)) {
    assert(forms.length > 0, `'${slug}' est une clé sans aucune forme de surface`);
    assertEquals(
      hasSurfaceFormCoverage(slug),
      true,
      `'${slug}' est une clé de la table mais n'est pas rendu couvert`,
    );
  }
});

Deno.test("hasSurfaceFormCoverage dit la couverture, jamais « protégé »", () => {
  assertEquals(hasSurfaceFormCoverage("peanut"), true);
  // Un slug hors table: le matcher le trouve toujours sur son propre mot, mais
  // pas sous un autre nom. La fonction rend `false`, et l'appelant doit dire
  // « reconnu seulement sous ce mot », pas « non protégé ».
  assertEquals(hasSurfaceFormCoverage("kiwi"), false);
  assertEquals(hasSurfaceFormCoverage(""), false);
  assertEquals(hasSurfaceFormCoverage("   "), false);
  assertEquals(hasSurfaceFormCoverage("PEANUT"), true, "la casse ne décide pas");
});

Deno.test("la normalisation du formulaire est celle de la conversation", () => {
  // Divergence = deux contraintes pour un mot, et un verrou qui n'en connaît
  // qu'une. Ces cas étaient ceux de `declare_safety_constraint/intake.ts ::
  // normalizeRef`, qui portait sa propre copie identique; l'intake IMPORTE
  // maintenant cette fonction-ci, donc ces assertions pinnent la seule règle
  // qui reste côté moteur.
  assertEquals(normalizeAllergenRef("Fruits de mer"), "fruits_de_mer");
  assertEquals(normalizeAllergenRef("  tree-nut "), "tree_nut");
  assertEquals(normalizeAllergenRef("Peanut!"), "peanut");
  assertEquals(normalizeAllergenRef("café  au lait"), "caf_au_lait");
  assertEquals(normalizeAllergenRef(""), null);
  assertEquals(normalizeAllergenRef("   "), null);
  assertEquals(normalizeAllergenRef("!!!"), null);
  assertEquals(normalizeAllergenRef(null), null);
  assertEquals(normalizeAllergenRef(undefined), null);
});
