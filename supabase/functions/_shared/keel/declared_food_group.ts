/**
 * LE GROUPE D'UN APPORT FIXE DÉCLARÉ — lot `L4`, 2026-08-22.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE DÉFAUT, MESURÉ LE 2026-08-22 SUR LA BASE LOCALE
 * ══════════════════════════════════════════════════════════════════════════
 * `augmentedIndexFor` (`fixed_intakes.ts`) synthétise une ligne de composition
 * par apport DÉCLARÉ — un shaker, une boisson maltée, un dessert lacté — et lui
 * écrivait `foodGroupRef: "lean_protein"` EN DUR. Le commentaire du code
 * l'assumait et nommait sa propre date de péremption: *« le jour où des apports
 * déclarés NON protéiques apparaissent, ce champ doit venir de la déclaration,
 * pas d'ici »*.
 *
 * Ce jour-là était déjà passé. Sur les **7 apports déclarés en base** ce
 * matin-là, l'un est un **Barleycup malt drink** — 7 g de protéines pour 152
 * kcal, soit **18,4 %** de l'énergie, quand une protéine en poudre est à 80 %.
 * Il n'a jamais été de la protéine maigre, et la base le rangeait là.
 *
 * ⛔ ET DEPUIS `L17`, UN GROUPE FAUX NE SE CONTENTE PLUS D'ÊTRE FAUX: IL BORNE
 * UNE ÉNERGIE. Mesuré, index réel de 923 lignes, un terme inconnu déclaré
 * `lean_protein` à 150 g:
 *
 *   · index de base .................. borne haute **201 kcal** — `[110,4 ; 133,8]`
 *   · + UN apport déclaré (whey) ..... borne haute **538 kcal** — `[111,1 ; 358,4]`
 *   · + UN Barleycup ................. borne haute **471 kcal**
 *
 * Une SEULE déclaration multipliait par **2,7** ce qu'un terme inconnu avait le
 * droit de peser, pour l'élève qui l'a déclarée. Et le référentiel ne porte que
 * **3** lignes `lean_protein` (`pork_loin`, `turkey_breast`, `ham`): un
 * intrus y pèse un quart de la bande.
 *
 * ⛔ SECOND COÛT, PLUS DISCRET: `lean_protein` porte la sentinelle `zincSource`
 * à **2 lignes sur 3**, c'est-à-dire EXACTEMENT le seuil
 * `SENTINEL_CARRIER_SHARE = 2/3`. Une ligne déclarée de plus — n'importe
 * laquelle, whey comprise, puisqu'une étiquette ne dit rien du zinc — fait 2/4,
 * et le groupe **sort** de la liste des porteurs (`meal_verdict.ts:502`). La
 * boucle de correction cesse alors de savoir quel groupe réparerait un trou de
 * zinc, pour les seuls élèves qui ont déclaré un apport. Un signal qui
 * s'éteint sur la population qui a le plus rempli le produit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LA LISTE FERMÉE N'A PAS DE NEUTRE — MAIS SES LECTEURS EN ONT UN
 * ══════════════════════════════════════════════════════════════════════════
 * C'est la découverte du lot, et c'est elle qui rend le repli honnête possible
 * sans toucher aux trente valeurs de `FOOD_GROUP_REFS`.
 *
 * `groupBandsFrom` (`composition_fill.ts:181`) **saute** toute ligne dont le
 * groupe n'est pas dans la liste fermée. `sentinelCarriersOf`
 * (`meal_verdict.ts:226`) range une telle ligne dans un seau que personne
 * n'interroge jamais, puisqu'on ne lui demande que de vrais groupes. Les deux
 * seuls lecteurs de `ref.foodGroupRef` qui parcourent l'index **traitent donc
 * déjà une valeur hors vocabulaire comme une ABSENCE**, sans qu'aucune ligne
 * n'ait à être écrite pour eux.
 *
 * Le neutre existait; il n'avait simplement pas de nom. Ce module lui en donne
 * un, et le PROUVE hors de la liste à la compilation.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE LE LOT NE FAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE
 * ══════════════════════════════════════════════════════════════════════════
 * Il ne RETIRE PAS l'apport de l'index. L'énergie et la protéine lues sur le
 * pot restent exactement où elles sont, et le verdict continue de les compter.
 * Refuser la ligne — ce que `fillCompositions` fait, lui, d'une réponse de
 * modèle sans groupe — remettrait les 24 g de protéine du shaker HORS du
 * calcul: c'est très précisément le trou que FF-051 existe pour fermer, et
 * la cicatrice « remplacer, jamais retirer ».
 *
 * Seule l'AFFIRMATION de groupe part. Rien d'autre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ DEUX POPULATIONS, PARCE QU'UN CHAMP DÉCLARÉ SANS COMPTEUR EST UN CHAMP
 * INDISCERNABLE D'UN CHAMP MORT
 * ══════════════════════════════════════════════════════════════════════════
 * `L17-0` a payé exactement ça le matin même: **242 groupes déclarés par le
 * modèle, 0 persistés**, parce qu'une recopie de payload perdait la clé — et le
 * zéro final ressemblait trait pour trait à « le modèle n'a rien déclaré ».
 *
 * Ici la déclaration ne vient pas d'un modèle mais d'une PERSONNE, à travers un
 * écran. Le mode d'échec est le même à l'identique: le jour où l'écran cesse
 * d'écrire `food_group`, ou l'écrit sous un autre nom, `reachesIndex: 0` se
 * lira « le lecteur est cassé » alors que la déclaration est vide, ou
 * l'inverse. `declaresGroup` dit ce que le JSONB PORTE; `reachesIndex` dit ce
 * qui atteint l'index de composition. Les deux, toujours, jamais un seul.
 *
 * ⚠️ `declared` EST LE DÉNOMINATEUR, et il n'est pas décoratif: `declaresGroup:
 * 0` sur zéro apport déclaré et sur huit apports déclarés sont le même nombre.
 *
 * ⚠️ AUCUNE MIGRATION. `practical_constraints` et `household_members
 * .fixed_intakes` sont des colonnes `jsonb`. Une déclaration écrite avant ce
 * lot n'a simplement pas la clé — et c'est le cas NOMINAL des 8 lignes en base
 * le 2026-08-22.
 */

