import { supabase } from "../../lib/supabase";

// LA NOTE 1:1 DU COACH SUR UN ÉLÈVE — la moitié « écriture ».
//
// L'arbitrage produit (contre `docs/keel/MODEL.md`, en connaissance de cause)
// est dans l'en-tête de la migration `20260805180000_student_coach_notes.sql`.
// Ce fichier ne fait que l'I/O, et il le fait SOUS LE JWT DU COACH.
//
// AUCUNE EDGE FUNCTION, AUCUN SERVICE ROLE — et c'est structurel, pas un choix
// de commodité. `CoachStudentPage` est read-only par construction: chaque
// lecture y passe par RLS, l'audit tourne avant, et le fichier revendique de ne
// contenir « pas un seul appel de fonction edge ». Une écriture qui passerait
// par le serveur casserait cet invariant pour une note. La policy
// `student_coach_notes_coach_all` décide, exactement comme les policies Tier A
// décident du reste de la page: un coach qui n'a pas cet élève n'écrit rien, et
// c'est la base qui le dit, pas ce fichier.

/**
 * ⚠️ COPIE DE CONFORT — l'autorité est le CHECK SQL
 * `student_coach_notes_length_check`. Sert au compteur et au `maxLength` de la
 * zone de saisie. Si les deux dérivent un jour, c'est la base qui refuse et
 * l'écran affiche l'erreur; il ne prétend jamais avoir sauvegardé.
 */
export const COACH_NOTE_MAX_CHARS = 1500;

export interface CoachNote {
  note: string;
  updatedAt: string | null;
}

/**
 * La note de CE coach sur CET élève. `null` = il n'y en a pas.
 *
 * Throw sur erreur de lecture, exprès: l'appelant doit pouvoir distinguer
 * « pas de note » d'« impossible de lire », et l'écran ne doit jamais afficher
 * une zone vide qu'un coach prendrait pour sa note effacée.
 */
export async function loadCoachNote(studentId: string): Promise<CoachNote | null> {
  const res = await supabase
    .from("student_coach_notes")
    .select("note, updated_at")
    .eq("student_user_id", studentId)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const row = res.data as { note?: unknown; updated_at?: unknown } | null;
  if (!row) return null;
  return {
    note: typeof row.note === "string" ? row.note : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Écrit (ou efface) la note.
 *
 * UPSERT SUR LA PAIRE, pas un insert: la contrainte
 * `student_coach_notes_pair_unique` existe pour que sauvegarder deux fois
 * n'empile pas deux notes — le prompt lirait alors une version périmée.
 *
 * Une note vidée SUPPRIME la ligne au lieu d'écrire `''`. Les deux se valent
 * côté prompt (`sanitizeCoachNote` rend `null` sur du whitespace), mais pas
 * côté élève: une ligne vide resterait dans son export RGPD comme la trace
 * d'une note que le coach a justement décidé de retirer.
 */
export async function saveCoachNote(
  studentId: string,
  rawNote: string,
): Promise<CoachNote | null> {
  const note = rawNote.trim();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("no session");

  // `coaches.id`, PAS l'auth user id. La confusion des deux a déjà coûté un
  // export à zéro ligne (cf. `resolveCoachId` dans account-export-v1).
  const coachRes = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (coachRes.error) throw new Error(coachRes.error.message);
  const coachId = (coachRes.data as { id?: string } | null)?.id;
  if (!coachId) throw new Error("not a coach");

  if (note.length === 0) {
    const del = await supabase
      .from("student_coach_notes")
      .delete()
      .eq("coach_id", coachId)
      .eq("student_user_id", studentId);
    if (del.error) throw new Error(del.error.message);
    return null;
  }

  const res = await supabase
    .from("student_coach_notes")
    .upsert(
      { coach_id: coachId, student_user_id: studentId, note },
      { onConflict: "coach_id,student_user_id" },
    )
    .select("note, updated_at")
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const row = res.data as { note?: unknown; updated_at?: unknown } | null;
  return {
    note: typeof row?.note === "string" ? row.note : note,
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
  };
}
