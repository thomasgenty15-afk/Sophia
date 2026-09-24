// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE BUDGET DE PLATS, LES SESSIONS ET LES JOURS DE CUISINE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `MAX_FRIDGE_DAYS`, `batchSessionBudget`, `dishCapFor`,
// `MergedEater`, `dishBudgetFor`, `usableCookDays` et `addedCookDays`. Le
// prompt et le parseur (`meal_prompt.ts`, `meal_parse.ts` depuis le lot
// 2d-2) lisent tous les deux le même budget par `dishBudgetFor`.
//
// Les trois commentaires d'en-tête qui précèdent `MAX_FRIDGE_DAYS` sont
// restés dans l'ordre d'origine (le premier décrit `dishCapFor`, le second
// `batchSessionBudget`).

// Aucun cycle: `household_portions.ts` n'importe aucune valeur de
// `meal_generation.ts` ni de ce module.
import { type CookingShape, mergeDishBonus } from "./household_portions.ts";
import {
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  type MealScope,
} from "./meal_vocabulary.ts";

/**
 * Combien de plats, selon le périmètre demandé.
 *
 * R6: chaque valeur de `scope` est lue par une branche NOMMÉE. Le plafond est
 * volontairement bas — une semaine de vingt plats est une semaine qu'on
 * abandonne le mercredi, et la même logique vaut pour une liste de courses
 * qu'on ne finit pas de lire.
 */
/**
 * Combien de vraies sessions de cuisine on s'autorise sur la période.
 *
 * Dérivé du plafond de plats plutôt que posé à côté: les deux bougeraient
 * séparément sinon, et on se retrouverait à demander vingt-et-un plats en cinq
 * sessions ou l'inverse. Un tiers, arrondi — assez pour un plat frais par jour
 * ou deux, pas assez pour tout cuisiner à la volée.
 */
/**
 * Combien de jours un lot cuisiné tient au réfrigérateur, au maximum.
 *
 * Trois, et le même chiffre pour tout. Le prompt est plus fin (riz et produits
 * de la mer: le jour même ou le lendemain); ce seuil-ci est le filet
 * déterministe, et il reste grossier exprès — le raffiner par famille
 * d'aliment demanderait de CLASSER chaque préparation, donc de déduire, sur le
 * seul sujet de ce moteur où une erreur rend malade.
 *
 * ⛔ CE QUE « TROIS » VEUT DIRE — décision produit n° 14 du 2026-08-21, et elle
 * n'était écrite NULLE PART avant le lot `L0-a` (2026-08-22).
 *
 *     TROIS JOURS OÙ ÇA SE MANGE, JOUR DE CUISSON INCLUS.
 *     Cuit vendredi ⇒ mangé vendredi, samedi, dimanche. **Lundi est trop
 *     tard.** Donc un ÉCART de 0, 1 ou 2 — jamais 3.
 *
 * La comparaison était écrite `> MAX_FRIDGE_DAYS` et accordait donc QUATRE
 * jours: « cuit dimanche, mangé mercredi — ça passait ». Elle est maintenant
 * `>=`, portée par `cookedWindowVerdict` (`fridge_window.ts`), qui est le seul
 * endroit où elle s'écrit.
 *
 * ⚠️ CETTE CONSTANTE N'EST QUE LA MOITIÉ DE LA CONSERVATION. Il y a DEUX
 * fenêtres et elles se CHAÎNENT:
 *
 *     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
 *
 * Celle-ci est la SECONDE. La première vit par GROUPE
 * (`food_groups.raw_window_days`, miroir `RAW_WINDOW_DAYS` dans
 * `fridge_window.ts`) et gouverne la DATE DE COURSES (`grocery_waves.ts`).
 * Avant `L0-a` elle n'existait pas et `grocery_waves.ts` posait CE nombre-ci à
 * sa place: trois jours de frigo cru pour tout le monde, y compris une
 * volaille fraîche qui en tient deux.
 *
 * ⚠️ QUATRE FICHIERS L'IMPORTENT OU LA RÉ-EXPORTENT — `grocery_waves.ts:59+`,
 * `accident.ts:1739`, `accident_io.ts:471`, `chat/accident_tap.ts`, plus
 * `frontend/src/keel/api/groceryWaves.ts` qui réexporte le réexport. Aucune ne
 * la RECOPIE, et c'est la propriété à préserver: « deux copies d'un même
 * nombre divergent, et c'est celle qu'on regarde le moins qui garde
 * l'ancienne ».
 */
