/**
 * LE RETOUR SUR LE BROUILLON — L'APPEL, ET L'ÉCRITURE VERS TROIS PORTES.
 * Lot 2B, moitié I/O; réécrit au lot A du chantier « trois destinations »
 * (2026-09-03).
 *
 * Le prompt et la relecture sont dans `draft_note_classify.ts` (module PUR).
 * Ce fichier-ci fait exactement trois choses, dans cet ordre: il appelle le
 * modèle de COMPOSITION, il relit, il passe par la porte serveur — UNE fois,
 * avec les trois listes. Il n'invente aucune règle: la matrice est dans
 * `retained_item.ts`, les magasins dans `retained_next_plan.ts` et `memo.ts`,
 * l'écriture dans `retained_items_io.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LE MODÈLE EST `keelGenerationModel()`, ET C'EST PROUVÉ PAR UN TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * `keelGenerationModel()` est appelé **une fois, hors de toute branche**, et
 * la valeur voyage dans `meta.model` ET dans le résultat rendu. Le test la lit
 * des deux côtés, y compris sur le chemin injecté. `forceInitialModel: true`
 * finit le travail; le même identifiant a été mesuré en timeout à 4 minutes
 * sur le prompt du foyer, d'où `httpTimeoutMs` court et NOMMÉ, un échec
 * `model_unavailable` compté, et la chaîne de repli ARMÉE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UNE SEULE ÉCRITURE POUR LES TROIS PORTES
 * ═══════════════════════════════════════════════════════════════════════════
 * Une note range en un passage une préférence (①, durable), une envie
 * (l'encart) et une note (③, mémo). « Les deux moitiés d'un reclassement ne se
 * séparent pas »: trois écritures laisseraient une fenêtre où la personne a sa
 * préférence sans sa note, ou l'inverse. `persistRetainedItemsFor` prend les
 * trois listes et les écrit en un énoncé SQL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE TEXTE QUI ENTRE ICI EST DÉJÀ GARDÉ — ET LE TYPE LE FORCE
 * ═══════════════════════════════════════════════════════════════════════════
 * L'argument est un `DraftNoteVerdict`, que SEUL `readDraftNote` produit. La
 * note part dans un SECOND appel modèle; lui passer le texte brut rouvrirait
 * le trou que `plan_draft_note.ts` ferme. On exige la PREUVE que la garde est
 * passée, on ne la refait pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE MODULE N'ÉCHOUE JAMAIS VERS SON APPELANT
 * ═══════════════════════════════════════════════════════════════════════════
 * Il rend un `DraftNoteClassifyResult`, jamais une exception: le plan est DÉJÀ
 * écrit quand on arrive ici. **Personne ne perd son dîner parce qu'une envie
 * n'a pas été rangée.** Mais l'échec est DICIBLE: `ok: false` porte toujours
 * un `reason`, et les nombres PAR PORTE sortent dans tous les cas.
 */

import {
  type DraftNoteClassification,
  type DraftNoteMember,
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  DRAFT_NOTE_PRODUCER,
  buildDraftNoteClassifyPrompt,
  draftNoteClassifyTrace,
  EMPTY_DRAFT_NOTE_CLASSIFICATION,
  readDraftNoteClassification,
} from "./draft_note_classify.ts";
import type { DraftNoteVerdict } from "./plan_draft_note.ts";
import { keelGenerationModel } from "./generation_model.ts";
import {
  type MinimalClient,
  persistRetainedItemsFor,
  type RetainedWriteOutcome,
} from "./retained_items_io.ts";
import { generateWithGemini } from "../gemini.ts";
// ⛔ LE SECOND CANAL — arbitrage du 2026-09-01. Une allergie dite sur un retour
// de plan EST une allergie: elle part dans une table qui a sa ceinture.
import { safetyOf } from "./draft_note_safety.ts";
import {
  persistSafetyDeclarations,
  type SafetyWriteOutcome,
} from "./draft_note_safety_io.ts";

// ===========================================================================
// LES DEUX CONSTANTES, ET AUCUNE N'EST DÉCORATIVE
// ===========================================================================

