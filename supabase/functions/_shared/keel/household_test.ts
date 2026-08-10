import { assertEquals } from "jsr:@std/assert@1";

import {
  ageStateFromVerdict,
  goalApplies,
  MEMBER_AGE_STATES,
} from "./household.ts";
import { assessBirthDate } from "./student_age.ts";

/**
 * ── CE QUE CE FICHIER TESTE, ET CE QU'IL NE TESTE PLUS ──────────────────────
 *
 * Il testait `canRestrict`, `canInvite`, `memberVisibility` et `goalVisibility`
 * — quatorze cas sur le pouvoir domestique et la visibilité en colocation. Les
 * quatre fonctions sont parties le 2026-08-10 (lot 2): les deux premières
 * n'avaient JAMAIS eu d'appelant en production (la règle vivait en SQL), les
 * deux autres n'existaient que pour un mode que le produit ne vend plus.
 *
 * Ce qui les remplace est plus petit et plus mordant: l'ÂGE À TROIS ÉTATS, et
 * la règle qui en dépend. C'est le seul endroit du foyer où une erreur se
 * traduit par une direction nutritionnelle servie à un enfant.
 */

const TODAY = "2026-08-10";

function stateOf(birthDate: string | null): string {
  return ageStateFromVerdict(assessBirthDate(birthDate, TODAY));
}

Deno.test("un enfant de huit ans est mineur", () => {
  assertEquals(stateOf("2018-03-04"), "minor");
});

Deno.test("un adulte est adulte", () => {
  assertEquals(stateOf("1990-03-04"), "adult");
});

Deno.test("le jour des dix-huit ans, on bascule adulte", () => {
  assertEquals(stateOf("2008-08-10"), "adult");
  assertEquals(stateOf("2008-08-11"), "minor");
});

/**
 * ⚠️ LES QUATRE FORMES DE « ON NE SAIT PAS » RENDENT TOUTES `unknown`.
 *
 * C'est l'INVERSION du lot 2, et c'est la ligne qui compte le plus du fichier.
 * L'ancienne garde SQL faisait `coalesce(…, false)` — « date absente ⇒ traité
 * comme majeur » — ce qui était la direction sûre dans un monde où toute bouche
 * avait un compte et où « majeur » voulait dire « protégé du pouvoir d'un
 * autre ». Depuis que le compte maître saisit des bouches à la main, la même
 * valeur veut dire « on lui applique une direction d'objectif d'adulte », et un
 * enfant dont personne n'a renseigné la date la recevrait.
 */
Deno.test("aucune date, date illisible, future ou aberrante: toutes 'unknown'", () => {
  assertEquals(stateOf(null), "unknown");
  assertEquals(stateOf(""), "unknown");
  assertEquals(stateOf("pas une date"), "unknown");
  assertEquals(stateOf("2099-01-01"), "unknown");
  assertEquals(stateOf("1820-01-01"), "unknown");
});

Deno.test("le vocabulaire est fermé à trois valeurs", () => {
  assertEquals([...MEMBER_AGE_STATES], ["minor", "adult", "unknown"]);
});

// ---------------------------------------------------------------------------
// `goalApplies` — la règle que le générateur ET l'écran lisent
// ---------------------------------------------------------------------------

Deno.test("un adulte avec objectif reçoit sa direction", () => {
  assertEquals(goalApplies({ ageState: "adult", goal: "fat_loss" }), true);
});

Deno.test("un adulte sans objectif n'en reçoit aucune", () => {
  assertEquals(goalApplies({ ageState: "adult", goal: null }), false);
  assertEquals(goalApplies({ ageState: "adult", goal: "" }), false);
});

Deno.test("un mineur n'a pas d'objectif, même si la colonne en porte un", () => {
  // La colonne PEUT porter une valeur — un enfant grandit, et l'objectif saisi
  // à ses dix-sept ans reste écrit. C'est `goalApplies` qui décide, pas la
  // présence de la donnée, sinon la garde dépendrait d'un nettoyage.
  assertEquals(goalApplies({ ageState: "minor", goal: "fat_loss" }), false);
});

Deno.test("⚠️ âge INCONNU: aucun objectif, même déclaré", () => {
  // LE CAS NEUF. Sans cette ligne, une bouche saisie sans date recevrait la
  // direction de son objectif comme si on savait qu'elle est adulte — c'est
  // exactement ce que l'ancien `coalesce(false)` produisait.
  assertEquals(goalApplies({ ageState: "unknown", goal: "fat_loss" }), false);
  assertEquals(goalApplies({ ageState: "unknown", goal: "muscle_gain" }), false);
});

/**
 * ⚠️ CE TEST MUTE LA RÈGLE POUR PROUVER QU'IL LA MESURE.
 *
 * Ce dépôt a déjà payé « un test paramétré par sa propre constante »: vert quoi
 * qu'on change. Ici on vérifie que les trois états ne donnent PAS le même
 * verdict — donc qu'une implémentation qui rendrait toujours `true` (ou
 * toujours `false`) ferait tomber quelque chose.
 */
Deno.test("les trois états ne se comportent pas pareil", () => {
  const verdicts = (["minor", "adult", "unknown"] as const).map((ageState) =>
    goalApplies({ ageState, goal: "fat_loss" })
  );
  assertEquals(verdicts, [false, true, false]);
  assertEquals(new Set(verdicts).size, 2, "une garde qui rend toujours la même chose n'est pas une garde");
});
