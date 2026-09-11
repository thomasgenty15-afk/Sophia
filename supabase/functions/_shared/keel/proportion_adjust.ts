/**
 * AJUSTER LES PROPORTIONS D'UNE RECETTE — dans les deux directions, sans appel
 * modèle.
 *
 * ── LE PROBLÈME, MESURÉ (2026-09-11, `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`) ──
 * Deux plans réels, six appels modèle. Le premier jet écrit des recettes dont la
 * DENSITÉ ne tient pas dans le couloir demandé:
 *
 *   · PERTE, `prep_poulet_quinoa` + yaourt + citron: **105,4 kcal/100 g mesurés**
 *     pour un minimum de **123**. La même casserole est tirée par DEUX autres
 *     assiettes, qui demandent **141** (119,9 et 125,5 mesurés).
 *   · GAIN, `prep_lentil_ratatouille` + pain + feta: **92,2** pour un minimum de **146**.
 *
 * La réponse du moteur était: un appel modèle de rattrapage. Deux, en fait. Ils
 * coûtent 65 à 114 secondes chacun, ils représentent **59 % à 72 %** de la durée
 * totale des deux plans, et sur ces deux cas-là ils n'ont PAS fermé le défaut
 * visé (105,4 → 118,4 contre 123; 92,2 → 139,0 contre 146). Le modèle allait
 * dans le bon sens — « réduire les légumes aqueux, augmenter l'huile » — et
 * s'arrêtait trop tôt, parce qu'il devine une table qu'on ne lui donne pas.
 *
 * Or ce geste-là est de l'arithmétique. Le moteur connaît la densité de chaque
 * ligne par le référentiel. Ce module la fait, déterministe, sans latence et
 * sans variance.
 *
 * ── CE QUE FAIT CE MODULE, ET DE QUI IL EST LE FRÈRE ───────────────────────
 * `box_densify.ts` déplace des grammes entre les items d'UNE BOÎTE, à masse
 * constante, vers le plus dense. Ce module fait le même geste **un cran plus
 * bas** — entre les INGRÉDIENTS d'une recette — et **dans les deux sens**:
 * densifier quand la portion cible ne tient pas dans l'assiette, alléger quand
 * elle est trop dense. Il ne remplace pas `densifyBoxes`: celui-là ferme un
 * écart de kcal dans un volume déjà servi, celui-ci change la recette AVANT que
 * les portions et les boîtes n'en soient tirées.
 *
 * ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
 * ⛔ Il n'AJOUTE, ne SUPPRIME et ne REMPLACE aucun ingrédient. La liste rendue a
 * exactement les mêmes lignes, dans le même ordre, avec les mêmes identifiants:
 * seules les quantités bougent. Une recomposition — changer un aliment, changer
 * un plat — reste le travail du modèle, et ce module DIT ce qu'il lui reste à
 * faire (`remaining`, `fixedUnits`).
 *
 * ⛔ Il ne recalcule ni les portions, ni les boîtes, ni les courses, ni les
 * instructions. Il rend les nouvelles quantités et les mesures; c'est
 * l'appelant qui rejoue le dimensionnement et qui CONTRÔLE le résultat appliqué.
 *
 * ── IL EST PUR, ET IL REÇOIT SA MESURE PAR INJECTION ───────────────────────
 * ⛔ Ce module n'importe RIEN du moteur de mesure — ni `food_composition.ts`, ni
 * `plan_energy.ts`, ni `preparation_mass.ts`. Il reçoit une `MeasureFn`. Deux
 * raisons, et la seconde compte autant que la première: il reste testable sans
 * base et sans référentiel, et il ne fige pas la règle de l'eau, du rendement ou
 * de l'escompte d'Atwater — celle de l'appelant est la bonne par construction.
 * Seul `FoodGroupRef` est importé: c'est le VOCABULAIRE des groupes, pas une
 * mesure, et les tables de bornes ci-dessous sont indexées dessus pour qu'un
 * slug inventé ne compile pas.
 *
 * ── LES BORNES SONT DES CONVENTIONS PRODUIT, PAS DES RÉGLAGES ──────────────
 * Elles sont exportées, nommées et testées une par une, dans les deux sens, avec
 * un cas qui MORD et un cas qui PASSE À CÔTÉ. Le rattachement d'un groupe à sa
 * bande est un arbitrage: il se lit dans `ratioBoundsFor`.
 *
 * ⛔ LES RATIOS SE RAPPORTENT TOUJOURS À LA RECETTE INITIALE ACCEPTÉE. Jamais à
 * l'état courant. Deux passes de ×1,5 ne font pas ×2,25: chaque ingrédient
 * porte son `baselineGrams`, l'appelant le fait passer d'une passe à l'autre
 * SANS le réécrire, et les bornes en descendent. C'est la seule chose que
 * l'appelant peut casser en silence; le compteur `already_outside_bounds` voit
 * le cas inverse (un état courant déjà hors de ses bornes), pas celui-là.
 *
 * ── DEUX FAMILLES DE DÉPLACEMENT, ET LA SECONDE EST UN ARBITRAGE ───────────
 * ① APPARIÉ — 5 g cuits passent d'une ligne à une autre DANS LA MÊME UNITÉ. La
 *    masse cuite de l'unité ne bouge pas: c'est `densifyBoxes`, un cran plus bas.
 * ② UNILATÉRAL — une ligne monte ou descend seule; la recette pèse plus, ou
 *    moins. ⚠️ Une BOÎTE a un volume servi, donc une masse à conserver. Une
 *    RECETTE n'en a pas: `sizeDishForMouth` la remet ensuite à l'échelle, et
 *    seuls ses RAPPORTS comptent — ce sont eux que les bornes encadrent.
 *    Mesuré sur le cas réel PERTE: avec les seuls appariés, la meilleure densité
 *    atteignable est **120,6 kcal/100 g contre 123 demandés** — le lot raterait
 *    son objet pour 2,4 kcal/100 g. Les deux familles sont comptées séparément
 *    (`moves_paired`, `moves_one_sided`).
 *
 * ── CE QUE ÇA DONNE SUR LE CAS RÉEL (2026-09-11, hors ligne, zéro appel) ───
 * PERTE, la casserole tirée par trois assiettes: 105,4 → 123,1 (min 123),
 * 119,9 → 146,1 (min 141), 125,5 → 145,9 (min 141). **Fermé**, 70 déplacements,
 * 89 appels de mesure, **4,2 ms** de médiane sur 20 tours. Aucune portion
 * conforme dégradée. À comparer aux 65 à 114 secondes d'un rattrapage modèle.
 *
 * GAIN, la casserole de lentilles: 92,2 → 129,7 pour un minimum de 146.
 * **Pas fermé**, et le module le DIT (`NO_SOLUTION_WITHIN_LIMITS`). La raison
 * est chiffrée: 500 g d'eau sur 1 500 g de casserole, à zéro kcal, et l'eau est
 * fixe. Avec la même recette et les mêmes bornes, mais l'eau comptée comme
 * ABSORBÉE — ce que `preparation_mass.ts` apporte — le même cas se ferme à
 * 146,8 en 14 déplacements. L'écart n'était pas une limite de l'ajustement,
 * c'était une limite de la MESURE.
 *
 * ── APRÈS: CE QUE L'APPELANT DOIT FAIRE, ET IL N'A PAS LE CHOIX ────────────
 * Une recette ajustée invalide sa mesure précédente. L'appelant DOIT, dans cet
 * ordre: réécrire les quantités structurées des lignes rendues, recalculer les
 * portions et les boîtes, recalculer les courses, régénérer les quantités citées
 * dans les instructions, puis REMESURER les portions écrites et rejouer les
 * gardes alimentaires. Ce module rend tout ce qu'il faut pour ça — `units`
 * (nouvelles quantités et mesures avant/après), `consumers` (densités avant et
 * après, par assiette), `remaining` (ce qui reste à faire faire au modèle, avec
 * ses unités), `fixedUnits` (ce qu'il n'a pas eu le droit de toucher) — et rien
 * de plus: aucune de ces écritures ne lui appartient.
 */
import type { FoodGroupRef } from "./tokens.ts";
import type { RigidBody } from "./culinary_structure.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES BORNES — conventions produit, versionnées ici
// ═══════════════════════════════════════════════════════════════════════════

/** Les légumes ne descendent jamais sous ça: densifier ne vide pas l'assiette. */
export const VEG_FLOOR_RATIO = 0.70;
/** Le plancher de tous les autres. */
export const DEFAULT_FLOOR_RATIO = 0.50;
/** Les groupes protéiques ne montent jamais au-dessus: pas de viande doublée. */
export const PROTEIN_CEILING_RATIO = 1.50;
/** Le plafond de tous les autres. */
export const DEFAULT_CEILING_RATIO = 2.00;
/**
 * HUILES, BEURRES ET GRAISSES AJOUTÉES: la bande la plus serrée des quatre, et
 * la seule qui serre des DEUX côtés.
 *
 * ⛔ C'est la garde nommée du lot. Le premier rattrapage réel mesuré faisait
 * très exactement ce qu'elle interdit: « le modèle réduit les légumes aqueux et
 * augmente l'huile ». Une matière grasse à 9 kcal/g ferme n'importe quel écart
 * de densité; sans plafond, l'ajusteur noierait l'assiette d'huile et
 * s'appellerait un succès. Le plancher à 75 % existe pour la direction
 * inverse — alléger un plat en retirant sa graisse de cuisson change le plat.
 */
export const ADDED_FAT_FLOOR_RATIO = 0.75;
export const ADDED_FAT_CEILING_RATIO = 1.25;

/**
 * ── LES LÉGUMES, AU SENS DU PLANCHER À 70 % ───────────────────────────────
 * Les trois mêmes groupes que `VEG_GROUPS` dans `box_densify.ts`. `starchy_veg`
 * n'y est pas, et c'est un arbitrage: une pomme de terre est un FÉCULENT, c'est
 * la CIBLE d'une densification, et lui donner un plancher de légume bloquerait
 * le déplacement même que ce module existe pour faire.
 */