import { closedGroupOrNull } from "./food_group_write.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

/**
 * LE NOM DE LA CLÉ DANS LE JSONB D'UN APPORT FIXE, ÉCRIT UNE FOIS.
 *
 * `food_group`, en snake_case complet, comme `food_ref`, `serving_grams`,
 * `protein_g_per_serving` et `replaces_meal` — les cinq autres clés de la même
 * entrée. L'ingrédient d'un plat porte `group` tout court, pour la raison
 * écrite dans `food_group_write.ts`; les deux jsonb gardent leur convention et
 * partagent le VOCABULAIRE, jamais le nom.
 */
export const DECLARED_INTAKE_GROUP_KEY = "food_group";

/**
 * LE NEUTRE DE LA LISTE FERMÉE — une valeur qui n'est PAS un groupe.
 *
 * ⛔ LE PRÉFIXE `__` EST CE QUI GARANTIT QU'ELLE N'EN DEVIENDRA JAMAIS UN. Les
 * trente slugs de `FOOD_GROUP_REFS` viennent du seed `food_groups` de la
 * migration P0 et sont des identifiants SQL; aucun ne peut commencer par deux
 * blancs soulignés sans qu'on le remarque, et la preuve de type ci-dessous
 * refuserait la compilation si l'un le faisait un jour.
 */
export const UNGROUPED_DECLARED_INTAKE = "__ungrouped_declared_intake__";

/**
 * LA PREUVE, À LA COMPILATION, QUE LE NEUTRE EST HORS DE LA LISTE.
 *
 * ⛔ C'EST L'INVERSE EXACT D'UN `as` QUI DÉSARME LE TYPECHECK. Le cast plus bas
 * ne peut mentir que si cette ligne cesse de compiler: le jour où quelqu'un
 * ajouterait cette chaîne à `FOOD_GROUP_REFS`, `Exclude<…>` rendrait `never`,
 * `true` ne s'y assignerait pas, et `deno check` tomberait AVANT qu'un repli
 * silencieux ne se mette à revendiquer un vrai groupe.
 */
type SentinelIsNotAGroup = Exclude<
  typeof UNGROUPED_DECLARED_INTAKE,
  FoodGroupRef
> extends never ? never : true;
const _sentinelIsNotAGroup: SentinelIsNotAGroup = true;
// Lu une fois pour que le linter ne le retire pas: la preuve doit RESTER.
export const SENTINEL_PROVED_OUT_OF_VOCABULARY = _sentinelIsNotAGroup;

/**
 * LE NEUTRE, AU TYPE QUE `CompositionRef.foodGroupRef` EXIGE.
 *
 * ⛔ LE SEUL `as` DU LOT, ET IL EST ENCADRÉ DES DEUX CÔTÉS: la preuve de type
 * au-dessus garantit qu'il ne peut pas revendiquer un vrai groupe, et
 * `declaredGroupReachesIndex` ci-dessous garantit qu'aucun lecteur ne le prend
 * pour un groupe. `CompositionRef.foodGroupRef` n'est pas nullable, et le
 * rendre nullable pour ce seul cas demanderait de rouvrir dix appelants dont
 * deux appartiennent à d'autres lots en vol.
 *
 * ⚠️ LE DÉPÔT ADMET DÉJÀ CE CAS: `food_composition_io.ts:62` écrit
 * `String(row.food_group_ref ?? "") as FoodGroupRef` — une colonne vide produit
 * déjà, aujourd'hui, une chaîne hors vocabulaire dans l'index. Ce module ne
 * crée pas la situation, il la NOMME.
 */
