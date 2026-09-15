#!/usr/bin/env python3
# LE COMPTEUR « BAC COMMUN SEUL » COMPARE AU BESOIN DES MOMENTS QUE LES BACS COUVRENT (2026-09-06)
#
# Mesuré sur FC4 (16:50) : les 18 journées-bouche `tub_estimate ≥ 200` comparaient Σ kcal des bacs /
# mangeurs à la cible de la JOURNÉE ENTIÈRE, alors que les bacs ne couvrent que déjeuner + dîner — petit-
# déjeuner, collations et coucher sont des plats mangés à table, sans boîte pour personne, attribués à
# personne. Sur les moments couverts, les bacs sont à 85–92 % du besoin (vendredi, jeudi, samedi) ; à 50 %
# le mardi (`factor_clamped` : le bac du modèle était sous le tiers, ANCHOR_FACTOR_MAX a mordu). Le compteur
# disait « tout le monde sous le besoin » là où c'était « la moitié des moments n'est pas en boîte ».
# Désormais : `wantedKcal` du bac = la part de la cible de la bouche sur les moments que SES bacs couvrent
# (`slotPlanTargets`, comme la règle du bac), et les moments servis à table restent comptés à part
# (`lost_slots` ne les voit pas : personne n'a de boîte — c'est voulu).
import io, re
ROOT = "supabase/functions/"
def load(p): return io.open(p, encoding="utf-8").read()
writes = {}
def sub(p, old, new, label, count=1):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == count, f"{label} @ {p}: {n} (attendu {count})"
    writes[p] = s.replace(old, new)

PD = ROOT + "_shared/keel/pot_demand.ts"
sub(PD, '''  tubServed: ReadonlyMap<string, number | null> = new Map(),
): UnmetDemand[] {''', '''  tubServed: ReadonlyMap<string, { servedKcal: number | null; wantedKcal: number }> = new Map(),
): UnmetDemand[] {''', "signature")
sub(PD, '''   * ⟳ 2026-09-06 — le servi ESTIMÉ des journées « bac commun seul », clé
   * `<memberId> <day>` (la clé des ancres) : Σ kcal des bacs de la journée
   * divisée par leurs mangeurs, `null` quand un bac est illisible. Optionnel :
   * sans lui, ces journées restent `not_anchored`, comme hier.''', '''   * ⟳ 2026-09-06 — le servi ESTIMÉ des journées « bac commun seul », clé
   * `<memberId> <day>` (la clé des ancres) : Σ kcal des bacs de la journée
   * divisée par leurs mangeurs (`null` quand un bac est illisible), et le
   * BESOIN DES MOMENTS QUE CES BACS COUVRENT — pas la journée entière : un
   * petit-déjeuner mangé à table, sans boîte pour personne, n'est la dette
   * d'aucun bac (mesuré sur FC4 : la cible de journée faisait lire 18/18
   * journées sous le besoin là où les bacs étaient à 85–92 % de leurs moments).
   * Optionnel : sans lui, ces journées restent `not_anchored`, comme hier.''', "doc")
sub(PD, '''      const served = tubServed.get(key) ?? null;
      out.push({
        memberId: day.memberId,
        day: day.day,
        wantedKcal: Math.round(anchor.targetKcal),
        servedKcal: served === null ? null : Math.round(served),
        unmetKcal: served === null ? null : Math.max(0, Math.round(anchor.targetKcal - served)),
        cause: "tub_estimate",
      });''', '''      const tub = tubServed.get(key)!;
      const served = tub.servedKcal;
      out.push({
        memberId: day.memberId,
        day: day.day,
        wantedKcal: Math.round(tub.wantedKcal),
        servedKcal: served === null ? null : Math.round(served),
        unmetKcal: served === null ? null : Math.max(0, Math.round(tub.wantedKcal - served)),
        cause: "tub_estimate",
      });''', "branche")

