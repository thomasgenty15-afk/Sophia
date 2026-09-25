/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT D'UNE CASE — une personne, une DATE, un moment
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL FERME, MESURÉ LE 2026-09-11 (lot 0, § 4 et § 7 du rapport).
 * La même case recevait DEUX budgets, et le facteur est **2,86** :
 *
 *   · `PERTE / 2026-09-11 / dinner` — **858,90 kcal** pour le dimensionnement
 *     (`measureDish`, `wholeSlots` = le rythme entier) contre **2 454,00** pour
 *     le couloir envoyé au modèle (`requiredDensityFor`, `wholeSlots` = les
 *     seuls moments de ce jour-là) ;
 *   · `GAIN / 2026-09-11 / dinner` — **1 019,20** contre **2 912,00**.
 *
 * ⛔ ET LE VENDREDI PARTIEL IMPOSAIT SON COULOIR AUX AUTRES JOURS. Les couloirs
 * étaient repliés dans une `Map<slot, …>` sans clé de date : le dîner d'un jour
 * à une seule case écrasait les dîners des jours complets. Mesuré : les dîners
 * de samedi et dimanche méritaient **[123–250] visée 135** (PERTE) et
 * **[146–250] visée 160** (GAIN) ; ils ont reçu **[250–250] `above_askable_cap`**,
 * c'est-à-dire un couloir déclaré impossible. Les densités servies — 244, 241,
 * 247, 228 — sont collées au plafond de ce couloir-là.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ET ELLE TIENT EN UNE PHRASE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     Le RYTHME ALIMENTAIRE fait le dénominateur ; la FENÊTRE DEMANDÉE fait
 *     la somme. Ce sont deux listes, et elles ne se confondent jamais.
 *
 * ⛔ UN REPAS DÉJÀ PASSÉ OU MANGÉ AILLEURS NE TRANSFÈRE PAS SON ÉNERGIE au
 * dîner qu'on compose. C'est la décision de périmètre n° 4 du chantier :
 * « le statut *journée partielle* ne signifie pas *manger toute la journée sur
 * les créneaux restants* ». `anchorFactorFor` (`mouth_anchor.ts`) énonçait
 * déjà cette règle et son repli — « sans ce repli, une bouche qui n'a rien
 * déclaré et dont le plan ne compose QUE le dîner voit sa journée entière
 * ramenée sur ce seul dîner : on demande 3 900 kcal à une assiette ». Ce
 * module la rend vraie pour le couloir de densité aussi.
 *
 * ⚠️ ET UN VRAI RYTHME À UN SEUL REPAS GARDE SA JOURNÉE ENTIÈRE. C'est la
 * moitié qui distingue les deux cas : quelqu'un qui a DÉCLARÉ ne manger que le
 * soir reçoit `rhythmSlots = ["dinner"]`, donc la journée entière — et
 * quelqu'un dont on ne compose que le soir reçoit `rhythmSlots` = son rythme,
 * donc sa part de dîner.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * UN SEUL OBJET, TROIS LECTEURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le contrat est construit **avant le prompt**, puis lu par le **prompt**
 * (`requiredDensityFromContracts` → `densityFragment`), par le
 * **dimensionnement** (`composeKcal`, `bounds`) et par les **contrôles**. Trois
 * lectures d'un seul objet ne peuvent pas diverger ; trois arithmétiques
 * divergent au premier lot.
 *
 * ⛔ RIEN N'EST RECALCULÉ ICI. `dayTargetFor`, `slotPlanTargets`,
 * `plateBoundsFor`, `densityCorridorFor` et `relaxDayForCorridors` sont
 * appelées entières, une fois par journée ou par case. Une seconde écriture de
 * la part d'un moment est exactement ce que ce module existe pour supprimer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LE PLAT N'EST PLUS TOUT LE REPAS (chantier « assiettes
 * normales », flux B)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT MESURÉ (`docs/keel/AUDIT-DOSAGES-2026-09-23.md`): un seul plat
 * portait tout le repas. Le déjeuner de Christèle et de Fabrice faisait 40 %
 * de leur journée, et le plat de Thomas arrivait à 700 g par construction.
 *
 * LA RÈGLE, DANS L'ORDRE OÙ LE CONSTRUCTEUR L'APPLIQUE:
 *   ① la part du moment (`slotPlanTargets`), apports fixes retranchés;
 *   ② pour un déjeuner ou un dîner qui a une entrée `ContractDay.sides`,
 *      `sideBudgetFor` coupe cette part en À-CÔTÉ + PLAT. Le plat est plafonné
 *      à ce que son assiette porte à la densité de table
 *      (`plateBoundsFor(…).max × SHARED_TABLE_MAX_ASK_PER_100G / 100`, soit
 *      550 × 1,15 = 632,5 kcal chez l'adulte); l'à-côté grossit avant que le
 *      plat ne dépasse, jusqu'à sa part maximale;
 *      ⟳ 2026-09-24 — ce plafond est celui de la PERSONNE quand il est plus
 *      bas (`personalPlateBoundsFor`, 25 % de son entretien): 480 × 1,15 =
 *      552 kcal pour un entretien de 1 920;
 *   ③ ce qui dépasse encore est le DÉBORDEMENT: il part aux COLLATIONS de la
 *      même personne (`relaxSharedForTable`, receveurs `snacks`);
 *   ④ s'il en reste, les bornes de CE moment passent au plafond de repli
 *      (`hardCeilingBoundsFor`, 700 g) et le contrat dit
 *      `overflow: "hard_ceiling"`. L'énergie de la journée reste un contrat.
 *
 * ⛔ `composeKcal` EST LE PLAT SEUL. L'à-côté est `sideKcal`, et l'invariant
 * est `Σ composeKcal + Σ sideKcal = coveredBudgetKcal`. Un lecteur qui
 * additionnerait `composeKcal` pour obtenir le repas perdrait l'à-côté.
 *
 * ⚠️ `sides: null` REND LE CONTRAT D'AVANT: aucun à-côté, la relâche de table
 * avec ses receveurs d'avant (`own_slots`), aucun repli. C'est ce qui rend le
 * champ ajoutable sans déplacer un plan qui ne le porte pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import {
  type DensityCorridor,
  type DensityIncompatibility,
  densityCorridorFor,
  type DayTargetGapClosed,
  dayTargetFor,
  hardCeilingBoundsFor,
  MAX_ASKABLE_DENSITY_PER_100G,
  mergeCorridors,
  type PlateBounds,
  type PersonalPlateBounds,
  personalPlateBoundsFor,
  plateBandOf,
  plateBoundsFor,
  plateSlotClassOf,
  relaxDayForCorridors,
  type RequiredDensity,
  type SlotDensity,
  slotOrderOf,
} from "./portion_sizing.ts";
import {
  type AnchorMouth,
  type AnchorReason,
  HOUSE_DEFAULT_SLOTS,
  maintenanceKcalOf,
  slotPlanTargets,
  wholeDaySlots,
} from "./mouth_anchor.ts";
import type { CountingStance } from "./energy_gate.ts";
import { sideBudgetFor } from "./side_course_budget.ts";
import {
  SIDE_COURSE_SLOTS,
  type SideCourseAlloc,
  type SideCourseBudget,
  type SideCourseSlot,
  type SideCourseSlotInput,
} from "./side_courses_types.ts";

/**
 * POURQUOI UNE CASE N'A PAS DE NOMBRE. ⛔ Chaque motif est une ABSTENTION
 * NOMMÉE, jamais un zéro : « une valeur absente reste inconnue, jamais zéro ».
 *
 *   `computed`        le cas nominal ;
 *   `fixed_covered`   l'apport fixe déclaré couvre déjà toute la part de cette
 *                     case. ⚠️ CE N'EST PAS UNE CASE OUBLIÉE : elle a zéro
 *                     énergie à composer, et c'est un fait écrit par quelqu'un ;
 *   `no_day_target`   aucune cible de journée (voir `reason` de l'ancre) ;
 *   `no_slot_share`   le moment n'a aucun poids dans le rythme — jeton hors de
 *                     la liste fermée ;
 *   `no_plate_bounds` aucune borne d'assiette lisible pour ce corps ;
 *   `density_infeasible` ⟳ 2026-09-14 · BÊTA 1B ③ — LA PART NE TIENT PAS DANS
 *                     L'ASSIETTE, et la redistribution de la journée n'y a rien
 *                     changé. Voir le pavé ci-dessous.
 */
export const SLOT_CONTRACT_STATUSES = [
  "computed",
  "fixed_covered",
  "no_day_target",
  "no_slot_share",
  "no_plate_bounds",
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1B ③ — « CALCULÉ » ET « CALCULÉ MAIS IMPOSSIBLE »
   *                ÉTAIENT LE MÊME MOT
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT, C'EST LE POINT ⑨ DE LA CLÔTURE DU 2026-09-14, CHIFFRÉ. Nils
   * porte 4 099 kcal sur deux repas sous un plafond de masse de 700 g: il
   * faudrait 312 kcal/100 g. `densityCorridorFor` calcule bien ce besoin, pose
   * `incompatible: "above_askable_cap"` — puis RABAT les deux extrémités du
   * couloir sur `MAX_ASKABLE_DENSITY_PER_100G`. Le contrat sortait `computed`,
   * le prompt emportait le point unique 250, le produit servait 312 et la
   * garde écrivait `conforme`. Personne, à aucun moment, ne disait que la
   * demande était hors de portée.
   *
   * ⛔ ET LE PLAFOND N'EST PAS RELEVÉ POUR AUTANT. Le plan de bêta l'interdit
   * en toutes lettres: « ne pas le relever pour faire passer Nils ; si la
   * demande dépasse la capacité acceptée du produit, elle doit être traitée
   * AVANT l'appel fournisseur ». Ce statut est ce traitement: il rend la
   * demande LISIBLE là où elle se décide, au lieu de la déguiser en consigne.
   *
   * ⚠️ IL EST POSÉ APRÈS LA RELÂCHE, JAMAIS AVANT. `relaxDayForCorridors`
   * déplace ce qu'elle peut entre les cases couvertes; ce statut ne décrit que
   * ce qui RESTE impossible une fois ce déplacement fait.
   */
  "density_infeasible",
  /**
   * ⟳ 2026-09-25 — UN MOMENT OÙ LA PERSONNE A DÉCLARÉ NE RIEN MANGER.
   *
   * « Que du café » écrit dans sa fiche : le modèle rend un plat à son nom que
   * le référentiel mesure à ~0 kcal (`declared_empty_own_dish.ts`). Ce moment
   * n'attend ni boîte ni portion, et sa part de la journée est portée par ses
   * autres moments (`ContractDay.emptySlots`). `composeKcal` vaut 0.
   */
  "declared_empty",
] as const;
export type SlotContractStatus = (typeof SLOT_CONTRACT_STATUSES)[number];

/**
 * ⟳ 2026-09-23 — OÙ EST PARTI CE QUE LE PLAT NE POUVAIT PAS PORTER.
 *
 *   `none`          rien ne dépassait (ou le jour n'a pas d'entrée `sides`);
 *   `snacks`        le débordement est parti, en entier, aux collations de la
 *                   même personne;
 *   `hard_ceiling`  il en restait: les bornes de ce moment sont passées au
 *                   plafond de repli (`hardCeilingBoundsFor`, 700 g chez
 *                   l'adulte). Compté dans `overflow_to_dish`.
 *
 * ⚠️ UN MOMENT PEUT AVOIR ENVOYÉ UNE PARTIE AUX COLLATIONS ET ÊTRE QUAND MÊME
 * `hard_ceiling`: c'est le reste qui décide, pas ce qui a bougé.
 *
 * ⚠️ `hard_ceiling` DIT OÙ EST L'ÉNERGIE, PAS QUE L'ASSIETTE A GRANDI. Seul le
 * repas adulte a un plafond de repli (`PLATE_HARD_CEILING_G`); chez un mineur,
 * `hardCeilingBoundsFor` rend les bornes de sa table, et le reste est porté
 * par un plat plus dense dans la même assiette. Le moment est compté quand
 * même: le débordement est resté dans le plat.
 */
export const SLOT_OVERFLOWS = ["none", "snacks", "hard_ceiling"] as const;
export type SlotOverflow = (typeof SLOT_OVERFLOWS)[number];

/**
 * CE QU'UNE JOURNÉE DEMANDE AU PLAN, POUR UNE BOUCHE.
 *
 * ⛔ `rhythmSlots` N'EST PAS `coveredSlots`, ET C'EST TOUT LE LOT. Le premier
 * est le rythme alimentaire de la personne ce jour-là — ce qu'elle mange,
 * qu'on le compose ou non. Le second est ce que le plan couvre. Les confondre
 * donne la journée entière au dernier repas restant.
 */
export interface ContractDay {
  /** Le jeton de jour du moteur (`mon`, `tue`, …). */
  dayToken: string;
  /** La date LOCALE (`2026-09-11`). ⛔ C'est elle qui fait la clé du contrat. */
  date: string;
  /** Les cases que le plan couvre ce jour-là. */
  coveredSlots: readonly string[];
  /**
   * Les moments que rien ne peut déplacer : repas dehors, case gelée.
   * ⚠️ Les moments qu'un apport fixe couvre entièrement sont ajoutés d'office —
   * un shaker avalé ne se déplace pas.
   */
  lockedSlots: readonly string[];
  /** Moment → kcal déjà avalées ce jour-là (`slot_fixed_kcal.ts`). */
  fixedKcalBySlot: ReadonlyMap<string, number> | null;
  /**
   * ⟳ 2026-09-21 — LES CASES OÙ CETTE BOUCHE MANGE AVEC D'AUTRES. Absent =
   * l'appelant ne sait pas (lane solo) et la relâche de table ne joue pas;
   * `counters.shared_slots` dit combien de cases l'ont portée.
   */
  sharedSlots?: readonly string[];
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS DE CE JOUR, par moment (déjeuner, dîner).
   *
   * ⛔ REQUIS, jamais `?`. C'est la casse de compilation qui recense les
   * appelants: un défaut à « pas d'à-côté » aurait laissé le chantier construit
   * et désarmé chez tous ceux qu'on a oubliés — le plat porterait de nouveau
   * tout le repas, sans que rien ne le dise.
   *
   *   `null`          le contrat d'avant, à l'octet: aucun à-côté, la relâche
   *                   de table avec ses receveurs d'avant, aucun repli;
   *   une `Map`       les à-côtés s'appliquent, et la relâche de table ne
   *                   donne plus qu'aux collations. Un moment ABSENT de la
   *                   `Map` n'a pas d'à-côté; un moment présent avec
   *                   `refused: true` n'en a pas non plus, mais son plat entre
   *                   dans l'ensemble qui déborde (décision n° 1: « le surplus
   *                   va d'abord à ses collations, sinon le plat monte jusqu'à
   *                   700 g »).
   *
   * L'entrée vient du planificateur des à-côtés (flux A, `planSideCourses`).
   */
  sides: ReadonlyMap<SideCourseSlot, SideCourseSlotInput> | null;
  /**
   * ⟳ 2026-09-25 — LES MOMENTS OÙ CETTE PERSONNE A DÉCLARÉ NE RIEN MANGER CE
   * JOUR-LÀ (« que du café », mesuré ~0 kcal, `declared_empty_own_dish.ts`).
   *
   * Ils sortent du rythme ET de la couverture de la journée : la répartition
   * existante porte alors la journée sur les autres moments — exactement comme
   * si le moment n'avait pas été coché. Chacun reçoit un contrat
   * `declared_empty` à 0 kcal.
   *
   * ⛔ REQUIS, jamais `?`, même règle que `sides` : `[]` = le contrat d'avant, à
   * l'octet.
   */
  emptySlots: readonly string[];
}

