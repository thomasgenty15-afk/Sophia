#!/usr/bin/env python3
# LE RÉTRÉCISSEMENT SYMÉTRIQUE DES CASSEROLES ET DES COURSES APRÈS UN RETRAIT (2026-09-06, banc 0f, FC4)
#
# Mesuré : après une exclusion de table (poulet + saumon + thon), 21 boîtes ont sauté ; `prep_chicken`
# (1 100 g, 6 parts) et `prep_salmon` ne sont plus tirés par AUCUNE boîte (0 g) et restent cuits et
# achetés pour quatre. La croissance des casseroles (`neededPotFactor`) ne connaît que le sens « plus »
# (`if (!(rawFactor > 1)) continue`), et les courses ne suivent que si un pot a grossi.
#
# Règle : après la croissance, chaque casserole dont TOUS les plats citant sont en boîte est comparée à
# ce que les boîtes lui tirent ; 0 tirage ⇒ retirée (avec ses citations et sa place en session) ;
# tirage sous (1 − tolérance) de sa masse prête ⇒ rétrécie à tirage × marge ; un plat SANS boîte qui la
# cite (mangé à table) la protège. Les courses suivent la DEMANDE par terme (Σ grammes des casseroles et
# du frais, avant/après) — ligne à 0 ⇒ retirée. Tout se compte (`pot_shrink`).
import io, re
ROOT = "supabase/functions/"
def load(p): return io.open(p, encoding="utf-8").read()
writes = {}
def sub(p, old, new, label, count=1):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == count, f"{label} @ {p}: {n} (attendu {count})"
    writes[p] = s.replace(old, new)

# ─────────────────────────── pot_demand.ts : la décision, pure ───────────────────────────
PD = ROOT + "_shared/keel/pot_demand.ts"
writes[PD] = load(PD).rstrip("\n") + '''

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-06 — LE RÉTRÉCISSEMENT SYMÉTRIQUE : UNE CASSEROLE QUE PERSONNE NE
// TIRE NE SE CUIT PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Banc « un retour et les calories » (0f, FC4) : après une exclusion de table,
// 21 boîtes ont sauté et la casserole de poulet (1 100 g, 6 parts) restait cuite
// et achetée pour quatre — `neededPotFactor` ne connaît que le sens « plus », et
// les courses ne suivent que si un pot a grossi. « Les courses et casseroles ne
// rétrécissent jamais après un retrait » était vrai, et c'était un défaut.
//
// La décision est ici, pure et comptée ; l'index l'applique aux ingrédients,
// aux citations, aux sessions et aux courses.
//   · un plat SANS boîte qui cite la casserole (mangé à table, attribué à
//     personne) la PROTÈGE : on ne rétrécit pas ce qu'on ne sait pas mesurer ;
//   · 0 tirage ⇒ facteur 0 : retirée ;
//   · tirage × marge sous (1 − tolérance) de la masse prête ⇒ facteur < 1 ;
//   · sinon rien — la casserole a raison d'avoir des restes.
//
// PURE: no I/O, no clock, no randomness.
export const POT_SHRINK_TOLERANCE = 0.15;

export type PotShrinkVerdict =
  | { factor: 0; reason: "removed" }
  | { factor: number; reason: "shrunk" }
  | { factor: 1; reason: "kept" | "unboxed_use" | "unreadable" };

export function potShrinkPlan(
  pots: readonly {
    id: string;
    /** Masse prête (`preparationReadyGrams`), `null` si illisible. */
    readyGrams: number | null;
    /** Ce que les boîtes lui tirent, en grammes, après ceinture, relance et recours. */
    drawnGrams: number;
    /** Nombre de plats SANS boîte qui la citent. */
    unboxedUses: number;
  }[],
  opts: { margin: number; tolerance?: number } ,
): Map<string, PotShrinkVerdict> {
  const tolerance = opts.tolerance ?? POT_SHRINK_TOLERANCE;
  const out = new Map<string, PotShrinkVerdict>();
  for (const pot of pots) {
    if (pot.unboxedUses > 0) {
      out.set(pot.id, { factor: 1, reason: "unboxed_use" });
      continue;
    }
    if (!(pot.drawnGrams > 0)) {
      out.set(pot.id, { factor: 0, reason: "removed" });
      continue;
    }
    if (pot.readyGrams === null || !(pot.readyGrams > 0)) {
      out.set(pot.id, { factor: 1, reason: "unreadable" });
      continue;
    }
    const wanted = pot.drawnGrams * opts.margin;
    if (wanted >= pot.readyGrams * (1 - tolerance)) {
      out.set(pot.id, { factor: 1, reason: "kept" });
      continue;
    }
    out.set(pot.id, { factor: wanted / pot.readyGrams, reason: "shrunk" });
  }
  return out;
}
'''

