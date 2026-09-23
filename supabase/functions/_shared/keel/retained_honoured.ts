/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLAN A-T-IL TENU CE QU'ON A RETENU ? — le verdict, souvenir par souvenir.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ─────────────────────────────────────────
 * Mesuré le 2026-09-21: RIEN ne dit si un souvenir a été honoré. La seule
 * vérification qui existe est la ceinture d'exclusion, et elle ne juge que ce
 * qu'elle sait résoudre en aliment, AU MOMENT DE COMPOSER — jamais la ligne
 * écrite. Un plan pouvait donc servir au petit-déjeuner exactement l'aliment
 * qu'une note venait de refuser, et le produit n'avait aucun endroit où ça se
 * voyait. C'est le zéro ambigu du dépôt, une fois de plus: « aucun souvenir »
 * et « aucun contrôle » rendaient le même silence.
 *
 * ── CE QUE CE MODULE N'EST PAS ────────────────────────────────────────────
 * ⛔ CE N'EST PAS UNE CEINTURE. Il ne retire rien, ne relance rien, ne refuse
 * rien: il LIT le plan déjà écrit et rend un constat. La ceinture agit avant;
 * celui-ci raconte après. Les deux ne peuvent pas diverger, parce qu'ils
 * partagent le MÊME matcher (`dishBitesExclusion`) — un second jugement écrit
 * à la main ici dirait « violé » là où la ceinture a laissé passer, et
 * personne ne saurait lequel croire.
 *
 * ⛔ ET IL N'Y A AUCUN MATCHER MAISON. « laitue » ≠ « lait », 12 faux positifs
 * sur 12 le jour où quelqu'un a cru le savoir. Les mots cherchés viennent de
 * `exclusionTermsFor`, la morsure de `dishBitesExclusion`, et l'échec de
 * résolution se COMPTE (`unverifiable`) au lieu d'être rendu vert.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import {
  dishBitesExclusion,
  type ExclusionPreparation,
  exclusionTermsFor,
} from "./food_exclusion_belt.ts";
import {
  HOUSEHOLD_SUBJECT,
  parseRetainedItem,
  type RetainedItem,
  type RetainedKind,
  type RetainedSubject,
  type RhythmOccasion,
} from "./retained_item.ts";

// ===========================================================================
// CE QUI ENTRE
// ===========================================================================

/**
 * UN SOUVENIR, RÉDUIT À CE QUE LE VERDICT LUI DEMANDE.
 *
 * ⚠️ `occasion` EST REQUIS ICI, jamais `?`, ET LE SOCLE NE LE PORTE PAS ENCORE.
 * C'est délibéré: le jour où `RetainedItem` gagne son moment, l'appelant le
 * recopie et rien ne bouge. Tant qu'il ne l'a pas, l'appelant doit écrire
 * `occasion: null` À LA MAIN — donc VOIR qu'il ne sait pas le moment, au lieu
 * d'hériter d'un défaut silencieux. Cicatrice nommée: « paramètre de garde
 * optionnel = garde désarmée ».
 */
