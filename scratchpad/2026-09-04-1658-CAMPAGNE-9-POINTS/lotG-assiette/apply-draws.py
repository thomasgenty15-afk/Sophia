#!/usr/bin/env python3
# LA CROISSANCE DES CASSEROLES ATTRIBUE LES TIRAGES PAR ITEM, PAS PAR `uses.servings` (2026-09-06)
#
# Mesuré sur FC4 (16:06) : chaque plat « quinoa + dinde / tofu » cite DEUX casseroles (`uses` : dinde 1,
# tofu 1) ; les boîtes des omnivores ne tirent que la dinde, celle de Nora que le tofu. `neededPotFactor`
# répartissait les grammes voulus de chaque boîte à parts égales entre les deux casseroles citées par le
# PLAT → la dinde grossissait de moitié (`capped_by_pot`, « 5 931 g voulus pour 4 000 g »), le tofu du
# double (gaspillage). C'est le même artefact que le lot 0 (l'énergie suivait `uses.servings`), pris par
# la croissance. Désormais un tirage par (boîte, casserole), sur les grammes des items qui la citent.
import io, re
ROOT = "supabase/functions/"
def load(p): return io.open(p, encoding="utf-8").read()
writes = {}
def sub(p, old, new, label, count=1):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == count, f"{label} @ {p}: {n} (attendu {count})"
    writes[p] = s.replace(old, new)

IX = ROOT + "generate-household-meal-v1/index.ts"
OLD_DRAW = '''      sizableBoxes.map((box) => ({
          shares: [{ key: box.boxId, grams: box.items.reduce((n, it) => n + (it.grams ?? 0), 0) }],
          uses: box.uses,
        })),'''
OLD_DRAW2 = '''      sizableBoxes.map((box) => ({
        shares: [{ key: box.boxId, grams: box.items.reduce((n, it) => n + (it.grams ?? 0), 0) }],
        uses: box.uses,
      })),'''
s = load(IX)
assert s.count(OLD_DRAW) == 1 and s.count(OLD_DRAW2) == 1, (s.count(OLD_DRAW), s.count(OLD_DRAW2))
s = s.replace(OLD_DRAW, "      potDrawsByItems(sizableBoxes),", 1).replace(OLD_DRAW2, "      potDrawsByItems(sizableBoxes),", 1)
writes[IX] = s
sub(IX, '''    const POT_GROWTH_MARGIN = 1.05;''', '''    // ⟳ 2026-09-06 — UN TIRAGE PAR (BOÎTE, CASSEROLE), SUR LES ITEMS QUI LA CITENT.
    // Mesuré sur FC4 : chaque plat « quinoa + dinde / tofu » cite DEUX casseroles
    // (`uses` : dinde 1, tofu 1) ; les boîtes des omnivores ne tirent que la
    // dinde, celle de Nora que le tofu. Répartir les grammes voulus de chaque
    // boîte à parts égales entre les casseroles du PLAT faisait grossir la
    // dinde de moitié (`capped_by_pot`, « 5 931 g voulus pour 4 000 g ») et le
    // tofu du double. Même artefact que le lot 0 (`uses.servings`), pris par la
    // croissance : ici l'item dit quelle casserole il tire, et de combien.
    const potDrawsByItems = (
      boxes: readonly { boxId: string; items: readonly { grams: number | null; preparationId: string | null }[] }[],
    ) =>
      boxes.flatMap((box) => {
        const byPot = new Map<string, number>();
        for (const it of box.items) {
          if (!it.preparationId) continue;
          const g = Number(it.grams);
          if (!Number.isFinite(g) || g <= 0) continue;
          byPot.set(it.preparationId, (byPot.get(it.preparationId) ?? 0) + g);
        }
        return [...byPot].map(([preparationId, grams]) => ({
          shares: [{ key: box.boxId, grams }],
          uses: [{ preparationId, servings: 1 }],
        }));
      });
    const POT_GROWTH_MARGIN = 1.05;''', "helper")

PT = ROOT + "_shared/keel/pot_regram_test.ts"
_pt = load(PT)
if "assertEquals" not in _pt.split("\n")[0]:
    _pt = _pt.replace('import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";', 'import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";', 1)
    assert "assertEquals" in _pt.split("\n")[0], "import assertEquals non posé"
writes[PT] = _pt.rstrip("\n") + '''

Deno.test("CÂBLAGE — la croissance des pots attribue les tirages PAR ITEM (une boîte, une casserole), plus par `uses.servings`", async () => {
  const src = await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  // Le patron d'avant — la boîte entière répartie sur les `uses` du plat — a disparu.
  assert(!src.includes("shares: [{ key: box.boxId, grams: box.items.reduce("), "les tirages suivaient encore `uses.servings`");
  // Les deux appels (passes de croissance, puis `short_after`) lisent les items.
  assertEquals((src.match(/neededPotFactor\\(\\n\\s*potDrawsByItems\\(sizableBoxes\\),/g) ?? []).length, 2);
  assert(src.includes("uses: [{ preparationId, servings: 1 }],"), "un tirage par (boîte, casserole)");
});
'''
for p, t in writes.items():
    io.open(p, "w", encoding="utf-8").write(t)
print("écrit:", len(writes)); [print("  ", p) for p in writes]
