/**
 * LE PORT D'ÉCRITURE **SERVEUR** DES DEUX MAGASINS DE MÉMOIRE STRUCTURÉE.
 * Lot 1F du chantier « mémoire structurée ». C'est ce que la phase 2 appelle.
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §3 (la forme écrite) et
 * §5 (la matrice des droits). Socle: `retained_item.ts`. Magasins:
 * `food_preference_promotion.ts` (durable) et `retained_next_plan.ts`
 * (provisoire). **Ce fichier n'en modifie aucun**: il les importe.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME — LES TROIS PRODUCTEURS NE POUVAIENT RIEN ÉCRIRE
 * ═══════════════════════════════════════════════════════════════════════════
 * Le lot 1D a livré `keel_write_retained_items`, et elle est légitime: c'est le
 * port de LA CARTE, appelée par le navigateur de la personne avec son jeton.
 * Son identité vient d'`auth.uid()`.
 *
 * ⚠️ **`auth.uid()` est `NULL` sous `service_role`** — cicatrice nommée du
 * dépôt: *toute RPC gatée dessus est morte côté serveur*, et l'échec est MUET
 * (un `update` qui ne touche aucune ligne rend `204`, pas une erreur). Or les
 * trois producteurs de la phase 2 tournent tous en `service_role`: le memorizer
 * (cron `trigger-memorizer-daily`), le classifieur de retour sur brouillon, et
 * l'extraction du questionnaire de fin de plan. Et l'autre port serveur,
 * `keel_write_food_preferences`, ne connaît ni `retained_items` ni
 * `retained_next_plan`.
 *
 * D'où ce module, et la migration `20260818250000` qui porte sa RPC.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ L'APPELANT NE PASSE QUE CE QU'IL PRODUIT — LA FUSION EST ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * `durable` et `nextPlan` sont **ce que ce producteur vient de produire**, pas
 * l'état voulu du magasin. Trois raisons, dans cet ordre:
 *
 *   1. **LA MATRICE SERAIT INAPPLICABLE AUTREMENT.** Si l'appelant passait la
 *      liste entière, elle contiendrait les lignes des AUTRES producteurs et
 *      celles tapées par la personne — et le port ne pourrait plus refuser
 *      « ce que ce producteur n'a pas le droit d'écrire » sans refuser aussi
 *      les lignes des voisins.
 *   2. **TROIS COPIES DE LA MÊME FUSION, SINON.** Chacun des trois lots de
 *      phase 2 relirait, fusionnerait et re-sérialiserait à sa façon; la
 *      première divergence ne se verrait qu'en base.
 *   3. **LE TÉMOIN DE CONCURRENCE NAÎT DE CETTE LECTURE.** Il est pris ici,
 *      à quelques millisecondes de l'écriture, et il voyage DANS LE PRÉDICAT
 *      de l'`update`.
 *
 * ── ⛔ ET LES LIGNES DÉJÀ STOCKÉES SONT RECOPIÉES **TELLES QUELLES** ────────
 * C'est le point le plus important de ce fichier, et il est contre-intuitif.
 * On ne repasse **pas** le magasin existant par `readRetainedItems` avant de le
 * réécrire, alors que ce serait la ligne la plus naturelle à écrire.
 *
 * Motif: `parseRetainedItem` applique `canProduce` **à la lecture** — une ligne
 * que son producteur n'avait pas le droit d'écrire ne remonte pas, même déjà en
 * base. Re-sérialiser « ce qu'on a su lire » **supprimerait définitivement**
 * toutes ces lignes, plus toute ligne écrite par une version future du format,
 * et le symptôme serait un magasin qui rétrécit tout seul, la nuit, sans un
 * mot. Cicatrice nommée: *« le lecteur sait déjà réparer » est une affirmation à
 * vérifier — il jetait*. **Un port d'écriture n'est pas un ramasse-miettes.**
 *
 * On concatène donc: `[…lignes stockées, verbatim…, …lignes neuves…]`.
 *
 * ── ⚠️ ET SI LE MAGASIN N'EST PAS UNE LISTE, ON N'ÉCRIT PAS ───────────────
 * Un jsonb corrompu (un objet, une chaîne) ne se remplace pas par une liste
 * neuve: ce serait effacer, sous couvert de réparer, quelque chose qu'on n'a
 * pas su lire. Le port rend `store_unreadable`, et ça se voit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES QUATRE REFUS, ET AUCUN N'EST SILENCIEUX
 * ═══════════════════════════════════════════════════════════════════════════
 * ① `foreignSource` — un item dont `source` n'est pas le `producer` déclaré.
 *    ⚠️ SANS CETTE LIGNE, LA MATRICE NE VAUT RIEN. `canProduce` lit le champ
 *    `source` de l'item; si le producteur pouvait étiqueter ses propres items
 *    comme il veut, le memorizer écrirait un `portion.adjust` en le marquant
 *    `questionnaire`, et la garde serait « une ceinture armée sur un coffre
 *    vide ». Une écriture, un producteur, et chaque item le dit.
 * ② `forbiddenKind` — `canProduce(producer, kind)` a mordu. ⚠️ Ce n'est PAS
 *    redondant avec le parseur: les items arrivent TYPÉS, donc sans passer par
 *    `parseRetainedItem`, et le type `RetainedItem` ne contraint pas `source`
 *    par `kind` (il ne le peut pas: c'est la matrice, pas la forme).
 * ③ `misfiled` — un `next_plan` rangé dans `durable`, un `durable` rangé dans
 *    le provisoire, ou une ancre qui n'est pas un lundi ISO. Les filtres sont
 *    ceux des magasins eux-mêmes (`partitionForDurableStore`,
 *    `partitionForNextPlanStore`): ce module n'en écrit pas un second.
 * ④ `alreadyStored` — un item dont l'identifiant `(kind, item)` est DÉJÀ dans
 *    le magasin. Voir le bloc de `withoutAlreadyStored`.
 *
 * ⚠️ TOUS SONT COMPTÉS ET RENDUS À L'APPELANT. « Champ déclaré par le modèle =
 * compteur obligatoire »: sans compteur, un lot désarmé ressemble trait pour
 * trait à un lot qui marche.
 *
 * ── CE MODULE N'ÉCHOUE JAMAIS VERS SON APPELANT ───────────────────────────
 * Il rend un `RetainedWriteOutcome`, jamais une exception. Posture de
 * `food_preference_promotion_io.ts` mot pour mot, et l'inverse de celle des
 * allergies (`safety_constraints.ts`, qui THROW): on parle ici de goûts et
 * d'envies. Personne ne perd son dîner parce qu'une préférence n'a pas atterri.
 * Mais **l'échec est DICIBLE**: `ok: false` porte toujours un `reason`, et
 * l'appelant peut le journaliser, le compter, ou le rendre.
 */

