// food_packs.ts — un point de départ pour « Recommended food ».
//
// Les tests qui portent la doctrine:
//   * "aucun pack ne se nomme par un résultat"
//     -- « pack perte de gras » est une affirmation sur un corps, affichée sous
//        le nom du coach, sur un produit qui n'est pas médical. C'est la ligne
//        exacte où KEEL devient l'autorité nutritionnelle.
//   * "chaque slug existe dans le catalogue"
//     -- le catalogue vit dans une migration, les packs dans du code. Deux
//        listes qui ne se parlent pas divergent au premier aliment renommé, et
//        la divergence sort en violation de FK devant le coach.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import { FOOD_PACKS, foodPackByKey, packAdditions } from "./food_packs.ts";

/**
 * Les slugs du catalogue, lus DANS la migration qui les sème.
 *
 * Pas une copie: c'est la source. Une constante recopiée ici passerait au vert
 * le jour où la migration change, ce qui est exactement l'inverse de ce que ce
 * test doit faire.
 */
async function catalogSlugs(): Promise<Set<string>> {
  const sql = await Deno.readTextFile(
    new URL("../../../migrations/20260805140000_coach_food_items.sql", import.meta.url),
  );
  // Le bloc du catalogue commence à son `insert into public.food_items`; les
  // autres inserts de la migration (food_groups, seeds divers) ne doivent pas
  // entrer.
  const start = sql.indexOf("insert into public.food_items");
  assert(start > 0, "catalogue insert not found — did the migration move?");
  const block = sql.slice(start);
  const end = block.indexOf("\n\n\n");
  const values = end > 0 ? block.slice(0, end) : block;
  const slugs = new Set<string>();
  for (const m of values.matchAll(/^\s*\('([a-z0-9_]+)',/gm)) slugs.add(m[1]);
  assert(slugs.size > 100, `expected the ~127-item catalogue, parsed ${slugs.size}`);
  return slugs;
}

Deno.test("chaque slug d'un pack existe dans le catalogue", async () => {
  const known = await catalogSlugs();
  for (const pack of FOOD_PACKS) {
    for (const slug of pack.slugs) {
      assert(known.has(slug), `pack ${pack.key} references unknown food ${slug}`);
    }
  }
});

Deno.test("aucun pack ne se nomme par un résultat", () => {
  // Un pack décrit une FAÇON DE MANGER, jamais un effet sur un corps.
  //
  // ⚠️ LES BORNES DE MOT SONT LOAD-BEARING, pas de la coquetterie de regex.
  // Sans `\b` de fin, `lean` mordait dans « Mediterranean-leaning » — donc la
  // garde échouait sur un libellé parfaitement correct, ce qui est la meilleure
  // façon de faire supprimer une garde par le premier qui la trouve pénible.
  const outcome =
    /\b(slim|lean|shred|cut|cutting|bulk|bulking|muscle|detox|cleanse|healthy|heal|boost|burn)\b|fat.?loss|weight.?loss|metaboli/i;
  for (const pack of FOOD_PACKS) {
    assert(!outcome.test(pack.label), `pack ${pack.key} names an outcome: ${pack.label}`);
    assert(!outcome.test(pack.blurb), `pack ${pack.key} blurb claims an outcome: ${pack.blurb}`);
  }
});

Deno.test("aucun pack ne porte de chiffre nutritionnel", () => {
  const numeric = /\b\d+\s*(g|kg|ml|kcal|cal|calories|grams?|portions?|servings?)\b/i;
  for (const pack of FOOD_PACKS) {
    assert(!numeric.test(pack.blurb), `pack ${pack.key} carries a number: ${pack.blurb}`);
  }
});

Deno.test("les clés sont uniques, snake_case, et les listes sans doublon", () => {
  const keys = new Set<string>();
  for (const pack of FOOD_PACKS) {
    assert(!keys.has(pack.key), `duplicate pack key ${pack.key}`);
    keys.add(pack.key);
    assert(/^[a-z0-9_]+$/.test(pack.key), `pack key not snake_case: ${pack.key}`);
    assertEquals(
      new Set(pack.slugs).size,
      pack.slugs.length,
      `pack ${pack.key} lists a food twice`,
    );
    // Un pack de trois aliments n'est pas un point de départ, c'est une
    // suggestion; un pack de cent est l'écran qu'on essayait d'éviter.
    assert(pack.slugs.length >= 15 && pack.slugs.length <= 40, `pack ${pack.key} is oddly sized`);
  }
});

Deno.test("foodPackByKey jette sur une clé inconnue (R7)", () => {
  assertThrows(() => foodPackByKey("nope"));
  assertEquals(foodPackByKey("mediterranean").key, "mediterranean");
});

Deno.test("le compte annoncé est ce qui sera VRAIMENT ajouté", () => {
  // Un bouton qui dit « ajoute 26 aliments » et qui en ajoute 4 est un bouton
  // qui ment — et l'index unique par protocole ferait échouer les 22 autres.
  const pack = foodPackByKey("mediterranean");
  const already = [pack.slugs[0], pack.slugs[1], "chicken_breast", null, undefined];
  const additions = packAdditions(pack, already);
  assertEquals(additions.length, pack.slugs.length - 2);
  assert(!additions.includes(pack.slugs[0]));
  assert(!additions.includes(pack.slugs[1]));
});

Deno.test("un coach qui a déjà tout ne se voit rien ajouter", () => {
  const pack = foodPackByKey("minimal_cooking");
  assertEquals(packAdditions(pack, pack.slugs), []);
});
