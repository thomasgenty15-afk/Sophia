/**
 * LA QUESTION QUI NE BLOQUE PAS, ET LA BULLE QUI DIT CE QU'ON A ÉCRIT.
 *
 * Autorité produit: docs/keel/NOMENCLATURE-MEMOIRE.md §2.2, §2.3, §2.8.
 *
 * ── POURQUOI CES DEUX CHOSES SONT DANS LE MÊME MODULE ─────────────────────
 * Elles sont les deux moitiés d'un seul geste. La personne écrit une note; on
 * range ce qu'on a compris (et on le DIT), et on demande ce qu'on n'a pas
 * compris (une fois). Les séparer aurait mis du code de chat dans les TROIS
 * sites d'appel du classifieur — deux générateurs et le bilan — alors qu'aucun
 * des trois n'a jamais eu à connaître le chat.
 *
 * ── L'ORDRE, ET IL N'EST PAS COMMUTATIF ───────────────────────────────────
 *   1. on écrit,
 *   2. on annonce ce qui est écrit,
 *   3. on demande ce qui manque.
 *
 * ⚠️ LA QUESTION EN DERNIER, ET C'EST UNE CONTRAINTE DU CHAT, PAS UN GOÛT. Le
 * front n'arme les boutons que sur la DERNIÈRE bulle qui en porte
 * (`lastAssistantId`), et le serveur juge la fraîcheur de la même façon
 * (`judgeTapFreshness`). Une notification envoyée APRÈS la question la
 * désarmerait — la personne verrait une question intapable.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
 * Il n'écrit RIEN dans la mémoire. La notification décrit une écriture déjà
 * faite; la question ouvre une ligne qui n'écrira que si quelqu'un tape. Le
 * tap, lui, vit dans `_shared/chat/memory_clarification_tap.ts`.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  countDailyAsksOfKind,
  MEMORY_CLARIFICATION_DAILY_CAP,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import { deliverChatMessage } from "../chat/delivery.ts";
import {
  type ClarificationAbout,
  type ClarificationLanguage,
  clarificationEscapeLabel,
  clarificationOptionLabel,
  clarificationViewLabel,
  MEMORY_CLARIFICATION_ABOUTS,
  memoryClarificationNoneId,
  memoryClarificationPickId,
  MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX,
  type PendingClarification,
  renderClarificationQuestion,
} from "./memory_clarification.ts";
import {
  buildMemoryRecap,
  buildSafetyNotWrittenNotice,
  type RecapKept,
  type RecapSafety,
} from "./memory_recap.ts";
import type { DraftNoteClarifyEntry, DraftNoteMember } from "./draft_note_classify.ts";

/** La table. Le nom vit ici et dans sa migration, nulle part ailleurs. */
export const MEMORY_CLARIFICATION_TABLE = "memory_clarifications";

/** 48 h. Voir `askClarification` — ce n'est PAS ce qui la désarme. */
export const MEMORY_CLARIFICATION_OPEN_FOR_HOURS = 48;

export const MEMORY_CLARIFICATION_PURPOSE = "keel_memory_clarification";
export const MEMORY_WRITTEN_PURPOSE = "keel_memory_written";
/** ⟳ 2026-09-05 — la bulle qui dit qu'une ligne de SÉCURITÉ n'a PAS été écrite. */
export const MEMORY_SAFETY_NOT_WRITTEN_PURPOSE = "keel_memory_safety_not_written";

/** Le bloc de la carte que « Voir » ouvre, selon ce qui vient d'être écrit. */
const BLOCK_OF: Record<RecapKept["kind"], string> = {
  preference: "preferences",
  note: "notes",
  next_plan: "next_plan",
  setting: "settings",
};

/**
 * POURQUOI UNE QUESTION N'EST PAS PARTIE. Liste FERMÉE — un motif inventé au
 * moment du journal est un motif que personne ne cherchera jamais.
 */
export const MEMORY_CLARIFICATION_ASK_REASONS = [
  "asked",
  "bad_args",
  "no_labels",
  "daily_cap",
  "insert_failed",
  "ask_record_failed",
  "delivery_refused",
] as const;
export type MemoryClarificationAskReason =
  (typeof MEMORY_CLARIFICATION_ASK_REASONS)[number];

