/**
 * LE GROUPE DÉCLARÉ PAR LE MODÈLE, JUSQU'À LA BASE — lot `L17-0`, 2026-08-22.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE DÉFAUT, MESURÉ, ET IL N'ÉTAIT PAS CELUI QU'ON CROYAIT
 * ══════════════════════════════════════════════════════════════════════════
 * Le plan de chantier a longtemps lu « 0 ligne d'ingrédient sur 9 810 ne porte
 * un groupe » comme « le modèle n'obéit pas », et il en a déduit qu'il fallait
 * durcir la consigne. Les trois mesures du 2026-08-21 et du 2026-08-22 disent
 * l'inverse, et elles s'enchaînent:
 *
 *   ① `FOOD_GROUP_DECLARATION_BLOCK` est arrivé avec `meal.en.v16` le
 *      2026-08-19. Sur 182 plans, **3** ont été générés sous v16+. Les 179
 *      autres n'ont JAMAIS reçu la consigne: ils ne mesurent rien.
 *   ② Sur ces trois fois, le modèle a OBÉI. `regime_belt` porte
 *      `groups_declared` **25 / 134 / 83**, soit **242 déclarations**, dont
 *      **232 valides** et 10 refusées (des slugs inventés, correctement jetés).
 *   ③ ⛔ Et l'écriture jetait sa réponse. `ingredientPayload()` recopiait SEPT
 *      clés en dur — `term, quantity, in_pantry, amount, unit, state,
 *      grams_raw` — et pas `group`, alors que le parseur l'avait posée sur
 *      `DishIngredient.group` deux fonctions plus haut. **242 déclarées, 0
 *      persistées: 100 % d'écart.**
 *
 * Rendre le bloc de consigne inconditionnel (porte G2) sans réparer l'écriture
 * n'aurait rien changé au « 0 sur 9 810 », et `L17` — l'abstention qui se pèse
 * — se serait armée sur une borne qui n'a AUCUNE entrée. C'est-à-dire un lot
 * désarmé qui ressemble trait pour trait à un lot qui marche.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ DEUX POPULATIONS, ET C'EST TOUT L'INTÉRÊT DE CE MODULE
 * ══════════════════════════════════════════════════════════════════════════
 * `declared` dit ce que le MODÈLE a écrit. `persisted` dit ce qui ATTEINT la
 * base, lu SUR LA LIGNE ÉCRITE. **Sans les deux, un modèle qui cesserait de
 * déclarer serait indiscernable d'une écriture réparée**: les deux rendent le
 * même zéro final, et ils appellent deux corrections opposées — durcir la
 * consigne d'un côté, réparer un payload de l'autre. C'est exactement l'erreur
 * de lecture qui a coûté ce lot.
 *
 * ⚠️ L'ÉCART N'EST PAS TOUJOURS UN DÉFAUT, et c'est pour ça qu'il se COMPTE au
 * lieu de s'asserter. `valid - persisted > 0` sur un run réel veut dire que des
 * lignes déjà comptées ont été jetées PLUS TARD — un plat au macro chiffré, une
 * casserole refusée par la ceinture de régime, un verrou de sortie qui vide le
 * plan. C'est une information vraie sur le run, pas une régression de
 * l'écriture. Ce qui serait un défaut, c'est l'écart de 100 % qu'on vient de
 * réparer, ou un écart qui apparaît sur un plan que rien n'a filtré.
 *
 * ⚠️ `lines` EST LE DÉNOMINATEUR, ET IL N'EST PAS DÉCORATIF. Sans lui,
 * `persisted: 0` sur un plan vide et `persisted: 0` sur un plan de 200 lignes
 * sont le même nombre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI LA CLÉ S'APPELLE `group` ET PAS `food_group`
 * ══════════════════════════════════════════════════════════════════════════
 * UN SEUL NOM, DE LA CONSIGNE À LA BASE. Le bloc de prompt demande une clé
 * `"group"`, le parseur lit `group`, le type porte `group`, la ligne écrite
 * porte `group`. Un renommage en chemin est la façon la plus sûre de perdre un
 * champ dans un dépôt où trois personnes cherchent la même valeur.
 *
 * ⛔ ET SURTOUT: `shopping_list[].food_group` EXISTE DÉJÀ, ET CE N'EST PAS LA
 * MÊME CHOSE. Celui-là est RÉSOLU depuis le référentiel à partir du terme
 * (`resolveIngredient(...).foodGroupRef`, lot `L0-a`) — c'est une déduction du
 * dépôt. Celui-ci est DÉCLARÉ par le modèle qui a composé le plat, puis validé
 * contre la liste fermée. Leur donner le même nom inviterait un lecteur à
 * faire confiance à une déduction comme à une déclaration, ou l'inverse. Les
 * deux provenances gardent donc deux noms.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ LA CLÉ EST ÉCRITE MÊME À `null`, ET C'EST DÉLIBÉRÉ
 * ══════════════════════════════════════════════════════════════════════════
 * Quatrième fois dans ce payload, et toujours pour la même raison que
 * `dishes[].name` et `dishes[].boxes`: **une clé absente ne se distingue pas
 * d'un lot débranché**. `group: null` DIT « le modèle n'a rien déclaré pour cet
 * aliment » — ce qui est le cas NOMINAL de toute la population sans régime
 * déclaré, tant que la consigne voyage avec `dietaryRegimePromptLine`.
 *
 * ⛔ CONSÉQUENCE DIRECTE SUR LA MESURE, ET ELLE PIÈGE: après ce lot, **toutes**
 * les lignes neuves portent la clé. `ing ? 'group'` passe donc de 0 à 100 %
 * même si le modèle n'a rien déclaré. La seule mesure qui dise quelque chose
 * est `ing->>'group' is not null`.
 *
 * ⚠️ AUCUNE MIGRATION: `dishes` et `preparations` sont des colonnes `jsonb`.
 * Les plans écrits avant ce lot n'ont simplement pas la clé, et un lecteur qui
 * trouve `undefined` doit le lire comme `null`.
 */