PT = ROOT + "_shared/keel/pot_demand_test.ts"
sub(PT, '''  const withTub = unmetDemand(anchors, days, new Map(), new Map([["m_a thu", 1400]]));
  assertEquals(withTub[0].cause, "tub_estimate");
  assertEquals(withTub[0].servedKcal, 1400);
  assertEquals(withTub[0].unmetKcal, 600);
  // Un bac illisible n'est pas un zéro : l'écart reste inconnu, la cause est dite.
  const blind = unmetDemand(anchors, days, new Map(), new Map([["m_a thu", null]]));
  assertEquals(blind[0].cause, "tub_estimate");
  assertEquals(blind[0].unmetKcal, null);
  // Et une journée ANCRÉE n'est jamais remplacée par l'estimation.
  const anchored = new Map(anchors); anchored.set("m_a thu", { ...anchors.get("m_a thu")!, reason: "anchored", raw: 1.2, deliveredKcal: 1600 });
  const kept = unmetDemand(anchored, days, new Map(), new Map([["m_a thu", 100]]));''', '''  // ⟳ le besoin comparé est celui des MOMENTS COUVERTS par les bacs (1 500 ici pour
  // déjeuner + dîner), pas la journée entière (2 000) : le petit-déjeuner mangé à
  // table n'est la dette d'aucun bac.
  const withTub = unmetDemand(anchors, days, new Map(), new Map([["m_a thu", { servedKcal: 1400, wantedKcal: 1500 }]]));
  assertEquals(withTub[0].cause, "tub_estimate");
  assertEquals(withTub[0].servedKcal, 1400);
  assertEquals(withTub[0].wantedKcal, 1500);
  assertEquals(withTub[0].unmetKcal, 100);
  // Un bac illisible n'est pas un zéro : l'écart reste inconnu, la cause est dite.
  const blind = unmetDemand(anchors, days, new Map(), new Map([["m_a thu", { servedKcal: null, wantedKcal: 1500 }]]));
  assertEquals(blind[0].cause, "tub_estimate");
  assertEquals(blind[0].unmetKcal, null);
  // Et une journée ANCRÉE n'est jamais remplacée par l'estimation.
  const anchored = new Map(anchors); anchored.set("m_a thu", { ...anchors.get("m_a thu")!, reason: "anchored", raw: 1.2, deliveredKcal: 1600 });
  const kept = unmetDemand(anchored, days, new Map(), new Map([["m_a thu", { servedKcal: 100, wantedKcal: 1500 }]]));''', "test")

IX = ROOT + "generate-household-meal-v1/index.ts"
sub(IX, '''    const tubServed = new Map<string, number | null>();
    if (composition) {''', '''    const tubServed = new Map<string, { servedKcal: number | null; wantedKcal: number }>();
    if (composition) {
      // ⟳ 2026-09-06 (FC4 16:50) — LE BESOIN COMPARÉ EST CELUI DES MOMENTS QUE LES
      // BACS COUVRENT. Comparer à la journée entière faisait lire 18/18 journées
      // sous le besoin là où les bacs étaient à 85–92 % de leurs moments : le
      // petit-déjeuner et les collations mangés à table n'ont de boîte pour
      // personne, et ne sont la dette d'aucun bac. Même part que la règle du bac
      // (`slotPlanTargets`, cible d'entretien comme `potFactorFor`).
      const tubKcal = new Map<string, number | null>();
      const tubSlots = new Map<string, Set<string>>();''', "decl")
sub(IX, '''      for (const box of sizedBoxes) {
        if (box.memberIds.length < 2) continue;
        for (const memberId of box.memberIds) {
          const key = `${memberId} ${box.day ?? ""}`;
          const prev = tubServed.get(key);
          if (prev === null) continue;
          tubServed.set(
            key,
            box.kcal === null ? null : (prev ?? 0) + box.kcal / box.memberIds.length,
          );
        }
      }
    }''', '''      for (const box of sizedBoxes) {
        if (box.memberIds.length < 2) continue;
        for (const memberId of box.memberIds) {
          const key = `${memberId} ${box.day ?? ""}`;
          if (box.slot !== null) {
            const set = tubSlots.get(key) ?? new Set<string>();
            set.add(box.slot);
            tubSlots.set(key, set);
          }
          const prev = tubKcal.get(key);
          if (prev === null) continue;
          tubKcal.set(key, box.kcal === null ? null : (prev ?? 0) + box.kcal / box.memberIds.length);
        }
      }
      const daySlotsByKey = new Map<string, readonly string[]>();
      for (const row of dayEnergyRows) daySlotsByKey.set(`${row.memberId} ${row.day ?? ""}`, row.slots);
      for (const [key, servedKcal] of tubKcal) {
        const memberId = key.slice(0, key.indexOf(" "));
        const mouth = anchorMouths.get(memberId);
        if (mouth === undefined) continue;
        const target = mouthTargetKcal({ ...mouth, direction: null }, coachCounting).kcal;
        if (target === null) continue;
        const covered = [...(tubSlots.get(key) ?? [])];
        const wanted = slotPlanTargets({
          targetKcal: target,
          coveredSlots: covered,
          wholeSlots: [...mouth.declaredSlots, ...(daySlotsByKey.get(key) ?? [])],
          slotExtraKcal: mouth.slotExtraKcal,
        }).total;
        if (!(wanted > 0)) continue;
        tubServed.set(key, { servedKcal, wantedKcal: wanted });
      }
    }''', "boucle")
s = writes[IX]
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/mouth_anchor\.ts";', s); assert m
blk = m.group(0)
for name in ("mouthTargetKcal", "slotPlanTargets"):
    if re.search(r'\b' + name + r'\b', blk) is None:
        blk2 = blk.replace("{", "{\n  " + name + ",", 1); s = s.replace(blk, blk2, 1); blk = blk2
writes[IX] = s
for p, t in writes.items():
    io.open(p, "w", encoding="utf-8").write(t)
print("écrit:", len(writes)); [print("  ", p) for p in writes]
