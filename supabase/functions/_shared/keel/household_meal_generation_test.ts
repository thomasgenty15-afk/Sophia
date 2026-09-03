import { assert, assertEquals } from "jsr:@std/assert@1";

import type { PortionMember } from "./household_portions.ts";
import { householdDietBlock } from "./household_diet.ts";
import {
  buildHouseholdPromptBlocks,
  extractMemberPortions,
  HOUSEHOLD_PROMPT_VERSION,
  type HouseholdRestriction,
} from "./household_meal_generation.ts";
import {
  parseMemberAway,
  resolveWindowPresence,
  type WindowPresence,
} from "./household_presence.ts";
import {
  MERGE_ANCHOR_INSTRUCTION,
  MERGE_MATERIAL_USE_INSTRUCTION,
} from "./household_merge.ts";

/**
 * TOUT LE MONDE EST LÀ — le cas nominal, et il est CALCULÉ, jamais écrit à la
 * main. Un objet littéral `{ block: "", ... }` resterait vert le jour où
 * `resolveWindowPresence` cesse de rendre un bloc vide pour un foyer sans
 * absence: le test garderait alors une constante du test, pas le module.
 */
const NOBODY_AWAY: WindowPresence = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
  ],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue"],
});

const DAD: PortionMember = {
  memberId: "m-dad", displayName: "Marc", goal: "fat_loss", ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};
const SON: PortionMember = {
  memberId: "m-son", displayName: "Tom", goal: "muscle_gain", ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};
const KID: PortionMember = {
  memberId: "m-kid", displayName: "Léa", goal: null, ageState: "minor",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};

Deno.test("chaque membre apparaît avec son id EXACT, une fois", () => {
  // Le modèle doit rendre `member_portions` clé par user_id. Un id approximatif
  // fait tomber la consigne dans `portion_for_unknown_member` et la personne se
  // retrouve en part standard sans qu'on sache pourquoi.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON, KID], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  for (const m of [DAD, SON, KID]) {
    const occurrences = userSuffix.split(m.memberId).length - 1;
    assert(occurrences >= 1, `${m.memberId} doit être cité`);
    assert(
      userSuffix.includes(`- ${m.displayName} = ${m.memberId}`),
      `${m.displayName} doit être associé à son id`,
    );
  }
});

Deno.test("LES RÈGLES DE MAISON NE SONT JAMAIS UNE RAISON NUTRITIONNELLE", () => {
  // §8.5 règle 4, le point le plus facile à violer par inadvertance. Si le
  // prompt disait seulement « évite le Nutella pour Léa », le modèle
  // expliquerait spontanément pourquoi — et ferait passer la décision d'un
  // parent pour une vérité de santé.
  const restrictions: HouseholdRestriction[] = [
    { memberId: "m-kid", memberDisplayName: "Léa", label: "nutella" },
  ];
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, KID], envyLine: null, restrictions, presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  // NORMALISÉ, parce que le bloc est enroulé pour rester lisible dans le
  // source: une assertion sur le texte brut casserait au premier reflow, et un
  // test qui casse quand on ne change rien de vrai finit par être neutralisé.
  const flat = userSuffix.replace(/\s+/g, " ");
  assert(flat.includes("HOUSE RULES"));
  assert(flat.includes("NOT nutrition advice"));
  assert(flat.includes("Never explain them"));
  assert(flat.includes("never justify them"));
  // La porte dérobée: proposer une version « plus saine » recrée le jugement
  // par la bande.
  assert(flat.includes("never offer a 'healthier' version"));
});

Deno.test("les restrictions d'une même personne sont regroupées", () => {
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [KID],
    envyLine: null,
    presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
    restrictions: [
      { memberId: "m-kid", memberDisplayName: "Léa", label: "nutella" },
      { memberId: "m-kid", memberDisplayName: "Léa", label: "nuggets" },
    ],
  });
  assert(userSuffix.includes("- Léa: never serve nutella, nuggets"));
});

Deno.test("LES RÈGLES DE MAISON PASSENT APRÈS LES ENVIES", () => {
  // Ce sont elles qui doivent survivre à une envie contradictoire (« je veux
  // du Nutella » puis « on ne sert pas de Nutella à Léa »), et un modèle lit la
  // contrainte la plus proche de la fin comme la plus contraignante.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [KID],
    envyLine: "du nutella partout",
    presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
    restrictions: [
      { memberId: "m-kid", memberDisplayName: "Léa", label: "nutella" },
    ],
  });
  assert(userSuffix.indexOf("HOUSE RULES") > userSuffix.indexOf("du nutella partout"));
});

Deno.test("sans restriction, aucun bloc de règles n'apparaît", () => {
  // Un en-tête « règles de maison » vide ferait croire au modèle qu'il y a des
  // interdits, et il composerait prudemment sans savoir contre quoi.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(!userSuffix.includes("HOUSE RULES"));
});