PT = ROOT + "_shared/keel/pot_demand_test.ts"
s = writes.get(PT) or load(PT)
m = re.search(r'import \{([^}]*)\} from "\./pot_demand\.ts";', s); assert m
blk = m.group(0)
if "potShrinkPlan" not in blk:
    s = s.replace(blk, blk.replace("{", "{ potShrinkPlan, POT_SHRINK_TOLERANCE,", 1), 1)
writes[PT] = s.rstrip("\n") + '''

// ⟳ 2026-09-06 — LE RÉTRÉCISSEMENT SYMÉTRIQUE (banc 0f, FC4)
Deno.test("potShrinkPlan — une casserole que personne ne tire est retirée ; sous-tirée, rétrécie à tirage × marge ; un plat sans boîte la protège", () => {
  const plan = potShrinkPlan([
    { id: "chicken", readyGrams: 900, drawnGrams: 0, unboxedUses: 0 },
    { id: "beans", readyGrams: 8000, drawnGrams: 3000, unboxedUses: 0 },
    { id: "table_dish", readyGrams: 2000, drawnGrams: 0, unboxedUses: 1 },
    { id: "fine", readyGrams: 1000, drawnGrams: 900, unboxedUses: 0 },
    { id: "blind", readyGrams: null, drawnGrams: 300, unboxedUses: 0 },
  ], { margin: 1.05 });
  assertEquals(plan.get("chicken"), { factor: 0, reason: "removed" });
  const beans = plan.get("beans")!;
  assertEquals(beans.reason, "shrunk");
  assert(Math.abs(beans.factor - (3000 * 1.05) / 8000) < 1e-9, String(beans.factor));
  assertEquals(plan.get("table_dish"), { factor: 1, reason: "unboxed_use" });
  assertEquals(plan.get("fine"), { factor: 1, reason: "kept" });
  assertEquals(plan.get("blind"), { factor: 1, reason: "unreadable" });
  // La tolérance est celle du dépôt, et elle borne : à 86 % de tirage, on garde.
  assertEquals(POT_SHRINK_TOLERANCE, 0.15);
  assertEquals(potShrinkPlan([{ id: "x", readyGrams: 1000, drawnGrams: 860 / 1.05, unboxedUses: 0 }], { margin: 1.05 }).get("x")!.reason, "kept");
});
'''

# ─────────────────────────── l'index foyer : l'application ───────────────────────────
IX = ROOT + "generate-household-meal-v1/index.ts"
s = load(IX)
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/pot_demand\.ts";', s); assert m, "import pot_demand"
blk = m.group(0)
if "potShrinkPlan" not in blk:
    s = s.replace(blk, blk.replace("{", "{\n  potShrinkPlan,", 1), 1)
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/meal_generation\.ts";', s); assert m, "import meal_generation"
blk = m.group(0)
if "normalizePantryTerm" not in blk:
    s = s.replace(blk, blk.replace("{", "{\n  normalizePantryTerm,", 1), 1)
writes[IX] = s

