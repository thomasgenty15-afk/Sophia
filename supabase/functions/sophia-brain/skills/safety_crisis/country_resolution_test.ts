/**
 * QA agent-12 — the crisis lane must serve the numbers of the student's OWN
 * country.
 *
 * THE DEFECT THIS PINS
 * `safety_crisis/skill.ts` passed `userLocale` and nothing else, so the
 * country resolution added in W4.2 (`profiles.country`, migration
 * 20260727190000) never reached the reducer. Measured on the running product
 * on 2026-08-03, real LLM, local database:
 *
 *   a12.us  (country=US, locale=en-GB) -> "Call 999 or 112 ... call 116 123"
 *   a12.fr  (country=FR, locale=en-GB) -> "call 999 ou 112 ... 116 123"
 *
 * 999 does not connect in the United States and 116 123 is not answered in
 * France. It is the W3.3 incident ("an American is handed 3114") replayed
 * between a different pair of countries.
 *
 * WHY THE NO-COUNTRY CASES ARE HERE TOO
 * A belt that fires when there is nothing to fix is its own defect. The last
 * two tests used to assert that with no country the behaviour was EXACTLY what
 * it was before the W4.2 fix — locale, then the branch default.
 *
 * ⚠️ T-20, 2026-08-12 — CES DEUX-LÀ ONT ÉTÉ RETOURNÉS, EXPRÈS. « Inchangé »
 * était la bonne posture pour une ceinture qui ne devait rien introduire ; ce
 * n'était pas la bonne posture pour le comportement lui-même, parce que
 * l'« inchangé » en question servait des numéros français à 204 des 208 lignes
 * `country IS NULL` de la base locale. Pays absent ⇒ jeu `ZZ` (FF-020 §7/§8).
 * Le cas qui PASSE — un pays déclaré gouverne toujours ses numéros — est pinné
 * par les quatre premiers tests, et il n'a pas bougé.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { emptySafetySignal } from "./contract.ts";
import { reduceSafetyCrisis } from "./reducer.ts";

function numbersFor(args: {
  userCountry?: string | null;
  userLocale?: string | null;
}) {
  const reduced = reduceSafetyCrisis({
    previousState: {},
    sourceRiskBand: "critical",
    signals: emptySafetySignal({
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    }),
    ...args,
  });
  const resources = reduced.visibleTask.conversation_context.safety_resources;
  return {
    emergency: resources.emergency_numbers,
    suicide: resources.suicide_prevention_number,
  };
}

Deno.test("crisis numbers follow profiles.country, not the locale (US student reading in en-GB)", () => {
  assertEquals(numbersFor({ userCountry: "US", userLocale: "en-GB" }), {
    emergency: "911",
    suicide: "988",
  });
});

Deno.test("crisis numbers follow profiles.country, not the locale (FR student reading in en-GB)", () => {
  // L1 — LA CONJONCTION A CHANGÉ, PAS LES NUMÉROS. Cette ligne attendait
  // « 15 ou 112 » pour un lecteur `en-GB`, ce que l'en-tête de CE fichier cite
  // lui-même comme un défaut observé (« call 999 ou 112 », a12.fr, run réel du
  // 2026-08-03). Le pays gouverne toujours les numéros — c'est l'invariant que
  // la ceinture garde ; la langue gouverne le mot entre eux.
  assertEquals(numbersFor({ userCountry: "FR", userLocale: "en-GB" }), {
    emergency: "15 or 112",
    suicide: "3114",
  });
});

Deno.test("crisis numbers follow profiles.country, not the locale (GB student reading in fr-FR)", () => {
  // The mirror case, and the one that proves the precedence rather than a
  // coincidence: before the fix this student was served 3114.
  assertEquals(numbersFor({ userCountry: "GB", userLocale: "fr-FR" }), {
    emergency: "999 ou 112",
    suicide: "116 123",
  });
});

Deno.test("an unseeded country lands on the international set, never a neighbour's number", () => {
  const served = numbersFor({ userCountry: "DE", userLocale: "en-GB" });
  assertEquals(served.suicide, "https://findahelpline.com");
  assertEquals(served.emergency, "112");
});

Deno.test("T-20 — pays absent: le jeu international, plus jamais la locale", () => {
  // ⚠️ CE TEST ATTENDAIT L'INVERSE JUSQU'AU 2026-08-12 (« la locale décide
  // toujours du PAYS, 999/116 123 »). Le retournement EST le lot T-20:
  // `profiles.locale` est `not null default 'fr-FR'` et `JoinPage` a écrit
  // `en-US` en dur pour toute une population — dans les deux cas, la locale
  // nomme une langue, jamais un lieu de vie. FF-020 §7: « pays absent du
  // profil ⇒ jeu ZZ, warn, fallbackUsed: true ».
  //
  // La CONJONCTION, elle, suit toujours la langue: « or » pour un lecteur
  // anglais. Les deux axes restent orthogonaux — c'est l'invariant L1.
  assertEquals(numbersFor({ userCountry: null, userLocale: "en-GB" }), {
    emergency: "112",
    suicide: "https://findahelpline.com",
  });
  // Le cas des 204 lignes locales `country IS NULL, locale like 'fr%'`: le
  // défaut de colonne ne fabrique plus le 3114.
  assertEquals(numbersFor({ userCountry: null, userLocale: "fr-FR" }), {
    emergency: "112",
    suicide: "https://findahelpline.com",
  });
});

Deno.test("L1 — la conjonction suit la LANGUE, les numéros suivent le PAYS", () => {
  // Les deux axes sont orthogonaux, et c'est tout l'intérêt de les tester
  // ensemble: un Britannique lisant en français garde 999, un Français lisant
  // en anglais garde le 15. Seul le mot au milieu bouge.
  assertEquals(numbersFor({ userCountry: "GB", userLocale: "fr-FR" }).emergency, "999 ou 112");
  assertEquals(numbersFor({ userCountry: "GB", userLocale: "en-GB" }).emergency, "999 or 112");
  assertEquals(numbersFor({ userCountry: "FR", userLocale: "fr-FR" }).emergency, "15 ou 112");
  assertEquals(numbersFor({ userCountry: "FR", userLocale: "en-US" }).emergency, "15 or 112");
  // Condition de désarmement: le jour où le repli déterministe et la prose
  // nominale ne partagent plus la même langue — c'est-à-dire jamais, tant que
  // `run.ts` reste le point unique de résolution (R3).
});

Deno.test("T-20 — ni pays ni locale: le jeu international, jamais le défaut de branche", () => {
  // Attendait « 15 ou 112 · 3114 » jusqu'au 2026-08-12: le défaut DÉCLARÉ de
  // la branche française. Un défaut déclaré reste un défaut — servi à
  // quelqu'un dont on ne sait RIEN, c'est un numéro faux affirmé avec
  // assurance, pas une dégradation signalée (R2/R3).
  //
  // La conjonction reste française sans locale: c'est la branche legacy, et
  // elle n'a pas de seconde langue à choisir.
  assertEquals(numbersFor({}), {
    emergency: "112",
    suicide: "https://findahelpline.com",
  });
});