export const VEG_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "cruciferous_veg",
  "leafy_greens",
  "non_starchy_veg",
]);

/**
 * ── LES GROUPES PROTÉIQUES, AU SENS DU PLAFOND À 150 % ────────────────────
 * `PROTEIN_SOURCES` de `tokens.ts` (dix groupes) — donc les huit de
 * `box_densify.PROTEIN_GROUPS` PLUS `legumes` et `dairy_yogurt`.
 *
 * ⚠️ Le plafond ne fait que RESTREINDRE: l'élargir ne peut jamais rendre
 * l'ajusteur plus agressif, seulement plus prudent. Reprendre la liste que ce
 * dépôt nomme déjà « sources de protéines » évite d'inventer une troisième
 * liste de vocabulaire alimentaire, ce que le dépôt a déjà payé une fois.
 *
 * ⛔ `dairy_cheese` et `nuts_seeds` n'y sont PAS — FF-037 a écrit pourquoi:
 * « 30 g d'amandes sont une matière grasse avec de la protéine dedans, pas une
 * ancre ». Ils gardent donc le plafond générique de 200 %. C'est une ouverture
 * connue: doubler la feta est une façon de densifier qui ne passe pas par la
 * garde de l'huile. Le chantier ne l'a pas fermée; ce module ne l'invente pas.
 */
export const PROTEIN_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "legumes",
  "tofu_tempeh",
  "dairy_yogurt",
]);

/** Les graisses AJOUTÉES — pas le gras d'un aliment, celui qu'on verse. */
export const ADDED_FAT_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "olive_oil",
  "other_added_fat",
]);

/**
 * ── LE GROUPE `water` EST FIXE, TOUJOURS ──────────────────────────────────
 * « Condiments et traitement de l'eau: fixes. » L'eau d'une casserole n'est pas
 * un levier de densité: c'est une décision de cuisson (absorbée, gardée,
 * jetée), et elle appartient à la mesure de la préparation
 * (`preparation_mass.ts`, lot B). Un ajusteur qui retirerait 30 % de l'eau d'un
 * bouillon changerait le plat, pas ses proportions.
 */
export const FIXED_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>(["water"]);

export interface RatioBounds {
  readonly floor: number;
  readonly ceiling: number;
}

/**
 * LE RATTACHEMENT D'UN GROUPE À SA BANDE — la table lisible de l'arbitrage.
 *
 * Quatre bandes, et rien d'autre. Un groupe absent des trois ensembles nommés
 * tombe sur `[DEFAULT_FLOOR_RATIO, DEFAULT_CEILING_RATIO]`, y compris
 * `whole_grain`, `refined_grain`, `starchy_veg`, `dairy_cheese`, `nuts_seeds`,
 * les fruits, `sauce_dressing`, `sugar_sweets`, `alcohol`.
 *
 * ⚠️ `sauce_dressing` NE DONNE PAS le statut de condiment. Dans ce dépôt,
 * « condiment » est porté par la LIGNE du référentiel (`condiment_grams`), donc
 * par le slug: le sel et le paprika y sont, une vinaigrette pesée de 60 g n'y
 * est pas. Geler le groupe entier figerait un vrai levier de densité. C'est
 * l'appelant qui pose `isCondiment` ligne par ligne.
 */