/**
 * LA TRACE LIBRE passée à la porte (`source`), à ne pas confondre avec le
 * `producer`: `producer` est le JETON de la liste fermée qui arme `canProduce`;
 * `source` est une chaîne libre qui n'arme rien et sert au journal.
 */
export const DRAFT_NOTE_CLASSIFY_SOURCE = "keel-draft-note-classify";

/**
 * LE PLAFOND DE TEMPS DE L'APPEL, ET IL EST COURT EXPRÈS. Cette classification
 * tourne **après** l'écriture du plan, **dans la même requête**, pendant que la
 * personne attend une réponse qui a déjà coûté 100 à 200 secondes.
 *
 * ⚠️ NON EXPORTÉ COMME BORNE DE TEST: le test épingle la constante à son
 * littéral, il ne s'en sert pas pour calculer ce qu'il attend.
 */
export const DRAFT_NOTE_CLASSIFY_TIMEOUT_MS = 25_000;

// ===========================================================================
// CE QUE CE MODULE REND
// ===========================================================================

/** Pourquoi ça n'a pas eu lieu — ou que ça a eu lieu (`written`). Liste FERMÉE. */
export const DRAFT_NOTE_CLASSIFY_REASONS = [
  /** Tout ce qui devait entrer est entré. */
  "written",
  /** Il n'y avait pas de note utilisable: `readDraftNote` avait déjà refusé. */
  "no_note",
  /** `userId`, `admin`, jour ou semaine visée manquants. */
  "bad_args",
  /** L'appel modèle n'a pas abouti — timeout, panne, quota. COMPTÉ. */
  "model_unavailable",
  /** Le modèle a répondu autre chose que les listes demandées. */
  "unreadable_payload",
  /** `today` n'est pas un jour propre. */
  "bad_day",
  /** La semaine visée n'est pas lisible. */
  "bad_anchor",
  /**
   * Aucune des trois portes n'a rien retenu. ⚠️ Ce n'est PAS une panne: c'est
   * LA réponse attendue sur « c'est trop long à cuisiner » (`skipped_degree`)
   * et sur « merci, c'est parfait » (`skipped_other`). Les nombres par porte
   * disent laquelle des histoires c'est.
   */
  "nothing_to_file",
  /** La porte a refusé. Le motif exact est dans `write.reason`. */
  "not_written",
] as const;
export type DraftNoteClassifyReason =
  (typeof DRAFT_NOTE_CLASSIFY_REASONS)[number];

export interface DraftNoteClassifyResult {
  readonly ok: boolean;
  readonly reason: DraftNoteClassifyReason;
  /** Les trois nombres AGRÉGÉS. Le détail par porte est dans `classification`. */
  readonly proposed: number;
  readonly kept: number;
  readonly refused: number;
  readonly classification: DraftNoteClassification;
  /** ⚠️ LE MODÈLE RÉELLEMENT DEMANDÉ. Rendu, pas seulement journalisé. */
  readonly model: string;
  /** ⛔ CE QUI A ÉTÉ ÉCRIT EN SÉCURITÉ — arbitrage du 2026-09-01. */
  readonly safety: SafetyWriteOutcome;
  /** Ce que la porte a fait. `null` quand on ne l'a pas appelée. */
  readonly write: RetainedWriteOutcome | null;
}

/**
 * LE RUNNER DU MODÈLE — la seule couture d'injection, et elle n'est pas une
 * garde: `meta.model` est calculé AVANT la branche et lui est passé tel quel.
 */
export type DraftNoteLlmRunner = (
  systemPrompt: string,
  userPrompt: string,
  meta: { model: string; requestId?: string; userId?: string },
) => Promise<unknown>;

// ===========================================================================
// LE POINT D'ENTRÉE — celui que les deux générateurs appellent
// ===========================================================================

