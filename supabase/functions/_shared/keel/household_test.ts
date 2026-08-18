import { assertEquals } from "jsr:@std/assert@1";

import {
  ageStateFromVerdict,
  goalApplies,
  MEMBER_AGE_STATES,
} from "./household.ts";
import { MEMBER_GOALS } from "./household_portions.ts";
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

// ⚠️ CE BLOC A ÉTÉ RENVERSÉ LE 2026-08-18, ET IL PORTAIT L'ANCIENNE RÈGLE.
// Il gardait « ⛔ un mineur ne porte JAMAIS une direction correctrice sur le
// corps » et vérifiait que `MINOR_FORBIDDEN_GOALS` valait exactement
// `["fat_loss", "recomposition"]`. Décision humaine du 2026-08-18: un mineur
// porte LES TROIS objectifs, comme un majeur. La constante est SUPPRIMÉE, pas
// vidée — une liste vide encore consultée est une branche morte que le
// prochain lecteur reremplit au hasard.
//
// ⚠️ CE QUI PROTÈGE À LA PLACE N'EST PAS ICI, ET C'EST LE POINT. La raison
// écrite le 13/08 n'a jamais été « pas de direction », c'était « pas de
// direction qui fasse d'un enfant une cible de poids ». Trois gardes la
// tiennent, et chacune a son test dans SON module:
//   1. `childEnvelopeFromBody` ne prend pas de `goal` — maintenance calculée
//      sur l'âge, quoi qu'il y ait en colonne (`meal_envelope_test.ts`);
//   2. `paceCeilingFor` borne un mineur sur son besoin estimé, pas sur le
//      plafond de l'adulte (`weight_pace_test.ts`);
//   3. le corps d'un enfant n'est jamais énoncé (FF-047, `meal_body_test.ts`).
Deno.test("✅ un mineur porte LES TROIS directions (2026-08-18)", () => {
  // `fat_loss` est celle qui compte: c'était le refus, et elle s'applique
  // maintenant exactement comme sur un majeur.
  for (const goal of MEMBER_GOALS) {
    assertEquals(
      goalApplies({ ageState: "minor", goal }),
      true,
      `un mineur doit porter « ${goal} » depuis le 2026-08-18`,
    );
    assertEquals(goalApplies({ ageState: "adult", goal }), true, goal);
  }
  // Et l'absence reste l'absence, à tout âge.
  assertEquals(goalApplies({ ageState: "minor", goal: null }), false);
  assertEquals(goalApplies({ ageState: "minor", goal: "" }), false);
});

Deno.test("un jeton RETIRÉ n'est plus un objectif du produit", () => {
  // ⚠️ LA GARDE QUI REMPLACE LE REFUS D'ÂGE. Une ligne écrite avant le
  // 2026-08-18 peut encore porter `health` si une migration a été rejouée à
  // moitié. `goalApplies` croit ce qu'on lui donne — c'est une fonction pure —
  // mais aucun chemin de lecture ne peut plus en tirer une direction:
  // `MEMBER_GOALS` est la seule clé de `SERVING_DIRECTION`, et
  // `distinctServingDirections` filtre déjà dessus.
  for (const retired of ["health", "performance", "recomposition"]) {
    assertEquals(
      (MEMBER_GOALS as readonly string[]).includes(retired),
      false,
      `« ${retired} » ne doit plus être un objectif du produit`,
    );
  }
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
  // ⚠️ LE VERDICT DU MINEUR EST PASSÉ DE `false` À `true` LE 2026-08-18, ET LE
  // TEST GARDE LA MÊME PROPRIÉTÉ: la garde discrimine encore. Elle discrimine
  // sur l'ÂGE INCONNU, qui est le seul cas où l'on refuse — « je ne sais pas »
  // et « c'est un enfant » ne sont pas la même phrase.
  const verdicts = (["minor", "adult", "unknown"] as const).map((ageState) =>
    goalApplies({ ageState, goal: "fat_loss" })
  );
  assertEquals(verdicts, [true, true, false]);
  assertEquals(new Set(verdicts).size, 2, "une garde qui rend toujours la même chose n'est pas une garde");
});
