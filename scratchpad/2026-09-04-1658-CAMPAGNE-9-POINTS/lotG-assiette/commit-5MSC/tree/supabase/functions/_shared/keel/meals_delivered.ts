/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — PERSONNE SANS REPAS. L'invariant, sa cause, et son recours.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR UN PLAN RÉEL (2026-09-04) ────
 * Foyer de cinq bouches, « Mon mari n'aime pas les lentilles » noté pour Marc.
 * Le plan vivant : 19 plats, 12 repas mis en boîte, Marc nommé sur 7 couvercles.
 * **Cinq repas où Marc n'a aucune boîte**, dont quatre plats de lentilles.
 *
 * Personne ne l'a vu, et ce n'est pas un oubli de lecture : le compteur qui
 * aurait dû le dire — « cette bouche n'a pas de boîte à ce repas » — SAUTAIT
 * explicitement les bouches que la ceinture avait retirées. La ligne était
 * `if (cellState.heldOff.has(memberId)) continue;`, et son intention était
 * bonne : ne pas accuser le modèle d'un trou que le moteur venait de creuser.
 * Sa conséquence ne l'était pas : le trou existait quand même, dans l'assiette
 * de quelqu'un, et le produit rendait un plan vert.
 *
 * ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ────────────────────
 * Il RÉPOND à une seule question, par bouche et par case : cette personne
 * mange-t-elle ici ? Il ne compose rien, n'écrit rien, ne refuse rien. Il rend
 * la liste de ce qui manque AVEC LA CAUSE, parce que le recours n'est pas le
 * même — un régime est une ligne qu'on ne franchit pas, un dégoût est un goût,
 * et un oubli du modèle n'est ni l'un ni l'autre.
 *
 * ── LA RÈGLE, POUR UNE BOUCHE ET UNE CASE ────────────────────────────────
 * Aucun plat sur la case          → ce n'est pas SON repas manqué, c'est un
 *                                    trou du plan. Hors du dénominateur.
 * Un plat dédié à elle            → nourrie.
 * Un plat de table SANS boîte     → nourrie (rien n'a été pesé d'avance : tout
 *                                    le monde mange le plat).
 * Nommée sur EXACTEMENT une boîte → nourrie.
 * Nommée sur deux boîtes ou plus  → `double`.
 * Sur aucune, et retirée          → `held_off_regime` | `held_off_exclusion`.
 * Sur aucune, sans retrait        → `not_named`.
 *
 * ⚠️ LE RÉGIME PRIME SUR LE DÉGOÛT quand les deux ont mordu, exactement comme
 * à la ceinture (qui vérifie le régime en premier et sort avant l'exclusion).
 * Deux causes pour une même bouche compteraient deux repas manqués là où il
 * n'y en a qu'un.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/** Pourquoi une bouche n'est nourrie à une case. Vocabulaire FERMÉ. */
export const UNFED_CAUSES = [
  "held_off_regime",
  "held_off_exclusion",
  "not_named",
  "double",
  // ⟳ 2026-09-06 — AUCUN PLAT À CE REPAS. Campagne du 05/09: un plan de 6 jours
  // composé sur 2 (M10) rendait « personne sans repas », parce qu'une case
  // vide n'était qu'un trou compté à part. Elle est un manque pour chaque
  // bouche qui y mange: la relance sait le combler, le refus sait le dire.
  "no_dish",
] as const;
export type UnfedCause = (typeof UNFED_CAUSES)[number];

/**
 * UN PLAT, VU PAR L'INVARIANT. La forme minimale : ce module ne connaît ni les
 * ingrédients, ni les grammes, ni les casseroles.
 *
 * ⚠️ `title` N'EST PAS DÉCORATIF: c'est ce que la relance ciblée met sous les
 * yeux du modèle. Une consigne qui dit « quelqu'un manque à un repas » sans
 * nommer LE PLAT laisse le modèle chercher, et il réécrit autre chose.
 */
export interface DeliveredDish {
  readonly title: string;
  readonly day: string | null;
  readonly slot: string | null;
  /** La bouche à qui ce plat est dédié. `null` = le plat de la table. */
  readonly memberId: string | null;
  readonly boxes: readonly { readonly id: string; readonly memberIds: readonly string[] }[];
  readonly heldOff: readonly {
    readonly memberId: string;
    readonly cause: "regime" | "exclusion";
    readonly boxId: string;
    readonly via: "items" | "preparation";
    readonly preparationId: string | null;
    readonly matched: string | null;
  }[];
  /**
   * ⟳ 2026-09-05 — LES RÉGIMES QUE LA SURFACE DU PLAT MORD (posé par la
   * ceinture, `regimeBites`). Sert au seul cas où la ceinture par boîte n'a
   * rien pu retirer: un plat SANS boîte. Sonde R2-D: une relance « Poulet,
   * riz » rendue sans boîtes faisait passer une végétarienne de manquante à
   * nourrie. Absent (lecteur ancien): la règle d'hier, le plat nourrit tout
   * le monde.
   */
  readonly regimeBites?: readonly string[];
  /**
   * ⟳ 2026-09-06 — les bouches dont une EXCLUSION mord ce plat. Un plat
   * ouvert (sans boîte) ne nourrit pas une bouche qui y figure : mesuré
   * FB4/FB4r, le saumon exclu par la table partait chez tout le monde parce
   * que les boîtes vidées par la ceinture rendaient le plat « de la maison ».
   */
  readonly exclusionBites?: readonly string[];
}

/** Une bouche, et les cases où elle mange ICI sur cette fenêtre. */
export interface DeliveredMouth {
  readonly memberId: string;
  readonly cells: readonly { readonly day: string; readonly slot: string }[];
  /** La ligne de la bouche, pour le plat sans boîte. Absent = aucune. */
  readonly regime?: string | null;
}

/** Un repas qui manque à quelqu'un, avec de quoi le réparer. */
export interface UnfedRow {
  readonly memberId: string;
  readonly day: string;
  readonly slot: string;
  readonly cause: UnfedCause;
  /** La boîte dont le nom a été retiré — `null` quand rien ne l'a été. */
  readonly boxId: string | null;
  readonly dish: string | null;
  /** ⟳ 2026-09-04 — par où la ceinture est passée (voir `BoxHeldOff.via`). */
  readonly via: "items" | "preparation" | null;
  readonly preparationId: string | null;
  readonly matched: string | null;
}

export interface MealsDelivered {
  readonly mouths: readonly {
    readonly memberId: string;
    readonly expected: number;
    readonly fed: number;
    readonly missing: readonly UnfedRow[];
  }[];
  readonly expected: number;
  readonly fed: number;
  readonly missing: number;
  readonly byCause: Readonly<Record<UnfedCause, number>>;
  /**
   * LES CASES QUE LE PLAN N'A PAS REMPLIES DU TOUT. Comptées à part, et hors du
   * dénominateur: c'est un trou du PLAN (déjà porté par `empty_slots`), pas le
   * repas manqué d'une personne. Les confondre ferait accuser l'invariant d'un
   * défaut qui a déjà son compteur, et gonflerait `missing` d'un facteur égal au
   * nombre de bouches.
   */
  readonly cellsWithoutDish: number;
  /** Les plats sans jour ou sans moment: ils ne nourrissent aucune case. */
  readonly unplacedDishes: number;
  readonly allFed: boolean;
}

function cellKey(day: string, slot: string): string {
  return `${day}/${slot}`;
}

export function mealsDelivered(
  dishes: readonly DeliveredDish[],
  mouths: readonly DeliveredMouth[],
): MealsDelivered {
  // ── LES PLATS, RANGÉS PAR CASE, UNE FOIS ────────────────────────────────
  const byCell = new Map<string, DeliveredDish[]>();
  let unplacedDishes = 0;
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) {
      unplacedDishes++;
      continue;
    }
    const key = cellKey(day, slot);
    const here = byCell.get(key) ?? [];
    here.push(d);
    byCell.set(key, here);
  }

  const byCause: Record<UnfedCause, number> = {
    held_off_regime: 0,
    held_off_exclusion: 0,
    not_named: 0,
    double: 0,
    no_dish: 0,
  };
  const emptyCells = new Set<string>();
  const rows: {
    memberId: string;
    expected: number;
    fed: number;
    missing: UnfedRow[];
  }[] = [];
  let expected = 0;
  let fed = 0;
  let missing = 0;

  for (const mouth of mouths) {
    const memberId = String(mouth?.memberId ?? "").trim();
    if (!memberId) continue;
    const row = { memberId, expected: 0, fed: 0, missing: [] as UnfedRow[] };

    const regime = mouth.regime ?? null;
    for (const cell of mouth.cells ?? []) {
      const day = String(cell?.day ?? "").trim();
      const slot = String(cell?.slot ?? "").trim();
      if (!day || !slot) continue;
      const here = byCell.get(cellKey(day, slot)) ?? [];
      if (here.length === 0) {
        // ⚠️ LE TROU EST COMPTÉ UNE FOIS PAR CASE (`cells_without_dish`) — et,
        // depuis le 2026-09-06, aussi comme un MANQUE par bouche (`no_dish`):
        // c'est ce que la relance comble et ce que le refus nomme.
        emptyCells.add(cellKey(day, slot));
        row.expected++;
        expected++;
        row.missing.push({
          memberId,
          day,
          slot,
          cause: "no_dish",
          boxId: null,
          dish: null,
          via: null,
          preparationId: null,
          matched: null,
        });
        byCause.no_dish++;
        missing++;
        continue;
      }

      row.expected++;
      expected++;

      // ① SON PROPRE PLAT. Il n'a pas besoin de boîte pour la nourrir: c'est le
      //    sien, il est cuisiné pour elle.
      if (here.some((d) => d.memberId === memberId)) {
        row.fed++;
        fed++;
        continue;
      }

      // ② LES PLATS DE LA TABLE DE CETTE CASE. Un plat dédié à QUELQU'UN
      //    D'AUTRE ne la nourrit pas, et ne compte pas contre elle.
      const table = here.filter((d) => !d.memberId);
      if (table.length === 0) {
        row.missing.push({
          memberId,
          day,
          slot,
          cause: "not_named",
          boxId: null,
          dish: here[0]?.title ?? null,
          via: null,
          preparationId: null,
          matched: null,
        });
        byCause.not_named++;
        missing++;
        continue;
      }

      // ③ UN PLAT SANS AUCUNE BOÎTE NOURRIT TOUT LE MONDE. Rien n'a été pesé
      //    d'avance pour ce repas: il n'y a pas de contenant à ne pas avoir.
      //    ⟳ 2026-09-05 — SAUF la bouche dont la ligne mord ce plat (R2-D): un
      //    « Poulet, riz » sans boîte ne nourrit pas la végétarienne. La
      //    ceinture par boîte n'a rien pu retirer; l'invariant le voit ici.
      const open = table.filter((d) => d.boxes.length === 0);
      const openSafe = open.filter((d) =>
        (regime === null || !(d.regimeBites ?? []).includes(regime)) &&
        !(d.exclusionBites ?? []).includes(memberId)
      );
      if (openSafe.length > 0) {
        row.fed++;
        fed++;
        continue;
      }
      // ⟳ 2026-09-06 — un plat ouvert qui mord: le RÉGIME prime, sinon c'est
      // le dégoût qui a fermé la case (et il a son propre recours).
      const openBites = open.some((d) =>
        regime !== null && (d.regimeBites ?? []).includes(regime)
      );
      const openTasteBites = open.some((d) =>
        (d.exclusionBites ?? []).includes(memberId)
      );

      let lids = 0;
      for (const d of table) {
        for (const box of d.boxes) {
          if (box.memberIds.includes(memberId)) lids++;
        }
      }
      if (lids === 1) {
        row.fed++;
        fed++;
        continue;
      }

      const dishHere = table.find((d) =>
        d.heldOff.some((h) => h.memberId === memberId)
      ) ?? (openBites ? open[0] : table[0]);
      let cause: UnfedCause;
      let boxId: string | null = null;
      let via: UnfedRow["via"] = null;
      let preparationId: string | null = null;
      let matched: string | null = null;
      if (lids > 1) {
        cause = "double";
      } else {
        // ⚠️ LE RÉGIME D'ABORD, comme à la ceinture. Sinon une bouche que les
        // deux lignes ont mordue produirait deux causes pour un seul repas.
        const held = table.flatMap((d) => d.heldOff).filter((h) =>
          h.memberId === memberId
        );
        const byRegime = held.find((h) => h.cause === "regime");
        const byTaste = held.find((h) => h.cause === "exclusion");
        const chosen = byRegime ?? byTaste ?? null;
        if (byRegime || openBites) cause = "held_off_regime";
        else if (byTaste || openTasteBites) cause = "held_off_exclusion";
        else cause = "not_named";
        if (chosen) {
          boxId = chosen.boxId;
          via = chosen.via;
          preparationId = chosen.preparationId;
          matched = chosen.matched;
        }
      }
      row.missing.push({
        memberId,
        day,
        slot,
        cause,
        boxId,
        dish: dishHere?.title ?? null,
        via,
        preparationId,
        matched,
      });
      byCause[cause]++;
      missing++;
    }

    rows.push(row);
  }

  return {
    mouths: rows,
    expected,
    fed,
    missing,
    byCause,
    cellsWithoutDish: emptyCells.size,
    unplacedDishes,
    allFed: missing === 0,
  };
}

