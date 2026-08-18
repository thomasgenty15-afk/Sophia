/**
 * LA LECTURE PAR LES GÉNÉRATEURS — où chaque famille retenue entre dans la
 * composition. **Rien d'autre.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 1, colonne
 * « Le lecteur ». Ce module est cette colonne, rendue exécutable:
 *
 *   `food.*` / `method.*`  → la consigne de composition
 *   `portion.adjust`       → l'enveloppe (`envelopeFor`)
 *   `rhythm.set`           → le rythme alimentaire (les six moments)
 *   `logistics.set`        → `practical_constraints`
 *   `craving`              → le bloc d'envies
 *
 * ── CE QUE CE MODULE N'A PAS LE DROIT DE FAIRE ─────────────────────────────
 * PURE MODULE: aucune I/O, aucune horloge, aucun hasard. Les items arrivent en
 * paramètre; les bouches aussi. Il ne lit ni base ni `Date.now()`.
 *
 * ⛔ IL NE CALCULE AUCUN NOMBRE POUR `portion.adjust`. Il TRANSMET
 * `{direction, magnitude}` et la liste des bouches concernées. La traduction
 * en énergie est le travail de l'ENVELOPPE, en aval, là où le plancher TCA
 * s'applique — écrire ici « slight = −80 g » fabriquerait la précision que
 * `retained_item.ts` interdit des deux côtés (`?: never` à la compilation,
 * refus de toute clé en trop à la lecture).
 *
 * ⛔ IL NE RAPPROCHE AUCUN `text` D'UN ALIMENT. Aucun matcher maison: la
 * cicatrice est écrite et chiffrée dans ce dépôt — « laitue » ≠ « lait »,
 * 12 faux positifs sur 12 mesurés. Le `text` d'un item part au modèle TEL
 * QUEL, dans le bloc que la personne peut relire.
 *
 * ⛔ AUCUN PRÉNOM COMME CLÉ. Tout ce qui désigne une bouche ici est un
 * `member_id`, y compris dans les constats d'exclusion. « Poulet pour Zoé et
 * Marc » ne se résout pas par un prénom dans un titre.
 *
 * ── LA RÈGLE QUI GOUVERNE LE GROUPAGE: AUCUN ITEM NE SE PERD EN SILENCE ────
 * `routeRetainedItems` ne porte PAS de `default: break`. Une famille sans
 * destination sort par `unrouted`, et le `switch` est exhaustif au sens du
 * compilateur: ajouter un neuvième `kind` à `RetainedItem` fait ROUGIR ce
 * fichier avant tout test. Les deux gardes servent des cas différents — le
 * compilateur couvre le code neuf, `unrouted` couvre une ligne forgée ou une
 * version d'à côté. Un `default: break` n'aurait couvert ni l'un ni l'autre:
 * il aurait rendu un objet parfaitement bien formé, amputé.
 *
 * ── LE PLAFOND DE PROMPT N'EST PAS ICI, ET C'EST DIT ───────────────────────
 * `MAX_PROMPT_PREFERENCES` (20) est PRIVÉ à `food_preference_promotion.ts`.
 * Le recopier ici ferait un second seuil, dans un second fichier, qui
 * divergerait — exactement ce que le contrat de phase 0 interdit pour
 * `MIN_CONFIDENCE`. Les lignes issues des `RetainedItem` sont donc rendues
 * SANS plafond: c'est un trou NOMMÉ, pas un oubli, et il appartient au lot qui
 * décidera d'un budget de prompt commun aux deux magasins.
 */

import {
  HOUSEHOLD_SUBJECT,
  type LogisticsField,
  type PortionAdjustAudience,
  type PortionAdjustItem,
  type PortionAdjustMember,
  type RetainedItem,
  type RetainedSubject,
  RHYTHM_OCCASIONS,
  type RhythmOccasion,
  subjectsForPortionAdjust,
} from "./retained_item.ts";

// ===========================================================================
// LE GROUPAGE — la signature figée par le contrat de phase 0, §6
// ===========================================================================

/**
 * Les cinq destinations, plus ce qui n'en a pas trouvé.
 *
 * ⚠️ `unrouted` EST UN AJOUT AU CONTRAT §6, ASSUMÉ ET SIGNALÉ. Le contrat fige
 * cinq champs; celui-ci est le SIXIÈME, et il est purement additif — un
 * appelant qui déstructure les cinq d'origine ne voit aucune différence.
 *
 * Motif: le contrat exige « aucun item ne se perd en silence », et une
 * exigence de visibilité qui n'a pas de champ où se lire n'est pas vérifiable.
 * Avec lui, la conservation est une assertion d'une ligne
 * (`routedItemCount(routed) === items.length`), donc un test, donc une garde.
 */
