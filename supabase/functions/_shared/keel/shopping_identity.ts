/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL · ÉTAPE C3 (2026-09-12) — UNE LIGNE DE COURSES SE DÉCIDE PAR SON
 * IDENTITÉ ALIMENTAIRE, PLUS JAMAIS PAR SON LIBELLÉ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ LE DÉFAUT QUE CE MODULE EXISTE POUR FERMER, ET IL EST MESURÉ ───────
 * `retry_merge.ts` ~331 filtrait `meal.shopping_list` sur
 * `normalizePantryTerm(l.term) ∈ termes d'ingrédients`. « citrons » ≠
 * « citron » ⇒ **la ligne disparaît**, et le message disait pourtant « kept,
 * not guessed ». Mesuré sur un run du banc du 2026-09-11 : **6 lignes sur 26**
 * perdues (`oignons`, `carottes`, `tomates`, `citrons`, `pommes de terre`,
 * `pitas complètes`), `splice.shopping_pruned: 6`. L'audit du lot E les
 * rattrapait ensuite en 5 `ingredient_not_bought`.
 *
 * ⛔ C'EST LA MÊME RACINE QUE LES 8 FAUX POSITIFS DU MATIN, UN CRAN PLUS
 * GRAVE : là on SIGNALAIT à tort, ici on SUPPRIME pour de bon — quelqu'un part
 * au magasin sans ce qu'il lui faut.
 *
 * ── CE QUE CE MODULE EST ─────────────────────────────────────────────────
 * Il rend des IDENTITÉS et des VERDICTS. Il ne résout rien lui-même :
 * `resolveCompositionLine` (lot A) est le seul résolveur, et il est appelé
 * ici comme partout ailleurs. ⛔ Aucun matcher maison, aucune sous-chaîne,
 * aucune distance d'édition : ce dépôt a mesuré **12 faux positifs sur 12**
 * avec un rapprochement artisanal (`never-hand-roll-a-matcher-here`), et
 * « laitue » contient « lait ».
 *
 * ── ⛔ TROIS SORTS, ET LE DOUTE NE RETIRE RIEN ───────────────────────────
 * C'est la règle que le parseur tient déjà depuis le 2026-08-12 (C7 ③), et
 * elle est ici rejouée sur les plans FUSIONNÉS, qui ne l'avaient jamais :
 *   · réclamée par une unité GARDÉE          ⇒ elle reste ;
 *   · réclamée par une unité RETIRÉE et par personne d'autre ⇒ elle part ;
 *   · rattachée à RIEN de connu              ⇒ ELLE RESTE, et se COMPTE.
 *
 * ⚠️ SANS RÉFÉRENTIEL (`index === null`), LES IDENTITÉS RETOMBENT SUR
 * `term:…` — et la règle des trois sorts tient quand même : une ligne au
 * pluriel ne se rattache alors ni au gardé ni au retiré, donc elle RESTE. Le
 * repli est le repli SÛR, pas le repli d'avant.
 *
 * PURE: no I/O, no clock, no randomness. Ne mute jamais son entrée.
 */
import {
  type CompositionIndex,
  normalizeTerm,
  resolveCompositionLine,
} from "./food_composition.ts";
import type { FoodGroupRef } from "./tokens.ts";
// ⚠️ IMPORT DE TYPE SEUL, ET C'EST OBLIGATOIRE ICI. `meal_generation.ts`
// importe DÉJÀ ce module (`foodIdentityOf`, `sortShoppingLines`, …) : un
// import de VALEUR dans ce sens-là fermerait le cycle au runtime. `import
// type` est effacé à la compilation, donc le cycle n'existe pas à l'exécution.
import type { ShoppingAisle } from "./meal_generation.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① L'IDENTITÉ D'UNE LIGNE
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'il faut d'une ligne pour l'identifier. Volontairement structurel. */
export interface IdentifiableLine {
  term: string;
  ref?: string | null;
  refRefused?: boolean;
}

