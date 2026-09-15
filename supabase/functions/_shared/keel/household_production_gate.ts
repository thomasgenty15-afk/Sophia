/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-15 · LE GEL FERME LA PRODUCTION — AUSSI CELLE DES CRONS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE TROU CONNU N° 7 DE FF-049, ET IL ÉTAIT DATÉ. `keel_household_is_covered`
 * est la définition unique du gel ; `generate-household-meal-v1` la lit et
 * rend 402. Mais les deux crons de production — le bilan de la semaine
 * (`keel-weekly-flow-v1`) et les relances (`keel-reengage-v1`) — ne portaient
 * pas une occurrence de `household` : ils tournaient à l'identique sur un
 * foyer gelé, c'est-à-dire qu'ils PRODUISAIENT (un bilan rangé, une relance
 * envoyée) pour un foyer à qui le produit refuse de composer. Décision du
 * propriétaire le 2026-09-15 : le gel coupe toute la production.
 *
 * ⛔ CE QUE LE GEL NE COUPE TOUJOURS PAS : la lecture. Aucun lecteur de plan,
 * de courses ni de recette ne passe par ici (R12 de FF-049).
 *
 * ── LA POLARITÉ, ÉCRITE UNE FOIS ────────────────────────────────────────
 * `frozen` est calculé EN BASE (`keel_household_coverage_for_user`), jamais
 * ici : « gelé = dans un foyer ET non couvert » ne s'écrit qu'à un endroit.
 * Un compte hors foyer rend `{in_household:false, frozen:false}` — c'est la
 * majorité des comptes, et un gel par défaut couperait tout le produit.
 *
 * ⚠️ UNE LECTURE ILLISIBLE NE GÈLE PAS, ET ELLE SE COMPTE. Même arbitrage que
 * l'admission du générateur (`covered = data === false ? false : true`) : une
 * erreur de lecture de la couverture ne doit jamais couper le produit chez
 * quelqu'un qui paie. Seul un `frozen === true` explicite fait sauter le
 * compte ; tout le reste passe, et `unreadable` monte dans les compteurs du
 * cron pour que ça se voie.
 *
 * PURE: `readHouseholdCoverage` — no I/O, no clock, no randomness.
 */

/** La clé de saut, la même dans les deux crons — c'est un test de câblage qui le tient. */
export const HOUSEHOLD_FROZEN_SKIP = "household_frozen";
/** Le témoin d'une couverture illisible : compté, jamais gelé. */
export const HOUSEHOLD_COVERAGE_UNREADABLE = "household_coverage_unreadable";

export interface HouseholdProductionGate {
  /** `true` SEULEMENT quand la base a dit `frozen: true`. */
  readonly frozen: boolean;
  /** La réponse n'était pas lisible : on passe, et on le compte. */
  readonly unreadable: boolean;
  readonly inHousehold: boolean;
  readonly householdId: string | null;
}

const ILLISIBLE: HouseholdProductionGate = Object.freeze({
  frozen: false,
  unreadable: true,
  inHousehold: false,
  householdId: null,
});

/** Lit le jsonb de `keel_household_coverage_for_user`. Strict sur les booléens. */
export function readHouseholdCoverage(raw: unknown): HouseholdProductionGate {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return ILLISIBLE;
  const o = raw as Record<string, unknown>;
  if (typeof o.frozen !== "boolean") return ILLISIBLE;
  return {
    frozen: o.frozen === true,
    unreadable: false,
    inHousehold: o.in_household === true,
    householdId: typeof o.household_id === "string" ? o.household_id : null,
  };
}

/** Le strict nécessaire d'un client Supabase, pour rester testable sans base. */
export interface CoverageDb {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * La porte d'un cron pour UN compte : « ce compte est-il dans un foyer gelé ? »
 * Réservée au serveur (`service_role`) : la fonction SQL prend son sujet en
 * paramètre parce que `auth.uid()` est NULL sous service_role.
 */
export async function householdProductionGate(
  db: CoverageDb,
  userId: string,
): Promise<HouseholdProductionGate> {
  try {
    const res = await db.rpc("keel_household_coverage_for_user", { p_user: userId });
    if (res.error) return ILLISIBLE;
    return readHouseholdCoverage(res.data);
  } catch {
    return ILLISIBLE;
  }
}