export type RoutedRetainedItems = {
  /** `food.exclude`, `food.prefer`, `method.avoid`, `method.prefer`. */
  readonly composition: readonly RetainedItem[];
  /** `portion.adjust` — typé, donc `value` EST un `PortionAdjustValue`. */
  readonly portion: readonly PortionAdjustItem[];
  /** `rhythm.set`. */
  readonly rhythm: readonly RetainedItem[];
  /** `logistics.set`. */
  readonly logistics: readonly RetainedItem[];
  /** `craving`. */
  readonly craving: readonly RetainedItem[];
  /**
   * CE QUI N'A TROUVÉ AUCUNE DESTINATION. Vide sur toute entrée bien typée —
   * et c'est le point: il ne se remplit que si une famille arrive sans lecteur,
   * ce qui doit se VOIR au lieu de disparaître.
   */
  readonly unrouted: readonly RetainedItem[];
};

/**
 * Groupe par famille. **Module PUR, aucun item perdu.**
 *
 * L'ordre d'arrivée est préservé à l'intérieur de chaque seau: les lecteurs en
 * aval trient par `at` quand la date compte (`rhythmOverlayFor`,
 * `logisticsOverlayFor`), et un tri fait ici leur retirerait le choix.
 */
export function routeRetainedItems(
  items: readonly RetainedItem[],
): RoutedRetainedItems {
  const composition: RetainedItem[] = [];
  const portion: PortionAdjustItem[] = [];
  const rhythm: RetainedItem[] = [];
  const logistics: RetainedItem[] = [];
  const craving: RetainedItem[] = [];
  const unrouted: RetainedItem[] = [];

  for (const item of items ?? []) {
    switch (item.kind) {
      case "food.exclude":
      case "food.prefer":
      case "method.avoid":
      case "method.prefer":
        composition.push(item);
        break;
      case "portion.adjust":
        portion.push(item);
        break;
      case "rhythm.set":
        rhythm.push(item);
        break;
      case "logistics.set":
        logistics.push(item);
        break;
      case "craving":
        craving.push(item);
        break;
      default: {
        // ── LA MOITIÉ « COMPILATION » ────────────────────────────────────
        // Une neuvième famille dans `RetainedItem` rend cette affectation
        // impossible: le fichier ne compile plus, et l'auteur de la famille
        // lit la table des destinations avant de continuer.
        const withoutDestination: never = item;
        // ── LA MOITIÉ « EXÉCUTION » ──────────────────────────────────────
        // Atteinte par une ligne forgée, ou par un binaire d'à côté qui
        // connaît une famille que celui-ci ignore. Elle ne se jette pas: elle
        // se compte.
        unrouted.push(withoutDestination as RetainedItem);
        break;
      }
    }
  }

  return { composition, portion, rhythm, logistics, craving, unrouted };
}

/**
 * Combien d'items le groupage a rendus, TOUS SEAUX CONFONDUS.
 *
 * Sert la conservation: `routedItemCount(routeRetainedItems(x)) === x.length`
 * est l'assertion qui prouve qu'aucun item n'est tombé. Elle est écrite ici
 * plutôt que dans chaque appelant pour qu'il n'y ait qu'UNE façon de compter.
 */
export function routedItemCount(routed: RoutedRetainedItems): number {
  return routed.composition.length + routed.portion.length +
    routed.rhythm.length + routed.logistics.length + routed.craving.length +
    routed.unrouted.length;
}

// ===========================================================================
// DE QUI CE PROMPT PARLE — l'audience, requise partout
// ===========================================================================

/**
 * Les sujets dont la surface appelante a le droit de parler.
 *
 * ⚠️ REQUIS, JAMAIS OPTIONNEL, et jamais avec un défaut. Ce dépôt porte la
 * cicatrice « paramètre de garde optionnel = garde désarmée » (le `safetyBand`
 * qui n'était jamais passé): un `speaksFor` facultatif aurait laissé chaque
 * appelant hériter en silence de « tout le monde », et une exclusion écrite
 * pour UNE bouche serait partie au modèle pour toute la table.
 *
 *   · lane individuelle  — `[HOUSEHOLD_SUBJECT]`, plus la bouche de l'élève
 *                          quand la surface la connaît;
 *   · tronc de la lane foyer — `[HOUSEHOLD_SUBJECT]` SEUL. Les mots d'une
 *     bouche nommée passent par `household_voices`, avec son plafond par
 *     membre et sa garde de non-divulgation.
 */