export function ungroupedFoodGroup(): FoodGroupRef {
  return UNGROUPED_DECLARED_INTAKE as FoodGroupRef;
}

/**
 * CE QUE LA DÉCLARATION DIT DE SON GROUPE — lu, validé, jamais deviné.
 *
 * `null` couvre les TROIS cas, et l'appelant n'a aucune raison de les
 * distinguer pour choisir le repli: clé absente, clé vide, slug inventé. Le
 * comptage, lui, les distingue (`refused`), parce qu'un écran qui écrit
 * `"protein"` au lieu de `"lean_protein"` doit se voir.
 *
 * ⛔ AUCUNE DÉDUCTION DEPUIS LES NOMBRES DÉCLARÉS. On POURRAIT calculer la part
 * protéique de l'énergie (whey 80 %, Barleycup 18,4 %, dessert lacté 10,7 %) et
 * en tirer un groupe. On ne le fait pas: 80 % de protéines ne distingue pas une
 * poudre de lactosérum d'une poudre de pois, et ces deux-là ne tombent pas dans
 * le même groupe pour quelqu'un qui ne mange pas de produits laitiers. Un
 * groupe déduit d'une arithmétique serait une affirmation de plus, exactement
 * du genre que ce lot retire.
 */
export function declaredIntakeGroupOf(entry: unknown): FoodGroupRef | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return closedGroupOrNull(
    (entry as Record<string, unknown>)[DECLARED_INTAKE_GROUP_KEY],
  );
}

/**
 * CE QUI ATTEINT L'INDEX EST-IL UN VRAI GROUPE ?
 *
 * Relit la liste fermée sur la valeur ÉCRITE, jamais sur l'intention. C'est la
 * seconde population du compteur, et c'est la seule qui puisse détromper un
 * lecteur: si un jour quelqu'un remettait un littéral en dur dans
 * `augmentedIndexFor`, `declaresGroup` resterait à 0 et `reachesIndex`
 * monterait — l'écart dirait qu'un second écrivain existe.
 */
export function declaredGroupReachesIndex(written: unknown): boolean {
  return typeof written === "string" &&
    (FOOD_GROUP_REFS as readonly string[]).includes(written);
}

/** Les deux populations du groupe d'un apport fixe, plus leur dénominateur. */
export interface DeclaredIntakeGroupCounts {
  /** Les apports en composition DÉCLARÉE. Le dénominateur. */
  declared: number;
  /** Ceux dont le jsonb porte une clé `food_group` non vide. */
  declaresGroup: number;
  /** Ceux dont cette clé était du vocabulaire fermé. */
  valid: number;
  /** Déclaré PUIS refusé — un slug inventé. À ne pas confondre avec « jamais déclaré ». */
  refused: number;
  /** ⛔ Ce qui atteint l'index de composition comme un VRAI groupe. */
  reachesIndex: number;
  /** Ceux repliés sur le neutre. `declared - reachesIndex`, rendu pour être lu. */
  ungrouped: number;
}

/**
 * LES DEUX POPULATIONS, COMPTÉES SUR LE JSONB BRUT **ET** SUR L'INDEX ÉCRIT.
 *
 * ⛔ ON LIT L'INDEX, PAS LA LISTE D'INTENTIONS. Même raison que
 * `foodGroupWriteCounts`: un compteur branché sur la structure d'entrée
 * rendrait `reachesIndex` égal à `valid` par construction, et ne pourrait
 * JAMAIS voir une perte de recopie — le défaut exact que `L17-0` a mis une
 * journée à trouver.
 *
 * @param rawEntries les entrées `fixed_intakes` telles qu'elles sont en base.
 * @param indexGroups le `foodGroupRef` réellement écrit, un par apport déclaré.
 */
export function declaredIntakeGroupCounts(
  rawEntries: readonly unknown[],
  indexGroups: readonly unknown[],
): DeclaredIntakeGroupCounts {
  let declared = 0;
  let declaresGroup = 0;
  let valid = 0;
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (String(e.nutrition ?? "").trim().toLowerCase() !== "declared") continue;
    declared++;
    const raw = e[DECLARED_INTAKE_GROUP_KEY];
    if (typeof raw === "string" && raw.trim() !== "") declaresGroup++;
    if (declaredIntakeGroupOf(e) !== null) valid++;
  }
  let reachesIndex = 0;
  for (const written of indexGroups) {
    if (declaredGroupReachesIndex(written)) reachesIndex++;
  }
  return {
    declared,
    declaresGroup,
    valid,
    refused: declaresGroup - valid,
    reachesIndex,
    ungrouped: indexGroups.length - reachesIndex,
  };
}
