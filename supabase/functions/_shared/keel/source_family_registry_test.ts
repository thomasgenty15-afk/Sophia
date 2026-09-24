import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  readSourceFamilies,
  REPO_ROOT,
  repoRelativePath,
  SOURCE_FAMILIES_PATH,
  sourceFamily,
  sourceFamilySync,
} from "./source_family.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE REGISTRE DES FAMILLES NE MENT PAS (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
//
// `scripts/source-families.json` dit, pour chaque gros fichier découpé, quels
// modules en sont sortis. Les tests qui lisent du code lisent la famille
// entière (`source_family.ts`). Un registre faux les rendrait faux à leur tour:
//
//   - un module listé qui n'existe pas: `sourceFamily` lève, tout rougit — ce
//     test le dit d'abord, avec le nom;
//   - un module listé que le fichier d'origine n'importe PAS: il n'est pas sorti
//     de ce fichier-là, le lire avec lui ne prouve rien sur lui.
//
// Chaque module doit donc exister ET être importé ou ré-exporté DIRECTEMENT par
// le fichier d'origine (un `from "./x.ts"` / `import "./x.ts"` dont le chemin
// relatif pointe dessus).

/** Les chemins relatifs importés ou ré-exportés par un texte, résolus. */
function relativeImportsOf(originRel: string, text: string): Set<string> {
  const base = new URL(originRel, REPO_ROOT);
  const out = new Set<string>();
  const re = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
  for (const m of text.matchAll(re)) {
    out.add(repoRelativePath(new URL(m[1], base)));
  }
  return out;
}

function fileExists(rel: string): boolean {
  try {
    return Deno.statSync(new URL(rel, REPO_ROOT)).isFile;
  } catch {
    return false;
  }
}

Deno.test("registre des familles — chaque origine existe, chaque module existe et est importé par son origine", () => {
  const families = readSourceFamilies();
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const [origin, modules] of Object.entries(families)) {
    if (!fileExists(origin)) {
      problems.push(`« ${origin} »: le fichier d'origine n'existe pas`);
      continue;
    }
    const imported = relativeImportsOf(origin, Deno.readTextFileSync(new URL(origin, REPO_ROOT)));
    for (const module of modules) {
      if (module === origin) problems.push(`« ${origin} »: se liste lui-même comme module`);
      const before = seen.get(module);
      if (before !== undefined) {
        problems.push(`« ${module} » est listé deux fois (familles « ${before} » et « ${origin} »)`);
      }
      seen.set(module, origin);
      if (!fileExists(module)) {
        problems.push(`« ${origin} »: le module « ${module} » n'existe pas`);
        continue;
      }
      if (!imported.has(module)) {
        problems.push(
          `« ${origin} »: le module « ${module} » n'est ni importé ni ré-exporté directement ` +
            `par le fichier d'origine`,
        );
      }
    }
  }
  assertEquals(
    problems,
    [],
    `\n${SOURCE_FAMILIES_PATH} ment:\n  ${problems.join("\n  ")}\n` +
      `Corrige le registre (ou l'import manquant dans le fichier d'origine).`,
  );
});

// ── LE CONTRAT DU HELPER, SUR UN REGISTRE FOURNI ───────────────────────────
// Le registre du dépôt a des listes vides tant qu'aucun lot n'a déplacé de
// code: sans ces cas-là, l'ordre et l'erreur ne seraient vérifiés par personne.

const HELPER = "supabase/functions/_shared/keel/source_family.ts";
const TEST_SELF = "supabase/functions/_shared/keel/source_family_registry_test.ts";

Deno.test("sourceFamily — modules dans l'ordre du registre, puis l'origine en dernier", async () => {
  const families = { [HELPER]: [SOURCE_FAMILIES_PATH, TEST_SELF] };
  const read = (rel: string) => Deno.readTextFileSync(new URL(rel, REPO_ROOT));
  const expected = [read(SOURCE_FAMILIES_PATH), read(TEST_SELF), read(HELPER)].join("\n");
  assertEquals(sourceFamilySync(HELPER, families), expected);
  assertEquals(await sourceFamily(new URL(HELPER, REPO_ROOT), families), expected);
});

Deno.test("sourceFamily — un chemin absent du registre rend le fichier seul", () => {
  const text = Deno.readTextFileSync(new URL(TEST_SELF, REPO_ROOT));
  assertEquals(sourceFamilySync(TEST_SELF, {}), text);
  assertEquals(sourceFamilySync(new URL("./source_family_registry_test.ts", import.meta.url), {}), text);
});

Deno.test("sourceFamily — un module listé qui n'existe pas lève une erreur qui le nomme", () => {
  const ghost = "supabase/functions/_shared/keel/module_qui_n_existe_pas.ts";
  const err = assertThrows(() => sourceFamilySync(HELPER, { [HELPER]: [ghost] }), Error);
  assert(err.message.includes(ghost), err.message);
  assert(err.message.includes(HELPER), err.message);
});
