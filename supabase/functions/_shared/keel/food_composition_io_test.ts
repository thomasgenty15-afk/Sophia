import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { loadCompositionIndex } from "./food_composition_io.ts";

// ===========================================================================
// LA PAGINATION — le défaut le plus cher de la journée du 2026-08-12
//
// PostgREST plafonne une réponse à 1000 lignes PAR DÉFAUT, sans erreur. Mesuré:
// 2508 alias en base, 999 chargés. Plus de 60 % du référentiel n'atteignait
// jamais le résolveur.
//
// Ce n'était pas une inefficacité: la résolution plafonnait sous la porte des
// 80 % du verdict, donc PAS de verdict, PAS de boucle de correction, PAS de
// mise à l'échelle des portions. Et on en a conclu deux fois que « le
// référentiel est trop pauvre » — en important 689 aliments de plus pendant
// que la moitié de ce qu'on avait ne se chargeait pas.
// ===========================================================================

/** Un client qui SIMULE le plafond de PostgREST. */
function cappedDb(refCount: number, aliasCount: number, cap = 1000) {
  const calls: { table: string; from: number; to: number }[] = [];
  return {
    calls,
    from(table: string) {
      return {
        select(_columns: string) {
          const total = table === "food_composition_refs" ? refCount : aliasCount;
          const build = (from: number, to: number) => {
            const end = Math.min(to, from + cap - 1, total - 1);
            const data = [];
            for (let i = from; i <= end; i++) {
              data.push(
                table === "food_composition_refs"
                  ? {
                    slug: `food_${i}`,
                    food_group_ref: "non_starchy_veg",
                    label: `Food ${i}`,
                    energy_kcal: 100,
                    protein_g: 1,
                    carbs_g: 1,
                    fat_g: 1,
                    fiber_g: 1,
                    yield_class: "neutral",
                    atwater_discount: 1,
                    energy_dense: false,
                    unit_grams: null,
                  }
                  : { alias: `alias ${i}`, slug: `food_${i % refCount}` },
              );
            }
            return { data, error: null };
          };
          const chain = {
            range(from: number, to: number) {
              calls.push({ table, from, to });
              return Promise.resolve(build(from, to));
            },
            then(res: (v: unknown) => unknown) {
              // Un appel SANS `range` reçoit le plafond — c'est le bug d'origine.
              return Promise.resolve(build(0, cap - 1)).then(res);
            },
          };
          return chain;
        },
      };
    },
  };
}

Deno.test("TOUT se charge, au-delà du plafond de 1000 lignes", () => {
  const db = cappedDb(1200, 2508);
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.bySlug.size, 1200, "les refs sont tronquées");
    assertEquals(index.byAlias.size, 2508, "les alias sont tronqués");
    // Et on a bien paginé plutôt que demandé une fois.
    assert(db.calls.length >= 5, `trop peu de requêtes: ${db.calls.length}`);
  });
});

Deno.test("une page INCOMPLÈTE arrête la boucle — pas une page pleine", () => {
  // S'arrêter sur une page pleine est exactement le défaut réparé: à 2000
  // alias pile, la deuxième page est pleine et une troisième DOIT être
  // demandée pour prouver qu'il n'y a plus rien.
  const db = cappedDb(10, 2000);
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.byAlias.size, 2000);
    const aliasCalls = db.calls.filter((c) => c.table === "food_composition_aliases");
    assertEquals(aliasCalls.length, 3, "la troisième page prouve la fin");
  });
});

Deno.test("désarmement: sous le plafond, une seule requête par table", () => {
  const db = cappedDb(200, 700);
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.bySlug.size, 200);
    assertEquals(index.byAlias.size, 700);
    assertEquals(db.calls.length, 2, "une requête par table, pas plus");
  });
});
