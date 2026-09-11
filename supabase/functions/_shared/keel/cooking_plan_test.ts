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
  offerableGroceryRuns,
  readCookingStyle,
  readGroceryRuns,
  resolveCookingCapacity,
  unusedGroceryRuns,
} from "./cooking_plan.ts";
import { type DayToken } from "./tokens.ts";
// ⛔ IMPORTÉES POUR ÊTRE ÉPROUVÉES, PAS POUR ÊTRE UTILISÉES. Voir le dernier
// bloc: l'offre de cadence repose sur une propriété de CE module-là, et une
// dépendance qu'on affirme sans la mesurer est une contrainte documentée qui
// survivra à sa cause.
import {
  addDays,
  MAX_WINDOW_DAYS,
  withCookDayBefore,
  withoutSpentFirstDay,
} from "./meal_plan_window.ts";

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
      // ⟳ 2026-09-09 — les deux entrées de l'offre, requises depuis que
      // « peu importe » se résout contre elle.
      oneCookingSession: false,
      maxFridgeDays: 3,
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
    // ⟳ 2026-09-09 — les deux entrées de l'offre, requises depuis que
    // « peu importe » se résout contre elle. `false` / `3` = le cas
    // nominal: aucune session unique demandée, conservation standard.
    oneCookingSession: false,
    maxFridgeDays: 3,
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

Deno.test("LOT C — « une seule course » exige le congélateur, et pousse les COURSES", () => {
  // ⟳ RENVERSÉ LE 2026-09-04. Avant, l'absence de congélateur poussait les
  // SESSIONS de 1 à 2. Elle pousse maintenant les COURSES, et les sessions ne
  // dépendent plus de la cadence de courses du tout.
  for (const freezer of [false, null] as const) {
    const out = plan({ runs: 1, freezer });
    assertEquals(out.runs, 2, `freezer=${freezer}: il faut y retourner`);
    assertEquals(out.sessions, 3, `freezer=${freezer}: le style décide, pas les courses`);
    assert(
      out.notes.includes("runs_1_needs_freezer"),
      `freezer=${freezer}: le refus doit être nommé`,
    );
    assertEquals(out.usesFreezer, false);
  }
  // ⛔ `null` REFUSE COMME `false`. « On ne sait pas s'il en a un » n'est pas
  // une raison de lui promettre une semaine au congélateur.
  //
  // ⛔ ET VOICI LA CONFIGURATION QUE LE LOT EXISTE POUR OUVRIR: une course,
  // trois sessions. On achète tout le dimanche, on congèle ce dont les sessions
  // suivantes auront besoin. Elle était INATTEIGNABLE avant ce lot.
  const ok = plan({ runs: 1, freezer: true });
  assertEquals(ok.runs, 1);
  assertEquals(ok.sessions, 3);
  assertEquals(ok.notes, []);
  // « Le plan s'appuie sur le congélateur »: on fait les courses moins souvent
  // qu'on ne cuisine, donc du cru est acheté d'avance.
  assertEquals(ok.usesFreezer, true);
  // Le budget ne double que sur une session UNIQUE, et il n'y en a plus ici.
  assertEquals(ok.sessionMinutes, 60);
  assertEquals(plan({ style: "keen", runs: 1, freezer: true }).sessionMinutes, 120);
  assertEquals(plan({ style: "minimal", runs: 1, freezer: true }).sessionMinutes, 30);
});

