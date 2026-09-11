// FF-040 — LA BOUCLE DE CORRECTION. Ce que ces tests protègent, dans l'ordre de
// ce qui coûte le plus cher quand ça casse:
//
//   * LE REGISTRE DU RÉGIME — « a modest, livable deficit » ne contient aucun
//     chiffre, aucun filtre numérique ne le voit, et le modèle l'échoe dans le
//     `why` que l'élève lit. C'est le défaut fatal relevé par la revue TCA;
//   * LA CORRECTION SUR DU BRUIT — corriger un `not_computable`, c'est corriger
//     un plan sur des ingrédients qu'on n'a pas su lire. C'est exactement ce que
//     la gate des 80 % existe pour empêcher;
//   * LA DÉCLARATION PIÉTINÉE — proposer du poisson à quelqu'un qui a écrit
//     qu'il n'en mange pas. L'adhérence est le seul prédicteur à 12 mois;
//   * LE MAPPING TROUÉ — un verdict nouveau qui hérite silencieusement du
//     comportement du voisin.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  CORRECTION_PHRASES,
  CORRECTION_TOKENS,
  contradictsDeclaration,
  type CorrectionToken,
  correctionPhrase,
  correctionPlanFor,
  correctionRetryInstruction,
  NOT_PRESCRIBED_GROUPS,
} from "./meal_correction.ts";
import { PROTEIN_ANCHOR_PROMPT_LINE, proteinAnchorRetryInstruction } from "./protein_anchor.ts";
import { DIET_REGISTER_LEXICON, findDietRegisterWord } from "./nutrition_lexicon.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { MEAL_SYSTEM_PROMPT } from "./meal_generation.ts";
import type { CompositionVerdict } from "./meal_verdict.ts";
import type { Envelope } from "./meal_envelope.ts";
import { FOOD_GROUP_REFS } from "./tokens.ts";

const PER_KG: Envelope = {
  mode: "per_kg",
  energy: { low: 2000, high: 2300 },
  proteinFloorG: 160,
  proteinPerMealG: null,
  densityCeiling: 1.3,
};

function verdict(over: Partial<CompositionVerdict> = {}): CompositionVerdict {
  return {
    resolution: { resolved: 10, total: 10, unresolvedEnergyDense: false, unweighedEnergyDense: false },
    energy: "within",
    protein: "met",
    density: "within",
    sentinels: { missing: [], uncoverable: [] },
    ...over,
  };
}

const NO_DECLARATIONS = { foodPreferences: [] as string[] };

