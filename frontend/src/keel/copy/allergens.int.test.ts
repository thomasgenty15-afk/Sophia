import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ALLERGEN_OPTIONS,
  allergenLabel,
  isCatalogAllergen,
  normalizeAllergenInput,
} from "./allergens";

/**
 * LE TEST DE DÉRIVE. Le catalogue est déclaré dans le moteur et rendu ici, et
 * rien d'autre que ce test ne relie les deux fichiers. Il LIT la source du
 * moteur au lieu de l'importer: c'est du Deno/JSR qu'un test Vite/node ne peut
 * pas charger, et lire la déclaration suffit à attraper la panne qui arrive
 * vraiment — un allergène ajouté d'un seul côté.
 *
 * L'enjeu n'est pas cosmétique. Un slug proposé ici mais absent de
 * `ALLERGEN_SURFACE_FORMS` promettrait à l'élève d'être reconnu sous ses autres
 * noms alors que le verrou ne connaîtrait que le mot brut.
 */
function engineCatalogSlugs(): string[] {
  const enginePath = resolve(
    __dirname,
    "../../../../supabase/functions/_shared/keel/allergen_catalog.ts",
  );
  const source = readFileSync(enginePath, "utf8");
  const block = source.match(
    /export const ALLERGEN_CATALOG: readonly AllergenCatalogEntry\[\] = \[([\s\S]*?)\] as const;/,
  );
  if (!block) throw new Error("ALLERGEN_CATALOG not found in allergen_catalog.ts");
  return [...block[1].matchAll(/slug:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

function engineSurfaceFormSlugs(): string[] {
  const enginePath = resolve(
    __dirname,
    "../../../../supabase/functions/_shared/keel/allergen_surface_forms.ts",
  );
  const source = readFileSync(enginePath, "utf8");
  const block = source.match(
    /export const ALLERGEN_SURFACE_FORMS: Readonly<[\s\S]*?> = \{([\s\S]*?)\n\};/,
  );
  if (!block) {
    throw new Error("ALLERGEN_SURFACE_FORMS not found in allergen_surface_forms.ts");
  }
  return [...block[1].matchAll(/^\s{2}([a-z0-9_]+):/gm)].map((m) => m[1]);
}

describe("allergen catalog mirror", () => {
  it("proposes exactly what the engine proposes, in the same order", () => {
    const engine = engineCatalogSlugs();
    expect(engine.length).toBeGreaterThan(0);
    expect(ALLERGEN_OPTIONS.map((o) => o.slug)).toEqual(engine);
  });

  it("every proposed allergen is covered by surface forms", () => {
    // La promesse de l'écran, vérifiée contre la table qui la tient.
    const covered = new Set(engineSurfaceFormSlugs());
    expect(covered.size).toBeGreaterThan(0);
    const uncovered = ALLERGEN_OPTIONS
      .map((o) => o.slug)
      .filter((slug) => !covered.has(slug));
    expect(uncovered).toEqual([]);
  });

  it("has no duplicate slug and no empty label", () => {
    const slugs = ALLERGEN_OPTIONS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const option of ALLERGEN_OPTIONS) {
      expect(option.label.trim()).not.toBe("");
    }
  });
});

describe("allergen display", () => {
  it("names a catalog allergen with its label", () => {
    expect(allergenLabel("peanut")).toBe("Peanuts");
    expect(allergenLabel("tree_nut")).toBe("Tree nuts");
  });

  it("still displays a free-text allergen instead of throwing", () => {
    // Contrairement à `labels.ts`, l'inconnu est ATTENDU ici: ce sont les
    // saisies libres. Une allergie qu'on refuse d'afficher est une allergie que
    // l'élève croit absente.
    expect(allergenLabel("fruits_de_mer")).toBe("Fruits de mer");
    expect(allergenLabel("kiwi")).toBe("Kiwi");
    expect(allergenLabel("")).toBe("—");
  });

  it("tells catalog membership without claiming protection", () => {
    expect(isCatalogAllergen("peanut")).toBe(true);
    expect(isCatalogAllergen("PEANUT")).toBe(true);
    expect(isCatalogAllergen("kiwi")).toBe(false);
    expect(isCatalogAllergen("")).toBe(false);
  });
});

describe("free-text normalisation", () => {
  it("matches the conversational intake, character for character", () => {
    // Divergence = deux contraintes pour un mot, et un verrou qui n'en connaît
    // qu'une.
    expect(normalizeAllergenInput("Fruits de mer")).toBe("fruits_de_mer");
    expect(normalizeAllergenInput("  tree-nut ")).toBe("tree_nut");
    expect(normalizeAllergenInput("Peanut!")).toBe("peanut");
    expect(normalizeAllergenInput("café  au lait")).toBe("caf_au_lait");
  });

  it("returns null on anything that cannot become a slug", () => {
    expect(normalizeAllergenInput("")).toBeNull();
    expect(normalizeAllergenInput("   ")).toBeNull();
    expect(normalizeAllergenInput("!!!")).toBeNull();
  });
});
