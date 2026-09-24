// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — CE QUE LE MODÈLE REND, UNE FOIS LU (types et bornes)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : les types de sortie (`GeneratedMeal`, `GeneratedDish`,
// `DishIngredient`, `MealPreparation`, `MealBox`, `BoxItem`, `ShoppingItem`,
// `CookingSession`…), les listes fermées qu'ils portent (`SHOPPING_AISLES`,
// `SAME_DAY_KINDS`) et leurs bornes (`BOX_MAX_GRAMS`,
// `BOX_SUM_TOLERANCE_RATIO`, `SAME_DAY_MAX_MINUTES`, `DISH_NAME_MAX_CHARS`,
// `UNQUANTIFIED_TERMS_NAMED`).
//
// `MealSlotCase` et `UnsafeViolation` vivaient plus bas dans le fichier
// d'origine ; ils sont ici parce que `GeneratedMeal` les nomme. Les laisser
// là-bas aurait fait importer ce module depuis `meal_generation.ts`, qui
// l'importe.
//
// Ce module n'importe que des types.

import type { OutputLockResult } from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { OutputSurfaceKind } from "./output_surfaces.ts";
import type { CompositionState, CompositionUnit } from "./food_composition.ts";
import type { KeptWhere, FridgeWindowCounts } from "./fridge_window.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import type { FoodGroupRef } from "./tokens.ts";
import type { QuantitySource } from "./quantity_from_prose.ts";
import type { EatingOccasion, MealSlot } from "./meal_vocabulary.ts";

/**
 * Les rayons. LISTE FERMÉE (R6): chaque valeur est rendue par une branche
 * nommée côté app et côté PDF. Un rayon inventé par le modèle est une ligne
 * que le rendu ne sait pas placer — donc une ligne que l'élève ne verra pas,
 * en silence, au supermarché.
 */
export const SHOPPING_AISLES = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "frozen",
  "other",
] as const;
export type ShoppingAisle = (typeof SHOPPING_AISLES)[number];

export interface PantryItem {
  term: string;
  quantity?: string | null;
}

