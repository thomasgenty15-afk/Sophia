const MORNING_ENCOURAGEMENT_START_LOCAL_TIME = "08:00";
const MORNING_ENCOURAGEMENT_END_LOCAL_TIME = "10:00";
const EVENING_REVIEW_START_LOCAL_TIME = "19:00";
const EVENING_REVIEW_END_LOCAL_TIME = "21:30";
// Nudge des actions du soir (time_of_day=evening): fin d'après-midi, avant
// que le soir commence.
const LATE_AFTERNOON_NUDGE_START_LOCAL_TIME = "16:45";
const LATE_AFTERNOON_NUDGE_END_LOCAL_TIME = "17:45";
// Nudge des actions de nuit (night, ce soir) et de pré-engagement réveil
// (wake_up, demain matin). Fenêtre volontairement APRÈS la fin de la review
// du soir (21:30) pour exclure toute collision le même soir.
const NIGHT_PREP_START_LOCAL_TIME = "21:35";
const NIGHT_PREP_END_LOCAL_TIME = "22:00";

// ---------------------------------------------------------------------------
// KEEL W4.6 — slot reminder windows
// ---------------------------------------------------------------------------
//
// Les quatre fenêtres ci-dessus couvrent 08:00-10:00, 16:45-17:45, 19:00-21:30 et
// 21:35-22:00. Elles laissent un TROU PROACTIF COMPLET de 10:00 à 16:45 — c'est-à-dire
// exactement `snack_am` (10:30), `lunch` (12:30) et `snack_pm` (16:30), les trois
// créneaux alimentaires que tout plan de nutrition prescrit. Le runtime héritait
// d'un produit d'habitudes où la journée n'avait que deux moments de levier ;
// KEEL en a huit, et deux repas sur trois tombaient dans un angle mort.
//
// Chaque créneau du `slot_vocabulary` qui porte un `default_local_time` reçoit donc
// sa fenêtre, calée AVANT ou AUTOUR de l'heure nominale du créneau (on rappelle un
// déjeuner à 12h05, pas à 13h).
//
// CONTRAINTE DURE, découverte en sondant la base et non en lisant le code :
// `trg_scheduled_checkins_enforce_min_gap_1h` est un trigger BEFORE INSERT qui
// REÉCRIT `scheduled_for` pour garantir 1 h entre deux checkins actifs du même
// utilisateur. Deux conséquences, toutes deux payées ici :
//   1. deux fenêtres KEEL séparées de moins d'une heure font glisser le second
//      rappel — un rappel de déjeuner qui arrive à 13h30 n'est pas en retard,
//      il est faux ;
//   2. pire, le décalage casse la clé d'idempotence (user, event_context,
//      scheduled_for) : la passe suivante recalcule l'heure d'origine, ne
//      retrouve plus la ligne, et INSÈRE UN DOUBLON (sonde SQL : 2 rappels
//      déjeuner à 12h00 et 13h00). Corrigé des deux côtés — espacement ici,
//      idempotence par relecture dans provision_day.ts.
// Les bornes ci-dessous garantissent >= 60 min entre deux fenêtres KEEL
// consécutives, digest dominical compris. Un test épingle l'invariant.
//   on_waking   06:00-06:30   (slot 06:30)
//   breakfast   07:30-08:00   (slot 07:30)
//   snack_am    10:00-10:45   (slot 10:30)  NEUF — début du trou
//   lunch       11:50-12:45   (slot 12:30)  NEUF
//   snack_pm    16:00-16:45   (slot 16:30)  NEUF — fin du trou
//   dinner      18:15-19:00   (slot 19:30)
//   before_bed  22:00-22:45   (slot 22:30)
//
// `pre_workout`, `post_workout`, `any_meal` et `any_time` n'ont pas d'heure nominale
// en base : ils n'ont pas de fenêtre, et `slotReminderWindow` retourne `null` —
// une absence NOMMÉE, pas un silence. Un créneau inconnu, lui, throw (R7).
// Digest dominical (W4.6) : dimanche soir, après le rappel du dîner (finit 19:00)
// et bien avant celui du coucher (commence 22:00) — le seul creux qui laisse >= 1 h
// des deux côtés, contrainte imposée par le trigger min-gap (voir plus bas).
// Volontairement PAS 18:30 : c'est l'heure du bilan hebdo hérité, et deux messages
// hebdomadaires à la même minute est la collision qu'on paie ensuite en support.
const SUNDAY_DIGEST_START_LOCAL_TIME = "20:00";
const SUNDAY_DIGEST_END_LOCAL_TIME = "20:30";

export type SlotReminderWindow = {
  startLocalTime: string;
  endLocalTime: string;
};