export interface HonouredItem {
  readonly kind: RetainedKind;
  readonly text: string;
  readonly subject: RetainedSubject;
  /** `null` = la phrase ne nommait aucun moment: la règle vaut toute la journée. */
  readonly occasion: RhythmOccasion | null;
  /**
   * ⛔ LA FORCE DU REFUS — REQUIS, et `null` sur les familles qui veulent.
   *
   * ⚠️ `"less"` NE SE JUGE PAS SUR UN PLAN. « Moins de petit suisse » est une
   * comparaison avec ce qui était servi AVANT; un plan seul n'a pas ce
   * « avant ». Le rendre `honoured` parce que l'aliment est absent serait faux
   * (le plan n'en servait peut-être jamais), et `violated` parce qu'il est
   * présent le serait tout autant (une fois au lieu de quatre, c'est tenu).
   * Il sort donc `unverifiable / no_baseline` — un trou NOMMÉ.
   */
  readonly force: "never" | "less" | null;
  /**
   * ⛔ L'IDENTIFIANT DU RÉFÉRENTIEL — REQUIS, et `null` quand rien ne résout.
   *
   * ── CE QU'IL CHANGE ICI, ET C'EST TOUT LE LOT A ─────────────────────
   * Sans lui, ce module compare un TEXTE LIBRE à des termes libres, avec le
   * matcher de la ceinture — qui déplie les catégories, tolère un `s`, et
   * cherche des mots dans de la prose. C'est ce qu'on peut faire de mieux sur
   * du texte, et ça reste du texte.
   *
   * Avec lui, quand les DEUX côtés portent un slug, le verdict est une
   * ÉGALITÉ D'IDENTIFIANT: `oats` servi ou pas, sans interprétation. Les plats
   * en portent déjà un (`DishIngredient.ref`), posé par le même référentiel.
   *
   * ⚠️ ET LE CHEMIN PAR LES MOTS RESTE, pour les souvenirs qui ne résolvent
   * pas (4 sur 9 en base au 2026-09-22) et pour les plats dont le modèle n'a
   * pas écrit l'identifiant. Le retirer ferait passer tous ces cas de
   * « jugé approximativement » à « pas jugé » — un recul déguisé en rigueur.
   * Les deux chemins se COMPTENT séparément: c'est la seule mesure qui dise
   * si la mémoire devient exacte.
   */
  readonly ref: string | null;
}

/**
 * UN PLAT DU PLAN ÉCRIT, sur la MÊME surface que la ceinture.
 *
 * ⚠️ LES CASSEROLES SONT CITÉES, PAS RECOPIÉES. En cuisine par lots, la
 * protéine n'est pas dans le plat: le plat dit « une portion du poulet rôti de
 * mercredi » et le kilo de cuisses vit dans la préparation. Ne lire que le plat
 * manquerait très exactement ce qui a été mangé — cicatrice
 * `preparations-must-be-folded-into-dishes`.
 */
export interface HonouredDish {
  /** Le jeton du jour (`DAY_TOKENS`). Sert à NOMMER le plat fautif. */
  readonly day: string;
  /** Le moment (`RHYTHM_OCCASIONS`). C'est lui que l'`occasion` d'un item filtre. */
  readonly slot: string;
  readonly title: string;
  readonly method: string;
  /**
   * Ce que le plat DÉCLARE porter. ⛔ Jamais sa prose: un titre n'est pas une
   * preuve.
   *
   * ⟳ 2026-09-22 — `ref` À CÔTÉ DE `term`, et `null` est une réponse (le
   * modèle ne l'a pas écrit, ou il a écrit un identifiant refusé). C'est le
   * champ que le plan porte déjà (`DishIngredient.ref`).
   */
  readonly ingredients: readonly {
    readonly term: string;
    readonly ref: string | null;
  }[];
  /** Les casseroles citées par ce plat. */
  readonly uses: readonly { readonly preparationId: string }[];
  /**
   * LES BOUCHES SERVIES PAR CE PLAT. `[]` = tout le monde à table.
   *
   * ⚠️ REQUIS. Sans lui, la ligne d'UNE bouche serait jugée sur un plat que
   * cette bouche n'a pas mangé — la ceinture a précisément le droit de retirer
   * une bouche d'un contenant, et le constat doit lire le même résultat.
   */
  readonly memberIds: readonly string[];
}

// ===========================================================================
// CE QUI SORT
// ===========================================================================

/**
 * LES TROIS VERDICTS, ET LE TROISIÈME EST LE PLUS IMPORTANT.
 *
 * `unverifiable` n'est pas un demi-échec: c'est le nom de ce que le produit ne
 * sait PAS juger. Sans lui, un souvenir illisible ressortirait « honoré », et
 * un plan qui sert l'aliment refusé aurait l'air d'un plan qui tient. C'est
 * exactement ce qui s'est passé le 2026-09-21.
 */
export const HONOURED_VERDICTS = ["honoured", "violated", "unverifiable"] as const;
export type HonouredVerdict = (typeof HONOURED_VERDICTS)[number];

