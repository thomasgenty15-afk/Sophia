/**
 * FF-011 — le soutien groundé, dans les DEUX directions et les DEUX langues.
 *
 * La cicatrice de ce dépôt est écrite dans `VERDICT_PATTERNS` et elle est
 * précise: `/\bbien\s+jou[ée]\b/` ne mordait PAS sur « Bien joué, » — en JS
 * `\b` se calcule sur l'ASCII, et « é » n'en est pas. Le motif existait, était
 * testé nulle part, et laissait passer la formule la plus courante. Chaque
 * garde ici est donc jouée en français ET en anglais, dans les deux sens.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  applyGroundedSupportBelt,
  detectDiscouragementTurn,
  groundedSupportBlock,
  supportGround,
} from "./grounded_support.ts";
import { type DayFacts, EMPTY_DAY_FACTS } from "./daily_recap.ts";
import type { WeekReviewReading } from "./week_review.ts";

function facts(over: Partial<DayFacts> = {}): DayFacts {
  return { ...EMPTY_DAY_FACTS, ...over };
}

function week(over: Partial<WeekReviewReading["coverage"]> = {}): WeekReviewReading {
  return {
    version: "week_review_v1",
    evidence: null,
    window: { start: "2026-07-27", end: "2026-08-02", days: 7 },
    coverage: {
      daysInWindow: 7,
      observedDays: 5,
      loggedDays: 5,
      totalFacts: 12,
      sufficient: true,
      ...over,
    },
    portions: { total: 0, small: 0, moderate: 0, large: 0, unclear: 0, decidable: 0 },
    livability: { band: "unknown", taps: 0, good: 0, mixed: 0, hard: 0, dominantAxis: null },
    alignment: [],
    unevaluatedRules: 0,
    branch: "no_method",
    question: null,
    goal: null,
  } as unknown as WeekReviewReading;
}

// ---------------------------------------------------------------------------
// LE TOUR DE DÉCOURAGEMENT
// ---------------------------------------------------------------------------

Deno.test("le découragement se reconnaît en FRANÇAIS", () => {
  for (
    const message of [
      "cette semaine a été horrible, j'ai rien tenu",
      "ma journée a été nulle",
      "je suis découragée",
      "j'en ai marre",
      "je n'y arrive pas",
      "ça sert à rien",
      "je me sens coupable",
    ]
  ) {
    assert(detectDiscouragementTurn(message), `devrait mordre: ${message}`);
  }
});

Deno.test("le découragement se reconnaît en ANGLAIS", () => {
  for (
    const message of [
      "this week has been horrible, I didn't stick to anything",
      "my day was awful",
      "I'm struggling",
      "I gave up",
      "I feel like a failure",
      "what's the point",
      "nothing is working",
    ]
  ) {
    assert(detectDiscouragementTurn(message), `devrait mordre: ${message}`);
  }
});

Deno.test("UN TOUR ORDINAIRE N'ARME PAS LA CEINTURE — FR et EN", () => {
  // Trop large, la ceinture mordrait partout et le repli deviendrait le cas
  // nominal en silence. C'est la contre-épreuve qui compte le plus ici.
  for (
    const message of [
      "on mange quoi ce soir ?",
      "j'ai mangé du poulet ce midi",
      "c'était bon, ce plat",
      "je suis à 78 kg",
      "what should I have for dinner?",
      "I had chicken for lunch",
      "that recipe was hard to follow",
    ]
  ) {
    assertEquals(
      detectDiscouragementTurn(message),
      null,
      `ne devrait PAS mordre: ${message}`,
    );
  }
});

// ---------------------------------------------------------------------------
// LA MATIÈRE
// ---------------------------------------------------------------------------

Deno.test("supportGround: le jour d'abord, puis la semaine, puis rien", () => {
  assertEquals(supportGround(facts({ tickedCount: 2 }), null), "day");
  assertEquals(supportGround(facts({ photoCount: 1 }), null), "day");
  assertEquals(supportGround(facts({ offPlanCount: 1 }), null), "day");
  assertEquals(supportGround(facts(), week()), "week");
  assertEquals(supportGround(facts(), week({ totalFacts: 0 })), "none");
  assertEquals(supportGround(null, null), "none");
});

Deno.test("R5 — SANS MATIÈRE, le bloc exige court et sobre", () => {
  const block = groundedSupportBlock(null, "none");
  assertStringIncludes(block, "YOU HAVE NO MATERIAL");
  assertStringIncludes(block, "SHORT AND PLAIN");
  assertStringIncludes(block, "Do not compensate with warmth");
});

Deno.test("AVEC matière, le bloc donne les trois comptes et interdit de les sommer", () => {
  const block = groundedSupportBlock(
    facts({ tickedCount: 2, plannedCount: 4, photoCount: 1, offPlanCount: 1 }),
    "day",
  );
  assertStringIncludes(block, "ticked off the plan today: 2");
  assertStringIncludes(block, "photos sent today: 1");
  assertStringIncludes(block, "off the plan today: 1");
  assertStringIncludes(block, "Never add them up");
});

Deno.test("R6 — aucun verdict sur la journée, même positif, même vrai", () => {
  assertStringIncludes(
    groundedSupportBlock(facts({ tickedCount: 3 }), "day"),
    "No verdict on the day or the week, even a positive one",
  );
});

Deno.test("le bloc interdit la sollicitation déguisée en soutien", () => {
  assertStringIncludes(
    groundedSupportBlock(null, "none"),
    "is NOT support, it is collection",
  );
});

// ---------------------------------------------------------------------------
// LA CEINTURE — les motifs sont PARTAGÉS, jamais recopiés
// ---------------------------------------------------------------------------

function belt(text: string, over: { facts?: DayFacts | null; week?: WeekReviewReading | null; locale?: string } = {}) {
  return applyGroundedSupportBelt({
    text,
    facts: over.facts === undefined ? facts({ tickedCount: 2 }) : over.facts,
    week: over.week ?? null,
    contentLocale: over.locale ?? "en-GB",
  });
}

Deno.test("« well done » est réécrit, et le motif est journalisé", () => {
  const out = belt("You ticked 2 dishes today. Well done!");
  assertEquals(out.reasons, ["qualifies_the_day"]);
  assert(!/well done/i.test(out.text));
  // La phrase GROUNDÉE survit: on retire la phrase fautive, pas le tour.
  assertStringIncludes(out.text, "2 dishes");
});

Deno.test("⚠️ « Bien joué, » AVEC LA VIRGULE mord — la frontière de mot ne se calcule pas sur « é »", () => {
  const out = belt("Tu as coché 2 plats. Bien joué, continue !", { locale: "fr-FR" });
  assertEquals(out.reasons, ["qualifies_the_day"]);
  assert(!/bien jou/i.test(out.text));
});

Deno.test("les formules françaises interdites mordent toutes", () => {
  for (const phrase of ["Bien joué.", "Continue comme ça.", "Tu gères.", "Félicitations !"]) {
    const out = belt(`Tu as coché 2 plats. ${phrase}`, { locale: "fr-FR" });
    assertEquals(out.reasons, ["qualifies_the_day"], phrase);
  }
});

Deno.test("les formules anglaises interdites mordent toutes", () => {
  for (const phrase of ["Well done.", "Keep it up.", "You're doing great.", "Nice work."]) {
    const out = belt(`You ticked 2 dishes. ${phrase}`);
    assertEquals(out.reasons, ["qualifies_the_day"], phrase);
  }
});

Deno.test("R4 — un chiffre qui n'est PAS dans les faits est refusé", () => {
  // Les faits portent 2 coches; « 4 meals » n'existe nulle part.
  const out = belt("You logged 4 meals this week.");
  assertEquals(out.reasons, ["invented_number"]);
});

Deno.test("...ET SA CONDITION DE DÉSARMEMENT: un chiffre DONNÉ passe", () => {
  const out = belt("You ticked 2 dishes today.");
  assertEquals(out.reasons, []);
  assertEquals(out.text, "You ticked 2 dishes today.");
});

Deno.test("les nombres du BILAN HEBDO sont autorisés — ils sont dans le prompt", () => {
  // Les refuser ferait replier une réponse parfaitement exacte, et la voix du
  // coach disparaîtrait sans qu'une seule erreur n'apparaisse nulle part.
  const out = belt("You logged 12 meals across 5 days that week.", {
    facts: facts(),
    week: week(),
  });
  assertEquals(out.reasons, []);
});

Deno.test("SANS faits chargés, AUCUN nombre de journée n'est justifiable", () => {
  // `null` n'est pas une journée vide: on ne justifie pas un chiffre avec des
  // faits qu'on n'a pas lus.
  const out = belt("You ticked 2 dishes today.", { facts: null });
  assertEquals(out.reasons, ["invented_number"]);
});

Deno.test("R8 — QUAND TOUT EST RETIRÉ, on RÉÉCRIT, on ne se tait pas", () => {
  const en = belt("Well done! Keep it up.");
  assertEquals(en.reasons, ["qualifies_the_day"]);
  assertStringIncludes(en.text, "back with a fact");

  const fr = belt("Bien joué ! Continue comme ça.", { locale: "fr-FR" });
  assertStringIncludes(fr.text, "appuyer sur un fait");
});

Deno.test("la condition de désarmement de la liste PARTAGÉE survit: un ALIMENT peut être qualifié", () => {
  // « a good source of protein » est de la nutrition, pas un bulletin. Élargir
  // les motifs pour attraper un faux négatif casserait le message du soir, qui
  // partage exactement cette liste.
  const out = belt("Lentils are a good source of protein.");
  assertEquals(out.reasons, []);
});

Deno.test("un texte propre traverse INTACT, à l'octet près", () => {
  const text = "You ticked 2 dishes today, and yesterday's tap said hunger was the hard part.";
  assertEquals(belt(text).text, text);
});

Deno.test("le vide traverse sans mordre", () => {
  assertEquals(belt("").reasons, []);
  assertEquals(belt("   ").reasons, []);
});