Deno.test("⛔ LOT C — L'INVARIANT `runs <= sessions`, par ÉNUMÉRATION", () => {
  // La règle tranchée par l'utilisateur: on ne va pas au magasin plus souvent
  // qu'on ne cuisine. Elle doit tenir sur TOUTE la table, pas sur trois cas.
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    for (const runs of [1, 2, 3] as const) {
      for (const style of COOKING_STYLES) {
        for (const freezer of [true, false, null] as const) {
          const window = NO_LEAD.slice(0, days) as DayToken[];
          const out = deriveCookingPlan({
            style,
            runs,
            freezer,
            windowDays: window,
            leadDay: false,
            daysToEat: days,
          });
          const où = `${style}/${days}j/${runs}c/freezer=${freezer}`;
          assert(out.runs <= out.sessions, `${où}: ${out.runs} courses > ${out.sessions} sessions`);
          assert(out.runs >= 1, `${où}: au moins une course`);
          assert(out.sessions >= 1, `${où}: au moins une session`);
          // ⛔ ET LA CAUSE EST TOUJOURS NOMMÉE quand le plan rabote.
          if (out.runs < runs && !out.notes.includes("runs_1_needs_freezer")) {
            assert(
              out.notes.includes("runs_capped_by_sessions"),
              `${où}: raboté de ${runs} à ${out.runs} sans le dire`,
            );
          }
        }
      }
    }
  }
});

Deno.test("⛔ LOT C — les COURSES ne décident plus des sessions", () => {
  // C'est le défaut que le lot ferme, dit en une ligne: à style et fenêtre
  // égaux, changer le nombre de courses ne doit RIEN changer aux sessions.
  const une = plan({ runs: 1, freezer: true });
  const deux = plan({ runs: 2, freezer: true });
  const trois = plan({ runs: 3, freezer: true });
  assertEquals(une.sessions, deux.sessions);
  assertEquals(deux.sessions, trois.sessions);
  assertEquals(une.cookDays, trois.cookDays);
});

Deno.test("A2 — l'écart de courses ne compte PAS le congélateur manquant", () => {
  // ⚠️ « Une course demandée, deux servies » a son propre nom
  // (`runs_1_needs_freezer`). Le compter comme une course inutilisée dirait
  // « une course de trop » à quelqu'un qui en avait demandé UNE SEULE.
  const out = plan({ runs: 1, freezer: false });
  assertEquals(out.runs, 2);
  assertEquals(unusedGroceryRuns(1, out), 0);
});

