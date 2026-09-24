// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — ① LES BOÎTES, REDIMENSIONNÉES APRÈS LE PARSEUR
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Les facteurs (`householdMouthFactors`, `mouthTargetFactor`) restent dans
// `household_portions.ts`: ce module ne fait que les appliquer.
//
// Ce module n'importe rien.

// ---------------------------------------------------------------------------
// ① LES BOÎTES, REDIMENSIONNÉES — déterministe, après le parseur
// ---------------------------------------------------------------------------

/** UN COMPOSANT d'un contenant, réduit à ce que le dimensionnement lit. */
export interface SizableItem {
  /**
   * LA CASSEROLE D'OÙ IL SORT. `null` = ajouté frais le jour même, donc hors du
   * contrôle de fournée: aucun plafond de récipient ne le borne, parce qu'aucune
   * casserole ne le produit.
   */
  preparationId: string | null;
  grams: number;
}

/** UN CONTENANT: son groupe, son contenu, et ce que son repas tire des casseroles. */
export interface SizableMeal {
  boxId: string;
  /**
   * ⛔ LE NOMBRE DE NOMS DÉCIDE CE QUE SES GRAMMES VEULENT DIRE (v4, 2026-08-20).
   *
   *   · **un seul** → une PRESCRIPTION. C'est très exactement ce que la cible
   *     de cette bouche achète.
   *   · **plusieurs** → une QUANTITÉ DE BAC. Le bac n'est la portion de
   *     personne: aucun facteur d'UNE de ses bouches ne peut le redimensionner,
   *     parce que ce serait faire payer aux autres l'arithmétique d'un tiers —
   *     le défaut « une ceinture posée sur l'un retire à l'autre », repris par
   *     l'autre bout.
   *
   * ⟳ 2026-09-04 — CE CHAMP NE DÉCIDE PLUS RIEN **ICI**. La règle n'a pas
   * changé, son lieu si: `resolveBoxFactors` la tient désormais, et cette
   * fonction ne fait qu'appliquer le facteur qu'on lui donne pour ce contenant.
   * La distinction reste comptée (`counts.common`). Le déplacement est ce qui
   * rend possible un facteur de BAC calculé sur la somme des besoins de ses
   * mangeurs — un nombre qui n'est celui d'aucun d'eux, donc que ce champ ne
   * pouvait pas exprimer.
   */
  memberIds: readonly string[];
  /**
   * LE JOUR DE CE CONTENANT (`mon`..`sun`), ou `null` pour un plat sans jour.
   *
   * ⛔ REQUIS, JAMAIS `?`. L'ancrage rend un facteur par (bouche, JOUR) — il l'a
   * calculé sur l'énergie, les moments et la masse de CE jour-là. Sans le jour
   * ici, l'appelant devait en choisir UN pour toute la fenêtre, et il prenait
   * « le plus proche de 1 » faute de mieux: un pansement de prudence sur une
   * approximation. Le champ est ce qui retire les deux.
   */
  day: string | null;
  /**
   * ⚠️ L'ORDRE EST LE CONTRAT. Le résultat rend les nouveaux grammes indexés sur
   * CETTE liste: l'appelant doit réécrire dans le même tableau, dans le même
   * ordre. Il n'existe pas de clé stable pour un composant — deux `term`
   * identiques sur un couvercle sont légitimes.
   */
  items: readonly SizableItem[];
  /**
   * LES REPRISES DU REPAS. ⚠️ ELLES NE SERVENT PLUS AU PRORATA — un `item` nomme
   * sa casserole, donc le plafond se pose EXACTEMENT. Elles restent pour dire
   * quelles casseroles ce repas touche, ce qui est ce que `touched` lit.
   */
  uses: readonly { preparationId: string; servings: number }[];
}

export interface SizablePreparation {
  id: string;
  /** > 0. Ce qui sort de la cuisson, en nombre de portions. */
  servingsMade: number;
  /**
   * CE QUE LA CASSEROLE PRODUIT VRAIMENT, en grammes de PRÊT
   * (`preparationReadyGrams`). `null` = non reconstructible.
   *
   * ⚠️ C'EST LA PART **FIXE**, et c'est toute la leçon de
   * `scaling-factor-applies-only-to-the-mobile-part`: un facteur qui ignore ce
   * que le récipient contient fait grossir un plan sans rien lui donner à
   * manger. Ici la nourriture existante ne bouge pas d'un gramme — seul son
   * PARTAGE bouge — et le plafond du récipient est ce qui le garantit.
   */
  readyGrams: number | null;
}

