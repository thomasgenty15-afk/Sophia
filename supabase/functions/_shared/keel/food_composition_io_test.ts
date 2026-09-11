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
    // ⟳ LOT A (2026-09-11): TROIS tables, plus deux. La troisième est
    // `food_composition_false_friends` — les formes où le lexique d'une langue
    // parle avant le slug nu. Le compte est là pour qu'une quatrième lecture ne
    // s'ajoute pas sans qu'on la voie.
    assertEquals(db.calls.length, 3, "une requête par table, pas plus");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT A — CE QUE LE CHARGEUR DÉCIDE EN PLUS, ET QUI NE SE VOIT PAS AILLEURS
// ═══════════════════════════════════════════════════════════════════════════

/** Un client qui rend exactement les lignes qu'on lui donne, par table. */
function fixedDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            range(from: number, to: number) {
              return Promise.resolve({
                data: (tables[table] ?? []).slice(from, to + 1),
                error: null,
              });
            },
          };
        },
      };
    },
  };
}

const ROW = {
  food_group_ref: "other_fruit",
  label: "x",
  source: "ciqual",
  energy_kcal: 100,
  yield_class: "neutral",
  atwater_discount: 1,
};

Deno.test("LOT A — un `ciqual_code` porté par DEUX slugs rend les deux suspects", () => {
  // ⛔ LE DÉFAUT MESURÉ: `20039` était porté par `leek` ET `pear`, et `pear`
  // avait bien les cinq macronutriments du poireau. Un `alim_code` ANSES
  // désigne UN aliment; deux lignes qui le portent disent la même mesure de
  // deux aliments, et rien dans le produit ne peut dire laquelle ment.
  const db = fixedDb({
    food_composition_refs: [
      { ...ROW, slug: "leek", ciqual_code: "20039" },
      { ...ROW, slug: "pear", ciqual_code: "20039" },
      { ...ROW, slug: "apple", ciqual_code: "13004" },
    ],
    food_composition_aliases: [],
    food_composition_false_friends: [],
  });
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.bySlug.get("leek")?.validation, "a_verifier");
    assertEquals(index.bySlug.get("pear")?.validation, "a_verifier");
    // Et un code porté UNE fois ne rend personne suspect.
    assertEquals(index.bySlug.get("apple")?.validation, "verifie");
  });
});

Deno.test("LOT A — l'exception écrite en base gagne sur la règle du doublon", () => {
  // « Jusqu'à arbitrage nominatif »: une fois qu'un humain a tranché, la règle
  // générale ne doit plus re-condamner la ligne. Sans ça, aucun doublon ne
  // pourrait JAMAIS sortir de la suspicion.
  const db = fixedDb({
    food_composition_refs: [
      { ...ROW, slug: "leek", ciqual_code: "20039" },
      {
        ...ROW,
        slug: "pear",
        ciqual_code: "20039",
        validation_state: "verifie",
        validation_reason: "arbitre a la main le 2026-09-11",
        validation_decided_on: "2026-09-11",
      },
    ],
    food_composition_aliases: [],
    food_composition_false_friends: [],
  });
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.bySlug.get("pear")?.validation, "verifie");
    assertEquals(index.bySlug.get("leek")?.validation, "a_verifier");
  });
});

Deno.test("LOT A — un `validation_state` hors vocabulaire retombe sur la RÈGLE", () => {
  // ⛔ ET PAS SUR `rejete` « par prudence ». Une colonne mal lue qui fermerait
  // la composition ferait passer un défaut de lecture pour une décision
  // produit — et le référentiel entier pourrait disparaître du catalogue sur
  // une faute de frappe.
  const db = fixedDb({
    food_composition_refs: [
      { ...ROW, slug: "a", validation_state: "VERIFIÉ!" },
      { ...ROW, slug: "b", source: "sas" },
    ],
    food_composition_aliases: [],
    food_composition_false_friends: [],
  });
  return loadCompositionIndex(db as never).then((index) => {
    assertEquals(index.bySlug.get("a")?.validation, "verifie");
    assertEquals(index.bySlug.get("b")?.validation, "a_verifier");
  });
});

Deno.test("LOT A — les faux amis sont filtrés par LANGUE, et `fr` est le défaut", () => {
  // Mesuré le 2026-09-11 sur tous les plans de la base: 195 occurrences des
  // quatre termes en fr-FR contre 1 en en-GB. Le défaut va du côté où la
  // mesure dit qu'il coûte le moins — et il est écrit, pas deviné.
  const tables = {
    food_composition_refs: [
      { ...ROW, slug: "grapes", energy_kcal: 68.9 },
      { ...ROW, slug: "raisin", energy_kcal: 321 },
    ],
    food_composition_aliases: [],
    food_composition_false_friends: [
      { term: "raisin", lang: "fr", slug: "grapes" },
      // Une ligne d'une AUTRE langue ne doit pas fuir dans l'index français.
      { term: "grapes", lang: "en", slug: "raisin" },
      // Un faux ami vers un slug absent est jeté, comme un alias orphelin.
      { term: "zzz", lang: "fr", slug: "inexistant" },
    ],
  };
  return loadCompositionIndex(fixedDb(tables) as never).then((fr) => {
    assertEquals(fr.falseFriends?.size, 1);
    assertEquals(fr.falseFriends?.get("raisin"), "grapes");
    return loadCompositionIndex(fixedDb(tables) as never, { lang: "en" });
  }).then((en) => {
    assertEquals(en.falseFriends?.size, 1);
    assertEquals(en.falseFriends?.get("grapes"), "raisin");
    assertEquals(en.falseFriends?.has("raisin"), false);
  });
});
