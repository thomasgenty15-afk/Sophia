/**
 * LE PRODUCTEUR « CONVERSATION », BRANCHÉ — lot 2C. L'APPEL MODÈLE et LA
 * PERSISTANCE. La règle, elle, vit dans `conversation_retained.ts`.
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §5 **ligne ③**.
 * Porte d'écriture: `retained_items_io.ts` (`persistRetainedItemsFor`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL FAIT, ET DANS QUEL ORDRE
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. il lit les lignes que la personne a **confirmées** (`keptMemoryLinesFrom`
 *     sur `practical_constraints`) — ⛔ rien n'entre sans un « Keep »;
 *  2. il joint chacune à son `memory_items` **par identifiant**, pour en
 *     prendre la `confidence` et le jour où elle l'a dit;
 *  3. il demande au modèle de les RANGER, jamais d'en inventer;
 *  4. il relit, applique la matrice, et écrit par la porte.
 *
 * ⚠️ IL NE TOUCHE PAS À `food_preferences`. Le magasin plat reste exactement ce
 * qu'il est, avec ses trois lecteurs vivants, sa réconciliation et son cycle de
 * vie. Le magasin structuré s'installe À CÔTÉ. C'est l'arbitrage du lot,
 * écrit au rapport: **le `RetainedItem` S'AJOUTE à la phrase plate, il ne la
 * remplace pas.**
 *
 * ── POURQUOI, EN UNE LIGNE QU'ON PEUT VÉRIFIER ────────────────────────────
 * `reconcileFoodPreferences` — la seule chose qui RETIRE une préférence quand
 * la personne se rétracte — ne connaît que `food_preferences` et son origine.
 * Retirer la phrase plate retirerait donc **la seule ligne qu'une rétractation
 * sait atteindre**, et le `RetainedItem` deviendrait immortel: le générateur
 * continuerait d'exclure le brocoli après que la personne a dit le contraire.
 * Option écartée: remplacer. Elle achète une carte sans doublon et paie une
 * mémoire qui ne sait plus oublier — le défaut exact que ce chantier ferme.
 *
 * ⚠️ CE MODULE N'ÉCHOUE JAMAIS VERS SON APPELANT. Il rend un résultat portant
 * un motif. Même posture que `food_preference_promotion_io.ts` et que la porte:
 * on parle de goûts, pas d'allergies. Personne ne perd son dîner parce qu'une
 * préférence n'a pas atterri — mais **l'échec est DICIBLE**.
 */

import {
  buildConversationClassifyPrompt,
  CONVERSATION_CLASSIFY_SYSTEM_PROMPT,
  CONVERSATION_PRODUCER,
  type ConversationClassification,
  type ConversationMember,
  conversationClassifyTrace,
  type KeptLineRef,
  type KeptMemoryLine,
  keptMemoryLinesFrom,
  readConversationClassification,
} from "./conversation_retained.ts";
import { keelGenerationModel } from "./generation_model.ts";
import {
  type MinimalClient,
  persistRetainedItemsFor,
  type RetainedWriteOutcome,
} from "./retained_items_io.ts";
import { generateWithGemini } from "../gemini.ts";

/**
 * LA TRACE LIBRE passée à la porte (`source`), à ne pas confondre avec le
 * `producer`.
 *
 * ⚠️ `producer` est le JETON de la liste fermée qui arme `canProduce`; `source`
 * est une chaîne libre qui n'arme rien et sert au journal. Les confondre ferait
 * dépendre une règle de sécurité du nom d'une fonction (contrat §8 point 1).
 */
export const CONVERSATION_CLASSIFY_SOURCE = "keel-conversation-classify";

/**
 * LE PLAFOND DE TEMPS DE L'APPEL.
 *
 * Plus large que celui du retour sur brouillon (25 s), et pour une raison
 * opposée: celui-là tourne **pendant qu'une personne attend**, celui-ci tourne
 * **au cron de minuit**, où personne n'attend rien. Ce qui coûte ici, c'est
 * qu'un lot entier de la nuit tombe, pas qu'une réponse tarde.
 *
 * ⚠️ ÉPINGLÉ À SON LITTÉRAL PAR LE TEST, jamais utilisé pour calculer ce que le
 * test attend: « un test paramétré par sa propre constante reste vert quand on
 * change la constante ».
 */
export const CONVERSATION_CLASSIFY_TIMEOUT_MS = 45_000;

