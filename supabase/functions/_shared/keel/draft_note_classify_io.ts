/**
 * LE RETOUR SUR LE BROUILLON — L'APPEL, ET L'ÉCRITURE. Lot 2B, moitié I/O.
 *
 * Le prompt et la relecture sont dans `draft_note_classify.ts` (module PUR).
 * Ce fichier-ci fait exactement trois choses, dans cet ordre: il appelle le
 * modèle de COMPOSITION, il relit, il passe par la porte serveur. Il n'invente
 * aucune règle: la matrice est dans `retained_item.ts`, le magasin dans
 * `retained_next_plan.ts`, l'écriture dans `retained_items_io.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LE MODÈLE EST `keelGenerationModel()`, ET C'EST PROUVÉ PAR UN TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * Cicatrice chiffrée de ce dépôt: le générateur de foyer **importait**
 * `keelGenerationModel` et composait quand même avec le modèle du chat — toute
 * latence mesurée sur cette lane était fausse. « Je l'ai importé » ne prouve
 * rien.
 *
 * D'où la forme ci-dessous: `keelGenerationModel()` est appelé **une fois, hors
 * de toute branche**, et la valeur voyage dans `meta.model` ET dans le résultat
 * rendu (`DraftNoteClassifyResult.model`). Le test la lit des deux côtés, y
 * compris sur le chemin injecté — un runner de test ne peut donc pas masquer un
 * modèle qui aurait été choisi ailleurs.
 *
 * `forceInitialModel: true` finit le travail: sans lui, la politique de
 * `gemini.ts` peut remplacer le modèle de la première tentative, et `meta.model`
 * ne serait qu'un souhait.
 *
 * ── ⚠️ ET BRANCHER LE BON MODÈLE NE SUFFIT PAS ────────────────────────────
 * Le même identifiant a été **mesuré en timeout à 4 minutes** sur le prompt du
 * foyer, retombant en `546`. Ce prompt-ci n'est pas celui-là: une note de 280
 * signes au maximum, une liste fermée de six familles, aucune composition. Mais
 * on ne PARIE pas là-dessus:
 *
 *   · `httpTimeoutMs` est court et NOMMÉ (voir la constante). Cette
 *     classification tourne APRÈS l'écriture du plan, dans la même requête,
 *     pendant que la personne attend sa réponse: une seconde de plus ici est
 *     une seconde de plus avant de voir son plan;
 *   · l'échec a un motif NOMMÉ ET COMPTÉ — `model_unavailable`. ⛔ Jamais un
 *     `catch {}` muet: un repli silencieux rendrait un lot débranché
 *     indiscernable d'un lot qui marche, et c'est la cicatrice que ce chantier
 *     paie en boucle;
 *   · la chaîne de repli de `gemini.ts` reste ARMÉE (`disableFallbackChain`
 *     n'est pas posé). Perdre une ligne de carte est acceptable; la perdre
 *     alors qu'un autre modèle aurait répondu ne l'est pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE TEXTE QUI ENTRE ICI EST DÉJÀ GARDÉ — ET LE TYPE LE FORCE
 * ═══════════════════════════════════════════════════════════════════════════
 * L'argument n'est pas une `string`: c'est un `DraftNoteVerdict`, que SEUL
 * `readDraftNote` produit. Un appelant ne peut donc pas nous tendre le
 * `body.draft_note` brut.
 *
 * Ce n'est pas de la coquetterie de typage. La note part dans un SECOND appel
 * modèle; lui passer le texte brut rouvrirait exactement le trou que
 * `plan_draft_note.ts` ferme — cible chiffrée, interdit de doctrine, plancher
 * TCA, consigne au modèle. Et ⛔ on ne rejoue PAS la garde ici: « une garde en
 * double est la cicatrice la plus chère de ce dépôt », les deux moitiés
 * divergent et c'est celle qu'on regarde le moins qui décide. On exige la
 * PREUVE que la garde est passée, on ne la refait pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE MODULE N'ÉCHOUE JAMAIS VERS SON APPELANT
 * ═══════════════════════════════════════════════════════════════════════════
 * Il rend un `DraftNoteClassifyResult`, jamais une exception. Posture de
 * `food_preference_promotion_io.ts` et de `retained_items_io.ts` mot pour mot,
 * et l'inverse de celle des allergies (`safety_constraints.ts`, qui THROW): le
 * plan est DÉJÀ écrit quand on arrive ici. **Personne ne perd son dîner parce
 * qu'une envie n'a pas été rangée.** Mais l'échec est DICIBLE: `ok: false`
 * porte toujours un `reason`, et les trois nombres sortent dans tous les cas.
 */