/** Ce que la relance a besoin de dire — la ligne, avec un PRÉNOM. */
export interface UnfedRetryRow {
  /** ⟳ 2026-09-06 — la boîte dont la ceinture l'a retirée, quand il y en a une. */
  readonly boxId?: string | null;
  readonly name: string;
  readonly memberId: string;
  readonly day: string;
  readonly slot: string;
  readonly cause: UnfedCause;
  readonly dish: string | null;
  /** Optionnels: absents, la relance dit le remède générique de la cause. */
  readonly via?: "items" | "preparation" | null;
  readonly preparationId?: string | null;
  readonly matched?: string | null;
}

/**
 * ⛔ LE REMÈDE EST DIT PAR CAUSE, ET C'EST TOUT L'INTÉRÊT.
 *
 * « Quelqu'un manque à un repas » n'est pas une consigne: le modèle ne sait pas
 * s'il doit ajouter une boîte, en retirer une, ou réécrire le plat. Chaque cause
 * porte donc SON geste, et le geste d'un dégoût n'est jamais celui d'un oubli.
 *
 * ⚠️ L'INTERDICTION DE RACCOURCIR EST OBLIGATOIRE, et c'est la cicatrice des
 * deux relances qui existent déjà: réparer en supprimant des journées est la
 * sortie la plus facile, et elle passe toutes les autres gardes.
 */
