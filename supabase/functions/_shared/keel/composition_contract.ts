/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT DE COMPOSITION — ce que le modèle a le droit de nommer, et avec
 * quels nombres. Lot C du chantier « fiabiliser la composition dès le premier
 * jet » (2026-09-11).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT MESURÉ QUE CE MODULE FERME ─────────────────────────────────
 * `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` §3 : le couloir de densité
 * EST transmis, CIQUAL et le poids cuit SONT nommés — et le modèle rend quand
 * même :
 *
 *   · PERTE poulet/quinoa/yaourt — **141 déclarés, 105,4 mesurés** (min. 123) ;
 *   · GAIN lentilles/pain/feta  — **159 déclarés,  92,2 mesurés** (min. 146).
 *
 * La cause n'est pas la consigne, elle est la TABLE : « il ne reçoit ni les
 * références effectivement sélectionnées, ni leurs valeurs et rendements
 * exacts ; aucun outil de calcul n'est fourni (`has_tools: false`) ». Il devine
 * une partie de la table, puis s'autocontrôle avec ce qu'il a deviné.
 *
 * Ce module rend la table. Pas toute : le référentiel porte **943 lignes**, et
 * le prompt du foyer pèse déjà 18 à 23 ko de système plus 11 à 53 ko de
 * message. Envoyer 943 lignes coûterait ~60 ko — la moitié du prompt, sur une
 * lane dont une génération réelle a déjà mis **144 s** quand Kong coupe à 150
 * (mémoire `generation-model-times-out-on-household-prompt`). La sélection est
 * donc la moitié du travail, et son coût en caractères est mesuré
 * (`counters.chars`), pas estimé.
 *
 * ── ⛔ CE MODULE NE LIT PAS LE RÉFÉRENTIEL DE VALIDATION, IL LE REÇOIT ────
 * `isComposable` vit dans `food_reference_manifest.ts` (lot A). Ce module ne
 * l'importe pas et le reçoit en ARGUMENT — d'abord parce que le manifeste
 * n'existait pas encore quand ces lignes ont été écrites, et surtout parce que
 * ça laisse le module PUR et testable sans base. Le parseur de
 * `meal_generation.ts`, lui, l'a bien pour DÉFAUT: là-bas, un appelant qui
 * oublie l'argument doit obtenir la règle, pas son absence.
 *
 * `ANY_INDEXED_REF` est le prédicat « tout ce que l'index porte ». Il n'existe
 * que pour un usage, et il est nommé pour qu'on le voie : rejouer une MESURE
 * sur un plan historique (arbitrage ② du socle — la porte est à la
 * composition, pas à la mesure).
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type {
  CompositionIndex,
  CompositionRef,
} from "./food_composition.ts";
import { resolveCompositionLine } from "./food_composition.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";
import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA PORTE DE COMPOSITION — injectée, jamais devinée
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA SIGNATURE EXACTE DE `isComposable` (socle commun §8, interface figée).
 *
 * Le lot A la rend depuis `food_reference_manifest.ts`. Tout ce module, et le
 * parseur de `meal_generation.ts`, écrivent CONTRE ce type — pas contre le
 * fichier, qui peut arriver après.
 */
export type ComposablePredicate = (ref: CompositionRef) => boolean;

/**
 * ⛔ LA PORTE OUVERTE, ET ELLE PORTE SON NOM.
 *
 * « Tout ce que l'index porte est composable » est le comportement d'avant le
 * lot A. Ce n'est le DÉFAUT de personne : le parseur prend `isComposable`. Ce
 * prédicat-ci sert à l'ouvrir SCIEMMENT, pour une MESURE — rejouer un plan déjà
 * servi doit rester possible et rester honnête. Il est nommé pour qu'un
 * appelant qui le passe sache exactement ce qu'il désarme :
 * `optional-gate-params-are-disarmed-gates`, la cicatrice n°1 du dépôt, se paie
 * toujours par un défaut ANONYME.
 */
export const ANY_INDEXED_REF: ComposablePredicate = () => true;

