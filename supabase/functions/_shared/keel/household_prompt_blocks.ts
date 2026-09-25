// ═══════════════════════════════════════════════════════════════════════════
// LE PROMPT DU FOYER — LES BLOCS : RÈGLES, SCHÉMAS, PLAT DÉDIÉ, CUISINE, NOTES
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_meal_generation.ts` (découpage
// des gros fichiers, lot 2c). Aucune logique changée, aucun octet de prompt
// changé. `household_meal_generation.ts` ré-exporte tout ce qui y était
// exporté : les appelants continuent d'importer depuis lui.
//
// Trois blocs, dans l'ordre où ils étaient dans le fichier d'origine :
//   · règles de maison, identifiants, schémas de sortie, boîtes, plat dédié ;
//   · cuisine, déjeuner emporté au travail ;
//   · notes par bouche.
//
// ⚠️ UN SEUL MOT A CHANGÉ : `export` devant `boxSchemaBlock`,
// `preferenceSplitBlock` et `eatingOutBlock` (ce dernier supprimé le
// 2026-09-24 avec l'état « dehors »). Ces trois fonctions étaient
// privées ; `buildHouseholdPromptBlocks`, resté dans
// `household_meal_generation.ts`, les appelle. Le fichier d'origine ne les
// ré-exporte pas : sa liste d'exports est celle d'avant.

import {
  type PortionMember,
  boxItemSchemaLines,
} from "./household_portions.ts";
// L7 ① — LA PROSE DES JOURS ET DES MOMENTS VIENT DU TRONC, comme dans
// `household_presence.ts` (D14). Une seconde table dirait « Saturday » ici et
// « Sat » là, dans deux blocs que le modèle lit à la suite.
// ⟳ 2026-09-24 (lot 2d-1) — le tronc a découpé ce vocabulaire dans
// `meal_vocabulary.ts` ; on l'importe de là, et non plus de tout
// `meal_generation.ts`.
import { dayProse } from "./meal_vocabulary.ts";
import {
  type KitchenTool,
  missingKitchenTools,
} from "./kitchen_equipment.ts";
import type { HouseholdRestriction } from "./household_standard_recipe.ts";

/**
 * L'en-tête des règles de maison. Trois phrases, et chacune ferme une porte
 * que le modèle prendrait sinon:
 *
 *   « house rules, not nutrition advice »  → il ne les justifie pas.
 *   « never explain or comment on them »   → il ne les commente pas non plus
 *                                            en creux (« on remplace X par Y,
 *                                            c'est plus sain » recrée la
 *                                            justification par la bande).
 *   « simply do not use them »             → il ne propose pas d'alternative
 *                                            « allégée », qui rendrait la
 *                                            règle visible comme un jugement.
 */
const HOUSEHOLD_RULES_HEADER = [
  "HOUSE RULES — foods this household does not serve to certain people.",
  "These are HOUSE RULES set by the person who runs this home. They are NOT",
  "nutrition advice and NOT your opinion. Never explain them, never comment on",
  "them, never justify them, and never offer a 'healthier' version. Simply do",
  "not put these foods on these people's plates.",
] as const;

export function restrictionBlock(restrictions: readonly HouseholdRestriction[]): string {
  if (restrictions.length === 0) return "";
  const byMember = new Map<string, { name: string; labels: string[] }>();
  for (const r of restrictions) {
    const entry = byMember.get(r.memberId) ??
      { name: r.memberDisplayName, labels: [] };
    entry.labels.push(r.label);
    byMember.set(r.memberId, entry);
  }
  const lines = [...byMember.values()].map(
    (e) => `- ${e.name}: never serve ${e.labels.join(", ")}`,
  );
  return [...HOUSEHOLD_RULES_HEADER, "", ...lines].join("\n");
}

/**
 * LE SUPPLÉMENT DE SCHÉMA JSON.
 *
 * `member_portions` s'ajoute à la sortie attendue. Il est décrit ICI et pas
 * dans `MEAL_SYSTEM_PROMPT` parce qu'il n'a de sens que pour un foyer: le
 * demander à toutes les compositions ferait produire au modèle une consigne de
 * portion pour une personne seule, c'est-à-dire du bruit sur le chemin
 * majoritaire (l'entrée du produit est à 1, §5).
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LES IDENTIFIANTS, DANS LE MESSAGE QUI LES RÉCLAME.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ SUR LA RÉPONSE ARCHIVÉE (2026-08-19) ───────────────
 * Trois clés du prompt SYSTÈME demandent un `member_id`: `member_portions`,
 * `boxes[].member_ids`, `for_member_id`. Les trois disaient « the exact id
 * given above » / « from the list above ». Or **il n'y avait aucun id
 * au-dessus**: la liste des bouches vit dans le message UTILISATEUR. Vérifié
 * sur `llm_raw_response_events`: le prompt système ne contenait pas un seul
 * uuid, le message utilisateur oui.
 *
 * Le modèle a donc écrit le seul identifiant qu'il avait sous les yeux — le
 * PRÉNOM. Sur le run `76be8ce3`: `member_ids: ["iku"]`, `["Christèle"]`, et
 * `member_portions[].member_id: "iku"`. Résultat: **16 boîtes sur 16
 * refusées** par le parseur (qui a raison: deux bouches peuvent porter le même
 * prénom, et « jamais de matcher maison »), zéro consigne de portion gardée,
 * zéro gramme à l'écran — pendant que chaque méthode finissait par
 * « portionner dans les boîtes nommées ». Signalé: « là tu vois je vois pas
 * les boîtes nommées ».
 *
 * ⚠️ CE N'EST PAS UNE DÉSOBÉISSANCE DU MODÈLE. Les 21 reprises portaient un
 * `box_id`, et chaque préparation portait ses deux boîtes: il avait compris le
 * protocole entier. Il lui manquait la seule chose qu'on ne lui avait pas
 * donnée dans ce message-là.
 *
 * ⛔ CICATRICE `promise-and-schema-key-must-be-adjacent`, À LA LETTRE: une
 * promesse et sa clé de schéma doivent se toucher, sinon 0 %. Ici c'était une
 * RÉFÉRENCE (« above ») qui pointait hors du message. Le taux mesuré est bien
 * zéro.
 */
export function memberIdRosterLines(
  members: readonly { memberId: string; displayName: string }[],
  /**
   * ⛔ VRAI DÈS QU'UN AUTRE BLOC RENVOIE À CETTE LISTE (2026-08-19).
   *
   * Le bloc des boîtes dit « ids from THE MEMBER IDS ». À une seule bouche, la
   * liste ne sortait pas — et depuis que la pesée se déclenche sur l'OBJECTIF
   * et non sur la taille du foyer, un solo qui perd du poids reçoit ce bloc.
   * On lui demandait donc un id « de la liste ci-dessus » sans liste au-dessus:
   * très exactement la cicatrice `promise-and-schema-key-must-be-adjacent`,
   * réintroduite par un cas neuf le jour même où elle a été fermée.
   */
  referenced: boolean,
): readonly string[] {
  if (members.length < 2 && !referenced) return [];
  return [
    "== THE MEMBER IDS (household) ==",
    "Every member_id below is ONE of these exact strings, copied character for",
    "character. A first name is NEVER a member_id: two people can share one, and",
    "a plan that names people instead of ids is thrown away in full.",
    ...members.map((m) => `  ${m.memberId}  = ${m.displayName}`),
  ];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LE PLAN A DÛ PESER — la moitié SCHÉMA (2026-09-04).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA PROMESSE ET LA CLÉ SE TOUCHENT, ICI ET DANS L'AUTRE MESSAGE. Ce bloc
 * dit qu'une clé EXISTE et quelle forme elle a; le bloc `DECIDED BEFORE YOU`,
 * côté message utilisateur, dit ce qu'il y a à expliquer et la nomme aussi.
 * `member_portions` a ces deux moitiés et il est rempli 100 % du temps;
 * `for_member_id` n'avait que celle-ci et il est resté à zéro sur douze
 * générations. On copie le patron qui marche.
 *
 * ⛔ ET L'ÉCHAPPATOIRE EST NOMMÉE, parce que c'est le geste le plus rentable et
 * le plus contre-intuitif de cette cicatrice: sans « rends `[]` si tu n'as rien
 * arbitré », le modèle invente une tension pour remplir la clé.
 *
 * ⚠️ CE BLOC DIT AUSSI QUI PORTE QUOI. Le calendrier, les courses et le sort
 * des envies sont expliqués par des GABARITS déterministes sous ce texte
 * (`plan_rationale`, `request_report`). Sans cette phrase, le modèle les redit
 * sous ses propres mots et l'aperçu bégaie — la cicatrice
 * `redirect-appends-contradict-the-model-guess`, prise à l'endroit.
 */
export const EXPLANATION_SCHEMA_BLOCK = [
  "== ONE MORE OUTPUT FIELD (household): WHAT YOU HAD TO WEIGH UP ==",
  "Add ONE more top-level key to the JSON you return:",
  '  "explanation": [ "<one short line>", ... ]',
  "At most 8 lines, one sentence each, in the CONTENT LANGUAGE named at the",
  "end of the user message.",
  "Write a line ONLY where you had to CHOOSE between two things this table",
  "asked for, or between a wish and the direction this plan follows: a craving",
  "that pulls against that direction, a dish they asked for that carries food",
  "someone at this table avoids, a shared dish built on the stricter of two",
  "lines. Say what you did, and in a few words why it is a reasonable choice",
  "for this week -- half information, half education.",
  'If you had nothing to weigh up, return "explanation": [].',
  "Never invent a tension to fill the list.",
  "NEVER in these lines: a calorie, gram or kilo figure; anyone's weight, body,",
  "goal, diet, allergy, medical line, or a house rule (the HOUSE RULES block is",
  "not yours to explain, not even to say you honoured it); a first name next to",
  "any number.",
  "The calendar -- which days, which cooking session, which shop -- is",
  "explained by the app in fixed sentences under your text. Do not restate it,",
  "and do not contradict the DECIDED BEFORE YOU block.",
] as const;

export const PORTION_SCHEMA_BLOCK = [
  "== ADDITIONAL OUTPUT FIELD (household) ==",
  "Add ONE more top-level key to the JSON you return:",
  '  "member_portions": [',
  '    { "member_id": "<one of the ids listed just above>",',
  '      "portion_note": "how much of what goes on this plate",',
  '      "preparation_shares": [{ "preparation_id": "prep_x", "note": "..." }] }',
  "  ]",
  "One entry per person listed, using their EXACT member_id from that list.",
  "Serving",
  "instructions only — never a reason, a goal, a calorie count, or anything",
  "about a person's body.",
] as const;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — LA MOITIÉ SCHÉMA DU PROTOCOLE DES BOÎTES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE PARTAGE EST CELUI DE `member_portions`, ET C'EST LE SEUL QUI MARCHE.
 * Ce bloc-ci dit qu'une clé EXISTE et quelle forme elle a; la CONSIGNE — peser
 * une fois, combien de bouches, et ce qui n'est pas une boîte — vit dans
 * `boxingOrderLines`, côté message utilisateur, à l'intérieur même du brief de
 * portions. `member_portions` a ces deux moitiés et il est rempli 100 % du
 * temps; `for_member_id` n'avait que celle-ci et il est resté à zéro sur douze
 * générations. On copie le patron qui marche.
 *
 * ⛔ ET IL N'EXISTE QU'À PARTIR DE DEUX BOUCHES, exactement comme
 * `boxingOrderLines`. Une seule bouche rend un `systemSuffix` byte-identique à
 * celui de v13, et un test le tient.
 *
 * ⚠️ SUR LE PLAT, ET SANS AUCUNE JOINTURE — DEPUIS LE 2026-08-19. Jusque-là une
 * boîte pendait à une préparation et une reprise la citait par `box_id`. Trois
 * défauts mesurés sur le run `76be8ce3` (8 boîtes sur 16 orphelines, une boîte
 * citée par 3 repas, un nom qui ne dit pas quand ouvrir) sont tous les trois des
 * conséquences de cette jointure-là, et aucun ne se répare en aval. Le repas
 * PORTE donc sa boîte: rien à rapprocher, rien à orpheliner, et l'étiquette
 * nomme le jour et le moment du plat qui la porte.
 *
 * ⚠️ ET SON CONTENU EST LE REPAS ENTIER. C'est un changement d'UNITÉ: hier un bac
 * par casserole, aujourd'hui un contenant par repas. Ne « répare » pas en
 * redemandant une boîte par préparation — c'est le contenant en moins qui est
 * voulu (`docs/keel/BOITES-PAR-REPAS.md`).
 */
export function boxSchemaBlock(
  members: readonly { memberId: string; displayName: string }[],
  /**
   * ⛔ LES BOUCHES QUI ONT DROIT À UNE PORTION PESÉE — ET ELLES SEULES.
   *
   * Décision du 2026-08-19 (`docs/keel/BOITES-PAR-REPAS.md`): un objectif de
   * poids ouvre une portion millimétrée, `maintenance` n'ouvre rien.
   *
   * ⚠️ REQUISE, ET C'EST LA MOITIÉ « CONSIGNE » D'UNE GARDE QUI A DÉJÀ SA
   * MOITIÉ « PARSEUR » (`boxMemberIds`). Les deux doivent nommer la MÊME
   * liste: un prompt qui réclame une boîte pour tout le monde pendant que le
   * parseur n'en accepte que pour deux produit un plan amputé en silence —
   * c'est très exactement le défaut du jour, pris par l'autre bout.
   */
  weighed: readonly { memberId: string; displayName: string }[],
): readonly string[] {
  // ⚠️ LE PLANCHER EST REVENU, ET IL EST DOUBLE (v4, 2026-08-20). Le bloc sert
  // dès qu'il y a un GROUPE à former — donc dès deux bouches — ou dès qu'une
  // seule bouche a demandé une portion à elle. Un solo sans objectif n'a ni
  // groupe ni pesée: il rend un `systemSuffix` byte-identique, et un test le
  // tient.
  if (members.length < 2 && weighed.length === 0) return [];
  const names = weighed.map((m) => `${m.memberId} (${m.displayName})`).join(", ");
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ CE QUE CE BLOC A CESSÉ DE DIRE LE 2026-08-20, MOT POUR MOT
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     « Nobody else does. Everyone else eats from the shared dish, and their
  //       servings are never weighed, never named and never written down --
  //       leaving them out is the answer, not an omission. »
  //
  // C'était v3, et elle est RENVERSÉE, pas oubliée. Son défaut, mesuré devant
  // un frigo: « plat commun » ne disait ni combien de bacs remplir dimanche, ni
  // lequel ouvrir jeudi — elle ne décidait rien pour trois personnes sur
  // quatre. Ce qu'elle protégeait (« une personne qui se maintient ne reçoit
  // aucun grammage qu'elle n'a pas demandé ») est préservé AUTREMENT: son bac
  // porte une quantité de RÉCIPIENT, jamais un nombre qui la vise.
  const groupLines = names === ""
    ? [
      "Nobody here asked for a portion of their own, so a meal has exactly ONE",
      "box, with every person eating it named on the lid.",
    ]
    : [
      `These people each get a box of their OWN, alone on the lid: ${names}.`,
      "Everyone else eating that meal shares ONE box, named with all of them.",
    ];
  return [
    "== ONE BOX PER GROUP OF EATERS (household) ==",
    'Every dish that takes from a preparation carries one more key: "boxes" --',
    "one container per group of people eating that meal.",
    '  "boxes": [{ "id": "box_<day>_<slot>[_<name>]",',
    '              "member_ids": ["<id from THE MEMBER IDS, never a first name>"],',
    // ⟳ 2026-09-13 — LA FORME D'UN ITEM VIENT DE `household_portions.ts`, parce
    // qu'elle a un SECOND lecteur: `householdDietBlock`, qui ordonne une boîte
    // quand une ligne alimentaire diverge, et qui part MÊME sous `portion_v1`,
    // c'est-à-dire quand ce bloc-ci ne part PAS. Deux écritures de la même forme
    // divergeraient, et c'est celle qu'on regarde le moins qui garderait
    // l'ancienne clé. ⚠️ Le rendu est byte-identique à celui d'avant: la
    // dernière ligne referme en plus la forme `"boxes"`, qui n'appartient qu'à
    // ce bloc.
    ...boxItemSchemaLines("              ").map((l, k, all) =>
      k === all.length - 1 ? `${l} }]` : l
    ),
    "Ids are lowercase ASCII, invented by you, and each one is used once in the",
    "whole plan. The grams are what goes IN the container once cooked, not the raw",
    "weight of the shopping. preparation_id is null when that item is added fresh",
    "on the day, so no batch holds it.",
    ...groupLines,
    // ⛔ LE SECOND CRITÈRE DE SÉPARATION, ET IL A LA MÊME FORME QUE LE PREMIER.
    // C'est un GROUPEMENT À L'ASSEMBLAGE, pas un retrait après coup: un bac dont
    // on retire un nom est un bac mal composé, et le parseur ne sait pas
    // fabriquer celui qui manque (il faudrait décider si ce qui reste est un
    // repas ou une assiette de riz).
    // ⟳ 2026-09-04 — LA BOÎTE D'ÉCHANGE, DITE EN ENTIER.
    //
    // L'ancienne paire disait « that person gets their own box for it too » —
    // vrai, et insuffisant: elle ne disait pas ce qu'il y a DEDANS. Le modèle
    // écrivait donc une seconde boîte au même contenu, ou pas de seconde boîte
    // du tout, et la ceinture retirait le nom. Mesuré: cinq repas sur douze où
    // la même bouche n'avait aucun contenant.
    //
    // ⚠️ LES DEUX ALIMENTS DANS `ingredients`, ET C'EST LA MOITIÉ QU'ON OUBLIE:
    // les COURSES portent les deux. Un plat qui ne liste que le poulet fait
    // acheter du poulet pour quelqu'un qui mange du tofu.
    //
    // ⚠️ LE TITRE NEUTRE EST UNE CONSÉQUENCE DU RENDU, PAS UN GOÛT: le
    // couvercle d'une boîte porte le TITRE DU PLAT (`mealBoxes.ts`,
    // `boxLidLabel`). « Léa — jeudi soir — Riz au poulet » au-dessus d'une boîte
    // de tofu contredit son propre contenu, et c'est la cicatrice exacte de
    // « la phrase de table contredit le couvercle ».
    "If a dish carries something one person's food line refuses, that person gets",
    "their own box of the SAME dish: same base, same cooking, and that one",
    "component swapped for one of the same role (tofu or beans where the others",
    "have chicken). Its items name the replacement, never the original; the",
    "dish's ingredients list BOTH, so the shopping carries both. The dish title",
    "names the base, never the swapped component (\"Rice bowl\", not \"Chicken",
    "rice\"): one title, two boxes.",
    // ⟳ 2026-09-04 — LA PRÉPARATION À PART, ET POURQUOI C'EST UNE RÈGLE DE
    // CUISINE AVANT D'ÊTRE UNE RÈGLE DE SCANNER. Rejoué sur quatre refus: 60
    // boîtes de tofu sur 89 citaient la fiche du poulet — le modèle cuisait les
    // deux protéines dans UNE préparation, et l'item de tofu pointait dessus.
    // Pour un végétarien strict, du tofu cuit dans la fiche du poulet ne
    // convient pas; c'est la raison retenue (l'autre voie, faire taire la
    // ceinture quand les items sont propres, a été écartée pour ça).
    "The swapped component is cooked in a preparation of its OWN, or in none:",
    "never inside the preparation that carries the original. The box item for",
    "the swap cites that own preparation, or no preparation at all.",
    // ⟳ 2026-09-05 — L'ÉCHAPPATOIRE, FERMÉE EN NOMMANT LA SORTIE. Mesuré deux
    // fois (C06/C07): « if nothing clashes, everyone shares the same one » a
    // été lu comme « fais en sorte que rien ne clashe » — 42 plats sans
    // viande pour quatre omnivores et une végétarienne. Le brief interdisait
    // déjà de retirer la protéine animale; l'interdit seul n'a pas suffi. On
    // décrit la structure attendue, celle que les foyers justes produisent
    // d'eux-mêmes: base commune + UNE casserole de plus, citée par les seules
    // boîtes des bouches libres.
    "If nothing clashes, everyone shares the same one -- but nothing clashing",
    "BECAUSE THE WHOLE PLAN AVOIDS what one line refuses is not sharing, it is",
    "putting the table on one person's line. When someone at the table is not",
    "bound by the strictest line, the base that follows it is the shared",
    "preparation, and the component it refuses is ONE MORE preparation, cited",
    "only by the boxes of the people who eat it, at most lunches and dinners.",
    "A week without it for them is a mistake.",
    // ⟳ v29 — mesuré sur C07 (v28): le modèle a cuit le tofu pour Léa et fait
    // citer le POULET par sa boîte, onze fois sur onze. La phrase disait à qui
    // servir le composant; elle ne disait pas à qui ne PAS le servir.
    "That preparation is NEVER cited by the box of the person that line binds:",
    "their box cites its own preparation (the tofu, the beans) and nothing that",
    "carries what their line refuses.",
    // ⟳ v30 — mesuré (campagne du 05/09, M06): dix petits-déjeuners et goûters
    // sans la végane. Ces repas n'ont pas de boîtes; la règle de la boîte
    // d'échange ne les couvrait pas, et « œufs pour tout le monde » la laissait
    // sans rien. La ligne la plus stricte gouverne la base de CHAQUE repas.
    "This holds at EVERY meal, breakfast and snacks included. A breakfast or a",
    "snack the table shares follows the strictest line too (oats with plant milk,",
    "fruit, bread); eggs, dairy, ham for the others go in a box of theirs or a",
    "dish of their own -- never in the one dish everyone eats. Nobody bound by",
    "that line is left without a breakfast or a snack.",
    // ⚠️ « carries », JAMAIS « may carry ». La formulation permissive a été
    // mesurée le 2026-08-17 comme une permission qu'on décline — zéro
    // déclaration sur douze runs — et un test de ce fichier interdit désormais
    // la tournure dans tout le suffixe système.
    "One box holds that WHOLE meal for its group -- every preparation it takes",
    "from goes in the same container, not one tub per pan. A dish that cooks from",
    'scratch on the day has no "boxes": nothing was weighed ahead for it.',
    // ⛔ L'ÉCHAPPATOIRE MESURÉE, NOMMÉE — et ce n'est plus la même qu'hier.
    // Hier: peser la tablée entière. Aujourd'hui: écrire une part par personne
    // dans un bac partagé, ce qui remettrait la balance au service (c'est
    // exactement ce qui a tué v2). Le dire coûte deux lignes, et c'est le geste
    // le plus rentable de ce dépôt.
    "Do NOT write a per-person figure on a lid that carries several names: its",
    "grams describe the tub, not anybody's plate. And do NOT name the same person",
    "on two boxes of one meal.",
  ];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C — LE PLAT DÉDIÉ DIT À QUI IL EST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE TROU QUE CE BLOC FERME, MESURÉ LE 2026-08-14. Un plat en base porte
 * `title, why, uses, method, slot, day, ingredients, honours_belief_keys` — et
 * AUCUNE attribution. Le seul marqueur qu'un plat était celui de Zoé était
 * « for Zoe » écrit dans le TITRE. La vue par personne montrait donc son plat
 * dédié dans la semaine de tout le monde.
 *
 * ── POURQUOI ON LE DEMANDE AU MODÈLE, ET POURQUOI C'EST SÛR ───────────────
 * Sur une case dédiée il y a DEUX plats: celui de la table et le sien. Lequel
 * est lequel n'est pas décidable de l'extérieur — c'est le modèle qui vient de
 * composer les deux. Et il copie DÉJÀ ces mêmes ids, dans le bloc juste
 * au-dessus (`member_portions[].member_id`), sur chaque plan de foyer écrit
 * depuis le pivot. Ce n'est donc pas un pari: c'est le même geste, une clé plus
 * loin.
 *
 * ⛔ ET LE BLOC N'EXISTE QUE QUAND UN PLAT DÉDIÉ EST RÉCLAMÉ. Servi à un foyer
 * au barreau ① — « Do NOT propose separate dishes » — il apprendrait au modèle
 * qu'un plat peut appartenir à quelqu'un, et l'inviterait à en marquer un. Une
 * consigne qui parle d'un marquage dans un prompt qui l'interdit est exactement
 * l'invitation qu'on veut éviter; c'est le raisonnement de `buildPortionBrief`
 * sur `anyHabit` et `anyRhythm`, mot pour mot.
 *
 * ── LOT 3C · DE LA PERMISSION À L'ORDRE, ET POURQUOI ──────────────────────
 * v12 écrivait « Every dish you return MAY carry one more key ». Mesuré sur les
 * douze générations servies en v12: zéro attribution retenue, et onze runs sur
 * douze n'ont même pas composé de second plat. Un champ facultatif décrit dans
 * le prompt système, sans un ordre au même endroit que la promesse, est un
 * champ que le modèle n'a aucune raison d'écrire — il a déjà dit la divergence
 * ailleurs, dans `member_portions`, qui lui est DEMANDÉ.
 *
 * Ce bloc reste la moitié SCHÉMA (il dit qu'une clé existe et ce qu'elle vaut).
 * La moitié CONSIGNE vit dans `dedicatedDishBlock`, côté message utilisateur,
 * collée au brief qui promet le plat — exactement le partage de
 * `PORTION_SCHEMA_BLOCK` / `buildPortionBrief`, qui est rempli 100 % du temps.
 */
export function dishOwnerSchemaBlock(
  dishBearers: readonly { memberId: string; displayName: string }[],
): readonly string[] {
  if (dishBearers.length === 0) return [];
  return [
    "== WHOSE DISH IS IT (household) ==",
    'A dish can carry one more key: "for_member_id".',
    "The serving plan names the people who cannot be served from the shared pot",
    "and orders a dish of their own. EVERY one of those dishes MUST carry",
    '"for_member_id", set to that person\'s EXACT member_id. It is not optional:',
    "their dish without that key is served to the whole household by mistake,",
    "and the person it was cooked for never sees it.",
    "Leave it out of every dish the table shares — a dish with",
    "no for_member_id is the table's dish, and that is the normal case.",
    ...dishBearers.map((b) => `  ${b.displayName} = ${b.memberId}`),
  ];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 3C — L'ORDRE, À CÔTÉ DE LA PROMESSE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE BLOC EXISTE PARCE QUE LA LIGNE DE FORME NE SUFFIT PAS, ET C'EST MESURÉ.
 * `cookingShapeLines` promet « at EVERY meal they eat here they get a dish of
 * their OWN » — cinq lignes au milieu d'un brief dont l'EN-TÊTE dit « one
 * cooking session, portions that differ » et dont la suite réclame une
 * instruction de service par personne. Sur douze runs, le modèle a tranché
 * onze fois pour l'en-tête: un plat, des parts qui diffèrent.
 *
 * ⚠️ ET LA LIGNE DE FORME RENVOIE À UN MARQUEUR QUI N'EXISTE PAS. « ONE person
 * below cannot be served from it (their line says so) » — la ligne visée dit
 * `- Théo: larger protein and starch share, same vegetables`, une part prise
 * dans la casserole commune. Ce bloc-ci est le marqueur manquant, et il porte
 * les mêmes ids que le bloc de schéma parce qu'ils viennent du même tableau.
 *
 * ⚠️ LA DERNIÈRE PHRASE EST LA PLUS IMPORTANTE. Elle nomme ce que le modèle a
 * réellement fait à la place — écrire la divergence dans `member_portions` —
 * et dit que ce n'est pas la même chose. Une consigne qui interdit sans nommer
 * la sortie qu'on prend à sa place est une consigne qu'on reprend.
 */
export interface PreferenceSplit {
  /** Le terme tel qu'une bouche l'a écrit (la préférence), rendu tel quel. */
  readonly term: string;
  readonly wants: readonly { memberId: string; displayName: string }[];
  readonly refuses: readonly { memberId: string; displayName: string }[];
}

/**
 * ⟳ 2026-09-06 — QUAND UNE BOUCHE VEUT CE QU'UNE AUTRE REFUSE.
 *
 * Le bloc de la boîte d'échange (`boxSchemaBlock`) parle des LIGNES (régime,
 * exclusion) ; une PRÉFÉRENCE contre une exclusion n'y était nommée nulle part,
 * et le modèle tranchait en évitant l'aliment pour toute la table — « putting
 * the table on one person's line », la faute que le bloc voisin interdit déjà.
 * Ici la paire est nommée, et la sortie attendue aussi : la base commune SANS,
 * le composant dans une préparation à part (ou frais), cité par la boîte de
 * qui le veut, jamais par celle de qui le refuse. Vide sans paire.
 */
export function preferenceSplitBlock(splits: readonly PreferenceSplit[] | undefined): string {
  if (!splits || splits.length === 0) return "";
  const names = (xs: readonly { displayName: string }[]) => xs.map((x) => x.displayName).join(" and ");
  const lines: string[] = [
    "== ONE PERSON WANTS WHAT ANOTHER REFUSES ==",
    "Do NOT settle these by dropping the food for the whole table: that is putting",
    "everyone on one person's line, and the person who asked for it gets nothing.",
  ];
  for (const s of splits) {
    lines.push(
      `- ${names(s.wants)} want(s) "${s.term}"; ${names(s.refuses)} keep(s) it off the plate.`,
      `  The shared base goes WITHOUT it. "${s.term}" is ONE MORE preparation (or added`,
      `  fresh on the day), cited only by the box of ${names(s.wants)}, at some lunches and`,
      `  dinners of the stretch -- never by the box of ${names(s.refuses)}. One dish, one`,
      `  title, two boxes: the component lives in the box of the person who wants it.`,
    );
  }
  return lines.join("\n");
}

export function dedicatedDishBlock(
  dishBearers: readonly {
    memberId: string;
    displayName: string;
    /**
     * ⟳ 2026-09-19 — LES JOURS OÙ LE PLAT À SOI EST DÛ. Absent ou `null` =
     * tous les jours (la consigne d'avant, mot pour mot). Une liste = ces
     * jours-là seulement ; les autres jours la bouche mange le plat de la
     * table — voir `ownUsualDaysFor`. Facultatif sur la FORME parce que ce
     * n'est pas une garde : le handler le pose toujours (épinglé), et les
     * dizaines de fixtures qui construisent des porteurs disent « tous les
     * jours » en se taisant, ce qui est exactement ce qu'elles disaient.
     */
    ownMealDays?: readonly string[] | null;
  }[],
  dedicatedDishesAsked: number,
): string {
  if (dishBearers.length === 0) return "";
  // LE NOMBRE VIENT DE L'APPELANT, ET IL EST LE MÊME QUE CELUI DU BUDGET. Un
  // plancher à 1 parce qu'un bloc qui réclame « 0 extra dishes » pendant que la
  // ligne de forme en promet un à chaque repas serait la contradiction que ce
  // fichier passe son temps à interdire.
  const asked = Number.isFinite(dedicatedDishesAsked)
    ? Math.max(1, Math.floor(dedicatedDishesAsked))
    : 1;
  return [
    "== A DISH OF THEIR OWN ==",
    "These people cannot be fed from the shared pot. At EVERY meal they eat",
    "here, write TWO dishes for that day and that slot: the table's dish, and a",
    "dish of their own — same cooking session, same shopping, different plate.",
    ...dishBearers.map((b) =>
      b.ownMealDays == null
        ? `  ${b.displayName} = ${b.memberId}`
        : `  ${b.displayName} = ${b.memberId} -- their own dish on ${
          b.ownMealDays.map(dayProse).join(" and ")
        } ONLY; on every other day they eat the table's dish, and it is sized for them`
    ),
    `That is ${asked} extra dish${asked > 1 ? "es" : ""} on top of the table's`,
    "meals, and the dish budget above already has room for them. Count them",
    "before you answer: a window where these people have no dish of their own is",
    "a window where they do not eat.",
    'Each of those dishes carries "for_member_id" set to the exact id above. The',
    "table's dish carries no such key.",
    "A line in member_portions is NOT one of these dishes: it says how much of a",
    "SHARED dish goes on a plate, and these people are not eating the shared",
    "dish. Writing them a serving instruction instead of a dish leaves them",
    "without a meal.",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L7 ① — CE QUE CETTE CUISINE N'A PAS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE SEUL CHEMIN AUTORISÉ EST `missingKitchenTools()`, ET C'EST UNE DÉCISION
 * PRISE EN OUVRANT CE LOT. `hasKitchenTool()` rend `true | false | null`, mais
 * L2-B a MESURÉ le 2026-08-18 que `if (!hasKitchenTool(eq, "oven"))` compile
 * sans un mot (`deno check` exit 0, `deno lint` muet) et traite « jamais
 * demandé » comme « pas de four ». Or `select count(*) filter (where
 * practical_constraints ? 'kitchen_equipment')` rend **0 sur 175 comptes**:
 * écrire la forme naturelle retirerait le four et le congélateur à 100 % du
 * parc au premier plan. `missingKitchenTools()` rend `[]` tant que rien n'a été
 * déclaré — il n'a donc AUCUNE direction dangereuse, et aucun `!` ne peut en
 * tirer une interdiction que personne n'a énoncée.
 *
 * L'autre sortie — changer le type de retour de `hasKitchenTool` en
 * `"has" | "lacks" | "unknown"` — a été écartée: elle casse le contrat §3.2 que
 * L2-A a écrit pour ce lot, oblige à réécrire les tests du module d'un lot
 * voisin déjà commité, et ne rend rien de plus ici puisque ce fichier ne lit
 * jamais un outil isolément. Le sujet reste ouvert pour qui voudra armer le
 * compilateur; il n'est pas un prérequis de la consigne.
 *
 * ⚠️ `[]` ⇒ AUCUN BLOC, donc prompt byte-identique à v15. Un foyer qui n'a
 * jamais vu la question, un foyer qui a tout coché, une ligne illisible: les
 * trois rendent la même chose, et c'est le comportement d'avant ce lot.
 *
 * ⚠️ TROIS OUTILS ONT UNE CONSÉQUENCE ÉCRITE, LES QUATRE AUTRES SONT SEULEMENT
 * NOMMÉS. Le §2.1 de la conception le dit: `freezer`, `microwave` et `oven`
 * changent ce que le plan peut faire; l'air fryer, l'autocuiseur et le blender
 * affinent. Écrire une conséquence pour chacun coûterait sept lignes de prompt
 * sur une lane qui expire à quatre minutes, pour interdire des gestes que le
 * modèle propose de toute façon rarement.
 */
