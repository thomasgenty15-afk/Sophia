/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN BESOIN, SES USAGES DATÉS, ET LES ACHATS QU'IL FAUT POUR LES COUVRIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL EST ÉCRIT DANS LE PLAN DE CLÔTURE :
 * « vérifier chaque usage, pas uniquement la première cuisson d'un ingrédient
 * utilisé plusieurs fois ».
 *
 * Aujourd'hui, la datation prend la cuisson la PLUS TÔT (`earliestCook`) et la
 * garde finale prend le besoin le PLUS TÔT (`earliestRankByTerm`). Les deux
 * regardent donc le même bout du problème — « l'achat arrive-t-il à temps ? » —
 * et aucune ne pose l'autre question : **ce qu'on a acheté tiendra-t-il jusqu'au
 * DERNIER usage ?** Un poisson utilisé lundi et vendredi est acheté dimanche,
 * et les deux contrôles sont contents ; le filet du vendredi a cinq jours.
 *
 * ⛔ ET LA RÉPONSE N'EST PAS « ACHETER PLUS TÔT » NI « REFUSER ». C'est
 * D'ACHETER DEUX FOIS : une course pour la cuisson du lundi, une autre pour
 * celle du vendredi. Le plan l'écrit : « scinder la quantité d'une même
 * référence quand une ligne unique ne couvre pas ses différentes cuissons. La
 * somme des lignes doit égaler le besoin net, sans double achat. »
 *
 * ⚠️ CE MODULE NE DÉCIDE NI LA FENÊTRE NI LA QUANTITÉ. La fenêtre vient de
 * `food_keeping.ts`, la quantité de `shopping_rebuild.ts` ; ici on ne fait que
 * RÉPARTIR. Une seconde règle de conservation écrite ici divergerait de la
 * première au premier aliment ajouté.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

/** Un usage daté d'un besoin : une cuisson, ou un ingrédient ajouté le jour même. */
export interface DatedUse {
  /**
   * Le RANG du jour dans la fenêtre du plan (0 = premier jour). `null` = cet
   * usage n'a pas de date — il ne contraint alors aucun achat, et il se compte.
   */
  readonly rank: number | null;
  /**
   * La masse crue de cet usage, en grammes. `null` = non pesé ; la répartition
   * se fait alors à parts égales entre les usages du même achat, et ça se dit.
   */
  readonly gramsRaw: number | null;
}

export interface Purchase {
  /** Le rang du jour d'achat. */
  readonly rank: number;
  /** Les rangs des usages que cet achat couvre, triés. */
  readonly coversRanks: readonly number[];
  /**
   * La part du besoin que cet achat porte, entre 0 et 1. ⛔ LA SOMME DES PARTS
   * VAUT EXACTEMENT 1 quand il y a au moins un achat — c'est la propriété qui
   * empêche le double achat.
   */
  readonly share: number;
}

export interface PurchasePlan {
  readonly purchases: readonly Purchase[];
  readonly counts: {
    /** Usages sans date : ils ne contraignent rien, et ils se comptent. */
    readonly undated_uses: number;
    /** Usages dont la masse est inconnue : la part est alors égalitaire. */
    readonly unweighed_uses: number;
    /** ⛔ Le besoin a-t-il dû être SCINDÉ ? `purchases.length - 1`. */
    readonly splits: number;
  };
}