// ═══════════════════════════════════════════════════════════════════════════
// ② LA SÉLECTION — les plafonds, et pourquoi ils valent ce qu'ils valent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * COMBIEN DE LIGNES PAR GROUPE ALIMENTAIRE, ET POURQUOI PAS LE MÊME NOMBRE
 * PARTOUT.
 *
 * ── LE PROBLÈME EST UNE DENSITÉ, PAS UNE VARIÉTÉ ─────────────────────────
 * Les deux écarts mesurés (141→105,4 et 159→92,2) sont des écarts de DENSITÉ.
 * Une densité se rate par les porteurs d'énergie : le féculent qui triple à la
 * cuisson, la légumineuse qui double, la matière grasse à 900 kcal. Un légume
 * aqueux pèse 20 à 40 kcal/100 g et le modèle ne se trompe pas beaucoup
 * dessus ; une huile qu'il oublie retire 120 kcal d'une assiette
 * (`unweighed-dense-food-loses-energy-silently`). Les plafonds suivent donc le
 * rôle du groupe dans le calcul, pas sa taille dans la table : `red_meat` porte
 * 290 des 943 lignes et n'en reçoit que 6.
 *
 * ── ⛔ ZÉRO EST UNE VALEUR, ET ELLE EST ÉCRITE ───────────────────────────
 * Six groupes ne composent pas un repas dans ce produit : l'alcool, les boissons
 * sucrées, l'eau, le café/thé, les sucreries et le « fried_food ». Les montrer
 * reviendrait à les proposer. Ils sont à `0`, explicitement, et pas absents de
 * la table : une clé manquante se relirait comme un oubli.
 *
 * ⚠️ CES NOMBRES SONT DES CONVENTIONS, PAS DES MESURES. Aucun run modèle n'a
 * été fait ce soir (interdit du lot). Ce qui est mesuré, c'est leur COÛT :
 * `counters.chars`, mesuré sur le texte que `renderCatalogBlock` vient d'écrire.
 */
export const CATALOG_GROUP_CAPS: Readonly<Record<FoodGroupRef, number>> = Object
  .freeze({
    // — LES PORTEURS D'ÉNERGIE. C'est là que la densité se gagne ou se perd :
    //   100 g de riz sec font 350 kcal/100 g, cuits 130.
    whole_grain: 8,
    refined_grain: 8,
    starchy_veg: 7,
    legumes: 8,
    // — LES PROTÉINES. Le plancher protéique existe déjà (`meal_envelope.ts`)
    //   et se rate quand le modèle se trompe de coupe.
    poultry: 6,
    red_meat: 6,
    white_fish: 5,
    fatty_fish: 5,
    shellfish: 3,
    eggs: 3,
    tofu_tempeh: 4,
    lean_protein: 3,
    dairy_cheese: 6,
    dairy_yogurt: 6,
    // — LES GRAISSES. Le plus petit nombre de lignes pour le plus gros effet
    //   par gramme : 900 kcal/100 g contre 30 pour une courgette.
    olive_oil: 2,
    other_added_fat: 5,
    nuts_seeds: 5,
    // — LES LÉGUMES. Nombreux dans une recette, faibles en énergie.
    non_starchy_veg: 8,
    cruciferous_veg: 5,
    leafy_greens: 4,
    // — LES FRUITS. Le piège `raisin`/`prune`/`poire` du chantier vit ici :
    //   c'est la colonne « nom » qui fait le travail, pas le nombre de lignes.
    other_fruit: 5,
    berries: 4,
    citrus: 3,
    // — L'ASSAISONNEMENT.
    sauce_dressing: 3,
    // — ⛔ CE QUI NE COMPOSE PAS UN REPAS ICI.
    sugar_sweets: 0,
    fried_food: 0,
    alcohol: 0,
    sweetened_beverage: 0,
    water: 0,
    coffee_tea: 0,
  });

