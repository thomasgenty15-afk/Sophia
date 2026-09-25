/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — L'AUDIT DU PLAN LIVRABLE. Ce qu'on a mesuré, et ce qu'on n'a PAS pu.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LES TROIS DÉFAUTS QUE CE MODULE FERME, MESURÉS LE 2026-09-11 ─────────
 *
 * ① **UN TITRE N'EST PAS UNE PORTION.** `final_gate.ok = true` sortait avec
 *   `energy: null`, `boxContract: null` et `energy_unmeasured: 1` — et DEUX
 *   cases (PERTE samedi déjeuner, GAIN vendredi dîner) avaient une recette,
 *   aucune boîte, aucune portion. « Le plat existe » et « la portion est
 *   calculée » sont deux contrôles distincts, et les confondre a servi deux
 *   repas vides.
 *
 * ② **LES COURSES SE CONTRÔLAIENT PAR DES MOTS.** Les 8 alertes
 *   `ingredient_not_bought` de la campagne sont des faux positifs de
 *   singulier/pluriel, nommément `citron`/`citrons`, `tomate`/`tomates`
 *   (PERTE) et `carotte`/`carottes`, `citron`/`citrons`, `oignon`/`oignons`,
 *   `pita complète`/`pitas complètes`, `pomme de terre`/`pommes de terre`,
 *   `tomate`/`tomates` (GAIN). La garde comparait `normalizePantryTerm` des
 *   deux côtés avec `covers`, une inclusion de chaîne ASYMÉTRIQUE: la ligne de
 *   courses devait être une SOUS-CHAÎNE de l'ingrédient, donc « citrons » ne
 *   couvrait pas « citron ». Et la **suffisance de la quantité** n'était
 *   contrôlée nulle part: vérifier la présence ne prouve pas qu'on en a acheté
 *   assez.
 *
 * ③ **UN CONTRÔLE INCOMPLET SORTAIT COMME UN SUCCÈS.** Le plancher protéique
 *   `envelopeFor` vaut 176 g pour Paul et 99 g pour Max; la seule journée
 *   complète et mesurable de Paul rend **126,1 g, soit −28 %** — et rien ne le
 *   refusait, ni même ne le disait.
 *
 * ── CE QUE CE MODULE EST ─────────────────────────────────────────────────
 * Il MESURE, à partir du payload EXACTEMENT tel qu'il part en base, et il rend
 * des lignes. Il ne juge pas: `final_plan_gate.ts` juge, à partir de ces
 * lignes. La séparation est celle que la garde impose déjà dans son en-tête —
 * « l'appelant MESURE, la garde COMPARE » — et elle a une raison technique:
 * la garde est typée pour tourner à l'ADOPTION, où l'index de composition
 * n'existe pas. Ce module-ci exige cet index; il ne peut donc pas vivre
 * dedans.
 *
 * ── ⛔ AUCUNE ARITHMÉTIQUE N'EST RÉÉCRITE ICI ────────────────────────────
 * Les grammes crus passent par `resolveIngredients` (ligne par ligne), les
 * kilocalories et les protéines par `boxNutrition`, les cibles par le contrat
 * du lot B. Une seconde arithmétique de la même grandeur diverge au premier
 * ajustement — c'est la cicatrice que `boxEnergies` / `dishSlices` porte déjà.
 *
 * ── ⛔ UNE VALEUR ABSENTE RESTE INCONNUE ─────────────────────────────────
 * Jamais zéro, jamais une quantité de stock inventée. Le plan l'écrit deux
 * fois: « ne pas inventer une quantité de stock si seule sa présence est
 * déclarée », « une conversion ou un conditionnement inconnu produit un
 * contrôle incomplet, pas un manque quantifié inventé ». Les cinq états de
 * `SHOPPING_COVER_STATES` existent pour que ces cas ne se confondent pas.
 *
 * PURE: no I/O, no clock, no randomness. Ne mute jamais son entrée.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  type CompositionUnit,
  COMPOSITION_UNITS,
  type LineRefRefusal,
  normalizeTerm,
  resolveIngredients,
} from "./food_composition.ts";
import {
  readEnergyBoxDishes,
  readEnergySideCourses,
  readIngredients,
  readPreparations,
} from "./plan_energy_read.ts";
import { boxNutrition } from "./mouth_energy.ts";
// ⟳ 2026-09-23 — L'ÉNERGIE D'UN À-CÔTÉ ET SA LIGNE DE COMPOSITION: une seule
// écriture, dans le module de l'énergie servie. Voir le pavé ② bis.
import { measureSideCourses, sideCompositionLine } from "./served_final.ts";
import {
  foodIdentityOf,
  isNonPurchasableIdentity,
} from "./shopping_identity.ts";

/**
 * ⟳ 2026-09-12 · C3 — `foodIdentityOf` A DÉMÉNAGÉ D'UN CRAN, SANS CHANGER.
 *
 * ⛔ UN SEUL CORPS, DEUX PORTES. `retry_merge.ts` en a besoin pour cesser de
 * jeter des lignes de courses par égalité de libellé ; l'importer d'ici aurait
 * tiré `mouth_energy.ts` et toute la mesure énergétique dans un module de
 * fusion. Le corps vit donc dans `shopping_identity.ts` et cette réexportation
 * garde intacts les appelants et les tests du lot E.
 */
export { foodIdentityOf };

// ═══════════════════════════════════════════════════════════════════════════
// ① LES TOLÉRANCES — écrites dans le plan, branchées ICI, et nulle part ailleurs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ±10 % PAR REPAS. Critère du plan (§ lot E, « Portions et nutrition »).
 *
 * ⛔ NE PAS L'ÉLARGIR POUR FAIRE PASSER UN BANC — le plan l'interdit en toutes
 * lettres, et c'est le seul geste qui rendrait ce module menteur sans changer
 * une ligne de son corps. Il est EXPORTÉ pour qu'un déplacement soit un commit
 * visible, jamais un littéral enfoui.
 *
 * ⚠️ PRIORITÉ AUX GARDES PLUS STRICTES: cette tolérance est un PLAFOND
 * d'acceptation, pas une autorisation. Les bornes de masse et le couloir de
 * densité du contrat (lot B) tiennent SIMULTANÉMENT — `cellStatusOf` ne
 * regarde qu'une case conforme aux trois.
 */
export const MEAL_ENERGY_TOLERANCE = 0.10;

/**
 * ±5 % PAR JOURNÉE **COUVERTE**. Même source.
 *
 * ⛔ « COUVERTE » EST LA MOITIÉ QUI COMPTE. Le dénominateur est
 * `coveredBudgetKcal` du contrat (lot B), c'est-à-dire la somme des cibles des
 * cases DEMANDÉES — jamais `dayTargetKcal`. Un vendredi qui ne porte que son
 * dîner ne doit pas la journée entière; le mesurer contre la journée rendrait
 * −65 % sur une fenêtre parfaitement composée.
 */
export const COVERED_DAY_ENERGY_TOLERANCE = 0.05;