export interface BoxSizingResult {
  /**
   * Les nouveaux grammages, par contenant puis par INDEX de composant. Un
   * composant absent de cette table n'a pas bougé — on ne rend PAS le contenant
   * entier, pour que l'appelant ne puisse pas reconstruire un repas en perdant
   * ses autres champs.
   *
   * ⚠️ L'INDEX, PAS UNE CLÉ. Voir `SizableMeal.items`: il n'existe pas de clé
   * stable pour un composant, et l'ordre est le contrat.
   */
  items: Map<string, Map<number, number>>;
  /**
   * ⚠️ QUATRE NOMBRES, ET UNE PROPRIÉTÉ TESTÉE: `sized + unchanged === shares`.
   * Un compteur à deux nombres rendrait le même zéro pour « aucune cible » et
   * pour « une cible qu'on n'a pas su appliquer », et c'est le zéro ambigu que
   * ce dépôt paie en boucle.
   *
   *   · `boxes`         — les contenants du plan. Le contexte.
   *   · `common`        — ceux qui portent PLUSIEURS noms, donc qu'aucun facteur
   *                       ne touche. ⛔ SANS CE NOMBRE, un plan v4 où tout le
   *                       monde est dans un bac commun rendrait `sized: 0` —
   *                       exactement ce que rend un lot désarmé.
   *   · `items`         — les composants, tous contenants confondus. Le
   *                       dénominateur.
   *   · `sized`         — ceux dont les grammes ont bougé.
   *   · `unchanged`     — les autres. Le cas NOMINAL (aucune cible réglée).
   *   · `capped_by_pot` — les préparations dont la somme redimensionnée dépassait
   *                       ce qu'elles produisent, ramenées au plafond.
   *   · `unverifiable`  — les préparations dont la production n'est pas
   *                       reconstructible: on redimensionne, on ne peut pas
   *                       vérifier la somme.
   *
   * ⚠️ PROPRIÉTÉ TESTÉE: `sized + unchanged === items`.
   *
   * ⛔ `shared_mixed` ET `shared_scaled` ONT DISPARU, ET CE N'EST PAS UNE PERTE.
   * Ils existaient parce qu'une boîte à N noms ne portait qu'UN nombre: le
   * moteur la pesait à la MOYENNE des facteurs de ses bouches et rendait à
   * chacune sa part dans la phrase de table. v4 les rend inutiles autrement —
   * un bac à N noms ne se dimensionne pas du tout, et `common` le dit.
   */
  counts: {
    boxes: number;
    common: number;
    items: number;
    sized: number;
    unchanged: number;
    capped_by_pot: number;
    unverifiable: number;
  };
  issues: string[];
  /**
   * LE RABOT DU PLAFOND DE RÉCIPIENT, PAR CASSEROLE. `1` (ou absent) = elle a
   * suivi; `0,8` = tout ce qui tire sur elle a été ramené à 80 %.
   *
   * ⛔ IL EST RENDU PARCE QUE `unmetDemand` (`pot_demand.ts`) LE RÉCLAME, et que
   * cette fonction est la SEULE à le connaître. Il vivait en local (§③) et
   * mourait avec l'appel: le module qui devait mesurer le fork aval/amont était
   * construit, testé, et privé de sa dernière entrée — le lot désarmé, une
   * troisième fois.
   *
   * ⚠️ IL EST CLÉ PAR `preparationId`, PAS PAR BOUCHE. C'est l'appelant qui sait
   * quelle bouche tire sur quelle casserole quel jour; refaire ce partage ici
   * ferait une seconde arithmétique du même prorata, et ce dépôt en compte déjà
   * le prix (`neededPotFactor`, « une seconde arithmétique du même partage
   * divergerait de celle qui fait autorité au premier ajustement »).
   */
  shrink: Map<string, number>;
}

/**
 * LE PLANCHER D'UNE PART, en grammes. Une part à zéro n'est pas une portion,
 * c'est une consigne qui dit « rien » — et l'écran l'imprimerait telle quelle.
 */
export const BOX_MIN_SIZED_GRAMS = 1;

