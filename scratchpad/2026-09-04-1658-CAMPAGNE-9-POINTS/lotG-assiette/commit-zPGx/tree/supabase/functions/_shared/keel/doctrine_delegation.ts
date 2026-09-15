/**
 * QUI SIGNE, ET DE QUELLE DOCTRINE — une seule définition, deux consommateurs.
 * ===========================================================================
 *
 * Un coach peut DÉLÉGUER sa doctrine à la maison (`coaches.doctrine_source`,
 * migration 20260806230000). Ses élèves sont alors suivis par la méthode de la
 * maison, et l'agent le DIT: il signe du nom de la maison, jamais du sien.
 *
 * ── POURQUOI CE MODULE EXISTE PLUTÔT QUE DEUX `if` ───────────────────────
 * « Le nom du coach de cet élève » est déjà lu à DEUX endroits, et les deux
 * servent la même promesse à l'élève:
 *
 *   `doctrine_loader.ts`        — le bloc de prompt, et la signature du verrou
 *                                 de sortie (`resolveDoctrineReplacement`).
 *   `keel-coach-broadcast-v1`   — le message de cohorte, signé en bas.
 *
 * Si la délégation n'était câblée que dans le premier, un coach qui délègue
 * aurait un agent signant « Sophia » en conversation et « Marc » sur sa
 * diffusion hebdomadaire — le même élève, deux identités, la même semaine. Ce
 * dépôt a déjà payé « la doctrine ne gouvernait qu'une lane sur trois ». La
 * résolution vit donc ici, une fois, et les deux appellent la même fonction.
 *
 * ── LA DÉCISION EST PURE, LA LECTURE NE L'EST PAS ────────────────────────
 * `decideDoctrineOwner` ne fait aucune I/O et porte tous les cas de bord;
 * `resolveDoctrineOwner` n'est que les deux lectures qui l'alimentent. Même
 * découpe que partout dans `_shared/keel/`.
 */

/** Liste fermée, reflet du CHECK `coaches_doctrine_source_check`. */
export const DOCTRINE_SOURCES = ["own", "house"] as const;
export type DoctrineSource = (typeof DOCTRINE_SOURCES)[number];

/**
 * Lire l'axe. Un jeton inconnu retombe sur `own`, et c'est la BONNE direction.
 *
 * `own` veut dire « ce coach sert sa doctrine et signe de son nom », qui est la
 * valeur de toute la base existante et le comportement d'avant ce lot. Un jeton
 * illisible relu comme `house` ferait basculer un coach dans la délégation sans
 * qu'il l'ait demandé — c'est-à-dire ferait signer ses messages d'un autre nom
 * que le sien, ce qui est la seule erreur vraiment coûteuse des deux.
 */
export function parseDoctrineSource(raw: unknown): DoctrineSource {
  return String(raw ?? "").trim() === "house" ? "house" : "own";
}

export interface DoctrineOwner {
  /**
   * Le coach dont on LIT la doctrine publiée.
   *
   * `null` = il n'y a rien à lire. Ce n'est pas une panne à masquer: c'est un
   * coach qui a demandé la doctrine de la maison alors qu'elle est
   * introuvable, et le repli correct est « aucune méthode », jamais « la
   * sienne » (voir `decideDoctrineOwner`).
   */
  doctrineCoachId: string | null;
  /** Le nom qui SIGNE. `null` = pas de signature, ce qui reste vrai. */
  displayName: string | null;
  /** La doctrine servie n'est pas celle du coach de l'élève. Tracé. */
  delegated: boolean;
}

export interface DoctrineOwnerInput {
  coachId: string;
  /** `coaches.coach_kind`. */
  coachKind: string;
  /** `coaches.doctrine_source`, brut. */
  doctrineSource: unknown;
  coachDisplayName: string | null;
  /** Le coach maison, s'il a pu être lu. */
  house: { id: string; displayName: string | null } | null;
}

