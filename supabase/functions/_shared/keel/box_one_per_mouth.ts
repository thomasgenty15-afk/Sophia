/**
 * UNE BOUCHE, UN CONTENANT, PAR REPAS — lot `L26-0`, 2026-08-22.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE DÉFAUT, MESURÉ, ET IL TOUCHE UNE PERSONNE — LA MINEURE
 * ══════════════════════════════════════════════════════════════════════════
 * Sur les dix plans foyer du 2026-08-22 (`meal.en.v18_one_box_per_group +
 * household.v21_one_box_per_group`), **quatre** portent des bouches servies
 * DEUX FOIS au même repas: `mouths_double` = 4 / 4 / 2 / 4, **quatorze
 * doublons**, et à chaque fois la MÊME bouche — `fa68cbac…`, Anouk, née 2011.
 *
 * La forme est identique quatorze fois sur quatorze, exemple `3eae73ac`
 * `sun/lunch`:
 *
 *   dish[0] « Lentilles, riz, courgettes et tomates » (member_id: null)
 *     ├── box_sun_lunch_shared  [Camille, Malo, Yanis]
 *     └── box_sun_lunch_anouk   [Anouk]          ← 331 g de prep_anouk_sun
 *   dish[1] « Poulet, riz, courgettes et tomates » (member_id: Anouk)
 *     └── box_sun_lunch_anouk_own [Anouk]        ← 331 g de prep_anouk_sun
 *
 * Les deux bacs portent le MÊME contenu, tiré de la MÊME casserole. Les
 * remplir tous les deux, c'est 662 g pour une adolescente, et deux couvercles
 * contradictoires devant le frigo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI UNE ARÊTE ET PAS UNE PHRASE DE PROMPT — LA QUESTION EST TRANCHÉE
 * ══════════════════════════════════════════════════════════════════════════
 * La consigne existe DÉJÀ, mot pour mot, et elle a été SERVIE. `boxSchemaBlock`
 * (`household_meal_generation.ts`) se termine par: *« And do NOT name the same
 * person on two boxes of one meal. »* — le bloc sort dès `members.length >= 2`,
 * la fixture a quatre bouches, et il est concaténé au suffixe système. **Le
 * modèle l'a violée quatorze fois sur quatorze occasions.**
 *
 * Le modèle a aussi violé la moitié POSITIVE du même bloc: le brief nommait
 * deux bouches à servir seules (« Malo, Anouk »), il a donné DEUX bacs à Anouk
 * et ZÉRO à Malo. Durcir la phrase serait réécrire une règle qui y est déjà.
 *
 * ⛔ UNE RÈGLE QUI NE VIT QUE DANS UN PROMPT RÉGRESSE EN RÉEL SANS QUE PERSONNE
 * LE VOIE. Le compteur `mouths_double` reste donc armé: ce module ne le
 * remplace pas, il lui donne l'arête qui manquait. Le compteur mesure ce que le
 * MODÈLE a rendu; ce module dit ce que le PLAN porte. `names_refused` garde la
 * trace de l'écart entre les deux.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE PIÈGE, ET C'EST LUI QUI DÉFINIT LE MODULE: RETIRER LES DEUX EST PIRE
 * ══════════════════════════════════════════════════════════════════════════
 * `mouths_double` et `mouths_unboxed` se lisent ENSEMBLE. Une correction qui
 * retirerait la seconde déclaration en oubliant de garder la première rendrait
 * la bouche NON SERVIE — c'est-à-dire qu'elle échangerait « deux boîtes » (une
 * confusion) contre « aucune boîte » (une personne oubliée à table), et le
 * premier compteur tomberait à zéro en donnant l'air d'un lot qui marche.
 *
 * ⛔ LA PROPRIÉTÉ QUE CE MODULE TIENT, ET ELLE EST BILATÉRALE:
 *
 *     pour toute case (jour × moment) et toute bouche m,
 *       après ≤ 1                        (plus jamais deux couvercles)
 *       après ≥ 1  dès que  avant ≥ 1    (jamais déshabillée)
 *
 * La seconde moitié est la seule qui coûte quelque chose à tenir, et c'est
 * elle que la mutation « retire de tous les couvercles » doit faire rougir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUI GAGNE, QUAND UNE BOUCHE EST SUR PLUSIEURS COUVERCLES — TROIS RÈGLES
 * ══════════════════════════════════════════════════════════════════════════
 *   ① LE PLAT QUI LUI EST DÉDIÉ GAGNE (`dish.memberId === m`). C'est la
 *      sémantique que le brief énonce lui-même: *« These people cannot be fed
 *      from the shared pot »*. Avoir un bac sur le plat commun n'est pas un
 *      remplacement exprimé, c'est une contradiction — et dans les quatorze cas
 *      mesurés, le bac en trop est celui posé sur le plat COMMUN, dont il tire
 *      d'ailleurs les grammes d'une casserole que ce plat ne reprend pas.
 *   ② SINON, LE COUVERCLE OÙ ELLE EST SEULE GAGNE. Un bac à un seul nom est
 *      une portion dimensionnée pour elle; garder le bac partagé à sa place
 *      perdrait ce dimensionnement ET viderait le premier. Cette règle
 *      minimise aussi le nombre de couvercles détruits.
 *   ③ SINON, LE PREMIER DANS L'ORDRE DU DOCUMENT. Il faut un départage
 *      déterministe: deux exécutions du même plan doivent rendre le même plan.
 *
 * ⛔ AUCUN GRAMME N'EST TOUCHÉ, JAMAIS. Ce module RETIRE UNE DÉCLARATION —
 * exactement la posture de la porte ②bis (ceinture de régime) du parseur:
 * « rien de la prose n'est touché, aucun titre, aucune méthode, AUCUN gramme ».
 * Redimensionner un bac parce qu'on lui retire un nom serait recomposer le
 * repas, et composer appartient au modèle.
 *
 * ⚠️ UN COUVERCLE QUI PERD SON DERNIER NOM TOMBE, et c'est le patron déjà écrit
 * dans le parseur (« no usable name on the lid, dropped »): un bac sans
 * destinataire envoie quelqu'un au frigo chercher une boîte que personne ne
 * réclame. **Et il ne peut déshabiller personne**: un nom n'est retiré que
 * lorsqu'il reste ailleurs dans la même case, donc toute bouche d'un couvercle
 * vidé garde un couvercle. C'est une propriété, pas une intention, et elle est
 * éprouvée.
 *
 * ⚠️ LA POPULATION EST LA **CASE** (jour × moment), PAS LE PLAT. Sur une case
 * dédiée il y a deux plats — celui de la table et celui d'une bouche — et c'est
 * précisément à cheval sur les deux que le doublon se forme. La porte ② du
 * parseur, elle, ne refuse un nom que deux fois sur le MÊME couvercle
 * (`seenMouths`), et `namedOnThisDish` est par plat: **aucune des deux ne voit
 * la case**, et c'est pour ça que quatorze doublons sont passés.
 *
 * ⚠️ UN PLAT SANS MOMENT VAUT POUR LA JOURNÉE, UN PLAT SANS JOUR POUR LA
 * FENÊTRE — clé `jour/moment` avec `any`, mot pour mot la clé que la boucle de
 * comptage construit déjà. Deux clés différentes pour la même case rendraient
 * ce module aveugle exactement là où le compteur mord.
 */