/**
 * D'OÙ VIENT LE FACTEUR D'UN CONTENANT. Fermé, et nommé pour la même raison que
 * tous les vocabulaires de ce fichier: `anchor` et `relative` ne se réparent pas
 * au même endroit, et un compteur qui les fondrait enverrait au mauvais.
 */
export const BOX_FACTOR_SOURCES = Object.freeze(
  [
    /** L'ancrage absolu de CE jour a tiré (`anchored` ou `clamped`). */
    "anchor",
    /**
     * LE BAC, dimensionné sur la SOMME des besoins de ses mangeurs (A2).
     *
     * ⛔ CE N'EST PAS « le facteur d'une de ses bouches ». C'est un nombre qui
     * n'appartient à aucune d'elles, et c'est pour ça qu'il a sa propre source:
     * le confondre avec `anchor` ferait lire « on a ancré Marc » là où on a
     * rempli une casserole.
     */
    "pot",
    /** La part relative de la table — un RAPPORT, qui ne décide pas du niveau. */
    "relative",
    /** Rien à appliquer: le contenant sort tel que le modèle l'a écrit. */
    "none",
  ] as const,
);
export type BoxFactorSource = (typeof BOX_FACTOR_SOURCES)[number];

export interface BoxFactor {
  factor: number;
  source: BoxFactorSource;
}

/**
 * QUEL FACTEUR POUR QUEL CONTENANT — l'unique autorité, et une BASCULE.
 *
 * ── ⛔ JAMAIS LE PRODUIT DES DEUX COUCHES ─────────────────────────────────
 * L'ancrage REMPLACE le relatif, il ne le multiplie pas. C'est la décision du
 * chantier grammage (« ancrage tiré → son facteur REMPLACE le relatif; sinon le
 * relatif reste, seul »), et la raison est un double comptage mesuré sur trois
 * runs: le modèle découpait par classe, le moteur multipliait par-dessus, et
 * l'ado de 70 kg dont le corps demande 2,03x la part de l'adulte de 47 kg en
 * recevait 1,02x.
 *
 * ── ⟳ CE QUI CHANGE LE 2026-09-04: LA GRANULARITÉ ────────────────────────
 * La bascule se faisait PAR BOUCHE, sur un facteur élu parmi ses jours ancrés —
 * « le plus proche de 1 gagne ». Cette prudence n'existait que parce qu'UN
 * facteur servait toute la fenêtre: l'ancrage avait calculé pour un jour précis
 * (son énergie, ses moments, sa masse), et l'appliquer à un autre jour était
 * l'approximation que la prudence pansait. La bascule est désormais par
 * (bouche, JOUR), donc chaque contenant reçoit le facteur qui a été calculé
 * pour lui. Il n'y a plus d'élection, donc plus rien à panser.
 *
 * ⚠️ UNE BOUCHE DANS UN BAC N'EST PAS UNE BOUCHE SANS FACTEUR. Elle rend `none`
 * ici — c'est-à-dire « ce contenant-là ne se dimensionne pas sur elle » — et sa
 * boîte à un nom du même jour, si elle en a une, garde le sien. Le silence est
 * porté par le CONTENANT, jamais par la personne.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function resolveBoxFactors(args: {
  boxes: readonly {
    boxId: string;
    memberIds: readonly string[];
    day: string | null;
  }[];
  /**
   * L'ancrage absolu, clé `<memberId> <day>` — la clé de `householdAnchors`.
   *
   * ⚠️ TYPE STRUCTUREL, PAS `AnchorFactor` IMPORTÉ. `mouth_anchor.ts` importe ce
   * fichier; l'importer en retour ferait un cycle. C'est le même patron que
   * `PotDraw` dans `pot_demand.ts`, et pour la même raison.
   */
  anchors: ReadonlyMap<string, { factor: number; reason: string }>;
  /** La part relative, par `member_id`. */
  relative: ReadonlyMap<string, number>;
  /**
   * LE FACTEUR DE CHAQUE BAC, par `boxId` — déjà calculé (`potFactorFor`).
   *
   * ⚠️ CALCULÉ DEHORS, ET C'EST UNE CONTRAINTE DE COUCHES, PAS UN CHOIX.
   * `pot_demand.ts` importe `mouth_anchor.ts`, qui importe CE fichier: l'appeler
   * d'ici ferait un cycle. Ce que cette fonction garde est ce qu'elle doit
   * garder — l'ARBITRAGE entre les sources — et pas leur calcul.
   *
   * ⛔ SEUL UN BAC RÉELLEMENT DIMENSIONNÉ ENTRE ICI. L'appelant n'y met que les
   * `pot_sized`/`pot_clamped`; un bac qui s'est abstenu n'a pas d'entrée, et
   * sort donc `none` — c'est-à-dire tel que le modèle l'a écrit, comme avant.
   */
  pot: ReadonlyMap<string, number>;
}): Map<string, BoxFactor> {
  const out = new Map<string, BoxFactor>();
  for (const box of args.boxes) {
    // ⛔ UN BAC NE PREND JAMAIS LE FACTEUR D'UNE DE SES BOUCHES. Il prend le
    // sien — la somme des besoins de ceux qui y mangent — ou aucun. C'est le
    // cœur de v4 par l'autre bout: multiplier un bac par la cible de l'un
    // ferait payer aux autres l'arithmétique d'un tiers.
    if (box.memberIds.length !== 1) {
      const potFactor = args.pot.get(box.boxId);
      out.set(
        box.boxId,
        potFactor === undefined || potFactor === 1
          ? { factor: 1, source: "none" }
          : { factor: potFactor, source: "pot" },
      );
      continue;
    }
    const memberId = box.memberIds[0];
    const anchor = args.anchors.get(`${memberId} ${box.day ?? ""}`);
    if (
      anchor && (anchor.reason === "anchored" || anchor.reason === "clamped")
    ) {
      out.set(box.boxId, { factor: anchor.factor, source: "anchor" });
      continue;
    }
    const relative = args.relative.get(memberId);
    out.set(
      box.boxId,
      relative === undefined || relative === 1
        ? { factor: 1, source: "none" }
        : { factor: relative, source: "relative" },
    );
  }
  return out;
}

