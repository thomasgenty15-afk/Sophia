// LE GARDE-FRONTIÈRE ENTRE LES DEUX RUNTIMES, sur le pont mémoire → plan.
//
// `foodPreferences.ts` recopie des constantes qui vivent dans
// `supabase/functions/_shared/keel/food_preference_promotion.ts`. Le front est
// en Vite/TS, le back en Deno : aucun import n'est possible entre les deux,
// donc la copie est assumée. Ce fichier est ce qui l'empêche de dériver — il
// LIT le module Deno sur le disque et compare.
//
// ── LE DÉFAUT QUE ÇA INTERDIT, ET IL EST ASYMÉTRIQUE ────────────────────────
// Les deux sens font mal, et ils ne font pas mal pareil :
//   · une clé que l'ÉCRAN propose et que le SERVEUR ignore → l'élève garde une
//     ligne qui n'atteindra jamais le générateur. Il a cliqué dans le vide, et
//     rien ne le lui dit ;
//   · une clé que le SERVEUR accepte et que l'écran ne demande pas → la
//     contrainte existe, elle est promouvable, et personne ne la voit jamais
//     passer. C'est exactement le trou que l'élargissement du 2026-08-06 ferme.
//
// Aucun typecheck, aucun test de chaque côté ne voit ça : les deux sont verts
// séparément. C'est la version « deux runtimes » du défaut n°1 de ce dépôt.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_DISMISSED,
  MIN_CONFIDENCE,
  PROMOTABLE_DOMAIN_KEYS,
  PROPOSABLE_STATUSES,
} from "./foodPreferences";

const BACKEND = readFileSync(
  resolve(
    __dirname,
    "../../../../supabase/functions/_shared/keel/food_preference_promotion.ts",
  ),
  "utf8",
);

const TAXONOMY = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../supabase/functions/_shared/memory/domain_keys.v1.json",
    ),
    "utf8",
  ),
) as { keys: Array<{ key: string }> };

/**
 * Les chaînes littérales d'un `const NAME = [ ... ]` du module Deno.
 *
 * Exporté ou non : certaines de ces listes sont internes au module serveur
 * (`PROMOTABLE_STATUSES`), et exiger `export` ici ferait échouer le garde sur
 * une différence de visibilité qui ne regarde pas le contrat.
 */
function backendArray(name: string): string[] {
  const at = BACKEND.search(new RegExp(`(?:export )?const ${name}\\b`));
  if (at < 0) throw new Error(`${name} introuvable côté serveur`);
  // ⚠️ ON PART DU `=`, PAS DU NOM. L'annotation de type `: readonly string[]`
  // porte elle-même une paire de crochets : chercher le premier `[` après le
  // nom tombait dessus, le premier `]` la fermait, et l'extraction rendait une
  // liste VIDE. Un garde-frontière qui compare deux listes vides est vert quoi
  // qu'il arrive — c'est la panne la plus dangereuse pour un test comme
  // celui-ci, et elle a été mesurée en écrivant ce fichier.
  const eq = BACKEND.indexOf("=", at);
  const open = BACKEND.indexOf("[", eq);
  const close = BACKEND.indexOf("]", open);
  if (eq < 0 || open < 0 || close < 0) throw new Error(`${name}: littéral illisible`);
  const items = [...BACKEND.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (items.length === 0) throw new Error(`${name}: aucune chaîne extraite`);
  return items;
}

function backendNumber(name: string): number {
  const m = BACKEND.match(new RegExp(`(?:export )?const ${name} = (-?[\\d.]+)`));
  if (!m) throw new Error(`${name} introuvable côté serveur`);
  return Number(m[1]);
}

describe("le pont mémoire → plan ne peut pas dériver entre les deux runtimes", () => {
  it("les clés promouvables sont EXACTEMENT celles que le serveur accepte", () => {
    // `PROMOTABLE_DOMAIN_KEYS` côté serveur ouvre sur `FOOD_DOMAIN_KEY`, qui est
    // une référence et pas un littéral : on la résout avant de comparer.
    const server = backendArray("PROMOTABLE_DOMAIN_KEYS");
    const foodKey = BACKEND.match(/export const FOOD_DOMAIN_KEY = "([^"]+)"/)?.[1];
    expect(foodKey, "FOOD_DOMAIN_KEY introuvable côté serveur").toBeTruthy();
    expect([...PROMOTABLE_DOMAIN_KEYS]).toEqual([foodKey, ...server]);
  });

  it("chaque clé existe dans la taxonomie — une clé inventée ne remonte rien", () => {
    // Une faute de frappe (`travail.charges`) ne casse rien : elle ne matche
    // simplement aucun souvenir, pour toujours, en silence. C'est la panne la
    // plus difficile à voir de toute la chaîne.
    const known = new Set(TAXONOMY.keys.map((k) => k.key));
    for (const key of PROMOTABLE_DOMAIN_KEYS) {
      expect(known.has(key), `clé hors taxonomie: ${key}`).toBe(true);
    }
  });

  it("la clé alimentaire reste dans la liste", () => {
    // L'élargissement ne remplace rien : c'est la clé que porte l'écrasante
    // majorité des souvenirs promouvables.
    expect(PROMOTABLE_DOMAIN_KEYS).toContain("sante.alimentation");
  });

  it("les clés cliniques et intimes restent DEHORS des deux côtés", () => {
    // `sante.medical` a sa table (`student_safety_constraints`), synchrone et
    // sans ranking ; `psychologie.*` et `relations.*` feraient de la carte un
    // journal intime, et « ma sœur est allergique » un piège.
    const server = backendArray("PROMOTABLE_DOMAIN_KEYS");
    for (const banned of ["sante.medical", "psychologie.emotions", "relations.famille"]) {
      expect(PROMOTABLE_DOMAIN_KEYS).not.toContain(banned);
      expect(server).not.toContain(banned);
    }
  });

  it("le plancher de confiance est celui du serveur", () => {
    expect(MIN_CONFIDENCE).toBe(backendNumber("MIN_CONFIDENCE"));
  });

  it("les statuts proposables sont ceux du serveur", () => {
    expect([...PROPOSABLE_STATUSES]).toEqual(backendArray("PROMOTABLE_STATUSES"));
  });

  it("le plafond des écartés est celui du serveur", () => {
    expect(MAX_DISMISSED).toBe(backendNumber("MAX_DISMISSED"));
  });
});
