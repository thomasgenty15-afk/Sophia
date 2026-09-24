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
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MIN_DAYS_BETWEEN_SHOPS,
  purchasesForNeed,
  spaceShoppingDays,
  splitShoppingByUses,
} from "./shopping_purchases.ts";

const use = (rank: number | null, gramsRaw: number | null = 100) => ({
  rank,
  gramsRaw,
});

Deno.test("① un usage: un achat, au plus tard possible", () => {
  const p = purchasesForNeed({ uses: [use(4)], window: 1, lastRank: 6, shopDays: [] });
  assertEquals(p.purchases.length, 1);
  assertEquals(p.purchases[0].rank, 3, "la veille de la cuisson");
  assertEquals(p.purchases[0].share, 1);
  assertEquals(p.counts.splits, 0);
});

Deno.test("① bis — jamais avant le début du plan", () => {
  // ⛔ « ON N'ENVOIE PERSONNE FAIRE LES COURSES LA SEMAINE D'AVANT » — la même
  // borne que `planGroceryWaves`.
  const p = purchasesForNeed({ uses: [use(0)], window: 3, lastRank: 6, shopDays: [] });
  assertEquals(p.purchases[0].rank, 0);
});

Deno.test("② DEUX cuissons éloignées: DEUX achats, et la somme des parts vaut 1", () => {
  // Poisson (fenêtre 1 jour) cuisiné au rang 1 et au rang 5.
  const p = purchasesForNeed({
    uses: [use(1, 300), use(5, 100)],
    window: 1,
    lastRank: 6,
    shopDays: [],
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
    shopDays: [],
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
  // ⟳ 2026-09-24 — et le groupe doit s'acheter AVANT son premier usage :
  // {1,3} (étendue 2 = la fenêtre) ne s'achèterait qu'au rang 1, le jour même
  // du premier usage. Trois achats, chacun la veille au plus tard.
  const p = purchasesForNeed({
    uses: [use(1), use(3), use(6)],
    window: 2,
    lastRank: 6,
    shopDays: [],
  });
  assertEquals(p.purchases.map((x) => x.rank), [0, 1, 4]);
  assertEquals(p.purchases.map((x) => x.coversRanks), [[1], [3], [6]]);
  assertEquals(p.counts.splits, 2);
});

Deno.test("③ sans fenêtre (conserve, congelé): UN achat, au premier jour", () => {
  const p = purchasesForNeed({
    uses: [use(1), use(6)],
    window: null,
    lastRank: 6,
    shopDays: [],
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
    shopDays: [],
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
    shopDays: [],
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
    shopDays: [],
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
    shopDays: [],
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
    shopDays: [],
    rankOf: (l) => l.buy_on,
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
  // ⟳ 2026-09-24 — chaque ligne rendue dit les usages qu'ELLE couvre.
  assertEquals(
    out.covers.filter((_, i) => out.lines[i].term === "saumon"),
    [[1], [5]],
  );
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

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ ⟳ 2026-09-24 — UN ACHAT SCINDÉ SE RANGE SUR UNE COURSE DÉJÀ POSÉE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ les épinards du lundi vont sur la course du samedi, pas sur un vendredi à eux seuls", () => {
  // Brouillon `377e91ad` : rang 0 = jeudi (lentilles), rang 4 = lundi (œufs),
  // fenêtre 3. Courses déjà posées jeudi (0) et samedi (2).
  const p = purchasesForNeed({
    uses: [use(0, 456), use(4, 355)],
    window: 3,
    lastRank: 5,
    shopDays: [0, 2],
  });
  assertEquals(p.purchases.map((x) => x.rank), [0, 2]);
  assertEquals(p.purchases.map((x) => x.coversRanks), [[0], [4]]);
});

Deno.test("⑧ bis — sans course posée dans la fenêtre, la date d'avant", () => {
  // Samedi (2) hors de portée d'un poisson du lundi (fenêtre 1 : dimanche ou lundi).
  const p = purchasesForNeed({
    uses: [use(0), use(4)],
    window: 1,
    lastRank: 5,
    shopDays: [0, 2],
  });
  assertEquals(p.purchases.map((x) => x.rank), [0, 3]);
});

Deno.test("⑧ quater — une course posée LE JOUR MÊME de l'usage ne le couvre pas", () => {
  // Épinards du lundi (4), fenêtre 3, courses posées jeudi (0) et lundi (4) :
  // la course du lundi arrive après le petit-déjeuner. Aucune course posée
  // entre vendredi (1) et dimanche (3) ⇒ la date d'avant, vendredi.
  const p = purchasesForNeed({
    uses: [use(0), use(4)],
    window: 3,
    lastRank: 5,
    shopDays: [0, 4],
  });
  assertEquals(p.purchases.map((x) => x.rank), [0, 1]);
});

Deno.test("⑧ ter — une course posée APRÈS le premier usage ne le couvre pas", () => {
  // Usages 3 et 4, fenêtre 3 : achat possible du rang 1 au rang 3. La course du
  // rang 5 arriverait trop tard ; celle du rang 2 est prise.
  const p = purchasesForNeed({
    uses: [use(3), use(4)],
    window: 3,
    lastRank: 6,
    shopDays: [0, 2, 5],
  });
  assertEquals(p.purchases.map((x) => x.rank), [2]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ ⟳ 2026-09-24 — DEUX JOURS AU MOINS ENTRE DEUX COURSES
// ═══════════════════════════════════════════════════════════════════════════

interface Achat {
  readonly term: string;
  readonly rank: number;
  readonly window: number | null;
}

function espace(achats: readonly Achat[], covers: (number[] | null)[]) {
  return spaceShoppingDays<Achat>({
    lines: achats,
    covers,
    windowOf: (a) => a.window,
    rankOf: (a) => a.rank,
    withRank: (a, rank) => ({ ...a, rank }),
  });
}

Deno.test("⑨ l'écart minimum vaut deux jours", () => {
  assertEquals(MIN_DAYS_BETWEEN_SHOPS, 2);
});

Deno.test("⑨ la laitue du lundi (fenêtre 3) ne rouvre pas le magasin le lendemain de la grosse course", () => {
  // Brouillon `59b06fd6` : jeudi (0) la grosse course, vendredi (1) une laitue
  // seule pour lundi (4). Jeudi ne la couvre pas (4 − 0 > 3) : elle est
  // DÉCALÉE à samedi (2), à deux jours de jeudi, et reste fraîche.
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "laitue", rank: 1, window: 3 },
    ],
    [[0], [4]],
  );
  assertEquals(out.lines.map((a) => [a.term, a.rank]), [["riz", 0], ["laitue", 2]]);
  assertEquals(out.counts.adjacent_before, 1);
  assertEquals(out.counts.adjacent_after, 0);
  assertEquals(out.counts.days_shifted, 1);
});

Deno.test("⑨ bis — un article qui reste frais rejoint la course existante, et le jour disparaît", () => {
  // Fenêtre 5 : jeudi (0) couvre lundi (4). Plus de course le vendredi.
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "laitue", rank: 1, window: 5 },
    ],
    [[0], [4]],
  );
  assertEquals(out.lines.map((a) => a.rank), [0, 0]);
  assertEquals(out.counts.days_removed, 1);
  assertEquals(out.counts.adjacent_after, 0);
});

Deno.test("⑨ ter — le poisson qui ne tient qu'un jour garde sa course, et ça se compte", () => {
  // Cuit samedi (2), fenêtre 1 : acheté vendredi (1) ou rien. La fraîcheur
  // passe avant la règle — accepté par l'utilisateur pour le poisson.
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "cabillaud", rank: 1, window: 1 },
    ],
    [[0], [2]],
  );
  assertEquals(out.lines.map((a) => a.rank), [0, 1]);
  assertEquals(out.counts.adjacent_after, 1);
  assertEquals(out.counts.lines_moved, 0);
});