import {
  type DraftNoteClassification,
  type DraftNoteMember,
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  DRAFT_NOTE_PRODUCER,
  buildDraftNoteClassifyPrompt,
  draftNoteClassifyTrace,
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
// de plan EST une allergie: elle part dans une table qui a sa ceinture, et non
// dans un `food.exclude` qui expire le dimanche.
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
 * `producer`.
 *
 * ⚠️ `producer` est le JETON de la liste fermée qui arme `canProduce`; `source`
 * est une chaîne libre qui n'arme rien et sert au journal. Les confondre ferait
 * dépendre une règle de sécurité du nom d'une fonction (contrat §8 point 1).
 */
export const DRAFT_NOTE_CLASSIFY_SOURCE = "keel-draft-note-classify";

/**
 * LE PLAFOND DE TEMPS DE L'APPEL, ET IL EST COURT EXPRÈS.
 *
 * Cette classification tourne **après** l'écriture du plan, **dans la même
 * requête**, pendant que la personne attend une réponse qui a déjà coûté 100 à
 * 200 secondes de composition (mesuré). Le prompt est minuscule — une note
 * plafonnée à 280 signes, six familles, pas de composition — et un appel qui
 * s'éterniserait ici ne rangerait pas mieux: il retarderait un plan déjà écrit.
 *
 * ⚠️ NON EXPORTÉ COMME BORNE DE TEST. Le test épingle la constante à son
 * littéral, il ne s'en sert pas pour calculer ce qu'il attend (« un test
 * paramétré par sa propre constante reste vert quand on change la constante »).
 */
export const DRAFT_NOTE_CLASSIFY_TIMEOUT_MS = 25_000;

// ===========================================================================
// CE QUE CE MODULE REND
// ===========================================================================

/**
 * Pourquoi ça n'a pas eu lieu — ou que ça a eu lieu (`written`). Liste FERMÉE.
 *
 * Les motifs de la PORTE (`rpc_failed`, `stale_snapshot`, `store_unreadable`…)
 * ne sont pas recopiés ici: ils voyagent tels quels dans `write.reason`, et les
 * dupliquer garantirait deux listes qui divergent.
 */
export const DRAFT_NOTE_CLASSIFY_REASONS = [
  /** Tout ce qui devait entrer est entré. */
  "written",
  /** Il n'y avait pas de note utilisable: `readDraftNote` avait déjà refusé. */
  "no_note",
  /** `userId`, `admin`, jour ou semaine visée manquants. */
  "bad_args",
  /** L'appel modèle n'a pas abouti — timeout, panne, quota. COMPTÉ. */
  "model_unavailable",
  /** Le modèle a répondu autre chose que `{ items: [...] }`. */
  "unreadable_payload",
  /** `today` n'est pas un jour propre. */
  "bad_day",
  /** La semaine visée n'est pas lisible: on ne saurait pas dire quand ça meurt. */
  "bad_anchor",
  /**
   * Le modèle n'a rien trouvé à ranger, ou tout a été refusé.
   * ⚠️ Ce n'est PAS une panne: une note qui dit « merci, c'est parfait » doit
   * produire exactement ça. Les trois nombres disent laquelle des deux.
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
  /** ── LES TROIS NOMBRES, RENDUS DANS TOUS LES CAS ───────────────────────
   * Proposés par le modèle / retenus par la matrice / refusés. Sans eux, un
   * prompt que le modèle ignore et un produit calme se ressemblent trait pour
   * trait. */
  readonly proposed: number;
  readonly kept: number;
  readonly refused: number;
  /** Le détail des refus, motif par motif — dont l'échappatoire mesurée. */
  readonly classification: DraftNoteClassification;
  /**
   * ⚠️ LE MODÈLE RÉELLEMENT DEMANDÉ. Rendu, pas seulement journalisé: c'est ce
   * qui rend « `keelGenerationModel()` est-il appelé ? » vérifiable par un test
   * sans lire la source.
   */
  readonly model: string;
  /**
   * ⛔ CE QUI A ÉTÉ ÉCRIT EN SÉCURITÉ — arbitrage du 2026-09-01.
   *
   * L'arbitrage remplace le consentement synchrone par « on l'écrit, on le
   * DIT, et ça se défait ». Ce champ est ce qui rend la seconde moitié
   * LIVRABLE: sans lui, l'appelant écrirait sans avoir de quoi prévenir.
   */
  readonly safety: SafetyWriteOutcome;
  /** Ce que la porte a fait. `null` quand on ne l'a pas appelée. */
  readonly write: RetainedWriteOutcome | null;
}

/**
 * LE RUNNER DU MODÈLE — la seule couture d'injection, et elle n'est pas une
 * garde.
 *
 * Patron déjà en place dans ce dépôt (`meal_precision_intent.ts::llmRunner`).
 * ⚠️ Elle ne peut PAS servir à changer de modèle: `meta.model` est calculé
 * AVANT la branche et lui est passé tel quel. Un test qui injecte un runner
 * mesure donc le modèle que la production aurait demandé.
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
 * CLASSE LA NOTE DU BROUILLON, ET ÉCRIT CE QUI EN SORT.
 *
 * ⚠️ À APPELER **APRÈS** L'ÉCRITURE DU PLAN, et seulement sur un `intent` qui
 * écrit (`replace_current` / `prepare_next`). Sur `intent: "draft"` il n'y a
 * pas encore de plan: ranger une envie qui vise un plan que la personne peut
 * encore abandonner écrirait une mémoire pour un geste qui n'a pas eu lieu.
 *
 * @param note LE VERDICT de `readDraftNote`, pas le texte brut. Voir l'en-tête.
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`. Ce module ne lit
 *   aucune horloge: `at` doit être le jour où ELLE a écrit, dans SA journée.
 * @param targetWeek un jour de la SEMAINE VISÉE — en pratique le `starts_on` du
 *   plan qu'on vient d'écrire. L'ancre stockée en est le lundi ISO.
 *   ⚠️ CE N'EST PAS `today`: quelqu'un qui adopte le dimanche un plan qui
 *   commence lundi vise la semaine SUIVANTE, et ancrer sur le jour de la frappe
 *   ferait mourir son envie le lendemain matin.
 * @param members les bouches du foyer. **Requis**, `[]` pour un solo — `[]` dit
 *   « personne d'autre à table », `undefined` dirait « je n'ai pas su lire ».
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
  /** ⚠️ Test seulement. Ne change PAS le modèle demandé — voir le type. */
  run?: DraftNoteLlmRunner;
}): Promise<DraftNoteClassifyResult> {
  // ⛔ APPELÉ HORS DE TOUTE BRANCHE, ET AVANT TOUT REFUS. C'est ce qui rend le
  // modèle observable même sur un chemin qui n'appelle jamais le fournisseur —
  // et donc ce qui rend « le générateur a-t-il sauté `keelGenerationModel()` ? »
  // mesurable au lieu d'être affirmé.
  const model = keelGenerationModel();

  /**
   * ⛔ « RIEN ÉCRIT », PAS « RIEN À ÉCRIRE ». Les sorties d'AVANT la porte de
   * sécurité rendent ceci: `proposed: 0` y veut dire « on n'a pas regardé »,
   * et c'est ce que le compteur doit pouvoir dire.
   */
  const noSafety: SafetyWriteOutcome = {
    written: [],
    proposed: 0,
    refused: 0,
    failed: 0,
  };
  const empty: DraftNoteClassification = {
    proposed: 0,
    kept: 0,
    refused: {
      total: 0,
      unknownKind: 0,
      forbiddenKind: 0,
      forbiddenKinds: [],
      unknownMember: 0,
      badText: 0,
      malformed: 0,
    },
    nextPlan: [],
  };
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

  // ── LA NOTE, ET SEULEMENT CE QUE LA GARDE A LAISSÉ PASSER ───────────────
  // `usable` est le texte RECOLLÉ des clauses gardées. Une note dont il ne
  // reste rien vaut `null`, et il n'y a alors rien à classer — le motif du
  // refus, lui, ne sort pas d'ici: il désignerait qui est sous plancher TCA.
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
        // ⛔ LE MODÈLE DE COMPOSITION, ET FORCÉ AU PREMIER ESSAI. Sans
        //    `forceInitialModel`, la politique de `gemini.ts` peut le
        //    remplacer et `meta.model` ne serait qu'un souhait.
        model,
        forceInitialModel: true,
        // ⚠️ LA CHAÎNE DE REPLI RESTE ARMÉE. Perdre une ligne de carte est
        //    acceptable; la perdre alors qu'un autre modèle aurait répondu ne
        //    l'est pas. C'est l'inverse de l'arbitrage d'une COMPOSITION, où
        //    un repli rendrait un plan d'une autre qualité sans le dire.
        httpTimeoutMs: DRAFT_NOTE_CLASSIFY_TIMEOUT_MS,
        maxRetries: 1,
      });
  } catch (error) {
    // ⛔ PAS DE `catch {}`. Le motif est nommé, journalisé, et rendu.
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

  // `generateWithGemini` peut rendre un appel d'outil. On n'en demande aucun;
  // s'il en arrive un, ce n'est pas la forme attendue et le lecteur le dira.
  const outcome = readDraftNoteClassification({
    raw,
    today: args.today,
    targetWeek: args.targetWeek,
    members: args.members,
    note: usable,
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
  //
  // ⛔ ICI, PAS PLUS BAS. `nothing_to_file` sort dès que `nextPlan` est vide —
  // or une note qui ne dit QUE « je suis allergique aux arachides » produit
  // exactement ça: zéro item, une déclaration de sécurité. La placer après
  // aurait rendu le canal muet sur son cas le plus important.
  //
  // ⚠️ LES DEUX LISTES SONT DISJOINTES: `items` d'un côté, `safety` de
  // l'autre. Un échec de l'une ne doit rien à l'autre.
  const safety = await persistSafetyDeclarations({
    admin: args.admin,
    userId,
    raw: safetyOf(raw),
    memberIds: (args.members ?? []).map((m) => m.memberId),
    contentLocale: args.contentLocale,
    // ⚠️ LA TRAÇABILITÉ REMONTE À LA REQUÊTE, faute de message: ce canal n'est
    // pas conversationnel. `source_message_id` reste rempli — une contrainte
    // médicale sans origine ne se conteste pas.
    sourceMessageId: String(args.requestId ?? ""),
  });
  if (safety.proposed > 0 || safety.failed > 0) {
    // ⚠️ SA PROPRE LIGNE, ET ELLE NE PORTE NI `ref` NI TEXTE. Un journal n'est
    // pas l'endroit où recopier ce que quelqu'un a écrit sur sa santé.
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

  if (classification.nextPlan.length === 0) {
    // ⚠️ CE N'EST PAS UNE PANNE, ET LES TROIS NOMBRES LE DISENT.
    // `proposed: 0` = le modèle n'a rien vu à ranger (la bonne réponse sur
    // « merci, c'est parfait »). `proposed > 0, kept: 0` = la matrice a tout
    // refusé, et `refused_forbidden_kind` dit si c'est l'échappatoire mesurée.
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

  // ── LA PORTE. ⛔ ON NE LA CONTOURNE PAS ─────────────────────────────────
  // C'est elle qui fusionne, qui recopie les lignes stockées VERBATIM (un port
  // d'écriture n'est pas un ramasse-miettes) et qui tient le témoin de
  // concurrence. Écrire `practical_constraints` autrement effacerait le
  // magasin durable écrit une seconde plus tôt par l'autre bout du produit.
  //
  // ⛔ `producer: DRAFT_NOTE_PRODUCER`, ET JAMAIS `"written"`. `written` rend
  // `true` pour les huit familles: se déclarer ainsi contournerait la matrice
  // ENTIÈRE par un seul mot, et la carte afficherait « tu l'as écrit ».
  const write = await persistRetainedItemsFor({
    admin: args.admin,
    userId,
    producer: DRAFT_NOTE_PRODUCER,
    source: DRAFT_NOTE_CLASSIFY_SOURCE,
    // ⚠️ AUCUN `durable`. `defaultScopeFor("draft_note", …)` rend `next_plan`
    // pour les six familles autorisées: ce producteur ne touche jamais le
    // magasin durable, et ne pas passer la clé, c'est ne pas y toucher du tout.
    nextPlan: classification.nextPlan,
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
  // UNE SEULE LIGNE, ET ELLE PORTE LES TROIS NOMBRES AVEC LE MODÈLE.
  (result.ok ? console.info : console.warn)(JSON.stringify({
    tag: "keel/draft_note_classify",
    event: result.reason,
    user_id: userId,
    model,
    ...trace,
    write_reason: write.reason,
    next_plan_written: write.nextPlanWritten,
    next_plan_stored: write.nextPlanStored,
    write_refused: write.refused.total,
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
