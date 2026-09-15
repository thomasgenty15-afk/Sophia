// FF-025 R4 · LA PHOTO ENRICHIT LE FAIT, ELLE NE LE DOUBLE PAS.
//
// ── LE DÉFAUT QUE CE MODULE FERME ───────────────────────────────────────────
//   Élève : « j'ai commandé une pizza »        → 1 ligne, `off_plan`, sans aliment
//   Sophia: « … si tu as une photo, envoie-la »
//   Élève : *envoie la photo*                  → 1 ligne DE PLUS, `source=photo`
//   Coach : deux repas, un soir. L'élève en a mangé un.
//
// « Deux lignes pour un repas fausse tous les comptes en aval » (R4), et le
// pire est que l'invitation elle-même est ce qui les fabrique: le produit
// demanderait un geste dont le seul effet mesurable serait de fausser ses
// propres chiffres.
//
// ── LE RATTACHEMENT EST BORNÉ, ET C'EST DÉLIBÉRÉ ────────────────────────────
// FF-018 §11 et FF-025 §7 laissent la question du rattachement DIFFÉRÉ ouverte
// (« la photo arrive le lendemain »), et §9 interdit nommément de la résoudre
// ici en douce. Ce module ne rattache donc QUE ce que la fiche met dans son
// périmètre: une photo qui arrive dans les minutes qui suivent une invitation,
// le même jour local. Au-delà de la fenêtre, la photo redevient son propre
// fait — comme avant, sans surprise et sans devinette.
//
// ── L'ORDRE, ET POURQUOI IL EST APRÈS L'ANALYSE ─────────────────────────────
// La tentation est de rattacher AVANT d'analyser: une seule ligne, aucun
// ménage. Elle est fausse, et c'est le cas de la photo de MENU qui le prouve:
// le filtre de sujet de FF-018 écrit alors `disqualified_reason` sur la ligne —
// et cette ligne porterait le repas hors plan que la personne a réellement
// déclaré. `coach_student_events` filtre `disqualified_reason is null`: la
// personne aurait dit la vérité, envoyé une photo, et perdu son repas.
//
// On analyse donc d'abord, et on ne rattache QUE si l'image est un repas. Une
// photo qui n'en est pas une reste son propre fait disqualifié, et le hors-plan
// reste tel quel — ce que §7 demande mot pour mot.
//
// MODULE: la décision est PURE et testable sans base; les deux gestes d'écriture
// sont isolés en dessous.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { DAILY_ASK_LEDGER_TABLE } from "./daily_ask_budget.ts";

/**
 * LA FENÊTRE. « Dans les minutes », pas « dans la journée ».
 *
 * Trente minutes: assez pour sortir du restaurant, retrouver la photo et
 * l'envoyer; trop peu pour qu'une photo du lendemain matin se rattache toute
 * seule au dîner de la veille. La borne est un ARBITRAGE, pas une mesure — elle
 * est nommée ici pour pouvoir être discutée, et elle est passée explicitement
 * au prédicat pour pouvoir être éprouvée.
 */
export const PHOTO_INVITATION_ATTACH_WINDOW_MINUTES = 30;

export interface InvitedFactCandidate {
  /** La ligne invitée. */
  eventId: string;
  /** L'instant où l'invitation est partie. */
  invitedAt: string;
  /** Le jour local de la ligne invitée. */
  localDate: string;
  planRelation: string | null;
  mediaPath: string | null;
  source: string;
  disqualifiedReason: string | null;
}

export type PhotoAttachDecision =
  | { attach: true; eventId: string; reason: "attach" }
  | {
    attach: false;
    reason:
      | "no_invitation"
      | "window_elapsed"
      | "other_local_day"
      | "not_off_plan"
      | "already_has_media"
      | "invited_fact_disqualified"
      | "photo_is_not_a_meal"
      | "photo_not_fresh";
  };

/**
 * Rattache-t-on cette photo au fait invité ?
 *
 * CHAQUE REFUS FERME UN DÉGÂT NOMMÉ, et aucun n'est décoratif:
 *  - `photo_is_not_a_meal` — la photo de menu. Sans lui, le hors-plan déclaré
 *    disparaît de la vue du coach;
 *  - `photo_not_fresh` — la photo est un DOUBLON ou un rejeu. Rattacher une
 *    ligne qu'on n'a pas créée dans cette requête, c'est déplacer un fait que
 *    quelqu'un a peut-être déjà lu;
 *  - `already_has_media` — une photo est déjà rattachée. La seconde est un
 *    autre moment, pas une correction;
 *  - `invited_fact_disqualified` — le fait invité a été décoché entre-temps
 *    (« finalement je n'ai pas mangé »). On ne rattache pas une photo à un
 *    repas que la personne vient de retirer;
 *  - `window_elapsed` / `other_local_day` — le rattachement différé est une
 *    question ouverte de FF-018, et la résoudre ici en douce est interdit.
 */
