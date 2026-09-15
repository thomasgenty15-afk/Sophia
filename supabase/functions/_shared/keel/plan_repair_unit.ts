/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'UNITÉ DE RÉPARATION — UNE ADRESSE QUI SURVIT À LA MUTATION DU PLAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL A ÉTÉ REPRODUIT AVEC LES FONCTIONS
 * DE PRODUCTION (revue du 2026-09-12, défauts ① et ②) :
 *
 *   ① `repairScopeOf` n'adressait une réparation que par `day/slot`. Un
 *      `protein_floor_short` porte une DATE et AUCUN créneau : il rendait
 *      `cells: []`, toutes les cases gelées, et un appel modèle partait avec
 *      un périmètre vide.
 *   ② `cellAddress(day, slot)` ne porte pas le PROPRIÉTAIRE du plat. Deux
 *      plats dédiés le même jour au même moment — un par bouche — avaient la
 *      MÊME adresse, et `candidateParCase` gardait le premier trouvé.
 *      Réparer l'assiette de l'un remplaçait la recette de l'autre.
 *
 * ⛔ ET UNE TROISIÈME CHOSE QUI N'EXISTAIT NULLE PART : une portion ATTENDUE
 * ET ABSENTE n'avait aucune adresse du tout. `meal.dishes` ne la contient pas,
 * donc aucune règle partant des plats ne pouvait la désigner ; la réparation
 * ne savait demander que de corriger ce qui existe déjà. Une unité RÉSERVÉE
 * (`dishIndex: null`) lui donne un nom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'EST UN `unit_id`, ET CE QU'IL N'EST PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * C'est un jeton COURT (`U1`, `U2`…) attribué dans un ORDRE DÉTERMINISTE
 * (date, rang du créneau, propriétaire, puis ordre d'arrivée). Trois
 * propriétés, et chacune répond à un mode d'échec mesuré dans ce dépôt :
 *
 *   · IL NE VIENT PAS DU TITRE. Un titre change au premier repas réparé, et
 *     ce dépôt a déjà payé les rapprochements par texte
 *     (`forbidden-matcher-explanation-word-order`, « jamais de matcher
 *     maison »).
 *   · IL NE VIENT PAS DE L'INDEX DU TABLEAU. La finalisation retire des
 *     casseroles et réordonne ; un index est faux au tour suivant.
 *   · IL EST RECONSTRUIT À CHAQUE TOUR, sur les mêmes clés. Tant que la
 *     date, le créneau et le propriétaire d'une unité ne bougent pas — et
 *     c'est très exactement l'IDENTITÉ qu'une réparation n'a pas le droit de
 *     changer — le même jeton désigne la même chose.
 *
 * ⚠️ AUCUNE COLONNE EN BASE. Ces identifiants vivent le temps d'une
 * génération : ils servent à parler au modèle et à appliquer son patch.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness. Ce module ne parle à personne.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FORME DU PLAN — STRUCTURELLE, JAMAIS UN IMPORT DE `GeneratedMeal`
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ MÊME DISCIPLINE QUE `plan_repair_context.ts`, ET POUR LA MÊME RAISON :
// `GeneratedMeal` traîne quarante champs, un parseur de 10 000 lignes et deux
// verrous. L'importer ici rendrait ce module intestable sans la moitié du
// moteur. `GeneratedMeal` satisfait ces types par construction — le
// compilateur l'épingle au site d'appel.

export interface RepairUnitBox {
  readonly id: string;
  readonly memberIds: readonly string[];
}

export interface RepairUnitDish {
  readonly day: string | null;
  readonly slot: string | null;
  readonly title: string;
  /** `for_member_id` — le plat dédié à une bouche. `null` = plat de la maison. */
  readonly memberId: string | null;
  readonly boxes: readonly RepairUnitBox[];
  readonly uses: readonly { readonly preparationId: string }[];
}

/**
 * UNE CASE ATTENDUE PAR LA DEMANDE — pas par le plan.
 *
 * ⛔ ELLE VIENT DE LA DEMANDE FIGÉE, JAMAIS DU PLAN. C'est ce qui permet de
 * nommer une portion manquante : si on la déduisait des plats rendus, une
 * portion absente n'existerait pas, ce qui est précisément le défaut.
 */
export interface RepairExpectedCell {
  readonly memberId: string;
  /** La date ISO (`2026-09-14`). */
  readonly date: string;
  /** Le jeton de jour du plan (`sat`) — la langue du modèle. */
  readonly dayToken: string;
  readonly slot: string;
}

/**
 * ⛔ L'ORDRE DES CRÉNEAUX, RECOPIÉ ET ÉPINGLÉ PAR UN TEST.
 *
 * `MEAL_SLOTS` vit dans `meal_generation.ts` (10 300 lignes, un parseur, deux
 * ceintures). L'importer ici pour six chaînes rendrait ce module impossible à
 * tester seul. `plan_repair_unit_test.ts` § ① compare les deux listes : une
 * divergence rougit, elle ne passe pas en silence.
 */
export const REPAIR_SLOT_ORDER: readonly string[] = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
  "snack",
];

