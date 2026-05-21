const MORNING_ENCOURAGEMENT_START_LOCAL_TIME = "08:00";
const MORNING_ENCOURAGEMENT_END_LOCAL_TIME = "10:00";
const EVENING_REVIEW_START_LOCAL_TIME = "19:00";
const EVENING_REVIEW_END_LOCAL_TIME = "21:30";

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