export const MAX_FRIDGE_DAYS = 3;

export function batchSessionBudget(cap: number): number {
  return Math.max(2, Math.round(cap / 3));
}

/**
 * Le plafond de repas COUVERTS.
 *
 * ── IL SUIT LE RYTHME DE L'ÉLÈVE, ET C'EST LE POINT ─────────────────────
 * Le plafond de la semaine valait 21 = 7 jours × 3 repas. Le « × 3 » était
 * l'hypothèse silencieuse que tout le monde mange trois fois: quelqu'un qui
 * mange deux fois recevait un budget d'un tiers trop grand, et quelqu'un qui
 * mange cinq fois voyait ses deux dernières occasions tomber hors plafond —
 * c'est-à-dire disparaître, sans que rien ne le dise.
 *
 * Le plafond est donc la même arithmétique, avec le vrai nombre. Sans rythme
 * déclaré, la fonction rend EXACTEMENT ce qu'elle rendait avant ce chantier —
 * c'est ce qui le rend additif: un élève qui ne remplit rien reçoit la semaine
 * d'hier, au plat près.
 */
export function dishCapFor(
  scope: MealScope,
  rhythm: readonly EatingOccasionSlot[] = [],
  /**
   * COMBIEN DE JOURS ON REMPLIT VRAIMENT — sept par défaut, et rarement sept.
   *
   * La semaine s'arrête DIMANCHE (`daysUntilSunday`): un plan fait le jeudi en
   * couvre quatre. Le plafond doit suivre, sinon il ouvre un budget pour des
   * jours qui n'existent pas — et le modèle, à qui on annonce « au plus 28
   * plats », déborde poliment sur la semaine suivante pour le remplir. C'est
   * exactement le défaut rapporté: un plan du jeudi qui proposait à manger
   * jusqu'au mercredi d'après.
   */
  daysToFill = 7,
): number {
  // ── UNE SEULE SOURCE POUR « COMBIEN DE FOIS ON MANGE » ───────────────────
  // Le repli sans rythme était une paire de nombres écrits à la main (4 et 21)
  // à côté d'un `DEFAULT_EATING_RHYTHM` qui en compte 3. Les deux copies ont
  // divergé exactement comme ce fichier prédit qu'elles divergent: le 2026-08-05
  // le repli `day` est passé de 3 à 4 pendant que le rythme par défaut restait à
  // trois moments, et `buildMealPrompt` s'est mis à DEMANDER trois plats tout en
  // en ACCEPTANT quatre.
  //
  // Il n'y a donc plus de repli chiffré: l'absence de rythme déclaré EST le
  // rythme par défaut, et l'arithmétique est la même pour les deux. Le « × 7 »
  // reste ce qu'il était (21 = 3 × 7, au plat près), donc le chantier du rythme
  // demeure additif pour un élève qui n'a rien rempli.
  //
  // LE « × 7 » BORNE LES REPAS COUVERTS, PAS LES SESSIONS DE CUISINE. Le
  // plafond de la semaine est passé de 8 à 21 parce qu'à 8 une semaine demandée
  // rendait une semaine TROUÉE — lundi dîner, mardi petit-déjeuner et dîner,
  // puis plus rien. « Une semaine de vingt plats est une semaine qu'on abandonne
  // le mercredi » était vrai tant qu'un plat coûtait une session; le BATCH casse
  // cette équivalence, et c'est le prompt qui borne les sessions
  // (`batchSessionBudget`).
  const occasions = rhythm.length > 0 ? rhythm : DEFAULT_EATING_RHYTHM;
  // `switch` et pas un ternaire: c'est lui qui rend le R6 vrai par construction
  // — un scope ajouté sans plafond ne compile pas (« not all code paths return
  // a value »), là où un ternaire lui donnerait silencieusement celui de la
  // semaine.
  const days = Math.max(1, daysToFill);
  switch (scope) {
    case "day":
      return occasions.length;
    case "several_days":
      return occasions.length * days;
  }
}