export interface AskClarificationResult {
  readonly asked: boolean;
  readonly reason: MemoryClarificationAskReason;
  readonly id: string | null;
}

export interface NotifyMemoryWriteResult {
  readonly delivered: boolean;
  readonly reason: string;
}

/** Ce que ce module a besoin de faire, et rien de plus. */
type MinimalClient = SupabaseClient;

function log(event: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "keel.memory_clarification", event, ...extra }));
}

// ===========================================================================
// 1. « J'ai noté pour Tom : … » — la moitié « on le dit »
// ===========================================================================

/**
 * ANNONCE CE QUI VIENT D'ÊTRE ÉCRIT, avec un bouton qui ouvre la carte.
 *
 * ── POURQUOI AU MOMENT DU GESTE, ET PLUS LE SOIR ──────────────────────────
 * Cette annonce vivait dans le récap du pouls, à 20 h. Elle y était née pour
 * une allergie déclarée dans un retour de plan, et le soir était l'appel qui
 * existait déjà. Mais la personne vient de faire le geste: dire « j'ai noté
 * pour Tom : pas de poisson » tout de suite rend le lien évident entre ce
 * qu'elle a écrit et ce qui a été retenu. Six heures plus tard, il ne l'est
 * plus — et elle a fermé l'écran.
 *
 * ⚠️ `isReply: true`, ET C'EST LA DOCTRINE DU DÉPÔT, PAS UNE FAVEUR. Cette
 * bulle répond à un geste que la personne vient de faire, comme l'accusé d'un
 * tap. `decideChatDelivery` laisse donc passer avant le mute et hors plafonds:
 * « couper la réponse à quelqu'un qui écrit, c'est le punir d'avoir demandé le
 * silence ».
 *
 * ⛔ UN BOUTON « VOIR », JAMAIS UN « ANNULER ». Un second endroit qui écrit
 * dans la mémoire, c'est un second endroit où se tromper — et la carte sait
 * déjà modifier et enlever, avec la concurrence gérée. Le chat DIT, l'écran
 * FAIT.
 */
