/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL · LOT 1 (2026-09-12) — LA FRONTIÈRE DE L'ARRONDI : L'ENTIER LE PLUS
 * PROCHE **À L'INTÉRIEUR** DES BORNES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ LE DÉFAUT, MESURÉ SUR 45 PORTIONS RÉELLES ────────────────────────
 * Campagne des six tirs, 2026-09-12, tir 4 (petit appétit) :
 *
 *     {"day":"sun","slot":"breakfast","grams":631,"limit":630,"bound":"max"}
 *
 * **1 gramme au-dessus du plafond.** C'est la forme exacte du
 * `sun/lunch 701 g / 700` que C4 avait nommée. Le rapport de clôture l'écrit :
 * « l'arrondi au plus proche peut franchir une borne d'une demi-unité, et rien
 * ne la rabote après ». Chaque item d'un contenant est arrondi séparément
 * (`Math.round` dans `applySizing`) ; la somme de N entiers arrondis n'est pas
 * l'arrondi de la somme, et elle peut sortir du couloir que la somme
 * respectait.
 *
 * ── ⛔ CE QUE CE MODULE N'EST PAS ───────────────────────────────────────
 * Ce n'est **pas** une recomposition, et ce n'est **pas** un retour aux
 * fractions. La revue est explicite : « conserver le principe choisi… définir
 * le traitement déterministe de frontière ». On ne rouvre aucune optimisation,
 * on ne change aucune proportion de recette, on ne coupe aucune pièce entière :
 * on déplace des GRAMMES DE PORTION, c'est-à-dire ce que `applySizing` avait
 * déjà décidé d'écrire, d'un entier vers l'entier voisin.
 *
 * ── ⛔ ET IL NE RÉPARE QUE COMPLÈTEMENT ─────────────────────────────────
 * Une portion qu'on ne peut pas ramener ENTIÈREMENT dans ses bornes n'est pas
 * touchée du tout, et elle se COMPTE (`still_over_max` / `still_under_min`).
 * Un rabotage partiel rendrait une portion que plus personne n'a mesurée :
 * ni celle du dimensionnement, ni une portion conforme.
 *
 * ── ⛔ ET IL NE PUISE JAMAIS PLUS QUE LE LOT ────────────────────────────
 * « Répartir les prélèvements des préparations sans dépasser le lot
 * disponible. » Raboter ne peut rien dépasser (on prélève MOINS). Remonter,
 * si : la marge est bornée par ce que la casserole produit réellement
 * (`potReadyGrams`), marge d'identité comprise. Un lot dont la masse est
 * INCONNUE n'offre aucune marge — « je ne sais pas » n'est pas « ça va ».
 *
 * ⚠️ LE FRAIS NE SE REMONTE PAS. Un item sans `preparationId` vient des
 * ingrédients du plat : lui ajouter des grammes ferait servir un aliment que
 * la recette ne contient pas. On rabote le frais (la recette en contient
 * assez), on ne l'augmente pas.
 *
 * PURE: no I/O, no clock, no randomness. Mute les items qu'on lui DONNE, comme
 * `roundQuantityLines`.
 */

// ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE PLANCHER D'IDENTITÉ VIENT DE `box_densify.ts`,
// pas d'une seconde écriture ici: les deux modules déplacent des grammes dans
// les mêmes contenants.
import { itemFloorGrams } from "./box_densify.ts";
import type { FoodGroupRef } from "./tokens.ts";
// ⟳ 2026-09-23 · AUDIT DES DOSAGES, LOT 5 — LE FÉCULENT EST CELUI DE
// `starch_side.ts` (les groupes que le référentiel confirme), et l'objectif est
// le même vocabulaire que le partage du féculent. `import type`: aucun cycle.
import { CEILING_STARCH_GROUPS } from "./protein_ceiling_adjust.ts";
import type { StarchGoal } from "./starch_side.ts";

