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
 * LES CINQ REFUS, ET AUCUN N'EST SILENCIEUX
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
 * ④ `alreadyStored` — un item DÉJÀ en base. L'identité est `(kind, item)`
 *   quand il porte un uuid, et `(kind, sujet, texte normalisé)` sinon
 *   (`contentIdentityOf`, 2026-09-01) — SAUF pour les familles-événements
 *   (`portion.adjust`), qui ne se dédoublonnent jamais: deux réponses
 *   identiques sur deux bilans doivent faire AVANCER l'indice. Un item dont
 *   l'identifiant est DÉJÀ dans
 *    le magasin. Voir le bloc de `withoutAlreadyStored`.
 * ⑤ `unquoted` — **lot M2** — l'item n'apporte pas la phrase de la personne qui
 *    l'a causé. ⛔ *« Sans la citation, "Défaire" est un pari »*: une ligne qui
 *    apparaît sur l'écran de quelqu'un sans dire d'où elle vient ne propose
 *    qu'un geste aveugle, et devant un choix aveugle on ne touche à rien — donc
 *    le magasin ne décroît jamais. C'est le mécanisme de la boule de neige.
 *    ⚠️ Il ne mord que sur les écritures NEUVES: les lignes déjà en base
 *    restent lisibles sans citation (`parseRetainedItem` accepte `null`).
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
  isRetiredRetainedSource,
  type RetainedItem,
  type RetainedSource,
  RETAINED_SOURCES,
  type RetiredRetainedSource,
} from "./retained_item.ts";
import {
  partitionForDurableStore,
  RETAINED_ITEMS_KEY,
  withRetainedItems,
} from "./food_preference_promotion.ts";
import {
  SAFETY_FALLBACK_TAG,
  safetyShapeOf,
} from "./safety_fallback_counter.ts";
import {
  NEXT_PLAN_ITEMS_KEY,
  type NextPlanEntry,
  partitionForNextPlanStore,
  withNextPlanEntries,
} from "./retained_next_plan.ts";
// LOT A (2026-09-03) — LE TROISIÈME MAGASIN: « ce que Sophia sait ». Même
// porte que les deux autres, parce qu'un retour sur brouillon range en UN
// passage une préférence, une envie et une note, et que « les deux moitiés
// d'un reclassement ne se séparent pas ».
import {
  MEMO_KEY,
  type MemoLine,
  memoLineToJson,
  withMemoLine,
} from "./memo.ts";

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
 * Les DEUX producteurs AUTOMATIQUES qui restent — le bilan de fin de plan et le
 * retour sur brouillon.
 *
 * ⛔ `conversation` EN EST SORTI AU LOT M1, ET C'EST LA MOITIÉ « ÉCRITURE » DU
 * RETRAIT. `canProduce` a déjà fermé les huit familles de la ligne ③; le
 * refermer ICI ferme la porte AVANT la matrice, avec son propre motif
 * (`producer_not_allowed`) et sa propre ligne de journal. Les deux étages sont
 * nécessaires: la matrice dit « cette famille, non », le port dit « cet
 * appelant, jamais » — et c'est le second qui fait rougir un rebranchement au
 * lieu de le laisser se compter en `forbiddenKind` comme une écriture ratée
 * parmi d'autres.
 *
 * ⚠️ LE TYPE PORTE LE RETRAIT, PAS SEULEMENT LA LISTE. `ServerRetainedSource`
 * exclut `conversation` à la COMPILATION: un appelant qui reviendrait ne
 * passerait pas `deno check`. Une liste seule laisserait le rebranchement
 * compiler et échouer en silence à l'exécution.
 *
 * ⛔ `written` EN EST EXCLU AUSSI, ET C'EST STRUCTUREL. `canProduce("written", …)`
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
export type ServerRetainedSource = Exclude<
  RetainedSource,
  "written" | RetiredRetainedSource
>;

const SERVER_SOURCES: readonly string[] = RETAINED_SOURCES.filter(
  (source) =>
    source !== "written" && !isRetiredRetainedSource(source),
);

function producerAllowed(value: unknown): value is ServerRetainedSource {
  return SERVER_SOURCES.includes(String(value ?? ""));
}

// ===========================================================================
// CE QUE LE PORT REND
// ===========================================================================