export type SpeaksFor = readonly RetainedSubject[];

function concerns(item: RetainedItem, speaksFor: SpeaksFor): boolean {
  for (const subject of speaksFor ?? []) {
    if (subject === item.subject) return true;
  }
  return false;
}

/**
 * Le rang d'un sujet quand deux items visent le même champ.
 *
 * Une bouche NOMMÉE passe devant `household`, et ce n'est pas un arbitrage
 * inventé ici: `subjectsForPortionAdjust` le pose déjà mot pour mot — « un
 * sujet explicite n'est JAMAIS filtré », parce qu'il vient d'une question
 * fermée posée avec la liste du foyer sous les yeux, pas d'une inférence.
 */
function subjectRank(subject: RetainedSubject): number {
  return subject === HOUSEHOLD_SUBJECT ? 0 : 1;
}

/** Un item et son rang d'arrivée, pour départager deux déclarations. */
type Contender = { readonly item: RetainedItem; readonly index: number };

/**
 * LE CHALLENGER PREND-IL LA PLACE DU TENANT ?
 *
 * Trois crans, dans cet ordre: la bouche nommée devant `household`, puis la
 * date la plus récente, puis le dernier arrivé.
 *
 * `at` est strictement `YYYY-MM-DD` (le socle le garantit): la comparaison de
 * chaînes EST la comparaison de dates, sans `Date.parse` et donc sans la
 * reprojection UTC qui décale un mardi soir parisien.
 */
function winsOver(challenger: Contender, holder: Contender): boolean {
  const rankC = subjectRank(challenger.item.subject);
  const rankH = subjectRank(holder.item.subject);
  if (rankC !== rankH) return rankC > rankH;
  if (challenger.item.at !== holder.item.at) {
    return challenger.item.at > holder.item.at;
  }
  return challenger.index > holder.index;
}

// ===========================================================================
// ① `portion.adjust` → L'ENVELOPPE
// ===========================================================================

/**
 * Un ajustement, et les bouches qu'il touche vraiment.
 *
 * ⛔ AUCUN NOMBRE. `direction` et `magnitude` sont recopiés tels quels; c'est
 * `envelopeFor` qui les traduit, en aval, sous le plancher TCA.
 */
export type RoutedPortionAdjust = {
  readonly item: PortionAdjustItem;
  /** Les bouches concernées, ET celles retirées AVEC LE MOTIF. */
  readonly audience: PortionAdjustAudience;
};

/**
 * À QUELLES BOUCHES CHAQUE AJUSTEMENT S'APPLIQUE.
 *
 * ⚠️ LA RÈGLE DU MINEUR N'EST PAS RÉÉCRITE ICI. Elle vit dans
 * `subjectsForPortionAdjust` (socle), qui exclut le mineur ET l'âge inconnu
 * d'un ajustement **à la baisse sans sujet explicite**. La recopier ici
 * ferait deux règles qui divergeraient, et c'est celle qu'on relit le moins
 * qui garderait l'ancienne — pour retirer de la nourriture à un enfant, en
 * silence.
 *
 * Le constat sort avec: `audience.excluded` porte `{memberId, reason}` pour
 * que l'appelant puisse écrire « rien n'a échoué, et voici qui a été retiré ».
 * Un appelant qui ne recevrait que `included` ne pourrait pas l'écrire, et
 * l'exclusion redeviendrait le geste muet qu'elle existe pour empêcher.
 *
 * `members` est REQUIS: même cicatrice que ci-dessus, et une liste absente
 * rendrait « personne n'est concerné » indiscernable de « la garde n'a pas
 * été branchée ».
 */
export function portionAdjustsFor(
  items: readonly PortionAdjustItem[],
  members: readonly PortionAdjustMember[],
): readonly RoutedPortionAdjust[] {
  return (items ?? []).map((item) => ({
    item,
    audience: subjectsForPortionAdjust(item, members),
  }));
}

