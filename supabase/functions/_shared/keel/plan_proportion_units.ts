/**
 * ══════════════════════════════════════════════════════════════════════════
 * BRANCHER L'AJUSTEUR DÉTERMINISTE SUR UN PLAN RÉEL — lot E, 2026-09-11.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `proportion_adjust.ts` (lot D) est pur, éprouvé, et ne connaît NI le plan, NI
 * le référentiel. Il reçoit des unités, des consommateurs et une mesure. Ce
 * module-ci fait les trois traductions qui manquaient, et rien d'autre:
 *
 *   ① `unitsOfPlan`     — un plan → des unités ajustables (une par casserole,
 *                         une par plat pour son frais);
 *   ② `consumersOfPlan` — des couloirs de densité par (plat, bouche) → des
 *                         contraintes de consommateur;
 *   ③ `applyAdjustment` — le résultat → les quantités RÉÉCRITES dans le plan.
 *
 * ⛔ POURQUOI UN MODULE ET PAS CENT LIGNES DANS LE HANDLER. Le générateur du
 * foyer fait 15 714 lignes dont ~14 500 dans un seul `Deno.serve`; rien de ce
 * qui y est écrit ne peut être testé sans un appel modèle. Ces trois fonctions
 * sont exactement la partie qu'on doit pouvoir prouver hors ligne — et le
 * chantier l'exige en toutes lettres: « un module testé mais non appelé ne clôt
 * pas un lot », dont la réciproque est aussi vraie.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ L'ARBITRAGE QUI S'ÉCARTE DU BRIEF: LA PART D'UNE CASSEROLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le brief du lot E dit « prélèvements RÉELS `uses.servings / servingsMade` ».
 * Ce module emploie **`1 / tirages`**, où « tirages » est le nombre de PLATS
 * qui citent la casserole (`drawsByPreparation`).
 *
 * La raison est une mesure, pas une préférence: la densité que le moteur JUGE
 * est celle de `standardPortionOf` → `measurePlate`, et `measurePlate` divise
 * par `draws`, pas par `servingsMade` (`preparation_mass.ts`, `shareOf`). Un
 * ajusteur qui fermerait un couloir calculé sur une AUTRE part fermerait un
 * défaut que `sizeDishForMouth` ne voit pas — et laisserait ouvert celui qu'il
 * voit. L'enquête nomme d'ailleurs ces deux lectures comme un défaut à part
 * entière (§1: « le rapport divise parfois les calories d'une part par la masse
 * d'une autre »). On ne la rejoue pas ici.
 */
import type {
  CompositionIndex,
  CompositionState,
  CompositionUnit,
} from "./food_composition.ts";
import { resolveCompositionLine } from "./food_composition.ts";
import { measureFresh, measurePreparation } from "./preparation_mass.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { adjustProportions } from "./proportion_adjust.ts";
import { bodiesOfUnit, emptyStructureCounters } from "./culinary_structure.ts";
import type { StructureCounters } from "./culinary_structure.ts";
import type {
  AdjustableIngredient,
  AdjustableUnit,
  AdjustResult,
  ConsumerConstraint,
  MeasureFn,
} from "./proportion_adjust.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES FORMES QUE CE MODULE LIT ET ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UNE LIGNE D'INGRÉDIENT DU PLAN, réduite à ce que l'ajustement touche.
 *
 * ⚠️ MUTABLE, ET C'EST LE SUJET: `applyAdjustment` écrit dedans. Le type est
 * volontairement structurel — `DishIngredient` de `meal_generation.ts` le
 * satisfait sans conversion, et ce module n'a pas à importer le parseur.
 */
export interface AdjustablePlanLine {
  term: string;
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  gramsRaw: number | null;
  quantity: string | null;
  group?: FoodGroupRef | null;
  /**
   * ⟳ LOT A (2026-09-11) — L'IDENTIFIANT DE RÉFÉRENCE DE LA LIGNE.
   *
   * ⛔ `unitsOfPlan` décidait du groupe, du condiment et du VERROU `unresolved`
   * par `resolveIngredient(args.index, line.term)` — par le libellé. Une ligne
   * dont le libellé français n'a pas d'alias (« pita complète ») était donc
   * verrouillée `unresolved` alors qu'elle portait `pita_wholemeal`, vérifié,
   * avec son poids d'unité. Les deux appelants de production passent des
   * `DishIngredient`, qui portent déjà ces deux champs.
   */
  ref?: string | null;
  refRefused?: boolean;
  /**
   * ⟳ LOT D (2026-09-11) — LE COMPOSANT CULINAIRE QUE CETTE LIGNE CITE.
   *
   * ⛔ C'EST LE MODÈLE QUI L'ÉCRIT, LIGNE PAR LIGNE, et c'est la seule façon de
   * savoir ce qui tient une sauce sans DÉCOUPER LA PROSE de la recette — ce que
   * le plan interdit nommément et que ce dépôt a déjà payé douze fois sur
   * douze. Une ligne sans `part` fait retomber tout son bloc sur le traitement
   * conservateur (`contract_absent` / `line_without_part`), ce qui est le cas
   * NOMINAL de tous les plans antérieurs au contrat.
   */
  part?: string | null;
}

