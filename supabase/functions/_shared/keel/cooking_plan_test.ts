import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  COOKING_STYLE_PROFILE,
  COOKING_STYLES,
  type CookingStyle,
  deriveCookingPlan,
  type GroceryRuns,
  GROCERY_RUNS,
  longestFridgeStretch,
  MAX_COOKING_SESSIONS,
  oneStyleLower,
  readCookingStyle,
  readGroceryRuns,
  resolveCookingCapacity,
  unusedGroceryRuns,
} from "./cooking_plan.ts";
import { type DayToken } from "./tokens.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P2 — « COMMENT VOULEZ-VOUS CUISINER ? » / « COMBIEN DE COURSES ? »
 * chantier-0903/CUISINE, A2 · 2026-09-03
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CES TESTS DOIVENT EMPÊCHER ─────────────────────────────────────
 *   ① qu'une clé ABSENTE se lise « le moins possible » — la cicatrice de
 *      `kitchen_equipment` (20260818110000), payée une fois déjà: personne ne
 *      doit se voir composer des plans « je réchauffe » au nom d'un choix qu'il
 *      n'a jamais fait;
 *   ② qu'on FORCE une session que la personne n'a pas demandée — une session de
 *      plus est une vague de courses de plus, donc un déplacement de plus;
 *   ③ que « une seule course » passe sans congélateur — c'est promettre une
 *      semaine de plats qui ne tiendront pas.
 */