function plan(v: Partial<CompositionVerdict>, over: Record<string, unknown> = {}) {
  return correctionPlanFor({
    verdict: verdict(v),
    envelope: PER_KG,
    declarations: NO_DECLARATIONS,
    coverageFloorHit: false,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// LE REGISTRE DU RÉGIME — la ceinture qui manquait
// ---------------------------------------------------------------------------

Deno.test("AUCUNE constante de PILOTAGE ne parle la langue du régime", () => {
  // Le test tourne sur les TABLES, pas sur une liste tenue à la main: un jeton
  // ajouté demain y entre automatiquement, et c'est toute la différence entre
  // une garde et une bonne intention.
  const proseConstants: Array<[string, string]> = [
    ...Object.entries(CORRECTION_PHRASES).map(([k, v]) => [`jeton ${k}`, v] as [string, string]),
    ["consigne ancre protéique", PROTEIN_ANCHOR_PROMPT_LINE],
    ["relance ancre protéique", proteinAnchorRetryInstruction(["A dish"])],
  ];
  for (const [name, text] of proseConstants) {
    const word = findDietRegisterWord(text);
    assertEquals(word, null, `${name} contient « ${word} »`);
  }
});

Deno.test("le prompt système ne parle du régime QUE pour l'interdire", () => {
  // ── POURQUOI CE TEST N'EST PAS LE PRÉCÉDENT ────────────────────────────
  // `MEAL_SYSTEM_PROMPT` contient « No calories. No macro grams. » — c'est la
  // section qui INTERDIT le registre, et le mot doit y être. Le premier
  // passage de ce test l'a fait échouer, et le réflexe (retirer « calorie » du
  // lexique) aurait désarmé la garde pour arranger une constante.
  //
  // C'est la cicatrice « références legacy qui doivent survivre » du dépôt: une
  // liste qui NOMME l'interdit contient forcément l'interdit. On vérifie donc
  // que les occurrences sont CONFINÉES à la section de prohibition, ce qui est
  // la propriété qu'on voulait vraiment.
  const PROHIBITION = "== NEVER PUT A NUMBER ON NUTRITION ==";
  const at = MEAL_SYSTEM_PROMPT.indexOf(PROHIBITION);
  assert(at >= 0, "la section de prohibition a disparu du prompt système");
  const nextSection = MEAL_SYSTEM_PROMPT.indexOf("\n== ", at + PROHIBITION.length);
  const outside = MEAL_SYSTEM_PROMPT.slice(0, at) +
    MEAL_SYSTEM_PROMPT.slice(nextSection < 0 ? MEAL_SYSTEM_PROMPT.length : nextSection);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — UNE DENSITÉ N'EST PAS UN REGISTRE DE RÉGIME
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le schéma JSON demande au modèle `"density_check": <kcal per 100 g you
  // computed for this dish, cooked>`. C'est une propriété du PLAT, pas un
  // nombre posé sur la personne — et c'est très exactement la règle de forme
  // que `METHODE-GENERATION-DE-PLAN-SOLO.md` § 6 bis énonce: **tout `kcal` du
  // brief doit être suivi de `per 100 g`**.
  //
  // ⛔ ON MASQUE LA FORME AUTORISÉE, ON NE RETIRE PAS LE MOT DU LEXIQUE. Le
  // réflexe inverse — sortir « calorie » de `findDietRegisterWord` — désarmerait
  // la garde pour toute la prose du produit afin d'arranger une constante.
  // C'est la cicatrice « références legacy qui doivent survivre ».
  const outsideSansDensite = outside.replace(/kcal\s*per\s*100\s*g/gi, "«densité»");
  const word = findDietRegisterWord(outsideSansDensite);
  assertEquals(word, null, `« ${word} » hors de la section qui l'interdit`);
  // ⛔ ET LA GARDE MORD ENCORE SUR UN KCAL NU: sans cette ligne, le masque
  // ci-dessus pourrait s'élargir un jour jusqu'à tout laisser passer.
  assertEquals(
    findDietRegisterWord(outsideSansDensite + " aim for 1800 kcal a day"),
    "kcal",
    "le masque a désarmé la garde",
  );
});

Deno.test("le test lexical MORD — la constante mutée le prouve", () => {
  // Un test qui ne peut pas échouer ne teste rien. On mute une constante avec
  // la formule exacte que la revue TCA a classée défaut fatal.
  assertEquals(findDietRegisterWord("keep portions in a modest, livable deficit"), "deficit");
  assertEquals(findDietRegisterWord("on vise une sèche progressive"), "sèche");
  assertEquals(findDietRegisterWord("aim for a small calorie surplus"), "calorie surplus");
  // « surplus » NU reste innocent: c'est le surplus de cuisson, et le prompt
  // système en parle depuis des mois (« the surplus goes in the FREEZER »).
  assertEquals(findDietRegisterWord("put the surplus in the freezer"), null);
  // …et il ne mord pas sur la prose légitime du produit.
  assertEquals(findDietRegisterWord("make portions more generous, especially starch"), null);
  assertEquals(findDietRegisterWord("400 g de cuisses de poulet"), null);
});

Deno.test("le filtre NUMÉRIQUE ne voit pas le registre — d'où la seconde ceinture", () => {
  // La démonstration de la raison d'être de `DIET_REGISTER_LEXICON`: la phrase
  // fatale traverse le filtre existant sans une alerte.
  assertEquals(findNumericTarget("a modest, livable deficit"), null);
  assert(findDietRegisterWord("a modest, livable deficit") !== null);
});

Deno.test("aucun jeton ne contient de chiffre", () => {
  for (const [token, phrase] of Object.entries(CORRECTION_PHRASES)) {
    assertEquals(phrase.match(/\d/), null, `${token}: ${phrase}`);
    assertEquals(findNumericTarget(phrase), null, token);
  }
  assert(DIET_REGISTER_LEXICON.length > 10);
});

// ---------------------------------------------------------------------------
// LE MAPPING
// ---------------------------------------------------------------------------

Deno.test("chaque verdict hors bande donne son jeton", () => {
  assertEquals(plan({ energy: "above" }).tokens, ["lower_energy"]);
  assertEquals(plan({ energy: "below" }).tokens, ["raise_energy"]);
  assertEquals(plan({ protein: "under" }).tokens, ["raise_protein_component"]);
  assertEquals(plan({ density: "above" }).tokens, ["lower_density"]);
});

Deno.test("un verdict DANS la bande ne déclenche rien", () => {
  const p = plan({});
  assertEquals(p.tokens, []);
  assertEquals(p.phrases, []);
  assertEquals(correctionRetryInstruction(p), null);
});

Deno.test("`not_computable` ne déclenche RIEN — on ne corrige pas sur du bruit", () => {
  // La règle la plus importante du chantier: corriger un plan dont on n'a pas
  // su lire les ingrédients, c'est exactement ce que la gate des 80 % existe
  // pour empêcher.
  const p = plan({
    energy: "not_computable",
    protein: "not_computable",
    density: "not_computable",
    resolution: { resolved: 4, total: 10, unresolvedEnergyDense: true, unweighedEnergyDense: false },
  });
  assertEquals(p.tokens, []);
});

Deno.test("l'ORDRE suit la hiérarchie: protéine, énergie, densité", () => {
  // Corriger la densité avant la protéine optimiserait la grandeur la moins
  // fondée en premier.
  const p = plan({ protein: "under", energy: "above", density: "above" });
  assertEquals(p.tokens, ["raise_protein_component", "lower_energy", "lower_density"]);
});

Deno.test("sous le plancher de couverture, les sentinelles passent DEVANT", () => {
  // Leur direction est protectrice, et à cette énergie-là la couverture micro
  // devient mathématiquement improbable.
  const p = plan(
    { protein: "under", sentinels: { missing: ["fatty_fish"], uncoverable: [] } },
    { coverageFloorHit: true },
  );
  assertEquals(p.tokens[0], "place_missing_sentinel");
  const normal = plan({ protein: "under", sentinels: { missing: ["fatty_fish"], uncoverable: [] } });
  assertEquals(normal.tokens[0], "raise_protein_component");
});

Deno.test("un seul groupe sentinelle est servi, pas six", () => {
  const p = plan({
    sentinels: { missing: ["fatty_fish", "legumes", "leafy_greens"], uncoverable: [] },
  });
  assertEquals(p.tokens.filter((t) => t === "place_missing_sentinel").length, 1);
  assertEquals(p.phrases.length, 1);
});

// ---------------------------------------------------------------------------
// CE QUE LE PRODUIT NE PRESCRIT PAS
// ---------------------------------------------------------------------------

Deno.test("le jeton ne recommande JAMAIS de la friture pour combler un trou", () => {
  // FF-039 dérive les porteurs de sentinelle du référentiel, sans liste écrite
  // à la main — et `fried_food` y entre, ses deux entrées étant sources de fer
  // et de zinc. Un groupe peut être un porteur RÉEL sans être une PRESCRIPTION.
  const p = plan({ sentinels: { missing: ["fried_food"], uncoverable: [] } });
  assertEquals(p.tokens, []);
  assert(p.suppressed.some((s) => s.includes("not prescribable")));
  assertEquals(correctionPhrase("place_missing_sentinel", "fried_food"), null);
  assertEquals(correctionPhrase("place_missing_sentinel", "alcohol"), null);
  assertEquals(correctionPhrase("place_missing_sentinel", "sugar_sweets"), null);
});

Deno.test("la liste des non-prescrits est typée sur les trente groupes", () => {
  for (const g of NOT_PRESCRIBED_GROUPS) {
    assert((FOOD_GROUP_REFS as readonly string[]).includes(g), `${g} inconnu`);
  }
});

Deno.test("le libellé de groupe nomme un ALIMENT, jamais un nutriment", () => {
  const phrase = correctionPhrase("place_missing_sentinel", "fatty_fish")!;
  assert(phrase.includes("oily fish"));
  // Un nom de nutriment dans une consigne ressort dans un `why` visible, et
  // l'élève y lit une carence.
  for (const word of ["omega", "iron", "calcium", "zinc", "b12", "folate", "vitamin"]) {
    assert(!phrase.toLowerCase().includes(word), `« ${word} » dans « ${phrase} »`);
  }
});

// ---------------------------------------------------------------------------
// LA PRÉSÉANCE ADHÉRENCE
// ---------------------------------------------------------------------------

Deno.test("un jeton qui contredit une déclaration n'est PAS servi, et c'est compté", () => {
  const p = correctionPlanFor({
    verdict: verdict({ sentinels: { missing: ["fatty_fish"], uncoverable: [] } }),
    envelope: PER_KG,
    declarations: { foodPreferences: ["I don't eat fish, never have"] },
    coverageFloorHit: false,
  });
  assertEquals(p.tokens, []);
  assert(p.suppressed.some((s) => s.includes("contradicts a declaration")));
});

Deno.test("la préséance adhérence mord aussi en FRANÇAIS", () => {
  assert(contradictsDeclaration("place_missing_sentinel", "legumes", {
    foodPreferences: ["je ne mange pas de légumineuses, ça me ballonne"],
  }));
});

Deno.test("une préférence TIÈDE ne fait pas taire une correction", () => {
  // Le lexique repère une DÉCLARATION D'EXCLUSION, pas un goût. « je préfère le
  // poulet » n'a pas à bloquer une correction.
  assert(!contradictsDeclaration("place_missing_sentinel", "fatty_fish", {
    foodPreferences: ["I prefer chicken to fish"],
  }));
});

Deno.test("les jetons qui ne prescrivent AUCUN aliment ne peuvent rien contredire", () => {
  // « moins de matière grasse ajoutée » ou « des légumes qui portent le
  // volume » sont des façons de composer, pas des aliments.
  for (const token of CORRECTION_TOKENS) {
    if (token === "place_missing_sentinel") continue;
    assert(!contradictsDeclaration(token as CorrectionToken, null, {
      foodPreferences: ["no fish", "pas de légumineuses", "vegetarian"],
    }), token);
  }
});

// ---------------------------------------------------------------------------
// `off` RETIRE L'ARBITRE, JAMAIS L'INSTRUMENT
// ---------------------------------------------------------------------------

Deno.test("un axe éteint par la doctrine ne CORRIGE plus, et le verdict existe toujours", () => {
  const v = verdict({ energy: "above", protein: "under" });
  const p = correctionPlanFor({
    verdict: v,
    envelope: PER_KG,
    declarations: NO_DECLARATIONS,
    coverageFloorHit: false,
    offAxes: ["energy"],
  });
  assertEquals(p.tokens, ["raise_protein_component"]);
  assert(p.suppressed.some((s) => s.includes("axis 'energy' is off")));
  // Mesure ≠ pilotage: le verdict énergie n'a pas bougé, il est toujours écrit.
  assertEquals(v.energy, "above");
});

// ---------------------------------------------------------------------------
// LA RELANCE
// ---------------------------------------------------------------------------

Deno.test("la relance dit ce qu'il faut FAIRE, jamais ce qui cloche", () => {
  const p = plan({ energy: "above", protein: "under" });
  const instruction = correctionRetryInstruction(p)!;
  assert(instruction.includes("full protein food"));
  assert(instruction.includes("vegetables carry the volume"));
  // Elle ne nomme pas le verdict: « tu es au-dessus » est un chiffre déguisé.
  assert(!instruction.toLowerCase().includes("above"));
  assertEquals(findDietRegisterWord(instruction), null);
  assertEquals(findNumericTarget(instruction), null);
  assertEquals(instruction.match(/\d/), null);
});

// ---------------------------------------------------------------------------
// FF-042 R6 — LA BOUCLE INFINIE QUE LA SÉPARATION ÉCARTE
// ---------------------------------------------------------------------------

Deno.test("un trou INCOUVRABLE ne déclenche AUCUN jeton", () => {
  // Le test qui garde la boucle. `sentinels.uncoverable` n'est PAS lu par la
  // correction — et il ne doit jamais l'être: un jeton servi dessus ferait
  // reprendre le plan d'un élève végan à chaque génération, pour un trou
  // qu'aucune assiette ne comble.
  const p = correctionPlanFor({
    verdict: verdict({ sentinels: { missing: [], uncoverable: ["b12_source"] } }),
    envelope: PER_KG,
    declarations: NO_DECLARATIONS,
    coverageFloorHit: false,
  });
  assertEquals(p.tokens, []);
  assertEquals(p.phrases, []);
  assertEquals(correctionRetryInstruction(p), null);
});

Deno.test("le plancher de couverture ne réveille pas le trou incouvrable", () => {
  // Sous le plancher, les sentinelles passent DEVANT — c'est exactement le
  // moment où une B12 incouvrable ferait boucler le plus fort.
  const p = correctionPlanFor({
    verdict: verdict({
      protein: "under",
      sentinels: { missing: [], uncoverable: ["b12_source"] },
    }),
    envelope: PER_KG,
    declarations: NO_DECLARATIONS,
    coverageFloorHit: true,
  });
  assertEquals(p.tokens, ["raise_protein_component"]);
});

Deno.test("aucune phrase servie au modèle ne parle de supplémentation", () => {
  // FF-042 R6: on nomme, on n'ordonne pas. Rien de ce que le produit écrit ne
  // doit ressembler à un conseil médical.
  for (const phrase of Object.values(CORRECTION_PHRASES)) {
    const low = phrase.toLowerCase();
    for (const word of ["supplement", "complement", "b12", "vitamin", "tablet", "pill"]) {
      assert(!low.includes(word), `« ${word} » dans « ${phrase} »`);
    }
  }
});
