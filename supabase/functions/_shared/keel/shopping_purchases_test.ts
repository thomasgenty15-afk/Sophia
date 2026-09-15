/**
 * ══════════════════════════════════════════════════════════════════════════
 * CHAQUE USAGE EST VÉRIFIÉ, PAS SEULEMENT LE PREMIER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT: la datation lit la cuisson la PLUS TÔT, la garde finale lit le
 * besoin le PLUS TÔT. Un poisson cuisiné lundi ET vendredi est donc acheté
 * dimanche, les deux contrôles sont contents, et le filet du vendredi a cinq
 * jours. Le plan de clôture l'exige : « vérifier chaque usage » et « scinder la
 * quantité d'une même référence quand une ligne unique ne couvre pas ses
 * différentes cuissons ».
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  purchasesForNeed,
  splitShoppingByUses,
} from "./shopping_purchases.ts";

const use = (rank: number | null, gramsRaw: number | null = 100) => ({
  rank,
  gramsRaw,
});

Deno.test("① un usage: un achat, au plus tard possible", () => {
  const p = purchasesForNeed({ uses: [use(4)], window: 1, lastRank: 6 });
  assertEquals(p.purchases.length, 1);
  assertEquals(p.purchases[0].rank, 3, "la veille de la cuisson");
  assertEquals(p.purchases[0].share, 1);
  assertEquals(p.counts.splits, 0);
});

Deno.test("① bis — jamais avant le début du plan", () => {
  // ⛔ « ON N'ENVOIE PERSONNE FAIRE LES COURSES LA SEMAINE D'AVANT » — la même
  // borne que `planGroceryWaves`.
  const p = purchasesForNeed({ uses: [use(0)], window: 3, lastRank: 6 });
  assertEquals(p.purchases[0].rank, 0);
});

Deno.test("② DEUX cuissons éloignées: DEUX achats, et la somme des parts vaut 1", () => {
  // Poisson (fenêtre 1 jour) cuisiné au rang 1 et au rang 5.
  const p = purchasesForNeed({
    uses: [use(1, 300), use(5, 100)],
    window: 1,
    lastRank: 6,
  });
  assertEquals(p.purchases.length, 2);
  assertEquals(p.counts.splits, 1);
  assertEquals(p.purchases.map((x) => x.rank), [0, 4]);
  assertEquals(p.purchases.map((x) => x.coversRanks), [[1], [5]]);
  // ⛔ AU PRORATA DES MASSES: 300 g d'un côté, 100 de l'autre.
  assertEquals(p.purchases[0].share, 0.75);
  assertEquals(p.purchases[1].share, 0.25);
  assertEquals(
    p.purchases.reduce((n, x) => n + x.share, 0),
    1,
    "la somme des parts n'est pas le besoin net: il y a double achat ou manque",
  );
});

Deno.test("② bis — DEUX cuissons PROCHES: UN seul achat les couvre", () => {
  // ⛔ LA CONTRE-ÉPREUVE. Sans elle, « scinder » deviendrait « scinder
  // toujours », et chaque ingrédient de deux repas ferait deux courses.
  const p = purchasesForNeed({
    uses: [use(3), use(4)],
    window: 3,
    lastRank: 6,
  });
  assertEquals(p.purchases.length, 1);
  // ⛔ LA DATE EST CELLE DU DERNIER USAGE MOINS LA FENÊTRE: c'est le plus TÔT
  // des jours qui couvrent les deux. Prendre `premier − fenêtre` (rang 0) ne
  // couvrirait PAS le second usage, et c'est très exactement le défaut.
  assertEquals(p.purchases[0].rank, 1);
  assertEquals(p.purchases[0].coversRanks, [3, 4]);
  assertEquals(p.counts.splits, 0);
});

Deno.test("② ter — TROIS cuissons: l'achat glouton en ouvre le moins possible", () => {
  // Fenêtre 2, usages aux rangs 1, 3, 6.
  //   achat au rang 0 → couvre 1 et 3 (0+2 = 2 < 3 ? non: 3 > 2) …
  // ⛔ LA RÈGLE EXACTE: un groupe tient d'un seul achat si son ÉTENDUE tient
  // dans la fenêtre. {1,3} a une étendue de 2 ⇒ un achat au rang 1 (3 − 2) les
  // couvre tous les deux. Le rang 6 est à 5 du premier ⇒ un second achat.
  const p = purchasesForNeed({
    uses: [use(1), use(3), use(6)],
    window: 2,
    lastRank: 6,
  });
  assertEquals(p.purchases.map((x) => x.rank), [1, 4]);
  assertEquals(p.purchases.map((x) => x.coversRanks), [[1, 3], [6]]);
  assertEquals(p.counts.splits, 1);
});

Deno.test("③ sans fenêtre (conserve, congelé): UN achat, au premier jour", () => {
  const p = purchasesForNeed({
    uses: [use(1), use(6)],
    window: null,
    lastRank: 6,
  });
  assertEquals(p.purchases.length, 1);
  assertEquals(p.purchases[0].rank, 0);
  assertEquals(p.purchases[0].coversRanks, [1, 6]);
  assertEquals(p.counts.splits, 0);
});

Deno.test("④ un usage SANS date ne contraint rien, et il se compte", () => {
  const p = purchasesForNeed({
    uses: [use(null), use(2)],
    window: 1,
    lastRank: 6,
  });
  assertEquals(p.counts.undated_uses, 1);
  assertEquals(p.purchases.length, 1);
  assertEquals(p.purchases[0].rank, 1);
});

Deno.test("④ bis — AUCUN usage daté: un achat au premier jour, et on le DIT", () => {
  const p = purchasesForNeed({
    uses: [use(null), use(null)],
    window: 1,
    lastRank: 6,
  });
  assertEquals(p.purchases, [{ rank: 0, coversRanks: [], share: 1 }]);
  assertEquals(p.counts.undated_uses, 2);
});

Deno.test("⑤ des usages NON PESÉS répartissent à parts égales, et ça se compte", () => {
  // ⛔ INVENTER UNE MASSE FERAIT ACHETER TROP D'UN CÔTÉ ET PAS ASSEZ DE
  // L'AUTRE, sans que rien ne le dise.
  const p = purchasesForNeed({
    uses: [use(1, null), use(5, null)],
    window: 1,
    lastRank: 6,
  });
  assertEquals(p.counts.unweighed_uses, 2);
  assertEquals(p.purchases.map((x) => x.share), [0.5, 0.5]);
});

Deno.test("⑥ la somme des parts vaut EXACTEMENT 1, même sur trois tiers", () => {
  // ⛔ SANS L'ABSORPTION DE L'ARRONDI PAR LE DERNIER, trois tiers font 0,999 et
  // il manque un gramme au dernier achat.
  const p = purchasesForNeed({
    uses: [use(1, 100), use(4, 100), use(6, 100)],
    window: 0,
    lastRank: 6,
  });
  assertEquals(p.purchases.length, 3);
  assertEquals(p.purchases.reduce((n, x) => n + x.share, 0), 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA LISTE SCINDÉE — ET LE TOUR SUIVANT LA REFAIT À L'IDENTIQUE
// ═══════════════════════════════════════════════════════════════════════════

interface Ligne {
  readonly term: string;
  readonly amount: number | null;
  readonly buy_on: number | null;
}

const LIGNES: Ligne[] = [
  { term: "saumon", amount: 400, buy_on: null },
  { term: "riz", amount: 500, buy_on: null },
  { term: "herbes", amount: null, buy_on: null },
];

const USAGES: Record<string, { rank: number | null; gramsRaw: number | null }[]> = {
  // Deux cuissons éloignées, fenêtre d'un jour: il faut deux courses.
  saumon: [use(1, 300), use(5, 100)],
  // Une seule cuisson: rien à scinder.
  riz: [use(2, 500)],
  // Deux cuissons éloignées, mais aucune quantité: on ne coupe pas.
  herbes: [use(1, null), use(5, null)],
};

function scinde(lignes: readonly Ligne[]) {
  return splitShoppingByUses<Ligne>({
    lines: lignes,
    usesOf: (l) => USAGES[l.term] ?? null,
    windowOf: (l) => (l.term === "riz" ? 21 : 1),
    splittable: (l) => l.amount !== null,
    lastRank: 6,
    withShare: (l, share, rank) => ({
      ...l,
      amount: l.amount === null ? null : Math.round(l.amount * share),
      buy_on: rank,
    }),
  });
}

Deno.test("⑦ le besoin à deux cuissons éloignées devient DEUX lignes datées", () => {
  const out = scinde(LIGNES);
  assertEquals(out.counts.split_needs, 1);
  assertEquals(out.counts.extra_lines, 1);
  assertEquals(out.counts.unsplittable, 1, "les herbes n'ont pas de quantité");
  assertEquals(out.counts.without_need, 0);
  const saumon = out.lines.filter((l) => l.term === "saumon");
  assertEquals(saumon.length, 2);
  assertEquals(saumon.map((l) => l.buy_on), [0, 4]);
  // ⛔ LA SOMME DES LIGNES EST LE BESOIN NET, SANS DOUBLE ACHAT.
  assertEquals(saumon.reduce((n, l) => n + (l.amount ?? 0), 0), 400);
  // ⛔ ET CE QUI N'AVAIT PAS BESOIN D'ÊTRE SCINDÉ NE L'EST PAS.
  assertEquals(out.lines.filter((l) => l.term === "riz").length, 1);
  assertEquals(out.lines.filter((l) => l.term === "herbes").length, 1);
});

Deno.test("⑦ bis — une ligne sans besoin retrouvé reste TELLE QUELLE, et se compte", () => {
  const out = scinde([{ term: "inconnu", amount: 100, buy_on: null }]);
  assertEquals(out.counts.without_need, 1);
  assertEquals(out.lines.length, 1);
  assertEquals(out.lines[0].amount, 100);
});
