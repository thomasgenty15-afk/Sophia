import { assert, assertEquals } from "jsr:@std/assert@1";

import type { PortionMember } from "./household_portions.ts";
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
    members: [DAD, SON, KID], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
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
    members: [DAD, KID], envyLine: null, restrictions, presence: NOBODY_AWAY, merge: null,
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
    presence: NOBODY_AWAY, merge: null,
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
    presence: NOBODY_AWAY, merge: null,
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
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
  });
  assert(!userSuffix.includes("HOUSE RULES"));
});

Deno.test("le schéma supplémentaire n'est demandé que côté système", () => {
  const { systemSuffix, userSuffix } = buildHouseholdPromptBlocks({
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
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
    presence: NOBODY_AWAY, merge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
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
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [],
    presence,
    merge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
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
    members: [DAD, SON],
    envyLine: "des pâtes",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: null,
  });

  // L'ORDRE EST UNE CONSIGNE, pas une mise en page: les règles de maison
  // passent en dernier pour survivre à une envie contradictoire, et la
  // présence colle au brief de portions parce que les deux disent « qui mange
  // quoi ». Déplacer l'un des deux change ce que le modèle rend.
  const SECTIONS_NO_MERGE = [
    "== THE HOUSEHOLD ==",
    "HOUSEHOLD SERVING PLAN",
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
  const PARTS_NO_MERGE = 15;
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
};

Deno.test("SANS FUSION, LE PROMPT EST CELUI D'AVANT L4, À L'OCTET PRÈS", () => {
  // ⚠️ LE TEST QUI PROTÈGE LE CHEMIN MAJORITAIRE. Le lot ajoute un bloc ET rend
  // variable la ligne « combien de plats » du brief; les deux doivent être
  // strictement invisibles pour une composition ordinaire. Sans cette
  // assertion, chaque foyer du produit aurait changé de consigne pour un geste
  // que personne n'a fait.
  const { userSuffix } = buildHouseholdPromptBlocks({
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
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
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: MERGE_PROMPT,
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

Deno.test("LE BARREAU DE L'ÉCHELLE CHANGE LA LIGNE « COMBIEN DE PLATS »", () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER: le bloc de fusion demande un
  // second plat pendant que le brief de portions, deux blocs plus haut,
  // l'interdit en toutes lettres. Deux consignes contradictoires dans le même
  // prompt, et c'est celle de la fin que le modèle suit — donc au hasard.
  const of = (shape: "one_dish" | "one_session" | "separate_sessions") =>
    buildHouseholdPromptBlocks({
      members: [DAD, SON],
      envyLine: null,
      restrictions: [],
      presence: NOBODY_AWAY,
      merge: { ...MERGE_PROMPT, shape },
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