/**
 * ⟳ 2026-09-05 — LA RELANCE NE REND QUE LES CELLULES À RÉPARER.
 *
 * Mesuré sur 36 relances réelles: chaque relance rendait un plan ENTIER —
 * 10 à 12 k jetons de sortie, 85 s en médiane — pour changer une ou deux
 * cases, et réécrivait tout le reste, souvent en le cassant. Depuis la fusion
 * par parties (`retry_merge.ts`), l'appelant sait prendre les seules cellules
 * réparées; la relance n'a donc plus besoin de rendre le reste. Le bloc
 * ci-dessous le lui dit: mêmes clés JSON, `dishes` limité aux cases nommées,
 * `preparations` à ce qu'elles citent, sessions et courses idem. Un modèle
 * qui rend quand même le plan entier n'est pas puni: la fusion en prend ce
 * qu'il faut, et le coût est celui d'hier.
 */
export const UNFED_RETRY_PARTIAL_BLOCK = [
  "⛔ RETURN ONLY THE MEALS NAMED ABOVE. Keep the same JSON shape, but:",
  "- \"dishes\" holds ONLY the dishes of those day/slot cells -- every dish of each",
  "  named cell (the table's dish with all its boxes, and any dish of someone's own",
  "  at that cell), nothing from any other day or slot;",
  "- \"preparations\" holds ONLY the preparations those dishes cite, as FULL recipes",
  "  (title, method, ingredients with quantities, cook_on) -- a swapped component",
  "  gets its own preparation, cooked apart;",
  "- \"cooking_sessions\" holds only the sessions those preparations cook in;",
  "- \"shopping_list\" holds only the lines those preparations need;",
  "- \"member_portions\" may be empty.",
  "Rewriting the rest of the plan is a mistake: it will be discarded.",
].join("\n");

