import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ALLERGEN_OPTIONS,
  allergenLabel,
  hasWideCoverage,
  normalizeAllergenInput,
  WIDE_COVERAGE_SLUGS,
} from "./allergens";

const ENGINE_CATALOG = "../../../../supabase/functions/_shared/keel/allergen_catalog.ts";

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
  const enginePath = resolve(__dirname, ENGINE_CATALOG);
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
      // ⚠️ ON PASSE PAR `allergenLabel` ET NON PAR `option.label`, QUI N'EXISTE
      // PLUS. La table portait ses phrases en dur — donc figées à la langue du
      // bundle — et porte maintenant des clés. Lire `t(option.labelKey)` ici
      // testerait la même chose, mais par un chemin qu'aucun écran n'emprunte;
      // `allergenLabel` est celui que les trois écrans appellent.
      expect(allergenLabel(option.slug).trim()).not.toBe("");
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

  it("tells surface-form coverage without claiming protection", () => {
    expect(hasWideCoverage("peanut")).toBe(true);
    expect(hasWideCoverage("PEANUT")).toBe(true);
    expect(hasWideCoverage("  peanut ")).toBe(true);
    // Hors table: le matcher le trouve toujours sur son propre mot. `false`
    // veut dire « seulement sous ce mot », jamais « non protégé ».
    expect(hasWideCoverage("kiwi")).toBe(false);
    expect(hasWideCoverage("")).toBe(false);
  });
});

describe("wide-coverage mirror", () => {
  // CE QUE CE BLOC EMPÊCHE. L'écran lisait la couverture dans le CATALOGUE —
  // ce qu'il propose — alors que la couverture est décidée par la table du
  // verrou. `milk`, `lactose`, `casein`, `eggs`, `soya`, `crustacean`,
  // `shrimp` sont couverts sans être proposés: un élève qui tapait « milk » en
  // saisie libre s'entendait dire « reconnu seulement sous ce mot », faux.

  it("mirrors exactly the slugs the engine covers", () => {
    const engine = engineSurfaceFormSlugs();
    expect(engine.length).toBeGreaterThan(0);
    // Les DEUX sens. Une clé manquante ici sous-annonce (prudent mais faux);
    // une clé de trop promettrait une reconnaissance large sur un slug que le
    // verrou ne connaît que nu — la panne grave, et la seule qui rassure.
    expect([...WIDE_COVERAGE_SLUGS].sort()).toEqual([...engine].sort());
  });

  it("claims wide coverage for every engine slug and for nothing else", () => {
    for (const slug of engineSurfaceFormSlugs()) {
      expect(hasWideCoverage(slug)).toBe(true);
    }
    // ⚠️ `fruits_de_mer` A QUITTÉ CETTE LISTE LE 2026-08-22 (lot `S1b`), et
    // c'est le sujet du lot, pas un ajustement de test. Il y figurait comme
    // exemple de saisie libre non couverte — or c'est le slug de DEUX lignes
    // réelles de `student_safety_constraints`, écrites le 2026-08-04, dont une
    // active. Le moteur porte désormais sa clé miroir; ce test rougissait
    // exactement comme il devait, et l'assertion qui compte est celle du
    // dessus: le miroir suit le moteur dans les DEUX sens.
    for (const outside of ["kiwi", "metformin", "nut_butter"]) {
      expect(hasWideCoverage(outside)).toBe(false);
    }
  });

  it("covers everything the catalog proposes", () => {
    // La promesse de la liste fermée: choisir dedans, c'est être reconnu sous
    // ses autres noms. Redite ici sur le prédicat que l'écran appelle vraiment.
    for (const option of ALLERGEN_OPTIONS) {
      expect(hasWideCoverage(option.slug)).toBe(true);
    }
  });
});

/**
 * LA RÈGLE DE NORMALISATION, ÉPROUVÉE PAR ÉQUIVALENCE ET PLUS PAR RESSEMBLANCE.
 *
 * Ce bloc pinnait des cas écrits à la main (« Fruits de mer » -> `fruits_de_mer`)
 * en disant qu'ils étaient « ceux de l'intake ». Ils ne l'étaient que par
 * copie: le moteur pouvait gagner une règle — les apostrophes, un plafond de
 * longueur, une translittération — sans qu'un seul test ne bouge, et le
 * formulaire aurait écrit un slug là où la conversation en écrivait un autre
 * POUR LE MÊME MOT. Deux contraintes pour une allergie déclarée une fois, et un
 * verrou qui n'en connaît qu'une.
 *
 * On EXTRAIT donc le corps de `normalizeAllergenRef` du fichier moteur et on le
 * fait tourner sur le même corpus. Vite/node ne peut pas importer ce module
 * Deno/JSR — mais la fonction est pure et sans import, donc son corps s'exécute
 * tel quel.
 */
