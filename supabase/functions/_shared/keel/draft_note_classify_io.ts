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
  type RejectedDishContext,
  draftNoteClassifyTrace,
  EMPTY_DRAFT_NOTE_CLASSIFICATION,
  readDraftNoteClassification,
  type PortionMove,
  type PortionQuestion,
  type SettingMove,
  type SideCourseMove,
  type SlotSizeMove,
  type DraftNoteClarifyEntry,
  type DraftNoteGate,
  type DraftNoteSwap,
} from "./draft_note_classify.ts";
import type { DraftNoteVerdict } from "./plan_draft_note.ts";
import type { CellEdit } from "./cell_edit.ts";
import { keelGenerationModel } from "./generation_model.ts";
import { SIDE_COURSE_SLOTS, type SideCourseKind } from "./side_courses_types.ts";
import {
  type MinimalClient,
  persistRetainedItemsFor,
  type RetainedWriteOutcome,
} from "./retained_items_io.ts";
import { generateWithGemini } from "../gemini.ts";
import {
  type MemoryClarificationAskReason,
  notifyMemoryWrite,
} from "./memory_clarification_io.ts";
import {
  type RecapKept,
  settingRecapLine,
  type RecapSafety,
} from "./memory_recap.ts";
// ⟳ 2026-09-08 — LA PORTE DU BILAN, POUR LES RÉGLAGES. `retainedItemsFromPlanFeedback`
// tient l'échelle de chaque champ, le cadran unique du style, les bords et le
// conflit des deux axes: une phrase passe par LÀ, jamais par une arithmétique
// écrite ici, qui divergerait au premier barreau déplacé.
import {
  type PlanFeedbackRow,
  retainedItemsFromPlanFeedback,
} from "./plan_feedback_retained.ts";
import { persistFieldChangesFor } from "./field_change_io.ts";
import {
  type FieldChange,
  fieldChangesFrom,
  withFieldChanges,
} from "./field_change.ts";
import {
  memberSubject,
  type RetainedItem,
  type ExclusionForce,
  type RetainedKind,
  type RhythmOccasion,
} from "./retained_item.ts";
// ⟳ 2026-09-22 · LOT A — la clé d'un souvenir, posée après le modèle et
// jamais par lui. Voir l'en-tête de `retained_resolve.ts`.
import { resolveRetainedRefs } from "./retained_resolve.ts";
import { draftNoteSafetyLine, draftNoteSafetyObject } from "./draft_note_safety.ts";
import { persistDraftNoteSafety } from "./draft_note_safety_io.ts";
import type { MemoWhen } from "./memo.ts";
import type { CompositionIndex } from "./food_composition.ts";
// ⛔ LE SECOND CANAL — arbitrage du 2026-09-01. Une allergie dite sur un retour
// de plan EST une allergie: elle part dans une table qui a sa ceinture.
import {
} from "./draft_note_classify.ts";

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
  /**
   * Rien n'a été rangé, mais une QUESTION est partie — l'ambiguïté attend une
   * réponse. ⚠️ À distinguer de `nothing_to_file`: là, le produit a renoncé;
   * ici, il a demandé. Les confondre ferait lire un silence là où il y a une
   * conversation en cours.
   */
  "clarification_asked",
  /** La porte a refusé. Le motif exact est dans `write.reason`. */
  "not_written",
] as const;
export type DraftNoteClassifyReason =
  (typeof DRAFT_NOTE_CLASSIFY_REASONS)[number];

/** Ce que la relance a fait, ou n'a pas fait — et pourquoi. */
export interface DraftNoteClarificationOutcome {
  readonly asked: boolean;
  readonly reason: MemoryClarificationAskReason | null;
  readonly id: string | null;
}

/**
 * UNE QUESTION PRÊTE À AFFICHER: le morceau de phrase, ce qui est déjà lu, et
 * les bouches candidates AVEC leur prénom — le front n'a pas le rôle.
 *
 * ⟳ 2026-09-23 — DEUX GENRES, UN SEUL CANAL (sous le champ de la note).
 * `portion` (2026-09-08): la part, réponse = un cran d'appétit. `who`: un
 * goût, une envie ou un mémo dont la bouche manque — réponse = l'entrée
 * ÉCRITE avec la bouche choisie, par la même porte que la note
 * (`answerDraftNoteWho`). Le morceau à écrire voyage DANS la question
 * (`entry`) et revient avec le tap: le serveur ne garde rien entre les deux,
 * comme pour la part — et RELIT le morceau au retour par le même lecteur que
 * la note, donc avec les mêmes refus.
 *
 * ⛔ PAS DE `what` ICI, ET C'EST DIT: `keel-read-note-v1` lit la note SANS
 * aliments du plan (`planFoods: []`, il n'y a pas encore de plan), et sans
 * eux le prompt interdit « lequel ? ». Une entrée `what` qui arriverait
 * malgré tout est comptée (`clarify_not_asked`), jamais transformée en
 * bouton sans candidat vérifié.
 */
export interface DraftNotePortionQuestion {
  readonly kind: "portion";
  readonly text: string;
  readonly direction: "down" | "up";
  readonly options: readonly { readonly memberId: string; readonly label: string }[];
}

/** Ce qu'il manquait à l'entrée pour être écrite: rien d'autre que la bouche. */
export interface DraftNotePendingEntry {
  readonly gate: DraftNoteGate;
  /** `null` sur un mémo. */
  readonly kind: RetainedKind | null;
  readonly text: string;
  /**
   * LA PHRASE ENTIÈRE, telle qu'elle l'a tapée: c'est la `quote` de ce qui
   * sera écrit. Mesuré sur la pile locale le 2026-09-23: sans elle, la ligne
   * écrite après le tap citait « yaourt » au lieu de « ma fille ne veut plus
   * de yaourt le matin » — ses mots, perdus entre la question et la réponse.
   */
  readonly note: string;
  readonly occasion: RhythmOccasion | null;
  readonly force: ExclusionForce | null;
  readonly when: MemoWhen | null;
}

export interface DraftNoteWhoQuestion {
  readonly kind: "who";
  readonly text: string;
  readonly entry: DraftNotePendingEntry;
  readonly options: readonly { readonly memberId: string; readonly label: string }[];
}

export type DraftNoteQuestion = DraftNotePortionQuestion | DraftNoteWhoQuestion;

