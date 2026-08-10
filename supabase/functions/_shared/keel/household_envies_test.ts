import { assert, assertEquals } from "jsr:@std/assert@1";

import { buildEnvyBlock, MAX_ENVY_CHARS } from "./household_envies.ts";

Deno.test("la ligne du maître part au modèle TELLE QUELLE", () => {
  const got = buildEnvyBlock("Léa veut des pâtes, Marc en a marre du poulet");
  assert(got.includes("Léa veut des pâtes, Marc en a marre du poulet"));
  assert(got.includes("WHAT THIS HOUSEHOLD ASKED FOR THIS WEEK."));
});

Deno.test("PAS DE LIGNE ⇒ PAS DE BLOC, et surtout pas un bloc vide", () => {
  // C'est la règle de survie (§8.4) devenue structurelle: il n'y a rien à
  // attendre, donc rien à expliquer au modèle. Un en-tête « voici ce que le
  // foyer a demandé » suivi de rien ferait composer contre une demande
  // imaginaire — ou attendre une réponse qui ne viendra pas.
  assertEquals(buildEnvyBlock(null), "");
  assertEquals(buildEnvyBlock(undefined), "");
  assertEquals(buildEnvyBlock(""), "");
  assertEquals(buildEnvyBlock("   \n  "), "");
});

Deno.test("AUCUNE TRACE DE L'ANCIEN CONSEIL DE FAMILLE", () => {
  // ⚠️ CE TEST EXISTE POUR EMPÊCHER UN RETOUR PAR INADVERTANCE. Le décompte
  // des silencieux a été retiré parce qu'il faisait relancer tout le monde;
  // le remettre dans le prompt le remettrait dans la tête du modèle, qui
  // demanderait alors « et les autres ? ».
  const got = buildEnvyBlock("un curry");
  for (const dead of ["did not say anything", "said nothing", "silent", "waiting"]) {
    assert(!got.toLowerCase().includes(dead), `« ${dead} » ne doit plus exister`);
  }
});

Deno.test("une ligne CONTRADICTOIRE part quand même, avec l'ordre de l'arbitrer À VOIX HAUTE", () => {
  // Trancher en code produirait un arbitrage muet, et un foyer à qui l'on
  // retire son envie sans un mot cesse d'en déposer.
  const got = buildEnvyBlock("du poisson jeudi, mais surtout pas de poisson");
  assert(got.includes("du poisson jeudi, mais surtout pas de poisson"));
  assert(got.includes("what you"));
  assert(got.includes("traded off and for whom"));
});

Deno.test("le bloc interdit de répondre « impossible »", () => {
  // Un générateur qui renvoie une erreur à une famille le samedi soir est un
  // produit mort (PIVOT-FOYER §8.4).
  const got = buildEnvyBlock("n'importe quoi");
  assert(got.includes("Never answer that the week is impossible."));
});

Deno.test("une ligne trop longue est BORNÉE, pas rejetée", () => {
  // Le plafond de la base est à 500; celui-ci existe pour les chemins qui ne
  // passent pas par la RPC. Un prompt de 20 Ko est un défaut déjà payé par ce
  // dépôt sur le composeur.
  const long = "a".repeat(MAX_ENVY_CHARS + 400);
  const got = buildEnvyBlock(long);
  assert(got.length > 0, "une ligne trop longue reste une envie");
  const quoted = got.split("\n").find((l) => l.trim().startsWith('"'))!;
  assert(quoted.length < MAX_ENVY_CHARS + 60, `ligne de ${quoted.length} caractères`);
  assert(quoted.trim().endsWith('…"'), "la troncature doit se voir");
});

Deno.test("les blancs sont écrasés, la phrase reste sur une ligne", () => {
  // Sans ça, une ligne saisie avec des retours chariot casse la forme du bloc
  // et le modèle lit les morceaux comme des consignes séparées.
  const got = buildEnvyBlock("des pâtes\n\n   et   du poisson");
  assert(got.includes('"des pâtes et du poisson"'));
});