/** Un item de contenant, réduit à ce dont ce module a besoin. */
export interface BoundedBoxItem {
  /** L'identifiant de la casserole où cet item PUISE. `null` = frais du plat. */
  preparationId: string | null;
  grams: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE GROUPE ALIMENTAIRE, POUR SON PLANCHER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QUE SON ABSENCE COÛTAIT, MESURÉ. `planShave` prend au PLUS GROS item
   * d'abord, jusqu'à `MIN_ITEM_GRAMS = 1`. Sur un gros rabotage, le plus gros
   * item est le féculent — et la clôture du 2026-09-14 a lu **1 g de couscous**
   * dans un plat qui s'appelle « poulet rôti, couscous complet et courgette ».
   * Le repas rentrait dans ses bornes, et ce n'était plus le plat.
   *
   * `null` = groupe inconnu ⇒ plancher générique (50 % de sa masse d'origine),
   * comme `box_densify.ts` le fait déjà pour la même population.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un `?` oublié ferait retomber tous les
   * items sur le plancher de 1 g, c'est-à-dire sur l'état d'avant ce lot —
   * une garde construite et désarmée en silence.
   */
  group: FoodGroupRef | null;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-23 · AUDIT DES DOSAGES, LOT 5 — L'ORDRE DU RABOTAGE SUIT
   * L'OBJECTIF, ET L'ÉNERGIE RETIRÉE SE COMPTE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * L'énergie d'un gramme SERVI de cet item (`densityFromComposition`,
   * `kcalPerGram`). `null` = densité inconnue: l'item se rabote encore, mais
   * ses grammes retirés se comptent à part (`grams_shaved_unpriced`) — jamais
   * comme zéro kcal.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`: un oubli rendrait `kcal_shaved` à zéro
   * sur un plan qui rabote — le « 100 % » de `day_kcal` que l'audit a mesuré
   * pendant que le rabotage retirait jusqu'à 460 kcal par jour.
   */
  kcalPerG: number | null;
  /**
   * L'item est un FÉCULENT (`isStarchItemGroup` de son groupe). En perte et en
   * maintien, c'est lui qu'on rabote d'abord.
   *
   * ⛔ REQUIS: un `false` par défaut rendrait l'ordre d'avant sur tout le plan,
   * et le compteur `shave_order.starch_first` ne dirait pas pourquoi.
   */
  starch: boolean;
}

/**
 * UN GROUPE ALIMENTAIRE EST-IL UN FÉCULENT ? La MÊME liste que
 * `starchSideOf` (`CEILING_STARCH_GROUPS`): céréales complètes et raffinées,
 * légumes féculents. `null` (non résolu) n'en est pas un.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function isStarchItemGroup(group: FoodGroupRef | null): boolean {
  return group !== null && CEILING_STARCH_GROUPS.has(group);
}

/**
 * L'ORDRE DANS LEQUEL UN REPAS RABOTÉ PREND SES GRAMMES. Fermé, compté.
 *
 *   · `starch_first` — perte et maintien: le féculent d'abord, jusqu'à son
 *     plancher, puis le plus gros item;
 *   · `least_dense_first` — prise de muscle: l'item le MOINS dense d'abord,
 *     celui qui perd le moins d'énergie par gramme retiré;
 *   · `largest_first` — objectif `null` (mineur, âge inconnu): la règle
 *     d'avant ce lot, le plus gros item d'abord.
 */
export const SHAVE_ORDERS = ["starch_first", "least_dense_first", "largest_first"] as const;
export type ShaveOrder = (typeof SHAVE_ORDERS)[number];

/** L'ordre de rabotage d'un objectif. */
export function shaveOrderFor(goal: StarchGoal | null): ShaveOrder {
  if (goal === "fat_loss" || goal === "maintenance") return "starch_first";
  if (goal === "muscle_gain") return "least_dense_first";
  return "largest_first";
}

/** Un contenant, réduit à ce dont ce module a besoin. */
export interface BoundedBox {
  boxId: string;
  day: string | null;
  slot: string | null;
  /** Une seule bouche = une ASSIETTE jugeable ; plusieurs = un bac. */
  memberIds: readonly string[];
  items: BoundedBoxItem[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.4 — L'UNITÉ JUGÉE EST LE **REPAS**, PAS LE CONTENANT
// ═══════════════════════════════════════════════════════════════════════════
//
// ── ⛔ LE DÉFAUT, MESURÉ (tir `perte-iso10`, plan `d1b0036e`) ─────────────
// `splitPlateWithComplement` avait partagé l'assiette de Lea : **216 g** du plat
// commun + **9 g** de complément = **225 g**, exactement son plancher, pour la
// cible de son moment. Deux plats, donc DEUX contenants à son nom, au même jour
// et au même moment. Ce module les a jugés SÉPARÉMENT : 216 g < 225, il a relevé
// la part commune à 225 (`raised: 2, grams_raised: 14`), et l'assiette écrite
// pèse **225 + 9 = 234 g** — 563,6 kcal pour une cible de 542,85, **+3,8 %**.
//
// ── LA RÈGLE, ET ELLE EST DANS LE NOM DES BORNES ────────────────────────
// `plateBoundsFor` rend ce que pèse **une assiette** à une bouche, un jour, un
// moment. Ce n'est pas une propriété d'un plat : deux plats du même moment pour
// la même bouche se partagent ces bornes-là. Le minimum concerne donc LEUR
// SOMME, et le réappliquer à chaque composant le compte autant de fois qu'il y a
// de plats.
//
// ⛔ CE QUI NE DISPARAÎT PAS POUR AUTANT — les limites d'un COMPOSANT restent,
// parce qu'elles sont justifiées par son propre contrat :
//   · `MIN_ITEM_GRAMS` : un item ne descend pas sous 1 g (le retirer serait une
//     recomposition) ;
//   · la marge de la casserole : on ne puise jamais plus que ce que le lot
//     produit, et elle se compte sur TOUS les contenants à la fois ;
//   · le frais d'un plat ne se remonte jamais.
//
// ⚠️ ET UN BAC RESTE HORS JUGEMENT. Les grammes d'un contenant à plusieurs noms
// sont une quantité de RÉCIPIENT, pas la portion de quelqu'un.

/**
 * LE REPAS D'UNE BOUCHE À UN MOMENT — la clé qui regroupe ses contenants.
 *
 * ⛔ C'EST LA MÊME CLÉ QUE CELLE DES BORNES (`(memberId, day, slot)` chez
 * l'appelant). Les faire diverger rendrait un groupe jugé contre les bornes d'un
 * autre — et la divergence serait muette.
 */
export interface BoundedMeal {
  memberId: string;
  day: string | null;
  slot: string | null;
}

/** Les bornes de masse d'une assiette, en grammes servis. */
export interface PortionBounds {
  min: number;
  max: number;
}

/**
 * ⛔ LES COMPTEURS SONT LE LOT. Un réglage de frontière débranché rend
 * exactement le même plan qu'un réglage qui marche, à ceci près que ses
 * compteurs sont nuls.
 */
export interface PortionBoundaryCounts {
  /** Le dénominateur: tous les contenants vus. */
  boxes: number;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES REPAS: les contenants d'UNE bouche, regroupés par
   * jour et moment. C'est l'unité que tous les compteurs ci-dessous emploient.
   */
  meals: number;
  /**
   * ⟳ 2026-09-13 · LOT 2 — CEUX QUI PORTENT PLUS D'UN CONTENANT (un complément).
   *
   * ⛔ SANS CE NOMBRE, LE LOT EST INVISIBLE. À zéro, le regroupement rend
   * exactement le même plan que le jugement contenant par contenant: on ne
   * saurait pas si la règle ne mord pas, ou si elle n'est pas branchée.
   */
  multi_box_meals: number;
  /** Les contenants à PLUSIEURS noms, jamais jugés: un bac n'est pas une assiette. */
  tubs_not_judged: number;
  /** Les repas dont on connaît les bornes — les autres ne sont pas jugés. */
  judged: number;
  /** Déjà dans le couloir: rien à faire. */
  already_in_bounds: number;
  /** Ramenés SOUS le plafond. */
  shaved: number;
  /** Ramenés AU-DESSUS du plancher. */
  raised: number;
  /** Grammes réellement retirés. L'amplitude, pas seulement le nombre de cas. */
  grams_shaved: number;
  /** Grammes réellement ajoutés, tous puisés dans une casserole. */
  grams_raised: number;
  /** Au-dessus du plafond et INTOUCHÉS: le rabotage ne tenait pas. */
  still_over_max: number;
  /** Sous le plancher et INTOUCHÉS. */
  still_under_min: number;
  /**
   * ⛔ SOUS LE PLANCHER, ET C'EST LA CASSEROLE QUI DIT NON. Non nul, il dit que
   * la remontée a été REFUSÉE par la disponibilité du lot — pas qu'elle a
   * échoué, pas qu'elle n'était pas nécessaire.
   */
  pot_headroom_blocked: number;
  /**
   * ⟳ 2026-09-23 · LOT 5 — L'ÉNERGIE RÉELLEMENT RETIRÉE, en kcal (grammes
   * retirés × `kcalPerG`). ⛔ Sans elle, `day_kcal` affichait 100 % pendant que
   * le rabotage retirait jusqu'à 460 kcal par jour (audit du 2026-09-23).
   * ⚠️ UNE BORNE BASSE quand `grams_shaved_unpriced` n'est pas nul.
   */
  kcal_shaved: number;
  /** Les grammes retirés d'items dont la densité est inconnue: hors de `kcal_shaved`. */
  grams_shaved_unpriced: number;
  /**
   * ⟳ LOT 5 — LES REPAS RABOTÉS, PAR ORDRE DE RABOTAGE. Les trois clés sont
   * toujours là, zéros compris: un `largest_first` seul sur un foyer d'adultes
   * dit que `goalOf` ne rend rien — une règle désarmée, pas une règle qui ne
   * mord pas.
   */
  shave_order: Record<ShaveOrder, number>;
  /**
   * ⟳ LOT 5 — PAR BOUCHE: repas rabotés, grammes et kcal retirés. Une entrée
   * pour CHAQUE bouche dont un repas a été jugé, zéros compris.
   *
   * ⛔ LA CLÉ EST LE `memberId`. Ce module ne connaît rien d'autre; c'est à
   * l'appelant de la remplacer par le seau de la bouche avant tout journal —
   * la règle du générateur: jamais un `member_id` à côté d'un kcal.
   */
  by_member: Record<string, { meals: number; grams: number; kcal: number }>;
  /**
   * ⟳ LOT 5 — LES ITEMS REÇUS SANS `kcalPerG` OU SANS `starch` LISIBLE
   * (`undefined`, ou un `starch` qui n'est pas un booléen).
   *
   * ⛔ LE TYPE REQUIS NE SUFFIT PAS ICI: le générateur passe ses items par
   * `box.items as unknown as BoundedBoxItem[]`, et ce `as` désarme le contrôle
   * de types. Un appelant qui oublie de poser les deux champs rendrait l'ordre
   * d'avant et `kcal_shaved` à zéro — un plan identique à un plan où la règle
   * marche. DOIT RESTER 0.
   */
  items_missing_shave_facts: number;
}

/**
 * ⟳ 2026-09-24 — CE QUE LE RABOTAGE A RETIRÉ À UN REPAS, en kcal (grammes
 * retirés × `kcalPerG`, les items sans densité comptant zéro, comme dans
 * `kcal_shaved`).
 *
 * ⛔ EN MÉMOIRE SEULEMENT, ET CE N'EST PAS UN COMPTEUR: il porte un `memberId`
 * à côté de kcal. Il sert au registre des à-côtés, qui rend cette énergie au
 * pain et au fromage (`buildSideCourseLedger`, `extraDeficitByKey`). Jamais
 * journalisé tel quel.
 */
export interface ShavedMealKcal {
  memberId: string;
  day: string | null;
  slot: string | null;
  kcal: number;
}

/**
 * ⟳ 2026-09-24 — CE QUE REND `fitPortionsToBounds`: les compteurs, plus le
 * relevé des repas rabotés (`shavedByMeal`), un par repas raboté.
 */
export interface PortionBoundaryResult extends PortionBoundaryCounts {
  shavedByMeal: ShavedMealKcal[];
}

export function emptyPortionBoundaryCounts(): PortionBoundaryCounts {
  return {
    boxes: 0,
    meals: 0,
    multi_box_meals: 0,
    tubs_not_judged: 0,
    judged: 0,
    already_in_bounds: 0,
    shaved: 0,
    raised: 0,
    grams_shaved: 0,
    grams_raised: 0,
    still_over_max: 0,
    still_under_min: 0,
    pot_headroom_blocked: 0,
    kcal_shaved: 0,
    grams_shaved_unpriced: 0,
    shave_order: { starch_first: 0, least_dense_first: 0, largest_first: 0 },
    by_member: {},
    items_missing_shave_facts: 0,
  };
}

/**
 * LE PLANCHER D'UN ITEM, EN GRAMMES.
 *
 * ⚠️ 1 g ET PAS 0. Un item ramené à zéro est un aliment RETIRÉ de l'assiette,
 * et retirer un aliment est une recomposition — exactement ce que ce module
 * n'a pas le droit de faire. Le jour où un gramme manque et qu'aucun item ne
 * peut le donner, la portion n'est pas touchée et elle se compte.
 */
const MIN_ITEM_GRAMS = 1;

/**
 * RAMÈNE CHAQUE **REPAS** DANS SES BORNES, SUR PLACE — ET SEULEMENT QUAND IL
 * PEUT Y RENTRER ENTIÈREMENT.
 *
 * ⛔ UN REPAS = TOUS LES CONTENANTS D'UNE BOUCHE À UN JOUR ET UN MOMENT. Quand
 * une assiette a été partagée entre un plat commun et un complément, les deux
 * comptent pour UNE portion: ce sont leurs grammes ADDITIONNÉS qu'on compare aux
 * bornes, et les deux composants offrent leurs items au rabotage comme à la
 * remontée. Voir le pavé § 2.4 ci-dessus.
 *
 * ⚠️ À APPELER APRÈS l'arrondi des quantités et `regramMeal`, et AVANT
 * `finalPortionCheck` : c'est le dernier geste qui touche un gramme servi, et
 * le contrôle qui suit doit lire ce qu'on vient d'écrire.
 */
export function fitPortionsToBounds(args: {
  boxes: readonly BoundedBox[];
  /**
   * LES BORNES D'UN REPAS. `null` = on ne sait pas ce qu'il devrait peser ⇒ pas
   * jugé.
   *
   * ⛔ ELLE PREND LE REPAS, PLUS LE CONTENANT — et ce n'est pas cosmétique. Un
   * rappel par contenant laisserait croire qu'un plat peut avoir ses propres
   * bornes d'assiette; c'est très exactement la confusion qui a servi 234 g pour
   * un plancher de 225.
   */
  boundsFor: (meal: BoundedMeal) => PortionBounds | null;
  /**
   * LA MASSE PRÊTE DE CHAQUE CASSEROLE, par `measurePreparation`. `null` =
   * immesurable, donc AUCUNE marge (voir le pavé de tête).
   *
   * ⛔ REQUISE, PAS OPTIONNELLE. Sans elle une remontée puiserait dans un lot
   * dont personne ne connaît la taille — « un paramètre de garde optionnel est
   * une garde désarmée ».
   */
  potReadyGrams: ReadonlyMap<string, number | null>;
  /** La marge d'identité du lot, en %. La MÊME que `POT_IDENTITY_MARGIN`. */
  potMarginPercent: number;
  /**
   * ⟳ 2026-09-23 · LOT 5 — L'OBJECTIF DE LA BOUCHE D'UN REPAS (`starchGoalOf`),
   * qui décide de l'ordre du rabotage (`shaveOrderFor`). `null` = mineur ou âge
   * inconnu: le plus gros item d'abord, comme avant.
   *
   * ⛔ REQUIS, PAS OPTIONNEL: « un paramètre de garde optionnel est une garde
   * désarmée ». Le compteur `shave_order` dit s'il rend quelque chose.
   */
  goalOf: (memberId: string) => StarchGoal | null;
}): PortionBoundaryResult {
  const counts = emptyPortionBoundaryCounts();
  /** ⟳ 2026-09-24 — les repas rabotés et leurs kcal. En mémoire seulement. */
  const shavedByMeal: ShavedMealKcal[] = [];

  // ── CE QUE LES CONTENANTS TIRENT DÉJÀ DE CHAQUE CASSEROLE ───────────────
  // Relevé sur TOUS les contenants avant de bouger quoi que ce soit: la marge
  // d'une casserole ne se calcule pas contenant par contenant, sinon deux
  // assiettes puiseraient la même marge.
  const drawn = new Map<string, number>();
  for (const box of args.boxes) {
    for (const item of box.items) {
      // ⟳ LOT 5 — les deux faits du rabotage, relus à l'exécution (voir
      // `items_missing_shave_facts`).
      const raw = item as { kcalPerG?: unknown; starch?: unknown };
      if (raw.kcalPerG === undefined || typeof raw.starch !== "boolean") {
        counts.items_missing_shave_facts += 1;
      }
      if (item.preparationId === null) continue;
      const g = Number(item.grams);
      if (!Number.isFinite(g) || g <= 0) continue;
      drawn.set(item.preparationId, (drawn.get(item.preparationId) ?? 0) + g);
    }
  }
  const headroomOf = (preparationId: string): number => {
    const ready = args.potReadyGrams.get(preparationId) ?? null;
    if (ready === null || !Number.isFinite(ready) || ready <= 0) return 0;
    const ceiling = ready * (1 + args.potMarginPercent / 100);
    return Math.max(0, Math.floor(ceiling - (drawn.get(preparationId) ?? 0)));
  };

  // ── LES REPAS: LES CONTENANTS D'UNE BOUCHE, REGROUPÉS PAR JOUR ET MOMENT ──
  // ⛔ L'ORDRE DE RENCONTRE FAIT L'ORDRE DES GROUPES, et à l'intérieur d'un
  // groupe l'ordre des contenants: ce module est déterministe, et le rabotage
  // départage les égalités « le plus à gauche gagne ».
  const meals = new Map<string, { meal: BoundedMeal; boxes: BoundedBox[] }>();
  for (const box of args.boxes) {
    counts.boxes += 1;
    // ⚠️ UN BAC N'EST PAS UNE ASSIETTE, et il se compte à part. Ses grammes sont
    // une quantité de RÉCIPIENT: les comparer à un plafond d'assiette ferait
    // rougir un bac correct.
    if (box.memberIds.length !== 1) {
      counts.tubs_not_judged += 1;
      continue;
    }
    const meal: BoundedMeal = {
      memberId: box.memberIds[0],
      day: box.day,
      slot: box.slot,
    };
    const key = `${meal.memberId}|${meal.day ?? ""}|${meal.slot ?? ""}`;
    const deja = meals.get(key);
    if (deja) deja.boxes.push(box);
    else meals.set(key, { meal, boxes: [box] });
  }

  for (const { meal, boxes } of meals.values()) {
    counts.meals += 1;
    if (boxes.length > 1) counts.multi_box_meals += 1;
    const bounds = args.boundsFor(meal);
    if (bounds === null) continue;
    counts.judged += 1;
    const member = counts.by_member[meal.memberId] ??
      (counts.by_member[meal.memberId] = { meals: 0, grams: 0, kcal: 0 });
    // ⛔ LES ITEMS DES DEUX COMPOSANTS, DANS UNE SEULE LISTE — et ce sont les
    // MÊMES objets, pas des copies: `applyDeltas` écrit les grammes en place,
    // donc dans les contenants du plan.
    const items: BoundedBoxItem[] = boxes.flatMap((b) => b.items);
    let total = 0;
    for (const item of items) {
      const g = Number(item.grams);
      if (Number.isFinite(g) && g > 0) total += g;
    }
    if (total <= 0) continue;
    if (total >= bounds.min && total <= bounds.max) {
      counts.already_in_bounds += 1;
      continue;
    }

    if (total > bounds.max) {
      // ⛔ L'ENTIER LE PLUS PROCHE **SOUS** LE PLAFOND. `ceil` et pas `round`:
      // retirer 0,5 g d'un dépassement de 0,5 g laisserait la portion PILE sur
      // la borne en flottant, donc parfois au-dessus au centième près.
      const excess = Math.ceil(total - bounds.max);
      const order = shaveOrderFor(args.goalOf(meal.memberId));
      const plan = planShave(items, excess, order);
      if (plan === null) {
        counts.still_over_max += 1;
        continue;
      }
      // ⟳ LOT 5 — L'ÉNERGIE RETIRÉE, lue AVANT d'écrire: `kcalPerG` × grammes
      // réellement retirés, item par item.
      let kcal = 0;
      for (const [index, delta] of plan) {
        const d = items[index].kcalPerG;
        if (d !== null && Number.isFinite(d) && d >= 0) kcal += -delta * d;
        else counts.grams_shaved_unpriced += -delta;
      }
      applyDeltas(items, plan, drawn);
      counts.shaved += 1;
      counts.grams_shaved += excess;
      counts.kcal_shaved += kcal;
      counts.shave_order[order] += 1;
      member.meals += 1;
      member.grams += excess;
      member.kcal += kcal;
      shavedByMeal.push({ memberId: meal.memberId, day: meal.day, slot: meal.slot, kcal });
      continue;
    }

    // ── SOUS LE PLANCHER ────────────────────────────────────────────────
    const missing = Math.ceil(bounds.min - total);
    const plan = planRaise(items, missing, headroomOf);
    if (plan === null) {
      counts.still_under_min += 1;
      // ⛔ NOMMER LA CAUSE. Un repas qui n'a AUCUN item de casserole ne pouvait
      // pas être remonté par principe; un repas qui en a et que la
      // disponibilité refuse est un autre fait, et c'est celui-là qui dit que
      // le lot est trop petit pour l'assiette qu'on promet.
      if (items.some((it) => it.preparationId !== null)) {
        counts.pot_headroom_blocked += 1;
      }
      continue;
    }
    applyDeltas(items, plan, drawn);
    counts.raised += 1;
    counts.grams_raised += missing;
  }
  return { ...counts, shavedByMeal };
}

/**
 * QUELS GRAMMES RETIRER, ET À QUI — `null` quand le compte n'y est pas.
 *
 * ⛔ UN ITEM À LA FOIS, JUSQU'À SON PLANCHER D'IDENTITÉ, DANS UN ORDRE FIXE.
 * Un gramme ne se répartit pas sur cinq items: ce serait des fractions,
 * c'est-à-dire très exactement ce que l'arrondi vient de supprimer.
 *
 * ⟳ 2026-09-23 · AUDIT DES DOSAGES, LOT 5 — L'ORDRE SUIT L'OBJECTIF
 * (`shaveOrderFor`). Mesuré: le féculent à part met le surplus d'énergie de la
 * grosse assiette dans le féculent, qui devient l'item le plus lourd; le
 * rabotage « le plus gros d'abord » le coupait donc en premier, et la prise de
 * Thomas disparaissait (−232 kcal/j sur e0325544) pendant que `day_kcal`
 * affichait 100 %.
 *   · `starch_first` (perte, maintien): le féculent d'abord, jusqu'à son
 *     plancher; puis le reste, le plus gros d'abord;
 *   · `least_dense_first` (prise): l'item le MOINS dense d'abord — le moins
 *     d'énergie perdue par gramme; une densité inconnue passe après les
 *     connues (on ne sait pas ce qu'elle coûte);
 *   · `largest_first` (`null`): la règle d'avant, le plus gros d'abord.
 *
 * ⛔ LE PLANCHER DE CHAQUE ITEM NE BOUGE PAS: `itemFloorGrams`, 70 % pour un
 * légume, 50 % pour le reste. L'ordre choisit QUI donne en premier, jamais
 * combien un item peut donner.
 *
 * ⚠️ DÉTERMINISTE À ÉGALITÉ: à clé égale, le plus gros item, puis le plus À
 * GAUCHE, gagne.
 */
function planShave(
  items: readonly BoundedBoxItem[],
  grams: number,
  order: ShaveOrder,
): Map<number, number> | null {
  const deltas = new Map<number, number>();
  let left = grams;
  for (const i of shaveRanking(items, order)) {
    if (left <= 0) break;
    const g = Number(items[i].grams);
    if (!Number.isFinite(g) || g <= MIN_ITEM_GRAMS) continue;
    // ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE PLANCHER EST CELUI DE L'IDENTITÉ, PAS 1 g.
    // ⛔ `itemFloorGrams` EST LA FONCTION DE `box_densify.ts`, IMPORTÉE. Les
    // deux modules déplacent des grammes dans les mêmes contenants; deux
    // barèmes auraient laissé l'un défaire ce que l'autre protège.
    // ⚠️ ET LE PLANCHER DE 1 g RESTE EN DESSOUS: un item minuscule (une pincée
    // de sel) ne se fait pas remonter par ce calcul.
    const plancher = Math.max(
      MIN_ITEM_GRAMS,
      itemFloorGrams(Math.floor(g), items[i].group),
    );
    const take = Math.min(left, Math.floor(g) - plancher);
    if (take <= 0) continue;
    deltas.set(i, -take);
    left -= take;
  }
  // ⛔ `null` ⇒ LE REPAS N'EST PAS TOUCHÉ, ET IL SE COMPTE (`still_over_max`).
  // C'est la sortie que le plan de bêta réclame: « si la recette ne tient pas
  // les contraintes sans perdre son identité, elle doit être recomposée, pas
  // déclarée correcte parce que les calories passent ».
  return left <= 0 ? deltas : null;
}

/**
 * LES INDEX DES ITEMS DANS L'ORDRE OÙ ILS DONNENT LEURS GRAMMES.
 *
 * Toujours sur la base de `rankedByGramsDesc` (le plus gros, puis le plus à
 * gauche); l'ordre de l'objectif ne fait que passer certains items devant.
 */
function shaveRanking(items: readonly BoundedBoxItem[], order: ShaveOrder): number[] {
  const byGrams = rankedByGramsDesc(items);
  if (order === "starch_first") {
    return [
      ...byGrams.filter((i) => items[i].starch === true),
      ...byGrams.filter((i) => items[i].starch !== true),
    ];
  }
  if (order === "least_dense_first") {
    const rank = new Map(byGrams.map((i, k) => [i, k]));
    const densityOf = (i: number): number | null => {
      const d = items[i].kcalPerG;
      return d !== null && Number.isFinite(d) && d >= 0 ? d : null;
    };
    const known = byGrams.filter((i) => densityOf(i) !== null);
    const unknown = byGrams.filter((i) => densityOf(i) === null);
    known.sort((a, b) =>
      ((densityOf(a) as number) - (densityOf(b) as number)) ||
      ((rank.get(a) as number) - (rank.get(b) as number))
    );
    return [...known, ...unknown];
  }
  return byGrams;
}

/**
 * QUELS GRAMMES AJOUTER, ET À QUI — `null` quand la casserole ne suit pas.
 *
 * ⛔ SEULS LES ITEMS QUI PUISENT DANS UNE CASSEROLE SE REMONTENT. Le frais d'un
 * plat est une ligne d'ingrédient : lui ajouter des grammes servirait un
 * aliment que la recette ne contient pas.
 */
function planRaise(
  items: readonly BoundedBoxItem[],
  grams: number,
  headroomOf: (preparationId: string) => number,
): Map<number, number> | null {
  const order = rankedByGramsDesc(items);
  const deltas = new Map<number, number>();
  /** La marge déjà consommée par CE contenant, casserole par casserole. */
  const used = new Map<string, number>();
  let left = grams;
  for (const i of order) {
    if (left <= 0) break;
    const prep = items[i].preparationId;
    if (prep === null) continue;
    const free = headroomOf(prep) - (used.get(prep) ?? 0);
    if (free <= 0) continue;
    const give = Math.min(left, free);
    deltas.set(i, give);
    used.set(prep, (used.get(prep) ?? 0) + give);
    left -= give;
  }
  return left <= 0 ? deltas : null;
}

/** Les index des items, du plus lourd au plus léger, à égalité par l'ordre. */
function rankedByGramsDesc(items: readonly BoundedBoxItem[]): number[] {
  return items
    .map((item, index) => ({ index, grams: Number(item.grams) }))
    .filter((row) => Number.isFinite(row.grams) && row.grams > 0)
    .sort((a, b) => (b.grams - a.grams) || (a.index - b.index))
    .map((row) => row.index);
}

/**
 * ÉCRIT LES GRAMMES, ET MET À JOUR CE QUE LES CASSEROLES DOIVENT.
 *
 * ⚠️ `Math.round` SUR LA VALEUR D'ORIGINE: un contenant écrit par le MODÈLE
 * peut porter un flottant. Une fois qu'on touche cet item, il devient entier —
 * c'est le barème du produit, et laisser `630,4 − 1` derrière écrirait
 * « 629,4 g » sur une ligne qu'on vient de corriger.
 */
function applyDeltas(
  items: BoundedBoxItem[],
  deltas: ReadonlyMap<number, number>,
  drawn: Map<string, number>,
): void {
  for (const [index, delta] of deltas) {
    const item = items[index];
    const before = Number(item.grams);
    const after = Math.round(before) + delta;
    item.grams = after;
    if (item.preparationId !== null) {
      drawn.set(
        item.preparationId,
        (drawn.get(item.preparationId) ?? 0) - before + after,
      );
    }
  }
}
