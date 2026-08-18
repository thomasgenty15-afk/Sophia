/**
 * LA SÉANCE LOGUÉE — un FAIT, jamais une énergie.
 *
 * ── LES DEUX BORNES DÉCIDÉES LE 2026-08-18, ET ELLES SONT DES REFUS ────────
 *
 * 1. ON NE RÈGLE RIEN DEPUIS UNE SÉANCE. Ni le plan, ni les repas, ni
 *    l'enveloppe du jour. « L'exercice n'est pas fixe »: une semaine à trois
 *    séances suivie d'une semaine à zéro produirait deux enveloppes
 *    différentes pour la même personne, et l'élève verrait ses portions bouger
 *    parce qu'il a couru. Rien dans ce module ne rend un facteur, un
 *    multiplicateur, ni quoi que ce soit qu'un générateur puisse consommer.
 *
 * 2. AUCUNE ÉNERGIE, NULLE PART. Pas de colonne kcal en base, pas de champ
 *    d'énergie ici, aucun nombre de calories rendu à qui que ce soit. La
 *    raison est CHIFFRÉE et elle n'est pas de la pudeur:
 *
 *      · le déficit visé est de 400-500 kcal/jour;
 *      · l'erreur d'une dépense d'exercice DÉCLARÉE est de ±30-50 %, soit
 *        150-250 kcal sur une séance annoncée à 500.
 *
 *    Soustraire cette dépense AUGMENTE donc l'incertitude de la journée au
 *    lieu de la réduire — on remplacerait une inconnue par une inconnue plus
 *    grande, avec l'aplomb d'un tableau. Le fait (« 3 séances ») est vrai;
 *    son dérivé ne l'est pas.
 *
 *    ⚠️ La prochaine session voudra ajouter la colonne. La même raison est
 *    écrite dans l'en-tête de `20260818180000_a_session_is_a_fact_not_an_energy.sql`,
 *    et la ceinture qui refuse un nombre d'énergie dans le bilan est
 *    `acceptComposedWeekReview` (`reason: "energy_number"`).
 *
 * ── POURQUOI LA TABLE EXISTE QUAND MÊME ───────────────────────────────────
 * À terme, le vrai lecteur est le RÉ-ANCRAGE SUR L'OBSERVÉ (« étape 8 », déjà
 * nommée dans `meal_envelope.ts`): le facteur d'activité réel se déduit de la
 * trajectoire de poids croisée avec les ingesta sur 3-4 semaines. C'est là
 * qu'une mesure grossière devient rentable, parce qu'elle est recalée par une
 * balance et non convertie en calories. Hors périmètre de ce lot.
 *
 * Aujourd'hui, le lecteur est le BILAN HEBDO (`week_review.ts`) — un compte de
 * séances, au même titre que les autres lignes comptées du bilan.
 *
 * PURE MODULE: no I/O, no clock (l'appelant passe les dates), no randomness.
 */