/**
 * LE CONTRAT D'UNE CASE. ⛔ Sa clé est `memberId + date locale + slot`, et les
 * trois sont portés en clair : une clé reconstruite à la lecture est une clé
 * qui se reconstruit différemment chez le deuxième lecteur.
 */
export interface SlotNutritionContract {
  memberId: string;
  /** La date locale. Clé. */
  date: string;
  /** Le jeton de jour du moteur, pour les lecteurs qui parlent cette langue. */
  dayToken: string;
  slot: string;

  // ── LE RYTHME ─────────────────────────────────────────────────────────
  /** Le rythme alimentaire COMPLET de cette journée. Fait le DÉNOMINATEUR. */
  rhythmSlots: readonly string[];
  /** Les cases que le plan couvre ce jour-là. Fait la SOMME. */
  coveredSlots: readonly string[];
  /** Les cases que la redistribution n'a pas le droit de toucher. */
  lockedSlots: readonly string[];

  // ── L'ÉNERGIE ─────────────────────────────────────────────────────────
  /** La cible de la journée entière (`dayTargetFor`). */
  dayTargetKcal: number | null;
  /**
   * La somme des cases COUVERTES, avant arrondi. ⛔ C'est à elle qu'on compare
   * une journée partielle, jamais à `dayTargetKcal` : un plan partiel ne doit
   * pas la journée entière.
   */
  coveredBudgetKcal: number | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · ÉTAPE C1 — LE MÊME BUDGET COUVERT, **AVANT** LE RETRAIT
   * DES APPORTS FIXES.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ IL EXISTE POUR EMPÊCHER UN DOUBLE COMPTAGE, ET LE PLAN LE NOMME :
   * « calculer la part protéique couverte **avant** la soustraction des apports
   * fixes, puis retirer leurs protéines **une fois** ; ne pas réduire
   * simultanément le besoin par un ratio énergétique déjà net **et** par une
   * deuxième soustraction protéique ».
   *
   * `coveredBudgetKcal` est NET : le shaker en est déjà sorti. L'utiliser comme
   * numérateur de la fraction `couvert / journée` fait donc DÉJÀ baisser le
   * plancher protéique — et lui retrancher ensuite les protéines du shaker le
   * ferait baisser une seconde fois, pour le même pot. La fraction se calcule
   * sur CE nombre-ci ; la soustraction protéique se fait une fois, après.
   *
   * ⚠️ SANS APPORT FIXE, LES DEUX SONT ÉGAUX, à l'octet. C'est la propriété qui
   * rend ce champ ajoutable sans changer un seul plan existant.
   */
  coveredBudgetGrossKcal: number | null;
  /** Ce que les apports fixes retranchent de CETTE case. Jamais négatif. */
  fixedKcal: number;
  /** La part de la journée qui tombe sur ce moment, AVANT retrait des apports fixes. */
  mealTargetKcal: number | null;
  /**
   * Ce qu'il reste À COMPOSER dans cette case. `0` = déjà couvert.
   *
   * ⟳ 2026-09-23 — ⛔ C'EST LE PLAT SEUL. Quand le jour porte des à-côtés, la
   * part du moment est coupée en `composeKcal` (le plat) et `sideKcal`
   * (l'à-côté, hors de l'assiette). Le repas entier est leur somme.
   */
  composeKcal: number | null;
  /**
   * ⟳ 2026-09-23 — L'ÉNERGIE DES À-CÔTÉS DE CETTE CASE (base + croissance).
   * `0` = pas d'à-côté ici (moment hors de `sides`, refus, `sides: null`,
   * abstention). ⛔ JAMAIS COMPTÉE DANS `composeKcal`.
   */
  sideKcal: number;
  /** Les à-côtés retenus, type par type, avec leurs kcal et leur estimation de protéines. */
  sideCourses: readonly SideCourseAlloc[];
  /** La part de `sideKcal` qui vient de la CROISSANCE (le plat aurait dépassé). */
  sideGrowthKcal: number;
  /** La personne refuse tous les à-côtés à ce moment: `sideKcal` vaut 0 par décision. */
  sideRefused: boolean;
  /** Où est parti ce que le plat ne pouvait pas porter. Voir `SLOT_OVERFLOWS`. */
  overflow: SlotOverflow;
  /**
   * ⟳ 2026-09-11 · LOT B — CE QUE LA REDISTRIBUTION A DÉPLACÉ SUR CETTE CASE,
   * signé, en kcal. `0` = la part n'a pas bougé.
   *
   * ⛔ ELLE RESTE DANS LA MÊME PERSONNE ET LA MÊME JOURNÉE, et **seulement
   * entre les cases couvertes** : déplacer de l'énergie vers un moment qu'on ne
   * compose pas la perdrait, et en prendre à un moment déjà mangé serait très
   * exactement le transfert que ce module interdit.
   */
  redistributedKcal: number;