/**
 * LE PLAFOND TOTAL, APRÈS LES PLAFONDS PAR GROUPE.
 *
 * La somme des plafonds par groupe vaut 122 ; celui-ci est la seconde ceinture,
 * celle qui tient quand quelqu'un relève un groupe sans regarder le total. Il
 * mord dans l'ordre des groupes (`FOOD_GROUP_REFS`), donc de façon
 * déterministe, et ce qu'il coupe est COMPTÉ (`over_total_cap`).
 */
export const CATALOG_TOTAL_CAP = 140;

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QU'UNE LIGNE DIT
// ═══════════════════════════════════════════════════════════════════════════

/** Une ligne du catalogue montré au modèle. */
export interface CatalogEntry {
  /** L'identifiant que le modèle devra rendre dans `ref`. */
  slug: string;
  group: FoodGroupRef;
  /**
   * LE LIBELLÉ, **seulement quand il dit autre chose que l'identifiant**.
   *
   * ⛔ CE N'EST PAS UNE ÉCONOMIE COSMÉTIQUE. 650 des 943 libellés sont la
   * simple mise en mots du slug (`chicken_breast` → « Chicken breast, raw ») :
   * les répéter coûterait ~45 caractères par ligne pour zéro information. Les
   * 293 autres portent la distinction qui fait tout le chantier — `prune`
   * signifie « Plum, dried » et pas « prune », `raisin` signifie « Raisin,
   * sec ». C'est exactement là que le libellé doit apparaître.
   */
  label: string | null;
  /** kcal pour 100 g CRUS, arrondi à l'entier (voir `roundKcal`). */
  kcalPer100G: number;
  /** g pour 100 g crus. `null` = la table ne le donne pas. Jamais 0 par défaut. */
  proteinG: number | null;
  /**
   * LE RENDEMENT CRU → CUIT. `null` quand il vaut 1, c'est-à-dire quand il n'y
   * a rien à convertir — une huile, un yaourt, un fruit cru.
   */
  cookedYield: number | null;
  /** Ce que pèse UNE unité, quand « une » de cet aliment veut dire quelque chose. */
  unitGrams: number | null;
  /** La masse conventionnelle d'un condiment. */
  condimentGrams: number | null;
}

/**
 * CE QUE LA SÉLECTION A JETÉ, ET POUR QUELLE RAISON.
 *
 * ⛔ SEPT COMPTEURS ET PAS UN SEUL. « 803 lignes écartées » ne permet de
 * réparer rien du tout : un référentiel dont la moitié tombe en
 * `not_composable` appelle le lot A, un qui tombe en `over_group_cap` appelle
 * une relecture des plafonds. Les fondre ferait d'un référentiel cassé et d'un
 * plafond serré le même chiffre.
 */
export interface CatalogCounters {
  /** Toutes les lignes de l'index, avant quoi que ce soit. */
  considered: number;
  /** Refusées par `isComposable` — la porte du lot A. */
  not_composable: number;
  /** Dans un groupe dont le plafond vaut 0 (alcool, sucreries, boissons…). */
  group_never_composed: number;
  /** Dans un groupe que le régime ou une allergie retire de la table. */
  group_excluded: number;
  /** Dont le nom est mordu par un interdit alimentaire. */
  term_excluded: number;
  /** Composables et pertinentes, mais au-delà du plafond de leur groupe. */
  over_group_cap: number;
  /** Au-delà du plafond TOTAL, après les plafonds par groupe. */
  over_total_cap: number;
  kept: number;
  /**
   * LE COÛT DU BLOC RENDU, EN CARACTÈRES — celui de `lines`, exactement.
   * `0` quand le catalogue est vide, parce qu'alors rien n'est servi.
   *
   * ⛔ IL EXISTE PARCE QUE LE BUDGET EST LA CONTRAINTE DURE DE CE LOT, et
   * qu'un budget qu'on n'instrumente pas est un budget qu'on dépasse sans le
   * savoir. Il sort avec le catalogue, pas dans un commentaire.
   */
  chars: number;
}

