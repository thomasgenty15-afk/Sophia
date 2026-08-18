/**
 * LA POSTURE DU COACH SUR L'ACTIVITÉ — ce qu'il en dit, rendu exécutable.
 *
 * ── LE PROBLÈME DE MODÈLE QUE CE FICHIER RÉSOUT ────────────────────────────
 * Le modèle KEEL dit que Sophia n'a pas d'opinion propre quand un coach
 * existe: elle sert SA méthode. Or `CoachDoctrine` porte `beliefs`,
 * `forbidden`, `vocabulary`, `arbitrations`, `foods`, `qa`, `voice`,
 * `dailyPractices` — et RIEN sur l'entraînement.
 *
 * Sophia qui recommanderait de l'activité sans que le coach l'ait dit
 * inventerait donc du contenu qu'il n'a jamais enseigné, sur le terrain même
 * où beaucoup de coachs ont une méthode forte. D'où deux versions
 * (arbitrage du propriétaire, 2026-08-10):
 *
 *   · sans coach  -> le plancher de santé publique (`activity_floor.ts`)
 *   · avec coach  -> sa posture, déclarée ici, qui REMPLACE le plancher
 *
 * ── ⛔ LA LIGNE QUI VAUT POUR LES DEUX VERSIONS ────────────────────────────
 * **Même un coach ne fait pas PROGRAMMER Sophia.** `ActivityEmphasis` est une
 * liste fermée d'ACCENTS, et il n'existe dans ce fichier aucun champ de
 * volume, de série, de charge, de pourcentage ou de fréquence chiffrée.
 * Ce qui n'existe pas dans le type ne peut pas être prescrit — même discipline
 * que `deficit_style` sans jeton `aggressive`.
 *
 * Où va alors la méthode détaillée d'un coach qui programme ? Dans ses
 * `beliefs`, où elle est DÉJÀ possible: citable dans le chat, dans sa voix,
 * tracée à sa doctrine. Le programme du coach est citable dans la
 * conversation, jamais exécuté comme prescription dans la section du plan.
 *
 * ── LE PATRON, REPRIS DU PILOTAGE DE COMPOSITION ───────────────────────────
 * Le coach répond à une question de doctrine dans SES mots; la publication
 * écrit deux choses — une `DoctrineBelief` citable (qui part au chat) et
 * l'entrée exécutable ci-dessous, qui pointe vers elle par `beliefKey`. Le
 * moteur ne lit que le jeton, le chat ne lit que la conviction.
 * **Aucun parseur de prose, nulle part.**
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/** Les accents qu'un coach peut mettre. Fermés, et aucun ne porte de volume. */
export const ACTIVITY_EMPHASES = [
  "daily_movement",
  "strength",
  "cardio",
  "recovery",
  "mobility",
] as const;
export type ActivityEmphasis = (typeof ACTIVITY_EMPHASES)[number];

/**
 * Les trois modes, et `off` est le plus important.
 *
 * ── POURQUOI `off` EXISTE, ET POURQUOI IL EST PROBABLEMENT LE PLUS DEMANDÉ ─
 * Un coach qui programme lui-même l'entraînement de ses élèves doit pouvoir
 * dire « Sophia ne dit RIEN sur l'activité aux miens ». Sans ce jeton, il
 * n'aurait aucun moyen d'empêcher le produit d'empiéter sur son métier — et un
 * coach qui voit son produit contredit par l'outil qu'il paie s'en va.
 *
 * `house` est le repli explicite: « je n'ai pas d'avis, sers le repère
 * public ». Il se distingue d'un coach MUET (aucune entrée), que l'appelant
 * traite selon l'arbitrage du fork — voir `activity_floor.ts`.
 */
export const ACTIVITY_MODES = ["off", "house", "coach"] as const;
export type ActivityMode = (typeof ACTIVITY_MODES)[number];

/**
 * Deux accents au maximum.
 *
 * Une section de trois lignes qui met cinq choses en avant n'en met aucune.
 * Le plafond est une VALIDATION DE PUBLICATION (erreur bruyante), pas une
 * troncature silencieuse: un coach dont on couperait le troisième accent sans
 * le dire croirait que sa méthode passe.
 */
export const MAX_ACTIVITY_EMPHASES = 2;

export interface ActivityStance {
  mode: ActivityMode;
  emphases: readonly ActivityEmphasis[];
  /** La conviction citable dont ce jeton est la face exécutable. */
  beliefKey: string | null;
}

