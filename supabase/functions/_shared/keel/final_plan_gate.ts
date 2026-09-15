/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — LA GARDE FINALE DU PLAN. Une seule passe, sur ce qui est ÉCRIT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LES PLANS DE PRODUCTION ─────
 * Le générateur de foyer REFUSE (422) ~2 500 lignes AVANT d'écrire le plan.
 * Tout ce qui se passe APRÈS cette garde — pliage des boîtes, ceinture des
 * exclusions, densification, rattrapage des bouches, vagues de courses —
 * MUTE le plan et ne repasse par aucune vérification. Le plan persisté n'est
 * donc pas celui qui a été validé, et quatre défauts l'ont prouvé :
 *
 *   ① une préparation cuisinée JEUDI, mangée MERCREDI ;
 *   ② une ligne de courses de poisson achetée LUNDI, cuisinée JEUDI, sans
 *     aucun drapeau de congélation — trois jours de chair crue au frigo ;
 *   ③ une exclusion de TABLE servie quand même, la violation n'étant listée
 *     que dans `issues` — un tableau que personne ne relit ;
 *   ④ un plan écrit avec ZÉRO boîte là où huit étaient attendues.
 *
 * Aucun des quatre n'était un mensonge du modèle : le modèle avait rendu un
 * plan cohérent, et c'est la chaîne d'APRÈS qui l'a défait.
 *
 * ── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ──────────────────────────
 * Il est UNE passe PURE sur le payload EXACTEMENT tel qu'il part en base
 * (snake_case, pas la forme mémoire `GeneratedMeal`), appelable DEUX fois :
 *
 *   · à la composition, juste avant l'écriture ;
 *   · à l'ADOPTION, plus tard, quand aucun appel modèle n'a lieu — c'est le
 *     chemin qui n'a JAMAIS eu de garde, et c'est pour lui que ce module est
 *     typé sur la forme persistée plutôt que sur la forme mémoire.
 *
 * Il ne compose rien, ne relance rien, n'écrit rien. Il RÉPOND, et il PROPOSE
 * des réparations que l'appelant applique s'il le veut.
 *
 * ── LES DÉNOMINATEURS SONT LA MOITIÉ DU RÉSULTAT ─────────────────────────
 * ⛔ UNE CAUSE À ZÉRO DONT LE DÉNOMINATEUR EST À ZÉRO NE VEUT PAS DIRE
 * « PROPRE » : elle veut dire « JAMAIS ÉVALUÉE ». C'est la cicatrice n° 1 de
 * ce dépôt — « un lot désarmé ressemble trait pour trait à un lot qui
 * marche ». `counters.checked` porte les douze dénominateurs pour que la
 * différence se LISE, et le premier test de ce module est la CASE QUI PASSE :
 * zéro refus ET douze dénominateurs strictement positifs. Une garde qui refuse
 * tout ressemble aussi à une garde qui marche.
 *
 * ── L'ÉNERGIE SERVIE : ON MESURE, ON NE MORD PAS ─────────────────────────
 * Le moteur a CESSÉ de redimensionner les portions : l'ancre des bouches, la
 * densification des boîtes et les deux passes de croissance des casseroles
 * sont devenues des MESURES, et les grammes servis sont exactement ceux que le
 * modèle a composés — on arrête de rattraper après coup une composition
 * fausse, on fait en sorte que la composition tombe juste. Le prix de cette
 * décision est connu et CHIFFRÉ : un plan ne nourrit que 65 à 72 % de sa
 * propre enveloppe énergétique, même dans le cas SANS contrainte, et c'est le
 * redimensionnement d'après-coup qui cachait ce trou. Le retirer rend l'écart
 * réel — et un écart réel que personne ne mesure, c'est un faux chiffre
 * remplacé par du silence.
 *
 * `mouth_energy_short` dit cet écart, et rien de plus. ⛔ CE MODULE NE
 * RECALCULE PAS LES KILOCALORIES : elles demandent l'index de composition, qui
 * n'est PAS dans le payload persisté. L'appelant MESURE (`ctx.energy`), la
 * garde COMPARE et RAPPORTE. Et elle COMPTE au lieu de refuser dans les TROIS
 * politiques : sous-nourrir est une question de QUALITÉ DE COMPOSITION, pas une
 * incohérence du plan, et refuser un plan pour ça priverait des gens de dîner
 * sur un seuil que personne n'a encore calibré.
 *
 * ── LA SÉVÉRITÉ N'EST PAS DANS LE MODULE, ELLE EST DANS LA POLITIQUE ─────
 * Trois politiques livrées (`LOT_1` compte tout, `LOT_2` refuse le noyau,
 * `LOT_3` y ajoute les courses). Le déploiement se fait en changeant la
 * politique, jamais le code de la garde — c'est ce qui permet de MESURER un
 * lot avant de le laisser mordre.
 *
 * ── LE RISQUE DE PRÉCISION, ÉCRIT ICI ────────────────────────────────────
 * `title_promises_missing_preparation` est la seule règle qui lit de la PROSE.
 * On ne peut pas savoir quelle préparation a été retirée, donc on ne peut pas
 * comparer un titre à une absence : la règle se réduit à un VOCABULAIRE FERMÉ
 * de promesses de cuisine par lots (« une portion du batch », « préparé
 * dimanche »…) sur un plat qui ne CITE aucune préparation. Elle est étroite
 * exprès : un faux positif y coûte une phrase effacée, jamais une assiette.
 * Toutes les autres règles lisent des `term` DÉCLARÉS
 * (`dishBitesExclusion(..., surface: "ingredients")`), jamais la prose —
 * un faux positif sur la prose coûterait un plan entier.
 *
 * PURE MODULE: no I/O, no clock, no randomness, and it NEVER mutates its
 * input (épinglé par `structuredClone` côté test).
 */

import {
  cookedWindowVerdict,
  type KeptWhere,
  keptWindowDays,
} from "./fridge_window.ts";
import {
  type DeliveredDish,
  type DeliveredMouth,
  mealsDelivered,
} from "./meals_delivered.ts";
import { dishBitesExclusion } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import {
  type DeclaredFood,
  type DietaryRegime,
  scanDietaryRegime,
} from "./dietary_regime.ts";
import { applyHouseRuleLock } from "./household_restriction_lock.ts";
import { PERISHABLE_AISLES } from "./grocery_waves.ts";
import { keepingOf } from "./food_keeping.ts";
import { normalizePantryTerm } from "./meal_generation.ts";
import { addDays } from "./meal_plan_window.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// ① LA FORME PERSISTÉE — snake_case, telle qu'elle part en base
// ---------------------------------------------------------------------------

/**
 * ⚠️ CES TYPES DÉCRIVENT LE PAYLOAD ÉCRIT, PAS `GeneratedMeal`. C'est la seule
 * forme que le chemin d'ADOPTION voit — il relit une ligne de base, il n'a
 * jamais eu d'objet mémoire. Les typer sur la forme mémoire aurait rendu ce
 * module inappelable là où il manque le plus.
 */
export interface GateIngredient {
  readonly term: string;
  /** Le groupe déclaré par le modèle. `null` = rien de déclaré, ou hors liste. */
  readonly group?: string | null;
  readonly in_pantry?: boolean | null;
  /**
   * ⟳ 2026-09-11 · LOT E — L'IDENTIFIANT DU RÉFÉRENTIEL, PERSISTÉ PAR LE LOT A.
   *
   * Il est déjà écrit dans le payload (`ingredientPayload`); la garde le
   * DÉCLARE pour que le contrôle des achats cesse de comparer des mots. La
   * résolution elle-même n'a PAS lieu ici — voir `final_plan_audit.ts` et
   * `GateContext.shopping`.
   */
  readonly ref?: string | null;
  /** `true` = le parseur a refusé l'identifiant. Absent sur les plans d'avant le lot A. */
  readonly ref_refused?: boolean | null;
}

export interface GateUse {
  readonly preparation_id: string;
  readonly servings?: number | null;
  /** `"fridge"` | `"freezer"`. Absent ⇒ frigo, le strict. */
  readonly kept?: string | null;
}

export interface GateBoxItem {
  readonly preparation_id?: string | null;
  readonly term: string;
  readonly grams?: number | null;
}

export interface GateBox {
  readonly id: string;
  readonly member_ids: readonly string[];
  readonly items: readonly GateBoxItem[];
}

export interface GateDish {
  readonly title: string;
  readonly name?: string | null;
  readonly day: string | null;
  readonly slot: string | null;
  readonly method?: string | null;
  readonly why?: string | null;
  /** La bouche à qui ce plat est dédié. `null` = plat de la table. */
  readonly member_id?: string | null;
  /**
   * ⟳ 2026-09-14 · BÊTA 1A — CE PLAT COMPLÈTE LA TABLE AU LIEU DE LA REMPLACER.
   *
   * ⛔ LA DIFFÉRENCE DÉCIDE D'UNE OBLIGATION. Un complément est une entrée de
   * DERNIER RECOURS créée à la réparation: son porteur RESTE mangeur du plat
   * partagé, sa part commune est rabotée et le petit plat porte la différence
   * (`splitPlateWithComplement`). Il ne peut donc jamais satisfaire une
   * obligation de RÉGIME — la personne mangerait quand même la base que sa
   * ligne lui interdit. Persisté `complements_shared` par `mealDishesPayload`.
   */
  readonly complements_shared?: boolean | null;
  readonly ingredients: readonly GateIngredient[];
  readonly uses: readonly GateUse[];
  readonly boxes: readonly GateBox[];
}

export interface GatePreparation {
  readonly id: string;
  readonly title: string;
  readonly method?: string | null;
  readonly cook_on: string | null;
  readonly ingredients: readonly GateIngredient[];
}

export interface GateSession {
  readonly day: string | null;
  readonly preparation_ids: readonly string[];
}

export interface GateShoppingLine {
  readonly term: string;
  readonly aisle?: string | null;
  readonly food_group?: string | null;
  readonly buy_on?: string | null;
  readonly freeze_on_purchase?: boolean | null;
  /**
   * ⟳ 2026-09-11 · LOT E — LA QUANTITÉ EN CLAIR, QU'AUCUN CONTRÔLE NE LISAIT.
   * `mealShoppingPayload` l'écrit depuis toujours; personne ne vérifiait qu'on
   * en achetait ASSEZ. Lue par `final_plan_audit.ts`, jamais ici.
   */
  readonly quantity?: string | null;
  /**
   * ⚠️ AUCUNE LIGNE DE COURSES NE LE PORTE AUJOURD'HUI — `mealShoppingPayload`
   * ne le projette pas. Le champ est déclaré pour que le jour où il est posé,
   * l'audit le prenne sans modification; en attendant l'identité d'une ligne de
   * courses se résout par son libellé, ce qui suffit à fermer les 8 faux
   * positifs de pluriel (l'ingrédient, lui, passe par son `ref`).
   */
  readonly ref?: string | null;
}

export interface GatePlan {
  readonly dishes: readonly GateDish[];
  readonly preparations: readonly GatePreparation[];
  readonly cooking_sessions: readonly GateSession[];
  readonly shopping_list: readonly GateShoppingLine[];
}

// ---------------------------------------------------------------------------
// ② LE CONTEXTE — tout ce que le plan ne porte pas lui-même
// ---------------------------------------------------------------------------

/**
 * ⛔ AUCUN PARAMÈTRE OPTIONNEL ICI, et c'est une règle du dépôt :
 * « un paramètre de garde optionnel est une garde désarmée ». `hasFreezer`,
 * `maxFridgeDays`, `boxContract` sont REQUIS — un appelant qui ne les a pas
 * lus passe `false`, la constante, ou `null`, il ne les hérite pas d'un défaut
 * silencieux.
 */
export interface GateContext {
  readonly lane: "household" | "solo";
  /** Premier jour de la fenêtre, `YYYY-MM-DD`. `windowDays[0]` est ce jour. */
  readonly startsOn: string;
  /** Les jetons de jour DANS L'ORDRE DU PLAN. L'index EST le rang. */
  readonly windowDays: readonly string[];
  /** `hasKitchenTool(eq, "freezer") === true`. Jamais hérité. */
  readonly hasFreezer: boolean;
  /**
   * `MAX_FRIDGE_DAYS`. PASSÉE, jamais importée — convention de
   * `fridge_window.ts` : deux copies d'un même nombre divergent.
   */
  readonly maxFridgeDays: number;
  readonly mouths: readonly {
    readonly memberId: string;
    readonly regime: DietaryRegime | null;
    readonly cells: readonly { readonly day: string; readonly slot: string }[];
  }[];
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1A — CE QUE LA GRILLE DOIT À CHAQUE BOUCHE, PAR CASE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `householdCells(...).cells[].dedicated`, aplati — la MÊME décision que le
   * prompt emporte et que le parseur valide, jamais une seconde lecture.
   *
   * ⛔ `null` = LA GRILLE N'A PAS TOURNÉ (lane solo, chemin d'adoption) ⇒ les
   * deux causes ne sont PAS évaluées, et `checked.dedicated_obligations` reste
   * à zéro pour le dire. `[]` est une réponse: « la grille a tourné, elle ne
   * doit de plat à personne ».
   */
  readonly dedicated:
    | readonly {
      readonly day: string;
      readonly slot: string;
      readonly memberId: string;
      readonly reason: "regime" | "own_meal";
      /**
       * ⟳ 2026-09-14 · BÊTA 1A — LA BASE DE CETTE CASE EST-ELLE MANGEABLE PAR
       * ELLE ? `false` ⇒ sans plat à elle, cette personne n'a RIEN à manger
       * ici, et c'est le seul cas qui refuse. Voir le pavé de
       * `dedicated_dish_missing`.
       */
      readonly baseEdible: boolean;
    }[]
    | null;
  /**
   * L'énergie SERVIE contre l'enveloppe, par bouche, MESURÉE PAR L'APPELANT.
   * `null` = pas mesurable ici (index de composition absent) — et le compteur
   * le DIT, au lieu de rendre un zéro qui ressemblerait à « tout va bien ».
   */
  readonly energy:
    | readonly {
      readonly memberId: string;
      readonly envelopeKcal: number;
      readonly deliveredKcal: number;
    }[]
    | null;
  /**
   * Le contrat de boîtes du foyer. `null` = les boîtes ne SONT PAS le contrat
   * (solo, ou foyer qui mange à la même table) — et alors les deux causes de
   * boîte ne sont PAS évaluées, ce que `checked.boxed_dishes` fait voir.
   */
  readonly boxContract: {
    readonly expected: number;
    readonly roster: readonly string[];
  } | null;
  readonly exclusions: {
    readonly table: readonly ForbiddenTerm[];
    readonly byMember: readonly {
      readonly memberId: string;
      readonly terms: readonly ForbiddenTerm[];
    }[];
  };
  /** Le régime le plus strict de la table. `null` = aucun. */
  readonly strictestRegime: DietaryRegime | null;
  /** Les libellés de `household_food_restrictions`, tous membres confondus. */
  readonly houseRuleLabels: readonly string[];
  /** Le garde-manger déclaré : ce qui n'a pas besoin d'être acheté. */
  readonly pantryTerms: readonly string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-11 · LOT E — LES COURSES, MESURÉES PAR IDENTITÉ ALIMENTAIRE
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ `null` = LE CONTRÔLE DES ACHATS N'A PAS TOURNÉ, et c'est alors dit par
   * `checked.shopping_identities === 0`. Il n'y a AUCUN repli par libellé:
   * l'ancienne comparaison (`normalizePantryTerm` + `covers`) est retirée,
   * parce qu'elle produisait 8 faux positifs sur 9 alertes — `citron` contre
   * `citrons`, `tomate` contre `tomates`, et six autres nommées dans la revue
   * du 2026-09-11. Une garde qui se trompe 8 fois sur 9 n'est pas un repli,
   * c'est du bruit qu'on prendrait pour un contrôle.
   *
   * Produit par `final_plan_audit.ts::shoppingIdentityAudit`, qui a besoin de
   * l'index de composition — lequel n'existe pas sur le chemin d'ADOPTION.
   * C'est pourquoi il arrive par le contexte plutôt que d'être calculé ici.
   */
  readonly shopping: readonly ShoppingCoverRow[] | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-11 · LOT E — LA NUTRITION PAR PERSONNE / DATE / CRÉNEAU
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LES AGRÉGATS PAR BOUCHE DE `ctx.energy` NE SUFFISENT PAS, et le plan
   * l'écrit: « conserver les dates/créneaux pour éviter la compensation entre
   * jours ou personnes ». Un dimanche à +30 % et un samedi à −30 % rendent une
   * somme parfaite; c'est exactement ce que `energy` seul laissait passer.
   *
   * ⛔ ET « UN PLAT EXISTE » N'EST PAS « UNE PORTION EST CALCULÉE ». Les deux
   * cases livrées vides le 2026-09-11 avaient une recette. `cells[].hasPortion`
   * est le contrôle qui manquait.
   *
   * `null` = aucune mesure n'a été faite ⇒ les quatre causes de nutrition ne
   * sont PAS évaluées, et leurs dénominateurs restent à zéro.
   */
  readonly nutrition: {
    readonly cells: readonly CellNutritionRow[];
    readonly days: readonly DayNutritionRow[];
  } | null;
  readonly policy: Readonly<Record<FinalGateCause, GateSeverity>>;
}