export function ratioBoundsFor(group: FoodGroupRef | null): RatioBounds {
  if (group !== null && ADDED_FAT_GROUPS.has(group)) {
    return { floor: ADDED_FAT_FLOOR_RATIO, ceiling: ADDED_FAT_CEILING_RATIO };
  }
  const floor = group !== null && VEG_GROUPS.has(group) ? VEG_FLOOR_RATIO : DEFAULT_FLOOR_RATIO;
  const ceiling = group !== null && PROTEIN_GROUPS.has(group)
    ? PROTEIN_CEILING_RATIO
    : DEFAULT_CEILING_RATIO;
  return { floor, ceiling };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LES RÉGLAGES DE LA RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/** Un déplacement vaut 5 grammes CUITS — réduit pour atteindre une limite ou fermer l'écart. */
export const MOVE_COOKED_G = 5;
/** En dessous, ce n'est plus un déplacement, c'est du bruit d'arrondi. */
export const MIN_MOVE_COOKED_G = 0.1;
/** 200 déplacements par composante de préparations partagées. Pas 201. */
export const MAX_MOVES_PER_COMPONENT = 200;
/** Le pas de la sonde qui mesure le marginal d'un ingrédient, en grammes CRUS. */
export const PROBE_RAW_G = 10;
/** Les quantités rendues sont au dixième de gramme. Une borne, elle, est exacte. */
export const GRAMS_QUANTUM = 0.1;
/**
 * Sous cet écart, le couloir est tenu. 0,05 kcal/100 g: très en dessous de
 * l'arrondi au kcal que le moteur fait ensuite, très au-dessus du bruit flottant.
 */
export const DENSITY_TOLERANCE_PER_100G = 0.05;
/** Deux scores plus proches que ça sont ÉGAUX — et une égalité se départage par identifiant. */
const SCORE_EPSILON = 1e-9;

/**
 * LE MOT EXACT QUAND LA RECHERCHE S'ARRÊTE SANS SOLUTION.
 *
 * ⛔ « pas trouvé », JAMAIS « impossible ». La recherche est gloutonne, bornée à
 * 200 déplacements et guidée par le meilleur pas local: son échec ne prouve
 * rien sur l'existence d'une solution dans ces mêmes bornes. Écrire
 * « impossible » ferait croire à l'appelant — et à l'humain qui lit le journal —
 * qu'une recomposition modèle est la seule issue, alors qu'un couloir légèrement
 * différent ou un ordre différent aurait pu passer.
 */
export const NO_SOLUTION_WITHIN_LIMITS = "aucune solution trouvée dans ces limites";

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QU'ON REÇOIT
// ═══════════════════════════════════════════════════════════════════════════

/** Pourquoi une ligne ne bouge pas. Aucune n'est silencieuse: toutes sont comptées. */
export const FIXED_REASONS = [
  /** L'appelant l'a verrouillée — une contrainte existante est prioritaire. */
  "caller_fixed",
  /** `condiment_grams` non nul sur la référence: une pincée n'est pas un levier. */
  "condiment",
  /** Groupe `water`: le traitement de l'eau est fixe. */
  "water",
  /** Aucune quantité écrite. 82 lignes d'huile sans quantité ont déjà été mesurées ici. */
  "unweighed",
  /** La mesure injectée ne sait pas dire ce que cette ligne pèse ou vaut. */
  "unmeasurable",
  /** La mesure ne bouge pas quand la quantité bouge: pas de conversion cru → cuit. */
  "no_yield",
  /** L'unité entière est déclarée non ajustable par l'appelant. */
  "unit_fixed",
  /**
   * ⟳ LOT D (2026-09-11) — LA LIGNE APPARTIENT À UN CORPS RIGIDE IMMOBILE.
   * Rôle ou lien absent, ambigu, ou contrat de cuisson refusé: le plan dit
   * « composant non ajustable en proportions ».
   */
  "component_locked",
  /**
   * ⟳ LOT D (2026-09-11) — AUCUN CORPS NE PORTE CETTE LIGNE. C'est un défaut
   * de l'appelant, pas du modèle: `bodiesOfUnit` couvre toujours toutes les
   * lignes qu'on lui donne. Compté à part pour qu'un branchement incomplet ne
   * se lise pas comme un contrat refusé.
   */
  "no_component",
] as const;
export type FixedReason = (typeof FIXED_REASONS)[number];

/**
 * UNE LIGNE D'INGRÉDIENT, telle que ce module la manipule.
 *
 * ⛔ Tous les champs sont REQUIS, `null` compris. Un champ facultatif ici ferait
 * retomber tous les appelants sur un défaut silencieux — le mode d'échec n° 1 de
 * ce dépôt. `isCondiment` ou `group` omis, et deux gardes de bornes sur quatre
 * seraient construites, branchées, désarmées.
 */
export interface AdjustableIngredient {
  /**
   * STABLE. Ce module n'exige que l'unicité DANS SON UNITÉ: c'est lui qui
   * départage les égalités, et ses clés de candidat portent déjà l'unité.
   *
   * ⚠️ MAIS L'APPELANT, LUI, A BESOIN DE PLUS. La `MeasureFn` reçoit une LISTE
   * NUE, sans identifiant d'unité: c'est par cet identifiant-là que l'appelant
   * retrouve la ligne d'origine (son `unit`, son `state`, sa prose) et l'unité
   * à laquelle elle appartient (sa méthode, son traitement de l'eau). Deux
   * lignes homonymes dans deux casseroles lui feraient mesurer la mauvaise.
   * Un identifiant préfixé par l'unité règle les deux d'un coup — c'est ce que
   * font les fixtures réelles du test.
   */
  readonly ingredientId: string;
  readonly term: string;
  /**
   * ⟳ LOT A (2026-09-11) — L'IDENTIFIANT DE RÉFÉRENCE DE CETTE LIGNE.
   *
   * ⛔ CE MODULE NE MESURE RIEN LUI-MÊME, mais il PASSE ses lignes à la
   * `MeasureFn` de l'appelant (`measureOfPlan`), qui remonte une liste à
   * `measurePreparation`/`measureFresh`. Cette liste ne portait que le terme:
   * l'ajusteur mesurait donc ses candidates sur le libellé pendant que le
   * parseur avait pesé la même ligne sur son identifiant. Deux arithmétiques
   * pour une seule recette.
   *
   * ⚠️ FACULTATIFS: une unité fabriquée à la main (test, banc) n'en porte pas,
   * et leur absence rend exactement le chemin d'avant — par le terme.
   */
  readonly ref?: string | null;
  readonly refRefused?: boolean;
  /** Les grammes CRUS de l'état courant. `null` = non pesé ⇒ la ligne ne bouge pas. */
  readonly grams: number | null;
  /**
   * ⛔ LES GRAMMES CRUS DE LA RECETTE INITIALE ACCEPTÉE — l'ancre des ratios.
   * Égal à `grams` à la première passe. À la deuxième, il vaut TOUJOURS la
   * recette initiale: c'est ce qui empêche deux passes de ×1,5 de faire ×2,25.
   */
  readonly baselineGrams: number | null;
  readonly group: FoodGroupRef | null;
  /** `food_composition_refs.condiment_grams` non nul. Porté par la LIGNE, pas par le groupe. */
  readonly isCondiment: boolean;
  /** Verrou de l'appelant: une borne, une restriction ou une contrainte existante. */
  readonly fixed: boolean;
}

/**
 * UNE UNITÉ AJUSTABLE: une casserole, ou les ingrédients frais d'un plat.
 *
 * ⚠️ `adjustable: false` est la sortie prévue par le chantier: « les unités dont
 * les proportions ou instructions ne peuvent pas être ajustées de manière fiable
 * restent fixes et passent, si nécessaire, par une recomposition modèle ». Le
 * cas le plus fréquent, et celui que l'appelant doit surveiller: une méthode qui
 * écrit des grammes en toutes lettres. Ajuster la recette laisserait alors une
 * ancienne quantité dans le texte lu par l'humain.
 */
export interface AdjustableUnit {
  readonly unitId: string;
  readonly kind: "preparation" | "dish";
  readonly ingredients: readonly AdjustableIngredient[];
  readonly adjustable: boolean;
  /** Non vide dès que `adjustable` est faux. */
  readonly fixedReason: string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ LOT D (2026-09-11) — LES CORPS RIGIDES DE CETTE UNITÉ.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS, JAMAIS `?`. Un paramètre de garde optionnel est une garde
   * désarmée, et c'est la cicatrice n°1 de ce dépôt: un appelant qui oublie
   * ce champ retrouverait le comportement d'avant le lot — une ligne, une
   * variable libre — c'est-à-dire très exactement ce que la revue du
   * 2026-09-11 §5 a mesuré en train de réécrire quatre recettes. La casse de
   * compilation est le seul recenseur d'appelants qui ne mente pas.
   *
   * ⛔ CE MODULE NE LES CONSTRUIT PAS ET NE LES VALIDE PAS. `bodiesOfUnit`
   * (`culinary_structure.ts`) lit le contrat déclaré par le modèle, applique
   * la politique du plan et rend ces corps. Ici, ils sont une CONTRAINTE:
   *
   *   · les lignes d'un même corps ne bougent **qu'ensemble**, par un facteur
   *     commun — leurs rapports internes sont conservés par construction;
   *   · un corps `movable: false` est **fixe**, ligne par ligne;
   *   · une ligne qu'aucun corps ne porte est fixe (`no_component`).
   *
   * Le facteur autorisé d'un corps est l'INTERSECTION des bornes de ses
   * lignes — une seule ligne au plafond arrête tout le corps.
   */
  readonly bodies: readonly RigidBody[];
}

/**
 * UN CONSOMMATEUR: une assiette, avec ce qu'elle tire de chaque unité.
 *
 * `share` est le PRÉLÈVEMENT réel, pas `1 / servingsMade` par convention: une
 * boîte ne reçoit pas nécessairement une part égale de chaque casserole.
 */
export interface ConsumerConstraint {
  readonly consumerId: string;
  readonly parts: readonly { readonly unitId: string; readonly share: number }[];
  /** Le plancher du couloir de densité, en kcal/100 g SERVIS. `null` = pas de plancher. */
  readonly minPer100G: number | null;
  readonly maxPer100G: number | null;
  /** La visée. Objectif SECONDAIRE: elle ne départage que des déplacements à égalité. */
  readonly preferredPer100G: number | null;
}

/** Ce que pèse et ce que vaut une liste d'ingrédients. `null` = non mesurable. */
export type MeasureFn = (
  ingredients: readonly AdjustableIngredient[],
) => { kcal: number | null; readyG: number | null };

// ═══════════════════════════════════════════════════════════════════════════
// ④ CE QU'ON REND
// ═══════════════════════════════════════════════════════════════════════════

export const ADJUST_STOPS = [
  /** Toutes les contraintes de la composante sont tenues. */
  "closed",
  /** Le dernier déplacement possible a été fermé par un PLANCHER. */
  "floor",
  /** …par un PLAFOND. */
  "ceiling",
  /** Plus aucun déplacement n'améliore le défaut. */
  "no_improving_move",
  /** Tout ce qui améliorait sortait une portion DÉJÀ CONFORME de son couloir. */
  "would_degrade",
  /** 200 déplacements. */
  "move_budget",
  /** Aucune ligne ajustable dans la composante. */
  "all_fixed",
  /** La mesure injectée rend `null` sur une unité de la composante. */
  "unmeasurable",
  /** Aucun consommateur ne porte de couloir ici. */
  "no_consumer",
  /**
   * La mesure réelle a démenti la prédiction linéaire après application: le
   * déplacement a été DÉFAIT. Jamais silencieux.
   */
  "reverted_after_measure",
] as const;
export type AdjustStop = (typeof ADJUST_STOPS)[number];

export interface UnitMeasure {
  readonly kcal: number | null;
  readonly readyG: number | null;
}

export interface AdjustedIngredient {
  readonly ingredientId: string;
  readonly term: string;
  readonly baselineGrams: number | null;
  readonly beforeGrams: number | null;
  readonly grams: number | null;
  /** `grams / baselineGrams`. C'est le nombre que les bornes encadrent. */
  readonly ratioToBaseline: number | null;
  readonly floorGrams: number | null;
  readonly ceilingGrams: number | null;
  readonly fixed: boolean;
  readonly fixedReason: FixedReason | null;
}

export interface AdjustedUnit {
  readonly unitId: string;
  readonly kind: "preparation" | "dish";
  readonly componentId: string | null;
  readonly adjustable: boolean;
  readonly fixedReason: string | null;
  readonly before: UnitMeasure;
  readonly after: UnitMeasure;
  readonly touched: boolean;
  /** Mêmes lignes, même ordre, mêmes identifiants qu'à l'entrée. Toujours. */
  readonly ingredients: readonly AdjustedIngredient[];
}

export interface AdjustMove {
  readonly componentId: string;
  /** 1, 2, 3… dans l'ordre où ils ont été faits. Traçable un par un. */
  readonly index: number;
  readonly kind: "paired" | "one_sided";
  readonly unitId: string;
  /**
   * ⟳ LOT D — LE CORPS DÉPLACÉ. C'est LUI l'unité de déplacement depuis ce
   * lot; la ligne ci-dessous n'est renseignée que quand le corps n'en porte
   * qu'une seule, et vaut `null` sur un corps à plusieurs lignes — où nommer
   * une ligne laisserait croire qu'elle a bougé seule.
   */
  readonly fromBodyId: string | null;
  readonly toBodyId: string | null;
  readonly fromIngredientId: string | null;
  readonly toIngredientId: string | null;
  /** Les grammes CUITS déplacés (nominal 5, réduit pour tenir une limite). */
  readonly cookedG: number;
  readonly violationBefore: number;
  readonly violationAfter: number;
}

export interface ConsumerVerdict {
  readonly consumerId: string;
  readonly componentId: string | null;
  readonly minPer100G: number | null;
  readonly maxPer100G: number | null;
  readonly preferredPer100G: number | null;
  readonly before: { readonly kcal: number; readonly readyG: number; readonly per100G: number } | null;
  readonly after: { readonly kcal: number; readonly readyG: number; readonly per100G: number } | null;
  readonly violationBefore: number | null;
  readonly violationAfter: number | null;
  /** Était en défaut, ne l'est plus. */
  readonly closed: boolean;
  /** Conforme avant, plus après. ⛔ DOIT rester faux: c'est la garde du lot. */
  readonly degraded: boolean;
}

export interface RemainingDefect {
  readonly consumerId: string;
  readonly componentId: string | null;
  readonly side: "below" | "above" | "unmeasurable";
  readonly minPer100G: number | null;
  readonly maxPer100G: number | null;
  readonly per100GBefore: number | null;
  readonly per100GAfter: number | null;
  /** Ce qui MANQUE encore, en kcal/100 g. */
  readonly gapPer100G: number | null;
  readonly kcalAfter: number | null;
  readonly readyGAfter: number | null;
  /** Les unités à envoyer au modèle si l'appelant décide d'une recomposition. */
  readonly unitIds: readonly string[];
  readonly stop: AdjustStop;
  /** `NO_SOLUTION_WITHIN_LIMITS` quand la recherche a cherché et pas trouvé. */
  readonly note: string;
}

export type ComponentOutcome = "closed" | "nothing_to_do" | "not_found_within_limits";

export interface AdjustComponent {
  readonly componentId: string;
  readonly unitIds: readonly string[];
  readonly consumerIds: readonly string[];
  readonly moves: number;
  readonly stop: AdjustStop;
  readonly outcome: ComponentOutcome;
  readonly violationBefore: number;
  readonly violationAfter: number;
}

export interface AdjustResult {
  readonly outcome: "closed" | "nothing_to_do" | "not_found_within_limits";
  readonly units: readonly AdjustedUnit[];
  readonly moves: readonly AdjustMove[];
  readonly consumers: readonly ConsumerVerdict[];
  readonly components: readonly AdjustComponent[];
  readonly remaining: readonly RemainingDefect[];
  /** Les unités que ce module n'a pas touchées et que le modèle devra refaire. */
  readonly fixedUnits: readonly { readonly unitId: string; readonly reason: string }[];
  readonly counts: {
    readonly units_total: number;
    readonly units_adjustable: number;
    readonly units_without_consumer: number;
    readonly ingredients_total: number;
    readonly ingredients_adjustable: number;
    /** ⟳ LOT D — les corps rigides vus, et ceux qui avaient le droit de bouger. */
    readonly bodies_total: number;
    readonly bodies_movable: number;
    /** Les corps mobiles qui portent PLUSIEURS lignes — la mesure du lot. */
    readonly bodies_multi_line: number;
    readonly fixed_by_reason: Record<FixedReason, number>;
    readonly already_outside_bounds: number;
    readonly components: number;
    readonly components_closed: number;
    readonly components_not_found: number;
    readonly moves_total: number;
    readonly moves_paired: number;
    readonly moves_one_sided: number;
    readonly moved_cooked_g: number;
    /**
     * La dérive NETTE de masse cuite laissée par les déplacements APPARIÉS, en
     * grammes. Un apparié conserve la masse par construction; ce qui reste est
     * le résidu de la grille du dixième de gramme. Signé, pour qu'un biais se
     * voie. Mesuré sur le cas réel PERTE: sous le gramme sur 2 139 g.
     */
    readonly paired_ready_drift_g: number;
    readonly consumers_total: number;
    readonly consumers_unmeasurable: number;
    readonly consumers_without_corridor: number;
    readonly consumers_off_before: number;
    readonly consumers_off_after: number;
    readonly consumers_closed: number;
    /** ⛔ DOIT rester 0. */
    readonly consumers_degraded: number;
    readonly unknown_units: number;
    readonly rejected_would_degrade: number;
    readonly reverted_after_measure: number;
    readonly measure_calls: number;
    readonly stopped: Record<AdjustStop, number>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ DEUX PETITES FONCTIONS QUE LES TESTS ET L'APPELANT PARTAGENT
// ═══════════════════════════════════════════════════════════════════════════

/** De combien ce couloir est-il violé, en kcal/100 g. 0 = tenu. */
export function densityViolation(
  per100G: number,
  minPer100G: number | null,
  maxPer100G: number | null,
): number {
  let v = 0;
  if (minPer100G !== null && per100G < minPer100G) v += minPer100G - per100G;
  if (maxPer100G !== null && per100G > maxPer100G) v += per100G - maxPer100G;
  return v;
}

/** Tenu à la tolérance près. */
export function isWithinCorridor(
  per100G: number,
  minPer100G: number | null,
  maxPer100G: number | null,
): boolean {
  return densityViolation(per100G, minPer100G, maxPer100G) <= DENSITY_TOLERANCE_PER_100G;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'AJUSTEUR
// ═══════════════════════════════════════════════════════════════════════════

interface WorkIng {
  readonly unitIdx: number;
  readonly idx: number;
  readonly id: string;
  readonly term: string;
  readonly baseline: number;
  readonly beforeGrams: number;
  grams: number;
  readonly floor: number;
  readonly ceiling: number;
  fixed: boolean;
  fixedReason: FixedReason | null;
  /**
   * ⟳ LOT D — LA LIGNE SUIT SON CORPS SANS POUVOIR LE MENER.
   *
   * ⛔ L'EAU ET LES CONDIMENTS SONT FIXES PARCE QU'ILS NE SONT PAS DES LEVIERS,
   * pas parce qu'ils devraient rester à 50 g pendant qu'une sauce descend de
   * 20 %. Dans un corps rigide à PLUSIEURS lignes, plus rien n'est un levier
   * individuel: le facteur est commun, et le sel d'une vinaigrette qui maigrit
   * doit maigrir avec elle, sinon la vinaigrette devient salée. Un risotto est
   * le même cas, en plus net: son eau EST sa recette.
   *
   * ⚠️ SEULEMENT DANS UN CORPS À PLUSIEURS LIGNES. Seule, une ligne d'eau
   * redeviendrait le levier de densité que la convention produit refuse depuis
   * le premier jour — « un ajusteur qui retirerait 30 % de l'eau d'un bouillon
   * changerait le plat ».
   */
  rider: boolean;
  /** kcal par gramme CRU ajouté, mesuré par la sonde, DANS le contexte de l'unité. */
  dKcal: number;
  /** grammes PRÊTS par gramme CRU ajouté. C'est la conversion cru ↔ cuit. */
  dReady: number;
  /** kcal par gramme CUIT — `dKcal / dReady`. C'est la densité servie de la ligne. */
  density: number;
}

interface WorkUnit {
  readonly unit: AdjustableUnit;
  readonly idx: number;
  /** Les lignes, dans l'ordre d'entrée. Les fixes y sont aussi. */
  readonly ings: WorkIng[];
  /** ⟳ LOT D — les corps MOBILES qui portent au moins une ligne libre. */
  readonly bodies: WorkBody[];
  readonly before: UnitMeasure;
  measure: UnitMeasure;
  touched: boolean;
  componentId: string | null;
}

/**
 * ⟳ LOT D — UN CORPS RIGIDE AU TRAVAIL: les lignes qui ne bougent qu'ensemble.
 *
 * ⛔ SES DÉRIVÉES SE RECALCULENT À CHAQUE TOUR, et ça ne coûte AUCUN appel de
 * mesure: elles ne sont qu'une somme pondérée des marginaux par ligne, sondés
 * une fois au départ. Les figer ferait mentir les bornes dès le deuxième
 * déplacement — un corps qui a maigri de 20 % offre 20 % de marge en moins.
 */
interface WorkBody {
  readonly id: string;
  /** Les lignes LIBRES du corps. Une ligne fixe n'y est pas: elle ne bouge pas. */
  readonly lines: WorkIng[];
  /** kcal par unité de FACTEUR — Σ grammes × marginal. */
  dKcal: number;
  /** grammes prêts par unité de facteur. */
  dReady: number;
  /** kcal par gramme CUIT du corps entier. C'est sa densité servie. */
  density: number;
  /** Le facteur le plus petit et le plus grand, relatifs à l'état COURANT. */
  fMin: number;
  fMax: number;
}

/**
 * L'INTERSECTION DES BORNES DES LIGNES D'UN CORPS.
 *
 * ⛔ UNE SEULE LIGNE AU PLAFOND ARRÊTE TOUT LE CORPS. C'est la phrase du plan
 * — « leurs facteurs autorisés sont l'intersection des bornes de leurs
 * ingrédients » — et c'est ce qui empêche une sauce de monter parce que le
 * poulet qu'elle accompagne, lui, en avait encore le droit.
 */
function refreshBody(b: WorkBody): void {
  let dKcal = 0;
  let dReady = 0;
  let fMin = 0;
  let fMax = Number.POSITIVE_INFINITY;
  for (const w of b.lines) {
    dKcal += w.grams * w.dKcal;
    dReady += w.grams * w.dReady;
    if (!(w.grams > 0)) continue;
    fMin = Math.max(fMin, w.floor / w.grams);
    fMax = Math.min(fMax, w.ceiling / w.grams);
  }
  b.dKcal = dKcal;
  b.dReady = dReady;
  b.density = dReady > 1e-12 ? dKcal / dReady : 0;
  // Un état courant déjà hors bornes (`already_outside_bounds`) ne doit pas
  // rendre un intervalle vide qui ferait bouger dans le mauvais sens.
  b.fMin = Math.min(1, fMin);
  b.fMax = Math.max(1, Number.isFinite(fMax) ? fMax : 1);
}

/**
 * LA GRILLE DU DIXIÈME DE GRAMME, ARRONDIE VERS LE POINT DE DÉPART.
 *
 * ⛔ `Math.round` déborderait le déplacement demandé. Un pas de 5 g CUITS sur
 * une courgette (rendement 0,9) vaut 5,56 g crus; arrondi au plus proche, il
 * rend 5,6 crus, c'est-à-dire **5,04 g cuits** — 5 g deviendrait « 5 g, sauf
 * quand non ». En arrondissant TOUJOURS vers l'état de départ, un déplacement
 * de 5 g n'en dépasse jamais 5, et une borne reste atteignable exactement:
 * `pushCand` rabat ensuite sur la borne, qui n'est pas sur la grille
 * (18,75 g = 125 % de 15 g).
 */
function quantizeToward(target: number, from: number): number {
  if (target === from) return from;
  const q = target < from
    ? Math.ceil(target / GRAMS_QUANTUM) * GRAMS_QUANTUM
    : Math.floor(target / GRAMS_QUANTUM) * GRAMS_QUANTUM;
  return Math.round(q * 10000) / 10000;
}

/**
 * LA MÊME GRILLE, AU PLUS PROCHE — pour le SEUL bout receveur d'un apparié.
 *
 * ⛔ Arrondir les deux bouts vers leur point de départ biaise la casserole dans
 * un sens: la source lâche un peu plus que la cible ne reçoit, toujours, et la
 * masse fond. Mesuré sur le cas réel PERTE, 56 déplacements appariés:
 * **−2,383 g** de dérive nette sur une casserole de 2 139 g. Au plus proche, le
 * résidu change de signe d'un déplacement à l'autre: **+0,784 g** sur le même
 * run. C'est ce que `paired_ready_drift_g` compte, en SIGNÉ, pour qu'un biais se
 * voie — une valeur absolue rendrait les deux chiffres indiscernables.
 */
function quantizeNearest(target: number): number {
  return Math.round((Math.round(target / GRAMS_QUANTUM) * GRAMS_QUANTUM) * 10000) / 10000;
}

/**
 * L'AJUSTEMENT. Pur: ne touche à rien, rend les nouvelles quantités et tout ce
 * qu'il faut pour les appliquer et les contrôler.
 *
 * PURE: no I/O, no clock, no randomness. La seule fonction externe appelée est
 * la `MeasureFn` de l'appelant, et son nombre d'appels est COMPTÉ.
 */
export function adjustProportions(args: {
  readonly units: readonly AdjustableUnit[];
  readonly consumers: readonly ConsumerConstraint[];
  readonly measure: MeasureFn;
}): AdjustResult {
  let measureCalls = 0;
  const measure = (ings: readonly AdjustableIngredient[]): UnitMeasure => {
    measureCalls++;
    const m = args.measure(ings);
    return { kcal: m.kcal, readyG: m.readyG };
  };

  const fixedByReason = Object.fromEntries(
    FIXED_REASONS.map((r) => [r, 0]),
  ) as Record<FixedReason, number>;
  const stopped = Object.fromEntries(ADJUST_STOPS.map((s) => [s, 0])) as Record<AdjustStop, number>;
  let alreadyOutside = 0;
  let ingredientsTotal = 0;
  let bodiesTotal = 0;
  let bodiesMovable = 0;
  let bodiesMultiLine = 0;

  // ── ① PRÉPARER CHAQUE UNITÉ: bornes, mesure de départ, marginaux ─────────
  const wunits: WorkUnit[] = args.units.map((unit, idx) => {
    const live = unit.ingredients.map((ing) => ({ ...ing }));
    const before = measure(live);
    // ⟳ LOT D — QUI PORTE QUOI, AVANT DE DÉCIDER DE QUOI QUE CE SOIT.
    // Deux ensembles et pas un booléen: « aucun corps ne la porte » est un
    // défaut de BRANCHEMENT, « son corps est verrouillé » est la politique qui
    // s'applique. Les fondre ferait d'un appelant incomplet et d'un contrat
    // refusé le même chiffre.
    const lineHasAnyBody = new Set<string>();
    const lineHasMovableBody = new Set<string>();
    /** Les lignes d'un corps mobile à PLUSIEURS lignes: les passagers possibles. */
    const lineInMultiBody = new Set<string>();
    for (const b of unit.bodies) {
      bodiesTotal++;
      if (b.movable) {
        bodiesMovable++;
        if (b.lineIds.length > 1) bodiesMultiLine++;
      }
      for (const id of b.lineIds) {
        lineHasAnyBody.add(id);
        if (b.movable) lineHasMovableBody.add(id);
        if (b.movable && b.lineIds.length > 1) lineInMultiBody.add(id);
      }
    }
    const ings: WorkIng[] = unit.ingredients.map((ing, i) => {
      ingredientsTotal++;
      const baseline = Number(ing.baselineGrams);
      const grams = Number(ing.grams);
      const { floor, ceiling } = ratioBoundsFor(ing.group);
      let reason: FixedReason | null = null;
      // ⚠️ L'EAU AVANT LE CONDIMENT, et ce n'est pas cosmétique: dans le vrai
      // référentiel, `water` porte AUSSI un `condiment_grams`. Les deux motifs
      // sont vrais; celui qui doit apparaître au journal est celui que la
      // convention produit nomme — « le traitement de l'eau est fixe ».
      if (!unit.adjustable) reason = "unit_fixed";
      else if (ing.fixed) reason = "caller_fixed";
      else if (ing.group !== null && FIXED_GROUPS.has(ing.group)) reason = "water";
      else if (ing.isCondiment) reason = "condiment";
      else if (
        ing.grams === null || ing.baselineGrams === null ||
        !Number.isFinite(grams) || !Number.isFinite(baseline) ||
        !(grams > 0) || !(baseline > 0)
      ) reason = "unweighed";
      // ⟳ LOT D — LA STRUCTURE CULINAIRE EN DERNIER, ET C'EST DÉLIBÉRÉ. Une
      // ligne d'eau dans un corps verrouillé est les deux à la fois, et le
      // motif qui doit apparaître au journal est celui que la convention
      // produit nomme depuis le début. Ce qui s'ajoute ici, ce sont les seules
      // lignes que la politique du lot D fige à elle seule.
      else if (!lineHasMovableBody.has(ing.ingredientId)) {
        reason = lineHasAnyBody.has(ing.ingredientId) ? "component_locked" : "no_component";
      }
      const w: WorkIng = {
        unitIdx: idx,
        idx: i,
        id: ing.ingredientId,
        term: ing.term,
        baseline: Number.isFinite(baseline) ? baseline : Number.NaN,
        beforeGrams: Number.isFinite(grams) ? grams : Number.NaN,
        grams: Number.isFinite(grams) ? grams : Number.NaN,
        floor: baseline * floor,
        ceiling: baseline * ceiling,
        fixed: reason !== null,
        fixedReason: reason,
        // ⟳ LOT D — passager: fixe comme levier, mais entraîné par son corps.
        rider: (reason === "water" || reason === "condiment") &&
          Number.isFinite(grams) && grams > 0 && Number.isFinite(baseline) && baseline > 0 &&
          lineInMultiBody.has(ing.ingredientId),
        dKcal: 0,
        dReady: 0,
        density: 0,
      };
      return w;
    });

    // ── LES MARGINAUX, PAR DIFFÉRENCE FINIE SUR LA LISTE ENTIÈRE ───────────
    // ⛔ Pas `mesure([ingrédient seul])`: la règle de l'eau d'une casserole
    // dépend de la PRÉSENCE d'un grain absorbant, donc du reste de la liste.
    // Mesurer une ligne isolée donnerait une densité qui n'existe nulle part.
    // La sonde ajoute `PROBE_RAW_G` à UNE ligne et lit ce que la mesure de
    // l'appelant en fait — sa règle de l'eau, son rendement, son escompte.
    //
    // ⚠️ Les marginaux sont mesurés UNE FOIS, sur l'état de départ. C'est exact
    // tant que la mesure est linéaire en la quantité d'une ligne — ce qu'elle
    // est ici. Et quand elle ne l'est pas, aucun verdict n'est faux pour
    // autant: chaque déplacement ACCEPTÉ est remesuré pour de vrai, et défait
    // si la mesure dément la prédiction (`reverted_after_measure`).
    if (before.kcal !== null && before.readyG !== null) {
      for (const w of ings) {
        // ⟳ LOT D — UN PASSAGER SE SONDE AUSSI. Sans son marginal, un corps qui
        // l'entraîne prédirait sa propre mesure de travers, et le garde-fou
        // `reverted_after_measure` défairait tout déplacement sur ce corps.
        if (w.fixed && !w.rider) continue;
        const bumped = live.map((ing, i) =>
          i === w.idx ? { ...ing, grams: w.grams + PROBE_RAW_G } : ing
        );
        const m = measure(bumped);
        if (m.kcal === null || m.readyG === null) {
          w.fixed = true;
          w.rider = false;
          if (w.fixedReason === null) w.fixedReason = "unmeasurable";
          continue;
        }
        const dKcal = (m.kcal - before.kcal) / PROBE_RAW_G;
        const dReady = (m.readyG - before.readyG) / PROBE_RAW_G;
        if (!(dReady > 1e-9)) {
          w.fixed = true;
          w.rider = false;
          if (w.fixedReason === null) w.fixedReason = "no_yield";
          continue;
        }
        w.dKcal = dKcal;
        w.dReady = dReady;
        w.density = dKcal / dReady;
      }
    } else {
      for (const w of ings) {
        if (w.fixed) continue;
        w.fixed = true;
        w.fixedReason = "unmeasurable";
      }
    }

    // ── ⟳ LOT D — LES CORPS AU TRAVAIL, DANS UN ORDRE STABLE ──────────────
    // Seuls les corps MOBILES qui gardent au moins une ligne libre après les
    // verrous produit (eau, condiment, non pesée, verrou d'appelant) sont
    // candidats. Un corps dont il ne reste rien de libre n'est pas une erreur:
    // c'est une sauce faite d'eau et de sel.
    const byId = new Map<string, WorkIng>();
    for (const w of ings) byId.set(w.id, w);
    const bodies: WorkBody[] = [];
    for (const b of [...unit.bodies].sort((x, y) => x.bodyId < y.bodyId ? -1 : 1)) {
      if (!b.movable) continue;
      // ⛔ UN CORPS DONT UNE LIGNE PESÉE NE PEUT PAS SUIVRE N'EST PAS UN CORPS.
      // Mettre à l'échelle les autres lignes en la laissant sur place
      // changerait le RAPPORT que le corps existe pour protéger — c'est-à-dire
      // ferait, sous couvert de structure, exactement le geste que ce lot
      // interdit. Une ligne NON PESÉE, elle, ne bloque rien: « sel, poivre »
      // sans grammes ne porte aucun rapport.
      const carried = b.lineIds.map((id) => byId.get(id));
      const lines: WorkIng[] = [];
      let blocked = false;
      for (const w of carried) {
        if (w === undefined) continue;
        const usable = (!w.fixed || w.rider) && w.dReady > 1e-9;
        if (usable) {
          lines.push(w);
          continue;
        }
        if (Number.isFinite(w.grams) && w.grams > 0) blocked = true;
      }
      if (blocked) {
        for (const w of lines) {
          w.fixed = true;
          w.rider = false;
          w.fixedReason = "component_locked";
        }
        continue;
      }
      if (lines.length === 0) continue;
      const wb: WorkBody = {
        id: b.bodyId,
        lines,
        dKcal: 0,
        dReady: 0,
        density: 0,
        fMin: 1,
        fMax: 1,
      };
      refreshBody(wb);
      bodies.push(wb);
    }

    // ⛔ LE COMPTAGE EST APRÈS LES CORPS, ET IL N'A PAS LE CHOIX: c'est la
    // construction des corps qui verrouille les dernières lignes
    // (`component_locked`). Compter avant rendrait ces immobilités-là muettes,
    // et une immobilité muette est exactement ce que ce module s'interdit.
    for (const w of ings) {
      if (w.fixedReason !== null) fixedByReason[w.fixedReason]++;
      if (!w.fixed && (w.grams < w.floor - 1e-9 || w.grams > w.ceiling + 1e-9)) alreadyOutside++;
    }

    return {
      unit,
      idx,
      ings,
      bodies,
      before,
      measure: before,
      touched: false,
      componentId: null,
    };
  });

  const byUnitId = new Map<string, WorkUnit>();
  for (const wu of wunits) byUnitId.set(wu.unit.unitId, wu);

  // ── ② LES COMPOSANTES DE PRÉPARATIONS PARTAGÉES ──────────────────────────
  // Deux unités sont dans la même composante dès qu'UNE assiette les tire
  // toutes les deux. C'est tout l'enjeu du lot: changer une casserole bouge
  // toutes les assiettes qui la consomment, et leurs couloirs diffèrent.
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    let c = a;
    while (parent.get(c) !== c) {
      const n = parent.get(c) ?? c;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const wu of wunits) parent.set(wu.unit.unitId, wu.unit.unitId);

  let unknownUnits = 0;
  const liveConsumers: ConsumerConstraint[] = [];
  for (const c of args.consumers) {
    const known = c.parts.filter((p) => byUnitId.has(p.unitId));
    if (known.length !== c.parts.length) unknownUnits += c.parts.length - known.length;
    if (known.length === 0) continue;
    for (let i = 1; i < known.length; i++) union(known[0].unitId, known[i].unitId);
    liveConsumers.push(c);
  }

  const componentOf = new Map<string, string>();
  for (const wu of wunits) componentOf.set(wu.unit.unitId, find(wu.unit.unitId));

  const consumersByComponent = new Map<string, ConsumerConstraint[]>();
  for (const c of liveConsumers) {
    const root = componentOf.get(c.parts.find((p) => byUnitId.has(p.unitId))!.unitId)!;
    const list = consumersByComponent.get(root) ?? [];
    list.push(c);
    consumersByComponent.set(root, list);
  }
  const unitsByComponent = new Map<string, WorkUnit[]>();
  for (const wu of wunits) {
    const root = componentOf.get(wu.unit.unitId)!;
    const list = unitsByComponent.get(root) ?? [];
    list.push(wu);
    unitsByComponent.set(root, list);
  }

  // ── ③ LA MESURE D'UNE ASSIETTE ────────────────────────────────────────────
  type Totals = { kcal: number; readyG: number; per100G: number };
  const totalsOf = (
    c: ConsumerConstraint,
    override: { unitId: string; m: UnitMeasure } | null,
  ): Totals | null => {
    let kcal = 0;
    let readyG = 0;
    for (const p of c.parts) {
      const wu = byUnitId.get(p.unitId);
      if (wu === undefined) return null;
      const m = override !== null && override.unitId === p.unitId ? override.m : wu.measure;
      if (m.kcal === null || m.readyG === null) return null;
      kcal += p.share * m.kcal;
      readyG += p.share * m.readyG;
    }
    if (!(readyG > 0)) return null;
    return { kcal, readyG, per100G: (kcal / readyG) * 100 };
  };

  const before = new Map<string, Totals | null>();
  for (const c of liveConsumers) before.set(c.consumerId, totalsOf(c, null));

  // ── ④ LA BOUCLE, COMPOSANTE PAR COMPOSANTE ───────────────────────────────
  const moves: AdjustMove[] = [];
  const components: AdjustComponent[] = [];
  let movesPaired = 0;
  let movesOneSided = 0;
  let movedCookedG = 0;
  let pairedDrift = 0;
  let rejectedWouldDegrade = 0;
  let revertedAfterMeasure = 0;

  const roots = [...unitsByComponent.keys()].sort();
  for (const root of roots) {
    const units = (unitsByComponent.get(root) ?? []).slice().sort((a, b) =>
      a.unit.unitId < b.unit.unitId ? -1 : a.unit.unitId > b.unit.unitId ? 1 : 0
    );
    for (const wu of units) wu.componentId = root;
    const cons = (consumersByComponent.get(root) ?? []).slice().sort((a, b) =>
      a.consumerId < b.consumerId ? -1 : a.consumerId > b.consumerId ? 1 : 0
    );

    const scoreOf = (
      override: { unitId: string; m: UnitMeasure } | null,
    ): { violation: number; pref: number; degradesConforming: boolean } | null => {
      let violation = 0;
      let pref = 0;
      let degrades = false;
      for (const c of cons) {
        const t = totalsOf(c, override);
        const base = totalsOf(c, null);
        if (t === null) return null;
        const v = densityViolation(t.per100G, c.minPer100G, c.maxPer100G);
        violation += v;
        if (c.preferredPer100G !== null) pref += Math.abs(t.per100G - c.preferredPer100G);
        if (
          base !== null &&
          densityViolation(base.per100G, c.minPer100G, c.maxPer100G) <= DENSITY_TOLERANCE_PER_100G &&
          v > DENSITY_TOLERANCE_PER_100G
        ) degrades = true;
      }
      return { violation, pref, degradesConforming: degrades };
    };

    const start = scoreOf(null);
    const violationBefore = start?.violation ?? 0;

    let stop: AdjustStop = "closed";
    let moveCount = 0;

    if (cons.length === 0) {
      stop = "no_consumer";
    } else if (start === null) {
      stop = "unmeasurable";
    } else if (!units.some((u) => u.bodies.length > 0)) {
      stop = violationBefore <= DENSITY_TOLERANCE_PER_100G ? "closed" : "all_fixed";
    } else {
      let cur = start;
      while (true) {
        if (cur.violation <= DENSITY_TOLERANCE_PER_100G) {
          stop = "closed";
          break;
        }
        if (moveCount >= MAX_MOVES_PER_COMPONENT) {
          stop = "move_budget";
          break;
        }

        // ── LES CANDIDATS ───────────────────────────────────────────────────
        // Un candidat = une unité, une (ou deux) ligne(s), un nombre de grammes
        // CUITS. Les appariés d'abord dans l'ordre, puis les unilatéraux; le
        // tri final ne dépend que du score et de la clé, jamais de cet ordre.
        type Cand = {
          key: string;
          kindRank: 0 | 1;
          kind: "paired" | "one_sided";
          unit: WorkUnit;
          src: WorkBody | null;
          dst: WorkBody | null;
          /** Les grammes crus visés, LIGNE PAR LIGNE, pour chaque corps. */
          srcNew: readonly number[];
          dstNew: readonly number[];
          cookedG: number;
          m: UnitMeasure;
          violation: number;
          pref: number;
        };
        const cands: Cand[] = [];
        let floorBlocked = false;
        let ceilingBlocked = false;
        let degradeBlocked = false;

        /** Le pas qui amène l'assiette la plus en défaut PILE sur sa borne. */
        const closingCooked = (
          unit: WorkUnit,
          dSrc: number | null,
          dDst: number | null,
        ): number | null => {
          let best: number | null = null;
          let worst = 0;
          for (const c of cons) {
            if (!c.parts.some((p) => p.unitId === unit.unit.unitId)) continue;
            const t = totalsOf(c, null);
            if (t === null) continue;
            const v = densityViolation(t.per100G, c.minPer100G, c.maxPer100G);
            if (v <= worst) continue;
            const target = c.minPer100G !== null && t.per100G < c.minPer100G
              ? c.minPer100G
              : c.maxPer100G;
            if (target === null) continue;
            const share = c.parts
              .filter((p) => p.unitId === unit.unit.unitId)
              .reduce((n, p) => n + p.share, 0);
            if (!(share > 0)) continue;
            // ΔK = share·g·(dDst − dSrc) ; ΔM = share·g·(dstSigne + srcSigne)
            const dK = (dDst ?? 0) - (dSrc ?? 0);
            const dM = (dDst === null ? 0 : 1) - (dSrc === null ? 0 : 1);
            const denom = share * (100 * dK - target * dM);
            if (Math.abs(denom) < 1e-9) continue;
            const g = (target * t.readyG - 100 * t.kcal) / denom;
            if (!Number.isFinite(g) || g <= 0) continue;
            worst = v;
            best = g;
          }
          return best;
        };

        /**
         * ⟳ LOT D — LE FACTEUR D'UN CORPS, ET LES GRAMMES QUI EN DESCENDENT.
         *
         * ⛔ LA GRILLE DU DIXIÈME DE GRAMME NE S'APPLIQUE QU'À UN CORPS D'UNE
         * SEULE LIGNE. Sur un corps à plusieurs lignes, arrondir chaque ligne
         * casserait très exactement ce que le corps existe pour protéger: le
         * RAPPORT entre elles. Une sauce de 45 g de tahini et 20 g de citron
         * ramenée au dixième sur chaque ligne ne rend plus 45/20. Le facteur
         * est donc appliqué tel quel, et le seul arrondi restant est celui de
         * la sortie (quatre décimales) — c'est l'arrondi « documenté » des
         * tests de sortie du lot.
         */
        const scaleBody = (
          body: WorkBody,
          /** Les grammes CUITS à ajouter (négatif pour en retirer). */
          cookedDelta: number,
          nearest: boolean,
        ): { grams: readonly number[]; f: number; onBound: boolean } => {
          // ⛔ L'ORDRE EST CELUI D'AVANT LE LOT D, ET IL N'EST PAS COSMÉTIQUE:
          // on quantifie D'ABORD, on rabat DANS les bornes ENSUITE. La borne
          // gagne toujours contre la grille d'arrondi — sans quoi un plafond à
          // 18,75 g (125 % de 15) rendrait 18,7 et le journal dirait 1,2466 là
          // où la convention produit dit 1,25.
          // ⛔ SUR UN CORPS D'UNE SEULE LIGNE, ON N'ÉCRIT PAS `g × (1 + δ/(g·r))`.
          // C'est la même chose en algèbre et une autre en flottant: le dernier
          // bit fait basculer l'arrondi au dixième, et le trajet entier de la
          // recherche change. La formule d'avant le lot D est gardée telle
          // quelle — `g + δ/r`.
          if (body.lines.length === 1) {
            const w = body.lines[0];
            const ideal = w.grams + cookedDelta / w.dReady;
            const want = nearest ? quantizeNearest(ideal) : quantizeToward(ideal, w.grams);
            const raw = Math.min(w.ceiling, Math.max(w.floor, want));
            const onBound = Math.abs(raw - w.floor) < 1e-9 || Math.abs(raw - w.ceiling) < 1e-9;
            return { grams: [raw], f: w.grams > 0 ? raw / w.grams : 1, onBound };
          }
          const f = Math.min(body.fMax, Math.max(body.fMin, 1 + cookedDelta / body.dReady));
          const onBound = Math.abs(f - body.fMin) < 1e-12 || Math.abs(f - body.fMax) < 1e-12;
          const grams = body.lines.map((w) => w.grams * f);
          return { grams, f, onBound };
        };

        /** Les grammes CUITS qu'un corps lâche (−1) ou reçoit (+1), en positif. */
        const cookedOf = (
          body: WorkBody,
          next: readonly number[],
          sign: -1 | 1,
        ): number => {
          let g = 0;
          for (const [i, w] of body.lines.entries()) g += (next[i] - w.grams) * w.dReady;
          return g * sign;
        };

        const pushCand = (
          key: string,
          kind: "paired" | "one_sided",
          unit: WorkUnit,
          src: WorkBody | null,
          dst: WorkBody | null,
          cooked: number,
        ): void => {
          let srcNew: readonly number[] = [];
          let dstNew: readonly number[] = [];
          let cookedSrc = 0;
          let cookedDst = 0;
          let landsOnBound = false;
          if (src !== null) {
            const s = scaleBody(src, -cooked, false);
            // ⛔ LES GRAMMES CUITS SE COMPTENT SUR LES GRAMMES, PAS SUR LE
            // FACTEUR. `(1 − f) × dReady` est la même chose en algèbre et une
            // autre en flottant: son dernier bit fait basculer un arrondi au
            // dixième plus loin, et le bout receveur d'un apparié en dépend.
            if (Math.abs(s.grams[0] - src.lines[0].grams) < 1e-9 && src.lines.length === 1) return;
            cookedSrc = cookedOf(src, s.grams, -1);
            if (!(Math.abs(cookedSrc) > 1e-12)) return;
            landsOnBound = landsOnBound || s.onBound;
            srcNew = s.grams;
          }
          if (dst !== null) {
            // Un appariement rend EXACTEMENT ce que la source a lâché.
            const asked = src === null ? cooked : cookedSrc;
            const d = scaleBody(dst, asked, src !== null);
            if (Math.abs(d.grams[0] - dst.lines[0].grams) < 1e-9 && dst.lines.length === 1) return;
            cookedDst = cookedOf(dst, d.grams, 1);
            if (!(Math.abs(cookedDst) > 1e-12)) return;
            landsOnBound = landsOnBound || d.onBound;
            dstNew = d.grams;
          }
          const moved = src !== null ? cookedSrc : cookedDst;
          // ⚠️ LE PAS MINIMAL A UNE EXCEPTION, ET UNE SEULE: le déplacement qui
          // ATTEINT une limite. Le chantier l'écrit — « 5 g cuits, réduits si
          // nécessaire pour atteindre une limite ». Sans elle, un plafond à
          // 1 125 g resterait à 1 124,9 g pour toujours, et le journal dirait
          // 1,4999 là où la convention produit dit 1,5.
          if (!landsOnBound && !(Math.abs(moved) >= MIN_MOVE_COOKED_G)) return;
          if (!(Math.abs(moved) > 1e-9)) return;

          let kcal = unit.measure.kcal;
          let readyG = unit.measure.readyG;
          if (kcal === null || readyG === null) return;
          // La prédiction reste LINÉAIRE et se fait ligne par ligne: un corps
          // n'a pas de marginal propre, il a la somme des marginaux de ses
          // lignes, et c'est ce que `refreshBody` agrège.
          const predict = (body: WorkBody, next: readonly number[]): void => {
            for (const [i, w] of body.lines.entries()) {
              kcal! += (next[i] - w.grams) * w.dKcal;
              readyG! += (next[i] - w.grams) * w.dReady;
            }
          };
          if (src !== null) predict(src, srcNew);
          if (dst !== null) predict(dst, dstNew);
          const m: UnitMeasure = { kcal, readyG };
          const s = scoreOf({ unitId: unit.unit.unitId, m });
          if (s === null) return;
          if (s.degradesConforming) {
            degradeBlocked = true;
            rejectedWouldDegrade++;
            return;
          }
          cands.push({
            key,
            kindRank: kind === "paired" ? 0 : 1,
            kind,
            unit,
            src,
            dst,
            srcNew,
            dstNew,
            cookedG: Math.abs(moved),
            m,
            violation: s.violation,
            pref: s.pref,
          });
        };

        for (const unit of units) {
          const free = unit.bodies;
          if (free.length === 0) continue;
          for (const b of free) refreshBody(b);
          // ── LES APPARIÉS: masse cuite conservée, comme `densifyBoxes` ──────
          for (const src of free) {
            const roomSrc = (1 - src.fMin) * src.dReady;
            if (!(roomSrc > 1e-9)) {
              floorBlocked = true;
              continue;
            }
            for (const dst of free) {
              if (dst.id === src.id) continue;
              const roomDst = (dst.fMax - 1) * dst.dReady;
              if (!(roomDst > 1e-9)) {
                ceilingBlocked = true;
                continue;
              }
              const cap = Math.min(MOVE_COOKED_G, roomSrc, roomDst);
              const key = `${unit.unit.unitId}|${src.id}>${dst.id}`;
              pushCand(key, "paired", unit, src, dst, cap);
              const close = closingCooked(unit, src.density, dst.density);
              if (close !== null && close < cap - 1e-9) {
                pushCand(`${key}#c`, "paired", unit, src, dst, Math.max(MIN_MOVE_COOKED_G, close));
              }
            }
          }
          // ── LES UNILATÉRAUX: la recette pèse moins, ou plus ────────────────
          // ⚠️ ARBITRAGE, écrit en clair. `densifyBoxes` conserve la masse parce
          // qu'une BOÎTE a un volume servi. Une RECETTE n'en a pas: le moteur la
          // remet à l'échelle ensuite (`sizeDishForMouth`), donc sa masse absolue
          // n'est pas une contrainte produit — seuls les RAPPORTS le sont, et ce
          // sont eux que les bornes encadrent. Mesuré sur le cas réel PERTE:
          // avec les seuls appariés, la meilleure densité atteignable est
          // 120,6 kcal/100 g contre 123 demandés — le lot raterait son objet
          // pour 2,4 kcal/100 g. Les deux familles sont comptées séparément.
          for (const w of free) {
            const down = (1 - w.fMin) * w.dReady;
            if (down > 1e-9) {
              const cap = Math.min(MOVE_COOKED_G, down);
              pushCand(`${unit.unit.unitId}|${w.id}|-`, "one_sided", unit, w, null, cap);
              const close = closingCooked(unit, w.density, null);
              if (close !== null && close < cap - 1e-9) {
                pushCand(
                  `${unit.unit.unitId}|${w.id}|-#c`,
                  "one_sided",
                  unit,
                  w,
                  null,
                  Math.max(MIN_MOVE_COOKED_G, close),
                );
              }
            } else floorBlocked = true;
            const up = (w.fMax - 1) * w.dReady;
            if (up > 1e-9) {
              const cap = Math.min(MOVE_COOKED_G, up);
              pushCand(`${unit.unit.unitId}|${w.id}|+`, "one_sided", unit, null, w, cap);
              const close = closingCooked(unit, null, w.density);
              if (close !== null && close < cap - 1e-9) {
                pushCand(
                  `${unit.unit.unitId}|${w.id}|+#c`,
                  "one_sided",
                  unit,
                  null,
                  w,
                  Math.max(MIN_MOVE_COOKED_G, close),
                );
              }
            } else ceilingBlocked = true;
          }
        }

        // ── LE CHOIX: le meilleur, et l'égalité se départage par identifiant ──
        let best: Cand | null = null;
        for (const c of cands) {
          if (best === null) {
            best = c;
            continue;
          }
          const dv = c.violation - best.violation;
          if (dv < -SCORE_EPSILON) {
            best = c;
            continue;
          }
          if (dv > SCORE_EPSILON) continue;
          const dp = c.pref - best.pref;
          if (dp < -SCORE_EPSILON) {
            best = c;
            continue;
          }
          if (dp > SCORE_EPSILON) continue;
          if (c.kindRank < best.kindRank) {
            best = c;
            continue;
          }
          if (c.kindRank === best.kindRank && c.key < best.key) best = c;
        }

        // ⛔ ON N'ACCEPTE QUE CE QUI RÉDUIT LE DÉFAUT. La proximité du grammage
        // préféré est un objectif SECONDAIRE: elle départage deux candidats à
        // défaut égal, elle n'autorise jamais un déplacement à elle seule. Un
        // déplacement « qui ne change que la visée » tournerait en rond — et
        // ferait consommer du budget à une recherche qui n'avance plus.
        const improves = best !== null && best.violation < cur.violation - SCORE_EPSILON;
        if (!improves) {
          stop = degradeBlocked
            ? "would_degrade"
            : floorBlocked
            ? "floor"
            : ceilingBlocked
            ? "ceiling"
            : "no_improving_move";
          break;
        }

        // ── APPLIQUER, PUIS REMESURER POUR DE VRAI ──────────────────────────
        const b = best!;
        const keepSrc = b.src === null ? [] : b.src.lines.map((w) => w.grams);
        const keepDst = b.dst === null ? [] : b.dst.lines.map((w) => w.grams);
        const keepMeasure = b.unit.measure;
        const write = (body: WorkBody | null, next: readonly number[]): void => {
          if (body === null) return;
          for (const [i, w] of body.lines.entries()) w.grams = next[i];
          refreshBody(body);
        };
        write(b.src, b.srcNew);
        write(b.dst, b.dstNew);
        const applied = measure(
          b.unit.unit.ingredients.map((ing, i) => {
            const w = b.unit.ings[i];
            return w.fixed ? ing : { ...ing, grams: w.grams };
          }),
        );
        b.unit.measure = applied;
        const after = scoreOf(null);
        if (
          after === null || after.degradesConforming ||
          after.violation > cur.violation - SCORE_EPSILON
        ) {
          // La mesure réelle dément la prédiction linéaire: on DÉFAIT.
          write(b.src, keepSrc);
          write(b.dst, keepDst);
          b.unit.measure = keepMeasure;
          revertedAfterMeasure++;
          stop = "reverted_after_measure";
          break;
        }

        b.unit.touched = true;
        moveCount++;
        movedCookedG += b.cookedG;
        if (b.kind === "paired") {
          movesPaired++;
          const readyDelta = (
            body: WorkBody | null,
            keep: readonly number[],
            next: readonly number[],
          ): number => {
            if (body === null) return 0;
            let d = 0;
            for (const [i, w] of body.lines.entries()) d += (next[i] - keep[i]) * w.dReady;
            return d;
          };
          // SIGNÉ: positif = la casserole a grossi. Un biais d'arrondi se voit,
          // une compensation aussi. Une valeur absolue cacherait les deux.
          pairedDrift += readyDelta(b.dst, keepDst, b.dstNew) +
            readyDelta(b.src, keepSrc, b.srcNew);
        } else movesOneSided++;
        /** Une ligne n'est nommée que si le corps n'en porte qu'une seule. */
        const soleLine = (body: WorkBody | null): string | null =>
          body !== null && body.lines.length === 1 ? body.lines[0].id : null;
        moves.push({
          componentId: root,
          index: moves.length + 1,
          kind: b.kind,
          unitId: b.unit.unit.unitId,
          fromBodyId: b.src?.id ?? null,
          toBodyId: b.dst?.id ?? null,
          fromIngredientId: soleLine(b.src),
          toIngredientId: soleLine(b.dst),
          cookedG: Math.round(b.cookedG * 1000) / 1000,
          violationBefore: Math.round(cur.violation * 1000) / 1000,
          violationAfter: Math.round(after.violation * 1000) / 1000,
        });
        cur = after;
      }
    }

    const end = scoreOf(null);
    const violationAfter = end?.violation ?? violationBefore;
    const outcome: ComponentOutcome = violationBefore <= DENSITY_TOLERANCE_PER_100G
      ? "nothing_to_do"
      : violationAfter <= DENSITY_TOLERANCE_PER_100G
      ? "closed"
      : "not_found_within_limits";
    stopped[stop]++;
    components.push({
      componentId: root,
      unitIds: units.map((u) => u.unit.unitId),
      consumerIds: cons.map((c) => c.consumerId),
      moves: moveCount,
      stop,
      outcome,
      violationBefore: Math.round(violationBefore * 1000) / 1000,
      violationAfter: Math.round(violationAfter * 1000) / 1000,
    });
  }

  // ── ⑤ LES VERDICTS ────────────────────────────────────────────────────────
  const stopByComponent = new Map<string, AdjustStop>();
  for (const c of components) stopByComponent.set(c.componentId, c.stop);

  const verdicts: ConsumerVerdict[] = [];
  const remaining: RemainingDefect[] = [];
  let unmeasurableConsumers = 0;
  let withoutCorridor = 0;
  let offBefore = 0;
  let offAfter = 0;
  let closedCount = 0;
  let degradedCount = 0;

  for (const c of args.consumers) {
    const known = c.parts.filter((p) => byUnitId.has(p.unitId));
    const componentId = known.length > 0 ? componentOf.get(known[0].unitId) ?? null : null;
    const b = before.get(c.consumerId) ?? null;
    const a = known.length === c.parts.length && known.length > 0 ? totalsOf(c, null) : null;
    const hasCorridor = c.minPer100G !== null || c.maxPer100G !== null;
    if (!hasCorridor) withoutCorridor++;
    if (a === null || b === null) unmeasurableConsumers++;
    const vb = b === null ? null : densityViolation(b.per100G, c.minPer100G, c.maxPer100G);
    const va = a === null ? null : densityViolation(a.per100G, c.minPer100G, c.maxPer100G);
    const wasOff = vb !== null && vb > DENSITY_TOLERANCE_PER_100G;
    const isOff = va !== null && va > DENSITY_TOLERANCE_PER_100G;
    if (wasOff) offBefore++;
    if (isOff) offAfter++;
    const closed = wasOff && va !== null && va <= DENSITY_TOLERANCE_PER_100G;
    const degraded = vb !== null && vb <= DENSITY_TOLERANCE_PER_100G && isOff;
    if (closed) closedCount++;
    if (degraded) degradedCount++;
    verdicts.push({
      consumerId: c.consumerId,
      componentId,
      minPer100G: c.minPer100G,
      maxPer100G: c.maxPer100G,
      preferredPer100G: c.preferredPer100G,
      before: b,
      after: a,
      violationBefore: vb,
      violationAfter: va,
      closed,
      degraded,
    });

    if (isOff || (a === null && hasCorridor)) {
      const stop = componentId !== null
        ? stopByComponent.get(componentId) ?? "unmeasurable"
        : "unmeasurable";
      const side: RemainingDefect["side"] = a === null
        ? "unmeasurable"
        : c.minPer100G !== null && a.per100G < c.minPer100G
        ? "below"
        : "above";
      remaining.push({
        consumerId: c.consumerId,
        componentId,
        side,
        minPer100G: c.minPer100G,
        maxPer100G: c.maxPer100G,
        per100GBefore: b?.per100G ?? null,
        per100GAfter: a?.per100G ?? null,
        gapPer100G: va,
        kcalAfter: a?.kcal ?? null,
        readyGAfter: a?.readyG ?? null,
        unitIds: c.parts.map((p) => p.unitId),
        stop,
        note: stop === "unmeasurable" ? "mesure indisponible" : NO_SOLUTION_WITHIN_LIMITS,
      });
    }
  }

  // ── ⑥ LES UNITÉS RENDUES ─────────────────────────────────────────────────
  const outUnits: AdjustedUnit[] = wunits.map((wu) => ({
    unitId: wu.unit.unitId,
    kind: wu.unit.kind,
    componentId: wu.componentId,
    adjustable: wu.unit.adjustable,
    fixedReason: wu.unit.fixedReason,
    before: wu.before,
    after: wu.measure,
    touched: wu.touched,
    ingredients: wu.unit.ingredients.map((ing, i) => {
      const w = wu.ings[i];
      // ⛔ UN PASSAGER A BOUGÉ, MÊME S'IL EST « FIXE ». `rider` dit « fixe comme
      // LEVIER, entraîné par son corps »: sans ce `|| w.rider`, la quantité
      // interne servait à la MESURE et l'ancienne partait dans le plan — le sel
      // d'une sauce réduite de 30 % serait resté à 2 g dans la recette écrite,
      // en silence, pendant que le moteur aurait pesé 1,4.
      const moved = (!w.fixed || w.rider) && Math.abs(w.grams - w.beforeGrams) > 1e-9;
      // ⛔ PAS DE `quantize` ICI. L'état courant est DÉJÀ sur la grille du
      // dixième de gramme, ou EXACTEMENT sur une borne — et une borne n'est pas
      // sur la grille (18,75 g = 125 % de 15 g). Requantifier rendrait 18,8 et
      // sortirait la ligne de son plafond, en silence, à la toute dernière
      // ligne du module. On ne fait qu'effacer le bruit flottant.
      const grams = w.fixed && !w.rider ? ing.grams : Math.round(w.grams * 10000) / 10000;
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
        fixedReason: w.fixedReason,
      };
    }),
  }));

  const fixedUnits = wunits
    .filter((wu) => !wu.unit.adjustable)
    .map((wu) => ({ unitId: wu.unit.unitId, reason: wu.unit.fixedReason ?? "unit_fixed" }));

  const unitsWithoutConsumer = wunits.filter((wu) =>
    !liveConsumers.some((c) => c.parts.some((p) => p.unitId === wu.unit.unitId))
  ).length;

  const anyNotFound = components.some((c) => c.outcome === "not_found_within_limits");
  const anyWork = components.some((c) => c.outcome !== "nothing_to_do");
  const outcome: AdjustResult["outcome"] = anyNotFound
    ? "not_found_within_limits"
    : anyWork
    ? "closed"
    : "nothing_to_do";

  return {
    outcome,
    units: outUnits,
    moves,
    consumers: verdicts,
    components,
    remaining,
    fixedUnits,
    counts: {
      units_total: wunits.length,
      units_adjustable: wunits.filter((wu) => wu.unit.adjustable).length,
      units_without_consumer: unitsWithoutConsumer,
      ingredients_total: ingredientsTotal,
      ingredients_adjustable: wunits.reduce(
        (n, wu) => n + wu.ings.filter((w) => !w.fixed).length,
        0,
      ),
      bodies_total: bodiesTotal,
      bodies_movable: bodiesMovable,
      bodies_multi_line: bodiesMultiLine,
      fixed_by_reason: fixedByReason,
      already_outside_bounds: alreadyOutside,
      components: components.length,
      components_closed: components.filter((c) => c.outcome === "closed").length,
      components_not_found: components.filter((c) => c.outcome === "not_found_within_limits").length,
      moves_total: moves.length,
      moves_paired: movesPaired,
      moves_one_sided: movesOneSided,
      moved_cooked_g: Math.round(movedCookedG * 100) / 100,
      paired_ready_drift_g: Math.round(pairedDrift * 1000) / 1000,
      consumers_total: args.consumers.length,
      consumers_unmeasurable: unmeasurableConsumers,
      consumers_without_corridor: withoutCorridor,
      consumers_off_before: offBefore,
      consumers_off_after: offAfter,
      consumers_closed: closedCount,
      consumers_degraded: degradedCount,
      unknown_units: unknownUnits,
      rejected_would_degrade: rejectedWouldDegrade,
      reverted_after_measure: revertedAfterMeasure,
      measure_calls: measureCalls,
      stopped,
    },
  };
}
