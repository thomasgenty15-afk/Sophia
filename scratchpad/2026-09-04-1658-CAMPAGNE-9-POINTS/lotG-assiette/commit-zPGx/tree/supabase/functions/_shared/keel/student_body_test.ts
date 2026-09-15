// KEEL — student_body.ts.
//
// Les tests qui portent la doctrine du lot :
//   * « corps inconnu => la semaine est EXACTEMENT celle d'avant »
//     -- la condition de désarmement. Tous les élèves existants sont dans ce
//        cas, et une entrée neuve qui change leur semaine sans rien savoir
//        d'eux serait une régression déguisée en fonctionnalité.
//   * « la direction et les mesures CHANGENT la semaine »
//     -- prouvé par diff sur le prompt et sur le plafond de lignes, pas par
//        lecture de code. Une entrée qui n'altère aucune branche est
//        décorative, et c'est un P0.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  type BodyInputs,
  type DatedMeasure,
  MIN_NUTRITION_LINES,
  trendOf,
  UNKNOWN_BODY,
  WAIST_NOISE_CM,
  weekEmphasis,
  WEIGHT_NOISE_KG,
} from "./student_body.ts";
import { focusFor, STUDENT_GOALS, type StudentGoal } from "./week_plan_generation.ts";

function series(...values: number[]): DatedMeasure[] {
  return values.map((value, i) => ({
    weekStart: `2026-0${6 + Math.floor(i / 4)}-0${(i % 4) * 7 + 1}`,
    value,
  }));
}

function emphasisOf(goal: StudentGoal, body: BodyInputs) {
  return weekEmphasis(goal, body, focusFor(goal));
}

// ---------------------------------------------------------------------------
// trendOf
// ---------------------------------------------------------------------------

Deno.test("trendOf: une seule mesure n'est pas une tendance", () => {
  // `unknown`, jamais `stable`. Dire « stable » d'un point unique est une
  // affirmation qu'on n'a pas les moyens de faire — et elle ferait baisser le
  // nombre de lignes d'un élève dont on ignore tout du mouvement.
  assertEquals(trendOf([], WEIGHT_NOISE_KG), "unknown");
  assertEquals(trendOf(series(80), WEIGHT_NOISE_KG), "unknown");
});

Deno.test("trendOf: le bruit d'une balance n'est pas une tendance", () => {
  // Un poids varie d'un kilo dans la journée. Sous le seuil, c'est `stable`.
  assertEquals(trendOf(series(80, 80.4), WEIGHT_NOISE_KG), "stable");
  assertEquals(trendOf(series(80, 79.2), WEIGHT_NOISE_KG), "stable");
  assertEquals(trendOf(series(80, 78.9), WEIGHT_NOISE_KG), "falling");
  assertEquals(trendOf(series(80, 81.5), WEIGHT_NOISE_KG), "rising");
});

Deno.test("trendOf: premier vs dernier, pas le dernier saut", () => {
  // 80 -> 76 avec un rebond au milieu reste une descente.
  assertEquals(trendOf(series(80, 77, 78, 76), WEIGHT_NOISE_KG), "falling");
});

Deno.test("trendOf: le tour de taille a son propre seuil", () => {
  assertEquals(trendOf(series(90, 88.5), WAIST_NOISE_CM), "stable");
  assertEquals(trendOf(series(90, 87), WAIST_NOISE_CM), "falling");
});

// ---------------------------------------------------------------------------
// LA CONDITION DE DÉSARMEMENT
// ---------------------------------------------------------------------------

Deno.test("DÉSARMEMENT — corps inconnu: identique à focusFor, au caractère près", () => {
  // LE test du lot. Un élève d'avant ce chantier n'a ni date de naissance ni
  // mesure. Sa semaine doit être exactement celle qu'il aurait eue hier.
  for (const goal of STUDENT_GOALS) {
    const base = focusFor(goal);
    const withBody = emphasisOf(goal, UNKNOWN_BODY);
    assertEquals(withBody.maxNutrition, base.maxNutrition, goal);
    assertEquals(withBody.emphasis, base.emphasis, goal);
    assertEquals(withBody.applied.trendsKnown, false, goal);
    assertEquals(withBody.applied.directionWorking, false, goal);
  }
});