/** Ce qui n'est pas entré, motif par motif. Jamais un silence. */
export interface RetainedWriteRefusals {
  /** La somme des CINQ motifs. */
  readonly total: number;
  /** L'item se déclare d'une autre `source` que le `producer` de l'appel. */
  readonly foreignSource: number;
  /** `canProduce(producer, kind)` a mordu. */
  readonly forbiddenKind: number;
  /**
   * LOT M2 — l'item n'apporte pas la phrase qui l'a causé.
   *
   * ⚠️ UN `unquoted > 0` EST UN DÉFAUT DE CODE EN AMONT, pas un incident: un
   * producteur serveur connaît toujours ce que la personne a écrit ou cliqué,
   * puisque c'est de là qu'il tire l'item. Zéro n'est pas un objectif, c'est
   * l'état normal.
   */
  readonly unquoted: number;
  /** Rangé dans le mauvais magasin, ou ancre qui n'est pas un lundi ISO. */
  readonly misfiled: number;
  /** Son identifiant `(kind, item)` est déjà dans le magasin. */
  readonly alreadyStored: number;
  /**
   * LOT A — une note (③) que le mémo a refusée: la même phrase pour la même
   * personne y était déjà (`memoDuplicate`), ou cette personne a déjà ses
   * cinq lignes (`memoFull`). Les deux se lisent séparément: un `memoFull`
   * qui monte dit qu'une personne doit faire du tri; un `memoDuplicate` dit
   * qu'un producteur redit la même chose.
   */
  readonly memoDuplicate: number;
  readonly memoFull: number;
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
  "bad_memo",
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
  /** LOT A — les notes (③) entrées dans le mémo, et la taille du mémo après. */
  readonly memoWritten: number;
  readonly memoStored: number;
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
  /**
   * LOT A — les notes de ③ neuves. Rien à ajouter ⇒ ne pas passer le champ.
   * Chaque ligne passe par `withMemoLine` (plafond PAR PERSONNE, doublon par
   * sujet + texte): ce module ne réécrit aucune de ces règles.
   */
  memo?: readonly MemoLine[];
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
  let unquoted = 0;

  const allowedDurable: RetainedItem[] = [];
  for (const item of durableIn) {
    const verdict = matrixVerdict(item, producer);
    if (verdict === "foreign_source") foreignSource += 1;
    else if (verdict === "forbidden_kind") forbiddenKind += 1;
    else if (verdict === "unquoted") unquoted += 1;
    else allowedDurable.push(item);
  }
  const allowedNextPlan: NextPlanEntry[] = [];
  for (const entry of nextPlanIn) {
    const verdict = matrixVerdict(entry?.item, producer);
    if (verdict === "foreign_source") foreignSource += 1;
    else if (verdict === "forbidden_kind") forbiddenKind += 1;
    else if (verdict === "unquoted") unquoted += 1;
    else allowedNextPlan.push(entry);
  }
  // ── LOT A · LES NOTES: pas de `kind`, donc pas de matrice — mais le
  // producteur et la citation, si. Une note qui se déclarerait d'une autre
  // source contournerait le compteur du producteur; une note sans citation est
  // une phrase libre qui gouverne des assiettes sans cause (M2).
  const memoIn = args.memo ?? [];
  const allowedMemo: MemoLine[] = [];
  for (const line of memoIn) {
    if (!line || line.source !== producer) foreignSource += 1;
    else if (String(line.quote ?? "").trim() === "") unquoted += 1;
    else allowedMemo.push(line);
  }

  // ── ÉTAGE 2 · LE BON MAGASIN, ET UNE ANCRE QUI EST UN LUNDI ─────────────
  // Les filtres appartiennent aux magasins. Ce module ne réécrit ni l'un ni
  // l'autre: un second filtre finit toujours par diverger du premier.
  const durableSplit = partitionForDurableStore(allowedDurable);
  const nextPlanSplit = partitionForNextPlanStore(allowedNextPlan);
  const misfiled = durableSplit.notDurable.length + nextPlanSplit.misfiled.length;