import { type FoodGroupRef, parseFoodGroupRef } from "./tokens.ts";

/**
 * LE NOM DE LA CLÉ, ÉCRIT UNE FOIS.
 *
 * L'écrivain et le compteur le lisent tous les deux ici: c'est ce qui rend
 * structurellement impossible qu'on compte une clé que personne n'écrit — le
 * mode d'échec exact d'un compteur qui « marche » sur un champ mort.
 */
export const INGREDIENT_GROUP_KEY = "group";

/**
 * LE FRAGMENT DE PAYLOAD QUI PORTE LE GROUPE. R1: clé ASCII, snake_case.
 *
 * Rendu comme un objet à étaler (`...`) plutôt que comme une valeur, pour que
 * le nom de la clé n'ait qu'UN site d'écriture dans tout le dépôt.
 */
export function ingredientGroupPayload(
  group: FoodGroupRef | null,
): Record<string, unknown> {
  return { [INGREDIENT_GROUP_KEY]: group };
}

/**
 * LE GROUPE D'UNE LIGNE ÉCRITE — lu sur le payload, validé, jamais deviné.
 *
 * ⛔ RELIT LE VOCABULAIRE FERMÉ, et ce n'est pas de la paranoïa: si un jour
 * quelqu'un écrivait ici la chaîne BRUTE du modèle au lieu du ref validé, un
 * compteur qui ferait confiance au champ rendrait « persisté » un slug inventé.
 * `parseFoodGroupRef` lève sur l'inconnu (R7); on rattrape, parce qu'un
 * COMPTEUR n'a jamais le droit de faire tomber le plan qu'il mesure.
 */
export function persistedGroupOf(row: unknown): FoodGroupRef | null {
  if (!row || typeof row !== "object") return null;
  return closedGroupOrNull((row as Record<string, unknown>)[INGREDIENT_GROUP_KEY]);
}

/**
 * LE VOCABULAIRE FERMÉ, LU SUR UNE VALEUR SCALAIRE. NE LÈVE JAMAIS.
 *
 * ⛔ EXTRAIT DE `persistedGroupOf` PAR `L4`, ET C'EST TOUT L'INTÉRÊT. Un second
 * champ du produit porte désormais un groupe déclaré — celui d'un APPORT FIXE
 * (`fixed_intakes.ts`), déclaré par une PERSONNE et non par le modèle. Lui
 * écrire son propre lecteur aurait créé une seconde vérité sur le même
 * vocabulaire: deux `try/catch` autour de `parseFoodGroupRef`, qui divergent au
 * premier ajustement (un `trim` d'un côté, un `toLowerCase` de l'autre) et dont
 * l'écart ne se voit que dans une assiette.
 *
 * ⚠️ LA CLÉ N'EST PAS LA MÊME DES DEUX CÔTÉS, ET C'EST VOULU. L'ingrédient
 * porte `group` (`INGREDIENT_GROUP_KEY`, l'en-tête dit pourquoi); l'apport fixe
 * porte `food_group`, comme le reste de son jsonb en snake_case complet
 * (`food_ref`, `serving_grams`, `protein_g_per_serving`). Ce qui doit être
 * partagé est le VOCABULAIRE, pas le nom de la clé — les fondre aurait obligé
 * l'un des deux jsonb à mentir sur sa propre convention.
 */