// ---------------------------------------------------------------------------
// CE QUE CHAQUE ENTRÉE ALTÈRE — sinon elle est décorative
// ---------------------------------------------------------------------------

Deno.test("CONTRE-FACTUEL — l'objectif change la semaine", () => {
  // Le test explicitement demandé par le chantier, au niveau du prompt: même
  // élève, deux objectifs, deux consignes. S'ils étaient identiques, l'entrée
  // serait décorative et tout le lot ne servirait à rien.
  const fatLoss = emphasisOf("fat_loss", UNKNOWN_BODY);
  const recomp = emphasisOf("maintenance", UNKNOWN_BODY);
  assertNotEquals(fatLoss.emphasis, recomp.emphasis);
});

Deno.test("CONTRE-FACTUEL — la bande d'âge change la consigne, et chaque bande a la sienne", () => {
  const seen = new Set<string>();
  for (const ageBand of ["18_29", "30_44", "45_59", "60_plus"] as const) {
    const e = emphasisOf("maintenance", { ...UNKNOWN_BODY, ageBand });
    // Elle change quelque chose...
    assertNotEquals(e.emphasis, focusFor("maintenance").emphasis, ageBand);
    // ...et pas la même chose que les autres (R6: une branche NOMMÉE par bande,
    // sinon le token existe sans rien changer).
    assert(!seen.has(e.emphasis), `${ageBand} répète la clause d'une autre bande`);
    seen.add(e.emphasis);
  }
  assertEquals(seen.size, 4);
});

Deno.test("CONTRE-FACTUEL — les mesures changent la consigne", () => {
  const flat = emphasisOf("fat_loss", UNKNOWN_BODY);
  const falling = emphasisOf("fat_loss", {
    ...UNKNOWN_BODY,
    weightTrend: "falling",
  });
  assertNotEquals(flat.emphasis, falling.emphasis);
  assertNotEquals(flat.maxNutrition, falling.maxNutrition);
});

// ---------------------------------------------------------------------------
// « Ne répare pas ce qui marche »
// ---------------------------------------------------------------------------

Deno.test("ça marche => une ligne de MOINS, jamais une de plus", () => {
  const base = focusFor("fat_loss").maxNutrition;
  const working = emphasisOf("fat_loss", { ...UNKNOWN_BODY, weightTrend: "falling" });
  assertEquals(working.maxNutrition, base - 1);
  assertEquals(working.applied.directionWorking, true);
  assert(working.emphasis.includes("Do NOT add load"));
});

Deno.test("ça ne marche pas => le plafond ne BOUGE PAS", () => {
  // On n'ajoute pas de ligne à un élève dont les mesures ne vont pas dans le
  // sens de son objectif. Ce serait le punir d'un résultat, dans un produit qui
  // a supprimé les scores et les séries exprès.
  const base = focusFor("fat_loss").maxNutrition;
  for (const weightTrend of ["rising", "stable"] as const) {
    const e = emphasisOf("fat_loss", { ...UNKNOWN_BODY, weightTrend });
    assertEquals(e.maxNutrition, base, weightTrend);
    assertEquals(e.applied.directionWorking, false, weightTrend);
  }
});

// ⚠️ CE TEST A ÉTÉ RENVERSÉ LE 2026-08-18, ET C'EST UNE PERTE ASSUMÉE.
// Il gardait `recomposition`, la SEULE branche du module qui lisait le tour de
// taille pour décider (« la taille descend pendant que le poids ne descend
// pas »). Elle se replie sur `maintenance`, dont la signature est le poids
// STABLE — le tour de taille n'y entre plus.
//
// Ce qui rattrape en partie: `fat_loss` lit toujours `waistTrend === "falling"`
// (test juste en dessous), donc celui qui poursuit sa silhouette et accepte
// que la balance descende un peu coche « perdre du poids » et retrouve la
// lecture du tour de taille.
Deno.test("maintenance: c'est le POIDS STABLE qui porte l'objectif", () => {
  const base = focusFor("maintenance").maxNutrition;

  const working = emphasisOf("maintenance", {
    ...UNKNOWN_BODY,
    weightTrend: "stable",
    waistTrend: "falling",
  });
  assertEquals(working.applied.directionWorking, true);
  assertEquals(working.maxNutrition, base - 1);

  // Une balance qui monte contredit la troisième position, et la contredire
  // ne RETIRE pas de ligne — elle n'en ajoute pas non plus (le module ne punit
  // jamais un résultat).
  const rising = emphasisOf("maintenance", {
    ...UNKNOWN_BODY,
    weightTrend: "rising",
  });
  assertEquals(rising.applied.directionWorking, false);
  assertEquals(rising.maxNutrition, base);
});

