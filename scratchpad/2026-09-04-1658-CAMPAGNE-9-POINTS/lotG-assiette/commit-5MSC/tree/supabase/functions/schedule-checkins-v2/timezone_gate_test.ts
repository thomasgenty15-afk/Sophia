import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  classifyProvisioningTimezones,
  eligibleProvisioningTimezones,
  isProvisioningWindow,
  localHourInTimezone,
  PROVISIONING_WINDOW_END_HOUR,
  PROVISIONING_WINDOW_START_HOUR,
} from "./timezone_gate.ts";

// KEEL W1.3 bug 3 — regression: the old cron fired once, at 00:05 UTC.
// 2026-07-27T00:05:00Z is 2026-07-26 20:05 in New York: the local day had
// not started, so every morning slot computed for "today" was already past.
const OLD_DAILY_CRON_TICK = new Date("2026-07-27T00:05:00.000Z");

Deno.test("W1.3 bug 3 (regression): a 00:05 UTC tick is 20:05 the day before in New York", () => {
  assertEquals(localHourInTimezone("America/New_York", OLD_DAILY_CRON_TICK), 20);
  assertEquals(
    isProvisioningWindow("America/New_York", OLD_DAILY_CRON_TICK),
    false,
  );
  // Paris was the only region the old cron happened to serve correctly.
  assertEquals(localHourInTimezone("Europe/Paris", OLD_DAILY_CRON_TICK), 2);
});

Deno.test("W1.3 bug 3: New York is provisioned on the hourly tick that opens ITS day", () => {
  // 04:00 UTC on 2026-07-27 = 00:00 local in New York (EDT, UTC-4).
  const nyMidnight = new Date("2026-07-27T04:00:00.000Z");
  assertEquals(localHourInTimezone("America/New_York", nyMidnight), 0);
  assertEquals(isProvisioningWindow("America/New_York", nyMidnight), true);
  // ...and Paris is NOT re-provisioned on that same tick.
  assertEquals(isProvisioningWindow("Europe/Paris", nyMidnight), false);
});

Deno.test("W1.3 bug 3: the window is exactly one hourly tick, [00:00, 01:00)", () => {
  assertEquals(PROVISIONING_WINDOW_START_HOUR, 0);
  assertEquals(PROVISIONING_WINDOW_END_HOUR, 1);
  const zone = "Europe/Paris";
  // 2026-07-27, Paris is UTC+2 (CEST).
  assertEquals(isProvisioningWindow(zone, new Date("2026-07-26T21:59:59Z")), false);
  assertEquals(isProvisioningWindow(zone, new Date("2026-07-26T22:00:00Z")), true);
  assertEquals(isProvisioningWindow(zone, new Date("2026-07-26T22:59:59Z")), true);
  assertEquals(isProvisioningWindow(zone, new Date("2026-07-26T23:00:00Z")), false);
});

Deno.test("W1.3 bug 3: over 24 hourly ticks each timezone opens exactly once", () => {
  const zones = [
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Asia/Kolkata", // half-hour offset
    "Pacific/Chatham", // 12h45 offset
  ];
  const opens = new Map<string, number>(zones.map((zone) => [zone, 0]));
  for (let hour = 0; hour < 24; hour++) {
    const tick = new Date(Date.UTC(2026, 6, 27, hour, 0, 0));
    for (const zone of eligibleProvisioningTimezones(zones, tick)) {
      opens.set(zone, (opens.get(zone) ?? 0) + 1);
    }
  }
  for (const zone of zones) {
    assertEquals(opens.get(zone), 1, `${zone} must open exactly once per day`);
  }
});

Deno.test("W1.3 bug 3: eligibleProvisioningTimezones dedupes and keeps only open zones", () => {
  const nyMidnight = new Date("2026-07-27T04:00:00.000Z");
  const eligible = eligibleProvisioningTimezones(
    [
      "America/New_York",
      "America/New_York",
      " America/New_York ",
      "Europe/Paris",
      "",
    ],
    nyMidnight,
  );
  assertEquals([...eligible], ["America/New_York"]);
});

Deno.test("W1.3 bug 3: an unknown timezone throws instead of defaulting (R7)", () => {
  assertThrows(
    () => localHourInTimezone("Mars/Olympus_Mons", OLD_DAILY_CRON_TICK),
    Error,
    "unknown timezone",
  );
  assertThrows(
    () => localHourInTimezone("   ", OLD_DAILY_CRON_TICK),
    Error,
    "empty timezone",
  );
});

// --- W1.4 R2: blast radius of the gate ---------------------------------------

Deno.test("W1.4 R2: one unusable profile timezone does not take the fleet down", () => {
  // profiles.timezone has no CHECK. Before the fix, eligibleProvisioningTimezones
  // threw BEFORE the user loop, so a single row holding "GMT+1" 500-ed the whole
  // hourly pass and NOBODY got provisioned that hour.
  const nyMidnight = new Date("2026-07-27T04:00:00.000Z");
  const fleet = [
    "America/New_York",
    "GMT+1", // a real-world value users type; Intl rejects it
    "Paris", // not an IANA id
    "Europe/Paris",
    "Mars/Olympus_Mons",
  ];

  const classification = classifyProvisioningTimezones(fleet, nyMidnight);

  // The valid zone whose day just opened is still provisioned...
  assertEquals([...classification.eligible], ["America/New_York"]);
  // ...the unusable ones are named, so their users can be skipped one by one...
  assertEquals(
    [...classification.invalid].sort(),
    ["GMT+1", "Mars/Olympus_Mons", "Paris"],
  );
  // ...and Europe/Paris, valid but outside its window, is neither.
  assertEquals(classification.eligible.has("Europe/Paris"), false);
  assertEquals(classification.invalid.has("Europe/Paris"), false);
});

Deno.test("W1.4 R2: the classification never throws, whatever the fleet holds", () => {
  const now = new Date("2026-07-27T04:00:00.000Z");
  const classification = classifyProvisioningTimezones(
    ["", "   ", "not/a/zone", "\u0000", "America/New_York"],
    now,
  );
  assertEquals(classification.eligible.has("America/New_York"), true);
  // Empty/blank entries are not "invalid timezones" — the caller already
  // defaults them to Europe/Paris before they get here.
  assertEquals(classification.invalid.has(""), false);
});

Deno.test("W1.4 R2: the R7 throw stays on an explicitly passed timezone", () => {
  // The fail-loud contract only moved for FLEET data (untrusted column). A
  // timezone handed to the helper by name is a trusted source: a silent
  // fallback there would re-create the original bug.
  assertThrows(
    () => isProvisioningWindow("GMT+1", new Date("2026-07-27T04:00:00.000Z")),
    Error,
    "unknown timezone",
  );
});

Deno.test("W1.4 R2: eligibleProvisioningTimezones is the eligible view of the classification", () => {
  const now = new Date("2026-07-27T04:00:00.000Z");
  const zones = ["America/New_York", "GMT+1", "Europe/Paris"];
  assertEquals(
    [...eligibleProvisioningTimezones(zones, now)],
    [...classifyProvisioningTimezones(zones, now).eligible],
  );
});