/**
 * LES PARTS, REDIMENSIONNÉES SUR LA CIBLE DE CHAQUE BOUCHE.
 *
 * ── POURQUOI C'EST DÉTERMINISTE ET APRÈS LE PARSEUR ───────────────────────
 * L'autre sortie était de demander les grammages au modèle, en lui donnant la
 * cible dans le prompt. Elle est écartée, et pour trois raisons mesurées:
 *
 *   1. **Le prompt de la lane foyer expire à quatre minutes** (mesuré par 3C,
 *      reconfirmé par L7). Ce lot n'ajoute pas une ligne au prompt pour ça.
 *   2. Un facteur de grammage dit dans le prompt est un nombre que le modèle
 *      RECOPIE. Mesuré au LOT E: « Zoé: 0,85 de la part de Marc » lu à table est
 *      un verdict comparatif sur deux corps.
 *   3. Un grammage déclaré par le modèle ne peut être que COMPTÉ, jamais
 *      garanti; un grammage calculé ici est exact et rejouable.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Elle ne crée aucune boîte, n'en supprime aucune, ne change aucun `member_id`,
 * ne touche à aucun ingrédient et n'écrit aucun texte. Elle ne fait que
 * multiplier des grammes par un facteur sans unité — et elle refuse de le faire
 * quand la casserole ne suivrait pas.
 *
 * ── LE PLAFOND DU RÉCIPIENT, EXACT DEPUIS v4 (2026-08-20) ────────────────
 * ⛔ C'ÉTAIT LA SEULE VRAIE DIFFICULTÉ DE L'UNITÉ « UN CONTENANT PAR REPAS », ET
 * ELLE A DISPARU. Sous v2, un couvercle portait UN total pour N casseroles: il
 * fallait le répartir au prorata de ce que chaque reprise tire vraiment, et
 * s'abstenir dès qu'un morceau manquait. Un `item` porte son `preparation_id` —
 * l'attribution est EXACTE, et une casserole illisible n'empêche plus de
 * vérifier ses voisines.
 *
 * ⚠️ `unverifiable` NE COMPTE PLUS QUE LES CASSEROLES DONT LA PRODUCTION est
 * irreconstructible (`readyGrams: null`). On ne présente jamais « vérifié » ce
 * qui est « on ne sait pas ».
 *
 * ⚠️ LE RABOT EST CELUI DE **SA** CASSEROLE, ET LE RAPPORT ENTRE LES BOUCHES
 * SURVIT QUAND MÊME: le facteur de rabot est le même pour tous ceux qui tirent
 * sur cette casserole-là. Ce qu'une cible achète est ce rapport, et le préserver
 * est la seule façon de ne pas retirer sa part à quelqu'un pour l'arithmétique
 * d'un autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeBoxesFromTarget(
  meals: readonly SizableMeal[],
  preparations: readonly SizablePreparation[],
  /**
   * Le facteur de CHAQUE CONTENANT, par `boxId`. Un contenant absent de la table
   * vaut `1` — « on n'a rien à lui appliquer », le cas nominal.
   *
   * ⟳ 2026-09-04 — PAR CONTENANT, ET PLUS PAR BOUCHE. Trois raisons mesurées:
   *
   *   1. L'ancrage rend un facteur par (bouche, JOUR); une table par bouche
   *      forçait l'appelant à en élire un pour toute la fenêtre. Il prenait « le
   *      plus proche de 1 » — un pansement de prudence sur une approximation.
   *   2. Une bouche peut avoir une boîte à elle à midi et une part de bac le
   *      soir. Un seul nombre pour les deux est faux dans les deux sens.
   *   3. Un BAC a besoin d'un facteur qui n'est celui d'aucun de ses mangeurs
   *      (la somme de leurs besoins). Une table par bouche ne peut pas le dire.
   *
   * ⛔ CETTE FONCTION NE DÉCIDE PLUS QUI REÇOIT QUOI. Elle applique. Le choix
   * — ancrage, relatif, bac, ou rien — est à `resolveBoxFactors`, et l'y avoir
   * remonté est ce qui garde UNE seule autorité sur le facteur d'un contenant.
   *
   * ⚠️ REQUIS, JAMAIS `?`. Un paramètre facultatif ferait de « aucune cible » le
   * défaut silencieux de tous les appelants, et le lot serait construit,
   * branché, désarmé — le mode d'échec n°1 de ce fichier.
   */
  factorsByBox: ReadonlyMap<string, number>,
  /** La tolérance de somme, reprise du parseur. REQUISE pour la même raison. */
  sumToleranceRatio: number,
): BoxSizingResult {
  const items = new Map<string, Map<number, number>>();
  const issues: string[] = [];
  const counts = {
    boxes: 0,
    common: 0,
    items: 0,
    sized: 0,
    unchanged: 0,
    capped_by_pot: 0,
    unverifiable: 0,
  };
  const prepById = new Map(preparations.map((p) => [p.id, p]));

  // ── ① CHAQUE COMPOSANT, MULTIPLIÉ PAR LE FACTEUR DE **SA** BOUCHE ───────
  //
  // ⛔ ET SEULEMENT SUR UN CONTENANT À UN SEUL NOM. Un bac commun n'est la
  // portion de personne: il n'a pas de bouche dont la cible pourrait le
  // redimensionner, et lui appliquer le facteur de l'un de ses mangeurs ferait
  // payer aux autres l'arithmétique d'un tiers.
  /** Les grammes candidats, par contenant puis par index, avant tout plafond. */
  const candidate = new Map<string, Map<number, number>>();
  /** Les préparations dont AU MOINS un composant a bougé — voir le plafond. */
  const touched = new Set<string>();
  for (const meal of meals) {
    counts.boxes++;
    const next = new Map<number, number>();
    candidate.set(meal.boxId, next);
    // ⚠️ COMPTÉ, PLUS SAUTÉ. Un bac reste un bac — `common` dit combien il y en
    // a, et c'est le nombre qui empêche de lire `sized: 0` comme un lot désarmé
    // là où toute la table est dans un contenant partagé. Mais il traverse
    // désormais la même boucle que les autres: sans facteur, il en ressort
    // identique au gramme près, et avec un facteur de BAC (A2) il se
    // dimensionne. Le `continue` d'avant rendait le second cas inexprimable.
    if (meal.memberIds.length !== 1) counts.common++;
    const factor = factorsByBox.get(meal.boxId) ?? 1;
    let anySized = false;
    for (const [index, item] of meal.items.entries()) {
      counts.items++;
      const sized = factor === 1
        ? item.grams
        : Math.max(BOX_MIN_SIZED_GRAMS, Math.round(item.grams * factor));
      if (sized !== item.grams) anySized = true;
      next.set(index, sized);
    }
    // ⚠️ LA CONDITION `anySized` EST LA GARANTIE DE BYTE-IDENTITÉ. Sans elle, le
    // plafond « réparerait » au passage les plans où le modèle a sur-rempli ses
    // contenants — c'est-à-dire changerait le produit pour la population qui n'a
    // AUCUNE cible. Le parseur a déjà sa propre `issue` pour ce cas-là; ce n'est
    // pas à ce lot de la doubler.
    if (!anySized) continue;
    for (const use of meal.uses) touched.add(use.preparationId);
  }

  // ── ② CE QUE CHAQUE CASSEROLE SE VOIT TIRER — EXACTEMENT, PLUS AU PRORATA ─
  //
  // ⚠️ C'EST LE SEUL ENDROIT OÙ v4 SIMPLIFIE. Sous v2 un couvercle portait UN
  // total pour N casseroles, et il fallait le répartir au prorata de ce que
  // chaque reprise tire — donc s'abstenir dès qu'une casserole n'était pas
  // reconstructible. Un `item` porte son `preparation_id`: l'attribution est
  // exacte, et une casserole illisible n'empêche plus de vérifier ses voisines.
  //
  // ⚠️ UN COMPOSANT À `preparationId: null` NE TIRE SUR AUCUNE FOURNÉE. Il est
  // ajouté frais le jour même; l'attribuer à une casserole la ferait déborder
  // avec du pain acheté le matin.
  const drawn = new Map<string, number>();
  for (const meal of meals) {
    const next = candidate.get(meal.boxId);
    for (const [index, item] of meal.items.entries()) {
      if (item.preparationId === null) continue;
      const grams = next?.get(index) ?? item.grams;
      drawn.set(
        item.preparationId,
        (drawn.get(item.preparationId) ?? 0) + grams,
      );
    }
  }

  // ── ③ LE PLAFOND DU RÉCIPIENT, CASSEROLE PAR CASSEROLE ──────────────────
  const shrink = new Map<string, number>();
  for (const prep of preparations) {
    if (!touched.has(prep.id)) continue;
    if (prep.readyGrams === null) {
      counts.unverifiable++;
      continue;
    }
    const ceiling = prep.readyGrams * sumToleranceRatio;
    const taken = drawn.get(prep.id) ?? 0;
    if (taken <= ceiling || taken <= 0) continue;
    shrink.set(prep.id, ceiling / taken);
    counts.capped_by_pot++;
    issues.push(
      `preparations[${prep.id}]: the sized meals would take ${
        Math.round(taken)
      } g ` +
        `but the batch makes about ${
          Math.round(prep.readyGrams)
        } g, every share ` +
        `that draws on it scaled back to fit`,
    );
  }

  // ── ④ CE QUI SORT: CHAQUE COMPOSANT, RABOTÉ PAR SA PROPRE CASSEROLE ─────
  //
  // ⚠️ LE RABOT EST CELUI DE LA CASSEROLE QUI DÉBORDE, ET DE PERSONNE D'AUTRE.
  // Ce qu'une cible achète est le RAPPORT entre les bouches; il est préservé
  // parce que le facteur de rabot est le MÊME pour tous ceux qui tirent sur
  // cette casserole-là. Le riz d'un plat dont seul le poulet manque ne bouge
  // pas, ce qui est la réalité du récipient.
  for (const meal of meals) {
    const next = candidate.get(meal.boxId);
    if (!next || next.size === 0) continue;
    const out = new Map<number, number>();
    for (const [index, item] of meal.items.entries()) {
      const sized = next.get(index) ?? item.grams;
      const ratio = item.preparationId === null
        ? 1
        : (shrink.get(item.preparationId) ?? 1);
      const final = ratio === 1
        ? sized
        : Math.max(BOX_MIN_SIZED_GRAMS, Math.round(sized * ratio));
      // ⚠️ `sized` SE COMPTE SUR CE QUI A RÉELLEMENT BOUGÉ, jamais par
      // soustraction. Un composant dont le facteur ≠ 1 mais dont l'arrondi rend
      // le MÊME nombre n'a pas bougé, et le compter dirait qu'une cible a mordu
      // là où l'assiette est identique. Cicatrice `withheld`/`over_cap`.
      if (final === item.grams) continue;
      counts.sized++;
      out.set(index, final);
    }
    if (out.size > 0) items.set(meal.boxId, out);
  }
  counts.unchanged = counts.items - counts.sized;
  return { items, counts, issues, shrink };
}
