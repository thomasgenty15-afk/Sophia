#!/usr/bin/env python3
# QUAND UNE BOUCHE VEUT CE QU'UNE AUTRE REFUSE : LE COMPOSANT SÉPARÉ PAR BOÎTE, DEMANDÉ ET COMPTÉ (2026-09-06)
#
# Rapport 0f §10 (« Léa n'aime pas les asperges mais Marc adore ») : au plan suivant, `food.exclude asperges@Léa`
# et `food.prefer asperges@Marc` sont servis, et le modèle évite l'asperge pour TOUTE la table — l'exclusion
# honorée en mettant la table sur la ligne de Léa, la préférence sans effet. La boîte d'échange existe pour
# les régimes et les exclusions ; personne ne demandait au modèle « la version de Marc ».
#
# Règle : quand une bouche préfère (food.prefer) ce qu'une autre exclut (food.exclude), le brief nomme la
# paire et demande le composant SÉPARÉ : base commune sans, une préparation à part (ou frais), citée par la
# boîte de qui le veut, jamais par celle de qui le refuse. Compteur `preference_split {pairs, wanters,
# composed, refuser_clean}` après ceinture, relances et recours, avec le matcher du dépôt.
import io, re
ROOT = "supabase/functions/"
def load(p): return io.open(p, encoding="utf-8").read()
writes = {}
def sub(p, old, new, label, count=1):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == count, f"{label} @ {p}: {n} (attendu {count})"
    writes[p] = s.replace(old, new)

H = ROOT + "_shared/keel/household_meal_generation.ts"
OLD_V = "v30_every_meal_follows_the_line"; NEW_V = "v31_one_wants_what_another_refuses"
sub(H, f'export const HOUSEHOLD_PROMPT_VERSION = "{OLD_V}";', f'export const HOUSEHOLD_PROMPT_VERSION = "{NEW_V}";', "version")
sub(H, '''  workLunch?: ReadonlyArray<{''', '''  /**
   * ⟳ 2026-09-06 — LES PAIRES « X VEUT CE QUE Y REFUSE ». Mesuré (rapport 0f
   * §10) : « Léa n'aime pas les asperges, Marc adore » → au plan suivant le
   * modèle évite l'asperge pour toute la table. Une paire = un terme, ceux qui
   * le veulent, ceux qui le refusent ; le bloc demande le composant SÉPARÉ par
   * boîte. Optionnel : sans paire, le prompt est celui d'hier au caractère près.
   */
  readonly preferenceSplits?: readonly PreferenceSplit[];
  workLunch?: ReadonlyArray<{''', "input")
sub(H, '''function dedicatedDishBlock(''', '''export interface PreferenceSplit {
  /** Le terme tel qu'une bouche l'a écrit (la préférence), rendu tel quel. */
  readonly term: string;
  readonly wants: readonly { memberId: string; displayName: string }[];
  readonly refuses: readonly { memberId: string; displayName: string }[];
}

/**
 * ⟳ 2026-09-06 — QUAND UNE BOUCHE VEUT CE QU'UNE AUTRE REFUSE.
 *
 * Le bloc de la boîte d'échange (`boxSchemaBlock`) parle des LIGNES (régime,
 * exclusion) ; une PRÉFÉRENCE contre une exclusion n'y était nommée nulle part,
 * et le modèle tranchait en évitant l'aliment pour toute la table — « putting
 * the table on one person's line », la faute que le bloc voisin interdit déjà.
 * Ici la paire est nommée, et la sortie attendue aussi : la base commune SANS,
 * le composant dans une préparation à part (ou frais), cité par la boîte de
 * qui le veut, jamais par celle de qui le refuse. Vide sans paire.
 */
function preferenceSplitBlock(splits: readonly PreferenceSplit[] | undefined): string {
  if (!splits || splits.length === 0) return "";
  const names = (xs: readonly { displayName: string }[]) => xs.map((x) => x.displayName).join(" and ");
  const lines: string[] = [
    "== ONE PERSON WANTS WHAT ANOTHER REFUSES ==",
    "Do NOT settle these by dropping the food for the whole table: that is putting",
    "everyone on one person's line, and the person who asked for it gets nothing.",
  ];
  for (const s of splits) {
    lines.push(
      `- ${names(s.wants)} want(s) "${s.term}"; ${names(s.refuses)} keep(s) it off the plate.`,
      `  The shared base goes WITHOUT it. "${s.term}" is ONE MORE preparation (or added`,
      `  fresh on the day), cited only by the box of ${names(s.wants)}, at some lunches and`,
      `  dinners of the stretch -- never by the box of ${names(s.refuses)}. One dish, one`,
      `  title, two boxes: the component lives in the box of the person who wants it.`,
    );
  }
  return lines.join("\\n");
}

function dedicatedDishBlock(''', "block fn")
sub(H, '''    dedicatedDishBlock(input.dishBearers, input.dedicatedDishesAsked),''', '''    dedicatedDishBlock(input.dishBearers, input.dedicatedDishesAsked),
    preferenceSplitBlock(input.preferenceSplits),''', "parts")