/** POURQUOI un souvenir n'a pas pu être jugé. Liste FERMÉE, chaque motif compté. */
export const UNVERIFIABLE_REASONS = [
  /** La famille ne dit rien du contenu d'une assiette (part, rythme, logistique). */
  "no_plan_surface",
  /** La phrase ne porte aucun mot cherchable — « je veux moins de trucs compliqués ». */
  "no_searchable_word",
  /** Le souvenir vise une bouche qui n'est servie par aucun plat lu. */
  "mouth_absent",
  /** Le souvenir vise un moment qu'aucun plat du plan n'occupe. */
  "slot_absent",
  /**
   * ⟳ 2026-09-22 — « MOINS » EXIGE UN AVANT, ET UN PLAN N'EN A PAS.
   * Ce n'est pas une lacune de ce module: c'est la nature de la règle. La
   * compter ici plutôt que de trancher au hasard est tout ce qu'on peut faire
   * honnêtement — et ce compteur dira, le jour où quelqu'un voudra mesurer une
   * tendance, combien de souvenirs l'attendent.
   */
  "no_baseline",
] as const;
export type UnverifiableReason = (typeof UNVERIFIABLE_REASONS)[number];

/** Le sens d'une famille: elle demande l'ABSENCE, ou elle demande la PRÉSENCE. */
export const HONOURED_DIRECTIONS = ["must_be_absent", "must_be_present"] as const;
export type HonouredDirection = (typeof HONOURED_DIRECTIONS)[number];

/**
 * COMMENT LE VERDICT A ÉTÉ OBTENU — et les deux ne valent pas pareil.
 *
 * `ref` = égalité d'identifiant, sans interprétation.
 * `words` = le matcher de la ceinture sur de la prose: ce qu'on peut faire de
 * mieux sur du texte, et ça reste du texte.
 *
 * ⚠️ LES DEUX SE COMPTENT SÉPARÉMENT. « 12 honorés » ne dit pas la même chose
 * selon que douze sont des égalités ou douze des rapprochements, et c'est la
 * seule mesure qui dise si la mémoire devient exacte.
 */
export const HONOURED_VIA = ["ref", "words"] as const;
export type HonouredVia = (typeof HONOURED_VIA)[number];

/**
 * CE QUE CHAQUE FAMILLE DEMANDE AU PLAN. `Record` EXHAUSTIF: une neuvième
 * famille ne compile plus tant que personne n'a dit ce qu'elle exige.
 *
 * ⛔ `null` N'EST PAS UN OUBLI. Une part, un rythme, une logistique ne se
 * lisent pas dans les aliments d'un plat: les juger sur cette surface rendrait
 * un verdict tiré au sort. Elles sortent `unverifiable / no_plan_surface`, et
 * c'est un trou NOMMÉ, pas un trou muet.
 */
const DIRECTION_OF: Readonly<Record<RetainedKind, HonouredDirection | null>> = {
  "food.exclude": "must_be_absent",
  "method.avoid": "must_be_absent",
  "food.prefer": "must_be_present",
  "method.prefer": "must_be_present",
  craving: "must_be_present",
  "portion.adjust": null,
  "rhythm.set": null,
  "logistics.set": null,
};

export interface HonouredVerdictRow {
  readonly text: string;
  readonly kind: RetainedKind;
  readonly subject: RetainedSubject;
  readonly occasion: RhythmOccasion | null;
  /** Recopiée pour que la ligne se raconte: « moins » et « jamais » ne se
   * lisent pas pareil, même quand le verdict est le même. */
  readonly force: "never" | "less" | null;
  /** L'identifiant du référentiel, recopié pour que la ligne se raconte. */
  readonly ref: string | null;
  /** Par quel chemin le verdict a été obtenu. `null` quand rien n'a été jugé. */
  readonly via: HonouredVia | null;
  readonly verdict: HonouredVerdict;
  /** Renseigné UNIQUEMENT quand `verdict === "unverifiable"`. */
  readonly reason: UnverifiableReason | null;
  /** Le plat qui a tranché — `jour/moment · titre`. `null` quand rien n'a mordu. */
  readonly dish: string | null;
  /** Le mot qui a mordu, tel qu'il apparaît dans le plat. */
  readonly matched: string | null;
}