Deno.test("le schéma supplémentaire n'est demandé que côté système", () => {
  const { systemSuffix, userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(systemSuffix.includes('"member_portions"'));
  assert(systemSuffix.includes("never a reason"));
  // Il ne doit PAS polluer le message utilisateur: le schéma est un contrat de
  // sortie, pas une donnée de la demande.
  assert(!userSuffix.includes('"member_portions"'));
});

Deno.test("le brief de portions et la ligne d'envies sont tous les deux là", () => {
  const { userSuffix, envyLineUsed } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "un curry, et Tom en a marre du poulet",
    restrictions: [],
    presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(userSuffix.includes("HOUSEHOLD SERVING PLAN"));
  assert(userSuffix.includes("Do NOT propose separate dishes"));
  assert(userSuffix.includes("un curry, et Tom en a marre du poulet"));
  assertEquals(envyLineUsed, true);
});

Deno.test("SANS LIGNE D'ENVIES, aucun en-tête d'envies n'apparaît", () => {
  // ⚠️ CE TEST EST LA PREUVE QUE LE FIL EST REBRANCHÉ, dans les deux sens: le
  // bloc entre quand il y a une phrase (test ci-dessus) et n'entre PAS quand il
  // n'y en a pas. Un en-tête « voici ce que le foyer a demandé » suivi de rien
  // ferait composer le modèle contre une demande imaginaire.
  const { userSuffix, envyLineUsed } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(!userSuffix.includes("WHAT THIS HOUSEHOLD ASKED FOR"));
  assertEquals(envyLineUsed, false);
  // Et le décompte des silencieux ne revient pas par la bande: Tom n'a rien
  // écrit, et rien dans le prompt ne le lui reproche.
  assert(!userSuffix.toLowerCase().includes("did not say anything"));
});

// ───────────────────────────────────────────────────────────────────────────
// D14 — LA PRÉSENCE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le bloc de présence entre dans le prompt, JUSTE APRÈS le brief de portions", () => {
  const presence = resolveWindowPresence({
    members: [
      { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([{ day: "sat" }]) },
      { memberId: "m-son", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["fri", "sat"],
  });
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [],
    presence,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(userSuffix.includes("WHO IS NOT AT THE TABLE"), userSuffix);
  // L'ORDRE EST LE SUJET: « pour combien » doit se lire juste après « pour
  // qui ». Séparés par l'envie de la semaine, le modèle recompte la tablée sur
  // la liste d'ids.
  assert(
    userSuffix.indexOf("HOUSEHOLD SERVING PLAN") <
      userSuffix.indexOf("WHO IS NOT AT THE TABLE"),
  );
  assert(userSuffix.indexOf("WHO IS NOT AT THE TABLE") < userSuffix.indexOf("un curry"));
});

Deno.test("SANS ABSENCE, aucun en-tête de présence n'apparaît", () => {
  // ⚠️ LA MOITIÉ QUI PROUVE QUE LA GARDE N'EST PAS COLLÉE EN DUR. Un bloc
  // « certains ne sont pas là » suivi de rien ferait cuisiner le modèle pour un
  // nombre qu'il devine — c'est-à-dire moins que le foyer, un jour sur deux.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(!userSuffix.includes("WHO IS NOT AT THE TABLE"), userSuffix);
});

// ───────────────────────────────────────────────────────────────────────────
// L'EXTRACTION
// ───────────────────────────────────────────────────────────────────────────

Deno.test("extrait member_portions d'une réponse normale", () => {
  const raw = JSON.stringify({
    dishes: [],
    member_portions: [{ member_id: "m-dad", portion_note: "1 part" }],
  });
  assertEquals(extractMemberPortions(raw), [
    { member_id: "m-dad", portion_note: "1 part" },
  ]);
});

Deno.test("extrait à travers un bloc de code markdown", () => {
  // Le modèle enrobe régulièrement sa réponse. On cherche les accolades, comme
  // le parseur principal.
  const raw = "```json\n" + JSON.stringify({ member_portions: [{ member_id: "x" }] }) + "\n```";
  assertEquals(extractMemberPortions(raw), [{ member_id: "x" }]);
});

Deno.test("UNE RÉPONSE ILLISIBLE REND null, ELLE NE LÈVE PAS", () => {
  // §8.4: le produit ne rend jamais « impossible ». Une composition dont les
  // portions sont illisibles reste une composition valable — tout le monde
  // passe en part standard et c'est tracé. Perdre la cuisson du samedi soir
  // pour un champ annexe serait la vraie perte.
  assertEquals(extractMemberPortions("pas du json du tout"), null);
  assertEquals(extractMemberPortions("{ ceci n'est pas, du json }"), null);
  assertEquals(extractMemberPortions(""), null);
});

Deno.test("une réponse sans member_portions rend null sans bruit", () => {
  assertEquals(extractMemberPortions(JSON.stringify({ dishes: [] })), null);
});

Deno.test("CHANGER LES BLOCS SANS BUMPER LA VERSION DOIT ÊTRE ROUGE", () => {
  // ⚠️ CE TEST EXISTE PARCE QUE LE MANQUE A ÉTÉ MESURÉ, le 2026-08-12. L2 a
  // greffé le bloc de présence dans le prompt du foyer et `prompt_version` n'a
  // pas bougé: deux plans stampés de la même version portaient des consignes
  // différentes, et toute comparaison avant/après du lot devenait illisible.
  // Rien n'échouait — un prompt n'a pas de compilateur.
  //
  // Il ne compare PAS le texte: une reformulation dans le corps d'un bloc
  // casserait au premier reflow, et un test qui casse quand rien de vrai n'a
  // changé finit neutralisé. Il tient la STRUCTURE — combien de blocs, dans
  // quel ordre. C'est ce que la version doit suivre.
  //
  // QUAND IL TOMBE: si tu as ajouté, retiré ou déplacé un bloc, bumpe
  // `HOUSEHOLD_PROMPT_VERSION` et mets à jour les deux constantes ci-dessous.
  // Ce n'est pas une formalité: c'est le seul lien entre une ligne écrite en
  // base et la consigne qui l'a produite.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-dad",
        displayName: "Marc",
        away: parseMemberAway([{ day: "mon", slots: ["lunch"] }]),
      },
      { memberId: "m-son", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "des pâtes",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });

  // L'ORDRE EST UNE CONSIGNE, pas une mise en page: les règles de maison
  // passent en dernier pour survivre à une envie contradictoire, et la
  // présence colle au brief de portions parce que les deux disent « qui mange
  // quoi ». Déplacer l'un des deux change ce que le modèle rend.
  const SECTIONS_NO_MERGE = [
    "== THE HOUSEHOLD ==",
    "HOUSEHOLD SERVING PLAN",
    // LOT 4 — LA MISE EN BOÎTES VIT DANS LE BRIEF, ENTRE LES LIGNES PAR
    // PERSONNE ET L'INTERDIT DU « POURQUOI ». Sa place est la moitié du lot: la
    // promesse de peser est ce brief-ci, et un ordre séparé de sa promesse a
    // déjà été mesuré à zéro effet le 2026-08-17.
    "WEIGH IT ONCE, INTO BOXES NAMED BY MEAL.",
    "WHO IS NOT AT THE TABLE",
    "WHAT THIS HOUSEHOLD ASKED FOR",
    "HOUSE RULES",
  ];
  let cursor = -1;
  for (const marker of SECTIONS_NO_MERGE) {
    const at = userSuffix.indexOf(marker);
    assert(
      at >= 0,
      `bloc « ${marker} » absent du prompt du foyer. Si c'est voulu, bumpe ` +
        `HOUSEHOLD_PROMPT_VERSION (actuellement ${HOUSEHOLD_PROMPT_VERSION}) ` +
        `et retire-le de SECTIONS_NO_MERGE.`,
    );
    assert(
      at > cursor,
      `bloc « ${marker} » a changé de place. L'ordre est une consigne — ` +
        `bumpe HOUSEHOLD_PROMPT_VERSION (actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
    );
    cursor = at;
  }

  // LE COMPTE ATTRAPE CE QUE LA LISTE NE PEUT PAS: un bloc NEUF, dont on ne
  // connaît pas encore le marqueur. Une liste blanche ne voit jamais arriver
  // ce qu'elle n'énumère pas.
  // LOT 4 — 15 → 16: le protocole des boîtes, servi à tout foyer d'au moins
  // deux bouches, ajoute un bloc à l'intérieur du brief de portions.
  const PARTS_NO_MERGE = 16;
  assertEquals(
    userSuffix.split("\n\n").length,
    PARTS_NO_MERGE,
    `le prompt du foyer ne compte plus ${PARTS_NO_MERGE} blocs. Un bloc a été ` +
      `ajouté ou retiré: bumpe HOUSEHOLD_PROMPT_VERSION (actuellement ` +
      `${HOUSEHOLD_PROMPT_VERSION}) et mets PARTS_NO_MERGE à jour.`,
  );

  // Et la version elle-même doit rester lisible: le préfixe `v<n>_` est ce que
  // `generate-household-meal-v1` colle derrière `+household.`.
  assert(
    /^v[1-9][0-9]*_/.test(HOUSEHOLD_PROMPT_VERSION),
    `version de lane illisible: ${HOUSEHOLD_PROMPT_VERSION}`,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// L4/D6 — LA FUSION
// ───────────────────────────────────────────────────────────────────────────

const MERGE_PROMPT = {
  displayName: "Tom",
  window: { startsOn: "2026-08-12", durationDays: 3 },
  shape: "one_session" as const,
  dishes: [{ day: "wed", slot: "dinner", title: "Curry de pois chiches" }],
  // O5 — L'ANCRE. Les plats du plan DU FOYER, sans lesquels la consigne ne
  // montre qu'un menu — celui du plan personnel — et le modèle l'écrit pour
  // toute la tablée (mesuré: 15 créneaux sur 15, deux fusions réelles sur deux).
  baseDishes: [{ day: "wed", slot: "dinner", title: "Gratin de courgettes" }],
  // C2 ④ — AUCUN TROU. C'est l'IDENTITÉ de ce paramètre, et c'est ce qui rend
  // les assertions d'octet de v7 encore vraies: un plan de base complet rend le
  // bloc de v7 caractère pour caractère.
  gaps: [],
  // C6 — LE NOMBRE DE PLATS DÉDIÉS, et les axes du conflit qui le justifie.
  // Mesuré le 2026-08-12: neuf repas, DEUX axes en conflit, et un seul plat
  // dédié rendu — la casserole commune huit fois sur neuf.
  dedicatedDishes: 9,
  conflicts: ["protein:larger_above_table", "starch:larger_above_table"],
};

Deno.test("SANS FUSION, LE PROMPT EST CELUI D'AVANT L4, À L'OCTET PRÈS", () => {
  // ⚠️ LE TEST QUI PROTÈGE LE CHEMIN MAJORITAIRE. Le lot ajoute un bloc ET rend
  // variable la ligne « combien de plats » du brief; les deux doivent être
  // strictement invisibles pour une composition ordinaire. Sans cette
  // assertion, chaque foyer du produit aurait changé de consigne pour un geste
  // que personne n'a fait.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(!userSuffix.includes("BRINGING SOMEONE BACK"));
  assert(
    userSuffix.includes(
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    ),
    "la ligne historique du brief de portions a changé pour une composition " +
      "SANS fusion. C'est le contrat de composition de tout le produit.",
  );
});

Deno.test("le bloc de fusion entre APRÈS la présence et AVANT l'envie", () => {
  const presence = resolveWindowPresence({
    members: [
      { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([{ day: "sat" }]) },
      { memberId: "m-son", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["fri", "sat"],
  });
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: MERGE_PROMPT,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  // L'ORDRE EST UNE CONSIGNE. « Qui revient à table » appartient au groupe des
  // trois blocs qui disent qui mange quoi; le mettre après l'envie le ferait
  // lire comme une conséquence de ce que le foyer a demandé cette semaine. Les
  // règles de maison, elles, restent EN DERNIER — c'est ce qui leur permet de
  // survivre à une envie contradictoire.
  const SECTIONS_WITH_MERGE = [
    "== THE HOUSEHOLD ==",
    "HOUSEHOLD SERVING PLAN",
    "WHO IS NOT AT THE TABLE",
    "BRINGING SOMEONE BACK TO THIS TABLE",
    "WHAT THIS HOUSEHOLD ASKED FOR",
    "HOUSE RULES",
  ];
  let cursor = -1;
  for (const marker of SECTIONS_WITH_MERGE) {
    const at = userSuffix.indexOf(marker);
    assert(at >= 0, `bloc « ${marker} » absent du prompt de fusion`);
    assert(
      at > cursor,
      `bloc « ${marker} » a changé de place. Bumpe HOUSEHOLD_PROMPT_VERSION ` +
        `(actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
    );
    cursor = at;
  }
});

Deno.test("O5 — L'ANCRE ARRIVE DANS LE VRAI PROMPT, ET LA VERSION A BOUGÉ", () => {
  // ⚠️ CE QUI EST MESURÉ AVANT CE CORRECTIF: 15 créneaux sur 15 d'une fusion
  // réelle venaient du plan PERSONNEL du secondaire, aucun titre du plan du
  // foyer n'a survécu, deux fusions sur deux. La consigne montrait une seule
  // liste. Un test sur le module pur ne suffit pas: le bloc doit ARRIVER dans
  // le suffixe que le générateur envoie.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(
    userSuffix.includes("- wed dinner: Gratin de courgettes"),
    "le plan DU FOYER n'est pas sous les yeux du modèle: il ne voit qu'un menu, " +
      "celui du plan personnel, et il l'écrit pour toute la tablée.",
  );
  assert(userSuffix.includes(MERGE_ANCHOR_INSTRUCTION));
  assert(
    userSuffix.lastIndexOf("Gratin de courgettes") >
      userSuffix.lastIndexOf("Curry de pois chiches"),
    "la matière du plan personnel est la dernière liste lue: c'est elle que le " +
      "modèle prendra pour la consigne finale.",
  );

  // ⚠️ ET LA VERSION A DÛ BOUGER AVEC LA CONSIGNE. La population des FUSIONS
  // voit un texte différent: deux plans stampés pareil porteraient des consignes
  // différentes, très exactement le défaut que le second axe de version existe
  // pour empêcher (mesuré à L2). La composition ordinaire, la lane individuelle
  // et la défusion, elles, ne changent pas d'un octet — trois tests le tiennent.
  for (
    const past of [
      "v2_presence",
      "v3_merge",
      "v4_merge_budget",
      "v5_unmerge",
      "v6_voices",
    ]
  ) {
    assert(
      HOUSEHOLD_PROMPT_VERSION !== past,
      `la consigne de fusion ancrée existe sous la version ${past}: bumpe ` +
        `HOUSEHOLD_PROMPT_VERSION.`,
    );
  }
});

Deno.test("LE BARREAU DE L'ÉCHELLE CHANGE LA LIGNE « COMBIEN DE PLATS »", () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER: le bloc de fusion demande un
  // second plat pendant que le brief de portions, deux blocs plus haut,
  // l'interdit en toutes lettres. Deux consignes contradictoires dans le même
  // prompt, et c'est celle de la fin que le modèle suit — donc au hasard.
  const of = (shape: "one_dish" | "one_session" | "separate_sessions") =>
    buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      members: [DAD, SON],
      envyLine: null,
      restrictions: [],
      presence: NOBODY_AWAY,
      merge: { ...MERGE_PROMPT, shape },
      // G5 — SUR UNE FUSION, LA FORME EST CELLE DU BARREAU, et le nombre de
      // divergents vaut TOUJOURS 1: une fusion reprend UNE personne, jamais
      // deux. C'est très exactement ce qui rend la ligne de forme d'une fusion
      // byte-identique à celle d'avant le lot G.
      cooking: shape, divergingCount: shape === "one_dish" ? 0 : 1, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
      medicalMouths: [], crossContactUnnamedMedical: 0,
      // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
      kitchenEquipment: null,
      unmerge: null,
      // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
      dietBlock: "",
      notes: [],
      voices: [],
    }).userSuffix;

  assert(of("one_dish").includes("Do NOT propose separate dishes."));
  for (const shape of ["one_session", "separate_sessions"] as const) {
    assert(
      !of(shape).includes("Do NOT propose separate dishes."),
      `${shape}: le brief interdit encore le second plat que la fusion demande.`,
    );
  }
  assert(of("one_session").includes("SAME cooking session"));
  assert(of("separate_sessions").includes("OWN session"));
});

