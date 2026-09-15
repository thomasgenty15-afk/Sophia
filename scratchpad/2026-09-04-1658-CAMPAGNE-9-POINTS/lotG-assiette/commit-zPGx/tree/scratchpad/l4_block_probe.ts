/**
 * L4 — L'ÉTAT INITIAL DU BLOC FOYER, MESURÉ (pas repris de mémoire).
 *
 * Le rapport transverse donne UN chiffre: 2 632 car. sur le pire cas de FF-010
 * (foyer de 6 × 7 jours). Ce chiffre est un point, pas une borne. Ce que ce lot
 * doit établir, c'est la LOI DE CROISSANCE: quelles sources font grandir le
 * bloc, et laquelle n'a aucun plafond.
 *
 * ── LA MÉTHODE ─────────────────────────────────────────────────────────────
 * On passe par `loadHouseholdTurnContext` (le vrai chargeur) sur un PostgREST
 * en mémoire qui applique vraiment ses filtres, et dont les CLÉS sont celles de
 * la production: `cook_on`, `user_id`, `display_name`, `portion_note`.
 * ⚠️ T-15: la première fixture de FF-010 écrivait `cookOn` et a rendu 14 tests
 * verts et faux sur CE bloc précis. La forme est recopiée du test de production.
 *
 * Chaque configuration est mesurée deux fois: le bloc entier, et le bloc avec
 * chaque source vidée à tour de rôle (laisser-un-dehors) — ce qui donne le coût
 * MARGINAL de chaque section, et le PLANCHER FIXE quand tout est vide.
 *
 * usage: deno run --allow-read scratchpad/l4_block_probe.ts
 */
import {
  householdContextBlock,
  loadHouseholdTurnContext,
} from "../supabase/functions/_shared/keel/household_turn_context.ts";

const HOUSE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TODAY = "2026-08-05"; // mercredi → jeton `wed`
const STARTS = "2026-08-03";
const ENDS = "2026-08-09";

type Tables = Record<string, Array<Record<string, unknown>>>;

function stubDb(tables: Tables, roster: Array<Record<string, unknown>>) {
  function builder(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const rows = tables[table] ?? [];
    const selected = () =>
      rows.filter((row) =>
        filters.every(([op, column, value]) => {
          const actual = row[column];
          if (op === "eq") return String(actual ?? "") === String(value ?? "");
          if (op === "is") return value === null ? actual == null : actual === value;
          if (op === "lte") return String(actual ?? "") <= String(value ?? "");
          if (op === "gte") return String(actual ?? "") >= String(value ?? "");
          return true;
        })
      );
    // deno-lint-ignore no-explicit-any
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq(c: string, v: unknown) {
        filters.push(["eq", c, v]);
        return api;
      },
      is(c: string, v: unknown) {
        filters.push(["is", c, v]);
        return api;
      },
      lte(c: string, v: unknown) {
        filters.push(["lte", c, v]);
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push(["gte", c, v]);
        return api;
      },
      maybeSingle: () => Promise.resolve({ data: selected()[0] ?? null, error: null }),
      // deno-lint-ignore no-explicit-any
      then(resolve: (v: any) => unknown) {
        return Promise.resolve({ data: selected(), error: null }).then(resolve);
      },
    };
    return api;
  }
  return {
    from: builder,
    rpc: (_n: string, _a: unknown) => Promise.resolve({ data: roster, error: null }),
  };
}

// ---------------------------------------------------------------------------
// LES DÉCORS
// ---------------------------------------------------------------------------

type Shape = {
  members: number;
  minors: number;
  /** longueur des titres de plats / préparations / notes / termes de courses */
  verbosity: "court" | "reel" | "bavard";
  restrictions: number;
  shoppingLines: number;
  kind: "family" | "shared";
  /** ma position dans le tableau `member_portions` (défaut: première). */
  mePos?: number;
  /** libellés de restriction réalistes (un aliment) plutôt qu'au CHECK. */
  shortLabels?: boolean;
  /**
   * Plan d'UN SEUL JOUR: tous les plats et toutes les préparations tombent
   * aujourd'hui, donc les quatre plats et les trois cuissons sont TOUS
   * incompressibles en même temps. C'est le maximum structurel du bloc.
   */
  oneDayPlan?: boolean;
};

const NAMES = [
  "Ana", "Bea", "Cleo", "Dan", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jo",
  "Kai", "Lena", "Milo", "Nia", "Oscar", "Pia", "Quim", "Rae", "Sami", "Tao",
  "Uma", "Vik", "Wren", "Xan", "Yara", "Zed",
];

function pad(base: string, verbosity: Shape["verbosity"], long: string): string {
  if (verbosity === "court") return base;
  if (verbosity === "reel") return `${base}: ${long}`;
  // « bavard » = ce qu'un générateur LLM écrit quand rien ne l'en empêche.
  return `${base}: ${long} ${long} ${long}`;
}