# pins de version
import glob
for p in sorted(glob.glob(ROOT + "_shared/keel/*_test.ts")):
    s = load(p)
    if OLD_V in s:
        writes[p] = s.replace(OLD_V, NEW_V)

T = ROOT + "_shared/keel/household_meal_generation_test.ts"
writes[T] = (writes.get(T) or load(T)).rstrip("\\n") + '''

// ⟳ 2026-09-06 — QUAND UNE BOUCHE VEUT CE QU'UNE AUTRE REFUSE (rapport 0f §10)
Deno.test("préférence contre exclusion — le bloc nomme la paire et demande le composant séparé par boîte ; absent sans paire", () => {
  const presence = resolveWindowPresence({
    members: [
      { memberId: "m-lea", displayName: "Léa", away: parseMemberAway([]) },
      { memberId: "m-marc", displayName: "Marc", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  const base = {
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon", "tue"],
    members: [
      { memberId: "m-lea", displayName: "Léa", goal: null, habits: [], habitNote: null },
      { memberId: "m-marc", displayName: "Marc", goal: null, habits: [], habitNote: null },
    ] as never,
    envyLine: null,
    restrictions: [],
    presence,
    merge: null,
    cooking: "one_dish" as const, divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    unmerge: null,
    dietBlock: "",
    notes: [],
    voices: [],
  };
  const without = buildHouseholdPromptBlocks(base).userSuffix;
  assert(!without.includes("ONE PERSON WANTS WHAT ANOTHER REFUSES"), "sans paire, pas de bloc");
  const withSplit = buildHouseholdPromptBlocks({
    ...base,
    preferenceSplits: [{ term: "les asperges", wants: [{ memberId: "m-marc", displayName: "Marc" }], refuses: [{ memberId: "m-lea", displayName: "Léa" }] }],
  }).userSuffix;
  assertStringIncludes(withSplit, "== ONE PERSON WANTS WHAT ANOTHER REFUSES ==");
  assertStringIncludes(withSplit, 'Marc want(s) "les asperges"; Léa keep(s) it off the plate.');
  assertStringIncludes(withSplit, "cited only by the box of Marc");
  assertStringIncludes(withSplit, "never by the box of Léa");
  // Le bloc ne dit jamais « évite-le pour tous » : c'est la faute qu'il corrige.
  assertStringIncludes(withSplit, "Do NOT settle these by dropping the food for the whole table");
  // Et le reste du prompt est celui d'avant, au caractère près, hors du bloc.
  assertEquals(withSplit.replace(/== ONE PERSON WANTS WHAT ANOTHER REFUSES ==[\\s\\S]*?two boxes: the component lives in the box of the person who wants it\\.\\n?/, ""), without);
});
'''