/** Le défaut d'un coach qui n'a rien dit. `mode: "house"`, aucun accent. */
export const SILENT_STANCE: ActivityStance = {
  mode: "house",
  emphases: [],
  beliefKey: null,
};

export interface StanceParseResult {
  stance: ActivityStance;
  /**
   * Ce qui a été ÉCARTÉ, nommé. Jamais un repli silencieux: le dépôt a déjà
   * payé « le lecteur sait déjà réparer » — un parseur qui jette sans le dire
   * rend une QA verte parce que le repli EST le cas nominal.
   */
  issues: string[];
}

/**
 * Lit une posture depuis le jsonb de la doctrine, strictement.
 *
 * Entrée illisible ⇒ on rend `SILENT_STANCE` **et on compte**. Se replier sur
 * le silence est le comportement sûr (le coach n'a alors pas d'effet), mais un
 * repli muet ferait croire à une posture appliquée.
 */
export function parseActivityStance(raw: unknown): StanceParseResult {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      issues.push("activity_stance: not an object, ignored");
    }
    return { stance: SILENT_STANCE, issues };
  }

  const obj = raw as Record<string, unknown>;
  const modeRaw = String(obj.mode ?? "").trim().toLowerCase();
  const mode = (ACTIVITY_MODES as readonly string[]).includes(modeRaw)
    ? modeRaw as ActivityMode
    : null;
  if (mode === null) {
    if (modeRaw !== "") issues.push(`activity_stance.mode: unknown "${modeRaw}", ignored`);
    return { stance: SILENT_STANCE, issues };
  }

  const emphases: ActivityEmphasis[] = [];
  const rawList = Array.isArray(obj.emphases) ? obj.emphases : [];
  for (const entry of rawList) {
    const slug = String(entry ?? "").trim().toLowerCase();
    if (!(ACTIVITY_EMPHASES as readonly string[]).includes(slug)) {
      issues.push(`activity_stance.emphases: unknown "${slug}", dropped`);
      continue;
    }
    const emphasis = slug as ActivityEmphasis;
    if (emphases.includes(emphasis)) continue;
    if (emphases.length >= MAX_ACTIVITY_EMPHASES) {
      issues.push(
        `activity_stance.emphases: more than ${MAX_ACTIVITY_EMPHASES}, "${slug}" dropped`,
      );
      continue;
    }
    emphases.push(emphasis);
  }

  const beliefKey = String(obj.belief_key ?? obj.beliefKey ?? "").trim() || null;

  // UN MODE `coach` SANS ACCENT N'EST PAS UNE POSTURE. Il dirait « ma méthode
  // gouverne » sans rien à exécuter, et rendrait une section vide — pire que
  // le plancher, qui au moins dit quelque chose de vrai.
  if (mode === "coach" && emphases.length === 0) {
    issues.push('activity_stance: mode "coach" with no emphasis, fell back to house');
    return { stance: { mode: "house", emphases: [], beliefKey }, issues };
  }

  return { stance: { mode, emphases, beliefKey }, issues };
}

/**
 * La validation À LA PUBLICATION — bruyante, contrairement au parse.
 *
 * Le parse est tolérant parce qu'il lit des lignes déjà en base; la
 * publication est stricte parce qu'un coach est devant l'écran et doit
 * apprendre que son geste n'a pas pris. Même partage que le reste de la
 * doctrine.
 */
export function validateStanceForPublish(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["activity_stance must be an object"];
  }
  const obj = raw as Record<string, unknown>;
  const mode = String(obj.mode ?? "").trim().toLowerCase();
  if (!(ACTIVITY_MODES as readonly string[]).includes(mode)) {
    errors.push(`activity_stance.mode must be one of ${ACTIVITY_MODES.join(", ")}`);
  }
  const list = Array.isArray(obj.emphases) ? obj.emphases : [];
  for (const entry of list) {
    const slug = String(entry ?? "").trim().toLowerCase();
    if (!(ACTIVITY_EMPHASES as readonly string[]).includes(slug)) {
      errors.push(`activity_stance.emphases: unknown emphasis "${slug}"`);
    }
  }
  if (list.length > MAX_ACTIVITY_EMPHASES) {
    errors.push(
      `activity_stance.emphases: at most ${MAX_ACTIVITY_EMPHASES} (a three-line ` +
        `section that highlights five things highlights none)`,
    );
  }
  if (mode === "coach" && list.length === 0) {
    errors.push('activity_stance: mode "coach" needs at least one emphasis');
  }
  return errors;
}
