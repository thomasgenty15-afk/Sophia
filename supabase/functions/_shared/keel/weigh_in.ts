/**
 * FF-062 C2 — LE RAPPEL DE PESÉE. La décision, pure.
 *
 * Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
 * (canal C2, règles R7 et R8).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE TROU QUE CE CANAL FERME
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'enveloppe énergétique d'un objectif de perte ou de maintien se recalcule
 * sur le POIDS, et le poids ne se demandait **qu'une fois par semaine**, le
 * dimanche. Six jours sur sept, le produit pilotait sur une valeur périmée.
 *
 * ── LA CADENCE, ET POURQUOI ELLE DÉPEND DE L'OBJECTIF ────────────────────
 * Une perte de 0,5 kg/semaine fait 70 g/jour, soit moins que le bruit d'une
 * balance (`WEIGHT_NOISE_KG`). Deux jours donnent 140 g — encore dans le bruit
 * point à point, mais assez de POINTS pour qu'une tendance existe. Une prise de
 * masse avance deux à trois fois plus lentement: cinq jours y produisent le
 * même signal que deux jours en perte, pour deux fois et demie moins de
 * questions.
 *
 * ⛔ CE N'EST PAS UNE PRÉFÉRENCE DE FRÉQUENCE. `maintenance` est à deux jours
 * comme la perte, et pas plus espacé: la bande de maintien (`MAINTENANCE_BAND_KG`)
 * se juge sur la DISPERSION, qui a besoin de points, pas sur une pente.
 */

import { type LocalePackKey, localePackKey } from "./locale.ts";
import type { GoalToken } from "./tokens.ts";

/**
 * LE PRÉFIXE DU JETON — septième vocabulaire, disjoint des six autres.
 *
 * ⚠️ IL COMMENCE COMME `KEEL_WEEKLY_`, ET C'EST LE PIÈGE À NE PAS LAISSER
 * OUVERT. Les deux partagent `KEEL_WE`, donc un lecteur écrit avec
 * `startsWith` confondrait les deux formulaires — le point du dimanche
 * écrirait une pesée, ou l'inverse. Les deux reconnaissances sont donc
 * ANCRÉES et complètes (`^…$`), jamais préfixées, et
 * `weigh_in_test.ts` éprouve la disjonction dans les deux sens.
 */
export const WEIGH_IN_TOKEN_PREFIX = "KEEL_WEIGHIN_";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEIGH_IN_TOKEN = /^KEEL_WEIGHIN_(\d{4}-\d{2}-\d{2})$/;

/** Le jeton du jour. Il ne porte QUE le jour local de l'élève. */
export function weighInToken(localDate: string): string {
  const date = String(localDate ?? "").trim();
  if (!ISO_DATE.test(date)) {
    throw new Error(`[keel/weigh_in] localDate invalide: ${JSON.stringify(localDate)}`);
  }
  return `${WEIGH_IN_TOKEN_PREFIX}${date}`;
}

/** Le jour que ce jeton nomme, ou `null` si ce n'en est pas un. */
export function parseWeighInToken(raw: unknown): string | null {
  const m = WEIGH_IN_TOKEN.exec(String(raw ?? "").trim());
  return m ? m[1] : null;
}

/**
 * LA CADENCE, EN JOURS, PAR OBJECTIF.
 *
 * ⚠️ UN `Record` COMPLET SUR `GoalToken`, PAS UNE TABLE PARTIELLE AVEC UN
 * DÉFAUT. Un quatrième objectif ajouté à `GOAL_TOKENS` ne compilera pas tant
 * que quelqu'un n'aura pas dit à quelle cadence il se pèse — et c'est la seule
 * façon d'éviter qu'il hérite en silence de la cadence de la perte.
 */