// ───────────────────────────────────────────────────────────────────────────
// L5/D8 — LA DÉFUSION
// ───────────────────────────────────────────────────────────────────────────

const UNMERGE_PROMPT = {
  displayName: "Zoe",
  window: { startsOn: "2026-08-14", durationDays: 3 },
  dishes: [{ day: "thu", slot: "dinner", title: "Curry de pois chiches" }],
  // C2 ④ — AUCUN TROU: l'identité, comme pour la fusion.
  gaps: [],
};

Deno.test("SANS DÉFUSION, LE PROMPT EST CELUI D'AVANT L5, À L'OCTET PRÈS", () => {
  // ⚠️ LE TEST QUI PROTÈGE LES DEUX CHEMINS QUI EXISTAIENT DÉJÀ. Le lot ajoute
  // un bloc; il doit être strictement invisible pour une composition ordinaire
  // ET pour une fusion. Sans cette assertion, chaque foyer du produit aurait
  // changé de consigne pour un geste que personne n'a fait.
  const plain = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  }).userSuffix;
  const merged = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  }).userSuffix;
  assert(!plain.includes("TAKING SOMEONE BACK OUT"));
  assert(!merged.includes("TAKING SOMEONE BACK OUT"));
  assert(
    plain.includes(
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    ),
    "la ligne historique du brief de portions a changé pour une composition " +
      "SANS défusion. C'est le contrat de composition de tout le produit.",
  );
});

Deno.test("le bloc de défusion entre APRÈS la présence et AVANT l'envie", () => {
  const presence = resolveWindowPresence({
    members: [
      { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([{ day: "sat" }]) },
      { memberId: "m-son", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["fri", "sat"],
  });
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: UNMERGE_PROMPT,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  // MÊME PLACE QUE LA FUSION, ET POUR LA MÊME RAISON: « untel ne mange plus
  // ici » est encore « qui mange quoi ». Les règles de maison restent EN
  // DERNIER — c'est ce qui leur permet de survivre à une envie contradictoire.
  const SECTIONS_WITH_UNMERGE = [
    "== THE HOUSEHOLD ==",
    "HOUSEHOLD SERVING PLAN",
    "WHO IS NOT AT THE TABLE",
    "TAKING SOMEONE BACK OUT OF THIS TABLE",
    "WHAT THIS HOUSEHOLD ASKED FOR",
    "HOUSE RULES",
  ];
  let cursor = -1;
  for (const marker of SECTIONS_WITH_UNMERGE) {
    const at = userSuffix.indexOf(marker);
    assert(at >= 0, `bloc « ${marker} » absent du prompt de défusion`);
    assert(
      at > cursor,
      `bloc « ${marker} » a changé de place. Bumpe HOUSEHOLD_PROMPT_VERSION ` +
        `(actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
    );
    cursor = at;
  }
});

Deno.test("UNE DÉFUSION NE DEMANDE JAMAIS UN SECOND PLAT", () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER. Une défusion RETIRE une
  // bouche: si le brief de portions basculait sur un barreau ②/③, le prompt
  // dirait « cuisine un plat séparé » pour quelqu'un qu'on vient de sortir de
  // la table — et le plafond de plats lui ouvrirait de la place.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: UNMERGE_PROMPT,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(
    userSuffix.includes(
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    ),
    "le brief de portions d'une défusion demande un plat séparé.",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// L6/D4 — LES VOIX DE CHAQUE TITULAIRE
// ───────────────────────────────────────────────────────────────────────────

const VOICES = [
  { memberId: "m-dad", displayName: "Marc", lines: ["hates broccoli"] },
  { memberId: "m-son", displayName: "Tom", lines: ["no porridge in the morning"] },
];

Deno.test("SANS VOIX, LE PROMPT EST CELUI D'AVANT L6, À L'OCTET PRÈS", () => {
  // ⚠️ LE TEST QUI PROTÈGE LE CHEMIN MAJORITAIRE — « l'entrée du produit est à
  // 1 ». Un foyer où personne n'a rien confirmé ne doit pas changer de consigne
  // pour un lot qui ne le concerne pas. C'est aussi ce qui rend le bump de
  // version lisible: il ne parle QUE des foyers dont au moins une bouche parle.
  const base = {
    // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    // ⚠️ `as const` SUR LA FORME: sans lui l'objet porte `cooking: string`, et
    // `CookingShape` refuse une chaîne large. C'est le typecheck qui fait son
    // travail — la forme est une liste FERMÉE, et le rester est le sujet.
    cooking: "one_dish" as const, divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
  };
  const { userSuffix, voiceIssues, voicesHeard, voiceCounts } =
    buildHouseholdPromptBlocks({ ...base, voices: [] });
  assert(!userSuffix.includes("WHAT EACH PERSON HAS TOLD ME"));
  assertEquals(voiceIssues, []);
  assertEquals(voicesHeard, 0);
  assertEquals(voiceCounts.linesIn, 0);
  assertEquals(voiceCounts.linesUsed, 0);
  assertEquals(voiceCounts.perMember, []);

  // ⚠️ « À L'OCTET PRÈS » SE MESURE, IL NE SE DÉCLARE PAS. Mesuré en réel:
  // `prompt_chars` 3 274 sans voix contre 4 458 avec — le bloc coûte
  // EXACTEMENT 0 caractère quand il est vide, et pas « presque rien ».
  const empty = buildHouseholdPromptBlocks({
    ...base,
    notes: [],
    voices: [{ memberId: "m-dad", displayName: "Marc", lines: [] }],
  });
  assertEquals(
    empty.userSuffix.length,
    userSuffix.length,
    "une bouche qui n'a RIEN confirmé coûte des caractères au prompt: le bloc " +
      "vide n'est plus filtré, et le chemin majoritaire du produit change de " +
      "consigne pour un lot qui ne le concerne pas.",
  );
  assertEquals(empty.userSuffix, userSuffix);

  // ── ET LE POINT DE SÉCURITÉ, MESURÉ DE LA MÊME FAÇON ──────────────────
  // Un foyer dont TOUTES les lignes sont divulgantes rend le MÊME prompt qu'un
  // foyer muet, au caractère près: la ligne ne fuit ni par son texte, ni par la
  // longueur qu'elle laisserait derrière elle.
  const leaking = buildHouseholdPromptBlocks({
    ...base,
    notes: [],
    voices: [{
      memberId: "m-dad",
      displayName: "Marc",
      lines: ["Veut perdre du poids avant l'été.", "Elle pèse ses portions au gramme près."],
    }],
  });
  assertEquals(
    leaking.userSuffix,
    userSuffix,
    "une ligne divulgante a laissé une trace dans le prompt.",
  );
  assertEquals(leaking.voiceCounts.linesUsed, 0);
  assertEquals(leaking.voiceCounts.linesWithheld, 2);
});

Deno.test("le bloc des voix entre APRÈS la tablée et AVANT l'envie", () => {
  // L'ORDRE EST UNE CONSIGNE. Un goût est DURABLE: il se range du côté de ce
  // qui vaut toutes les semaines, avant « ce dont on a envie cette fois ». Et
  // les règles de maison restent EN DERNIER — sans quoi « Léa adore le
  // Nutella » se lirait comme plus contraignant que « on ne sert pas de Nutella
  // à Léa ».
  const { userSuffix, voicesHeard } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: "des pâtes",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: VOICES,
  });
  assertEquals(voicesHeard, 2);
  const SECTIONS_WITH_VOICES = [
    "== THE HOUSEHOLD ==",
    "HOUSEHOLD SERVING PLAN",
    "WHAT EACH PERSON HAS TOLD ME",
    "WHAT THIS HOUSEHOLD ASKED FOR",
    "HOUSE RULES",
  ];
  let cursor = -1;
  for (const marker of SECTIONS_WITH_VOICES) {
    const at = userSuffix.indexOf(marker);
    assert(at >= 0, `bloc « ${marker} » absent du prompt`);
    assert(
      at > cursor,
      `bloc « ${marker} » a changé de place. L'ordre est une consigne — bumpe ` +
        `HOUSEHOLD_PROMPT_VERSION (actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
    );
    cursor = at;
  }

  // LE COMPTE, comme pour la composition sans fusion: une liste blanche ne voit
  // jamais arriver le bloc qu'elle n'énumère pas.
  // LOT 4 — 16 → 17, même cause qu'au test sans voix: le protocole des boîtes.
  const PARTS_WITH_VOICES = 17;
  assertEquals(
    userSuffix.split("\n\n").length,
    PARTS_WITH_VOICES,
    `le prompt du foyer AVEC VOIX ne compte plus ${PARTS_WITH_VOICES} blocs. ` +
      `Bumpe HOUSEHOLD_PROMPT_VERSION (actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
  );

  // ⚠️ ET LA VERSION A DÛ BOUGER AVEC LE BLOC. Sans cette assertion, ce lot
  // pourrait livrer un bloc de plus sous le numéro de L5 — et deux plans
  // stampés pareil porteraient des consignes différentes, exactement le défaut
  // mesuré le 2026-08-12 que le second axe de version existe pour empêcher.
  for (const past of ["v2_presence", "v3_merge", "v4_merge_budget", "v5_unmerge"]) {
    assert(
      HOUSEHOLD_PROMPT_VERSION !== past,
      `le bloc des voix existe sous la version ${past}: bumpe ` +
        `HOUSEHOLD_PROMPT_VERSION.`,
    );
  }

  // ET APRÈS LA FUSION, qui parle encore de « qui est à cette table ».
  const withMerge = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: VOICES,
  }).userSuffix;
  assert(
    withMerge.indexOf("BRINGING SOMEONE BACK") <
      withMerge.indexOf("WHAT EACH PERSON HAS TOLD ME"),
    "les voix passent avant le bloc de fusion: « untel revient à table » se " +
      "lirait comme une conséquence de ce que quelqu'un a dit.",
  );
});

Deno.test("LA GARDE DE NON-DIVULGATION EST DANS LE CONSTRUCTEUR, PAS EN AMONT", () => {
  // ⚠️ C'EST LE POINT LE PLUS FACILE À RATER DE TOUT LE LOT. Si le filtre vivait
  // chez l'appelant, il suffirait qu'un appelant l'oublie — ou qu'un second
  // appelant apparaisse — pour que le plan du foyer devienne l'endroit où tout
  // le monde apprend qu'une personne a repris un régime. Rien n'échouerait: un
  // prompt n'a pas de compilateur.
  const { userSuffix, voiceIssues } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [
      {
        memberId: "m-son",
        displayName: "Tom",
        lines: ["Veut perdre du poids avant l'été.", "n'aime pas le poisson"],
      },
    ],
  });
  assert(!userSuffix.includes("perdre du poids"), "un objectif est entré dans le prompt");
  assert(
    voiceIssues.some((i) => i.startsWith("voice_line_withheld:m-son:")),
    "la coupe n'est pas tracée",
  );
  // LE CAS QUI PASSE, du même côté: une garde qui coupe tout est indiscernable
  // d'une garde qui marche.
  assert(userSuffix.includes("- n'aime pas le poisson"));
});