/** Un couvercle: un identifiant, et les noms qu'il porte. */
export interface OneBoxLid {
  id: string;
  memberIds: string[];
}

/** Un plat gardé, réduit à ce que la partition par case demande de savoir. */
export interface OneBoxDish<L extends OneBoxLid> {
  day: string | null;
  slot: string | null;
  /** La bouche à qui CE plat est dédié, `null` sur un plat de la table. */
  memberId: string | null;
  boxes: L[];
}

/** Pourquoi ce couvercle-là a gagné la bouche. */
export type OneBoxWinReason = "dedicated_dish" | "alone_on_the_lid" | "first_in_order";

/** Un nom retiré d'un couvercle, avec celui qui le garde. */
export interface OneBoxRemoval {
  /** `jour/moment`, la clé de la case — la même que celle du compteur. */
  cell: string;
  memberId: string;
  /** Le couvercle qui perd le nom. */
  boxId: string;
  /** Le couvercle qui le garde — jamais vide: c'est la moitié qui protège. */
  keptBoxId: string;
  /** Combien de couvercles de cette case la nommaient, avant. */
  namedOn: number;
  reason: OneBoxWinReason;
}

/** Un couvercle tombé parce qu'il a perdu son dernier nom. */
export interface OneBoxDrop {
  cell: string;
  boxId: string;
}

export interface OneBoxOutcome<L extends OneBoxLid> {
  /**
   * Les tableaux de couvercles APRÈS, alignés index par index sur l'entrée.
   * ⚠️ Un plat que rien ne touche rend **le tableau d'origine**, par identité:
   * l'appelant peut donc réaffecter sans distinguer les cas.
   */
  boxesByDish: L[][];
  removals: OneBoxRemoval[];
  dropped: OneBoxDrop[];
  /** `removals.length`, pour l'appelant qui doit corriger `names`. */
  namesRemoved: number;
  /** Les bouches distinctes servies deux fois — le vrai `mouths_double`. */
  mouthsFixed: number;
}

