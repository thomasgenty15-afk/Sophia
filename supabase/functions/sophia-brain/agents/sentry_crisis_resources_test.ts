/**
 * T-20 — LE SECOND CALL SITE DE CRISE, CELUI QU'ON OUBLIE.
 *
 * `agents/sentry.ts` est vivant (`router/agent_exec.ts:166`, mode `sentry`) et
 * il portait sa PROPRE copie de la règle de précédence « pays > locale > défaut
 * français ». Il n'avait aucun test : le lot T-20 aurait pu corriger
 * `safety_crisis/reducer.ts`, mesurer vert, et laisser cette lane servir le
 * 3114 à quelqu'un dont on ignore le pays.
 *
 * Une règle en trois exemplaires, c'est trois endroits où la corriger et deux
 * qu'on oublie. Ce fichier pinne le troisième.
 *
 * ⚠️ CE QUE CE FICHIER NE COUVRE PAS, et qui reste ouvert : la prose de
 * `runSentry` (prompt ET réponse de secours) est en français EN DUR, sans
 * aucune locale en entrée — exactement le défaut que L1 a fermé sur
 * `safety_crisis/visible_agent.ts` (T-19), toujours ouvert ici. Les NUMÉROS
 * sont corrects ; la LANGUE autour d'eux ne l'est pas.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildSentryCrisisResources } from "./sentry.ts";

Deno.test("sentry T-20 — pays absent ⇒ jeu international, jamais la France", () => {
  // Le défaut de colonne de toute la flotte.
  const defaulted = buildSentryCrisisResources({ country: null, locale: "fr-FR" });
  assertEquals(defaulted.emergency, "112");
  assertEquals(defaulted.suicide, "https://findahelpline.com");

  // Un sous-segment région explicite ne nomme pas davantage un lieu de vie:
  // `JoinPage` a écrit `en-US` en dur pour toute une population.
  const gb = buildSentryCrisisResources({ country: null, locale: "en-GB" });
  assertEquals(gb.suicide, "https://findahelpline.com");

  // Rien du tout: plus de défaut de branche.
  const nothing = buildSentryCrisisResources();
  assertEquals(nothing.emergency, "112");
  assertEquals(nothing.suicide, "https://findahelpline.com");
});

Deno.test("sentry T-20 — LE CAS QUI PASSE: un pays déclaré gouverne ses numéros", () => {
  // Une garde sans cas qui passe ressemble à une garde qui marche. Les trois
  // pays ensemencés traversent intacts, y compris contre une locale qui dit
  // autre chose.
  assertEquals(buildSentryCrisisResources({ country: "FR" }).suicide, "3114");
  assertEquals(
    buildSentryCrisisResources({ country: "US", locale: "fr-FR" }).suicide,
    "988",
  );
  assertEquals(
    buildSentryCrisisResources({ country: "GB", locale: "fr-FR" }).emergency,
    "999 ou 112",
  );
});

Deno.test("sentry T-20 — le bloc de puces ne cite que le registre du pays servi", () => {
  // `numbersBlock` part DANS LE PROMPT. Un numéro qui n'y est pas ne peut pas
  // être cité par le modèle sans être une invention.
  const zz = buildSentryCrisisResources({ country: null, locale: "fr-FR" });
  assertEquals(zz.numbersBlock.includes("3114"), false);
  assertEquals(zz.numbersBlock.includes("112"), true);

  const fr = buildSentryCrisisResources({ country: "FR" });
  assertEquals(fr.numbersBlock.includes("3114"), true);
});
