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
        regime === null || !(d.regimeBites ?? []).includes(regime)
      );
      if (openSafe.length > 0) {
        row.fed++;
        fed++;
        continue;
      }
      const openBites = open.length > 0;

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
        else if (byTaste) cause = "held_off_exclusion";
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
  options: { readonly partial?: boolean } = {},
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

  const lines = clean.map((r) => {
    const where = `${r.day} ${r.slot}`;
    const dish = r.dish ? ` "${r.dish}"` : "";
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