export function decidePhotoAttachment(args: {
  candidate: InvitedFactCandidate | null;
  /** Le jour local de la photo. */
  photoLocalDate: string;
  /** L'instant de la photo. */
  photoAt: Date;
  /** La photo a-t-elle produit un repas (FF-018: `disqualified_reason` null). */
  photoIsAMeal: boolean;
  /**
   * La ligne photo vient-elle d'être créée par CETTE requête. Un doublon
   * (`idempotent`) désarme: il désigne une ligne antérieure.
   */
  photoRowIsFresh: boolean;
  windowMinutes: number;
}): PhotoAttachDecision {
  const c = args.candidate;
  if (!c) return { attach: false, reason: "no_invitation" };
  if (!args.photoIsAMeal) return { attach: false, reason: "photo_is_not_a_meal" };
  if (!args.photoRowIsFresh) return { attach: false, reason: "photo_not_fresh" };
  if (c.localDate !== args.photoLocalDate) {
    return { attach: false, reason: "other_local_day" };
  }
  const invitedAt = Date.parse(c.invitedAt);
  if (!Number.isFinite(invitedAt)) {
    return { attach: false, reason: "window_elapsed" };
  }
  const elapsedMinutes = (args.photoAt.getTime() - invitedAt) / 60000;
  // Une invitation dans le FUTUR (horloge décalée) n'ouvre pas la porte non
  // plus: `elapsedMinutes < 0` tombe dans le même refus.
  if (elapsedMinutes < 0 || elapsedMinutes > args.windowMinutes) {
    return { attach: false, reason: "window_elapsed" };
  }
  if (String(c.planRelation ?? "").trim() !== "off_plan") {
    return { attach: false, reason: "not_off_plan" };
  }
  if (c.disqualifiedReason !== null) {
    return { attach: false, reason: "invited_fact_disqualified" };
  }
  if (String(c.mediaPath ?? "").trim() !== "") {
    return { attach: false, reason: "already_has_media" };
  }
  return { attach: true, eventId: c.eventId, reason: "attach" };
}

/**
 * La dernière invitation à la photo partie à cette personne, et le fait qu'elle
 * visait. `null` quand il n'y en a pas, ou quand la lecture échoue — une
 * lecture ratée ne doit pas rattacher au hasard.
 */
