import { supabase } from "../../lib/supabase";
import {
  type WorkLunch,
  parseWorkLunch,
  workLunchPayload,
} from "../lib/presenceMarks";

// L3 — LA QUESTION HEBDOMADAIRE DU DÉJEUNER, sa lecture et son écriture.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2.
// Base: migration 20260818120000, colonne `household_members.work_lunch`.
//
//   « La semaine, est-ce qu'il/elle mange au bureau ? »
//      ├─ NON ────────────► le plan compose tous les repas
//      └─ OUI ─► « gamelle, ou dehors ? »
//                  ├─ GAMELLE ─► « micro-ondes au bureau ? »
//                  │              non → le repas doit être BON FROID
//                  └─ DEHORS ──► le plan ne compose pas ce midi
//
// ── ELLE SE POSE PAR PERSONNE, ET SEULEMENT AUX MAJEURS ───────────────────
// L'âge se DÉDUIT de la date de naissance et n'est jamais redemandé: la base
// le vérifie elle-même (`keel_household_member_age`) et refuse `not_adult` —
// y compris quand l'âge est INCONNU. On ne pose pas une question d'adulte à
// quelqu'un dont on ne sait pas s'il en est un.
//
// ── ELLE PRÉ-REMPLIT, ELLE NE DÉCIDE PAS (§2.2 bis) ───────────────────────
// L'écriture applique le pré-remplissage de la grille DANS LA MÊME
// TRANSACTION, une fois. Ce qui est coché à la main dans la grille gagne
// toujours ensuite: la réponse décrit une semaine ordinaire, pas ce mardi-là.
// C'est pour ça qu'il n'y a AUCUN calcul de pré-remplissage ici — le refaire
// côté navigateur ferait un second auteur du même geste, et le client
// gagnerait la course une fois sur deux.

/** La réponse d'une bouche, ou `null` quand la question n'a jamais été posée. */
export type MemberWorkLunch = { memberId: string; answer: WorkLunch | null };

/**
 * LES RÉPONSES DU FOYER — une entrée par bouche À QUI ON A DEMANDÉ.
 *
 * ⚠️ UNE BOUCHE ABSENTE DU RÉSULTAT N'A PAS RÉPONDU « NON ». Elle n'a jamais
 * été interrogée, et l'écran doit pouvoir poser la question. Rendre une carte
 * complétée par des `false` ferait disparaître le formulaire pour tout le
 * monde, du jour où on l'a ouvert.
 */
export async function loadWorkLunch(): Promise<Map<string, WorkLunch | null>> {
  const { data, error } = await supabase.rpc("keel_household_work_lunch");
  if (error) throw new Error(error.message);
  const out = new Map<string, WorkLunch | null>();
  for (const raw of (data ?? []) as unknown[]) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const memberId = String(row.member_id ?? "");
    if (!memberId) continue;
    out.set(memberId, parseWorkLunch(row.work_lunch));
  }
  return out;
}

/**
 * POSE LA RÉPONSE, ET LAISSE LA BASE PRÉ-REMPLIR LA GRILLE.
 *
 * @param answer `null` EFFACE — « je n'ai finalement rien à dire » remet la
 *        colonne dans l'état « jamais demandé » et retire les midis
 *        pré-remplis. Ce n'est pas la même chose que répondre « non »: l'un
 *        rouvre la question, l'autre y répond.
 *
 * Motifs de refus rendus par la base: `not_authenticated`, `bad_work_lunch`,
 * `not_a_member`, `not_your_line`, `not_adult`, `too_many_away`. Ils sont
 * NOMMÉS parce qu'un refus rendu loin du geste se lit comme un bouton mort.
 */
export async function setMemberWorkLunch(
  memberId: string,
  answer: WorkLunch | null,
) {
  const { data, error } = await supabase.rpc(
    "keel_household_set_member_work_lunch",
    {
      p_member: memberId,
      p_work_lunch: answer === null ? null : workLunchPayload(answer),
    },
  );
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}