/**
 * DE QUOI ÉTAIT FAITE LA SÉANCE. Liste fermée et courte.
 *
 * ── C'EST LE VOCABULAIRE D'`ACTIVITY_EMPHASES`, MOT POUR MOT ──────────────
 * Ce dépôt porte déjà trois listes qui touchent à l'activité, et une
 * quatrième aurait été la faute:
 *
 *   · `PRACTICE_KINDS` (`daily_practices.ts`) — le SUJET d'une pratique du
 *     coach (`hydration`, `movement`, `sleep`…). `movement` y est UN sujet
 *     parmi sept; ce n'est pas une typologie de séance.
 *   · `ACTIVITY_LEVELS` (`tokens.ts`) — un TRAIT DURABLE de la personne
 *     (`sedentary` … `trains_hard`), pas un événement daté.
 *   · `ACTIVITY_CLASS` (`tokens.ts`) — la classe d'un ENGAGEMENT
 *     (`nutrition`, `movement`, `recovery`…), avec exemption R6 explicite.
 *   · `ACTIVITY_EMPHASES` (`activity_stance.ts`) — les ACCENTS qu'un coach
 *     peut mettre sur l'entraînement. C'est la seule des quatre qui décrit
 *     DE QUOI est faite une séance, et c'est donc celle-ci.
 *
 * Le bénéfice n'est pas cosmétique: le jour où quelqu'un voudra rapprocher ce
 * que l'élève A FAIT de ce que son coach MET EN AVANT, les deux se comparent
 * sans table de correspondance. Une table de correspondance entre deux listes
 * qui disaient la même chose est exactement la dette qu'on évite ici.
 *
 * ── ⚠️ POURQUOI CETTE LISTE EST RECOPIÉE ET PAS IMPORTÉE ──────────────────
 * `activity_stance.ts` N'EST PAS DANS HEAD au moment de ce lot: c'est le
 * travail en cours d'une autre session, présent sur le disque et pas dans
 * l'historique. Importer depuis lui rendrait ce module-ci incompilable pour
 * quiconque n'a pas ce disque-là — le dépôt a déjà la cicatrice
 * (`i18n-layer-is-uncommitted-foreign-work`).
 *
 * CONDITION DE RETRAIT, nommée pour que ce commentaire meure un jour: dès que
 * `activity_stance.ts` est dans HEAD, remplacer le littéral ci-dessous par
 * `ACTIVITY_EMPHASES` — ou, à défaut, poser un test qui assert l'égalité des
 * deux listes. Deux listes identiques sans rien qui le vérifie divergent.
 *
 * ── PAS DE JETON `other` ──────────────────────────────────────────────────
 * `PRACTICE_KINDS` en a un, et il est justifié là-bas: le coach écrit en prose
 * et le classement est fait par un modèle. Ici la valeur vient d'un choix à
 * l'écran, entre cinq tuiles. Un `other` deviendrait la tuile la plus cliquée,
 * et la colonne ne dirait plus rien.
 */
export const ACTIVITY_SESSION_KINDS = [
  /** Marche, vélo utilitaire, jardinage — ce qui bouge sans être un entraînement. */
  "daily_movement",
  /** Renforcement, musculation, poids du corps. */
  "strength",
  /** Course, natation, rameur, sport collectif. */
  "cardio",
  /** Séance de récupération: marche lente, sortie facile, sauna. */
  "recovery",
  /** Mobilité, yoga, étirements. */
  "mobility",
] as const;
export type ActivitySessionKind = (typeof ACTIVITY_SESSION_KINDS)[number];

/**
 * L'INTENSITÉ EN CRANS, JAMAIS UN NOMBRE.
 *
 * Même arbitrage, mot pour mot, que les quatre crans d'activité de
 * `tokens.ts`: « un nombre demandé à l'utilisateur est un nombre qu'il
 * invente, et l'inventé entre ensuite dans un calcul avec l'autorité d'une
 * mesure ». Un RPE sur 10 ou une fréquence cardiaque moyenne sont exactement
 * ça — et ils seraient, en plus, le premier ingrédient d'un calcul de dépense.
 *
 * `null` reste possible en base: c'est « pas déclaré », et une intensité non
 * déclarée ne se devine pas. Le compte `undeclared` de `WeekActivitySummary`
 * porte cette absence en clair, comme `portions.unclear` le fait déjà.
 */
export const ACTIVITY_INTENSITIES = ["easy", "moderate", "hard"] as const;
export type ActivityIntensity = (typeof ACTIVITY_INTENSITIES)[number];

/**
 * D'OÙ VIENT LA LIGNE. Liste fermée, et elle est LUE.
 *
 * Mêmes jetons que les autres tables du dépôt qui portent un geste d'élève
 * (`student_body_measures.source`, `student_daily_checkins.source`): `app`
 * pour l'écran, `chat` pour la conversation. Laisser une séance dite en
 * passant se faire passer pour une saisie d'écran rendrait l'historique
 * inexploitable le jour où on voudra comparer les deux gestes.
 */
export const ACTIVITY_SESSION_SOURCES = ["app", "chat"] as const;
export type ActivitySessionSource = (typeof ACTIVITY_SESSION_SOURCES)[number];

/**
 * Les bornes de PLAUSIBILITÉ d'une durée, et ce sont celles de la base.
 *
 * Volontairement larges: il ne s'agit pas de juger un entraînement mais
 * d'attraper une faute de frappe (« 900 » pour 90) et une unité mal lue (des
 * secondes prises pour des minutes). 600 minutes = dix heures, ce qui couvre
 * une randonnée à la journée et refuse un chiffre qui ne peut être qu'une
 * erreur de saisie.
 */