/**
 * LE CONSTAT D'EXCLUSION, prêt à être journalisé ou versé dans les `issues`.
 *
 * Des `member_id`, jamais des prénoms — la trace est lue par quelqu'un qui a
 * la table sous les yeux, et un prénom dans une trace est un rapprochement
 * qu'on ne sait pas faire.
 */
export function portionAdjustExclusionFacts(
  adjustments: readonly RoutedPortionAdjust[],
): readonly { readonly memberId: string; readonly reason: string }[] {
  const out: { memberId: string; reason: string }[] = [];
  for (const entry of adjustments ?? []) {
    for (const excluded of entry.audience.excluded) {
      out.push({ memberId: excluded.memberId, reason: excluded.reason });
    }
  }
  return out;
}

// ===========================================================================
// ② `rhythm.set` → LE RYTHME ALIMENTAIRE (les six moments)
// ===========================================================================

/** Ce que les items retenus disent des six moments, pour une audience donnée. */
export type RhythmOverlay = {
  /** Les moments déclarés PRÉSENTS, dans l'ordre de `RHYTHM_OCCASIONS`. */
  readonly present: readonly RhythmOccasion[];
  /** Les moments déclarés ABSENTS, dans l'ordre de `RHYTHM_OCCASIONS`. */
  readonly absent: readonly RhythmOccasion[];
  /** Les `rhythm.set` d'une bouche dont ce prompt ne parle pas. Comptés. */
  readonly otherSubjects: readonly RetainedItem[];
};

/**
 * LE RYTHME TEL QUE LES ITEMS RETENUS LE CORRIGENT.
 *
 * ── CE QUE CE MODULE REND, ET CE QU'IL NE REND PAS ────────────────────────
 * Il rend des MOMENTS, pas un `EatingOccasionSlot[]`. La taille d'un repas
 * (`size`) n'existe pas dans `RhythmSetValue`, et la fabriquer ici poserait
 * une contrainte que personne n'a déclarée. L'appelant fusionne: il ajoute les
 * `present` absents de son rythme lu, retire les `absent`, et garde les
 * tailles déjà déclarées.
 *
 * ── LE DERNIER MOT ────────────────────────────────────────────────────────
 * Deux items sur le MÊME moment: la bouche nommée l'emporte sur `household`,
 * puis la date la plus récente, puis le dernier arrivé. Aucun de ces trois
 * crans n'est inventé ici — voir `subjectRank` et `laterWins`.
 */
export function rhythmOverlayFor(args: {
  items: readonly RetainedItem[];
  speaksFor: SpeaksFor;
}): RhythmOverlay {
  const winners = new Map<
    RhythmOccasion,
    { item: RetainedItem; index: number; present: boolean }
  >();
  const otherSubjects: RetainedItem[] = [];

  let index = 0;
  for (const item of args.items ?? []) {
    index += 1;
    if (item.kind !== "rhythm.set") continue;
    if (!concerns(item, args.speaksFor)) {
      otherSubjects.push(item);
      continue;
    }
    const occasion = item.value.occasion;
    const holder = winners.get(occasion);
    if (!holder || winsOver({ item, index }, holder)) {
      winners.set(occasion, { item, index, present: item.value.present });
    }
  }

  const present: RhythmOccasion[] = [];
  const absent: RhythmOccasion[] = [];
  // L'ordre est celui des SIX MOMENTS, jamais l'ordre d'arrivée: une liste de
  // moments dans le désordre se lit comme une journée dans le désordre.
  for (const occasion of RHYTHM_OCCASIONS) {
    const winner = winners.get(occasion);
    if (!winner) continue;
    if (winner.present) present.push(occasion);
    else absent.push(occasion);
  }
  return { present, absent, otherSubjects };
}

// ===========================================================================
// ③ `logistics.set` → `practical_constraints`
// ===========================================================================

/** Le correctif à poser SUR `practical_constraints`, avant tout lecteur. */
export type LogisticsOverlay = {
  /**
   * Les clés de `practical_constraints` que ces items remplacent. Vide quand
   * rien n'a été retenu — et l'appelant rend alors, au caractère près, le
   * prompt d'avant ce chantier.
   */
  readonly patch: Readonly<Record<string, unknown>>;
  /** Les `logistics.set` d'une bouche dont ce prompt ne parle pas. Comptés. */
  readonly otherSubjects: readonly RetainedItem[];
};

