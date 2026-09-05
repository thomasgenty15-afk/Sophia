/**
 * LE TAP QUI COMPLÈTE UNE NOTE — « c'est pour Léa », « c'était le poulet ».
 *
 * Autorité produit: docs/keel/NOMENCLATURE-MEMOIRE.md §2.2, §2.3, §2.8.
 *
 * ── CE TAP NE FAIT PAS ÉCRIRE LE CHAT, ET C'EST LA LIGNE À NE PAS FRANCHIR ──
 * §2.8 dit que le chat n'écrit rien dans la mémoire, pas même par un tap. Ce
 * module ne l'enfreint pas: il COMPLÈTE une entrée que la personne a écrite
 * elle-même — sur son brouillon de plan, ou dans le champ libre de son bilan —
 * et que le classifieur aurait rangée sans hésiter s'il avait su de qui, ou de
 * quoi, elle parlait. Le producteur reste `draft_note`, la citation reste SA
 * phrase, et `conversation` reste fermé. Ce qui vient du tap est le SLOT
 * manquant, jamais le contenu.
 *
 * ── LES TROIS CICATRICES QUE CE FICHIER HONORE ────────────────────────────
 *
 *   ⛔ LE CLIENT EST `service_role`. La table n'a aucun droit d'écriture pour
 *   `authenticated` — c'est ce qui empêche de forger une entrée en attente puis
 *   de la faire entrer par ce chemin.
 *
 *   ⛔ LA LIGNE SE CHARGE PAR PROPRIÉTAIRE, JAMAIS PAR L'IDENTIFIANT REÇU.
 *   Sous `service_role`, RLS ne contraint rien: `loadOpenClarification` filtre
 *   sur `user_id`, et l'identifiant de la charge n'est comparé qu'ENSUITE.
 *   « RLS ne remplace pas un `.eq(user_id)` », payé par une ligne d'élève
 *   rendue à son coach.
 *
 *   ⛔ « PLUS D'ACTUALITÉ » EST LA MÊME RÉPONSE POUR TOUT. Ligne d'un autre,
 *   ligne close, ligne expirée, index hors borne: un message différent par cas
 *   serait un oracle — il dirait à qui tape au hasard laquelle de ses charges
 *   forgées a désigné quelque chose de réel.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  type ClarificationLanguage,
  clarificationDeclinedBody,
  clarificationViewLabel,
  clarificationWriteFailedBody,
  MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX,
  type MemoryClarificationReply,
  resolveClarification,
} from "../keel/memory_clarification.ts";
import {
  closeClarification,
  loadOpenClarification,
} from "../keel/memory_clarification_io.ts";
import { persistRetainedItemsFor } from "../keel/retained_items_io.ts";
import { persistSafetyDeclarations } from "../keel/draft_note_safety_io.ts";
import { buildMemoryRecap, type RecapKept } from "../keel/memory_recap.ts";
import { UNUSABLE_BUTTON_ACK } from "./disarmed_tap.ts";

/** La source du port, pour que la trace dise QUI a écrit. */
const TAP_SOURCE = "keel-memory-clarification-tap";

export interface MemoryClarificationTapResult {
  readonly body: string;
  readonly buttons: { payload: string; label: string }[];
  readonly handledAs: string;
  /**
   * ⟳ 2026-09-05 — LES TEXTES ÉCRITS, pour que « Voir » allume la ligne et
   * plus toutes celles du jour (`metadata.keel_memory_lines`, la même clé que
   * la bulle d'accusé de `memory_clarification_io.ts`). Absent quand rien
   * n'a été écrit.
   */
  readonly memoryLines?: readonly string[];
}

function log(event: string, extra: Record<string, unknown>): void {
  console.log(
    JSON.stringify({ tag: "keel.memory_clarification.tap", event, ...extra }),
  );
}

/**
 * @param reply la charge DÉJÀ lue par `readMemoryClarificationReply` — ce
 *   module ne reparse rien, et ne voit donc jamais une chaîne brute.
 */