export function unfedRetryInstruction(
  rows: readonly UnfedRetryRow[],
  options: {
    readonly partial?: boolean;
    /**
     * ⟳ 2026-09-06 (FC4) — LES MOTS QUE LA TABLE ENTIÈRE ÉVITE. Une exclusion
     * de table a retiré Paul, Claire et Léo de 7 plats au poulet ; la relance
     * leur demandait « une boîte à eux, composant échangé » — trois boîtes de
     * tofu à côté d'un poulet que personne ne mange. Quand le mot mordu est un
     * mot de la TABLE, le remède est le plat lui-même : remplacer ce composant
     * pour tout le monde, et jeter la casserole qui le portait.
     */
    readonly tableTerms?: readonly string[];
  } = {},
): string | null {
  const clean = (rows ?? []).filter((r) =>
    r && String(r.name ?? "").trim() && String(r.memberId ?? "").trim()
  );
  if (clean.length === 0) return null;

  const remedy: Record<UnfedCause, string> = {
    held_off_regime:
      "their declared line refuses what that dish carries -- write them a box " +
      "of their OWN on that dish: same base, that one component swapped for one " +
      "of the same role, in \"boxes\" with its own \"items\"",
    held_off_exclusion:
      "they asked to avoid something that dish carries -- write them a box of " +
      "their OWN on that dish: same base, that one component swapped for one of " +
      "the same role, in \"boxes\" with its own \"items\"",
    not_named:
      "nobody put them on a box of that meal -- name them on exactly one box of it",
    double:
      "they are named on two boxes of that meal -- name them on ONE box only",
    no_dish:
      "NO dish at all was planned for that meal -- write one for that day and " +
      "slot, with boxes naming everyone who eats then (them included), its " +
      "preparations, and their cooking session and shopping lines",
  };

  const fold = (v: string): string =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const tableTerms = (options.tableTerms ?? []).map(fold).filter((t) => t.length > 0);
  const tableAvoids = (matched: string | null): boolean => {
    if (!matched) return false;
    const m = fold(matched);
    return tableTerms.some((t) => m === t || m.includes(t) || t.includes(m));
  };
  const lines = clean.map((r) => {
    const where = `${r.day} ${r.slot}`;
    const dish = r.dish ? ` "${r.dish}"` : "";
    // ── ⟳ 2026-09-06 — LA CASE SANS BOÎTE (petit-déjeuner, goûter) ──────────
    // M06: dix retraits de la végane sur des « Œufs, pain complet et tomates »
    // sans boîtes; « écris-lui une boîte sur ce plat » ne convenait pas à un
    // repas que le modèle n'a jamais mis en boîtes. On lui dit les deux voies.
    if (
      (r.cause === "held_off_regime" || r.cause === "held_off_exclusion") &&
      r.via === null && r.dish
    ) {
      const refuses = r.cause === "held_off_regime"
        ? "their declared line refuses"
        : "they asked to avoid";
      return `- ${r.name} (${r.memberId}), ${where},${dish}: that meal has NO ` +
        `boxes and its dish carries what ${refuses}. Give them a dish of their ` +
        `OWN at that day and slot (\"for_member_id\": their id) that follows ` +
        `their line -- or put boxes on that dish, with theirs carrying a ` +
        `replacement of the same role. Change nothing else.`;
    }
    // ── ⟳ 2026-09-04 — LE LIEN FAUTIF EST NOMMÉ, PAS LA BOÎTE ──────────────
    // Sur 60 refus sur 89 mesurés, la boîte EXISTAIT et ses items étaient
    // propres: c'est l'item qui citait la préparation du poulet. Demander
    // « écris-lui une boîte » à un modèle qui l'a déjà écrite le fait tout
    // réécrire, et chaque réécriture régresse autrement (mesuré: sans boîte →
    // cite le poulet → sur la boîte commune, une régression par relance). On
    // lui dit le geste exact, et on lui interdit le reste. Vaut pour les DEUX
    // ceintures: un dégoût (raviolis aux champignons ET aux épinards dans une
    // seule fiche) produit exactement le même retrait — mesuré sur un 4e foyer.
    if (
      (r.cause === "held_off_regime" || r.cause === "held_off_exclusion") &&
      r.via === "preparation" && r.preparationId
    ) {
      const carries = r.matched ? ` (it carries ${JSON.stringify(r.matched)})` : "";
      return `- ${r.name} (${r.memberId}), ${where},${dish}: their box is already ` +
        `there and its items are fine -- but one of its items cites preparation ` +
        `${JSON.stringify(r.preparationId)}${carries}, which they do not eat. ` +
        `Give that swapped component a preparation of its OWN (or cite none), ` +
        `cooked apart from the original; keep their box and its items exactly ` +
        `as they are, and change nothing else on that dish.`;
    }
    // ⟳ 2026-09-06 (FD8) — LA BOÎTE EXISTE ET C'EST SON ITEM QUI EST ÉVITÉ. Nora,
    // végane qui n'aime pas le tofu : sa boîte de tofu existait sur douze plats,
    // retirée douze fois ; « écris-lui une boîte à elle » rendait… du tofu.
    // On nomme la boîte, l'item, et ce qui doit le remplacer : un composant du
    // même rôle qui passe AUSSI sa ligne déclarée.
    if (
      r.cause === "held_off_exclusion" && r.via === "items" && r.boxId &&
      r.matched && !tableAvoids(r.matched ?? null)
    ) {
      return `- ${r.name} (${r.memberId}), ${where},${dish}: their box ` +
        `${JSON.stringify(r.boxId)} is already there, but it carries ` +
        `${JSON.stringify(r.matched)}, which they asked to avoid. Keep that box and ` +
        `replace that one item with a component of the same role that they do eat ` +
        `and that follows their declared line (a legume or another plant protein ` +
        `where tofu is refused, for instance); its preparation cooked apart from ` +
        `the original. Change nothing else on that dish.`;
    }
    if (r.cause === "held_off_exclusion" && tableAvoids(r.matched ?? null)) {
      return `- ${r.name} (${r.memberId}), ${where},${dish}: this TABLE asked to avoid ` +
        `${JSON.stringify(r.matched)} -- nobody here eats it. Replace that component in the dish ` +
        `itself, for EVERY box of that meal, with one of the same role that nobody at this table ` +
        `avoids; drop the preparation that carried it if nothing else draws on it. Do NOT write ` +
        `anyone a box of their own for this.`;
    }
    return `- ${r.name} (${r.memberId}), ${where},${dish}: ${remedy[r.cause]}.`;
  });

  return [
    "⛔ SOME PEOPLE HAVE NO BOX AT A MEAL THEY EAT HERE. Rewrite ONLY these " +
    "dishes; leave every other dish exactly as it is, same titles, same days, " +
    "same slots:",
    ...lines,
    "Everyone eating a meal must be named on exactly one box of it. Do NOT drop " +
    "a dish, do NOT shorten the plan, and do NOT mention any of this in a " +
    "\"why\" -- what somebody eats is nobody's business but theirs.",
    ...(options.partial ? [UNFED_RETRY_PARTIAL_BLOCK] : []),
  ].join("\n");
}