export interface FoodIdentity {
  /** Slug du référentiel, ou `term:…` / `refused:…`. */
  identity: string;
  source: "ref" | "term" | "unresolved";
}

/**
 * L'IDENTITÉ D'UNE LIGNE — un slug quand elle en a un, un terme normalisé
 * sinon, et un troisième espace de noms pour les refus.
 *
 * ⛔ TROIS ESPACES DE NOMS, JAMAIS DEUX. Fondre `term:` et `refused:`
 * rapprocherait une ligne dont l'identifiant est FAUX d'une ligne de courses
 * homonyme, c'est-à-dire ferait exactement le rapprochement par libellé que ce
 * lot existe pour supprimer.
 *
 * ⚠️ CE CORPS VIENT DE `final_plan_audit.ts` (lot E), DÉPLACÉ ICI SANS UNE
 * LIGNE DE CHANGEMENT. Il est descendu d'un cran parce que `retry_merge.ts` en
 * a besoin et que l'audit, lui, dépend de `mouth_energy.ts` : importer l'audit
 * depuis la fusion aurait tiré la mesure énergétique entière dans un module de
 * fusion. `final_plan_audit.ts` le RÉEXPORTE — un seul corps, deux portes.
 */
export function foodIdentityOf(
  index: CompositionIndex | null,
  line: IdentifiableLine,
): FoodIdentity {
  const resolution = resolveCompositionLine(index, line);
  if (resolution.ref !== null) {
    return { identity: resolution.ref.slug, source: resolution.source ?? "term" };
  }
  if (resolution.refusal === "ref_refused" || resolution.refusal === "ref_unknown") {
    return { identity: `refused:${normalizeTerm(line.term)}`, source: "unresolved" };
  }
  return { identity: `term:${normalizeTerm(line.term)}`, source: "unresolved" };
}

/** Le slug seul, quand la ligne en a un ; `null` sinon. */
export function foodSlugOf(
  index: CompositionIndex | null,
  line: IdentifiableLine,
): string | null {
  const id = foodIdentityOf(index, line);
  return id.identity.includes(":") ? null : id.identity;
}

/**
 * LE GROUPE DE FRAÎCHEUR D'UNE LIGNE — DEPUIS SA RÉFÉRENCE, PAS SON LIBELLÉ.
 *
 * ── ⛔ LE DERNIER LECTEUR DE MESURE QUI PARTAIT DU LIBELLÉ ───────────────
 * `meal_generation.ts:6200::foodGroupOfTerm` appelait `resolveIngredient(term)`
 * directement : un identifiant écrit par le modèle ne comptait pas, et un
 * libellé que le référentiel ignore rendait `null` — donc `MAX_FRIDGE_DAYS`,
 * donc une date d'achat trop précoce que personne ne regarde. Il a été nommé
 * par DEUX chantiers (`NON-BRANCHE.md` ⑥) et jamais fermé.
 *
 * ⛔ ET IL RESTE `null` QUAND ON NE SAIT PAS. Le repli est celui d'avant
 * (`MAX_FRIDGE_DAYS` côté vagues) et il se COMPTE — l'instrumentation ne doit
 * jamais coûter un dîner.
 */
