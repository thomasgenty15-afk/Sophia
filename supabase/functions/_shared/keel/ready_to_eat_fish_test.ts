/**
 * ⟳ 2026-09-25 — LA CONSERVE N'EST PAS DU POISSON CRU (banc des trois foyers).
 *
 * B-3 refusé pour « maquereau en conserve » lu comme du maquereau cru
 * (`raw_protein_uncooked`), la relance de B-1 pour « sardines en conserve
 * égouttées » datées comme du poisson frais (`perishable_bought_too_early`).
 * Ce banc lit les alias DANS LA MIGRATION (pas une copie) et vérifie les deux
 * lecteurs : la garde du cru et la conservation.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { exactNameRef } from "./composition_identify.ts";
import { keepingOf } from "./food_keeping.ts";
import { uncookedRawProteins } from "./raw_protein_cooking.ts";

const SQL = Deno.readTextFileSync(
  new URL("../../../migrations/20260925200000_la_conserve_n_est_pas_du_poisson_cru.sql", import.meta.url),
);

/** Les paires (alias, slug) insérées par la migration, et les trois déplacées. */
function migrationAliases(): { alias: string; slug: string }[] {
  const insert = SQL.slice(SQL.indexOf("insert into public.food_composition_aliases"));
  const block = insert.slice(0, insert.indexOf("on conflict (alias)"));
  const pairs = [...block.matchAll(/\('((?:[^']|'')+)',\s*'([a-z_]+)'\)/g)]
    .map((m) => ({ alias: m[1].replace(/''/g, "'"), slug: m[2] }));
  return [
    ...pairs,
    { alias: "tinned mackerel", slug: "mackerel_tinned" },
    { alias: "tinned sardines", slug: "sardines_tinned" },
    { alias: "sardines a l'huile", slug: "sardines_tinned" },
  ];
}

function ref(slug: string, yieldClass: CompositionRef["yieldClass"]): CompositionRef {
  return {
    slug,
    foodGroupRef: "fatty_fish",
    label: slug,
    source: "ciqual",
    energyKcal: 200,
    proteinG: 20,
    carbsG: 0,
    fatG: 12,
    fiberG: 0,
    omega3Marine: true,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: true,
    folateSource: false,
    yieldClass,
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
  };
}

const INDEX = buildCompositionIndex(
  [
    ref("mackerel", "fish_shrinks"),
    ref("salmon", "fish_shrinks"),
    ref("herring", "fish_shrinks"),
    ref("sardines", "neutral"),
    ref("mackerel_tinned", "neutral"),
    ref("mackerel_smoked", "neutral"),
    ref("salmon_tinned", "neutral"),
    ref("herring_smoked", "neutral"),
    ref("sardines_tinned", "neutral"),
  ],
  [
    // Les noms nus d'origine (`20260810160000`), qui ne bougent pas.
    { alias: "maquereau", slug: "mackerel" },
    { alias: "saumon", slug: "salmon" },
    { alias: "hareng", slug: "herring" },
    { alias: "sardines", slug: "sardines" },
    ...migrationAliases(),
  ],
);

const assemble = (terms: string[]) => ({
  day: "tue",
  slot: "lunch",
  title: terms.join(", "),
  ingredients: terms.map((term) => ({ term, ref: null, refRefused: false })),
  sameDay: { kind: "assemble" },
});

Deno.test("① B-3 : le maquereau en conserve, fumé, le saumon en conserve, le hareng fumé ne sont pas du cru", () => {
  for (const term of [
    "maquereau en conserve",
    "filets de maquereau à la tomate",
    "maquereau fumé",
    "filets de maquereau fumés au poivre",
    "saumon en conserve",
    "hareng fumé",
    "harengs saurs",
    "sardines en conserve égouttées",
  ]) {
    assertEquals(uncookedRawProteins({ index: INDEX, dishes: [assemble([term])] }).found, [], term);
  }
});

Deno.test("① ⛔ le nom NU reste du poisson cru : la garde mord toujours", () => {
  const { found } = uncookedRawProteins({
    index: INDEX,
    dishes: [assemble(["maquereau"]), assemble(["saumon"]), assemble(["hareng"])],
  });
  assertEquals(found.map((f) => f.slug), ["mackerel", "salmon", "herring"]);
});

Deno.test("② l'identification lit le nom EXACT de la conserve avant sa mémoire des noms", () => {
  // La table des noms retenus disait « sardines en conserve » → `sardines` ; le
  // nom exact passe avant elle (`composition_identify.ts`, étape 2).
  assertEquals(exactNameRef(INDEX, "Sardines en conserve égouttées")?.slug, "sardines_tinned");
  assertEquals(exactNameRef(INDEX, "maquereau en conserve")?.slug, "mackerel_tinned");
  assertEquals(exactNameRef(INDEX, "maquereau")?.slug, "mackerel");
});

Deno.test("③ relance de B-1 : la conserve de sardines se garde, la sardine nue garde sa fenêtre d'un jour", () => {
  assertEquals(keepingOf({ ref: "sardines_tinned", group: "fatty_fish" }).kind, "stable");
  assertEquals(keepingOf({ ref: "mackerel_tinned", group: "fatty_fish" }).kind, "stable");
  assertEquals(keepingOf({ ref: "salmon_tinned", group: "fatty_fish" }).kind, "stable");
  const bare = keepingOf({ ref: "sardines", group: "fatty_fish" });
  assertEquals([bare.kind, bare.rawWindowDays], ["refrigerated", 1]);
  // Les fumés se gardent au froid : fenêtre du groupe, pas d'étagère.
  assertEquals(keepingOf({ ref: "mackerel_smoked", group: "fatty_fish" }).kind, "refrigerated");
});

Deno.test("④ la migration ne pose que des noms qui DISENT la conserve ou le fumé", () => {
  const aliases = migrationAliases();
  assert(aliases.length >= 40, `${aliases.length} alias lus`);
  for (const { alias, slug } of aliases) {
    const says = /conserve|boite|tinned|canned|naturel|tomate|vin blanc|moutarde|huile|fume|smoked|kipper|saur/
      .test(alias);
    assert(says, `« ${alias} » → ${slug} ne dit ni la conserve ni le fumé`);
  }
});
