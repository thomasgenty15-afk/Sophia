/**
 * ⟳ 2026-09-24 — LES PACKS DÉCOUPÉS PAR NAMESPACE : AUCUNE CLÉ PERDUE, AUCUNE
 * CLÉ EN DOUBLE.
 *
 * `en.ts` et `fr.ts` n'écrivent plus leurs clés : ils assemblent des morceaux,
 * un par namespace (`en/household.ts`, `fr/household.ts`…), par `...`.
 *
 * ⛔ LE DÉFAUT QUE CE TEST FERME. Dans UN objet littéral, une clé écrite deux
 * fois est une erreur de compilation. Entre deux morceaux étalés par `...`, elle
 * ne l'est plus : la dernière gagne, en silence, et la première phrase disparaît
 * de l'écran sans qu'aucun compilateur ne le dise. Ce test compte donc : la
 * somme des tailles des morceaux doit être égale au nombre de clés du pack, et
 * aucune clé ne doit apparaître dans deux morceaux.
 *
 * Il tient aussi deux règles de rangement, pour que « où vit la clé x.y » ait
 * une seule réponse (`<langue>/x.ts`) : un morceau ne porte que son namespace,
 * et chaque morceau est inscrit dans `scripts/source-families.json` — c'est ce
 * registre que lisent les tests qui cherchent du TEXTE dans les packs; un
 * morceau oublié rendrait muets ceux qui vérifient qu'un texte est ABSENT.
 */
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import { readSourceFamilies } from "../../test/sourceFamily";

type Chunk = {
  file: string;
  namespace: string;
  exportNames: string[];
  values: Record<string, string>;
  keys: string[];
};

function chunksOf(modules: Record<string, unknown>): Chunk[] {
  return Object.entries(modules).map(([file, mod]) => {
    const exports = Object.entries(mod as Record<string, Record<string, string>>);
    const values = exports[0]?.[1] ?? {};
    return {
      file,
      namespace: file.replace(/^.*\//, "").replace(/\.ts$/, ""),
      exportNames: exports.map(([name]) => name),
      values,
      keys: Object.keys(values),
    };
  });
}

/** Les clés présentes dans plus d'un morceau, avec les morceaux qui les portent. */
function duplicatedKeys(chunks: Chunk[]): string[] {
  const where = new Map<string, string[]>();
  for (const chunk of chunks) {
    for (const key of chunk.keys) where.set(key, [...(where.get(key) ?? []), chunk.file]);
  }
  return [...where].filter(([, files]) => files.length > 1).map(([key, files]) => `${key}: ${files.join(", ")}`);
}

const PACKS = [
  {
    lang: "en" as const,
    pack: en as Record<string, string>,
    chunks: chunksOf(import.meta.glob("./en/*.ts", { eager: true })),
  },
  {
    lang: "fr" as const,
    pack: fr as Record<string, string>,
    chunks: chunksOf(import.meta.glob("./fr/*.ts", { eager: true })),
  },
];

describe.each(PACKS)("le pack $lang, découpé par namespace", ({ lang, pack, chunks }) => {
  it("a des morceaux (le motif du dossier trouve bien les fichiers)", () => {
    // La ceinture de la ceinture: un motif qui ne trouve rien rendrait les deux
    // cas suivants vrais sur un ensemble vide.
    expect(chunks.length).toBeGreaterThan(50);
  });

  it("aucune clé n'apparaît dans deux morceaux", () => {
    expect(duplicatedKeys(chunks)).toEqual([]);
  });

  it("la somme des tailles des morceaux est le nombre de clés du pack", () => {
    const sum = chunks.reduce((n, chunk) => n + chunk.keys.length, 0);
    expect(sum).toBe(Object.keys(pack).length);
  });

  it("chaque clé d'un morceau est dans le pack, avec la même phrase", () => {
    // Un morceau écrit mais pas étalé dans le fichier d'assemblage échoue ici.
    const missing: string[] = [];
    for (const chunk of chunks) {
      for (const key of chunk.keys) {
        if (pack[key] !== chunk.values[key]) missing.push(`${key} (${chunk.file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("un morceau exporte un seul objet, ne porte que son namespace, et son export dit lequel", () => {
    const misplaced: string[] = [];
    for (const chunk of chunks) {
      const expected = lang + chunk.namespace.split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
      if (chunk.exportNames.join() !== expected) {
        misplaced.push(`${chunk.file}: exporte [${chunk.exportNames.join(", ")}], attendu ${expected}`);
      }
      for (const key of chunk.keys) {
        if (key.split(".")[0] !== chunk.namespace) misplaced.push(`${key} dans ${chunk.file}`);
      }
    }
    expect(misplaced).toEqual([]);
  });

  it("chaque morceau est inscrit dans la famille du pack (scripts/source-families.json)", () => {
    const registered = readSourceFamilies()[`frontend/src/keel/i18n/${lang}.ts`] ?? [];
    const onDisk = chunks.map((c) => `frontend/src/keel/i18n/${lang}/${c.namespace}.ts`);
    expect([...registered].sort()).toEqual([...onDisk].sort());
  });
});