/**
 * LA CLÉ DE CASE. Identique, au caractère près, à celle de la boucle de
 * comptage de `meal_generation.ts` — c'est une contrainte, pas une commodité.
 */
export function boxCellKey(day: string | null, slot: string | null): string {
  return `${day ?? "any"}/${slot ?? "any"}`;
}

/**
 * UNE BOUCHE NE GARDE QU'UN COUVERCLE PAR CASE.
 *
 * Rend de NOUVEAUX tableaux pour les plats touchés, et les tableaux d'origine
 * pour les autres. Ne mute rien: un appelant qui garde une référence sur
 * l'entrée voit encore ce que le modèle a rendu, ce dont les compteurs de
 * `generated_from` ont besoin pour rester des MESURES.
 */
export function keepOneBoxPerMouth<L extends OneBoxLid>(
  dishes: readonly OneBoxDish<L>[],
): OneBoxOutcome<L> {
  /** Par case, chaque couvercle avec son plat: (indice plat, indice bac). */
  const cells = new Map<
    string,
    { dish: number; box: number; lid: L; dedicatedTo: string | null }[]
  >();
  for (const [d, dish] of dishes.entries()) {
    if (dish.boxes.length === 0) continue;
    const key = boxCellKey(dish.day, dish.slot);
    const seen = cells.get(key) ?? [];
    for (const [b, lid] of dish.boxes.entries()) {
      seen.push({ dish: d, box: b, lid, dedicatedTo: dish.memberId });
    }
    cells.set(key, seen);
  }

  const removals: OneBoxRemoval[] = [];
  const dropped: OneBoxDrop[] = [];
  /** Les noms à retirer, par plat puis par bac. `Set` de `memberId`. */
  const toRemove = new Map<number, Map<number, Set<string>>>();
  let mouthsFixed = 0;

  for (const [cell, lids] of cells) {
    /** Où chaque bouche est nommée dans cette case. */
    const byMouth = new Map<string, typeof lids>();
    for (const entry of lids) {
      for (const memberId of entry.lid.memberIds) {
        const seen = byMouth.get(memberId) ?? [];
        // ⚠️ UN NOM DEUX FOIS SUR LE MÊME COUVERCLE N'EST PAS NOTRE SUJET: la
        // porte ② du parseur l'a déjà refusé. On ne l'inscrit qu'une fois, sans
        // quoi ce module « corrigerait » un doublon qui n'existe plus et
        // retirerait la bouche d'un bac où elle est seule.
        if (seen.some((e) => e.dish === entry.dish && e.box === entry.box)) continue;
        seen.push(entry);
        byMouth.set(memberId, seen);
      }
    }
    for (const [memberId, named] of byMouth) {
      if (named.length <= 1) continue;
      mouthsFixed++;
      // ── LE GAGNANT, PAR LES TROIS RÈGLES, DANS CET ORDRE ────────────────
      let winner = named[0];
      let reason: OneBoxWinReason = "first_in_order";
      const dedicated = named.find((e) => e.dedicatedTo === memberId);
      if (dedicated) {
        winner = dedicated;
        reason = "dedicated_dish";
      } else {
        const alone = named.find((e) => e.lid.memberIds.length === 1);
        if (alone) {
          winner = alone;
          reason = "alone_on_the_lid";
        }
      }
      for (const entry of named) {
        if (entry === winner) continue;
        const byBox = toRemove.get(entry.dish) ?? new Map<number, Set<string>>();
        const names = byBox.get(entry.box) ?? new Set<string>();
        names.add(memberId);
        byBox.set(entry.box, names);
        toRemove.set(entry.dish, byBox);
        removals.push({
          cell,
          memberId,
          boxId: entry.lid.id,
          keptBoxId: winner.lid.id,
          namedOn: named.length,
          reason,
        });
      }
    }
  }

  const boxesByDish: L[][] = [];
  for (const [d, dish] of dishes.entries()) {
    const byBox = toRemove.get(d);
    if (!byBox) {
      boxesByDish.push(dish.boxes);
      continue;
    }
    const kept: L[] = [];
    for (const [b, lid] of dish.boxes.entries()) {
      const names = byBox.get(b);
      if (!names) {
        kept.push(lid);
        continue;
      }
      const memberIds = lid.memberIds.filter((id) => !names.has(id));
      if (memberIds.length === 0) {
        dropped.push({ cell: boxCellKey(dish.day, dish.slot), boxId: lid.id });
        continue;
      }
      kept.push({ ...lid, memberIds });
    }
    boxesByDish.push(kept);
  }

  return {
    boxesByDish,
    removals,
    dropped,
    namesRemoved: removals.length,
    mouthsFixed,
  };
}