/**
 * COMBIEN DE LIGNES CONFIRMÉES PARTENT DANS UN PROMPT.
 *
 * ⚠️ IL Y EN A UN, ET C'EST DÉLIBÉRÉ. Le magasin plat n'a pas de plafond
 * d'écriture: une personne active depuis un an peut y avoir des dizaines de
 * lignes, et ce dépôt porte la cicatrice du bloc de doctrine sans plafond
 * (10k jetons dès le premier ebook). On coupe par la QUEUE — donc on garde les
 * PREMIÈRES, c'est-à-dire les plus anciennement gardées, qui sont aussi celles
 * que les passages précédents n'ont pas encore su ranger. Ce qui est coupé
 * revient à la nuit suivante: la porte refuse ce qui est déjà rangé
 * (`alreadyStored`), donc chaque passage avance.
 */
export const CONVERSATION_CLASSIFY_MAX_LINES = 40;

export const CONVERSATION_CLASSIFY_REASONS = [
  "written",
  "not_written",
  "bad_args",
  "nothing_confirmed",
  "memory_unreadable",
  "no_usable_line",
  "model_unavailable",
  "unreadable_payload",
  "bad_anchor",
  "nothing_to_file",
] as const;
export type ConversationClassifyReason =
  (typeof CONVERSATION_CLASSIFY_REASONS)[number];

export interface ConversationClassifyResult {
  readonly ok: boolean;
  readonly reason: ConversationClassifyReason;
  /** ── LES TROIS NOMBRES, RENDUS DANS TOUS LES CAS ───────────────────────
   * Confirmées par la personne / retenues par la matrice / refusées. Sans eux,
   * un prompt que le modèle ignore et un produit calme se ressemblent trait
   * pour trait. */
  readonly confirmed: number;
  readonly kept: number;
  readonly refused: number;
  readonly classification: ConversationClassification;
  /** Le modèle DEMANDÉ, calculé hors de toute branche. Voir l'appel. */
  readonly model: string;
  readonly write: RetainedWriteOutcome | null;
}

/**
 * LE RUNNER DU MODÈLE — la seule couture d'injection, et elle n'est pas une
 * garde.
 *
 * ⚠️ Elle ne peut PAS servir à changer de modèle: `meta.model` est calculé
 * AVANT la branche et lui est passé tel quel. Un test qui injecte un runner
 * mesure donc le modèle que la production aurait demandé.
 */
export type ConversationLlmRunner = (
  systemPrompt: string,
  userPrompt: string,
  meta: { model: string; requestId?: string; userId?: string },
) => Promise<unknown>;

/** Ce que ce module lit d'un `memory_items`, et rien de plus. */
const MEMORY_COLUMNS = "id, confidence, created_at";

/**
 * JOINT LES REÇUS DE « KEEP » À LEURS SOUVENIRS. Pure, pour être testable.
 *
 * ⚠️ JOINTURE PAR IDENTIFIANT, jamais par le texte. Et une ligne dont le
 * souvenir est introuvable **tombe seule**: une purge RGPD, un export ou un
 * `limit` trop court sont des IGNORANCES, pas des rétractations — et ce module
 * ne fait qu'ajouter, donc ne rien ajouter est toujours sûr.
 *
 * ⚠️ AUCUN SEUIL ICI. `MIN_CONFIDENCE` a mordu en amont: une ligne ne porte une
 * origine `memory` que parce que `proposeFoodPreferences` l'a proposée. Un
 * second seuil divergerait du premier.
 */
export function joinKeptLinesToMemory(args: {
  refs: readonly KeptLineRef[];
  rows: readonly {
    id?: string | null;
    confidence?: number | null;
    created_at?: string | null;
  }[];
}): KeptMemoryLine[] {
  const byId = new Map<string, { confidence?: number | null }>();
  for (const row of args.rows ?? []) {
    const id = String(row?.id ?? "").trim().toLowerCase();
    if (id) byId.set(id, row);
  }
  const out: KeptMemoryLine[] = [];
  for (const ref of args.refs ?? []) {
    const row = byId.get(ref.memoryItemId.trim().toLowerCase());
    if (!row) continue;
    const confidence = Number(row.confidence ?? Number.NaN);
    // Une confiance illisible ne se remplace pas par une valeur: le socle
    // REFUSE une ligne de conversation sans confiance lisible, et inventer un
    // nombre ici serait fabriquer la mesure qu'il exige.
    if (!Number.isFinite(confidence)) continue;
    // `at` vient du reçu de « Keep » (le jour où elle l'a dit), jamais d'une
    // horloge. Sans lui on ne saurait pas écrire « je l'ai retenu de mardi »,
    // et le socle refuse un `at` illisible: la ligne tombe seule.
    if (!ref.at) continue;
    out.push({ ...ref, at: ref.at, confidence });
  }
  return out;
}