/**
 * LE COMPTEUR, AVEC SON DÉNOMINATEUR.
 *
 * ⚠️ `checked` EST LE DÉNOMINATEUR, et il existe pour une seule raison:
 * `violated: 0` seul rend le même zéro pour « rien n'a été violé » et pour
 * « rien n'a été vérifié ». C'est le zéro que ce dépôt paie en boucle.
 *
 * PROPRIÉTÉ TESTÉE: `checked === honoured + violated`, et
 * `items === checked + unverifiable`.
 */
export interface HonouredCounters {
  /** Les souvenirs reçus. */
  readonly items: number;
  /** Ceux qu'on a SU juger. */
  readonly checked: number;
  readonly honoured: number;
  readonly violated: number;
  readonly unverifiable: number;
  /** Le détail de ce qu'on n'a pas su juger, motif par motif. */
  readonly unverifiable_by_reason: Readonly<Record<UnverifiableReason, number>>;
  /**
   * ⟳ 2026-09-22 — COMBIEN DE VERDICTS SONT DES ÉGALITÉS D'IDENTIFIANT.
   *
   * ⚠️ `checked === by_ref + by_words`. C'est le rapport des deux qui dit si
   * le lot A avance: `by_ref` à zéro sur un magasin qui résout veut dire que
   * les PLATS n'écrivent pas leurs identifiants, pas que la mémoire est
   * mauvaise — et les deux se réparent à des endroits différents.
   */
  readonly by_ref: number;
  readonly by_words: number;
}

export interface HonouredReading {
  readonly rows: readonly HonouredVerdictRow[];
  readonly counters: HonouredCounters;
}

// ===========================================================================
// LE VERDICT
// ===========================================================================

/**
 * ⛔ CE PLAT ÉCRIT-IL DES IDENTIFIANTS ? La question qui décide du chemin.
 *
 * ⚠️ SANS ELLE, UN PLAN DONT LE MODÈLE N'A ÉCRIT AUCUN `ref` rendrait
 * « honoré » à toutes les exclusions résolues — un faux vert de masse,
 * exactement celui que ce module existe pour retirer. On ne prend le chemin
 * exact que quand il y a quelque chose à comparer.
 */
function dishHasAnyRef(
  dish: HonouredDish,
  preparationById: ReadonlyMap<string, ExclusionPreparation>,
): boolean {
  for (const i of dish.ingredients ?? []) if (i.ref !== null) return true;
  for (const use of dish.uses ?? []) {
    const prep = preparationById.get(use.preparationId);
    if (!prep) continue;
    for (const i of prep.ingredients ?? []) {
      if (((i as { ref?: string | null }).ref ?? null) !== null) return true;
    }
  }
  return false;
}

const dishLabel = (dish: HonouredDish): string =>
  `${dish.day}/${dish.slot} · ${dish.title}`;

/**
 * Ce plat sert-il cette bouche ?
 *
 * `[]` sur le plat = tout le monde à table. Une règle de FOYER est concernée
 * par tous les plats; la ligne d'une bouche ne l'est que par les siens.
 */
function dishServes(dish: HonouredDish, subject: RetainedSubject): boolean {
  if (subject === HOUSEHOLD_SUBJECT) return true;
  const memberId = String(subject).startsWith("member:")
    ? String(subject).slice("member:".length)
    : "";
  if (!memberId) return false;
  const served = dish.memberIds ?? [];
  return served.length === 0 || served.includes(memberId);
}

/**
 * LE CONSTAT, SOUVENIR PAR SOUVENIR, SUR LA LIGNE ÉCRITE.
 *
 * ⚠️ `preparationById` EST REQUIS, et `new Map()` est une RÉPONSE (un plan sans
 * casserole). Optionnel, il aurait rendu « honoré » tout ce qui vit dans une
 * préparation — c'est-à-dire la moitié de la protéine, mesurée.
 */