/** Un composant culinaire déclaré sur un bloc. */
export interface AdjustablePlanComponent {
  id: string;
  role?: string | null;
  partOf?: string | null;
}

/** Une casserole du plan. */
export interface AdjustablePlanPreparation {
  id: string;
  method?: string | null;
  ingredients: AdjustablePlanLine[];
  components?: readonly AdjustablePlanComponent[] | null;
}

/** Un plat du plan. */
export interface AdjustablePlanDish {
  method?: string | null;
  ingredients: AdjustablePlanLine[];
  uses?: readonly { preparationId?: string | null }[] | null;
  components?: readonly AdjustablePlanComponent[] | null;
}

/** Le préfixe d'unité d'une casserole. */
export function prepUnitId(id: string): string {
  return `prep:${id}`;
}

/** Le préfixe d'unité du frais d'un plat. */
export function dishUnitId(index: number): string {
  return `dish:${index}`;
}

/**
 * L'IDENTIFIANT D'UNE LIGNE — PRÉFIXÉ PAR SON UNITÉ, ET C'EST OBLIGATOIRE.
 *
 * ⛔ « Huile d'olive » vit dans trois unités du même plan. Le lot D ne demande
 * l'unicité que DANS l'unité, mais la `MeasureFn` reçoit une liste NUE: sans
 * préfixe, la mesure ne saurait pas de quelle casserole elle parle, donc ni sa
 * méthode ni son traitement de l'eau. Le rang (`i`) départage deux lignes
 * homonymes de la MÊME casserole — un plan en porte (sel de cuisson et sel de
 * finition).
 */
export function lineId(unitId: string, i: number, term: string): string {
  return `${unitId}#${i}:${term}`;
}

/** L'unité à laquelle appartient une ligne, relue depuis son identifiant. */
export function unitOfLineId(id: string): string {
  const at = id.indexOf("#");
  return at < 0 ? "" : id.slice(0, at);
}

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QU'UNE MÉTHODE QUI ÉCRIT DES GRAMMES INTERDIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LA MÉTHODE ÉCRIT-ELLE UNE QUANTITÉ EN TOUTES LETTRES ?
 *
 * C'est la sortie que le chantier prévoit: « les unités dont les proportions ou
 * instructions ne peuvent pas être ajustées de manière fiable restent fixes ».
 * Si la prose dit « verser les 300 g de riz » et qu'on descend le riz à 240 g,
 * l'humain lit un nombre faux — et le lot C.7 exige l'inverse (« les quantités
 * affichées sont portées par les données structurées »).
 *
 * ⚠️ LE SENS DE L'ERREUR EST CHOISI. Un faux positif rend l'unité FIXE: on
 * ajuste moins, on ne ment jamais. Un faux négatif laisserait une vieille
 * quantité dans un texte lu à la cuisine. La liste est donc large, et les
 * degrés (`180°C`) n'en font pas partie: ils ne portent pas d'unité de masse.
 *
 * Le lot C a posé un bloc de prompt (`THE METHOD NAMES THE FOOD, IT DOES NOT
 * REPEAT ITS WEIGHT`) qui rend ce cas plus rare — pas impossible.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT C (2026-09-11) — CE CHIFFRE-CI NE SUFFISAIT PAS COMME PREUVE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan du chantier l'écrit en toutes lettres: « la regex actuelle ne couvre
 * pas les FRACTIONS, les NOMBRES EN LETTRES et les RAPPORTS DE CUISSON: elle ne
 * constitue pas une preuve suffisante. » Trois formes qu'elle laissait passer,
 * et qui rendent la même phrase fausse après un ajustement:
 *
 *   · « verser ½ litre de bouillon », « ajouter 1/2 verre d'eau » — pas de
 *     `\d` collé à l'unité pour la première, un `2` collé à un `verre` pour la
 *     seconde;
 *   · « ajouter deux cuillères d'huile », « add three tablespoons of oil » —
 *     aucun chiffre du tout;
 *   · « deux volumes d'eau pour un de riz », « un rapport 1:2 » — la quantité
 *     est une PROPORTION, et c'est la forme la plus dangereuse: elle survit à
 *     l'échelle globale mais pas à un changement de rapports.
 *
 * ⛔ ET LE SENS DE L'ERREUR NE CHANGE PAS: élargir rend PLUS d'unités fixes. On
 * ajuste moins, on ne ment jamais. Le coût se mesure (`units_fixed_method`),
 * il ne se suppose pas.
 *
 * ⚠️ CE N'EST PAS UN MATCHER D'ALIMENT. Aucune de ces tables ne nomme un
 * aliment, ne décide d'une référence ni ne pèse quoi que ce soit: elles
 * répondent « cette phrase porte-t-elle un nombre ? », et un faux positif
 * n'abîme rien d'autre que la liberté de l'ajusteur.
 */