  const askedTotal = durableIn.length + nextPlanIn.length + memoIn.length;
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
      unquoted,
      misfiled,
      alreadyStored: 0,
      memoDuplicate: 0,
      memoFull: 0,
    });
  }

  const storedDurable = storedRowsOf(constraints, RETAINED_ITEMS_KEY);
  const storedNextPlan = storedRowsOf(constraints, NEXT_PLAN_ITEMS_KEY);
  const storedMemo = storedRowsOf(constraints, MEMO_KEY);
  // ⛔ ON N'ÉCRASE PAS CE QU'ON N'A PAS SU LIRE. Voir l'en-tête.
  if (
    (durableSplit.durable.length > 0 && storedDurable === null) ||
    (nextPlanSplit.provisional.length > 0 && storedNextPlan === null) ||
    (allowedMemo.length > 0 && storedMemo === null)
  ) {
    warn("store_unreadable", { source, user_id: userId });
    return refuse("store_unreadable", source, userId, {
      foreignSource,
      forbiddenKind,
      unquoted,
      misfiled,
      alreadyStored: 0,
      memoDuplicate: 0,
      memoFull: 0,
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

  // ── LOT A · LE MÉMO, LIGNE À LIGNE, PAR LA RÈGLE DU MAGASIN ─────────────
  // `withMemoLine` tient le plafond PAR PERSONNE et le doublon (sujet + texte);
  // ce module accumule seulement, et compte ce qu'il refuse. Les lignes
  // stockées sont relues par le socle POUR DÉCIDER, puis recopiées VERBATIM
  // dans la charge (un port d'écriture n'est pas un ramasse-miettes): une
  // ligne illisible en base survit à l'écriture d'une voisine.
  let memoDuplicate = 0;
  let memoFull = 0;
  const memoNewJson: Record<string, unknown>[] = [];
  let memoView: Record<string, unknown> = { [MEMO_KEY]: storedMemo ?? [] };
  for (const line of allowedMemo) {
    const out = withMemoLine(memoView, memoLineToJson(line));
    if (out.refused === "duplicate") memoDuplicate += 1;
    else if (out.refused === "full") memoFull += 1;
    else if (out.refused === "unreadable") unquoted += 1;
    else {
      memoNewJson.push(memoLineToJson(out.lines[0]));
      memoView = { [MEMO_KEY]: out.lines.map(memoLineToJson) };
    }
  }

  const refused: RetainedWriteRefusals = {
    total: foreignSource + forbiddenKind + unquoted + misfiled + alreadyStored +
      memoDuplicate + memoFull,
    foreignSource,
    forbiddenKind,
    unquoted,
    misfiled,
    alreadyStored,
    memoDuplicate,
    memoFull,
  };

  // RIEN NE SURVIT ⇒ ON N'APPELLE PAS LA BASE, ET ON NE REND PAS `ok`.
  // Écrire la liste inchangée réussirait, et l'appelant lirait « écrit » sur
  // une écriture qui n'a rien ajouté.
  if (durableNew.length === 0 && nextPlanNew.length === 0 && memoNewJson.length === 0) {
    warn("all_refused", { source, user_id: userId, asked: askedTotal, refused });
    return {
      ok: false,
      reason: "all_refused",
      durableWritten: 0,
      nextPlanWritten: 0,
      durableStored: (storedDurable ?? []).length,
      nextPlanStored: (storedNextPlan ?? []).length,
      memoWritten: 0,
      memoStored: (storedMemo ?? []).length,
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
  // LOT A — les neuves DEVANT, les stockées VERBATIM derrière (l'ordre de
  // `withMemoLine`: la carte lit du plus récent au plus ancien).
  const touchesMemo = memoNewJson.length > 0;
  const memoPayload = touchesMemo ? [...memoNewJson, ...(storedMemo ?? [])] : null;
  const expectedMemo = touchesMemo ? (constraints?.[MEMO_KEY] ?? null) : null;

  try {
    const { data, error } = await args.admin.rpc(RETAINED_ITEMS_WRITE_RPC, {
      p_user: userId,
      p_expected: expected,
      p_items: itemsPayload,
      p_expected_next: expectedNext,
      p_next: nextPayload,
      p_expected_memo: expectedMemo,
      p_memo: memoPayload,
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
        memo: memoNewJson.length,
        refused,
      });
      return {
        ok: false,
        reason,
        durableWritten: 0,
        nextPlanWritten: 0,
        durableStored: (storedDurable ?? []).length,
        nextPlanStored: (storedNextPlan ?? []).length,
        memoWritten: 0,
        memoStored: (storedMemo ?? []).length,
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
      memoWritten: memoNewJson.length,
      memoStored: memoPayload?.length ?? (storedMemo ?? []).length,
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
      memo_written: outcome.memoWritten,
      memo_stored: outcome.memoStored,
      refused_total: refused.total,
      refused_foreign_source: refused.foreignSource,
      refused_forbidden_kind: refused.forbiddenKind,
      refused_unquoted: refused.unquoted,
      refused_misfiled: refused.misfiled,
      refused_already_stored: refused.alreadyStored,
      refused_memo_duplicate: refused.memoDuplicate,
      refused_memo_full: refused.memoFull,
    }));
    // ── LOT M7 · LE COMPTEUR DU REPLI DE SÉCURITÉ, CÔTÉ MAGASIN ─────────────
    //
    // ⛔ IL COMPTE, IL NE GARDE RIEN. La ligne est écrite APRÈS l'écriture, et
    // la retirer ne changerait rien à ce qui est en base. Ce module ne devient
    // pas une seconde autorité de sécurité — le produit en a exactement une, et
    // elle vérifie la SORTIE, ce qu'un compteur de texte ne saura jamais faire.
    //
    // ── POURQUOI ICI, ET PAS CHEZ LES DEUX PRODUCTEURS ─────────────────────
    // C'est la porte UNIQUE: `draft_note` et `questionnaire` passent tous les
    // deux par elle. Compter chez chacun ferait deux implémentations qui
    // divergeraient, et la divergence ne se verrait que sur le producteur le
    // moins observé. Une porte, un compteur.
    //
    // ⚠️ ET C'EST LE REPLI LE PLUS GRAVE DES DEUX. Dans la conversation, un
    // repli ne produit qu'une PHRASE. Ici, un allergène nommé par la personne
    // est ÉCRIT dans un champ de préférences — c'est-à-dire dans un magasin qui
    // alimente un prompt et que **rien ne vérifie en sortie**. La ligne existe,
    // elle a l'air de protéger, et elle ne protège pas.
    //
    // ⚠️ LE DÉNOMINATEUR EST `written`: la ligne part à chaque écriture réussie,
    // pas seulement quand ça mord. Sans lui, « 0 repli » ne se distingue pas de
    // « 0 écriture ».
    const safetyShapes = [...durableNew, ...nextPlanNew.map((e) => e.item)]
      .filter((item) => item.kind.startsWith("food."))
      .map((item) => safetyShapeOf(item.text));
    const safetyShaped = safetyShapes.flatMap((shape) => shape.slugs);
    console.info(JSON.stringify({
      tag: SAFETY_FALLBACK_TAG,
      event: "seen",
      source,
      user_id: userId,
      producer,
      surface: "retained_store",
      // ⚠️ AUCUN `text` DANS LA LIGNE. Un journal n'est pas l'endroit où
      // recopier ce qu'une personne a écrit sur sa santé; les slugs suffisent à
      // décider s'il faut agir, et ils ne désignent personne.
      shaped: safetyShaped.length > 0,
      slugs: [...new Set(safetyShaped)].sort(),
      // ⚠️ MÊME RAISON QUE DANS LA CONVERSATION: un zéro par ignorance ne doit
      // pas se lire comme un zéro mesuré.
      unreadable: safetyShapes.some((shape) => shape.unreadable),
      // ⛔ TOUJOURS `true` ICI, ET C'EST L'AVEU QUI REND LE NOMBRE LISIBLE.
      // Ces deux producteurs ne sont pas conversationnels: aucun outil de
      // sécurité ne peut être appelé sur un formulaire de bilan ou une note de
      // brouillon. Un allergène qui atterrit là N'A PAS de chemin de rattrapage
      // — il n'a pas « échoué à » appeler l'outil, l'outil n'existe pas sur ce
      // chemin. Le champ reste dans la ligne pour que les deux surfaces se
      // comptent avec la même clé.
      fell_back: safetyShaped.length > 0,
      filed_as_preference: safetyShaped.length > 0,
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
      memoWritten: 0,
      memoStored: (storedMemo ?? []).length,
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
): "ok" | "foreign_source" | "forbidden_kind" | "unquoted" {
  if (!item || item.source !== producer) return "foreign_source";
  if (!canProduce(producer, item.kind)) return "forbidden_kind";
  // ⛔ LOT M2 — SANS CITATION, « DÉFAIRE » EST UN PARI.
  //
  // Une ligne écrite par un producteur SERVEUR arrive sur l'écran de la
  // personne sans qu'elle l'ait demandée. Si elle ne dit pas d'où elle vient,
  // le seul geste qu'elle propose — « Enlever » — devient un choix aveugle:
  // peut-être une erreur du produit, peut-être une chose qu'elle a vraiment
  // demandée trois semaines plus tôt. Devant ce doute on ne touche à rien, et
  // le magasin ne décroît jamais. C'est le mécanisme exact de la boule de
  // neige que ce chantier existe pour arrêter.
  //
  // ⚠️ C'EST UN REFUS, PAS UN AVERTISSEMENT. Écrire quand même en journalisant
  // « attention, pas de citation » produirait précisément la ligne
  // indéfaisable, avec en prime la trace prouvant qu'on l'a vue passer.
  //
  // ⚠️ ET IL NE MORD QUE SUR LES ÉCRITURES NEUVES. Les lignes DÉJÀ en base
  // n'ont pas de citation et restent lisibles (`parseRetainedItem` accepte
  // `null`): le lot ferme l'avenir, il n'efface pas le passé.
  const quote = String(item.quote ?? "").trim();
  return quote ? "ok" : "unquoted";
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
 * depuis le questionnaire feraient deux lignes.
 *
 * ⚠️ AVEU DU LOT M1 — CETTE DÉDUPLICATION EST DEVENUE UNE CEINTURE SUR UN
 * COFFRE VIDE, ET IL VAUT MIEUX L'ÉCRIRE QUE DE LAISSER SES TESTS VERTS PASSER
 * POUR UNE COUVERTURE. Le raisonnement d'origine tenait par le memorizer: seul
 * producteur à tourner SANS FIN (cron de minuit), et le socle lui IMPOSAIT un
 * uuid, donc lui seul pouvait produire des collisions et lui seul en était
 * protégé. Ce producteur est retiré. Les deux qui restent (`questionnaire`,
 * `draft_note`) tournent une fois par plan ET écrivent `item: ""` — ils n'ont
 * donc aucun identifiant, et rien ne les dédoublonne.
 *
 * ⛔ ── CORRIGÉ LE 2026-09-01, ET LA RAISON D'ORIGINE ÉTAIT FAUSSE ──────────
 * « Faute d'un producteur qui en fabrique » ne tenait pas: « une fois par
 * plan » n'est pas « une fois par semaine ». Deux « refais-le » portant la même
 * phrase — le geste le plus courant du produit — écrivaient deux lignes
 * identiques, MESURÉ sur un tour réel (« Je n'aime pas le poulet », deux fois
 * en base, même kind, même sujet, même ancre).
 *
 * `contentIdentityOf` ferme ce cas, POUR CES DEUX PRODUCTEURS SEULEMENT. Le
 * mécanisme d'uuid reste, inchangé, pour le jour où l'un d'eux en portera un.
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
    // ⚠️ LES DEUX IDENTITÉS, pas l'une OU l'autre: une ligne déjà en base peut
    // porter un uuid pendant que la nouvelle n'en a pas, et inversement.
    const stored = itemOfStoredRow(row);
    for (const id of [identityOf(stored), contentIdentityOf(stored)]) {
      if (id) known.add(id);
    }
  }
  const out: T[] = [];
  for (const entry of incoming) {
    const item = itemOfIncoming(entry);
    const id = identityOf(item) ?? contentIdentityOf(item);
    if (id && known.has(id)) continue;
    // Un doublon DANS LE MÊME APPEL compte aussi: sinon le producteur qui
    // propose deux fois le même souvenir écrirait deux lignes que la passe
    // suivante refuserait toutes les deux, sans jamais les retirer.
    if (id) known.add(id);
    // ⚠️ ET L'AUTRE IDENTITÉ AUSSI, pour que la passe suivante la reconnaisse
    // quelle que soit celle qui aura servi.
    const other = identityOf(item) ? contentIdentityOf(item) : identityOf(item);
    if (other) known.add(other);
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
/**
 * L'IDENTITÉ DE CONTENU — le repli quand il n'y a pas d'uuid.
 *
 * ⛔ IL EXISTE PARCE QUE LE DOUBLON A ÉTÉ MESURÉ, le 2026-09-01. Le bloc
 * au-dessus expliquait qu'aucun dédoublonnage n'était nécessaire *« faute d'un
 * producteur qui en fabrique »*: `questionnaire` et `draft_note` « tournent une
 * fois par plan ». **Une fois par plan n'est pas une fois par semaine.** Deux
 * « refais-le » portant la même phrase — le geste le plus courant du produit,
 * `retained_next_plan.ts` le dit lui-même — écrivaient deux lignes identiques.
 *
 * ⚠️ LE COÛT EST DANS LE PROMPT, pas dans la carte. Le lot M4 refuse les
 * doublons du mémo pour cette raison exacte: *« le modèle lirait deux fois la
 * même consigne — ce qui, dans un prompt, la RENFORCE sans que personne ne
 * l'ait demandé »*. Deux `food.exclude` sur le poulet pèsent plus lourd qu'un,
 * et personne n'a demandé ce poids.
 *
 * ⛔ JAMAIS SUR `written`, ET C'EST LA MOITIÉ QUI COMPTE. Le bloc au-dessus
 * garantit qu'une ligne tapée PAR LA PERSONNE ne peut structurellement pas être
 * touchée ici: `written` impose `item: ""`, donc pas d'identifiant, donc aucune
 * collision ne la désigne. Une identité de contenu qui ignorerait le producteur
 * retirerait cette garantie en silence — quelqu'un qui réécrit sciemment la
 * même ligne sur sa carte a le droit de l'avoir.
 *
 * ⚠️ MÊME NORMALISATION QUE `withMemoLine` (casse + espaces), parce que c'est
 * la même question. Égalité, jamais ressemblance: « laitue » ≠ « lait ».
 */
/**
 * ⛔ LES FAMILLES QUI SONT UN ÉVÉNEMENT DE MESURE, ET QUI NE SE DÉDOUBLONNENT
 * DONC JAMAIS.
 *
 * Un `portion.adjust` n'est pas un fait qu'on répète, c'est une RÉPONSE datée.
 * Le lot M3 existe précisément pour que la deuxième fasse AVANCER l'indice:
 * *« elle redit "un peu trop" DU PLAN CORRIGÉ, et on lui redonne le même −5 %.
 * Elle n'avance jamais. »* Fondre deux réponses identiques rend l'indice
 * incapable de dépasser un cran — c'est-à-dire qu'il annule le lot.
 *
 * ⚠️ MESURÉ, ET C'ÉTAIT UNE RÉGRESSION DE CE FICHIER. Le 2026-09-01, le
 * dédoublonnage par contenu a été ajouté pour un vrai défaut (deux « refais-le »
 * de la même semaine écrivaient deux lignes). Il a emporté les réponses de
 * portion avec: deux bilans disant « un peu trop » ne laissaient qu'UNE ligne,
 * et l'indice restait à −1 au lieu de descendre à −2.
 */
const EVENT_KINDS = new Set(["portion.adjust"]);

function contentIdentityOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (String(row.source ?? "") === "written") return null;
  if (EVENT_KINDS.has(String(row.kind ?? ""))) return null;
  const kind = typeof row.kind === "string" ? row.kind.trim().toLowerCase() : "";
  const subject = String(row.subject ?? "").trim().toLowerCase();
  const text = String(row.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!kind || !text) return null;
  return `${kind}\u0000${subject}\u0000${text}`;
}

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
      ? refused.foreignSource + refused.forbiddenKind + refused.unquoted +
        refused.misfiled + refused.alreadyStored + refused.memoDuplicate +
        refused.memoFull
      : 0,
    foreignSource: refused?.foreignSource ?? 0,
    forbiddenKind: refused?.forbiddenKind ?? 0,
    unquoted: refused?.unquoted ?? 0,
    misfiled: refused?.misfiled ?? 0,
    alreadyStored: refused?.alreadyStored ?? 0,
    memoDuplicate: refused?.memoDuplicate ?? 0,
    memoFull: refused?.memoFull ?? 0,
  };
  warn("refused", { source, user_id: userId, reason, refused: detail });
  return {
    ok: false,
    reason,
    durableWritten: 0,
    nextPlanWritten: 0,
    durableStored: 0,
    nextPlanStored: 0,
    memoWritten: 0,
    memoStored: 0,
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