export function closedGroupOrNull(raw: unknown): FoodGroupRef | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return parseFoodGroupRef(raw.trim());
  } catch {
    return null;
  }
}

/** Ce que la ceinture a compté du côté du MODÈLE. Sous-ensemble de `regime_belt`. */
export interface FoodGroupDeclarationCounts {
  groups_declared: number;
  groups_valid: number;
  groups_refused: number;
}

/** Les deux populations, côte à côte, plus leur dénominateur. */
export interface FoodGroupWriteCounts {
  /** Ce que le modèle a écrit sur un ingrédient. */
  declared: number;
  /** Ce qui était du vocabulaire fermé. */
  valid: number;
  /** Déclaré PUIS refusé — un slug inventé. À ne pas confondre avec « jamais déclaré ». */
  refused: number;
  /** ⛔ Ce qui ATTEINT la base, lu sur la ligne écrite. */
  persisted: number;
  /** Lignes d'ingrédient réellement écrites, plats ET préparations. Le dénominateur. */
  lines: number;
}

/**
 * LES LIGNES D'INGRÉDIENT D'UN PORTEUR DE PAYLOAD (un plat, une préparation).
 *
 * ⚠️ TOLÉRANT PAR CONSTRUCTION: on lit un `jsonb` qui part en base, pas une
 * structure typée. Une forme inattendue rend zéro ligne, elle ne lève pas.
 */
function ingredientRowsOf(carrier: unknown): readonly unknown[] {
  if (!carrier || typeof carrier !== "object") return [];
  const rows = (carrier as Record<string, unknown>).ingredients;
  return Array.isArray(rows) ? rows : [];
}

/**
 * LES DEUX POPULATIONS DU GROUPE DÉCLARÉ, SUR LE PAYLOAD RÉELLEMENT ÉCRIT.
 *
 * ⛔ ON LIT LA CHARGE, PAS `meal.dishes`. C'est la moitié qui compte: le
 * parseur avait raison depuis le début, et c'est la RECOPIE vers le payload qui
 * perdait le champ. Un compteur branché sur la structure interne aurait rendu
 * `persisted: 242` pendant que la base en portait zéro — la cicatrice « deux
 * copies d'un même nombre divergent, et c'est celle qu'on regarde le moins qui
 * garde l'ancienne », à l'endroit précis où elle mord.
 *
 * ⛔ LES PRÉPARATIONS COMPTENT AUTANT QUE LES PLATS. La consigne dit « in
 * dishes AND in preparations », et les préparations sont **32 %** des lignes
 * d'ingrédient de la base (3 202 sur 10 053, mesuré le 2026-08-22). Un compteur
 * qui les oublierait sous-compterait d'un tiers sans jamais rien dire.
 */
export function foodGroupWriteCounts(
  belt: FoodGroupDeclarationCounts,
  written: {
    dishes: readonly unknown[];
    preparations: readonly unknown[];
  },
): FoodGroupWriteCounts {
  let persisted = 0;
  let lines = 0;
  for (const carrier of [...written.dishes, ...written.preparations]) {
    for (const row of ingredientRowsOf(carrier)) {
      lines++;
      if (persistedGroupOf(row) !== null) persisted++;
    }
  }
  return {
    declared: belt.groups_declared,
    valid: belt.groups_valid,
    refused: belt.groups_refused,
    persisted,
    lines,
  };
}

/**
 * L'ÉCART DÉCLARÉ ↔ PERSISTÉ, EN UN NOMBRE.
 *
 * Compté contre `valid` et non contre `declared`: un slug inventé est
 * légitimement absent de la ligne écrite, et le faire entrer dans l'écart
 * rendrait le seuil inatteignable dès qu'un modèle se trompe une fois.
 *
 * ⚠️ PEUT ÊTRE NÉGATIF, et il ne faut pas le borner à zéro. Un `persisted`
 * supérieur à `valid` voudrait dire qu'une ligne porte un groupe que la
 * ceinture n'a jamais compté — c'est-à-dire qu'un second écrivain existe. Le
 * cacher derrière un `Math.max(0, …)` est très exactement la façon dont on
 * découvre un jumeau trois mois trop tard.
 */
export function foodGroupWriteGap(counts: FoodGroupWriteCounts): number {
  return counts.valid - counts.persisted;
}
