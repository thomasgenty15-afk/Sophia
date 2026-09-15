/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL · ÉTAPE C3 (2026-09-12) — LES ACHATS SE PRODUISENT DEPUIS LE PLAN
 * FINAL ARRONDI, ET DEPUIS LES LOTS RÉELLEMENT CUISINÉS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ CE QUE CE MODULE REMPLACE, ET POURQUOI IL FALLAIT LE REMPLACER ─────
 * Le handler suivait les courses par un RAPPORT de demande : `demandByTerm()`
 * relevé avant, relevé après, et chaque ligne multipliée par `après / avant`.
 * Deux lectures de PROSE décidaient donc d'un achat, et elles devaient rester
 * d'accord :
 *   · `demandByTerm` (`index.ts:10399`) classait une ligne d'ingrédient par
 *     son `unit` structuré ;
 *   · la classe de la ligne de courses (`index.ts:14694`) la classait par une
 *     EXPRESSION RÉGULIÈRE sur son texte.
 * C2 a dû réparer ce couple en urgence : l'arrondi convertissait « 0,77 c. à
 * s. » en « 12 ml », l'huile changeait de classe entre les deux relevés,
 * `après = 0` sur sa classe, et **la ligne d'huile était SUPPRIMÉE**
 * (`lines_dropped`). Le plan de clôture l'écrit : « ne pas laisser deux
 * classifications divergentes derrière ».
 *
 * ⛔ IL N'Y A PLUS DE CLASSIFICATION DU TOUT. On ne suit plus un rapport : on
 * RECALCULE le besoin depuis le plan final, par identité alimentaire, avec le
 * seul résolveur du dépôt (`resolveIngredients`). Une ligne ne peut plus
 * changer de classe entre deux relevés parce qu'il n'y a plus de classes.
 *
 * ── ⛔ AUCUNE ARITHMÉTIQUE NOUVELLE ──────────────────────────────────────
 * Les grammes crus viennent de `resolveIngredients` ligne par ligne — la même
 * fonction que l'audit, que la mesure d'énergie et que le contrôle de portion.
 * Une seconde conversion diverge au premier rendement.
 *
 * ── ⛔ UNE VALEUR ABSENTE RESTE INCONNUE ─────────────────────────────────
 * Un besoin non pesable ne devient jamais zéro, et jamais un gramme inventé :
 * la ligne garde son texte et se COMPTE dans `unquantified`.
 *
 * ── ⟳ LOT 1 (2026-09-12) — ET LA LISTE ELLE-MÊME EST PRODUITE ────────────
 * C3 s'arrêtait à la QUANTITÉ : il parcourait les lignes que le modèle avait
 * écrites. Le lot 1 produit les lignes MANQUANTES depuis les besoins finaux,
 * regroupe les doublons d'identité et déduit le garde-manger connu. Le pavé
 * complet est au-dessus de `RebuildableShoppingLine`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import {
  type CompositionIndex,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
  normalizeTerm,
  resolveIngredients,
} from "./food_composition.ts";
import {
  aisleForFood,
  SHELF_STABLE_SLUGS,
  foodIdentityOf,
  freshnessGroupOf,
  type IdentifiableLine,
  isNonPurchasableIdentity,
} from "./shopping_identity.ts";
import { type QuantityLocale, renderQuantity } from "./quantity_render.ts";
import { readQuantityFromProse } from "./quantity_from_prose.ts";
import type { FoodGroupRef } from "./tokens.ts";
// ⚠️ TYPE SEUL — `meal_generation.ts` n'importe pas ce module aujourd'hui, mais
// l'import de type est effacé à la compilation : le jour où il le ferait, le
// cycle n'existerait toujours pas au runtime.
import type { ShoppingAisle } from "./meal_generation.ts";

/** Le besoin d'une identité, tel que le plan FINAL l'exprime. */
export interface ShoppingNeed {
  readonly identity: string;
  /** Le slug, quand l'identité en est un. */
  readonly ref: string | null;
  /** Un libellé représentatif — pour NOMMER, jamais pour décider. */
  readonly term: string;
  /** Grammes CRUS/ACHETABLES, par `resolveIngredients`. `null` = non pesable. */
  readonly gramsRaw: number | null;
  /**
   * LA QUANTITÉ DANS L'UNITÉ DU PLAN, quand TOUTES les lignes de ce besoin
   * partagent la même unité et sont déclarées crues.
   *
   * ⛔ POURQUOI CETTE CONDITION EST DURE. « 2 pitas » et « 60 g de pita » dans
   * le même plan ne s'additionnent pas sans passer par le référentiel ; et une
   * ligne `state: "cooked"` porte une masse CUITE, qu'on n'achète pas.
   * Dès qu'un de ces deux cas apparaît, on retombe sur les grammes crus, qui
   * sont la seule grandeur commune.
   */
  readonly amount: number | null;
  readonly unit: CompositionUnit | null;
  readonly lines: number;
  /** Lignes de besoin que le référentiel n'a pas su peser. */
  readonly unweighed: number;
  /** `false` pour l'eau du robinet. Voir `NON_PURCHASABLE_SLUGS`. */
  readonly purchasable: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — OÙ ET QUAND CE BESOIN EST CONSOMMÉ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QUE LEUR ABSENCE COÛTAIT. Le besoin était une SOMME: « 400 g de
   * saumon ». La datation prenait ensuite la cuisson la PLUS TÔT, et la garde
   * finale le besoin le PLUS TÔT — donc un saumon cuisiné lundi ET vendredi
   * était acheté dimanche, les deux contrôles étaient contents, et le filet du
   * vendredi avait cinq jours. Le plan de clôture l'exige en toutes lettres :
   * « vérifier chaque usage, pas uniquement la première cuisson d'un
   * ingrédient utilisé plusieurs fois ».
   *
   * ⚠️ UN JETON DE JOUR, PAS UNE DATE. Ce module ne connaît ni le début du plan
   * ni sa fenêtre : il rend ce qu'il a lu, et `purchasesForNeed`
   * (`shopping_purchases.ts`) fait la répartition à partir des RANGS que
   * l'appelant résout. Une seconde arithmétique de date ici serait le jumeau
   * que `grocery_waves.ts` a déjà tué une fois.
   */
  readonly uses: readonly {
    /** Le jour de cuisson du lot, ou le jour du plat. `null` = pas de jour. */
    readonly dayToken: string | null;
    /** La masse crue de CET usage. `null` = le référentiel ne l'a pas pesé. */
    readonly gramsRaw: number | null;
  }[];
}

