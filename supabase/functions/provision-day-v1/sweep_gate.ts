/**
 * KEEL W4.2 — the end-of-day half of the per-timezone gate.
 *
 * The opening half is NOT re-implemented here: `classifyProvisioningTimezones`
 * and `PROVISIONING_WINDOW_*` are imported verbatim from the W1.3 fix
 * (schedule-whatsapp-v2-checkins/timezone_gate.ts) and re-exported, so the two
 * hourly passes of this repo can never drift onto two different definitions of
 * "the local day just started".
 *
 * What IS local to this file is the CLOSING window: the sweep fires at local
 * hour 23, not local hour 0, so it needs its own predicate. It is built on the
 * imported `localHourInTimezone` — the parse primitive, and its R7 throw, are
 * shared; only the hour bounds differ.
 *
 * Same blast-radius discipline as W1.4 R2: `profiles.timezone` /
 * `plan_versions.timezone` are bare text columns, so ONE row holding "GMT+1"
 * must skip THAT row, named and counted, not silence the whole fleet.
 */

import {
  classifyProvisioningTimezones,
  localHourInTimezone,
  PROVISIONING_WINDOW_END_HOUR,
  PROVISIONING_WINDOW_START_HOUR,
  type ProvisioningTimezoneClassification,
} from "../schedule-whatsapp-v2-checkins/timezone_gate.ts";

import {
  SWEEP_WINDOW_END_HOUR,
  SWEEP_WINDOW_START_HOUR,
} from "./provisioning.ts";

export {
  classifyProvisioningTimezones,
  localHourInTimezone,
  PROVISIONING_WINDOW_END_HOUR,
  PROVISIONING_WINDOW_START_HOUR,
  SWEEP_WINDOW_END_HOUR,
  SWEEP_WINDOW_START_HOUR,
};
export type { ProvisioningTimezoneClassification };

/** True when `timezone`'s local day is about to close at `now`. */
export function isSweepWindow(timezone: string, now: Date): boolean {
  const hour = localHourInTimezone(timezone, now);
  return hour >= SWEEP_WINDOW_START_HOUR && hour < SWEEP_WINDOW_END_HOUR;
}

/**
 * Classify a fleet's timezones for the sweep pass. Mirrors
 * `classifyProvisioningTimezones` (one parse per distinct zone, failures
 * isolated to the zone that carries the bad data).
 */
export function classifySweepTimezones(
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
      if (isSweepWindow(zone, now)) eligible.add(zone);
    } catch (error) {
      invalid.add(zone);
      console.warn("[provision-day-v1] invalid_plan_version_timezone", {
        timezone: zone,
        mode: "sweep",
        error: String(error),
      });
    }
  }
  return { eligible, invalid };
}

/** The classifier of a given mode. One seam, two windows. */
export function classifyTimezonesForMode(
  mode: "provision" | "sweep",
  timezones: Iterable<string>,
  now: Date,
): ProvisioningTimezoneClassification {
  return mode === "sweep"
    ? classifySweepTimezones(timezones, now)
    : classifyProvisioningTimezones(timezones, now);
}