export const METHOD_QUANTITY_RE =
  /\d+\s*(?:[.,]\d+\s*)?(?:kg|kilos?|g\b|gr\b|grammes?|grams?|ml\b|cl\b|dl\b|l\b|litres?|liters?|tbsp|tsp|cuill[eè]res?|c\.\s*[aà]\s*s|c\.\s*[aà]\s*c)/i;

/**
 * ① LES FRACTIONS. Les glyphes composés (`½`, `⅓`, `¾`…) et la forme `1/2`.
 * Une fraction n'a de sens que devant une mesure, sinon « 24/7 » et les dates
 * mordraient: l'unité ou un contenant doit suivre.
 */
const METHOD_FRACTION_RE =
  /(?:[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(?:de\s+|d'|of\s+|the\s+)?(?:kg|kilos?|g\b|gr\b|grammes?|grams?|ml\b|cl\b|dl\b|l\b|litres?|liters?|tbsp|tsp|cuill[eè]re|verre|tasse|cup|bol|botte|sachet|paquet|boîte|boite|can\b|tin\b|pack)/i;

/**
 * ② LES NOMBRES EN LETTRES, liste FERMÉE et volontairement courte: de un à
 * douze, dans les deux langues livrées. Au-delà de douze, une recette écrit un
 * chiffre — et une liste plus longue attraperait des mots ordinaires
 * (« quinze » non, mais « once » en anglais est aussi « une fois »).
 *
 * ⚠️ `un`/`une`/`a`/`an` NE SONT PAS DANS LA LISTE, ET C'EST DÉLIBÉRÉ. « une
 * pincée de sel » et « a pinch of salt » sont dans toutes les méthodes du
 * dépôt; les faire mordre verrouillerait à peu près tout. Une unité à « un »
 * ne se met pas à l'échelle de toute façon — c'est `counted_unit`.
 */
const METHOD_SPELLED_NUMBER_RE =
  /\b(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:gros(?:ses)?\s+|petit(?:e|s|es)?\s+|grandes?\s+|large\s+|small\s+)?(?:kg|kilos?|grammes?|grams?|ml\b|millilitres?|litres?|liters?|tbsp|tsp|tablespoons?|teaspoons?|cuill[eè]res?|verres?|tasses?|cups?|bols?|louches?|ladles?)\b/i;

/**
 * ③ LES RAPPORTS DE CUISSON. « 1:2 », « 1 pour 2 », « deux volumes d'eau pour
 * un de riz », « twice its volume in water ».
 *
 * ⛔ C'EST LA FORME LA PLUS DANGEREUSE DES TROIS, et le plan la nomme à part.
 * Une mise à l'échelle GLOBALE laisse un rapport vrai; un changement de
 * PROPORTIONS le rend faux sans qu'aucun nombre de la phrase n'ait bougé.
 * Verrouiller l'unité est la seule réponse honnête tant que la méthode n'est
 * pas réécrite d'un bloc.
 */
const METHOD_RATIO_RE =
  /(?:\b\d+\s*:\s*\d+\b|\b\d+\s+(?:pour|for)\s+\d+\b|\b(?:deux|trois|quatre|two|three|four)\s+(?:fois|times)\b|\b(?:volumes?|parts?)\s+(?:de|d'|of)\b|\bson\s+volume\b|\bits\s+volume\b)/i;

/** Les quatre formes, nommées séparément — un compteur qui fond ne dit rien. */
export const METHOD_QUANTITY_FORMS = [
  "digits",
  "fraction",
  "spelled",
  "ratio",
] as const;
export type MethodQuantityForm = (typeof METHOD_QUANTITY_FORMS)[number];

/**
 * LAQUELLE des quatre formes a mordu, ou `null`. Exportée pour que le banc
 * puisse montrer qu'une forme neuve mord VRAIMENT — un `true` global ne
 * distinguerait pas une nouvelle porte d'une ancienne.
 */
export function methodQuantityForm(
  method: string | null | undefined,
): MethodQuantityForm | null {
  const text = String(method ?? "");
  if (text.length === 0) return null;
  if (METHOD_QUANTITY_RE.test(text)) return "digits";
  if (METHOD_FRACTION_RE.test(text)) return "fraction";
  if (METHOD_SPELLED_NUMBER_RE.test(text)) return "spelled";
  if (METHOD_RATIO_RE.test(text)) return "ratio";
  return null;
}

export function methodSpellsQuantities(method: string | null | undefined): boolean {
  return methodQuantityForm(method) !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA PROSE D'UNE QUANTITÉ — on remplace le NOMBRE, jamais un mot
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ AUCUN MOT N'EST TRADUIT, DEVINÉ NI RÉÉCRIT. « 2 cuillères à soupe » devient
 * « 2,4 cuillères à soupe »: le nombre change, la langue reste celle du plan.
 * Écrire nous-mêmes l'unité en toutes lettres rendrait un plan français avec des
 * « tbsp » — et ce dépôt n'a pas de détecteur de langue, ni le droit d'en écrire.
 *
 * Rend `null` quand la prose ne COMMENCE pas par un nombre: on ne sait alors pas
 * quel nombre remplacer, et la ligne devient fixe.
 *
 * ⚠️ LIMITE CONNUE ET COSMÉTIQUE — LE SÉPARATEUR DÉCIMAL. Il suit celui de la
 * ligne d'origine (« 1,5 » → « 1,8 »), et retombe sur le POINT quand elle n'en
 * portait pas: « 2 cuillères à soupe » devient donc « 2.4 cuillères à soupe »
 * dans un plan français. La réparer demanderait de décider de la langue du
 * texte, c'est-à-dire un détecteur de langue maison — ce que ce dépôt s'interdit
 * (« jamais de matcher maison »). Le nombre reste juste; c'est la virgule qui
 * manque, et elle est nommée ici plutôt que devinée.
 */
export const LEADING_NUMBER_RE = /^(\s*)(\d+(?:[.,]\d+)?)/;

export function rewriteLeadingNumber(
  quantity: string | null | undefined,
  next: number,
): string | null {
  const text = String(quantity ?? "");
  if (text.trim().length === 0) return null;
  const m = LEADING_NUMBER_RE.exec(text);
  if (m === null) return null;
  // Le séparateur décimal de la ligne d'origine, gardé tel quel.
  const comma = m[2].includes(",");
  const rounded = Math.round(next * 10) / 10;
  const written = Number.isInteger(rounded)
    ? String(rounded)
    : comma
    ? String(rounded).replace(".", ",")
    : String(rounded);
  return `${m[1]}${written}${text.slice(m[0].length)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES UNITÉS
// ═══════════════════════════════════════════════════════════════════════════

/** Pourquoi une ligne du plan ne peut pas être réécrite. Compté, jamais muet. */
export const LINE_LOCK_REASONS = [
  /** Ni `amount`, ni `unit`: il n'y a pas de nombre à multiplier. */
  "no_structured_amount",
  /** `unit: "unit"` — « 2 œufs » ne devient pas « 2,4 œufs ». */
  "counted_unit",
  /** La prose ne commence pas par un nombre: on ne saurait pas quoi y changer. */
  "prose_not_numeric",
  /** Le référentiel ne résout pas le terme: ni groupe, ni condiment connus. */
  "unresolved",
] as const;
export type LineLockReason = (typeof LINE_LOCK_REASONS)[number];

export interface UnitsOfPlan {
  units: AdjustableUnit[];
  /** La ligne du plan derrière chaque identifiant — ce que l'application écrit. */
  lines: Map<string, AdjustablePlanLine>;
  counts: {
    units: number;
    units_fixed_method: number;
    lines: number;
    lines_locked: Record<LineLockReason, number>;
    /** ⟳ LOT D — ce que la structure culinaire a accepté, refusé et rétrogradé. */
    structure: StructureCounters;
  };
}

/**
 * LE PLAN → DES UNITÉS AJUSTABLES.
 *
 * @param baselineOf les grammes CRUS de la recette initialement acceptée, par
 * identifiant de ligne. ⛔ REQUIS ET NULLABLE, jamais `?`: les ratios du lot D
 * se rapportent TOUJOURS à la recette initiale, et un défaut à « l'état
 * courant » ferait de deux passes de ×1,5 un ×2,25 silencieux. Un appelant qui
 * n'a pas de passe précédente passe `() => null`, et la ligne courante sert
 * d'ancre.
 */
export function unitsOfPlan(args: {
  index: CompositionIndex;
  dishes: readonly AdjustablePlanDish[];
  preparations: readonly AdjustablePlanPreparation[];
  baselineOf: (lineId: string) => number | null;
}): UnitsOfPlan {
  const lines = new Map<string, AdjustablePlanLine>();
  const locked = Object.fromEntries(
    LINE_LOCK_REASONS.map((r) => [r, 0]),
  ) as Record<LineLockReason, number>;
  let unitsFixedMethod = 0;
  let lineCount = 0;
  const structure = emptyStructureCounters();

  const buildUnit = (
    unitId: string,
    kind: "preparation" | "dish",
    method: string | null | undefined,
    source: readonly AdjustablePlanLine[],
    declared: readonly AdjustablePlanComponent[] | null | undefined,
  ): AdjustableUnit => {
    const spells = methodSpellsQuantities(method);
    if (spells) unitsFixedMethod++;
    const ingredients: AdjustableIngredient[] = source.map((line, i) => {
      lineCount++;
      const id = lineId(unitId, i, String(line.term ?? ""));
      lines.set(id, line);
      // ⟳ LOT A (2026-09-11) — L'IDENTIFIANT D'ABORD, le libellé ensuite.
      const ref = resolveCompositionLine(args.index, {
        term: String(line.term ?? ""),
        ref: line.ref ?? null,
        refRefused: line.refRefused === true,
      }).ref;
      // ── CE QUI VERROUILLE UNE LIGNE, ET DANS CET ORDRE ─────────────────
      let lock: LineLockReason | null = null;
      if (ref === null) lock = "unresolved";
      else if (line.amount === null || line.unit === null) lock = "no_structured_amount";
      else if (line.unit === "unit") lock = "counted_unit";
      else if (
        String(line.quantity ?? "").trim().length > 0 &&
        rewriteLeadingNumber(line.quantity, 1) === null
      ) lock = "prose_not_numeric";
      if (lock !== null) locked[lock]++;
      const baseline = args.baselineOf(id);
      return {
        ingredientId: id,
        term: String(line.term ?? ""),
        // ⟳ LOT A — L'IDENTITÉ VOYAGE AVEC LA LIGNE jusqu'à la `MeasureFn`.
        ref: line.ref ?? null,
        refRefused: line.refRefused === true,
        grams: line.gramsRaw,
        // ⚠️ `baselineGrams` retombe sur la ligne COURANTE quand l'appelant n'a
        // pas de passe précédente. C'est le cas nominal d'une première passe, et
        // le lot D l'écrit: « égal à `grams` à la première passe ».
        baselineGrams: baseline ?? line.gramsRaw,
        // ⛔ LE GROUPE VIENT DU RÉFÉRENTIEL, PAS DU CHAMP DÉCLARÉ PAR LE
        // MODÈLE. `DishIngredient.group` n'est demandé au modèle QUE lorsqu'un
        // régime est déclaré: sur toute la population sans régime il vaut
        // `null`, et la garde nommée du lot D — le plafond de 125 % sur les
        // graisses ajoutées — serait désarmée sur la majorité des plans. La
        // fiche du référentiel, elle, porte toujours son groupe.
        group: ref === null ? (line.group ?? null) : ref.foodGroupRef,
        isCondiment: ref !== null && ref.condimentGrams !== null,
        fixed: lock !== null,
      };
    });
    // ⟳ LOT D — LA STRUCTURE CULINAIRE, VALIDÉE PAR LE MOTEUR.
    //
    // ⛔ LE GROUPE DONNÉ À LA VALIDATION EST CELUI DU RÉFÉRENTIEL, exactement
    // comme pour les bornes: c'est lui qui doit pouvoir rétrograder un
    // « accompagnement » fait uniquement d'huile, de tahini ou de fromage. Le
    // champ `group` déclaré par le modèle vaut `null` sur toute la population
    // sans régime — s'y fier désarmerait la garde là où elle sert le plus.
    const bodies = bodiesOfUnit({
      unitId,
      lines: ingredients.map((ing, i) => ({
        lineId: ing.ingredientId,
        part: source[i]?.part ?? null,
        group: ing.group,
        weighed: ing.grams !== null,
      })),
      declared: (declared ?? []).map((c) => ({
        id: String(c.id ?? ""),
        role: c.role ?? null,
        partOf: c.partOf ?? null,
      })),
      counters: structure,
    });
    return {
      unitId,
      kind,
      ingredients,
      adjustable: !spells,
      fixedReason: spells ? "method_spells_quantities" : null,
      bodies,
    };
  };

  const units: AdjustableUnit[] = [];
  for (const prep of args.preparations) {
    units.push(
      buildUnit(
        prepUnitId(String(prep.id)),
        "preparation",
        prep.method,
        prep.ingredients ?? [],
        prep.components,
      ),
    );
  }
  for (const [i, dish] of args.dishes.entries()) {
    units.push(
      buildUnit(dishUnitId(i), "dish", dish.method, dish.ingredients ?? [], dish.components),
    );
  }
  return {
    units,
    lines,
    counts: {
      units: units.length,
      units_fixed_method: unitsFixedMethod,
      lines: lineCount,
      lines_locked: locked,
      structure,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES CONSOMMATEURS
// ═══════════════════════════════════════════════════════════════════════════

/** Le couloir d'UNE assiette: quel plat, pour qui, entre quelles densités. */
export interface PlateCorridor {
  /** Le rang du plat dans `meal.dishes`. */
  dishIndex: number;
  /** Ce qui distingue deux assiettes du même plat. Jamais rendu au journal. */
  eaterKey: string;
  minPer100G: number | null;
  maxPer100G: number | null;
  preferredPer100G: number | null;
}

/**
 * LES COULOIRS → DES CONTRAINTES DE CONSOMMATEUR.
 *
 * ⛔ LA PART D'UNE CASSEROLE EST `1 / TIRAGES`. Voir l'arbitrage en tête de
 * fichier: c'est la division que `measurePlate` fait, donc celle que le moteur
 * JUGE. En prendre une autre fermerait un couloir que personne ne regarde.
 *
 * ⚠️ UNE CASSEROLE CITÉE ET ABSENTE DU PLAN N'EST PAS SAUTÉE EN SILENCE: elle
 * est comptée (`missing_pots`). `measurePlate` éteint l'énergie de l'assiette
 * dans ce cas — l'ajusteur, lui, verra un consommateur non mesurable.
 */
export function consumersOfPlan(args: {
  dishes: readonly AdjustablePlanDish[];
  preparations: readonly AdjustablePlanPreparation[];
  corridors: readonly PlateCorridor[];
}): { consumers: ConsumerConstraint[]; missingPots: number } {
  const known = new Set(args.preparations.map((p) => String(p.id)));
  // Le nombre de PLATS qui tirent sur chaque casserole — `drawsByPreparation`,
  // recopié ici pour ne pas importer `portion_sizing.ts` (qui importe déjà ce
  // module par la bande, via `preparation_mass.ts`).
  const draws = new Map<string, number>();
  for (const d of args.dishes) {
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (id) draws.set(id, (draws.get(id) ?? 0) + 1);
    }
  }
  let missingPots = 0;
  const consumers: ConsumerConstraint[] = [];
  for (const c of args.corridors) {
    const dish = args.dishes[c.dishIndex];
    if (dish === undefined) continue;
    const parts: { unitId: string; share: number }[] = [
      { unitId: dishUnitId(c.dishIndex), share: 1 },
    ];
    for (const u of dish.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      if (!known.has(id)) {
        missingPots++;
        continue;
      }
      parts.push({ unitId: prepUnitId(id), share: 1 / Math.max(1, draws.get(id) ?? 1) });
    }
    consumers.push({
      consumerId: `${c.dishIndex}|${c.eaterKey}`,
      parts,
      minPer100G: c.minPer100G,
      maxPer100G: c.maxPer100G,
      preferredPer100G: c.preferredPer100G,
    });
  }
  return { consumers, missingPots };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA MESURE — la même que la production, en fermeture sur l'index
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA `MeasureFn` DU LOT D, BRANCHÉE SUR LE RÉFÉRENTIEL.
 *
 * ⛔ ELLE APPELLE `measurePreparation` ET `measureFresh` — les deux lecteurs du
 * lot B, ceux-là mêmes que `measurePlate` emploie. Recopier leur arithmétique
 * ici en ferait un troisième lecteur de la règle de l'eau, et c'est celui qu'on
 * relit le moins qui garderait l'ancienne.
 *
 * ⚠️ LES QUANTITÉS ARRIVENT EN GRAMMES CRUS, ET ON LES REDONNE COMME TELLES
 * (`unit: "g"`, `state: "raw"`). C'est exact par construction: `gramsRaw` EST
 * la quantité crue que le parseur a recalculée, et la conversion cru→prêt est
 * refaite par la mesure. Repasser `amount`/`unit` d'origine ferait convertir
 * deux fois.
 *
 * ⛔ L'UNITÉ SE LIT SUR LE PREMIER IDENTIFIANT, ET ELLE NE PEUT PAS ÊTRE
 * DEVINÉE AUTREMENT: la `MeasureFn` du lot D reçoit une liste nue. Le lot D
 * mesure toujours une unité entière (sa liste complète, sondée ligne à ligne),
 * donc toutes les lignes d'un appel portent le même préfixe.
 */
export function measureOfPlan(args: {
  index: CompositionIndex;
  preparations: readonly AdjustablePlanPreparation[];
  dishes: readonly AdjustablePlanDish[];
}): MeasureFn {
  const preps = new Map(args.preparations.map((p) => [prepUnitId(String(p.id)), p]));
  const dishes = new Map(
    args.dishes.map((d, i) => [dishUnitId(i), d] as const),
  );
  return (ingredients) => {
    if (ingredients.length === 0) return { kcal: 0, readyG: 0 };
    const unitId = unitOfLineId(ingredients[0].ingredientId);
    const inputs = ingredients.map((ing) => ({
      term: ing.term,
      amount: ing.grams,
      unit: "g" as CompositionUnit,
      state: "raw" as CompositionState,
      group: ing.group,
      // ⟳ LOT A (2026-09-11) — SANS CES DEUX CHAMPS, L'AJUSTEUR MESURAIT AUTRE
      // CHOSE QUE LE MOTEUR. La `MeasureFn` reconstruit une liste nue pour
      // `measurePreparation`/`measureFresh`; n'y remettre que le terme
      // ramenait le libellé au centre du calcul, à l'endroit exact où le lot
      // vient de l'en retirer.
      ref: ing.ref ?? null,
      refRefused: ing.refRefused === true,
    }));
    const prep = preps.get(unitId);
    if (prep !== undefined) {
      const m = measurePreparation(args.index, {
        id: String(prep.id),
        method: prep.method ?? null,
        ingredients: inputs,
      });
      return { kcal: m.kcal, readyG: m.readyG };
    }
    const dish = dishes.get(unitId);
    if (dish !== undefined) {
      const m = measureFresh(args.index, {
        method: dish.method ?? null,
        ingredients: inputs,
      });
      return { kcal: m.kcal, readyG: m.readyG };
    }
    // ⛔ UNE UNITÉ INCONNUE NE REND PAS ZÉRO. Zéro se lit « cette casserole ne
    // pèse rien », ce qui est un fait; `null` se lit « on ne sait pas », ce qui
    // est la vérité. Le lot D compte les deux séparément.
    return { kcal: null, readyG: null };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ L'APPLICATION — les quantités structurées ET la prose, ensemble
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplyAdjustmentCounts {
  /** Les lignes dont la quantité a changé. */
  rewritten: number;
  /** Les lignes dont la prose a été renumérotée. */
  prose_rewritten: number;
  /**
   * ⛔ LES LIGNES QU'ON A CHANGÉES SANS SAVOIR RÉÉCRIRE LEUR PROSE. DOIT RESTER
   * 0: `unitsOfPlan` verrouille ces lignes à la construction. Non nul, il dit
   * qu'une quantité ancienne est restée dans le texte lu par l'humain.
   */
  prose_stale: number;
  /** Les identifiants rendus par l'ajusteur qui ne retrouvent aucune ligne. */
  unknown_lines: number;
}

/**
 * LES NOUVELLES QUANTITÉS, ÉCRITES DANS LE PLAN.
 *
 * ⚠️ `amount` EST MIS À L'ÉCHELLE, `unit` ET `state` NE BOUGENT PAS. Une ligne
 * « 200 g cuit » reste en grammes cuits: on multiplie son nombre par le rapport
 * des grammes CRUS, ce qui est exact parce que la conversion cru↔cuit est
 * linéaire en la quantité (`gramsRawOf`). Réécrire l'unité en grammes crus
 * changerait le texte de la recette sans qu'on le demande.
 *
 * ⛔ `gramsRaw` EST ÉCRIT AUSSI, et l'appelant DOIT quand même relancer
 * `regramMeal`: c'est lui l'autorité sur ce champ, et deux écritures qui
 * divergeraient se verraient au tour suivant. Celle-ci existe pour que le plan
 * soit cohérent ENTRE les deux, si une garde lit avant le regrammage.
 */
export function applyAdjustment(args: {
  result: AdjustResult;
  lines: ReadonlyMap<string, AdjustablePlanLine>;
}): ApplyAdjustmentCounts {
  const counts: ApplyAdjustmentCounts = {
    rewritten: 0,
    prose_rewritten: 0,
    prose_stale: 0,
    unknown_lines: 0,
  };
  for (const unit of args.result.units) {
    if (!unit.touched) continue;
    for (const ing of unit.ingredients) {
      if (ing.grams === null || ing.beforeGrams === null) continue;
      if (ing.grams === ing.beforeGrams) continue;
      const line = args.lines.get(ing.ingredientId);
      if (line === undefined) {
        counts.unknown_lines++;
        continue;
      }
      const factor = ing.beforeGrams > 0 ? ing.grams / ing.beforeGrams : null;
      if (factor === null || !Number.isFinite(factor)) {
        counts.unknown_lines++;
        continue;
      }
      const nextAmount = line.amount === null
        ? null
        : Math.round(line.amount * factor * 100) / 100;
      if (nextAmount === null) {
        // Sans `amount`, la ligne aurait dû être verrouillée en amont.
        counts.prose_stale++;
        continue;
      }
      line.amount = nextAmount;
      line.gramsRaw = Math.round(ing.grams * 10) / 10;
      counts.rewritten++;
      const prose = rewriteLeadingNumber(line.quantity, nextAmount);
      if (prose !== null) {
        line.quantity = prose;
        counts.prose_rewritten++;
      } else if (String(line.quantity ?? "").trim().length > 0) {
        counts.prose_stale++;
      }
    }
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LES SIX ÉTAPES EN UNE, POUR QUE LES DEUX CHEMINS EN LISENT UNE SEULE
// ═══════════════════════════════════════════════════════════════════════════

export interface PlanAdjustment {
  result: AdjustResult;
  apply: ApplyAdjustmentCounts;
  /** Les unités dont au moins une quantité a bougé — `prep:<id>` / `dish:<rang>`. */
  touchedUnitIds: readonly string[];
  units: UnitsOfPlan["counts"];
  missingPots: number;
  /** Le temps de l'ajustement, en millisecondes. L'horloge est un ARGUMENT. */
  ms: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AJUSTER LES PROPORTIONS D'UN PLAN — construire, ajuster, écrire.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UNE SEULE IMPLÉMENTATION POUR LES DEUX CHEMINS. Le générateur du foyer a
 * un chemin pour UNE bouche et un chemin pour la table, et ce dépôt a déjà payé
 * plusieurs fois le prix de deux lectures qui divergent — c'est toujours celle
 * qu'on relit le moins qui garde l'ancienne règle. Les deux appellent donc
 * ceci, avec leurs propres couloirs.
 *
 * ⚠️ CE QUE CETTE FONCTION NE FAIT PAS, ET QUE L'APPELANT DOIT FAIRE ENSUITE:
 * recalculer les grammes crus (`regramMeal` fait autorité sur ce champ),
 * invalider le `density_check` des plats qui tirent sur `touchedUnitIds`, et
 * REMESURER. Elles ne sont pas ici parce qu'elles ne sont pas pures: elles
 * touchent le parseur, la ligne écrite et la mesure du moteur.
 *
 * @param now l'horloge, en ARGUMENT — ce module reste pur.
 *
 * PURE: no I/O, no randomness. L'horloge est un argument.
 */
export function adjustPlanProportions(args: {
  index: CompositionIndex;
  dishes: readonly AdjustablePlanDish[];
  preparations: readonly AdjustablePlanPreparation[];
  corridors: readonly PlateCorridor[];
  /** Les grammes crus de la recette INITIALE acceptée. `() => null` à la 1ʳᵉ passe. */
  baselineOf: (lineId: string) => number | null;
  now: () => number;
}): PlanAdjustment | null {
  if (args.corridors.length === 0) return null;
  const built = unitsOfPlan({
    index: args.index,
    dishes: args.dishes,
    preparations: args.preparations,
    baselineOf: args.baselineOf,
  });
  const { consumers, missingPots } = consumersOfPlan({
    dishes: args.dishes,
    preparations: args.preparations,
    corridors: args.corridors,
  });
  const started = args.now();
  const result = adjustProportions({
    units: built.units,
    consumers,
    measure: measureOfPlan({
      index: args.index,
      preparations: args.preparations,
      dishes: args.dishes,
    }),
  });
  const ms = Math.max(0, args.now() - started);
  const apply = applyAdjustment({ result, lines: built.lines });
  return {
    result,
    apply,
    touchedUnitIds: result.units.filter((u) => u.touched).map((u) => u.unitId),
    units: built.counts,
    missingPots,
    ms,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ ⟳ LOT D — CE QUE LE MODÈLE DOIT SAVOIR QUAND L'AJUSTEUR N'A PAS TROUVÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES COMPOSANTS QUE LE MOTEUR NE TOUCHERA PAS, ÉCRITS POUR LE MODÈLE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE PLAN L'EXIGE, POINT 8: « Si aucune solution n'est trouvée dans les
 * limites culinaires, fournir au modèle les écarts numériques ET LES COMPOSANTS
 * VERROUILLÉS, dans le budget existant. Ne pas appeler cette issue
 * mathématiquement impossible. » Les écarts numériques voyagent déjà —
 * `repairInstruction` porte le couloir de densité, sa visée et son plancher. Ce
 * qui manquait est la seconde moitié: POURQUOI le moteur n'a pas fermé l'écart
 * tout seul, et ce qu'il ne changera pas si le modèle le lui rend tel quel.
 *
 * ⚠️ C'EST UNE INFORMATION, PAS UN ORDRE. Le modèle a le droit de RECOMPOSER —
 * changer un aliment, changer le plat. Ce qu'il ne peut pas obtenir, c'est que
 * le moteur déforme une sauce à sa place.
 *
 * Rend `""` quand il n'y a rien à dire: un bloc vide ne coûte pas un caractère
 * de prompt sur une lane dont une génération réelle a déjà mis 144 s pour un
 * mur de Kong à 150.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function lockedComponentsBrief(args: {
  index: CompositionIndex;
  dishes: readonly AdjustablePlanDish[];
  preparations: readonly AdjustablePlanPreparation[];
  /** Les rangs des plats concernés — ceux dont la réparation est demandée. */
  dishIndexes: readonly number[];
}): string {
  if (args.dishIndexes.length === 0) return "";
  const built = unitsOfPlan({
    index: args.index,
    dishes: args.dishes,
    preparations: args.preparations,
    baselineOf: () => null,
  });
  const byUnitId = new Map(built.units.map((u) => [u.unitId, u]));
  const rows: string[] = [];
  for (const i of args.dishIndexes) {
    const dish = args.dishes[i];
    if (dish === undefined) continue;
    const ids = [
      dishUnitId(i),
      ...(dish.uses ?? [])
        .map((u) => String(u?.preparationId ?? ""))
        .filter((id) => id.length > 0)
        .map(prepUnitId),
    ];
    for (const unitId of ids) {
      const unit = byUnitId.get(unitId);
      if (unit === undefined) continue;
      const locked = unit.bodies.filter((b) => !b.movable);
      if (locked.length === 0) continue;
      for (const body of locked) {
        // ⛔ ON NOMME LES ALIMENTS, PAS L'IDENTIFIANT DU CORPS. Un `dish:3~all`
        // ne veut rien dire pour le modèle, et lui rendre nos jetons internes
        // est le geste que ce dépôt paie en boucle (« KEEL » est un nom de code
        // interne, la fuite est passée par les DONNÉES).
        const terms = body.lineIds
          .map((id) => unit.ingredients.find((ing) => ing.ingredientId === id)?.term ?? "")
          .filter((t) => t.length > 0);
        if (terms.length === 0) continue;
        rows.push(`  · ${terms.join(", ")} — their proportions to each other stay as written`);
      }
    }
  }
  if (rows.length === 0) return "";
  return [
    "",
    "THE APP WILL NOT RESHAPE THESE — IT DOES NOT KNOW WHAT HOLDS THEM:",
    ...rows,
    "It can still scale a whole recipe up or down. What it will not do is change",
    "the ratio inside a mix it cannot read, so if the numbers need a different",
    "balance there, write that balance yourself.",
  ].join("\n");
}
