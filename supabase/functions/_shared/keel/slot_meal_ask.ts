/**
 * FF-062 C1 — LE REPAS D'UN CRÉNEAU DÉCLARÉ QUE LE PLAN NE COMPOSE PAS. PUR.
 *
 * Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
 * (canal C1, règles R3 à R6 et R10-R11).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE TROU, ET IL EST LARGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quelqu'un qui déjeune dehors cinq midis par semaine a cinq repas qui
 * n'existent NULLE PART. Le plan ne les compose pas — c'est le sens même de
 * `eating_out` — et rien ne les demande. Un objectif de poids piloté sur les
 * deux tiers de la journée est un objectif piloté sur du bruit.
 *
 * ── LE DÉCLENCHEUR EST `eating_out`, PAS LE RYTHME (R5) ──────────────────
 * Le produit porte TROIS états de présence, et le deuxième dit exactement ce
 * que ce canal cherche:
 *
 *   `at_table`   — le plan compose. Rien à demander.
 *   `eating_out` — le plan ne compose pas, MAIS il a le droit de dire un
 *                  nombre. C'est ce canal.
 *   `away`       — le plan ne compose pas et ne dit rien. La personne n'est pas
 *                  dans sa semaine; lui demander ce qu'elle a mangé pendant ses
 *                  vacances est du bruit.
 *
 * ⛔ « rythme déclaré ∖ plan composé » aurait fait partir C1 PENDANT DES
 * VACANCES: le rythme seul ne distingue pas « je mange ailleurs » de « je ne
 * mange pas ». Et lire `work_lunch` raterait l'autre moitié des cas — c'est un
 * PRÉ-REMPLISSAGE des cinq midis, pas la source. La grille (`MealPickerGrid`)
 * est l'autorité; une entrée sans `kind` vaut `away`, la direction sûre.
 *
 * ── R3, ET C'EST UNE DÉCISION CONTRE L'AVIS RÉDIGÉ ───────────────────────
 * C1 part à CHAQUE occurrence, sans plafond quotidien ni hebdomadaire. Cinq
 * déjeuners dehors font cinq questions. L'argument retenu par l'utilisateur:
 * un objectif de poids sans le déjeuner est un objectif piloté sur les deux
 * tiers de la journée. L'argument écarté: c'est la forme du formulaire
 * quotidien que ce produit a retiré. La contre-mesure vit dans §10 de la fiche
 * — le taux de `skip` tranchera ce désaccord par la donnée, pas par l'opinion.
 *
 * ⚠️ « SANS PLAFOND » N'EST PAS « SANS IDEMPOTENCE ». Un créneau déjà demandé
 * aujourd'hui ne se redemande pas: ce n'est pas une cadence, c'est le fait que
 * la question a déjà été posée. Le balayage est horaire, donc sans cette garde
 * un déjeuner produirait deux bulles dans la fenêtre de rattrapage.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import { type LocalePackKey, localePackKey } from "./locale.ts";
import { type EatingOccasion, EATING_OCCASIONS } from "./meal_generation.ts";
import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import type { GoalToken } from "./tokens.ts";

/**
 * LES OBJECTIFS QUI OUVRENT CE CANAL (R4).
 *
 * ⛔ `maintenance` EN EST EXCLU, ET CE N'EST PAS UN OUBLI. Sur un maintien, le
 * trou du midi ne change AUCUN chiffre qui pilote quoi que ce soit: la bande de
 * maintien se juge sur le poids, pas sur l'apport. T1 du domaine conversation:
 * on ne collecte que ce qu'un aval consomme.
 *
 * C'est la seule différence de portée avec C2, qui lui accepte les trois — une
 * pesée sert le maintien autant que la perte.
 */
export const SLOT_MEAL_GOALS: ReadonlySet<GoalToken> = new Set([
  "fat_loss",
  "muscle_gain",
]);

/**
 * COMBIEN D'HEURES APRÈS LE CRÉNEAU LA QUESTION PEUT ENCORE PARTIR.
 *
 * Deux. Le balayage est horaire: sans fenêtre de rattrapage, un tick raté — un
 * déploiement, un 502 de Kong — perdrait le repas définitivement. Avec quatre
 * heures, un déjeuner serait demandé à 18h, c'est-à-dire assez tard pour que la
 * réponse soit une reconstitution plutôt qu'un souvenir.
 *
 * ⚠️ DEUX HEURES NE PEUVENT PAS FAIRE SE CHEVAUCHER DEUX CRÉNEAUX aux heures de
 * repli (10h, 14h, 21h — quatre heures d'écart au minimum). Elles le peuvent
 * avec des heures DÉCLARÉES serrées, et c'est pour ça que la décision choisit le
 * créneau le plus RÉCENT parmi les éligibles.
 */