Deno.test("⑨ quater — quand le jour tardif ne peut pas bouger, c'est le précoce qui rejoint une course", () => {
  // Jeudi (0) · samedi (2) des légumes pour lundi (4), fenêtre 5 · dimanche
  // (3) un poisson pour lundi, fenêtre 1. Le poisson ne bouge pas ; les
  // légumes rejoignent dimanche, le plus tardif des jours qui les gardent frais.
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "courgette", rank: 2, window: 5 },
      { term: "cabillaud", rank: 3, window: 1 },
    ],
    [[0], [4], [4]],
  );
  assertEquals(out.lines.map((a) => [a.term, a.rank]), [
    ["riz", 0],
    ["courgette", 3],
    ["cabillaud", 3],
  ]);
  assertEquals(out.counts.adjacent_after, 0);
});

Deno.test("⑨ quinquies — un article sans usage connu, ou déjà mangé le jour de son achat, ne bouge pas", () => {
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "inconnu", rank: 1, window: 3 },
    ],
    [[0], null],
  );
  assertEquals(out.lines.map((a) => a.rank), [0, 1]);
  assertEquals(out.counts.adjacent_after, 1);
});

Deno.test("⑨ sexies — jamais acheté le jour même de son premier usage, ni après", () => {
  // Laitue mangée vendredi (1) et lundi (4), fenêtre 5 : sa fenêtre d'achat
  // s'arrête à jeudi (0). Posée vendredi, elle rejoint jeudi — jamais samedi.
  const out = espace(
    [
      { term: "riz", rank: 0, window: null },
      { term: "laitue", rank: 1, window: 5 },
    ],
    [[0], [1, 4]],
  );
  assertEquals(out.lines.map((a) => a.rank), [0, 0]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ ⟳ 2026-09-24 — UN SEUL ACHAT, MAIS DATÉ TROP TÔT POUR LE DERNIER REPAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑩ le poulet mangé dimanche ET mardi n'est plus acheté vendredi pour les deux", () => {
  // Brouillon `930edb4b` : jeudi (0) … mardi (5). « blanc de poulet » mangé
  // dimanche (3) et mardi (5), volaille 2 jours, ligne datée vendredi (1) —
  // mardi à quatre jours. Deux achats désormais : vendredi pour dimanche,
  // dimanche pour mardi, chacun la veille au plus tard.
  const out = splitShoppingByUses<{ term: string; amount: number; buy_on: number }>({
    lines: [{ term: "poulet", amount: 400, buy_on: 1 }],
    usesOf: () => [use(3, 200), use(5, 200)],
    windowOf: () => 2,
    splittable: () => true,
    lastRank: 5,
    shopDays: [0, 1],
    rankOf: (l) => l.buy_on,
    withShare: (l, share, rank) => ({ ...l, amount: Math.round(l.amount * share), buy_on: rank }),
  });
  assertEquals(out.lines.map((l) => [l.buy_on, l.amount]), [[1, 200], [3, 200]]);
  assertEquals(out.covers, [[3], [5]]);
});

Deno.test("⑩ bis — un achat unique trop tôt pour son dernier usage est REDATÉ, et se compte", () => {
  // Salade (5 jours) mangée samedi (2) et mardi (5), datée jeudi (0) par la
  // cuisson la plus tôt : mardi serait à cinq jours… de trop ? non : 5 − 0 = 5,
  // dans la fenêtre. Mangée mercredi (6) : 6 − 0 = 6 > 5, redatée au rang 1.
  const out = splitShoppingByUses<{ term: string; amount: number; buy_on: number }>({
    lines: [{ term: "salade", amount: 300, buy_on: 0 }],
    usesOf: () => [use(2, 150), use(6, 150)],
    windowOf: () => 5,
    splittable: () => true,
    lastRank: 6,
    shopDays: [0],
    rankOf: (l) => l.buy_on,
    withShare: (l, share, rank) => ({ ...l, amount: Math.round(l.amount * share), buy_on: rank }),
  });
  assertEquals(out.lines.map((l) => [l.buy_on, l.amount]), [[1, 300]]);
  assertEquals(out.counts.redated_single, 1);
  // Et jamais au jour même, ni après, du premier usage (samedi, rang 2).
  assert(out.lines[0].buy_on < 2);
});

Deno.test("⑩ ter — une ligne sans fenêtre (conserve, congelée) n'est jamais redatée", () => {
  const out = splitShoppingByUses<{ term: string; amount: number; buy_on: number }>({
    lines: [{ term: "thon en boîte", amount: 200, buy_on: 0 }],
    usesOf: () => [use(1, 100), use(6, 100)],
    windowOf: () => null,
    splittable: () => true,
    lastRank: 6,
    shopDays: [0],
    rankOf: (l) => l.buy_on,
    withShare: (l, share, rank) => ({ ...l, amount: Math.round(l.amount * share), buy_on: rank }),
  });
  assertEquals(out.lines.map((l) => l.buy_on), [0]);
  assertEquals(out.counts.redated_single, 0);
});
