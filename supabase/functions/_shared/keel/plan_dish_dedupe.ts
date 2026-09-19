/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-19 — DEUX PLATS DU MÊME PROPRIÉTAIRE SUR UNE CASE : ON EN GARDE UN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
 * Run réel du 2026-09-19 sur le clone du foyer `fagenty` (42 cases, 38 plats à
 * soi) : `mon/snack_pm: T,T`, `fri/dinner: T,T,fabrice`, `wed/lunch:
 * T,fabrice,fabrice`. Deux plats de table sur une case, ou deux plats de la
 * même bouche — chaque bouche y est servie deux fois.
 *
 * ⛔ ET CE DOUBLON EMPOISONNAIT LA RÉPARATION DES TROUS. L'adresse d'une unité
 * de réparation est `jour|moment|propriétaire` (`patchDishPayloads`) : deux
 * plats du même propriétaire sur la même case rendent l'adresse ambiguë, et le
 * patch ENTIER était rejeté (`payload_dropped @ ambiguous_address`) — y compris
 * les plats valides rendus pour les cases VIDES. Mesuré : deux appels de
 * réparation payés, 244 s, trois tours aux compteurs strictement identiques.
 *
 * ── CE QUE CE MODULE FAIT ───────────────────────────────────────────────────
 * Pur, déterministe, sans modèle : sur une même case, pour un même propriétaire
 * (`null` = la table, sinon `memberId`), le PREMIER plat écrit est gardé, les
 * suivants sont retirés et NOMMÉS. « Fixer hors du modèle quand c'est
 * possible » — c'est exactement ce cas.
 *
 * ⚠️ POURQUOI « LE PREMIER », ET CE QUE ÇA NE TRANCHE PAS. `BÊTA 1A ②`
 * (`parseGeneratedMeal`) a déjà payé un choix dépendant de l'ordre : là-bas,
 * entre un plat NU et un plat MAL ADRESSÉ, le nu survit quel que soit l'ordre,
 * parce qu'il existe un critère fonctionnel. Ici, entre deux plats de table,
 * il n'y en a AUCUN que le moteur sache lire — deux recettes complètes, deux
 * titres, deux méthodes. L'ordre d'écriture est le seul départage, et il est
 * documenté comme tel. Les deux titres sortent dans `issues`, donc l'arbitrage
 * se relit.
 *
 * ⛔ CE QU'IL NE FAIT PAS : il ne RÉADRESSE pas le plat en trop à une bouche
 * qui attend son plat à elle. C'est un gain possible (`own_meal_dish_missing`
 * ×6 sur le même run), mais un plat écrit POUR la table porte des boîtes de
 * table, et le lui donner un `memberId` après coup est un pari sur le
 * dimensionnement. Un lot à part, mesuré.
 */

export interface DedupableDish {
  readonly day: string | null;
  readonly slot: string | null;
  readonly memberId: string | null;
  readonly title: string;
}

export interface DishDedupeDrop {
  /** L'index du plat retiré, dans la liste d'ENTRÉE. */
  readonly index: number;
  readonly day: string;
  readonly slot: string;
  readonly memberId: string | null;
  readonly title: string;
  /** Le titre du plat gardé sur cette case, pour que l'arbitrage se relise. */
  readonly keptTitle: string;
}

export interface DishDedupeResult<D> {
  readonly dishes: D[];
  readonly dropped: DishDedupeDrop[];
}

/**
 * Sur une même case, un seul plat par propriétaire : le premier écrit.
 *
 * ⚠️ UN PLAT SANS JOUR OU SANS MOMENT N'EST JAMAIS PLIÉ. Il vaut pour la
 * fenêtre entière (`windowSplit`) ou pour la journée, et deux plats de ce
 * genre ne sont pas « sur la même case » — c'est le parseur qui les situe.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function foldDuplicateDishes<D extends DedupableDish>(
  dishes: readonly D[],
): DishDedupeResult<D> {
  const seen = new Map<string, D>();
  const kept: D[] = [];
  const dropped: DishDedupeDrop[] = [];
  dishes.forEach((d, index) => {
    const day = String(d.day ?? "").trim();
    const slot = String(d.slot ?? "").trim();
    if (day === "" || slot === "") {
      kept.push(d);
      return;
    }
    const owner = d.memberId === null ? "" : String(d.memberId).trim();
    const key = `${day}|${slot}|${owner}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, d);
      kept.push(d);
      return;
    }
    dropped.push({
      index,
      day,
      slot,
      memberId: d.memberId,
      title: d.title,
      keptTitle: first.title,
    });
  });
  return { dishes: kept, dropped };
}

/** La ligne d'`issues` d'un plat plié — le même idiome que les rejets du parseur. */
export function dishDedupeIssue(drop: DishDedupeDrop): string {
  const who = drop.memberId === null ? "table" : `member ${drop.memberId}`;
  return `dishes[${drop.index}]: second ${who} dish on ${drop.day}/${drop.slot} ` +
    `("${drop.title}") -- folded, "${drop.keptTitle}" kept`;
}