/**
 * La décision. PURE.
 *
 * ── LE REPLI QUAND LA MAISON EST INTROUVABLE ────────────────────────────
 * On ne retombe PAS sur la doctrine du coach, et c'est le seul arbitrage
 * subtil de cette fonction. Un coach qui délègue a souvent une doctrine
 * publiée qui DORT (on ne la supprime pas: la bascule doit être réversible).
 * Retomber dessus servirait à ses élèves une méthode qu'il a explicitement
 * retirée, signée de son nom — c'est-à-dire exactement ce qu'il a demandé
 * qu'on ne fasse plus.
 *
 * Rendre `null` fait injecter le bloc « je réponds de mes propres
 * connaissances, jamais au nom du coach » (`NO_COACH_METHOD_BLOCK`). L'élève
 * perd la méthode de la maison le temps de l'incident; personne ne parle au nom
 * de personne. C'est la direction d'échec sûre.
 */
export function decideDoctrineOwner(input: DoctrineOwnerInput): DoctrineOwner {
  const own: DoctrineOwner = {
    doctrineCoachId: input.coachId,
    displayName: input.coachDisplayName,
    delegated: false,
  };

  // LA MAISON NE DÉLÈGUE PAS À ELLE-MÊME. La base l'interdit déjà
  // (`coaches_house_never_delegates_check`); on le redit ici parce qu'un
  // résolveur qui ferait confiance à la contrainte serait un résolveur qui
  // boucle le jour où quelqu'un la retire.
  if (String(input.coachKind ?? "").trim() === "house") return own;
  if (parseDoctrineSource(input.doctrineSource) === "own") return own;

  if (!input.house || !String(input.house.id ?? "").trim()) {
    return { doctrineCoachId: null, displayName: null, delegated: true };
  }
  return {
    doctrineCoachId: input.house.id,
    displayName: String(input.house.displayName ?? "").trim() || null,
    delegated: true,
  };
}

/**
 * Les deux lectures qui alimentent la décision.
 *
 * La seconde n'a lieu QUE si le coach délègue: un appel de plus par tour pour
 * tous les coachs, dont l'écrasante majorité ne délègue pas, se paierait sur
 * chaque message du produit.
 */
export async function resolveDoctrineOwner(
  db: unknown,
  coachId: string,
): Promise<DoctrineOwner> {
  const id = String(coachId ?? "").trim();
  if (!id) return { doctrineCoachId: null, displayName: null, delegated: false };
  // deno-lint-ignore no-explicit-any
  const client = db as any;

  let coachKind = "human";
  let doctrineSource: unknown = "own";
  let coachDisplayName: string | null = null;
  try {
    const { data, error } = await client
      .from("coaches")
      .select("display_name, coach_kind, doctrine_source")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? {}) as Record<string, unknown>;
    coachDisplayName = String(row.display_name ?? "").trim() || null;
    coachKind = String(row.coach_kind ?? "human").trim() || "human";
    doctrineSource = row.doctrine_source;
  } catch (error) {
    // Un nom illisible dégrade la formulation, pas la doctrine — c'est
    // l'arbitrage que ce module hérite du chargeur. On sert donc SA doctrine,
    // sans signature: la délégation, elle, n'est pas devinée.
    console.warn("[keel/doctrine] coach row unreadable", error);
    return { doctrineCoachId: id, displayName: null, delegated: false };
  }

  if (
    String(coachKind).trim() === "house" ||
    parseDoctrineSource(doctrineSource) === "own"
  ) {
    return decideDoctrineOwner({
      coachId: id,
      coachKind,
      doctrineSource,
      coachDisplayName,
      house: null,
    });
  }

  let house: { id: string; displayName: string | null } | null = null;
  try {
    const { data, error } = await client
      .from("coaches")
      .select("id, display_name")
      .eq("coach_kind", "house")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    const houseId = String(row?.id ?? "").trim();
    if (houseId) {
      house = { id: houseId, displayName: String(row?.display_name ?? "").trim() || null };
    }
  } catch (error) {
    console.error("[keel/doctrine] house coach unreadable for a delegating coach", error);
  }

  return decideDoctrineOwner({
    coachId: id,
    coachKind,
    doctrineSource,
    coachDisplayName,
    house,
  });
}
