/**
 * PIVOT NUTRITION — N2 : LE TAP DU SOIR.
 *
 * Une question par jour, un tap. C'est la seule chose que ce module décide, et
 * il y a plus de raisonnement là-dedans qu'il n'y paraît.
 *
 * ── POURQUOI 3 NIVEAUX ET PAS 0-10 ───────────────────────────────────────
 * Contrainte dure d'abord : WhatsApp plafonne les boutons de réponse à TROIS
 * (limite Meta, appliquée dans `whatsapp-send` par un `slice(0, 3)`). Trois
 * métriques × cinq niveaux = quinze options : impossible en un message, et
 * trois messages par jour pour un check-in est du spam.
 *
 * Mais la contrainte tombe bien, parce que 0-10 rempli tous les jours est une
 * mauvaise échelle : les réponses se massent sur 7-8, la variance s'effondre,
 * et l'échelle transporte presque rien tout en ayant l'air précise. Un état
 * subjectif quotidien a honnêtement trois niveaux utiles.
 *
 * La finesse n'est pas perdue, elle change d'étage : 1-5 sur six axes dans le
 * point hebdomadaire, dans l'app, là où l'élève a une minute et un vrai écran.
 * Fréquence et granularité s'échangent ; on met la granularité là où le budget
 * d'effort existe.
 *
 * ── POURQUOI L'AXE N'EST DEMANDÉ QUE SI ÇA VA MAL ────────────────────────
 * Un bon jour n'a pas de coupable. Demander « qu'est-ce qui a coincé ? » à
 * quelqu'un qui va bien, c'est l'interrogatoire que §3.3bis interdit — et ça
 * produit en plus une statistique fausse, puisque l'axe serait renseigné sur
 * des journées où rien ne coinçait. La base le refuse d'ailleurs (CHECK
 * `student_daily_checkins_axis_coherent_check`).
 *
 * Ce qu'on obtient est plus actionnable qu'une moyenne : « quand ça coince
 * chez Julie, c'est la faim 4 fois sur 5 » dit à un coach quoi changer, là où
 * « énergie moyenne 6,4 » ne dit rien.
 *
 * PURE MODULE : no I/O, no clock (le caller passe `now`), no randomness.
 */

// ---------------------------------------------------------------------------
// Le vocabulaire (R1 : tokens ASCII, ils voyagent en payload de bouton)
// ---------------------------------------------------------------------------

export const PULSE_LEVELS = ["good", "mixed", "hard"] as const;
export type PulseLevel = (typeof PULSE_LEVELS)[number];

export const PULSE_AXES = ["energy", "hunger", "sleep"] as const;
export type PulseAxis = (typeof PULSE_AXES)[number];

/**
 * Les identifiants de bouton. Ce sont eux qui reviennent dans
 * `interactive_id` ; c'est donc le SEUL chemin d'interprétation déterministe
 * (§3.1 : les identifiants exacts sont du déterministe, jamais du LLM).
 */
export const PULSE_BUTTON_PREFIX = "KEEL_PULSE_";
export const PULSE_AXIS_PREFIX = "KEEL_PULSE_AXIS_";

export function pulseLevelButtonId(level: PulseLevel): string {
  return `${PULSE_BUTTON_PREFIX}${level.toUpperCase()}`;
}
export function pulseAxisButtonId(axis: PulseAxis): string {
  return `${PULSE_AXIS_PREFIX}${axis.toUpperCase()}`;
}

/**
 * 20 caractères max par titre — limite Meta, tronquée par `whatsapp-send`.
 *
 * R3 : le produit est en anglais. Ces libellés partent tels quels dans le
 * payload du bouton et doivent aussi correspondre EXACTEMENT aux boutons du
 * template Meta approuvé (voir `docs/nutrition-pivot/META-TEMPLATES.md`) : hors
 * fenêtre 24h, c'est le template qui rend le message, et un libellé qui diverge
 * ici produit deux expériences différentes selon l'heure d'envoi.
 */
const LEVEL_LABELS_EN: Record<PulseLevel, string> = {
  good: "All good",
  mixed: "So-so",
  hard: "Rough",
};
const AXIS_LABELS_EN: Record<PulseAxis, string> = {
  energy: "Energy",
  hunger: "Hunger",
  sleep: "Sleep",
};

