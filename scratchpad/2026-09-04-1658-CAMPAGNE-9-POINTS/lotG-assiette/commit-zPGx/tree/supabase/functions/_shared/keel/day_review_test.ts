import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  DAY_REVIEW_STEPS,
  type DayReviewPending,
  openingStep,
  stepAfter,
} from "./day_review.ts";
import { buildShoppingStep } from "./evening_strip.ts";

/**
 * FF-061 — LA CHAÎNE DES TROIS ÉTAPES DU BILAN DU SOIR.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · l'ORDRE est le produit: courses, puis cuisson, puis repas. Le permuter
 *   ferait nommer des plats qu'une réponse aux courses est en train de rendre
 *   impossibles;
 * · on ne revient JAMAIS en arrière — une étape répondue ne se rouvre pas,
 *   même si son état redevenait `pending` (lecture en panne, tap concurrent);
 * · rien à demander ⇒ `null`, et c'est R10: un message du soir qui ne porte
 *   rien est une notification sans objet;
 * · l'étape ① porte les DEUX gardes de foyer et de plancher, et elle les porte
 *   dans l'ordre (T7: le plancher d'abord).
 */

const NOTHING: DayReviewPending = {
  shopping: false,
  cooking: false,
  meals: false,
};

// ---------------------------------------------------------------------------
// L'ORDRE
// ---------------------------------------------------------------------------

Deno.test("⛔ L'ORDRE DES TROIS ÉTAPES EST LE PRODUIT", () => {
  // Ce n'est pas une convention d'écriture: ① ÉTEINT ③. Répondre « pas encore »
  // aux courses invalide la cuisson que la vague sert, donc les plats qui en
  // descendent. Les poser dans l'autre sens ferait cocher un repas que la
  // réponse suivante efface.
  assertEquals([...DAY_REVIEW_STEPS], ["shopping", "cooking", "meals"]);
});

Deno.test("l'ouverture prend la PREMIÈRE étape qui a lieu d'être", () => {
  assertEquals(
    openingStep({ shopping: true, cooking: true, meals: true }),
    "shopping",
  );
  assertEquals(
    openingStep({ shopping: false, cooking: true, meals: true }),
    "cooking",
  );
  assertEquals(
    openingStep({ shopping: false, cooking: false, meals: true }),
    "meals",
  );
});

Deno.test("⛔ RIEN À DEMANDER ⇒ AUCUN BILAN (R10)", () => {
  // Un message du soir qui ne porte rien est une notification sans objet. Le
  // message reste exactement ce qu'il était avant cette fiche.
  assertEquals(openingStep(NOTHING), null);
});

// ---------------------------------------------------------------------------
// LA SUITE
// ---------------------------------------------------------------------------

Deno.test("la suite avance, elle ne repart jamais du début", () => {
  const all: DayReviewPending = { shopping: true, cooking: true, meals: true };
  assertEquals(stepAfter("shopping", all), "cooking");
  assertEquals(stepAfter("cooking", all), "meals");
  assertEquals(stepAfter("meals", all), null);
});

Deno.test("⛔ UNE ÉTAPE RÉPONDUE NE SE ROUVRE PAS, MÊME SI SON ÉTAT REDEVIENT `pending`", () => {
  // LE CAS QUI COMPTE. `pending.shopping` peut redevenir vrai entre deux taps —
  // une lecture en panne, un tap concurrent, un onglet resté ouvert. Repartir
  // du début reposerait la question des courses juste après y avoir répondu, et
  // la personne verrait sa propre réponse ignorée.
  const all: DayReviewPending = { shopping: true, cooking: true, meals: true };
  assertEquals(stepAfter("cooking", all), "meals");
  assertEquals(stepAfter("meals", all), null);
});

Deno.test("la suite SAUTE ce qui n'a pas lieu d'être", () => {
  assertEquals(
    stepAfter("shopping", { shopping: false, cooking: false, meals: true }),
    "meals",
  );
  assertEquals(
    stepAfter("shopping", { shopping: false, cooking: false, meals: false }),
    null,
  );
});

Deno.test("une étape inconnue n'invente pas de suite", () => {
  assertEquals(
    stepAfter("brunch" as never, { shopping: true, cooking: true, meals: true }),
    null,
  );
});

// ---------------------------------------------------------------------------
// ① — LES DEUX GARDES, DANS L'ORDRE
// ---------------------------------------------------------------------------

const SHOP = {
  mealId: "33333333-3333-4333-8333-333333333333",
  buyOn: "2026-03-10",
  language: "fr" as const,
};

Deno.test("⛔ SOUS PLANCHER, L'ÉTAPE DES COURSES N'EXISTE PAS (R12)", () => {
  assertEquals(
    buildShoppingStep({ ...SHOP, masterOnly: true, restrictionFlag: true }),
    null,
  );
  // Et le plancher passe AVANT le foyer: les deux ferment, mais l'ordre des
  // gardes est le contrat (T7).
  assertEquals(
    buildShoppingStep({ ...SHOP, masterOnly: false, restrictionFlag: true }),
    null,
  );
});

Deno.test("⛔ UN PROFIL RÉCLAMÉ NE RÉPOND PAS DES COURSES DU FOYER (R9)", () => {
  // La vague est un fait de FOYER. Un membre n'en sait rien, et sa réponse
  // serait du bruit — pire, elle écrirait un état que le maître n'a pas donné.
  assertEquals(
    buildShoppingStep({ ...SHOP, masterOnly: false, restrictionFlag: false }),
    null,
  );
});

Deno.test("l'étape des courses porte DEUX boutons, et aucune question", () => {
  for (const language of ["fr", "en"] as const) {
    const built = buildShoppingStep({
      ...SHOP,
      language,
      masterOnly: true,
      restrictionFlag: false,
    });
    assert(built, `${language}: l'étape doit exister`);
    if (!built) return;
    assertEquals(built.buttons.length, 2);
    // ⚠️ LA CEINTURE DE R2 EST DANS LE RENDERER, et elle est la raison pour
    // laquelle il rend `null` plutôt qu'un texte. Ici on vérifie le cas QUI
    // PASSE: sans lui, les trois épreuves au-dessus resteraient vertes sur un
    // renderer qui rendrait toujours `null`.
    assert(built.line.trim() !== "");
    assertEquals(
      /[?？]/.test(built.line),
      false,
      `${language}: on CONSTATE les courses du jour, on ne les interroge pas ` +
        `sur le futur (R17 de FF-058) — ${built.line}`,
    );
  }
});