Deno.test("LOT C — l'écart compte ce que le PLAN organise, pas les sessions", () => {
  // « Le moins possible » plafonne à 2 sessions; trois courses demandées sont
  // donc ramenées à deux vagues, et la troisième reste POSSIBLE — c'est du
  // frais du jour, et la rationale doit le dire au lieu de l'interdire.
  const out = plan({ style: "minimal", runs: 3, freezer: true });
  assertEquals(out.sessions, 2);
  assertEquals(out.runs, 2);
  assert(out.notes.includes("runs_capped_by_sessions"));
  assert(out.notes.includes("style_caps_sessions"));
  assertEquals(unusedGroceryRuns(3, out), 1);
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
  // ⟳ LOT C — LE STYLE CHOISIT LE NOMBRE DE SESSIONS, plus les courses.
  // `minimal` porte 2, `keen` en porte 3: c'est par là qu'on sélectionne la
  // découpe à éprouver.
  const two = plan({ style: "minimal" });
  assertEquals(two.sessions, 2);
  // Fenêtre `sun mon tue wed thu fri sat sun`, veille au rang 0, 7 jours
  // mangés: la seconde session tombe au rang 1 + floor(7/2) = 4, soit jeudi.
  assertEquals(two.cookDays, ["sun", "thu"]);
  const three = plan({ style: "keen" });
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
  const two = plan({ style: "minimal" });
  // `sun` au rang 0, `thu` au rang 4, fenêtre de 8: le plus long écart est
  // 8 − 4 = 4 jours après la dernière session.
  assertEquals(longestFridgeStretch(two, WITH_LEAD), 4);
  // ⟳ LOT C — UNE SESSION UNIQUE VIENT MAINTENANT DE LA FENÊTRE, pas des
  // courses: un seul jour mangé ne peut porter qu'une séance de cuisine.
  const one = plan({ daysToEat: 1, freezer: true });
  assertEquals(one.sessions, 1);
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

// ===========================================================================
// L'OFFRE — CE QU'ON A LE DROIT DE PROPOSER (2026-09-04)
// ===========================================================================
//
// ── CE QUE CES TESTS DOIVENT EMPÊCHER ─────────────────────────────────────
//   ① qu'on propose une cadence que le plan ne suivra pas — le défaut mesuré:
//      « trois courses ? » sur un plan de deux jours, « trois courses ? » sous
//      une case « je cuisine tout en une seule fois »;
//   ② qu'une option disparaisse SANS MOTIF: `limit` est la moitié qui se lit à
//      l'écran, et un `null` de trop ferait une liste courte sans phrase;
//   ③ que l'offre se mette à recopier les plafonds au lieu de les LIRE. Les
//      deux derniers tests mutent `COOKING_STYLE_PROFILE` par la lecture, pas
//      par une constante recopiée: ils comparent l'offre au plafond réel.

/**
 * ⛔ `maxFridgeDays: 3` EST UN LITTÉRAL, PAS `MAX_FRIDGE_DAYS`. Paramétrer le
 * banc par sa propre constante le laisserait VERT le jour où elle change —
 * cicatrice mesurée de ce dépôt. La valeur elle-même est épinglée ailleurs
 * (`week_bounds_test.ts:392`), et c'est ce test-là qui doit tomber si elle
 * bouge, pas celui-ci qui doit s'y adapter en silence.
 */
const offer = (over: Partial<Parameters<typeof offerableGroceryRuns>[0]> = {}) =>
  offerableGroceryRuns({
    style: null,
    oneCookingSession: false,
    daysToEat: 7,
    maxFridgeDays: 3,
    ...over,
  });

Deno.test("l'offre — sans contrainte, LES TROIS, et aucun motif", () => {
  const out = offer();
  assertEquals(out.values, [1, 2, 3]);
  assertEquals(out.forced, null);
  // ⛔ `null` EST LA DONNÉE: un motif non nul ferait afficher une phrase qui
  // explique un resserrement qui n'a pas eu lieu.
  assertEquals(out.limit, null);
});

Deno.test("l'offre — un style JAMAIS DEMANDÉ ne plafonne pas", () => {
  // La cicatrice `20260818110000:48-51`, appliquée à l'offre: une clé absente
  // n'est pas « le moins possible ». La traiter comme telle retirerait la
  // troisième cadence à tout compte qui n'a pas encore répondu.
  assertEquals(offer({ style: null }).values, [1, 2, 3]);
  assertEquals(offer({ style: null }).limit, null);
});

Deno.test("l'offre — « le moins possible » retire la troisième course", () => {
  const out = offer({ style: "minimal" });
  assertEquals(out.values, [1, 2]);
  assertEquals(out.forced, null);
  assertEquals(out.limit, "style");
  // ⛔ ET LE PLAFOND EST LU, PAS RECOPIÉ. Si quelqu'un change `sessionCap`
  // là-haut, c'est cette ligne qui dit que l'offre a suivi.
  assertEquals(out.values.length, COOKING_STYLE_PROFILE.minimal.sessionCap);
  for (const style of ["balanced", "keen"] as const) {
    assertEquals(offer({ style }).values, [1, 2, 3]);
  }
});

Deno.test("l'offre — le plafond de fenêtre est la CONSERVATION, pas le compte de jours", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT MESURÉ À L'ÉCRAN LE 2026-09-04, ET IL A ÉTÉ LIVRÉ UNE DEMI-
  // JOURNÉE: un plan du 4 au 5 septembre proposait DEUX courses pour DEUX
  // jours. La première version comptait les JOURS — « combien de courses
  // tiennent dans la fenêtre » —, alors que la question est « combien il en
  // FAUT »: un lot cuisiné couvre `maxFridgeDays` jours.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⌈jours ÷ 3⌉, avec le plafond dur à 3:
  //   1, 2, 3 jours ⇒ 1 course     4, 5, 6 jours ⇒ 2      7 jours ⇒ 3
  for (const daysToEat of [1, 2, 3]) {
    const out = offer({ daysToEat });
    assertEquals(out.values, [1], `${daysToEat} jours`);
    assertEquals(out.forced, 1, `${daysToEat} jours`);
    assertEquals(out.limit, "days", `${daysToEat} jours`);
  }
  for (const daysToEat of [4, 5, 6]) {
    const out = offer({ daysToEat });
    assertEquals(out.values, [1, 2], `${daysToEat} jours`);
    assertEquals(out.forced, null, `${daysToEat} jours`);
    assertEquals(out.limit, "days", `${daysToEat} jours`);
  }
  assertEquals(offer({ daysToEat: 7 }).values, [1, 2, 3]);
  assertEquals(offer({ daysToEat: 7 }).limit, null);
});

Deno.test("l'offre — MUTATION: la conservation est LUE, jamais recopiée", () => {
  // Le test qui tombe si quelqu'un réécrit `⌈jours ÷ 3⌉` avec un `3` en dur.
  // Avec une conservation d'un seul jour, chaque jour demande sa session.
  assertEquals(offer({ daysToEat: 2, maxFridgeDays: 1 }).values, [1, 2]);
  assertEquals(offer({ daysToEat: 3, maxFridgeDays: 1 }).values, [1, 2, 3]);
  // Et avec une conservation d'une semaine, une seule suffit partout.
  for (const daysToEat of [1, 4, 7]) {
    assertEquals(offer({ daysToEat, maxFridgeDays: 7 }).values, [1], `${daysToEat}j`);
  }
});

Deno.test("l'offre — « tout en une seule fois » tranche, et il NOMME la case", () => {
  // ⛔ IL PASSE DERNIER, ET C'EST LE MOTIF QUI COMPTE. Nommer la fenêtre ou le
  // style devant une case qu'on vient de cocher enverrait corriger la mauvaise
  // réponse.
  for (const style of [null, "minimal", "keen"] as const) {
    for (const daysToEat of [1, 2, 7]) {
      const out = offer({ oneCookingSession: true, style, daysToEat });
      assertEquals(out.values, [1]);
      assertEquals(out.forced, 1);
      assertEquals(out.limit, "one_session");
    }
  }
});

Deno.test("l'offre — à égalité de plafond, c'est la FENÊTRE qu'on nomme", () => {
  // « le moins possible » et cinq jours plafonnent tous les deux à 2. On nomme
  // la fenêtre: elle est concrète, datée, et la personne vient de la régler
  // trois champs plus haut. « Ton style ne permet pas trois courses » devant un
  // plan trop court envoie corriger la mauvaise réponse.
  const out = offer({ style: "minimal", daysToEat: 5 });
  assertEquals(out.values, [1, 2]);
  assertEquals(out.limit, "days");
  // ⚠️ ET L'INVERSE TIENT AUSSI: sur sept jours, la conservation ne plafonne
  // plus (elle en autorise trois) et c'est le STYLE qui est nommé.
  assertEquals(offer({ style: "minimal", daysToEat: 7 }).limit, "style");
});

Deno.test("l'offre — elle n'est JAMAIS vide, et jamais au-dessus du plafond dur", () => {
  for (const style of [null, ...COOKING_STYLES] as const) {
    for (const oneCookingSession of [true, false]) {
      for (const daysToEat of [-3, 0, 1, 2, 5, 40]) {
        const out = offer({ style, oneCookingSession, daysToEat });
        assert(out.values.length >= 1, `offre vide: ${style}/${daysToEat}`);
        assert(out.values.length <= MAX_COOKING_SESSIONS);
        assertEquals(out.values[0], 1, "« une course » sort toujours de l'offre");
        // ⛔ UN MOTIF DÈS QUE LA LISTE EST COURTE — la moitié qui se lit à
        // l'écran. Une option qui s'évapore sans phrase se lit comme une panne.
        assertEquals(
          out.limit === null,
          out.values.length === MAX_COOKING_SESSIONS,
          `motif et longueur désaccordés: ${JSON.stringify(out)}`,
        );
        assertEquals(out.forced, out.values.length === 1 ? 1 : null);
      }
    }
  }
});

Deno.test("l'offre — MUTATION: elle est le MIROIR de la dérivation, pas une seconde règle", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST QUI DIT POURQUOI LA FONCTION VIT DANS CE FICHIER.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Toute cadence PROPOSÉE doit être une cadence que le plan ORGANISE — sinon
  // on propose un geste que le plan ne fera pas, ce qui est exactement le
  // défaut du 2026-09-04. Écrite dans le composant avec `2` et `3` en dur,
  // l'offre aurait passé ce test le premier jour et menti le lendemain.
  //
  // ⟳ LOT C — LE MIROIR EST `derived.runs`, PLUS `derived.sessions`. Les deux
  // étaient le même nombre tant que les courses semaient les sessions. Depuis
  // le renversement, ce que l'offre promet est un nombre de VAGUES DE COURSES,
  // et c'est ce nombre-là qui doit se retrouver dans le plan.
  const windowDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as DayToken[];
  for (const style of COOKING_STYLES) {
    for (const daysToEat of [1, 2, 3, 5, 7]) {
      const out = offerableGroceryRuns({
        style,
        oneCookingSession: false,
        daysToEat,
        maxFridgeDays: 3,
      });
      for (const runs of out.values) {
        const derived = deriveCookingPlan({
          style,
          runs,
          freezer: true,
          windowDays: windowDays.slice(0, daysToEat),
          leadDay: false,
          daysToEat,
        });
        assertEquals(
          derived.runs,
          runs,
          `proposé ${runs} course(s) en ${style}/${daysToEat}j, le plan en organise ${derived.runs}`,
        );
        // ⛔ ET L'INVARIANT DU LOT TIENT SUR TOUTE L'OFFRE: jamais plus de
        // courses que de sessions, sur aucune cadence proposable.
        assert(derived.runs <= derived.sessions, `${style}/${daysToEat}j/${runs}c`);
        assertEquals(unusedGroceryRuns(runs, derived), 0);
      }
    }
  }
});