export interface DishIngredient {
  term: string;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C (2026-09-11) — L'IDENTIFIANT DE RÉFÉRENCE, À CÔTÉ DU TERME
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ UN CHAMP DE PLUS, JAMAIS UN REMPLACEMENT. `term` reste le libellé
   * humain: il est dans la langue de l'élève, il est sur l'écran et sur la
   * liste de courses, et il est dans `MEAL_TRANSLATABLE_FIELDS`. Le slug, lui,
   * est anglais et n'est jamais montré. Les confondre traduirait l'identifiant.
   *
   * ⛔ CE QU'IL FERME, MESURÉ (enquête du 2026-09-11 §2): `resolveIngredient`
   * essaie le slug direct AVANT les alias, donc le mot français « prune »
   * rencontre l'identifiant anglais `prune` (fruit SEC, 229 kcal/100 g) et
   * « raisin » rencontre `raisin` (raisin SEC, 321) — sans qu'aucune erreur de
   * résolution ne puisse apparaître. Contrefactuel à quantités inchangées: le
   * petit-déjeuner PERTE du samedi passe de 614 kcal à **388**. Un identifiant
   * lu dans une liste ne se trompe pas de langue.
   *
   * `null` dans trois cas, qui ne veulent pas dire la même chose et que
   * `ref_absent` / `ref_unknown` / `ref_not_composable` séparent en `issues`:
   * le modèle ne l'a pas écrit, il a écrit un identifiant qui n'existe pas, ou
   * il a écrit un identifiant que le manifeste refuse.
   */
  ref: string | null;
  /**
   * LE MODÈLE A ÉCRIT UN IDENTIFIANT, ET IL A ÉTÉ REFUSÉ.
   *
   * ⛔ CE BOOLÉEN EXISTE POUR QUE LE REFUS SURVIVE AU PARSEUR. Sans lui,
   * `regramMeal` — qui repasse sur tout le plan après le sas de composition —
   * repèserait la ligne par son TERME libre, c'est-à-dire exactement le
   * rapprochement approximatif que le chantier interdit (« sans rapprochement
   * approximatif de secours »). Un refus qui ne dure qu'une fonction n'est pas
   * un refus.
   *
   * ⚠️ `false` QUAND LE MODÈLE N'A RIEN ÉCRIT. « Il n'a pas donné
   * d'identifiant » et « il en a donné un faux » ne sont pas la même faute et
   * n'appellent pas la même correction: la première durcit la consigne, la
   * seconde répare le référentiel.
   */
  refRefused: boolean;
  /**
   * LA QUANTITÉ EN PROSE, destinée à l'humain. Inchangée par FF-038: c'est
   * elle que l'élève lit sur sa liste de courses, et `ENERGY_UNIT_RE` reste
   * armé dessus. Les trois champs structurés en dessous la DOUBLENT, ils ne la
   * remplacent pas.
   */
  quantity: string | null;
  /**
   * VRAI seulement si le terme a été retrouvé dans le garde-manger de l'élève.
   * Calculé ici, jamais recopié du modèle (voir garantie 2 de l'en-tête).
   */
  in_pantry: boolean;
  /**
   * FF-038 — LA MÊME QUANTITÉ, STRUCTURÉE.
   *
   * `null` quand le modèle ne l'a pas rendue ou l'a rendue illisible, et
   * COMPTÉ dans les issues. Jamais défaut-é: un `state` deviné « raw » sur du
   * riz fausse le calcul d'un facteur 2,6, et toujours dans le sens qui
   * gonfle.
   */
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  /**
   * LES GRAMMES CRUS, RECALCULÉS PAR CE PARSEUR.
   *
   * Jamais lu d'un champ du modèle, même s'il en rendait un. Précédent
   * `in_pantry`, garantie 2 de l'en-tête: l'arithmétique du modèle n'est pas
   * une preuve. Un modèle qui rend « grams: 400 » sur « 2 filets » a écrit un
   * nombre, pas une mesure.
   *
   * `null` quand l'ingrédient n'est pas résolu par le référentiel, quand la
   * quantité n'est pas convertible, ou quand le référentiel n'a pas pu être
   * chargé. Les trois cas sont comptés séparément.
   */
  gramsRaw: number | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ LOT `L-1-b` — D'OÙ VIENT LA QUANTITÉ QUI A PESÉ (2026-08-22).
   * ══════════════════════════════════════════════════════════════════════
   *
   * `"structured"` — le modèle a écrit `amount` + `unit`, la copie de FF-038.
   * `"prose"`      — il ne l'a écrite QUE dans `quantity`, et le nombre s'y
   *                  lisait (`150 g`, `200 ml`, `2`, `1/2`).
   * `null`         — ni l'une ni l'autre (`to taste`, `a handful`, `1 can`).
   *
   * ⛔ TROIS VALEURS ET PAS DEUX, ET C'EST LA MOITIÉ NÉGATIVE DU LOT. `null`
   * n'est PAS `"prose"` avec un zéro: « personne n'a écrit de nombre » et « on
   * n'a pas su lire » appellent deux corrections opposées — durcir la consigne
   * d'un côté, rien de l'autre. C'est la seule population qui justifierait de
   * resserrer FF-038.
   *
   * ⚠️ CE CHAMP NE REMPLACE AUCUN COMPTEUR. `amount === null` reste la mesure
   * de l'obéissance du modèle, en mémoire comme en base.
   */
  quantitySource: QuantitySource | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LE GROUPE ALIMENTAIRE, DÉCLARÉ PAR LE MODÈLE (2026-08-19).
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ DÉCLARÉ, VALIDÉ CONTRE `FOOD_GROUP_REFS`, JAMAIS DEVINÉ. Patron
   * `for_member_id` / `preparation_id` / `same_day`: ce que l'aliment EST ne
   * se lit pas dans son nom. « butter beans » n'est pas un laitage,
   * « Vegan sausage » n'est pas de la viande — et c'est très exactement la
   * classe résiduelle sur laquelle le compteur de régime restait faux.
   * L'alternative était un appariement plus malin, c'est-à-dire la cicatrice
   * « laitue ≠ lait » avec douze faux positifs sur douze.
   *
   * `null` quand le modèle n'a rien écrit, ou a écrit hors du vocabulaire
   * fermé. Les deux cas font retomber la ceinture sur son comportement
   * d'avant ce lot, et les deux sont COMPTÉS séparément
   * (`regime_belt.groups_declared` / `_valid` / `_refused`) — sans quoi un lot
   * désarmé ressemblerait exactement à un lot qui marche.
   *
   * ⚠️ LE MODÈLE N'EST INVITÉ À LE RENDRE QUE QUAND UN RÉGIME EST DÉCLARÉ:
   * la consigne voyage avec `dietaryRegimePromptLine`, pas dans le schéma
   * partagé. Sur toute la population sans régime, ce champ vaut `null`, et
   * c'est le cas NOMINAL — pas une anomalie.
   */
  group: FoodGroupRef | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ LOT D (2026-09-11) — LE COMPOSANT CULINAIRE QUE CETTE LIGNE CITE.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ C'EST LUI QUI DIT CE QUI TIENT UNE SAUCE. Les bornes par groupe
   * alimentaire savent qu'une huile ne double pas; elles ne savent pas que
   * 45 g de tahini et 20 g de citron sont UNE vinaigrette. Mesuré sur la
   * campagne du 2026-09-11 (revue §5): l'ajusteur a réécrit quatre recettes —
   * tahini 45 → 40 g, huile 25 → 20 g, laitue 50 → 68,7 g — sans qu'aucune
   * contrainte ne porte le rapport sauce/base.
   *
   * `null` quand le modèle ne l'a pas écrit, et c'est le cas NOMINAL de tous
   * les plans antérieurs au contrat: leur bloc devient alors non ajustable en
   * proportions (`contract_absent`), ce que le plan demande en toutes lettres
   * pour « les réponses archivées antérieures au contrat ».
   */
  part: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT D (2026-09-11) — UN COMPOSANT CULINAIRE D'UN PLAT OU D'UNE CUISSON.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Trois champs, et pas un de plus: ce qu'il EST (`role`), ce qu'il ACCOMPAGNE
 * (`partOf`), et le jeton que ses lignes citent (`id`). Le vocabulaire des
 * rôles et la politique vivent dans `culinary_structure.ts`; ici on transporte.
 *
 * ⛔ AUCUNE LIGNE N'EST NOMMÉE ICI, ET C'EST LE SENS DU CONTRAT. C'est la LIGNE
 * qui cite son composant (`DishIngredient.part`), pas le composant qui liste
 * ses lignes: un modèle qui compte des index se trompe d'index, et « une ligne
 * appartient exactement à un composant » devient vrai par construction.
 */
export interface MealComponent {
  id: string;
  role: string | null;
  partOf: string | null;
}

/**
 * LOT 2 — LA NATURE DU GESTE DU JOUR J, EN QUATRE JETONS ET PAS UN DE PLUS.
 *
 * ⛔ LISTE FERMÉE, DÉCLARÉE PAR LE MODÈLE, JAMAIS DEVINÉE. Le seul marqueur qui
 * existait avant ce lot était la prose de `method` (« reheat a portion, add the
 * salad ») et un matcher là-dessus se tromperait au premier plan français, au
 * premier « do not reheat », au premier « assemble the reheated chicken ». Même
 * patron que `for_member_id` et `preparation_id`: inventé par le modèle, vérifié
 * contre cette liste, JETÉ et COMPTÉ quand il n'y est pas.
 *
 * Les quatre jetons disent quatre gestes qu'un cuisinier distingue vraiment:
 *   · `none`        — rien à faire, l'assiette est prête (un fruit, un yaourt).
 *   · `reheat_only` — sortir la boîte et réchauffer, et RIEN d'autre.
 *   · `assemble`    — monter l'assiette avec du déjà-cuisiné, sans cuisson.
 *   · `cook_fresh`  — une vraie cuisson du jour (des œufs brouillés, des pâtes).
 */
export const SAME_DAY_KINDS = [
  "none",
  "reheat_only",
  "assemble",
  "cook_fresh",
] as const;

export type SameDayKind = typeof SAME_DAY_KINDS[number];

/**
 * CE QU'IL Y A À FAIRE LE JOUR MÊME POUR AVOIR CE PLAT DANS L'ASSIETTE.
 *
 * ⚠️ `minutes` EST UN TEMPS DE PLAT, ET C'EST TOUT CE QU'IL EST. Il ne se
 * confond avec aucun des deux temps qui existaient déjà, et la distinction est
 * la raison d'être du champ:
 *
 *   · `preparations[].activeMinutes` / `.totalMinutes` = le temps d'une CUISSON
 *     en lot, dans une session de cuisine, un autre jour.
 *   · `cooking_sessions[].totalMinutes` = le temps de la SESSION au mur.
 *   · `sameDay.minutes` = le temps du GESTE DU JOUR J, devant cette assiette-là.
 *
 * Le fait mesuré qui justifie le champ: AUCUN temps n'existait au niveau du
 * plat. Un assemblage frais — la moitié des petits-déjeuners d'un plan — n'avait
 * de durée nulle part, et un plat de lot n'annonçait que la durée de sa cuisson,
 * c'est-à-dire cinquante minutes pour « réchauffe une portion ».
 *
 * `null` quand le modèle n'a pas rendu de nombre lisible. PAS de zéro par
 * défaut: « 0 min » se lit « c'est instantané », ce qui est une affirmation, et
 * le geste reste dit par `kind`. Le cas est compté (`minutes_missing`).
 */
export interface DishSameDay {
  kind: SameDayKind;
  minutes: number | null;
}

/**
 * LE PLAFOND DU GESTE DU JOUR, en minutes.
 *
 * Une borne de vraisemblance, pas une règle de produit: au-delà, ce n'est plus
 * le geste du soir mais une session de cuisine mal rangée, et l'écran
 * annoncerait « à assembler — 240 min ». On écrête plutôt que de jeter — le
 * jeton, lui, reste juste.
 */
export const SAME_DAY_MAX_MINUTES = 120;

/**
 * L7 — LE NOM D'USAGE D'UN PLAT, PLAFONNÉ EN CARACTÈRES.
 *
 * Six mots au plus, dit au modèle; le plafond en code est en CARACTÈRES parce
 * qu'un mot n'est pas une unité qu'on peut compter sans se tromper de langue
 * (« pomme de terre » fait trois mots, `Kartoffelsalat` un seul). 60 est la
 * largeur d'une case de grille de semaine, qui est l'endroit le plus étroit où
 * ce texte est rendu.
 */
export const DISH_NAME_MAX_CHARS = 60;

export interface GeneratedDish {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L7 — LE NOM D'USAGE. `null` = le modèle n'en a pas rendu d'utilisable.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE CHAMP N'EST PAS UN TITRE PLUS JOLI, ET C'EST TOUT SON INTÉRÊT. La
   * demande produit du 2026-08-18 est « des plats qui donnent envie » — et la
   * façon de la satisfaire qui casse le produit est de rendre `title` appétissant.
   * `title` est lu À VOIX HAUTE à table, il remplit les cases étroites de la
   * grille de la semaine, et c'est à lui qu'on reconnaît son plat au moment de le
   * préparer. « Le Soleil de Marrakech » ne dit plus ce qu'il y a dans
   * l'assiette, et personne ne peut cuisiner un nom.
   *
   * ⚠️ `null` EST UNE DÉGRADATION GRACIEUSE, PAS UNE PANNE. L'écran affiche
   * alors le `title`: un plan sans noms est exactement le plan d'avant ce lot.
   * C'est ce qui autorise à le demander sans rien mettre en jeu.
   *
   * ⛔ AUCUNE GARDE NE S'ACCROCHE À CE TEXTE. L'attribution passe par
   * `memberId`, les préparations par `preparations[].id`, les boîtes par leur
   * repas — jamais par un texte. Lire le NOM pour décider de quoi que ce
   * soit rouvrirait la cicatrice des matchers de titre (« Theo's chicken
   * sandwich » attribué de travers, et rien du tout en français).
   *
   * ⚠️ TRADUIT (`MEAL_TRANSLATABLE_FIELDS`): un nom d'usage anglais dans un plan
   * français serait pire que pas de nom — c'est la seule ligne que l'œil
   * attrape en premier.
   */
  name: string | null;
  title: string;
  slot: MealSlot | null;
  /** Jour nommé quand le scope en couvre plusieurs. Jetons `mon`..`sun`. */
  day: string | null;
  ingredients: DishIngredient[];
  /** Comment le faire, en prose. Jamais une liste d'étapes numérotées imposée. */
  method: string;
  /** Pourquoi CE plat pour CET élève, une phrase. */
  why: string;
  /** Informatif — voir l'en-tête. Jamais exigé, jamais vérifié par un CHECK. */
  honours_belief_keys: string[];
  /**
   * Ce que ce plat PRÉLÈVE sur des préparations déjà faites.
   *
   * Vide = le plat se fait de zéro (un assemblage sans cuisson, une omelette).
   * Non vide = la cuisson a eu lieu ailleurs, et `ingredients` ne porte plus
   * que ce qu'on AJOUTE au moment de manger — la salade, le pain, la sauce.
   */
  uses: Array<{
    preparationId: string;
    servings: number;
    /**
     * COMMENT CETTE PART-LÀ A ATTENDU — 2026-09-01.
     *
     * ⚠️ TOUJOURS RENSEIGNÉ, JAMAIS `undefined`. Un modèle qui ne dit rien
     * reçoit `"fridge"`: le non-dit est le STRICT, donc le comportement d'avant
     * ce lot, au plat près. L'écrire optionnel ferait de l'oubli un
     * relâchement, et c'est la fenêtre du cuit qui en dépend.
     */
    kept: KeptWhere;
  }>;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LES CONTENANTS DE CE REPAS. `[]` = rien n'a été pesé d'avance pour lui.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LA JOINTURE A CHANGÉ DE SENS LE 2026-08-19, ET C'EST LE LOT ENTIER.
   * Jusque-là une boîte pendait à une PRÉPARATION et une reprise la citait
   * (`uses[].box_id`). Trois défauts mesurés sur le run `76be8ce3`, tous les
   * trois structurels:
   *
   *   ① `box_id` est unique par reprise. Sur un plat commun, le modèle pointait
   *      la boîte d'UNE personne et orphelinait l'autre — **8 boîtes sur 16
   *      n'étaient citées par aucun repas, toutes celles de la seconde bouche**.
   *   ② une boîte se retrouvait citée par 3 à 4 repas (140 g pour trois
   *      déjeuners): soit c'est une portion et il en faut trois, soit c'est la
   *      part d'une fournée et 140 g ne suffisent pas. Les deux lectures sont
   *      fausses.
   *   ③ « Boîte iku » était sur cinq boîtes du frigo. Devant la porte, ce nom ne
   *      décide rien.
   *
   * Le repas PORTE donc sa boîte, au lieu qu'une reprise en cite une. Une boîte
   * ne peut plus être orpheline (elle n'existe pas hors d'un repas), ne peut
   * plus servir deux repas (elle appartient à un seul), et son étiquette nomme
   * son jour et son moment (`dishes[].day` / `.slot`, jamais une seconde
   * déclaration qui pourrait diverger).
   *
   * ⛔ C'EST UN CHANGEMENT D'UNITÉ, PAS UN DÉPLACEMENT DE CHAMP. Hier un bac par
   * casserole; aujourd'hui **un contenant par repas**: le poulet, le quinoa et
   * les légumes du jeudi midi vont dans le MÊME contenant. Ne « répare » pas en
   * rendant une boîte par préparation — c'est le contenant en moins qui est
   * voulu (`docs/keel/BOITES-PAR-REPAS.md`).
   *
   * ⚠️ `[]` EST LE CAS NOMINAL SUR LA LANE INDIVIDUELLE et sur tout plat qui se
   * cuisine de zéro. La population qui DOIT en porter est celle des plats qui
   * prélèvent sur une préparation (`uses.length > 0`), et c'est très exactement
   * le dénominateur de `box_counts.meals`.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️ AU PLURIEL DEPUIS v4 (2026-08-20), ET `[]` PLUTÔT QUE `null`.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Un repas produit N contenants — un par GROUPE de mangeurs. Un `MealBox |
   * null` obligeait chaque lecteur à choisir entre « pas de contenant » et « un
   * contenant », et le pluriel est précisément ce que v4 ajoute. `[]` dit les
   * deux d'un coup, et aucun appelant n'a de branche à écrire pour le cas vide.
   */
  boxes: MealBox[];
  /**
   * ÉCHANGE · LES BOUCHES QUE LA CEINTURE A RETIRÉES DES COUVERCLES DE CE PLAT.
   *
   * ⚠️ INTERNE: ce champ ne part PAS en base — `mealDishesPayload` recopie
   * champ par champ et ne le nomme pas. Il existe pour que l'invariant
   * « personne sans repas » sache qu'une bouche absente d'un couvercle en a été
   * RETIRÉE, et par quoi. Sans lui, une bouche retirée et une bouche que le
   * modèle a simplement oubliée se ressemblent — c'est très exactement le
   * défaut mesuré le 2026-09-04 (5 repas sur 12 sans boîte pour la même
   * personne, sans une seule ligne pour le dire).
   */
  heldOff: BoxHeldOff[];
  /**
   * ⟳ 2026-09-05 — LES RÉGIMES QUE LA SURFACE DU PLAT MORD (titre, méthode,
   * ingrédients, casseroles citées par toutes ses boîtes). Ce n'est pas un
   * refus: c'est le DÉNOMINATEUR de la ceinture. Un plat dont la surface mord
   * la ligne végétarienne PORTE le composant carné que les omnivores attendent;
   * un plan où aucun plat ne la mord a mis la table entière au régime de la
   * minorité, avec `bites: 0` pour tout journal (C06/C07). Lu par
   * `swap_presence.ts`.
   */
  regimeBites: DietaryRegime[];
  /**
   * ⟳ 2026-09-06 — LES BOUCHES DONT UNE EXCLUSION MORD LA SURFACE DU PLAT
   * (titre, ingrédients, casseroles citées), qu'elles aient une boîte ou non.
   *
   * Mesuré (banc « un retour et les calories », FB4/FB4r) : un plat au saumon
   * dont TOUTES les bouches sont retirées par la ceinture n'a plus de boîte —
   * et un plat sans boîte « nourrit tout le monde » pour l'invariant. Le
   * retrait rendait donc le plat OUVERT, c'est-à-dire servi à tous. Ce champ
   * est le dénominateur qui manque : l'invariant s'en sert pour ne pas compter
   * comme nourrie une bouche dont la ligne mord un plat ouvert. Interne, ne
   * part pas en base (comme `heldOff` et `regimeBites`).
   */
  exclusionBites: string[];
  /**
   * LOT C — LA BOUCHE À QUI CE PLAT EST DÉDIÉ. `null` = le plat de la table.
   *
   * ⛔ `null` EST LE CAS NOMINAL, et il ne veut PAS dire « on ne sait pas ». La
   * quasi-totalité des plats d'un plan sont le plat commun; seul le plat DÉDIÉ,
   * réclamé par la consigne aux barreaux ② et ③, porte un identifiant.
   *
   * ⚠️ IL EST POSÉ À LA CRÉATION, jamais dérivé après coup. Le modèle le déclare
   * (`for_member_id`), le parseur le valide contre la liste fermée des bouches
   * qui reçoivent un plat (`MergedEater.dishBearerIds`), et un id inconnu est
   * JETÉ et compté. Aucune lecture de titre n'intervient nulle part — « jamais
   * de matcher maison ».
   *
   * ⚠️ TOUJOURS `null` SUR LA LANE INDIVIDUELLE: elle passe `merge: null`, donc
   * la liste fermée est vide, donc rien n'est attribuable. Une personne seule
   * n'a de toute façon pas de « plat dédié » — tous ses plats sont les siens.
   */
  memberId: string | null;
  /**
   * ⟳ 2026-09-10 — LA DENSITÉ QUE LE MODÈLE DIT AVOIR CALCULÉE, en kcal pour
   * 100 g de plat CUIT. Déclarée par lui, jamais lue pour décider.
   *
   * ⛔ ELLE NE REMPLACE PAS LA MESURE, ET C'EST TOUT L'INTÉRÊT. Le moteur pèse
   * le plat avec `food_composition_refs` comme avant; ce champ sert à COMPARER
   * les deux. Mesuré le 2026-09-09/10 sur 40 densités demandées: l'écart entre
   * la consigne et la recette rendue allait de −23 % à +63 %, médiane +3,1 %.
   * Une médiane juste avec cette amplitude, c'est un modèle qui devine.
   *
   * L'écart entre ce champ et notre mesure dit LAQUELLE des deux fautes il
   * commet, et elles n'appellent pas le même correctif:
   *   · son chiffre ≈ le nôtre, mais sous la consigne ⇒ il calcule bien et
   *     vise mal — c'est la consigne qu'il faut durcir.
   *   · son chiffre ≫ le nôtre ⇒ il calcule sur le CRU, ou sur d'autres
   *     valeurs que CIQUAL — c'est la méthode qu'il faut préciser.
   *
   * ⚠️ ÉCRIRE UN NOMBRE FORCE À LE CALCULER. C'est la raison d'être du champ,
   * autant que sa valeur de mesure.
   *
   * `null` = il ne l'a pas rendu. Absent n'est pas zéro: un plat sans
   * vérification et un plat vérifié à 0 kcal/100 g sont deux choses.
   */
  densityCheck: number | null;
  /**
   * ⟳ 2026-09-09 — LE PLAT À SON NOM QUI S'AJOUTE À LA TABLE, au lieu de la
   * remplacer : l'entrée de dernier recours du foyer. Son porteur reste
   * mangeur du plat partagé de la case ; le moteur rabote sa part à la borne
   * et dimensionne ce plat à la différence (`splitPlateWithComplement`).
   *
   * ⚠️ UN SEUL ÉCRIVAIN : `appendDedicatedDishes`. Le parseur ne le pose
   * jamais (le modèle ne le déclare pas), donc ABSENT = un plat dédié qui
   * remplace, le cas nominal d'aujourd'hui — même posture que `member_id`
   * absent. Persisté `complements_shared`, toujours écrit, `false` compris.
   */
  complementsShared?: true;
  /**
   * LOT 2 — CE QU'ON FAIT LE JOUR MÊME, DIT PLUTÔT QUE DEVINÉ.
   *
   * `null` = le modèle ne l'a pas déclaré, ou l'a déclaré illisible. Ce n'est PAS
   * « rien à faire »: `none` dit ça, et il le dit exprès. La différence entre
   * « il n'y a rien à préparer » et « personne ne l'a écrit » est exactement ce
   * que le compteur `same_day` existe pour mesurer — sans elle, un modèle qui
   * ignore la consigne rendrait un lot désarmé indiscernable d'un lot qui
   * marche.
   *
   * ⚠️ Un `same_day` refusé NE REJETTE JAMAIS LE PLAT. Posture `for_member_id`:
   * le commentaire du jour est une lecture EN PLUS; un plat sans lui reste un
   * plat qui se cuisine et se mange.
   */
  sameDay: DishSameDay | null;
  /** ⟳ LOT D — les composants culinaires du FRAIS de ce plat. Voir `MealComponent`. */
  components: MealComponent[];
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: ShoppingAisle;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · ÉTAPE C3 — L'IDENTITÉ, LA QUANTITÉ ET LA BASE ACHETABLE
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QU'ELLES FERMENT, ET IL EST CHIFFRÉ. Une ligne de courses ne
   * portait QUE du texte : `term` et `quantity` en prose. Conséquences
   * mesurées le 2026-09-11, et elles sont trois :
   *   ① `retry_merge.ts` décidait de garder ou de jeter une ligne en comparant
   *      des libellés — **6 lignes sur 26 supprimées** parce que « citrons »
   *      n'est pas « citron » ;
   *   ② l'audit ne pouvait vérifier aucune quantité : **26 identités sur 26**
   *      de GAIN rendaient « incomplet » — honnêtement, et sans rien
   *      contrôler ;
   *   ③ le groupe de fraîcheur se résolvait par le LIBELLÉ
   *      (`foodGroupOfTerm`), donc un identifiant écrit par le modèle ne
   *      comptait pas et la date d'achat pouvait être trop précoce.
   *
   * ⛔ REQUIS, JAMAIS `?`. Le compilateur est le seul recenseur d'écrivains
   * qui ne mente pas, et le dépôt paie en boucle les champs qu'un écrivain
   * oublie en silence (`buy_on` a coûté un tir entier). `null` veut dire
   * « inconnu », jamais zéro.
   *
   * ⚠️ LE TEXTE EST DÉRIVÉ DE CES CHAMPS, plus l'inverse : `quantity` reste le
   * champ de COMPATIBILITÉ des plans écrits avant ce lot, et le contrôle
   * quantitatif ne dépend plus de sa réinterprétation.
   */
  ref: string | null;
  /** La quantité à mettre dans le panier. `null` = non chiffrable. */
  amount: number | null;
  /** `g` · `ml` · `unit`. `null` quand `amount` est `null`. */
  unit: CompositionUnit | null;
  /**
   * L'ÉTAT DE LA BASE ACHETABLE. `raw` est l'affirmation normale — 500 g de
   * riz au magasin sont 500 g CRUS — et c'est elle qui permet de comparer un
   * achat à un besoin de recette sans repasser par un rendement.
   */
  state: CompositionState | null;
  /**
   * ⛔ `false` = CETTE LIGNE NE SE MET DANS AUCUN PANIER. Aujourd'hui l'eau du
   * robinet, et elle seule (`NON_PURCHASABLE_SLUGS`). Mesuré : 2 tirs sur 6 de
   * la campagne du 2026-09-11 réclamaient 219 g et 287 g d'eau en
   * `ingredient_not_bought`.
   *
   * ⚠️ ELLE RESTE DANS LA RECETTE ET DANS LA MESURE DE PRÉPARATION. Ce drapeau
   * ne décide que du panier.
   */
  purchasable: boolean;
  /**
   * LE JOUR OÙ CET ARTICLE S'ACHÈTE, `YYYY-MM-DD`. 2026-09-01.
   *
   * ⛔ IL N'EST PAS ÉCRIT PAR LE MODÈLE ET IL N'EST PAS CALCULÉ ICI. Il est
   * POSÉ par la lane, après composition, à partir de `grocery_waves.ts` — la
   * seule définition de la règle. Le parseur le laisse à `null`: il ne connaît
   * pas la date de départ du plan, seulement des jetons de jour.
   *
   * ⚠️ `null` EST UNE VALEUR PLEINE: « on n'a pas su dater cette ligne ». Elle
   * arrive sur les plans écrits avant ce lot (qu'aucune migration ne répare) et
   * sur toute fenêtre illisible. L'écran retombe alors sur la liste plate.
   */
  buy_on?: string | null;
  /**
   * ⟳ LOT C (2026-09-04) — CETTE LIGNE PART AU CONGÉLATEUR DÈS L'ACHAT.
   *
   * Posée par la lane depuis `grocery_waves.ts` quand la cadence de courses a
   * replié les vagues: l'article est acheté plus tôt que sa fenêtre crue ne le
   * permet, donc il ne tiendra pas au frais jusqu'à sa cuisson.
   *
   * ⚠️ `?` ICI PARCE QUE LA LIGNE VIENT DU MODÈLE et n'a jamais ce champ à la
   * lecture; la lane le POSE ensuite. La projection de sortie
   * (`mealShoppingPayload`) le rend, elle, TOUJOURS — `false` plutôt qu'absent.
   */
  freeze_on_purchase?: boolean;
  /**
   * ⟳ LOT `L0-a` — LE GROUPE D'ALIMENT, résolu par le référentiel de
   * composition, `null` quand le terme n'y est pas.
   *
   * ⛔ C'EST LUI QUI PORTE LA FENÊTRE CRUE, donc la DATE D'ACHAT
   * (`grocery_waves.ts` → `food_groups.raw_window_days`). Sans lui, la fenêtre
   * crue serait une colonne sans jointure: le modèle n'écrit pas de groupe sur
   * la liste de courses, et `aisle` est trop grossier — `protein` mélange le
   * poisson (un jour) et la viande en pièce (trois).
   *
   * ⛔ RÉSOLU ICI, PAS À LA LECTURE. L'écran, le PDF du frigo et la liste
   * partageable sans compte n'ont pas le référentiel; le résoudre à chaque
   * surface serait le jumeau qu'on vient de tuer. Il est donc écrit avec le
   * plan, une fois.
   *
   * `T | null` REQUIS, jamais `T?`: c'est la même phrase que `composition` et
   * `cookingTimeMin` — un champ facultatif est un champ qu'un écrivain oublie,
   * et la seule preuve serait une date de courses trop précoce que personne ne
   * regarde. Son abstention se COMPTE (`rawWindowCounts`).
   */
  food_group: FoodGroupRef | null;
}

/**
 * UNE PRÉPARATION — ce qu'on cuisine, par opposition à ce qu'on mange.
 *
 * ── POURQUOI LE LOT NE POUVAIT PAS RESTER UN ATTRIBUT DU PLAT ─────────────
 * `DishBatch` disait « ce plat-ci se cuisine une fois pour trois jours ». C'est
 * vrai et c'est insuffisant: ça oblige les trois jours à manger LE MÊME plat.
 * Résultat mesuré, un bowl poulet-riz-brocoli identique lundi, mardi, mercredi
 * et jeudi — techniquement du batch cooking, humainement une punition.
 *
 * Or ce qu'on cuisine une fois, ce n'est pas un plat: c'est une PRÉPARATION.
 * 1,2 kg de cuisses rôties devient un bowl le lundi, un wrap le mardi, une base
 * de curry le jeudi. Une seule cuisson, trois repas qui ne se ressemblent pas —
 * c'est exactement ce que les gens cherchent quand ils veulent « réduire le
 * temps de cuisine », et ce n'est pas « manger la même assiette trois fois ».
 *
 * La préparation devient donc un objet à part, que plusieurs plats CONSOMMENT.
 */
export interface MealPreparation {
  /** Référence locale au plan, citée par les plats et les sessions. */
  id: string;
  title: string;
  /**
   * Combien de portions sortent de cette cuisson.
   *
   * `> 1` PARTOUT, SAUF SOUS FUSION AUX BARREAUX ② ET ③, où `1` est le cas
   * NOMINAL: la consigne y demande un plat pour une seule bouche (voir la garde
   * dans `parseGeneratedMeal`). Un écran qui déduit « c'est un lot » de
   * l'existence d'une préparation doit donc lire ce nombre, pas le supposer.
   */
  servingsMade: number;
  /** Les ingrédients de la PRÉPARATION, pour la totalité du lot. */
  ingredients: DishIngredient[];
  /** Comment on la fait. La recette vit ici, plus dans chaque plat. */
  method: string;
  /**
   * LE TEMPS, EN DEUX NOMBRES QUI NE DISENT PAS LA MÊME CHOSE.
   *
   * `activeMinutes` = les mains dessus. `totalMinutes` = du début à la fin,
   * attente comprise. Un rôti fait 10 actives et 50 totales, et cet écart EST la
   * raison pour laquelle le batch marche: le temps de four est libre pour autre
   * chose. N'en garder qu'un rendrait l'un des deux plans impossible à juger —
   * « 50 minutes » ferait renoncer quelqu'un qui a dix minutes devant lui.
   *
   * `null` quand le modèle n'a rien rendu d'exploitable: pas de zéro par
   * défaut, qui se lirait « c'est instantané ».
   */
  activeMinutes: number | null;
  totalMinutes: number | null;
  /** Jour de cuisson, quand une session le fixe. */
  cookOn: string | null;
  /**
   * ⟳ LOT D (2026-09-11) — LES COMPOSANTS CULINAIRES DE CETTE CUISSON.
   *
   * Les lignes les citent par `part`. Vide ⇒ la casserole n'est pas ajustable
   * en proportions: ses rapports restent ceux que le modèle a écrits, et seules
   * la mise à l'échelle globale et la recomposition modèle restent possibles.
   */
  components: MealComponent[];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN CONTENANT: UN REPAS, UN GROUPE DE MANGEURS, ET CE QU'ON MET DEDANS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **v4, 2026-08-20** — `docs/keel/BOITES-PAR-REPAS.md`, qui fait autorité. Un
 * repas produit **N contenants**, un par GROUPE:
 *
 *     groupes(repas) = { chaque bouche à objectif présente, SEULE }
 *                    ∪ partition( le reste, par LIGNE que CE plat mord )
 *
 * ⛔ DÉCLARÉS PAR LE MODÈLE, VALIDÉS CONTRE UNE LISTE FERMÉE, JAMAIS DEVINÉS.
 * Patron `for_member_id` / `preparation_id`, treizième fois: qui mange quoi
 * n'est pas décidable de l'extérieur — c'est le modèle qui vient de composer le
 * repas ET de lire les directions de service.
 *
 * ── LES DEUX GRAMMES NE DISENT PAS LA MÊME CHOSE, ET C'EST TOUTE LA SPEC ──
 * ⚠️ C'EST LE NOMBRE DE NOMS QUI DÉCIDE, PAS LE TYPE DE REPAS.
 *   · **un seul nom → une PRESCRIPTION.** Le contenant EST la portion: on
 *     l'ouvre, on mange. La promesse d'origine (`WEIGH IT ONCE`) est tenue en
 *     ENTIER sur ce cas.
 *   · **plusieurs noms → une QUANTITÉ DE BAC.** `poulet 400 g` est ce qu'on met
 *     dedans pour trois; personne n'y reçoit de chiffre, personne n'y est
 *     comparé à personne.
 * ⛔ JAMAIS UNE PART PAR PERSONNE DANS UN BAC PARTAGÉ. C'est très exactement ce
 * qui a tué v2 (`total 900 g · Mathilde 300 · Thomas 300 · Christèle 300`): la
 * balance de retour à table. Le bac porte UNE série de nombres, celle du bac.
 *
 * ⚠️ CE SONT DES GRAMMES D'ALIMENT, ET C'EST TOUTE LA FRONTIÈRE (F7/F8,
 * FF-047). « poulet 140 g » est une instruction de cuisine, du même côté que
 * « 400 g de cuisses de poulet » sur une liste de courses. « 140 g parce que tu
 * vises une perte » est un verdict sur un corps, et ce type n'a AUCUNE place où
 * mettre un pourquoi.
 *
 * `grams` est en grammes de PRÊT (cuit), et c'est la nuance qui rend la somme
 * vérifiable de travers si on l'oublie: les `ingredients` d'une préparation
 * portent `gramsRaw`, du CRU. Voir la réconciliation dans `parseGeneratedMeal`,
 * qui convertit par le référentiel ou s'abstient.
 */
export interface MealBox {
  /**
   * L'IDENTIFIANT DE LA BOÎTE — un JETON, inventé par le modèle. Même piège que
   * `preparations[].id`: en français le modèle écrirait `boite_zoe`, cohérent
   * avec lui-même, et `token-lint` a une règle exactement là-dessus. Il est donc
   * déclaré dans `MEAL_TOKEN_FIELDS`.
   *
   * ⚠️ IL NE FAIT PLUS AUCUNE JOINTURE — le repas porte ses contenants, personne
   * ne les cite. Ce qu'il sert encore: l'unicité dans le plan (deux couvercles du
   * même nom dans un frigo), et l'attribut `data-box-id` qui rend la ligne
   * auditable dans le DOM.
   */
  id: string;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LE GROUPE QUI OUVRE CE CONTENANT — ET LE SEUL MARQUEUR DE TOUT LE MODÈLE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE NOMBRE DE NOMS DÉCIDE COMMENT LES GRAMMES SE LISENT (v4, 2026-08-20):
   *   · UN SEUL id  → une **PRESCRIPTION**. Le contenant EST sa portion: on
   *     l'ouvre, on mange, personne ne pèse.
   *   · PLUSIEURS   → une **QUANTITÉ DE BAC**. C'est ce qu'on met dedans pour n
   *     personnes, et ça ne vise personne. ⛔ Jamais une part par personne
   *     là-dedans: c'est exactement ce qui a tué v2 — la balance de retour au
   *     service.
   *
   * ⚠️ AUCUN BOOLÉEN `is_common`, ET C'EST VOULU. Un second marqueur finirait
   * par contredire la liste des noms, et c'est la liste qu'on croirait.
   *
   * Jamais vide — un bac pour personne n'est pas une instruction, et le parseur
   * le jette. « Sers-toi » se dit par l'ABSENCE de contenant.
   */
  memberIds: string[];
  /**
   * CE QU'ON MET DEDANS, COMPOSANT PAR COMPOSANT. Jamais vide sur un contenant
   * gardé — vide seulement sur un plan v2 relu (voir `legacyTotalGrams`).
   *
   * ⚠️ DES `items`, PAS UN NOMBRE. « 300 g » ne se sert pas: c'est
   * `100 + 100 + 100` de trois choses différentes, et un total seul ne dit pas
   * lesquelles. Le total est DÉRIVÉ, jamais déclaré — deux nombres qui doivent
   * s'accorder finissent par diverger.
   */
  items: BoxItem[];
  /**
   * LE TOTAL D'UN PLAN v2 RELU, ET RIEN D'AUTRE.
   *
   * ⚠️ `null` SUR TOUT CONTENANT v4 — le total s'y dérive des `items`. Ce champ
   * n'existe que pour qu'une sortie déjà écrite NE PERDE PAS SES GRAMMES quand
   * la forme change sous elle: v2 portait une part par personne et aucune
   * ventilation par composant, donc la seule chose vraie qu'on puisse en tirer
   * est la SOMME — qui est bien, elle, une quantité de bac.
   */
  legacyTotalGrams: number | null;
}

/**
 * UN COMPOSANT DANS UN CONTENANT. Grammes d'aliment PRÊT, entier > 0.
 *
 * ⚠️ `preparationId` EST LA JOINTURE, `term` EST L'ÉTIQUETTE. `null` = ajouté
 * frais le jour même (le pain), donc hors du contrôle de fournée. Le `term` ne
 * sert **jamais** à retrouver quoi que ce soit — « jamais de matcher maison ».
 */
/**
 * ÉCHANGE · UNE BOUCHE QUE LA CEINTURE A RETIRÉE D'UN COUVERCLE, ET POURQUOI.
 *
 * ⛔ LA CAUSE EST PORTÉE, PAS DEVINÉE. Un régime est une ligne qu'on ne
 * franchit pas; un dégoût est un goût. L'invariant « personne sans repas » ne
 * leur doit pas le même dernier recours, et il ne peut pas le retrouver après
 * coup: un nom absent d'un couvercle ne dit ni qu'il en a été retiré, ni par
 * quoi. `boxId` dit DE QUELLE boîte — c'est ce qui rend le geste annulable.
 */
export interface BoxHeldOff {
  readonly memberId: string;
  readonly cause: "regime" | "exclusion";
  readonly boxId: string;
  /**
   * ⟳ 2026-09-04 — PAR OÙ LA MORSURE EST PASSÉE, ET C'EST CE QUI REND LA
   * RELANCE CHIRURGICALE.
   *
   * Rejoué sur les sorties brutes de quatre refus (`llm_raw_response_events`):
   * sur 89 boîtes à la végétarienne seule, 4 portaient un terme carné dans
   * leurs items, et **60** étaient PROPRES mais citaient une préparation qui
   * porte le poulet — le modèle avait cuit le tofu DANS la fiche du poulet.
   * Trois foyers indépendants, même cause. « Écris-lui une boîte à elle » ne
   * répare pas ça: la boîte existe. Ce qu'il faut dire, c'est « ton item de
   * tofu cite `prep_chicken` ».
   *
   * ⚠️ APPROXIMATION ASSUMÉE: quand les items ET une préparation mordent, on
   * nomme la préparation. Le remède est le même dans les deux cas (une
   * préparation à part, ET des items propres), et la phrase le dit.
   */
  readonly via: "items" | "preparation";
  readonly preparationId: string | null;
  readonly matched: string | null;
}

export interface BoxItem {
  preparationId: string | null;
  term: string;
  grams: number;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ LOT A (2026-09-11) — L'IDENTITÉ D'UNE LIGNE FRAÎCHE DE CONTENANT
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QU'ELLE FERME. `box_densify.ts::densityFromComposition` retrouvait
   * l'aliment d'un item frais par `resolveIngredient(index, item.term)` —
   * c'est-à-dire par son LIBELLÉ, alors que la ligne d'ingrédient dont cet
   * item est né portait un identifiant vérifié. Le chantier le nomme en toutes
   * lettres: « ne plus retrouver son aliment par son libellé ».
   *
   * ⚠️ `null` SUR UN ITEM CITANT UNE CASSEROLE (`preparationId !== null`): son
   * énergie vient de la casserole entière, pas d'une fiche. Et `null` aussi sur
   * un contenant écrit par le MODÈLE, qui ne rend pas d'identifiant sur ses
   * items — chemin historique par le terme, conservé tel quel.
   */
  ref: string | null;
  /** Voir `CompositionInput.refRefused`: le refus doit survivre à l'écriture. */
  refRefused: boolean;
  /**
   * ⟳ 2026-09-22 — CES GRAMMES-LÀ, DITS EN MILLILITRES, quand cet aliment se
   * VERSE (`millilitresOf`). `null` partout ailleurs, et c'est le cas de la
   * quasi-totalité des items: un item de poulet n'a pas de volume, un item qui
   * cite une casserole n'a pas de fiche, et un item écrit par le MODÈLE n'a pas
   * d'identifiant.
   *
   * ⛔ CALCULÉ ICI, LÀ OÙ L'IDENTIFIANT VIENT D'ÊTRE LU — jamais retrouvé plus
   * tard par le libellé. C'est la même discipline que `ref` juste au-dessus:
   * « ne plus retrouver son aliment par son nom ».
   *
   * ⛔ ET IL NE REMPLACE AUCUN GRAMME. `grams` reste la grandeur du calcul, de
   * la pesée et des courses; celui-ci ne sert qu'à dire la dose dans l'unité du
   * geste, sur l'écran du repas.
   */
  ml: number | null;
}

/**
 * LE PLAFOND DE PLAUSIBILITÉ D'UN COMPOSANT, en grammes de prêt.
 *
 * Une borne de vraisemblance, pas une règle de produit — exactement
 * `SAME_DAY_MAX_MINUTES`. Au-delà, ce n'est plus un composant dans un contenant,
 * c'est une hallucination d'unité (des grammes crus du lot entier pris pour une
 * portion), et l'écran annoncerait « riz 4 200 g ». On ÉCRÊTE plutôt que de
 * jeter: le contenant, ses noms et son étiquette restent justes, seul le nombre
 * est ramené dans le monde réel, et l'écrêtage est nommé dans les `issues`.
 *
 * ⚠️ IL PORTE SUR UN **ITEM**, PAS SUR LE CONTENANT — depuis le 2026-08-20, où
 * il portait sur une PART, et avant elle sur ce qu'UNE personne sort. La
 * grandeur bornée est toujours la même: un aliment, une fois, pour un repas. Un
 * bac commun à quatre noms peut légitimement peser 4 × ce plafond, et le plafond
 * du CONTENANT n'existe pas — ce qui borne un bac est ce que la casserole
 * produit, et c'est la réconciliation, pas cette constante.
 */
export const BOX_MAX_GRAMS = 2000;

/**
 * LA TOLÉRANCE DE LA SOMME DES BOÎTES, en ratio de la production estimée.
 *
 * ⚠️ ELLE N'EST PAS UNE FAVEUR FAITE AU MODÈLE. `food_composition.ts` déclare
 * lui-même sa bande d'erreur — « ±10-15 % table + cuisson », et ses rendements
 * sont « des ordres de grandeur assumés, pas des mesures » (100 g de riz cru
 * rendent 250 à 300 g cuits). Comparer au gramme près une somme de boîtes à une
 * production reconstruite par ces facteurs-là produirait une `issue` nommée sur
 * des plans qui ont RAISON, et une garde qui mord sur du juste se fait désarmer
 * dans la semaine.
 *
 * 10 % est le bas de la bande que le module revendique: strictement à
 * l'intérieur de sa propre incertitude, donc ce qui dépasse est un vrai écart.
 */
export const BOX_SUM_TOLERANCE_RATIO = 1.1;

/**
 * COMBIEN DE TERMES SANS QUANTITÉ SONT NOMMÉS DANS L'ISSUE.
 *
 * Assez pour qu'un ALIMENT se voie au milieu des condiments (mesuré: les
 * aliments sans nombre sont minoritaires en termes distincts, jamais absents),
 * assez peu pour qu'un plan qui ignore le contrat en entier ne noie pas les
 * constats utiles — un allergène, un lot gardé six jours. Le reste est COMPTÉ
 * et annoncé, jamais tronqué en silence.
 */
export const UNQUANTIFIED_TERMS_NAMED = 12;

/**
 * UNE SESSION DE CUISINE — le moment où l'on cuisine, et son déroulé.
 *
 * Le plan disait QUOI manger et jamais QUAND cuisiner: « make the whole batch
 * once » apparaissait sur quatre jours sans qu'aucun ne soit le jour de la
 * casserole.
 *
 * Le DÉROULÉ est le champ qui compte, et c'est le seul qu'un plat ne peut pas
 * porter: l'ordre des gestes se joue ENTRE les préparations — le riz pendant
 * que le four tourne. C'est ce qu'on lit le dimanche soir, et c'est ce qui rend
 * une semaine exécutable pour quelqu'un qui travaille.
 */
export interface CookingSession {
  /** Jeton `mon`..`sun`. */
  day: string;
  /** Les préparations faites pendant cette session, par `id`. */
  preparationIds: string[];
  /** L'ordre réel des gestes, en prose. */
  runThrough: string;
  /**
   * LA DURÉE DE LA SESSION, au mur — PAS la somme de ses préparations.
   *
   * Les cuissons se chevauchent: le riz pendant que le four tourne. Additionner
   * transformerait un dimanche confortable de quatre-vingt-dix minutes en une
   * corvée de quatre heures que personne ne commence. C'est le modèle qui la
   * donne, et on ne la recalcule pas — la recalculer serait exactement faire
   * cette somme.
   */
  totalMinutes: number | null;
}

export interface GeneratedMeal {
  dishes: GeneratedDish[];
  /** Ce qui se cuisine, par opposition à ce qui se mange. */
  preparations: MealPreparation[];
  /** Quand on cuisine, et dans quel ordre. */
  cooking_sessions: CookingSession[];
  shopping_list: ShoppingItem[];
  /** Motifs numériques qui ont mordu. Non vide = le prompt a dérivé. */
  rejected_numeric: string[];
  /** Rayons hors liste close. */
  rejected_aisles: string[];
  /**
   * FF-037 — LES TITRES DES REPAS PRINCIPAUX SANS ANCRE PROTÉIQUE.
   *
   * Un CONSTAT, pas une décision: les plats concernés sont dans `dishes`, et
   * ils y restent (pass-with-issue, FF-037 R5). C'est l'appelant qui décide
   * d'une relance — ce module est pur et ne peut rappeler aucun modèle. Même
   * partage que `findDoctrineViolations` (constate) et sa lane (relance).
   *
   * Vide quand le verrou de sortie a mordu: relancer pour une ancre alors que
   * la semaine entière est vidée pour un allergène serait une relance qui
   * répare la mauvaise chose.
   */
  protein_anchor_missing: string[];
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — LA CANDIDATE NON LIVRABLE, ET SES MORSURES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ `null` QUAND LA SORTIE EST PROPRE. Non nul, il porte le plan que le
   * verrou vient de VIDER — `dishes`, `preparations`, `cooking_sessions` et
   * `shopping_list` publics valent alors `[]` — et l'endroit exact où il a
   * mordu.
   *
   * ⛔ IL N'EST NI UN APERÇU NI UN PLAN ACTIVABLE, et rien ne doit le publier.
   * Il existe pour UNE chose: qu'une réparation puisse viser l'unité en cause
   * au lieu de refaire les six repas. Le verrou lit un texte CONCATÉNÉ; une
   * arachide dans le dîner de samedi rendait tout le plan indisponible, et rien
   * ne disait lequel était en cause.
   */
  unsafe_candidate:
    | {
      readonly dishes: readonly GeneratedDish[];
      readonly preparations: readonly MealPreparation[];
      readonly cooking_sessions: readonly CookingSession[];
      readonly shopping_list: readonly ShoppingItem[];
      readonly violations: readonly UnsafeViolation[];
    }
    | null;
  /**
   * C2 ④ — LES CASES DE LA FENÊTRE QUE PERSONNE NE REMPLIT.
   *
   * Un CONSTAT, comme `protein_anchor_missing`: le plan est écrit tel quel, et
   * rien ici ne rebouche la case — choisir quoi y mettre est une décision de
   * produit que personne n'a prise. Ce que ça change, c'est que « ce plat a été
   * rejeté » et « il n'y a plus aucun petit-déjeuner cette semaine » cessent de
   * laisser la même trace.
   *
   * Vide quand le verrou de sortie a mordu, pour la même raison que les plats.
   */
  empty_slots: MealSlotCase[];
  /**
   * LES SESSIONS PLUS LONGUES QUE LE TEMPS DÉCLARÉ. `[]` = aucune.
   *
   * ⟳ 2026-09-01 — LE FAIT EXISTAIT, IL N'AVAIT PAS DE FORME. Il ne vivait que
   * dans une ligne d'`issues`, que rien ne lit côté écran; la personne
   * découvrait la vraie durée devant ses casseroles. La consigne autorise
   * désormais le débordement quand il est la seule sortie — ce qui rend son
   * ANNONCE obligatoire, sans quoi on aurait simplement légalisé le silence.
   *
   * Vide quand le verrou de sortie a mordu, comme les plats.
   */
  session_overruns: { day: string; minutes: number; declared: number }[];
  /**
   * LOT 2 — LE COMPTEUR DU COMMENTAIRE DU JOUR J.
   *
   * ⛔ SANS LUI, UN LOT DÉSARMÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI MARCHE.
   * `same_day` est DÉCLARÉ PAR LE MODÈLE: on ne peut pas savoir d'avance à
   * quelle fréquence il le remplit, seulement le mesurer. Un modèle qui
   * l'ignorerait rendrait `sameDay: null` partout, l'écran n'afficherait aucun
   * bandeau, et le produit serait exactement celui d'avant — sans qu'aucun test
   * ne puisse le dire. Même arbitrage, mot pour mot, que `dish_owners`.
   *
   *   · `dishes`          — les plats GARDÉS du plan. Le dénominateur.
   *   · `declared`        — ceux qui portent un `sameDay` valide.
   *   · `invalid`         — ceux qui portaient un `same_day` que le parseur a
   *                         refusé (jeton hors liste, ou objet illisible).
   *   · `minutes_missing` — ceux dont le jeton est bon et le nombre non lisible.
   *
   * `declared + invalid` ne fait PAS forcément `dishes`: un plat sans clé
   * `same_day` du tout n'est ni l'un ni l'autre, et c'est cet écart-là qu'on
   * veut voir au premier run réel.
   *
   * ⚠️ LES QUATRE NOMBRES SONT COMPTÉS SUR LA MÊME POPULATION — les plats
   * finalement gardés. Un plat évincé par le plafond ne laisse de trace dans
   * AUCUN des quatre; il en laisse une, nommée, dans `issues`. Un compteur dont
   * le numérateur et le dénominateur ne comptent pas les mêmes lignes est un
   * compteur qui ment, et ce dépôt l'a déjà payé (`withheld`/`over_cap`).
   */
  same_day_counts: {
    dishes: number;
    declared: number;
    invalid: number;
    minutes_missing: number;
  };
  /**
   * LOT 3C — LE COMPTEUR DE L'ATTRIBUTION, ET IL MANQUAIT SA MOITIÉ.
   *
   * ⛔ LE DÉFAUT QUE CES NOMBRES FERMENT A COÛTÉ UN DIAGNOSTIC ENTIER, ET IL A
   * UNE DATE. `generated_from.household.dish_owners` ne portait que `{asked,
   * attributed}`. Le 2026-08-17, `attributed: 0` a été lu « le modèle n'écrit
   * jamais la clé » — et l'archive `llm_raw_response_events` disait autre chose:
   * sur douze générations de foyer, deux portaient bien `for_member_id`, dont
   * une sur une bouche à qui la consigne ne promettait aucun plat, refusée par
   * le parseur juste en dessous. « Jamais déclaré » et « déclaré puis refusé »
   * rendaient le MÊME zéro, et ils appellent des corrections opposées: resserrer
   * la consigne d'un côté, corriger la liste fermée de l'autre.
   *
   *   · `dishes`     — les plats GARDÉS. Le dénominateur.
   *   · `declared`   — ceux où le modèle a ÉCRIT un `for_member_id` non vide,
   *                    avant toute validation.
   *   · `attributed` — ceux dont l'id a passé les deux portes.
   *   · `refused`    — ceux dont l'id a été rejeté (consigne muette, ou bouche
   *                    hors de la liste fermée) et qui sont RESTÉS, comme plat
   *                    de table de leur case.
   *   · `refused_dropped` — ceux dont l'id a été rejeté alors que leur case
   *                    portait DÉJÀ le plat de la table, et qui sont donc
   *                    TOMBÉS: les garder aurait nommé chaque bouche de la case
   *                    sur deux couvercles (`double`) et fait refuser le plan
   *                    entier. Mesuré le 2026-09-14 sur 6 tirs sur 13.
   *
   * ⚠️ `refused_dropped` COMPTE UNE AUTRE POPULATION QUE LES QUATRE AUTRES, et
   * c'est pour ça qu'il est nommé à part: ces plats ne sont pas dans `dishes`,
   * donc ni dans `declared`, ni dans `attributed`, ni dans `refused`. La
   * propriété `declared === attributed + refused` en sort intacte — la vérifier
   * sur cinq nombres dont l'un décrit des lignes absentes ne vérifierait rien.
   *
   * ⚠️ LES QUATRE SE COMPTENT INDÉPENDAMMENT, et `refused` n'est PAS dérivé de
   * `declared - attributed`. C'est la cicatrice `withheld`/`over_cap` des voix:
   * deux nombres du même objet, l'un dérivé de l'autre, se sont trouvés gonflé
   * et dégonflé en sens inverses sans que rien n'échoue. Ici l'égalité
   * `declared === attributed + refused` est une PROPRIÉTÉ qu'un test vérifie,
   * pas une définition qui la rend invérifiable.
   *
   * ⚠️ MÊME POPULATION QUE `same_day_counts` — les plats finalement gardés. Un
   * plat évincé par le plafond ne compte dans aucun des quatre; il laisse une
   * `issue` nommée.
   */
  dish_owner_counts: {
    dishes: number;
    declared: number;
    attributed: number;
    refused: number;
    /**
     * ⚠️ REQUIS, `number`, jamais `number?`. Un `?` ici serait parfaitement
     * silencieux: le geste le plus lourd du lot — retirer un plat — ne
     * remonterait nulle part, et un lot désarmé ressemblerait trait pour trait
     * à un lot qui marche.
     */
    refused_dropped: number;
  };
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L7 ③ — LE COMPTEUR DU NOM D'USAGE. TROIS NOMBRES, JAMAIS DEUX.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ SANS LUI, UN LOT DÉSARMÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI MARCHE.
   * `name` est DÉCLARÉ PAR LE MODÈLE et FACULTATIF au contrat: un modèle qui
   * l'ignorerait rendrait `name: null` partout, l'écran afficherait le `title`
   * comme avant, et le produit serait exactement celui d'hier — sans qu'aucun
   * test ne puisse le dire. C'est le troisième champ de ce fichier dans ce cas,
   * après `same_day` et `for_member_id`, et le second a coûté un diagnostic
   * entier faute des trois nombres.
   *
   *   · `dishes`   — les plats GARDÉS. Le dénominateur.
   *   · `declared` — ceux où le modèle a écrit un `name` non vide, AVANT toute
   *                  validation.
   *   · `kept`     — ceux dont le nom a passé les deux règles (longueur, et
   *                  différent du titre). C'est ce que l'écran affichera.
   *   · `refused`  — ceux dont le nom a été rejeté.
   *
   * ⚠️ `refused` SE COMPTE INDÉPENDAMMENT, jamais par `declared - kept`.
   * Cicatrice `withheld`/`over_cap`: deux nombres du même objet, l'un dérivé de
   * l'autre, se sont trouvés gonflé et dégonflé en sens inverses sans que rien
   * n'échoue. Ici `declared === kept + refused` est une PROPRIÉTÉ qu'un test
   * vérifie, pas une définition qui la rendrait invérifiable.
   *
   * ⚠️ MÊME POPULATION QUE `same_day_counts` ET `dish_owner_counts` — les plats
   * finalement gardés. Un plat évincé par le plafond ne compte dans aucun des
   * quatre; il laisse une `issue` nommée.
   */
  name_counts: {
    dishes: number;
    declared: number;
    kept: number;
    refused: number;
  };
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LA VARIÉTÉ, COMPTÉE SUR LES SOURCES PROTÉIQUES — 2026-08-24.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE ÇA REND VISIBLE, MESURÉ ────────────────────────────────
   * `plan-S4` (2026-08-23) affiche **sept plats distincts sur sept** — et du
   * TOFU dans les sept. `plan-S7`: des lentilles dans cinq sur sept. La variété
   * comptée sur les NOMS est un compteur qui dit toujours oui: un modèle qui
   * sait écrire sept titres différents le satisfait sans varier une assiette.
   *
   * Ce que quelqu'un ressent comme de la monotonie, c'est la répétition de
   * l'ANCRE — la chose autour de laquelle le repas est construit. C'est elle
   * qu'on compte ici, et elle vient du RÉFÉRENTIEL (`PROTEIN_SOURCES`), jamais
   * d'une liste de mots: « jamais de matcher maison ».
   *
   * ⛔ TROIS NOMBRES, ET AUCUN NE SE DÉRIVE DES AUTRES.
   *   · `distinct` — combien de GROUPES protéiques distincts sur la fenêtre.
   *   · `dishes_with` — combien de plats portent au moins une ancre. Sans lui,
   *     `distinct: 1` couvrirait « un seul aliment partout » ET « un seul plat
   *     protéiné, les autres sans rien » — deux plans opposés.
   *   · `dishes` — le dénominateur. Un compteur seul ment.
   *
   * ⚠️ C'EST UN CONSTAT, PAS UNE GARDE. Rien n'est refusé, rien n'est repris.
   * Un plan végane au budget serré A DE BONNES RAISONS de tourner sur deux
   * ancres, et le produit ne doit pas lui reprocher sa contrainte. Ce compteur
   * existe pour qu'on puisse un jour SAVOIR si la monotonie est rare ou si elle
   * est la règle — décider en demande la mesure d'abord.
   *
   * `distinct: 0` quand le référentiel est indisponible: on ne prétend pas
   * qu'un plan n'a pas d'ancre parce qu'on n'a pas su lire.
   */
  protein_sources: {
    distinct: number;
    dishes_with: number;
    dishes: number;
  };
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LE COMPTEUR DES BOÎTES. POPULATION: LES REPAS QUI PRÉLÈVENT SUR UN LOT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ `boîtes / repas` EST UN COMPTEUR OBLIGATOIRE, ET C'EST ÉCRIT DANS
   * L'ARBITRAGE (`docs/keel/BOITES-PAR-REPAS.md`): sans lui, le défaut n°1 —
   * **8 boîtes sur 16 qu'aucun repas ne citait, toutes celles de la seconde
   * bouche** — revient sans un rouge. Il vit ici, en deux nombres qui ne se
   * dérivent pas l'un de l'autre.
   *
   * ⛔ TROIS NOMBRES AU MINIMUM, ET LA RAISON A UNE DATE. Le 2026-08-17, un
   * compteur `{asked, attributed}` a rendu le MÊME zéro pour « le modèle n'a
   * jamais écrit la clé » et pour « il l'a écrite et on l'a refusée » — deux
   * faits qui appellent des corrections OPPOSÉES, et un diagnostic entier s'est
   * trompé dessus. `declared` et `refused` se comptent donc séparément.
   *
   *   · `meals`             — les plats GARDÉS qui prélèvent sur une préparation
   *                           (`uses.length > 0`). LE DÉNOMINATEUR: c'est la
   *                           population à qui la consigne promet une boîte. Un
   *                           plat cuisiné de zéro n'a rien de pesé d'avance.
   *   · `with_box`          — ceux qui portent AU MOINS un contenant valide.
   *                           `with_box / meals` est le taux de couverture par
   *                           repas.
   *   · `boxes`             — les contenants gardés. ⚠️ IL N'EST PLUS ÉGAL À
   *                           `with_box`, ET C'EST v4: un repas produit N
   *                           contenants, un par groupe de mangeurs.
   *   · `expected`          — **LE COMPTEUR PRINCIPAL, ET SON DÉNOMINATEUR EST
   *                           DÉRIVÉ SANS LE MODÈLE**: Σ, sur les repas boxés,
   *                           du nombre de GROUPES que le foyer produit à ce
   *                           repas-là. `boxes / expected` est le nombre que
   *                           l'arbitrage réclame. ⛔ SANS LUI, zéro contenant
   *                           est indiscernable de « personne n'a d'objectif »,
   *                           et un lot désarmé ressemble à un lot qui marche.
   *                           ⚠️ IL SURCOMPTE LA PRÉSENCE, exactement comme
   *                           `mouth_slots` plus bas: le parseur ne reçoit que
   *                           des ids, jamais qui dîne dehors jeudi. C'est une
   *                           borne HAUTE nommée, pas un dénominateur inventé.
   *   · `refused`           — les contenants JETÉS en entier (id vide ou déjà
   *                           pris, aucun nom connu, aucun item lisible, ou un
   *                           plat qui ne prélève sur aucune préparation).
   *   · `names`             — les noms gardés sur les couvercles, tous
   *                           contenants confondus. ⚠️ CE N'EST PLUS `shares`,
   *                           et le renommage est le sujet: sous v2 une « part »
   *                           portait un gramme par personne, ce que v4 existe
   *                           pour supprimer. Un nom sur un couvercle ne porte
   *                           aucun nombre.
   *   · `names_refused`     — les noms JETÉS (bouche inconnue du roster, bouche
   *                           tenue dehors par sa ligne déclarée, doublon sur un
   *                           même couvercle). Comptés à part des contenants: un
   *                           bac amputé d'un nom reste servi aux autres, et les
   *                           deux faits appellent des suites différentes.
   *   · `items`             — les composants gardés, tous contenants confondus.
   *   · `items_in_grams` /  — la FORME par laquelle chacun a été pesé. Voir le
   *     `items_from_ingredient` champ lui-même: un `items_from_ingredient` non
   *                           nul dit que le prompt de ce chemin n'a pas servi
   *                           le schéma des items.
   *   · `items_refused`     — les composants JETÉS (étiquette vide, aucune
   *                           quantité lisible ni en `grams` ni en forme
   *                           d'ingrédient, `preparation_id` qui ne désigne
   *                           aucune casserole du plan).
   *   · `capped`            — les composants dont les grammes ont été ramenés à
   *                           `BOX_MAX_GRAMS`. ⚠️ PAS un refus: le composant
   *                           reste, écrêté. Sans ce champ, un run où l'écran
   *                           affiche cinq fois « 2000 g » se lit `refused: 0`,
   *                           donc PARFAIT (mesuré le 2026-08-17).
   *   · `legacy_folded`     — les contenants reconstruits depuis un `box`
   *                           singulier v2 (`shares[]` replié en UN bac commun).
   *                           ⚠️ IL DOIT TOMBER À ZÉRO UNE FOIS LE PROMPT PASSÉ
   *                           EN v4: tant qu'il ne bouge pas, c'est le repli qui
   *                           travaille, pas le modèle — et un repli qui devient
   *                           le chemin nominal ne se voit pas autrement.
   *
   * ── LA RÉCONCILIATION, QUI A CHANGÉ DE FORME AVEC L'UNITÉ ─────────────────
   * Une boîte ne pend plus à une casserole: elle porte un REPAS ENTIER, toutes
   * préparations confondues. Vérifier qu'une casserole suffit demande donc de
   * SOMMER la part de cette préparation **à travers les repas** qui la
   * reprennent — c'est très exactement ce que l'arbitrage demande, et ce que
   * `reconcileBoxGrams` fait.
   *
   *   · `preparations`      — les préparations GARDÉES. Le dénominateur du trio.
   *   · `sum_checked`       — celles dont la production ET la part de chacun de
   *                           leurs repas ont pu être reconstruites, donc dont
   *                           la somme a VRAIMENT été comparée.
   *   · `sum_over`          — parmi elles, celles dont Σ parts dépasse.
   *   · `sum_unverifiable`  — celles qu'on n'a pas su reconstruire (référentiel
   *                           absent, ingrédient non résolu, un repas dont on ne
   *                           sait pas répartir la boîte entre ses casseroles).
   *                           C'est le patron des trois cas de `gramsRaw`: on ne
   *                           présente jamais « vérifié » ce qui est « on ne
   *                           sait pas ».
   *
   * ⚠️ `sum_checked + sum_unverifiable` = les préparations qu'AU MOINS UN repas
   * en boîte reprend. Une casserole que personne ne met en boîte n'entre dans
   * aucun des deux — il n'y a rien à réconcilier.
   *
   * ── L'EXÉCUTABILITÉ, PAR REPAS ET PAR BOUCHE ─────────────────────────────
   *   · `mouth_slots`      — le VRAI dénominateur du service: les CASES
   *                          (jour × moment) qui portent au moins un contenant ×
   *                          le roster, moins les bouches que leur ligne
   *                          déclarée tient dehors. C'est le nombre de noms que
   *                          la consigne promet.
   *   · `mouths_unboxed`   — les bouches nommées sur AUCUN contenant d'une case
   *                          qui en porte. C'est le défaut n°1, mesuré: Christèle
   *                          n'avait de boîte à aucun repas. ⚠️ SOUS v4 IL DIT
   *                          PLUS QU'AVANT: tout le monde a un contenant, donc
   *                          une bouche sans nom est un vrai oubli, plus une
   *                          personne « qui se sert ».
   *   · `mouths_double`    — les bouches nommées sur DEUX contenants de la MÊME
   *                          case: deux couvercles pour une personne à un seul
   *                          repas, c'est-à-dire une instruction contradictoire
   *                          devant le frigo. ⛔ C'EST LA GARDE QUI TIENT LA
   *                          PARTITION: les groupes d'un repas sont disjoints
   *                          par définition, et ce compteur est ce qui le
   *                          vérifie sur la sortie du modèle.
   *   · `mouths_double_model` ⟳ LOT `L26-0` — LA MÊME CHOSE, MAIS SUR CE QUE LE
   *                          MODÈLE A RENDU, avant que l'arête n'en retire un.
   *                          ⛔ LES DEUX EXISTENT PARCE QU'ILS N'ONT PLUS LE
   *                          MÊME SUJET DEPUIS QUE L'ARÊTE EXISTE: `mouths_double`
   *                          dit ce que le PLAN porte — et il vaut zéro par
   *                          construction, ce qui en fait la ceinture qui rougit
   *                          si un futur chemin réécrivait des couvercles après
   *                          l'arête. `mouths_double_model` dit ce que le MODÈLE
   *                          a fait, et c'est le seul des deux qui puisse
   *                          mesurer une régression de consigne. Sans lui, un
   *                          modèle qui doublerait CHAQUE repas et un modèle
   *                          irréprochable rendraient exactement le même zéro:
   *                          « un lot désarmé ressemble à un lot qui marche ».
   *                          Mesuré 14 fois sur les dix plans du 2026-08-22.
   *
   * ⚠️ CES TROIS-LÀ MESURENT L'EXÉCUTABILITÉ, PAS LA FORME. Une boîte peut être
   * parfaitement valide (id unique, bouches du roster, grammes entiers) et le
   * jeu de boîtes rester inexécutable. C'est exactement l'écart qui a fait lire
   * « 100 % » à un lot dont la moitié du service n'atteignait personne.
   *
   * ⚠️ CE QUE `mouths_unboxed` SURCOMPTE, ET C'EST DIT ICI PLUTÔT QUE CACHÉ: le
   * roster d'une case est le foyer ENTIER. Une bouche qui ne mange pas à ce
   * moment-là (rythme déclaré, repas dehors) y compte comme non servie. Le
   * parseur ne reçoit que des ids (`boxMemberIds`); la présence par bouche vit
   * dans l'enveloppe foyer, et la faire descendre ici demanderait un second
   * paramètre requis et ses quarante-neuf sites de test. C'est une MESURE, pas
   * une garde: on préfère un bruit nommé à un dénominateur inventé.
   */
  box_counts: {
    meals: number;
    with_box: number;
    boxes: number;
    /**
     * ⟳ LOT `L6′-a` — LES BOUCHES QUE **CE PLAT-LÀ** NOURRIT, jamais le foyer
     * entier. Un plat dédié n'attend qu'UN contenant; le plat de la table de sa
     * case n'attend plus la bouche qui mange à part. ⛔ Avant ce lot, `3c781a71`
     * annonçait 72 attendus pour 38 rendus — **52,8 %** — quand la partition
     * réelle en demande **36**, soit **105,6 %**. Un dénominateur faux dans le
     * sens PESSIMISTE envoie chercher un défaut là où il n'y en a pas.
     */
    expected: number;
    /**
     * ⟳ LOT `L6′-b` — LE NOM DU ZÉRO, parce qu'un chiffre ne peut pas le porter.
     * `no_batch_cooking` (rien n'était dû: aucun plat ne prélève sur un batch)
     * et `none_delivered` (tout était dû, rien n'est venu) rendaient le MÊME
     * `boxes: 0` et appellent des corrections OPPOSÉES — mesuré sur les dix
     * plans du 2026-08-22, un de chaque. `plan_emptied` dit le troisième zéro
     * (le verrou de sortie a vidé le plan) et `not_asked` le QUATRIÈME: la lane
     * SOLO n'a pas de roster de contenants, et son `{meals: 10, with_box: 0}`
     * en base aurait fait sonner l'alarme sur chaque plan individuel.
     */
    delivery:
      | "plan_emptied"
      | "not_asked"
      | "no_batch_cooking"
      | "none_delivered"
      | "partial"
      | "served";
    refused: number;
    names: number;
    names_refused: number;
    items: number;
    /**
     * ⟳ 2026-09-13 — LA FORME PAR LAQUELLE UN COMPOSANT GARDÉ A ÉTÉ PESÉ.
     *
     *   · `items_in_grams`       — le modèle a écrit `grams`, la clé du schéma v4;
     *   · `items_from_ingredient`— il a écrit une forme d'INGRÉDIENT (`amount` +
     *                              `unit` + `ref`), et le lecteur l'a pesée par le
     *                              référentiel. ⛔ Un nombre non nul ici DIT que le
     *                              prompt de ce chemin n'a pas servi le schéma des
     *                              items: c'est le chemin `portion_v1`, où
     *                              `boxSchemaBlock` est retiré pendant que le bloc
     *                              de régime ordonne toujours une boîte.
     *
     * `items_in_grams + items_from_ingredient === items`, par construction.
     */
    items_in_grams: number;
    items_from_ingredient: number;
    items_refused: number;
    capped: number;
    legacy_folded: number;
    preparations: number;
    sum_checked: number;
    sum_over: number;
    sum_unverifiable: number;
    mouth_slots: number;
    mouths_unboxed: number;
    mouths_double: number;
    mouths_double_model: number;
    /**
     * ⛔ LES CASES QUE `mouth_slots` NE COMPTE PAS — les repas de la fenêtre qui
     * ne portent AUCUN contenant. `mouths_no_box_cell` est le nombre de noms
     * correspondant (`cells_no_box × roster`).
     *
     * Les deux sont une ABSTENTION, pas un défaut: un plat cuisiné le jour même
     * n'a rien de pesé d'avance, et c'est le contrat. Ce qu'ils empêchent est de
     * lire `delivery: "served"` comme « toute la fenêtre est dimensionnée ».
     * Mesuré le 2026-08-23: 2 cases et 6 noms hors dénominateur sur un plan qui
     * s'annonçait servi.
     */
    cells_no_box: number;
    mouths_no_box_cell: number;
  };
  /**
   * LA CEINTURE DE RÉGIME — CE QU'ELLE A LU, GARDÉ, ET RETIRÉ.
   *
   * ⚠️ TROIS NOMBRES AU MOINS, JAMAIS DEUX. `mouths` dit si la ceinture avait
   * quelque chose à garder (« jamais déclaré »), `checked` ce qu'elle a lu, et
   * `refused` ce qu'elle a retiré (« déclaré puis refusé »). Un couple
   * `{demandé, retiré}` rendrait le même zéro pour les deux, et c'est
   * exactement le zéro ambigu qui a laissé cinq plans servir de la viande à un
   * enfant végane sans qu'aucun compteur ne bouge.
   *
   * ⛔ AUCUN `member_id` ICI: c'est un HISTOGRAMME. Les `issues` nomment les
   * bouches par id, comme partout ailleurs dans ce fichier; `generated_from`
   * est lu par tout le foyer et n'a pas à y désigner un enfant.
   *
   * PROPRIÉTÉ TESTÉE: `checked === kept + refused`.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️ SOUS v4 LA CEINTURE CHANGE DE STATUT — ELLE EST LE FILET, PAS LE MODÈLE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * La séparation par régime est une décision de COMPOSITION, et elle appartient
   * au modèle: si le plat porte de la viande et qu'une bouche ne la mange pas,
   * elle doit avoir SON contenant, pas se faire retirer d'un bac. Retirer reste
   * armé pour le cas où le modèle n'a pas séparé — et ce cas se COMPTE:
   *
   *   · `bites`         — les morsures DÉTECTÉES: un couple (plat qui déclare au
   *                       moins un contenant, bouche dont la ligne est mordue
   *                       par ce plat). Le DÉNOMINATEUR, et il ne dépend
   *                       d'aucune décision du modèle.
   *   · `separated`     — celles que la COMPOSITION avait déjà réglées: la
   *                       bouche n'est nommée sur aucun contenant de ce plat,
   *                       donc le modèle l'a servie ailleurs. LE NUMÉRATEUR.
   *   · `not_separated` — celles que le modèle a laissées sur un couvercle, et
   *                       que la ceinture a donc dû retirer.
   *
   * PROPRIÉTÉ TESTÉE: `bites === separated + not_separated`.
   *
   * ⚠️ `not_separated` N'EST PAS `refused`, ET LES DEUX SONT LÀ. `refused` compte
   * des RETRAITS (bouche × contenant): une bouche nommée sur deux couvercles du
   * même plat en vaut deux. `not_separated` compte des ÉCHECS DE COMPOSITION
   * (bouche × plat), et c'est la grandeur qui se compare à `bites`.
   */
  /**
   * ⟳ LOT `L0-a` — LA FENÊTRE DU CUIT, EN TROIS POPULATIONS.
   *
   * ⛔ `within` N'EST PAS DÉCORATIF, C'EST LE POINT DU LOT. Sans lui, on ne
   * distingue pas « la fenêtre a tourné et rien n'a mordu » de « la fenêtre n'a
   * pas tourné » — les deux rendent `violations: 0`, et le second est un lot
   * désarmé qui ressemble à un lot qui marche. C'est le défaut le plus coûteux
   * de la liste, et il a été nommé d'avance.
   *
   *   · `violations`    — couples (casserole, repas) REFUSÉS: le plat est jeté.
   *   · `within`        — couples évalués et tenus.
   *   · `not_evaluated` — couples dont un jour n'a pas pu être situé. Seuil:
   *                       zéro. Un couple non évalué est un couple non gardé.
   *
   * ⚠️ RENDU HORS DE `clean`, même raison que `regime_belt`: « la fenêtre n'a
   * rien refusé » serait un mensonge sur un plan que le verrou a vidé après
   * qu'elle a refusé.
   *
   * ⚠️ LES OCCASIONS NON CUISINÉES À L'AVANCE N'ENTRENT DANS AUCUNE DES TROIS.
   * Sur cinq jours, cinq des quinze occasions sortent du problème: la fenêtre
   * ne les concerne pas, et les compter donnerait quinze là où dix sont en jeu.
   */
  fridge_window: FridgeWindowCounts;
  regime_belt: {
    mouths: number;
    checked: number;
    kept: number;
    refused: number;
    bites: number;
    separated: number;
    not_separated: number;
    silenced: number;
    /**
     * ⟳ 2026-09-04 · COMBIEN DE MORSURES ÉTEINTES PARCE QU'ELLES NOMMAIENT UN
     * USTENSILE et non un aliment (« remplir des moules »).
     *
     * ⛔ IL EXISTE PARCE QUE CETTE EXTINCTION PEUT SE TROMPER. Mesuré sur un
     * plan réel: une bouche végane retirée de sa propre boîte au TOFU trois
     * fois, parce que la recette disait de remplir des moules. Le correctif est
     * une liste fermée de suites qui décrivent un récipient — et le jour où
     * l'une d'elles éteint un vrai coquillage, ce nombre est le seul endroit où
     * ça se verra. Un silence qui ne se compte pas est une faille qui ne se
     * mesure pas.
     */
    silenced_homograph: number;
    silenced_spelling: number;
    unknown_mouth: number;
    /**
     * ÉCHANGE · COMBIEN DE COUVERCLES ONT ÉTÉ JUGÉS SUR LA BOÎTE, pas sur le
     * plat (2026-09-04).
     *
     * Une boîte qui déclare des `items` est jugée sur SES items et sur les
     * casseroles qu'ils citent; une boîte sans items (repli v2) retombe sur le
     * plat. Sans ce nombre, les deux régimes de lecture rendent le même
     * `refused: 0` et rien ne dit lequel a tourné.
     */
    box_scoped: number;
    citation_repaired: number;
    item_repaired: number;
    /**
     * ── LE GROUPE ALIMENTAIRE DÉCLARÉ, EN SIX NOMBRES (2026-08-19) ────────
     *
     * Les trois premiers disent si le MODÈLE obéit; les trois suivants, ce que
     * sa déclaration a CHANGÉ. Il faut les deux triplets: un champ parfaitement
     * rempli mais jamais lu, et un champ jamais rempli, produiraient le même
     * silence côté ceinture — c'est la cicatrice du dépôt, et c'est elle qui a
     * laissé `isPlantAnalogue` vivre écrit, juste et mort.
     *
     *   · `groups_declared` — combien d'ingrédients portaient un `group`.
     *   · `groups_valid`    — combien étaient du vocabulaire fermé.
     *   · `groups_refused`  — combien étaient un slug inventé. DÉCLARÉ PUIS
     *                         REFUSÉ, à ne pas confondre avec « jamais déclaré ».
     *   · `groups_conflicting` — combien étaient VALIDES et pourtant contredits
     *                         par le `ref` de la même ligne (2026-09-13). Le
     *                         référentiel gagne, la ligne part corrigée, et le
     *                         désaccord se compte: `soy_yogurt` déclaré
     *                         `dairy_yogurt` a fait refuser un plan entier.
     *   · `group_excluded`  — combien ont mordu SUR LEUR GROUPE, sans prose.
     *   · `group_plant_only`— combien de faux la déclaration a rendus au silence.
     *   · `group_undecided` — combien sont retombés sur la prose. Tant qu'il
     *                         reste haut, la consigne ne porte pas.
     */
    groups_declared: number;
    groups_valid: number;
    groups_refused: number;
    groups_conflicting: number;
    group_excluded: number;
    group_plant_only: number;
    group_undecided: number;
  };
  /**
   * LA CEINTURE DES EXCLUSIONS PAR BOUCHE — mêmes quatre nombres, même raison.
   * `refused: 0` seul rend le même zéro pour « personne n'a rien exclu » et
   * « rien n'a mordu ». `mouths` et `checked` séparent les deux.
   */
  exclusion_belt: {
    mouths: number;
    checked: number;
    kept: number;
    refused: number;
    /**
     * ÉCHANGE · LA MÊME TRIADE QUE LA CEINTURE DE RÉGIME (2026-09-04), et pour
     * la même raison: sans elle, un modèle qui ne compose JAMAIS la boîte
     * d'échange — donc une ceinture qui retire à chaque fois — est
     * indiscernable d'un foyer où personne n'évite rien.
     *
     *   · `bites`         — combien de PLATS mordent la ligne d'une bouche.
     *   · `separated`     — combien le modèle avait déjà séparés en boîtes.
     *   · `not_separated` — combien la ceinture a dû retirer elle-même.
     *   · `box_scoped`    — combien de couvercles jugés sur la boîte.
     */
    bites: number;
    separated: number;
    not_separated: number;
    box_scoped: number;
  };
  /**
   * CE QUE LA CEINTURE A RETIRÉ, PAR PRÉPARATION — pour l'AUTRE surface.
   *
   * ⚠️ RENDU, ET PAS SEULEMENT COMPTÉ. `member_portions[].preparation_shares`
   * est une SECONDE affectation de la même préparation à la même bouche, lue
   * sous le plat à l'écran, et elle ne passe pas par les boîtes. Sans cette
   * liste, `reconcilePortions` devrait refaire le scan — deux lectures d'une
   * même liste fermée qui divergeraient au premier aliment ajouté. C'est la
   * cicatrice « garde posée sur un seul des deux champs », déjà payée sur les
   * ids de boîte qui fuyaient dans les notes de part.
   *
   * Forme plate (et pas une `Map`) parce que cette structure traverse la même
   * frontière que les autres compteurs du plan.
   */
  regime_refusals: readonly { preparation_id: string; member_ids: readonly string[] }[];
  /**
   * LOT 4 — LES INGRÉDIENTS D'UN PLAT QUI N'ONT PAS DE NOMBRE.
   *
   * ⛔ DÉTERMINISTE, ET AUCUN MATCHER. Le champ `amount` est DÉJÀ structuré
   * (FF-038, `== SAY THE SAME QUANTITY TWICE ==`): compter `amount === null`
   * est une lecture, pas une devinette sur de la prose. Lire « une poignée de »
   * dans `quantity` serait exactement le matcher maison que ce dépôt refuse —
   * « laitue » ≠ « lait », douze faux positifs sur douze mesurés.
   *
   * ⚠️ LES INGRÉDIENTS DE PLAT SEULEMENT, PAS CEUX DES PRÉPARATIONS. P4 parle
   * du COMPLÉMENT DU JOUR — « fais cuire 100 g de pâtes sèches », « un demi
   * citron » — c'est-à-dire ce qu'on ajoute au moment de manger. Le lot, lui, se
   * pèse une fois et sa mesure est déjà `structured_quantity_missing`. Les
   * mélanger rendrait un chiffre qu'aucune consigne ne vise.
   *
   * ⚠️ IL COMPTE, IL NE REJETTE PAS. « Sel, poivre, herbes » ont droit à la
   * pincée (le prompt le dit depuis FF-038), donc un plan sain n'est jamais à
   * zéro et ce nombre n'est pas un verdict: c'est la mesure qui dira si la
   * consigne resserrée du LOT 4 a porté.
   */
  unquantified_dish_ingredients: {
    /** Les ingrédients des plats GARDÉS. Le dénominateur. */
    ingredients: number;
    /** Ceux dont `amount` est `null`. */
    unquantified: number;
  };
  issues: string[];
  lock: OutputLockResult;
}

/** Une case de la grille des repas: un jour, un moment. */
export interface MealSlotCase {
  day: string;
  slot: EatingOccasion;
}

/**
 * OÙ UNE VIOLATION A MORDU — ⟳ 2026-09-12 · FERMETURE LOT 2.
 *
 * ⚠️ `unlocalized` EST UNE RÉPONSE, pas une absence: le verrou a mordu sur le
 * texte concaténé et sur aucune surface isolée. Il garde un blocage GLOBAL, et
 * c'est la seule chose honnête à cet endroit.
 */
export interface UnsafeViolation {
  /**
   * ⟳ 2026-09-13 · LOT 1 — `cooking_session` ET `box_item` SONT NEUFS.
   *
   * ⛔ Le déroulé d'une session n'était contrôlé nulle part (revue du
   * 2026-09-12, P1 §2) ; les libellés de contenant l'étaient sous le nom
   * `portion_note`, ce qui rendait un relevé illisible. Les familles viennent
   * maintenant de `OUTPUT_SURFACE_KINDS`, et ce type les recopie parce qu'il
   * en porte deux de plus, qui ne sont pas des surfaces de texte.
   */
  readonly where: OutputSurfaceKind | "declared_group" | "unlocalized";
  /** L'index dans `dishes`, quand la surface en est un. */
  readonly index: number | null;
  /** L'index dans `cooking_sessions`, quand la surface en est une. */
  readonly sessionIndex: number | null;
  readonly day: string | null;
  readonly slot: string | null;
  readonly title: string | null;
  readonly memberId: string | null;
  readonly preparationId: string | null;
  /**
   * ⛔ LES CASSEROLES QUE LA SURFACE PORTE OU TIRE, et les BOUCHES qu'elles
   * nourrissent — toutes, sur toutes les dates. Une session partagée n'est pas
   * attribuable à une personne : on nomme l'ensemble concerné plutôt que le
   * premier membre rencontré.
   */
  readonly preparationIds: readonly string[];
  readonly memberIds: readonly string[];
  /** Le terme en cause, ou l'extrait de la note. */
  readonly term: string | null;
  /** Les jetons qui ont mordu. ⛔ Pour le journal, jamais pour l'écran. */
  readonly tokens: readonly string[];
}
