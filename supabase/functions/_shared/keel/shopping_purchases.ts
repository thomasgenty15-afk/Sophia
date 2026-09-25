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
  /**
   * ⟳ 2026-09-24 — LES RANGS DES JOURS DE COURSES DÉJÀ POSÉS. REQUIS : `[]`
   * dit « aucun », une absence ne se relirait pas.
   */
  readonly shopDays: readonly number[];
  /**
   * ⟳ 2026-09-25 — AUCUN JOUR DE COURSES NE S'AJOUTE, quand c'est un objet.
   * Chaque achat se range sur un jour de `shopDays` (`shopRankFor`), parce que
   * la personne a choisi son nombre de courses et que ce nombre est une règle
   * (décision du propriétaire : « si le user dit 3, c'est 3 »). `sessionRanks`
   * = les jours de cuisine : un usage ce jour-là peut s'acheter le matin même.
   * `false` = la règle d'avant. REQUIS : un défaut rouvrirait la course en plus.
   */
  readonly onlyShopDays: false | { readonly sessionRanks: readonly number[] };
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
    // ⟳ 2026-09-24 — STRICTEMENT MOINS QUE LA FENÊTRE. Un groupe dont
    // l'étendue VAUT la fenêtre ne s'achète qu'au jour de son premier usage
    // (`dernier − fenêtre` = `premier`) — et un achat le jour même arrive
    // après le petit-déjeuner (décision de l'utilisateur, épinards du lundi).
    // Un groupe s'achète donc au plus tard la VEILLE de son premier usage.
    if (
      courant !== null && premier !== null &&
      (fenetre === null || u.rank - premier < Math.max(1, fenetre))
    ) {
      courant.uses.push(u);
      continue;
    }
    groupes.push({ uses: [u] });
  }
  //
  // ⟳ 2026-09-24 — UN JOUR DE COURSES DÉJÀ POSÉ PASSE AVANT. Tout jour entre
  // `dernier − fenêtre` et la veille de `premier` couvre le groupe. Mesuré sur le brouillon
  // `377e91ad` : des épinards du lundi (fenêtre 3) étaient datés vendredi, une
  // course pour eux seuls, entre celle du jeudi et celle du samedi — alors que
  // samedi les couvrait. On prend le jour déjà posé le plus TARD de cet
  // intervalle (le plus frais) ; sans lui, la règle d'avant.
  //
  // ⛔ STRICTEMENT AVANT `premier`. Une course le jour même de l'usage ne le
  // couvre pas : des épinards achetés lundi pour le petit-déjeuner de lundi
  // arrivent après le repas.
  const dateDe = (g: { uses: { rank: number }[] }): number => {
    if (fenetre === null) return 0;
    const premier = g.uses[0].rank;
    const dernier = g.uses[g.uses.length - 1].rank;
    const auPlusTot = Math.max(0, dernier - fenetre);
    if (args.onlyShopDays !== false && args.shopDays.length > 0) {
      return shopRankFor({
        lo: auPlusTot,
        hi: premier,
        shopRanks: args.shopDays,
        sameDay: args.onlyShopDays.sessionRanks.includes(premier),
      }).rank;
    }
    const dejaPoses = args.shopDays
      .filter((d) => Number.isFinite(d) && d >= auPlusTot && d < premier)
      .sort((a, b) => a - b);
    return dejaPoses.length > 0 ? dejaPoses[dejaPoses.length - 1] : auPlusTot;
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

  // ⟳ 2026-09-25 — DEUX GROUPES RANGÉS SUR LE MÊME JOUR DE COURSES FONT UN
  // SEUL ACHAT. Ça n'arrive que lorsque les jours sont imposés
  // (`onlyShopDays`): scinder une ligne en deux achats du même jour ferait
  // deux lignes pour une seule course.
  const achats: { rank: number; coversRanks: number[]; share: number }[] = [];
  groupes.forEach((g, i) => {
    const rank = dateDe(g);
    const same = achats.find((a) => a.rank === rank);
    if (same) {
      same.coversRanks.push(...g.uses.map((u) => u.rank));
      same.share += parts[i];
    } else {
      achats.push({ rank, coversRanks: g.uses.map((u) => u.rank), share: parts[i] });
    }
  });
  return {
    purchases: achats,
    counts: {
      undated_uses: undated,
      unweighed_uses: unweighed,
      splits: achats.length - 1,
    },
  };
}