/**
 * CE QUE LA GARDE LIT D'UNE LIGNE D'AUDIT DES COURSES.
 *
 * ⚠️ UN TYPE STRUCTUREL, PAS UN IMPORT DE `ShoppingNeedRow`. La garde doit
 * rester appelable depuis le chemin d'ADOPTION, qui n'a pas de référentiel et
 * n'importera jamais `final_plan_audit.ts`. `ShoppingNeedRow` satisfait ce
 * type par construction — le compilateur l'épingle au site d'appel.
 */
export interface ShoppingCoverRow {
  readonly identity: string;
  readonly displayTerm: string;
  readonly state:
    | "covered_measured"
    | "short"
    | "present_unquantified"
    | "check_incomplete"
    | "not_bought"
    /**
     * ⟳ 2026-09-12 · C3 — l'eau de cuisson du robinet. Ni achetée, ni
     * manquante, ni « non vérifiée » : hors du panier, et dite comme telle.
     */
    | "not_purchasable"
    /**
     * ⟳ 2026-09-15 · BÊTA 2C — acheté, et aucune recette ne s'en sert. Voir le
     * pavé de `SHOPPING_COVER_STATES` dans `final_plan_audit.ts`.
     */
    | "bought_unused";
  readonly reason: string;
}

/** Ce que la garde lit d'une case mesurée. Même raison structurelle. */
export interface CellNutritionRow {
  readonly memberId: string;
  readonly day: string;
  readonly date: string;
  readonly slot: string;
  readonly hasDish: boolean;
  readonly hasPortion: boolean;
  readonly targetKcal: number | null;
  readonly servedKcal: number | null;
  readonly proteinG: number | null;
  readonly deltaPct: number | null;
  readonly gap: string | null;
  /**
   * ⟳ 2026-09-12 · LOT 2 — LES DEUX MESURES QUE `cell_bounds_off` NOMME.
   *
   * ⚠️ FACULTATIVES, ET LEUR ABSENCE S'ÉCRIT. `CellNutritionRow`
   * (`final_plan_audit.ts`) les porte toutes les deux: la production les a
   * toujours. Les fixtures d'adoption, qui décrivent un plan relu en base sans
   * référentiel, ne les ont pas — et les rendre obligatoires aurait refusé ce
   * chemin-là. Quand elles manquent, le `detail` écrit « masse et densité non
   * transmises » plutôt qu'une phrase propre: c'est la règle du dépôt, un
   * champ absent ne doit pas ressembler à un champ mesuré.
   *
   * ⛔ ET CE NE SONT PAS DES PARAMÈTRES DE GARDE. La garde MORD sur
   * `cell.state`, qui est calculé ailleurs et toujours présent; ces deux-là ne
   * servent qu'à écrire la phrase.
   */
  readonly grams?: number | null;
  readonly densityPer100G?: number | null;
  /** Une portion INDIVIDUELLE est-elle attendue sur cette case ? */
  readonly portionExpected: boolean;
  readonly state:
    | "conforme"
    | "energy_off"
    | "bounds_off"
    | "no_portion"
    | "unmeasurable"
    | "no_target"
    | "not_personal";
}

/** Ce que la garde lit d'une journée. Même raison structurelle. */
export interface DayNutritionRow {
  readonly memberId: string;
  readonly date: string;
  readonly cellsExpected: number;
  readonly cellsMeasured: number;
  readonly coveredBudgetKcal: number | null;
  readonly servedKcal: number | null;
  readonly deltaPct: number | null;
  readonly proteinG: number | null;
  readonly protein: {
    readonly coveredFloorG: number | null;
    readonly reason: string;
  };
  readonly state: "conforme" | "energy_off" | "unmeasurable";
}

// ---------------------------------------------------------------------------
// ③ LE VOCABULAIRE FERMÉ DES CAUSES
// ---------------------------------------------------------------------------

/**
 * LES 29 CAUSES. Liste FERMÉE, orthographe exacte, ordre d'évaluation.
 *
 * ⚠️ ELLES SE LISENT PAR FAMILLE, et chaque famille a son dénominateur :
 * références (`uses`, `box_items`, `session_ids`), fenêtre cuite
 * (`cooked_pairs`), sessions, cases et bouches (`cells`, `mouth_cells`),
 * boîtes (`boxed_dishes`), courses (`shopping_lines`, `perishable_lines`,
 * `ingredient_terms`), interdits (`table_dishes`, `boxed_dishes`), énergie
 * servie (`energy_mouths`).
 */
export const FINAL_GATE_CAUSES = [
  // ── références pendantes ────────────────────────────────────────────────
  "uses_dangling",
  "box_item_dangling",
  "session_cites_unknown",
  // ── la fenêtre cuite ────────────────────────────────────────────────────
  "eaten_before_cooked",
  "eaten_too_late",
  "cook_day_unplaced",
  // ── les sessions ────────────────────────────────────────────────────────
  "preparation_without_session",
  "session_day_mismatch",
  // ── les cases et les bouches ────────────────────────────────────────────
  "cell_without_dish",
  "mouth_unfed",
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1A — UNE BOUCHE QUE LA CASSEROLE NE PEUT PAS NOURRIR,
   *                ET AUCUN PLAT À ELLE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ C'EST LE POINT 8 DE LA CLÔTURE, ET IL SORTAIT `conforme`. La grille
   * décide qu'une bouche a besoin d'un plat à elle parce que la base descendue
   * au plus strict NE PEUT PAS LA SERVIR (`dietDiverges`, prémisse ⓪ ou un
   * conflit de service). Si ce plat n'existe pas dans le plan livré, cette
   * personne n'a rien de compatible à manger — et rien ne le disait: `swap`
   * comptait, `dish_owners` comptait, et la porte finale ne posait pas la
   * question.
   *
   * ⛔ CE N'EST PAS `mouth_unfed`. Celle-ci dit « aucun contenant ne te
   * nomme »; une bouche divergente PEUT être nommée sur le contenant du plat
   * partagé — c'est exactement ce qui se passait — et être quand même devant
   * une assiette que sa ligne lui interdit. Les deux contrôles regardent deux
   * choses différentes, et les fondre en rendrait une invisible.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️ UNE SEULE PRÉMISSE REFUSE, ET C'EST UNE CORRECTION MESURÉE DU 2026-09-14
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CETTE CAUSE A D'ABORD LU `dietDiverges` TOUT ENTIER, ET C'ÉTAIT FAUX.
   * Rejouée sur la référence N=2 (`ref2.json`, végane + omnivore) à travers le
   * vrai handler: **6 refus bloquants** sur un plan dont le plancher protéique
   * est tenu (`protein_floor_short: 0` sur `protein_days: 4`). L'omnivore
   * mangeait la casserole végane — sa ligne ne lui interdit rien — et il était
   * correctement nourri. Une garde qui refuse un plan correct est aussi fausse
   * qu'une garde qui en laisse passer un mauvais.
   *
   * ⛔ CE QUI REFUSE DÉSORMAIS EST LA PRÉMISSE ⓪ SEULE (`baseEdible === false`):
   * la base N'EST PAS MANGEABLE par cette bouche — un plat végane et une bouche
   * sans gluten, deux axes qui ne se rencontrent jamais. Là, sans plat à elle,
   * cette personne n'a RIEN à manger.
   *
   * ⚠️ L'AUTRE MOITIÉ NE DISPARAÎT PAS: une variante réclamée et non servie
   * sort dans `own_meal_dish_missing`, qui COMPTE. Et ce qu'elle coûte
   * vraiment — moins de protéine que le contrat — a déjà son contrôle.
   */
  "dedicated_dish_missing",
  /**
   * LE MÊME MANQUE, SANS IMPOSSIBILITÉ — UNE PRÉFÉRENCE.
   *
   * ⟳ 2026-09-14 · BÊTA 1A — DEUX POPULATIONS, ET ELLES PARTAGENT LEUR DURETÉ:
   * « mon petit-déjeuner à moi » non servi, et une VARIANTE de régime réclamée
   * par la grille dont la base reste mangeable. Dans les deux cas la personne
   * a quelque chose à manger; ce qui manque est ce qu'elle préférait.
   *
   * ⛔ ELLE EST SÉPARÉE PARCE QUE LE PLAN DE BÊTA L'EXIGE: « une préférence
   * souple non suivie peut être annoncée ; une incompatibilité impérative non
   * résolue empêche l'activation ». Les fondre reviendrait soit à refuser un
   * plan pour une habitude, soit à laisser passer une assiette immangeable.
   */
  "own_meal_dish_missing",
  /**
   * ⟳ 2026-09-14 · BÊTA 1A ⑥ — DEUX PLATS DE TABLE SUR UNE MÊME CASE.
   *
   * ⛔ POINT 7 DE LA CLÔTURE: « rien ne les retire ». Le plan tombait bien,
   * mais par `mouth_unfed / double` — c'est-à-dire sous un nom qui décrit la
   * CONSÉQUENCE (chaque bouche nommée deux fois) et pas la CAUSE. La consigne
   * de réparation partait donc réparer des couvercles au lieu de retirer un
   * repas concurrent.
   *
   * ⛔ ET ON NE DEVINE PAS LEQUEL EST DE TROP. Attribuer d'office le second à
   * une bouche divergente servirait peut-être le plat de l'omnivore à la
   * végane: « ne jamais attribuer au hasard un plat dont le destinataire est
   * invalide ». La cardinalité est NOMMÉE ici, et c'est le modèle qui tranche
   * à la réparation.
   *
   * ⚠️ UN COMPLÉMENT N'EN EST PAS UN. Un plat qui complète la table porte un
   * `member_id`; seuls les plats SANS adresse comptent ici.
   */
  "cell_two_table_dishes",
  // ── les boîtes ──────────────────────────────────────────────────────────
  "boxes_none_delivered",
  "box_missing",
  // ── les courses ─────────────────────────────────────────────────────────
  "ingredient_not_bought",
  /**
   * ⟳ 2026-09-15 · BÊTA 2C — LE MANQUE, DANS L'AUTRE SENS.
   *
   * ⛔ LES QUATRE AUTRES CAUSES D'ACHAT DISENT « il en faut et il n'y en a
   * pas ». Celle-ci dit « il y en a sur la liste et personne n'en veut »: la
   * personne paie et jette. Mesuré sur deux plans N=4 du 2026-09-14 — 260 g de
   * lentilles achetées, zéro lentille dans la seule casserole et dans tous les
   * plats. B4 demande que grammes, préparations et courses décrivent la MÊME
   * nourriture; sans cette cause, un seul des deux sens était contrôlé.
   *
   * ⚠️ `count`, COMME SES DEUX VOISINES, et pour la raison déjà tranchée le
   * 2026-09-12: « un plan entier jeté pour une ligne d'achat est le pire des
   * deux mondes ». Elle sort dans `gaps`, donc à l'écran — pas dans un 422.
   */
  "ingredient_bought_unused",
  // ⟳ 2026-09-11 · LOT E — PRÉSENCE **ET** QUANTITÉ. « Il est sur la liste »
  // ne prouve pas « il y en a assez »; c'était la moitié du contrôle qui
  // n'existait nulle part.
  "ingredient_short_bought",
  "shopping_undated",
  "unclassified_perishable",
  "perishable_bought_too_early",
  // ── les interdits ───────────────────────────────────────────────────────
  "table_exclusion_served",
  "member_exclusion_served",
  "title_promises_missing_preparation",
  "regime_forbidden_component",
  "house_rule_served",
  // ── l'énergie servie ────────────────────────────────────────────────────
  "mouth_energy_short",
  // ── ⟳ 2026-09-11 · LOT E — LA PORTION, LA CASE, LA JOURNÉE, LA PROTÉINE ──
  //
  // ⛔ `cell_without_portion` N'EST PAS `cell_without_dish`. La seconde dit
  // « aucun plat n'est posé »; la première dit « un plat est posé, et personne
  // n'a de portion ». Les deux cases livrées vides le 2026-09-11 (PERTE samedi
  // déjeuner, GAIN vendredi dîner) avaient une recette, un titre, une méthode —
  // et zéro boîte. La garde les a laissées passer parce qu'elle n'avait aucune
  // question à leur poser.
  "cell_without_portion",
  /** Une portion existe et son énergie n'est pas lisible. */
  "cell_energy_unmeasurable",
  /**
   * ⛔ ±10 % PAR REPAS DÉPASSÉS, ET RIEN D'AUTRE DEPUIS LE 2026-09-12.
   *
   * Elle portait AUSSI les bornes de masse et le couloir de densité, et c'est
   * le défaut n° 2 de la revue de clôture C6: `energy_off` et `bounds_off`
   * rendaient la MÊME cause, donc la même phrase. Sur le tir n° 4, la
   * consigne de réparation demandait de corriger « sun/breakfast : 0 % contre
   * 728 kcal visées » — **0 %**, alors que le vrai défaut était la densité.
   * On ne demande pas une correction calorique quand les calories sont déjà
   * bonnes: le modèle relit les contraintes générales et n'obtient pas le
   * diagnostic que le moteur possède.
   */
  "cell_energy_off",
  /**
   * ⟳ 2026-09-12 · LOT 2 — LA MASSE ET LA DENSITÉ, SÉPARÉES DES CALORIES.
   *
   * ⚠️ ELLE NE DIT PAS LAQUELLE DES DEUX. `CellNutritionRow` porte les MESURES
   * (grammes, kcal/100 g) et pas les BORNES du contrat: la garde nomme donc la
   * nature (« ce n'est pas l'énergie ») et les deux nombres mesurés. Le
   * chiffrage complet — quelle borne, de combien — est écrit par
   * `plan_defect_pass.ts`, qui reçoit les contrats (`contracts`).
   *
   * ⛔ ELLE N'EST PAS DANS `CALORIE_PROTECTED_CAUSES`, ET C'EST UNE DETTE
   * ÉCRITE. Son `detail` porte une densité en kcal/100 g, donc un nombre de la
   * famille calorique. La liste des causes protégées est DOUBLÉE côté écran
   * (`frontend/src/keel/api/planValidation.ts`) et un test épingle l'égalité
   * des deux: l'ajouter ici seul rendrait ce test rouge. Tant qu'elle vaut
   * `count` dans la politique livrée, elle n'atteint jamais `blocking`, donc
   * jamais le corps 422 — c'est ce qui rend l'attente sûre, pas un oubli.
   */
  "cell_bounds_off",
  /** ±5 % sur la journée COUVERTE dépassés. */
  "day_energy_off",
  /**
   * ⛔ LE PLANCHER PROTÉIQUE EXISTANT, ENFIN COMPARÉ À QUELQUE CHOSE. Mesuré:
   * `envelopeFor` rend 176 g pour Paul, sa seule journée complète et mesurable
   * en porte **126,1 — soit −28 %**, et aucun contrôle du dépôt ne le lisait.
   * « Non applicable » était faux: c'est « non contrôlé ».
   */
  "protein_floor_short",
] as const;
export type FinalGateCause = typeof FINAL_GATE_CAUSES[number];

/**
 * LE SEUIL DE LA BOUCHE SOUS-NOURRIE : servi < enveloppe × ce ratio.
 *
 * ⚠️ 0,9 EST UN PROVISOIRE, À CALIBRER PAR LA PREMIÈRE CAMPAGNE RÉELLE. Aucun
 * chiffre mesuré ne le justifie encore : il est posé pour que la MESURE
 * commence, pas pour trancher. Il est EXPORTÉ exactement pour ça — un test
 * l'épingle, et un commit ultérieur le déplace DÉLIBÉRÉMENT, à la vue de tous,
 * au lieu de bouger un littéral enfoui au milieu d'une fonction. Et tant que
 * `mouth_energy_short` est en `count` (les trois politiques livrées), un seuil
 * faux coûte un CHIFFRE, jamais un plan.
 */
export const ENERGY_SHORT_RATIO = 0.9;