Deno.test("C2 ④ — LA CONSIGNE QUI DIT LE TROU N'EXISTE PAS SOUS UNE VERSION PASSÉE", () => {
  // ⚠️ CE QUE CE TEST GARDE, ET UNE MUTATION L'A EXIGÉ. C2 ajoute une TROISIÈME
  // liste aux blocs de fusion et de défusion — les cases que le plan montré ne
  // remplit pas — donc la population « fusion/défusion sur un plan troué » voit
  // un texte différent. Livrer ça sous `v7_merge_anchor` ferait deux plans
  // stampés pareil portant des consignes différentes: le défaut exact que le
  // second axe de version existe pour empêcher, mesuré à L2.
  //
  // LES AUTRES POPULATIONS NE CHANGENT PAS D'UN OCTET (`gaps: []` est
  // l'identité), et les trois tests d'octet ci-dessus le tiennent.
  for (
    const past of [
      "v2_presence",
      "v3_merge",
      "v4_merge_budget",
      "v5_unmerge",
      "v6_voices",
      "v7_merge_anchor",
    ]
  ) {
    assert(
      HOUSEHOLD_PROMPT_VERSION !== past,
      `la consigne qui NOMME le trou d'un plan montré existe sous la version ` +
        `${past}: bumpe HOUSEHOLD_PROMPT_VERSION.`,
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
// C6 — LE COMPTE DE PLATS DÉDIÉS, ET LA MATIÈRE QUI S'OUVRE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C6 — LE COMPTE ET LA MATIÈRE ARRIVENT DANS LE VRAI PROMPT", () => {
  // ⚠️ CE QUI EST MESURÉ AVANT CE CORRECTIF, sur la fusion réelle qui suivait
  // C1: neuf titres du foyer sur neuf conservés (c'est bien), UN seul plat
  // dédié pour NEUF créneaux, et ce plat était le petit-déjeuner DU FOYER en
  // portion simple. Zéro aliment de son plan — ni dans les plats, ni dans les
  // 37 lignes de courses. Un test sur le module pur ne suffit pas: les deux
  // moitiés doivent ARRIVER dans le suffixe que le générateur envoie.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    // G5 — la forme vient de l'APPELANT. `one_dish` + 0 divergent est le
    // contrat historique du foyer, donc le prompt d'avant le lot G.
    cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(
    userSuffix.includes("9 dishes for"),
    "le NOMBRE de plats dédiés n'arrive pas dans le prompt: « ADD ONE dish » " +
      "se relit « un pour la fenêtre », et c'est ce qui a été mesuré.",
  );
  assert(userSuffix.includes("at EVERY meal they eat here"));
  assert(
    userSuffix.includes(MERGE_MATERIAL_USE_INSTRUCTION),
    "rien n'oblige à ouvrir la liste de matière: le plat dédié peut rester un " +
      "plat du foyer en portion simple.",
  );
  assert(
    userSuffix.includes("the protein and the starch"),
    "les axes du conflit n'arrivent pas: rien ne dit CE QUI doit être " +
      "différent dans son plat.",
  );
  // ⚠️ ET L'ANCRE DE C1 EST ENTIÈRE. Un troisième coup de balancier serait pire
  // que les deux précédents, parce qu'il aurait l'air d'une correction.
  assert(userSuffix.includes(MERGE_ANCHOR_INSTRUCTION));
  assert(
    userSuffix.lastIndexOf("Gratin de courgettes") >
      userSuffix.lastIndexOf("Curry de pois chiches"),
    "le plan du foyer n'est plus la dernière LISTE lue: C1 est défait.",
  );
});

Deno.test("C6 — LE BRIEF DE PORTIONS NE PROMET PLUS « never more than two »", () => {
  // ⚠️ LES DEUX MOITIÉS DU DÉFAUT, ET ELLES SONT DANS LE MÊME PROMPT. Le bloc
  // de fusion peut demander neuf plats dédiés: si le brief de portions, deux
  // blocs plus haut, dit « give them a SECOND dish […] Never more than two »,
  // le prompt se contredit — et c'est la ligne de forme, plus proche du début,
  // que le modèle a suivie.
  const of = (shape: "one_dish" | "one_session" | "separate_sessions") =>
    buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      members: [DAD, SON],
      envyLine: null,
      restrictions: [],
      presence: NOBODY_AWAY,
      merge: { ...MERGE_PROMPT, shape },
      // G5 — SUR UNE FUSION, LA FORME EST CELLE DU BARREAU, et le nombre de
      // divergents vaut TOUJOURS 1: une fusion reprend UNE personne, jamais
      // deux. C'est très exactement ce qui rend la ligne de forme d'une fusion
      // byte-identique à celle d'avant le lot G.
      cooking: shape, divergingCount: shape === "one_dish" ? 0 : 1, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
      medicalMouths: [], crossContactUnnamedMedical: 0,
      // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
      kitchenEquipment: null,
      unmerge: null,
      // R4 — aucun régime déclaré: le bloc est vide et le prompt est celui d'avant.
      dietBlock: "",
      notes: [],
      voices: [],
    }).userSuffix;
  for (const shape of ["one_session", "separate_sessions"] as const) {
    assert(
      !of(shape).includes("Never more than two."),
      `${shape}: le brief promet encore DEUX plats pour toute la fenêtre.`,
    );
    assert(
      of(shape).includes("at EVERY meal they eat here they get"),
      `${shape}: le brief ne dit pas que le plat dédié est PAR REPAS.`,
    );
  }
  // ⚠️ LE CAS QUI PASSE, ET IL EST LE CONTRAT DE TOUT LE PRODUIT: le barreau ①
  // — c'est-à-dire toute composition ordinaire et toute défusion — rend la
  // ligne historique, mot pour mot.
  assert(
    of("one_dish").includes(
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    ),
  );
});

Deno.test("C6 — LA CONSIGNE COMPTÉE N'EXISTE PAS SOUS UNE VERSION PASSÉE", () => {
  // ⚠️ TROIS CHOSES CHANGENT DANS LE TEXTE SERVI À LA POPULATION DES FUSIONS:
  // la ligne de forme du brief (②/③), le NOMBRE de plats dédiés, et un
  // paragraphe de plus en fin de bloc. Livrer ça sous `v8_plan_gaps` ferait
  // deux plans stampés pareil portant des consignes différentes — le défaut
  // exact que le second axe de version existe pour empêcher, mesuré à L2.
  for (
    const past of [
      "v2_presence",
      "v3_merge",
      "v4_merge_budget",
      "v5_unmerge",
      "v6_voices",
      "v7_merge_anchor",
      "v8_plan_gaps",
    ]
  ) {
    assert(
      HOUSEHOLD_PROMPT_VERSION !== past,
      `la consigne qui COMPTE les plats dédiés existe sous la version ${past}: ` +
        `bumpe HOUSEHOLD_PROMPT_VERSION.`,
    );
  }
});

Deno.test("SANS RÉGIME, LE PROMPT EST CELUI D'AVANT v11, À L'OCTET PRÈS", () => {
  // ⚠️ LE TEST QUI PROTÈGE LE CHEMIN MAJORITAIRE — et il ne peut PAS être fait
  // par un run réel: le code est déjà changé, il n'y a plus de « avant » à
  // interroger. C'est une preuve UNITAIRE, et elle s'écrit comme telle.
  //
  // Un foyer où personne n'a répondu à « comment vous mangez » ne doit pas
  // changer d'un octet pour un lot qui ne le concerne pas.
  const base = {
    // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    cooking: "one_dish" as const, divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    notes: [],
    voices: [],
  };
  const silent = buildHouseholdPromptBlocks({ ...base, dietBlock: "" });
  assert(!silent.userSuffix.includes("WHAT THE SHARED DISH MUST RESPECT"));
  assert(!silent.userSuffix.includes("VEGETARIAN"));
  assert(!silent.userSuffix.includes("VEGAN"));

  // ⚠️ « À L'OCTET PRÈS » SE MESURE, IL NE SE DÉCLARE PAS. Le bloc vide doit
  // coûter EXACTEMENT 0 caractère, pas « presque rien »: un `""` qui
  // traverserait le `filter` laisserait deux sauts de ligne derrière lui, et le
  // prompt de tout le monde changerait pour un lot que personne n'a demandé.
  const blank = buildHouseholdPromptBlocks({ ...base, dietBlock: "   " });
  assertEquals(blank.userSuffix.length, silent.userSuffix.length);
  assertEquals(blank.userSuffix, silent.userSuffix);

  // ET LA GARDE A UN CAS QUI PASSE: dès qu'un régime est déclaré, le bloc entre.
  const declared = buildHouseholdPromptBlocks({
    ...base,
    dietBlock: householdDietBlock({
      strictest: "vegetarian",
      heldBy: ["Christèle"],
      divergingNames: [],
    }),
  });
  assert(declared.userSuffix.includes("WHAT THE SHARED DISH MUST RESPECT"));
  assert(declared.userSuffix.length > silent.userSuffix.length);
});

Deno.test("le régime passe AVANT les règles de maison, qui restent DERNIÈRES", () => {
  // ⚠️ L'INVARIANT APPARTIENT AU LOT QUI A POSÉ `restrictionBlock`: « le modèle
  // lit la contrainte la plus proche de la fin comme la plus contraignante ».
  // Le bloc de régime est dans le groupe des VERROUS — il doit survivre à une
  // envie de la semaine qui le contredirait — mais il ne prend PAS la dernière
  // place: la lui donner démoterait en silence la seule consigne qui doit
  // survivre à tout, depuis un lot qui n'en a pas besoin.
  const { userSuffix } = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON], envyLine: "on a envie de bœuf bourguignon",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "pas de Nutella" }],
    presence: NOBODY_AWAY, merge: null,
    cooking: "one_dish" as const, divergingCount: 0, weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    notes: [],
    voices: [],
    dietBlock: householdDietBlock({
      strictest: "vegan",
      heldBy: ["Christèle"],
      divergingNames: [],
    }),
  });
  const diet = userSuffix.indexOf("WHAT THE SHARED DISH MUST RESPECT");
  const envy = userSuffix.indexOf("bœuf bourguignon");
  const house = userSuffix.indexOf("pas de Nutella");
  assert(diet > 0 && envy > 0 && house > 0, userSuffix);
  assert(envy < diet, "le régime doit survivre à l'envie de la semaine");
  assert(diet < house, "les règles de maison restent les dernières");
});