Deno.test("l'offre — REFUSE une entrée qui désarmerait la garde", () => {
  assertThrows(
    () => offer({ daysToEat: Number.NaN }),
    Error,
    "daysToEat non fini",
  );
  // ⛔ UNE CONSERVATION À ZÉRO DIVISERAIT PAR ZÉRO et rendrait `Infinity`
  // sessions — c'est-à-dire, après le plafond dur, une offre pleine sur un
  // plan où rien ne se conserve. Le refus est nommé plutôt que rattrapé.
  for (const maxFridgeDays of [0, -1, Number.NaN]) {
    assertThrows(
      () => offer({ maxFridgeDays }),
      Error,
      "`maxFridgeDays` est REQUIS",
    );
  }
  assertThrows(
    () =>
      offerableGroceryRuns({
        style: null,
        oneCookingSession: undefined as unknown as boolean,
        daysToEat: 7,
        maxFridgeDays: 3,
      }),
    Error,
    "`oneCookingSession` est REQUIS",
  );
});

// ===========================================================================
// L'INVARIANT DONT L'OFFRE DÉPEND — et il vit dans un AUTRE module
// ===========================================================================
//
// ── CE QUE `offerableGroceryRuns` AFFIRME SANS POUVOIR LE VOIR ────────────
// Elle reçoit `daysToEat` = LA FENÊTRE DEMANDÉE (ce que l'écran a saisi), pas
// les jours réellement mangés. La prop de `GroceryRunsField` justifie ce choix
// ainsi: « on ne retire jamais une option que le moteur aurait honorée ».
//
// Cette phrase n'est vraie que si le serveur ne peut que RÉDUIRE les jours
// mangés. Deux gestes touchent la fenêtre servie, et ils vivent dans
// `meal_plan_window.ts` — un module que ce lot ne possède pas:
//
//   `withCookDayBefore`     durationDays +1  ET  cookOnlyDay = ce jour-là
//   `withoutSpentFirstDay`  durationDays −1
//   daysToEat = durationDays − (cookOnlyDay === null ? 0 : 1)
//
// La veille ajoute un jour à la fenêtre ET le retire des jours mangés: elle
// laisse `daysToEat` INCHANGÉ. Le retrait, lui, ne peut que soustraire.
//
// ⛔ POURQUOI CE TEST EXISTE ICI PLUTÔT QUE NULLE PART. Une hypothèse sur le
// module d'un voisin, écrite dans un commentaire, est exactement la forme que
// ce dépôt paie en boucle: elle reste vraie le jour où on l'écrit, et personne
// n'est prévenu le jour où elle cesse de l'être. Le geste qui la casserait est
// CONNU — un lot qui ALLONGERAIT la fenêtre mangée (« trois jours demandés =
// trois jours nourris », écartée le 2026-09-04) — et il ne toucherait aucun
// fichier de ce lot. Ce test-ci rougirait.