/**
 * CLASSE LA NOTE DU BROUILLON, ET ÉCRIT CE QUI EN SORT — dans les trois portes.
 *
 * ⚠️ À APPELER **APRÈS** L'ÉCRITURE DU PLAN, et seulement sur un `intent` qui
 * écrit. Sur `intent: "draft"` il n'y a pas encore de plan.
 *
 * @param note LE VERDICT de `readDraftNote`, pas le texte brut.
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`.
 * @param targetWeek un jour de la SEMAINE VISÉE — le `starts_on` du plan.
 * @param members les bouches du foyer. **Requis**, `[]` pour un solo.
 * @param now l'INSTANT de l'écriture (ISO). Par défaut l'horloge de ce module
 *   — c'est de l'I/O, il en a une. Un test le passe pour le figer. C'est
 *   contre lui que `validated_at` se compare (règle de vie de l'encart).
 */
export async function classifyAndPersistDraftNote(args: {
  admin: MinimalClient;
  userId: string;
  note: DraftNoteVerdict;
  today: string;
  targetWeek: string;
  members: readonly DraftNoteMember[];
  contentLocale: string;
  requestId?: string;
  now?: string;
  /** ⚠️ Test seulement. Ne change PAS le modèle demandé — voir le type. */
  run?: DraftNoteLlmRunner;
}): Promise<DraftNoteClassifyResult> {
  // ⛔ APPELÉ HORS DE TOUTE BRANCHE, ET AVANT TOUT REFUS.
  const model = keelGenerationModel();

  const noSafety: SafetyWriteOutcome = {
    written: [],
    proposed: 0,
    refused: 0,
    failed: 0,
  };
  const empty = EMPTY_DRAFT_NOTE_CLASSIFICATION;
  const bail = (reason: DraftNoteClassifyReason): DraftNoteClassifyResult => {
    warn(reason, { user_id: String(args?.userId ?? ""), model });
    return {
      ok: false,
      reason,
      proposed: 0,
      kept: 0,
      refused: 0,
      classification: empty,
      model,
      write: null,
      safety: noSafety,
    };
  };

  const userId = String(args?.userId ?? "").trim();
  if (!userId || !args?.admin) return bail("bad_args");
  if (!Array.isArray(args.members)) return bail("bad_args");

  const usable = typeof args.note?.usable === "string"
    ? args.note.usable.trim()
    : "";
  if (usable === "") return bail("no_note");

  const systemPrompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  const userPrompt = buildDraftNoteClassifyPrompt({
    note: usable,
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
        source: DRAFT_NOTE_CLASSIFY_SOURCE,
        model,
        forceInitialModel: true,
        httpTimeoutMs: DRAFT_NOTE_CLASSIFY_TIMEOUT_MS,
        maxRetries: 1,
      });
  } catch (error) {
    warn("model_unavailable", {
      user_id: userId,
      model,
      error: messageOf(error),
    });
    return {
      ok: false,
      reason: "model_unavailable",
      proposed: 0,
      kept: 0,
      refused: 0,
      classification: empty,
      model,
      write: null,
      safety: noSafety,
    };
  }

  const outcome = readDraftNoteClassification({
    raw,
    today: args.today,
    targetWeek: args.targetWeek,
    members: args.members,
    note: usable,
    // L'INSTANT DE L'ÉCRITURE — l'horloge de ce module, ou celle du test.
    writtenAt: args.now ?? new Date().toISOString(),
  });
  const classification = outcome.classification;
  const trace = draftNoteClassifyTrace(classification);

  if (!outcome.ok) {
    warn(outcome.refusal ?? "unreadable_payload", {
      user_id: userId,
      model,
      ...trace,
    });
    return {
      ok: false,
      reason: outcome.refusal ?? "unreadable_payload",
      proposed: classification.proposed,
      kept: classification.kept,
      refused: classification.refused.total,
      classification,
      model,
      write: null,
      safety: noSafety,
    };
  }

  // ── LE SECOND CANAL, ET IL PASSE AVANT LES SORTIES ANTICIPÉES ──────────
  // Une note qui ne dit QUE « je suis allergique aux arachides » produit zéro
  // ligne dans les trois portes et une déclaration de sécurité: la placer
  // après `nothing_to_file` rendrait le canal muet sur son cas le plus
  // important. Les listes sont disjointes; un échec de l'une ne doit rien à
  // l'autre.
  const safety = await persistSafetyDeclarations({
    admin: args.admin,
    userId,
    raw: safetyOf(raw),
    memberIds: (args.members ?? []).map((m) => m.memberId),
    contentLocale: args.contentLocale,
    sourceMessageId: String(args.requestId ?? ""),
  });
  if (safety.proposed > 0 || safety.failed > 0) {
    (safety.failed === 0 ? console.info : console.warn)(JSON.stringify({
      tag: "keel/draft_note_safety",
      event: safety.failed === 0 ? "written" : "partial",
      user_id: userId,
      proposed: safety.proposed,
      written: safety.written.length,
      refused: safety.refused,
      failed: safety.failed,
      attributed: safety.written.filter((d) => d.memberId !== null).length,
      kinds: [...new Set(safety.written.map((d) => d.kind))].sort(),
    }));
  }

  if (
    classification.preferences.items.length === 0 &&
    classification.notes.lines.length === 0 &&
    classification.nextPlan.entries.length === 0
  ) {
    // ⚠️ CE N'EST PAS UNE PANNE, ET LES NOMBRES PAR PORTE LE DISENT.
    // `skipped_degree > 0` = le modèle a lu un degré et l'a DIT (phrases 1, 2,
    // 5 du banc). `proposed > 0, kept: 0` = les portes ont tout refusé, et
    // `*_refused_forbidden_kinds` dit si c'est l'échappatoire mesurée.
    log("nothing_to_file", { user_id: userId, model, ...trace });
    return {
      ok: false,
      reason: "nothing_to_file",
      proposed: classification.proposed,
      kept: classification.kept,
      refused: classification.refused.total,
      classification,
      model,
      write: null,
      safety,
    };
  }

  // ── LA PORTE, UNE FOIS, AVEC LES TROIS LISTES. ⛔ ON NE LA CONTOURNE PAS ─
  // ⛔ `producer: DRAFT_NOTE_PRODUCER`, ET JAMAIS `"written"`.
  const write = await persistRetainedItemsFor({
    admin: args.admin,
    userId,
    producer: DRAFT_NOTE_PRODUCER,
    source: DRAFT_NOTE_CLASSIFY_SOURCE,
    // ① — DURABLE. Depuis le lot A: « mon fils n'aime pas le poisson » n'est
    // pas pour une semaine.
    durable: classification.preferences.items,
    // L'ENCART — ce que la phrase date elle-même, et les envies.
    nextPlan: classification.nextPlan.entries,
    // ③ — « ce que Sophia sait », par personne, au jour nommé.
    memo: classification.notes.lines,
  });

  const result: DraftNoteClassifyResult = {
    ok: write.ok,
    reason: write.ok ? "written" : "not_written",
    proposed: classification.proposed,
    kept: classification.kept,
    refused: classification.refused.total,
    classification,
    model,
    write,
    safety,
  };
  // UNE SEULE LIGNE, ET ELLE PORTE LES NOMBRES PAR PORTE AVEC LE MODÈLE.
  (result.ok ? console.info : console.warn)(JSON.stringify({
    tag: "keel/draft_note_classify",
    event: result.reason,
    user_id: userId,
    model,
    ...trace,
    write_reason: write.reason,
    durable_written: write.durableWritten,
    durable_stored: write.durableStored,
    next_plan_written: write.nextPlanWritten,
    next_plan_stored: write.nextPlanStored,
    memo_written: write.memoWritten,
    memo_stored: write.memoStored,
    write_refused: write.refused.total,
    write_refused_memo_full: write.refused.memoFull,
    write_refused_memo_duplicate: write.refused.memoDuplicate,
    write_refused_already_stored: write.refused.alreadyStored,
  }));
  return result;
}

// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(event: string, extra: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    tag: "keel/draft_note_classify",
    event,
    ...extra,
  }));
}

function log(event: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({
    tag: "keel/draft_note_classify",
    event,
    ...extra,
  }));
}