/**
 * LES CINQ CHAMPS DE CUISINE, TELS QUE LES ITEMS RETENUS LES CORRIGENT.
 *
 * ── POURQUOI UN CORRECTIF EN MÉMOIRE, ET PAS UNE ÉCRITURE ─────────────────
 * Ce module est PUR: il ne touche pas la base. L'appelant applique
 * `{...practical_constraints, ...patch}` AVANT `readCookingCapacity` et avant
 * `parseEatingRhythm` — c'est-à-dire au seul endroit où les deux générateurs
 * lisent déjà cette colonne. Poser le correctif après les lecteurs ferait
 * composer le plan sur l'ancienne cuisine et n'en changerait que la trace.
 *
 * ⚠️ LES CLÉS SONT CELLES DE LA COLONNE, PAS CELLES DU TYPE. `cook_days` et
 * pas `cooking_days`: la faute est nommée dans `retained_item.ts` parce
 * qu'elle a déjà été commise, et `LogisticsField` porte le bon nom. On le
 * réutilise tel quel plutôt que de retaper cinq chaînes.
 *
 * ── AUCUNE BORNE AJOUTÉE ICI, ET C'EST DIT ────────────────────────────────
 * `cooking_time_min` et `budget_amount` n'ont AUCUN plafond dans le socle
 * (trou nommé au §4 du contrat de phase 0). Ce module n'en invente pas: les
 * deux lecteurs existants en posent déjà un chacun (`readCookingCapacity`
 * borne le temps à 240, `usableBudget` refuse un budget absurde), et une
 * troisième borne ici serait la première à diverger.
 */
export function logisticsOverlayFor(args: {
  items: readonly RetainedItem[];
  speaksFor: SpeaksFor;
}): LogisticsOverlay {
  const winners = new Map<
    LogisticsField,
    { item: RetainedItem; index: number; value: unknown }
  >();
  const otherSubjects: RetainedItem[] = [];

  let index = 0;
  for (const item of args.items ?? []) {
    index += 1;
    if (item.kind !== "logistics.set") continue;
    if (!concerns(item, args.speaksFor)) {
      otherSubjects.push(item);
      continue;
    }
    const field = item.value.field;
    const holder = winners.get(field);
    if (!holder || winsOver({ item, index }, holder)) {
      winners.set(field, { item, index, value: item.value.value });
    }
  }

  const patch: Record<string, unknown> = {};
  for (const [field, winner] of winners) patch[field] = winner.value;
  return { patch, otherSubjects };
}

// ===========================================================================
// ④ `food.*` / `method.*` → LA CONSIGNE DE COMPOSITION
// ===========================================================================

/**
 * Les lignes de composition, DANS LES DEUX SEAUX QUE LES DEUX GÉNÉRATEURS
 * LISENT DÉJÀ.
 *
 * La forme n'est pas neuve: c'est celle de `FoodPreferencesByOrigin`
 * (`written` / `remembered`, la seconde datée et la plus récente d'abord), et
 * c'est délibéré. `buildMealPrompt` a DEUX paramètres pour ces deux seaux, et
 * ils ne disent pas la même chose au modèle — « une consigne écrite ne
 * s'arbitre pas comme un goût confirmé d'un bouton ». Inventer un troisième
 * bloc ferait dire trois fois la même chose dans un prompt qui a un budget.
 */
export type CompositionLines = {
  /** `source: "written"` — ce que la personne a TAPÉ. Sans préfixe de date. */
  readonly written: readonly string[];
  /**
   * Les trois producteurs automatiques (questionnaire, conversation,
   * brouillon), préfixés de leur jour: `2026-08-18 — les rochers coco`.
   */
  readonly remembered: readonly string[];
  /** Les items d'une bouche dont ce prompt ne parle pas. Comptés. */
  readonly otherSubjects: readonly RetainedItem[];
};

/**
 * LES CONSIGNES DE COMPOSITION, TELLES QUE LE MODÈLE DOIT LES LIRE.
 *
 * ⛔ LE `text` PART TEL QUEL. Aucun rapprochement avec un aliment du
 * référentiel, aucune normalisation, aucune reformulation: ce module ne sait
 * pas si « laitue » et « lait » parlent de la même chose, et ce dépôt a mesuré
 * 12 faux positifs sur 12 le jour où quelqu'un a cru le savoir.
 *
 * ⚠️ Pas de plafond — voir l'en-tête du fichier. C'est un trou NOMMÉ.
 */