/**
 * LES ACHATS D'UN BESOIN, DE SORTE QUE CHAQUE USAGE SOIT DANS SA FENÊTRE.
 *
 * ⛔ L'ALGORITHME EST GLOUTON, ET IL EST LE PLUS ÉCONOME POSSIBLE : on trie les
 * usages, on ouvre un achat au plus tard possible pour le premier usage non
 * couvert (`max(0, usage − fenêtre)`), et cet achat couvre tous les usages
 * jusqu'à `achat + fenêtre`. Un achat de plus n'est ouvert que lorsqu'un usage
 * tombe hors de cette portée.
 *
 * ⛔ « AU PLUS TARD POSSIBLE » EST LA RÈGLE DE FRAÎCHEUR DÉJÀ APPLIQUÉE par
 * `planGroceryWaves` (`buyOn = max(début, cuisson − fenêtre)`). La recopier
 * autrement ferait deux dates pour un même achat.
 *
 * ⚠️ `window === null` VEUT DIRE « RIEN NE FAIT ATTENDRE » : un seul achat, au
 * premier jour. C'est le cas des conserves et du congelé — et c'est une
 * réponse, pas une abstention.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function purchasesForNeed(args: {
  readonly uses: readonly DatedUse[];
  /** La fenêtre crue en jours. `null` = aucune contrainte de conservation. */
  readonly window: number | null;
  /** Le rang du dernier jour de la fenêtre du plan. */
  readonly lastRank: number;
}): PurchasePlan {
  const undated = args.uses.filter((u) => u.rank === null).length;
  const unweighed = args.uses.filter((u) =>
    u.gramsRaw === null || !Number.isFinite(u.gramsRaw)
  ).length;
  const dates = args.uses
    .filter((u): u is DatedUse & { rank: number } =>
      u.rank !== null && Number.isFinite(u.rank)
    )
    .map((u) => ({
      rank: Math.max(0, Math.min(args.lastRank, Math.round(u.rank))),
      grams: u.gramsRaw === null || !Number.isFinite(u.gramsRaw)
        ? null
        : Math.max(0, u.gramsRaw),
    }))
    .sort((a, b) => a.rank - b.rank);

  if (dates.length === 0) {
    // ⛔ AUCUN USAGE DATÉ: un seul achat, au premier jour, et la part est
    // entière. On n'invente pas de date — on dit qu'on n'en avait pas.
    return {
      purchases: [{ rank: 0, coversRanks: [], share: 1 }],
      counts: { undated_uses: undated, unweighed_uses: unweighed, splits: 0 },
    };
  }

  const fenetre = args.window === null ? null : Math.max(0, args.window);
  // ── LE REGROUPEMENT ─────────────────────────────────────────────────────
  //
  // ⛔ UN ACHAT AU JOUR `d` COUVRE LES USAGES DE `d` À `d + fenêtre`. Un groupe
  // d'usages est donc faisable d'un seul achat SI ET SEULEMENT SI son ÉTENDUE
  // (dernier − premier) tient dans la fenêtre : il existe alors un `d` valide,
  // et le plus TÔT d'entre eux est `dernier − fenêtre`.
  //
  // ⚠️ « LE PLUS TÔT » ET PAS « LE PLUS TARD », ET C'EST LA RÈGLE EXISTANTE :
  // `planGroceryWaves` date à `cuisson − fenêtre`, ce qui REGROUPE les courses
  // en vagues au lieu d'en faire une par cuisson. Choisir l'autre extrémité
  // serait plus frais et ferait sortir la personne tous les jours.
  const groupes: { uses: { rank: number; grams: number | null }[] }[] = [];
  for (const u of dates) {
    const courant = groupes.length === 0 ? null : groupes[groupes.length - 1];
    const premier = courant === null ? null : courant.uses[0].rank;
    if (
      courant !== null && premier !== null &&
      (fenetre === null || u.rank - premier <= fenetre)
    ) {
      courant.uses.push(u);
      continue;
    }
    groupes.push({ uses: [u] });
  }
  const dateDe = (g: { uses: { rank: number }[] }): number => {
    if (fenetre === null) return 0;
    const dernier = g.uses[g.uses.length - 1].rank;
    return Math.max(0, dernier - fenetre);
  };

  // ── LES PARTS ───────────────────────────────────────────────────────────
  //
  // ⛔ AU PRORATA DES MASSES QUAND ON LES A, À PARTS ÉGALES SINON — et le
  // second cas se compte (`unweighed_uses`). Inventer une masse ferait acheter
  // trop d'un côté et pas assez de l'autre, sans que rien ne le dise.
  const totalPesé = dates.reduce((n, u) => n + (u.grams ?? 0), 0);
  const pesable = totalPesé > 0 && unweighed === 0;
  const brutes = groupes.map((g) =>
    pesable
      ? g.uses.reduce((n, u) => n + (u.grams ?? 0), 0) / totalPesé
      : g.uses.length / dates.length
  );
  // ⛔ LA SOMME VAUT EXACTEMENT 1. Le dernier absorbe l'arrondi: sans ça, trois
  // tiers font 0,999 et il manque un gramme au dernier achat.
  const parts = brutes.map((p, i) =>
    i === brutes.length - 1
      ? Math.max(0, 1 - brutes.slice(0, -1).reduce((a, b) => a + b, 0))
      : p
  );

  return {
    purchases: groupes.map((g, i) => ({
      rank: dateDe(g),
      coversRanks: g.uses.map((u) => u.rank),
      share: parts[i],
    })),
    counts: {
      undated_uses: undated,
      unweighed_uses: unweighed,
      splits: groupes.length - 1,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA LISTE DE COURSES, SCINDÉE QUAND UN SEUL ACHAT NE SUFFIT PAS
// ═══════════════════════════════════════════════════════════════════════════

export interface SplitCounts {
  /** Besoins qui ont demandé plus d'un achat. */
  readonly split_needs: number;
  /** Lignes AJOUTÉES par les scissions (`achats − 1` par besoin scindé). */
  readonly extra_lines: number;
  /**
   * ⛔ BESOINS QU'IL AURAIT FALLU SCINDER ET QU'ON N'A PAS PU. Une ligne sans
   * quantité chiffrée ne se coupe pas en deux : on la laisse entière, et on le
   * DIT. Sans ce nombre, « aucune scission nécessaire » et « une scission
   * impossible » rendraient le même silence.
   */
  readonly unsplittable: number;
  /** Lignes dont aucun besoin n'a été retrouvé : laissées telles quelles. */
  readonly without_need: number;
}

/**
 * SCINDE LES LIGNES DONT UN SEUL ACHAT NE COUVRIRAIT PAS TOUS LES USAGES.
 *
 * ⛔ POURQUOI ICI ET PAS DANS `rebuildShoppingQuantities`. La reconstruction
 * REGROUPE les lignes d'une même identité (`merged`) — sans quoi un besoin
 * s'achèterait deux fois. Scinder à l'intérieur d'elle se ferait donc défaire
 * par son propre regroupement. Ce passage vient APRÈS, et l'ensemble reste
 * IDEMPOTENT : la reconstruction refond les lignes scindées en une seule, ce
 * passage les re-scinde à l'identique, parce que les deux repartent des USAGES
 * et jamais de la valeur précédente d'une ligne.
 *
 * ⚠️ IL N'ÉCRIT NI QUANTITÉ NI DATE LUI-MÊME : `withShare` est injecté, et
 * c'est l'appelant qui sait écrire une quantité dans la langue du plan
 * (`renderQuantity`) et convertir un rang en date. Une seconde arithmétique de
 * la quantité ici serait le jumeau que `shopping_rebuild.ts` a déjà tué.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function splitShoppingByUses<L>(args: {
  readonly lines: readonly L[];
  /** Les usages datés de cette ligne. `null` = aucun besoin retrouvé. */
  readonly usesOf: (line: L) => readonly DatedUse[] | null;
  /** La fenêtre de conservation de cette ligne. `null` = rien ne la fait attendre. */
  readonly windowOf: (line: L) => number | null;
  /** `true` quand la ligne porte une quantité qu'on sait couper. */
  readonly splittable: (line: L) => boolean;
  readonly lastRank: number;
  /** La ligne, avec sa part du besoin et son jour d'achat. */
  readonly withShare: (line: L, share: number, rank: number) => L;
}): { readonly lines: L[]; readonly counts: SplitCounts } {
  const out: L[] = [];
  let split_needs = 0;
  let extra_lines = 0;
  let unsplittable = 0;
  let without_need = 0;
  for (const line of args.lines) {
    const uses = args.usesOf(line);
    if (uses === null) {
      without_need += 1;
      out.push(line);
      continue;
    }
    const plan = purchasesForNeed({
      uses,
      window: args.windowOf(line),
      lastRank: args.lastRank,
    });
    if (plan.purchases.length <= 1) {
      out.push(line);
      continue;
    }
    if (!args.splittable(line)) {
      // ⛔ ON NE COUPE PAS CE QU'ON NE SAIT PAS CHIFFRER, et on ne se tait pas
      // non plus : la ligne reste entière et le besoin est nommé au journal.
      unsplittable += 1;
      out.push(line);
      continue;
    }
    split_needs += 1;
    extra_lines += plan.purchases.length - 1;
    for (const p of plan.purchases) out.push(args.withShare(line, p.share, p.rank));
  }
  return {
    lines: out,
    counts: { split_needs, extra_lines, unsplittable, without_need },
  };
}