export const WEIGH_IN_INTERVAL_DAYS: Record<GoalToken, number> = {
  // ⟳ 2026-09-08 — DE DEUX À TROIS JOURS, ET C'EST UNE DÉCISION PRODUIT.
  //
  // Demandé tel quel: « la question tous les 3 jours de mettre à jour le poids ».
  // Le sens va dans la direction que ce module défend déjà partout — moins
  // souvent plutôt que plus — et il tombe le même jour que la boucle par repas,
  // qui, elle, ajoute des sollicitations. Alléger celle-ci pendant qu'on
  // alourdit l'autre est ce qui empêche la journée de devenir un formulaire.
  fat_loss: 3,
  // ⛔ ON N'Y TOUCHE PAS. C2 couvre les TROIS objectifs — une pesée sert le
  // maintien autant que la perte. Ce que `maintenance` ne reçoit pas, c'est C1,
  // la boucle par repas. Bouger cette ligne-ci serait un changement produit
  // silencieux sur une cohorte que ce lot ne concerne pas.
  maintenance: 2,
  // ⛔ ON N'Y TOUCHE PAS NON PLUS, ET LE RAPPORT SE DÉGRADE — dit ici plutôt
  // que découvert plus tard. Le raisonnement d'origine était un RAPPORT: « cinq
  // jours en prise = deux jours en perte », soit 2,5×. Avec la perte à trois
  // jours, le rapport tombe à 1,67×. Rien n'a été demandé sur la prise de
  // masse, et déplacer une cadence par symétrie arithmétique serait décider à
  // la place de quelqu'un. Si on la bouge un jour, `ASK_LOOKBACK_DAYS`
  // (`weigh_in_io.ts`) doit suivre: sa justification est « deux cycles
  // complets » contre la cadence maximale.
  muscle_gain: 5,
};

/**
 * LA FENÊTRE LOCALE — 17h à 19h.
 *
 * ── POURQUOI CES DEUX HEURES, ET PAS « DANS LA JOURNÉE » ─────────────────
 * La fiche dit « dans la journée ». Deux bornes de plus sont nécessaires parce
 * que les canaux se coordonnaient jusqu'ici par une CONVENTION écrite dans le
 * commentaire d'un seul des deux crons (§1 de la fiche), et qu'un troisième
 * canal ajouté sans la connaître produit deux notifications le même soir.
 *
 * 17h-19h ne croise donc AUCUN autre canal, et c'est vérifiable:
 *   · C1 tombe à 10h, 14h et 21h (les créneaux écoulés);
 *   · C3, le bilan du jour, tient 20h-22h;
 *   · C4, le point de la semaine, tient 18h-21h — MAIS le dimanche seulement,
 *     et l'arbitre (`proactive_arbiter.ts`) tranche ce seul recouvrement.
 *
 * Et pas le matin: une pesée se fait au lever, donc une question posée à 8h
 * arrive AVANT le geste qu'elle demande. 17h attrape le geste du matin.
 */
export const WEIGH_IN_WINDOW_START_HOUR = 17;
export const WEIGH_IN_WINDOW_END_HOUR = 19;

/** Pourquoi la pesée ne se demande pas. Vocabulaire FERMÉ. */
export const WEIGH_IN_SKIPS = [
  /** Aucun objectif lisible. Fail-closed: on ne demande pas ce qu'on n'exploitera pas. */
  "no_goal",
  /** R7 — le plancher TCA est levé. */
  "restriction_floor",
  /** L'élève a coupé le proactif. */
  "muted",
  /** L'heure locale n'est pas dans la fenêtre. */
  "outside_window",
  /** La dernière PESÉE est trop récente pour la cadence de cet objectif. */
  "measured_recently",
  /** R2 — on a DÉJÀ demandé, et la cadence n'est pas écoulée depuis. */
  "asked_recently",
] as const;
export type WeighInSkip = (typeof WEIGH_IN_SKIPS)[number];

export type WeighInVerdict =
  | {
    ask: true;
    /** Jours écoulés depuis la dernière pesée, `null` s'il n'y en a jamais eu. */
    sinceDays: number | null;
    /** Le dernier poids connu, pour le PLACEHOLDER (R8). Jamais pré-rempli. */
    lastKg: number | null;
    intervalDays: number;
  }
  | { ask: false; reason: WeighInSkip };