export function compositionLinesFor(args: {
  items: readonly RetainedItem[];
  speaksFor: SpeaksFor;
}): CompositionLines {
  const written: string[] = [];
  const remembered: { at: string; text: string; index: number }[] = [];
  const otherSubjects: RetainedItem[] = [];

  let index = 0;
  for (const item of args.items ?? []) {
    index += 1;
    if (
      item.kind !== "food.exclude" && item.kind !== "food.prefer" &&
      item.kind !== "method.avoid" && item.kind !== "method.prefer"
    ) {
      continue;
    }
    if (!concerns(item, args.speaksFor)) {
      otherSubjects.push(item);
      continue;
    }
    if (item.source === "written") {
      written.push(item.text);
      continue;
    }
    remembered.push({ at: item.at, text: item.text, index });
  }

  // LE PLUS RÉCENT D'ABORD, à égalité l'ordre d'arrivée. Même tri que
  // `foodPreferencesByOrigin`, et pour la même raison mesurée: deux lignes
  // qui se contredisent (« ne cuisine plus le soir » / « recuisine le soir »)
  // sont indépartageables sans leur date.
  remembered.sort((a, b) =>
    a.at === b.at ? a.index - b.index : (a.at < b.at ? 1 : -1)
  );

  return {
    written,
    remembered: remembered.map((r) => `${r.at} — ${r.text}`),
    otherSubjects,
  };
}

// ===========================================================================
// ⑤ `craving` → LE BLOC D'ENVIES
// ===========================================================================

/** Ce que les envies retenues ajoutent à la ligne du foyer. */
export type CravingLines = {
  /**
   * Les envies, UNE PAR LIGNE, telles qu'elles ont été écrites.
   *
   * ⚠️ NON DATÉES, et c'est voulu: un `craving` est `next_plan` par
   * construction (invariant du socle), donc il ne peut pas être vieux. Sa date
   * d'expiration se lit sur la carte, pas dans le prompt.
   */
  readonly lines: readonly string[];
  /** Les envies d'une bouche dont ce prompt ne parle pas. Comptées. */
  readonly otherSubjects: readonly RetainedItem[];
};

/**
 * LES ENVIES RETENUES, prêtes à rejoindre la ligne d'envies du foyer.
 *
 * ⚠️ LE PLAFOND RESTE CELUI DU LECTEUR. `buildEnvyBlock` ramène la ligne à
 * `MAX_ENVY_CHARS` (500), et c'est lui qui doit continuer à le faire: un
 * second plafond ici couperait avant lui, sur une autre règle, et la ligne
 * servie ne serait plus celle qu'aucun des deux annonce. L'appelant joint,
 * `buildEnvyBlock` borne.
 */
export function cravingLinesFor(args: {
  items: readonly RetainedItem[];
  speaksFor: SpeaksFor;
}): CravingLines {
  const lines: string[] = [];
  const otherSubjects: RetainedItem[] = [];
  for (const item of args.items ?? []) {
    if (item.kind !== "craving") continue;
    if (!concerns(item, args.speaksFor)) {
      otherSubjects.push(item);
      continue;
    }
    lines.push(item.text);
  }
  return { lines, otherSubjects };
}

// ===========================================================================
// LA TRACE — ce que l'appelant journalise
// ===========================================================================

/**
 * De quoi écrire une ligne de log qui dit ce qui est entré, et ce qui est
 * resté dehors.
 *
 * Des NOMBRES et des `member_id`, jamais des textes: cette trace part dans les
 * logs et dans `generated_from`, que d'autres personnes relisent. Le `text`
 * d'un item appartient à la personne, il vit déjà dans sa carte.
 */
export function routingTrace(args: {
  routed: RoutedRetainedItems;
  adjustments: readonly RoutedPortionAdjust[];
}): Readonly<Record<string, unknown>> {
  const excluded = portionAdjustExclusionFacts(args.adjustments);
  return {
    composition: args.routed.composition.length,
    portion: args.routed.portion.length,
    rhythm: args.routed.rhythm.length,
    logistics: args.routed.logistics.length,
    craving: args.routed.craving.length,
    // ⚠️ CE COMPTEUR EST LE POINT DU CHAMP. Un `unrouted` non nul veut dire
    // qu'une famille est arrivée sans lecteur: c'est la seule chose de cette
    // trace qui demande une action.
    unrouted: args.routed.unrouted.length,
    portion_excluded: excluded.map((e) => `${e.memberId}:${e.reason}`),
  };
}
