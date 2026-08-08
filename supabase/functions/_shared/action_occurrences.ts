import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

export const ACTION_MORNING_EVENT_CONTEXT = "action_morning_encouragement_v2";
export const MORNING_LIGHT_GREETING_EVENT_CONTEXT = "morning_light_greeting_v2";
export const ACTION_EVENING_REVIEW_EVENT_CONTEXT = "action_evening_review_v2";
export const ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT =
  "action_morning_followup_v2";
// Nudge fin d'après-midi des actions du soir (time_of_day=evening).
export const ACTION_LATE_AFTERNOON_EVENT_CONTEXT =
  "action_late_afternoon_encouragement_v1";
// Nudge ~21h35 des actions de nuit (night, ce soir) et pré-engagement des
// actions au réveil (wake_up, demain matin).
export const ACTION_NIGHT_PREP_EVENT_CONTEXT = "action_night_prep_v1";

export const ACTION_EVENING_DONE_ID = "ACTION_DONE";
export const ACTION_EVENING_PARTIAL_ID = "ACTION_PARTIAL";
export const ACTION_EVENING_MISSED_ID = "ACTION_MISSED";

export const ACTION_EVENING_REVIEW_BUTTONS = [
  { id: ACTION_EVENING_DONE_ID, title: "Fait" },
  { id: ACTION_EVENING_MISSED_ID, title: "Pas fait" },
] as const;

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

const ACTION_ITEM_STATUSES = new Set(["active", "in_maintenance", "stalled"]);
const OPEN_OCCURRENCE_STATUSES = new Set(["planned", "rescheduled"]);
const CONFIRMED_WEEK_STATUSES = new Set(["confirmed", "auto_applied"]);

type ActiveCycleRow = {
  id: string;
  active_transformation_id?: string | null;
};

type TransformationRow = {
  id: string;
  title?: string | null;
  priority_order?: number | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

type PlanRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  title?: string | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

type PlanItemRow = {
  id: string;
  plan_id: string;
  transformation_id: string;
  title: string;
  dimension: string;
  kind: string;
  status: string;
  time_of_day?: string | null;
};

type OccurrenceRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  ordinal: number;
  planned_day: string;
  status: string;
  source: string;
  validated_at?: string | null;
};


function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localDateYmdInTimezone(
  timezoneRaw: unknown,
  now = new Date(),
): string {
  const timezone = cleanText(timezoneRaw, "Europe/Paris");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    String(parts.find((part) => part.type === type)?.value ?? "").padStart(
      2,
      "0",
    );
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function weekdayKeyForLocalDate(localDate: string): DayCode {
  const day = parseDateYmd(localDate).getUTCDay();
  if (day === 0) return "sun";
  return DAY_CODES[day - 1] ?? "mon";
}

export function mondayWeekStartForLocalDate(localDate: string): string {
  const date = parseDateYmd(localDate);
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return formatYmd(date);
}

function localDateParity(localDate: string): number {
  const dayIndex = Math.floor(parseDateYmd(localDate).getTime() / 86_400_000);
  return Math.abs(dayIndex) % 2;
}

// RETRAIT RÉSIDUS (2026-08-08): `loadTodayActionOccurrences` et les
// builders des nudges d'action sont partis avec le plan V2. Restent la
// salutation légère du matin, les constantes d'event context (annulation à
// vue des lignes legacy) et les utilitaires de date, encore importés par
// les crons et modules vivants.


export async function shouldScheduleLightMorningGreeting(
  supabase: SupabaseClient,
  params: {
    userId: string;
    timezone: string;
    localDate: string;
    now?: Date;
  },
): Promise<boolean> {
  if (localDateParity(params.localDate) !== 0) return false;

  const now = params.now ?? new Date();
  const startIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now,
  });
  const endIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now,
  });

  const { data, error } = await supabase
    .from("scheduled_checkins")
    .select("id")
    .eq("user_id", params.userId)
    .eq("event_context", MORNING_LIGHT_GREETING_EVENT_CONTEXT)
    .gte("scheduled_for", startIso)
    .lt("scheduled_for", endIso)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length === 0;
}