const TOOL_PROSE: Record<KitchenTool, string> = {
  oven: "an oven",
  stovetop: "a hob",
  microwave: "a microwave",
  freezer: "a freezer",
  air_fryer: "an air fryer",
  pressure_cooker: "a pressure cooker",
  blender: "a blender or food processor",
};

export function kitchenBlock(
  equipment: readonly KitchenTool[] | null,
): { block: string; missing: readonly KitchenTool[] } {
  const missing = missingKitchenTools(equipment);
  // ⚠️ LA TRACE EST RENDUE PAR LA MÊME EXPRESSION QUE LE BLOC. Recalculer
  // `missingKitchenTools` chez l'appelant ferait deux idées de « ce qui a été
  // interdit », et c'est celle qu'on regarde le moins qui garderait l'ancienne.
  if (missing.length === 0) return { block: "", missing };
  const gone = new Set<KitchenTool>(missing);
  const lines = [
    "== THIS KITCHEN ==",
    `This household does not have: ${
      missing.map((tool) => TOOL_PROSE[tool]).join(", ")
    }.`,
    "Cook with what is left. Never write a preparation, a cooking session or a",
    "day-of gesture that needs one of these, and never suggest buying one.",
  ];
  if (gone.has("oven")) {
    lines.push(
      "No oven: nothing roasted, baked, or finished under a grill. The batch" +
        " comes out of a pan or a pot.",
    );
  }
  if (gone.has("freezer")) {
    lines.push(
      "No freezer: nothing is frozen, and nothing is cooked to be kept longer" +
        " than a fridge keeps it.",
    );
  }
  if (gone.has("microwave")) {
    // ⚠️ LA LIGNE DU MICRO-ONDES NOMME CE QUI RESTE, et ce qui reste dépend du
    // four. Écrire « a pan or an oven » à un foyer qui vient de déclarer ne pas
    // avoir de four serait une consigne qui se contredit trois lignes plus
    // haut — et un prompt qui se contredit est un prompt qu'on tranche au
    // hasard.
    lines.push(
      `No microwave: reheating means ${
        gone.has("oven") ? "a pan" : "a pan or the oven"
      }, so write that gesture and count the` + " minutes it really takes.",
    );
  }
  return { block: lines.join("\n"), missing };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D6.2 (2026-09-03) — LA GAMELLE DOIT SE TRANSPORTER, ET TENIR FROIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LA PROMESSE QUI N'ÉTAIT PAS TENUE ─────────────────────────────────────
 * « Le déjeuner en semaine » demande trois choses: au bureau ? gamelle ou
 * dehors ? micro-ondes ? La branche `outside` avait un effet (cinq midis
 * `eating_out`, écrits par la porte SQL — retirés le 2026-09-24). **`lunchbox` et `microwave` n'en
 * avaient AUCUN** — zéro lecteur, vérifié le 2026-09-03 — pendant que trois
 * commentaires du dépôt promettaient « le repas doit être transportable, et
 * bon froid s'il n'y a pas de micro-ondes ». Une question posée dont la
 * réponse ne change rien est pire qu'une question absente: elle apprend que
 * répondre ne sert à rien.
 *
 * ── CE QUE LE BLOC DIT, ET CE QU'IL NE DIT PAS ────────────────────────────
 * Il pose une contrainte de COMPOSITION sur un repas que le plan compose
 * quand même. Il ne retire aucun repas, ne change ni `servings` ni la
 * présence — la gamelle EST un déjeuner à la maison, préparé la veille.
 *
 * ⚠️ `microwave: null` N'EST PAS « non ». Sans réponse, on ne promet pas un
 * plat froid: on dit seulement qu'il doit se transporter. Fabriquer « bon
 * froid » sur un silence poserait une contrainte que personne n'a exprimée —
 * la même règle que `parseWorkLunch` applique déjà à la lecture.
 *
 * ⚠️ VIDE QUAND PERSONNE N'EMPORTE DE GAMELLE — le cas nominal, et le prompt
 * est alors celui de v22 au caractère près.
 */
export function workLunchBlock(
  members: readonly PortionMember[],
  workLunch: ReadonlyArray<{
    memberId: string;
    mode: string | null;
    microwave: boolean | null;
  }>,
): { block: string; mouths: number; cold: number } {
  const nothing = { block: "", mouths: 0, cold: 0 };
  if (workLunch.length === 0) return nothing;
  const nameOf = new Map(members.map((m) => [m.memberId, m.displayName]));
  const lines: string[] = [];
  let cold = 0;
  for (const entry of workLunch) {
    if (entry.mode !== "lunchbox") continue;
    // UNE BOUCHE QUI N'EST PAS DANS CE PROMPT N'EST PAS NOMMÉE: écrire un
    // identifiant nu ferait citer au modèle un id qu'il ne peut rapprocher de
    // rien.
    const name = nameOf.get(entry.memberId);
    if (!name) continue;
    if (entry.microwave === false) {
      cold += 1;
      lines.push(`- ${name}: carried, and eaten COLD (no microwave there).`);
    } else {
      lines.push(`- ${name}: carried to work.`);
    }
  }
  if (lines.length === 0) return nothing;
  const block = [
    "== SOME WEEKDAY LUNCHES TRAVEL ==",
    "These people take their weekday lunch with them. Compose it as usual --",
    "it is still a meal from this plan -- but it has to survive the trip:",
    ...lines,
    "So for those lunches: nothing that must be assembled at the last minute,",
    "nothing that wilts or goes soggy in a box, and nothing that only works",
    "straight out of the pan. Where the line says COLD, the dish must be good",
    "cold: do not write a method that ends in reheating.",
  ].join("\n");
  return { block, mouths: lines.length, cold };
}

// ===========================================================================
// LOT A · « CE QUE SOPHIA SAIT », PAR BOUCHE — le bloc, et sa règle d'exception
// ===========================================================================

const NOTES_HEADER = [
  "== FACTS ABOUT THIS WEEK, PER PERSON ==",
  "What I know about these people that no other field carries — a rehearsal, a",
  "late dinner, a day that is not like the others. These are not preferences to",
  'weigh: honour them, or say in the "why" of the dish it affects that you could',
  "not, and what you did instead.",
] as const;

/**
 * ⛔ LA RÈGLE D'EXCEPTION EST DANS LE BLOC, COLLÉE AUX LIGNES. Cicatrice
 * `named-day-calendar-vs-model-prior`: nommer le jour ne suffit pas, le modèle
 * lisse les jours quand rien ne lui dit que ce jour-là est l'exception. Elle
 * est en PIED de bloc, après les lignes, parce que « la contrainte la plus
 * proche de la fin est lue comme la plus contraignante » — et ici c'est elle
 * qui doit gagner contre l'a priori d'une semaine régulière.
 */
const NOTES_FOOTER = [
  "When a line names a day or a meal, THAT day or THAT meal is the exception for",
  "THAT person: compose it differently from their other days — do not flatten it",
  "into the same box as the rest of the week.",
] as const;

/**
 * ⛔ CE QUE CE PIED DE BLOC A ESSAYÉ DE DIRE, ET QUI A ÉTÉ RETIRÉ APRÈS MESURE
 * (2026-09-03, banc du lot A, deux générations réelles de 7 jours).
 *
 * La note « Léa a danse le mardi soir, il lui faut un vrai repas » atteint le
 * prompt (`served=1`) et change ce que le modèle ÉCRIT — le « pourquoi » du
 * mardi disait « une soirée qui demande un vrai repas ». Elle ne change PAS les
 * grammes: Léa mangeait 350 g/bouche le lundi, le mardi et le mercredi.
 *
 * On a donc ajouté ici « donne-lui sa PROPRE boîte ce soir-là ». Résultat
 * mesuré au run suivant: le modèle a bien créé la boîte séparée… à **169 g**,
 * pendant que la boîte partagée du mercredi donnait **740 g/bouche**. La phrase
 * a rendu le mardi PLUS PETIT — l'inverse exact de ce que la note demande.
 *
 * ⚠️ LE MOTIF EST STRUCTUREL, PAS RÉDACTIONNEL, et c'est pour ça qu'on ne
 * retente pas une troisième formulation: **les grammes d'une boîte sont écrits
 * par le modèle**, et rien dans ce produit ne relie une note à un besoin
 * (cicatrice `grams-were-never-anchored-to-a-need`). Le levier des portions est
 * l'ENVELOPPE (`meal_envelope.ts`, destination ② de la nomenclature), qui est
 * par PERSONNE et n'a aucune dimension par JOUR. Une note ne peut donc pas
 * déplacer un grammage tant que ce levier n'existe pas.
 *
 * ⇒ Ce que le bloc tient aujourd'hui, et qui est vérifié: la note est SERVIE,
 * attribuée à sa personne, au jour nommé, et le modèle compose ce jour-là
 * différemment. Ce qu'il ne tient pas: le grammage. C'est un trou NOMMÉ
 * (rapport du lot A, §8.1 phrase 6), pas un lot débranché.
 */

/** Le bloc des notes par bouche. `""` quand il n'y en a aucune. */
export function notesBlock(notes: readonly string[]): { block: string; served: number } {
  const lines = (notes ?? []).map((n) => String(n ?? "").trim()).filter((n) => n);
  if (lines.length === 0) return { block: "", served: 0 };
  return {
    block: [...NOTES_HEADER, "", ...lines.map((l) => `- ${l}`), "", ...NOTES_FOOTER]
      .join("\n"),
    served: lines.length,
  };
}