function slotRank(slot: string): number {
  const i = REPAIR_SLOT_ORDER.indexOf(slot);
  // ⚠️ UN CRÉNEAU INCONNU PASSE APRÈS TOUS LES CONNUS, il ne disparaît pas et
  // il ne prend pas la place du petit-déjeuner. Un tri qui rend `-1` mettrait
  // l'inconnu en tête — et l'ordre est ce qui tient les identifiants stables.
  return i === -1 ? REPAIR_SLOT_ORDER.length : i;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② L'UNITÉ
// ═══════════════════════════════════════════════════════════════════════════

export interface RepairUnit {
  /** Le jeton qui part au modèle et revient dans son patch. `U1`, `U2`… */
  readonly unitId: string;
  /** La date ISO, quand on la connaît. `null` = la demande ne l'a pas donnée. */
  readonly date: string | null;
  /** Le jeton de jour du plan (`sat`). `""` = le plan n'en porte pas. */
  readonly dayToken: string;
  readonly slot: string;
  /** Le propriétaire déclaré (`for_member_id`). `null` = plat de la maison. */
  readonly ownerId: string | null;
  /** Les bouches servies. Vide = personne d'identifié (lane solo, bac anonyme). */
  readonly eaters: readonly string[];
  /**
   * L'index dans `plan.dishes`.
   * ⛔ `null` = UNITÉ RÉSERVÉE : la demande attend cette portion, le plan ne la
   * contient pas. C'est la seule unité qu'un patch a le droit de CRÉER.
   */
  readonly dishIndex: number | null;
  readonly title: string | null;
  readonly preparationIds: readonly string[];
  readonly boxIds: readonly string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 1 — L'ENTRÉE DE DERNIER RECOURS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ `true` = CETTE UNITÉ S'AJOUTE À UNE ASSIETTE DÉJÀ SERVIE. C'est le cas
   * mesuré au tir FAST2 (2026-09-08) : le dîner commun tire trois casseroles
   * partagées, deux adultes sont dans leurs bornes, il n'y a NI frais NI
   * casserole réécrivable — on ne peut plus rien faire au plat, et la personne
   * bloquée n'a qu'une sortie, un petit plat À ELLE au même moment.
   *
   * ⚠️ CE N'EST PAS UNE PORTION MANQUANTE. La personne EST servie ; ce qui
   * manque est un COMPLÉMENT. Les confondre ferait réparer « personne n'a rien
   * à ce repas » par un plat de plus, et inversement.
   */
  readonly isComplement: boolean;
}

export interface RepairUnitIndex {
  readonly units: readonly RepairUnit[];
  readonly byId: ReadonlyMap<string, RepairUnit>;
  /** Les unités que le plan porte réellement. */
  readonly present: readonly RepairUnit[];
  /** Les unités attendues et absentes. */
  readonly reserved: readonly RepairUnit[];
  /**
   * ⛔ LE TÉMOIN DE LA GRILLE. Zéro cases attendues veut dire « personne ne
   * m'a passé la demande » — et sans ce nombre, une passe sans grille rend
   * exactement la même chose qu'une passe complète : aucune unité réservée,
   * donc aucune portion manquante réparable. Le lot 1 exige que ça se voie.
   */
  readonly counts: {
    readonly expected_cells: number;
    readonly present: number;
    readonly reserved: number;
    /** Les entrées de dernier recours réclamées. */
    readonly complements: number;
    /** Des plats dont le jour ou le moment est illisible : sans adresse. */
    readonly unaddressed_dishes: number;
  };
}

/** Les bouches qu'un plat sert, dans l'ordre, sans doublon. */
function eatersOf(dish: RepairUnitDish): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const v = String(id ?? "").trim();
    if (v === "" || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  // ⚠️ LE PROPRIÉTAIRE D'ABORD : un plat dédié sert d'abord celui à qui il est
  // dédié, et cet ordre rend la table lisible dans les archives.
  if (dish.memberId !== null) push(dish.memberId);
  for (const b of dish.boxes ?? []) for (const m of b.memberIds ?? []) push(m);
  return out;
}

function prepsOf(dish: RepairUnitDish): string[] {
  return [
    ...new Set(
      (dish.uses ?? [])
        .map((u) => String(u?.preparationId ?? "").trim())
        .filter((x) => x !== ""),
    ),
  ].sort();
}

/**
 * LA TABLE DES UNITÉS D'UNE GÉNÉRATION.
 *
 * ⛔ DEUX SOURCES, ET ELLES NE SE REMPLACENT PAS. Les PLATS donnent les unités
 * présentes ; la GRILLE ATTENDUE donne, en plus, celles qui manquent. Passer
 * une grille vide est autorisé — le chemin d'adoption relit une ligne de base
 * et n'a pas de demande sous la main — et alors `reserved` vaut zéro, ce qui
 * se lit dans `counts`.
 *
 * ⚠️ LE JOUR D'UN PLAT EST UN JETON (`sat`), CELUI D'UNE CASE ATTENDUE EST UNE
 * DATE. L'appariement se fait sur le JETON quand le plat en porte un, et la
 * date de l'unité vient alors de la case attendue qui lui correspond. Un plan
 * d'un seul jour peut rendre `day: null` : il s'apparie au jeton unique de la
 * grille.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function buildRepairUnits(args: {
  readonly dishes: readonly RepairUnitDish[];
  /** La grille attendue. Vide = « on ne me l'a pas passée », et ça se compte. */
  readonly expected: readonly RepairExpectedCell[];
  /**
   * ⛔ LES COMPLÉMENTS RÉCLAMÉS — une unité réservée créée MÊME SI la personne
   * est déjà servie à ce moment. Voir `RepairUnit.isComplement` : c'est
   * l'entrée de dernier recours, et sans une unité à son nom elle n'a aucune
   * adresse qu'un patch puisse remplir.
   */
  readonly complements?: readonly RepairExpectedCell[];
}): RepairUnitIndex {
  // ── LA GRILLE, INDEXÉE PAR JETON DE JOUR ────────────────────────────────
  const parJeton = new Map<string, { date: string; dayToken: string }>();
  for (const c of args.expected) {
    const t = String(c.dayToken ?? "").trim();
    if (t === "" || parJeton.has(t)) continue;
    parJeton.set(t, { date: c.date, dayToken: t });
  }
  // ⚠️ UN SEUL JOUR DANS LA DEMANDE ⇒ un plat sans jeton s'y rattache. C'est
  // le cas nominal d'un plan d'une journée, où le modèle omet `day`.
  const jourUnique = parJeton.size === 1 ? [...parJeton.values()][0] : null;

  type Brouillon = Omit<RepairUnit, "unitId">;
  const brouillons: Brouillon[] = [];
  let sansAdresse = 0;

  args.dishes.forEach((dish, index) => {
    const token = String(dish.day ?? "").trim();
    const slot = String(dish.slot ?? "").trim();
    if (slot === "") {
      // ⛔ UN PLAT SANS MOMENT N'A PAS D'ADRESSE, ET ON LE DIT. Lui en inventer
      // une le ferait apparier avec une case qui n'est pas la sienne.
      sansAdresse++;
      return;
    }
    const jour = token !== ""
      ? parJeton.get(token) ?? { date: "", dayToken: token }
      : jourUnique ?? { date: "", dayToken: "" };
    if (token === "" && jourUnique === null) sansAdresse++;
    brouillons.push({
      date: jour.date === "" ? null : jour.date,
      dayToken: jour.dayToken,
      slot,
      ownerId: dish.memberId === null || String(dish.memberId).trim() === ""
        ? null
        : String(dish.memberId).trim(),
      eaters: eatersOf(dish),
      dishIndex: index,
      title: dish.title,
      preparationIds: prepsOf(dish),
      boxIds: (dish.boxes ?? []).map((b) => String(b?.id ?? "")).filter((x) =>
        x !== ""
      ),
      isComplement: false,
    });
  });

  // ── LES UNITÉS RÉSERVÉES : ATTENDUES, ET ABSENTES ───────────────────────
  //
  // ⛔ « ABSENTE » SE JUGE SUR LA BOUCHE, PAS SUR LA CASE. Une case peut
  // porter le plat de la maison et ne nourrir que trois personnes sur quatre :
  // la quatrième n'a pas de portion, et c'est un repas qui manque.
  const servi = new Set<string>();
  for (const b of brouillons) {
    for (const m of b.eaters) servi.add(`${b.dayToken}|${b.slot}|${m}`);
  }
  for (const c of args.expected) {
    const cle = `${c.dayToken}|${c.slot}|${c.memberId}`;
    if (servi.has(cle)) continue;
    brouillons.push({
      date: c.date,
      dayToken: c.dayToken,
      slot: c.slot,
      ownerId: c.memberId,
      eaters: [c.memberId],
      dishIndex: null,
      title: null,
      preparationIds: [],
      boxIds: [],
      isComplement: false,
    });
    // ⚠️ ET ON MARQUE : deux cases attendues identiques ne réservent qu'une
    // unité.
    servi.add(cle);
  }

  // ── LES COMPLÉMENTS : RÉSERVÉS MÊME QUAND LA PERSONNE EST SERVIE ────────
  const complements = new Set<string>();
  for (const c of args.complements ?? []) {
    const cle = `${c.dayToken}|${c.slot}|${c.memberId}`;
    if (complements.has(cle)) continue;
    complements.add(cle);
    brouillons.push({
      date: c.date,
      dayToken: c.dayToken,
      slot: c.slot,
      ownerId: c.memberId,
      eaters: [c.memberId],
      dishIndex: null,
      title: null,
      preparationIds: [],
      boxIds: [],
      isComplement: true,
    });
  }

  // ── L'ORDRE, ET C'EST LUI QUI REND LES JETONS STABLES ───────────────────
  const ordonnes = brouillons
    .map((b, i) => ({ b, i }))
    .sort((x, y) =>
      String(x.b.date ?? "").localeCompare(String(y.b.date ?? "")) ||
      String(x.b.dayToken).localeCompare(String(y.b.dayToken)) ||
      slotRank(x.b.slot) - slotRank(y.b.slot) ||
      String(x.b.slot).localeCompare(String(y.b.slot)) ||
      String(x.b.ownerId ?? "").localeCompare(String(y.b.ownerId ?? "")) ||
      // ⛔ UN COMPLÉMENT PASSE APRÈS L'UNITÉ QU'IL COMPLÈTE. Les deux partagent
      // date, créneau et propriétaire : sans ce départage, leur ordre — donc
      // leurs jetons — dépendrait de l'ordre d'arrivée des tableaux.
      (x.b.isComplement ? 1 : 0) - (y.b.isComplement ? 1 : 0) ||
      x.i - y.i
    )
    .map((x) => x.b);

  const units: RepairUnit[] = ordonnes.map((b, i) => ({
    ...b,
    unitId: `U${i + 1}`,
  }));
  return {
    units,
    byId: new Map(units.map((u) => [u.unitId, u])),
    present: units.filter((u) => u.dishIndex !== null),
    reserved: units.filter((u) => u.dishIndex === null),
    counts: {
      expected_cells: args.expected.length,
      present: units.filter((u) => u.dishIndex !== null).length,
      reserved: units.filter((u) => u.dishIndex === null).length,
      complements: units.filter((u) => u.isComplement).length,
      unaddressed_dishes: sansAdresse,
    },
  };
}