export function retainedHonoured(args: {
  items: readonly HonouredItem[];
  dishes: readonly HonouredDish[];
  preparationById: ReadonlyMap<string, ExclusionPreparation>;
}): HonouredReading {
  const rows: HonouredVerdictRow[] = [];
  const byReason: Record<UnverifiableReason, number> = {
    no_plan_surface: 0,
    no_searchable_word: 0,
    mouth_absent: 0,
    slot_absent: 0,
    no_baseline: 0,
  };
  let honoured = 0;
  let violated = 0;
  let unverifiable = 0;
  let byRef = 0;
  let byWords = 0;

  /**
   * ⛔ LE CHEMIN EXACT — une ÉGALITÉ D'IDENTIFIANT, et rien d'autre.
   *
   * Les préparations sont PLIÉES, comme partout: en cuisine par lots la
   * protéine n'est pas dans le plat. Ne lire que le plat manquerait très
   * exactement ce qui a été mangé (cicatrice
   * `preparations-must-be-folded-into-dishes`).
   */
  const dishCarriesRef = (dish: HonouredDish, ref: string): boolean => {
    for (const i of dish.ingredients ?? []) {
      if (i.ref !== null && i.ref === ref) return true;
    }
    for (const use of dish.uses ?? []) {
      const prep = args.preparationById.get(use.preparationId);
      if (!prep) continue;
      for (const i of prep.ingredients ?? []) {
        const prepRef = (i as { ref?: string | null }).ref ?? null;
        if (prepRef !== null && prepRef === ref) return true;
      }
    }
    return false;
  };

  const dishes = args.dishes ?? [];

  const unjudged = (
    it: HonouredItem,
    reason: UnverifiableReason,
  ): HonouredVerdictRow => {
    byReason[reason] += 1;
    unverifiable += 1;
    return {
      text: it.text,
      kind: it.kind,
      subject: it.subject,
      occasion: it.occasion,
      force: it.force,
      ref: it.ref,
      via: null,
      verdict: "unverifiable",
      reason,
      dish: null,
      matched: null,
    };
  };

  for (const it of args.items ?? []) {
    const direction = DIRECTION_OF[it.kind] ?? null;
    if (direction === null) {
      rows.push(unjudged(it, "no_plan_surface"));
      continue;
    }
    // ⛔ AVANT TOUT LE RESTE: « moins » ne se juge pas sur un plan. Le placer
    // ici plutôt qu'après la recherche des mots est délibéré — chercher des
    // mots pour n'en rien conclure ferait croire, en lisant le code, qu'un
    // verdict est possible.
    if (it.force === "less") {
      rows.push(unjudged(it, "no_baseline"));
      continue;
    }

    // ⛔ LES MOTS VIENNENT DE LA CEINTURE, PAS D'ICI. `exclusionTermsFor` ne
    // lit QUE `food.exclude`: on lui présente donc l'item sous cette famille,
    // par le PARSEUR (jamais un `as`), pour obtenir exactement les mots que la
    // ceinture aurait cherchés. Le SENS du verdict, lui, reste celui de la
    // famille d'origine.
    const probe = parseRetainedItem({
      kind: "food.exclude",
      scope: "durable",
      subject: it.subject,
      text: it.text,
      value: null,
      source: "written",
      at: "2000-01-01",
      item: "",
      confidence: null,
      quote: null,
    });
    const terms = probe === null
      ? []
      : exclusionTermsFor({ items: [probe as RetainedItem], subject: String(it.subject) });
    if (terms.length === 0) {
      rows.push(unjudged(it, "no_searchable_word"));
      continue;
    }

    // ── LES PLATS QUI ONT LE DROIT DE TRANCHER ────────────────────────────
    // Le moment d'abord (une règle du petit-déjeuner ne juge pas un dîner),
    // la bouche ensuite. Les deux filtres sont SÉPARÉS parce que leurs vides
    // ne disent pas la même chose, et que le motif doit le dire.
    const atSlot = it.occasion === null
      ? dishes
      : dishes.filter((d) => String(d.slot) === String(it.occasion));
    if (atSlot.length === 0) {
      rows.push(unjudged(it, "slot_absent"));
      continue;
    }
    const mine = atSlot.filter((d) => dishServes(d, it.subject));
    if (mine.length === 0) {
      rows.push(unjudged(it, "mouth_absent"));
      continue;
    }

    // ── LE CHEMIN EXACT D'ABORD, QUAND LES DEUX CÔTÉS ONT UNE CLÉ ───────
    //
    // ⛔ ET IL NE RETOMBE PAS SUR LES MOTS QUAND IL NE TROUVE RIEN. Un
    // souvenir résolu jugé sur un plan dont les plats portent leurs
    // identifiants a une réponse EXACTE: « ce slug n'est pas servi ». Y
    // ajouter une seconde chance par les mots rendrait le verdict dépendant
    // de l'ordre des deux chemins — et le plus permissif gagnerait toujours.
    if (it.ref !== null && mine.some((d) => dishHasAnyRef(d, args.preparationById))) {
      const found = mine.find((d) => dishCarriesRef(d, it.ref!)) ?? null;
      const exact: HonouredVerdict = direction === "must_be_absent"
        ? (found === null ? "honoured" : "violated")
        : (found === null ? "violated" : "honoured");
      if (exact === "honoured") honoured += 1;
      else violated += 1;
      byRef += 1;
      rows.push({
        text: it.text,
        kind: it.kind,
        subject: it.subject,
        occasion: it.occasion,
        force: it.force,
        ref: it.ref,
        via: "ref",
        verdict: exact,
        reason: null,
        dish: found === null ? null : dishLabel(found),
        matched: found === null ? null : it.ref,
      });
      continue;
    }

    let hit: { dish: HonouredDish; matched: string } | null = null;
    for (const dish of mine) {
      const bite = dishBitesExclusion({
        dish: {
          title: dish.title,
          method: dish.method,
          ingredients: dish.ingredients ?? [],
        },
        uses: dish.uses ?? [],
        preparationById: args.preparationById,
        terms,
        // ⚠️ SURFACE `ingredients`, JAMAIS `all` — la même que la ceinture par
        // bouche. `termsOfInstruction` rend du bruit (« fils » → `fil`,
        // mesuré): lire la prose du plat inventerait des morsures, et un
        // constat qui invente est pire qu'un constat absent.
        surface: "ingredients",
        // ⛔ `null`, ET C'EST UN CHOIX, PAS UN OUBLI. Le moment est appliqué
        // UN CRAN PLUS HAUT (`atSlot`), là où « aucun plat à ce moment » peut
        // encore devenir `unverifiable`. Confié à la ceinture, ce cas rendrait
        // NO_BITE — c'est-à-dire « honoré » — et on aurait remplacé « je ne
        // sais pas » par « tout va bien », le faux vert que ce module existe
        // pour retirer.
        slot: null,
      });
      if (bite.matched !== null) {
        hit = { dish, matched: bite.matched };
        break;
      }
    }

    const found = hit !== null;
    const verdict: HonouredVerdict = direction === "must_be_absent"
      ? (found ? "violated" : "honoured")
      : (found ? "honoured" : "violated");
    if (verdict === "honoured") honoured += 1;
    else violated += 1;
    byWords += 1;
    rows.push({
      text: it.text,
      kind: it.kind,
      subject: it.subject,
      occasion: it.occasion,
      force: it.force,
      ref: it.ref,
      via: "words",
      verdict,
      reason: null,
      dish: hit === null ? null : dishLabel(hit.dish),
      matched: hit?.matched ?? null,
    });
  }

  return {
    rows,
    counters: {
      items: (args.items ?? []).length,
      checked: honoured + violated,
      honoured,
      violated,
      unverifiable,
      unverifiable_by_reason: Object.freeze({ ...byReason }),
      by_ref: byRef,
      by_words: byWords,
    },
  };
}