# 1. la demande par terme AVANT la croissance (casseroles + frais des plats)
sub(IX, '''    const growth = { scaled: 0, capped: 0, shopping: 0, unrewritable: 0, regrammed: 0, passes: 0, short_after: 0 };''',
'''    const growth = { scaled: 0, capped: 0, shopping: 0, unrewritable: 0, regrammed: 0, passes: 0, short_after: 0 };
    // ⟳ 2026-09-06 — LA DEMANDE PAR TERME, AVANT que les casseroles bougent : les
    // courses suivront ce rapport (après / avant) ligne à ligne, pour la
    // croissance comme pour le rétrécissement, au lieu d'un facteur moyen.
    const demandByTerm = (): Map<string, number> => {
      const out = new Map<string, number>();
      const add = (ings: readonly { term: string; amount: number | null; unit: string | null }[]) => {
        for (const ing of ings) {
          const unit = String(ing.unit ?? "").toLowerCase();
          if (unit !== "g" && unit !== "ml") continue;
          const g = Number(ing.amount);
          if (!Number.isFinite(g) || g <= 0) continue;
          const key = normalizePantryTerm(ing.term);
          out.set(key, (out.get(key) ?? 0) + g);
        }
      };
      for (const prep of meal.preparations) add(prep.ingredients);
      for (const dish of meal.dishes) add(dish.ingredients);
      return out;
    };
    const demandBefore = demandByTerm();''', "demande avant")

