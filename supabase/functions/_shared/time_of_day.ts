/**
 * Source unique de vérité pour `time_of_day` des actions du plan.
 *
 * Historique: l'enum divergeait entre 3 endroits (validateur zod avec
 * "any_time", prompts de génération avec "anytime" sans "night", validateur
 * runtime next-level sans "night"). Ce module centralise les valeurs
 * canoniques et les prédicats de créneau utilisés par le scheduler de
 * check-ins proactifs.
 *
 * Sémantique des valeurs (QUAND l'action se fait — pas quand on la nudge):
 * - "wake_up":  au réveil (se lever, lumière au lever, réveil sans snooze).
 *               Le nudge utile est la veille au soir (~21h30): au matin même,
 *               c'est déjà trop tard.
 * - "morning":  dans la matinée (après le lever).
 * - "afternoon": l'après-midi.
 * - "evening":  le soir.
 * - "night":    tard le soir / rituel de coucher.
 * - "anytime":  pas de moment particulier (défaut: nudge du matin).
 */

export const TIME_OF_DAY_VALUES = [
  "wake_up",
  "morning",
  "afternoon",
  "evening",
  "night",
  "anytime",
] as const;

export type TimeOfDay = (typeof TIME_OF_DAY_VALUES)[number];

const TIME_OF_DAY_SET: ReadonlySet<string> = new Set(TIME_OF_DAY_VALUES);

/**
 * Alias historiques tolérés en entrée, jamais persistés.
 * NOTE: "all_day" n'est PAS un alias — les prompts de génération
 * l'interdisent explicitement et les validateurs doivent le rejeter pour
 * forcer le LLM à choisir un moment explicite (ou "anytime").
 */
const TIME_OF_DAY_ALIASES: Record<string, TimeOfDay> = {
  any_time: "anytime",
  wakeup: "wake_up",
  "wake-up": "wake_up",
};

/**
 * Normalise une valeur libre vers une valeur canonique, ou null si vide /
 * inconnue. Les valeurs legacy ("any_time") sont mappées, jamais renvoyées.
 */
export function normalizeTimeOfDay(value: unknown): TimeOfDay | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const aliased = TIME_OF_DAY_ALIASES[normalized];
  if (aliased) return aliased;
  return TIME_OF_DAY_SET.has(normalized) ? (normalized as TimeOfDay) : null;
}

function normalizeDayPartText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Action "tardive" (se fait en fin de journée: soir OU nuit). Tolère du texte
 * libre historique (fr/en) car `time_of_day` n'a pas toujours été contraint.
 * N'inclut PAS wake_up: une action au réveil se fait le matin, même si son
 * nudge part la veille au soir.
 */
export function isLateActionTimeOfDay(value: unknown): boolean {
  return /\b(evening|night|soir|soiree|nuit|coucher|sleep|bed)\b/.test(
    normalizeDayPartText(value),
  );
}

/** Action au réveil (nudge de pré-engagement la veille ~21h30). */
export function isWakeUpTimeOfDay(value: unknown): boolean {
  return /\b(wake[_-]?up|reveil)\b/.test(normalizeDayPartText(value));
}

/** Action du soir (nudge en fin d'après-midi). Exclut la nuit. */
export function isEveningActionTimeOfDay(value: unknown): boolean {
  return isLateActionTimeOfDay(value) && !isNightActionTimeOfDay(value);
}

/** Action de nuit / coucher (nudge le soir même ~21h30). */
export function isNightActionTimeOfDay(value: unknown): boolean {
  return /\b(night|nuit|coucher|sleep|bed)\b/.test(
    normalizeDayPartText(value),
  );
}

/**
 * Action éligible au créneau d'encouragement du matin: matin, après-midi,
 * "anytime", null ou texte libre non tardif. Les actions soir/nuit/wake_up
 * ont leur propre créneau (fin d'après-midi ou ~21h30).
 */
export function isMorningSlotTimeOfDay(value: unknown): boolean {
  return !isLateActionTimeOfDay(value) && !isWakeUpTimeOfDay(value);
}