function decor(shape: Shape): { tables: Tables; roster: Array<Record<string, unknown>> } {
  // `mePos` décide où JE me trouve dans le tableau des portions. La production
  // ne garantit aucun ordre, et la borne actuelle est un `slice(0, 6)` SANS
  // priorité — donc au-delà de six membres, ma propre part peut déjà tomber.
  const mePos = shape.mePos ?? 0;
  const ids = Array.from({ length: shape.members }, (_, i) => i === mePos ? ME : `u-${i}`);
  const roster = ids.map((id, i) => ({
    user_id: id,
    first_name: NAMES[i % NAMES.length],
    is_minor: i >= shape.members - shape.minors && shape.minors > 0,
    role: i === 0 ? "owner" : "member",
    restriction_consent_at: null,
  }));

  const longDish =
    "slow-braised beef shoulder with root vegetables, pearl barley and a gremolata of parsley and lemon zest";
  const longPrep =
    "brown the shoulder in two batches, deglaze, then braise covered at 150C until it pulls apart with a fork";
  const longNote =
    "full protein share with a moderate starch portion and a generous helping of the green vegetables on the side";
  const longTerm = "beef shoulder, boneless, trimmed and cut into large chunks";

  // SEPT JOURS: 14 plats, 12 préparations — le pire cas nommé par FF-010 §9.
  const tokens = shape.oneDayPlan
    ? ["wed", "wed", "wed", "wed", "wed", "wed", "wed"]
    : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const dishes: unknown[] = [];
  const preps: unknown[] = [];
  for (let d = 0; d < 7; d++) {
    const tok = tokens[d];
    dishes.push({
      title: pad(`Day ${d + 1} lunch`, shape.verbosity, longDish),
      slot: "lunch",
      day: tok,
    });
    dishes.push({
      title: pad(`Day ${d + 1} dinner`, shape.verbosity, longDish),
      slot: "dinner",
      day: tok,
    });
    preps.push({ id: `p${d}a`, title: pad(`Batch ${d + 1}`, shape.verbosity, longPrep), cook_on: tok });
    if (d % 2 === 0) {
      preps.push({ id: `p${d}b`, title: pad(`Roast ${d + 1}`, shape.verbosity, longPrep), cook_on: tok });
    }
  }

  return {
    roster,
    tables: {
      household_members: [{ user_id: ME, household_id: HOUSE }],
      households: [{ id: HOUSE, kind: shape.kind }],
      student_generated_meals: [{
        id: "plan",
        household_id: HOUSE,
        retired_at: null,
        starts_on: STARTS,
        ends_on: ENDS,
        dishes,
        preparations: preps,
        member_portions: ids.map((id, i) => ({
          user_id: id,
          display_name: NAMES[i % NAMES.length],
          portion_note: pad(`share ${i + 1}`, shape.verbosity, longNote),
        })),
        shopping_list: Array.from({ length: shape.shoppingLines }, (_, i) => ({
          term: pad(`item ${i + 1}`, shape.verbosity, longTerm),
          quantity: `${i + 1} units`,
          aisle: "produce",
        })),
      }],
      household_food_restrictions: Array.from(
        { length: shape.restrictions },
        (_, i) => ({
          label: shape.shortLabels || shape.verbosity === "court"
            ? ["chocolate spread", "sugary cereals", "fizzy drinks", "crisps", "energy drinks", "sweets"][i % 6]
            // Le CHECK de la base plafonne à 120 caractères — le voici, plein.
            : `restriction ${i + 1}: ${"x".repeat(105 - String(i).length)}`,
          created_by: ME,
          household_id: HOUSE,
          member_user_id: ME,
        }),
      ),
    },
  };
}

async function blockFor(shape: Shape): Promise<{ chars: number; block: string }> {
  const { tables, roster } = decor(shape);
  const ctx = await loadHouseholdTurnContext(stubDb(tables, roster), {
    userId: ME,
    localDate: TODAY,
  });
  if (!ctx) throw new Error("contexte null — le décor est faux");
  const block = householdContextBlock(ctx);
  return { chars: block.length, block };
}

// ---------------------------------------------------------------------------
// LE PLANCHER FIXE: tout vide, un seul membre.
// ---------------------------------------------------------------------------
const floor = await blockFor({
  members: 1,
  minors: 0,
  verbosity: "court",
  restrictions: 0,
  shoppingLines: 0,
  kind: "family",
});
console.log(`PLANCHER FIXE (1 membre, rien d'autre) : ${floor.chars} car.`);