// ---------------------------------------------------------------------------
// LOT C — LE BLOC « WHOSE DISH IS IT », ET SA PRÉMISSE
// ---------------------------------------------------------------------------

Deno.test("LOT C — sans porteur, le prompt est BYTE-IDENTIQUE à v11", () => {
  // ⛔ LA PRÉMISSE, ET ELLE COMPTE AUTANT QUE LE BLOC. Servi à un foyer au
  // barreau ① — « Do NOT propose separate dishes » — ce bloc apprendrait au
  // modèle qu'un plat peut appartenir à quelqu'un, et l'inviterait à en marquer
  // un. C'est le raisonnement de `buildPortionBrief` sur `anyHabit`/`anyRhythm`,
  // mot pour mot: on n'énonce pas une contrainte que personne n'a posée.
  const base = {
    // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    cooking: "one_dish" as const,
    divergingCount: 0, weightGroups: 1,
    unmerge: null,
    dietBlock: "",
    notes: [],
    voices: [],
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    // C1 — aucune bouche médicale: le bloc de contamination croisée ne sort
    // pas, et le prompt reste celui d'avant ce lot au caractère près.
    medicalMouths: [], crossContactUnnamedMedical: 0,
  };
  const sans = buildHouseholdPromptBlocks({ ...base, dishBearers: [], dedicatedDishesAsked: 0 });
  assert(
    !sans.systemSuffix.includes("WHOSE DISH IS IT"),
    "le bloc d'attribution est servi à un foyer qui n'a aucun plat dédié.",
  );
  assert(
    !sans.systemSuffix.includes("for_member_id"),
    "le champ d'attribution est annoncé sans qu'aucun plat ne soit attribuable.",
  );
});

Deno.test("LOT C — avec un porteur, le bloc nomme la bouche et SON id exact", () => {
  // ⚠️ LE CAS QUI PASSE. Une garde qu'on ne sait pas faire dire « oui » bloque
  // tout en ressemblant à une garde qui marche.
  const out = buildHouseholdPromptBlocks({
    // LOT C ② — personne ne porte de règle à cette table: aucun des deux
    // blocs n'est servi, et le prompt est byte-identique à v18.
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    cooking: "one_session" as const,
    divergingCount: 1, weightGroups: 1,
    dishBearers: [{ memberId: "m-son", displayName: "Théo" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    unmerge: null,
    dietBlock: "",
    notes: [],
    voices: [],
  });
  assert(out.systemSuffix.includes("WHOSE DISH IS IT"), out.systemSuffix);
  assert(out.systemSuffix.includes("for_member_id"), out.systemSuffix);
  // L'ID EXACT, pas le prénom seul: c'est un jeton, pas un texte à rapprocher.
  assert(out.systemSuffix.includes("Théo = m-son"), out.systemSuffix);
  // ⛔ ET LE DÉFAUT EST DIT: un plat sans marque est celui de la table. Sans
  // cette phrase, un modèle zélé marquerait tous les plats et l'attribution
  // retirerait le dîner de la table à tout le monde sauf un.
  assert(
    out.systemSuffix.includes("no for_member_id is the table's dish"),
    out.systemSuffix,
  );
});

// ---------------------------------------------------------------------------
// LOT 3C — L'ORDRE DU PLAT DÉDIÉ, À CÔTÉ DE LA PROMESSE
//
// ⛔ CE QUI A ÉTÉ MESURÉ, ET QUI OUVRE CE LOT. Sur les DOUZE générations de
// foyer servies en v12 (archive `llm_raw_response_events`, 2026-08-15 →
// 2026-08-17): 291 plats, et ONZE runs sur douze n'ont composé qu'UN SEUL plat
// par repas. La divergence de la bouche marquée partait entièrement dans
// `member_portions`. Le douzième a écrit `for_member_id` — sur la bouche qui
// porte une HABITUDE, pas sur le porteur — et le parseur l'a refusé.
//
// v12 avait la moitié SCHÉMA (prompt système, « may carry one more key ») et
// pas la moitié CONSIGNE. `member_portions`, lui, a les deux — schéma système
// ET ordre utilisateur avec les ids exacts — et il est rempli 100 % du temps.
// ---------------------------------------------------------------------------

const BEARER_BASE = {
  members: [DAD, SON],
  envyLine: null,
  restrictions: [],
  presence: NOBODY_AWAY,
  merge: null,
  cooking: "one_session" as const,
  divergingCount: 1, weightGroups: 1,
  unmerge: null,
  dietBlock: "",
  notes: [],
  voices: [],
  dedicatedDishesAsked: 3,
  medicalMouths: [], crossContactUnnamedMedical: 0,
  // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
  kitchenEquipment: null,
  // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
  ruleHolders: [],
  // ③ — AUCUNE TRADITION, et c'est la prémisse de toutes les assertions
  // d'octet de ce fichier: un foyer qui n'en pose pas ne doit pas voir une
  // ligne de plus dans son prompt.
  traditions: [],
  daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
};

Deno.test("LOT 3C — sans porteur, le message utilisateur ne parle d'AUCUN plat dédié", () => {
  // ⛔ LA PRÉMISSE, ET ELLE VAUT AUTANT QUE LE BLOC — la même que celle de v12,
  // étendue au message utilisateur: apprendre à un modèle qu'un plat peut
  // appartenir à quelqu'un, dans un prompt où personne n'y a droit, est
  // l'invitation qu'on veut éviter.
  const sans = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    cooking: "one_dish",
    divergingCount: 0, weightGroups: 1,
    dishBearers: [], dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(
    !sans.userSuffix.includes("A DISH OF THEIR OWN"),
    "le bloc d'ordre est servi à un foyer qui n'a aucun plat dédié.",
  );
  assert(
    !sans.userSuffix.includes("for_member_id"),
    "la clé d'attribution est nommée dans un prompt où rien n'est attribuable.",
  );
  assert(
    !sans.systemSuffix.includes("for_member_id"),
    "le schéma d'attribution est servi sans porteur.",
  );
  // ⚠️ ET LA LIGNE HISTORIQUE DU BRIEF N'A PAS BOUGÉ D'UN OCTET — c'est le
  // contrat de composition de tout le produit, et le chemin majoritaire.
  assert(
    sans.userSuffix.includes(
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    ),
    sans.userSuffix,
  );
});

Deno.test("LOT 3C — avec un porteur, l'ORDRE est dans le message utilisateur, avec l'id exact", () => {
  // ⚠️ LE CAS QUI PASSE. Une garde qu'on ne sait pas faire dire « oui » bloque
  // tout en ressemblant à une garde qui marche.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(out.userSuffix.includes("== A DISH OF THEIR OWN =="), out.userSuffix);
  // L'ID EXACT, pas le prénom seul: c'est un jeton, pas un texte à rapprocher.
  assert(out.userSuffix.includes("Tom = m-son"), out.userSuffix);
  // DEUX PLATS À CE REPAS — c'est la chose que le modèle n'a pas faite onze
  // fois sur douze, et c'est donc la phrase qui porte le lot.
  assert(out.userSuffix.includes("write TWO dishes"), out.userSuffix);
  assert(out.userSuffix.includes('carries "for_member_id"'), out.userSuffix);
});

Deno.test("LOT 3C — l'ordre NOMME la sortie que le modèle prenait à la place", () => {
  // ⛔ LA PHRASE LA PLUS IMPORTANTE DU BLOC, et elle vient d'une mesure: le
  // modèle écrivait la divergence dans `member_portions` et s'arrêtait là. Une
  // consigne qui interdit sans nommer la sortie qu'on prend à sa place est une
  // consigne qu'on reprend.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(
    out.userSuffix.includes("A line in member_portions is NOT one of these dishes"),
    out.userSuffix,
  );
});

Deno.test("LOT 3C — l'ordre est COLLÉ au brief qui promet le plat, et avant les règles de maison", () => {
  // ⚠️ LA POSITION EST LA MOITIÉ DU LOT. En v12 la promesse était dans le
  // message utilisateur et la clé dans le prompt système: les deux moitiés ne se
  // rejoignaient nulle part. Et les règles de maison gardent la dernière place —
  // c'est le seul invariant de position que ce fichier protège.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    restrictions: [
      { memberId: "m-kid", memberDisplayName: "Léa", label: "Nutella" },
    ],
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  const brief = out.userSuffix.indexOf("HOUSEHOLD SERVING PLAN");
  const order = out.userSuffix.indexOf("== A DISH OF THEIR OWN ==");
  const rules = out.userSuffix.indexOf("HOUSE RULES");
  assert(brief >= 0 && order >= 0 && rules >= 0, out.userSuffix);
  assert(brief < order, "l'ordre passe avant la promesse qu'il exécute");
  assert(order < rules, "les règles de maison ne sont plus les dernières");
});

Deno.test("LOT 3C — le schéma système COMMANDE la clé, il ne la permet plus", () => {
  // ⛔ « may carry » A ÉTÉ MESURÉ COMME UNE PERMISSION QU'ON DÉCLINE: zéro
  // attribution retenue sur douze runs. Le mot compte, et un test le tient.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(out.systemSuffix.includes("WHOSE DISH IS IT"), out.systemSuffix);
  assert(out.systemSuffix.includes("MUST carry"), out.systemSuffix);
  assert(
    !out.systemSuffix.includes("may carry"),
    "le schéma est revenu à une permission",
  );
  // Le cas nominal reste dit: sans la clé, le plat est celui de la table.
  assert(
    out.systemSuffix.includes("no for_member_id is the table's dish"),
    out.systemSuffix,
  );
});

Deno.test("LOT 3C — DEUX porteurs sont nommés tous les deux, chacun avec SON id", () => {
  // La population au barreau ② PLURIEL existe depuis le 2026-08-14 (composition
  // ordinaire). Un bloc qui ne nommerait que le premier promettrait un plat à
  // quelqu'un que la consigne ne nomme pas — et la vue par personne le
  // retirerait alors à toute la table.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    divergingCount: 2, weightGroups: 1,
    dishBearers: [
      { memberId: "m-dad", displayName: "Marc" },
      { memberId: "m-son", displayName: "Tom" },
    ],
    dedicatedDishesAsked: 6,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(out.userSuffix.includes("Marc = m-dad"), out.userSuffix);
  assert(out.userSuffix.includes("Tom = m-son"), out.userSuffix);
  assert(out.systemSuffix.includes("Marc = m-dad"), out.systemSuffix);
  assert(out.systemSuffix.includes("Tom = m-son"), out.systemSuffix);
});

