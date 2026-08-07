import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type EnvyMember,
  MAX_ENVY_CHARS,
  MAX_ENVY_MEMBERS,
  mergeEnvies,
} from "./household_envies.ts";

const DAD: EnvyMember = { userId: "u-dad", displayName: "Marc" };
const MUM: EnvyMember = { userId: "u-mum", displayName: "Claire" };
const KID: EnvyMember = { userId: "u-kid", displayName: "Léa" };

Deno.test("LE SILENCE EST UNE RÉPONSE VALIDE, et le bloc le dit", () => {
  // LA RÈGLE DE SURVIE DU PRODUIT. Si le plan attendait que tout le monde
  // réponde, celui qui tient le foyer devrait courir après chacun — c'est-à-
  // dire qu'on aurait recréé la charge mentale qu'on promet de supprimer.
  const got = mergeEnvies([DAD, MUM, KID], [{ userId: "u-dad", body: "un curry" }]);
  assertEquals(got.spoken, ["u-dad"]);
  assertEquals(got.silent, ["u-mum", "u-kid"]);
  assert(got.promptBlock.includes("Claire did not say anything this week."));
  assert(got.promptBlock.includes("composed from their profile alone"));
  assert(got.promptBlock.includes("never wait for them"));
});

Deno.test("personne n'a parlé: le plan sort quand même", () => {
  const got = mergeEnvies([DAD, MUM], []);
  assertEquals(got.spoken, []);
  assertEquals(got.silent, ["u-dad", "u-mum"]);
  assert(got.promptBlock.length > 0, "un foyer muet a quand même droit à son plan");
});

Deno.test("deux envies CONTRADICTOIRES partent toutes les deux", () => {
  // L'arbitrage appartient au générateur, avec obligation de le DIRE. Trancher
  // ici produirait un arbitrage muet, et un foyer à qui on retire son envie
  // sans un mot cesse de déposer des envies.
  const got = mergeEnvies([DAD, MUM], [
    { userId: "u-dad", body: "du poisson" },
    { userId: "u-mum", body: "surtout pas de poisson" },
  ]);
  assert(got.promptBlock.includes("du poisson"));
  assert(got.promptBlock.includes("surtout pas de poisson"));
  assert(got.promptBlock.includes("what you traded off and for whom"));
});

Deno.test("le bloc interdit de répondre « impossible »", () => {
  // Un générateur qui renvoie une erreur à une famille le samedi soir est un
  // produit mort (PIVOT-FOYER §8.4).
  const got = mergeEnvies([DAD], [{ userId: "u-dad", body: "n'importe quoi" }]);
  assert(got.promptBlock.includes("Never answer that the week is impossible."));
});

Deno.test("l'ordre suit le FOYER, jamais l'ordre d'arrivée des envies", () => {
  // Un bloc dont l'ordre change d'une semaine à l'autre rend les diffs de
  // prompt illisibles et casse le cache d'invite.
  const got = mergeEnvies([DAD, MUM, KID], [
    { userId: "u-kid", body: "des pâtes" },
    { userId: "u-dad", body: "un curry" },
  ]);
  const order = got.promptBlock.split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2, l.indexOf(" ", 2)));
  assertEquals(order, ["Marc", "Claire", "Léa"]);
});

Deno.test("une envie trop longue est bornée, pas rejetée", () => {
  // Le plafond de la base est à 500; celui-ci existe pour les chemins qui ne
  // passent pas par la RPC. Un prompt de 20 Ko est un défaut déjà payé par ce
  // dépôt sur le composeur.
  const long = "a".repeat(MAX_ENVY_CHARS + 400);
  const got = mergeEnvies([DAD], [{ userId: "u-dad", body: long }]);
  assertEquals(got.spoken, ["u-dad"]);
  const line = got.promptBlock.split("\n").find((l) => l.startsWith("- Marc"))!;
  assert(line.length < MAX_ENVY_CHARS + 60, `ligne de ${line.length} caractères`);
  assert(line.endsWith("…"), "la troncature doit se voir");
});

Deno.test("une envie d'un NON-MEMBRE est ignorée sans bruit", () => {
  // Elle ne peut venir que de quelqu'un qui est parti, et le foyer n'a pas à
  // voir son nom ressurgir dans le plan de la semaine.
  const got = mergeEnvies([DAD], [
    { userId: "u-dad", body: "un curry" },
    { userId: "u-ex", body: "des sushis" },
  ]);
  assert(!got.promptBlock.includes("sushis"));
  assertEquals(got.spoken, ["u-dad"]);
});

Deno.test("une envie vide vaut silence", () => {
  const got = mergeEnvies([DAD], [{ userId: "u-dad", body: "   " }]);
  assertEquals(got.spoken, []);
  assertEquals(got.silent, ["u-dad"]);
});

Deno.test("un foyer démesuré est tronqué, et la troncature EST DITE", () => {
  // « no silent caps »: une troncature muette se lit « tout le monde a été
  // pris en compte » alors que c'est faux.
  const many = Array.from({ length: MAX_ENVY_MEMBERS + 3 }, (_, i) => ({
    userId: `u-${i}`,
    displayName: `P${i}`,
  }));
  const got = mergeEnvies(many, []);
  assertEquals(got.silent.length, MAX_ENVY_MEMBERS);
  assert(got.promptBlock.includes("3 more people in this household are not listed"));
});

Deno.test("un foyer vide ne produit pas de bloc", () => {
  assertEquals(mergeEnvies([], []), { promptBlock: "", spoken: [], silent: [] });
});
