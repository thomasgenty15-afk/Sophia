// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — LA FORME D'UNE BOÎTE ET L'ORDRE DE PESER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// `buildPortionBrief`, qui appelle `boxingOrderLines`, reste dans
// `household_portions.ts`.
//
// Ce module n'importe qu'un type.

import type { PortionMember } from "./household_portion_types.ts";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA FORME D'UN COMPOSANT DE CONTENANT — ÉCRITE UNE FOIS, LUE PAR DEUX BLOCS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI ELLE VIT ICI, ET PAS DANS CHACUN DE SES DEUX LECTEURS. Deux
 * écritures de la même forme divergent au premier changement de clé, et c'est
 * celle qu'on regarde le moins qui garde l'ancienne. Ses deux lecteurs sont:
 *   · `boxSchemaBlock` (`household_meal_generation.ts`), la moitié SCHÉMA, dans
 *     le message SYSTÈME;
 *   · `householdDietBlock` (`household_diet.ts`), qui ORDONNE une seconde boîte
 *     quand une ligne alimentaire diverge à table, dans le message UTILISATEUR.
 *
 * ⛔ ET C'EST POURQUOI LE SECOND EN A BESOIN. Sous `sizingPath === "portion_v1"`
 * la moitié schéma n'est PAS servie — c'était le seul endroit du prompt qui
 * nommait la clé `grams`. Le bloc de régime, lui, part quand même. Mesuré au
 * caractère sur le tir réel N=2 du 2026-09-13: le modèle a écrit ses items dans
 * la seule forme qu'on lui enseignait, celle d'un INGRÉDIENT
 * (`amount`/`unit`/`ref`), et le lecteur les a tous refusés. C'est la cicatrice
 * « la promesse et la clé de schéma doivent se toucher »: un « comme plus haut »
 * ne traverse pas la frontière système↔utilisateur.
 *
 * ⚠️ LES LIGNES N'ONT AUCUNE INDENTATION PROPRE: chaque lecteur préfixe, parce
 * que l'une est imbriquée dans la forme `"boxes"` et l'autre est autonome. La
 * première ligne d'un rendu reçoit le préfixe, les suivantes le préfixe plus
 * leur propre décalage — c'est la seule chose que les deux ne partagent pas.
 */
export const BOX_ITEM_SCHEMA_LINES: readonly string[] = [
  '"items": [{ "preparation_id": "prep_x" or null,',
  '            "term": "what is in it",',
  '            "grams": <whole grams of READY food> }]',
];

/**
 * Les lignes de `BOX_ITEM_SCHEMA_LINES`, décalées d'un préfixe commun.
 *
 * ⛔ UN SEUL RENDU, PARCE QUE LE DÉCALAGE EST LA SEULE DIFFÉRENCE ENTRE LES DEUX
 * LECTEURS. L'écrire deux fois ferait deux indentations qui se mettraient à
 * diverger sans que rien ne le dise — et une forme JSON mal alignée est
 * exactement le genre de détail qu'un modèle recopie.
 */