Deno.test("LOT 3C — l'ordre dit COMBIEN de plats, et le nombre vient de l'appelant", () => {
  // ⛔ LE NOMBRE EST LA MOITIÉ QUI A DÉJÀ MARCHÉ UNE FOIS. C6 (2026-08-12) a
  // remplacé « ADD ONE dish » par le NOMBRE dans `buildMergeBlock` après avoir
  // mesuré un seul plat rendu pour neuf créneaux. « at EVERY meal » sans compte
  // a reproduit le même silence un cran plus loin.
  //
  // ⚠️ TEST NON PARAMÉTRÉ PAR SA PROPRE CONSTANTE: deux appels, deux nombres
  // littéraux différents, et la sortie doit suivre. Un test qui relirait
  // `input.dedicatedDishesAsked` resterait vert sur un bloc qui n'écrit rien.
  const trois = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 3,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(trois.userSuffix.includes("That is 3 extra dishes"), trois.userSuffix);
  const vingtEtUn = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 21,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(vingtEtUn.userSuffix.includes("That is 21 extra dishes"), vingtEtUn.userSuffix);
  // ⚠️ LE SINGULIER EXISTE, et un « 1 extra dishes » se lit comme un gabarit
  // mort — le défaut « 1 servings » que ce dépôt traîne déjà ailleurs.
  const un = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 1,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(un.userSuffix.includes("That is 1 extra dish on top"), un.userSuffix);
});

Deno.test("LOT 3C — un compte à ZÉRO avec un porteur ne réclame JAMAIS zéro plat", () => {
  // ⚠️ LE CAS DE CONTRADICTION D'APPELANT. Un bloc qui dirait « 0 extra dishes »
  // pendant que la ligne de forme en promet un à chaque repas serait deux ordres
  // opposés dans le même prompt — la faute que ce fichier passe son temps à
  // interdire. Le plancher est 1, comme `dedicatedDishesFor`.
  const out = buildHouseholdPromptBlocks({
    ...BEARER_BASE,
    dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
    dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
  });
  assert(!out.userSuffix.includes("That is 0 extra"), out.userSuffix);
  assert(out.userSuffix.includes("That is 1 extra dish on top"), out.userSuffix);
});

Deno.test("LOT 4 — la version de la lane foyer a bougé d'UN cran", () => {
  // La règle est « quelle POPULATION voit une consigne différente ». Au LOT 3C
  // c'étaient les foyers où une bouche reçoit un plat à elle; au LOT 4 ce sont
  // les foyers d'AU MOINS DEUX BOUCHES, qui voient le protocole des boîtes —
  // deux moitiés, `boxSchemaBlock` côté système et `boxingOrderLines` dans le
  // brief.
  //
  // ⚠️ ET CETTE FOIS LE TRONC BOUGE AUSSI, ce qui n'est PAS un doublon: il porte
  // l'autre moitié de P4 — les quantités du jour, pesées ou dénombrées — que
  // les quatre populations voient. Deux changements, deux portées, deux axes.
  //
  // ⚠️ LOT 4C (2026-08-17) — UN CRAN DE PLUS, ET LA POPULATION S'ÉLARGIT. v15
  // porte deux consignes que v14 n'avait pas dites: le GRAMME dans la note lue
  // à table (93 notes réelles, zéro gramme) et « exactement une boîte par
  // bouche » (13 bouches en double, 3 sans boîte, mesurées). La première vit
  // dans le brief COMMUN — un foyer d'UNE bouche la voit aussi — donc la
  // population de v15 est « tous les foyers », pas « les foyers d'au moins deux
  // bouches ». Le tronc, lui, ne gagne pas un octet: il reste à v11.
  //
  // ⚠️ L7 (2026-08-18) — UN CRAN DE PLUS, DEUX BLOCS, DEUX POPULATIONS NEUVES.
  // v16 ajoute `THIS KITCHEN` (les foyers qui ont déclaré ce qu'ils n'ont pas —
  // 0 ligne sur 175 au 2026-08-18) et `A MEAL EATEN OUT IS NOT AN ABSENCE` (les
  // foyers où quelqu'un mange dehors). Les deux sont muets sans donnée, et deux
  // tests tiennent l'égalité de chaîne. Le tronc bouge AUSSI dans le même lot,
  // pour le NOM d'un plat, que les quatre populations voient: deux portées,
  // deux axes.
  // ⚠️ D1b (2026-08-18) — UN SEUL AXE BOUGE, ET C'EST L'ENVELOPPE FOYER.
  // `v17_what_each_mouth_already_has`: la lane foyer passait `fixedIntakes: []`
  // EN DUR sur ses trois sites, donc le shaker qu'une bouche déclare
  // n'atteignait jamais la consigne. Aucun bloc de l'enveloppe ne change — ce
  // qui change est un PARAMÈTRE DU TRONC que cette lane laissait vide — et le
  // tronc, lui, ne gagne pas un octet: il reste à `meal.en.v12_a_dish_has_a_name`.
  // Population concernée: les foyers où une bouche ATTABLÉE a un compte ET a
  // déclaré un apport. Ailleurs, prompt byte-identique à v16.
  // ⚠️ LOT D (2026-08-19) — `v18_what_they_feel_like_this_time`: le champ
  // d'envie de l'écran de composition ne traversait pas jusqu'au tronc. Même
  // forme que v17 — un PARAMÈTRE du tronc que la lane laissait vide — et aucun
  // bloc de ce fichier ne bouge.
  // ⚠️ LOT C ② (2026-08-19) — `v19_a_why_names_no_ones_rule`: DEUX blocs neufs,
  // et cette fois ils sont bien dans cette enveloppe-ci. La moitié consigne dit
  // qu'un `why` ne nomme la règle de personne (mesuré: 3 `why` sur 8
  // attribuaient l'évitement du gluten à quelqu'un qui n'a aucune contrainte);
  // la moitié schéma déclare `why_rule_of` et sa liste fermée. Population
  // concernée: les foyers où au moins une bouche porte une règle. `[]` ⇒ les
  // deux blocs tombent du `filter` et le prompt est byte-identique à v18 —
  // c'est ce que tient le test d'égalité de chaîne juste en dessous. Le tronc
  // ne gagne pas un octet.
  // ⚠️ 2026-08-19 — `v20_the_box_belongs_to_the_meal`: LES DEUX MOITIÉS DU
  // PROTOCOLE DES BOÎTES CHANGENT ENSEMBLE. Le schéma déplace `boxes` de la
  // préparation vers le PLAT et lui donne une part par nom; la consigne cesse de
  // compter des bouches par casserole et compte des REPAS. Population inchangée
  // depuis v14: les foyers d'au moins deux bouches. Le tronc bouge AUSSI
  // (`meal.en.v17`), pour la ligne des jetons que les quatre populations voient:
  // deux portées, deux axes, comme au LOT 4.
  // ⚠️ D3′-c (2026-08-23) — `v22_precedence_in_tail`, ET LE BUMP EST EN RETARD
  // D'UN JOUR. `D3′` (2026-08-22 18:51) a réécrit le bloc d'arbitrage de la lane
  // foyer — passé en QUEUE du message, rang 1 qui NOMME ses trois blocs de
  // verrou au lieu de dire « at the VERY TOP » — et n'a pas touché ce jeton. Les
  // quatre épinglages de cette valeur sont restés VERTS: ils tiennent le jeton,
  // aucun ne le reliait au TEXTE. C'est ce que `precedence_binding_test.ts`
  // ferme. Population concernée: tous les foyers. Le TRONC ne bouge pas — le
  // texte de la lane SOLO a survécu octet pour octet, mesuré sur 243 prompts
  // archivés.
  // ⚠️ D6.2 (2026-09-03) — `v23_the_lunchbox_travels`: UN BLOC NEUF, et il
  // est bien dans cette enveloppe-ci. « Le déjeuner en semaine » demandait
  // gamelle ou dehors depuis le 2026-08-18; la branche `outside` avait un
  // effet (cinq midis `eating_out`), la branche `lunchbox` n'en avait AUCUN
  // — zéro lecteur — pendant que trois commentaires du dépôt promettaient
  // « transportable, et bon froid sans micro-ondes ». Population qui voit
  // une consigne différente: les foyers où au moins une bouche emporte sa
  // gamelle. Ailleurs, prompt byte-identique à v22, et un test le tient.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v23_the_lunchbox_travels");
});

// ===========================================================================
// L7 ① — CE QUE CETTE CUISINE N'A PAS
//
// ⛔ LA GARDE DU LOT VOISIN, REPRISE ICI PARCE QUE C'EST ICI QU'ELLE MORD.
// `null` (jamais demandé) et `[]` (rien) ne sont pas la même réponse, et
// `select count(*) filter (where practical_constraints ? 'kitchen_equipment')`
// rendait **0 sur 175** le 2026-08-18: lire l'absence comme « pas de four »
// retirerait le batch cooking et la congélation à 100 % du parc. C'est
// pourquoi ce fichier ne passe QUE par `missingKitchenTools()`, qui rend `[]`
// tant que rien n'est déclaré.
// ===========================================================================

const KITCHEN_BASE = {
  members: [DAD, SON],
  envyLine: "des pâtes",
  restrictions: [] as HouseholdRestriction[],
  presence: NOBODY_AWAY,
  merge: null,
  unmerge: null,
  cooking: "one_dish" as const,
  divergingCount: 0, weightGroups: 1,
  dishBearers: [],
  dedicatedDishesAsked: 0,
  medicalMouths: [], crossContactUnnamedMedical: 0,
  dietBlock: "",
  notes: [],
  voices: [],
  kitchenEquipment: null,
  // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
  ruleHolders: [],
  // ③ — AUCUNE TRADITION, et c'est la prémisse de toutes les assertions
  // d'octet de ce fichier: un foyer qui n'en pose pas ne doit pas voir une
  // ligne de plus dans son prompt.
  traditions: [],
  daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
};

Deno.test("L7 ① — jamais demandé: prompt BYTE-IDENTIQUE, et c'est 175 comptes sur 175", () => {
  const jamais = buildHouseholdPromptBlocks(KITCHEN_BASE);
  // ⛔ LE CAS QUI PASSE. Un foyer qui a TOUT coché n'a rien à interdire non
  // plus: les deux doivent rendre exactement le même prompt, sinon `null` est
  // en train de vouloir dire quelque chose.
  const tout = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: [
      "oven",
      "stovetop",
      "microwave",
      "freezer",
      "air_fryer",
      "pressure_cooker",
      "blender",
    ],
  });
  assertEquals(jamais.userSuffix, tout.userSuffix);
  assert(!jamais.userSuffix.includes("THIS KITCHEN"), jamais.userSuffix);
  assertEquals(jamais.kitchenMissing, []);
  assertEquals(tout.kitchenMissing, []);
  // ET LE SUFFIXE SYSTÈME NE BOUGE PAS NON PLUS: ce bloc ne demande aucun champ.
  assertEquals(jamais.systemSuffix, tout.systemSuffix);
});