function engineNormalizer(): (value: unknown) => string | null {
  const source = readFileSync(resolve(__dirname, ENGINE_CATALOG), "utf8");
  const block = source.match(
    /export function normalizeAllergenRef\(value: unknown\): string \| null \{([\s\S]*?)\n\}/,
  );
  if (!block) {
    throw new Error("normalizeAllergenRef not found in allergen_catalog.ts");
  }
  // ⚠️ LA FONCTION DÉPEND D'UNE CONSTANTE DE MODULE (2026-08-19). Le moteur a
  // gagné une table d'alias vivant hors du corps extrait; sans elle, le corps
  // se CONSTRUIT sans erreur puis jette `ReferenceError` À L'APPEL — c'est-à-dire
  // après le `try` ci-dessous, donc sans le message qui explique quoi faire.
  // On emporte donc la table avec le corps, en retirant son annotation de type.
  const aliases = source.match(
    /const ALLERGEN_REF_ALIASES[^=]*=\s*(\{[\s\S]*?\n\});/,
  );
  const prelude = aliases ? `const ALLERGEN_REF_ALIASES = ${aliases[1]};\n` : "";
  if (!aliases) {
    throw new Error(
      "ALLERGEN_REF_ALIASES introuvable dans allergen_catalog.ts — si la table " +
        "a été renommée ou retirée, adapter ce test AVANT de conclure que le " +
        "front est bon.",
    );
  }
  try {
    return new Function("value", prelude + block[1]) as (
      value: unknown,
    ) => string | null;
  } catch (error) {
    // Le corps a cessé d'être du JS exécutable tel quel (une annotation de
    // type sur une locale, un import). Le dire ainsi plutôt que de laisser une
    // SyntaxError nue: ce test est le seul lien entre les deux copies.
    throw new Error(
      `le corps de normalizeAllergenRef n'est plus exécutable hors Deno — ` +
        `adapter ce test AVANT de conclure que le front est bon: ${String(error)}`,
    );
  }
}

const NORMALISATION_CORPUS: readonly string[] = [
  "peanut",
  "Peanut",
  "PEANUT",
  "  peanut  ",
  "tree nut",
  "tree-nut",
  "  tree-nut ",
  "Tree_Nut",
  "tree--nut",
  "tree - nut",
  "Fruits de mer",
  "fruits  de   mer",
  "café  au lait",
  "crème fraîche",
  "jalapeño",
  "Peanut!",
  "peanut's",
  "peanut’s",
  "peanut/butter",
  "nut butter",
  "PB",
  "shellfish (all)",
  "e621",
  "50/50",
  "\tpeanut\n",
  "milk protein",
  "",
  "   ",
  "!!!",
  "---",
  "___",
  "😀",
  "peanut😀",
];

describe("free-text normalisation", () => {
  it("agrees with the engine rule on every input of the corpus", () => {
    const engine = engineNormalizer();
    for (const input of NORMALISATION_CORPUS) {
      expect(
        normalizeAllergenInput(input),
        `divergence sur ${JSON.stringify(input)}`,
      ).toEqual(engine(input));
    }
  });

  it("still pins the cases a reader needs to see", () => {
    // L'équivalence ci-dessus attraperait une dérive, mais elle ne dit pas ce
    // que la règle FAIT. Ces quatre-là restent lisibles à l'œil nu.
    // ⚠️ CHANGÉ LE 2026-08-19: « Fruits de mer » se ramène désormais sur le
    // jeton `shellfish` (table d'alias fermée) au lieu de rester un slug sans
    // aucune couverture de formes de surface — donc sans protection.
    expect(normalizeAllergenInput("Fruits de mer")).toBe("shellfish");
    expect(normalizeAllergenInput("  tree-nut ")).toBe("tree_nut");
    expect(normalizeAllergenInput("Peanut!")).toBe("peanut");
    // ⚠️ CHANGÉ LE 2026-08-19: les accents sont désormais REPLIÉS et non
    // supprimés — « café » garde son `e`. Le défaut réparé mutilait cinq des
    // quatorze allergènes majeurs tapés en français.
    expect(normalizeAllergenInput("café  au lait")).toBe("cafe_au_lait");
  });

  it("returns null on anything that cannot become a slug", () => {
    expect(normalizeAllergenInput("")).toBeNull();
    expect(normalizeAllergenInput("   ")).toBeNull();
    expect(normalizeAllergenInput("!!!")).toBeNull();
  });

  it("survives a nullish value the type forbids but the DOM can produce", () => {
    // La signature moteur prend `unknown`, celle du front prend `string`. Le
    // cast est délibéré: un champ non contrôlé, un état réinitialisé, et la
    // valeur arrive quand même. Le corps la gère — on le vérifie plutôt que de
    // le supposer.
    const engine = engineNormalizer();
    for (const nullish of [null, undefined]) {
      expect(normalizeAllergenInput(nullish as unknown as string)).toBeNull();
      expect(engine(nullish)).toBeNull();
    }
  });
});