/**
 * TROIS SÉVÉRITÉS, PAS DEUX.
 *
 * · `refuse` — le plan ne part pas.
 * · `repair` — l'appelant peut appliquer `applyFinalGateRepairs` et repasser.
 * · `count`  — on MESURE, on ne mord pas. C'est l'état d'un lot en
 *   observation, et c'est ce qui rend le déploiement progressif possible sans
 *   toucher au code de la garde.
 */
export type GateSeverity = "refuse" | "repair" | "count";

export interface GateRefusal {
  readonly cause: FinalGateCause;
  readonly severity: GateSeverity;
  readonly day: string | null;
  readonly slot: string | null;
  /** Le TITRE du plat en cause — jamais un index : l'appelant le montre. */
  readonly dish: string | null;
  readonly preparation_id: string | null;
  readonly member_id: string | null;
  readonly term: string | null;
  readonly detail: string;
}

export type GateRepairKind =
  | "drop_dangling_use"
  | "drop_dangling_box_item"
  | "drop_dangling_session_id"
  | "strip_title_promise";

/**
 * OÙ LA RÉPARATION S'APPLIQUE, en index dans le payload persisté.
 *
 * · `drop_dangling_use`        → `{ dish, use }`
 * · `drop_dangling_box_item`   → `{ dish, box, item }`
 * · `drop_dangling_session_id` → `{ session, item }` (index dans `preparation_ids`)
 * · `strip_title_promise`      → `{ dish }`
 */
export interface GateRepairAt {
  readonly dish?: number;
  readonly session?: number;
  readonly use?: number;
  readonly item?: number;
  readonly box?: number;
}

export interface GateRepair {
  readonly kind: GateRepairKind;
  readonly at: GateRepairAt;
  /** Ce qui est retiré : un identifiant pendant, ou la phrase de promesse. */
  readonly from: string;
  /**
   * `null` pour les quatre réparations livrées : toutes sont des RETRAITS.
   * Le champ existe pour qu'un remplacement futur n'ait pas à changer la forme
   * — et il reste `null` tant qu'aucun n'existe, plutôt que de porter une
   * chaîne vide qu'un lecteur prendrait pour un remplacement.
   */
  readonly to: string | null;
}

/**
 * LES DOUZE DÉNOMINATEURS, PLUS UN TÉMOIN. Voir l'en-tête : une cause à zéro
 * dont le dénominateur est à zéro n'est pas propre, elle n'a pas tourné.
 *
 * ⚠️ `energy_unmeasured` N'EST PAS UN DÉNOMINATEUR, c'est le témoin de ce qui
 * a échappé à celui de l'énergie : on l'attend à ZÉRO sur un cas propre, et
 * c'est `energy_mouths` — lui — qui doit être strictement positif.
 */
export interface FinalGateChecked {
  /** Entrées `dishes[].uses[]` regardées. */
  readonly uses: number;
  /** Entrées `dishes[].boxes[].items[]` regardées. */
  readonly box_items: number;
  /** Entrées `cooking_sessions[].preparation_ids[]` regardées. */
  readonly session_ids: number;
  /** Couples (plat, préparation citée ET résolue) passés à la fenêtre cuite. */
  readonly cooked_pairs: number;
  /** Cases distinctes attendues (union des cases des bouches). */
  readonly cells: number;
  /** Couples (bouche, case) — le dénominateur de `mouth_unfed`. */
  readonly mouth_cells: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1A — COUPLES (BOUCHE, CASE) CONFRONTÉS À LA GRILLE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ C'EST LE DÉNOMINATEUR, ET CE N'EST PAS LE NOMBRE D'OBLIGATIONS. Un foyer
   * où personne ne diverge n'a AUCUNE obligation, et pourtant la question lui a
   * bien été posée, case par case: son zéro est « rien à devoir », pas « rien
   * n'a tourné ». Prendre le compte des obligations comme dénominateur aurait
   * rendu les deux indiscernables — exactement la faute que `SANS OBJET` a
   * coûtée à l'instrument le 2026-09-13.
   *
   * Vaut zéro dans les deux seuls cas où la question n'est PAS posée:
   * `ctx.dedicated === null` (la grille n'a pas tourné — chemin d'adoption,
   * lane solo) ou aucune bouche.
   */
  readonly dedicated_cells_checked: number;
  /**
   * ⚠️ TÉMOIN, PAS DÉNOMINATEUR. Combien de plats à part la grille réclame,
   * motifs confondus. Il dit si le foyer avait quelque chose à prouver.
   */
  readonly dedicated_obligations: number;
  readonly shopping_lines: number;
  /** Lignes dont le rayon est dans `PERISHABLE_AISLES`. */
  readonly perishable_lines: number;
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — LIGNES DONT LA CONSERVATION EST INCONNUE.
   *
   * ⛔ « NON VÉRIFIÉ » N'EST PAS « SANS CONTRAINTE ». À zéro, la lecture a
   * couvert toute la liste ; sans ce nombre, une liste dont aucune ligne ne
   * porte d'identité rendrait exactement le même verdict qu'une liste
   * parfaitement résolue — la façon dont ces contrôles meurent.
   */
  readonly keeping_unknown_lines: number;
  /** Termes d'ingrédient DISTINCTS (plats + préparations). */
  readonly ingredient_terms: number;
  /** Plats sans aucune boîte — la surface de la table. */
  readonly table_dishes: number;
  /** Plats portant au moins une boîte. */
  readonly boxed_dishes: number;
  /**
   * Lignes d'énergie RÉELLEMENT comparées (enveloppe finie et > 0). C'EST LE
   * DÉNOMINATEUR : `mouth_energy_short: 0` avec `energy_mouths: 0` veut dire
   * « JAMAIS ÉVALUÉE », jamais « toutes les bouches sont nourries ».
   */
  readonly energy_mouths: number;
  /**
   * Bouches présentes mais NON mesurables : enveloppe absente, nulle, négative
   * ou non finie — plus, quand `ctx.energy` vaut `null`, TOUTES les bouches du
   * contexte. C'est ce qui empêche l'absence de mesure de se lire comme une
   * mesure propre.
   */
  readonly energy_unmeasured: number;
  /**
   * ⟳ 2026-09-11 · LOT E — Identités alimentaires DEMANDÉES par les recettes.
   * C'EST LE DÉNOMINATEUR des quatre causes d'achat. À zéro, elles n'ont pas
   * tourné — et c'est le cas chaque fois que `ctx.shopping` vaut `null`.
   */
  readonly shopping_identities: number;
  /** Identités dont la SUFFISANCE a été comparée (besoin et achat chiffrés). */
  readonly shopping_quantified: number;
  /**
   * ⚠️ TÉMOIN, PAS DÉNOMINATEUR. Identités PRÉSENTES dont la suffisance n'a pas
   * pu être vérifiée : garde-manger déclaré sans quantité, conditionnement non
   * convertible, identifiant refusé. ⛔ Ce ne sont PAS des manques, et les
   * additionner à `ingredient_not_bought` inventerait des achats absents.
   */
  readonly shopping_unverified: number;
  /**
   * ⟳ 2026-09-12 · C3 — Identités NON ACHETABLES (eau du robinet), mesurées
   * dans la préparation et hors de tout panier. ⛔ Ni un manque, ni un contrôle
   * incomplet : un état à part, compté pour que « 0 manque » reste lisible.
   */
  readonly shopping_not_purchasable: number;
  /** Cases attendues passées au contrôle de portion. */
  readonly portion_cells: number;
  /** Cases dont l'énergie servie a été LUE. Le dénominateur de `cell_energy_off`. */
  readonly measured_cells: number;
  /**
   * ⟳ 2026-09-13 · LOT 1 — Cases où une portion EXISTE et où le contrat s'est
   * abstenu (âge inconnu, corps absent, ceinture illisible): la personne reçoit
   * la part de recette, et il n'y a AUCUNE cible à comparer.
   *
   * ⛔ NI UN SUCCÈS NI UN ÉCHEC, ET NI UN TROU. Ces cases sont hors de
   * `measured_cells` (elles ne peuvent pas rendre `cell_energy_off`) ET hors de
   * `incomplete` (le contrôle n'a pas manqué de mesure, il n'a pas d'objet).
   * `plan_validation.ts` les publie en `not_applicable`. Les laisser dans le
   * dénominateur faisait lire « contrôle d'énergie réussi » d'une case que
   * personne n'a jamais pu juger — mesuré sur `perte-l1age`, six cases.
   */
  readonly cell_energy_no_target: number;
  /** Journées-bouche entièrement mesurées, avec un budget couvert. */
  readonly measured_days: number;
  /**
   * Journées où un plancher protéique S'APPLIQUE et où la protéine servie est
   * lisible. ⛔ À zéro, `protein_floor_short: 0` veut dire « jamais évalué ».
   */
  readonly protein_days: number;
  /**
   * Journées où le plancher s'abstient POUR UNE RAISON PROTÉGÉE (plancher TCA,
   * mineur, objectif absent). ⚠️ CE N'EST PAS UN TROU: le plan interdit de
   * confondre cette abstention légitime avec une donnée perdue.
   */
  readonly protein_protected: number;
  /**
   * Journées où le plancher n'a PAS pu être calculé alors que rien ne le
   * protégeait — corps absent, couverture inconnue, protéine illisible. ⛔ C'EST
   * un trou, et il se lit séparément de `protein_protected`.
   */
  readonly protein_unmeasured: number;
}

export interface FinalGateCounters {
  readonly checked: FinalGateChecked;
  readonly refusals_by_cause: Readonly<Record<FinalGateCause, number>>;
  readonly repairs_by_kind: Readonly<Record<GateRepairKind, number>>;
}

export interface FinalGateOutcome {
  /** `true` quand AUCUN refus n'a la sévérité `"refuse"`. */
  readonly ok: boolean;
  readonly refusals: readonly GateRefusal[];
  readonly repairs: readonly GateRepair[];
  readonly counters: FinalGateCounters;
}

// ---------------------------------------------------------------------------
// ④ LES TROIS POLITIQUES
// ---------------------------------------------------------------------------

function policyOf(
  overrides: Partial<Record<FinalGateCause, GateSeverity>>,
): Readonly<Record<FinalGateCause, GateSeverity>> {
  const out = {} as Record<FinalGateCause, GateSeverity>;
  for (const cause of FINAL_GATE_CAUSES) {
    out[cause] = overrides[cause] ?? "count";
  }
  return Object.freeze(out);
}

/**
 * LOT 1 — ON MESURE, RIEN NE MORD.
 *
 * ⛔ C'EST LE LOT QUI DOIT ÊTRE DÉPLOYÉ EN PREMIER, et pas par prudence : un
 * refus posé sans dénominateur mesuré refuserait des plans dont personne ne
 * sait s'ils sont fautifs. `ok` est TOUJOURS `true` sous cette politique,
 * refus listés compris.
 */
export const FINAL_GATE_POLICY_LOT_1: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({});

/**
 * LOT 2 — LE NOYAU MORD. Les quatre défauts mesurés (① ③ ④) et l'invariant
 * « personne sans repas ». Les références pendantes se RÉPARENT plutôt que de
 * refuser : elles sont le résidu mécanique d'une mutation d'après-garde, et
 * les retirer rend un plan servable.
 */
export const FINAL_GATE_POLICY_LOT_2: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  eaten_before_cooked: "refuse",
  eaten_too_late: "refuse",
  cell_without_dish: "refuse",
  mouth_unfed: "refuse",
  boxes_none_delivered: "refuse",
  table_exclusion_served: "refuse",
  regime_forbidden_component: "refuse",
  house_rule_served: "refuse",
  uses_dangling: "repair",
  box_item_dangling: "repair",
  session_cites_unknown: "repair",
  title_promises_missing_preparation: "repair",
  // ⛔ ÉCRIT, PAS HÉRITÉ DU DÉFAUT — parce que c'est un ARBITRAGE, pas un
  // oubli. Sous-nourrir une bouche est une question de QUALITÉ DE
  // COMPOSITION, pas une incohérence du plan : refuser là-dessus priverait
  // des gens de dîner sur un seuil (`ENERGY_SHORT_RATIO`) que personne n'a
  // encore calibré. On compte, on regarde la campagne, puis on tranche.
  mouth_energy_short: "count",
});

/**
 * LOT 3 — LES COURSES MORDENT AUSSI. C'est le défaut ② (le poisson acheté
 * trois jours trop tôt) et l'ingrédient qu'aucune ligne n'achète.
 *
 * `mouth_energy_short` reste en `count` ici aussi, pour la raison écrite au
 * lot 2 : le seuil n'est pas calibré.
 */
export const FINAL_GATE_POLICY_LOT_3: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  ...FINAL_GATE_POLICY_LOT_2,
  perishable_bought_too_early: "refuse",
  ingredient_not_bought: "refuse",
  // ⟳ 2026-09-15 — `count` DÈS LE LOT 1, et jamais autre chose: voir son pavé
  // dans `FINAL_GATE_CAUSES`. Un achat en trop se retire, il ne jette pas un plan.
  ingredient_bought_unused: "count",
  mouth_energy_short: "count",
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — ⟳ 2026-09-11 · LOT E. LES CAUSES DONT LE FAUX POSITIF EST FERMÉ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⟳ 2026-09-12 · ÉTAPE C5 — ELLE EST BRANCHÉE. `generate-household-meal-v1`
 * la passe à son unique appel de `finalPlanGate`, et `FINAL_GATE_POLICY_LOT_1`
 * n'y est plus passé nulle part (épinglé dans les deux sens par
 * `plan_validation_wiring_test.ts` § ①). La note précédente disait « elle n'est
 * pas branchée, et c'est le point » ; elle est remplacée plutôt que gardée,
 * parce qu'une contrainte documentée survit à sa cause.
 *
 * ⛔ L'ORDRE A ÉTÉ TENU, ET IL EST MESURÉ. Le plan interdit d'« activer
 * globalement `FINAL_GATE_POLICY_LOT_3` pour obtenir un label plus strict » :
 * on corrige les faux positifs, PUIS on arme, cause par cause, celles dont le
 * dénominateur a été mesuré. Sur les onze sorties du transport contrôlé du
 * 2026-09-11 (`scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/`), les
 * douze causes armées ci-dessous valent ZÉRO sur dix ; la onzième (`gain`,
 * `ingredient_not_bought`) est un vrai manque d'achat — le faux positif de
 * pluriel est mort avec `covers()` au lot E.
 *
 * ⚠️ ET LA BRANCHE DE REFUS VIT APRÈS LA BOUCLE DE RÉPARATION, pas à l'endroit
 * de la garde : armer un `return` là où cette garde s'exécute aurait refusé le
 * PREMIER jet et rendu la réparation inatteignable.
 *
 * ⚠️ CE QUI EST ARMÉ ICI, ET CE QUI RESTE EN `count` :
 *
 * · `cell_without_portion` **refuse** — c'est le défaut ① du lot E, et il n'a
 *   aucun faux positif possible : « un plat est posé, personne n'a de portion »
 *   est lu sur les contenants écrits, pas sur de la prose. Une case sans repas
 *   n'est pas un plan livrable.
 * · `ingredient_short_bought` **refuse** — il ne peut sortir que d'une
 *   comparaison GRAMMES contre GRAMMES, des deux côtés chiffrés.
 * · `ingredient_not_bought` **refuse** — le faux positif de pluriel est mort
 *   avec `covers()`.
 * · une suffisance NON VÉRIFIABLE n'a **pas de cause du tout**, et c'est un
 *   arbitrage : un garde-manger déclaré sans quantité, un conditionnement non
 *   convertible ou un identifiant refusé produisent un **contrôle incomplet**,
 *   pas un écart du plan. Lui donner une cause aurait rempli `refusals[]` de
 *   lignes qui n'accusent personne — et refusé un plan pour le schéma de la
 *   base. Elle sort dans `counters.checked.shopping_unverified` et dans
 *   `finalGateDelivery().incomplete`.
 * · `cell_energy_off`, `day_energy_off`, `protein_floor_short`,
 *   `cell_energy_unmeasurable`, `mouth_energy_short` restent **`count`** :
 *   sous-nourrir est une question de QUALITÉ DE COMPOSITION, et refuser
 *   là-dessus priverait des gens de dîner. C'est l'arbitrage déjà écrit au
 *   lot 2 pour `mouth_energy_short`, appliqué aux quatre causes de la même
 *   famille. Elles font en revanche basculer la LIVRAISON en
 *   `deliverable_with_gaps` — voir `finalGateDelivery`.
 */
