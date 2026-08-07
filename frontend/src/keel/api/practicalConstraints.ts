import { supabase } from "../../lib/supabase";

// L'ÉCRITURE FUSIONNÉE DANS `student_goals.practical_constraints` — un seul
// propriétaire, parce qu'elle porte une règle qu'on ne peut pas redemander à
// trois appelants de se rappeler.
//
// ── CE QUE ÇA CORRIGE: UN ÉCRAN QUI AVALE UNE SAISIE ──────────────────────
// Trois surfaces écrivent dans cette colonne (le rythme, la capacité de
// cuisine, les goûts), toutes avec le même geste: `update(...).eq("user_id",
// uid)`. PostgREST répond **204 sans corps et sans erreur** à un update qui ne
// matche AUCUNE ligne — c'est un no-op parfaitement silencieux. Les trois
// surfaces enchaînaient donc sur leur message de succès (« Saved. Your next
// plan is built around this. ») alors que rien n'avait été écrit, et la
// génération suivante retombait sur son défaut: petit-déjeuner, déjeuner,
// dîner. L'élève avait décoché le petit-déjeuner, et le voyait revenir.
//
// Ça n'était pas théorique: la page montait ces cartes sur une ligne
// `student_goals` lue SANS `user_id`, donc, pour quelqu'un à la fois coach et
// mangeur, sur la ligne d'un de ses élèves. `hasGoal` était vrai, les cases
// affichaient un vrai rythme, et le Save partait vers une ligne qui n'existait
// pas. La lecture est scopée depuis (`StudentWeekPlanPage`), mais la lecture
// vit chez le parent: ce qui garantit qu'une écriture a eu lieu doit vivre
// avec l'ÉCRITURE, sinon la prochaine surface qui écrit ici hérite du piège.
//
// ── POURQUOI `select()` ET PAS UN COMPTAGE PRÉALABLE ──────────────────────
// Un `select` de vérification avant l'update laisserait la fenêtre ouverte
// entre les deux. Le `select()` accroché à l'update fait rendre à PostgREST
// les lignes RÉELLEMENT touchées, dans la même requête: zéro ligne est une
// réponse, pas un silence.

/** Ce que la colonne contient — un jsonb libre, une clé par contrainte. */
export type PracticalConstraints = Record<string, unknown>;

/**
 * Fusionne `patch` dans `practical_constraints` et ÉCHOUE si aucune ligne
 * n'a été touchée.
 *
 * Les clés absentes de `patch` sont conservées par l'étalement: deux cartes
 * ouvertes côte à côte ne doivent pas se désécrire l'une l'autre.
 *
 * UPDATE et pas UPSERT: un upsert partiel écraserait `goal` et
 * `content_locale`, qui sont NOT NULL et n'ont rien à faire ici.
 *
 * @throws si l'écriture échoue, ou si elle n'a touché aucune ligne.
 */
export async function mergePracticalConstraints(args: {
  userId: string;
  /** L'état lu, à ne pas écraser. */
  current: PracticalConstraints | null | undefined;
  /** Les clés que l'appelant possède. */
  patch: PracticalConstraints;
  /** Pour le message d'erreur: la surface qui écrit. */
  source: string;
}): Promise<void> {
  const { data, error } = await supabase
    .from("student_goals")
    .update({
      practical_constraints: { ...(args.current ?? {}), ...args.patch },
    })
    .eq("user_id", args.userId)
    .select("user_id");

  if (error) throw new Error(`[keel/api] ${args.source}: ${error.message}`);
  // AUCUNE LIGNE TOUCHÉE. Deux causes, et l'élève n'a à en connaître aucune:
  // il n'a pas encore de ligne `student_goals`, ou RLS refuse celle-ci. Dans
  // les deux cas ce qu'il vient de cocher n'est nulle part, et c'est ÇA qu'il
  // doit lire — pas « Saved ».
  if (!data || data.length === 0) {
    throw new Error(
      `[keel/api] ${args.source}: nothing was saved — no goal row of yours to ` +
        `write to. Set your goal above first, then try again.`,
    );
  }
}
