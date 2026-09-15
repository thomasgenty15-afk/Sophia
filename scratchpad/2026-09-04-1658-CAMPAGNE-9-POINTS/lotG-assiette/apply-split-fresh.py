#!/usr/bin/env python3
# Les paires « X veut ce que Y refuse » du COMPTEUR lisent aussi les items de la note fraîche (`noteBelt`,
# 22ab729c de 0f) ; celles du PROMPT restent sur les deux magasins (pas d'await du classifieur avant les blocs).
import io, re
P = "supabase/functions/generate-household-meal-v1/index.ts"
s = io.open(P, encoding="utf-8").read()
def sub(old, new, label):
    global s
    n = s.count(old); assert n == 1, f"{label}: {n}"; s = s.replace(old, new)
sub('''    const preferenceSplits: PreferenceSplit[] = (() => {
      const nameOf = new Map(platedMembers.map((m) => [m.memberId, m.displayName]));
      const byTerm = new Map<string, { term: string; wants: Set<string>; refuses: Set<string> }>();
      for (const item of [...retainedDurable.items, ...retainedNextPlan]) {''',
'''    // Une seule écriture de la règle des paires, deux lectures : le PROMPT lit les
    // magasins (durable + prochain plan) ; le COMPTEUR d'après ceinture y ajoute les
    // items de la NOTE FRAÎCHE (`noteBelt`, classée avant le plan depuis 22ab729c) —
    // sans attendre le classifieur avant les blocs (≤ 25 s), la note est déjà
    // verbatim dans le prompt.
    const splitsFrom = (items: readonly RetainedItem[]): PreferenceSplit[] => {
      const nameOf = new Map(platedMembers.map((m) => [m.memberId, m.displayName]));
      const byTerm = new Map<string, { term: string; wants: Set<string>; refuses: Set<string> }>();
      for (const item of items) {''', "tête")
sub('''      const out: PreferenceSplit[] = [];
      for (const cur of byTerm.values()) {
        const wants = [...cur.wants].filter((id) => !cur.refuses.has(id));
        const refuses = [...cur.refuses].filter((id) => !cur.wants.has(id));
        if (wants.length === 0 || refuses.length === 0) continue;
        out.push({
          term: cur.term,
          wants: wants.map((id) => ({ memberId: id, displayName: nameOf.get(id) ?? "" })),
          refuses: refuses.map((id) => ({ memberId: id, displayName: nameOf.get(id) ?? "" })),
        });
      }
      return out;
    })();''',
'''      const out: PreferenceSplit[] = [];
      for (const cur of byTerm.values()) {
        const wants = [...cur.wants].filter((id) => !cur.refuses.has(id));
        const refuses = [...cur.refuses].filter((id) => !cur.wants.has(id));
        if (wants.length === 0 || refuses.length === 0) continue;
        out.push({
          term: cur.term,
          wants: wants.map((id) => ({ memberId: id, displayName: nameOf.get(id) ?? "" })),
          refuses: refuses.map((id) => ({ memberId: id, displayName: nameOf.get(id) ?? "" })),
        });
      }
      return out;
    };
    const preferenceSplits: PreferenceSplit[] = splitsFrom([...retainedDurable.items, ...retainedNextPlan]);''', "queue")
sub('''    const preferenceSplit = (() => {
      const counts = { pairs: preferenceSplits.length, wanters: 0, composed: 0, refuser_clean: 0, refuser_bitten: 0 };
      if (preferenceSplits.length === 0) return counts;''',
'''    const preferenceSplit = (() => {
      // ⟳ les paires de la note FRAÎCHE entrent ici (et seulement ici) : « Léa n'aime
      // pas, Marc adore » est mesuré sur le plan qu'elle annote, pas au suivant.
      const allSplits = splitsFrom([...retainedDurable.items, ...retainedNextPlan, ...(noteBelt?.items ?? [])]);
      const counts = {
        pairs: allSplits.length,
        pairs_from_stores: preferenceSplits.length,
        pairs_fresh: Math.max(0, allSplits.length - preferenceSplits.length),
        wanters: 0,
        composed: 0,
        refuser_clean: 0,
        refuser_bitten: 0,
      };
      if (allSplits.length === 0) return counts;''', "compteur tête")
sub('''      for (const split of preferenceSplits) {
        const terms = exclusionTermsFor({''', '''      for (const split of allSplits) {
        const terms = exclusionTermsFor({''', "boucle")
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/retained_item\.ts";', s)
if m:
    blk = m.group(0)
    if re.search(r'\bRetainedItem\b', blk) is None:
        s = s.replace(blk, blk.replace("{", "{\n  type RetainedItem,", 1), 1)
else:
    assert re.search(r'\bRetainedItem\b', s), "RetainedItem non importé et import retained_item.ts absent"
io.open(P, "w", encoding="utf-8").write(s)
print("index: paires fraîches dans le compteur")