export const FINAL_GATE_POLICY_LOT_4: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  ...FINAL_GATE_POLICY_LOT_3,
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — LES DEUX SEULES CAUSES ARMÉES DU LOT, ET ELLES
  //                SONT DES IMPOSSIBILITÉS, PAS DES PRÉFÉRENCES
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `dedicated_dish_missing` REFUSE PARCE QU'IL N'Y A RIEN À MANGER. La
  // grille a établi que la casserole commune ne peut pas servir cette bouche;
  // sans plat à elle, le plan lui pose devant une assiette que sa ligne lui
  // interdit. C'est la définition même d'« essentiel » du contrat de bêta
  // (exclusions, attribution, présence), et le livrer serait livrer un
  // résultat incorrect comme utilisable.
  //
  // ⛔ `cell_two_table_dishes` REFUSE PARCE QUE DEUX REPAS CONCURRENTS SERVENT
  // LA MÊME BOUCHE DEUX FOIS. Sur le chemin en BOÎTES, ces plans tombaient
  // déjà — sous le nom `mouth_unfed / double`, c'est-à-dire sous la
  // CONSÉQUENCE (chaque bouche nommée sur deux couvercles) au lieu de la
  // CAUSE; la consigne de réparation partait donc corriger des couvercles.
  //
  // ⚠️ MAIS CE N'EST PAS QU'UN RENOMMAGE, ET IL FAUT LE DIRE: sur une case
  // dont AUCUN des deux plats ne porte de boîte, `mealsDelivered` ne comptait
  // aucun couvercle en double et le plan passait. Cette cause-là refuse donc
  // des plans qui passaient hier — c'est exactement le point ⑦ de la clôture
  // (« rien ne les retire »), et une épreuve du banc le montre.
  //
  // ⚠️ `own_meal_dish_missing` RESTE À `count` PAR DÉFAUT, et il n'est pas
  // écrit ici exprès: la seule façon de le passer bloquant serait de le nommer,
  // et le plan de bêta l'interdit — « une préférence de variété ne devient pas
  // automatiquement bloquante ».
  dedicated_dish_missing: "refuse",
  cell_two_table_dishes: "refuse",
  cell_without_portion: "refuse",
  cell_energy_unmeasurable: "count",
  cell_energy_off: "count",
  // ⟳ 2026-09-12 · LOT 2 — voir le pavé `cell_bounds_off` dans
  // `FINAL_GATE_CAUSES`: tant qu'elle n'est pas dans la liste protégée des
  // DEUX côtés, elle ne doit pas pouvoir atteindre le corps 422.
  cell_bounds_off: "count",
  day_energy_off: "count",
  protein_floor_short: "count",
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 2 — LES DEUX CAUSES D'ACHAT PASSENT EN `count`,
  // ET ELLES RESTENT COMPTÉES
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ C'EST UN ARBITRAGE DE LIVRAISON DÉJÀ TRANCHÉ, PAS UN ASSOUPLISSEMENT
  // DE MESURE. La décision écrite: « après deux réparations infructueuses,
  // livrer la meilleure version sûre et complète avec ses écarts signalés;
  // une portion obligatoire absente ou dangereuse empêche l'activation ».
  // Ce qui bloque reste donc la SÉCURITÉ (allergène, exclusion médicale,
  // règle de maison, régime) et `cell_without_portion`.
  //
  // ⛔ ET LA REVUE C6 § 5 INTERDIT L'AUTRE LECTURE: « la solution n'est pas de
  // choisir entre tout refuser et masquer le manque ». Ces deux causes
  // continuent de sortir dans `refusals[]`, dans `gaps`, dans
  // `planValidationRecord.defects` et dans les défauts de réparation — on
  // mesure toujours l'omission INITIALE du modèle. Ce qui change est qu'elle
  // ne jette plus un plan que le lot 1 (reconstruction déterministe des
  // achats) rend structurellement complet.
  //
  // ⚠️ LES DEUX TIRS REFUSÉS DE LA CAMPAGNE DU 2026-09-11 (n° 1 et n° 3) l'ont
  // été SUR CES DEUX CAUSES, et le tir n° 1 était un FAUX refus d'identité.
  // Un plan entier jeté pour une ligne d'achat que le moteur sait recalculer
  // est le pire des deux mondes.
  ingredient_not_bought: "count",
  ingredient_short_bought: "count",
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 3 — ON NE REFUSE PAS LE PLAN DE QUELQU'UN POUR UNE
  //                DATE QUE C'EST NOUS QUI AVONS CHOISIE
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `buy_on` N'EST PAS ÉCRIT PAR LE MODÈLE. Il est calculé par
  // `buyDatesByIndex` (`grocery_waves.ts`), c'est-à-dire par NOUS. Cette cause
  // accuse donc notre propre ordonnancement des courses — et y répondre par un
  // refus fait payer à la personne une décision qu'elle n'a pas prise. Ce qu'il
  // faut faire d'une vague mal placée, c'est la REPLACER, pas jeter six repas.
  //
  // ⛔ ET SON FAUX POSITIF EST MESURÉ, SUR UN TIR RÉEL. Le 2026-09-12, tir 3 :
  // « thon en conserve acheté le 2026-09-12, tenu 1 jour, attendu cuisiné le
  // 2026-09-14 — sans congélation ». Une boîte de thon se garde des années. Le
  // rayon venait du groupe `white_fish`, que `tuna_tinned` partage avec
  // `tuna_fresh`. La classification est corrigée à sa source
  // (`SHELF_STABLE_SLUGS`) ; cette sévérité-ci est la seconde ceinture.
  //
  // ⚠️ LA CAUSE RESTE COMPTÉE, ET ELLE RESTE UTILE : du poisson FRAIS acheté
  // trois jours avant sa cuisson sans congélation est un vrai sujet.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — ELLE EST RÉARMÉE, ET LE FAUX POSITIF EST
  //                MORT À SA SOURCE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ « LA DATE VIENT DE NOUS » JUSTIFIE DE LA CORRIGER, PAS DE SERVIR LE
  // RÉSULTAT. C'est la correction que la revue du 2026-09-12 demande en toutes
  // lettres : « pour un produit effectivement périssable, il faut déplacer
  // l'achat, adapter la cuisson/congélation si le plan le permet, puis
  // contrôler à nouveau. Une impossibilité de conservation non résolue ne
  // satisfait pas la règle de livraison d'un plan sûr. »
  //
  // ⛔ ET CE QUI A CHANGÉ DEPUIS LE PASSAGE EN `count` EST LA CAUSE DU FAUX
  // POSITIF, pas la sévérité. La datation et cette garde lisent désormais la
  // MÊME conservation (`keepingOf`, `food_keeping.ts`) : une conserve n'a plus
  // de fenêtre des deux côtés, et une fenêtre qui mord ici est une
  // incompatibilité RÉELLE — `buyOn = max(début, cuisson − fenêtre)` la rend
  // impossible par construction tant que la ligne est datée.
  //
  // ⚠️ UNE CONSERVATION INCONNUE NE REFUSE PAS. Elle sort `keeping_unknown_lines`
  // et ne passe jamais par ce refus : accuser ce qu'on n'a pas su lire est la
  // faute symétrique.
  perishable_bought_too_early: "refuse",
});

// ---------------------------------------------------------------------------
// ④ bis ⟳ 2026-09-11 · LOT E — LA LIVRAISON : trois états, et les non-évalués
// ---------------------------------------------------------------------------

/**
 * TROIS ÉTATS DE LIVRAISON, ET LE TROISIÈME N'EST PAS « ÉCHEC ».
 *
 * · `conforme`                 — aucun refus, aucun écart, et les contrôles
 *                                exigés ont TOURNÉ (dénominateurs > 0).
 * · `deliverable_with_gaps`    — servable, avec des écarts NOMMÉS. C'est la
 *                                politique déjà acceptée du dépôt ; elle ne
 *                                masque aucun motif et ne franchit aucune
 *                                borne dure.
 * · `not_deliverable`          — au moins un refus bloquant. ⛔ Le plan
 *                                l'écrit : « préserver l'ancien plan valide
 *                                tant que le remplacement n'est pas
 *                                livrable ». Un état, pas un message.
 */
export const DELIVERY_STATES = [
  "conforme",
  "deliverable_with_gaps",
  "not_deliverable",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export interface FinalGateDelivery {
  readonly state: DeliveryState;
  /** Les refus de sévérité `refuse` — ceux qui empêchent la livraison. */
  readonly blocking: readonly GateRefusal[];
  /** Les écarts nommés : tout le reste des refus listés. */
  readonly gaps: readonly GateRefusal[];
  /**
   * ⛔ LES CONTRÔLES QUI N'ONT PAS TOURNÉ, ET C'EST LA MOITIÉ DU RÉSULTAT.
   * Une cause à zéro dont le dénominateur est à zéro n'est pas propre : elle
   * n'a jamais été évaluée. Sans cette liste, `conforme` voudrait dire « rien
   * n'a mordu » au lieu de « tout a été regardé ».
   */
  readonly unevaluated: readonly FinalGateCause[];
  /**
   * ⛔ LES CONTRÔLES QUI ONT TOURNÉ SANS POUVOIR CONCLURE. Différents de
   * `unevaluated` (qui n'a pas tourné du tout) et différents de `gaps` (qui
   * accuse le plan). Le plan du chantier les exige nommément : « une conversion
   * ou un conditionnement inconnu produit un contrôle incomplet, pas un manque
   * quantifié inventé ».
   */
  readonly incomplete: readonly { readonly control: string; readonly count: number }[];
  /**
   * ⟳ 2026-09-14 · BÊTA 1B ⑧ — LES CONTRÔLES EXIGÉS QUI N'ONT PAS CONCLU.
   *
   * ⛔ NON VIDE ⇒ `state` VAUT `not_deliverable`, même sans aucun refus. C'est
   * la différence entre « rien n'a mordu » et « tout a été regardé », et le
   * plan de bêta en fait un critère de lancement (B3).
   */
  readonly missingEssential: readonly EssentialControl[];
}

// ---------------------------------------------------------------------------
// ④ ter ⟳ 2026-09-14 · BÊTA 1B ⑦⑧ — LES CONTRÔLES ESSENTIELS
// ---------------------------------------------------------------------------

/**
 * LES CONTRÔLES QU'UN PLAN LIVRABLE DOIT AVOIR FAIT CONCLURE.
 *
 * ⛔ CE SONT DES CONTRÔLES, PAS DES CAUSES. Une CAUSE accuse le plan (« cet
 * ingrédient est interdit »); un CONTRÔLE dit seulement qu'on a regardé. Un
 * plan sans aucun refus dont la nutrition n'a jamais été mesurée n'est pas un
 * plan propre: c'est un plan qu'on n'a pas lu.
 *
 * ⚠️ LA LISTE EST FERMÉE ET NOMMÉE, jamais dérivée des dénominateurs à zéro.
 * `unevaluated` en compte beaucoup qui sont légitimement sans objet — un plan
 * sans ligne périssable n'a rien à prouver sur la conservation. Choisir
 * lesquels sont ESSENTIELS est une décision de produit, et elle s'écrit.
 */
export const ESSENTIAL_CONTROLS = [
  /** Des cases étaient attendues. À zéro, la grille n'a pas tourné. */
  "cells_expected",
  /** Des couples (bouche, case) ont été confrontés au plan. */
  "mouth_cells",
  /** La nutrition par case a été lue. À zéro, aucune portion n'a été mesurée. */
  "portions_measured",
  /** Les achats ont été confrontés aux recettes. */
  "shopping_audited",
  /** Les obligations de plat à part ont été confrontées au plan livré. */
  "dedicated_checked",
  /**
   * L'énergie par case a CONCLU quelque part. ⛔ Ce n'est PAS « aucune case
   * n'est incomplète »: une journée à trou existe et se lit dans `incomplete`,
   * c'est un écart nommé, pas un contrôle absent. Ce qui est exigé ici est
   * qu'au moins une case ait été jugée alors que des cases étaient jugeables.
   */
  "cell_energy_concluded",
  /** Le plancher protéique a CONCLU quelque part, même règle exactement. */
  "protein_floor_concluded",
] as const;
export type EssentialControl = (typeof ESSENTIAL_CONTROLS)[number];

/**
 * QUAND CHAQUE CONTRÔLE EST « APPLICABLE ET NON CONCLU ».
 *
 * ⛔ FERMÉE PAR LE TYPE: `Record<EssentialControl, …>` fait recenser par le
 * compilateur tout contrôle ajouté plus tard. Un contrôle sans prédicat serait
 * un contrôle qu'on exige sans savoir le lire.
 *
 * ⚠️ `protein_floor_concluded` LIT `protein_unmeasured`, PAS `protein_days`.
 * Une abstention LÉGITIME (plancher TCA, mineur, objectif absent) sort dans
 * `protein_protected` et ne bloque rien: refuser un plan parce qu'une
 * protection a fermé serait retourner la protection contre la personne.
 */
const ESSENTIAL_CONTROL_MISSING: Readonly<
  Record<EssentialControl, (checked: FinalGateChecked) => boolean>
> = Object.freeze({
  cells_expected: (c) => c.cells === 0,
  mouth_cells: (c) => c.mouth_cells === 0,
  portions_measured: (c) => c.portion_cells === 0,
  shopping_audited: (c) => c.shopping_identities === 0,
  dedicated_checked: (c) => c.dedicated_cells_checked === 0,
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CES DEUX-LÀ LISENT UN DÉNOMINATEUR, PAS DES LIGNES. LA DIFFÉRENCE A UN
  //    PRIX MESURÉ, ET IL EST ÉCRIT ICI.
  // ══════════════════════════════════════════════════════════════════════
  //
  // La première écriture exigeait ZÉRO LIGNE incomplète
  // (`portion_cells - measured_cells - no_target > 0` ⇒ manquant). Passée sur
  // le foyer propre du banc, elle le refusait: son DIMANCHE est
  // délibérément `unmeasurable` — « sa somme manque la part du dahl, qu'aucun
  // contenant ne porte » — et sa protéine sort `coverage_unknown` sur quatre
  // journées-bouche sur huit. C'est-à-dire qu'elle refusait le cas que ce
  // dépôt a écrit comme étant PROPRE.
  //
  // ⛔ ET CE N'ÉTAIT PAS LE BON CONTRÔLE. « Cette journée-là n'a pas pu être
  // lue » est un ÉCART NOMMÉ: il sort déjà dans `incomplete`, dans
  // `planValidationRecord` et dans les défauts de réparation. Ce que la garde
  // ne savait pas dire, c'est « ce contrôle n'a JAMAIS conclu » — un
  // dénominateur à zéro. Les deux appellent des corrections opposées: la
  // première se répare dans le plan, la seconde dans l'instrument.
  //
  // ⚠️ CE QUE ÇA LAISSE OUVERT, ET IL FAUT LE DIRE: un plan dont UNE journée
  // sur sept reste illisible est livrable, avec son écart écrit. Le passer à
  // « zéro ligne incomplète » est une décision de périmètre, pas un réglage —
  // et elle demande d'abord de mesurer combien de plans elle coûterait.
  cell_energy_concluded: (c) =>
    c.portion_cells > 0 && c.measured_cells === 0 &&
    c.cell_energy_no_target === 0,
  protein_floor_concluded: (c) =>
    c.protein_days === 0 && c.protein_protected === 0 &&
    c.protein_unmeasured > 0,
});

/**
 * CE QUE LA LANE FOYER EXIGE POUR LA BÊTA.
 *
 * ⛔ LES SEPT, ET LE PLAN LES NOMME: « exclusions, attribution, présence,
 * quantités mesurables nécessaires, calories et protéines quand leur contrat
 * s'applique, bornes, intégrité des références, cuisine/courses exécutables ».
 * Retirer une ligne d'ici est un CHANGEMENT DE PÉRIMÈTRE, pas un réglage — le
 * plan exige qu'il apparaisse comme tel dans le rapport.
 */
export const HOUSEHOLD_BETA_ESSENTIALS: readonly EssentialControl[] = Object
  .freeze([...ESSENTIAL_CONTROLS]);

/**
 * LE DÉNOMINATEUR DE CHAQUE CAUSE — la table qui rend `unevaluated` calculable.
 *
 * ⛔ FERMÉE ET EXHAUSTIVE : le type `Record<FinalGateCause, …>` fait recenser
 * par le compilateur toute cause ajoutée plus tard. Une cause sans
 * dénominateur nommé serait une cause dont personne ne saurait dire si son
 * zéro veut dire « propre » ou « débranché ».
 */
const CAUSE_DENOMINATOR: Readonly<
  Record<FinalGateCause, keyof FinalGateChecked>
> = Object.freeze({
  uses_dangling: "uses",
  box_item_dangling: "box_items",
  session_cites_unknown: "session_ids",
  eaten_before_cooked: "cooked_pairs",
  eaten_too_late: "cooked_pairs",
  cook_day_unplaced: "cooked_pairs",
  preparation_without_session: "cooked_pairs",
  session_day_mismatch: "session_ids",
  cell_without_dish: "cells",
  mouth_unfed: "mouth_cells",
  dedicated_dish_missing: "dedicated_cells_checked",
  own_meal_dish_missing: "dedicated_cells_checked",
  cell_two_table_dishes: "cells",
  boxes_none_delivered: "boxed_dishes",
  box_missing: "mouth_cells",
  ingredient_not_bought: "shopping_identities",
  // ⚠️ LES LIGNES, PAS LES IDENTITÉS: cette cause naît d'une LIGNE DE COURSES
  // écrite en trop. Sans ligne, elle n'a rien à regarder.
  ingredient_bought_unused: "shopping_lines",
  ingredient_short_bought: "shopping_quantified",
  shopping_undated: "shopping_lines",
  unclassified_perishable: "perishable_lines",
  perishable_bought_too_early: "perishable_lines",
  table_exclusion_served: "ingredient_terms",
  member_exclusion_served: "ingredient_terms",
  title_promises_missing_preparation: "table_dishes",
  regime_forbidden_component: "ingredient_terms",
  house_rule_served: "ingredient_terms",
  mouth_energy_short: "energy_mouths",
  cell_without_portion: "portion_cells",
  cell_energy_unmeasurable: "portion_cells",
  cell_energy_off: "measured_cells",
  // ⚠️ LE MÊME DÉNOMINATEUR QUE L'ÉNERGIE, ET C'EST EXACT: une case hors
  // bornes a été MESURÉE (elle a une portion, une masse et une énergie
  // lisibles). Lui en donner un autre ferait lire son zéro autrement.
  cell_bounds_off: "measured_cells",
  day_energy_off: "measured_days",
  protein_floor_short: "protein_days",
});

/**
 * LE VERDICT DE LIVRAISON, LU SUR LA SORTIE DE LA GARDE.
 *
 * ⛔ IL NE DÉCIDE RIEN ET N'ÉCRIT RIEN. C'est l'appelant qui, voyant
 * `not_deliverable`, s'abstient d'écrire — et c'est cette abstention-là qui est
 * la garde, pas ce verdict. Le plan est explicite : « vérifier que la branche
 * de refus empêche réellement l'écriture ; ajouter un message ou compter
 * `blocking` ne suffit pas. »
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function finalGateDelivery(
  outcome: FinalGateOutcome,
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1B ⑦⑧ — LES CONTRÔLES QUE CE CHEMIN-CI EXIGE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS, ET POSITIONNEL. `[]` est une réponse — « ce chemin n'exige
   * aucun contrôle » — et c'est celle du chemin d'ADOPTION, qui n'a ni
   * référentiel ni grille et qui ne doit pas se mettre à refuser des
   * brouillons. Le rendre facultatif ferait exactement ce que ce dépôt paie
   * en boucle: une garde construite, branchée, et désarmée chez tous ceux qui
   * l'oublient.
   *
   * ⛔ CE QU'IL FERME. `state` ne lisait que `blocking` et `gaps`: un plan
   * dont AUCUN contrôle essentiel n'avait tourné sortait `conforme`. Le plan
   * de bêta l'interdit en toutes lettres — « aucun plan utilisable n'a d'écart
   * essentiel non résolu OU de contrôle essentiel applicable resté inconnu ».
   *
   * ⚠️ ET CE N'EST PAS UN SECOND VERDICT. On réutilise `not_deliverable`, le
   * même état, lu par les mêmes appelants: l'écran ne montre qu'une histoire.
   */
  essential: readonly EssentialControl[],
): FinalGateDelivery {
  const blocking = outcome.refusals.filter((r) => r.severity === "refuse");
  const gaps = outcome.refusals.filter((r) => r.severity !== "refuse");
  const unevaluated = FINAL_GATE_CAUSES.filter(
    (cause) => outcome.counters.checked[CAUSE_DENOMINATOR[cause]] === 0,
  );
  const checked = outcome.counters.checked;
  const incomplete = ([
    ["shopping_quantity", checked.shopping_unverified],
    // ⟳ 2026-09-13 · LOT 1 — LES CASES SANS CIBLE SORTENT DES DEUX CÔTÉS.
    // Elles ont quitté `measured_cells`; sans cette soustraction elles
    // tomberaient dans `incomplete`, c'est-à-dire « on n'a pas pu vérifier »
    // — une demande de réparation là où une protection a simplement fermé.
    [
      "cell_energy",
      checked.portion_cells - checked.measured_cells - checked.cell_energy_no_target,
    ],
    ["protein_floor", checked.protein_unmeasured],
    ["mouth_energy", checked.energy_unmeasured],
  ] as const)
    .filter(([, n]) => n > 0)
    .map(([control, count]) => ({ control, count }));
  // ⟳ 2026-09-14 · BÊTA 1B ⑦ — LES QUATRE ÉTATS DU PLAN, APPLIQUÉS À UN
  // CONTRÔLE. « Applicable et réussi », « applicable et échoué » (c'est
  // `gaps`/`blocking`), « applicable et non conclu » (ICI), « non applicable »
  // (ce que `CAUSE_DENOMINATOR` et `cell_energy_no_target` disent déjà).
  const missingEssential = essential.filter((control) =>
    ESSENTIAL_CONTROL_MISSING[control](checked)
  );
  return {
    state: blocking.length > 0 || missingEssential.length > 0
      ? "not_deliverable"
      : gaps.length > 0
      ? "deliverable_with_gaps"
      : "conforme",
    blocking,
    gaps,
    unevaluated,
    incomplete,
    missingEssential,
  };
}

