/**
 * RAMENER UNE JOURNÉE SOUS SON PLAFOND PROTÉIQUE — par l'arithmétique, sur les
 * SEULS plats que la bouche mange seule.
 *
 * ── LE PROBLÈME, MESURÉ (2026-09-22, foyer de test à trois bouches) ────────
 * Une casserole partagée n'a qu'UNE composition. `sharedProteinCaps`
 * (`plan_protein_brief.ts`) fixe sa densité protéique à celle du PLANCHER le
 * plus exigeant à table — « le plancher gagne », décidé le 2026-09-21. Sur ce
 * foyer, le plancher de l'homme en perte (~2 192 kcal/jour) est plus DENSE en
 * protéine que le plafond de l'homme en prise de masse (~3 300 kcal/jour):
 * le second hérite donc de la densité du premier sur toute sa journée.
 *
 * Le brouillon réel: `floor_wins_cells` 15/15, `ceiling_yielded_slots` 15,
 * `protein_ceiling.over` **9 journées-bouche sur 15**, la pire à **+46 %**.
 * L'homme en prise de masse mange 2,5 à 2,9 g/kg pour un plafond à 2,0.
 *
 * ⛔ ET LA TABLE N'EST PAS LE LEVIER. Baisser la casserole partagée ferait
 * passer la bouche en perte sous SON plancher: c'est exactement l'arbitrage que
 * « le plancher gagne » a tranché, et ce module ne le rouvre pas. Ce qui reste
 * ouvert, c'est ce que la bouche mange SEULE — sur le cas mesuré, le petit
 * déjeuner et les deux collations, ~1 370 kcal par jour que le modèle remplit
 * de yaourt et de petits-suisses.
 *
 * ── CE QUE FAIT CE MODULE, ET DE QUI IL EST LE FRÈRE ──────────────────────
 * `proportion_adjust.ts` déplace des grammes entre les lignes d'une recette
 * pour tenir un couloir de DENSITÉ ÉNERGÉTIQUE. Ce module fait le même geste,
 * avec le même vocabulaire de bornes, pour tenir un PLAFOND DE PROTÉINE — et
 * l'invariant change: ce n'est plus la masse cuite qu'on conserve, c'est
 * l'ÉNERGIE. Des grammes quittent les lignes protéiques et vont au féculent et
 * au gras, à kcal constantes; la journée perd de la protéine sans perdre son
 * budget.
 *
 * C'est de l'arithmétique, pas un appel modèle. Un rattrapage modèle coûte 65 à
 * 114 secondes mesurées (`proportion_adjust.ts`, en-tête) et n'a pas fermé les
 * deux cas de densité qu'on lui avait confiés. Ici, le référentiel donne la
 * protéine et l'énergie de chaque ligne: il n'y a rien à deviner.
 *
 * ── CE QU'IL NE FAIT PAS, ET CE SONT DES INTERDITS ────────────────────────
 * ⛔ IL N'AJOUTE, NE SUPPRIME ET NE REMPLACE AUCUN INGRÉDIENT. La liste rendue
 * a exactement les mêmes lignes, dans le même ordre, avec les mêmes
 * identifiants: seules les quantités bougent. Retirer le yaourt d'un petit
 * déjeuner est une recomposition, donc le travail du modèle.
 *
 * ⛔ IL NE TOUCHE JAMAIS UN PLAT PARTAGÉ. Une unité citée par une case à deux
 * mangeurs ou plus est hors de portée PAR CONSTRUCTION — l'appelant la marque
 * `solo: false`, et le module refuse en plus toute unité citée par deux bouches
 * différentes. Deux gardes pour le même interdit, parce qu'une seule serait
 * désarmée par un appelant distrait.
 *
 * ⛔ IL NE FABRIQUE AUCUN NOMBRE POUR COMBLER UNE ABSENCE. Une bouche sans
 * plafond lisible (mineur, corps illisible) n'est pas ajustée, et le compteur
 * `mouth_days_without_ceiling` le dit. Une journée dont la protéine ne se
 * mesure pas non plus (`mouth_days_unmeasurable`).
 *
 * ⛔ IL NE RECALCULE NI LES PORTIONS, NI LES BOÎTES, NI LES COURSES. Il rend
 * les nouvelles quantités; c'est l'appelant qui rejoue le dimensionnement et
 * qui CONTRÔLE le résultat appliqué — exactement comme pour `proportion_adjust`.
 *
 * ── IL EST PUR, ET IL REÇOIT SA MESURE PAR INJECTION ──────────────────────
 * ⛔ Il n'importe RIEN du moteur de mesure. Il reçoit une `ProteinMeasureFn`
 * qui rend l'énergie, la masse prête ET la protéine d'une liste de lignes. Même
 * raison que chez son frère: testable sans base ni référentiel, et la règle de
 * l'eau, du rendement et de l'escompte d'Atwater reste celle de l'appelant.
 *
 * ⛔ ET LA TOLÉRANCE ARRIVE EN PARAMÈTRE, REQUISE, JAMAIS `?`. Elle vit dans
 * `final_plan_gate.ts` (`PROTEIN_CEILING_TOLERANCE`), avec la garde qui compte
 * les dépassements; la recopier ici ferait deux nombres pour une seule décision
 * produit, et un module pur n'a pas à tirer les 900 lignes de la garde finale
 * pour lire une constante. Un paramètre optionnel, lui, aurait fait exactement
 * ce que ce dépôt a déjà payé: une garde construite, branchée, désarmée.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import type { FoodGroupRef } from "./tokens.ts";
import {
  ADDED_FAT_GROUPS,
  type AdjustableIngredient,
  type AdjustableUnit,
  type AdjustedIngredient,
  type AdjustedUnit,
  FIXED_GROUPS,
  GRAMS_QUANTUM,
  MIN_MOVE_COOKED_G,
  MOVE_COOKED_G,
  PROBE_RAW_G,
  PROTEIN_GROUPS,
  ratioBoundsFor,
} from "./proportion_adjust.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES DEUX CÔTÉS DU DÉPLACEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUI DONNE: les groupes protéiques, la liste de `proportion_adjust.ts`.
 *
 * ⛔ IMPORTÉE, PAS RECOPIÉE. C'est la troisième fois que ce dépôt aurait écrit
 * une liste de groupes protéiques; la deuxième avait déjà coûté un lot désarmé.
 * `dairy_yogurt` et `legumes` en font partie — et c'est précisément le yaourt
 * qui remplit les petits déjeuners du cas mesuré.
 */