/** Jours entre deux dates ISO. Ancré à midi (voir `local_date.addDays`). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * La pesée se demande-t-elle maintenant ?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LES DEUX HORLOGES, ET POURQUOI IL EN FAUT DEUX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La cadence se compte depuis la dernière PESÉE — c'est elle qui dit si la
 * mesure est périmée. Mais compter SEULEMENT depuis la pesée produit un défaut
 * net: quelqu'un qui ignore la question ne se pèse pas, donc l'écart grandit,
 * donc la question repart **le lendemain**, puis le surlendemain. Cinq jours de
 * silence font cinq questions — très exactement ce que R2 interdit (*« un canal
 * ignoré ne se répète jamais »*), et le mécanisme par lequel un élève apprend
 * que se taire déclenche un ping.
 *
 * On exige donc que la cadence soit écoulée depuis la dernière PESÉE **et**
 * depuis la dernière DEMANDE. Conséquence assumée: quelqu'un qui ignore une
 * question en perte de poids est redemandé deux jours plus tard, pas le
 * lendemain — la boucle se réamorce d'elle-même sans jamais insister.
 *
 * ⚠️ AUCUNE PESÉE DU TOUT ⇒ ON DEMANDE. `sinceDays: null` n'est pas « trop
 * récent »: c'est une série qui n'a pas de premier point, et la ceinture de
 * restriction n'a alors rien à quoi comparer le second.
 *
 * ⛔ FAIL-CLOSED SUR L'OBJECTIF (§7 de la fiche). `goal: null` couvre « pas
 * d'objectif » ET « lecture en panne » — l'appelant ne doit PAS distinguer les
 * deux ici. Se taire coûte une pesée; parler demande son poids tous les deux
 * jours à quelqu'un dont on ne sait rien.
 */
export function decideWeighIn(args: {
  goal: GoalToken | null;
  /** R7 — `true` aussi quand la lecture du plancher a échoué (fail-closed). */
  restrictionFlag: boolean;
  muted: boolean;
  /** L'heure locale de l'élève, 0-23. */
  localHour: number;
  today: string;
  lastMeasuredOn: string | null;
  lastKg: number | null;
  /** Le jour local de la dernière DEMANDE de pesée, ou `null`. */
  lastAskedOn: string | null;
}): WeighInVerdict {
  if (args.muted) return { ask: false, reason: "muted" };
  if (args.restrictionFlag) return { ask: false, reason: "restriction_floor" };
  if (!args.goal) return { ask: false, reason: "no_goal" };

  const hour = Number(args.localHour);
  if (
    !Number.isFinite(hour) ||
    hour < WEIGH_IN_WINDOW_START_HOUR ||
    hour >= WEIGH_IN_WINDOW_END_HOUR
  ) {
    return { ask: false, reason: "outside_window" };
  }

  const interval = WEIGH_IN_INTERVAL_DAYS[args.goal];

  const measured = String(args.lastMeasuredOn ?? "").trim();
  let sinceDays: number | null = null;
  if (measured) {
    const d = daysBetween(measured, args.today);
    // Une date illisible ne vaut PAS « jamais pesé »: elle vaut « on ne sait
    // pas », et on ne dérange pas sur une lecture qu'on ne comprend pas.
    if (!Number.isFinite(d)) return { ask: false, reason: "measured_recently" };
    sinceDays = d;
    if (d < interval) return { ask: false, reason: "measured_recently" };
  }

  const asked = String(args.lastAskedOn ?? "").trim();
  if (asked) {
    const d = daysBetween(asked, args.today);
    if (!Number.isFinite(d) || d < interval) {
      return { ask: false, reason: "asked_recently" };
    }
  }

  const kg = Number(args.lastKg);
  return {
    ask: true,
    sinceDays,
    // ⚠️ `Number.isFinite`, pas une vérité: `Number(null)` vaut 0, et un
    // placeholder « 0 kg » est pire qu'un placeholder absent.
    lastKg: Number.isFinite(kg) && kg > 0 ? kg : null,
    intervalDays: interval,
  };
}

// ---------------------------------------------------------------------------
// LA QUESTION, EN MOTS
// ---------------------------------------------------------------------------

/**
 * LA PHRASE ET SON BOUTON, PAR LANGUE.
 *
 * ── CE QUE LA PHRASE NE FAIT PAS, ET CHACUN A SON MOTIF ──────────────────
 *
 *   · **elle ne cite aucun chiffre.** Ni le dernier poids, ni l'écart à la
 *     cible, ni « il te reste X kg ». Le poids est une mesure qu'on demande, pas
 *     un score qu'on rend — et le dernier poids arrive en PLACEHOLDER dans le
 *     champ (R8), c'est-à-dire à l'endroit où il aide à saisir plutôt qu'à
 *     l'endroit où il juge;
 *   · **elle ne félicite ni ne déplore.** « Tu es sur la bonne voie » sur une
 *     série de deux points est une affirmation que personne n'a calculée;
 *   · **elle nomme la CADENCE**, parce que c'est la seule information qui rend
 *     la question prévisible: « ça fait deux jours » dit pourquoi elle arrive
 *     maintenant et pas hier.
 *
 * R7 par délégation: `localePackKey` jette sur une langue non livrée.
 */
