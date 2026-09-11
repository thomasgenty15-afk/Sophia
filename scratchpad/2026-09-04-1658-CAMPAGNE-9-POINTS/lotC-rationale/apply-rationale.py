#!/usr/bin/env python3
# LOT C · RESTE — LA PHRASE DE RABOTAGE DES COURSES. À poser quand la lane serveur est libre.
import io,re
def patch(path, subs):
    s=io.open(path,encoding='utf-8').read()
    for old,new,label in subs:
        n=s.count(old); assert n==1, f"{path} · {label}: {n}"
        s=s.replace(old,new)
    io.open(path,'w',encoding='utf-8').write(s); print("ok ·",path)

R="supabase/functions/_shared/keel/plan_rationale.ts"
patch(R, [
("""      /** Les courses demandées que le plan n'utilise pas. `0` = aucune. */
      readonly unusedRuns: number;""",
"""      /**
       * ⟳ LOT C (2026-09-05) — LES COURSES QUE LE PLAN ORGANISE. REQUIS.
       * Depuis le renversement (`runs <= sessions`), ce nombre peut être plus
       * petit que ce que la personne a demandé; `unusedRuns` porte l'écart. La
       * phrase qui le dit a besoin des DEUX: « tu avais prévu 3, le plan en
       * organise 2 ». Sans ce champ, elle devrait déduire le demandé des
       * sessions — faux dès que la fenêtre plafonne.
       */
      readonly runs: number;
      /** Les courses demandées que le plan n'utilise pas. `0` = aucune. */
      readonly unusedRuns: number;""", "fait runs"),
("""    daysCapSessions: (sessions: number) =>
      `Cette fenêtre est courte : ${sessions} session de cuisine, pas plus — ` +
      `deux le même jour ne feraient qu'une.`,""",
"""    daysCapSessions: (sessions: number) =>
      `Cette fenêtre est courte : ${sessions} session de cuisine, pas plus — ` +
      `deux le même jour ne feraient qu'une.`,
    // ── ⟳ LOT C · LES COURSES RABOTÉES PAR LES SESSIONS ─────────────────
    // La règle tranchée par l'utilisateur, dite en une phrase : on ne va pas
    // au magasin plus souvent qu'on ne cuisine. Un fait sur le PLAN, jamais un
    // reproche — la personne garde le droit d'y retourner pour du frais, et la
    // phrase le dit pour que « le plan n'en organise que 2 » ne se lise pas
    // comme une interdiction.
    runsCappedBySessions: (asked: number, runs: number) =>
      `Tu avais prévu ${asked} courses ; le plan n'en organise que ${runs}, ` +
      `une par session de cuisine — on ne va pas au magasin plus souvent qu'on ` +
      `ne cuisine. Rien ne t'empêche d'y retourner pour du frais.`,""", "copie FR"),
("""    daysCapSessions: (sessions: number) =>
      `This window is short: ${sessions} cooking session, no more — two on ` +
      `the same day would only be one.`,""",
"""    daysCapSessions: (sessions: number) =>
      `This window is short: ${sessions} cooking session, no more — two on ` +
      `the same day would only be one.`,
    runsCappedBySessions: (asked: number, runs: number) =>
      `You planned ${asked} shops; the plan organises ${runs}, one per cooking ` +
      `session — nobody shops more often than they cook. You can still go ` +
      `back for fresh food.`,""", "copie EN"),
("""    if (cooking.notes.includes("days_cap_sessions")) {
      lines.push(copy.daysCapSessions(cooking.sessions));
    }""",
"""    if (cooking.notes.includes("days_cap_sessions")) {
      lines.push(copy.daysCapSessions(cooking.sessions));
    }
    // ⟳ LOT C — ET LE RABOTAGE DES COURSES, QUAND LE STYLE N'A PAS DÉJÀ PARLÉ.
    // `styleCapsSessions` dit déjà « N sessions suffisent, même avec R courses »
    // quand c'est le STYLE qui borne ; en redire une phrase serait deux fois le
    // même fait. Celle-ci ne sort que sur l'autre cause — la fenêtre — où sans
    // elle « cette fenêtre est courte » ne dirait rien des courses perdues.
    if (
      cooking.notes.includes("runs_capped_by_sessions") &&
      !cooking.notes.includes("style_caps_sessions")
    ) {
      lines.push(copy.runsCappedBySessions(cooking.runs + cooking.unusedRuns, cooking.runs));
    }""", "émission"),
])

for lane in ("supabase/functions/generate-meal-v1/index.ts","supabase/functions/generate-household-meal-v1/index.ts"):
    # ⚠️ L'ANCRE EST LA SEULE LIGNE `unusedRuns:` du fichier (une par lane) : des
    # commentaires vivent entre `sessions:` et `cookDays:`, un bloc à trois lignes
    # ne matche pas.
    patch(lane, [(
"""            unusedRuns: capacity.plan === null || groceryRuns === null""",
"""            // ⟳ LOT C — ce que le PLAN organise, à côté de l'écart avec le demandé.
            runs: capacity.plan.runs,
            unusedRuns: capacity.plan === null || groceryRuns === null""", "faits runs")])

T="supabase/functions/_shared/keel/plan_rationale_test.ts"
s=io.open(T,encoding='utf-8').read()
s2,n=re.subn(r"cookingPlan: \{ sessions: (\d+),", r"cookingPlan: { sessions: \1, runs: \1,", s)
print(f"{n} littéraux cookingPlan complétés (runs = sessions)")
assert n>=7, "des littéraux cookingPlan n'ont pas la forme attendue"
if "assertStringIncludes" not in s2.split("Deno.test")[0]:
    s2=s2.replace("import { assert, assertEquals", "import { assert, assertEquals, assertStringIncludes",1)
s2 += '''
// ⟳ LOT C (2026-09-05) — LES COURSES RABOTÉES PAR LES SESSIONS SE DISENT.
Deno.test("LOT C — quand la FENÊTRE borne, les courses perdues sont dites, dans les deux langues", () => {
  for (const locale of ["fr", "en"] as const) {
    const lines = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        // 3 courses demandées, 2 sessions (fenêtre courte) ⇒ 2 courses organisées.
        cookingPlan: { sessions: 2, runs: 2, cookDays: ["sun", "wed"], unusedRuns: 1, notes: ["days_cap_sessions", "runs_capped_by_sessions"] },
      },
      locale,
    }).lines.join(" ");
    assertStringIncludes(lines, locale === "fr" ? "prévu 3 courses" : "planned 3 shops", locale);
    assertStringIncludes(lines, locale === "fr" ? "n'en organise que 2" : "organises 2", locale);
    // ⛔ ET LE DROIT D'Y RETOURNER EST DIT : ce n'est pas une interdiction.
    assertStringIncludes(lines, locale === "fr" ? "retourner" : "go back", locale);
  }
});

Deno.test("⛔ LOT C — pas deux phrases pour le même fait quand le STYLE a déjà parlé", () => {
  // `styleCapsSessions` dit déjà « 2 sessions suffisent, même avec 3 courses ».
  const lines = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      cookingPlan: { sessions: 2, runs: 2, cookDays: ["sun", "wed"], unusedRuns: 1, notes: ["style_caps_sessions", "runs_capped_by_sessions"] },
    },
    locale: "fr",
  }).lines;
  assertEquals(lines.filter((l) => l.includes("courses")).length, 1, lines.join("\\n"));
});
'''
io.open(T,'w',encoding='utf-8').write(s2); print("ok ·",T)
print("RATIONALE POSÉE — lancer : deno test plan_rationale_test + gate")
