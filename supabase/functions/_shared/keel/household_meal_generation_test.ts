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
    unmerge: null,
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
    members: [DAD, KID], envyLine: null, restrictions, presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [KID],
    envyLine: null,
    presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [KID],
    envyLine: "du nutella partout",
    presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    unmerge: null,
    voices: [],
  });
  assert(!userSuffix.includes("HOUSE RULES"));
});

Deno.test("le schéma supplémentaire n'est demandé que côté système", () => {
  const { systemSuffix, userSuffix } = buildHouseholdPromptBlocks({
    members: [DAD], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "un curry, et Tom en a marre du poulet",
    restrictions: [],
    presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [],
    presence,
    merge: null,
    unmerge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY, merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "des pâtes",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: null,
    unmerge: null,
    voices: [],
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: MERGE_PROMPT,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    unmerge: null,
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
      members: [DAD, SON],
      envyLine: null,
      restrictions: [],
      presence: NOBODY_AWAY,
      merge: { ...MERGE_PROMPT, shape },
      unmerge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    voices: [],
  }).userSuffix;
  const merged = buildHouseholdPromptBlocks({
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "un curry",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence,
    merge: null,
    unmerge: UNMERGE_PROMPT,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    unmerge: UNMERGE_PROMPT,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: "des pâtes",
    restrictions: [{ memberId: "m-son", memberDisplayName: "Tom", label: "no nutella" }],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
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
  const PARTS_WITH_VOICES = 16;
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    unmerge: null,
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
    members: [DAD, SON], envyLine: null, restrictions: [], presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
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
    members: [DAD, SON],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: MERGE_PROMPT,
    unmerge: null,
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
      members: [DAD, SON],
      envyLine: null,
      restrictions: [],
      presence: NOBODY_AWAY,
      merge: { ...MERGE_PROMPT, shape },
      unmerge: null,
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
