// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LA LECTURE DE LA RÉPONSE DU MODÈLE (le parseur)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-2). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : les lecteurs du parseur (`cleanText`, `readDeclaredGroup`,
// `readComponents`, `readPart`, `readMinutes`, `readStructuredQuantity`,
// `referentialGroupOfLine`, `readKept`), `localizeOutputLockBites`,
// `decodeModelJson` et `parseGeneratedMeal`.
//
// `parseGeneratedMeal` est déplacée ENTIÈRE : ses compteurs et ses fonctions
// internes restent dans son corps.

import {
  applyKeelOutputLocks,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { CoachDoctrine } from "./doctrine.ts";
// ⟳ 2026-09-13 · LOT 1 — LE RECENSEMENT DES SURFACES, PARTAGÉ AVEC LE HANDLER.
import {
  collectOutputSurfaces,
  type OutputSurface,
  outputSurfacesText,
} from "./output_surfaces.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
// FF-061 — la ceinture de ton, jusqu'ici appliquée au seul message du soir et à
// la relance. Le `why` d'un plat vient du même modèle et s'affiche à l'élève.
import { findGuiltTripping } from "./reengagement.ts";
import {
  detectProteinAnchor,
  isMainMealSlot,
} from "./protein_anchor.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionIndex,
  type CompositionState,
  type CompositionUnit,
  millilitresOfSlug,
  resolveCompositionLine,
} from "./food_composition.ts";
// ⟳ LOT C (2026-09-11) — LE CONTRAT DE COMPOSITION: le catalogue montré au
// modèle et la lecture de l'identifiant qu'il rend. Voir `composition_contract.ts`.
import {
  type ComposablePredicate,
  readRefSlug,
  type RefOutcome,
  type RefReading,
} from "./composition_contract.ts";
// ⟳ LOT C — LA PORTE DE COMPOSITION DU LOT A, ARMÉE PAR DÉFAUT. Voir
// `composable` sur `parseGeneratedMeal`: elle est arrivée pendant l'écriture de
// ce lot, et un défaut OUVERT n'avait plus de raison d'être.
import { isComposable } from "./food_reference_manifest.ts";
import {
  cookedWindowVerdict,
  freezerClaimedWithoutOne,
  type KeptWhere,
  keptWindowDays,
  emptyFridgeWindowCounts,
  type FridgeWindowCounts,
} from "./fridge_window.ts";
import type { FixedIntake } from "./fixed_intakes.ts";
import {
  hasFreezerDeclared,
} from "./kitchen_equipment.ts";
import type { KitchenTool } from "./kitchen_equipment.ts";
import {
  dayHasProperty,
  daysWithProperty,
} from "./day_properties.ts";
import type { DayPropertyEntry } from "./day_properties.ts";
// L4/D6 — LA FORME DE CUISINE. Importée, jamais recopiée: la liste des barreaux
// et les LIGNES DE CONSIGNE qui les servent vivent au même endroit
// (`COOKING_SHAPE_LINES`), et c'est là que se lit « combien de plats ce barreau
// réclame ». Aucun cycle: `household_portions.ts` n'importe pas ce fichier.
import {
  asksForASecondDish,
  // LE MÊME DÉTECTEUR QUE LES CONSIGNES DE PART, APPELÉ — pas recopié. Deux
  // définitions de « cette phrase porte-t-elle un poids » divergeraient au
  // premier ajustement, et c'est celle qu'on relit le moins qui garderait
  // l'ancienne.
  portionCarriesAQuantity,
} from "./household_portions.ts";
// ══ LA CEINTURE DE RÉGIME, IMPORTÉE ET JAMAIS RÉÉCRITE ═══════════════════════
//
// ⛔ AUCUN MATCHER MAISON ICI. `scanDietaryRegime` porte la liste FERMÉE des
// formes de surface (EN + FR), distingue la PROSE des TERMES, et désamorce les
// analogues végétaux (`isPlantAnalogue`) — « laitue » ≠ « lait », douze faux
// positifs sur douze mesurés dans ce dépôt. Une seconde lecture écrite ici
// divergerait de la première au premier aliment ajouté.
//
// Aucun cycle: `dietary_regime.ts` n'importe que `tokens.ts` et
// `forbidden_matcher.ts`.
import {
  type DietaryRegime,
} from "./dietary_regime.ts";
// ⛔ LE VOCABULAIRE FERMÉ DES GROUPES, ET SON PARSEUR — jamais une seconde
// liste. Écrire ici un `new Set(FOOD_GROUP_REFS)` aurait perdu les alias
// d'entrée que `parseFoodGroupRef` porte (`whole_grains` → `whole_grain`), et
// aurait fait diverger deux lectures du même vocabulaire au premier ajout.
import { type FoodGroupRef, parseFoodGroupRef, PROTEIN_SOURCES } from "./tokens.ts";
// ⟳ LOT `L17-0` — LA CLÉ DU GROUPE SUR LA LIGNE ÉCRITE, ET SON COMPTEUR.
// Le nom de la clé n'a qu'UN site d'écriture (`INGREDIENT_GROUP_KEY`), lu par
// l'écrivain ET par le compteur: c'est ce qui rend impossible de compter une
// clé que personne n'écrit.
// ⟳ 2026-09-13 — `reconcileIngredientGroup`: le `ref` prime sur le `group`
// déclaré quand il se résout, et le désaccord se COMPTE.
import {
  closedGroupOrNull,
  reconcileIngredientGroup,
} from "./food_group_write.ts";
import {
  allergenGroupViolations,
  groupedIngredientCount,
} from "./allergen_food_groups.ts";
import {
  readQuantityFromProse,
  weighableQuantityOf,
} from "./quantity_from_prose.ts";
// ⟳ 2026-09-12 · ÉTAPE C3 — L'IDENTITÉ ALIMENTAIRE D'UNE LIGNE DE COURSES.
// ⛔ Le parseur décidait de garder ou de jeter une ligne en comparant des
// LIBELLÉS; il partage désormais son corps avec la fusion (`retry_merge.ts`),
// et les deux comparent des identités. Voir `shopping_identity.ts`.
import {
  claimedIdentities,
  foodIdentityOf,
  freshnessGroupOf,
  isNonPurchasableIdentity,
  NON_PURCHASABLE_SLUGS,
  sortShoppingLines,
} from "./shopping_identity.ts";
// ⟳ LOT `L26-0` — L'ARÊTE QUI MANQUAIT À `mouths_double`. Le compteur CONSTATE
// depuis toujours: quatorze bouches servies deux fois sur les dix plans du
// 2026-08-22, et à chaque fois la même — une mineure. La consigne l'interdit
// DÉJÀ, mot pour mot, et elle a été servie: c'est une arête qu'il fallait, pas
// une phrase. Le module est PUR et éprouvé à part, pour la raison de tous les
// autres de cette campagne: c'est ce qui le rend mutable sur un banc.
import { keepOneBoxPerMouth } from "./box_one_per_mouth.ts";
// ⟳ LOTS `L6′-a` et `L6′-b` — LE DÉNOMINATEUR DES CONTENANTS, ET LE NOM DU
// ZÉRO. `L6′-a`: `expected` se calculait sur le foyer ENTIER même sur un plat
// dédié à UNE bouche — 72 attendus pour 38 rendus sur `3c781a71`, alors que la
// partition réelle en demande 36. `L6′-b`: `boxes: 0` porte aujourd'hui DEUX
// situations opposées (rien n'était dû / tout était dû et rien n'est venu) sous
// le même chiffre. Module PUR et éprouvé à part, comme les quatre autres de
// cette campagne.
import {
  boxDeliveryState,
  type ExpectedDish,
  mouthsFedByDish,
} from "./box_expected.ts";
// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------
// ⛔ LA CEINTURE DES EXCLUSIONS — lot du 2026-09-01. Une exclusion attribuée à
// une bouche était rangée, comptée, et INERTE: le plan servait quand même.
import {
  dishBitesExclusion,
} from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import { slotIsTaken } from "./fixed_intakes.ts";
import {
  type AwayDay,
  DAY_TOKENS,
  type EatingOccasionSlot,
  isAway,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
  type MealSlot,
} from "./meal_vocabulary.ts";
import {
  BOX_MAX_GRAMS,
  BOX_SUM_TOLERANCE_RATIO,
  type BoxHeldOff,
  type BoxItem,
  type CookingSession,
  DISH_NAME_MAX_CHARS,
  type DishIngredient,
  type DishSameDay,
  type GeneratedDish,
  type GeneratedMeal,
  type MealBox,
  type MealPreparation,
  type PantryItem,
  SAME_DAY_KINDS,
  SAME_DAY_MAX_MINUTES,
  type SameDayKind,
  SHOPPING_AISLES,
  type ShoppingAisle,
  type ShoppingItem,
  UNQUANTIFIED_TERMS_NAMED,
  type UnsafeViolation,
} from "./meal_types.ts";
import { isInPantry, normalizePantryTerm } from "./meal_pantry.ts";
import {
  dishBudgetFor,
  MAX_FRIDGE_DAYS,
  type MergedEater,
} from "./meal_budget.ts";
import {
  gramsRawForIngredient,
  preparationReadyGrams,
  refForIngredient,
} from "./meal_grams.ts";
import {
  boxScanSurface,
  type MealRegimeBite,
  scanMealForRegime,
  scanRegimeSources,
} from "./meal_regime_scan.ts";
import { emptySlotsIn, emptySlotsLine } from "./meal_slots.ts";

// ---------------------------------------------------------------------------
// Le parseur — c'est lui qui tient les quatre garanties
// ---------------------------------------------------------------------------

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * LE GROUPE ALIMENTAIRE DÉCLARÉ, VALIDÉ CONTRE LA LISTE FERMÉE.
 *
 * ── TROIS ÉTATS, ET LE COMPTEUR EN A BESOIN DES TROIS ─────────────────────
 *   · `{ declared: false, group: null }` — le modèle n'a rien écrit.
 *   · `{ declared: true,  group: null }` — il a écrit quelque chose qui n'est
 *     PAS du vocabulaire. C'est un REFUS, et il ne doit surtout pas se
 *     confondre avec le premier: « le modèle n'obéit pas » et « le modèle
 *     invente des slugs » appellent deux corrections opposées.
 *   · `{ declared: true,  group: <ref> }` — valide.
 *
 * ⛔ NE LÈVE JAMAIS. `parseFoodGroupRef` est un parseur R7 « fail loudly »:
 * une chaîne inconnue le fait JETER. Le laisser remonter ferait tomber le plan
 * ENTIER pour un mot mal orthographié dans un champ annexe — un `empty_meal`
 * sur un motif dont l'élève ne peut rien faire, exactement ce que FF-037 R5
 * interdit. On rattrape, on compte, et le plan continue avec le comportement
 * d'avant ce lot sur cet aliment-là.
 */
function readDeclaredGroup(
  ing: Record<string, unknown>,
): { declared: boolean; group: FoodGroupRef | null } {
  const raw = cleanText(ing.group ?? ing.food_group ?? ing.foodGroup);
  if (!raw) return { declared: false, group: null };
  // « null » ÉCRIT EN TOUTES LETTRES est l'échappatoire NOMMÉE de la consigne,
  // et un modèle en mode JSON la rend parfois en chaîne. La compter comme un
  // refus punirait le modèle d'avoir obéi.
  if (raw.toLowerCase() === "null") return { declared: false, group: null };
  try {
    return { declared: true, group: parseFoodGroupRef(raw) };
  } catch {
    return { declared: true, group: null };
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT D (2026-09-11) — LA STRUCTURE DE CUISSON, DÉCLARÉE PAR LE MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MÊME PATRON QUE `for_member_id`, `preparation_id`, `same_day` ET `group`:
 * inventé par le modèle, vérifié contre une liste fermée, JETÉ et COMPTÉ quand
 * il n'y est pas. Ce qui est refusé ici, c'est de DÉCOUPER LA PROSE de la
 * recette pour deviner ce qui tient une sauce — le plan l'interdit nommément,
 * et ce dépôt a mesuré 12 faux positifs sur 12 la dernière fois qu'il a écrit
 * un rapprochement maison.
 *
 * ⚠️ CE PARSEUR NE VALIDE NI LES RÔLES, NI LES LIENS, NI LA COUVERTURE DES
 * LIGNES. Il TRANSPORTE ce que le modèle a écrit; c'est `bodiesOfUnit`
 * (`culinary_structure.ts`) qui décide, et qui retombe sur le traitement
 * conservateur au premier défaut. Deux endroits pour une même décision
 * rendraient le jour où elle change deux réponses différentes.
 */
function readComponents(
  raw: Record<string, unknown>,
): { id: string; role: string | null; partOf: string | null }[] {
  const list = raw.components;
  if (!Array.isArray(list)) return [];
  const out: { id: string; role: string | null; partOf: string | null }[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = cleanText(rec.id);
    if (!id) continue;
    out.push({
      id,
      role: cleanText(rec.role) || null,
      partOf: cleanText(rec.part_of ?? rec.partOf) || null,
    });
  }
  return out;
}

/** Le composant qu'une ligne cite. Vide ⇒ `null`, et le bloc devient conservateur. */
function readPart(ing: Record<string, unknown>): string | null {
  return cleanText(ing.part) || null;
}

/**
 * Une durée en minutes, ou `null`.
 *
 * ── PAS DE ZÉRO PAR DÉFAUT ────────────────────────────────────────────────
 * Une durée manquante rend `null`, jamais `0`: « 0 min » se lit « c'est
 * instantané », ce qui est une promesse, alors que `null` se lit « on ne sait
 * pas » et l'écran sait taire ce qu'il ne sait pas.
 *
 * ── PLAFONNÉE À QUATRE HEURES ─────────────────────────────────────────────
 * Au-delà, c'est une hallucination d'unité (des secondes prises pour des
 * minutes, une marinade de 24 h comptée comme du temps de cuisine) et l'afficher
 * ferait renoncer quelqu'un devant une session qui prend en fait une heure.
 */
function readMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.round(n));
}

/**
 * Une quantité de courses ne porte JAMAIS d'unité d'énergie.
 *
 * Volontairement plus étroit que `findNumericTarget`: le champ `quantity` est
 * par définition une quantité, donc y interdire les grammes le rendrait
 * inutilisable. Ce qu'on interdit, c'est la seule chose qu'une quantité
 * d'achat ne peut pas être — des kcal.
 */
const ENERGY_UNIT_RE = /\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i;

/**
 * FF-038 — LA QUANTITÉ STRUCTURÉE D'UN INGRÉDIENT, LUE PUIS RECALCULÉE.
 *
 * ── LECTURE TOLÉRANTE, JAMAIS RÉPARATRICE ────────────────────────────────
 * Un champ absent, hors liste fermée ou illisible vaut `null` et se compte.
 * Il ne se complète pas: un `state` deviné « raw » sur du riz fausse d'un
 * facteur 2,6, et toujours dans le sens qui gonfle. Le silence d'un modèle
 * n'est pas une valeur.
 *
 * ── LES GRAMMES SONT RECALCULÉS, PAS LUS ─────────────────────────────────
 * Même si le modèle rendait un champ `grams`, il ne serait pas lu. Précédent
 * `in_pantry` (garantie 2 de l'en-tête): l'arithmétique du modèle n'est pas
 * une preuve.
 *
 * `composition === null` (référentiel indisponible) ⇒ les trois champs sont
 * quand même lus et gardés, seuls les grammes manquent. La donnée structurée
 * survit à une panne de la table qui l'exploite.
 */
function readStructuredQuantity(
  ing: Record<string, unknown>,
  composition: CompositionIndex | null,
  term: string,
  /**
   * ⟳ LOT C (2026-09-11) — CE QU'ON A DÉCIDÉ DE L'IDENTIFIANT DE CETTE LIGNE.
   *
   * ⛔ REQUIS, jamais `?`. Les grammes se calculent DEPUIS la référence: laisser
   * ce paramètre optionnel ferait retomber un appelant oublieux sur le chemin
   * par terme libre — c'est-à-dire sur le défaut mesuré que le lot ferme — et
   * la seule preuve serait une assiette. Le compilateur est le seul recenseur
   * d'appelants qui ne mente pas.
   */
  reading: RefReading,
): Pick<
  DishIngredient,
  "ref" | "refRefused" | "amount" | "unit" | "state" | "gramsRaw" | "quantitySource"
