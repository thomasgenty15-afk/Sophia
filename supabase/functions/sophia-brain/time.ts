/**
 * Approximate "Paris local time" by shifting UTC by +1 hour.
 * Note: ignores DST (+2). This matches the existing behavior in router/investigator.
 */
export function approxParisTimeUtcPlusOne(now: Date = new Date()): Date {
  return new Date(now.getTime() + 1 * 60 * 60 * 1000);
}

/**
 * Paris hour (approx, UTC+1) expressed as an integer hour [0..23].
 */
export function approxParisHourUtcPlusOne(now: Date = new Date()): number {
  return approxParisTimeUtcPlusOne(now).getUTCHours();
}

/**
 * Build the exact time context string used in agent prompts.
 */
export function buildParisTimeContextUtcPlusOne(now: Date = new Date()): string {
  const parisTime = approxParisTimeUtcPlusOne(now);
  return `NOUS SOMMES LE ${parisTime.toLocaleDateString("fr-FR")} À ${parisTime.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}.`;
}