/**
 * ⛔ LE DERNIER RECOURS D'UN DÉGOÛT: ON ANNULE LE GESTE DU MOTEUR.
 *
 * Le nom sur le couvercle est la DÉCLARATION DU MODÈLE; le retrait était le
 * geste de la ceinture. Quand la relance n'a pas su composer la boîte
 * d'échange, remettre le nom rend à la personne son repas — avec l'aliment
 * qu'elle n'aime pas, ce qui est dit dans la rationale et dans les issues.
 *
 * ⛔ UN GOÛT N'EST PAS UNE SÉCURITÉ, et c'est pourquoi ce recours ne vaut QUE
 * pour `held_off_exclusion`. Rendre son repas à quelqu'un en lui servant ce que
 * son régime lui interdit n'est pas un recours, c'est le défaut d'origine.
 * L'appelant ne passe donc jamais ici une bouche retirée par sa ligne.
 *
 * ⚠️ IL NE CRÉE AUCUNE BOÎTE. Composer un contenant demande de savoir ce qu'on
 * y met, et c'est une décision de composition — elle appartient au modèle.
 */
export interface RestoreOutcome {
  /** Remis sur la boîte même dont la ceinture l'avait retiré. */
  readonly restored: number;
  /**
   * ⟳ 2026-09-04 — REMIS SUR LA BOÎTE DE TABLE DU MÊME PLAT, parce que la
   * sienne n'existe plus. Mesuré en réel: Zoé (courgettes) avait SA boîte au
   * dîner — items propres — mais un item citait « Semoule aux courgettes »; la
   * ceinture l'a retirée, la boîte s'est vidée de son seul nom, et le parseur
   * l'a jetée. Le recours cherchait alors une boîte absente, rendait 0, et le
   * plan partait en refus `mouth_unfed` pour trois cases de DÉGOÛT — la cause
   * que le produit a décidé de ne jamais refuser. Quand la boîte enregistrée
   * manque, la bouche revient sur la boîte de TABLE du même plat, à la même
   * case: c'est le même recours (« sur la boîte commune, et on le dit »),
   * appliqué au cas où sa boîte à elle a disparu. Compté à part, parce que ce
   * n'est pas le même geste: l'un annule un retrait, l'autre remplace une boîte.
   */
  readonly fallback: number;
  /** Le sort de chaque ligne de `restores`, dans l'ordre — pour la phrase et l'archive. */
  readonly rows: readonly ("restored" | "fallback" | "none")[];
}

