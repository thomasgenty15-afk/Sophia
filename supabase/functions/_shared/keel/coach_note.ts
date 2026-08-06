/**
 * LA NOTE DU COACH SUR UN ÉLÈVE — décision pure + coquille d'I/O.
 *
 * Le pourquoi produit, l'arbitrage contre `docs/keel/MODEL.md` et le choix de
 * la table sont dans l'en-tête de `20260805180000_student_coach_notes.sql`.
 * Ici, seulement ce que le code décide.
 *
 * ── LA PLACE DU BLOC DANS LE PROMPT, ET POURQUOI ELLE EST FIXE ────────────
 * Trois blocs se suivent, dans cet ordre, aux trois points d'injection:
 *
 *     1. contraintes dures   (student_safety_constraints)
 *     2. doctrine du coach   (coach_beliefs, portée par objectif)
 *     3. CETTE NOTE
 *
 * L'ordre n'est pas cosmétique: le budget de prompt tronque PAR LA QUEUE, donc
 * ce qui est en bas est ce qui disparaît sur un tour riche. Une observation de
 * coach qui saute est un service dégradé; un allergène qui saute est une
 * assiette. La note est la chose la moins chère à perdre des trois, elle est
 * donc dernière — et le commentaire qui met la sécurité en tête existe déjà
 * mot pour mot dans `run.ts`.
 *
 * ── CE QUE LA NOTE NE PEUT PAS FAIRE, ET COMMENT C'EST TENU ───────────────
 * Elle n'ouvre AUCUNE clé de conviction. `student_week_plans` porte le CHECK
 * `..._doctrine_traceable_check`: une ligne nutrition sans `source_belief_key`
 * est refusée par la base. Deux verrous, pas un:
 *
 *   - le bloc le DIT au modèle (dernière ligne de `coachNotePromptBlock`);
 *   - `parseWeekPlan` reçoit `allowedKeys` et rejette toute clé hors liste.
 *
 * Le premier évite la génération perdue, le second est celui qui tient. Un
 * prompt seul ne serait qu'une politesse — la cicatrice `p8-revalidation`
 * (« prompt-only régresse en réel ») est explicitement ce qu'on évite ici.
 *
 * ── ABSENTE = ABSENTE ────────────────────────────────────────────────────
 * Pas de note ⇒ `null`, et donc RIEN dans le prompt: ni en-tête, ni « le coach
 * n'a rien noté ». C'est la condition sous laquelle cette fonctionnalité reste
 * optionnelle: un bloc « rien à signaler » injecté sur toute une cohorte
 * apprendrait au modèle que la note existe et qu'elle manque, ce qui est
 * exactement la pression par élève que le modèle refuse. Même raison de fond
 * que `NO_COACH_METHOD_BLOCK`, qui est ressorti mot pour mot dans la bouche de
 * l'agent 3/3 quand son titre décrivait un état interne.
 */

/**
 * Le plafond, en caractères.
 *
 * ⚠️ COPIE DE CONFORT. L'autorité est le CHECK `student_coach_notes_length_check`
 * (migration 20260805180000). Cette constante sert à tronquer défensivement à
 * la lecture — une ligne écrite avant un futur abaissement du plafond ne doit
 * pas gonfler le prompt en silence — et à rien d'autre. L'écriture est validée
 * par la base, pas par ici.
 */
export const COACH_NOTE_MAX_CHARS = 1500;

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
export type CoachNoteDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle?(): PromiseLike<{ data: unknown; error: unknown }>;
        limit?(n: number): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export interface LoadedCoachNote {
  /** Le texte, déjà nettoyé et borné. `null` = il n'y en a pas. */
  note: string | null;
  /**
   * Pourquoi il n'y en a pas. Tracé pour la même raison que
   * `DOCTRINE_LOAD_REASONS`: « le coach n'a rien écrit » et « je n'ai pas pu
   * lire » ne se ressemblent pas, et seul le second est un incident.
   */
  reason: "loaded" | "no_coach" | "no_note" | "load_failed";
}

const ABSENT = (reason: LoadedCoachNote["reason"]): LoadedCoachNote => ({
  note: null,
  reason,
});