export interface PulseButton {
  id: string;
  title: string;
}

export function pulseLevelButtons(): PulseButton[] {
  return PULSE_LEVELS.map((level) => ({
    id: pulseLevelButtonId(level),
    title: LEVEL_LABELS_EN[level],
  }));
}

export function pulseAxisButtons(): PulseButton[] {
  return PULSE_AXES.map((axis) => ({
    id: pulseAxisButtonId(axis),
    title: AXIS_LABELS_EN[axis],
  }));
}

export const PULSE_QUESTION_EN = "How was today?";
export const PULSE_AXIS_QUESTION_EN = "What was hard?";

// ---------------------------------------------------------------------------
// Lire la réponse
// ---------------------------------------------------------------------------

export type PulseReply =
  | { kind: "level"; level: PulseLevel }
  | { kind: "axis"; axis: PulseAxis }
  | { kind: "none" };

/**
 * Interprète un `interactive_id`. DÉTERMINISTE, et volontairement rien
 * d'autre : pas de repli sur le texte libre.
 *
 * Pourquoi pas de repli texte : « moyen » écrit à la main peut vouloir dire la
 * réponse au tap comme n'importe quoi d'autre dans une conversation en cours.
 * Un identifiant de bouton, lui, ne peut venir que du bouton. Un élève qui
 * répond en texte est traité comme un message normal — le dispatcher fait un
 * meilleur travail que nous là-dessus, et c'est exactement la répartition que
 * §3.1 prescrit (déterministe pour les identifiants exacts, LLM pour le sens).
 */
export function readPulseReply(interactiveId: string | null | undefined): PulseReply {
  const id = String(interactiveId ?? "").trim().toUpperCase();
  if (!id.startsWith(PULSE_BUTTON_PREFIX)) return { kind: "none" };

  if (id.startsWith(PULSE_AXIS_PREFIX)) {
    const token = id.slice(PULSE_AXIS_PREFIX.length).toLowerCase();
    return PULSE_AXES.includes(token as PulseAxis)
      ? { kind: "axis", axis: token as PulseAxis }
      : { kind: "none" };
  }
  const token = id.slice(PULSE_BUTTON_PREFIX.length).toLowerCase();
  return PULSE_LEVELS.includes(token as PulseLevel)
    ? { kind: "level", level: token as PulseLevel }
    : { kind: "none" };
}

/** Faut-il enchaîner sur la question d'axe ? */
export function needsAxisFollowUp(level: PulseLevel): boolean {
  return level !== "good";
}

// ---------------------------------------------------------------------------
// Décider l'envoi
// ---------------------------------------------------------------------------

/** La fenêtre du soir, en heure LOCALE de l'élève. */
export const PULSE_HOUR_LOCAL = 20;
export const PULSE_WINDOW_END_LOCAL = 22;

/**
 * En dessous de ce délai depuis le dernier échange, on n'ouvre PAS un message
 * séparé : la question s'attache à la réponse que Sophia est déjà en train
 * d'envoyer. Ça ne change ni la fréquence ni la donnée, seulement le nombre de
 * notifications.
 */
export const PULSE_ATTACH_IF_ACTIVE_WITHIN_MINUTES = 30;

export const PULSE_SKIP_REASONS = [
  "already_answered_today",
  "outside_window",
  "safety_active",
  "opted_out",
  "no_active_plan",
] as const;
export type PulseSkipReason = (typeof PULSE_SKIP_REASONS)[number];

export interface PulseDecisionInput {
  /** Heure locale de l'élève, 0..23. */
  localHour: number;
  /** A-t-il déjà répondu aujourd'hui ? */
  answeredToday: boolean;
  /** Minutes depuis le dernier échange, null si aucun. */
  minutesSinceLastExchange: number | null;
  /**
   * REQUIS, pas optionnel — corrigé en C4.
   *
   * Il était optionnel, et VÉRIFICATION FAITE, l'unique appelant de production
   * (`keel-daily-pulse-v1`) ne le renseignait pas. La garde `safety_active`
   * était donc testée, verte, et DÉSARMÉE en vrai: un élève en crise recevait
   * « How was today? » à 20h. C'est la classe de défaut la plus fréquente de ce
   * dépôt — des sondes vertes sur un chemin que la production ne prend pas.
   *
   * Un paramètre requis force chaque appelant à DIRE ce qu'il sait, quitte à
   * dire `null`. Un `null` explicite est une déclaration; une clé absente est
   * un oubli, et rien ne distingue les deux quand le champ est optionnel.
   */
  safetyBand: "none" | "low" | "medium" | "high" | "critical" | null;
  optedOut?: boolean;
  hasActivePlan: boolean;
}