/**
 * LE BESOIN DU PLAN, PAR IDENTITÉ — depuis les recettes et les lots à cuisiner.
 *
 * ⛔ LES CONTENANTS NE SONT PAS LUS. 260 g de riz CUIT dans une boîte ne
 * s'achètent pas ; c'est la casserole qui porte le riz cru. Même règle que
 * `shoppingIdentityAudit`, et pour la même raison.
 */
export interface ShoppingNeeds {
  readonly needs: Map<string, ShoppingNeed>;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ LA TABLE D'ALIAS QUE LE PLAN PORTE LUI-MÊME — terme normalisé →
   *    identité de l'ingrédient qui l'écrit.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT MESURÉ, SUR UN RUN RÉEL DU BANC (2026-09-12) ───────────
   * L'ingrédient porte l'identifiant du modèle, la ligne de courses n'en porte
   * aucun — et les deux côtés partent alors de deux résolutions différentes.
   * Mesuré sur le plan `44390f2e` : l'ingrédient écrit `ref: lamb_leg`
   * (« gigot d'agneau »), la ligne de courses « agneau » atteint `lamb` par
   * son libellé ⇒ **deux identités pour le même achat**, la ligne reste sans
   * quantité et le besoin se déclare « non acheté ». Idem pour
   * `petit_suisse_cream_cheese` (ligne non résolue du tout).
   *
   * ⛔ ÉGALITÉ EXACTE DE TERMES NORMALISÉS, ET RIEN D'AUTRE. Pas de
   * sous-chaîne, pas de distance d'édition, pas de devinette de langue : ce
   * dépôt a mesuré **12 faux positifs sur 12** avec un matcher artisanal
   * (`never-hand-roll-a-matcher-here`). Deux chaînes IDENTIQUES après
   * normalisation ne sont pas un rapprochement approximatif ; c'est la même
   * ligne, écrite deux fois dans le même document.
   *
   * ⚠️ C'EST LA MÊME RÈGLE QUE `final_plan_audit.ts`, et c'est voulu : l'audit
   * l'appliquait déjà, la reconstruction ne l'avait pas — donc l'audit et les
   * quantités écrites pouvaient diverger sur la même ligne.
   */
  readonly identityByTerm: Map<string, string>;
}

export function shoppingNeedsOf(args: {
  index: CompositionIndex | null;
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — `day` EST LU QUAND IL EST LÀ. Un
   * ingrédient écrit sur le plat est acheté pour CE jour-là ; sans lui, le
   * besoin n'a pas d'usage daté et il retombe sur le premier jour du plan.
   */
  dishes: readonly {
    ingredients?: readonly CompositionInput[] | null;
    day?: string | null;
  }[];
  /** ⟳ 2026-09-12 · FERMETURE LOT 2 — `cookOn` date les ingrédients du lot. */
  preparations: readonly {
    ingredients?: readonly CompositionInput[] | null;
    cookOn?: string | null;
  }[];
}): ShoppingNeeds {
  const acc = new Map<string, {
    identity: string;
    ref: string | null;
    term: string;
    gramsRaw: number | null;
    lines: number;
    unweighed: number;
    /** L'unité commune, `false` dès qu'elle se contredit. */
    unit: CompositionUnit | null | false;
    amount: number;
    uses: { dayToken: string | null; gramsRaw: number | null }[];
  }>();
  const identityByTerm = new Map<string, string>();
  const feed = (ing: CompositionInput, dayToken: string | null) => {
    const id = foodIdentityOf(args.index, ing);
    const cle = normalizeTerm(ing.term);
    if (cle && !identityByTerm.has(cle)) identityByTerm.set(cle, id.identity);
    let row = acc.get(id.identity);
    if (row === undefined) {
      row = {
        identity: id.identity,
        ref: id.identity.includes(":") ? null : id.identity,
        term: ing.term,
        gramsRaw: null,
        lines: 0,
        unweighed: 0,
        unit: null,
        amount: 0,
        uses: [],
      };
      acc.set(id.identity, row);
    }
    row.lines += 1;
    // ⛔ UNE LIGNE À LA FOIS, PAR LA FONCTION DE PRODUCTION. Réécrire ici
    // l'enchaînement `resolveCompositionLine → gramsRawOf → prose → condiment`
    // ferait une SECONDE arithmétique de la masse crue (cicatrice de
    // `final_plan_audit.ts::weighLine`, mot pour mot).
    const res = args.index === null ? null : resolveIngredients(args.index, [ing]);
    const grams = res?.resolved[0]?.gramsRaw ?? null;
    if (grams === null || !Number.isFinite(grams)) row.unweighed += 1;
    else row.gramsRaw = (row.gramsRaw ?? 0) + grams;
    // ⛔ CHAQUE LIGNE EST UN USAGE, AVEC SON JOUR ET SA MASSE. C'est la seule
    // façon de savoir si UN achat suffit, ou s'il en faut deux.
    row.uses.push({
      dayToken: dayToken === null || dayToken.trim() === "" ? null : dayToken.trim(),
      gramsRaw: grams === null || !Number.isFinite(grams) ? null : grams,
    });
    // L'unité commune: `false` une fois contredite, et elle ne revient pas.
    const usable = typeof ing.amount === "number" && Number.isFinite(ing.amount) &&
      ing.amount > 0 && ing.unit != null && ing.state !== "cooked";
    if (row.unit === false) return;
    if (!usable) {
      row.unit = false;
      return;
    }
    if (row.unit !== null && row.unit !== ing.unit) {
      row.unit = false;
      return;
    }
    row.unit = ing.unit as CompositionUnit;
    row.amount += ing.amount as number;
  };
  for (const prep of args.preparations) {
    for (const ing of prep.ingredients ?? []) feed(ing, prep.cookOn ?? null);
  }
  for (const dish of args.dishes) {
    for (const ing of dish.ingredients ?? []) feed(ing, dish.day ?? null);
  }

  const needs = new Map<string, ShoppingNeed>();
  for (const row of acc.values()) {
    const unit = row.unit === false ? null : row.unit;
    needs.set(row.identity, {
      identity: row.identity,
      ref: row.ref,
      term: row.term,
      gramsRaw: row.gramsRaw,
      // ⚠️ L'UNITÉ DU PLAN D'ABORD (« 2 pitas » se lit et s'achète), les
      // grammes crus ensuite. L'inverse écrirait « 120 g de pita » sur une
      // liste de courses, ce qui ne s'achète pas.
      amount: unit === null ? row.gramsRaw : row.amount,
      unit: unit === null ? (row.gramsRaw === null ? null : "g") : unit,
      lines: row.lines,
      unweighed: row.unweighed,
      purchasable: !isNonPurchasableIdentity(row.identity),
      uses: row.uses,
    });
  }
  return { needs, identityByTerm };
}


// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT 1 (2026-09-12) — LES ACHATS NE SONT PLUS DÉCIDÉS PAR LE MODÈLE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── ⛔ CE QUI RESTAIT OUVERT, ET CE QUE ÇA A COÛTÉ ───────────────────────
// C3 recalculait la QUANTITÉ de chaque ligne, mais parcourait les lignes que
// le MODÈLE avait écrites : « le modèle décide encore quels achats existent ;
// le calcul ne fait que corriger leurs quantités » (revue de clôture C6, § 5).
// L'ancien corps refusait explicitement d'ajouter une ligne absente pour
// préserver le signal `ingredient_not_bought`. Mesuré sur la campagne des six
// tirs du 2026-09-12 : **deux plans sur six refusés** pour un achat que le
// modèle n'avait pas écrit — « champignons de Paris » (tir 1, faux positif
// d'identité) et « blancs d'œuf » (tir 3, vrai oubli, 15 unités demandées
// contre 19 œufs ENTIERS listés).
//
// ── ⛔ LA SOLUTION N'EST PAS DE CHOISIR ENTRE REFUSER ET MASQUER ─────────
// La revue l'écrit : « les omissions initiales peuvent rester mesurées même
// après leur correction déterministe ». La ligne manquante est donc PRODUITE
// depuis le besoin final, et l'omission est COMPTÉE — `model_omitted` et
// `omitted[]`. Passer `ingredient_not_bought` de `refuse` à `count` aurait
// masqué le manque sans construire l'achat ; produire la ligne sans compter
// aurait effacé la preuve que le modèle l'avait oubliée.
//
// ── ⛔ TOUJOURS AUCUN MATCHER ────────────────────────────────────────────
// Le rapprochement reste l'IDENTITÉ alimentaire, ou l'égalité EXACTE de termes
// normalisés (`identityByTerm`). Ce dépôt a mesuré 12 faux positifs sur 12
// avec un rapprochement approximatif (`never-hand-roll-a-matcher-here`).

/**
 * UNE LIGNE DE COURSES, VUE PAR LA RECONSTRUCTION. Mutable sur ce qu'elle
 * transporte, et sur rien d'autre — ni le rayon, ni la date d'achat, ni le
 * geste du congélateur, qui sont décidés ailleurs.
 */
export interface RebuildableShoppingLine extends IdentifiableLine {
  quantity: string | null;
  amount?: number | null;
  unit?: CompositionUnit | null;
  state?: string | null;
  purchasable?: boolean;
}

/**
 * UNE LIGNE QUE LA RECONSTRUCTION A PRODUITE — pas une ligne réécrite.
 *
 * ⛔ TOUS LES CHAMPS DE `ShoppingItem` SONT ÉCRITS, `null` COMPRIS. C'est la
 * règle du type qu'elle rejoint : « requis, jamais `?` — le compilateur est le
 * seul recenseur d'écrivains qui ne mente pas ». `buy_on` et
 * `freeze_on_purchase` sont les deux seules absences, et elles sont VOULUES :
 * ils sont posés APRÈS, par `grocery_waves.ts`, pour toutes les lignes à la
 * fois. Les poser ici ferait une seconde arithmétique de la date.
 *
 * ⚠️ ELLE EST STRUCTURELLEMENT ASSIGNABLE À `ShoppingItem`, et c'est ce qui
 * permet à la lane de rendre la liste reconstruite sans une couche de
 * conversion — donc sans un endroit de plus où un champ se perd en silence.
 */
export interface SynthesizedShoppingLine {
  term: string;
  quantity: string | null;
  aisle: ShoppingAisle;
  ref: string | null;
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  purchasable: boolean;
  food_group: FoodGroupRef | null;
}

/**
 * CE QUE LA PERSONNE DIT AVOIR DÉJÀ — la forme de `pantry_input.ts`.
 *
 * ⚠️ `quantity` EST DE LA PROSE LIBRE, et c'est tout ce que le produit
 * collecte : `household_pantry` n'a pas de colonne de quantité. La lecture est
 * celle de `readQuantityFromProse`, qui ne lit AUCUN mot — « 3 boîtes » rend
 * `null`, et `null` veut dire « présence seule ».
 */
export interface PantryLine {
  term: string;
  quantity?: string | null;
}

export interface ShoppingRebuildCounts {
  lines: number;
  /** Lignes dont la quantité a été RÉÉCRITE depuis le plan final. */
  requantified: number;
  /** Lignes déjà exactes: rien à faire. */
  unchanged: number;
  /** Présentes au plan, besoin non pesable ⇒ texte gardé, quantité inconnue. */
  unquantified: number;
  /** Lignes retirées parce que leur aliment a QUITTÉ le plan. */
  dropped: number;
  /**
   * ⛔ RATTACHÉES À RIEN — ELLES RESTENT. C'est le troisième sort, et le
   * compteur qui a manqué au filtre que ce lot remplace.
   */
  unattributed: number;
  /** Lignes marquées non achetables (eau du robinet). */
  not_purchasable: number;
  /**
   * ⛔ CE COMPTEUR DOIT VALOIR ZÉRO, ET C'EST DEVENU UNE GARDE.
   *
   * Avant le lot 1 il mesurait les oublis du modèle ; ceux-là s'appellent
   * désormais `model_omitted`. Ici il ne reste qu'un INVARIANT : tout besoin
   * achetable du plan final porte une ligne à la sortie de cette fonction.
   * Non nul, il dit qu'une synthèse a été sautée — c'est-à-dire que le défaut
   * que ce lot ferme est revenu par une autre porte. Même posture que
   * `counted_fractional` chez `finalizeQuantityProse`.
   */
  needs_unbought: number;
  /**
   * ⟳ LOT 1 — DEUX LIGNES DU MODÈLE POUR LE MÊME ALIMENT : LA SECONDE PART.
   *
   * ⛔ CE N'EST PAS LE QUATRIÈME SORT, C'EST UN REGROUPEMENT. « citron » et
   * « citrons » atteignent la MÊME identité ; les garder toutes les deux
   * écrivait la quantité ENTIÈRE du besoin sur CHACUNE — donc faisait acheter
   * deux fois. Le retrait se NOMME (c'est la même identité, déjà au panier),
   * il ne repose sur aucun doute.
   */
  merged: number;
  /**
   * ⛔ LES OUBLIS DU MODÈLE, MESURÉS MÊME UNE FOIS RÉPARÉS. C'est la demande
   * explicite de la revue : « les omissions initiales peuvent rester mesurées
   * même après leur correction déterministe ». Non nul, il dit combien
   * d'achats le modèle n'avait pas écrits — et `omitted[]` les NOMME.
   */
  model_omitted: number;
  /** Lignes réellement produites depuis un besoin. Égal à `model_omitted`
   * moins les besoins que le garde-manger couvre entièrement. */
  synthesized: number;
  /**
   * Lignes produites SANS quantité : le référentiel n'a pas su peser le
   * besoin, ou le plan mélange deux unités sur le même aliment. ⛔ La ligne
   * existe quand même — un achat sans nombre se corrige au magasin, un achat
   * absent s'aperçoit devant la casserole.
   */
  synthesized_unquantified: number;
  /** Lignes produites dont le rayon n'a pas pu se dériver ⇒ `other`. */
  aisle_other: number;
  /** ⟳ LOT 3 — lignes rangées en épicerie parce qu'elles se CONSERVENT. */
  aisle_shelf_stable: number;
  /** Lignes de garde-manger lues. Zéro = aucun garde-manger n'a été passé. */
  pantry_lines: number;
  /** Besoins dont une part connue du stock a été retirée de l'achat. */
  pantry_deducted: number;
  /** Besoins entièrement couverts par un stock connu ⇒ aucune ligne. */
  pantry_covered: number;
  /**
   * ⛔ PRÉSENCE SANS QUANTITÉ ⇒ LE BESOIN RESTE ENTIER, ET SE MARQUE. « Ne pas
   * inventer une quantité de stock si seule sa présence est déclarée » : le
   * besoin reste visible, chiffré, et `pantryCheck[]` le nomme pour que
   * l'appelant écrive « stock à vérifier ».
   */
  pantry_unknown: number;
}

export function emptyShoppingRebuildCounts(): ShoppingRebuildCounts {
  return {
    lines: 0,
    requantified: 0,
    unchanged: 0,
    unquantified: 0,
    dropped: 0,
    unattributed: 0,
    not_purchasable: 0,
    needs_unbought: 0,
    merged: 0,
    model_omitted: 0,
    synthesized: 0,
    synthesized_unquantified: 0,
    aisle_other: 0,
    aisle_shelf_stable: 0,
    pantry_lines: 0,
    pantry_deducted: 0,
    pantry_covered: 0,
    pantry_unknown: 0,
  };
}

/** Le stock connu d'une identité, accumulé depuis le garde-manger. */
interface PantryStock {
  amount: number;
  unit: CompositionUnit | null;
  /** `true` dès qu'une ligne de ce stock n'est pas lisible: on ne déduit plus. */
  unknown: boolean;
}

/**
 * LE GARDE-MANGER, RANGÉ PAR IDENTITÉ ALIMENTAIRE.
 *
 * ⛔ MÊME RÉSOLVEUR QUE TOUT LE RESTE. Un garde-manger rapproché par libellé
 * rendrait « citrons » étranger à « citron » — le défaut que ce module entier
 * existe pour supprimer, rejoué sur l'entrée de la personne.
 *
 * ⛔ DEUX LIGNES DU MÊME ALIMENT S'ADDITIONNENT SI ELLES SE LISENT, et la
 * première illisible éteint la déduction pour cette identité. Additionner
 * « 200 g » et « un paquet » demanderait de décider ce que pèse un paquet.
 */
function pantryStocks(
  index: CompositionIndex | null,
  pantry: readonly PantryLine[],
): Map<string, PantryStock> {
  const out = new Map<string, PantryStock>();
  for (const entry of pantry) {
    const term = String(entry?.term ?? "").trim();
    if (term === "") continue;
    const identity = foodIdentityOf(index, { term }).identity;
    let row = out.get(identity);
    if (row === undefined) {
      row = { amount: 0, unit: null, unknown: false };
      out.set(identity, row);
    }
    const prose = readQuantityFromProse(entry.quantity ?? null);
    if (prose === null) {
      row.unknown = true;
      continue;
    }
    if (row.unit === null) row.unit = prose.unit;
    // ⛔ AUCUNE CONVERSION ENTRE UNITÉS. « 2 » et « 200 g » du même aliment ne
    // s'additionnent pas sans le poids d'une pièce, et ce module ne pèse rien.
    else if (row.unit !== prose.unit) {
      row.unknown = true;
      continue;
    }
    row.amount += prose.amount;
  }
  return out;
}

/** Ce que l'achat d'un besoin doit porter, une fois le garde-manger déduit. */
type NeedPurchase =
  | { kind: "quantified"; amount: number; unit: CompositionUnit }
  | { kind: "unquantified" }
  | { kind: "covered" };

/**
 * RECONSTRUIT LA LISTE DE COURSES DEPUIS LE PLAN FINAL — LIGNE PAR LIGNE,
 * BESOIN PAR BESOIN.
 *
 * ⛔ QUATRE SORTS, ET LE DOUTE NE RETIRE TOUJOURS RIEN.
 *   · l'identité est demandée par le plan FINAL ⇒ la ligne reste, sa quantité
 *     est RÉÉCRITE depuis ce plan ;
 *   · l'identité était demandée AVANT et ne l'est plus ⇒ la ligne part. C'est
 *     le seul retrait par absence, et il peut se NOMMER ;
 *   · l'identité n'apparaît nulle part ⇒ la ligne RESTE, et se compte ;
 *   · l'identité porte DÉJÀ une ligne gardée ⇒ la seconde est REGROUPÉE dans
 *     la première (`merged`), sinon le besoin s'achèterait deux fois.
 *
 * ⛔ ET UN CINQUIÈME QUI N'EXISTAIT PAS : un besoin achetable SANS ligne est
 * PRODUIT (`synthesized`), et l'oubli du modèle reste compté (`model_omitted`).
 *
 * ⚠️ `removed` EST FOURNI PAR L'APPELANT, qui seul connaît l'état d'AVANT. Ce
 * module ne garde aucune mémoire entre deux appels — il serait alors le
 * troisième endroit à décider d'un achat.
 *
 * ⚠️ IDEMPOTENTE, ET C'EST TESTÉ. Un second passage sur la SORTIE du premier,
 * avec les mêmes besoins, rend les mêmes lignes dans le même ordre :
 * `requantified` et `synthesized` retombent à zéro, tout passe en `unchanged`.
 * La raison tient en une phrase : rien n'est calculé depuis la valeur
 * PRÉCÉDENTE d'une ligne — tout vient du plan et du garde-manger, qui ne
 * bougent pas entre deux passes.
 */
export function rebuildShoppingQuantities<L extends RebuildableShoppingLine>(args: {
  index: CompositionIndex | null;
  lines: readonly L[];
  needs: ReadonlyMap<string, ShoppingNeed>;
  /**
   * ⟳ C3 — la table d'alias que le plan porte lui-même (`shoppingNeedsOf`).
   * ⛔ REQUISE, pas optionnelle : sans elle, une ligne « agneau » et un
   * ingrédient `ref: lamb_leg` restent deux identités, et la ligne garde une
   * quantité périmée pendant que le besoin se déclare non acheté. Mesuré sur
   * le plan `44390f2e` du 2026-09-12.
   */
  identityByTerm: ReadonlyMap<string, string>;
  /** Identités présentes AVANT les mutations et absentes du plan final. */
  removed: ReadonlySet<string>;
  locale: QuantityLocale;
  /**
   * ⟳ LOT 1 — CE QUE LA PERSONNE A DÉJÀ.
   *
   * ⚠️ OPTIONNEL, ET LE COMPTEUR EST CE QUI L'ARME. Absent, il veut dire
   * « aucun garde-manger n'a été déclaré » — ce qui est le cas de TOUS les
   * écrans depuis le 2026-09-10 (`ComposeDraftInput` a perdu `pantry` avec la
   * lane individuelle). Un appelant qui l'oublierait le verrait dans
   * `pantry_lines: 0`, et c'est la seule différence avec un garde-manger vide.
   */
  pantry?: readonly PantryLine[];
}): {
  items: (L | SynthesizedShoppingLine)[];
  counts: ShoppingRebuildCounts;
  /** ⛔ VIDE PAR CONSTRUCTION depuis le lot 1. Voir `needs_unbought`. */
  unbought: ShoppingNeed[];
  /** Les besoins qu'aucune ligne du MODÈLE ne couvrait. Nommés. */
  omitted: ShoppingNeed[];
  /** Les besoins dont le garde-manger déclare une présence sans quantité. */
  pantryCheck: ShoppingNeed[];
  /** ⟳ 2026-09-12 · FERMETURE LOT 2 — grammes crus couverts par le stock. */
  pantryCoveredG: ReadonlyMap<string, number>;
} {
  const counts = emptyShoppingRebuildCounts();
  /**
   * ⟳ 2026-09-12 · LOT 3 — LE MODÈLE A-T-IL ÉCRIT UNE LISTE ? Vrai seulement
   * pour une réponse d'avant le lot 1 (ou une archive rejouée). C'est la
   * condition de `model_omitted` : sans liste, rien n'a été oublié.
   */
  const listeFournie = args.lines.length > 0;
  const items: (L | SynthesizedShoppingLine)[] = [];
  const covered = new Set<string>();
  const omitted: ShoppingNeed[] = [];
  const pantryCheck: ShoppingNeed[] = [];
  const stocks = pantryStocks(args.index, args.pantry ?? []);
  counts.pantry_lines = (args.pantry ?? []).length;

  // ⛔ UNE SEULE DÉCISION PAR IDENTITÉ, ET ELLE EST MÉMORISÉE. Les compteurs du
  // garde-manger sont des effets de bord : les recalculer pour une deuxième
  // ligne du même aliment compterait deux fois le même stock.
  const decided = new Map<string, NeedPurchase>();
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — CE QUE LE GARDE-MANGER A COUVERT, PAR
   * IDENTITÉ ET EN GRAMMES.
   *
   * ⛔ POURQUOI IL SORT. L'AUDIT des achats (`shoppingIdentityAudit`) compare
   * le besoin ENTIER du plan à ce qui est acheté. Quand cette fonction déduit
   * un stock, la ligne porte moins que le besoin — et l'audit lit alors
   * « pas assez acheté » sur un plan juste. C'est la mine notée dans
   * `RESTE-A-FAIRE.md` ; le plan de fermeture l'exige : « faire lire le même
   * stock/besoin net à l'audit des achats ».
   *
   * ⚠️ EN GRAMMES CRUS, l'unité commune des deux modules. Les unités du plan
   * (« 2 pitas ») ne se comparent pas d'un module à l'autre.
   */
  const pantryCovered = new Map<string, number>();
  const purchaseFor = (need: ShoppingNeed): NeedPurchase => {
    const known = decided.get(need.identity);
    if (known !== undefined) return known;
    const decision = decidePurchase(need, stocks.get(need.identity), counts, pantryCheck);
    decided.set(need.identity, decision);
    // ⛔ LA DÉDUCTION SE MESURE UNE FOIS PAR IDENTITÉ, ici et nulle part
    // ailleurs: `decided` mémorise la décision, donc ce bloc ne tourne qu'au
    // premier passage — la même règle que les compteurs juste au-dessus.
    if (need.gramsRaw !== null && Number.isFinite(need.gramsRaw)) {
      if (decision.kind === "covered") {
        pantryCovered.set(need.identity, need.gramsRaw);
      } else if (
        decision.kind === "quantified" && need.amount !== null &&
        need.amount > 0 && decision.amount < need.amount
      ) {
        // Le stock a couvert une PART du besoin: la même part des grammes.
        const part = 1 - decision.amount / need.amount;
        pantryCovered.set(
          need.identity,
          Math.max(0, Math.round(need.gramsRaw * part)),
        );
      }
    }
    return decision;
  };

  for (const line of args.lines) {
    counts.lines += 1;
    const direct = foodIdentityOf(args.index, line).identity;
    // ⛔ L'IDENTITÉ DE LA LIGNE D'ABORD, L'ALIAS DU PLAN ENSUITE — et jamais
    // l'inverse. Le pont ne sert que lorsque la ligne n'atteint aucun besoin :
    // il ne peut donc pas détourner une ligne qui en atteignait un.
    const parTerme = args.needs.has(direct)
      ? null
      : args.identityByTerm.get(normalizeTerm(line.term)) ?? null;
    const identity = parTerme ?? direct;
    const need = args.needs.get(identity);
    if (need === undefined) {
      if (args.removed.has(identity)) {
        counts.dropped += 1;
        continue;
      }
      counts.unattributed += 1;
      items.push(line);
      continue;
    }
    if (covered.has(identity)) {
      // ⛔ LE REGROUPEMENT. La première ligne porte déjà la TOTALITÉ du besoin.
      counts.merged += 1;
      continue;
    }
    covered.add(identity);
    if (!need.purchasable) {
      // ⛔ L'EAU DU ROBINET SORT DU PANIER, ET ELLE RESTE DANS LA RECETTE. La
      // ligne est gardée pour que rien ne disparaisse en silence; c'est le
      // drapeau qui dit à l'écran et à l'audit de ne pas la compter.
      counts.not_purchasable += 1;
      items.push({ ...line, purchasable: false, amount: null, unit: null, state: null });
      continue;
    }
    const purchase = purchaseFor(need);
    if (purchase.kind === "covered") {
      // Le stock connu suffit : il n'y a plus rien à acheter. Compté dans
      // `pantry_covered`, pas dans `dropped` — ce n'est pas un aliment sorti
      // du plan, c'est un achat devenu inutile.
      continue;
    }
    if (purchase.kind === "unquantified") {
      counts.unquantified += 1;
      items.push({ ...line, purchasable: true, amount: null, unit: null, state: null });
      continue;
    }
    const next = {
      ...line,
      purchasable: true,
      amount: purchase.amount,
      unit: purchase.unit,
      state: "raw",
    };
    // LE TEXTE EST DÉRIVÉ, par le MÊME rendu que les lignes de recette.
    const rendered = renderQuantity(
      { quantity: line.quantity, amount: purchase.amount, unit: purchase.unit },
      args.locale,
    );
    if (rendered.text !== null) next.quantity = rendered.text;
    const same = line.amount === purchase.amount && line.unit === purchase.unit &&
      line.quantity === next.quantity && line.purchasable !== false;
    if (same) counts.unchanged += 1;
    else counts.requantified += 1;
    items.push(next as L);
  }

  // ── ⟳ LOT 1 — LES BESOINS QU'AUCUNE LIGNE NE COUVRE SONT PRODUITS ───────
  // ⛔ L'ORDRE EST CELUI DES BESOINS (casseroles puis plats), et les lignes
  // produites sont AJOUTÉES EN QUEUE. Les insérer au milieu ferait bouger
  // l'ordre de la liste à chaque passe, donc l'ordre de l'écran, sans qu'aucun
  // achat ne change.
  for (const need of args.needs.values()) {
    if (!need.purchasable || covered.has(need.identity)) continue;
    covered.add(need.identity);
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ « OUBLIÉ PAR LE MODÈLE » SUPPOSE QU'ON LUI AIT DEMANDÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⟳ 2026-09-12 · LOT 3 — MESURÉ SUR LES TIRS RÉELS : `model_omitted:24`,
    // `:27`, `:22`, c'est-à-dire TOUTES les lignes. Depuis que le schéma du
    // prompt ne demande plus `shopping_list`, le modèle n'en écrit aucune — et
    // ce compteur, qui mesurait ce qu'il OUBLIAIT, s'est mis à mesurer « on ne
    // le lui a pas demandé ». Un compteur qui compte tout ne compte plus rien,
    // et celui-ci est la seule preuve qui reste d'une omission.
    //
    // ⚠️ LA CONDITION PORTE SUR LA LISTE D'ENTRÉE, pas sur la version du
    // prompt : une réponse ARCHIVÉE d'avant ce lot porte encore une liste, et
    // son oubli doit continuer de se compter. `listeFournie` est vrai
    // exactement dans ce cas.
    if (listeFournie) {
      counts.model_omitted += 1;
      omitted.push(need);
    }
    const purchase = purchaseFor(need);
    if (purchase.kind === "covered") continue;
    const quantified = purchase.kind === "quantified";
    if (!quantified) counts.synthesized_unquantified += 1;
    const amount = quantified ? purchase.amount : null;
    const unit = quantified ? purchase.unit : null;
    // ⛔ LE GROUPE VIENT DE LA RÉFÉRENCE, ET SEULEMENT QUAND L'IDENTITÉ EN EST
    // UNE. Sur `term:…` / `refused:…`, repartir du LIBELLÉ rendrait un groupe
    // pour un aliment qu'on vient de déclarer inconnu — c'est-à-dire la
    // résolution par libellé que `freshnessGroupOf` existe pour supprimer.
    const group = need.ref === null
      ? null
      : freshnessGroupOf(args.index, { term: need.term, ref: need.ref });
    // ⟳ 2026-09-12 · LOT 3 — LE GROUPE NE DIT PAS LA CONSERVATION. `tuna_fresh`
    // et `tuna_tinned` partagent `white_fish`; le rayon décide de la DATE
    // D'ACHAT (`PERISHABLE_AISLES`), donc se tromper ici refuse un plan.
    const aisle = aisleForFood(group, need.ref) ?? "other";
    if (aisle === "other") counts.aisle_other += 1;
    if (need.ref !== null && SHELF_STABLE_SLUGS.has(need.ref)) {
      counts.aisle_shelf_stable += 1;
    }
    const line: SynthesizedShoppingLine = {
      // ⛔ LE TERME EST CELUI DE L'INGRÉDIENT, MOT POUR MOT. Il est déjà dans
      // la langue de contenu du plan (`dishes[].ingredients[].term` et
      // `preparations[].ingredients[].term` sont dans
      // `MEAL_TRANSLATABLE_FIELDS`), et c'est aussi lui que `grocery_waves.ts`
      // compare pour dater l'achat. Le réécrire casserait les deux à la fois.
      term: need.term,
      quantity: renderQuantity({ quantity: null, amount, unit }, args.locale).text,
      aisle,
      ref: need.ref,
      amount,
      unit,
      state: amount === null ? null : "raw",
      purchasable: true,
      food_group: group,
    };
    items.push(line);
    counts.synthesized += 1;
  }

  const unbought: ShoppingNeed[] = [];
  for (const need of args.needs.values()) {
    // ⛔ LA GARDE. Après la boucle ci-dessus, tout besoin achetable est couvert
    // ou explicitement laissé au garde-manger. Non vide, cette liste dit qu'un
    // achat a été sauté — pas qu'un modèle a oublié quelque chose.
    if (!need.purchasable || covered.has(need.identity)) continue;
    counts.needs_unbought += 1;
    unbought.push(need);
  }
  return {
    items,
    counts,
    unbought,
    omitted,
    pantryCheck,
    /**
     * ⟳ 2026-09-12 · FERMETURE LOT 2 — CE QUE LE GARDE-MANGER A COUVERT, en
     * grammes crus, par identité. ⛔ L'AUDIT DOIT LE LIRE: sans lui, il compare
     * le besoin ENTIER à une ligne dont on a déduit le stock, et rend « pas
     * assez acheté » sur un plan juste.
     */
    pantryCoveredG: pantryCovered,
  };
}

/**
 * CE QU'IL RESTE À ACHETER D'UN BESOIN, UNE FOIS LE GARDE-MANGER DÉDUIT.
 *
 * ⛔ ON NE DÉDUIT QUE CE QU'ON SAIT. Une présence sans quantité laisse le
 * besoin ENTIER et se marque ; deux unités qui ne se convertissent pas aussi.
 * Inventer un gramme de stock ferait partir quelqu'un au magasin sans ce qu'il
 * lui faut, ce qui est exactement le coût que ce module entier existe pour
 * éviter.
 *
 * ⚠️ L'ARRONDI EST CELUI DE C2, PAS UN SECOND. Les `amount` du plan sont DÉJÀ
 * entiers quand la finalisation a tourné ; ce `round` ne mord que sur une somme
 * de grammes crus, qui n'est arrondie nulle part ailleurs.
 */
function decidePurchase(
  need: ShoppingNeed,
  stock: PantryStock | undefined,
  counts: ShoppingRebuildCounts,
  pantryCheck: ShoppingNeed[],
): NeedPurchase {
  if (need.amount === null || need.unit === null) {
    // ⚠️ SANS BESOIN CHIFFRÉ, AUCUN STOCK NE PEUT COUVRIR QUOI QUE CE SOIT: on
    // ne sait pas combien il en faut. La présence se marque quand même.
    if (stock !== undefined) {
      counts.pantry_unknown += 1;
      pantryCheck.push(need);
    }
    return { kind: "unquantified" };
  }
  let amount = need.amount;
  if (stock !== undefined) {
    if (stock.unknown || stock.unit === null || stock.unit !== need.unit) {
      counts.pantry_unknown += 1;
      pantryCheck.push(need);
    } else if (stock.amount >= amount) {
      counts.pantry_covered += 1;
      return { kind: "covered" };
    } else {
      amount -= stock.amount;
      counts.pantry_deducted += 1;
    }
  }
  const whole = Math.round(amount);
  // ⚠️ UN BESOIN QUI S'ARRONDIT À ZÉRO N'EFFACE PAS LA LIGNE. « Ne pas le
  // supprimer silencieusement » est la règle de C2, et elle vaut ici aussi.
  if (!(whole > 0)) return { kind: "unquantified" };
  return { kind: "quantified", amount: whole, unit: need.unit };
}