export const ACTIVITY_SESSION_MIN_MINUTES = 1;
export const ACTIVITY_SESSION_MAX_MINUTES = 600;

const KIND_SET: ReadonlySet<string> = new Set(ACTIVITY_SESSION_KINDS);
const INTENSITY_SET: ReadonlySet<string> = new Set(ACTIVITY_INTENSITIES);

/**
 * Le jeton, ou `null`. NE JETTE PAS, contrairement aux parseurs de `tokens.ts`.
 *
 * La différence est la provenance: `tokens.ts` parse ce qu'un MODÈLE a produit
 * (un jeton inconnu y est un bug de prompt, et il doit être bruyant). Ici on
 * relit des lignes que la base a déjà acceptées sous contrainte CHECK. Un
 * inconnu ne peut donc venir que d'une migration qui a élargi la liste sans
 * élargir ce module — et faire tomber le bilan hebdo entier d'un élève pour ça
 * serait le pire échange possible. La ligne est écartée, comptée nulle part.
 */
export function parseActivitySessionKind(value: unknown): ActivitySessionKind | null {
  const token = String(value ?? "").trim();
  return KIND_SET.has(token) ? token as ActivitySessionKind : null;
}

export function parseActivityIntensity(value: unknown): ActivityIntensity | null {
  const token = String(value ?? "").trim();
  return INTENSITY_SET.has(token) ? token as ActivityIntensity : null;
}

/** Une ligne de `student_activity_sessions`, réduite à ce que le bilan regarde. */
export interface ActivitySessionInput {
  /** `local_date` — le jour de l'élève, jamais `created_at`. */
  localDate: string;
  kind: ActivitySessionKind | null;
  /** `duration_min`, ou `null` quand la durée n'a pas été déclarée. */
  durationMin: number | null;
  intensity: ActivityIntensity | null;
}

/**
 * CE QUE LA SEMAINE A PORTÉ EN SÉANCES. Des comptes, et rien d'autre.
 *
 * ⚠️ AUCUN CHAMP DÉRIVÉ. Pas de dépense, pas de « charge », pas de moyenne
 * d'intensité — une intensité moyenne est un score déguisé en mesure, et ce
 * produit a supprimé les scores exprès (`MODEL.md` §3).
 *
 * La forme reprend celle de `PortionBandSummary` et de `LivabilitySummary`,
 * qui sont ses deux voisines dans la même lecture: des comptes par cran, plus
 * le dénominateur de ce qu'on a su lire. Trois formes différentes pour trois
 * comptes du même bilan seraient une divergence gratuite.
 */
export interface WeekActivitySummary {
  /** Séances loguées sur la fenêtre. LE fait, et le seul qui soit rendu à l'élève. */
  sessions: number;
  /** Jours DISTINCTS portant au moins une séance. `sessions` peut le dépasser. */
  days: number;
  /**
   * Somme des minutes DÉCLARÉES. Jamais convertie en quoi que ce soit.
   *
   * ⚠️ SON DÉNOMINATEUR EST `minutesFrom`, ET IL EST OBLIGATOIRE. Une somme de
   * minutes sur des séances dont la moitié n'en portait pas est un nombre qui
   * ment par défaut — même défaut que « 82 lignes d'huile sans quantité », où
   * l'énergie disparaissait en silence parce que la somme n'annonçait pas
   * combien de lignes elle avait vues.
   */
  minutes: number;
  /** Sur combien de séances ces minutes ont été déclarées. Le dénominateur honnête. */
  minutesFrom: number;
  /** Les crans, COMPTÉS. `undeclared` est un compte comme les autres, pas un trou. */
  byIntensity: {
    easy: number;
    moderate: number;
    hard: number;
    undeclared: number;
  };
}

/** Une semaine sans aucune séance. Rendue, jamais imprimée (voir `renderWeekActivityFact`). */
export const EMPTY_WEEK_ACTIVITY: WeekActivitySummary = {
  sessions: 0,
  days: 0,
  minutes: 0,
  minutesFrom: 0,
  byIntensity: { easy: 0, moderate: 0, hard: 0, undeclared: 0 },
};