export const CEILING_DONOR_GROUPS = PROTEIN_GROUPS;

/**
 * QUI REÇOIT — « le féculent et le gras », et rien d'autre.
 *
 * ⛔ LES LÉGUMES N'EN SONT PAS, ET C'EST UN ARBITRAGE. Un légume rend 20 à 30
 * kcal aux 100 g: remplacer 40 g de blanc de poulet par l'énergie équivalente
 * en courgettes demanderait 300 g de courgettes, c'est-à-dire changer le plat
 * sous couvert d'ajuster ses proportions. Le féculent et la matière grasse sont
 * les deux seules lignes assez denses pour absorber l'énergie d'une protéine
 * sans déformer l'assiette.
 *
 * ⚠️ `starchy_veg` EST UN FÉCULENT ICI, comme dans `proportion_adjust.ts`:
 * « une pomme de terre est un FÉCULENT, c'est la CIBLE d'une densification ».
 *
 * ⚠️ ET LE PLAFOND DU GRAS RESTE CELUI DE SON FRÈRE: `ratioBoundsFor` rend
 * 125 % sur `olive_oil` et `other_added_fat`. Une matière grasse à 9 kcal/g
 * fermerait n'importe quel écart; sans ce plafond, ce module noierait
 * l'assiette d'huile et s'appellerait un succès.
 */
export const CEILING_STARCH_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "whole_grain",
  "refined_grain",
  "starchy_veg",
]);

/**
 * ⟳ 2026-09-22 — DÉCISION PRODUIT: LE PLAFOND PROTÉIQUE EST UNE MESURE, PAS
 * UNE CIBLE.
 *
 * ⛔ CETTE PASSE EST ÉTEINTE. Elle déplaçait des grammes d'une protéine vers un
 * féculent pour faire passer une journée sous `proteinCeilingGFor` — c'est-à-dire
 * qu'elle déformait des recettes pour tenir une borne que le code nomme lui-même
 * « de confort » (`sharedProteinCaps`: « un plancher est un besoin; un plafond
 * est une borne de confort »). Le plafond reste COMPTÉ
 * (`generated_from.protein_ceiling`, cause `protein_ceiling_over` de la garde
 * finale); plus rien ne le poursuit.
 *
 * ⚠️ LE MODULE ET SES TESTS RESTENT: la passe se rallume par cette constante,
 * pas par un revert. L'appelant écrit `ran: false, reason:
 * "ceiling_is_a_measure"` — un champ muet ressemblerait à une passe qui n'a
 * rien trouvé.
 */
export const PROTEIN_CEILING_PURSUED = false;

/** Le rôle d'une ligne dans ce module. `null` = elle ne bouge pas. */
export type CeilingRole = "donor" | "receiver";

/**
 * LE RÔLE D'UN GROUPE — la table lisible de l'arbitrage.
 *
 * ⚠️ UN GROUPE NE PEUT PAS ÊTRE LES DEUX. Aucun groupe n'est à la fois dans
 * `PROTEIN_GROUPS` et dans les féculents/gras, et le test le vérifie groupe par
 * groupe: une ligne qui donnerait ET recevrait rendrait le déplacement
 * indéterminé.
 */