# 2. le rétrécissement, après la croissance et avant le dimensionnement — et les courses par terme
sub(IX, '''    growth.short_after = [...potGrowth.values()].filter((f) => f > 1.02).length;
    if (growth.scaled > 0 && meal.shopping_list.length > 0) {''',
'''    growth.short_after = [...potGrowth.values()].filter((f) => f > 1.02).length;

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-06 — LE RÉTRÉCISSEMENT SYMÉTRIQUE (banc 0f, FC4)
    // ══════════════════════════════════════════════════════════════════════
    //
    // Après une exclusion de table, 21 boîtes avaient sauté et la casserole de
    // poulet restait cuite et achetée pour quatre : la croissance ne connaît
    // que le sens « plus », et les courses ne suivaient que si un pot avait
    // grossi. La décision est dans `potShrinkPlan` (pure, comptée) ; ici on
    // l'applique — aux ingrédients, aux citations des plats, aux sessions.
    const shrinkCounts = {
      pots: 0,
      removed: 0,
      kept: 0,
      unboxed_use: 0,
      unreadable: 0,
      sessions_emptied: 0,
      lines_scaled: 0,
      lines_dropped: 0,
      lines_unattributed: 0,
      lines_unrewritable: 0,
    };
    {
      const drawnByPot = new Map<string, number>();
      for (const box of sizableBoxes) {
        for (const it of box.items) {
          if (!it.preparationId) continue;
          const g = Number(it.grams);
          if (!Number.isFinite(g) || g <= 0) continue;
          drawnByPot.set(it.preparationId, (drawnByPot.get(it.preparationId) ?? 0) + g);
        }
      }
      const unboxedUses = new Map<string, number>();
      for (const dish of meal.dishes) {
        if (dish.boxes.length > 0) continue;
        for (const use of dish.uses) unboxedUses.set(use.preparationId, (unboxedUses.get(use.preparationId) ?? 0) + 1);
      }
      const verdicts = potShrinkPlan(
        meal.preparations.map((prep) => ({
          id: prep.id,
          readyGrams: composition ? preparationReadyGrams(prep.ingredients, composition) : null,
          drawnGrams: drawnByPot.get(prep.id) ?? 0,
          unboxedUses: unboxedUses.get(prep.id) ?? 0,
        })),
        { margin: POT_GROWTH_MARGIN },
      );
      const removed = new Set<string>();
      for (const prep of meal.preparations) {
        const v = verdicts.get(prep.id);
        if (!v) continue;
        if (v.reason === "removed") {
          removed.add(prep.id);
          shrinkCounts.removed++;
          continue;
        }
        if (v.reason !== "shrunk") {
          shrinkCounts[v.reason]++;
          continue;
        }
        const shrunk = scaleIngredients(prep.ingredients, v.factor);
        if (shrunk.changed === 0) {
          shrinkCounts.kept++;
          continue;
        }
        shrinkCounts.pots++;
        prep.ingredients.splice(0, prep.ingredients.length, ...shrunk.items);
      }
      if (removed.size > 0) {
        meal.preparations = meal.preparations.filter((p) => !removed.has(p.id));
        for (const dish of meal.dishes) dish.uses = dish.uses.filter((u) => !removed.has(u.preparationId));
        for (const session of meal.cooking_sessions) {
          session.preparationIds = session.preparationIds.filter((id) => !removed.has(id));
          if (session.preparationIds.length === 0) shrinkCounts.sessions_emptied++;
        }
        meal.cooking_sessions = meal.cooking_sessions.filter((s) => s.preparationIds.length > 0);
        issues.push(
          `preparations: ${removed.size} batch(es) no box draws on any more -- not cooked, not bought (${[...removed].join(", ")})`,
        );
      }
      if (shrinkCounts.pots > 0) growth.regrammed += regramMeal(meal, composition);
    }
    // ── LES COURSES SUIVENT LA DEMANDE PAR TERME, dans les deux sens ─────────
    // Une ligne dont la demande est tombée à zéro est retirée ; une ligne dont
    // aucun plat ni casserole ne porte le terme reste telle quelle, et se compte.
    if (meal.shopping_list.length > 0 && (growth.scaled > 0 || shrinkCounts.pots > 0 || shrinkCounts.removed > 0)) {
      const demandAfter = demandByTerm();
      const kept: typeof meal.shopping_list = [];
      for (const line of meal.shopping_list) {
        const key = normalizePantryTerm(line.term);
        const before = demandBefore.get(key) ?? 0;
        if (!(before > 0)) {
          shrinkCounts.lines_unattributed++;
          kept.push(line);
          continue;
        }
        const after = demandAfter.get(key) ?? 0;
        if (!(after > 0)) {
          shrinkCounts.lines_dropped++;
          continue;
        }
        const f = after / before;
        if (Math.abs(f - 1) <= 0.02) {
          kept.push(line);
          continue;
        }
        const scaled = scaleShoppingList([line], f);
        if (scaled.changed > 0) shrinkCounts.lines_scaled++;
        if (scaled.unrewritable.length > 0) shrinkCounts.lines_unrewritable++;
        kept.push(...scaled.items);
      }
      meal.shopping_list.splice(0, meal.shopping_list.length, ...kept);
      growth.shopping = shrinkCounts.lines_scaled;
      growth.unrewritable = shrinkCounts.lines_unrewritable;
    }
    if (growth.scaled > 0 && meal.shopping_list.length > 0) {''', "rétrécissement")

# 2b. l'ancien bloc « courses au facteur moyen » est REMPLACÉ par la demande par terme : on le retire,
# de son ouverture à l'accolade fermante de même indentation.
s = writes[IX]
open_ = "    if (growth.scaled > 0 && meal.shopping_list.length > 0) {"
i = s.index(open_); j = s.index("\n    }\n", i) + len("\n    }\n")
removed_block = s[i:j]
assert "scaleShoppingList(meal.shopping_list, mean)" in removed_block, "le bloc retiré n'est pas celui attendu"
writes[IX] = s[:i] + s[j:]

# 3. sorties : journal (6 espaces) et archive (8 espaces)
sub(IX, '''      pot_growth: growth,\n''', '''      pot_growth: growth,\n      pot_shrink: shrinkCounts,\n''', "journal")
s = writes[IX]
n = s.count("        pot_attribution: potAttribution,\n"); assert n == 1, n
writes[IX] = s.replace("        pot_attribution: potAttribution,\n", "        pot_attribution: potAttribution,\n        pot_growth: growth,\n        pot_shrink: shrinkCounts,\n", 1)

for p, t in writes.items():
    io.open(p, "w", encoding="utf-8").write(t)
print("écrit:", len(writes)); [print("  ", p) for p in writes]