Deno.test("L7 ① — ce qui manque est NOMMÉ, et seulement ce qui manque", () => {
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: ["stovetop", "microwave", "blender"],
  });
  assert(out.userSuffix.includes("== THIS KITCHEN =="), out.userSuffix);
  const line = out.userSuffix.split("\n").find((l) =>
    l.startsWith("This household does not have:")
  ) ?? "";
  // L'ORDRE EST CELUI DE LA LISTE FERMÉE, jamais celui des clics: deux
  // générations pour une même déclaration doivent servir le même octet.
  assertEquals(
    line,
    "This household does not have: an oven, a freezer, an air fryer, a pressure cooker.",
  );
  // ⛔ CE QU'IL A NE DOIT PAS ÊTRE INTERDIT.
  assert(!line.includes("a hob"), line);
  assert(!line.includes("a microwave"), line);
  assertEquals(out.kitchenMissing, [
    "oven",
    "freezer",
    "air_fryer",
    "pressure_cooker",
  ]);
});

Deno.test("L7 ① — les TROIS qui changent un plan ont leur conséquence écrite", () => {
  // Le §2.1 de la conception nomme les trois: sans four le batch n'a plus sa
  // raison d'être, sans congélateur la conservation longue n'existe pas, sans
  // micro-ondes le geste du jour J change de durée.
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: ["stovetop"],
  });
  assert(out.userSuffix.includes("No oven: nothing roasted"), out.userSuffix);
  assert(out.userSuffix.includes("No freezer: nothing is frozen"), out.userSuffix);
  assert(out.userSuffix.includes("No microwave: reheating means"), out.userSuffix);
  // ⚠️ ET LES QUATRE AUTRES SONT SEULEMENT NOMMÉS: une conséquence par outil
  // coûterait sept lignes de prompt sur une lane qui expire à quatre minutes.
  assert(!out.userSuffix.includes("No blender:"), out.userSuffix);
  assert(!out.userSuffix.includes("No air fryer:"), out.userSuffix);
});

Deno.test("L7 ① — la ligne du micro-ondes ne renvoie PAS à un four absent", () => {
  // Un prompt qui se contredit trois lignes plus haut est un prompt qu'on
  // tranche au hasard.
  const sansFour = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: ["stovetop"],
  });
  assert(
    sansFour.userSuffix.includes("No microwave: reheating means a pan,"),
    sansFour.userSuffix,
  );
  const avecFour = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: ["stovetop", "oven"],
  });
  assert(
    avecFour.userSuffix.includes("No microwave: reheating means a pan or the oven,"),
    avecFour.userSuffix,
  );
});

Deno.test("L7 ① — la cuisine est APRÈS l'envie, et AVANT le régime et les règles", () => {
  // ⚠️ C'EST UNE IMPOSSIBILITÉ PHYSIQUE: elle doit survivre à « on a envie d'un
  // gratin ». Mais elle ne prend la place NI du régime NI des règles de maison —
  // un four absent change comment on cuit, jamais ce qu'on a le droit de servir
  // à quelqu'un.
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    kitchenEquipment: ["stovetop"],
    dietBlock: "WHAT THE SHARED DISH MUST RESPECT\n- no meat",
    restrictions: [{
      memberId: "m-son",
      memberDisplayName: "Tom",
      label: "no nutella",
    }],
  });
  const order = [
    "WHAT THIS HOUSEHOLD ASKED FOR",
    "== THIS KITCHEN ==",
    "WHAT THE SHARED DISH MUST RESPECT",
    "HOUSE RULES",
  ];
  let cursor = -1;
  for (const marker of order) {
    const at = out.userSuffix.indexOf(marker);
    assert(at >= 0, `bloc « ${marker} » absent:\n${out.userSuffix}`);
    assert(
      at > cursor,
      `« ${marker} » a changé de place. L'ordre est une consigne — bumpe ` +
        `HOUSEHOLD_PROMPT_VERSION (actuellement ${HOUSEHOLD_PROMPT_VERSION}).`,
    );
    cursor = at;
  }
});

// ===========================================================================
// L7 ② — UN REPAS PRIS DEHORS N'EST PAS UNE ABSENCE
// ===========================================================================

/** Nina mange dehors mardi midi; Marc est là tout le temps. */
const NINA_OUT: WindowPresence = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    {
      memberId: "m-son",
      displayName: "Tom",
      away: parseMemberAway([
        { day: "tue", slots: ["lunch"], kind: "eating_out" },
      ]),
    },
  ],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue"],
});

/** Le même mardi midi, mais déclaré ABSENT. Le plan ne dit rien. */
const TOM_AWAY: WindowPresence = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    {
      memberId: "m-son",
      displayName: "Tom",
      away: parseMemberAway([{ day: "tue", slots: ["lunch"] }]),
    },
  ],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue"],
});

Deno.test("L7 ② — personne dehors: prompt BYTE-IDENTIQUE, et c'est le cas nominal", () => {
  const rien = buildHouseholdPromptBlocks(KITCHEN_BASE);
  assert(!rien.userSuffix.includes("EATEN OUT"), rien.userSuffix);
  assertEquals(rien.eatingOut, { mouths: 0, cells: 0 });
});

Deno.test("L7 ② — « dehors » et « absent » ne rendent PLUS le même prompt", () => {
  // ⛔ C'EST TOUT LE LOT, EN UN TEST. Les deux états retirent la part et font
  // descendre la casserole de la même façon — `presence.block` est identique.
  // Ce qui les sépare est ce que le produit DIT.
  const dehors = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    presence: NINA_OUT,
  });
  const absent = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    presence: TOM_AWAY,
  });
  assertEquals(
    NINA_OUT.block,
    TOM_AWAY.block,
    "la présence elle-même distingue déjà les deux: ce test ne mesure plus rien",
  );
  assert(dehors.userSuffix.includes("== A MEAL EATEN OUT IS NOT AN ABSENCE =="));
  assert(!absent.userSuffix.includes("EATEN OUT"), absent.userSuffix);
  assertEquals(dehors.eatingOut, { mouths: 1, cells: 1 });
  assertEquals(absent.eatingOut, { mouths: 0, cells: 0 });
});

Deno.test("L7 ② — le bloc est COLLÉ à la présence, et la position est la moitié du lot", () => {
  // La phrase que ce bloc corrige (« Tom not eating here -- cook for 1 instead
  // of 2 ») vient d'être écrite juste au-dessus. Les séparer remettrait la
  // promesse et sa correction à deux endroits du prompt — l'état exact que 3C a
  // mesuré à zéro effet.
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    presence: NINA_OUT,
  });
  // ⚠️ ON MESURE SUR LES OCTETS, pas sur un `split("\n\n")`: le bloc de présence
  // porte lui-même une ligne vide (en-tête, puis les lignes par jour), donc un
  // découpage par paragraphe le compterait pour deux et la garde se
  // décalerait sans rien prouver.
  const presenceAt = out.userSuffix.indexOf(NINA_OUT.block);
  const outAt = out.userSuffix.indexOf("== A MEAL EATEN OUT");
  assert(presenceAt >= 0 && outAt >= 0, out.userSuffix);
  assertEquals(
    outAt,
    presenceAt + NINA_OUT.block.length + 2,
    `le bloc « dehors » n'est plus collé à la présence — il y a ` +
      `${outAt - presenceAt - NINA_OUT.block.length - 2} octets entre les ` +
      `deux. Bumpe HOUSEHOLD_PROMPT_VERSION (actuellement ` +
      `${HOUSEHOLD_PROMPT_VERSION}).`,
  );
});

Deno.test("L7 ② — la case est nommée en PROSE, jour et moment", () => {
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    presence: NINA_OUT,
  });
  assert(out.userSuffix.includes("- Tom: Tuesday lunch"), out.userSuffix);
  // ET LA CONSIGNE DIT LES DEUX MOITIÉS: ne compose rien, et ce n'est pas une
  // absence.
  assert(out.userSuffix.includes("Compose NOTHING there"), out.userSuffix);
  assert(out.userSuffix.includes("these people are not away"), out.userSuffix);
});

Deno.test("L7 ② — ⛔ AUCUN CHIFFRE: le conseil chiffré n'est pas de ce lot", () => {
  // ⛔ CLAUSE C5 DU CONTRAT TCA. « Vise autour de 700 » appartient au lot qui
  // sait le calculer et aux cinq portes de `energy_gate.ts`. Un kcal écrit ici
  // traverserait le prompt sans qu'aucune porte n'ait tourné.
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    presence: NINA_OUT,
  });
  const start = out.userSuffix.indexOf("== A MEAL EATEN OUT");
  const block = out.userSuffix.slice(
    start,
    out.userSuffix.indexOf("\n\n", start),
  );
  assert(!/\d/.test(block), `un chiffre est entré dans le bloc:\n${block}`);
  assert(!/kcal|calorie/i.test(block), block);
});

Deno.test("L7 ② — une bouche que le prompt ne nomme pas n'est ni écrite ni comptée", () => {
  // ⚠️ SINON « le modèle a ignoré la consigne » et « la consigne ne la nommait
  // pas » se liraient pareil — le zéro ambigu que 3C a payé. `members` ne porte
  // ici que Marc: Tom mange son propre plan, ou il est absent toute la fenêtre.
  const out = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    members: [DAD],
    presence: NINA_OUT,
  });
  assert(!out.userSuffix.includes("EATEN OUT"), out.userSuffix);
  assertEquals(out.eatingOut, { mouths: 0, cells: 0 });

  // ⛔ ET LE CAS MIXTE, QUI EST LE SEUL À MESURER LE COMPTEUR. Le cas ci-dessus
  // sort par le retour anticipé « aucune ligne écrite »: il resterait vert si
  // le compteur se remettait à compter la SOURCE au lieu des lignes. Il faut
  // donc une bouche nommée ET une bouche ignorée dans le même prompt.
  const mixte = buildHouseholdPromptBlocks({
    ...KITCHEN_BASE,
    members: [DAD, SON],
    presence: resolveWindowPresence({
      members: [
        {
          memberId: "m-dad",
          displayName: "Marc",
          away: parseMemberAway([
            { day: "mon", slots: ["lunch"], kind: "eating_out" },
          ]),
        },
        {
          memberId: "m-son",
          displayName: "Tom",
          away: parseMemberAway([]),
        },
        {
          // Cette bouche-là n'est PAS dans `members`: le prompt ne la nomme
          // nulle part, donc la consigne ne lui promet rien.
          memberId: "m-ghost",
          displayName: "Nina",
          away: parseMemberAway([
            { day: "tue", slots: ["lunch"], kind: "eating_out" },
          ]),
        },
      ],
      rhythm: [
        { slot: "breakfast", size: null },
        { slot: "lunch", size: null },
        { slot: "dinner", size: null },
      ],
      windowDays: ["mon", "tue"],
    }),
  });
  // ⚠️ ON LIT LE BLOC, PAS TOUT LE SUFFIXE. Le bloc de PRÉSENCE nomme déjà les
  // absents par leur prénom (« Marc, Nina not eating here »), donc chercher
  // « Nina » dans tout le prompt accuserait le mauvais bloc.
  const start = mixte.userSuffix.indexOf("== A MEAL EATEN OUT");
  const block = mixte.userSuffix.slice(
    start,
    mixte.userSuffix.indexOf("\n\n", start),
  );
  assert(block.includes("- Marc: Monday lunch"), block);
  assert(!block.includes("Nina"), block);
  assert(!block.includes("m-ghost"), block);
  assertEquals(mixte.eatingOut, { mouths: 1, cells: 1 });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2026-08-19 — LES IDENTIFIANTS SONT DANS LE MESSAGE QUI LES RÉCLAME.