export const SLOT_MEAL_GRACE_HOURS = 2;

/** Le préfixe du jeton. Huitième vocabulaire, disjoint des sept autres. */
export const SLOT_MEAL_BUTTON_PREFIX = "KEEL_SLOTMEAL_";

/** Les trois issues offertes. Vocabulaire FERMÉ. */
export const SLOT_MEAL_ACTIONS = ["photo", "describe", "skip"] as const;
export type SlotMealAction = (typeof SLOT_MEAL_ACTIONS)[number];

const SLOT_MEAL_PAYLOAD =
  /^KEEL_SLOTMEAL_(photo|describe|skip)\|(\d{4}-\d{2}-\d{2})\|([a-z_]+)$/;

/**
 * `KEEL_SLOTMEAL_<action>|<date>|<slot>`.
 *
 * ⚠️ LE CRÉNEAU EST DANS LE JETON, ET C'EST R6 EN UNE LIGNE. L'inférence de
 * FF-018 §11 range une déclaration au DERNIER CRÉNEAU ÉCOULÉ; sur une question
 * qui NOMME le midi, elle tomberait juste par accident — c'est-à-dire faux le
 * jour où la personne répond à 21h, ou le jour où elle déclare déjeuner à 15h.
 * Le créneau voyage donc avec la question, et l'écrivain n'a rien à deviner.
 *
 * La DATE y est aussi, pour la même raison: une réponse tapée après minuit ne
 * doit pas dater le déjeuner d'hier d'aujourd'hui.
 */
export function slotMealButtonId(args: {
  action: SlotMealAction;
  localDate: string;
  slot: EatingOccasion;
}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.localDate ?? ""))) {
    throw new Error(
      `[keel/slot_meal_ask] localDate invalide: ${JSON.stringify(args.localDate)}`,
    );
  }
  if (!(EATING_OCCASIONS as readonly string[]).includes(args.slot)) {
    throw new Error(`[keel/slot_meal_ask] slot inconnu: ${JSON.stringify(args.slot)}`);
  }
  return `${SLOT_MEAL_BUTTON_PREFIX}${args.action}|${args.localDate}|${args.slot}`;
}

export interface SlotMealTap {
  action: SlotMealAction;
  localDate: string;
  slot: EatingOccasion;
}

/** Lit un tap de C1, ou rend `null` — c'est le contrat de tous les lecteurs. */
export function parseSlotMealButton(raw: unknown): SlotMealTap | null {
  const m = SLOT_MEAL_PAYLOAD.exec(String(raw ?? "").trim());
  if (!m) return null;
  const slot = m[3];
  if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) return null;
  return {
    action: m[1] as SlotMealAction,
    localDate: m[2],
    slot: slot as EatingOccasion,
  };
}

/** Pourquoi la question ne part pas. Vocabulaire FERMÉ. */
export const SLOT_MEAL_SKIPS = [
  "no_goal",
  /** R4 — `maintenance`: le trou ne change aucun chiffre qui pilote. */
  "goal_not_covered",
  "muted",
  /** Aucun créneau n'est marqué « dehors » aujourd'hui. */
  "no_eating_out_today",
  /** Un créneau est marqué, mais son heure n'est pas encore écoulée. */
  "not_elapsed",
  /** L'heure est passée depuis trop longtemps pour une question honnête. */
  "too_late",
  /** La question de ce créneau a déjà été posée aujourd'hui. */
  "already_asked",
] as const;
export type SlotMealSkip = (typeof SLOT_MEAL_SKIPS)[number];

export type SlotMealVerdict =
  | { ask: true; slot: EatingOccasion; elapsedAtHour: number }
  | { ask: false; reason: SlotMealSkip };

/** Une case « dehors »: un jour de semaine et un moment. */
export interface EatingOutCell {
  day: string;
  slots: readonly string[];
}

/**
 * La question du créneau part-elle maintenant ?
 *
 * ── L'ORDRE DES PORTES EST LA RÈGLE ─────────────────────────────────────
 * Le mute et l'objectif d'abord: ce sont les deux seules qui se lisent sans
 * toucher au rythme ni au calendrier, et elles retirent l'écrasante majorité
 * des élèves avant tout calcul.
 *
 * ⚠️ PLUSIEURS CRÉNEAUX ÉLIGIBLES ⇒ LE PLUS RÉCENT GAGNE. Une question sur le
 * petit-déjeuner posée à 14h arrive après celle du déjeuner et parle d'un repas
 * dont le souvenir est déjà reconstruit. On ne pose donc jamais deux questions
 * dans le même tick, et l'ancienne est PERDUE plutôt que retardée — c'est
 * l'arbitrage de R2 appliqué à l'intérieur d'un canal.
 */
