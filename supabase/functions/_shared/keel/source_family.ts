// ═══════════════════════════════════════════════════════════════════════════
// LA FAMILLE D'UN FICHIER SOURCE — CE QU'UN TEST LIT QUAND IL LIT DU CODE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POURQUOI CE FICHIER EXISTE (2026-09-24) ─────────────────────────────────
// Environ deux cents tests lisent le TEXTE d'un fichier de code et y cherchent
// des chaînes. Tant que le code reste dans ce fichier, ça tient. Le jour où on
// découpe un gros fichier et qu'un bloc part dans un module voisin:
//
//   - un test qui exige qu'un texte soit PRÉSENT casse — on le voit;
//   - un test qui exige qu'un texte soit ABSENT (`!src.includes(...)`,
//     `assertFalse`) reste VERT et ne vérifie plus rien — on ne le voit pas.
//     Le texte interdit peut revenir dans le module sorti, personne ne lit ce
//     module.
//
// La parade: un test ne lit plus « le fichier », il lit « la famille » du
// fichier — les modules qu'on en a sortis, puis le fichier d'origine. La liste
// des modules vit à UN seul endroit, `scripts/source-families.json`, lu aussi
// par le helper vitest (`frontend/src/test/sourceFamily.ts`, même contrat).
//
// ── LE CONTRAT ──────────────────────────────────────────────────────────────
// `sourceFamily(chemin)` rend le texte des modules de la famille, dans l'ordre
// du registre, PUIS le texte du fichier d'origine en dernier, séparés par un
// saut de ligne. Un chemin absent du registre rend le texte du fichier seul:
// on peut donc l'appeler partout.
//
// Le chemin s'écrit depuis la racine du dépôt
// (`supabase/functions/_shared/keel/meal_generation.ts`). Une `URL` en
// `file:` est aussi acceptée, pour que `Deno.readTextFile(new URL(x,
// import.meta.url))` se remplace sans réécrire le chemin.
//
// ⛔ Un module listé qui n'existe pas LÈVE une erreur, il n'est pas sauté: un
// module sauté en silence rendrait la famille plus petite que le code, et le
// test d'absence redeviendrait muet. `source_family_registry_test.ts` vérifie
// en plus que chaque module listé est bien importé par son fichier d'origine.
//
// Ce module ne sert qu'aux tests. Il n'importe rien (ni `jsr:` ni `npm:`).

/** Le registre: chemin d'origine → modules sortis, dans l'ordre. */
export type SourceFamilies = Record<string, string[]>;

/** La racine du dépôt, retrouvée depuis ce fichier. */
export const REPO_ROOT = new URL("../../../../", import.meta.url);

/** Le registre, relu à chaque appel (un fichier de quelques lignes). */
export const SOURCE_FAMILIES_PATH = "scripts/source-families.json";

export function readSourceFamilies(): SourceFamilies {
  const url = new URL(SOURCE_FAMILIES_PATH, REPO_ROOT);
  const parsed: unknown = JSON.parse(Deno.readTextFileSync(url));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`source_family: ${SOURCE_FAMILIES_PATH} doit être un objet { chemin: [modules] }`);
  }
  for (const [origin, modules] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(modules) || !modules.every((m) => typeof m === "string")) {
      throw new Error(
        `source_family: dans ${SOURCE_FAMILIES_PATH}, la valeur de « ${origin} » doit être une liste de chemins`,
      );
    }
  }
  return parsed as SourceFamilies;
}

/**
 * Le chemin depuis la racine du dépôt. Accepte ce chemin lui-même, un chemin
 * absolu du disque, ou une `URL` en `file:`. Un fichier hors du dépôt rend son
 * chemin absolu (il ne sera jamais dans le registre).
 */
export function repoRelativePath(file: string | URL): string {
  const url = typeof file === "string"
    ? (file.startsWith("/") ? new URL(file, "file:///") : new URL(file, REPO_ROOT))
    : new URL(file.href);
  if (url.protocol !== "file:") {
    throw new Error(`source_family: « ${url.href} » n'est pas un fichier local`);
  }
  return url.href.startsWith(REPO_ROOT.href)
    ? decodeURIComponent(url.href.slice(REPO_ROOT.href.length))
    : decodeURIComponent(url.pathname);
}

/** Les modules sortis du fichier, dans l'ordre du registre ([] s'il n'y est pas). */
export function familyModules(
  file: string | URL,
  families: SourceFamilies = readSourceFamilies(),
): string[] {
  return families[repoRelativePath(file)] ?? [];
}

function readRepoFile(rel: string): string {
  return Deno.readTextFileSync(rel.startsWith("/") ? new URL(rel, "file:///") : new URL(rel, REPO_ROOT));
}

/** Version synchrone de `sourceFamily`, pour remplacer `Deno.readTextFileSync`. */
export function sourceFamilySync(
  file: string | URL,
  families: SourceFamilies = readSourceFamilies(),
): string {
  const origin = repoRelativePath(file);
  const parts: string[] = [];
  for (const module of families[origin] ?? []) {
    try {
      parts.push(readRepoFile(module));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw new Error(
          `source_family: ${SOURCE_FAMILIES_PATH} range « ${module} » dans la famille de ` +
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

/** Le texte de la famille: modules sortis dans l'ordre, puis le fichier d'origine. */
export function sourceFamily(
  file: string | URL,
  families?: SourceFamilies,
): Promise<string> {
  try {
    return Promise.resolve(sourceFamilySync(file, families));
  } catch (e) {
    return Promise.reject(e);
  }
}