//
// ── LE DÉFAUT, MESURÉ SUR LA RÉPONSE ARCHIVÉE ─────────────────────────────
// Trois clés du prompt SYSTÈME demandent un `member_id`, et les trois
// disaient « the exact id given above ». Il n'y avait AUCUN id au-dessus: la
// liste des bouches vit dans le message UTILISATEUR (vérifié sur
// `llm_raw_response_events` — zéro uuid dans le prompt système, présents dans
// le message utilisateur).
//
// Le modèle a donc écrit le seul identifiant qu'il avait sous les yeux: le
// PRÉNOM. `member_ids: ["iku"]`, `member_portions[].member_id: "iku"`. Seize
// boîtes sur seize refusées, zéro consigne de portion gardée, zéro gramme à
// l'écran — pendant que chaque méthode disait « portionner dans les boîtes
// nommées ». Signalé: « je vois pas les boîtes nommées ».
//
// ⚠️ CE N'EST PAS UNE DÉSOBÉISSANCE: les 21 reprises portaient un `box_id` et
// chaque préparation portait ses deux boîtes. Il manquait la seule chose qu'on
// ne lui avait pas donnée DANS CE MESSAGE.
// ═══════════════════════════════════════════════════════════════════════════

function suffixesFor(members: PortionMember[]) {
  return buildHouseholdPromptBlocks({
    ruleHolders: [],
    // ③ — AUCUNE TRADITION: le prompt doit rester celui d'hier au caractère
    // près. C'est la contre-épreuve du lot, et elle vaut pour CHAQUE test de
    // ce fichier — c'est ce qui rend les assertions d'octet encore vraies.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    members,
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    cooking: "one_dish",
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    unmerge: null,
    dietBlock: "",
    notes: [],
    voices: [],
  });
}

Deno.test("⛔ le prompt SYSTÈME porte les ids exacts des bouches", () => {
  const { systemSuffix } = suffixesFor([DAD, SON]);
  assert(
    systemSuffix.includes("THE MEMBER IDS"),
    "la liste d'ids ne rejoint pas le schéma qui la réclame",
  );
  // Les ids EUX-MÊMES, pas une promesse qu'ils existent ailleurs.
  assert(systemSuffix.includes("m-dad"), "l'id de Marc manque au prompt système");
  assert(systemSuffix.includes("m-son"), "l'id de Tom manque au prompt système");
  // Et le prénom reste lisible à côté: sans lui, le modèle ne peut pas savoir
  // QUELLE bouche il sert quand le brief plus bas parle d'elle par son nom.
  assert(systemSuffix.includes("Marc"));
});

Deno.test("⛔ plus aucune clé ne renvoie à une liste d'un AUTRE message", () => {
  const { systemSuffix } = suffixesFor([DAD, SON]);
  // La formulation exacte qui a produit zéro. Elle pointait hors du message.
  assert(
    !systemSuffix.includes("exact ids from the list above"),
    "une clé renvoie encore à une liste qui n'est pas dans ce message",
  );
  assert(
    !systemSuffix.includes("exact id given above"),
    "une clé renvoie encore à une liste qui n'est pas dans ce message",
  );
  // ⛔ ET LE PRÉNOM EST NOMMÉ COMME L'ÉCHAPPATOIRE MESURÉE. Interdire en
  // général ne suffit pas: c'est CETTE substitution-là que le modèle a faite.
  assert(systemSuffix.includes("never a first name"));
});

Deno.test("⚠️ LE CAS QUI PASSE — une bouche seule et SANS objectif: aucun bloc d'ids", () => {
  // Le bloc d'ids sert à DISTINGUER des bouches entre elles: à une seule qui ne
  // vise rien, il n'a pas de sujet, et rien n'y renvoie.
  const calm = { ...DAD, goal: "maintenance" as const };
  const { systemSuffix } = suffixesFor([calm]);
  assert(!systemSuffix.includes("THE MEMBER IDS"), systemSuffix);
  assert(!systemSuffix.includes("m-dad"), systemSuffix);
});

Deno.test("⛔ un SOLO à objectif reçoit la liste d'ids — parce qu'un bloc y renvoie", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LA CICATRICE, RÉINTRODUITE PAR UN CAS NEUF LE JOUR MÊME OÙ ELLE A ÉTÉ
  // FERMÉE — et rattrapée par ce test.
  // ══════════════════════════════════════════════════════════════════════════
  // Le bloc des boîtes dit « ids from THE MEMBER IDS ». La liste ne sortait
  // qu'à partir de DEUX bouches. Depuis que la pesée se déclenche sur
  // l'OBJECTIF et plus sur la taille du foyer, un solo en `fat_loss` recevait
  // ce bloc — donc l'ordre d'utiliser un id « de la liste ci-dessus », sans
  // liste au-dessus. C'est exactement ce qui a fait écrire des PRÉNOMS au
  // modèle et jeter 16 boîtes sur 16 ce matin.
  const { systemSuffix } = suffixesFor([DAD]);
  assert(systemSuffix.includes("ONE BOX PER GROUP"), systemSuffix);
  assert(
    systemSuffix.includes("THE MEMBER IDS"),
    "un bloc renvoie à une liste qui n'est pas dans ce message",
  );
  // Et la liste porte bien l'id, pas seulement son titre.
  const roster = systemSuffix.slice(systemSuffix.indexOf("THE MEMBER IDS"));
  assert(roster.includes("m-dad"), roster);
});

Deno.test("⛔ aucun objectif à table ⇒ UN BAC COMMUN, ET AUCUNE PORTION MILLIMÉTRÉE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ CE TEST A ÉTÉ RENVERSÉ LE 2026-08-20, ET C'EST LE LOT v4.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Il disait: « un foyer entier qui se maintient ne reçoit AUCUN protocole ».
  // Son défaut, mesuré devant un frigo: « plat commun » ne disait ni combien de
  // bacs remplir dimanche, ni lequel ouvrir jeudi — il ne décidait rien pour
  // trois personnes sur quatre.
  //
  // Ce que la décision du 2026-08-19 protégeait — `maintenance` n'ouvre PAS de
  // portion millimétrée — est conservé en entier: le bloc sort, mais il ne
  // nomme personne « seul sur le couvercle », et les grammes qu'il demande
  // décrivent un RÉCIPIENT.
  const calm = { ...DAD, goal: "maintenance" as const };
  const calmSon = { ...SON, goal: "maintenance" as const };
  const { systemSuffix } = suffixesFor([calm, calmSon]);
  assert(systemSuffix.includes("ONE BOX PER GROUP"), systemSuffix);
  assert(systemSuffix.includes("exactly ONE"), systemSuffix);
  // ⛔ ET PERSONNE N'EST NOMMÉ SEUL SUR UN COUVERCLE: c'est ce qui reste de la
  // décision du 08-19, et c'est ce qu'il ne faut pas « réparer ».
  assertEquals(systemSuffix.includes("alone on the lid"), false, systemSuffix);
});

Deno.test("⛔ UN SOLO SANS OBJECTIF NE VOIT TOUJOURS AUCUN BLOC DE BOÎTES", () => {
  // Le plancher qui reste après v4: une seule bouche, aucun objectif. Il n'y a
  // ni groupe à former ni pesée demandée, et lui servir le bloc lui apprendrait
  // qu'un marquage par personne existe.
  const calm = { ...DAD, goal: "maintenance" as const };
  const { systemSuffix } = suffixesFor([calm]);
  assert(!systemSuffix.includes("ONE BOX PER GROUP"), systemSuffix);
  assert(!systemSuffix.includes('"boxes"'), systemSuffix);
});

Deno.test("⛔ le bloc nomme QUI a droit à une boîte, et personne d'autre", () => {
  // La moitié « consigne » d'une garde dont la moitié « parseur » est
  // `boxMemberIds`. Les deux doivent nommer la MÊME liste: un prompt qui
  // réclame une boîte pour tout le monde pendant que le parseur n'en accepte
  // que pour un produit un plan amputé en silence.
  const calmSon = { ...SON, goal: "maintenance" as const };
  const { systemSuffix } = suffixesFor([DAD, calmSon]);
  assert(systemSuffix.includes("ONE BOX PER GROUP"), systemSuffix);
  assert(systemSuffix.includes("m-dad"), systemSuffix);
  const block = systemSuffix.slice(systemSuffix.indexOf("ONE BOX PER GROUP"));
  // ⚠️ LA LIGNE QUI NOMME « SEUL SUR LE COUVERCLE » NE PORTE QUE LES OBJECTIFS.
  // Le fils en `maintenance` est dans le bac commun — il a bien un contenant,
  // il n'a simplement aucun nombre qui le vise.
  const named = block.slice(0, block.indexOf("Everyone else eating that meal"));
  assert(named.includes("alone on the lid"), named);
  assert(!named.includes("m-son"), `une bouche en maintenance est nommée: ${named}`);
  // ⛔ ET L'ÉCHAPPATOIRE MESURÉE EST NOMMÉE — elle a changé avec le modèle. Hier:
  // peser la tablée entière. Aujourd'hui: écrire une part par personne dans un
  // bac partagé, ce qui remettrait la balance au service (ce qui a tué v2).
  assert(block.includes("Do NOT write a per-person figure on a lid"), block);
  // ⛔ ET LA PHRASE DE v3 A DISPARU, MOT POUR MOT: « leaving them out is the
  // answer, not an omission » disait que les autres n'ont RIEN. v4 leur donne un
  // contenant nommé.
  assertEquals(block.includes("Nobody else does"), false, block);
  assertEquals(block.includes("not an omission"), false, block);
});