export interface CompositionCatalog {
  entries: readonly CatalogEntry[];
  /**
   * LE BLOC PRÊT À SERVIR. Rendu ICI et pas par l'appelant, pour que
   * `counters.chars` mesure exactement ce qui part — un coût calculé sur autre
   * chose que le texte servi est un coût inventé.
   */
  lines: readonly string[];
  counters: CatalogCounters;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ARRONDI DES kcal, ET CE QU'IL COÛTE.
 *
 * À l'entier. Sur `cream_cheese_fat_free` (49,4) l'écart est de 1,2 % ; sur un
 * porteur d'énergie (riz 350, huile 900) il est sous 0,15 %. Le design de ce
 * dépôt accepte déjà ±10-15 % d'erreur de table et de cuisson
 * (`food_composition.ts`, pavé `ML_TO_G`) : l'arrondi est deux ordres de
 * grandeur sous ce bruit, et il économise 2 caractères par ligne.
 *
 * ⚠️ IL N'EST PAS APPLIQUÉ AU CALCUL. Le moteur pèse avec la valeur exacte de
 * la base ; ce nombre-ci ne sert qu'à ÉCRIRE la table pour le modèle.
 */
function roundKcal(kcal: number): number {
  return Math.round(kcal);
}

/** Les protéines: un chiffre après la virgule suffit à 1 g près sur 100 g. */
function roundProtein(g: number): number {
  return Math.round(g * 10) / 10;
}

/**
 * LES MOTS DE LIBELLÉ QUI N'AJOUTENT RIEN À UN IDENTIFIANT.
 *
 * ⛔ LISTE FERMÉE, ET COURTE EXPRÈS. Mesuré sur les 943 lignes du référentiel :
 * 304 libellés sont EXACTEMENT la mise en mots du slug, 200 de plus n'ajoutent
 * que « raw », 13 « prepacked », 8 « (average) ». Ces trois mots-là ne
 * distinguent aucun aliment d'un autre — l'état cru est déjà dit une fois en
 * tête du bloc, « prepacked » est un emballage et « average » une mention de
 * la table CIQUAL.
 *
 * ⛔ TOUT LE RESTE EST DE L'INFORMATION ET RESTE. « canned », « dried »,
 * « cooked », « drained », « frozen », « roasted » changent l'aliment et
 * souvent son énergie d'un facteur trois (100 g de pois chiches secs, 331
 * kcal ; en conserve égouttés, 122). Les jeter pour gagner des caractères
 * serait refaire, du côté du catalogue, le défaut frais/sec que ce chantier
 * répare.
 */
const LABEL_NOISE_WORDS: ReadonlySet<string> = new Set([
  "",
  "raw",
  "average",
  "prepacked",
]);

/**
 * LE LIBELLÉ AJOUTE-T-IL QUELQUE CHOSE À L'IDENTIFIANT ?
 *
 * La règle est mécanique et n'invente rien : on met le libellé en snake_case et
 * on regarde s'il COMMENCE par le slug. Si oui, ce qui RESTE après le slug est
 * examiné mot à mot : du bruit connu ⇒ le libellé ne dit rien de plus et il
 * part ; n'importe quoi d'autre ⇒ il reste.
 *
 * « Chicken breast, raw » → reste « raw » ⇒ retiré. « Chickpeas, canned,
 * drained » ne commence même pas par `chickpeas_tinned` ⇒ gardé. « Plum,
 * dried » sur un slug `plum` → reste « dried » ⇒ gardé, et c'est exactement le
 * cas frais/sec du chantier.
 *
 * ⚠️ CE QUE CETTE RÈGLE NE PEUT PAS RÉPARER, et il faut le savoir avant de s'y
 * fier : quand la ligne du référentiel est elle-même fausse, le libellé l'est
 * aussi. Mesuré le 2026-09-11 : `prune` porte le libellé « Prune » (rien d'autre)
 * pour 229 kcal, c'est-à-dire un fruit SEC sous un mot qui désigne un fruit
 * frais en français ; `pear` porte un code CIQUAL dont la ligne dit
 * « Poireau, cru ». Aucun rendu de catalogue ne rattrape ça — c'est le
 * référentiel qu'il faut corriger (lot A), et c'est `isComposable` qui doit
 * alors retirer ces lignes du catalogue.
 */
export function labelAddsToSlug(slug: string, label: string): boolean {
  const flat = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+/, "");
  if (!flat.startsWith(slug)) return true;
  const rest = flat.slice(slug.length).split("_");
  return rest.some((w) => !LABEL_NOISE_WORDS.has(w));
}