/**
 * CLASSE CE QUE LA PERSONNE A CONFIRMÉ, ET ÉCRIT CE QUI EN SORT.
 *
 * @param constraints le `practical_constraints` de la personne, DÉJÀ LU par
 *   l'appelant. Passé plutôt que relu ici: l'appelant du cron lit déjà la ligne
 *   pour d'autres raisons, et deux lectures de la même colonne divergent.
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`. Ce module ne lit
 *   aucune horloge.
 * @param targetWeek un jour de la SEMAINE VISÉE par les `craving`. ⚠️ CE N'EST
 *   PAS forcément `today`: quelqu'un qui dit le dimanche « des fajitas la
 *   semaine prochaine » vise la semaine SUIVANTE, et ancrer sur le jour du
 *   traitement ferait mourir son envie le lendemain matin.
 * @param members les bouches du foyer. **Requis**, `[]` pour un solo.
 */
export async function classifyAndPersistConversation(args: {
  admin: MinimalClient;
  userId: string;
  constraints: Record<string, unknown> | null | undefined;
  targetWeek: string;
  members: readonly ConversationMember[];
  contentLocale: string;
  requestId?: string;
  /** ⚠️ Test seulement. Ne change PAS le modèle demandé — voir le type. */
  run?: ConversationLlmRunner;
}): Promise<ConversationClassifyResult> {
  // ⛔ APPELÉ HORS DE TOUTE BRANCHE, ET AVANT TOUT REFUS. C'est ce qui rend le
  // modèle observable même sur un chemin qui n'appelle jamais le fournisseur —
  // et donc ce qui rend « a-t-il sauté `keelGenerationModel()` ? » mesurable au
  // lieu d'être affirmé (le générateur de foyer l'a déjà sauté en silence).
  const model = keelGenerationModel();

  const empty: ConversationClassification = {
    proposed: 0,
    kept: 0,
    refused: {
      total: 0,
      notKept: 0,
      unknownKind: 0,
      forbiddenKind: 0,
      unknownMember: 0,
      badText: 0,
      malformed: 0,
    },
    durable: [],
    nextPlan: [],
  };
  const bail = (
    reason: ConversationClassifyReason,
    confirmed = 0,
  ): ConversationClassifyResult => {
    warn(reason, { user_id: String(args?.userId ?? ""), model, confirmed });
    return {
      ok: false,
      reason,
      confirmed,
      kept: 0,
      refused: 0,
      classification: empty,
      model,
      write: null,
    };
  };

  const userId = String(args?.userId ?? "").trim();
  if (!userId || !args?.admin) return bail("bad_args");
  if (!Array.isArray(args.members)) return bail("bad_args");

  // ── ⛔ LA PORTE DU « KEEP » ─────────────────────────────────────────────
  // Rien n'entre sans confirmation, et une ligne écrite à la main (`item: ""`)
  // n'est jamais réclamée: elle appartient à la personne.
  const refs = keptMemoryLinesFrom(args.constraints).slice(
    0,
    CONVERSATION_CLASSIFY_MAX_LINES,
  );
  if (refs.length === 0) return bail("nothing_confirmed");

  // ── LA JOINTURE, PAR IDENTIFIANT ───────────────────────────────────────
  let rows: { id?: string | null; confidence?: number | null }[] = [];
  try {
    const res = await args.admin
      .from("memory_items")
      .select(MEMORY_COLUMNS)
      // ⚠️ `.eq("user_id", …)` EXPLICITE. Ce module reçoit un client qui
      // traverse RLS, et « RLS ne remplace pas un `.eq(user_id)` » est une
      // cicatrice mesurée de ce dépôt (la ligne d'un élève rendue au coach).
      .eq("user_id", userId)
      .in("id", refs.map((r) => r.memoryItemId));
    if (res?.error) throw new Error(String(res.error.message ?? res.error));
    rows = (res?.data ?? []) as typeof rows;
  } catch (error) {
    warn("memory_unreadable", { user_id: userId, model, error: messageOf(error) });
    return bail("memory_unreadable", refs.length);
  }

  const kept = joinKeptLinesToMemory({ refs, rows });
  if (kept.length === 0) return bail("no_usable_line", refs.length);

  const systemPrompt = CONVERSATION_CLASSIFY_SYSTEM_PROMPT;
  const userPrompt = buildConversationClassifyPrompt({
    kept,
    contentLocale: args.contentLocale,
    members: args.members,
  });

  // ── L'APPEL. UN ÉCHEC EST NOMMÉ ET COMPTÉ, JAMAIS AVALÉ ─────────────────
  let raw: unknown;
  try {
    raw = args.run
      ? await args.run(systemPrompt, userPrompt, {
        model,
        requestId: args.requestId,
        userId,
      })
      : await generateWithGemini(systemPrompt, userPrompt, 0, true, [], "auto", {
        requestId: args.requestId,
        userId,
        source: CONVERSATION_CLASSIFY_SOURCE,
        // ⛔ LE MODÈLE DE COMPOSITION, ET FORCÉ AU PREMIER ESSAI. Sans
        //    `forceInitialModel`, la politique de `gemini.ts` peut le
        //    remplacer et `meta.model` ne serait qu'un souhait.
        model,
        forceInitialModel: true,
        httpTimeoutMs: CONVERSATION_CLASSIFY_TIMEOUT_MS,
        maxRetries: 1,
      });
  } catch (error) {
    // ⛔ PAS DE `catch {}`. Le motif est nommé, journalisé, et rendu.
    warn("model_unavailable", { user_id: userId, model, error: messageOf(error) });
    return {
      ok: false,
      reason: "model_unavailable",
      confirmed: kept.length,
      kept: 0,
      refused: 0,
      classification: empty,
      model,
      write: null,
    };
  }

  const outcome = readConversationClassification({
    raw,
    kept,
    members: args.members,
    targetWeek: args.targetWeek,
  });
  const classification = outcome.classification;
  const trace = conversationClassifyTrace(classification);

  if (!outcome.ok) {
    warn(outcome.refusal ?? "unreadable_payload", {
      user_id: userId,
      model,
      confirmed: kept.length,
      ...trace,
    });
    return {
      ok: false,
      reason: outcome.refusal ?? "unreadable_payload",
      confirmed: kept.length,
      kept: classification.kept,
      refused: classification.refused.total,
      classification,
      model,
      write: null,
    };
  }

  if (classification.durable.length === 0 && classification.nextPlan.length === 0) {
    // ⚠️ CE N'EST PAS UNE PANNE, ET LES NOMBRES LE DISENT.
    // `proposed: 0` = le modèle n'a rien su ranger. `proposed > 0, kept: 0` =
    // la matrice a tout refusé, et `refused_forbidden_kind` dit si c'est
    // l'échappatoire mesurée (le sizing), `refused_not_kept` si le modèle
    // réclame des lignes que personne n'a gardées.
    log("nothing_to_file", { user_id: userId, model, confirmed: kept.length, ...trace });
    return {
      ok: false,
      reason: "nothing_to_file",
      confirmed: kept.length,
      kept: classification.kept,
      refused: classification.refused.total,
      classification,
      model,
      write: null,
    };
  }

  // ── LA PORTE. ⛔ ON NE LA CONTOURNE PAS ─────────────────────────────────
  // C'est elle qui fusionne, qui recopie les lignes stockées VERBATIM (un port
  // d'écriture n'est pas un ramasse-miettes) et qui tient le témoin de
  // concurrence. Écrire `practical_constraints` autrement effacerait ce que la
  // carte vient d'y poser.
  //
  // ⛔ `producer: CONVERSATION_PRODUCER`, ET JAMAIS `"written"`. `written` rend
  // `true` pour les huit familles: se déclarer ainsi contournerait la matrice
  // ENTIÈRE par un seul mot — à commencer par le `portion.adjust` que tout ce
  // lot existe pour renvoyer — et la carte afficherait « tu l'as écrit ».
  const write = await persistRetainedItemsFor({
    admin: args.admin,
    userId,
    producer: CONVERSATION_PRODUCER,
    source: CONVERSATION_CLASSIFY_SOURCE,
    durable: classification.durable,
    nextPlan: classification.nextPlan,
  });

  const result: ConversationClassifyResult = {
    ok: write.ok,
    reason: write.ok ? "written" : "not_written",
    confirmed: kept.length,
    kept: classification.kept,
    refused: classification.refused.total,
    classification,
    model,
    write,
  };
  // UNE SEULE LIGNE, ET ELLE PORTE LES NOMBRES QUI SE LISENT ENSEMBLE.
  (result.ok ? console.info : console.warn)(JSON.stringify({
    tag: "keel/conversation_classify",
    event: result.reason,
    user_id: userId,
    model,
    confirmed: kept.length,
    ...trace,
    write_reason: write.reason,
    durable_written: write.durableWritten,
    next_plan_written: write.nextPlanWritten,
    write_refused: write.refused.total,
  }));
  return result;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(event: string, extra: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    tag: "keel/conversation_classify",
    event,
    ...extra,
  }));
}

function log(event: string, extra: Record<string, unknown>): void {
  console.info(JSON.stringify({
    tag: "keel/conversation_classify",
    event,
    ...extra,
  }));
}