export type PulseDecision =
  | { decision: "send"; mode: "standalone" | "attach" }
  | { decision: "skip"; reason: PulseSkipReason };

/**
 * L'ORDRE DES GARDES EST LE CONTRAT.
 *
 *   1. opted_out          — réglementaire, jamais surchargeable.
 *   2. safety_active      — on ne demande pas « ta journée ? » à quelqu'un en
 *                           crise. Le dépôt a un incident documenté d'effet
 *                           durable committé pendant un tour de crise.
 *   3. no_active_plan     — rien à suivre, donc rien à demander.
 *   4. already_answered   — un tap par jour. Le CHECK d'unicité le tient aussi,
 *                           mais mieux vaut ne pas envoyer que d'envoyer et
 *                           refuser l'écriture.
 *   5. outside_window     — hors 20h-22h locales, on ne fait rien: le tick
 *                           suivant retombera dedans. Jamais annulé, juste
 *                           pas maintenant.
 *
 * ⚠️ L'ACTIVITÉ NE SUPPRIME JAMAIS LA QUESTION. Un élève qui a envoyé trois
 * photos aujourd'hui a une bonne couverture et peut être épuisé : les photos
 * disent CE QU'IL A MANGÉ, le tap dit SI LE PROTOCOLE EST VIVABLE. Ce sont
 * deux mesures orthogonales, et laisser l'une supprimer l'autre rendrait
 * invisible exactement le cas qu'on cherche. L'activité ne change donc que le
 * MODE d'envoi (`attach` au lieu de `standalone`), jamais le fait de demander.
 */
export function decideDailyPulse(input: PulseDecisionInput): PulseDecision {
  if (input.optedOut) return { decision: "skip", reason: "opted_out" };

  const band = input.safetyBand ?? "none";
  if (band !== "none") return { decision: "skip", reason: "safety_active" };

  if (!input.hasActivePlan) return { decision: "skip", reason: "no_active_plan" };
  if (input.answeredToday) return { decision: "skip", reason: "already_answered_today" };

  const hour = Math.floor(input.localHour);
  if (!Number.isFinite(hour) || hour < PULSE_HOUR_LOCAL || hour >= PULSE_WINDOW_END_LOCAL) {
    return { decision: "skip", reason: "outside_window" };
  }

  const since = input.minutesSinceLastExchange;
  const active = since !== null && Number.isFinite(since) &&
    since <= PULSE_ATTACH_IF_ACTIVE_WITHIN_MINUTES;

  return { decision: "send", mode: active ? "attach" : "standalone" };
}

// ---------------------------------------------------------------------------
// Le rendu
// ---------------------------------------------------------------------------

export interface PulseMessage {
  body: string;
  buttons: PulseButton[];
}

export function renderPulseQuestion(): PulseMessage {
  return { body: PULSE_QUESTION_EN, buttons: pulseLevelButtons() };
}

export function renderPulseAxisQuestion(): PulseMessage {
  return { body: PULSE_AXIS_QUESTION_EN, buttons: pulseAxisButtons() };
}

/**
 * L'accusé après le tap. Court, sans commentaire sur la réponse.
 *
 * Aucune des trois formulations ne juge, ne console ni ne rebondit : « dur »
 * suivi de « courage, demain ira mieux » est exactement la tendresse non
 * groundée que la doctrine du dépôt proscrit, et sur un tap quotidien ça
 * devient insupportable en une semaine. On accuse réception, on se tait.
 */
export function renderPulseAck(level: PulseLevel, axis: PulseAxis | null): string {
  if (level === "good") return "Got it 👌";
  if (axis === null) return "Got it.";
  return "Got it, thanks.";
}