/** L'unité qui porte un plat donné, par son index dans `dishes`. */
export function unitOfDishIndex(
  index: RepairUnitIndex,
  dishIndex: number,
): RepairUnit | null {
  return index.units.find((u) => u.dishIndex === dishIndex) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 — LA TABLE DES SESSIONS, À CÔTÉ DE CELLE DES UNITÉS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI UNE TABLE, ET PAS UN INDEX DE TABLEAU. Même raison que pour les
// unités : l'adresse doit être STABLE pendant une tentative, attribuée par le
// SERVEUR, et jamais lue dans la réponse du modèle. Un index de tableau
// changerait de sens à la première session ajoutée ou retirée par une fusion,
// et un patch arrivé en retard s'appliquerait sur la mauvaise session.
//
// ⛔ ET UNE SESSION N'EST PAS UN REPAS. Elle n'a ni moment, ni propriétaire, ni
// bouche à elle : elle a un JOUR, des casseroles, et un déroulé. Lui inventer
// un `slot` pour qu'un périmètre la résolve serait l'attribution arbitraire que
// le plan interdit en toutes lettres.

export interface RepairSessionRow {
  readonly day: string | null;
  readonly preparationIds: readonly string[];
  readonly runThrough: string;
}

export interface RepairSession {
  /** `S1`, `S2`… — attribué par le serveur, jamais lu dans la réponse. */
  readonly sessionId: string;
  /** L'index dans `cooking_sessions` du plan. */
  readonly sessionIndex: number;
  readonly day: string | null;
  readonly preparationIds: readonly string[];
  readonly runThrough: string;
}

export interface RepairSessionIndex {
  readonly sessions: readonly RepairSession[];
  readonly byId: ReadonlyMap<string, RepairSession>;
  /** L'index dans `cooking_sessions` → son jeton. */
  readonly byIndex: ReadonlyMap<number, string>;
  readonly counts: {
    readonly sessions: number;
    /** ⛔ Les sessions SANS déroulé : rien à corriger, et ça se compte. */
    readonly without_run_through: number;
  };
}

/**
 * LES SESSIONS D'UN PLAN, ADRESSABLES.
 *
 * ⛔ L'ORDRE EST CELUI DU PLAN, ET IL EST LE CONTRAT. `cooking_sessions[0]` est
 * toujours `S1` : c'est la seule façon qu'une adresse annoncée dans un message
 * et une adresse relue dans un patch désignent la même chose.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function buildRepairSessions(args: {
  readonly sessions: readonly RepairSessionRow[];
}): RepairSessionIndex {
  const sessions: RepairSession[] = args.sessions.map((s, i) => ({
    sessionId: `S${i + 1}`,
    sessionIndex: i,
    day: s.day ?? null,
    preparationIds: [
      ...new Set(
        (s.preparationIds ?? [])
          .map((x) => String(x ?? "").trim())
          .filter((x) => x !== ""),
      ),
    ],
    runThrough: String(s.runThrough ?? ""),
  }));
  return {
    sessions,
    byId: new Map(sessions.map((s) => [s.sessionId, s])),
    byIndex: new Map(sessions.map((s) => [s.sessionIndex, s.sessionId])),
    counts: {
      sessions: sessions.length,
      without_run_through: sessions.filter((s) => s.runThrough.trim() === "")
        .length,
    },
  };
}