/**
 * COMBIEN DE FAÇONS DE NOMMER CET ALIMENT LE RÉFÉRENTIEL CONNAÎT.
 *
 * ⛔ C'EST LE CLASSEMENT, ET IL N'EST PAS ARBITRAIRE. Le premier réflexe —
 * « le slug le plus court est l'aliment le plus générique » — a été essayé et
 * MESURÉ FAUX sur ce référentiel : il classe `duck_meat`, `capon_meat`,
 * `goose_meat`, `liver_duck` et `guinea_fowl` devant `chicken_meat`, et un
 * plafond de 6 sur `poultry` sortait donc un catalogue de volaille SANS POULET.
 *
 * Le nombre d'alias, lui, donne `chicken_breast` (13), `chicken_thigh` (12),
 * `lentils_dry` (13), `tomato` (17), `carrot` (15), `bell_pepper` (15). Un
 * aliment que le dépôt a appris à reconnaître sous treize orthographes est un
 * aliment que les gens écrivent — donc un aliment qu'on cuisine.
 */
function aliasCounts(index: CompositionIndex): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const slug of index.byAlias.values()) {
    out.set(slug, (out.get(slug) ?? 0) + 1);
  }
  return out;
}

export interface CatalogInput {
  index: CompositionIndex;
  /**
   * ⛔ LA PORTE DU LOT A, INJECTÉE. Passer `ANY_INDEXED_REF` est légitime
   * aujourd'hui (le manifeste n'existe pas encore) et se voit dans le nom.
   */
  isComposable: ComposablePredicate;
  /**
   * LES GROUPES QUE LA TABLE NE MANGE PAS — régime déclaré, allergie étendue
   * en groupes (`allergen_food_groups.ts`).
   *
   * ⛔ REQUIS, `[]` pour « aucun », jamais `?`. Un catalogue qui montre du
   * poisson à un foyer végane est pire qu'un catalogue absent : il PROPOSE. La
   * casse de compilation est le seul recenseur d'appelants qui ne mente pas.
   */
  excludedGroups: readonly FoodGroupRef[];
  /**
   * LES INTERDITS ALIMENTAIRES, DANS LEUR PROPRE VOCABULAIRE.
   *
   * ⛔ C'EST LE TYPE DU MATCHER DU DÉPÔT, PAS UNE LISTE DE CHAÎNES. « Jamais de
   * matcher maison » : « laitue » contient « lait », et un `includes` naïf a
   * rendu 12 faux positifs sur 12 mesurés. `findForbiddenMatches` porte les
   * frontières de mot, les ligatures et les négations fermées.
   */
  forbidden: readonly ForbiddenTerm[];
  /** Le plafond total. Explicite à l'appel: voir `CATALOG_TOTAL_CAP`. */
  totalCap: number;
}