export async function findInvitedOffPlanFact(
  db: SupabaseClient,
  args: { userId: string },
): Promise<InvitedFactCandidate | null> {
  try {
    const invite = await db
      .from(DAILY_ASK_LEDGER_TABLE)
      .select("protocol_event_id, asked_at")
      .eq("user_id", args.userId)
      .eq("ask_kind", "photo_invitation")
      .not("protocol_event_id", "is", null)
      .order("asked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invite.error || !invite.data) return null;
    const row = invite.data as {
      protocol_event_id: string | null;
      asked_at: string;
    };
    const eventId = String(row.protocol_event_id ?? "").trim();
    if (!eventId) return null;

    const fact = await db
      .from("protocol_events")
      .select(
        "id, local_date, plan_relation, media_path, source, disqualified_reason",
      )
      .eq("id", eventId)
      // ⚠️ `.eq('user_id')` EN PLUS de l'id, et ce n'est pas de la ceinture:
      // RLS ne s'applique pas au service role, et une ligne d'un autre élève
      // rendue ici serait enrichie avec la photo de celui-ci.
      .eq("user_id", args.userId)
      .maybeSingle();
    if (fact.error || !fact.data) return null;
    const f = fact.data as Record<string, unknown>;
    return {
      eventId,
      invitedAt: String(row.asked_at),
      localDate: String(f.local_date ?? ""),
      planRelation: f.plan_relation === null || f.plan_relation === undefined
        ? null
        : String(f.plan_relation),
      mediaPath: f.media_path === null || f.media_path === undefined
        ? null
        : String(f.media_path),
      source: String(f.source ?? ""),
      disqualifiedReason:
        f.disqualified_reason === null || f.disqualified_reason === undefined
          ? null
          : String(f.disqualified_reason),
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "photo_invitation_attach_lookup_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

export interface PhotoAttachResult {
  ok: boolean;
  /** L'événement qui SURVIT, et auquel tout l'aval doit se référer. */
  eventId: string;
  /** true quand la ligne photo a bien disparu. */
  photoRowRemoved: boolean;
  reason: string;
}

/**
 * Le geste, en TROIS écritures ordonnées pour qu'aucun échec ne perde un fait.
 *
 *   1. la ligne invitée reçoit la photo (tout SAUF l'empreinte);
 *   2. la ligne photo disparaît — elle n'aurait jamais dû être un second repas;
 *   3. la ligne invitée reçoit l'empreinte.
 *
 * L'empreinte est SÉPARÉE parce que `protocol_events_media_dedup_idx` est
 * unique sur `(user_id, local_date, media_sha256)`: l'écrire avant la
 * suppression se heurterait à la ligne photo qui la porte encore. L'écrire
 * après garde la déduplication d'un renvoi de la même image.
 *
 * Si (1) échoue, RIEN n'est fait et les deux lignes restent — c'est le
 * comportement d'avant FF-025, visible et réparable. Si (2) échoue, la ligne
 * invitée est enrichie et la ligne photo survit: deux lignes, mais aucune
 * perdue, et le log le dit fort.
 *
 * CE QUI N'EST JAMAIS ÉCRASÉ: `food_group_ref`, `slot_key` et `student_note` de
 * la ligne invitée ne sont remplis que s'ils sont VIDES. La personne a écrit ce
 * qu'elle a mangé; une lecture d'image n'a pas à la contredire en silence.
 */
export async function attachPhotoToInvitedFact(
  db: SupabaseClient,
  args: {
    userId: string;
    invitedEventId: string;
    photoEventId: string;
    photo: {
      mediaPath: string;
      mediaSha256: string;
      recognized: unknown;
      recognitionConfidence: number | null;
      foodGroupRef: string | null;
      portionBand: string | null;
      analyzedAt: string | null;
      slotKey: string | null;
      studentNote: string | null;
    };
    /** Les valeurs actuelles de la ligne invitée, pour ne rien écraser. */
    invited: {
      foodGroupRef: string | null;
      slotKey: string | null;
      studentNote: string | null;
    };
  },
): Promise<PhotoAttachResult> {
  const patch: Record<string, unknown> = {
    media_path: args.photo.mediaPath,
    recognized: args.photo.recognized,
    recognition_confidence: args.photo.recognitionConfidence,
    portion_band: args.photo.portionBand,
    analyzed_at: args.photo.analyzedAt,
    // LA SOURCE DEVIENT `photo`, et c'est la vérité de la ligne: la preuve la
    // plus forte de ce repas est maintenant l'image. C'est aussi ce qui garde
    // `analyze-meal-photo-v1` capable de la ré-analyser (`force`), sa première
    // garde étant `source === 'photo'`.
    source: "photo",
  };
  if (!args.invited.foodGroupRef && args.photo.foodGroupRef) {
    patch.food_group_ref = args.photo.foodGroupRef;
  }
  if (!args.invited.slotKey && args.photo.slotKey) {
    patch.slot_key = args.photo.slotKey;
  }
  if (!args.invited.studentNote && args.photo.studentNote) {
    patch.student_note = args.photo.studentNote;
  }

  const enriched = await db
    .from("protocol_events")
    .update(patch as never)
    .eq("id", args.invitedEventId)
    .eq("user_id", args.userId)
    .select("id")
    .maybeSingle();
  if (enriched.error || !enriched.data) {
    console.warn(JSON.stringify({
      tag: "photo_invitation_attach_enrich_failed",
      user_id: args.userId,
      invited_event_id: args.invitedEventId,
      error: enriched.error?.message ?? "no row updated",
    }));
    return {
      ok: false,
      eventId: args.photoEventId,
      photoRowRemoved: false,
      reason: `enrich_failed:${enriched.error?.message ?? "no_row"}`,
    };
  }

  const removed = await db
    .from("protocol_events")
    .delete()
    .eq("id", args.photoEventId)
    .eq("user_id", args.userId);
  if (removed.error) {
    // Deux lignes, et il faut que ça se voie: c'est très exactement le double
    // comptage que R4 interdit, obtenu à mi-chemin.
    console.error(JSON.stringify({
      tag: "photo_invitation_attach_photo_row_survived",
      user_id: args.userId,
      invited_event_id: args.invitedEventId,
      photo_event_id: args.photoEventId,
      error: removed.error.message,
      detail:
        "la ligne invitée est enrichie et la ligne photo n'a pas pu être " +
        "supprimée: ce repas compte DEUX FOIS chez le coach jusqu'à ce que " +
        "quelqu'un la retire.",
    }));
    return {
      ok: true,
      eventId: args.invitedEventId,
      photoRowRemoved: false,
      reason: `photo_row_survived:${removed.error.message}`,
    };
  }

  const stamped = await db
    .from("protocol_events")
    .update({ media_sha256: args.photo.mediaSha256 } as never)
    .eq("id", args.invitedEventId)
    .eq("user_id", args.userId);
  if (stamped.error) {
    console.warn(JSON.stringify({
      tag: "photo_invitation_attach_sha_failed",
      user_id: args.userId,
      invited_event_id: args.invitedEventId,
      error: stamped.error.message,
      detail: "la déduplication d'un renvoi de la même image est affaiblie",
    }));
  }

  return {
    ok: true,
    eventId: args.invitedEventId,
    photoRowRemoved: true,
    reason: "attached",
  };
}