import {
  canProduce,
  type RetainedItem,
  type RetainedSource,
  RETAINED_SOURCES,
} from "./retained_item.ts";
import {
  partitionForDurableStore,
  RETAINED_ITEMS_KEY,
  withRetainedItems,
} from "./food_preference_promotion.ts";
import {
  NEXT_PLAN_ITEMS_KEY,
  type NextPlanEntry,
  partitionForNextPlanStore,
  withNextPlanEntries,
} from "./retained_next_plan.ts";

// ===========================================================================
// LE NOM DE LA RPC — épinglé à son littéral SQL par le test
// ===========================================================================

/**
 * ⚠️ ÉPINGLÉ À LA MIGRATION PAR `retained_items_io_test.ts`, qui balaie
 * `supabase/migrations/` et exige d'y trouver la fonction, les deux clés et les
 * cinq noms de paramètres.
 *
 * C'est la bretelle la plus chère de ce chantier, et elle a failli être payée
 * pour de bon: le lot 1B nommait sa clé `next_plan_items` pendant que 1D
 * écrivait déjà `retained_next_plan`. Les deux côtés étaient verts, et aucun
 * `next_plan` n'aurait jamais transité. Un nom de RPC qui diverge rend
 * `PGRST202` — c'est-à-dire « ça n'a rien fait », que rien d'autre n'attrape.
 */