export function decideSlotMealAsk(args: {
  goal: GoalToken | null;
  muted: boolean;
  /** Le jeton du jour local (`mon`…`sun`). */
  dayToken: string;
  localHour: number;
  /** Les cases marquées `kind: "eating_out"`, jour + moments. */
  eatingOut: readonly EatingOutCell[];
  /** `eating_rhythm` brut — c'est lui qui porte les heures DÉCLARÉES. */
  rhythmRaw: unknown;
  /** Les créneaux dont la question est DÉJÀ partie aujourd'hui. */
  askedSlotsToday: readonly string[];
}): SlotMealVerdict {
  if (args.muted) return { ask: false, reason: "muted" };
  if (!args.goal) return { ask: false, reason: "no_goal" };
  if (!SLOT_MEAL_GOALS.has(args.goal)) {
    return { ask: false, reason: "goal_not_covered" };
  }

  const day = String(args.dayToken ?? "").trim().toLowerCase();
  const marked = new Set<EatingOccasion>();
  for (const cell of args.eatingOut) {
    if (String(cell.day ?? "").trim().toLowerCase() !== day) continue;
    for (const s of cell.slots ?? []) {
      const slot = String(s ?? "").trim().toLowerCase();
      if ((EATING_OCCASIONS as readonly string[]).includes(slot)) {
        marked.add(slot as EatingOccasion);
      }
    }
  }
  if (marked.size === 0) return { ask: false, reason: "no_eating_out_today" };

  // ── L'HEURE DÉCLARÉE L'EMPORTE SUR LE REPLI ───────────────────────────
  // Quelqu'un qui a dit déjeuner à 15h n'a pas « raté » son déjeuner à 14h.
  // C'est l'arbitrage déjà écrit dans `plan_hours.ts` et réutilisé par
  // l'inférence de créneau; on ne le rejoue pas, on l'appelle.
  const declared = new Map<EatingOccasion, number | null>();
  for (const r of rhythmClockFrom(args.rhythmRaw)) declared.set(r.slot, r.hour);

  const hour = Number(args.localHour);
  if (!Number.isFinite(hour)) return { ask: false, reason: "not_elapsed" };

  const asked = new Set(
    args.askedSlotsToday.map((s) => String(s ?? "").trim().toLowerCase()),
  );

  let best: { slot: EatingOccasion; at: number } | null = null;
  let sawFuture = false;
  let sawStale = false;
  let sawAsked = false;
  for (const slot of marked) {
    // L'heure déclarée si elle existe ET est lisible, sinon le repli. Un
    // `null` déclaré (« je prends un goûter », sans heure) retombe donc sur le
    // repli — et les trois moments sans repli (`snack_am`, `snack_pm`,
    // `before_bed`) ne sont jamais demandés: ce dépôt n'a pas d'heure de
    // référence pour eux, et en inventer une ferait tomber une question sur un
    // moment que rien ne date.
    const at = declared.get(slot) ?? SLOT_PASSED_HOUR[slot];
    if (at === null || at === undefined) continue;
    if (hour < at) {
      sawFuture = true;
      continue;
    }
    if (hour >= at + SLOT_MEAL_GRACE_HOURS) {
      sawStale = true;
      continue;
    }
    if (asked.has(slot)) {
      sawAsked = true;
      continue;
    }
    if (!best || at > best.at) best = { slot, at };
  }

  if (best) return { ask: true, slot: best.slot, elapsedAtHour: best.at };
  // L'ordre des motifs de refus dit ce qui s'est passé de plus proche d'un
  // envoi: « déjà demandé » est un succès d'hier, « trop tard » un tick perdu,
  // « pas encore » l'attente normale.
  if (sawAsked) return { ask: false, reason: "already_asked" };
  if (sawStale) return { ask: false, reason: "too_late" };
  if (sawFuture) return { ask: false, reason: "not_elapsed" };
  return { ask: false, reason: "no_eating_out_today" };
}

// ---------------------------------------------------------------------------
// LA QUESTION, EN MOTS
// ---------------------------------------------------------------------------