export function freshnessGroupOf(
  index: CompositionIndex | null,
  line: IdentifiableLine,
): FoodGroupRef | null {
  return resolveCompositionLine(index, line).ref?.foodGroupRef ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QU'ON N'ACHÈTE PAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES IDENTITÉS QU'AUCUNE LISTE DE COURSES NE PORTE — NOMMÉES UNE PAR UNE.
 *
 * ── ⛔ LE DÉFAUT MESURÉ, 2 TIRS SUR 6 ───────────────────────────────────
 * Campagne du 2026-09-11, tirs 2 et 4 : `ingredient_not_bought` sur **« eau »**,
 * **219 g** et **287 g** « requis ». Personne n'achète l'eau du robinet d'un
 * mijoté. L'audit rendait donc un manque d'achat là où il n'y a pas d'achat.
 *
 * ── ⛔ UN SLUG, PAS UN GROUPE, ET SURTOUT PAS UN RAYON ───────────────────
 * Le plan l'écrit : « ne pas exclure indistinctement toutes les boissons ou
 * eaux conditionnées ». Le groupe `water` est `beverage` au référentiel, aux
 * côtés de `alcohol`, `sweetened_beverage` et `coffee_tea` — exclure le GROUPE
 * sortirait le café et les sodas de la liste de courses, qui s'achètent. Ici
 * on nomme **un slug**, `water`, et rien d'autre. Une eau conditionnée qui
 * entrerait un jour au référentiel porterait son propre slug et resterait
 * achetable sans qu'on touche à cette liste.
 *
 * ⚠️ ELLE RESTE DANS LA MESURE DE PRÉPARATION. Le plan l'exige : « tout en la
 * conservant dans la mesure de préparation ». Rien ici ne retire un ingrédient
 * d'une recette ; on décide seulement de ce qui se met dans un panier.
 *
 * ⚠️ UNE LIGNE NON RÉSOLUE N'EST JAMAIS NON-ACHETABLE. « eau » sans
 * référentiel rend `term:eau`, qui n'est pas dans cette liste : on préfère un
 * faux positif d'achat (visible, corrigible) à un ingrédient qui disparaît.
 */
export const NON_PURCHASABLE_SLUGS: ReadonlySet<string> = new Set(["water"]);

/** `true` quand cette identité ne se met dans aucun panier. */
export function isNonPurchasableIdentity(identity: string): boolean {
  return NON_PURCHASABLE_SLUGS.has(identity);
}

export function isNonPurchasableLine(
  index: CompositionIndex | null,
  line: IdentifiableLine,
): boolean {
  return isNonPurchasableIdentity(foodIdentityOf(index, line).identity);
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES TROIS SORTS D'UNE LIGNE DE COURSES
// ═══════════════════════════════════════════════════════════════════════════

/** Les identités réclamées par un ensemble d'unités (plats, casseroles). */
export function claimedIdentities(
  index: CompositionIndex | null,
  units: Iterable<{ ingredients?: readonly IdentifiableLine[] | null }>,
): Set<string> {
  const out = new Set<string>();
  for (const unit of units) {
    for (const ing of unit.ingredients ?? []) {
      out.add(foodIdentityOf(index, ing).identity);
    }
  }
  return out;
}

export const SHOPPING_LINE_SORTS = ["claimed", "removed", "unattributed"] as const;
export type ShoppingLineSort = (typeof SHOPPING_LINE_SORTS)[number];

export interface ShoppingSortCounts {
  /** Réclamées par une unité gardée : elles restent. */
  claimed: number;
  /** Réclamées UNIQUEMENT par une unité retirée : elles partent. */
  removed: number;
  /**
   * Rattachées à rien de connu : elles RESTENT, et c'est le compteur du lot.
   * ⛔ Non nul, il dit qu'un libellé de courses ne rejoint aucune identité du
   * plan — donc qu'on achète peut-être pour rien. Il ne dit JAMAIS qu'on a
   * supprimé quelque chose.
   */
  unattributed: number;
}

export function emptyShoppingSortCounts(): ShoppingSortCounts {
  return { claimed: 0, removed: 0, unattributed: 0 };
}

/**
 * LE TRI D'UNE LISTE DE COURSES SUR UN PLAN QUI VIENT DE CHANGER.
 *
 * ⛔ `removed` EST UNE LISTE D'IDENTITÉS RÉELLEMENT SORTIES DU PLAN, pas « tout
 * ce qui n'est pas réclamé ». C'est la différence exacte entre ce module et le
 * filtre qu'il remplace : l'ancien retirait par DÉFAUT, celui-ci ne retire que
 * ce qu'il peut NOMMER. Une ligne au pluriel n'entre dans aucune des deux
 * listes ⇒ troisième sort ⇒ elle reste.
 *
 * ⚠️ NE MUTE RIEN : rend les lignes gardées dans leur ordre d'origine.
 */
export function sortShoppingLines<L extends IdentifiableLine>(args: {
  index: CompositionIndex | null;
  lines: readonly L[];
  /** Les identités que les unités GARDÉES réclament. */
  claimed: ReadonlySet<string>;
  /** Les identités des unités qui viennent d'être RETIRÉES ou remplacées. */
  removed: ReadonlySet<string>;
}): { kept: L[]; dropped: L[]; counts: ShoppingSortCounts } {
  const kept: L[] = [];
  const dropped: L[] = [];
  const counts = emptyShoppingSortCounts();
  for (const line of args.lines) {
    const id = foodIdentityOf(args.index, line).identity;
    if (args.claimed.has(id)) {
      counts.claimed++;
      kept.push(line);
      continue;
    }
    if (args.removed.has(id)) {
      counts.removed++;
      dropped.push(line);
      continue;
    }
    counts.unattributed++;
    kept.push(line);
  }
  return { kept, dropped, counts };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ ⟳ LOT 1 (2026-09-12) — LE RAYON D'UNE LIGNE QU'AUCUN MODÈLE N'A ÉCRITE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE RAYON DÉRIVÉ DU GROUPE D'ALIMENT — `null` quand le référentiel n'a pas
 * su donner de groupe.
 *
 * ── ⛔ POURQUOI IL FALLAIT UNE DÉRIVATION, ET PAS UN REPLI ───────────────
 * Le lot 1 PRODUIT des lignes de courses que le modèle n'écrit plus. Leur
 * rayon ne peut donc plus venir de lui. Les deux seules sources honnêtes
 * étaient : le RÉFÉRENTIEL (`food_groups`, déjà résolu pour la fenêtre crue)
 * ou `other` pour tout le monde. La seconde aurait rangé une liste entière
 * sous « autre » — c'est-à-dire aurait rendu le tri de la liste de courses
 * inutile le jour où le modèle cesse de l'écrire.
 *
 * ── ⛔ CE N'EST PAS UN MATCHER ──────────────────────────────────────────
 * Aucune chaîne n'est lue. L'entrée est un JETON fermé (`FOOD_GROUP_REFS`,
 * trente valeurs) et la sortie un JETON fermé (`SHOPPING_AISLES`, sept
 * valeurs). La table est EXHAUSTIVE par le type : ajouter un groupe au
 * référentiel sans lui donner de rayon ne compile pas. C'est l'inverse exact
 * du rapprochement par libellé que ce module existe pour supprimer.
 *
 * ── ⚠️ `frozen` N'EST LA DESTINATION D'AUCUN GROUPE, ET C'EST VOULU ──────
 * Le surgelé n'est pas une NATURE d'aliment, c'est une décision de
 * conservation : elle vit dans `freeze_on_purchase`, posé par
 * `grocery_waves.ts`. Router un groupe vers `frozen` ferait dire au rayon ce
 * que la vague décide déjà, et les deux divergeraient au premier réglage.
 *
 * ⚠️ LES QUATRE CHOIX DISCUTABLES SONT NOMMÉS, PAS CACHÉS :
 *   · `legumes` → `pantry` : les lentilles et les pois chiches SECS sont de
 *     l'épicerie. Une conserve aussi. Le légume sec frais n'existe pas.
 *   · `nuts_seeds`, `sauce_dressing`, `coffee_tea` → `pantry` : rayons secs.
 *   · `fried_food` → `other` : une frite surgelée, un beignet de boulangerie
 *     et un nugget ne partagent aucun rayon. On ne tranche pas.
 *   · `alcohol`, `sweetened_beverage`, `water` → `other` : le vocabulaire des
 *     rayons n'a pas de « boissons », et en inventer un est une décision de
 *     produit, pas une dérivation.
 */
const AISLE_BY_FOOD_GROUP: Readonly<Record<FoodGroupRef, ShoppingAisle>> = {
  lean_protein: "protein",
  fatty_fish: "protein",
  white_fish: "protein",
  shellfish: "protein",
  poultry: "protein",
  red_meat: "protein",
  eggs: "protein",
  legumes: "pantry",
  tofu_tempeh: "protein",
  dairy_yogurt: "dairy",
  dairy_cheese: "dairy",
  whole_grain: "grains",
  refined_grain: "grains",
  starchy_veg: "produce",
  cruciferous_veg: "produce",
  leafy_greens: "produce",
  non_starchy_veg: "produce",
  berries: "produce",
  citrus: "produce",
  other_fruit: "produce",
  nuts_seeds: "pantry",
  olive_oil: "pantry",
  other_added_fat: "pantry",
  sauce_dressing: "pantry",
  sugar_sweets: "pantry",
  fried_food: "other",
  alcohol: "other",
  sweetened_beverage: "other",
  water: "other",
  coffee_tea: "pantry",
};

/** Le rayon de ce groupe, ou `null` quand le groupe est inconnu. */
export function aisleForFoodGroup(group: FoodGroupRef | null): ShoppingAisle | null {
  if (group === null) return null;
  return AISLE_BY_FOOD_GROUP[group] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · LOT 3 — LA CONSERVE N'EST PAS DU FRAIS, ET LE GROUPE NE LE
//                DIT PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, MESURÉ SUR LE TIR 3 RÉEL DU 2026-09-12, ET IL A REFUSÉ UN PLAN.
// Le modèle n'écrit plus la liste de courses : chaque ligne est produite depuis
// la recette, et son rayon est dérivé du GROUPE du référentiel. Or
// `tuna_fresh` et `tuna_tinned` portent le MÊME groupe, `white_fish` — le
// référentiel n'a aucune colonne de conservation. Le thon EN CONSERVE est donc
// parti au rayon `protein`, `PERISHABLE_AISLES` l'a déclaré périssable, et la
// garde a refusé le plan : « thon en conserve acheté le 2026-09-12, tenu
// 1 jour, attendu cuisiné le 2026-09-14 — sans congélation ».
//
// ⛔ LA PHRASE EST FAUSSE, ET C'EST LE PIRE DES DEUX MONDES : une boîte de thon
// se garde des années. Avant ce chantier, c'est le MODÈLE qui écrivait
// `aisle: "pantry"` sur cette ligne, et il avait raison. En dérivant le rayon
// du groupe, on a gagné une classification reproductible et perdu la seule
// information que le référentiel ne porte pas.
//
// ⛔ UNE ÉNUMÉRATION, PAS UN MOTIF SUR LE SLUG. `slug.endsWith("_tinned")` est
// un matcher, et ce dépôt a mesuré 12 faux positifs sur 12 avec un matcher
// maison. Ici on NOMME les aliments concernés. Ils sont deux dans tout le
// référentiel (943 lignes), et le test `shopping_shelf_stable_test.ts` rougit
// si la table en fait naître un troisième que cette liste ne connaît pas.
//
// ⚠️ CE N'EST PAS LE VRAI CORRECTIF, et le vrai est écrit dans
// `RESTE-A-FAIRE.md` : `food_composition_refs` devrait porter une colonne de
// conservation. Tant qu'elle n'existe pas, cette liste est ce qu'on SAIT, et
// elle se lit d'un coup d'œil.
export const SHELF_STABLE_SLUGS: ReadonlySet<string> = new Set<string>([
  "tuna_tinned",
  "chickpeas_tinned",
]);

/**
 * LE RAYON D'UN ALIMENT — son groupe, sauf quand on SAIT qu'il se conserve.
 *
 * ⛔ `pantry` N'EST PAS UN RANGEMENT DE CONFORT ICI. `PERISHABLE_AISLES`
 * (`grocery_waves.ts`) lit le RAYON pour décider de la date d'achat et du
 * geste du congélateur : ce champ-là décide d'une course, pas d'une étagère.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function aisleForFood(
  group: FoodGroupRef | null,
  ref: string | null,
): ShoppingAisle | null {
  if (ref !== null && SHELF_STABLE_SLUGS.has(ref)) return "pantry";
  return aisleForFoodGroup(group);
}
