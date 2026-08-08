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
 * WHY THE PREMISE-FALSE CASES ARE HERE TOO
 * A belt that fires when there is nothing to fix is its own defect. The last
 * two tests assert that with no country the behaviour is EXACTLY what it was
 * before this fix — locale, then the branch default. This belt can only ever
 * remove a wrong number; it can never introduce one.
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

Deno.test("PREMISE FALSE — no country: behaviour is unchanged, the locale still decides", () => {
  // La locale décide toujours du PAYS (999/116 123, inchangé). Depuis L1 elle
  // décide aussi de la conjonction: « or » pour un lecteur anglais.
  assertEquals(numbersFor({ userCountry: null, userLocale: "en-GB" }), {
    emergency: "999 or 112",
    suicide: "116 123",
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

Deno.test("PREMISE FALSE — no country and no locale: the declared branch default, unchanged", () => {
  assertEquals(numbersFor({}), {
    emergency: "15 ou 112",
    suicide: "3114",
  });
});