/**
 * ⚠️ « QU'EST-CE QUE TU AS MANGÉ ? », ET RIEN D'AUTRE.
 *
 * Pas « as-tu bien mangé », pas « as-tu tenu ». Le plan ne compose rien à ce
 * moment-là: il n'y a donc AUCUNE consigne à laquelle cette assiette pourrait
 * être conforme ou non, et une question qui le sous-entendrait demanderait à la
 * personne de se noter contre une règle qui n'existe pas.
 *
 * Et « Passer » est un vrai bouton, pas une sortie honteuse: sans lui, la
 * seule façon de ne pas répondre est d'ignorer — c'est-à-dire de laisser une
 * question armée que R13 désarmera en silence.
 */
const SLOT_MEAL_COPY: Record<LocalePackKey, {
  ask: (slot: string) => string;
  slotName: Record<EatingOccasion, string>;
  photo: string;
  describe: string;
  skip: string;
  /**
   * L'accusé de « Passer ». Il ne reproche rien ET NE PRÉTEND RIEN.
   *
   * ⛔ « Passer » N'ÉCRIT AUCUN FAIT, et cette phrase ne doit donc pas dire
   * « c'est noté ». Le circuit de la fiche est explicite: seule « Décrire »
   * mène à `protocol_events`. Écrire un repas que personne n'a décrit serait
   * un fait fabriqué dans la table que le coach lit — et l'accusé qui
   * l'annoncerait serait pire encore, parce qu'il rendrait le mensonge
   * indémentable.
   */
  skipped: string;
  /** L'accusé de « Décrire » quand le fait EST écrit. */
  describing: string;
  /** Le même, quand l'écriture a échoué: on invite sans prétendre. */
  describingUnwritten: string;
  /** L'accusé de « Photo »: l'écran prend le relais. */
  photoAsked: string;
}> = {
  en: {
    ask: (slot) => `You are eating out for ${slot} today — what did you have?`,
    slotName: {
      breakfast: "breakfast",
      snack_am: "your morning snack",
      lunch: "lunch",
      snack_pm: "your afternoon snack",
      dinner: "dinner",
      before_bed: "your evening snack",
    },
    photo: "Photo",
    describe: "Tell you",
    skip: "Skip",
    skipped: "No problem — I will not count it as anything.",
    describing: "Noted. Go ahead — what was it?",
    describingUnwritten: "Go ahead — what was it?",
    photoAsked: "Send it over whenever you are ready.",
  },
  fr: {
    ask: (slot) => `Tu manges dehors pour ${slot} aujourd'hui — tu as pris quoi ?`,
    slotName: {
      breakfast: "le petit-déjeuner",
      snack_am: "ta collation du matin",
      lunch: "le déjeuner",
      snack_pm: "ton goûter",
      dinner: "le dîner",
      before_bed: "ta collation du soir",
    },
    photo: "Photo",
    describe: "Te dire",
    skip: "Passer",
    skipped: "Pas de souci — je ne compte rien.",
    describing: "C'est noté. Vas-y — c'était quoi ?",
    describingUnwritten: "Vas-y — c'était quoi ?",
    photoAsked: "Envoie-la-moi quand tu veux.",
  },
};

export interface SlotMealMessage {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

export function renderSlotMealAsk(args: {
  locale: string;
  localDate: string;
  slot: EatingOccasion;
}): SlotMealMessage {
  const copy = SLOT_MEAL_COPY[localePackKey(String(args.locale ?? ""))];
  const mk = (action: SlotMealAction) =>
    slotMealButtonId({ action, localDate: args.localDate, slot: args.slot });
  return {
    body: copy.ask(copy.slotName[args.slot]),
    buttons: [
      { payload: mk("photo"), label: copy.photo },
      { payload: mk("describe"), label: copy.describe },
      { payload: mk("skip"), label: copy.skip },
    ],
  };
}

export function renderSlotMealAck(args: {
  locale: string;
  action: SlotMealAction;
  /** `false` quand rien n'a pu être écrit: l'accusé ne prétend alors pas. */
  written: boolean;
}): string {
  const copy = SLOT_MEAL_COPY[localePackKey(String(args.locale ?? ""))];
  switch (args.action) {
    case "skip":
      // Inconditionnel: rien n'a été écrit, donc `written` n'a rien à dire ici.
      return copy.skipped;
    case "describe":
      // ⚠️ DEUX PHRASES, ET LA DIFFÉRENCE EST UN FAIT. « C'est noté » affirme
      // qu'une ligne existe; quand l'écriture a échoué, l'invitation reste et
      // l'affirmation tombe. Un accusé qui prétend est la faute que ce dépôt
      // nomme `phantom_commit`, et elle est indétectable par la personne.
      return args.written ? copy.describing : copy.describingUnwritten;
    case "photo":
      return copy.photoAsked;
  }
}

export const SLOT_MEAL_COPY_PACKS = Object.freeze(SLOT_MEAL_COPY);