// ---------------------------------------------------------------------------
// LA LOI DE CROISSANCE
// ---------------------------------------------------------------------------
const CASES: Array<{ nom: string; shape: Shape }> = [
  { nom: "témoin · sans foyer", shape: { members: 1, minors: 0, verbosity: "court", restrictions: 0, shoppingLines: 0, kind: "family" } },
  { nom: "témoin · foyer de 1", shape: { members: 1, minors: 0, verbosity: "reel", restrictions: 0, shoppingLines: 6, kind: "family" } },
  { nom: "témoin · foyer de 2", shape: { members: 2, minors: 0, verbosity: "reel", restrictions: 0, shoppingLines: 8, kind: "family" } },
  { nom: "PIRE CAS CONNU · 6 × 7j (court)", shape: { members: 6, minors: 2, verbosity: "court", restrictions: 0, shoppingLines: 24, kind: "family" } },
  { nom: "PIRE CAS CONNU · 6 × 7j (réel)", shape: { members: 6, minors: 2, verbosity: "reel", restrictions: 0, shoppingLines: 24, kind: "family" } },
  { nom: "6 × 7j réel + 6 restrictions", shape: { members: 6, minors: 2, verbosity: "reel", restrictions: 6, shoppingLines: 24, kind: "family" } },
  { nom: "AU-DELÀ · 12 membres, réel", shape: { members: 12, minors: 4, verbosity: "reel", restrictions: 6, shoppingLines: 24, kind: "family" } },
  { nom: "AU-DELÀ · 20 membres, réel", shape: { members: 20, minors: 6, verbosity: "reel", restrictions: 6, shoppingLines: 24, kind: "family" } },
  { nom: "AU-DELÀ · 6 membres, BAVARD", shape: { members: 6, minors: 2, verbosity: "bavard", restrictions: 6, shoppingLines: 24, kind: "family" } },
  { nom: "AU-DELÀ · 20 membres, BAVARD", shape: { members: 20, minors: 6, verbosity: "bavard", restrictions: 6, shoppingLines: 24, kind: "family" } },
  { nom: "colocation · 20 membres, bavard", shape: { members: 20, minors: 0, verbosity: "bavard", restrictions: 6, shoppingLines: 24, kind: "shared" } },
  // Les restrictions RÉELLES sont des aliments (« pâte à tartiner »), pas des
  // phrases de 120 caractères. Le cas ci-dessus est la borne du CHECK, pas la vie.
  { nom: "6 × 7j réel + 6 restrictions courtes", shape: { members: 6, minors: 2, verbosity: "reel", restrictions: 6, shoppingLines: 24, kind: "family", shortLabels: true } },
  // LE MAXIMUM STRUCTUREL: tout l'incompressible à sa borne, en même temps.
  { nom: "🔒 MAXIMUM STRUCTUREL", shape: { members: 20, minors: 6, verbosity: "bavard", restrictions: 6, shoppingLines: 40, kind: "shared", oneDayPlan: true } },
];

console.log("\n=== LE BLOC FOYER, MESURÉ ===");
const rows: Array<Record<string, unknown>> = [];
for (const c of CASES) {
  const { chars, block } = await blockFor(c.shape);
  rows.push({ nom: c.nom, chars, shape: c.shape });
  console.log(`${c.nom.padEnd(34)} : ${String(chars).padStart(6)} car.`);
  if (Deno.args.includes("--dump") && c.nom.includes("20 membres, BAVARD")) {
    console.log("\n--- LE BLOC ---\n" + block + "\n--- FIN ---\n");
  }
}

// ---------------------------------------------------------------------------
// LAISSER-UN-DEHORS: le coût marginal de chaque source, sur le pire cas connu.
// ---------------------------------------------------------------------------
const base: Shape = {
  members: 6, minors: 2, verbosity: "reel", restrictions: 6, shoppingLines: 24, kind: "family",
};
const full = await blockFor(base);
console.log(`\n=== COÛT MARGINAL (base = 6 membres réel + restrictions = ${full.chars} car.) ===`);
const variants: Array<[string, Shape]> = [
  ["sans les restrictions", { ...base, restrictions: 0 }],
  ["sans la liste de courses", { ...base, shoppingLines: 0 }],
  ["1 membre au lieu de 6", { ...base, members: 1, minors: 0 }],
  ["aucun mineur", { ...base, minors: 0 }],
];
for (const [nom, shape] of variants) {
  const v = await blockFor(shape);
  console.log(`${nom.padEnd(30)} : ${String(v.chars).padStart(6)} car.  (Δ = ${full.chars - v.chars})`);
}

// ---------------------------------------------------------------------------
// ⚠️ MA PORTION EST-ELLE TOUJOURS LÀ ? La borne actuelle est un `slice(0, 6)`
// sans priorité: dans un foyer de douze, si je suis douzième dans le tableau,
// ma part — le cœur de la fiche — tombe AVANT celle de gens que je ne suis pas.
// ---------------------------------------------------------------------------
console.log("\n=== MA PORTION SURVIT-ELLE À LA BORNE ACTUELLE ? ===");
for (const [n, pos] of [[6, 5], [12, 11], [20, 19], [12, 0]] as Array<[number, number]>) {
  const { block } = await blockFor({
    members: n, minors: 0, verbosity: "reel", restrictions: 0,
    shoppingLines: 12, kind: "family", mePos: pos,
  });
  const mine = block.includes("(this student)");
  console.log(
    `foyer de ${String(n).padStart(2)}, je suis en position ${String(pos + 1).padStart(2)} : ` +
      `ma portion ${mine ? "PRÉSENTE" : "🔴 ABSENTE DU BLOC"}`,
  );
}

await Deno.writeTextFile(
  new URL("./l4_block_probe.json", import.meta.url),
  JSON.stringify({ floorChars: floor.chars, rows }, null, 2),
);
