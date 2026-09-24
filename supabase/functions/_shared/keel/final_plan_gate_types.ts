// ═══════════════════════════════════════════════════════════════════════════
// LA GARDE FINALE DU PLAN — LES TYPES, LES CAUSES, LES DEUX SEUILS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `final_plan_gate.ts` (découpage des gros
// fichiers, lot 2a). Aucune logique changée. `final_plan_gate.ts` ré-exporte
// tout ce qui est ici : les appelants continuent d'importer depuis lui.
// L'en-tête qui explique la garde reste dans `final_plan_gate.ts`.
//
// Ce module n'importe que des types, et aucune valeur de `final_plan_gate.ts`.

import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import type { DietaryRegime } from "./dietary_regime.ts";

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
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS DU PLAT (entrée, fromage, dessert, pain),
   * rangés HORS des ingrédients et des boîtes (`DishSideCoursePayload`,
   * `side_courses_types.ts`). Absent d'un plan écrit avant le 2026-09-23.
   * Lu ici par le seul verrou de la maison (④.f).
   */
  readonly side_courses?: readonly GateSideCourse[] | null;
}

/**
 * ⟳ 2026-09-23 — un à-côté persisté, réduit à ce que la garde lit. Le JSON
 * relu n'est pas re-typé: chaque champ est lu défensivement.
 */
export interface GateSideCourse {
  readonly member_id?: string | null;
  readonly kind?: string | null;
  readonly term?: string | null;
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
  /**
   * ⟳ 2026-09-15 · BÊTA — la borne d'arrondi de la case. Ici elle ne sert QUE
   * la phrase du refus: le verdict `bounds_off` est rendu par l'audit
   * (`cellStateOf`), qui la lit en champ requis. Optionnelle ici, elle ne
   * désarme rien — elle n'arme rien non plus.
   */
  readonly proteinRoundingG?: number | null;
  readonly densityRoundingPer100G?: number | null;
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
  /**
   * ⟳ 2026-09-15 · BÊTA — LA BORNE D'ARRONDI DU JOUR, CALCULÉE PAR L'AUDIT
   * (Σ ½ g × protéine au gramme de chaque item + 0,05 g par boîte). Le plancher
   * est tenu quand `proteinG + proteinRoundingG ≥ plancher`. ⛔ REQUIS ET
   * NULLABLE: `null` = inconnue, lue comme zéro — jamais un `?` qui ferait de
   * l'oubli d'un appelant une tolérance.
   */
  readonly proteinRoundingG: number | null;
  readonly protein: {
    readonly coveredFloorG: number | null;
    /**
     * ⟳ 2026-09-21 — LE PLAFOND COUVERT, à côté du plancher. ⛔ REQUIS ET
     * NULLABLE, jamais `?`: un appelant qui l'oublie ne compile pas, au lieu
     * de rendre une cause qui ne sort jamais.
     */
    readonly coveredCeilingG: number | null;
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
  /**
   * ⟳ 2026-09-21 — LE PLAFOND, ENFIN COMPARÉ LUI AUSSI. Mesuré sur le plan
   * `3e121b21`: 198 g servis à l'homme en prise de masse pour un plafond de
   * 144 (+37 %), par un goûter de thon en boîte chaque jour, et le seul
   * compteur (`generated_from.protein_ceiling`) ne nommait ni la journée ni
   * la bouche. Comptée, jamais bloquante: un plan qui dépasse est livré avec
   * son écart, comme sous le plancher. Tolérance `PROTEIN_CEILING_TOLERANCE`.
   */
  "protein_ceiling_over",
] as const;
export type FinalGateCause = typeof FINAL_GATE_CAUSES[number];

/**
 * LA TOLÉRANCE AU-DESSUS DU PLAFOND PROTÉIQUE, en fraction — 10 %.
 *
 * ⚠️ 2,0 g/kg est le plafond de confort (`PROTEIN_CEILING_G_PER_KG`); la
 * borne haute de la littérature sur la prise de muscle est 2,2 g/kg (Morton
 * 2018, borne haute de l'intervalle). La tolérance couvre exactement cet
 * écart: entre 2,0 et 2,2 on ne dit rien, au-delà on compte. EXPORTÉE pour
 * qu'un test l'épingle et qu'un déplacement soit un commit, pas un littéral.
 */
export const PROTEIN_CEILING_TOLERANCE = 0.1;

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
  | "strip_title_promise"
  /**
   * ⟳ 2026-09-23 — un à-côté qui sert un aliment que la maison a exclu. Même
   * geste que le verrou du générateur (`applyHouseRuleLock`): l'à-côté TOMBE,
   * le plat reste, et ce n'est PAS `house_rule_served` — aucune cause, donc
   * aucun refus et aucun 422 pour un dessert posé à côté du plat.
   */
  | "drop_house_rule_side_course";

/**
 * OÙ LA RÉPARATION S'APPLIQUE, en index dans le payload persisté.
 *
 * · `drop_dangling_use`        → `{ dish, use }`
 * · `drop_dangling_box_item`   → `{ dish, box, item }`
 * · `drop_dangling_session_id` → `{ session, item }` (index dans `preparation_ids`)
 * · `strip_title_promise`      → `{ dish }`
 * · `drop_house_rule_side_course` → `{ dish, item }` (index dans `side_courses`)
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
   * `null` pour les cinq réparations livrées : toutes sont des RETRAITS.
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
  /**
   * ⟳ 2026-09-15 · BÊTA — Journées SOUS le plancher de moins que la borne
   * d'arrondi calculée (`proteinRoundingG`): comptées tenues, et comptées ICI
   * pour que le bilan dise combien de journées la borne a fermées.
   */
  readonly protein_within_rounding: number;
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