Deno.test("fat_loss: la taille seule suffit, à poids constant", () => {
  // Perdre du tour de taille sans bouger sur la balance est exactement ce
  // qu'on cherche; un poids seul le manquerait.
  const e = emphasisOf("fat_loss", {
    ...UNKNOWN_BODY,
    weightTrend: "stable",
    waistTrend: "falling",
  });
  assertEquals(e.applied.directionWorking, true);
});

// ⚠️ CE TEST A ÉTÉ RENVERSÉ AUSSI. Il gardait `performance`, qui rendait
// TOUJOURS `false` — « ni le poids ni le tour de taille ne disent qu'une
// performance progresse ». Elle se replie sur `maintenance`, qui rend `true`
// sur un poids stable, et c'est cohérent avec ce que le jeton signifie après
// le repli: la balance ne doit pas bouger, et elle ne bouge pas.
//
// Ce qui reste à garder, et qui est plus important: le tour de taille SEUL ne
// dit rien de la troisième position. Un corps dont la taille bouge pendant que
// le poids est inconnu ne prouve rien.
Deno.test("maintenance: le tour de taille seul ne prouve rien", () => {
  for (const waistTrend of ["falling", "stable", "rising"] as const) {
    const e = emphasisOf("maintenance", { ...UNKNOWN_BODY, waistTrend });
    assertEquals(e.applied.directionWorking, false, waistTrend);
    assertEquals(e.maxNutrition, focusFor("maintenance").maxNutrition);
  }
});

Deno.test("le plafond ne descend jamais sous le plancher", () => {
  // `maintenance` part de 3. Même en retirant une ligne, une semaine reste une
  // semaine.
  const e = emphasisOf("maintenance", { ...UNKNOWN_BODY, weightTrend: "stable" });
  assertEquals(e.applied.directionWorking, true);
  assert(e.maxNutrition >= MIN_NUTRITION_LINES);
});

// ---------------------------------------------------------------------------
// Le contrat d'affichage — §3.3
// ---------------------------------------------------------------------------

Deno.test("la règle du non-verdict est accrochée aux DEUX branches", () => {
  // Ce dépôt a déjà payé « la garde testée dans une seule langue ». La branche
  // « ça marche » est justement celle où un modèle a envie de féliciter l'élève
  // avec son chiffre — l'interdiction doit y être aussi.
  for (const weightTrend of ["falling", "rising", "stable"] as const) {
    const e = emphasisOf("fat_loss", { ...UNKNOWN_BODY, weightTrend });
    assert(
      e.emphasis.includes("never quote these measurements back to the student"),
      `branche ${weightTrend} sans la règle du non-verdict`,
    );
    assert(
      e.emphasis.includes("Never turn a measurement into a number, a target or a judgement"),
      `branche ${weightTrend} sans l'interdiction de cible`,
    );
  }
});

Deno.test("aucune valeur chiffrée ne part dans la consigne", () => {
  // Des TENDANCES, jamais des valeurs. Un « 78.4 » dans le prompt finit dans
  // une ligne du plan.
  for (const goal of STUDENT_GOALS) {
    for (const ageBand of [null, "18_29", "45_59", "60_plus"] as const) {
      const e = emphasisOf(goal, {
        ageBand,
        weightTrend: "falling",
        waistTrend: "rising",
      });
      // Les seuls chiffres tolérés sont ceux des bornes d'âge en toutes lettres
      // ("45 and 59", "60 or older"), qui ne sont pas des mesures du corps.
      const measurementish = /\d+([.,]\d+)?\s*(kg|cm|kcal|calorie|%)/i;
      assert(!measurementish.test(e.emphasis), `${goal}/${ageBand}: ${e.emphasis}`);
    }
  }
});