// Une fenêtre de huit jours avec une veille au rang 0 (le cas de A1): on
// cuisine dimanche, on mange du lundi au dimanche suivant.
const WITH_LEAD: readonly DayToken[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];
// Sept jours mangés, sans veille (le refus `no_room` de A1).
const NO_LEAD: readonly DayToken[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

function plan(over: Partial<Parameters<typeof deriveCookingPlan>[0]> = {}) {
  return deriveCookingPlan({
    style: "balanced",
    runs: 2,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 1. LES CONSTANTES — épinglées, et pas paramétrées par elles-mêmes
// ---------------------------------------------------------------------------

Deno.test("A2 — la table des styles est épinglée EN ENTIER", () => {
  assertEquals(COOKING_STYLES, ["minimal", "balanced", "keen"]);
  assertEquals(GROCERY_RUNS, [1, 2, 3]);
  assertEquals(MAX_COOKING_SESSIONS, 3);
  assertEquals(COOKING_STYLE_PROFILE, {
    minimal: { minutes: 30, difficulty: "simple", variety: "repeat", sessionCap: 2 },
    balanced: { minutes: 60, difficulty: "normal", variety: "some", sessionCap: 3 },
    keen: { minutes: 120, difficulty: "keen", variety: "varied", sessionCap: 3 },
  });
});

Deno.test("A2 — descendre d'un cran s'arrête au plancher", () => {
  assertEquals(oneStyleLower("keen"), "balanced");
  assertEquals(oneStyleLower("balanced"), "minimal");
  // ⛔ `minimal` NE DEVIENT PAS « pas de cuisine ». Un plan sans cuisine n'est
  // pas un plan.
  assertEquals(oneStyleLower("minimal"), "minimal");
});

// ---------------------------------------------------------------------------
// 2. LA LECTURE — le troisième état
// ---------------------------------------------------------------------------

Deno.test("A2 — clé absente = JAMAIS DEMANDÉ, et surtout pas « minimal »", () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME, ET IL A DÉJÀ ÉTÉ PAYÉ. Une clé absente et
  // une réponse « rien » se ressemblent en JSON. Si `null` retombait sur
  // `minimal`, tout compte antérieur à ce lot se verrait composer des plans
  // « je réchauffe » sans qu'on lui ait rien demandé.
  for (const pc of [null, undefined, {}, { cooking_style: "" }]) {
    assertEquals(readCookingStyle(pc), null);
  }
  assertEquals(readCookingStyle({ cooking_style: "minimal" }), "minimal");
  assertEquals(readCookingStyle({ cooking_style: "balanced" }), "balanced");
  assertEquals(readCookingStyle({ cooking_style: "keen" }), "keen");
  // Hors vocabulaire ⇒ « jamais demandé », jamais un repli silencieux.
  assertEquals(readCookingStyle({ cooking_style: "lazy" }), null);
  assertEquals(readCookingStyle({ cooking_style: "KEEN" }), null);
});

Deno.test("A2 — « zéro course » ne passe pas, et `null` n'est pas `0`", () => {
  for (const pc of [null, undefined, {}, { grocery_runs: 0 }, { grocery_runs: 4 }]) {
    assertEquals(readGroceryRuns(pc), null);
  }
  // ⛔ `Number(null)` VAUT `0` ET EST FINI. Un `!= null` aurait laissé passer
  // « zéro course », c'est-à-dire un plan qu'on ne peut pas faire.
  assertEquals(readGroceryRuns({ grocery_runs: null }), null);
  for (const n of [1, 2, 3]) {
    assertEquals(readGroceryRuns({ grocery_runs: n }), n as GroceryRuns);
  }
});

// ---------------------------------------------------------------------------
// 3. LA TABLE DE §2.2, LIGNE PAR LIGNE
// ---------------------------------------------------------------------------

Deno.test("A2 — chaque style descend ses trois valeurs dérivées", () => {
  for (const style of COOKING_STYLES) {
    const out = plan({ style, runs: 2 });
    const profile = COOKING_STYLE_PROFILE[style];
    assertEquals(out.difficulty, profile.difficulty, style);
    assertEquals(out.variety, profile.variety, style);
    // Deux sessions ⇒ le budget nominal, sans le ×2 de la session unique.
    assertEquals(out.sessionMinutes, profile.minutes, style);
  }
});

Deno.test("A2 — les TROIS leviers du style atteignent la capacité SERVIE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE DÉFAUT QUE CE CAS FERME, ET IL A ÉTÉ LIVRÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `resolveCookingCapacity` ne dérivait QUE les minutes, sur une affirmation
  // d'absence fausse: « `recipe_difficulty` et `variety` n'ont aucun lecteur
  // dans les deux générateurs ». Ils en ont un — `buildMealPrompt`, nourri par
  // `...capacity` — et le prompt les émet en toutes lettres. Un compte
  // « j'aime cuisiner » recevait donc 120 minutes ET une consigne muette sur le
  // niveau de recette. Ce test compare la capacité SERVIE au profil, pas le
  // profil à lui-même.
  for (const style of COOKING_STYLES) {
    const profile = COOKING_STYLE_PROFILE[style];
    const served = resolveCookingCapacity({
      declared: {
        cookDays: [],
        // ⛔ DES VALEURS DÉCLARÉES QUI CONTREDISENT LE STYLE, exprès: si la
        // dérivation ne mordait pas, ce sont elles qui ressortiraient — et le
        // test le verrait au lieu de passer sur une égalité par hasard.
        cookingTimeMin: 999,
        recipeDifficulty: "normal",
        variety: "some",
        budgetAmount: 42,
      },
      style,
      runs: 2,
      freezer: true,
      windowDays: WITH_LEAD,
      leadDay: true,
      daysToEat: 7,
    });
    assertEquals(served.recipeDifficulty, profile.difficulty, style);
    assertEquals(served.variety, profile.variety, style);
    assertEquals(served.cookingTimeMin, profile.minutes, style);
    // ⚠️ ET LE BUDGET TRAVERSE INTACT: il n'a rien à voir avec le style.
    assertEquals(served.budgetAmount, 42, style);
  }
});

Deno.test("A2 — sans style, les trois leviers déclarés ressortent INTACTS", () => {
  // La contre-épreuve: la population qui n'a pas répondu à P2 garde ce qu'elle
  // a écrit, à l'octet près.
  const served = resolveCookingCapacity({
    declared: {
      cookDays: ["mon"],
      cookingTimeMin: 45,
      recipeDifficulty: "normal",
      variety: "some",
      budgetAmount: 42,
    },
    style: null,
    runs: null,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
  });
  assertEquals(served.recipeDifficulty, "normal");
  assertEquals(served.variety, "some");
  assertEquals(served.cookingTimeMin, 45);
  assertEquals(served.cookDays, ["mon"]);
  assertEquals(served.plan, null);
});

Deno.test("A2 — « le moins possible » PLAFONNE les sessions à deux, jamais les courses", () => {
  // ⛔ ON NE FORCE PAS UNE TROISIÈME SÉANCE DE CUISINE. Elle serait une vague
  // de courses de plus, donc un déplacement de plus, décidé à la place de la
  // personne (`plan_feasibility.ts:27-40`).
  const out = plan({ style: "minimal", runs: 3 });
  assertEquals(out.sessions, 2);
  assert(out.notes.includes("style_caps_sessions"));
  // ET LA COURSE EN TROP SE COMPTE, pour que la rationale puisse le dire.
  assertEquals(unusedGroceryRuns(3, out), 1);
  // Un style qui ne plafonne pas ne note rien, et ne laisse rien d'inutilisé.
  const keen = plan({ style: "keen", runs: 3 });
  assertEquals(keen.sessions, 3);
  assertEquals(keen.notes, []);
  assertEquals(unusedGroceryRuns(3, keen), 0);
});

Deno.test("A2 — « une seule course » EXIGE le congélateur, et le refus est nommé", () => {
  for (const freezer of [false, null] as const) {
    const out = plan({ runs: 1, freezer });
    assertEquals(out.sessions, 2, String(freezer));
    assert(
      out.notes.includes("runs_1_needs_freezer"),
      `freezer=${freezer}: le refus doit être nommé`,
    );
    assertEquals(out.usesFreezer, false);
  }
  // ⛔ `null` REFUSE COMME `false`. « On ne sait pas s'il en a un » n'est pas
  // une raison de lui promettre une semaine au congélateur.
  const ok = plan({ runs: 1, freezer: true });
  assertEquals(ok.sessions, 1);
  assertEquals(ok.notes, []);
  assertEquals(ok.usesFreezer, true);
  // Une seule session tient toute la fenêtre: son budget double, sous 240.
  assertEquals(ok.sessionMinutes, 120);
  assertEquals(plan({ style: "keen", runs: 1, freezer: true }).sessionMinutes, 240);
  assertEquals(plan({ style: "minimal", runs: 1, freezer: true }).sessionMinutes, 60);
});

Deno.test("A2 — l'écart de courses ne compte PAS le congélateur manquant", () => {
  // ⚠️ « Une course demandée, deux sessions servies » a son propre nom
  // (`runs_1_needs_freezer`). Le compter comme une course inutilisée dirait
  // « une course de trop » à quelqu'un qui en avait demandé UNE SEULE.
  const out = plan({ runs: 1, freezer: false });
  assertEquals(out.sessions, 2);
  assertEquals(unusedGroceryRuns(1, out), 0);
});

// ---------------------------------------------------------------------------
// 4. OÙ TOMBENT LES JOURS
// ---------------------------------------------------------------------------

Deno.test("A2 — la PREMIÈRE session est au rang 0, donc la VEILLE quand il y en a une", () => {
  // C'est le geste que P1 a rendu automatique: on cuisine avant de manger.
  for (const runs of [1, 2, 3] as const) {
    const out = plan({ runs, freezer: true, style: "keen" });
    assertEquals(out.cookDays[0], WITH_LEAD[0], `runs=${runs}`);
  }
  // Sans veille, le rang 0 est le premier jour MANGÉ, et c'est encore le bon
  // jour: on cuisine le matin pour midi (`same_morning`).
  const noLead = plan({ windowDays: NO_LEAD, leadDay: false, daysToEat: 7 });
  assertEquals(noLead.cookDays[0], "mon");
});

Deno.test("A2 — les sessions suivantes découpent les jours MANGÉS", () => {
  const two = plan({ runs: 2, style: "balanced" });
  assertEquals(two.sessions, 2);
  // Fenêtre `sun mon tue wed thu fri sat sun`, veille au rang 0, 7 jours
  // mangés: la seconde session tombe au rang 1 + floor(7/2) = 4, soit jeudi.
  assertEquals(two.cookDays, ["sun", "thu"]);
  const three = plan({ runs: 3, style: "keen" });
  assertEquals(three.sessions, 3);
  // Rangs 0, 1 + floor(7/3) = 3, 1 + floor(14/3) = 5 → dimanche, mercredi, vendredi.
  assertEquals(three.cookDays, ["sun", "wed", "fri"]);
});

Deno.test("A2 — un jour de cuisine ne sort JAMAIS deux fois", () => {
  // ⛔ DEUX SESSIONS SUR LE MÊME JETON DONNERAIENT UNE VAGUE DE MOINS que ce
  // que la rationale annonce, en silence: `planGroceryWaves` regroupe par
  // DATE. C'est atteignable sur une fenêtre courte, d'où le plafond `eaten`.
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    for (const runs of [1, 2, 3] as const) {
      for (const style of COOKING_STYLES) {
        const window = NO_LEAD.slice(0, days) as DayToken[];
        const out = deriveCookingPlan({
          style,
          runs,
          freezer: true,
          windowDays: window,
          leadDay: false,
          daysToEat: days,
        });
        assertEquals(
          new Set(out.cookDays).size,
          out.cookDays.length,
          `${style}/${runs}/${days}: jour de cuisine en double`,
        );
        assert(
          out.cookDays.length <= out.sessions,
          `${style}/${runs}/${days}: plus de jours que de sessions`,
        );
        for (const day of out.cookDays) {
          assert(window.includes(day), `${style}/${runs}/${days}: ${day} hors fenêtre`);
        }
      }
    }
  }
});

Deno.test("A2 — une fenêtre trop courte plafonne les sessions, et le DIT", () => {
  const out = deriveCookingPlan({
    style: "keen",
    runs: 3,
    freezer: true,
    windowDays: ["mon", "tue"],
    leadDay: false,
    daysToEat: 2,
  });
  assertEquals(out.sessions, 2);
  assert(out.notes.includes("days_cap_sessions"));
});

Deno.test("A2 — `longestFridgeStretch` mesure la découpe, il ne la juge pas", () => {
  const two = plan({ runs: 2, style: "balanced" });
  // `sun` au rang 0, `thu` au rang 4, fenêtre de 8: le plus long écart est
  // 8 − 4 = 4 jours après la dernière session.
  assertEquals(longestFridgeStretch(two, WITH_LEAD), 4);
  const one = plan({ runs: 1, freezer: true });
  assertEquals(longestFridgeStretch(one, WITH_LEAD), 8);
});

// ---------------------------------------------------------------------------
// 5. LES GARDES D'ENTRÉE — un paramètre optionnel serait une garde désarmée
// ---------------------------------------------------------------------------

Deno.test("A2 — `freezer` et `leadDay` sont REQUIS, et l'oubli JETTE", () => {
  assertThrows(
    () => plan({ freezer: undefined as never }),
    Error,
    "freezer",
  );
  assertThrows(
    () => plan({ leadDay: undefined as never }),
    Error,
    "leadDay",
  );
  assertThrows(
    () => plan({ style: "lazy" as unknown as CookingStyle }),
    Error,
    "style inconnu",
  );
  assertThrows(
    () => plan({ runs: 0 as unknown as GroceryRuns }),
    Error,
    "runs hors",
  );
});

Deno.test("A2 — MUTATION: on ne SORT jamais du plafond dur, quoi qu'on demande", () => {
  // Le test qui tombe si quelqu'un « assouplit » `MAX_COOKING_SESSIONS` sans
  // toucher au module des vagues, qui ne sait rendre qu'une vague par session.
  for (const style of COOKING_STYLES) {
    for (const runs of GROCERY_RUNS) {
      const out = plan({ style, runs, freezer: true });
      assert(out.sessions >= 1 && out.sessions <= MAX_COOKING_SESSIONS);
    }
  }
});
