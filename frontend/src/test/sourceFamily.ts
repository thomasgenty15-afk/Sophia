import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════════════════════
// LA FAMILLE D'UN FICHIER SOURCE — CE QU'UN TEST LIT QUAND IL LIT DU CODE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POURQUOI CE FICHIER EXISTE (2026-09-24) ─────────────────────────────────
// Beaucoup de tests lisent le TEXTE d'un fichier de code et y cherchent des
// chaînes. Le jour où on découpe un gros fichier et qu'un bloc part dans un
// module voisin:
//
//   - un test qui exige qu'un texte soit PRÉSENT casse — on le voit;
//   - un test qui exige qu'un texte soit ABSENT (`not.toContain`) reste VERT
//     et ne vérifie plus rien — on ne le voit pas. Le texte interdit peut
//     revenir dans le module sorti, personne ne lit ce module.
//
// La parade: un test ne lit plus « le fichier », il lit « la famille » du
// fichier — les modules qu'on en a sortis, puis le fichier d'origine. La liste
// des modules vit à UN seul endroit, `scripts/source-families.json`, lu aussi
// par le helper Deno (`supabase/functions/_shared/keel/source_family.ts`, même
// contrat).
//
// ── LE CONTRAT ──────────────────────────────────────────────────────────────
// `sourceFamily(chemin)` rend le texte des modules de la famille, dans l'ordre
// du registre, PUIS le texte du fichier d'origine en dernier, séparés par un
// saut de ligne. Un chemin absent du registre rend le texte du fichier seul:
// on peut donc l'appeler partout.
//
// Le chemin s'écrit depuis la racine du dépôt
// (`frontend/src/keel/pages/SetupPage.tsx`). Un chemin absolu ou une `URL` en
// `file:` sont aussi acceptés, pour que `readFileSync(resolve(__dirname, x))`
// ou `readFileSync(new URL(x, import.meta.url))` se remplacent sans réécrire le
// chemin.
//
// ⛔ Un module listé qui n'existe pas LÈVE une erreur, il n'est pas sauté: un
// module sauté en silence rendrait la famille plus petite que le code, et le
// test d'absence redeviendrait muet. Le test Deno
// `source_family_registry_test.ts` vérifie en plus que chaque module listé est
// bien importé par son fichier d'origine.
//
// Ce fichier n'est pas un test (vitest ne lit que `*.int.test.ts`); il est
// typechecké par `tsconfig.test.json` (`src/test/**`).

/** Le registre: chemin d'origine → modules sortis, dans l'ordre. */
export type SourceFamilies = Record<string, string[]>;

/** La racine du dépôt, retrouvée depuis ce fichier (`frontend/src/test/`). */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export const SOURCE_FAMILIES_PATH = "scripts/source-families.json";

/** Le registre, relu à chaque appel (un fichier de quelques lignes). */
export function readSourceFamilies(): SourceFamilies {
  const parsed: unknown = JSON.parse(readFileSync(resolve(REPO_ROOT, SOURCE_FAMILIES_PATH), "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`sourceFamily: ${SOURCE_FAMILIES_PATH} doit être un objet { chemin: [modules] }`);
  }
  for (const [origin, modules] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(modules) || !modules.every((m) => typeof m === "string")) {
      throw new Error(
        `sourceFamily: dans ${SOURCE_FAMILIES_PATH}, la valeur de « ${origin} » doit être une liste de chemins`,
      );
    }
  }
  return parsed as SourceFamilies;
}

/**
 * Le chemin depuis la racine du dépôt (séparateur `/`). Accepte ce chemin
 * lui-même, un chemin absolu, ou une `URL` en `file:`. Un fichier hors du dépôt
 * rend son chemin absolu (il ne sera jamais dans le registre).
 */
export function repoRelativePath(file: string | URL): string {
  const abs = typeof file === "string"
    ? (isAbsolute(file) ? resolve(file) : resolve(REPO_ROOT, file))
    : fileURLToPath(file);
  const rel = relative(REPO_ROOT, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return abs;
  return rel.split(sep).join("/");
}

/** Les modules sortis du fichier, dans l'ordre du registre ([] s'il n'y est pas). */
export function familyModules(
  file: string | URL,
  families: SourceFamilies = readSourceFamilies(),
): string[] {
  return families[repoRelativePath(file)] ?? [];
}

function readRepoFile(rel: string): string {
  return readFileSync(isAbsolute(rel) ? rel : resolve(REPO_ROOT, rel), "utf8");
}

/** Le texte de la famille: modules sortis dans l'ordre, puis le fichier d'origine. */
export function sourceFamily(
  file: string | URL,
  families: SourceFamilies = readSourceFamilies(),
): string {
  const origin = repoRelativePath(file);
  const parts: string[] = [];
  for (const module of families[origin] ?? []) {
    try {
      parts.push(readRepoFile(module));
    } catch (e) {
      if ((e as { code?: string }).code === "ENOENT") {
        throw new Error(
          `sourceFamily: ${SOURCE_FAMILIES_PATH} range « ${module} » dans la famille de ` +
            `« ${origin} », mais ce fichier n'existe pas. Corrige le registre: un module ` +
            `sauté rendrait muets les tests qui vérifient qu'un texte est ABSENT.`,
        );
      }
      throw e;
    }
  }
  parts.push(readRepoFile(origin));
  return parts.join("\n");
}