  // ── LA MASSE ET LA DENSITÉ ────────────────────────────────────────────
  /** Grammes min / préférés / max, et la source des bornes. `null` = abstention. */
  bounds: PlateBounds | null;
  /** Densité min / préférée / max, l'incompatibilité et son motif. */
  corridor: DensityCorridor | null;

  // ── L'ÉTAT ────────────────────────────────────────────────────────────
  status: SlotContractStatus;
  /** Le motif de l'ancre quand `status === "no_day_target"`. Sinon `null`. */
  abstainReason: AnchorReason | null;
  /** Le moment est marqué « léger » par cette personne. */
  light: boolean;
}

export interface SlotContractCounters {
  /** Les cases examinées, tous jours confondus. */
  slots: number;
  /** Celles dont la part est entièrement couverte par un apport fixe. */
  fixed_covered: number;
  /** Celles dont le besoin a été raboté par `MAX_ASKABLE_DENSITY_PER_100G`. */
  capped: number;
  /**
   * ⟳ 2026-09-14 · BÊTA 1B ③ — CELLES DONT LA PART NE TIENT PAS DANS
   * L'ASSIETTE, la relâche faite. Voir le statut `density_infeasible`.
   *
   * ⚠️ CE N'EST PAS `capped`. Une case peut être rabotée par le plafond sans
   * être impossible (le besoin le frôle); celle-ci le DÉPASSE. Les confondre
   * ferait refuser des demandes tenables ou en laisser passer d'intenables.
   */
  density_infeasible: number;
  /** Les journées dont l'énergie a été déplacée pour rendre un couloir tenable. */
  relaxed_days: number;
  /** Pourquoi une journée n'a pas pu être relâchée. */
  relax_refused: Record<string, number>;
  /** ⟳ 2026-09-21 — la relâche de TABLE (`relaxSharedForTable`). */
  shared_slots: number;
  shared_relaxed_days: number;
  shared_moved_kcal: number;
  shared_relax_refused: Record<string, number>;
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS ET LE DÉBORDEMENT. Tous comptés à zéro quand
   * rien ne s'est produit: un compteur absent et un compteur à zéro ne disent
   * pas la même chose.
   *
   *   `side_slots`              les cases qui avaient une entrée `sides`, refus
   *                             compris;
   *   `side_refused_slots`      celles où la personne refuse tout;
   *   `side_base_kcal`          Σ des calories de BASE servies en à-côté
   *                             (arrondi par case);
   *   `side_grown_kcal`         Σ de la CROISSANCE (arrondi par case);
   *   `side_capped`             les cases où la part maximale de l'à-côté a
   *                             arrêté quelque chose (`SideCourseBudget.capped`);
   *   `overflow_to_snacks_kcal` ce que la relâche a envoyé aux collations, en
   *                             mode `snacks` seulement — il reste à 0 sur un
   *                             jour `sides: null`, où `shared_moved_kcal`
   *                             compte la relâche d'avant;
   *   `overflow_to_dish`        les cases dont le débordement est resté dans
   *                             le plat (`overflow: "hard_ceiling"`): bornes au
   *                             plafond de repli chez l'adulte, bornes de la
   *                             table chez un mineur.
   */
  side_slots: number;
  side_refused_slots: number;
  side_base_kcal: number;
  side_grown_kcal: number;
  side_capped: number;
  overflow_to_snacks_kcal: number;
  overflow_to_dish: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE MODULE NE FAIT PAS : REBASER APRÈS LE MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le contrat est capturé AVANT le modèle, sur la grille. Si le modèle compose
 * un moment que la grille ne portait pas, le rythme de cette journée grandit —
 * donc le dénominateur, donc TOUTES ses cases. Deux sorties étaient possibles :
 * refaire la journée (et le contrat envoyé au prompt cesse d'être celui que le
 * dimensionnement consomme), ou garder le contrat et NOMMER la case orpheline.
 *
 * ⛔ ON GARDE LE CONTRAT. « Le contrat capturé avant le modèle est égal à celui
 * consommé par le dimensionnement et par le verdict » est un test de sortie du
 * chantier ; un rebasement le rendrait faux sur toute journée où le modèle
 * déborde. La case sans contrat est dimensionnée par la MÊME règle de rythme
 * (`wholeDaySlots`) et comptée dans `contract_missing`
 * (`generate-household-meal-v1`, journal `portion_sizing`). Elle doit rester à
 * zéro : au-dessus, c'est le prompt qu'il faut resserrer, pas le contrat qu'il
 * faut refaire.
 */

/**
 * ⟳ 2026-09-25 — LA FORME DES ENTRÉES DE `slotContractsFor`, nommée pour
 * pouvoir la garder (`SlotContractSet.input`). Les commentaires de chaque champ
 * vivent sur la signature de la fonction, qui reste la référence.
 */
export interface SlotContractsInput {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  rhythmSlots: readonly string[];
  days: readonly ContractDay[];
  lightSlots: readonly string[];
  ageYears: number | null;
}

export interface SlotContractSet {
  memberId: string;
  /**
   * ⟳ 2026-09-25 — LES ENTRÉES EXACTES DE CE CALCUL, pour le refaire à
   * l'identique quand un moment se révèle « déclaré vide » après le modèle
   * (`ContractDay.emptySlots`, boucle de finition du générateur de foyer).
   * `null` sur un jeu RECOLLÉ (`mergeSlotContractSets`): plusieurs calculs
   * n'ont pas une entrée unique, et on ne les refait pas.
   */
  input: SlotContractsInput | null;
  contracts: readonly SlotNutritionContract[];
  /** `memberId|date|slot` → le contrat. La seule clé, et elle est datée. */
  byKey: ReadonlyMap<string, SlotNutritionContract>;
  dayTargetKcal: number | null;
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
  counters: SlotContractCounters;
}

/** ⛔ LA CLÉ S'ÉCRIT ICI ET NULLE PART AILLEURS. */
export function contractKey(
  memberId: string,
  date: string,
  slot: string,
): string {
  return `${memberId}|${date}|${slot}`;
}

function emptyCounters(): SlotContractCounters {
  return {
    slots: 0,
    fixed_covered: 0,
    capped: 0,
    density_infeasible: 0,
    relaxed_days: 0,
    relax_refused: {},
    shared_slots: 0,
    shared_relaxed_days: 0,
    shared_moved_kcal: 0,
    shared_relax_refused: {},
    side_slots: 0,
    side_refused_slots: 0,
    side_base_kcal: 0,
    side_grown_kcal: 0,
    side_capped: 0,
    overflow_to_snacks_kcal: 0,
    overflow_to_dish: 0,
  };
}

/** ⟳ 2026-09-23 — les champs d'à-côté d'une case qui n'en a pas. */
const NO_SIDE = Object.freeze({
  sideKcal: 0,
  sideCourses: Object.freeze([]) as readonly SideCourseAlloc[],
  sideGrowthKcal: 0,
  sideRefused: false,
  overflow: "none" as SlotOverflow,
});

/**
 * ⟳ 2026-09-23 — L'ENTRÉE D'À-CÔTÉ D'UN MOMENT, ou `undefined`.
 * ⛔ Seuls le déjeuner et le dîner en portent (`SIDE_COURSE_SLOTS`): un
 * petit-déjeuner ou une collation n'est jamais lu dans la `Map`, même si un
 * appelant y avait glissé une clé par un transtypage.
 */
function sideInputOf(
  sides: ReadonlyMap<SideCourseSlot, SideCourseSlotInput>,
  slot: string,
): SideCourseSlotInput | undefined {
  const s = SIDE_COURSE_SLOTS.find((x) => x === slot);
  return s === undefined ? undefined : sides.get(s);
}

/**
 * ⟳ 2026-09-21 — LA DENSITÉ LA PLUS HAUTE QU'UN PLAT PARTAGÉ PEUT SE VOIR
 * DEMANDER, en kcal pour 100 g servis.
 *
 * ⛔ LE DÉFAUT, AVEC SON CHIFFRE (plans `836afa60` et `60c457cd`, 3 bouches):
 * un homme en prise de masse à 1 129 kcal au déjeuner, dans une assiette de
 * 700 g, demandait à la case 161 kcal pour 100 g. Le plat est PARTAGÉ et la
 * consigne dit de viser la densité la plus haute de la table: le modèle y
 * arrivait avec 30 ml d'huile et 85 g de parmesan par part (1,4 litre d'huile
 * sur la liste), puis, l'huile bornée, avec 300 g de bœuf par part. La table
 * entière payait l'assiette d'un seul, et une femme en maintien recevait
 * 99 g de protéines à son déjeuner.
 *
 * Le 2026-09-21, 140 valait « un plat complet ordinaire — un féculent, une
 * protéine, un filet de gras, des légumes — au plus dense qu'il reste un
 * plat ». Au-dessus, ce n'est plus une recette, c'est de l'huile ou de la
 * viande. (Ramené à 115 le 2026-09-23, voir plus bas.)
 *
 * ⚠️ CE N'EST PAS UN PLAFOND D'ASSIETTE (`PLATE_MASS_BOUNDS_G` ne se règle pas ici)
 * ni un plafond de demande (`MAX_ASKABLE_DENSITY_PER_100G` reste 250 pour
 * une case où l'on mange seul). C'est la part de l'énergie d'une case
 * partagée qui DÉMÉNAGE vers les cases où la même bouche mange seule — ses
 * collations — au lieu de densifier la casserole de tout le monde.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — 140 → 115, ET CE NOMBRE DÉCIDE TROIS CHOSES À LA FOIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 115 = `TEMPLATE_DISH_KCAL_PER_100G` (125, la part du gabarit de recette)
 * ÷ 1,10, arrondi à 5 — dix pour cent de marge contre l'écart du modèle. Un
 * plat plein d'adulte pèse donc 550 g × 1,15 = **632,5 kcal**, et ce seul
 * nombre décide:
 *   · QUAND L'À-CÔTÉ GROSSIT (`sideBudgetFor`, `dishCapKcal`);
 *   · LE PLANCHER DE DENSITÉ D'UNE TABLE (une case partagée ne se demande
 *     jamais au-dessus);
 *   · QUAND LE SURPLUS PART AUX COLLATIONS (`relaxSharedForTable`).
 *
 * ⛔ 140 N'EST PLUS UN PLAT ORDINAIRE depuis que l'assiette vise la part du
 * gabarit: à 140, le plat de Thomas restait à 700 g × 1,40 = 980 kcal, et la
 * recette commune restait écrite pour le plus gros mangeur (audit du
 * 2026-09-23, lot 3c).
 */
export const SHARED_TABLE_MAX_ASK_PER_100G = 115;

/**
 * ⟳ 2026-09-23 — QUI PEUT RECEVOIR LE SURPLUS D'UNE CASE QUI DÉBORDE.
 *
 *   `own_slots`  la règle d'avant: toute case où la bouche mange seule, non
 *                figée, non légère — un petit-déjeuner solitaire compris.
 *                C'est la règle d'un jour `ContractDay.sides: null`;
 *   `snacks`     les COLLATIONS seulement (`plateSlotClassOf(slot) ===
 *                "snack"`). Un petit-déjeuner ne reçoit plus rien: son
 *                assiette est bornée à 550 g comme les autres, et la décision
 *                n° 1 du propriétaire nomme les collations, et elles seules.
 *
 * ⛔ REQUIS, jamais `?`: un défaut ferait de l'une des deux règles la réponse
 * silencieuse de l'autre chemin.
 */
export const TABLE_RELAX_RECEIVERS = ["own_slots", "snacks"] as const;
export type TableRelaxReceivers = (typeof TABLE_RELAX_RECEIVERS)[number];

/**
 * LA RELÂCHE DE TABLE — PURE: no I/O, no clock, no randomness.
 *
 * Pour chaque case QUI DÉBORDE dont la cible dépasse ce que son assiette porte à
 * `SHARED_TABLE_MAX_ASK_PER_100G`, le surplus part vers les cases RECEVEUSES
 * de la journée (`receivers`), au prorata de leur cible et dans la limite de
 * ce que leur assiette accepte (`MAX_ASKABLE_DENSITY_PER_100G`). La somme est
 * conservée au centième près. Sans receveur, rien ne bouge et le refus est
 * nommé: la casserole reste dense, et ça se compte.
 *
 * ⟳ 2026-09-23 — « QUI DÉBORDE » N'EST PLUS « PARTAGÉE ». `overflowSlots`
 * est ce que l'appelant nomme: les cases partagées, et, dès qu'un jour porte
 * des à-côtés, tout déjeuner et tout dîner qui a une entrée `sides` — refus
 * compris, même mangé seul. ⚠️ Le refus `no_own_slot` garde son nom: en mode
 * `snacks`, il veut dire « aucune collation pour recevoir ».
 */
export function relaxSharedForTable(args: {
  targets: ReadonlyMap<string, number>;
  maxGramsBySlot: ReadonlyMap<string, number>;
  /** ⟳ 2026-09-23 — les cases qui déversent leur surplus (l'ancien `sharedSlots`). */
  overflowSlots: readonly string[];
  lockedSlots: readonly string[];
  lightSlots: readonly string[];
  /** ⟳ 2026-09-23 — voir `TABLE_RELAX_RECEIVERS`. */
  receivers: TableRelaxReceivers;
}): {
  targets: ReadonlyMap<string, number>;
  moved: number;
  refusal: "no_shared_surplus" | "no_own_slot" | "no_room" | null;
} {
  const overflowing = new Set(args.overflowSlots);
  const locked = new Set(args.lockedSlots);
  const light = new Set(args.lightSlots);
  const out = new Map(args.targets);
  let surplus = 0;
  const trimmed: { slot: string; cap: number }[] = [];
  for (const [slot, t] of args.targets) {
    if (!overflowing.has(slot) || locked.has(slot)) continue;
    const g = args.maxGramsBySlot.get(slot);
    if (g === undefined || !(g > 0)) continue;
    const cap = (g * SHARED_TABLE_MAX_ASK_PER_100G) / 100;
    if (t > cap + 0.01) {
      trimmed.push({ slot, cap });
      surplus += t - cap;
    }
  }
  if (surplus <= 0) {
    return { targets: args.targets, moved: 0, refusal: "no_shared_surplus" };
  }
  const own = [...args.targets]
    .filter(([slot]) =>
      !overflowing.has(slot) && !locked.has(slot) && !light.has(slot) &&
      (args.maxGramsBySlot.get(slot) ?? 0) > 0 &&
      // ⟳ 2026-09-23 — en mode `snacks`, un repas ne reçoit jamais.
      (args.receivers === "own_slots" || plateSlotClassOf(slot) === "snack")
    )
    .map(([slot, t]) => ({
      slot,
      target: t,
      room: Math.max(
        0,
        ((args.maxGramsBySlot.get(slot) ?? 0) * MAX_ASKABLE_DENSITY_PER_100G) /
            100 - t,
      ),
    }));
  if (own.length === 0) {
    return { targets: args.targets, moved: 0, refusal: "no_own_slot" };
  }
  const totalRoom = own.reduce((n, s) => n + s.room, 0);
  if (totalRoom <= 0.01) {
    return { targets: args.targets, moved: 0, refusal: "no_room" };
  }
  const moved = Math.min(surplus, totalRoom);
  // Au prorata de la cible, en remplissant ce qui sature, jusqu'à épuisement.
  let reste = moved;
  let restants = own.filter((s) => s.room > 0);
  for (
    let passe = 0;
    passe <= own.length && reste > 0.0001 && restants.length > 0;
    passe++
  ) {
    const base = restants.reduce((n, s) => n + s.target, 0);
    const partDe = (s: { target: number }) =>
      base > 0 ? (s.target / base) * reste : reste / restants.length;
    const satures = restants.filter((s) => partDe(s) >= s.room - 0.0001);
    if (satures.length === 0) {
      for (const s of restants) {
        const part = partDe(s);
        out.set(s.slot, (out.get(s.slot) ?? 0) + part);
        s.room -= part;
      }
      reste = 0;
      break;
    }
    for (const s of satures) {
      out.set(s.slot, (out.get(s.slot) ?? 0) + s.room);
      reste -= s.room;
      s.room = 0;
    }
    restants = restants.filter((s) => s.room > 0);
  }
  const placed = moved - reste;
  // Les cases partagées descendent de ce qui a trouvé une place, au prorata
  // de leur propre surplus — la somme reste celle de la journée.
  for (const t of trimmed) {
    const before = args.targets.get(t.slot) ?? 0;
    out.set(t.slot, before - placed * ((before - t.cap) / surplus));
  }
  return {
    targets: out,
    moved: placed,
    refusal: placed > 0.01 ? null : "no_room",
  };
}

/**
 * LE RYTHME COMPLET D'UNE JOURNÉE — le dénominateur, et rien d'autre.
 *
 * ⛔ LE REPLI EST CELUI DE `dayCoverageOf` ET D'`anchorFactorFor`, PAS UN
 * TROISIÈME : rien de déclaré vaut les trois repas de la maison. Le déduire de
 * la grille est exactement le défaut du lot B.
 *
 * ⚠️ ET UN MOMENT COUVERT QU'ELLE N'A PAS DÉCLARÉ ENTRE DANS LE DÉNOMINATEUR.
 * Le plan le lui sert, donc il la nourrit ; l'ignorer gonflerait la part de
 * tous les autres.
 */
export function rhythmOfDay(
  rhythmSlots: readonly string[],
  coveredSlots: readonly string[],
): readonly string[] {
  return wholeDaySlots(rhythmSlots, coveredSlots);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONSTRUCTEUR — une journée à la fois, les fonctions de production entières
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ DEUX APPELS DE `slotPlanTargets` PAR JOURNÉE, ET PAS UN DE PLUS. Le
 * premier retranche les apports fixes (c'est `composeKcal`), le second ne les
 * retranche pas (c'est `mealTargetKcal`). Les soustraire à la main ferait une
 * TROISIÈME arithmétique de la part d'un moment — celle qu'on relit le moins,
 * donc celle qui garderait l'ancienne règle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function slotContractsFor(args: {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  /**
   * ⟳ 2026-09-11 · LOT B — LE RYTHME ALIMENTAIRE COMPLET DE CETTE BOUCHE.
   *
   * ⛔ REQUIS, jamais `?`, et c'est le paramètre du lot. Un défaut à « la
   * grille » aurait laissé le défaut en place sous un autre nom : c'est
   * exactement ce que `requiredDensityFor` faisait, et ça a coûté un facteur
   * 2,86 sur la case `PERTE / 2026-09-11 / dinner`. `[]` = rien de déclaré, et
   * vaut les trois repas de la maison (`HOUSE_DEFAULT_SLOTS`).
   */
  rhythmSlots: readonly string[];
  days: readonly ContractDay[];
  lightSlots: readonly string[];
  ageYears: number | null;
}): SlotContractSet {
  const day = dayTargetFor(args.mouth, args.coachCounting);
  const light = new Set(args.lightSlots);
  const counters = emptyCounters();
  const contracts: SlotNutritionContract[] = [];
  // ⟳ 2026-09-23 — la part maximale d'un à-côté est bornée par l'âge
  // (`SIDE_COURSE_MAX_MEAL_SHARE`). Un mineur déclaré, ou un âge connu sous
  // 18 ans (la même tranche que `plateBoundsFor`), est mineur.
  const isMinor = args.mouth.ageState === "minor" ||
    plateBandOf(args.ageYears).band !== "adult";
  // ⟳ 2026-09-24 — LE PLAFOND D'ASSIETTE DE CETTE PERSONNE, calculé UNE fois
  // et passé aux quatre bornes ci-dessous (à-côté, relâche, couloir, contrat).
  // ⛔ SON ENTRETIEN (`maintenanceKcalOf`), JAMAIS SA CIBLE: l'objectif ne
  // rapetisse pas l'assiette de qui perd du poids et n'agrandit pas celle de
  // qui en prend (plan du 2026-09-24, « l'assiette suit l'entretien »).
  // `null` (mineur, âge ou entretien inconnu) = la table d'âge seule.
  const personal: PersonalPlateBounds | null = personalPlateBoundsFor({
    ageYears: args.ageYears,
    maintenanceKcal: maintenanceKcalOf(args.mouth).kcal,
    appetite: args.mouth.body?.appetite ?? null,
  });

  for (const d of args.days) {
    // ⟳ 2026-09-25 — UN MOMENT DÉCLARÉ VIDE SORT DE LA COUVERTURE ET DU RYTHME
    // (voir `ContractDay.emptySlots`): la journée se répartit sur les autres.
    // ⚠️ `?? []` pour les appelants que vitest lit sans typer, même règle que
    // `sides` plus bas.
    const empty = new Set(d.emptySlots ?? []);
    const allCovered = [...new Set(d.coveredSlots)];
    const covered = allCovered.filter((slot) => !empty.has(slot));
    const emptyCovered = allCovered.filter((slot) => empty.has(slot));
    const rhythm = rhythmOfDay(args.rhythmSlots, covered).filter((slot) => !empty.has(slot));
    const pushEmpty = (budget: { covered: number | null; gross: number | null }) => {
      for (const slot of emptyCovered) {
        contracts.push({
          memberId: args.mouth.memberId,
          date: d.date,
          dayToken: d.dayToken,
          slot,
          rhythmSlots: rhythm,
          coveredSlots: covered,
          lockedSlots: [...d.lockedSlots],
          dayTargetKcal: day.kcal,
          coveredBudgetKcal: budget.covered,
          coveredBudgetGrossKcal: budget.gross,
          fixedKcal: 0,
          mealTargetKcal: 0,
          composeKcal: 0,
          ...NO_SIDE,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "declared_empty",
          abstainReason: null,
          light: light.has(slot),
        });
      }
    };
    if (covered.length === 0) {
      pushEmpty({ covered: null, gross: null });
      continue;
    }
    // ⟳ 2026-09-23 — ⚠️ `?? null` NE REND PAS LE CHAMP OPTIONNEL: le type
    // l'exige, et tout appelant typé casse sans lui. Il protège les appelants
    // qui ne passent pas par un compilateur (vitest lit ce module sans vérifier
    // les types): chez eux, un champ absent vaut `null`, le contrat d'avant, au
    // lieu d'un `TypeError` au milieu d'un test étranger.
    const sides = d.sides ?? null;

    // ── L'ABSTENTION DE JOURNÉE, NOMMÉE PAR CASE ────────────────────────
    if (day.kcal === null || !(day.kcal > 0)) {
      for (const slot of covered) {
        // ⚠️ `counters.slots` NE COMPTE PAS CES CASES-LÀ, et c'est la règle
        // d'avant ce lot: il compte les moments EXAMINÉS, c'est-à-dire ceux
        // pour lesquels il y avait quelque chose à examiner. Sans cible de
        // journée, tous les compteurs restent à zéro et seul le MOTIF sort.
        contracts.push({
          memberId: args.mouth.memberId,
          date: d.date,
          dayToken: d.dayToken,
          slot,
          rhythmSlots: rhythm,
          coveredSlots: covered,
          lockedSlots: [...d.lockedSlots],
          dayTargetKcal: null,
          coveredBudgetKcal: null,
          coveredBudgetGrossKcal: null,
          fixedKcal: 0,
          mealTargetKcal: null,
          composeKcal: null,
          ...NO_SIDE,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "no_day_target",
          abstainReason: day.reason,
          light: light.has(slot),
        });
      }
      pushEmpty({ covered: null, gross: null });
      continue;
    }

    // ── ① LA JOURNÉE, EN UN APPEL ───────────────────────────────────────
    // ⚠️ `coveredSlots: rhythm` — on demande la part de TOUS les moments du
    // rythme pour pouvoir nommer le budget couvert ET connaître les cases
    // laissées de côté. `wholeSlots` reste le dénominateur.
    const withFixed = slotPlanTargets({
      targetKcal: day.kcal,
      coveredSlots: rhythm,
      wholeSlots: rhythm,
      lightSlots: args.lightSlots,
      slotFixedKcal: d.fixedKcalBySlot,
    });
    const withoutFixed = slotPlanTargets({
      targetKcal: day.kcal,
      coveredSlots: rhythm,
      wholeSlots: rhythm,
      lightSlots: args.lightSlots,
      slotFixedKcal: null,
    });

    // ── ② CE QUE LA FENÊTRE COUVRE, AVANT TOUT ARRONDI ──────────────────
    let coveredBudget = 0;
    for (const slot of covered) coveredBudget += withFixed.bySlot.get(slot) ?? 0;
    // ⟳ 2026-09-12 · C1 — LE MÊME TOTAL, SUR LES MÊMES CASES, SANS LE RETRAIT.
    // ⛔ `withoutFixed` EST DÉJÀ CALCULÉ (deuxième appel de `slotPlanTargets`
    // ci-dessus) : cette boucle ne fait que le SOMMER. Refaire ici une
    // soustraction à la main serait la troisième arithmétique de la part d'un
    // moment, celle que l'en-tête de ce bloc interdit nommément.
    let coveredBudgetGross = 0;
    for (const slot of covered) {
      coveredBudgetGross += withoutFixed.bySlot.get(slot) ?? 0;
    }

    // ── ③ LES BORNES, PUIS LE COULOIR ───────────────────────────────────
    const targets = new Map<string, number>();
    const maxGrams = new Map<string, number>();
    const locked = new Set(d.lockedSlots);
    // ⟳ 2026-09-23 — le budget des à-côtés de chaque case qui en a une entrée.
    const sideBySlot = new Map<
      string,
      { budget: SideCourseBudget; refused: boolean }
    >();
    for (const slot of covered) {
      // ⛔ UNE CASE QUE L'APPORT FIXE COUVRE EST FIGÉE : le shaker est avalé,
      // il ne se déplace pas. Même règle que `redistributeDayBudget`.
      if (withFixed.fixedCovered.has(slot)) {
        locked.add(slot);
        continue;
      }
      const t = withFixed.bySlot.get(slot) ?? null;
      if (t === null || !(t > 0)) continue;
      // ── ③ bis ⟳ 2026-09-23 — L'À-CÔTÉ PREND SA PART, LE PLAT GARDE LE RESTE
      //
      // ⛔ APRÈS LES APPORTS FIXES, AVANT TOUTE RELÂCHE: l'à-côté se taille
      // dans ce qui reste à composer (le shaker est déjà sorti), et les deux
      // relâches ne voient plus que le PLAT. Les laisser voir le repas entier
      // ferait déménager aux collations une énergie que l'à-côté porte déjà.
      //
      // ⚠️ LE PLAFOND DU PLAT EST CELUI DE LA TABLE: ce que l'assiette porte à
      // `SHARED_TABLE_MAX_ASK_PER_100G`, le même nombre que la relâche lira
      // juste après. Deux plafonds différents feraient grossir l'à-côté pour
      // un plat que la relâche aurait laissé passer, ou l'inverse.
      let dish = t;
      const sideInput = sides === null ? undefined : sideInputOf(sides, slot);
      if (sideInput !== undefined) {
        const mealBounds = plateBoundsFor({
          ageYears: args.ageYears,
          slot,
          slotTargetKcal: t,
          light: light.has(slot),
          appetite: args.mouth.body?.appetite ?? null,
          personal,
        });
        const budget = sideBudgetFor({
          mealKcal: t,
          dishCapKcal: (mealBounds.max * SHARED_TABLE_MAX_ASK_PER_100G) / 100,
          input: sideInput,
          isMinor,
        });
        sideBySlot.set(slot, { budget, refused: sideInput.refused });
        dish = budget.dishKcal;
        counters.side_slots++;
        if (sideInput.refused) counters.side_refused_slots++;
        counters.side_base_kcal += Math.round(budget.sideKcal - budget.grownKcal);
        counters.side_grown_kcal += Math.round(budget.grownKcal);
        if (budget.capped) counters.side_capped++;
      }
      targets.set(slot, dish);
      const b = plateBoundsFor({
        ageYears: args.ageYears,
        slot,
        slotTargetKcal: dish,
        light: light.has(slot),
        appetite: args.mouth.body?.appetite ?? null,
        personal,
      });
      if (b.physicalMax > 0) maxGrams.set(slot, b.max);
    }

    // ── ④ LA RELÂCHE, ET ELLE NE SORT PAS DE LA FENÊTRE ─────────────────
    //
    // ⛔ SEULEMENT ENTRE LES CASES COUVERTES. `redistributeDayBudget` conserve
    // la somme qu'on lui donne : lui donner le rythme entier ferait déplacer de
    // l'énergie vers un moment qu'on ne compose pas (perdue) ou en prendre à un
    // moment déjà mangé (le transfert interdit). On lui donne donc la fenêtre,
    // et la somme conservée est `coveredBudgetKcal`.
    const intenable = [...targets].some(([slot, t]) => {
      if (!maxGrams.has(slot)) return false;
      const c = densityCorridorFor({
        targetKcal: t,
        bounds: plateBoundsFor({
          ageYears: args.ageYears,
          slot,
          slotTargetKcal: t,
          light: light.has(slot),
          appetite: args.mouth.body?.appetite ?? null,
          personal,
        }),
      });
      return c !== null && c.incompatible === "above_askable_cap";
    });
    let relaxed: ReadonlyMap<string, number> | null = null;
    if (intenable && maxGrams.size > 0) {
      const out = relaxDayForCorridors({
        targets,
        maxGramsBySlot: maxGrams,
        lockedSlots: [...locked],
        lightSlots: args.lightSlots,
      });
      if (out.moved > 0) {
        relaxed = out.targets;
        counters.relaxed_days++;
      } else {
        const why = out.refusal ?? "unknown";
        counters.relax_refused[why] = (counters.relax_refused[why] ?? 0) + 1;
      }
    }
    // ── ⟳ 2026-09-21 — ④ bis LA RELÂCHE DE TABLE ─────────────────────────
    // Après la relâche d'assiette, jamais à sa place: une case que 250 ne
    // sauve pas est déjà nommée `density_infeasible`; ici on déplace ce qui
    // dépasse `SHARED_TABLE_MAX_ASK_PER_100G` sur une case qui DÉBORDE vers
    // les cases receveuses.
    //
    // ⟳ 2026-09-23 — ⛔ UN JOUR QUI PORTE DES À-CÔTÉS CHANGE LES DEUX LISTES:
    // les cases qui débordent sont les cases partagées ET tout déjeuner ou
    // dîner qui a une entrée `sides` (refus compris, même mangé seul); les
    // receveuses ne sont plus que les collations. Un jour `sides: null` garde
    // la règle d'avant, à l'octet.
    const sharedToday = (d.sharedSlots ?? []).filter((s) => targets.has(s));
    counters.shared_slots += sharedToday.length;
    const overflowToday = sides === null
      ? sharedToday
      : [...new Set([...sharedToday, ...sideBySlot.keys()])];
    const receivers: TableRelaxReceivers = sides === null ? "own_slots" : "snacks";
    const beforeTable: ReadonlyMap<string, number> = relaxed ?? targets;
    if (overflowToday.length > 0 && maxGrams.size > 0) {
      const out = relaxSharedForTable({
        targets: beforeTable,
        maxGramsBySlot: maxGrams,
        overflowSlots: overflowToday,
        lockedSlots: [...locked],
        lightSlots: args.lightSlots,
        receivers,
      });
      if (out.moved > 0.01) {
        relaxed = out.targets;
        counters.shared_relaxed_days++;
        counters.shared_moved_kcal += Math.round(out.moved);
        if (receivers === "snacks") {
          counters.overflow_to_snacks_kcal += Math.round(out.moved);
        }
      } else if (out.refusal !== null && out.refusal !== "no_shared_surplus") {
        counters.shared_relax_refused[out.refusal] =
          (counters.shared_relax_refused[out.refusal] ?? 0) + 1;
      }
    }
    // ── ④ ter ⟳ 2026-09-23 — CE QUI DÉBORDE ENCORE MONTE DANS LE PLAT ────
    //
    // ⛔ L'ÉNERGIE DE LA JOURNÉE EST UN CONTRAT, LA BORNE DE 550 g NON. Ce que
    // les collations n'ont pas pu prendre reste dans le plat, et les bornes de
    // CE moment passent au plafond de repli (`hardCeilingBoundsFor`). Le
    // raboter pour tenir sous 550 serait retirer de la nourriture en silence.
    //
    // ⚠️ SEULEMENT SUR UN JOUR QUI PORTE DES À-CÔTÉS: un jour `sides: null`
    // garde ses bornes d'avant. Une case figée ne change jamais de bornes.
    const overflowBySlot = new Map<string, SlotOverflow>();
    if (sides !== null) {
      const afterTable: ReadonlyMap<string, number> = relaxed ?? targets;
      for (const slot of overflowToday) {
        const g = maxGrams.get(slot);
        if (g === undefined || locked.has(slot)) continue;
        const cap = (g * SHARED_TABLE_MAX_ASK_PER_100G) / 100;
        const before = beforeTable.get(slot) ?? 0;
        const after = afterTable.get(slot) ?? 0;
        if (after > cap + 0.01) {
          overflowBySlot.set(slot, "hard_ceiling");
          counters.overflow_to_dish++;
        } else if (before > cap + 0.01) {
          overflowBySlot.set(slot, "snacks");
        }
      }
    }

    // ── ⑤ LE CONTRAT, CASE PAR CASE ─────────────────────────────────────
    for (const slot of covered) {
      counters.slots++;
      const base = {
        memberId: args.mouth.memberId,
        date: d.date,
        dayToken: d.dayToken,
        slot,
        rhythmSlots: rhythm,
        coveredSlots: covered,
        lockedSlots: [...locked],
        dayTargetKcal: day.kcal,
        coveredBudgetKcal: coveredBudget,
        coveredBudgetGrossKcal: coveredBudgetGross,
        fixedKcal: Math.max(0, d.fixedKcalBySlot?.get(slot) ?? 0),
        mealTargetKcal: withoutFixed.bySlot.get(slot) ?? null,
        abstainReason: null,
        light: light.has(slot),
      };
      if (withFixed.fixedCovered.has(slot)) {
        counters.fixed_covered++;
        contracts.push({
          ...base,
          composeKcal: 0,
          ...NO_SIDE,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "fixed_covered",
        });
        continue;
      }
      const planned = withFixed.bySlot.get(slot) ?? null;
      if (planned === null || !(planned > 0)) {
        contracts.push({
          ...base,
          composeKcal: null,
          ...NO_SIDE,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "no_slot_share",
        });
        continue;
      }
      // ⟳ 2026-09-23 — LE PLAT AVANT LES RELÂCHES: la part du moment moins
      // son à-côté. ⛔ C'est lui, et pas la part entière, que
      // `redistributedKcal` compare: sans ça, l'à-côté se lirait comme une
      // énergie « déplacée » hors de la journée, et la somme des déplacements
      // d'un jour cesserait de valoir zéro.
      const plannedDish = targets.get(slot) ?? planned;
      const target = (relaxed ?? targets).get(slot) ?? plannedDish;
      const side = sideBySlot.get(slot);
      const overflow = overflowBySlot.get(slot) ?? "none";
      const sideFields = side === undefined
        ? { ...NO_SIDE, overflow }
        : {
          sideKcal: side.budget.sideKcal,
          sideCourses: side.budget.courses,
          sideGrowthKcal: side.budget.grownKcal,
          sideRefused: side.refused,
          overflow,
        };
      // ⟳ 2026-09-23 — ⛔ UN MOMENT QUI DÉBORDE ENCORE A SES BORNES AU
      // PLAFOND DE REPLI (④ ter). La même fonction de couloir, une autre table.
      const bounds = (overflow === "hard_ceiling" ? hardCeilingBoundsFor : plateBoundsFor)({
        ageYears: args.ageYears,
        slot,
        slotTargetKcal: target,
        light: light.has(slot),
        appetite: args.mouth.body?.appetite ?? null,
        personal,
      });
      if (!(bounds.physicalMax > 0)) {
        contracts.push({
          ...base,
          composeKcal: target,
          ...sideFields,
          redistributedKcal: target - plannedDish,
          bounds: null,
          corridor: null,
          status: "no_plate_bounds",
        });
        continue;
      }
      const corridor = densityCorridorFor({ targetKcal: target, bounds });
      if (corridor !== null && corridor.minPer100G === MAX_ASKABLE_DENSITY_PER_100G) {
        counters.capped++;
      }
      // ⟳ 2026-09-14 · BÊTA 1B ③ — voir le pavé de `density_infeasible`. On lit
      // le motif que `densityCorridorFor` pose DÉJÀ, on n'en recalcule aucun.
      if (corridor !== null && corridor.incompatible === "above_askable_cap") {
        counters.density_infeasible++;
      }
      contracts.push({
        ...base,
        composeKcal: target,
        ...sideFields,
        redistributedKcal: target - plannedDish,
        bounds,
        corridor,
        status: corridor === null
          ? "no_plate_bounds"
          : corridor.incompatible === "above_askable_cap"
          ? "density_infeasible"
          : "computed",
      });
    }
    pushEmpty({ covered: coveredBudget, gross: coveredBudgetGross });
  }

  const byKey = new Map<string, SlotNutritionContract>();
  for (const c of contracts) byKey.set(contractKey(c.memberId, c.date, c.slot), c);
  return {
    memberId: args.mouth.memberId,
    input: args,
    contracts,
    byKey,
    dayTargetKcal: day.kcal,
    reason: day.reason,
    gapClosed: day.gapClosed,
    counters,
  };
}

/**
 * RECOLLER PLUSIEURS JEUX DE CONTRATS D'UNE MÊME BOUCHE.
 *
 * ⛔ ELLE EXISTE POUR UNE SEULE RAISON, ET ELLE EST NOMMÉE : l'instrument de
 * mesure (`scripts/2026-09-11-mesure-grille.ts`) doit pouvoir REFAIRE ce que le
 * moteur a envoyé le 2026-09-11 — c'est-à-dire un rythme lu dans la grille,
 * jour par jour — pour comparer sa phrase, CARACTÈRE POUR CARACTÈRE, à celle du
 * prompt archivé. Sans cette reconstruction, l'instrument perdrait la seule
 * épreuve qui prouve que ses entrées figées sont les bonnes.
 *
 * ⚠️ ELLE NE RECALCULE RIEN et ne mélange jamais deux bouches : les contrats
 * sont concaténés, les compteurs additionnés, et un jeu vide rend un jeu vide.
 *
 * PURE: no I/O, no clock, no randomness.
 */
// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1B ③/⑤ — LA DEMANDE INTENABLE, DITE AVANT L'APPEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QUE LA PERSONNE PEUT CHANGER POUR RENDRE SA DEMANDE TENABLE.
 *
 * ⛔ TROIS SORTIES, ET CE SONT TOUTES DES CHOSES QU'ELLE A DÉJÀ DÉCLARÉES. Le
 * plan de bêta l'exige: « exposer une demande incompatible et une action UI
 * concrète : modifier la répartition, le réglage léger ou ajouter un créneau.
 * Toute modification d'un choix utilisateur doit être visible et validée par
 * lui. Ne pas baisser sa cible calorique ou agrandir ses bornes silencieusement. »
 *
 *   · `add_slot`     — sa journée n'a pas assez de moments pour porter ce
 *                      qu'elle mange. C'est la sortie la plus fréquente et la
 *                      seule qui n'enlève rien.
 *   · `unset_light`  — elle a marqué ce moment « repas léger », ce qui BAISSE
 *                      la borne de masse. Le retirer rouvre l'assiette.
 *   · `raise_appetite` — son appétit déclaré borne la masse; le monter l'ouvre.
 *
 * ⚠️ AUCUN CHIFFRE NE SORT D'ICI, ET C'EST DÉLIBÉRÉ. Ces motifs traversent
 * jusqu'à l'écran, où les objectifs et les calories de quelqu'un peuvent être
 * protégés. Le moteur dit QUOI CHANGER, jamais combien il manque.
 */
export const INFEASIBLE_DEMAND_ACTIONS = [
  "add_slot",
  "unset_light",
  "raise_appetite",
] as const;
export type InfeasibleDemandAction = (typeof INFEASIBLE_DEMAND_ACTIONS)[number];

export interface InfeasibleDemand {
  readonly memberId: string;
  readonly date: string;
  readonly dayToken: string;
  readonly slot: string;
  /** Le moment porte la marque « repas léger » de cette personne. */
  readonly light: boolean;
  /** Combien de moments sa journée compte — le dénominateur de sa part. */
  readonly rhythmSlots: number;
  /** Les gestes qui peuvent rendre la demande tenable, du plus sûr au moins. */
  readonly actions: readonly InfeasibleDemandAction[];
}

/**
 * LES CASES DONT LA DEMANDE NE TIENT PAS, ET CE QU'ON PEUT Y FAIRE.
 *
 * ⛔ ELLE NE DÉCIDE RIEN ET N'ÉCRIT RIEN. L'appelant, voyant une liste non
 * vide, s'abstient d'appeler le modèle — et c'est cette abstention-là qui est
 * la garde, pas cette fonction. Même posture que `finalGateDelivery`.
 *
 * ⚠️ `appetite` ARRIVE PAR L'APPELANT, jamais relu ici: c'est le MÊME champ
 * que `plateBoundsFor` a consommé pour poser la borne. Deux lectures d'une même
 * déclaration finiraient par proposer un geste qui ne change rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function infeasibleDemands(args: {
  readonly sets: readonly SlotContractSet[];
  /** L'appétit déclaré par bouche. `null` = rien de déclaré ⇒ le monter est ouvert. */
  readonly appetiteByMouth: ReadonlyMap<string, string | null>;
}): InfeasibleDemand[] {
  const out: InfeasibleDemand[] = [];
  for (const set of args.sets) {
    for (const c of set.contracts) {
      if (c.status !== "density_infeasible") continue;
      const actions: InfeasibleDemandAction[] = [];
      // ⛔ L'ORDRE EST CELUI DU MOINDRE RENONCEMENT. Ajouter un moment ne
      // retire rien à personne; retirer « léger » et monter l'appétit défont
      // tous deux une déclaration de la personne.
      if (c.rhythmSlots.length < MAX_RHYTHM_SLOTS_FOR_ADVICE) {
        actions.push("add_slot");
      }
      if (c.light) actions.push("unset_light");
      const appetite = args.appetiteByMouth.get(c.memberId) ?? null;
      if (appetite !== "large") actions.push("raise_appetite");
      out.push({
        memberId: c.memberId,
        date: c.date,
        dayToken: c.dayToken,
        slot: c.slot,
        light: c.light,
        rhythmSlots: c.rhythmSlots.length,
        actions,
      });
    }
  }
  return out;
}