export function buildCompositionCatalog(input: CatalogInput): CompositionCatalog {
  const counters: CatalogCounters = {
    considered: 0,
    not_composable: 0,
    group_never_composed: 0,
    group_excluded: 0,
    term_excluded: 0,
    over_group_cap: 0,
    over_total_cap: 0,
    kept: 0,
    chars: 0,
  };
  const excluded = new Set<string>(input.excludedGroups);
  const aliases = aliasCounts(input.index);

  // ── LE TRI, PAR GROUPE ────────────────────────────────────────────────
  const byGroup = new Map<FoodGroupRef, CompositionRef[]>();
  for (const ref of input.index.bySlug.values()) {
    counters.considered++;
    if (!input.isComposable(ref)) {
      counters.not_composable++;
      continue;
    }
    const group = ref.foodGroupRef;
    const cap = CATALOG_GROUP_CAPS[group];
    // Un groupe hors vocabulaire ne peut pas être plafonné: il est traité comme
    // « jamais composé », et compté là. Taire une ligne dont on ne sait rien
    // serait un repli silencieux.
    if (cap === undefined || cap === 0) {
      counters.group_never_composed++;
      continue;
    }
    if (excluded.has(group)) {
      counters.group_excluded++;
      continue;
    }
    // ⛔ LE NOM ENTIER EST DONNÉ AU MATCHER, slug déplié ET libellé. Un slug
    // `peanut_butter` et un libellé « Peanut butter » sont deux chances de
    // reconnaître l'arachide; n'en donner qu'une en laisserait passer une.
    const haystack = `${ref.slug.replace(/_/g, " ")} ${ref.label}`;
    if (
      input.forbidden.length > 0 &&
      findForbiddenMatches(haystack, input.forbidden).length > 0
    ) {
      counters.term_excluded++;
      continue;
    }
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(ref);
    else byGroup.set(group, [ref]);
  }

  // ── LE CLASSEMENT, PUIS LES DEUX PLAFONDS ─────────────────────────────
  const entries: CatalogEntry[] = [];
  for (const group of FOOD_GROUP_REFS) {
    const bucket = byGroup.get(group);
    if (!bucket) continue;
    bucket.sort((a, b) => {
      const na = aliases.get(a.slug) ?? 0;
      const nb = aliases.get(b.slug) ?? 0;
      if (na !== nb) return nb - na;
      if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    const cap = CATALOG_GROUP_CAPS[group];
    for (const [rank, ref] of bucket.entries()) {
      if (rank >= cap) {
        counters.over_group_cap++;
        continue;
      }
      if (entries.length >= input.totalCap) {
        counters.over_total_cap++;
        continue;
      }
      entries.push({
        slug: ref.slug,
        group,
        label: labelAddsToSlug(ref.slug, ref.label) ? ref.label : null,
        kcalPer100G: roundKcal(ref.energyKcal),
        proteinG: ref.proteinG === null ? null : roundProtein(ref.proteinG),
        // ⚠️ `yieldFactor` d'abord, la CLASSE ensuite — c'est l'ordre de
        // `yieldFactorOf` dans `food_composition.ts`. Deux lectures de ce
        // rendement divergeraient, et c'est celle qu'on relit le moins qui
        // garderait l'ancienne.
        cookedYield: cookedYieldOf(ref),
        unitGrams: ref.unitGrams,
        condimentGrams: ref.condimentGrams,
      });
      counters.kept++;
    }
  }
  const lines = renderCatalogBlock(entries);
  counters.chars = lines.join("\n").length;
  return { entries, lines, counters };
}

/**
 * LE RENDEMENT CRU → CUIT À ÉCRIRE, ou `null` quand il n'y a rien à convertir.
 *
 * ⛔ `null` VEUT DIRE « 1 », PAS « INCONNU ». Une huile, un yaourt, un fruit cru
 * pèsent pareil avant et après: écrire « ×1 » sur 40 lignes coûterait des
 * caractères pour une consigne qui ne demande rien. Un rendement réellement
 * inconnu n'existe pas ici — `yieldClass` est une colonne NOT NULL, et sa
 * classe porte toujours un facteur.
 */
function cookedYieldOf(ref: CompositionRef): number | null {
  const factor = ref.yieldFactor ?? YIELD_BY_CLASS[ref.yieldClass];
  if (!Number.isFinite(factor) || factor === 1) return null;
  return Math.round(factor * 100) / 100;
}

/**
 * ⚠️ RECOPIE ASSUMÉE DE `YIELD_FACTORS`, ET LA RAISON EST UN TYPE.
 * `food_composition.ts` exporte la table; l'importer ici créerait un cycle
 * d'import avec `meal_generation.ts` dans les deux sens. Le test de ce module
 * compare les deux tables clé par clé, donc une divergence rougit.
 */
const YIELD_BY_CLASS: Readonly<Record<string, number>> = Object.freeze({
  neutral: 1.0,
  grain_absorbs: 2.6,
  legume_absorbs: 2.4,
  meat_shrinks: 0.7,
  fish_shrinks: 0.8,
  veg_shrinks: 0.9,
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE BLOC — ce que le modèle lit
// ═══════════════════════════════════════════════════════════════════════════

/** Une ligne du catalogue, dans sa forme la plus courte qui reste lisible. */
export function catalogLine(e: CatalogEntry): string {
  const bits = [e.slug, String(e.kcalPer100G), e.proteinG === null ? "-" : String(e.proteinG)];
  if (e.cookedYield !== null) bits.push(`x${e.cookedYield}`);
  if (e.unitGrams !== null) bits.push(`unit=${e.unitGrams}`);
  if (e.condimentGrams !== null) bits.push(`pinch=${e.condimentGrams}`);
  if (e.label !== null) bits.push(e.label);
  return bits.join(" ");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BLOC, ET LA CLÉ DE SCHÉMA QUI VA AVEC — ELLES SE TOUCHENT, EXPRÈS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA DEMANDE DE `ref` VIT **DANS** CE BLOC, PAS DANS LE SCHÉMA DE SORTIE.
 * Deux raisons, et les deux sont des défauts déjà payés :
 *
 *   ① « La promesse et la clé de schéma doivent se touchent » — ce dépôt a
 *      mesuré **0 %** de conformité quand une consigne était séparée de la
 *      phrase qui promet la matière. Le catalogue et l'ordre de le citer sont
 *      le même objet.
 *   ② ET SURTOUT : demander `ref` dans `MEAL_SYSTEM_PROMPT`, qui est servi à
 *      TOUTES les lanes, le demanderait aussi là où aucun catalogue n'est
 *      envoyé — c'est-à-dire à un modèle qui n'a lu aucun identifiant et les
 *      INVENTERAIT tous. Le parseur les refuserait tous, et plus rien ne
 *      serait pesé. La clé n'est demandée que là où la liste est servie.
 *
 * ⚠️ LE CATALOGUE EST PLAFONNÉ, DONC IL N'EST PAS UNE PERMISSION. Un modèle
 * borné à 140 aliments écrirait sept jours de riz et de poulet. Le bloc dit
 * donc explicitement que la liste ne limite pas la cuisine : hors liste, on
 * écrit le terme sans `ref`, et le parseur le compte (`ref_absent`).
 */
export function renderCatalogBlock(
  entries: readonly CatalogEntry[],
): readonly string[] {
  if (entries.length === 0) return [];
  return [
    "== THE FOOD IDS THIS KITCHEN WEIGHS WITH ==",
    "These are the exact numbers the app will weigh your recipes with. Use them",
    "for the density you compute: guessing a food table and then checking your",
    "own guess proves nothing.",
    "Each line reads: id · kcal per 100 g raw · protein g per 100 g raw · extras.",
    '  "x2.6" is the raw-to-cooked factor: 100 g raw becomes 260 g cooked.',
    '  "unit=50" is what ONE of them weighs. "pinch=5" is a dash of it.',
    '  "-" means the table does not carry that number. Do not invent one.',
    "  A name after the numbers means the id alone would mislead you: read it.",
    "",
    ...entries.map(catalogLine),
    "",
    'ON EVERY INGREDIENT YOU WRITE, add "ref": the id from this list, exactly as',
    "spelled here. Dishes and preparations alike.",
    "This list does NOT limit what you may cook. When the food you want is not on",
    'it, write the ingredient as usual and leave "ref" out — that is expected and',
    "counted. What is refused is an id that is not on this list: a made-up id",
    "means that ingredient gets weighed by nobody.",
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA LECTURE — ce que le parseur fait d'un `ref` rendu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QU'ON A DÉCIDÉ D'UN `ref` RENDU PAR LE MODÈLE.
 *
 * ⛔ QUATRE VALEURS ET PAS DEUX, ET C'EST TOUT LE LOT. « absent » et « faux »
 * appellent deux corrections opposées : durcir la consigne d'un côté, réparer
 * le référentiel de l'autre. Les fondre en « pas d'identifiant utilisable »
 * rendrait un modèle qui n'obéit pas indiscernable d'un référentiel qui manque
 * — le mode d'échec que ce dépôt nomme `model-declared-fields-need-a-counter`.
 */
export const REF_OUTCOMES = [
  "absent",
  "accepted",
  "unknown",
  "not_composable",
] as const;
export type RefOutcome = (typeof REF_OUTCOMES)[number];

export interface RefReading {
  /** Le slug RETENU, ou `null`. Jamais un rapprochement approximatif. */
  slug: string | null;
  outcome: RefOutcome;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LIRE UN `ref`, SANS AUCUN RAPPROCHEMENT DE SECOURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AUCUN ALIAS, AUCUNE NORMALISATION, AUCUNE TOLÉRANCE. `resolveIngredient`
 * existe pour un TERME LIBRE écrit par un humain ou par le modèle en français ;
 * c'est lui qui a accepté « prune » comme le slug anglais `prune` (fruit sec) et
 * « poire » comme `pear` (dont la ligne CIQUAL dit « Poireau, cru »). Un
 * IDENTIFIANT n'est pas un terme : il a été lu dans une liste, il se compare
 * caractère pour caractère, et s'il ne correspond pas c'est qu'il a été
 * inventé.
 *
 * ⛔ ET UN `ref` FAUX NE RETOMBE PAS SUR LE TERME. C'est la demande explicite du
 * chantier (« sans rapprochement approximatif de secours ») et c'est le seul
 * comportement honnête : un modèle qui a écrit un identifiant a AFFIRMÉ savoir
 * de quel aliment il parle. Le peser quand même par son terme libre, c'est
 * revenir exactement au chemin qui a servi du raisin sec à 321 kcal/100 g pour
 * du raisin frais à 68,9. On s'abstient, et on compte.
 */
export function readRefSlug(
  raw: unknown,
  index: CompositionIndex | null,
  isComposable: ComposablePredicate,
): RefReading {
  const slug = typeof raw === "string" ? raw.trim() : "";
  if (slug === "") return { slug: null, outcome: "absent" };
  // ⚠️ SANS INDEX, ON NE SAIT RIEN — et « je ne sais pas » n'est pas « c'est
  // faux ». Le référentiel indisponible est un fail-open déjà assumé ailleurs
  // dans le parseur (`composition: null`); refuser ici ferait payer au dîner
  // d'un élève une lecture de base en panne.
  if (index === null) return { slug: null, outcome: "absent" };
  // ⟳ LOT A (2026-09-11) — LA RECHERCHE EXACTE VIT DANS LE MODULE COMMUN.
  //
  // ⛔ UN SEUL RÉSOLVEUR DE CETTE DÉCISION. `resolveCompositionLine` est ce que
  // TOUS les lecteurs de mesure appellent; écrire ici un second `bySlug.get`
  // ferait deux réponses le jour où la recherche change (une normalisation, un
  // préfixe de version, une casse). Le `term: ""` est explicite: à ce stade on
  // ne veut QUE le chemin de l'identifiant — un terme vide ne peut rien
  // rattraper, et c'est exactement la propriété qu'on veut.
  const line = resolveCompositionLine(index, { term: "", ref: slug, refRefused: false });
  if (!line.ref) return { slug: null, outcome: "unknown" };
  // ⛔ ET LA PORTE DE VALIDATION RESTE ICI, PAS LÀ-BAS. Elle vaut à la
  // COMPOSITION d'un plan NEUF, jamais à la mesure d'un plan déjà servi
  // (arbitrage ② du socle, `food_reference_manifest.ts`). La descendre dans le
  // résolveur commun rendrait illisible tout plan qui cite une ligne devenue
  // douteuse — c'est-à-dire qu'on effacerait la trace d'un défaut au lieu de la
  // lire.
  if (!isComposable(line.ref)) return { slug: null, outcome: "not_composable" };
  return { slug, outcome: "accepted" };
}
