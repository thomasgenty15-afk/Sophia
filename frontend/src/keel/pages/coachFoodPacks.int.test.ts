import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

/**
 * LA CEINTURE DE DÉRIVE DES LISTES DE DÉPART.
 *
 * `FOOD_PACKS` est déclaré côté serveur (`_shared/keel/food_packs.ts`) et rendu
 * par `CoachProtocolPage`. Depuis que le nom et la phrase de chaque pack vivent
 * dans le seed — le module partagé garde ses `label`/`blurb` pour le serveur —
 * plus rien dans le code ne relie les deux fichiers. Un pack ajouté là-bas sans
 * ses deux clés ici ferait LEVER `t()` en DEV: pas un mot anglais au milieu
 * d'une carte, la carte entière qui tombe.
 *
 * Le module est lu depuis sa SOURCE plutôt qu'importé: c'est du code Deno/JSR
 * qu'un test Vite/node ne charge pas, et lire la déclaration suffit à attraper
 * la panne qui arrive vraiment — une clé renommée d'un seul côté.
 */
function serverPackKeys(): string[] {
  const path = resolve(
    __dirname,
    "../../../../supabase/functions/_shared/keel/food_packs.ts",
  );
  const source = readFileSync(path, "utf8");
  const block = source.match(
    /export const FOOD_PACKS: readonly FoodPack\[\] = \[([\s\S]*?)\n\] as const;/,
  );
  if (!block) throw new Error("FOOD_PACKS not found in food_packs.ts");
  return [...block[1].matchAll(/key:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("coach food packs copy", () => {
  it("lit bien les packs du serveur", () => {
    // Sans cette assertion, un regex qui ne matche plus rendrait une liste vide
    // et les deux contrôles ci-dessous passeraient sur zéro pack.
    expect(serverPackKeys().length).toBeGreaterThanOrEqual(4);
  });

  it("donne un nom et une phrase à chaque pack, dans les DEUX langues", () => {
    const missing: string[] = [];
    for (const key of serverPackKeys()) {
      for (const field of ["label", "blurb"]) {
        const messageKey = `coach.food.pack.${key}.${field}`;
        if (en[messageKey as keyof typeof en] === undefined) missing.push(`en:${messageKey}`);
        if (fr[messageKey as keyof typeof fr] === undefined) missing.push(`fr:${messageKey}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("n'invente aucune clé de pack que le serveur ne peut rendre", () => {
    // L'autre moitié: une clé de pack orpheline est du texte qu'aucun écran
    // n'atteint, et elle survit aux relectures parce qu'elle a l'air servie.
    const known = new Set(serverPackKeys());
    const orphans = Object.keys(en)
      .filter((k) => k.startsWith("coach.food.pack."))
      .map((k) => k.slice("coach.food.pack.".length).replace(/\.(label|blurb)$/, ""))
      .filter((key) => !known.has(key));
    expect([...new Set(orphans)]).toEqual([]);
  });
});