/**
 * ⟳ 2026-09-06 — CE QUE LE RECOURS N'A PLUS LE DROIT DE FAIRE.
 *
 * Mesuré (banc « un retour et les calories ») : Paul, qui n'aime pas le poulet,
 * REMIS sur trois boîtes à 300 g de poulet rôti (`restored_fallback: 3`) ; et
 * Nora, VÉGANE, qui n'aime pas le tofu, remise sur neuf boîtes de chili de
 * dinde et de poisson. Le recours remettait la bouche « sur la boîte qui porte
 * ce qu'elle évite » — sans regarder ce que la boîte porte, ni son régime.
 *
 * `canJoin(memberId, dish, box)` est la ceinture du recours : l'appelant y
 * met le test de sa ligne (exclusion) ET de son régime sur la boîte visée.
 * Une boîte que la bouche ne peut pas rejoindre laisse la ligne `none` : la
 * case reste MANQUANTE, comptée, dite — plutôt que nourrie sur le papier.
 * Sans `canJoin`, comportement d'avant (les tests de forme le gardent).
 */
export type RestoreCanJoin = (
  memberId: string,
  dish: {
    readonly day?: string | null;
    readonly slot?: string | null;
    readonly memberId?: string | null;
    readonly boxes: readonly { readonly id: string; memberIds: string[] }[];
  },
  box: { readonly id: string; memberIds: string[] },
) => boolean;

