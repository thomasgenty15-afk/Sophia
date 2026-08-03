import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  isObservedSafetyBand,
  logRuntimeGuardEvent,
  logSafetyBandEvent,
  safetyBandSeverity,
} from "./guard-log.ts";

Deno.test("P11: logRuntimeGuardEvent est no-op/fail-open sans SUPABASE_URL (jamais un throw, jamais une op pendante)", () => {
  const saved = Deno.env.get("SUPABASE_URL");
  try {
    Deno.env.delete("SUPABASE_URL");
    // Ne doit ni throw ni laisser une promesse pendante (sanitizer Deno).
    logRuntimeGuardEvent({ guard: "test_guard", userId: "u1" });
    logRuntimeGuardEvent({
      guard: "test_guard_2",
      severity: "info",
      detail: { a: 1 },
    });
    assertEquals(true, true);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_URL", saved);
  }
});

Deno.test("P11: logSafetyBandEvent ignore none/low et est no-op sans env", () => {
  const saved = Deno.env.get("SUPABASE_URL");
  try {
    Deno.env.delete("SUPABASE_URL");
    logSafetyBandEvent({ riskBand: "none" });
    logSafetyBandEvent({ riskBand: "low" });
    logSafetyBandEvent({
      riskBand: "medium",
      reasonCodes: ["hopelessness"],
      userId: "u1",
      turnId: "t1",
    });
    logSafetyBandEvent({ riskBand: "high", userId: "u1" });
    logSafetyBandEvent({ riskBand: "critical", userId: "u1" });
    assertEquals(true, true);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_URL", saved);
  }
});

// KEEL W1.3 bug 1: `critical` must reach the admin production log. It used to
// be filtered out by an allowlist that stopped at `high` — the single most
// severe safety band was the only one nobody could see.
Deno.test("W1.3 bug 1: critical est observe (et remonte en error)", () => {
  assertEquals(isObservedSafetyBand("critical"), true);
  assertEquals(isObservedSafetyBand("CRITICAL"), true);
  assertEquals(isObservedSafetyBand(" critical "), true);
  assertEquals(safetyBandSeverity("critical"), "error");
});

Deno.test("W1.3 bug 1: medium/high inchanges, none/low/inconnu ignores", () => {
  assertEquals(isObservedSafetyBand("medium"), true);
  assertEquals(safetyBandSeverity("medium"), "warn");
  assertEquals(isObservedSafetyBand("high"), true);
  assertEquals(safetyBandSeverity("high"), "error");

  assertEquals(isObservedSafetyBand("none"), false);
  assertEquals(isObservedSafetyBand("low"), false);
  assertEquals(isObservedSafetyBand(""), false);
  assertEquals(isObservedSafetyBand(null), false);
  assertEquals(isObservedSafetyBand("banana"), false);
});
