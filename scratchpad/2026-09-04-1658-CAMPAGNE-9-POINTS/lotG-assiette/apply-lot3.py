#!/usr/bin/env python3
# LOT 3 — LES JOURS DE CUISINE DÉCLARÉS BORNENT ET PLACENT LES SESSIONS (2026-09-06)
#
# Mesuré (campagne du 05/09, M13, duo, `cook_days = [dimanche]` déclaré) : trois sessions
# posées (dim/mar/jeu) sans le dire — `resolveCookingCapacity` remplaçait les jours déclarés
# par ceux que style + courses dérivent (D2.4, justifié par « l'écran écrit `[]` », ce qui n'est
# plus vrai : CookingCapacityCard porte le champ `cook_days`).
#
# Règle : des jours déclarés qui tombent dans la fenêtre PLACENT les sessions et en fixent le
# nombre (borné par MAX_COOKING_SESSIONS et par les jours mangés) ; le style garde ses minutes
# et ses leviers ; les courses restent bornées par les sessions. Des jours déclarés hors fenêtre
# sont NOMMÉS et la dérivation s'applique. Tout écart est dit dans la rationale.
import io, re, sys
ROOT = "supabase/functions/"
def load(p): return io.open(p, encoding="utf-8").read()
writes = {}
def sub(p, old, new, label, count=1):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == count, f"{label} @ {p}: {n} (attendu {count})"
    writes[p] = s.replace(old, new)

CP = ROOT + "_shared/keel/cooking_plan.ts"
sub(CP, '''  | "runs_capped_by_sessions";''', '''  | "runs_capped_by_sessions"
  /**
   * ⟳ LOT 3 (2026-09-06) — des jours de cuisine DÉCLARÉS tombent dans la fenêtre :
   * ils placent les sessions et en fixent le nombre ; le style ne les déplace pas.
   */
  | "cook_days_declared"
  /** ⟳ LOT 3 — des jours déclarés, mais aucun dans la fenêtre : la dérivation s'applique, et c'est dit. */
  | "cook_days_out_of_window";''', "notes")
sub(CP, '''  leadDay: boolean;
  daysToEat: number;
}): CookingPlan {''', '''  leadDay: boolean;
  daysToEat: number;
  /**
   * ⟳ LOT 3 (2026-09-06) — LES JOURS QUE LA PERSONNE A DONNÉS (« les jours où vous
   * cuisinez », `practical_constraints.cook_days`). Optionnel : un appelant qui
   * ne les porte pas obtient la dérivation d'hier, octet pour octet.
   *
   * ⛔ D2.4 EST RENVERSÉ ICI, ET LA RAISON EST MESURÉE. La dérivation avait
   * remplacé les jours déclarés parce que « l'écran écrit `[]` » ; M13 (duo,
   * 05/09) déclarait le dimanche et recevait trois sessions dim/mar/jeu sans
   * qu'une phrase le dise. Un jour déclaré est un fait de la maison, pas une
   * suggestion : il place la session, et tout écart est nommé.
   */
  declaredCookDays?: readonly string[];
}): CookingPlan {''', "input")
sub(CP, '''  const sessions = Math.max(1, wanted);''', '''  // ⟳ LOT 3 — les jours déclarés, dans l'ordre de la fenêtre, dédoublonnés.
  const declared = [
    ...new Set(
      (input.declaredCookDays ?? []).filter((d) => (DAY_TOKENS as readonly string[]).includes(d)),
    ),
  ] as DayToken[];
  const declaredInWindow = input.windowDays.filter((d, i, all) =>
    declared.includes(d) && all.indexOf(d) === i
  );
  let useDeclared = false;
  if (declared.length > 0) {
    if (declaredInWindow.length > 0) {
      useDeclared = true;
      notes.push("cook_days_declared");
      wanted = Math.min(declaredInWindow.length, MAX_COOKING_SESSIONS);
      if (wanted > eaten) {
        wanted = eaten;
        if (!notes.includes("days_cap_sessions")) notes.push("days_cap_sessions");
      }
    } else {
      notes.push("cook_days_out_of_window");
    }
  }
  const sessions = Math.max(1, wanted);''', "sessions")
