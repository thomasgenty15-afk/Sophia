import { assertEquals } from "jsr:@std/assert@1";

import {
  ageStateFromVerdict,
  goalApplies,
  MINOR_FORBIDDEN_GOALS,
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

Deno.test("⛔ un mineur ne porte JAMAIS une direction correctrice sur le corps", () => {
  // ── LA MOITIÉ DE §8.4 QUI NE BOUGE PAS ───────────────────────────────────
  // « Avec un mineur, le registre est éducatif — jamais correctif sur le corps.
  // Aucune mention de poids, de silhouette, de restriction. » Ces deux
  // directions-là sont l'autre registre: celui qui RETIRE.
  //
  // La colonne PEUT porter la valeur — un enfant grandit, et l'objectif saisi à
  // ses dix-sept ans reste écrit. C'est `goalApplies` qui décide, pas la
  // présence de la donnée, sinon la garde dépendrait d'un nettoyage.
  assertEquals(goalApplies({ ageState: "minor", goal: "fat_loss" }), false);
  assertEquals(goalApplies({ ageState: "minor", goal: "recomposition" }), false);
  // ET LA LISTE EST LA MÊME DES DEUX CÔTÉS. Si quelqu'un en retire une entrée,
  // ce test tombe AVEC celui de la base — pas six mois plus tard.
  assertEquals([...MINOR_FORBIDDEN_GOALS], ["fat_loss", "recomposition"]);
});

Deno.test("✅ un mineur PEUT porter une direction qui ajoute (2026-08-13)", () => {
  // ── CE QUE LA DÉCISION HUMAINE DU 2026-08-13 A OUVERT ───────────────────
  // §8.4 interdisait TOUTE direction à un mineur. La règle était plus large que
  // sa raison: « on parle de ce que l'aliment APPORTE, pas de ce qu'il fait
  // grossir ». Manger mieux, mieux s'entraîner, tenir son poids et construire
  // du muscle sont du premier registre.
  //
  // Sans ce test, rouvrir la règle serait invisible: l'ancien bloc n'éprouvait
  // QUE `fat_loss`, donc il serait resté vert avec un `goalApplies` qui rend
  // `false` pour toutes les directions d'un enfant.
  assertEquals(goalApplies({ ageState: "minor", goal: "health" }), true);
  assertEquals(goalApplies({ ageState: "minor", goal: "performance" }), true);
  assertEquals(goalApplies({ ageState: "minor", goal: "maintenance" }), true);
  assertEquals(goalApplies({ ageState: "minor", goal: "muscle_gain" }), true);
  // Et l'absence reste l'absence, à tout âge.
  assertEquals(goalApplies({ ageState: "minor", goal: null }), false);
  assertEquals(goalApplies({ ageState: "minor", goal: "" }), false);
});

Deno.test("⚠️ âge INCONNU: aucun objectif, même déclaré", () => {
  // LE CAS NEUF. Sans cette ligne, une bouche saisie sans date recevrait la
  // direction de son objectif comme si on savait qu'elle est adulte — c'est
  // exactement ce que l'ancien `coalesce(false)` produisait.
  assertEquals(goalApplies({ ageState: "unknown", goal: "fat_loss" }), false);
  assertEquals(goalApplies({ ageState: "unknown", goal: "muscle_gain" }), false);
  // ⚠️ ET IL NE SUIT PAS LE MINEUR SUR L'OUVERTURE DE 2026-08-13. « Je ne sais
  // pas » n'est pas « c'est un enfant »: un âge absent peut être celui d'un
  // adulte, et lui appliquer la direction d'un enfant serait décider à sa place.
  assertEquals(goalApplies({ ageState: "unknown", goal: "health" }), false);
  assertEquals(goalApplies({ ageState: "unknown", goal: "performance" }), false);
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