export function boxItemSchemaLines(indent: string): readonly string[] {
  return BOX_ITEM_SCHEMA_LINES.map((l) => `${indent}${l}`);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — L'ORDRE DE PESER, LÀ OÙ LA MATIÈRE EST PROMISE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA POSITION EST LA MOITIÉ DU LOT, ET ELLE A UNE DATE. Le 2026-08-17, un
 * champ réclamé au modèle a été mesuré à ZÉRO déclaration sur 291 plats — non
 * pas parce que le modèle refusait, mais parce que la PROMESSE de la matière
 * vivait dans le message utilisateur pendant que la CLÉ du schéma vivait dans le
 * prompt système, sans rien pour les relier. Rapproché de sa promesse, avec le
 * NOMBRE attendu et l'échappatoire NOMMÉE, le même champ est passé à onze.
 *
 * Ici la promesse est ce brief-ci: « portions that differ », « how much of which
 * component goes on their plate ». L'ordre de peser doit donc être DEDANS, pas
 * dans un bloc voisin — et il l'est, juste avant les trois lignes de fin.
 *
 * Trois choses y sont load-bearing, chacune reprise d'une mesure:
 *
 *   ① LE NOMBRE. « ADD ONE dish » → le nombre exact avait déjà changé le
 *      résultat sur la lane fusion (C6, 2026-08-12), puis sur le plat dédié
 *      (LOT 3C). Ici c'est le nombre de BOUCHES à placer sur CHAQUE REPAS pris
 *      sur un lot. Il vient de `members.length` — la MÊME liste qui écrit les
 *      lignes juste au-dessus, jamais un second calcul.
 *   ② L'ÉCHAPPATOIRE, NOMMÉE. Le modèle a DÉJÀ un champ où ranger « qui mange
 *      combien »: `member_portions`, qui lui est demandé. Une consigne qui
 *      demande des grammes sans dire que la note de portion n'en est pas une
 *      est une consigne qu'il satisfait dans l'autre champ — c'est exactement ce
 *      qui a été capturé le 2026-08-17, la consigne renvoyée mot pour mot dans
 *      le mauvais champ.
 *   ③ LA BOÎTE PARTAGÉE EST LÉGITIME, ET DEPUIS LE 2026-08-19 ELLE EST LE CAS
 *      NOMINAL D'UN REPAS COMMUN. Sans cette phrase, un modèle obéissant
 *      fabriquerait un contenant par personne là où le foyer en remplit un — et
 *      c'est très exactement le contenant en moins qui est voulu. Ce qui compte
 *      est que chaque bouche attablée soit UNE part de la boîte de ce repas,
 *      jamais deux, jamais aucune.
 *
 * ⚠️ CE QUE ③ A CESSÉ DE DIRE, ET IL FAUT LE LIRE: « une boîte par casserole »
 * n'existe plus. Une boîte porte un REPAS ENTIER, toutes préparations confondues.
 * Un lecteur qui « répare » en redemandant une boîte par préparation rouvre les
 * trois défauts du run `76be8ce3` d'un seul geste.
 *
 * ⛔ ET AUCUN POURQUOI, JAMAIS. Le bloc ne dit pas d'où viennent les grammes: ce
 * sont des grammes d'ALIMENT dans une boîte, du même côté de la frontière que
 * « 400 g de cuisses de poulet » sur une liste de courses. Les trois lignes qui
 * SUIVENT ce bloc l'interdisent explicitement, et elles restent les dernières.
 *
 * ⚠️ MUET À UNE SEULE BOUCHE. Une part par personne n'a de sujet qu'à partir de
 * deux, et servir le bloc à un foyer d'un lui apprendrait qu'un marquage par
 * personne existe — le raisonnement de `anyHabit`/`anyRhythm` juste au-dessus,
 * quatrième fois. Un foyer à une bouche rend donc un brief byte-identique à
 * celui d'avant ce lot, et un test le tient.
 */
export function boxingOrderLines(
  members: readonly PortionMember[],
  /**
   * LES BOUCHES DONT L'OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE. REQUIS.
   *
   * ⛔ IL A REMPLACÉ `weightGroups` LE 2026-08-20, ET C'EST LE LOT. Le nombre de
   * poids différents que la table sert ne décide plus rien ici: ce qui décide
   * est QUI a demandé une portion à soi. `weightGroups` reste ailleurs dans
   * `buildPortionBrief`, où il gouverne autre chose.
   *
   * ⚠️ LA MÊME LISTE QUE `boxSchemaBlock` ET QUE `weighedMemberIds` CÔTÉ
   * PARSEUR — `weighedPortionMembers(members)`, appelée, jamais recopiée.
   */
  weighed: readonly PortionMember[],
): readonly string[] {
  if (members.length < 2) return [];
  const names = members.map((m) => m.displayName).join(", ");
  // ══ CE QUE LE NOMBRE COMPTE A CHANGÉ AVEC L'UNITÉ ════════════════════════
  //
  // ⚠️ MESURÉ, PAS SUPPOSÉ. Le levier du NOMBRE ATTENDU est la recette de ce
  // dépôt (0→11 plats, 0→38 % de notes), et il reste ici — mais il ne compte
  // plus « combien de boîtes par casserole ». Il compte **qui est sur les
  // couvercles de ce repas-ci**, parce que c'est là que le défaut n°1 vivait:
  // sur le run `76be8ce3`, `box_id` étant unique par reprise, le modèle pointait
  // la boîte d'UNE personne et orphelinait l'autre — Christèle n'aurait eu de
  // boîte à AUCUN repas, sur seize boîtes déclarées.
  //
  // ⛔ LE BLOC NE S'ALLONGE PAS. La lane foyer frôle le mur de temps du worker
  // (mesuré par 3C, reconfirmé par L7): ce qui est ajouté REMPLACE, il ne
  // s'empile pas, et les trois lignes « NEVER state a reason » restent les
  // dernières du brief.
  //
  // ══ CE QUI A DISPARU LE 2026-08-20, ET IL FAUT LE LIRE ═══════════════════
  //
  // ⛔ « Give every share of a meal the SAME ordinary figure -- one plate's
  // worth of that meal » ET SES TROIS LIGNES SONT PARTIES. Elles ordonnaient au
  // modèle le même chiffre pour tout le monde, et elles n'ont plus d'objet dès
  // lors que le commun est un BAC et non une somme de parts: il n'y a plus de
  // part par personne à uniformiser. Ne les remets pas « pour l'équité » — ce
  // qu'elles réparaient (le découpage par classe compté deux fois) n'existe plus
  // non plus, puisque plus personne d'autre qu'une bouche à objectif ne reçoit
  // un nombre qui la vise.
  //
  // ⛔ ET « grams is what THAT person takes out of the box » AUSSI. C'était la
  // lecture v2 du bac partagé — une part par nom sur un couvercle collectif,
  // c'est-à-dire la balance de retour au service.
  const weighedNames = weighed.map((m) => m.displayName).join(", ");
  const groupLines = weighedNames === ""
    ? [
      "Nobody here asked for a portion of their own, so that meal has exactly ONE",
      "box, with everyone who eats it named on the lid.",
    ]
    : [
      `These people each get a box of their OWN, alone on the lid: ${weighedNames}.`,
      "Everyone else who eats that meal shares ONE box, named with all of them.",
    ];
  return [
    "WEIGH IT ONCE, INTO BOXES NAMED BY MEAL.",
    "Nobody weighs anything at mealtime. Everything is weighed at the cooking",
    "session, straight into containers, and a meal later just takes its box out.",
    'Every dish that takes from a preparation carries "boxes": one container per',
    "GROUP of people eating that meal, each holding everything that group takes",
    "out -- all its preparations together in the same box, not one tub per pan.",
    `That is ${members.length} people to place at every such meal: ${names}. Each of`,
    "them who eats that meal is named on EXACTLY one of that meal's boxes --",
    "never two, never none.",
    ...groupLines,
    // ⛔ ET LA SEULE CHOSE QUI CHANGE ENTRE LES DEUX LECTURES: LE NOMBRE DE
    // NOMS. Il n'y a aucun autre marqueur, aucun booléen, aucun type — un second
    // marqueur finirait par contredire la liste des noms, et c'est la liste
    // qu'on croirait.
    "When ONE name is on the lid, its grams are that person's portion: they open",
    "it and eat, and nothing is weighed at the table.",
    "When SEVERAL names are on the lid, its grams are how much goes IN the tub for",
    "all of them together. That number aims at nobody: never split it per person,",
    "never write a figure next to a name on a shared lid.",
    // ⛔ ET LE DÉROULÉ DE SESSION NE PORTE AUCUN POIDS (2026-08-19). Mesuré:
    // « répartir six portions de 450 g » sur un foyer de DEUX, un grammage qui
    // ne nommait aucun aliment et ne correspondait à aucune boîte. L'interdit
    // existait pour `member_portions` seulement; le déroulé passait à travers.
    "The cooking session run_through is the ORDER of the gestures, and nothing",
    "else: no weights, no gram figures, no portion counts. Those live in the",
    "boxes, where each one already carries the name of what is in it and whose",
    "it is. A weight written in the run_through names no food and matches no",
    'lid — say "portion it into the named boxes" and let the boxes speak.',
    "A line in member_portions is NOT a box. It is a sentence read aloud at the",
    "table; a box has a weight and a name on it, and it is what stops the weighing",
    "from happening again at every meal. Writing the serving instruction instead",
    "of the boxes leaves the household weighing at every meal, which is the one",
    "thing this plan exists to prevent.",
    "",
  ];
}