> {
  const rawAmount = Number(ing.amount);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  const unitRaw = cleanText(ing.unit).toLowerCase();
  const unit = (COMPOSITION_UNITS as readonly string[]).includes(unitRaw)
    ? (unitRaw as CompositionUnit)
    : null;
  const stateRaw = cleanText(ing.state).toLowerCase();
  const state = (COMPOSITION_STATES as readonly string[]).includes(stateRaw)
    ? (stateRaw as CompositionState)
    : null;

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L-1-b` · LA SECONDE COPIE DE LA QUANTITÉ — 2026-08-22
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le prompt demande la quantité DEUX FOIS (`== SAY THE SAME QUANTITY TWICE ==`).
  // Mesuré le 2026-08-22 sur tout le corpus: sur **3 850** lignes sans `amount`,
  // **3 833 (99,6 %) portent un `quantity` textuel non vide** — le modèle a
  // écrit la copie en prose et pas la copie structurée, et le produit ne gardait
  // que celle qui manque. C'est la forme exacte de `L17-0`, sur un autre champ.
  //
  // ⛔ `amount`, `unit` ET `state` NE SONT PAS TOUCHÉS. Ils restent la
  // DÉCLARATION du modèle, ils partent tels quels en base, et les deux compteurs
  // d'obéissance à FF-038 (`structured_quantity_missing` juste en dessous,
  // `unquantified_dish_ingredients` en fin de parseur) continuent donc de
  // compter exactement la même chose qu'avant ce lot. Les fondre rendrait un
  // modèle qui cesse d'obéir indiscernable d'une lecture réparée.
  //
  // ⛔ ET AUCUN MOT N'EST LU: `weighableQuantityOf` délègue à
  // `quantity_from_prose.ts`, qui n'accepte qu'un nombre suivi d'un symbole de
  // mesure ancré des deux bouts (`150 g`, `200 ml`), un nombre nu ou une
  // fraction nue. `a handful`, `2 tbsp`, `1 large onion`, `75 g dry` rendent
  // `null`, et 60+ chaînes de refus sont testées une par une.
  const weighable = weighableQuantityOf({ amount, unit, quantity: cleanText(ing.quantity) });

  const ref = reading.slug;
  const refRefused = reading.outcome === "unknown" ||
    reading.outcome === "not_composable";

  return {
    ref,
    refRefused,
    amount,
    unit,
    state,
    gramsRaw: gramsRawForIngredient(composition, {
      term,
      ref,
      refRefused,
      quantity: cleanText(ing.quantity),
      amount,
      unit,
      state,
    }),
    quantitySource: weighable.source,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE GROUPE QUE LE RÉFÉRENTIEL DONNE À CETTE LIGNE — 2026-09-13.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ PAR L'IDENTIFIANT SEULEMENT, JAMAIS PAR LE LIBELLÉ. `refForIngredient`
 * retombe sur le terme quand aucun `ref` n'est écrit; s'en servir ici
 * remplacerait un groupe déclaré par un groupe deviné à partir de mots — très
 * exactement ce que le dépôt s'interdit (« laitue » n'est pas « lait »). On
 * exige donc `source === "ref"`: l'identifiant a été LU DANS UNE LISTE, le
 * libellé non.
 *
 * Rend `null` dans les trois cas où la ligne doit garder ce que le modèle a
 * déclaré: pas d'index, pas de `ref`, `ref` inconnu.
 */
function referentialGroupOfLine(
  composition: CompositionIndex | null,
  ing: { term: string; ref: string | null; refRefused: boolean },
): FoodGroupRef | null {
  const resolved = resolveCompositionLine(composition, ing);
  if (resolved.source !== "ref" || resolved.ref === null) return null;
  return closedGroupOrNull(resolved.ref.foodGroupRef);
}

/**
 * LE JETON DE CONSERVATION, LU — `"fridge"` quand rien n'est dit.
 *
 * ⚠️ LE NON-DIT EST LE STRICT, et c'est ce qui rend ce lot réversible: un
 * modèle qui n'écrit jamais `kept` produit exactement le plan d'avant, au plat
 * près. Un défaut à `"freezer"` aurait relâché la fenêtre du cuit sur toute la
 * population, pour un champ que personne n'avait encore vu.
 *
 * ⚠️ UN JETON INCONNU RETOMBE SUR `"fridge"` AUSSI, sans jeter: `kept` est une
 * PRÉCISION en plus, et perdre un dîner parce qu'un modèle a écrit « frozen »
 * au lieu de « freezer » échangerait le repas contre le confort du parseur.
 * Posture `for_member_id` / `same_day` / `box_id`.
 */
function readKept(raw: unknown): KeptWhere {
  return String(raw ?? "").trim().toLowerCase() === "freezer" ? "freezer" : "fridge";
}

/**
 * LE JSON D'UNE RÉPONSE MODÈLE, CLÔTURE MARKDOWN RETIRÉE.
 *
 * ⛔ EXPORTÉ POUR N'EXISTER QU'UNE FOIS. Depuis la fermeture du lot 1
 * (2026-09-12), une réparation ne rend plus un plan mais un PATCH
 * (`plan_repair_patch.ts`) : deux lecteurs, et donc deux façons de retirer
 * les trois accents graves. Deux copies d'une même règle dont une seule reçoit
 * la correction est un défaut que ce fichier documente déjà ailleurs.
 *
 * ⚠️ IL JETTE SUR DU JSON ILLISIBLE, et c'est voulu: l'appelant sait quoi
 * faire d'un texte qu'on n'a pas su lire, ce module ne le sait pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════
 * OÙ LE VERROU DE SORTIE MORD — SURFACE PAR SURFACE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI ELLE EXISTE. `applyKeelOutputLocks` lit UN SEUL TEXTE: tous les
 * plats, toutes les casseroles, toutes les notes et toute la liste concaténés.
 * Quand il mord, on sait QUE le plan est dangereux et pas OÙ — donc la seule
 * réponse possible était de tout jeter. Une arachide dans le dîner de samedi
 * rendait les six repas indisponibles.
 *
 * ⛔ ELLE NE REMPLACE PAS LE VERROU, ELLE LE REJOUE PAR SURFACE. Le même
 * appel, les mêmes contraintes, la même doctrine — une seconde détection
 * écrite à côté finirait par diverger, et c'est celle qu'on regarde le moins
 * qui laisserait passer l'arachide.
 *
 * ⛔ ET ELLE EST APPELÉE DEUX FOIS DANS LE PRODUIT: par le parseur, pour
 * nommer les morsures du premier jet; et par le générateur AVANT LA
 * LIVRAISON, sur le plan réellement écrit. La seconde est la ceinture qui
 * rend la première utilisable — « la sécurité s'applique même si le budget
 * modèle est épuisé ».
 *
 * ⚠️ `unlocalized` QUAND RIEN N'EST TROUVÉ ET QUE `globalTokens` N'EST PAS
 * VIDE: le verrou a mordu sur le texte concaténé et sur aucune surface isolée.
 * On garde un blocage global plutôt que d'accuser au hasard.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function localizeOutputLockBites(args: {
  /**
   * ⛔ LES SURFACES, RECENSÉES UNE FOIS PAR `collectOutputSurfaces`. Ce
   * paramètre a remplacé cinq listes de champs recopiées par l'appelant, et
   * c'est le défaut fermé : le texte concaténé du verrou global et cette
   * localisation descendent désormais du MÊME recensement, donc ils ne peuvent
   * plus oublier des champs différents.
   */
  readonly surfaces: readonly OutputSurface[];
  readonly groupBites: readonly {
    readonly bearer: string;
    readonly term: string;
    readonly foodGroup: string;
    readonly allergenRef: string;
  }[];
  /** Les jetons du verrou GLOBAL. Vide = il n'a pas mordu sur l'ensemble. */
  readonly globalTokens: readonly string[];
  readonly safetyConstraints: readonly StudentSafetyConstraint[] | null;
  readonly doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
}): UnsafeViolation[] {
  const violations: UnsafeViolation[] = [];
  const mord = (text: string): string[] | null => {
    if (String(text ?? "").trim() === "") return null;
    const r = applyKeelOutputLocks({
      text,
      isKeelStudent: true,
      safetyConstraints: args.safetyConstraints,
      doctrine: args.doctrine,
    });
    const propre = r.reason === "clean" || r.reason.startsWith("disarmed");
    return propre ? null : r.tokens;
  };
  const vide = {
    index: null,
    sessionIndex: null,
    day: null,
    slot: null,
    title: null,
    memberId: null,
    preparationId: null,
    preparationIds: [] as readonly string[],
    memberIds: [] as readonly string[],
    term: null,
  } as const;
  for (const s of args.surfaces) {
    const tokens = mord(s.text);
    if (tokens === null) continue;
    violations.push({ where: s.kind, ...s.address, tokens });
  }
  // ⛔ LA SECONDE CEINTURE EST DÉJÀ LOCALISÉE: elle nomme le PORTEUR et le
  // groupe déclaré. On la reprend telle quelle plutôt que de la rejouer.
  for (const bite of args.groupBites) {
    violations.push({
      ...vide,
      where: "declared_group",
      title: bite.bearer,
      term: bite.term,
      tokens: [bite.allergenRef, bite.foodGroup],
    });
  }
  if (violations.length === 0 && args.globalTokens.length > 0) {
    violations.push({ ...vide, where: "unlocalized", tokens: args.globalTokens });
  }
  return violations;
}

export function decodeModelJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

export function parseGeneratedMeal(
  raw: unknown,
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    mode: MealMode;
    scope: MealScope;
    pantry: readonly PantryItem[];
    /** Les clés de la doctrine publiée, pour filtrer `honours_belief_keys`. */
    beliefKeys: readonly string[];
    /**
     * LES MOMENTS D'UNE JOURNÉE NORMALE POUR CET ÉLÈVE — les mêmes que ceux
     * passés à `buildMealPrompt`. Vide = il ne les a pas déclarés.
     *
     * REQUIS, `T` avec une valeur explicite pour « on ne sait pas » (`[]`),
     * jamais `T?`. Ce paramètre n'existait pas, et son absence était le défaut:
     * le plafond du PROMPT suivait le rythme (5 occasions ⇒ 5 plats) pendant que
     * le plafond du PARSEUR l'ignorait et retombait sur trois. Un élève à cinq
     * repas voyait donc ses deux dernières occasions tomber APRÈS génération —
     * c'est-à-dire disparaître, sans que rien ne le dise, ce que le commentaire
     * de `dishCapFor` promettait précisément d'empêcher.
     *
     * Optionnel, il serait ré-oublié par le prochain appelant, en silence, et la
     * seule preuve serait une journée trouée. Même raisonnement que
     * `safetyConstraints` dans `buildWeekPlanPrompt`.
     */
    eatingRhythm: readonly EatingOccasionSlot[];
    /**
     * LES CONTENANTS SANS NOM — la lane individuelle, 2026-09-01.
     *
     * ⛔ REQUIS. Il ouvre UNE porte et une seule: un couvercle sans `member_ids`
     * est accepté. Tout le reste du protocole (la ceinture de régime, les
     * compteurs par bouche, `onePerMouth`) reste fermé par `boxMembers.size`,
     * qui vaut zéro sur cette lane — ces règles départagent des mangeurs, et il
     * n'y en a qu'un.
     *
     * ⚠️ IL NE SE DÉDUIT PAS DE `boxMemberIds.length === 0`. Un foyer dont le
     * roster n'a pas pu être lu rendrait alors la même chose qu'un solo, et on
     * accepterait des bacs anonymes sur une table de quatre — c'est-à-dire des
     * contenants que personne ne sait à qui ouvrir. L'appelant DIT.
     */
    soloBoxes: boolean;
    /**
     * ⟳ 2026-09-07 — RECETTE STANDARD (v33). Voir la déclaration jumelle sur
     * `MealPromptArgs`: `true` fait accepter `servings_made: 1`, qui est le cas
     * NOMINAL quand chaque plat tire une portion de sa casserole.
     *
     * ⛔ REQUIS ET SANS DÉFAUT: un `?` relirait une sortie v33 avec les règles
     * de v32 et jetterait ses casseroles.
     */
    standardRecipe: boolean;
    /**
     * LE JOUR DE CUISINE QUI NE PORTE AUCUN REPAS — « je cuisine la veille ».
     *
     * ⛔ REQUIS ET NULLABLE, et il traverse jusqu'ici parce que DEUX gardes en
     * dépendent: les cases vides (un jour sans repas n'a pas de case à remplir)
     * et le placement des plats (un plat écrit sur ce jour-là contredit la
     * consigne, et il est refusé plutôt qu'affiché).
     *
     * ⚠️ IL EST DANS `daysToFill`, comme côté prompt: c'est lui qui situe la
     * casserole du rang 0 dans la fenêtre du cuit. Le retirer de `daysToFill`
     * rendrait tous ses lots `not_evaluated`, dont le seuil est zéro.
     */
    cookOnlyDay: string | null;
    /**
     * LES JOURS RÉELLEMENT DEMANDÉS. REQUIS pour la même raison que
     * `eatingRhythm` juste au-dessus: le plafond du parseur doit être celui du
     * prompt, et un paramètre optionnel est un paramètre qu'un appelant oublie
     * — après quoi le prompt demande quatre jours et le parseur en accepte
     * sept, ce qui est exactement le débordement qu'on répare.
     */
    daysToFill: readonly string[];
    /**
     * LES MOMENTS ÉCARTÉS — les mêmes que ceux passés à `buildMealPrompt`.
     *
     * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la troisième fois
     * que ce fichier écrit la même phrase, et elle a été payée trois fois: un
     * paramètre optionnel est un paramètre qu'un appelant oublie, après quoi la
     * consigne interdit un moment que le parseur accepte — et le plat interdit
     * arrive dans l'assiette avec l'air d'avoir été voulu.
     */
    awayDays: readonly AwayDay[];
    /**
     * LE TEMPS PAR SESSION DÉCLARÉ PAR L'ÉLÈVE, ou `null` s'il ne l'a pas dit.
     *
     * REQUIS, `T | null`, jamais `T?`: c'est un PLAFOND, et un plafond qu'un
     * appelant peut oublier de passer est un plafond désarmé — le prompt
     * l'annonce, personne ne le vérifie, et on ne le découvre qu'en mesurant un
     * plan à la main. Mesuré le 2026-08-06: 30 minutes déclarées, 55 produites.
     */
    cookingTimeMin: number | null;
    /**
     * CE QUE CETTE CUISINE POSSÈDE — `null` quand la question n'a jamais été
     * posée. 2026-09-01.
     *
     * ⚠️ REQUIS, `T | null`, jamais `T?`. C'est la SIXIÈME fois que ce fichier
     * écrit cette phrase, et il l'a payée les cinq précédentes (`eatingRhythm`,
     * `awayDays`, `cookingTimeMin`, `composition`, `fixedIntakes`): un
     * paramètre optionnel est un paramètre qu'un appelant oublie, après quoi la
     * garde du congélateur tombe sur `undefined` et se comporte comme si
     * personne n'en avait — c'est-à-dire qu'elle jette les plats que ce lot
     * existe pour garder, sans un seul rouge.
     *
     * ⛔ IL NE SERT QU'À `kept: "freezer"`, ET LA DIRECTION EST FAIL-CLOSED.
     * `null` (jamais demandé) et « pas de congélateur » retombent tous deux sur
     * `MAX_FRIDGE_DAYS`. On n'ouvre une fenêtre de conservation que sur une
     * affirmation, jamais sur une ignorance.
     */
    kitchenEquipment: readonly KitchenTool[] | null;
    /**
     * FF-038 — LE RÉFÉRENTIEL DE COMPOSITION, ou `null` quand il n'a pas pu
     * être chargé.
     *
     * REQUIS, `T | null`, jamais `T?`. C'est la QUATRIÈME fois que ce fichier
     * écrit cette phrase, et il l'a payée les trois précédentes
     * (`eatingRhythm`, `awayDays`, `cookingTimeMin`): un paramètre optionnel
     * est un paramètre qu'un appelant oublie, et la seule preuve serait une
     * colonne de grammes vide que personne ne regarde. Ici la casse de
     * compilation est LE mécanisme qui recense les deux lanes.
     *
     * `null` est un fail-open ASSUMÉ: les trois champs structurés sont quand
     * même lus et gardés, seuls les grammes manquent. L'instrumentation ne
     * doit jamais coûter un dîner à un élève.
     */
    composition: CompositionIndex | null;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LOT C (2026-09-11) — LA PORTE DE COMPOSITION DU LOT A, INJECTÉE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ OPTIONNEL, ET SON DÉFAUT EST LA PORTE FERMÉE — c'est ce qui évite ici
     * la cicatrice « paramètre optionnel = garde désarmée ». Le défaut est
     * `isComposable` (`food_reference_manifest.ts`, lot A): un appelant qui
     * l'oublie obtient la règle, pas son absence. Le rendre REQUIS aurait cassé
     * le typecheck des fonctions edge, qui appartiennent au lot E et que ce lot
     * n'a pas le droit de modifier.
     *
     * ⛔ CE QUE CE PARAMÈTRE SERT ALORS À FAIRE: l'OUVRIR sciemment, et
     * seulement pour une MESURE. Arbitrage ② du socle — « la porte est à la
     * COMPOSITION, pas à la mesure »: rejouer un plan historique doit rester
     * possible, et `ANY_INDEXED_REF` est le prédicat qui le permet, nommé pour
     * qu'on voie ce qu'il désarme.
     *
     * ⚠️ ET LE COMPTEUR RESTE: `ref_refused` sépare `unknown` (identifiant
     * inventé) de `not_composable` (identifiant réel que le manifeste refuse).
     * Sans lui, une porte jamais franchie et une porte jamais armée rendraient
     * le même zéro.
     */
    composable?: ComposablePredicate;
    /**
     * FF-051 — LES MÊMES APPORTS QUE CEUX PASSÉS À `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « aucun ». Les deux bouts, comme pour `awayDays`: une
     * consigne « ne compose pas de petit-déjeuner » sans vérification derrière
     * est une consigne qu'un modèle de composition respectera la plupart du
     * temps — et « la plupart du temps » veut dire que l'élève doit vérifier.
     */
    fixedIntakes: readonly FixedIntake[];
    /**
     * FF-052 — LES MÊMES propriétés que celles passées à `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « rien ». Les deux bouts: la consigne dit « ne compose
     * rien de neuf ce jour-là », le parseur retire le plat neuf s'il arrive
     * quand même.
     */
    dayProperties: readonly DayPropertyEntry[];
    /**
     * L4/D6 — LA MÊME BOUCHE REPRISE que celle passée à `buildMealPrompt`.
     *
     * REQUIS, `T | null`, jamais `T?`. Les DEUX BOUTS, et c'est ce champ qui
     * les tient ensemble: il gouverne le budget de plats (annoncé par la
     * consigne, appliqué ici) ET la garde de préparation juste en dessous. Le
     * jour où les deux appels ne portent pas la même valeur, la consigne
     * demande un second plat que le parseur jette — c'est exactement le défaut
     * mesuré le 2026-08-12, dans les deux sens à la fois.
     */
    merge: MergedEater | null;
    /**
     * LOT 4 — LES BOUCHES À QUI UNE BOÎTE PEUT ÊTRE ATTRIBUÉE, avec leur id
     * EXACT. C'est le ROSTER ENTIER d'un foyer, et pas `dishBearerIds`: tout le
     * monde reçoit une part, seuls quelques-uns reçoivent un plat à eux.
     *
     * ⚠️ REQUIS, `[]` pour « personne », jamais `T?`. C'est la sixième fois que
     * ce fichier écrit cette phrase et il l'a payée les cinq précédentes: un
     * paramètre facultatif n'aurait fait remonter AUCUN appelant au
     * compilateur, la liste fermée serait vide sur les deux lanes, chaque boîte
     * serait refusée, et le lot entier serait construit-branché-désarmé sans un
     * seul rouge. « Paramètre de garde optionnel = garde désarmée. »
     *
     * `[]` sur la LANE INDIVIDUELLE, et c'est voulu: son prompt ne porte aucun
     * id de bouche, donc le modèle n'a rien à écrire, donc rien n'est
     * attribuable — exactement la posture de `memberId`, qui y est toujours
     * `null`. Une boîte qui arriverait quand même y est jetée et COMPTÉE.
     *
     * ⚠️ LE ROSTER ENTIER À NOUVEAU DEPUIS v4 (2026-08-20). Entre le 08-19 et le
     * 08-20 cette liste valait `weighedPortionMembers(members)` — les seules
     * bouches à objectif — parce que v3 ne donnait de contenant qu'à elles. v4
     * renverse ce silence: le bac commun NOMME les autres, donc le parseur doit
     * les accepter sur un couvercle. La distinction « qui ouvre une portion
     * millimétrée » vit maintenant dans `weighedMemberIds`, juste en dessous.
     */
    boxMemberIds: readonly string[];
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LES BOUCHES DONT UN OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ CE N'EST PAS UNE LISTE FERMÉE DE PLUS — c'est le SEUL moyen de dériver
     * `box_counts.expected` sans le modèle. Le nombre de groupes d'un repas est
     * « une bouche à objectif = un groupe, tout le reste = un groupe », et sans
     * savoir qui a un objectif, l'attendu n'est pas calculable — donc zéro
     * contenant rendu serait indiscernable d'un foyer où personne n'en demande.
     *
     * ⚠️ REQUISE, `[]` pour « personne », jamais `T?`. Huitième fois dans ce
     * fichier: un paramètre de garde optionnel est une garde désarmée, et ici il
     * ferait lire `expected` à la moitié de sa valeur sur tout foyer à objectif,
     * c'est-à-dire un taux de couverture flatteur et faux.
     *
     * ⚠️ SOUS-ENSEMBLE DE `boxMemberIds`, et la dérive se COMPTE: un id nommé ici
     * sans être dans le roster est une seconde liste qui a divergé de la
     * première, et il est ignoré avec une `issue`.
     *
     * `[]` sur la LANE INDIVIDUELLE, comme `boxMemberIds`.
     */
    weighedMemberIds: readonly string[];
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LA CEINTURE DE RÉGIME — LE RÉGIME DÉCLARÉ DE CHAQUE BOUCHE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ CE QUE CE PARAMÈTRE FERME, ET IL A ÉTÉ MESURÉ CINQ PLANS SUR CINQ.
     * Le 2026-08-19, sur la lane FOYER, un enfant VÉGANE de 9 ans a reçu
     * `Rich Smoky Beef Stew 207 g · Smoky Roast Chicken & Cauliflower 248 g`
     * dans `member_portions[].portion_note` — c'est-à-dire dans la phrase lue
     * à voix haute à table. `scanDietaryRegime` existait, il était juste, et
     * il n'avait ZÉRO appelant sur cette lane: la seule lane où plusieurs
     * régimes se rencontrent autour d'une casserole était la seule sans
     * ceinture.
     *
     * ⚠️ LA CAUSE N'ÉTAIT PAS UN RATTRAPAGE MANQUANT PLUS BAS. Le modèle avait
     * bien écrit une part pour Théodule sur ce repas, et il l'avait écrite parce
     * que le brief le lui ORDONNE (« every person eating at that meal is on the
     * lid — never two, never none »). La garde est donc ici, à l'entrée de la
     * boîte, là où l'appartenance se crée — pas plus bas, où elle ne serait
     * qu'un rattrapage, et pas chez l'appelant, où le prochain appelant
     * l'oublierait (cicatrice FF-030 R5).
     *
     * ⚠️ REQUIS, `[]` pour « personne n'a déclaré », jamais `T?`. C'est la
     * septième fois que ce fichier écrit cette phrase et il l'a payée les six
     * précédentes: un paramètre facultatif n'aurait fait remonter AUCUN
     * appelant au compilateur, la ceinture serait vide sur les deux lanes, et
     * le lot entier serait construit-branché-désarmé sans un seul rouge.
     * « Paramètre de garde optionnel = garde désarmée. »
     *
     * `[]` sur la LANE INDIVIDUELLE, et c'est voulu: elle n'a aucune boîte
     * (`boxMemberIds: []`), et elle porte DÉJÀ sa propre lecture de régime sur
     * les plats (`generate-meal-v1:2400`). La doubler ici compterait deux fois
     * la même morsure.
     *
     * ⚠️ UNE BOUCHE NOMMÉE ICI SANS ÊTRE DANS `boxMemberIds` EST UNE DÉRIVE, et
     * elle se COMPTE (`regime_belt.unknown_mouth`) au lieu de se taire: deux
     * listes qui décrivent le même roster finissent par diverger, et la seule
     * preuve serait une ceinture qui n'a jamais rien vu.
     */
    boxMemberDiets: readonly { memberId: string; regime: DietaryRegime | null }[];
    /**
     * ⛔ CE QU'UNE BOUCHE A DEMANDÉ D'ÉVITER — lot du 2026-09-01.
     *
     * Mesuré sur un tour réel: « Mon fils n'aime pas le poisson » était rangé,
     * attribué (`subject: member:Tom`), compté — **et le plan suivant servait du
     * saumon**. La lane foyer ne parle que pour `[household, titulaire]`, donc
     * l'exclusion d'un enfant n'avait AUCUN chemin pour agir.
     *
     * ⚠️ REQUIS ET POSITIONNEL, comme `boxMemberDiets`: c'est le compilateur qui
     * recense les appelants. Un `?` aurait désarmé la ceinture partout sans
     * qu'un seul appelant ne remonte — sept paramètres optionnels ont déjà été
     * des gardes mortes dans ce dépôt.
     */
    boxMemberExclusions: readonly { memberId: string; terms: readonly ForbiddenTerm[] }[];
  },
): GeneratedMeal {
  const issues: string[] = [];
  // ⟳ LOT C — LE DÉFAUT EST RÉSOLU UNE FOIS, ICI, ET C'EST LA PORTE FERMÉE.
  // Le répéter à chaque site d'appel ferait deux lectures de la même décision.
  const composable = args.composable ?? isComposable;
  const rejectedNumeric: string[] = [];
  /**
   * COMBIEN DE DÉROULÉS DE SESSION PORTENT ENCORE UN POIDS OU UN COMPTE DE
   * PORTIONS. Le brief le leur interdit (`WEIGH IT ONCE, INTO NAMED BOXES`);
   * ce nombre dit si l'interdit est suivi. Zéro sur zéro session est un
   * silence honnête — il n'y avait rien à mesurer.
   */
  let runThroughQuantity = 0;
  const rejectedAisles: string[] = [];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C (2026-09-11) — CE QUE LE MODÈLE A FAIT DES IDENTIFIANTS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ QUATRE CASES, ET C'EST LE POINT. Ce dépôt sait qu'un champ déclaré par le
   * modèle sans compteur ressemble exactement à un champ qu'il honore
   * (`model-declared-fields-need-a-counter`). Un seul chiffre — « 12 lignes non
   * pesées » — confondrait trois causes qui appellent trois corrections
   * opposées:
   *   · `absent`         le catalogue n'a pas été servi, ou l'aliment n'y est
   *                      pas: c'est ATTENDU, et ce n'est pas une faute;
   *   · `unknown`        l'identifiant a été INVENTÉ: durcir la consigne;
   *   · `not_composable` il existe mais le manifeste le refuse: lot A;
   *   · `accepted`       le dénominateur sans lequel les trois autres ne
   *                      veulent rien dire.
   */
  const refTally: Record<RefOutcome, number> = {
    absent: 0,
    accepted: 0,
    alias: 0,
    unknown: 0,
    not_composable: 0,
  };
  let unstructuredIngredients = 0;
  /** Les aliments DENSES laissés sans grammes — la part qui coûte le verdict. */
  const unweighedDenseTerms: string[] = [];
  /**
   * LES TERMES SANS QUANTITÉ, NOMMÉS — le troisième compteur, et il manquait.
   *
   * ── LE ZÉRO AMBIGU QU'IL FERME, MESURÉ LE 2026-08-19 ──────────────────
   * `structured_quantity_missing` rend `30/94 ingredients`. Ce nombre ne
   * distingue pas « 30 pincées de persil », qui est le produit voulu, de
   * « roast chicken thighs, 26 fois », qui est une protéine entière servie
   * sans nombre. Les deux se lisent pareil, et c'est pourquoi le défaut a
   * vécu: rejoué sur les 1 204 plats de foyer en base, 307 sont bloqués par
   * un terme sans `amount`, et la liste est dominée par des ALIMENTS.
   *
   * ⚠️ NOMMÉ, comme `energy_dense_unweighed` et pour la même raison: c'est le
   * TERME qui dit si la consigne a porté, jamais le compte. Un chiffre qui
   * descend de 30 à 8 ne dit pas si les 8 restants sont du sel ou du poulet.
   *
   * ⚠️ TOUS LES TERMES, PAS SEULEMENT LES NON-CONDIMENTS. La classe fermée des
   * condiments n'existe pas encore (elle est le lot d'après, et elle ne peut
   * pas se dériver de `food_group_ref`: le sel et le poivre y sont rangés avec
   * la vinaigrette). Nommer tout le monde laisse le lecteur voir « roast
   * chicken thighs » au milieu du persil — ce qui est très exactement le geste
   * que ce compteur doit rendre possible.
   */
  const unquantifiedTerms: string[] = [];
  let ingredientCount = 0;

  const parsed: unknown = decodeModelJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/meal] model output is not a JSON object");
  }

  const root = parsed as Record<string, unknown>;
  const allowedKeys = new Set(args.beliefKeys.map((k) => String(k).trim()).filter(Boolean));
  // LE MÊME PLAFOND QUE LE PROMPT, dérivé du MÊME rythme ET de la MÊME bouche
  // reprise. Deux copies d'un même nombre dont une seule reçoit la modification
  // est le défaut que ce fichier documente deux fois; ici les deux copies lisent
  // la même fonction avec la même entrée, donc elles ne peuvent plus diverger.
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm: args.eatingRhythm,
    daysToFill: args.daysToFill.length || 7,
    merge: args.merge,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L0-a` — LES DEUX FENÊTRES DE CONSERVATION
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
  //
  // ── ① LA FENÊTRE CRUE: LE GROUPE D'UN TERME ──────────────────────────────
  // Le modèle n'écrit AUCUN groupe sur la liste de courses, et `aisle` est trop
  // grossier — `protein` mélange le poisson (un jour cru) et la viande en pièce
  // (trois). Le référentiel de composition, lui, porte `food_group_ref` sur ses
  // 923 lignes: c'est la seule jointure vivante entre un terme et un groupe.
  //
  // ⚠️ `null` QUAND LE RÉFÉRENTIEL EST ABSENT, et c'est le même fail-open
  // assumé que pour les grammes: l'instrumentation ne doit jamais coûter un
  // dîner. Le repli est celui d'avant (`MAX_FRIDGE_DAYS` côté vagues) et il se
  // COMPTE.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C3 — LE DERNIER LECTEUR DE MESURE PARTANT DU LIBELLÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL FAISAIT, ET IL A ÉTÉ NOMMÉ PAR DEUX CHANTIERS SANS ÊTRE FERMÉ
  // (`NON-BRANCHE.md` ⑥) : `resolveIngredient(term)`, c'est-à-dire le LIBELLÉ
  // seul. Un identifiant écrit par le modèle (`ref: pita_wholemeal`) ne
  // comptait pas, et « pita complète » n'a aucun alias — donc `null`, donc
  // `MAX_FRIDGE_DAYS` côté vagues, donc une date d'achat potentiellement trop
  // précoce que personne ne regarde.
  //
  // ⛔ LE GROUPE VIENT DÉSORMAIS DE LA RÉFÉRENCE DE LA LIGNE, par le résolveur
  // unique du lot A — l'identifiant d'abord, le terme ensuite, rien du tout
  // quand l'identifiant a été refusé. C'est le point 6 de C3, mot pour mot.
  //
  // ⚠️ `null` QUAND LE RÉFÉRENTIEL EST ABSENT, et c'est le même fail-open
  // assumé qu'avant : l'instrumentation ne doit jamais coûter un dîner. Le
  // repli est celui d'avant, et il se COMPTE (`rawWindowCounts`).
  const foodGroupOfLine = (
    line: { term: string; ref?: string | null; refRefused?: boolean },
  ): FoodGroupRef | null => freshnessGroupOf(args.composition ?? null, line);

  // ── ② LA FENÊTRE CUITE: OÙ TOMBE UN JOUR DANS LA FENÊTRE DU PLAN ────────
  // Hissé hors de la queue de la fonction, où la règle vivait, parce qu'elle
  // devient un REFUS et qu'un refus se prononce AVANT que le plat n'entre dans
  // le plan — un plat construit puis retiré aurait déjà consommé le plafond et
  // compté ses `honours_belief_keys`.
  const fridgeWindowDays = args.daysToFill.length > 0 ? args.daysToFill : DAY_TOKENS;
  const posOf = (day: string) => {
    const at = fridgeWindowDays.indexOf(day);
    return at >= 0 ? at : DAY_TOKENS.indexOf(day);
  };
  /**
   * LES TROIS POPULATIONS. `not_evaluated` est celle qui coûte le plus cher à
   * ne pas avoir: sans elle, « la fenêtre a tourné et rien n'a mordu » et « la
   * fenêtre n'a pas tourné » rendent le même `violations: 0`.
   */
  const fridgeWindow: FridgeWindowCounts = emptyFridgeWindowCounts();

  // ══════════════════════════════════════════════════════════════════════════
  // LE CONGÉLATEUR — résolu UNE fois, et par une AFFIRMATION.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `=== true`, ET LA COMPARAISON EST LA GARDE. `hasKitchenTool` rend
  // `true | false | null`, et le pavé de son module interdit
  // `!hasKitchenTool(...)` parce que cette forme-là traite « on ne lui a jamais
  // demandé » comme « il n'en a pas ». Ici on veut EXACTEMENT l'inverse: seule
  // une déclaration positive ouvre la fenêtre de conservation. `false` et
  // `null` retombent tous deux sur `MAX_FRIDGE_DAYS`, et c'est la seule
  // direction acceptable pour une règle qui décide si on sert un lot de six
  // jours.
  const hasFreezer = hasFreezerDeclared(args.kitchenEquipment);
  /**
   * COMBIEN DE PARTS RÉCLAMENT UN CONGÉLATEUR QUE CE FOYER N'A PAS DÉCLARÉ.
   *
   * ⚠️ SANS CE NOMBRE, LE LOT EST INVÉRIFIABLE. `kept` est un champ DÉCLARÉ PAR
   * LE MODÈLE: « il obéit » et « on n'a rien mesuré » rendent le même silence.
   * Troisième fois dans ce fichier (`model_quantity`, `model_size_word`).
   */
  /**
   * LES SESSIONS QUI PRENNENT PLUS DE TEMPS QUE DÉCLARÉ — 2026-09-01.
   *
   * ⚠️ STRUCTURÉ, PAS UNE CHAÎNE À REPARSER. Même patron qu'`empty_slots`: la
   * phrase que l'écran en tire se compose de `day`, `minutes` et `declared`, et
   * relire une ligne d'`issues` pour retrouver ces trois nombres serait un
   * matcher maison sur du texte — ce que ce dépôt refuse depuis les douze faux
   * positifs de « laitue » contre « lait ».
   */
  const sessionOverruns: { day: string; minutes: number; declared: number }[] = [];
  let freezerWithoutOne = 0;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LES PLATS TOMBÉS PARCE QU'UN `for_member_id` REFUSÉ EN AURAIT FAIT UN
   * SECOND PLAT DE TABLE. Mesuré le 2026-09-14, 6 tirs sur 13.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ IL NE PEUT PAS VIVRE DANS `keptOwnerFacts`, et c'est exactement pourquoi
   * il existe. Les cinq tableaux parallèles décrivent les plats GARDÉS; un plat
   * tombé n'y a pas de ligne. Sans ce nombre, le geste le plus lourd du lot —
   * retirer un plat que le modèle a écrit — serait le seul qui ne se compte
   * nulle part, et « un compteur qui ne peut plus bouger est pire qu'absent »
   * vaut d'abord pour celui qui n'existe pas.
   *
   * ⚠️ IL SORT À CÔTÉ DES QUATRE AUTRES, PAS DEDANS: `declared === attributed +
   * refused` est une PROPRIÉTÉ testée sur la population gardée, et y verser une
   * population différente la casserait sans rien dire.
   */
  let ownerRefusedDropped = 0;
  /**
   * SA POPULATION À LUI — les liens (casserole, repas) que la fenêtre du cuit a
   * pu situer dans le temps.
   *
   * ⚠️ CE N'EST PAS CELLE DE `keptTotal`, ET LES DEUX NOMBRES SE LISAIENT MAL
   * SANS ÇA. Mesuré le 2026-09-01: `uses_kept_freezer: 6/6` à côté de
   * `freezer_claimed_without_one: 14` — 14 réclamations sur 6 parts, ce qui
   * n'a aucun sens à la lecture. Les deux comptent à deux étages: celui-ci
   * tourne sur la sortie BRUTE, avant que la garde ne jette des plats; l'autre
   * sur les parts SURVIVANTES. Chacun sort donc avec SON dénominateur.
   */
  let freezerClaimLinks = 0;
  /** Combien de parts portent un `kept` lisible — le dénominateur suit. */
  let keptDeclared = 0;
  let keptTotal = 0;

  // ── LA GARDE DE PRÉPARATION DÉPEND DE QUI MANGE ─────────────────────────
  // Résolu UNE fois, hors de la boucle: la question ne se pose pas préparation
  // par préparation, elle se pose une fois pour le plan.
  const secondDishAsked = args.merge !== null && asksForASecondDish(args.merge.shape);
  // LOT C — LA LISTE FERMÉE DES BOUCHES ATTRIBUABLES. Résolue UNE fois, hors de
  // la boucle, pour la même raison que la ligne au-dessus: la question ne se
  // pose pas plat par plat, elle se pose une fois pour le plan.
  const dishBearers = new Set(
    (args.merge?.dishBearerIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  // LOT 4 — LA LISTE FERMÉE DES BOUCHES À QUI UNE BOÎTE PEUT REVENIR. Le ROSTER
  // ENTIER, et pas `dishBearers`: tout le monde a une part, seuls quelques-uns
  // ont un plat à eux. Résolue une fois, hors des deux boucles.
  const boxMembers = new Set(
    args.boxMemberIds.map((id) => String(id).trim()).filter(Boolean),
  );
  // ── v4 · LES BOUCHES DONT L'OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE ────────
  //
  // ⚠️ INTERSECTÉ AVEC LE ROSTER, ET LA DÉRIVE SE COMPTE. Deux listes qui
  // décrivent la même table finissent par diverger; ici la divergence
  // gonflerait `expected` d'un groupe fantôme, donc elle ne se tait pas.
  const weighedMembers = new Set<string>();
  for (const raw of args.weighedMemberIds) {
    const id = String(raw).trim();
    if (!id) continue;
    if (!boxMembers.has(id)) {
      issues.push(
        `weighed_member_not_in_roster:${JSON.stringify(id)} -- ignored for the ` +
          `expected box count`,
      );
      continue;
    }
    weighedMembers.add(id);
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LA CEINTURE DE RÉGIME — LA TABLE DES LIGNES DÉCLARÉES, RÉSOLUE UNE FOIS.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ SEULES LES BOUCHES QUI ONT DÉCLARÉ Y ENTRENT. `omnivore` n'est pas un
  // régime (il n'exclut rien), et `null` veut dire « personne n'a demandé »:
  // `household_diet.ts` fait déjà cette distinction en tête de fichier, et la
  // refaire ici en produirait une seconde version.
  const mouthRegimes = new Map<string, DietaryRegime>();
  /**
   * CE QU'UNE BOUCHE ÉVITE, par identifiant. Même forme et même porte que les
   * régimes: une bouche absente du roster n'entre pas.
   */
  const mouthExclusions = new Map<string, readonly ForbiddenTerm[]>();
  /** Une bouche nommée par les régimes mais absente du roster — voir plus haut. */
  let regimeUnknownMouth = 0;
  for (const entry of args.boxMemberDiets) {
    const memberId = String(entry?.memberId ?? "").trim();
    if (!memberId) continue;
    if (!boxMembers.has(memberId)) {
      regimeUnknownMouth++;
      continue;
    }
    if (entry.regime === null || entry.regime === undefined) continue;
    mouthRegimes.set(memberId, entry.regime);
  }
  for (const entry of args.boxMemberExclusions) {
    const memberId = String(entry?.memberId ?? "").trim();
    if (!memberId || !boxMembers.has(memberId)) continue;
    const terms = entry.terms ?? [];
    if (terms.length === 0) continue;
    mouthExclusions.set(memberId, terms);
  }
  /**
   * CE QUE LA CEINTURE A RETIRÉ, PAR PRÉPARATION — et ce n'est pas seulement
   * une trace. DEUX consommateurs le lisent, et c'est pour ça qu'il est
   * construit ici plutôt que recalculé deux fois:
   *
   *   ① la boucle « une bouche a une part » plus bas: une bouche que le RÉGIME
   *      tient hors d'une casserole n'est PAS une bouche « oubliée par le
   *      modèle ». La compter dans `mouths_unboxed` ferait lire un défaut là
   *      où le produit vient de faire son travail — et ce compteur-là est
   *      justement celui qu'on regarde pour savoir si le service tient.
   *   ② `reconcilePortions`, chez l'appelant: une PART qui cite une
   *      préparation que le régime refuse est la même affectation fausse, sur
   *      l'autre surface. Un seul scan, deux ceintures.
   */
  const regimeRefusedByPreparation = new Map<string, Set<string>>();
  /**
   * ⚠️ CINQ NOMBRES, ET LES TROIS PREMIERS SONT LA RAISON D'ÊTRE DU COMPTEUR.
   * `refused: 0` seul est AMBIGU — il rend le même zéro pour « aucune bouche
   * n'a déclaré de régime » et pour « toutes ont déclaré et rien n'a mordu ».
   * C'est le zéro que ce dépôt paie en boucle, et c'est pour ça que
   * `mouths` (combien de bouches portent une ligne) et `checked` (combien
   * d'appartenances de boîte ont été LUES) sont rendus à côté.
   *
   *   · `mouths`   — les bouches du roster qui portent un régime déclaré.
   *                  `0` ⇒ JAMAIS DÉCLARÉ, la ceinture n'avait rien à faire.
   *   · `checked`  — les appartenances (bouche × boîte) réellement examinées.
   *                  Le dénominateur. `mouths > 0 && checked === 0` ⇒ le
   *                  modèle n'a écrit aucune boîte pour ces bouches-là.
   *   · `kept`     — celles que la ceinture a laissées passer.
   *   · `refused`  — celles qu'elle a retirées. DÉCLARÉ PUIS REFUSÉ.
   *   · `silenced` — les morsures désamorcées par un analogue végétal
   *                  (« soy yoghurt », « lait d'avoine »). Sans ce nombre, une
   *                  ceinture qui blanchirait tout demain afficherait
   *                  `refused: 0`, c'est-à-dire l'image d'un régime tenu.
   *
   * PROPRIÉTÉ TESTÉE: `checked === kept + refused`.
   */
  /**
   * LA CEINTURE DES EXCLUSIONS — les MÊMES quatre nombres que celle des
   * régimes, et pour la même raison: `refused: 0` seul rend le même zéro pour
   * « personne n'a rien exclu » et « rien n'a mordu ».
   *
   *   · `mouths`  — les bouches qui portent au moins une exclusion cherchable.
   *   · `checked` — les appartenances (bouche × boîte) réellement examinées.
   *   · `kept` / `refused` — laissées passer / retirées du contenant.
   *
   * PROPRIÉTÉ: `checked === kept + refused`.
   */
  const exclusionBelt = {
    mouths: mouthExclusions.size,
    checked: 0,
    kept: 0,
    refused: 0,
    // ── ÉCHANGE · LE MÊME COUPLE QUE LE RÉGIME (2026-09-04) ──────────────
    // Le défaut mesuré: 4 refus d'exclusion sur un plan réel, et une bouche
    // sans aucune boîte à 5 repas sur 12. `refused` seul ne disait pas si le
    // modèle avait ESSAYÉ de séparer.
    bites: 0,
    separated: 0,
    not_separated: 0,
    box_scoped: 0,
  };
  const regimeBelt = {
    mouths: mouthRegimes.size,
    checked: 0,
    kept: 0,
    refused: 0,
    // ── v4 · CE QUE LA COMPOSITION AVAIT DÉJÀ RÉGLÉ ──────────────────────
    // `bites` compte les morsures détectées, `separated` celles que le modèle
    // avait résolues en donnant son contenant à la bouche mordue. Sans ce
    // couple, un modèle qui ne sépare jamais ressemble à un foyer sans régime.
    bites: 0,
    separated: 0,
    not_separated: 0,
    silenced: 0,
    silenced_homograph: 0,
    silenced_spelling: 0,
    unknown_mouth: regimeUnknownMouth,
    // ÉCHANGE · sur quelle SURFACE les couvercles ont été jugés.
    box_scoped: 0,
    citation_repaired: 0,
    item_repaired: 0,
    // ── LES TROIS NOMBRES DU CHAMP DÉCLARÉ (2026-08-19) ──────────────────
    // Comptés sur TOUS les ingrédients du plan, pas seulement sur ceux qu'une
    // bouche à régime finit par regarder: un modèle qui n'écrit jamais le
    // champ et un modèle qui l'écrit faux sont deux pannes distinctes, et
    // toutes deux se voient AVANT qu'une ceinture ait quoi que ce soit à
    // vérifier.
    groups_declared: 0,
    groups_valid: 0,
    groups_refused: 0,
    // ⛔ COMBIEN DE GROUPES VALIDES LE RÉFÉRENTIEL A DÛ CORRIGER (2026-09-13).
    // Sans ce nombre, un moteur qui réconcilie et un moteur qui a perdu sa
    // réconciliation rendent exactement le même plan livré: on ne verrait la
    // différence qu'au prochain 422 sur une bouche végane.
    groups_conflicting: 0,
    // Ce que la déclaration a FAIT, une fois arrivée à la ceinture. Sans ces
    // trois-là, un champ parfaitement rempli et un champ parfaitement ignoré
    // rendraient le même verdict — la cicatrice « un champ collecté sans
    // lecteur ressemble exactement à un champ ignoré ».
    group_excluded: 0,
    group_plant_only: 0,
    group_undecided: 0,
  };
  /** Les ids de boîte déjà pris, sur TOUT le plan — voir la porte ① plus bas. */
  const boxIdsSeen = new Set<string>();
  /** Les CONTENANTS jetés. Compté ici, jamais dérivé d'une soustraction. */
  let boxesRefused = 0;
  /** Les NOMS gardés sur les couvercles, et ceux jetés. Deux sacs, jamais une soustraction. */
  let boxNames = 0;
  let boxNamesRefused = 0;
  /** Les COMPOSANTS gardés, et ceux jetés. Même discipline. */
  let boxItems = 0;
  let boxItemsRefused = 0;
  /**
   * ⟳ 2026-09-13 — PAR QUELLE FORME UN COMPOSANT GARDÉ A ÉTÉ PESÉ.
   *
   * ⛔ DEUX SACS DISTINCTS, ET C'EST LA CICATRICE « un champ déclaré par le
   * modèle demande un compteur ». `items` seul confond « le modèle a écrit
   * `grams`, comme le schéma v4 le demande » et « le modèle a écrit une forme
   * d'ingrédient, et le lecteur l'a convertie par le référentiel ». Les deux
   * appellent des suites OPPOSÉES: la première ne demande rien, la seconde dit
   * que le prompt de ce chemin n'a pas servi son schéma. Sans la séparation, un
   * lot désarmé — le prompt qui cesse de nommer la clé — ressemble exactement à
   * un lot qui marche.
   *
   * ⚠️ `items = items_in_grams + items_from_ingredient`, par construction: ce
   * sont deux chemins exclusifs du même item gardé, pas deux mesures du même
   * nombre.
   */
  let boxItemsInGrams = 0;
  let boxItemsFromIngredientForm = 0;
  /**
   * LES CONTENANTS RECONSTRUITS DEPUIS UN `box` SINGULIER v2.
   *
   * ⛔ IL DOIT TOMBER À ZÉRO UNE FOIS LE PROMPT PASSÉ EN v4, et c'est très
   * exactement pour ça qu'il se compte. Un repli qui devient le chemin nominal
   * ne se voit par aucun autre nombre: le plan est rempli, les contenants sont
   * là, et personne ne sait que la ventilation par composant n'existe pas.
   */
  let boxesLegacyFolded = 0;
  /**
   * LOT 4C ④ — LES BOÎTES DONT LE NOMBRE AFFICHÉ N'EST PAS CELUI DU MODÈLE.
   *
   * ⛔ UNE VALEUR CORRIGÉE EN SILENCE EST UNE VALEUR DONT PERSONNE NE SAURA
   * QU'ELLE A ÉTÉ CORRIGÉE. Mesuré le 2026-08-17: sur un run réel, CINQ boîtes
   * sur sept demandaient 7500, 3600, 3600, 3600 et 2400 g, et l'écran a affiché
   * « 2000 g » cinq fois. Une `issue` le disait; `box_counts` lisait ce run
   * comme PARFAIT (`refused: 0`), et un tableau de bord SQL n'avait aucun moyen
   * de le savoir.
   *
   * ⚠️ CE N'EST PAS UN REFUS, et il ne doit pas se compter comme tel. La boîte
   * est GARDÉE, écrêtée — le plafond empêche un « 75000 g » d'entrer en base.
   * La ranger dans `refused` ferait mentir la propriété que le lot annonce
   * (« refused = les entrées jetées ») dans les deux sens à la fois.
   *
   * ⚠️ IL COMPTE DES **COMPOSANTS**, depuis le 2026-08-20 (des PARTS depuis le
   * 08-19): la grandeur bornée est toujours « un aliment, une fois, pour un
   * repas », et c'est désormais ce que la donnée dit.
   */
  let boxesCapped = 0;

  // ── LES PLATS ───────────────────────────────────────────────────────────
  // ── LES PRÉPARATIONS ────────────────────────────────────────────────────
  // Parsées AVANT les plats, parce que les plats les référencent: un `uses`
  // qui pointe une préparation inexistante doit être jeté, pas affiché comme
  // « prélève sur quelque chose » que l'élève ne trouvera nulle part.
  const preparations: MealPreparation[] = [];
  for (const [i, entry] of (Array.isArray(root.preparations) ? root.preparations : []).entries()) {
    const prep = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const id = cleanText(prep.id);
    const title = cleanText(prep.title);
    if (!id || !title) {
      issues.push(`preparations[${i}]: missing id or title, dropped`);
      continue;
    }
    const made = Number(prep.servings_made);
    // ⟳ 2026-09-07 — v33 ACCEPTE `servings_made: 1`, ET C'EST LE CAS NOMINAL.
    // Sous recette standard, une casserole est écrite POUR LES PLATS QUI LA
    // TIRENT et chaque plat en tire UNE portion: « une casserole cuisinée la
    // veille pour un seul plat » est exactement ce que le prompt demande. La
    // garde d'origine — « une préparation d'une portion n'en est pas une » —
    // était vraie quand le modèle écrivait des plats de tablée; elle jette
    // maintenant le nominal, et c'est le défaut que `secondDishAsked` avait
    // déjà mesuré une fois (`prep_zoe_tuna_pasta`, run réel du 2026-08-12).
    const onePortionOk = secondDishAsked || args.standardRecipe;
    if (!Number.isFinite(made) || (onePortionOk ? made < 1 : made <= 1)) {
      // ── UNE PORTION: ÇA DÉPEND DE COMBIEN DE BOUCHES ON SERT ────────────
      //
      // SANS FUSION, LA GARDE RESTE ENTIÈRE, et elle est juste: une préparation
      // d'UNE portion n'en est pas une, c'est un plat. La garder ferait afficher
      // une session de cuisine pour une assiette. Rien ne bouge sur la lane
      // individuelle ni sur une composition de foyer ordinaire.
      //
      // ⚠️ AUX BARREAUX ② ET ③, C'EST LE CAS NOMINAL, ET LA GARDE LE JETAIT.
      // Les deux consignes demandent au modèle une préparation POUR UNE SEULE
      // BOUCHE (« give them a SECOND dish », « their dishes »). Mesuré en run
      // réel le 2026-08-12: le modèle a rendu `prep_zoe_tuna_pasta` avec
      // `servings_made: 1`, obéissant parfaitement — la préparation a été jetée,
      // puis le plat qui la citait est devenu `unknown preparation, dropped`. EN
      // BASE, le plat de la personne fusionnée existait comme un TITRE NU,
      // rattaché à aucune préparation et à aucune session de cuisson: la
      // promesse « cuisiné dans la MÊME session » n'était nulle part dans le
      // plan écrit.
      //
      // LE PLANCHER RESTE UNE PORTION. `0`, une valeur négative ou un
      // `servings_made` illisible tombent dans les deux cas: une préparation qui
      // ne nourrit personne n'est pas un plat dédié, c'est une erreur de sortie.
      issues.push(
        onePortionOk
          ? `preparations[${i}]: servings_made must be >= 1, dropped`
          : `preparations[${i}]: servings_made must be > 1, dropped`,
      );
      continue;
    }
    const method = cleanText(prep.method);
    const numeric = findNumericTarget(`${title} ${method}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`preparations[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    const prepIngredients: DishIngredient[] = [];
    let prepNumeric: string | null = null;
    for (const rawIng of (Array.isArray(prep.ingredients) ? prep.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) continue;
      const quantity = cleanText(ing.quantity) || null;
      if (quantity && ENERGY_UNIT_RE.test(quantity)) { prepNumeric = "energy_unit_in_quantity"; break; }
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) { prepNumeric = termNumeric; break; }
      const prepGroup = readDeclaredGroup(ing);
      if (prepGroup.declared) {
        regimeBelt.groups_declared++;
        if (prepGroup.group === null) regimeBelt.groups_refused++;
        else regimeBelt.groups_valid++;
      }
      // ⟳ LOT C — L'IDENTIFIANT EST LU ICI AUSSI. Une casserole porte l'essentiel
      // de la masse et de l'énergie d'une assiette (`preparationReadyGrams`):
      // n'exiger l'identifiant que sur les plats laisserait le gros du calcul au
      // terme libre, c'est-à-dire au chemin qui a confondu raisin frais et sec.
      const prepReading = readRefSlug(ing.ref, args.composition, composable);
      refTally[prepReading.outcome]++;
      const prepStructured = readStructuredQuantity(
        ing,
        args.composition,
        term,
        prepReading,
      );
      // ⛔ LA MÊME RÉCONCILIATION QUE SUR UN PLAT — 2026-09-13. Les
      // préparations sont 32 % des lignes d'ingrédient de la base, et
      // `finalPlanGate` PLIE la casserole dans le plat qui la cite
      // (`foldedFoods`): ne réparer que les plats aurait laissé un tiers des
      // lignes refuser le plan sur un groupe que leur propre `ref` dément.
      const prepGroupOfLine = reconcileIngredientGroup(
        prepGroup.group,
        referentialGroupOfLine(args.composition, {
          term,
          ref: prepStructured.ref,
          refRefused: prepStructured.refRefused,
        }),
      );
      if (prepGroupOfLine.conflicting) regimeBelt.groups_conflicting++;
      prepIngredients.push({
        term,
        quantity,
        in_pantry: isInPantry(term, args.pantry),
        ...prepStructured,
        group: prepGroupOfLine.group,
        // ⟳ LOT D — le composant culinaire cité par la ligne, transporté tel quel.
        part: readPart(ing),
      });
    }
    if (prepNumeric) {
      if (!rejectedNumeric.includes(prepNumeric)) rejectedNumeric.push(prepNumeric);
      issues.push(`preparations[${i}]: numeric target in an ingredient -- dropped`);
      continue;
    }
    const cookOnRaw = cleanText(prep.cook_on).toLowerCase();
    preparations.push({
      id,
      title,
      servingsMade: Math.min(21, Math.round(made)),
      ingredients: prepIngredients,
      method,
      activeMinutes: readMinutes(prep.active_minutes),
      totalMinutes: readMinutes(prep.total_minutes),
      cookOn: DAY_TOKENS.includes(cookOnRaw) ? cookOnRaw : null,
      // ⟳ LOT D — la structure de cuisson déclarée; VALIDÉE plus tard, jamais ici.
      components: readComponents(prep),
    });
  }
  const preparationIds = new Set(preparations.map((p) => p.id));
  /** La préparation de chaque id gardé — la réconciliation et la ceinture la lisent. */
  const preparationById = new Map(preparations.map((p) => [p.id, p]));

  const dishes: GeneratedDish[] = [];
  // ── C7 ② · CE QU'IL FAUT SAVOIR D'UN PLAT GARDÉ POUR LE SACRIFIER JUSTE ──
  //
  // Trois tableaux PARALLÈLES à `dishes`, et pas trois champs sur le plat: la
  // sortie publique (`GeneratedDish`) est écrite en base et lue par les écrans,
  // et y greffer la comptabilité interne du plafond ferait fuiter un rang de
  // sacrifice dans le plan de quelqu'un. Ils bougent ENSEMBLE, toujours: un
  // `splice` qui en oublie un décale les rangs sur tout le reste de la liste.
  /** La case `jour/moment` du plat gardé, `null` quand il n'en a pas. */
  const keptCells: (string | null)[] = [];
  /** Son rang de sacrifice — voir `dishRank`. */
  const keptRanks: number[] = [];
  /** Son index dans la sortie BRUTE: la réconciliation des courses le lit. */
  const keptRawIndex: number[] = [];
  /**
   * LOT 2 — CE QUE SON `same_day` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ QUATRIÈME TABLEAU PARALLÈLE, et pour la raison exacte des trois autres:
   * il faut que le compteur `same_day` compte sur LA MÊME POPULATION que
   * `dishes` — les plats finalement gardés. Un compteur incrémenté au fil de la
   * boucle continuerait de porter le refus d'un plat que le plafond a évincé
   * trois plats plus loin: `declared` (calculé sur la sortie) et `invalid`
   * (accumulé) compteraient alors deux populations différentes. Ce dépôt a payé
   * exactement ça sur `withheld`/`over_cap`, gonflé et dégonflé en sens
   * inverses.
   */
  const keptSameDayFaults: Array<{ invalid: boolean; minutesMissing: boolean }> = [];
  /**
   * LOT 3C — CE QUE SON `for_member_id` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ CINQUIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les quatre
   * autres, pour la même raison: « déclaré » et « attribué » doivent décrire les
   * MÊMES lignes que `dishes`, sinon le compteur ment sur la seule question
   * qu'on lui pose.
   */
  const keptOwnerFacts: Array<{ declared: boolean; refused: boolean }> = [];
  /**
   * LES BOUCHES QUE LEUR LIGNE DÉCLARÉE TIENT HORS DU REPAS GARDÉ.
   *
   * ⚠️ SIXIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les cinq
   * autres, pour la raison qu'ils portent tous: le compteur doit décrire LES
   * MÊMES LIGNES que `dishes`. Un plat évincé par le plafond emporterait sinon
   * ses retraits dans le dénominateur d'une case qu'il ne remplit plus.
   *
   * ⛔ IL SORT `mouths_unboxed` DE SON DÉNOMINATEUR, et c'est la raison d'être du
   * tableau: une bouche que le RÉGIME tient hors d'un repas n'est pas « une
   * personne debout devant le frigo sans rien qui dise combien » — c'est le
   * produit qui vient de faire son travail. La compter ferait grossir le défaut
   * exactement quand la ceinture protège le mieux.
   */
  const keptBoxHeldOff: BoxHeldOff[][] = [];
  /**
   * L7 ③ — CE QUE SON `name` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ SEPTIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les six
   * autres, pour la raison qu'ils portent tous: « déclaré » et « refusé »
   * doivent décrire LES MÊMES LIGNES que `dishes`. Un plat évincé par le
   * plafond emporterait sinon son refus dans un numérateur dont le
   * dénominateur ne le compte plus — « un compteur dont le numérateur et le
   * dénominateur ne comptent pas les mêmes lignes est un compteur qui ment ».
   */
  const keptNameFacts: Array<{ declared: boolean; refused: boolean }> = [];

  // ── LES CASES QUE LA CONSIGNE DE FUSION RÉCLAME POUR ELLE ───────────────
  // Vide hors fusion et au barreau ①, et c'est ce qui rend cette couche
  // silencieuse partout ailleurs: sans case réclamée, aucun second plat n'est
  // protégé, et le plafond se comporte comme avant ce lot.
  const dedicatedCells = new Set(
    (args.merge === null ? [] : args.merge.dedicatedCells).map((c) =>
      `${c.day}/${c.slot}`
    ),
  );

  /**
   * ⟳ 2026-09-14 · BÊTA 1A ② — LES BOUCHES QUE **CETTE CASE-CI** ATTEND.
   *
   * Une entrée par case réclamée. `null` dans l'ensemble = « la grille ouvre
   * la place sans nommer personne » (chemin de fusion), et alors la case
   * accepte n'importe quel porteur de la liste fermée, comme avant ce lot.
   */
  const dedicatedOwnersAt = new Map<string, Set<string | null>>();
  for (const c of (args.merge === null ? [] : args.merge.dedicatedCells)) {
    const key = `${c.day}/${c.slot}`;
    const set = dedicatedOwnersAt.get(key) ?? new Set<string | null>();
    set.add(c.memberId);
    dedicatedOwnersAt.set(key, set);
  }

  /**
   * CE PORTEUR EST-IL ATTENDU SUR CETTE CASE ?
   *
   * ⛔ TROIS RÉPONSES, ET LA TROISIÈME EST CELLE QUI FERME LE POINT 6. Une
   * case que la grille ne réclame pas n'attend personne: un plat qui s'y
   * adresse à quelqu'un n'est pas un plat dédié, c'est un plat de plus. Une
   * case réclamée « pour personne en particulier » (fusion) accepte le seul
   * porteur que la consigne nomme. Une case réclamée POUR DES BOUCHES nommées
   * n'accepte qu'elles.
   */
  const ownerExpectedAt = (cell: string | null, owner: string): boolean => {
    // ⚠️ UN PLAT SANS CASE N'EST PAS LE SUJET DE CE LOT, et sa lecture ne
    // bouge pas d'un octet: il ne nourrit personne de toute façon
    // (`mouthsFedByDish` ignore un plat sans jour ni moment), et le faire
    // basculer en plat de table ici ne ferait que déplacer un compteur.
    if (cell === null) return true;
    const owners = dedicatedOwnersAt.get(cell);
    if (owners === undefined) return false;
    return owners.has(null) || owners.has(owner);
  };

  /**
   * COMBIEN DE PLATS DÉDIÉS CETTE BOUCHE A DÉJÀ, parmi les plats GARDÉS.
   *
   * ⚠️ LU SUR `dishes`, jamais accumulé au fil de la boucle: un compteur
   * incrémenté continuerait de porter le plat qu'un `splice` vient de retirer,
   * et l'équité se calculerait sur une table qui n'existe plus.
   */
  const dedicatedTally = (owner: string | null): number => {
    if (owner === null) return 0;
    let n = 0;
    for (const kept of dishes) if (kept.memberId === owner) n++;
    return n;
  };

  /** Le plus petit nombre de plats dédiés qu'une bouche porteuse ait à cet instant. */
  const leastServedTally = (): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const id of dishBearers) {
      const n = dedicatedTally(id);
      if (n < min) min = n;
    }
    return Number.isFinite(min) ? min : 0;
  };

  /**
   * LE RANG DE SACRIFICE — plus il est grand, plus le plat est jetable.
   *
   * ⚠️ C'EST LA DÉCISION DE PRODUIT QUE L4 AVAIT LAISSÉE OUVERTE (« réparer
   * vraiment demanderait de choisir quel plat sacrifier »). Le critère
   * n'invente rien: un plat AU-DELÀ de ce que la consigne réclame est le
   * surplus; un plat qui remplit une case attendue ne l'est pas.
   *
   *   `0` — le premier plat d'une case: l'assiette de la table. Jamais
   *         sacrifié tant qu'un surplus existe.
   *   `1` — le second plat d'une case où un porteur mange: le plat dédié que la
   *         consigne demande, un par repas.
   *   `2` — tout le reste: un troisième plat dans une case, un second plat
   *         dans une case où personne d'autre ne mange, un plat sans moment.
   *
   * La grille du foyer n'est PAS relue ici, et c'est voulu: les moments
   * écartés, les créneaux déjà pris, les jours de restes et les plats sans jour
   * sont tombés PLUS HAUT, chacun avec son motif. Ce qui arrive jusqu'ici a
   * déjà une case légitime.
   *
   * ══ LOT B ③ · LE CRÉNEAU PROTÉGÉ VA AU MOINS SERVI, PAS AU PREMIER ÉCRIT ══
   *
   * ⛔ LE DÉFAUT, MESURÉ ET DÉTERMINISTE. Le rang `1` — le créneau protégé
   * d'une case — était donné au SECOND plat ÉCRIT, quel qu'en soit le porteur.
   * Or le modèle écrit les bouches dans l'ordre du roster, à chaque case: le
   * porteur nommé en premier prenait donc le créneau protégé de TOUTES les
   * cases, et les autres tombaient au rang `2`, c'est-à-dire dans le sac où le
   * plafond puise. Archivé quatre fois de suite (trois runs + un plan
   * orphelin): `dish_owners {asked: 6, declared: 2, attributed: 2}` — six plats
   * promis, deux livrés, et TOUJOURS à la même personne (2 · 2 · 2 pour l'une,
   * 0 · 0 · 0 pour les deux autres). Sur sept jours: 11 plats jetés.
   *
   * ⛔ CE QUI CHANGE: à porteur connu, le rang `1` n'est accordé que si ce
   * porteur est parmi les MOINS servis de la table. Celui qui a déjà son plat
   * repasse au rang `2` tant qu'une autre bouche n'a rien — le créneau protégé
   * TOURNE, case après case, au lieu de revenir au même nom.
   *
   * ⚠️ PORTEUR INCONNU ⇒ RANG `1`, COMME AVANT, ET C'EST DÉLIBÉRÉ. Quand le
   * modèle n'a déclaré aucun `for_member_id` — le cas le plus fréquent — il n'y
   * a rien à répartir, et rendre `2` retirerait un second plat qui survit
   * aujourd'hui. La population dont le plan change est exactement celle où
   * l'attribution est LISIBLE, à l'octet près pour toutes les autres.
   *
   * ⚠️ CETTE MOITIÉ A ÉTÉ RETIRÉE PUIS REMISE, ET L'HISTOIRE VAUT D'ÊTRE LUE.
   * La mutation qui la désarme (`return 1` inconditionnel) n'a fait tomber
   * AUCUN test sur le décor SYNTHÉTIQUE du banc — la porte d'équité de
   * `sacrificeFor` y rééquilibrait seule — et elle a donc été supprimée au nom
   * de « une branche qu'aucun test ne distingue est une branche qui ment ».
   * Rejouée sur les SORTIES DE MODÈLE ARCHIVÉES (2 cases × [1 plat de table +
   * 1 plat par porteur], plafond 4), la MÊME mutation rend exactement le défaut
   * mesuré: `2 · 0 · 0`. **C'était le décor du banc qui était trop étroit, pas
   * la branche qui était inutile.** Un banc sur le décor archivé a été ajouté
   * le même jour, et c'est lui qui la tient.
   *
   * ⛔ CE N'EST PAS LE BUDGET DE PLATS. Le plafond (`dishBudgetFor`,
   * `mergeDishBonus`) n'est pas touché d'un chiffre: on ne discute pas ici du
   * nombre de places, seulement de qui s'assied.
   */
  const dishRank = (cell: string | null, owner: string | null): number => {
    if (cell === null) return 2;
    let taken = 0;
    for (const kept of keptCells) if (kept === cell) taken++;
    if (taken === 0) return 0;
    if (taken !== 1 || !dedicatedCells.has(cell)) return 2;
    if (owner === null) return 1;
    return dedicatedTally(owner) <= leastServedTally() ? 1 : 2;
  };

  /**
   * Le plat gardé le PLUS jetable, à condition qu'il le soit plus que celui qui
   * arrive. `-1` quand aucun ne l'est — et alors c'est l'arrivant qui tombe,
   * avec le motif d'avant ce lot, mot pour mot.
   *
   * ══ LOT B ③ · DEUX CHANGEMENTS, ET UN SEUL EST UNE OUVERTURE ════════════
   *
   * ① QUI EST ÉLIGIBLE. Avant, il fallait un rang STRICTEMENT plus grand:
   *    `keptRanks[p] <= rank ⇒ continue`. Conséquence mesurée: un plat dédié
   *    de rang 2 qui arrive ne pouvait JAMAIS prendre la place d'un autre plat
   *    de rang 2 — donc, sous plafond, le porteur écrit en dernier tombait
   *    quoi qu'il arrive, même quand celui écrit en premier en gardait quatre.
   *    Le rang égal devient éligible, mais sous UNE condition, et elle est
   *    étroite: les DEUX plats ont un porteur, et l'arrivant est
   *    **strictement** moins servi que le gardé. C'est-à-dire qu'un plat ne
   *    change de main que si l'échange RÉDUIT l'écart entre deux bouches.
   *    ⛔ Un plat SANS porteur ne peut ni prendre ni céder une place à rang
   *    égal: sans cette double condition, la première assiette d'une case
   *    pourrait chasser celle d'une autre case, et la grille se creuserait.
   *
   * ② QUI TOMBE, PARMI LES ÉLIGIBLES. Le rang décide toujours en premier (la
   *    couverture des créneaux passe avant tout). Ce qui départage à
   *    l'intérieur d'un rang, dans l'ordre:
   *      · le plat que PERSONNE ne réclame (`memberId === null`) tombe avant
   *        celui qui est promis à quelqu'un;
   *      · puis le porteur qui a DÉJÀ le plus de plats dédiés. Sans ce cran,
   *        une bouche perdait son unique plat pendant qu'une autre en gardait
   *        deux — le défaut exact que ce lot ferme, vu de l'autre bout;
   *      · puis le PLUS TARD écrit, qui est le départage d'avant ce lot. Il
   *        n'a pas disparu: il est descendu d'un cran.
   *
   * ⚠️ QUAND AUCUN PLAT GARDÉ NE PORTE DE `memberId` — le cas le plus fréquent —
   * ① ne s'ouvre jamais et ② est neutre: le choix est EXACTEMENT celui d'avant
   * ce lot, à l'octet.
   *
   * ⚠️ ÇA TERMINE, ET C'EST VÉRIFIABLE: chaque échange à rang égal transfère
   * une place d'un porteur STRICTEMENT plus servi vers un porteur strictement
   * moins servi, donc l'écart total ne peut que décroître, et un plat arrivant
   * n'évince au plus qu'une fois.
   */
  const sacrificeFor = (rank: number, owner: string | null): number => {
    const ownerTally = dedicatedTally(owner);
    let victim = -1;
    for (let p = 0; p < keptRanks.length; p++) {
      if (keptRanks[p] < rank) continue;
      const here = dishes[p]?.memberId ?? null;
      if (keptRanks[p] === rank) {
        // ── LA SEULE PORTE DU RANG ÉGAL, ET ELLE EST UNE PORTE D'ÉQUITÉ ──
        if (owner === null || here === null) continue;
        if (ownerTally >= dedicatedTally(here)) continue;
      }
      if (victim === -1) {
        victim = p;
        continue;
      }
      if (keptRanks[p] > keptRanks[victim]) {
        victim = p;
        continue;
      }
      if (keptRanks[p] < keptRanks[victim]) continue;
      // ── À RANG ÉGAL ──────────────────────────────────────────────────
      const best = dishes[victim]?.memberId ?? null;
      if (here === null && best !== null) {
        victim = p;
        continue;
      }
      if (here !== null && best === null) continue;
      const hereTally = dedicatedTally(here);
      const bestTally = dedicatedTally(best);
      if (hereTally > bestTally) {
        victim = p;
        continue;
      }
      if (hereTally < bestTally) continue;
      // À porteur aussi servi l'un que l'autre: le plus tard écrit.
      victim = p;
    }
    return victim;
  };

  // ── LES SESSIONS DE CUISINE ─────────────────────────────────────────────
  // Une session qui ne fait AUCUNE préparation connue est jetée: elle
  // annoncerait un dimanche de cuisine sans rien à cuisiner.
  // ⚠️ ELLES ÉTAIENT PARSÉES *APRÈS* LES PLATS, ET LE LOT `L0-a` A DÛ LES
  // REMONTER. Le jour de cuisson d'une préparation ne vient PAS de son
  // `cook_on` — il vient de la SESSION, back-fillé quelques lignes plus bas.
  // Tant que ce bloc vivait sous la boucle des plats, `prep.cookOn` y valait
  // `null` la plupart du temps, et une garde de conservation posée dans la
  // boucle n'aurait RIEN vu: elle serait passée verte sur le cas mesuré, ce
  // qui est exactement le genre de garde désarmée que ce dépôt paie en boucle.
  // Le bloc ne dépend que de `root`, `preparations` et `preparationIds`, tous
  // trois déjà résolus ici; seul l'ORDRE des lignes d'`issues` change.
  const cookingSessions: CookingSession[] = [];
  for (
    const [i, entry] of (Array.isArray(root.cooking_sessions) ? root.cooking_sessions : [])
      .entries()
  ) {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const dayRaw = cleanText(raw.day).toLowerCase();
    if (!DAY_TOKENS.includes(dayRaw)) {
      issues.push(`cooking_sessions[${i}]: unknown day, dropped`);
      continue;
    }
    const ids = (Array.isArray(raw.preparation_ids) ? raw.preparation_ids : [])
      .map((v) => cleanText(v))
      .filter((v) => preparationIds.has(v));
    if (ids.length === 0) {
      issues.push(`cooking_sessions[${i}]: no known preparation, dropped`);
      continue;
    }
    const runThrough = cleanText(raw.run_through);
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE DÉROULÉ PORTAIT DES GRAMMES, ET ILS NE NOMMAIENT RIEN.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── LE FAIT, LU À L'ÉCRAN LE 2026-08-19 ─────────────────────────────
    // « Sortir le plat après 45 minutes, répartir six portions de 450 g et
    // ranger au réfrigérateur », sur un foyer de DEUX. Ni le nombre de
    // portions ni le grammage ne correspondaient aux boîtes, et la phrase ne
    // disait pas de QUOI étaient ces 450 g. Ses mots: « il dit de faire des
    // barquettes de 450 grammes mais on sait pas à quoi ça correspond ».
    //
    // ── POURQUOI ON COMPTE AU LIEU DE COUPER ────────────────────────────
    // Le déroulé est la seule chose qui dise l'ORDRE des gestes entre deux
    // casseroles. Jeter la session (ce que fait `findNumericTarget` juste en
    // dessous, pour une cible chiffrée de corps) coûterait cet ordre-là pour
    // une faute de rédaction. Et RÉÉCRIRE la prose du modèle serait un
    // matcher maison sur du texte libre — « laitue » ≠ « lait », 12 faux
    // positifs sur 12 mesurés ici.
    //
    // ⚠️ SANS CE COMPTEUR, LA CONSIGNE SERAIT INVÉRIFIABLE. « Le modèle a
    // obéi » et « on n'a rien mesuré » rendent le même silence — c'est la
    // cicatrice `model-declared-fields-need-a-counter`, et elle a déjà servi
    // deux fois dans ce même fichier (`model_quantity`, `model_size_word`).
    if (portionCarriesAQuantity(runThrough)) {
      runThroughQuantity++;
      issues.push(
        `cooking_sessions[${i}]: run_through carries a weight or a portion ` +
          `count -- the boxes hold those, kept as written`,
      );
    }
    const numeric = findNumericTarget(runThrough);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`cooking_sessions[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    cookingSessions.push({
      day: dayRaw,
      preparationIds: ids,
      runThrough,
      totalMinutes: readMinutes((raw as Record<string, unknown>).total_minutes),
    });
  }

  // ⚠️ LE COMPTEUR SORT AVEC SA POPULATION, JAMAIS SEUL. « 3 déroulés
  // chiffrés » ne veut rien dire: sur trois sessions c'est un échec total, sur
  // quarante c'est du bruit. Ce dépôt a déjà écrit deux fois qu'un compteur
  // sans dénominateur est un compteur qui ment.
  if (runThroughQuantity > 0) {
    issues.push(
      `cooking_sessions: ${runThroughQuantity}/${cookingSessions.length} ` +
        `run_through carry a weight or a portion count`,
    );
  }

  // LE JOUR DE CUISSON VIENT DE LA SESSION, pas de la préparation. Le modèle
  // remplit `cook_on` de façon inégale; la session, elle, EST le moment. Quand
  // les deux se contredisent, la session gagne — c'est elle que l'élève lit.
  for (const session of cookingSessions) {
    for (const id of session.preparationIds) {
      const prep = preparations.find((p) => p.id === id);
      if (prep) prep.cookOn = session.day;
    }
  }

  const rawDishes = Array.isArray(root.dishes) ? root.dishes : [];
  // ⟳ 2026-09-05 — CE QUE LE PLAN CITE, LU UNE FOIS SUR LE BRUT: sert à la
  // réparation de citation (une casserole qu'AUCUNE boîte d'AUCUN plat ne
  // cite est celle que le modèle a cuite pour quelqu'un sans la lui donner).
  // ⚠️ LES BOÎTES SEULEMENT, pas `uses`: un plan bien formé liste dans `uses`
  // toutes ses casseroles, y compris celle qu'aucune boîte ne sert. C'est la
  // citation par une BOÎTE qui dit « quelqu'un mange ça ».
  const citedAnywhereRaw = new Set<string>();
  for (const rd of rawDishes) {
    const d = (rd && typeof rd === "object" ? rd : {}) as Record<string, unknown>;
    for (const b of (Array.isArray(d.boxes) ? d.boxes : [])) {
      const bb = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      for (const it of (Array.isArray(bb.items) ? bb.items : [])) {
        const ii = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const id = cleanText(ii.preparation_id) || cleanText(ii.preparationId);
        if (id) citedAnywhereRaw.add(id);
      }
    }
  }
  // ═════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A ② — COMBIEN DE PLATS **SANS ADRESSE** PAR CASE,
  //                LU AVANT LA BOUCLE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA DÉCISION D'AVANT NE REGARDAIT QUE LE PASSÉ, DONC ELLE DÉPENDAIT DE
  // L'ORDRE D'ÉCRITURE DU MODÈLE. « Ce plat porte une adresse refusée, et la
  // case porte DÉJÀ le plat de la table ⇒ on le laisse tomber » est juste
  // quand le modèle écrit la table en premier — les treize réponses archivées
  // le font, et c'est ce qui a masqué la moitié manquante. Écrite dans
  // l'autre sens (le plat adressé d'abord), la même réponse rendait le plat
  // refusé PREMIER plat de table, puis le vrai plat de table devenait le
  // second: `mouth_unfed / double`, 422, plan entier perdu. Le plan de bêta
  // l'exige en toutes lettres: « l'ordre table → dédié ou dédié → table doit
  // produire le même résultat fonctionnel ».
  //
  // ⚠️ CE COMPTE EST FAIT SUR LE BRUT, ET C'EST LE POINT. Il dit « cette case
  // a un plat sans adresse quelque part dans la réponse », pas « elle en a
  // déjà gardé un ». Les deux lectures ne diffèrent QUE par l'ordre.
  //
  // ⚠️ LA RÈGLE DE CASE EST CELLE DE LA BOUCLE, MOT POUR MOT (`slot` valide,
  // `day` valide ou `any`). Une seconde écriture de cette clé ferait deux
  // grilles, et ce fichier a déjà payé ça trois fois.
  const bareDishesPerCell = new Map<string, number>();
  for (const rd of rawDishes) {
    const d = (rd && typeof rd === "object" ? rd : {}) as Record<string, unknown>;
    if (cleanText(d.title) === "") continue;
    if (cleanText(d.for_member_id) !== "") continue;
    const slotRaw = cleanText(d.slot).toLowerCase();
    if (!(MEAL_SLOTS as readonly string[]).includes(slotRaw)) continue;
    const dayRaw = cleanText(d.day).toLowerCase();
    const key = `${DAY_TOKENS.includes(dayRaw) ? dayRaw : "any"}/${slotRaw}`;
    bareDishesPerCell.set(key, (bareDishesPerCell.get(key) ?? 0) + 1);
  }

  for (const [i, entry] of rawDishes.entries()) {
    const d = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = cleanText(d.title);
    if (!title) {
      issues.push(`dishes[${i}]: empty title, dropped`);
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // L7 ③ — LE NOM D'USAGE, DÉCLARÉ PAR LE MODÈLE, JAMAIS DÉDUIT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN NOM REFUSÉ NE REJETTE JAMAIS LE PLAT. Posture `for_member_id` /
    // `same_day` / `box_id`, quatrième fois: c'est une lecture EN PLUS, et un
    // plat sans elle reste un plat qui se cuisine et se mange — l'écran
    // retombe sur le `title`, c'est-à-dire sur le produit d'avant ce lot.
    //
    // ⚠️ TROIS FAITS, ET ILS SE COMPTENT SÉPARÉMENT. « Le modèle n'a rien
    // écrit » et « il a écrit quelque chose qu'on a refusé » appellent des
    // corrections OPPOSÉES — resserrer la consigne d'un côté, desserrer la
    // règle de l'autre — et le 2026-08-17 ce dépôt a payé un diagnostic entier
    // pour les avoir confondus derrière un seul zéro.
    //
    // LES DEUX SEULES RAISONS DE REFUS, ET AUCUNE N'EST UN JUGEMENT DE GOÛT:
    //   ① plus long que `DISH_NAME_MAX_CHARS` — ce n'est plus un nom, c'est un
    //      second titre, et il ne tiendrait pas dans une case de grille;
    //   ② identique au titre — l'écran rendrait deux fois la même chaîne, l'une
    //      au-dessus de l'autre. La comparaison est une ÉGALITÉ de chaîne
    //      normalisée (casse et espaces), jamais une ressemblance: un matcher
    //      sur ce champ est exactement ce que l'en-tête de `name` interdit.
    //
    // Une clé absente, ou présente et vide, n'est NI déclarée NI refusée — même
    // discipline que `same_day`, où un plat sans clé du tout ne compte dans
    // aucun des deux.
    const nameRaw = cleanText(d.name);
    let name: string | null = null;
    let nameDeclared = false;
    let nameRefused = false;
    if (nameRaw) {
      nameDeclared = true;
      if (nameRaw.length > DISH_NAME_MAX_CHARS) {
        nameRefused = true;
        issues.push(
          `dishes[${i}]: name is ${nameRaw.length} characters, over the ` +
            `${DISH_NAME_MAX_CHARS} a name fits in -- dropped, the title is shown instead`,
        );
      } else if (
        nameRaw.toLowerCase().replace(/\s+/g, " ") ===
          title.toLowerCase().replace(/\s+/g, " ")
      ) {
        nameRefused = true;
        issues.push(
          `dishes[${i}]: name repeats the title (${JSON.stringify(title)}) -- ` +
            `dropped, one line is enough`,
        );
      } else {
        name = nameRaw;
      }
    }

    // ── LE JOUR ET LE CRÉNEAU, RÉSOLUS AVANT LE PLAFOND ──────────────────
    // L'ordre compte: un plat posé sur un moment ÉCARTÉ ne doit pas consommer
    // une place du plafond. Le laisser passer la garde du plafond avant de le
    // rejeter ferait tomber, en fin de liste, des plats parfaitement valides —
    // et l'élève verrait un jour vide sans savoir pourquoi.
    const slotRaw = cleanText(d.slot).toLowerCase();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`dishes[${i}]: unknown slot ${JSON.stringify(slotRaw)}, dropped`);

    const dayRaw = cleanText(d.day).toLowerCase();
    const day = DAY_TOKENS.includes(dayRaw) ? dayRaw : null;
    if (dayRaw && !day) {
      issues.push(`dishes[${i}]: unknown day token ${JSON.stringify(dayRaw)}, dropped`);
    }

    // ── UN PLAT SANS JOUR N'A PAS DE CASE, ET ÇA SE DIT ──────────────────
    //
    // ⚠️ L'ASYMÉTRIE QUE CE BLOC FERME. Un jeton de jour INCONNU était nommé
    // (juste au-dessus); un jour ABSENT ne l'était pas. Les deux produisent
    // pourtant la même chose — un plat que la grille ne sait poser nulle part.
    //
    // MESURÉ LE 2026-08-12, sur une fusion: un plan portait **16 entrées
    // `dishes` pour 3 jours**, dont **7 sans `day` ni `slot`** — « Roast
    // chicken thighs », « Quinoa », « Cooked rice »… c'est-à-dire LES MÊMES
    // SEPT TITRES que `preparations`. Le modèle avait rendu ses préparations
    // une seconde fois sous forme de plats, le budget relevé par la fusion
    // (`dishBudgetFor`) avait laissé la place, et `issues` ne disait RIEN.
    // Compté sur les autres plans du même run: **0 entrée sans jour sur 14-15**.
    // Le cas n'apparaît qu'avec le budget de fusion.
    //
    // ⚠️ POURQUOI JETER, ET PAS SEULEMENT COMPTER. Sur une fenêtre de plusieurs
    // jours, ce plat n'est ni affichable dans la grille, ni cochable, ni
    // rapprochable d'une photo: il occupe une place du plafond — donc il coûte
    // un VRAI repas de la fin de fenêtre, exactement comme le dîner du dimanche
    // que le débordement a fait tomber le 2026-08-12 — et il gonfle la liste de
    // courses de ce que la préparation achète déjà.
    //
    // ⚠️ SUR UNE FENÊTRE D'UN SEUL JOUR, ON GARDE. Il n'y a alors qu'un jour:
    // le plat est situé sans ambiguïté, et `windowSplit` le range déjà dans la
    // fenêtre. Jeter là serait retirer un repas à quelqu'un pour une clé
    // absente d'un plan qui n'en a pas besoin.
    if (!day && args.scope === "several_days") {
      issues.push(
        `dishes[${i}]: no day token on a multi-day window -- dropped ` +
          `(${JSON.stringify(title)})`,
      );
      continue;
    }

    // ── LE MOMENT ÉCARTÉ MORD ICI, PAS SEULEMENT DANS LA CONSIGNE ────────
    // Une contrainte qui n'existe que dans le prompt n'est pas une garantie:
    // un modèle de composition COMPLÈTE ce qu'on lui donne, c'est son métier.
    // Même posture que le plafond de plats et que le refus des chiffres.
    if (isAway(args.awayDays, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day}/${slot ?? "any"} is a moment they are away -- dropped`,
      );
      continue;
    }

    // ── FF-051 · LE CRÉNEAU DÉJÀ PRIS ───────────────────────────────────
    // Même posture que l'absence juste au-dessus, et même raison: la consigne
    // le dit, le parseur le tient. Seuls les apports REMPLAÇANTS occupent
    // (A5) — un café au lait au petit-déjeuner nomme un moment sans le
    // prendre.
    if (slotIsTaken(args.fixedIntakes, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day ?? "any"}/${slot} is already taken by a fixed intake -- dropped`,
      );
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // « JE CUISINE LA VEILLE » — RIEN NE SE MANGE CE JOUR-LÀ.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN REFUS, ET IL EST DANS LA BOUCLE. La consigne dit deux fois de ne
    // rien écrire ce jour-là (la liste des jours l'exclut, une phrase le
    // nomme); si un plat y atterrit quand même, l'afficher trahirait la
    // demande — la personne a dit « ce jour-là je cuisine, je ne mange pas
    // encore ce plan ». Refuser ICI plutôt qu'en queue de fonction évite qu'il
    // ait consommé le plafond et compté ses `honours_belief_keys` avant qu'on
    // ne le retire, exactement comme la fenêtre du cuit juste en dessous.
    //
    // ⚠️ COMPTÉ, pas silencieux: si la consigne ne mord pas, c'est le PROMPT
    // qu'il faut corriger, pas le parseur — et sans ce chiffre on ne saurait
    // pas lequel des deux.
    if (args.cookOnlyDay !== null && day === args.cookOnlyDay) {
      issues.push(
        `dishes[${i}]: ${day} is the cooking day before the plan -- nothing ` +
          `is eaten on it, the dish was dropped`,
      );
      continue;
    }

    // ── FF-052 · UN JOUR DE RESTES NE COMPOSE RIEN DE NEUF ──────────────
    // Un plat qui PUISE dans une préparation reste — c'est exactement ce
    // qu'on mange un jour de restes. Un plat qui part de zéro tombe: l'élève
    // a déclaré qu'il finirait ce qui existe, et le lui composer par-dessus
    // fait jeter la moitié de son lot.
    //
    // Le `uses` est lu PLUS BAS, mais il est déjà lisible ici sur la sortie
    // brute: le vérifier après coûterait un plat construit puis jeté, et
    // surtout un `honours_belief_keys` déjà compté.
    const usesSomething = Array.isArray(d.uses) && d.uses.length > 0;
    if (!usesSomething && dayHasProperty(args.dayProperties, day, "leftovers")) {
      issues.push(
        `dishes[${i}]: ${day} is a leftovers day -- a dish with no \`uses\` was dropped`,
      );
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L0-a` · LA FENÊTRE DU CUIT — UN REFUS, PLUS UN CONSTAT
    // ══════════════════════════════════════════════════════════════════════
    //
    // MESURÉ sur de vrais plans: des légumes rôtis cuisinés le jeudi et mangés
    // le mercredi suivant — J+6. Des boulettes à J+5, du couscous à J+5. Et
    // **29 violations sur 14 plans** encore lisibles dans `generated_from.issues`
    // le 2026-08-22.
    //
    // ── CE QUI A CHANGÉ, ET POURQUOI ───────────────────────────────────────
    // Cette règle SIGNALAIT. Le commentaire d'alors disait: « raccourcir la
    // portée retirerait un repas à l'élève, et déplacer la cuisson inventerait
    // un jour qu'il n'a pas déclaré ». Les deux moitiés restent vraies — et
    // c'est pour ça qu'on ne fait ni l'un ni l'autre. **On JETTE le plat**,
    // exactement comme un plat posé un jour d'absence ou sur un créneau déjà
    // pris. La troisième voie qu'on refuse, c'est de le SERVIR quand même.
    //
    // ⛔ C'EST UNE PORTE DE SÉCURITÉ, DONC FAIL-CLOSED. Un créneau vide se
    // voit, se comble, et ne rend personne malade. Un lot de quatre jours
    // servi avec l'air d'avoir été voulu, si.
    //
    // ⚠️ ELLE NE S'APPLIQUE QU'AUX OCCASIONS CUISINÉES À L'AVANCE. Un plat qui
    // ne PUISE dans aucune casserole n'entre dans aucune des trois populations:
    // la question ne se pose pas pour lui. Sur cinq jours, cinq des quinze
    // occasions sortent ainsi du problème — les compter donnerait quinze là où
    // dix sont en jeu.
    //
    // Le `uses` est lu sur la sortie BRUTE, ici et pas plus bas, pour la même
    // raison que le jour de restes juste au-dessus: un plat construit puis jeté
    // aurait consommé le plafond et compté ses `honours_belief_keys`.
    if (day) {
      const eatAt = posOf(day);
      let tooLate: { title: string; cookOn: string; gap: number } | null = null;
      for (const rawUse of (Array.isArray(d.uses) ? d.uses : [])) {
        const u = (rawUse && typeof rawUse === "object" ? rawUse : {}) as Record<string, unknown>;
        const prepId = cleanText(u.preparation_id);
        if (!prepId) continue;
        const prep = preparations.find((p) => p.id === prepId);
        if (!prep) continue;
        // ⛔ LA TROISIÈME POPULATION, ET C'EST ELLE QUI ÉTAIT MUETTE. Une
        // casserole SANS JOUR DE CUISSON — ni `cook_on`, ni session qui la
        // nomme — était silencieusement sautée: la fenêtre ne tournait pas, et
        // le plan sortait avec l'air d'avoir été vérifié. C'est très
        // exactement « la fenêtre n'a pas tourné » contre « la fenêtre a tourné
        // et rien n'a mordu », les deux rendant `violations: 0`.
        //
        // ⚠️ ON NE JETTE PAS LE PLAT POUR AUTANT. Un jour de cuisson manquant
        // est une faute de rédaction du modèle, pas une preuve que le lot est
        // vieux; refuser dessus retirerait un repas sur une ignorance. On
        // COMPTE, et le seuil est zéro.
        const cookAt = prep.cookOn ? posOf(prep.cookOn) : -1;
        if (cookAt < 0 || eatAt < 0) {
          fridgeWindow.not_evaluated++;
          continue;
        }
        // ── LA PART CONGELÉE N'A PAS LA FENÊTRE DU FRIGO (2026-09-01) ─────
        // Lu ici, sur la sortie BRUTE, parce que c'est ici que la garde
        // tranche. Le `kept` reconstruit plus bas arriverait après le
        // `continue` qui jette le plat.
        const keptHere = readKept(u.kept);
        freezerClaimLinks++;
        if (freezerClaimedWithoutOne({ kept: keptHere, hasFreezer })) {
          // LE MODÈLE A INVENTÉ UN APPAREIL. On ne relâche rien, et on compte:
          // sans ce nombre, « la consigne mord » et « personne ne l'a lue »
          // rendent le même silence.
          freezerWithoutOne++;
        }
        const verdict = cookedWindowVerdict(
          cookAt,
          eatAt,
          keptWindowDays({
            kept: keptHere,
            hasFreezer,
            maxFridgeDays: MAX_FRIDGE_DAYS,
            // ⟳ 2026-09-25 — LE RIZ N'EST PAS ENCORE JETÉ ICI, ET C'EST ÉCRIT.
            // Phase comptée: la garde finale compte `rice_eaten_too_late` sur
            // une série de tirs; le refus au parseur viendra ensuite, en
            // passant ici `preparationHoldsRice(...)`.
            holdsCookedRice: false,
          }),
        );
        // `before_cooking` appartient à l'AUTRE règle (« un lot mangé avant
        // d'être cuisiné »), qui a son propre message et signale sans jeter.
        // Le compter ici ferait disparaître l'une des deux anomalies.
        if (verdict === "before_cooking") continue;
        if (verdict === "within") {
          fridgeWindow.within++;
          continue;
        }
        fridgeWindow.violations++;
        if (!tooLate) {
          tooLate = { title: prep.title, cookOn: prep.cookOn!, gap: eatAt - cookAt };
        }
      }
      if (tooLate) {
        issues.push(
          `dishes[${i}]: "${tooLate.title}" is cooked on ${tooLate.cookOn} and ` +
            `would still be eaten on ${day} -- ${tooLate.gap} days in the fridge, ` +
            `over the ${MAX_FRIDGE_DAYS}-day limit -- dropped`,
        );
        continue;
      }
    }

    // ── QUAND ÇA DÉBORDE, C'EST LE SURPLUS QUI TOMBE (C7 ②) ─────────────
    //
    // ⚠️ LA DÉCISION QUE L4 AVAIT LAISSÉE OUVERTE EST PRISE ICI. Le parseur
    // gardait les `cap` PREMIERS plats et jetait la queue; or un modèle écrit sa
    // semaine dans l'ordre, donc le plat perdu n'était jamais « celui en trop »,
    // c'était LE DERNIER REPAS DE LA FENÊTRE. Mesuré deux fois: le dîner du
    // dimanche du foyer (L4), puis le déjeuner ET le dîner du dimanche de la
    // personne reprise, tombés d'une réponse de relance à 20 plats écrêtée à 18
    // (C7 ①).
    //
    // ⚠️ LE PLAFOND N'A PAS BOUGÉ, ET C'EST DÉLIBÉRÉ. Sur le décor mesuré il
    // vaut EXACTEMENT ce que la consigne réclame — 9 plats de foyer + 9 plats
    // dédiés = 18 — et une bonne réponse en fait 18. Lui donner de la marge
    // inviterait le modèle à « déborder poliment pour la remplir », ce que
    // `dishCapFor` documente et que ce dépôt a déjà mesuré une fois. C'est
    // l'ORDRE du sacrifice qui était faux, pas le nombre.
    //
    // ⚠️ L'ÉVICTION EST DIFFÉRÉE JUSQU'AU `push`, ET IL LE FAUT. Ce plat peut
    // encore tomber plus bas (une cible chiffrée, un ingrédient en calories):
    // sacrifier ici ferait perdre un plat gardé au profit d'un plat qui ne
    // survivra pas, c'est-à-dire un repas de moins pour rien.
    //
    // ⚠️ LOT B ③ — LE PORTEUR EST LU ICI, ET VALIDÉ ICI, PARCE QUE LE RANG EN
    // DÉPEND. La VALIDATION est la même que celle de LOT C plus bas (les deux
    // portes: la consigne a-t-elle réclamé un plat dédié, et l'id est-il dans
    // la liste fermée) — une seule écriture, deux lecteurs; les REFUS, eux,
    // restent où ils étaient, pour qu'un plat qui tombe plus haut n'ajoute pas
    // une `issue` que le plan d'avant ce lot n'avait pas.
    const declaredFor = cleanText(d.for_member_id);
    const cell = slot ? `${day ?? "any"}/${slot}` : null;
    // ⟳ 2026-09-14 · BÊTA 1A ② — LA TROISIÈME PORTE: **SUR CETTE CASE**.
    // Voir `ownerExpectedAt`. Les deux premières (la consigne a-t-elle réclamé
    // un plat dédié, l'id est-il dans la liste fermée) n'ont pas bougé.
    const ownerOf = declaredFor !== "" && secondDishAsked &&
        dishBearers.has(declaredFor) && ownerExpectedAt(cell, declaredFor)
      ? declaredFor
      : null;

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-14 · UNE ATTRIBUTION REFUSÉE NE DEVIENT PAS UN SECOND PLAT DE
    //                TABLE. Mesuré sur 6 tirs sur 13, tous en 422.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT, ET IL EST L'INVERSE EXACT DE CE QUE LE LOT C PROMETTAIT.
    // « Un `for_member_id` refusé ne rejette jamais le plat » était écrit en
    // toutes lettres, et l'effet réel était: l'attribution tombe, le plat reste
    // — mais la case portait DÉJÀ le plat de la table. Le plat dédié devenait
    // donc un SECOND plat de table, chaque bouche de la case se retrouvait
    // nommée sur deux couvercles (`meals_delivered` compte les couvercles de
    // TOUS les plats de table d'une case, `lids > 1` ⇒ `double`), et la porte
    // finale refusait le plan ENTIER en 422. La phrase disait « jamais une
    // raison de retirer un dîner à quelqu'un »; le résultat mesuré était que
    // PERSONNE n'avait de dîner — 16 refus à N=4, 24 sur un autre tir.
    //
    // ⛔ CE QU'ON RETIRE ICI NE RETIRE LE REPAS DE PERSONNE, et c'est la seule
    // raison pour laquelle ce geste est permis. La case garde son plat de
    // table, donc chaque bouche y mange EXACTEMENT une fois — y compris celle
    // que le modèle voulait servir à part, dont le § 2.2 vient d'établir
    // qu'elle n'a pas besoin d'un plat à elle (sa ligne ne diverge pas de la
    // table, et elle n'a pas déclaré son propre repas). Ce qui disparaît est le
    // DOUBLON, pas un dîner.
    //
    // ⛔ ET LE PLAT TOMBE ICI, AVANT LE PLAFOND, PAS AU BARREAU DES REFUS 900
    // LIGNES PLUS BAS. Là-bas, `sacrifice` a déjà `splice` un plat gardé pour
    // faire de la place à celui-ci: le retirer après aurait coûté un vrai repas
    // pour rien. Sa place est donc entre la lecture du porteur et le rang.
    //
    // ⚠️ LA GARDE A UN CAS QUI PASSE, ET IL EST LE CAS ORDINAIRE. Quand la case
    // ne porte encore AUCUN plat de table, un `for_member_id` refusé laisse le
    // plat devenir ce plat de table — la promesse du lot C, tenue mot pour mot.
    // C'est ce que vérifient les tests « déclaré sur une bouche INCONNUE » et
    // « déclaré au barreau ① », où le plat refusé est le seul de sa case.
    const ownerRefusedHere = declaredFor !== "" && ownerOf === null;
    // ⟳ 2026-09-14 · BÊTA 1A ② — LES DEUX MOITIÉS DE LA MÊME QUESTION:
    // « cette case a-t-elle un plat de table ? ». `keptCells` répond pour ce
    // qui est DÉJÀ gardé, `bareDishesPerCell` pour ce qui reste à venir. La
    // seconde est celle qui manquait, et c'est elle qui rend la décision
    // indépendante de l'ordre d'écriture du modèle.
    const cellHasTableDishKept = cell !== null &&
      keptCells.some((k, p) => k === cell && dishes[p].memberId === null);
    const cellHasBareDishAnywhere = cell !== null &&
      (bareDishesPerCell.get(cell) ?? 0) > 0;
    if (
      ownerRefusedHere && (cellHasTableDishKept || cellHasBareDishAnywhere)
    ) {
      ownerRefusedDropped++;
      const where = cellHasTableDishKept
        ? `${cell} already carries the table's dish`
        : `${cell} carries the table's dish elsewhere in this answer`;
      issues.push(
        !secondDishAsked
          ? `dishes[${i}]: for_member_id on a shared dish (no dedicated dish was ` +
            `asked) and ${where} -- kept, it would ` +
            `be a second table dish and feed everyone there twice, so it is dropped`
          : `dishes[${i}]: for_member_id ${JSON.stringify(declaredFor)} is not a ` +
            `mouth that gets its own dish here, and ${where}` +
            ` -- kept, it would be a second table dish and feed everyone there ` +
            `twice, so it is dropped`,
      );
      continue;
    }

    const rank = dishRank(cell, ownerOf);
    let sacrifice = -1;
    if (dishes.length >= cap) {
      sacrifice = sacrificeFor(rank, ownerOf);
      if (sacrifice === -1) {
        issues.push(`dishes[${i}]: over the ${cap}-dish cap for ${args.scope}, dropped`);
        continue;
      }
    }

    const method = cleanText(d.method);
    const why = cleanText(d.why);

    // ── GARANTIE 1 : PAS DE CIBLE CHIFFRÉE ──────────────────────────────
    // Sur la PROSE uniquement. Les quantités d'ingrédients sont traitées plus
    // bas, avec la règle qui leur convient — les mélanger ici interdirait
    // « 400 g de poulet » et rendrait le générateur incapable d'écrire une
    // recette.
    const numeric = findNumericTarget(`${title} ${method} ${why}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(
        `dishes[${i}]: numeric target (${numeric}) -- rejected, nobody has measured this student`,
      );
      continue;
    }

    // ── FF-061 · LA CULPABILISATION, GARDÉE ICI AUSSI ────────────────────
    //
    // `findGuiltTripping` existait et n'était appliqué qu'au message du soir et
    // à la relance. Le `why` d'un plat est produit par le MÊME modèle, il est
    // affiché à l'élève (`DishCard.tsx`), et il n'était gardé de ce côté par
    // personne — le seul champ de prose libre du plan sans ceinture de ton.
    //
    // ── ON EFFACE LA PHRASE, ON NE JETTE PAS LE PLAT ─────────────────────
    // Le plat est bon; c'est sa justification qui dérape. Le rejeter ferait
    // perdre un dîner pour une tournure, et un générateur qui retire des repas
    // pour un mot est un générateur qu'on désarme. Même geste que
    // `household_restriction_lock.ts`, qui efface le `why` d'un plat plutôt que
    // le plat.
    //
    // MESURÉ AVANT DE BRANCHER (2026-08-12): 1116 `why` déjà en base,
    // **0 déclenchement**. La garde ne coûte rien aujourd'hui — elle attend le
    // jour où le modèle dérive.
    let safeWhy = why;
    if (why) {
      const guilt = findGuiltTripping(why);
      if (guilt.length > 0) {
        safeWhy = "";
        issues.push(
          `dishes[${i}]: guilt_tripping in why (${
            guilt.map((g) => g.matchedText).join(" | ")
          }) -- sentence dropped, dish kept`,
        );
      }
    }

    // ── LES INGRÉDIENTS, ET LA GARANTIE 2 ───────────────────────────────
    const ingredients: DishIngredient[] = [];
    let numericInIngredients: string | null = null;
    for (const [j, rawIng] of (Array.isArray(d.ingredients) ? d.ingredients : []).entries()) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) {
        issues.push(`dishes[${i}].ingredients[${j}]: empty term, dropped`);
        continue;
      }
      const quantity = cleanText(ing.quantity) || null;
      // Une unité d'énergie dans une quantité est la seule porte qui restait.
      if (quantity && ENERGY_UNIT_RE.test(quantity)) {
        numericInIngredients = "energy_unit_in_quantity";
        break;
      }
      // Un macro chiffré peut aussi se cacher dans le TERME (« 30 g protein »).
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) {
        numericInIngredients = termNumeric;
        break;
      }
      ingredientCount++;
      const declaredGroup = readDeclaredGroup(ing);
      if (declaredGroup.declared) {
        regimeBelt.groups_declared++;
        if (declaredGroup.group === null) regimeBelt.groups_refused++;
        else regimeBelt.groups_valid++;
      }
      const reading = readRefSlug(ing.ref, args.composition, composable);
      refTally[reading.outcome]++;
      const structured = readStructuredQuantity(ing, args.composition, term, reading);
      // ── CE QUI N'A PAS PU ÊTRE PESÉ EST COMPTÉ ────────────────────────
      // Sans ce compteur, un contrat de quantités structurées que le modèle
      // ignore ressemble exactement à un contrat qu'il honore: des grammes
      // absents, et rien pour dire lequel des deux. C'est la mesure du §10 de
      // FF-038, et c'est elle qui dira s'il faut durcir la consigne.
      if (structured.amount === null || structured.unit === null) {
        unstructuredIngredients++;
        unquantifiedTerms.push(term);
        // ── LES DENSES SONT COMPTÉS À PART, ET C'EST TOUT L'ÉCART ──────
        // Une pincée de sel sans grammes ne déplace rien. Un filet d'huile
        // sans grammes retire 120 kcal d'une assiette, en silence, et fait
        // s'abstenir le verdict entier (`unweighedEnergyDense`). Les compter
        // ensemble donnerait un chiffre où « 26 condiments » et « 1 huile »
        // se ressemblent, alors que le second coûte le plan et le premier
        // rien.
        if (args.composition) {
          // ⟳ LOT C — la MÊME référence que celle qui a (ou n'a pas) pesé.
          // Relire par terme libre ici ferait dire « cette huile est dense »
          // à partir d'une ligne que le moteur a refusé de peser.
          const ref = refForIngredient(args.composition, {
            term,
            ref: structured.ref,
            refRefused: structured.refRefused,
          });
          if (ref?.energyDense) unweighedDenseTerms.push(term);
        }
      }
      // ══════════════════════════════════════════════════════════════════
      // ⛔ LE `ref` PRIME SUR LE `group` DÉCLARÉ — 2026-09-13.
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ ICI ET PAS DANS `finalPlanGate`. La garde est PURE et n'a pas le
      // référentiel: la corriger là aurait laissé la LIGNE ÉCRITE fausse —
      // un plan livré dont le yaourt de soja reste rangé au rayon laitier
      // pour tous ses lecteurs ultérieurs. Ce site est le SEUL écrivain de
      // `DishIngredient.group`, donc le groupe corrigé atteint d'un seul
      // geste la ceinture de régime, la garde finale ET le `jsonb` persisté.
      const groupOfLine = reconcileIngredientGroup(
        declaredGroup.group,
        referentialGroupOfLine(args.composition, {
          term,
          ref: structured.ref,
          refRefused: structured.refRefused,
        }),
      );
      if (groupOfLine.conflicting) regimeBelt.groups_conflicting++;
      ingredients.push({
        term,
        quantity,
        // JAMAIS `ing.in_pantry`. Le drapeau du modèle n'est pas une preuve:
        // c'est la même faute que l'accusé « c'est noté » sans ligne en base,
        // et elle se paye ici en disant « tu as tout » à quelqu'un qui n'a pas
        // les œufs, un dimanche soir, magasins fermés.
        in_pantry: isInPantry(term, args.pantry),
        ...structured,
        group: groupOfLine.group,
        // ⟳ LOT D — le composant culinaire cité par la ligne, transporté tel quel.
        part: readPart(ing),
      });
    }
    if (numericInIngredients) {
      // ── C7 ⑤ · LE REPAS LE PLUS FRAGILE D'UNE FUSION EST LE PETIT-DÉJEUNER
      //
      // ⚠️ LE VERROU EST JUSTE ET IL NE BOUGE PAS. Ce qui est écrit ici est un
      // CONSTAT, mesuré, pour que quelqu'un le lise avant de chercher ailleurs:
      // sur quatre fusions réelles, le repas qui tombe est presque toujours le
      // petit-déjeuner, et par DEUX causes distinctes.
      //
      //   · CETTE garde — `whey protein 90 g` (L4/O6), puis `protein pancake
      //     mix` (runs 3 et 4): un aliment dont le NOM porte un macro se lit
      //     comme une cible chiffrée, et le plat entier est rejeté. Le
      //     petit-déjeuner est le seul repas dont le rayon vend des produits
      //     nommés d'après un macro; c'est ce qui le rend fragile, pas la garde.
      //   · la relance d'ancre protéique (run 1), qui ne regarde QUE les repas
      //     principaux et pouvait rendre un plan amputé de ses petits-déjeuners
      //     dédiés — refermé par C7 ①.
      //
      // Rien de tout ça n'est un défaut à réparer ici: la case vide est
      // comptée (C2 ④, `empty_slots`) et nommée au modèle. Ce qui manque est
      // une DÉCISION sur la recomposition d'une case vide, et personne ne l'a
      // prise. Le fait, lui, est maintenant écrit là où on tombera dessus.
      if (!rejectedNumeric.includes(numericInIngredients)) {
        rejectedNumeric.push(numericInIngredients);
      }
      issues.push(
        `dishes[${i}]: numeric target (${numericInIngredients}) in an ingredient -- ` +
          `dish rejected (${day ?? "any"}/${slot ?? "any"})`,
      );
      continue;
    }

    // `honours_belief_keys` est INFORMATIF, donc une clé inventée est jetée et
    // comptée — jamais une raison de rejeter le plat. Le laisser passer
    // afficherait en revanche à l'élève une conviction que son coach n'a pas.
    const honours: string[] = [];
    for (const k of (Array.isArray(d.honours_belief_keys) ? d.honours_belief_keys : [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!allowedKeys.has(key)) {
        issues.push(`dishes[${i}]: honours_belief_keys ${JSON.stringify(key)} is not in the doctrine, dropped`);
        continue;
      }
      if (!honours.includes(key)) honours.push(key);
    }

    // CE QUE LE PLAT PRÉLÈVE. Une référence inconnue est JETÉE et comptée: la
    // garder afficherait « prélève sur la préparation X » quand X n'existe
    // nulle part, et l'élève chercherait une casserole qu'on ne lui a jamais
    // demandé de faire.
    const uses: GeneratedDish["uses"] = [];
    for (const rawUse of (Array.isArray(d.uses) ? d.uses : [])) {
      const u = (rawUse && typeof rawUse === "object" ? rawUse : {}) as Record<string, unknown>;
      const prepId = cleanText(u.preparation_id);
      if (!prepId) continue;
      if (!preparationIds.has(prepId)) {
        issues.push(
          `dishes[${i}].uses: unknown preparation ${JSON.stringify(prepId)}, dropped`,
        );
        continue;
      }
      const servings = Number(u.servings);
      // ── LE DÉNOMINATEUR SE COMPTE ICI, SUR LES PARTS GARDÉES ───────────
      // Après le `continue` des références inconnues: une part qui n'existe
      // pas ne se compte ni au numérateur ni au dénominateur.
      keptTotal++;
      const kept = readKept(u.kept);
      if (kept === "freezer") keptDeclared++;
      uses.push({
        preparationId: prepId,
        servings: Number.isFinite(servings) && servings > 0
          ? Math.min(12, Math.round(servings))
          : 1,
        // ⚠️ LA MÊME LECTURE QUE LA GARDE, par la MÊME fonction. La garde
        // tranche plus haut, sur la sortie brute; si elle lisait un jeton et
        // la ligne écrite un autre, le plan servi contredirait la fenêtre qui
        // l'a laissé passer.
        //
        // ⛔ ET LE JETON EST GARDÉ TEL QUEL, MÊME SANS CONGÉLATEUR. Le rabattre
        // sur `"fridge"` effacerait la trace de ce que le modèle a réclamé —
        // or c'est exactement ce que `freezer_claimed_without_one` compte, et
        // un compteur dont la donnée a été nettoyée en amont ne compte rien.
        kept,
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // LES CONTENANTS DE CE REPAS, DÉCLARÉS ET VALIDÉS FERMÉS (v4, 2026-08-20)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CINQ PORTES, ET AUCUNE NE JETTE LE PLAT. Un contenant est une PRÉCISION
    // en plus; perdre un dîner parce qu'un modèle a écrit « 150 » sous forme de
    // chaîne échangerait le repas contre le confort du parseur. Posture
    // `for_member_id` / `same_day`, cinquième fois.
    //
    //   ① l'`id` existe et n'est pas déjà pris DANS LE PLAN. Deux couvercles du
    //      même nom dans un frigo ne décident rien devant la porte — c'est le
    //      défaut n°3, et il ne se répare pas en aval.
    //   ② chaque nom est une bouche de la LISTE FERMÉE. Un id inconnu est jeté
    //      (pas le contenant entier: un bac amputé d'un nom fantôme reste servi
    //      aux autres). Zéro nom gardé ⇒ le contenant tombe — « un bac pour
    //      personne » n'est pas une instruction, et « sers-toi » se dit par
    //      l'ABSENCE de contenant, jamais par un contenant vide.
    //   ③ un nom UNE SEULE FOIS par couvercle. Deux fois n'ajoute rien et
    //      laisserait croire à deux parts, ce que v4 existe pour supprimer.
    //   ④ chaque `item` porte une étiquette, des grammes ENTIERS et > 0, et un
    //      `preparation_id` qui désigne une casserole DE CE PLAN (ou `null` =
    //      ajouté frais le jour même, hors contrôle de fournée). Zéro item gardé
    //      ⇒ le contenant tombe: un couvercle sans contenu ne se remplit pas.
    //   ⑤ le plat prélève sur au moins une préparation. Rien n'a été pesé
    //      d'avance pour un plat cuisiné de zéro le jour même.
    //
    // ⛔ ET LE PARSEUR NE FABRIQUE PAS LE CONTENANT DE TINO. Retirer « la
    // viande » de ses `items` demande de savoir ce qui est la viande, et surtout
    // de décider si ce qui reste est un repas ou une assiette de riz. C'est une
    // décision de COMPOSITION: elle appartient au modèle, à qui la consigne
    // demande la séparation. Le parseur VALIDE, il n'invente pas.
    //
    // ⚠️ LA CEINTURE DE RÉGIME EST LE FILET, PLUS LE MODÈLE (v4). Elle reste
    // armée — le modèle n'a pas séparé ⇒ on retire la bouche du couvercle — et
    // elle ne touche AUCUN gramme: retirer un nom d'un bac ne redimensionne pas
    // le bac. On REFUSE UNE DÉCLARATION, exactement comme la porte ② refuse un
    // `member_id` qui n'est pas du foyer; on ne réécrit pas la sortie du modèle.
    const boxes: MealBox[] = [];
    /**
     * Les bouches que leur ligne déclarée tient hors de CE repas, AVEC LA
     * CAUSE et le contenant dont le nom a été retiré (2026-09-04).
     *
     * ⛔ LA CAUSE N'EST PAS COSMÉTIQUE. Un régime est une ligne qu'on ne
     * franchit pas; un dégoût est un goût. L'invariant « personne sans repas »
     * ne leur doit pas le même dernier recours, et il ne peut pas le deviner
     * après coup: un nom absent d'un couvercle ne dit pas s'il en a été retiré
     * ni par quoi.
     */
    const boxHeldOff: BoxHeldOff[] = [];
    /** Vrai dès qu'un contenant a été DÉCLARÉ sur ce plat, gardé ou non. */
    let declaredABox = false;
    // ── LA MORSURE DE CE PLAT, LUE UNE FOIS PAR LIGNE DÉCLARÉE ─────────────
    //
    // ⚠️ MÉMOÏSÉE PAR RÉGIME, PAS PAR BOUCHE, et c'est le contrat de
    // `scanMealForRegime`: il ne lit que la ligne et le repas, jamais l'identité
    // de qui la porte. Deux véganes à la même table rendraient deux fois le même
    // verdict, et le second est du temps perdu sur une lane qui frôle déjà le
    // mur de quatre minutes du worker.
    //
    // ⟳ ÉCHANGE (2026-09-04) — LA CLÉ PORTE AUSSI LA SURFACE. Un plat a
    // désormais plusieurs surfaces de lecture: la sienne, et une par boîte qui
    // déclare des items. Mémoïser par régime seul ferait répondre la première
    // boîte lue pour toutes les autres — et l'échange composé correctement se
    // ferait refuser parce qu'une AUTRE boîte du même plat porte du poulet.
    const biteByRegime = new Map<string, MealRegimeBite>();
    const biteFor = (
      regime: DietaryRegime,
      surface: { terms: string[]; prepIds: string[] } | null,
      boxId: string,
    ): MealRegimeBite => {
      const key = `${regime}::${surface === null ? "dish" : boxId}`;
      const seen = biteByRegime.get(key);
      if (seen) return seen;
      const breach = surface === null
        ? scanMealForRegime(
          regime,
          { title, method, ingredients },
          uses,
          preparationById,
        )
        : scanRegimeSources(regime, [
          {
            prepId: null,
            prose: [],
            items: surface.terms.map((term) => ({ term, group: null })),
          },
          ...surface.prepIds.flatMap((id) => {
            const prep = preparationById.get(id);
            return prep === undefined ? [] : [{
              prepId: prep.id,
              prose: [prep.title, prep.method],
              items: [...prep.ingredients],
            }];
          }),
        ]);
      biteByRegime.set(key, breach);
      return breach;
    };

    /**
     * UN CONTENANT DÉCLARÉ, PASSÉ AUX CINQ PORTES.
     *
     * `legacyShares` porte le repli v2: la somme des parts d'un `box` singulier,
     * qui est la seule chose VRAIE qu'on puisse en tirer — et qui est bien une
     * quantité de bac. `null` sur le chemin v4.
     */
    const takeBox = (raw: unknown, legacy: boolean): void => {
      if (raw === null || raw === undefined || typeof raw !== "object") return;
      declaredABox = true;
      const bx = raw as Record<string, unknown>;
      const boxId = cleanText(bx.id);
      if (!boxId) {
        boxesRefused++;
        issues.push(`dishes[${i}].boxes: no id, dropped`);
        return;
      }
      if (boxIdsSeen.has(boxId)) {
        boxesRefused++;
        issues.push(
          `dishes[${i}].boxes: box id ${JSON.stringify(boxId)} is already used in ` +
            `this plan, dropped`,
        );
        return;
      }
      const where = `dishes[${i}].boxes[${JSON.stringify(boxId)}]`;
      // ⚠️ CALCULÉE AVANT LA BOUCLE DES NOMS, ET SUR LE BRUT. Les items ne
      // sont validés que plus bas (portes ③ et ④); les ceintures, elles, se
      // prononcent AVANT. Attendre la validation ferait juger le couvercle sur
      // le plat pendant que la boîte, elle, dit autre chose.
      let surface = legacy ? null : boxScanSurface(bx, preparationById);
      // ══ PORTE ② · LES NOMS SUR LE COUVERCLE ═══════════════════════════════
      //
      // ⚠️ LE REPLI v2 LIT SES NOMS DANS `shares[]`. Un plan écrit avant ce lot
      // porte une part par personne; les `member_id` de ces parts SONT le
      // groupe, et c'est ce qui fait qu'aucun couvercle déjà en base ne perd son
      // nom quand la forme change sous lui.
      const rawNames = legacy
        ? (Array.isArray(bx.shares) ? bx.shares : []).map((entry) => {
          const sh = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          return cleanText(sh.member_id) || cleanText(sh.memberId);
        })
        : (Array.isArray(bx.member_ids) ? bx.member_ids : Array.isArray(bx.memberIds) ? bx.memberIds : [])
          .map((v) => cleanText(v));
      const memberIds: string[] = [];
      const seenMouths = new Set<string>();
      /** Vrai dès qu'une bouche a été retirée par sa ligne — voir les deux motifs. */
      let heldOffHere = false;
      for (const memberId of rawNames) {
        if (!memberId) {
          boxNamesRefused++;
          issues.push(`${where}: a name on the lid is empty, dropped`);
          continue;
        }
        if (!boxMembers.has(memberId)) {
          boxNamesRefused++;
          issues.push(
            `${where}: member_id ${JSON.stringify(memberId)} is not a mouth of ` +
              `this plan, dropped`,
          );
          continue;
        }
        if (seenMouths.has(memberId)) {
          boxNamesRefused++;
          issues.push(
            `${where}: ${JSON.stringify(memberId)} is on this lid twice -- the ` +
              `second is dropped`,
          );
          continue;
        }
        seenMouths.add(memberId);
        // ══ PORTE ②bis · LA LIGNE DÉCLARÉE DE CETTE BOUCHE ══════════════════
        //
        // ⛔ CE N'EST PAS UNE RÉÉCRITURE DE LA SORTIE DU MODÈLE. Rien de la
        // prose n'est touché: aucun titre, aucune méthode, aucun `why`, aucune
        // `portion_note`, et AUCUN gramme — le bac garde exactement le contenu
        // que le modèle lui a donné. On REFUSE UNE DÉCLARATION.
        //
        // ⛔ ET C'EST UN RETRAIT, PAS UN REFUS DU PLAN. Mesuré: CINQ plans foyer
        // sur cinq portaient la brèche. Refuser le plan aurait rendu
        // `422 empty_meal` à 100 % des foyers où un végane mange — faire payer
        // son régime en semaines vides à la seule population que cette ceinture
        // existe pour protéger.
        const regime = mouthRegimes.get(memberId);
        if (regime) {
          let breach = biteFor(regime, surface, boxId);
          // ⟳ 2026-09-05 — LA CITATION SE RÉPARE AVANT QUE LA BOUCHE NE TOMBE.
          // Mesuré (C07, v28): le modèle cuit un pot de tofu POUR Léa, et sa
          // boîte cite le pot de poulet — le tofu n'est cité par personne. La
          // ceinture la retirait 11 fois sur 11; deux relances et une fusion
          // en resservaient 8; trois repas restaient sans elle. Ici, quand
          // l'item de sa boîte est propre (le terme ne mord pas) et que seule la
          // casserole citée mord, on cherche la casserole ORPHELINE du même
          // jour que sa ligne accepte, et on ré-adresse la citation. Strict:
          // toutes les bouches du couvercle portent cette ligne (on ne change
          // pas l'assiette d'un omnivore), une seule candidate, comptée.
          if (
            breach.matched !== null && surface !== null &&
            rawNames.every((n) => !n || mouthRegimes.get(n) === regime)
          ) {
            // ⟳ 2026-09-05 soir (C03): le TERME peut mordre aussi — « saumon »
            // dans la boîte de la végane, pendant que son pot de tofu du jour
            // n'est cité par personne. Même évidence: on réécrit l'item
            // (terme + citation), compté à part (`item_repaired`).
            const biting = new Set(breach.preparationIds);
            const dayRefs = biting.size > 0 ? [...biting] : surface.prepIds;
            const sameDay = new Set(
              dayRefs.map((id) => preparationById.get(id)?.cookOn ?? null),
            );
            // Candidate: cuite le même jour, citée par AUCUNE boîte ni aucun
            // `uses` du plan brut (le pot que personne ne mange), qui porte
            // une protéine (le rôle du composant échangé), et que la ligne
            // accepte. Un pot de riz orphelin n'est pas une candidate.
            const candidates = [...preparationById.values()].filter((p) =>
              !biting.has(p.id) && !citedAnywhereRaw.has(p.id) &&
              sameDay.has(p.cookOn ?? null) &&
              detectProteinAnchor(p.ingredients) &&
              biteFor(regime, { terms: [], prepIds: [p.id] }, `${boxId}#cand:${p.id}`)
                  .matched === null
            );
            if (candidates.length === 1) {
              const target = candidates[0].id;
              const rawItems = Array.isArray(bx.items) ? bx.items : [];
              let termsRewritten = 0;
              let citationsRewritten = 0;
              for (const [k, entry] of rawItems.entries()) {
                const it = (entry && typeof entry === "object" ? entry : null) as Record<string, unknown> | null;
                if (!it) continue;
                const cited = cleanText(it.preparation_id) || cleanText(it.preparationId);
                const term = cleanText(it.term);
                const termBites = term !== "" &&
                  biteFor(regime, { terms: [term], prepIds: [] }, `${boxId}#term:${k}`).matched !== null;
                if (!biting.has(cited) && !termBites) continue;
                if (termBites) {
                  it.term = candidates[0].title.toLowerCase();
                  termsRewritten++;
                }
                if (cited !== target) citationsRewritten++;
                it.preparation_id = target;
                delete it.preparationId;
              }
              const repaired = boxScanSurface(bx, preparationById);
              const again = repaired === null ? breach : biteFor(regime, repaired, `${boxId}#repaired`);
              if (again.matched === null) {
                surface = repaired;
                breach = again;
                if (citationsRewritten > 0) regimeBelt.citation_repaired++;
                if (termsRewritten > 0) regimeBelt.item_repaired++;
                issues.push(
                  `${where}: ${JSON.stringify(memberId)} is ${regime} and the box cited ` +
                    `${JSON.stringify([...biting][0])} -- re-pointed to ${JSON.stringify(target)}, ` +
                    `cooked the same day and cited by no box of this plan`,
                );
              }
            }
          }
          regimeBelt.checked++;
          if (surface !== null) regimeBelt.box_scoped++;
          regimeBelt.silenced += breach.silenced;
          regimeBelt.silenced_homograph += breach.silencedHomograph;
          regimeBelt.silenced_spelling += breach.silencedSpelling;
          regimeBelt.group_excluded += breach.groupExcluded;
          regimeBelt.group_plant_only += breach.groupPlantOnly;
          regimeBelt.group_undecided += breach.groupUndecided;
          if (breach.matched !== null) {
            regimeBelt.refused++;
            boxNamesRefused++;
            heldOffHere = true;
            if (!boxHeldOff.some((h) => h.memberId === memberId)) {
              boxHeldOff.push({
                memberId,
                cause: "regime",
                boxId,
                via: breach.preparationIds.length > 0 ? "preparation" : "items",
                preparationId: breach.preparationIds[0] ?? null,
                matched: breach.matched,
              });
            }
            issues.push(
              `${where}: ${JSON.stringify(memberId)} is ${regime} and "${title}" ` +
                `breaks that line (${breach.matched}) -- mouth dropped from the box`,
            );
            continue;
          }
          regimeBelt.kept++;
        }
        // ══ PORTE ②ter · CE QUE CETTE BOUCHE A DEMANDÉ D'ÉVITER ════════════
        //
        // ⛔ MÊME GESTE QUE LE RÉGIME, ET POUR LE MÊME MOTIF: on retire LA
        // BOUCHE du contenant, jamais le plat ni le plan. Le plat reste, les
        // autres sont servis, et la personne concernée ne l'est plus.
        // Refuser le plan ferait payer son goût en semaine vide à la seule
        // personne que cette ceinture existe pour servir.
        //
        // ⚠️ SURFACE `ingredients`, JAMAIS `all`. `termsOfInstruction` rend du
        // bruit (« fils » → `fil`, mesuré), et ici un faux positif coûte le
        // repas de quelqu'un: on ne lit que ce que le modèle a NOMMÉ comme
        // aliment.
        const exclusions = mouthExclusions.get(memberId);
        if (exclusions) {
          const bite = surface === null
            ? dishBitesExclusion({
              dish: { title, method, ingredients },
              uses,
              preparationById,
              terms: exclusions,
              surface: "ingredients",
              // ⟳ 2026-09-21 — LE MOMENT DE CE PLAT. Une exclusion écrite pour
              // le petit-déjeuner ne juge pas un dîner: sans ce filtre, le
              // moment n'était qu'un mot dans le texte, invisible ici.
              slot,
            })
            : dishBitesExclusion({
              // ⚠️ TITRE ET MÉTHODE VIDES, ET C'EST LE POINT. `surface:
              // "ingredients"` ne lisait déjà pas la prose du plat; ici on ne
              // lui en donne même pas, et les « ingrédients » sont les items du
              // CONTENANT. Ce que la boîte porte, plus ce que ses casseroles
              // portent — rien du plat.
              dish: {
                title: "",
                method: "",
                ingredients: surface.terms.map((term) => ({ term })),
              },
              uses: surface.prepIds.map((preparationId) => ({ preparationId })),
              preparationById,
              terms: exclusions,
              surface: "ingredients",
              slot,
            });
          exclusionBelt.checked++;
          if (surface !== null) exclusionBelt.box_scoped++;
          if (bite.matched !== null) {
            exclusionBelt.refused++;
            boxNamesRefused++;
            heldOffHere = true;
            if (!boxHeldOff.some((h) => h.memberId === memberId)) {
              boxHeldOff.push({
                memberId,
                cause: "exclusion",
                boxId,
                via: bite.preparationIds.length > 0 ? "preparation" : "items",
                preparationId: bite.preparationIds[0] ?? null,
                matched: bite.matched,
              });
            }
            issues.push(
              `${where}: ${JSON.stringify(memberId)} asked to avoid ` +
                `${JSON.stringify(bite.because ?? bite.matched)} and "${title}" ` +
                `contains ${bite.matched} -- mouth dropped from the box`,
            );
            continue;
          }
          exclusionBelt.kept++;
        }
        memberIds.push(memberId);
      }
      // ══ PORTE ④ · CE QU'IL Y A DEDANS ═════════════════════════════════════
      const items: BoxItem[] = [];
      let legacyTotalGrams: number | null = null;
      if (legacy) {
        // ⛔ LE REPLI v2 N'INVENTE AUCUNE VENTILATION. v2 portait une part PAR
        // PERSONNE et aucun découpage par composant. La seule chose vraie qu'on
        // puisse en tirer est la SOMME — et une somme sur un bac partagé est
        // exactement ce que v4 appelle une quantité de bac. Elle sort donc en
        // `legacyTotalGrams`, jamais en `items` fabriqués: un `item` inventé
        // porterait un `term` que personne n'a écrit, c'est-à-dire un mensonge.
        let total = 0;
        for (const entry of (Array.isArray(bx.shares) ? bx.shares : [])) {
          const sh = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const rawGrams = Number(sh.grams);
          if (!Number.isFinite(rawGrams) || rawGrams <= 0) continue;
          const grams = Math.min(BOX_MAX_GRAMS, Math.round(rawGrams));
          if (grams !== Math.round(rawGrams)) {
            boxesCapped++;
            issues.push(
              `${where}: ${Math.round(rawGrams)} g is over the ${BOX_MAX_GRAMS}-gram ` +
                `ceiling -- capped`,
            );
          }
          total += grams;
        }
        legacyTotalGrams = total > 0 ? total : null;
      } else {
        for (const entry of (Array.isArray(bx.items) ? bx.items : [])) {
          const it = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const term = cleanText(it.term);
          if (!term) {
            boxItemsRefused++;
            issues.push(`${where}: an item names no food, dropped`);
            continue;
          }
          // ⚠️ `null` EST UNE VALEUR, PAS UNE ABSENCE: « ajouté frais le jour
          // même », donc hors du contrôle de fournée. Un id ÉCRIT qui ne désigne
          // aucune casserole du plan est autre chose — c'est une jointure morte,
          // et la laisser passer citerait une casserole que personne ne cuisine.
          // Patron `dishes[].uses[].preparation_id`, mot pour mot.
          const rawPrep = cleanText(it.preparation_id) || cleanText(it.preparationId);
          if (rawPrep && !preparationById.has(rawPrep)) {
            boxItemsRefused++;
            issues.push(
              `${where}: item ${JSON.stringify(term)} draws on ` +
                `${JSON.stringify(rawPrep)}, which is not a preparation of this ` +
                `plan, dropped`,
            );
            continue;
          }
          // ══════════════════════════════════════════════════════════════════
          // ⟳ 2026-09-13 — DEUX FORMES D'ITEM, ET LA SECONDE EST CELLE QUE LE
          // PROMPT ENSEIGNE SUR CE CHEMIN.
          // ══════════════════════════════════════════════════════════════════
          //
          // ⛔ LE DÉFAUT QUE CE BLOC FERME, MESURÉ AU CARACTÈRE. Sous
          // `sizingPath === "portion_v1"`, `boxSchemaBlock` n'est pas servi
          // (`household_meal_generation.ts`) — or c'était le SEUL endroit du
          // prompt qui nommait la clé `grams` d'un item de contenant. Le bloc de
          // régime, lui, ordonne toujours « the one component that line refuses
          // is served PER BOX ... with its own "items" »
          // (`household_diet.ts`). Le modèle écrit donc la seule forme d'item
          // qu'on lui enseigne — celle d'un INGRÉDIENT:
          //   {"term":"ham","quantity":"6 unités de jambon","amount":6,
          //    "unit":"unit","state":"raw","ref":"ham","group":"red_meat"}
          // Tir réel N=2 du 2026-09-13 (`gain-lot3r2-…`): **8 items sur 8
          // jetés**, `delivery: "none_delivered"`, et avec eux l'ancre protéique
          // des quatre repas principaux (jambon pour Max, tofu pour Lea).
          //
          // ⛔ AUCUNE CONVERSION MAISON. La forme d'ingrédient passe par les
          // lecteurs de production, dans l'ordre exact du parseur de plats:
          // `readRefSlug` pour l'identifiant, `readStructuredQuantity` pour la
          // quantité (structurée, puis la copie en prose), puis
          // `preparationReadyGrams` pour la masse PRÊTE — « 6 unités » de jambon
          // deviennent des grammes par `unit_grams` du référentiel, jamais par
          // un barème écrit ici. C'est le geste que `portion_sizing.ts` fait
          // déjà quand LE MOTEUR fabrique un item de contenant à partir d'une
          // ligne d'ingrédient (`readyGramsOfOne`, même arithmétique).
          //
          // ⚠️ `grams` GAGNE QUAND ELLE EST LÀ, et cet ordre est le contrat: une
          // sortie v4 conforme ne change pas de chemin, ne change pas de nombre,
          // et ne passe par aucune résolution de référentiel.
          //
          // ⚠️ ET UNE LIGNE QU'ON NE SAIT PAS CONVERTIR RESTE REFUSÉE. Sans
          // `ref` résoluble, ou sans quantité lisible, `preparationReadyGrams`
          // rend `null` et l'item tombe comme avant, avec son motif.
          const rawGrams = Number(it.grams);
          const declaredGrams = Number.isFinite(rawGrams) && rawGrams > 0 ? rawGrams : null;
          let usableGrams = declaredGrams;
          let itemRef: string | null = null;
          let itemRefRefused = false;
          if (usableGrams === null) {
            const reading = readRefSlug(it.ref, args.composition, composable);
            const structured = readStructuredQuantity(it, args.composition, term, reading);
            const ready = preparationReadyGrams([{
              term,
              quantity: cleanText(it.quantity) || null,
              in_pantry: false,
              group: null,
              part: null,
              ...structured,
            }], args.composition);
            if (ready !== null && ready > 0) {
              usableGrams = ready;
              // ⟳ LOT A — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE, et elle
              // n'est portée QUE sur ce chemin: ici l'identifiant a été LU et
              // c'est LUI qui a pesé l'item. Sur le chemin `grams`, rien n'a été
              // lu et le commentaire d'en dessous tient toujours.
              itemRef = structured.ref;
              itemRefRefused = structured.refRefused;
              boxItemsFromIngredientForm++;
            }
          }
          if (usableGrams === null) {
            boxItemsRefused++;
            issues.push(
              `${where}: item ${JSON.stringify(term)} has no usable grams, dropped`,
            );
            continue;
          }
          if (declaredGrams !== null) boxItemsInGrams++;
          const grams = Math.min(BOX_MAX_GRAMS, Math.round(usableGrams));
          if (grams !== Math.round(usableGrams)) {
            boxesCapped++;
            issues.push(
              `${where}: ${Math.round(usableGrams)} g of ${JSON.stringify(term)} is ` +
                `over the ${BOX_MAX_GRAMS}-gram ceiling for one item -- capped`,
            );
          }
          // ⟳ LOT A — LE MODÈLE N'ÉCRIT PAS D'IDENTIFIANT SUR SES ITEMS DE
          // CONTENANT, et on ne lui en invente pas un en rapprochant le terme
          // d'une ligne d'ingrédient homonyme: deux lignes du même plat peuvent
          // porter le même nom (sel de cuisson et sel de finition). Ces items
          // suivent donc le chemin historique par le terme. Ceux que le MOTEUR
          // écrit ensuite (`applySizing`) portent, eux, l'identité de leur
          // ligne — et ce sont eux qui survivent sur la lane v4.
          items.push({
            preparationId: rawPrep || null,
            term,
            grams,
            ref: itemRef,
            refRefused: itemRefRefused,
            // ⟳ 2026-09-22 — LE VOLUME SUIT L'IDENTIFIANT, ET SEULEMENT LUI.
            // `itemRef` n'est posé que sur le chemin où le référentiel a servi
            // à PESER cet item; sur le chemin `grams` déclaré, rien n'a été lu
            // et il n'y a donc aucune fiche à interroger. Pas de rattrapage par
            // le libellé, pour la raison écrite juste au-dessus.
            ml: millilitresOfSlug(args.composition, itemRef, grams),
          });
        }
      }
      // ══ CE QUI TOMBE, ET AVEC QUEL MOTIF ══════════════════════════════════
      if (memberIds.length === 0 && !args.soloBoxes) {
        boxesRefused++;
        // ⚠️ DEUX MOTIFS, PAS UN. « aucune bouche connue » et « toutes ses
        // bouches sont tenues dehors par leur régime » sont deux causes
        // opposées: la première est un modèle qui invente des noms, la seconde
        // est le produit qui protège quelqu'un. Un seul message aurait rendu les
        // deux indiscernables dans le journal.
        issues.push(
          heldOffHere
            ? `${where}: every mouth on it is held off "${title}" by their ` +
              `declared line, dropped`
            : `${where}: no usable name on the lid, dropped`,
        );
        return;
      }
      if (items.length === 0 && legacyTotalGrams === null) {
        // ⛔ « SERS-TOI » SE DIT PAR L'ABSENCE DE CONTENANT, JAMAIS PAR UN
        // CONTENANT VIDE. Un couvercle nommé sur un bac dont on ne sait pas quoi
        // mettre dedans envoie quelqu'un au frigo chercher une boîte que
        // personne n'a remplie.
        boxesRefused++;
        issues.push(`${where}: nothing to put in it, dropped`);
        return;
      }
      if (uses.length === 0) {
        // ⛔ UN CONTENANT SUR UN PLAT QUI NE PRÉLÈVE RIEN N'A RIEN À CONTENIR.
        // Le protocole pèse à la SESSION de cuisine, dans ce qui sort d'une
        // casserole; un plat cuisiné de zéro le jour même n'a pas été pesé
        // d'avance. Jeté et compté — jamais le plat, qui reste un plat qui se
        // cuisine et se mange.
        boxesRefused++;
        issues.push(
          `${where}: the dish draws on no preparation -- nothing was weighed ` +
            `ahead, dropped`,
        );
        return;
      }
      boxIdsSeen.add(boxId);
      boxNames += memberIds.length;
      boxItems += items.length;
      if (legacyTotalGrams !== null) boxesLegacyFolded++;
      boxes.push({ id: boxId, memberIds, items, legacyTotalGrams });
    };

    // ── LE CHEMIN v4, PUIS LE REPLI v2 ────────────────────────────────────
    //
    // ⛔ LE PARSEUR LIT LES DEUX FORMES, EXACTEMENT COMME LE FRONT. Tant que le
    // prompt n'est pas passé en v4, le modèle écrit encore `box` au singulier:
    // sans ce repli, ce lot rendrait ZÉRO contenant sur toute la population, et
    // on lirait « le modèle n'obéit pas » en ayant corrigé la mauvaise moitié.
    //
    // ⚠️ `boxes` GAGNE DÈS QU'ELLE EST UN TABLEAU, même vide: un modèle passé en
    // v4 qui n'écrit aucun contenant sur ce plat a dit quelque chose, et aller
    // chercher un `box` v2 derrière lui ferait remonter une forme qu'il n'a pas
    // voulue.
    if (Array.isArray(d.boxes)) {
      for (const entry of d.boxes) takeBox(entry, false);
    } else {
      takeBox(d.box, true);
    }

    // ══ LA MORSURE, COMPTÉE SUR LE PLAT ET PAS SUR LE COUVERCLE ═══════════
    //
    // ⛔ C'EST LE COMPTEUR QUE v4 RÉCLAME: sans lui, un modèle qui ne sépare
    // JAMAIS ressemble exactement à un foyer sans régime — la ceinture retire en
    // silence et tout le monde a l'air servi.
    //
    // ⚠️ LA POPULATION EST « LES PLATS QUI DÉCLARENT UN CONTENANT ». Sur un plat
    // sans couvercle, personne n'est nommé: compter chaque bouche mordue comme
    // « séparée » gonflerait le numérateur avec des plats où la question ne se
    // pose pas.
    //
    // ⚠️ ET `regimeRefusedByPreparation` SE REMPLIT SUR TOUTE MORSURE, séparée ou
    // non. C'est un fait de CASSEROLE, pas de couvercle: une bouche dont la
    // ligne refuse cette préparation ne doit pas en recevoir une part dans
    // `member_portions`, que le modèle l'ait sortie du bac ou non.
    // ⟳ ÉCHANGE (2026-09-04) — « SÉPARÉ » SE LIT SUR LE GESTE DE LA CEINTURE,
    // PLUS SUR LA PRÉSENCE DU NOM.
    //
    // Ce compteur lisait `namedOnThisDish`: le modèle a-t-il nommé cette bouche
    // sur ce plat? Sous la boîte d'échange, la réponse est OUI dans le cas
    // NOMINAL — la végétarienne est nommée, sur SA boîte de tofu. L'ancienne
    // lecture aurait compté chaque échange réussi comme un échec de séparation,
    // c'est-à-dire fait mentir le seul nombre qui dit si la consigne porte.
    //
    // La question juste est: la ceinture a-t-elle dû retirer ce nom? Si oui, le
    // modèle n'avait pas séparé et le moteur a rattrapé. Si non — nommée sur sa
    // propre boîte, ou pas nommée du tout — la composition a fait son travail.
    const heldOffByRegime = new Set(
      boxHeldOff.filter((h) => h.cause === "regime").map((h) => h.memberId),
    );
    const dishRegimeBites: DietaryRegime[] = [];
    for (const [memberId, regime] of mouthRegimes) {
      // ⚠️ LA SURFACE DU PLAT, ICI, ET C'EST VOULU: cette boucle demande « ce
      // PLAT mord-il cette ligne? », pas « ce contenant la mord-il? ». C'est
      // elle qui alimente `regime_refusals`, dont la seconde surface
      // (`preparation_shares`) ne connaît aucune boîte.
      const breach = biteFor(regime, null, "");
      // ⟳ 2026-09-05: la morsure au niveau PLAT est aussi le dénominateur —
      // « ce plat porte ce que cette ligne refuse » (voir `regimeBites`).
      if (breach.matched !== null && !dishRegimeBites.includes(regime)) {
        dishRegimeBites.push(regime);
      }
      if (breach.matched === null) continue;
      for (const prepId of breach.preparationIds) {
        const seen = regimeRefusedByPreparation.get(prepId) ?? new Set<string>();
        seen.add(memberId);
        regimeRefusedByPreparation.set(prepId, seen);
      }
      if (!declaredABox) continue;
      regimeBelt.bites++;
      if (heldOffByRegime.has(memberId)) regimeBelt.not_separated++;
      else regimeBelt.separated++;
    }
    // ── LOT C · LA MÊME MESURE, POUR LES DÉGOÛTS ─────────────────────────
    // Elle n'existait pas: `exclusion_belt` ne portait que `refused`, et un
    // modèle qui ne compose JAMAIS la boîte d'échange rendait le même compte
    // qu'un foyer où personne n'évite rien.
    const heldOffByExclusion = new Set(
      boxHeldOff.filter((h) => h.cause === "exclusion").map((h) => h.memberId),
    );
    const dishExclusionBites: string[] = [];
    for (const [memberId, terms] of mouthExclusions) {
      const bite = dishBitesExclusion({
        dish: { title, method, ingredients },
        uses,
        preparationById,
        terms,
        surface: "ingredients",
        slot,
      });
      if (bite.matched === null) continue;
      // ⟳ 2026-09-06 — enregistré AVANT la garde `declaredABox` : un plat sans
      // boîte mord quand même, et c'est justement lui que l'invariant sert à
      // tout le monde (voir `exclusionBites`).
      dishExclusionBites.push(memberId);
      if (!declaredABox) continue;
      exclusionBelt.bites++;
      if (heldOffByExclusion.has(memberId)) exclusionBelt.not_separated++;
      else exclusionBelt.separated++;
    }

    // ── C7 ② · LE SURPLUS TOMBE MAINTENANT, ET PAS AVANT ────────────────
    // Le plat a franchi TOUTES les gardes: il est écrit dans le plan. C'est le
    // seul moment où retirer un plat déjà gardé est justifié.
    if (sacrifice >= 0) {
      issues.push(
        `dishes[${i}]: over the ${cap}-dish cap for ${args.scope} -- kept, and the ` +
          `surplus dish ${JSON.stringify(dishes[sacrifice].title)} ` +
          `(${keptCells[sacrifice] ?? "no slot"}) was dropped instead`,
      );
      dishes.splice(sacrifice, 1);
      keptCells.splice(sacrifice, 1);
      keptRanks.splice(sacrifice, 1);
      keptRawIndex.splice(sacrifice, 1);
      keptSameDayFaults.splice(sacrifice, 1);
      keptOwnerFacts.splice(sacrifice, 1);
      // L7 ③ — LE SEPTIÈME TABLEAU SUIT LE MÊME `splice`, sans quoi le refus
      // d'un plat évincé resterait dans un compteur dont le dénominateur ne le
      // compte plus.
      keptNameFacts.splice(sacrifice, 1);
      keptBoxHeldOff.splice(sacrifice, 1);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT C — À QUI CE PLAT EST DÉDIÉ, POSÉ À LA CRÉATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ DEUX PORTES, ET LES DEUX COMPTENT.
    //
    //   ① LA CONSIGNE DOIT AVOIR RÉCLAMÉ UN PLAT DÉDIÉ (`secondDishAsked`). Au
    //      barreau ① le prompt dit « Do NOT propose separate dishes »: un
    //      `for_member_id` qui arriverait quand même attribuerait le plat de la
    //      TABLE à une personne, et la vue par personne le retirerait alors à
    //      tous les autres. C'est un faux plus cher que l'absence.
    //   ② L'ID DOIT ÊTRE DANS LA LISTE FERMÉE (`dishBearerIds`) — les bouches à
    //      qui la consigne promet vraiment un plat. Le patron est celui de
    //      `preparation_id` juste au-dessus: inventé par le modèle, vérifié
    //      contre une liste, JETÉ et compté quand il n'y est pas.
    //
    // ⛔ AUCUNE LECTURE DE TITRE. Le seul marqueur qui existait avant ce lot
    // était « for Zoe » écrit dans le titre par le modèle, et un matcher
    // là-dessus attribuerait de travers dès « Chicken for Zoe and Marc » — et
    // rien du tout dès que le plan sort en français.
    //
    // ⚠️ UN `for_member_id` REFUSÉ NE REJETTE PAS LE PLAT — TANT QUE LE PLAT
    // PEUT ENCORE ÊTRE LE PLAT DE LA TABLE DE SA CASE. L'attribution est une
    // lecture EN PLUS; un plat sans elle reste un plat qui se cuisine et se
    // mange. Même posture que `honours_belief_keys`: informatif, donc jeté et
    // compté.
    //
    // ⛔ LA SEULE EXCEPTION, ET ELLE EST MESURÉE (2026-09-14). Quand la case
    // porte DÉJÀ le plat de la table, garder ce plat-ci en ferait un SECOND
    // plat de table: chaque bouche de la case serait nommée sur deux
    // couvercles, `meals_delivered` rendrait `double`, et la porte finale
    // refuserait le PLAN ENTIER. Ce plat-là tombe donc, ~900 lignes plus haut
    // (avant le plafond, pour ne pas avoir évincé un vrai repas au passage), il
    // est nommé dans `issues` et compté dans `dish_owner_counts.refused_dropped`.
    // La phrase d'origine — « jamais une raison de retirer un dîner à
    // quelqu'un » — reste vraie et c'est même ce qui l'impose: le geste retire
    // un doublon, la case garde son plat, et chaque bouche y mange une fois.
    //
    // ⚠️ LOT 3C — LES DEUX FAITS SE COMPTENT SÉPARÉMENT, ET C'EST LE POINT.
    // « Le modèle n'a rien écrit » et « le modèle a écrit un id qu'on a refusé »
    // rendaient tous deux `attributed: 0`, et ils appellent des corrections
    // opposées. Voir `dish_owner_counts`.
    //
    // ⚠️ LOT B ③ — `declaredFor` ET `ownerOf` SONT LUS PLUS HAUT, PAS ICI, et
    // c'est une contrainte d'ORDRE: le rang de sacrifice a besoin de savoir à
    // qui ce plat est promis AVANT de choisir qui évincer. Les DEUX PORTES
    // ci-dessus sont exactement celles qui composent `ownerOf` — une seule
    // écriture, jamais deux, sans quoi le rang et l'attribution finiraient par
    // ne plus parler du même plat. Ce qui reste ici, ce sont les REFUS NOMMÉS,
    // et ils restent ici pour que le plan d'un plat tombé plus haut ne gagne
    // aucune `issue` neuve.
    const memberId: string | null = ownerOf;
    const ownerDeclared = declaredFor !== "";
    // ⚠️ `ownerRefusedHere` EST LU, PAS RECALCULÉ. Le plat dont l'attribution
    // refusée aurait fait un second plat de table est déjà tombé plus haut: ce
    // qui arrive ici est le refus qui laisse le plat devenir le plat de table
    // de sa case, et une seconde écriture de la même condition finirait par
    // s'écarter de la première.
    let ownerRefused = false;
    if (ownerRefusedHere) {
      ownerRefused = true;
      issues.push(
        !secondDishAsked
          ? `dishes[${i}]: for_member_id on a shared dish (no dedicated dish was ` +
            `asked), dropped`
          : `dishes[${i}]: for_member_id ${JSON.stringify(declaredFor)} is not a ` +
            `mouth that gets its own dish, dropped`,
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT 2 — CE QU'ON FAIT LE JOUR MÊME, DÉCLARÉ ET VALIDÉ FERMÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE PATRON EST CELUI DE `for_member_id` JUSTE AU-DESSUS, ET IL N'EST PAS
    // NÉGOCIABLE ICI: le jeton est INVENTÉ par le modèle, vérifié contre
    // `SAME_DAY_KINDS`, JETÉ et COMPTÉ quand il n'y est pas. Aucune lecture de
    // `method` n'intervient — le seul marqueur qui existait avant ce lot était la
    // prose (« reheat a portion »), et un matcher là-dessus se tromperait sur
    // « do not reheat », sur « assemble the reheated chicken », et sur la
    // totalité des plans rendus en français. « Jamais de matcher maison »,
    // douzième fois.
    //
    // ⚠️ UN `same_day` REFUSÉ NE REJETTE JAMAIS LE PLAT. Posture
    // `for_member_id` / `honours_belief_keys`: le commentaire du jour est une
    // lecture EN PLUS, et retirer un dîner à quelqu'un parce qu'un modèle a
    // écrit « warm_up » au lieu de « reheat_only » serait payer un champ
    // informatif au prix d'un repas.
    let sameDay: DishSameDay | null = null;
    let sameDayInvalid = false;
    let sameDayMinutesMissing = false;
    const rawSameDay = d.same_day;
    if (rawSameDay !== null && rawSameDay !== undefined) {
      const sd = (typeof rawSameDay === "object" ? rawSameDay : {}) as Record<
        string,
        unknown
      >;
      const kindRaw = cleanText(sd.kind).toLowerCase();
      if (!(SAME_DAY_KINDS as readonly string[]).includes(kindRaw)) {
        sameDayInvalid = true;
        issues.push(
          `dishes[${i}]: same_day.kind ${JSON.stringify(kindRaw)} is not one of ` +
            `${SAME_DAY_KINDS.join("/")}, dropped`,
        );
      } else {
        // LES MINUTES SONT LUES À PART, ET LEUR ABSENCE NE COÛTE PAS LE JETON.
        // Le geste (« à réchauffer ») est ce qui manquait au produit; la durée
        // est ce qui le rend décidable. Perdre le premier parce que le second
        // est illisible échangerait la moitié qui compte contre la moitié qui
        // aide. `null`, JAMAIS zéro: « 0 min » se lit « c'est instantané ».
        const minutesRaw = Number(sd.minutes);
        let minutes: number | null = null;
        if (Number.isFinite(minutesRaw) && minutesRaw >= 0) {
          minutes = Math.min(SAME_DAY_MAX_MINUTES, Math.round(minutesRaw));
          if (minutes !== Math.round(minutesRaw)) {
            issues.push(
              `dishes[${i}]: same_day.minutes ${Math.round(minutesRaw)} is over the ` +
                `${SAME_DAY_MAX_MINUTES}-minute ceiling for a day-of gesture -- capped`,
            );
          }
        } else {
          sameDayMinutesMissing = true;
          issues.push(
            `dishes[${i}]: same_day.kind is ${kindRaw} but its minutes are not a ` +
              `usable number -- the gesture is kept, the duration is not invented`,
          );
        }
        sameDay = { kind: kindRaw as SameDayKind, minutes };

        // ── LA COHÉRENCE DOUCE: COMPTÉE, NOMMÉE, JAMAIS REJETÉE ───────────
        // Trois contradictions que la donnée porte déjà et que personne ne
        // lisait: un plat qui dit « juste réchauffer » sans rien à réchauffer,
        // un plat qui dit « rien à préparer » en puisant dans un lot, et un
        // plat qui dit « rien à préparer » en annonçant une durée. Aucune ne
        // rend le plan inexécutable — on ne peut pas savoir laquelle des deux
        // moitiés a tort — donc c'est un CONSTAT, du même rang que
        // `protein_anchor_missing`.
        if (sameDay.kind === "reheat_only" && uses.length === 0) {
          issues.push(
            `dishes[${i}]: same_day says reheat_only but the dish uses no ` +
              `preparation -- nothing to reheat`,
          );
        }
        if (sameDay.kind === "none" && uses.length > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but the dish draws on ` +
              `${uses.length} preparation(s) -- at least the box comes out`,
          );
        }
        // ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-17, ET C'EST POURQUOI CE TROISIÈME
        // CONSTAT EXISTE. Sur un plan foyer de 24 plats, DEUX portaient
        // `{kind: "none", minutes: 5}` — « Apple and peanut butter »,
        // « Hummus and carrot sticks ». L'écran compose alors le libellé du
        // jeton avec la durée et rend « Rien à préparer — 5 min », qui se
        // contredit dans la même ligne. Le modèle lit `none` comme « rien à
        // CUIRE » là où le prompt dit « rien à FAIRE »; le geste réel de ces
        // deux plats est `assemble`.
        //
        // Compté, jamais rejeté, pour la raison des deux constats du dessus: on
        // ne sait pas laquelle des deux moitiés a tort — la durée peut être
        // juste et le jeton faux. C'est le prompt qu'il faudra resserrer, et ce
        // constat est ce qui rendra le resserrage mesurable.
        if (sameDay.kind === "none" && sameDay.minutes !== null && sameDay.minutes > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but announces ` +
              `${sameDay.minutes} minute(s) -- nothing to prepare cannot take time`,
          );
        }
      }
    }

    dishes.push({
      // L7 ③ — LE NOM D'ABORD, COMME DANS LE SCHÉMA. `null` quand le modèle
      // n'en a pas rendu d'utilisable: l'écran affiche alors le `title`.
      name,
      title,
      slot,
      day,
      ingredients,
      method,
      // FF-061: la phrase EFFACÉE quand elle culpabilise, jamais la brute.
      why: safeWhy,
      // ⟳ 2026-09-10 — LA VÉRIFICATION QUE LE MODÈLE DIT AVOIR FAITE.
      // ⛔ LU, JAMAIS CRU. Rien ne décide sur ce nombre: le moteur pèse le plat
      // comme avant. Il sert à comparer ce qu'il DIT avoir calculé à ce qu'on
      // MESURE — et donc à savoir s'il calcule mal ou s'il vise mal.
      // ⚠️ Une valeur absurde ne vaut pas mieux qu'une absence: au-delà de
      // 900 kcal/100 g on est au-dessus de l'huile pure (884), donc ce n'est
      // pas une densité de plat. On rend `null` plutôt que de journaliser un
      // écart calculé contre un nombre qui ne veut rien dire.
      densityCheck: (() => {
        // ⛔ `d`, LE PLAT BRUT — PAS `raw`. Mesuré le 2026-09-10: écrit
        // `raw.density_check`, le champ ressortait `null` sur 16 plats sur 16,
        // et j'ai cru que le modèle ignorait la consigne. `raw` désigne autre
        // chose dans cette portée; le plat rendu par le modèle est `d`. Un
        // champ neuf lu sur le mauvais objet ressemble EXACTEMENT à un modèle
        // qui n'obéit pas — et c'est le genre de conclusion qui fait durcir un
        // prompt pour rien.
        const brut = Number((d as Record<string, unknown>).density_check);
        if (!Number.isFinite(brut) || brut <= 0 || brut > 900) return null;
        return Math.round(brut * 10) / 10;
      })(),
      honours_belief_keys: honours,
      uses,
      // LES CONTENANTS DU REPAS, POSÉS À LA CRÉATION comme `memberId` et
      // `sameDay`.
      boxes,
      // ÉCHANGE — ce que la ceinture a retiré des couvercles de CE plat, posé
      // à la création comme le reste. Interne: `mealDishesPayload` ne le
      // recopie pas, la base n'en voit rien.
      heldOff: boxHeldOff,
      regimeBites: dishRegimeBites,
      exclusionBites: dishExclusionBites,
      memberId,
      sameDay,
      // ⟳ LOT D — la structure de cuisson du FRAIS de ce plat, transportée
      // telle quelle. `d` est le plat rendu par le modèle; `readComponents`
      // ne valide rien, `bodiesOfUnit` décide.
      components: readComponents(d as Record<string, unknown>),
    });
    keptSameDayFaults.push({
      invalid: sameDayInvalid,
      minutesMissing: sameDayMinutesMissing,
    });
    keptOwnerFacts.push({ declared: ownerDeclared, refused: ownerRefused });
    keptNameFacts.push({ declared: nameDeclared, refused: nameRefused });
    keptBoxHeldOff.push(boxHeldOff);
    keptCells.push(cell);
    keptRanks.push(rank);
    keptRawIndex.push(i);
  }

  // ── LA LISTE DE COURSES ─────────────────────────────────────────────────
  const shopping: ShoppingItem[] = [];
  const seenShopping = new Set<string>();
  for (const [i, rawItem] of (Array.isArray(root.shopping_list) ? root.shopping_list : []).entries()) {
    const s = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const term = cleanText(s.term);
    if (!term) {
      issues.push(`shopping_list[${i}]: empty term, dropped`);
      continue;
    }
    const quantity = cleanText(s.quantity) || null;
    if (quantity && ENERGY_UNIT_RE.test(quantity)) {
      if (!rejectedNumeric.includes("energy_unit_in_quantity")) {
        rejectedNumeric.push("energy_unit_in_quantity");
      }
      issues.push(`shopping_list[${i}]: a shopping quantity is never in calories -- dropped`);
      continue;
    }

    // ── GARANTIE 3 : RAYON DANS LE VOCABULAIRE FERMÉ ───────────────────
    const aisleRaw = cleanText(s.aisle).toLowerCase();
    let aisle: ShoppingAisle;
    if ((SHOPPING_AISLES as readonly string[]).includes(aisleRaw)) {
      aisle = aisleRaw as ShoppingAisle;
    } else {
      // Dégradé vers `other` plutôt que rejeté: perdre un ingrédient parce que
      // le modèle a écrit « vegetables » au lieu de « produce » enverrait
      // l'élève au supermarché avec une liste incomplète. Le rayon est du
      // confort de rangement, pas une garantie de sécurité — la dégradation
      // est donc le bon arbitrage, et elle est COMPTÉE.
      if (aisleRaw && !rejectedAisles.includes(aisleRaw)) rejectedAisles.push(aisleRaw);
      if (aisleRaw) issues.push(`shopping_list[${i}]: unknown aisle ${JSON.stringify(aisleRaw)}, filed under other`);
      aisle = "other";
    }

    // Dédup sur le terme normalisé: deux plats qui utilisent des oignons ne
    // doivent pas produire deux lignes « oignons ».
    const dedup = normalizePantryTerm(term);
    if (seenShopping.has(dedup)) {
      issues.push(`shopping_list[${i}]: duplicate ${JSON.stringify(term)}, kept the first`);
      continue;
    }
    seenShopping.add(dedup);
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · C3 — L'IDENTITÉ ET LA QUANTITÉ, RÉSOLUES UNE FOIS ICI
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UNE SEULE RÉSOLUTION, ET C'EST CELLE DU LOT A. `resolveCompositionLine`
    // décide: l'identifiant du modèle d'abord, le libellé ensuite, rien du tout
    // quand l'identifiant a été refusé. Le GROUPE sort de la même référence
    // (point 6 de C3), donc il ne peut plus diverger de l'identité.
    //
    // ⚠️ LA QUANTITÉ STRUCTURÉE EST LUE DE LA PROSE, PAR LE LECTEUR EXISTANT.
    // `readQuantityFromProse` ne lit AUCUN mot: un nombre suivi de `g`, `ml`,
    // ou un nombre nu, ancré des deux bouts. C'est un TRANSPORT, pas une
    // interprétation — et la vraie quantité, celle du plan final arrondi, est
    // recalculée par la lane (`rebuildShoppingQuantities`) avant l'écriture.
    const lineRef = resolveCompositionLine(args.composition ?? null, { term, ref: null });
    const prose = readQuantityFromProse(quantity);
    shopping.push({
      term,
      quantity,
      aisle,
      food_group: lineRef.ref?.foodGroupRef ?? null,
      ref: lineRef.ref?.slug ?? null,
      amount: prose?.amount ?? null,
      // ⚠️ `unit` DE LA PROSE VAUT `"unit"` POUR UN NOMBRE NU — c'est le
      // vocabulaire fermé de `readQuantityFromProse`, pas une invention.
      unit: prose?.unit ?? null,
      // ⛔ `raw` EST UNE AFFIRMATION DU PANIER: 500 g de riz au magasin sont
      // 500 g CRUS. `null` quand il n'y a aucune quantité à qualifier.
      state: prose === null ? null : "raw",
      purchasable: lineRef.ref === null || !NON_PURCHASABLE_SLUGS.has(lineRef.ref.slug),
    });
  }

  // ── C7 ③ · ON N'ACHÈTE PAS POUR UN PLAT QUI N'EST PAS AU PLAN ──────────
  //
  // ⚠️ MESURÉ LE 2026-08-12 SUR TROIS FUSIONS RÉELLES. Le plafond et le rejet
  // de cible chiffrée jettent des plats; la liste de courses, parsée plus bas,
  // n'en savait rien. Run 1: CINQ lignes orphelines (`kidney beans`, `pork
  // mince`, `bok choy`, `sesame oil`, `soy sauce`) — exactement les ingrédients
  // des deux plats tombés. Run 3: TROIS. Le foyer paie et jette.
  //
  // ── LE RATTACHEMENT, ET POURQUOI IL EST EXACT ET PAS TOLÉRANT ──────────
  // ⚠️ JAMAIS DE MATCHER MAISON SUR DU TEXTE ALIMENTAIRE. « laitue » contient
  // « lait », et `isInPantry` — qui accepte justement l'inclusion — dirait donc
  // qu'une ligne « lait » couvre une « laitue ». Ici, une correspondance fausse
  // RETIRE une ligne de courses: quelqu'un part au magasin sans ce qu'il lui
  // faut. Le seul rattachement utilisé est donc l'ÉGALITÉ normalisée
  // (`normalizePantryTerm`), c'est-à-dire exactement la jointure que ce fichier
  // fait déjà deux fois — le dédoublonnage de la liste juste au-dessus, et la
  // reprise du rayon en mode `from_pantry` juste en dessous.
  //
  // ── TROIS SORTS, ET LE DOUTE NE RETIRE RIEN ───────────────────────────
  //   · la ligne est réclamée par un plat GARDÉ (ou une préparation gardée)
  //     ⇒ elle reste, même si un plat tombé la citait aussi. « Ne retire que si
  //     plus AUCUN plat gardé ne la réclame »: un oignon sert cinq plats.
  //   · la ligne est réclamée par un plat TOMBÉ et par personne d'autre
  //     ⇒ elle part, et son terme est NOMMÉ dans les `issues`.
  //   · la ligne ne se rattache à RIEN de connu ⇒ ELLE RESTE, et elle est
  //     COMPTÉE. C'est le « je n'ai pas su rattacher » du lot: le modèle écrit
  //     « chicken breasts » dans la liste et « chicken breast » dans le plat,
  //     et deviner là-dessus coûterait un dîner.
  //
  // ── C8 ② · LE DOUTE SE COMPTE MÊME QUAND AUCUN PLAT N'EST TOMBÉ ────────
  //
  // ⚠️ MESURÉ SUR LES FUSIONS RÉELLES, DEUX FOIS. Sur les réponses brutes du
  // 2026-08-12, deux runs sur quatre portaient une ligne réclamée par AUCUN
  // plat gardé (`spring greens`, `protein pancakes`). Sur les 18 fusions
  // ARCHIVÉES en base: HUIT en portent au moins une, et TROIS d'entre elles
  // n'ont fait tomber aucun plat (`be17ae53…`, `dc5c8dd3…`, `c4f36c5f…`).
  //
  // Ces trois-là étaient MUETTES: toute la réconciliation vivait sous « un plat
  // est tombé », donc le doute n'était compté que par accident, quand un plat
  // tombait par ailleurs. Le foyer achetait pour rien, EN SILENCE.
  //
  // ⚠️ CE QUI CHANGE EST LE COMPTE, JAMAIS L'ACTION. Une ligne qu'on ne sait
  // pas rattacher RESTE — c'est l'arbitrage de C7 ③ et il ne bouge pas d'un
  // octet: une correspondance fausse retire une ligne dont un plat a besoin.
  // Le RETRAIT continue de n'exister que pour une ligne réclamée par un plat
  // TOMBÉ, donc `droppedDishTerms` vide ⇒ aucune ligne ne part, jamais.
  //
  // LE CAS QUI PASSE DEVIENT PLUS ÉTROIT, ET C'EST LE BON: un plan dont chaque
  // ligne est réclamée par un plat gardé ne porte AUCUNE `issue` de courses et
  // ne perd rien. C'était « aucun plat tombé »; c'est désormais « tout est
  // rattaché ».
  //
  // ⟳ 2026-09-12 · C3 — LES TROIS SORTS PASSENT À L'IDENTITÉ, ET LE PARSEUR
  // PARTAGE DÉSORMAIS SON CORPS AVEC LA FUSION (`sortShoppingLines`). La règle
  // ne change pas d'un octet; ce qui change est ce qu'on compare. « citrons »
  // et « citron » atteignent le même slug, donc une ligne au pluriel cesse de
  // tomber dans `unattributed` par accident — et une ligne d'un plat tombé est
  // reconnue même si le modèle l'a écrite au singulier d'un côté.
  const keptDishIndexes = new Set(keptRawIndex);
  const droppedDishIdentities = new Set<string>();
  for (const [i, entry] of rawDishes.entries()) {
    if (keptDishIndexes.has(i)) continue;
    const dropped = (entry && typeof entry === "object" ? entry : {}) as Record<
      string,
      unknown
    >;
    for (const rawIng of (Array.isArray(dropped.ingredients) ? dropped.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<
        string,
        unknown
      >;
      const term = cleanText(ing.term);
      if (!term) continue;
      droppedDishIdentities.add(
        foodIdentityOf(args.composition ?? null, {
          term,
          ref: typeof ing.ref === "string" ? ing.ref : null,
        }).identity,
      );
    }
  }
  let reconciledShopping = shopping;
  if (shopping.length > 0) {
    // ⚠️ LES PRÉPARATIONS GARDÉES COMPTENT COMME DES RÉCLAMANTES. Un plat de
    // lot ne répète pas la recette de sa préparation (le prompt système le
    // demande): ne regarder que `dish.ingredients` ferait retirer les courses
    // de toutes les cuissons par lot.
    const claimed = claimedIdentities(args.composition ?? null, [...dishes, ...preparations]);
    const sorted = sortShoppingLines({
      index: args.composition ?? null,
      lines: shopping,
      claimed,
      removed: droppedDishIdentities,
    });
    reconciledShopping = sorted.kept;
    const orphans = sorted.dropped.map((l) => l.term);
    const unattached = sorted.counts.unattributed;
    if (orphans.length > 0) {
      issues.push(
        `shopping_list: ${orphans.length} line(s) bought for a dish that is not in ` +
          `the plan -- removed (${orphans.join(", ")})`,
      );
    }
    if (unattached > 0) {
      issues.push(
        `shopping_list_unattributed: ${unattached}/${shopping.length} lines match ` +
          `no kept and no dropped ingredient -- kept, not guessed`,
      );
    }
  }

  // ── EN MODE `from_pantry`, LA LISTE EST CE QUI MANQUE ───────────────────
  // Recalculée à partir des ingrédients réellement retenus, pas reprise du
  // modèle: c'est la seule façon que « il ne te manque rien » soit vrai.
  let finalShopping = reconciledShopping;
  if (args.mode === "from_pantry") {
    const missing: ShoppingItem[] = [];
    const seenMissing = new Set<string>();
    for (const dish of dishes) {
      for (const ing of dish.ingredients) {
        if (ing.in_pantry) continue;
        // ⟳ 2026-09-12 · C3 — DÉDUP PAR IDENTITÉ: deux plats qui écrivent
        // « oignon » et « oignons » ne font plus deux lignes de courses.
        const dedup = foodIdentityOf(args.composition ?? null, ing).identity;
        if (seenMissing.has(dedup)) continue;
        seenMissing.add(dedup);
        // On garde le rayon que le modèle avait donné pour ce terme s'il en a
        // donné un; sinon `other`. LA LISTE RÉCONCILIÉE (C7 ③), pas la brute:
        // une ligne retirée parce qu'elle n'appartenait qu'à un plat tombé n'a
        // pas à revenir par la porte du rayon.
        const known = reconciledShopping.find((s) =>
          foodIdentityOf(args.composition ?? null, s).identity === dedup
        );
        const prose = readQuantityFromProse(ing.quantity ?? known?.quantity ?? null);
        missing.push({
          term: ing.term,
          quantity: ing.quantity ?? known?.quantity ?? null,
          aisle: known?.aisle ?? "other",
          // ⟳ `L0-a`, puis C3 — résolu sur la LIGNE de l'INGRÉDIENT (son
          // identifiant compris), pas recopié de la ligne connue: c'est cet
          // aliment-là qui part en courses.
          food_group: foodGroupOfLine(ing),
          ref: refForIngredient(args.composition ?? null, ing)?.slug ?? null,
          // ⚠️ LA QUANTITÉ STRUCTURÉE DE L'INGRÉDIENT GAGNE, la prose ne sert
          // que de repli — même ordre que partout ailleurs.
          amount: ing.amount ?? prose?.amount ?? null,
          unit: ing.unit ?? prose?.unit ?? null,
          state: ing.amount !== null || prose !== null ? "raw" : null,
          purchasable: !isNonPurchasableIdentity(dedup),
        });
      }
    }
    finalShopping = missing;
  }

  // ── GARANTIE 4 : LA CEINTURE DE SORTIE, SUR TOUT LE TEXTE VISIBLE ───────
  // Titres, méthode, justification, ingrédients ET liste de courses. Oublier
  // la liste laisserait passer l'allergène par la porte de derrière — c'est
  // exactement le défaut mesuré sur le plan hebdo, où la citation du coach
  // échappait au filtre numérique parce que personne ne l'avait listée comme
  // du texte visible.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // LES DEUX SURFACES QUI MANQUAIENT (2026-08-19) — LA CUISSON, ET LA PHRASE
  // LUE À TABLE.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ SUR UN PLAN RÉEL. La liste ci-dessus ne portait QUE
  // les plats et les courses: zéro titre de préparation, zéro `portion_note`.
  // Sur ce plan, un contact croisé DÉCLARÉ — « roast on the other half of the
  // chicken tray » — vivait dans une surface que rien ne lisait. La garantie de
  // `CONTRACT.md` est écrite comme globale; elle s'arrêtait à deux clés du
  // JSON sur quatre.
  //
  // ⚠️ LA PRÉPARATION EST DU TEXTE QUE QUELQU'UN CUISINE. On y met les TROIS
  // champs — titre, méthode, ingrédients — et pas le seul titre. Ne ceinturer
  // que le titre serait la cicatrice « garde posée sur un seul des deux
  // champs », rejouée à l'étage du dessous: la recette d'un lot ne vit QUE
  // dans la préparation (le prompt système interdit au plat de la répéter),
  // donc la méthode de préparation est le seul endroit où « l'autre moitié du
  // plateau » peut s'écrire.
  //
  // ⚠️ `member_portions` EST LU SUR LA RACINE DE **CE** JSON, pas passé par
  // l'appelant. C'est la même clé de premier niveau qu'`extractMemberPortions`
  // relit plus tard sur `mealSourceText`; la lire ici lie structurellement la
  // note au plan qu'on est en train de verrouiller, alors qu'un paramètre
  // aurait laissé l'appelant libre de passer les notes d'une AUTRE réponse —
  // le défaut du `current` périmé, déjà payé sur cette lane (18 parts
  // orphelines sur 18, après une relance d'ancre).
  //
  // ⛔ LA NÉGATION RESTE TOLÉRÉE, ET CE N'EST PAS UNE RÈGLE NEUVE. C'est le
  // piège de cette extension, et il est mesuré: `portion_note` porte
  // LÉGITIMEMENT « Ensure no sesame is present » sur l'assiette de la personne
  // allergique — c'est le BON comportement, et c'est même la seule façon
  // d'écrire une consigne de contact croisé. Le texte part dans le MÊME
  // `applyKeelOutputLocks` que les plats, donc dans le même
  // `findForbiddenMatches` avec `allowNegatedMentions` par défaut: la
  // tolérance est portée par le moteur commun (condition de désarmement n°3 de
  // la doctrine P9), pas réécrite ici. Une seconde formulation de la même
  // règle à deux fichiers d'écart est un générateur de divergence.
  const renderedPortionNotes: string[] = [];
  for (const rawPortion of (Array.isArray(root.member_portions) ? root.member_portions : [])) {
    const portion = (rawPortion && typeof rawPortion === "object" ? rawPortion : {}) as Record<
      string,
      unknown
    >;
    // Les DEUX graphies, comme `household_portions.ts` les lit: le modèle rend
    // du snake_case, mais une relecture passée par un objet TS rendrait du
    // camelCase, et une ceinture qui n'en connaîtrait qu'une serait muette la
    // moitié du temps sans le dire.
    const note = cleanText(portion.portion_note ?? portion.portionNote);
    if (note) renderedPortionNotes.push(note);
    // LES NOTES DE PART AUSSI. Une part de préparation est la phrase qui dit
    // « prends dans le plateau à poulet »: c'est exactement la surface du
    // contact croisé mesuré, une ligne plus bas que `portion_note`.
    for (const rawShare of (Array.isArray(portion.preparation_shares) ? portion.preparation_shares : [])) {
      const share = (rawShare && typeof rawShare === "object" ? rawShare : {}) as Record<
        string,
        unknown
      >;
      const shareNote = cleanText(share.note);
      if (shareNote) renderedPortionNotes.push(shareNote);
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 1 — UN SEUL RECENSEMENT, DEUX CONTRÔLES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE TABLEAU ÉTAIT ÉCRIT À LA MAIN ICI, ET UN AUTRE L'ÉTAIT DANS LE
  // HANDLER. Les deux listaient des champs différents, et aucun des deux ne
  // portait `cooking_sessions[].run_through` ni `dishes[].name` : « Ajouter du
  // beurre de cacahuète au riz. » dans le seul déroulé d'une session passait
  // le parseur et sortait `clean` (revue du 2026-09-12, P1 §2, reproduit).
  //
  // ⛔ LE TEXTE DU VERROU GLOBAL DESCEND DES MÊMES SURFACES QUE LA
  // LOCALISATION. Tant qu'ils étaient deux listes, l'une pouvait oublier ce que
  // l'autre lisait — sans que rien ne le dise.
  const outputSurfaces = collectOutputSurfaces({
    dishes,
    preparations,
    cookingSessions,
    portionNotes: renderedPortionNotes,
    shoppingTerms: finalShopping.map((s) => s.term),
    // ⚠️ VIDE ICI, ET CE N'EST PAS UN OUBLI: `explanation` est une clé de la
    // lane FOYER, extraite du texte source par `extractExplanation` et filtrée
    // par `gatePlanExplanation` bien après ce parseur. La ceinture FINALE du
    // handler la contrôle, sur les lignes qui partiront réellement à l'écran.
    explanationLines: [],
  });
  const rendered = outputSurfacesText(outputSurfaces);

  const lock = applyKeelOutputLocks({
    text: rendered,
    isKeelStudent: true,
    safetyConstraints: args.safetyConstraints,
    doctrine: args.doctrine,
  });
  // ── LA SECONDE CEINTURE: LE GROUPE ÉCRIT PAR LE MODÈLE ────────────────────
  //
  // Mesuré le 2026-09-05 sur un plan réel (A06-r2): Tom, `allergen_ref='egg'`,
  // `severity='medical'`, a reçu une préparation dont un ingrédient s'écrivait
  // `œufs` ET portait `group = "eggs"`. Le verrou ci-dessus lit du TEXTE; la
  // ligature lui échappait (réparée depuis dans `forbidden_matcher.ts`) et le
  // GROUPE ne lui servait à rien. Deux gardes ratent des choses différentes:
  // celle-ci ne lit aucune prose, seulement ce que le modèle a lui-même
  // déclaré, et aucune graphie ne peut plus la contourner.
  //
  // ⛔ MÊME CONSÉQUENCE QUE LE VERROU DE TEXTE, exprès: `clean` retombe à
  // `false`, ce qui vide plats et préparations plus bas. Un allergène médical
  // servi n'est pas un plan qu'on rend amputé d'une ligne, c'est un plan qu'on
  // ne rend pas. Une seconde politique ici serait une seconde doctrine.
  const allergenGroupBites = allergenGroupViolations(
    [...dishes, ...preparations],
    args.safetyConstraints ?? [],
  );
  const groupedIngredients = groupedIngredientCount([...dishes, ...preparations]);
  if (allergenGroupBites.length > 0) {
    console.error("keel.meal.allergen_group_violation", {
      violations: allergenGroupBites.length,
      // ⚠️ LE DÉNOMINATEUR, sinon « 0 morsure » ne se distingue pas de « aucun
      // ingrédient ne portait de groupe » — la ceinture serait muette et
      // ressemblerait à une ceinture propre.
      grouped_ingredients: groupedIngredients,
      groups: [...new Set(allergenGroupBites.map((v) => v.foodGroup))].join(","),
      refs: [...new Set(allergenGroupBites.map((v) => v.allergenRef))].join(","),
    });
    for (const bite of allergenGroupBites) {
      issues.push(
        `allergen_group_served: ${bite.bearer} carries ${bite.term} (${bite.foodGroup}) against ${bite.allergenRef}`,
      );
    }
  }
  const clean = (lock.reason === "clean" || lock.reason.startsWith("disarmed")) &&
    allergenGroupBites.length === 0;

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA CANDIDATE NON LIVRABLE, ET OÙ ELLE MORD
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT QUE CE BLOC FERME, ET IL EST DANS `RESTE-A-FAIRE.md` : le
  // verrou lit UN SEUL TEXTE — tous les plats, toutes les casseroles, toutes
  // les notes et toute la liste de courses concaténés. Quand il mord, `clean`
  // tombe et les quatre tableaux sortent VIDES. Une arachide dans le dîner de
  // samedi rend donc les SIX repas indisponibles, et rien ne dit lequel était
  // en cause. Le plan de fermeture l'exige : « localiser les violations par
  // plat, préparation, note de portion, méthode, session, courses ou autre
  // surface visible » et « une violation de texte doit être corrigée sur sa
  // surface sans faire disparaître une recette saine sans lien ».
  //
  // ⛔ CE QUI NE CHANGE PAS, ET C'EST LA MOITIÉ QUI PROTÈGE. `dishes`,
  // `preparations`, `cooking_sessions` et `shopping_list` SORTENT TOUJOURS
  // VIDES quand le verrou a mordu : aucun appelant existant ne voit une
  // candidate dangereuse, et aucun chemin de publication ne s'ouvre. Ce qui est
  // ajouté vit à côté, sous un nom qui dit ce qu'il est.
  //
  // ⚠️ ET IL NE COÛTE RIEN SUR LE CHEMIN NOMINAL : la localisation ne tourne
  // QUE lorsque le verrou a déjà mordu.
  const unsafeCandidate = clean ? null : {
    dishes,
    preparations,
    cooking_sessions: cookingSessions,
    shopping_list: finalShopping,
    violations: localizeOutputLockBites({
      surfaces: outputSurfaces,
      groupBites: allergenGroupBites,
      globalTokens: lock.tokens,
      safetyConstraints: args.safetyConstraints,
      doctrine: args.doctrine,
    }),
  };

  // ── FF-037 : L'ANCRE PROTÉIQUE DES REPAS PRINCIPAUX ─────────────────────
  // Une règle qui n'existe que dans le prompt n'est pas une garantie. Ce
  // fichier l'écrit déjà trois fois — pour le plafond de plats, les moments
  // écartés et le temps de session — et l'a payée les trois fois. La consigne
  // demande une ancre; ceci VÉRIFIE qu'elle est là.
  //
  // PASS-WITH-ISSUE. Le plat est conservé. Seul le verrou binaire de sécurité
  // vide un repas; un constat de composition n'a jamais ce pouvoir, et un
  // `empty_meal` sur un motif pareil serait un refus dont l'élève ne peut rien
  // faire (FF-037 R5).
  //
  // LES INGRÉDIENTS DE LA PRÉPARATION COMPTENT. Le prompt système demande
  // explicitement qu'un plat qui puise dans un lot NE RÉPÈTE PAS sa recette:
  // ne regarder que `dish.ingredients` ferait donc signaler tous les plats de
  // batch, c'est-à-dire précisément l'architecture qu'on a demandée.
  const proteinAnchorMissing: string[] = [];
  for (const [i, dish] of dishes.entries()) {
    if (!isMainMealSlot(dish.slot)) continue;
    const fromPreparations = dish.uses.flatMap((u) =>
      preparations.find((p) => p.id === u.preparationId)?.ingredients ?? []
    );
    if (detectProteinAnchor([...dish.ingredients, ...fromPreparations])) continue;
    proteinAnchorMissing.push(dish.title);
    issues.push(
      `dishes[${i}]: protein_source_missing -- ${dish.slot} carries no protein food`,
    );
  }

  // ── FF-038 : CE QUE LE CONTRAT DE QUANTITÉS A RENDU ─────────────────────
  // UNE SEULE issue agrégée, et pas une par ingrédient: le contrat est
  // nouveau, un modèle qui l'ignore en entier produirait quarante lignes
  // identiques qui noieraient les constats utiles (un allergène, un lot gardé
  // six jours). Le CHIFFRE est ce qu'on veut lire, pas la liste.
  if (ingredientCount > 0 && unstructuredIngredients > 0) {
    issues.push(
      `structured_quantity_missing: ${unstructuredIngredients}/${ingredientCount} ingredients`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LOT C (2026-09-11) · CE QUE LES IDENTIFIANTS DE RÉFÉRENCE ONT DONNÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DEUX `issues` ET PAS UNE, PARCE QUE CE SONT DEUX FAITS DIFFÉRENTS.
  //
  //   · `ref_absent` — le modèle n'a écrit aucun identifiant. C'est le cas
  //     NOMINAL tant que le catalogue n'est pas servi, et c'est aussi le cas
  //     ATTENDU pour un aliment hors catalogue. Il sort avec son dénominateur:
  //     sans lui, « 40 absents » ne dit pas si c'est tout le plan ou un quart.
  //   · `ref_refused` — il a écrit un identifiant faux. Celui-là est une
  //     DÉSOBÉISSANCE ou un référentiel troué, et les deux causes sont
  //     séparées (`unknown` / `not_composable`).
  //
  // ⚠️ AUCUN PLAT N'EST JETÉ POUR ÇA. Le refus porte sur la PESÉE, jamais sur
  // l'assiette: perdre un dîner parce qu'un modèle a mal recopié un slug
  // échangerait le repas contre le confort du parseur. La ligne survit, elle
  // n'est simplement pesée par personne — et ce silence-là est compté.
  //
  // ⚠️ LE DÉNOMINATEUR EST CELUI DES IDENTIFIANTS, PAS `ingredientCount`.
  // `ingredientCount` ne compte que les lignes des PLATS; `refTally` compte
  // aussi celles des préparations, où vit l'essentiel de la masse. Les diviser
  // l'un par l'autre rendrait des taux au-dessus de 100 %.
  const refLines = refTally.absent + refTally.accepted + refTally.alias +
    refTally.unknown + refTally.not_composable;
  if (refTally.absent > 0 && refLines > 0) {
    issues.push(`ref_absent: ${refTally.absent}/${refLines} ingredients`);
  }
  if (refTally.unknown > 0 || refTally.not_composable > 0) {
    issues.push(
      `ref_refused: ${refTally.unknown} unknown, ${refTally.not_composable} not_composable, ` +
        `${refTally.accepted} accepted`,
    );
  }
  // ⟳ 2026-09-24 — un autre nom connu accepté comme identifiant: compté, sans
  // quoi « le modèle cite la liste » et « on rattrape ses synonymes » se liraient pareil.
  if (refTally.alias > 0) {
    issues.push(`ref_alias: ${refTally.alias} accepted via food_composition_aliases`);
  }
  // ── LA PART DENSE, NOMMÉE ───────────────────────────────────────────────
  // Ici on NOMME, contrairement au compteur ci-dessus: la liste est courte par
  // construction (une huile, un beurre), et c'est le terme exact qu'il faut
  // pour savoir si la consigne du prompt a porté. Mesuré le 2026-08-12 sur 80
  // générations: 82 lignes d'huile d'olive sans quantité, chacune éteignant le
  // verdict de son plan.
  if (unweighedDenseTerms.length > 0) {
    issues.push(
      `energy_dense_unweighed: ${[...new Set(unweighedDenseTerms)].join(", ")}`,
    );
  }
  // ── LES TERMES SANS QUANTITÉ, NOMMÉS ET PLAFONNÉS ───────────────────────
  // ⚠️ LE PLAFOND EST DIT, JAMAIS SILENCIEUX. Une troncature muette se lit
  // « il n'y avait que douze termes », ce qui est le contraire du constat.
  if (unquantifiedTerms.length > 0) {
    const uniq = [...new Set(unquantifiedTerms)];
    const shown = uniq.slice(0, UNQUANTIFIED_TERMS_NAMED);
    const rest = uniq.length - shown.length;
    issues.push(
      `unquantified_terms: ${shown.join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`,
    );
  }
  if (args.composition === null) {
    // NOMMÉ, sinon un référentiel indisponible en boucle ressemblerait à un
    // modèle qui n'écrit pas ses quantités — deux causes opposées, une seule
    // apparence.
    issues.push("composition_index_unavailable: grams not computed");
  }


  // ── UNE SESSION QUI DÉBORDE LE TEMPS DÉCLARÉ ────────────────────────────
  // Le temps par session est une CONTRAINTE, pas une indication: c'est ce que
  // l'élève a ce soir-là. Le prompt le dit; ceci le vérifie, parce que mesuré
  // le 2026-08-06 il annonçait « about 30 minutes » et recevait une session de
  // 55. La marge de dix minutes n'est pas de la complaisance: une estimation de
  // cuisine à cinq minutes près n'existe pas, et signaler 62 contre 60 ferait
  // du bruit que personne ne lirait — ce qui finit par cacher les vrais 95.
  //
  // ⟳ 2026-09-01 — IL NE SE CONTENTE PLUS DE COMPTER. Un `issues` n'a aucun
  // lecteur côté écran: la session débordait, le fait partait en base, et la
  // personne découvrait la vraie durée devant ses casseroles. Le dépassement
  // est désormais RENDU (`session_overruns`), et `plan_rationale` en fait une
  // phrase — c'est la moitié « et il le DIT » de la décision du jour.
  //
  // ⚠️ LA LIGNE D'`issues` RESTE, ELLE NE DOUBLE PAS LA PHRASE. Elles ne
  // servent pas au même lecteur: `issues` se relit en base pour savoir si la
  // consigne mord, la phrase se lit à table. Retirer la première rendrait le
  // lot invérifiable en production.
  if (args.cookingTimeMin) {
    for (const session of cookingSessions) {
      if (session.totalMinutes === null) continue;
      if (session.totalMinutes > args.cookingTimeMin + 10) {
        sessionOverruns.push({
          day: session.day,
          minutes: session.totalMinutes,
          declared: args.cookingTimeMin,
        });
        issues.push(
          `cooking session on ${session.day} runs ${session.totalMinutes} min, ` +
          `but they said they have about ${args.cookingTimeMin}`,
        );
      }
    }
  }

  // ── UN LOT GARDÉ TROP LONGTEMPS — ⟳ LA RÈGLE A DÉMÉNAGÉ, LOT `L0-a` ─────
  //
  // ⛔ ELLE N'EST PLUS ICI, ET CE N'EST PAS UN OUBLI. Elle SIGNALAIT depuis la
  // queue de la fonction, sur le plan déjà assemblé; elle REFUSE maintenant, et
  // un refus se prononce dans la boucle des plats — sans quoi le plat aurait
  // déjà consommé le plafond et compté ses `honours_belief_keys` avant qu'on ne
  // le retire. Voir « ⟳ LOT `L0-a` · LA FENÊTRE DU CUIT » plus haut, et
  // `fridge_window.ts` pour la règle elle-même.
  //
  // ⚠️ `window` RESTE DÉFINIE ICI parce que `cookedAfterEating`, juste en
  // dessous, la lit. C'est la MÊME expression que `fridgeWindowDays` plus haut:
  // deux noms, une seule lecture, et aucune des deux ne recopie l'autre.
  const window = fridgeWindowDays;

  // ── FF-052 · UN JOUR DE BATCH SANS SESSION ───────────────────────────────
  // ON COMPTE, ON N'INVENTE PAS. C'est l'asymétrie délibérée avec `leftovers`
  // (qui, lui, RETIRE): on peut supprimer un plat qui n'aurait pas dû exister,
  // on ne peut pas inventer une session que le modèle n'a pas écrite —
  // fabriquer une préparation produirait une recette que personne n'a rédigée,
  // avec des quantités que personne n'a posées.
  //
  // Un `issues` compté est ce que ce dépôt fait des non-conformités du modèle,
  // et c'est ce qui dira, en production, si la consigne mord. Si elle ne mord
  // pas, c'est le PROMPT qu'il faut corriger, pas le parseur.
  //
  // Restreint à la FENÊTRE: réclamer une session un jour qu'on n'a pas demandé
  // de remplir produirait une issue sur chaque plan, pour toujours.
  for (const day of daysWithProperty(args.dayProperties, "batch_cook")) {
    if (args.daysToFill.length > 0 && !args.daysToFill.includes(day)) continue;
    if (preparations.some((p) => p.cookOn === day)) continue;
    issues.push(
      `${day} is a batch-cooking day -- no preparation was cooked there`,
    );
  }

  // ── UN LOT MANGÉ AVANT D'ÊTRE CUISINÉ ────────────────────────────────────
  // MESURÉ: fenêtre jeudi→dimanche, seul jour de cuisine déclaré encore
  // disponible le dimanche, et le modèle a fait puiser le déjeuner de JEUDI
  // dans un lot cuisiné le DIMANCHE. La consigne le dit maintenant; ceci le
  // VÉRIFIE, parce qu'une consigne de prompt n'est pas une garantie et que ce
  // dépôt a déjà payé plusieurs fois la différence.
  //
  // On SIGNALE, on ne réécrit pas: déplacer la session inventerait un jour de
  // cuisine que l'élève n'a pas déclaré, et retirer le plat lui prendrait un
  // repas. L'anomalie est nommée dans `issues`, qui est ce qu'on lit quand un
  // plan sort de travers.
  const orderOf = (day: string) => DAY_TOKENS.indexOf(day);
  /**
   * CETTE CUISSON TOMBE-T-ELLE APRÈS CE REPAS ?
   *
   * Les deux jours sont lus dans l'ordre de la FENÊTRE, pas du calendrier: un
   * plan jeudi→dimanche a jeudi en premier, et « lundi » y serait la semaine
   * suivante. Le repli calendaire ne sert qu'aux jetons hors fenêtre.
   *
   * ⚠️ EXTRAITE PARCE QUE DEUX RÈGLES LA POSENT MAINTENANT: « un lot mangé avant
   * d'être cuisiné » (juste en dessous) et « une boîte citée avant d'être
   * remplie » (LOT 4/C5). Deux copies de cette comparaison finiraient par
   * diverger sur la fenêtre courte, et c'est la seconde — la plus jeune — qui
   * garderait l'ancienne lecture.
   */
  const cookedAfterEating = (cookOn: string, eatDay: string): boolean => {
    const cookAt = window.indexOf(cookOn);
    const eatAt = window.indexOf(eatDay);
    return cookAt >= 0 && eatAt >= 0
      ? cookAt > eatAt
      : orderOf(cookOn) > orderOf(eatDay);
  };
  for (const dish of dishes) {
    if (!dish.day) continue;
    for (const use of dish.uses) {
      const prep = preparations.find((p) => p.id === use.preparationId);
      if (!prep?.cookOn || !dish.day) continue;
      if (cookedAfterEating(prep.cookOn, dish.day)) {
        issues.push(
          `"${dish.title}" (${dish.day}) eats from "${prep.title}", cooked on ` +
          `${prep.cookOn} -- after the meal`,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L26-0` · UNE BOUCHE, UN CONTENANT, PAR REPAS — L'ARÊTE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ MESURÉ LE 2026-08-22 SUR LES DIX PLANS NEUFS: `mouths_double` mord sur
  // QUATRE d'entre eux — 4 / 4 / 2 / 4, quatorze bouches servies deux fois au
  // même repas, et à chaque fois la MÊME: `fa68cbac…`, née 2011. Deux bacs, le
  // même contenu, la même casserole: 662 g pour une adolescente.
  //
  // ⛔ ET CE N'EST PAS UN DÉFAUT DE CONSIGNE. `boxSchemaBlock` se termine par
  // « And do NOT name the same person on two boxes of one meal », il sort dès
  // deux bouches et il a été SERVI. Le modèle l'a violée 14 fois sur 14. Une
  // règle qui ne vit que dans un prompt régresse sans que personne le voie.
  //
  // ⚠️ POURQUOI ICI ET PAS DANS `takeBox`. La porte ② refuse un nom deux fois
  // sur le MÊME couvercle (`seenMouths`), et rien de plus; le doublon, lui, se
  // forme à cheval sur DEUX plats de la même case — le plat de la table et le
  // plat dédié, ou les deux boîtes d'un échange mal composé. Il n'est visible qu'une fois tous les plats
  // gardés, donc après la boucle, et avant tout ce qui lit `dish.boxes`: la
  // réconciliation des grammes juste en dessous compterait sinon deux fois la
  // même part contre la même casserole.
  //
  // ⛔ LE COMPTEUR RESTE ARMÉ, ET C'EST LE POINT. `mouths_double` mesure
  // désormais ce que le MODÈLE rend, les `issues` disent ce que l'arête a
  // retiré, et `names_refused` porte l'écart. Remplacer le compteur par
  // l'arête rendrait un modèle qui régresse indiscernable d'un modèle qui
  // obéit.
  //
  // ⚠️ ON RETIRE UNE DÉCLARATION, JAMAIS UN GRAMME — posture de la porte ②bis,
  // mot pour mot. Et un couvercle qui perd son dernier nom TOMBE, comme celui
  // qui n'en avait aucun d'utilisable; il ne peut déshabiller personne, un nom
  // n'étant retiré que lorsqu'il reste ailleurs dans la même case.
  const onePerMouth = keepOneBoxPerMouth(dishes);
  if (onePerMouth.namesRemoved > 0) {
    for (const [d, dish] of dishes.entries()) dish.boxes = onePerMouth.boxesByDish[d];
    // ⚠️ LES COMPTEURS SUIVENT LA SORTIE. `names` est accumulé à la poussée du
    // couvercle; sans ces deux lignes il décrirait des noms que le plan ne
    // porte plus, et `names === (ce qu'on lit sur les bacs)` cesserait d'être
    // vérifiable de l'extérieur — le défaut exact que `box_counts` existe pour
    // ne pas avoir.
    boxNames -= onePerMouth.namesRemoved;
    boxNamesRefused += onePerMouth.namesRemoved;
    boxesRefused += onePerMouth.dropped.length;
    for (const removal of onePerMouth.removals) {
      issues.push(
        `${removal.cell}: ${JSON.stringify(removal.memberId)} was named on ` +
          `${removal.namedOn} boxes of one meal -- dropped from ` +
          `${JSON.stringify(removal.boxId)}, kept on ` +
          `${JSON.stringify(removal.keptBoxId)} (${removal.reason})`,
      );
    }
    for (const drop of onePerMouth.dropped) {
      issues.push(
        `${drop.cell}: box ${JSON.stringify(drop.boxId)} lost its last name to the ` +
          `one-box-per-mouth rule, dropped`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LA RÉCONCILIATION DES GRAMMES — LA PART D'UNE CASSEROLE, À TRAVERS SES REPAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE A CHANGÉ DE FORME AVEC L'UNITÉ, ET L'ARBITRAGE LE DEMANDE EN TOUTES
  // LETTRES. Une boîte ne pend plus à une casserole: elle porte un REPAS ENTIER,
  // toutes préparations confondues. La question « cette casserole suffit-elle ? »
  // se pose donc en SOMMANT la part de cette préparation à travers les repas qui
  // la reprennent — un `Σ boîtes de la préparation` n'a plus de sujet.
  //
  // ── COMMENT LA PART D'UNE CASSEROLE DANS UN REPAS SE CALCULE ─────────────
  // Le repas tire de N casseroles et sa boîte porte UN total. On le répartit au
  // PRORATA de ce que chaque reprise tire vraiment: `production / portions × le
  // nombre de portions reprises`, la seule grandeur du plan qui dise ce qu'une
  // reprise pèse. Un repas à une seule casserole rend le total tel quel, ce qui
  // est le cas majoritaire et le cas intuitif.
  //
  // ⛔ ET ON S'ABSTIENT DÈS QU'UN SEUL MORCEAU MANQUE. Un repas dont UNE des
  // casseroles n'est pas reconstructible ne se répartit pas: attribuer son total
  // aux autres les ferait toutes déborder, et on fabriquerait une `issue` nommée
  // sur des plans qui ont RAISON. Les préparations d'un tel repas passent en
  // `sum_unverifiable`, jamais en `sum_over`. C'est le patron des trois cas de
  // `gramsRaw`, un cran plus haut: on ne présente jamais « vérifié » ce qui est
  // « on ne sait pas ».
  //
  // ⛔ ON COMPTE ET ON NOMME, ON NE REJETTE JAMAIS. Retirer une part parce que la
  // somme dépasse choisirait à qui retirer sa portion, sur une arithmétique dont
  // ce module documente lui-même la bande d'erreur (±10-15 %). Le plan est écrit,
  // l'écart est nommé, et c'est un humain qui décide si ça doit devenir un refus.
  const produced = new Map<string, number | null>();
  for (const prep of preparations) {
    produced.set(prep.id, preparationReadyGrams(prep.ingredients, args.composition));
  }
  /** Ce que les repas en boîte tirent de chaque préparation, en grammes de prêt. */
  const drawnFromPrep = new Map<string, number>();
  /** Les préparations qu'un repas non répartissable a rendues invérifiables. */
  const unreconcilable = new Set<string>();
  /** Les préparations qu'au moins un repas en boîte reprend. */
  const boxedPreparations = new Set<string>();
  for (const dish of dishes) {
    if (dish.boxes.length === 0 || dish.uses.length === 0) continue;
    for (const use of dish.uses) boxedPreparations.add(use.preparationId);
    // ══ v4 · CHAQUE COMPOSANT NOMME SA CASSEROLE, DONC IL N'Y A PLUS DE
    //         PRORATA À FAIRE ═════════════════════════════════════════════
    //
    // ⚠️ C'EST LE SEUL ENDROIT DU LOT OÙ v4 SIMPLIFIE AU LIEU D'AJOUTER. La
    // difficulté de « un contenant par repas » était qu'un couvercle portait UN
    // total pour N casseroles, et qu'il fallait le répartir au prorata — donc
    // s'abstenir dès qu'une casserole n'était pas reconstructible. Un `item`
    // porte son `preparation_id`: l'attribution est EXACTE, et une casserole
    // illisible n'empêche plus de vérifier ses voisines.
    //
    // ⚠️ UN `item` À `preparationId: null` NE TIRE SUR AUCUNE FOURNÉE — il est
    // ajouté frais le jour même. L'attribuer à qui que ce soit ferait déborder
    // une casserole avec du pain acheté le matin.
    let legacyTotal = 0;
    for (const box of dish.boxes) {
      for (const item of box.items) {
        if (item.preparationId === null) continue;
        drawnFromPrep.set(
          item.preparationId,
          (drawnFromPrep.get(item.preparationId) ?? 0) + item.grams,
        );
      }
      legacyTotal += box.legacyTotalGrams ?? 0;
    }
    if (legacyTotal <= 0) continue;
    // ══ LE REPLI v2 · UN TOTAL POUR N CASSEROLES, RÉPARTI AU PRORATA ═════
    //
    // ⛔ ON S'ABSTIENT DÈS QU'UN SEUL MORCEAU MANQUE. Un repas dont UNE des
    // casseroles n'est pas reconstructible ne se répartit pas: attribuer son
    // total aux autres les ferait toutes déborder, et on fabriquerait une
    // `issue` nommée sur des plans qui ont RAISON.
    /** Ce que chaque reprise tire de sa casserole — le poids du prorata. */
    const weights: { preparationId: string; weight: number }[] = [];
    let unknown = false;
    for (const use of dish.uses) {
      const prep = preparationById.get(use.preparationId);
      const made = produced.get(use.preparationId) ?? null;
      if (!prep || made === null || prep.servingsMade <= 0) {
        unknown = true;
        continue;
      }
      weights.push({
        preparationId: use.preparationId,
        weight: (made / prep.servingsMade) * use.servings,
      });
    }
    const sumWeights = weights.reduce((sum, w) => sum + w.weight, 0);
    if (unknown || sumWeights <= 0) {
      for (const use of dish.uses) unreconcilable.add(use.preparationId);
      continue;
    }
    for (const w of weights) {
      drawnFromPrep.set(
        w.preparationId,
        (drawnFromPrep.get(w.preparationId) ?? 0) + legacyTotal * (w.weight / sumWeights),
      );
    }
  }
  let boxSumChecked = 0;
  let boxSumOver = 0;
  let boxSumUnverifiable = 0;
  for (const [p, prep] of preparations.entries()) {
    if (!boxedPreparations.has(prep.id)) continue;
    const made = produced.get(prep.id) ?? null;
    if (made === null || unreconcilable.has(prep.id)) {
      boxSumUnverifiable++;
      continue;
    }
    boxSumChecked++;
    const drawn = drawnFromPrep.get(prep.id) ?? 0;
    if (drawn > made * BOX_SUM_TOLERANCE_RATIO) {
      boxSumOver++;
      issues.push(
        `preparations[${p}]: the meals that take from "${prep.title}" hold ` +
          `${Math.round(drawn)} g but it makes about ${Math.round(made)} g ready -- ` +
          `the boxes cannot all be filled`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNE BOUCHE A UNE PART À CE REPAS, OU ELLE N'EN A PAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUI EST COMPTÉ ICI N'EST PAS LA FORME D'UNE BOÎTE, C'EST L'EXÉCUTABILITÉ
  // DU JEU DE BOÎTES. Les quatre portes du dessus valident qu'une boîte est bien
  // FORMÉE — un id unique, des bouches du roster, des grammes utilisables. Aucune
  // ne valide la propriété que la consigne énonce: « chaque personne attablée est
  // dans exactement une boîte de ce repas ».
  //
  // ⚠️ C'EST LE DÉFAUT N°1 DU RUN `76be8ce3`, ET IL SE COMPTE ICI. Huit boîtes
  // sur seize n'atteignaient personne, et **toutes celles de la seconde bouche**:
  // Christèle n'aurait eu de boîte à AUCUN repas. Le compteur d'alors regardait
  // la casserole, jamais la bouche, et affichait 100 %.
  //
  // ⚠️ LA POPULATION EST LA **CASE** (jour × moment), PAS LE PLAT. Sur une case
  // dédiée il y a deux plats — celui de la table et celui d'une bouche — et deux
  // boîtes: chacun est dans UNE des deux, et lire plat par plat déclarerait
  // chacun « oublié » par l'autre. C'est la case qui est le repas.
  //
  // ⛔ ON COMPTE ET ON NOMME, ON NE REJETTE JAMAIS — posture de tout le lot.
  const boxedCells = new Map<string, { boxes: number; byMouth: Map<string, number>; heldOff: Set<string> }>();
  for (const [d, dish] of dishes.entries()) {
    if (dish.boxes.length === 0) continue;
    // ⚠️ UN PLAT SANS MOMENT VAUT POUR LA JOURNÉE, ET UN PLAT SANS JOUR POUR LA
    // FENÊTRE. Sa clé est donc ce qu'il porte, sans rien inventer: deux plats
    // sans case ne se comparent qu'entre eux.
    const key = `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
    const cellState = boxedCells.get(key) ??
      { boxes: 0, byMouth: new Map<string, number>(), heldOff: new Set<string>() };
    // ⚠️ LES CONTENANTS, PAS LES PLATS — v4. Un repas en produit N, un par
    // groupe: compter les plats ferait lire « une boîte » sur une case qui en
    // porte quatre.
    cellState.boxes += dish.boxes.length;
    for (const box of dish.boxes) {
      for (const memberId of box.memberIds) {
        cellState.byMouth.set(memberId, (cellState.byMouth.get(memberId) ?? 0) + 1);
      }
    }
    for (const held of keptBoxHeldOff[d] ?? []) cellState.heldOff.add(held.memberId);
    boxedCells.set(key, cellState);
  }
  let boxMouthSlots = 0;
  let boxMouthsUnboxed = 0;
  let boxMouthsDouble = 0;
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ UNE BOUCHE TENUE DEHORS EST UNE BOUCHE SANS BOÎTE (2026-09-04)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ce bloc SAUTAIT les bouches que la ceinture avait retirées, et retranchait
  // même leur part du dénominateur (`mouth_slots`). L'intention était bonne: ne
  // pas accuser le modèle d'un trou que le moteur venait de creuser.
  //
  // Sa conséquence ne l'était pas. Mesuré le 2026-09-04 sur un plan vivant:
  // cinq repas où la même bouche n'avait AUCUNE boîte — quatre plats de
  // lentilles qu'elle avait demandé d'éviter — et `mouths_unboxed: 0`. Le trou
  // existait, dans l'assiette de quelqu'un, et le plan se lisait vert.
  //
  // La cause N'EXCUSE PLUS, elle S'ÉCRIT à côté du constat. Qui répare est une
  // autre question, et elle a désormais son module (`meals_delivered.ts`).
  for (const [key, cellState] of boxedCells) {
    boxMouthSlots += boxMembers.size;
    for (const memberId of boxMembers) {
      const inBoxes = cellState.byMouth.get(memberId) ?? 0;
      if (inBoxes === 1) continue;
      // ⚠️ L'IDENTIFIANT, PAS LE PRÉNOM, et c'est un choix mesuré: ce parseur ne
      // reçoit QUE des ids (`boxMemberIds`), et les prénoms vivent dans
      // l'enveloppe foyer. Les faire descendre jusqu'ici demanderait un second
      // paramètre requis et ses quarante-neuf sites de test, pour une chaîne que
      // personne ne lit à l'écran. La jointure vers `household_members.
      // display_name` se fait en SQL.
      if (inBoxes === 0) {
        boxMouthsUnboxed++;
        issues.push(
          `${key}: ${JSON.stringify(memberId)} has no box at that meal` +
            (cellState.heldOff.has(memberId)
              ? " -- held off it by their declared line"
              : ""),
        );
        continue;
      }
      boxMouthsDouble++;
      issues.push(
        `${key}: ${JSON.stringify(memberId)} is named on ${inBoxes} boxes of one ` +
          `meal -- two containers for one person`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LA POPULATION QUE `mouth_slots` EXCLUT — nommée le 2026-08-23.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mouth_slots` se prend sur les cases qui portent AU MOINS UN contenant, et
  // c'est sa définition écrite, pas un défaut: une case sans contenant n'a rien
  // à réconcilier. Mais l'exclusion, elle, ne se comptait nulle part — et
  // `boxDeliveryState` rend `served` dès que `with_box === meals`, où `meals` ne
  // compte déjà que les plats qui prélèvent sur une fournée.
  //
  // ── CE QUE ÇA A CACHÉ, MESURÉ LE 2026-08-23 SUR UN PLAN FOYER RÉEL ────────
  // Sept plats, cinq boîtés, trois bouches. Deux petits-déjeuners assemblés le
  // jour même n'avaient AUCUN contenant — ce qui est LÉGITIME (« A dish that
  // cooks from scratch on the day has no boxes ») — mais les six parts qu'ils
  // représentent (2 cases × 3 bouches) étaient hors dénominateur. Le plan
  // rendait `mouths_unboxed: 2` et `delivery: "served"`, et rien ne disait que
  // deux repas sur sept n'étaient dimensionnés pour personne.
  //
  // ⛔ CE N'EST PAS UN DÉFAUT, C'EST UNE ABSTENTION — et la règle du dépôt est
  // qu'elle se compte au lieu de se déguiser en résolution. Un lecteur qui veut
  // savoir « quelle part de la fenêtre le protocole des contenants gouverne »
  // a maintenant les deux nombres côte à côte, sans qu'aucun des deux ne change
  // de sens.
  //
  // ⚠️ AUCUNE `issue` N'EST POUSSÉE ICI. Un petit-déjeuner assemblé le matin est
  // le cas nominal, et l'annoncer comme un manque ferait exactement ce que la
  // garde du roster vient de retirer sur la lane individuelle.
  const cellsWithBox = new Set(boxedCells.keys());
  const cellsNoBox = new Set<string>();
  for (const dish of dishes) {
    const key = `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
    if (!cellsWithBox.has(key)) cellsNoBox.add(key);
  }

  // ── C2 ④ · LES CASES QUE PERSONNE NE REMPLIT ────────────────────────────
  //
  // MESURÉ DEUX FOIS LE 2026-08-12: les cinq petits-déjeuners du foyer sont
  // tombés d'un coup parce qu'un plat citait « whey protein 90 g », et la seule
  // trace était la ligne du plat REJETÉ. « Ce plat est tombé » et « il n'y a
  // plus de petit-déjeuner de la semaine » ne sont pas la même information, et
  // c'est la seconde qu'on lit quand on ouvre son plan.
  //
  // ⚠️ CONSTAT, JAMAIS RÉPARATION. On ne recompose pas la case: choisir quoi y
  // mettre est une décision de produit que personne n'a prise, et l'inventer ici
  // écrirait une recette que personne n'a rédigée. Même posture, mot pour mot,
  // que « un jour de batch sans session » vingt lignes plus haut.
  //
  // GARDÉ SUR `clean`, comme les plats: quand le verrou de sortie a vidé le
  // plan entier, annoncer vingt et une cases vides serait un bruit qui
  // masquerait le seul fait utile (l'allergène).
  //
  // UNE SEULE `issue` AGRÉGÉE, et la liste STRUCTURÉE à côté: vingt et une
  // lignes noieraient les constats utiles, et un `issues.length` qui explose
  // change ce qu'un lecteur voit en premier.
  const emptySlots = clean
    ? emptySlotsIn({
      days: args.daysToFill,
      cookOnlyDay: args.cookOnlyDay,
      rhythm: args.eatingRhythm,
      dishes,
      awayDays: args.awayDays,
      fixedIntakes: args.fixedIntakes,
    })
    : [];
  if (emptySlots.length > 0) {
    issues.push(`empty_slots: ${emptySlotsLine(emptySlots)}`);
  }

  // ── LOT 2 · LE COMPTEUR DU GESTE DU JOUR J ──────────────────────────────
  //
  // Calculé ICI, une seule fois, sur les tableaux FINAUX — donc sur exactement
  // la population que le plan porte. `declared` se lit sur la sortie,
  // `invalid`/`minutes_missing` sur le tableau parallèle qui a suivi les mêmes
  // `splice`: les quatre nombres décrivent les mêmes lignes.
  //
  // GARDÉ SUR `clean`, comme les plats eux-mêmes: quand le verrou de sortie a
  // vidé le plan, annoncer « 6 plats, 5 déclarés » sur un plan qui n'a plus
  // aucun plat serait un chiffre faux sur une ligne réelle.
  const sameDayCounts = clean
    ? {
      dishes: dishes.length,
      declared: dishes.filter((d) => d.sameDay !== null).length,
      invalid: keptSameDayFaults.filter((f) => f.invalid).length,
      minutes_missing: keptSameDayFaults.filter((f) => f.minutesMissing).length,
    }
    : { dishes: 0, declared: 0, invalid: 0, minutes_missing: 0 };

  // LOT 3C — MÊME DISCIPLINE, MÊME POPULATION, MÊME GARDE `clean`. `attributed`
  // se lit sur la sortie (`memberId`), `declared`/`refused` sur le tableau
  // parallèle qui a suivi les mêmes `splice`.
  const dishOwnerCounts = clean
    ? {
      dishes: dishes.length,
      declared: keptOwnerFacts.filter((f) => f.declared).length,
      attributed: dishes.filter((d) => d.memberId !== null).length,
      refused: keptOwnerFacts.filter((f) => f.refused).length,
      // ⚠️ ACCUMULÉ, PAS LU SUR LA SORTIE — et il le faut: ces plats ne sont
      // plus là. C'est la seule exception aux quatre nombres ci-dessus, et elle
      // est nommée dans le type.
      refused_dropped: ownerRefusedDropped,
    }
    : { dishes: 0, declared: 0, attributed: 0, refused: 0, refused_dropped: 0 };

  // L7 ③ — MÊME DISCIPLINE, MÊME POPULATION, MÊME GARDE `clean`. `kept` se lit
  // sur la SORTIE (`name !== null`), `declared`/`refused` sur le tableau
  // parallèle qui a suivi les mêmes `splice`: les trois décrivent les mêmes
  // lignes, et `declared === kept + refused` est vérifiable de l'extérieur.
  const nameCounts = clean
    ? {
      dishes: dishes.length,
      declared: keptNameFacts.filter((f) => f.declared).length,
      kept: dishes.filter((d) => d.name !== null).length,
      refused: keptNameFacts.filter((f) => f.refused).length,
    }
    : { dishes: 0, declared: 0, kept: 0, refused: 0 };

  // ── LA VARIÉTÉ DES ANCRES PROTÉIQUES ────────────────────────────────────
  //
  // ⚠️ SUR LES PLATS **PLIÉS**, préparations comprises. En batch cooking la
  // protéine n'est PAS dans le plat: le plat dit « une portion du poulet de
  // dimanche », et le kilo de cuisses vit dans la préparation. Compter les
  // seuls `dish.ingredients` rendrait `distinct: 0` sur un plan qui tourne
  // pourtant sur une seule ancre — c'est-à-dire le contraire de ce qu'on
  // mesure. C'est la cicatrice de `foldPreparationsIntoDishes`, à la lettre:
  // « 51 % de la protéine hors des plats ».
  //
  // ⚠️ MÊME GARDE `clean` que les deux compteurs voisins, et `composition`
  // absent rend des zéros: on ne prétend pas qu'un plan n'a pas d'ancre parce
  // qu'on n'a pas su lire.
  const proteinSourceCounts = (() => {
    if (!clean || !args.composition) {
      return { distinct: 0, dishes_with: 0, dishes: 0 };
    }
    const index = args.composition;
    const set = new Set<string>(PROTEIN_SOURCES);
    const byId = new Map(preparations.map((p) => [p.id, p]));
    const groups = new Set<string>();
    let dishesWith = 0;
    for (const dish of dishes) {
      // ⟳ LOT A (2026-09-11) — LES LIGNES, PAS LEURS LIBELLÉS. Ce compteur
      // aplatissait les ingrédients en `string[]` puis les résolvait par le
      // terme: une ancre protéique dont le libellé français n'a pas d'alias ne
      // comptait pas, alors que sa ligne portait un identifiant vérifié. Le
      // plan sortait « moins varié » qu'il ne l'est.
      const lignes: DishIngredient[] = [
        ...dish.ingredients,
        ...dish.uses.flatMap((u) => byId.get(u.preparationId)?.ingredients ?? []),
      ];
      let has = false;
      for (const ligne of lignes) {
        const ref = resolveCompositionLine(index, ligne).ref;
        if (!ref || !set.has(String(ref.foodGroupRef))) continue;
        groups.add(String(ref.foodGroupRef));
        has = true;
      }
      if (has) dishesWith++;
    }
    return {
      distinct: groups.size,
      dishes_with: dishesWith,
      dishes: dishes.length,
    };
  })();

  // ── LE COMPTEUR DES BOÎTES ──────────────────────────────────────────────
  //
  // MÊME DISCIPLINE, MÊME GARDE `clean` que les deux du dessus: quand le verrou
  // de sortie a vidé le plan, annoncer « 12 repas, 12 boîtes » sur une ligne qui
  // n'en porte plus aucune serait un chiffre faux sur une ligne réelle.
  //
  // ⚠️ `meals` SE LIT SUR LA SORTIE, PAS SUR LA DEMANDE. Le dénominateur est la
  // population des plats GARDÉS qui prélèvent sur une préparation — la seule à
  // qui la consigne promet une boîte. Un plat cuisiné de zéro n'a rien de pesé
  // d'avance, et l'inclure ferait lire un défaut sur l'état correct.
  const boxedMeals = dishes.filter((d) => d.uses.length > 0);
  // ══════════════════════════════════════════════════════════════════════════
  // COMBIEN DE CONTENANTS CE PLAN DEVAIT PRODUIRE — DÉRIVÉ SANS LE MODÈLE
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     groupes(repas) = { chaque bouche à objectif, SEULE }
  //                    ∪ partition( le reste, par LIGNE que CE plat mord )
  //
  // ⛔ C'EST LE DÉNOMINATEUR DU COMPTEUR PRINCIPAL, et il ne lit RIEN de ce que
  // le modèle a rendu sur les boîtes: seulement le roster, les objectifs, les
  // lignes déclarées et les plats gardés. Sans lui, `boxes: 0` est indiscernable
  // d'un foyer où personne ne demande de pesée — c'est-à-dire qu'un lot désarmé
  // ressemble exactement à un lot qui marche.
  //
  // ⚠️ IL SURCOMPTE LA PRÉSENCE, ET C'EST DIT ICI PLUTÔT QUE CACHÉ. Le roster
  // d'un repas est le foyer ENTIER: si Christèle dîne dehors jeudi, le contenant
  // commun rétrécit mais le nombre de GROUPES ne bouge pas — sauf si elle était
  // seule de sa ligne, auquel cas l'attendu est trop haut d'une unité. La
  // présence par bouche vit dans l'enveloppe foyer et ne descend pas jusqu'ici.
  // C'est une borne HAUTE nommée, exactement comme `mouth_slots`, pas un
  // dénominateur inventé.
  //
  // ⚠️ ET IL SE CALCULE SUR LES PLATS **GARDÉS** qui prélèvent sur une
  // préparation — la même population que `meals`. Un plat évincé par le plafond
  // ne promettait plus rien.
  //
  // ⟳ LOT `L6′-a` — ⛔ ET IL SURCOMPTAIT UNE SECONDE FOIS, CELLE-LÀ RÉPARABLE:
  // il ajoutait `weighedMembers.size + lines.size` sur TOUT plat gardé, **sans
  // jamais regarder `dish.memberId`**. Un plat dédié à Anouk réclamait donc les
  // trois groupes du foyer entier, et le plat de la TABLE de la même case la
  // réclamait une seconde fois alors qu'elle n'en mange pas.
  //
  //     `3c781a71`: 24 plats boîtés = 12 dédiés + 12 de table, et les 12 de
  //     table sont dans la MÊME case qu'un dédié (12/12, mesuré en SQL).
  //     avant : 24 × (2 + 1)                                   = 72
  //     après : 12 × 1 (Anouk seule) + 12 × 2 (Malo, puis le reste) = 36
  //     rendu par le modèle                                       = 38
  //
  // ⇒ **38/72 = 52,8 %** devient **38/36 = 105,6 %**: le modèle ne « n'obéit
  // qu'à moitié », il rend PLUS de contenants que la partition n'en demande. Un
  // dénominateur faux dans le sens PESSIMISTE envoie un lot chercher un défaut
  // là où il n'y en a pas.
  //
  // ⚠️ QUI PART EST DÉCIDÉ PAR LE MODULE PUR, PAS ICI, et la partition en
  // LIGNES reste ici: c'est le seul endroit qui a `scanMealForRegime` et les
  // préparations. Le module rend des ensembles de bouches, ce fichier y
  // intersecte ses groupes.
  let boxesExpected = 0;
  /** Les bouches que chaque plat nourrit — `null` sur un plat non boîté. */
  const fedByDish = mouthsFedByDish(
    dishes.map((d): ExpectedDish => ({
      day: d.day,
      slot: d.slot,
      memberId: d.memberId,
      boxable: d.uses.length > 0,
    })),
    boxMembers,
  );
  if (boxMembers.size > 0) {
    for (const [d, dish] of dishes.entries()) {
      const fed = fedByDish.fedByDish[d];
      if (fed === null) continue;
      /** Le reste DE CE PLAT: ses mangeurs, moins les bouches à objectif. */
      const restMembers = [...fed].filter((id) => !weighedMembers.has(id));
      // ⚠️ LA PARTITION EST CELLE DE **CE PLAT**. Un végétarien et un omnivore
      // qui mangent le même dahl sont dans le MÊME bac: c'est le plat qui
      // décide, jamais l'étiquette de la personne.
      //
      // ⟳ ÉCHANGE (2026-09-04) — LE DÉGOÛT PARTITIONNE AUSSI. Un régime n'est pas
      // la seule ligne qui sépare un bac: « Marc n'aime pas les lentilles »
      // demande à Marc son propre contenant sur un plat de lentilles, exactement
      // comme un régime. Sans cette moitié, la boîte d'échange que la consigne
      // réclame arrivait EN TROP au dénominateur, et un plan correct se lisait
      // comme un modèle qui sur-produit.
      //
      // ⚠️ LA CLÉ EST LA RÈGLE, PAS LA BOUCHE. Deux personnes qui évitent la
      // même chose partagent un bac; deux personnes qui évitent des choses
      // différentes en ont deux. `because` porte le texte de la règle, donc il
      // groupe exactement comme il faut.
      //
      // ⚠️ LE RÉGIME PRIME, comme à la ceinture: elle le vérifie en premier et
      // sort avant l'exclusion. Deux clés pour une seule bouche compteraient un
      // bac fantôme.
      const lines = new Set<string>();
      for (const memberId of restMembers) {
        const regime = mouthRegimes.get(memberId);
        if (regime) {
          const breach = scanMealForRegime(
            regime,
            { title: dish.title, method: dish.method, ingredients: dish.ingredients },
            dish.uses,
            preparationById,
          );
          if (breach.matched !== null) {
            lines.add(regime);
            continue;
          }
        }
        const avoided = mouthExclusions.get(memberId);
        if (avoided) {
          const bite = dishBitesExclusion({
            dish: {
              title: dish.title,
              method: dish.method,
              ingredients: dish.ingredients,
            },
            uses: dish.uses,
            preparationById,
            terms: avoided,
            surface: "ingredients",
            // ⚠️ LE PLAT PORTE SON MOMENT ICI: on relit un plan déjà écrit.
            slot: dish.slot ?? null,
          });
          if (bite.matched !== null) {
            lines.add(`avoid:${bite.because ?? bite.matched}`);
            continue;
          }
        }
        lines.add("");
      }
      let weighedHere = 0;
      for (const memberId of weighedMembers) if (fed.has(memberId)) weighedHere++;
      boxesExpected += weighedHere + lines.size;
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LES CONTENANTS DUS À UNE PERSONNE SEULE — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE COMPTE EST DÉRIVABLE, DONC LE COMPTEUR EST OBLIGATOIRE. Un plat qui
  // puise dans une casserole a été pesé d'avance: il lui faut un contenant.
  // Un plat cuisiné de zéro le jour même n'en a pas. Le dénominateur est donc
  // « les plats qui puisent », et sans lui `boxes: 0` serait le même zéro pour
  // « le modèle n'a rien écrit » et pour « ce plan n'a aucun lot » — c'est le
  // zéro que ce dépôt paie en boucle.
  //
  // ⚠️ LA BRANCHE EST EXCLUSIVE DE CELLE DU DESSUS: `boxMembers.size` vaut zéro
  // sur cette lane, et `soloBoxes` est faux sur l'autre. Les additionner
  // gonflerait `expected` d'un protocole que le prompt n'a pas servi.
  if (args.soloBoxes && boxMembers.size === 0) {
    for (const dish of dishes) if (dish.uses.length > 0) boxesExpected += 1;
  }
  // ⛔ CE QUI SE NOMME AU LIEU DE SE TAIRE. Les deux cas ci-dessous ne devraient
  // pas arriver — le parseur valide déjà `for_member_id` contre la liste fermée
  // des porteurs de plat — et c'est exactement pour ça qu'ils se comptent: ils
  // signifieraient que deux listes décrivant la même table ont divergé, et
  // `expected` mentirait sans que rien ne le dise.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE ROSTER EST LA PORTE, ICI AUSSI — posée le 2026-08-23.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mouthsFedByDish` est appelée INCONDITIONNELLEMENT vingt lignes plus haut,
  // et la garde `if (boxMembers.size > 0)` se referme AVANT ces deux boucles.
  // Or la lane SOLO passe `boxMemberIds: []` exprès (`generate-meal-v1/index.ts`)
  // — le protocole des contenants n'existe que pour départager deux bouches.
  // Avec un roster vide, `mouthsFedByDish` ne trouve personne à nourrir, donc
  // CHAQUE plat de table tombe dans `sharedFedNobody`.
  //
  // Mesuré le 2026-08-23 sur sept plans solo sur sept: jusqu'à SEPT fois par
  // plan, « the table's dish feeds nobody -- every mouth has a dish of its own »
  // pour quelqu'un qui vit seul. Le message décrit une table qui n'existe pas,
  // et il noie la liste d'`issues` là où elle porte de vraies alertes.
  //
  // ⚠️ C'EST EXACTEMENT LA PORTE QUE `boxDeliveryState` A DÉJÀ, cinquante
  // lignes plus bas (`roster: boxMembers.size`, avec sa propre cicatrice écrite:
  // « Sans cette entrée, l'alarme sonnerait sur CHAQUE plan solo pour une
  // consigne jamais servie »). Elle manquait ici, et pour la même raison elle
  // manquait en silence: une issue de plus ne fait rien échouer.
  //
  // ⛔ LA GARDE PORTE SUR LE ROSTER, PAS SUR LE CONTENU. Filtrer les cellules
  // une par une masquerait le vrai cas — une table de plusieurs bouches dont
  // un plat commun ne nourrit personne — qui est précisément ce que ces deux
  // boucles existent pour dire.
  if (boxMembers.size > 0) {
    for (const cell of fedByDish.sharedFedNobody) {
      issues.push(
        `${cell}: the table's dish feeds nobody -- every mouth has a dish of its own`,
      );
    }
    for (const memberId of fedByDish.dedicatedOffRoster) {
      issues.push(
        `dedicated dish for ${JSON.stringify(memberId)}, who is not on the box ` +
          `roster -- nobody was excluded from the shared pot for it`,
      );
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L6′-b` — CE QUE `boxes: 0` VEUT DIRE. DEUX ZÉROS, DEUX CAUSES.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA FICHE CONCLUAIT AU TIRAGE SUR DEUX PLANS. SUR DIX, ET EN LISANT LES
  // SORTIES BRUTES DU MODÈLE (`llm_raw_response_events`), LES DEUX ZÉROS DU
  // 2026-08-22 ONT DEUX CAUSES DISTINCTES, ET AUCUNE N'EST LE HASARD:
  //
  //   · `09240cb5` — la sortie brute porte `"preparations": []`. Douze plats,
  //     aucun `uses` non vide. **Aucun contenant n'était DÛ**: `boxes: 0` et
  //     `expected: 0` sont tous les deux JUSTES.
  //   · `5058be6a` — six préparations, vingt-six plats qui y prélèvent, et
  //     **zéro clé `boxes`**, alors que le modèle parle des boîtes EN TOUTES
  //     LETTRES onze fois dans ses `method` et ses `run_through`. Le parseur n'a
  //     rien refusé (`refused: 0`, `names_refused: 0`, `items_refused: 0`).
  //     ⇒ **le modèle a obéi en PROSE et sauté la clé de schéma.**
  //
  // ⛔ ET UN CHIFFRE NE PEUT PAS PORTER ÇA. `0` est aujourd'hui le même sur les
  // deux, et les deux appellent des corrections OPPOSÉES. Le nom, lui, le peut.
  // ⚠️ CE LOT NE RÉPARE PAS LE TAUX — décision de la vague D. Il rend l'absence
  // visible, et il ne touche NI un gramme, NI un couvercle, NI un nom: aucune
  // bouche ne peut être déshabillée par ici, la mineure comprise.
  const boxDelivery = boxDeliveryState({
    clean,
    // ⛔ LE ROSTER, ET IL EST LA PORTE. La lane SOLO passe `boxMemberIds: []`
    // EXPRÈS — le protocole des contenants n'existe que pour départager deux
    // bouches — et son plan en base porte `{meals: 10, with_box: 0}`. Sans
    // cette entrée, l'alarme sonnerait sur CHAQUE plan solo pour une consigne
    // jamais servie.
    // ⟳ 2026-09-01 — `1` SUR LA LANE SOLO, et c'est ce qui ARME l'alarme. Le
    // pavé ci-dessus décrivait un état révolu: la lane individuelle sert
    // désormais `SOLO_BOX_BLOCK`, donc un plan solo sans un seul contenant est
    // une consigne servie et non suivie — exactement ce que cette alarme
    // existe pour dire. La laisser à zéro l'aurait rendue muette sur la moitié
    // du produit, pour un motif qui n'était plus vrai.
    roster: args.soloBoxes && boxMembers.size === 0 ? 1 : boxMembers.size,
    meals: boxedMeals.length,
    withBox: boxedMeals.filter((d) => d.boxes.length > 0).length,
  });
  // ⟳ 2026-09-08 — CE QUE CETTE LIGNE MESURE, ET CE QU'ELLE NE MESURE PAS.
  //
  // ⛔ ELLE EST CALCULÉE DANS `parseGeneratedMeal`, donc sur LA SORTIE DU
  // MODÈLE — pas sur le plan livré. L'ancienne formulation (« NOT ONE carries
  // a box », « zero came back ») décrivait le PLAN, et c'est faux dès qu'un
  // chemin déterministe autore les contenants en aval: `applySizing`
  // (`portion_sizing.ts`, chemin `portion_v1`) fabrique les boîtes lui-même,
  // avec des ids `box_<jour>_<créneau>_<rang>`, et la lane foyer les recolle
  // dans `meal.dishes` AVANT le verrou des règles de maison.
  //
  // Mesuré le 2026-09-08, brouillon `65238bf8` (foyer d'une bouche, 1 jour):
  // cette ligne annonçait « 3 containers were owed, zero came back » pendant
  // que les QUATRE plats du plan livré portaient chacun leur boîte, grammes et
  // destinataire compris (`box_wed_lunch_2`, 700 g). Un lecteur — humain ou
  // agent — conclut « le plan est cassé » sur un plan correct.
  //
  // ⚠️ ON NE DÉSARME PAS L'ALARME, ON LA RENOMME. Le fait qu'elle porte reste
  // vrai et reste utile: la consigne `SOLO_BOX_BLOCK` a été servie au modèle,
  // et le modèle ne l'a pas suivie. C'est le signal qui dira s'il faut
  // corriger le PROMPT — précédent explicite du run `5058be6a`, où le modèle
  // avait obéi EN PROSE et sauté la clé de schéma. La taire rendrait cette
  // régression invisible.
  //
  // ⛔ CE QUI RESTE OUVERT, NOMMÉ: les compteurs `boxes` de la réponse sont
  // eux aussi figés à la lecture, donc un plan dont les boîtes sont autorées
  // en aval sort avec `with_box: 0`. Les recalculer après `applySizing`
  // demande de décider où vit la source de vérité des contenants — ce lot ne
  // le fait pas, et ne touche NI un gramme, NI un couvercle, NI un nom.
  if (boxDelivery === "none_delivered") {
    issues.push(
      `model_returned_no_box: 0/${boxesExpected} -- ${boxedMeals.length} meals ` +
        `take from a batch and the model emitted no box key; a deterministic ` +
        `sizing path may still author them downstream, so this line is about ` +
        `the MODEL's output, not about the shipped plan`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LE CONGÉLATEUR, COMPTÉ — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DEUX NOMBRES QUI NE MESURENT PAS LA MÊME CHOSE, ET AUCUN NE SORT SEUL.
  //   · `uses_kept_freezer` — la consigne MORD-ELLE ? Sans son dénominateur,
  //     « 7 parts congelées » ne veut rien dire: sur 7 c'est un plan tout au
  //     congélateur, sur 140 c'est du bruit. Le dépôt a déjà écrit deux fois
  //     qu'un compteur sans dénominateur est un compteur qui ment.
  //   · `freezer_claimed_without_one` — le modèle a-t-il inventé un appareil ?
  //     C'est une NON-CONFORMITÉ, pas une mesure d'adoption, et la confondre
  //     avec la première ferait passer une invention pour une obéissance.
  //
  // ⚠️ ILS SORTENT MÊME À ZÉRO SUR LE NUMÉRATEUR, tant qu'il y a un
  // dénominateur: `0/14` dit « le champ existe et personne ne l'écrit », ce qui
  // est le signal qui dira, en production, s'il faut corriger le PROMPT plutôt
  // que le parseur. Se taire à zéro rendrait un lot débranché indiscernable
  // d'un lot que le modèle n'utilise pas.
  if (keptTotal > 0) {
    issues.push(`uses_kept_freezer: ${keptDeclared}/${keptTotal}`);
  }
  if (freezerWithoutOne > 0) {
    issues.push(
      `freezer_claimed_without_one: ${freezerWithoutOne}/${freezerClaimLinks} ` +
        `batch links -- kept on the ${MAX_FRIDGE_DAYS}-day fridge window`,
    );
  }

  const boxCounts = clean
    ? {
      meals: boxedMeals.length,
      with_box: boxedMeals.filter((d) => d.boxes.length > 0).length,
      boxes: dishes.reduce((n, d) => n + d.boxes.length, 0),
      expected: boxesExpected,
      /** ⟳ `L6′-b` — le NOM du zéro. Voir le bloc juste au-dessus. */
      delivery: boxDelivery,
      refused: boxesRefused,
      names: boxNames,
      names_refused: boxNamesRefused,
      items: boxItems,
      /** ⟳ 2026-09-13 — la FORME par laquelle chaque composant gardé a été pesé. */
      items_in_grams: boxItemsInGrams,
      items_from_ingredient: boxItemsFromIngredientForm,
      items_refused: boxItemsRefused,
      capped: boxesCapped,
      legacy_folded: boxesLegacyFolded,
      preparations: preparations.length,
      sum_checked: boxSumChecked,
      sum_over: boxSumOver,
      sum_unverifiable: boxSumUnverifiable,
      mouth_slots: boxMouthSlots,
      mouths_unboxed: boxMouthsUnboxed,
      mouths_double: boxMouthsDouble,
      mouths_double_model: onePerMouth.mouthsFixed,
      cells_no_box: cellsNoBox.size,
      mouths_no_box_cell: cellsNoBox.size * boxMembers.size,
    }
    : {
      meals: 0,
      with_box: 0,
      boxes: 0,
      expected: 0,
      // ⚠️ `plan_emptied`, JAMAIS `no_batch_cooking`. Ici `meals` vaut zéro
      // parce que le verrou de sortie a vidé le plan, pas parce que ce foyer ne
      // cuisine rien d'avance — les confondre serait un chiffre faux sur une
      // ligne réelle, ce que la garde `clean` existe pour éviter.
      delivery: boxDelivery,
      refused: 0,
      names: 0,
      names_refused: 0,
      items: 0,
      items_in_grams: 0,
      items_from_ingredient: 0,
      items_refused: 0,
      capped: 0,
      legacy_folded: 0,
      preparations: 0,
      sum_checked: 0,
      sum_over: 0,
      sum_unverifiable: 0,
      mouth_slots: 0,
      mouths_unboxed: 0,
      mouths_double: 0,
      mouths_double_model: 0,
      cells_no_box: 0,
      mouths_no_box_cell: 0,
    };

  // ⛔ DÉTERMINISTE, LU SUR LA SORTIE FINALE. `amount` est déjà structuré depuis
  // FF-038: aucune prose n'est relue, aucun matcher n'existe ici. Et le calcul
  // se fait sur `dishes` — donc sur les plats GARDÉS, pas sur ceux que le
  // plafond a évincés en cours de boucle, ce que le compteur voisin
  // `structured_quantity_missing` ne sait pas faire.
  const dishQuantityCounts = clean
    ? {
      ingredients: dishes.reduce((n, d) => n + d.ingredients.length, 0),
      unquantified: dishes.reduce(
        (n, d) => n + d.ingredients.filter((ing) => ing.amount === null).length,
        0,
      ),
    }
    : { ingredients: 0, unquantified: 0 };

  return {
    dishes: clean ? dishes : [],
    preparations: clean ? preparations : [],
    cooking_sessions: clean ? cookingSessions : [],
    shopping_list: clean ? finalShopping : [],
    rejected_numeric: rejectedNumeric,
    rejected_aisles: rejectedAisles,
    empty_slots: emptySlots,
    session_overruns: clean ? sessionOverruns : [],
    same_day_counts: sameDayCounts,
    dish_owner_counts: dishOwnerCounts,
    name_counts: nameCounts,
    protein_sources: proteinSourceCounts,
    box_counts: boxCounts,
    // ⚠️ RENDUS HORS DE `clean`, ET C'EST DÉLIBÉRÉ — contrairement à
    // `box_counts`. Quand le verrou de sortie a vidé le plan, `boxes: 0` est
    // juste (il n'y a plus de boîte à compter). Mais « la ceinture de régime
    // n'a rien retiré » serait alors un MENSONGE sur ce qui s'est passé: elle a
    // bel et bien lu et retiré, et c'est ce qu'on veut savoir en relisant un
    // plan vide. Un compteur qui se tait quand la sortie est sale est un
    // compteur muet précisément le jour où on le consulte.
    fridge_window: fridgeWindow,
    regime_belt: regimeBelt,
    // ⛔ RENDU, PAS SEULEMENT COMPTÉ. Une ceinture dont les nombres ne sortent
    // pas du parseur est indiscernable d'une ceinture absente — et celle-ci
    // existe précisément parce qu'une exclusion inerte ressemblait trait pour
    // trait à une exclusion honorée.
    exclusion_belt: exclusionBelt,
    regime_refusals: [...regimeRefusedByPreparation.entries()].map((
      [preparation_id, ids],
    ) => ({ preparation_id, member_ids: [...ids] })),
    unquantified_dish_ingredients: dishQuantityCounts,
    // Gardé sur `clean` comme les plats eux-mêmes: relancer pour une ancre
    // quand la semaine entière vient d'être vidée par un allergène ferait
    // réparer la mauvaise chose, et à la deuxième sortie sale on aurait dépensé
    // deux générations pour rien.
    protein_anchor_missing: clean ? proteinAnchorMissing : [],
    /**
     * ⛔ INTERNE, JAMAIS PUBLIÉ. `null` quand la sortie est propre. Non nul, il
     * porte le plan que le verrou vient de vider ET l'endroit exact où il a
     * mordu — pour qu'une réparation puisse viser CETTE unité au lieu de
     * refaire les six repas. Ce n'est ni un aperçu, ni un plan activable: les
     * quatre tableaux publics restent vides.
     */
    unsafe_candidate: unsafeCandidate,
    issues,
    lock,
  };
}