Deno.test("l'offre — INVARIANT VOISIN: les jours MANGÉS ne dépassent jamais les jours DEMANDÉS", () => {
  const today = "2026-09-04";
  const slots = ["breakfast", "lunch", "dinner"];

  for (let requested = 1; requested <= MAX_WINDOW_DAYS; requested++) {
    // ── ① LA FENÊTRE COMMENCE DEMAIN: la veille peut être accordée ────────
    // (`withoutSpentFirstDay` se refuse alors sur `not_today`.)
    const tomorrow = addDays(today, 1);
    const ahead = withCookDayBefore(
      { startsOn: tomorrow, durationDays: requested },
      { asked: true, today },
    );
    const eatenAhead = ahead.durationDays - (ahead.cookOnlyDay === null ? 0 : 1);
    assertEquals(
      eatenAhead,
      requested,
      `veille accordée sur ${requested}j: les jours mangés ont bougé`,
    );

    // ── ② LA FENÊTRE COMMENCE AUJOURD'HUI, JOURNÉE ENTIÈREMENT DÉPENSÉE ───
    // (`withCookDayBefore` s'y refuse sur `in_the_past`: la veille serait hier.)
    const spent = withoutSpentFirstDay(
      { startsOn: today, durationDays: requested },
      {
        today,
        cookOnlyDay: null,
        declaredSlots: slots,
        passedSlots: slots,
        // ⟳ 2026-09-04 · les deux entrées du délai de courses. Ce cas éprouve la
        // règle des moments PASSÉS: rien n'est retenu, la coupure n'est pas
        // atteinte, et son assertion reste celle d'avant le lot.
        heldSlots: [],
        shoppingCutoffReached: false,
      },
    );
    assert(
      spent.durationDays <= requested,
      `journée dépensée sur ${requested}j: la fenêtre a GRANDI (${spent.durationDays})`,
    );

    // ── ③ LES DEUX SE RENCONTRENT — l'état que j'avais cru IMPOSSIBLE ────
    // ══════════════════════════════════════════════════════════════════════
    // LA CORRECTION QUI A FAILLI COÛTER UNE GARDE, 2026-09-04.
    // ══════════════════════════════════════════════════════════════════════
    //
    // J'avais écrit que les deux gestes étaient « mutuellement exclusifs par
    // construction »: `withoutSpentFirstDay` exige `startsOn === today`, et
    // `withCookDayBefore` refuse `in_the_past` dès que la fenêtre part
    // d'aujourd'hui. C'est FAUX, et dangereusement — quelqu'un qui le lit en
    // conclut que la garde `cook_day` est redondante, et la retire.
    //
    // ⛔ LE RAISONNEMENT PORTAIT SUR L'ÉTAT **AVANT** LA VEILLE. L'appelant
    // RÉASSIGNE (`generate-meal-v1:1359-1360`): quand la veille est accordée,
    // `startsOn` DEVIENT aujourd'hui. `withoutSpentFirstDay` reçoit donc
    // `startsOn === today` ET `cookOnlyDay !== null` — l'état que je croyais
    // impossible est précisément celui que la veille CRÉE.
    //
    // Sans la garde `cook_day`, le contrôle passerait aux moments (tous passés
    // en soirée), et la fenêtre perdrait LE JOUR DE CUISINE que la personne
    // vient de demander. Mesuré en run réel par la lane fenêtre, deux fois:
    // `issues=[spent_first_day_kept: cook_day]`, un jeton qu'AUCUN autre chemin
    // n'émet.
    //
    // ⚠️ CE TEST TIENT DONC LA GARDE D'UN AUTRE LOT, depuis celui-ci: mon
    // invariant EN DÉPEND, et une dépendance qu'on n'éprouve pas est une
    // dépendance qu'on retire par mégarde.
    if (requested + 1 <= MAX_WINDOW_DAYS) {
      const ahead2 = withCookDayBefore(
        { startsOn: tomorrow, durationDays: requested },
        { asked: true, today },
      );
      assertEquals(ahead2.refused, null, `veille refusée sur ${requested}j`);
      assertEquals(ahead2.startsOn, today, "la veille n'a pas reculé la fenêtre");
      const met = withoutSpentFirstDay(
        { startsOn: ahead2.startsOn, durationDays: ahead2.durationDays },
        {
          today,
          cookOnlyDay: ahead2.cookOnlyDay,
          declaredSlots: slots,
          // TOUS les moments passés: sans la garde, la journée serait « finie ».
          passedSlots: slots,
          // ⟳ 2026-09-04 · rien n'est retenu par les courses ici: c'est la
          // garde `cook_day` qu'on éprouve, et elle passe AVANT les moments.
          heldSlots: [],
          shoppingCutoffReached: false,
        },
      );
      assertEquals(
        met.refused,
        "cook_day",
        `la garde du piège n'a pas tiré sur ${requested}j — le jour de cuisine est mangé`,
      );
      assertEquals(met.durationDays, ahead2.durationDays, "la fenêtre a rétréci quand même");
      const eatenMet = met.durationDays - (ahead2.cookOnlyDay === null ? 0 : 1);
      assertEquals(
        eatenMet,
        requested,
        `veille + journée dépensée sur ${requested}j: les jours mangés ont bougé`,
      );
    }

    // ── ④ CE QUE L'OFFRE EN TIRE ─────────────────────────────────────────
    // ⛔ L'ASSERTION QUI COMPTE: l'offre calculée sur la DEMANDE ne peut être
    // que la même, ou plus large, que celle calculée sur les jours servis.
    // Plus large = on propose une cadence que le plan n'utilisera pas, et la
    // rationale le dit. Plus ÉTROITE serait le défaut: on retirerait une
    // option que le moteur aurait honorée, sans que rien ne le dise.
    for (const served of [eatenAhead, spent.durationDays]) {
      const asked = offerableGroceryRuns({
        style: null,
        oneCookingSession: false,
        daysToEat: requested,
        maxFridgeDays: 3,
      });
      const real = offerableGroceryRuns({
        style: null,
        oneCookingSession: false,
        daysToEat: served,
        maxFridgeDays: 3,
      });
      assert(
        asked.values.length >= real.values.length,
        `${requested}j demandés / ${served}j servis: l'offre saisie est plus ÉTROITE ` +
          `que la servie (${asked.values.length} < ${real.values.length})`,
      );
    }
  }
});

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
    // ⟳ 2026-09-09 — les deux entrées de l'offre, requises depuis que
    // « peu importe » se résout contre elle. `false` / `3` = le cas
    // nominal: aucune session unique demandée, conservation standard.
    oneCookingSession: false,
    maxFridgeDays: 3,
  });
  assertEquals(out.cookDays, ["sun"]);
  assertEquals(out.plan?.sessions, 1);
  assert(out.plan?.notes.includes("cook_days_declared"));
});