const SLOT_REMINDER_WINDOWS: Record<string, SlotReminderWindow | null> = {
  on_waking: { startLocalTime: "06:00", endLocalTime: "06:30" },
  breakfast: { startLocalTime: "07:30", endLocalTime: "08:00" },
  snack_am: { startLocalTime: "10:00", endLocalTime: "10:45" },
  pre_workout: null,
  lunch: { startLocalTime: "11:50", endLocalTime: "12:45" },
  post_workout: null,
  snack_pm: { startLocalTime: "16:00", endLocalTime: "16:45" },
  dinner: { startLocalTime: "18:15", endLocalTime: "19:00" },
  before_bed: { startLocalTime: "22:00", endLocalTime: "22:45" },
  any_meal: null,
  any_time: null,
};

/** Les créneaux couverts, exportés pour que les tests épinglent la couverture. */
export const SLOT_REMINDER_WINDOW_KEYS: readonly string[] = Object.freeze(
  Object.keys(SLOT_REMINDER_WINDOWS),
);

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function minutesFromHHMM(value: string): number {
  const match = cleanText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("invalid_hhmm");
  return Math.max(0, Math.min(23, Number(match[1]))) * 60 +
    Math.max(0, Math.min(59, Number(match[2])));
}

function hhmmFromMinutes(value: number): string {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.floor(value)));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function stableHashInt(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableTimeInRange(params: {
  startLocalTime: string;
  endLocalTime: string;
  seed: string;
}): string {
  const start = minutesFromHHMM(params.startLocalTime);
  const end = minutesFromHHMM(params.endLocalTime);
  const span = Math.max(0, end - start);
  return hhmmFromMinutes(start + (stableHashInt(params.seed) % (span + 1)));
}

export function randomMorningEncouragementLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  return stableTimeInRange({
    startLocalTime: MORNING_ENCOURAGEMENT_START_LOCAL_TIME,
    endLocalTime: MORNING_ENCOURAGEMENT_END_LOCAL_TIME,
    seed: `${params.userId}:${params.localDate}:action_morning_encouragement`,
  });
}

export function randomEveningReviewLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  return stableTimeInRange({
    startLocalTime: EVENING_REVIEW_START_LOCAL_TIME,
    endLocalTime: EVENING_REVIEW_END_LOCAL_TIME,
    seed: `${params.userId}:${params.localDate}:daily_review`,
  });
}

export function randomLateAfternoonNudgeLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  return stableTimeInRange({
    startLocalTime: LATE_AFTERNOON_NUDGE_START_LOCAL_TIME,
    endLocalTime: LATE_AFTERNOON_NUDGE_END_LOCAL_TIME,
    seed: `${params.userId}:${params.localDate}:action_late_afternoon`,
  });
}

export function randomNightPrepLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  return stableTimeInRange({
    startLocalTime: NIGHT_PREP_START_LOCAL_TIME,
    endLocalTime: NIGHT_PREP_END_LOCAL_TIME,
    seed: `${params.userId}:${params.localDate}:action_night_prep`,
  });
}

/**
 * Fenêtre de rappel d'un créneau KEEL.
 * `null` = créneau réel mais sans heure nominale (pre_workout, any_time…).
 * Créneau inconnu = throw (R7) : jamais de `undefined` silencieux qui ferait
 * disparaître un rappel sans une seule erreur.
 */
export function slotReminderWindow(slotKey: string): SlotReminderWindow | null {
  const key = String(slotKey ?? "").trim();
  if (!Object.prototype.hasOwnProperty.call(SLOT_REMINDER_WINDOWS, key)) {
    throw new Error(
      `[proactive_checkin_timing] unknown slot_key "${slotKey}" — ` +
        `expected one of: ${SLOT_REMINDER_WINDOW_KEYS.join(", ")}`,
    );
  }
  return SLOT_REMINDER_WINDOWS[key];
}

/**
 * Heure locale (HH:MM) du rappel d'un créneau, stable par (user, jour, créneau) :
 * deux passes du cron le même jour retombent sur la même heure, donc sur la même
 * clé d'idempotence (user_id, event_context, scheduled_for).
 * Throw si le créneau n'a pas de fenêtre — appeler sans vérifier est un bug d'appelant.
 */
export function randomSlotReminderLocalTime(params: {
  userId: string;
  localDate: string;
  slotKey: string;
}): string {
  const window = slotReminderWindow(params.slotKey);
  if (window === null) {
    throw new Error(
      `[proactive_checkin_timing] slot_key "${params.slotKey}" has no nominal ` +
        `local time, so it has no reminder window — check slotReminderWindow() first`,
    );
  }
  return stableTimeInRange({
    startLocalTime: window.startLocalTime,
    endLocalTime: window.endLocalTime,
    seed: `${params.userId}:${params.localDate}:keel_slot_reminder:${params.slotKey}`,
  });
}

export function randomSundayDigestLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  return stableTimeInRange({
    startLocalTime: SUNDAY_DIGEST_START_LOCAL_TIME,
    endLocalTime: SUNDAY_DIGEST_END_LOCAL_TIME,
    seed: `${params.userId}:${params.localDate}:keel_sunday_digest`,
  });
}