/**
 * Nettoie une note brute avant qu'elle n'entre dans un prompt.
 *
 * Trois choses, et aucune n'est de la censure de contenu — le coach écrit ce
 * qu'il veut, c'est sa note:
 *
 *   1. `trim`, pour qu'une note de whitespace compte comme absente;
 *   2. plafond dur, cf. `COACH_NOTE_MAX_CHARS`;
 *   3. les lignes qui ressemblent à un en-tête de bloc (`== … ==`) sont
 *      neutralisées. Pas par méfiance envers le coach: parce que le prompt est
 *      un format à en-têtes, et qu'un `== THIS STUDENT ==` collé au milieu
 *      d'une note ferait lire la suite comme une autre section. C'est la même
 *      précaution que les titres-étiquettes de `doctrine_loader.ts`.
 */
export function sanitizeCoachNote(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw : "";
  const bounded = text.slice(0, COACH_NOTE_MAX_CHARS);
  const flattened = bounded
    .split("\n")
    .map((line) => line.replace(/^\s*={2,}/, "").replace(/={2,}\s*$/, ""))
    .join("\n")
    .trim();
  return flattened.length > 0 ? flattened : null;
}

/**
 * Le bloc injecté. `null` quand il n'y a rien — l'appelant ne pousse alors
 * aucune ligne, pas même vide.
 */
export function coachNotePromptBlock(loaded: LoadedCoachNote): string | null {
  if (!loaded.note) return null;
  return [
    // Étiquette, jamais une phrase que le modèle puisse relire à l'élève.
    "== WHAT THEIR COACH HAS NOTED ABOUT THEM ==",
    "",
    loaded.note,
    "",
    "- This is context their coach wrote about THIS student, by hand. Treat it",
    "  as true about them, and let it shape what you propose and how you say it.",
    "- It ranks BELOW their hard constraints and BELOW the coach's method: where",
    "  it meets either one, the other wins. It never unlocks a food a constraint",
    "  excludes.",
    "- It is NOT part of the method: it gives you no new conviction key.",
    "  Anything you build must still trace to a key you were given.",
    "- Never quote it, never read it back, never say the coach 'noted' or 'told",
    "  you' anything about them. Use it; do not narrate it.",
  ].join("\n");
}

/**
 * Résout le coach VIVANT de cet élève, puis sa note sur lui.
 *
 * Deux lectures et pas une jointure, pour la raison exacte donnée dans
 * `loadPublishedDoctrine`: `coach_clients` porte l'index unique partiel « un
 * seul coach vivant par élève », donc la première lecture est déjà censée être
 * unique — et si elle ne l'est plus, on veut le voir ici plutôt que de laisser
 * une jointure en choisir une au hasard.
 *
 * NE THROW JAMAIS. Une note illisible dégrade le prompt d'un cran; elle ne doit
 * pas coûter son tour à l'élève ni sa génération. Même arbitrage de panne que
 * le chargeur de doctrine.
 */
export async function loadCoachNote(
  db: unknown,
  studentUserId: string,
): Promise<LoadedCoachNote> {
  try {
    const client = db as {
      from(table: string): any;
    };

    const linkRes = await client
      .from("coach_clients")
      .select("coach_id")
      .eq("student_user_id", studentUserId)
      .eq("status", "active")
      .limit(1);
    if (linkRes?.error) throw new Error(String(linkRes.error.message ?? linkRes.error));
    const link = Array.isArray(linkRes?.data) ? linkRes.data[0] : linkRes?.data;
    const coachId = link?.coach_id ? String(link.coach_id) : null;
    if (!coachId) return ABSENT("no_coach");

    const noteRes = await client
      .from("student_coach_notes")
      .select("note")
      .eq("coach_id", coachId)
      .eq("student_user_id", studentUserId)
      .maybeSingle();
    if (noteRes?.error) throw new Error(String(noteRes.error.message ?? noteRes.error));

    const note = sanitizeCoachNote(noteRes?.data?.note);
    return note ? { note, reason: "loaded" } : ABSENT("no_note");
  } catch (error) {
    // Dit, jamais silencieux: la cicatrice `as-cast-on-foreign-type-disarms-
    // typecheck` est née d'un catch muet qui rendait null comme un succès.
    console.warn(
      "[keel] coach note unavailable for this turn",
      error instanceof Error ? error.message : String(error),
    );
    return ABSENT("load_failed");
  }
}