export interface DraftNoteClassifyResult {
  readonly ok: boolean;
  readonly reason: DraftNoteClassifyReason;
  /** ⑤ — la question posée, ou le motif de son absence. */
  readonly clarification: DraftNoteClarificationOutcome;
  /** La bulle « j'ai noté … · Voir », et son sort. */
  readonly notice: { readonly delivered: boolean; readonly reason: string };
  /**
   * ⟳ 2026-09-08 — LES LIGNES DE L'ACCUSÉ, TELLES QU'ELLES SONT PARTIES AU
   * CHAT. `keel-read-note-v1` les rend au front pour les afficher SOUS LE
   * CHAMP où la phrase a été écrite: la personne ne doit pas aller chercher
   * dans le chat ce qu'on vient de faire de sa phrase. Vide quand rien n'a été
   * écrit — jamais une ligne inventée.
   */
  readonly announced: readonly RecapKept[];
  /**
   * ⟳ 2026-09-25 — CE QUE LA NOTE REDIT ET QUE LA MÉMOIRE PORTAIT DÉJÀ.
   *
   * Les préférences que le classifieur a gardées mais que la porte a refusées
   * comme déjà rangées (`alreadyStored`). Elles ne sont PAS dans `announced`
   * (on ne dit pas « j'ai noté » sur une écriture qu'on n'a pas faite), mais
   * l'écran en a besoin pour aiguiller : mesuré sur un vrai compte, « J'aime
   * pas le tofu » redit sur un aperçu qui portait encore du tofu rendait
   * `announced: []`, et le dialogue recomposait toute la semaine au lieu de
   * refaire les deux plats concernés. Vide quand quelque chose a été écrit.
   */
  readonly known: readonly RecapKept[];
  /**
   * ⟳ 2026-09-25 — ⑫ « À LA PLACE DE X, METS Y », pour CE plan seulement. Rien
   * n'est écrit pour X ; Y est rangé comme préférence par la porte ①. Rendu au
   * front, qui le donne à la retouche locale.
   */
  readonly swaps: readonly DraftNoteSwap[];
  /**
   * ⟳ 2026-09-08 (lot 4) — LES QUESTIONS À POSER SOUS LE CHAMP. Une part
   * dont on ne sait pas la bouche: rien n'est écrit pour elle, et elle ne
   * sera jamais écrite sans réponse (`answerDraftNotePortion`). Vide quand le
   * classifieur a tout compris — jamais une question fabriquée ici.
   */
  readonly questions: readonly DraftNoteQuestion[];
  /**
   * ⟳ 2026-09-08 — LES MOUVEMENTS COMPRIS MAIS AU BOUT DE L'ÉCHELLE (une part
   * déjà au plus petit, un style déjà au plus simple). Ce n'est ni un refus ni
   * un échec, et « rien à changer » serait faux: la personne mérite « c'est
   * déjà au bout ». Mesuré au banc: « trop compliqué » sur `minimal`.
   */
  readonly atEdge: number;
  /**
   * ⟳ 2026-09-09 — LES CASES DE CE PLAN-CI, à rendre au composeur
   * (`operation: "edit_cells"`). Rien n'est écrit pour elles ici, et rien ne
   * le sera: une case est une demande pour CE plan, pas un souvenir.
   */
  readonly cells: readonly CellEdit[];
  /**
   * ⟳ 2026-09-23 — ⑩ CE QUI EST ÉCRIT DANS LA FICHE SANTÉ, pour la ligne sous
   * le champ (« allergie : arachides · Zoé »).
   */
  readonly safetyAnnounced: readonly { readonly text: string; readonly who: string | null }[];
  /**
   * ⑩ CE QUI N'A PAS PU L'ÊTRE, ET POURQUOI — dit sous le champ, jamais tu:
   * un refus silencieux ferait croire qu'une allergie d'enfant est enregistrée.
   */
  readonly safetyNotWritten: readonly {
    readonly text: string;
    readonly who: string | null;
    readonly reason: string;
  }[];
  /** Les trois nombres AGRÉGÉS. Le détail par porte est dans `classification`. */
  readonly proposed: number;
  readonly kept: number;
  readonly refused: number;
  readonly classification: DraftNoteClassification;
  /** ⚠️ LE MODÈLE RÉELLEMENT DEMANDÉ. Rendu, pas seulement journalisé. */
  readonly model: string;
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
// LA CLASSIFICATION PRÉCOCE — le MÊME appel, lancé AVANT le plan, pour la
// ceinture — 2026-09-06
// ===========================================================================

/**
 * CE QUE LE MODÈLE A RENDU, et rien d'écrit.
 *
 * Mesuré (cas Léa/Marc, tirs ASP1/ASP2 du 2026-09-06) : la note « Léa n'aime
 * pas les asperges » n'était qu'une phrase de prompt pour le plan qu'elle
 * annotait. Classée APRÈS l'écriture, son exclusion n'atteignait la ceinture
 * par bouche qu'au plan SUIVANT — la ceinture ne lit que `retained_items`
 * déjà en base, et la note n'y était pas encore. Le plan annoté servait donc
 * les asperges à Léa, avec une explication qui disait le contraire.
 *
 * Le remède n'est pas un second appel : c'est le MÊME appel, lancé en
 * parallèle de la génération principale (qui dure des minutes ; celui-ci
 * moins de 25 s). `draftNoteBeltItems` en tire ce que la ceinture peut mordre ;
 * `classifyAndPersistDraftNote({ classified })` l'écrit après le plan, sans
 * rappeler le modèle. Un échec est nommé et PORTÉ : la ceinture n'a alors rien
 * de plus, et la persistance rend exactement le refus qu'elle rendait avant.
 */
export type DraftNoteEarlyClassification =
  | { readonly ok: true; readonly model: string; readonly raw: unknown }
  | {
    readonly ok: false;
    readonly model: string;
    readonly reason: "bad_args" | "no_note" | "model_unavailable";
  };

function usableOf(note: DraftNoteVerdict | null | undefined): string {
  return typeof note?.usable === "string" ? note.usable.trim() : "";
}

/**
 * L'APPEL, ET SEULEMENT LUI. Ni `admin`, ni écriture : ce qui sort est une
 * réponse brute, à lire avec `readDraftNoteClassification` (par
 * `draftNoteBeltItems` ou par la persistance).
 *
 * @param planFoods les aliments du plan annoté. Lancé AVANT le plan, l'appelant
 *   n'en a pas : `[]` est sa réponse, et le prompt dit alors au modèle qu'il
 *   n'a pas le droit de demander « laquelle ? ».
 */
export async function classifyDraftNoteEarly(args: {
  userId: string;
  note: DraftNoteVerdict;
  members: readonly DraftNoteMember[];
  contentLocale: string;
  planFoods: readonly string[];
  /**
   * ⟳ 2026-09-24 — les plats barrés dont la note porte les raisons
   * (`keel-read-note-v1`, mode « Remplacer »). Absent = `[]`: la génération et
   * le bilan n'en ont pas, et leur prompt reste identique à l'octet près.
   */
  rejectedDishes?: readonly RejectedDishContext[];
  requestId?: string;
  /** ⚠️ Test seulement. Ne change PAS le modèle demandé. */
  run?: DraftNoteLlmRunner;
}): Promise<DraftNoteEarlyClassification> {
  // ⛔ APPELÉ HORS DE TOUTE BRANCHE, ET AVANT TOUT REFUS.
  const model = keelGenerationModel();
  const userId = String(args?.userId ?? "").trim();
  if (!userId || !Array.isArray(args?.members)) {
    warn("bad_args", { user_id: userId, model });
    return { ok: false, model, reason: "bad_args" };
  }
  const usable = usableOf(args.note);
  if (usable === "") {
    warn("no_note", { user_id: userId, model });
    return { ok: false, model, reason: "no_note" };
  }
  const systemPrompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  const userPrompt = buildDraftNoteClassifyPrompt({
    note: usable,
    contentLocale: args.contentLocale,
    members: args.members,
    planFoods: args.planFoods,
    rejectedDishes: args.rejectedDishes ?? [],
  });

  // ── L'APPEL. UN ÉCHEC EST NOMMÉ ET COMPTÉ, JAMAIS AVALÉ ─────────────────
  try {
    const raw = args.run
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
    return { ok: true, model, raw };
  } catch (error) {
    warn("model_unavailable", {
      user_id: userId,
      model,
      error: messageOf(error),
    });
    return { ok: false, model, reason: "model_unavailable" };
  }
}

/** Ce que la ceinture a reçu de la note, pour le compteur de la lane. */
export interface DraftNoteBeltItems {
  readonly items: readonly RetainedItem[];
  /** `retained_items` durables (porte ①). */
  readonly durable: number;
  /** L'encart « pour le prochain plan » — et le prochain plan, c'est celui-ci. */
  readonly nextPlan: number;
  readonly exclude: number;
  readonly prefer: number;
  /** `null` quand la réponse s'est lue ; sinon le motif, celui de la persistance. */
  readonly refusal: string | null;
}

const NO_BELT_ITEMS: DraftNoteBeltItems = {
  items: [],
  durable: 0,
  nextPlan: 0,
  exclude: 0,
  prefer: 0,
  refusal: null,
};

/**
 * LES ITEMS QUE LA CEINTURE PEUT MORDRE DANS LE PLAN ANNOTÉ.
 *
 * Les durables (« Léa n'aime pas les asperges ») ET ceux de l'encart (« pas
 * de poisson cette semaine ») : l'encart vise le prochain plan, et le prochain
 * plan est celui qu'on est en train de composer. Les deux portent leur
 * `subject` (`household` ou `member:<uuid>`) : c'est lui que
 * `exclusionTermsFor` lit, bouche par bouche.
 *
 * Même lecteur que la persistance, mêmes arguments : ce qui mord ici est
 * exactement ce qui sera écrit après le plan — pas une lecture à côté.
 */
export function draftNoteBeltItems(
  classified: DraftNoteEarlyClassification,
  args: {
    note: DraftNoteVerdict;
    today: string;
    targetWeek: string;
    members: readonly DraftNoteMember[];
    planFoods: readonly string[];
    now?: string;
  },
): DraftNoteBeltItems {
  if (!classified.ok) return { ...NO_BELT_ITEMS, refusal: classified.reason };
  const outcome = readDraftNoteClassification({
    raw: classified.raw,
    today: args.today,
    targetWeek: args.targetWeek,
    members: args.members,
    note: usableOf(args.note),
    writtenAt: args.now ?? new Date().toISOString(),
    planFoods: args.planFoods,
  });
  if (!outcome.ok) {
    return { ...NO_BELT_ITEMS, refusal: outcome.refusal ?? "unreadable_payload" };
  }
  const durable = outcome.classification.preferences.items;
  const nextPlan = outcome.classification.nextPlan.entries.map((e) => e.item);
  const items = [...durable, ...nextPlan];
  return {
    items,
    durable: durable.length,
    nextPlan: nextPlan.length,
    exclude: items.filter((i) => i.kind === "food.exclude").length,
    prefer: items.filter((i) => i.kind === "food.prefer").length,
    refusal: null,
  };
}

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
 * @param classified la réponse de `classifyDraftNoteEarly`, quand l'appelant
 *   l'a lancée AVANT le plan pour la ceinture (2026-09-06). Le modèle n'est
 *   alors PAS rappelé : ce qui est écrit est ce qui a mordu. ⚠️ Ne la passer
 *   que si `members`/`planFoods`/`contentLocale` sont ceux de l'appel précoce —
 *   le lecteur les reçoit d'ici, et une liste d'aliments différente rendrait
 *   la question « laquelle ? » possible à la lecture alors que le modèle n'y
 *   avait pas droit. La lane solo, qui passe les aliments du plan écrit, ne la
 *   passe donc pas.
 */
export async function classifyAndPersistDraftNote(args: {
  admin: MinimalClient;
  userId: string;
  note: DraftNoteVerdict;
  today: string;
  targetWeek: string;
  members: readonly DraftNoteMember[];
  contentLocale: string;
  /**
   * LES ALIMENTS DU PLAN QU'ELLE ANNOTAIT — requis, jamais optionnel.
   *
   * ⚠️ SANS EUX, LE MODÈLE N'A PAS LE DROIT DE DEMANDER « laquelle ? », et
   * « j'ai pas aimé la viande » redevient une exclusion de « viande » pour toute
   * la table. Un appelant qui l'oublierait ne verrait RIEN tomber: c'est
   * exactement la forme d'une garde désarmée, et c'est pour ça que le champ est
   * requis plutôt que `?`. `[]` est une réponse, et le prompt la dit.
   */
  planFoods: readonly string[];
  /**
   * LAQUELLE DES DEUX SOURCES a produit cette note (nomenclature §2.1) —
   * requis. Elle voyage jusqu'à la ligne de question pour qu'on sache, en
   * relisant, si la personne écrivait sur un brouillon ou dans le champ libre
   * de son bilan. Le chat n'y est pas, et n'y sera pas.
   */
  source: "draft_note" | "plan_feedback";
  /**
   * CE QUE L'APPELANT A DÉJÀ ÉCRIT ET VEUT DIRE DANS LA MÊME BULLE.
   *
   * Le bilan écrit DEUX fois: les réponses fermées d'abord (aliments cochés,
   * réglages bougés), le texte libre ensuite. Deux bulles pour un seul geste
   * feraient deux notifications à la suite, et la seconde désarmerait la
   * question de la première. Celle-ci fond les deux.
   *
   * ⚠️ FACULTATIF, ET LE SEUL DE CE MODULE À L'ÊTRE. Les deux générateurs n'ont
   * rien d'autre à annoncer que ce que le classifieur range: l'omettre est leur
   * réponse, pas un oubli.
   */
  alsoAnnounce?: readonly RecapKept[];
  requestId?: string;
  now?: string;
  /**
   * ⟳ 2026-09-22 · LOT A — LE RÉFÉRENTIEL, POUR POSER LA CLÉ D'UN SOUVENIR.
   *
   * ⛔ REQUIS, JAMAIS `?`, ET `null` EST UNE RÉPONSE (« le référentiel n'a pas
   * pu être chargé »). Optionnel, chaque appelant aurait hérité en silence
   * d'une mémoire NON RÉSOLUE — c'est-à-dire du comportement d'avant ce lot,
   * sans qu'une ligne ne le dise. Cicatrice nommée de ce dépôt, payée en
   * boucle.
   *
   * ⚠️ MESURÉ: 4 souvenirs sur 9 ne résolvent pas en base, et un souvenir
   * sans clé est décoratif — la ceinture n'y trouve aucun aliment, le constat
   * ne peut rien vérifier.
   */
  composition: CompositionIndex | null;
  /**
   * ⟳ 2026-09-24 — MODE « REMPLACER »: la note porte les raisons des plats
   * barrés, une ligne par plat. Le prompt reçoit chaque plat avec ses
   * mangeurs, et le tiroir des CASES est vidé — c'est le générateur qui sait
   * quoi refaire (les plats barrés), pas une phrase. Absent = `[]`.
   */
  rejectedDishes?: readonly RejectedDishContext[];
  /** ⚠️ Test seulement. Ne change PAS le modèle demandé — voir le type. */
  run?: DraftNoteLlmRunner;
  classified?: DraftNoteEarlyClassification;
}): Promise<DraftNoteClassifyResult> {
  // ⛔ LE MODÈLE QUI SERAIT DEMANDÉ, pour les refus d'AVANT l'appel. Le modèle
  // RÉELLEMENT demandé est celui de `classified` (2026-09-06) : c'est lui que
  // le résultat rend, et `classifyDraftNoteEarly` l'appelle hors de toute
  // branche.
  const modelIfAsked = keelGenerationModel();

  // Les deux « rien ne s'est passé », nommés une fois pour tous les refus.
  const NO_CLARIFICATION = { asked: false, reason: null, id: null } as const;
  const NO_NOTICE = { delivered: false, reason: "not_attempted" } as const;

  const empty = EMPTY_DRAFT_NOTE_CLASSIFICATION;
  const bail = (reason: DraftNoteClassifyReason): DraftNoteClassifyResult => {
    warn(reason, { user_id: String(args?.userId ?? ""), model: modelIfAsked });
    return {
      ok: false,
      reason,
      proposed: 0,
      kept: 0,
      refused: 0,
      classification: empty,
      model: modelIfAsked,
      write: null,
      clarification: NO_CLARIFICATION,
      notice: NO_NOTICE,
      announced: [],
      known: [],
      swaps: [],
      questions: [],
      atEdge: 0,
      cells: [],
      safetyAnnounced: [],
      safetyNotWritten: [],
    };
  };

  const userId = String(args?.userId ?? "").trim();
  if (!userId || !args?.admin) return bail("bad_args");
  if (!Array.isArray(args.members)) return bail("bad_args");

  const usable = typeof args.note?.usable === "string"
    ? args.note.usable.trim()
    : "";
  if (usable === "") return bail("no_note");

  // ── L'APPEL — ou sa réponse déjà obtenue AVANT le plan (2026-09-06) ──────
  // Un refus du précoce a déjà été journalisé par lui : on le RAPPORTE, on ne
  // le compte pas deux fois.
  const classified = args.classified ?? await classifyDraftNoteEarly({
    userId,
    note: args.note,
    members: args.members,
    contentLocale: args.contentLocale,
    planFoods: args.planFoods,
    rejectedDishes: args.rejectedDishes ?? [],
    requestId: args.requestId,
    run: args.run,
  });
  // ⚠️ LE MODÈLE RÉELLEMENT DEMANDÉ — celui de l'appel, précoce ou non.
  const model = classified.model;
  if (!classified.ok) {
    return {
      ok: false,
      reason: classified.reason,
      proposed: 0,
      kept: 0,
      refused: 0,
      classification: empty,
      model,
      write: null,
      clarification: NO_CLARIFICATION,
      notice: NO_NOTICE,
      announced: [],
      known: [],
      swaps: [],
      questions: [],
      atEdge: 0,
      cells: [],
      safetyAnnounced: [],
      safetyNotWritten: [],
    };
  }
  const raw = classified.raw;

  const outcome = readDraftNoteClassification({
    raw,
    today: args.today,
    targetWeek: args.targetWeek,
    members: args.members,
    note: usable,
    // L'INSTANT DE L'ÉCRITURE — l'horloge de ce module, ou celle du test.
    writtenAt: args.now ?? new Date().toISOString(),
    planFoods: args.planFoods,
  });
  const classification = outcome.classification;
  // ⟳ 2026-09-24 — en mode « Remplacer », aucune case ne sort d'ici.
  const cellsOut = (args.rejectedDishes ?? []).length > 0 ? [] : classification.cells.requests;
  const trace = draftNoteClassifyTrace(classification);

  if (!outcome.ok) {
    warn(outcome.refusal ?? "unreadable_payload", {
      user_id: userId,
      model,
      ...trace,
    // ⛔ « CHAMP DÉCLARÉ = COMPTEUR OBLIGATOIRE » (2026-09-08). Une part CLASSÉE
    // qui ne déplace aucun appétit est un tiroir vert et inerte, et un lot
    // désarmé ressemble trait pour trait à un lot qui marche.
    // ⚠️ ICI IL VAUT TOUJOURS ZÉRO PAR CONSTRUCTION (cette sortie précède
    // l'écriture, et l'autre exige `moves.length === 0`). Il est écrit quand
    // même: un compteur absent d'un journal est un angle mort exactement là où
    // on regardera le jour où cette invariance cessera d'être vraie.
    portions_unapplied: classification.portions.moves.length,
    // ⑥ — MÊME RAISON, MÊME INVARIANCE: zéro par construction sur cette
    // sortie, écrit quand même pour que l'angle mort n'existe pas le jour où
    // l'invariance cessera d'être vraie.
    slots_moves: classification.slots.moves.length,
    // ⑪ — même invariance, même raison.
    side_courses_moves: classification.sideCourses.moves.length,
    settings_unapplied: classification.settings.moves.length,
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
      clarification: NO_CLARIFICATION,
      notice: NO_NOTICE,
      announced: [],
      known: [],
      swaps: [],
      questions: [],
      atEdge: 0,
      cells: [],
      safetyAnnounced: [],
      safetyNotWritten: [],
    };
  }

  // ══ ⑤ LA QUESTION — UNE SEULE, ET APRÈS L'ÉCRITURE ═════════════════════
  //
  // ⚠️ UNE SEULE, MÊME QUAND LE MODÈLE EN PROPOSE DEUX. Le chat n'arme les
  // boutons que sur la DERNIÈRE bulle qui en porte; deux questions d'affilée
  // feraient une question intapable et une ligne qui ne se fermerait jamais.
  // La seconde est comptée (`clarify_not_asked`) et perdue — assumé: redemander
  // trois jours plus tard porterait sur une phrase que la personne a oubliée.
  // ── LA QUESTION DE CLARIFICATION EST DÉSARMÉE (2026-09-07) ──────────────
  //
  // Le classifieur continue de NOMMER ce qu'il n'a pas compris — c'est sa
  // valeur, et `classification.clarify.entries` le porte. Ce qui s'arrête est
  // de le RENVOYER à la personne sous forme de question.
  //
  // ⛔ CE QUI RESTE, ET QUI N'EST PAS LA MÊME CHOSE: `announce()` plus bas,
  // c'est-à-dire `notifyMemoryWrite` — la bulle « j'ai noté … · Voir ». Elle
  // est le pilier « on l'écrit, on le DIT, et ça se défait », qui remplace le
  // consentement synchrone abandonné le 2026-09-01. La question part, l'énoncé
  // reste.
  //
  // ⟳ 2026-09-23 — RÉARMÉE, PAR LE CANAL SOUS LE CHAMP, PAS PAR LE CHAT.
  //
  // Le chat reste désarmé (les boutons n'y sont armés que sur la dernière
  // bulle). Mais le canal de la part existe depuis le 2026-09-08 — la question
  // rendue par `keel-read-note-v1`, posée sous le champ, un bouton par bouche —
  // et rien n'empêchait d'y faire passer « pour qui ? » sur un goût, une envie
  // ou un mémo. Mesuré au banc: 6 questions attendues sur 6, 0 parasite. La
  // personne écrivait « ma fille ne veut plus de yaourt » avec deux filles, et
  // rien n'était écrit ni demandé.
  //
  // `notAsked` = ce que le classifieur a nommé et qu'AUCUN bouton ne portera:
  // les `what` (pas d'aliments du plan sur ce canal), et les `who` dont aucune
  // option n'a de prénom. C'est le discriminant qui distingue « tout compris »
  // de « nommé et perdu »: sans lui, les deux rendraient zéro.
  const language: "fr" | "en" = /^fr/i.test(String(args.contentLocale ?? ""))
    ? "fr"
    : "en";
  // ⟳ 2026-09-08 (lot 4) — LA PART, ELLE, SE DEMANDE. Pas par le chat (les
  // boutons n'y sont armés que sur la dernière bulle), mais SOUS LE CHAMP où
  // la phrase a été écrite, par la réponse de `keel-read-note-v1`. Construite
  // AVANT la sortie « rien à ranger »: c'est précisément le cas où elle est
  // tout ce que la note a produit.
  const whoQuestions = whoQuestionsOf(classification.clarify.entries, args.members, usableOf(args.note));
  const questions: DraftNoteQuestion[] = [
    ...portionQuestionsOf(classification.clarify.portions, args.members),
    ...whoQuestions,
  ];
  const notAsked = classification.clarify.entries.length - whoQuestions.length;

  /**
   * LA BULLE « J'AI NOTÉ … », UNE FOIS, POUR TOUT CE QUE CE TOUR A ÉCRIT.
   *
   * ⛔ AVANT LA QUESTION, TOUJOURS. Envoyée après, elle désarmerait la question
   * qu'on vient de poser: le front ne montre les boutons que du dernier message
   * qui en porte.
   */
  const announce = async (
    written: readonly RecapKept[],
    safety: readonly RecapSafety[],
  ): Promise<{ delivered: boolean; reason: string }> => {
    const all = [...(args.alsoAnnounce ?? []), ...written];
    if (all.length === 0 && safety.length === 0) return NO_NOTICE;
    return await notifyMemoryWrite(args.admin as never, {
      userId,
      kept: all,
      safety,
      language,
      requestId: args.requestId,
      now: args.now ? new Date(args.now) : undefined,
    });
  };

  /** Le prénom d'une bouche, ou `null` — jamais un identifiant dans un message. */
  const whoOf = (subject: string): string | null => {
    const id = subject.startsWith("member:") ? subject.slice(7) : "";
    if (!id) return null;
    const found = (args.members ?? []).find((m) =>
      String(m?.memberId ?? "").trim().toLowerCase() === id
    );
    const label = String(found?.label ?? "").trim();
    return label || null;
  };

  if (
    classification.preferences.items.length === 0 &&
    classification.notes.lines.length === 0 &&
    classification.nextPlan.entries.length === 0 &&
    // ⟳ 2026-09-08 — LA QUATRIÈME PORTE. Une note qui ne dit QUE « maman ne
    // mange pas autant » remplit `portions` et rien d'autre: sans cette ligne
    // elle ressortirait en `nothing_to_file`, et l'appelant ne verrait jamais
    // le mouvement qu'il doit appliquer.
    classification.portions.moves.length === 0 &&
    classification.settings.moves.length === 0 &&
    // ⟳ 2026-09-21 — LA SIXIÈME PORTE, et l'oubli était exactement le défaut
    // que la quatrième a déjà payé en 2026-09-08. Une note qui ne dit QUE
    // « le matin c'est plutôt quelque chose de très léger » remplit `slots` et
    // rien d'autre: sans cette ligne elle ressortait `nothing_to_file`, la case
    // de la fiche n'était jamais cochée, et le tiroir était vert et inerte.
    classification.slots.moves.length === 0 &&
    // ⟳ 2026-09-23 — ⑪, LE MÊME OUBLI QUE LA SIXIÈME PORTE, FERMÉ AVANT
    // D'ÊTRE PAYÉ. « il ne prend jamais de dessert » remplit `side_courses` et
    // rien d'autre: sans cette ligne, la phrase ressortait `nothing_to_file` et
    // le réglage de la fiche n'était jamais posé.
    classification.sideCourses.moves.length === 0 &&
    // ⟳ 2026-09-23 — ⑩: une note qui ne dit QU'UNE allergie doit atteindre
    // l'écriture. Sans cette ligne elle ressortait `nothing_to_file`.
    classification.safety.declarations.length === 0
  ) {
    // ⚠️ CE N'EST PAS UNE PANNE, ET LES NOMBRES PAR PORTE LE DISENT.
    // `skipped_degree > 0` = le modèle a lu un degré et l'a DIT (phrases 1, 2,
    // 5 du banc). `proposed > 0, kept: 0` = les portes ont tout refusé, et
    // `*_refused_forbidden_kinds` dit si c'est l'échappatoire mesurée.
    // ⚠️ ON DEMANDE MÊME QUAND ON N'A RIEN RANGÉ, et c'est le cas le plus
    // fréquent de cette porte: « ma fille n'aime pas le poisson » ne remplit
    // aucune des trois listes — c'est précisément pour ça qu'on relance.
    const clarification = NO_CLARIFICATION;
    const notice = await announce([], []);
    // ⟳ `clarification_asked` n'est plus atteignable: rien ne demande.
    // ⚠️ `nothing_to_file` RESTE LE MOTIF même quand une sécurité a été
    // écrite: il parle des PORTES. Les lignes annoncées, elles, disent
    // l'écriture — et le front lit les lignes, pas le motif.
    const reason: DraftNoteClassifyReason = "nothing_to_file";
    log(reason, {
      user_id: userId,
      model,
      ...trace,
      questions: questions.length,
    // ⛔ « CHAMP DÉCLARÉ = COMPTEUR OBLIGATOIRE » (2026-09-08). Une part CLASSÉE
    // qui ne déplace aucun appétit est un tiroir vert et inerte, et un lot
    // désarmé ressemble trait pour trait à un lot qui marche.
    // ⚠️ ICI IL VAUT TOUJOURS ZÉRO PAR CONSTRUCTION (cette sortie précède
    // l'écriture, et l'autre exige `moves.length === 0`). Il est écrit quand
    // même: un compteur absent d'un journal est un angle mort exactement là où
    // on regardera le jour où cette invariance cessera d'être vraie.
    portions_unapplied: classification.portions.moves.length,
    // ⑥ — MÊME RAISON, MÊME INVARIANCE: zéro par construction sur cette
    // sortie, écrit quand même pour que l'angle mort n'existe pas le jour où
    // l'invariance cessera d'être vraie.
    slots_moves: classification.slots.moves.length,
    // ⑪ — même invariance, même raison.
    side_courses_moves: classification.sideCourses.moves.length,
    settings_unapplied: classification.settings.moves.length,
      clarify_asked: clarification.asked,
      clarify_ask_reason: clarification.reason,
      clarify_not_asked: notAsked,
      notice_delivered: notice.delivered,
    });
    return {
      ok: false,
      reason,
      proposed: classification.proposed,
      kept: classification.kept,
      refused: classification.refused.total,
      classification,
      model,
      write: null,
      clarification,
      notice,
      announced: [],
      known: [],
      swaps: [],
      questions,
      atEdge: 0,
      cells: cellsOut,
      safetyAnnounced: [],
      safetyNotWritten: [],
    };
  }

  // ── LA PORTE, UNE FOIS, AVEC LES TROIS LISTES. ⛔ ON NE LA CONTOURNE PAS ─
  // ⛔ `producer: DRAFT_NOTE_PRODUCER`, ET JAMAIS `"written"`.
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-22 · LOT A — LA CLÉ, AVANT L'ÉCRITURE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ APRÈS LE MODÈLE, ET JAMAIS PAR LUI. Il n'a ni les 945 slugs ni les
  // 2 739 alias en tête ; la résolution est déterministe et vit dans
  // `resolveIngredient` (égalité de clé, alias, faux amis nommés, AUCUNE
  // distance d'édition). Un second résolveur divergerait, et c'est celui
  // qu'on relit le moins qui attacherait un souvenir au mauvais aliment.
  //
  // ⚠️ ET LE `text` NE BOUGE PAS. La carte affiche les mots de la personne ;
  // le slug vient à côté. Mesuré: `lesoeufs` ne résout rien, `les œufs` et
  // `oeufs` résolvent tous deux vers `whole_eggs`.
  const { write, durableResolved, nextResolved, nextPlanEntries, refCounts } = await resolveAndPersist({
    admin: args.admin,
    userId,
    composition: args.composition,
    classification,
  });

  // ══════════════════════════════════════════════════════════════════════
  // ④ · LA PART — UN CRAN D'APPÉTIT, SUR LA FICHE DE LA BOUCHE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ APRÈS LA PORTE, ET DANS SON PROPRE APPEL. Ce n'est pas le même magasin:
  // `retained_items` porte des goûts, `household_member_bodies` porte un corps.
  // Les fondre demanderait au port d'écrire deux tables — c'est-à-dire de
  // devenir le second endroit qui sait ce qu'est un appétit.
  //
  // ⛔ LA RPC EST UNE VARIANTE `_for`, et c'est obligatoire ici: celle que le
  // formulaire appelle lit `auth.uid()`, NULL sous service_role. Un appel
  // silencieusement refusé (`not_authenticated`) ressemblerait trait pour trait
  // à « la personne n'avait rien demandé ».
  //
  // ⚠️ ET LE PLAN QUE LA PERSONNE REGARDE N'EST PAS RECOMPOSÉ. Le cran vaut
  // pour le PROCHAIN plan, et l'accusé doit le dire — sans quoi elle attendrait
  // un changement à l'écran qui ne vient pas. La recomposition immédiate
  // demande de scinder la requête en deux (le triage), et c'est un lot à part.
  // ── ⑩ LA SÉCURITÉ, PAR SA PROPRE PORTE (2026-09-23) ─────────────────────
  // La personne qui écrit (`writes: true`) → sa ligne; une autre bouche →
  // les RPC serveur `_for`. Ce qui n'a pas pu s'écrire est RENDU, et dit.
  const writerMemberId = (args.members ?? []).find((m) => m?.writes === true)?.memberId ?? null;
  const safetyWrite = classification.safety.declarations.length === 0
    ? { written: [], notWritten: [] }
    : await persistDraftNoteSafety({
      admin: args.admin as never,
      userId,
      declarations: classification.safety.declarations,
      writerMemberId,
      contentLocale: String(args.contentLocale ?? ""),
    });
  const labelOfMember = (memberId: string): string | null => whoOf(`member:${memberId}`);
  const safetyAnnounced = safetyWrite.written.map((d) => ({
    text: draftNoteSafetyLine(d, language),
    who: labelOfMember(d.memberId),
  }));
  const safetyNotWritten = safetyWrite.notWritten.map((n) => ({
    text: draftNoteSafetyLine(n.declaration, language),
    who: labelOfMember(n.declaration.memberId),
    reason: n.reason,
  }));
  // La bulle du chat: `who: null` = la personne à qui on parle.
  const writerId = String(writerMemberId ?? "").trim().toLowerCase();
  const safetyRecap: RecapSafety[] = safetyWrite.written.map((d) => ({
    kind: d.kind,
    ref: draftNoteSafetyObject(d, language),
    who: d.memberId === writerId ? null : labelOfMember(d.memberId),
  }));

  const { counters: appetite, moved: appetiteMoved } = await moveAppetites(
    args.admin,
    userId,
    classification.portions.moves,
  );

  // ══════════════════════════════════════════════════════════════════════
  // ⑥ · LA TAILLE D'UN MOMENT — LA CASE DE LA FICHE, PAS UN ITEM RETENU
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE CHAMP, PAS UNE COPIE — la raison du lot M5, appliquée une fois de
  // plus. Un souvenir « petit-déjeuner léger » serait relu au moment de
  // composer pendant que la case de la fiche dirait autre chose; ici l'écran
  // et le plan lisent la MÊME valeur (`household_member_habits.slots[].light`,
  // pesée par `LIGHT_SLOT_WEIGHT`).
  //
  // ⚠️ MESURÉ LE 2026-09-21: sans ce tiroir, « le matin c'est plutôt quelque
  // chose de très léger » n'avait AUCUNE destination. Le levier existait
  // depuis le 2026-09-07, et aucun producteur ne l'écrivait — son
  // petit-déjeuner est resté à 500 kcal.
  const { counters: slotLight, moved: slotLightMoved } = await moveSlotLights(
    args.admin,
    userId,
    classification.slots.moves,
    args.members,
  );

  // ══════════════════════════════════════════════════════════════════════
  // ⑪ · LES À-CÔTÉS — LE RÉGLAGE DE LA FICHE, PAS UN ITEM RETENU
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE CHAMP, PAS UNE COPIE — la raison de ⑥ et du lot M5. L'écran et le
  // moteur lisent la MÊME valeur (`household_member_habits.slots[].
  // side_courses`, par `parseMemberSideCourses`).
  //
  // ⚠️ CE CHEMIN SERT AUSSI LE RETOUR DE FIN DE PLAN: `keel-plan-feedback-v1`
  // passe sa phrase par `classifyAndPersistDraftNote`, donc par ici.
  const { counters: sideCourse, moved: sideCourseMoved } = await moveSideCourses(
    args.admin,
    userId,
    classification.sideCourses.moves,
    args.members,
  );

  // ══════════════════════════════════════════════════════════════════════
  // ⑤ · LE TRAVAIL DE CUISINE — UN CRAN SUR LE CHAMP, PAR LA PORTE DU BILAN
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ PAR `retainedItemsFromPlanFeedback`, ET PAR ELLE SEULE. « Trop long »
  // se traduit en la réponse fermée que le bilan connaît (`speed: too_long`),
  // et c'est LA FONCTION DU BILAN qui décide: ⟳ 2026-09-25 la plage de temps
  // (`cooking_time_min`, cadran unique des deux axes); un cran
  // depuis la valeur courante; rien au bord (`atFloor`/`atCeiling`); rien sans
  // base (`noBaseline`); rien quand les deux axes se contredisent
  // (`bothPolarities`). Réécrire un de ces cas ici en ferait deux.
  //
  // ⛔ LE CHAMP, PAS UNE COPIE. C'est ce qui distingue ce lot du `logistics.set`
  // fermé au lot M5: l'écran et le plan liront la MÊME valeur, avec la trace
  // (`field_changes`) que le bilan écrit déjà, et le « Défaire » qui va avec.
  //
  // ⚠️ `cooked: "partly"` DANS LA LIGNE SYNTHÉTIQUE, ET C'EST UNE GARDE QU'ON
  // OUVRE, PAS UN FAIT QU'ON AFFIRME. `effectOf` ne dérive `speedStep` et
  // `difficultyStep` que si `cookingQuestionsAreAsked(cooked)` — `yes` ou
  // `partly`. Le sens de cette garde: « on ne DEMANDE pas "c'était trop long ?"
  // à quelqu'un qui n'a pas cuisiné ». Ici personne ne demande rien: la
  // personne l'a ÉCRIT d'elle-même. `partly` est le jeton le plus faible qui
  // ouvre (« a assez cuisiné pour savoir »), la ligne n'est JAMAIS stockée, et
  // sans lui le tiroir 5 était vert et sans effet — mesuré: deux cas rouges
  // sur `speed`, le cas `variety` vert, parce que la variété n'a pas de garde.
  const settings = {
    asked: 0,
    moved: 0,
    at_edge: 0,
    conflict: 0,
    no_baseline: 0,
    unsupported: 0,
    failed: 0,
  };
  const settingsWritten: FieldChange[] = [];
  if (classification.settings.moves.length > 0) {
    let pc: Record<string, unknown> | null = null;
    let pcReadable = true;
    try {
      const res = await args.admin
        .from("student_goals")
        .select("practical_constraints")
        .eq("user_id", userId)
        .maybeSingle();
      if (res?.error) throw new Error(String(res.error.message ?? res.error));
      const raw = (res?.data ?? null) as Record<string, unknown> | null;
      const v = raw?.practical_constraints;
      pc = v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
    } catch {
      pcReadable = false;
    }

    // ── LA TRADUCTION: un mouvement → la réponse fermée équivalente ──────
    // ⛔ ELLE EST ICI ET NULLE PART AILLEURS, et elle est TRIVIALE exprès:
    // quatre lignes, sans arithmétique. Tout ce qui décide vit dans le bilan.
    let difficulty: string | null = null;
    let speed: string | null = null;
    let variety: string | null = null;
    for (const move of classification.settings.moves as readonly SettingMove[]) {
      settings.asked += 1;
      if (move.about === "time") {
        speed = move.direction === "down" ? "too_long" : "had_more_time";
      } else if (move.about === "difficulty") {
        difficulty = move.direction === "down" ? "too_hard" : "could_do_more";
      } else if (move.direction === "up") {
        variety = "no"; // « pas assez varié » — la réponse fermée du bilan
      } else {
        // ⚠️ « MOINS DE VARIÉTÉ » N'A PAS DE RÉPONSE FERMÉE: le questionnaire
        // ne sait que monter la variété (« l'asymétrie des dégâts »). Compté,
        // pas deviné — inventer un cran vers `repeat` serait la seconde
        // arithmétique que ce bloc refuse.
        settings.unsupported += 1;
      }
    }

    if (!pcReadable) {
      settings.failed += settings.asked;
    } else if (difficulty !== null || speed !== null || variety !== null) {
      const row: PlanFeedbackRow = {
        cooked: "partly",
        portions: null,
        portionsSubject: null,
        neverAgain: [],
        makeAgain: [],
        difficulty,
        speed,
        variety,
        axisQuestion: null,
        axisAnswer: null,
        dismissedAt: null,
      };
      const num = Number(pc?.cooking_time_min);
      const text = (v: unknown): string | null => {
        const t = String(v ?? "").trim();
        return t === "" ? null : t;
      };
      const retained = retainedItemsFromPlanFeedback(row, {
        at: args.today,
        locale: String(args.contentLocale ?? ""),
        planDishTitles: [],
        planFoodTerms: [],
        cookingTimeMin: Number.isFinite(num) ? num : null,
        recipeDifficulty: text(pc?.recipe_difficulty),
        varietyLevel: text(pc?.variety),
      });
      settings.conflict = retained.refused.bothPolarities;
      settings.no_baseline = retained.refused.noBaseline;
      settings.at_edge = retained.refused.atFloor + retained.refused.atCeiling;
      // ⛔ LA SOURCE ET LA CITATION SONT LES NÔTRES. Le bilan écrit
      // `questionnaire` et cite le libellé que la personne a LU sur l'échelle;
      // ici elle n'a rien lu, elle a ÉCRIT — la citation est sa phrase, et
      // c'est ce que « Défaire » lui montrera.
      const changes: FieldChange[] = retained.fieldChanges.map((c) => ({
        ...c,
        source: "draft_note" as const,
        quote: usable,
      }));
      if (changes.length > 0) {
        const expected: Record<string, unknown> = {};
        for (const c of changes) expected[c.field] = (pc ?? {})[c.field] ?? null;
        try {
          const out = await persistFieldChangesFor({
            admin: args.admin as never,
            userId,
            source: DRAFT_NOTE_CLASSIFY_SOURCE,
            expected,
            changes,
            journal: fieldChangesFrom(withFieldChanges(pc, changes)),
          });
          if (out.ok) {
            settings.moved = out.written;
            settingsWritten.push(...changes);
          } else {
            settings.failed += changes.length;
          }
        } catch {
          settings.failed += changes.length;
        }
      }
    }
  }

  // ── ON LE DIT, PUIS ON DEMANDE ─────────────────────────────────────────
  //
  // ⚠️ SEULEMENT CE QUI EST VRAIMENT ENTRÉ. Annoncer une ligne que la porte a
  // refusée (un doublon, un mémo plein) apprendrait à la personne que les
  // accusés ne veulent rien dire — la même règle que « on ne dit jamais noté
  // sur une écriture qu'on n'a pas faite ».
  const announced: RecapKept[] = writtenRecapLines(write, classification, whoOf);
  // ⟳ 2026-09-25 — rien d'écrit, mais la porte a reconnu des doublons : la
  // note redit ce que la mémoire porte déjà. Voir `known` sur le type.
  const known: RecapKept[] = write.durableWritten === 0 && write.refused.alreadyStored > 0
    ? classification.preferences.items.map((item) => ({
      text: item.text,
      until: null,
      kind: "preference",
      who: whoOf(item.subject),
      sense: item.kind,
    }))
    : [];
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ ④ ET ⑤ S'ANNONCENT HORS DU `if (write.ok)` — MESURÉ AU TIR N3b
  // ══════════════════════════════════════════════════════════════════════
  //
  // La porte des items retenus rend `nothing_to_write` quand la note ne
  // contient NI goût, NI mémo, NI envie — c'est-à-dire exactement quand elle
  // ne contient qu'une part ou qu'un réglage. Ces deux-là n'écrivent pas par
  // cette porte (l'appétit par sa RPC, le réglage par la porte des champs):
  // lier leur accusé à `write.ok` faisait écrire le champ ET se taire.
  // Mesuré: « C'est trop long à cuisiner » ⇒ `cooking_style: balanced →
  // minimal` (le cadran d'avant le 2026-09-25), trace écrite, `settings_moved: 1`… et `notice_reason:
  // not_attempted`. Le tir N1 ne l'avait pas montré parce que Leo avait une
  // préférence à côté, qui ouvrait le `if`.
  announced.push(...appetiteRecapLines(appetiteMoved, language, whoOf));
  // ⑥ — une case cochée se dit comme un champ déplacé, par le même chemin.
  announced.push(...slotLightRecapLines(slotLightMoved, language, whoOf));
  // ⑪ — un à-côté réglé se dit comme la case du léger, par le même chemin.
  announced.push(...sideCourseRecapLines(sideCourseMoved, language, whoOf));
  // ⑤ — un champ déplacé se dit comme au bilan: par `settingRecapLine`, qui
  // tient les libellés des quatre échelles dans les deux langues.
  for (const change of settingsWritten) {
    const line = settingRecapLine(change, language);
    if (line === null) continue;
    announced.push({ text: line, until: null, kind: "setting", who: null });
  }
  const notice = await announce(announced, safetyRecap);
  const clarification = NO_CLARIFICATION;

  // ⛔ TROIS CANAUX D'ÉCRITURE, UN SEUL VERDICT. `write.ok` ne parle que de la
  // porte des items retenus; un appétit ou un champ déplacé est une écriture
  // au même titre. Dire `not_written` alors que la fiche a bougé ferait lire
  // un échec là où il y a un effet — le contraire exact d'un compteur.
  // ⛔ QUATRE CANAUX D'ÉCRITURE, UN SEUL VERDICT. Une case de fiche cochée est
  // une écriture au même titre qu'un item retenu: dire `not_written` ferait
  // lire un échec là où il y a un effet.
  const wrote = write.ok || appetite.moved > 0 || settings.moved > 0 ||
    slotLight.moved > 0 || sideCourse.moved > 0 ||
    safetyWrite.written.length > 0;
  const result: DraftNoteClassifyResult = {
    ok: wrote,
    reason: wrote ? "written" : "not_written",
    proposed: classification.proposed,
    kept: classification.kept,
    refused: classification.refused.total,
    classification,
    model,
    write,
    clarification,
    notice,
    announced,
    known,
    swaps: classification.swaps.requests,
    questions,
    atEdge: appetite.at_edge + settings.at_edge,
    cells: cellsOut,
    safetyAnnounced,
    safetyNotWritten,
  };
  // UNE SEULE LIGNE, ET ELLE PORTE LES NOMBRES PAR PORTE AVEC LE MODÈLE.
  (result.ok ? console.info : console.warn)(JSON.stringify({
    tag: "keel/draft_note_classify",
    event: result.reason,
    user_id: userId,
    model,
    ...trace,
    // ⛔ LES QUATRE ISSUES D'UN MOUVEMENT DE PART, ET ELLES SE LISENT ENSEMBLE.
    // `asked > 0` avec `moved: 0` et `at_edge: 0` est la signature exacte d'un
    // câblage rompu — la même forme que `portion_applied` côté génération.
    // ⚠️ `at_edge` N'EST PAS UN ÉCHEC: l'échelle est au bout, et c'est
    // précisément le cas où la personne mérite une phrase plutôt qu'un silence.
    portions_asked: appetite.asked,
    portions_moved: appetite.moved,
    portions_at_edge: appetite.at_edge,
    portions_failed: appetite.failed,
    portions_unapplied: appetite.asked - appetite.moved,
    // ⑩ — écrit / pas écrit, et les MOTIFS (jamais l'allergène).
    safety_written: safetyWrite.written.length,
    safety_not_written: safetyWrite.notWritten.length,
    safety_not_written_reasons: safetyWrite.notWritten.map((n) => n.reason),
    // ⑤ — les six issues d'un mouvement de réglage. `asked > 0` avec tout le
    // reste à zéro est la signature d'un câblage rompu. `conflict` (les deux
    // axes en sens contraires sur le cadran unique), `at_edge` et
    // `no_baseline` sont des REFUS QUI SE DISENT, pas des échecs.
    settings_asked: settings.asked,
    settings_moved: settings.moved,
    settings_at_edge: settings.at_edge,
    settings_conflict: settings.conflict,
    settings_no_baseline: settings.no_baseline,
    settings_unsupported: settings.unsupported,
    settings_failed: settings.failed,
    settings_unapplied: settings.asked - settings.moved,
    // ⑥ — les quatre issues d'une case de fiche. `asked > 0` avec tout le
    // reste à zéro est la signature d'un câblage rompu; `unchanged` est un
    // REFUS QUI SE DIT (la case portait déjà cette valeur), pas un échec.
    // ⚠️ `moves` À CÔTÉ DE `asked`, ET L'ÉCART EST LE SUJET: un mouvement de
    // TABLE se déplie sur le roster, donc `asked` peut valoir quatre pour une
    // seule phrase — et `moves > 0 && asked === 0` dit « roster vide », pas
    // « rien demandé ».
    slots_moves: classification.slots.moves.length,
    slots_asked: slotLight.asked,
    slots_moved: slotLight.moved,
    slots_unchanged: slotLight.unchanged,
    slots_failed: slotLight.failed,
    // ⑪ — les quatre issues d'un réglage d'à-côté, lues comme celles de ⑥.
    // ⚠️ `moves` À CÔTÉ DE `asked`: un mouvement de TABLE ou sans moment se
    // déplie (bouches × deux repas), donc `asked` vaut jusqu'à 2 × le rôle
    // pour une seule phrase.
    side_courses_moves: classification.sideCourses.moves.length,
    side_courses_asked: sideCourse.asked,
    side_courses_moved: sideCourse.moved,
    side_courses_unchanged: sideCourse.unchanged,
    side_courses_failed: sideCourse.failed,
    // ⟳ 2026-09-22 · LOT A — LA RÉSOLUTION, AVEC SON DÉNOMINATEUR.
    //
    // ⛔ `ref_resolved` SEUL EST AMBIGU: il rend le même zéro pour « aucun
    // souvenir d'aliment » et « rien n'a résolu ». `ref_askable` sépare les
    // deux, et c'est leur rapport qui dit si la mémoire agit ou décore.
    //
    // ⚠️ `ref_unresolved_forms` porte des NOMS D'ALIMENTS, jamais un texte de
    // personne: ce sont les formes à verser au sas du référentiel, et c'est
    // comme ça qu'il apprend. Une phrase de la personne n'a rien à faire dans
    // un journal.
    ref_askable: refCounts.askable,
    ref_resolved: refCounts.resolved,
    ref_unresolved: refCounts.askable - refCounts.resolved,
    ref_unresolved_forms: refCounts.unresolved,
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
    clarify_asked: clarification.asked,
    clarify_ask_reason: clarification.reason,
    clarify_not_asked: notAsked,
    // ⟳ lot 4 — `clarify_portions > 0` avec `questions: 0` = une bouche
    // candidate sans prénom dans le rôle: la question est tombée, et ça se lit.
    questions: questions.length,
    notice_delivered: notice.delivered,
    notice_reason: notice.reason,
  }));
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ · L'APPÉTIT — le mouvement, ses lignes, et la RÉPONSE à une question
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UN CRAN D'APPÉTIT PAR BOUCHE, PAR LA RPC `_for`.
 *
 * ⛔ LA RPC EST UNE VARIANTE `_for`, et c'est obligatoire ici: celle que le
 * formulaire appelle lit `auth.uid()`, NULL sous service_role. Un appel
 * silencieusement refusé (`not_authenticated`) ressemblerait trait pour trait
 * à « la personne n'avait rien demandé ».
 *
 * ⚠️ LES DEUX CRANS, PAS LE SEUL NOUVEAU. La phrase que la personne lira est
 * « Appétit : de normal à petit »: sans le `previous`, l'accusé annoncerait
 * une valeur sans dire d'où elle vient. Ils viennent de la RPC, pas d'une
 * relecture — une relecture serait une seconde chance de lire l'état d'après
 * l'écriture de quelqu'un d'autre.
 *
 * ⚠️ « AU BOUT » N'EST PAS UN ÉCHEC (`at_edge`): elle a redemandé moins à
 * quelqu'un qui est déjà au plus bas de l'échelle. ⛔ ON NE LÈVE JAMAIS: une
 * part qui ne bouge pas ne doit pas emporter la note entière.
 */
async function moveAppetites(
  admin: MinimalClient,
  userId: string,
  moves: readonly PortionMove[],
): Promise<{
  counters: { asked: number; moved: number; at_edge: number; failed: number };
  moved: AppetiteMoved[];
}> {
  const counters = { asked: 0, moved: 0, at_edge: 0, failed: 0 };
  const moved: AppetiteMoved[] = [];
  for (const move of moves) {
    counters.asked += 1;
    try {
      const { data, error } = await admin.rpc(
        "keel_household_set_member_appetite_for",
        { p_user: userId, p_member: move.memberId, p_direction: move.direction },
      );
      const row = (data ?? {}) as {
        ok?: unknown;
        reason?: unknown;
        previous?: unknown;
        appetite?: unknown;
      };
      if (error || row.ok !== true) {
        const reason = String(row.reason ?? "");
        if (reason === "at_floor" || reason === "at_ceiling") counters.at_edge += 1;
        else counters.failed += 1;
        continue;
      }
      counters.moved += 1;
      moved.push({
        move,
        previous: String(row.previous ?? ""),
        next: String(row.appetite ?? ""),
      });
    } catch {
      counters.failed += 1;
    }
  }
  return { counters, moved };
}

interface AppetiteMoved {
  readonly move: PortionMove;
  readonly previous: string;
  readonly next: string;
}

// ════════════════════════════════════════════════════════════════════════════
// ⑥ · LA TAILLE D'UN MOMENT — la case « repas léger » de la fiche
// ════════════════════════════════════════════════════════════════════════════

interface SlotLightMoved {
  readonly memberId: string;
  readonly slot: string;
  readonly light: boolean;
}

/**
 * UNE CASE « REPAS LÉGER » PAR BOUCHE ET PAR MOMENT, PAR LA RPC `_for`.
 *
 * ⛔ LA RPC EST UNE VARIANTE `_for`, et c'est obligatoire: celle que l'écran
 * appelle lit `auth.uid()`, NULL sous service_role. Même raison mot pour mot
 * que l'appétit, et même coût — un refus silencieux ressemblerait trait pour
 * trait à « la personne n'avait rien demandé ».
 *
 * ⚠️ LE FOYER SE DÉPLIE ICI, SUR LE RÔLE, ET PAS DANS LA RPC. Une table qui
 * déjeune léger est une phrase ordinaire, mais la case vit PAR BOUCHE: la
 * déplier côté SQL demanderait à la base de connaître « tout le monde à table »,
 * c'est-à-dire une seconde définition du roster à côté de celle du code.
 *
 * ⚠️ `unchanged` N'EST PAS UN ÉCHEC: la case portait déjà cette valeur. Sans
 * ce compteur, recocher ce qui était coché se lirait comme un mouvement, et la
 * mémoire aurait l'air d'agir alors qu'elle répète.
 */
async function moveSlotLights(
  admin: MinimalClient,
  userId: string,
  moves: readonly SlotSizeMove[],
  members: readonly DraftNoteMember[],
): Promise<{
  counters: { asked: number; moved: number; unchanged: number; failed: number };
  moved: SlotLightMoved[];
}> {
  const counters = { asked: 0, moved: 0, unchanged: 0, failed: 0 };
  const moved: SlotLightMoved[] = [];
  const roster = (members ?? [])
    .map((m) => String(m?.memberId ?? "").trim())
    .filter((id) => id !== "");
  for (const move of moves) {
    // ⛔ `null` = TOUTE LA TABLE, dépliée sur le rôle. Un rôle vide ne devient
    // pas « personne » en silence: `asked` reste à 0 pour ce mouvement, et
    // `moves.length − asked` le dit.
    const targets = move.memberId === null ? roster : [move.memberId];
    for (const memberId of targets) {
      counters.asked += 1;
      try {
        const { data, error } = await admin.rpc(
          "keel_household_set_slot_light_for",
          {
            p_user: userId,
            p_member: memberId,
            p_slot: move.slot,
            p_light: move.light,
          },
        );
        const row = (data ?? {}) as { ok?: unknown; reason?: unknown };
        if (error || row.ok !== true) {
          if (String(row.reason ?? "") === "unchanged") counters.unchanged += 1;
          else counters.failed += 1;
          continue;
        }
        counters.moved += 1;
        moved.push({ memberId, slot: move.slot, light: move.light });
      } catch {
        counters.failed += 1;
      }
    }
  }
  return { counters, moved };
}

/**
 * ⛔ PAR `settingRecapLine`, comme l'appétit et les réglages de cuisine. Ce
 * module ne connaît aucun libellé: `memory_recap` est le seul endroit qui dit
 * un champ dans les deux langues.
 *
 * ⚠️ `previous: null` — ON NE DIT QUE L'ARRIVÉE. La RPC ne rend pas la valeur
 * d'avant, et en relire une serait relire l'état d'après l'écriture de
 * quelqu'un d'autre. « Petit-déjeuner : léger » se lit tout seul.
 */
function slotLightRecapLines(
  moved: readonly SlotLightMoved[],
  language: "fr" | "en",
  whoOf: (subject: string) => string | null,
): RecapKept[] {
  const lines: RecapKept[] = [];
  for (const m of moved) {
    const line = settingRecapLine(
      { field: `light_${m.slot}`, previous: null, next: m.light },
      language,
    );
    if (line === null) continue;
    lines.push({
      text: line,
      until: null,
      kind: "setting",
      who: whoOf(memberSubject(m.memberId) ?? ""),
    });
  }
  return lines;
}

// ════════════════════════════════════════════════════════════════════════════
// ⑪ · LES À-CÔTÉS — le réglage « Entrée / Fromage / Dessert / Pain » de la fiche
// ════════════════════════════════════════════════════════════════════════════

interface SideCourseMoved {
  readonly memberId: string;
  readonly slot: string;
  readonly kind: SideCourseKind;
  readonly takes: boolean;
}

/**
 * UN RÉGLAGE D'À-CÔTÉ PAR BOUCHE, PAR MOMENT ET PAR TYPE, PAR LA RPC `_for`.
 *
 * ⛔ `keel_household_set_slot_side_courses_for`, jamais la fonction de
 * l'écran: celle-ci lit `auth.uid()`, NULL sous service_role — la raison mot
 * pour mot de ⑥ et de l'appétit.
 *
 * ⚠️ DEUX DÉPLIEMENTS, ICI ET PAS EN SQL, pour la raison de ⑥: la base ne
 * connaît pas « tout le monde à table », et ne doit pas en avoir une seconde
 * définition.
 *   · `memberId: null` ⇒ toutes les bouches du rôle (« chez nous pas de
 *     dessert le soir »);
 *   · `slot: null`     ⇒ déjeuner ET dîner (`SIDE_COURSE_SLOTS`), la phrase
 *     qui ne nomme pas le repas.
 *
 * ⚠️ `unchanged` N'EST PAS UN ÉCHEC: le réglage portait déjà cette valeur.
 * Sans ce compteur, redire ce qui était dit se lirait comme un mouvement.
 */
async function moveSideCourses(
  admin: MinimalClient,
  userId: string,
  moves: readonly SideCourseMove[],
  members: readonly DraftNoteMember[],
): Promise<{
  counters: { asked: number; moved: number; unchanged: number; failed: number };
  moved: SideCourseMoved[];
}> {
  const counters = { asked: 0, moved: 0, unchanged: 0, failed: 0 };
  const moved: SideCourseMoved[] = [];
  const roster = (members ?? [])
    .map((m) => String(m?.memberId ?? "").trim())
    .filter((id) => id !== "");
  for (const move of moves) {
    const targets = move.memberId === null ? roster : [move.memberId];
    const slots: readonly string[] = move.slot === null ? SIDE_COURSE_SLOTS : [move.slot];
    for (const memberId of targets) {
      for (const slot of slots) {
        counters.asked += 1;
        try {
          const { data, error } = await admin.rpc(
            "keel_household_set_slot_side_courses_for",
            {
              p_user: userId,
              p_member: memberId,
              p_slot: slot,
              p_kind: move.kind,
              p_takes: move.takes,
            },
          );
          const row = (data ?? {}) as { ok?: unknown; reason?: unknown };
          if (error || row.ok !== true) {
            if (String(row.reason ?? "") === "unchanged") counters.unchanged += 1;
            else counters.failed += 1;
            continue;
          }
          counters.moved += 1;
          moved.push({ memberId, slot, kind: move.kind, takes: move.takes });
        } catch {
          counters.failed += 1;
        }
      }
    }
  }
  return { counters, moved };
}

/**
 * ⛔ PAR `settingRecapLine`, comme ⑥: `memory_recap` est le seul endroit qui
 * dit un champ dans les deux langues.
 *
 * ⚠️ UNE LIGNE PAR (bouche, type), QUAND LES DEUX REPAS ONT BOUGÉ DANS LE
 * MÊME SENS: « Dessert : non », et pas deux lignes qui répètent la phrase.
 * Sinon une ligne par moment réellement déplacé (« Dessert au dîner : non »)
 * — jamais une ligne pour un moment qui n'a pas bougé (`unchanged`).
 */
function sideCourseRecapLines(
  moved: readonly SideCourseMoved[],
  language: "fr" | "en",
  whoOf: (subject: string) => string | null,
): RecapKept[] {
  const lines: RecapKept[] = [];
  const done = new Set<number>();
  for (let i = 0; i < moved.length; i++) {
    if (done.has(i)) continue;
    const m = moved[i];
    const twin = moved.findIndex((o, j) =>
      j > i && !done.has(j) && o.memberId === m.memberId && o.kind === m.kind &&
      o.takes === m.takes && o.slot !== m.slot
    );
    done.add(i);
    if (twin >= 0) done.add(twin);
    const field = twin >= 0 ? `side_${m.kind}` : `side_${m.kind}_${m.slot}`;
    const line = settingRecapLine({ field, previous: null, next: m.takes }, language);
    if (line === null) continue;
    lines.push({
      text: line,
      until: null,
      kind: "setting",
      who: whoOf(memberSubject(m.memberId) ?? ""),
    });
  }
  return lines;
}

/**
 * ⛔ PAR `settingRecapLine`, PAS UNE PHRASE ÉCRITE ICI. Ce module est du Deno
 * et ne connaît aucun libellé; `memory_recap` est le seul endroit qui dit un
 * champ dans les deux langues, et il tient déjà l'échelle de l'appétit.
 * `kind: "setting"`: on a déplacé un cran, on n'a pas appris quelque chose
 * d'elle — même règle que `keel-plan-feedback-v1`.
 */
function appetiteRecapLines(
  moved: readonly AppetiteMoved[],
  language: "fr" | "en",
  whoOf: (subject: string) => string | null,
): RecapKept[] {
  const lines: RecapKept[] = [];
  for (const m of moved) {
    const line = settingRecapLine(
      { field: "appetite", previous: m.previous, next: m.next },
      language,
    );
    if (line === null) continue;
    lines.push({
      text: line,
      until: null,
      kind: "setting",
      who: whoOf(memberSubject(m.move.memberId) ?? ""),
    });
  }
  return lines;
}

/**
 * LES QUESTIONS DE PART, AVEC LES PRÉNOMS. Une option dont la bouche n'a pas
 * de libellé dans le rôle TOMBE (un bouton sans mot n'est pas un bouton), et
 * une question sans option tombe avec — le journal le compte par la
 * différence `clarify_portions − questions`.
 */
/**
 * ⟳ 2026-09-23 — LA RÉSOLUTION ET LA PORTE, UNE FOIS POUR LES DEUX CHEMINS.
 *
 * La note et la réponse à « pour qui ? » écrivent par la MÊME porte, avec le
 * même référentiel et les mêmes compteurs. Ce bloc vivait dans la fonction
 * principale; le copier dans la réponse aurait DOUBLÉ chaque chaîne que
 * `draft_note_classify_test.ts` mute pour prouver le câblage — et `.replace`
 * ne mute que la première: chaque garde serait devenue verte à vide.
 */
async function resolveAndPersist(args: {
  admin: MinimalClient;
  userId: string;
  composition: CompositionIndex | null;
  classification: DraftNoteClassification;
}) {
  const { classification } = args;
  const durableResolved = resolveRetainedRefs({
    items: classification.preferences.items,
    index: args.composition,
  });
  const nextResolved = resolveRetainedRefs({
    items: classification.nextPlan.entries.map((e) => e.item),
    index: args.composition,
  });
  const nextPlanEntries = classification.nextPlan.entries.map((e, i) => ({
    ...e,
    item: nextResolved.items[i] ?? e.item,
  }));
  const refCounts = {
    askable: durableResolved.askable + nextResolved.askable,
    resolved: durableResolved.resolved + nextResolved.resolved,
    // ⚠️ LES FORMES QU'AUCUN SLUG NI ALIAS NE CONNAÎT. Mesuré: `petit suisse`
    // est une VRAIE absence des 945 lignes — et la chaîne de composition l'a
    // déjà rencontrée (`food_composition_pending_aliases` la porte). Ce
    // compteur est ce qui rend l'absence visible depuis la mémoire aussi.
    unresolved: [...new Set([...durableResolved.unresolved, ...nextResolved.unresolved])],
  };

  const write = await persistRetainedItemsFor({
    admin: args.admin,
    userId: args.userId,
    producer: DRAFT_NOTE_PRODUCER,
    source: DRAFT_NOTE_CLASSIFY_SOURCE,
    // ① — DURABLE. Depuis le lot A: « mon fils n'aime pas le poisson » n'est
    // pas pour une semaine.
    // ⛔ ④ N'EST PAS ICI, ET C'EST LA DÉCISION DU 2026-09-08. Une part ne
    // s'écrit pas dans `retained_items`: elle déplace `appetite` sur la fiche
    // de la bouche, par sa propre RPC, juste en dessous.
    durable: durableResolved.items,
    // L'ENCART — ce que la phrase date elle-même, et les envies.
    nextPlan: nextPlanEntries,
    // ③ — « ce que Sophia sait », par personne, au jour nommé.
    memo: classification.notes.lines,
  });
  return { write, durableResolved, nextResolved, nextPlanEntries, refCounts };
}

/**
 * LES LIGNES DE L'ACCUSÉ, DEPUIS CE QUI A ÉTÉ ÉCRIT. ⟳ 2026-09-23: sorties de
 * la fonction principale pour servir aussi la RÉPONSE à « pour qui ? » — la
 * même ligne sous le champ, qu'on ait écrit d'un coup ou après un tap.
 * ⛔ ON N'ANNONCE QUE CE QUI EST VRAIMENT ENTRÉ: `write.ok` et le compteur de
 * la porte, jamais la liste proposée — annoncer une part non écrite dirait
 * « j'ai noté » sur une fiche inchangée.
 */
function writtenRecapLines(
  write: { ok: boolean; durableWritten: number; memoWritten: number; nextPlanWritten: number },
  classification: DraftNoteClassification,
  whoOf: (subject: string) => string | null,
): RecapKept[] {
  const announced: RecapKept[] = [];
  if (!write.ok) return announced;
  if (write.durableWritten > 0) {
    for (const item of classification.preferences.items) {
      announced.push({
        text: item.text,
        until: null,
        kind: "preference",
        who: whoOf(item.subject),
        sense: item.kind,
      });
    }
  }
  if (write.memoWritten > 0) {
    for (const line of classification.notes.lines) {
      announced.push({
        text: line.text,
        until: null,
        kind: "note",
        who: whoOf(line.subject),
      });
    }
  }
  if (write.nextPlanWritten > 0) {
    for (const entry of classification.nextPlan.entries) {
      announced.push({
        text: entry.item.text,
        until: null,
        kind: "next_plan",
        who: whoOf(entry.item.subject),
        sense: entry.item.kind,
      });
    }
  }
  return announced;
}

/**
 * ⟳ 2026-09-23 — « POUR QUI ? » SUR UN GOÛT, UNE ENVIE OU UN MÉMO.
 *
 * Une entrée `who` devient une question quand AU MOINS UNE de ses options a
 * un prénom sur le rôle; les options sans prénom tombent (le lecteur a déjà
 * vérifié l'id, mais un bouton sans nom est un bouton qu'on ne peut pas lire).
 * Une entrée `what` ne devient jamais une question ici (voir le type).
 */
function whoQuestionsOf(
  entries: readonly DraftNoteClarifyEntry[],
  members: readonly DraftNoteMember[],
  note: string,
): DraftNoteWhoQuestion[] {
  const labelOf = new Map<string, string>();
  for (const m of members ?? []) {
    const id = String(m?.memberId ?? "").trim().toLowerCase();
    const label = String(m?.label ?? "").trim();
    if (id && label) labelOf.set(id, label);
  }
  const out: DraftNoteWhoQuestion[] = [];
  for (const e of entries) {
    if (e.about !== "who") continue;
    const options = e.options
      .map((id) => ({ memberId: id, label: labelOf.get(id) ?? "" }))
      .filter((o) => o.label !== "");
    if (options.length === 0) continue;
    out.push({
      kind: "who",
      text: e.text,
      entry: { gate: e.gate, kind: e.kind, text: e.text, note, occasion: e.occasion, force: e.force, when: e.when },
      options,
    });
  }
  return out;
}

function portionQuestionsOf(
  asked: readonly PortionQuestion[],
  members: readonly DraftNoteMember[],
): DraftNoteQuestion[] {
  const labelOf = new Map<string, string>();
  for (const m of members ?? []) {
    const id = String(m?.memberId ?? "").trim().toLowerCase();
    const label = String(m?.label ?? "").trim();
    if (id && label) labelOf.set(id, label);
  }
  const out: DraftNoteQuestion[] = [];
  for (const q of asked) {
    const options = q.options
      .map((id) => ({ memberId: id, label: labelOf.get(id) ?? "" }))
      .filter((o) => o.label !== "");
    if (options.length === 0) continue;
    out.push({ kind: "portion", text: q.text, direction: q.direction, options });
  }
  return out;
}

export type DraftNoteAnswerReason =
  | "moved"
  | "at_edge"
  | "failed"
  | "unknown_member"
  /** ⟳ 2026-09-23 — la réponse à « pour qui ? » sur une entrée: écrite. */
  | "written"
  /** Le morceau revenu avec le tap n'a pas passé le lecteur (jeton, famille, texte). */
  | "refused";

/**
 * ⟳ 2026-09-23 — LA RÉPONSE À « POUR QUI ? » SUR UN GOÛT, UNE ENVIE OU UN MÉMO.
 *
 * Le morceau est revenu avec la bouche choisie. On ne rappelle pas le modèle:
 * la phrase a déjà été lue. On REBÂTIT la ligne telle que le modèle l'aurait
 * écrite dans son tiroir, et on la passe par LE MÊME LECTEUR que la note
 * (`readDraftNoteClassification`): famille permise, jeton de moment et de
 * force, bouche sur le rôle, plafond — les mêmes refus, comptés pareil. Puis
 * la même porte d'écriture (`persistRetainedItemsFor`, référentiel compris)
 * et la même bulle. ⛔ Rien de ce qui revient du client n'est cru: un `kind`
 * interdit, un moment inventé, une bouche hors rôle rendent `refused`, et
 * rien n'est écrit.
 */
export async function answerDraftNoteWho(args: {
  admin: MinimalClient;
  userId: string;
  members: readonly DraftNoteMember[];
  contentLocale: string;
  composition: CompositionIndex | null;
  today: string;
  targetWeek: string;
  memberId: string;
  entry: DraftNotePendingEntry;
  requestId?: string;
  now?: string;
}): Promise<{
  ok: boolean;
  reason: DraftNoteAnswerReason;
  announced: readonly RecapKept[];
  notice: { delivered: boolean; reason: string };
}> {
  const userId = String(args.userId ?? "").trim();
  const language: "fr" | "en" = /^fr/i.test(String(args.contentLocale ?? "")) ? "fr" : "en";
  const memberId = String(args.memberId ?? "").trim().toLowerCase();
  const known = (args.members ?? []).find((m) =>
    String(m?.memberId ?? "").trim().toLowerCase() === memberId
  );
  const NO_NOTICE = { delivered: false, reason: "not_attempted" } as const;
  const gate = String(args.entry?.gate ?? "");
  const done = (
    reason: DraftNoteAnswerReason,
    announced: readonly RecapKept[],
    notice: { delivered: boolean; reason: string },
    counters: Record<string, unknown>,
  ) => {
    (reason === "written" ? console.info : console.warn)(
      JSON.stringify({
        tag: "keel/draft_note_answer",
        event: reason,
        user_id: userId,
        request_id: args.requestId ?? null,
        about: "who",
        gate,
        kind: args.entry?.kind ?? null,
        member_known: known !== undefined,
        announced: announced.length,
        notice_delivered: notice.delivered,
        notice_reason: notice.reason,
        ...counters,
      }),
    );
    return { ok: reason === "written", reason, announced, notice };
  };
  if (!userId || !known) return done("unknown_member", [], NO_NOTICE, {});
  if (gate !== "preferences" && gate !== "next_plan" && gate !== "notes") {
    return done("refused", [], NO_NOTICE, { refusal: "bad_gate" });
  }
  const text = String(args.entry?.text ?? "").trim();

  // ── LA LIGNE, TELLE QUE LE MODÈLE L'AURAIT ÉCRITE DANS SON TIROIR ────────
  const row: Record<string, unknown> = gate === "notes"
    ? { text, member_id: memberId, when: args.entry.when }
    : { kind: args.entry.kind, text, member_id: memberId, occasion: args.entry.occasion, force: args.entry.force };
  const outcome = readDraftNoteClassification({
    raw: {
      preferences: gate === "preferences" ? [row] : [],
      next_plan: gate === "next_plan" ? [row] : [],
      notes: gate === "notes" ? [row] : [],
      portions: [],
      settings: [],
      slots: [],
      cells: [],
      skipped: [],
      clarify: [],
      safety: [],
    },
    today: args.today,
    targetWeek: args.targetWeek,
    members: args.members,
    // La phrase entière est la `quote`; sa longueur borne `text`, comme à la lecture.
    note: String(args.entry?.note ?? "").trim() || text,
    writtenAt: null,
    planFoods: [],
  });
  const classification = outcome.classification;
  const kept = classification.preferences.items.length +
    classification.nextPlan.entries.length +
    classification.notes.lines.length;
  if (!outcome.ok || kept !== 1) {
    return done("refused", [], NO_NOTICE, {
      refusal: outcome.refusal ?? "not_kept",
      proposed: classification.proposed,
      kept,
      refused: classification.refused.total,
    });
  }

  // ── LA MÊME PORTE QUE LA NOTE: référentiel, écriture, accusé ─────────────
  const { write, durableResolved, nextResolved, nextPlanEntries } = await resolveAndPersist({
    admin: args.admin,
    userId,
    composition: args.composition,
    classification,
  });
  const whoOf = (subject: string): string | null => {
    const id = subject.startsWith("member:") ? subject.slice(7) : "";
    if (!id) return null;
    const found = (args.members ?? []).find((m) => String(m?.memberId ?? "").trim().toLowerCase() === id);
    const label = String(found?.label ?? "").trim();
    return label || null;
  };
  const announced = writtenRecapLines(
    write,
    {
      ...classification,
      preferences: { ...classification.preferences, items: durableResolved.items },
      nextPlan: { ...classification.nextPlan, entries: nextPlanEntries },
    },
    whoOf,
  );
  const counters = {
    write_ok: write.ok,
    write_reason: write.reason,
    durable_written: write.durableWritten,
    next_plan_written: write.nextPlanWritten,
    memo_written: write.memoWritten,
    ref_askable: durableResolved.askable + nextResolved.askable,
    ref_resolved: durableResolved.resolved + nextResolved.resolved,
  };
  if (!write.ok || announced.length === 0) return done("failed", [], NO_NOTICE, counters);
  const notice = await notifyMemoryWrite(args.admin as never, {
    userId,
    kept: announced,
    safety: [],
    language,
    requestId: args.requestId,
    now: args.now ? new Date(args.now) : undefined,
  });
  return done("written", announced, notice, counters);
}

/**
 * ⟳ 2026-09-08 (lot 4) — LA RÉPONSE À « C'EST POUR QUI ? » SUR UNE PART.
 *
 * Un tap = UN cran d'appétit sur la bouche choisie, par le MÊME chemin que le
 * tiroir 4 (`moveAppetites`), dit par les MÊMES lignes (`appetiteRecapLines`)
 * et la même bulle de chat. Ce module ne rappelle pas le modèle: la phrase a
 * déjà été lue, il ne manquait que la bouche.
 *
 * ⛔ LA BOUCHE EST REVÉRIFIÉE CONTRE LE RÔLE, ici et pas seulement à la
 * question: entre les deux, la réponse a traversé un navigateur. Un id hors
 * rôle rend `unknown_member` et n'atteint pas la RPC — qui le refuserait
 * aussi (`not_a_member`), mais sans le dire de cette façon-là.
 */
export async function answerDraftNotePortion(args: {
  admin: MinimalClient;
  userId: string;
  members: readonly DraftNoteMember[];
  contentLocale: string;
  move: PortionMove;
  requestId?: string;
  now?: string;
}): Promise<{
  ok: boolean;
  reason: DraftNoteAnswerReason;
  announced: readonly RecapKept[];
  notice: { delivered: boolean; reason: string };
}> {
  const userId = String(args.userId ?? "").trim();
  const language: "fr" | "en" = /^fr/i.test(String(args.contentLocale ?? "")) ? "fr" : "en";
  const memberId = String(args.move?.memberId ?? "").trim().toLowerCase();
  const known = (args.members ?? []).find((m) =>
    String(m?.memberId ?? "").trim().toLowerCase() === memberId
  );
  const NO_NOTICE = { delivered: false, reason: "not_attempted" } as const;
  const done = (
    reason: DraftNoteAnswerReason,
    announced: readonly RecapKept[],
    notice: { delivered: boolean; reason: string },
    counters: Record<string, number>,
  ) => {
    (reason === "moved" || reason === "at_edge" ? console.info : console.warn)(
      JSON.stringify({
        tag: "keel/draft_note_answer",
        event: reason,
        user_id: userId,
        request_id: args.requestId ?? null,
        member_known: known !== undefined,
        direction: args.move?.direction ?? null,
        announced: announced.length,
        notice_delivered: notice.delivered,
        notice_reason: notice.reason,
        ...counters,
      }),
    );
    return { ok: reason === "moved", reason, announced, notice };
  };
  if (!userId || !known) return done("unknown_member", [], NO_NOTICE, {});

  const { counters, moved } = await moveAppetites(args.admin, userId, [
    { memberId, direction: args.move.direction },
  ]);
  const whoOf = (subject: string): string | null => {
    const id = subject.startsWith("member:") ? subject.slice(7) : "";
    if (!id) return null;
    const found = (args.members ?? []).find((m) =>
      String(m?.memberId ?? "").trim().toLowerCase() === id
    );
    const label = String(found?.label ?? "").trim();
    return label || null;
  };
  const announced = appetiteRecapLines(moved, language, whoOf);
  const reason: DraftNoteAnswerReason = counters.moved > 0
    ? "moved"
    : counters.at_edge > 0
    ? "at_edge"
    : "failed";
  const notice = announced.length === 0 ? NO_NOTICE : await notifyMemoryWrite(args.admin as never, {
    userId,
    kept: announced,
    safety: [],
    language,
    requestId: args.requestId,
    now: args.now ? new Date(args.now) : undefined,
  });
  return done(reason, announced, notice, {
    portions_asked: counters.asked,
    portions_moved: counters.moved,
    portions_at_edge: counters.at_edge,
    portions_failed: counters.failed,
  });
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