const NO_WEAKENED_ACTION_RULE =
  "N'affaiblis jamais l'action: pas de version reduite, allegee, minimale, 'plus petit pas' ou '30 secondes'. L'action est deja calibree pour le user, encourage-la telle quelle. Une version minimale ne se propose que plus tard, en conversation, et seulement si le user exprime une resistance a l'action (trop dur, pas l'energie, deja rate); jamais de facon generique dans ce message proactif.";






export function buildLightMorningFallbackMessage(): string {
  return "Je te souhaite une bonne journée. Garde juste un petit point d'appui simple, et on avance.";
}

export function buildLightMorningInstruction(): string {
  return [
    "Message WhatsApp du matin, sans action prévue aujourd'hui.",
    "Objectif: souhaiter simplement une bonne journée. Message court, naturel, sobre.",
    "Ce message n'est pas un flow conversationnel.",
    "Ne reprends jamais une question d'onboarding, une preference coach, une question restee sans reponse, ou un choix A/B vu dans l'historique.",
    "N'essaie pas de completer une information manquante.",
    "N'ouvre pas de nouveau sujet produit.",
    "Utilise l'historique recent uniquement comme contexte d'ambiance generale: journee chargee, energie basse, bonne dynamique, besoin de simple.",
    "Ne relance jamais le sujet exact de l'historique recent.",
    "Si l'historique contient une question Sophia non repondue, ignore-la.",
    "Si l'historique contient un succes recent du user, tu peux le reconnaitre sobrement, sans demander de bilan.",
    "Ne propose pas de nouvelle action. Ne demande pas un bilan.",
    "Surface: presence legere, pas nudge d'action, pas follow-up, pas bilan.",
    "",
    "Ton et registre (strict):",
    "- Par defaut: sobre et direct. Chaleureux ne veut pas dire tendre.",
    "- Interdit sans signal recent qui le justifie: 'je pense a toi', 'prends soin de toi', 'je suis la si', 'douceur', 'douce', 'en douceur', ou toute formule de soutien emotionnel.",
    "- Le registre soutien/reconfort est reserve au cas ou l'historique recent contient un signal explicite (fatigue exprimee, coup dur, moment difficile). Sans ce signal, ne l'utilise pas.",
    "- N'invente pas un etat emotionnel du user: si tu ne sais rien, n'affirme rien.",
    "- Tu peux assumer le cadre reel: dire simplement qu'il n'y a rien de prevu aujourd'hui et que c'est juste un message pour souhaiter une bonne journee.",
    "Message attendu: 1 a 2 phrases courtes, zero ou une question tres legere maximum.",
    "Preference: pas de question du tout.",
    "",
    "Exemples attendus:",
    '- Aucun contexte utile: "Bonne journee ! Rien de prevu au programme aujourd\'hui, je passais juste te la souhaiter."',
    '- Aucun contexte utile (variante): "Je te souhaite une bonne journee. Pas d\'action prevue aujourd\'hui, profite."',
    "- Bonne dynamique recente: \"Bonne journee ! Garde l'elan d'hier, sans chercher a tout porter d'un coup.\"",
    '- Fatigue exprimee recemment: "Je te souhaite une journee plus respirable. Aujourd\'hui, vise simple et concret."',
    "",
    "Exemples interdits:",
    '- "Que ta journee soit douce... je pense a toi." (tendresse non justifiee par le contexte)',
    '- "Prends soin de toi, je suis la si tu as besoin." (soutien emotionnel sans signal)',
    '- "Tu preferes que je te challenge leger, equilibre ou direct ?"',
    '- "Tu veux qu\'on parte sur A ou B ?"',
  ].join("\n");
}