# ───────────────────────── l'index foyer ─────────────────────────
IX = ROOT + "generate-household-meal-v1/index.ts"
sub(IX, '''    const household = buildHouseholdPromptBlocks({
''', '''    // ⟳ 2026-09-06 — LES PAIRES « X VEUT CE QUE Y REFUSE », depuis les deux
    // magasins (durable + prochain plan), par terme normalisé, entre bouches
    // à table. Une paire où la même bouche veut et refuse n'en est pas une ;
    // une exclusion de TABLE n'en est pas une non plus (personne ne peut le
    // porter). Rapport 0f §10.
    const preferenceSplits: PreferenceSplit[] = (() => {
      const nameOf = new Map(platedMembers.map((m) => [m.memberId, m.displayName]));
      const byTerm = new Map<string, { term: string; wants: Set<string>; refuses: Set<string> }>();
      for (const item of [...retainedDurable.items, ...retainedNextPlan]) {
        if (item.kind !== "food.prefer" && item.kind !== "food.exclude") continue;
        const subject = String(item.subject ?? "");
        if (!subject.startsWith("member:")) continue;
        const memberId = subject.slice("member:".length);
        if (!nameOf.has(memberId)) continue;
        const text = String(item.text ?? "").trim();
        const key = normalizePantryTerm(text);
        if (!key) continue;
        const cur = byTerm.get(key) ?? { term: text, wants: new Set<string>(), refuses: new Set<string>() };
        (item.kind === "food.prefer" ? cur.wants : cur.refuses).add(memberId);
        byTerm.set(key, cur);
      }
      const out: PreferenceSplit[] = [];
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
    })();
    const household = buildHouseholdPromptBlocks({
      preferenceSplits,
''', "splits + arg")
sub(IX, '''    const potAttribution = composition === null ? null : potAttributionGap({''', '''    // ⟳ 2026-09-06 — LE COMPOSANT SÉPARÉ A-T-IL ÉTÉ COMPOSÉ ? Après ceinture,
    // relances et recours, sur les boîtes finales, avec le matcher du dépôt
    // (`dishBitesExclusion`, surface « all » : items de la boîte et casseroles
    // citées). Le texte de la préférence est tokenisé comme une exclusion — même
    // tokenisation, même matcher — pour ne pas écrire un second moteur.
    const preferenceSplit = (() => {
      const counts = { pairs: preferenceSplits.length, wanters: 0, composed: 0, refuser_clean: 0, refuser_bitten: 0 };
      if (preferenceSplits.length === 0) return counts;
      const prepById = new Map(meal.preparations.map((p) => [p.id, { id: p.id, title: p.title, method: p.method, ingredients: p.ingredients }]));
      const boxCarries = (memberId: string, terms: ReturnType<typeof exclusionTermsFor>): boolean => {
        for (const dish of meal.dishes) {
          for (const box of dish.boxes) {
            if (!box.memberIds.includes(memberId)) continue;
            const cited = box.items.filter((it) => it.preparationId).map((it) => ({ preparationId: it.preparationId as string }));
            const bite = dishBitesExclusion({
              dish: { title: "", method: "", ingredients: box.items.map((it) => ({ term: it.term })) },
              uses: cited,
              preparationById: prepById,
              terms,
              surface: "all",
            });
            if (bite.matched !== null) return true;
          }
        }
        return false;
      };
      for (const split of preferenceSplits) {
        const terms = exclusionTermsFor({
          items: [{ kind: "food.exclude", subject: "member:_", text: split.term } as never],
          subject: "member:_",
        });
        for (const w of split.wants) {
          counts.wanters += 1;
          if (boxCarries(w.memberId, terms)) counts.composed += 1;
        }
        for (const r of split.refuses) {
          if (boxCarries(r.memberId, terms)) counts.refuser_bitten += 1;
          else counts.refuser_clean += 1;
        }
      }
      console.log(JSON.stringify({ tag: "keel.household_meal.preference_split", user_id: userId, household_id: householdId, intent, ...counts }));
      return counts;
    })();
    const potAttribution = composition === null ? null : potAttributionGap({''', "compteur")
sub(IX, '''      exclusion_belt: meal.exclusion_belt,''', '''      exclusion_belt: meal.exclusion_belt,
      preference_split: preferenceSplit,''', "archive")
s = writes[IX]
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/household_meal_generation\.ts";', s); assert m, "import hmg"
blk = m.group(0)
if "PreferenceSplit" not in blk:
    s = s.replace(blk, blk.replace("{", "{\n  type PreferenceSplit,", 1), 1)
m = re.search(r'import \{([^}]*)\} from "\.\./_shared/keel/food_exclusion_belt\.ts";', s); assert m, "import belt"
blk = m.group(0)
for name in ("dishBitesExclusion", "exclusionTermsFor"):
    if re.search(r'\b' + name + r'\b', blk) is None:
        blk2 = blk.replace("{", "{\n  " + name + ",", 1); s = s.replace(blk, blk2, 1); blk = blk2
writes[IX] = s
for p, t in writes.items():
    io.open(p, "w", encoding="utf-8").write(t)
print("écrit:", len(writes)); [print("  ", p) for p in writes]
