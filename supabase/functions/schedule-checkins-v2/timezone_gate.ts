/**
 * KEEL W1.3 bug 3 — per-timezone provisioning gate.
 *
 * The scheduler used to run on `5 0 * * *` (00:05 UTC) and provisioned every
 * user in one pass. At 00:05 UTC it is still 20:05 of the PREVIOUS local day
 * in America/New_York: the morning slots computed for "today" were already in
 * the past, so no US user ever received a morning nudge. Every timezone west
 * of UTC-1 was structurally broken.
 *
 * The fix makes the function IDEMPOTENT PER TIMEZONE: the cron becomes hourly
 * (`0 * * * *`) and each run provisions only the timezones whose local wall
 * clock currently sits in [00:00, 01:00). Each timezone therefore gets exactly
 * one provisioning pass per local day, at the start of its own day. The unique
 * index `scheduled_checkins_user_event_time_unique`
 * (user_id, event_context, scheduled_for) absorbs a duplicate pass (DST, cron
 * retry, manual replay) without creating a second nudge.
 *
 * Manual/targeted invocations (a `user_id` in the body, a `full_reset` from
 * `request_morning_active_action_checkins_refresh`) bypass the gate: they are
 * event-driven refreshes, not the daily provisioning pass.
 */

/** Local hour, inclusive, at which a timezone's provisioning window opens. */
export const PROVISIONING_WINDOW_START_HOUR = 0;
/** Local hour, exclusive, at which it closes. One hour = one hourly cron tick. */
export const PROVISIONING_WINDOW_END_HOUR = 1;

/**
 * Local hour (0-23) for `timezone` at `now`.
 *
 * R7 (fail-loud): an unresolvable timezone throws. Returning a default hour
 * would silently provision the wrong users at the wrong local time — exactly
 * the class of silent drop this lot exists to remove. `Intl` already throws a
 * RangeError on an invalid IANA id; this wraps it with the offending value.
 */
export function localHourInTimezone(timezone: string, now: Date): number {
  const zone = String(timezone ?? "").trim();
  if (!zone) {
    throw new Error("schedule-checkins-v2: empty timezone");
  }

  let raw: string | undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    raw = parts.find((part) => part.type === "hour")?.value;
  } catch (error) {
    throw new Error(
      `schedule-checkins-v2: unknown timezone "${zone}"`,
      { cause: error },
    );
  }

  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(
      `schedule-checkins-v2: unresolvable local hour for timezone "${zone}" (got "${raw}")`,
    );
  }
  return hour;
}

/** True when `timezone` is inside its local provisioning window at `now`. */
export function isProvisioningWindow(timezone: string, now: Date): boolean {
  const hour = localHourInTimezone(timezone, now);
  return hour >= PROVISIONING_WINDOW_START_HOUR &&
    hour < PROVISIONING_WINDOW_END_HOUR;
}

export type ProvisioningTimezoneClassification = {
  /** Zones whose local day has just started: this tick owns them. */
  eligible: Set<string>;
  /** Zones `Intl` refuses. Their users are skipped, the fleet is not. */
  invalid: Set<string>;
};

/**
 * W1.4 R2 — blast radius of the timezone gate.
 *
 * `profiles.timezone` is a bare text column with no CHECK, so ONE row holding
 * `"GMT+1"`, `"Paris"` or a typo is enough to make `localHourInTimezone` throw.
 * When that throw happened before the user loop, it took down the whole hourly
 * pass: one corrupted row silenced the nudges of the entire fleet. The throw is
 * right (R7 — a timezone must never silently default), but it must be scoped to
 * the row that carries the bad data.
 *
 * So the fleet's zones are classified ONCE, each parse isolated: an unusable
 * zone lands in `invalid` and its users are skipped, named and counted, while
 * every other timezone is provisioned normally.
 *
 * The fail-loud contract is unchanged for a timezone passed explicitly as an
 * argument (`localHourInTimezone`, `isProvisioningWindow`): that is a trusted
 * source, and a silent fallback there would be the original bug.
 */
export function classifyProvisioningTimezones(
  timezones: Iterable<string>,
  now: Date,
): ProvisioningTimezoneClassification {
  const eligible = new Set<string>();
  const invalid = new Set<string>();
  const seen = new Set<string>();
  for (const raw of timezones) {
    const zone = String(raw ?? "").trim();
    if (!zone || seen.has(zone)) continue;
    seen.add(zone);
    try {
      if (isProvisioningWindow(zone, now)) eligible.add(zone);
    } catch (error) {
      invalid.add(zone);
      console.warn(
        "[schedule-checkins-v2] invalid_profile_timezone",
        { timezone: zone, error: String(error) },
      );
    }
  }
  return { eligible, invalid };
}

/**
 * Distinct timezones, among those observed on the active profiles, whose local
 * day has just started. Computed ONCE before the user loop: `Intl` formatting
 * is the expensive part and a fleet shares a handful of timezones.
 *
 * Thin view over `classifyProvisioningTimezones` — callers that must also
 * account for the invalid zones (the scheduler does: it counts the users it
 * skipped) use the classification directly.
 */
export function eligibleProvisioningTimezones(
  timezones: Iterable<string>,
  now: Date,
): Set<string> {
  return classifyProvisioningTimezones(timezones, now).eligible;
}