export async function handleMemoryClarificationTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    reply: Exclude<MemoryClarificationReply, { kind: "none" }>;
    language: ClarificationLanguage;
    /** Le prénom de chaque bouche, pour l'accusé. Jamais un identifiant. */
    nameOf: (memberId: string) => string | null;
    /**
     * ⟳ 2026-09-05 — LES BOUCHES DU FOYER, pour la porte de sécurité d'une
     * réponse « toujours » (elle refuse un `member_id` hors rôle, jamais un
     * repli sur le titulaire). Vide = personne d'autre à table.
     */
    memberIds?: readonly string[];
    /** La locale de contenu, portée par la ligne de sécurité écrite. */
    contentLocale?: string | null;
    now: Date;
  },
): Promise<MemoryClarificationTapResult> {
  const stale = (why: string): MemoryClarificationTapResult => {
    log("stale", { user_id: args.userId, why, id: args.reply.id });
    return {
      body: UNUSABLE_BUTTON_ACK(args.language),
      buttons: [],
      handledAs: "keel_memory_clarification_stale",
    };
  };

  // ── ① LA LIGNE OUVERTE DE CETTE PERSONNE ──────────────────────────────
  const row = await loadOpenClarification(admin, args.userId);
  if (!row) return stale("no_open_row");
  // ⚠️ LA COMPARAISON VIENT APRÈS LE CHARGEMENT, jamais avant: c'est ce qui
  // fait que l'identifiant reçu ne SÉLECTIONNE rien, il ne fait que valider.
  if (row.id !== args.reply.id) return stale("other_row");

  const nowIso = args.now.toISOString();
  // ── ② LA FRAÎCHEUR SE JUGE AU TAP, pas seulement au balayage ──────────
  // Une question expirée dont le balayage n'est pas encore passé est expirée:
  // la lire autrement ferait dépendre le produit de l'heure d'un cron.
  if (row.expiresAt && Date.parse(row.expiresAt) < args.now.getTime()) {
    await closeClarification(admin, {
      id: row.id,
      userId: args.userId,
      status: "expired",
      nowIso,
    });
    return stale("expired");
  }

  // ── ③ « AUCUN DE CEUX-LÀ » — un refus EXPLICITE, et rien d'écrit ──────
  // ⚠️ IL SE DISTINGUE DU SILENCE, ET C'EST TOUT SON INTÉRÊT. Sans ce bouton,
  // « ce n'est ni l'une ni l'autre » n'a d'autre expression que d'ignorer la
  // question — et on ne saurait jamais si la relance a raté sa cible ou si la
  // personne ne l'a pas vue.
  if (args.reply.kind === "none_of_them") {
    await closeClarification(admin, {
      id: row.id,
      userId: args.userId,
      status: "declined",
      nowIso,
    });
    log("declined", { user_id: args.userId, id: row.id, about: row.about });
    return {
      body: clarificationDeclinedBody(args.language),
      buttons: [],
      handledAs: "keel_memory_clarification_declined",
    };
  }

  // ── ④ L'OPTION, PAR SA POSITION DANS LES OPTIONS STOCKÉES ─────────────
  // ⛔ C'EST LA BORNE HAUTE DE L'INDEX, et elle ne peut vivre qu'ici: le module
  // pur ne connaît pas les options. Une charge qui nomme l'index 3 sur une
  // question à deux boutons a été fabriquée, pas tapée.
  const option = row.options[args.reply.index];
  if (option === undefined) return stale("index_out_of_range");

  const resolved = resolveClarification(row.pending, option, {
    writtenAt: nowIso,
  });
  if (resolved === null) {
    // La ligne stockée n'est plus relisable par le socle (une famille retirée,
    // un sujet devenu difforme). On la ferme plutôt que d'écrire quelque chose
    // que personne ne saura relire.
    await closeClarification(admin, {
      id: row.id,
      userId: args.userId,
      status: "expired",
      nowIso,
    });
    log("pending_unreadable", { user_id: args.userId, id: row.id });
    return stale("pending_unreadable");
  }

  // ── ⑤-bis ⟳ 2026-09-05 — « TOUJOURS »: LA PORTE DE SÉCURITÉ, PAS LE PORT ──
  //
  // La réponse écrit une CONTRAINTE (stricte, qui gouverne tout le foyer), par
  // la même porte que la liste `safety` du classifieur — la ligne de la
  // personne, ou la RPC `_for` d'une bouche. Une écriture refusée laisse la
  // question OUVERTE et l'accusé ne dit pas « noté », comme pour le port.
  if (resolved.safety && resolved.safety.length > 0) {
    const safe = await persistSafetyDeclarations({
      admin,
      userId: args.userId,
      raw: resolved.safety.map((d) => ({
        kind: d.kind,
        ref: d.ref,
        member_id: d.memberId,
        text: d.text,
      })),
      memberIds: args.memberIds ?? [],
      contentLocale: String(args.contentLocale ?? row.contentLocale ?? ""),
      sourceMessageId: `${TAP_SOURCE}:${row.id}`,
    });
    if (safe.written.length === 0) {
      log("safety_write_failed", {
        user_id: args.userId,
        id: row.id,
        failed: safe.failed,
        refused: safe.refused,
      });
      return {
        body: clarificationWriteFailedBody(args.language),
        buttons: [],
        handledAs: "keel_memory_clarification_write_failed",
      };
    }
    await closeClarification(admin, {
      id: row.id,
      userId: args.userId,
      status: "answered",
      nowIso,
      answer: { index: args.reply.index, option },
    });
    const body = buildMemoryRecap({
      safety: safe.written.map((d) => ({
        kind: d.kind,
        ref: d.ref,
        who: d.memberId === null ? null : args.nameOf(d.memberId),
      })),
      kept: [],
      language: args.language,
    }) ?? clarificationDeclinedBody(args.language);
    log("answered", {
      user_id: args.userId,
      id: row.id,
      about: row.about,
      gate: row.pending.gate,
      safety_written: safe.written.length,
    });
    // Pas de bouton « Voir »: la contrainte vit dans la fiche santé / la page
    // du foyer, pas sur la carte « ce que Sophia sait » — et la phrase le dit.
    return { body, buttons: [], handledAs: "keel_memory_clarification_answered" };
  }

  // ── ⑤ L'ÉCRITURE, PAR LA PORTE, AVEC LE PRODUCTEUR D'ORIGINE ──────────
  const write = await persistRetainedItemsFor({
    admin,
    userId: args.userId,
    producer: "draft_note",
    source: TAP_SOURCE,
    durable: resolved.durable ?? [],
    nextPlan: resolved.nextPlan ?? [],
    memo: resolved.memo ?? [],
  });

  if (!write.ok) {
    // ⛔ LA LIGNE RESTE `open`, ET L'ACCUSÉ NE DIT PAS « NOTÉ ». Fermer ici
    // perdrait la question sur une panne passagère, et un accusé optimiste
    // apprendrait à la personne que les accusés ne veulent rien dire.
    log("write_failed", {
      user_id: args.userId,
      id: row.id,
      reason: write.reason,
    });
    return {
      body: clarificationWriteFailedBody(args.language),
      buttons: [],
      handledAs: "keel_memory_clarification_write_failed",
    };
  }

  await closeClarification(admin, {
    id: row.id,
    userId: args.userId,
    status: "answered",
    nowIso,
    answer: { index: args.reply.index, option },
  });

  // ── ⑥ L'ACCUSÉ DIT CE QUI EST ÉCRIT, ET OUVRE LA CARTE ────────────────
  const subject = resolved.durable?.[0]?.subject ??
    resolved.nextPlan?.[0]?.item.subject ??
    resolved.memo?.[0]?.subject ?? "household";
  const memberId = String(subject).startsWith("member:")
    ? String(subject).slice(7)
    : "";
  const kept: RecapKept = {
    text: resolved.durable?.[0]?.text ??
      resolved.nextPlan?.[0]?.item.text ??
      resolved.memo?.[0]?.text ?? option,
    until: null,
    kind: row.pending.gate === "notes"
      ? "note"
      : row.pending.gate === "next_plan"
      ? "next_plan"
      : "preference",
    who: memberId ? args.nameOf(memberId) : null,
  };
  const body = buildMemoryRecap({
    safety: [],
    kept: [kept],
    language: args.language,
  }) ?? clarificationDeclinedBody(args.language);

  log("answered", {
    user_id: args.userId,
    id: row.id,
    about: row.about,
    gate: row.pending.gate,
    durable_written: write.durableWritten,
    next_plan_written: write.nextPlanWritten,
    memo_written: write.memoWritten,
  });

  const block = row.pending.gate === "notes"
    ? "notes"
    : row.pending.gate === "next_plan"
    ? "next_plan"
    : "preferences";
  return {
    body,
    buttons: [{
      payload: `${MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX}${block}`,
      label: clarificationViewLabel(args.language),
    }],
    handledAs: "keel_memory_clarification_answered",
    memoryLines: [kept.text],
  };
}