// ---------------------------------------------------------------------------
// ⑤ OUTILS PURS — normalisation, promesses de lots
// ---------------------------------------------------------------------------

/** Minuscules, sans diacritiques. Local et sans dépendance : voir l'en-tête. */
function flatten(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const FR_DAY_WORDS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const EN_DAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * LE VOCABULAIRE FERMÉ DES PROMESSES DE CUISINE PAR LOTS.
 *
 * ⚠️ ÉTROIT EXPRÈS. On ne peut PAS comparer un titre à une préparation
 * disparue — on ne sait pas ce qui a été retiré. On ne cherche donc que les
 * tournures qui ANNONCENT un lot, sur un plat qui n'en cite aucun. Tout ce qui
 * n'est pas dans cette liste ne mord pas, et c'est le bon sens de l'erreur :
 * un faux négatif laisse passer une phrase, un faux positif efface une phrase
 * que quelqu'un a écrite.
 */
export const BATCH_PROMISE_MARKERS: readonly string[] = [
  "de la preparation",
  "des preparations",
  "de la casserole",
  "du batch",
  "from the batch",
  "portion of",
  ...FR_DAY_WORDS.flatMap((d) => [
    `prepare ${d}`,
    `preparee ${d}`,
    `prepares ${d}`,
    `preparees ${d}`,
    `cuisine ${d}`,
    `cuisinee ${d}`,
  ]),
  ...EN_DAY_WORDS.map((d) => `cooked on ${d}`),
];

/**
 * LA PHRASE QUI PROMET, dans un texte. `null` quand rien ne promet.
 *
 * On rend la PHRASE, pas le marqueur : c'est elle que la réparation retire, et
 * retirer le seul marqueur laisserait « Réchauffez la portion du . », c'est-à-
 * dire pire que rien (même arbitrage que `applyHouseRuleLock`, qui EFFACE le
 * `why` au lieu de le bricoler).
 */
function batchPromiseSentence(text: unknown): string | null {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
    const flat = flatten(sentence);
    if (BATCH_PROMISE_MARKERS.some((m) => flat.includes(m))) {
      const trimmed = sentence.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

// ⟳ 2026-09-11 · LOT E — `covers()` A ÉTÉ RETIRÉE, ET SA PLACE EST GARDÉE ICI
// POUR QUE PERSONNE NE LA RÉÉCRIVE.
//
// Elle répondait « ce terme de courses couvre-t-il cet ingrédient ? » par une
// inclusion de chaîne tolérante dans UN SEUL SENS: la ligne de courses devait
// être une sous-chaîne de l'ingrédient. « tomates » couvrait bien « tomates
// cerises »; « citrons » ne couvrait PAS « citron », et c'est ce sens-là que
// le modèle écrit le plus souvent. Mesuré sur la campagne du 2026-09-11:
// **8 alertes fausses sur 9**, toutes des singuliers/pluriels.
//
// ⛔ NE PAS LA « RÉPARER » EN RENDANT L'INCLUSION SYMÉTRIQUE: « lait » est une
// sous-chaîne de « laitue », et ce dépôt a déjà mesuré 12 faux positifs sur 12
// avec un matcher artisanal (`never-hand-roll-a-matcher-here`). La décision est
// portée par l'identité du référentiel — `final_plan_audit.ts::foodIdentityOf`.

/**
 * `1620` → `1 620`. ESPACE ASCII ORDINAIRE, et une implémentation locale :
 * `toLocaleString` dépend de l'ICU du runtime, donc du poste — ce module est
 * PUR et déterministe, un `detail` ne doit pas changer selon la machine.
 */
function spacedInt(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return sign + out;
}

function asFoodGroup(value: unknown): FoodGroupRef | null {
  const slug = String(value ?? "").trim();
  return (FOOD_GROUP_REFS as readonly string[]).includes(slug)
    ? slug as FoodGroupRef
    : null;
}

function asKept(value: unknown): KeptWhere {
  return String(value ?? "") === "freezer" ? "freezer" : "fridge";
}

function declaredFoods(
  ingredients: readonly GateIngredient[],
): DeclaredFood[] {
  return (ingredients ?? [])
    .map((i) => ({ term: String(i?.term ?? ""), group: asFoodGroup(i?.group) }))
    .filter((i) => i.term.trim().length > 0);
}

// ---------------------------------------------------------------------------
// ⑥ LA GARDE
// ---------------------------------------------------------------------------

export function finalPlanGate(
  plan: GatePlan,
  ctx: GateContext,
): FinalGateOutcome {
  const dishes = plan.dishes ?? [];
  const preparations = plan.preparations ?? [];
  const sessions = plan.cooking_sessions ?? [];
  const shopping = plan.shopping_list ?? [];

  const refusals: GateRefusal[] = [];
  const repairs: GateRepair[] = [];
  const byCause = {} as Record<FinalGateCause, number>;
  for (const cause of FINAL_GATE_CAUSES) byCause[cause] = 0;
  const byKind: Record<GateRepairKind, number> = {
    drop_dangling_use: 0,
    drop_dangling_box_item: 0,
    drop_dangling_session_id: 0,
    strip_title_promise: 0,
  };

  const severityOf = (cause: FinalGateCause): GateSeverity =>
    ctx.policy?.[cause] ?? "count";

  const refuse = (
    cause: FinalGateCause,
    fields: Partial<Omit<GateRefusal, "cause" | "severity" | "detail">> & {
      detail: string;
    },
  ): void => {
    byCause[cause]++;
    refusals.push({
      cause,
      severity: severityOf(cause),
      day: fields.day ?? null,
      slot: fields.slot ?? null,
      dish: fields.dish ?? null,
      preparation_id: fields.preparation_id ?? null,
      member_id: fields.member_id ?? null,
      term: fields.term ?? null,
      detail: fields.detail,
    });
  };

  const repair = (r: GateRepair): void => {
    byKind[r.kind]++;
    repairs.push(r);
  };

  const prepById = new Map<string, GatePreparation>();
  for (const p of preparations) {
    const id = String(p?.id ?? "").trim();
    if (id) prepById.set(id, p);
  }

  const rankOf = (day: unknown): number => {
    const token = String(day ?? "").trim();
    if (!token) return -1;
    return ctx.windowDays.indexOf(token);
  };

  let usesChecked = 0;
  let boxItemsChecked = 0;
  let sessionIdsChecked = 0;
  let cookedPairs = 0;
  let tableDishes = 0;
  let boxedDishes = 0;

  // ═══════════════════════════════════════════════════════════════════════
  // ① LES RÉFÉRENCES PENDANTES — trois surfaces, trois causes, trois retraits
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Une seule cause pour les trois aurait rendu impossible la lecture qui
  // compte : un `uses` pendant est une mutation de composition, un item de
  // boîte pendant est une mutation de ceinture, un id de session pendant est
  // une mutation de plan de cuisine. Trois chaînes, trois responsables.
  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "") || `dish[${dishIndex}]`;
    (dish?.uses ?? []).forEach((use, useIndex) => {
      usesChecked++;
      const id = String(use?.preparation_id ?? "").trim();
      if (prepById.has(id)) return;
      refuse("uses_dangling", {
        day: dish?.day ?? null,
        slot: dish?.slot ?? null,
        dish: title,
        preparation_id: id || null,
        detail:
          `le plat puise dans « ${id} », qui n'est pas dans les préparations`,
      });
      repair({
        kind: "drop_dangling_use",
        at: { dish: dishIndex, use: useIndex },
        from: id,
        to: null,
      });
    });

    (dish?.boxes ?? []).forEach((box, boxIndex) => {
      (box?.items ?? []).forEach((item, itemIndex) => {
        boxItemsChecked++;
        const id = String(item?.preparation_id ?? "").trim();
        // Un item SANS préparation est un aliment posé directement dans la
        // boîte : légitime, et ce n'est pas une référence pendante.
        if (!id || prepById.has(id)) return;
        refuse("box_item_dangling", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          term: String(item?.term ?? "") || null,
          detail: `la boîte « ${
            box?.id ?? boxIndex
          } » cite « ${id} », absent des préparations`,
        });
        repair({
          kind: "drop_dangling_box_item",
          at: { dish: dishIndex, box: boxIndex, item: itemIndex },
          from: id,
          to: null,
        });
      });
    });

    if ((dish?.boxes ?? []).length === 0) tableDishes++;
    else boxedDishes++;
  });

  sessions.forEach((session, sessionIndex) => {
    (session?.preparation_ids ?? []).forEach((rawId, idIndex) => {
      sessionIdsChecked++;
      const id = String(rawId ?? "").trim();
      if (prepById.has(id)) return;
      refuse("session_cites_unknown", {
        day: session?.day ?? null,
        preparation_id: id || null,
        detail: `la session du ${
          session?.day ?? "?"
        } cite « ${id} », absent des préparations`,
      });
      repair({
        kind: "drop_dangling_session_id",
        at: { session: sessionIndex, item: idIndex },
        from: id,
        to: null,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ② LA FENÊTRE CUITE — le défaut ① : cuisiné jeudi, mangé mercredi
  // ═══════════════════════════════════════════════════════════════════════
  //
  // On réutilise `cookedWindowVerdict` et `keptWindowDays`, sans les
  // réécrire : « deux copies d'un même nombre divergent, et c'est celle qu'on
  // regarde le moins qui garde l'ancienne ».
  for (const dish of dishes) {
    const title = String(dish?.title ?? "");
    const eatAt = rankOf(dish?.day);
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      const prep = prepById.get(id);
      if (!prep) continue; // déjà compté en `uses_dangling`
      cookedPairs++;
      const cookAt = rankOf(prep.cook_on);
      if (cookAt < 0) {
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `« ${
            prep.cook_on ?? "(aucun jour)"
          } » n'est pas dans la fenêtre du plan`,
        });
        continue;
      }
      if (eatAt < 0) {
        // Le plat n'est pas situable : le couple n'est pas gardé. On le DIT
        // plutôt que de l'écarter en silence — un couple non évalué est un
        // couple non gardé (`fridge_window.ts`, `not_evaluated`).
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `le jour du plat « ${
            dish?.day ?? "(aucun)"
          } » est hors de la fenêtre`,
        });
        continue;
      }
      const window = keptWindowDays({
        kept: asKept(use?.kept),
        hasFreezer: ctx.hasFreezer === true,
        maxFridgeDays: ctx.maxFridgeDays,
      });
      const verdict = cookedWindowVerdict(cookAt, eatAt, window);
      if (verdict === "before_cooking") {
        refuse("eaten_before_cooked", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail:
            `cuisiné ${prep.cook_on}, mangé ${dish?.day} — avant sa cuisson`,
        });
      } else if (verdict === "too_late") {
        refuse("eaten_too_late", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail:
            `cuisiné ${prep.cook_on}, mangé ${dish?.day} — au-delà de ${window} jour(s) de conservation`,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ③ LES SESSIONS — une casserole citée que personne ne cuisine
  // ═══════════════════════════════════════════════════════════════════════
  const citedByDishes = new Set<string>();
  for (const dish of dishes) {
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      if (id && prepById.has(id)) citedByDishes.add(id);
    }
  }
  const sessionDayOf = new Map<string, string[]>();
  for (const session of sessions) {
    for (const rawId of session?.preparation_ids ?? []) {
      const id = String(rawId ?? "").trim();
      if (!id) continue;
      const days = sessionDayOf.get(id) ?? [];
      days.push(String(session?.day ?? ""));
      sessionDayOf.set(id, days);
    }
  }
  for (const prep of preparations) {
    const id = String(prep?.id ?? "").trim();
    if (!id || !citedByDishes.has(id)) continue;
    const days = sessionDayOf.get(id);
    if (!days || days.length === 0) {
      refuse("preparation_without_session", {
        day: prep.cook_on ?? null,
        preparation_id: id,
        detail: `« ${
          prep.title ?? id
        } » est puisée par un plat mais aucune session ne la cuisine`,
      });
      continue;
    }
    for (const day of days) {
      if (day === String(prep.cook_on ?? "")) continue;
      refuse("session_day_mismatch", {
        day,
        preparation_id: id,
        detail: `session du ${
          day || "(aucun jour)"
        } pour une préparation datée ${prep.cook_on ?? "(aucun)"}`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ④ LES INTERDITS — exclusions, régimes, règle de la maison
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ `surface: "ingredients"`, JAMAIS `"all"`. Sur la prose, un faux positif
  // coûterait ici un PLAN ENTIER (la sévérité de `table_exclusion_served` est
  // `refuse` dès le lot 2), alors que chez l'appelant qui relance il ne coûte
  // qu'un appel modèle. La distinction est celle du module de ceinture.
  const exclusionPrepById = new Map(
    preparations.map((p) => [
      String(p?.id ?? ""),
      {
        id: String(p?.id ?? ""),
        title: String(p?.title ?? ""),
        method: String(p?.method ?? ""),
        ingredients: (p?.ingredients ?? []).map((i) => ({
          term: String(i?.term ?? ""),
        })),
      },
    ]),
  );
  const termsOfMember = new Map<string, readonly ForbiddenTerm[]>(
    (ctx.exclusions?.byMember ?? []).map((m) => [m.memberId, m.terms ?? []]),
  );
  const tableTerms = ctx.exclusions?.table ?? [];

  /** La surface d'un plat de table : ses propres ingrédients + ses casseroles. */
  const dishSurface = (dish: GateDish) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: String(dish?.method ?? ""),
      ingredients: (dish?.ingredients ?? []).map((i) => ({
        term: String(i?.term ?? ""),
      })),
    },
    uses: (dish?.uses ?? []).map((u) => ({
      preparationId: String(u?.preparation_id ?? ""),
    })),
  });

  /** La surface d'une boîte : ses items, et les casseroles qu'ils citent. */
  const boxSurface = (dish: GateDish, box: GateBox) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: "",
      ingredients: (box?.items ?? []).map((i) => ({
        term: String(i?.term ?? ""),
      })),
    },
    uses: (box?.items ?? [])
      .map((i) => String(i?.preparation_id ?? ""))
      .filter(Boolean)
      .map((preparationId) => ({ preparationId })),
  });

  // Les morsures recalculées ICI, pour `mealsDelivered` : voir ⑤.
  const openDishExclusionBites = new Map<GateDish, string[]>();
  const openDishRegimeBites = new Map<GateDish, string[]>();

  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "");
    const boxes = dish?.boxes ?? [];
    const open = boxes.length === 0;

    // ── ④.a L'EXCLUSION DE LA TABLE ────────────────────────────────────
    if (open) {
      const bite = dishBitesExclusion({
        ...dishSurface(dish),
        preparationById: exclusionPrepById,
        terms: tableTerms,
        surface: "ingredients",
      });
      if (bite.matched) {
        refuse("table_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail: `plat de table : « ${bite.matched} » (${
            bite.because ?? "exclusion de la table"
          })`,
        });
      }
    } else {
      for (const box of boxes) {
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
        });
        if (bite.matched) {
          refuse("table_exclusion_served", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            term: bite.matched,
            preparation_id: bite.preparationIds[0] ?? null,
            detail: `boîte « ${box.id} » : « ${bite.matched} » (${
              bite.because ?? "exclusion de la table"
            })`,
          });
        }
      }
    }

    // ── ④.b L'EXCLUSION D'UNE BOUCHE NOMMÉE SUR UN COUVERCLE ────────────
    for (const box of boxes) {
      for (const memberId of box?.member_ids ?? []) {
        const terms = termsOfMember.get(memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
        });
        if (!bite.matched) continue;
        refuse("member_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          member_id: memberId,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail:
            `boîte « ${box.id} » nommée pour cette bouche : « ${bite.matched} »`,
        });
      }
    }

    // ── ④.c LES MORSURES D'UN PLAT OUVERT, pour l'invariant des bouches ──
    if (open) {
      const bitten: string[] = [];
      if (tableTerms.length > 0) {
        const tableBite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
        });
        // Une exclusion de TABLE mord toutes les bouches à la fois.
        if (tableBite.matched) {
          bitten.push(...ctx.mouths.map((m) => m.memberId));
        }
      }
      for (const m of ctx.mouths) {
        if (bitten.includes(m.memberId)) continue;
        const terms = termsOfMember.get(m.memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
        });
        if (bite.matched) bitten.push(m.memberId);
      }
      if (bitten.length > 0) openDishExclusionBites.set(dish, bitten);
    }

    // ── ④.d LE RÉGIME ───────────────────────────────────────────────────
    //
    // Plat de table ⇒ le régime le plus strict de la maison. Plat en boîtes ⇒
    // la ligne de CHAQUE bouche nommée, sur la surface de SA boîte : le
    // grammage est par bouche, l'interdit aussi.
    const foldedFoods = (
      uses: readonly { preparationId: string }[],
    ): DeclaredFood[] => {
      const out: DeclaredFood[] = [];
      const seen = new Set<string>();
      for (const u of uses) {
        if (seen.has(u.preparationId)) continue;
        seen.add(u.preparationId);
        const prep = prepById.get(u.preparationId);
        if (prep) out.push(...declaredFoods(prep.ingredients));
      }
      return out;
    };

    if (open) {
      const regimesHere = new Set<DietaryRegime>();
      if (ctx.strictestRegime) regimesHere.add(ctx.strictestRegime);
      for (const m of ctx.mouths) if (m.regime) regimesHere.add(m.regime);
      const foods = [
        ...declaredFoods(dish?.ingredients ?? []),
        ...foldedFoods(dishSurface(dish).uses),
      ];
      const bitten: string[] = [];
      for (const regime of regimesHere) {
        const scan = scanDietaryRegime(regime, { items: foods });
        if (scan.breaches.length === 0) continue;
        bitten.push(regime);
        if (regime !== ctx.strictestRegime) continue;
        refuse("regime_forbidden_component", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: scan.breaches[0].matchedText || scan.breaches[0].token,
          detail: `plat de table contre le régime « ${regime} » : ${
            scan.breaches[0].token
          }`,
        });
      }
      if (bitten.length > 0) openDishRegimeBites.set(dish, bitten);
    } else {
      for (const box of boxes) {
        for (const memberId of box?.member_ids ?? []) {
          const regime = ctx.mouths.find((m) =>
            m.memberId === memberId
          )?.regime ?? null;
          if (!regime) continue;
          // ⚠️ LES TERMES DE LA BOÎTE COMPTENT, et c'est le seul endroit où
          // ils portent un aliment que ni le plat ni la casserole ne nomment :
          // la ceinture pose parfois une part directement sur un couvercle
          // (« poulet rôti », 150 g) sans qu'aucune ligne d'ingrédient ne
          // bouge. Les ignorer rendait ce plat végétarien aux yeux du régime.
          const foods = [
            ...declaredFoods(dish?.ingredients ?? []),
            ...declaredFoods(
              (box?.items ?? []).map((i) => ({ term: String(i?.term ?? "") })),
            ),
            ...foldedFoods(boxSurface(dish, box).uses),
          ];
          const scan = scanDietaryRegime(regime, { items: foods });
          if (scan.breaches.length === 0) continue;
          refuse("regime_forbidden_component", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            member_id: memberId,
            term: scan.breaches[0].matchedText || scan.breaches[0].token,
            detail: `boîte « ${box.id} » contre le régime « ${regime} » : ${
              scan.breaches[0].token
            }`,
          });
        }
      }
    }

    // ── ④.e LA PROMESSE DE LOT SANS LOT ─────────────────────────────────
    if ((dish?.uses ?? []).length === 0) {
      const sentence = batchPromiseSentence(dish?.method) ??
        batchPromiseSentence(dish?.title);
      if (sentence) {
        refuse("title_promises_missing_preparation", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          detail: `promet un lot sans citer de préparation : « ${sentence} »`,
        });
        repair({
          kind: "strip_title_promise",
          at: { dish: dishIndex },
          from: sentence,
          to: null,
        });
      }
    }
  });

  // ── ④.f LA RÈGLE DE LA MAISON ────────────────────────────────────────
  //
  // ⛔ REJOUÉE ICI, et ce n'est pas une redite : le chemin d'ADOPTION ne passe
  // JAMAIS par le verrou du générateur. Sans ce rappel, un plan adopté peut
  // servir ce que le foyer a exclu, et rien ne le dit.
  if ((ctx.houseRuleLabels ?? []).length > 0) {
    const lock = applyHouseRuleLock(
      dishes.map((d) => ({
        title: d?.title ?? "",
        why: d?.why ?? null,
        method: d?.method ?? "",
        ingredients: (d?.ingredients ?? []).map((i) => ({
          term: i?.term ?? "",
        })),
      })),
      ctx.houseRuleLabels,
    );
    for (const violation of lock.violations) {
      const cut = violation.lastIndexOf(":");
      const dishTitle = cut > 0 ? violation.slice(0, cut) : violation;
      const token = cut > 0 ? violation.slice(cut + 1) : null;
      const found = dishes.find((d) => String(d?.title ?? "") === dishTitle);
      refuse("house_rule_served", {
        day: found?.day ?? null,
        slot: found?.slot ?? null,
        dish: dishTitle,
        term: token,
        detail: `la maison a exclu « ${token} », et ce plat le sert`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑤ LES CASES ET LES BOUCHES — le défaut ④, et « personne sans repas »
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ `heldOff` EST VIDE, ET C'EST UN CHOIX DOCUMENTÉ. La forme persistée ne
  // porte NI `heldOff`, NI `regimeBites`, NI `exclusionBites` : ce sont des
  // sous-produits de la ceinture, jamais écrits en base. Le chemin d'adoption
  // ne les aura donc jamais. On RECALCULE les deux morsures ci-dessus (④.c et
  // ④.d) et on passe `heldOff: []` — conséquence assumée : `mealsDelivered`
  // ne peut plus attribuer la cause `held_off_*` à un retrait de boîte, elle
  // rendra `not_named`. La cause exacte vit de toute façon dans les causes
  // `*_exclusion_served` / `regime_forbidden_component` de CE module.
  const deliveredDishes: DeliveredDish[] = dishes.map((d) => ({
    title: String(d?.title ?? ""),
    day: d?.day ?? null,
    slot: d?.slot ?? null,
    memberId: d?.member_id ?? null,
    boxes: (d?.boxes ?? []).map((b) => ({
      id: String(b?.id ?? ""),
      memberIds: (b?.member_ids ?? []).map(String),
    })),
    heldOff: [],
    regimeBites: openDishRegimeBites.get(d) ?? [],
    exclusionBites: openDishExclusionBites.get(d) ?? [],
  }));
  const deliveredMouths: DeliveredMouth[] = ctx.mouths.map((m) => ({
    memberId: m.memberId,
    cells: m.cells,
    regime: m.regime,
  }));

  const expectedCells = new Set<string>();
  let mouthCells = 0;
  /** ⟳ 2026-09-14 · BÊTA 1A — le témoin: combien de plats à part sont dus. */
  let dedicatedObligations = 0;
  for (const m of ctx.mouths) {
    for (const c of m.cells ?? []) {
      const day = String(c?.day ?? "").trim();
      const slot = String(c?.slot ?? "").trim();
      if (!day || !slot) continue;
      mouthCells++;
      expectedCells.add(`${day}/${slot}`);
    }
  }

  const filledCells = new Set<string>();
  const boxedCells = new Set<string>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) continue;
    filledCells.add(`${day}/${slot}`);
    if (!d?.member_id && (d?.boxes ?? []).length > 0) {
      boxedCells.add(`${day}/${slot}`);
    }
  }

  // `cell_without_dish` est compté UNE FOIS PAR CASE, jamais par bouche : le
  // trou est celui du PLAN. Le compter par bouche le gonflerait du nombre de
  // bouches et ferait accuser l'invariant d'un défaut qui a déjà son nom.
  for (const key of [...expectedCells].sort()) {
    if (filledCells.has(key)) continue;
    const [day, slot] = key.split("/");
    refuse("cell_without_dish", {
      day,
      slot,
      detail: "aucun plat n'est posé sur cette case",
    });
  }

  const delivered = mealsDelivered(deliveredDishes, deliveredMouths);
  const boxContract = ctx.boxContract;
  for (const mouth of delivered.mouths) {
    for (const row of mouth.missing) {
      // ⛔ PARTITION, JAMAIS DOUBLE COMPTE. Les manques de `mealsDelivered` se
      // répartissent en TROIS causes de ce module, et une ligne n'en produit
      // qu'une :
      //   · `no_dish`                       → déjà dit par `cell_without_dish`
      //   · `not_named` sur une case en BOÎTES, sous contrat → `box_missing`
      //   · tout le reste                   → `mouth_unfed`
      if (row.cause === "no_dish") continue;
      const key = `${row.day}/${row.slot}`;
      if (
        boxContract !== null && row.cause === "not_named" && boxedCells.has(key)
      ) {
        refuse("box_missing", {
          day: row.day,
          slot: row.slot,
          dish: row.dish,
          member_id: row.memberId,
          detail: "ce repas est mis en boîtes, et aucun couvercle ne la nomme",
        });
        continue;
      }
      refuse("mouth_unfed", {
        day: row.day,
        slot: row.slot,
        dish: row.dish,
        member_id: row.memberId,
        preparation_id: row.preparationId,
        term: row.matched,
        detail: `unfed:${row.cause}`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — CE QUE LA GRILLE DOIT, SERVI OU NON
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA QUESTION EST « CETTE BOUCHE A-T-ELLE UN PLAT À ELLE SUR CETTE CASE »,
  // et la réponse se lit sur `member_id`, le champ que le parseur vient de
  // valider. Un plat de la table ne compte pas: c'est précisément celui dont
  // la grille a dit qu'il ne peut pas la nourrir.
  const dedicatedAt = new Set<string>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    const owner = String(d?.member_id ?? "").trim();
    if (!day || !slot || !owner) continue;
    // ⛔ UN COMPLÉMENT NE REMPLACE RIEN, voir `GateDish.complements_shared`.
    // Le compter ici ferait lire « elle a son plat » d'une personne qui mange
    // toujours la casserole interdite, avec une petite assiette en plus.
    if (d?.complements_shared === true) continue;
    dedicatedAt.add(`${day}/${slot}/${owner}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — LE SECOND CANAL: UN COMPOSANT SERVI **PAR BOÎTE**
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA PREMIÈRE ÉCRITURE DE CE CONTRÔLE NE LISAIT QUE `member_id`, ET ELLE
  // A REFUSÉ UNE RÉFÉRENCE QUI NOURRIT CORRECTEMENT. Mesuré le 2026-09-14 en
  // rejouant `ref2.json` (foyer végane + omnivore) à travers le vrai handler:
  // **6 refus `dedicated_dish_missing`** sur un plan dont la clôture avait
  // mesuré « jambon 150 g / 37,1 g de protéines chez l'omnivore, tofu 150 g /
  // 29,6 g chez la végane, zéro jambon dans sa boîte ». La divergence était
  // servie — par le canal des BOÎTES, pas par un plat à part.
  //
  // ⛔ LES DEUX CANAUX EXISTENT DANS LE PRODUIT, ET LE CONTRÔLE DOIT LIRE LES
  // DEUX. N'en lire qu'un refuserait des plans qui servent la bonne assiette,
  // ce qui est exactement l'inverse du but: « ne pas livrer un résultat
  // incorrect comme utilisable » ne veut pas dire « refuser ce qui est
  // correct ».
  //
  // ── CE QUE « SERVI PAR BOÎTE » VEUT DIRE ICI, ET C'EST MESURABLE ────────
  // Cette bouche a, sur cette case, un contenant À SON SEUL NOM qui porte un
  // composant qu'AUCUN contenant d'une autre bouche ne porte. C'est la
  // définition du partage par boîte telle que le bloc de régime la commande:
  // « one box for the people that line binds … one box for everyone else with
  // the original ».
  //
  // ⚠️ UN CONTENANT IDENTIQUE À CELUI DES AUTRES NE COMPTE PAS. Deux boîtes
  // qui puisent la même casserole dans les mêmes proportions sont un PARTAGE,
  // pas une variante — et la bouche qui diverge y mange ce que sa ligne
  // refuse.
  //
  // ⚠️ LA CLÉ D'UN COMPOSANT EST SA CASSEROLE, sinon son terme normalisé. Deux
  // termes différents pour une même casserole restent LE MÊME composant.
  const itemKey = (it: GateBoxItem): string =>
    String(it?.preparation_id ?? "").trim() !== ""
      ? `p:${String(it.preparation_id).trim()}`
      : `t:${flatten(it?.term)}`;
  /** `jour/moment/bouche` → les composants que SEULE cette bouche reçoit. */
  const exclusiveAt = new Map<string, Set<string>>();
  {
    const boxesByCell = new Map<
      string,
      { mouths: readonly string[]; keys: string[] }[]
    >();
    for (const d of dishes) {
      const day = String(d?.day ?? "").trim();
      const slot = String(d?.slot ?? "").trim();
      if (!day || !slot) continue;
      const key = `${day}/${slot}`;
      const list = boxesByCell.get(key) ?? [];
      for (const b of d?.boxes ?? []) {
        list.push({
          mouths: (b?.member_ids ?? []).map((m) => String(m ?? "").trim()),
          keys: (b?.items ?? []).map(itemKey),
        });
      }
      boxesByCell.set(key, list);
    }
    for (const [cell, boxes] of boxesByCell) {
      const mouths = new Set(boxes.flatMap((b) => b.mouths).filter(Boolean));
      for (const mouth of mouths) {
        // ⛔ « CHEZ LES AUTRES » EST LU SUR LES CONTENANTS QUI NE NOMMENT PAS
        // CETTE BOUCHE. Un bac partagé qui la nomme AVEC d'autres n'est pas un
        // contenant « des autres »: il est le sien aussi.
        const ailleurs = new Set(
          boxes.filter((b) => !b.mouths.includes(mouth)).flatMap((b) => b.keys),
        );
        const sien = new Set(
          boxes
            .filter((b) => b.mouths.length === 1 && b.mouths[0] === mouth)
            .flatMap((b) => b.keys),
        );
        const propres = [...sien].filter((k) => !ailleurs.has(k));
        if (propres.length > 0) {
          exclusiveAt.set(`${cell}/${mouth}`, new Set(propres));
        }
      }
    }
  }
  const obligations = ctx.dedicated ?? [];
  for (const o of obligations) {
    const day = String(o?.day ?? "").trim();
    const slot = String(o?.slot ?? "").trim();
    const memberId = String(o?.memberId ?? "").trim();
    if (!day || !slot || !memberId) continue;
    dedicatedObligations++;
    const adresse = `${day}/${slot}/${memberId}`;
    // ⛔ LES DEUX CANAUX, ET UN SEUL SUFFIT. Voir le pavé de `exclusiveAt`.
    if (dedicatedAt.has(adresse) || exclusiveAt.has(adresse)) continue;
    // ⛔ SEULE L'IMPOSSIBILITÉ REFUSE. Voir le pavé de `dedicated_dish_missing`
    // et celui de `dietBaseEdible`: « elle ne peut RIEN manger ici » et « elle
    // mangerait mieux autre chose » ne se réparent pas au même endroit.
    if (o.reason === "regime" && o.baseEdible !== true) {
      refuse("dedicated_dish_missing", {
        day,
        slot,
        member_id: memberId,
        detail:
          "la base partagée de cette case ne peut pas nourrir cette bouche, et " +
          "aucun plat ne lui est attribué ici",
      });
      continue;
    }
    refuse("own_meal_dish_missing", {
      day,
      slot,
      member_id: memberId,
      detail: o.reason === "regime"
        ? "la variante réclamée pour cette bouche n'est pas servie ici -- elle " +
          "mange la base commune, qui lui convient sans lui donner ce qu'elle demande"
        : "cette bouche a déclaré son propre repas ici, et n'a pas de plat à elle",
    });
  }

  // ── LA CARDINALITÉ: UN REPAS LOGIQUE PAR CASE ──────────────────────────
  //
  // ⚠️ ON COMPTE LES PLATS SANS ADRESSE, et eux seuls. Un plat dédié et un
  // complément portent un `member_id`: deux contenants sur une case sont
  // normaux, deux REPAS concurrents ne le sont pas.
  const tableDishesAt = new Map<string, number>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) continue;
    if (String(d?.member_id ?? "").trim() !== "") continue;
    const key = `${day}/${slot}`;
    tableDishesAt.set(key, (tableDishesAt.get(key) ?? 0) + 1);
  }
  for (const key of [...tableDishesAt.keys()].sort()) {
    const n = tableDishesAt.get(key) ?? 0;
    if (n < 2) continue;
    const [day, slot] = key.split("/");
    refuse("cell_two_table_dishes", {
      day,
      slot,
      detail:
        `${n} plats de table sur cette case: chaque bouche y est servie ${n} fois`,
    });
  }

  if (boxContract !== null && boxContract.expected > 0) {
    const boxesInPlan = dishes.reduce((n, d) => n + (d?.boxes ?? []).length, 0);
    if (boxesInPlan === 0) {
      refuse("boxes_none_delivered", {
        detail:
          `${boxContract.expected} boîte(s) attendue(s), le plan n'en porte aucune`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑥ LES COURSES — le défaut ② : le poisson acheté trois jours trop tôt
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ LE COMPTE DES TERMES D'INGRÉDIENT SURVIT À LA COMPARAISON QUI LES
  // UTILISAIT. `checked.ingredient_terms` reste le nombre de termes DISTINCTS
  // que les recettes citent: c'est ce qui permet de voir qu'un plan n'a pas
  // d'ingrédient du tout, indépendamment de l'audit par identité.
  const usedTerms = new Map<string, string>(); // normalisé → tel qu'écrit
  for (const dish of dishes) {
    for (const ing of dish?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }
  for (const prep of preparations) {
    for (const ing of prep?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }

  // Le besoin par terme : le RANG le plus tôt où quelqu'un en a besoin.
  //
  // ⛔ ON NE RÉUTILISE PAS `earliestCook` : elle ne connaît que les
  // préparations, et un plat qui cuisine le jour même a ses ingrédients à lui.
  // ⚠️ GAP CONNU, ÉCRIT ICI : on ne prend le jour d'un plat que lorsqu'il ne
  // puise dans AUCUNE préparation. Un plat qui réchauffe un lot ET ajoute des
  // herbes fraîches le jour même verra ses herbes datées par le lot, donc
  // potentiellement trop tôt. Élargir ferait des besoins plus précoces, donc
  // des refus que rien n'a mesuré ; le lot suivant tranchera avec un chiffre.
  const earliestRankByTerm = new Map<string, number>();
  const noteNeed = (term: unknown, rank: number): void => {
    const key = normalizePantryTerm(String(term ?? ""));
    if (!key || rank < 0) return;
    const known = earliestRankByTerm.get(key);
    if (known === undefined || rank < known) earliestRankByTerm.set(key, rank);
  };
  for (const prep of preparations) {
    const rank = rankOf(prep?.cook_on);
    for (const ing of prep?.ingredients ?? []) noteNeed(ing?.term, rank);
  }
  for (const dish of dishes) {
    if ((dish?.uses ?? []).length > 0) continue;
    const rank = rankOf(dish?.day);
    for (const ing of dish?.ingredients ?? []) noteNeed(ing?.term, rank);
  }

  // ── ⑥.a L'INGRÉDIENT QUE PERSONNE N'ACHÈTE, ET CELUI DONT ON N'A PAS ────
  //        ACHETÉ ASSEZ — ⟳ 2026-09-11 · LOT E, PAR IDENTITÉ ALIMENTAIRE
  //
  // ⛔ CE QUI A ÉTÉ RETIRÉ, ET POURQUOI ON NE L'A PAS « AMÉLIORÉ ». Ce bloc
  // comparait deux libellés normalisés avec `covers`, une inclusion de chaîne
  // ASYMÉTRIQUE: la ligne de courses devait être une SOUS-CHAÎNE de
  // l'ingrédient. « citrons » ne couvrait donc pas « citron », et les 9 alertes
  // de la campagne du 2026-09-11 en comptaient **8 fausses** — `citron`,
  // `tomate` (PERTE) et `carotte`, `citron`, `oignon`, `pita complète`,
  // `pomme de terre`, `tomate` (GAIN). Une garde fausse 8 fois sur 9 ne se
  // corrige pas par une seconde règle de chaînes: le plan demande l'identité
  // nutritionnelle commune, et c'est `final_plan_audit.ts` qui la résout.
  //
  // ⛔ ET AUCUN REPLI PAR LIBELLÉ N'EST GARDÉ. `ctx.shopping === null` veut
  // dire « pas contrôlé », et `checked.shopping_identities` le DIT. Garder
  // l'ancienne comparaison « au cas où » remettrait les 8 faux positifs dans
  // le produit en les appelant un filet de sécurité.
  const shoppingRows = ctx.shopping ?? null;
  let shoppingIdentities = 0;
  let shoppingQuantified = 0;
  let shoppingUnverified = 0;
  let shoppingNotPurchasable = 0;
  if (shoppingRows !== null) {
    for (const row of [...shoppingRows].sort((a, b) => a.identity < b.identity ? -1 : 1)) {
      shoppingIdentities++;
      // ⟳ 2026-09-12 · C3 — L'EAU DU ROBINET SORT DES QUATRE CAUSES D'ACHAT.
      // ⛔ ET ELLE NE TOMBE PAS DANS `shopping_unverified` : « non applicable »
      // n'est pas « non contrôlé » (faute de mesure n° 4 du lot 0). Elle a son
      // propre compteur, et elle reste dans le dénominateur des identités —
      // sinon un plan qui n'aurait que de l'eau se lirait « rien à regarder ».
      if (row.state === "not_purchasable") {
        shoppingNotPurchasable++;
        continue;
      }
      // ⟳ 2026-09-15 · BÊTA 2C — LA LIGNE QUE PERSONNE NE CUISINE. Elle reste
      // dans le dénominateur des identités (on l'a bien regardée), comme l'eau
      // du robinet juste au-dessus, et elle n'entre pas dans `quantified`: il
      // n'y a pas de besoin à comparer.
      if (row.state === "bought_unused") {
        refuse("ingredient_bought_unused", {
          term: row.displayTerm,
          detail: `« ${row.displayTerm} » : ${row.reason}`,
        });
        continue;
      }
      if (row.state === "covered_measured" || row.state === "short") shoppingQuantified++;
      if (row.state === "covered_measured") continue;
      if (row.state === "not_bought") {
        refuse("ingredient_not_bought", {
          term: row.displayTerm,
          detail:
            `« ${row.displayTerm} » n'est ni sur la liste de courses ni au garde-manger (${row.reason})`,
        });
        continue;
      }
      if (row.state === "short") {
        refuse("ingredient_short_bought", {
          term: row.displayTerm,
          detail: `« ${row.displayTerm} » : ${row.reason}`,
        });
        continue;
      }
      // ⛔ PAS DE REFUS ICI, ET C'EST DÉLIBÉRÉ. « On ne sait pas si la quantité
      // suffit » n'accuse ni le modèle ni le plan : il accuse ce qu'on n'a pas
      // pu lire. Le compter comme un écart ferait passer un contrôle incomplet
      // pour un défaut, c'est-à-dire exactement la faute n° 4 du lot 0 (« non
      // applicable n'est pas non contrôlé »), à l'envers.
      shoppingUnverified++;
    }
  }

  // ── ⑥.b LES LIGNES DE COURSES ────────────────────────────────────────
  let perishableLines = 0;
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — LES LIGNES DONT LA CONSERVATION EST
   * INCONNUE. ⛔ À ZÉRO, la lecture a couvert toute la liste ; sans ce nombre,
   * une liste dont aucune ligne ne porte d'identité rendrait exactement le même
   * verdict qu'une liste parfaitement résolue.
   */
  let keepingUnknown = 0;
  for (const line of shopping) {
    const term = String(line?.term ?? "");
    const aisle = String(line?.aisle ?? "");
    const perishable = PERISHABLE_AISLES.has(aisle);
    if (perishable) perishableLines++;

    const buyOn = String(line?.buy_on ?? "").trim();
    if (!buyOn) {
      refuse("shopping_undated", {
        term,
        detail: `« ${term} » n'a pas de jour d'achat`,
      });
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA MÊME LECTURE QUE LA DATATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CE BLOC LISAIT LE GROUPE, ET LA DATATION LISAIT LE RAYON. Deux
    // lectures d'un même fait, qui ont divergé : le thon EN CONSERVE partait
    // au rayon `pantry` (donc daté comme du stable) et gardait le groupe
    // `white_fish` (donc refusé ici avec la fenêtre du poisson frais, un jour).
    // Le plan de fermeture l'exige : « faire utiliser cette lecture par le
    // calcul des dates ET par `finalPlanGate` ».
    //
    // ⛔ ET LE GESTE DU CONGÉLATEUR EST DANS LA LECTURE, plus dans un `continue`
    // posé après. Il décrit la même chose — ce que cet achat peut attendre.
    const keeping = keepingOf({
      ref: line?.ref ?? null,
      group: line?.food_group ?? null,
      frozen: line?.freeze_on_purchase === true,
    });
    if (keeping.kind === "unknown") {
      // ⛔ NON VÉRIFIÉ N'EST PAS SANS CONTRAINTE. On ne peut pas dire de cette
      // ligne qu'elle se garde ; on dit qu'on ne sait pas, et ça se compte.
      keepingUnknown++;
      if (perishable) {
        refuse("unclassified_perishable", {
          term,
          detail:
            `« ${term} » est au rayon « ${aisle} » sans groupe d'aliment — sa fenêtre crue est inconnue`,
        });
      }
      continue;
    }
    const window = keeping.rawWindowDays;
    // ⚠️ `stable` ET `frozen` N'ONT PAS DE FENÊTRE, ET C'EST UNE RÉPONSE, pas
    // une abstention : rien ne les fait attendre.
    if (window === null) continue;

    const needRank = earliestRankByTerm.get(normalizePantryTerm(term));
    if (needRank === undefined) continue; // rien ne l'utilise : pas de besoin à dater
    const needBy = addDays(ctx.startsOn, needRank);
    const lastGoodDay = addDays(buyOn, window);
    if (lastGoodDay >= needBy) continue;
    refuse("perishable_bought_too_early", {
      term,
      day: ctx.windowDays[needRank] ?? null,
      detail:
        `« ${term} » acheté le ${buyOn}, tenu ${window} jour(s), attendu cuisiné le ${needBy} — sans congélation`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑦ L'ÉNERGIE SERVIE — l'écart que le redimensionnement cachait
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ON NE RECALCULE RIEN. Les kilocalories demandent l'index de composition,
  // qui n'est pas dans le payload persisté : le chemin d'ADOPTION ne l'aura
  // jamais. L'appelant MESURE, ce bloc COMPARE. Quand il n'a pas pu mesurer
  // (`ctx.energy === null`), on ne rend PAS un zéro rassurant : on compte les
  // bouches en `energy_unmeasured`, et le dénominateur reste à zéro.
  let energyMouths = 0;
  let energyUnmeasured = 0;
  const energyRows = ctx.energy ?? null;
  if (energyRows === null) {
    energyUnmeasured = (ctx.mouths ?? []).length;
  } else {
    for (const row of energyRows) {
      const envelope = Number(row?.envelopeKcal);
      const delivered = Number(row?.deliveredKcal);
      // Une enveloppe absente, nulle, négative ou non finie ne se DIVISE pas —
      // et une ligne qu'on ne peut pas comparer n'est pas une ligne propre :
      // elle n'entre pas au dénominateur, elle entre au témoin.
      if (
        !Number.isFinite(envelope) || envelope <= 0 ||
        !Number.isFinite(delivered)
      ) {
        energyUnmeasured++;
        continue;
      }
      energyMouths++;
      if (delivered >= envelope * ENERGY_SHORT_RATIO) continue;
      const percent = Math.round((delivered / envelope) * 100);
      refuse("mouth_energy_short", {
        member_id: String(row?.memberId ?? "") || null,
        detail: `${String(row?.memberId ?? "(bouche sans nom)")}: ${
          spacedInt(delivered)
        } kcal servies pour ${spacedInt(envelope)} attendues (${percent} %)`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑧ ⟳ 2026-09-11 · LOT E — LA PORTION, SA CASE, SA JOURNÉE, SA PROTÉINE
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ MÊME DISCIPLINE QUE ⑦ : ON NE RECALCULE RIEN. `final_plan_audit.ts` a
  // mesuré, ce bloc compare et nomme. Ce qui change par rapport à ⑦, c'est la
  // CLÉ : personne + DATE + créneau. Les agrégats par bouche laissaient un
  // dimanche à +30 % et un samedi à −30 % rendre une somme parfaite.
  //
  // ⚠️ LA CASE SANS PLAT EST DÉJÀ DITE PAR `cell_without_dish`, ET ON NE LA
  // REDIT PAS. `cell_without_portion` ne parle que des cases où un plat EST
  // posé : c'est exactement le trou du 2026-09-11, et le compter deux fois
  // ferait accuser l'invariant d'un défaut qui a déjà son nom.
  let portionCells = 0;
  let measuredCells = 0;
  // ⟳ 2026-09-13 · LOT 1 — les cases dont le contrat s'est abstenu.
  let cellEnergyNoTarget = 0;
  let measuredDays = 0;
  let proteinDays = 0;
  let proteinProtected = 0;
  let proteinUnmeasured = 0;
  const nutrition = ctx.nutrition ?? null;
  if (nutrition !== null) {
    for (const cell of nutrition.cells) {
      // ⛔ LE DÉNOMINATEUR NE COMPTE QUE LES CASES OÙ UNE PORTION EST ATTENDUE.
      // Y mettre les plats de table gonflerait `portion_cells` d'un nombre que
      // `cell_without_portion` ne peut pas atteindre — et un dénominateur plus
      // grand que la surface de sa règle fait lire « presque tout va bien » là
      // où la règle n'a simplement pas d'objet.
      if (!cell.portionExpected) continue;
      portionCells++;
      // ══════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-13 · LOT 1 — UNE CASE SANS CIBLE N'EST NI JUSTE NI FAUSSE
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ ELLE ÉTAIT COMPTÉE COMME UNE RÉUSSITE, ET C'EST UN FAUX VERT.
      // `cellStateOf` rend `no_target` quand une portion EXISTE et que le
      // contrat s'est abstenu (âge inconnu, corps absent, ceinture illisible).
      // Son `servedKcal` est lisible, donc elle entrait dans `measured_cells`
      // — le dénominateur de `cell_energy_off` — sans pouvoir jamais en sortir
      // un refus. Mesuré le 2026-09-13 sur `perte-l1age`: six cases d'une
      // bouche d'âge inconnu se lisaient « 24 contrôles d'énergie réussis ».
      //
      // ⛔ ET ELLE NE PART PAS DANS `incomplete` NON PLUS. « Le contrôle a
      // tourné et n'a pas conclu » et « le contrôle n'a pas d'objet » sont deux
      // phrases différentes: la première demande une réparation, la seconde
      // décrit une protection qui fonctionne. C'est la quatrième liste de
      // `plan_validation.ts` (`not_applicable`) qui la reçoit.
      if (cell.state === "no_target") {
        cellEnergyNoTarget++;
        continue;
      }
      if (cell.servedKcal !== null) measuredCells++;
      if (cell.state === "no_portion") {
        if (!cell.hasDish) continue; // dit par `cell_without_dish`
        refuse("cell_without_portion", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail:
            `un plat est posé le ${cell.date} au ${cell.slot} et aucune portion n'est calculée pour cette bouche`,
        });
        continue;
      }
      if (cell.state === "unmeasurable") {
        refuse("cell_energy_unmeasurable", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail: `portion présente le ${cell.date} au ${cell.slot}, énergie illisible (${
            cell.gap ?? "motif inconnu"
          })`,
        });
        continue;
      }
      // ══════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-12 · LOT 2 — DEUX ÉTATS, DEUX CAUSES, DEUX PHRASES
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ AVANT, LES DEUX RENDAIENT `cell_energy_off`, ET SI `deltaPct`
      // EXISTAIT LE TEXTE NE DÉCRIVAIT QUE L'ÉCART CALORIQUE. Un
      // `bounds_off` a par construction un `deltaPct` DANS la tolérance — il
      // ne franchit ses bornes qu'après avoir passé le test d'énergie. Le
      // texte disait donc « 0 % contre 728 kcal visées » d'une case dont les
      // calories étaient justes, et demandait de réparer les calories.
      if (cell.state === "energy_off") {
        refuse("cell_energy_off", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail: `${cell.date} ${cell.slot} : ${
            cell.deltaPct === null
              ? "écart calorique illisible"
              : `${cell.deltaPct > 0 ? "+" : ""}${Math.round(cell.deltaPct)} % contre ${
                spacedInt(cell.targetKcal ?? 0)
              } kcal visées`
          }`,
        });
      } else if (cell.state === "bounds_off") {
        // ⚠️ ON NOMME CE QUI EST MESURÉ, ET ON NE DEVINE PAS LA BORNE. La
        // ligne ne porte pas le contrat; `plan_defect_pass.ts` le reçoit et
        // écrit la phrase chiffrée qui part au modèle.
        const mesures =
          cell.grams === undefined || cell.grams === null ||
            cell.densityPer100G === undefined || cell.densityPer100G === null
            ? "masse et densité non transmises"
            : `${spacedInt(cell.grams)} g cuits, ${
              spacedInt(cell.densityPer100G)
            } kcal/100 g`;
        refuse("cell_bounds_off", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail:
            `${cell.date} ${cell.slot} : calories dans la tolérance, mais hors bornes de masse ` +
            `ou du couloir de densité (${mesures})`,
        });
      }
    }
    for (const day of nutrition.days) {
      if (day.state !== "unmeasurable") measuredDays++;
      if (day.state === "energy_off") {
        refuse("day_energy_off", {
          // ══════════════════════════════════════════════════════════════
          // ⟳ 2026-09-12 · ÉTAPE C4 — LA DATE ENTRE DANS L'IDENTITÉ DU REFUS
          // ══════════════════════════════════════════════════════════════
          //
          // ⛔ SANS ELLE, DEUX JOURNÉES DE LA MÊME BOUCHE ONT LA MÊME CLÉ.
          // `violationKey` (`plan_repair_loop.ts`) joint cause/jour/moment/
          // plat/préparation/bouche/terme: à `day: null`, les deux journées du
          // tir n° 1 (−42 % et −43 %) rendaient UNE seule identité — leurs
          // ampleurs s'écrasaient, et une réparation qui corrigeait l'une
          // pouvait casser l'autre sans que `compareSafety` ni
          // `magnitudeComparison` le voient.
          //
          // ⚠️ C'EST UNE DATE, PAS UN JETON DE JOUR, et c'est la seule clé que
          // `DayNutritionRow` porte. Les causes de CASE (`cell_energy_off`)
          // continuent de porter le jeton, qui est ce que leur ligne porte.
          // Les deux se lisent dans le `detail`, qui écrit la date en toutes
          // lettres depuis le lot E.
          day: day.date,
          member_id: day.memberId,
          detail: `${day.date} : ${spacedInt(day.servedKcal ?? 0)} kcal servies pour ${
            spacedInt(day.coveredBudgetKcal ?? 0)
          } couvertes (${
            day.deltaPct === null ? "?" : `${day.deltaPct > 0 ? "+" : ""}${Math.round(day.deltaPct)}`
          } %)`,
        });
      }
      // ── LE PLANCHER PROTÉIQUE, ET LES TROIS ÉTATS QUI NE SE CONFONDENT PAS ─
      //
      // ⛔ « UN GROUPE D'INGRÉDIENTS CONTENANT DES PROTÉINES NE PROUVE PAS QUE
      // LE PLANCHER EN GRAMMES EST ATTEINT. » On compare des GRAMMES à des
      // GRAMMES, jamais une présence d'ancre protéique.
      if (day.protein.reason === "protected") {
        proteinProtected++;
        continue;
      }
      const floor = day.protein.coveredFloorG;
      if (floor === null || !(floor > 0) || day.proteinG === null) {
        proteinUnmeasured++;
        continue;
      }
      proteinDays++;
      if (day.proteinG >= floor) continue;
      const percent = Math.round((day.proteinG / floor) * 100);
      refuse("protein_floor_short", {
        // ⟳ 2026-09-12 · ÉTAPE C4 — même raison qu'au-dessus: c'est cette clé
        // qui permet à `nutritionMagnitudes` de dire DE COMBIEN il manque, et
        // à la réparation de nommer la journée qu'elle doit recomposer.
        day: day.date,
        member_id: day.memberId,
        detail: `${day.date} : ${
          Math.round(day.proteinG * 10) / 10
        } g de protéine pour un plancher couvert de ${
          Math.round(floor * 10) / 10
        } g (${percent} %, ${day.protein.reason})`,
      });
    }
  }

  const counters: FinalGateCounters = {
    checked: {
      uses: usesChecked,
      box_items: boxItemsChecked,
      session_ids: sessionIdsChecked,
      cooked_pairs: cookedPairs,
      cells: expectedCells.size,
      // ⚠️ `mouthCells` ET PAS LE COMPTE DES OBLIGATIONS: voir le pavé du
      // champ. La question a été posée à chaque couple (bouche, case) dès lors
      // que la grille a tourné.
      dedicated_cells_checked: ctx.dedicated === null ? 0 : mouthCells,
      dedicated_obligations: dedicatedObligations,
      mouth_cells: mouthCells,
      shopping_lines: shopping.length,
      perishable_lines: perishableLines,
      keeping_unknown_lines: keepingUnknown,
      ingredient_terms: usedTerms.size,
      table_dishes: tableDishes,
      boxed_dishes: boxedDishes,
      energy_mouths: energyMouths,
      energy_unmeasured: energyUnmeasured,
      shopping_identities: shoppingIdentities,
      shopping_quantified: shoppingQuantified,
      shopping_unverified: shoppingUnverified,
      shopping_not_purchasable: shoppingNotPurchasable,
      portion_cells: portionCells,
      measured_cells: measuredCells,
      cell_energy_no_target: cellEnergyNoTarget,
      measured_days: measuredDays,
      protein_days: proteinDays,
      protein_protected: proteinProtected,
      protein_unmeasured: proteinUnmeasured,
    },
    refusals_by_cause: byCause,
    repairs_by_kind: byKind,
  };

  return {
    ok: !refusals.some((r) => r.severity === "refuse"),
    refusals,
    repairs,
    counters,
  };
}

// ---------------------------------------------------------------------------
// ⑦ LES RÉPARATIONS — pures, un NOUVEAU plan
// ---------------------------------------------------------------------------

/**
 * APPLIQUE LES RETRAITS PROPOSÉS, SANS TOUCHER À L'ENTRÉE.
 *
 * ⚠️ LES INDEX SONT CEUX DU PLAN PASSÉ À `finalPlanGate`. On retire donc EN
 * BLOC, par ensembles d'index, jamais par `splice` successifs : un retrait
 * décale les suivants, et c'est le mode de corruption silencieuse le plus
 * facile à écrire dans ce genre de fonction.
 *
 * ⚠️ CETTE FONCTION N'APPLIQUE QUE CE QU'ON LUI DONNE. Elle ne filtre pas par
 * sévérité : c'est l'APPELANT qui décide s'il répare (et il le décide avec la
 * politique), parce que lui seul sait s'il a le droit de modifier ce plan-là.
 */
export function applyFinalGateRepairs(
  plan: GatePlan,
  repairs: readonly GateRepair[],
): GatePlan {
  const dropUses = new Map<number, Set<number>>();
  const dropBoxItems = new Map<string, Set<number>>();
  const dropSessionIds = new Map<number, Set<number>>();
  const stripSentences = new Map<number, string[]>();

  for (const r of repairs ?? []) {
    if (r.kind === "drop_dangling_use") {
      const d = r.at?.dish;
      const u = r.at?.use;
      if (typeof d !== "number" || typeof u !== "number") continue;
      const set = dropUses.get(d) ?? new Set<number>();
      set.add(u);
      dropUses.set(d, set);
    } else if (r.kind === "drop_dangling_box_item") {
      const d = r.at?.dish;
      const b = r.at?.box;
      const i = r.at?.item;
      if (
        typeof d !== "number" || typeof b !== "number" || typeof i !== "number"
      ) continue;
      const key = `${d}/${b}`;
      const set = dropBoxItems.get(key) ?? new Set<number>();
      set.add(i);
      dropBoxItems.set(key, set);
    } else if (r.kind === "drop_dangling_session_id") {
      const s = r.at?.session;
      const i = r.at?.item;
      if (typeof s !== "number" || typeof i !== "number") continue;
      const set = dropSessionIds.get(s) ?? new Set<number>();
      set.add(i);
      dropSessionIds.set(s, set);
    } else if (r.kind === "strip_title_promise") {
      const d = r.at?.dish;
      if (typeof d !== "number" || !r.from) continue;
      const list = stripSentences.get(d) ?? [];
      list.push(r.from);
      stripSentences.set(d, list);
    }
  }

  const stripFrom = (text: unknown, sentences: readonly string[]): string => {
    let out = String(text ?? "");
    for (const sentence of sentences) {
      if (!sentence) continue;
      out = out.split(sentence).join("");
    }
    return out.replace(/\s{2,}/g, " ").trim();
  };

  const dishes = (plan.dishes ?? []).map((dish, dishIndex) => {
    const droppedUses = dropUses.get(dishIndex);
    const sentences = stripSentences.get(dishIndex);
    const boxes = (dish.boxes ?? []).map((box, boxIndex) => {
      const dropped = dropBoxItems.get(`${dishIndex}/${boxIndex}`);
      if (!dropped) return box;
      return {
        ...box,
        items: (box.items ?? []).filter((_, i) => !dropped.has(i)),
      };
    });
    const next: GateDish = {
      ...dish,
      uses: droppedUses
        ? (dish.uses ?? []).filter((_, i) => !droppedUses.has(i))
        : (dish.uses ?? []),
      boxes,
    };
    if (!sentences || sentences.length === 0) return next;
    return {
      ...next,
      title: stripFrom(next.title, sentences),
      method: stripFrom(next.method, sentences),
    };
  });

  const cooking_sessions = (plan.cooking_sessions ?? []).map(
    (session, index) => {
      const dropped = dropSessionIds.get(index);
      if (!dropped) return session;
      return {
        ...session,
        preparation_ids: (session.preparation_ids ?? []).filter((_, i) =>
          !dropped.has(i)
        ),
      };
    },
  );

  return {
    dishes,
    preparations: (plan.preparations ?? []).map((p) => p),
    cooking_sessions,
    shopping_list: (plan.shopping_list ?? []).map((l) => l),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 · LOT 6 — L'ADAPTATEUR VIT ICI, À CÔTÉ DU TYPE QU'IL PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI IL DÉMÉNAGE. Il était privé dans `draft_adopt.ts`, donc la seule
// façon d'atteindre cette garde était de passer par l'adoption — et l'adoption
// n'a AUCUN appelant vivant (mesuré le 2026-09-10). Résultat: `finalPlanGate`,
// ses 22 causes et ses 900 lignes n'ont **jamais tourné sur un plan réel**.
// C'est le mode d'échec « ceinture armée sur coffre vide », et il coûtait ici
// la totalité du dernier contrôle de sécurité du produit.
//
// ⚠️ IL NE VALIDE RIEN, ET C'EST VOULU. Il met une charge JSON à la forme que
// la garde lit; c'est la garde qui juge. Un adaptateur qui filtrerait au
// passage ferait un second avis, invisible, sur ce qui mérite d'être contrôlé.
export function asGatePlan(value: unknown): GatePlan {
  const src = value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const arr = (v: unknown): readonly unknown[] => Array.isArray(v) ? v : [];
  return {
    dishes: arr(src.dishes) as readonly GateDish[],
    preparations: arr(src.preparations) as readonly GatePreparation[],
    cooking_sessions: arr(src.cooking_sessions) as readonly GateSession[],
    shopping_list: arr(src.shopping_list) as readonly GateShoppingLine[],
  };
}