export async function notifyMemoryWrite(
  admin: MinimalClient,
  args: {
    userId: string;
    kept: readonly RecapKept[];
    language: ClarificationLanguage;
    requestId?: string;
    now?: Date;
  },
): Promise<NotifyMemoryWriteResult> {
  const kept = (args.kept ?? []).filter((k) =>
    String(k?.text ?? "").trim() !== ""
  );
  if (kept.length === 0) return { delivered: false, reason: "nothing_written" };

  // ⚠️ LE MÊME RENDU QUE LE RÉCAP DU SOIR. Il sait déjà nommer la destination
  // et la bouche, dans les deux langues. Un second rendu dirait la même chose
  // avec d'autres mots, et les deux divergeraient au premier ajout.
  const body = buildMemoryRecap({ safety: [], kept, language: args.language });
  if (!body) return { delivered: false, reason: "nothing_to_say" };

  const block = BLOCK_OF[kept[0].kind] ?? "preferences";

  // ⛔ CE MODULE NE LÈVE JAMAIS, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE.
  // Il est appelé APRÈS que le plan et la mémoire sont écrits. Une panne du
  // canal de chat — une table indisponible, un plafond mal lu — ferait alors
  // échouer une requête dont tout le travail est déjà fait, et la personne
  // verrait « ça n'a pas marché » sur un plan qui existe. Le silence d'une
  // bulle est un défaut; perdre la réponse en est un autre, plus cher.
  try {
    const delivered = await deliverChatMessage(admin, {
      userId: args.userId,
      content: body,
      purpose: MEMORY_WRITTEN_PURPOSE,
      isReply: true,
      buttons: [{
        payload: `${MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX}${block}`,
        label: clarificationViewLabel(args.language),
      }],
      // ⟳ 2026-09-05 — LES TEXTES ÉCRITS voyagent avec le bouton « Voir »: la
      // bulle les remet dans l'adresse de la carte (`line=`), qui allume ces
      // lignes-là et plus toutes celles du jour. Le texte est l'identité,
      // faute d'un identifiant de ligne en base.
      metadata: {
        keel_memory_written: kept.length,
        keel_memory_lines: kept.map((k) => k.text),
      },
      requestId: args.requestId,
      now: args.now,
    });
    log(delivered.delivered ? "notice_sent" : "notice_not_delivered", {
      user_id: args.userId,
      lines: kept.length,
      reason: delivered.reason,
    });
    return { delivered: delivered.delivered, reason: delivered.reason };
  } catch (error) {
    log("notice_failed", {
      user_id: args.userId,
      lines: kept.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { delivered: false, reason: "notice_failed" };
  }
}

/**
 * ⟳ 2026-09-05 — « JE N'AI PAS PU ENREGISTRER … » — l'échec se dit.
 *
 * Même doctrine que `notifyMemoryWrite` (une réponse au geste, `isReply`,
 * jamais une exception), avec l'inverse pour contenu: ce qui n'a PAS été
 * écrit. Sans bouton: la réparation se fait depuis la page du foyer, que la
 * phrase nomme.
 */
export async function notifySafetyNotWritten(
  admin: MinimalClient,
  args: {
    userId: string;
    failed: readonly RecapSafety[];
    language: ClarificationLanguage;
    requestId?: string;
    now?: Date;
  },
): Promise<NotifyMemoryWriteResult> {
  const body = buildSafetyNotWrittenNotice({
    failed: args.failed,
    language: args.language,
  });
  if (!body) return { delivered: false, reason: "nothing_to_say" };
  try {
    const delivered = await deliverChatMessage(admin, {
      userId: args.userId,
      content: body,
      purpose: MEMORY_SAFETY_NOT_WRITTEN_PURPOSE,
      isReply: true,
      buttons: [],
      metadata: { keel_memory_safety_not_written: args.failed.length },
      requestId: args.requestId,
      now: args.now,
    });
    log(delivered.delivered ? "not_written_notice_sent" : "not_written_notice_not_delivered", {
      user_id: args.userId,
      lines: args.failed.length,
      reason: delivered.reason,
    });
    return { delivered: delivered.delivered, reason: delivered.reason };
  } catch (error) {
    log("not_written_notice_failed", {
      user_id: args.userId,
      lines: args.failed.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { delivered: false, reason: "notice_failed" };
  }
}

// ===========================================================================
// 2. « C'est pour qui ? » — la moitié « on demande »
// ===========================================================================

/**
 * OUVRE UNE QUESTION, DANS L'ORDRE QUI SURVIT À UNE PANNE.
 *
 * L'ordre est copié de `runWeightDivergenceStep`, et chaque étape est un refus
 * NOMMÉ:
 *
 *   1. les périmées de cette personne sont closes — elles libèrent la place;
 *   2. une question ouverte est close `expired`: **la note la plus récente
 *      gagne**, parce que le chat ne montre de toute façon les boutons que sur
 *      la dernière bulle armée. Deux questions ouvertes seraient une question
 *      intapable et une ligne qui ne se fermerait jamais;
 *   3. le plafond du jour LOCAL;
 *   4. les libellés — un identifiant sans prénom fait renoncer: un bouton vide
 *      est pire que pas de question;
 *   5. la ligne, AVANT le budget et AVANT la livraison. Une ligne sans message
 *      se voit (`undelivered`); un message sans ligne serait une question dont
 *      le tap ne trouve rien;
 *   6. le budget, AVANT la livraison. L'inverse enverrait une question qu'on
 *      n'a pas le droit d'envoyer;
 *   7. la livraison. Refusée ⇒ la ligne est close `undelivered`: personne ne
 *      doit pouvoir taper une question que personne n'a lue.
 *
 * ⚠️ CE MODULE NE LÈVE JAMAIS. Il est appelé après l'écriture d'un plan; une
 * exception ici ferait échouer une requête dont tout le travail est déjà fait.
 */
export async function askClarification(
  admin: MinimalClient,
  args: {
    userId: string;
    source: "draft_note" | "plan_feedback";
    entry: DraftNoteClarifyEntry;
    note: string;
    /** Le jour LOCAL de la personne — l'unité du plafond, et le `at` de la ligne. */
    today: string;
    /** Le lundi ISO visé, pour une entrée d'encart. */
    anchor: string;
    members: readonly DraftNoteMember[];
    language: ClarificationLanguage;
    contentLocale: string;
    requestId?: string;
    now?: Date;
  },
): Promise<AskClarificationResult> {
  const userId = String(args.userId ?? "").trim();
  const entry = args.entry;
  if (!userId || !entry || entry.options.length === 0) {
    return { asked: false, reason: "bad_args", id: null };
  }
  const now = args.now ?? new Date();

  try {
    // ── 1 & 2 · LA PLACE EST LIBÉRÉE AVANT D'ÊTRE PRISE ──────────────────
    await closeStaleClarifications(admin, { userId, nowIso: now.toISOString() });

    // ── 3 · LE PLAFOND DU JOUR LOCAL ─────────────────────────────────────
    const asks = await countDailyAsksOfKind(admin, {
      userId,
      localDate: args.today,
      kind: "memory_clarification",
      capOnFailure: MEMORY_CLARIFICATION_DAILY_CAP,
    });
    if (asks.count >= MEMORY_CLARIFICATION_DAILY_CAP) {
      log("not_asked", {
        user_id: userId,
        reason: "daily_cap",
        asks: asks.count,
        count_reason: asks.reason,
      });
      return { asked: false, reason: "daily_cap", id: null };
    }

    // ── 4 · LES LIBELLÉS ─────────────────────────────────────────────────
    // ⛔ UN BOUTON SANS MOT N'EST PAS UN BOUTON. Sur un `who`, le libellé est
    // le prénom du rôle: si un identifiant proposé n'y est plus (une bouche
    // retirée entre la composition et ici), on renonce plutôt que d'afficher
    // un bouton muet que la personne taperait au hasard.
    const labels: string[] = [];
    for (const option of entry.options) {
      if (entry.about === "scope") {
        // ⟳ 2026-09-05 — les deux jetons de portée ont leur mot dans la
        // langue de la personne; un jeton inconnu fait renoncer, comme un
        // prénom absent.
        const label = clarificationOptionLabel("scope", option, args.language);
        if (!label) {
          log("not_asked", { user_id: userId, reason: "no_labels", option });
          return { asked: false, reason: "no_labels", id: null };
        }
        labels.push(label);
        continue;
      }
      if (entry.about === "who") {
        const found = (args.members ?? []).find((m) =>
          String(m?.memberId ?? "").trim().toLowerCase() === option
        );
        const label = String(found?.label ?? "").trim();
        if (!label) {
          log("not_asked", { user_id: userId, reason: "no_labels", option });
          return { asked: false, reason: "no_labels", id: null };
        }
        labels.push(label);
      } else {
        labels.push(option);
      }
    }

    // ── 5 · LA LIGNE ─────────────────────────────────────────────────────
    const pending: PendingClarification = {
      about: entry.about,
      gate: entry.gate,
      kind: entry.kind,
      text: entry.text,
      subject: entry.subject,
      when: entry.when,
      note: String(args.note ?? "").trim(),
      at: args.today,
      anchor: args.anchor,
      // ⟳ 2026-09-05 — la déclaration EN ATTENTE d'une question de portée.
      // Elle n'est écrite nulle part ailleurs tant que la personne n'a pas
      // répondu « toujours »; c'est cette ligne qui la porte jusque-là.
      safety: entry.about === "scope" ? entry.safety ?? null : null,
    };
    const expiresAt = new Date(
      now.getTime() + MEMORY_CLARIFICATION_OPEN_FOR_HOURS * 3600_000,
    ).toISOString();

    const inserted = await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .insert({
        user_id: userId,
        source: args.source,
        about: entry.about,
        pending,
        options: entry.options,
        status: "open",
        content_locale: args.contentLocale,
        asked_local_date: args.today,
        expires_at: expiresAt,
      })
      .select("id")
      .maybeSingle();
    const rowId = String(
      (inserted?.data as { id?: unknown } | null)?.id ?? "",
    ).trim();
    if (inserted?.error || !rowId) {
      log("not_asked", {
        user_id: userId,
        reason: "insert_failed",
        error: String(inserted?.error?.message ?? "no id"),
      });
      return { asked: false, reason: "insert_failed", id: null };
    }

    const question = renderClarificationQuestion({
      about: entry.about,
      text: entry.text,
      language: args.language,
    });

    // ── 6 · LE BUDGET, AVANT LA LIVRAISON ────────────────────────────────
    const recorded = await recordDailyAsk(admin, {
      userId,
      localDate: args.today,
      kind: "memory_clarification",
      source: "chat",
      // ⛔ `null` — le CHECK conditionnel en base refuse un axe sur tout autre
      // genre qu'une question de précision, et il a raison: un axe ici serait
      // une valeur inventée.
      axis: null,
      text: question,
      protocolEventId: null,
      askedForMessageId: `memclar:${rowId}`,
    });
    if (!recorded.ok) {
      await closeClarification(admin, {
        id: rowId,
        userId,
        status: "undelivered",
        nowIso: now.toISOString(),
      });
      log("not_asked", { user_id: userId, reason: "ask_record_failed", id: rowId });
      return { asked: false, reason: "ask_record_failed", id: rowId };
    }

    // ── 7 · LA LIVRAISON ─────────────────────────────────────────────────
    const buttons = labels.map((label, index) => ({
      payload: memoryClarificationPickId(rowId, index),
      label,
    }));
    buttons.push({
      // ⛔ L'ÉCHAPPATOIRE EST UN BOUTON, PAS UN SILENCE. Sans elle, « aucun des
      // deux » n'a d'autre expression que d'ignorer la question — et on ne peut
      // pas distinguer « ce n'est ni l'une ni l'autre » de « je n'ai pas vu ».
      payload: memoryClarificationNoneId(rowId),
      label: clarificationEscapeLabel(entry.about, args.language),
    });

    const delivered = await deliverChatMessage(admin, {
      userId,
      content: question,
      purpose: MEMORY_CLARIFICATION_PURPOSE,
      isReply: true,
      buttons,
      metadata: { keel_memory_clarification_id: rowId },
      requestId: args.requestId,
      now,
    });
    if (!delivered.delivered) {
      await closeClarification(admin, {
        id: rowId,
        userId,
        status: "undelivered",
        nowIso: now.toISOString(),
      });
      log("not_asked", {
        user_id: userId,
        reason: "delivery_refused",
        delivery_reason: delivered.reason,
        id: rowId,
      });
      return { asked: false, reason: "delivery_refused", id: rowId };
    }

    // La bulle, pour que l'audit relie la question à ce que la personne a lu.
    await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .update({ chat_message_id: delivered.chatMessageId })
      .eq("id", rowId)
      .eq("user_id", userId);

    log("asked", {
      user_id: userId,
      id: rowId,
      about: entry.about,
      gate: entry.gate,
      options: entry.options.length,
      source: args.source,
    });
    return { asked: true, reason: "asked", id: rowId };
  } catch (error) {
    // ⛔ JAMAIS VERS L'APPELANT. Le plan est écrit; personne ne perd sa
    // composition parce qu'une question n'a pas pu partir.
    log("not_asked", {
      user_id: userId,
      reason: "insert_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { asked: false, reason: "insert_failed", id: null };
  }
}

// ===========================================================================
// 3. Les lectures et les clôtures
// ===========================================================================

export interface OpenClarificationRow {
  readonly id: string;
  readonly userId: string;
  readonly about: ClarificationAbout;
  readonly pending: PendingClarification;
  readonly options: readonly string[];
  readonly contentLocale: string | null;
  readonly expiresAt: string;
}

/**
 * LA QUESTION OUVERTE DE CETTE PERSONNE — chargée PAR PROPRIÉTAIRE.
 *
 * ⛔ JAMAIS PAR L'IDENTIFIANT REÇU DU CLIENT. Sous `service_role`, RLS ne
 * contraint rien: charger la ligne que la charge nomme rendrait la question de
 * quelqu'un d'autre à qui saurait forger un uuid. L'appelant compare ensuite
 * l'identifiant reçu à celui de la ligne — cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id`, payée par une ligne d'élève rendue
 * à son coach.
 */
export async function loadOpenClarification(
  admin: MinimalClient,
  userId: string,
): Promise<OpenClarificationRow | null> {
  try {
    const res = await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .select("id,user_id,about,pending,options,content_locale,expires_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (res?.error || !res?.data) return null;
    const row = res.data as Record<string, unknown>;
    const pending = row.pending as PendingClarification | null;
    const options = Array.isArray(row.options)
      ? row.options.map((o) => String(o ?? ""))
      : [];
    if (!pending || options.length === 0) return null;
    return {
      id: String(row.id ?? ""),
      userId: String(row.user_id ?? ""),
      about: (MEMORY_CLARIFICATION_ABOUTS as readonly string[]).includes(String(row.about))
        ? row.about as ClarificationAbout
        : "who",
      pending,
      options,
      contentLocale: row.content_locale === null
        ? null
        : String(row.content_locale ?? ""),
      expiresAt: String(row.expires_at ?? ""),
    };
  } catch {
    // ⚠️ UNE LECTURE EN PANNE REND `null`, ET L'APPELANT TRAITE ÇA COMME
    // « PLUS D'ACTUALITÉ ». C'est le seul repli honnête: on ne peut pas écrire
    // ce qu'on n'a pas su lire, et le dire est mieux que de deviner.
    return null;
  }
}

/** Ferme une ligne, par PROPRIÉTAIRE et par identifiant. */
export async function closeClarification(
  admin: MinimalClient,
  args: {
    id: string;
    userId: string;
    status: "answered" | "declined" | "expired" | "undelivered";
    nowIso: string;
    answer?: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = {
      status: args.status,
      closed_at: args.nowIso,
    };
    if (args.status === "answered") {
      patch.answer = args.answer ?? null;
      patch.answered_at = args.nowIso;
    }
    const res = await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .update(patch)
      .eq("id", args.id)
      .eq("user_id", args.userId)
      .eq("status", "open")
      .select("id");
    return !res?.error && Array.isArray(res?.data) && res.data.length > 0;
  } catch {
    return false;
  }
}

/**
 * FERME LES QUESTIONS DE CETTE PERSONNE QUI N'ONT PLUS LIEU D'ÊTRE.
 *
 * Deux cas, et le même sort: celle qui a passé sa date, et celle qui est encore
 * ouverte au moment où une NOUVELLE se pose. Les distinguer n'apporterait rien
 * — dans les deux cas rien n'a été écrit, et le compteur de silence est le
 * même.
 */
async function closeStaleClarifications(
  admin: MinimalClient,
  args: { userId: string; nowIso: string },
): Promise<void> {
  try {
    await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .update({ status: "expired", closed_at: args.nowIso })
      .eq("user_id", args.userId)
      .eq("status", "open");
  } catch {
    // Silence: la question suivante se heurtera à l'index unique et sera
    // comptée `insert_failed`, ce qui est déjà dit.
  }
}

/**
 * LE BALAYAGE GLOBAL — et c'est LUI qui mesure le silence.
 *
 * ⚠️ SANS CE COMPTEUR, « personne ne répond » et « la question ne part jamais »
 * se ressemblent trait pour trait. Il est appelé par un job qui tourne déjà;
 * son nombre est la seule façon de savoir si la relance mérite d'exister.
 */
export async function sweepLapsedClarifications(
  admin: MinimalClient,
  args: { nowIso: string },
): Promise<{ expired: number }> {
  try {
    const res = await admin
      .from(MEMORY_CLARIFICATION_TABLE)
      .update({ status: "expired", closed_at: args.nowIso })
      .eq("status", "open")
      .lt("expires_at", args.nowIso)
      .select("id");
    const expired = Array.isArray(res?.data) ? res.data.length : 0;
    if (expired > 0) log("swept", { expired });
    return { expired };
  } catch (error) {
    log("sweep_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { expired: 0 };
  }
}