sub(CP, '''  const cookDays: DayToken[] = [];''', '''  const derivedCookDays: DayToken[] = [];''', "cookDays decl")
sub(CP, '''    if (token !== undefined && !cookDays.includes(token)) cookDays.push(token);''',
        '''    if (token !== undefined && !derivedCookDays.includes(token)) derivedCookDays.push(token);''', "cookDays push")
sub(CP, '''  const sessionMinutes = sessions === 1''', '''  // ⟳ LOT 3 — déclarés dans la fenêtre : ce sont eux, bornés au nombre de sessions.
  const cookDays: DayToken[] = useDeclared ? declaredInWindow.slice(0, sessions) : derivedCookDays;
  const sessionMinutes = sessions === 1''', "cookDays final")
sub(CP, '''  const plan = deriveCookingPlan({
    style: input.style,''', '''  const plan = deriveCookingPlan({
    style: input.style,
    // ⟳ LOT 3 — les jours déclarés ENTRENT dans la dérivation au lieu d'être
    // remplacés par elle (voir `deriveCookingPlan`, et D2.4 renversé).
    declaredCookDays: input.declared.cookDays,''', "resolve")
# import DAY_TOKENS
s = writes[CP]
m = re.search(r'import (type )?\{([^}]*)\} from "\./tokens\.ts";', s)
assert m, "import tokens.ts introuvable dans cooking_plan.ts"
blk = m.group(0)
if "DAY_TOKENS" not in blk:
    if m.group(1):  # import type { DayToken } → il faut une valeur
        writes[CP] = s.replace(blk, blk + '\nimport { DAY_TOKENS } from "./tokens.ts";', 1)
    else:
        writes[CP] = s.replace(blk, blk.replace("{", "{ DAY_TOKENS,", 1), 1)

PR = ROOT + "_shared/keel/plan_rationale.ts"
s = load(PR)
anchor = "    cookDayBeforeTonight: (day: string) =>"
assert s.count(anchor) == 2, s.count(anchor)
i1 = s.index(anchor); i2 = s.index(anchor, i1 + 1)
fr = '''    // ── ⟳ LOT 3 · LES JOURS DE CUISINE DÉCLARÉS ────────────────────────────
    // Un fait de la maison redit tel quel : la personne a nommé ses jours, le
    // plan les respecte, et le style n'a pas son mot à dire sur le calendrier.
    cookDaysDeclared: (days: string) =>
      `Tu cuisines ${days} : le plan pose ses sessions ces jours-là, et pas ` +
      `ailleurs.`,
    cookDaysOutOfWindow: () =>
      `Les jours de cuisine que tu as donnés ne tombent pas dans ces jours-là : ` +
      `le plan pose ses sessions autrement.`,
'''
en = '''    cookDaysDeclared: (days: string) =>
      `You cook on ${days}: the plan sets its sessions on those days, and ` +
      `nowhere else.`,
    cookDaysOutOfWindow: () =>
      `The cooking days you gave do not fall within these days: the plan sets ` +
      `its sessions differently.`,
'''
s = s[:i2] + en + s[i2:]
s = s[:i1] + fr + s[i1:]
writes[PR] = s
sub(PR, '''    if (cooking.notes.includes("days_cap_sessions")) {''', '''    // ⟳ LOT 3 — les jours déclarés sont dits comme un CHOIX, à côté du calendrier.
    if (cooking.notes.includes("cook_days_declared") && cooking.cookDays.length > 0) {
      lines.push(copy.cookDaysDeclared(renderDays(cooking.cookDays, input.locale)));
    }
    if (cooking.notes.includes("cook_days_out_of_window")) {
      lines.push(copy.cookDaysOutOfWindow());
    }
    if (cooking.notes.includes("days_cap_sessions")) {''', "emission")