/**
 * ⚠️ LE NOMBRE DE MOMENTS AU-DESSUS DUQUEL « AJOUTE UN CRÉNEAU » N'EST PLUS UN
 * CONSEIL. Six moments, c'est le rythme le plus large que l'écran propose
 * (`SLOT_DAY_WEIGHT` en couvre six depuis fin août): au-delà, le geste n'existe
 * pas, et le proposer enverrait la personne chercher un bouton absent.
 *
 * ⛔ EXPORTÉE POUR ÊTRE ÉPINGLÉE, pas pour être réglée: un test la lit, et un
 * commit ultérieur la déplacerait DÉLIBÉRÉMENT.
 */
export const MAX_RHYTHM_SLOTS_FOR_ADVICE = 6;

export function mergeSlotContractSets(
  sets: readonly SlotContractSet[],
): SlotContractSet {
  const first = sets[0];
  if (first === undefined) {
    return {
      memberId: "",
      input: null,
      contracts: [],
      byKey: new Map(),
      dayTargetKcal: null,
      reason: "no_body",
      gapClosed: "none",
      counters: emptyCounters(),
    };
  }
  const counters = emptyCounters();
  const contracts: SlotNutritionContract[] = [];
  for (const set of sets) {
    if (set.memberId !== first.memberId) {
      throw new Error("mergeSlotContractSets: deux bouches différentes");
    }
    contracts.push(...set.contracts);
    counters.slots += set.counters.slots;
    counters.fixed_covered += set.counters.fixed_covered;
    counters.capped += set.counters.capped;
    counters.relaxed_days += set.counters.relaxed_days;
    for (const [why, n] of Object.entries(set.counters.relax_refused)) {
      counters.relax_refused[why] = (counters.relax_refused[why] ?? 0) + n;
    }
    counters.shared_slots += set.counters.shared_slots;
    counters.shared_relaxed_days += set.counters.shared_relaxed_days;
    counters.shared_moved_kcal += set.counters.shared_moved_kcal;
    for (const [why, n] of Object.entries(set.counters.shared_relax_refused)) {
      counters.shared_relax_refused[why] =
        (counters.shared_relax_refused[why] ?? 0) + n;
    }
    // ⟳ 2026-09-23 — les compteurs des à-côtés et du débordement.
    counters.side_slots += set.counters.side_slots;
    counters.side_refused_slots += set.counters.side_refused_slots;
    counters.side_base_kcal += set.counters.side_base_kcal;
    counters.side_grown_kcal += set.counters.side_grown_kcal;
    counters.side_capped += set.counters.side_capped;
    counters.overflow_to_snacks_kcal += set.counters.overflow_to_snacks_kcal;
    counters.overflow_to_dish += set.counters.overflow_to_dish;
  }
  const byKey = new Map<string, SlotNutritionContract>();
  for (const c of contracts) byKey.set(contractKey(c.memberId, c.date, c.slot), c);
  return {
    memberId: first.memberId,
    input: null,
    contracts,
    byKey,
    dayTargetKcal: first.dayTargetKcal,
    reason: first.reason,
    gapClosed: first.gapClosed,
    counters,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE PLI VERS LE PROMPT — compatibles ensemble, incompatibles séparés
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ ON NE FUSIONNE PAS TOUS LES DÎNERS PAR LEUR VALEUR MAXIMALE, et c'est la
 * règle explicite du chantier : « une consigne commune n'est possible que si
 * les contrats sont EFFECTIVEMENT COMPATIBLES et les cases concernées restent
 * IDENTIFIABLES. »
 *
 * Deux occurrences d'un même moment se rangent donc en GRAPPES :
 *   · leurs couloirs se croisent  ⇒ une seule ligne, `max(Dmin)` / `min(Dmax)`,
 *     et elle porte LES JOURS qu'elle couvre ;
 *   · leurs couloirs sont disjoints ⇒ DEUX lignes, chacune avec ses jours.
 *
 * ⛔ CE QUI CHANGE PAR RAPPORT AU 2026-09-10. Une intersection vide rendait une
 * ligne unique, rabattue sur son plancher (`min === max`), avec le motif
 * `empty_intersection` et la phrase « these days need different recipes ». Le
 * modèle recevait donc un point au lieu d'une bande, pour DEUX jours, et
 * n'avait aucun moyen de savoir lequel demandait quoi. Il reçoit maintenant les
 * deux bandes, datées. Le compteur `empty_intersection` garde son sens exact —
 * « combien de moments ont dû être SÉPARÉS » — et le commentaire qui dit
 * « s'il grimpe, la sortie est une recette séparée » devient la description de
 * ce que le code fait.
 *
 * PURE: no I/O, no clock, no randomness.
 */
function clustersOf(
  rows: readonly { days: string[]; corridor: DensityCorridor }[],
): { days: string[]; corridor: DensityCorridor }[] {
  const out: { days: string[]; corridor: DensityCorridor }[] = [];
  for (const row of rows) {
    let placed = false;
    for (const cluster of out) {
      // ⛔ LA COMPATIBILITÉ SE LIT SUR LES BORNES, JAMAIS SUR LE JETON.
      // `mergeCorridors` donne la PRIORITÉ à `above_askable_cap` quand un des
      // deux côtés le porte — donc un couloir [250, 250] plafonné fondu avec un
      // [100, 134] rendait « above_askable_cap » et l'intersection vide
      // disparaissait. Mesuré en écrivant ce module : la grappe se formait
      // quand même, et les deux jours repartaient avec 250.
      const bas = Math.max(cluster.corridor.minPer100G, row.corridor.minPer100G);
      const haut = Math.min(cluster.corridor.maxPer100G, row.corridor.maxPer100G);
      if (bas > haut) continue;
      const merged = mergeCorridors(cluster.corridor, row.corridor);
      cluster.corridor = merged;
      cluster.days = [...cluster.days, ...row.days];
      placed = true;
      break;
    }
    if (!placed) out.push({ days: [...row.days], corridor: row.corridor });
  }
  return out;
}

/**
 * LE CONTRAT VU PAR LE PROMPT — `RequiredDensity`, la forme que les cartes et
 * le calendrier lisent déjà.
 *
 * ⛔ SOUS PLANCHER TCA (`gapClosed: "restriction_floor"`), TOUT PART DANS
 * `floorOnly` : le nombre continue d'atteindre le modèle par le plancher
 * COMMUN du bloc, il cesse d'être attaché à quelqu'un. Règle inchangée.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function requiredDensityFromContracts(
  set: SlotContractSet,
  floors: { normal: number; light: number },
): RequiredDensity {
  const bySlot = new Map<
    string,
    { days: string[]; corridor: DensityCorridor; light: boolean }[]
  >();
  const distinctMins = new Map<string, Set<number>>();
  for (const c of set.contracts) {
    if (c.corridor === null) continue;
    const list = bySlot.get(c.slot) ?? [];
    list.push({ days: [c.dayToken], corridor: c.corridor, light: c.light });
    bySlot.set(c.slot, list);
    const seen = distinctMins.get(c.slot) ?? new Set<number>();
    seen.add(c.corridor.minPer100G);
    distinctMins.set(c.slot, seen);
  }

  const kept: SlotDensity[] = [];
  /**
   * ⟳ 2026-09-12 · ÉTAPE C4 — LE PLANCHER DE LA CLASSE D'UNE LIGNE.
   * ⚠️ `light` porte déjà la classe: la relire évite de retenir le `floor` de
   * la boucle, qui n'existe plus au moment où les compteurs se calculent.
   */
  const floorOf = (d: SlotDensity) => d.light ? floors.light : floors.normal;
  let split = 0;
  for (const [slot, rows] of bySlot) {
    const isLight = rows.some((r) => r.light);
    const floor = isLight ? floors.light : floors.normal;
    const clusters = clustersOf(rows);
    if (clusters.length > 1) split++;
    for (const cluster of clusters) {
      const c = cluster.corridor;
      kept.push({
        slot,
        // ⟳ 2026-09-11 · LOT B — LES JOURS QUE CETTE LIGNE COUVRE.
        // ⛔ SANS EUX, DEUX LIGNES DU MÊME MOMENT SONT INDISCERNABLES, et le
        // chantier demande que « les cases concernées restent identifiables ».
        days: [...new Set(cluster.days)],
        kcalPer100G: c.minPer100G,
        minPer100G: c.minPer100G,
        maxPer100G: c.maxPer100G,
        preferredPer100G: c.preferredPer100G,
        neededMinPer100G: c.neededMinPer100G,
        incompatible: c.incompatible,
        // ══════════════════════════════════════════════════════════════════
        // ⟳ 2026-09-12 · ÉTAPE C4 — « REDONDANT » VEUT DIRE **ÉGAL**, PAS
        // « PAS PLUS HAUT »
        // ══════════════════════════════════════════════════════════════════
        //
        // ⛔ LA VERSION D'AVANT ÉTAIT `!(c.minPer100G > floor)`, et elle
        // confondait deux situations opposées. À `min === floor`, la phrase
        // commune du bloc dit déjà le nombre: le répéter en face d'un nom
        // n'ajoute rien, et « un brief qui répète cesse d'être lu ». À
        // `min < floor`, la phrase commune dit un nombre PLUS HAUT que le
        // contrat — et la ligne qui l'aurait corrigé ne sortait pas. Mesuré au
        // tir n° 3 du 2026-09-11: petit-déjeuner de 613,5 kcal à grand
        // appétit, minimum réel **91**, consigne lue **100**, recettes rendues
        // à 94 et 99 — comptées comme des violations par un rapport qui lisait
        // la consigne, acceptées par la garde qui lit le contrat.
        //
        // ⛔ ON NE REMONTE PAS LE CONTRAT À 100. Le plan de clôture l'écrit:
        // « ne pas réparer ces recettes sur la base du faux seuil de 100 ».
        // C'est la consigne qui s'aligne — voir `DENSITY_CONSEQUENCE`, qui
        // porte désormais la règle de préséance.
        redundantMin: c.minPer100G === floor,

        occurrences: cluster.days.length,
        light: isLight,
        targetAnchoredPer100G: c.targetAnchoredPer100G,
      });
    }
  }
  // ⛔ L'ORDRE EST CELUI DE LA JOURNÉE, PAS CELUI DE LA `Map`. Une ligne qui
  // dirait « 159 au dîner, 182 au déjeuner » se lit comme deux faits sans
  // rapport ; dans l'ordre, elle se lit comme une journée. À moment égal, les
  // grappes gardent l'ordre de leurs jours.
  kept.sort((a, b) => slotOrderOf(a.slot) - slotOrderOf(b.slot));

  let daysVaried = 0;
  for (const [, values] of distinctMins) if (values.size > 1) daysVaried++;

  const counters = {
    slots: set.counters.slots,
    // ⟳ 2026-09-12 · ÉTAPE C4 — LE COMPTEUR REDEVIENT CE QUE SON NOM DIT.
    // ⛔ `!redundantMin` COMPTAIT AUSSI LES MOMENTS SOUS LE PLANCHER depuis que
    // `redundantMin` distingue les deux cas. Un compteur nommé « au-dessus du
    // plancher » qui compte aussi ceux d'en dessous est un compteur qu'on lit
    // à l'envers — et ce fichier en a déjà payé un.
    above_floor: kept.filter((d) => d.minPer100G > floorOf(d)).length,
    below_floor: kept.filter((d) => d.minPer100G < floorOf(d)).length,
    days_varied: daysVaried,
    capped: kept.filter((d) => d.kcalPer100G === MAX_ASKABLE_DENSITY_PER_100G)
      .length,
    fixed_covered: set.counters.fixed_covered,
    floor_min_kept: kept.filter((d) => d.redundantMin).length,
    // ⚠️ SON SENS SE PRÉCISE ET NE CHANGE PAS : « combien de moments n'ont
    // aucune densité commune sur tous leurs jours ». Avant le lot B il comptait
    // les LIGNES rabattues sur leur plancher ; il compte maintenant les moments
    // qu'on a dû SÉPARER — ce que son commentaire d'origine annonçait déjà.
    empty_intersection: split,
    relaxed_days: set.counters.relaxed_days,
    relax_refused: set.counters.relax_refused,
  };
  return set.gapClosed === "restriction_floor"
    ? {
      named: [],
      floorOnly: kept,
      reason: set.reason,
      gapClosed: set.gapClosed,
      counters,
    }
    : {
      named: kept,
      floorOnly: [],
      reason: set.reason,
      gapClosed: set.gapClosed,
      counters,
    };
}

/**
 * L'ANCIENNE PORTE D'ENTRÉE, REBRANCHÉE SUR LE CONTRAT.
 *
 * ⛔ `rhythmSlots` EST LE PARAMÈTRE AJOUTÉ, ET IL EST REQUIS. Sans lui, cette
 * fonction déduisait le dénominateur de la GRILLE — c'est-à-dire donnait la
 * journée entière au dernier repas restant. Mesuré : `PERTE / 2026-09-11 /
 * dinner` à 2 454 kcal au lieu de 858,90, et le couloir [250–250] de ce
 * vendredi imposé aux dîners du samedi et du dimanche.
 *
 * ⚠️ ELLE NE PORTE PLUS D'ARITHMÉTIQUE. Elle construit le contrat et le plie ;
 * c'est le contrat qui fait autorité, et c'est lui que le dimensionnement lit.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function requiredDensityFor(args: {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  /** Jour → les moments que le PLAN couvre ce jour-là (la grille). */
  slotsByDay: ReadonlyMap<string, readonly string[]>;
  /**
   * ⟳ 2026-09-11 · LOT B — LE RYTHME ALIMENTAIRE COMPLET. `[]` = les trois
   * repas de la maison. ⛔ REQUIS : voir le pavé de `slotContractsFor`.
   */
  rhythmSlots: readonly string[];
  lightSlots: readonly string[];
  slotFixedKcalByDay: ReadonlyMap<string, ReadonlyMap<string, number>>;
  ageYears: number | null;
  floors: { normal: number; light: number };
}): RequiredDensity {
  const set = slotContractsFor({
    mouth: args.mouth,
    coachCounting: args.coachCounting,
    rhythmSlots: args.rhythmSlots,
    days: [...args.slotsByDay].map(([dayToken, slots]) => ({
      dayToken,
      // ⚠️ SANS CALENDRIER, LE JETON DE JOUR TIENT LIEU DE DATE. Cet appelant-ci
      // n'en a pas ; ceux qui en ont un passent par `slotContractsFor`.
      date: dayToken,
      coveredSlots: slots,
      lockedSlots: [],
      fixedKcalBySlot: args.slotFixedKcalByDay.get(dayToken) ?? null,
      // ⟳ 2026-09-23 — ⚠️ CETTE PORTE NE CONNAÎT PAS LES À-CÔTÉS: elle rend
      // le couloir d'avant. La voie du foyer passe par `slotContractsFor`.
      sides: null,
      emptySlots: [],
    })),
    lightSlots: args.lightSlots,
    ageYears: args.ageYears,
  });
  return requiredDensityFromContracts(set, args.floors);
}

export { HOUSE_DEFAULT_SLOTS };
export type { DensityIncompatibility };