/**
 * L4/D6 — UNE BOUCHE REPRISE PAR LA FUSION, TELLE QUE LE BUDGET LA VOIT.
 *
 * `null` sur la lane INDIVIDUELLE et sur toute composition de foyer ordinaire;
 * renseigné uniquement par `operation: "merge"`.
 */
export interface MergedEater {
  /** Le barreau décidé par `mergeLadder` (D6). Jamais deviné ici. */
  shape: CookingShape;
  /**
   * COMBIEN DE PLATS PROPRES LA CONSIGNE DE FUSION MET SOUS LES YEUX DU MODÈLE.
   *
   * C'est la liste de `buildMergeBlock`, APRÈS le filtre de fenêtre et APRÈS
   * `MERGE_MATERIAL_CAP` — `mergeMaterialShown()` la rend, et c'est la seule
   * façon correcte de la compter: un budget ouvert sur des plats que le modèle
   * ne voit pas est un budget qu'il remplit avec autre chose.
   */
  ownDishesShown: number;
  /**
   * C6 — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE DE FUSION RÉCLAME.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la HUITIÈME fois que ce fichier écrit
   * cette phrase. Depuis C6, `buildMergeBlock` ne demande plus « ADD ONE dish »
   * mais un plat À CHAQUE REPAS de la personne reprise (mesuré: un seul plat
   * pour neuf créneaux, la casserole commune 8 fois sur 9). Le budget qui
   * comptait la seule MATIÈRE laisserait la consigne réclamer neuf plats dans
   * un plafond ouvert pour six — et le parseur jette les DERNIERS, c'est-à-dire
   * le dîner du dimanche du foyer.
   *
   * `0` aux barreaux ① (aucun plat dédié n'est demandé), et le bonus est nul de
   * toute façon.
   */
  dedicatedDishesAsked: number;
  /**
   * C7 ② — LES CASES OÙ LA PERSONNE REPRISE MANGE ICI, jour et moment.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la NEUVIÈME fois que ce fichier écrit
   * cette phrase, et ici l'oubli a un coût nommé: `[]` fait retomber TOUT
   * second plat d'une case dans le surplus, donc le plat DÉDIÉ redevient la
   * première chose que le plafond sacrifie — c'est-à-dire exactement le défaut
   * mesuré le 2026-08-12 (la relance a rendu 20 plats, 18 ont été gardés, et
   * les deux tombés étaient le déjeuner ET le dîner du dimanche de la personne
   * reprise).
   *
   * ⚠️ CE SONT SES CASES À ELLE, PAS CELLES DU PLAN: la MÊME liste que le
   * dénominateur du constat de forme (`memberMealCells`, C3 ⑥), et le même
   * nombre que `dedicatedDishesAsked`. Deux listes calculées séparément
   * finiraient par se contredire, et c'est le budget qui perdrait.
   *
   * `[]` aux barreaux ①: aucun plat dédié n'est demandé, donc aucun second
   * plat n'est protégé — et c'est juste, la consigne y dit « Do NOT propose
   * separate dishes ».
   */
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1A ② — CHAQUE CASE DIT **QUI** Y ATTEND UN PLAT
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE COUPLE (CASE, BOUCHE) N'EXISTAIT NULLE PART, ET C'EST CE QUI REND
   * LE POINT 6 DE LA CLÔTURE POSSIBLE. Deux listes plates — les cases d'un
   * côté, `dishBearerIds` de l'autre — laissent le parseur accepter un plat
   * adressé à **Lea** sur une case où la grille attend **Nils**: les deux
   * lectures passent, et l'obligation de Nils disparaît sans qu'aucune ligne
   * ne s'en plaigne. Mesuré: `asked: 12 · attributed: 0`.
   *
   * `memberId: null` = « cette case ouvre une place, la grille ne dit pas pour
   * qui ». C'est le chemin de FUSION, où `dishBearerIds` nomme UNE personne et
   * où la question ne se pose pas; il reste accepté à l'octet près.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un `?` oublié ferait retomber toutes les
   * cases sur `null`, c'est-à-dire sur la porte grande ouverte d'avant ce lot —
   * une garde désarmée qui ressemble à une garde qui marche.
   */
  dedicatedCells: readonly {
    day: string;
    slot: string;
    memberId: string | null;
  }[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C — QUI REÇOIT CES PLATS DÉDIÉS. Les ids EXACTS, ceux du prompt.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE TROU QUE CE CHAMP FERME, MESURÉ LE 2026-08-14. Les clés d'un plat en
   * base sont `title, why, uses, method, slot, day, ingredients, servings_made,
   * preparation_id, id, honours_belief_keys` — AUCUNE attribution. Le seul
   * marqueur qu'un plat dédié est celui de Zoé était le texte libre « for Zoe »
   * dans le TITRE, écrit par le modèle. La vue par personne montrait donc le
   * plat dédié de Zoé dans la semaine de Kid.
   *
   * ⛔ ET ON NE DEVINE PAS DEPUIS LE TITRE. « Jamais de matcher maison » est une
   * cicatrice mesurée de ce dépôt (12 faux positifs sur 12), et ici un matcher
   * attribuerait de travers dès « Chicken for Zoe and Marc », et rien du tout
   * dès que le plan sort en français.
   *
   * ⚠️ ET LE CALCUL NE PEUT PAS TRANCHER NON PLUS. Sur une case dédiée il y a
   * DEUX plats — celui de la table et le sien. Lequel est lequel n'est pas
   * décidable de l'extérieur: c'est le MODÈLE qui vient de composer les deux.
   * D'où un champ qu'il déclare (`for_member_id`), validé contre cette liste
   * fermée — le patron exact de `preparation_id` (inventé par le modèle,
   * vérifié contre `preparations[].id`) et de `member_portions[].member_id`,
   * qui utilise DÉJÀ ces mêmes ids et qui fonctionne en production.
   *
   * ⚠️ REQUIS, `T`, jamais `T?`. C'est la DIXIÈME fois que ce fichier écrit
   * cette phrase. Un `?` ici serait parfaitement silencieux: la liste vide
   * refuse toute attribution, donc le lot serait construit, branché et désarmé
   * — « une ceinture armée sur un coffre vide ».
   *
   * `[]` au barreau ①: aucun plat dédié n'est demandé, donc aucun plat n'est
   * attribuable, et le parseur refuse toute attribution qui arriverait quand
   * même.
   */
  dishBearerIds: readonly string[];
}

/**
 * LE BUDGET DE PLATS SERVI AU MODÈLE — et le SEUL nombre que les deux bouts
 * lisent.
 *
 * ⚠️ IL EXISTE PARCE QUE LE PROMPT ET LE PARSEUR DOIVENT BOUGER ENSEMBLE. C'est
 * le défaut d'origine de ce fichier, écrit deux fois dans `dishCapFor`: annoncer
 * un budget et en appliquer un autre est pire que n'en avoir aucun. Les deux
 * appels passent donc par cette fonction, avec les mêmes entrées.
 *
 * ── POURQUOI `dishCapFor` N'A PAS CHANGÉ DE SIGNATURE ─────────────────────
 * Parce que la lane INDIVIDUELLE ne doit pas bouger d'un plat, et que la
 * meilleure preuve qu'elle n'a pas bougé est que la fonction qui la borne est
 * restée identique, avec ses tests inchangés. Le supplément de fusion est une
 * couche AU-DESSUS, nulle par défaut.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ③ — LE PLAFOND DU SUPPLÉMENT COMPTE LES BOUCHES, ET IL N'EN COMPTAIT
 *           QU'UNE. MESURÉ LE 2026-08-19.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE MÊME MESSAGE DISAIT DEUX NOMBRES INCOMPATIBLES, À 130 LIGNES D'ÉCART.
 * Sur le foyer de l'étape ⑤ (2 jours × 2 créneaux, DEUX bouches qui ne peuvent
 * pas manger la casserole commune), `prompt-user.txt` porte:
 *
 *     l. 116  how much: several_days (at most 8 dishes)
 *     l. 249  That is 6 extra dishes on top of the table's meals, and the
 *             dish budget above already has room for them.
 *
 * Les repas de la table valent 4. 4 + 6 = 10, et le budget en ouvrait 8. La
 * phrase « the dish budget already has room for them » était FAUSSE, et la
 * ligne suivante nomme elle-même le prix: « a window where these people have
 * no dish of their own is a window where they do not eat ». Mesuré sur quatre
 * runs à entrées byte-identiques: 6 plats propres demandés, 4 déclarés, et
 * TOUJOURS la même bouche évincée (1 plat livré sur 8 demandés).
 *
 * ── LA CAUSE, ET POURQUOI ELLE EST DANS CE FICHIER-CI ────────────────────
 * `mergeDishBonus` borne le supplément par `baseCap`, et sa raison est écrite:
 * « Une bouche de plus mange au plus ce qu'une bouche mange: créneaux × jours ».
 * Elle est juste — pour UNE bouche. La FUSION n'en reprend jamais deux, donc le
 * plafond y était exact. Une composition ORDINAIRE de foyer, elle, passe par le
 * même canal avec N bouches divergentes, et le plafond d'UNE les bornait toutes:
 * à N = 2 il manque un tiers du budget, à N = 3 la moitié, à toute taille de
 * fenêtre.
 *
 * Le correctif est donc au point d'appel et pas dans `mergeDishBonus`: la borne
 * est « ce que les bouches de plus peuvent manger », et avec N bouches c'est
 * N × (créneaux × jours). C'est la MÊME phrase que celle déjà écrite là-bas,
 * lue avec le bon N. Le nombre de bouches n'est pas deviné: c'est
 * `dishBearerIds`, la liste FERMÉE que la consigne nomme une par une et que le
 * parseur utilise déjà pour valider `for_member_id`. Deux lectures d'un même
 * nombre ne peuvent pas diverger quand il n'y en a qu'une.
 *
 * ⚠️ TROIS POPULATIONS NE BOUGENT PAS D'UN PLAT, et c'est vérifiable sans run:
 *   · la lane INDIVIDUELLE — `merge === null`, on sort avant;
 *   · toute FUSION — elle reprend UNE personne (`dishBearerIds.length <= 1`),
 *     donc la borne vaut `base × 1`, c'est-à-dire `baseCap`, octet pour octet;
 *   · tout foyer à UNE seule bouche divergente — même arithmétique.
 * Seul un foyer à DEUX bouches divergentes ou plus voit le nombre changer, et
 * c'est exactement la population qui était sous-servie.
 *
 * ⚠️ CE N'EST PAS L'ÉVICTION. Quel plat est sacrifié quand le plafond mord est
 * une autre question, et elle vit ailleurs (`dedicatedCells`, la garde de
 * surplus). Ici on ouvre la place que la consigne réclame; on ne touche pas à
 * l'ordre dans lequel on la reprend.
 */
export function dishBudgetFor(args: {
  scope: MealScope;
  rhythm: readonly EatingOccasionSlot[];
  daysToFill: number;
  /**
   * ⚠️ REQUIS, `T | null`, jamais `T?`. C'est la SEPTIÈME fois que ce fichier
   * écrit cette phrase, et il l'a payée les six précédentes. Ici l'oubli est le
   * défaut mesuré du 2026-08-12: le budget resterait celui d'une table sans
   * bouche de plus, le modèle déborderait d'un plat, et le parseur jetterait
   * LE DERNIER de la liste — c'est-à-dire le dîner du dimanche du foyer, pas le
   * plat en trop.
   */
  merge: MergedEater | null;
}): number {
  const base = dishCapFor(args.scope, args.rhythm, args.daysToFill);
  if (args.merge === null) return base;
  // LOT C ③ — COMBIEN DE BOUCHES DE PLUS, LU SUR LA LISTE FERMÉE QUE LA CONSIGNE
  // NOMME. `Math.max(1, …)` et pas `|| 1`: une liste vide veut dire « personne
  // ne reçoit de plat à lui » — le supplément est alors nul de toute façon
  // (`mergeDishBonus` rend 0 au barreau ①) — et un plancher à 1 garde la borne
  // strictement identique à celle d'avant ce lot sur toutes les autres branches.
  const extraMouths = Math.max(1, args.merge.dishBearerIds.length);
  return base + mergeDishBonus({
    cooking: args.merge.shape,
    ownDishesShown: args.merge.ownDishesShown,
    // C6 — LE BUDGET SUIT CE QUE LA CONSIGNE RÉCLAME, pas seulement ce qu'elle
    // montre. Voir `mergeDishBonus`.
    dedicatedDishesAsked: args.merge.dedicatedDishesAsked,
    // ⚠️ `base × bouches`, ET C'EST LA MÊME PHRASE QUE CELLE ÉCRITE DANS
    // `mergeDishBonus` — « une bouche de plus mange au plus ce qu'une bouche
    // mange » — lue avec le vrai nombre de bouches. Le paramètre est la BORNE de
    // ce que les mangeurs supplémentaires peuvent réclamer; il valait `base`
    // parce que la fusion n'en reprend qu'un, et il bornait à un seul mangeur
    // les N divergents d'une composition ordinaire. Voir l'en-tête.
    baseCap: base * extraMouths,
  });
}

/**
 * LES JOURS DE CUISINE QUI EXISTENT ENCORE DANS CETTE FENÊTRE.
 *
 * Les jours cochés sont une propriété de la SEMAINE TYPE de l'élève; la fenêtre
 * est ce qu'il en reste. C'est l'intersection qui est exécutable — un « je
 * cuisine le dimanche » ne pose aucune session dans un plan qui va du lundi au
 * vendredi.
 *
 * ⚠️ EXTRAITE LE 2026-09-01, ET L'EXTRACTION EST LA MOITIÉ DU LOT. Ce calcul
 * vivait EN LIGNE dans `cookDayLines`, donc la consigne servie au modèle était
 * la seule à le connaître. `explainPlanChoices` ne pouvait pas le lire, tombait
 * dans sa branche « gardé » et affirmait « tu cuisines dimanche, et c'est ce
 * qui a été gardé » sur un plan d'où le dimanche venait d'être RETIRÉ. Un fait
 * faux, déterministe, qu'aucun test ne pouvait attraper puisque les deux
 * moitiés ne partageaient rien.
 *
 * C'est la raison d'être documentée de `addedCookDays` juste en dessous, mot
 * pour mot: une seule définition, deux lecteurs — sans quoi c'est l'explication
 * qui a tort.
 *
 * ⚠️ FENÊTRE VIDE ⇒ ON REND LES JOURS DÉCLARÉS TELS QUELS. C'est le
 * comportement de `cookDayLines` depuis l'origine, et il est juste: sans
 * fenêtre connue, on ne peut affirmer qu'aucun jour n'a été écarté. `[]` dirait
 * « tous ont été retirés », ce que personne n'a mesuré.
 *
 * Rend `[]` — jamais `null` — quand rien n'a été coché.
 */
export function usableCookDays(input: {
  /** Les jours COCHÉS par l'élève. `[]` = il n'en a coché aucun. */
  declared: readonly string[];
  /** Les jours de la fenêtre, dans l'ordre. `[]` = fenêtre inconnue. */
  window: readonly string[];
}): string[] {
  const declared = input?.declared ?? [];
  const window = input?.window ?? [];
  if (declared.length === 0) return [];
  if (window.length === 0) return [...declared];
  return declared.filter((d) => window.includes(d));
}

/**
 * LES JOURS DE CUISINE QUE LE MOTEUR AJOUTE, ET QUE L'ÉLÈVE N'A PAS COCHÉS.
 *
 * ── LA CONTRAINTE DOIT RESTER SATISFAISABLE ───────────────────────────────
 * MESURÉ le 2026-08-12: jours déclarés `sun, wed`, fenêtre jeudi→dimanche.
 * L'intersection ne laisse que DIMANCHE — le dernier jour. Le modèle a donc
 * fait manger jeudi, vendredi et samedi sur un lot cuisiné le dimanche: quatre
 * repas antérieurs à leur propre cuisson, et un plan inexécutable.
 *
 * Un jour de cuisine qui arrive APRÈS les repas qu'il doit nourrir n'est pas
 * une contrainte, c'est une impasse. On ajoute donc le premier jour CUISINABLE
 * de la fenêtre. Le pire cas est une session posée un jour non déclaré, qu'on
 * déplacera; l'autre pire cas est une semaine qu'on ne peut pas cuisiner.
 *
 * ── EXPORTÉE PARCE QUE DEUX LECTEURS DOIVENT DIRE LE MÊME JOUR ────────────
 * La consigne demande au modèle de DIRE que ce jour est un ajout. Le run réel
 * montre qu'il ne l'a pas dit — d'où `plan_rationale`, qui le dit de façon
 * déterministe. Si l'explication recalculait l'ajout de son côté, elle finirait
 * par nommer un autre jour que celui de la consigne, et ce serait l'explication
 * qui aurait tort. Une seule définition, deux lecteurs.
 *
 * ⚠️ `firstDayCookable` est REQUIS et sans défaut: passé la coupure courses, le
 * jour ajouté est le SUIVANT (voir `plan_hours.ts`). `true` est une
 * affirmation, pas un repli.
 *
 * Rend `[]` — jamais `null` — quand il n'y a rien à ajouter, ce qui est le cas
 * nominal.
 */
export function addedCookDays(input: {
  /** Les jours COCHÉS par l'élève. `[]` = il n'en a coché aucun. */
  declared: readonly string[];
  /** Les jours de la fenêtre, dans l'ordre. `[]` = fenêtre inconnue. */
  window: readonly string[];
  /** Le premier jour de la fenêtre est-il encore cuisinable ? REQUIS. */
  firstDayCookable: boolean;
}): string[] {
  if (typeof input?.firstDayCookable !== "boolean") {
    throw new Error(
      "[keel/meal_generation] addedCookDays: firstDayCookable est REQUIS et booléen — " +
        "un appelant qui n'a pas lu l'horloge passe `true`, il ne l'hérite pas",
    );
  }
  const window = input.window ?? [];
  const declared = input.declared ?? [];
  if (declared.length === 0 || window.length === 0) return [];
  // ⚠️ `usableCookDays`, JAMAIS UN SECOND FILTRE. Le `window.length === 0`
  // ci-dessus a déjà tranché le cas où elle rendrait les jours déclarés tels
  // quels, donc les deux lecteurs voient exactement la même liste.
  const usable = usableCookDays({ declared, window });
  if (usable.length === 0) return [];
  // Le premier jour de la fenêtre, ou le suivant s'il est déjà trop tard pour
  // lui. Quand il n'y a pas de jour suivant, il n'y a rien à ajouter — et la
  // consigne ordinaire est alors vraie.
  const first = input.firstDayCookable ? window[0] : window[1];
  if (first === undefined || usable.includes(first)) return [];
  const earliest = Math.min(...usable.map((d) => window.indexOf(d)));
  return earliest > window.indexOf(first) ? [first] : [];
}
