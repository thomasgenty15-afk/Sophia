// AMENDER UN FAIT, PLUTÔT QUE D'EN ÉCRIRE UN SECOND.
//
// `MealPhotoDecision.kind === "amend_event"` n'avait aucun exécuteur: le
// reducer savait décider d'un amendement, et rien dans le dépôt ne savait
// l'appliquer. Le seul `update` sur `protocol_events` était celui de
// l'analyseur, et `createProtocolEventWrite` ne sait qu'INSÉRER.
//
// CE QU'UN AMENDEMENT FAIT, ET CE QU'IL NE FAIT PAS
// -------------------------------------------------
// Il écrit les MOTS de l'élève sur la ligne qu'ils concernent, et il rend cette
// contestation visible au coach. Il ne relance PAS le modèle de vision: l'élève
// vient de dire ce qu'il y avait dans l'assiette, et redemander à une image ce
// qu'un humain vient d'affirmer serait remplacer un témoignage par une
// supposition.
//
// LE CRÉDIT, ET POURQUOI UNE CORRECTION L'EFFACE
// ----------------------------------------------
// `food_group_ref` est le crédit machine: le groupe alimentaire que l'analyse a
// cru voir et qui coche une ligne du plan. Quand l'élève CORRIGE la lecture, il
// vient de dire que cette lecture est fausse — garder un crédit qui en découle,
// c'est affirmer au coach quelque chose que l'élève a contredit. On l'efface.
//
// Deux exceptions, toutes deux fondées:
//   - une RÉPONSE (`answer`) ne contredit rien: elle lève une hypothèse
//     («oui, à l'huile d'olive»). Le crédit reste.
//   - une liaison EXPLICITE de l'élève (`student_commitment_id`, posée à
//     l'upload) est déjà sa parole. Une correction de la lecture machine ne
//     doit pas détruire ce qu'il avait lui-même déclaré.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

/** Ce que l'élève vient d'ajouter à un fait déjà écrit. */
export interface MealAmendment {
  kind: "answer" | "correction";
  /** Les mots de l'élève, tels quels. Jamais reformulés. */
  studentText: string;
  /** ISO. Passé par l'appelant: ce module n'a pas d'horloge. */
  at: string;
}

export interface AmendedRecognized {
  recognized: Record<string, unknown>;
  /** true quand le crédit machine doit être effacé de la ligne. */
  clearsCredit: boolean;
}

/**
 * Construit le `recognized` amendé. Fonction PURE: aucune I/O, aucune horloge.
 *
 * Les amendements s'EMPILENT (`amendments[]`) au lieu de s'écraser. Deux tours
 * sont autorisés par le reducer, et le second ne doit pas effacer le premier:
 * « c'était du poulet » puis « et sans huile » sont deux faits que le coach
 * doit voir tous les deux.
 */
export function buildAmendedRecognized(args: {
  recognized: Record<string, unknown> | null;
  amendment: MealAmendment;
}): AmendedRecognized {
  const base = args.recognized && typeof args.recognized === "object"
    ? { ...args.recognized }
    : {};
  const prior = Array.isArray(base.amendments) ? base.amendments : [];
  const entry = {
    kind: args.amendment.kind,
    student_text: args.amendment.studentText,
    at: args.amendment.at,
  };
  base.amendments = [...prior, entry];
  // Le drapeau plat existe pour les lecteurs qui n'ouvrent pas le tableau:
  // la synthèse coach doit pouvoir dire « cette lecture a été contestée »
  // sans réimplémenter la sémantique des amendements.
  base.student_amended = true;
  if (args.amendment.kind === "correction") {
    base.student_corrected = true;
  }

  // La liaison explicite de l'élève survit à tout: c'est déjà sa parole.
  const boundByStudent = typeof base.student_commitment_id === "string" &&
    base.student_commitment_id.trim() !== "";
  const clearsCredit = args.amendment.kind === "correction" && !boundByStudent;
  return { recognized: base, clearsCredit };
}

export interface AmendMealPhotoResult {
  ok: boolean;
  eventId: string;
  clearedCredit: boolean;
  /** Le motif quand `ok` est faux. Jamais un silence. */
  reason?: string;
}

/**
 * Applique l'amendement, avec relecture.
 *
 * Le write-through n'est pas décoratif: l'accusé rendu à l'élève dit « c'est
 * noté », et cette phrase doit reposer sur ce que la base porte. La discipline
 * est celle de `analyze-meal-photo-v1` — on relit et on échoue bruyamment
 * plutôt que d'annoncer une écriture qui n'a pas eu lieu.
 *
 * Le filtre `user_id` sur l'UPDATE n'est pas une redondance du `id`: c'est ce
 * qui rend impossible d'amender la ligne d'un autre élève si un identifiant
 * d'événement fuitait dans un état de flow.
 */
export async function amendMealPhotoEvent(
  db: SupabaseClient,
  args: { eventId: string; userId: string; amendment: MealAmendment },
): Promise<AmendMealPhotoResult> {
  const current = await db
    .from("protocol_events")
    .select("id, user_id, recognized, food_group_ref, disqualified_reason")
    .eq("id", args.eventId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (current.error) {
    return {
      ok: false,
      eventId: args.eventId,
      clearedCredit: false,
      reason: `read failed: ${current.error.message}`,
    };
  }
  if (!current.data) {
    // L'état de flow pointe une ligne qui n'existe plus (purge RGPD, rejeu
    // d'un état périmé). On le DIT, on n'écrit rien ailleurs.
    return {
      ok: false,
      eventId: args.eventId,
      clearedCredit: false,
      reason: "event not found for this user",
    };
  }
  const row = current.data as Record<string, unknown>;

  const { recognized, clearsCredit } = buildAmendedRecognized({
    recognized: (row.recognized ?? null) as Record<string, unknown> | null,
    amendment: args.amendment,
  });

  const patch: Record<string, unknown> = { recognized };
  if (clearsCredit) patch.food_group_ref = null;

  const updated = await db
    .from("protocol_events")
    .update(patch)
    .eq("id", args.eventId)
    .eq("user_id", args.userId)
    .select("id, recognized, food_group_ref")
    .single();
  if (updated.error) {
    return {
      ok: false,
      eventId: args.eventId,
      clearedCredit: false,
      reason: `update failed: ${updated.error.message}`,
    };
  }

  const readBack = updated.data as Record<string, unknown>;
  const stored = (readBack.recognized ?? {}) as Record<string, unknown>;
  const storedAmendments = Array.isArray(stored.amendments) ? stored.amendments : [];
  const expected = Array.isArray(recognized.amendments)
    ? recognized.amendments.length
    : 0;
  if (storedAmendments.length !== expected) {
    return {
      ok: false,
      eventId: args.eventId,
      clearedCredit: false,
      reason:
        `read-back carries ${storedAmendments.length} amendment(s), expected ${expected}`,
    };
  }
  if (clearsCredit && (readBack.food_group_ref ?? null) !== null) {
    return {
      ok: false,
      eventId: args.eventId,
      clearedCredit: false,
      reason: "read-back still carries a credit the student contradicted",
    };
  }

  return { ok: true, eventId: args.eventId, clearedCredit: clearsCredit };
}
