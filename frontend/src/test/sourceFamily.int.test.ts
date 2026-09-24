import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readSourceFamilies, REPO_ROOT, SOURCE_FAMILIES_PATH, sourceFamily } from "./sourceFamily";

// Le contrat du helper vitest, sur un registre FOURNI (2026-09-24). Le registre
// du dépôt a des listes vides tant qu'aucun lot n'a déplacé de code: sans ces
// cas-là, l'ordre et l'erreur ne seraient vérifiés par personne côté node. Le
// registre lui-même (modules existants et importés par leur origine) est vérifié
// par `supabase/functions/_shared/keel/source_family_registry_test.ts`.

const HELPER = "frontend/src/test/sourceFamily.ts";
const SELF = "frontend/src/test/sourceFamily.int.test.ts";
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

describe("sourceFamily — la famille d'un fichier source", () => {
  it("rend les modules dans l'ordre du registre, puis l'origine en dernier", () => {
    const families = { [HELPER]: [SOURCE_FAMILIES_PATH, SELF] };
    const expected = [read(SOURCE_FAMILIES_PATH), read(SELF), read(HELPER)].join("\n");
    expect(sourceFamily(HELPER, families)).toBe(expected);
    expect(sourceFamily(new URL("./sourceFamily.ts", import.meta.url), families)).toBe(expected);
    expect(sourceFamily(resolve(REPO_ROOT, HELPER), families)).toBe(expected);
  });

  it("un chemin absent du registre rend le fichier seul", () => {
    expect(sourceFamily(SELF, {})).toBe(read(SELF));
  });

  it("un module listé qui n'existe pas lève une erreur qui le nomme", () => {
    const ghost = "frontend/src/test/module_qui_n_existe_pas.ts";
    expect(() => sourceFamily(HELPER, { [HELPER]: [ghost] })).toThrow(ghost);
  });

  it("le registre du dépôt se lit, et chaque valeur est une liste", () => {
    const families = readSourceFamilies();
    expect(Object.keys(families).length).toBeGreaterThan(0);
    for (const modules of Object.values(families)) expect(Array.isArray(modules)).toBe(true);
  });
});