const WEIGH_IN_COPY: Record<LocalePackKey, {
  /** `days` est `null` quand la personne ne s'est jamais pesée. */
  ask: (days: number | null) => string;
  button: string;
  /** Le geste est accusé, JAMAIS la valeur. Voir `renderWeighInAck`. */
  noted: string;
  /** Le champ était vide: on le DIT plutôt que d'accuser une écriture nulle. */
  nothing: string;
  outOfRange: (min: number, max: number) => string;
  failed: string;
}> = {
  en: {
    ask: (days) =>
      days === null
        ? "I do not have a weight for you yet — one number and your plan starts working from your body instead of an average."
        : `It has been ${days} day${days === 1 ? "" : "s"} since your last weigh-in. Where are you at?`,
    button: "Log my weight",
    noted: "Got it, noted.",
    nothing: "Nothing was entered, so nothing was saved. Send it whenever you have stepped on the scale.",
    outOfRange: (min, max) =>
      `That is outside what I can read as a weight (${min}-${max} kg), so I have not saved it. Have another go.`,
    failed:
      "Something went wrong on my side and I couldn't save that. Sorry — could you send it again?",
  },
  fr: {
    ask: (days) =>
      days === null
        ? "Je n'ai pas encore de poids pour toi — un chiffre, et ton plan part de ton corps plutôt que d'une moyenne."
        : `Ça fait ${days} jour${days === 1 ? "" : "s"} depuis ta dernière pesée. Tu en es où ?`,
    button: "Noter mon poids",
    noted: "C'est noté.",
    nothing: "Rien n'a été saisi, donc rien n'a été enregistré. Envoie-le quand tu seras monté sur la balance.",
    outOfRange: (min, max) =>
      `C'est en dehors de ce que je peux lire comme un poids (${min} à ${max} kg), donc je ne l'ai pas enregistré. Réessaie.`,
    failed:
      "Quelque chose a mal tourné de mon côté et je n'ai pas pu enregistrer ça. Désolée — tu peux me le renvoyer ?",
  },
};

export interface WeighInMessage {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

/**
 * Le message de C2 — UN bouton, qui OUVRE un formulaire.
 *
 * ⚠️ UN BOUTON ET PAS UN CHAMP DANS LA BULLE. Le jeton se reconnaît par sa
 * FORME côté front, qui monte alors un dialogue local — exactement le patron du
 * point du dimanche (`isWeeklyCheckInToken` → `WeeklyCheckInDialog`). Un poids
 * tapé en texte libre retomberait sur l'extraction de FF-008, qui est un
 * plancher de rattrapage et n'a ni bornes affichées ni message d'erreur.
 */
export function renderWeighInAsk(args: {
  locale: string;
  localDate: string;
  sinceDays: number | null;
}): WeighInMessage {
  const copy = WEIGH_IN_COPY[localePackKey(String(args.locale ?? ""))];
  return {
    body: copy.ask(args.sinceDays),
    buttons: [{ payload: weighInToken(args.localDate), label: copy.button }],
  };
}

/** Les paquets, exportés pour que le harnais de parité les lise. */
export const WEIGH_IN_COPY_PACKS = Object.freeze(WEIGH_IN_COPY);

/**
 * L'ACCUSÉ — le geste, jamais la valeur.
 *
 * ⛔ « Noté : 78,4 kg » semble serviable et ne l'est pas. Cet écran est le même
 * qui se RETIRE quand la garde restrictive est armée, et un produit qui refuse
 * de montrer un poids à un élève à risque ne doit pas le lui renvoyer par la
 * bulle d'à côté. La règle est déjà écrite mot pour mot pour la carte des
 * mesures (`writeMeasures`); elle vaut ici pour la même raison.
 */
export function renderWeighInAck(args: {
  locale: string;
  outcome:
    | { ok: true }
    | { ok: false; reason: "empty" | "not_a_number" }
    | { ok: false; reason: "out_of_range"; min: number; max: number }
    | { ok: false; reason: "failed" };
}): string {
  const copy = WEIGH_IN_COPY[localePackKey(String(args.locale ?? ""))];
  if (args.outcome.ok) return copy.noted;
  switch (args.outcome.reason) {
    case "empty":
    case "not_a_number":
      return copy.nothing;
    case "out_of_range":
      return copy.outOfRange(args.outcome.min, args.outcome.max);
    case "failed":
      return copy.failed;
  }
}