export const RETAINED_ITEMS_WRITE_RPC = "keel_write_retained_items_for";

/** Le strict minimum de client Supabase dont ce module a besoin. */
export type MinimalClient = {
  from: (table: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<
    { data: unknown; error: { message: string } | null }
  >;
};

// ===========================================================================
// QUI A LE DROIT D'APPELER CE PORT
// ===========================================================================

/**
 * Les trois producteurs AUTOMATIQUES — les « trois prompts » du §5.
 *
 * ⛔ `written` EN EST EXCLU, ET C'EST STRUCTUREL. `canProduce("written", …)`
 * rend `true` pour les huit familles (c'est la contrepartie exacte des trois
 * interdits: la personne peut tout rendre durable depuis sa carte,
 * explicitement). Un producteur serveur qui pourrait se déclarer `written`
 * contournerait donc la matrice ENTIÈRE par un seul mot — et la ligne
 * ressortirait ensuite à l'écran étiquetée « tu l'as écrit », ce qui serait
 * faux. La personne a son port à elle: `keel_write_retained_items` (1D), gaté
 * par `auth.uid()`, appelé par son navigateur.
 *
 * Le refus vit aux DEUX étages: le type ci-dessous (à la compilation) et
 * `producerAllowed` (à l'exécution, pour une valeur venue d'une chaîne).
 */
export type ServerRetainedSource = Exclude<RetainedSource, "written">;

const SERVER_SOURCES: readonly string[] = RETAINED_SOURCES.filter(
  (source) => source !== "written",
);

function producerAllowed(value: unknown): value is ServerRetainedSource {
  return SERVER_SOURCES.includes(String(value ?? ""));
}

// ===========================================================================
// CE QUE LE PORT REND
// ===========================================================================

/** Ce qui n'est pas entré, motif par motif. Jamais un silence. */
export interface RetainedWriteRefusals {
  /** La somme des quatre motifs. */
  readonly total: number;
  /** L'item se déclare d'une autre `source` que le `producer` de l'appel. */
  readonly foreignSource: number;
  /** `canProduce(producer, kind)` a mordu. */
  readonly forbiddenKind: number;
  /** Rangé dans le mauvais magasin, ou ancre qui n'est pas un lundi ISO. */
  readonly misfiled: number;
  /** Son identifiant `(kind, item)` est déjà dans le magasin. */
  readonly alreadyStored: number;
}

/**
 * Pourquoi l'écriture n'a pas eu lieu — ou qu'elle a eu lieu (`written`).
 *
 * Liste FERMÉE et exportée: un appelant qui veut réagir à un motif précis
 * (journal, compteur, retour à l'écran) le compare à une valeur, pas à une
 * chaîne devinée. Les cinq derniers viennent de la base, tels quels.
 */
export const RETAINED_WRITE_REASONS = [
  "written",
  "bad_args",
  "producer_not_allowed",
  "nothing_to_write",
  "all_refused",
  "goals_unreadable",
  "store_unreadable",
  "rpc_failed",
  "no_user",
  "no_goal_row",
  "stale_snapshot",
  "bad_items",
  "bad_next_plan",
  "unknown",
] as const;
export type RetainedWriteReason = (typeof RETAINED_WRITE_REASONS)[number];

export interface RetainedWriteOutcome {
  /** `true` seulement si la base a confirmé l'écriture. */
  readonly ok: boolean;
  /** `"written"` quand `ok`. Toujours présent — un échec est DICIBLE. */
  readonly reason: RetainedWriteReason;
  /** Combien d'items neufs sont entrés dans le magasin DURABLE. */
  readonly durableWritten: number;
  /** Combien d'entrées neuves sont entrées dans le magasin PROVISOIRE. */
  readonly nextPlanWritten: number;
  /**
   * La taille des magasins APRÈS écriture — **comptée, jamais plafonnée**.
   *
   * ⚠️ IL N'Y A AUCUN PLAFOND, ET C'EST UN TROU CONNU, PAS UN OUBLI. Le
   * memorizer écrit chaque nuit; le magasin durable est lu par les générateurs
   * (lot 1C), donc il finit dans un prompt. Ce dépôt a la cicatrice du bloc de
   * doctrine sans plafond (10k jetons dès le premier ebook). Mais un plafond
   * qui jetterait la ligne la plus ancienne serait une perte de données EN
   * SILENCE, c'est-à-dire strictement pire. On compte donc, pour que le jour où
   * ça enfle se VOIE, et la décision de plafonner revient au produit.
   */
  readonly durableStored: number;
  readonly nextPlanStored: number;
  readonly refused: RetainedWriteRefusals;
}

// ===========================================================================
// LE PORT
// ===========================================================================

/**
 * ÉCRIT CE QU'UN PRODUCTEUR VIENT DE PRODUIRE, dans l'un des deux magasins ou
 * dans les deux, **en un seul énoncé SQL**.
 *
 * ⚠️ SIGNATURE FIGÉE — trois lots de phase 2 écrivent contre elle.
 *
 * @param admin un client `service_role`. Ce port n'est accordé qu'à lui.
 * @param userId LA PERSONNE dont on écrit la ligne. Passé explicitement, et
 *   utilisé dans un `.eq("user_id", …)` explicite à la lecture: ce module reçoit
 *   un client qui traverse RLS, et « RLS ne remplace pas un `.eq(user_id)` » est
 *   une cicatrice mesurée de ce dépôt (la ligne d'un élève rendue au coach).
 * @param producer QUI écrit, au sens de la matrice du §5. C'est ce que
 *   `canProduce` reçoit, et chaque item doit le porter dans son propre `source`.
 * @param source pour la TRACE seulement — le nom de la fonction appelante, tel
 *   qu'il apparaîtra dans le journal. Il ne décide rien.
 *   ⚠️ Deux champs et pas un: `producer` est un jeton de la liste fermée qui
 *   arme une garde, `source` est une chaîne libre qui n'arme rien. Les
 *   confondre ferait dépendre une règle de sécurité du nom d'une fonction.
 * @param durable les items DURABLES neufs. Rien à ajouter ⇒ ne pas passer le
 *   champ: la clé n'est alors pas touchée du tout.
 * @param nextPlan les entrées PROVISOIRES neuves, `{item, anchor}`, l'ancre
 *   étant le lundi ISO de la semaine VISÉE (jamais `item.at`).
 */
export async function persistRetainedItemsFor(args: {
  admin: MinimalClient;
  userId: string;
  producer: ServerRetainedSource;
  source: string;
  durable?: readonly RetainedItem[];
  nextPlan?: readonly NextPlanEntry[];
}): Promise<RetainedWriteOutcome> {
  const source = String(args?.source ?? "").trim() || "unknown_caller";
  const userId = String(args?.userId ?? "").trim();

  if (!userId || !args?.admin) {
    return refuse("bad_args", source, userId);
  }
  // ⛔ LE REFUS DE `written` EST À L'EXÉCUTION AUSSI. Le type le tient chez un
  // appelant qui compile contre ce fichier; il ne tient rien d'une valeur qui
  // vient d'une colonne, d'un JSON ou d'un `as`.
  if (!producerAllowed(args.producer)) {
    return refuse("producer_not_allowed", source, userId);
  }
  const producer = args.producer;

  // ── ÉTAGE 1 · LA MATRICE, ITEM PAR ITEM ─────────────────────────────────
  const durableIn = args.durable ?? [];
  const nextPlanIn = args.nextPlan ?? [];
  let foreignSource = 0;
  let forbiddenKind = 0;

  const allowedDurable: RetainedItem[] = [];
  for (const item of durableIn) {
    const verdict = matrixVerdict(item, producer);
    if (verdict === "foreign_source") foreignSource += 1;
    else if (verdict === "forbidden_kind") forbiddenKind += 1;
    else allowedDurable.push(item);
  }
  const allowedNextPlan: NextPlanEntry[] = [];
  for (const entry of nextPlanIn) {
    const verdict = matrixVerdict(entry?.item, producer);
    if (verdict === "foreign_source") foreignSource += 1;
    else if (verdict === "forbidden_kind") forbiddenKind += 1;
    else allowedNextPlan.push(entry);
  }

  // ── ÉTAGE 2 · LE BON MAGASIN, ET UNE ANCRE QUI EST UN LUNDI ─────────────
  // Les filtres appartiennent aux magasins. Ce module ne réécrit ni l'un ni
  // l'autre: un second filtre finit toujours par diverger du premier.
  const durableSplit = partitionForDurableStore(allowedDurable);
  const nextPlanSplit = partitionForNextPlanStore(allowedNextPlan);
  const misfiled = durableSplit.notDurable.length + nextPlanSplit.misfiled.length;

  const askedTotal = durableIn.length + nextPlanIn.length;
  if (askedTotal === 0) {
    return refuse("nothing_to_write", source, userId);
  }

  // ── ÉTAGE 3 · LA LIGNE VIVANTE, ET LE TÉMOIN DE CONCURRENCE ─────────────
  let constraints: Record<string, unknown> | null = null;
  try {
    const res = await args.admin
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", userId)
      .maybeSingle();
    if (res?.error) throw new Error(String(res.error.message ?? res.error));
    const row = (res?.data ?? null) as Record<string, unknown> | null;
    const pc = row?.practical_constraints;
    constraints = pc && typeof pc === "object" && !Array.isArray(pc)
      ? pc as Record<string, unknown>
      : null;
  } catch (error) {
    warn("goals_unreadable", {
      source,
      user_id: userId,
      error: messageOf(error),
    });
    return refuse("goals_unreadable", source, userId, {
      foreignSource,
      forbiddenKind,
      misfiled,
      alreadyStored: 0,
    });
  }

  const storedDurable = storedRowsOf(constraints, RETAINED_ITEMS_KEY);
  const storedNextPlan = storedRowsOf(constraints, NEXT_PLAN_ITEMS_KEY);
  // ⛔ ON N'ÉCRASE PAS CE QU'ON N'A PAS SU LIRE. Voir l'en-tête.
  if (
    (durableSplit.durable.length > 0 && storedDurable === null) ||
    (nextPlanSplit.provisional.length > 0 && storedNextPlan === null)
  ) {
    warn("store_unreadable", { source, user_id: userId });
    return refuse("store_unreadable", source, userId, {
      foreignSource,
      forbiddenKind,
      misfiled,
      alreadyStored: 0,
    });
  }

  // ── ÉTAGE 4 · CE QUI EST DÉJÀ LÀ N'Y RETOURNE PAS ───────────────────────
  const durableNew = withoutAlreadyStored(
    durableSplit.durable,
    storedDurable ?? [],
    (row) => row,
    (item) => item,
  );
  const nextPlanNew = withoutAlreadyStored(
    nextPlanSplit.provisional,
    storedNextPlan ?? [],
    (row) => (row as Record<string, unknown> | null)?.item,
    (entry) => entry.item,
  );
  const alreadyStored = (durableSplit.durable.length - durableNew.length) +
    (nextPlanSplit.provisional.length - nextPlanNew.length);

  const refused: RetainedWriteRefusals = {
    total: foreignSource + forbiddenKind + misfiled + alreadyStored,
    foreignSource,
    forbiddenKind,
    misfiled,
    alreadyStored,
  };

  // RIEN NE SURVIT ⇒ ON N'APPELLE PAS LA BASE, ET ON NE REND PAS `ok`.
  // Écrire la liste inchangée réussirait, et l'appelant lirait « écrit » sur
  // une écriture qui n'a rien ajouté.
  if (durableNew.length === 0 && nextPlanNew.length === 0) {
    warn("all_refused", { source, user_id: userId, asked: askedTotal, refused });
    return {
      ok: false,
      reason: "all_refused",
      durableWritten: 0,
      nextPlanWritten: 0,
      durableStored: (storedDurable ?? []).length,
      nextPlanStored: (storedNextPlan ?? []).length,
      refused,
    };
  }

  // ── ÉTAGE 5 · LA CHARGE — LES LIGNES STOCKÉES, PUIS LES NEUVES ──────────
  //
  // ⚠️ LES SÉRIALISEURS SONT CEUX DES MAGASINS. `withRetainedItems` et
  // `withNextPlanEntries` rendent la forme de stockage; on ne leur donne QUE
  // les items neufs (`{}` en base), et on préfixe les lignes déjà stockées
  // TELLES QUELLES. Leur passer le magasin entier aurait été plus court — et
  // aurait supprimé toute ligne que le socle refuse de relire.
  const touchesDurable = durableNew.length > 0;
  const touchesNextPlan = nextPlanNew.length > 0;
  const itemsPayload = touchesDurable
    ? [
      ...(storedDurable ?? []),
      ...(withRetainedItems({}, durableNew)[RETAINED_ITEMS_KEY] as unknown[]),
    ]
    : null;
  const nextPayload = touchesNextPlan
    ? [
      ...(storedNextPlan ?? []),
      ...(withNextPlanEntries({}, nextPlanNew)[NEXT_PLAN_ITEMS_KEY] as unknown[]),
    ]
    : null;

  // ⚠️ LE TÉMOIN EST LA VALEUR TELLE QU'ON L'A LUE, pas celle qu'on écrit.
  // Passer la valeur écrite ferait un prédicat toujours faux — donc un port qui
  // n'écrit plus jamais, et rien ne tomberait. Et `undefined` n'est pas `null`:
  // PostgREST retirerait la clé du corps, et le paramètre manquerait.
  const expected = touchesDurable ? (constraints?.[RETAINED_ITEMS_KEY] ?? null) : null;
  const expectedNext = touchesNextPlan
    ? (constraints?.[NEXT_PLAN_ITEMS_KEY] ?? null)
    : null;

  try {
    const { data, error } = await args.admin.rpc(RETAINED_ITEMS_WRITE_RPC, {
      p_user: userId,
      p_expected: expected,
      p_items: itemsPayload,
      p_expected_next: expectedNext,
      p_next: nextPayload,
    });
    if (error) throw new Error(error.message);
    const res = (data ?? {}) as { ok?: boolean; reason?: string };
    if (res.ok !== true) {
      // ── ON NE RÉESSAIE PAS ────────────────────────────────────────────────
      // Une course perdue (`stale_snapshot`) veut dire que quelqu'un a écrit
      // sur LA MÊME clé entre la lecture et l'écriture — le plus souvent la
      // personne elle-même, depuis sa carte. Réessayer, c'est décider que notre
      // copie gagne, et c'est exactement la décision qu'on refuse de prendre à
      // sa place. Ce qui est perdu ici revient: le souvenir est toujours en
      // base, et le producteur repassera.
      const reason = reasonOf(res.reason);
      warn("not_written", {
        source,
        user_id: userId,
        producer,
        reason,
        durable: durableNew.length,
        next_plan: nextPlanNew.length,
        refused,
      });
      return {
        ok: false,
        reason,
        durableWritten: 0,
        nextPlanWritten: 0,
        durableStored: (storedDurable ?? []).length,
        nextPlanStored: (storedNextPlan ?? []).length,
        refused,
      };
    }

    const outcome: RetainedWriteOutcome = {
      ok: true,
      reason: "written",
      durableWritten: durableNew.length,
      nextPlanWritten: nextPlanNew.length,
      durableStored: itemsPayload?.length ?? (storedDurable ?? []).length,
      nextPlanStored: nextPayload?.length ?? (storedNextPlan ?? []).length,
      refused,
    };
    // UNE SEULE LIGNE, ET ELLE PORTE LES DEUX NOMBRES QUI SE LISENT ENSEMBLE:
    // ce qui est entré, et ce qui a été refusé. `refused.total > 0` sur un
    // producteur en bonne santé est un défaut de code en amont, pas un incident
    // de base.
    (refused.total > 0 ? console.warn : console.info)(JSON.stringify({
      tag: "keel/retained_items_write",
      event: "written",
      source,
      user_id: userId,
      producer,
      durable_written: outcome.durableWritten,
      next_plan_written: outcome.nextPlanWritten,
      durable_stored: outcome.durableStored,
      next_plan_stored: outcome.nextPlanStored,
      refused_total: refused.total,
      refused_foreign_source: refused.foreignSource,
      refused_forbidden_kind: refused.forbiddenKind,
      refused_misfiled: refused.misfiled,
      refused_already_stored: refused.alreadyStored,
    }));
    return outcome;
  } catch (error) {
    warn("rpc_failed", {
      source,
      user_id: userId,
      producer,
      error: messageOf(error),
    });
    return {
      ok: false,
      reason: "rpc_failed",
      durableWritten: 0,
      nextPlanWritten: 0,
      durableStored: (storedDurable ?? []).length,
      nextPlanStored: (storedNextPlan ?? []).length,
      refused,
    };
  }
}

// ---------------------------------------------------------------------------
// LES PIÈCES
// ---------------------------------------------------------------------------

/**
 * LA MATRICE, APPLIQUÉE À UN ITEM. Les deux moitiés sont indissociables.
 *
 * L'ordre compte: on regarde d'abord si l'item se réclame du producteur qui
 * écrit, ENSUITE si ce producteur a le droit d'écrire cette famille. L'inverse
 * laisserait passer un `portion.adjust` étiqueté `questionnaire` posté par le
 * memorizer — c'est-à-dire la matrice contournée par une étiquette.
 */
function matrixVerdict(
  item: RetainedItem | null | undefined,
  producer: ServerRetainedSource,
): "ok" | "foreign_source" | "forbidden_kind" {
  if (!item || item.source !== producer) return "foreign_source";
  return canProduce(producer, item.kind) ? "ok" : "forbidden_kind";
}

/**
 * Les lignes STOCKÉES sous cette clé, telles quelles.
 *
 * `[]` quand la clé est absente ou nulle — l'état normal d'un magasin jamais
 * écrit. `null` quand elle porte autre chose qu'une liste: c'est un REFUS, pas
 * un `[]`. À `[]`, un jsonb corrompu serait indiscernable d'un jsonb vide, et
 * la première écriture l'effacerait en le « réparant ».
 */
function storedRowsOf(
  constraints: Record<string, unknown> | null,
  key: string,
): unknown[] | null {
  const raw = (constraints ?? {})[key];
  if (raw === undefined || raw === null) return [];
  return Array.isArray(raw) ? raw : null;
}

/**
 * RETIRE LES ITEMS DONT L'IDENTIFIANT EST DÉJÀ DANS LE MAGASIN.
 *
 * ── L'IDENTIFIANT EST `(kind, item)`, ET C'EST UNE JOINTURE, PAS UN MATCHER ─
 * `item` est l'id du `memory_items` d'origine. Deux lignes qui portent le même
 * souvenir et la même famille sont la même chose — c'est vrai par
 * IDENTIFIANT, pas par ressemblance. ⛔ Aucun rapprochement par le texte: ce
 * dépôt a la mesure (« laitue » ≠ « lait », 12 faux positifs sur 12).
 *
 * ── POURQUOI REFUSER, ET PAS REMPLACER ────────────────────────────────────
 * Remplacer la ligne stockée par la neuve serait plus « à jour ». C'est refusé:
 * la personne a pu éditer ce texte depuis sa carte, et **on ne réécrit jamais ce
 * que quelqu'un a renseigné** (règle C4 de ce dépôt, écrite au prix d'un
 * `updated_at` qui bougeait tout seul). Un producteur AJOUTE ce qui est neuf;
 * ÉDITER une ligne existante est un geste de la personne, et il a son port.
 *
 * ── CE QUE ÇA NE COUVRE PAS, ET POURQUOI C'EST BORNÉ ──────────────────────
 * Un item sans `item` (`""`) n'a pas d'identifiant: deux fois le même texte
 * depuis le questionnaire feraient deux lignes. C'est assumé et petit: le seul
 * producteur qui tourne SANS FIN est le memorizer (cron de minuit), et le socle
 * lui IMPOSE un uuid (`parseOriginItem`: `source === "conversation"` ⇒ uuid
 * obligatoire). Les deux autres tournent une fois par plan.
 *
 * ⚠️ ET UNE LIGNE ÉCRITE PAR LA PERSONNE NE PEUT STRUCTURELLEMENT PAS ÊTRE
 * TOUCHÉE ICI: `written` impose `item: ""`, donc elle n'a pas d'identifiant,
 * donc aucune collision ne la désigne. « `item` vide protège l'entrée » n'est
 * pas seulement une règle de la réconciliation: elle tient aussi ici.
 */
function withoutAlreadyStored<T>(
  incoming: readonly T[],
  storedRows: readonly unknown[],
  itemOfStoredRow: (row: unknown) => unknown,
  itemOfIncoming: (entry: T) => RetainedItem,
): T[] {
  const known = new Set<string>();
  for (const row of storedRows) {
    const id = identityOf(itemOfStoredRow(row));
    if (id) known.add(id);
  }
  const out: T[] = [];
  for (const entry of incoming) {
    const id = identityOf(itemOfIncoming(entry));
    if (id && known.has(id)) continue;
    // Un doublon DANS LE MÊME APPEL compte aussi: sinon le producteur qui
    // propose deux fois le même souvenir écrirait deux lignes que la passe
    // suivante refuserait toutes les deux, sans jamais les retirer.
    if (id) known.add(id);
    out.push(entry);
  }
  return out;
}

/**
 * `kind` + l'id du souvenir, ou `null` quand il n'y en a pas.
 *
 * Lu DÉFENSIVEMENT sur un objet nu: les lignes stockées ne sont pas reparsées
 * (elles doivent survivre même illisibles), donc on ne peut pas s'appuyer sur
 * un type. Le séparateur est `\u0000`, qu'aucun `kind` et aucun uuid ne
 * contient: `("food", "x:y")` et `("food:x", "y")` ne peuvent donc pas
 * produire la même clé.
 */
function identityOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = typeof row.kind === "string" ? row.kind.trim().toLowerCase() : "";
  const item = typeof row.item === "string" ? row.item.trim().toLowerCase() : "";
  if (!kind || !item) return null;
  return `${kind}\u0000${item}`;
}