export const ENERGY_TOLERANCES_SOURCE =
  "docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md § lot E";

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PESÉE D'UNE LIGNE — par les fonctions de production, une ligne à la fois
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE LIGNE PÈSE, ET POURQUOI ELLE NE PÈSE PAS.
 *
 * ⛔ CINQ ÉTATS, PAS UN `number | null`. Un `null` unique rendrait
 * indiscernables « le référentiel ne connaît pas ce mot » (→ curation
 * d'alias), « le modèle a écrit un identifiant faux » (→ consigne plus dure),
 * « la ligne est une pincée conventionnée » (→ rien à faire) et « l'unité est
 * illisible » (→ conversion manquante). Ce sont quatre corrections
 * différentes, et le dépôt paie en boucle les compteurs qui les fondent.
 */
export type LineWeight =
  | { kind: "measured"; grams: number }
  /** Pesée par la CONVENTION des condiments — une pincée, jamais un achat. */
  | { kind: "conventional" }
  /** Aliment connu, quantité illisible (unité comptée sans `unit_grams`, prose muette). */
  | { kind: "unreadable" }
  /** Le référentiel ne connaît pas ce libellé. */
  | { kind: "unresolved" }
  /** Un identifiant a été écrit, et il est refusé ou inventé. */
  | { kind: "refused"; refusal: LineRefRefusal };

/**
 * PÈSE UNE LIGNE PAR `resolveIngredients`, APPELÉE SUR ELLE SEULE.
 *
 * ⛔ UN TABLEAU D'UN ÉLÉMENT, ET C'EST DÉLIBÉRÉ. Réécrire ici l'enchaînement
 * `resolveCompositionLine → gramsRawOf → prose → condiment` ferait une SECONDE
 * arithmétique de la masse crue; elle divergerait au premier ajustement de
 * l'une des quatre étapes. Le coût est un appel par ligne (≈ 100 par plan),
 * payé une fois, hors de toute boucle chaude.
 *
 * ⚠️ LA CONVENTION DES CONDIMENTS EST ÉCARTÉE DE LA PESÉE D'ACHAT, et c'est
 * un arbitrage: `resolveIngredients` met bien la pincée dans `resolved` avec
 * ses 0,5 g, mais 0,5 g n'est PAS une quantité qu'on achète. Comparer « il en
 * faut 0,5 g » à « le paquet en contient 500 » ferait un verdict sur une
 * grandeur que personne n'a déclarée.
 */
export function weighLine(
  index: CompositionIndex | null,
  input: CompositionInput,
): LineWeight {
  if (!index) return { kind: "unreadable" };
  const res = resolveIngredients(index, [input]);
  if (res.refusedTerms.length > 0) {
    return { kind: "refused", refusal: res.refusedBy[0] ?? "ref_unknown" };
  }
  if (res.unresolvedTerms.length > 0) return { kind: "unresolved" };
  if (res.conventionalTerms.length > 0) return { kind: "conventional" };
  const first = res.resolved[0];
  if (first === undefined) return { kind: "unreadable" };
  return { kind: "measured", grams: first.gramsRaw };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② bis ⟳ 2026-09-23 — L'ÉNERGIE D'UN À-CÔTÉ: IMPORTÉE, JAMAIS RÉÉCRITE
// ═══════════════════════════════════════════════════════════════════════════
//
// Chantier « assiettes normales », flux F (plan
// `~/.claude/plans/lexical-gliding-lamport.md`). Un à-côté (entrée, fromage,
// dessert, pain) vit HORS des boîtes, dans `dishes[i].side_courses[]`: aucune
// de ses calories n'est dans `boxNutrition`. Sans sa mesure, la journée d'une
// personne perdrait jusqu'à 35 % de chaque déjeuner et de chaque dîner en
// silence — et elle se lirait « sous-nourrie » sur un plan juste.
//
// ⛔ UNE SEULE ARITHMÉTIQUE, DANS `served_final.ts`, ET TROIS LECTEURS: l'audit
// des cases (ci-dessous), l'énergie servie finale et `meal-energy-v1`. Ce
// module l'IMPORTE; `served_final.ts` n'importe pas ce module — pas de cycle.

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES COURSES — par identité alimentaire, présence ET quantité
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES CINQ ÉTATS D'UNE IDENTITÉ SUR LA LISTE DE COURSES.
 *
 * ⛔ `present_unquantified` ET `check_incomplete` NE SONT PAS DES MANQUES, et
 * les fondre avec `short` inventerait un manque chiffré. Le plan l'écrit:
 * « une conversion ou un conditionnement inconnu produit un contrôle
 * incomplet, pas un manque quantifié inventé ».
 *
 * ⛔ `present_unquantified` EST AUSSI L'ÉTAT DU GARDE-MANGER DÉCLARÉ SANS
 * QUANTITÉ. « J'ai de l'huile d'olive » ne dit pas combien; le compter
 * `covered_measured` inventerait un stock.
 */
export const SHOPPING_COVER_STATES = [
  /** Besoin chiffré, achat chiffré, achat ≥ besoin. Le seul état pleinement vérifié. */
  "covered_measured",
  /** Besoin chiffré, achat chiffré, achat < besoin. Le seul manque QUANTIFIÉ. */
  "short",
  /** Présent (courses ou garde-manger), quantité non déclarée ⇒ suffisance inconnue. */
  "present_unquantified",
  /** Présent, quantité déclarée mais non convertible ⇒ contrôle incomplet. */
  "check_incomplete",
  /** Aucune ligne de courses, aucun garde-manger. Le manque de PRÉSENCE. */
  "not_bought",
  /**
   * ⟳ 2026-09-12 · C3 — L'EAU DE CUISSON DU ROBINET. Elle est mesurée dans la
   * préparation et ne se met dans aucun panier.
   *
   * ⛔ CE N'EST NI `covered_measured` NI `present_unquantified`. « Assez
   * acheté » serait faux (on n'a rien acheté) et « présent, quantité
   * inconnue » ferait entrer 219 g d'eau dans les contrôles incomplets, où ils
   * gonfleraient le dénominateur de ce qu'on ne sait pas vérifier. Un état à
   * part, c'est la seule lecture qui ne mente pas — et ce dépôt paie en boucle
   * les compteurs qui fondent deux états.
   */
  "not_purchasable",
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-15 · BÊTA 2C — ACHETÉ, ET AUCUNE RECETTE NE S'EN SERT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE CAS SORTAIT DE CET AUDIT PAR UN `continue`, DONC SANS UN MOT. Le
   * commentaire disait vrai à moitié — « une identité que RIEN ne demande n'est
   * pas un défaut d'ACHAT » — et tirait la mauvaise conclusion: il n'y a rien
   * qui manque, mais la liste fait acheter de la nourriture que le plan ne
   * cuisinera pas. C'est B4 dans l'autre sens: « grammes, préparations et
   * courses décrivent la même nourriture ».
   *
   * ⛔ MESURÉ, SUR DEUX PLANS N=4 (2026-09-14, `scratchpad/2026-09-14-B4-FINAL`):
   * 260 g de `lentils_dry` sur la liste, zéro lentille dans la seule casserole
   * et dans tous les plats. Le compteur `shopping_unattributed: 1` existait déjà
   * et ne NOMMAIT rien — il a fallu ouvrir le JSON pour savoir de quel aliment
   * on parlait.
   *
   * ⚠️ UN GARDE-MANGER DÉCLARÉ SANS BESOIN N'EST PAS CE CAS. « J'ai de l'huile
   * chez moi » et le plan n'en veut pas: personne n'achète rien, il n'y a rien
   * à dire. Seule une LIGNE DE COURSES fait dépenser.
   */
  "bought_unused",
] as const;
export type ShoppingCoverState = (typeof SHOPPING_COVER_STATES)[number];

export interface ShoppingNeedRow {
  /** Slug du référentiel, ou `term:…` / `refused:…`. Voir `foodIdentityOf`. */
  readonly identity: string;
  readonly identitySource: "ref" | "term" | "unresolved";
  /** Le libellé LOCALISÉ — il sert à AFFICHER, il ne décide plus d'un achat. */
  readonly displayTerm: string;
  /** Les grammes CRUS/ACHETABLES à réunir. `null` = aucune ligne pesable. */
  readonly neededRawG: number | null;
  readonly neededLines: number;
  /** Lignes de besoin qui n'ont pas pu être pesées, par motif. */
  readonly neededUnweighed: number;
  /** Grammes achetés, lus sur les lignes de courses. `null` = aucune pesable. */
  readonly boughtRawG: number | null;
  readonly boughtLines: number;
  readonly boughtUnweighed: number;
  /** Déclaré au garde-manger. La PRÉSENCE seule — jamais une quantité. */
  readonly inPantry: boolean;
  readonly state: ShoppingCoverState;
  /** Motif technique, en français, pour le `detail` d'un refus. */
  readonly reason: string;
}

export interface ShoppingAudit {
  readonly rows: readonly ShoppingNeedRow[];
  /** Identités DISTINCTES regardées — le dénominateur de toutes les causes d'achat. */
  readonly identities: number;
  /** Identités dont la suffisance a pu être COMPARÉE (besoin et achat chiffrés). */
  readonly quantified: number;
  /**
   * ⟳ 2026-09-12 · C3 — Identités NON ACHETABLES (eau du robinet). Comptées à
   * part pour que « 0 manque » ne se lise pas comme « tout a été acheté ».
   */
  readonly notPurchasable: number;
  /**
   * ⟳ 2026-09-12 · C3 — Identités PRÉSENTES dont la quantité n'est pas
   * vérifiable : garde-manger sans quantité, conditionnement non convertible.
   *
   * ⛔ LE PLAN L'EXIGE EN TOUTES LETTRES : « Pour les repas planifiés dont TOUT
   * le besoin doit être acheté, un contrôle quantitatif incomplet est un défaut
   * restant à traiter. » Ce nombre EST ce défaut, nommé et chiffré — il n'est
   * pas réparé ici, et il ne doit pas se fondre dans les manques.
   */
  readonly unverified: number;
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — Identités dont le besoin a été NETTOYÉ du
   * stock déjà déduit par la reconstruction. ⛔ À zéro, les deux modules
   * lisaient le même besoin — ce qui est le cas nominal tant qu'aucun écran
   * n'envoie de garde-manger. Non nul, il dit que la soustraction a servi.
   */
  readonly pantryNetted: number;
  /**
   * ⟳ 2026-09-23 — LES LIGNES DE BESOIN VENUES D'UN À-CÔTÉ (hors soupe tirée
   * d'une casserole, déjà comptée par ses ingrédients). Écrit même à zéro: sans
   * lui, « le plan n'a pas d'à-côté » et « l'audit ne les lit pas » rendraient
   * le même audit.
   */
  readonly sideLines: number;
}

interface RawLine {
  readonly term?: unknown;
  readonly quantity?: unknown;
  readonly ref?: unknown;
  readonly ref_refused?: unknown;
  /**
   * ⟳ 2026-09-12 · C3 — LA QUANTITÉ STRUCTURÉE DE LA LIGNE DE COURSES.
   *
   * ⛔ SANS ELLE, LE CONTRÔLE QUANTITATIF DÉPENDAIT D'UNE RÉINTERPRÉTATION DU
   * TEXTE. `weighLine` retombait sur `readQuantityFromProse`, qui ne lit que
   * `g`, `ml` ou un nombre nu ancré des deux bouts : « 2 pitas complètes » et
   * « 1,2 kg » ne rendaient RIEN. Mesuré le 2026-09-11 : **26 identités sur 26
   * de GAIN restaient incontrôlables en quantité**, et l'audit rendait
   * « incomplet » — honnêtement, mais sans rien contrôler.
   */
  readonly amount?: unknown;
  readonly unit?: unknown;
  readonly state?: unknown;
}

/** La forme persistée, snake_case, réduite à ce que l'audit lit. */
export interface AuditPlan {
  readonly dishes?: unknown;
  readonly preparations?: unknown;
  readonly shopping_list?: unknown;
}

/**
 * L'AUDIT DES COURSES, PAR IDENTITÉ ALIMENTAIRE.
 *
 * ── ⛔ POURQUOI LES 8 FAUX POSITIFS DISPARAISSENT ────────────────────────
 * Les deux côtés passent par `resolveCompositionLine`. Côté ingrédient,
 * l'identifiant du modèle gagne (`ref: lemon`); côté courses, le libellé
 * « citrons » atteint le même slug par les alias du référentiel. Aucune
 * comparaison de chaînes n'a lieu: on compare deux slugs. Le singulier et le
 * pluriel cessent d'être une différence parce qu'ils n'entrent nulle part.
 *
 * ── ⛔ LE POIDS EST CRU/ACHETABLE, JAMAIS LA MASSE CUITE DE LA BOÎTE ─────
 * Le besoin sort des lignes de RECETTE (plats et préparations), pesées par
 * `gramsRawOf` via `resolveIngredients`, qui divise déjà une ligne « cuite »
 * par son rendement. Les items de contenant ne sont PAS lus: 260 g de riz
 * cuit ne s'achètent pas.
 *
 * ── ⚠️ CE QU'IL NE SAIT PAS FAIRE, ET QUI EST NOMMÉ ──────────────────────
 * Les conditionnements et les dates de péremption des stocks ne sont pas
 * modélisés: `household_pantry` ne porte AUCUNE quantité aujourd'hui, seulement
 * un terme. C'est pour ça que `present_unquantified` existe, et c'est pour ça
 * que ce module refuse d'en déduire des grammes.
 */
export function shoppingIdentityAudit(args: {
  index: CompositionIndex | null;
  plan: AuditPlan;
  pantryTerms: readonly string[];
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — CE QUE LE STOCK A DÉJÀ COUVERT
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LA MINE QUE CE PARAMÈTRE DÉSAMORCE, ET ELLE EST ÉCRITE DANS
   * `RESTE-A-FAIRE.md`. `rebuildShoppingQuantities` DÉDUIT le stock quantifié :
   * la ligne de courses porte alors le besoin NET. Cet audit-ci, lui, compare
   * le besoin ENTIER du plan à ce qui est acheté — donc il lit
   * « pas assez acheté » sur un plan parfaitement juste, et
   * `ingredient_short_bought` sort sur une personne qui a déjà l'aliment chez
   * elle.
   *
   * ⛔ REQUIS, `Map` VIDE POUR « RIEN DE DÉDUIT », JAMAIS `T?`. Un paramètre
   * facultatif ferait de l'oubli la réponse silencieuse de tous les appelants —
   * et ce défaut-là n'a aucun symptôme visible tant qu'aucun écran n'envoie de
   * garde-manger, c'est-à-dire jusqu'au jour où il en envoie un.
   *
   * ⚠️ EN GRAMMES CRUS, indexé par IDENTITÉ alimentaire — la même clé que les
   * besoins de ce module, et la même unité.
   */
  pantryCoveredG: ReadonlyMap<string, number>;
}): ShoppingAudit {
  const { index } = args;
  const acc = new Map<string, {
    identity: string;
    identitySource: "ref" | "term" | "unresolved";
    displayTerm: string;
    neededRawG: number | null;
    neededLines: number;
    neededUnweighed: number;
    boughtRawG: number | null;
    boughtLines: number;
    boughtUnweighed: number;
    inPantry: boolean;
    refused: boolean;
  }>();

  const touch = (
    line: { term: string; ref?: string | null; refRefused?: boolean },
  ) => {
    const id = foodIdentityOf(index, line);
    let row = acc.get(id.identity);
    if (row === undefined) {
      row = {
        identity: id.identity,
        identitySource: id.source,
        displayTerm: line.term,
        neededRawG: null,
        neededLines: 0,
        neededUnweighed: 0,
        boughtRawG: null,
        boughtLines: 0,
        boughtUnweighed: 0,
        inPantry: false,
        refused: id.identity.startsWith("refused:"),
      };
      acc.set(id.identity, row);
    }
    return row;
  };

  // ── ③.a LE BESOIN: les recettes finales et les vrais lots à cuisiner ────
  const needInputs: CompositionInput[] = [];
  for (const dish of asArray(args.plan.dishes)) {
    needInputs.push(...readIngredients((dish as { ingredients?: unknown }).ingredients));
  }
  for (const prep of asArray(args.plan.preparations)) {
    needInputs.push(...readIngredients((prep as { ingredients?: unknown }).ingredients));
  }
  // ── ③.a bis ⟳ 2026-09-23 — LES À-CÔTÉS SONT DES BESOINS ─────────────────
  //
  // ⛔ SANS CES LIGNES, UNE POMME SERVIE À CÔTÉ N'EXISTE POUR AUCUN CONTRÔLE
  // D'ACHAT. Elle n'est ni un ingrédient de plat ni un ingrédient de casserole:
  // elle vit dans `dishes[i].side_courses[]`. La ligne de courses que le moteur
  // écrit pour elle (flux A, `sideShoppingLines`) sortirait `bought_unused`, et
  // un à-côté oublié de la liste ne sortirait jamais `not_bought`.
  //
  // ⚠️ UNE SOUPE TIRÉE D'UNE CASSEROLE N'AJOUTE RIEN: ses légumes sont déjà des
  // ingrédients de la préparation, lus juste au-dessus. La compter deux fois
  // ferait lire un manque sur un plan juste.
  //
  // ⚠️ LA MÊME LIGNE QUE SA MESURE D'ÉNERGIE (`sideCompositionLine`): état
  // `raw` — on achète la pomme qu'on sert —, le slug d'abord, et une masse
  // absente reste un besoin NON PESÉ, jamais un zéro.
  let sideLines = 0;
  for (const side of readEnergySideCourses(args.plan.dishes)) {
    if (side.preparationId !== null) continue;
    const line = sideCompositionLine(side);
    if (line.term === "") continue;
    sideLines += 1;
    needInputs.push(line);
  }
  /**
   * ⛔ LA TABLE D'ALIAS EXPLICITE QUE LE PLAN PORTE LUI-MÊME.
   *
   * ── LE DÉFAUT MESURÉ, ET IL EST NEUF ─────────────────────────────────
   * L'ingrédient porte un identifiant (lot A), la LIGNE DE COURSES n'en porte
   * aucun (`mealShoppingPayload` ne le projette pas). Les deux côtés partent
   * donc de deux résolutions différentes, et sur les fixtures du 2026-09-11
   * cette asymétrie produit **trois faux manques** là où le produit est sur la
   * liste au caractère près: `pita complète` (PERTE), `agneau` et
   * `petits-suisses nature` (GAIN). C'est le faux positif de pluriel remplacé
   * par un faux positif d'identifiant — et le lot n'aurait rien réparé.
   *
   * ⛔ ÉGALITÉ EXACTE DE TERMES NORMALISÉS, ET RIEN D'AUTRE. Pas de
   * sous-chaîne, pas de distance d'édition, pas de devinette de langue: ce
   * dépôt a mesuré 12 faux positifs sur 12 avec un matcher artisanal
   * (`never-hand-roll-a-matcher-here`), et l'ancienne règle `covers()` vient
   * d'être retirée pour la même raison. Deux chaînes IDENTIQUES après
   * normalisation ne sont pas un rapprochement approximatif; c'est la même
   * ligne, écrite deux fois dans le même document.
   *
   * ⚠️ L'IDENTIFIANT DU MODÈLE GAGNE, comme au lot A. Une ligne de courses dont
   * le libellé atteint un slug par alias cède devant l'identifiant que le plan
   * déclare sur ce MÊME libellé: « l'ordre est le contrat, un identifiant
   * accepté gagne sur le terme, sans exception ».
   */
  const identityByTerm = new Map<string, string>();
  for (const input of needInputs) {
    const row = touch(input);
    row.neededLines += 1;
    const key = normalizeTerm(input.term);
    if (key && !identityByTerm.has(key)) identityByTerm.set(key, row.identity);
    const w = weighLine(index, input);
    if (w.kind === "measured") {
      row.neededRawG = (row.neededRawG ?? 0) + w.grams;
    } else {
      row.neededUnweighed += 1;
    }
  }
  /**
   * ⟳ 2026-09-12 · C6 — LES IDENTITÉS QUE LE PLAN DEMANDE, FIGÉES ICI.
   *
   * ⛔ FIGÉES AVANT LA BOUCLE D'ACHAT, ET PAS LUES DANS `acc`. `touch()` ajoute
   * une ligne à `acc` pour CHAQUE achat aussi : interroger `acc` pendant la
   * boucle ferait dépendre le pont de l'ordre des lignes de courses, et une
   * ligne pourrait se voir refuser le pont à cause d'une ligne précédente.
   */
  const needIdentities = new Set(acc.keys());

  // ── ③.b L'ACHAT: les lignes de courses, avec leur quantité en clair ─────
  //
  // ⛔ `state: "raw"` EST UNE AFFIRMATION, PAS UN DÉFAUT. Une ligne de courses
  // décrit ce qu'on met dans le panier: 500 g de riz au magasin sont 500 g
  // CRUS. Sans ce champ, `gramsRawOf` s'abstiendrait sur toute classe où
  // l'état compte (`stateMattersFor`), c'est-à-dire précisément sur les
  // féculents — et l'audit rendrait « conditionnement inconnu » sur chaque
  // paquet de pâtes.
  //
  // ⚠️ LES LIGNES DE COURSES N'ONT AUCUN IDENTIFIANT AUJOURD'HUI
  // (`mealShoppingPayload`, `meal_generation.ts`). On lit quand même `ref` si
  // elle apparaît: le jour où le lot C le pose, ce code le prend sans
  // modification — et en attendant le libellé passe par les alias, ce qui
  // suffit à fermer les 8 faux positifs.
  for (const raw of asArray(args.plan.shopping_list)) {
    const line = raw as RawLine;
    const term = String(line?.term ?? "").trim();
    if (term === "") continue;
    const ref = typeof line.ref === "string" && line.ref.trim() !== "" ? line.ref.trim() : null;
    const refRefused = line.ref_refused === true;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · ÉTAPE C6 — LE PONT S'APPLIQUE AUSSI QUAND LA LIGNE PORTE
    //                UN `ref` QU'ELLE A TIRÉ DE SON PROPRE LIBELLÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT MESURÉ, ET IL A COÛTÉ UN PLAN ENTIER. Tir réel n° 1 de la
    // campagne du 2026-09-12 (`4d82720c`) : **422 `plan_not_deliverable`**, une
    // seule cause bloquante, `ingredient_not_bought « champignons de Paris »`
    // — alors que la ligne EST sur la liste de courses, écrite au caractère
    // près, 200 g pour 200 g. Reproduit hors ligne, à zéro appel modèle, par
    // `banc-lot-F.ts --reponse=<sortie du tir>` : même 422, même cause.
    //
    // ── POURQUOI LE PONT NE PARTAIT PAS ───────────────────────────────────
    // La condition d'avant était `ref === null`, et le commentaire du bloc
    // disait « LES LIGNES DE COURSES N'ONT AUCUN IDENTIFIANT AUJOURD'HUI ».
    // **C3 leur en a donné un dans le même lot** : le parseur
    // (`meal_generation.ts`, projection `shopping_list`) appelle
    // `resolveCompositionLine(index, { term, ref: null })` et écrit le slug
    // obtenu sur la ligne. Ce `ref` n'est donc PAS un identifiant déclaré par
    // le modèle : c'est le libellé résolu. Ici il valait `champignons_de_paris`
    // — une entrée du sas créée pour cette phrase exacte — pendant que
    // l'ingrédient de la préparation portait le `ref` du MODÈLE,
    // `button_mushroom_cultivated_mushroom`. Deux identités pour le même
    // aliment, un besoin sans achat, un refus.
    //
    // ── LA RÈGLE EST CELLE DE `rebuildShoppingQuantities`, RECOPIÉE EXPRÈS ──
    // « L'IDENTITÉ DE LA LIGNE D'ABORD, L'ALIAS DU PLAN ENSUITE — et jamais
    // l'inverse. Le pont ne sert que lorsque la ligne n'atteint aucun besoin :
    // il ne peut donc pas détourner une ligne qui en atteignait un. » Les deux
    // lecteurs appliquent maintenant LA MÊME condition, ce qui est le seul
    // moyen qu'ils cessent de rendre deux verdicts opposés sur le même plan :
    // la reconstruction annonçait `needs_unbought: 0` au moment même où la
    // garde refusait le plan.
    //
    // ⚠️ `refRefused` GARDE SA PRIORITÉ. Un identifiant explicitement refusé
    // reste un contrôle incomplet ; le pont ne le recouvre pas.
    const directIdentity = foodIdentityOf(index, { term, ref, refRefused }).identity;
    const declared = !refRefused && !needIdentities.has(directIdentity)
      ? identityByTerm.get(normalizeTerm(term)) ?? null
      : null;
    // ⚠️ SEUL UN VRAI SLUG SERT D'ALIAS. `term:…` et `refused:…` sont des
    // espaces de noms internes: les passer en `ref` les ferait refuser comme
    // des identifiants inventés, ce qu'ils ne sont pas.
    const declaredSlug = declared !== null && !declared.includes(":") ? declared : null;
    const row = declared !== null
      ? acc.get(declared) ?? touch({ term, ref, refRefused })
      : touch({ term, ref, refRefused });
    row.boughtLines += 1;
    // ⟳ 2026-09-12 · C3 — LA QUANTITÉ STRUCTURÉE D'ABORD, LA PROSE ENSUITE.
    // Même ordre que `renderQuantity` et que `resolveIngredients` : la donnée
    // gagne sur le texte, sans exception. `null` quand la ligne n'en porte pas
    // (plan écrit avant ce lot) ⇒ le chemin historique par la prose, intact.
    const amount = typeof line.amount === "number" && Number.isFinite(line.amount) &&
        line.amount > 0
      ? line.amount
      : null;
    const unit = typeof line.unit === "string" &&
        (COMPOSITION_UNITS as readonly string[]).includes(line.unit)
      ? line.unit as CompositionUnit
      : null;
    const w = weighLine(index, {
      term,
      ref: ref ?? declaredSlug,
      refRefused,
      amount,
      unit,
      // ⛔ `state: "raw"` EST UNE AFFIRMATION, PAS UN DÉFAUT (voir le pavé
      // au-dessus) : 500 g de riz au magasin sont 500 g CRUS. La ligne peut
      // désormais l'écrire elle-même ; quand elle ne le fait pas, l'affirmation
      // du panier tient.
      state: line.state === "cooked" ? "cooked" : "raw",
      quantity: typeof line.quantity === "string" ? line.quantity : null,
    });
    if (w.kind === "measured") row.boughtRawG = (row.boughtRawG ?? 0) + w.grams;
    else row.boughtUnweighed += 1;
  }

  // ── ③.c LE GARDE-MANGER: une PRÉSENCE, et rien d'autre ─────────────────
  for (const term of args.pantryTerms ?? []) {
    const clean = String(term ?? "").trim();
    if (clean === "") continue;
    touch({ term: clean }).inPantry = true;
  }

  // ── ③.d ET CE QU'IL A DÉJÀ COUVERT, RETRANCHÉ DU BESOIN ────────────────
  //
  // ⛔ SANS CETTE SOUSTRACTION, LES DEUX MODULES LISENT DEUX BESOINS. La
  // reconstruction écrit sur la ligne le besoin NET (stock déduit) ; cet audit
  // compare au besoin ENTIER, et rend `ingredient_short_bought` sur une
  // personne qui a déjà l'aliment chez elle. Le plan de fermeture l'exige :
  // « faire lire le même stock/besoin net à l'audit des achats ».
  //
  // ⚠️ JAMAIS SOUS ZÉRO, et jamais sur un besoin non pesé : un stock ne peut
  // pas couvrir plus que ce qui est demandé, et il ne peut rien couvrir d'une
  // quantité qu'on n'a pas su lire.
  let pantryNetted = 0;
  for (const [identity, grams] of args.pantryCoveredG) {
    const row = acc.get(identity);
    if (row === undefined || row.neededRawG === null) continue;
    if (!Number.isFinite(grams) || grams <= 0) continue;
    row.neededRawG = Math.max(0, row.neededRawG - grams);
    pantryNetted += 1;
  }

  const rows: ShoppingNeedRow[] = [];
  let quantified = 0;
  let notPurchasable = 0;
  let unverified = 0;
  for (const row of [...acc.values()].sort((a, b) => a.identity < b.identity ? -1 : 1)) {
    // ⟳ 2026-09-15 · BÊTA 2C — UNE IDENTITÉ QUE RIEN NE DEMANDE.
    //
    // Ce n'est pas un défaut d'ACHAT (rien ne manque), et ce `continue` était
    // donc juste sur les causes de manque. Mais une LIGNE DE COURSES que
    // personne ne cuisine fait dépenser: elle sort maintenant sous son propre
    // état, nommée. Un garde-manger en trop, lui, ne coûte rien et reste muet.
    if (row.neededLines === 0) {
      if (row.boughtLines === 0) continue;
      rows.push({
        identity: row.identity,
        identitySource: row.identitySource,
        displayTerm: row.displayTerm,
        neededRawG: null,
        neededLines: 0,
        neededUnweighed: 0,
        boughtRawG: row.boughtRawG,
        boughtLines: row.boughtLines,
        boughtUnweighed: row.boughtUnweighed,
        inPantry: row.inPantry,
        state: "bought_unused",
        reason: row.boughtRawG === null
          ? `acheté (${row.boughtLines} ligne(s)), aucune recette ne l'emploie`
          : `${round1(row.boughtRawG)} g achetés, aucune recette ne les emploie`,
      });
      continue;
    }
    const present = row.boughtLines > 0 || row.inPantry;
    let state: ShoppingCoverState;
    let reason: string;
    if (isNonPurchasableIdentity(row.identity)) {
      // ⟳ 2026-09-12 · C3 — L'EAU DU ROBINET N'EST PAS UN ACHAT MANQUANT.
      // Mesuré : 2 tirs sur 6 de la campagne du 2026-09-11 réclamaient 219 g et
      // 287 g d'eau. ⛔ Cet état se pose AVANT tous les autres, et il ne regarde
      // NI la présence NI la quantité : une ligne « eau » écrite par le modèle
      // ne rend pas l'eau achetable, et son absence ne la rend pas manquante.
      state = "not_purchasable";
      reason = "eau du robinet — mesurée dans la préparation, jamais achetée";
      notPurchasable += 1;
    } else if (row.refused) {
      // ⛔ UN IDENTIFIANT REFUSÉ N'A PAS D'ALIMENT: on ne sait pas ce qu'il
      // faut acheter, donc on ne peut pas dire qu'il manque. C'est un contrôle
      // incomplet, et sa cause propre vit dans la garde (`ref_refused`).
      state = "check_incomplete";
      reason = "identifiant alimentaire refusé — l'aliment à acheter est inconnu";
    } else if (!present) {
      state = "not_bought";
      reason = "aucune ligne de courses, aucun garde-manger";
    } else if (row.neededRawG === null) {
      state = "present_unquantified";
      reason = row.neededUnweighed > 0
        ? `présent, besoin non pesable (${row.neededUnweighed} ligne(s))`
        : "présent, besoin non pesable";
    } else if (row.inPantry && row.boughtLines === 0) {
      // ⛔ ON N'INVENTE PAS UN STOCK. Le garde-manger déclare une PRÉSENCE;
      // rien dans le schéma ne dit combien il en reste.
      state = "present_unquantified";
      reason = "déclaré au garde-manger — présence seule, quantité inconnue";
    } else if (row.boughtRawG === null) {
      state = "check_incomplete";
      reason = `acheté, quantité non convertible (${row.boughtUnweighed} ligne(s))`;
    } else {
      quantified += 1;
      if (row.boughtRawG + shortfallAllowance(row.neededRawG) >= row.neededRawG) {
        state = "covered_measured";
        reason = `${round1(row.boughtRawG)} g achetés pour ${round1(row.neededRawG)} g requis`;
      } else {
        state = "short";
        reason = `${round1(row.boughtRawG)} g achetés pour ${round1(row.neededRawG)} g requis`;
      }
    }
    // ⟳ 2026-09-12 · C3 — LE DÉFAUT RESTANT, COMPTÉ PLUTÔT QUE DÉDUIT. Une
    // identité PRÉSENTE dont on ne sait pas dire si on en a assez est un
    // contrôle incomplet, et le plan demande de le NOMMER.
    if (state === "present_unquantified" || state === "check_incomplete") {
      unverified += 1;
    }
    rows.push({
      identity: row.identity,
      identitySource: row.identitySource,
      displayTerm: row.displayTerm,
      neededRawG: row.neededRawG,
      neededLines: row.neededLines,
      neededUnweighed: row.neededUnweighed,
      boughtRawG: row.boughtRawG,
      boughtLines: row.boughtLines,
      boughtUnweighed: row.boughtUnweighed,
      inPantry: row.inPantry,
      state,
      reason,
    });
  }
  return {
    rows,
    identities: rows.length,
    quantified,
    notPurchasable,
    unverified,
    pantryNetted,
    sideLines,
  };
}

/**
 * LA TOLÉRANCE D'ARRONDI D'UNE COMPARAISON DE MASSE, en grammes.
 *
 * ⛔ ELLE NE COUVRE QU'UN ARRONDI, PAS UN MANQUE. 0,5 g est le pas de
 * l'affichage le plus fin du produit (la pincée conventionnée en pèse 0,5). Au
 * delà, un écart est un écart.
 */
const EPSILON_G = 0.5;

/**
 * L'ARRONDI D'UNE LIGNE D'ACHAT — 5 % du besoin, et c'est une CONSTANTE
 * OPÉRATIONNELLE avouée.
 *
 * ── ⛔ POURQUOI ELLE EXISTE, ET D'OÙ SORT LE CHIFFRE ─────────────────────
 * Une ligne de courses est arrondie à une quantité qu'on peut ACHETER: on ne
 * met pas 355,74 g de bœuf dans un panier. Sans tolérance, la comparaison
 * rendait `short` sur des écarts de **0,74 g**. Les cinq sous-achats mesurés
 * sur les deux plans archivés du 2026-09-11 valent, en part du besoin:
 *
 *     0,21 %  ·  1,10 %  ·  1,68 %  ·  3,70 %   ⟵ des arrondis de panier
 *    10,48 %  (400 g de tomate pour 446,8 requis) ⟵ un vrai manque
 *
 * La coupure naturelle est entre 3,70 et 10,48, et 5 % tombe dedans. ⚠️ C'est
 * une CALIBRATION SUR CINQ POINTS, pas une loi: elle est exportée pour qu'un
 * commit ultérieur la déplace à la vue de tous, comme `ENERGY_SHORT_RATIO`.
 *
 * ⛔ NE PAS L'ÉLARGIR POUR FAIRE PASSER UN BANC. Au-delà de 5 %, on cesse
 * d'absorber un arrondi et on commence à absorber un manque.
 */
export const SHOPPING_SHORT_TOLERANCE = 0.05;

/** Le plus grand des deux: l'arrondi d'affichage et l'arrondi de panier. */
function shortfallAllowance(neededRawG: number): number {
  return Math.max(EPSILON_G, neededRawG * SHOPPING_SHORT_TOLERANCE);
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES PORTIONS — un tableau par PERSONNE / DATE / CRÉNEAU
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ÉTAT D'UNE CASE. Six valeurs, et aucune n'est un repli de l'autre.
 *
 * ⛔ `no_portion` ET `unmeasurable` SONT DEUX CHOSES. La première est le défaut
 * ① — un plat existe, aucun contenant ne porte de portion pour cette bouche.
 * La seconde est une portion ÉCRITE que le référentiel ne sait pas lire. Les
 * confondre a produit le `ok = true` du 2026-09-11.
 */
export const CELL_STATES = [
  "conforme",
  /** Mesurée, hors ±10 % de sa cible. */
  "energy_off",
  /** Mesurée et dans la tolérance, mais hors de ses bornes de masse ou de son couloir. */
  "bounds_off",
  /** Un plat existe, aucune portion n'est calculée pour cette bouche. */
  "no_portion",
  /** Une portion existe, son énergie n'est pas lisible. */
  "unmeasurable",
  /** Aucune cible: le contrat s'est abstenu (case fixe couverte, plancher protégé…). */
  "no_target",
  /**
   * ⛔ LA CASE N'A PAS DE PORTION INDIVIDUELLE, ET C'EST NORMAL. Un plat de
   * TABLE — aucun contenant sur cette case, tout le monde se sert — n'est pas
   * une case oubliée. La confondre avec `no_portion` refuserait tous les repas
   * partagés d'un foyer, c'est-à-dire le produit lui-même. C'est `mouth_unfed`
   * et `cell_without_dish` qui gardent cette surface, pas ce module.
   */
  "not_personal",
] as const;
export type CellState = (typeof CELL_STATES)[number];

export interface CellNutritionRow {
  readonly memberId: string;
  /** Le jeton de jour du plan (`sun`, `mon`…). */
  readonly day: string;
  /** La date LOCALE `YYYY-MM-DD` — la clé du contrat du lot B. */
  readonly date: string;
  readonly slot: string;
  /** La cible à composer, du contrat. `null` = le contrat s'est abstenu. */
  readonly targetKcal: number | null;
  /** Un plat est-il posé sur cette case ? */
  readonly hasDish: boolean;
  /** Une portion est-elle calculée POUR CETTE BOUCHE ? */
  readonly hasPortion: boolean;
  /**
   * Ce que cette bouche reçoit, en kcal. Sur un contenant partagé, c'est la
   * part du contenant divisée par ses mangeurs — voir `sharedWith`.
   */
  readonly servedKcal: number | null;
  readonly grams: number | null;
  readonly densityPer100G: number | null;
  readonly proteinG: number | null;
  /**
   * ⟳ 2026-09-15 · BÊTA — LA BORNE D'ARRONDI, CALCULÉE PAR `boxNutrition`
   * (voir `BoxItemsNutrition`). Sur un contenant partagé, la borne protéique
   * est divisée comme la protéine; la borne de densité est celle du contenant.
   * ⛔ REQUIS ET NULLABLES, jamais `?`: `null` = pas mesuré, jamais « zéro ».
   */
  readonly proteinRoundingG: number | null;
  readonly densityRoundingPer100G: number | null;
  /** Le motif NOMMÉ du silence de `boxNutrition`. `null` = un chiffre est sorti. */
  readonly gap: string | null;
  readonly deltaPct: number | null;
  /**
   * Le nombre de consommateurs du contenant d'où vient cette portion.
   * `1` = une assiette; `> 1` = un bac partagé, attribué à chacun.
   */
  readonly sharedWith: number;
  /**
   * ⛔ UNE PORTION INDIVIDUELLE EST-ELLE ATTENDUE SUR CETTE CASE ? C'est la
   * question qui distingue le défaut ① (« un plat, aucune portion ») d'un repas
   * de table parfaitement normal. Voir `cellNutritionTable`.
   */
  readonly portionExpected: boolean;
  readonly state: CellState;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-23 — LES À-CÔTÉS DE CETTE CASE, DANS UNE COLONNE À PART.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ À PART, ET C'EST TOUTE LA RÈGLE. `servedKcal`, `grams`, `densityPer100G`
   * et `state` restent LE PLAT SEUL: la cible de la case (`composeKcal`) est
   * celle du plat, ses bornes de masse et son couloir de densité aussi. Fondre
   * une pomme de 80 kcal dans la densité d'un plat en ferait mentir le couloir
   * (un plat trop dilué « réparé » par un fromage à côté). C'est la JOURNÉE qui
   * additionne plat + à-côtés (`dayNutritionTable`).
   *
   * `0` = aucun à-côté sur cette case. `null` = au moins un à-côté illisible
   * (`measureSideCourses`) — jamais 0, et la journée qui le porte devient
   * `unmeasurable`.
   *
   * ⚠️ FACULTATIVES, ET C'EST UN AVEU PLUTÔT QU'UN CHOIX — le patron de
   * `CompositionRef.ciqualCode`. Les rendre requises ferait échouer le typecheck
   * de plusieurs fichiers de test d'autres lots qui construisent des lignes
   * littérales (dont `plan_repair_decision_test.ts`, `plan_defect_pass_test.ts`,
   * `rounding_bound_test.ts`). Ce n'est PAS une garde désarmée: ce sont des
   * SORTIES, et `cellNutritionTable` les écrit TOUJOURS, zéro compris. Absentes
   * (ligne construite à la main) elles valent « aucun à-côté », ce qui est
   * exactement ce que ces lignes décrivent.
   */
  readonly sideKcal?: number | null;
  readonly sideProteinG?: number | null;
}

export interface DayNutritionRow {
  readonly memberId: string;
  readonly date: string;
  readonly cellsExpected: number;
  readonly cellsMeasured: number;
  /** La somme des cibles des cases DEMANDÉES. Jamais la cible du jour. */
  readonly coveredBudgetKcal: number | null;
  /**
   * ⟳ 2026-09-23 — PLAT + À-CÔTÉS. Le budget couvert du contrat porte les deux
   * (Σ plats + Σ à-côtés = budget couvert, plan « assiettes normales », choix
   * n° 1): comparer le plat seul à ce budget lirait chaque journée à −20 %.
   */
  readonly servedKcal: number | null;
  readonly deltaPct: number | null;
  /** ⟳ 2026-09-23 — plat + à-côtés, comme `servedKcal`. */
  readonly proteinG: number | null;
  /** ⟳ 2026-09-15 · BÊTA — la somme des bornes d'arrondi des cases du jour. */
  readonly proteinRoundingG: number | null;
  readonly protein: ProteinFloorAllocation;
  readonly state: "conforme" | "energy_off" | "unmeasurable";
  /**
   * ⟳ 2026-09-23 — LA PART DE `servedKcal` QUI VIENT DES À-CÔTÉS. `null` quand
   * un à-côté du jour est illisible. ⚠️ Facultative pour la raison écrite sur
   * `CellNutritionRow.sideKcal`: `dayNutritionTable` l'écrit toujours.
   */
  readonly sideKcal?: number | null;
}

/** Une case attendue, telle que la grille du foyer la connaît. */
export interface AuditCell {
  readonly memberId: string;
  readonly day: string;
  readonly date: string;
  readonly slot: string;
  /** `contract.composeKcal`. `null` quand le contrat s'abstient. */
  readonly targetKcal: number | null;
  /** `contract.bounds`, quand elles existent. */
  readonly gramsMin: number | null;
  readonly gramsMax: number | null;
  /**
   * Le couloir de densité du contrat, quand il est réalisable — LES NOMBRES
   * ÉNONCÉS, ceux que le prompt et la consigne de réparation portent.
   */
  readonly densityMin: number | null;
  readonly densityMax: number | null;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1C ⑤ — LES BORNES QUI JUGENT, NON ARRONDIES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT ② DE LA CLÔTURE: une assiette à **241,1 kcal/100 g** déclarée
   * hors bornes contre un plafond ENTIER de 241, quand le plafond exact vaut
   * **241,27**. L'arrondi qui rend la consigne énonçable ne doit pas devenir le
   * seuil du verdict — « inversement un dépassement réel ne disparaît pas par
   * l'arrondi de l'affichage ».
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un `?` oublié ferait retomber le verdict
   * sur les entiers chez tout appelant qui l'oublie, c'est-à-dire sur le défaut
   * qu'on ferme.
   */
  readonly densityMinExact: number | null;
  readonly densityMaxExact: number | null;
}

/**
 * LE TABLEAU FINAL, DEPUIS LE PAYLOAD FINAL.
 *
 * ── ⛔ POURQUOI IL PART DE `boxNutrition` ET NON DE `planEnergy` ─────────
 * `readDishes` ne connaît que `uses.servings / servingsMade`, c'est-à-dire une
 * part CONVENTIONNELLE; `boxNutrition` lit les GRAMMES ÉCRITS de chaque item
 * et, pour chaque item qui cite sa casserole, le prélèvement réel à la densité
 * de cette casserole. Mélanger les deux bases a rendu 2 370 kcal là où les
 * portions valent 2 455,69 — la cicatrice n° 1 du lot 0.
 *
 * ── ⛔ UNE PORTION PARTAGÉE EST ATTRIBUABLE À CHACUN DE SES CONSOMMATEURS ─
 * Le plan l'exige. La part est `kcal du contenant / nombre de mangeurs`, et
 * c'est la convention DÉJÀ employée par `tubServed` / `unmetDemand` dans le
 * handler — pas un nouveau partage inventé ici. `sharedWith` la rend visible:
 * une case à `sharedWith > 1` porte une estimation, pas une pesée nominative.
 */
export function cellNutritionTable(args: {
  index: CompositionIndex | null;
  plan: AuditPlan;
  cells: readonly AuditCell[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ REQUIS, ET C'EST LA GARDE ELLE-MÊME.
   * ══════════════════════════════════════════════════════════════════════
   *
   * `true` = cette lane écrit des portions PERSONNELLES (le dimensionnement v4
   * a tourné) ⇒ **chaque** case attendue doit porter une portion pour sa
   * bouche, et une case à zéro contenant est le défaut ①. C'est le cas des
   * deux plans de la campagne du 2026-09-11, où PERTE samedi déjeuner et GAIN
   * vendredi dîner avaient une recette et AUCUNE boîte.
   *
   * `false` = les portions ne sont pas individualisées ⇒ seules les cases qui
   * portent DÉJÀ un contenant réclament une part pour chaque mangeur; les
   * autres sont des plats de table, gardés par `mouth_unfed`.
   *
   * ⛔ PAS D'OPTIONNEL ICI: un défaut à `false` aurait laissé le défaut ① en
   * place sous un autre nom, et un défaut à `true` aurait refusé tous les
   * repas partagés. Le dépôt paie en boucle les gardes qu'un paramètre
   * facultatif désarme (`optional-gate-params-are-disarmed-gates`).
   */
  portionsArePersonal: boolean;
}): readonly CellNutritionRow[] {
  const dishKeys = new Set<string>();
  const boxedCells = new Set<string>();
  for (const dish of asArray(args.plan.dishes)) {
    const d = dish as { day?: unknown; slot?: unknown; boxes?: unknown };
    const key = `${String(d.day ?? "")}/${String(d.slot ?? "")}`;
    dishKeys.add(key);
    if (asArray(d.boxes).length > 0) boxedCells.add(key);
  }

  /** `memberId|day|slot` → l'agrégat de ses contenants. */
  const served = new Map<string, {
    kcal: number | null;
    grams: number;
    proteinG: number | null;
    proteinRounding: number | null;
    densityRounding: number | null;
    gap: string | null;
    sharedWith: number;
  }>();
  if (args.index !== null) {
    const boxes = boxNutrition({
      index: args.index,
      dishes: readEnergyBoxDishes(args.plan.dishes),
      preparations: readPreparations(args.plan.preparations),
    });
    for (const box of boxes) {
      const eaters = box.memberIds.length;
      if (eaters === 0) continue;
      for (const memberId of box.memberIds) {
        const key = `${memberId}|${box.day ?? ""}|${box.slot ?? ""}`;
        const prev = served.get(key);
        const share = (v: number | null): number | null => v === null ? null : v / eaters;
        const kcal = share(box.kcal);
        const protein = share(box.proteinG);
        const proteinRounding = share(box.proteinRoundingG);
        const densityRounding = box.densityRoundingPer100G;
        if (prev === undefined) {
          served.set(key, {
            kcal,
            grams: box.grams / eaters,
            proteinG: protein,
            proteinRounding,
            densityRounding,
            // ⛔ LE MOTIF SURVIT AU CHIFFRE. Un contenant illisible dans une
            // case qui en porte deux rend la case incomplète, et son motif est
            // la seule chose qui dise pourquoi.
            gap: box.gap,
            sharedWith: eaters,
          });
          continue;
        }
        served.set(key, {
          kcal: prev.kcal === null || kcal === null ? null : prev.kcal + kcal,
          grams: prev.grams + box.grams / eaters,
          proteinG: prev.proteinG === null || protein === null ? null : prev.proteinG + protein,
          proteinRounding: prev.proteinRounding === null || proteinRounding === null
            ? null
            : prev.proteinRounding + proteinRounding,
          // Deux contenants sur une case: on garde la plus grande des deux
          // bornes de densité — pas leur somme, la borne porte sur un mélange.
          densityRounding: prev.densityRounding === null
            ? densityRounding
            : densityRounding === null
            ? prev.densityRounding
            : Math.max(prev.densityRounding, densityRounding),
          gap: prev.gap ?? box.gap,
          sharedWith: Math.max(prev.sharedWith, eaters),
        });
      }
    }
  }

  // ── ⟳ 2026-09-23 — LES À-CÔTÉS, PAR `memberId|day|slot`, EN COLONNE À PART ──
  //
  // ⛔ ILS NE TOUCHENT NI `served` NI L'ÉTAT DE LA CASE: la case juge le PLAT
  // contre la cible du plat. Voir `CellNutritionRow.sideKcal`.
  // ⚠️ Sans index, la colonne reste `null` sur les cases qui PORTENT un
  // à-côté, et `0` ailleurs: un à-côté non mesuré n'est pas un à-côté absent.
  const sidesByCell = new Map<string, { kcal: number | null; proteinG: number | null }>();
  {
    const sides = readEnergySideCourses(args.plan.dishes);
    const measures: readonly { kcal: number | null; proteinG: number | null }[] = args.index === null
      ? sides.map(() => ({ kcal: null, proteinG: null }))
      : measureSideCourses({
        index: args.index,
        preparations: readPreparations(args.plan.preparations),
        sides,
      });
    sides.forEach((side, k) => {
      const key = `${side.memberId}|${side.day ?? ""}|${side.slot ?? ""}`;
      const m = measures[k];
      const prev = sidesByCell.get(key) ?? { kcal: 0, proteinG: 0 };
      sidesByCell.set(key, {
        kcal: prev.kcal === null || m.kcal === null ? null : prev.kcal + m.kcal,
        proteinG: prev.proteinG === null || m.proteinG === null ? null : prev.proteinG + m.proteinG,
      });
    });
  }

  return args.cells.map((cell) => {
    const cellKey = `${cell.day}/${cell.slot}`;
    const hit = served.get(`${cell.memberId}|${cell.day}|${cell.slot}`) ?? null;
    const side = sidesByCell.get(`${cell.memberId}|${cell.day}|${cell.slot}`) ??
      { kcal: 0, proteinG: 0 };
    const hasDish = dishKeys.has(cellKey);
    const hasPortion = hit !== null;
    const portionExpected = args.portionsArePersonal || boxedCells.has(cellKey);
    const kcal = hit?.kcal ?? null;
    const grams = hit === null ? null : hit.grams;
    const density = kcal !== null && grams !== null && grams > 0
      ? (kcal / grams) * 100
      : null;
    const delta = kcal !== null && cell.targetKcal !== null && cell.targetKcal > 0
      ? (kcal - cell.targetKcal) / cell.targetKcal
      : null;
    return {
      memberId: cell.memberId,
      day: cell.day,
      date: cell.date,
      slot: cell.slot,
      targetKcal: cell.targetKcal,
      hasDish,
      hasPortion,
      servedKcal: kcal,
      grams,
      densityPer100G: density,
      proteinG: hit?.proteinG ?? null,
      proteinRoundingG: hit?.proteinRounding ?? null,
      densityRoundingPer100G: hit?.densityRounding ?? null,
      gap: hit?.gap ?? null,
      deltaPct: delta === null ? null : delta * 100,
      sharedWith: hit?.sharedWith ?? 0,
      portionExpected,
      sideKcal: side.kcal,
      sideProteinG: side.proteinG === null ? null : round1(side.proteinG),
      state: cellStateOf(cell, {
        hasPortion,
        portionExpected,
        kcal,
        grams,
        density,
        delta,
        densityRounding: hit?.densityRounding ?? null,
      }),
    };
  });
}

/**
 * L'ÉTAT D'UNE CASE — ET LES TROIS GARDES TIENNENT SIMULTANÉMENT.
 *
 * ⛔ « TOUS LES GRAMMAGES ET COULOIRS APPLICABLES DOIVENT TENIR
 * SIMULTANÉMENT » est écrit dans le plan. Une case dans ±10 % mais hors de ses
 * bornes de masse n'est PAS conforme — et c'est la moitié qu'un contrôle
 * énergétique seul laisse passer: 450 g à la bonne densité et 900 g à la
 * moitié rendent le même nombre de kilocalories.
 */
function cellStateOf(
  cell: AuditCell,
  m: {
    hasPortion: boolean;
    portionExpected: boolean;
    kcal: number | null;
    grams: number | null;
    density: number | null;
    delta: number | null;
    /** ⟳ 2026-09-15 · BÊTA — la borne d'arrondi de la densité, `null` = inconnue. */
    densityRounding: number | null;
  },
): CellState {
  if (!m.hasPortion) return m.portionExpected ? "no_portion" : "not_personal";
  if (m.kcal === null) return "unmeasurable";
  if (cell.targetKcal === null || m.delta === null) return "no_target";
  if (Math.abs(m.delta) > MEAL_ENERGY_TOLERANCE) return "energy_off";
  if (
    m.grams !== null &&
    ((cell.gramsMin !== null && m.grams < cell.gramsMin) ||
      (cell.gramsMax !== null && m.grams > cell.gramsMax))
  ) return "bounds_off";
  // ⟳ 2026-09-14 · BÊTA 1C ⑤ — ON JUGE SUR LES BORNES EXACTES. Voir le pavé de
  // `densityMinExact`. Les entiers restent ce qu'on ÉNONCE; ce qu'on MESURE se
  // compare à ce que le contrat vaut vraiment.
  // ⟳ 2026-09-15 · BÊTA — LA BORNE D'ARRONDI EST CALCULÉE, PAS DÉCRÉTÉE. Une
  // case dont la densité est sous le couloir de MOINS que ce que l'arrondi
  // au gramme de ses items peut déplacer (`densityRoundingOf`) n'est pas hors
  // couloir: l'écriture entière l'y a mise. Au-delà, c'est la recette.
  const rounding = m.densityRounding ?? 0;
  if (
    m.density !== null &&
    ((cell.densityMinExact !== null && m.density + rounding < cell.densityMinExact) ||
      (cell.densityMaxExact !== null && m.density - rounding > cell.densityMaxExact))
  ) return "bounds_off";
  return "conforme";
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE PLANCHER PROTÉIQUE — l'EXISTANT, proraté, jamais un nouveau barème
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POURQUOI UN PLANCHER NE S'APPLIQUE PAS — nommé, jamais un `null` nu.
 *
 * ⛔ `protected` N'EST PAS `no_body`, ET LE PLAN L'EXIGE: « ne pas confondre
 * cette abstention légitime avec une donnée perdue sur un adulte dont le
 * calcul est autorisé ». Le plancher TCA et le mineur sortent une enveloppe
 * `per_portion` VOLONTAIREMENT; un adulte sans pesée sort la même enveloppe
 * par MANQUE. Le premier cas est le produit qui marche, le second est un trou.
 */
export const PROTEIN_FLOOR_REASONS = [
  /** Fenêtre = journée entière: le plancher s'applique tel quel. */
  "applied_full_day",
  /** Fenêtre partielle: le plancher est proraté au budget couvert. */
  "applied_covered_window",
  /** Porte de protection (plancher TCA, mineur, objectif absent). Abstention LÉGITIME. */
  "protected",
  /** Adulte dont le calcul est autorisé, mais dont le corps manque. Un TROU. */
  "no_body",
  /** On ne sait pas quelle fraction de la journée la fenêtre couvre. */
  "coverage_unknown",
] as const;
export type ProteinFloorReason = (typeof PROTEIN_FLOOR_REASONS)[number];

export interface ProteinFloorAllocation {
  /** Le plancher de la JOURNÉE ENTIÈRE, tel que `envelopeFor` le rend. */
  readonly dayFloorG: number | null;
  /** La part qui revient à la fenêtre effectivement composée. */
  readonly coveredFloorG: number | null;
  /** Le minimum par repas, quand il s'applique (`envelope.proteinPerMealG`). */
  readonly perMealFloorG: number | null;
  /** Les apports fixes déjà déduits — comptés UNE seule fois. */
  readonly fixedProteinG: number | null;
  /**
   * ⟳ 2026-09-21 — LE PLAFOND DE LA JOURNÉE ENTIÈRE (`proteinCeilingGFor`,
   * `PROTEIN_CEILING_G_PER_KG`). `null` = pas de plafond lisible (corps
   * absent, mineur, enveloppe protégée). Il vit à côté du plancher parce que
   * la garde le lit sur la MÊME ligne de journée, avec le même dénominateur.
   */
  readonly dayCeilingG: number | null;
  /**
   * La part du plafond qui revient à la fenêtre composée — LA MÊME règle de
   * trois que `coveredFloorG`, apports fixes déduits une fois. `null` quand le
   * plafond ou la couverture manque.
   */
  readonly coveredCeilingG: number | null;
  readonly reason: ProteinFloorReason;
}

/**
 * ALLOUE LE PLANCHER PROTÉIQUE EXISTANT À LA FENÊTRE COUVERTE.
 *
 * ── ⛔ AUCUN NOUVEAU BARÈME ──────────────────────────────────────────────
 * `dayFloorG` ARRIVE de `meal_envelope.ts::envelopeFor`, avec son poids de
 * référence (`protein_reference_weight.ts`) et ses trois exemptions. Ce corps
 * ne fait qu'une chose: une RÈGLE DE TROIS sur la part du jour qu'on compose.
 * Il n'invente ni g/kg, ni seuil, ni catégorie de corps.
 *
 * ── ⛔ NE PAS METTRE TOUTE LA JOURNÉE PROTÉIQUE SUR LE DÎNER ─────────────
 * C'est la faute que le lot B a fermée côté énergie, et elle se rejoue ici à
 * l'identique: un vendredi qui ne compose que son dîner ne doit pas 176 g de
 * protéine à une assiette. La fraction est `budget couvert / cible du jour` —
 * la MÊME que celle du contrat, jamais une seconde.
 *
 * ── ⚠️ LES APPORTS FIXES SONT COMPTÉS UNE FOIS ──────────────────────────
 * Ils sont retirés du plancher PROTÉIQUE, une fois, et seulement quand
 * l'appelant sait ce qu'ils apportent (`fixedProteinG`). `null` = on ne sait
 * pas ⇒ on ne retire rien, ce qui est la direction d'erreur SÛRE (on exige un
 * peu plus, jamais moins).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ ⟳ 2026-09-12 · ÉTAPE C1 — LE DOUBLE COMPTAGE QUI ÉTAIT ÉCRIT ICI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La fraction se calculait sur `coveredBudgetKcal`, qui est le budget **NET**:
 * le contrat en a déjà sorti les kcal du shaker (`slotPlanTargets` avec
 * `slotFixedKcal`). Un shaker de 120 kcal sur une journée de 2 000 rabotait
 * donc déjà le plancher de 6 %, PUIS on retranchait ses 24 g de protéine —
 * deux réductions pour un seul pot, dans le sens qui abaisse une exigence.
 *
 * Le plan de clôture l'écrit en toutes lettres: « calculer la part protéique
 * couverte **avant** la soustraction des apports fixes, puis retirer leurs
 * protéines **une fois** ». La fraction prend donc le budget **BRUT**
 * (`coveredBudgetGrossKcal`, contrat du 2026-09-12), et la soustraction
 * protéique reste là où elle était.
 *
 * ⚠️ SANS APPORT FIXE LE RÉSULTAT EST IDENTIQUE À L'OCTET — brut = net, et
 * `fixedProteinG` vaut `null`. Ce lot ne déplace aucun plancher d'un plan qui
 * ne déclare rien.
 */
/**
 * LA PART DE LA JOURNÉE QUE LES CASES COUVERTES PORTENT, bornée à 1.
 * `null` = cible du jour ou budget couvert illisible.
 *
 * ⚠️ LE RAPPORT EST BORNÉ À 1. Une redistribution autorisée peut faire
 * dépasser le budget couvert de quelques kilocalories la cible du jour; en
 * tirer « 104 % du plancher » serait durcir une exigence médicale sur un
 * arrondi.
 *
 * ⟳ 2026-09-25 — SORTIE D'`proteinFloorAllocation` pour que le plafond de la
 * table (`sharedProteinCaps`) proratise la journée partielle par la MÊME
 * règle: une seule écriture de « quelle part de la journée est à table ».
 */
export function coveredDayFraction(
  dayTargetKcal: number | null,
  coveredBudgetGrossKcal: number | null,
): number | null {
  const day = dayTargetKcal;
  const covered = coveredBudgetGrossKcal;
  if (day === null || !(day > 0) || covered === null || !(covered >= 0)) return null;
  return Math.min(1, covered / day);
}

export function proteinFloorAllocation(args: {
  /** `envelope.proteinFloorG` — `null` si l'enveloppe est `per_portion`. */
  dayFloorG: number | null;
  /** `envelope.proteinPerMealG` — `null` hors des trois cas qui le portent. */
  perMealFloorG: number | null;
  /** Pourquoi l'enveloppe s'abstient, quand elle s'abstient. */
  abstention: "none" | "protected" | "no_body";
  /**
   * ⟳ 2026-09-12 · C1 — LE BUDGET COUVERT **BRUT**, avant retrait des apports
   * fixes (`SlotNutritionContract.coveredBudgetGrossKcal`).
   *
   * ⛔ RENOMMÉ DEPUIS `coveredBudgetKcal`, ET LE RENOMMAGE EST LA GARDE. Un
   * paramètre optionnel ajouté à côté aurait laissé tous les appelants sur
   * l'ancien nombre — « paramètre de garde optionnel = garde désarmée », la
   * cicatrice n° 1 du dépôt. Le compilateur est le seul recenseur d'appelants
   * qui ne mente pas.
   */
  coveredBudgetGrossKcal: number | null;
  dayTargetKcal: number | null;
  fixedProteinG: number | null;
  /**
   * ⟳ 2026-09-21 — `proteinCeilingGFor(...)`, ou `null`. ⛔ REQUIS, jamais
   * `?`: le compilateur recense les appelants, et un appelant qui ne passe pas
   * le plafond ne doit pas compiler — sinon `protein_ceiling_over` serait une
   * cause qui ne sort jamais, et ressemblerait à une cause tenue.
   */
  dayCeilingG: number | null;
}): ProteinFloorAllocation {
  const base: Omit<
    ProteinFloorAllocation,
    "reason" | "coveredFloorG" | "coveredCeilingG"
  > = {
    dayFloorG: args.dayFloorG,
    perMealFloorG: args.perMealFloorG,
    fixedProteinG: args.fixedProteinG,
    dayCeilingG: args.dayCeilingG,
  };
  if (args.dayFloorG === null || !(args.dayFloorG > 0)) {
    return {
      ...base,
      coveredFloorG: null,
      coveredCeilingG: null,
      reason: args.abstention === "protected" ? "protected" : "no_body",
    };
  }
  const fraction = coveredDayFraction(args.dayTargetKcal, args.coveredBudgetGrossKcal);
  if (fraction === null) {
    return {
      ...base,
      coveredFloorG: null,
      coveredCeilingG: null,
      reason: "coverage_unknown",
    };
  }
  const gross = args.dayFloorG * fraction;
  const net = args.fixedProteinG === null
    ? gross
    : Math.max(0, gross - args.fixedProteinG);
  // ⟳ 2026-09-21 — LE PLAFOND SUIT LA MÊME RÈGLE DE TROIS, apports fixes
  // déduits une fois. Un plafond nul ou illisible ne fabrique rien.
  const ceilingGross = args.dayCeilingG !== null && args.dayCeilingG > 0
    ? args.dayCeilingG * fraction
    : null;
  const coveredCeilingG = ceilingGross === null
    ? null
    : args.fixedProteinG === null
    ? ceilingGross
    : Math.max(0, ceilingGross - args.fixedProteinG);
  return {
    ...base,
    coveredFloorG: net,
    coveredCeilingG,
    reason: fraction >= 1 ? "applied_full_day" : "applied_covered_window",
  };
}

/**
 * LA JOURNÉE, SOMME DES MÊMES PORTIONS QUE LES CASES.
 *
 * ⛔ PAS UNE SECONDE LECTURE. Les cases viennent de `cellNutritionTable`, la
 * journée les additionne. Deux bases de mesure dans le même rapport ont rendu
 * 2 370 là où les portions valent 2 455,69.
 *
 * ⛔ UNE JOURNÉE À TROU EST `unmeasurable`, PAS `energy_off`. Sa somme manque
 * une portion ENTIÈRE: publier « −40 % » ferait passer une mesure absente pour
 * de la nourriture absente, et les deux appellent des corrections opposées.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-15 · BÊTA 2C — L'ÉNERGIE PAR BOUCHE, SUR LA FENÊTRE ENTIÈRE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE CONTRÔLE N'AVAIT JAMAIS TOURNÉ SUR UNE SEULE GÉNÉRATION, et c'est
 * mesuré: le handler passait `energy: null` EN DUR à `finalPlanGate`, si bien
 * que `energyUnmeasured` valait le nombre de bouches, à chaque fois. Relu sur
 * les 25 tirs de la campagne du 2026-09-14, le compte d'`incomplete` pour
 * `mouth_energy` est EXACTEMENT le nombre de bouches du tir — 1 à N=1, 2 à
 * N=2, 4 à N=4. Ce n'était pas « un contrôle qui n'a pas pu conclure »:
 * c'était un contrôle qu'on n'a jamais branché, et `mouth_energy_short: 0` se
 * lisait « personne n'est sous-nourri » sur une mesure inexistante.
 *
 * ⚠️ LE COMMENTAIRE DU SITE D'APPEL DISAIT VRAI QUAND IL A ÉTÉ ÉCRIT (« ses
 * sources vivent dans des blocs que ce point du fichier ne voit pas ») et il
 * est devenu faux: `dayNutritionTable` est construite quatre lignes plus haut,
 * et elle porte tout ce qu'il faut.
 *
 * ── CE QUI ENTRE, ET CE QUI N'ENTRE PAS ───────────────────────────────────
 *
 * On n'additionne QUE les journées entièrement lues et budgétées. Une journée
 * à trou ferait une somme servie plus basse que la réalité, donc un faux
 * « sous-nourrie » — la direction d'erreur la plus coûteuse, puisqu'elle
 * accuse un plan correct.
 *
 * ⛔ UNE BOUCHE SANS AUCUN BUDGET N'EST PAS RENDUE DU TOUT. C'est l'abstention
 * légitime (âge inconnu, corps absent, profil protégé), et elle est DÉJÀ
 * nommée, case par case, par `cell_energy_no_target` — que `plan_validation`
 * publie en `not_applicable`. La redire ici la ferait compter une seconde fois,
 * à une autre granularité, sous un autre mot: la personne lirait « contrôle
 * incomplet » là où une protection a simplement fermé. C'est exactement le
 * faux positif que le lot du 2026-09-13 a retiré des cases.
 *
 * ⚠️ UNE BOUCHE QUI A UN BUDGET ET DONT RIEN N'EST LISIBLE EST RENDUE, avec une
 * enveloppe à zéro: la garde la compte alors en `energy_unmeasured`, et
 * « incomplet » veut enfin dire ce qu'il dit.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mouthEnergyTable(
  days: readonly DayNutritionRow[],
): readonly {
  readonly memberId: string;
  readonly envelopeKcal: number;
  readonly deliveredKcal: number;
}[] {
  const byMouth = new Map<
    string,
    { budget: number; served: number; budgeted: number; complete: number }
  >();
  for (const d of days) {
    const id = String(d.memberId ?? "").trim();
    if (id === "") continue;
    const acc = byMouth.get(id) ??
      { budget: 0, served: 0, budgeted: 0, complete: 0 };
    const budget = d.coveredBudgetKcal;
    const hasBudget = typeof budget === "number" && Number.isFinite(budget) &&
      budget > 0;
    if (hasBudget) acc.budgeted++;
    const served = d.servedKcal;
    // ⛔ `cellsMeasured === cellsExpected` ET PAS `state === "conforme"`: un
    // jour COMPLET mais hors bande est `energy_off` — c'est un jour lu, et
    // l'écarter ferait disparaître de la somme précisément les journées que ce
    // contrôle existe pour voir.
    if (
      hasBudget && typeof served === "number" && Number.isFinite(served) &&
      d.cellsExpected > 0 && d.cellsMeasured === d.cellsExpected
    ) {
      acc.budget += budget;
      acc.served += served;
      acc.complete++;
    }
    byMouth.set(id, acc);
  }
  const out: { memberId: string; envelopeKcal: number; deliveredKcal: number }[] =
    [];
  for (const [memberId, acc] of byMouth) {
    // Aucun budget nulle part: abstention déjà nommée par les cases.
    if (acc.budgeted === 0) continue;
    if (acc.complete === 0) {
      out.push({ memberId, envelopeKcal: 0, deliveredKcal: 0 });
      continue;
    }
    out.push({
      memberId,
      envelopeKcal: Math.round(acc.budget),
      deliveredKcal: Math.round(acc.served),
    });
  }
  return out;
}

export function dayNutritionTable(args: {
  cells: readonly CellNutritionRow[];
  /** Par `memberId|date`: le budget couvert et l'allocation protéique. */
  days: readonly {
    memberId: string;
    date: string;
    coveredBudgetKcal: number | null;
    protein: ProteinFloorAllocation;
  }[];
}): readonly DayNutritionRow[] {
  return args.days.map((d) => {
    const mine = args.cells.filter((c) => c.memberId === d.memberId && c.date === d.date);
    // ⟳ 2026-09-23 — LA JOURNÉE ADDITIONNE PLAT + À-CÔTÉS. Une colonne absente
    // (ligne construite à la main, d'avant les à-côtés) vaut « aucun à-côté »;
    // `null` vaut « un à-côté illisible », et la case n'est alors PAS mesurée
    // pour la journée: sa somme manquerait une part entière, et publier l'écart
    // ferait passer une mesure absente pour de la nourriture absente.
    const sideOf = (c: CellNutritionRow): number | null => c.sideKcal === undefined ? 0 : c.sideKcal;
    const sideProteinOf = (c: CellNutritionRow): number | null =>
      c.sideProteinG === undefined ? 0 : c.sideProteinG;
    const measured = mine.filter((c) => c.servedKcal !== null && sideOf(c) !== null);
    const served = measured.reduce((n, c) => n + (c.servedKcal ?? 0) + (sideOf(c) ?? 0), 0);
    const sides = mine.every((c) => sideOf(c) !== null)
      ? mine.reduce((n, c) => n + (sideOf(c) ?? 0), 0)
      : null;
    const protein = mine.every((c) => c.proteinG !== null && sideProteinOf(c) !== null)
      ? mine.reduce((n, c) => n + (c.proteinG ?? 0) + (sideProteinOf(c) ?? 0), 0)
      : null;
    const proteinRounding = protein === null
      ? null
      : mine.reduce((n, c) => n + (c.proteinRoundingG ?? 0), 0);
    const complete = measured.length === mine.length && mine.length > 0;
    const budget = d.coveredBudgetKcal;
    const delta = complete && budget !== null && budget > 0
      ? (served - budget) / budget
      : null;
    return {
      memberId: d.memberId,
      date: d.date,
      cellsExpected: mine.length,
      cellsMeasured: measured.length,
      coveredBudgetKcal: budget,
      servedKcal: measured.length > 0 ? served : null,
      deltaPct: delta === null ? null : delta * 100,
      proteinG: protein,
      proteinRoundingG: proteinRounding,
      protein: d.protein,
      state: delta === null
        ? "unmeasurable"
        : Math.abs(delta) <= COVERED_DAY_ENERGY_TOLERANCE
        ? "conforme"
        : "energy_off",
      sideKcal: sides,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTILS
// ═══════════════════════════════════════════════════════════════════════════

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