export function restoreHeldOff(
  dishes: readonly {
    readonly day?: string | null;
    readonly slot?: string | null;
    readonly memberId?: string | null;
    readonly boxes: readonly { readonly id: string; memberIds: string[] }[];
  }[],
  restores: readonly {
    readonly memberId: string;
    readonly boxId: string;
    readonly day?: string | null;
    readonly slot?: string | null;
  }[],
  canJoin: RestoreCanJoin = () => true,
): RestoreOutcome {
  let restored = 0;
  let fallback = 0;
  const rows: ("restored" | "fallback" | "none")[] = [];
  for (const restore of restores ?? []) {
    rows.push("none");
    const memberId = String(restore?.memberId ?? "").trim();
    const boxId = String(restore?.boxId ?? "").trim();
    if (!memberId || !boxId) continue;
    let found = false;
    for (const dish of dishes) {
      for (const box of dish.boxes) {
        if (box.id !== boxId) continue;
        found = true;
        if (box.memberIds.includes(memberId)) continue;
        // ⛔ LA BOÎTE DONT LA CEINTURE L'A RETIRÉE PORTE CE QU'ELLE ÉVITE — par
        // construction. Elle n'y revient que si l'appelant dit que c'est
        // tenable (jamais pour un régime ; pour un goût, seulement si la boîte
        // ne porte plus le terme, par exemple après une relance par parties).
        if (!canJoin(memberId, dish, box)) continue;
        box.memberIds.push(memberId);
        restored++;
        rows[rows.length - 1] = "restored";
      }
    }
    if (found) continue;
    // ── LA BOÎTE A ÉTÉ JETÉE: la boîte de TABLE du même plat, à la même case ──
    const day = String(restore?.day ?? "").trim();
    const slot = String(restore?.slot ?? "").trim();
    if (!day || !slot) continue;
    let target: { readonly id: string; memberIds: string[] } | null = null;
    for (const dish of dishes) {
      if (dish.memberId) continue; // un plat dédié à quelqu'un d'autre n'est pas sa table
      if (String(dish.day ?? "") !== day || String(dish.slot ?? "") !== slot) continue;
      for (const box of dish.boxes) {
        if (box.memberIds.includes(memberId)) { target = null; break; }
        // ⟳ 2026-09-06 — une boîte de table qui porte ce que la bouche évite,
        // ou ce que son régime interdit, n'est pas un recours: on la saute.
        if (!canJoin(memberId, dish, box)) continue;
        if (target === null || box.memberIds.length > target.memberIds.length) target = box;
      }
    }
    if (target === null) continue;
    target.memberIds.push(memberId);
    fallback++;
    rows[rows.length - 1] = "fallback";
  }
  return { restored, fallback, rows };
}