/** Un motif rendu par la base, ramené à la liste fermée. Jamais deviné. */
function reasonOf(value: unknown): RetainedWriteReason {
  const slug = String(value ?? "").trim();
  return (RETAINED_WRITE_REASONS as readonly string[]).includes(slug)
    ? slug as RetainedWriteReason
    : "unknown";
}

function refuse(
  reason: RetainedWriteReason,
  source: string,
  userId: string,
  refused?: Omit<RetainedWriteRefusals, "total">,
): RetainedWriteOutcome {
  const detail: RetainedWriteRefusals = {
    total: refused
      ? refused.foreignSource + refused.forbiddenKind + refused.misfiled +
        refused.alreadyStored
      : 0,
    foreignSource: refused?.foreignSource ?? 0,
    forbiddenKind: refused?.forbiddenKind ?? 0,
    misfiled: refused?.misfiled ?? 0,
    alreadyStored: refused?.alreadyStored ?? 0,
  };
  warn("refused", { source, user_id: userId, reason, refused: detail });
  return {
    ok: false,
    reason,
    durableWritten: 0,
    nextPlanWritten: 0,
    durableStored: 0,
    nextPlanStored: 0,
    refused: detail,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(event: string, extra: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    tag: "keel/retained_items_write",
    event,
    ...extra,
  }));
}