/**
 * ⟳ 2026-09-25 — LE JOUR DE COURSES OÙ RANGER UN ACHAT, PARMI DES JOURS
 * IMPOSÉS.
 *
 * Dans cet ordre :
 *   1. le jour de courses le plus TARDIF entre `lo` (le plus tôt où l'aliment
 *      tient jusqu'à son dernier usage) et `hi` (son premier usage) — `hi`
 *      compris seulement quand ce premier usage est une session de cuisine
 *      (`sameDay`) : on achète le matin, avant la cuisson, et la session est
 *      nourrie par SA course, comme la consigne le dit au modèle. Sinon la
 *      veille au plus tard, la règle de `purchasesForNeed` (un achat le jour
 *      même arrive après le petit-déjeuner) ;
 *   2. sinon, `hi` lui-même s'il est un jour de courses (le premier jour du
 *      plan : il n'y a pas de veille) ;
 *   3. sinon, le jour de courses le plus tardif avant `hi` — l'aliment y est
 *      acheté TROP TÔT, et `fresh: false` le dit. La garde achat → assiette
 *      (`plateWindowReport`) le compte sur le plan écrit.
 *
 * ⛔ IL NE REND JAMAIS UN JOUR HORS DE `shopRanks`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function shopRankFor(args: {
  readonly lo: number;
  readonly hi: number;
  /** Les rangs des jours de courses. JAMAIS vide. */
  readonly shopRanks: readonly number[];
  /** `true` quand le premier usage est une session de cuisine. REQUIS. */
  readonly sameDay: boolean;
}): { rank: number; fresh: boolean } {
  const shops = [...args.shopRanks].filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  if (shops.length === 0) {
    throw new Error("[keel/shopping_purchases] shopRankFor: aucun jour de courses");
  }
  const before = shops.filter((d) =>
    d >= args.lo && (args.sameDay ? d <= args.hi : d < args.hi)
  );
  if (before.length > 0) return { rank: before[before.length - 1], fresh: true };
  if (shops.includes(args.hi) && args.hi >= args.lo) return { rank: args.hi, fresh: true };
  const earlier = shops.filter((d) => d <= args.hi);
  if (earlier.length > 0) return { rank: earlier[earlier.length - 1], fresh: false };
  return { rank: shops[0], fresh: false };
}