# ── tests
CT = ROOT + "_shared/keel/cooking_plan_test.ts"
writes[CT] = load(CT).rstrip("\n") + '''

// ---------------------------------------------------------------------------
// ⟳ LOT 3 (2026-09-06) — LES JOURS DE CUISINE DÉCLARÉS PLACENT LES SESSIONS
// ---------------------------------------------------------------------------
//
// M13 (duo, campagne du 05/09) déclarait le dimanche et recevait dim/mar/jeu
// sans un mot. Ces tests tiennent la règle ; la mutation « ignorer
// declaredCookDays » rougit les trois premiers.

Deno.test("LOT 3 — « je cuisine le dimanche » pose UNE session, le dimanche, même quand le style en poserait trois", () => {
  const out = plan({ declaredCookDays: ["sun"] });
  assertEquals(out.sessions, 1);
  assertEquals(out.cookDays, ["sun"]);
  assert(out.notes.includes("cook_days_declared"));
  // Les courses suivent la règle du LOT C : pas plus souvent qu'on ne cuisine.
  assertEquals(out.runs, 1);
  assert(out.notes.includes("runs_capped_by_sessions"));
  // Et une session unique avec congélateur ouvre les barquettes au congélateur.
  assertEquals(out.usesFreezer, true);
  assertEquals(out.sessionMinutes, Math.min(240, 60 * 2));
});

Deno.test("LOT 3 — deux jours déclarés = deux sessions, dans l'ordre de la FENÊTRE, pas de la saisie", () => {
  const out = plan({ declaredCookDays: ["thu", "sun"] });
  assertEquals(out.sessions, 2);
  assertEquals(out.cookDays, ["sun", "thu"]);
  assertEquals(out.runs, 2);
  assert(!out.notes.includes("runs_capped_by_sessions"));
});

Deno.test("LOT 3 — quatre jours déclarés sont bornés au maximum de sessions, et c'est dit", () => {
  const out = plan({ declaredCookDays: ["mon", "wed", "fri", "sat"] });
  assertEquals(out.sessions, 3);
  assertEquals(out.cookDays, ["mon", "wed", "fri"]);
  assert(out.notes.includes("cook_days_declared"));
});

Deno.test("LOT 3 — un jour déclaré HORS fenêtre ne dérègle rien : la dérivation s'applique, et l'écart est nommé", () => {
  const out = plan({ windowDays: ["mon", "tue", "wed"], daysToEat: 3, leadDay: false, declaredCookDays: ["sun"] });
  const derived = plan({ windowDays: ["mon", "tue", "wed"], daysToEat: 3, leadDay: false });
  assertEquals(out.sessions, derived.sessions);
  assertEquals(out.cookDays, derived.cookDays);
  assert(out.notes.includes("cook_days_out_of_window"));
  assert(!out.notes.includes("cook_days_declared"));
});

Deno.test("LOT 3 — sans jour déclaré, la dérivation d'hier est rendue octet pour octet", () => {
  assertEquals(plan({ declaredCookDays: [] }), plan({}));
  assertEquals(plan({ declaredCookDays: ["dimanche", "lundi"] }), plan({}), "un jeton inconnu est ignoré, pas deviné");
});

Deno.test("LOT 3 — `resolveCookingCapacity` fait ENTRER les jours déclarés dans la dérivation au lieu de les remplacer", () => {
  const out = resolveCookingCapacity({
    declared: { cookDays: ["sun"], cookingTimeMin: null, recipeDifficulty: null, variety: null, budgetAmount: null },
    style: "balanced",
    runs: 2,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
  });
  assertEquals(out.cookDays, ["sun"]);
  assertEquals(out.plan?.sessions, 1);
  assert(out.plan?.notes.includes("cook_days_declared"));
});
'''
RT = ROOT + "_shared/keel/plan_rationale_test.ts"
writes[RT] = load(RT).rstrip("\n") + '''

Deno.test("LOT 3 — les jours de cuisine déclarés sont DITS comme un choix, dans les deux langues ; hors fenêtre, l'écart est nommé", () => {
  for (const locale of ["fr", "en"] as const) {
    const lines = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookingPlan: { sessions: 1, runs: 1, cookDays: ["sun"], unusedRuns: 1, notes: ["cook_days_declared", "runs_capped_by_sessions"] },
      },
      locale,
    }).lines.join(" ");
    assertStringIncludes(lines, locale === "fr" ? "Tu cuisines" : "You cook on", locale);
    assertStringIncludes(lines, locale === "fr" ? "pas ailleurs" : "nowhere else", locale);
    const out = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookingPlan: { sessions: 3, runs: 2, cookDays: ["sun", "tue", "thu"], unusedRuns: 0, notes: ["cook_days_out_of_window"] },
      },
      locale,
    }).lines.join(" ");
    assertStringIncludes(out, locale === "fr" ? "ne tombent pas dans ces jours" : "do not fall within these days", locale);
  }
});
'''
for p, s in writes.items():
    io.open(p, "w", encoding="utf-8").write(s)
print("écrit:", len(writes), "fichiers"); [print("  ", p) for p in writes]