/**
 * ⟳ 2026-09-06 — LE RELOGEMENT : LA BOÎTE QUI CONVIENT EXISTE DÉJÀ SUR CE PLAT.
 *
 * Mesuré (FC2) : Nora, végane, nommée par le modèle sur la boîte « dinde » de
 * treize repas, retirée treize fois par la ceinture — alors que CHACUN de ces
 * plats portait une boîte de tofu, à un nom, qui passait sa ligne. Trois
 * relances n'ont rien rendu : « écris-lui une boîte à elle » à un modèle qui
 * l'a déjà écrite. Le moteur sait faire ce geste-là seul, sans le modèle :
 * déplacer le nom sur la boîte du même plat, à la même case, que sa ligne
 * accepte. Aucune boîte n'est créée — composer un contenant reste au modèle.
 *
 * ⛔ `canJoin` EST LA CEINTURE DU RELOGEMENT, et elle est par BOÎTE : la
 * surface d'une boîte (ses items, les casseroles qu'ils citent), pas le plat
 * entier — sinon la boîte de tofu sous un titre « Poulet rôti » serait
 * refusée avec le poulet. L'appelant la construit avec le même scan que la
 * ceinture du parseur. Une bouche n'est jamais posée sur une boîte que
 * `canJoin` refuse : fail-closed, la case reste manquante, comptée et dite.
 *
 * La boîte choisie est celle qui porte le plus de noms (la boîte de table
 * d'abord) ; à égalité, la première. Un plat dédié à quelqu'un d'autre n'est
 * pas sa table. Une bouche déjà nommée sur une boîte de la case n'est pas
 * touchée.
 */
export type RehomeCanJoin = (
  memberId: string,
  dish: {
    readonly day?: string | null;
    readonly slot?: string | null;
    readonly memberId?: string | null;
  },
  box: { readonly id: string; readonly memberIds: readonly string[] },
) => boolean;

export interface RehomeOutcome {
  /** Bouches posées sur une boîte qui convient. */
  readonly rehomed: number;
  /** Par ligne de `rows`, dans l'ordre : la boîte choisie, ou `null`. */
  readonly rows: readonly (string | null)[];
}

const REHOMEABLE: ReadonlySet<UnfedCause> = new Set<UnfedCause>([
  "held_off_regime",
  "held_off_exclusion",
  "not_named",
]);

export function rehomeHeldOff(
  dishes: readonly {
    readonly day?: string | null;
    readonly slot?: string | null;
    readonly memberId?: string | null;
    readonly boxes: readonly { readonly id: string; memberIds: string[] }[];
  }[],
  rows: readonly {
    readonly memberId: string;
    readonly day: string;
    readonly slot: string;
    readonly cause: UnfedCause;
  }[],
  canJoin: RehomeCanJoin,
): RehomeOutcome {
  let rehomed = 0;
  const out: (string | null)[] = [];
  for (const row of rows ?? []) {
    out.push(null);
    const memberId = String(row?.memberId ?? "").trim();
    const day = String(row?.day ?? "").trim();
    const slot = String(row?.slot ?? "").trim();
    if (!memberId || !day || !slot || !REHOMEABLE.has(row.cause)) continue;
    const table = dishes.filter((d) =>
      !d.memberId && String(d.day ?? "") === day && String(d.slot ?? "") === slot
    );
    if (table.some((d) => d.boxes.some((b) => b.memberIds.includes(memberId)))) continue;
    let target: { readonly id: string; memberIds: string[] } | null = null;
    for (const dish of table) {
      for (const box of dish.boxes) {
        if (!canJoin(memberId, dish, box)) continue;
        if (target === null || box.memberIds.length > target.memberIds.length) target = box;
      }
    }
    if (target === null) continue;
    target.memberIds.push(memberId);
    rehomed++;
    out[out.length - 1] = target.id;
  }
  return { rehomed, rows: out };
}