/**
 * Compte les séances de la fenêtre.
 *
 * `weekDates` BORNE le compte, et ce n'est pas de la défiance envers
 * l'appelant: `loadWeekFacts` interroge déjà la base entre deux dates, mais un
 * fuseau décalé peut rendre une ligne du dimanche précédent. Le bilan compte
 * la fenêtre qu'il ANNONCE, sinon il porte un nombre que ses propres dates ne
 * justifient pas — exactement ce que `weekReviewPromptBlock` interdit au
 * modèle de faire.
 */
export function summarizeWeekActivity(
  sessions: readonly ActivitySessionInput[],
  weekDates: readonly string[],
): WeekActivitySummary {
  const window: ReadonlySet<string> = new Set(
    weekDates.map((d) => String(d ?? "").trim()).filter(Boolean),
  );
  const days = new Set<string>();
  const out: WeekActivitySummary = {
    sessions: 0,
    days: 0,
    minutes: 0,
    minutesFrom: 0,
    byIntensity: { easy: 0, moderate: 0, hard: 0, undeclared: 0 },
  };

  for (const session of sessions ?? []) {
    const localDate = String(session?.localDate ?? "").trim();
    if (!localDate || !window.has(localDate)) continue;
    out.sessions++;
    days.add(localDate);

    const minutes = Number(session?.durationMin);
    // Une durée hors bornes n'est pas comptée à zéro: elle n'est pas comptée
    // du tout, et `minutesFrom` le dit. Un zéro ajouté à la somme ferait
    // baisser une moyenne que personne n'a mesurée.
    if (
      Number.isFinite(minutes) &&
      minutes >= ACTIVITY_SESSION_MIN_MINUTES &&
      minutes <= ACTIVITY_SESSION_MAX_MINUTES
    ) {
      out.minutes += Math.round(minutes);
      out.minutesFrom++;
    }

    const intensity = parseActivityIntensity(session?.intensity);
    if (intensity === null) out.byIntensity.undeclared++;
    else out.byIntensity[intensity]++;
  }

  out.days = days.size;
  return out;
}

/** Relit un résumé stocké dans `weekly_reviews.week_facts`, ou `null`. */
export function parseWeekActivity(raw: unknown): WeekActivitySummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const bands = (record.byIntensity && typeof record.byIntensity === "object" &&
      !Array.isArray(record.byIntensity))
    ? record.byIntensity as Record<string, unknown>
    : {};
  const n = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    sessions: n(record.sessions),
    days: n(record.days),
    minutes: n(record.minutes),
    minutesFrom: n(record.minutesFrom),
    byIntensity: {
      easy: n(bands.easy),
      moderate: n(bands.moderate),
      hard: n(bands.hard),
      undeclared: n(bands.undeclared),
    },
  };
}

/**
 * LA PHRASE DU FAIT, ou `null` quand il n'y a rien à dire.
 *
 * ── ZÉRO SÉANCE NE S'IMPRIME JAMAIS ───────────────────────────────────────
 * « 0 séance cette semaine » est un reproche déguisé en compte, et le dépôt a
 * déjà payé exactement cette phrase: le bilan s'ouvrait sur « 0 des 5 jours
 * que j'ai vus » pour un évitement tenu, et la leçon écrite dans
 * `renderDeterministicWeekReview` est qu'un décompte à zéro se lit comme un
 * échec. Ici c'est pire encore: personne n'a promis de séance, aucune
 * prescription individuelle n'existe (`MODEL.md` §3), donc zéro n'est même pas
 * un manque — c'est une semaine dont on ne sait rien côté mouvement.
 *
 * `null` (résumé absent, gel antérieur à ce lot, lecture en panne) rend `null`
 * pour la même raison: on n'imprime pas un zéro qu'on n'a pas compté.
 *
 * ── AUCUN DÉICTIQUE TEMPOREL ──────────────────────────────────────────────
 * Pas de « cette semaine »: le formulaire peut revenir le mardi suivant, et ce
 * module n'a pas d'horloge. La fenêtre est portée par le bloc de contexte, qui
 * a les dates. Même règle que la branche `no_method` juste à côté.
 */
export function renderWeekActivityFact(
  activity: WeekActivitySummary | null,
): string | null {
  if (!activity || activity.sessions <= 0) return null;
  if (activity.sessions === 1) return "You also logged 1 training session.";
  const days = activity.days === 1 ? "1 day" : `${activity.days} days`;
  return `You also logged ${activity.sessions} training sessions across ${days}.`;
}
