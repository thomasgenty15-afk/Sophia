import { assert, assertEquals } from "jsr:@std/assert@1";

import type { PortionMember } from "./household_portions.ts";
import {
  buildHouseholdPromptBlocks,
  extractMemberPortions,
  type HouseholdRestriction,
} from "./household_meal_generation.ts";

const DAD: PortionMember = {
  memberId: "m-dad", displayName: "Marc", goal: "fat_loss", ageState: "adult",
  body: null,
};
const SON: PortionMember = {
  memberId: "m-son", displayName: "Tom", goal: "muscle_gain", ageState: "adult",
  body: null,
};
const KID: PortionMember = {
  memberId: "m-kid", displayName: "Léa", goal: null, ageState: "minor",
  body: null,
};

Deno.test("chaque membre apparaît avec son id EXACT, une fois", () => {
  // Le modèle doit rendre `member_portions` clé par user_id. Un id approximatif
  // fait tomber la consigne dans `portion_for_unknown_member` et la personne se
  // retrouve en part standard sans qu'on sache pourquoi.
  const { userSuffix } = buildHouseholdPromptBlocks({
    members: [DAD, SON, KID], envyLine: null, restrictions: [],
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
    members: [DAD, KID], envyLine: null, restrictions,
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
    members: [KID],
    envyLine: null,
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
    members: [KID],
    envyLine: "du nutella partout",
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
    members: [DAD], envyLine: null, restrictions: [],
  });
  assert(!userSuffix.includes("HOUSE RULES"));
});

Deno.test("le schéma supplémentaire n'est demandé que côté système", () => {
  const { systemSuffix, userSuffix } = buildHouseholdPromptBlocks({
    members: [DAD], envyLine: null, restrictions: [],
  });
  assert(systemSuffix.includes('"member_portions"'));
  assert(systemSuffix.includes("never a reason"));
  // Il ne doit PAS polluer le message utilisateur: le schéma est un contrat de
  // sortie, pas une donnée de la demande.
  assert(!userSuffix.includes('"member_portions"'));
});

Deno.test("le brief de portions et la ligne d'envies sont tous les deux là", () => {
  const { userSuffix, envyLineUsed } = buildHouseholdPromptBlocks({
    members: [DAD, SON],
    envyLine: "un curry, et Tom en a marre du poulet",
    restrictions: [],
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
    members: [DAD, SON], envyLine: null, restrictions: [],
  });
  assert(!userSuffix.includes("WHAT THIS HOUSEHOLD ASKED FOR"));
  assertEquals(envyLineUsed, false);
  // Et le décompte des silencieux ne revient pas par la bande: Tom n'a rien
  // écrit, et rien dans le prompt ne le lui reproche.
  assert(!userSuffix.toLowerCase().includes("did not say anything"));
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
