/**
 * FF-056 — LE DÉCLENCHEUR: sa partie pure, et ses littéraux d'ouverture.
 *
 * Le pas complet a besoin d'une base; ce qui se teste sans elle est ce qui
 * décide DE COMBIEN DE TEMPS on se tait (R9, R10) et CE QU'ON DIT (R2, R3) —
 * c'est-à-dire les deux propriétés que la fiche défend le plus.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  DIVERGENCE_COOLDOWN_CYCLES,
  DIVERGENCE_COOLDOWN_CYCLES_AFTER_DECLINE,
  DIVERGENCE_COOLDOWN_MIN_DAYS,
  DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE,
  DIVERGENCE_DAYS_AFTER_PLAN_END,
  DIVERGENCE_HOUR_LOCAL,
  DIVERGENCE_OPENING_QUESTIONS,
  DIVERGENCE_WINDOW_END_LOCAL,
  evaluateCooldown,
  openingQuestionFor,
} from "./weight_divergence_engine.ts";
import {
  FORBIDDEN_BLAME_TERMS,
  FORBIDDEN_ENERGY_TERMS,
  FORBIDDEN_SUSPICION_PHRASES,
  FORBIDDEN_WEIGH_IN_LINK_PHRASES,
} from "../../sophia-brain/skills/weight_divergence/contract.ts";
import { findForbiddenMatches } from "./forbidden_matcher.ts";

// ---------------------------------------------------------------------------
// LES SEUILS
// ---------------------------------------------------------------------------

Deno.test("FF-056 · les constantes du déclencheur sont celles du rapport", () => {
  assertEquals(DIVERGENCE_HOUR_LOCAL, 19);
  assertEquals(DIVERGENCE_WINDOW_END_LOCAL, 20);
  assertEquals(DIVERGENCE_DAYS_AFTER_PLAN_END, 2);
  assertEquals(DIVERGENCE_COOLDOWN_CYCLES, 1);
  assertEquals(DIVERGENCE_COOLDOWN_CYCLES_AFTER_DECLINE, 2);
  assertEquals(DIVERGENCE_COOLDOWN_MIN_DAYS, 42);
  assertEquals(DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE, 84);
});

Deno.test("FF-056 · la fenêtre du soir est HORS des heures calmes 21h-8h", () => {
  // §3: « jamais dans les heures calmes (21h-8h) ». Ce n'est pas une consigne,
  // c'est une propriété de la fenêtre héritée du job.
  assertEquals(DIVERGENCE_HOUR_LOCAL >= 8, true);
  assertEquals(DIVERGENCE_WINDOW_END_LOCAL <= 21, true);
});

// ---------------------------------------------------------------------------
// LE COOLDOWN
// ---------------------------------------------------------------------------

Deno.test("FF-056 · aucun épisode passé ⇒ le cooldown est expiré", () => {
  const verdict = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: null,
    lastDeclinedOn: null,
    planCycleDays: 7,
  });
  assertEquals(verdict.expired, true);
  assertEquals(verdict.elapsedDays, null);
});

Deno.test("FF-056 · un cycle de plan NE SUFFIT PAS — le plancher de six semaines tient", () => {
  // C'est l'arbitrage du module: R9 dit « au moins un cycle de plan », §3 dit
  // « mensuel, il devient une convocation ». Les deux ne peuvent pas être vrais
  // ensemble; on applique le plus long.
  const afterOneCycle = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: "2026-08-04", // 7 jours = un cycle complet
    lastDeclinedOn: null,
    planCycleDays: 7,
  });
  assertEquals(afterOneCycle.expired, false);
  assertEquals(afterOneCycle.requiredDays, DIVERGENCE_COOLDOWN_MIN_DAYS);

  const afterSixWeeks = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: "2026-06-30", // 42 jours
    lastDeclinedOn: null,
    planCycleDays: 7,
  });
  assertEquals(afterSixWeeks.expired, true);
  assertEquals(afterSixWeeks.elapsedDays, 42);
});

Deno.test("FF-056 · R10 — un REFUS double le cooldown, et durablement", () => {
  const justBefore = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: "2026-05-20",
    lastDeclinedOn: "2026-05-20", // 83 jours
    planCycleDays: 7,
  });
  assertEquals(justBefore.expired, false);
  assertEquals(justBefore.doubledByDecline, true);
  assertEquals(justBefore.requiredDays, DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE);

  const after = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: "2026-05-19",
    lastDeclinedOn: "2026-05-19", // 84 jours
    planCycleDays: 7,
  });
  assertEquals(after.expired, true);
});

Deno.test("FF-056 · un épisode POSTÉRIEUR n'efface pas le doublement d'un refus", () => {
  // Le mode de défaillance: une question posée trop tôt (puis expirée) ferait
  // repartir le compte depuis elle, et le « non » cesserait d'être respecté au
  // deuxième tour de manège.
  const verdict = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    // Un épisode expiré il y a 50 jours — au-delà du cooldown NORMAL…
    lastEpisodeOn: "2026-06-22",
    // …mais le refus, lui, date de 60 jours: le doublement court encore.
    lastDeclinedOn: "2026-06-12",
    planCycleDays: 7,
  });
  assertEquals(verdict.expired, false);
  assertEquals(verdict.doubledByDecline, true);
  assertEquals(verdict.elapsedDays, 60);
});

Deno.test("FF-056 · un cycle de plan LONG allonge le cooldown au-delà du plancher", () => {
  // Un plan de 30 jours: deux cycles après un refus valent 60 jours, moins que
  // le plancher de 84 — c'est donc le plancher qui gagne. Un plan de 60 jours
  // porterait le cooldown à 120.
  const verdict = evaluateCooldown({
    todayLocalDate: "2026-08-11",
    lastEpisodeOn: "2026-06-11",
    lastDeclinedOn: null,
    planCycleDays: 60,
  });
  assertEquals(verdict.requiredDays, 60);
  assertEquals(verdict.expired, true);
});

// ---------------------------------------------------------------------------
// LA QUESTION D'OUVERTURE — R2, R3, R11, §10
// ---------------------------------------------------------------------------

Deno.test("FF-056 · R2 — le SUJET de la question est le plan, pas la personne", () => {
  // « Si tu manges CE QUI EST PRÉVU, normalement ÇA devrait descendre »
  // énonce ce que le plan attend. La phrase ne dit rien de ce que la personne
  // a fait. Le test lit la propriété structurelle: la phrase commence par la
  // condition sur le plan.
  assertEquals(
    DIVERGENCE_OPENING_QUESTIONS.down.fr.startsWith("Si tu manges ce qui est prévu"),
    true,
  );
  assertEquals(
    DIVERGENCE_OPENING_QUESTIONS.down.en.startsWith("If you're eating what's planned"),
    true,
  );
});

Deno.test("FF-056 · R3 — la question est VRAIMENT ouverte, dans les quatre textes", () => {
  for (const direction of ["down", "up"] as const) {
    for (const langue of ["fr", "en"] as const) {
      const text = DIVERGENCE_OPENING_QUESTIONS[direction][langue];
      // Une seule question, et c'est la question ouverte.
      assertEquals(text.split("?").length - 1, 1, `${direction}/${langue}`);
      const folded = text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      // Aucune hypothèse: ni grignotage, ni soir, ni sport, ni traitement.
      for (
        const hypothesis of [
          "grignot",
          "snack",
          "le soir",
          "at night",
          "sport",
          "traitement",
          "medication",
          "stress",
        ]
      ) {
        assertEquals(
          folded.includes(hypothesis),
          false,
          `« ${hypothesis} » dans ${direction}/${langue}: ${text}`,
        );
      }
    }
  }
});

Deno.test("FF-056 · §11 — la direction UP ne présuppose pas la perte", () => {
  assertEquals(DIVERGENCE_OPENING_QUESTIONS.up.fr.includes("monter"), true);
  assertEquals(DIVERGENCE_OPENING_QUESTIONS.up.fr.includes("descendre"), false);
  assertEquals(DIVERGENCE_OPENING_QUESTIONS.up.en.includes("going up"), true);
  assertEquals(DIVERGENCE_OPENING_QUESTIONS.up.en.includes("going down"), false);
});

Deno.test("FF-056 · les quatre textes passent les quatre listes d'interdits", () => {
  const terms = [
    ...FORBIDDEN_ENERGY_TERMS,
    ...FORBIDDEN_SUSPICION_PHRASES,
    ...FORBIDDEN_BLAME_TERMS,
    ...FORBIDDEN_WEIGH_IN_LINK_PHRASES,
  ].map((token) => ({ ruleId: "opening", token }));
  for (const direction of ["down", "up"] as const) {
    for (const langue of ["fr", "en"] as const) {
      const text = DIVERGENCE_OPENING_QUESTIONS[direction][langue];
      const scannable = text.replace(/['’`]/g, " ");
      const matches = findForbiddenMatches(scannable, terms, {
        allowNegatedMentions: false,
      });
      assertEquals(
        matches.map((m) => m.token),
        [],
        `${direction}/${langue}: ${text}`,
      );
      // Et aucun chiffre.
      assertEquals(/\d/.test(text), false, `${direction}/${langue}`);
    }
  }
});

Deno.test("FF-056 · la langue de la question suit la locale, jamais un repli", () => {
  assertEquals(openingQuestionFor("down", "fr-FR"), DIVERGENCE_OPENING_QUESTIONS.down.fr);
  assertEquals(openingQuestionFor("down", "en-US"), DIVERGENCE_OPENING_QUESTIONS.down.en);
  assertEquals(openingQuestionFor("up", "fr-CA"), DIVERGENCE_OPENING_QUESTIONS.up.fr);
  // Locale inconnue ⇒ anglais. Jamais du français chez quelqu'un qui ne le lit
  // pas: c'est la cicatrice T-19, dans l'autre sens.
  assertEquals(openingQuestionFor("up", "de-DE"), DIVERGENCE_OPENING_QUESTIONS.up.en);
  assertEquals(openingQuestionFor("up", null), DIVERGENCE_OPENING_QUESTIONS.up.en);
});