export function ceilingRoleFor(group: FoodGroupRef | null): CeilingRole | null {
  if (group === null) return null;
  if (CEILING_DONOR_GROUPS.has(group)) return "donor";
  if (CEILING_STARCH_GROUPS.has(group) || ADDED_FAT_GROUPS.has(group)) return "receiver";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LES RÉGLAGES DE LA RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ÉNERGIE EST L'INVARIANT, ET UN INVARIANT SE MESURE.
 *
 * Le déplacement est calculé pour être neutre en énergie — les grammes rendus
 * au féculent valent exactement les kcal quittées par la protéine. Mais la
 * prédiction est LINÉAIRE et la mesure ne l'est pas toujours (friture,
 * absorption d'eau), et la grille du dixième de gramme laisse un résidu.
 *
 * ⛔ CE SEUIL SE COMPTE CONTRE LA MESURE D'ENTRÉE DE L'UNITÉ, jamais contre
 * celle du déplacement précédent. Un seuil par déplacement laisserait 40
 * déplacements dériver de 40 kcal en restant « dans la tolérance » à chaque
 * pas — le mode d'échec exact d'une garde qui compte le mauvais delta.
 */
export const KCAL_DRIFT_TOLERANCE = 5;

/** 200 déplacements par journée-bouche. Pas 201. */
export const MAX_MOVES_PER_MOUTH_DAY = 200;

/**
 * Sous ce gramme de protéine, ce n'est plus un progrès, c'est du bruit
 * d'arrondi. 0,05 g: très en dessous du dixième de gramme que le référentiel
 * rend, très au-dessus du bruit flottant.
 */
export const PROTEIN_TOLERANCE_G = 0.05;

/** Deux scores plus proches que ça sont ÉGAUX — et une égalité se départage par clé. */
const SCORE_EPSILON = 1e-9;

/**
 * LE MOT EXACT QUAND LA RECHERCHE S'ARRÊTE SANS AVOIR FERMÉ.
 *
 * ⛔ « pas trouvé », JAMAIS « impossible » — la même règle que chez son frère.
 * La recherche est gloutonne et bornée: son échec ne prouve rien sur
 * l'existence d'une solution dans ces mêmes bornes.
 */
export const NO_CEILING_SOLUTION = "plafond non atteint dans ces limites";

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QU'ON REÇOIT
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que pèse, ce que vaut et ce que porte en protéine une liste de lignes. */
export interface CeilingMeasure {
  readonly kcal: number | null;
  readonly readyG: number | null;
  readonly proteinG: number | null;
}

/** ⛔ `null` sur une grandeur = « on ne sait pas ». Jamais zéro par défaut. */
export type ProteinMeasureFn = (
  ingredients: readonly AdjustableIngredient[],
) => CeilingMeasure;

/**
 * CE QU'UNE BOUCHE TIRE D'UNE UNITÉ, UN JOUR DONNÉ.
 *
 * `share` est le prélèvement réel: le facteur de portion de cette bouche sur ce
 * plat, divisé par les tirages quand l'unité est une casserole. C'est la même
 * arithmétique que `consumersOfPlan`, multipliée par le facteur de la bouche.
 */
export interface CeilingPart {
  readonly unitId: string;
  readonly share: number;
  /**
   * ⛔ LA CASE DE CETTE PART N'A-T-ELLE QU'UN SEUL MANGEUR ? REQUIS, jamais
   * `?`. C'est LA garde du module: un défaut à `true` ferait toucher les plats
   * de table, c'est-à-dire la chose que ce lot interdit en premier.
   */
  readonly solo: boolean;
}

/**
 * UNE JOURNÉE-BOUCHE: ce qu'elle mange, et ce qu'elle a le droit de manger.
 *
 * ⚠️ `parts` PORTE LA JOURNÉE ENTIÈRE, partagé compris. C'est la seule façon
 * que le module mesure la protéine du JOUR — le chiffre que la garde finale
 * compare au plafond. Ne lui donner que les cases solo ferait viser un plafond
 * depuis un total amputé, donc s'arrêter trop tôt en se croyant fermé.
 */
export interface CeilingMouthDay {
  /**
   * ⛔ JAMAIS UN `member_id`. L'appelant passe un rang; rien de ce que ce module
   * rend ne doit pouvoir nommer une personne au journal.
   */
  readonly mouthKey: string;
  readonly dayToken: string;
  /** g de protéine par jour. `null` = pas de plafond lisible ⇒ pas d'ajustement. */
  readonly ceilingG: number | null;
  readonly parts: readonly CeilingPart[];
}

/** Pourquoi une ligne ne bouge pas. Aucune n'est silencieuse. */
export const CEILING_FIXED_REASONS = [
  /** L'appelant l'a verrouillée — une contrainte existante est prioritaire. */
  "caller_fixed",
  /** L'unité entière est déclarée non ajustable par l'appelant. */
  "unit_fixed",
  /** Groupe `water`: le traitement de l'eau n'est pas un levier. */
  "water",
  /** `condiment_grams` non nul: une pincée n'est pas un levier. */
  "condiment",
  /** Aucune quantité écrite. */
  "unweighed",
  /** La mesure injectée ne sait pas dire ce que cette ligne vaut. */
  "unmeasurable",
  /** La mesure ne bouge pas quand la quantité bouge: pas de conversion cru → cuit. */
  "no_yield",
  /** Le corps rigide qui la porte est déclaré immobile. */
  "component_locked",
  /** Aucun corps ne la porte: c'est un défaut de branchement de l'appelant. */
  "no_component",
  /** Ni donneuse ni receveuse: son groupe n'a pas de rôle ici. */
  "not_a_lever",
] as const;
export type CeilingFixedReason = (typeof CEILING_FIXED_REASONS)[number];

/** Pourquoi une unité est hors de portée. */
export const UNIT_SKIP_REASONS = [
  /** Au moins une part qui la cite vient d'une case à plusieurs mangeurs. */
  "shared_cell",
  /** Deux bouches différentes la citent. */
  "two_mouths",
  /** Aucune journée-bouche ne la cite: rien à y gagner. */
  "no_citation",
  /** L'appelant l'a déclarée non ajustable (méthode qui épelle ses grammes…). */
  "unit_fixed",
  /** La mesure injectée se tait sur elle. */
  "unmeasurable",
] as const;
export type UnitSkipReason = (typeof UNIT_SKIP_REASONS)[number];

// ═══════════════════════════════════════════════════════════════════════════
// ④ CE QU'ON REND
// ═══════════════════════════════════════════════════════════════════════════

export const CEILING_STOPS = [
  /** La journée est passée sous son plafond. */
  "closed",
  /** Elle n'était pas au-dessus: rien à faire. */
  "not_over",
  /** Pas de plafond lisible pour cette bouche. */
  "no_ceiling",
  /** La protéine de la journée ne se mesure pas. */
  "unmeasurable",
  /** Aucune unité touchable: tout ce qu'elle mange ce jour-là est partagé. */
  "no_solo_unit",
  /** Aucune ligne libre dans les unités touchables. */
  "all_fixed",
  /** Plus aucun déplacement ne baisse la protéine. */
  "no_improving_move",
  /** Le dernier déplacement possible a été fermé par un PLANCHER de donneuse. */
  "floor",
  /** …par un PLAFOND de receveuse. */
  "ceiling",
  /** 200 déplacements. */
  "move_budget",
  /** La mesure réelle a démenti la prédiction: le déplacement a été DÉFAIT. */
  "reverted_after_measure",
  /** L'énergie de l'unité a dérivé au-delà de `KCAL_DRIFT_TOLERANCE`. */
  "kcal_drift",
] as const;
export type CeilingStop = (typeof CEILING_STOPS)[number];

export interface CeilingMove {
  readonly index: number;
  readonly mouthKey: string;
  readonly dayToken: string;
  readonly unitId: string;
  readonly fromIngredientId: string;
  readonly toIngredientId: string;
  /** Les grammes CRUS retirés de la ligne protéique. */
  readonly donorG: number;
  /** Les grammes CRUS rendus au féculent ou au gras. */
  readonly receiverG: number;
  /** La protéine de la journée avant et après ce déplacement. */
  readonly proteinBeforeG: number;
  readonly proteinAfterG: number;
}

export interface CeilingMouthDayVerdict {
  readonly mouthKey: string;
  readonly dayToken: string;
  readonly ceilingG: number | null;
  readonly proteinBeforeG: number | null;
  readonly proteinAfterG: number | null;
  /** Au-dessus du plafond ET de la tolérance, avant / après. */
  readonly overBefore: boolean;
  readonly overAfter: boolean;
  readonly moves: number;
  /** Les grammes CRUS retirés des lignes protéiques, cumulés. */
  readonly movedG: number;
  readonly stop: CeilingStop;
  /** `NO_CEILING_SOLUTION` quand la recherche a cherché et pas fermé. */
  readonly note: string;
}

export interface ProteinCeilingAdjustResult {
  readonly outcome: "closed" | "nothing_to_do" | "not_found_within_limits";
  /**
   * Mêmes unités, mêmes lignes, même ordre qu'à l'entrée. C'est la forme que
   * `applyAdjustment` écrit dans le plan — celle de `proportion_adjust.ts`,
   * pour qu'il n'y ait qu'un seul écrivain de quantités dans ce dépôt.
   */
  readonly units: readonly AdjustedUnit[];
  readonly moves: readonly CeilingMove[];
  readonly mouthDays: readonly CeilingMouthDayVerdict[];
  /** Les unités que le module n'a pas eu le droit de toucher, et pourquoi. */
  readonly skippedUnits: readonly { readonly unitId: string; readonly reason: UnitSkipReason }[];
  readonly counts: {
    /** ⛔ LE DÉNOMINATEUR. « zéro dépassement » sur zéro journée ne dit rien. */
    readonly mouth_days_total: number;
    readonly mouth_days_without_ceiling: number;
    readonly mouth_days_unmeasurable: number;
    readonly mouth_days_over_before: number;
    /** LES TROIS COMPTEURS DU LOT. */
    readonly adjusted_mouth_days: number;
    readonly moved_g: number;
    readonly residual_over: number;
    readonly units_total: number;
    readonly units_touchable: number;
    readonly units_touched: number;
    readonly skipped_by_reason: Record<UnitSkipReason, number>;
    readonly lines_total: number;
    readonly lines_free: number;
    /**
     * ⛔ LE COÛT DE L'ÉCART AVEC LE LOT D, MESURÉ. Les lignes libres qui vivent
     * dans un corps rigide à PLUSIEURS lignes: celles que `proportion_adjust.ts`
     * n'aurait bougées qu'avec leurs voisines. Voir l'arbitrage écrit dans la
     * préparation des unités.
     */
    readonly lines_free_inside_body: number;
    readonly fixed_by_reason: Record<CeilingFixedReason, number>;
    readonly moves_total: number;
    /** La dérive d'énergie laissée sur les unités touchées, SIGNÉE. */
    readonly kcal_drift: number;
    /** La dérive de masse prête laissée sur les unités touchées, SIGNÉE. */
    readonly ready_drift_g: number;
    readonly reverted_after_measure: number;
    readonly measure_calls: number;
    readonly stopped: Record<CeilingStop, number>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE PETITE FONCTION QUE LES TESTS ET L'APPELANT PARTAGENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CETTE JOURNÉE DÉPASSE-T-ELLE SON PLAFOND, TOLÉRANCE COMPRISE ?
 *
 * ⛔ LA MÊME COMPARAISON QUE LA GARDE FINALE (`protein_ceiling_over`), et
 * `tolerance` est REQUISE. La garde compare `proteinG > ceilingG × (1 + t)`;
 * un module qui déclencherait sur un autre seuil réparerait des journées que
 * personne ne compte et en laisserait d'autres comptées sans les réparer.
 */
export function isOverCeiling(
  proteinG: number | null,
  ceilingG: number | null,
  tolerance: number,
): boolean {
  if (proteinG === null || ceilingG === null) return false;
  if (!Number.isFinite(proteinG) || !Number.isFinite(ceilingG) || !(ceilingG > 0)) return false;
  return proteinG > ceilingG * (1 + tolerance);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'AJUSTEUR
// ═══════════════════════════════════════════════════════════════════════════

interface WorkLine {
  readonly idx: number;
  readonly id: string;
  readonly term: string;
  readonly baseline: number;
  readonly beforeGrams: number;
  /**
   * ⛔ L'ÉTAT NON QUANTIFIÉ, ET IL N'EST PAS UN LUXE. Le déplacement est neutre
   * en énergie DANS LES RÉELS; la grille du dixième de gramme, elle, laisse un
   * résidu à chaque pas. Quantifier de proche en proche fait ACCUMULER ce
   * résidu: sur une receveuse à 9 kcal/g, un demi-dixième de gramme systématique
   * vaut 0,45 kcal par déplacement, soit tout le budget de dérive en onze
   * déplacements. En gardant l'état idéal à côté, l'écart entre ce qu'on écrit
   * et ce qu'on a calculé reste borné par un demi-dixième de gramme, quel que
   * soit le nombre de déplacements.
   */
  ideal: number;
  grams: number;
  readonly floor: number;
  readonly ceiling: number;
  readonly role: CeilingRole | null;
  fixed: boolean;
  fixedReason: CeilingFixedReason | null;
  /** kcal par gramme CRU ajouté, sondé DANS le contexte de l'unité. */
  dKcal: number;
  /** g de protéine par gramme CRU ajouté. */
  dProtein: number;
  /** g prêts par gramme CRU ajouté — la conversion cru ↔ cuit. */
  dReady: number;
}

interface WorkUnit {
  readonly unit: AdjustableUnit;
  readonly lines: WorkLine[];
  readonly entry: CeilingMeasure;
  measure: CeilingMeasure;
  touched: boolean;
  touchable: boolean;
  skipReason: UnitSkipReason | null;
}

/**
 * LA GRILLE DU DIXIÈME DE GRAMME, AU PLUS PROCHE, RABATTUE DANS LES BORNES.
 *
 * ⛔ AU PLUS PROCHE, ET PAS « VERS LE POINT DE DÉPART » comme chez son frère.
 * Le frère conserve une MASSE et arrondit le bout donneur vers son départ pour
 * ne jamais dépasser le pas demandé; ici l'invariant est l'ÉNERGIE, et arrondir
 * les deux bouts dans la même direction ferait fondre le plan déplacement après
 * déplacement. Au plus proche, le résidu change de signe et ne s'accumule pas.
 *
 * ⛔ LA BORNE GAGNE CONTRE LA GRILLE, toujours: un plafond à 18,75 g (125 % de
 * 15) doit rester atteignable exactement, sans quoi le journal dirait 1,2466 là
 * où la convention produit dit 1,25.
 */
function onGrid(target: number, floor: number, ceiling: number): number {
  const q = Math.round((Math.round(target / GRAMS_QUANTUM) * GRAMS_QUANTUM) * 10000) / 10000;
  return Math.min(ceiling, Math.max(floor, q));
}

/**
 * LA PASSE. Pure: ne touche à rien, rend les nouvelles quantités et tout ce
 * qu'il faut pour les appliquer et les contrôler.
 */
export function adjustProteinCeiling(args: {
  readonly units: readonly AdjustableUnit[];
  readonly mouthDays: readonly CeilingMouthDay[];
  readonly measure: ProteinMeasureFn;
  /**
   * ⛔ REQUISE, JAMAIS `?`. `PROTEIN_CEILING_TOLERANCE` de `final_plan_gate.ts`.
   * Voir `isOverCeiling`.
   */
  readonly tolerance: number;
}): ProteinCeilingAdjustResult {
  let measureCalls = 0;
  const measure = (ings: readonly AdjustableIngredient[]): CeilingMeasure => {
    measureCalls++;
    const m = args.measure(ings);
    return { kcal: m.kcal, readyG: m.readyG, proteinG: m.proteinG };
  };

  const fixedByReason = Object.fromEntries(
    CEILING_FIXED_REASONS.map((r) => [r, 0]),
  ) as Record<CeilingFixedReason, number>;
  const skippedByReason = Object.fromEntries(
    UNIT_SKIP_REASONS.map((r) => [r, 0]),
  ) as Record<UnitSkipReason, number>;
  const stopped = Object.fromEntries(
    CEILING_STOPS.map((s) => [s, 0]),
  ) as Record<CeilingStop, number>;
  let linesTotal = 0;
  let linesFreeInsideBody = 0;

  // ── ① QUI CITE QUOI — LA GARDE DU PLAT PARTAGÉ, AVANT TOUTE MESURE ───────
  // ⛔ DEUX ENSEMBLES ET PAS UN BOOLÉEN. « une case à deux mangeurs » et « deux
  // bouches citent cette casserole » sont deux défauts différents: le premier
  // est une décision du foyer, le second un branchement qui a mélangé deux
  // journées. Les fondre rendrait le même chiffre pour les deux.
  const citedByMouth = new Map<string, Set<string>>();
  const sharedCited = new Set<string>();
  for (const md of args.mouthDays) {
    for (const p of md.parts) {
      if (!p.solo) {
        sharedCited.add(p.unitId);
        continue;
      }
      const set = citedByMouth.get(p.unitId) ?? new Set<string>();
      set.add(md.mouthKey);
      citedByMouth.set(p.unitId, set);
    }
  }

  // ── ② PRÉPARER CHAQUE UNITÉ: bornes, mesure d'entrée, marginaux ──────────
  const wunits: WorkUnit[] = args.units.map((unit) => {
    const live = unit.ingredients.map((ing) => ({ ...ing }));
    const entry = measure(live);

    let skipReason: UnitSkipReason | null = null;
    if (sharedCited.has(unit.unitId)) skipReason = "shared_cell";
    else if (!citedByMouth.has(unit.unitId)) skipReason = "no_citation";
    else if ((citedByMouth.get(unit.unitId) ?? new Set()).size > 1) skipReason = "two_mouths";
    else if (!unit.adjustable) skipReason = "unit_fixed";
    else if (entry.kcal === null || entry.proteinG === null) skipReason = "unmeasurable";

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT D — QUI PORTE QUOI, ET L'ARBITRAGE DONT CE MODULE S'ÉCARTE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN CORPS `movable: false` EST FIXE, LIGNE PAR LIGNE, et une ligne
    // qu'aucun corps ne porte l'est aussi. C'est le cas où l'on ne sait RIEN de
    // la structure du plat — contrat absent, rôle inconnu, lien ambigu — et le
    // défaut du dépôt y est conservateur. Il le reste ici.
    //
    // ⚠️ MAIS DANS UN CORPS MOBILE, CE MODULE TRAITE CHAQUE LIGNE COMME UN
    // LEVIER, et c'est un écart ASSUMÉ avec `proportion_adjust.ts`, qui ne fait
    // bouger un corps qu'en entier, par un facteur commun.
    //
    // La raison est une MESURE, pas une préférence. Sur le brouillon réel
    // `6e4e5548` (2026-09-22), le modèle déclare des composants très grossiers:
    // les cinq petits déjeuners de la bouche en dépassement portent UN SEUL
    // composant `main` couvrant leurs trois ou quatre lignes, et les deux
    // collations un `main` plus un `garnish_fat` qui lui est soudé. Un corps
    // par plat, donc. Or mettre un corps entier à l'échelle ne change RIEN à sa
    // protéine par kcal: la règle du facteur commun, appliquée ici, rendrait ce
    // lot inerte sur les cases mêmes qu'il existe pour réparer — construit,
    // branché, désarmé.
    //
    // ⚠️ ET CE N'EST PAS LE MÊME GESTE QUE CELUI QUE LE LOT D A ENCADRÉ. Le lot
    // D ajuste une DENSITÉ, et il a pour ça un levier moins cher: changer le
    // rapport entre le plat principal et son accompagnement. Le plafond
    // protéique n'en a aucun — l'énergie qui quitte le yaourt doit atterrir
    // dans l'avoine du MÊME bol. Le coût de l'écart se compte:
    // `lines_free_inside_body` dit combien de lignes ont été libérées à
    // l'intérieur d'un corps qui en porte plusieurs.
    const inAnyBody = new Set<string>();
    const inMovableBody = new Set<string>();
    const inMultiLineBody = new Set<string>();
    for (const b of unit.bodies) {
      for (const id of b.lineIds) {
        inAnyBody.add(id);
        if (b.movable) inMovableBody.add(id);
        if (b.movable && b.lineIds.length > 1) inMultiLineBody.add(id);
      }
    }

    const lines: WorkLine[] = unit.ingredients.map((ing, i) => {
      linesTotal++;
      const baseline = Number(ing.baselineGrams);
      const grams = Number(ing.grams);
      const { floor, ceiling } = ratioBoundsFor(ing.group);
      const role = ceilingRoleFor(ing.group);
      let reason: CeilingFixedReason | null = null;
      // ⚠️ L'ORDRE EST CELUI DE `proportion_adjust.ts`, et il n'est pas
      // cosmétique: `water` porte AUSSI un `condiment_grams` dans le vrai
      // référentiel. Le motif qui doit apparaître au journal est celui que la
      // convention produit nomme.
      if (!unit.adjustable) reason = "unit_fixed";
      else if (ing.fixed) reason = "caller_fixed";
      else if (ing.group !== null && FIXED_GROUPS.has(ing.group)) reason = "water";
      else if (ing.isCondiment) reason = "condiment";
      else if (
        ing.grams === null || ing.baselineGrams === null ||
        !Number.isFinite(grams) || !Number.isFinite(baseline) ||
        !(grams > 0) || !(baseline > 0)
      ) reason = "unweighed";
      else if (role === null) reason = "not_a_lever";
      else if (!inAnyBody.has(ing.ingredientId)) reason = "no_component";
      else if (!inMovableBody.has(ing.ingredientId)) reason = "component_locked";
      return {
        idx: i,
        id: ing.ingredientId,
        term: ing.term,
        baseline: Number.isFinite(baseline) ? baseline : Number.NaN,
        beforeGrams: Number.isFinite(grams) ? grams : Number.NaN,
        ideal: Number.isFinite(grams) ? grams : Number.NaN,
        grams: Number.isFinite(grams) ? grams : Number.NaN,
        floor: baseline * floor,
        ceiling: baseline * ceiling,
        role,
        fixed: reason !== null,
        fixedReason: reason,
        dKcal: 0,
        dProtein: 0,
        dReady: 0,
      };
    });

    // ── LES MARGINAUX, PAR DIFFÉRENCE FINIE SUR LA LISTE ENTIÈRE ───────────
    // ⛔ Pas `mesure([ligne seule])`: la règle de l'eau d'une casserole dépend
    // de la PRÉSENCE d'un grain absorbant, donc du reste de la liste.
    if (
      skipReason === null && entry.kcal !== null && entry.readyG !== null &&
      entry.proteinG !== null
    ) {
      for (const w of lines) {
        if (w.fixed) continue;
        const bumped = live.map((ing, i) =>
          i === w.idx ? { ...ing, grams: w.grams + PROBE_RAW_G } : ing
        );
        const m = measure(bumped);
        if (m.kcal === null || m.readyG === null || m.proteinG === null) {
          w.fixed = true;
          w.fixedReason = "unmeasurable";
          continue;
        }
        const dReady = (m.readyG - entry.readyG) / PROBE_RAW_G;
        if (!(dReady > 1e-9)) {
          w.fixed = true;
          w.fixedReason = "no_yield";
          continue;
        }
        w.dKcal = (m.kcal - entry.kcal) / PROBE_RAW_G;
        w.dProtein = (m.proteinG - entry.proteinG) / PROBE_RAW_G;
        w.dReady = dReady;
      }
    } else {
      for (const w of lines) {
        if (w.fixed) continue;
        w.fixed = true;
        w.fixedReason = "unmeasurable";
      }
    }

    for (const w of lines) {
      if (w.fixedReason !== null) fixedByReason[w.fixedReason]++;
      else if (inMultiLineBody.has(w.id)) linesFreeInsideBody++;
    }
    if (skipReason !== null) skippedByReason[skipReason]++;

    return {
      unit,
      lines,
      entry,
      measure: entry,
      touched: false,
      touchable: skipReason === null,
      skipReason,
    };
  });

  const byUnitId = new Map<string, WorkUnit>();
  for (const wu of wunits) byUnitId.set(wu.unit.unitId, wu);

  // ── ③ LA PROTÉINE D'UNE JOURNÉE-BOUCHE ───────────────────────────────────
  // ⛔ SUR LA JOURNÉE ENTIÈRE, partagé compris. C'est le chiffre que la garde
  // finale compare au plafond; en mesurer un autre ferait viser un plafond
  // depuis un total amputé.
  const proteinOf = (md: CeilingMouthDay): number | null => {
    let total = 0;
    for (const p of md.parts) {
      const wu = byUnitId.get(p.unitId);
      if (wu === undefined) return null;
      if (wu.measure.proteinG === null) return null;
      total += p.share * wu.measure.proteinG;
    }
    return total;
  };

  const proteinBefore = new Map<string, number | null>();
  const mdKey = (md: CeilingMouthDay) => `${md.mouthKey}|${md.dayToken}`;
  for (const md of args.mouthDays) proteinBefore.set(mdKey(md), proteinOf(md));

  // ── ④ LA BOUCLE, JOURNÉE-BOUCHE PAR JOURNÉE-BOUCHE ───────────────────────
  const moves: CeilingMove[] = [];
  const verdicts: CeilingMouthDayVerdict[] = [];
  let revertedAfterMeasure = 0;
  let movedG = 0;
  let withoutCeiling = 0;
  let unmeasurableDays = 0;
  let overBeforeCount = 0;

  // ⛔ UN ORDRE STABLE. Deux journées-bouche peuvent partager une casserole
  // solo (même bouche, deux jours): l'ordre de traitement change alors le
  // résultat, et un résultat qui dépend de l'ordre d'une `Map` n'est pas
  // reproductible.
  const ordered = [...args.mouthDays].sort((a, b) =>
    mdKey(a) < mdKey(b) ? -1 : mdKey(a) > mdKey(b) ? 1 : 0
  );

  for (const md of ordered) {
    const key = mdKey(md);
    const before = proteinBefore.get(key) ?? null;
    const overBefore = isOverCeiling(before, md.ceilingG, args.tolerance);
    if (overBefore) overBeforeCount++;

    let stop: CeilingStop;
    let moveCount = 0;
    let movedHere = 0;

    const touchable = md.parts
      .filter((p) => p.solo && (byUnitId.get(p.unitId)?.touchable ?? false))
      .map((p) => ({ part: p, wu: byUnitId.get(p.unitId)! }));

    if (md.ceilingG === null) {
      withoutCeiling++;
      stop = "no_ceiling";
    } else if (before === null) {
      unmeasurableDays++;
      stop = "unmeasurable";
    } else if (!overBefore) {
      stop = "not_over";
    } else if (touchable.length === 0) {
      stop = "no_solo_unit";
    } else if (!touchable.some(({ wu }) => wu.lines.some((w) => !w.fixed))) {
      stop = "all_fixed";
    } else {
      stop = "closed";
      let cur = before;
      const target = md.ceilingG;
      while (true) {
        if (cur <= target + PROTEIN_TOLERANCE_G) {
          stop = "closed";
          break;
        }
        if (moveCount >= MAX_MOVES_PER_MOUTH_DAY) {
          stop = "move_budget";
          break;
        }

        type Cand = {
          key: string;
          wu: WorkUnit;
          share: number;
          donor: WorkLine;
          receiver: WorkLine;
          /** L'état IDÉAL visé — celui qui garde l'énergie exactement neutre. */
          donorIdeal: number;
          receiverIdeal: number;
          /** Ce qu'on ÉCRIT: l'idéal, sur la grille, dans les bornes. */
          donorNew: number;
          receiverNew: number;
          m: CeilingMeasure;
          protein: number;
        };
        const cands: Cand[] = [];
        let floorBlocked = false;
        let ceilingBlocked = false;

        for (const { part, wu } of touchable) {
          const share = part.share;
          if (!(share > 0)) continue;
          const donors = wu.lines.filter((w) => !w.fixed && w.role === "donor" && w.dProtein > 0);
          const receivers = wu.lines.filter((w) => !w.fixed && w.role === "receiver" && w.dKcal > 0);
          if (donors.length === 0 || receivers.length === 0) continue;
          for (const donor of donors) {
            const room = donor.ideal - donor.floor;
            if (!(room > 1e-9)) {
              floorBlocked = true;
              continue;
            }
            for (const receiver of receivers) {
              if (receiver.id === donor.id) continue;
              const headroom = receiver.ceiling - receiver.ideal;
              if (!(headroom > 1e-9)) {
                ceilingBlocked = true;
                continue;
              }
              // ── LE PAS: 5 g CUITS sur la donneuse, rabattus par les bornes ─
              let donorDelta = Math.min(MOVE_COOKED_G / donor.dReady, room);
              // ⛔ L'ÉNERGIE EST L'INVARIANT: la receveuse reçoit EXACTEMENT les
              // kcal que la donneuse a lâchées. Si son plafond ne les accepte
              // pas toutes, c'est la DONNEUSE qui descend moins — jamais
              // l'énergie qui s'évapore.
              const capByCeiling = (headroom * receiver.dKcal) / donor.dKcal;
              if (donorDelta > capByCeiling) {
                donorDelta = capByCeiling;
                ceilingBlocked = true;
              }
              // ── LE PAS QUI AMÈNE LA JOURNÉE PILE SUR SON PLAFOND ─────────
              // ⛔ LA PROTÉINE NETTE, PAS CELLE DE LA DONNEUSE. Un flocon
              // d'avoine porte de la protéine: ignorer celle de la receveuse
              // ferait viser un plafond qu'on n'atteint jamais.
              const netPerG = donor.dProtein -
                (donor.dKcal / receiver.dKcal) * receiver.dProtein;
              if (!(netPerG > 1e-12)) continue;
              const closing = (cur - target) / (share * netPerG);
              if (closing > 0 && closing < donorDelta) {
                donorDelta = Math.min(
                  Math.max(MIN_MOVE_COOKED_G / donor.dReady, closing),
                  room,
                  capByCeiling,
                );
              }
              if (!(donorDelta > 1e-9)) continue;
              const donorIdeal = donor.ideal - donorDelta;
              const receiverIdeal = receiver.ideal +
                (donorDelta * donor.dKcal) / receiver.dKcal;
              const donorNew = onGrid(donorIdeal, donor.floor, donor.ceiling);
              const receiverNew = onGrid(receiverIdeal, receiver.floor, receiver.ceiling);
              // ⚠️ LA PRÉDICTION SE FAIT SUR CE QU'ON ÉCRIT, pas sur l'idéal:
              // c'est la ligne quantifiée que la mesure lira, et un déplacement
              // qui ne bouge aucun dixième de gramme ne change rien à mesurer.
              const donorMoved = donor.grams - donorNew;
              const receiverMoved = receiverNew - receiver.grams;
              if (Math.abs(donorMoved) < 1e-9 && Math.abs(receiverMoved) < 1e-9) continue;

              const dProtein = receiverMoved * receiver.dProtein -
                donorMoved * donor.dProtein;
              const kcal = wu.measure.kcal === null ? null : wu.measure.kcal +
                receiverMoved * receiver.dKcal - donorMoved * donor.dKcal;
              const readyG = wu.measure.readyG === null ? null : wu.measure.readyG +
                receiverMoved * receiver.dReady - donorMoved * donor.dReady;
              const proteinG = wu.measure.proteinG === null
                ? null
                : wu.measure.proteinG + dProtein;
              const nextDayProtein = cur + share * dProtein;
              if (!(nextDayProtein < cur - SCORE_EPSILON)) continue;

              // ══════════════════════════════════════════════════════════════
              // ⛔ IL N'Y A PAS DE GARDE DE DÉGRADATION ICI, ET C'EST DÉMONTRÉ
              // ══════════════════════════════════════════════════════════════
              //
              // `proportion_adjust.ts` en a une (`rejected_would_degrade`):
              // une portion conforme peut sortir de son couloir de densité dans
              // LES DEUX SENS, donc fermer un défaut peut en ouvrir un autre.
              // Ici, non: un déplacement accepté a `dProtein < 0`, et toute
              // autre journée qui cite la même unité la voit avec une part
              // POSITIVE — sa protéine ne peut donc que BAISSER elle aussi.
              // Une garde qui ne peut pas mordre est une décoration, et ce
              // dépôt paie assez cher les gardes désarmées pour ne pas en
              // écrire une exprès.
              //
              // ⚠️ ET LE PLANCHER NON PLUS N'EST PAS EN DANGER: la recherche
              // s'arrête AU PLAFOND (`target`), jamais en dessous, et le
              // plancher le plus haut du dépôt est 1,6 g/kg (`muscle_gain`)
              // contre 2,0 g/kg au plafond (`meal_envelope.ts`). Le jour où ces
              // deux constantes se croisent, cette phrase devient fausse — et
              // c'est pour ça qu'elle nomme les deux.
              cands.push({
                key: `${wu.unit.unitId}|${donor.id}>${receiver.id}`,
                wu,
                share,
                donor,
                receiver,
                donorIdeal,
                receiverIdeal,
                donorNew,
                receiverNew,
                m: { kcal, readyG, proteinG },
                protein: nextDayProtein,
              });
            }
          }
        }

        // ── LE CHOIX: le meilleur, l'égalité départagée par clé ─────────────
        let best: Cand | null = null;
        for (const c of cands) {
          if (best === null) {
            best = c;
            continue;
          }
          const d = c.protein - best.protein;
          if (d < -SCORE_EPSILON) best = c;
          else if (Math.abs(d) <= SCORE_EPSILON && c.key < best.key) best = c;
        }
        if (best === null) {
          stop = floorBlocked
            ? "floor"
            : ceilingBlocked
            ? "ceiling"
            : "no_improving_move";
          break;
        }

        // ── APPLIQUER, PUIS REMESURER POUR DE VRAI ────────────────────────
        const b = best;
        const keepDonor = b.donor.grams;
        const keepReceiver = b.receiver.grams;
        const keepDonorIdeal = b.donor.ideal;
        const keepReceiverIdeal = b.receiver.ideal;
        const keepMeasure = b.wu.measure;
        b.donor.ideal = b.donorIdeal;
        b.receiver.ideal = b.receiverIdeal;
        b.donor.grams = b.donorNew;
        b.receiver.grams = b.receiverNew;
        const applied = measure(
          b.wu.unit.ingredients.map((ing, i) => {
            const w = b.wu.lines[i];
            return w.fixed ? ing : { ...ing, grams: w.grams };
          }),
        );
        b.wu.measure = applied;
        const after = proteinOf(md);
        const drift = applied.kcal === null || b.wu.entry.kcal === null
          ? null
          : applied.kcal - b.wu.entry.kcal;
        const kcalBroke = drift === null || Math.abs(drift) > KCAL_DRIFT_TOLERANCE;
        if (after === null || !(after < cur - SCORE_EPSILON) || kcalBroke) {
          // La mesure réelle dément la prédiction: on DÉFAIT.
          b.donor.grams = keepDonor;
          b.receiver.grams = keepReceiver;
          b.donor.ideal = keepDonorIdeal;
          b.receiver.ideal = keepReceiverIdeal;
          b.wu.measure = keepMeasure;
          if (kcalBroke && after !== null && after < cur - SCORE_EPSILON) {
            stop = "kcal_drift";
          } else {
            revertedAfterMeasure++;
            stop = "reverted_after_measure";
          }
          break;
        }

        b.wu.touched = true;
        moveCount++;
        const donorG = Math.round((keepDonor - b.donorNew) * 10000) / 10000;
        movedHere += donorG;
        movedG += donorG;
        moves.push({
          index: moves.length + 1,
          mouthKey: md.mouthKey,
          dayToken: md.dayToken,
          unitId: b.wu.unit.unitId,
          fromIngredientId: b.donor.id,
          toIngredientId: b.receiver.id,
          donorG,
          receiverG: Math.round((b.receiverNew - keepReceiver) * 10000) / 10000,
          proteinBeforeG: Math.round(cur * 100) / 100,
          proteinAfterG: Math.round(after * 100) / 100,
        });
        cur = after;
      }
    }

    const afterProtein = proteinOf(md);
    stopped[stop]++;
    verdicts.push({
      mouthKey: md.mouthKey,
      dayToken: md.dayToken,
      ceilingG: md.ceilingG,
      proteinBeforeG: before === null ? null : Math.round(before * 100) / 100,
      proteinAfterG: afterProtein === null ? null : Math.round(afterProtein * 100) / 100,
      overBefore,
      overAfter: isOverCeiling(afterProtein, md.ceilingG, args.tolerance),
      moves: moveCount,
      movedG: Math.round(movedHere * 100) / 100,
      stop,
      note: overBefore && isOverCeiling(afterProtein, md.ceilingG, args.tolerance)
        ? NO_CEILING_SOLUTION
        : "",
    });
  }

  // ── ⑤ LES UNITÉS RENDUES ─────────────────────────────────────────────────
  let kcalDrift = 0;
  let readyDrift = 0;
  const outUnits: AdjustedUnit[] = wunits.map((wu) => {
    if (wu.touched) {
      if (wu.measure.kcal !== null && wu.entry.kcal !== null) {
        kcalDrift += wu.measure.kcal - wu.entry.kcal;
      }
      if (wu.measure.readyG !== null && wu.entry.readyG !== null) {
        readyDrift += wu.measure.readyG - wu.entry.readyG;
      }
    }
    const ingredients: AdjustedIngredient[] = wu.unit.ingredients.map((ing, i) => {
      const w = wu.lines[i];
      const moved = !w.fixed && Math.abs(w.grams - w.beforeGrams) > 1e-9;
      // ⛔ PAS DE REQUANTIFICATION ICI. L'état courant est DÉJÀ sur la grille du
      // dixième de gramme, ou EXACTEMENT sur une borne — et une borne n'est pas
      // sur la grille. On n'efface que le bruit flottant.
      const grams = w.fixed ? ing.grams : Math.round(w.grams * 10000) / 10000;
      return {
        ingredientId: ing.ingredientId,
        term: ing.term,
        baselineGrams: ing.baselineGrams,
        beforeGrams: ing.grams,
        grams: moved ? grams : ing.grams,
        ratioToBaseline: ing.baselineGrams !== null && ing.baselineGrams > 0 && grams !== null
          ? Math.round((grams / ing.baselineGrams) * 10000) / 10000
          : null,
        floorGrams: Number.isFinite(w.floor) ? Math.round(w.floor * 1000) / 1000 : null,
        ceilingGrams: Number.isFinite(w.ceiling) ? Math.round(w.ceiling * 1000) / 1000 : null,
        fixed: w.fixed,
        // ⚠️ LE VOCABULAIRE DE CE MODULE N'EST PAS CELUI DE SON FRÈRE: deux
        // motifs lui sont propres. `AdjustedIngredient.fixedReason` est typé sur
        // le vocabulaire de `proportion_adjust.ts`, et l'écrivain de quantités
        // (`applyAdjustment`) ne le lit pas. Le motif exact vit dans
        // `counts.fixed_by_reason`, qui est LU et journalisé.
        fixedReason: null,
      };
    });
    return {
      unitId: wu.unit.unitId,
      kind: wu.unit.kind,
      componentId: null,
      adjustable: wu.unit.adjustable,
      fixedReason: wu.unit.fixedReason,
      before: { kcal: wu.entry.kcal, readyG: wu.entry.readyG },
      after: { kcal: wu.measure.kcal, readyG: wu.measure.readyG },
      touched: wu.touched,
      ingredients,
    };
  });

  const adjustedMouthDays = verdicts.filter((v) => v.moves > 0).length;
  const residualOver = verdicts.filter((v) => v.overAfter).length;
  const anyOver = verdicts.some((v) => v.overBefore);

  return {
    outcome: !anyOver ? "nothing_to_do" : residualOver > 0 ? "not_found_within_limits" : "closed",
    units: outUnits,
    moves,
    mouthDays: verdicts,
    skippedUnits: wunits
      .filter((wu) => wu.skipReason !== null)
      .map((wu) => ({ unitId: wu.unit.unitId, reason: wu.skipReason! })),
    counts: {
      mouth_days_total: args.mouthDays.length,
      mouth_days_without_ceiling: withoutCeiling,
      mouth_days_unmeasurable: unmeasurableDays,
      mouth_days_over_before: overBeforeCount,
      adjusted_mouth_days: adjustedMouthDays,
      moved_g: Math.round(movedG * 100) / 100,
      residual_over: residualOver,
      units_total: wunits.length,
      units_touchable: wunits.filter((wu) => wu.touchable).length,
      units_touched: wunits.filter((wu) => wu.touched).length,
      skipped_by_reason: skippedByReason,
      lines_total: linesTotal,
      lines_free: wunits.reduce((n, wu) => n + wu.lines.filter((w) => !w.fixed).length, 0),
      lines_free_inside_body: linesFreeInsideBody,
      fixed_by_reason: fixedByReason,
      moves_total: moves.length,
      kcal_drift: Math.round(kcalDrift * 1000) / 1000,
      ready_drift_g: Math.round(readyDrift * 1000) / 1000,
      reverted_after_measure: revertedAfterMeasure,
      measure_calls: measureCalls,
      stopped,
    },
  };
}