/**
 * ⟳ 2026-09-25 — LES JOURS DE COURSES D'UN PLAN, QUAND LA PERSONNE A CHOISI
 * LEUR NOMBRE. Rangs dans la fenêtre du plan (0 = premier jour).
 *
 * Décision du propriétaire, sur le brouillon `54aec009` (deux courses
 * demandées, quatre faites) : « si le user dit 3, c'est 3 ». Ces jours sont
 * dits au modèle AVANT qu'il compose (`raw_keeping.ts`), et le moteur range
 * ensuite chaque achat sur l'un d'eux (`planGroceryWaves`, `purchasesForNeed`) :
 * une seule fonction, pour que la consigne et la liste disent les mêmes jours.
 *
 * La règle :
 *   - la première course est au premier jour de la fenêtre ;
 *   - la course `i` (de 1 à `runs − 1`) sert la session de rang
 *     `⌊i × sessions ÷ runs⌋`, et tombe LA VEILLE de cette session, ou le jour
 *     même (le matin) quand la veille est à moins de `MIN_DAYS_BETWEEN_SHOPS`
 *     jours de la course d'avant. Si ni l'une ni l'autre ne tient, elle
 *     n'existe pas : deux sessions trop proches se nourrissent de la même
 *     course.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function plannedShopRanks(args: {
  /** Les rangs des jours de cuisine. */
  readonly sessionRanks: readonly number[];
  /** Le nombre de courses choisi, `>= 1`. */
  readonly runs: number;
}): number[] {
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error(
      `[keel/shopping_purchases] plannedShopRanks: runs >= 1 requis, reçu ${JSON.stringify(args.runs)}`,
    );
  }
  const sessions = [...new Set(args.sessionRanks.filter((r) => Number.isFinite(r) && r >= 0))]
    .sort((a, b) => a - b);
  const ranks = [0];
  const runs = Math.floor(args.runs);
  for (let i = 1; i < runs; i++) {
    const session = sessions[Math.floor((i * sessions.length) / runs)];
    if (session === undefined) continue;
    const last = ranks[ranks.length - 1];
    const pick = [session - 1, session].find((r) => r > last && r - last >= MIN_DAYS_BETWEEN_SHOPS);
    if (pick !== undefined) ranks.push(pick);
  }
  return ranks;
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
  /**
   * ⟳ 2026-09-24 — LIGNES D'UN SEUL ACHAT REDATÉES : leur date (la cuisson la
   * plus tôt − la fenêtre) était trop tôt pour leur DERNIER usage. Mesuré :
   * « blanc de poulet » acheté vendredi, mangé dimanche ET mardi — quatre
   * jours pour une volaille qui en tient deux (brouillon `930edb4b`).
   */
  readonly redated_single: number;
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
  /** Les rangs des jours de courses déjà posés — voir `purchasesForNeed`. */
  readonly shopDays: readonly number[];
  /** ⟳ 2026-09-25 — aucun jour ne s'ajoute à `shopDays` — voir `purchasesForNeed`. */
  readonly onlyShopDays: false | { readonly sessionRanks: readonly number[] };
  /**
   * ⟳ 2026-09-24 — LE RANG DU JOUR D'ACHAT ACTUEL DE LA LIGNE, `null` si elle
   * n'est pas datée. REQUIS : c'est lui qui dit qu'un achat unique est trop
   * tôt pour son dernier usage.
   */
  readonly rankOf: (line: L) => number | null;
  /** La ligne, avec sa part du besoin et son jour d'achat. */
  readonly withShare: (line: L, share: number, rank: number) => L;
}): {
  readonly lines: L[];
  /**
   * ⟳ 2026-09-24 — LES RANGS DES USAGES QUE CHAQUE LIGNE RENDUE COUVRE, alignés
   * sur `lines`. `null` = aucun besoin retrouvé. C'est ce que lit
   * `spaceShoppingDays` : une ligne scindée ne couvre que SES usages, et la
   * juger sur tous ceux du besoin la clouerait à sa place.
   */
  readonly covers: (readonly number[] | null)[];
  readonly counts: SplitCounts;
} {
  const out: L[] = [];
  const covers: (readonly number[] | null)[] = [];
  let split_needs = 0;
  let extra_lines = 0;
  let unsplittable = 0;
  let without_need = 0;
  let redated_single = 0;
  for (const line of args.lines) {
    const uses = args.usesOf(line);
    if (uses === null) {
      without_need += 1;
      out.push(line);
      covers.push(null);
      continue;
    }
    const plan = purchasesForNeed({
      uses,
      window: args.windowOf(line),
      lastRank: args.lastRank,
      shopDays: args.shopDays,
      onlyShopDays: args.onlyShopDays,
    });
    const allCovered = plan.purchases.flatMap((p) => p.coversRanks);
    if (plan.purchases.length <= 1) {
      // ⟳ 2026-09-24 — UN SEUL ACHAT SUFFIT, MAIS LA LIGNE EST DATÉE TROP TÔT.
      // Sa date vient de la cuisson la PLUS TÔT ; si elle précède
      // `dernier usage − fenêtre`, le dernier repas mange un aliment périmé.
      // On la redate au jour que `purchasesForNeed` a choisi — toujours avant
      // le premier usage. Une ligne sans fenêtre (conserve, congelée) ne bouge pas.
      const current = args.rankOf(line);
      const window = args.windowOf(line);
      const only = plan.purchases[0];
      if (
        only !== undefined && current !== null && window !== null && allCovered.length > 0 &&
        current < Math.max(0, Math.max(...allCovered) - window) && only.rank > current
      ) {
        redated_single += 1;
        out.push(args.withShare(line, 1, only.rank));
        covers.push(allCovered);
        continue;
      }
      out.push(line);
      covers.push(allCovered);
      continue;
    }
    if (!args.splittable(line)) {
      // ⛔ ON NE COUPE PAS CE QU'ON NE SAIT PAS CHIFFRER, et on ne se tait pas
      // non plus : la ligne reste entière et le besoin est nommé au journal.
      unsplittable += 1;
      out.push(line);
      covers.push(allCovered);
      continue;
    }
    split_needs += 1;
    extra_lines += plan.purchases.length - 1;
    for (const p of plan.purchases) {
      out.push(args.withShare(line, p.share, p.rank));
      covers.push(p.coversRanks);
    }
  }
  return {
    lines: out,
    covers,
    counts: { split_needs, extra_lines, unsplittable, without_need, redated_single },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ ⟳ 2026-09-24 — DEUX JOURS AU MOINS ENTRE DEUX COURSES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ÉCART MINIMUM ENTRE DEUX JOURS DE COURSES, en jours.
 *
 * Décision de l'utilisateur (2026-09-24), sur deux plans réels : une course
 * d'épinards seuls le vendredi entre celles du jeudi et du samedi (`377e91ad`),
 * une course de laitue seule le lendemain de la grosse (`59b06fd6`). On ne
 * retourne pas au magasin le lendemain — sauf quand la fraîcheur l'exige
 * (un poisson qui ne tient qu'un jour) : ça, l'utilisateur l'a accepté.
 */
export const MIN_DAYS_BETWEEN_SHOPS = 2;

export interface SpacingCounts {
  /** Paires de jours de courses trop proches, AVANT ce passage. */
  readonly adjacent_before: number;
  /** ⛔ Celles qui RESTENT — la fraîcheur l'a exigé. À zéro, la règle tient partout. */
  readonly adjacent_after: number;
  readonly lines_moved: number;
  /** Jours de courses supprimés : tout leur contenu a rejoint une autre course. */
  readonly days_removed: number;
  /** Jours de courses décalés à deux jours au moins des autres. */
  readonly days_shifted: number;
}

/**
 * RETIRE LES JOURS DE COURSES TROP PROCHES D'UN AUTRE, SANS JAMAIS ABÎMER LA
 * FRAÎCHEUR.
 *
 * Pour un jour trop proche d'un autre, dans cet ordre :
 *   1. chaque article rejoint une course DÉJÀ PRÉVUE où il reste frais jusqu'à
 *      son usage (la plus tardive, la plus fraîche) — si tous le peuvent, le
 *      jour disparaît ;
 *   2. sinon, ce qui reste est DÉCALÉ à un jour éloigné d'au moins
 *      `MIN_DAYS_BETWEEN_SHOPS` de toutes les autres courses, où il reste frais
 *      (le plus proche du jour d'origine) ;
 *   3. sinon, le jour reste — la fraîcheur passe avant la règle — et se compte
 *      (`adjacent_after`).
 * Le jour le plus tardif de la paire est essayé d'abord, puis le plus précoce
 * s'il n'est pas la première course.
 *
 * ⛔ LA FENÊTRE D'ACHAT D'UN ARTICLE : du plus tôt `dernier usage − fenêtre`
 * (borné au premier jour) au plus tard LA VEILLE de son premier usage (le jour
 * même si ce premier usage est le premier jour). Un achat le jour même d'un
 * repas arrive après lui — la règle déjà posée par `purchasesForNeed`.
 * Un article sans usage connu, ou dont la fenêtre est vide, ne bouge pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function spaceShoppingDays<L>(args: {
  readonly lines: readonly L[];
  /** Les rangs des usages que chaque ligne couvre (`splitShoppingByUses().covers`). */
  readonly covers: readonly (readonly number[] | null)[];
  /** La fenêtre crue de la ligne. `null` = rien ne la fait attendre. */
  readonly windowOf: (line: L) => number | null;
  /** Le rang du jour d'achat de la ligne, ou `null` quand elle n'est pas datée. */
  readonly rankOf: (line: L) => number | null;
  /** La ligne, achetée à ce rang. */
  readonly withRank: (line: L, rank: number) => L;
}): { readonly lines: L[]; readonly counts: SpacingCounts } {
  const out = args.lines.slice();
  const ranks = out.map((l) => args.rankOf(l));
  const ranges = out.map((l, i) => {
    const covered = args.covers[i] ?? null;
    if (covered === null || covered.length === 0) return null;
    const first = Math.min(...covered);
    const last = Math.max(...covered);
    const window = args.windowOf(l);
    const lo = window === null ? 0 : Math.max(0, last - window);
    const hi = first > 0 ? first - 1 : 0;
    return lo > hi ? null : { lo, hi };
  });
  const days = (): number[] =>
    [...new Set(ranks.filter((r): r is number => r !== null))].sort((a, b) => a - b);
  const adjacentPairs = (ds: readonly number[]): number => {
    let n = 0;
    for (let k = 1; k < ds.length; k++) if (ds[k] - ds[k - 1] < MIN_DAYS_BETWEEN_SHOPS) n++;
    return n;
  };
  const adjacent_before = adjacentPairs(days());
  let lines_moved = 0;
  let days_removed = 0;
  let days_shifted = 0;

  const tryFix = (day: number): boolean => {
    const others = days().filter((d) => d !== day);
    const onDay = ranks.flatMap((r, i) => (r === day ? [i] : []));
    const moves = new Map<number, number>();
    const rest: number[] = [];
    for (const i of onDay) {
      const r = ranges[i];
      const targets = r === null ? [] : others.filter((d) => d >= r.lo && d <= r.hi);
      if (targets.length > 0) moves.set(i, Math.max(...targets));
      else rest.push(i);
    }
    if (rest.length > 0) {
      if (rest.some((i) => ranges[i] === null)) return false;
      const lo = Math.max(...rest.map((i) => ranges[i]!.lo));
      const hi = Math.min(...rest.map((i) => ranges[i]!.hi));
      const candidates: number[] = [];
      for (let x = lo; x <= hi; x++) {
        if (x === day) continue;
        if (others.every((o) => Math.abs(x - o) >= MIN_DAYS_BETWEEN_SHOPS)) candidates.push(x);
      }
      if (candidates.length === 0) return false;
      candidates.sort((a, b) => Math.abs(a - day) - Math.abs(b - day) || a - b);
      for (const i of rest) moves.set(i, candidates[0]);
    }
    for (const [i, rank] of moves) {
      out[i] = args.withRank(out[i], rank);
      ranks[i] = rank;
      lines_moved++;
    }
    if (rest.length === 0) days_removed++;
    else days_shifted++;
    return true;
  };

  // ⚠️ CHAQUE CORRECTION RETIRE UNE PAIRE SANS EN CRÉER : un article rejoint un
  // jour qui existe déjà, ou un jour éloigné de tous les autres. Le garde-fou
  // de la boucle n'est qu'une ceinture.
  for (let guard = 0; guard < 64; guard++) {
    const ds = days();
    let changed = false;
    for (let k = 1; k < ds.length && !changed; k++) {
      if (ds[k] - ds[k - 1] >= MIN_DAYS_BETWEEN_SHOPS) continue;
      changed = tryFix(ds[k]) || (k - 1 > 0 && tryFix(ds[k - 1]));
    }
    if (!changed) break;
  }

  return {
    lines: out,
    counts: {
      adjacent_before,
      adjacent_after: adjacentPairs(days()),
      lines_moved,
      days_removed,
      days_shifted,
    },
  };
}
